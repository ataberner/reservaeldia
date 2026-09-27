import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
let networkAttempts = 0;
const noNetwork = () => { networkAttempts++; throw new Error("External network forbidden in registration tests"); };
for (const protocol of ["node:http", "node:https"]) {
  for (const method of ["request", "get"]) mock.method(require(protocol), method, noNetwork);
}
mock.method(require("node:net").Socket.prototype, "connect", noNetwork);
mock.method(require("node:tls"), "connect", noNetwork);
mock.method(globalThis, "fetch", noNetwork);
mock.method(require("firebase-functions/logger"), "error", () => {});

const { auth } = require("firebase-functions/v1");
const { createRegistrationDeliveryStore } = requireBuiltModule("lib/emails/registrationDeliveryStore.js");
const { createWelcomeRegistrationProcessor } = requireBuiltModule("lib/emails/welcomeRegistration.js");
const { createNewUserNotificationProcessor } = requireBuiltModule("lib/emails/newUserNotification.js");
const { createRegistrationEmailsProcessor } = requireBuiltModule("lib/emails/registrationEmails.js");
const { createWelcomeRegistrationHandler } = requireBuiltModule("lib/emails/welcomeRegistrationFunction.js");
const { createTransactionalEmailService } = requireBuiltModule("lib/emails/sendTransactionalEmail.js");
const { createSesTransport } = requireBuiltModule("lib/emails/sesClient.js");
const { renderEmail } = requireBuiltModule("lib/emails/renderEmail.js");
const activation = "2026-09-27T12:00:00.000Z"; // Synthetic; never used in deployment config.
const context = { eventId: "synthetic-created", timestamp: "2026-09-27T15:30:00.000Z" };
const user = overrides => auth.userRecordConstructor({ uid: "synthetic-user", email: "auth-user@example.invalid",
  displayName: "  Agustín   Pérez  ", disabled: false, customClaims: {},
  metadata: { creationTime: context.timestamp }, providerData: [{ providerId: "password" }], ...overrides });
const collections = { welcome: "welcomeEmailDeliveries", newUserNotification: "newUserNotificationDeliveries" };
const templates = Object.keys(collections);

function fixture(options = {}) {
  const records = new Map(), requests = [], commands = [], logs = [], updates = [];
  const reservationFailures = { ...options.reservationFailures };
  const persistenceFailures = { ...options.persistenceFailures };
  let mode = options.mode || "production";
  const db = { doc(path) { const template = templates.find(key => path.startsWith(collections[key] + "/")); return {
    async create(value) {
      if (reservationFailures[template] > 0) { reservationFailures[template]--; throw new Error("private@example.invalid"); }
      if (records.has(path)) throw Object.assign(new Error("exists"), { code: 6 });
      records.set(path, structuredClone(value));
    },
    async update(value) {
      updates.push({ template, value: structuredClone(value) });
      if (persistenceFailures[template] > 0) { persistenceFailures[template]--; throw new Error("private@example.invalid"); }
      assert.ok(records.has(path));
      records.set(path, structuredClone(value));
    },
  }; } };
  const transport = createSesTransport(() => ({ async send(command) {
    const template = command.input.Content.Simple.Subject.Data.startsWith("Nuevo usuario") ? "newUserNotification" : "welcome";
    commands.push({ template, input: command.input });
    const errorName = options.sesErrors?.[template];
    if (errorName) throw Object.assign(new Error("private SES recipient/body/token"), { name: errorName });
    return { MessageId: `synthetic-${template}-id` };
  } }), 5000, undefined, () => mode);
  const service = createTransactionalEmailService({ getMode: () => mode, render: renderEmail, transport,
    log: entry => logs.push(entry) });
  const dependencies = template => ({
    store: createRegistrationDeliveryStore(collections[template], () => db), getMode: () => mode,
    getActivationTime: () => options.activation === undefined ? activation : options.activation,
    isSuperAdmin: options.isSuperAdmin || (() => false),
    send: async request => { requests.push(request); return service(request); }, log: entry => logs.push(entry),
  });
  const welcome = createWelcomeRegistrationProcessor(dependencies("welcome"));
  const internal = createNewUserNotificationProcessor(dependencies("newUserNotification"));
  const process = createRegistrationEmailsProcessor({ welcome, internal });
  return { records, requests, commands, logs, updates, process, handler: createWelcomeRegistrationHandler(process),
    setMode: value => { mode = value; }, delivery: template => records.get(`${collections[template]}/synthetic-user`) };
}

