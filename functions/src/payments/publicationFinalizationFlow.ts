import {
  computePublicationExpirationDate,
  resolvePublicationTimelineFromData,
} from "./publicationLifecycle";
import { planPublicationFinalizationOperations } from "./publicationOperationPlanning";
import { executePlannedPublicationFinalization } from "./publicationOperationExecution";

type UnknownRecord = Record<string, unknown>;

type PublicationSummary = {
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

type PublicationFinalizationResult = {
  slug: string;
  historyId: string | null;
  draftSlug: string | null;
  finalized: boolean;
  alreadyMissing: boolean;
};

type RsvpDocLike = {
  data(): UnknownRecord | undefined;
};

type RsvpCollectionLike = {
  get(): Promise<{
    docs: RsvpDocLike[];
  }>;
};

type PublicationRefLike = {
  collection(name: string): RsvpCollectionLike;
};

type PublicationSnapshotLike = {
  exists: boolean;
  createTime?: unknown;
  ref: PublicationRefLike;
  data(): UnknownRecord | undefined;
};

type MergeSetRef = {
  set(data: UnknownRecord, options: { merge: true }): Promise<unknown>;
};

const PUBLICADAS_COLLECTION = "publicadas";

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAttendanceMetric(value: unknown): "yes" | "no" | "unknown" {
  const raw = getString(value).toLowerCase();
  if (!raw) return "unknown";
  if (["yes", "si", "s\u00ed", "true", "1"].includes(raw)) return "yes";
  if (["no", "false", "0"].includes(raw)) return "no";
  return "unknown";
}

function normalizeBooleanMetric(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const raw = getString(value).toLowerCase();
  if (!raw) return false;
  return ["yes", "si", "s\u00ed", "true", "1"].includes(raw);
}

function normalizePositiveIntMetric(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

function normalizeMenuMetricId(value: unknown): string | null {
  const raw = getString(value).toLowerCase();
  if (!raw) return null;
  if (raw.includes("vegano") || raw === "vegan") return "vegan";
  if (raw.includes("vegetar")) return "vegetarian";
  if (raw.includes("tacc") || raw.includes("celia")) return "celiac";
  if (raw === "standard" || raw === "clasico" || raw === "cl\u00e1sico") {
    return "standard";
  }
  return raw;
}

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as UnknownRecord;
}

function createEmptyPublicationSummary(): PublicationSummary {
  return {
    totalResponses: 0,
    confirmedResponses: 0,
    declinedResponses: 0,
    confirmedGuests: 0,
    vegetarianCount: 0,
    veganCount: 0,
    childrenCount: 0,
    dietaryRestrictionsCount: 0,
    transportCount: 0,
  };
}

function buildPublicationSummary(rows: UnknownRecord[]): PublicationSummary {
  const summary = createEmptyPublicationSummary();

  rows.forEach((row) => {
    summary.totalResponses += 1;

    const answers = asRecord(row.answers);
    const metrics = asRecord(row.metrics);

    const legacyAttendance =
      typeof row.confirma === "boolean"
        ? row.confirma
          ? "yes"
          : "no"
        : row.confirmado === true
          ? "yes"
          : row.confirmado === false
            ? "no"
            : row.asistencia;

    const attendance = normalizeAttendanceMetric(
      metrics.attendance ?? answers.attendance ?? legacyAttendance
    );

    if (attendance === "yes") summary.confirmedResponses += 1;
    if (attendance === "no") summary.declinedResponses += 1;

    const partySize = normalizePositiveIntMetric(
      answers.party_size ?? row.cantidad ?? row.invitados ?? row.asistentes
    );
    const confirmedGuests =
      normalizePositiveIntMetric(metrics.confirmedGuests) ||
      (attendance === "yes" ? partySize || 1 : 0);
    summary.confirmedGuests += confirmedGuests;

    const menuType = normalizeMenuMetricId(
      metrics.menuTypeId ?? answers.menu_type ?? row.menu_type
    );
    if (menuType === "vegetarian") summary.vegetarianCount += 1;
    if (menuType === "vegan") summary.veganCount += 1;

    const childrenCount = normalizePositiveIntMetric(
      metrics.childrenCount ?? answers.children_count ?? row.children_count ?? row.ninos
    );
    summary.childrenCount += childrenCount;

    const hasDietaryRestrictions =
      typeof metrics.hasDietaryRestrictions === "boolean"
        ? metrics.hasDietaryRestrictions
        : Boolean(getString(answers.dietary_notes ?? row.dietary_notes ?? row.alergias));
    if (hasDietaryRestrictions) summary.dietaryRestrictionsCount += 1;

    const needsTransport =
      typeof metrics.needsTransport === "boolean"
        ? metrics.needsTransport
        : normalizeBooleanMetric(
            answers.needs_transport ?? row.needs_transport ?? row.transporte
          );
    if (needsTransport) summary.transportCount += 1;
  });

  return summary;
}

function resolvePublicationFinalizationDates(params: {
  publicationData: UnknownRecord;
  publicationSnap: PublicationSnapshotLike;
  now: Date;
}) {
  const { publicationData, publicationSnap, now } = params;
  const timeline = resolvePublicationTimelineFromData(publicationData, {
    fallbackPublishedAt: publicationSnap.createTime ?? now,
    fallbackLastPublishedAt: publicationSnap.createTime ?? now,
    includeLifecycleFirstPublishedAt: true,
    includeLifecycleExpiration: true,
    includeLifecycleLastPublishedAt: true,
  });
  const firstPublishedAt = timeline.firstPublishedAt || now;
  const effectiveExpirationDate =
    timeline.effectiveExpirationDate || computePublicationExpirationDate(firstPublishedAt);
  const lastPublishedAt = timeline.lastPublishedAt || firstPublishedAt;

  return {
    firstPublishedAt,
    effectiveExpirationDate,
    lastPublishedAt,
  };
}

export async function finalizePublicationSnapshotFlow(params: {
  slug: string;
  publicationSnap: PublicationSnapshotLike;
  reason: string;
  draftSlug: string;
  getHistoryRef(historyId: string): MergeSetRef;
  getDraftRef(draftSlug: string): MergeSetRef;
  reservationRef: MergeSetRef;
  createHistoryCreatedAtValue(): unknown;
  createHistoryUpdatedAtValue(): unknown;
  createDraftUpdatedAtValue(): unknown;
  createReservationUpdatedAtValue(): unknown;
  deleteStoragePrefix(prefix: string): Promise<unknown>;
  recursiveDelete(ref: unknown): Promise<unknown>;
  warn(message: string, context: Record<string, unknown>): void;
  info(message: string, context: Record<string, unknown>): void;
}): Promise<PublicationFinalizationResult> {
  const { slug, publicationSnap, reason, draftSlug } = params;

  if (!publicationSnap.exists) {
    return {
      slug,
      historyId: null,
      draftSlug: null,
      finalized: false,
      alreadyMissing: true,
    };
  }

  const publicationData = asRecord(publicationSnap.data());
  const now = new Date();
  const dates = resolvePublicationFinalizationDates({
    publicationData,
    publicationSnap,
    now,
  });
  const rsvpSnap = await publicationSnap.ref.collection("rsvps").get();
  const summary = buildPublicationSummary(
    rsvpSnap.docs.map((item) => asRecord(item.data()))
  );
  const plannedFinalization = planPublicationFinalizationOperations({
    slug,
    publicationData,
    draftSlug,
    dates: {
      firstPublishedAt: dates.firstPublishedAt,
      effectiveExpirationDate: dates.effectiveExpirationDate,
      lastPublishedAt: dates.lastPublishedAt,
    },
    summary,
    finalizedAt: now,
    reason,
    historySourceCollection: PUBLICADAS_COLLECTION,
    historyCreatedAtValue: params.createHistoryCreatedAtValue(),
    historyUpdatedAtValue: params.createHistoryUpdatedAtValue(),
    draftUpdatedAtValue: params.createDraftUpdatedAtValue(),
    reservationUpdatedAtValue: params.createReservationUpdatedAtValue(),
  });

  await executePlannedPublicationFinalization({
    plan: plannedFinalization,
    historyRef: params.getHistoryRef(plannedFinalization.historyId),
    publicationRef: publicationSnap.ref,
    draftRef:
      draftSlug && plannedFinalization.draftFinalizeWrite
        ? params.getDraftRef(draftSlug)
        : null,
    reservationRef: params.reservationRef,
    deleteStoragePrefix: params.deleteStoragePrefix,
    recursiveDelete: params.recursiveDelete,
    warn: params.warn,
  });

  params.info("Publicacion finalizada", plannedFinalization.logContext);

  return plannedFinalization.result;
}
