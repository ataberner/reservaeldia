import test from "node:test";
import assert from "node:assert/strict";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const {
  buildApprovedSessionRetryableFailureWrite,
  planLegacyPublicationCleanupOperations,
  planApprovedSessionPublishSuccess,
  planApprovedSessionPublishingClaim,
  planApprovedSessionSlugConflict,
  planPublicationFinalizationOperations,
  planPublicationPublishOperations,
  planPublicationTransitionOperations,
  planTrashedPublicationPurgeOperations,
} = requireBuiltModule("lib/payments/publicationOperationPlanning.js");

function toIsoOrNull(value) {
  if (value === null) return null;
  if (!value || typeof value.toDate !== "function") return undefined;
  return value.toDate().toISOString();
}

test("finalization planner freezes history, reservation, draft sync, and result metadata", () => {
  const summary = {
    totalResponses: 7,
    confirmedResponses: 5,
    declinedResponses: 2,
    confirmedGuests: 11,
    vegetarianCount: 1,
    veganCount: 0,
    childrenCount: 2,
    dietaryRestrictionsCount: 1,
    transportCount: 3,
  };
  const createdAtValue = { sentinel: "created" };
  const updatedAtValue = { sentinel: "updated" };
  const draftUpdatedAtValue = { sentinel: "draft-updated" };
  const reservationUpdatedAtValue = { sentinel: "reservation-updated" };
  const plan = planPublicationFinalizationOperations({
    slug: "mi-slug",
    publicationData: {
      userId: "user-1",
      nombre: "Fiesta",
      tipo: "boda",
      portada: "https://cdn.example/cover.jpg",
      plantillaId: "tpl-1",
      rsvp: { enabled: true },
      gifts: { enabled: true },
    },
    draftSlug: "borrador-1",
    dates: {
      firstPublishedAt: new Date("2025-05-01T10:00:00.000Z"),
      effectiveExpirationDate: new Date("2026-05-01T10:00:00.000Z"),
      lastPublishedAt: new Date("2025-06-01T10:00:00.000Z"),
    },
    summary,
    finalizedAt: new Date("2026-04-01T12:00:00.000Z"),
    reason: "scheduled-expiration",
    historySourceCollection: "publicadas",
    historyCreatedAtValue: createdAtValue,
    historyUpdatedAtValue: updatedAtValue,
    draftUpdatedAtValue,
    reservationUpdatedAtValue,
  });

  assert.equal(plan.historyId, "mi-slug__1746093600000");
  assert.equal(plan.storagePrefix, "publicadas/mi-slug/");
  assert.equal(plan.historyWrite.slug, "mi-slug");
  assert.equal(plan.historyWrite.estado, "finalized");
  assert.equal(toIsoOrNull(plan.historyWrite.publicadaAt), "2025-05-01T10:00:00.000Z");
  assert.equal(toIsoOrNull(plan.historyWrite.venceAt), "2026-05-01T10:00:00.000Z");
  assert.equal(toIsoOrNull(plan.historyWrite.ultimaPublicacionEn), "2025-06-01T10:00:00.000Z");
  assert.equal(toIsoOrNull(plan.historyWrite.finalizadaEn), "2026-04-01T12:00:00.000Z");
  assert.equal(plan.historyWrite.createdAt, createdAtValue);
  assert.equal(plan.historyWrite.updatedAt, updatedAtValue);
  assert.ok(plan.draftFinalizeWrite);
  assert.equal(plan.draftFinalizeWrite.slugPublico, null);
  assert.equal(plan.draftFinalizeWrite.publicationLifecycle.state, "finalized");
  assert.equal(
    toIsoOrNull(plan.draftFinalizeWrite.publicationFinalizedAt),
    "2026-04-01T12:00:00.000Z"
  );
  assert.equal(plan.draftFinalizeWrite.updatedAt, draftUpdatedAtValue);
  assert.deepEqual(plan.reservationReleaseWrite, {
    status: "released",
    updatedAt: reservationUpdatedAtValue,
    releaseReason: "scheduled-expiration",
  });
  assert.deepEqual(plan.result, {
    slug: "mi-slug",
    historyId: "mi-slug__1746093600000",
    draftSlug: "borrador-1",
    finalized: true,
    alreadyMissing: false,
  });
  assert.deepEqual(plan.logContext, {
    slug: "mi-slug",
    draftSlug: "borrador-1",
    historyId: "mi-slug__1746093600000",
    reason: "scheduled-expiration",
    totalResponses: 7,
  });
});

