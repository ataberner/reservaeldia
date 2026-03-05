function normalizeInlineRawText(rawText) {
  return String(rawText ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\u200B/g, "");
}

function trimPhantomTerminalNewline(normalizedText) {
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

export function normalizeInlineEditableText(
  rawText,
  { trimPhantomTrailingNewline = true } = {}
) {
  const normalized = normalizeInlineRawText(rawText);
  if (!trimPhantomTrailingNewline) return normalized;
  return trimPhantomTerminalNewline(normalized);
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
