function normalizeText(value) {
  return String(value || "").trim();
}

export const EDITOR_SESSION_KINDS = Object.freeze({
  DRAFT: "draft",
  TEMPLATE: "template",
});

export function isSupportedEditorSessionKind(value) {
  const kind = normalizeText(value).toLowerCase();
  return kind === EDITOR_SESSION_KINDS.DRAFT || kind === EDITOR_SESSION_KINDS.TEMPLATE;
}

export function normalizeEditorSession(value, fallbackSlug = "") {
  const safeValue = value && typeof value === "object" ? value : {};
  const requestedKind = normalizeText(safeValue.kind).toLowerCase();
  const kind = requestedKind || EDITOR_SESSION_KINDS.DRAFT;
  const id = normalizeText(safeValue.id) || normalizeText(fallbackSlug);

  return {
    kind,
    id,
    isSupported: isSupportedEditorSessionKind(kind),
  };
}
