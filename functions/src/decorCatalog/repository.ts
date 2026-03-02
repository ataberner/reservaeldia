import { createHash, randomUUID } from "crypto";
import * as admin from "firebase-admin";
import { getStorage } from "firebase-admin/storage";
import {
  DECOR_CATALOG_ARCHIVED_COLLECTION,
  DECOR_CATALOG_COLLECTION,
} from "./config";
import type {
  DecorCatalogDocWithId,
  DecorThumbnails,
} from "./types";

type StorageFileReadResult = {
  exists: boolean;
  buffer: Buffer | null;
  contentType: string | null;
  size: number;
  metadata: Record<string, unknown>;
};

type ListCollectionPage = {
  items: DecorCatalogDocWithId[];
  hasMore: boolean;
  nextCursor: string | null;
};

type ListDecorDocsCursor = {
  active?: string | null;
  archived?: string | null;
};

function ensureApp() {
  if (admin.apps.length > 0) return admin.app();
  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: "reservaeldia-7a440.firebasestorage.app",
  });
}

export function db() {
  ensureApp();
  return admin.firestore();
}

export function bucket() {
  ensureApp();
  return getStorage().bucket();
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeStoragePathCandidate(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("gs://")) {
    const withoutScheme = raw.slice(5);
    const firstSlash = withoutScheme.indexOf("/");
    if (firstSlash === -1) return "";
    return withoutScheme.slice(firstSlash + 1).replace(/^\/+/, "");
  }
  return raw.replace(/^\/+/, "");
}

export function parseStoragePathFromUrl(urlValue: unknown): string | null {
  if (typeof urlValue !== "string") return null;
  const value = urlValue.trim();
  if (!value) return null;
  if (value.startsWith("gs://")) {
    const normalized = normalizeStoragePathCandidate(value);
    return normalized || null;
  }

  if (!/^https?:\/\//i.test(value)) return null;

  try {
    const parsed = new URL(value);

    if (
      parsed.hostname === "firebasestorage.googleapis.com" ||
      parsed.hostname.endsWith(".firebasestorage.app")
    ) {
      const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/i);
      if (!match) return null;
      return normalizeStoragePathCandidate(decodeURIComponent(match[2] || "")) || null;
    }

    if (parsed.hostname === "storage.googleapis.com") {
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments.length < 2) return null;
      return (
        normalizeStoragePathCandidate(decodeURIComponent(segments.slice(1).join("/"))) || null
      );
    }

    return null;
  } catch {
    return null;
  }
}

export function resolveStoragePathFromDecorData(raw: Record<string, unknown>): string | null {
  const directStoragePath = normalizeStoragePathCandidate(String(raw.storagePath || ""));
  if (directStoragePath) return directStoragePath;

  const fromUrl = parseStoragePathFromUrl(raw.url);
  if (fromUrl) return fromUrl;

  const nombre = String(raw.nombre || "").trim();
  if (!nombre) return null;
  if (nombre.startsWith("decoraciones/")) return nombre;
  return `decoraciones/originals/${nombre}`;
}

export async function readStorageFile(path: string): Promise<StorageFileReadResult> {
  const safePath = normalizeStoragePathCandidate(path);
  if (!safePath) {
    return {
      exists: false,
      buffer: null,
      contentType: null,
      size: 0,
      metadata: {},
    };
  }

  const file = bucket().file(safePath);
  const [exists] = await file.exists();
  if (!exists) {
    return {
      exists: false,
      buffer: null,
      contentType: null,
      size: 0,
      metadata: {},
    };
  }

  const [metaRaw] = await file.getMetadata().catch(() => [{} as Record<string, unknown>]);
  const metadata = asObject(metaRaw);
  const [buffer] = await file.download();

  const contentType = typeof metadata.contentType === "string" ? metadata.contentType : null;
  const size = Number(metadata.size || buffer.byteLength || 0);

  return {
    exists: true,
    buffer,
    contentType,
    size,
    metadata,
  };
}

