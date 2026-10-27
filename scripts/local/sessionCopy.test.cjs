const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { copySourceTree, isSourcePath, removeSession, ROOT } = require("./session.cjs");
const { removeWithoutFollowingLinks } = require("./sessionCleanup.cjs");
const { preserveReports } = require("./prepareLocal.cjs");

function fixture(t, prefix = "copy-test-") {
  const base = path.join(ROOT, ".local-isolation");
  fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, prefix));
  // Only this newly-created synthetic fixture is owned by this test.
  t.after(() => removeWithoutFollowingLinks(directory));
  return directory;
}

test("source copies omit nested regenerable outputs and credentials, retaining current source bytes", t => {
  const directory = fixture(t), source = path.join(directory, "source"), destination = path.join(directory, "copy");
  fs.mkdirSync(path.join(source, "nested"), { recursive: true });
  fs.writeFileSync(path.join(source, "nested/current.cjs"), "uncommitted source\n");
  for (const name of [".local-isolation", "node_modules", ".next", ".next-dev-3100", "out", "artifacts", "coverage", "dist", "build", ".cache", ".git"]) {
    fs.mkdirSync(path.join(source, "nested", name));
    fs.writeFileSync(path.join(source, "nested", name, "output.cjs"), "regenerable bytes");
    assert.equal(isSourcePath(`functions/${name}/output.cjs`), false);
  }
  for (const name of [".env.local", ".secret.local", ".runtimeconfig.json", "firebase-key.json", "key.pem", "trace.log", "cache.tsbuildinfo"])
    fs.writeFileSync(path.join(source, "nested", name), "excluded synthetic bytes");
  copySourceTree(source, destination);
  assert.deepEqual(fs.readdirSync(path.join(destination, "nested")), ["current.cjs"]);
  assert.equal(fs.readFileSync(path.join(destination, "nested/current.cjs"), "utf8"), "uncommitted source\n");
});

test("source copying rejects source junctions without traversing their target", t => {
  const directory = fixture(t), source = path.join(directory, "source"), outside = path.join(directory, "sentinel");
  fs.mkdirSync(source); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "private.cjs"), "sentinel");
  fs.symlinkSync(outside, path.join(source, "linked"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => copySourceTree(source, path.join(directory, "copy")), /enlaces/);
  assert.equal(fs.readFileSync(path.join(outside, "private.cjs"), "utf8"), "sentinel");
});

test("nested verification reports survive outside their workspace, without following report junctions", t => {
  const directory = fixture(t), workspace = path.join(directory, "workspace"), destination = path.join(directory, "evidence");
  for (const name of ["reports", "ownership-evidence"]) {
    const report = path.join(workspace, ".local-isolation", name, "run-synthetic");
    fs.mkdirSync(report, { recursive: true });
    fs.writeFileSync(path.join(report, "result.json"), '{"status":"failed"}');
  }
  preserveReports(workspace, destination);
  assert.equal(fs.existsSync(path.join(destination, "run-synthetic/result.json")), true);
  assert.equal(fs.existsSync(path.join(destination, "ownership/run-synthetic/result.json")), true);
  fs.symlinkSync(destination, path.join(workspace, ".local-isolation/reports/linked"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => preserveReports(workspace, path.join(directory, "other-evidence")), /enlaces/);
});

test("quick defaults preserve the explicit complete CI and integration commands", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json")));
  assert.equal(pkg.scripts["verify:local"], "node scripts/local/runLocal.cjs verify");
  assert.equal(pkg.scripts["test:local:full"], "node scripts/local/runLocal.cjs test");
  assert.match(pkg.scripts.test, /quickVerification\.cjs$/);
  const workflow = fs.readFileSync(path.join(ROOT, ".github/workflows/local-verification.yml"), "utf8");
  assert.match(workflow, /run: npm run local:prepare -- --keep-workspace\r?\n/);
  assert.match(workflow, /run: npm --prefix "\$VERIFY_WORKSPACE" run verify:local/);
  assert.match(workflow, /if: \$\{\{ always\(\) \}\}/);
});

test("manual clean rejects live PIDs and historical workspaces even with stopped markers", t => {
  const session = fixture(t, "session-manual-test-");
  const marker = path.join(session, "session.json");
  const identity = { owner: "reservaeldia-local", project: require("../../shared/firebaseEnvironment.cjs").LOCAL_PROJECT, stopped: true };
  fs.writeFileSync(marker, JSON.stringify({ ...identity, pid: process.pid }));
  assert.throws(() => removeSession(session), /activo/);
  fs.writeFileSync(marker, JSON.stringify(identity));
  fs.mkdirSync(path.join(session, "workspace"));
  fs.writeFileSync(path.join(session, "workspace/new-source.cjs"), "unintegrated");
  assert.throws(() => removeSession(session), /histórica/);
  assert.equal(fs.readFileSync(path.join(session, "workspace/new-source.cjs"), "utf8"), "unintegrated");
});
