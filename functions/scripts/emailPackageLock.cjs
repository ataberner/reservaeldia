// Offline projection of the existing lock: never resolve newer registry versions.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");

function projectLock(original, pkg) {
  const packages = { "": { name: pkg.name, dependencies: pkg.dependencies, engines: pkg.engines } };
  function resolve(from, name) {
    let directory = from;
    for (;;) {
      const candidate = [directory, "node_modules", name].filter(Boolean).join("/");
      if (original.packages[candidate]) return candidate;
      if (!directory) return undefined;
      directory = directory.includes("/node_modules/") ? directory.slice(0, directory.lastIndexOf("/node_modules/")) : "";
    }
  }
  function visit(from, name, optional = false) {
    const key = resolve(from, name);
    if (!key && optional) return;
    assert.ok(key, `Missing locked dependency: ${name}`);
    if (packages[key]) return;
    const entry = { ...original.packages[key] };
    assert.ok(!entry.link && !/^(file:|\.\.)/.test(entry.resolved || ""), "External package reference");
    delete entry.dev; delete entry.devOptional;
    packages[key] = entry;
    for (const dependency of Object.keys(entry.dependencies || {})) visit(key, dependency);
    for (const dependency of Object.keys(entry.optionalDependencies || {})) visit(key, dependency, true);
    for (const dependency of Object.keys(entry.peerDependencies || {})) visit(key, dependency, entry.peerDependenciesMeta?.[dependency]?.optional);
  }
  for (const [name, version] of Object.entries(pkg.dependencies)) {
    assert.equal(original.packages[`node_modules/${name}`]?.version, version, `Direct dependency changed: ${name}`);
    visit("", name);
  }
  return { name: pkg.name, lockfileVersion: 3, requires: true,
    packages: Object.fromEntries(Object.entries(packages).sort(([a], [b]) => a.localeCompare(b))) };
}
if (require.main === module) {
  const original = JSON.parse(fs.readFileSync(path.join(root, "functions/package-lock.json"), "utf8"));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "functions-email/package.json"), "utf8"));
  const lock = projectLock(original, pkg);
  fs.writeFileSync(path.join(root, "functions-email/package-lock.json"), JSON.stringify(lock, null, 2) + "\n");
  console.log(JSON.stringify({ packages: Object.keys(lock.packages).length - 1, registryRequests: 0 }));
}
module.exports = { projectLock };
