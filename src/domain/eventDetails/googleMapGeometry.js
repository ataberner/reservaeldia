export const GOOGLE_MAP_MIN_SIZE = 200;

function resolveDimension(value, fallback) {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(GOOGLE_MAP_MIN_SIZE, numeric)
    : fallback;
}

export function resolveGoogleMapDimensions(obj = {}) {
  return {
    width: resolveDimension(obj?.width, 361),
    height: resolveDimension(obj?.height, 220),
  };
}
