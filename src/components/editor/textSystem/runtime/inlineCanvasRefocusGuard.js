export const INLINE_CANVAS_REFOCUS_BLUR_GUARD_MS = 250;

export function createInlineCanvasRefocusIntent({
  editingId,
  clientX = null,
  clientY = null,
  fallbackBoundary = "end",
  nowMs = Date.now(),
} = {}) {
  if (!editingId) return null;

  return {
    editingId,
    clientX,
    clientY,
    fallbackBoundary,
    armedAtMs: Number(nowMs),
  };
}

export function shouldHonorInlineCanvasRefocus({
  pendingRefocus = null,
  editingId = null,
  nowMs = Date.now(),
  guardMs = INLINE_CANVAS_REFOCUS_BLUR_GUARD_MS,
} = {}) {
  if (!editingId || pendingRefocus?.editingId !== editingId) return false;

  const armedAtMs = Number(pendingRefocus?.armedAtMs);
  const currentTimeMs = Number(nowMs);
  const maxAgeMs = Math.max(0, Number(guardMs) || 0);
  if (!Number.isFinite(armedAtMs) || !Number.isFinite(currentTimeMs)) {
    return false;
  }

  const ageMs = currentTimeMs - armedAtMs;
  return ageMs >= 0 && ageMs <= maxAgeMs;
}
