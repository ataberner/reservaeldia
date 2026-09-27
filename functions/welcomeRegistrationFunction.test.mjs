import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
let networkAttempts = 0;
const noNetwork = () => { networkAttempts++; throw new Error("Network forbidden in Auth welcome tests"); };
for (const protocol of ["node:http", "node:https"]) {
  for (const method of ["request", "get"]) mock.method(require(protocol), method, noNetwork);
}
mock.method(require("node:net").Socket.prototype, "connect", noNetwork);
mock.method(require("node:tls"), "connect", noNetwork);
mock.method(globalThis, "fetch", noNetwork);
const logs = [];
mock.method(require("firebase-functions/logger"), "error", (...args) => logs.push(args));
const { auth } = require("firebase-functions/v1");
const config = requireBuiltModule("lib/emails/config.js");
const runtime = requireBuiltModule("lib/emails/welcomeRegistration.js");
const { createWelcomeRegistrationHandler, onUserCreatedWelcomeEmail } = requireBuiltModule("lib/emails/welcomeRegistrationFunction.js");
const { renderEmail } = requireBuiltModule("lib/emails/renderEmail.js");
const activation = "2026-09-01T00:00:00.000Z"; // Synthetic only, never production configuration.
const context = { eventId: "synthetic-auth-created-event", timestamp: "2026-09-25T12:00:00.000Z" };
const userRecord = (overrides = {}) => auth.userRecordConstructor({ uid: "synthetic-auth-user",
  email: "synthetic@example.invalid", disabled: false, displayName: "Agustín",
  customClaims: {}, metadata: { creationTime: "2026-09-25T12:00:00.000Z" }, ...overrides });
const accepted = { ok: true, state: "accepted", messageId: "synthetic-message-id", errorCode: null, retryable: false };

function fixture(overrides = {}) {
  const records = new Map(), sent = [], processorLogs = [];
  const store = { async reserve(uid, delivery) {
    if (records.has(uid)) return false;
    records.set(uid, structuredClone(delivery)); return true;
  }, async complete(uid, delivery) { records.set(uid, structuredClone(delivery)); } };
  const dependencies = { store, getMode: () => "production", getActivationTime: () => activation,
    isSuperAdmin: () => false, send: async request => { sent.push(request); return accepted; },
    log: entry => processorLogs.push(entry), ...overrides };
  const process = runtime.createWelcomeRegistrationProcessor(dependencies);
  return { records, store, sent, processorLogs, dependencies, handler: createWelcomeRegistrationHandler(process) };
}

test("stable Auth v1 onCreate declaration, private event, retries, dedicated identity and exact Secrets", () => {
  const project = process.env.GCLOUD_PROJECT;
  let endpoint;
  try { process.env.GCLOUD_PROJECT = "demo-reservaeldia-local"; endpoint = onUserCreatedWelcomeEmail.__endpoint; }
  finally { if (project === undefined) delete process.env.GCLOUD_PROJECT; else process.env.GCLOUD_PROJECT = project; }
  assert.equal(endpoint.platform, "gcfv1");
  assert.deepEqual(endpoint.region, ["us-central1"]);
  assert.equal(endpoint.eventTrigger.eventType, "providers/firebase.auth/eventTypes/user.create");
  assert.equal(endpoint.eventTrigger.retry, true);
  assert.equal(endpoint.httpsTrigger, undefined);
  assert.equal(endpoint.callableTrigger, undefined);
  assert.equal(endpoint.blockingTrigger, undefined);
  assert.equal(endpoint.serviceAccountEmail, config.WELCOME_SERVICE_ACCOUNT);
  assert.equal(endpoint.serviceAccountEmail, "welcome-email-sender@reservaeldia-7a440.iam.gserviceaccount.com");
  assert.equal(endpoint.maxInstances, 2);
  assert.equal(endpoint.timeoutSeconds, 60);
  assert.deepEqual(endpoint.secretEnvironmentVariables.map(({ key }) => key).sort(), ["AWS_SES_ACCESS_KEY_ID", "AWS_SES_SECRET_ACCESS_KEY"]);
});

test("exported trigger.run maps only UserRecord fields and the real context eventId", async () => {
  const inputs = [];
  const spy = mock.method(runtime, "processWelcomeRegistration", async input => { inputs.push(input); });
  try {
    const user = userRecord({ customClaims: { admin: false }, passwordHash: "never-forward", token: "never-forward" });
    await onUserCreatedWelcomeEmail.run(user, { ...context, data: { email: "injected@example.invalid" } });
    assert.deepEqual(inputs, [{ user: { uid: user.uid, email: user.email, displayName: user.displayName,
      disabled: user.disabled, customClaims: user.customClaims, creationTime: user.metadata.creationTime }, sourceEventId: context.eventId }]);
    assert.doesNotMatch(JSON.stringify(inputs), /never-forward|injected/);
  } finally { spy.mock.restore(); }
});

