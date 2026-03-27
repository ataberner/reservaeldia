const DAY_MS = 24 * 60 * 60 * 1000;

export const FIXED_NOW_ISO = "2026-03-25T15:00:00.000Z";
export const FIXED_NOW_MS = Date.parse(FIXED_NOW_ISO);

function isoFromNow(dayOffset) {
  return new Date(FIXED_NOW_MS + dayOffset * DAY_MS).toISOString();
}

function addDaysToIso(iso, dayOffset) {
  return new Date(Date.parse(iso) + dayOffset * DAY_MS).toISOString();
}

function addMonthsPreservingDateTimeUTC(iso, monthsToAdd) {
  const baseDate = new Date(iso);
  const year = baseDate.getUTCFullYear();
  const month = baseDate.getUTCMonth();
  const day = baseDate.getUTCDate();
  const hour = baseDate.getUTCHours();
  const minute = baseDate.getUTCMinutes();
  const second = baseDate.getUTCSeconds();
  const millisecond = baseDate.getUTCMilliseconds();

  const totalMonths = month + monthsToAdd;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const lastDayOfMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDayOfMonth);

  return new Date(
    Date.UTC(targetYear, targetMonth, safeDay, hour, minute, second, millisecond)
  ).toISOString();
}

function secondsFromIso(iso) {
  return Math.floor(Date.parse(iso) / 1000);
}

const DRAFT_TRASHED_AT_ISO = isoFromNow(-5);
const DRAFT_PURGE_AT_ISO = isoFromNow(12);
const DRAFT_FIRST_PUBLISHED_AT_ISO = isoFromNow(-90);
const DRAFT_LAST_PUBLISHED_AT_ISO = isoFromNow(-2);
const DRAFT_FUTURE_EXPIRES_AT_ISO = isoFromNow(270);
const DRAFT_FINALIZED_AT_ISO = isoFromNow(-1);

const PUBLICATION_PUBLISHED_AT_ISO = isoFromNow(-40);
const PUBLICATION_OLD_PUBLISHED_AT_ISO = isoFromNow(-380);
const PUBLICATION_FUTURE_EXPIRES_AT_ISO = isoFromNow(20);
const PUBLICATION_PAST_EXPIRES_AT_ISO = isoFromNow(-1);
const PUBLICATION_FUTURE_TRASH_PURGE_AT_ISO = addDaysToIso(
  PUBLICATION_FUTURE_EXPIRES_AT_ISO,
  30
);
const PUBLICATION_DERIVED_FUTURE_EXPIRES_AT_ISO = addMonthsPreservingDateTimeUTC(
  PUBLICATION_PUBLISHED_AT_ISO,
  12
);
const PUBLICATION_DERIVED_FUTURE_TRASH_PURGE_AT_ISO = addDaysToIso(
  PUBLICATION_DERIVED_FUTURE_EXPIRES_AT_ISO,
  30
);

export const draftTrashParityFixtures = Object.freeze([
  {
    id: "draft-active-default",
    draft: {},
    expected: {
      state: "borrador_activo",
      isTrashed: false,
      purgeAtIso: null,
    },
  },
  {
    id: "draft-active-legacy-alias",
    draft: {
      estadoBorrador: "active",
    },
    expected: {
      state: "borrador_activo",
      isTrashed: false,
      purgeAtIso: null,
    },
  },
  {
    id: "draft-trash-explicit-state",
    draft: {
      estadoBorrador: "borrador_papelera",
      enPapeleraAt: DRAFT_TRASHED_AT_ISO,
      eliminacionDefinitivaAt: DRAFT_PURGE_AT_ISO,
    },
    expected: {
      state: "borrador_papelera",
      isTrashed: true,
      purgeAtIso: DRAFT_PURGE_AT_ISO,
    },
  },
  {
    id: "draft-trash-legacy-alias",
    draft: {
      estadoBorrador: "trash",
    },
    expected: {
      state: "borrador_papelera",
      isTrashed: true,
      purgeAtIso: null,
    },
  },
  {
    id: "draft-trash-from-timestamp-like",
    draft: {
      enPapeleraAt: {
        seconds: secondsFromIso(DRAFT_TRASHED_AT_ISO),
      },
    },
    expected: {
      state: "borrador_papelera",
      isTrashed: true,
      purgeAtIso: addDaysToIso(DRAFT_TRASHED_AT_ISO, 30),
    },
  },
  {
    id: "draft-trash-en-papelera-overrides-explicit-active-state",
    draft: {
      estadoBorrador: "borrador_activo",
      enPapeleraAt: DRAFT_TRASHED_AT_ISO,
      eliminacionDefinitivaAt: DRAFT_PURGE_AT_ISO,
    },
    expected: {
      state: "borrador_papelera",
      isTrashed: true,
      purgeAtIso: DRAFT_PURGE_AT_ISO,
    },
  },
]);

