import test, { mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const noNetwork = () => { throw new Error("Network forbidden in assistant admission tests"); };
for (const protocol of ["node:http", "node:https"]) {
  for (const method of ["request", "get"]) mock.method(require(protocol), method, noNetwork);
}
mock.method(require("node:net").Socket.prototype, "connect", noNetwork);
mock.method(require("node:tls"), "connect", noNetwork);
mock.method(globalThis, "fetch", noNetwork);

// These tests exercise current source without writing build artifacts or initializing Admin.
const ts = require("typescript");
function loadSource(relative, dependencies = {}) {
  const filename = path.join(root, "src", relative);
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = name => Object.hasOwn(dependencies, name) ? dependencies[name] : originalRequire(name);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  loaded._compile(outputText, filename);
  return loaded.exports;
}
const policy = loadSource("designerAi/admission.ts");
const { createDesignerAiAdmissionStore } = loadSource("designerAi/admissionStore.ts", { "./admission": policy });
const {
  DESIGNER_AI_ADMISSION_CONFIG_PATH, DESIGNER_AI_USAGE_RETENTION_MS,
  DESIGNER_AI_REQUEST_MAX_AGE_MS, DESIGNER_AI_RESERVATION_LEASE_MS,
  calculateDesignerAiCostMicrousd, requireDesignerAiIdentity, parseDesignerAiAdmissionConfig,
} = policy;

const start = Date.UTC(2026, 9, 7, 12);
const config = {
  schemaVersion: 1, enabled: true, policyVersion: "synthetic-test", model: "synthetic-model",
  perUserMinuteLimit: 5, perUserDayLimit: 10, dailyBudgetMicrousd: 1_000_000,
  inputMicrousdPerMillionTokens: 1_000_000, outputMicrousdPerMillionTokens: 2_000_000,
};
const payload = (overrides = {}) => ({
  uid: "synthetic-user", draftId: "synthetic-draft", clientMessageId: "synthetic-message",
  requestCreatedAt: start, payloadDigest: "a".repeat(64), model: "synthetic-model", maxInputTokens: 300, maxOutputTokens: 120,
  ...overrides,
});
const rejectsReason = (promise, reason) => assert.rejects(promise, error => error.reason === reason);

function fixture({ configOverrides = {}, initialClock = start } = {}) {
  let clock = initialClock;
  let owner = 0;
  let records = new Map([
    [DESIGNER_AI_ADMISSION_CONFIG_PATH, { ...config, ...configOverrides }],
    ["borradores/synthetic-draft", { userId: "synthetic-user", editable: true }],
  ]);
  let queued = Promise.resolve();
  let failNextCommit = false;
  const snapshot = (map, ref) => ({ exists: map.has(ref.path), data: () => structuredClone(map.get(ref.path)) });
  const db = {
    doc: pathname => ({ path: pathname, get: async () => snapshot(records, { path: pathname }) }),
    runTransaction: operation => {
      // Serialize commits as Firestore retries would; reads after writes fail as on the real API.
      const work = queued.then(async () => {
        const copy = structuredClone(records);
        let wrote = false;
        const tx = {
          get: async ref => { assert.equal(wrote, false, "Transaction read after a write"); return snapshot(copy, ref); },
          create: (ref, value) => { wrote = true; assert.equal(copy.has(ref.path), false); copy.set(ref.path, structuredClone(value)); },
          set: (ref, value) => { wrote = true; copy.set(ref.path, structuredClone(value)); },
          update: (ref, value) => { wrote = true; assert.equal(copy.has(ref.path), true); copy.set(ref.path, { ...copy.get(ref.path), ...structuredClone(value) }); },
        };
        const result = await operation(tx);
        if (failNextCommit) { failNextCommit = false; throw new Error("SYNTHETIC_PRIVATE_FIRESTORE_ERROR"); }
        records = copy;
        return result;
      });
      queued = work.catch(() => {});
      return work;
    },
  };
  const store = createDesignerAiAdmissionStore(db, {
    now: () => clock, createOwnerToken: () => `synthetic-owner-${++owner}`,
    isDraftEditable: draft => draft.editable === true,
  });
  return {
    store, db, advance: ms => { clock += ms; }, get now() { return clock; },
    get records() { return records; }, failCommit: () => { failNextCommit = true; },
    read: handle => records.get(`designerAiUsage/${handle.requestKey}`),
    global: handle => records.get(`designerAiUsage/${handle.globalKey}`),
    user: handle => records.get(`designerAiUsage/${handle.userKey}`),
  };
}

test("identity rejects missing, anonymous and unverified password identities; preserves verified and Google", () => {
  for (const auth of [undefined, null, {}, { uid: "" }]) {
    assert.throws(() => requireDesignerAiIdentity(auth), error => error.reason === "authentication_required");
  }
  assert.throws(() => requireDesignerAiIdentity({ uid: "synthetic", token: { firebase: { sign_in_provider: "anonymous" } } }), error => error.reason === "anonymous_not_allowed");
  assert.throws(() => requireDesignerAiIdentity({ uid: "synthetic", token: { email_verified: false, firebase: { sign_in_provider: "password" } } }), error => error.reason === "email_verification_required");
  for (const token of [{ email_verified: true, firebase: { sign_in_provider: "password" } },
    { firebase: { sign_in_provider: "google.com" } },
    { email_verified: false, firebase: { sign_in_provider: "password", identities: { "google.com": ["synthetic-google-id"] } } }]) {
    assert.equal(requireDesignerAiIdentity({ uid: "synthetic", token }), "synthetic");
  }
  for (const identities of [{ password: ["synthetic-account"] }, { email: ["synthetic@invalid.example"] }]) {
    assert.throws(() => requireDesignerAiIdentity({ uid: "synthetic", token: { email_verified: false, firebase: { sign_in_provider: "custom", identities } } }), error => error.reason === "email_verification_required");
  }
});

test("configuration has no enabled fallback and rejects invalid budgets/rates/limits", () => {
  for (const missing of [null, undefined, {}, { enabled: false }]) {
    assert.throws(() => parseDesignerAiAdmissionConfig(missing), error => error.reason === "disabled");
  }
  for (const change of [{ dailyBudgetMicrousd: 0 }, { dailyBudgetMicrousd: Infinity }, { perUserMinuteLimit: 0 },
    { perUserDayLimit: 1 }, { inputMicrousdPerMillionTokens: "1" }, { outputMicrousdPerMillionTokens: -1 }, { policyVersion: "" }]) {
    assert.throws(() => parseDesignerAiAdmissionConfig({ ...config, ...change }), error => error.reason === "configuration_invalid");
  }
  assert.deepEqual(parseDesignerAiAdmissionConfig(config), config);
  assert.equal(calculateDesignerAiCostMicrousd(1, 0, { inputMicrousdPerMillionTokens: 1, outputMicrousdPerMillionTokens: 1 }), 1);
});

test("one of 20 simultaneous identical requests reserves exactly one provider admission", async () => {
  const f = fixture();
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => f.store.reserve(payload())));
  const accepted = results.filter(result => result.status === "fulfilled");
  assert.equal(accepted.length, 1);
  assert.ok(results.filter(result => result.status === "rejected").every(result => result.reason.reason === "duplicate_active"));
  const reservation = accepted[0].value;
  assert.equal(f.global(reservation).allocatedMicrousd, 540);
  assert.equal(f.user(reservation).dayCount, 1);
});

