const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { selectScope, validateVenueDependencyChange } = require("./selectProviderHostingScope.cjs");
const venue = "src/components/venues/VenuesLanding.jsx";
const panel = "src/components/admin/providers/ProviderDirectoryAdmin.jsx";
test("venue release accepts its exact UI, backend, verification and operational files", () => {
  assert.equal(selectScope([venue, "functions/src/providers/directoryRegions.ts", "src/components/marketplace/useProviderDirectory.js", "src/components/appHeader/AppHeader.jsx", "src/components/marketplace/MarketplaceHeaderNavigation.test.mjs", "scripts/local/providerDirectory.browser.test.mjs", "scripts/prepareProviderPanelHosting.cjs", ".github/workflows/providers-private-candidate.yml", "deployment/venues/README.md"]), "venues");
  assert.equal(selectScope([venue, "scripts/local/evidence.cjs", "scripts/local/staticBuild.test.cjs", "scripts/local/serveExport.cjs"]), "venues");
});
test("panel remains supported and unrelated ordinary releases keep their existing path", () => {
  assert.equal(selectScope([panel, "src/components/admin/providers/ProviderAdmin.module.css", "deployment/provider-panel/README.md"]), "panel");
  assert.equal(selectScope(["src/pages/preguntas-frecuentes.js"]), "full");
});
test("scoped page with unknown files or another scoped page is rejected, never full", () => {
  for (const file of ["src/pages/_app.js", "firebase.json", "firestore.rules", "src/components/venues/Unexpected.jsx", "functions/src/index.ts"]) assert.throws(() => selectScope([venue, file]), /unreviewed/, file);
  assert.throws(() => selectScope([panel, venue]), /Multiple scoped/);
  assert.throws(() => selectScope([panel, "src/pages/index.js"]), /unreviewed/);
});

function packageEntry(name, version, fields = {}) {
  return { version, resolved: `https://registry.npmjs.org/${name}/-/${name.split("/").at(-1)}-${version}.tgz`, integrity: `sha512-${Buffer.alloc(64).toString("base64")}`, ...fields };
}
function dependencyChange() {
  const beforeManifest = { name: "scope-fixture", version: "1.0.0", scripts: { build: "existing-build" }, engines: { node: "22" }, dependencies: { shared: "1.0.0", nested: "1.0.0" } };
  const beforeLock = { name: "scope-fixture", version: "1.0.0", lockfileVersion: 3, requires: true, packages: {
    "": { name: "scope-fixture", version: "1.0.0", dependencies: { ...beforeManifest.dependencies } },
    "node_modules/shared": packageEntry("shared", "1.0.0"),
    "node_modules/nested": packageEntry("nested", "1.0.0"),
  } };
  const afterManifest = structuredClone(beforeManifest), afterLock = structuredClone(beforeLock);
  afterManifest.dependencies["maplibre-gl"] = "6.16.0";
  afterLock.packages[""].dependencies["maplibre-gl"] = "6.16.0";
  afterLock.packages["node_modules/maplibre-gl"] = packageEntry("maplibre-gl", "6.16.0", { dependencies: { shared: "1.0.0", nested: "2.0.0", "@maps/style": "1.0.0" } });
  afterLock.packages["node_modules/maplibre-gl/node_modules/nested"] = packageEntry("nested", "2.0.0");
  afterLock.packages["node_modules/@maps/style"] = packageEntry("@maps/style", "1.0.0", { dependencies: { leaf: "1.0.0" }, optionalDependencies: { "optional-platform": "1.0.0" } });
  afterLock.packages["node_modules/leaf"] = packageEntry("leaf", "1.0.0");
  return { beforeManifest, afterManifest, beforeLock, afterLock };
}
const withPackages = [venue, "package.json", "package-lock.json"];

test("venue scope accepts only the exact new MapLibre dependency and its reachable nested registry tree", () => {
  const change = dependencyChange();
  assert.doesNotThrow(() => validateVenueDependencyChange(change));
  assert.equal(selectScope([...withPackages, "src/components/venues/VenueMapBase.jsx", "src/components/venues/VenueMapBase.test.mjs", "src/components/venues/venueMapStyle.js", "src/components/venues/venueMapStyle.test.mjs", "src/components/venues/venueMapRuntime.js"], change), "venues");
  assert.throws(() => selectScope(withPackages), /committed before\/after/);
  assert.throws(() => selectScope([venue, "package.json"], change), /both package/);
  assert.throws(() => selectScope([venue, "package-lock.json"], change), /both package/);
  assert.throws(() => selectScope([panel, "package.json", "package-lock.json"], change), /unreviewed/);
});

