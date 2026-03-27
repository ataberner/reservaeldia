import test from "node:test";
import assert from "node:assert/strict";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const {
  buildActivePublicationLifecyclePatch,
  buildLinkedDraftFinalizedWrite,
  buildLinkedDraftPublishedSnapshotWrite,
  buildLinkedDraftPublishedStateWrite,
  buildLinkedDraftResetWrite,
  buildPublicationHistoryWrite,
} = requireBuiltModule("lib/payments/publicationWritePreparation.js");

function toIsoOrNull(value) {
  if (value === null) return null;
  if (!value || typeof value.toDate !== "function") return undefined;
  return value.toDate().toISOString();
}

test("history payload keeps mirrored lifecycle dates and finalized history fields", () => {
  const createdAtValue = { sentinel: "created" };
  const updatedAtValue = { sentinel: "updated" };
  const summary = {
    totalResponses: 12,
    confirmedResponses: 9,
    declinedResponses: 3,
    confirmedGuests: 18,
    vegetarianCount: 2,
    veganCount: 1,
    childrenCount: 4,
    dietaryRestrictionsCount: 3,
    transportCount: 5,
  };
  const payload = buildPublicationHistoryWrite({
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
    summary,
    firstPublishedAt: new Date("2025-05-01T10:00:00.000Z"),
    effectiveExpirationDate: new Date("2026-05-01T10:00:00.000Z"),
    lastPublishedAt: new Date("2025-06-01T10:00:00.000Z"),
    finalizedAt: new Date("2026-04-01T12:00:00.000Z"),
    reason: "scheduled-expiration",
    sourceCollection: "publicadas",
    createdAtValue,
    updatedAtValue,
  });

  assert.equal(payload.slug, "mi-slug");
  assert.equal(payload.userId, "user-1");
  assert.equal(payload.nombre, "Fiesta");
  assert.equal(payload.tipo, "boda");
  assert.equal(payload.portada, "https://cdn.example/cover.jpg");
  assert.equal(payload.plantillaId, "tpl-1");
  assert.equal(payload.borradorSlug, "borrador-1");
  assert.equal(payload.slugOriginal, "borrador-1");
  assert.equal(payload.estado, "finalized");
  assert.equal(toIsoOrNull(payload.publicadaAt), "2025-05-01T10:00:00.000Z");
  assert.equal(toIsoOrNull(payload.publicadaEn), "2025-05-01T10:00:00.000Z");
  assert.equal(toIsoOrNull(payload.venceAt), "2026-05-01T10:00:00.000Z");
  assert.equal(toIsoOrNull(payload.vigenteHasta), "2026-05-01T10:00:00.000Z");
  assert.equal(toIsoOrNull(payload.ultimaPublicacionEn), "2025-06-01T10:00:00.000Z");
  assert.equal(toIsoOrNull(payload.finalizadaEn), "2026-04-01T12:00:00.000Z");
  assert.equal(payload.motivoFinalizacion, "scheduled-expiration");
  assert.equal(payload.urlPublica, null);
  assert.deepEqual(payload.rsvpSummary, summary);
  assert.equal(payload.totalRsvpsHistorico, 12);
  assert.equal(payload.htmlPublicadoEliminado, true);
  assert.equal(payload.sourceCollection, "publicadas");
  assert.equal(payload.sourceSlug, "mi-slug");
  assert.equal(payload.createdAt, createdAtValue);
  assert.equal(payload.updatedAt, updatedAtValue);
});