export const draftPublicationLinkageParityFixtures = Object.freeze([
  {
    id: "draft-linkage-active-draft",
    draft: {},
    expected: {
      linkedPublicSlug: "",
      lifecycleState: "draft",
    },
  },
  {
    id: "draft-linkage-trashed-draft",
    draft: {
      estadoBorrador: "borrador_papelera",
      enPapeleraAt: DRAFT_TRASHED_AT_ISO,
    },
    expected: {
      linkedPublicSlug: "",
      lifecycleState: "draft",
    },
  },
  {
    id: "draft-linkage-published-current-write-shape",
    draft: {
      slugPublico: "mi-publica",
      publicationLifecycle: {
        state: "published",
        activePublicSlug: "mi-publica",
        firstPublishedAt: DRAFT_FIRST_PUBLISHED_AT_ISO,
        expiresAt: DRAFT_FUTURE_EXPIRES_AT_ISO,
        lastPublishedAt: DRAFT_LAST_PUBLISHED_AT_ISO,
        finalizedAt: null,
      },
      ultimaPublicacion: DRAFT_LAST_PUBLISHED_AT_ISO,
      ultimaOperacionPublicacion: "new",
      publicationFinalizedAt: null,
      publicationFinalizationReason: null,
    },
    expected: {
      linkedPublicSlug: "mi-publica",
      lifecycleState: "published",
    },
  },
  {
    id: "draft-linkage-finalized-current-write-shape",
    draft: {
      slugPublico: null,
      publicationLifecycle: {
        state: "finalized",
        activePublicSlug: null,
        firstPublishedAt: DRAFT_FIRST_PUBLISHED_AT_ISO,
        expiresAt: DRAFT_FUTURE_EXPIRES_AT_ISO,
        lastPublishedAt: DRAFT_LAST_PUBLISHED_AT_ISO,
        finalizedAt: DRAFT_FINALIZED_AT_ISO,
      },
      publicationFinalizedAt: DRAFT_FINALIZED_AT_ISO,
      publicationFinalizationReason: "expired",
    },
    expected: {
      linkedPublicSlug: "",
      lifecycleState: "finalized",
    },
  },
  {
    id: "draft-linkage-lifecycle-active-public-slug-fallback",
    draft: {
      publicationLifecycle: {
        activePublicSlug: "solo-activo",
      },
    },
    expected: {
      linkedPublicSlug: "solo-activo",
      lifecycleState: "published",
    },
  },
  {
    id: "draft-linkage-lifecycle-public-slug-fallback",
    draft: {
      publicationLifecycle: {
        publicSlug: "solo-public-slug",
      },
    },
    expected: {
      linkedPublicSlug: "solo-public-slug",
      lifecycleState: "published",
    },
  },
  {
    id: "draft-linkage-lifecycle-slug-fallback",
    draft: {
      publicationLifecycle: {
        slug: "solo-slug",
      },
    },
    expected: {
      linkedPublicSlug: "solo-slug",
      lifecycleState: "published",
    },
  },
  {
    id: "draft-linkage-explicit-draft-state-keeps-stale-linkage-visible",
    draft: {
      slugPublico: "slug-canonico",
      publicationLifecycle: {
        state: "draft",
        activePublicSlug: "slug-activo-stale",
        publicSlug: "slug-public-stale",
        slug: "slug-fallback-stale",
      },
    },
    expected: {
      linkedPublicSlug: "slug-canonico",
      lifecycleState: "draft",
    },
  },
]);

