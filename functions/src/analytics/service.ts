import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { once } from "node:events";
import { createWriteStream, promises as fsPromises } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { BUSINESS_METRIC_CATALOG } from "./catalog";
import { requireSuperAdmin } from "../auth/adminAuth";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: "reservaeldia-7a440.firebasestorage.app",
  });
}

const db = admin.firestore();

const ANALYTICS_EVENTS_COLLECTION = "analyticsEvents";
const ANALYTICS_USERS_COLLECTION = "analyticsUsers";
const ANALYTICS_INVITATIONS_COLLECTION = "analyticsInvitations";
const ANALYTICS_DAILY_COLLECTION = "analyticsDaily";
const ANALYTICS_WEEKLY_COLLECTION = "analyticsWeekly";
const ANALYTICS_MONTHLY_COLLECTION = "analyticsMonthly";
const ANALYTICS_TEMPLATES_COLLECTION = "analyticsTemplates";
const ANALYTICS_COHORTS_COLLECTION = "analyticsCohorts";
const ANALYTICS_JOBS_COLLECTION = "analyticsJobs";
const ANALYTICS_EXPORTS_COLLECTION = "analyticsExports";
const BUSINESS_TIMEZONE = "America/Argentina/Buenos_Aires";
const BUSINESS_FIXED_UTC_OFFSET = "-03:00";
const SCHEDULE_REGION = "us-central1";
const UNKNOWN_TEMPLATE_ANALYTICS_ID = "unknown-template";
const REBUILD_SCAN_PAGE_SIZE = 250;
const REBUILD_JOB_ID = "businessAnalyticsRebuild";
const REBUILD_JOB_HEARTBEAT_EVERY = 100;
const REBUILD_JOB_LEASE_MS = 15 * 60 * 1000;
const DEFAULT_ANALYTICS_RANGE_DAYS = 90;
const MAX_ANALYTICS_RANGE_DAYS = 365;
const RAW_EXPORT_DATASET = "analytics_events_raw";
const RAW_EXPORT_FORMAT = "csv";
const RAW_EXPORT_MAX_ROWS = 1_000_000;
const RAW_EXPORT_BATCH_SIZE = 2000;
const RAW_EXPORT_SIGNED_URL_MS = 15 * 60 * 1000;
const RAW_EXPORT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const RAW_EXPORT_JOB_LEASE_MS = 15 * 60 * 1000;
type DurationDistribution = {
  under_1h: number;
  from_1h_to_under_24h: number;
  from_1d_to_under_7d: number;
  from_7d_to_under_30d: number;
  from_30d_or_more: number;
  notReached: number;
};

const EMPTY_DISTRIBUTION: DurationDistribution = Object.freeze({
  under_1h: 0,
  from_1h_to_under_24h: 0,
  from_1d_to_under_7d: 0,
  from_7d_to_under_30d: 0,
  from_30d_or_more: 0,
  notReached: 0,
});
const TRACKED_EVENT_NAMES = new Set([
  "registro_usuario",
  "invitacion_creada",
  "invitacion_publicada",
  "pago_aprobado",
]);

type AnalyticsEventName =
  | "registro_usuario"
  | "invitacion_creada"
  | "invitacion_publicada"
  | "pago_aprobado";

type JsonMap = Record<string, unknown>;

type PeriodType = "day" | "week" | "month";
type SeriesPeriodType = PeriodType | "year";

type PeriodKeys = {
  dateKey: string;
  weekKey: string;
  monthKey: string;
  cohortMonth: string;
};

type AnalyticsDateRangeInput = {
  fromDate?: string | null;
  toDate?: string | null;
};

type AnalyticsDateRange = {
  fromDate: string;
  toDate: string;
  previousFromDate: string;
  previousToDate: string;
  fromDateAtNoonUtc: Date;
  toDateAtNoonUtc: Date;
  fromTimestampStart: Date;
  toTimestampEnd: Date;
  fromWeekKey: string;
  toWeekKey: string;
  fromMonthKey: string;
  toMonthKey: string;
  dayCount: number;
};

type BusinessAnalyticsEvent = {
  eventId: string;
  schemaVersion: number;
  eventName: AnalyticsEventName;
  timestamp: admin.firestore.Timestamp;
  businessDateKey: string;
  businessWeekKey: string;
  businessMonthKey: string;
  userId: string;
  invitacionId: string | null;
  templateId: string | null;
  metadata: JsonMap;
  processingState: "pending" | "processed" | "failed";
  processingAttempts: number;
  processedAt: admin.firestore.Timestamp | null;
  lastProcessingError: string | null;
  createdAt: admin.firestore.FieldValue;
  updatedAt: admin.firestore.FieldValue;
};

type QueueAnalyticsEventInput = {
  eventId: string;
  eventName: AnalyticsEventName;
  timestamp: Date;
  userId: string;
  invitacionId?: string | null;
  templateId?: string | null;
  metadata?: JsonMap;
};

type QueueAnalyticsEventOptions = {
  processImmediately?: boolean;
};

type RawAnalyticsExportStatus = "queued" | "running" | "succeeded" | "failed";

type DurationSummary = {
  avgSeconds: number | null;
  p50Seconds: number | null;
  distribution: DurationDistribution;
  reachedUsers: number;
  notReachedUsers: number;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asObject(value: unknown): JsonMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonMap;
}

function asNumber(value: unknown, fallback = 0): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  if (
    typeof value === "object" &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    try {
      const parsed = (value as { toDate: () => Date }).toDate();
      return parsed instanceof Date && Number.isFinite(parsed.getTime()) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function sanitizeMetadata(value: unknown): JsonMap {
  const source = asObject(value);
  const out: JsonMap = {};

  Object.entries(source).forEach(([key, rawValue]) => {
    if (typeof rawValue === "undefined") return;
    if (
      rawValue === null ||
      typeof rawValue === "string" ||
      typeof rawValue === "number" ||
      typeof rawValue === "boolean"
    ) {
      out[key] = rawValue;
      return;
    }
    const nested = sanitizeMetadata(rawValue);
    if (Object.keys(nested).length > 0) {
      out[key] = nested;
    }
  });

  return out;
}

function getDateFormatter() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getLocalDateParts(date: Date): { year: number; month: number; day: number } {
  const formatter = getDateFormatter();
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value || "0");
  const month = Number(parts.find((part) => part.type === "month")?.value || "0");
  const day = Number(parts.find((part) => part.type === "day")?.value || "0");

  return { year, month, day };
}

function buildDateKey(parts: { year: number; month: number; day: number }): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function buildMonthKey(parts: { year: number; month: number }): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}`;
}

function buildIsoWeekKey(parts: { year: number; month: number; day: number }): string {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const isoDay = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - isoDay);
  const weekYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const weekNumber = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${weekYear}-W${String(weekNumber).padStart(2, "0")}`;
}

function getPeriodKeys(date: Date): PeriodKeys {
  const parts = getLocalDateParts(date);
  return {
    dateKey: buildDateKey(parts),
    weekKey: buildIsoWeekKey(parts),
    monthKey: buildMonthKey(parts),
    cohortMonth: buildMonthKey(parts),
  };
}

