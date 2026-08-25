function normalizeText(value) {
  return String(value || "").trim();
}

export const COVER_IMAGE_SOURCE_KINDS = Object.freeze({
  CANVAS_OBJECT: "canvas-object",
  SECTION_BACKGROUND: "section-background",
});

export function normalizeCoverImageSource(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const kind = normalizeText(value.kind);
  if (kind === COVER_IMAGE_SOURCE_KINDS.CANVAS_OBJECT) {
    const objectId = normalizeText(value.objectId);
    return objectId ? { kind, objectId } : null;
  }

  if (kind === COVER_IMAGE_SOURCE_KINDS.SECTION_BACKGROUND) {
    const sectionId = normalizeText(value.sectionId);
    return sectionId ? { kind, sectionId } : null;
  }

  return null;
}
