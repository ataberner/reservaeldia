const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { gzipSync } = require("node:zlib");
const subject = require("./prepareProviderPanelHosting.cjs");
const bytes = text => Buffer.from(text);
const html = id => bytes(`<html><script id="__NEXT_DATA__" type="application/json">{"buildId":"${id}"}</script><script src="/_next/static/chunks/${id}.js"></script></html>`);
const release = id => ({ name: `sites/${subject.SITE}/releases/${id}`, releaseTime: "2026-10-29T20:00:00Z", version: { name: `sites/${subject.SITE}/versions/v${id}`, status: "FINALIZED" } });
const hosting = { public: "out", ignore: ["firebase.json", "**/.*", "**/node_modules/**"], headers: [{ source: "/_next/**", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }], rewrites: [{ source: "/i/**", function: "verInvitacionPublicada" }] };
function inputs() {
  const base = new Map([[subject.PANEL, html("old")], [subject.DASHBOARD, html("old")], ["index.html", html("old")], ["admin/usuarios/index.html", html("old")], ["preguntas-frecuentes/index.html", bytes("published FAQ")], ["assets/lámina.pdf", bytes("synthetic PDF")], ["_next/static/old/_buildManifest.js", bytes("self.__BUILD_MANIFEST={};")], ["_next/static/chunks/old.js", bytes("old chunk")]]);
  const candidate = new Map([[subject.PANEL, html("new")], ["_next/static/new/_buildManifest.js", bytes("self.__BUILD_MANIFEST={};")], ["_next/static/chunks/new.js", bytes("new chunk")], ["_next/static/chunks/old.js", bytes("old chunk")]]);
  return { base, candidate };
}
function apiFor(initialFiles) {
  const state = { release: release("100"), files: initialFiles, latestCalls: 0, apiCalls: [], fetchCalls: [], onLatest: null };
  const getJson = async url => {
    state.apiCalls.push(url);
    assert.ok(url.startsWith(subject.API));
    if (url.includes("/releases?")) { state.latestCalls++; state.onLatest?.(state); return { releases: [structuredClone(state.release)] }; }
    if (url.includes("/files?")) {
      const offset = Number(new URL(url).searchParams.get("pageToken") || 0);
      const rows = [...state.files].map(([name, body]) => ({ path: `/${name}`, hash: subject.hostingHash(body), status: "ACTIVE" }));
      return { files: rows.slice(offset, offset + 3), ...(offset + 3 < rows.length ? { nextPageToken: String(offset + 3) } : {}) };
    }
    return { ...state.release.version, config: subject.normalizeHosting(hosting) };
  };
  const fetchImpl = async (url, options) => {
    state.fetchCalls.push({ url, options }); assert.equal(new URL(url).origin, subject.ORIGIN); assert.equal(options.redirect, "error");
    let name = decodeURIComponent(new URL(url).pathname).slice(1);
    if (!name || name.endsWith("/")) name += "index.html";
    assert.ok(!name.startsWith("__/firebase/"));
    return new Response(state.files.get(name), { status: state.files.has(name) ? 200 : 404 });
  };
  return { state, getJson, fetchImpl };
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "provider-panel-hosting-test-"));
  t.after(() => {
    assert.equal(fs.realpathSync(root), root); assert.ok(path.basename(root).startsWith("provider-panel-hosting-test-"));
    fs.rmSync(root, { recursive: true });
  });
  const { base, candidate } = inputs();
  const built = new Map(candidate);
  // These new-build pages must NEVER replace the current published ones.
  built.set(subject.DASHBOARD, html("new")); built.set("index.html", html("new")); built.set("unrelated-new-page/index.html", bytes("must not ship"));
  fs.mkdirSync(path.join(root, "out")); fs.mkdirSync(path.join(root, ".next"));
  for (const [name, body] of built) { const file = path.join(root, "out", name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); }
  fs.writeFileSync(path.join(root, ".next/BUILD_ID"), "new\n"); fs.writeFileSync(path.join(root, "firebase.json"), JSON.stringify({ hosting }));
  return { root, base, candidate, built, ...apiFor(base) };
}

