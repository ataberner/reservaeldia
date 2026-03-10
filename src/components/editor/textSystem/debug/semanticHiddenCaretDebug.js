import {
  formatInlineLogPayload,
  nextInlineFrameMeta,
} from "@/components/editor/overlays/inlineEditor/inlineEditorDebugPrimitives";

function parseDebugFlag(value, fallback = false) {
  if (typeof value === "undefined") return fallback;
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function roundSemanticCaretMetric(value, digits = 4) {
  const numeric = toFiniteNumber(value);
  return numeric === null ? null : Number(numeric.toFixed(digits));
}

export function rectToSemanticCaretPayload(rect) {
  if (!rect) return null;
  const x = toFiniteNumber(
    typeof rect.x !== "undefined" ? rect.x : rect.left
  );
  const y = toFiniteNumber(
    typeof rect.y !== "undefined" ? rect.y : rect.top
  );
  const width = toFiniteNumber(rect.width);
  const height = toFiniteNumber(rect.height);
  if ([x, y, width, height].some((value) => value === null)) {
    return null;
  }
  return {
    x: roundSemanticCaretMetric(x),
    y: roundSemanticCaretMetric(y),
    width: roundSemanticCaretMetric(width),
    height: roundSemanticCaretMetric(height),
  };
}

export function isSemanticCaretDebugEnabled() {
  if (typeof window === "undefined") return false;
  return parseDebugFlag(window.__INLINE_SEMANTIC_CARET_DEBUG, false);
}

export function isSemanticCaretPositionDebugEnabled() {
  if (typeof window === "undefined") return false;
  return (
    parseDebugFlag(window.__INLINE_SEMANTIC_CARET_POSITION_DEBUG, false) ||
    parseDebugFlag(window.__INLINE_SEMANTIC_CARET_DEBUG, false)
  );
}

function emitSemanticDebug(
  eventName,
  payload = {},
  {
    onDebugEvent = null,
    enabled = false,
    traceKey = "__INLINE_SEMANTIC_CARET_TRACE",
  } = {}
) {
  if (!enabled || typeof window === "undefined") {
    return false;
  }

  const meta = nextInlineFrameMeta();
  const ts = new Date().toISOString();
  const entry = {
    ts,
    frame: meta.frame,
    perfMs: meta.perfMs,
    eventName,
    ...payload,
  };

  const trace = Array.isArray(window[traceKey])
    ? window[traceKey]
    : [];
  trace.push(entry);
  if (trace.length > 300) {
    trace.splice(0, trace.length - 300);
  }
  window[traceKey] = trace;

  if (typeof console !== "undefined" && typeof console.log === "function") {
    console.log(
      `[INLINE][${ts}] ${eventName}\n${formatInlineLogPayload(entry)}`
    );
  }

  if (typeof onDebugEvent === "function") {
    onDebugEvent(eventName, {
      ts,
      frame: meta.frame,
      perfMs: meta.perfMs,
      ...payload,
    });
  }

  return true;
}

export function emitSemanticCaretDebug(
  eventName,
  payload = {},
  { onDebugEvent = null } = {}
) {
  return emitSemanticDebug(eventName, payload, {
    onDebugEvent,
    enabled: isSemanticCaretDebugEnabled(),
    traceKey: "__INLINE_SEMANTIC_CARET_TRACE",
  });
}

export function emitSemanticCaretPositionDebug(
  eventName,
  payload = {},
  { onDebugEvent = null } = {}
) {
  return emitSemanticDebug(eventName, payload, {
    onDebugEvent,
    enabled: isSemanticCaretPositionDebugEnabled(),
    traceKey: "__INLINE_SEMANTIC_CARET_POSITION_TRACE",
  });
}
