import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Processes } = require("./processes.cjs");
const { Evidence, assertRulesEvidence, assertTap, assertLintEvidence } = require("./evidence.cjs");
const { ROOT, cleanEnvironment, createSocketEnvironment } = require("./session.cjs");
const { readWorkflows, checkWorkflows } = require("./ciChecks.cjs");
const { welcomeProcessorEntries, matchesWelcomeDelivery } = require("./welcomeProcessorEvidence.cjs");

test("CI syntax, minimal permissions and Hosting dependency graph", () => {
  const workflows = readWorkflows(ROOT);
  assert.equal(checkWorkflows(workflows).edges.length, 2);
  for (const mutate of [w => delete w["firebase-hosting-merge.yml"].jobs.build_and_deploy.needs,
    w => { w["firebase-hosting-pull-request.yml"].jobs.verification.secrets = "inherit"; },
    w => { w["local-verification.yml"].jobs.verify.steps[4].if = "false"; },
    w => { w["firebase-hosting-merge.yml"].jobs.verification.needs = "build_and_deploy"; }]) {
    const copy = structuredClone(workflows); mutate(copy); assert.throws(() => checkWorkflows(copy));
  }
});

test("CI requires missing-evidence errors after success without masking earlier failures", () => {
  const workflows = readWorkflows(ROOT);
  assert.doesNotThrow(() => checkWorkflows(workflows));
  for (const policy of ["warn", "ignore", "error", "${{ job.status == 'success' && 'warn' || 'error' }}"]) {
    const copy = structuredClone(workflows);
    const artifacts = copy["local-verification.yml"].jobs.verify.steps.find(s => s.uses?.startsWith("actions/upload-artifact@"));
    artifacts.with["if-no-files-found"] = policy;
    assert.throws(() => checkWorkflows(copy), { code: "ERR_ASSERTION" }, policy);
  }
});

test("failed mandatory stage propagates and leaves dependent stage unexecuted", async () => {
  const evidence = new Evidence(ROOT, "synthetic-tooling-test", ["acceptance", "dependent"]);
  let reached = false;
  try {
    await evidence.stage("acceptance", async () => { throw Object.assign(new Error("synthetic acceptance failure"), { kind: "tests" }); });
    await evidence.stage("dependent", async () => { reached = true; });
  } catch (error) { assert.equal(evidence.finish(error), 1); }
  assert.equal(reached, false);
  assert.equal(evidence.data.stages[1].status, "not-executed");
});

test("missing or incomplete Rules evidence cannot produce success; proposal differences are separate", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, ".local-isolation/rules-report-test-"));
  assert.throws(() => assertRulesEvidence(dir), /Falta evidencia/);
  const report = { planned: 12, executed: 12, infrastructure: [], summary: {
    acceptance: { differs: 0 }, characterization: { differs: 0 }, proposal: { differs: 10 } } };
  const write = () => fs.writeFileSync(path.join(dir, "rules-evidence.json"), JSON.stringify(report));
  write(); assertRulesEvidence(dir);
  report.executed = 0; write(); assert.throws(() => assertRulesEvidence(dir), /incompletas/);
  report.executed = 12; report.summary.acceptance.differs = 1; write();
  assert.throws(() => assertRulesEvidence(dir), e => e.kind === "tests");
});

test("timeout closes only owned processes and preserves child output", { timeout: 20000 }, async () => {
  const dir = fs.mkdtempSync(path.join(ROOT, ".local-isolation/process-test-"));
  const env = { ...cleanEnvironment(dir), NODE_OPTIONS: "" };
  const owner = new Processes(), foreign = new Processes();
  const sentinel = foreign.start(["-e", "setInterval(()=>{},1000)"], { cwd: ROOT, env, name: "foreign-sentinel" });
  const log = path.join(dir, "timeout.log");
  try {
    await assert.rejects(owner.run(["-e", "console.log('synthetic-before-timeout');setInterval(()=>{},1000)"],
      { cwd: ROOT, env, log, name: "timeout", timeoutMs: 2000 }), e => e.kind === "infrastructure");
    const stopped = await owner.stop();
    assert.equal(stopped.length, 1); assert.equal(stopped[0].closed, true);
    assert.equal(sentinel.done, undefined);
    assert.match(fs.readFileSync(log, "utf8"), /synthetic-before-timeout/);
  } finally { await owner.stop(); await foreign.stop(); }
});

