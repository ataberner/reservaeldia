import {
  collection,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase.js";
import {
  resolvePublicationPreviewReadModelsByItemKey,
  resolvePublicationEditableDraftSlug,
} from "./preview.js";
import {
  getPublicationStatus,
  resolvePublicationDates,
  toMs,
} from "./state.js";

function normalizePositiveLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.max(1, Math.round(parsed));
}

function isPermissionDeniedError(error) {
  const code = String(error?.code || "").toLowerCase();
  return code === "permission-denied" || code.includes("permission-denied");
}

function normalizeRecordData(record) {
  return record?.data && typeof record.data === "object" ? record.data : {};
}

function normalizeRecordId(record) {
  if (typeof record?.id === "string") return record.id.trim();
  return String(record?.id || "").trim();
}

function normalizeRecordSource(record) {
  return record?.source === "history" ? "history" : "active";
}

function createSourceRecord(docItem, source) {
  return {
    id: docItem.id,
    source,
    data: docItem.data() || {},
  };
}

async function enrichRecords(records, enricher) {
  if (typeof enricher !== "function") return records;

  const nextRecords = await Promise.all(
    records.map(async (record) => {
      const enriched = await enricher(record);
      if (!enriched || typeof enriched !== "object") return record;
      return enriched;
    })
  );

  return nextRecords;
}

function createActiveQuery(userUid, limitValue) {
  const constraints = [
    where("userId", "==", userUid),
    orderBy("publicadaEn", "desc"),
  ];

  if (limitValue > 0) {
    constraints.push(firestoreLimit(limitValue));
  }

  return query(collection(db, "publicadas"), ...constraints);
}

function createHistoryQuery(userUid, limitValue) {
  const constraints = [where("userId", "==", userUid)];

  if (limitValue > 0) {
    constraints.push(firestoreLimit(limitValue));
  }

  return query(collection(db, "publicadas_historial"), ...constraints);
}

function buildActiveDashboardPublicationItem(record, nowMs, previewReadModel = null) {
  const id = normalizeRecordId(record);
  const data = normalizeRecordData(record);
  const status = getPublicationStatus(data, nowMs);
  const dates = resolvePublicationDates(data);
  const sortMs =
    toMs(data.enPapeleraAt) ||
    toMs(data.ultimaPublicacionEn) ||
    toMs(data.updatedAt) ||
    toMs(data.createdAt) ||
    toMs(dates.publishedAt);

  return {
    id,
    source: "active",
    publicSlug: id,
    nombre: data.nombre || data.slug || id,
    portada: previewReadModel?.primarySrc || "",
    previewCandidates: Array.isArray(previewReadModel?.candidates)
      ? previewReadModel.candidates
      : [],
    url: status.isActive ? String(data.urlPublica || "").trim() : "",
    borradorSlug: resolvePublicationEditableDraftSlug(data),
    stateKey: status.state,
    statusLabel: status.label,
    isActive: status.isActive,
    isPaused: status.isPaused,
    isTrashed: status.isTrashed,
    isFinalized: status.isFinalized,
    publishedAt: dates.publishedAt,
    expiresAt: dates.expiresAt,
    pausedAt: dates.pausedAt,
    trashedAt: dates.trashedAt,
    finalizadaEn: null,
    sortMs,
    raw: data,
  };
}

function buildHistoryDashboardPublicationItem(
  record,
  nowMs,
  previewReadModel = null
) {
  const data = normalizeRecordData(record);
  const status = getPublicationStatus(
    {
      ...data,
      source: "history",
    },
    nowMs
  );
  const dates = resolvePublicationDates(data);
  const sortMs =
    toMs(data.finalizadaEn) || toMs(data.updatedAt) || toMs(data.createdAt) || 0;

  return {
    id: normalizeRecordId(record),
    source: "history",
    publicSlug:
      (typeof data.sourceSlug === "string" && data.sourceSlug.trim()) ||
      (typeof data.slug === "string" && data.slug.trim()) ||
      "",
    nombre: data.nombre || data.slug || "(sin nombre)",
    portada: previewReadModel?.primarySrc || "",
    previewCandidates: Array.isArray(previewReadModel?.candidates)
      ? previewReadModel.candidates
      : [],
    url: "",
    borradorSlug: resolvePublicationEditableDraftSlug(data),
    stateKey: status.state,
    statusLabel: status.label,
    isActive: status.isActive,
    isPaused: status.isPaused,
    isTrashed: status.isTrashed,
    isFinalized: status.isFinalized,
    publishedAt: dates.publishedAt || null,
    expiresAt: dates.expiresAt || null,
    pausedAt: null,
    trashedAt: null,
    finalizadaEn: data.finalizadaEn || null,
    sortMs,
    raw: data,
  };
}

export async function loadUserPublicationSourceRecords({
  userUid,
  limit,
  enrichActiveRecord,
  enrichHistoryRecord,
  loadActiveSnapshot,
  loadHistorySnapshot,
} = {}) {
  const safeUserUid = typeof userUid === "string" ? userUid.trim() : "";
  if (!safeUserUid) return [];

  const safeLimit = normalizePositiveLimit(limit);
  const activeLoader =
    typeof loadActiveSnapshot === "function"
      ? loadActiveSnapshot
      : () => getDocs(createActiveQuery(safeUserUid, safeLimit));
  const historyLoader =
    typeof loadHistorySnapshot === "function"
      ? loadHistorySnapshot
      : () => getDocs(createHistoryQuery(safeUserUid, safeLimit));

  const [activeResult, historyResult] = await Promise.allSettled([
    activeLoader(),
    historyLoader(),
  ]);

  if (activeResult.status !== "fulfilled") {
    throw activeResult.reason;
  }

  if (
    historyResult.status === "rejected" &&
    !isPermissionDeniedError(historyResult.reason)
  ) {
    throw historyResult.reason;
  }

  const activeRecords = await enrichRecords(
    activeResult.value?.docs?.map((docItem) => createSourceRecord(docItem, "active")) || [],
    enrichActiveRecord
  );
  const historyRecords = await enrichRecords(
    (historyResult.status === "fulfilled"
      ? historyResult.value?.docs || []
      : []
    ).map((docItem) => createSourceRecord(docItem, "history")),
    enrichHistoryRecord
  );

  return [...activeRecords, ...historyRecords];
}

export async function assembleDashboardPublicationItems(
  records,
  { limit, nowMs = Date.now(), readDraftBySlug } = {}
) {
  const safeRecords = Array.isArray(records) ? records : [];
  if (!safeRecords.length) return [];

  const previewReadModelByItemKey =
    await resolvePublicationPreviewReadModelsByItemKey(safeRecords, {
      getItemData: (record) => normalizeRecordData(record),
      getItemId: (record) => normalizeRecordId(record),
      getItemSource: (record) => normalizeRecordSource(record),
      readDraftBySlug,
    });

  const items = safeRecords
    .map((record) => {
      const source = normalizeRecordSource(record);
      const itemKey = `${source}:${normalizeRecordId(record)}`;
      const previewReadModel = previewReadModelByItemKey.get(itemKey) || null;

      if (source === "history") {
        return buildHistoryDashboardPublicationItem(record, nowMs, previewReadModel);
      }

      return buildActiveDashboardPublicationItem(record, nowMs, previewReadModel);
    })
    .filter((item) => !(item.source === "active" && item.isTrashed))
    .sort((left, right) => right.sortMs - left.sortMs);

  const safeLimit = normalizePositiveLimit(limit);
  if (safeLimit > 0) {
    return items.slice(0, safeLimit);
  }

  return items;
}
