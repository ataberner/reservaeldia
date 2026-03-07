export function buildCanvasFontFamilyToken(fontFamily) {
  const rawFamily = String(fontFamily || "sans-serif").trim();
  const unquotedFamily = rawFamily.replace(/^['"]+|['"]+$/g, "");
  const safeFamily = unquotedFamily || "sans-serif";
  if (safeFamily.includes(",")) return safeFamily;
  return /\s/.test(safeFamily) ? `"${safeFamily}"` : safeFamily;
}

export function buildCanvasFontValue({ fontStyle, fontWeight, fontSizePx, fontFamily }) {
  return `${fontStyle || "normal"} ${fontWeight || "normal"} ${fontSizePx}px ${buildCanvasFontFamilyToken(fontFamily)}`;
}

export function measureTextWidthCanvas({
  text = "",
  fontSize = 24,
  fontFamily = "sans-serif",
  fontWeight = "normal",
  fontStyle = "normal",
  letterSpacing = 0,
}) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const safeText = String(text || "");
  const safeSize = Number.isFinite(Number(fontSize)) && Number(fontSize) > 0
    ? Number(fontSize)
    : 24;
  const safeLetterSpacing = Number.isFinite(Number(letterSpacing))
    ? Number(letterSpacing)
    : 0;
  const fontForCanvas = buildCanvasFontFamilyToken(fontFamily);
  ctx.font = `${fontStyle || "normal"} ${fontWeight || "normal"} ${safeSize}px ${fontForCanvas}`;

  const baseWidth = ctx.measureText(safeText).width;
  const spacingExtra = Math.max(0, safeText.length - 1) * safeLetterSpacing;
  return baseWidth + spacingExtra;
}

export function measureMultilineTextWidthCanvas({
  text = "",
  fontSize = 24,
  fontFamily = "sans-serif",
  fontWeight = "normal",
  fontStyle = "normal",
  letterSpacing = 0,
}) {
  const safeText = String(text ?? "").replace(/[ \t]+$/gm, "");
  const lines = safeText.split(/\r?\n/);
  return Math.max(
    ...lines.map((line) => {
      const width = measureTextWidthCanvas({
        text: String(line || ""),
        fontSize,
        fontFamily,
        fontWeight,
        fontStyle,
        letterSpacing,
      });
      return Number.isFinite(width) ? width : 0;
    }),
    20
  );
}