test("composer replaces only provider HTML and adds immutable assets, preserving every other byte", () => {
  const { base, candidate } = inputs(), result = subject.compose(base, candidate, "new");
  for (const [name, body] of base) if (name !== subject.PANEL) assert.ok(result.files.get(name).equals(body), name);
  assert.ok(result.files.get(subject.PANEL).equals(candidate.get(subject.PANEL)));
  assert.equal(result.dashboardBuildId, "old"); assert.equal(result.providerBuildId, "new");
  assert.deepEqual(result.added, ["_next/static/chunks/new.js", "_next/static/new/_buildManifest.js"]);
  candidate.set("index.html", html("new")); assert.throws(() => subject.compose(base, candidate, "new"), /scope/);
});

test("immutable same-path collisions and absent build manifests are rejected", () => {
  const { base, candidate } = inputs();
  candidate.set("_next/static/chunks/old.js", bytes("different")); assert.throws(() => subject.compose(base, candidate, "new"), /Immutable asset collision/);
  candidate.delete("_next/static/chunks/old.js"); candidate.delete("_next/static/new/_buildManifest.js");
  assert.throws(() => subject.compose(base, candidate, "new"), /build manifest/);
});

test("public paths reject traversal, encoded separators, Windows aliases, reserved endpoints and collisions", () => {
  for (const name of ["../secret", "/../secret", "//host/path", "a/./b", "a//b", "a\\b", "a%2fb", "x?y", "x#y", "C:/file", "a\u0000b", "a/CON.txt", "a/aux", "a/b.", "a/b ", ".env", "__/auth/handler"]) assert.throws(() => subject.safePath(name), undefined, name);
  assert.equal(subject.safePath("/assets/lámina.pdf"), "assets/lámina.pdf");
  assert.throws(() => subject.validateFileSet(["a/one", "A/ONE"]), /case-colliding/);
  assert.throws(() => subject.validateFileSet(["one", "one/two"]), /directory/);
  assert.throws(() => subject.publicUrl("__/firebase/init.js", "r"), /not a downloadable/);
});

test("content integrity uses exact level-nine compressed hash and fails on corrupt public bytes", async () => {
  const body = bytes("synthetic file ".repeat(100));
  assert.equal(subject.hostingHash(body), subject.hash(gzipSync(body, { level: 9 })));
  await assert.rejects(subject.downloadFiles([{ path: "file.txt", hash: subject.hostingHash(body) }], release("100"), async () => new Response("different")), /hash mismatch/);
});

test("historical gzip hashes accept Linux/Windows OS byte only, with identical deflate content", () => {
  const body = bytes("same published bytes"), compressed = gzipSync(body, { level: 9 });
  for (const osCode of [3, 10]) {
    const historical = Buffer.from(compressed); historical[9] = osCode;
    assert.equal(subject.matchHostingHash(body, subject.hash(historical)), osCode);
    historical[historical.length - 1] ^= 1;
    assert.throws(() => subject.matchHostingHash(body, subject.hash(historical)), /hash mismatch/);
  }
  compressed[9] = 255;
  assert.throws(() => subject.matchHostingHash(body, subject.hash(compressed)), /hash mismatch/);
});

test("pagination inventories all files and excludes Firebase generated init without downloading it", async () => {
  const { base } = inputs(); base.set("__/firebase/init.js", bytes("platform generated"));
  const { state, getJson, fetchImpl } = apiFor(base);
  const inventory = await subject.listVersionFiles(getJson, release("100"));
  assert.equal(inventory.files.length, base.size - 1); assert.deepEqual(inventory.excluded, ["__/firebase/init.js"]);
  const downloaded = await subject.downloadFiles(inventory.files, release("100"), fetchImpl);
  assert.equal(downloaded.size, base.size - 1); assert.equal(state.apiCalls.length, 3);
  assert.ok(state.fetchCalls.some(row => row.url.includes("l%C3%A1mina.pdf")));
});

test("inventory rejects repeated pagination tokens, file limits and non-active status", async () => {
  const entry = { path: "/file", hash: "a".repeat(64), status: "ACTIVE" };
  await assert.rejects(subject.listVersionFiles(async () => ({ files: [entry], nextPageToken: "loop" }), release("100")), /pagination/);
  await assert.rejects(subject.listVersionFiles(async () => ({ files: [entry] }), release("100"), { ...subject.LIMITS, files: 0 }), /file-count/);
  await assert.rejects(subject.listVersionFiles(async () => ({ files: [{ ...entry, status: "EXPECTED" }] }), release("100")), /ACTIVE/);
});

