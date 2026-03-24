import * as admin from "firebase-admin";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { requireAdmin } from "../auth/adminAuth";
import {
  DECOR_CATALOG_CALLABLE_OPTIONS,
  DECOR_CATALOG_DEFAULT_LIST_LIMIT,
  DECOR_CATALOG_MAX_LIST_LIMIT,
  DECOR_CATALOG_SCHEMA_VERSION,
} from "./config";
import { writeDecorAuditEvent } from "./audit";
import { mergeLegacyMetadata, normalizeDecorMetadata } from "./metadata";
import { processDecorDocumentV1 } from "./processor";
import {
  activeDecorCollection,
  archivedDecorCollection,
  getDecorDocById,
  listDecorDocs,
  moveDecorToArchived,
  restoreDecorFromArchived,
} from "./repository";
import type { DecorCatalogDocWithId } from "./types";

function normalizeString(value: unknown): string {
  return String(value || "").trim();
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DECOR_CATALOG_DEFAULT_LIST_LIMIT;
  return Math.max(1, Math.min(DECOR_CATALOG_MAX_LIST_LIMIT, Math.floor(parsed)));
}

function parseCursor(value: unknown): {
  active?: string;
  archived?: string;
} {
  const raw = asObject(value);
  const active = normalizeString(raw.active);
  const archived = normalizeString(raw.archived);

  return {
    ...(active ? { active } : {}),
    ...(archived ? { archived } : {}),
  };
}

function toPlainRecord(decor: DecorCatalogDocWithId): Record<string, unknown> {
  return { ...decor };
}

export const adminListDecorCatalogV1 = onCall(
  DECOR_CATALOG_CALLABLE_OPTIONS,
  async (request: CallableRequest<Record<string, unknown>>) => {
    requireAdmin(request);

    const includeArchived = request.data?.includeArchived === true;
    const includeTotals = request.data?.includeTotals === true;
    const limit = parseLimit(request.data?.limit);
    const cursor = parseCursor(request.data?.cursor);

    const listed = await listDecorDocs({ includeArchived, limit, cursor });
    const totals = includeTotals
      ? await Promise.all([
        activeDecorCollection().count().get(),
        archivedDecorCollection().count().get(),
      ]).then(([activeCountSnap, archivedCountSnap]) => {
        const active = Number(activeCountSnap.data().count || 0);
        const archived = Number(archivedCountSnap.data().count || 0);
        return {
          active,
          archived,
          total: active + archived,
        };
      })
      : undefined;

    return {
      schemaVersion: DECOR_CATALOG_SCHEMA_VERSION,
      items: listed.active.map((item) => toPlainRecord(item)),
      archivedItems: includeArchived
        ? listed.archived.map((item) => toPlainRecord(item))
        : undefined,
      pageInfo: listed.pageInfo,
      ...(totals ? { totals } : {}),
    };
  }
);

