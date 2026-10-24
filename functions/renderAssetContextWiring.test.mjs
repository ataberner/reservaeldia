import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
const { HttpsError } = require("firebase-functions/v2/https");
const root = dirname(fileURLToPath(import.meta.url));
const clone = (value) => JSON.parse(JSON.stringify(value));
const noOp = () => {};
const deniedAtRender = () => new HttpsError("permission-denied", "fixture-render-boundary");

// Execute the actual compiled coordinator with explicit in-memory collaborators.
// No Admin SDK, payment client, renderer or network transport is initialized.
function loadCoordinator(relativePath, dependencies, unused = []) {
  const filename = join(root, "lib", relativePath);
  const code = readFileSync(filename, "utf8");
  const module = { exports: {} };
  const wrapper = new Script(`(function(exports, require, module) {\n${code}\n})`, { filename })
    .runInThisContext();
  wrapper(module.exports, (id) => {
    if (Object.hasOwn(dependencies, id)) return dependencies[id];
    if (unused.includes(id)) return {};
    throw new Error(`Unmodeled coordinator dependency: ${id}`);
  }, module);
  return module.exports;
}

function createHarness({ draftOwner = "owner-a", sessionOwner = "owner-a", status = "payment_approved" } = {}) {
  const documents = new Map([
    ["borradores/draft-a", { userId: draftOwner, objetos: [], secciones: [], plantillaId: "untrusted-template" }],
    ["publication_checkout_sessions/session-a", {
      uid: sessionOwner, draftSlug: "draft-a", publicSlug: "public-a", operation: "new",
      status, amountArs: 0, amountBaseArs: 0, currency: "ARS", mpPaymentId: "123",
    }],
    ["plantillas/template-a", { estado: "active", estadoEditorial: "en_proceso", objetos: [], secciones: [] }],
  ]);
  const calls = { render: [], paymentReads: [], documentReads: [] };
  const ref = (path) => ({
    id: path.split("/").at(-1), path,
    async get() {
      calls.documentReads.push(path);
      return { id: this.id, exists: documents.has(path), data: () => documents.has(path) ? clone(documents.get(path)) : undefined };
    },
    async set(value) { documents.set(path, { ...(documents.get(path) || {}), ...clone(value) }); },
  });
  const db = {
    collection: (name) => ({ doc: (id) => ref(`${name}/${id}`) }),
    doc: ref,
    runTransaction: (update) => update({ get: (document) => document.get(), set: (document, value) => document.set(value) }),
  };
  const firestore = () => db;
  firestore.FieldValue = { serverTimestamp: () => "fixture-timestamp" };
  firestore.Timestamp = { fromDate: (date) => date, fromMillis: (value) => new Date(value) };
  const auth = {
    requireAuth(request) {
      if (!request.auth?.uid) throw new HttpsError("unauthenticated", "fixture-auth-required");
      return request.auth.uid;
    },
    requireSuperAdmin(request) {
      if (request.auth?.uid !== "admin-a") throw new HttpsError("permission-denied", "fixture-admin-required");
      return request.auth.uid;
    },
    requireAdmin(request) { return this.requireSuperAdmin(request); },
    isSuperAdmin: (uid) => uid === "admin-a",
  };
  // requireAdmin is imported as a standalone function by the real coordinator.
  auth.requireAdmin = (request) => auth.requireSuperAdmin(request);
  const render = {
    async prepareRenderPayload(data, options) {
      calls.render.push({ data: clone(data), options: clone(options) });
      throw deniedAtRender();
    },
  };
  const dependencies = {
    "../firebaseAdmin": { ensureAdminApp: noOp },
    crypto: { randomUUID: () => "fixture-uuid" },
    "node:perf_hooks": { performance },
    "firebase-admin": { firestore },
    "firebase-admin/storage": { getStorage: () => ({ bucket: () => ({}) }) },
    "firebase-functions/logger": { info: noOp, warn: noOp, error: noOp },
    "firebase-functions/v2/https": { HttpsError, onCall: (_options, handler) => handler },
    "../auth/adminAuth": auth,
    "../render/prepareRenderPayload": render,
    "./publicationCheckoutConfig": { getPublicationPaymentConfig: async () => ({ enabled: true, slugReservationTtlMinutes: 10 }) },
    "./publicationPublishingProgress": { createPublishingProgressReporter: () => ({ start: noOp, complete: noOp, fail: noOp }) },
    "./publicationSlugReservationFlow": {
      checkSlugAvailabilityFlow: async () => ({ isAvailable: true, reason: "ok" }),
      reserveSlugForSessionFlow: async () => {}, markReservationStatusFlow: async () => {},
    },
    "./mercadoPagoClient": {
      getMercadoPagoWebhookSecret: () => "synthetic-webhook-secret",
      getMercadoPagoPaymentClient: () => ({
        async get({ id }) {
          calls.paymentReads.push(id);
          return { id, status: "approved", metadata: {
            publication_session_id: "session-a", uid: "forged-owner", draft_slug: "forged-draft",
          } };
        },
      }),
    },
    "../analytics/service": { recordBusinessAnalyticsEvent: async () => {} },
    "../utils/safeErrorLog": { summarizeErrorForLog: () => ({ code: "fixture-error" }) },
  };
  for (const name of ["publicationApprovedSessionFlow", "publicationPaymentReads", "publicationPaymentEdge",
    "publicationCheckoutSessionFlow", "publicationLifecycle", "mercadoPagoWebhookEdge"]) {
    dependencies[`./${name}`] = requireBuiltModule(`lib/payments/${name}.js`);
  }
  dependencies["../utils/publicSlug"] = requireBuiltModule("lib/utils/publicSlug.js");
  const handlers = loadCoordinator("payments/publicationPayments.js", dependencies, [
    "./publicationWritePreparation", "./publicationOperationExecution", "../iconCatalog/usage",
    "../drafts/sourceOfTruth", "../siteSettings/pricing", "./publicationPublishExecution", "./publishedShareImage",
    "./publicationFinalizationFlow", "./publicationVisitTracking", "./publicationTrashPurgeFlow",
    "./publicationStateTransitionFlow", "./publicationLegacyCleanupFlow",
  ]);
  return { documents, calls, handlers, dependencies, render };
}

