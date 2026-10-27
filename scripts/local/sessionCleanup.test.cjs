const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { registerSession, cleanupSession, assertSafeSessionTarget, removeWithoutFollowingLinks } = require("./sessionCleanup.cjs");

function removeFixture(target) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isDirectory()) return fs.unlinkSync(target);
  for (const name of fs.readdirSync(target)) removeFixture(path.join(target, name));
  fs.rmdirSync(target);
}

function fixture(t) {
  const base = path.resolve(__dirname, "../../.local-isolation");
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, "cleanup-test-"));
  t.after(() => removeFixture(root));
  const session = path.join(root, ".local-isolation/session-owned");
  const workspace = path.join(session, "workspace");
  const evidenceDirectory = path.join(root, ".local-isolation/reports/run-owned");
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  fs.writeFileSync(path.join(root, "source.cjs"), "original source");
  fs.writeFileSync(path.join(workspace, "source.cjs"), "original source");
  fs.writeFileSync(path.join(evidenceDirectory, "result.json"), '{"status":"failed"}');
  return { root, session, workspace, evidenceDirectory };
}

test("owned stopped sessions are removed after failed tests while evidence and shared junction targets survive", t => {
  const f = fixture(t);
  const shared = path.join(f.root, "dependencies");
  fs.mkdirSync(shared);
  fs.writeFileSync(path.join(shared, "sentinel"), "shared");
  fs.writeFileSync(path.join(shared, ".git"), "must not be traversed");
  fs.symlinkSync(shared, path.join(f.workspace, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const receipt = registerSession(f.session, f);
  fs.mkdirSync(path.join(f.workspace, ".next"));
  fs.writeFileSync(path.join(f.workspace, ".next/cache"), "regenerable");
  for (const name of [".cache", ".turbo"]) {
    fs.mkdirSync(path.join(f.workspace, name));
    fs.writeFileSync(path.join(f.workspace, name, "generated"), "regenerable");
  }
  fs.writeFileSync(path.join(f.workspace, "firestore-debug.log"), "synthetic emulator output");
  assert.deepEqual(cleanupSession(receipt, { stopped: true, evidenceDirectory: f.evidenceDirectory }), { status: "removed" });
  assert.equal(fs.existsSync(f.session), false);
  assert.equal(fs.readFileSync(path.join(shared, "sentinel"), "utf8"), "shared");
  assert.equal(fs.existsSync(path.join(f.evidenceDirectory, "result.json")), true);
});

test("an active process in a nested session remains protected despite a stopped marker", async t => {
  const f = fixture(t);
  const receipt = registerSession(f.session, f);
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { windowsHide: true, stdio: "ignore" });
  const closed = new Promise(resolve => child.once("close", resolve));
  try {
    await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    const nested = path.join(f.workspace, ".local-isolation/session-child");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, "session.json"), JSON.stringify({ pid: child.pid, stopped: true }));
    const result = cleanupSession(receipt, { stopped: true, evidenceDirectory: f.evidenceDirectory });
    assert.equal(result.status, "retained");
    assert.match(result.reason, /proceso activo/);
    assert.equal(fs.existsSync(f.session), true);
  } finally {
    child.kill();
    await closed;
  }
});

test("copied report session markers are evidence, not an active session lease", async t => {
  const f = fixture(t);
  const receipt = registerSession(f.session, f);
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { windowsHide: true, stdio: "ignore" });
  const closed = new Promise(resolve => child.once("close", resolve));
  try {
    await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    const report = path.join(f.workspace, ".local-isolation/reports/run-evidence");
    fs.mkdirSync(report, { recursive: true });
    fs.writeFileSync(path.join(report, "session.json"), JSON.stringify({ owner: "reservaeldia-local", pid: child.pid, stopped: false }));
    assert.equal(cleanupSession(receipt, { stopped: true, evidenceDirectory: f.evidenceDirectory }).status, "removed");
  } finally {
    child.kill();
    await closed;
  }
});

