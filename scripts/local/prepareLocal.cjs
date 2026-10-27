const fs = require("node:fs");
const path = require("node:path");
const { ROOT, cleanEnvironment, copyWorkspace, assertNodeRuntime } = require("./session.cjs");
const { Processes, failure } = require("./processes.cjs");
const { Evidence } = require("./evidence.cjs");
const { registerSession, cleanupSession, assertNoLinkedAncestors } = require("./sessionCleanup.cjs");

function preserveReports(workspace, destination) {
  for (const name of ["reports", "ownership-evidence"]) {
    const source = path.join(workspace, ".local-isolation", name);
    if (!fs.existsSync(source)) continue;
    assertNoLinkedAncestors(source);
    fs.cpSync(source, name === "reports" ? destination : path.join(destination, "ownership"), { recursive: true, filter(file) {
      if (fs.lstatSync(file).isSymbolicLink()) throw new Error("No se preservan enlaces como evidencia");
      return true;
    } });
  }
}

function parsePreparationArguments(args) {
  if (args.length !== 1 || !["--verify", "--keep-workspace"].includes(args[0])) {
    throw failure("Preparación requiere una opción explícita: npm run verify:local:prepared (verificar y limpiar) o npm run local:prepare -- --keep-workspace (conservar para uso posterior). Sin destinos ni credenciales.", "prerequisite");
  }
  return { verify: args[0] === "--verify", keepWorkspace: args[0] === "--keep-workspace" };
}

async function prepare() {
  const { verify, keepWorkspace } = parsePreparationArguments(process.argv.slice(2));
  assertNodeRuntime();
  const base = path.join(ROOT, ".local-isolation");
  assertNoLinkedAncestors(base);
  fs.mkdirSync(base, { recursive: true });
  // npm validates its content-addressed download cache. Installed modules and
  // mutable browser/tool installations remain private to each explicit prepare.
  const npmCache = path.join(base, "npm-cache");
  assertNoLinkedAncestors(npmCache);
  let directory, workspace, receipt, error, interrupted = false, stopped = false, started = false;
  const processes = new Processes();
  const evidence = new Evidence(ROOT, "prepare", ["root-packages", "functions-packages", "tools-packages", "firestore-download", "storage-download", "chrome-download", ...(verify ? ["verify"] : [])]);
  const onSignal = () => { interrupted = true; processes.stop().catch(e => { error = e; }); };
  process.once("SIGINT", onSignal); process.once("SIGTERM", onSignal);
  try {
  directory = fs.mkdtempSync(path.join(base, "prepared-"));
  workspace = path.join(directory, "workspace");
  copyWorkspace(workspace);
  receipt = registerSession(directory, { root: ROOT, workspace });
  const env = cleanEnvironment(directory);
  // This explicit preparation is allowed public network access. Verification
  // never calls it. Personal npm/Firebase/Google/browser config stays excluded.
  delete env.NODE_OPTIONS;
  const cache = path.join(workspace, ".local-isolation/tool-cache");
  Object.assign(env, { npm_config_userconfig: path.join(directory, "empty.npmrc"), npm_config_globalconfig: path.join(directory, "empty-global.npmrc"),
    npm_config_cache: npmCache, npm_config_registry: "https://registry.npmjs.org",
    PUPPETEER_SKIP_DOWNLOAD: "true", PUPPETEER_CACHE_DIR: path.join(cache, "browser"), FIREBASE_EMULATORS_PATH: path.join(cache, "emulators") });
  for (const dir of [env.HOME, env.APPDATA, env.LOCALAPPDATA, env.XDG_CONFIG_HOME, env.CLOUDSDK_CONFIG, env.TEMP, env.FIREBASE_EMULATORS_PATH, env.PUPPETEER_CACHE_DIR]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(env.npm_config_userconfig, ""); fs.writeFileSync(env.npm_config_globalconfig, "");
  const npm = [path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
    path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js")].find(file => fs.existsSync(file));
  if (!npm) throw failure("Falta npm distribuido con Node", "prerequisite");
  evidence.data.workspace = workspace;
  const run = (name, args, cwd = workspace) => evidence.stage(name, async log => {
    if (interrupted) throw failure("Preparación interrumpida", "interrupted");
    started = true;
    await processes.run(args, { cwd, env, name, log, timeoutMs: name === "verify" ? 25 * 60000 : 600000, kind: name === "verify" ? "tests" : "infrastructure" });
  });
    for (const [name, subdir] of [["root", ""], ["functions", "functions"], ["tools", "scripts/local/tools"]])
      await run(`${name}-packages`, [npm, "ci", "--no-audit", "--no-fund"], path.join(workspace, subdir));
    const cli = path.join(workspace, "scripts/local/tools/node_modules/firebase-tools/lib/bin/firebase.js");
    for (const service of ["firestore", "storage"])
      await run(`${service}-download`, [cli, `setup:emulators:${service}`, "--project", "demo-reservaeldia-local", "--non-interactive"]);
    delete env.PUPPETEER_SKIP_DOWNLOAD;
    await run("chrome-download", ["node_modules/puppeteer/lib/cjs/puppeteer/node/cli.js", "browsers", "install", "chrome"]);
    if (verify) await run("verify", ["scripts/local/runLocal.cjs", "verify"]);
    if (interrupted) throw failure("Preparación interrumpida", "interrupted");
    if (keepWorkspace) {
      fs.writeFileSync(path.join(directory, "prepared.json"), JSON.stringify({ owner: "reservaeldia-local", workspace, preparedAt: new Date().toISOString(), node: process.version }, null, 2));
      console.log(`Preparación conservada para uso explícito. Ejecutar: npm --prefix "${workspace}" run verify:local`);
      console.log("Para una preparación temporal con limpieza al terminar: npm run verify:local:prepared");
      if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `workspace=${workspace}\n`);
    }
  } catch (e) { error = e; }
  finally {
    // A failed copy/setup cannot have spawned writers yet. Capture only this
    // invocation's partial directory so it can use the same guarded cleanup.
    if (!receipt && !started && directory) {
      try { receipt = registerSession(directory, { root: ROOT, workspace }); }
      catch (e) { error ||= e; }
    }
    try { await processes.stop(); stopped = true; } catch (e) { error = e; }
    try {
      if (workspace) preserveReports(workspace, path.join(evidence.directory, "verification"));
      if (receipt && (error || verify)) evidence.data.cleanup = cleanupSession(receipt, { stopped, evidenceDirectory: evidence.directory });
      else if (directory) evidence.data.cleanup = { status: "retained", reason: receipt ? "Explicit prepared workspace for later use" : "Preparation did not finish copying sources" };
    } catch (e) {
      error ||= e; evidence.data.cleanup = { status: "failed", message: e.message };
      if (receipt) cleanupSession(receipt, { stopped: false });
    }
    process.removeListener("SIGINT", onSignal); process.removeListener("SIGTERM", onSignal);
    process.exitCode = evidence.finish(error);
  }
}
if (require.main === module) prepare().catch(error => { console.error(error.message); process.exitCode = 2; });
module.exports = { prepare, preserveReports, parsePreparationArguments };