const expectedDraftAccess = { kind: "draft", ownerUid: "owner-a", draftId: "draft-a" };
const request = (uid = "owner-a", data = {}) => ({ auth: { uid }, data: {
  draftSlug: "draft-a", resolvePublicationLink: false,
  assetAccess: { kind: "draft", ownerUid: "owner-b", draftId: "draft-b" },
  ownerUid: "owner-b", ...data,
} });

for (const handler of ["prepareDraftPreviewRenderHandler", "validateDraftForPublicationHandler", "createPublicationCheckoutSessionHandler"]) {
  test(`${handler} derives asset access from authenticated ownership, ignoring request grants`, async () => {
    const harness = createHarness();
    await assert.rejects(() => harness.handlers[handler](request("owner-a", { operation: "new" })),
      (error) => error.message === "fixture-render-boundary");
    assert.equal(harness.calls.render.length, 1);
    assert.deepEqual(harness.calls.render[0].options.assetAccess, expectedDraftAccess);
  });

  test(`${handler} rejects another account before reaching asset resolution`, async () => {
    const harness = createHarness();
    await assert.rejects(() => harness.handlers[handler](request("owner-b", { operation: "new" })),
      (error) => error.code === "permission-denied");
    assert.equal(harness.calls.render.length, 0);
  });
}

test("administrative draft preview retains the verified owner's asset scope", async () => {
  const harness = createHarness();
  await assert.rejects(() => harness.handlers.prepareDraftPreviewRenderHandler(request("admin-a", {
    administrativeOwnerUid: "owner-a",
  })), (error) => error.message === "fixture-render-boundary");
  assert.deepEqual(harness.calls.render[0].options.assetAccess, expectedDraftAccess);
});

test("administrative owner input cannot bypass its privilege boundary", async () => {
  const harness = createHarness();
  await assert.rejects(() => harness.handlers.prepareDraftPreviewRenderHandler(request("owner-b", {
    administrativeOwnerUid: "owner-a",
  })), (error) => error.code === "permission-denied");
  assert.equal(harness.calls.render.length, 0);
});

async function callSettlement(harness, kind) {
  if (kind === "payment") return harness.handlers.createPublicationPaymentHandler(request("owner-a", { sessionId: "session-a" }));
  if (kind === "retry") return harness.handlers.retryPaidPublicationWithNewSlugHandler(request("owner-a", { sessionId: "session-a", newPublicSlug: "new-public-a" }));
  if (kind === "legacy-publish") return harness.handlers.publishWithApprovedPaymentSession({
    uid: "owner-a", draftSlug: "draft-a", paymentSessionId: "session-a",
  });
  const timestamp = "1700000000", requestId = "synthetic-request", dataId = "123";
  const signature = createHmac("sha256", "synthetic-webhook-secret")
    .update(`id:${dataId};request-id:${requestId};ts:${timestamp};`).digest("hex");
  const response = { status() { return this; }, json(value) { this.body = value; return this; } };
  await harness.handlers.processMercadoPagoWebhookRequest({
    headers: { "x-signature": `ts=${timestamp},v1=${signature}`, "x-request-id": requestId },
    query: {}, body: { type: "payment", data: { id: dataId }, uid: "forged-owner", draftSlug: "forged-draft" },
  }, response);
  return response.body;
}