for (const [providerId, label] of [["password", "Email"], ["google.com", "Google"], ["unknown", "No disponible"]]) {
  test(`production Auth event → two independent React Email → SES commands (${providerId})`, async () => {
    const f = fixture();
    await f.handler(user({ providerData: [{ providerId, email: "ignored-provider@example.invalid" }] }), context);
    assert.equal(f.commands.length, 2);
    assert.equal(f.commands.find(c => c.template === "welcome").input.Destination.ToAddresses[0], "auth-user@example.invalid");
    const internal = f.commands.find(c => c.template === "newUserNotification").input;
    assert.deepEqual(internal.Destination, { ToAddresses: ["reservaeldia.invitaciones@gmail.com"] });
    assert.ok(internal.Content.Simple.Body.Text.Data.includes(`Método de registro: ${label}`));
    assert.ok(internal.Content.Simple.Body.Text.Data.includes("Agustín Pérez"));
    assert.doesNotMatch(internal.Content.Simple.Body.Text.Data, /ignored-provider/);
    assert.equal(Object.hasOwn(f.requests.find(r => r.template === "newUserNotification"), "to"), false);
    for (const { input } of f.commands) {
      const decode = header => header.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, text) => Buffer.from(text, "base64").toString("utf8"));
      assert.equal(decode(input.FromEmailAddress), "Reserva el Día <notificaciones@reservaeldia.com.ar>");
      assert.deepEqual(input.ReplyToAddresses.map(decode), ["Agus de Reserva el Día <hola@reservaeldia.com.ar>"]);
      assert.deepEqual(Object.keys(input.Destination), ["ToAddresses"]);
      assert.equal(input.Content.Raw, undefined);
      assert.equal(input.Content.Simple.Headers, undefined);
    }
    for (const template of templates) {
      assert.equal(f.delivery(template).status, "accepted");
      assert.equal(f.delivery(template).attempts, 1);
      assert.equal(f.delivery(template).sourceEventId, context.eventId);
      assert.equal(f.delivery(template).messageId, `synthetic-${template}-id`);
    }
    assert.notEqual(f.delivery("welcome").correlationId, f.delivery("newUserNotification").correlationId);
    const allowed = ["template", "userId", "sourceEventId", "correlationId", "mode", "state", "attempts", "messageId", "errorCode"];
    for (const log of f.logs) assert.ok(Object.keys(log).every(key => allowed.includes(key)));
    assert.doesNotMatch(JSON.stringify(f.logs) + JSON.stringify([...f.records.values()]), /Agustín|@|<html|token|Secrets|ignored-provider/);
  });
}

test("password without name sends a valid welcome immediately and an internal fallback", async () => {
  const f = fixture();
  await f.handler(user({ displayName: undefined }), context);
  assert.match(f.commands.find(c => c.template === "welcome").input.Content.Simple.Body.Text.Data, /¡Hola!/);
  assert.match(f.commands.find(c => c.template === "newUserNotification").input.Content.Simple.Body.Text.Data, /Nombre: No disponible/);
});

for (const email of [undefined, "invalid-email"]) {
  test(`missing/invalid Auth email (${email}) skips welcome but permits the internal operational notice`, async () => {
    const f = fixture();
    await f.handler(user({ email }), context);
    assert.equal(f.delivery("welcome").status, "skipped");
    assert.equal(f.delivery("welcome").attempts, 0);
    assert.equal(f.delivery("newUserNotification").status, "accepted");
    assert.equal(f.commands.length, 1);
  });
}

for (const [overrides, options] of [[{ disabled: true }, {}], [{ customClaims: { admin: true } }, {}],
  [{}, { isSuperAdmin: () => true }], [{}, { mode: "sandbox" }], [{}, { mode: "disabled" }], [{}, { mode: "bad-mode" }],
  [{}, { activation: "" }], [{}, { activation: "invalid" }],
  [{ metadata: { creationTime: "2026-09-27T11:59:59.999Z" } }, {}], [{ metadata: { creationTime: undefined } }, {}]]) {
  test(`both effects skip without sender: ${JSON.stringify([overrides, options])}`, async () => {
    const f = fixture(options);
    await f.handler(user(overrides), context);
    assert.equal(f.requests.length, 0);
    assert.equal(f.commands.length, 0);
    for (const template of templates) {
      assert.equal(f.delivery(template).status, "skipped");
      assert.equal(f.delivery(template).attempts, 0);
      assert.ok(f.delivery(template).skipReason);
      if (options.mode === "sandbox") assert.equal(f.delivery(template).skipReason, "EMAIL_SANDBOX_BUSINESS_BLOCKED");
    }
    f.setMode("production");
    await f.handler(user(overrides), context);
    assert.equal(f.requests.length, 0, "existing skips are never backfilled");
  });
}

test("the exact activation cutoff is eligible for both effects", async () => {
  const f = fixture();
  await f.handler(user({ metadata: { creationTime: activation } }), context);
  assert.equal(f.commands.length, 2);
});

test("legacy sandbox welcome record never replays; absent internal ledger still respects historical Auth creation", async () => {
  const f = fixture();
  const existing = { status: "skipped", attempts: 0, skipReason: "EMAIL_SANDBOX_BUSINESS_BLOCKED" };
  f.records.set("welcomeEmailDeliveries/synthetic-user", existing);
  await f.handler(user({ metadata: { creationTime: "2026-09-26T00:00:00.000Z" } }), context);
  assert.deepEqual(f.delivery("welcome"), existing);
  assert.equal(f.delivery("newUserNotification").skipReason, "WELCOME_BEFORE_ACTIVATION");
  assert.equal(f.requests.length, 0);
});

