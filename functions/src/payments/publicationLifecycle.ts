import * as admin from "firebase-admin";
import { normalizePublicSlug } from "../utils/publicSlug";

export const PUBLICATION_LIFECYCLE_STATES = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  FINALIZED: "finalized",
});

export type PublicationLifecycleState =
  (typeof PUBLICATION_LIFECYCLE_STATES)[keyof typeof PUBLICATION_LIFECYCLE_STATES];

export const PUBLICATION_PUBLIC_STATES = Object.freeze({
  ACTIVE: "publicada_activa",
  PAUSED: "publicada_pausada",
  TRASH: "papelera",
});

export type PublicationPublicState =
  (typeof PUBLICATION_PUBLIC_STATES)[keyof typeof PUBLICATION_PUBLIC_STATES];

export type PublicationLifecycleSnapshotOptions = {
  now?: Date;
  fallbackPublishedAt?: unknown;
  fallbackLastPublishedAt?: unknown;
  includeLifecycleFirstPublishedAt?: boolean;
  includeLifecycleExpiration?: boolean;
  includeLifecycleLastPublishedAt?: boolean;
};

export type PublicationLifecycleSnapshot = {
  rawPublicState: PublicationPublicState | null;
  backendState: string;
  isExplicitlyFinalized: boolean;
  effectiveExpirationDate: Date | null;
  isDateExpired: boolean;
  isExpired: boolean;
  isPubliclyAccessibleByState: boolean;
  trashPurgeAt: Date | null;
};

export type PublicationResolvedTimeline = {
  firstPublishedAt: Date | null;
  effectiveExpirationDate: Date | null;
  lastPublishedAt: Date | null;
};

export const PUBLICATION_TRASH_RETENTION_DAYS = 30;

export const PUBLICATION_VIGENCY_MONTHS = 12;

function normalizeStateText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function isExplicitFinalizedState(value: unknown): boolean {
  const normalized = normalizeStateText(value);
  return (
    normalized === PUBLICATION_LIFECYCLE_STATES.FINALIZED ||
    normalized === "finalizada"
  );
}

function resolvePublicationLifecycleRecord(
  data: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  return asRecord(asRecord(data).publicationLifecycle);
}

function readStoredExpirationInput(
  data: Record<string, unknown> | null | undefined
): unknown {
  const safeData = asRecord(data);
  return safeData.venceAt ?? safeData.vigenteHasta;
}

export function toFirestoreTimestampOrNull(
  value: Date | null | undefined
): admin.firestore.Timestamp | null | undefined {
  if (typeof value === "undefined") return undefined;
  if (value === null) return null;
  return admin.firestore.Timestamp.fromDate(value);
}

function resolvePublishedAtForExpiration(
  data: Record<string, unknown> | null | undefined,
  options?: PublicationLifecycleSnapshotOptions
): Date | null {
  return resolvePublicationFirstPublishedAtFromData(data, options);
}

function resolveTrashPurgeExpirationDate(
  data: Record<string, unknown> | null | undefined,
  options?: PublicationLifecycleSnapshotOptions
): Date | null {
  const storedExpiration = toDateFromTimestampLike(readStoredExpirationInput(data));
  if (storedExpiration) return storedExpiration;

  const publishedAt = resolvePublishedAtForExpiration(data, options);
  if (!(publishedAt instanceof Date)) return null;

  return computePublicationExpirationDate(publishedAt);
}

export function resolveDraftLinkedPublicSlugFromData(
  draftData: Record<string, unknown> | null | undefined
): string {
  const safeDraftData = asRecord(draftData);
  const lifecycle = asRecord(safeDraftData.publicationLifecycle);

  return (
    normalizePublicSlug(safeDraftData.slugPublico) ||
    normalizePublicSlug(lifecycle.activePublicSlug) ||
    normalizePublicSlug(lifecycle.publicSlug) ||
    normalizePublicSlug(lifecycle.slug) ||
    ""
  );
}

export function resolveDraftPublicationLifecycleStateFromData(
  draftData: Record<string, unknown> | null | undefined
): PublicationLifecycleState {
  const lifecycle = asRecord(asRecord(draftData).publicationLifecycle);
  const explicitState = normalizeStateText(lifecycle.state);

  if (
    explicitState === PUBLICATION_LIFECYCLE_STATES.DRAFT ||
    explicitState === PUBLICATION_LIFECYCLE_STATES.PUBLISHED ||
    explicitState === PUBLICATION_LIFECYCLE_STATES.FINALIZED
  ) {
    return explicitState as PublicationLifecycleState;
  }

  return resolveDraftLinkedPublicSlugFromData(draftData)
    ? PUBLICATION_LIFECYCLE_STATES.PUBLISHED
    : PUBLICATION_LIFECYCLE_STATES.DRAFT;
}