for (const kind of ["payment", "retry", "legacy-publish", "webhook"]) {
  test(`${kind} settlement scopes assets to the persisted session owner and re-read draft`, async () => {
    const harness = createHarness({ status: kind === "retry" ? "approved_slug_conflict" : "payment_approved" });
    try { await callSettlement(harness, kind); } catch (error) {
      assert.ok(["permission-denied", "failed-precondition"].includes(error.code));
    }
    assert.equal(harness.calls.render.length, 1);
    assert.deepEqual(harness.calls.render[0].options.assetAccess, expectedDraftAccess);
    assert.ok(harness.calls.documentReads.includes("publication_checkout_sessions/session-a"));
    assert.ok(harness.calls.documentReads.includes("borradores/draft-a"));
    assert.equal(harness.documents.get("publication_checkout_sessions/session-a").status, "payment_approved");
  });

  test(`${kind} settlement never renders when the persisted draft belongs to another account`, async () => {
    const harness = createHarness({ draftOwner: "owner-b", status: kind === "retry" ? "approved_slug_conflict" : "payment_approved" });
    try { await callSettlement(harness, kind); } catch (error) {
      assert.ok(["permission-denied", "failed-precondition"].includes(error.code));
    }
    assert.equal(harness.calls.render.length, 0);
    assert.ok(harness.calls.documentReads.includes("borradores/draft-a"));
    if (kind !== "legacy-publish") {
      assert.match(harness.documents.get("publication_checkout_sessions/session-a").lastError, /permisos/);
    }
  });
}

for (const kind of ["payment", "retry", "legacy-publish"]) {
  test(`${kind} rejects another account's checkout session before creating asset context`, async () => {
    const harness = createHarness({ sessionOwner: "owner-b", status: kind === "retry" ? "approved_slug_conflict" : "payment_approved" });
    await assert.rejects(() => callSettlement(harness, kind), (error) => error.code === "permission-denied");
    assert.equal(harness.calls.render.length, 0);
  });
}

test("legacy publication rejects a session for a different draft even when both drafts are owned", async () => {
  const harness = createHarness();
  harness.documents.set("borradores/draft-b", { userId: "owner-a", objetos: [], secciones: [] });
  await assert.rejects(() => harness.handlers.publishWithApprovedPaymentSession({
    uid: "owner-a", draftSlug: "draft-b", paymentSessionId: "session-a",
  }), (error) => error.code === "failed-precondition" && /borrador solicitado/.test(error.message));
  assert.equal(harness.calls.render.length, 0);
  assert.equal(harness.calls.paymentReads.length, 0);
  assert.equal(harness.documents.get("publication_checkout_sessions/session-a").status, "payment_approved");
});

test("template preview forwards the explicit template scope rather than editor document fields", async () => {
  const harness = createHarness();
  const helper = loadCoordinator("templates/templateEditorPreview.js", {
    "../render/prepareRenderPayload": harness.render,
  });
  const assetAccess = { kind: "template", actorUid: "admin-a", templateId: "template-a" };
  await assert.rejects(() => helper.prepareTemplateEditorPreview({
    templateId: "template-a", assetAccess,
    editorDocument: { objetos: [], secciones: [], userId: "owner-b", assetAccess: expectedDraftAccess },
  }), (error) => error.message === "fixture-render-boundary");
  assert.deepEqual(harness.calls.render[0].options.assetAccess, assetAccess);
});

function loadTemplateHandler(harness) {
  const helper = loadCoordinator("templates/templateEditorPreview.js", {
    "../render/prepareRenderPayload": harness.render,
  });
  return loadCoordinator("templates/editorialService.js", {
    ...harness.dependencies,
    "../music/config": requireBuiltModule("lib/music/config.js"),
    "../utils/invitationType": requireBuiltModule("lib/utils/invitationType.js"),
    "./contractLoader": { normalizeTemplateContractDocument: async (value) => value },
    "./templateEditorPreview": helper,
    "./draftAuthoringMetadata": requireBuiltModule("lib/templates/draftAuthoringMetadata.js"),
    "../../shared/renderAssetContract.cjs": require("../shared/renderAssetContract.cjs"),
  }, ["../drafts/sourceOfTruth", "./storageAssets", "../utils/normalizeCountdownGeometry"]);
}

test("template admin handler builds its scope from authenticated actor and loaded template", async () => {
  const harness = createHarness();
  const handlers = loadTemplateHandler(harness);
  await assert.rejects(() => handlers.adminGetTemplateEditorDocumentV1(request("admin-a", {
    templateId: "template-a", includePreparedPreview: true,
    actorUid: "forged-actor", assetAccess: { kind: "template", actorUid: "forged-actor", templateId: "other-template" },
  })), (error) => error.message === "fixture-render-boundary");
  assert.deepEqual(harness.calls.render[0].options.assetAccess, {
    kind: "template", actorUid: "admin-a", templateId: "template-a",
  });
});

test("template admin handler rejects unprivileged actors and trashed templates before render", async () => {
  const harness = createHarness();
  const handlers = loadTemplateHandler(harness);
  await assert.rejects(() => handlers.adminGetTemplateEditorDocumentV1(request("owner-a", {
    templateId: "template-a", includePreparedPreview: true, admin: true,
  })), (error) => error.code === "permission-denied");
  harness.documents.get("plantillas/template-a").trash = { active: true };
  await assert.rejects(() => handlers.adminGetTemplateEditorDocumentV1(request("admin-a", {
    templateId: "template-a", includePreparedPreview: true,
  })), (error) => error.code === "failed-precondition");
  assert.equal(harness.calls.render.length, 0);
});
