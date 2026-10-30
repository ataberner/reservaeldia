const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { ROOT, cleanEnvironment } = require("./session.cjs");
const { buildEnvironment } = require("./staticBuild.cjs");
const { exportFile, createExportServer } = require("./serveExport.cjs");
const contract = require("../../shared/firebaseEnvironment.cjs");

test("optimized builds retain isolation and select one coherent Firebase target", () => {
  const input = cleanEnvironment(path.join(ROOT, ".local-isolation", "synthetic-build"), {
    GOOGLE_APPLICATION_CREDENTIALS: "forbidden", FIREBASE_TOKEN: "forbidden", EMAIL_MODE: "production",
  });
  for (const target of ["demo", "production-config"]) {
    const env = buildEnvironment(input, target);
    assert.equal(env.NODE_ENV, "production");
    assert.equal(env.CIRCLE_NODE_TOTAL, "2");
    assert.equal(env.NODE_OPTIONS, input.NODE_OPTIONS);
    assert.equal(env.HOME, input.HOME);
    assert.equal(env.EMAIL_MODE, "disabled");
    assert.equal(env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
    assert.equal(env.FIREBASE_TOKEN, undefined);
    if (target === "demo") {
      assert.equal(env.NEXT_PUBLIC_FIREBASE_MODE, "emulators");
      assert.equal(env.GCLOUD_PROJECT, contract.LOCAL_PROJECT);
      assert.equal(env.FIRESTORE_EMULATOR_HOST, input.FIRESTORE_EMULATOR_HOST);
    } else {
      assert.equal(env.NEXT_PUBLIC_FIREBASE_MODE, "prod");
      assert.equal(env.GCLOUD_PROJECT, contract.PRODUCTION_CONFIG.projectId);
      assert.equal(env.FIREBASE_STORAGE_BUCKET, contract.PRODUCTION_CONFIG.storageBucket);
      assert.deepEqual(Object.keys(env).filter(key => key.includes("EMULATOR")), []);
      assert.equal(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, undefined);
    }
  }
  assert.equal(input.NEXT_PUBLIC_FIREBASE_MODE, "emulators");
  assert.throws(() => buildEnvironment(input, "unknown"));
});

test("static export server contains paths, uses local CSP and only permits reads", async () => {
  const base = path.join(ROOT, ".local-isolation");
  fs.mkdirSync(base, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(base, "static-server-test-"));
  const root = path.join(fixture, "out"), foreign = path.join(fixture, "foreign");
  fs.mkdirSync(path.join(root, "dashboard"), { recursive: true });
  fs.mkdirSync(foreign);
  fs.writeFileSync(path.join(root, "index.html"), "synthetic-home");
  fs.writeFileSync(path.join(root, "dashboard", "index.html"), "synthetic-dashboard");
  fs.writeFileSync(path.join(foreign, "index.html"), "must-not-be-served");
  fs.symlinkSync(foreign, path.join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
  const server = createExportServer(fs.realpathSync(root));
  function request(method, pathname) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port: server.address().port, path: pathname, method }, response => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", data => { body += data; });
        response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
      });
      req.on("error", reject); req.end();
    });
  }
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    for (const pathname of ["/%2e%2e/foreign/index.html", "/../foreign/index.html", "/%5cforeign", "/%00", "/escape/", "/%invalid"]) {
      assert.equal(exportFile(fs.realpathSync(root), pathname), null, pathname);
      assert.equal((await request("GET", pathname)).status, 404, pathname);
    }
    const home = await request("GET", "/");
    assert.equal(home.status, 200); assert.equal(home.body, "synthetic-home");
    assert.equal(home.headers["content-security-policy"], contract.localContentSecurityPolicy());
    assert.match(home.headers["cache-control"], /no-store/);
    assert.match(home.headers["content-type"], /text\/html/);
    assert.equal((await request("GET", "/dashboard/?slug=synthetic")).body, "synthetic-dashboard");
    assert.equal((await request("HEAD", "/dashboard/")).body, "");
    assert.equal((await request("POST", "/dashboard/")).status, 405);
  } finally {
    await new Promise(resolve => server.close(resolve));
    // This exact generated test directory is inside the workspace. rm does not
    // follow its junction; the external fixture remains until its own removal.
    assert.equal(path.dirname(fixture), base);
    assert.ok(path.basename(fixture).startsWith("static-server-test-"));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("evidence collection retains approved editor/directory PNGs and excludes arbitrary files and profiles", () => {
  const { Evidence } = require("./evidence.cjs");
  const base = path.join(ROOT, ".local-isolation");
  fs.mkdirSync(base, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(base, "evidence-collection-test-"));
  try {
    const session = path.join(fixture, "session");
    const captures = path.join(session, "editor-flow-screenshots");
    fs.mkdirSync(captures, { recursive: true });
    const approved = ["01-login-desktop.png", "15-public-paused.png", "failure.png"];
    for (const name of approved) fs.writeFileSync(path.join(captures, name), Buffer.from(`synthetic-png-bytes:${name}`));
    for (const name of ["unapproved.png", "01-login-desktop.png.json", "browser.har", "environment.json"]) {
      fs.writeFileSync(path.join(captures, name), "synthetic-must-not-be-collected");
    }
    for (const relative of ["editor-flow-browser-profile/Local State", "editor-flow-browser-profile/Default/Local Storage/synthetic", "home/synthetic", "editor-flow-screenshots/nested/unapproved.png"]) {
      const destination = path.join(session, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, "synthetic-must-not-be-collected");
    }
    const report = { status: "passed", screenshots: approved };
    fs.writeFileSync(path.join(session, "editor-flow-evidence.json"), JSON.stringify(report));
    const directoryCaptures = path.join(session, "provider-directory-screenshots");
    fs.mkdirSync(directoryCaptures);
    const directoryApproved = ["10-venues-mobile.png", "11-venues-mobile-map.png"];
    for (const name of [...directoryApproved, "unapproved.png", "browser.har"]) fs.writeFileSync(path.join(directoryCaptures, name), Buffer.from(`synthetic-directory:${name}`));
    const evidence = new Evidence(fixture, "synthetic-collection", []);
    evidence.collect(session);
    assert.deepEqual(fs.readdirSync(evidence.directory).sort(), ["editor-flow-evidence.json", "editor-flow-screenshots", "provider-directory-screenshots", "result.json"]);
    assert.deepEqual(fs.readdirSync(path.join(evidence.directory, "provider-directory-screenshots")).sort(), directoryApproved.toSorted());
    for (const name of directoryApproved) assert.deepEqual(fs.readFileSync(path.join(evidence.directory, "provider-directory-screenshots", name)), fs.readFileSync(path.join(directoryCaptures, name)));
    assert.deepEqual(fs.readdirSync(path.join(evidence.directory, "editor-flow-screenshots")).sort(), approved.toSorted());
    for (const name of approved) {
      assert.deepEqual(fs.readFileSync(path.join(evidence.directory, "editor-flow-screenshots", name)), fs.readFileSync(path.join(captures, name)));
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(evidence.directory, "editor-flow-evidence.json"))), report);
  } finally {
    assert.equal(path.dirname(fixture), base);
    assert.match(path.basename(fixture), /^evidence-collection-test-/);
    assert.equal(fs.lstatSync(fixture).isSymbolicLink(), false);
    assert.equal(fs.realpathSync(fixture), fixture);
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
