// src/utils/getTextMetrics.js
let canvasCache = null;

export function getTextMetrics({ fontSize, fontFamily, fontWeight, fontStyle, text }) {
  // ✅ 1. Si hay DOM, usar medición real
  if (typeof document !== "undefined") {
    const span = document.createElement("span");
    span.style.position = "absolute";
    span.style.visibility = "hidden";
    span.style.whiteSpace = "pre";
    span.style.fontSize = `${fontSize}px`;
    span.style.fontFamily = fontFamily;
    span.style.fontWeight = fontWeight;
    span.style.fontStyle = fontStyle;
    span.textContent = text || "Hg"; // altos y bajos
    document.body.appendChild(span);

    const rect = span.getBoundingClientRect();
    const height = rect.height;

    // usamos aproximación proporcional (normalizada al fontSize)
    const ascent = height * 0.8;
    const descent = height * 0.2;

    document.body.removeChild(span);
    return { ascent, descent, height };
  }

  // ✅ 2. Fallback (sin DOM)
  if (!canvasCache) {
    canvasCache = document.createElement("canvas");
  }
  const ctx = canvasCache.getContext("2d");
  ctx.font = `${fontWeight} ${fontStyle} ${fontSize}px ${fontFamily}`;
  const metrics = ctx.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;
  const height = ascent + descent;
  return { ascent, descent, height };
}
