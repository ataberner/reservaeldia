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
// Public HTML delivery uses a disposable signing value only in this validated
// emulator process. No production Secret binding or dotenv is copied.
process.env.PUBLIC_VISIT_SIGNING_SECRET = "local-only-public-delivery-synthetic-signing-value";
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const handlers = {
  ...require("../../functions/lib/index.js"),
  ...require("../../functions/lib/emails/entrypoint.js"),
};

// Only handlers whose effects have been inspected are enabled. New exports fail
// closed until explicitly reviewed. Only the welcome Auth event is enabled;
// schedulers and other event triggers remain absent.
const { region } = require("firebase-functions/v1");
if (process.env.EMAIL_MODE !== "disabled") throw new Error("Local Auth welcome requires EMAIL_MODE=disabled");
exports.onUserCreatedWelcomeEmail = region("us-central1").auth.user()
  .onCreate(handlers.onUserCreatedWelcomeEmail.run);
// Same handler, demo resources, no remote service account or Secret bindings.
const enabled = new Set([
  "upsertUserProfile", "getMyProfileStatus", "getMyUiPreferences", "updateMyUiPreferences",
  // Reads the caller's verified claims and configured UID list; no mutation.
  "getAdminAccess",
  // Identity support: superadmin-only paginated demo Auth/Firestore reads.
  "listUsersDirectory",
  // Provider beta: verified superadmin + closed backend gate; demo Firestore only.
  "adminProvidersV1",
  // Read-only private directory; verified superadmin and independent closed gate.
  "providerDirectoryV1",
  "getPricingConfigV1", "getDashboardHomeConfigV1",
  // Inspected Music V1: owner-checked Firestore transaction, no external provider.
  "saveDraftWithMusicV1",
  // Inspected draft creation: demo Firestore/Storage only. The network guard
  // rejects any remote asset encountered in a template.
  "copiarPlantilla", "copiarPlantillaHTML",
  // Explicit superadmin support: verified identity, owner binding and CAS;
  // only demo Auth/Firestore/Storage effects, no publish or external service.
  "getAdminDraftSnapshot", "getUserDirectoryDetail", "saveAdminDraftPatch",
]);
for (const [name, handler] of Object.entries(handlers)) {
  const endpoint = handler?.__endpoint;
  if (!endpoint?.callableTrigger && !endpoint?.httpsTrigger) continue;
  if (enabled.has(name)) {
    exports[name] = onCall({ region: "us-central1", cors: ["http://localhost:3100", "http://127.0.0.1:3100"] }, handler.run);
    continue;
  }
  if (name === "verInvitacion") {
    exports[name] = onRequest({ region: "us-central1", cors: false }, handler);
    continue;
  }
  if (["providerAdminImageV1", "providerDirectoryImageV1"].includes(name)) {
    // Authenticated private image upload/read; emulator bucket only, no tokens.
    exports[name] = onRequest({ region: "us-central1", cors: false }, handler);
    continue;
  }
  if (name === "verInvitacionPublicada") {
    // Exercise the existing public reader; visit writes stay disabled locally.
    exports[name] = onRequest({ region: "us-central1", cors: false }, (request, response) => {
      if (request.method !== "GET") {
        response.status(412).json({ error: "LOCAL_FLOW_DISABLED: public delivery writes" });
        return;
      }
      return handler(request, response);
    });
    continue;
  }
  const message = `LOCAL_FLOW_DISABLED: ${name} no está habilitado para pruebas aisladas.`;
  const options = { region: "us-central1", cors: true };
  exports[name] = endpoint.callableTrigger
    ? onCall(options, () => { throw new HttpsError("failed-precondition", message); })
    : onRequest(options, (_request, response) => { response.status(412).json({ error: message }); });
}