test("email/password without displayName immediately renders the natural fallback", async () => {
  const f = fixture();
  await f.handler(userRecord({ displayName: undefined, emailVerified: false, providerData: [{ providerId: "password" }] }), context);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].data.name, undefined);
  const content = await renderEmail(f.sent[0]);
  assert.match(content.text, /¡Hola!/);
  assert.doesNotMatch(content.text, /undefined|null/);
});

for (const origin of ["RegisterModal", "LoginModal", "first Google sign-in"]) {
  test(`new Google account from ${origin} uses the same backend event and displayName`, async () => {
    const f = fixture();
    await f.handler(userRecord({ displayName: "  Agustín   Pérez ", providerData: [{ providerId: "google.com" }], origin }), context);
    assert.equal(f.sent.length, 1);
    assert.equal(f.sent[0].template, "welcome");
    assert.deepEqual(f.sent[0].data, { name: "Agustín Pérez", dashboardUrl: "https://reservaeldia.com.ar/dashboard" });
    assert.equal(f.records.get("synthetic-auth-user").sourceEventId, context.eventId);
  });
}

for (const [overrides, reason, dependencies] of [
  [{ email: undefined }, "WELCOME_EMAIL_MISSING"],
  [{ disabled: true }, "WELCOME_USER_DISABLED"],
  [{ customClaims: { admin: true } }, "WELCOME_ADMIN"],
  [{}, "WELCOME_SUPERADMIN", { isSuperAdmin: () => true }],
]) {
  test(`Auth event excludes ${reason}`, async () => {
    const f = fixture(dependencies);
    await f.handler(userRecord(overrides), context);
    assert.equal(f.records.get("synthetic-auth-user").skipReason, reason);
    assert.equal(f.sent.length, 0);
  });
}

test("canonical server-side superadmin authority is reused without an Auth API read", async () => {
  const previous = process.env.SUPERADMINS_UIDS;
  try {
    process.env.SUPERADMINS_UIDS = "synthetic-auth-user";
    const f = fixture({ isSuperAdmin: requireBuiltModule("lib/auth/adminAuth.js").isSuperAdmin });
    await f.handler(userRecord(), context);
    assert.equal(f.records.get("synthetic-auth-user").skipReason, "WELCOME_SUPERADMIN");
    assert.equal(f.sent.length, 0);
  } finally {
    if (previous === undefined) delete process.env.SUPERADMINS_UIDS; else process.env.SUPERADMINS_UIDS = previous;
  }
});

for (const [mode, reason] of [["sandbox", "EMAIL_SANDBOX_BUSINESS_BLOCKED"], ["disabled", "EMAIL_DISABLED"]]) {
  test(`duplicate Auth deliveries in ${mode} reserve skipped exactly once, no sender`, async () => {
    const f = fixture({ getMode: () => mode, getActivationTime: () => { throw new Error("must not read activation"); } });
    await Promise.all([f.handler(userRecord(), context), f.handler(userRecord(), context)]);
    assert.equal(f.records.size, 1);
    assert.equal(f.records.get("synthetic-auth-user").skipReason, reason);
    assert.equal(f.records.get("synthetic-auth-user").attempts, 0);
    assert.equal(f.sent.length, 0);
  });
}

test("duplicate event or different eventId for the same UID allows only one sender", async () => {
  const f = fixture();
  await Promise.all([f.handler(userRecord(), context), f.handler(userRecord(), context),
    f.handler(userRecord(), { ...context, eventId: "redelivered-event" })]);
  assert.equal(f.records.size, 1);
  assert.equal(f.sent.length, 1);
  assert.equal(f.records.get("synthetic-auth-user").attempts, 1);
});

for (const status of ["accepted", "failed", "unknown", "dispatching", "skipped"]) {
  test(`existing ${status} delivery remains untouched through Auth adapter`, async () => {
    const f = fixture();
    const existing = { status, attempts: 1 };
    f.records.set("synthetic-auth-user", existing);
    await f.handler(userRecord(), context);
    assert.deepEqual(f.records.get("synthetic-auth-user"), existing);
    assert.equal(f.sent.length, 0);
  });
}