test("zero tests, skips and cancellations fail closed", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, ".local-isolation/tap-test-"));
  const log = path.join(dir, "test.log");
  for (const text of ["", "# tests 0\n", "# tests 1\n# skipped 1\n", "# tests 1\n# cancelled 1\n"]) {
    fs.writeFileSync(log, text); assert.throws(() => assertTap(log), e => e.kind === "infrastructure");
  }
  fs.writeFileSync(log, "# tests 1\n# pass 1\n# fail 0\n# skipped 0\n# cancelled 0\n");
  assert.equal(assertTap(log).passed, 1);
});

test("lint evidence must contain analyzed sources and agree with the process exit", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, ".local-isolation/lint-report-test-"));
  assert.throws(() => assertLintEvidence(dir, 0), /Falta evidencia/);
  for (const report of [{ files: [], errors: 0, exitCode: 0 }, { files: [{}], errors: 1, exitCode: 0 }, { files: [{}], errors: 0, exitCode: 1 }]) {
    fs.writeFileSync(path.join(dir, "lint-evidence.json"), JSON.stringify(report));
    assert.throws(() => assertLintEvidence(dir, 0), /incompleto|inconsistente/);
  }
});

test("nested CI paths keep emulator/browser sockets distinct and clean only their owned temp", async () => {
  const env = cleanEnvironment(path.join(ROOT, ".local-isolation", "prepared-synthetic", "workspace", ".local-isolation", "session-synthetic"));
  const original = { ...env };
  const first = createSocketEnvironment(env), second = createSocketEnvironment(env);
  const servers = [];
  try {
    assert.deepEqual(env, original);
    if (process.platform === "win32") {
      assert.strictEqual(first.env, env);
      return;
    }
    assert.notEqual(first.env.TMPDIR, second.env.TMPDIR);
    assert.equal(fs.statSync(first.env.TMPDIR).mode & 0o777, 0o700);
    assert.ok(Buffer.byteLength(path.join(second.env.TMPDIR, ".org.chromium.Chromium.XXXXXX", "SingletonSocket")) < 104);
    assert.deepEqual(first.env, { ...env, TEMP: first.env.TMPDIR, TMP: first.env.TMPDIR, TMPDIR: first.env.TMPDIR });
    for (const id of ["561534061ac4158f", "cf01ef9803a6f5c1"]) {
      const socket = path.join(first.env.TMPDIR, `fire_emu_${id}.sock`);
      assert.ok(Buffer.byteLength(socket) < 104, "worker name must fit a Unix socket path");
      const server = net.createServer();
      servers.push(server);
      await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socket, resolve); });
    }
  } finally {
    await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    first.cleanup();
    if (process.platform !== "win32") {
      assert.equal(fs.existsSync(first.env.TMPDIR), false);
      assert.equal(fs.existsSync(second.env.TMPDIR), true);
    }
    second.cleanup();
    first.cleanup(); // Repeated stop remains safe.
  }
});

test("welcome evidence requires the processor record correlated with its persisted delivery", () => {
  const delivery = { sourceEventId: "synthetic-auth-event", correlationId: "welcome-synthetic" };
  const entry = { ...delivery, message: "welcome_registration", template: "welcome", userId: "synthetic-user",
    mode: "disabled", state: "skipped", errorCode: "EMAIL_DISABLED", attempts: 0, messageId: null };
  const line = value => `>  ${JSON.stringify(value)}\n`;
  assert.deepEqual(welcomeProcessorEntries(`Auth emitted welcome_registration\n${line({ ...entry, message: "auth.user.create" })}${line({ ...entry, userId: "other-user" })}> {incomplete\n`, entry.userId), []);
  const records = welcomeProcessorEntries(`\u001b[90m> \u001b[39m ${JSON.stringify(entry)}\r\n`, entry.userId);
  assert.equal(records.length, 1);
  assert.equal(matchesWelcomeDelivery(records[0], delivery), true);
  for (const change of [{ sourceEventId: "other-event" }, { correlationId: "welcome-other" },
    { state: "already_exists" }, { attempts: 1 }, { mode: "production" }, { errorCode: null }, { messageId: "sent" }])
    assert.equal(matchesWelcomeDelivery({ ...entry, ...change }, delivery), false);
  assert.equal(matchesWelcomeDelivery({}, {}), false);
  // A repeated trigger is observable even though it cannot rewrite the ledger.
  assert.equal(welcomeProcessorEntries(line(entry) + line({ ...entry, state: "already_exists" }), entry.userId).length, 2);
});
