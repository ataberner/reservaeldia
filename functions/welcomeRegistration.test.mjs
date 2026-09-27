import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
let networkAttempts = 0;
const rejectNetwork = () => {
  networkAttempts++;
  throw new Error("External network forbidden in welcome tests");
};
for (const protocol of ["node:http", "node:https"]) {
  for (const method of ["request", "get"]) mock.method(require(protocol), method, rejectNetwork);
}
mock.method(require("node:net").Socket.prototype, "connect", rejectNetwork);
mock.method(require("node:tls"), "connect", rejectNetwork);
mock.method(globalThis, "fetch", rejectNetwork);

const { createWelcomeRegistrationProcessor } = requireBuiltModule("lib/emails/welcomeRegistration.js");
const { createWelcomeDeliveryStore } = requireBuiltModule("lib/emails/welcomeDeliveryStore.js");
const { createTransactionalEmailService } = requireBuiltModule("lib/emails/sendTransactionalEmail.js");
const config = requireBuiltModule("lib/emails/config.js");
const accepted = { ok: true, state: "accepted", messageId: "synthetic-message-id", errorCode: null, retryable: false };
const failure = (state, errorCode) => ({ ok: false, state, errorCode, messageId: null, retryable: false });
const registration = (user = {}, sourceEventId = "synthetic-auth-event") => ({
  user: { uid: "synthetic-new-user", email: "new-user@example.invalid", displayName: "  Agustín   Pérez  ",
    disabled: false, customClaims: {}, creationTime: "2026-09-25T12:00:00.000Z", ...user }, sourceEventId,
});

function fixture(overrides = {}) {
  const records = new Map(), sends = [], logs = [], writes = [];
  // Model the server's atomic create precondition, not a read-then-write lock.
  // A separate emulator test exercises the real Firestore create concurrently.
  const store = createWelcomeDeliveryStore(() => ({ doc: path => ({
    async create(delivery) {
      if (records.has(path)) throw Object.assign(new Error("already exists"), { code: 6 });
      records.set(path, structuredClone(delivery));
    },
    async update(delivery) {
      writes.push(structuredClone(delivery));
      assert.ok(records.has(path), "update must not recreate missing reservations");
      records.set(path, structuredClone(delivery));
    },
  }) }));
  const dependencies = { store, getMode: () => "production", isSuperAdmin: () => false,
    getActivationTime: () => "2026-01-01T00:00:00.000Z",
    send: async request => { sends.push(request); return accepted; }, log: entry => logs.push(entry),
    now: () => new Date("2026-09-25T12:00:00.000Z"), ...overrides };
  const process = createWelcomeRegistrationProcessor(dependencies);
  return { process, dependencies, records, sends, logs, writes,
    delivery: () => records.get("welcomeEmailDeliveries/synthetic-new-user") };
}

