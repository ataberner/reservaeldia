import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";
import { DESIGNER_AI_CONTRACT_VERSION, DESIGNER_AI_AUTO_START_MESSAGE, sanitizeCapabilitySnapshot } from "../shared/designerAiCapabilityContract.js";

const require = createRequire(import.meta.url);
const noNetwork = () => { throw new Error("Network forbidden in assistant authorization tests"); };
for (const protocol of ["node:http", "node:https"]) {
  for (const method of ["request", "get"]) mock.method(require(protocol), method, noNetwork);
}
mock.method(require("node:net").Socket.prototype, "connect", noNetwork);
mock.method(require("node:tls"), "connect", noNetwork);
mock.method(globalThis, "fetch", noNetwork);
const logs = [];
for (const level of ["info", "warn", "error"]) mock.method(require("firebase-functions/logger"), level, (...args) => { logs.push({ level, args }); });

const { defineSecret } = require("firebase-functions/params");
let secretFailure = null;
const secret = mock.method(Object.getPrototypeOf(defineSecret("SYNTHETIC_TEST_SECRET")), "value", () => {
  if (secretFailure) throw secretFailure;
  return "synthetic-key";
});
const service = requireBuiltModule("lib/designerAi/service.js");
const { DesignerAiAdmissionError } = requireBuiltModule("lib/designerAi/admission.js");
const admissionModule = requireBuiltModule("lib/designerAi/admissionStore.js");
let admissionFailure = null;
let dispatchFailure = null;
let settlementFailures = [];
const effects = [];
const reservation = {
  requestKey: "request_synthetic", userKey: "user_synthetic", globalKey: "global_synthetic", ownerToken: "synthetic-owner",
  reservedMicrousd: 1_000_000,
  pricing: { inputMicrousdPerMillionTokens: 500_000, outputMicrousdPerMillionTokens: 1_800_000 },
};
const reserve = mock.fn(async () => {
  effects.push("reserve");
  if (admissionFailure) throw admissionFailure;
  return reservation;
});
const markDispatching = mock.fn(async () => {
  effects.push("dispatch");
  if (dispatchFailure) throw dispatchFailure;
});
const settle = mock.fn(async () => {
  effects.push("settle");
  if (settlementFailures.length) throw settlementFailures.shift();
});
const admissionFactory = mock.method(admissionModule, "createDesignerAiAdmissionStore", () => ({ reserve, markDispatching, settle }));
const client = {};
const createClient = mock.method(service, "createDesignerAiOpenAiClient", () => { effects.push("client"); return client; });
let interpretFailure = null;
const interpret = mock.method(service, "interpretDesignerAiChat", async ({ userContext }) => {
  effects.push("provider");
  if (interpretFailure) throw interpretFailure;
  return {
  contractVersion: "synthetic", batchId: "batch-1", intent: "clarify", assistantMessage: `Hola, ${userContext.registeredFirstName}.`,
  actions: [], resolutions: [], controlRequest: null, traceId: "trace", openAiRequestId: "request", latencyMs: 1, repairCount: 0,
  telemetry: { providerAttempts: 1, usageReportedAttempts: 1, inputTokens: 200, outputTokens: 10 },
  };
});
const { designerAiChat } = requireBuiltModule("lib/index.js");
const profileReads = [];
let profileFailure = null;
mock.method(require("firebase-admin").firestore(), "collection", (collection) => {
  assert.equal(collection, "usuarios");
  return { doc: (uid) => ({ get: async () => {
    profileReads.push(uid);
    if (profileFailure) throw profileFailure;
    return { exists: true, data: () => ({ nombre: "Ana", email: "private@synthetic.invalid" }) };
  } }) };
});

function validPayload(overrides = {}) {
  return {
    contractVersion: DESIGNER_AI_CONTRACT_VERSION,
    draftId: "synthetic-draft", requestCreatedAt: Date.now(),
    clientMessageId: "synthetic", entryMode: "first_entry", message: "Hola",
    recentTurns: [], capabilitySnapshot: sanitizeCapabilitySnapshot({ revision: "synthetic" }),
    ...overrides,
  };
}

