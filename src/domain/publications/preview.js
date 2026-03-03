const PUBLICATION_PREVIEW_KEYS = Object.freeze([
  "portada",
  "thumbnailUrl",
  "thumbnailurl",
  "thumbnail_url",
  "thumbnailURL",
  "previewUrl",
  "previewurl",
  "preview_url",
  "previewURL",
]);

function toNonEmptyString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function getPublicationPreview(data) {
  for (const key of PUBLICATION_PREVIEW_KEYS) {
    const candidate = toNonEmptyString(data?.[key]);
    if (candidate) return candidate;
  }
  return "";
}

export function resolvePublicationEditableDraftSlug(data) {
  const candidates = [data?.borradorSlug, data?.borradorId, data?.draftSlug];
  for (const value of candidates) {
    const candidate = toNonEmptyString(value);
    if (candidate) return candidate;
  }
  return "";
}

export function resolvePublicationDraftLookupSlug(data, fallbackSlug = "") {
  const candidates = [
    resolvePublicationEditableDraftSlug(data),
    data?.slugOriginal,
    data?.slug,
    fallbackSlug,
  ];

  for (const value of candidates) {
    const candidate = toNonEmptyString(value);
    if (candidate) return candidate;
  }

  return "";
}
