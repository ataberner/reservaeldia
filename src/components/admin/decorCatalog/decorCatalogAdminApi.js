import { httpsCallable } from "firebase/functions";
import {
  addDoc,
  collection,
  doc,
  getCountFromServer,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, functions, storage } from "@/firebase";

const DECOR_CATALOG_COLLECTION = "decoraciones";
const DECOR_CATALOG_ARCHIVED_COLLECTION = "decoraciones_archived";
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set([
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const listDecorCatalogCallable = httpsCallable(functions, "adminListDecorCatalogV1");
const patchDecorMetadataCallable = httpsCallable(functions, "adminPatchDecorMetadataV1");
const setDecorActivationCallable = httpsCallable(functions, "adminSetDecorActivationV1");
const setDecorPriorityCallable = httpsCallable(functions, "adminSetDecorPriorityV1");
const revalidateDecorCallable = httpsCallable(functions, "adminRevalidateDecorV1");
const getDecorUsageStatsCallable = httpsCallable(functions, "adminGetDecorUsageStatsV1");

function unwrapCallableResult(result) {
  return result?.data || {};
}

function normalizeString(value) {
  return String(value || "").trim();
}

function parseKeywords(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeString(entry).toLowerCase())
      .filter(Boolean);
  }

  return normalizeString(value)
    .split(",")
    .map((entry) => normalizeString(entry).toLowerCase())
    .filter(Boolean);
}