test("designerAiChat rejects unauthenticated callers before profile, secret or provider access", async () => {
  for (const auth of [undefined, null, { uid: "" }]) {
    await assert.rejects(designerAiChat.run({ auth, data: {} }), error => error.code === "unauthenticated");
  }
  assert.equal(secret.mock.callCount(), 0);
  assert.equal(createClient.mock.callCount(), 0);
  assert.equal(interpret.mock.callCount(), 0);
  assert.equal(reserve.mock.callCount(), 0);
  assert.deepEqual(profileReads, []);
});

test("designerAiChat serves users, admins and superadmins and only reads the authenticated profile", async () => {
  const previous = process.env.SUPERADMINS_UIDS;
  process.env.SUPERADMINS_UIDS = "super-1";
  try {
    for (const auth of [{ uid: "user-1", token: {} }, { uid: "admin-1", token: { admin: true } }, { uid: "super-1", token: {} }]) {
      const payload = validPayload();
      const result = await designerAiChat.run({ auth, data: payload });
      assert.equal(result.assistantMessage, "Hola, Ana.");
      assert.equal(profileReads.at(-1), auth.uid);
      assert.deepEqual(interpret.mock.calls.at(-1).arguments[0].userContext, { registeredFirstName: "Ana" });
      assert.equal(interpret.mock.calls.at(-1).arguments[0].client, client);
      assert.deepEqual(interpret.mock.calls.at(-1).arguments[0].payload, payload);
      for (const field of ["traceId", "openAiRequestId", "repairCount", "latencyMs", "telemetry"]) assert.equal(field in result, false);
    }
    assert.deepEqual(profileReads, ["user-1", "admin-1", "super-1"]);
    assert.equal(secret.mock.callCount(), 3);
    assert.equal(interpret.mock.callCount(), 3);
  } finally {
    if (typeof previous === "string") process.env.SUPERADMINS_UIDS = previous;
    else delete process.env.SUPERADMINS_UIDS;
  }
});

test("designerAiChat validates requests before profile, secret and provider access", async () => {
  const before = [profileReads.length, secret.mock.callCount(), createClient.mock.callCount(), interpret.mock.callCount()];
  for (const data of [{}, validPayload({ userUid: "other-user" })]) {
    await assert.rejects(designerAiChat.run({ auth: { uid: "user-1" }, data }), (error) => error.code === "invalid-argument");
  }
  assert.deepEqual([profileReads.length, secret.mock.callCount(), createClient.mock.callCount(), interpret.mock.callCount()], before);
});

test("old clients receive a visible nonretryable update notice before quota or paid work", async () => {
  const before = [reserve.mock.callCount(), profileReads.length, secret.mock.callCount(), createClient.mock.callCount(), interpret.mock.callCount()];
  for (const contractVersion of ["2.4.0", "2.5.0"]) {
    await assert.rejects(designerAiChat.run({ auth: { uid: "synthetic-user" }, data: validPayload({ contractVersion }) }), error => {
      assert.equal(error.code, "failed-precondition");
      assert.equal(error.details.category, "assistant_admission");
      assert.equal(error.details.reason, "client_update_required");
      assert.equal(error.details.retryable, false);
      assert.match(error.details.summary, /Recargá la página/);
      return true;
    });
  }
  assert.deepEqual([reserve.mock.callCount(), profileReads.length, secret.mock.callCount(), createClient.mock.callCount(), interpret.mock.callCount()], before);
});

test("exported callable bounds adversarial bodies before admission, recursive SDK decoding or provider work", async () => {
  let deep = { marker: "synthetic" };
  for (let index = 0; index < 3000; index++) deep = { nested: deep };
  const before = [reserve.mock.callCount(), profileReads.length, secret.mock.callCount(), createClient.mock.callCount(), interpret.mock.callCount()];
  for (const capabilitySnapshot of [deep, { oversized: Array(14_000).fill("x") },
    JSON.parse('{"__proto__":{"polluted":true}}'),
    { "@type": "type.googleapis.com/google.protobuf.Int64Value", value: "1" }]) {
    await assert.rejects(designerAiChat.run({ auth: { uid: "synthetic-user" }, data: validPayload({ capabilitySnapshot }) }), error => error.code === "invalid-argument");
  }
  assert.deepEqual([reserve.mock.callCount(), profileReads.length, secret.mock.callCount(), createClient.mock.callCount(), interpret.mock.callCount()], before);
  assert.equal({}.polluted, undefined);
});

