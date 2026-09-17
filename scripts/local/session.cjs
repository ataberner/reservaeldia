const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const contract = require("../../shared/firebaseEnvironment.cjs");
const ROOT = path.resolve(__dirname, "../..");

function cleanEnvironment(session, inherited = process.env) {
  // Allowlist, not a credential-name blacklist. Also drops NODE_OPTIONS, proxies,
  // npm lifecycle variables, cloud/provider keys and personal Firebase config.
  const env = {};
  const allowed = new Set(["path", "systemroot", "windir", "comspec", "pathext", "java_home", "lang", "lc_all", "number_of_processors", "processor_architecture"]);
  for (const [key, value] of Object.entries(inherited)) if (allowed.has(key.toLowerCase())) env[key] = value;
  const inheritedPath = Object.entries(env).find(([key]) => key.toLowerCase() === "path")?.[1] || "";
  for (const key of Object.keys(env)) if (key.toLowerCase() === "path") delete env[key];
  env.PATH = [path.dirname(process.execPath), inheritedPath].filter(Boolean).join(path.delimiter);
  const home = path.join(session, "home");
  const temp = path.join(session, "tmp");
  Object.assign(env, {
    HOME: home, USERPROFILE: home, APPDATA: path.join(home, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(home, "AppData", "Local"), XDG_CONFIG_HOME: path.join(home, ".config"),
    CLOUDSDK_CONFIG: path.join(home, ".gcloud"), TEMP: temp, TMP: temp, TMPDIR: temp,
    CI: "true", NO_UPDATE_NOTIFIER: "1", FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true",
    // Cold discovery of the copied Functions tree can exceed CLI's 10s default.
    // Bounded local wait only; readiness probes and the handler allowlist remain.
    FUNCTIONS_DISCOVERY_TIMEOUT: "60",
    FIREBASE_CLI_DISABLE_USAGE_REPORTING: "true", NEXT_TELEMETRY_DISABLED: "1",
    FIREBASE_EMULATORS_PATH: path.join(session, "emulator-cache"),
    RESERVA_LOCAL_SESSION: session, RESERVA_FIREBASE_MODE: "emulators",
    NEXT_PUBLIC_FIREBASE_MODE: "emulators", NEXT_PUBLIC_FIREBASE_PROJECT_ID: contract.LOCAL_PROJECT,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: contract.LOCAL_BUCKET, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
    GCLOUD_PROJECT: contract.LOCAL_PROJECT, GOOGLE_CLOUD_PROJECT: contract.LOCAL_PROJECT,
    FIREBASE_STORAGE_BUCKET: contract.LOCAL_BUCKET,
    FIREBASE_CONFIG: JSON.stringify({ projectId: contract.LOCAL_PROJECT, storageBucket: contract.LOCAL_BUCKET }),
    FIREBASE_AUTH_EMULATOR_HOST: `${contract.HOST}:${contract.EMULATORS.auth}`,
    FIRESTORE_EMULATOR_HOST: `${contract.HOST}:${contract.EMULATORS.firestore}`,
    FIREBASE_STORAGE_EMULATOR_HOST: `${contract.HOST}:${contract.EMULATORS.storage}`,
    FIREBASE_FUNCTIONS_EMULATOR_HOST: `${contract.HOST}:${contract.EMULATORS.functions}`,
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: `${contract.HOST}:${contract.EMULATORS.auth}`,
    NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: `${contract.HOST}:${contract.EMULATORS.firestore}`,
    NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_HOST: `${contract.HOST}:${contract.EMULATORS.storage}`,
    NEXT_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_HOST: `${contract.HOST}:${contract.EMULATORS.functions}`,
    NODE_OPTIONS: `--require="${path.join(session, "workspace", "scripts", "local", "networkGuard.cjs").replace(/\\/g, "/")}"`,
  });
  return env;
}

function findFirebaseCli() {
  const result = path.join(ROOT, "scripts/local/tools/node_modules/firebase-tools/lib/bin/firebase.js");
  if (!fs.existsSync(result)) throw new Error("Falta Firebase CLI local fijada; ejecutar npm run local:prepare. No se usa CLI global ni npx/login.");
  return result;
}

async function assertPortsFree(ports) {
  for (const port of ports) {
    await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once("error", () => reject(new Error(`Puerto ${port} ocupado. No se reutilizan ni detienen procesos ajenos.`)));
      server.listen(port, "127.0.0.1", () => server.close(resolve));
    });
  }
}

