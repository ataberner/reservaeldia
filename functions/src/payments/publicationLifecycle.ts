import * as admin from "firebase-admin";

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

export const PUBLICATION_TRASH_RETENTION_DAYS = 30;

export const PUBLICATION_VIGENCY_MONTHS = 12;

function normalizeStateText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
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
