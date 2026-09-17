// Existing regression tests exercise production config with mock providers and
// an empty credential home. The same network preload remains active throughout.
const { spawnSync } = require("node:child_process");
const env = { ...process.env, NODE_ENV: "production", RESERVA_FIREBASE_MODE: "prod", NEXT_PUBLIC_FIREBASE_MODE: "prod" };
for (const name of Object.keys(env)) {
  if ((name.includes("EMULATOR") && name !== "FIREBASE_EMULATORS_PATH") || ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT", "FIREBASE_CONFIG", "FIREBASE_STORAGE_BUCKET", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"].includes(name)) delete env[name];
}
const tests = ["renderContractCompatibility.test.mjs", "motionEffectsRenderCompatibility.test.mjs", "templateStorageAssets.test.mjs", "designerAiService.test.mjs"];
const result = spawnSync(process.execPath, ["--test", ...tests.map((name) => `functions/${name}`)], { cwd: process.cwd(), env, stdio: "inherit", windowsHide: true });
process.exitCode = result.status ?? 1;
