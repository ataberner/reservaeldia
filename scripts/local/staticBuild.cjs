const fs = require("node:fs");
const path = require("node:path");
const contract = require("../../shared/firebaseEnvironment.cjs");

// Production optimization/export and production service access are independent.
// Both builds keep the launcher's empty credential home and network guard.
function buildEnvironment(env, target) {
  if (!["demo", "production-config"].includes(target)) throw new Error("Invalid build target");
  const result = { ...env, NODE_ENV: "production", CIRCLE_NODE_TOTAL: "2" };
  // Next 15.3.2 uses CIRCLE_NODE_TOTAL to bound static generation workers.
  // This only limits build workers; Functions invocation races stay concurrent.
  if (target === "production-config") {
    for (const key of Object.keys(result)) {
      if (key.includes("EMULATOR") || key.startsWith("NEXT_PUBLIC_FIREBASE_") || key === "NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST") delete result[key];
    }
    Object.assign(result, {
      RESERVA_FIREBASE_MODE: "prod", NEXT_PUBLIC_FIREBASE_MODE: "prod",
      GCLOUD_PROJECT: contract.PRODUCTION_CONFIG.projectId,
      GOOGLE_CLOUD_PROJECT: contract.PRODUCTION_CONFIG.projectId,
      FIREBASE_STORAGE_BUCKET: contract.PRODUCTION_CONFIG.storageBucket,
      FIREBASE_CONFIG: JSON.stringify({ projectId: contract.PRODUCTION_CONFIG.projectId, storageBucket: contract.PRODUCTION_CONFIG.storageBucket }),
    });
  }
  return result;
}

function recordBuild({ workspace, session, target }) {
  const { readLocalRelease } = require(path.join(workspace, "scripts/verifyNextStaticRelease.cjs"));
  const release = readLocalRelease(workspace);
  const evidence = { target, node: process.version, optimization: "production", export: true,
    buildId: release.buildId, htmlAssets: release.htmlAssetCount, staticFiles: release.staticFiles.length,
    deploymentArtifact: false, network: "non-loopback blocked; no credentials",
    limitation: target === "demo" ? "UI uses demo services; do not deploy this export" : "Compile/export only; remote configuration and services not validated" };
  fs.writeFileSync(path.join(session, "build-evidence.json"), JSON.stringify(evidence, null, 2));
  return evidence;
}
module.exports = { buildEnvironment, recordBuild };
