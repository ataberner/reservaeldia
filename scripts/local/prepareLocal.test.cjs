const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { spawnSync } = require("node:child_process");
const { parsePreparationArguments } = require("./prepareLocal.cjs");
const { failure } = require("./processes.cjs");
const { removeWithoutFollowingLinks } = require("./sessionCleanup.cjs");

test("preparation requires one explicit temporary verification or retained workspace mode", () => {
  assert.deepEqual(parsePreparationArguments(["--verify"]), { verify: true, keepWorkspace: false });
  assert.deepEqual(parsePreparationArguments(["--keep-workspace"]), { verify: false, keepWorkspace: true });
  for (const args of [[], ["--unknown"], ["--verify", "--keep-workspace"], ["--keep-workspace", "--keep-workspace"], ["--verify", "elsewhere"]]) {
    assert.throws(() => parsePreparationArguments(args), error => error.kind === "prerequisite" && /opción explícita/.test(error.message));
  }
});

test("bare preparation fails with usage before runtime, installs or environment creation", () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, "prepareLocal.cjs")], {
    cwd: path.resolve(__dirname, "../.."), encoding: "utf8", windowsHide: true,
    env: { ...process.env, NODE_OPTIONS: "" }, timeout: 10000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /npm run verify:local:prepared/);
  assert.match(result.stderr, /npm run local:prepare -- --keep-workspace/);
  assert.doesNotMatch(result.stderr, /Usar Node|Falta npm/);
  assert.equal(result.stdout, "");
});

for (const mode of ["--verify", "--keep-workspace"]) {
  test(`failed source copy cleans only its new preparation and preserves evidence (${mode})`, async t => {
    const partialCopy = mode === "--verify";
    const copyFailure = partialCopy ? "Synthetic partial source-copy failure" : "Synthetic failure before workspace creation";
    const base = path.resolve(__dirname, "../../.local-isolation");
    fs.mkdirSync(base, { recursive: true });
    const root = fs.mkdtempSync(path.join(base, "prepare-test-"));
    t.after(() => {
      assert.equal(path.dirname(root), base);
      removeWithoutFollowingLinks(root);
    });
    fs.writeFileSync(path.join(root, "source.cjs"), "synthetic source");
    const local = path.join(root, ".local-isolation");
    const historical = path.join(local, "prepared-historical/workspace");
    fs.mkdirSync(historical, { recursive: true });
    fs.writeFileSync(path.join(historical, "sentinel"), "preserve historical fixture");

    const launcherProcess = Object.assign(new EventEmitter(), {
      argv: [process.execPath, "prepareLocal.cjs", mode], pid: process.pid,
      execPath: process.execPath, version: process.version, env: {}, exitCode: undefined,
    });
    let copies = 0, runs = 0, stops = 0;
    const fixtureRequire = id => {
      if (id === "./session.cjs") return {
        ROOT: root,
        assertNodeRuntime() {},
        cleanEnvironment() { throw new Error("Preparation must stop before environment/tool setup"); },
        copyWorkspace(workspace) {
          copies++;
          if (!partialCopy) throw new Error(copyFailure);
          fs.mkdirSync(workspace, { recursive: true });
          fs.copyFileSync(path.join(root, "source.cjs"), path.join(workspace, "source.cjs"));
          const report = path.join(workspace, ".local-isolation/reports/run-synthetic");
          fs.mkdirSync(report, { recursive: true });
          fs.writeFileSync(path.join(report, "result.json"), '{"syntheticEvidence":"preserve"}');
          throw new Error(copyFailure);
        },
      };
      if (id === "./processes.cjs") return {
        failure,
        Processes: class {
          async run() { runs++; throw new Error("No install or child process is allowed in this test"); }
          async stop() { stops++; return []; }
        },
      };
      // Evidence, retention, worktree protection and deletion are the real code.
      return require(id);
    };
    const module = { exports: {} };
    const file = path.join(__dirname, "prepareLocal.cjs");
    vm.runInNewContext(fs.readFileSync(file, "utf8"), {
      require: fixtureRequire, module, exports: module.exports, process: launcherProcess, console,
    }, { filename: file });
    await module.exports.prepare();

    assert.equal(copies, 1);
    assert.equal(runs, 0);
    assert.equal(stops, 1);
    assert.equal(launcherProcess.exitCode, 3);
    assert.equal(launcherProcess.listenerCount("SIGINT"), 0);
    assert.equal(launcherProcess.listenerCount("SIGTERM"), 0);
    assert.deepEqual(fs.readdirSync(local).filter(name => name.startsWith("prepared-")), ["prepared-historical"]);
    assert.equal(fs.readFileSync(path.join(historical, "sentinel"), "utf8"), "preserve historical fixture");
    const reports = path.join(local, "reports");
    const names = fs.readdirSync(reports);
    assert.equal(names.length, 1);
    const directory = path.join(reports, names[0]);
    const result = JSON.parse(fs.readFileSync(path.join(directory, "result.json"), "utf8"));
    assert.equal(result.status, "failed");
    assert.equal(result.exitCode, launcherProcess.exitCode);
    assert.equal(result.failure.message, copyFailure);
    assert.equal(result.cleanup.status, "removed");
    assert.ok(result.stages.every(stage => stage.status === "not-executed"));
    if (partialCopy) assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "verification/run-synthetic/result.json"), "utf8")).syntheticEvidence, "preserve");
    else assert.equal(fs.existsSync(path.join(directory, "verification")), false);
  });
}
