const DRAFT_PREVIEW_KEYS = Object.freeze([
  "thumbnailUrl",
  "thumbnailurl",
  "thumbnail_url",
  "thumbnailURL",
  "portada",
  "previewUrl",
  "previewurl",
  "preview_url",
  "previewURL",
]);

function toNonEmptyString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function isImageSrc(value) {
  if (!value) return false;
  return (
    /^https?:\/\//i.test(value) ||
    /^data:image\//i.test(value) ||
    /^blob:/i.test(value) ||
    value.startsWith("/")
  );
}

export function getDraftPreviewCandidates(
  draft,
  options = { includePlaceholder: true }
) {
  const includePlaceholder = options?.includePlaceholder !== false;
  const candidates = [];

  for (const key of DRAFT_PREVIEW_KEYS) {
    const candidate = toNonEmptyString(draft?.[key]);
    if (!isImageSrc(candidate)) continue;
    if (candidates.includes(candidate)) continue;
    candidates.push(candidate);
  }

  if (includePlaceholder && !candidates.includes("/placeholder.jpg")) {
    candidates.push("/placeholder.jpg");
  }

  return candidates;
}