test("active sessions, missing evidence, and historical paths are retained", t => {
  const f = fixture(t);
  const receipt = registerSession(f.session, f);
  for (const [value, options] of [
    [receipt, { evidenceDirectory: f.evidenceDirectory }],
    [receipt, { stopped: true }],
    [receipt, { stopped: true, evidenceDirectory: f.workspace }],
    [{ session: f.session }, { stopped: true, evidenceDirectory: f.evidenceDirectory }],
  ]) {
    assert.equal(cleanupSession(value, options).status, "retained");
    assert.equal(fs.existsSync(f.session), true);
  }
});

test("exact mapped generated copies may change but their canonical source stays protected", t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.workspace, "generated.cjs"), "old generated bytes");
  const receipt = registerSession(f.session, { ...f, generatedFiles: ["generated.cjs"] });
  fs.writeFileSync(path.join(f.workspace, "generated.cjs"), "new generated bytes");
  fs.writeFileSync(path.join(f.workspace, "source.cjs"), "unintegrated canonical change");
  assert.equal(cleanupSession(receipt, { stopped: true, evidenceDirectory: f.evidenceDirectory }).status, "retained");
  fs.writeFileSync(path.join(f.workspace, "source.cjs"), "original source");
  assert.equal(cleanupSession(receipt, { stopped: true, evidenceDirectory: f.evidenceDirectory }).status, "removed");
});

test("synthetic local env does not inspect the personal configuration counterpart", t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.workspace, ".env.local"), "SYNTHETIC=true");
  fs.writeFileSync(path.join(f.root, ".env.local"), "PRIVATE_SENTINEL=synthetic");
  const read = fs.readFileSync;
  try {
    fs.readFileSync = (file, ...args) => {
      assert.notEqual(path.resolve(String(file)), path.join(f.root, ".env.local"), "personal env must not be read");
      return read(file, ...args);
    };
    const receipt = registerSession(f.session, f);
    assert.equal(cleanupSession(receipt, { stopped: true, evidenceDirectory: f.evidenceDirectory }).status, "removed");
  } finally { fs.readFileSync = read; }
});

for (const mutation of ["edit", "new", "delete", "original"]) {
  test(`preserves unintegrated source changes: ${mutation}`, t => {
    const f = fixture(t);
    const receipt = registerSession(f.session, f);
    if (mutation === "edit") fs.writeFileSync(path.join(f.workspace, "source.cjs"), "unintegrated");
    if (mutation === "new") fs.writeFileSync(path.join(f.workspace, "new.cjs"), "unintegrated");
    if (mutation === "delete") fs.unlinkSync(path.join(f.workspace, "source.cjs"));
    if (mutation === "original") fs.writeFileSync(path.join(f.root, "source.cjs"), "new original");
    assert.equal(cleanupSession(receipt, { stopped: true, evidenceDirectory: f.evidenceDirectory }).status, "retained");
    assert.equal(fs.existsSync(f.session), true);
  });
}

test("a source parent replaced by a junction retains the copied snapshot", t => {
  const f = fixture(t);
  const source = path.join(f.root, "src");
  const copied = path.join(f.workspace, "src");
  fs.mkdirSync(source);
  fs.mkdirSync(copied);
  fs.writeFileSync(path.join(source, "nested.cjs"), "same bytes");
  fs.writeFileSync(path.join(copied, "nested.cjs"), "same bytes");
  const receipt = registerSession(f.session, f);
  const relocated = path.join(f.root, "relocated-source");
  fs.renameSync(source, relocated);
  fs.symlinkSync(relocated, source, process.platform === "win32" ? "junction" : "dir");
  const result = cleanupSession(receipt, { stopped: true, evidenceDirectory: f.evidenceDirectory });
  assert.equal(result.status, "retained");
  assert.match(result.reason, /Enlace\/junction/);
  assert.equal(fs.readFileSync(path.join(copied, "nested.cjs"), "utf8"), "same bytes");
  assert.equal(fs.readFileSync(path.join(relocated, "nested.cjs"), "utf8"), "same bytes");
});

test("Git metadata inside generated output protects the entire session before any deletion", t => {
  const f = fixture(t);
  const receipt = registerSession(f.session, f);
  fs.mkdirSync(path.join(f.workspace, "artifacts/nested"), { recursive: true });
  fs.writeFileSync(path.join(f.workspace, "artifacts/nested/.git"), "gitdir: elsewhere");
  const result = cleanupSession(receipt, { stopped: true, evidenceDirectory: f.evidenceDirectory });
  assert.equal(result.status, "retained");
  assert.match(result.reason, /Git/);
  assert.equal(fs.existsSync(path.join(f.workspace, "source.cjs")), true);
});

