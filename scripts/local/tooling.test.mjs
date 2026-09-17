import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Processes } = require("./processes.cjs");
const { Evidence, assertRulesEvidence, assertTap, assertLintEvidence } = require("./evidence.cjs");
const { ROOT, cleanEnvironment } = require("./session.cjs");
const { readWorkflows, checkWorkflows } = require("./ciChecks.cjs");

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