export const publicationParityFixtures = Object.freeze([
  {
    id: "publication-active-canonical",
    publication: {
      estado: "publicada_activa",
      publicadaAt: PUBLICATION_PUBLISHED_AT_ISO,
      vigenteHasta: PUBLICATION_FUTURE_EXPIRES_AT_ISO,
    },
    expected: {
      rawPublicState: "publicada_activa",
      effectiveState: "publicada_activa",
      isFinalized: false,
      isDateExpired: false,
      isVisitorAccessible: true,
      trashPurgeAtIso: null,
    },
  },
  {
    id: "publication-published-alias-through-lifecycle",
    publication: {
      publicationLifecycle: {
        state: "published",
      },
      publicadaEn: PUBLICATION_PUBLISHED_AT_ISO,
      venceAt: PUBLICATION_FUTURE_EXPIRES_AT_ISO,
    },
    expected: {
      rawPublicState: "publicada_activa",
      effectiveState: "publicada_activa",
      isFinalized: false,
      isDateExpired: false,
      isVisitorAccessible: true,
      trashPurgeAtIso: null,
    },
  },
  {
    id: "publication-paused-canonical",
    publication: {
      estado: "publicada_pausada",
      pausadaAt: isoFromNow(-2),
      publicadaAt: PUBLICATION_PUBLISHED_AT_ISO,
      vigenteHasta: PUBLICATION_FUTURE_EXPIRES_AT_ISO,
    },
    expected: {
      rawPublicState: "publicada_pausada",
      effectiveState: "publicada_pausada",
      isFinalized: false,
      isDateExpired: false,
      isVisitorAccessible: false,
      trashPurgeAtIso: null,
    },
  },
  {
    id: "publication-trashed-from-timestamp-like",
    publication: {
      enPapeleraAt: {
        seconds: secondsFromIso(isoFromNow(-3)),
      },
      publicadaAt: PUBLICATION_PUBLISHED_AT_ISO,
      vigenteHasta: PUBLICATION_FUTURE_EXPIRES_AT_ISO,
    },
    expected: {
      rawPublicState: "papelera",
      effectiveState: "papelera",
      isFinalized: false,
      isDateExpired: false,
      isVisitorAccessible: false,
      trashPurgeAtIso: PUBLICATION_FUTURE_TRASH_PURGE_AT_ISO,
    },
  },
  {
    id: "publication-estado-precedence-over-lifecycle-and-timestamps",
    publication: {
      estado: "publicada_pausada",
      publicationLifecycle: {
        state: "published",
      },
      pausadaAt: isoFromNow(-2),
      enPapeleraAt: isoFromNow(-3),
      publicadaAt: PUBLICATION_PUBLISHED_AT_ISO,
      vigenteHasta: PUBLICATION_FUTURE_EXPIRES_AT_ISO,
    },
    expected: {
      rawPublicState: "publicada_pausada",
      effectiveState: "publicada_pausada",
      isFinalized: false,
      isDateExpired: false,
      isVisitorAccessible: false,
      trashPurgeAtIso: null,
    },
  },
  {
    id: "publication-finalized-through-lifecycle-state",
    publication: {
      publicationLifecycle: {
        state: "finalized",
        finalizedAt: isoFromNow(-1),
      },
    },
    expected: {
      rawPublicState: null,
      effectiveState: "finalizada",
      isFinalized: true,
      isDateExpired: false,
      isVisitorAccessible: false,
      trashPurgeAtIso: null,
    },
  },
  {
    id: "publication-trash-purge-from-explicit-vence-at",
    publication: {
      estado: "papelera",
      enPapeleraAt: isoFromNow(-2),
      publicadaAt: PUBLICATION_PUBLISHED_AT_ISO,
      venceAt: PUBLICATION_FUTURE_EXPIRES_AT_ISO,
    },
    expected: {
      rawPublicState: "papelera",
      effectiveState: "papelera",
      isFinalized: false,
      isDateExpired: false,
      isVisitorAccessible: false,
      trashPurgeAtIso: PUBLICATION_FUTURE_TRASH_PURGE_AT_ISO,
    },
  },
  {
    id: "publication-finalized-explicit-state",
    publication: {
      estado: "finalizada",
      publicadaAt: PUBLICATION_PUBLISHED_AT_ISO,
      finalizadaEn: isoFromNow(-1),
    },
    expected: {
      rawPublicState: null,
      effectiveState: "finalizada",
      isFinalized: true,
      isDateExpired: false,
      isVisitorAccessible: false,
      trashPurgeAtIso: null,
    },
  },
  {
    id: "publication-expired-by-vigencia-date",
    publication: {
      estado: "publicada_activa",
      publicadaAt: PUBLICATION_PUBLISHED_AT_ISO,
      vigenteHasta: PUBLICATION_PAST_EXPIRES_AT_ISO,
    },
    expected: {
      rawPublicState: "publicada_activa",
      effectiveState: "finalizada",
      isFinalized: true,
      isDateExpired: true,
      isVisitorAccessible: false,
      trashPurgeAtIso: null,
    },
  },
  {
    id: "publication-expired-by-vence-at-date",
    publication: {
      publicationLifecycle: {
        state: "published",
      },
      publicadaEn: PUBLICATION_PUBLISHED_AT_ISO,
      venceAt: PUBLICATION_PAST_EXPIRES_AT_ISO,
    },
    expected: {
      rawPublicState: "publicada_activa",
      effectiveState: "finalizada",
      isFinalized: true,
      isDateExpired: true,
      isVisitorAccessible: false,
      trashPurgeAtIso: null,
    },
  },
  {
    id: "publication-history-linked",
    publication: {
      source: "history",
      estado: "publicada_activa",
      publicadaEn: PUBLICATION_PUBLISHED_AT_ISO,
      venceAt: PUBLICATION_FUTURE_EXPIRES_AT_ISO,
    },
    expected: {
      rawPublicState: "publicada_activa",
      effectiveState: "finalizada",
      isFinalized: true,
      isDateExpired: false,
      isVisitorAccessible: false,
      trashPurgeAtIso: null,
    },
  },
]);

