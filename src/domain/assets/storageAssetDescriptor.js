function normalizeText(value) {
  return String(value || "").trim();
}

function toPositiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function resolveStorageDownloadToken(value) {
  const url = normalizeText(value);
  if (!/^https?:\/\//i.test(url)) return "";

  try {
    const parsed = new URL(url);
    if (
      parsed.hostname !== "firebasestorage.googleapis.com" &&
      !parsed.hostname.endsWith(".firebasestorage.app")
    ) {
      return "";
    }
    return normalizeText(parsed.searchParams.get("token"));
  } catch {
    return "";
  }
}

export function resolveStorageAssetUrl(value) {
  if (typeof value === "string") return normalizeText(value);
  if (!value || typeof value !== "object") return "";
  return normalizeText(
    value.url ||
      value.src ||
      value.downloadURL ||
      value.mediaUrl ||
      value.imageUrl
  );
}

export function buildStorageAssetDescriptor({
  url,
  storagePath,
  storageGeneration,
  storageDownloadToken,
  width,
  height,
  ...metadata
} = {}) {
  const resolvedUrl = resolveStorageAssetUrl(url || metadata);
  if (!resolvedUrl) return null;

  const resolvedWidth = toPositiveNumber(width ?? metadata.ancho);
  const resolvedHeight = toPositiveNumber(height ?? metadata.alto);
  const resolvedPath = normalizeText(storagePath || metadata.storagePath);
  const resolvedGeneration = normalizeText(
    storageGeneration || metadata.storageGeneration
  );
  const resolvedToken = normalizeText(
    storageDownloadToken ||
      metadata.storageDownloadToken ||
      resolveStorageDownloadToken(resolvedUrl)
  );

  return {
    ...metadata,
    url: resolvedUrl,
    ...(resolvedPath ? { storagePath: resolvedPath } : {}),
    ...(resolvedGeneration
      ? { storageGeneration: resolvedGeneration }
      : {}),
    ...(resolvedToken ? { storageDownloadToken: resolvedToken } : {}),
    ...(resolvedWidth ? { ancho: resolvedWidth } : {}),
    ...(resolvedHeight ? { alto: resolvedHeight } : {}),
  };
}

export function pickStorageAssetDescriptorFields(value) {
  const safeValue = value && typeof value === "object" ? value : {};
  const storagePath = normalizeText(safeValue.storagePath);
  const storageGeneration = normalizeText(safeValue.storageGeneration);
  const storageDownloadToken = normalizeText(safeValue.storageDownloadToken);

  return {
    ...(storagePath ? { storagePath } : {}),
    ...(storageGeneration ? { storageGeneration } : {}),
    ...(storageDownloadToken ? { storageDownloadToken } : {}),
  };
}