test("concurrent redelivery, including different event IDs: one reservation and one command per effect", async () => {
  const f = fixture();
  await Promise.all([f.handler(user(), context), f.handler(user(), context),
    f.handler(user(), { ...context, eventId: "another-event" })]);
  assert.equal(f.records.size, 2);
  assert.equal(f.requests.length, 2);
  for (const template of templates) assert.equal(f.commands.filter(c => c.template === template).length, 1);
});

for (const status of ["accepted", "failed", "unknown", "dispatching", "skipped"]) {
  test(`any existing state (${status}) protects each independent effect`, async () => {
    const f = fixture();
    const existing = { status, attempts: 1, sourceEventId: "old-event" };
    for (const collection of Object.values(collections)) f.records.set(`${collection}/synthetic-user`, existing);
    await f.handler(user(), context);
    assert.equal(f.requests.length, 0);
    for (const template of templates) assert.deepEqual(f.delivery(template), existing);
  });
}

for (const [welcomeError, internalError, welcomeState, internalState] of [
  [undefined, undefined, "accepted", "accepted"], ["MessageRejected", undefined, "failed", "accepted"],
  [undefined, "MessageRejected", "accepted", "failed"], ["TimeoutError", undefined, "unknown", "accepted"],
  [undefined, "TimeoutError", "accepted", "unknown"],
]) {
  test(`independent outcomes: welcome ${welcomeState}, internal ${internalState}`, async () => {
    const f = fixture({ sesErrors: { welcome: welcomeError, newUserNotification: internalError } });
    await f.handler(user(), context);
    assert.equal(f.delivery("welcome").status, welcomeState);
    assert.equal(f.delivery("newUserNotification").status, internalState);
    await f.handler(user(), context);
    assert.equal(f.commands.length, 2);
  });
}

for (const failing of templates) {
  test(`${failing} persistence failure retains its reservation and never resends the successful sibling`, async () => {
    const f = fixture({ persistenceFailures: { [failing]: 2 } });
    await f.handler(user(), context);
    assert.equal(f.delivery(failing).status, "dispatching");
    assert.equal(f.updates.filter(write => write.template === failing).length, 2);
    assert.ok(f.logs.some(log => log.template === failing && log.errorCode?.endsWith("RESULT_PERSIST_FAILED") && log.messageId));
    const sibling = templates.find(template => template !== failing);
    assert.equal(f.delivery(sibling).status, "accepted");
    await f.handler(user(), context);
    assert.equal(f.commands.length, 2);
  });

  test(`${failing} pre-reservation failure allows its own retry and does not block or resend the sibling`, async () => {
    const f = fixture({ reservationFailures: { [failing]: 1 } });
    await assert.rejects(f.handler(user(), context), /WELCOME_REGISTRATION_FAILED/);
    assert.equal(f.delivery(failing), undefined);
    assert.equal(f.commands.length, 1);
    await f.handler(user(), context);
    assert.equal(f.commands.length, 2);
    for (const template of templates) assert.equal(f.delivery(template).status, "accepted");
  });
}

test("superadmin lookup failure prevents both attempts and exposes no sensitive exception", async () => {
  const f = fixture({ isSuperAdmin: () => { throw new Error("private@example.invalid"); } });
  await assert.rejects(f.handler(user(), context), /^Error: WELCOME_REGISTRATION_FAILED$/);
  assert.equal(f.commands.length, 0);
  assert.equal(f.records.size, 0);
  assert.doesNotMatch(JSON.stringify(f.logs), /private|@/);
});

test("coordinator awaits the sibling even if the other processor throws synchronously", async () => {
  let completed = false;
  const process = createRegistrationEmailsProcessor({ welcome: () => { throw new Error("private"); },
    internal: async () => { await Promise.resolve(); completed = true; } });
  await assert.rejects(process({}), /^Error: REGISTRATION_EMAILS_FAILED$/);
  assert.equal(completed, true);
});

test("transport independently rechecks mode/recipient before constructing SES", async () => {
  for (const [mode, to, expected] of [["disabled", "real@example.invalid", "EMAIL_DISABLED"],
    ["invalid", "real@example.invalid", "EMAIL_INVALID_MODE"], ["sandbox", "real@example.invalid", "EMAIL_RECIPIENT_NOT_ALLOWED"],
    ["production", "first@example.invalid,second@example.invalid", "EMAIL_INVALID_REQUEST"]]) {
    const transport = createSesTransport(() => assert.fail("must not create SES"), 100, undefined, () => mode);
    assert.equal((await transport({ to, content: {} })).errorCode, expected);
  }
});

test.after(() => { assert.equal(networkAttempts, 0); mock.restoreAll(); });