export function normalizePublicationPublicState(value: unknown): PublicationPublicState | null {
  const normalized = normalizeStateText(value);
  if (!normalized) return null;

  if (normalized === PUBLICATION_PUBLIC_STATES.ACTIVE) return PUBLICATION_PUBLIC_STATES.ACTIVE;
  if (normalized === PUBLICATION_PUBLIC_STATES.PAUSED) return PUBLICATION_PUBLIC_STATES.PAUSED;
  if (normalized === PUBLICATION_PUBLIC_STATES.TRASH) return PUBLICATION_PUBLIC_STATES.TRASH;

  if (
    normalized === PUBLICATION_LIFECYCLE_STATES.PUBLISHED ||
    normalized === "activa" ||
    normalized === "active"
  ) {
    return PUBLICATION_PUBLIC_STATES.ACTIVE;
  }

  if (normalized === "pausada" || normalized === "paused") {
    return PUBLICATION_PUBLIC_STATES.PAUSED;
  }

  if (normalized === "trash") {
    return PUBLICATION_PUBLIC_STATES.TRASH;
  }

  return null;
}

export function resolvePublicationPublicStateFromData(
  data: Record<string, unknown> | null | undefined
): PublicationPublicState | null {
  if (!data || typeof data !== "object") return null;

  const rawEstado = normalizeStateText(data.estado);
  if (
    rawEstado === PUBLICATION_LIFECYCLE_STATES.FINALIZED ||
    rawEstado === "finalizada" ||
    rawEstado === PUBLICATION_LIFECYCLE_STATES.DRAFT
  ) {
    return null;
  }

  const fromEstado = normalizePublicationPublicState(data.estado);
  if (fromEstado) return fromEstado;

  const lifecycle =
    data.publicationLifecycle && typeof data.publicationLifecycle === "object"
      ? (data.publicationLifecycle as Record<string, unknown>)
      : null;

  const rawLifecycleState = normalizeStateText(lifecycle?.state);
  if (
    rawLifecycleState === PUBLICATION_LIFECYCLE_STATES.FINALIZED ||
    rawLifecycleState === "finalizada" ||
    rawLifecycleState === PUBLICATION_LIFECYCLE_STATES.DRAFT
  ) {
    return null;
  }

  const fromLifecycle = normalizePublicationPublicState(lifecycle?.state);
  if (fromLifecycle) return fromLifecycle;

  if (data.enPapeleraAt) return PUBLICATION_PUBLIC_STATES.TRASH;
  if (data.pausadaAt) return PUBLICATION_PUBLIC_STATES.PAUSED;

  return PUBLICATION_PUBLIC_STATES.ACTIVE;
}

export function resolvePublicationBackendStateFromData(
  data: Record<string, unknown> | null | undefined
): string {
  if (!data || typeof data !== "object") return "";

  const rawPublicState = resolvePublicationPublicStateFromData(data);
  if (rawPublicState) return rawPublicState;

  const safeData = asRecord(data);
  const estado = normalizeStateText(safeData.estado);
  if (isExplicitFinalizedState(estado)) return estado;
  if (estado) return estado;

  const lifecycleState = normalizeStateText(
    resolvePublicationLifecycleRecord(safeData).state
  );
  if (isExplicitFinalizedState(lifecycleState)) return lifecycleState;

  return lifecycleState;
}

export function resolvePublicationFirstPublishedAtFromData(
  data: Record<string, unknown> | null | undefined,
  options?: PublicationLifecycleSnapshotOptions
): Date | null {
  const safeData = asRecord(data);
  const lifecycle = resolvePublicationLifecycleRecord(safeData);

  return (
    toDateFromTimestampLike(safeData.publicadaAt) ||
    toDateFromTimestampLike(safeData.publicadaEn) ||
    (options?.includeLifecycleFirstPublishedAt
      ? toDateFromTimestampLike(lifecycle.firstPublishedAt)
      : null) ||
    toDateFromTimestampLike(options?.fallbackPublishedAt)
  );
}

export function resolvePublicationEffectiveExpirationDateFromData(
  data: Record<string, unknown> | null | undefined,
  options?: PublicationLifecycleSnapshotOptions
): Date | null {
  const safeData = asRecord(data);
  const lifecycle = resolvePublicationLifecycleRecord(safeData);

  const storedExpiration = toDateFromTimestampLike(readStoredExpirationInput(safeData));
  if (storedExpiration) return storedExpiration;

  if (options?.includeLifecycleExpiration !== false) {
    const lifecycleExpiration = toDateFromTimestampLike(lifecycle.expiresAt);
    if (lifecycleExpiration) return lifecycleExpiration;
  }

  const publishedAt = resolvePublishedAtForExpiration(safeData, options);
  if (!(publishedAt instanceof Date)) return null;

  return computePublicationExpirationDate(publishedAt);
}

