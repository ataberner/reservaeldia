import { roundInlineMetric } from "@/components/editor/overlays/inlineGeometry";

export const INLINE_ALIGNMENT_MODEL_V2_VERSION = "phase-atomic-v2";
export const INLINE_TRACE_RING_MAX = 600;

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function resolvePixelSnap(rawOffset) {
  const base = toFiniteNumber(rawOffset, 0);
  if (typeof window === "undefined") {
    return {
      snappedOffset: base,
      pixelSnapStep: 1,
      pixelSnapUsed: false,
    };
  }
  const dpr = toFiniteNumber(window.devicePixelRatio, 1) || 1;
  const pixelSnapStep = dpr > 0 ? 1 / dpr : 1;
  if (!Number.isFinite(pixelSnapStep) || pixelSnapStep <= 0 || pixelSnapStep > 0.5) {
    return {
      snappedOffset: base,
      pixelSnapStep: roundInlineMetric(pixelSnapStep),
      pixelSnapUsed: false,
    };
  }
  return {
    snappedOffset: Math.round(base / pixelSnapStep) * pixelSnapStep,
    pixelSnapStep: roundInlineMetric(pixelSnapStep),
    pixelSnapUsed: true,
  };
}

export function normalizeInlineOverlayEngine(engine) {
  return engine === "phase_atomic_v2" ? "phase_atomic_v2" : "legacy";
}

export function computeInlineAlignmentOffsetV2({
  domCssInkProbe,
  konvaInkProbe,
  editableLineHeightPx,
  fallbackOffset = 0,
}) {
  const domTopInset = toFiniteNumber(domCssInkProbe?.glyphTopInsetPx);
  const konvaTopInset = toFiniteNumber(konvaInkProbe?.glyphTopInsetPx);
  const saneLimit = Math.min(Math.max(toFiniteNumber(editableLineHeightPx, 0) * 0.28, 8), 96);

  if (!Number.isFinite(domTopInset) || !Number.isFinite(konvaTopInset)) {
    return {
      source: "domCss",
      domTopInset: roundInlineMetric(domTopInset),
      konvaTopInset: roundInlineMetric(konvaTopInset),
      rawOffset: null,
      saneLimit: roundInlineMetric(saneLimit),
      snappedOffset: roundInlineMetric(fallbackOffset),
      pixelSnapStep: null,
      pixelSnapUsed: false,
      appliedOffset: roundInlineMetric(fallbackOffset),
      blockedReason: "missing-metrics",
    };
  }

  const rawOffset = konvaTopInset - domTopInset;
  if (!Number.isFinite(rawOffset)) {
    return {
      source: "domCss",
      domTopInset: roundInlineMetric(domTopInset),
      konvaTopInset: roundInlineMetric(konvaTopInset),
      rawOffset: null,
      saneLimit: roundInlineMetric(saneLimit),
      snappedOffset: roundInlineMetric(fallbackOffset),
      pixelSnapStep: null,
      pixelSnapUsed: false,
      appliedOffset: roundInlineMetric(fallbackOffset),
      blockedReason: "invalid-raw-offset",
    };
  }

  const halfLineHeight = toFiniteNumber(editableLineHeightPx, 0) * 0.5;
  if (
    (Number.isFinite(halfLineHeight) && Math.abs(rawOffset) > halfLineHeight) ||
    Math.abs(rawOffset) > saneLimit
  ) {
    return {
      source: "domCss",
      domTopInset: roundInlineMetric(domTopInset),
      konvaTopInset: roundInlineMetric(konvaTopInset),
      rawOffset: roundInlineMetric(rawOffset),
      saneLimit: roundInlineMetric(saneLimit),
      snappedOffset: roundInlineMetric(fallbackOffset),
      pixelSnapStep: null,
      pixelSnapUsed: false,
      appliedOffset: roundInlineMetric(fallbackOffset),
      blockedReason: "out-of-range",
    };
  }

  const snap = resolvePixelSnap(rawOffset);
  return {
    source: "domCss",
    domTopInset: roundInlineMetric(domTopInset),
    konvaTopInset: roundInlineMetric(konvaTopInset),
    rawOffset: roundInlineMetric(rawOffset),
    saneLimit: roundInlineMetric(saneLimit),
    snappedOffset: roundInlineMetric(snap.snappedOffset),
    pixelSnapStep: snap.pixelSnapStep,
    pixelSnapUsed: snap.pixelSnapUsed,
    appliedOffset: roundInlineMetric(snap.snappedOffset),
    blockedReason: null,
  };
}

export function pushInlineTraceEvent(eventName, payload = {}) {
  if (typeof window === "undefined") return;
  const list = Array.isArray(window.__INLINE_TRACE) ? window.__INLINE_TRACE : [];
  const nowIso = new Date().toISOString();
  const perfMs =
    typeof window.performance?.now === "function"
      ? roundInlineMetric(Number(window.performance.now()), 3)
      : null;
  list.push({
    ts: nowIso,
    perfMs,
    eventName,
    ...payload,
  });
  if (list.length > INLINE_TRACE_RING_MAX) {
    list.splice(0, list.length - INLINE_TRACE_RING_MAX);
  }
  window.__INLINE_TRACE = list;
}

export function summarizeInlineTrace({
  trace = [],
  maxErrorPx = 0.5,
  phases = ["after-first-paint", "post-layout"],
} = {}) {
  const filtered = trace.filter((entry) => phases.includes(entry?.phase || entry?.eventName));
  const failures = filtered.filter((entry) => {
    const dx = Math.abs(Number(entry?.dx || 0));
    const dy = Math.abs(Number(entry?.dy || 0));
    return dx > maxErrorPx || dy > maxErrorPx;
  });
  return {
    sampleCount: filtered.length,
    maxErrorPx,
    failures: failures.length,
    passRate:
      filtered.length > 0
        ? roundInlineMetric(((filtered.length - failures.length) / filtered.length) * 100, 2)
        : null,
  };
}
