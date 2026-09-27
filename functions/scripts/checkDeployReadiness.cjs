// Offline predeploy: dotenv names only; no value injection, credentials, network,
// builds or remote mutation.
const path = require("node:path");
const { assertDeployReady, assertSourceConfigurationNames } = require("../testUtils/functionOwnership.cjs");

try {
  if (process.argv.length !== 3) throw new Error("Usage: node functions/scripts/checkDeployReadiness.cjs <codebase>");
  assertDeployReady(process.argv[2]);
  assertSourceConfigurationNames(path.resolve(__dirname, "../.."), [process.argv[2]]);
  console.log(`No registered deploy blockers: ${process.argv[2]} (not a remote parity check)`);
  console.log(`Dotenv configuration names allowed: ${process.argv[2]} (values not loaded)`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
