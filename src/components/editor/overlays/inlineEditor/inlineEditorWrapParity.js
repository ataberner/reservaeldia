function normalizeKonvaWrapMode(rawWrapMode) {
  const normalizedWrapMode = String(rawWrapMode || "none").trim().toLowerCase();
  if (
    normalizedWrapMode === "none" ||
    normalizedWrapMode === "char" ||
    normalizedWrapMode === "word"
  ) {
    return normalizedWrapMode;
  }
  return "none";
}

export function resolveInlineDomTextFlow({
  isSingleLine = true,
  konvaWrapMode = "none",
} = {}) {
  const normalizedKonvaWrapMode = normalizeKonvaWrapMode(konvaWrapMode);
  const usesBrowserWrap = !isSingleLine && normalizedKonvaWrapMode !== "none";

  return {
    konvaWrapMode: normalizedKonvaWrapMode,
    usesBrowserWrap,
    shouldUsePerceptualScale: isSingleLine || usesBrowserWrap,
    whiteSpace: isSingleLine ? "pre" : (usesBrowserWrap ? "pre-wrap" : "pre"),
    overflowWrap: isSingleLine || !usesBrowserWrap ? "normal" : "break-word",
    wordBreak: isSingleLine || !usesBrowserWrap ? "normal" : "break-word",
  };
}