function checkRequirements() {
  if (!['20', '22'].includes(process.versions.node.split('.')[0])) throw new Error("Usar Node 20 o 22 para este recorrido.");
  for (const relative of ["node_modules/next/dist/bin/next", "node_modules/firebase/package.json", "functions/node_modules/typescript/bin/tsc",
    "functions/node_modules/eslint/lib/api.js", "functions/node_modules/@typescript-eslint/parser/package.json", "functions/node_modules/@typescript-eslint/eslint-plugin/package.json"]) {
    if (!fs.existsSync(path.join(ROOT, relative))) throw new Error(`Falta dependencia instalada: ${relative}`);
  }
  const java = spawnSync("java", ["-version"], { encoding: "utf8", windowsHide: true, timeout: 10000,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => ["path", "systemroot", "java_home"].includes(key.toLowerCase()))) });
  if (java.status !== 0) throw new Error("Java no disponible; instalar JDK desde una fuente oficial.");
  const cli = findFirebaseCli();
  const firebase = JSON.parse(fs.readFileSync(path.resolve(cli, "../../../package.json"))).version;
  const expected = require("./tools/package.json").dependencies["firebase-tools"];
  if (firebase !== expected) throw new Error(`Firebase CLI debe ser ${expected}; repetir preparación con lockfile`);
  const cache = path.join(ROOT, ".local-isolation/tool-cache/emulators");
  const metadata = JSON.parse(fs.readFileSync(path.resolve(cli, "../../emulator/downloadableEmulatorInfo.json")));
  const jars = [];
  for (const [service, prefix] of [["firestore", "cloud-firestore-emulator"], ["storage", "cloud-storage-rules-runtime"]]) {
    const info = metadata[service], name = `${prefix}-v${info.version}.jar`, file = path.join(cache, name);
    if (!fs.existsSync(file) || fs.statSync(file).size !== info.expectedSize || createHash("md5").update(fs.readFileSync(file)).digest("hex") !== info.expectedChecksum)
      throw new Error(`JAR ausente/corrupto: ${name}; ejecutar local:prepare. No se descarga al verificar.`);
    jars.push(name);
  }
  const puppeteerRoot = path.join(ROOT, "node_modules/puppeteer");
  const revisions = require(path.join(ROOT, "node_modules/puppeteer-core/lib/cjs/puppeteer/revisions.js")).PUPPETEER_REVISIONS;
  const browsers = require(require.resolve("@puppeteer/browsers", { paths: [puppeteerRoot] }));
  const chrome = browsers.computeExecutablePath({ cacheDir: path.join(ROOT, ".local-isolation/tool-cache/browser"), browser: browsers.Browser.CHROME, buildId: revisions.chrome });
  if (!fs.existsSync(chrome)) throw new Error("Falta Chrome fijado por Puppeteer; ejecutar local:prepare. No hay fallback al navegador personal.");
  return { cli, cache, jars, chrome, node: process.version, java: java.stderr.split(/\r?\n/)[0], firebase,
    browser: revisions.chrome, emulators: Object.fromEntries(["firestore", "storage"].map(name => [name, metadata[name].version])) };
}

