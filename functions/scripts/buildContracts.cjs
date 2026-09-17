const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { artifacts, syncTemplateContract, checkTemplateContract } = require("./syncTemplateContract.cjs");
const { Processes } = require("../../scripts/local/processes.cjs");

const functionsRoot = path.resolve(__dirname, "..");
const root = path.dirname(functionsRoot);

// Content polling survives editor replace/rename, new directories and missed OS
// notifications. Only inputs are observed; output writes cannot trigger a loop.
function inputFingerprint() {
  const files = new Set([...artifacts.map(a => a.sourcePath), path.join(functionsRoot, "tsconfig.json")]);
  const visit = directory => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isSymbolicLink()) throw new Error(`Watch no sigue enlaces de fuentes: ${file}`);
      if (item.isDirectory()) visit(file);
      else files.add(file);
    }
  };
  try { visit(path.join(functionsRoot, "src")); }
  catch (error) { files.add(`unreadable-src:${error.message}`); }
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(file);
    try { hash.update(fs.readFileSync(file)); }
    catch (error) { hash.update(`unavailable:${error.code}`); }
  }
  return hash.digest("hex");
}

async function buildContracts(watch) {
  const owner = new Processes();
  const base = path.join(root, ".local-isolation");
  fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, "contracts-build-"));
  let stopped = false, active = false, observed, attempted, changedAt = 0, cycle = 0, timer, pending, stoppingChildren;
  const stopChildren = () => {
    if (!stoppingChildren) stoppingChildren = owner.stop().finally(() => { stoppingChildren = undefined; });
    return stoppingChildren;
  };
  const state = (name, details = {}) => console.log(JSON.stringify({ component: "contracts-build", state: name, cycle, at: new Date().toISOString(), ...details }));
  let finish;
  const completed = new Promise(resolve => { finish = resolve; });
  const stop = async () => {
    if (stopped) return;
    stopped = true; clearInterval(timer);
    try {
      const processes = await stopChildren();
      if (pending) await pending;
      state("stopped", { processes });
    } catch (error) { state("error", { message: error.message }); process.exitCode = 1; }
    finally { finish(); }
  };
  // The programmatic entrypoint is also used by the bounded interruption test;
  // normal CLI users stop with Ctrl+C / SIGTERM.
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  const build = async fingerprint => {
    active = true; attempted = fingerprint; cycle++;
    const prefix = path.join(directory, String(cycle));
    try {
      state("syncing", { fingerprint });
      const sync = syncTemplateContract();
      fs.writeFileSync(`${prefix}-sync.json`, JSON.stringify(sync, null, 2));
      state("compiling", { changed: sync.changed, log: `${prefix}-tsc.log` });
      await owner.run([path.join(functionsRoot, "node_modules/typescript/bin/tsc"), "--project", path.join(functionsRoot, "tsconfig.json")],
        { cwd: functionsRoot, env: process.env, name: "contracts TypeScript", log: `${prefix}-tsc.log`, timeoutMs: 180000 });
      if (stopped) return;
      const check = checkTemplateContract();
      fs.writeFileSync(`${prefix}-check.json`, JSON.stringify(check, null, 2));
      if (inputFingerprint() !== fingerprint) {
        if (!watch) throw new Error("Entradas cambiaron durante build; volver a compilar.");
        state("pending", { message: "Entradas cambiaron durante compilación; falta otra pasada." });
      } else {
        if (!check.ok) throw new Error(`Copias inconsistentes: ${prefix}-check.json`);
        process.exitCode = 0;
        state("ready", { fingerprint, copies: check.copies.length, consumerReload: false });
      }
    } catch (error) {
      if (!stopped) {
        state("error", { message: error.message, log: `${prefix}-tsc.log`, recovery: watch ? "Corregir entradas o reiniciar tras reparar un destino; no está actualizado." : undefined });
        if (fs.existsSync(`${prefix}-tsc.log`)) process.stdout.write(fs.readFileSync(`${prefix}-tsc.log`, "utf8"));
        process.exitCode = 1;
      }
    } finally { await stopChildren(); active = false; }
  };
  try {
    state("observing", { tree: root, sources: artifacts.map(a => path.relative(root, a.sourcePath)), typescript: "functions/src/** + functions/tsconfig.json", directory });
    if (!watch) { pending = build(inputFingerprint()); await pending; return; }
    const tick = () => {
      if (stopped) return;
      const next = inputFingerprint();
      if (next !== observed) {
        observed = next; changedAt = Date.now();
        state("pending", { fingerprint: next });
      }
      if (!active && observed !== attempted && Date.now() - changedAt >= 200) {
        pending = build(observed);
        pending.catch(error => { state("error", { message: error.message }); process.exitCode = 1; stop(); });
      }
    };
    tick(); timer = setInterval(tick, 150);
    await completed;
  } finally {
    clearInterval(timer);
    await stopChildren();
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 1 || args[0] !== "--watch")) {
    console.error("Uso: buildContracts.cjs [--watch]"); process.exitCode = 1;
  } else buildContracts(args[0] === "--watch").catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { buildContracts };