test("opening greeting uses the authenticated profile without reading secret or invoking OpenAI", async () => {
  const before = [secret.mock.callCount(), createClient.mock.callCount(), interpret.mock.callCount()];
  const dispatchesBefore = markDispatching.mock.callCount();
  for (const entryMode of ["first_entry", "reentry"]) {
    const result = await designerAiChat.run({ auth: { uid: "opening-user" }, data: validPayload({ entryMode, message: DESIGNER_AI_AUTO_START_MESSAGE }) });
    assert.match(result.assistantMessage, /^¡Hola, Ana!/);
    assert.equal(result.entryGreeting, result.assistantMessage);
    assert.deepEqual(result.actions, []);
    assert.deepEqual(result.resolutions, []);
    assert.equal(result.controlRequest, null);
    assert.equal(profileReads.at(-1), "opening-user");
    assert.equal(logs.at(-1).args[1].responseKind, "opening");
    assert.equal(logs.at(-1).args[1].providerAttempts, 0);
    assert.equal(reserve.mock.calls.at(-1).arguments[0].maxInputTokens, 0);
    assert.equal(reserve.mock.calls.at(-1).arguments[0].maxOutputTokens, 0);
    assert.deepEqual(settle.mock.calls.at(-1).arguments[1], { outcome: "succeeded", usageComplete: true, actualMicrousd: 0 });
  }
  assert.deepEqual([secret.mock.callCount(), createClient.mock.callCount(), interpret.mock.callCount()], before);
  assert.equal(markDispatching.mock.callCount(), dispatchesBefore);
});

test("password verification and anonymous authentication are enforced before any admission or paid work", async () => {
  const before = [reserve.mock.callCount(), profileReads.length, secret.mock.callCount(), interpret.mock.callCount()];
  for (const token of [
    { email_verified: false, firebase: { sign_in_provider: "password" } },
    { firebase: { sign_in_provider: "anonymous" } },
    { email_verified: false, firebase: { sign_in_provider: "custom", identities: { email: ["synthetic@invalid.example"] } } },
  ]) {
    await assert.rejects(designerAiChat.run({ auth: { uid: "synthetic-unverified", token }, data: validPayload() }), error => error.code === "permission-denied");
  }
  assert.deepEqual([reserve.mock.callCount(), profileReads.length, secret.mock.callCount(), interpret.mock.callCount()], before);
  for (const token of [
    { email_verified: true, firebase: { sign_in_provider: "password" } },
    { firebase: { sign_in_provider: "google.com" } },
    { email_verified: false, firebase: { sign_in_provider: "password", identities: { "google.com": ["synthetic-google-id"] } } },
  ]) {
    await designerAiChat.run({ auth: { uid: "synthetic-verified", token }, data: validPayload({ entryMode: "continuation" }) });
  }
});

test("draft, rate, duplicate and configuration admission failures cannot touch profile, secret or provider", async () => {
  const before = [profileReads.length, secret.mock.callCount(), createClient.mock.callCount(), interpret.mock.callCount()];
  for (const reason of ["draft_unavailable", "minute_quota", "daily_quota", "concurrent_request", "global_budget",
    "duplicate_active", "duplicate_completed", "duplicate_unknown", "request_conflict", "disabled", "configuration_invalid", "accounting_unavailable"]) {
    admissionFailure = new DesignerAiAdmissionError(reason);
    try {
      await assert.rejects(designerAiChat.run({ auth: { uid: "synthetic-user" }, data: validPayload() }), error => error === admissionFailure);
    } finally { admissionFailure = null; }
  }
  assert.deepEqual([profileReads.length, secret.mock.callCount(), createClient.mock.callCount(), interpret.mock.callCount()], before);
});

