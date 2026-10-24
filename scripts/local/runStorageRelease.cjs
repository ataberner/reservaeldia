// Isolated, demo-only test runner. Never reads remote evidence/credentials or deploys.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { ROOT, cleanEnvironment, createSocketEnvironment, assertPortsFree, checkRequirements,
  validateInheritedDestinations } = require("./session.cjs");
const { Processes } = require("./processes.cjs");
const contract = require("../../shared/firebaseEnvironment.cjs");
const ports = [18080, 19199, 14400, 14500, 19150];
const hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const processes = new Processes();
let socketEnvironment, current, stopping;

function selectedModes(args) {
  if (args.length === 0) return ["base", "candidate"];
  if (args.length === 1 && args[0] === "--firestore-assets") return ["firestore-assets"];
  throw new Error("runner_accepts_only_fixed_firestore_assets_mode");
}

async function stop() {
  if (stopping) return stopping;
  stopping = (async () => {
    const stopped = await processes.stop();
    socketEnvironment?.cleanup(); socketEnvironment = undefined;
    await assertPortsFree(ports);
    if (current) {
      const markerPath = path.join(current.session, "session.json");
      const marker = JSON.parse(fs.readFileSync(markerPath));
      fs.writeFileSync(markerPath, JSON.stringify({ ...marker, stopped: new Date().toISOString(), processes: stopped }, null, 2));
    }
  })();
  return stopping;
}

