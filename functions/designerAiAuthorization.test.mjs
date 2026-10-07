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
const secret = mock.method(Object.getPrototypeOf(defineSecret("SYNTHETIC_TEST_SECRET")), "value", () => "synthetic-key");
const service = requireBuiltModule("lib/designerAi/service.js");
const client = {};
const createClient = mock.method(service, "createDesignerAiOpenAiClient", () => client);
let interpretFailure = null;
const interpret = mock.method(service, "interpretDesignerAiChat", async ({ userContext }) => {
  if (interpretFailure) throw interpretFailure;
  return {
  contractVersion: "synthetic", batchId: "batch-1", intent: "clarify", assistantMessage: `Hola, ${userContext.registeredFirstName}.`,
  actions: [], resolutions: [], controlRequest: null, traceId: "trace", openAiRequestId: "request", latencyMs: 1, repairCount: 0, telemetry: { providerAttempts: 1 },
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

test("opening greeting uses the authenticated profile without reading secret or invoking OpenAI", async () => {
  const before = [secret.mock.callCount(), createClient.mock.callCount(), interpret.mock.callCount()];
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
  }
  assert.deepEqual([secret.mock.callCount(), createClient.mock.callCount(), interpret.mock.callCount()], before);
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
  } finally { interpretFailure = null; }
});