export function resolvePublicationLastPublishedAtFromData(
  data: Record<string, unknown> | null | undefined,
  options?: PublicationLifecycleSnapshotOptions
): Date | null {
  const safeData = asRecord(data);
  const lifecycle = resolvePublicationLifecycleRecord(safeData);
  const fallbackLastPublishedAt =
    toDateFromTimestampLike(options?.fallbackLastPublishedAt) ||
    resolvePublicationFirstPublishedAtFromData(safeData, options);

  return (
    toDateFromTimestampLike(safeData.ultimaPublicacionEn) ||
    (options?.includeLifecycleLastPublishedAt
      ? toDateFromTimestampLike(lifecycle.lastPublishedAt)
      : null) ||
    toDateFromTimestampLike(safeData.publicadaEn) ||
    fallbackLastPublishedAt
  );
}

export function resolvePublicationTimelineFromData(
  data: Record<string, unknown> | null | undefined,
  options?: PublicationLifecycleSnapshotOptions
): PublicationResolvedTimeline {
  const firstPublishedAt = resolvePublicationFirstPublishedAtFromData(data, options);
  const effectiveExpirationDate = resolvePublicationEffectiveExpirationDateFromData(
    data,
    options
  );
  const lastPublishedAt = resolvePublicationLastPublishedAtFromData(data, options);

  return {
    firstPublishedAt,
    effectiveExpirationDate,
    lastPublishedAt,
  };
}

export function buildPublicationDateWriteFields(params: {
  firstPublishedAt?: Date | null;
  effectiveExpirationDate?: Date | null;
  lastPublishedAt?: Date | null;
  finalizedAt?: Date | null;
}): Record<string, admin.firestore.Timestamp | null> {
  const payload: Record<string, admin.firestore.Timestamp | null> = {};
  const publishedTimestamp = toFirestoreTimestampOrNull(params.firstPublishedAt);
  if (typeof publishedTimestamp !== "undefined") {
    payload.publicadaAt = publishedTimestamp;
    payload.publicadaEn = publishedTimestamp;
  }

  const expirationTimestamp = toFirestoreTimestampOrNull(params.effectiveExpirationDate);
  if (typeof expirationTimestamp !== "undefined") {
    payload.venceAt = expirationTimestamp;
    payload.vigenteHasta = expirationTimestamp;
  }

  const lastPublishedTimestamp = toFirestoreTimestampOrNull(params.lastPublishedAt);
  if (typeof lastPublishedTimestamp !== "undefined") {
    payload.ultimaPublicacionEn = lastPublishedTimestamp;
  }

  const finalizedTimestamp = toFirestoreTimestampOrNull(params.finalizedAt);
  if (typeof finalizedTimestamp !== "undefined") {
    payload.finalizadaEn = finalizedTimestamp;
  }

  return payload;
}

export function buildDraftPublicationLifecycleFields(params: {
  state: PublicationLifecycleState;
  activePublicSlug?: string | null;
  firstPublishedAt?: Date | null;
  effectiveExpirationDate?: Date | null;
  lastPublishedAt?: Date | null;
  finalizedAt?: Date | null;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    state: params.state,
  };

  if ("activePublicSlug" in params) {
    payload.activePublicSlug = params.activePublicSlug ?? null;
  }

  const firstPublishedTimestamp = toFirestoreTimestampOrNull(params.firstPublishedAt);
  if (typeof firstPublishedTimestamp !== "undefined") {
    payload.firstPublishedAt = firstPublishedTimestamp;
  }

  const expirationTimestamp = toFirestoreTimestampOrNull(
    params.effectiveExpirationDate
  );
  if (typeof expirationTimestamp !== "undefined") {
    payload.expiresAt = expirationTimestamp;
  }

  const lastPublishedTimestamp = toFirestoreTimestampOrNull(params.lastPublishedAt);
  if (typeof lastPublishedTimestamp !== "undefined") {
    payload.lastPublishedAt = lastPublishedTimestamp;
  }

  const finalizedTimestamp = toFirestoreTimestampOrNull(params.finalizedAt);
  if (typeof finalizedTimestamp !== "undefined") {
    payload.finalizedAt = finalizedTimestamp;
  }

  return payload;
}