test("different IDs from one UID cannot bypass the single active request", async () => {
  const f = fixture();
  const results = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => f.store.reserve(payload({ clientMessageId: `request-${index}` }))));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.ok(results.filter(result => result.status === "rejected").every(result => result.reason.reason === "concurrent_request"));
});

test("global budget atomically bounds concurrent requests from different users", async () => {
  const f = fixture({ configOverrides: { dailyBudgetMicrousd: 1080 } });
  for (let index = 0; index < 12; index++) f.records.set(`borradores/draft-${index}`, { userId: `user-${index}`, editable: true });
  const results = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => f.store.reserve(payload({ uid: `user-${index}`, draftId: `draft-${index}` }))));
  const accepted = results.filter(result => result.status === "fulfilled");
  assert.equal(accepted.length, 2);
  assert.equal(f.global(accepted[0].value).allocatedMicrousd, 1080);
  assert.ok(results.filter(result => result.status === "rejected").every(result => result.reason.reason === "global_budget"));
});

test("config is reread inside reservation and changing the rate cannot use a stale estimate", async () => {
  const f = fixture();
  await f.store.loadConfig();
  f.records.set(DESIGNER_AI_ADMISSION_CONFIG_PATH, { ...config, inputMicrousdPerMillionTokens: 2_000_000 });
  assert.equal((await f.store.reserve(payload())).reservedMicrousd, 840);
});

