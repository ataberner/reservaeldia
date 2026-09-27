// Reuse the local source copier, credential isolation and process supervisor.
// Build/discover all production entrypoints in a disposable copy, never invoke
// remote handlers or use the emulator-only package.main override.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { ROOT, copyWorkspace, cleanEnvironment, findFirebaseCli } = require("./session.cjs");
const { Processes } = require("./processes.cjs");
const { assertSourceConfigurationNames } = require("../../functions/testUtils/functionOwnership.cjs");

async function verify(cliRoot) {
  assertSourceConfigurationNames(ROOT);
  const cli = cliRoot || path.resolve(findFirebaseCli(), "../../..");
  assert.equal(require(path.join(cli, "package.json")).version, require("./tools/package.json").dependencies["firebase-tools"], "Use the pinned Firebase CLI");
  const base = path.join(ROOT, ".local-isolation");
  fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, "ownership-"));
  const workspace = path.join(directory, "workspace");
  copyWorkspace(workspace);
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
  const owner = new Processes();
  let interrupted = false;
  const stop = () => { interrupted = true; owner.stop().catch(() => { process.exitCode = 1; }); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  const run = async (args, name, cwd = workspace) => {
    if (interrupted) throw new Error("Ownership verification interrupted");
    await owner.run(args, { name, cwd, env, timeoutMs: 180000, kind: "tests" });
  };
  try {
    console.log(`Ownership workspace: ${workspace}`);
    for (const script of ["buildContracts.cjs", "buildPayments.cjs", "buildEmail.cjs"]) await run([`scripts/${script}`], script, path.join(workspace, "functions"));
    await run(["--test", "--test-reporter=tap", "--test-concurrency=1", ...[
      "functionOwnership.test.mjs", "paymentsPackage.test.mjs", "emailPackage.test.mjs",
      "runtimeConfiguration.test.mjs", "discoveryInitialization.test.mjs",
    ].map(name => `functions/${name}`)], "Functions ownership/package/configuration tests");
    for (const codebase of ["default", "payments", "email"]) {
      await run(["functions/scripts/verifyEmail.cjs", "discovery-child", codebase, cli], `CLI discovery ${codebase}`);
    }
    console.log("Ownership gate passed: three builds, registered manifest union, package/configuration tests and real CLI discovery; no remote operations.");
    return workspace;
  } finally {
    await owner.stop();
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  }
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--cli")) throw new Error("Usage: verifyFunctionsOwnership.cjs [--cli installed-pinned-cli-directory]");
  verify(args[1] && path.resolve(args[1])).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { verify };
