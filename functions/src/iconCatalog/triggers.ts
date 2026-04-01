import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import {
  ICON_CATALOG_COLLECTION,
  ICON_CATALOG_DAILY_RECONCILE_CRON,
  ICON_CATALOG_DAILY_USAGE_SCAN_CRON,
  ICON_CATALOG_SCHEMA_VERSION,
  ICON_CATALOG_TRIGGER_OPTIONS,
  ICONOS_V2_ENABLED,
} from "./config";
import { writeIconAuditEvent } from "./audit";
import { mergeLegacyMetadata, normalizeIconMetadata } from "./metadata";
import {
  activeIconCollection,
  db,
  findIconIdsByStoragePaths,
  findIconIdsByUrls,
  moveIconToArchived,
} from "./repository";
import { extractIconReferenceCandidates } from "./usage";
import type { IconUsageMap } from "./types";

function normalizeString(value: unknown): string {
  return String(value || "").trim();
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toDateKey(date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

let processIconDocumentV2Promise: Promise<typeof import("./processor")["processIconDocumentV2"]> | null = null;

async function loadProcessIconDocumentV2() {
  if (!processIconDocumentV2Promise) {
    // Lazy-loaded to reduce Functions startup cost during emulator discovery/cold start.
    processIconDocumentV2Promise = import("./processor").then(
      (module) => module.processIconDocumentV2
    );
  }
  return processIconDocumentV2Promise;
}

async function scanCollectionForCandidates(collectionName: string): Promise<{
  scanned: number;
  candidates: Array<{ raw: string; storagePath: string | null; url: string | null }>;
}> {
  const candidates: Array<{ raw: string; storagePath: string | null; url: string | null }> = [];
  const pageSize = 250;
  let scanned = 0;
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  while (true) {
    let query = db()
      .collection(collectionName)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;

    for (const docItem of page.docs) {
      scanned += 1;
      const data = asObject(docItem.data());
      const objetos = Array.isArray(data.objetos) ? data.objetos : [];
      const extracted = extractIconReferenceCandidates(objetos);
      candidates.push(...extracted);
    }

    cursor = page.docs[page.docs.length - 1] || null;
    if (page.docs.length < pageSize) break;
  }

  return { scanned, candidates };
}

async function resolveUsageTotalsFromCandidates(
  candidates: Array<{ raw: string; storagePath: string | null; url: string | null }>
): Promise<{ totals: IconUsageMap; unresolved: number }> {
  if (!candidates.length) {
    return { totals: {}, unresolved: 0 };
  }

  const storagePaths = Array.from(
    new Set(candidates.map((item) => normalizeString(item.storagePath)).filter(Boolean))
  );
  const urls = Array.from(
    new Set(candidates.map((item) => normalizeString(item.url)).filter(Boolean))
  );

  const [byStoragePath, byUrl] = await Promise.all([
    findIconIdsByStoragePaths(storagePaths),
    findIconIdsByUrls(urls),
  ]);

  const totals: IconUsageMap = {};
  let unresolved = 0;

  for (const candidate of candidates) {
    const byPath = candidate.storagePath
      ? byStoragePath.get(candidate.storagePath)
      : null;
    const byUrlId = candidate.url ? byUrl.get(candidate.url) : null;
    const iconId = byPath || byUrlId || null;
    if (!iconId) {
      unresolved += 1;
      continue;
    }
    totals[iconId] = (totals[iconId] || 0) + 1;
  }

  return { totals, unresolved };
}

async function reconcileActiveIconStatsWithTotals(params: {
  totals: IconUsageMap;
  now: Date;
}): Promise<void> {
  const allIconsSnap = await activeIconCollection().get();
  const nowTimestamp = admin.firestore.Timestamp.fromDate(params.now);
  const writes: Array<Promise<FirebaseFirestore.WriteResult>> = [];

  for (const docItem of allIconsSnap.docs) {
    const iconId = docItem.id;
    const total = Number(params.totals[iconId] || 0);
    const currentData = asObject(docItem.data());
    const currentStats = asObject(currentData.stats);
    const current = Number(currentStats.usesCount || 0);
    if (current === total) continue;

    writes.push(
      docItem.ref.set(
        {
          "stats.usesCount": total,
          "audit.updatedAt": admin.firestore.FieldValue.serverTimestamp(),
          actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
          ...(total > 0 ? { "stats.lastUsedAt": nowTimestamp } : {}),
        },
        { merge: true }
      )
    );
  }

  for (let index = 0; index < writes.length; index += 400) {
    await Promise.all(writes.slice(index, index + 400));
  }
}

export const onIconCatalogDocWriteV2 = onDocumentWritten(
  {
    ...ICON_CATALOG_TRIGGER_OPTIONS,
    document: `${ICON_CATALOG_COLLECTION}/{iconId}`,
  },
  async (event) => {
    if (!ICONOS_V2_ENABLED) return;
    const iconId = normalizeString(event.params.iconId);
    if (!iconId) return;
    if (!event.data?.after.exists) return;

    const afterData = asObject(event.data.after.data());

    try {
      const processIconDocumentV2 = await loadProcessIconDocumentV2();
      const processed = await processIconDocumentV2({
        iconId,
        rawData: afterData,
        force: false,
        triggeredByUid: null,
      });

      if (processed.skip) return;
      if (Object.keys(processed.patch).length > 0) {
        await activeIconCollection().doc(iconId).set(processed.patch, { merge: true });
      }

      if (processed.shouldArchive) {
        await moveIconToArchived({
          iconId,
          reason: processed.archiveReason || "trigger-archive",
          uid: null,
        });
      }

      await writeIconAuditEvent({
        event: "onIconCatalogDocWriteV2",
        iconId,
        uid: null,
        payload: {
          skip: processed.skip,
          shouldArchive: processed.shouldArchive,
          archiveReason: processed.archiveReason,
        },
      });
    } catch (error) {
      logger.error("Error procesando trigger de iconos v2", {
        iconId,
        error: error instanceof Error ? error.message : String(error || ""),
      });
      await writeIconAuditEvent({
        event: "onIconCatalogDocWriteV2:error",
        iconId,
        uid: null,
        payload: {
          error: error instanceof Error ? error.message : String(error || ""),
        },
      });
    }
  }
);

export const dailyIconCatalogReconcileV2 = onSchedule(
  {
    ...ICON_CATALOG_TRIGGER_OPTIONS,
    schedule: ICON_CATALOG_DAILY_RECONCILE_CRON,
    timeZone: "UTC",
  },
  async () => {
    if (!ICONOS_V2_ENABLED) return;
    const snap = await activeIconCollection().get();
    let normalized = 0;
    let reprocessed = 0;

    for (const docItem of snap.docs) {
      const data = asObject(docItem.data());
      const normalizedMetadata = normalizeIconMetadata(data);
      const metadataPatch = mergeLegacyMetadata(data, normalizedMetadata);
      const patch: Record<string, unknown> = {};

      if (Number(data.schemaVersion || 0) < ICON_CATALOG_SCHEMA_VERSION) {
        patch.schemaVersion = ICON_CATALOG_SCHEMA_VERSION;
      }

      const currentPopular = data.popular === true;
      const currentPriority = Number.isFinite(Number(data.priority))
        ? Number(data.priority)
        : null;

      if (
        currentPopular !== normalizedMetadata.popular ||
        currentPriority !== normalizedMetadata.priority ||
        normalizeString(data.searchText) !== normalizedMetadata.searchText
      ) {
        Object.assign(patch, metadataPatch);
      }

      if (!data.validation || !data.hashSha256 || !data.storagePath) {
        const processIconDocumentV2 = await loadProcessIconDocumentV2();
        const processed = await processIconDocumentV2({
          iconId: docItem.id,
          rawData: data,
          force: false,
          triggeredByUid: null,
        });
        if (!processed.skip && Object.keys(processed.patch).length > 0) {
          Object.assign(patch, processed.patch);
          reprocessed += 1;
        }
        if (processed.shouldArchive) {
          await moveIconToArchived({
            iconId: docItem.id,
            reason: processed.archiveReason || "daily-reconcile-archive",
            uid: null,
          });
          continue;
        }
      }

      if (Object.keys(patch).length > 0) {
        await docItem.ref.set(
          {
            ...patch,
            actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
            "audit.updatedAt": admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        normalized += 1;
      }
    }

    await writeIconAuditEvent({
      event: "dailyIconCatalogReconcileV2",
      iconId: null,
      uid: null,
      payload: {
        scanned: snap.size,
        normalized,
        reprocessed,
      },
    });
  }
);

export const dailyIconUsageScanV2 = onSchedule(
  {
    ...ICON_CATALOG_TRIGGER_OPTIONS,
    schedule: ICON_CATALOG_DAILY_USAGE_SCAN_CRON,
    timeZone: "UTC",
  },
  async () => {
    if (!ICONOS_V2_ENABLED) return;

    const [publicadasScan, borradoresScan] = await Promise.all([
      scanCollectionForCandidates("publicadas"),
      scanCollectionForCandidates("borradores"),
    ]);

    const allCandidates = [...publicadasScan.candidates, ...borradoresScan.candidates];
    const resolved = await resolveUsageTotalsFromCandidates(allCandidates);
    const now = new Date();
    const dateKey = toDateKey(now);

    await db()
      .collection("iconos_usage_snapshots")
      .doc(dateKey)
      .set(
        {
          dateKey,
          generatedAt: admin.firestore.FieldValue.serverTimestamp(),
          totals: resolved.totals,
          unresolvedRefs: resolved.unresolved,
          scannedDrafts: borradoresScan.scanned,
          scannedPublications: publicadasScan.scanned,
          source: "daily-scan",
        },
        { merge: true }
      );

    await reconcileActiveIconStatsWithTotals({
      totals: resolved.totals,
      now,
    });

    await writeIconAuditEvent({
      event: "dailyIconUsageScanV2",
      iconId: null,
      uid: null,
      payload: {
        scannedDrafts: borradoresScan.scanned,
        scannedPublications: publicadasScan.scanned,
        unresolvedRefs: resolved.unresolved,
        distinctIcons: Object.keys(resolved.totals).length,
      },
    });
  }
);
