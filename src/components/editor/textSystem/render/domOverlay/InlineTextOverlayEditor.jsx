import { useMemo, useEffect, useRef, useLayoutEffect, useCallback, useState } from "react";
import {
  getInlineKonvaProjectedRectViewport,
  resolveInlineKonvaTextNode,
} from "@/components/editor/overlays/inlineGeometry";
import {
  normalizeInlineEditableText,
} from "@/components/editor/overlays/inlineTextModel";
import {
  resolveVerticalAuthoritySnapshot,
  normalizeInlineOverlayEngine,
} from "@/components/editor/overlays/inlineAlignmentModelV2";
import {
  isInlineBoxDebugEnabled,
  isInlineDebugEnabled,
} from "@/components/editor/overlays/inlineEditor/inlineEditorDebugPrimitives";
import {
  normalizeFinishMode,
  normalizeWidthMode,
} from "@/components/editor/overlays/inlineEditor/inlineEditorModes";
import {
  roundMetric,
  snapToDevicePixelGrid,
} from "@/components/editor/overlays/inlineEditor/inlineEditorNumeric";
import {
  getCollapsedCaretProbeRectInEditor,
  getFirstGlyphRectInEditor,
  getFullRangeRect,
  getSelectionRectInEditor,
  getTextInkRectInEditor,
} from "@/components/editor/overlays/inlineEditor/inlineEditorSelectionRects";
import {
  buildCanvasFontValue,
  buildInlineProbeText,
  estimateDomCssInkProbe,
  measureCanvasInkMetrics,
  measureDomInkProbe,
  measureDomTextVisualWidth,
  measureKonvaInkProbe,
  normalizeInlineFontProps,
  resolveInlineDomPerceptualScale,
  resolveCanvasTextVisualWidth,
} from "@/components/editor/overlays/inlineEditor/inlineEditorTextMetrics";
import {
  INLINE_LAYOUT_VERSION,
  INLINE_VISUAL_NUDGE_CACHE,
} from "@/components/editor/overlays/inlineEditor/inlineEditorConstants";
import {
  selectAllEditableContent,
} from "@/components/editor/textSystem/services/textCaretPositionService";
import useInlineViewportSyncRevision from "@/components/editor/overlays/inlineEditor/useInlineViewportSyncRevision";
import useInlinePhaseAtomicLifecycle from "@/components/editor/overlays/inlineEditor/useInlinePhaseAtomicLifecycle";
import useInlineDebugEmitter from "@/components/editor/overlays/inlineEditor/useInlineDebugEmitter";
import useInlineEditorMountLifecycle from "@/components/editor/overlays/inlineEditor/useInlineEditorMountLifecycle";
import InlineEditorPortalView from "@/components/editor/overlays/inlineEditor/InlineEditorPortalView";
import useInlineInputHandlers from "@/components/editor/textSystem/render/domOverlay/useInlineInputHandlers";
import {
  buildInlineFocusOperationalSnapshot,
  emitInlineFocusRcaEvent,
} from "@/components/editor/textSystem/debug/inlineFocusOperationalDebug";

function parseInlineDiagFlag(value, fallback = false) {
  if (typeof value === "undefined") return fallback;
  if (value === true || value === 1 || value === "1") return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (value === false || value === 0 || value === "0") return false;
  return fallback;
}

function formatInlineDiagPayload(payload = {}) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    return String(error || payload);
  }
}

function shouldEmitInlineNudgeDiag(debugMode) {
  if (!debugMode || typeof window === "undefined") return false;
  const compact = parseInlineDiagFlag(window.__INLINE_DIAG_COMPACT, true);
  const extended = parseInlineDiagFlag(window.__INLINE_DIAG_ALIGNMENT_EXTENDED, false);
  if (compact && !extended) return false;
  return parseInlineDiagFlag(window.__INLINE_DIAG_ALIGNMENT, true);
}

function emitInlineNudgeDiag(debugMode, eventName, payload = {}) {
  if (!shouldEmitInlineNudgeDiag(debugMode)) return;
  try {
    console.log(`[INLINE][DIAG] ${eventName}\n${formatInlineDiagPayload(payload)}`);
  } catch {
    // no-op
  }
}

function buildInlineLayoutTextValue(rawText) {
  return normalizeInlineEditableText(String(rawText ?? ""), {
    trimPhantomTrailingNewline: false,
  });
}

function hasOnlyPhantomTrailingNewlineDelta(previousValue, nextValue) {
  return (
    typeof previousValue === "string" &&
    typeof nextValue === "string" &&
    previousValue.length === nextValue.length + 1 &&
    previousValue.endsWith("\n") &&
    previousValue.slice(0, -1) === nextValue
  );
}

function isFiniteRectPayload(rect) {
  if (!rect) return false;
  const x = Number(rect.x);
  const y = Number(rect.y);
  const width = Number(rect.width);
  const height = Number(rect.height);
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(width) &&
    Number.isFinite(height)
  );
}

function isZeroRectPayload(rect) {
  if (!isFiniteRectPayload(rect)) return true;
  const x = Number(rect.x);
  const y = Number(rect.y);
  const width = Number(rect.width);
  const height = Number(rect.height);
  return (
    Math.abs(x) < 0.0001 &&
    Math.abs(y) < 0.0001 &&
    Math.abs(width) < 0.0001 &&
    Math.abs(height) < 0.0001
  );
}

function isUsableClientRect(rect) {
  return isFiniteRectPayload(rect) && !isZeroRectPayload(rect);
}

