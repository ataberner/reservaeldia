import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
// Auth v1 resolves its event resource while inspecting the endpoint, not on import.
const previousProject = process.env.GCLOUD_PROJECT;
// Resource name only; network is trapped below. A demo ID would require the full emulator environment.
process.env.GCLOUD_PROJECT = "reservaeldia-7a440";
test.after(() => { if (previousProject === undefined) delete process.env.GCLOUD_PROJECT; else process.env.GCLOUD_PROJECT = previousProject; });
let networkAttempts = 0;
const rejectNetwork = () => {
  networkAttempts += 1;
  throw new Error("Network forbidden in configuration tests");
};
for (const protocol of ["node:http", "node:https"]) {
  for (const method of ["request", "get"]) mock.method(require(protocol), method, rejectNetwork);
}
mock.method(require("node:net").Socket.prototype, "connect", rejectNetwork);
mock.method(require("node:tls"), "connect", rejectNetwork);
mock.method(globalThis, "fetch", rejectNetwork);

const config = requireBuiltModule("lib/payments/mercadoPagoClient.js");
// Discovery must declare bindings without resolving any secret values.
const readSecret = mock.method(Object.getPrototypeOf(config.mercadoPagoAccessToken), "value", () => {
  throw new Error("Secret reads forbidden during discovery");
});
const coreEndpoints = requireBuiltModule("lib/index.js");
const paymentEndpoints = requireBuiltModule("lib/payments/entrypoint.js");
const emailEndpoints = requireBuiltModule("lib/emails/entrypoint.js");
const endpoints = { ...coreEndpoints, ...paymentEndpoints, ...emailEndpoints };
const { summarizeErrorForLog } = requireBuiltModule("lib/utils/safeErrorLog.js");

test("deployment source excludes environment files independently of runtime injection", () => {
  const firebase = JSON.parse(readFileSync(new URL("../firebase.json", import.meta.url), "utf8"));
  for (const codebase of firebase.functions) {
    for (const pattern of [".env*", ".secret*", ".runtimeconfig.json"]) {
      assert.ok(codebase.ignore.includes(pattern), `Missing source exclusion: ${pattern}`);
    }
  }
});

test("transactional email addresses are fixed server-side with unchanged sender, region and sandbox recipient", () => {
  const email = requireBuiltModule("lib/emails/config.js");
  assert.equal(email.EMAIL_FROM_NAME, "Reserva el Día");
  assert.equal(email.EMAIL_FROM_ADDRESS, "notificaciones@reservaeldia.com.ar");
  assert.equal(email.EMAIL_REPLY_TO_NAME, "Agus de Reserva el Día");
  assert.equal(email.EMAIL_REPLY_TO_ADDRESS, "hola@reservaeldia.com.ar");
  assert.equal(email.EMAIL_REGION, "us-east-1");
  assert.equal(email.SANDBOX_RECIPIENT, "reservaeldia.invitaciones@gmail.com");
  assert.equal(readSecret.mock.callCount(), 0);
});

test("Functions dotenv files never declare Mercado Pago secrets", () => {
  const forbidden = new Set([
    "MERCADO_PAGO_ACCESS_TOKEN", "MP_WEBHOOK_SECRET", "MERCADO_PAGO_CLIENT_SECRET",
  ]);
  for (const directory of [new URL("./", import.meta.url), new URL("../functions-payments/", import.meta.url), new URL("../functions-email/", import.meta.url)]) {
    for (const file of readdirSync(directory).filter((name) => /^\.env(?:\.|$)/.test(name))) {
      const source = readFileSync(new URL(file, directory), "utf8");
      // Report names only, never dotenv contents, even when this guard fails.
      const declarations = source.matchAll(/^\s*(?:export\s+)?([\w.-]+)\s*(?:=|:\s)/gm);
      const leakedNames = [...declarations].map((match) => match[1]).filter((name) => forbidden.has(name));
      assert.deepEqual(leakedNames, [], `Mercado Pago secrets forbidden in ${file}`);
      if (directory.pathname.includes("functions-payments")) {
        const names = [...source.matchAll(/^\s*(?:export\s+)?([\w.-]+)\s*=/gm)].map(match => match[1]);
        const allowed = ["MERCADO_PAGO_PUBLIC_KEY", "MERCADO_PAGO_WEBHOOK_URL", "GOOGLE_MAPS_EMBED_API_KEY"];
        assert.deepEqual(names.filter(name => !allowed.includes(name)), [], "Unexpected Payments dotenv names (values never logged)");
      }
    }
  }
});