test("byte/file limits cover composed output and streamed download, with at most six downloads", async () => {
  const { base, candidate } = inputs();
  assert.throws(() => subject.compose(base, candidate, "new", { ...subject.LIMITS, bytes: 1 }), /byte limit/);
  assert.throws(() => subject.compose(base, candidate, "new", { ...subject.LIMITS, files: base.size }), /file-count/);
  const body = bytes("123456"), rows = Array.from({ length: 12 }, (_, index) => ({ path: `file${index}`, hash: subject.hostingHash(body) }));
  let active = 0, maximum = 0;
  await subject.downloadFiles(rows, release("100"), async () => {
    active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 2)); active--;
    return new Response(body);
  });
  assert.equal(maximum, 6);
  await assert.rejects(subject.downloadFiles(rows, release("100"), async () => new Response(body), { ...subject.LIMITS, bytes: 5 }), /byte limit/);
});

test("configuration must retain exact headers/rewrites and refuse unsupported changes", () => {
  const normalized = subject.normalizeHosting(hosting);
  assert.deepEqual(normalized.rewrites, [{ glob: "/i/**", run: { serviceId: "verinvitacionpublicada", region: "us-central1" } }]);
  assert.throws(() => subject.normalizeHosting({ ...hosting, cleanUrls: true }), /Unsupported/);
  assert.throws(() => subject.normalizeHosting({ ...hosting, ignore: [] }), /ignore/);
  assert.throws(() => subject.createGetJson({}), /in memory/);
  assert.throws(() => subject.createGetJson({ FIREBASE_SERVICE_ACCOUNT_JSON: '{"type":"authorized_user"}' }), /Service-account/);
});

test("prepare, assert-current and postdeploy verify work offline with exact whole-release inventory", async t => {
  const f = fixture(t);
  const report = await subject.run({ mode: "prepare", root: f.root, getJson: f.getJson, fetchImpl: f.fetchImpl });
  assert.equal(report.output.length, f.base.size + 2); assert.deepEqual(report.replaced, [subject.PANEL]);
  assert.equal(report.dashboardBuildId, "old"); assert.equal(report.providerBuildId, "new");
  assert.equal(fs.readFileSync(path.join(f.root, ".next/BUILD_ID"), "utf8").trim(), "old");
  assert.ok(!fs.existsSync(path.join(f.root, "out/unrelated-new-page/index.html")));
  assert.ok(fs.existsSync(path.join(f.root, report.preservedExport, "unrelated-new-page/index.html")));
  assert.equal((await subject.run({ mode: "assert-current", root: f.root, getJson: f.getJson })).status, "current");
  f.state.release = release("101"); f.state.files = subject.readFiles(path.join(f.root, "out"));
  const verified = await subject.run({ mode: "verify", root: f.root, getJson: f.getJson, fetchImpl: f.fetchImpl });
  assert.equal(verified.status, "verified"); assert.equal(verified.files, report.output.length);
  assert.deepEqual(verified.publicChecks.sort(), [subject.PANEL, subject.DASHBOARD].sort());
  assert.equal(verified.remoteMutations, 0);
  assert.ok(fs.existsSync(path.join(f.root, ".local-isolation/provider-panel-hosting-verified.json")));
});

test("concurrent release after installation restores original export and BUILD_ID", async t => {
  const f = fixture(t); f.state.onLatest = state => { if (state.latestCalls === 3) state.release = release("101"); };
  await assert.rejects(subject.run({ mode: "prepare", root: f.root, getJson: f.getJson, fetchImpl: f.fetchImpl }), /Concurrent/);
  assert.deepEqual(subject.manifest(subject.readFiles(path.join(f.root, "out"))), subject.manifest(f.built));
  assert.equal(fs.readFileSync(path.join(f.root, ".next/BUILD_ID"), "utf8"), "new\n");
  assert.ok(!fs.existsSync(path.join(f.root, subject.REPORT)));
});