function createEmptyVerticalAuthoritySession() {
  return {
    editingId: null,
    sessionId: null,
    revision: 0,
    frozen: false,
    source: null,
    coordinateSpace: "content-ink",
    modelOffsetPx: 0,
    visualOffsetPx: 0,
    frozenAtPhase: null,
    blockedReason: null,
    status: "unresolved",
    diagnostics: null,
  };
}

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
  onOverlaySwapRequest = null,
  onDebugEvent = null,
  overlayEngine = "phase_atomic_v2",
  swapAckToken = null,
  inlineOverlayMountSession = null,
  maintainCenterWhileEditing = false,
}) {
  if (!node) return null;

  const editorRef = useRef(null);
  const contentBoxRef = useRef(null);
  const editableHostRef = useRef(null);
  const editorFrameRef = useRef(null);
  const overlayRootRef = useRef(null);
  const nudgeCalibrationRef = useRef({
    key: null,
  });
  const normalizedOverlayEngine = normalizeInlineOverlayEngine(overlayEngine);
  const isPhaseAtomicV2 = normalizedOverlayEngine === "phase_atomic_v2";
  const [domVisualNudgePx, setDomVisualNudgePx] = useState(0);
  const [layoutProbeRevision, setLayoutProbeRevision] = useState(0);
  const [editorVisualReady, setEditorVisualReady] = useState(false);
  const [renderAuthorityPhase, setRenderAuthorityPhase] = useState(
    isPhaseAtomicV2 ? "konva" : "dom-editable"
  );
  const [caretVisible, setCaretVisible] = useState(!isPhaseAtomicV2);
  const horizontalCenterLockRef = useRef({
    editingId: null,
    centerStageX: null,
  });
  const DEBUG_MODE = isInlineDebugEnabled();
  const BOX_DEBUG_MODE = isInlineBoxDebugEnabled();
  const [fontMetricsRevision, setFontMetricsRevision] = useState(0);
  const overlaySessionIdRef = useRef(null);
  const swapAckSeenRef = useRef(0);
  const [overlayPhase, setOverlayPhase] = useState(
    isPhaseAtomicV2 ? "prepare_mount" : "active"
  );
  const [v2FontsReady, setV2FontsReady] = useState(!isPhaseAtomicV2);
  const [v2OffsetComputed, setV2OffsetComputed] = useState(!isPhaseAtomicV2);
  const [v2OffsetOneShotPx, setV2OffsetOneShotPx] = useState(0);
  const [v2AuthorityGateTimedOut, setV2AuthorityGateTimedOut] = useState(false);
  const [v2EffectiveFontFamily, setV2EffectiveFontFamily] = useState(null);
  const [v2LiveFirstGlyphTopInsetPx, setV2LiveFirstGlyphTopInsetPx] = useState(null);
  const [v2LiveTextInkTopInsetPx, setV2LiveTextInkTopInsetPx] = useState(null);
  const [v2LiveTextInkLeftInsetPx, setV2LiveTextInkLeftInsetPx] = useState(null);
  const [v2LiveFirstGlyphSamples, setV2LiveFirstGlyphSamples] = useState([]);
  const [v2LiveFirstGlyphGeometryUsable, setV2LiveFirstGlyphGeometryUsable] = useState(false);
  const [v2VerticalAuthoritySnapshot, setV2VerticalAuthoritySnapshot] = useState(null);
  const verticalAuthoritySessionRef = useRef(createEmptyVerticalAuthoritySession());
  const [v2SwapRequested, setV2SwapRequested] = useState(false);
  const v2InitEditingIdRef = useRef(null);
  const pendingDoneDispatchRef = useRef({
    timerId: 0,
    id: null,
    sessionId: null,
  });
  const entryFocusStateRef = useRef({
    editingId: null,
    sessionId: null,
    settled: false,
  });
  const layoutTextSessionRef = useRef(null);
  const inlinePristineValueRef = useRef({
    editingId: null,
    initialNormalizedValue: null,
    dirty: false,
  });
  const nudgeDiagPrevRef = useRef({
    projectedY: null,
    konvaTopInset: null,
    liveTopInset: null,
    residual: null,
  });
  const emitDebugRef = useRef(null);

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

  const {
    viewportSyncRevision,
  } = useInlineViewportSyncRevision({
    isPhaseAtomicV2,
  });

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
        fontStyleRaw: rawFontStyle,
        fontWeightRaw: rawFontWeight,
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
        fontStyleRaw: "normal",
        fontWeightRaw: "normal",
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
  const domPerceptualScaleModel = useMemo(
    () =>
      resolveInlineDomPerceptualScale({
        totalScaleY,
        fontFamily: nodeProps.fontFamily,
        fontStyle: nodeProps.fontStyle,
        fontWeight: nodeProps.fontWeight,
        fontSizePx,
        lineHeightPx,
        letterSpacingPx,
        probeText: "HgAy",
      }),
    [
      fontMetricsRevision,
      fontSizePx,
      konvaLineHeight,
      letterSpacingPx,
      lineHeightPx,
      nodeProps.fontFamily,
      nodeProps.fontStyle,
      nodeProps.fontWeight,
      totalScaleY,
    ]
  );
  const domPerceptualScale = Number(domPerceptualScaleModel?.scale || 1);
  const domRenderFontSizePx = Math.max(1, Number(fontSizePx) * domPerceptualScale);
  const rawValue = String(value ?? "");
  const normalizedValue = normalizeInlineEditableText(rawValue, {
    trimPhantomTrailingNewline: true,
  });
  const [layoutTextValue, setLayoutTextValue] = useState(() =>
    buildInlineLayoutTextValue(rawValue)
  );
  useEffect(() => {
    if (layoutTextSessionRef.current === (editingId || null)) return;
    layoutTextSessionRef.current = editingId || null;
    setLayoutTextValue(buildInlineLayoutTextValue(rawValue));
  }, [editingId, rawValue]);
  useEffect(() => {
    const nextLayoutTextValue = buildInlineLayoutTextValue(rawValue);
    setLayoutTextValue((prev) => {
      if (prev === nextLayoutTextValue) return prev;
      const prevCanonicalValue = normalizeInlineEditableText(prev, {
        trimPhantomTrailingNewline: true,
      });
      if (prevCanonicalValue !== normalizedValue) return nextLayoutTextValue;
      return hasOnlyPhantomTrailingNewlineDelta(prev, nextLayoutTextValue)
        ? nextLayoutTextValue
        : prev;
    });
  }, [editingId, normalizedValue, rawValue]);
  const handleDomLayoutValueChange = useCallback((nextDomValue) => {
    const nextLayoutTextValue = buildInlineLayoutTextValue(nextDomValue);
    setLayoutTextValue((prev) => (
      prev === nextLayoutTextValue ? prev : nextLayoutTextValue
    ));
  }, []);
  if (inlinePristineValueRef.current.editingId !== (editingId || null)) {
    inlinePristineValueRef.current = {
      editingId: editingId || null,
      initialNormalizedValue: normalizedValue,
      dirty: false,
    };
  } else if (
    !inlinePristineValueRef.current.dirty &&
    inlinePristineValueRef.current.initialNormalizedValue !== normalizedValue
  ) {
    inlinePristineValueRef.current.dirty = true;
  }
  const isPristineInlineValue = Boolean(
    inlinePristineValueRef.current.editingId === (editingId || null) &&
    inlinePristineValueRef.current.dirty === false
  );
  const layoutTextValueForMeasure = layoutTextValue.replace(/[ \t]+$/gm, "");
  const normalizedValueForMeasure = layoutTextValueForMeasure;
  const normalizedValueForSingleLine = layoutTextValueForMeasure.replace(/\n+$/g, "");
  const isSingleLine = !layoutTextValueForMeasure.includes("\n");
  const probeTextForAlignment = useMemo(
    () =>
      buildInlineProbeText({
        isSingleLine,
        normalizedValueForSingleLine,
        normalizedValue,
      }),
    [isSingleLine, normalizedValue, normalizedValueForSingleLine]
  );
  // Keep a stable vertical probe so ascent/descent metrics do not drift
  // with the edited content (which can produce large offset jumps).
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
      fontSizePx: domRenderFontSizePx,
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
    domRenderFontSizePx,
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
  const domInkProbeModel = useMemo(
    () =>
      measureDomInkProbe({
        fontStyle: nodeProps.fontStyle,
        fontWeight: nodeProps.fontWeight,
        fontSizePx: domRenderFontSizePx,
        fontFamily: nodeProps.fontFamily,
        lineHeightPx: editableLineHeightPx,
        letterSpacingPx,
        probeText: metricsProbeText,
        canvasInkMetrics: canvasInkMetricsModel,
      }),
    [
      fontMetricsRevision,
      canvasInkMetricsModel,
      editableLineHeightPx,
      domRenderFontSizePx,
      letterSpacingPx,
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
  const v2AuthorityCandidate = useMemo(
    () => {
      if (!isPhaseAtomicV2) return null;
      const previousSnapshot =
        verticalAuthoritySessionRef.current?.frozen &&
        verticalAuthoritySessionRef.current?.editingId === editingId
          ? verticalAuthoritySessionRef.current
          : v2VerticalAuthoritySnapshot;
      return resolveVerticalAuthoritySnapshot({
        domCssInkProbe: domCssInkProbeModel,
        domInkProbe: domInkProbeModel,
        domLiveFirstGlyphTopInsetPx: v2LiveFirstGlyphTopInsetPx,
        // Keep vertical authority anchored to live first-glyph geometry.
        // textInkRect is useful for diagnostics/horizontal context but is not
        // a comparable vertical model against probe-based konva insets.
        domLiveInkTopInsetPx: v2LiveFirstGlyphTopInsetPx,
        domLiveInkLeftInsetPx: isSingleLine ? v2LiveTextInkLeftInsetPx : null,
        domProbeInkLeftInsetPx: isSingleLine
          ? (
            Number.isFinite(Number(domInkProbeModel?.glyphInkLeftInsetPx))
              ? Number(domInkProbeModel.glyphInkLeftInsetPx)
              : Number(domInkProbeModel?.glyphLeftInsetPx)
          )
          : null,
        konvaInkLeftInsetPx: isSingleLine
          ? (
            Number.isFinite(Number(konvaInkProbeModel?.glyphLeftInsetPx))
              ? Number(konvaInkProbeModel.glyphLeftInsetPx)
              : null
          )
          : null,
        domLiveFirstGlyphSamples: v2LiveFirstGlyphSamples,
        domLiveGeometryUsable: v2LiveFirstGlyphGeometryUsable,
        konvaInkProbe: konvaInkProbeModel,
        editableLineHeightPx,
        fontFamily: v2EffectiveFontFamily || nodeProps.fontFamily,
        fontLoadAvailable: fontLoadStatus?.available,
        fallbackOffset: 0,
        previousSnapshot,
      });
    },
    [
      isPhaseAtomicV2,
      editingId,
      domCssInkProbeModel,
      domInkProbeModel,
      isSingleLine,
      v2LiveFirstGlyphTopInsetPx,
      v2LiveTextInkLeftInsetPx,
      v2LiveFirstGlyphSamples,
      v2LiveFirstGlyphGeometryUsable,
      konvaInkProbeModel,
      editableLineHeightPx,
      v2EffectiveFontFamily,
      nodeProps.fontFamily,
      fontLoadStatus?.available,
      v2VerticalAuthoritySnapshot,
    ]
  );
  const activeV2AuthoritySnapshot = useMemo(() => {
    if (!isPhaseAtomicV2) return null;
    const frozenSession = verticalAuthoritySessionRef.current;
    if (
      frozenSession?.frozen &&
      frozenSession?.editingId === editingId
    ) {
      return frozenSession;
    }
    return v2VerticalAuthoritySnapshot || v2AuthorityCandidate;
  }, [
    isPhaseAtomicV2,
    editingId,
    v2VerticalAuthoritySnapshot,
    v2AuthorityCandidate,
  ]);
  const domToKonvaOffsetModel = useMemo(() => {
    if (isPhaseAtomicV2) {
      const snapshot = activeV2AuthoritySnapshot;
      const diagnostics = snapshot?.diagnostics || {};
      return {
        source: snapshot?.source || "domProbe",
        domTopInset: diagnostics.domTopInset ?? null,
        domProbeTopInset: diagnostics.domProbeTopInset ?? null,
        domLiveTopInset: diagnostics.domLiveTopInset ?? null,
        activeDomTopInset: diagnostics.activeDomTopInset ?? null,
        domLeftInset: diagnostics.domLeftInset ?? null,
        domProbeLeftInset: diagnostics.domProbeLeftInset ?? null,
        domLiveLeftInset: diagnostics.domLiveLeftInset ?? null,
        activeDomLeftInset: diagnostics.activeDomLeftInset ?? null,
        konvaTopInset: diagnostics.konvaTopInset ?? null,
        konvaLeftInset: diagnostics.konvaLeftInset ?? null,
        rawOffset: diagnostics.rawOffset ?? null,
        rawOffsetX: diagnostics.rawOffsetX ?? null,
        saneLimit: diagnostics.saneLimit ?? null,
        snappedOffset: diagnostics.snappedOffset ?? null,
        snappedOffsetX: diagnostics.snappedOffsetX ?? null,
        pixelSnapStep: diagnostics.pixelSnapStep ?? null,
        pixelSnapUsed: Boolean(diagnostics.pixelSnapUsed),
        appliedOffset: snapshot?.visualOffsetPx ?? 0,
        modelOffsetXPx: snapshot?.modelOffsetXPx ?? 0,
        visualOffsetXPx: snapshot?.visualOffsetXPx ?? 0,
        blockedReason: snapshot?.blockedReason ?? null,
        horizontalBlockedReason: diagnostics.horizontalBlockedReason ?? null,
        domSourceDeltaPx: diagnostics.domSourceDeltaPx ?? null,
        domCssProbeResidualPx: diagnostics.domCssProbeResidualPx ?? null,
        domSourceDivergenceLimitPx: diagnostics.domSourceDivergenceLimitPx ?? null,
        liveSourceDeltaPx: diagnostics.liveSourceDeltaPx ?? null,
        liveSourceDivergenceLimitPx: diagnostics.liveSourceDivergenceLimitPx ?? null,
        liveStabilityEpsilonPx: diagnostics.liveStabilityEpsilonPx ?? null,
        liveSampleCount: diagnostics.liveSampleCount ?? 0,
        liveSampleDeltaPx: diagnostics.liveSampleDeltaPx ?? null,
        liveSampleStable: Boolean(diagnostics.liveSampleStable),
        liveGeometryReady: Boolean(diagnostics.liveGeometryReady),
        fontFamilyRaw: diagnostics.fontFamilyRaw ?? null,
        fontFamilyNormalizedForNudge: diagnostics.fontFamilyNormalizedForNudge ?? null,
        domCssReliable: Boolean(diagnostics.domCssReliable),
        severeDomSourceDisagreement: Boolean(diagnostics.severeDomSourceDisagreement),
        preferDomCssOnDisagreement: Boolean(diagnostics.preferDomCssOnDisagreement),
        domCssRawOffsetPx: diagnostics.domCssRawOffsetPx ?? null,
        domCssInConflict: Boolean(diagnostics.domCssInConflict),
        preferLiveForLargeCssOffset: Boolean(diagnostics.preferLiveForLargeCssOffset),
        largeStableOffsetLimitPx: diagnostics.largeStableOffsetLimitPx ?? null,
        largeStableOffsetBaseLimitPx: diagnostics.largeStableOffsetBaseLimitPx ?? null,
        largeStableOffsetFontUnavailableCapPx:
          diagnostics.largeStableOffsetFontUnavailableCapPx ?? null,
        largeStableOffsetStrictCapPx: diagnostics.largeStableOffsetStrictCapPx ?? null,
        largeStableOffsetStrictCapApplied: Boolean(
          diagnostics.largeStableOffsetStrictCapApplied
        ),
        largeStableOffsetFontSpecificCapPx:
          diagnostics.largeStableOffsetFontSpecificCapPx ?? null,
        largeStableOffsetFontSpecificCapApplied: Boolean(
          diagnostics.largeStableOffsetFontSpecificCapApplied
        ),
        largeStableOffsetFontSpecificZeroDriftApplied: Boolean(
          diagnostics.largeStableOffsetFontSpecificZeroDriftApplied
        ),
        largeStableOffsetFontSpecificPerceptualNudgePx:
          diagnostics.largeStableOffsetFontSpecificPerceptualNudgePx ?? null,
        largeStableOffsetFontSpecificPerceptualNudgeSource:
          diagnostics.largeStableOffsetFontSpecificPerceptualNudgeSource ?? null,
        largeStableOffsetFontSpecificPerceptualNudgeMode:
          diagnostics.largeStableOffsetFontSpecificPerceptualNudgeMode ?? null,
        largeStableOffsetFontSpecificPerceptualNudgeApplied: Boolean(
          diagnostics.largeStableOffsetFontSpecificPerceptualNudgeApplied
        ),
        largeStableOffsetFontSpecificPerceptualNudgeAppliedAs:
          diagnostics.largeStableOffsetFontSpecificPerceptualNudgeAppliedAs ?? null,
        fontLoadAvailable:
          typeof diagnostics.fontLoadAvailable === "boolean"
            ? diagnostics.fontLoadAvailable
            : null,
        largeStableOffsetDampened: Boolean(diagnostics.largeStableOffsetDampened),
        largeStableOffsetDampenedFromPx: diagnostics.largeStableOffsetDampenedFromPx ?? null,
        largeStableOffsetDampenedToPx: diagnostics.largeStableOffsetDampenedToPx ?? null,
        largeStableOffsetFinalAppliedPx: diagnostics.largeStableOffsetFinalAppliedPx ?? null,
        severeLiveDisagreementGuardApplied: Boolean(
          diagnostics.severeLiveDisagreementGuardApplied
        ),
        severeLiveDisagreementGuardFromPx:
          diagnostics.severeLiveDisagreementGuardFromPx ?? null,
        severeLiveDisagreementGuardToPx:
          diagnostics.severeLiveDisagreementGuardToPx ?? null,
        externalOffsetRoutedToInternalApplied: Boolean(
          diagnostics.externalOffsetRoutedToInternalApplied
        ),
        externalOffsetRoutedToInternalFromPx:
          diagnostics.externalOffsetRoutedToInternalFromPx ?? null,
        externalOffsetRoutedToInternalToPx:
          diagnostics.externalOffsetRoutedToInternalToPx ?? null,
        internalRouteProbeCalibrationMinPx:
          diagnostics.internalRouteProbeCalibrationMinPx ?? null,
        internalRouteProbeCalibrationMaxPx:
          diagnostics.internalRouteProbeCalibrationMaxPx ?? null,
        internalRouteProbeCalibrationApplied: Boolean(
          diagnostics.internalRouteProbeCalibrationApplied
        ),
        internalRouteProbeCalibrationPx:
          diagnostics.internalRouteProbeCalibrationPx ?? null,
        internalContentOffsetBasePx:
          diagnostics.internalContentOffsetBasePx ?? null,
        largeStableOffsetFinalAppliedWithPerceptualNudgePx:
          diagnostics.largeStableOffsetFinalAppliedWithPerceptualNudgePx ?? null,
        largeStableOffsetPolicyVersion: diagnostics.largeStableOffsetPolicyVersion ?? null,
        liveFallbackReliable: Boolean(diagnostics.liveFallbackReliable),
        status: snapshot?.status || "resolved",
        revision: Number(snapshot?.revision || 1),
        coordinateSpace: snapshot?.coordinateSpace || "content-ink",
        modelOffsetPx: snapshot?.modelOffsetPx ?? 0,
        visualOffsetPx: snapshot?.visualOffsetPx ?? 0,
        internalContentOffsetPx:
          snapshot?.internalContentOffsetPx ?? diagnostics.internalContentOffsetPx ?? 0,
        frozen: Boolean(snapshot?.frozen),
        frozenAtPhase: snapshot?.frozenAtPhase || null,
      };
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
    activeV2AuthoritySnapshot,
    domCssInkProbeModel,
    domInkProbeModel,
    editableLineHeightPx,
    konvaInkProbeModel,
  ]);
  const domToKonvaGlyphOffsetPx = Number(domToKonvaOffsetModel?.appliedOffset || 0);
  const domToKonvaGlyphOffsetXPx = Number(domToKonvaOffsetModel?.visualOffsetXPx || 0);
  const domToKonvaInternalContentOffsetPx = Number(
    domToKonvaOffsetModel?.internalContentOffsetPx ??
    domToKonvaOffsetModel?.diagnostics?.internalContentOffsetPx ??
    0
  );
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
  const resolvedV2VisualOffsetPxRaw = Number(
    activeV2AuthoritySnapshot?.visualOffsetPx ?? v2OffsetOneShotPx ?? 0
  );
  const resolvedV2VisualOffsetPx = Number.isFinite(resolvedV2VisualOffsetPxRaw)
    ? resolvedV2VisualOffsetPxRaw
    : 0;
  const runtimeRenderAuthorityPhase =
    inlineOverlayMountSession?.renderAuthority || (isPhaseAtomicV2 ? "konva" : "dom-editable");
  const runtimeCaretVisible = Boolean(
    isPhaseAtomicV2 ? inlineOverlayMountSession?.caretVisible : true
  );
  const runtimePaintStable = Boolean(
    isPhaseAtomicV2 ? inlineOverlayMountSession?.paintStable : editorVisualReady
  );
  const baseVisualOffsetPx = isPhaseAtomicV2
    ? (v2OffsetComputed ? resolvedV2VisualOffsetPx : 0)
    : Number(domToKonvaVisualOffsetPx || 0);
  const authorityInternalContentOffsetPx = Number.isFinite(domToKonvaInternalContentOffsetPx)
    ? domToKonvaInternalContentOffsetPx
    : 0;
  const externalOffsetRouteThresholdPx = Math.max(
    2.2,
    Number(domToKonvaOffsetModel?.largeStableOffsetLimitPx || 0)
  );
  const shouldRouteLargeExternalOffsetToInternal = (
    isPhaseAtomicV2 &&
    v2OffsetComputed &&
    Number.isFinite(baseVisualOffsetPx) &&
    Math.abs(baseVisualOffsetPx) >= externalOffsetRouteThresholdPx &&
    String(domToKonvaOffsetModel?.source || "") !== "conflictNeutral"
  );
  const effectiveVisualOffsetPx = shouldRouteLargeExternalOffsetToInternal
    ? 0
    : Number(baseVisualOffsetPx || 0);
  const routedInternalContentOffsetPx = shouldRouteLargeExternalOffsetToInternal
    ? Number(baseVisualOffsetPx || 0)
    : 0;
  const effectiveInternalContentOffsetPx =
    Number(authorityInternalContentOffsetPx || 0) +
    Number(routedInternalContentOffsetPx || 0);
  const isDomVisualAuthorityPhase =
    runtimeRenderAuthorityPhase === "dom-preview" ||
    runtimeRenderAuthorityPhase === "dom-editable";
  const isEditorVisible = Boolean(editorVisualReady) && (
    !isPhaseAtomicV2 || isDomVisualAuthorityPhase
  );
  const isEditorInteractive = !isPhaseAtomicV2 || (
    renderAuthorityPhase === "dom-editable" &&
    runtimeRenderAuthorityPhase === "dom-editable" &&
    caretVisible &&
    runtimeCaretVisible
  );
  const baseEditorPaddingTopPx = Math.max(0, Number(verticalInsetPx || 0));
  const baseEditorPaddingBottomPx = Math.max(0, Number(verticalInsetPx || 0));
  const editorPaddingTopPx = baseEditorPaddingTopPx;
  const editorPaddingBottomPx = baseEditorPaddingBottomPx;

  useEffect(() => {
    nudgeCalibrationRef.current = {
      key: null,
    };
    if (isPhaseAtomicV2) {
      if (v2InitEditingIdRef.current === editingId) {
        return;
      }
      v2InitEditingIdRef.current = editingId;
      verticalAuthoritySessionRef.current = createEmptyVerticalAuthoritySession();
      setDomVisualNudgePx(0);
      setEditorVisualReady(false);
      setRenderAuthorityPhase("konva");
      setCaretVisible(false);
      setOverlayPhase("prepare_mount");
      setV2FontsReady(false);
      setV2OffsetComputed(false);
      setV2OffsetOneShotPx(0);
      setV2AuthorityGateTimedOut(false);
      setV2EffectiveFontFamily(null);
      setV2LiveFirstGlyphTopInsetPx(null);
      setV2LiveTextInkTopInsetPx(null);
      setV2LiveTextInkLeftInsetPx(null);
      setV2LiveFirstGlyphSamples([]);
      setV2LiveFirstGlyphGeometryUsable(false);
      setV2VerticalAuthoritySnapshot(null);
      setV2SwapRequested(false);
      return;
    }
    v2InitEditingIdRef.current = null;
    verticalAuthoritySessionRef.current = createEmptyVerticalAuthoritySession();
    setV2VerticalAuthoritySnapshot(null);
    setV2AuthorityGateTimedOut(false);
    setV2EffectiveFontFamily(null);
    setV2LiveTextInkTopInsetPx(null);
    setV2LiveTextInkLeftInsetPx(null);
    setV2LiveFirstGlyphSamples([]);
    setV2LiveFirstGlyphGeometryUsable(false);
    const cached = INLINE_VISUAL_NUDGE_CACHE.get(nudgeCacheKey);
    const cachedNum = Number(cached);
    const maxCachedAbs = 14;
    const safeCached =
      Number.isFinite(cachedNum)
        ? Math.max(-maxCachedAbs, Math.min(maxCachedAbs, cachedNum))
        : 0;
    emitInlineNudgeDiag(DEBUG_MODE, "nudge-cache-read", {
      event: "nudge-cache-read",
      id: editingId || null,
      sessionId: overlaySessionIdRef.current || null,
      phase: "phase_atomic_v2",
      cacheApplied: false,
      nudgeCacheKey: nudgeCacheKey || null,
      cachedRaw: typeof cached === "undefined" ? null : cached,
      cachedNum: Number.isFinite(cachedNum) ? roundMetric(cachedNum) : null,
      safeCached: roundMetric(Number(safeCached)),
      maxCachedAbs,
      isPhaseAtomicV2: Boolean(isPhaseAtomicV2),
      domVisualNudgeBeforeSet: roundMetric(Number(domVisualNudgePx || 0)),
      fontFingerprint: {
        fontFamily: nodeProps.fontFamily || null,
        fontWeight: nodeProps.fontWeight || null,
        fontStyle: nodeProps.fontStyle || null,
        fontSizePx: roundMetric(Number(fontSizePx)),
        editableLineHeightPx: roundMetric(Number(editableLineHeightPx)),
        isSingleLine: Boolean(isSingleLine),
      },
    });
    setDomVisualNudgePx(0);
    setEditorVisualReady(false);
    setRenderAuthorityPhase("dom-editable");
    setCaretVisible(true);
  }, [editingId, isPhaseAtomicV2, nudgeCacheKey]);
  useLayoutEffect(() => {
    if (!isPhaseAtomicV2) return undefined;
    if (!editingId) return undefined;
    if (!v2FontsReady || v2OffsetComputed) return undefined;
    if (verticalAuthoritySessionRef.current?.frozen) return undefined;

    const contentEl = contentBoxRef.current;
    const visualEl = editorRef.current;
    if (!contentEl || !visualEl) return undefined;

    let cancelled = false;
    let rafId = 0;
    const probeLiveGlyph = () => {
      if (cancelled) return;
      const contentRect = contentEl.getBoundingClientRect();
      const firstGlyphRect = getFirstGlyphRectInEditor(visualEl);
      const textInkRect = getTextInkRectInEditor(visualEl);
      const preferredVerticalRect = isUsableClientRect(firstGlyphRect) ? firstGlyphRect : null;
      const preferredHorizontalRect = isUsableClientRect(textInkRect)
        ? textInkRect
        : preferredVerticalRect;
      const geometryUsable =
        isUsableClientRect(contentRect) && isUsableClientRect(preferredVerticalRect);
      setV2LiveFirstGlyphGeometryUsable((prev) => (
        prev === geometryUsable ? prev : geometryUsable
      ));
      if (geometryUsable) {
        const computedFontFamily = (() => {
          try {
            return String(window.getComputedStyle(visualEl)?.fontFamily || "").trim() || null;
          } catch {
            return null;
          }
        })();
        if (computedFontFamily) {
          setV2EffectiveFontFamily((prev) => (
            prev === computedFontFamily ? prev : computedFontFamily
          ));
        }
        const liveTopInset = Number(preferredVerticalRect.y) - Number(contentRect.y);
        const liveLeftInset = preferredHorizontalRect
          ? Number(preferredHorizontalRect.x) - Number(contentRect.x)
          : null;
        const liveTextInkTopInset = isUsableClientRect(textInkRect)
          ? Number(textInkRect.y) - Number(contentRect.y)
          : null;
        if (Number.isFinite(liveTopInset)) {
          const roundedTopInset = Number(roundMetric(liveTopInset));
          setV2LiveFirstGlyphTopInsetPx((prev) => {
            const prevNum = Number(prev);
            if (Number.isFinite(prevNum) && Math.abs(prevNum - roundedTopInset) <= 0.0001) {
              return prev;
            }
            return roundedTopInset;
          });
          setV2LiveFirstGlyphSamples((prev) => {
            const normalized = Array.isArray(prev) ? prev : [];
            const last = normalized.length > 0 ? Number(normalized[normalized.length - 1]) : null;
            if (
              Number.isFinite(last) &&
              Math.abs(last - roundedTopInset) <= 0.0001 &&
              normalized.length >= 2
            ) {
              return normalized;
            }
            if (normalized.length === 0) return [roundedTopInset];
            if (normalized.length === 1) return [normalized[0], roundedTopInset];
            return [normalized[1], roundedTopInset];
          });
        }
        if (Number.isFinite(liveTextInkTopInset)) {
          const roundedTextInkTopInset = Number(roundMetric(liveTextInkTopInset));
          setV2LiveTextInkTopInsetPx((prev) => {
            const prevNum = Number(prev);
            if (Number.isFinite(prevNum) && Math.abs(prevNum - roundedTextInkTopInset) <= 0.0001) {
              return prev;
            }
            return roundedTextInkTopInset;
          });
        } else {
          setV2LiveTextInkTopInsetPx((prev) => (prev === null ? prev : null));
        }
        if (Number.isFinite(liveLeftInset)) {
          const roundedLeftInset = Number(roundMetric(liveLeftInset));
          setV2LiveTextInkLeftInsetPx((prev) => {
            const prevNum = Number(prev);
            if (Number.isFinite(prevNum) && Math.abs(prevNum - roundedLeftInset) <= 0.0001) {
              return prev;
            }
            return roundedLeftInset;
          });
        }
      }
      rafId = window.requestAnimationFrame(probeLiveGlyph);
    };

    rafId = window.requestAnimationFrame(probeLiveGlyph);
    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [
    editingId,
    isPhaseAtomicV2,
    v2FontsReady,
    v2OffsetComputed,
    fontMetricsRevision,
    viewportSyncRevision,
    overlayPhase,
    setV2LiveFirstGlyphGeometryUsable,
    setV2LiveFirstGlyphSamples,
    setV2LiveFirstGlyphTopInsetPx,
    setV2LiveTextInkTopInsetPx,
    setV2LiveTextInkLeftInsetPx,
    setV2EffectiveFontFamily,
  ]);
  useEffect(() => {
    if (!isPhaseAtomicV2) return undefined;
    if (!editingId) return undefined;
    if (!v2FontsReady || v2OffsetComputed) return undefined;
    const sampleCount = Array.isArray(v2LiveFirstGlyphSamples)
      ? v2LiveFirstGlyphSamples.length
      : 0;
    if (sampleCount >= 2) {
      if (v2AuthorityGateTimedOut) {
        setV2AuthorityGateTimedOut(false);
      }
      return undefined;
    }
    if (v2AuthorityGateTimedOut) {
      setV2AuthorityGateTimedOut(false);
    }
    const delayMs = sampleCount === 0 ? 120 : 24;
    const timerId = window.setTimeout(() => {
      setV2AuthorityGateTimedOut(true);
    }, delayMs);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    editingId,
    isPhaseAtomicV2,
    v2FontsReady,
    v2OffsetComputed,
    v2AuthorityGateTimedOut,
    v2LiveFirstGlyphSamples,
    setV2AuthorityGateTimedOut,
  ]);
  useLayoutEffect(() => {
    if (!isPhaseAtomicV2) return;
    if (!editingId) return;
    if (!v2FontsReady || v2OffsetComputed) return;
    const liveSampleCount = Array.isArray(v2LiveFirstGlyphSamples)
      ? v2LiveFirstGlyphSamples.length
      : 0;
    const hasStableLiveSample = liveSampleCount >= 2;
    if (!hasStableLiveSample && !v2AuthorityGateTimedOut) return;
    if (!v2AuthorityCandidate || v2AuthorityCandidate.status !== "resolved") return;
    const currentSession = verticalAuthoritySessionRef.current;
    if (currentSession?.frozen && currentSession?.editingId === editingId) return;

    setOverlayPhase("compute_offset");
    const frozenSnapshot = {
      ...v2AuthorityCandidate,
      editingId,
      sessionId: overlaySessionIdRef.current || null,
      frozen: true,
      frozenAtPhase: "compute_offset",
    };
    verticalAuthoritySessionRef.current = frozenSnapshot;
    setV2VerticalAuthoritySnapshot(frozenSnapshot);
    setV2OffsetOneShotPx(Number(frozenSnapshot.visualOffsetPx || 0));
    setV2OffsetComputed(true);
    setOverlayPhase("ready_to_swap");
  }, [
    isPhaseAtomicV2,
    editingId,
    v2FontsReady,
    v2OffsetComputed,
    v2LiveFirstGlyphSamples,
    v2AuthorityGateTimedOut,
    v2AuthorityCandidate,
    setV2VerticalAuthoritySnapshot,
    setV2OffsetOneShotPx,
    setV2OffsetComputed,
    setOverlayPhase,
  ]);
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
    swapAckSeenRef.current = 0;
    if (isPhaseAtomicV2) {
      overlaySessionIdRef.current = null;
      verticalAuthoritySessionRef.current = createEmptyVerticalAuthoritySession();
      setV2VerticalAuthoritySnapshot(null);
      entryFocusStateRef.current = {
        editingId,
        sessionId: null,
        settled: false,
      };
      return;
    }
    const seed = Math.random().toString(36).slice(2, 10);
    const sessionId = `${editingId}-${Date.now()}-${seed}`;
    overlaySessionIdRef.current = sessionId;
    entryFocusStateRef.current = {
      editingId,
      sessionId,
      settled: false,
    };
    emitInlineFocusRcaEvent("inline-session-start", {
      editingId,
      overlayPhase: isPhaseAtomicV2 ? "prepare_mount" : "active",
      editorEl: editorRef.current,
      extra: {
        sessionId,
        engine: normalizedOverlayEngine,
      },
    });
  }, [editingId, isPhaseAtomicV2, normalizedOverlayEngine]);

  const isMountSessionReadyForClaim = useCallback((sessionId) => {
    if (!isPhaseAtomicV2) return true;
    if (!editingId || !sessionId) return false;
    const mountSession = inlineOverlayMountSession || null;
    if (!mountSession?.mounted) return false;
    if (!mountSession?.swapCommitted) return false;
    if (mountSession.id !== editingId) return false;
    if (mountSession.sessionId !== sessionId) return false;
    if (mountSession.renderAuthority !== "dom-editable") return false;
    if (!mountSession.caretVisible) return false;
    if (!mountSession.paintStable) return false;
    const authoritySnapshot = activeV2AuthoritySnapshot || v2VerticalAuthoritySnapshot;
    const expectedRevision = Number(authoritySnapshot?.revision || 0);
    const mountRevision = Number(mountSession?.offsetRevision);
    if (
      Number.isFinite(expectedRevision) &&
      expectedRevision > 0 &&
      Number.isFinite(mountRevision) &&
      mountRevision !== expectedRevision
    ) {
      return false;
    }
    const expectedSource = authoritySnapshot?.source || null;
    const expectedSpace = authoritySnapshot?.coordinateSpace || "content-ink";
    if (expectedSource && mountSession?.offsetSource && mountSession.offsetSource !== expectedSource) {
      return false;
    }
    if (expectedSpace && mountSession?.offsetSpace && mountSession.offsetSpace !== expectedSpace) {
      return false;
    }
    return true;
  }, [activeV2AuthoritySnapshot, editingId, inlineOverlayMountSession, isPhaseAtomicV2, v2VerticalAuthoritySnapshot]);

  const commitOperationalFocusClaim = useCallback(({
    sessionId,
    reason = "unknown",
    editorElOverride = null,
    attempt = null,
    maxAttempts = null,
    path = "unknown",
  } = {}) => {
    if (!isPhaseAtomicV2) return false;
    if (!editingId || !sessionId) return false;
    if (overlaySessionIdRef.current !== sessionId) return false;
    if (!isMountSessionReadyForClaim(sessionId)) return false;
    const targetEl = editorElOverride || editorRef.current;
    if (!targetEl) return false;

    const operationalSnapshot = buildInlineFocusOperationalSnapshot(targetEl);
    if (!operationalSnapshot.focusOperationalCore) return false;

    const previousState = entryFocusStateRef.current || {};
    if (
      previousState.editingId === editingId &&
      previousState.sessionId === sessionId &&
      previousState.settled
    ) {
      return true;
    }

    entryFocusStateRef.current = {
      editingId,
      sessionId,
      settled: true,
    };
    const authoritySnapshot = activeV2AuthoritySnapshot || v2VerticalAuthoritySnapshot;
    const authorityRevision = Number(authoritySnapshot?.revision || 0);
    const authorityOffset = Number(
      authoritySnapshot?.visualOffsetPx ?? resolvedV2VisualOffsetPx ?? 0
    );
    const authoritySource = authoritySnapshot?.source || null;
    const authoritySpace = authoritySnapshot?.coordinateSpace || "content-ink";
    const mountSession = inlineOverlayMountSession || null;
    const swapCommitOffset = Number(mountSession?.offsetY);
    const swapCommitRevision = Number(mountSession?.offsetRevision);
    const swapCommitSource = mountSession?.offsetSource || null;
    const swapCommitSpace = mountSession?.offsetSpace || null;
    const invariantOffsetAtomicPass =
      (!Number.isFinite(swapCommitOffset) || Math.abs(swapCommitOffset - authorityOffset) <= 0.0001) &&
      (!Number.isFinite(swapCommitRevision) ||
        !Number.isFinite(authorityRevision) ||
        authorityRevision <= 0 ||
        swapCommitRevision === authorityRevision) &&
      (!swapCommitSource || !authoritySource || swapCommitSource === authoritySource) &&
      (!swapCommitSpace || !authoritySpace || swapCommitSpace === authoritySpace);
    setOverlayPhase("active");
    const debugEmitter = emitDebugRef.current;
    if (typeof debugEmitter === "function") {
      debugEmitter("overlay: focus-claim-commit", {
        phase: "focus-claim-commit",
        sessionId,
        reason,
        path,
        attempt: Number.isFinite(Number(attempt)) ? Number(attempt) : null,
        maxAttempts: Number.isFinite(Number(maxAttempts)) ? Number(maxAttempts) : null,
        isFocused: Boolean(operationalSnapshot.isActiveElementEditor),
        selectionInEditor: Boolean(operationalSnapshot.hasSelectionInsideEditor),
        hasValidRangeInsideEditor: Boolean(operationalSnapshot.hasValidRangeInsideEditor),
        authorityRevision: Number.isFinite(authorityRevision) && authorityRevision > 0
          ? authorityRevision
          : null,
        authorityFrozen: Boolean(authoritySnapshot?.frozen),
        offsetSource: authoritySource,
        offsetSpace: authoritySpace,
        offsetAtSwapCommit: Number.isFinite(swapCommitOffset) ? roundMetric(swapCommitOffset) : null,
        offsetAtActiveInit: roundMetric(authorityOffset),
        invariantOffsetAtomicPass,
        renderAuthorityPhase: "dom-editable",
        runtimeRenderAuthorityPhase: mountSession?.renderAuthority || "dom-editable",
        caretVisible: true,
        runtimeCaretVisible: Boolean(mountSession?.caretVisible),
        paintStable: Boolean(mountSession?.paintStable),
      });
    }
    emitInlineFocusRcaEvent("overlay-focus-claim-commit", {
      editingId,
      overlayPhase: "active",
      editorEl: targetEl,
      extra: {
        sessionId,
        reason,
        path,
        attempt: Number.isFinite(Number(attempt)) ? Number(attempt) : null,
        maxAttempts: Number.isFinite(Number(maxAttempts)) ? Number(maxAttempts) : null,
      },
    });
    return true;
  }, [
    editingId,
    inlineOverlayMountSession,
    isMountSessionReadyForClaim,
    isPhaseAtomicV2,
    activeV2AuthoritySnapshot,
    resolvedV2VisualOffsetPx,
    setOverlayPhase,
    v2VerticalAuthoritySnapshot,
  ]);

  useLayoutEffect(() => {
    if (isPhaseAtomicV2) return undefined;
    if (!editingId) return undefined;
    if (!isEditorInteractive) return undefined;
    const sessionId = overlaySessionIdRef.current || null;
    if (!sessionId) return undefined;

    const state = entryFocusStateRef.current || {};
    if (state.editingId !== editingId || state.sessionId !== sessionId) {
      entryFocusStateRef.current = {
        editingId,
        sessionId,
        settled: false,
      };
    }
    if (entryFocusStateRef.current?.settled) return undefined;

    const initialEl = editorRef.current;
    if (!initialEl) return undefined;

    let cancelled = false;
    let rafId = 0;
    let attempt = 0;
    const maxAttempts = 4;

    const tryFocus = () => {
      if (cancelled) return;
      if (overlaySessionIdRef.current !== sessionId) return;
      const targetEl = editorRef.current;
      if (!targetEl) return;
      attempt += 1;
      const sameNodeAsInitial = targetEl === initialEl;
      try {
        targetEl.focus({ preventScroll: true });
      } catch {
        targetEl.focus();
      }
      const firstSnapshot = buildInlineFocusOperationalSnapshot(targetEl);
      const isFocused = Boolean(firstSnapshot.isActiveElementEditor);
      if (isFocused) {
        selectAllEditableContent(targetEl);
      }
      const operationalSnapshot = buildInlineFocusOperationalSnapshot(targetEl);

      emitInlineNudgeDiag(DEBUG_MODE, "focus-ownership-entry", {
        event: "focus-ownership-entry",
        id: editingId || null,
        sessionId: overlaySessionIdRef.current || null,
        phase: "entry-ready",
        attempt,
        maxAttempts,
        editorVisualReady: Boolean(editorVisualReady),
        isFocused,
        sameNodeAsInitial,
      });
      emitInlineFocusRcaEvent("focus-attempt", {
        editingId,
        overlayPhase: "entry-ready",
        editorEl: targetEl,
        extra: {
          sessionId,
          attempt,
          maxAttempts,
          path: "entry-ready",
          isFocused,
          sameNodeAsInitial,
          focusOperationalCore: Boolean(operationalSnapshot.focusOperationalCore),
        },
      });

      if (operationalSnapshot.focusOperationalCore) {
        entryFocusStateRef.current = {
          editingId,
          sessionId,
          settled: true,
        };
        return;
      }
      if (attempt >= maxAttempts) return;
      rafId = window.requestAnimationFrame(tryFocus);
    };

    tryFocus();

    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [editingId, isEditorInteractive, isPhaseAtomicV2]);

  useLayoutEffect(() => {
    if (!isPhaseAtomicV2) return undefined;
    if (!editingId) return undefined;
    if (!isEditorInteractive) return undefined;
    if (overlayPhase !== "await_focus_claim") return undefined;
    const sessionId = overlaySessionIdRef.current || null;
    if (!sessionId) return undefined;
    if (!isMountSessionReadyForClaim(sessionId)) return undefined;

    const state = entryFocusStateRef.current || {};
    if (state.editingId !== editingId || state.sessionId !== sessionId) {
      entryFocusStateRef.current = {
        editingId,
        sessionId,
        settled: false,
      };
    }
    if (entryFocusStateRef.current?.settled) return undefined;

    const initialEl = editorRef.current;
    if (!initialEl) return undefined;

    let cancelled = false;
    let rafId = 0;
    let attempt = 0;
    const maxAttempts = 4;

    const tryFocus = () => {
      if (cancelled) return;
      if (overlaySessionIdRef.current !== sessionId) return;
      const targetEl = editorRef.current;
      if (!targetEl) return;
      attempt += 1;
      const sameNodeAsInitial = targetEl === initialEl;
      try {
        targetEl.focus({ preventScroll: true });
      } catch {
        targetEl.focus();
      }
      const firstSnapshot = buildInlineFocusOperationalSnapshot(targetEl);
      const isFocused = Boolean(firstSnapshot.isActiveElementEditor);
      if (isFocused) {
        selectAllEditableContent(targetEl);
      }
      const operationalSnapshot = buildInlineFocusOperationalSnapshot(targetEl);

      emitInlineNudgeDiag(DEBUG_MODE, "focus-ownership-entry", {
        event: "focus-ownership-entry",
        id: editingId || null,
        sessionId: overlaySessionIdRef.current || null,
        phase: "post-ready-v2",
        overlayPhase: overlayPhase || null,
        attempt,
        maxAttempts,
        editorVisualReady: Boolean(editorVisualReady),
        isFocused,
        sameNodeAsInitial,
      });
      emitInlineFocusRcaEvent("focus-reclaim-attempt", {
        editingId,
        overlayPhase: overlayPhase || null,
        editorEl: targetEl,
        extra: {
          sessionId,
          attempt,
          maxAttempts,
          path: "post-ready-v2",
          isFocused,
          sameNodeAsInitial,
          focusOperationalCore: Boolean(operationalSnapshot.focusOperationalCore),
        },
      });

      if (commitOperationalFocusClaim({
        sessionId,
        reason: "post-ready-v2",
        editorElOverride: targetEl,
        attempt,
        maxAttempts,
        path: "post-ready-v2",
      })) {
        return;
      }
      if (attempt >= maxAttempts) return;
      rafId = window.requestAnimationFrame(tryFocus);
    };

    tryFocus();

    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [
    commitOperationalFocusClaim,
    editingId,
    isEditorInteractive,
    isMountSessionReadyForClaim,
    isPhaseAtomicV2,
    overlayPhase,
  ]);

  useEffect(() => {
    if (!isPhaseAtomicV2) return undefined;
    if (!editingId) return undefined;
    if (!isEditorInteractive) return undefined;
    if (overlayPhase !== "await_focus_claim") return undefined;
    const sessionId = overlaySessionIdRef.current || null;
    if (!sessionId) return undefined;
    if (!isMountSessionReadyForClaim(sessionId)) return undefined;

    const evaluateClaim = (reason) => {
      commitOperationalFocusClaim({
        sessionId,
        reason,
        path: "await-focus-observer",
      });
    };

    evaluateClaim("await-focus-observer:init");

    const handleSelectionChange = () => {
      evaluateClaim("await-focus-observer:selectionchange");
    };
    const handleFocusIn = (event) => {
      const targetEl = editorRef.current;
      if (!targetEl) return;
      const rawTarget = event?.target;
      const targetNode = rawTarget instanceof Node ? rawTarget : null;
      if (targetNode && targetNode !== targetEl && !targetEl.contains(targetNode)) {
        return;
      }
      evaluateClaim("await-focus-observer:focusin");
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("focusin", handleFocusIn, true);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("focusin", handleFocusIn, true);
    };
  }, [
    commitOperationalFocusClaim,
    editingId,
    isEditorInteractive,
    isMountSessionReadyForClaim,
    isPhaseAtomicV2,
    overlayPhase,
  ]);

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
          fontSizePx: domRenderFontSizePx,
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
    const normalizedMaxLineWidth = roundMetric(Number(maxLineWidth));
    return Math.max(
      20,
      Number.isFinite(Number(normalizedMaxLineWidth)) ? Number(normalizedMaxLineWidth) : 0
    );
  }, [
    editableLineHeightPx,
    fontMetricsRevision,
    letterSpacingPx,
    normalizedWidthMode,
    domRenderFontSizePx,
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
  const measuredOverlayWidthRawPx =
    normalizedWidthMode === "measured" && Number.isFinite(effectiveTextWidth)
      ? effectiveTextWidth
      : null;
  const measuredOverlayWidthPx = measuredOverlayWidthRawPx;
  const liveSymmetricWidthPx = (() => {
    if (!isTextNode) {
      return hasProjectedKonvaWidth ? projectedWidth : measuredOverlayWidthPx;
    }
    if (hasProjectedKonvaWidth && Number.isFinite(measuredOverlayWidthPx)) {
      // Handoff semantico: mientras el valor no cambie, la geometria inicial
      // debe permanecer anclada al rect raw de Konva (sin desacople raw->base).
      if (isPristineInlineValue) return projectedWidth;
      // Tras primer cambio de contenido, nunca usar un ancho menor al que
      // Konva ya pintaba (evita recorte visual en la transicion de ancho).
      return Math.max(projectedWidth, measuredOverlayWidthPx);
    }
    if (hasProjectedKonvaWidth) return projectedWidth;
    if (Number.isFinite(measuredOverlayWidthPx)) return measuredOverlayWidthPx;
    return null;
  })();
  const overlayWidthSource =
    hasProjectedKonvaWidth && Number.isFinite(measuredOverlayWidthPx)
      ? (
        isPristineInlineValue
          ? "handoff:konva-pristine"
          : (
            measuredOverlayWidthPx > projectedWidth
              ? "max:measured"
              : "max:konva"
          )
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
  const centeredEditorBaseWidthPx = shouldCenterTextWithinOverlay
    ? Number(measuredOverlayWidthPx)
    : null;
  const centeredEditorBaseLeftPx = shouldCenterTextWithinOverlay
    ? (Number(resolvedOverlayWidthPx) - Number(measuredOverlayWidthPx)) / 2
    : 0;
  const centeredEditorSlackPx = shouldCenterTextWithinOverlay
    ? Math.max(0, Number(resolvedOverlayWidthPx) - Number(measuredOverlayWidthPx))
    : 0;
  // Reserva minima para caret sin provocar salto visible al reclamar foco.
  const caretReservePxRaw = shouldCenterTextWithinOverlay
    ? Math.min(
      1,
      Math.max(0.5, Number(fontSizePx || 0) * 0.03),
      Number(centeredEditorSlackPx || 0)
    )
    : 0;
  const caretReservePx = shouldCenterTextWithinOverlay
    ? Math.max(0, Number(snapToDevicePixelGrid(caretReservePxRaw)))
    : 0;
  const centeredEditorWidthPx = shouldCenterTextWithinOverlay
    ? Math.max(1, Number(centeredEditorBaseWidthPx) - Number(caretReservePx))
    : null;
  const centeredEditorLeftPx = shouldCenterTextWithinOverlay
    ? Number(centeredEditorBaseLeftPx) - Number(caretReservePx) * 0.5
    : 0;
  const editorBaseWidthPx = Number.isFinite(centeredEditorWidthPx)
    ? Number(centeredEditorWidthPx)
    : (
      Number.isFinite(resolvedOverlayWidthPx)
        ? Number(resolvedOverlayWidthPx)
        : (Number.isFinite(resolvedMinWidthPx) ? Number(resolvedMinWidthPx) : null)
    );
  const canvasInkOverflowLeftPx = Math.max(
    0,
    -Number(canvasInkMetricsModel?.advanceToInkLeftInsetPx || 0)
  );
  const canvasInkOverflowRightPx = Math.max(
    0,
    -Number(canvasInkMetricsModel?.advanceToInkRightInsetPx || 0)
  );
  const domInkRightInsetForParity = Number.isFinite(Number(domInkProbeModel?.glyphInkRightInsetPx))
    ? Number(domInkProbeModel.glyphInkRightInsetPx)
    : Number(domInkProbeModel?.glyphRightInsetPx);
  const domInkLeftInsetForParity = Number.isFinite(Number(domInkProbeModel?.glyphInkLeftInsetPx))
    ? Number(domInkProbeModel.glyphInkLeftInsetPx)
    : Number(domInkProbeModel?.glyphLeftInsetPx);
  const domInkOverflowLeftPx = Math.max(0, -Number(domInkLeftInsetForParity || 0));
  const domInkOverflowRightPx = Math.max(0, -Number(domInkRightInsetForParity || 0));
  const inkParityLeftExpansionPxRaw =
    canvasInkOverflowLeftPx - domInkOverflowLeftPx;
  const inkParityRightExpansionPxRaw =
    canvasInkOverflowRightPx - domInkOverflowRightPx;
  const shouldApplyHorizontalInkParity =
    Boolean(isPhaseAtomicV2) &&
    Boolean(isSingleLine) &&
    Boolean(isPristineInlineValue) &&
    Number.isFinite(editorBaseWidthPx) &&
    (
      Math.abs(Number(inkParityLeftExpansionPxRaw || 0)) > 0.01 ||
      Math.abs(Number(inkParityRightExpansionPxRaw || 0)) > 0.01
    );
  const inkParityLeftExpansionPx = shouldApplyHorizontalInkParity
    ? Math.max(0, Number(inkParityLeftExpansionPxRaw || 0))
    : 0;
  const inkParityRightExpansionPx = shouldApplyHorizontalInkParity
    ? Math.max(0, Number(inkParityRightExpansionPxRaw || 0))
    : 0;
  const editorVisualLeftPx = (
    Number(centeredEditorLeftPx || 0) -
    inkParityLeftExpansionPx +
    (isPhaseAtomicV2 && isSingleLine ? Number(domToKonvaGlyphOffsetXPx || 0) : 0)
  );
  const editorVisualWidthPx =
    Number.isFinite(editorBaseWidthPx)
      ? Math.max(1, Number(editorBaseWidthPx) + inkParityLeftExpansionPx + inkParityRightExpansionPx)
      : null;
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
      const saneLimit = Math.max(1, Math.min(12, Number(editableLineHeightPx || 0) * 0.2));
      const residualAbs = Math.abs(Number(residual));
      const shouldApplyResidual = residualAbs > 0.25 && residualAbs <= saneLimit;
      const isEditorFocused =
        typeof document !== "undefined" && document.activeElement === visualEl;
      const isReadyForLiveNudge = Boolean(editorVisualReady) && Boolean(isEditorFocused);
      const shouldReadLiveSelectionGeometry = Boolean(isReadyForLiveNudge);
      const selectionInfo = shouldReadLiveSelectionGeometry
        ? getSelectionRectInEditor(visualEl)
        : { inEditor: false, rect: null };
      const fullRangeRect = shouldReadLiveSelectionGeometry
        ? getFullRangeRect(visualEl)
        : null;
      const caretProbeRect = shouldReadLiveSelectionGeometry
        ? getCollapsedCaretProbeRectInEditor(visualEl)
        : null;
      const domProbeTopInsetPrimary = Number(domCssInkProbeModel?.glyphTopInsetPx);
      const domProbeTopInsetFallback = Number(domLiveTopInset);
      const domProbeTopInset = Number.isFinite(domProbeTopInsetPrimary)
        ? domProbeTopInsetPrimary
        : domProbeTopInsetFallback;
      const konvaProbeTopInset = Number(konvaTopInset);
      const baseOffsetApplied = Number(domToKonvaBaseVisualOffsetPx || 0);
      const expectedGlyphTopFromBasePxRaw =
        Number.isFinite(domProbeTopInset) && Number.isFinite(baseOffsetApplied)
          ? (domProbeTopInset + baseOffsetApplied)
          : null;
      const expectedGlyphTopFromBasePx = Number.isFinite(Number(expectedGlyphTopFromBasePxRaw))
        ? Number(expectedGlyphTopFromBasePxRaw)
        : null;
      const liveGlyphTopInsetPx = Number.isFinite(liveTopInset) ? Number(liveTopInset) : null;
      const liveResidualAfterBasePxRaw =
        Number.isFinite(liveGlyphTopInsetPx) && Number.isFinite(expectedGlyphTopFromBasePx)
          ? (liveGlyphTopInsetPx - expectedGlyphTopFromBasePx)
          : null;
      const liveResidualAfterBasePx = Number.isFinite(Number(liveResidualAfterBasePxRaw))
        ? Number(liveResidualAfterBasePxRaw)
        : null;
      const selectionRect = selectionInfo?.rect || null;
      const hasSelectionInEditor = Boolean(selectionInfo?.inEditor);
      const hasValidSelectionRect =
        hasSelectionInEditor &&
        isFiniteRectPayload(selectionRect) &&
        Number(selectionRect.height) > 0 &&
        !isZeroRectPayload(selectionRect);
      const hasValidFullRangeRect =
        isFiniteRectPayload(fullRangeRect) &&
        Number(fullRangeRect.height) > 0 &&
        !isZeroRectPayload(fullRangeRect);
      const hasValidCaretProbeRect =
        isFiniteRectPayload(caretProbeRect) &&
        Number(caretProbeRect.height) > 0 &&
        !isZeroRectPayload(caretProbeRect);
      const selectionTopInsetPxRaw =
        hasValidSelectionRect
          ? (Number(selectionRect.y) - Number(contentRect.y))
          : null;
      const selectionTopInsetPx = Number.isFinite(Number(selectionTopInsetPxRaw))
        ? Number(selectionTopInsetPxRaw)
        : null;
      const fullRangeTopInsetPxRaw =
        hasValidFullRangeRect
          ? (Number(fullRangeRect.y) - Number(contentRect.y))
          : null;
      const fullRangeTopInsetPx = Number.isFinite(Number(fullRangeTopInsetPxRaw))
        ? Number(fullRangeTopInsetPxRaw)
        : null;
      const caretTopInsetPxRaw =
        hasValidCaretProbeRect
          ? (Number(caretProbeRect.y) - Number(contentRect.y))
          : null;
      const caretTopInsetPx = Number.isFinite(Number(caretTopInsetPxRaw))
        ? Number(caretTopInsetPxRaw)
        : null;
      const firstGlyphVsSelectionTopDxRaw =
        Number.isFinite(liveGlyphTopInsetPx) && Number.isFinite(selectionTopInsetPx)
          ? (liveGlyphTopInsetPx - selectionTopInsetPx)
          : null;
      const firstGlyphVsSelectionTopDx = Number.isFinite(Number(firstGlyphVsSelectionTopDxRaw))
        ? Number(firstGlyphVsSelectionTopDxRaw)
        : null;
      const firstGlyphVsFullRangeTopDxRaw =
        Number.isFinite(liveGlyphTopInsetPx) && Number.isFinite(fullRangeTopInsetPx)
          ? (liveGlyphTopInsetPx - fullRangeTopInsetPx)
          : null;
      const firstGlyphVsFullRangeTopDx = Number.isFinite(Number(firstGlyphVsFullRangeTopDxRaw))
        ? Number(firstGlyphVsFullRangeTopDxRaw)
        : null;
      const firstGlyphVsCaretTopDxRaw =
        Number.isFinite(liveGlyphTopInsetPx) && Number.isFinite(caretTopInsetPx)
          ? (liveGlyphTopInsetPx - caretTopInsetPx)
          : null;
      const firstGlyphVsCaretTopDx = Number.isFinite(Number(firstGlyphVsCaretTopDxRaw))
        ? Number(firstGlyphVsCaretTopDxRaw)
        : null;
      const liveReferenceConsistencyTolerancePx = Math.max(
        0.75,
        Math.min(2, Number(editableLineHeightPx || 0) * 0.08)
      );
      const selectionConsistent = Number.isFinite(firstGlyphVsSelectionTopDx) &&
        Math.abs(Number(firstGlyphVsSelectionTopDx)) <= Number(liveReferenceConsistencyTolerancePx);
      const fullRangeConsistent = Number.isFinite(firstGlyphVsFullRangeTopDx) &&
        Math.abs(Number(firstGlyphVsFullRangeTopDx)) <= Number(liveReferenceConsistencyTolerancePx);
      const caretConsistent = Number.isFinite(firstGlyphVsCaretTopDx) &&
        Math.abs(Number(firstGlyphVsCaretTopDx)) <= Number(liveReferenceConsistencyTolerancePx);
      const hasPrimaryLiveReferenceForApply =
        Boolean(hasValidSelectionRect || hasValidCaretProbeRect);
      const hasSecondaryLiveReference =
        Boolean(hasValidFullRangeRect || hasValidSelectionRect || hasValidCaretProbeRect);
      const liveReferenceConsistent = Boolean(selectionConsistent || fullRangeConsistent || caretConsistent);
      const firstTextNodeMeta = (() => {
        try {
          const walker = document.createTreeWalker(visualEl, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const textNode = walker.currentNode;
            const rawText = String(textNode?.nodeValue || "");
            if (!rawText.length) continue;
            const sampleRaw = rawText.slice(0, 2);
            const sampleCodepoints = Array.from(sampleRaw).map((ch) =>
              `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`
            );
            const parentNodeName = textNode?.parentElement?.nodeName || null;
            return {
              sampleRaw,
              sampleCodepoints,
              parentNodeName,
            };
          }
        } catch {
          // no-op
        }
        return {
          sampleRaw: null,
          sampleCodepoints: [],
          parentNodeName: null,
        };
      })();
      const computedStyle = (() => {
        try {
          return typeof window !== "undefined" ? window.getComputedStyle(visualEl) : null;
        } catch {
          return null;
        }
      })();
      const previousDiag = nudgeDiagPrevRef.current || {};
      const projectedYNow = Number(projectedY);
      const frameDelta = {
        projectedYDelta:
          Number.isFinite(projectedYNow) && Number.isFinite(Number(previousDiag.projectedY))
            ? roundMetric(projectedYNow - Number(previousDiag.projectedY))
            : null,
        konvaTopInsetDelta:
          Number.isFinite(konvaTopInset) && Number.isFinite(Number(previousDiag.konvaTopInset))
            ? roundMetric(konvaTopInset - Number(previousDiag.konvaTopInset))
            : null,
        liveTopInsetDelta:
          Number.isFinite(liveTopInset) && Number.isFinite(Number(previousDiag.liveTopInset))
            ? roundMetric(liveTopInset - Number(previousDiag.liveTopInset))
            : null,
        residualDelta:
          Number.isFinite(Number(residual)) && Number.isFinite(Number(previousDiag.residual))
            ? roundMetric(Number(residual) - Number(previousDiag.residual))
            : null,
      };
      emitInlineNudgeDiag(DEBUG_MODE, "nudge-calibration-input", {
        event: "nudge-calibration-input",
        id: editingId || null,
        sessionId: overlaySessionIdRef.current || null,
        layoutProbeRevision: Number(layoutProbeRevision || 0),
        fontMetricsRevision: Number(fontMetricsRevision || 0),
        calibrationKey,
        calibrationKeyRepeated: false,
        readiness: {
          editorVisualReady: Boolean(editorVisualReady),
          isEditorFocused: Boolean(isEditorFocused),
          isReadyForLiveNudge: Boolean(isReadyForLiveNudge),
          selectionInEditor: Boolean(selectionInfo?.inEditor),
          hasFullRangeRect: Boolean(fullRangeRect),
          hasCaretProbeRect: Boolean(caretProbeRect),
        },
        baseModel: {
          domToKonvaBaseVisualOffsetPx: roundMetric(Number(domToKonvaBaseVisualOffsetPx || 0)),
          effectiveVisualOffsetPxCurrent: roundMetric(Number(effectiveVisualOffsetPx || 0)),
          domVisualNudgePxCurrent: roundMetric(Number(domVisualNudgePx || 0)),
          projectedY: roundMetric(projectedYNow),
          projectedHeight: roundMetric(Number(projectedHeight)),
        },
        liveGeometry: {
          contentRectY: roundMetric(Number(contentRect.y)),
          contentRectHeight: roundMetric(Number(contentRect.height)),
          firstGlyphRectY: roundMetric(Number(firstGlyphRect.y)),
          firstGlyphRectHeight: roundMetric(Number(firstGlyphRect.height)),
          liveTopInset: roundMetric(Number(liveTopInset)),
          liveGlyphHeight: roundMetric(Number(liveGlyphHeight)),
        },
        probes: {
          konvaTopInset: roundMetric(Number(konvaTopInset)),
          konvaGlyphHeight: roundMetric(Number(konvaGlyphHeight)),
          domProbeTopInset: roundMetric(Number(domLiveTopInset)),
          domProbeBottomInset: roundMetric(Number(domLiveBottomInset)),
          domHasInkOverflow: Boolean(domHasInkOverflow),
          useCenterResidual: Boolean(useCenterResidual),
        },
        residualModel: {
          residual: roundMetric(Number(residual)),
          residualAbs: roundMetric(residualAbs),
          thresholdMin: 0.25,
          saneLimit: roundMetric(Number(saneLimit)),
          withinApplyRange: Boolean(shouldApplyResidual),
        },
        liveVerticalModel: {
          expectedGlyphTopFromBasePx: roundMetric(Number(expectedGlyphTopFromBasePx)),
          liveGlyphTopInsetPx: roundMetric(Number(liveGlyphTopInsetPx)),
          liveResidualAfterBasePx: roundMetric(Number(liveResidualAfterBasePx)),
          baseProbeTolerancePx: 0.25,
          selectionTopInsetPx: roundMetric(Number(selectionTopInsetPx)),
          fullRangeTopInsetPx: roundMetric(Number(fullRangeTopInsetPx)),
          caretTopInsetPx: roundMetric(Number(caretTopInsetPx)),
          firstGlyphVsSelectionTopDx: roundMetric(Number(firstGlyphVsSelectionTopDx)),
          firstGlyphVsFullRangeTopDx: roundMetric(Number(firstGlyphVsFullRangeTopDx)),
          firstGlyphVsCaretTopDx: roundMetric(Number(firstGlyphVsCaretTopDx)),
          liveReferenceConsistencyTolerancePx: roundMetric(Number(liveReferenceConsistencyTolerancePx)),
          hasValidSelectionRect: Boolean(hasValidSelectionRect),
          hasValidFullRangeRect: Boolean(hasValidFullRangeRect),
          hasValidCaretProbeRect: Boolean(hasValidCaretProbeRect),
          hasPrimaryLiveReferenceForApply: Boolean(hasPrimaryLiveReferenceForApply),
          hasSecondaryLiveReference: Boolean(hasSecondaryLiveReference),
          liveReferenceConsistent: Boolean(liveReferenceConsistent),
        },
        firstTextNodeMeta: {
          sampleRaw: firstTextNodeMeta.sampleRaw,
          sampleCodepoints: firstTextNodeMeta.sampleCodepoints,
          parentNodeName: firstTextNodeMeta.parentNodeName,
        },
        computedStyleSnapshot: {
          computedLineHeightPx: roundMetric(Number.parseFloat(computedStyle?.lineHeight)),
          computedPaddingTopPx: roundMetric(Number.parseFloat(computedStyle?.paddingTop)),
          computedFontSizePx: roundMetric(Number.parseFloat(computedStyle?.fontSize)),
        },
        frameDelta,
      });
      nudgeDiagPrevRef.current = {
        projectedY: Number.isFinite(projectedYNow) ? projectedYNow : null,
        konvaTopInset: Number.isFinite(konvaTopInset) ? konvaTopInset : null,
        liveTopInset: Number.isFinite(liveTopInset) ? liveTopInset : null,
        residual: Number.isFinite(Number(residual)) ? Number(residual) : null,
      };
      if (!isReadyForLiveNudge) {
        emitInlineNudgeDiag(DEBUG_MODE, "nudge-calibration-apply", {
          event: "nudge-calibration-apply",
          id: editingId || null,
          sessionId: overlaySessionIdRef.current || null,
          layoutProbeRevision: Number(layoutProbeRevision || 0),
          fontMetricsRevision: Number(fontMetricsRevision || 0),
          decision: !editorVisualReady ? "skip-editor-not-ready" : "skip-editor-not-focused",
          residual: roundMetric(Number(residual)),
          saneLimit: roundMetric(Number(saneLimit)),
          thresholdMin: 0.25,
          prevNudgePx: roundMetric(Number(domVisualNudgePx || 0)),
          proposedNudgePx: null,
          snappedNudgePx: null,
          clampLimitPx: roundMetric(
            Math.max(1.5, Math.min(14, Number(editableLineHeightPx || 0) * 0.25))
          ),
          boundedNudgePx: null,
          nextNudgePx: roundMetric(Number(domVisualNudgePx || 0)),
          nudgeDeltaPx: 0,
          effectiveBeforePx: roundMetric(
            Number(domToKonvaBaseVisualOffsetPx || 0) + Number(domVisualNudgePx || 0)
          ),
          effectiveAfterPx: roundMetric(
            Number(domToKonvaBaseVisualOffsetPx || 0) + Number(domVisualNudgePx || 0)
          ),
          baseOffsetOnlyAbs: roundMetric(Math.abs(Number(domToKonvaBaseVisualOffsetPx || 0))),
          residualAbs: roundMetric(residualAbs),
          readiness: {
            editorVisualReady: Boolean(editorVisualReady),
            isEditorFocused: Boolean(isEditorFocused),
            isReadyForLiveNudge: Boolean(isReadyForLiveNudge),
          },
        });
        revealRafId = window.requestAnimationFrame(() => {
          setEditorVisualReady(true);
        });
        return;
      }
      nudgeCalibrationRef.current.key = calibrationKey;
      const baseProbeTolerancePx = 0.25;
      const baseAlreadyAligned = Number.isFinite(liveResidualAfterBasePx)
        && Math.abs(Number(liveResidualAfterBasePx)) <= Number(baseProbeTolerancePx);
      if (baseAlreadyAligned) {
        emitInlineNudgeDiag(DEBUG_MODE, "nudge-calibration-apply", {
          event: "nudge-calibration-apply",
          id: editingId || null,
          sessionId: overlaySessionIdRef.current || null,
          layoutProbeRevision: Number(layoutProbeRevision || 0),
          fontMetricsRevision: Number(fontMetricsRevision || 0),
          decision: "skip-base-already-aligned",
          residual: roundMetric(Number(residual)),
          saneLimit: roundMetric(Number(saneLimit)),
          thresholdMin: 0.25,
          prevNudgePx: roundMetric(Number(domVisualNudgePx || 0)),
          proposedNudgePx: null,
          snappedNudgePx: null,
          clampLimitPx: roundMetric(Math.max(1.5, Math.min(14, Number(editableLineHeightPx || 0) * 0.25))),
          boundedNudgePx: null,
          nextNudgePx: roundMetric(Number(domVisualNudgePx || 0)),
          nudgeDeltaPx: 0,
          effectiveBeforePx: roundMetric(
            Number(domToKonvaBaseVisualOffsetPx || 0) + Number(domVisualNudgePx || 0)
          ),
          effectiveAfterPx: roundMetric(
            Number(domToKonvaBaseVisualOffsetPx || 0) + Number(domVisualNudgePx || 0)
          ),
          baseOffsetOnlyAbs: roundMetric(Math.abs(Number(domToKonvaBaseVisualOffsetPx || 0))),
          residualAbs: roundMetric(residualAbs),
          expectedGlyphTopFromBasePx: roundMetric(Number(expectedGlyphTopFromBasePx)),
          liveGlyphTopInsetPx: roundMetric(Number(liveGlyphTopInsetPx)),
          liveResidualAfterBasePx: roundMetric(Number(liveResidualAfterBasePx)),
          baseProbeTolerancePx: roundMetric(Number(baseProbeTolerancePx)),
          domProbeTopInset: roundMetric(Number(domProbeTopInset)),
          konvaProbeTopInset: roundMetric(Number(konvaProbeTopInset)),
          baseOffsetApplied: roundMetric(Number(baseOffsetApplied)),
          selectionTopInsetPx: roundMetric(Number(selectionTopInsetPx)),
          fullRangeTopInsetPx: roundMetric(Number(fullRangeTopInsetPx)),
          caretTopInsetPx: roundMetric(Number(caretTopInsetPx)),
          firstGlyphVsSelectionTopDx: roundMetric(Number(firstGlyphVsSelectionTopDx)),
          firstGlyphVsFullRangeTopDx: roundMetric(Number(firstGlyphVsFullRangeTopDx)),
          firstGlyphVsCaretTopDx: roundMetric(Number(firstGlyphVsCaretTopDx)),
          liveReferenceConsistencyTolerancePx: roundMetric(Number(liveReferenceConsistencyTolerancePx)),
          hasValidSelectionRect: Boolean(hasValidSelectionRect),
          hasValidFullRangeRect: Boolean(hasValidFullRangeRect),
          hasValidCaretProbeRect: Boolean(hasValidCaretProbeRect),
          hasPrimaryLiveReferenceForApply: Boolean(hasPrimaryLiveReferenceForApply),
          hasSecondaryLiveReference: Boolean(hasSecondaryLiveReference),
          liveReferenceConsistent: Boolean(liveReferenceConsistent),
          readiness: {
            editorVisualReady: Boolean(editorVisualReady),
            isEditorFocused: Boolean(isEditorFocused),
            isReadyForLiveNudge: Boolean(isReadyForLiveNudge),
          },
        });
        revealRafId = window.requestAnimationFrame(() => {
          setEditorVisualReady(true);
        });
        return;
      }
      if (shouldApplyResidual && !hasPrimaryLiveReferenceForApply) {
        emitInlineNudgeDiag(DEBUG_MODE, "nudge-calibration-apply", {
          event: "nudge-calibration-apply",
          id: editingId || null,
          sessionId: overlaySessionIdRef.current || null,
          layoutProbeRevision: Number(layoutProbeRevision || 0),
          fontMetricsRevision: Number(fontMetricsRevision || 0),
          decision: "skip-live-reference-unreliable",
          residual: roundMetric(Number(residual)),
          saneLimit: roundMetric(Number(saneLimit)),
          thresholdMin: 0.25,
          prevNudgePx: roundMetric(Number(domVisualNudgePx || 0)),
          proposedNudgePx: null,
          snappedNudgePx: null,
          clampLimitPx: roundMetric(Math.max(1.5, Math.min(14, Number(editableLineHeightPx || 0) * 0.25))),
          boundedNudgePx: null,
          nextNudgePx: roundMetric(Number(domVisualNudgePx || 0)),
          nudgeDeltaPx: 0,
          effectiveBeforePx: roundMetric(
            Number(domToKonvaBaseVisualOffsetPx || 0) + Number(domVisualNudgePx || 0)
          ),
          effectiveAfterPx: roundMetric(
            Number(domToKonvaBaseVisualOffsetPx || 0) + Number(domVisualNudgePx || 0)
          ),
          baseOffsetOnlyAbs: roundMetric(Math.abs(Number(domToKonvaBaseVisualOffsetPx || 0))),
          residualAbs: roundMetric(residualAbs),
          expectedGlyphTopFromBasePx: roundMetric(Number(expectedGlyphTopFromBasePx)),
          liveGlyphTopInsetPx: roundMetric(Number(liveGlyphTopInsetPx)),
          liveResidualAfterBasePx: roundMetric(Number(liveResidualAfterBasePx)),
          baseProbeTolerancePx: roundMetric(Number(baseProbeTolerancePx)),
          domProbeTopInset: roundMetric(Number(domProbeTopInset)),
          konvaProbeTopInset: roundMetric(Number(konvaProbeTopInset)),
          baseOffsetApplied: roundMetric(Number(baseOffsetApplied)),
          selectionTopInsetPx: roundMetric(Number(selectionTopInsetPx)),
          fullRangeTopInsetPx: roundMetric(Number(fullRangeTopInsetPx)),
          caretTopInsetPx: roundMetric(Number(caretTopInsetPx)),
          firstGlyphVsSelectionTopDx: roundMetric(Number(firstGlyphVsSelectionTopDx)),
          firstGlyphVsFullRangeTopDx: roundMetric(Number(firstGlyphVsFullRangeTopDx)),
          firstGlyphVsCaretTopDx: roundMetric(Number(firstGlyphVsCaretTopDx)),
          liveReferenceConsistencyTolerancePx: roundMetric(Number(liveReferenceConsistencyTolerancePx)),
          hasValidSelectionRect: Boolean(hasValidSelectionRect),
          hasValidFullRangeRect: Boolean(hasValidFullRangeRect),
          hasValidCaretProbeRect: Boolean(hasValidCaretProbeRect),
          hasPrimaryLiveReferenceForApply: Boolean(hasPrimaryLiveReferenceForApply),
          hasSecondaryLiveReference: Boolean(hasSecondaryLiveReference),
          liveReferenceConsistent: Boolean(liveReferenceConsistent),
          readiness: {
            editorVisualReady: Boolean(editorVisualReady),
            isEditorFocused: Boolean(isEditorFocused),
            isReadyForLiveNudge: Boolean(isReadyForLiveNudge),
          },
        });
        revealRafId = window.requestAnimationFrame(() => {
          setEditorVisualReady(true);
        });
        return;
      }
      if (shouldApplyResidual && !liveReferenceConsistent) {
        emitInlineNudgeDiag(DEBUG_MODE, "nudge-calibration-apply", {
          event: "nudge-calibration-apply",
          id: editingId || null,
          sessionId: overlaySessionIdRef.current || null,
          layoutProbeRevision: Number(layoutProbeRevision || 0),
          fontMetricsRevision: Number(fontMetricsRevision || 0),
          decision: "skip-live-reference-inconsistent",
          residual: roundMetric(Number(residual)),
          saneLimit: roundMetric(Number(saneLimit)),
          thresholdMin: 0.25,
          prevNudgePx: roundMetric(Number(domVisualNudgePx || 0)),
          proposedNudgePx: null,
          snappedNudgePx: null,
          clampLimitPx: roundMetric(Math.max(1.5, Math.min(14, Number(editableLineHeightPx || 0) * 0.25))),
          boundedNudgePx: null,
          nextNudgePx: roundMetric(Number(domVisualNudgePx || 0)),
          nudgeDeltaPx: 0,
          effectiveBeforePx: roundMetric(
            Number(domToKonvaBaseVisualOffsetPx || 0) + Number(domVisualNudgePx || 0)
          ),
          effectiveAfterPx: roundMetric(
            Number(domToKonvaBaseVisualOffsetPx || 0) + Number(domVisualNudgePx || 0)
          ),
          baseOffsetOnlyAbs: roundMetric(Math.abs(Number(domToKonvaBaseVisualOffsetPx || 0))),
          residualAbs: roundMetric(residualAbs),
          expectedGlyphTopFromBasePx: roundMetric(Number(expectedGlyphTopFromBasePx)),
          liveGlyphTopInsetPx: roundMetric(Number(liveGlyphTopInsetPx)),
          liveResidualAfterBasePx: roundMetric(Number(liveResidualAfterBasePx)),
          baseProbeTolerancePx: roundMetric(Number(baseProbeTolerancePx)),
          domProbeTopInset: roundMetric(Number(domProbeTopInset)),
          konvaProbeTopInset: roundMetric(Number(konvaProbeTopInset)),
          baseOffsetApplied: roundMetric(Number(baseOffsetApplied)),
          selectionTopInsetPx: roundMetric(Number(selectionTopInsetPx)),
          fullRangeTopInsetPx: roundMetric(Number(fullRangeTopInsetPx)),
          caretTopInsetPx: roundMetric(Number(caretTopInsetPx)),
          firstGlyphVsSelectionTopDx: roundMetric(Number(firstGlyphVsSelectionTopDx)),
          firstGlyphVsFullRangeTopDx: roundMetric(Number(firstGlyphVsFullRangeTopDx)),
          firstGlyphVsCaretTopDx: roundMetric(Number(firstGlyphVsCaretTopDx)),
          liveReferenceConsistencyTolerancePx: roundMetric(Number(liveReferenceConsistencyTolerancePx)),
          hasValidSelectionRect: Boolean(hasValidSelectionRect),
          hasValidFullRangeRect: Boolean(hasValidFullRangeRect),
          hasValidCaretProbeRect: Boolean(hasValidCaretProbeRect),
          hasPrimaryLiveReferenceForApply: Boolean(hasPrimaryLiveReferenceForApply),
          hasSecondaryLiveReference: Boolean(hasSecondaryLiveReference),
          liveReferenceConsistent: Boolean(liveReferenceConsistent),
          readiness: {
            editorVisualReady: Boolean(editorVisualReady),
            isEditorFocused: Boolean(isEditorFocused),
            isReadyForLiveNudge: Boolean(isReadyForLiveNudge),
          },
        });
        revealRafId = window.requestAnimationFrame(() => {
          setEditorVisualReady(true);
        });
        return;
      }
      if (shouldApplyResidual) {
        setDomVisualNudgePx((prev) => {
          const prevNum = Number(prev || 0);
          const proposed = prevNum + residual;
          const snapped = snapToDevicePixelGrid(proposed);
          const nextRaw = Number.isFinite(Number(snapped)) ? Number(snapped) : proposed;
          const clamp = Math.max(1.5, Math.min(14, Number(editableLineHeightPx || 0) * 0.25));
          const bounded = Math.max(-clamp, Math.min(clamp, nextRaw));
          const nextRounded = roundMetric(bounded);
          const next = Number.isFinite(nextRounded) ? nextRounded : bounded;
          const smallDelta = Math.abs(next - prevNum) < 0.05;
          emitInlineNudgeDiag(DEBUG_MODE, "nudge-calibration-apply", {
            event: "nudge-calibration-apply",
            id: editingId || null,
            sessionId: overlaySessionIdRef.current || null,
            layoutProbeRevision: Number(layoutProbeRevision || 0),
            fontMetricsRevision: Number(fontMetricsRevision || 0),
            decision: smallDelta ? "skip-small-delta" : "apply",
            residual: roundMetric(Number(residual)),
            saneLimit: roundMetric(Number(saneLimit)),
            thresholdMin: 0.25,
            prevNudgePx: roundMetric(Number(prevNum)),
            proposedNudgePx: roundMetric(Number(proposed)),
            snappedNudgePx: roundMetric(Number(snapped)),
            clampLimitPx: roundMetric(Number(clamp)),
            boundedNudgePx: roundMetric(Number(bounded)),
            nextNudgePx: roundMetric(Number(next)),
            nudgeDeltaPx: roundMetric(Number(next - prevNum)),
            effectiveBeforePx: roundMetric(
              Number(domToKonvaBaseVisualOffsetPx || 0) + Number(prevNum || 0)
            ),
            effectiveAfterPx: roundMetric(
              Number(domToKonvaBaseVisualOffsetPx || 0) + Number(next || 0)
            ),
            baseOffsetOnlyAbs: roundMetric(Math.abs(Number(domToKonvaBaseVisualOffsetPx || 0))),
            residualAbs: roundMetric(residualAbs),
            expectedGlyphTopFromBasePx: roundMetric(Number(expectedGlyphTopFromBasePx)),
            liveGlyphTopInsetPx: roundMetric(Number(liveGlyphTopInsetPx)),
            liveResidualAfterBasePx: roundMetric(Number(liveResidualAfterBasePx)),
            baseProbeTolerancePx: roundMetric(Number(baseProbeTolerancePx)),
            domProbeTopInset: roundMetric(Number(domProbeTopInset)),
            konvaProbeTopInset: roundMetric(Number(konvaProbeTopInset)),
            baseOffsetApplied: roundMetric(Number(baseOffsetApplied)),
            selectionTopInsetPx: roundMetric(Number(selectionTopInsetPx)),
            fullRangeTopInsetPx: roundMetric(Number(fullRangeTopInsetPx)),
            caretTopInsetPx: roundMetric(Number(caretTopInsetPx)),
            firstGlyphVsSelectionTopDx: roundMetric(Number(firstGlyphVsSelectionTopDx)),
            firstGlyphVsFullRangeTopDx: roundMetric(Number(firstGlyphVsFullRangeTopDx)),
            firstGlyphVsCaretTopDx: roundMetric(Number(firstGlyphVsCaretTopDx)),
            liveReferenceConsistencyTolerancePx: roundMetric(Number(liveReferenceConsistencyTolerancePx)),
            hasValidSelectionRect: Boolean(hasValidSelectionRect),
            hasValidFullRangeRect: Boolean(hasValidFullRangeRect),
            hasValidCaretProbeRect: Boolean(hasValidCaretProbeRect),
            hasPrimaryLiveReferenceForApply: Boolean(hasPrimaryLiveReferenceForApply),
            hasSecondaryLiveReference: Boolean(hasSecondaryLiveReference),
            liveReferenceConsistent: Boolean(liveReferenceConsistent),
            readiness: {
              editorVisualReady: Boolean(editorVisualReady),
              isEditorFocused: Boolean(isEditorFocused),
              isReadyForLiveNudge: Boolean(isReadyForLiveNudge),
            },
          });
          if (smallDelta) return prev;
          return next;
        });
      } else {
        emitInlineNudgeDiag(DEBUG_MODE, "nudge-calibration-apply", {
          event: "nudge-calibration-apply",
          id: editingId || null,
          sessionId: overlaySessionIdRef.current || null,
          layoutProbeRevision: Number(layoutProbeRevision || 0),
          fontMetricsRevision: Number(fontMetricsRevision || 0),
          decision: residualAbs <= 0.25 ? "skip-below-threshold" : "skip-over-sane-limit",
          residual: roundMetric(Number(residual)),
          saneLimit: roundMetric(Number(saneLimit)),
          thresholdMin: 0.25,
          prevNudgePx: roundMetric(Number(domVisualNudgePx || 0)),
          proposedNudgePx: null,
          snappedNudgePx: null,
          clampLimitPx: roundMetric(Math.max(1.5, Math.min(14, Number(editableLineHeightPx || 0) * 0.25))),
          boundedNudgePx: null,
          nextNudgePx: roundMetric(Number(domVisualNudgePx || 0)),
          nudgeDeltaPx: 0,
          effectiveBeforePx: roundMetric(
            Number(domToKonvaBaseVisualOffsetPx || 0) + Number(domVisualNudgePx || 0)
          ),
          effectiveAfterPx: roundMetric(
            Number(domToKonvaBaseVisualOffsetPx || 0) + Number(domVisualNudgePx || 0)
          ),
          baseOffsetOnlyAbs: roundMetric(Math.abs(Number(domToKonvaBaseVisualOffsetPx || 0))),
          residualAbs: roundMetric(residualAbs),
          expectedGlyphTopFromBasePx: roundMetric(Number(expectedGlyphTopFromBasePx)),
          liveGlyphTopInsetPx: roundMetric(Number(liveGlyphTopInsetPx)),
          liveResidualAfterBasePx: roundMetric(Number(liveResidualAfterBasePx)),
          baseProbeTolerancePx: roundMetric(Number(baseProbeTolerancePx)),
          domProbeTopInset: roundMetric(Number(domProbeTopInset)),
          konvaProbeTopInset: roundMetric(Number(konvaProbeTopInset)),
          baseOffsetApplied: roundMetric(Number(baseOffsetApplied)),
          selectionTopInsetPx: roundMetric(Number(selectionTopInsetPx)),
          fullRangeTopInsetPx: roundMetric(Number(fullRangeTopInsetPx)),
          caretTopInsetPx: roundMetric(Number(caretTopInsetPx)),
          firstGlyphVsSelectionTopDx: roundMetric(Number(firstGlyphVsSelectionTopDx)),
          firstGlyphVsFullRangeTopDx: roundMetric(Number(firstGlyphVsFullRangeTopDx)),
          firstGlyphVsCaretTopDx: roundMetric(Number(firstGlyphVsCaretTopDx)),
          liveReferenceConsistencyTolerancePx: roundMetric(Number(liveReferenceConsistencyTolerancePx)),
          hasValidSelectionRect: Boolean(hasValidSelectionRect),
          hasValidFullRangeRect: Boolean(hasValidFullRangeRect),
          hasValidCaretProbeRect: Boolean(hasValidCaretProbeRect),
          hasPrimaryLiveReferenceForApply: Boolean(hasPrimaryLiveReferenceForApply),
          hasSecondaryLiveReference: Boolean(hasSecondaryLiveReference),
          liveReferenceConsistent: Boolean(liveReferenceConsistent),
          readiness: {
            editorVisualReady: Boolean(editorVisualReady),
            isEditorFocused: Boolean(isEditorFocused),
            isReadyForLiveNudge: Boolean(isReadyForLiveNudge),
          },
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
    editorVisualReady,
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
  const emitDebug = useInlineDebugEmitter({
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
    projectedKonvaRectBase,
    projectedKonvaRectRaw,
    fontSizePx,
    lineHeightPx,
    cssLineHeightPx,
    letterSpacingPx,
    isSingleLine,
    maintainCenterWhileEditing,
    shouldCenterTextWithinOverlay,
    centeredEditorWidthPx: editorVisualWidthPx,
    centeredEditorLeftPx: editorVisualLeftPx,
    singleLineCaretMode,
    singleLineProbeOverflowPx,
    useKonvaLineHeightForSingleLine,
    verticalInsetPx,
    editorPaddingTopPx,
    editorPaddingBottomPx,
    editableLineHeightPx,
    editorVisualReady,
    renderAuthorityPhase,
    runtimeRenderAuthorityPhase,
    caretVisible,
    runtimeCaretVisible,
    runtimePaintStable,
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
    domToKonvaVisualOffsetPx,
    effectiveVisualOffsetPx,
    effectiveInternalContentOffsetPx,
    v2OffsetOneShotPx,
    v2VerticalAuthoritySnapshot: activeV2AuthoritySnapshot,
    fontMetricsRevision,
    fontLoadStatus,
    effectiveFontFamily: v2EffectiveFontFamily || nodeProps.fontFamily,
    isPhaseAtomicV2,
    normalizedOverlayEngine,
    nodeProps,
    overlayPhase,
    scaleVisual,
    totalScaleX,
    totalScaleY,
    domPerceptualScale,
    domPerceptualScaleModel,
    editorRef,
    editorFrameRef,
    contentBoxRef,
    editableHostRef,
    overlaySessionIdRef,
    konvaTextNode: rectSourceNode,
  });
  useLayoutEffect(() => {
    emitDebugRef.current = emitDebug;
    return () => {
      if (emitDebugRef.current === emitDebug) {
        emitDebugRef.current = null;
      }
    };
  }, [emitDebug]);
  useInlinePhaseAtomicLifecycle({
    editingId,
    isPhaseAtomicV2,
    fontLoadStatusAvailable: fontLoadStatus?.available,
    v2VerticalAuthoritySnapshot: activeV2AuthoritySnapshot,
    onOverlaySwapRequest,
    swapAckToken,
    emitDebug,
    v2FontsReady,
    setV2FontsReady,
    v2OffsetComputed,
    setV2OffsetComputed,
    v2OffsetOneShotPx,
    setV2OffsetOneShotPx,
    v2SwapRequested,
    setV2SwapRequested,
    overlaySessionIdRef,
    inlineOverlayMountSession,
    swapAckSeenRef,
    setOverlayPhase,
    setEditorVisualReady,
    setRenderAuthorityPhase,
    setCaretVisible,
    setLayoutProbeRevision,
  });

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

  const {
    triggerFinish,
  } = useInlineEditorMountLifecycle({
    editorRef,
    editingId,
    isPhaseAtomicV2,
    clearPendingDoneDispatchForId,
    pendingDoneDispatchRef,
    emitDebug,
    setOverlayPhase,
    overlaySessionIdRef,
    normalizedValue,
    onChange,
    onOverlaySwapRequest,
    v2OffsetOneShotPx,
    v2VerticalAuthoritySnapshot: activeV2AuthoritySnapshot,
    setLayoutProbeRevision,
    normalizedFinishMode,
    onFinish,
  });

  const {
    handleInput,
    handleKeyDown,
    handleBlur,
  } = useInlineInputHandlers({
    editingId,
    editorRef,
    sessionIdRef: overlaySessionIdRef,
    overlayPhase,
    normalizedValue,
    onDomLayoutValueChange: handleDomLayoutValueChange,
    onChange,
    emitDebug,
    triggerFinish,
  });
  return (
    <InlineEditorPortalView
      BOX_DEBUG_MODE={BOX_DEBUG_MODE}
      konvaRectDebugStyle={konvaRectDebugStyle}
      konvaLabelDebugStyle={konvaLabelDebugStyle}
      editingId={editingId}
      overlayRootRef={overlayRootRef}
      editorVisualReady={editorVisualReady}
      paintStable={isPhaseAtomicV2 ? runtimePaintStable : editorVisualReady}
      renderAuthorityPhase={renderAuthorityPhase}
      caretVisible={caretVisible}
      normalizedOverlayEngine={normalizedOverlayEngine}
      overlayPhase={overlayPhase}
      normalizedWidthMode={normalizedWidthMode}
      normalizedFinishMode={normalizedFinishMode}
      overlayLeftPx={left}
      overlayTopPx={top}
      resolvedOverlayWidthPx={resolvedOverlayWidthPx}
      effectiveTextWidth={effectiveTextWidth}
      resolvedMinWidthPx={resolvedMinWidthPx}
      resolvedOverlayHeightPx={resolvedOverlayHeightPx}
      PADDING_X={PADDING_X}
      PADDING_Y={PADDING_Y}
      overlayDebugStyle={overlayDebugStyle}
      overlayLabelDebugStyle={overlayLabelDebugStyle}
      contentLabelDebugStyle={contentLabelDebugStyle}
      contentBoxRef={contentBoxRef}
      resolvedContentMinHeightPx={resolvedContentMinHeightPx}
      contentDebugStyle={contentDebugStyle}
      editableHostRef={editableHostRef}
      editorFrameRef={editorFrameRef}
      editorRef={editorRef}
      editorVisualWidthPx={editorVisualWidthPx}
      editorVisualLeftPx={editorVisualLeftPx}
      centeredEditorWidthPx={centeredEditorWidthPx}
      centeredEditorLeftPx={centeredEditorLeftPx}
      effectiveVisualOffsetPx={effectiveVisualOffsetPx}
      internalContentOffsetPx={effectiveInternalContentOffsetPx}
      isEditorVisible={isEditorVisible}
      isEditorInteractive={isEditorInteractive}
      isSingleLine={isSingleLine}
      fontSizePx={domRenderFontSizePx}
      nodeProps={nodeProps}
      editableLineHeightPx={editableLineHeightPx}
      letterSpacingPx={letterSpacingPx}
      editorTextColor={editorTextColor}
      editorPaddingTopPx={editorPaddingTopPx}
      editorPaddingBottomPx={editorPaddingBottomPx}
      textAlign={textAlign}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}
