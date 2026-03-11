function normalizeInlineRawText(rawText) {
  return String(rawText ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\u200B/g, "");
}

function trimModelPhantomTerminalNewline(normalizedText) {
  const trailingNewlines = normalizedText.match(/\n+$/)?.[0].length || 0;
  if (trailingNewlines === 0) return normalizedText;

  if (trailingNewlines >= 2) {
    // contentEditable suele reportar una linea vacia extra temporal.
    return normalizedText.slice(0, -1);
  }

  // Caso de 1 linea: muchos navegadores devuelven un '\n' terminal fantasma.
  const withoutTerminal = normalizedText.slice(0, -1);
  const hasInternalBreaks = withoutTerminal.includes("\n");
  if (!hasInternalBreaks) return withoutTerminal;

  return normalizedText;
}

function trimDomPhantomTerminalNewline(normalizedText) {
  const trailingNewlines = normalizedText.match(/\n+$/)?.[0].length || 0;
  if (trailingNewlines === 0) return normalizedText;

  // El DOM del contentEditable suele agregar exactamente una linea terminal
  // fantasma; removemos solo una para conservar lineas vacias reales.
  return normalizedText.slice(0, -1);
}

export function normalizeInlineEditableText(
  rawText,
  { trimPhantomTrailingNewline = true, source = "model" } = {}
) {
  const normalized = normalizeInlineRawText(rawText);
  if (!trimPhantomTrailingNewline) return normalized;
  return source === "dom"
    ? trimDomPhantomTerminalNewline(normalized)
    : trimModelPhantomTerminalNewline(normalized);
}

export function normalizeInlineEditableDomText(
  rawText,
  { trimPhantomTrailingNewline = true } = {}
) {
  return normalizeInlineEditableText(rawText, {
    trimPhantomTrailingNewline,
    source: "dom",
  });
}

export function getInlineLineStats(
  value,
  { canonical = true, trimPhantomTrailingNewline = true } = {}
) {
  const normalized = canonical
    ? normalizeInlineEditableText(value, { trimPhantomTrailingNewline })
    : normalizeInlineRawText(value);
  const trailing = normalized.match(/\n+$/)?.[0];
  return {
    normalized,
    length: normalized.length,
    lineCount: normalized === "" ? 1 : normalized.split("\n").length,
    trailingNewlines: trailing ? trailing.length : 0,
  };
}

export function countInlineLines(value, options = {}) {
  return getInlineLineStats(value, options).lineCount;
}

export function countInlineTrailingNewlines(value, options = {}) {
  return getInlineLineStats(value, options).trailingNewlines;
}
