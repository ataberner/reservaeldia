// Copied as the emulator package entry; production keeps lib/index.js.
// CLI 14 discovery strips most inherited variables. Restore only the generated,
// credential-free session configuration before importing any application module.
const sessionEnvironment = require("./sessionEnvironment.json");
for (const [name, value] of Object.entries(sessionEnvironment)) {
  if (process.env[name] === undefined) process.env[name] = value;
}
require("./networkGuard.cjs");
const { localBackendEnvironment } = require("../../functions/lib/firebaseAdmin.js");
if (!localBackendEnvironment()) throw new Error("La entrada local requiere el entorno demo.");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const handlers = require("../../functions/lib/index.js");

// Only handlers whose effects have been inspected are enabled. New exports fail
// closed until explicitly reviewed. No schedulers or event triggers are registered.
const enabled = new Set([
  "upsertUserProfile", "getMyProfileStatus", "getMyUiPreferences", "updateMyUiPreferences",
  "getPricingConfigV1", "getDashboardHomeConfigV1",
]);
for (const [name, handler] of Object.entries(handlers)) {
  const endpoint = handler?.__endpoint;
  if (!endpoint?.callableTrigger && !endpoint?.httpsTrigger) continue;
  if (enabled.has(name)) {
    exports[name] = onCall({ region: "us-central1", cors: ["http://localhost:3100", "http://127.0.0.1:3100"] }, handler.run);
    continue;
  }
  const message = `LOCAL_FLOW_DISABLED: ${name} no está habilitado para pruebas aisladas.`;
  const options = { region: "us-central1", cors: true };
  exports[name] = endpoint.callableTrigger
    ? onCall(options, () => { throw new HttpsError("failed-precondition", message); })
    : onRequest(options, (_request, response) => { response.status(412).json({ error: message }); });
}
