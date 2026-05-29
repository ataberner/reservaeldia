import {
  PUBLICATION_PUBLIC_STATES,
  computePublicationExpirationDate,
  resolvePublicationBackendStateFromData,
  resolvePublicationEffectiveExpirationDateFromData,
  resolvePublicationFirstPublishedAtFromData,
  toDateFromTimestampLike,
} from "./publicationLifecycle";
import {
  buildActivePublicationLifecyclePatch,
  buildLinkedDraftFinalizedWrite,
  buildLinkedDraftPublishedSnapshotWrite,
  buildLinkedDraftPublishedStateWrite,
  buildPublicationHistoryWrite,
} from "./publicationWritePreparation";

type PublicationSummaryLike = {
  totalResponses: number;
  confirmedResponses: number;
  declinedResponses: number;
  confirmedGuests: number;
  vegetarianCount: number;
  veganCount: number;
  childrenCount: number;
  dietaryRestrictionsCount: number;
  transportCount: number;
};

type PublishOperation = "new" | "update";

type PlannedPublicationDates = {
  firstPublishedAt: Date;
  effectiveExpirationDate: Date;
  lastPublishedAt: Date;
};

type PlannedPublicationFinalizationResult = {
  slug: string;
  historyId: string;
  draftSlug: string;
  finalized: true;
  alreadyMissing: false;
};

type PlannedPublicationTransitionResult = {
  slug: string;
  estado: string;
  publicadaAt: string;
  venceAt: string;
  pausadaAt: string | null;
  enPapeleraAt: string | null;
};

export type PlannedPublicationFinalizationOperations = {
  historyId: string;
  historyWrite: Record<string, unknown>;
  draftFinalizeWrite: Record<string, unknown> | null;
  reservationReleaseWrite: Record<string, unknown>;
  storagePrefix: string;
  result: PlannedPublicationFinalizationResult;
  logContext: {
    slug: string;
    draftSlug: string;
    historyId: string;
    reason: string;
    totalResponses: number;
  };
};

export type PlannedPublicationTransitionOperations = {
  activePublicationWrite: Record<string, unknown>;
  draftWrite: Record<string, unknown> | null;
  result: PlannedPublicationTransitionResult;
};

export type PlannedPublicationPublishOperations = {
  isFirstPublication: boolean;
  firstPublishedAt: Date;
  effectiveExpirationDate: Date;
  normalizedEstado: string;
  pausedAtDate: Date | null;
  publicUrl: string;
  activeLifecyclePatch: Record<string, unknown>;
  linkedDraftWrite: Record<string, unknown>;
};

type PlannedApprovedSessionPublishingClaim = {
  shouldPublish: boolean;
  sessionWrite: Record<string, unknown> | null;
};

type PlannedApprovedSessionOutcome = {
  sessionWrite: Record<string, unknown>;
  reservationUpdate: {
    slug: string;
    sessionId: string;
    nextStatus: "consumed" | "released";
  } | null;
  result: {
    sessionStatus: "published" | "approved_slug_conflict";
    paymentId: string;
    publicUrl?: string;
    receipt?: Record<string, unknown>;
    message?: string;
  };
};

type PlannedDraftResetRequest = {
  draftSlug: string;
  uid?: string | null;
};

export type PlannedTrashedPublicationPurgeOperations = {
  slug: string;
  storagePrefix: string;
  draftResetRequests: PlannedDraftResetRequest[];
};

export type PlannedLegacyPublicationCleanupOperations = {
  slug: string;
  uid: string;
  storagePrefix: string;
  draftResetRequests: PlannedDraftResetRequest[];
  shouldDeleteActivePublication: boolean;
};

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toIsoOrNull(dateValue: Date | null): string | null {
  return dateValue ? dateValue.toISOString() : null;
}

function getPublicationHistoryId(params: {
  slug: string;
  firstPublishedAt: Date;
}): string {
  const publishedMs = params.firstPublishedAt.getTime();
  return `${params.slug}__${publishedMs}`;
}

function buildDraftResetRequests(params: {
  draftSlugs: Iterable<string>;
  uid?: string | null;
}): PlannedDraftResetRequest[] {
  const requests: PlannedDraftResetRequest[] = [];

  for (const draftSlug of params.draftSlugs) {
    const normalizedDraftSlug = getString(draftSlug);
    if (!normalizedDraftSlug) continue;

    requests.push({
      draftSlug: normalizedDraftSlug,
      ...(typeof params.uid !== "undefined" ? { uid: params.uid } : {}),
    });
  }

  return requests;
}

