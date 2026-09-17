const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { ESLint } = require("eslint");
const { extensions, lintScope } = require("./lintScope.cjs");

async function lint(reportFile = path.resolve(__dirname, "../../.local-isolation/lint-evidence.json")) {
  const functionsRoot = path.resolve(__dirname, ".."), root = path.dirname(functionsRoot);
  const relative = file => path.relative(root, file).replace(/\\/g, "/");
  const hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const report = { startedAt: new Date().toISOString(), command: "npm --prefix functions run lint", cwd: functionsRoot,
    node: process.version, versions: Object.fromEntries(["eslint", "@typescript-eslint/parser", "@typescript-eslint/eslint-plugin", "typescript"]
      .map(name => [name, require(`${name}/package.json`).version])), extensions, fix: false, cache: false };
  let exitCode;
  try {
    const scope = lintScope(root);
    report.configuration = Object.fromEntries([".eslintrc.js", "tsconfig.json", "package.json", "package-lock.json", "scripts/lint.cjs", "scripts/lintScope.cjs", "scripts/syncTemplateContract.cjs"]
      .map(name => [`functions/${name}`, hash(path.join(functionsRoot, name))]));
    const options = { cwd: functionsRoot, overrideConfigFile: path.join(functionsRoot, ".eslintrc.js"),
      useEslintrc: false, ignore: false, fix: false, cache: false, errorOnUnmatchedPattern: true, reportUnusedDisableDirectives: "error" };
    const eslint = new ESLint(options);
    // Config-file overrides are relative to functions/. Canonical CJS sources
    // live outside that directory: reuse the same rules with their parser mode.
    const canonicalCjs = new Set(scope.canonical.filter(file => file.endsWith(".cjs")));
    const results = await eslint.lintFiles(scope.files.filter(file => !canonicalCjs.has(file)));
    if (canonicalCjs.size) {
      const cjs = new ESLint({ ...options, overrideConfig: { parserOptions: { sourceType: "script" } } });
      results.push(...await cjs.lintFiles([...canonicalCjs]));
    }
    results.sort((a, b) => a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0);
    const actual = results.map(result => result.filePath).sort();
    if (!actual.length || JSON.stringify(actual) !== JSON.stringify(scope.files)) throw new Error("Lint coverage is empty or incomplete");
    const formatter = await eslint.loadFormatter("stylish");
    const output = formatter.format(results);
    if (output) console.log(output);
    report.generated = scope.generated.map(({ file, source }) => ({ file: relative(file), source: relative(source), generator: "functions/scripts/syncTemplateContract.cjs" }));
    report.files = results.map(result => ({ file: relative(result.filePath), sha256: hash(result.filePath), errors: result.errorCount, warnings: result.warningCount,
      messages: result.messages.map(({ ruleId, severity, message, line, column, endLine, endColumn }) => ({ ruleId, severity, message, line, column, endLine, endColumn })) }));
    report.errors = results.reduce((sum, result) => sum + result.errorCount, 0);
    report.warnings = results.reduce((sum, result) => sum + result.warningCount, 0);
    report.byRule = {};
    for (const file of report.files) for (const message of file.messages) {
      const count = report.byRule[message.ruleId || "parser"] ||= { errors: 0, warnings: 0 };
      count[message.severity === 2 ? "errors" : "warnings"]++;
    }
    exitCode = report.errors ? 1 : 0;
    console.log(`Lint: ${actual.length} files, ${report.errors} errors, ${report.warnings} warnings.`);
  } catch (error) {
    report.failure = error.message;
    console.error(error);
    exitCode = 2;
  } finally {
    Object.assign(report, { exitCode, finishedAt: new Date().toISOString() });
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`Lint evidence: ${reportFile}`);
  }
  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--report")) {
    console.error("Usage: npm run lint [-- --report <path>]; fix, cache and quiet are not supported.");
    process.exitCode = 2;
  } else lint(args[1] && path.resolve(args[1])).then(report => { process.exitCode = report.exitCode; })
    .catch(error => { console.error(error); process.exitCode = 2; });
}
module.exports = { lint };