test("callable supplies canonical lifecycle policy and server-calculated identity, digest and attempt budget", async () => {
  const { isDraftEditable } = admissionFactory.mock.calls[0].arguments[1];
  assert.equal(isDraftEditable({ estadoBorrador: "borrador_activo" }), true);
  assert.equal(isDraftEditable({}), true); // Canonical active legacy draft.
  assert.equal(isDraftEditable({ estadoBorrador: "borrador_papelera" }), false);
  assert.equal(isDraftEditable({ enPapeleraAt: new Date() }), false);
  const payload = validPayload({ entryMode: "continuation" });
  const effectStart = effects.length;
  await designerAiChat.run({ auth: { uid: "verified-caller" }, data: payload });
  const admitted = reserve.mock.calls.at(-1).arguments[0];
  assert.equal(admitted.uid, "verified-caller");
  assert.equal(admitted.draftId, payload.draftId);
  assert.equal(admitted.clientMessageId, payload.clientMessageId);
  assert.equal(admitted.requestCreatedAt, payload.requestCreatedAt);
  assert.equal(admitted.model, service.DESIGNER_AI_MODEL);
  assert.match(admitted.payloadDigest, /^[a-f0-9]{64}$/);
  assert.ok(admitted.maxInputTokens > 0);
  assert.equal(admitted.maxOutputTokens, 12_000);
  assert.deepEqual(effects.slice(effectStart), ["reserve", "client", "dispatch", "provider", "settle"]);
  assert.deepEqual(settle.mock.calls.at(-1).arguments[1], { outcome: "succeeded", usageComplete: true, actualMicrousd: 118 });
});

test("failure before provider dispatch reconciles zero paid usage and does not invoke the provider", async () => {
  const before = interpret.mock.callCount();
  secretFailure = new Error("SYNTHETIC_PRIVATE_SECRET_FAILURE");
  try {
    await assert.rejects(designerAiChat.run({ auth: { uid: "synthetic-user" }, data: validPayload({ entryMode: "continuation" }) }), error => error.code === "failed-precondition");
    assert.deepEqual(settle.mock.calls.at(-1).arguments[1], { outcome: "failed", usageComplete: true, actualMicrousd: 0 });
  } finally { secretFailure = null; }
  dispatchFailure = new DesignerAiAdmissionError("reservation_invalid");
  try {
    await assert.rejects(designerAiChat.run({ auth: { uid: "synthetic-user" }, data: validPayload({ entryMode: "continuation" }) }), error => error.reason === "reservation_invalid");
    assert.deepEqual(settle.mock.calls.at(-1).arguments[1], { outcome: "failed", usageComplete: true, actualMicrousd: 0 });
  } finally { dispatchFailure = null; }
  assert.equal(interpret.mock.callCount(), before);
  assert.equal(JSON.stringify(logs).includes("SYNTHETIC_PRIVATE_SECRET_FAILURE"), false);
});

test("provider timeout without complete usage retains unknown spending, known failed usage is reconciled", async () => {
  for (const complete of [false, true]) {
    interpretFailure = new service.DesignerAiServiceError(complete ? "malformed-output" : "timeout", "Synthetic provider error");
    interpretFailure.telemetry = { providerAttempts: complete ? 1 : 2, usageReportedAttempts: 1, inputTokens: 200, outputTokens: 10 };
    try {
      await assert.rejects(designerAiChat.run({ auth: { uid: "synthetic-user" }, data: validPayload({ entryMode: "continuation" }) }));
      assert.deepEqual(settle.mock.calls.at(-1).arguments[1], {
        outcome: complete ? "failed" : "unknown", usageComplete: complete, actualMicrousd: 118,
      });
    } finally { interpretFailure = null; }
  }
});

test("unconfirmed accounting after provider success returns no result and never retries the model", async () => {
  const callsBefore = interpret.mock.callCount();
  settlementFailures = [new DesignerAiAdmissionError("accounting_unavailable")];
  try {
    await assert.rejects(designerAiChat.run({ auth: { uid: "synthetic-user" }, data: validPayload({ entryMode: "continuation" }) }), error => error.reason === "accounting_unavailable");
    assert.equal(interpret.mock.callCount(), callsBefore + 1);
    assert.deepEqual(settle.mock.calls.at(-1).arguments[1], { outcome: "failed", usageComplete: true, actualMicrousd: 118 });
  } finally { settlementFailures = []; }
});

