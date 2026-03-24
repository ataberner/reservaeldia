import { getStorage } from "firebase-admin/storage";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { CallableRequest, HttpsError } from "firebase-functions/v2/https";

const BORRADORES_COLLECTION = "borradores";
const THUMBNAILS_PREFIX = "thumbnails_borradores";
const DAY_MS = 24 * 60 * 60 * 1000;

export const DRAFT_TRASH_RETENTION_DAYS = 30;

export const DRAFT_STATES = {
  ACTIVE: "borrador_activo",
  TRASH: "borrador_papelera",
} as const;

type DraftState = (typeof DRAFT_STATES)[keyof typeof DRAFT_STATES];
type DraftDocData = Record<string, unknown>;

const db = admin.firestore();
const bucket = getStorage().bucket();

function readSlugFromRequestData(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const source = data as Record<string, unknown>;
  const slug = typeof source.slug === "string" ? source.slug.trim() : "";
  return slug;
}

function readMillis(value: unknown): number | null {
  if (!value) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value instanceof Date) {
    const parsed = value.getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    try {
      const asDate = (value as { toDate: () => Date }).toDate();
      const parsed = asDate.getTime();
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as { seconds?: unknown }).seconds === "number"
  ) {
    const seconds = (value as { seconds: number }).seconds;
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  }

  return null;
}

function normalizeDraftStateValue(raw: unknown): DraftState {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!value) return DRAFT_STATES.ACTIVE;

  if (
    value === DRAFT_STATES.TRASH ||
    value === "trash" ||
    value === "papelera" ||
    value === "trashed"
  ) {
    return DRAFT_STATES.TRASH;
  }

  return DRAFT_STATES.ACTIVE;
}

export function resolveDraftStateFromData(data: DraftDocData): DraftState {
  const fromStateField = normalizeDraftStateValue(data.estadoBorrador);
  if (fromStateField === DRAFT_STATES.TRASH) return DRAFT_STATES.TRASH;

  const trashedAtMs = readMillis(data.enPapeleraAt);
  if (trashedAtMs && trashedAtMs > 0) return DRAFT_STATES.TRASH;

  return DRAFT_STATES.ACTIVE;
}

function computeDraftPurgeAtMs(data: DraftDocData): number | null {
  const explicitPurgeAt = readMillis(data.eliminacionDefinitivaAt);
  if (explicitPurgeAt && explicitPurgeAt > 0) {
    return explicitPurgeAt;
  }

  const trashedAtMs = readMillis(data.enPapeleraAt);
  if (!trashedAtMs || trashedAtMs <= 0) return null;
  return trashedAtMs + DRAFT_TRASH_RETENTION_DAYS * DAY_MS;
}

function toIsoOrNull(ms: number | null): string | null {
  if (!ms || ms <= 0) return null;
  return new Date(ms).toISOString();
}

async function getOwnedDraft(slug: string, uid: string) {
  const ref = db.collection(BORRADORES_COLLECTION).doc(slug);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "No existe el borrador.");
  }

  const data = (snap.data() || {}) as DraftDocData;
  const ownerUid = typeof data.userId === "string" ? data.userId.trim() : "";
  if (!ownerUid || ownerUid !== uid) {
    throw new HttpsError(
      "permission-denied",
      "No puedes modificar este borrador."
    );
  }

  return { ref, data };
}

function requireUid(request: CallableRequest<unknown>): string {
  const uid = typeof request.auth?.uid === "string" ? request.auth.uid : "";
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuario no autenticado.");
  }
  return uid;
}