function parseCategories(value) {
  const source = Array.isArray(value)
    ? value
    : normalizeString(value).split(",");
  const out = [];
  const seen = new Set();
  for (const entry of source) {
    const normalized = normalizeString(entry);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function clampPriority(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-9999, Math.min(9999, Math.round(parsed)));
}

function inferExtensionFromFile(file) {
  const fileName = normalizeString(file?.name).toLowerCase();
  const ext = fileName.includes(".") ? fileName.split(".").pop() : "";
  if (ext === "jpeg") return "jpg";
  if (ext) return ext;

  const mime = normalizeString(file?.type).toLowerCase();
  if (mime === "image/svg+xml") return "svg";
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "bin";
}

function sanitizeNameSegment(value) {
  const normalized = normalizeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
  return normalized || "decoracion";
}

function validateUploadFile(file) {
  if (!(file instanceof File)) {
    throw new Error("Selecciona un archivo valido.");
  }

  if (file.size <= 0) {
    throw new Error("El archivo esta vacio.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("El archivo supera el limite permitido de 12 MB.");
  }

  if (!SUPPORTED_MIME_TYPES.has(file.type)) {
    throw new Error("Formato no permitido. Usa PNG, JPG, WEBP o SVG.");
  }
}

function buildStoragePath(file, desiredName) {
  const ext = inferExtensionFromFile(file);
  const baseName = sanitizeNameSegment(desiredName || file?.name || "decoracion");
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `decoraciones/originals/${Date.now()}-${baseName}-${randomSuffix}.${ext}`;
}

export async function listDecorCatalog({
  includeArchived = true,
  limit = 400,
  cursor = null,
  includeTotals = false,
} = {}) {
  const normalizedCursor = cursor && typeof cursor === "object"
    ? {
        ...(normalizeString(cursor.active) ? { active: normalizeString(cursor.active) } : {}),
        ...(normalizeString(cursor.archived) ? { archived: normalizeString(cursor.archived) } : {}),
      }
    : null;

  const result = await listDecorCatalogCallable({
    includeArchived: includeArchived === true,
    limit: Math.max(1, Math.min(400, Number(limit || 100))),
    includeTotals: includeTotals === true,
    ...(normalizedCursor ? { cursor: normalizedCursor } : {}),
  });
  return unwrapCallableResult(result);
}

export async function getDecorCatalogTotalsFallback({ includeArchived = true } = {}) {
  const [activeSnap, archivedSnap] = await Promise.all([
    getCountFromServer(collection(db, DECOR_CATALOG_COLLECTION)),
    includeArchived
      ? getCountFromServer(collection(db, DECOR_CATALOG_ARCHIVED_COLLECTION))
      : Promise.resolve({ data: () => ({ count: 0 }) }),
  ]);

  const active = Number(activeSnap?.data?.().count || 0);
  const archived = Number(archivedSnap?.data?.().count || 0);
  return {
    active: Math.max(0, Math.round(active)),
    archived: Math.max(0, Math.round(archived)),
    total: Math.max(0, Math.round(active + archived)),
  };
}

export async function patchDecorMetadata({ decorId, patch }) {
  const result = await patchDecorMetadataCallable({
    decorId: normalizeString(decorId),
    patch: patch || {},
  });
  return unwrapCallableResult(result);
}

export async function setDecorActivation({ decorId, active, reason }) {
  const result = await setDecorActivationCallable({
    decorId: normalizeString(decorId),
    active: active === true,
    reason: normalizeString(reason || "admin-ui-toggle"),
  });
  return unwrapCallableResult(result);
}

export async function setDecorPriority({ decorId, priority }) {
  const result = await setDecorPriorityCallable({
    decorId: normalizeString(decorId),
    priority: clampPriority(priority),
  });
  return unwrapCallableResult(result);
}

export async function revalidateDecor({
  decorId,
  force = true,
  archiveOnReject = true,
}) {
  const result = await revalidateDecorCallable({
    decorId: normalizeString(decorId),
    force: force !== false,
    archiveOnReject: archiveOnReject !== false,
  });
  return unwrapCallableResult(result);
}

export async function getDecorUsageStats({ limit = 20 } = {}) {
  const result = await getDecorUsageStatsCallable({
    limit: Math.max(1, Math.min(100, Number(limit || 20))),
  });
  return unwrapCallableResult(result);
}

export async function uploadDecorBootstrap({
  file,
  nombre,
  categoria,
  categorias,
  keywords,
  priority,
  license,
}) {
  validateUploadFile(file);

  const normalizedName = normalizeString(nombre || file.name);
  const normalizedCategories = parseCategories(
    Array.isArray(categorias) && categorias.length > 0 ? categorias : categoria
  );
  const normalizedCategory = normalizedCategories[0] || "";
  const normalizedKeywords = parseKeywords(keywords);
  const normalizedPriority = clampPriority(priority);
  const normalizedLicense = normalizeString(license);

  const storagePath = buildStoragePath(file, normalizedName);
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file, {
    contentType: file.type || undefined,
    customMetadata: {
      uploadedFrom: "admin-decor-catalog-v1",
    },
  });

  const url = await getDownloadURL(storageRef);
  const format = inferExtensionFromFile(file);

  const docRef = await addDoc(collection(db, DECOR_CATALOG_COLLECTION), {
    nombre: normalizedName || file.name,
    url,
    categoria: normalizedCategory,
    categorias: normalizedCategories,
    keywords: normalizedKeywords,
    tags: normalizedKeywords,
    popular: normalizedPriority > 0,
    priority: normalizedPriority,
    schemaVersion: 1,
    assetType: "decoracion",
    status: "processing",
    storagePath,
    contentType: file.type || null,
    bytes: Number(file.size || 0),
    format,
    license: normalizedLicense || "",
    width: null,
    height: null,
    hasAlpha: null,
    thumbnails: null,
    creado: serverTimestamp(),
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });

  return {
    decorId: docRef.id,
    storagePath,
    url,
  };
}

export function watchDecorById(decorId, onChange, onError) {
  const normalizedId = normalizeString(decorId);
  if (!normalizedId) {
    return () => {};
  }

  let activeSnapshot = null;
  let archivedSnapshot = null;

  const notify = () => {
    if (activeSnapshot?.exists()) {
      onChange?.({
        exists: true,
        source: "active",
        id: normalizedId,
        data: activeSnapshot.data() || {},
      });
      return;
    }

    if (archivedSnapshot?.exists()) {
      onChange?.({
        exists: true,
        source: "archived",
        id: normalizedId,
        data: archivedSnapshot.data() || {},
      });
      return;
    }

    onChange?.({
      exists: false,
      source: null,
      id: normalizedId,
      data: null,
    });
  };

  const unsubscribeActive = onSnapshot(
    doc(db, DECOR_CATALOG_COLLECTION, normalizedId),
    (snapshot) => {
      activeSnapshot = snapshot;
      notify();
    },
    (error) => {
      onError?.(error);
    }
  );

  const unsubscribeArchived = onSnapshot(
    doc(db, DECOR_CATALOG_ARCHIVED_COLLECTION, normalizedId),
    (snapshot) => {
      archivedSnapshot = snapshot;
      notify();
    },
    (error) => {
      onError?.(error);
    }
  );

  return () => {
    unsubscribeActive();
    unsubscribeArchived();
  };
}

// Aliases de compatibilidad para reutilizar el hook espejo de iconos sin reescritura masiva.
export const listIconCatalog = listDecorCatalog;
export const getIconCatalogTotalsFallback = getDecorCatalogTotalsFallback;
export async function patchIconMetadata({ iconId, patch }) {
  return patchDecorMetadata({ decorId: iconId, patch });
}
export async function setIconActivation({ iconId, active, reason }) {
  return setDecorActivation({ decorId: iconId, active, reason });
}
export async function setIconPriority({ iconId, priority }) {
  return setDecorPriority({ decorId: iconId, priority });
}
export async function revalidateIcon({ iconId, force, archiveOnReject }) {
  return revalidateDecor({ decorId: iconId, force, archiveOnReject });
}
export const getIconUsageStats = getDecorUsageStats;
export async function uploadIconBootstrap(payload) {
  const result = await uploadDecorBootstrap(payload);
  return {
    iconId: result?.decorId || "",
    storagePath: result?.storagePath || "",
    url: result?.url || "",
  };
}
export const watchIconById = watchDecorById;
