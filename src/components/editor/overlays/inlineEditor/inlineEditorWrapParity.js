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
  const usesBrowserWrap = normalizedKonvaWrapMode !== "none";
  const isSingleVisualLine = Boolean(isSingleLine) && !usesBrowserWrap;

  return {
    konvaWrapMode: normalizedKonvaWrapMode,
    usesBrowserWrap,
    isSingleVisualLine,
    shouldUsePerceptualScale: isSingleLine || usesBrowserWrap,
    whiteSpace: usesBrowserWrap ? "pre-wrap" : "pre",
    overflowWrap: usesBrowserWrap ? "break-word" : "normal",
    wordBreak: usesBrowserWrap ? "break-word" : "normal",
  };
}

export function isInlineDomSoftWrapEnabled(style = null) {
  const whiteSpace = String(style?.whiteSpace || "").trim().toLowerCase();
  return (
    whiteSpace === "normal" ||
    whiteSpace === "pre-wrap" ||
    whiteSpace === "pre-line" ||
    whiteSpace === "break-spaces"
  );
}