function getCurrentPeriodKeys(): PeriodKeys {
  return getPeriodKeys(new Date());
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function toDateFromDateKeyAtNoonUtc(dateKey: string): Date | null {
  if (!isDateKey(dateKey)) return null;
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function toBusinessDayStart(dateKey: string): Date | null {
  if (!isDateKey(dateKey)) return null;
  const date = new Date(`${dateKey}T00:00:00.000${BUSINESS_FIXED_UTC_OFFSET}`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function toBusinessDayEnd(dateKey: string): Date | null {
  if (!isDateKey(dateKey)) return null;
  const date = new Date(`${dateKey}T23:59:59.999${BUSINESS_FIXED_UTC_OFFSET}`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const baseDate = toDateFromDateKeyAtNoonUtc(dateKey);
  if (!baseDate) return dateKey;
  baseDate.setUTCDate(baseDate.getUTCDate() + days);
  return getPeriodKeys(baseDate).dateKey;
}

function getDateKeyDiffInDays(fromDateKey: string, toDateKey: string): number {
  const fromDate = toDateFromDateKeyAtNoonUtc(fromDateKey);
  const toDate = toDateFromDateKeyAtNoonUtc(toDateKey);
  if (!fromDate || !toDate) return Number.NaN;
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

function getDefaultAnalyticsDateRange(): AnalyticsDateRange {
  const toDate = getCurrentPeriodKeys().dateKey;
  const fromDate = addDaysToDateKey(toDate, -DEFAULT_ANALYTICS_RANGE_DAYS);
  return buildAnalyticsDateRange({ fromDate, toDate });
}

function buildAnalyticsDateRange(input: AnalyticsDateRangeInput = {}): AnalyticsDateRange {
  const defaultRange = getCurrentPeriodKeys().dateKey;
  const safeFromDate = isDateKey(input.fromDate) ? input.fromDate.trim() : addDaysToDateKey(defaultRange, -DEFAULT_ANALYTICS_RANGE_DAYS);
  const safeToDate = isDateKey(input.toDate) ? input.toDate.trim() : defaultRange;
  const fromDateAtNoonUtc = toDateFromDateKeyAtNoonUtc(safeFromDate);
  const toDateAtNoonUtc = toDateFromDateKeyAtNoonUtc(safeToDate);

  if (!fromDateAtNoonUtc || !toDateAtNoonUtc) {
    throw new Error("Rango de fechas invalido. Usa formato YYYY-MM-DD.");
  }

  const dayDiff = getDateKeyDiffInDays(safeFromDate, safeToDate);
  if (!Number.isFinite(dayDiff) || dayDiff < 0) {
    throw new Error("La fecha Desde no puede ser mayor que la fecha Hasta.");
  }

  const dayCount = dayDiff + 1;
  if (dayCount > MAX_ANALYTICS_RANGE_DAYS) {
    throw new Error(`El rango maximo permitido es de ${MAX_ANALYTICS_RANGE_DAYS} dias.`);
  }

  const fromTimestampStart = toBusinessDayStart(safeFromDate);
  const toTimestampEnd = toBusinessDayEnd(safeToDate);
  if (!fromTimestampStart || !toTimestampEnd) {
    throw new Error("No se pudieron interpretar los limites del rango de fechas.");
  }

  const fromPeriodKeys = getPeriodKeys(fromDateAtNoonUtc);
  const toPeriodKeys = getPeriodKeys(toDateAtNoonUtc);
  const previousToDate = addDaysToDateKey(safeFromDate, -1);
  const previousFromDate = addDaysToDateKey(previousToDate, -(dayCount - 1));

  return {
    fromDate: safeFromDate,
    toDate: safeToDate,
    previousFromDate,
    previousToDate,
    fromDateAtNoonUtc,
    toDateAtNoonUtc,
    fromTimestampStart,
    toTimestampEnd,
    fromWeekKey: fromPeriodKeys.weekKey,
    toWeekKey: toPeriodKeys.weekKey,
    fromMonthKey: fromPeriodKeys.monthKey,
    toMonthKey: toPeriodKeys.monthKey,
    dayCount,
  };
}

function toIsoString(value: unknown): string | null {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function getDiffSeconds(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const diff = Math.floor((end.getTime() - start.getTime()) / 1000);
  return diff < 0 ? 0 : diff;
}

function getDurationBucket(seconds: number): keyof typeof EMPTY_DISTRIBUTION {
  if (seconds < 3600) return "under_1h";
  if (seconds < 86400) return "from_1h_to_under_24h";
  if (seconds < 604800) return "from_1d_to_under_7d";
  if (seconds < 2592000) return "from_7d_to_under_30d";
  return "from_30d_or_more";
}

function buildDurationSummary(values: number[], totalPopulation: number): DurationSummary {
  const distribution = { ...EMPTY_DISTRIBUTION };
  const clean = values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .map((value) => Math.floor(value))
    .sort((left, right) => left - right);

  clean.forEach((value) => {
    const bucket = getDurationBucket(value);
    distribution[bucket] += 1;
  });

  const reachedUsers = clean.length;
  const notReachedUsers = Math.max(totalPopulation - reachedUsers, 0);
  distribution.notReached = notReachedUsers;

  if (!clean.length) {
    return {
      avgSeconds: null,
      p50Seconds: null,
      distribution,
      reachedUsers,
      notReachedUsers,
    };
  }

  const totalSeconds = clean.reduce((accumulator, current) => accumulator + current, 0);
  const middleIndex = Math.floor(clean.length / 2);
  const p50Seconds =
    clean.length % 2 === 0
      ? Math.round((clean[middleIndex - 1] + clean[middleIndex]) / 2)
      : clean[middleIndex];

  return {
    avgSeconds: Math.round(totalSeconds / clean.length),
    p50Seconds,
    distribution,
    reachedUsers,
    notReachedUsers,
  };
}

function parseMonthKey(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(normalizeText(value));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

function getMonthDiff(startMonthKey: string, endMonthKey: string): number | null {
  const start = parseMonthKey(startMonthKey);
  const end = parseMonthKey(endMonthKey);
  if (!start || !end) return null;
  return (end.year - start.year) * 12 + (end.month - start.month);
}

function addMonthsToMonthKey(monthKey: string, offset: number): string {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  const baseMonthIndex = parsed.month - 1 + offset;
  const year = parsed.year + Math.floor(baseMonthIndex / 12);
  const month = ((baseMonthIndex % 12) + 12) % 12;
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}`;
}

function getAggregateCollectionName(periodType: PeriodType): string {
  if (periodType === "day") return ANALYTICS_DAILY_COLLECTION;
  if (periodType === "week") return ANALYTICS_WEEKLY_COLLECTION;
  return ANALYTICS_MONTHLY_COLLECTION;
}

function getRegistrationField(periodType: PeriodType): string {
  if (periodType === "day") return "registrationDateKey";
  if (periodType === "week") return "registrationWeekKey";
  return "registrationMonthKey";
}

function getPublishedField(periodType: PeriodType): string {
  if (periodType === "day") return "firstPublishedDateKey";
  if (periodType === "week") return "firstPublishedWeekKey";
  return "firstPublishedMonthKey";
}

function getUserFirstPublishedField(periodType: PeriodType): string {
  if (periodType === "day") return "firstInvitationPublishedDateKey";
  if (periodType === "week") return "firstInvitationPublishedWeekKey";
  return "firstInvitationPublishedMonthKey";
}

function getUserFirstApprovedPaymentField(periodType: PeriodType): string {
  if (periodType === "day") return "firstApprovedPaymentDateKey";
  if (periodType === "week") return "firstApprovedPaymentWeekKey";
  return "firstApprovedPaymentMonthKey";
}

function getEventBusinessField(periodType: PeriodType): string {
  if (periodType === "day") return "businessDateKey";
  if (periodType === "week") return "businessWeekKey";
  return "businessMonthKey";
}

function asCurrencyAmount(value: unknown): number {
  const amount = Math.round(asNumber(value, 0));
  return amount < 0 ? 0 : amount;
}

function getPaymentAmountFromEventData(eventData: JsonMap): number {
  const metadata = asObject(eventData.metadata);
  const hasExplicitAmountArs = Object.prototype.hasOwnProperty.call(metadata, "amountArs");
  if (hasExplicitAmountArs) {
    return asCurrencyAmount(metadata.amountArs);
  }

  const amountBaseArs = asCurrencyAmount(metadata.amountBaseArs);
  const discountAmountArs = asCurrencyAmount(metadata.discountAmountArs);
  return Math.max(0, amountBaseArs - discountAmountArs);
}

function getPaymentEventKey(eventData: JsonMap): string {
  const metadata = asObject(eventData.metadata);
  return normalizeText(metadata.paymentId) || normalizeText(eventData.eventId);
}

function hasExplicitNetAmount(eventData: JsonMap): boolean {
  return Object.prototype.hasOwnProperty.call(asObject(eventData.metadata), "amountArs");
}

function dedupePaymentEvents(events: JsonMap[]): JsonMap[] {
  const unique = new Map<string, JsonMap>();

  events.forEach((eventData) => {
    const key = getPaymentEventKey(eventData);
    if (!key) return;

    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, eventData);
      return;
    }

    const existingAmount = getPaymentAmountFromEventData(existing);
    const nextAmount = getPaymentAmountFromEventData(eventData);
    const existingTimestamp = toDate(existing.timestamp)?.getTime() || 0;
    const nextTimestamp = toDate(eventData.timestamp)?.getTime() || 0;

    if (nextAmount > existingAmount) {
      unique.set(key, eventData);
      return;
    }

    if (!hasExplicitNetAmount(existing) && hasExplicitNetAmount(eventData)) {
      unique.set(key, eventData);
      return;
    }

    if (nextAmount === existingAmount && nextTimestamp < existingTimestamp) {
      unique.set(key, eventData);
    }
  });

  return Array.from(unique.values());
}

function buildAggregateDocDefaults(periodKey: string, periodType: PeriodType): JsonMap {
  return {
    periodKey,
    periodType,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildEmptySerializedAggregateDoc(periodKey: string, periodType: SeriesPeriodType): JsonMap {
  return {
    periodKey,
    periodType,
    updatedAt: null,
    executive: {
      activation: {
        registeredUsers: 0,
        createdActivatedUsers: 0,
        publishedActivatedUsers: 0,
        activationRateCreated: 0,
        activationRatePublished: 0,
      },
      ttfv: {
        create: {
          avgSeconds: null,
          p50Seconds: null,
          reachedUsers: 0,
          notReachedUsers: 0,
          distribution: {
            ...EMPTY_DISTRIBUTION,
          },
        },
        publish: {
          avgSeconds: null,
          p50Seconds: null,
          reachedUsers: 0,
          notReachedUsers: 0,
          distribution: {
            ...EMPTY_DISTRIBUTION,
          },
        },
      },
      users: {
        totalRegisteredUsers: 0,
        newUsers: 0,
        usersWhoPublished: 0,
        publishedInvitationsPerUser: 0,
      },
      payments: {
        payingUsers: 0,
        paymentsApproved: 0,
        revenue: 0,
        totalRevenue: 0,
        averageOrderValue: 0,
      },
      conversion: {
        paymentConversionRate: 0,
      },
      publishedInvitations: {
        count: 0,
        cumulativeCount: 0,
      },
    },
  };
}

function getRebuildJobRef() {
  return db.collection(ANALYTICS_JOBS_COLLECTION).doc(REBUILD_JOB_ID);
}

function getAnalyticsExportsCollection() {
  return db.collection(ANALYTICS_EXPORTS_COLLECTION);
}

function createRawExportLeaseUntil(now: Date): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromDate(new Date(now.getTime() + RAW_EXPORT_JOB_LEASE_MS));
}

function createLeaseUntil(now: Date): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromDate(new Date(now.getTime() + REBUILD_JOB_LEASE_MS));
}

async function updateRebuildJob(data: JsonMap): Promise<void> {
  await getRebuildJobRef().set(
    {
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function queueAnalyticsEvent(
  input: QueueAnalyticsEventInput,
  options: QueueAnalyticsEventOptions = {}
): Promise<{ eventId: string; created: boolean }> {
  const eventName = TRACKED_EVENT_NAMES.has(input.eventName) ? input.eventName : null;
  const userId = normalizeText(input.userId);
  if (!eventName || !userId) {
    return { eventId: normalizeText(input.eventId), created: false };
  }

  const eventTimestamp = input.timestamp instanceof Date ? input.timestamp : new Date();
  const periodKeys = getPeriodKeys(eventTimestamp);
  const eventId = normalizeText(input.eventId);
  const eventRef = db.collection(ANALYTICS_EVENTS_COLLECTION).doc(eventId);
  const existingSnap = await eventRef.get();

  if (!existingSnap.exists) {
    const payload: BusinessAnalyticsEvent = {
      eventId,
      schemaVersion: 1,
      eventName,
      timestamp: admin.firestore.Timestamp.fromDate(eventTimestamp),
      businessDateKey: periodKeys.dateKey,
      businessWeekKey: periodKeys.weekKey,
      businessMonthKey: periodKeys.monthKey,
      userId,
      invitacionId: normalizeText(input.invitacionId) || null,
      templateId: normalizeText(input.templateId) || null,
      metadata: sanitizeMetadata(input.metadata),
      processingState: "pending",
      processingAttempts: 0,
      processedAt: null,
      lastProcessingError: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await eventRef.set(payload);
  }

  if (options.processImmediately !== false) {
    try {
      await processAnalyticsEventById(eventId);
    } catch (error) {
      logger.error("No se pudo procesar evento de analytics", {
        eventId,
        eventName,
        error: error instanceof Error ? error.message : String(error || ""),
      });
    }
  }

  return { eventId, created: !existingSnap.exists };
}

async function markAnalyticsEventProcessed(eventId: string): Promise<void> {
  await db.collection(ANALYTICS_EVENTS_COLLECTION).doc(eventId).set(
    {
      processingState: "processed",
      processingAttempts: admin.firestore.FieldValue.increment(1),
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastProcessingError: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function markAnalyticsEventFailed(eventId: string, error: unknown): Promise<void> {
  const errorMessage =
    error instanceof Error ? error.message : String(error || "analytics-processing-error");

  await db.collection(ANALYTICS_EVENTS_COLLECTION).doc(eventId).set(
    {
      processingState: "failed",
      processingAttempts: admin.firestore.FieldValue.increment(1),
      lastProcessingError: errorMessage,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function upsertRegistrationUserDimensions(
  periodType: PeriodType,
  periodKey: string,
  users: JsonMap[]
): Promise<void> {
  const periodRef = db.collection(getAggregateCollectionName(periodType)).doc(periodKey);
  const batch = db.batch();

  users.forEach((userData) => {
    const userId = normalizeText(userData.userId);
    if (!userId) return;

    batch.set(
      periodRef.collection("users").doc(userId),
      {
        userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        registrationMetrics: {
          registeredAt: userData.registeredAt || null,
          activationCreatedReached: userData.activationCreatedReached === true,
          activationPublishedReached: userData.activationPublishedReached === true,
          publishedInvitationsCount: asNumber(userData.publishedInvitationsCount),
          approvedPaymentsCount: asNumber(userData.approvedPaymentsCount),
          revenueTotalArs: asCurrencyAmount(userData.revenueTotalArs),
          isPayingUser: userData.isPayingUser === true,
          timeToFirstCreateSeconds:
            Number.isFinite(userData.timeToFirstCreateSeconds) ? userData.timeToFirstCreateSeconds : null,
          timeToFirstPublishSeconds:
            Number.isFinite(userData.timeToFirstPublishSeconds) ? userData.timeToFirstPublishSeconds : null,
        },
      },
      { merge: true }
    );
  });

  await batch.commit();
}

async function upsertPublishedDimensions(
  periodType: PeriodType,
  periodKey: string,
  invitations: JsonMap[]
): Promise<void> {
  const periodRef = db.collection(getAggregateCollectionName(periodType)).doc(periodKey);
  const batch = db.batch();
  const userTotals = new Map<string, number>();
  const templateTotals = new Map<string, {
    count: number;
    paymentsApproved: number;
    revenueTotalArs: number;
    templateName: string | null;
  }>();

  invitations.forEach((invitationData) => {
    const userId = normalizeText(invitationData.ownerUserId);
    if (userId) {
      userTotals.set(userId, (userTotals.get(userId) || 0) + 1);
    }

    const templateId = normalizeText(invitationData.templateId) || UNKNOWN_TEMPLATE_ANALYTICS_ID;
    const templateName = normalizeText(invitationData.templateName) || null;
    const current = templateTotals.get(templateId) || {
      count: 0,
      paymentsApproved: 0,
      revenueTotalArs: 0,
      templateName,
    };
    current.count += 1;
    current.paymentsApproved += asNumber(invitationData.approvedPaymentsCount);
    current.revenueTotalArs += asCurrencyAmount(invitationData.revenueTotalArs);
    if (!current.templateName && templateName) {
      current.templateName = templateName;
    }
    templateTotals.set(templateId, current);
  });

  userTotals.forEach((count, userId) => {
    batch.set(
      periodRef.collection("users").doc(userId),
      {
        userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        publicationMetrics: {
          publishedInvitationsCount: count,
        },
      },
      { merge: true }
    );
  });

  templateTotals.forEach((value, templateId) => {
    batch.set(
      periodRef.collection("templates").doc(templateId),
      {
        templateId,
        templateName: value.templateName,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        publishedInvitationsCount: value.count,
        paymentsApproved: value.paymentsApproved,
        revenueTotalArs: value.revenueTotalArs,
      },
      { merge: true }
    );
  });

  await batch.commit();
}

async function recomputeRegistrationAggregate(periodType: PeriodType, periodKey: string): Promise<void> {
  const fieldPath = getRegistrationField(periodType);
  const snapshot = await db
    .collection(ANALYTICS_USERS_COLLECTION)
    .where(fieldPath, "==", periodKey)
    .get();

  const users: JsonMap[] = snapshot.docs.map((docItem) => ({
    userId: docItem.id,
    ...asObject(docItem.data()),
  }));
  const totalUsers = users.length;
  const activationCreatedUsers = users.filter((item) => item.activationCreatedReached === true).length;
  const activationPublishedUsers = users.filter((item) => item.activationPublishedReached === true).length;
  const ttfvCreateValues = users
    .map((item) => asNumber(item.timeToFirstCreateSeconds, Number.NaN))
    .filter((value) => Number.isFinite(value));
  const ttfvPublishValues = users
    .map((item) => asNumber(item.timeToFirstPublishSeconds, Number.NaN))
    .filter((value) => Number.isFinite(value));
  const createSummary = buildDurationSummary(ttfvCreateValues, totalUsers);
  const publishSummary = buildDurationSummary(ttfvPublishValues, totalUsers);
  const aggregateRef = db.collection(getAggregateCollectionName(periodType)).doc(periodKey);
  const existingData = asObject((await aggregateRef.get()).data());
  const executiveData = asObject(existingData.executive);

  await aggregateRef.set(
    {
      ...buildAggregateDocDefaults(periodKey, periodType),
      executive: {
        ...executiveData,
        activation: {
          registeredUsers: totalUsers,
          createdActivatedUsers: activationCreatedUsers,
          publishedActivatedUsers: activationPublishedUsers,
          activationRateCreated:
            totalUsers > 0 ? activationCreatedUsers / totalUsers : 0,
          activationRatePublished:
            totalUsers > 0 ? activationPublishedUsers / totalUsers : 0,
        },
        ttfv: {
          create: createSummary,
          publish: publishSummary,
        },
      },
    },
    { merge: true }
  );

  await upsertRegistrationUserDimensions(periodType, periodKey, users);
}

async function recomputePublishedAggregate(periodType: PeriodType, periodKey: string): Promise<void> {
  const fieldPath = getPublishedField(periodType);
  const [snapshot, cumulativeSnapshot] = await Promise.all([
    db
      .collection(ANALYTICS_INVITATIONS_COLLECTION)
      .where(fieldPath, "==", periodKey)
      .get(),
    db
      .collection(ANALYTICS_INVITATIONS_COLLECTION)
      .where(fieldPath, "<=", periodKey)
      .get(),
  ]);

  const invitations: JsonMap[] = snapshot.docs.map((docItem) => ({
    invitacionId: docItem.id,
    ...asObject(docItem.data()),
  }));
  const aggregateRef = db.collection(getAggregateCollectionName(periodType)).doc(periodKey);
  const existingData = asObject((await aggregateRef.get()).data());
  const executiveData = asObject(existingData.executive);

  await aggregateRef.set(
    {
      ...buildAggregateDocDefaults(periodKey, periodType),
      executive: {
        ...executiveData,
        publishedInvitations: {
          count: invitations.length,
          cumulativeCount: cumulativeSnapshot.size,
        },
      },
    },
    { merge: true }
  );

  await upsertPublishedDimensions(periodType, periodKey, invitations);
}

async function recomputeExecutivePeriodAggregate(periodType: PeriodType, periodKey: string): Promise<void> {
  const registrationField = getRegistrationField(periodType);
  const userPublishedField = getUserFirstPublishedField(periodType);
  const userFirstPaymentField = getUserFirstApprovedPaymentField(periodType);
  const invitationPublishedField = getPublishedField(periodType);
  const eventBusinessField = getEventBusinessField(periodType);

  const [
    newUsersSnap,
    totalUsersSnap,
    usersWhoPublishedSnap,
    payingUsersSnap,
    publishedPeriodSnap,
    publishedCumulativeSnap,
    paymentPeriodSnap,
    paymentCumulativeSnap,
  ] = await Promise.all([
    db
      .collection(ANALYTICS_USERS_COLLECTION)
      .where(registrationField, "==", periodKey)
      .get(),
    db
      .collection(ANALYTICS_USERS_COLLECTION)
      .where(registrationField, "<=", periodKey)
      .get(),
    db
      .collection(ANALYTICS_USERS_COLLECTION)
      .where(userPublishedField, "<=", periodKey)
      .get(),
    db
      .collection(ANALYTICS_USERS_COLLECTION)
      .where(userFirstPaymentField, "<=", periodKey)
      .get(),
    db
      .collection(ANALYTICS_INVITATIONS_COLLECTION)
      .where(invitationPublishedField, "==", periodKey)
      .get(),
    db
      .collection(ANALYTICS_INVITATIONS_COLLECTION)
      .where(invitationPublishedField, "<=", periodKey)
      .get(),
    db
      .collection(ANALYTICS_EVENTS_COLLECTION)
      .where(eventBusinessField, "==", periodKey)
      .get(),
    db
      .collection(ANALYTICS_EVENTS_COLLECTION)
      .where(eventBusinessField, "<=", periodKey)
      .get(),
  ]);

  const paymentsInPeriod = dedupePaymentEvents(
    paymentPeriodSnap.docs
    .map((docItem) => asObject(docItem.data()))
    .filter((item) => normalizeText(item.eventName) === "pago_aprobado")
  );
  const paymentsCumulative = dedupePaymentEvents(
    paymentCumulativeSnap.docs
    .map((docItem) => asObject(docItem.data()))
    .filter((item) => normalizeText(item.eventName) === "pago_aprobado")
  );

  const totalRegisteredUsers = totalUsersSnap.size;
  const newUsers = newUsersSnap.size;
  const usersWhoPublished = usersWhoPublishedSnap.size;
  const payingUsers = payingUsersSnap.size;
  const publishedInvitationsCount = publishedPeriodSnap.size;
  const publishedInvitationsCumulative = publishedCumulativeSnap.size;
  const paymentsApproved = paymentsInPeriod.length;
  const revenue = paymentsInPeriod.reduce(
    (accumulator, item) => accumulator + getPaymentAmountFromEventData(item),
    0
  );
  const totalRevenue = paymentsCumulative.reduce(
    (accumulator, item) => accumulator + getPaymentAmountFromEventData(item),
    0
  );
  const averageOrderValue = paymentsApproved > 0 ? Math.round(revenue / paymentsApproved) : 0;
  const publishedInvitationsPerUser =
    totalRegisteredUsers > 0 ? publishedInvitationsCumulative / totalRegisteredUsers : 0;
  const paymentConversionRate =
    usersWhoPublished > 0 ? payingUsers / usersWhoPublished : 0;

  const aggregateRef = db.collection(getAggregateCollectionName(periodType)).doc(periodKey);
  const existingData = asObject((await aggregateRef.get()).data());
  const executiveData = asObject(existingData.executive);
  const publishedInvitationsData = asObject(executiveData.publishedInvitations);

  await aggregateRef.set(
    {
      ...buildAggregateDocDefaults(periodKey, periodType),
      executive: {
        ...executiveData,
        users: {
          totalRegisteredUsers,
          newUsers,
          usersWhoPublished,
          publishedInvitationsPerUser,
        },
        payments: {
          payingUsers,
          paymentsApproved,
          revenue,
          totalRevenue,
          averageOrderValue,
        },
        conversion: {
          paymentConversionRate,
        },
        publishedInvitations: {
          ...publishedInvitationsData,
          count: publishedInvitationsCount,
          cumulativeCount: publishedInvitationsCumulative,
        },
      },
    },
    { merge: true }
  );
}

async function recomputeUserLifetimeCounters(userId: string): Promise<void> {
  const safeUserId = normalizeText(userId);
  if (!safeUserId) return;

  const [snapshot, paymentEventsSnap] = await Promise.all([
    db
      .collection(ANALYTICS_INVITATIONS_COLLECTION)
      .where("ownerUserId", "==", safeUserId)
      .get(),
    db
      .collection(ANALYTICS_EVENTS_COLLECTION)
      .where("userId", "==", safeUserId)
      .get(),
  ]);

  let publishedInvitationsCount = 0;
  snapshot.docs.forEach((docItem) => {
    const invitationData = asObject(docItem.data());
    if (toDate(invitationData.firstPublishedAt)) {
      publishedInvitationsCount += 1;
    }
  });

  const paymentEvents = dedupePaymentEvents(
    paymentEventsSnap.docs
      .map((docItem) => asObject(docItem.data()))
      .filter((item) => normalizeText(item.eventName) === "pago_aprobado")
  );
  const approvedPaymentsCount = paymentEvents.length;
  const revenueTotalArs = paymentEvents.reduce(
    (accumulator, item) => accumulator + getPaymentAmountFromEventData(item),
    0
  );
  const firstApprovedPaymentEvent = paymentEvents
    .slice()
    .sort((left, right) => {
      const leftTime = toDate(left.timestamp)?.getTime() || 0;
      const rightTime = toDate(right.timestamp)?.getTime() || 0;
      return leftTime - rightTime;
    })[0];
  const firstApprovedPaymentAt = toDate(firstApprovedPaymentEvent?.timestamp);
  const firstApprovedPaymentKeys = firstApprovedPaymentAt
    ? getPeriodKeys(firstApprovedPaymentAt)
    : null;

  await db.collection(ANALYTICS_USERS_COLLECTION).doc(safeUserId).set(
    {
      userId: safeUserId,
      createdInvitationsCount: snapshot.size,
      publishedInvitationsCount,
      approvedPaymentsCount,
      revenueTotalArs,
      isPayingUser: approvedPaymentsCount > 0,
      firstApprovedPaymentAt: firstApprovedPaymentAt
        ? admin.firestore.Timestamp.fromDate(firstApprovedPaymentAt)
        : null,
      firstApprovedPaymentDateKey: firstApprovedPaymentKeys?.dateKey || null,
      firstApprovedPaymentWeekKey: firstApprovedPaymentKeys?.weekKey || null,
      firstApprovedPaymentMonthKey: firstApprovedPaymentKeys?.monthKey || null,
      firstApprovedPaymentId: firstApprovedPaymentEvent
        ? getPaymentEventKey(firstApprovedPaymentEvent)
        : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function recomputeInvitationPaymentCounters(invitacionId: string): Promise<void> {
  const safeInvitationId = normalizeText(invitacionId);
  if (!safeInvitationId) return;

  const snapshot = await db
    .collection(ANALYTICS_EVENTS_COLLECTION)
    .where("invitacionId", "==", safeInvitationId)
    .get();

  const paymentEvents = dedupePaymentEvents(
    snapshot.docs
      .map((docItem) => asObject(docItem.data()))
      .filter((item) => normalizeText(item.eventName) === "pago_aprobado")
  ).sort((left, right) => {
    const leftTime = toDate(left.timestamp)?.getTime() || 0;
    const rightTime = toDate(right.timestamp)?.getTime() || 0;
    return leftTime - rightTime;
  });

  const firstApprovedPaymentAt = toDate(paymentEvents[0]?.timestamp);
  const lastApprovedPaymentAt = toDate(paymentEvents[paymentEvents.length - 1]?.timestamp);
  const revenueTotalArs = paymentEvents.reduce(
    (accumulator, item) => accumulator + getPaymentAmountFromEventData(item),
    0
  );

  await db.collection(ANALYTICS_INVITATIONS_COLLECTION).doc(safeInvitationId).set(
    {
      invitacionId: safeInvitationId,
      approvedPaymentsCount: paymentEvents.length,
      revenueTotalArs,
      firstApprovedPaymentAt: firstApprovedPaymentAt
        ? admin.firestore.Timestamp.fromDate(firstApprovedPaymentAt)
        : null,
      lastApprovedPaymentAt: lastApprovedPaymentAt
        ? admin.firestore.Timestamp.fromDate(lastApprovedPaymentAt)
        : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function recomputeTemplateAggregate(templateId: string): Promise<void> {
  const safeTemplateId = normalizeText(templateId) || UNKNOWN_TEMPLATE_ANALYTICS_ID;
  const snapshot = await db
    .collection(ANALYTICS_INVITATIONS_COLLECTION)
    .where("templateId", "==", safeTemplateId)
    .get();

  let publishedInvitations = 0;
  let paymentsApproved = 0;
  let revenueTotalArs = 0;
  let templateName = "";
  snapshot.docs.forEach((docItem) => {
    const data = asObject(docItem.data());
    if (!templateName) {
      templateName = normalizeText(data.templateName);
    }
    if (toDate(data.firstPublishedAt)) {
      publishedInvitations += 1;
    }
    paymentsApproved += asNumber(data.approvedPaymentsCount);
    revenueTotalArs += asCurrencyAmount(data.revenueTotalArs);
  });

  await db.collection(ANALYTICS_TEMPLATES_COLLECTION).doc(safeTemplateId).set(
    {
      templateId: safeTemplateId,
      templateName: templateName || null,
      createdInvitations: snapshot.size,
      publishedInvitations,
      paymentsApproved,
      revenueTotalArs,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function upsertInvitationOwnerRegistration(userId: string, cohortMonth: string): Promise<void> {
  const safeUserId = normalizeText(userId);
  if (!safeUserId || !normalizeText(cohortMonth)) return;

  const snapshot = await db
    .collection(ANALYTICS_INVITATIONS_COLLECTION)
    .where("ownerUserId", "==", safeUserId)
    .get();

  if (snapshot.empty) return;

  let batch = db.batch();
  let operations = 0;

  for (const docItem of snapshot.docs) {
    batch.set(
      docItem.ref,
      {
        ownerRegistrationCohortMonth: cohortMonth,
      },
      { merge: true }
    );
    operations += 1;

    if (operations >= 400) {
      await batch.commit();
      batch = db.batch();
      operations = 0;
    }
  }

  if (operations > 0) {
    await batch.commit();
  }
}

async function recomputeCohortAggregate(cohortMonth: string): Promise<void> {
  const safeCohortMonth = normalizeText(cohortMonth);
  if (!safeCohortMonth) return;

  const [usersSnap, invitationsSnap, paymentEventsSnap] = await Promise.all([
    db
      .collection(ANALYTICS_USERS_COLLECTION)
      .where("registrationCohortMonth", "==", safeCohortMonth)
      .get(),
    db
      .collection(ANALYTICS_INVITATIONS_COLLECTION)
      .where("ownerRegistrationCohortMonth", "==", safeCohortMonth)
      .get(),
    db
      .collection(ANALYTICS_EVENTS_COLLECTION)
      .where("businessMonthKey", ">=", safeCohortMonth)
      .get(),
  ]);

  const users: JsonMap[] = usersSnap.docs.map((docItem) => ({
    userId: docItem.id,
    ...asObject(docItem.data()),
  }));
  const invitations: JsonMap[] = invitationsSnap.docs.map((docItem) => ({
    invitacionId: docItem.id,
    ...asObject(docItem.data()),
  }));
  const userIds = new Set(users.map((item) => normalizeText(item.userId)).filter(Boolean));
  const paymentEvents = dedupePaymentEvents(
    paymentEventsSnap.docs
      .map((docItem) => asObject(docItem.data()))
      .filter(
        (item) =>
          normalizeText(item.eventName) === "pago_aprobado" &&
          userIds.has(normalizeText(item.userId))
      )
  );

  const usersCount = users.length;
  const activationCreatedUsers = users.filter((item) => item.activationCreatedReached === true).length;
  const activationPublishedUsers = users.filter((item) => item.activationPublishedReached === true).length;
  const usersWhoPublished = users.filter((item) => toDate(item.firstInvitationPublishedAt)).length;
  const payingUsers = users.filter((item) => toDate(item.firstApprovedPaymentAt)).length;
  const paymentsApproved = users.reduce(
    (accumulator, item) => accumulator + asNumber(item.approvedPaymentsCount),
    0
  );
  const revenueTotalArs = users.reduce(
    (accumulator, item) => accumulator + asCurrencyAmount(item.revenueTotalArs),
    0
  );
  const createValues = users
    .map((item) => asNumber(item.timeToFirstCreateSeconds, Number.NaN))
    .filter((value) => Number.isFinite(value));
  const publishValues = users
    .map((item) => asNumber(item.timeToFirstPublishSeconds, Number.NaN))
    .filter((value) => Number.isFinite(value));
  const createSummary = buildDurationSummary(createValues, usersCount);
  const publishSummary = buildDurationSummary(publishValues, usersCount);
  const publishedInvitations = invitations.filter((item) => toDate(item.firstPublishedAt)).length;
  const publishedInvitationsPerUser = usersCount > 0 ? publishedInvitations / usersCount : 0;
  const paymentConversionRate = usersWhoPublished > 0 ? payingUsers / usersWhoPublished : 0;
  const cohortRef = db.collection(ANALYTICS_COHORTS_COLLECTION).doc(safeCohortMonth);

  await cohortRef.set(
    {
      cohortMonth: safeCohortMonth,
      users: usersCount,
      activationCreatedUsers,
      activationPublishedUsers,
      usersWhoPublished,
      payingUsers,
      paymentsApproved,
      revenueTotalArs,
      publishedInvitationsPerUser,
      paymentConversionRate,
      activationCreatedRate: usersCount > 0 ? activationCreatedUsers / usersCount : 0,
      activationPublishedRate: usersCount > 0 ? activationPublishedUsers / usersCount : 0,
      ttfvCreateAvgSeconds: createSummary.avgSeconds,
      ttfvCreateP50Seconds: createSummary.p50Seconds,
      ttfvCreateDistribution: createSummary.distribution,
      ttfvPublishAvgSeconds: publishSummary.avgSeconds,
      ttfvPublishP50Seconds: publishSummary.p50Seconds,
      ttfvPublishDistribution: publishSummary.distribution,
      invitacionesPublicadas: publishedInvitations,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  type CohortPeriodAccumulator = {
    newActivatedCreatedUsers: number;
    newActivatedPublishedUsers: number;
    newPublishedUsers: number;
    newPayingUsers: number;
    invitacionesPublicadas: number;
    paymentsApproved: number;
    revenueArs: number;
    createValues: number[];
    publishValues: number[];
  };

  const periodAccumulator = new Map<number, CohortPeriodAccumulator>();
  const ensurePeriod = (periodIndex: number): CohortPeriodAccumulator => {
    const current =
      periodAccumulator.get(periodIndex) ||
      {
        newActivatedCreatedUsers: 0,
        newActivatedPublishedUsers: 0,
        newPublishedUsers: 0,
        newPayingUsers: 0,
        invitacionesPublicadas: 0,
        paymentsApproved: 0,
        revenueArs: 0,
        createValues: [],
        publishValues: [],
      };
    periodAccumulator.set(periodIndex, current);
    return current;
  };

  let maxPeriodIndex = 0;

  users.forEach((item) => {
    const firstCreateDate = toDate(item.firstInvitationCreatedAt);
    const firstPublishDate = toDate(item.firstInvitationPublishedAt);
    const firstApprovedPaymentDate = toDate(item.firstApprovedPaymentAt);
    const firstCreateMonthKey = firstCreateDate ? getPeriodKeys(firstCreateDate).monthKey : "";
    const firstPublishMonthKey = firstPublishDate ? getPeriodKeys(firstPublishDate).monthKey : "";
    const firstApprovedPaymentMonthKey = firstApprovedPaymentDate
      ? getPeriodKeys(firstApprovedPaymentDate).monthKey
      : "";
    const createDiff = firstCreateMonthKey ? getMonthDiff(safeCohortMonth, firstCreateMonthKey) : null;
    const publishDiff = firstPublishMonthKey ? getMonthDiff(safeCohortMonth, firstPublishMonthKey) : null;
    const paymentDiff = firstApprovedPaymentMonthKey
      ? getMonthDiff(safeCohortMonth, firstApprovedPaymentMonthKey)
      : null;

    if (createDiff !== null && createDiff >= 0) {
      const bucket = ensurePeriod(createDiff);
      bucket.newActivatedCreatedUsers += 1;
      const duration = asNumber(item.timeToFirstCreateSeconds, Number.NaN);
      if (Number.isFinite(duration)) {
        bucket.createValues.push(duration);
      }
      maxPeriodIndex = Math.max(maxPeriodIndex, createDiff);
    }

    if (publishDiff !== null && publishDiff >= 0) {
      const bucket = ensurePeriod(publishDiff);
      bucket.newActivatedPublishedUsers += 1;
      bucket.newPublishedUsers += 1;
      const duration = asNumber(item.timeToFirstPublishSeconds, Number.NaN);
      if (Number.isFinite(duration)) {
        bucket.publishValues.push(duration);
      }
      maxPeriodIndex = Math.max(maxPeriodIndex, publishDiff);
    }

    if (paymentDiff !== null && paymentDiff >= 0) {
      const bucket = ensurePeriod(paymentDiff);
      bucket.newPayingUsers += 1;
      maxPeriodIndex = Math.max(maxPeriodIndex, paymentDiff);
    }
  });

  invitations.forEach((item) => {
    const publishedMonthKey = normalizeText(item.firstPublishedMonthKey);
    const diff = publishedMonthKey ? getMonthDiff(safeCohortMonth, publishedMonthKey) : null;
    if (diff === null || diff < 0) return;
    const bucket = ensurePeriod(diff);
    bucket.invitacionesPublicadas += 1;
    maxPeriodIndex = Math.max(maxPeriodIndex, diff);
  });

  paymentEvents.forEach((item) => {
    const paymentMonthKey = normalizeText(item.businessMonthKey);
    const diff = paymentMonthKey ? getMonthDiff(safeCohortMonth, paymentMonthKey) : null;
    if (diff === null || diff < 0) return;
    const bucket = ensurePeriod(diff);
    bucket.paymentsApproved += 1;
    bucket.revenueArs += getPaymentAmountFromEventData(item);
    maxPeriodIndex = Math.max(maxPeriodIndex, diff);
  });

  let cumulativeCreated = 0;
  let cumulativePublished = 0;
  let cumulativePaying = 0;
  let batch = db.batch();
  let operations = 0;

  for (let periodIndex = 0; periodIndex <= maxPeriodIndex; periodIndex += 1) {
    const current = ensurePeriod(periodIndex);
    cumulativeCreated += current.newActivatedCreatedUsers;
    cumulativePublished += current.newActivatedPublishedUsers;
    cumulativePaying += current.newPayingUsers;
    const createPeriodSummary = buildDurationSummary(current.createValues, current.newActivatedCreatedUsers);
    const publishPeriodSummary = buildDurationSummary(current.publishValues, current.newActivatedPublishedUsers);

    batch.set(
      cohortRef.collection("periods").doc(String(periodIndex).padStart(4, "0")),
      {
        periodIndex,
        periodMonthKey: addMonthsToMonthKey(safeCohortMonth, periodIndex),
        newActivatedCreatedUsers: current.newActivatedCreatedUsers,
        newActivatedPublishedUsers: current.newActivatedPublishedUsers,
        newPublishedUsers: current.newPublishedUsers,
        newPayingUsers: current.newPayingUsers,
        cumulativeActivatedCreatedUsers: cumulativeCreated,
        cumulativeActivatedPublishedUsers: cumulativePublished,
        cumulativePublishedUsers: cumulativePublished,
        cumulativePayingUsers: cumulativePaying,
        cumulativeActivationCreatedRate: usersCount > 0 ? cumulativeCreated / usersCount : 0,
        cumulativeActivationPublishedRate: usersCount > 0 ? cumulativePublished / usersCount : 0,
        paymentConversionRate: cumulativePublished > 0 ? cumulativePaying / cumulativePublished : 0,
        invitacionesPublicadas: current.invitacionesPublicadas,
        paymentsApproved: current.paymentsApproved,
        revenueArs: current.revenueArs,
        ttfvCreateAvgSeconds: createPeriodSummary.avgSeconds,
        ttfvCreateP50Seconds: createPeriodSummary.p50Seconds,
        ttfvPublishAvgSeconds: publishPeriodSummary.avgSeconds,
        ttfvPublishP50Seconds: publishPeriodSummary.p50Seconds,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    operations += 1;

    if (operations >= 400) {
      await batch.commit();
      batch = db.batch();
      operations = 0;
    }
  }

  if (operations > 0) {
    await batch.commit();
  }
}

async function processRegistrationEvent(eventData: JsonMap): Promise<void> {
  const userId = normalizeText(eventData.userId);
  const registeredAt = toDate(eventData.timestamp);
  if (!userId || !registeredAt) return;

  const periodKeys = getPeriodKeys(registeredAt);
  const userRef = db.collection(ANALYTICS_USERS_COLLECTION).doc(userId);

  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    const existingData = asObject(userSnap.data());
    const firstInvitationCreatedAt = toDate(existingData.firstInvitationCreatedAt);
    const firstInvitationPublishedAt = toDate(existingData.firstInvitationPublishedAt);
    const firstInvitationPublishedKeys = firstInvitationPublishedAt
      ? getPeriodKeys(firstInvitationPublishedAt)
      : null;
    const firstApprovedPaymentAt = toDate(existingData.firstApprovedPaymentAt);
    const firstApprovedPaymentKeys = firstApprovedPaymentAt
      ? getPeriodKeys(firstApprovedPaymentAt)
      : null;

    transaction.set(
      userRef,
      {
        userId,
        registeredAt: admin.firestore.Timestamp.fromDate(registeredAt),
        registrationDateKey: periodKeys.dateKey,
        registrationWeekKey: periodKeys.weekKey,
        registrationMonthKey: periodKeys.monthKey,
        registrationCohortMonth: periodKeys.cohortMonth,
        approvedPaymentsCount: asNumber(existingData.approvedPaymentsCount),
        revenueTotalArs: asCurrencyAmount(existingData.revenueTotalArs),
        isPayingUser:
          existingData.isPayingUser === true ||
          Boolean(firstApprovedPaymentAt),
        activationCreatedReached: Boolean(firstInvitationCreatedAt),
        activationPublishedReached: Boolean(firstInvitationPublishedAt),
        firstInvitationPublishedDateKey:
          firstInvitationPublishedKeys?.dateKey || existingData.firstInvitationPublishedDateKey || null,
        firstInvitationPublishedWeekKey:
          firstInvitationPublishedKeys?.weekKey || existingData.firstInvitationPublishedWeekKey || null,
        firstInvitationPublishedMonthKey:
          firstInvitationPublishedKeys?.monthKey || existingData.firstInvitationPublishedMonthKey || null,
        firstApprovedPaymentDateKey:
          firstApprovedPaymentKeys?.dateKey || existingData.firstApprovedPaymentDateKey || null,
        firstApprovedPaymentWeekKey:
          firstApprovedPaymentKeys?.weekKey || existingData.firstApprovedPaymentWeekKey || null,
        firstApprovedPaymentMonthKey:
          firstApprovedPaymentKeys?.monthKey || existingData.firstApprovedPaymentMonthKey || null,
        timeToFirstCreateSeconds: getDiffSeconds(registeredAt, firstInvitationCreatedAt),
        timeToFirstPublishSeconds: getDiffSeconds(registeredAt, firstInvitationPublishedAt),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  await upsertInvitationOwnerRegistration(userId, periodKeys.cohortMonth);
  await Promise.all([
    recomputeRegistrationAggregate("day", periodKeys.dateKey),
    recomputeRegistrationAggregate("week", periodKeys.weekKey),
    recomputeRegistrationAggregate("month", periodKeys.monthKey),
    recomputeExecutivePeriodAggregate("day", periodKeys.dateKey),
    recomputeExecutivePeriodAggregate("week", periodKeys.weekKey),
    recomputeExecutivePeriodAggregate("month", periodKeys.monthKey),
    recomputeCohortAggregate(periodKeys.cohortMonth),
  ]);
}

async function processInvitationCreatedEvent(eventData: JsonMap): Promise<void> {
  const userId = normalizeText(eventData.userId);
  const invitacionId = normalizeText(eventData.invitacionId);
  const templateId = normalizeText(eventData.templateId) || UNKNOWN_TEMPLATE_ANALYTICS_ID;
  const createdAt = toDate(eventData.timestamp);
  if (!userId || !invitacionId || !createdAt) return;

  const eventMetadata = sanitizeMetadata(eventData.metadata);
  const templateName = normalizeText(eventMetadata.templateName);
  const invitationRef = db.collection(ANALYTICS_INVITATIONS_COLLECTION).doc(invitacionId);
  const userRef = db.collection(ANALYTICS_USERS_COLLECTION).doc(userId);
  let cohortMonth = "";
  let previousTemplateId = "";

  await db.runTransaction(async (transaction) => {
    const [userSnap, invitationSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(invitationRef),
    ]);
    const userData = asObject(userSnap.data());
    const invitationData = asObject(invitationSnap.data());
    const registeredAt = toDate(userData.registeredAt);
    const firstInvitationCreatedAt = toDate(userData.firstInvitationCreatedAt);
    const safeTemplateId =
      templateId || normalizeText(invitationData.templateId) || UNKNOWN_TEMPLATE_ANALYTICS_ID;

    cohortMonth = normalizeText(userData.registrationCohortMonth);
    previousTemplateId = normalizeText(invitationData.templateId);

    transaction.set(
      invitationRef,
      {
        invitacionId,
        ownerUserId: userId,
        templateId: safeTemplateId,
        templateName: templateName || invitationData.templateName || null,
        createdAt: admin.firestore.Timestamp.fromDate(createdAt),
        isPublished: invitationData.isPublished === true,
        approvedPaymentsCount: asNumber(invitationData.approvedPaymentsCount),
        revenueTotalArs: asCurrencyAmount(invitationData.revenueTotalArs),
        firstApprovedPaymentAt: invitationData.firstApprovedPaymentAt || null,
        lastApprovedPaymentAt: invitationData.lastApprovedPaymentAt || null,
        ownerRegistrationCohortMonth: cohortMonth || invitationData.ownerRegistrationCohortMonth || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (!firstInvitationCreatedAt || createdAt.getTime() < firstInvitationCreatedAt.getTime()) {
      transaction.set(
        userRef,
        {
          userId,
          firstInvitationCreatedAt: admin.firestore.Timestamp.fromDate(createdAt),
          firstInvitationCreatedId: invitacionId,
          firstInvitationCreatedTemplateId: safeTemplateId,
          activationCreatedReached: true,
          timeToFirstCreateSeconds: getDiffSeconds(registeredAt, createdAt),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });

  await Promise.all([
    recomputeUserLifetimeCounters(userId),
    recomputeTemplateAggregate(templateId),
    previousTemplateId && previousTemplateId !== templateId
      ? recomputeTemplateAggregate(previousTemplateId)
      : Promise.resolve(),
  ]);

  const userSnap = await userRef.get();
  const userData = asObject(userSnap.data());
  const registrationDateKey = normalizeText(userData.registrationDateKey);
  const registrationWeekKey = normalizeText(userData.registrationWeekKey);
  const registrationMonthKey = normalizeText(userData.registrationMonthKey);
  const registrationCohortMonth = normalizeText(userData.registrationCohortMonth || cohortMonth);

  await Promise.all([
    registrationDateKey ? recomputeRegistrationAggregate("day", registrationDateKey) : Promise.resolve(),
    registrationWeekKey ? recomputeRegistrationAggregate("week", registrationWeekKey) : Promise.resolve(),
    registrationMonthKey ? recomputeRegistrationAggregate("month", registrationMonthKey) : Promise.resolve(),
    registrationCohortMonth ? recomputeCohortAggregate(registrationCohortMonth) : Promise.resolve(),
  ]);
}

async function processInvitationPublishedEvent(eventData: JsonMap): Promise<void> {
  const userId = normalizeText(eventData.userId);
  const invitacionId = normalizeText(eventData.invitacionId);
  const templateId = normalizeText(eventData.templateId) || UNKNOWN_TEMPLATE_ANALYTICS_ID;
  if (!userId || !invitacionId) return;

  const eventMetadata = sanitizeMetadata(eventData.metadata);
  const effectivePublishedAt =
    toDate(eventMetadata.firstPublishedAt) ||
    toDate(eventData.timestamp);

  if (!effectivePublishedAt) return;

  const publishedKeys = getPeriodKeys(effectivePublishedAt);
  const templateName = normalizeText(eventMetadata.templateName);
  const invitationRef = db.collection(ANALYTICS_INVITATIONS_COLLECTION).doc(invitacionId);
  const userRef = db.collection(ANALYTICS_USERS_COLLECTION).doc(userId);
  let previousPublishedDateKey = "";
  let previousPublishedWeekKey = "";
  let previousPublishedMonthKey = "";
  let previousTemplateId = "";
  let cohortMonth = "";

  await db.runTransaction(async (transaction) => {
    const [userSnap, invitationSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(invitationRef),
    ]);
    const userData = asObject(userSnap.data());
    const invitationData = asObject(invitationSnap.data());
    const registeredAt = toDate(userData.registeredAt);
    const firstInvitationPublishedAt = toDate(userData.firstInvitationPublishedAt);
    const existingInvitationFirstPublishedAt = toDate(invitationData.firstPublishedAt);
    const safeTemplateId =
      templateId || normalizeText(invitationData.templateId) || UNKNOWN_TEMPLATE_ANALYTICS_ID;

    previousPublishedDateKey = normalizeText(invitationData.firstPublishedDateKey);
    previousPublishedWeekKey = normalizeText(invitationData.firstPublishedWeekKey);
    previousPublishedMonthKey = normalizeText(invitationData.firstPublishedMonthKey);
    previousTemplateId = normalizeText(invitationData.templateId);
    cohortMonth = normalizeText(userData.registrationCohortMonth);

    if (
      !existingInvitationFirstPublishedAt ||
      effectivePublishedAt.getTime() < existingInvitationFirstPublishedAt.getTime()
    ) {
      transaction.set(
        invitationRef,
        {
          invitacionId,
          ownerUserId: userId,
          templateId: safeTemplateId,
          templateName: templateName || invitationData.templateName || null,
          publicSlug: normalizeText(eventMetadata.publicSlug) || invitationData.publicSlug || null,
          firstPublishedAt: admin.firestore.Timestamp.fromDate(effectivePublishedAt),
          firstPublishedDateKey: publishedKeys.dateKey,
          firstPublishedWeekKey: publishedKeys.weekKey,
          firstPublishedMonthKey: publishedKeys.monthKey,
          isPublished: true,
          ownerRegistrationCohortMonth: cohortMonth || invitationData.ownerRegistrationCohortMonth || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      transaction.set(
        invitationRef,
        {
          invitacionId,
          ownerUserId: userId,
          templateId: safeTemplateId,
          templateName: templateName || invitationData.templateName || null,
          publicSlug: normalizeText(eventMetadata.publicSlug) || invitationData.publicSlug || null,
          isPublished: true,
          ownerRegistrationCohortMonth: cohortMonth || invitationData.ownerRegistrationCohortMonth || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    if (
      !firstInvitationPublishedAt ||
      effectivePublishedAt.getTime() < firstInvitationPublishedAt.getTime()
    ) {
      transaction.set(
        userRef,
        {
          userId,
          firstInvitationPublishedAt: admin.firestore.Timestamp.fromDate(effectivePublishedAt),
          firstInvitationPublishedDateKey: publishedKeys.dateKey,
          firstInvitationPublishedWeekKey: publishedKeys.weekKey,
          firstInvitationPublishedMonthKey: publishedKeys.monthKey,
          firstInvitationPublishedId: invitacionId,
          firstInvitationPublishedTemplateId: safeTemplateId,
          activationPublishedReached: true,
          timeToFirstPublishSeconds: getDiffSeconds(registeredAt, effectivePublishedAt),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });

  await Promise.all([
    recomputeUserLifetimeCounters(userId),
    recomputeTemplateAggregate(templateId),
    previousTemplateId && previousTemplateId !== templateId
      ? recomputeTemplateAggregate(previousTemplateId)
      : Promise.resolve(),
  ]);

  const userSnap = await userRef.get();
  const userData = asObject(userSnap.data());
  const registrationDateKey = normalizeText(userData.registrationDateKey);
  const registrationWeekKey = normalizeText(userData.registrationWeekKey);
  const registrationMonthKey = normalizeText(userData.registrationMonthKey);
  const registrationCohortMonth = normalizeText(userData.registrationCohortMonth || cohortMonth);
  const recalculateTasks: Array<Promise<void>> = [
    registrationDateKey ? recomputeRegistrationAggregate("day", registrationDateKey) : Promise.resolve(),
    registrationWeekKey ? recomputeRegistrationAggregate("week", registrationWeekKey) : Promise.resolve(),
    registrationMonthKey ? recomputeRegistrationAggregate("month", registrationMonthKey) : Promise.resolve(),
    recomputePublishedAggregate("day", publishedKeys.dateKey),
    recomputePublishedAggregate("week", publishedKeys.weekKey),
    recomputePublishedAggregate("month", publishedKeys.monthKey),
    recomputeExecutivePeriodAggregate("day", publishedKeys.dateKey),
    recomputeExecutivePeriodAggregate("week", publishedKeys.weekKey),
    recomputeExecutivePeriodAggregate("month", publishedKeys.monthKey),
    registrationCohortMonth ? recomputeCohortAggregate(registrationCohortMonth) : Promise.resolve(),
  ];

  if (previousPublishedDateKey && previousPublishedDateKey !== publishedKeys.dateKey) {
    recalculateTasks.push(recomputePublishedAggregate("day", previousPublishedDateKey));
    recalculateTasks.push(recomputeExecutivePeriodAggregate("day", previousPublishedDateKey));
  }
  if (previousPublishedWeekKey && previousPublishedWeekKey !== publishedKeys.weekKey) {
    recalculateTasks.push(recomputePublishedAggregate("week", previousPublishedWeekKey));
    recalculateTasks.push(recomputeExecutivePeriodAggregate("week", previousPublishedWeekKey));
  }
  if (previousPublishedMonthKey && previousPublishedMonthKey !== publishedKeys.monthKey) {
    recalculateTasks.push(recomputePublishedAggregate("month", previousPublishedMonthKey));
    recalculateTasks.push(recomputeExecutivePeriodAggregate("month", previousPublishedMonthKey));
  }

  await Promise.all(recalculateTasks);
}

async function processPaymentApprovedEvent(eventData: JsonMap): Promise<void> {
  const userId = normalizeText(eventData.userId);
  const invitacionId = normalizeText(eventData.invitacionId);
  const approvedAt = toDate(eventData.timestamp);
  if (!userId || !approvedAt) return;

  const eventMetadata = sanitizeMetadata(eventData.metadata);
  const approvedKeys = getPeriodKeys(approvedAt);
  const invitationRef = invitacionId
    ? db.collection(ANALYTICS_INVITATIONS_COLLECTION).doc(invitacionId)
    : null;
  const userRef = db.collection(ANALYTICS_USERS_COLLECTION).doc(userId);
  let templateIdForRecompute =
    normalizeText(eventData.templateId) || UNKNOWN_TEMPLATE_ANALYTICS_ID;
  let registrationDateKey = "";
  let registrationWeekKey = "";
  let registrationMonthKey = "";
  let registrationCohortMonth = "";

  await db.runTransaction(async (transaction) => {
    const refs: Array<FirebaseFirestore.DocumentReference> = [userRef];
    if (invitationRef) {
      refs.push(invitationRef);
    }

    const [userSnap, invitationSnap] = await Promise.all(refs.map((ref) => transaction.get(ref)));
    const userData = asObject(userSnap.data());
    const invitationData = invitationSnap ? asObject(invitationSnap.data()) : {};
    const safeTemplateId =
      normalizeText(eventData.templateId) ||
      normalizeText(invitationData.templateId) ||
      UNKNOWN_TEMPLATE_ANALYTICS_ID;
    const safeTemplateName =
      normalizeText(eventMetadata.templateName) ||
      normalizeText(invitationData.templateName) ||
      null;
    const safePublicSlug =
      normalizeText(eventMetadata.publicSlug) ||
      normalizeText(invitationData.publicSlug) ||
      null;

    templateIdForRecompute = safeTemplateId;
    registrationDateKey = normalizeText(userData.registrationDateKey);
    registrationWeekKey = normalizeText(userData.registrationWeekKey);
    registrationMonthKey = normalizeText(userData.registrationMonthKey);
    registrationCohortMonth = normalizeText(userData.registrationCohortMonth);

    if (invitationRef) {
      transaction.set(
        invitationRef,
        {
          invitacionId,
          ownerUserId: userId,
          templateId: safeTemplateId,
          templateName: safeTemplateName,
          publicSlug: safePublicSlug,
          ownerRegistrationCohortMonth:
            registrationCohortMonth || invitationData.ownerRegistrationCohortMonth || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    const userPayload: JsonMap = {
      userId,
      isPayingUser: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    transaction.set(userRef, userPayload, { merge: true });
  });

  await recomputeUserLifetimeCounters(userId);
  if (invitacionId) {
    await recomputeInvitationPaymentCounters(invitacionId);
    await recomputeTemplateAggregate(templateIdForRecompute);
  }

  await Promise.all([
    recomputeExecutivePeriodAggregate("day", approvedKeys.dateKey),
    recomputeExecutivePeriodAggregate("week", approvedKeys.weekKey),
    recomputeExecutivePeriodAggregate("month", approvedKeys.monthKey),
    registrationDateKey ? recomputeRegistrationAggregate("day", registrationDateKey) : Promise.resolve(),
    registrationWeekKey ? recomputeRegistrationAggregate("week", registrationWeekKey) : Promise.resolve(),
    registrationMonthKey ? recomputeRegistrationAggregate("month", registrationMonthKey) : Promise.resolve(),
    registrationCohortMonth ? recomputeCohortAggregate(registrationCohortMonth) : Promise.resolve(),
  ]);
}

async function processAnalyticsEventPayload(eventData: JsonMap): Promise<void> {
  const eventName = normalizeText(eventData.eventName) as AnalyticsEventName;
  if (eventName === "registro_usuario") {
    await processRegistrationEvent(eventData);
    return;
  }
  if (eventName === "invitacion_creada") {
    await processInvitationCreatedEvent(eventData);
    return;
  }
  if (eventName === "invitacion_publicada") {
    await processInvitationPublishedEvent(eventData);
    return;
  }
  if (eventName === "pago_aprobado") {
    await processPaymentApprovedEvent(eventData);
  }
}

async function processAnalyticsEventById(eventId: string): Promise<void> {
  const safeEventId = normalizeText(eventId);
  if (!safeEventId) return;

  const eventRef = db.collection(ANALYTICS_EVENTS_COLLECTION).doc(safeEventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) return;

  const eventData = asObject(eventSnap.data());
  if (eventData.processingState === "processed") return;

  try {
    await processAnalyticsEventPayload(eventData);
    await markAnalyticsEventProcessed(safeEventId);
  } catch (error) {
    await markAnalyticsEventFailed(safeEventId, error);
    throw error;
  }
}

export async function recordBusinessAnalyticsEvent(
  input: QueueAnalyticsEventInput,
  options: QueueAnalyticsEventOptions = {}
): Promise<void> {
  await queueAnalyticsEvent(input, options);
}

function serializeAggregateDoc(periodKey: string, data: JsonMap): JsonMap {
  const executive = asObject(data.executive);
  const activation = asObject(executive.activation);
  const ttfv = asObject(executive.ttfv);
  const create = asObject(ttfv.create);
  const publish = asObject(ttfv.publish);
  const users = asObject(executive.users);
  const payments = asObject(executive.payments);
  const conversion = asObject(executive.conversion);
  const publishedInvitations = asObject(executive.publishedInvitations);

  return {
    periodKey,
    periodType: normalizeText(data.periodType),
    updatedAt: toIsoString(data.updatedAt),
    executive: {
      activation: {
        registeredUsers: asNumber(activation.registeredUsers),
        createdActivatedUsers: asNumber(activation.createdActivatedUsers),
        publishedActivatedUsers: asNumber(activation.publishedActivatedUsers),
        activationRateCreated: asNumber(activation.activationRateCreated),
        activationRatePublished: asNumber(activation.activationRatePublished),
      },
      ttfv: {
        create: {
          avgSeconds: Number.isFinite(create.avgSeconds) ? create.avgSeconds : null,
          p50Seconds: Number.isFinite(create.p50Seconds) ? create.p50Seconds : null,
          reachedUsers: asNumber(create.reachedUsers),
          notReachedUsers: asNumber(create.notReachedUsers),
          distribution: {
            ...EMPTY_DISTRIBUTION,
            ...asObject(create.distribution),
          },
        },
        publish: {
          avgSeconds: Number.isFinite(publish.avgSeconds) ? publish.avgSeconds : null,
          p50Seconds: Number.isFinite(publish.p50Seconds) ? publish.p50Seconds : null,
          reachedUsers: asNumber(publish.reachedUsers),
          notReachedUsers: asNumber(publish.notReachedUsers),
          distribution: {
            ...EMPTY_DISTRIBUTION,
            ...asObject(publish.distribution),
          },
        },
      },
      users: {
        totalRegisteredUsers: asNumber(users.totalRegisteredUsers),
        newUsers: asNumber(users.newUsers),
        usersWhoPublished: asNumber(users.usersWhoPublished),
        publishedInvitationsPerUser: asNumber(users.publishedInvitationsPerUser),
      },
      payments: {
        payingUsers: asNumber(payments.payingUsers),
        paymentsApproved: asNumber(payments.paymentsApproved),
        revenue: asCurrencyAmount(payments.revenue),
        totalRevenue: asCurrencyAmount(payments.totalRevenue),
        averageOrderValue: asCurrencyAmount(payments.averageOrderValue),
      },
      conversion: {
        paymentConversionRate: asNumber(conversion.paymentConversionRate),
      },
      publishedInvitations: {
        count: asNumber(publishedInvitations.count),
        cumulativeCount: asNumber(publishedInvitations.cumulativeCount),
      },
    },
  };
}

async function readDailySeriesRange(range: AnalyticsDateRange): Promise<JsonMap[]> {
  const snapshot = await db
    .collection(ANALYTICS_DAILY_COLLECTION)
    .orderBy(admin.firestore.FieldPath.documentId(), "asc")
    .startAt(range.fromDate)
    .endAt(range.toDate)
    .get();

  return snapshot.docs.map((docItem) => serializeAggregateDoc(docItem.id, asObject(docItem.data())));
}

async function readLatestDailySnapshotBeforeOrAt(dateKey: string): Promise<JsonMap | null> {
  const snapshot = await db
    .collection(ANALYTICS_DAILY_COLLECTION)
    .where(admin.firestore.FieldPath.documentId(), "<=", dateKey)
    .orderBy(admin.firestore.FieldPath.documentId(), "desc")
    .limit(1)
    .get();

  const docItem = snapshot.docs[0];
  if (!docItem) return null;
  return serializeAggregateDoc(docItem.id, asObject(docItem.data()));
}

function getSeriesBucketKeyForDate(periodKey: string, periodType: SeriesPeriodType): string {
  if (periodType === "day") return periodKey;
  const date = toDateFromDateKeyAtNoonUtc(periodKey);
  if (!date) return periodKey;
  const keys = getPeriodKeys(date);
  if (periodType === "week") return keys.weekKey;
  if (periodType === "month") return keys.monthKey;
  return keys.monthKey.slice(0, 4);
}

function buildGroupedSeriesFromDaily(dailySeries: JsonMap[], periodType: SeriesPeriodType): JsonMap[] {
  if (periodType === "day") {
    return dailySeries;
  }

  const buckets = new Map<string, JsonMap>();

  dailySeries.forEach((point) => {
    const dayPoint = asObject(point);
    const periodKey = normalizeText(dayPoint.periodKey);
    if (!periodKey) return;

    const bucketKey = getSeriesBucketKeyForDate(periodKey, periodType);
    const currentBucket = buckets.get(bucketKey) || buildEmptySerializedAggregateDoc(bucketKey, periodType);
    const bucketExecutive = asObject(currentBucket.executive);
    const bucketUsers = asObject(bucketExecutive.users);
    const bucketPayments = asObject(bucketExecutive.payments);
    const bucketPublished = asObject(bucketExecutive.publishedInvitations);
    const pointExecutive = asObject(dayPoint.executive);
    const pointUsers = asObject(pointExecutive.users);
    const pointPayments = asObject(pointExecutive.payments);
    const pointConversion = asObject(pointExecutive.conversion);
    const pointPublished = asObject(pointExecutive.publishedInvitations);

    const nextBucket: JsonMap = {
      ...currentBucket,
      periodKey: bucketKey,
      periodType,
      updatedAt: dayPoint.updatedAt || currentBucket.updatedAt || null,
      executive: {
        ...bucketExecutive,
        users: {
          ...bucketUsers,
          newUsers: asNumber(bucketUsers.newUsers) + asNumber(pointUsers.newUsers),
          totalRegisteredUsers: asNumber(pointUsers.totalRegisteredUsers),
          usersWhoPublished: asNumber(pointUsers.usersWhoPublished),
          publishedInvitationsPerUser: asNumber(pointUsers.publishedInvitationsPerUser),
        },
        payments: {
          ...bucketPayments,
          revenue: asCurrencyAmount(bucketPayments.revenue) + asCurrencyAmount(pointPayments.revenue),
          paymentsApproved:
            asNumber(bucketPayments.paymentsApproved) + asNumber(pointPayments.paymentsApproved),
          payingUsers: asNumber(pointPayments.payingUsers),
          totalRevenue: asCurrencyAmount(pointPayments.totalRevenue),
          averageOrderValue: 0,
        },
        conversion: {
          paymentConversionRate: asNumber(pointConversion.paymentConversionRate),
        },
        publishedInvitations: {
          count: asNumber(bucketPublished.count) + asNumber(pointPublished.count),
          cumulativeCount: asNumber(pointPublished.cumulativeCount),
        },
      },
    };

    const nextPayments = asObject(asObject(nextBucket.executive).payments);
    nextPayments.averageOrderValue =
      asNumber(nextPayments.paymentsApproved) > 0
        ? Math.round(asCurrencyAmount(nextPayments.revenue) / asNumber(nextPayments.paymentsApproved))
        : 0;

    buckets.set(bucketKey, nextBucket);
  });

  return Array.from(buckets.values()).sort((left, right) =>
    normalizeText(left.periodKey).localeCompare(normalizeText(right.periodKey))
  );
}

function buildSeriesByRange(dailySeries: JsonMap[]): {
  daily: JsonMap[];
  weekly: JsonMap[];
  monthly: JsonMap[];
  annual: JsonMap[];
} {
  return {
    daily: dailySeries,
    weekly: buildGroupedSeriesFromDaily(dailySeries, "week"),
    monthly: buildGroupedSeriesFromDaily(dailySeries, "month"),
    annual: buildGroupedSeriesFromDaily(dailySeries, "year"),
  };
}

async function readSeries(collectionName: string, limitCount: number): Promise<JsonMap[]> {
  const snapshot = await db
    .collection(collectionName)
    .orderBy("periodKey", "desc")
    .limit(limitCount)
    .get();

  return snapshot.docs
    .map((docItem) => serializeAggregateDoc(docItem.id, asObject(docItem.data())))
    .reverse();
}

function serializeCohortRootDoc(cohortMonth: string, data: JsonMap): JsonMap {
  return {
    cohortMonth,
    users: asNumber(data.users),
    activationCreatedUsers: asNumber(data.activationCreatedUsers),
    activationPublishedUsers: asNumber(data.activationPublishedUsers),
    usersWhoPublished: asNumber(data.usersWhoPublished),
    payingUsers: asNumber(data.payingUsers),
    paymentsApproved: asNumber(data.paymentsApproved),
    revenueTotalArs: asCurrencyAmount(data.revenueTotalArs),
    publishedInvitationsPerUser: asNumber(data.publishedInvitationsPerUser),
    paymentConversionRate: asNumber(data.paymentConversionRate),
    activationCreatedRate: asNumber(data.activationCreatedRate),
    activationPublishedRate: asNumber(data.activationPublishedRate),
    ttfvCreateAvgSeconds:
      Number.isFinite(data.ttfvCreateAvgSeconds) ? data.ttfvCreateAvgSeconds : null,
    ttfvCreateP50Seconds:
      Number.isFinite(data.ttfvCreateP50Seconds) ? data.ttfvCreateP50Seconds : null,
    ttfvCreateDistribution: {
      ...EMPTY_DISTRIBUTION,
      ...asObject(data.ttfvCreateDistribution),
    },
    ttfvPublishAvgSeconds:
      Number.isFinite(data.ttfvPublishAvgSeconds) ? data.ttfvPublishAvgSeconds : null,
    ttfvPublishP50Seconds:
      Number.isFinite(data.ttfvPublishP50Seconds) ? data.ttfvPublishP50Seconds : null,
    ttfvPublishDistribution: {
      ...EMPTY_DISTRIBUTION,
      ...asObject(data.ttfvPublishDistribution),
    },
    invitacionesPublicadas: asNumber(data.invitacionesPublicadas),
    publishedInvitations: asNumber(data.invitacionesPublicadas),
    updatedAt: toIsoString(data.updatedAt),
  };
}

function serializeCohortPeriodDoc(id: string, data: JsonMap): JsonMap {
  return {
    id,
    periodIndex: asNumber(data.periodIndex),
    periodMonthKey: normalizeText(data.periodMonthKey),
    newActivatedCreatedUsers: asNumber(data.newActivatedCreatedUsers),
    newActivatedPublishedUsers: asNumber(data.newActivatedPublishedUsers),
    newPublishedUsers: asNumber(data.newPublishedUsers),
    newPayingUsers: asNumber(data.newPayingUsers),
    cumulativeActivatedCreatedUsers: asNumber(data.cumulativeActivatedCreatedUsers),
    cumulativeActivatedPublishedUsers: asNumber(data.cumulativeActivatedPublishedUsers),
    cumulativePublishedUsers: asNumber(data.cumulativePublishedUsers),
    cumulativePayingUsers: asNumber(data.cumulativePayingUsers),
    cumulativeActivationCreatedRate: asNumber(data.cumulativeActivationCreatedRate),
    cumulativeActivationPublishedRate: asNumber(data.cumulativeActivationPublishedRate),
    paymentConversionRate: asNumber(data.paymentConversionRate),
    invitacionesPublicadas: asNumber(data.invitacionesPublicadas),
    publishedInvitations: asNumber(data.invitacionesPublicadas),
    paymentsApproved: asNumber(data.paymentsApproved),
    revenueArs: asCurrencyAmount(data.revenueArs),
    ttfvCreateAvgSeconds:
      Number.isFinite(data.ttfvCreateAvgSeconds) ? data.ttfvCreateAvgSeconds : null,
    ttfvCreateP50Seconds:
      Number.isFinite(data.ttfvCreateP50Seconds) ? data.ttfvCreateP50Seconds : null,
    ttfvPublishAvgSeconds:
      Number.isFinite(data.ttfvPublishAvgSeconds) ? data.ttfvPublishAvgSeconds : null,
    ttfvPublishP50Seconds:
      Number.isFinite(data.ttfvPublishP50Seconds) ? data.ttfvPublishP50Seconds : null,
    updatedAt: toIsoString(data.updatedAt),
  };
}

async function readCohorts(limitCount: number): Promise<JsonMap[]> {
  const snapshot = await db
    .collection(ANALYTICS_COHORTS_COLLECTION)
    .orderBy("cohortMonth", "desc")
    .limit(limitCount)
    .get();

  const serialized = await Promise.all(
    snapshot.docs.map(async (docItem) => {
      const root = serializeCohortRootDoc(docItem.id, asObject(docItem.data()));
      const periodsSnap = await docItem.ref
        .collection("periods")
        .orderBy("periodIndex", "asc")
        .limit(12)
        .get();

      return {
        ...root,
        periods: periodsSnap.docs.map((periodDoc) =>
          serializeCohortPeriodDoc(periodDoc.id, asObject(periodDoc.data()))
        ),
      };
    })
  );

  return serialized.reverse();
}

async function readTopTemplates(limitCount: number): Promise<JsonMap[]> {
  const snapshot = await db
    .collection(ANALYTICS_TEMPLATES_COLLECTION)
    .orderBy("publishedInvitations", "desc")
    .limit(limitCount)
    .get();

  return snapshot.docs.map((docItem) => {
    const data = asObject(docItem.data());
    return {
      templateId: docItem.id,
      templateName: normalizeText(data.templateName) || null,
      createdInvitations: asNumber(data.createdInvitations),
      publishedInvitations: asNumber(data.publishedInvitations),
      paymentsApproved: asNumber(data.paymentsApproved),
      revenueTotalArs: asCurrencyAmount(data.revenueTotalArs),
      updatedAt: toIsoString(data.updatedAt),
    };
  });
}

async function readCohortsByRange(range: AnalyticsDateRange): Promise<JsonMap[]> {
  const snapshot = await db
    .collection(ANALYTICS_COHORTS_COLLECTION)
    .orderBy("cohortMonth", "asc")
    .startAt(range.fromMonthKey)
    .endAt(range.toMonthKey)
    .get();

  return Promise.all(
    snapshot.docs.map(async (docItem) => {
      const root = serializeCohortRootDoc(docItem.id, asObject(docItem.data()));
      const periodsSnap = await docItem.ref
        .collection("periods")
        .orderBy("periodIndex", "asc")
        .limit(12)
        .get();

      return {
        ...root,
        periods: periodsSnap.docs
          .map((periodDoc) => serializeCohortPeriodDoc(periodDoc.id, asObject(periodDoc.data())))
          .filter((period) => {
            const periodMonthKey = normalizeText(period.periodMonthKey);
            return !periodMonthKey || periodMonthKey <= range.toMonthKey;
          }),
      };
    })
  );
}

async function readTopTemplatesByRange(range: AnalyticsDateRange, limitCount: number): Promise<JsonMap[]> {
  const [createdSnap, publishedSnap] = await Promise.all([
    db
      .collection(ANALYTICS_INVITATIONS_COLLECTION)
      .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(range.fromTimestampStart))
      .where("createdAt", "<=", admin.firestore.Timestamp.fromDate(range.toTimestampEnd))
      .get(),
    db
      .collection(ANALYTICS_INVITATIONS_COLLECTION)
      .where("firstPublishedDateKey", ">=", range.fromDate)
      .where("firstPublishedDateKey", "<=", range.toDate)
      .get(),
  ]);

  const totals = new Map<
    string,
    {
      templateId: string;
      templateName: string | null;
      createdInvitations: number;
      publishedInvitations: number;
      paymentsApproved: number;
      revenueTotalArs: number;
    }
  >();

  const ensureTemplateTotal = (templateId: string, templateName: string | null) => {
    const safeTemplateId = templateId || UNKNOWN_TEMPLATE_ANALYTICS_ID;
    const current =
      totals.get(safeTemplateId) || {
        templateId: safeTemplateId,
        templateName: templateName || null,
        createdInvitations: 0,
        publishedInvitations: 0,
        paymentsApproved: 0,
        revenueTotalArs: 0,
      };
    if (!current.templateName && templateName) {
      current.templateName = templateName;
    }
    totals.set(safeTemplateId, current);
    return current;
  };

  createdSnap.docs.forEach((docItem) => {
    const data = asObject(docItem.data());
    const templateId = normalizeText(data.templateId) || UNKNOWN_TEMPLATE_ANALYTICS_ID;
    const templateName = normalizeText(data.templateName) || null;
    const current = ensureTemplateTotal(templateId, templateName);
    current.createdInvitations += 1;
  });

  publishedSnap.docs.forEach((docItem) => {
    const data = asObject(docItem.data());
    const templateId = normalizeText(data.templateId) || UNKNOWN_TEMPLATE_ANALYTICS_ID;
    const templateName = normalizeText(data.templateName) || null;
    const current = ensureTemplateTotal(templateId, templateName);
    current.publishedInvitations += 1;
    current.paymentsApproved += asNumber(data.approvedPaymentsCount);
    current.revenueTotalArs += asCurrencyAmount(data.revenueTotalArs);
  });

  return Array.from(totals.values())
    .sort((left, right) => {
      if (right.publishedInvitations !== left.publishedInvitations) {
        return right.publishedInvitations - left.publishedInvitations;
      }
      if (right.revenueTotalArs !== left.revenueTotalArs) {
        return right.revenueTotalArs - left.revenueTotalArs;
      }
      return right.createdInvitations - left.createdInvitations;
    })
    .slice(0, limitCount);
}

function serializeRebuildJob(data: JsonMap): JsonMap | null {
  const status = normalizeText(data.status);
  if (!status) return null;

  return {
    status,
    requestedByUid: normalizeText(data.requestedByUid) || null,
    requestedAt: toIsoString(data.requestedAt),
    startedAt: toIsoString(data.startedAt),
    finishedAt: toIsoString(data.finishedAt),
    lastHeartbeatAt: toIsoString(data.lastHeartbeatAt),
    stage: normalizeText(data.stage) || null,
    error: normalizeText(data.error) || null,
    counters: {
      registro_usuario: asNumber(asObject(data.counters).registro_usuario),
      invitacion_creada: asNumber(asObject(data.counters).invitacion_creada),
      invitacion_publicada: asNumber(asObject(data.counters).invitacion_publicada),
      pago_aprobado: asNumber(asObject(data.counters).pago_aprobado),
      processedPendingEvents: asNumber(asObject(data.counters).processedPendingEvents),
      processedFailedEvents: asNumber(asObject(data.counters).processedFailedEvents),
    },
  };
}

async function readRebuildJobSummary(): Promise<JsonMap | null> {
  const snapshot = await getRebuildJobRef().get();
  if (!snapshot.exists) return null;
  return serializeRebuildJob(asObject(snapshot.data()));
}

async function safeOverviewRead<T>(
  label: string,
  reader: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await reader();
  } catch (error) {
    logger.error("No se pudo leer una seccion del overview de analytics", {
      label,
      error: error instanceof Error ? error.message : String(error || ""),
    });
    return fallback;
  }
}

async function readRegistrationRangeSummary(range: AnalyticsDateRange): Promise<JsonMap> {
  const snapshot = await db
    .collection(ANALYTICS_USERS_COLLECTION)
    .where("registrationDateKey", ">=", range.fromDate)
    .where("registrationDateKey", "<=", range.toDate)
    .get();

  const users: JsonMap[] = snapshot.docs.map((docItem) => ({
    userId: docItem.id,
    ...asObject(docItem.data()),
  }));
  const registeredUsers = users.length;
  const createdActivatedUsers = users.filter((item) => item.activationCreatedReached === true).length;
  const publishedActivatedUsers = users.filter((item) => item.activationPublishedReached === true).length;
  const createValues = users
    .map((item) => asNumber(item.timeToFirstCreateSeconds, Number.NaN))
    .filter((value) => Number.isFinite(value));
  const publishValues = users
    .map((item) => asNumber(item.timeToFirstPublishSeconds, Number.NaN))
    .filter((value) => Number.isFinite(value));

  return {
    activation: {
      registeredUsers,
      createdActivatedUsers,
      publishedActivatedUsers,
      activationRateCreated: registeredUsers > 0 ? createdActivatedUsers / registeredUsers : 0,
      activationRatePublished: registeredUsers > 0 ? publishedActivatedUsers / registeredUsers : 0,
    },
    ttfv: {
      create: buildDurationSummary(createValues, registeredUsers),
      publish: buildDurationSummary(publishValues, registeredUsers),
    },
  };
}

function sumAggregateMetric(
  series: JsonMap[],
  selector: (point: JsonMap) => number
): number {
  return series.reduce((accumulator, point) => accumulator + selector(asObject(point)), 0);
}

function getLastAggregatePoint(series: JsonMap[]): JsonMap | null {
  if (!Array.isArray(series) || series.length === 0) return null;
  return asObject(series[series.length - 1]);
}

function resolveSummarySnapshot(
  range: AnalyticsDateRange,
  currentSnapshot: JsonMap | null,
  dailySeries: JsonMap[]
): JsonMap {
  const base = asObject(currentSnapshot || buildEmptySerializedAggregateDoc(range.toDate, "day"));
  const fallback = asObject(getLastAggregatePoint(dailySeries));
  const baseExecutive = asObject(base.executive);
  const fallbackExecutive = asObject(fallback.executive);
  const baseUsers = asObject(baseExecutive.users);
  const fallbackUsers = asObject(fallbackExecutive.users);
  const basePayments = asObject(baseExecutive.payments);
  const fallbackPayments = asObject(fallbackExecutive.payments);
  const baseConversion = asObject(baseExecutive.conversion);
  const fallbackConversion = asObject(fallbackExecutive.conversion);
  const basePublished = asObject(baseExecutive.publishedInvitations);
  const fallbackPublished = asObject(fallbackExecutive.publishedInvitations);

  const totalRegisteredUsers = Math.max(
    asNumber(baseUsers.totalRegisteredUsers),
    asNumber(fallbackUsers.totalRegisteredUsers)
  );
  const usersWhoPublished = Math.max(
    asNumber(baseUsers.usersWhoPublished),
    asNumber(fallbackUsers.usersWhoPublished)
  );
  const payingUsers = Math.max(
    asNumber(basePayments.payingUsers),
    asNumber(fallbackPayments.payingUsers)
  );
  const totalRevenue = Math.max(
    asCurrencyAmount(basePayments.totalRevenue),
    asCurrencyAmount(fallbackPayments.totalRevenue)
  );
  const cumulativePublished = Math.max(
    asNumber(basePublished.cumulativeCount),
    asNumber(fallbackPublished.cumulativeCount)
  );
  const publishedInvitationsPerUser =
    totalRegisteredUsers > 0
      ? cumulativePublished / totalRegisteredUsers
      : Math.max(
          asNumber(baseUsers.publishedInvitationsPerUser),
          asNumber(fallbackUsers.publishedInvitationsPerUser)
        );
  const paymentConversionRate =
    usersWhoPublished > 0
      ? payingUsers / usersWhoPublished
      : Math.max(
          asNumber(baseConversion.paymentConversionRate),
          asNumber(fallbackConversion.paymentConversionRate)
        );

  return {
    ...base,
    periodKey: normalizeText(base.periodKey) || normalizeText(fallback.periodKey) || range.toDate,
    updatedAt: base.updatedAt || fallback.updatedAt || null,
    executive: {
      ...baseExecutive,
      users: {
        ...baseUsers,
        totalRegisteredUsers,
        usersWhoPublished,
        publishedInvitationsPerUser,
      },
      payments: {
        ...basePayments,
        payingUsers,
        totalRevenue,
      },
      conversion: {
        ...baseConversion,
        paymentConversionRate,
      },
      publishedInvitations: {
        ...basePublished,
        cumulativeCount: cumulativePublished,
      },
    },
  };
}

function buildSummaryForRange(params: {
  range: AnalyticsDateRange;
  currentSnapshot: JsonMap | null;
  previousDailySeries: JsonMap[];
  dailySeries: JsonMap[];
  registrationRangeSummary: JsonMap;
}): JsonMap {
  const { range, currentSnapshot, previousDailySeries, dailySeries, registrationRangeSummary } = params;
  const current = resolveSummarySnapshot(range, currentSnapshot, dailySeries);
  const currentExecutive = asObject(current.executive);
  const currentUsers = asObject(currentExecutive.users);
  const currentPayments = asObject(currentExecutive.payments);
  const currentConversion = asObject(currentExecutive.conversion);
  const currentPublished = asObject(currentExecutive.publishedInvitations);
  const currentActivation = asObject(asObject(registrationRangeSummary).activation);
  const currentTtfv = asObject(asObject(registrationRangeSummary).ttfv);
  const currentCreateTtfv = asObject(currentTtfv.create);
  const currentPublishTtfv = asObject(currentTtfv.publish);

  const newUsers = sumAggregateMetric(
    dailySeries,
    (point) => asNumber(asObject(asObject(point.executive).users).newUsers)
  );
  const previousNewUsers = sumAggregateMetric(
    previousDailySeries,
    (point) => asNumber(asObject(asObject(point.executive).users).newUsers)
  );
  const publishedValue = sumAggregateMetric(
    dailySeries,
    (point) => asNumber(asObject(asObject(point.executive).publishedInvitations).count)
  );
  const previousPublishedValue = sumAggregateMetric(
    previousDailySeries,
    (point) => asNumber(asObject(asObject(point.executive).publishedInvitations).count)
  );
  const paymentsApproved = sumAggregateMetric(
    dailySeries,
    (point) => asNumber(asObject(asObject(point.executive).payments).paymentsApproved)
  );
  const revenue = sumAggregateMetric(
    dailySeries,
    (point) => asCurrencyAmount(asObject(asObject(point.executive).payments).revenue)
  );
  const previousRevenue = sumAggregateMetric(
    previousDailySeries,
    (point) => asCurrencyAmount(asObject(asObject(point.executive).payments).revenue)
  );

  return {
    currentMonthKey: range.toMonthKey,
    currentDateKey: range.toDate,
    publishedInvitations: {
      value: publishedValue,
      cumulativeValue: asNumber(currentPublished.cumulativeCount),
      previousValue: previousPublishedValue,
      delta: publishedValue - previousPublishedValue,
    },
    users: {
      totalRegisteredUsers: asNumber(currentUsers.totalRegisteredUsers),
      newUsers,
      previousNewUsers,
      usersWhoPublished: asNumber(currentUsers.usersWhoPublished),
      publishedInvitationsPerUser: asNumber(currentUsers.publishedInvitationsPerUser),
    },
    payments: {
      payingUsers: asNumber(currentPayments.payingUsers),
      paymentsApproved,
      revenue,
      previousRevenue,
      totalRevenue: asCurrencyAmount(currentPayments.totalRevenue),
      averageOrderValue: paymentsApproved > 0 ? Math.round(revenue / paymentsApproved) : 0,
    },
    conversion: {
      paymentConversionRate: asNumber(currentConversion.paymentConversionRate),
      payingUsers: asNumber(currentPayments.payingUsers),
      usersWhoPublished: asNumber(currentUsers.usersWhoPublished),
    },
    activationRateCreated: {
      value: asNumber(currentActivation.activationRateCreated),
      registeredUsers: asNumber(currentActivation.registeredUsers),
      activatedUsers: asNumber(currentActivation.createdActivatedUsers),
    },
    activationRatePublished: {
      value: asNumber(currentActivation.activationRatePublished),
      registeredUsers: asNumber(currentActivation.registeredUsers),
      activatedUsers: asNumber(currentActivation.publishedActivatedUsers),
    },
    ttfvCreate: {
      avgSeconds: Number.isFinite(currentCreateTtfv.avgSeconds)
        ? currentCreateTtfv.avgSeconds
        : null,
      p50Seconds: Number.isFinite(currentCreateTtfv.p50Seconds)
        ? currentCreateTtfv.p50Seconds
        : null,
      distribution: {
        ...EMPTY_DISTRIBUTION,
        ...asObject(currentCreateTtfv.distribution),
      },
    },
    ttfvPublish: {
      avgSeconds: Number.isFinite(currentPublishTtfv.avgSeconds)
        ? currentPublishTtfv.avgSeconds
        : null,
      p50Seconds: Number.isFinite(currentPublishTtfv.p50Seconds)
        ? currentPublishTtfv.p50Seconds
        : null,
      distribution: {
        ...EMPTY_DISTRIBUTION,
        ...asObject(currentPublishTtfv.distribution),
      },
    },
  };
}

async function isRebuildJobActive(): Promise<boolean> {
  const snapshot = await getRebuildJobRef().get();
  if (!snapshot.exists) return false;
  const data = asObject(snapshot.data());
  const status = normalizeText(data.status);
  return status === "queued" || status === "running";
}

function buildSummary(monthlySeries: JsonMap[]): JsonMap {
  const current = asObject(monthlySeries[monthlySeries.length - 1]);
  const previous = asObject(monthlySeries[monthlySeries.length - 2]);
  const currentExecutive = asObject(current.executive);
  const previousExecutive = asObject(previous.executive);
  const currentActivation = asObject(currentExecutive.activation);
  const currentTtfv = asObject(currentExecutive.ttfv);
  const currentUsers = asObject(currentExecutive.users);
  const previousUsers = asObject(previousExecutive.users);
  const currentPayments = asObject(currentExecutive.payments);
  const previousPayments = asObject(previousExecutive.payments);
  const currentConversion = asObject(currentExecutive.conversion);
  const previousPublished = asObject(previousExecutive.publishedInvitations);
  const currentPublished = asObject(currentExecutive.publishedInvitations);
  const currentCreateTtfv = asObject(asObject(currentTtfv.create));
  const currentPublishTtfv = asObject(asObject(currentTtfv.publish));

  const currentPublishedCount = asNumber(currentPublished.count);
  const previousPublishedCount = asNumber(previousPublished.count);

  return {
    currentMonthKey: normalizeText(current.periodKey),
    publishedInvitations: {
      value: currentPublishedCount,
      cumulativeValue: asNumber(currentPublished.cumulativeCount),
      previousValue: previousPublishedCount,
      delta: currentPublishedCount - previousPublishedCount,
    },
    users: {
      totalRegisteredUsers: asNumber(currentUsers.totalRegisteredUsers),
      newUsers: asNumber(currentUsers.newUsers),
      previousNewUsers: asNumber(previousUsers.newUsers),
      usersWhoPublished: asNumber(currentUsers.usersWhoPublished),
      publishedInvitationsPerUser: asNumber(currentUsers.publishedInvitationsPerUser),
    },
    payments: {
      payingUsers: asNumber(currentPayments.payingUsers),
      paymentsApproved: asNumber(currentPayments.paymentsApproved),
      revenue: asCurrencyAmount(currentPayments.revenue),
      previousRevenue: asCurrencyAmount(previousPayments.revenue),
      totalRevenue: asCurrencyAmount(currentPayments.totalRevenue),
      averageOrderValue: asCurrencyAmount(currentPayments.averageOrderValue),
    },
    conversion: {
      paymentConversionRate: asNumber(currentConversion.paymentConversionRate),
      payingUsers: asNumber(currentPayments.payingUsers),
      usersWhoPublished: asNumber(currentUsers.usersWhoPublished),
    },
    activationRateCreated: {
      value: asNumber(currentActivation.activationRateCreated),
      registeredUsers: asNumber(currentActivation.registeredUsers),
      activatedUsers: asNumber(currentActivation.createdActivatedUsers),
    },
    activationRatePublished: {
      value: asNumber(currentActivation.activationRatePublished),
      registeredUsers: asNumber(currentActivation.registeredUsers),
      activatedUsers: asNumber(currentActivation.publishedActivatedUsers),
    },
    ttfvCreate: {
      avgSeconds: Number.isFinite(currentCreateTtfv.avgSeconds)
        ? currentCreateTtfv.avgSeconds
        : null,
      p50Seconds: Number.isFinite(currentCreateTtfv.p50Seconds)
        ? currentCreateTtfv.p50Seconds
        : null,
      distribution: {
        ...EMPTY_DISTRIBUTION,
        ...asObject(currentCreateTtfv.distribution),
      },
    },
    ttfvPublish: {
      avgSeconds: Number.isFinite(currentPublishTtfv.avgSeconds)
        ? currentPublishTtfv.avgSeconds
        : null,
      p50Seconds: Number.isFinite(currentPublishTtfv.p50Seconds)
        ? currentPublishTtfv.p50Seconds
        : null,
      distribution: {
        ...EMPTY_DISTRIBUTION,
        ...asObject(currentPublishTtfv.distribution),
      },
    },
  };
}

function buildMetricTimeseries(points: JsonMap[]): JsonMap[] {
  return points.map((point) => ({
    periodKey: normalizeText(point.periodKey),
    newUsers: asNumber(asObject(asObject(point.executive).users).newUsers),
    revenue: asCurrencyAmount(asObject(asObject(point.executive).payments).revenue),
    publishedInvitations: asNumber(asObject(asObject(point.executive).publishedInvitations).count),
  }));
}

function parseAnalyticsDateRangeInput(input: AnalyticsDateRangeInput | null | undefined): AnalyticsDateRange {
  try {
    return buildAnalyticsDateRange(input || {});
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Rango de analytics invalido.");
  }
}

function serializeDateRange(range: AnalyticsDateRange): JsonMap {
  return {
    fromDate: range.fromDate,
    toDate: range.toDate,
    dayCount: range.dayCount,
    fromWeekKey: range.fromWeekKey,
    toWeekKey: range.toWeekKey,
    fromMonthKey: range.fromMonthKey,
    toMonthKey: range.toMonthKey,
  };
}

function csvEscape(value: unknown): string {
  if (value === null || typeof value === "undefined") return "";
  const text = typeof value === "string" ? value : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

const RAW_EXPORT_COLUMNS = [
  "eventId",
  "eventName",
  "timestamp",
  "businessDateKey",
  "businessWeekKey",
  "businessMonthKey",
  "userId",
  "invitacionId",
  "templateId",
  "processingState",
  "processingAttempts",
  "processedAt",
  "lastProcessingError",
  "createdAt",
  "updatedAt",
  "source",
  "templateName",
  "publicSlug",
  "operation",
  "paymentId",
  "paymentSessionId",
  "amountArs",
  "amountBaseArs",
  "discountAmountArs",
  "emailDomain",
  "metadataJson",
] as const;

function buildRawExportRow(eventData: JsonMap): Record<(typeof RAW_EXPORT_COLUMNS)[number], unknown> {
  const metadata = asObject(eventData.metadata);
  return {
    eventId: normalizeText(eventData.eventId),
    eventName: normalizeText(eventData.eventName),
    timestamp: toIsoString(eventData.timestamp),
    businessDateKey: normalizeText(eventData.businessDateKey),
    businessWeekKey: normalizeText(eventData.businessWeekKey),
    businessMonthKey: normalizeText(eventData.businessMonthKey),
    userId: normalizeText(eventData.userId),
    invitacionId: normalizeText(eventData.invitacionId) || null,
    templateId: normalizeText(eventData.templateId) || null,
    processingState: normalizeText(eventData.processingState),
    processingAttempts: asNumber(eventData.processingAttempts),
    processedAt: toIsoString(eventData.processedAt),
    lastProcessingError: normalizeText(eventData.lastProcessingError) || null,
    createdAt: toIsoString(eventData.createdAt),
    updatedAt: toIsoString(eventData.updatedAt),
    source: normalizeText(metadata.source) || null,
    templateName: normalizeText(metadata.templateName) || null,
    publicSlug: normalizeText(metadata.publicSlug) || null,
    operation: normalizeText(metadata.operation) || null,
    paymentId: normalizeText(metadata.paymentId) || null,
    paymentSessionId: normalizeText(metadata.paymentSessionId) || null,
    amountArs: asCurrencyAmount(metadata.amountArs),
    amountBaseArs: asCurrencyAmount(metadata.amountBaseArs),
    discountAmountArs: asCurrencyAmount(metadata.discountAmountArs),
    emailDomain: normalizeText(metadata.emailDomain) || null,
    metadataJson: JSON.stringify(metadata),
  };
}

async function writeRawCsvLine(
  stream: ReturnType<typeof createWriteStream>,
  values: unknown[]
): Promise<void> {
  const line = `${values.map((value) => csvEscape(value)).join(",")}\r\n`;
  if (!stream.write(line)) {
    await once(stream, "drain");
  }
}

function serializeExportJob(docId: string, data: JsonMap): JsonMap {
  return {
    exportId: docId,
    dataset: normalizeText(data.dataset) || RAW_EXPORT_DATASET,
    status: normalizeText(data.status),
    requestedByUid: normalizeText(data.requestedByUid) || null,
    requestedAt: toIsoString(data.requestedAt),
    startedAt: toIsoString(data.startedAt),
    finishedAt: toIsoString(data.finishedAt),
    fromDate: normalizeText(data.fromDate) || null,
    toDate: normalizeText(data.toDate) || null,
    format: normalizeText(data.format) || RAW_EXPORT_FORMAT,
    rowCount: asNumber(data.rowCount),
    filePath: normalizeText(data.filePath) || null,
    error: normalizeText(data.error) || null,
    expiresAt: toIsoString(data.expiresAt),
  };
}

async function enqueueRawExport(
  request: CallableRequest<{ fromDate?: string | null; toDate?: string | null; format?: string | null }>
): Promise<JsonMap> {
  requireSuperAdmin(request);
  let range: AnalyticsDateRange;
  try {
    range = parseAnalyticsDateRangeInput(request.data || {});
  } catch (error) {
    throw new HttpsError(
      "invalid-argument",
      error instanceof Error ? error.message : "Rango de fechas invalido."
    );
  }
  const format = normalizeText(request.data?.format) || RAW_EXPORT_FORMAT;
  if (format !== RAW_EXPORT_FORMAT) {
    throw new HttpsError("invalid-argument", "Solo se permite exportacion CSV en esta version.");
  }

  const exportRef = getAnalyticsExportsCollection().doc();
  const now = new Date();
  await exportRef.set({
    exportId: exportRef.id,
    dataset: RAW_EXPORT_DATASET,
    status: "queued",
    requestedByUid: request.auth?.uid || null,
    requestedAt: admin.firestore.Timestamp.fromDate(now),
    startedAt: null,
    finishedAt: null,
    fromDate: range.fromDate,
    toDate: range.toDate,
    format: RAW_EXPORT_FORMAT,
    rowCount: 0,
    filePath: null,
    error: null,
    expiresAt: admin.firestore.Timestamp.fromDate(new Date(now.getTime() + RAW_EXPORT_RETENTION_MS)),
    leaseUntil: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return serializeExportJob(exportRef.id, {
    exportId: exportRef.id,
    dataset: RAW_EXPORT_DATASET,
    status: "queued",
    requestedByUid: request.auth?.uid || null,
    requestedAt: admin.firestore.Timestamp.fromDate(now),
    fromDate: range.fromDate,
    toDate: range.toDate,
    format: RAW_EXPORT_FORMAT,
    rowCount: 0,
    filePath: null,
    error: null,
    expiresAt: admin.firestore.Timestamp.fromDate(new Date(now.getTime() + RAW_EXPORT_RETENTION_MS)),
  });
}

async function readRawExportStatus(request: CallableRequest<{ exportId?: string | null }>): Promise<JsonMap> {
  requireSuperAdmin(request);
  const exportId = normalizeText(request.data?.exportId);
  if (!exportId) {
    throw new HttpsError("invalid-argument", "Falta exportId.");
  }

  const exportSnap = await getAnalyticsExportsCollection().doc(exportId).get();
  if (!exportSnap.exists) {
    throw new HttpsError("not-found", "La exportacion solicitada no existe.");
  }

  const serialized = serializeExportJob(exportSnap.id, asObject(exportSnap.data()));
  const filePath = normalizeText(serialized.filePath);

  if (serialized.status === "succeeded" && filePath) {
    const expiresAt = new Date(Date.now() + RAW_EXPORT_SIGNED_URL_MS);
    const [downloadUrl] = await admin.storage().bucket().file(filePath).getSignedUrl({
      version: "v4",
      action: "read",
      expires: expiresAt,
    });

    return {
      ...serialized,
      downloadUrl,
      downloadExpiresAt: expiresAt.toISOString(),
    };
  }

  return serialized;
}

async function readActiveRawExportJob(): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
  const now = new Date();
  const snapshot = await getAnalyticsExportsCollection()
    .where("status", "==", "running")
    .limit(5)
    .get();

  for (const docItem of snapshot.docs) {
    const leaseUntil = toDate(asObject(docItem.data()).leaseUntil);
    if (leaseUntil && leaseUntil.getTime() > now.getTime()) {
      return docItem;
    }
  }

  return null;
}

async function requeueStaleRawExportJobs(): Promise<void> {
  const now = new Date();
  const snapshot = await getAnalyticsExportsCollection()
    .where("status", "==", "running")
    .limit(10)
    .get();

  await Promise.all(
    snapshot.docs.map(async (docItem) => {
      const leaseUntil = toDate(asObject(docItem.data()).leaseUntil);
      if (leaseUntil && leaseUntil.getTime() > now.getTime()) {
        return;
      }

      await docItem.ref.set(
        {
          status: "queued",
          error: null,
          leaseUntil: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    })
  );
}

async function claimQueuedRawExportJob():
  Promise<{ exportId: string; data: JsonMap } | null> {
  const queuedSnapshot = await getAnalyticsExportsCollection()
    .where("status", "==", "queued")
    .limit(5)
    .get();

  for (const docItem of queuedSnapshot.docs) {
    const result = await db.runTransaction(async (transaction) => {
      const freshSnap = await transaction.get(docItem.ref);
      if (!freshSnap.exists) return null;
      const data = asObject(freshSnap.data());
      if (normalizeText(data.status) !== "queued") return null;

      const now = new Date();
      transaction.set(
        docItem.ref,
        {
          status: "running",
          startedAt: admin.firestore.Timestamp.fromDate(now),
          error: null,
          leaseUntil: createRawExportLeaseUntil(now),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        exportId: docItem.id,
        data: {
          ...data,
          status: "running",
          startedAt: admin.firestore.Timestamp.fromDate(now),
          leaseUntil: createRawExportLeaseUntil(now),
        },
      };
    });

    if (result) {
      return result;
    }
  }

  return null;
}

async function updateRawExportHeartbeat(exportId: string, rowCount: number): Promise<void> {
  const now = new Date();
  await getAnalyticsExportsCollection().doc(exportId).set(
    {
      rowCount,
      leaseUntil: createRawExportLeaseUntil(now),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function markRawExportFailed(exportId: string, error: unknown): Promise<void> {
  const now = new Date();
  await getAnalyticsExportsCollection().doc(exportId).set(
    {
      status: "failed",
      error: error instanceof Error ? error.message : String(error || "analytics-export-error"),
      finishedAt: admin.firestore.Timestamp.fromDate(now),
      leaseUntil: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function markRawExportSucceeded(exportId: string, filePath: string, rowCount: number): Promise<void> {
  const now = new Date();
  await getAnalyticsExportsCollection().doc(exportId).set(
    {
      status: "succeeded",
      filePath,
      rowCount,
      finishedAt: admin.firestore.Timestamp.fromDate(now),
      error: null,
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(now.getTime() + RAW_EXPORT_RETENTION_MS)),
      leaseUntil: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function buildRawAnalyticsCsv(exportId: string, exportData: JsonMap): Promise<{
  rowCount: number;
  filePath: string;
}> {
  const range = parseAnalyticsDateRangeInput({
    fromDate: normalizeText(exportData.fromDate),
    toDate: normalizeText(exportData.toDate),
  });
  const bucket = admin.storage().bucket();
  const tempFilePath = path.join(os.tmpdir(), `${exportId}.csv`);
  const filePath = `analytics-exports/raw/${range.toDate.slice(0, 4)}/${range.toDate.slice(5, 7)}/${exportId}.csv`;
  const stream = createWriteStream(tempFilePath, { encoding: "utf8" });
  let rowCount = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  try {
    if (!stream.write("\uFEFF")) {
      await once(stream, "drain");
    }
    await writeRawCsvLine(stream, [...RAW_EXPORT_COLUMNS]);

    while (true) {
      let query: FirebaseFirestore.Query = db
        .collection(ANALYTICS_EVENTS_COLLECTION)
        .where("businessDateKey", ">=", range.fromDate)
        .where("businessDateKey", "<=", range.toDate)
        .orderBy("businessDateKey", "asc")
        .orderBy("timestamp", "asc")
        .limit(RAW_EXPORT_BATCH_SIZE);

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      if (snapshot.empty) break;

      for (const docItem of snapshot.docs) {
        rowCount += 1;
        if (rowCount > RAW_EXPORT_MAX_ROWS) {
          throw new Error(
            `La exportacion supera el limite de ${RAW_EXPORT_MAX_ROWS.toLocaleString("es-AR")} filas. Acota el rango de fechas.`
          );
        }

        const row = buildRawExportRow(asObject(docItem.data()));
        await writeRawCsvLine(
          stream,
          RAW_EXPORT_COLUMNS.map((columnName) => row[columnName])
        );
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
      await updateRawExportHeartbeat(exportId, rowCount);

      if (snapshot.size < RAW_EXPORT_BATCH_SIZE) {
        break;
      }
    }

    stream.end();
    await once(stream, "finish");

    await bucket.upload(tempFilePath, {
      destination: filePath,
      metadata: {
        contentType: "text/csv; charset=utf-8",
        cacheControl: "private, max-age=0, no-cache, no-store",
      },
    });

    return {
      rowCount,
      filePath,
    };
  } finally {
    stream.destroy();
    await fsPromises.unlink(tempFilePath).catch(() => undefined);
  }
}

async function runPendingRawExports(): Promise<number> {
  if (await isRebuildJobActive()) {
    logger.info("Se omite export raw por rebuild activo");
    return 0;
  }

  await requeueStaleRawExportJobs();

  const activeJob = await readActiveRawExportJob();
  if (activeJob) {
    return 0;
  }

  const claimedJob = await claimQueuedRawExportJob();
  if (!claimedJob) {
    return 0;
  }

  try {
    const result = await buildRawAnalyticsCsv(claimedJob.exportId, claimedJob.data);
    await markRawExportSucceeded(claimedJob.exportId, result.filePath, result.rowCount);
    return 1;
  } catch (error) {
    await markRawExportFailed(claimedJob.exportId, error);
    logger.error("No se pudo procesar export raw de analytics", {
      exportId: claimedJob.exportId,
      error: error instanceof Error ? error.message : String(error || ""),
    });
    return 0;
  }
}

export const getBusinessAnalyticsOverviewV1 = onCall(
  {
    region: SCHEDULE_REGION,
    cpu: "gcf_gen1",
    memory: "512MiB",
  },
  async (request: CallableRequest<AnalyticsDateRangeInput>) => {
    requireSuperAdmin(request);

    let range: AnalyticsDateRange;
    try {
      range = parseAnalyticsDateRangeInput(request.data || {});
    } catch (error) {
      throw new HttpsError(
        "invalid-argument",
        error instanceof Error ? error.message : "Rango de fechas invalido."
      );
    }

    const [
      dailyRange,
      currentSnapshot,
      previousDailyRange,
      registrationRangeSummary,
      cohorts,
      templates,
      rebuildJob,
    ] = await Promise.all([
      safeOverviewRead("dailyRange", () => readDailySeriesRange(range), [] as JsonMap[]),
      safeOverviewRead(
        "currentSnapshot",
        () => readLatestDailySnapshotBeforeOrAt(range.toDate),
        null as JsonMap | null
      ),
      safeOverviewRead(
        "previousDailyRange",
        () =>
          readDailySeriesRange(
            buildAnalyticsDateRange({
              fromDate: range.previousFromDate,
              toDate: range.previousToDate,
            })
          ),
        [] as JsonMap[]
      ),
      safeOverviewRead(
        "registrationRangeSummary",
        () => readRegistrationRangeSummary(range),
        {
          activation: {
            registeredUsers: 0,
            createdActivatedUsers: 0,
            publishedActivatedUsers: 0,
            activationRateCreated: 0,
            activationRatePublished: 0,
          },
          ttfv: {
            create: buildDurationSummary([], 0),
            publish: buildDurationSummary([], 0),
          },
        } as JsonMap
      ),
      safeOverviewRead("cohorts", () => readCohortsByRange(range), [] as JsonMap[]),
      safeOverviewRead("templates", () => readTopTemplatesByRange(range, 8), [] as JsonMap[]),
      safeOverviewRead("rebuildJob", () => readRebuildJobSummary(), null as JsonMap | null),
    ]);

    const series = buildSeriesByRange(dailyRange);

    return {
      ok: true,
      timezone: BUSINESS_TIMEZONE,
      fetchedAt: new Date().toISOString(),
      partialPeriods: getCurrentPeriodKeys(),
      appliedRange: serializeDateRange(range),
      metricCatalog: BUSINESS_METRIC_CATALOG,
      summary: buildSummaryForRange({
        range,
        currentSnapshot,
        previousDailySeries: previousDailyRange,
        dailySeries: dailyRange,
        registrationRangeSummary,
      }),
      series,
      timeseries: {
        daily: buildMetricTimeseries(series.daily),
        weekly: buildMetricTimeseries(series.weekly),
        monthly: buildMetricTimeseries(series.monthly),
        annual: buildMetricTimeseries(series.annual),
      },
      rebuildJob,
      cohorts,
      templates: {
        topPublished: templates,
      },
    };
  }
);

export const requestBusinessAnalyticsRawExportV1 = onCall(
  {
    region: SCHEDULE_REGION,
    cpu: "gcf_gen1",
    memory: "512MiB",
  },
  async (
    request: CallableRequest<{ fromDate?: string | null; toDate?: string | null; format?: string | null }>
  ) => {
    try {
      return {
        ok: true,
        ...(await enqueueRawExport(request)),
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "No se pudo encolar la exportacion."
      );
    }
  }
);

export const getBusinessAnalyticsRawExportStatusV1 = onCall(
  {
    region: SCHEDULE_REGION,
    cpu: "gcf_gen1",
    memory: "512MiB",
  },
  async (request: CallableRequest<{ exportId?: string | null }>) => {
    try {
      return {
        ok: true,
        ...(await readRawExportStatus(request)),
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "No se pudo obtener la exportacion."
      );
    }
  }
);

export const runBusinessAnalyticsExportJobsV1 = onSchedule(
  {
    region: SCHEDULE_REGION,
    cpu: "gcf_gen1",
    schedule: "every 1 minutes",
    memory: "1GiB",
    timeoutSeconds: 540,
  },
  async () => {
    const processedJobs = await runPendingRawExports();
    logger.info("Analytics raw export scheduler ejecutado", {
      processedJobs,
    });
  }
);

async function processPendingAnalyticsBatch(processingState: "pending" | "failed", limitCount: number): Promise<number> {
  const snapshot = await db
    .collection(ANALYTICS_EVENTS_COLLECTION)
    .where("processingState", "==", processingState)
    .limit(limitCount)
    .get();

  let processed = 0;
  for (const docItem of snapshot.docs) {
    try {
      await processAnalyticsEventById(docItem.id);
      processed += 1;
    } catch (error) {
      logger.error("No se pudo reprocesar evento de analytics", {
        eventId: docItem.id,
        processingState,
        error: error instanceof Error ? error.message : String(error || ""),
      });
    }
  }

  return processed;
}

export const processPendingAnalyticsEventsV1 = onSchedule(
  {
    region: SCHEDULE_REGION,
    cpu: "gcf_gen1",
    schedule: "every 15 minutes",
    memory: "512MiB",
  },
  async () => {
    if (await isRebuildJobActive()) {
      logger.info("Analytics pending batch omitido por rebuild activo");
      return;
    }

    const [pendingProcessed, failedProcessed] = await Promise.all([
      processPendingAnalyticsBatch("pending", 50),
      processPendingAnalyticsBatch("failed", 25),
    ]);

    logger.info("Analytics pending batch procesado", {
      pendingProcessed,
      failedProcessed,
    });
  }
);

async function scanCollection(
  collectionName: string,
  handler: (docItem: FirebaseFirestore.QueryDocumentSnapshot) => Promise<void>
): Promise<void> {
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  while (true) {
    let query: FirebaseFirestore.Query = db
      .collection(collectionName)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(REBUILD_SCAN_PAGE_SIZE);
    if (cursor) {
      query = query.startAfter(cursor);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    for (const docItem of snapshot.docs) {
      await handler(docItem);
    }

    cursor = snapshot.docs[snapshot.docs.length - 1] || null;
    if (snapshot.docs.length < REBUILD_SCAN_PAGE_SIZE) break;
  }
}

async function clearAnalyticsCollections(): Promise<void> {
  const collectionNames = [
    ANALYTICS_EVENTS_COLLECTION,
    ANALYTICS_USERS_COLLECTION,
    ANALYTICS_INVITATIONS_COLLECTION,
    ANALYTICS_DAILY_COLLECTION,
    ANALYTICS_WEEKLY_COLLECTION,
    ANALYTICS_MONTHLY_COLLECTION,
    ANALYTICS_TEMPLATES_COLLECTION,
    ANALYTICS_COHORTS_COLLECTION,
  ];

  for (const collectionName of collectionNames) {
    await db.recursiveDelete(db.collection(collectionName));
  }
}

async function recomputeAllAnalyticsRollupsFromState(): Promise<void> {
  const registrationDayKeys = new Set<string>();
  const registrationWeekKeys = new Set<string>();
  const registrationMonthKeys = new Set<string>();
  const executiveDayKeys = new Set<string>();
  const executiveWeekKeys = new Set<string>();
  const executiveMonthKeys = new Set<string>();
  const publishedDayKeys = new Set<string>();
  const publishedWeekKeys = new Set<string>();
  const publishedMonthKeys = new Set<string>();
  const cohortMonths = new Set<string>();
  const templateIds = new Set<string>();
  const invitationIds = new Set<string>();
  const userIds = new Set<string>();

  await scanCollection(ANALYTICS_USERS_COLLECTION, async (docItem) => {
    const data = asObject(docItem.data());
    const registrationDateKey = normalizeText(data.registrationDateKey);
    const registrationWeekKey = normalizeText(data.registrationWeekKey);
    const registrationMonthKey = normalizeText(data.registrationMonthKey);
    const firstInvitationPublishedDateKey = normalizeText(data.firstInvitationPublishedDateKey);
    const firstInvitationPublishedWeekKey = normalizeText(data.firstInvitationPublishedWeekKey);
    const firstInvitationPublishedMonthKey = normalizeText(data.firstInvitationPublishedMonthKey);
    const firstApprovedPaymentDateKey = normalizeText(data.firstApprovedPaymentDateKey);
    const firstApprovedPaymentWeekKey = normalizeText(data.firstApprovedPaymentWeekKey);
    const firstApprovedPaymentMonthKey = normalizeText(data.firstApprovedPaymentMonthKey);
    const cohortMonth = normalizeText(data.registrationCohortMonth);

    if (registrationDateKey) {
      registrationDayKeys.add(registrationDateKey);
      executiveDayKeys.add(registrationDateKey);
    }
    if (registrationWeekKey) {
      registrationWeekKeys.add(registrationWeekKey);
      executiveWeekKeys.add(registrationWeekKey);
    }
    if (registrationMonthKey) {
      registrationMonthKeys.add(registrationMonthKey);
      executiveMonthKeys.add(registrationMonthKey);
    }
    if (firstInvitationPublishedDateKey) executiveDayKeys.add(firstInvitationPublishedDateKey);
    if (firstInvitationPublishedWeekKey) executiveWeekKeys.add(firstInvitationPublishedWeekKey);
    if (firstInvitationPublishedMonthKey) executiveMonthKeys.add(firstInvitationPublishedMonthKey);
    if (firstApprovedPaymentDateKey) executiveDayKeys.add(firstApprovedPaymentDateKey);
    if (firstApprovedPaymentWeekKey) executiveWeekKeys.add(firstApprovedPaymentWeekKey);
    if (firstApprovedPaymentMonthKey) executiveMonthKeys.add(firstApprovedPaymentMonthKey);
    if (cohortMonth) cohortMonths.add(cohortMonth);

    userIds.add(docItem.id);
  });

  await scanCollection(ANALYTICS_INVITATIONS_COLLECTION, async (docItem) => {
    const data = asObject(docItem.data());
    const firstPublishedDateKey = normalizeText(data.firstPublishedDateKey);
    const firstPublishedWeekKey = normalizeText(data.firstPublishedWeekKey);
    const firstPublishedMonthKey = normalizeText(data.firstPublishedMonthKey);
    const templateId = normalizeText(data.templateId) || UNKNOWN_TEMPLATE_ANALYTICS_ID;

    if (firstPublishedDateKey) {
      publishedDayKeys.add(firstPublishedDateKey);
      executiveDayKeys.add(firstPublishedDateKey);
    }
    if (firstPublishedWeekKey) {
      publishedWeekKeys.add(firstPublishedWeekKey);
      executiveWeekKeys.add(firstPublishedWeekKey);
    }
    if (firstPublishedMonthKey) {
      publishedMonthKeys.add(firstPublishedMonthKey);
      executiveMonthKeys.add(firstPublishedMonthKey);
    }
    if (templateId) templateIds.add(templateId);
    invitationIds.add(docItem.id);
  });

  await scanCollection(ANALYTICS_EVENTS_COLLECTION, async (docItem) => {
    const data = asObject(docItem.data());
    if (normalizeText(data.eventName) !== "pago_aprobado") return;

    const businessDateKey = normalizeText(data.businessDateKey);
    const businessWeekKey = normalizeText(data.businessWeekKey);
    const businessMonthKey = normalizeText(data.businessMonthKey);

    if (businessDateKey) executiveDayKeys.add(businessDateKey);
    if (businessWeekKey) executiveWeekKeys.add(businessWeekKey);
    if (businessMonthKey) executiveMonthKeys.add(businessMonthKey);
  });

  for (const userId of Array.from(userIds).sort()) {
    await recomputeUserLifetimeCounters(userId);
  }

  for (const invitacionId of Array.from(invitationIds).sort()) {
    await recomputeInvitationPaymentCounters(invitacionId);
  }

  for (const periodKey of Array.from(registrationDayKeys).sort()) {
    await recomputeRegistrationAggregate("day", periodKey);
  }
  for (const periodKey of Array.from(registrationWeekKeys).sort()) {
    await recomputeRegistrationAggregate("week", periodKey);
  }
  for (const periodKey of Array.from(registrationMonthKeys).sort()) {
    await recomputeRegistrationAggregate("month", periodKey);
  }

  for (const periodKey of Array.from(publishedDayKeys).sort()) {
    await recomputePublishedAggregate("day", periodKey);
  }
  for (const periodKey of Array.from(publishedWeekKeys).sort()) {
    await recomputePublishedAggregate("week", periodKey);
  }
  for (const periodKey of Array.from(publishedMonthKeys).sort()) {
    await recomputePublishedAggregate("month", periodKey);
  }

  for (const periodKey of Array.from(executiveDayKeys).sort()) {
    await recomputeExecutivePeriodAggregate("day", periodKey);
  }
  for (const periodKey of Array.from(executiveWeekKeys).sort()) {
    await recomputeExecutivePeriodAggregate("week", periodKey);
  }
  for (const periodKey of Array.from(executiveMonthKeys).sort()) {
    await recomputeExecutivePeriodAggregate("month", periodKey);
  }

  for (const cohortMonth of Array.from(cohortMonths).sort()) {
    await recomputeCohortAggregate(cohortMonth);
  }

  for (const templateId of Array.from(templateIds).sort()) {
    await recomputeTemplateAggregate(templateId);
  }
}

async function executeBusinessAnalyticsRebuildJob(jobRef: FirebaseFirestore.DocumentReference): Promise<void> {
  const startedAt = new Date();
  const counters = {
    registro_usuario: 0,
    invitacion_creada: 0,
    invitacion_publicada: 0,
    pago_aprobado: 0,
    processedPendingEvents: 0,
    processedFailedEvents: 0,
  };

  logger.info("Reconstruccion de analytics iniciada", {
    startedAt: startedAt.toISOString(),
  });

  await updateRebuildJob({
    status: "running",
    stage: "clearing",
    startedAt: admin.firestore.Timestamp.fromDate(startedAt),
    finishedAt: null,
    error: null,
    counters,
    lastHeartbeatAt: admin.firestore.Timestamp.fromDate(startedAt),
    leaseUntil: createLeaseUntil(startedAt),
  });

  const heartbeat = async (stage: string): Promise<void> => {
    const now = new Date();
    await updateRebuildJob({
      status: "running",
      stage,
      counters,
      lastHeartbeatAt: admin.firestore.Timestamp.fromDate(now),
      leaseUntil: createLeaseUntil(now),
    });
  };

  try {
    await clearAnalyticsCollections();

    await heartbeat("seeding_registros");
    await scanCollection("usuarios", async (docItem) => {
      const data = asObject(docItem.data());
      const timestamp =
        toDate(data.createdAt) ||
        toDate(data.updatedAt);
      if (!timestamp) return;

      await queueAnalyticsEvent(
        {
          eventId: `registro_usuario:${docItem.id}`,
          eventName: "registro_usuario",
          timestamp,
          userId: docItem.id,
          metadata: {
            source: "usuarios-backfill",
          },
        },
        { processImmediately: false }
      );
      counters.registro_usuario += 1;

      if (counters.registro_usuario % REBUILD_JOB_HEARTBEAT_EVERY === 0) {
        await heartbeat("seeding_registros");
      }
    });

    await heartbeat("seeding_borradores");
    await scanCollection("borradores", async (docItem) => {
      const data = asObject(docItem.data());
      const userId = normalizeText(data.userId);
      const timestamp =
        toDate(data.creado) ||
        toDate(data.createdAt) ||
        toDate(data.ultimaEdicion);
      if (!userId || !timestamp) return;

      await queueAnalyticsEvent(
        {
          eventId: `invitacion_creada:${docItem.id}`,
          eventName: "invitacion_creada",
          timestamp,
          userId,
          invitacionId: docItem.id,
          templateId: normalizeText(data.plantillaId) || UNKNOWN_TEMPLATE_ANALYTICS_ID,
          metadata: {
            source: "borradores-backfill",
            templateName: normalizeText(data.nombre),
          },
        },
        { processImmediately: false }
      );
      counters.invitacion_creada += 1;

      if (counters.invitacion_creada % REBUILD_JOB_HEARTBEAT_EVERY === 0) {
        await heartbeat("seeding_borradores");
      }
    });

    await heartbeat("seeding_publicadas");
    await scanCollection("publicadas", async (docItem) => {
      const data = asObject(docItem.data());
      const userId = normalizeText(data.userId);
      const publicSlug = docItem.id;
      const invitacionId =
        normalizeText(data.borradorSlug) ||
        normalizeText(data.slugOriginal) ||
        publicSlug;
      const timestamp =
        toDate(data.publicadaAt) ||
        toDate(data.publicadaEn);
      if (!userId || !invitacionId || !timestamp) return;

      await queueAnalyticsEvent(
        {
          eventId: `invitacion_publicada:${invitacionId}`,
          eventName: "invitacion_publicada",
          timestamp,
          userId,
          invitacionId,
          templateId: normalizeText(data.plantillaId) || UNKNOWN_TEMPLATE_ANALYTICS_ID,
          metadata: {
            source: "publicadas-backfill",
            publicSlug,
            firstPublishedAt: timestamp.toISOString(),
            templateName: normalizeText(data.nombre),
          },
        },
        { processImmediately: false }
      );
      counters.invitacion_publicada += 1;

      if (counters.invitacion_publicada % REBUILD_JOB_HEARTBEAT_EVERY === 0) {
        await heartbeat("seeding_publicadas");
      }
    });

    await heartbeat("seeding_pagos");
    await scanCollection("publication_checkout_sessions", async (docItem) => {
      const data = asObject(docItem.data());
      const status = normalizeText(data.status);
      if (
        status !== "payment_approved" &&
        status !== "published" &&
        status !== "approved_slug_conflict"
      ) {
        return;
      }

      const userId = normalizeText(data.uid);
      const invitacionId = normalizeText(data.draftSlug);
      const paymentId =
        normalizeText(data.mpPaymentId) ||
        normalizeText(asObject(data.receipt).paymentId) ||
        normalizeText(docItem.id);
      const timestamp =
        toDate(asObject(data.receipt).approvedAt) ||
        toDate(data.updatedAt) ||
        toDate(data.createdAt);
      if (!userId || !paymentId || !timestamp) return;

      await queueAnalyticsEvent(
        {
          eventId: `pago_aprobado:${paymentId}`,
          eventName: "pago_aprobado",
          timestamp,
          userId,
          invitacionId: invitacionId || null,
          templateId: UNKNOWN_TEMPLATE_ANALYTICS_ID,
          metadata: {
            source: "publication-checkout-backfill",
            paymentId,
            publicSlug: normalizeText(data.publicSlug) || null,
            operation: normalizeText(data.operation) || null,
            amountArs: asCurrencyAmount(data.amountArs),
            amountBaseArs: asCurrencyAmount(data.amountBaseArs),
            discountAmountArs: asCurrencyAmount(data.discountAmountArs),
          },
        },
        { processImmediately: false }
      );
      counters.pago_aprobado += 1;

      if (counters.pago_aprobado % REBUILD_JOB_HEARTBEAT_EVERY === 0) {
        await heartbeat("seeding_pagos");
      }
    });

    await heartbeat("processing_pending_events");
    while (true) {
      const processed = await processPendingAnalyticsBatch("pending", 200);
      counters.processedPendingEvents += processed;
      await heartbeat("processing_pending_events");
      if (processed === 0) break;
    }

    await heartbeat("processing_failed_events");
    while (true) {
      const processed = await processPendingAnalyticsBatch("failed", 100);
      counters.processedFailedEvents += processed;
      await heartbeat("processing_failed_events");
      if (processed === 0) break;
    }

    await heartbeat("recomputing_rollups");
    await recomputeAllAnalyticsRollupsFromState();

    const finishedAt = new Date();
    await jobRef.set(
      {
        status: "succeeded",
        stage: "completed",
        counters,
        error: null,
        finishedAt: admin.firestore.Timestamp.fromDate(finishedAt),
        lastHeartbeatAt: admin.firestore.Timestamp.fromDate(finishedAt),
        leaseUntil: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    logger.info("Reconstruccion de analytics finalizada", {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      counters,
    });
  } catch (error) {
    const finishedAt = new Date();
    const errorMessage =
      error instanceof Error ? error.message : String(error || "analytics-rebuild-error");

    await jobRef.set(
      {
        status: "failed",
        stage: "failed",
        counters,
        error: errorMessage,
        finishedAt: admin.firestore.Timestamp.fromDate(finishedAt),
        lastHeartbeatAt: admin.firestore.Timestamp.fromDate(finishedAt),
        leaseUntil: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    logger.error("Reconstruccion de analytics fallida", {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      counters,
      error: errorMessage,
    });
    throw error;
  }
}

export const runBusinessAnalyticsRebuildJobsV1 = onSchedule(
  {
    region: SCHEDULE_REGION,
    cpu: "gcf_gen1",
    schedule: "every 1 minutes",
    memory: "1GiB",
    timeoutSeconds: 540,
  },
  async () => {
    const jobRef = getRebuildJobRef();
    const now = new Date();

    const acquired = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(jobRef);
      if (!snapshot.exists) return false;

      const data = asObject(snapshot.data());
      const status = normalizeText(data.status);
      const leaseUntil = toDate(data.leaseUntil);
      const leaseExpired = !leaseUntil || leaseUntil.getTime() <= now.getTime();

      if (status !== "queued" && !(status === "running" && leaseExpired)) {
        return false;
      }

      transaction.set(
        jobRef,
        {
          status: "running",
          stage: normalizeText(data.stage) || "starting",
          startedAt:
            data.startedAt || admin.firestore.Timestamp.fromDate(now),
          lastHeartbeatAt: admin.firestore.Timestamp.fromDate(now),
          leaseUntil: createLeaseUntil(now),
          error: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return true;
    });

    if (!acquired) {
      return;
    }

    await executeBusinessAnalyticsRebuildJob(jobRef);
  }
);

export const adminRebuildBusinessAnalyticsV1 = onCall(
  {
    region: SCHEDULE_REGION,
    cpu: "gcf_gen1",
    memory: "512MiB",
  },
  async (request: CallableRequest<Record<string, never>>) => {
    const superAdminUid = requireSuperAdmin(request);
    const jobRef = getRebuildJobRef();
    const now = new Date();
    const snapshot = await jobRef.get();
    const existing = asObject(snapshot.data());
    const existingStatus = normalizeText(existing.status);

    if (existingStatus === "queued" || existingStatus === "running") {
      return {
        ok: true,
        enqueued: false,
        status: existingStatus,
      };
    }

    await jobRef.set(
      {
        jobId: REBUILD_JOB_ID,
        type: "business_analytics_rebuild",
        status: "queued",
        stage: "queued",
        requestedByUid: superAdminUid,
        requestedAt: admin.firestore.Timestamp.fromDate(now),
        startedAt: null,
        finishedAt: null,
        lastHeartbeatAt: admin.firestore.Timestamp.fromDate(now),
        leaseUntil: null,
        error: null,
        counters: {
          registro_usuario: 0,
          invitacion_creada: 0,
          invitacion_publicada: 0,
          pago_aprobado: 0,
          processedPendingEvents: 0,
          processedFailedEvents: 0,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    logger.info("Reconstruccion de analytics encolada", {
      requestedBy: superAdminUid,
      requestedAt: now.toISOString(),
    });

    return {
      ok: true,
      enqueued: true,
      status: "queued",
      requestedAt: now.toISOString(),
    };
  }
);
