const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Processes } = require("../../scripts/local/processes.cjs");
const { artifacts } = require("./syncTemplateContract.cjs");

test("lint discovers new extensions, config, canonical sources and unmapped shared files", { timeout: 90000 }, async () => {
  const root = path.resolve(__dirname, "../.."), owner = new Processes();
  fs.mkdirSync(path.join(root, ".local-isolation"), { recursive: true });
  const fixture = fs.mkdtempSync(path.join(root, ".local-isolation/lint-scope-"));
  const write = (name, text) => {
    const file = path.join(fixture, name);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text);
  };
  for (const name of ["functions/.eslintrc.js", "functions/tsconfig.json", "functions/package.json", "functions/package-lock.json", "functions/scripts/lint.cjs", "functions/scripts/lintScope.cjs", "functions/scripts/syncTemplateContract.cjs"])
    write(name, fs.readFileSync(path.join(root, name)));
  for (const artifact of artifacts) {
    write(path.relative(root, artifact.sourcePath), fs.readFileSync(artifact.sourcePath));
    for (const target of artifact.targetPaths) write(path.relative(root, target), "debugger;\n");
  }
  const probes = {
    "functions/src/newProbe.ts": "export const probe = 1; debugger;\n",
    "functions/src/newView.tsx": "export const view = <div />; debugger;\n",
    "functions/newProbe.js": "module.exports = 1; debugger;\n",
    "functions/newProbe.cjs": "module.exports = 1; debugger;\n",
    "functions/newProbe.mjs": "export const probe = 1; debugger;\n",
    "functions/scripts/newProbe.ts": "export const probe = 1; debugger;\n",
    "functions/shared/unmapped.cjs": "module.exports = 1; debugger;\n",
    "functions/src/lib/maintained.ts": "export const probe = 1; debugger;\n",
  };
  for (const [name, text] of Object.entries(probes)) write(name, text);
  write("functions/src/importProbe.ts", 'export const probe = require("node:fs");\n');
  write("functions/src/unmappedImport.ts", 'export const probe = require("../shared/unmapped.cjs");\n');
  // Valid CommonJS syntax, forbidden by a lint rule; ESM would fail to parse it.
  fs.appendFileSync(path.join(fixture, "shared/firebaseEnvironment.cjs"), "\nwith (Math) { debugger; }\n");
  write("functions/lib/compiled.js", "debugger;\n");
  fs.symlinkSync(path.join(root, "functions/node_modules"), path.join(fixture, "functions/node_modules"), process.platform === "win32" ? "junction" : "dir");
  const reportFile = path.join(fixture, "report.json");
  try {
    await assert.rejects(owner.run(["scripts/lint.cjs", "--report", reportFile], {
      cwd: path.join(fixture, "functions"), env: process.env, log: path.join(fixture, "lint.log"), name: "lint coverage probes", timeoutMs: 60000,
    }), error => error.exitCode === 1);
    const report = JSON.parse(fs.readFileSync(reportFile));
    for (const name of Object.keys(probes)) {
      const result = report.files.find(file => file.file === name);
      assert.ok(result, `New source must be linted: ${name}`);
      assert.ok(result.messages.some(m => m.ruleId === "no-debugger" && m.severity === 2), name);
      assert.ok(!result.messages.some(m => m.ruleId === null), `Parser must accept ${name}`);
    }
    assert.ok(report.files.some(file => file.file === "functions/.eslintrc.js"));
    assert.ok(report.files.find(file => file.file === "functions/src/importProbe.ts").messages.some(m => m.ruleId === "@typescript-eslint/no-var-requires" && m.severity === 2));
    assert.ok(report.files.find(file => file.file === "functions/src/unmappedImport.ts").messages.some(m => m.ruleId === "@typescript-eslint/no-var-requires" && m.severity === 2));
    assert.ok(report.files.find(file => file.file === "shared/firebaseEnvironment.cjs").messages.some(m => m.ruleId === "no-debugger" && m.severity === 2));
    const canonical = report.files.find(file => file.file === "shared/firebaseEnvironment.cjs");
    assert.ok(canonical.messages.some(m => m.ruleId === "no-with"));
    assert.ok(!canonical.messages.some(m => m.ruleId === null), "Canonical CJS must parse as CommonJS, not strict ESM");
    assert.ok(!report.files.some(file => file.file.startsWith("functions/lib/")));
    for (const generated of report.generated) {
      assert.ok(!report.files.some(file => file.file === generated.file));
      assert.ok(report.files.some(file => file.file === generated.source));
    }
    assert.equal(report.generated.length, artifacts.length);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "functions/package.json"))).scripts.lint, "node scripts/lint.cjs", "Developer and launcher must use the same entrypoint");
  } finally { await owner.stop(); }
});
