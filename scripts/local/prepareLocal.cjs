const fs = require("node:fs");
const path = require("node:path");
const { ROOT, cleanEnvironment, copyWorkspace } = require("./session.cjs");
const { Processes, failure } = require("./processes.cjs");
const { Evidence } = require("./evidence.cjs");

async function prepare() {
  if (process.argv.length !== 2) throw failure("local:prepare no acepta destinos ni credenciales", "prerequisite");
  const base = path.join(ROOT, ".local-isolation");
  fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, "prepared-"));
  const workspace = path.join(directory, "workspace");
  copyWorkspace(workspace);
  const env = cleanEnvironment(directory);
  // This explicit preparation is allowed public network access. Verification
  // never calls it. Personal npm/Firebase/Google/browser config stays excluded.
  delete env.NODE_OPTIONS;
  const cache = path.join(workspace, ".local-isolation/tool-cache");
  Object.assign(env, { npm_config_userconfig: path.join(directory, "empty.npmrc"), npm_config_globalconfig: path.join(directory, "empty-global.npmrc"),
    npm_config_cache: path.join(directory, "npm-cache"), npm_config_registry: "https://registry.npmjs.org",
    PUPPETEER_SKIP_DOWNLOAD: "true", PUPPETEER_CACHE_DIR: path.join(cache, "browser"), FIREBASE_EMULATORS_PATH: path.join(cache, "emulators") });
  for (const dir of [env.HOME, env.APPDATA, env.LOCALAPPDATA, env.XDG_CONFIG_HOME, env.CLOUDSDK_CONFIG, env.TEMP, env.FIREBASE_EMULATORS_PATH, env.PUPPETEER_CACHE_DIR]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(env.npm_config_userconfig, ""); fs.writeFileSync(env.npm_config_globalconfig, "");
  const npm = [path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
    path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js")].find(file => fs.existsSync(file));
  if (!npm) throw failure("Falta npm distribuido con Node", "prerequisite");
  const evidence = new Evidence(ROOT, "prepare", ["root-packages", "functions-packages", "tools-packages", "firestore-download", "storage-download", "chrome-download"]);
  evidence.data.workspace = workspace;
  const processes = new Processes();
  let error, interrupted = false;
  const onSignal = () => { interrupted = true; processes.stop().catch(e => { error = e; }); };
  process.once("SIGINT", onSignal); process.once("SIGTERM", onSignal);
  const run = (name, args, cwd = workspace) => evidence.stage(name, async log => {
    if (interrupted) throw failure("Preparación interrumpida", "interrupted");
    await processes.run(args, { cwd, env, name, log, timeoutMs: 600000, kind: "infrastructure" });
  });
  try {
    for (const [name, subdir] of [["root", ""], ["functions", "functions"], ["tools", "scripts/local/tools"]])
      await run(`${name}-packages`, [npm, "ci", "--no-audit", "--no-fund"], path.join(workspace, subdir));
    const cli = path.join(workspace, "scripts/local/tools/node_modules/firebase-tools/lib/bin/firebase.js");
    for (const service of ["firestore", "storage"])
      await run(`${service}-download`, [cli, `setup:emulators:${service}`, "--project", "demo-reservaeldia-local", "--non-interactive"]);
    delete env.PUPPETEER_SKIP_DOWNLOAD;
    await run("chrome-download", ["node_modules/puppeteer/lib/cjs/puppeteer/node/cli.js", "browsers", "install", "chrome"]);
  } catch (e) { error = e; }
  finally {
    try { await processes.stop(); } catch (e) { error = e; }
    process.removeListener("SIGINT", onSignal); process.removeListener("SIGTERM", onSignal);
    process.exitCode = evidence.finish(error);
  }
  if (!error) {
    fs.writeFileSync(path.join(directory, "prepared.json"), JSON.stringify({ owner: "reservaeldia-local", workspace, preparedAt: new Date().toISOString(), node: process.version }, null, 2));
    console.log(`Preparación terminada. Ejecutar: npm --prefix "${workspace}" run verify:local`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `workspace=${workspace}\n`);
  }
}
if (require.main === module) prepare().catch(error => { console.error(error.message); process.exitCode = 2; });