function validateInheritedDestinations(inherited = process.env) {
  const expected = cleanEnvironment(path.join(ROOT, ".local-isolation", "validation"), {});
  const keys = ["RESERVA_FIREBASE_MODE", "NEXT_PUBLIC_FIREBASE_MODE", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT", "FIREBASE_STORAGE_BUCKET", "FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST", "FIREBASE_FUNCTIONS_EMULATOR_HOST", ...Object.keys(expected).filter((key) => key.startsWith("NEXT_PUBLIC_FIREBASE_") || key === "NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST")];
  for (const key of new Set(keys)) {
    if (inherited[key] && inherited[key] !== expected[key]) throw new Error(`${key} incompatible con el recorrido demo; quitar el override antes de iniciar.`);
  }
  if (inherited.FIREBASE_CONFIG) {
    let config;
    try { config = JSON.parse(inherited.FIREBASE_CONFIG); } catch { throw new Error("FIREBASE_CONFIG heredada inválida; el recorrido usa JSON demo explícito."); }
    if (config.projectId !== contract.LOCAL_PROJECT || config.storageBucket !== contract.LOCAL_BUCKET) throw new Error("FIREBASE_CONFIG heredada incompatible con el demo.");
  }
  if (inherited.STORAGE_EMULATOR_HOST && inherited.STORAGE_EMULATOR_HOST !== `http://${expected.FIREBASE_STORAGE_EMULATOR_HOST}`) throw new Error("STORAGE_EMULATOR_HOST heredada incompatible.");
}

function copySourceTree(source, destination) {
  fs.cpSync(source, destination, { recursive: true, filter: (file) => {
    const name = path.basename(file);
    if (name === "node_modules") return false;
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error("No se copian enlaces de fuentes a destinos desconocidos.");
    return !name.startsWith(".env") && !name.startsWith(".secret") && name !== ".runtimeconfig.json" && name !== "firebase-key.json" && !name.endsWith(".pem");
  } });
}

function copyWorkspace(workspace) {
  fs.mkdirSync(workspace, { recursive: true });
  // Explicit source allowlist includes current uncommitted edits. No lib, exports,
  // backups, credential/config files or personal browser profiles are imported.
  for (const name of ["src", "shared", "styles", "scripts/local", ".github/workflows"]) {
    if (fs.existsSync(path.join(ROOT, name))) copySourceTree(path.join(ROOT, name), path.join(workspace, name));
  }
  // public/ also contains legacy invitations. Copy only application branding and
  // UI icons, never example invitations, photo libraries or public HTML records.
  for (const name of ["icons", "favicon_io", "favicon.ico", "assets/img/logo.svg", "assets/img/logo.png", "assets/img/logo_reservaeldia.png", "assets/img/wave-top.svg", "assets/img/wave-bottom.svg"]) {
    const source = path.join(ROOT, "public", name);
    if (fs.existsSync(source)) { fs.mkdirSync(path.dirname(path.join(workspace, "public", name)), { recursive: true }); copySourceTree(source, path.join(workspace, "public", name)); }
  }
  for (const source of require("../../functions/scripts/lintScope.cjs").functionsSources(ROOT)) {
    const destination = path.join(workspace, path.relative(ROOT, source));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    copySourceTree(source, destination);
  }
  for (const name of ["package.json", "package-lock.json", "next.config.mjs", "jsconfig.json", "postcss.config.cjs", "postcss.config.js", "postcss.config.mjs", "tailwind.config.js", "tailwind.config.mjs", "firestore.rules", "firestore.indexes.json", "storage.rules", "functions/package.json", "functions/package-lock.json", "functions/tsconfig.json", "scripts/runNextDev.cjs"]) {
    if (fs.existsSync(path.join(ROOT, name))) { fs.mkdirSync(path.dirname(path.join(workspace, name)), { recursive: true }); fs.copyFileSync(path.join(ROOT, name), path.join(workspace, name)); }
  }
}

function createSession(requirements) {
  const base = path.join(ROOT, ".local-isolation");
  fs.mkdirSync(base, { recursive: true });
  const session = fs.mkdtempSync(path.join(base, "session-"));
  const workspace = path.join(session, "workspace");
  fs.writeFileSync(path.join(session, "session.json"), JSON.stringify({ owner: "reservaeldia-local", pid: process.pid, project: contract.LOCAL_PROJECT, createdAt: new Date().toISOString() }, null, 2));
  copyWorkspace(workspace);
  const sources = {};
  function record(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) record(file);
      else sources[path.relative(workspace, file).replace(/\\/g, "/")] = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    }
  }
  record(workspace);
  fs.writeFileSync(path.join(session, "source-manifest.json"), JSON.stringify({ algorithm: "sha256", files: sources }, null, 2));
  for (const name of ["", "functions"]) fs.symlinkSync(path.join(ROOT, name, "node_modules"), path.join(workspace, name, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  fs.symlinkSync(path.join(ROOT, "scripts/local/tools/node_modules"), path.join(workspace, "scripts/local/tools/node_modules"), process.platform === "win32" ? "junction" : "dir");
  const env = cleanEnvironment(session);
  if (fs.existsSync(requirements.chrome)) env.RESERVA_TEST_CHROME = requirements.chrome;
  fs.writeFileSync(path.join(workspace, "scripts/local/sessionEnvironment.json"), JSON.stringify(env, null, 2));
  for (const directory of [env.HOME, env.APPDATA, env.LOCALAPPDATA, env.XDG_CONFIG_HOME, env.CLOUDSDK_CONFIG, env.TEMP, env.FIREBASE_EMULATORS_PATH]) fs.mkdirSync(directory, { recursive: true });
  for (const name of requirements.jars) fs.copyFileSync(path.join(requirements.cache, name), path.join(env.FIREBASE_EMULATORS_PATH, name));
  const config = {
    functions: [{ source: "functions", codebase: "default", runtime: "nodejs20" }],
    firestore: { rules: "firestore.rules", indexes: "firestore.indexes.json" }, storage: { rules: "storage.rules" },
    emulators: { ...Object.fromEntries(Object.entries(contract.EMULATORS).map(([name, port]) => [name, { host: contract.HOST, port }])),
      hub: { host: contract.HOST, port: 14400 }, logging: { host: contract.HOST, port: 14500 }, ui: { enabled: false }, singleProjectMode: true },
  };
  config.emulators.firestore.websocketPort = 19150;
  fs.writeFileSync(path.join(workspace, "firebase.local.json"), JSON.stringify(config, null, 2));
  // Evidence binds the emulator configuration to the current working-tree Rules.
  const ruleHashes = {};
  for (const name of ["firestore.rules", "storage.rules"]) {
    const source = fs.readFileSync(path.join(ROOT, name));
    const copied = fs.readFileSync(path.join(workspace, name));
    if (!source.equals(copied)) throw new Error(`Copia de Rules inconsistente: ${name}`);
    ruleHashes[name] = createHash("sha256").update(copied).digest("hex");
  }
  fs.writeFileSync(path.join(session, "rules-source.json"), JSON.stringify({ project: contract.LOCAL_PROJECT,
    bucket: contract.LOCAL_BUCKET, rules: ruleHashes, copiedAt: new Date().toISOString(),
    versions: { node: requirements.node, java: requirements.java, firebase: requirements.firebase } }, null, 2));
  const pkgFile = path.join(workspace, "functions/package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgFile));
  pkg.main = "../scripts/local/functionsEntry.cjs";
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2));
  // Module lookup from scripts/local needs the Functions dependency tree too.
  fs.symlinkSync(path.join(ROOT, "functions/node_modules"), path.join(workspace, "scripts/local/node_modules"), process.platform === "win32" ? "junction" : "dir");
  return { session, workspace, env };
}