test("a model change cannot silently reuse another model's accounting rates", async () => {
  const f = fixture();
  await rejectsReason(f.store.reserve(payload({ model: "other-model" })), "configuration_invalid");
});

test("unknown outcome retains full charge; duplicate and completion cannot refund it", async () => {
  const f = fixture();
  const reservation = await f.store.reserve(payload());
  await f.store.markDispatching(reservation);
  await f.store.settle(reservation, { outcome: "unknown", actualMicrousd: 0, usageComplete: true });
  await f.store.settle(reservation, { outcome: "succeeded", actualMicrousd: 0, usageComplete: true });
  assert.equal(f.global(reservation).allocatedMicrousd, 540);
  assert.equal(f.read(reservation).outcome, "unknown");
  assert.equal(f.user(reservation).activeRequestKey, null);
  await rejectsReason(f.store.reserve(payload()), "duplicate_unknown");
});

test("known complete usage reconciles only once, while missing usage keeps the reserve", async () => {
  const f = fixture();
  const first = await f.store.reserve(payload());
  await f.store.markDispatching(first);
  await f.store.settle(first, { outcome: "succeeded", actualMicrousd: 40, usageComplete: true });
  await f.store.settle(first, { outcome: "succeeded", actualMicrousd: 0, usageComplete: true });
  assert.equal(f.global(first).allocatedMicrousd, 40);
  await rejectsReason(f.store.reserve(payload()), "duplicate_completed");
  const second = await f.store.reserve(payload({ clientMessageId: "second" }));
  await f.store.settle(second, { outcome: "failed" });
  assert.equal(f.global(second).allocatedMicrousd, 580);
});

test("expired lease frees concurrency without refunding or redispatching the expired request", async () => {
  const f = fixture();
  const first = await f.store.reserve(payload());
  await f.store.markDispatching(first);
  f.advance(DESIGNER_AI_RESERVATION_LEASE_MS + 1);
  await rejectsReason(f.store.reserve(payload()), "duplicate_unknown");
  const second = await f.store.reserve(payload({ clientMessageId: "second", requestCreatedAt: f.now }));
  assert.equal(f.read(first).outcome, "unknown");
  assert.equal(f.global(first).allocatedMicrousd, 1080);
  await f.store.settle(first, { outcome: "succeeded", usageComplete: true, actualMicrousd: 0 });
  assert.equal(f.user(second).activeRequestKey, second.requestKey);
  assert.equal(f.global(second).allocatedMicrousd, 1080);
  await rejectsReason(f.store.markDispatching(first), "reservation_invalid");
});

test("minute and day quotas count every admitted request including zero-cost greetings", async () => {
  const f = fixture({ configOverrides: { perUserMinuteLimit: 1, perUserDayLimit: 2 } });
  const first = await f.store.reserve(payload({ maxInputTokens: 0, maxOutputTokens: 0 }));
  await f.store.settle(first, { outcome: "succeeded", actualMicrousd: 0, usageComplete: true });
  await rejectsReason(f.store.reserve(payload({ clientMessageId: "second" })), "minute_quota");
  f.advance(60_000);
  const second = await f.store.reserve(payload({ clientMessageId: "second", requestCreatedAt: f.now }));
  await f.store.settle(second, { outcome: "failed" });
  f.advance(60_000);
  await rejectsReason(f.store.reserve(payload({ clientMessageId: "third", requestCreatedAt: f.now })), "daily_quota");
  assert.equal(f.user(second).dayCount, 2);
});

test("UTC day rollover creates a new global budget without refunding the old day", async () => {
  const f = fixture({ initialClock: Date.UTC(2026, 9, 7, 23, 59, 50) });
  const first = await f.store.reserve(payload({ requestCreatedAt: f.now }));
  await f.store.settle(first, { outcome: "unknown" });
  f.advance(60_000);
  const second = await f.store.reserve(payload({ clientMessageId: "next-day", requestCreatedAt: f.now }));
  assert.notEqual(first.globalKey, second.globalKey);
  assert.equal(f.global(first).allocatedMicrousd, 540);
  assert.equal(f.global(second).allocatedMicrousd, 540);
  assert.equal(f.user(second).dayCount, 1);
});

