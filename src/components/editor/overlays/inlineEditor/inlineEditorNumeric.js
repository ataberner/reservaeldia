export function roundMetric(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

export function snapToDevicePixelGrid(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  if (typeof window === "undefined") return raw;
  const dpr = Number(window.devicePixelRatio || 1);
  const step = Number.isFinite(dpr) && dpr > 0 ? 1 / dpr : 1;
  if (!Number.isFinite(step) || step <= 0) return raw;
  // Avoid coarse snapping on low-DPI / fractional scaling (e.g. step 0.8 at 125% zoom).
  if (step > 0.5) return raw;
  return Math.round(raw / step) * step;
}
