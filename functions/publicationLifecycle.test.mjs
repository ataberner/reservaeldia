import test from "node:test";
import assert from "node:assert/strict";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const {
  buildDraftPublicationLifecycleFields,
  buildPublicationDateWriteFields,
  computePublicationExpirationDate,
  computeTrashPurgeAt,
  resolvePublicationTimelineFromData,
  resolvePublicationBackendStateFromData,
  resolvePublicationEffectiveExpirationDateFromData,
  resolvePublicationFirstPublishedAtFromData,
  resolvePublicationLastPublishedAtFromData,
  resolvePublicationLifecycleSnapshotFromData,
} = requireBuiltModule("lib/payments/publicationLifecycle.js");

function toIsoOrNull(value) {
  if (value === null) return null;
  if (!value || typeof value.toDate !== "function") return undefined;
  return value.toDate().toISOString();
}

test("effective expiration keeps venceAt precedence over vigenteHasta", () => {
  const venceAt = "2026-08-20T12:00:00.000Z";
  const vigenteHasta = "2025-08-20T12:00:00.000Z";
  const lifecycleExpiresAt = "2025-09-20T12:00:00.000Z";

  const expirationDate = resolvePublicationEffectiveExpirationDateFromData({
    venceAt,
    vigenteHasta,
    publicationLifecycle: {
      expiresAt: lifecycleExpiresAt,
    },
  });

  assert.equal(expirationDate?.toISOString(), venceAt);
});

test("raw public state keeps precedence over finalized lifecycle state", () => {
  const snapshot = resolvePublicationLifecycleSnapshotFromData(
    {
      estado: "publicada_pausada",
      pausadaAt: "2026-03-01T10:00:00.000Z",
      publicationLifecycle: {
        state: "finalized",
      },
    },
    {
      now: new Date("2026-03-27T00:00:00.000Z"),
    }
  );

  assert.equal(
    resolvePublicationBackendStateFromData({
      estado: "publicada_pausada",
      pausadaAt: "2026-03-01T10:00:00.000Z",
      publicationLifecycle: {
        state: "finalized",
      },
    }),
    "publicada_pausada"
  );
  assert.equal(snapshot.backendState, "publicada_pausada");
  assert.equal(snapshot.isExpired, false);
});

test("trash purge derives from fallbackPublishedAt when no expiry or published dates exist", () => {
  const fallbackPublishedAt = new Date("2026-01-15T12:30:00.000Z");
  const expectedExpiration = computePublicationExpirationDate(fallbackPublishedAt);
  const expectedPurgeAt = computeTrashPurgeAt(expectedExpiration);

  const snapshot = resolvePublicationLifecycleSnapshotFromData(
    {
      estado: "papelera",
      enPapeleraAt: "2026-03-20T12:30:00.000Z",
    },
    {
      now: new Date("2026-03-27T00:00:00.000Z"),
      fallbackPublishedAt,
    }
  );

  assert.equal(snapshot.effectiveExpirationDate?.toISOString(), expectedExpiration.toISOString());
  assert.equal(snapshot.trashPurgeAt?.toISOString(), expectedPurgeAt.toISOString());
});

test("first published date only falls back to lifecycle.firstPublishedAt when opted in", () => {
  const lifecycleFirstPublishedAt = "2025-05-10T11:00:00.000Z";
  const fallbackPublishedAt = "2026-03-01T08:00:00.000Z";
  const publication = {
    publicationLifecycle: {
      firstPublishedAt: lifecycleFirstPublishedAt,
    },
  };

  assert.equal(
    resolvePublicationFirstPublishedAtFromData(publication, {
      fallbackPublishedAt,
    })?.toISOString(),
    fallbackPublishedAt
  );
  assert.equal(
    resolvePublicationFirstPublishedAtFromData(publication, {
      fallbackPublishedAt,
      includeLifecycleFirstPublishedAt: true,
    })?.toISOString(),
    lifecycleFirstPublishedAt
  );
});