test("foreign, absent and noneditable drafts fail before creating accounting records", async () => {
  for (const draft of [undefined, { userId: "other", editable: true }, { userId: "synthetic-user", editable: false }]) {
    const f = fixture();
    if (draft) f.records.set("borradores/synthetic-draft", draft); else f.records.delete("borradores/synthetic-draft");
    await rejectsReason(f.store.reserve(payload()), "draft_unavailable");
    assert.equal([...f.records.keys()].filter(key => key.startsWith("designerAiUsage/request_")).length, 0);
  }
});

test("ID payload conflict and stale request timestamps never create another reservation", async () => {
  const f = fixture();
  const reservation = await f.store.reserve(payload());
  await rejectsReason(f.store.reserve(payload({ payloadDigest: "b".repeat(64) })), "request_conflict");
  await rejectsReason(f.store.reserve(payload({ requestCreatedAt: start + 1 })), "request_conflict");
  f.advance(DESIGNER_AI_REQUEST_MAX_AGE_MS + 1);
  assert.throws(() => f.store.reserve(payload()), error => error.reason === "request_expired");
  f.records.delete(`designerAiUsage/${reservation.requestKey}`); // Simulate eventual TTL removal.
  f.advance(DESIGNER_AI_USAGE_RETENTION_MS);
  assert.throws(() => f.store.reserve(payload()), error => error.reason === "request_expired");
});

test("malformed paths/token bounds and unreasonably future timestamps fail before I/O", () => {
  const f = fixture();
  for (const change of [{ uid: "a/b" }, { draftId: "../x" }, { clientMessageId: "a/b" },
    { maxInputTokens: -1 }, { maxOutputTokens: 12001 }, { maxInputTokens: 0 }, { payloadDigest: "invalid" }]) {
    assert.throws(() => f.store.reserve(payload(change)), error => error.reason === "invalid_request");
  }
  assert.throws(() => f.store.reserve(payload({ requestCreatedAt: start + 60_001 })), error => error.reason === "request_expired");
});

test("failed reservation commit fails closed and redacts the raw storage error", async () => {
  const f = fixture();
  f.failCommit();
  await assert.rejects(f.store.reserve(payload()), error => {
    assert.equal(error.reason, "accounting_unavailable");
    assert.equal(JSON.stringify(error).includes("SYNTHETIC_PRIVATE"), false);
    return true;
  });
  assert.equal([...f.records.keys()].filter(key => key.startsWith("designerAiUsage/request_")).length, 0);
});

test("request metadata contains neither raw identities nor request content and has bounded retention", async () => {
  const f = fixture();
  const reservation = await f.store.reserve(payload());
  const record = f.read(reservation);
  assert.equal(record.expiresAt.getTime(), start + DESIGNER_AI_USAGE_RETENTION_MS);
  const serialized = JSON.stringify(record);
  for (const raw of ["synthetic-user", "synthetic-draft", "synthetic-message", "assistantMessage", "recentTurns", "capabilitySnapshot"]) {
    assert.equal(serialized.includes(raw), false);
  }
  await rejectsReason(f.store.markDispatching({ ...reservation, ownerToken: "wrong-owner" }), "reservation_invalid");
  await f.store.markDispatching(reservation);
  await rejectsReason(f.store.markDispatching(reservation), "reservation_invalid");
});

test("unconfirmed settlement cannot release concurrency or the budget reservation", async () => {
  const f = fixture();
  const reservation = await f.store.reserve(payload());
  await f.store.markDispatching(reservation);
  f.failCommit();
  await rejectsReason(f.store.settle(reservation, { outcome: "succeeded", usageComplete: true, actualMicrousd: 0 }), "accounting_unavailable");
  assert.equal(f.read(reservation).state, "dispatching");
  assert.equal(f.global(reservation).allocatedMicrousd, 540);
  assert.equal(f.user(reservation).activeRequestKey, reservation.requestKey);
});
