"use strict";

// Select only reviewed, bounded release scopes. Unknown changes accompanying a
// scoped page fail closed instead of falling back to a full-site publication.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const common = new Set([
  "docs/architecture/LANDING_DASHBOARD_STYLING_MAP.md",
  "scripts/prepareProviderPanelHosting.cjs", "scripts/prepareProviderPanelHosting.test.cjs",
  "scripts/selectProviderHostingScope.cjs", "scripts/selectProviderHostingScope.test.cjs",
  ".github/workflows/firebase-hosting-merge.yml", ".github/workflows/firebase-hosting-pull-request.yml",
  ".github/workflows/providers-private-candidate.yml",
]);
const panel = new Set([
  "src/components/admin/providers/ProviderDirectoryAdmin.jsx", "src/components/admin/providers/ProviderAdmin.module.css",
  "src/components/admin/providers/providerAdmin.test.mjs", "scripts/local/providerAdminSearch.browser.test.mjs",
  "deployment/provider-panel/README.md",
]);
const venues = new Set([
  "src/components/venues/VenuesLanding.jsx", "src/components/venues/VenuesLanding.module.css",
  "src/components/venues/VenueResultCard.jsx", "src/components/venues/VenueResultsMap.jsx",
  "src/components/venues/VenueResultsMap.module.css", "src/components/venues/VenueSearchForm.jsx",
  "src/components/venues/VenueMapBase.jsx", "src/components/venues/VenueMapBase.test.mjs", "src/components/venues/venueMapStyle.js",
  "src/components/venues/venueMapStyle.test.mjs", "src/components/venues/venueMapRuntime.js",
  "src/components/venues/VenuesLanding.test.mjs", "src/components/venues/venueMapModel.js",
  "src/components/venues/venueMapModel.test.mjs", "src/components/marketplace/useProviderDirectory.js",
  "src/components/marketplace/providerDirectory.test.mjs", "scripts/local/providerDirectory.browser.test.mjs",
  "scripts/local/evidence.cjs", "scripts/local/staticBuild.test.cjs", "scripts/local/serveExport.cjs",
  "src/components/appHeader/AppHeader.jsx", "src/components/marketplace/MarketplaceHeader.jsx",
  "src/components/marketplace/ProviderDirectoryDetail.jsx",
  "src/components/marketplace/MarketplaceHeaderNavigation.test.mjs",
  "functions/src/providers/directoryModel.ts", "functions/src/providers/directoryService.ts",
  "functions/src/providers/directoryRegions.ts", "functions/src/providers/directoryRegionLocalities.ts",
  "functions/src/providers/normalization.ts", "functions/providersDirectory.test.mjs",
  "docs/architecture/PROVIDER_DATA_MODEL.md", "docs/testing/PROVIDER_PRIVATE_DIRECTORY.md",
  "docs/operations/PROVIDER_BETA_PRIVATE_DEPLOYMENT.md",
  "deployment/venues/README.md",
]);

const dependencyFiles = ["package.json", "package-lock.json"];
const mapDependency = "maplibre-gl";
const mapVersion = "6.16.0";
const packageNamePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

function without(object, key) { const copy = { ...object }; delete copy[key]; return copy; }
function assertMapAddition(before, after, label) {
  assert.ok(before && after && before.dependencies && after.dependencies, `${label}: dependency manifests are required`);
  assert.ok(!Object.hasOwn(before.dependencies, mapDependency), `${label}: MapLibre must be a new dependency`);
  assert.equal(after.dependencies[mapDependency], mapVersion, `${label}: only exact MapLibre ${mapVersion} is approved`);
  assert.deepEqual({ ...after, dependencies: without(after.dependencies, mapDependency) }, before, `${label}: unrelated manifest changes are not approved`);
}

function dependencyPath(packages, from, name) {
  assert.match(name, packageNamePattern, "Invalid dependency name");
  let parent = from;
  while (parent) {
    const candidate = `${parent}/node_modules/${name}`;
    if (Object.hasOwn(packages, candidate)) return candidate;
    const index = parent.lastIndexOf("/node_modules/");
    parent = index < 0 ? "" : parent.slice(0, index);
  }
  const candidate = `node_modules/${name}`;
  return Object.hasOwn(packages, candidate) ? candidate : null;
}