export function planPublicationFinalizationOperations(params: {
  slug: string;
  publicationData: Record<string, unknown>;
  draftSlug: string;
  dates: PlannedPublicationDates;
  summary: PublicationSummaryLike;
  finalizedAt: Date;
  reason: string;
  historySourceCollection: string;
  historyCreatedAtValue: unknown;
  historyUpdatedAtValue: unknown;
  draftUpdatedAtValue: unknown;
  reservationUpdatedAtValue: unknown;
}): PlannedPublicationFinalizationOperations {
  const {
    slug,
    publicationData,
    draftSlug,
    dates,
    summary,
    finalizedAt,
    reason,
    historySourceCollection,
    historyCreatedAtValue,
    historyUpdatedAtValue,
    draftUpdatedAtValue,
    reservationUpdatedAtValue,
  } = params;

  const historyId = getPublicationHistoryId({
    slug,
    firstPublishedAt: dates.firstPublishedAt,
  });

  return {
    historyId,
    historyWrite: buildPublicationHistoryWrite({
      slug,
      publicationData,
      draftSlug,
      summary,
      firstPublishedAt: dates.firstPublishedAt,
      effectiveExpirationDate: dates.effectiveExpirationDate,
      lastPublishedAt: dates.lastPublishedAt,
      finalizedAt,
      reason,
      sourceCollection: historySourceCollection,
      createdAtValue: historyCreatedAtValue,
      updatedAtValue: historyUpdatedAtValue,
    }),
    draftFinalizeWrite: draftSlug
      ? buildLinkedDraftFinalizedWrite({
          firstPublishedAt: dates.firstPublishedAt,
          effectiveExpirationDate: dates.effectiveExpirationDate,
          lastPublishedAt: dates.lastPublishedAt,
          finalizedAt,
          reason,
          updatedAtValue: draftUpdatedAtValue,
        })
      : null,
    reservationReleaseWrite: {
      status: "released",
      updatedAt: reservationUpdatedAtValue,
      releaseReason: reason,
    },
    storagePrefix: `publicadas/${slug}/`,
    result: {
      slug,
      historyId,
      draftSlug,
      finalized: true,
      alreadyMissing: false,
    },
    logContext: {
      slug,
      draftSlug,
      historyId,
      reason,
      totalResponses: summary.totalResponses,
    },
  };
}

export function planPublicationTransitionOperations(params: {
  slug: string;
  nextState: string;
  firstPublishedAt: Date;
  effectiveExpirationDate: Date;
  pausedAt: Date | null;
  trashedAt: Date | null;
  linkedDraftSlug?: string | null;
  activeUpdatedAtValue: unknown;
  draftUpdatedAtValue: unknown;
}): PlannedPublicationTransitionOperations {
  const {
    slug,
    nextState,
    firstPublishedAt,
    effectiveExpirationDate,
    pausedAt,
    trashedAt,
    linkedDraftSlug,
    activeUpdatedAtValue,
    draftUpdatedAtValue,
  } = params;

  const normalizedLinkedDraftSlug = getString(linkedDraftSlug);

  return {
    activePublicationWrite: buildActivePublicationLifecyclePatch({
      state: nextState,
      firstPublishedAt,
      effectiveExpirationDate,
      pausedAt,
      trashedAt,
      updatedAtValue: activeUpdatedAtValue,
    }),
    draftWrite: normalizedLinkedDraftSlug
      ? buildLinkedDraftPublishedStateWrite({
          publicSlug: slug,
          firstPublishedAt,
          effectiveExpirationDate,
          updatedAtValue: draftUpdatedAtValue,
        })
      : null,
    result: {
      slug,
      estado: nextState,
      publicadaAt: firstPublishedAt.toISOString(),
      venceAt: effectiveExpirationDate.toISOString(),
      pausadaAt: toIsoOrNull(pausedAt),
      enPapeleraAt: toIsoOrNull(trashedAt),
    },
  };
}

