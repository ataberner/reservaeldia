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

const ICON_CATALOG_COLLECTION = "iconos";
const ICON_CATALOG_ARCHIVED_COLLECTION = "iconos_archived";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set([
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const listIconCatalogCallable = httpsCallable(functions, "adminListIconCatalogV2");
const patchIconMetadataCallable = httpsCallable(functions, "adminPatchIconMetadataV2");
const setIconActivationCallable = httpsCallable(functions, "adminSetIconActivationV2");
const setIconPriorityCallable = httpsCallable(functions, "adminSetIconPriorityV2");
const revalidateIconCallable = httpsCallable(functions, "adminRevalidateIconV2");
const getIconUsageStatsCallable = httpsCallable(functions, "adminGetIconUsageStatsV2");

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
  if (mime === "image/gif") return "gif";
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
  return normalized || "icon";
}

function validateUploadFile(file) {
  if (!(file instanceof File)) {
    throw new Error("Selecciona un archivo valido.");
  }

  if (file.size <= 0) {
    throw new Error("El archivo esta vacio.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("El archivo supera el limite permitido de 8 MB.");
  }

  if (!SUPPORTED_MIME_TYPES.has(file.type)) {
    throw new Error(
      "Formato no permitido. Usa SVG, PNG, JPG, WEBP o GIF."
    );
  }
}

function buildStoragePath(file, desiredName) {
  const ext = inferExtensionFromFile(file);
  const baseName = sanitizeNameSegment(desiredName || file?.name || "icon");
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `iconos/${Date.now()}-${baseName}-${randomSuffix}.${ext}`;
}

export async function listIconCatalog({
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

  const result = await listIconCatalogCallable({
    includeArchived: includeArchived === true,
    limit: Math.max(1, Math.min(400, Number(limit || 100))),
    includeTotals: includeTotals === true,
    ...(normalizedCursor ? { cursor: normalizedCursor } : {}),
  });
  return unwrapCallableResult(result);
}

export async function getIconCatalogTotalsFallback({ includeArchived = true } = {}) {
  const [activeSnap, archivedSnap] = await Promise.all([
    getCountFromServer(collection(db, ICON_CATALOG_COLLECTION)),
    includeArchived
      ? getCountFromServer(collection(db, ICON_CATALOG_ARCHIVED_COLLECTION))
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

export async function patchIconMetadata({ iconId, patch }) {
  const result = await patchIconMetadataCallable({
    iconId: normalizeString(iconId),
    patch: patch || {},
  });
  return unwrapCallableResult(result);
}

export async function setIconActivation({ iconId, active, reason }) {
  const result = await setIconActivationCallable({
    iconId: normalizeString(iconId),
    active: active === true,
    reason: normalizeString(reason || "admin-ui-toggle"),
  });
  return unwrapCallableResult(result);
}

export async function setIconPriority({ iconId, priority }) {
  const result = await setIconPriorityCallable({
    iconId: normalizeString(iconId),
    priority: clampPriority(priority),
  });
  return unwrapCallableResult(result);
}

export async function revalidateIcon({
  iconId,
  force = true,
  archiveOnReject = true,
}) {
  const result = await revalidateIconCallable({
    iconId: normalizeString(iconId),
    force: force !== false,
    archiveOnReject: archiveOnReject !== false,
  });
  return unwrapCallableResult(result);
}

export async function getIconUsageStats({ limit = 20 } = {}) {
  const result = await getIconUsageStatsCallable({
    limit: Math.max(1, Math.min(100, Number(limit || 20))),
  });
  return unwrapCallableResult(result);
}

export async function uploadIconBootstrap({
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
      uploadedFrom: "admin-icon-catalog-v2",
    },
  });

  const url = await getDownloadURL(storageRef);
  const format = inferExtensionFromFile(file);

  const docRef = await addDoc(collection(db, ICON_CATALOG_COLLECTION), {
    nombre: normalizedName || file.name,
    url,
    categoria: normalizedCategory,
    categorias: normalizedCategories,
    keywords: normalizedKeywords,
    tags: normalizedKeywords,
    popular: normalizedPriority > 0,
    priority: normalizedPriority,
    schemaVersion: 2,
    assetType: "icon",
    status: "processing",
    storagePath,
    contentType: file.type || null,
    bytes: Number(file.size || 0),
    format,
    license: normalizedLicense || "",
    creado: serverTimestamp(),
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });

  return {
    iconId: docRef.id,
    storagePath,
    url,
  };
}

export function watchIconById(iconId, onChange, onError) {
  const normalizedId = normalizeString(iconId);
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
    doc(db, ICON_CATALOG_COLLECTION, normalizedId),
    (snapshot) => {
      activeSnapshot = snapshot;
      notify();
    },
    (error) => {
      onError?.(error);
    }
  );

  const unsubscribeArchived = onSnapshot(
    doc(db, ICON_CATALOG_ARCHIVED_COLLECTION, normalizedId),
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
