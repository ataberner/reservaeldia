const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { Processes } = require("./processes.cjs");

const ROOT = path.resolve(__dirname, "../..");
const TIMEOUT_MS = 60_000;
const GENERATED = new Set([".git", ".local-isolation", "node_modules", ".next", "out", "artifacts", "coverage", "dist", "build", ".cache", ".turbo"]);
// Auto-selection is deliberately small and reviewed. Test names alone do not
// establish that a test is cheap, offline, or safe against the current tree.
const CATALOG = [
  {
    test: "scripts/local/prepareLocal.test.cjs",
    sources: ["scripts/local/prepareLocal.cjs", "scripts/local/prepareLocal.test.cjs"],
  },
  {
    test: "scripts/local/quickVerification.test.cjs",
    sources: ["package.json", "scripts/local/quickVerification.cjs", "scripts/local/quickVerification.test.cjs"],
  },
  {
    test: "src/firebaseInitializationContract.test.mjs",
    sources: ["src/firebase.js", "src/config/initializeFirebaseServices.js", "src/firebaseInitializationContract.test.mjs"],
  },
  {
    test: "scripts/local/sessionCleanup.test.cjs",
    sources: ["scripts/local/sessionCleanup.cjs", "scripts/local/sessionCleanup.test.cjs", "scripts/local/session.cjs",
      "scripts/local/prepareLocal.cjs", "scripts/local/runLocal.cjs", "scripts/local/verifyNegative.cjs"],
  },
  {
    test: "scripts/local/sessionCopy.test.cjs",
    sources: ["scripts/local/session.cjs", "scripts/local/sessionCopy.test.cjs"],
  },
];

function parseArguments(args) {
  const options = { list: false, help: false, files: [] };
  for (const arg of args) {
    if (arg === "--list") options.list = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--") continue;
    else if (arg.startsWith("-")) throw new Error(`Opción desconocida: ${arg}`);
    else options.files.push(arg);
  }
  return options;
}

function checkedFile(root, input) {
  const absolute = path.resolve(root, input);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`El archivo debe estar dentro del repositorio: ${input}`);
  }
  const parts = relative.split(path.sep);
  if (parts.some(part => GENERATED.has(part) || part.startsWith(".next-")) ||
    /^(functions|functions-payments|functions-email)\/lib\//.test(parts.join("/"))) {
    throw new Error(`Salida regenerable excluida: ${input}`);
  }
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`No se siguen enlaces: ${input}`);
  }
  if (!fs.statSync(absolute).isFile()) throw new Error(`Se requiere un archivo, no un directorio: ${input}`);
  return relative.replace(/\\/g, "/");
}

function changedFiles(root, run = spawnSync) {
  const commands = [
    ["diff", "--no-ext-diff", "--no-textconv", "--name-only", "-z", "--diff-filter=ACMR"],
    ["diff", "--cached", "--no-ext-diff", "--no-textconv", "--name-only", "-z", "--diff-filter=ACMR"],
    ["ls-files", "--others", "--exclude-standard", "-z"],
  ];
  const files = [];
  for (const args of commands) {
    const result = run("git", args, { cwd: root, encoding: "utf8", windowsHide: true, timeout: TIMEOUT_MS });
    if (result.error || result.status !== 0) throw new Error("No se pudieron leer los cambios Git. Pasá archivos de test explícitos.");
    files.push(...result.stdout.split("\0").filter(Boolean));
  }
  return [...new Set(files)].sort();
}

function createPlan(root, options, changed = []) {
  if (options.files.length) {
    const tests = [...new Set(options.files.map(file => checkedFile(root, file)))];
    for (const file of tests) {
      if (!/\.test\.(?:cjs|mjs|js)$/.test(file)) throw new Error(`Seleccioná archivos .test.cjs/.test.mjs/.test.js: ${file}`);
    }
    return { explicit: true, syntax: [], tests, skipped: [] };
  }
  const syntax = [], skipped = [];
  for (const file of changed) {
    // Node cannot parse the project's JSX/TypeScript without its build tooling.
    if (!/\.(?:cjs|mjs)$/.test(file)) { skipped.push(file); continue; }
    try { syntax.push(checkedFile(root, file)); }
    catch (error) {
      if (error.code === "ENOENT" || /^Salida regenerable excluida:/.test(error.message)) skipped.push(file);
      else throw error;
    }
  }
  const selected = new Set(changed);
  const tests = CATALOG.filter(entry => entry.sources.some(file => selected.has(file)))
    .map(entry => checkedFile(root, entry.test));
  return { explicit: false, syntax: [...new Set(syntax)].sort(), tests, skipped };
}

async function executePlan(plan, root, owner = new Processes()) {
  const commands = plan.syntax.map(file => ["--check", file]);
  // Exact file arguments prevent Node's implicit all-tests discovery. Each file
  // is bounded separately, and explicit tests retain their own documented effects.
  for (const file of plan.tests) commands.push(["--test", "--test-concurrency=1", `--test-timeout=${TIMEOUT_MS}`, file]);
  let interrupted = false, stopping;
  const stop = () => { stopping ||= owner.stop(); return stopping; };
  const interrupt = () => { interrupted = true; stop().catch(() => {}); };
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, interrupt);
  try {
    for (const args of commands) {
      if (interrupted) throw new Error("Verificación rápida interrumpida.");
      await owner.run(args, { cwd: root, env: process.env, name: args.at(-1), timeoutMs: TIMEOUT_MS, kind: "tests" });
    }
    if (interrupted) throw new Error("Verificación rápida interrumpida.");
    return 0;
  } finally {
    for (const signal of ["SIGINT", "SIGTERM"]) process.removeListener(signal, interrupt);
    await stop();
  }
}

async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.help) {
    console.log("Uso: npm test -- [--list] [ruta/archivo.test.mjs ...]\nSin archivos: sintaxis .cjs/.mjs cambiada y catálogo acotado de tests.\nCon archivos: sólo los tests explícitos; revisar antes sus efectos y dependencias.\n--list muestra el plan sin ejecutar tests. Gate completo explícito: npm run verify:local.");
    return 0;
  }
  const plan = createPlan(ROOT, options, options.files.length ? [] : changedFiles(ROOT));
  console.log(`Verificación rápida: ${plan.syntax.length} archivos de sintaxis; ${plan.tests.length} archivos de test.`);
  for (const file of plan.syntax) console.log(`  syntax: ${file}`);
  for (const file of plan.tests) console.log(`  test: ${file}`);
  if (plan.skipped.length) console.log(`${plan.skipped.length} archivos fuera del chequeo sintáctico .cjs/.mjs; no se infiere cobertura de sus cambios.`);
  if (!plan.tests.length) console.log("Sin tests automáticos aplicables. Seleccioná archivos explícitos según el cambio.");
  console.log("Alcance parcial: no certifica CI, Rules, autenticación, pagos ni despliegue. No prepara herramientas ni entornos completos.");
  return options.list ? 0 : executePlan(plan, ROOT);
}

if (require.main === module) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(`Verificación rápida: ${error.message}`); process.exitCode = 1;
  });
}
module.exports = { parseArguments, checkedFile, changedFiles, createPlan, executePlan, main };