test("finalized draft write keeps finalized lifecycle mirror and reason", () => {
  const updatedAtValue = { sentinel: "updated" };
  const payload = buildLinkedDraftFinalizedWrite({
    firstPublishedAt: new Date("2025-05-01T10:00:00.000Z"),
    effectiveExpirationDate: new Date("2026-05-01T10:00:00.000Z"),
    lastPublishedAt: new Date("2025-06-01T10:00:00.000Z"),
    finalizedAt: new Date("2026-04-01T12:00:00.000Z"),
    reason: "scheduled-expiration",
    updatedAtValue,
  });

  assert.equal(payload.slugPublico, null);
  assert.equal(payload.publicationLifecycle.state, "finalized");
  assert.equal(payload.publicationLifecycle.activePublicSlug, null);
  assert.equal(
    toIsoOrNull(payload.publicationLifecycle.firstPublishedAt),
    "2025-05-01T10:00:00.000Z"
  );
  assert.equal(
    toIsoOrNull(payload.publicationLifecycle.expiresAt),
    "2026-05-01T10:00:00.000Z"
  );
  assert.equal(
    toIsoOrNull(payload.publicationLifecycle.lastPublishedAt),
    "2025-06-01T10:00:00.000Z"
  );
  assert.equal(
    toIsoOrNull(payload.publicationLifecycle.finalizedAt),
    "2026-04-01T12:00:00.000Z"
  );
  assert.equal(toIsoOrNull(payload.publicationFinalizedAt), "2026-04-01T12:00:00.000Z");
  assert.equal(payload.publicationFinalizationReason, "scheduled-expiration");
  assert.equal(payload.updatedAt, updatedAtValue);
});

test("transition-style draft published write keeps lifecycle mirror without last publication fields", () => {
  const updatedAtValue = { sentinel: "updated" };
  const payload = buildLinkedDraftPublishedStateWrite({
    publicSlug: "mi-slug",
    firstPublishedAt: new Date("2025-05-01T10:00:00.000Z"),
    effectiveExpirationDate: new Date("2026-05-01T10:00:00.000Z"),
    updatedAtValue,
  });

  assert.equal(payload.slugPublico, "mi-slug");
  assert.equal(payload.publicationLifecycle.state, "published");
  assert.equal(payload.publicationLifecycle.activePublicSlug, "mi-slug");
  assert.equal(
    toIsoOrNull(payload.publicationLifecycle.firstPublishedAt),
    "2025-05-01T10:00:00.000Z"
  );
  assert.equal(
    toIsoOrNull(payload.publicationLifecycle.expiresAt),
    "2026-05-01T10:00:00.000Z"
  );
  assert.equal(payload.publicationLifecycle.finalizedAt, null);
  assert.equal("lastPublishedAt" in payload.publicationLifecycle, false);
  assert.equal("ultimaPublicacion" in payload, false);
  assert.equal("ultimaOperacionPublicacion" in payload, false);
  assert.equal(payload.publicationFinalizedAt, null);
  assert.equal(payload.publicationFinalizationReason, null);
  assert.equal(payload.updatedAt, updatedAtValue);
});

test("publish snapshot draft write keeps last publication, operation, payment session, and draft content meta", () => {
  const draftContentMeta = {
    lastWriter: "publish",
    reason: "publication-snapshot-read",
  };
  const payload = buildLinkedDraftPublishedSnapshotWrite({
    publicSlug: "mi-slug",
    firstPublishedAt: new Date("2025-05-01T10:00:00.000Z"),
    effectiveExpirationDate: new Date("2026-05-01T10:00:00.000Z"),
    lastPublishedAt: new Date("2026-03-27T09:00:00.000Z"),
    operation: "update",
    draftContentMeta,
    lastPaymentSessionId: "pay-1",
  });

  assert.equal(payload.slugPublico, "mi-slug");
  assert.equal(payload.publicationLifecycle.state, "published");
  assert.equal(payload.publicationLifecycle.activePublicSlug, "mi-slug");
  assert.equal(
    toIsoOrNull(payload.publicationLifecycle.firstPublishedAt),
    "2025-05-01T10:00:00.000Z"
  );
  assert.equal(
    toIsoOrNull(payload.publicationLifecycle.expiresAt),
    "2026-05-01T10:00:00.000Z"
  );
  assert.equal(
    toIsoOrNull(payload.publicationLifecycle.lastPublishedAt),
    "2026-03-27T09:00:00.000Z"
  );
  assert.equal(payload.publicationLifecycle.finalizedAt, null);
  assert.equal(toIsoOrNull(payload.ultimaPublicacion), "2026-03-27T09:00:00.000Z");
  assert.equal(payload.ultimaOperacionPublicacion, "update");
  assert.equal(payload.publicationFinalizedAt, null);
  assert.equal(payload.publicationFinalizationReason, null);
  assert.equal(payload.lastPaymentSessionId, "pay-1");
  assert.equal(payload.draftContentMeta, draftContentMeta);
  assert.equal("updatedAt" in payload, false);
});

