// utils/fontMetrics.js
const cache = new Map();
const TEST_CHARS = 'Mg';        // Altos + descendentes

export function getFontMetrics(fontFamily, fontSize) {
  const key = `${fontFamily}|${fontSize}`;
  if (cache.has(key)) return cache.get(key);

  // Canvas fuera de pantalla
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `${fontSize}px ${fontFamily}`;

  // Métricas avanzadas
  const m = ctx.measureText(TEST_CHARS);
  let ascent = m.actualBoundingBoxAscent;
  let descent = m.actualBoundingBoxDescent;

  // Fallback para navegadores sin *actualBoundingBox*
  if (ascent === undefined) {
    ascent  = 0.8 * fontSize;   // heurística
    descent = 0.2 * fontSize;
  }

  const metrics = { ascent, descent, baselineShift: ascent };
  cache.set(key, metrics);
  return metrics;
}