for (const dependency of ["superadmin", "firestore"]) {
  test(`${dependency} failure before reservation is sanitized and permits platform retry without account rollback`, async () => {
    const f = fixture();
    const reserve = f.store.reserve;
    if (dependency === "superadmin") f.dependencies.isSuperAdmin = async () => { throw new Error("secret-user@example.invalid"); };
    else f.store.reserve = async () => { throw new Error("secret-user@example.invalid"); };
    const handler = createWelcomeRegistrationHandler(runtime.createWelcomeRegistrationProcessor(f.dependencies));
    const user = userRecord();
    await assert.rejects(handler(user, context), /^Error: WELCOME_REGISTRATION_FAILED$/);
    assert.equal(user.uid, "synthetic-auth-user");
    assert.equal(f.records.size, 0);
    assert.equal(f.sent.length, 0);
    assert.equal(f.processorLogs.at(-1).attempts, 0);
    assert.doesNotMatch(JSON.stringify(logs), /secret-user|example\.invalid|Agustín|passwordHash/);
    f.store.reserve = reserve;
    f.dependencies.isSuperAdmin = () => false;
    await createWelcomeRegistrationHandler(runtime.createWelcomeRegistrationProcessor(f.dependencies))(user, context);
    assert.equal(f.sent.length, 1);
  });
}

for (const [value, creationTime, expected] of [
  ["", "2026-09-25", "WELCOME_ACTIVATION_NOT_CONFIGURED"],
  [undefined, "2026-09-25", "WELCOME_ACTIVATION_NOT_CONFIGURED"],
  ["bad date", "2026-09-25", "WELCOME_ACTIVATION_INVALID"],
  ["2026-02-30T00:00:00.000Z", "2026-09-25", "WELCOME_ACTIVATION_INVALID"],
  [activation, undefined, "WELCOME_CREATION_TIME_INVALID"],
  [activation, "invalid", "WELCOME_CREATION_TIME_INVALID"],
  [activation, "2026-08-31T23:59:59.999Z", "WELCOME_BEFORE_ACTIVATION"],
  [activation, activation, undefined],
  [activation, "Fri, 25 Sep 2026 12:00:00 GMT", undefined],
]) {
  test(`activation ${String(value)} / creation ${String(creationTime)}: ${expected ?? "eligible"}`, async () => {
    assert.equal(config.welcomeActivationSkipReason(value, creationTime), expected);
    const f = fixture({ getActivationTime: () => value });
    await f.handler(userRecord({ metadata: { creationTime } }), context);
    const delivery = f.records.get("synthetic-auth-user");
    assert.equal(delivery.status, expected ? "skipped" : "accepted");
    assert.equal(delivery.skipReason, expected);
    assert.equal(f.sent.length, expected ? 0 : 1);
  });
}

test("configured synthetic activation never enables the real production sender", async () => {
  const mode = mock.method(config.emailMode, "value", () => "production");
  try {
    const f = fixture({ send: undefined });
    await f.handler(userRecord(), context);
    assert.equal(f.records.get("synthetic-auth-user").skipReason, "EMAIL_PRODUCTION_NOT_ENABLED");
  } finally { mode.mock.restore(); }
});

test("Auth trigger discovery reads no parameters/Secrets and loads no email runtime", () => {
  const child = spawnSync(process.execPath, ["--require", "../scripts/local/networkGuard.cjs", "-e", `
    const assert = require('node:assert/strict');
    const config = require('./lib/emails/config.js');
    for (const param of [config.emailMode,config.welcomeEmailActivationAt,config.awsSesAccessKeyId,config.awsSesSecretAccessKey]) {
      param.value = () => {throw new Error('Parameter read during discovery');};
    }
    require('./lib/emails/welcomeRegistrationFunction.js');
    const loaded = Object.keys(require.cache).map(p=>p.replaceAll('\\\\','/'));
    for (const part of ['/lib/emails/welcomeRegistration.js','/lib/emails/welcomeDeliveryStore.js',
      '/lib/emails/sendTransactionalEmail.js','/node_modules/react-email/','/node_modules/@react-email/','/node_modules/@aws-sdk/']) {
      assert.equal(loaded.some(p=>p.includes(part)),false,part);
    }
    assert.deepEqual(require('../scripts/local/networkGuard.cjs').attempts,[]);
  `], { cwd: new URL("./", import.meta.url), encoding: "utf8", timeout: 30000, windowsHide: true,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC)$/i.test(key))) });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr || child.stdout);
});

test.after(() => { assert.equal(networkAttempts, 0); mock.restoreAll(); });
