const test = require("node:test");
const assert = require("node:assert/strict");
const contract = require("../../shared/firebaseEnvironment.cjs");
const backend = require("../../functions/lib/firebaseAdmin.js");

test("session excludes personal configuration and legacy public invitations", () => {
  const fs = require("node:fs");
  for (const file of [".env.local", "firebase-key.json", "functions/.env.production", "functions/.secret.local", "functions/.runtimeconfig.json", "public/boda", "public/para-diseño"]) assert.equal(fs.existsSync(file), false, file);
  assert.ok(fs.existsSync("scripts/local/sessionEnvironment.json"));
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
});

test("Admin initializes with demo identity and forbids ADC token requests", async () => {
  const app = backend.ensureAdminApp();
  assert.equal(app.options.projectId, contract.LOCAL_PROJECT);
  assert.equal(app.options.storageBucket, contract.LOCAL_BUCKET);
  await assert.rejects(() => app.options.credential.getAccessToken(), /ADC token request blocked/);
  assert.equal(app.firestore().settings === undefined, false);
  assert.equal(backend.ensureAdminApp(), app);
});

test("Admin rejects incomplete emulator state and incompatible credentials/config", () => {
  for (const [key, value] of [
    ["FIREBASE_STORAGE_EMULATOR_HOST", ""], ["FIREBASE_AUTH_EMULATOR_HOST", ""],
    ["FIRESTORE_EMULATOR_HOST", ""], ["FIREBASE_FUNCTIONS_EMULATOR_HOST", ""],
    ["GCLOUD_PROJECT", "other"], ["FIREBASE_STORAGE_BUCKET", "other"],
    ["GOOGLE_APPLICATION_CREDENTIALS", "synthetic-do-not-open.json"],
    ["FIREBASE_CONFIG", "{}"], ["FIREBASE_CONFIG", "file-path-not-allowed"],
    ["RESERVA_FIREBASE_MODE", "typo"],
  ]) {
    const previous = process.env[key];
    try { process.env[key] = value; assert.throws(() => backend.ensureAdminApp(), undefined, key); }
    finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
  }
});

test("provider effects fail before clients are constructed, including supplied synthetic keys", () => {
  assert.throws(() => require("../../functions/lib/payments/mercadoPagoClient.js").getMercadoPagoClient(), /bloqueado/);
  assert.throws(() => require("../../functions/lib/emails/sesClient.js").createSesClient(), /bloqueado/);
  assert.throws(() => require("../../functions/lib/designerAi/service.js").createDesignerAiOpenAiClient("synthetic-unused"), /bloqueado/);
});

test("local entry preserves existing safe handlers, removes triggers and blocks effects", async () => {
  const local = require("./functionsEntry.cjs");
  assert.equal(local.finalizeExpiredPublications, undefined);
  assert.equal(local.onIconCatalogDocWriteV2, undefined);
  await assert.rejects(() => local.getMyUiPreferences.run({ data: {} }), (error) => error.code === "unauthenticated");
  await assert.rejects(async () => local.createPublicationPayment.run({ data: {} }), /LOCAL_FLOW_DISABLED/);
  await assert.rejects(async () => local.designerAiChat.run({ data: {} }), /LOCAL_FLOW_DISABLED/);
});

test("generated RSVP uses demo endpoint, rejects Sheets and fails without endpoint", () => {
  const { generarModalRSVPHTML } = require("../../functions/lib/utils/generarModalRSVP.js");
  const html = generarModalRSVPHTML({ enabled: true });
  assert.ok(html.includes(`http://127.0.0.1:15001/${contract.LOCAL_PROJECT}/us-central1/publicRsvpSubmit`));
  assert.ok(!html.includes("cloudfunctions.net"));
  assert.throws(() => generarModalRSVPHTML({ enabled: true, sheetUrl: "https://sheets.invalid/submit" }), /Sheets.*bloqueado/);
});

test("generated RSVP executes locally and rejects tampered/missing destinations before fetch", async () => {
  const { JSDOM } = require("jsdom");
  const { generarModalRSVPHTML } = require("../../functions/lib/utils/generarModalRSVP.js");
  const original = generarModalRSVPHTML({ enabled: true, presetId: "minimal" });
  const match = original.match(/var RSVP_CONFIG = (.+);/);
  assert.ok(match);
  const config = JSON.parse(match[1]);
  for (const endpoint of [config.submitEndpoint, "https://us-central1-reservaeldia-7a440.cloudfunctions.net/publicRsvpSubmit", ""]) {
    const requests = [], errors = [];
    const html = original.replace(match[0], `var RSVP_CONFIG = ${JSON.stringify({ ...config, submitEndpoint: endpoint })};`);
    const dom = new JSDOM(html, { url: "http://localhost:3100/i/local-rsvp", runScripts: "dangerously", beforeParse(window) {
      window.fetch = async (url) => { requests.push(url); return { ok: true, json: async () => ({ ok: true }) }; };
      window.addEventListener("error", (event) => { errors.push(event.message); event.preventDefault(); });
    } });
    await new Promise((resolve) => dom.window.document.addEventListener("DOMContentLoaded", resolve, { once: true }));
    for (const control of dom.window.document.querySelectorAll("[data-rsvp-field]")) {
      control.value = control.tagName === "SELECT" ? [...control.options].find((option) => option.value)?.value : control.type === "number" ? "1" : "Persona Sintética";
    }
    dom.window.document.getElementById("rsvp-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setImmediate(resolve));
    if (endpoint === config.submitEndpoint) assert.deepEqual(requests, [config.submitEndpoint]);
    else { assert.equal(requests.length, 0); assert.ok(errors.some((message) => /Endpoint RSVP incompatible|Falta el endpoint/.test(message))); }
    dom.window.close();
  }
});

test.after(async () => { await backend.ensureAdminApp().delete(); });