export async function moveDraftToTrashHandler(
  request: CallableRequest<unknown>
) {
  const uid = requireUid(request);
  const slug = readSlugFromRequestData(request.data);

  if (!slug) {
    throw new HttpsError("invalid-argument", "Falta el slug del borrador.");
  }

  const { ref, data } = await getOwnedDraft(slug, uid);
  const currentState = resolveDraftStateFromData(data);
  if (currentState === DRAFT_STATES.TRASH) {
    const existingPurgeAt = computeDraftPurgeAtMs(data);
    return {
      success: true,
      slug,
      estadoBorrador: DRAFT_STATES.TRASH,
      enPapeleraAt: toIsoOrNull(readMillis(data.enPapeleraAt)),
      eliminacionDefinitivaAt: toIsoOrNull(existingPurgeAt),
      alreadyInTrash: true,
    };
  }

  const nowMs = Date.now();
  const purgeAtMs = nowMs + DRAFT_TRASH_RETENTION_DAYS * DAY_MS;

  await ref.set(
    {
      estadoBorrador: DRAFT_STATES.TRASH,
      enPapeleraAt: admin.firestore.Timestamp.fromMillis(nowMs),
      eliminacionDefinitivaAt: admin.firestore.Timestamp.fromMillis(purgeAtMs),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ultimaEdicion: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    success: true,
    slug,
    estadoBorrador: DRAFT_STATES.TRASH,
    enPapeleraAt: new Date(nowMs).toISOString(),
    eliminacionDefinitivaAt: new Date(purgeAtMs).toISOString(),
  };
}

export async function restoreDraftFromTrashHandler(
  request: CallableRequest<unknown>
) {
  const uid = requireUid(request);
  const slug = readSlugFromRequestData(request.data);

  if (!slug) {
    throw new HttpsError("invalid-argument", "Falta el slug del borrador.");
  }

  const { ref, data } = await getOwnedDraft(slug, uid);
  const currentState = resolveDraftStateFromData(data);
  if (currentState !== DRAFT_STATES.TRASH) {
    return {
      success: true,
      slug,
      estadoBorrador: DRAFT_STATES.ACTIVE,
      alreadyRestored: true,
    };
  }

  await ref.set(
    {
      estadoBorrador: DRAFT_STATES.ACTIVE,
      enPapeleraAt: admin.firestore.FieldValue.delete(),
      eliminacionDefinitivaAt: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ultimaEdicion: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    success: true,
    slug,
    estadoBorrador: DRAFT_STATES.ACTIVE,
  };
}

export type PurgeTrashedDraftsSummary = {
  scanned: number;
  deleted: number;
  skippedPending: number;
  skippedInvalid: number;
  errors: number;
};

export async function purgeTrashedDraftsHandler(options?: {
  batchSize?: number;
}): Promise<PurgeTrashedDraftsSummary> {
  const requestedBatch =
    typeof options?.batchSize === "number" && Number.isFinite(options.batchSize)
      ? Math.floor(options.batchSize)
      : 250;
  const batchSize = Math.max(1, Math.min(500, requestedBatch));

  const snapshot = await db
    .collection(BORRADORES_COLLECTION)
    .where("estadoBorrador", "==", DRAFT_STATES.TRASH)
    .limit(batchSize)
    .get();

  const nowMs = Date.now();
  const summary: PurgeTrashedDraftsSummary = {
    scanned: snapshot.size,
    deleted: 0,
    skippedPending: 0,
    skippedInvalid: 0,
    errors: 0,
  };

  for (const docSnap of snapshot.docs) {
    const slug = docSnap.id;
    const data = (docSnap.data() || {}) as DraftDocData;
    const purgeAtMs = computeDraftPurgeAtMs(data);

    if (!purgeAtMs || purgeAtMs <= 0) {
      summary.skippedInvalid += 1;
      continue;
    }

    if (nowMs < purgeAtMs) {
      summary.skippedPending += 1;
      continue;
    }

    const ownerUid = typeof data.userId === "string" ? data.userId.trim() : "";

    try {
      await bucket.deleteFiles({ prefix: `borradores/${slug}/` });
    } catch (storageError) {
      logger.warn("No se pudo borrar storage de borrador en purga", {
        slug,
        prefix: `borradores/${slug}/`,
        error:
          storageError instanceof Error
            ? storageError.message
            : String(storageError || ""),
      });
    }

    if (ownerUid) {
      try {
        await bucket.deleteFiles({
          prefix: `${THUMBNAILS_PREFIX}/${ownerUid}/${slug}`,
        });
      } catch (thumbError) {
        logger.warn("No se pudo borrar thumbnail de borrador en purga", {
          slug,
          ownerUid,
          error:
            thumbError instanceof Error
              ? thumbError.message
              : String(thumbError || ""),
        });
      }
    }

    try {
      await docSnap.ref.delete();
      summary.deleted += 1;
    } catch (deleteError) {
      summary.errors += 1;
      logger.error("No se pudo eliminar doc de borrador en purga", {
        slug,
        error:
          deleteError instanceof Error
            ? deleteError.message
            : String(deleteError || ""),
      });
    }
  }

  return summary;
}

