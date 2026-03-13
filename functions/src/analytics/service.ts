import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
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
const BUSINESS_TIMEZONE = "America/Argentina/Buenos_Aires";
const SCHEDULE_REGION = "us-central1";
const REBUILD_SCAN_PAGE_SIZE = 250;
const REBUILD_JOB_ID = "businessAnalyticsRebuild";
const REBUILD_JOB_HEARTBEAT_EVERY = 100;
const REBUILD_JOB_LEASE_MS = 15 * 60 * 1000;
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
]);

type AnalyticsEventName =
  | "registro_usuario"
  | "invitacion_creada"
  | "invitacion_publicada";

type JsonMap = Record<string, unknown>;

type PeriodType = "day" | "week" | "month";

type PeriodKeys = {
  dateKey: string;
  weekKey: string;
  monthKey: string;
  cohortMonth: string;
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

function buildAggregateDocDefaults(periodKey: string, periodType: PeriodType): JsonMap {
  return {
    periodKey,
    periodType,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function getRebuildJobRef() {
  return db.collection(ANALYTICS_JOBS_COLLECTION).doc(REBUILD_JOB_ID);
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
  const templateTotals = new Map<string, { count: number; templateName: string | null }>();

  invitations.forEach((invitationData) => {
    const userId = normalizeText(invitationData.ownerUserId);
    if (userId) {
      userTotals.set(userId, (userTotals.get(userId) || 0) + 1);
    }

    const templateId = normalizeText(invitationData.templateId) || "__unknown__";
    const templateName = normalizeText(invitationData.templateName) || null;
    const current = templateTotals.get(templateId) || { count: 0, templateName };
    current.count += 1;
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
  const snapshot = await db
    .collection(ANALYTICS_INVITATIONS_COLLECTION)
    .where(fieldPath, "==", periodKey)
    .get();

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
        },
      },
    },
    { merge: true }
  );

  await upsertPublishedDimensions(periodType, periodKey, invitations);
}

async function recomputeUserLifetimeCounters(userId: string): Promise<void> {
  const safeUserId = normalizeText(userId);
  if (!safeUserId) return;

  const snapshot = await db
    .collection(ANALYTICS_INVITATIONS_COLLECTION)
    .where("ownerUserId", "==", safeUserId)
    .get();

  let publishedInvitationsCount = 0;
  snapshot.docs.forEach((docItem) => {
    if (toDate(docItem.data().firstPublishedAt)) {
      publishedInvitationsCount += 1;
    }
  });

  await db.collection(ANALYTICS_USERS_COLLECTION).doc(safeUserId).set(
    {
      userId: safeUserId,
      createdInvitationsCount: snapshot.size,
      publishedInvitationsCount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function recomputeTemplateAggregate(templateId: string): Promise<void> {
  const safeTemplateId = normalizeText(templateId) || "__unknown__";
  const snapshot = await db
    .collection(ANALYTICS_INVITATIONS_COLLECTION)
    .where("templateId", "==", safeTemplateId)
    .get();

  let publishedInvitations = 0;
  let templateName = "";
  snapshot.docs.forEach((docItem) => {
    const data = asObject(docItem.data());
    if (!templateName) {
      templateName = normalizeText(data.templateName);
    }
    if (toDate(data.firstPublishedAt)) {
      publishedInvitations += 1;
    }
  });

  await db.collection(ANALYTICS_TEMPLATES_COLLECTION).doc(safeTemplateId).set(
    {
      templateId: safeTemplateId,
      templateName: templateName || null,
      createdInvitations: snapshot.size,
      publishedInvitations,
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

  const [usersSnap, invitationsSnap] = await Promise.all([
    db
      .collection(ANALYTICS_USERS_COLLECTION)
      .where("registrationCohortMonth", "==", safeCohortMonth)
      .get(),
    db
      .collection(ANALYTICS_INVITATIONS_COLLECTION)
      .where("ownerRegistrationCohortMonth", "==", safeCohortMonth)
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

  const usersCount = users.length;
  const activationCreatedUsers = users.filter((item) => item.activationCreatedReached === true).length;
  const activationPublishedUsers = users.filter((item) => item.activationPublishedReached === true).length;
  const createValues = users
    .map((item) => asNumber(item.timeToFirstCreateSeconds, Number.NaN))
    .filter((value) => Number.isFinite(value));
  const publishValues = users
    .map((item) => asNumber(item.timeToFirstPublishSeconds, Number.NaN))
    .filter((value) => Number.isFinite(value));
  const createSummary = buildDurationSummary(createValues, usersCount);
  const publishSummary = buildDurationSummary(publishValues, usersCount);
  const publishedInvitations = invitations.filter((item) => toDate(item.firstPublishedAt)).length;
  const cohortRef = db.collection(ANALYTICS_COHORTS_COLLECTION).doc(safeCohortMonth);

  await cohortRef.set(
    {
      cohortMonth: safeCohortMonth,
      users: usersCount,
      activationCreatedUsers,
      activationPublishedUsers,
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
    invitacionesPublicadas: number;
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
        invitacionesPublicadas: 0,
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
    const firstCreateMonthKey = firstCreateDate ? getPeriodKeys(firstCreateDate).monthKey : "";
    const firstPublishMonthKey = firstPublishDate ? getPeriodKeys(firstPublishDate).monthKey : "";
    const createDiff = firstCreateMonthKey ? getMonthDiff(safeCohortMonth, firstCreateMonthKey) : null;
    const publishDiff = firstPublishMonthKey ? getMonthDiff(safeCohortMonth, firstPublishMonthKey) : null;

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
      const duration = asNumber(item.timeToFirstPublishSeconds, Number.NaN);
      if (Number.isFinite(duration)) {
        bucket.publishValues.push(duration);
      }
      maxPeriodIndex = Math.max(maxPeriodIndex, publishDiff);
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

  let cumulativeCreated = 0;
  let cumulativePublished = 0;
  let batch = db.batch();
  let operations = 0;

  for (let periodIndex = 0; periodIndex <= maxPeriodIndex; periodIndex += 1) {
    const current = ensurePeriod(periodIndex);
    cumulativeCreated += current.newActivatedCreatedUsers;
    cumulativePublished += current.newActivatedPublishedUsers;
    const createPeriodSummary = buildDurationSummary(current.createValues, current.newActivatedCreatedUsers);
    const publishPeriodSummary = buildDurationSummary(current.publishValues, current.newActivatedPublishedUsers);

    batch.set(
      cohortRef.collection("periods").doc(String(periodIndex).padStart(4, "0")),
      {
        periodIndex,
        periodMonthKey: addMonthsToMonthKey(safeCohortMonth, periodIndex),
        newActivatedCreatedUsers: current.newActivatedCreatedUsers,
        newActivatedPublishedUsers: current.newActivatedPublishedUsers,
        cumulativeActivatedCreatedUsers: cumulativeCreated,
        cumulativeActivatedPublishedUsers: cumulativePublished,
        cumulativeActivationCreatedRate: usersCount > 0 ? cumulativeCreated / usersCount : 0,
        cumulativeActivationPublishedRate: usersCount > 0 ? cumulativePublished / usersCount : 0,
        invitacionesPublicadas: current.invitacionesPublicadas,
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

    transaction.set(
      userRef,
      {
        userId,
        registeredAt: admin.firestore.Timestamp.fromDate(registeredAt),
        registrationDateKey: periodKeys.dateKey,
        registrationWeekKey: periodKeys.weekKey,
        registrationMonthKey: periodKeys.monthKey,
        registrationCohortMonth: periodKeys.cohortMonth,
        activationCreatedReached: Boolean(firstInvitationCreatedAt),
        activationPublishedReached: Boolean(firstInvitationPublishedAt),
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
    recomputeCohortAggregate(periodKeys.cohortMonth),
  ]);
}

async function processInvitationCreatedEvent(eventData: JsonMap): Promise<void> {
  const userId = normalizeText(eventData.userId);
  const invitacionId = normalizeText(eventData.invitacionId);
  const templateId = normalizeText(eventData.templateId) || "__unknown__";
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
    const safeTemplateId = templateId || normalizeText(invitationData.templateId) || "__unknown__";

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
  const templateId = normalizeText(eventData.templateId) || "__unknown__";
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
    const safeTemplateId = templateId || normalizeText(invitationData.templateId) || "__unknown__";

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
    registrationCohortMonth ? recomputeCohortAggregate(registrationCohortMonth) : Promise.resolve(),
  ];

  if (previousPublishedDateKey && previousPublishedDateKey !== publishedKeys.dateKey) {
    recalculateTasks.push(recomputePublishedAggregate("day", previousPublishedDateKey));
  }
  if (previousPublishedWeekKey && previousPublishedWeekKey !== publishedKeys.weekKey) {
    recalculateTasks.push(recomputePublishedAggregate("week", previousPublishedWeekKey));
  }
  if (previousPublishedMonthKey && previousPublishedMonthKey !== publishedKeys.monthKey) {
    recalculateTasks.push(recomputePublishedAggregate("month", previousPublishedMonthKey));
  }

  await Promise.all(recalculateTasks);
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

export async function recordBusinessAnalyticsEvent(input: QueueAnalyticsEventInput): Promise<void> {
  await queueAnalyticsEvent(input);
}

function serializeAggregateDoc(periodKey: string, data: JsonMap): JsonMap {
  const executive = asObject(data.executive);
  const activation = asObject(executive.activation);
  const ttfv = asObject(executive.ttfv);
  const create = asObject(ttfv.create);
  const publish = asObject(ttfv.publish);
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
      publishedInvitations: {
        count: asNumber(publishedInvitations.count),
      },
    },
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
    cumulativeActivatedCreatedUsers: asNumber(data.cumulativeActivatedCreatedUsers),
    cumulativeActivatedPublishedUsers: asNumber(data.cumulativeActivatedPublishedUsers),
    cumulativeActivationCreatedRate: asNumber(data.cumulativeActivationCreatedRate),
    cumulativeActivationPublishedRate: asNumber(data.cumulativeActivationPublishedRate),
    invitacionesPublicadas: asNumber(data.invitacionesPublicadas),
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
      updatedAt: toIsoString(data.updatedAt),
    };
  });
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
      previousValue: previousPublishedCount,
      delta: currentPublishedCount - previousPublishedCount,
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

export const getBusinessAnalyticsOverviewV1 = onCall(
  {
    region: SCHEDULE_REGION,
    memory: "512MiB",
  },
  async (request: CallableRequest<Record<string, never>>) => {
    requireSuperAdmin(request);

    const [daily, weekly, monthly, cohorts, templates, rebuildJob] = await Promise.all([
      safeOverviewRead("daily", () => readSeries(ANALYTICS_DAILY_COLLECTION, 30), [] as JsonMap[]),
      safeOverviewRead("weekly", () => readSeries(ANALYTICS_WEEKLY_COLLECTION, 12), [] as JsonMap[]),
      safeOverviewRead("monthly", () => readSeries(ANALYTICS_MONTHLY_COLLECTION, 12), [] as JsonMap[]),
      safeOverviewRead("cohorts", () => readCohorts(12), [] as JsonMap[]),
      safeOverviewRead("templates", () => readTopTemplates(8), [] as JsonMap[]),
      safeOverviewRead("rebuildJob", () => readRebuildJobSummary(), null as JsonMap | null),
    ]);

    return {
      ok: true,
      timezone: BUSINESS_TIMEZONE,
      fetchedAt: new Date().toISOString(),
      partialPeriods: getCurrentPeriodKeys(),
      metricCatalog: BUSINESS_METRIC_CATALOG,
      summary: buildSummary(monthly),
      series: {
        daily,
        weekly,
        monthly,
      },
      rebuildJob,
      cohorts,
      templates: {
        topPublished: templates,
      },
    };
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

async function executeBusinessAnalyticsRebuildJob(jobRef: FirebaseFirestore.DocumentReference): Promise<void> {
  const startedAt = new Date();
  const counters = {
    registro_usuario: 0,
    invitacion_creada: 0,
    invitacion_publicada: 0,
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
          templateId: normalizeText(data.plantillaId) || "__unknown__",
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
          templateId: normalizeText(data.plantillaId) || "__unknown__",
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