function prepare(mode, requirements, artifact, firestoreArtifact) {
  const parent = path.join(ROOT, ".local-isolation"); fs.mkdirSync(parent, { recursive: true });
  const session = fs.mkdtempSync(path.join(parent, "storage-release-"));
  const workspace = path.join(session, "workspace");
  fs.mkdirSync(workspace);
  const files = ["scripts/local/storageReleaseRules.test.mjs", "scripts/local/storageReleaseArtifact.mjs", "scripts/local/runStorageRelease.cjs",
    "scripts/local/session.cjs", "scripts/local/processes.cjs", "scripts/local/tools/package.json", "package-lock.json", "functions/package-lock.json",
    "scripts/local/networkGuard.cjs", "shared/firebaseEnvironment.cjs", "functions/package.json",
    ...["base.rules", "storage.rules", "manifest.json", "firebase.json"].map(f => `deployment/storage-draft-provider/${f}`)];
  if (mode === "firestore-assets") files.push("firestore.rules", "scripts/local/firestoreAssetReleaseArtifact.mjs", "scripts/local/firestoreAssetReleaseRules.test.mjs",
    ...["base.rules", "firestore.rules", "manifest.json", "firebase.json"].map(f => `deployment/render-asset-firestore/${f}`));
  const sources = {};
  for (const file of files) {
    const dest = path.join(workspace, file); fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), dest); sources[file] = hash(dest);
  }
  for (const dir of ["", "functions"]) fs.symlinkSync(path.join(ROOT, dir, "node_modules"), path.join(workspace, dir, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const env = cleanEnvironment(session);
  env.RESERVA_STORAGE_ARTIFACT_MODE = mode;
  // Supported by the pinned gcp-metadata dependency: do not probe the metadata
  // server while constructing emulator fixture clients. Socket guard stays on.
  env.METADATA_SERVER_DETECTION = "none";
  // Only the two required emulators run; no Auth/Functions discovery or triggers.
  env.JAVA_TOOL_OPTIONS = "-Xms64m -Xmx384m";
  for (const dir of [env.HOME, env.APPDATA, env.LOCALAPPDATA, env.XDG_CONFIG_HOME, env.CLOUDSDK_CONFIG, env.TEMP, env.FIREBASE_EMULATORS_PATH]) fs.mkdirSync(dir, { recursive: true });
  for (const jar of requirements.jars) fs.copyFileSync(path.join(requirements.cache, jar), path.join(env.FIREBASE_EMULATORS_PATH, jar));
  if (mode !== "firestore-assets") fs.writeFileSync(path.join(workspace, "firestore.fixture.rules"), "rules_version = '2';\nservice cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }\n");
  const config = { firestore: { rules: mode === "firestore-assets" ? "deployment/render-asset-firestore/firestore.rules" : "firestore.fixture.rules" },
    storage: { rules: `deployment/storage-draft-provider/${mode === "base" ? "base.rules" : "storage.rules"}` },
    emulators: { firestore: { host: "127.0.0.1", port: 18080, websocketPort: 19150 }, storage: { host: "127.0.0.1", port: 19199 },
      hub: { host: "127.0.0.1", port: 14400 }, logging: { host: "127.0.0.1", port: 14500 }, ui: { enabled: false }, singleProjectMode: true } };
  fs.writeFileSync(path.join(workspace, "firebase.local.json"), JSON.stringify(config, null, 2));
  sources["firebase.local.json"] = hash(path.join(workspace, "firebase.local.json"));
  sources[config.firestore.rules] = hash(path.join(workspace, config.firestore.rules));
  fs.writeFileSync(path.join(session, "source-manifest.json"), JSON.stringify({ artifact, firestoreArtifact, sources, mode, versions: {
    node: requirements.node, firebase: requirements.firebase, java: requirements.java, emulators: requirements.emulators,
    firebaseClient: require(path.join(ROOT, "node_modules/firebase/package.json")).version,
    firebaseAdmin: require(path.join(ROOT, "functions/node_modules/firebase-admin/package.json")).version } }, null, 2));
  fs.writeFileSync(path.join(session, "session.json"), JSON.stringify({ owner: "reservaeldia-storage-release", project: contract.LOCAL_PROJECT,
    bucket: contract.LOCAL_BUCKET, pid: process.pid, mode, createdAt: new Date().toISOString() }, null, 2));
  return { session, workspace, env };
}

async function ready(child) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (child.done) throw new Error("emulators_stopped_before_ready");
    try {
      const status = await (await fetch("http://127.0.0.1:14400/emulators", { signal: AbortSignal.timeout(1000) })).json();
      if (status.firestore?.port === 18080 && status.storage?.port === 19199) return;
    } catch { /* bounded local readiness */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("emulators_not_ready");
}

async function main() {
  const modes = selectedModes(process.argv.slice(2));
  const firestoreAssets = modes[0] === "firestore-assets";
  validateInheritedDestinations();
  const { validateArtifact } = await import("./storageReleaseArtifact.mjs");
  const artifact = validateArtifact(), requirements = checkRequirements();
  const firestoreArtifact = firestoreAssets ? (await import("./firestoreAssetReleaseArtifact.mjs")).validateFirestoreAssetArtifact() : undefined;
  for (const mode of modes) {
    stopping = undefined; current = undefined;
    await assertPortsFree(ports);
    current = prepare(mode, requirements, artifact, firestoreArtifact);
    const { workspace, env, session } = current;
    console.log(JSON.stringify({ mode, session, project: contract.LOCAL_PROJECT, bucket: contract.LOCAL_BUCKET, credentials: "none" }));
    try {
      socketEnvironment = createSocketEnvironment(env);
      const child = processes.start([requirements.cli, "emulators:start", "--config", "firebase.local.json", "--project", contract.LOCAL_PROJECT,
        "--only", "firestore,storage", "--non-interactive"], { cwd: workspace, env: socketEnvironment.env, log: path.join(session, "emulators.log"), name: `${mode}-emulators` });
      await ready(child);
      const suite = firestoreAssets ? "scripts/local/firestoreAssetReleaseRules.test.mjs" : "scripts/local/storageReleaseRules.test.mjs";
      await processes.run(["--test", "--test-concurrency=1", "--test-reporter=tap", suite], {
        cwd: workspace, env, log: path.join(session, "tests.tap"), name: `${mode}-rules`, timeoutMs: 300000, kind: "tests" });
      const result = JSON.parse(fs.readFileSync(path.join(session, "rules-results.json")));
      if (result.failed || !result.passed || result.passed !== result.expectedCases || result.infrastructureError || result.cleanupFailures || result.blockedNetworkAttempts) throw new Error("incomplete_rules_evidence");
      console.log(JSON.stringify({ mode, passed: result.passed, failed: result.failed, session }));
    } finally { await stop(); }
  }
}
module.exports = { selectedModes };

if (require.main === module) {
  let interrupted = false;
  const interrupt = () => { interrupted = true; stop().catch(() => {}).finally(() => { process.exitCode = 1; }); };
  process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
  const timer = setTimeout(interrupt, 12 * 60000);
  main().catch(error => { console.error(`Storage artifact test failed: ${error.message}`); process.exitCode = 1; })
    .finally(async () => { clearTimeout(timer); try { await stop(); } catch { console.error("Owned emulator shutdown unconfirmed"); process.exitCode = 1; } if (interrupted) process.exitCode = 1; });
}