test("effective expiration can ignore lifecycle.expiresAt for active-write callers", () => {
  const publication = {
    publicationLifecycle: {
      expiresAt: "2025-10-10T12:00:00.000Z",
    },
  };
  const fallbackPublishedAt = new Date("2025-06-10T12:00:00.000Z");
  const expectedDerivedExpiration = computePublicationExpirationDate(fallbackPublishedAt);

  assert.equal(
    resolvePublicationEffectiveExpirationDateFromData(publication, {
      fallbackPublishedAt,
    })?.toISOString(),
    "2025-10-10T12:00:00.000Z"
  );
  assert.equal(
    resolvePublicationEffectiveExpirationDateFromData(publication, {
      fallbackPublishedAt,
      includeLifecycleExpiration: false,
    })?.toISOString(),
    expectedDerivedExpiration.toISOString()
  );
});

test("last published date keeps lifecycle.lastPublishedAt fallback only when opted in", () => {
  const publication = {
    publicationLifecycle: {
      firstPublishedAt: "2025-01-10T12:00:00.000Z",
      lastPublishedAt: "2025-09-10T12:00:00.000Z",
    },
  };
  const fallbackLastPublishedAt = "2025-03-10T12:00:00.000Z";

  assert.equal(
    resolvePublicationLastPublishedAtFromData(publication, {
      fallbackLastPublishedAt,
    })?.toISOString(),
    fallbackLastPublishedAt
  );
  assert.equal(
    resolvePublicationLastPublishedAtFromData(publication, {
      fallbackLastPublishedAt,
      includeLifecycleLastPublishedAt: true,
    })?.toISOString(),
    "2025-09-10T12:00:00.000Z"
  );
});

test("timeline helper composes first publication, expiration, and last publication consistently", () => {
  const timeline = resolvePublicationTimelineFromData(
    {
      publicationLifecycle: {
        firstPublishedAt: "2025-01-10T12:00:00.000Z",
        lastPublishedAt: "2025-09-10T12:00:00.000Z",
        expiresAt: "2025-12-10T12:00:00.000Z",
      },
    },
    {
      fallbackPublishedAt: "2026-03-01T08:00:00.000Z",
      includeLifecycleFirstPublishedAt: true,
      includeLifecycleExpiration: true,
      includeLifecycleLastPublishedAt: true,
    }
  );

  assert.equal(timeline.firstPublishedAt?.toISOString(), "2025-01-10T12:00:00.000Z");
  assert.equal(timeline.effectiveExpirationDate?.toISOString(), "2025-12-10T12:00:00.000Z");
  assert.equal(timeline.lastPublishedAt?.toISOString(), "2025-09-10T12:00:00.000Z");
});

test("publication date write fields mirror timestamps and omit undefined branches", () => {
  const payload = buildPublicationDateWriteFields({
    firstPublishedAt: new Date("2025-01-10T12:00:00.000Z"),
    effectiveExpirationDate: new Date("2025-12-10T12:00:00.000Z"),
  });

  assert.equal(toIsoOrNull(payload.publicadaAt), "2025-01-10T12:00:00.000Z");
  assert.equal(toIsoOrNull(payload.publicadaEn), "2025-01-10T12:00:00.000Z");
  assert.equal(toIsoOrNull(payload.venceAt), "2025-12-10T12:00:00.000Z");
  assert.equal(toIsoOrNull(payload.vigenteHasta), "2025-12-10T12:00:00.000Z");
  assert.equal("ultimaPublicacionEn" in payload, false);
  assert.equal("finalizadaEn" in payload, false);
});

test("draft publication lifecycle fields preserve null clears and omit undefined optional dates", () => {
  const payload = buildDraftPublicationLifecycleFields({
    state: "published",
    activePublicSlug: "slug-publico",
    firstPublishedAt: new Date("2025-01-10T12:00:00.000Z"),
    effectiveExpirationDate: new Date("2025-12-10T12:00:00.000Z"),
    finalizedAt: null,
  });

  assert.equal(payload.state, "published");
  assert.equal(payload.activePublicSlug, "slug-publico");
  assert.equal(toIsoOrNull(payload.firstPublishedAt), "2025-01-10T12:00:00.000Z");
  assert.equal(toIsoOrNull(payload.expiresAt), "2025-12-10T12:00:00.000Z");
  assert.equal(payload.finalizedAt, null);
  assert.equal("lastPublishedAt" in payload, false);
});