test("payment secrets bind only their actual consumers; email keeps its own bindings", () => {
  assert.equal(Object.keys(coreEndpoints).length, 101);
  assert.equal(Object.keys(paymentEndpoints).length, 3);
  assert.equal(Object.keys(emailEndpoints).length, 3);
  assert.equal(Object.keys(endpoints).length, 107);
  for (const name of Object.keys(paymentEndpoints)) assert.equal(Object.hasOwn(coreEndpoints, name), false);
  const consumers = (secret) => Object.entries(endpoints)
    .filter(([, fn]) => fn?.__endpoint?.secretEnvironmentVariables?.some(({ key }) => key === secret))
    .map(([name]) => name).sort();
  assert.deepEqual(consumers("MERCADO_PAGO_ACCESS_TOKEN"), [
    "createPublicationCheckoutSession", "createPublicationPayment", "mercadoPagoWebhook",
  ]);
  assert.deepEqual(consumers("MP_WEBHOOK_SECRET"), ["mercadoPagoWebhook"]);
  assert.deepEqual(consumers("MERCADO_PAGO_CLIENT_SECRET"), []);
  assert.deepEqual(endpoints.testTransactionalEmail.__endpoint.secretEnvironmentVariables.map(({ key }) => key).sort(), [
    "AWS_SES_ACCESS_KEY_ID", "AWS_SES_SECRET_ACCESS_KEY",
  ]);
  assert.equal(Object.hasOwn(endpoints, "diagnoseEmailAwsIdentity"), false);
  for (const secret of ["AWS_SES_ACCESS_KEY_ID", "AWS_SES_SECRET_ACCESS_KEY"]) {
    assert.deepEqual(consumers(secret), ["onUserCreatedWelcomeEmail", "testTransactionalEmail", "testWelcomeEmail"]);
  }
  assert.equal(readSecret.mock.callCount(), 0);
});

test("payment webhook reader preserves the runtime environment contract", () => {
  const previous = process.env.MP_WEBHOOK_SECRET;
  try {
    process.env.MP_WEBHOOK_SECRET = " synthetic-webhook-secret ";
    assert.equal(config.getMercadoPagoWebhookSecret(), "synthetic-webhook-secret");
    delete process.env.MP_WEBHOOK_SECRET;
    assert.throws(() => config.getMercadoPagoWebhookSecret(), /Falta variable de entorno requerida: MP_WEBHOOK_SECRET/);
  } finally {
    if (previous === undefined) delete process.env.MP_WEBHOOK_SECRET;
    else process.env.MP_WEBHOOK_SECRET = previous;
  }
});

test("error logs omit credentials, URLs, messages, stacks and SDK payloads", () => {
  const sensitive = "synthetic-secret-do-not-log";
  const error = Object.assign(new Error(`Authorization: Bearer ${sensitive}`), {
    status: 401, code: sensitive, name: sensitive,
    config: { headers: { Authorization: sensitive } },
    response: { data: { secret: sensitive } },
    url: `https://example.invalid/?token=${sensitive}`,
    toJSON: () => { throw new Error("Must not serialize original error"); },
  });
  assert.deepEqual(summarizeErrorForLog(error), { errorType: "error", status: 401 });
  assert.deepEqual(summarizeErrorForLog(sensitive), { errorType: "unknown" });
  assert.deepEqual(summarizeErrorForLog({ status: "401", code: sensitive }), { errorType: "unknown" });
  assert.deepEqual(summarizeErrorForLog({ status: 123456789 }), { errorType: "unknown" });
  assert.deepEqual(summarizeErrorForLog({ get status() { throw new Error("Getter must not run"); } }), { errorType: "unknown" });
});

test("webhook failure logs are sanitized and keep the same HTTP response", async () => {
  const logger = require("firebase-functions/logger");
  const log = mock.method(logger, "error", () => {});
  const { processMercadoPagoWebhookRequest } = requireBuiltModule("lib/payments/publicationPayments.js");
  const failure = Object.assign(new Error("synthetic-credential-in-sdk-error"), { status: 401 });
  const response = { statusCode: null, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  try {
    await processMercadoPagoWebhookRequest({ get headers() { throw failure; } }, response);
    assert.deepEqual(log.mock.calls[0].arguments, ["Error en webhook de Mercado Pago", {
      error: { errorType: "error", status: 401 },
    }]);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { ok: false, message: "Error procesando webhook" });
  } finally { log.mock.restore(); }
});

test("configuration checks performed no network requests or secret reads", () => {
  assert.equal(networkAttempts, 0);
  assert.equal(readSecret.mock.callCount(), 0);
});