test("transition planner freezes active patch, linked draft sync, and callable response payload", () => {
  const activeUpdatedAtValue = { sentinel: "active-updated" };
  const draftUpdatedAtValue = { sentinel: "draft-updated" };
  const plan = planPublicationTransitionOperations({
    slug: "mi-slug",
    nextState: "publicada_pausada",
    firstPublishedAt: new Date("2025-05-01T10:00:00.000Z"),
    effectiveExpirationDate: new Date("2026-05-01T10:00:00.000Z"),
    pausedAt: new Date("2026-03-27T09:00:00.000Z"),
    trashedAt: null,
    linkedDraftSlug: "borrador-1",
    activeUpdatedAtValue,
    draftUpdatedAtValue,
  });

  assert.equal(plan.activePublicationWrite.estado, "publicada_pausada");
  assert.equal(toIsoOrNull(plan.activePublicationWrite.publicadaAt), "2025-05-01T10:00:00.000Z");
  assert.equal(toIsoOrNull(plan.activePublicationWrite.venceAt), "2026-05-01T10:00:00.000Z");
  assert.equal(toIsoOrNull(plan.activePublicationWrite.pausadaAt), "2026-03-27T09:00:00.000Z");
  assert.equal(plan.activePublicationWrite.enPapeleraAt, null);
  assert.equal(plan.activePublicationWrite.updatedAt, activeUpdatedAtValue);
  assert.ok(plan.draftWrite);
  assert.equal(plan.draftWrite.slugPublico, "mi-slug");
  assert.equal(plan.draftWrite.publicationLifecycle.state, "published");
  assert.equal(
    toIsoOrNull(plan.draftWrite.publicationLifecycle.firstPublishedAt),
    "2025-05-01T10:00:00.000Z"
  );
  assert.equal(
    toIsoOrNull(plan.draftWrite.publicationLifecycle.expiresAt),
    "2026-05-01T10:00:00.000Z"
  );
  assert.equal("lastPublishedAt" in plan.draftWrite.publicationLifecycle, false);
  assert.equal(plan.draftWrite.updatedAt, draftUpdatedAtValue);
  assert.deepEqual(plan.result, {
    slug: "mi-slug",
    estado: "publicada_pausada",
    publicadaAt: "2025-05-01T10:00:00.000Z",
    venceAt: "2026-05-01T10:00:00.000Z",
    pausadaAt: "2026-03-27T09:00:00.000Z",
    enPapeleraAt: null,
  });
});

test("publish planner freezes first-publication active patch, draft sync, and public url", () => {
  const draftContentMeta = {
    lastWriter: "publish",
    reason: "publication-snapshot-read",
  };
  const now = new Date("2026-03-27T09:00:00.000Z");
  const plan = planPublicationPublishOperations({
    draftSlug: "borrador-1",
    publicSlug: "mi-slug",
    operation: "new",
    existingData: null,
    now,
    paymentSessionId: "pay-1",
    draftContentMeta,
  });

  assert.equal(plan.isFirstPublication, true);
  assert.equal(plan.firstPublishedAt.toISOString(), "2026-03-27T09:00:00.000Z");
  assert.equal(plan.effectiveExpirationDate.toISOString(), "2027-03-27T09:00:00.000Z");
  assert.equal(plan.normalizedEstado, "publicada_activa");
  assert.equal(plan.pausedAtDate, null);
  assert.equal(plan.publicUrl, "https://reservaeldia.com.ar/i/mi-slug");
  assert.equal(plan.activeLifecyclePatch.estado, "publicada_activa");
  assert.equal(toIsoOrNull(plan.activeLifecyclePatch.publicadaAt), "2026-03-27T09:00:00.000Z");
  assert.equal(toIsoOrNull(plan.activeLifecyclePatch.venceAt), "2027-03-27T09:00:00.000Z");
  assert.equal(toIsoOrNull(plan.activeLifecyclePatch.ultimaPublicacionEn), "2026-03-27T09:00:00.000Z");
  assert.equal(plan.activeLifecyclePatch.pausadaAt, null);
  assert.equal(plan.activeLifecyclePatch.enPapeleraAt, null);
  assert.equal("updatedAt" in plan.activeLifecyclePatch, false);
  assert.equal(plan.linkedDraftWrite.slugPublico, "mi-slug");
  assert.equal(plan.linkedDraftWrite.publicationLifecycle.state, "published");
  assert.equal(
    toIsoOrNull(plan.linkedDraftWrite.publicationLifecycle.firstPublishedAt),
    "2026-03-27T09:00:00.000Z"
  );
  assert.equal(
    toIsoOrNull(plan.linkedDraftWrite.publicationLifecycle.expiresAt),
    "2027-03-27T09:00:00.000Z"
  );
  assert.equal(toIsoOrNull(plan.linkedDraftWrite.ultimaPublicacion), "2026-03-27T09:00:00.000Z");
  assert.equal(plan.linkedDraftWrite.ultimaOperacionPublicacion, "new");
  assert.equal(plan.linkedDraftWrite.lastPaymentSessionId, "pay-1");
  assert.equal(plan.linkedDraftWrite.draftContentMeta, draftContentMeta);
  assert.equal("updatedAt" in plan.linkedDraftWrite, false);
});