export const adminPatchDecorMetadataV1 = onCall(
  DECOR_CATALOG_CALLABLE_OPTIONS,
  async (
    request: CallableRequest<{
      decorId?: unknown;
      patch?: unknown;
    }>
  ) => {
    const uid = requireAdmin(request);
    const decorId = normalizeString(request.data?.decorId);
    if (!decorId) {
      throw new HttpsError("invalid-argument", "decorId es obligatorio.");
    }

    const patchInput = asObject(request.data?.patch);
    const existing = await getDecorDocById({ decorId, allowArchived: true });
    if (!existing?.snap.exists) {
      throw new HttpsError("not-found", "No se encontro la decoracion.");
    }

    const currentData = asObject(existing.snap.data());
    const mergedData = {
      ...currentData,
      ...patchInput,
    };

    const normalized = normalizeDecorMetadata(mergedData);
    const metadataPatch = mergeLegacyMetadata(mergedData, normalized);
    const targetCollection =
      existing.source === "active" ? activeDecorCollection() : archivedDecorCollection();

    await targetCollection.doc(decorId).set(
      {
        ...metadataPatch,
        schemaVersion: DECOR_CATALOG_SCHEMA_VERSION,
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
        audit: {
          ...asObject(currentData.audit),
          updatedByUid: uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );

    await writeDecorAuditEvent({
      event: "adminPatchDecorMetadataV1",
      decorId,
      uid,
      payload: {
        source: existing.source,
        keys: Object.keys(patchInput),
      },
    });

    return {
      ok: true,
      decorId,
      source: existing.source,
      metadataPatch,
    };
  }
);

export const adminSetDecorActivationV1 = onCall(
  DECOR_CATALOG_CALLABLE_OPTIONS,
  async (
    request: CallableRequest<{
      decorId?: unknown;
      active?: unknown;
      reason?: unknown;
    }>
  ) => {
    const uid = requireAdmin(request);
    const decorId = normalizeString(request.data?.decorId);
    if (!decorId) {
      throw new HttpsError("invalid-argument", "decorId es obligatorio.");
    }

    const active = request.data?.active === true;
    const reason = normalizeString(request.data?.reason) || "manual-toggle";

    if (active) {
      await restoreDecorFromArchived({ decorId, uid });
      await writeDecorAuditEvent({
        event: "adminSetDecorActivationV1:restore",
        decorId,
        uid,
        payload: { reason },
      });
      return {
        ok: true,
        decorId,
        active: true,
      };
    }

    await moveDecorToArchived({ decorId, reason, uid });
    await writeDecorAuditEvent({
      event: "adminSetDecorActivationV1:archive",
      decorId,
      uid,
      payload: { reason },
    });

    return {
      ok: true,
      decorId,
      active: false,
    };
  }
);

export const adminSetDecorPriorityV1 = onCall(
  DECOR_CATALOG_CALLABLE_OPTIONS,
  async (
    request: CallableRequest<{
      decorId?: unknown;
      priority?: unknown;
    }>
  ) => {
    const uid = requireAdmin(request);
    const decorId = normalizeString(request.data?.decorId);
    if (!decorId) {
      throw new HttpsError("invalid-argument", "decorId es obligatorio.");
    }

    const parsed = Number(request.data?.priority);
    if (!Number.isFinite(parsed)) {
      throw new HttpsError("invalid-argument", "priority debe ser numerico.");
    }

    const priority = Math.max(-9999, Math.min(9999, Math.round(parsed)));
    const popular = priority > 0;
    const existing = await getDecorDocById({ decorId, allowArchived: true });
    if (!existing?.snap.exists) {
      throw new HttpsError("not-found", "No se encontro la decoracion.");
    }

    const targetCollection =
      existing.source === "active" ? activeDecorCollection() : archivedDecorCollection();
    const currentData = asObject(existing.snap.data());

    await targetCollection.doc(decorId).set(
      {
        priority,
        popular,
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
        audit: {
          ...asObject(currentData.audit),
          updatedByUid: uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );

    await writeDecorAuditEvent({
      event: "adminSetDecorPriorityV1",
      decorId,
      uid,
      payload: {
        priority,
        popular,
        source: existing.source,
      },
    });

    return {
      ok: true,
      decorId,
      priority,
      popular,
      source: existing.source,
    };
  }
);

export const adminRevalidateDecorV1 = onCall(
  DECOR_CATALOG_CALLABLE_OPTIONS,
  async (
    request: CallableRequest<{
      decorId?: unknown;
      force?: unknown;
      archiveOnReject?: unknown;
    }>
  ) => {
    const uid = requireAdmin(request);
    const decorId = normalizeString(request.data?.decorId);
    if (!decorId) {
      throw new HttpsError("invalid-argument", "decorId es obligatorio.");
    }

    const force = request.data?.force !== false;
    const archiveOnReject = request.data?.archiveOnReject !== false;

    const existing = await getDecorDocById({ decorId, allowArchived: true });
    if (!existing?.snap.exists) {
      throw new HttpsError("not-found", "No se encontro la decoracion.");
    }

    const currentData = asObject(existing.snap.data());
    const processed = await processDecorDocumentV1({
      decorId,
      rawData: currentData,
      force,
      triggeredByUid: uid,
    });

    if (!processed.skip && Object.keys(processed.patch).length > 0) {
      const targetCollection =
        existing.source === "active" ? activeDecorCollection() : archivedDecorCollection();
      await targetCollection.doc(decorId).set(processed.patch, { merge: true });
    }

    if (archiveOnReject && existing.source === "active" && processed.shouldArchive) {
      await moveDecorToArchived({
        decorId,
        reason: processed.archiveReason || "revalidate-archive",
        uid,
      });
    }

    await writeDecorAuditEvent({
      event: "adminRevalidateDecorV1",
      decorId,
      uid,
      payload: {
        source: existing.source,
        skip: processed.skip,
        shouldArchive: processed.shouldArchive,
        archiveReason: processed.archiveReason,
      },
    });

    return {
      ok: true,
      decorId,
      source: existing.source,
      skip: processed.skip,
      shouldArchive: processed.shouldArchive,
      archiveReason: processed.archiveReason,
    };
  }
);

export const adminGetDecorUsageStatsV1 = onCall(
  DECOR_CATALOG_CALLABLE_OPTIONS,
  async (request: CallableRequest<{ limit?: unknown }>) => {
    requireAdmin(request);
    const limit = parseLimit(request.data?.limit);

    const active = await listDecorDocs({ includeArchived: false, limit: 500 });
    const sorted = active.active
      .slice()
      .sort((left, right) => {
        const leftCount = Number(left.stats?.usesCount || 0);
        const rightCount = Number(right.stats?.usesCount || 0);
        if (rightCount !== leftCount) return rightCount - leftCount;
        return left.id.localeCompare(right.id);
      })
      .slice(0, limit);

    const totalUses = active.active.reduce(
      (acc, item) => acc + Number(item.stats?.usesCount || 0),
      0
    );

    return {
      schemaVersion: DECOR_CATALOG_SCHEMA_VERSION,
      totalDecoraciones: active.active.length,
      totalUses,
      top: sorted.map((item) => ({
        id: item.id,
        nombre: item.nombre,
        usesCount: Number(item.stats?.usesCount || 0),
        lastUsedAt: item.stats?.lastUsedAt || null,
        lastUsedSlug: item.stats?.lastUsedSlug || null,
      })),
    };
  }
);