export function planPublicationPublishOperations(params: {
  draftSlug: string;
  publicSlug: string;
  operation: PublishOperation;
  existingData: Record<string, unknown> | null;
  now: Date;
  paymentSessionId: string;
  draftContentMeta: Record<string, unknown>;
  activeUpdatedAtValue?: unknown;
}): PlannedPublicationPublishOperations {
  const {
    publicSlug,
    operation,
    existingData,
    now,
    paymentSessionId,
    draftContentMeta,
    activeUpdatedAtValue,
  } = params;

  const isFirstPublication = !existingData;
  const firstPublishedAt =
    (existingData
      ? resolvePublicationFirstPublishedAtFromData(existingData)
      : null) || now;
  const existingVigenciaDate = existingData
    ? resolvePublicationEffectiveExpirationDateFromData(existingData, {
        fallbackPublishedAt: firstPublishedAt,
        includeLifecycleExpiration: false,
      })
    : null;
  const effectiveExpirationDate =
    existingVigenciaDate || computePublicationExpirationDate(firstPublishedAt);
  const existingState = existingData
    ? resolvePublicationBackendStateFromData(existingData)
    : "";
  const shouldKeepPausedState =
    operation === "update" && existingState === PUBLICATION_PUBLIC_STATES.PAUSED;
  const normalizedEstado = shouldKeepPausedState
    ? PUBLICATION_PUBLIC_STATES.PAUSED
    : PUBLICATION_PUBLIC_STATES.ACTIVE;
  const existingPausedAtDate = existingData
    ? toDateFromTimestampLike(existingData.pausadaAt)
    : null;
  const pausedAtDate =
    normalizedEstado === PUBLICATION_PUBLIC_STATES.PAUSED
      ? existingPausedAtDate || now
      : null;

  const activeLifecyclePatch = buildActivePublicationLifecyclePatch({
    state: normalizedEstado,
    firstPublishedAt,
    effectiveExpirationDate,
    lastPublishedAt: now,
    pausedAt: pausedAtDate,
    trashedAt: null,
    ...(typeof activeUpdatedAtValue !== "undefined" ? { updatedAtValue: activeUpdatedAtValue } : {}),
  });

  return {
    isFirstPublication,
    firstPublishedAt,
    effectiveExpirationDate,
    normalizedEstado,
    pausedAtDate,
    publicUrl: `https://reservaeldia.com.ar/i/${publicSlug}`,
    activeLifecyclePatch,
    linkedDraftWrite: buildLinkedDraftPublishedSnapshotWrite({
      publicSlug,
      firstPublishedAt,
      effectiveExpirationDate,
      lastPublishedAt: now,
      operation,
      lastPaymentSessionId: paymentSessionId,
      draftContentMeta,
    }),
  };
}

export function planApprovedSessionPublishingClaim(params: {
  status: string;
  updatedAtValue: unknown;
  publishingLeaseExpiresAtValue?: unknown;
  existingPublishingLeaseExpiresAt?: unknown;
  nowMs?: number;
}): PlannedApprovedSessionPublishingClaim {
  const {
    status,
    updatedAtValue,
    publishingLeaseExpiresAtValue,
    existingPublishingLeaseExpiresAt,
    nowMs,
  } = params;

  if (status === "published" || status === "expired") {
    return {
      shouldPublish: false,
      sessionWrite: null,
    };
  }

  if (status === "publishing" && !isExpiredLease(existingPublishingLeaseExpiresAt, nowMs)) {
    return {
      shouldPublish: false,
      sessionWrite: null,
    };
  }

  const sessionWrite: Record<string, unknown> = {
    status: "publishing",
    lastError: null,
    publishingStage: null,
    publishingStageDurationsMs: null,
    publishingShareImageSubstage: null,
    publishingShareImageDiagnostics: null,
    updatedAt: updatedAtValue,
  };

  if (typeof publishingLeaseExpiresAtValue !== "undefined") {
    sessionWrite.publishingLeaseExpiresAt = publishingLeaseExpiresAtValue;
  }

  return {
    shouldPublish: true,
    sessionWrite,
  };
}