export const publicationSemanticDriftFixtures = Object.freeze([
  {
    id: "publication-lifecycle-draft-state-drift",
    publication: {
      publicationLifecycle: {
        state: "draft",
      },
    },
    frontendExpected: {
      rawPublicState: "publicada_activa",
      effectiveState: "publicada_activa",
      isFinalized: false,
      isDateExpired: false,
      isVisitorAccessible: true,
      trashPurgeAtIso: null,
    },
    backendExpected: {
      rawPublicState: null,
      effectiveState: null,
      isFinalized: false,
      isDateExpired: false,
      isVisitorAccessible: false,
      trashPurgeAtIso: null,
    },
  },
  {
    id: "publication-lifecycle-expiry-drift",
    publication: {
      publicationLifecycle: {
        state: "published",
        expiresAt: PUBLICATION_PAST_EXPIRES_AT_ISO,
      },
      publicadaEn: PUBLICATION_PUBLISHED_AT_ISO,
    },
    frontendExpected: {
      rawPublicState: "publicada_activa",
      effectiveState: "publicada_activa",
      isFinalized: false,
      isDateExpired: false,
      isVisitorAccessible: true,
      trashPurgeAtIso: null,
    },
    backendExpected: {
      rawPublicState: "publicada_activa",
      effectiveState: "finalizada",
      isFinalized: true,
      isDateExpired: true,
      isVisitorAccessible: false,
      trashPurgeAtIso: null,
    },
  },
  {
    id: "publication-derived-expiry-from-legacy-published-date-drift",
    publication: {
      estado: "publicada_activa",
      publicadaAt: PUBLICATION_OLD_PUBLISHED_AT_ISO,
    },
    frontendExpected: {
      rawPublicState: "publicada_activa",
      effectiveState: "publicada_activa",
      isFinalized: false,
      isDateExpired: false,
      isVisitorAccessible: true,
      trashPurgeAtIso: null,
    },
    backendExpected: {
      rawPublicState: "publicada_activa",
      effectiveState: "finalizada",
      isFinalized: true,
      isDateExpired: true,
      isVisitorAccessible: false,
      trashPurgeAtIso: null,
    },
  },
  {
    id: "publication-trash-purge-derived-from-published-date-drift",
    publication: {
      estado: "papelera",
      enPapeleraAt: isoFromNow(-2),
      publicadaAt: PUBLICATION_PUBLISHED_AT_ISO,
    },
    frontendExpected: {
      rawPublicState: "papelera",
      effectiveState: "papelera",
      isFinalized: false,
      isDateExpired: false,
      isVisitorAccessible: false,
      trashPurgeAtIso: null,
    },
    backendExpected: {
      rawPublicState: "papelera",
      effectiveState: "papelera",
      isFinalized: false,
      isDateExpired: false,
      isVisitorAccessible: false,
      trashPurgeAtIso: PUBLICATION_DERIVED_FUTURE_TRASH_PURGE_AT_ISO,
    },
  },
]);

export const draftParityFixtures = draftTrashParityFixtures;