test("late valid responses still settle known usage within the accounting window", async () => {
  let clock = Date.now();
  const startedAt = clock;
  const time = mock.method(Date, "now", () => clock);
  const callsBefore = settle.mock.callCount();
  const provider = mock.method(service, "interpretDesignerAiChat", async ({ deadline }) => {
    assert.equal(deadline.remainingMs(), 37_000, "three seconds remain reserved for settlement");
    clock = startedAt + 39_500;
    return {
      contractVersion: DESIGNER_AI_CONTRACT_VERSION, batchId: "late-valid", intent: "clarify",
      assistantMessage: "¿Qué Dress Code quieren indicar?", actions: [], resolutions: [], controlRequest: null,
      traceId: "synthetic-trace", openAiRequestId: "synthetic-request", latencyMs: 39_500, repairCount: 1,
      telemetry: { providerAttempts: 2, usageReportedAttempts: 2, inputTokens: 1000, outputTokens: 100 },
    };
  });
  try {
    const result = await designerAiChat.run({ auth: { uid: "synthetic-user" }, data: validPayload({ entryMode: "continuation" }) });
    assert.equal(result.batchId, "late-valid");
    assert.equal(settle.mock.callCount(), callsBefore + 1);
    assert.deepEqual(settle.mock.calls.at(-1).arguments[1], { outcome: "succeeded", usageComplete: true, actualMicrousd: 680 });
  } finally { provider.mock.restore(); time.mock.restore(); }
});

test("provider work deadline leaves time to release concurrency while retaining uncertain cost", async () => {
  let clock = Date.now();
  const startedAt = clock;
  const time = mock.method(Date, "now", () => clock);
  const provider = mock.method(service, "interpretDesignerAiChat", async () => {
    clock = startedAt + 37_000;
    const error = new service.DesignerAiServiceError("timeout", "Synthetic timeout");
    error.telemetry = { providerAttempts: 2, usageReportedAttempts: 1, inputTokens: 200, outputTokens: 10 };
    throw error;
  });
  try {
    await assert.rejects(designerAiChat.run({ auth: { uid: "synthetic-user" }, data: validPayload({ entryMode: "continuation" }) }), error => error.code === "deadline-exceeded");
    assert.deepEqual(settle.mock.calls.at(-1).arguments[1], { outcome: "unknown", usageComplete: false, actualMicrousd: 118 });
  } finally { provider.mock.restore(); time.mock.restore(); }
});

test("raw admission and settlement deadlines use the timeout category and preserve known telemetry", async () => {
  const { DesignerAiDeadlineError } = requireBuiltModule("lib/designerAi/deadline.js");
  const request = () => designerAiChat.run({ auth: { uid: "synthetic-user" }, data: validPayload({ entryMode: "continuation" }) });
  const timeout = error => {
    assert.equal(error.code, "deadline-exceeded");
    assert.equal(error.details.category, "provider_timeout");
    return true;
  };
  admissionFailure = new DesignerAiDeadlineError();
  try { await assert.rejects(request(), timeout); } finally { admissionFailure = null; }
  settlementFailures = [new DesignerAiDeadlineError()];
  try {
    await assert.rejects(request(), timeout);
    assert.deepEqual(settle.mock.calls.at(-1).arguments[1], { outcome: "failed", usageComplete: true, actualMicrousd: 118 });
    assert.equal(logs.at(-1).args[1].telemetry.inputTokens, 200);
    assert.equal(logs.at(-1).args[1].telemetry.outputTokens, 10);
  } finally { settlementFailures = []; }
});

test("accounting never extends the overall operation deadline", async () => {
  let clock = Date.now();
  const startedAt = clock;
  const time = mock.method(Date, "now", () => clock);
  const callsBefore = settle.mock.callCount();
  const provider = mock.method(service, "interpretDesignerAiChat", async () => {
    clock = startedAt + 40_000;
    const error = new service.DesignerAiServiceError("timeout", "Synthetic timeout");
    error.telemetry = { providerAttempts: 1, usageReportedAttempts: 1, inputTokens: 200, outputTokens: 10 };
    throw error;
  });
  try {
    await assert.rejects(designerAiChat.run({ auth: { uid: "synthetic-user" }, data: validPayload({ entryMode: "continuation" }) }), error => error.code === "deadline-exceeded");
    assert.equal(settle.mock.callCount(), callsBefore);
    assert.equal(logs.at(-1).args[1].telemetry.inputTokens, 200);
    assert.ok(logs.some(entry => entry.args[1].category === "accounting_pending"));
  } finally { provider.mock.restore(); time.mock.restore(); }
});

