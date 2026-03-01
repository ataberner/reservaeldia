import * as admin from "firebase-admin";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { requireAdmin, requireSuperAdmin } from "../auth/adminAuth";
import {
  ICON_CATALOG_CALLABLE_OPTIONS,
  ICON_CATALOG_DEFAULT_LIST_LIMIT,
  ICON_CATALOG_MAX_LIST_LIMIT,
  ICON_CATALOG_SCHEMA_VERSION,
} from "./config";
import { writeIconAuditEvent } from "./audit";
import { mergeLegacyMetadata, normalizeIconMetadata } from "./metadata";
import { processIconDocumentV2 } from "./processor";
import {
  activeIconCollection,
  archivedIconCollection,
  getIconDocById,
  listIconDocs,
  moveIconToArchived,
  restoreIconFromArchived,
} from "./repository";
import type { IconCatalogDocWithId } from "./types";

function normalizeString(value: unknown): string {
  return String(value || "").trim();
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return ICON_CATALOG_DEFAULT_LIST_LIMIT;
  return Math.max(1, Math.min(ICON_CATALOG_MAX_LIST_LIMIT, Math.floor(parsed)));
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

function toPlainRecord(icon: IconCatalogDocWithId): Record<string, unknown> {
  return { ...icon };
}

export const adminListIconCatalogV2 = onCall(
  ICON_CATALOG_CALLABLE_OPTIONS,
  async (request: CallableRequest<Record<string, unknown>>) => {
    requireAdmin(request);

    const includeArchived = request.data?.includeArchived === true;
    const includeTotals = request.data?.includeTotals === true;
    const limit = parseLimit(request.data?.limit);
    const cursor = parseCursor(request.data?.cursor);

    const listed = await listIconDocs({ includeArchived, limit, cursor });
    const totals = includeTotals
      ? await Promise.all([
        activeIconCollection().count().get(),
        archivedIconCollection().count().get(),
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
      schemaVersion: ICON_CATALOG_SCHEMA_VERSION,
      items: listed.active.map((item) => toPlainRecord(item)),
      archivedItems: includeArchived
        ? listed.archived.map((item) => toPlainRecord(item))
        : undefined,
      pageInfo: listed.pageInfo,
      ...(totals ? { totals } : {}),
    };
  }
);

export const adminPatchIconMetadataV2 = onCall(
  ICON_CATALOG_CALLABLE_OPTIONS,
  async (
    request: CallableRequest<{
      iconId?: unknown;
      patch?: unknown;
    }>
  ) => {
    const uid = requireAdmin(request);
    const iconId = normalizeString(request.data?.iconId);
    if (!iconId) {
      throw new HttpsError("invalid-argument", "iconId es obligatorio.");
    }

    const patchInput = asObject(request.data?.patch);
    const existing = await getIconDocById({ iconId, allowArchived: true });
    if (!existing?.snap.exists) {
      throw new HttpsError("not-found", "No se encontro el icono.");
    }

    const currentData = asObject(existing.snap.data());
    const mergedData = {
      ...currentData,
      ...patchInput,
    };

    const normalized = normalizeIconMetadata(mergedData);
    const metadataPatch = mergeLegacyMetadata(mergedData, normalized);
    const targetCollection =
      existing.source === "active" ? activeIconCollection() : archivedIconCollection();

    await targetCollection.doc(iconId).set(
      {
        ...metadataPatch,
        schemaVersion: ICON_CATALOG_SCHEMA_VERSION,
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
        audit: {
          ...asObject(currentData.audit),
          updatedByUid: uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );

    await writeIconAuditEvent({
      event: "adminPatchIconMetadataV2",
      iconId,
      uid,
      payload: {
        source: existing.source,
        keys: Object.keys(patchInput),
      },
    });

    return {
      ok: true,
      iconId,
      source: existing.source,
      metadataPatch,
    };
  }
);

export const adminSetIconActivationV2 = onCall(
  ICON_CATALOG_CALLABLE_OPTIONS,
  async (
    request: CallableRequest<{
      iconId?: unknown;
      active?: unknown;
      reason?: unknown;
    }>
  ) => {
    const uid = requireAdmin(request);
    const iconId = normalizeString(request.data?.iconId);
    if (!iconId) {
      throw new HttpsError("invalid-argument", "iconId es obligatorio.");
    }

    const active = request.data?.active === true;
    const reason = normalizeString(request.data?.reason) || "manual-toggle";

    if (active) {
      await restoreIconFromArchived({ iconId, uid });
      await writeIconAuditEvent({
        event: "adminSetIconActivationV2:restore",
        iconId,
        uid,
        payload: { reason },
      });
      return {
        ok: true,
        iconId,
        active: true,
      };
    }

    await moveIconToArchived({ iconId, reason, uid });
    await writeIconAuditEvent({
      event: "adminSetIconActivationV2:archive",
      iconId,
      uid,
      payload: { reason },
    });

    return {
      ok: true,
      iconId,
      active: false,
    };
  }
);

export const adminSetIconPriorityV2 = onCall(
  ICON_CATALOG_CALLABLE_OPTIONS,
  async (
    request: CallableRequest<{
      iconId?: unknown;
      priority?: unknown;
    }>
  ) => {
    const uid = requireAdmin(request);
    const iconId = normalizeString(request.data?.iconId);
    if (!iconId) {
      throw new HttpsError("invalid-argument", "iconId es obligatorio.");
    }

    const parsed = Number(request.data?.priority);
    if (!Number.isFinite(parsed)) {
      throw new HttpsError("invalid-argument", "priority debe ser numerico.");
    }

    const priority = Math.max(-9999, Math.min(9999, Math.round(parsed)));
    const popular = priority > 0;
    const existing = await getIconDocById({ iconId, allowArchived: true });
    if (!existing?.snap.exists) {
      throw new HttpsError("not-found", "No se encontro el icono.");
    }

    const targetCollection =
      existing.source === "active" ? activeIconCollection() : archivedIconCollection();
    const currentData = asObject(existing.snap.data());

    await targetCollection.doc(iconId).set(
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

    await writeIconAuditEvent({
      event: "adminSetIconPriorityV2",
      iconId,
      uid,
      payload: {
        priority,
        popular,
        source: existing.source,
      },
    });

    return {
      ok: true,
      iconId,
      priority,
      popular,
      source: existing.source,
    };
  }
);

export const adminRevalidateIconV2 = onCall(
  ICON_CATALOG_CALLABLE_OPTIONS,
  async (
    request: CallableRequest<{
      iconId?: unknown;
      force?: unknown;
      archiveOnReject?: unknown;
    }>
  ) => {
    const uid = requireSuperAdmin(request);
    const iconId = normalizeString(request.data?.iconId);
    if (!iconId) {
      throw new HttpsError("invalid-argument", "iconId es obligatorio.");
    }

    const force = request.data?.force !== false;
    const archiveOnReject = request.data?.archiveOnReject !== false;

    const existing = await getIconDocById({ iconId, allowArchived: true });
    if (!existing?.snap.exists) {
      throw new HttpsError("not-found", "No se encontro el icono.");
    }

    const currentData = asObject(existing.snap.data());
    const processed = await processIconDocumentV2({
      iconId,
      rawData: currentData,
      force,
      triggeredByUid: uid,
    });

    if (!processed.skip && Object.keys(processed.patch).length > 0) {
      const targetCollection =
        existing.source === "active" ? activeIconCollection() : archivedIconCollection();
      await targetCollection.doc(iconId).set(processed.patch, { merge: true });
    }

    if (archiveOnReject && existing.source === "active" && processed.shouldArchive) {
      await moveIconToArchived({
        iconId,
        reason: processed.archiveReason || "revalidate-archive",
        uid,
      });
    }

    await writeIconAuditEvent({
      event: "adminRevalidateIconV2",
      iconId,
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
      iconId,
      source: existing.source,
      skip: processed.skip,
      shouldArchive: processed.shouldArchive,
      archiveReason: processed.archiveReason,
    };
  }
);

export const adminGetIconUsageStatsV2 = onCall(
  ICON_CATALOG_CALLABLE_OPTIONS,
  async (request: CallableRequest<{ limit?: unknown }>) => {
    requireAdmin(request);
    const limit = parseLimit(request.data?.limit);

    const active = await listIconDocs({ includeArchived: false, limit: 500 });
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
      schemaVersion: ICON_CATALOG_SCHEMA_VERSION,
      totalIcons: active.active.length,
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
