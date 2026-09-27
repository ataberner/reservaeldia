// Offline predeploy: no credentials, dotenv, network, builds or remote mutation.
const { assertDeployReady } = require("../testUtils/functionOwnership.cjs");

try {
  if (process.argv.length !== 3) throw new Error("Usage: node functions/scripts/checkDeployReadiness.cjs <codebase>");
  assertDeployReady(process.argv[2]);
  console.log(`No registered deploy blockers: ${process.argv[2]} (not a remote parity check)`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
