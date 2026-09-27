// Offline comparison of allowlisted metadata captures; never invokes a Function.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { smokeNames } = require("../testUtils/emailManifest.cjs");

function compareMetadata(baseline, current, migrated) {
  assert.ok(migrated.every(name => smokeNames.includes(name)), "Unexpected migrated Function name");
  assert.equal(current.project, baseline.project);
  assert.deepEqual(current.functions.map(fn => fn.name).sort(), baseline.functions.map(fn => fn.name).sort());
  for (const before of baseline.functions) {
    const after = current.functions.find(fn => fn.name === before.name);
    const name = before.buildConfig.entryPoint;
    // Error output reports only field/Function names, never raw metadata payloads.
    for (const field of ["environment", "url", "trigger", "buildConfig", "invoker"]) {
      assert.ok(JSON.stringify(after[field]) === JSON.stringify(before[field]), `${name}: changed ${field}`);
    }
    for (const field of Object.keys(before.serviceConfig)) {
      const sortSecrets = value => field === "secretEnvironmentVariables" ? [...value].sort((a, b) => a.key.localeCompare(b.key)) : value;
      assert.ok(JSON.stringify(sortSecrets(after.serviceConfig[field])) === JSON.stringify(sortSecrets(before.serviceConfig[field])), `${name}: changed serviceConfig.${field}`);
    }
    const codebase = after.labels["firebase-functions-codebase"] || "default";
    assert.equal(codebase, migrated.includes(name) ? "email" : "default", `${name}: unexpected codebase ownership`);
  }
  return { endpoints: 2, metadataUnchanged: true, expectedOwnership: true, migrated, secretVersionsUnchanged: true };
}

if (require.main === module) {
  try {
    const baseline = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), "utf8"));
    const current = JSON.parse(fs.readFileSync(path.resolve(process.argv[3]), "utf8"));
    console.log(JSON.stringify(compareMetadata(baseline, current, (process.argv[4] || "").split(",").filter(Boolean))));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, check: error.name === "AssertionError" ? error.message : "Metadata comparison failed; raw data omitted" }));
    process.exitCode = 1;
  }
}
module.exports = { compareMetadata };
