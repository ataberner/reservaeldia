import {
  buildDraftPublicationLifecycleFields,
  buildPublicationDateWriteFields,
  PUBLICATION_LIFECYCLE_STATES,
  toFirestoreTimestampOrNull,
} from "./publicationLifecycle";

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

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildPublicationHistoryWrite(params: {
  slug: string;
  publicationData: Record<string, unknown>;
  draftSlug: string;
  summary: PublicationSummaryLike;
  firstPublishedAt: Date;
  effectiveExpirationDate: Date;
  lastPublishedAt: Date;
  finalizedAt: Date;
  reason: string;
  sourceCollection: string;
  createdAtValue: unknown;
  updatedAtValue: unknown;
}): Record<string, unknown> {
  const {
    slug,
    publicationData,
    draftSlug,
    summary,
    firstPublishedAt,
    effectiveExpirationDate,
    lastPublishedAt,
    finalizedAt,
    reason,
    sourceCollection,
    createdAtValue,
    updatedAtValue,
  } = params;

  return {
    slug,
    userId: getString(publicationData.userId) || null,
    nombre: publicationData.nombre || slug,
    tipo: publicationData.tipo || null,
    portada: publicationData.portada || null,
    plantillaId: publicationData.plantillaId || null,
    borradorSlug: draftSlug,
    slugOriginal: getString(publicationData.slugOriginal) || draftSlug,
    estado: PUBLICATION_LIFECYCLE_STATES.FINALIZED,
    ...buildPublicationDateWriteFields({
      firstPublishedAt,
      effectiveExpirationDate,
      lastPublishedAt,
      finalizedAt,
    }),
    motivoFinalizacion: reason,
    urlPublica: null,
    rsvp: publicationData.rsvp || null,
    gifts: publicationData.gifts || null,
    rsvpSummary: summary,
    totalRsvpsHistorico: summary.totalResponses,
    htmlPublicadoEliminado: true,
    sourceCollection,
    sourceSlug: slug,
    createdAt: createdAtValue,
    updatedAt: updatedAtValue,
  };
}

export function buildLinkedDraftFinalizedWrite(params: {
  firstPublishedAt: Date;
  effectiveExpirationDate: Date;
  lastPublishedAt: Date;
  finalizedAt: Date;
  reason: string;
  updatedAtValue: unknown;
}): Record<string, unknown> {
  const {
    firstPublishedAt,
    effectiveExpirationDate,
    lastPublishedAt,
    finalizedAt,
    reason,
    updatedAtValue,
  } = params;

  return {
    slugPublico: null,
    publicationLifecycle: buildDraftPublicationLifecycleFields({
      state: PUBLICATION_LIFECYCLE_STATES.FINALIZED,
      activePublicSlug: null,
      firstPublishedAt,
      effectiveExpirationDate,
      lastPublishedAt,
      finalizedAt,
    }),
    publicationFinalizedAt: toFirestoreTimestampOrNull(finalizedAt),
    publicationFinalizationReason: reason,
    updatedAt: updatedAtValue,
  };
}

export function buildLinkedDraftPublishedStateWrite(params: {
  publicSlug: string;
  firstPublishedAt: Date;
  effectiveExpirationDate: Date;
  updatedAtValue: unknown;
}): Record<string, unknown> {
  const { publicSlug, firstPublishedAt, effectiveExpirationDate, updatedAtValue } = params;

  return {
    slugPublico: publicSlug,
    publicationLifecycle: buildDraftPublicationLifecycleFields({
      state: PUBLICATION_LIFECYCLE_STATES.PUBLISHED,
      activePublicSlug: publicSlug,
      firstPublishedAt,
      effectiveExpirationDate,
      finalizedAt: null,
    }),
    publicationFinalizedAt: null,
    publicationFinalizationReason: null,
    updatedAt: updatedAtValue,
  };
}

export function buildLinkedDraftPublishedSnapshotWrite(params: {
  publicSlug: string;
  firstPublishedAt: Date;
  effectiveExpirationDate: Date;
  lastPublishedAt: Date;
  operation: PublishOperation;
  draftContentMeta?: Record<string, unknown>;
  lastPaymentSessionId?: string;
}): Record<string, unknown> {
  const {
    publicSlug,
    firstPublishedAt,
    effectiveExpirationDate,
    lastPublishedAt,
    operation,
    draftContentMeta,
    lastPaymentSessionId,
  } = params;

  const payload: Record<string, unknown> = {
    slugPublico: publicSlug,
    publicationLifecycle: buildDraftPublicationLifecycleFields({
      state: PUBLICATION_LIFECYCLE_STATES.PUBLISHED,
      activePublicSlug: publicSlug,
      firstPublishedAt,
      effectiveExpirationDate,
      lastPublishedAt,
      finalizedAt: null,
    }),
    ultimaPublicacion: toFirestoreTimestampOrNull(lastPublishedAt),
    ultimaOperacionPublicacion: operation,
    publicationFinalizedAt: null,
    publicationFinalizationReason: null,
  };

  if (typeof lastPaymentSessionId !== "undefined") {
    payload.lastPaymentSessionId = lastPaymentSessionId;
  }

  if (typeof draftContentMeta !== "undefined") {
    payload.draftContentMeta = draftContentMeta;
  }

  return payload;
}

export function buildLinkedDraftResetWrite(params: {
  updatedAtValue: unknown;
}): Record<string, unknown> {
  return {
    slugPublico: null,
    publicationLifecycle: buildDraftPublicationLifecycleFields({
      state: PUBLICATION_LIFECYCLE_STATES.DRAFT,
      activePublicSlug: null,
      firstPublishedAt: null,
      effectiveExpirationDate: null,
      lastPublishedAt: null,
      finalizedAt: null,
    }),
    ultimaPublicacion: null,
    ultimaOperacionPublicacion: null,
    publicationFinalizedAt: null,
    publicationFinalizationReason: null,
    updatedAt: params.updatedAtValue,
  };
}

export function buildActivePublicationLifecyclePatch(params: {
  state: string;
  firstPublishedAt: Date;
  effectiveExpirationDate: Date;
  lastPublishedAt?: Date;
  pausedAt?: Date | null;
  trashedAt?: Date | null;
  updatedAtValue?: unknown;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    estado: params.state,
    ...buildPublicationDateWriteFields({
      firstPublishedAt: params.firstPublishedAt,
      effectiveExpirationDate: params.effectiveExpirationDate,
      lastPublishedAt: params.lastPublishedAt,
    }),
  };

  if ("pausedAt" in params) {
    payload.pausadaAt = toFirestoreTimestampOrNull(params.pausedAt);
  }

  if ("trashedAt" in params) {
    payload.enPapeleraAt = toFirestoreTimestampOrNull(params.trashedAt);
  }

  if ("updatedAtValue" in params) {
    payload.updatedAt = params.updatedAtValue;
  }

  return payload;
}
