import * as admin from "firebase-admin";

export const PUBLICATION_LIFECYCLE_STATES = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  FINALIZED: "finalized",
});

export type PublicationLifecycleState =
  (typeof PUBLICATION_LIFECYCLE_STATES)[keyof typeof PUBLICATION_LIFECYCLE_STATES];

export const PUBLICATION_VIGENCY_MONTHS = 12;

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
