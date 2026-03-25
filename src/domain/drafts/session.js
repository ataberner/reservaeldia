function normalizeText(value) {
  return String(value || "").trim();
}

export function normalizeEditorSession(value, fallbackSlug = "") {
  const safeValue = value && typeof value === "object" ? value : {};
  const kind =
    normalizeText(safeValue.kind).toLowerCase() === "template"
      ? "template"
      : "draft";
  const id = normalizeText(safeValue.id) || normalizeText(fallbackSlug);

  return {
    kind,
    id,
  };
}