test("publish planner freezes paused update reuse without adding new updatedAt branches", () => {
  const draftContentMeta = {
    lastWriter: "publish",
    reason: "publication-snapshot-read",
  };
  const now = new Date("2026-03-27T09:00:00.000Z");
  const plan = planPublicationPublishOperations({
    draftSlug: "borrador-1",
    publicSlug: "mi-slug",
    operation: "update",
    existingData: {
      estado: "publicada_pausada",
      publicadaAt: "2025-05-01T10:00:00.000Z",
      vigenteHasta: "2026-05-01T10:00:00.000Z",
      pausadaAt: "2026-01-10T08:30:00.000Z",
    },
    now,
    paymentSessionId: "pay-1",
    draftContentMeta,
  });

  assert.equal(plan.isFirstPublication, false);
  assert.equal(plan.firstPublishedAt.toISOString(), "2025-05-01T10:00:00.000Z");
  assert.equal(plan.effectiveExpirationDate.toISOString(), "2026-05-01T10:00:00.000Z");
  assert.equal(plan.normalizedEstado, "publicada_pausada");
  assert.equal(plan.pausedAtDate?.toISOString(), "2026-01-10T08:30:00.000Z");
  assert.equal(plan.publicUrl, "https://reservaeldia.com.ar/i/mi-slug");
  assert.equal(plan.activeLifecyclePatch.estado, "publicada_pausada");
  assert.equal(
    toIsoOrNull(plan.activeLifecyclePatch.pausadaAt),
    "2026-01-10T08:30:00.000Z"
  );
  assert.equal(plan.activeLifecyclePatch.enPapeleraAt, null);
  assert.equal(toIsoOrNull(plan.activeLifecyclePatch.ultimaPublicacionEn), "2026-03-27T09:00:00.000Z");
  assert.equal("updatedAt" in plan.activeLifecyclePatch, false);
  assert.equal(plan.linkedDraftWrite.ultimaOperacionPublicacion, "update");
  assert.equal(toIsoOrNull(plan.linkedDraftWrite.ultimaPublicacion), "2026-03-27T09:00:00.000Z");
  assert.equal("updatedAt" in plan.linkedDraftWrite, false);
});

test("approved-session publishing claim only transitions compatible statuses to publishing", () => {
  const updatedAtValue = { sentinel: "updated" };
  const publishable = planApprovedSessionPublishingClaim({
    status: "payment_approved",
    updatedAtValue,
  });
  const published = planApprovedSessionPublishingClaim({
    status: "published",
    updatedAtValue,
  });
  const publishing = planApprovedSessionPublishingClaim({
    status: "publishing",
    updatedAtValue,
  });
  const expired = planApprovedSessionPublishingClaim({
    status: "expired",
    updatedAtValue,
  });

  assert.deepEqual(publishable, {
    shouldPublish: true,
    sessionWrite: {
      status: "publishing",
      updatedAt: updatedAtValue,
    },
  });
  assert.deepEqual(published, { shouldPublish: false, sessionWrite: null });
  assert.deepEqual(publishing, { shouldPublish: false, sessionWrite: null });
  assert.deepEqual(expired, { shouldPublish: false, sessionWrite: null });
});