test("draft reset write clears lifecycle linkage fields to null", () => {
  const updatedAtValue = { sentinel: "updated" };
  const payload = buildLinkedDraftResetWrite({
    updatedAtValue,
  });

  assert.equal(payload.slugPublico, null);
  assert.equal(payload.publicationLifecycle.state, "draft");
  assert.equal(payload.publicationLifecycle.activePublicSlug, null);
  assert.equal(payload.publicationLifecycle.firstPublishedAt, null);
  assert.equal(payload.publicationLifecycle.expiresAt, null);
  assert.equal(payload.publicationLifecycle.lastPublishedAt, null);
  assert.equal(payload.publicationLifecycle.finalizedAt, null);
  assert.equal(payload.ultimaPublicacion, null);
  assert.equal(payload.ultimaOperacionPublicacion, null);
  assert.equal(payload.publicationFinalizedAt, null);
  assert.equal(payload.publicationFinalizationReason, null);
  assert.equal(payload.updatedAt, updatedAtValue);
});

test("active publication lifecycle patch mirrors lifecycle dates and pause trash timestamps", () => {
  const updatedAtValue = { sentinel: "updated" };
  const transitionPatch = buildActivePublicationLifecyclePatch({
    state: "publicada_pausada",
    firstPublishedAt: new Date("2025-05-01T10:00:00.000Z"),
    effectiveExpirationDate: new Date("2026-05-01T10:00:00.000Z"),
    pausedAt: new Date("2026-03-27T09:00:00.000Z"),
    trashedAt: null,
    updatedAtValue,
  });
  const publishPatch = buildActivePublicationLifecyclePatch({
    state: "publicada_activa",
    firstPublishedAt: new Date("2025-05-01T10:00:00.000Z"),
    effectiveExpirationDate: new Date("2026-05-01T10:00:00.000Z"),
    lastPublishedAt: new Date("2026-03-27T09:30:00.000Z"),
    pausedAt: null,
    trashedAt: null,
  });

  assert.equal(transitionPatch.estado, "publicada_pausada");
  assert.equal(toIsoOrNull(transitionPatch.publicadaAt), "2025-05-01T10:00:00.000Z");
  assert.equal(toIsoOrNull(transitionPatch.publicadaEn), "2025-05-01T10:00:00.000Z");
  assert.equal(toIsoOrNull(transitionPatch.venceAt), "2026-05-01T10:00:00.000Z");
  assert.equal(toIsoOrNull(transitionPatch.vigenteHasta), "2026-05-01T10:00:00.000Z");
  assert.equal(toIsoOrNull(transitionPatch.pausadaAt), "2026-03-27T09:00:00.000Z");
  assert.equal(transitionPatch.enPapeleraAt, null);
  assert.equal("ultimaPublicacionEn" in transitionPatch, false);
  assert.equal(transitionPatch.updatedAt, updatedAtValue);

  assert.equal(publishPatch.estado, "publicada_activa");
  assert.equal(toIsoOrNull(publishPatch.ultimaPublicacionEn), "2026-03-27T09:30:00.000Z");
  assert.equal(publishPatch.pausadaAt, null);
  assert.equal(publishPatch.enPapeleraAt, null);
  assert.equal("updatedAt" in publishPatch, false);
});
