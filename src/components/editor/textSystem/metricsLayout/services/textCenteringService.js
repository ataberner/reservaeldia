let canvasCache = null;

function getCanvasContext() {
  if (!canvasCache) {
    canvasCache = document.createElement("canvas");
  }
  return canvasCache.getContext("2d");
}

export function getTextMetrics({
  text = "Hg",
  fontSize,
  fontFamily,
  fontWeight = "normal",
  fontStyle = "normal",
}) {
  const ctx = getCanvasContext();
  ctx.font = `${fontWeight} ${fontStyle} ${fontSize}px ${fontFamily}`;
  const metrics = ctx.measureText(text);

  return {
    width: metrics.width,
    ascent: metrics.actualBoundingBoxAscent ?? fontSize * 0.8,
    descent: metrics.actualBoundingBoxDescent ?? fontSize * 0.2,
    actualBoundingBoxAscent: metrics.actualBoundingBoxAscent,
    actualBoundingBoxDescent: metrics.actualBoundingBoxDescent,
  };
}

export function getNormalizedTextMetrics({
  fontSize,
  fontFamily,
  fontWeight = "normal",
  fontStyle = "normal",
}) {
  const metrics = getTextMetrics({
    text: "Hg",
    fontSize,
    fontFamily,
    fontWeight,
    fontStyle,
  });

  const visualHeight = metrics.ascent + metrics.descent;

  return {
    ascent: metrics.ascent,
    descent: metrics.descent,
    visualHeight,
    baselineToCenter: metrics.ascent - (visualHeight / 2),
  };
}

export function getCenteredTextPosition({
  rectY,
  rectHeight,
  fontSize,
  fontFamily,
  fontWeight = "normal",
  fontStyle = "normal",
}) {
  const normalized = getNormalizedTextMetrics({
    fontSize,
    fontFamily,
    fontWeight,
    fontStyle,
  });

  const rectCenter = rectY + rectHeight / 2;
  const baselineY = rectCenter + normalized.baselineToCenter;
  const textTop = baselineY - normalized.ascent;

  return {
    baseline: baselineY,
    textTop,
    ascent: normalized.ascent,
    descent: normalized.descent,
    visualHeight: normalized.visualHeight,
    rectCenter,
  };
}