test("approved-session publish success keeps session write, reservation consume, and result payload", () => {
  const updatedAtValue = { sentinel: "updated" };
  const receipt = { receipt: true };
  const plan = planApprovedSessionPublishSuccess({
    operation: "new",
    sessionId: "session-1",
    fallbackPaymentId: "pay-1",
    publicSlug: "mi-slug",
    publicUrl: "https://reservaeldia.com.ar/i/mi-slug",
    receipt,
    updatedAtValue,
  });

  assert.deepEqual(plan.sessionWrite, {
    status: "published",
    publicUrl: "https://reservaeldia.com.ar/i/mi-slug",
    receipt,
    lastError: null,
    updatedAt: updatedAtValue,
  });
  assert.deepEqual(plan.reservationUpdate, {
    slug: "mi-slug",
    sessionId: "session-1",
    nextStatus: "consumed",
  });
  assert.deepEqual(plan.result, {
    sessionStatus: "published",
    paymentId: "pay-1",
    publicUrl: "https://reservaeldia.com.ar/i/mi-slug",
    receipt,
  });
});

test("approved-session slug conflict keeps retry message and reservation release", () => {
  const updatedAtValue = { sentinel: "updated" };
  const plan = planApprovedSessionSlugConflict({
    sessionId: "session-1",
    fallbackPaymentId: "pay-1",
    publicSlug: "mi-slug",
    updatedAtValue,
  });

  assert.deepEqual(plan.sessionWrite, {
    status: "approved_slug_conflict",
    lastError: "El enlace ya no esta disponible. Elegi uno nuevo para completar la publicacion.",
    updatedAt: updatedAtValue,
  });
  assert.deepEqual(plan.reservationUpdate, {
    slug: "mi-slug",
    sessionId: "session-1",
    nextStatus: "released",
  });
  assert.deepEqual(plan.result, {
    sessionStatus: "approved_slug_conflict",
    paymentId: "pay-1",
    message: "Pago aprobado. El enlace entro en conflicto, elegi otro para finalizar.",
  });
});

test("approved-session retryable failure write preserves payment_approved and current fallback message", () => {
  const updatedAtValue = { sentinel: "updated" };
  const fromError = buildApprovedSessionRetryableFailureWrite({
    error: new Error("publish failed"),
    updatedAtValue,
  });
  const fallback = buildApprovedSessionRetryableFailureWrite({
    error: null,
    updatedAtValue,
  });

  assert.deepEqual(fromError, {
    status: "payment_approved",
    lastError: "publish failed",
    updatedAt: updatedAtValue,
  });
  assert.deepEqual(fallback, {
    status: "payment_approved",
    lastError: "Pago aprobado, pero la publicacion no se pudo completar en este intento.",
    updatedAt: updatedAtValue,
  });
});

test("trashed publication purge plan keeps storage prefix and draft reset order", () => {
  const plan = planTrashedPublicationPurgeOperations({
    slug: "mi-slug",
    draftSlugs: ["borrador-1", "", "borrador-2"],
  });

  assert.deepEqual(plan, {
    slug: "mi-slug",
    storagePrefix: "publicadas/mi-slug/",
    draftResetRequests: [
      { draftSlug: "borrador-1" },
      { draftSlug: "borrador-2" },
    ],
  });
});

test("legacy publication cleanup plan keeps uid, active-delete flag, and draft reset requests", () => {
  const plan = planLegacyPublicationCleanupOperations({
    slug: "mi-slug",
    uid: "user-1",
    draftSlugs: ["borrador-1", "borrador-2"],
    shouldDeleteActivePublication: true,
  });

  assert.deepEqual(plan, {
    slug: "mi-slug",
    uid: "user-1",
    storagePrefix: "publicadas/mi-slug/",
    draftResetRequests: [
      { draftSlug: "borrador-1", uid: "user-1" },
      { draftSlug: "borrador-2", uid: "user-1" },
    ],
    shouldDeleteActivePublication: true,
  });
});