function removeSession(target) {
  const absolute = path.resolve(target);
  const base = path.join(ROOT, ".local-isolation");
  if (path.dirname(absolute) !== base || !path.basename(absolute).startsWith("session-") || fs.lstatSync(absolute).isSymbolicLink()) throw new Error("Limpieza rechazada: destino fuera de una sesión propia.");
  const marker = JSON.parse(fs.readFileSync(path.join(absolute, "session.json")));
  if (marker.owner !== "reservaeldia-local" || marker.project !== contract.LOCAL_PROJECT) throw new Error("Limpieza rechazada: identidad de sesión inválida.");
  if (!marker.stopped) throw new Error("La sesión no registró detención; comprobar primero sus procesos.");
  // Keep the ownership marker until all contents are removed, so a permission
  // failure can be retried safely. fs.rm never follows dependency junctions.
  for (const name of fs.readdirSync(absolute)) {
    if (name !== "session.json") fs.rmSync(path.join(absolute, name), { recursive: true, force: true });
  }
  fs.unlinkSync(path.join(absolute, "session.json"));
  fs.rmdirSync(absolute);
}

module.exports = { ROOT, cleanEnvironment, findFirebaseCli, assertPortsFree, checkRequirements, validateInheritedDestinations, copyWorkspace, createSession, removeSession };