test("continuation skips the profile read and keeps stage diagnostics server-side", async () => {
  const before = profileReads.length;
  const result = await designerAiChat.run({ auth: { uid: "returning-user" }, data: validPayload({ entryMode: "continuation" }) });
  assert.equal(profileReads.length, before);
  assert.deepEqual(interpret.mock.calls.at(-1).arguments[0].userContext, { registeredFirstName: null });
  assert.equal("telemetry" in result, false);
  const recorded = logs.at(-1).args[1];
  assert.equal(recorded.responseKind, "model");
  assert.equal(recorded.telemetry.providerAttempts, 1);
  assert.equal(typeof recorded.latencyMs, "number");
  assert.equal(typeof recorded.profileReadMs, "number");
});

test("profile read failure returns a no-name greeting and never logs raw Firestore errors", async () => {
  const sentinel = "PRIVATE_FIRESTORE_DETAILS";
  profileFailure = { message: sentinel, metadata: { private: sentinel } };
  try {
    const result = await designerAiChat.run({ auth: { uid: "opening-user" }, data: validPayload({ message: DESIGNER_AI_AUTO_START_MESSAGE }) });
    assert.match(result.assistantMessage, /^¡Hola!/);
    assert.equal(JSON.stringify(logs).includes(sentinel), false);
    assert.ok(logs.some((entry) => entry.level === "warn" && entry.args[1].category === "profile_read_failed"));
  } finally { profileFailure = null; }
});

test("internal validator diagnostics containing dynamic IDs never enter callable logs or errors", async () => {
  const sentinel = "PRIVATE_DYNAMIC_LEAF_ID";
  const capabilitySnapshot = validPayload().capabilitySnapshot;
  capabilitySnapshot.ledger.leaves = [{ id: `rsvp.question.${sentinel}.label`, block: "outside_guided_flow", status: "pending", provenance: "unknown", rule: null, fingerprint: "" }];
  try {
    service.validateDesignerAiModelResult({ intent: "apply", assistantMessage: "Seguimos.", actions: [], controlRequest: null,
      resolutions: [{ leafId: capabilitySnapshot.ledger.leaves[0].id, status: "deferred_by_user", rule: null }],
    }, capabilitySnapshot);
    assert.fail("Expected the invalid resolution to fail");
  } catch (error) {
    assert.equal(error.kind, "malformed-output");
    assert.ok(error.message.includes(sentinel));
    interpretFailure = error;
  }
  try {
    await assert.rejects(designerAiChat.run({ auth: { uid: "user-1" }, data: validPayload({ entryMode: "continuation" }) }), (error) => {
      assert.equal(error.code, "internal");
      assert.equal(JSON.stringify(error).includes(sentinel), false);
      return true;
    });
    assert.equal(JSON.stringify(logs).includes(sentinel), false);
    assert.equal(logs.at(-1).args[1].failureReason, "La respuesta del modelo no cumplió el formato o las validaciones esperadas.");
    assert.equal(logs.at(-1).args[1].validationCode, "resolution_invalid");
  } finally { interpretFailure = null; }
});

test("callable logs accept only a fixed validation code, without exposing it to the user", async () => {
  const sentinel = "PRIVATE_UNTRUSTED_DIAGNOSTIC";
  interpretFailure = new service.DesignerAiServiceError("malformed-output", sentinel, null, null, sentinel);
  try {
    await assert.rejects(designerAiChat.run({ auth: { uid: "user-1" }, data: validPayload({ entryMode: "continuation" }) }), error => {
      assert.equal(error.code, "internal");
      assert.equal(JSON.stringify(error).includes(sentinel), false);
      assert.equal("validationCode" in error.details, false);
      return true;
    });
    assert.equal(logs.at(-1).args[1].validationCode, "output_shape_invalid");
    assert.equal(JSON.stringify(logs).includes(sentinel), false);
  } finally { interpretFailure = null; }
});