export async function uploadBinaryWithToken(params: {
  storagePath: string;
  buffer: Buffer;
  contentType: string;
  previousMetadata?: Record<string, unknown>;
}): Promise<{ storagePath: string; url: string; bytes: number }> {
  const safePath = normalizeStoragePathCandidate(params.storagePath);
  const file = bucket().file(safePath);
  const previous = asObject(params.previousMetadata);
  const previousCustomMetadata = asObject(previous.metadata);
  const existingTokenRaw = previousCustomMetadata.firebaseStorageDownloadTokens;
  const token =
    typeof existingTokenRaw === "string" && existingTokenRaw.trim()
      ? existingTokenRaw
      : randomUUID();

  await file.save(params.buffer, {
    contentType: params.contentType,
    metadata: {
      cacheControl: "public,max-age=31536000,immutable",
      metadata: {
        ...previousCustomMetadata,
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket().name}/o/${encodeURIComponent(
    safePath
  )}?alt=media&token=${token}`;
  return { storagePath: safePath, url, bytes: params.buffer.byteLength };
}

export function sha256Hex(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function decorCollection(name: string) {
  return db().collection(name);
}

export function activeDecorCollection() {
  return decorCollection(DECOR_CATALOG_COLLECTION);
}

export function archivedDecorCollection() {
  return decorCollection(DECOR_CATALOG_ARCHIVED_COLLECTION);
}

function parseThumbnails(raw: unknown): DecorThumbnails | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as DecorThumbnails;
}

function mapSnapshotToDecorDoc(
  snap: FirebaseFirestore.DocumentSnapshot
): DecorCatalogDocWithId {
  const data = asObject(snap.data());
  return {
    id: snap.id,
    nombre: String(data.nombre || "").trim(),
    url: String(data.url || "").trim(),
    categoria: String(data.categoria || "").trim(),
    categorias: Array.isArray(data.categorias)
      ? data.categorias.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    keywords: Array.isArray(data.keywords)
      ? data.keywords.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    tags: Array.isArray(data.tags)
      ? data.tags.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    popular: data.popular === true,
    priority: Number.isFinite(Number(data.priority)) ? Number(data.priority) : 0,
    schemaVersion: Number(data.schemaVersion || 1),
    assetType: "decoracion",
    status:
      data.status === "archived" ||
      data.status === "rejected" ||
      data.status === "processing"
        ? data.status
        : "active",
    storagePath: typeof data.storagePath === "string" ? data.storagePath : null,
    contentType: typeof data.contentType === "string" ? data.contentType : null,
    bytes: Number.isFinite(Number(data.bytes)) ? Number(data.bytes) : null,
    hashSha256: typeof data.hashSha256 === "string" ? data.hashSha256 : null,
    format: typeof data.format === "string" ? data.format : null,
    width: Number.isFinite(Number(data.width)) ? Number(data.width) : null,
    height: Number.isFinite(Number(data.height)) ? Number(data.height) : null,
    hasAlpha: typeof data.hasAlpha === "boolean" ? data.hasAlpha : null,
    thumbnails: parseThumbnails(data.thumbnails),
    searchText: typeof data.searchText === "string" ? data.searchText : "",
    searchTokens: Array.isArray(data.searchTokens)
      ? data.searchTokens.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    validation: (data.validation as DecorCatalogDocWithId["validation"]) || null,
    quality: (data.quality as DecorCatalogDocWithId["quality"]) || null,
    stats:
      (data.stats as DecorCatalogDocWithId["stats"]) || {
        usesCount: 0,
        lastUsedAt: null,
        lastUsedSlug: null,
      },
    audit:
      (data.audit as DecorCatalogDocWithId["audit"]) || {
        createdByUid: null,
        updatedByUid: null,
        archivedByUid: null,
        revalidatedByUid: null,
        lastValidatedAt: null,
        processorVersion: null,
        processorFingerprint: null,
        createdAt: null,
        updatedAt: null,
        archivedAt: null,
      },
    creado: (data.creado as DecorCatalogDocWithId["creado"]) || null,
    creadoEn: (data.creadoEn as DecorCatalogDocWithId["creadoEn"]) || null,
    actualizadoEn: (data.actualizadoEn as DecorCatalogDocWithId["actualizadoEn"]) || null,
  };
}

function normalizeCursor(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

async function listCollectionPage(params: {
  collectionRef: FirebaseFirestore.CollectionReference;
  limit: number;
  startAfterId?: string | null;
}): Promise<ListCollectionPage> {
  const safeLimit = Math.max(1, Math.min(500, Number(params.limit || 100)));
  let query: FirebaseFirestore.Query = params.collectionRef
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(safeLimit + 1);

  const startAfterId = normalizeCursor(params.startAfterId);
  if (startAfterId) {
    query = query.startAfter(startAfterId);
  }

  const snap = await query.get();
  const hasMore = snap.docs.length > safeLimit;
  const pageDocs = hasMore ? snap.docs.slice(0, safeLimit) : snap.docs;
  const items = pageDocs.map((docItem) => mapSnapshotToDecorDoc(docItem));
  const nextCursor = hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : null;

  return {
    items,
    hasMore,
    nextCursor,
  };
}

export async function listDecorDocs(params?: {
  includeArchived?: boolean;
  limit?: number;
  cursor?: ListDecorDocsCursor;
}): Promise<{
  active: DecorCatalogDocWithId[];
  archived: DecorCatalogDocWithId[];
  pageInfo: {
    active: {
      hasMore: boolean;
      nextCursor: string | null;
    };
    archived: {
      hasMore: boolean;
      nextCursor: string | null;
    };
  };
}> {
  const limit = Math.max(1, Math.min(500, Number(params?.limit || 100)));
  const activePage = await listCollectionPage({
    collectionRef: activeDecorCollection(),
    limit,
    startAfterId: params?.cursor?.active,
  });

  let archivedPage: ListCollectionPage = {
    items: [],
    hasMore: false,
    nextCursor: null,
  };

  if (params?.includeArchived) {
    archivedPage = await listCollectionPage({
      collectionRef: archivedDecorCollection(),
      limit,
      startAfterId: params?.cursor?.archived,
    });
  }

  return {
    active: activePage.items,
    archived: archivedPage.items,
    pageInfo: {
      active: {
        hasMore: activePage.hasMore,
        nextCursor: activePage.nextCursor,
      },
      archived: {
        hasMore: archivedPage.hasMore,
        nextCursor: archivedPage.nextCursor,
      },
    },
  };
}

export async function getDecorDocById(params: {
  decorId: string;
  allowArchived?: boolean;
}): Promise<{ source: "active" | "archived"; snap: FirebaseFirestore.DocumentSnapshot } | null> {
  const decorId = String(params.decorId || "").trim();
  if (!decorId) return null;

  const activeRef = activeDecorCollection().doc(decorId);
  const activeSnap = await activeRef.get();
  if (activeSnap.exists) return { source: "active", snap: activeSnap };

  if (params.allowArchived) {
    const archivedRef = archivedDecorCollection().doc(decorId);
    const archivedSnap = await archivedRef.get();
    if (archivedSnap.exists) return { source: "archived", snap: archivedSnap };
  }

  return null;
}

export async function moveDecorToArchived(params: {
  decorId: string;
  reason: string;
  uid: string | null;
}): Promise<void> {
  const decorId = String(params.decorId || "").trim();
  if (!decorId) return;
  const reason = String(params.reason || "").trim() || "manual-archive";

  const activeRef = activeDecorCollection().doc(decorId);
  const archivedRef = archivedDecorCollection().doc(decorId);

  await db().runTransaction(async (tx) => {
    const activeSnap = await tx.get(activeRef);
    if (!activeSnap.exists) return;

    const data = asObject(activeSnap.data());
    tx.set(
      archivedRef,
      {
        ...data,
        status: "archived",
        archivedReason: reason,
        archivedFrom: DECOR_CATALOG_COLLECTION,
        audit: {
          ...asObject(data.audit),
          archivedByUid: params.uid || null,
          archivedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedByUid: params.uid || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    tx.delete(activeRef);
  });
}

export async function restoreDecorFromArchived(params: {
  decorId: string;
  uid: string | null;
}): Promise<void> {
  const decorId = String(params.decorId || "").trim();
  if (!decorId) return;

  const activeRef = activeDecorCollection().doc(decorId);
  const archivedRef = archivedDecorCollection().doc(decorId);

  await db().runTransaction(async (tx) => {
    const archivedSnap = await tx.get(archivedRef);
    if (!archivedSnap.exists) return;

    const data = asObject(archivedSnap.data());
    tx.set(
      activeRef,
      {
        ...data,
        status: "active",
        archivedReason: admin.firestore.FieldValue.delete(),
        archivedFrom: admin.firestore.FieldValue.delete(),
        audit: {
          ...asObject(data.audit),
          archivedByUid: null,
          archivedAt: null,
          updatedByUid: params.uid || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    tx.delete(archivedRef);
  });
}
