import { createPortal } from "react-dom";
import { useMemo, useEffect, useRef, useLayoutEffect, useCallback, useState } from "react";
import {
  getInlineKonvaProjectedRectViewport,
  resolveInlineKonvaTextNode,
} from "@/components/editor/overlays/inlineGeometry";
import {
  getInlineLineStats,
  normalizeInlineEditableText,
} from "@/components/editor/overlays/inlineTextModel";
import {
  INLINE_ALIGNMENT_MODEL_V2_VERSION,
  computeInlineAlignmentOffsetV2,
  normalizeInlineOverlayEngine,
  pushInlineTraceEvent,
  summarizeInlineTrace,
} from "@/components/editor/overlays/inlineAlignmentModelV2";

function isInlineDebugEnabled() {
  return typeof window !== "undefined" && window.__INLINE_DEBUG !== false;
}

function isInlineBoxDebugEnabled() {
  return typeof window !== "undefined" && window.__INLINE_BOX_DEBUG === true;
}

function formatInlineLogPayload(payload = {}) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    return String(error || payload);
  }
}

function nextInlineFrameMeta() {
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

function normalizeFinishMode(mode) {
  if (mode === "immediate" || mode === "raf" || mode === "timeout100") return mode;
  return "raf";
}

function normalizeWidthMode(mode) {
  return mode === "fit-content" ? "fit-content" : "measured";
}

function isBoldFontWeight(weight) {
  const normalized = String(weight || "normal").toLowerCase();
  return (
    normalized === "bold" ||
    normalized === "bolder" ||
    ["500", "600", "700", "800", "900"].includes(normalized)
  );
}

function normalizeInlineFontProps(rawFontStyle, rawFontWeight) {
  const styleToken = String(rawFontStyle || "normal").toLowerCase();
  const weightToken = String(rawFontWeight || "").toLowerCase();

  const italic = styleToken.includes("italic") || styleToken.includes("oblique");
  const boldFromStyle = styleToken.includes("bold");
  const boldFromWeight = isBoldFontWeight(weightToken);
  const bold = boldFromStyle || boldFromWeight;

  return {
    fontStyle: italic ? "italic" : "normal",
    fontWeight: bold ? "bold" : "normal",
  };
}

function rectToPayload(rect) {
  if (!rect) return null;
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function getFullRangeRect(el) {
  if (!el) return null;
  if (el instanceof HTMLInputElement) return null;
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rect = range.getBoundingClientRect();
    return rectToPayload(rect);
  } catch {
    return null;
  }
}

function getSelectionRectInEditor(el) {
  if (!el || typeof window === "undefined") return { inEditor: false, rect: null };
  if (el instanceof HTMLInputElement) {
    const isFocused = document.activeElement === el;
    return {
      inEditor: isFocused,
      rect: isFocused ? rectToPayload(el.getBoundingClientRect()) : null,
    };
  }
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return { inEditor: false, rect: null };
  try {
    const range = sel.getRangeAt(0);
    const startIn = el.contains(range.startContainer);
    const endIn = el.contains(range.endContainer);
    if (!startIn || !endIn) return { inEditor: false, rect: null };
    const rect = range.getBoundingClientRect();
    return { inEditor: true, rect: rectToPayload(rect) };
  } catch {
    return { inEditor: false, rect: null };
  }
}

function getCollapsedCaretProbeRectInEditor(el) {
  if (!el || el instanceof HTMLInputElement || typeof window === "undefined") return null;
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return null;
  let originalRange = null;
  let marker = null;
  try {
    const activeRange = sel.getRangeAt(0);
    if (!el.contains(activeRange.startContainer) || !el.contains(activeRange.endContainer)) {
      return null;
    }
    originalRange = activeRange.cloneRange();
    const probeRange = activeRange.cloneRange();
    probeRange.collapse(true);

    marker = document.createElement("span");
    marker.textContent = "\u200b";
    marker.style.display = "inline-block";
    marker.style.width = "0px";
    marker.style.padding = "0";
    marker.style.margin = "0";
    marker.style.border = "0";
    marker.style.lineHeight = "1";
    marker.style.pointerEvents = "none";

    probeRange.insertNode(marker);
    const rect = marker.getBoundingClientRect();

    if (marker.parentNode) {
      marker.parentNode.removeChild(marker);
      marker.parentNode?.normalize?.();
    }
    sel.removeAllRanges();
    sel.addRange(originalRange);
    return rectToPayload(rect);
  } catch {
    try {
      if (marker?.parentNode) {
        marker.parentNode.removeChild(marker);
      }
      if (originalRange && sel) {
        sel.removeAllRanges();
        sel.addRange(originalRange);
      }
    } catch {
      // no-op
    }
    return null;
  }
}

function roundMetric(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function snapToDevicePixelGrid(value) {
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

function getFirstGlyphRectInEditor(el) {
  if (!el || el instanceof HTMLInputElement || typeof document === "undefined") return null;
  try {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let textNode = null;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node?.nodeValue || "";
      if (text.length > 0) {
        textNode = node;
        break;
      }
    }
    if (!textNode) return null;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, Math.min(1, textNode.nodeValue.length));
    return rectToPayload(range.getBoundingClientRect());
  } catch {
    return null;
  }
}

function buildCanvasFontFamilyToken(fontFamily) {
  const rawFamily = String(fontFamily || "sans-serif").trim();
  const unquotedFamily = rawFamily.replace(/^['"]+|['"]+$/g, "");
  const safeFamily = unquotedFamily || "sans-serif";
  if (safeFamily.includes(",")) return safeFamily;
  return /\s/.test(safeFamily) ? `"${safeFamily}"` : safeFamily;
}

function buildCanvasFontValue({ fontStyle, fontWeight, fontSizePx, fontFamily }) {
  return `${fontStyle || "normal"} ${fontWeight || "normal"} ${fontSizePx}px ${buildCanvasFontFamilyToken(fontFamily)}`;
}

function resolveCanvasTextVisualWidth(metrics) {
  const fallbackWidth = Number(metrics?.width || 0);
  const left = Number(metrics?.actualBoundingBoxLeft);
  const right = Number(metrics?.actualBoundingBoxRight);
  if (Number.isFinite(left) && Number.isFinite(right)) {
    const visualWidth = left + right;
    if (Number.isFinite(visualWidth) && visualWidth > 0) return visualWidth;
  }
  return Number.isFinite(fallbackWidth) ? fallbackWidth : 0;
}

function buildInlineProbeText({
  isSingleLine,
  normalizedValueForSingleLine,
  normalizedValue,
}) {
  return (
    (isSingleLine
      ? normalizedValueForSingleLine
      : (normalizedValue.split(/\r?\n/)[0] || "")
    )
      .replace(/\u200B/g, "")
      .slice(0, 32) || "HgAy"
  );
}

function measureCanvasInkMetrics({
  fontStyle,
  fontWeight,
  fontSizePx,
  fontFamily,
  probeText,
}) {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.font = buildCanvasFontValue({
      fontStyle,
      fontWeight,
      fontSizePx,
      fontFamily,
    });
    const m = ctx.measureText(probeText || "Hg");
    const ascent = Number(m.actualBoundingBoxAscent || 0);
    const descent = Number(m.actualBoundingBoxDescent || 0);
    const inkHeight = ascent + descent;
    const fontAscent = Number(m.fontBoundingBoxAscent || 0);
    const fontDescent = Number(m.fontBoundingBoxDescent || 0);
    return {
      probeText,
      actualAscentPx: roundMetric(ascent),
      actualDescentPx: roundMetric(descent),
      actualInkHeightPx: roundMetric(inkHeight),
      fontAscentPx: roundMetric(fontAscent),
      fontDescentPx: roundMetric(fontDescent),
      fontBoxHeightPx: roundMetric(fontAscent + fontDescent),
    };
  } catch {
    return null;
  }
}

function measureKonvaInkProbe({
  fontStyle,
  fontWeight,
  fontSizePx,
  fontFamily,
  lineHeightPx,
  letterSpacingPx,
  probeText,
}) {
  if (typeof document === "undefined") return null;
  const safeLineHeightPx = Number(lineHeightPx);
  if (!Number.isFinite(safeLineHeightPx) || safeLineHeightPx <= 0) return null;
  try {
    const probe = String(probeText || "Hg");
    const font = buildCanvasFontValue({
      fontStyle,
      fontWeight,
      fontSizePx,
      fontFamily,
    });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    ctx.font = font;
    const letterSpacingSafe = Number.isFinite(Number(letterSpacingPx))
      ? Number(letterSpacingPx)
      : 0;
    const textWidthBase = Number(ctx.measureText(probe).width || 0);
    const spacingExtra = Math.max(0, probe.length - 1) * letterSpacingSafe;
    const textWidth = Math.max(1, textWidthBase + spacingExtra);

    const padX = Math.ceil(Math.max(16, fontSizePx * 1.5));
    const padY = Math.ceil(Math.max(16, fontSizePx * 1.5));
    const canvasWidth = Math.max(1, Math.ceil(textWidth + padX * 2 + 4));
    const canvasHeight = Math.max(1, Math.ceil(safeLineHeightPx + padY * 2 + 4));

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const drawCtx = canvas.getContext("2d", { willReadFrequently: true });
    if (!drawCtx) return null;
    drawCtx.font = font;
    drawCtx.fillStyle = "#000000";
    drawCtx.textAlign = "left";
    drawCtx.direction = "ltr";
    drawCtx.clearRect(0, 0, canvasWidth, canvasHeight);

    const fixTextRendering =
      typeof window !== "undefined" && Boolean(window?.Konva?._fixTextRendering);
    const lineTop = padY;
    const mRef = drawCtx.measureText("M");
    const fontBoxAscent = Number(mRef.fontBoundingBoxAscent || 0);
    const fontBoxDescent = Number(mRef.fontBoundingBoxDescent || 0);
    drawCtx.textBaseline = fixTextRendering ? "alphabetic" : "middle";
    const baselineY = fixTextRendering
      ? lineTop + safeLineHeightPx / 2 + (fontBoxAscent - fontBoxDescent) / 2
      : lineTop + safeLineHeightPx / 2;
    let drawX = padX;

    if (Math.abs(letterSpacingSafe) > 0.001) {
      for (const letter of Array.from(probe)) {
        drawCtx.fillText(letter, drawX, baselineY);
        drawX += Number(drawCtx.measureText(letter).width || 0) + letterSpacingSafe;
      }
    } else {
      drawCtx.fillText(probe, drawX, baselineY);
    }

    const sampleY = Math.max(0, Math.floor(lineTop));
    const sampleHeight = Math.max(
      1,
      Math.min(canvasHeight - sampleY, Math.ceil(safeLineHeightPx))
    );
    const imageData = drawCtx.getImageData(0, sampleY, canvasWidth, sampleHeight).data;

    let top = null;
    let bottom = null;
    const alphaThreshold = 8;
    for (let y = 0; y < sampleHeight; y += 1) {
      for (let x = 0; x < canvasWidth; x += 1) {
        const idx = (y * canvasWidth + x) * 4 + 3;
        if (imageData[idx] > alphaThreshold) {
          if (top === null) top = y;
          bottom = y;
          break;
        }
      }
    }
    if (top === null || bottom === null) return null;

    const glyphHeight = bottom - top + 1;
    return {
      probeText: probe,
      hostHeightPx: roundMetric(safeLineHeightPx),
      glyphHeightPx: roundMetric(glyphHeight),
      glyphTopInsetPx: roundMetric(top),
      glyphBottomInsetPx: roundMetric(safeLineHeightPx - (bottom + 1)),
      method: "pixel-scan",
      fixTextRendering,
    };
  } catch {
    return null;
  }
}

function estimateDomCssInkProbe({
  domInkProbe,
  canvasInkMetrics,
  probeText,
}) {
  const hostHeightPx = Number(domInkProbe?.hostHeightPx);
  if (!Number.isFinite(hostHeightPx)) {
    return null;
  }
  const actualAscent = Number(canvasInkMetrics?.actualAscentPx);
  const actualDescent = Number(canvasInkMetrics?.actualDescentPx);
  const fontAscent = Number(canvasInkMetrics?.fontAscentPx);
  const fontDescent = Number(canvasInkMetrics?.fontDescentPx);
  if (![actualAscent, actualDescent, fontAscent, fontDescent].every(Number.isFinite)) {
    return null;
  }

  // Modelo estructural: CSS line box distribuye leading por arriba/abajo del font-box.
  // Luego convertimos font-box -> ink con deltas de canvas metrics.
  const fontBoxHeightPx = fontAscent + fontDescent;
  const fontBoxTopInsetPx = (hostHeightPx - fontBoxHeightPx) / 2;
  const fontToInkTopPx = fontAscent - actualAscent;
  const fontToInkBottomPx = fontDescent - actualDescent;
  const glyphTopInsetPx = fontBoxTopInsetPx + fontToInkTopPx;
  const glyphBottomInsetPx = fontBoxTopInsetPx + fontToInkBottomPx;
  const glyphHeightPx = hostHeightPx - glyphTopInsetPx - glyphBottomInsetPx;

  return {
    probeText: String(probeText || canvasInkMetrics?.probeText || "HgAy"),
    hostHeightPx: roundMetric(hostHeightPx),
    fontBoxHeightPx: roundMetric(fontBoxHeightPx),
    fontBoxTopInsetPx: roundMetric(fontBoxTopInsetPx),
    glyphHeightPx: roundMetric(glyphHeightPx),
    glyphTopInsetPx: roundMetric(glyphTopInsetPx),
    glyphBottomInsetPx: roundMetric(glyphBottomInsetPx),
    fontToInkTopPx: roundMetric(fontToInkTopPx),
    fontToInkBottomPx: roundMetric(fontToInkBottomPx),
    method: "css-linebox-plus-canvas-ink",
  };
}

function measureDomInkProbe({
  fontStyle,
  fontWeight,
  fontSizePx,
  fontFamily,
  lineHeightPx,
  letterSpacingPx,
  probeText,
}) {
  if (typeof document === "undefined") return null;
  let host = null;
  try {
    host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-100000px";
    host.style.top = "-100000px";
    host.style.margin = "0";
    host.style.padding = "0";
    host.style.border = "0";
    host.style.whiteSpace = "pre";
    host.style.fontSize = `${fontSizePx}px`;
    host.style.fontFamily = fontFamily || "sans-serif";
    host.style.fontWeight = fontWeight || "normal";
    host.style.fontStyle = fontStyle || "normal";
    host.style.fontOpticalSizing = "none";
    host.style.textRendering = "geometricPrecision";
    host.style.webkitFontSmoothing = "antialiased";
    host.style.mozOsxFontSmoothing = "grayscale";
    host.style.lineHeight = `${lineHeightPx}px`;
    host.style.letterSpacing = `${Number(letterSpacingPx || 0)}px`;
    host.style.boxSizing = "border-box";
    host.style.pointerEvents = "none";
    host.style.userSelect = "none";

    const span = document.createElement("span");
    span.style.margin = "0";
    span.style.padding = "0";
    span.style.border = "0";
    span.style.whiteSpace = "pre";
    span.textContent = probeText || "Hg";
    host.appendChild(span);
    document.body.appendChild(host);

    const hostRect = host.getBoundingClientRect();
    const spanRect = span.getBoundingClientRect();
    return {
      probeText,
      hostHeightPx: roundMetric(hostRect.height),
      glyphHeightPx: roundMetric(spanRect.height),
      glyphTopInsetPx: roundMetric(spanRect.top - hostRect.top),
      glyphBottomInsetPx: roundMetric(hostRect.bottom - spanRect.bottom),
    };
  } catch {
    return null;
  } finally {
    if (host && host.parentNode) {
      host.parentNode.removeChild(host);
    }
  }
}

function measureDomTextVisualWidth({
  fontStyle,
  fontWeight,
  fontSizePx,
  fontFamily,
  lineHeightPx,
  letterSpacingPx,
  probeText,
}) {
  if (typeof document === "undefined") return null;
  let host = null;
  try {
    host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-100000px";
    host.style.top = "-100000px";
    host.style.margin = "0";
    host.style.padding = "0";
    host.style.border = "0";
    host.style.whiteSpace = "pre";
    host.style.pointerEvents = "none";
    host.style.userSelect = "none";
    host.style.boxSizing = "border-box";

    const span = document.createElement("span");
    span.style.display = "inline-block";
    span.style.margin = "0";
    span.style.padding = "0";
    span.style.border = "0";
    span.style.whiteSpace = "pre";
    span.style.boxSizing = "border-box";
    span.style.fontSize = `${fontSizePx}px`;
    span.style.fontFamily = fontFamily || "sans-serif";
    span.style.fontWeight = fontWeight || "normal";
    span.style.fontStyle = fontStyle || "normal";
    span.style.fontOpticalSizing = "none";
    span.style.textRendering = "geometricPrecision";
    span.style.webkitFontSmoothing = "antialiased";
    span.style.mozOsxFontSmoothing = "grayscale";
    span.style.lineHeight = `${lineHeightPx}px`;
    span.style.letterSpacing = `${Number(letterSpacingPx || 0)}px`;
    span.textContent = String(probeText || "").length > 0 ? String(probeText) : "\u200b";

    host.appendChild(span);
    document.body.appendChild(host);
    const rect = span.getBoundingClientRect();
    if (!Number.isFinite(rect.width)) return null;
    return Number(rect.width);
  } catch {
    return null;
  } finally {
    if (host && host.parentNode) {
      host.parentNode.removeChild(host);
    }
  }
}

const INLINE_VISUAL_NUDGE_CACHE = new Map();

const INLINE_LAYOUT_VERSION = "linebreak-unified-editor-v48";

export default function InlineTextEditor({
  editingId = null,
  node,
  value,
  onChange,
  onFinish,
  textAlign,
  scaleVisual = 1,
  finishMode = "raf",
  widthMode = "measured",
  onOverlayMountChange = null,
  onOverlaySwapRequest = null,
  onDebugEvent = null,
  overlayEngine = "legacy",
  swapAckToken = null,
  maintainCenterWhileEditing = false,
}) {
  if (!node) return null;

  const editorRef = useRef(null);
  const contentBoxRef = useRef(null);
  const editableHostRef = useRef(null);
  const nudgeCalibrationRef = useRef({
    key: null,
  });
  const [domVisualNudgePx, setDomVisualNudgePx] = useState(0);
  const [layoutProbeRevision, setLayoutProbeRevision] = useState(0);
  const [editorVisualReady, setEditorVisualReady] = useState(false);
  const horizontalCenterLockRef = useRef({
    editingId: null,
    centerStageX: null,
  });
  const DEBUG_MODE = isInlineDebugEnabled();
  const BOX_DEBUG_MODE = isInlineBoxDebugEnabled();
  const [fontMetricsRevision, setFontMetricsRevision] = useState(0);
  const normalizedOverlayEngine = normalizeInlineOverlayEngine(overlayEngine);
  const isPhaseAtomicV2 = normalizedOverlayEngine === "phase_atomic_v2";
  const overlaySessionIdRef = useRef(null);
  const swapAckSeenRef = useRef(0);
  const [overlayPhase, setOverlayPhase] = useState(
    isPhaseAtomicV2 ? "prepare_mount" : "active"
  );
  const [v2FontsReady, setV2FontsReady] = useState(!isPhaseAtomicV2);
  const [v2OffsetComputed, setV2OffsetComputed] = useState(!isPhaseAtomicV2);
  const [v2OffsetOneShotPx, setV2OffsetOneShotPx] = useState(0);
  const [v2SwapRequested, setV2SwapRequested] = useState(false);
  const [viewportSyncRevision, setViewportSyncRevision] = useState(0);
  const viewportSyncRafRef = useRef(0);
  const v2InitEditingIdRef = useRef(null);
  const pendingDoneDispatchRef = useRef({
    timerId: 0,
    id: null,
    sessionId: null,
  });

  const normalizedFinishMode = normalizeFinishMode(finishMode);
  const normalizedWidthMode = normalizeWidthMode(widthMode);

  const clearPendingDoneDispatchForId = useCallback((idToCancel = null) => {
    const pending = pendingDoneDispatchRef.current || {};
    const pendingTimerId = Number(pending.timerId || 0);
    if (!pendingTimerId) return;
    if (idToCancel && pending.id !== idToCancel) return;
    window.clearTimeout(pendingTimerId);
    pendingDoneDispatchRef.current = {
      timerId: 0,
      id: null,
      sessionId: null,
    };
  }, []);

  const scheduleViewportSync = useCallback(() => {
    if (viewportSyncRafRef.current) return;
    viewportSyncRafRef.current = window.requestAnimationFrame(() => {
      viewportSyncRafRef.current = 0;
      setViewportSyncRevision((prev) => prev + 1);
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onViewportChange = () => {
      scheduleViewportSync();
    };

    window.addEventListener("resize", onViewportChange);
    const vv = window.visualViewport || null;
    vv?.addEventListener("resize", onViewportChange);

    if (!isPhaseAtomicV2) {
      window.addEventListener("scroll", onViewportChange, true);
      vv?.addEventListener("scroll", onViewportChange);
    }

    return () => {
      window.removeEventListener("resize", onViewportChange);
      vv?.removeEventListener("resize", onViewportChange);
      if (!isPhaseAtomicV2) {
        window.removeEventListener("scroll", onViewportChange, true);
        vv?.removeEventListener("scroll", onViewportChange);
      }
      if (viewportSyncRafRef.current) {
        window.cancelAnimationFrame(viewportSyncRafRef.current);
        viewportSyncRafRef.current = 0;
      }
    };
  }, [isPhaseAtomicV2, scheduleViewportSync]);

  // Stage (lo necesitamos para rects y posiciones)
  const stage = node.getStage();
  if (!stage) return null;

  // Detectar el nodo de texto real para estilo (color, fuente, etc.)
  const textNode = useMemo(
    () => resolveInlineKonvaTextNode(node, stage),
    [node, stage]
  );

  const nodeProps = useMemo(() => {
    try {
      const getProp = (n, getterName, fallback) => {
        if (!n) return fallback;

        if (typeof n.getAttr === "function") {
          const attrValue = n.getAttr(getterName);
          if (typeof attrValue !== "undefined" && attrValue !== null && attrValue !== "") {
            return attrValue;
          }
        }

        const fn = n[getterName];
        if (typeof fn === "function") return fn.call(n);
        if (typeof n[getterName] !== "undefined" && n[getterName] !== null && n[getterName] !== "") {
          return n[getterName];
        }
        return fallback;
      };

      const rawFontStyle = getProp(textNode, "fontStyle", "normal");
      const rawFontWeight = getProp(textNode, "fontWeight", "normal");
      const normalizedFont = normalizeInlineFontProps(rawFontStyle, rawFontWeight);

      return {
        fontSize: getProp(textNode, "fontSize", 24),
        fontFamily: getProp(textNode, "fontFamily", "sans-serif"),
        fontWeight: normalizedFont.fontWeight,
        fontStyle: normalizedFont.fontStyle,
        letterSpacing: getProp(textNode, "letterSpacing", 0),
        fill: getProp(textNode, "fill", "#000"),
        lineHeightKonva: getProp(textNode, "lineHeight", 1.2),
      };
    } catch (error) {
      console.warn("Error obteniendo propiedades del textNode:", error);
      return {
        fontSize: 24,
        fontFamily: "sans-serif",
        fontWeight: "normal",
        fontStyle: "normal",
        letterSpacing: 0,
        fill: "#000",
        lineHeightKonva: 1.2,
      };
    }
  }, [textNode]);

  const konvaLineHeight = nodeProps.lineHeightKonva;
  const rectSourceNode = textNode || node;
  const konvaProjection = useMemo(
    () => getInlineKonvaProjectedRectViewport(rectSourceNode, stage, scaleVisual),
    [rectSourceNode, scaleVisual, stage, viewportSyncRevision]
  );
  const stageBox = konvaProjection.stageRect;
  const rect = konvaProjection.konvaTextClientRect;
  const projectedRect = konvaProjection.konvaProjectedRectViewport;
  const totalScaleX = Number(konvaProjection.totalScaleX || 1);
  const totalScaleY = Number(konvaProjection.totalScaleY || 1);
  const rectX = Number.isFinite(Number(rect?.x)) ? Number(rect.x) : 0;
  const rectY = Number.isFinite(Number(rect?.y)) ? Number(rect.y) : 0;
  const rectWidth = Number.isFinite(Number(rect?.width)) ? Number(rect.width) : 0;
  const rectHeight = Number.isFinite(Number(rect?.height)) ? Number(rect.height) : 0;
  const projectedX = Number.isFinite(Number(projectedRect?.x))
    ? Number(projectedRect.x)
    : Number(stageBox?.left || 0) + rectX * totalScaleX;
  const projectedY = Number.isFinite(Number(projectedRect?.y))
    ? Number(projectedRect.y)
    : Number(stageBox?.top || 0) + rectY * totalScaleY;
  const projectedWidth = Number.isFinite(Number(projectedRect?.width))
    ? Number(projectedRect.width)
    : rectWidth * totalScaleX;
  const projectedHeight = Number.isFinite(Number(projectedRect?.height))
    ? Number(projectedRect.height)
    : rectHeight * totalScaleY;

  const PADDING_X = 0;
  const PADDING_Y = 0;
  const fontSizePx = Math.max(1, Number(nodeProps.fontSize || 24) * totalScaleY);
  const lineHeightPx = Math.max(1, fontSizePx * konvaLineHeight);
  const letterSpacingPx =
    (Number.isFinite(Number(nodeProps.letterSpacing)) ? Number(nodeProps.letterSpacing) : 0) *
    totalScaleX;
  const rawValue = String(value ?? "");
  const normalizedValue = normalizeInlineEditableText(rawValue, {
    trimPhantomTrailingNewline: true,
  });
  const normalizedValueForMeasure = normalizedValue.replace(/[ \t]+$/gm, "");
  const normalizedValueForSingleLine = normalizedValueForMeasure.replace(/\n+$/g, "");
  const isSingleLine = !normalizedValueForMeasure.includes("\n");
  const probeTextForAlignment = useMemo(
    () =>
      buildInlineProbeText({
        isSingleLine,
        normalizedValueForSingleLine,
        normalizedValue,
      }),
    [isSingleLine, normalizedValue, normalizedValueForSingleLine]
  );
  const metricsProbeText = "HgAy";
  const fontLoadStatus = useMemo(() => {
    if (
      typeof document === "undefined" ||
      !document.fonts ||
      typeof document.fonts.check !== "function"
    ) {
      return {
        available: null,
        spec: null,
      };
    }
    try {
      const spec = buildCanvasFontValue({
        fontStyle: nodeProps.fontStyle,
        fontWeight: nodeProps.fontWeight,
        fontSizePx,
        fontFamily: nodeProps.fontFamily,
      });
      const available = document.fonts.check(spec, "HgAy");
      return {
        available: Boolean(available),
        spec,
      };
    } catch {
      return {
        available: null,
        spec: null,
      };
    }
  }, [
    fontMetricsRevision,
    nodeProps.fontFamily,
    nodeProps.fontStyle,
    nodeProps.fontWeight,
    fontSizePx,
  ]);
  useEffect(() => {
    if (
      typeof document === "undefined" ||
      !document.fonts ||
      typeof document.fonts.load !== "function"
    ) {
      return undefined;
    }
    let cancelled = false;
    const spec = buildCanvasFontValue({
      fontStyle: nodeProps.fontStyle,
      fontWeight: nodeProps.fontWeight,
      fontSizePx,
      fontFamily: nodeProps.fontFamily,
    });
    const sampleText = "HgAy";
    Promise.allSettled([
      document.fonts.load(spec, sampleText),
      document.fonts.ready,
    ]).then(() => {
      if (cancelled) return;
      setFontMetricsRevision((prev) => prev + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [
    nodeProps.fontFamily,
    nodeProps.fontStyle,
    nodeProps.fontWeight,
    fontSizePx,
  ]);
  const singleLineCaretProbeModel = useMemo(() => {
    if (!isSingleLine) return null;
    return measureDomInkProbe({
      fontStyle: nodeProps.fontStyle,
      fontWeight: nodeProps.fontWeight,
      fontSizePx,
      fontFamily: nodeProps.fontFamily,
      lineHeightPx: fontSizePx,
      letterSpacingPx,
      probeText: metricsProbeText,
    });
  }, [
    fontMetricsRevision,
    isSingleLine,
    nodeProps.fontStyle,
    nodeProps.fontWeight,
    fontSizePx,
    nodeProps.fontFamily,
    letterSpacingPx,
    metricsProbeText,
  ]);
  const singleLineProbeOverflowPx = useMemo(() => {
    const top = Number(singleLineCaretProbeModel?.glyphTopInsetPx);
    const bottom = Number(singleLineCaretProbeModel?.glyphBottomInsetPx);
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) return 0;
    return Math.max(0, -top) + Math.max(0, -bottom);
  }, [singleLineCaretProbeModel]);
  const useKonvaLineHeightForSingleLine =
    isSingleLine && (
      isPhaseAtomicV2 ||
      (
        Number.isFinite(singleLineProbeOverflowPx) &&
        singleLineProbeOverflowPx > Math.max(4, fontSizePx * 0.18)
      )
    );
  const cssLineHeightPx = isSingleLine
    ? (useKonvaLineHeightForSingleLine ? lineHeightPx : fontSizePx)
    : lineHeightPx;
  const singleLineVerticalPadPx =
    isSingleLine && Number.isFinite(lineHeightPx) && Number.isFinite(cssLineHeightPx)
      ? Math.max(0, (lineHeightPx - cssLineHeightPx) / 2)
      : 0;
  const editableLineHeightPx = cssLineHeightPx;
  const singleLineCaretMode = !isSingleLine
    ? "multiline"
    : (useKonvaLineHeightForSingleLine ? "konva-line-height" : "font-size-line-height");
  const domInkProbeModel = useMemo(
    () =>
      measureDomInkProbe({
        fontStyle: nodeProps.fontStyle,
        fontWeight: nodeProps.fontWeight,
        fontSizePx,
        fontFamily: nodeProps.fontFamily,
        lineHeightPx: editableLineHeightPx,
        letterSpacingPx,
        probeText: metricsProbeText,
      }),
    [
      fontMetricsRevision,
      editableLineHeightPx,
      fontSizePx,
      letterSpacingPx,
      nodeProps.fontFamily,
      nodeProps.fontStyle,
      nodeProps.fontWeight,
      metricsProbeText,
    ]
  );
  const canvasInkMetricsModel = useMemo(
    () =>
      measureCanvasInkMetrics({
        fontStyle: nodeProps.fontStyle,
        fontWeight: nodeProps.fontWeight,
        fontSizePx,
        fontFamily: nodeProps.fontFamily,
        probeText: metricsProbeText,
      }),
    [
      fontMetricsRevision,
      fontSizePx,
      nodeProps.fontFamily,
      nodeProps.fontStyle,
      nodeProps.fontWeight,
      metricsProbeText,
    ]
  );
  const domCssInkProbeModel = useMemo(
    () =>
      estimateDomCssInkProbe({
        domInkProbe: domInkProbeModel,
        canvasInkMetrics: canvasInkMetricsModel,
        probeText: metricsProbeText,
      }),
    [canvasInkMetricsModel, domInkProbeModel, metricsProbeText]
  );
  const konvaInkProbeModel = useMemo(
    () =>
      measureKonvaInkProbe({
        fontStyle: nodeProps.fontStyle,
        fontWeight: nodeProps.fontWeight,
        fontSizePx,
        fontFamily: nodeProps.fontFamily,
        lineHeightPx: editableLineHeightPx,
        letterSpacingPx,
        probeText: metricsProbeText,
      }),
    [
      fontMetricsRevision,
      editableLineHeightPx,
      fontSizePx,
      letterSpacingPx,
      nodeProps.fontFamily,
      nodeProps.fontStyle,
      nodeProps.fontWeight,
      metricsProbeText,
    ]
  );
  const verticalInsetPx = singleLineVerticalPadPx;
  const domToKonvaOffsetModel = useMemo(() => {
    if (isPhaseAtomicV2) {
      return computeInlineAlignmentOffsetV2({
        domCssInkProbe: domCssInkProbeModel,
        konvaInkProbe: konvaInkProbeModel,
        editableLineHeightPx,
        fallbackOffset: 0,
      });
    }
    const domTopInsetPrimary = Number(domCssInkProbeModel?.glyphTopInsetPx);
    const domTopInsetFallback = Number(domInkProbeModel?.glyphTopInsetPx);
    const usingDomCss = Number.isFinite(domTopInsetPrimary);
    const domTopInset = usingDomCss ? domTopInsetPrimary : domTopInsetFallback;
    const konvaTopInset = Number(konvaInkProbeModel?.glyphTopInsetPx);
    if (!Number.isFinite(domTopInset) || !Number.isFinite(konvaTopInset)) {
      return {
        source: usingDomCss ? "domCss" : "domProbe",
        domTopInset: Number.isFinite(domTopInset) ? roundMetric(domTopInset) : null,
        konvaTopInset: Number.isFinite(konvaTopInset) ? roundMetric(konvaTopInset) : null,
        rawOffset: null,
        saneLimit: null,
        appliedOffset: 0,
        blockedReason: "missing-insets",
      };
    }
    const rawOffset = konvaTopInset - domTopInset;
    if (!Number.isFinite(rawOffset)) {
      return {
        source: usingDomCss ? "domCss" : "domProbe",
        domTopInset: roundMetric(domTopInset),
        konvaTopInset: roundMetric(konvaTopInset),
        rawOffset: null,
        saneLimit: null,
        appliedOffset: 0,
        blockedReason: "invalid-raw-offset",
      };
    }

    const strictLimit = 12;
    const dynamicCssLimit = Math.min(Math.max(editableLineHeightPx * 0.28, 8), 96);
    const saneLimit = usingDomCss ? dynamicCssLimit : strictLimit;

    if (Math.abs(rawOffset) > editableLineHeightPx * 0.5) {
      return {
        source: usingDomCss ? "domCss" : "domProbe",
        domTopInset: roundMetric(domTopInset),
        konvaTopInset: roundMetric(konvaTopInset),
        rawOffset: roundMetric(rawOffset),
        saneLimit: roundMetric(saneLimit),
        appliedOffset: 0,
        blockedReason: "exceeds-half-lineheight",
      };
    }
    if (Math.abs(rawOffset) > saneLimit) {
      return {
        source: usingDomCss ? "domCss" : "domProbe",
        domTopInset: roundMetric(domTopInset),
        konvaTopInset: roundMetric(konvaTopInset),
        rawOffset: roundMetric(rawOffset),
        saneLimit: roundMetric(saneLimit),
        appliedOffset: 0,
        blockedReason: "exceeds-sane-limit",
      };
    }
    if (Math.abs(rawOffset) < 0.01) {
      return {
        source: usingDomCss ? "domCss" : "domProbe",
        domTopInset: roundMetric(domTopInset),
        konvaTopInset: roundMetric(konvaTopInset),
        rawOffset: roundMetric(rawOffset),
        saneLimit: roundMetric(saneLimit),
        appliedOffset: 0,
        blockedReason: "below-min-threshold",
      };
    }
    const dpr =
      typeof window !== "undefined" ? Number(window.devicePixelRatio || 1) : 1;
    const pixelSnapStepRaw = Number.isFinite(dpr) && dpr > 0 ? 1 / dpr : 1;
    const pixelSnapUsed = Number.isFinite(pixelSnapStepRaw) && pixelSnapStepRaw > 0 && pixelSnapStepRaw <= 0.5;
    const pixelSnapStep = roundMetric(pixelSnapStepRaw);
    const snappedOffset = snapToDevicePixelGrid(rawOffset);
    return {
      source: usingDomCss ? "domCss" : "domProbe",
      domTopInset: roundMetric(domTopInset),
      konvaTopInset: roundMetric(konvaTopInset),
      rawOffset: roundMetric(rawOffset),
      saneLimit: roundMetric(saneLimit),
      snappedOffset: roundMetric(Number(snappedOffset)),
      pixelSnapStep,
      pixelSnapUsed,
      appliedOffset: roundMetric(Number(snappedOffset)) ?? 0,
      blockedReason: null,
    };
  }, [
    isPhaseAtomicV2,
    domCssInkProbeModel,
    domInkProbeModel,
    editableLineHeightPx,
    konvaInkProbeModel,
  ]);
  const domToKonvaGlyphOffsetPx = Number(domToKonvaOffsetModel?.appliedOffset || 0);
  const domToKonvaPaddingOffsetPx = 0;
  const domToKonvaBaseVisualOffsetPx =
    Number(domToKonvaGlyphOffsetPx || 0) + Number(domToKonvaPaddingOffsetPx || 0);
  const isFontSizeLineHeightSingleLine =
    isSingleLine && singleLineCaretMode === "font-size-line-height";
  const allowLiveVisualNudge = true;
  const nudgeCacheKey = useMemo(
    () =>
      [
        String(INLINE_LAYOUT_VERSION || ""),
        String(nodeProps.fontFamily || ""),
        String(nodeProps.fontWeight || ""),
        String(nodeProps.fontStyle || ""),
        String(roundMetric(Number(fontSizePx)) || ""),
        String(roundMetric(Number(editableLineHeightPx)) || ""),
        String(isSingleLine ? "single" : "multi"),
      ].join("|"),
    [
      nodeProps.fontFamily,
      nodeProps.fontWeight,
      nodeProps.fontStyle,
      fontSizePx,
      editableLineHeightPx,
      isSingleLine,
      singleLineCaretMode,
    ]
  );
  const domToKonvaVisualOffsetRawPx =
    isPhaseAtomicV2
      ? Number(domToKonvaBaseVisualOffsetPx || 0)
      : (Number(domToKonvaBaseVisualOffsetPx || 0) + Number(domVisualNudgePx || 0));
  const domVisualResidualDeadZonePx = useMemo(() => {
    if (typeof window === "undefined") return 0.4;
    const dpr = Number(window.devicePixelRatio || 1);
    const step = Number.isFinite(dpr) && dpr > 0 ? 1 / dpr : 1;
    // En zoomes fraccionales (step > 0.5), un desvio cercano a 1 paso suele
    // verse como "texto bajo/alto"; absorbemos hasta 1 paso visual.
    if (!Number.isFinite(step) || step <= 0) return 0.4;
    if (step > 0.5) {
      // 125% zoom (step 0.8) suele producir residual ~0.8-1.2px:
      // lo neutralizamos para evitar drift visible en el handoff.
      return Math.min(1.25, Math.max(0.85, step * 1.5));
    }
    return Math.max(0.2, Math.min(0.4, step * 0.75));
  }, []);
  const domVisualResidualDeadZoneEffectivePx = useMemo(() => {
    if (isPhaseAtomicV2) return 0;
    // En tipografias "normales" (single-line con line-height = font-size),
    // aceptamos una zona muerta un poco mayor para evitar drift subpixel.
    if (isSingleLine && singleLineCaretMode === "font-size-line-height") {
      return Math.max(Number(domVisualResidualDeadZonePx || 0), 1.4);
    }
    return Number(domVisualResidualDeadZonePx || 0);
  }, [domVisualResidualDeadZonePx, isPhaseAtomicV2, isSingleLine, singleLineCaretMode]);
  const domToKonvaVisualOffsetPx =
    isPhaseAtomicV2
      ? Number(domToKonvaVisualOffsetRawPx || 0)
      : (
        Math.abs(Number(domToKonvaVisualOffsetRawPx || 0)) <= Number(domVisualResidualDeadZoneEffectivePx || 0)
      ? 0
      : domToKonvaVisualOffsetRawPx
      );
  const effectiveVisualOffsetPx = isPhaseAtomicV2
    ? Number(v2OffsetOneShotPx || 0)
    : Number(domToKonvaVisualOffsetPx || 0);
  const isEditorVisible = isPhaseAtomicV2
    ? (editorVisualReady || v2OffsetComputed)
    : editorVisualReady;
  const editorPaddingTopPx = Math.max(0, Number(verticalInsetPx || 0));
  const editorPaddingBottomPx = Math.max(0, Number(verticalInsetPx || 0));

  useEffect(() => {
    nudgeCalibrationRef.current = {
      key: null,
    };
    if (isPhaseAtomicV2) {
      if (v2InitEditingIdRef.current === editingId) {
        return;
      }
      v2InitEditingIdRef.current = editingId;
      setDomVisualNudgePx(0);
      setEditorVisualReady(false);
      setOverlayPhase("prepare_mount");
      setV2FontsReady(false);
      setV2OffsetComputed(false);
      setV2SwapRequested(false);
      return;
    }
    v2InitEditingIdRef.current = null;
    const cached = INLINE_VISUAL_NUDGE_CACHE.get(nudgeCacheKey);
    const cachedNum = Number(cached);
    const maxCachedAbs = 14;
    const safeCached =
      Number.isFinite(cachedNum)
        ? Math.max(-maxCachedAbs, Math.min(maxCachedAbs, cachedNum))
        : 0;
    setDomVisualNudgePx(safeCached);
    setEditorVisualReady(false);
  }, [editingId, isPhaseAtomicV2, nudgeCacheKey]);
  useEffect(() => {
    if (isPhaseAtomicV2) return;
    const nudge = Number(domVisualNudgePx);
    if (!Number.isFinite(nudge)) return;
    if (!nudgeCacheKey) return;
    INLINE_VISUAL_NUDGE_CACHE.set(nudgeCacheKey, nudge);
    if (INLINE_VISUAL_NUDGE_CACHE.size > 64) {
      const oldestKey = INLINE_VISUAL_NUDGE_CACHE.keys().next().value;
      if (typeof oldestKey === "string" || typeof oldestKey === "number") {
        INLINE_VISUAL_NUDGE_CACHE.delete(oldestKey);
      }
    }
  }, [domVisualNudgePx, isPhaseAtomicV2, nudgeCacheKey]);

  useEffect(() => {
    if (!editingId) return;
    const seed = Math.random().toString(36).slice(2, 10);
    overlaySessionIdRef.current = `${editingId}-${Date.now()}-${seed}`;
    swapAckSeenRef.current = 0;
  }, [editingId, isPhaseAtomicV2]);

  const className =
    typeof node.getClassName === "function" ? node.getClassName() : "Text";
  const isTextNode = className === "Text";
  const editorTextColor =
    typeof nodeProps.fill === "string" && nodeProps.fill.trim()
      ? nodeProps.fill
      : "#000";

  const baseTextWidth = Math.max(20, projectedWidth);

  const measuredContentWidth = useMemo(() => {
    if (normalizedWidthMode !== "measured") return null;
    const textValue = isSingleLine ? normalizedValueForSingleLine : normalizedValueForMeasure;
    const lines = textValue.split(/\r?\n/);
    const maxLineWidth = Math.max(
      ...lines.map((line) => {
        const safeLine = String(line || "");
        const domWidth = measureDomTextVisualWidth({
          fontStyle: nodeProps.fontStyle,
          fontWeight: nodeProps.fontWeight,
          fontSizePx,
          fontFamily: nodeProps.fontFamily,
          lineHeightPx: editableLineHeightPx,
          letterSpacingPx,
          probeText: safeLine,
        });
        if (Number.isFinite(domWidth)) return domWidth;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return 0;
        ctx.font = buildCanvasFontValue({
          fontStyle: nodeProps.fontStyle,
          fontWeight: nodeProps.fontWeight,
          fontSizePx,
          fontFamily: nodeProps.fontFamily,
        });
        const metrics = ctx.measureText(safeLine);
        const visualWidth = resolveCanvasTextVisualWidth(metrics);
        const spacingExtra = Math.max(0, safeLine.length - 1) * letterSpacingPx;
        return visualWidth + spacingExtra;
      }),
      0
    );
    return Math.max(20, Math.ceil(maxLineWidth));
  }, [
    editableLineHeightPx,
    fontMetricsRevision,
    letterSpacingPx,
    normalizedWidthMode,
    nodeProps.fontFamily,
    nodeProps.fontSize,
    nodeProps.fontStyle,
    nodeProps.fontWeight,
    totalScaleY,
    isSingleLine,
    normalizedValueForMeasure,
    normalizedValueForSingleLine,
  ]);

  const effectiveTextWidth =
    normalizedWidthMode === "measured" && Number.isFinite(measuredContentWidth)
      ? measuredContentWidth
      : baseTextWidth;
  const minWidthPx =
    normalizedWidthMode === "measured" ? effectiveTextWidth : baseTextWidth;
  const measuredCenterStageX =
    Number.isFinite(rectX) && Number.isFinite(rectWidth) && rectWidth > 0
      ? rectX + rectWidth / 2
      : null;
  const centerLockChanged =
    horizontalCenterLockRef.current.editingId !== editingId;
  if (centerLockChanged) {
    horizontalCenterLockRef.current = {
      editingId: editingId || null,
      centerStageX: Number.isFinite(measuredCenterStageX) ? measuredCenterStageX : null,
    };
  } else if (
    !Number.isFinite(horizontalCenterLockRef.current.centerStageX) &&
    Number.isFinite(measuredCenterStageX)
  ) {
    horizontalCenterLockRef.current.centerStageX = measuredCenterStageX;
  }
  const lockedCenterStageX = Number.isFinite(horizontalCenterLockRef.current.centerStageX)
    ? Number(horizontalCenterLockRef.current.centerStageX)
    : measuredCenterStageX;
  const centerViewportX = Number.isFinite(lockedCenterStageX)
    ? Number(stageBox?.left || 0) + lockedCenterStageX * totalScaleX
    : (
      Number.isFinite(projectedX) && Number.isFinite(projectedWidth)
        ? projectedX + projectedWidth / 2
        : null
    );
  const hasProjectedKonvaWidth = Number.isFinite(projectedWidth) && projectedWidth > 0;
  const hasProjectedKonvaHeight = Number.isFinite(projectedHeight) && projectedHeight > 0;
  const measuredOverlayWidthPx =
    normalizedWidthMode === "measured" && Number.isFinite(effectiveTextWidth)
      ? effectiveTextWidth
      : null;
  const liveSymmetricWidthPx = (() => {
    if (!isTextNode) {
      return hasProjectedKonvaWidth ? projectedWidth : measuredOverlayWidthPx;
    }
    if (hasProjectedKonvaWidth && Number.isFinite(measuredOverlayWidthPx)) {
      // Nunca usar un ancho menor al que Konva ya esta pintando.
      return Math.max(projectedWidth, measuredOverlayWidthPx);
    }
    if (hasProjectedKonvaWidth) return projectedWidth;
    if (Number.isFinite(measuredOverlayWidthPx)) return measuredOverlayWidthPx;
    return null;
  })();
  const overlayWidthSource =
    hasProjectedKonvaWidth && Number.isFinite(measuredOverlayWidthPx)
      ? (
        measuredOverlayWidthPx > projectedWidth
          ? "max:measured"
          : "max:konva"
      )
      : (
        hasProjectedKonvaWidth
          ? "konva"
          : (Number.isFinite(measuredOverlayWidthPx) ? "measured" : "none")
      );
  const syncedOverlayWidthPx = Number.isFinite(liveSymmetricWidthPx)
    ? liveSymmetricWidthPx
    : null;
  const syncedOverlayHeightPx = hasProjectedKonvaHeight ? projectedHeight : null;
  const resolvedOverlayWidthPx = Number.isFinite(syncedOverlayWidthPx)
    ? syncedOverlayWidthPx
    : (normalizedWidthMode === "measured" ? effectiveTextWidth : null);
  const resolvedOverlayHeightPx = Number.isFinite(syncedOverlayHeightPx)
    ? syncedOverlayHeightPx
    : null;
  const resolvedMinWidthPx = Number.isFinite(resolvedOverlayWidthPx)
    ? resolvedOverlayWidthPx
    : minWidthPx;
  const resolvedContentMinHeightPx = Number.isFinite(resolvedOverlayHeightPx)
    ? resolvedOverlayHeightPx
    : lineHeightPx;
  const shouldCenterTextWithinOverlay =
    Boolean(maintainCenterWhileEditing) &&
    isSingleLine &&
    Number.isFinite(resolvedOverlayWidthPx) &&
    Number.isFinite(measuredOverlayWidthPx) &&
    Number(measuredOverlayWidthPx) > 0 &&
    Number(resolvedOverlayWidthPx) - Number(measuredOverlayWidthPx) > 0.5;
  const centeredEditorWidthPx = shouldCenterTextWithinOverlay
    ? Number(measuredOverlayWidthPx)
    : null;
  const centeredEditorLeftPx = shouldCenterTextWithinOverlay
    ? (Number(resolvedOverlayWidthPx) - Number(measuredOverlayWidthPx)) / 2
    : 0;
  useLayoutEffect(() => {
    if (isPhaseAtomicV2) return undefined;
    if (layoutProbeRevision <= 0) return;
    const contentEl = contentBoxRef.current;
    const visualEl = editorRef.current;
    const konvaTopInset = Number(konvaInkProbeModel?.glyphTopInsetPx);
    const konvaGlyphHeight = Number(konvaInkProbeModel?.glyphHeightPx);
    const domLiveTopInset = Number(domInkProbeModel?.glyphTopInsetPx);
    const domLiveBottomInset = Number(domInkProbeModel?.glyphBottomInsetPx);
    const domHasInkOverflow =
      (Number.isFinite(domLiveTopInset) && domLiveTopInset < 0) ||
      (Number.isFinite(domLiveBottomInset) && domLiveBottomInset < 0);
    if (!contentEl || !visualEl) {
      setEditorVisualReady(true);
      return;
    }
    if (!Number.isFinite(konvaTopInset)) {
      setEditorVisualReady(true);
      return;
    }
    const calibrationKey = [
      String(editingId || ""),
      String(layoutProbeRevision || 0),
      String(fontMetricsRevision || 0),
      String(roundMetric(Number(domInkProbeModel?.glyphTopInsetPx)) || ""),
      String(roundMetric(Number(domInkProbeModel?.glyphBottomInsetPx)) || ""),
      String(roundMetric(Number(konvaInkProbeModel?.glyphTopInsetPx)) || ""),
      String(roundMetric(Number(konvaInkProbeModel?.glyphHeightPx)) || ""),
    ].join("|");
    if (nudgeCalibrationRef.current.key === calibrationKey) {
      setEditorVisualReady(true);
      return;
    }
    let rafId = 0;
    let revealRafId = 0;
    rafId = window.requestAnimationFrame(() => {
      const contentRect = contentEl.getBoundingClientRect();
      const firstGlyphRect = getFirstGlyphRectInEditor(visualEl);
      if (!firstGlyphRect) {
        setEditorVisualReady(true);
        return;
      }
      const liveTopInset = Number(firstGlyphRect.y) - Number(contentRect.y);
      if (!Number.isFinite(liveTopInset)) {
        setEditorVisualReady(true);
        return;
      }
      const liveGlyphHeight = Number(firstGlyphRect.height);
      const useCenterResidual =
        domHasInkOverflow &&
        Number.isFinite(liveGlyphHeight) &&
        liveGlyphHeight > 0 &&
        Number.isFinite(konvaGlyphHeight) &&
        konvaGlyphHeight > 0 &&
        useKonvaLineHeightForSingleLine;
      const residual = useCenterResidual
        ? (
          Number(konvaTopInset) +
          Number(konvaGlyphHeight) / 2 -
          (Number(liveTopInset) + Number(liveGlyphHeight) / 2)
        )
        : (konvaTopInset - liveTopInset);
      if (!Number.isFinite(residual)) {
        setEditorVisualReady(true);
        return;
      }
      nudgeCalibrationRef.current.key = calibrationKey;
      const saneLimit = Math.max(1, Math.min(12, Number(editableLineHeightPx || 0) * 0.2));
      if (Math.abs(residual) > 0.25 && Math.abs(residual) <= saneLimit) {
        setDomVisualNudgePx((prev) => {
          const prevNum = Number(prev || 0);
          const proposed = prevNum + residual;
          const snapped = snapToDevicePixelGrid(proposed);
          const nextRaw = Number.isFinite(Number(snapped)) ? Number(snapped) : proposed;
          const clamp = Math.max(1.5, Math.min(14, Number(editableLineHeightPx || 0) * 0.25));
          const bounded = Math.max(-clamp, Math.min(clamp, nextRaw));
          const nextRounded = roundMetric(bounded);
          const next = Number.isFinite(nextRounded) ? nextRounded : bounded;
          if (Math.abs(next - prevNum) < 0.05) return prev;
          return next;
        });
      }
      revealRafId = window.requestAnimationFrame(() => {
        setEditorVisualReady(true);
      });
    });
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (revealRafId) window.cancelAnimationFrame(revealRafId);
    };
  }, [
    isPhaseAtomicV2,
    editingId,
    layoutProbeRevision,
    fontMetricsRevision,
    resolvedOverlayHeightPx,
    resolvedOverlayWidthPx,
    editableLineHeightPx,
    allowLiveVisualNudge,
    isFontSizeLineHeightSingleLine,
    domInkProbeModel?.glyphTopInsetPx,
    domInkProbeModel?.glyphBottomInsetPx,
    konvaInkProbeModel?.glyphTopInsetPx,
    konvaInkProbeModel?.glyphHeightPx,
  ]);
  const cardWidth =
    (Number.isFinite(resolvedOverlayWidthPx) ? resolvedOverlayWidthPx : effectiveTextWidth) +
    PADDING_X * 2;
  const projectedKonvaRectRaw = {
    x: projectedX,
    y: projectedY,
    width: projectedWidth,
    height: projectedHeight,
  };
  const layoutProjectionWidthPx = Number.isFinite(resolvedOverlayWidthPx)
    ? resolvedOverlayWidthPx
    : projectedWidth;
  const layoutProjectionX = (
    isTextNode &&
    Number.isFinite(centerViewportX) &&
    Number.isFinite(layoutProjectionWidthPx)
  )
    ? centerViewportX - layoutProjectionWidthPx / 2
    : projectedX;
  const projectedKonvaRectBase = {
    x: Number.isFinite(layoutProjectionX) ? layoutProjectionX : projectedX,
    y: projectedY,
    width: Number.isFinite(layoutProjectionWidthPx) ? layoutProjectionWidthPx : projectedWidth,
    height: projectedHeight,
  };
  let left;
  let top;

  if (isTextNode) {
    top = projectedKonvaRectBase.y - PADDING_Y;
    left = projectedKonvaRectBase.x + (projectedKonvaRectBase.width - cardWidth) / 2;
  } else {
    const approxHeight =
      nodeProps.fontSize * konvaLineHeight * totalScaleY + PADDING_Y * 2;

    left = projectedX + (projectedWidth - cardWidth) / 2;
    top = projectedY + (projectedHeight - approxHeight) / 2;
  }
  const konvaLabelDebugStyle = BOX_DEBUG_MODE
    ? {
        position: "fixed",
        left: `${projectedKonvaRectBase.x + 2}px`,
        top: `${Math.max(0, projectedKonvaRectBase.y - 16)}px`,
        padding: "1px 4px",
        background: "rgba(127, 29, 29, 0.92)",
        color: "#ffffff",
        borderRadius: "3px",
        fontSize: "10px",
        lineHeight: 1.2,
        letterSpacing: "0.02em",
        fontFamily: "monospace",
        pointerEvents: "none",
        zIndex: 10021,
      }
    : null;
  const overlayLabelDebugStyle = BOX_DEBUG_MODE
    ? {
        position: "absolute",
        left: "2px",
        top: "-16px",
        padding: "1px 4px",
        background: "rgba(146, 64, 14, 0.92)",
        color: "#ffffff",
        borderRadius: "3px",
        fontSize: "10px",
        lineHeight: 1.2,
        letterSpacing: "0.02em",
        fontFamily: "monospace",
        pointerEvents: "none",
        zIndex: 3,
      }
    : null;
  const contentLabelDebugStyle = BOX_DEBUG_MODE
    ? {
        position: "absolute",
        left: "2px",
        top: "2px",
        padding: "1px 4px",
        background: "rgba(3, 105, 161, 0.92)",
        color: "#ffffff",
        borderRadius: "3px",
        fontSize: "10px",
        lineHeight: 1.2,
        letterSpacing: "0.02em",
        fontFamily: "monospace",
        pointerEvents: "none",
        zIndex: 2,
      }
    : null;
  const konvaRectDebugStyle = BOX_DEBUG_MODE
    ? {
        position: "fixed",
        left: `${projectedKonvaRectBase.x}px`,
        top: `${projectedKonvaRectBase.y}px`,
        width: `${Math.max(0, projectedKonvaRectBase.width)}px`,
        height: `${Math.max(0, projectedKonvaRectBase.height)}px`,
        background:
          "repeating-linear-gradient(135deg, rgba(239, 68, 68, 0.24) 0 6px, rgba(239, 68, 68, 0.08) 6px 12px)",
        border: "1px dashed rgba(153, 27, 27, 0.95)",
        pointerEvents: "none",
        boxSizing: "border-box",
        mixBlendMode: "multiply",
        zIndex: 10020,
      }
    : null;
  const overlayDebugStyle = BOX_DEBUG_MODE
    ? {
        background: "transparent",
        outline: "2px dashed rgba(217, 119, 6, 0.95)",
        outlineOffset: "2px",
        boxShadow: "0 0 0 1px rgba(146, 64, 14, 0.45)",
      }
    : {};
  const contentDebugStyle = BOX_DEBUG_MODE
    ? {
        background: "rgba(14, 165, 233, 0.24)",
        outline: "1px dashed rgba(3, 105, 161, 0.95)",
        boxShadow: "inset 0 0 0 1px rgba(2, 132, 199, 0.45)",
      }
    : {};

  const emitDebug = useCallback((eventName, extra = {}) => {
    if (!DEBUG_MODE) return;
    const essentialEvents = new Set([
      "overlay: before-show",
      "overlay: before-focus",
      "overlay: after-focus",
      "overlay: after-fonts-ready",
      "overlay: ready-to-swap",
      "overlay: swap-commit",
      "overlay: after-first-paint",
      "overlay: post-layout",
      "finish: blur",
      "input: linebreak",
    ]);
    if (!essentialEvents.has(eventName)) return;
    const ts = new Date().toISOString();
    const frameMeta = nextInlineFrameMeta();
    const overlayEl = editorRef.current?.parentElement || null;
    const overlayRect = overlayEl?.getBoundingClientRect?.() || null;
    const contentRect = contentBoxRef.current?.getBoundingClientRect?.() || null;
    const editableRect = editableHostRef.current?.getBoundingClientRect?.() || null;
    const editableVisualRect = editorRef.current?.getBoundingClientRect?.() || null;
    const computedStyle = editorRef.current
      ? window.getComputedStyle(editorRef.current)
      : null;
    const fullRangeRect = getFullRangeRect(editorRef.current);
    const selectionInfo = getSelectionRectInEditor(editorRef.current);
    const projectedKonvaRect = projectedKonvaRectBase;
    const projectedKonvaRectRawSnapshot = projectedKonvaRectRaw;
    const overlayToKonvaDy = overlayRect
      ? overlayRect.y - projectedKonvaRect.y
      : null;
    const contentToKonvaDy = contentRect
      ? contentRect.y - projectedKonvaRect.y
      : null;
    const fullRangeToContentDy =
      fullRangeRect && contentRect ? fullRangeRect.y - contentRect.y : null;
    const caretToContentDy =
      selectionInfo.inEditor && selectionInfo.rect && contentRect
        ? selectionInfo.rect.y - contentRect.y
        : null;
    const caretProbeRect = getCollapsedCaretProbeRectInEditor(editorRef.current);
    const caretProbeToContentDy =
      caretProbeRect && contentRect ? caretProbeRect.y - contentRect.y : null;
    const caretProbeHeightPx = caretProbeRect ? caretProbeRect.height : null;
    const firstGlyphRect = getFirstGlyphRectInEditor(editorRef.current);
    const firstGlyphToContentDy =
      firstGlyphRect && contentRect ? firstGlyphRect.y - contentRect.y : null;
    const firstGlyphHeightPx = firstGlyphRect ? firstGlyphRect.height : null;
    const probeText = metricsProbeText;
    const canvasInkMetrics =
      canvasInkMetricsModel ||
      measureCanvasInkMetrics({
        fontStyle: nodeProps.fontStyle,
        fontWeight: nodeProps.fontWeight,
        fontSizePx,
        fontFamily: nodeProps.fontFamily,
        probeText,
      });
    const domInkProbe =
      domInkProbeModel ||
      measureDomInkProbe({
        fontStyle: nodeProps.fontStyle,
        fontWeight: nodeProps.fontWeight,
        fontSizePx,
        fontFamily: nodeProps.fontFamily,
        lineHeightPx: editableLineHeightPx,
        letterSpacingPx,
        probeText,
      });
    const domCssInkProbe =
      domCssInkProbeModel ||
      estimateDomCssInkProbe({
        domInkProbe,
        canvasInkMetrics,
        probeText,
      });
    const konvaInkProbe =
      konvaInkProbeModel ||
      measureKonvaInkProbe({
        fontStyle: nodeProps.fontStyle,
        fontWeight: nodeProps.fontWeight,
        fontSizePx,
        fontFamily: nodeProps.fontFamily,
        lineHeightPx: editableLineHeightPx,
        letterSpacingPx,
        probeText,
      });
    const canvasInkTopInsetHeuristicPx =
      canvasInkMetrics && Number.isFinite(canvasInkMetrics.actualInkHeightPx)
        ? (editableLineHeightPx - canvasInkMetrics.actualInkHeightPx) / 2
        : null;
    const canvasInkTopInsetPx = Number.isFinite(Number(konvaInkProbe?.glyphTopInsetPx))
      ? Number(konvaInkProbe.glyphTopInsetPx)
      : canvasInkTopInsetHeuristicPx;
    const domTopInsetForDelta =
      Number.isFinite(Number(domCssInkProbe?.glyphTopInsetPx))
        ? Number(domCssInkProbe.glyphTopInsetPx)
        : Number(domInkProbe?.glyphTopInsetPx);
    const domVsCanvasTopInsetDeltaPx =
      Number.isFinite(domTopInsetForDelta) && Number.isFinite(canvasInkTopInsetPx)
        ? domTopInsetForDelta - canvasInkTopInsetPx
        : null;
    const liveVsProbeGlyphTopDeltaPx =
      Number.isFinite(firstGlyphToContentDy) && domInkProbe
        ? firstGlyphToContentDy - domInkProbe.glyphTopInsetPx
        : null;
    const liveVsCssProbeGlyphTopDeltaPx =
      Number.isFinite(firstGlyphToContentDy) && Number.isFinite(Number(domCssInkProbe?.glyphTopInsetPx))
        ? firstGlyphToContentDy - Number(domCssInkProbe.glyphTopInsetPx)
        : null;

    const payload = {
      ...frameMeta,
      id: editingId || null,
      eventName,
      phase: extra?.phase || overlayPhase,
      overlayEngine: normalizedOverlayEngine,
      sessionId: overlaySessionIdRef.current,
      valueLength: rawValue.length,
      dpr:
        typeof window !== "undefined"
          ? roundMetric(Number(window.devicePixelRatio || 1), 3)
          : null,
      zoom: roundMetric(Number(scaleVisual || 1), 4),
      left,
      top,
      baseTextWidth,
      effectiveTextWidth,
      finishMode: normalizedFinishMode,
      widthMode: normalizedWidthMode,
      overlayWidthSource,
      projectedWidthRawPx: roundMetric(Number(projectedWidth)),
      measuredOverlayWidthPx: roundMetric(Number(measuredOverlayWidthPx)),
      syncedOverlayWidthPx: roundMetric(resolvedOverlayWidthPx),
      syncedOverlayHeightPx: roundMetric(resolvedOverlayHeightPx),
      overlayRect: overlayRect
        ? {
            x: overlayRect.x,
            y: overlayRect.y,
            width: overlayRect.width,
            height: overlayRect.height,
          }
        : null,
      contentRect: contentRect
        ? {
            x: contentRect.x,
            y: contentRect.y,
            width: contentRect.width,
            height: contentRect.height,
          }
        : null,
      editableRect: editableRect
        ? {
            x: editableRect.x,
            y: editableRect.y,
            width: editableRect.width,
            height: editableRect.height,
          }
        : null,
      editableVisualRect: editableVisualRect
        ? {
            x: editableVisualRect.x,
            y: editableVisualRect.y,
            width: editableVisualRect.width,
            height: editableVisualRect.height,
          }
        : null,
      contentScrollWidth: editorRef.current?.scrollWidth ?? null,
      contentClientWidth: editorRef.current?.clientWidth ?? null,
      isFocused: document.activeElement === editorRef.current,
      projectedKonvaRect,
      projectedKonvaRectRaw: projectedKonvaRectRawSnapshot,
      lockedCenterStageX: roundMetric(Number(lockedCenterStageX)),
      centerViewportX: roundMetric(Number(centerViewportX)),
      overlayToKonvaDy,
      contentToKonvaDy,
      fullRangeRect,
      selectionInEditor: selectionInfo.inEditor,
      selectionRect: selectionInfo.rect,
      fullRangeToContentDy,
      caretToContentDy,
      caretProbeRect,
      caretProbeToContentDy,
      caretProbeHeightPx,
      firstGlyphRect,
      firstGlyphToContentDy,
      firstGlyphHeightPx,
      computedFontSize: computedStyle?.fontSize ?? null,
      computedFontFamily: computedStyle?.fontFamily ?? null,
      computedFontWeight: computedStyle?.fontWeight ?? null,
      computedFontStyle: computedStyle?.fontStyle ?? null,
      computedLineHeight: computedStyle?.lineHeight ?? null,
      computedFontOpticalSizing: computedStyle?.fontOpticalSizing ?? null,
      computedPaddingTop: computedStyle?.paddingTop ?? null,
      computedPaddingBottom: computedStyle?.paddingBottom ?? null,
      computedBorderTop: computedStyle?.borderTopWidth ?? null,
      computedBorderBottom: computedStyle?.borderBottomWidth ?? null,
      fontSizePx,
      lineHeightPx,
      cssLineHeightPx,
      singleLineCaretMode,
      singleLineProbeOverflowPx: roundMetric(Number(singleLineProbeOverflowPx)),
      useKonvaLineHeightForSingleLine,
      letterSpacingPx,
      isSingleLine,
      maintainCenterWhileEditing: Boolean(maintainCenterWhileEditing),
      shouldCenterTextWithinOverlay: Boolean(shouldCenterTextWithinOverlay),
      centeredEditorWidthPx: roundMetric(Number(centeredEditorWidthPx)),
      centeredEditorLeftPx: roundMetric(Number(centeredEditorLeftPx)),
      verticalInsetPx,
      editorPaddingTopPx: roundMetric(editorPaddingTopPx),
      editorPaddingBottomPx: roundMetric(editorPaddingBottomPx),
      editableLineHeightPx,
      editorVisualReady,
      fontFamilyNode: nodeProps.fontFamily || null,
      fontLoadRevision: Number(fontMetricsRevision || 0),
      fontLoadAvailable: fontLoadStatus?.available ?? null,
      fontLoadSpec: fontLoadStatus?.spec || null,
      valueProbeText: probeTextForAlignment,
      metricsProbeText,
      editorTag: !editorRef.current
        ? null
        : editorRef.current instanceof HTMLInputElement
          ? "input"
          : "contentEditable",
      normalizedValueLength: isSingleLine
        ? normalizedValueForSingleLine.length
        : normalizedValue.length,
      hadTrailingNewline:
        isSingleLine && normalizedValueForSingleLine.length !== normalizedValue.length,
      canvasInkMetrics,
      domInkProbe,
      domCssInkProbe,
      konvaInkProbe,
      canvasInkTopInsetPx: roundMetric(canvasInkTopInsetPx),
      canvasInkTopInsetHeuristicPx: roundMetric(canvasInkTopInsetHeuristicPx),
      domVsCanvasTopInsetDeltaPx: roundMetric(domVsCanvasTopInsetDeltaPx),
      liveVsProbeGlyphTopDeltaPx: roundMetric(liveVsProbeGlyphTopDeltaPx),
      liveVsCssProbeGlyphTopDeltaPx: roundMetric(liveVsCssProbeGlyphTopDeltaPx),
      domToKonvaGlyphOffsetPx: roundMetric(domToKonvaGlyphOffsetPx),
      domToKonvaPaddingOffsetPx: roundMetric(domToKonvaPaddingOffsetPx),
      domToKonvaBaseVisualOffsetPx: roundMetric(domToKonvaBaseVisualOffsetPx),
      domVisualNudgePx: roundMetric(domVisualNudgePx),
      domVisualResidualDeadZonePx: roundMetric(domVisualResidualDeadZonePx),
      domVisualResidualDeadZoneEffectivePx: roundMetric(domVisualResidualDeadZoneEffectivePx),
      domToKonvaVisualOffsetRawPx: roundMetric(domToKonvaVisualOffsetRawPx),
      domToKonvaVisualOffsetPx: roundMetric(effectiveVisualOffsetPx),
      domToKonvaVisualOffsetOneShotPx: roundMetric(Number(v2OffsetOneShotPx || 0)),
      domToKonvaOffsetModel: domToKonvaOffsetModel || null,
      layoutModelVersion: isPhaseAtomicV2
        ? `${INLINE_LAYOUT_VERSION}-${INLINE_ALIGNMENT_MODEL_V2_VERSION}`
        : INLINE_LAYOUT_VERSION,
      ...extra,
    };

    const positionSnapshot = {
      id: editingId || null,
      eventName,
      konvaRect: projectedKonvaRect,
      konvaRectRaw: projectedKonvaRectRawSnapshot,
      domRect: overlayRect
        ? {
            x: roundMetric(Number(overlayRect.x)),
            y: roundMetric(Number(overlayRect.y)),
            width: roundMetric(Number(overlayRect.width)),
            height: roundMetric(Number(overlayRect.height)),
          }
        : null,
      delta: overlayRect
        ? {
            dx: roundMetric(Number(overlayRect.x) - Number(projectedKonvaRect.x)),
            dy: roundMetric(Number(overlayRect.y) - Number(projectedKonvaRect.y)),
            dw: roundMetric(Number(overlayRect.width) - Number(projectedKonvaRect.width)),
            dh: roundMetric(Number(overlayRect.height) - Number(projectedKonvaRect.height)),
          }
        : null,
    };
    console.log(`[INLINE][POS] position:konva-vs-dom\n${formatInlineLogPayload(positionSnapshot)}`);
    const sizeSnapshot = {
      id: editingId || null,
      eventName,
      boxes: {
        konvaText: projectedKonvaRect
          ? {
              x: roundMetric(Number(projectedKonvaRect.x)),
              y: roundMetric(Number(projectedKonvaRect.y)),
              width: roundMetric(Number(projectedKonvaRect.width)),
              height: roundMetric(Number(projectedKonvaRect.height)),
            }
          : null,
        konvaTextRaw: projectedKonvaRectRawSnapshot
          ? {
              x: roundMetric(Number(projectedKonvaRectRawSnapshot.x)),
              y: roundMetric(Number(projectedKonvaRectRawSnapshot.y)),
              width: roundMetric(Number(projectedKonvaRectRawSnapshot.width)),
              height: roundMetric(Number(projectedKonvaRectRawSnapshot.height)),
            }
          : null,
        domOverlay: overlayRect
          ? {
              x: roundMetric(Number(overlayRect.x)),
              y: roundMetric(Number(overlayRect.y)),
              width: roundMetric(Number(overlayRect.width)),
              height: roundMetric(Number(overlayRect.height)),
            }
          : null,
        domText: contentRect
          ? {
              x: roundMetric(Number(contentRect.x)),
              y: roundMetric(Number(contentRect.y)),
              width: roundMetric(Number(contentRect.width)),
              height: roundMetric(Number(contentRect.height)),
            }
          : null,
        domEditable: editableRect
          ? {
              x: roundMetric(Number(editableRect.x)),
              y: roundMetric(Number(editableRect.y)),
              width: roundMetric(Number(editableRect.width)),
              height: roundMetric(Number(editableRect.height)),
            }
          : null,
        domEditableVisual: editableVisualRect
          ? {
              x: roundMetric(Number(editableVisualRect.x)),
              y: roundMetric(Number(editableVisualRect.y)),
              width: roundMetric(Number(editableVisualRect.width)),
              height: roundMetric(Number(editableVisualRect.height)),
            }
          : null,
      },
      delta: {
        overlayVsKonva:
          overlayRect && projectedKonvaRect
            ? {
                dx: roundMetric(Number(overlayRect.x) - Number(projectedKonvaRect.x)),
                dy: roundMetric(Number(overlayRect.y) - Number(projectedKonvaRect.y)),
                dw: roundMetric(Number(overlayRect.width) - Number(projectedKonvaRect.width)),
                dh: roundMetric(Number(overlayRect.height) - Number(projectedKonvaRect.height)),
              }
            : null,
        domTextVsKonva:
          contentRect && projectedKonvaRect
            ? {
                dx: roundMetric(Number(contentRect.x) - Number(projectedKonvaRect.x)),
                dy: roundMetric(Number(contentRect.y) - Number(projectedKonvaRect.y)),
                dw: roundMetric(Number(contentRect.width) - Number(projectedKonvaRect.width)),
                dh: roundMetric(Number(contentRect.height) - Number(projectedKonvaRect.height)),
              }
            : null,
        domEditableVsKonva:
          editableRect && projectedKonvaRect
            ? {
                dx: roundMetric(Number(editableRect.x) - Number(projectedKonvaRect.x)),
                dy: roundMetric(Number(editableRect.y) - Number(projectedKonvaRect.y)),
                dw: roundMetric(Number(editableRect.width) - Number(projectedKonvaRect.width)),
                dh: roundMetric(Number(editableRect.height) - Number(projectedKonvaRect.height)),
              }
            : null,
        domEditableVsDomText:
          editableRect && contentRect
            ? {
                dx: roundMetric(Number(editableRect.x) - Number(contentRect.x)),
                dy: roundMetric(Number(editableRect.y) - Number(contentRect.y)),
                dw: roundMetric(Number(editableRect.width) - Number(contentRect.width)),
                dh: roundMetric(Number(editableRect.height) - Number(contentRect.height)),
              }
            : null,
        domEditableVisualVsDomText:
          editableVisualRect && contentRect
            ? {
                dx: roundMetric(Number(editableVisualRect.x) - Number(contentRect.x)),
                dy: roundMetric(Number(editableVisualRect.y) - Number(contentRect.y)),
                dw: roundMetric(Number(editableVisualRect.width) - Number(contentRect.width)),
                dh: roundMetric(Number(editableVisualRect.height) - Number(contentRect.height)),
              }
            : null,
      },
      syncedTarget: {
        widthPx: roundMetric(Number(resolvedOverlayWidthPx)),
        heightPx: roundMetric(Number(resolvedOverlayHeightPx)),
      },
    };
    console.log(`[INLINE][SIZE] box-size-position\n${formatInlineLogPayload(sizeSnapshot)}`);
    const domBoxTop = contentRect ? Number(contentRect.y) : null;
    const domBoxHeight = contentRect ? Number(contentRect.height) : null;
    const domEditableTop = editableRect ? Number(editableRect.y) : null;
    const domEditableHeight = editableRect ? Number(editableRect.height) : null;
    const domEditableVisualTop = editableVisualRect ? Number(editableVisualRect.y) : null;
    const domEditableVisualHeight = editableVisualRect ? Number(editableVisualRect.height) : null;
    const domGlyphTop = firstGlyphRect ? Number(firstGlyphRect.y) : null;
    const domGlyphHeight = firstGlyphRect ? Number(firstGlyphRect.height) : null;
    const konvaBoxTop = projectedKonvaRect ? Number(projectedKonvaRect.y) : null;
    const konvaBoxHeight = projectedKonvaRect ? Number(projectedKonvaRect.height) : null;
    const domGlyphInsetTop =
      Number.isFinite(domGlyphTop) && Number.isFinite(domBoxTop)
        ? domGlyphTop - domBoxTop
        : null;
    const domGlyphInsetBottom =
      Number.isFinite(domGlyphTop) &&
      Number.isFinite(domGlyphHeight) &&
      Number.isFinite(domBoxTop) &&
      Number.isFinite(domBoxHeight)
        ? (domBoxTop + domBoxHeight) - (domGlyphTop + domGlyphHeight)
        : null;
    const alignSnapshot = {
      id: editingId || null,
      eventName,
      konvaBox: projectedKonvaRect
        ? {
            top: roundMetric(konvaBoxTop),
            height: roundMetric(konvaBoxHeight),
          }
        : null,
      domBox: contentRect
        ? {
            top: roundMetric(domBoxTop),
            height: roundMetric(domBoxHeight),
          }
        : null,
      domEditableBox: editableRect
        ? {
            top: roundMetric(domEditableTop),
            height: roundMetric(domEditableHeight),
          }
        : null,
      domEditableVisualBox: editableVisualRect
        ? {
            top: roundMetric(domEditableVisualTop),
            height: roundMetric(domEditableVisualHeight),
          }
        : null,
      domGlyph: firstGlyphRect
        ? {
            top: roundMetric(domGlyphTop),
            height: roundMetric(domGlyphHeight),
          }
        : null,
      insets: {
        domGlyphInsetTop: roundMetric(domGlyphInsetTop),
        domGlyphInsetBottom: roundMetric(domGlyphInsetBottom),
        canvasInkTopInsetPx: roundMetric(canvasInkTopInsetPx),
        domProbeGlyphTopInsetPx: roundMetric(Number(domInkProbe?.glyphTopInsetPx)),
        domCssProbeGlyphTopInsetPx: roundMetric(Number(domCssInkProbe?.glyphTopInsetPx)),
        domCssProbeGlyphTopInsetAfterOffsetPx: roundMetric(
          Number(domCssInkProbe?.glyphTopInsetPx) + Number(effectiveVisualOffsetPx || 0)
        ),
        konvaProbeGlyphTopInsetPx: roundMetric(Number(konvaInkProbe?.glyphTopInsetPx)),
      },
      delta: {
        domBoxTopVsKonvaTop:
          Number.isFinite(domBoxTop) && Number.isFinite(konvaBoxTop)
            ? roundMetric(domBoxTop - konvaBoxTop)
            : null,
        domGlyphTopVsKonvaTop:
          Number.isFinite(domGlyphTop) && Number.isFinite(konvaBoxTop)
            ? roundMetric(domGlyphTop - konvaBoxTop)
            : null,
        domGlyphTopVsDomBoxTop:
          Number.isFinite(domGlyphTop) && Number.isFinite(domBoxTop)
            ? roundMetric(domGlyphTop - domBoxTop)
            : null,
        domGlyphTopVsDomEditableTop:
          Number.isFinite(domGlyphTop) && Number.isFinite(domEditableTop)
            ? roundMetric(domGlyphTop - domEditableTop)
            : null,
        domProbeToKonvaProbeTopInset:
          Number.isFinite(Number(domInkProbe?.glyphTopInsetPx)) &&
          Number.isFinite(Number(konvaInkProbe?.glyphTopInsetPx))
            ? roundMetric(Number(domInkProbe.glyphTopInsetPx) - Number(konvaInkProbe.glyphTopInsetPx))
            : null,
        domCssProbeToKonvaProbeTopInset:
          Number.isFinite(Number(domCssInkProbe?.glyphTopInsetPx)) &&
          Number.isFinite(Number(konvaInkProbe?.glyphTopInsetPx))
            ? roundMetric(Number(domCssInkProbe.glyphTopInsetPx) - Number(konvaInkProbe.glyphTopInsetPx))
            : null,
        domCssProbeAfterOffsetToKonvaProbeTopInset:
          Number.isFinite(Number(domCssInkProbe?.glyphTopInsetPx)) &&
          Number.isFinite(Number(konvaInkProbe?.glyphTopInsetPx))
            ? roundMetric(
                Number(domCssInkProbe.glyphTopInsetPx) +
                  Number(effectiveVisualOffsetPx || 0) -
                  Number(konvaInkProbe.glyphTopInsetPx)
              )
            : null,
        appliedDomToKonvaGlyphOffsetPx: roundMetric(domToKonvaGlyphOffsetPx),
        appliedDomToKonvaPaddingOffsetPx: roundMetric(domToKonvaPaddingOffsetPx),
        appliedDomVisualNudgePx: roundMetric(domVisualNudgePx),
        appliedDomToKonvaVisualOffsetPx: roundMetric(effectiveVisualOffsetPx),
        offsetSource: domToKonvaOffsetModel?.source || null,
        offsetSaneLimitPx: roundMetric(Number(domToKonvaOffsetModel?.saneLimit)),
        offsetRawPx: roundMetric(Number(domToKonvaOffsetModel?.rawOffset)),
        offsetBlockedReason: domToKonvaOffsetModel?.blockedReason || null,
      },
    };
    console.log(`[INLINE][ALIGN] glyph-top-alignment\n${formatInlineLogPayload(alignSnapshot)}`);

    const body = formatInlineLogPayload(payload);
    console.log(`[INLINE][${ts}] ${eventName}\n${body}`);
    const traceDx = Number(positionSnapshot?.delta?.dx);
    const traceDy = Number(positionSnapshot?.delta?.dy);
    pushInlineTraceEvent(eventName, {
      id: editingId || null,
      sessionId: overlaySessionIdRef.current,
      phase: payload.phase || eventName,
      overlayEngine: normalizedOverlayEngine,
      konvaRect: positionSnapshot?.konvaRect || null,
      domOverlayRect: positionSnapshot?.domRect || null,
      domInkRect:
        firstGlyphRect && contentRect
          ? {
              x: roundMetric(Number(firstGlyphRect.x)),
              y: roundMetric(Number(firstGlyphRect.y)),
              width: roundMetric(Number(firstGlyphRect.width)),
              height: roundMetric(Number(firstGlyphRect.height)),
            }
          : null,
      dx: roundMetric(traceDx),
      dy: roundMetric(traceDy),
      dw: roundMetric(Number(positionSnapshot?.delta?.dw)),
      dh: roundMetric(Number(positionSnapshot?.delta?.dh)),
      offsetYApplied: roundMetric(Number(domToKonvaVisualOffsetPx || 0)),
      offsetYResolved: roundMetric(Number(effectiveVisualOffsetPx || 0)),
      fontSpec: fontLoadStatus?.spec || null,
      dpr: payload.dpr,
      zoom: payload.zoom,
    });
    if (
      Number.isFinite(traceDx) &&
      Number.isFinite(traceDy) &&
      (Math.abs(traceDx) > 0.5 || Math.abs(traceDy) > 0.5)
    ) {
      console.warn("[INLINE_ALERT]", {
        id: editingId || null,
        phase: payload.phase || eventName,
        dx: roundMetric(traceDx),
        dy: roundMetric(traceDy),
        maxAllowedPx: 0.5,
      });
    }
    if (typeof onDebugEvent === "function") {
      onDebugEvent(eventName, payload);
    }
  }, [
    DEBUG_MODE,
    editingId,
    rawValue,
    normalizedValue,
    normalizedValueForSingleLine,
    left,
    top,
    baseTextWidth,
    effectiveTextWidth,
    normalizedFinishMode,
    normalizedWidthMode,
    overlayWidthSource,
    projectedWidth,
    measuredOverlayWidthPx,
    resolvedOverlayWidthPx,
    resolvedOverlayHeightPx,
    onDebugEvent,
    projectedKonvaRectBase.x,
    projectedKonvaRectBase.y,
    projectedKonvaRectBase.width,
    projectedKonvaRectBase.height,
    projectedKonvaRectRaw.x,
    projectedKonvaRectRaw.y,
    projectedKonvaRectRaw.width,
    projectedKonvaRectRaw.height,
    fontSizePx,
    lineHeightPx,
    cssLineHeightPx,
    letterSpacingPx,
    isSingleLine,
    maintainCenterWhileEditing,
    shouldCenterTextWithinOverlay,
    centeredEditorWidthPx,
    centeredEditorLeftPx,
    singleLineCaretMode,
    singleLineProbeOverflowPx,
    useKonvaLineHeightForSingleLine,
    verticalInsetPx,
    editorPaddingTopPx,
    editorPaddingBottomPx,
    editableLineHeightPx,
    editorVisualReady,
    lockedCenterStageX,
    centerViewportX,
    probeTextForAlignment,
    metricsProbeText,
    canvasInkMetricsModel,
    domInkProbeModel,
    domCssInkProbeModel,
    konvaInkProbeModel,
    domToKonvaOffsetModel,
    domToKonvaGlyphOffsetPx,
    domToKonvaPaddingOffsetPx,
    domToKonvaBaseVisualOffsetPx,
    domVisualNudgePx,
    domVisualResidualDeadZonePx,
    domVisualResidualDeadZoneEffectivePx,
    domToKonvaVisualOffsetRawPx,
    effectiveVisualOffsetPx,
    v2OffsetOneShotPx,
    fontMetricsRevision,
    fontLoadStatus?.available,
    fontLoadStatus?.spec,
    isPhaseAtomicV2,
    normalizedOverlayEngine,
    nodeProps.fontStyle,
    nodeProps.fontWeight,
    nodeProps.fontFamily,
    overlayPhase,
    scaleVisual,
  ]);

  useEffect(() => {
    if (!isPhaseAtomicV2) return undefined;
    if (!editingId) return undefined;
    let cancelled = false;
    let timeoutId = 0;

    setOverlayPhase("prepare_fonts");
    const markReady = (reason) => {
      if (cancelled) return;
      setV2FontsReady(true);
      emitDebug("overlay: after-fonts-ready", {
        phase: "after-fonts-ready",
        reason,
        sessionId: overlaySessionIdRef.current,
        maxPrepareLatencyMs: 120,
      });
    };

    if (fontLoadStatus?.available !== false) {
      markReady("fonts-ready");
      return () => {
        cancelled = true;
      };
    }

    timeoutId = window.setTimeout(() => {
      markReady("timeout-120ms");
    }, 120);

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [editingId, emitDebug, fontLoadStatus?.available, isPhaseAtomicV2]);

  useEffect(() => {
    if (!isPhaseAtomicV2) return;
    if (!editingId) return;
    if (!v2FontsReady || v2OffsetComputed) return;

    setOverlayPhase("compute_offset");
    const offset = Number(domToKonvaOffsetModel?.appliedOffset);
    setV2OffsetOneShotPx(Number.isFinite(offset) ? offset : 0);
    setV2OffsetComputed(true);
    setOverlayPhase("ready_to_swap");
  }, [
    domToKonvaOffsetModel?.appliedOffset,
    editingId,
    isPhaseAtomicV2,
    v2FontsReady,
    v2OffsetComputed,
  ]);

  useLayoutEffect(() => {
    if (!isPhaseAtomicV2) return;
    if (!editingId) return;
    if (!v2OffsetComputed || v2SwapRequested) return;
    if (typeof onOverlaySwapRequest !== "function") return;

    const sessionId = overlaySessionIdRef.current || `${editingId}-${Date.now()}`;
    overlaySessionIdRef.current = sessionId;
    setV2SwapRequested(true);
    setOverlayPhase("ready_to_swap");
    emitDebug("overlay: ready-to-swap", {
      phase: "ready_to_swap",
      sessionId,
      offsetYApplied: roundMetric(Number(v2OffsetOneShotPx || 0)),
    });
    onOverlaySwapRequest({
      id: editingId,
      sessionId,
      phase: "ready_to_swap",
      offsetY: Number(v2OffsetOneShotPx || 0),
    });
  }, [
    editingId,
    emitDebug,
    isPhaseAtomicV2,
    onOverlaySwapRequest,
    v2OffsetComputed,
    v2OffsetOneShotPx,
    v2SwapRequested,
  ]);

  useLayoutEffect(() => {
    if (!isPhaseAtomicV2) return;
    if (!editingId) return;
    const token = Number(swapAckToken?.token || 0);
    if (!Number.isFinite(token) || token <= 0 || token === swapAckSeenRef.current) return;
    if (swapAckToken?.id !== editingId) return;
    if (swapAckToken?.sessionId !== overlaySessionIdRef.current) return;

    swapAckSeenRef.current = token;
    const phase = swapAckToken?.phase || null;
    if (phase === "swap-commit") {
      setOverlayPhase("active");
      setEditorVisualReady(true);
      emitDebug("overlay: swap-commit", {
        phase: "swap-commit",
        sessionId: overlaySessionIdRef.current,
        swapAckToken: token,
        offsetYApplied: roundMetric(Number(v2OffsetOneShotPx || 0)),
      });
      requestAnimationFrame(() => {
        setLayoutProbeRevision((prev) => prev + 1);
        emitDebug("overlay: after-first-paint", {
          phase: "after-first-paint",
          sessionId: overlaySessionIdRef.current,
          swapAckToken: token,
        });
      });
      return;
    }

    if (phase === "finish_commit" || phase === "done" || phase === "cancel") {
      setOverlayPhase("done");
    }
  }, [
    editingId,
    emitDebug,
    isPhaseAtomicV2,
    swapAckToken,
    v2OffsetOneShotPx,
  ]);

  useEffect(() => {
    if (!editingId) return;
    if (layoutProbeRevision <= 0) return;
    if (
      isPhaseAtomicV2 &&
      overlayPhase !== "active" &&
      overlayPhase !== "done"
    ) {
      return;
    }
    emitDebug("overlay: post-layout", {
      layoutProbeRevision: Number(layoutProbeRevision || 0),
    });
  }, [
    editingId,
    isPhaseAtomicV2,
    layoutProbeRevision,
    domVisualNudgePx,
    emitDebug,
    overlayPhase,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!Array.isArray(window.__INLINE_TRACE)) {
      window.__INLINE_TRACE = [];
    }
    if (!window.__INLINE_TEST || typeof window.__INLINE_TEST !== "object") {
      window.__INLINE_TEST = {};
    }
    const runMatrix = async (options = {}) => {
      const trace = Array.isArray(window.__INLINE_TRACE) ? [...window.__INLINE_TRACE] : [];
      const summary = summarizeInlineTrace({
        trace,
        maxErrorPx: Number.isFinite(Number(options?.maxErrorPx))
          ? Number(options.maxErrorPx)
          : 0.5,
        phases: Array.isArray(options?.phases) ? options.phases : undefined,
      });
      return {
        generatedAt: new Date().toISOString(),
        engine: normalizedOverlayEngine,
        modelVersion: isPhaseAtomicV2
          ? `${INLINE_LAYOUT_VERSION}-${INLINE_ALIGNMENT_MODEL_V2_VERSION}`
          : INLINE_LAYOUT_VERSION,
        alignmentModelVersion: INLINE_ALIGNMENT_MODEL_V2_VERSION,
        summary,
        sampleCount: trace.length,
        trace,
      };
    };
    const clearTrace = () => {
      window.__INLINE_TRACE = [];
      return true;
    };

    window.__INLINE_TEST.runMatrix = runMatrix;
    window.__INLINE_TEST.clearTrace = clearTrace;
    return () => {
      if (window.__INLINE_TEST?.runMatrix === runMatrix) {
        delete window.__INLINE_TEST.runMatrix;
      }
      if (window.__INLINE_TEST?.clearTrace === clearTrace) {
        delete window.__INLINE_TEST.clearTrace;
      }
    };
  }, [isPhaseAtomicV2, normalizedOverlayEngine]);

  // Handoff visual: avisar al canvas recien cuando el editor DOM ya esta
  // visualmente calibrado para evitar saltos Konva->DOM al entrar en edicion.
  useEffect(() => {
    if (isPhaseAtomicV2) return undefined;
    if (typeof onOverlayMountChange !== "function") return;
    if (!editingId) return;
    if (!editorVisualReady) return;

    onOverlayMountChange(editingId, true);
    return () => {
      onOverlayMountChange(editingId, false);
    };
  }, [editingId, editorVisualReady, isPhaseAtomicV2, onOverlayMountChange]);

  // Inicializar contenido + foco + caret antes del primer paint visible
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    clearPendingDoneDispatchForId(editingId || null);
    if (isPhaseAtomicV2) {
      setOverlayPhase("prepare_mount");
      emitDebug("overlay: before-show", {
        phase: "before-show",
        sessionId: overlaySessionIdRef.current,
      });
    }

    let initialText = normalizedValue;

    if (window._preFillChar) {
      initialText = (initialText || "") + window._preFillChar;
      onChange(initialText);
      window._preFillChar = null;
    }

    if (el instanceof HTMLInputElement) {
      el.value = initialText;
      emitDebug("overlay: before-focus");
      el.focus();
      const len = initialText.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        // no-op
      }
    } else {
      el.innerText = initialText;
      emitDebug("overlay: before-focus");
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setLayoutProbeRevision((prev) => prev + 1);
        requestAnimationFrame(() => {
          emitDebug("overlay: after-focus");
        });
      });
    });
    return () => {
      if (isPhaseAtomicV2 && typeof onOverlaySwapRequest === "function" && editingId) {
        const closingId = editingId;
        const closingSessionId = overlaySessionIdRef.current;
        const closingOffset = Number(v2OffsetOneShotPx || 0);
        const timerId = window.setTimeout(() => {
          const pending = pendingDoneDispatchRef.current || {};
          if (Number(pending.timerId || 0) !== Number(timerId)) return;
          pendingDoneDispatchRef.current = {
            timerId: 0,
            id: null,
            sessionId: null,
          };
          onOverlaySwapRequest({
            id: closingId,
            sessionId: closingSessionId,
            phase: "done",
            offsetY: closingOffset,
          });
        }, 0);
        pendingDoneDispatchRef.current = {
          timerId,
          id: closingId,
          sessionId: closingSessionId,
        };
      }
      emitDebug("overlay: before-unmount");
      const closingId = editingId || null;
      requestAnimationFrame(() => {
        const safeId = String(closingId || "").replace(/"/g, '\\"');
        const overlayStillPresent = safeId
          ? Boolean(document.querySelector(`[data-inline-editor-id="${safeId}"]`))
          : false;
        emitDebug("overlay: after-unmount-raf", {
          id: closingId,
          overlayStillPresent,
          currentEditingId: window._currentEditingId ?? null,
          globalEditingId: window.editing?.id ?? null,
        });
      });
    };
  }, [clearPendingDoneDispatchForId, editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    el.scrollTop = 0;
  }, []);

  const triggerFinish = useCallback((trigger = "blur") => {
    if (isPhaseAtomicV2 && typeof onOverlaySwapRequest === "function" && editingId) {
      setOverlayPhase("finish_commit");
      onOverlaySwapRequest({
        id: editingId,
        sessionId: overlaySessionIdRef.current,
        phase: "finish_commit",
        offsetY: Number(v2OffsetOneShotPx || 0),
      });
    }
    emitDebug("finish: blur", {
      id: editingId || null,
      mode: normalizedFinishMode,
      trigger,
    });
    if (normalizedFinishMode === "immediate") {
      onFinish();
      return;
    }
    if (normalizedFinishMode === "raf") {
      requestAnimationFrame(() => {
        onFinish();
      });
      return;
    }
    setTimeout(onFinish, 100);
  }, [
    editingId,
    emitDebug,
    isPhaseAtomicV2,
    normalizedFinishMode,
    onFinish,
    onOverlaySwapRequest,
    v2OffsetOneShotPx,
  ]);

  const overlayLeftPx = left;
  const overlayTopPx = top;
  const overlayPortalTarget = document.body;

  return createPortal(
    <>
      {BOX_DEBUG_MODE && (
        <div
          data-inline-konva-debug="true"
          style={konvaRectDebugStyle}
        />
      )}
      {BOX_DEBUG_MODE && (
        <div
          data-inline-konva-debug-label="true"
          style={konvaLabelDebugStyle}
        >
          KONVA PROJECTION
        </div>
      )}
      <div
        data-inline-editor-id={editingId || ""}
        data-inline-editor-visual-ready={editorVisualReady ? "true" : "false"}
        data-inline-overlay-engine={normalizedOverlayEngine}
        data-inline-overlay-phase={overlayPhase}
        data-inline-editor="true"
        data-inline-width-mode={normalizedWidthMode}
        data-inline-finish-mode={normalizedFinishMode}
        data-inline-box-debug={BOX_DEBUG_MODE ? "true" : "false"}
        style={{
          position: "fixed",
          left: `${overlayLeftPx}px`,
          top: `${overlayTopPx}px`,
          display: "block",
          verticalAlign: "top",
          width:
            Number.isFinite(resolvedOverlayWidthPx)
              ? `${resolvedOverlayWidthPx}px`
              : (
                normalizedWidthMode === "measured"
                  ? `${effectiveTextWidth}px`
                  : "fit-content"
              ),
          minWidth: `${resolvedMinWidthPx}px`,
          height: Number.isFinite(resolvedOverlayHeightPx)
            ? `${resolvedOverlayHeightPx}px`
            : undefined,
          minHeight: Number.isFinite(resolvedOverlayHeightPx)
            ? `${resolvedOverlayHeightPx}px`
            : undefined,
          maxWidth: "min(100vw - 40px, 1200px)",
          background: "transparent",
          borderRadius: 0,
          boxShadow: "none",
          border: "none",
          padding: `${PADDING_Y}px ${PADDING_X}px`,
          zIndex: 9999,
          boxSizing: "border-box",
          ...overlayDebugStyle,
        }}
      >
        {BOX_DEBUG_MODE && (
          <div
            data-inline-overlay-debug-label="true"
            style={overlayLabelDebugStyle}
          >
            DOM OVERLAY [{overlayPhase}]
          </div>
        )}
        {BOX_DEBUG_MODE && (
          <div
            data-inline-content-debug-label="true"
            style={contentLabelDebugStyle}
          >
            DOM TEXT
          </div>
        )}
        <div
          ref={contentBoxRef}
          data-inline-text-debug={BOX_DEBUG_MODE ? "true" : "false"}
          style={{
            display: "block",
            verticalAlign: "top",
            width:
              Number.isFinite(resolvedOverlayWidthPx)
                ? `${resolvedOverlayWidthPx}px`
                : (
                  normalizedWidthMode === "measured"
                    ? `${effectiveTextWidth}px`
                    : undefined
                ),
            minWidth: `${resolvedMinWidthPx}px`,
            height: Number.isFinite(resolvedOverlayHeightPx)
              ? `${resolvedOverlayHeightPx}px`
              : undefined,
            minHeight: `${resolvedContentMinHeightPx}px`,
            background: "transparent",
            borderRadius: 0,
            padding: 0,
            margin: 0,
            outline: "none",
            boxSizing: "border-box",
            position: "relative",
            overflow: "visible",
            ...contentDebugStyle,
          }}
        >
        <div
          ref={editableHostRef}
          style={{
            display: "block",
            verticalAlign: "top",
            width: "100%",
            minWidth: "100%",
            height: Number.isFinite(resolvedOverlayHeightPx)
              ? "100%"
              : undefined,
            minHeight: "100%",
            position: "relative",
            left: 0,
            top: 0,
            margin: 0,
            padding: 0,
            border: 0,
            outline: "none",
            boxSizing: "border-box",
            overflow: "visible",
          }}
        >
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            style={{
              display: "block",
              verticalAlign: "top",
              width: Number.isFinite(centeredEditorWidthPx)
                ? `${centeredEditorWidthPx}px`
                : "100%",
              minWidth: Number.isFinite(centeredEditorWidthPx)
                ? `${centeredEditorWidthPx}px`
                : "100%",
              height: "100%",
              minHeight: "100%",
              position: "absolute",
              left: `${centeredEditorLeftPx}px`,
              top: `${effectiveVisualOffsetPx}px`,
              visibility: isEditorVisible ? "visible" : "hidden",
              whiteSpace: "pre",
              overflowWrap: "normal",
              wordBreak: "normal",
              overflow: "visible",
              fontSize: `${fontSizePx}px`,
              fontFamily: nodeProps.fontFamily,
              fontWeight: nodeProps.fontWeight,
              fontStyle: nodeProps.fontStyle,
              fontOpticalSizing: "none",
              textRendering: "geometricPrecision",
              WebkitFontSmoothing: "antialiased",
              MozOsxFontSmoothing: "grayscale",
              lineHeight: `${editableLineHeightPx}px`,
              letterSpacing: `${letterSpacingPx}px`,
              color: editorTextColor,
              caretColor: editorTextColor,
              WebkitTextFillColor: editorTextColor,
              background: "transparent",
              borderRadius: 0,
              paddingTop: `${editorPaddingTopPx}px`,
              paddingBottom: `${editorPaddingBottomPx}px`,
              paddingLeft: 0,
              paddingRight: 0,
              margin: 0,
              outline: "none",
              boxSizing: "border-box",
              textAlign: textAlign || "left",
            }}
            onInput={(e) => {
              const domRaw = String(e.currentTarget.innerText || "");
              const domNormalized = normalizeInlineEditableText(domRaw, {
                trimPhantomTrailingNewline: false,
              });
              const nextValue = normalizeInlineEditableText(domRaw, {
                trimPhantomTrailingNewline: true,
              });
              const prevValue = normalizedValue;
              const prevStats = getInlineLineStats(prevValue, { canonical: true });
              const nextStats = getInlineLineStats(nextValue, { canonical: true });
              const domStats = getInlineLineStats(domNormalized, { canonical: false });
              const prevLineCount = prevStats.lineCount;
              const nextLineCount = nextStats.lineCount;
              const prevTrailingNewlines = prevStats.trailingNewlines;
              const nextTrailingNewlines = nextStats.trailingNewlines;
              const domLineCount = domStats.lineCount;
              const domTrailingNewlines = domStats.trailingNewlines;
              const normalizationChanged = domNormalized !== nextValue;

              onChange(nextValue);

              if (
                prevLineCount !== nextLineCount ||
                prevTrailingNewlines !== nextTrailingNewlines ||
                normalizationChanged
              ) {
                emitDebug("input: linebreak", {
                  source: "unified-contentEditable",
                  prevLength: prevValue.length,
                  nextLength: nextValue.length,
                  prevLineCount,
                  nextLineCount,
                  prevTrailingNewlines,
                  nextTrailingNewlines,
                  domLength: domNormalized.length,
                  domLineCount,
                  domTrailingNewlines,
                  normalizationChanged,
                });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.isComposing) {
                e.stopPropagation();
              }
            }}
            onBlur={() => {
              triggerFinish("blur");
            }}
          />
        </div>
        </div>
      </div>
    </>,
    overlayPortalTarget
  );
}