export function resolvePublicationLifecycleSnapshotFromData(
  data: Record<string, unknown> | null | undefined,
  options?: PublicationLifecycleSnapshotOptions
): PublicationLifecycleSnapshot {
  const safeData = asRecord(data);
  const now = options?.now instanceof Date ? options.now : new Date();
  const rawPublicState = resolvePublicationPublicStateFromData(data);
  const backendState = resolvePublicationBackendStateFromData(data);
  const effectiveExpirationDate = resolvePublicationEffectiveExpirationDateFromData(
    data,
    options
  );
  const isDateExpired =
    effectiveExpirationDate instanceof Date &&
    effectiveExpirationDate.getTime() <= now.getTime();
  const isExpired = isExplicitFinalizedState(backendState)
    ? true
    : backendState === PUBLICATION_PUBLIC_STATES.TRASH
      ? false
      : isDateExpired;
  const trashPurgeBaseDate =
    rawPublicState === PUBLICATION_PUBLIC_STATES.TRASH
      ? resolveTrashPurgeExpirationDate(data, options)
      : null;

  return {
    rawPublicState,
    backendState,
    isExplicitlyFinalized:
      isExplicitFinalizedState(safeData.estado) ||
      isExplicitFinalizedState(resolvePublicationLifecycleRecord(safeData).state),
    effectiveExpirationDate,
    isDateExpired,
    isExpired,
    isPubliclyAccessibleByState:
      Boolean(rawPublicState) && isPubliclyAccessible(rawPublicState),
    trashPurgeAt:
      trashPurgeBaseDate instanceof Date ? computeTrashPurgeAt(trashPurgeBaseDate) : null,
  };
}

export function isTrashState(value: unknown): boolean {
  return normalizePublicationPublicState(value) === PUBLICATION_PUBLIC_STATES.TRASH;
}

export function isPubliclyAccessible(value: unknown): boolean {
  return normalizePublicationPublicState(value) === PUBLICATION_PUBLIC_STATES.ACTIVE;
}

function addDaysPreservingDateTimeUTC(baseDate: Date, daysToAdd: number): Date {
  const days = Number.isFinite(daysToAdd) ? Math.trunc(daysToAdd) : 0;
  return new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
}

export function computeTrashPurgeAt(venceAt: Date): Date {
  return addDaysPreservingDateTimeUTC(venceAt, PUBLICATION_TRASH_RETENTION_DAYS);
}

export function toDateFromTimestampLike(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    try {
      const asDate = (value as { toDate: () => Date }).toDate();
      return asDate instanceof Date && !Number.isNaN(asDate.getTime()) ? asDate : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "number") {
    const asDate = new Date(value);
    return Number.isNaN(asDate.getTime()) ? null : asDate;
  }
  if (typeof value === "string") {
    const asDate = new Date(value);
    return Number.isNaN(asDate.getTime()) ? null : asDate;
  }
  if (typeof value === "object" && value !== null) {
    const seconds = Number((value as { seconds?: unknown }).seconds);
    if (Number.isFinite(seconds)) {
      const asDate = new Date(seconds * 1000);
      return Number.isNaN(asDate.getTime()) ? null : asDate;
    }
  }
  return null;
}

export function addMonthsPreservingDateTimeUTC(baseDate: Date, monthsToAdd: number): Date {
  const months = Number.isFinite(monthsToAdd) ? Math.trunc(monthsToAdd) : 0;

  const year = baseDate.getUTCFullYear();
  const month = baseDate.getUTCMonth();
  const day = baseDate.getUTCDate();
  const hour = baseDate.getUTCHours();
  const minute = baseDate.getUTCMinutes();
  const second = baseDate.getUTCSeconds();
  const millisecond = baseDate.getUTCMilliseconds();

  const totalMonths = month + months;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const lastDayOfMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDayOfMonth);

  return new Date(
    Date.UTC(targetYear, targetMonth, safeDay, hour, minute, second, millisecond)
  );
}

export function computePublicationExpirationDate(firstPublishedAt: Date): Date {
  return addMonthsPreservingDateTimeUTC(firstPublishedAt, PUBLICATION_VIGENCY_MONTHS);
}

export function computePublicationExpirationTimestamp(
  firstPublishedAt: Date
): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromDate(
    computePublicationExpirationDate(firstPublishedAt)
  );
}

export function isPublicationExpiredByVigenciaDate(
  vigenteHasta: unknown,
  now: Date = new Date()
): boolean {
  const vigenteHastaDate = toDateFromTimestampLike(vigenteHasta);
  if (!vigenteHastaDate) return false;
  return vigenteHastaDate.getTime() <= now.getTime();
}
