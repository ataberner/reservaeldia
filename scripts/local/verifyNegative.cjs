const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { ROOT, checkRequirements, createSession, assertPortsFree } = require("./session.cjs");
const { Processes } = require("./processes.cjs");
const { EMULATORS } = require("../../shared/firebaseEnvironment.cjs");

// Opt-in demonstration; never mutates ROOT sources. The normal gate does not
// intentionally break lint/acceptance; this harness uses their existing runners.
async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== "--contracts-only")) throw new Error("Uso: verifyNegative.cjs [--contracts-only]");
  const requirements = checkRequirements(), owner = new Processes();
  const original = fs.readFileSync(path.join(ROOT, "firestore.rules"));
  const copy = createSession(requirements);
  const local = path.join(copy.workspace, ".local-isolation");
  fs.mkdirSync(local, { recursive: true });
  fs.symlinkSync(path.join(ROOT, ".local-isolation/tool-cache"), path.join(local, "tool-cache"), process.platform === "win32" ? "junction" : "dir");
  const resultFile = path.join(copy.session, "negative-controls.json"), results = [];
  const save = () => fs.writeFileSync(resultFile, JSON.stringify({ sourceSha256: createHash("sha256").update(original).digest("hex"), results }, null, 2));
  async function execute(name, env, interrupt = false) {
    const reports = path.join(local, "reports");
    const before = fs.existsSync(reports) ? fs.readdirSync(reports) : [];
    let error;
    const interruptionDriver = `const fs=require('fs'),path=require('path');
      process.argv=[process.execPath,'scripts/local/runLocal.cjs','verify'];
      const before=${JSON.stringify(before)};
      const poll=setInterval(()=>{const base='.local-isolation/reports';if(!fs.existsSync(base))return;
        for(const dir of fs.readdirSync(base).filter(d=>!before.includes(d))) {
          let report;try{report=JSON.parse(fs.readFileSync(path.join(base,dir,'result.json')))}catch{continue}
          if(report.stages.some(s=>s.name==='compile'&&s.status==='running')){clearInterval(poll);process.emit('SIGINT');return;}
        }},25);poll.unref();require('./scripts/local/runLocal.cjs').entry();`;
    const args = interrupt ? ["-e", interruptionDriver] : ["scripts/local/runLocal.cjs", "verify"];
    try { await owner.run(args, { cwd: copy.workspace, env,
      log: path.join(copy.session, `${name}.log`), name, timeoutMs: 25 * 60000 }); }
    catch (e) { error = e; }
    await owner.stop();
    assert.ok(error, "Negative control must return failure");
    const added = fs.readdirSync(reports).filter(name => !before.includes(name));
    assert.equal(added.length, 1);
    const directory = path.join(reports, added[0]);
    const report = JSON.parse(fs.readFileSync(path.join(directory, "result.json")));
    assert.equal(error.exitCode, report.exitCode, "Actual process exit must agree with report");
    // A dependent action uses exactly the canonical exit code as a CI-like gate.
    const dependent = path.join(copy.session, `${name}-dependent-stage.txt`);
    if (error.exitCode === 0) fs.writeFileSync(dependent, "synthetic dependent stage reached");
    assert.equal(fs.existsSync(dependent), false);
    await assertPortsFree([...Object.values(EMULATORS), 14400, 14500, 19150, 3100]);
    results.push({ name, exitCode: report.exitCode, dependentReached: false, portsFree: true, report: directory }); save();
    return { report, directory };
  }
  let error;
  try {
    const { artifacts, targetKind } = require("../../functions/scripts/syncTemplateContract.cjs");
    const mapped = artifacts.flatMap(a => a.targetPaths).find(file => targetKind(file) === "input");
    const target = path.join(copy.workspace, path.relative(ROOT, mapped));
    const originalCopy = fs.readFileSync(target);
    try {
      fs.appendFileSync(target, "\n// FASE 5C: disposable divergent copy\n");
      const altered = fs.readFileSync(target);
      const stale = await execute("stale-contract-copy", copy.env);
      assert.equal(stale.report.exitCode, 1);
      const stage = stale.report.stages.find(s => s.name === "contracts-input");
      assert.equal(stage.status, "failed"); assert.equal(stage.exitCode, 1);
      const check = JSON.parse(fs.readFileSync(path.join(stale.directory, "contracts-input.log")));
      assert.ok(check.copies.some(c => c.status === "different" && c.target === path.relative(ROOT, mapped).split(path.sep).join("/")));
      assert.deepEqual(fs.readFileSync(target), altered, "Read-only gate cannot repair the negative probe");
      for (const name of ["lint", "tooling", "contracts-tests", "sync", "compile", "contracts-built", "emulators"])
        assert.equal(stale.report.stages.find(s => s.name === name).status, "not-executed");
      assert.equal(stale.report.cleanup.status, "passed");
      Object.assign(results.at(-1), { alteredCopyPreserved: true, stage: "contracts-input" }); save();
    } finally { fs.writeFileSync(target, originalCopy); }
    if (args[0] === "--contracts-only") return;
    const lintProbe = path.join(copy.workspace, "functions/src/phase5bLintProbe.ts");
    assert.equal(fs.existsSync(lintProbe), false);
    fs.writeFileSync(lintProbe, "export const phase5bLintProbe = 1;\ndebugger;\n");
    try {
      const functions = path.join(copy.workspace, "functions");
      await owner.run(["scripts/syncTemplateContract.cjs"], { cwd: functions, env: copy.env,
        log: path.join(copy.session, "lint-probe-sync.log"), name: "lint-probe-sync", timeoutMs: 180000 });
      await owner.run(["node_modules/typescript/bin/tsc", "--noEmit"], { cwd: functions, env: copy.env,
        log: path.join(copy.session, "lint-probe-typecheck.log"), name: "lint-probe-typecheck", timeoutMs: 180000 });
      const lint = await execute("lint-new-typescript-error", copy.env);
      assert.equal(lint.report.exitCode, 1);
      const stage = lint.report.stages.find(s => s.name === "lint");
      assert.equal(stage.status, "failed"); assert.equal(stage.exitCode, 1);
      const report = JSON.parse(fs.readFileSync(path.join(lint.directory, "lint-evidence.json")));
      const source = report.files.find(f => f.file === "functions/src/phase5bLintProbe.ts");
      assert.ok(source?.messages.some(m => m.ruleId === "no-debugger" && m.severity === 2));
      for (const name of ["tooling", "configuration", "sync", "compile", "emulators", "rules-countdown", "integration"])
        assert.equal(lint.report.stages.find(s => s.name === name).status, "not-executed");
      assert.equal(lint.report.cleanup.status, "passed");
      Object.assign(results.at(-1), { typecheckExitCode: 0, source: "functions/src/phase5bLintProbe.ts", rule: "no-debugger" }); save();
    } finally { fs.unlinkSync(lintProbe); }
    const needle = "match /usuarios/{uid} {\n      allow read: if isOwner(uid);";
    const normalized = original.toString().replace(/\r\n/g, "\n");
    assert.ok(normalized.includes(needle), "Mutation target must match reviewed ownership rule");
    fs.writeFileSync(path.join(copy.workspace, "firestore.rules"), normalized.replace(needle, "match /usuarios/{uid} {\n      allow read: if request.auth != null;"));
    const regression = await execute("cross-owner-regression", copy.env);
    assert.equal(regression.report.exitCode, 1);
    const rules = JSON.parse(fs.readFileSync(path.join(regression.directory, "rules-evidence.json")));
    const crossed = rules.results.find(row => row.id === "profile-cross-get");
    assert.equal(crossed.group, "acceptance"); assert.equal(crossed.observed, "allow"); assert.equal(crossed.matchesExpected, false);
    assert.equal(regression.report.stages.find(stage => stage.name === "integration").status, "not-executed");
    assert.equal(regression.report.cleanup.status, "passed");
    fs.writeFileSync(path.join(copy.workspace, "firestore.rules"), original);
    const interrupted = await execute("interrupted-compilation", copy.env, true);
    assert.equal(interrupted.report.exitCode, 130);
    assert.equal(interrupted.report.cleanup.status, "passed");
    assert.equal(interrupted.report.stages.find(stage => stage.name === "emulators").status, "not-executed");
    const invalid = await execute("invalid-destination", { ...copy.env, GCLOUD_PROJECT: "demo-wrong-target" });
    assert.equal(invalid.report.exitCode, 2);
    assert.equal(invalid.report.stages.find(stage => stage.name === "copy").status, "not-executed");
    // Unlink ONLY this copy's dependency junction; never remove its target.
    const link = path.join(copy.workspace, "scripts/local/tools/node_modules");
    assert.equal(fs.lstatSync(link).isSymbolicLink(), true); fs.unlinkSync(link);
    const missing = await execute("missing-cli", copy.env);
    assert.equal(missing.report.exitCode, 2);
    assert.equal(missing.report.stages.find(stage => stage.name === "copy").status, "not-executed");
  } catch (e) { error = e; }
  finally {
    await owner.stop();
    assert.deepEqual(fs.readFileSync(path.join(ROOT, "firestore.rules")), original, "Main Rules must stay byte-identical");
    const marker = path.join(copy.session, "session.json");
    fs.writeFileSync(marker, JSON.stringify({ ...JSON.parse(fs.readFileSync(marker)), stopped: true }, null, 2));
    save();
  }
  if (error) throw error;
  console.log(`Controles negativos comprobados: ${resultFile}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
