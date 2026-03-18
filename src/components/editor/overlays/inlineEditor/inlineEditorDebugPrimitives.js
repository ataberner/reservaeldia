export function isInlineDebugEnabled() {
  return typeof window !== "undefined" && window.__INLINE_DEBUG === true;
}

export function isInlineBoxDebugEnabled() {
  return typeof window !== "undefined" && window.__INLINE_BOX_DEBUG === true;
}

export function formatInlineLogPayload(payload = {}) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    return String(error || payload);
  }
}

export function nextInlineFrameMeta() {
  if (typeof window === "undefined") {
    return { frame: null, perfMs: null };
  }
  const prev = Number(window.__INLINE_FRAME_SEQ || 0);
  const next = prev + 1;
  window.__INLINE_FRAME_SEQ = next;
  const perfMs =
    typeof window.performance?.now === "function"
      ? Number(window.performance.now().toFixed(3))
      : null;
  return { frame: next, perfMs };
}