test("an outer prepared workspace preserves a nested session retained for source changes", t => {
  const f = fixture(t);
  const outer = registerSession(f.session, f);
  const session = path.join(f.workspace, ".local-isolation/session-child");
  const workspace = path.join(session, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, "source.cjs"), "original source");
  const child = registerSession(session, { root: f.workspace, workspace });
  fs.writeFileSync(path.join(workspace, "source.cjs"), "unintegrated child source");
  assert.equal(cleanupSession(child, { stopped: true, evidenceDirectory: f.evidenceDirectory }).status, "retained");
  const result = cleanupSession(outer, { stopped: true, evidenceDirectory: f.evidenceDirectory });
  assert.equal(result.status, "retained");
  assert.match(result.reason, /Sesión anidada/);
  assert.equal(fs.readFileSync(path.join(workspace, "source.cjs"), "utf8"), "unintegrated child source");
});

for (const [prefix, marker] of [["session", "session.json"], ["ownership", "session.json"], ["prepared", "prepared.json"]]) {
test(`an unfinished nested ${prefix} without a retention sentinel is also preserved`, t => {
  const f = fixture(t);
  const receipt = registerSession(f.session, f);
  const nested = path.join(f.workspace, `.local-isolation/${prefix}-unfinished`);
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, marker), JSON.stringify({ owner: "reservaeldia-local", pid: process.pid, stopped: true }));
  const result = cleanupSession(receipt, { stopped: true, evidenceDirectory: f.evidenceDirectory });
  assert.equal(result.status, "retained");
  assert.match(result.reason, /Sesión anidada pendiente/);
  assert.equal(fs.existsSync(f.session), true);
});
}

test("cleanup rejects linked ancestors and destinations outside the isolation directory", t => {
  const f = fixture(t);
  assert.throws(() => assertSafeSessionTarget(f.root, f.workspace), /directo/);
  const alias = path.join(f.root, "alias");
  fs.symlinkSync(path.join(f.root, ".local-isolation"), alias, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => assertSafeSessionTarget(f.root, path.join(alias, "session-owned")), /directo/);
  const nestedRoot = path.join(f.root, "nested");
  fs.mkdirSync(nestedRoot);
  fs.symlinkSync(path.join(f.root, ".local-isolation"), path.join(nestedRoot, ".local-isolation"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => registerSession(path.join(nestedRoot, ".local-isolation/session-owned"), { root: nestedRoot }), /Enlace/);
});

test("direct deletion rejects a parent junction and preserves its target file", t => {
  const f = fixture(t);
  const outside = path.join(f.root, "outside");
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "sentinel"), "must survive");
  const linked = path.join(f.workspace, "linked-parent");
  fs.symlinkSync(outside, linked, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => removeWithoutFollowingLinks(path.join(linked, "sentinel")), /Enlace\/junction/);
  assert.equal(fs.readFileSync(path.join(outside, "sentinel"), "utf8"), "must survive");
  assert.equal(fs.lstatSync(linked).isSymbolicLink(), true);
});

test("a registered worktree is protected even if its .git file disappears", t => {
  const f = fixture(t);
  const git = (...args) => {
    const result = spawnSync("git", ["-C", f.root, ...args], { encoding: "utf8", windowsHide: true, timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
  };
  git("init", "--quiet");
  git("add", "source.cjs");
  git("-c", "user.name=Local fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Synthetic cleanup fixture");
  const receipt = registerSession(f.session, f);
  const worktree = path.join(f.session, "registered");
  git("worktree", "add", "--quiet", "--detach", worktree, "HEAD");
  fs.unlinkSync(path.join(worktree, ".git"));
  const result = cleanupSession(receipt, { stopped: true, evidenceDirectory: f.evidenceDirectory });
  assert.equal(result.status, "retained");
  assert.match(result.reason, /Worktree registrado/);
  assert.equal(fs.existsSync(path.join(f.workspace, "source.cjs")), true);
});