test("valid backend user: fixed template, Auth recipient, normalized Unicode name, URL and UUID", async () => {
  const f = fixture();
  const result = await f.process(registration());
  assert.equal(result.outcome, "recorded");
  assert.equal(f.sends.length, 1);
  assert.deepEqual(f.sends[0], { to: "new-user@example.invalid", template: "welcome",
    data: { name: "Agustín Pérez", dashboardUrl: "https://reservaeldia.com.ar/dashboard" },
    metadata: { correlationId: f.delivery().correlationId } });
  assert.match(f.delivery().correlationId, /^welcome-[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  assert.deepEqual(f.delivery(), { status: "accepted", sourceEventId: "synthetic-auth-event",
    correlationId: f.sends[0].metadata.correlationId, attempts: 1,
    startedAt: new Date("2026-09-25T12:00:00.000Z"), updatedAt: new Date("2026-09-25T12:00:00.000Z"),
    acceptedAt: new Date("2026-09-25T12:00:00.000Z"), messageId: "synthetic-message-id" });
});

for (const displayName of [undefined, "", " \t\n "]) {
  test(`missing/blank name (${JSON.stringify(displayName)}) delegates to template fallback`, async () => {
    const f = fixture();
    await f.process(registration({ displayName }));
    assert.equal(f.sends.length, 1);
    assert.equal(Object.hasOwn(f.sends[0].data, "name"), false);
  });
}

for (const [user, reason, extra] of [
  [{ email: undefined }, "WELCOME_EMAIL_MISSING"],
  [{ email: "" }, "WELCOME_EMAIL_MISSING"],
  [{ email: "not-an-email" }, "WELCOME_EMAIL_INVALID"],
  [{ email: "a@example.invalid\r\nBcc: other@example.invalid" }, "WELCOME_EMAIL_INVALID"],
  [{ disabled: true }, "WELCOME_USER_DISABLED"],
  [{ customClaims: { admin: true } }, "WELCOME_ADMIN"],
  [{}, "WELCOME_SUPERADMIN", { isSuperAdmin: uid => uid === "synthetic-new-user" }],
]) {
  test(`ineligible user: ${reason} (${JSON.stringify(user)})`, async () => {
    const f = fixture(extra);
    await f.process(registration(user));
    assert.equal(f.sends.length, 0);
    assert.equal(f.delivery().status, "skipped");
    assert.equal(f.delivery().skipReason, reason);
    assert.equal(f.delivery().attempts, 0);
    assert.equal(f.writes.length, 0);
  });
}

test("eligibility does not invent profile, verified email, purchase or role-string requirements", async () => {
  const f = fixture();
  await f.process(registration({ customClaims: { admin: "true", role: "admin" } }));
  assert.equal(f.sends.length, 1);
});

for (const [mode, reason] of [["disabled", "EMAIL_DISABLED"], [undefined, "EMAIL_DISABLED"],
  ["sandbox", "EMAIL_SANDBOX_BUSINESS_BLOCKED"], ["unexpected", "EMAIL_INVALID_MODE"]]) {
  test(`mode ${String(mode)} records skipped without calling sender or redirecting`, async () => {
    const f = fixture({ getMode: () => mode });
    await f.process(registration());
    assert.equal(f.sends.length, 0);
    assert.equal(f.delivery().status, "skipped");
    assert.equal(f.delivery().skipReason, reason);
    assert.equal(f.delivery().attempts, 0);
    f.dependencies.getMode = () => "production";
    assert.equal((await f.process(registration())).outcome, "already_exists");
    assert.equal(f.sends.length, 0, "changing mode does not replay skipped users");
  });
}

test("business processor also blocks the fixed smoke recipient in sandbox", async () => {
  const f = fixture({ getMode: () => "sandbox" });
  await f.process(registration({ email: config.SANDBOX_RECIPIENT }));
  assert.equal(f.sends.length, 0);
  assert.equal(f.delivery().attempts, 0);
});

test("production reaches the central sender but tests still prohibit the real SDK", async () => {
  const mode = mock.method(config.emailMode, "value", () => "production");
  try {
    const f = fixture({ send: undefined });
    await f.process(registration());
    assert.equal(f.delivery().status, "skipped");
    assert.equal(f.delivery().skipReason, "EMAIL_EXTERNAL_EFFECT_BLOCKED");
    assert.equal(f.delivery().attempts, 1, "one reserved processor attempt, zero SES requests");
  } finally { mode.mock.restore(); }
});

test("concurrent processors: one atomic reservation and one sender call", async () => {
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const f = fixture();
  f.dependencies.send = async request => { f.sends.push(request); await barrier; return accepted; };
  const first = createWelcomeRegistrationProcessor(f.dependencies);
  const second = createWelcomeRegistrationProcessor(f.dependencies);
  const running = first(registration());
  const other = await second(registration({}, "second-event"));
  assert.equal(other.outcome, "already_exists");
  assert.equal(f.sends.length, 1);
  assert.equal(f.delivery().status, "dispatching");
  release();
  assert.equal((await running).outcome, "recorded");
  assert.equal(f.delivery().sourceEventId, "synthetic-auth-event");
  assert.equal(f.sends.length, 1);
});

for (const status of ["accepted", "failed", "unknown", "dispatching", "skipped"]) {
  test(`any existing ${status} reservation blocks even a different event, without lease or mutation`, async () => {
    const f = fixture();
    const previous = { status, attempts: status === "skipped" ? 0 : 1,
      startedAt: new Date("2000-01-01"), updatedAt: new Date("2000-01-01"),
      sourceEventId: "previous-event", correlationId: "previous-correlation" };
    f.records.set("welcomeEmailDeliveries/synthetic-new-user", previous);
    assert.deepEqual(await f.process(registration()), { outcome: "already_exists" });
    assert.deepEqual(f.delivery(), previous);
    assert.equal(f.sends.length, 0);
    assert.equal(f.writes.length, 0);
  });
}

test("different UIDs have independent reservations", async () => {
  const f = fixture();
  await Promise.all([f.process(registration()), f.process(registration({ uid: "another-user" }))]);
  assert.equal(f.records.size, 2);
  assert.equal(f.sends.length, 2);
  assert.notEqual(f.sends[0].metadata.correlationId, f.sends[1].metadata.correlationId);
});

for (const uid of [undefined, "", " ", "other/path", "..", "__reserved__", "a\n", "a".repeat(129)]) {
  test(`invalid UID ${JSON.stringify(uid)} fails before reservation`, async () => {
    const f = fixture();
    await assert.rejects(f.process(registration({ uid })), /WELCOME_INVALID_UID/);
    assert.equal(f.records.size, 0);
    assert.equal(f.sends.length, 0);
  });
}

test("invalid source event fails before reservation", async () => {
  const f = fixture();
  for (const sourceEventId of [null, "", " ", "x\n", "x".repeat(257)]) {
    await assert.rejects(f.process(registration({}, sourceEventId)), /WELCOME_INVALID_SOURCE_EVENT/);
  }
  assert.equal(f.records.size, 0);
  assert.equal(f.sends.length, 0);
});

for (const committed of [false, true]) {
  test(`reservation error, committed=${committed}: never send after unconfirmed acquisition`, async () => {
    const f = fixture();
    const reserve = f.dependencies.store.reserve;
    f.dependencies.store.reserve = async (...args) => {
      if (committed) await reserve(...args);
      throw new Error("sensitive provider diagnostic");
    };
    await assert.rejects(f.process(registration()), /^Error: WELCOME_RESERVATION_FAILED$/);
    assert.equal(f.sends.length, 0);
    assert.equal(f.logs.at(-1).state, "reservation_failed");
    f.dependencies.store.reserve = reserve;
    if (committed) assert.equal((await f.process(registration())).outcome, "already_exists");
    else assert.equal((await f.process(registration())).outcome, "recorded");
    assert.equal(f.sends.length, committed ? 0 : 1);
  });
}

for (const [state, errorCode] of [["failed", "SES_REJECTED"], ["failed", "SES_ACCESS_DENIED"],
  ["failed", "SES_THROTTLED"], ["failed", "SES_CONFIGURATION_ERROR"],
  ["unknown", "SES_TIMEOUT"], ["unknown", "SES_UNKNOWN_OUTCOME"], ["unknown", "SES_INVALID_RESPONSE"]]) {
  test(`SES ${errorCode} records ${state}, never retries`, async () => {
    let calls = 0;
    const f = fixture({ send: async () => { calls++; return failure(state, errorCode); } });
    await f.process(registration());
    assert.equal(f.delivery().status, state);
    assert.equal(f.delivery().errorCode, errorCode);
    assert.equal(f.delivery().attempts, 1);
    assert.equal(f.delivery().messageId, undefined);
    await f.process(registration());
    assert.equal(calls, 1);
  });
}

test("unexpected sender exception is unknown and never logs raw errors", async () => {
  const f = fixture({ send: async () => { throw new Error("token-and-secret@example.invalid"); } });
  await f.process(registration());
  assert.equal(f.delivery().status, "unknown");
  assert.equal(f.delivery().errorCode, "SES_UNKNOWN_OUTCOME");
  assert.doesNotMatch(JSON.stringify(f.logs), /token-and-secret|example\.invalid|stack/);
});

for (const result of [failure("failed", "EMAIL_RENDER_FAILED"), failure("blocked", "EMAIL_SECRETS_MISSING")]) {
  test(`pre-SES failure ${result.errorCode} is skipped, not an SES rejection`, async () => {
    const f = fixture({ send: async () => result });
    await f.process(registration());
    assert.equal(f.delivery().status, "skipped");
    assert.equal(f.delivery().skipReason, result.errorCode);
    assert.equal(f.delivery().errorCode, undefined);
  });
}

for (const failures of [1, 2]) {
  test(`accepted then ${failures} persistence failures: bounded writes, never resend`, async () => {
    const f = fixture();
    const complete = f.dependencies.store.complete;
    let writes = 0;
    f.dependencies.store.complete = async (...args) => {
      if (++writes <= failures) throw new Error("private Firestore diagnostic");
      return complete(...args);
    };
    const result = await f.process(registration());
    assert.equal(writes, 2);
    assert.equal(f.sends.length, 1);
    assert.equal(result.outcome, failures === 1 ? "recorded" : "persistence_failed");
    assert.equal(result.delivery.messageId, accepted.messageId);
    assert.equal(f.delivery().status, failures === 1 ? "accepted" : "dispatching");
    if (failures === 2) {
      assert.equal(f.logs.at(-1).errorCode, "WELCOME_RESULT_PERSIST_FAILED");
      assert.equal(f.logs.at(-1).messageId, accepted.messageId);
    }
    assert.equal((await f.process(registration())).outcome, "already_exists");
    assert.equal(f.sends.length, 1);
  });
}

test("lost acknowledgement after result commit repeats identical persistence only", async () => {
  const f = fixture();
  const complete = f.dependencies.store.complete;
  let calls = 0;
  f.dependencies.store.complete = async (...args) => {
    await complete(...args);
    if (++calls === 1) throw new Error("connection lost after commit");
  };
  await f.process(registration());
  assert.equal(f.sends.length, 1);
  assert.equal(f.writes.length, 2);
  assert.deepEqual(f.writes[0], f.writes[1]);
  assert.equal(f.delivery().status, "accepted");
});

test("structured logs contain only approved metadata and logging failure never changes sending", async () => {
  const f = fixture();
  await f.process(registration());
  for (const entry of f.logs) {
    assert.deepEqual(Object.keys(entry).sort(), ["template", "userId", "correlationId", "sourceEventId", "mode", "state", "messageId", "errorCode", "attempts"].sort());
    assert.doesNotMatch(JSON.stringify(entry), /Agustín|new-user@example|https:|<html|token|stack/);
  }
  const broken = fixture({ log: () => { throw new Error("logger failed"); } });
  await broken.process(registration());
  await broken.process(registration());
  assert.equal(broken.sends.length, 1);
  assert.equal(broken.delivery().status, "accepted");
});

test("store only treats Firestore ALREADY_EXISTS as a lost reservation", async () => {
  for (const code of [6, "already-exists", 7, 14, "unknown", undefined]) {
    const store = createWelcomeDeliveryStore(() => ({ doc: () => ({
      create: async () => { throw Object.assign(new Error("private SDK details"), { code }); },
    }) }));
    if (code === 6 || code === "already-exists") assert.equal(await store.reserve("user", {}), false);
    else await assert.rejects(store.reserve("user", {}), /^Error: WELCOME_RESERVATION_FAILED$/);
  }
});

test("correlation allowlist accepts only welcome/test UUID v4 through the central sender", async () => {
  let sends = 0;
  const service = createTransactionalEmailService({ getMode: () => "sandbox",
    render: async () => ({ subject: "Synthetic", html: "<p>Synthetic</p>", text: "Synthetic" }),
    transport: async () => { sends++; return accepted; }, log: () => {} });
  const uuid = "12345678-1234-4123-8123-123456789012";
  for (const prefix of ["welcome", "email-test"]) {
    assert.equal((await service({ to: config.SANDBOX_RECIPIENT, template: "test", data: {},
      metadata: { correlationId: `${prefix}-${uuid}` } })).ok, true);
  }
  for (const correlationId of ["arbitrary", `other-${uuid}`, `welcome-${uuid}\n`,
    `welcome-${uuid.replace("4123", "1123")}`, "welcome-user@example.invalid", 123]) {
    const result = await service({ to: config.SANDBOX_RECIPIENT, template: "test", data: {}, metadata: { correlationId } });
    assert.equal(result.errorCode, "EMAIL_INVALID_REQUEST");
  }
  assert.equal(sends, 2);
});

test("processor is backend-only and separate from the event adapter", () => {
  const source = readFileSync(new URL("./src/emails/welcomeRegistration.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /SESv2Client|SendEmailCommand|onCall|onRequest|onCreate|onUserCreated/);
  const shared = readFileSync(new URL("./src/emails/registrationEmail.ts", import.meta.url), "utf8");
  assert.match(shared, /sendTransactionalEmail/);
  assert.doesNotMatch(shared, /SESv2Client|SendEmailCommand|onCall|onRequest|onCreate/);
  assert.equal(existsSync(new URL("./src/emails/welcomeRegistrationFunction.ts", import.meta.url)), true);
  assert.doesNotMatch(readFileSync(new URL("./src/index.ts", import.meta.url), "utf8"), /from ["']\.\/emails\/welcomeRegistration["']/);
});

test.after(() => { assert.equal(networkAttempts, 0, "no test attempted external effects"); mock.restoreAll(); });