export function planApprovedSessionPublishSuccess(params: {
  operation: PublishOperation;
  sessionId: string;
  fallbackPaymentId: string;
  publicSlug: string;
  publicUrl: string;
  receipt: Record<string, unknown>;
  updatedAtValue: unknown;
  publicationAutoRetry?: Record<string, unknown> | null;
}): PlannedApprovedSessionOutcome {
  const {
    operation,
    sessionId,
    fallbackPaymentId,
    publicSlug,
    publicUrl,
    receipt,
    updatedAtValue,
    publicationAutoRetry,
  } = params;

  const sessionWrite: Record<string, unknown> = {
    status: "published",
    publicUrl,
    receipt,
    lastError: null,
    publishingLeaseExpiresAt: null,
    updatedAt: updatedAtValue,
  };

  if (typeof publicationAutoRetry !== "undefined") {
    sessionWrite.publicationAutoRetry = publicationAutoRetry;
  }

  return {
    sessionWrite,
    reservationUpdate:
      operation === "new"
        ? {
            slug: publicSlug,
            sessionId,
            nextStatus: "consumed",
          }
        : null,
    result: {
      sessionStatus: "published",
      paymentId: fallbackPaymentId,
      publicUrl,
      receipt,
    },
  };
}

export function planApprovedSessionSlugConflict(params: {
  sessionId: string;
  fallbackPaymentId: string;
  publicSlug: string;
  updatedAtValue: unknown;
}): PlannedApprovedSessionOutcome {
  const { sessionId, fallbackPaymentId, publicSlug, updatedAtValue } = params;

  return {
    sessionWrite: {
      status: "approved_slug_conflict",
      lastError: "El enlace ya no esta disponible. Elegi uno nuevo para completar la publicacion.",
      updatedAt: updatedAtValue,
    },
    reservationUpdate: {
      slug: publicSlug,
      sessionId,
      nextStatus: "released",
    },
    result: {
      sessionStatus: "approved_slug_conflict",
      paymentId: fallbackPaymentId,
      message: "Pago aprobado. El enlace entro en conflicto, elegi otro para finalizar.",
    },
  };
}

export function buildApprovedSessionRetryableFailureWrite(params: {
  error: unknown;
  updatedAtValue: unknown;
  publicationAutoRetry?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const { error, updatedAtValue, publicationAutoRetry } = params;

  const write: Record<string, unknown> = {
    status: "payment_approved",
    lastError:
      error instanceof Error
        ? error.message
        : "Pago aprobado, pero la publicacion no se pudo completar en este intento.",
    publishingLeaseExpiresAt: null,
    updatedAt: updatedAtValue,
  };

  if (typeof publicationAutoRetry !== "undefined") {
    write.publicationAutoRetry = publicationAutoRetry;
  }

  return write;
}

function toMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (value && typeof value === "object") {
    const record = value as {
      toMillis?: () => number;
      toDate?: () => Date;
      seconds?: number;
    };
    if (typeof record.toMillis === "function") {
      const millis = record.toMillis();
      return Number.isFinite(millis) ? millis : null;
    }
    if (typeof record.toDate === "function") {
      const date = record.toDate();
      return Number.isFinite(date.getTime()) ? date.getTime() : null;
    }
    if (typeof record.seconds === "number" && Number.isFinite(record.seconds)) {
      return record.seconds * 1000;
    }
  }

  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isExpiredLease(value: unknown, nowMs: unknown): boolean {
  const leaseMs = toMillis(value);
  const currentMs = typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
  return leaseMs !== null && leaseMs <= currentMs;
}

export function planTrashedPublicationPurgeOperations(params: {
  slug: string;
  draftSlugs: Iterable<string>;
}): PlannedTrashedPublicationPurgeOperations {
  const { slug, draftSlugs } = params;

  return {
    slug,
    storagePrefix: `publicadas/${slug}/`,
    draftResetRequests: buildDraftResetRequests({ draftSlugs }),
  };
}

export function planLegacyPublicationCleanupOperations(params: {
  slug: string;
  uid: string;
  draftSlugs: Iterable<string>;
  shouldDeleteActivePublication: boolean;
}): PlannedLegacyPublicationCleanupOperations {
  const { slug, uid, draftSlugs, shouldDeleteActivePublication } = params;

  return {
    slug,
    uid,
    storagePrefix: `publicadas/${slug}/`,
    draftResetRequests: buildDraftResetRequests({
      draftSlugs,
      uid,
    }),
    shouldDeleteActivePublication,
  };
}