test("assert-current rejects concurrent releases and modified local bytes before deployment", async t => {
  const f = fixture(t); await subject.run({ mode: "prepare", root: f.root, getJson: f.getJson, fetchImpl: f.fetchImpl });
  f.state.release = release("102");
  await assert.rejects(subject.run({ mode: "assert-current", root: f.root, getJson: f.getJson }), /Concurrent/);
  f.state.release = release("100"); fs.writeFileSync(path.join(f.root, "out/index.html"), "modified");
  await assert.rejects(subject.run({ mode: "assert-current", root: f.root, getJson: f.getJson }), /artifact changed/);
});

test("postdeploy verification rejects any unrelated published hash change", async t => {
  const f = fixture(t); await subject.run({ mode: "prepare", root: f.root, getJson: f.getJson, fetchImpl: f.fetchImpl });
  f.state.release = release("102"); f.state.files = subject.readFiles(path.join(f.root, "out")); f.state.files.set("index.html", bytes("unrelated change"));
  await assert.rejects(subject.run({ mode: "verify", root: f.root, getJson: f.getJson, fetchImpl: f.fetchImpl }), /inventory differs/);
  assert.ok(!fs.existsSync(path.join(f.root, ".local-isolation/provider-panel-hosting-verified.json")));
});

test("venues composition replaces its landing/detail HTML and preserves the live panel, other routes and artwork", () => {
  const { base, candidate } = inputs();
  const { pages, requiredAssets: [art] } = subject.SCOPES.venues;
  base.set(art, bytes("existing artwork"));
  candidate.delete(subject.PANEL); candidate.set(art, base.get(art));
  for (const page of pages) { base.set(page, html("old")); candidate.set(page, html("new")); }
  const result = subject.compose(base, candidate, "new", subject.LIMITS, "venues");
  for (const [name, body] of base) if (!pages.includes(name)) assert.ok(result.files.get(name).equals(body), name);
  for (const page of pages) assert.ok(result.files.get(page).equals(html("new")));
  assert.ok(!result.added.includes(art));
  candidate.set(art, bytes("changed artwork"));
  assert.throws(() => subject.compose(base, candidate, "new", subject.LIMITS, "venues"), /Required public asset/);
  candidate.delete(art);
  assert.throws(() => subject.compose(base, candidate, "new", subject.LIMITS, "venues"), /Required public asset/);
  assert.throws(() => subject.publicationScope("../index"), /Unsupported scoped/);
});

test("venues full cycle has a separate report and rejects reusing a panel report", async t => {
  const f = fixture(t), { pages, report: reportPath, requiredAssets: [art] } = subject.SCOPES.venues;
  for (const page of pages) f.base.set(page, html("old"));
  f.base.set(art, bytes("existing artwork"));
  for (const [name, body] of [...pages.map(page => [page, html("new")]), [art, f.base.get(art)]]) {
    const file = path.join(f.root, "out", name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body);
  }
  const report = await subject.run({ mode: "prepare", scope: "venues", root: f.root, getJson: f.getJson, fetchImpl: f.fetchImpl });
  assert.deepEqual(report.replaced, pages); assert.equal(report.scope, "venues");
  assert.ok(fs.existsSync(path.join(f.root, reportPath)));
  assert.ok(!fs.existsSync(path.join(f.root, subject.REPORT)));
  assert.ok(fs.readFileSync(path.join(f.root, "out", subject.PANEL)).equals(f.base.get(subject.PANEL)));
  assert.throws(() => subject.assertLocalArtifact(f.root, report, "panel"), /scope changed/);
  assert.equal((await subject.run({ mode: "assert-current", scope: "venues", root: f.root, getJson: f.getJson })).status, "current");
  f.state.release = release("103"); f.state.files = subject.readFiles(path.join(f.root, "out"));
  const verified = await subject.run({ mode: "verify", scope: "venues", root: f.root, getJson: f.getJson, fetchImpl: f.fetchImpl });
  assert.deepEqual(verified.publicChecks.sort(), [...pages, subject.DASHBOARD].sort());
  assert.equal(verified.scope, "venues");
  assert.ok(fs.existsSync(path.join(f.root, reportPath.replace(/\.json$/, "-verified.json"))));
});
