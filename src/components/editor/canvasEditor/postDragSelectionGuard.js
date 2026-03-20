const DEFAULT_POST_DRAG_SELECTION_GUARD_MS = 180;
const WINDOW_KEY = "__CANVAS_POST_DRAG_SELECTION_GUARD_UNTIL";

function getNowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function notePostDragSelectionGuard(durationMs = DEFAULT_POST_DRAG_SELECTION_GUARD_MS) {
  if (typeof window === "undefined") return 0;

  const safeDuration = Math.max(0, Number(durationMs) || DEFAULT_POST_DRAG_SELECTION_GUARD_MS);
  const nextUntil = getNowMs() + safeDuration;
  window[WINDOW_KEY] = nextUntil;
  return nextUntil;
}

export function isPostDragSelectionGuardActive() {
  if (typeof window === "undefined") return false;

  const until = Number(window[WINDOW_KEY] || 0);
  return Number.isFinite(until) && until > getNowMs();
}