function validateVenueDependencyChange(change) {
  assert.ok(change, "Scoped dependency changes require committed before/after manifests and lockfiles");
  const { beforeManifest, afterManifest, beforeLock, afterLock } = change;
  assertMapAddition(beforeManifest, afterManifest, "package.json");
  assert.equal(beforeLock?.lockfileVersion, 3, "The reviewed dependency change requires lockfile v3");
  assert.equal(afterLock?.lockfileVersion, 3, "The reviewed dependency change requires lockfile v3");
  assert.ok(beforeLock.packages && afterLock.packages, "Lockfile package inventories are required");
  assert.deepEqual(without(afterLock, "packages"), without(beforeLock, "packages"), "Unrelated lockfile metadata changed");
  assertMapAddition(beforeLock.packages[""], afterLock.packages[""], "lockfile root");
  assert.deepEqual(afterLock.packages[""].dependencies, afterManifest.dependencies, "Manifest and lockfile dependencies differ");
  for (const [key, entry] of Object.entries(beforeLock.packages)) {
    if (key !== "") assert.deepEqual(afterLock.packages[key], entry, `Preexisting lockfile entry changed: ${key}`);
  }
  const added = Object.keys(afterLock.packages).filter(key => !Object.hasOwn(beforeLock.packages, key));
  const root = `node_modules/${mapDependency}`;
  assert.ok(added.includes(root), "The lockfile must add the exact MapLibre package");
  assert.equal(afterLock.packages[root].version, mapVersion, "The locked MapLibre version differs from the approved version");
  for (const key of added) {
    assert.ok(key.startsWith("node_modules/"), `Invalid added package path: ${key}`);
    const names = key.slice("node_modules/".length).split("/node_modules/");
    for (const name of names) assert.match(name, packageNamePattern, `Invalid added package path: ${key}`);
    const name = names.at(-1), entry = afterLock.packages[key];
    assert.ok(entry && !entry.link, `Linked packages are not approved: ${key}`);
    assert.match(entry.version || "", /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, `Invalid locked version: ${key}`);
    assert.equal(entry.resolved, `https://registry.npmjs.org/${name}/-/${name.split("/").at(-1)}-${entry.version}.tgz`, `Unreviewed registry or mismatched tarball: ${key}`);
    assert.match(entry.integrity || "", /^sha512-[A-Za-z0-9+/]{86}==$/, `SHA-512 integrity is required: ${key}`);
  }
  const visited = new Set(), pending = [root];
  while (pending.length) {
    const key = pending.pop();
    if (visited.has(key)) continue;
    visited.add(key);
    const entry = afterLock.packages[key];
    const dependencies = { ...entry.peerDependencies, ...entry.dependencies, ...entry.optionalDependencies };
    for (const name of Object.keys(dependencies)) {
      const resolved = dependencyPath(afterLock.packages, key, name);
      const optional = Object.hasOwn(entry.optionalDependencies || {}, name) || (!Object.hasOwn(entry.dependencies || {}, name) && entry.peerDependenciesMeta?.[name]?.optional);
      assert.ok(resolved || optional, `Missing dependency ${name} from ${key}`);
      if (resolved) pending.push(resolved);
    }
  }
  for (const key of added) assert.ok(visited.has(key), `Added lockfile entry is outside the MapLibre dependency tree: ${key}`);
}

function selectScope(files, dependencyChange) {
  assert.ok(Array.isArray(files) && files.every(file => typeof file === "string" && file && !file.includes("\0")), "Invalid changed-file inventory");
  const hasPanel = files.some(file => ["src/components/admin/providers/ProviderDirectoryAdmin.jsx", "src/components/admin/providers/ProviderAdmin.module.css"].includes(file));
  const hasVenues = files.some(file => file.startsWith("src/components/venues/") || file === "src/pages/lugares.jsx");
  assert.ok(!(hasPanel && hasVenues), "Multiple scoped pages changed; reconcile the release explicitly");
  if (!hasPanel && !hasVenues) return "full";
  const allowed = hasPanel ? panel : venues;
  const changesDependencies = files.some(file => dependencyFiles.includes(file));
  if (hasVenues && changesDependencies) {
    assert.ok(dependencyFiles.every(file => files.includes(file)), "Scoped dependency changes require both package.json and package-lock.json");
    validateVenueDependencyChange(dependencyChange);
  }
  const unknown = files.filter(file => !common.has(file) && !allowed.has(file) && !(hasVenues && changesDependencies && dependencyFiles.includes(file)));
  assert.equal(unknown.length, 0, `Scoped publication includes unreviewed changes: ${unknown.join(", ")}`);
  return hasPanel ? "panel" : "venues";
}

function changedFiles(before, after = "HEAD") {
  assert.match(before || "", /^[a-f0-9]{40}$/, "A resolved base commit is required");
  assert.ok(after === "HEAD" || /^[a-f0-9]{40}$/.test(after), "A resolved head commit is required");
  execFileSync("git", ["cat-file", "-e", `${before}^{commit}`], { stdio: "pipe" });
  return execFileSync("git", ["diff", "--no-renames", "--name-only", "-z", before, after], { encoding: "utf8" }).split("\0").filter(Boolean);
}

function committedDependencyChange(before, after) {
  const read = (revision, file) => JSON.parse(execFileSync("git", ["show", `${revision}:${file}`], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }));
  return { beforeManifest: read(before, "package.json"), afterManifest: read(after, "package.json"), beforeLock: read(before, "package-lock.json"), afterLock: read(after, "package-lock.json") };
}

module.exports = { selectScope, changedFiles, validateVenueDependencyChange };
if (require.main === module) {
  try {
    assert.ok(process.argv.length === 3 || process.argv.length === 4, "Provide base and optional head commit");
    const before = process.argv[2], requestedHead = process.argv[3] || "HEAD";
    const after = requestedHead === "HEAD" ? execFileSync("git", ["rev-parse", "--verify", "HEAD"], { encoding: "utf8" }).trim() : requestedHead;
    const files = changedFiles(before, after);
    const dependencyChange = files.some(file => file.startsWith("src/components/venues/")) && files.some(file => dependencyFiles.includes(file)) ? committedDependencyChange(before, after) : undefined;
    const scope = selectScope(files, dependencyChange);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `scope=${scope}\n`);
    console.log(`Hosting publication scope: ${scope}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
