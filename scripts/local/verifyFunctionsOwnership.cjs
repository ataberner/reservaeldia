// Reuse the local source copier, credential isolation and process supervisor.
// Build/discover all production entrypoints in a disposable copy, never invoke
// remote handlers or use the emulator-only package.main override.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { ROOT, copyWorkspace, cleanEnvironment, findFirebaseCli, assertNodeRuntime } = require("./session.cjs");
const { Processes } = require("./processes.cjs");
const { registerSession, cleanupSession, assertNoLinkedAncestors } = require("./sessionCleanup.cjs");
const { assertSourceConfigurationNames } = require("../../functions/testUtils/functionOwnership.cjs");

function preserveOwnershipArtifacts(workspace, evidenceDirectory) {
  const local = path.join(workspace, ".local-isolation");
  if (!fs.existsSync(local)) return;
  assertNoLinkedAncestors(local);
  const preserve = name => {
    const source = path.join(local, name);
    if (!fs.existsSync(source)) return;
    assertNoLinkedAncestors(source);
    if (!fs.lstatSync(source).isFile()) throw new Error(`Ownership evidence is not a regular file: ${name}`);
    const destination = path.join(evidenceDirectory, name);
    assertNoLinkedAncestors(destination);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  };
  for (const folder of ["email-codebase/manifests", "email-codebase/cli-manifests", "payments-activation/manifests"]) {
    for (const codebase of ["default", "payments", "email"]) preserve(`${folder}/${codebase}.json`);
  }
  // buildContracts owns these synthetic sync/check reports and TypeScript logs.
  for (const name of fs.readdirSync(local).filter(name => /^contracts-build-[^\\/]+$/.test(name))) {
    const directory = path.join(local, name);
    assertNoLinkedAncestors(directory);
    for (const file of fs.readdirSync(directory).filter(file => /^\d+-(?:(?:sync|check)\.json|tsc\.log)$/.test(file))) preserve(`${name}/${file}`);
  }
}

