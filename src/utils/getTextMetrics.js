let canvasCache = null;

/**
 * Obtiene el contexto canvas cacheado
 */
function getCanvasContext() {
  if (!canvasCache) {
    canvasCache = document.createElement("canvas");
  }
  return canvasCache.getContext("2d");
}

/**
 * Mide métricas reales de una fuente usando Canvas.
 * SIEMPRE usa el mismo canvas para garantizar consistencia.
 */
export function getTextMetrics({ text = "Hg", fontSize, fontFamily, fontWeight = "normal", fontStyle = "normal" }) {
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

/**
 * Calcula métricas normalizadas para un texto.
 * Esta es la ÚNICA fuente de verdad para posicionamiento.
 */
export function getNormalizedTextMetrics({ fontSize, fontFamily, fontWeight = "normal", fontStyle = "normal" }) {
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
    // Distancia desde el baseline al centro visual
    baselineToCenter: metrics.ascent - (visualHeight / 2),
  };
}

/**
 * Calcula la posición Y del baseline para centrar texto en un rectángulo.
 * Retorna también el top absoluto del texto (baseline - ascent).
 */
export function getCenteredTextPosition({
  rectY,
  rectHeight,
  fontSize,
  fontFamily,
  fontWeight = "normal",
  fontStyle = "normal",
}) {
  const normalized = getNormalizedTextMetrics({ fontSize, fontFamily, fontWeight, fontStyle });
  
  const rectCenter = rectY + rectHeight / 2;
  
  // Baseline centrado: centro del rect + offset desde baseline al centro visual
  const baselineY = rectCenter + normalized.baselineToCenter;
  
  // Top del texto: baseline - ascent
  const textTop = baselineY - normalized.ascent;
  
  return {
    baseline: baselineY,        // ← Posición Y del baseline
    textTop,                     // ← Posición Y del top visual del texto
    ascent: normalized.ascent,
    descent: normalized.descent,
    visualHeight: normalized.visualHeight,
    rectCenter,
  };
}