test("dependency exception rejects other manifest changes, different versions and mismatched lock roots", () => {
  for (const mutate of [
    change => { change.afterManifest.dependencies["maplibre-gl"] = "^6.16.0"; },
    change => { change.afterManifest.dependencies.shared = "2.0.0"; },
    change => { change.afterManifest.dependencies.unrelated = "1.0.0"; },
    change => { change.afterManifest.scripts.build = "different-build"; },
    change => { change.afterManifest.engines.node = "24"; },
    change => { change.afterLock.packages["node_modules/maplibre-gl"].version = "6.17.0"; },
    change => { change.afterLock.packages[""].dependencies.shared = "2.0.0"; },
    change => { change.afterLock.lockfileVersion = 2; },
    change => { change.afterLock.version = "2.0.0"; },
  ]) {
    const change = dependencyChange(); mutate(change);
    assert.throws(() => selectScope(withPackages, change));
  }
});

test("dependency exception preserves every preexisting lockfile entry", () => {
  for (const mutate of [
    change => { change.afterLock.packages["node_modules/shared"].version = "2.0.0"; },
    change => { change.afterLock.packages["node_modules/shared"].integrity = `sha512-${Buffer.alloc(64, 1).toString("base64")}`; },
    change => { change.afterLock.packages["node_modules/shared"].dev = true; },
    change => { delete change.afterLock.packages["node_modules/shared"]; },
  ]) {
    const change = dependencyChange(); mutate(change);
    assert.throws(() => selectScope(withPackages, change), /Preexisting lockfile entry changed/);
  }
});

test("dependency exception rejects unreachable additions and unresolved required dependencies", () => {
  const unrelated = dependencyChange();
  unrelated.afterLock.packages["node_modules/unrelated"] = packageEntry("unrelated", "1.0.0");
  assert.throws(() => selectScope(withPackages, unrelated), /outside the MapLibre dependency tree/);
  const unresolved = dependencyChange();
  delete unresolved.afterLock.packages["node_modules/leaf"];
  assert.throws(() => selectScope(withPackages, unresolved), /Missing dependency leaf/);
  const invalidPath = dependencyChange();
  invalidPath.afterLock.packages["node_modules/../unrelated"] = packageEntry("unrelated", "1.0.0");
  assert.throws(() => selectScope(withPackages, invalidPath), /Invalid added package path/);
});

test("new packages require exact registry tarballs, immutable versions and SHA-512 integrity", () => {
  for (const mutate of [
    entry => { entry.resolved = "https://example.test/leaf-1.0.0.tgz"; },
    entry => { entry.resolved = "https://registry.npmjs.org/leaf/-/leaf-2.0.0.tgz"; },
    entry => { entry.resolved += "?other=source"; },
    entry => { entry.integrity = "sha1-not-approved"; },
    entry => { delete entry.integrity; },
    entry => { entry.version = "latest"; },
    entry => { entry.link = true; },
  ]) {
    const change = dependencyChange(); mutate(change.afterLock.packages["node_modules/leaf"]);
    assert.throws(() => selectScope(withPackages, change));
  }
});

test("CLI validates dependency changes from the specified commits, not uncommitted manifests", () => {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const folder = fs.mkdtempSync(path.join(tempRoot, "provider-scope-"));
  const git = (...args) => execFileSync("git", args, { cwd: folder, encoding: "utf8", stdio: "pipe", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" } }).trim();
  const write = (file, value) => { const target = path.join(folder, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(value)); };
  try {
    const change = dependencyChange();
    git("init", "--quiet"); git("config", "user.name", "Synthetic scope test"); git("config", "user.email", "scope@example.test");
    write(venue, "base"); write("package.json", change.beforeManifest); write("package-lock.json", change.beforeLock);
    git("add", "--", venue, "package.json", "package-lock.json"); git("-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Synthetic base");
    const before = git("rev-parse", "HEAD");
    write(venue, "candidate"); write("package.json", change.afterManifest); write("package-lock.json", change.afterLock);
    git("add", "--", venue, "package.json", "package-lock.json"); git("-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Synthetic candidate");
    const after = git("rev-parse", "HEAD");
    write("package.json", { unrelated: "dirty working tree is not the committed candidate" });
    const run = (head = after) => execFileSync(process.execPath, [path.join(__dirname, "selectProviderHostingScope.cjs"), before, head], { cwd: folder, encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: "" } });
    assert.match(run(), /Hosting publication scope: venues/);
    assert.match(run("HEAD"), /Hosting publication scope: venues/);
    const bad = structuredClone(change.afterLock); bad.packages["node_modules/shared"].dev = true;
    write("package-lock.json", bad); git("add", "--", "package-lock.json"); git("-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Synthetic unrelated lock change");
    assert.throws(() => execFileSync(process.execPath, [path.join(__dirname, "selectProviderHostingScope.cjs"), before, git("rev-parse", "HEAD")], { cwd: folder, encoding: "utf8", stdio: "pipe", env: { ...process.env, GITHUB_OUTPUT: "" } }), /Preexisting lockfile entry changed/);
  } finally {
    assert.equal(path.dirname(fs.realpathSync(folder)), tempRoot, "Cleanup stays in the created temporary workspace");
    assert.match(path.basename(folder), /^provider-scope-/);
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