async function verify(cliRoot) {
  assertNodeRuntime();
  assertSourceConfigurationNames(ROOT);
  const cli = cliRoot || path.resolve(findFirebaseCli(), "../../..");
  assert.equal(require(path.join(cli, "package.json")).version, require("./tools/package.json").dependencies["firebase-tools"], "Use the pinned Firebase CLI");
  const base = path.join(ROOT, ".local-isolation");
  assertNoLinkedAncestors(base);
  fs.mkdirSync(base, { recursive: true });
  const evidenceBase = path.join(base, "ownership-evidence");
  assertNoLinkedAncestors(evidenceBase);
  fs.mkdirSync(evidenceBase, { recursive: true });
  const evidenceDirectory = fs.mkdtempSync(path.join(evidenceBase, "run-"));
  const directory = fs.mkdtempSync(path.join(base, "ownership-"));
  const workspace = path.join(directory, "workspace");
  const report = { mode: "functions-ownership", workspace, node: process.version, startedAt: new Date().toISOString(), status: "running", stages: [] };
  const save = () => fs.writeFileSync(path.join(evidenceDirectory, "result.json"), JSON.stringify(report, null, 2));
  const owner = new Processes();
  let interrupted = false, receipt, error, stopped = false, stopping, started = false;
  const stopOwned = () => { stopping ||= owner.stop(); return stopping; };
  const stop = () => { interrupted = true; stopOwned().catch(() => { process.exitCode = 1; }); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
  save();
  fs.writeFileSync(path.join(directory, "session.json"), JSON.stringify({ owner: "reservaeldia-local", pid: process.pid, kind: "ownership", createdAt: report.startedAt }));
  copyWorkspace(workspace);
  // Retain source identities, not another repository copy or credential home.
  // Record before dependency junctions/build outputs exist; never follow links.
  const sources = {};
  function record(directory) {
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name), stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error("Ownership source manifest refuses links");
      if (stat.isDirectory()) record(file);
      else sources[path.relative(workspace, file).replace(/\\/g, "/")] = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    }
  }
  record(workspace);
  fs.writeFileSync(path.join(evidenceDirectory, "source-manifest.json"), JSON.stringify({ algorithm: "sha256", files: sources }, null, 2));
  // Both projected package locks are subsets of functions/package-lock.json.
  // Reuse that prepared installation, as the regular local session does. Package
  // tests verify lock parity; this gate is not an autonomous dependency install.
  for (const source of ["functions", "functions-payments", "functions-email"]) {
    fs.symlinkSync(path.join(ROOT, "functions/node_modules"), path.join(workspace, source, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  }
  const env = cleanEnvironment(directory);
  for (const key of Object.keys(env)) {
    if (key.includes("EMULATOR") || key.startsWith("NEXT_PUBLIC_FIREBASE_") ||
      ["RESERVA_LOCAL_SESSION", "FIREBASE_CONFIG", "FIREBASE_STORAGE_BUCKET", "FUNCTIONS_DISCOVERY_TIMEOUT"].includes(key)) delete env[key];
  }
  Object.assign(env, { NODE_ENV: "production", RESERVA_FIREBASE_MODE: "prod", NEXT_PUBLIC_FIREBASE_MODE: "prod",
    GCLOUD_PROJECT: "reservaeldia-7a440", GOOGLE_CLOUD_PROJECT: "reservaeldia-7a440", EMAIL_MODE: "sandbox" });
  // Project identity resolves Auth v1 metadata only. Every child has an empty
  // credential home and blocked non-loopback network; no dotenv is loaded.
  for (const key of ["HOME", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "CLOUDSDK_CONFIG", "TEMP"]) fs.mkdirSync(env[key], { recursive: true });
  // Ownership builds deliberately repair mapped copies inside this disposable
  // tree (including the stale-copy negative control). Protect their canonical
  // sources, not generated bytes, using the existing authoritative mapping.
  const generatedFiles = require("../../functions/scripts/syncTemplateContract.cjs").artifacts
    .flatMap(artifact => artifact.targetPaths).map(file => path.relative(ROOT, file));
  receipt = registerSession(directory, { root: ROOT, workspace, generatedFiles });
  const run = async (args, name, cwd = workspace) => {
    if (interrupted) throw new Error("Ownership verification interrupted");
    const stage = { name, status: "running", startedAt: new Date().toISOString() };
    report.stages.push(stage); save();
    try { started = true; await owner.run(args, { name, cwd, env, timeoutMs: 180000, kind: "tests" }); stage.status = "passed"; }
    catch (cause) { stage.status = "failed"; stage.error = cause.message; throw cause; }
    finally { stage.finishedAt = new Date().toISOString(); save(); }
  };
    console.log(`Ownership workspace: ${workspace}`);
    for (const script of ["buildContracts.cjs", "buildPayments.cjs", "buildEmail.cjs"]) await run([`scripts/${script}`], script, path.join(workspace, "functions"));
    await run(["--test", "--test-reporter=tap", "--test-concurrency=1", ...[
      "functionOwnership.test.mjs", "paymentsPackage.test.mjs", "emailPackage.test.mjs",
      "runtimeConfiguration.test.mjs", "discoveryInitialization.test.mjs",
    ].map(name => `functions/${name}`)], "Functions ownership/package/configuration tests");
    for (const codebase of ["default", "payments", "email"]) {
      await run(["functions/scripts/verifyEmail.cjs", "discovery-child", codebase, cli], `CLI discovery ${codebase}`);
    }
    if (interrupted) throw new Error("Ownership verification interrupted");
    console.log("Ownership gate passed: three builds, registered manifest union, package/configuration tests and real CLI discovery; no remote operations.");
  } catch (cause) {
    error = cause;
  } finally {
    if (!receipt && !started) {
      try { receipt = registerSession(directory, { root: ROOT, workspace }); }
      catch (cause) { error ||= cause; }
    }
    try { await stopOwned(); stopped = true; } catch (cause) { error ||= cause; }
    report.status = error ? "failed" : "passed";
    if (error) report.error = error.message;
    report.finishedAt = new Date().toISOString();
    try {
      // Save the result before requesting deletion; failed evidence writes retain
      // the owned snapshot. The parent gate already captures stdout diagnostics.
      preserveOwnershipArtifacts(workspace, evidenceDirectory);
      save();
      report.cleanup = receipt ? cleanupSession(receipt, { stopped, evidenceDirectory }) :
        { status: "retained", reason: "Source setup did not finish; no cleanup receipt" };
      save();
      console.log(`Ownership cleanup: ${report.cleanup.status}${report.cleanup.reason ? ` (${report.cleanup.reason})` : ""}; evidence: ${evidenceDirectory}`);
    } catch (cause) {
      error ||= cause;
      // Missing/partial evidence must retain the child even when a parent later
      // tries to clean its prepared workspace. This also writes the preserve marker.
      if (receipt && report.cleanup?.status !== "removed") report.cleanup = cleanupSession(receipt, { stopped });
    }
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  }
  if (error) throw error;
  return workspace;
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--cli")) throw new Error("Usage: verifyFunctionsOwnership.cjs [--cli installed-pinned-cli-directory]");
  verify(args[1] && path.resolve(args[1])).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { verify };
