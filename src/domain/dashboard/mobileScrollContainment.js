const DEFAULT_EDGE_TOLERANCE_PX = 1;
const DEFAULT_DELTA_TOLERANCE_PX = 0.5;

function toFiniteNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

export function shouldPreventMobileScrollChain({
  deltaY = 0,
  scrollTop = 0,
  scrollHeight = 0,
  clientHeight = 0,
  edgeTolerance = DEFAULT_EDGE_TOLERANCE_PX,
  deltaTolerance = DEFAULT_DELTA_TOLERANCE_PX,
} = {}) {
  const normalizedDeltaY = toFiniteNumber(deltaY, 0);
  if (Math.abs(normalizedDeltaY) <= deltaTolerance) return false;

  const normalizedScrollHeight = Math.max(0, toFiniteNumber(scrollHeight, 0));
  const normalizedClientHeight = Math.max(0, toFiniteNumber(clientHeight, 0));
  const maxScrollTop = Math.max(0, normalizedScrollHeight - normalizedClientHeight);
  const normalizedEdgeTolerance = Math.max(0, toFiniteNumber(edgeTolerance, 0));

  if (maxScrollTop <= normalizedEdgeTolerance) return true;

  const normalizedScrollTop = Math.min(
    maxScrollTop,
    Math.max(0, toFiniteNumber(scrollTop, 0))
  );

  if (normalizedDeltaY > 0) {
    return normalizedScrollTop >= maxScrollTop - normalizedEdgeTolerance;
  }

  return normalizedScrollTop <= normalizedEdgeTolerance;
}
