import { useMemo, useEffect, useRef, useLayoutEffect, useCallback, useState } from "react";
import {
  getInlineKonvaProjectedRectViewport,
  resolveInlineKonvaTextNode,
} from "@/components/editor/overlays/inlineGeometry";
import {
  normalizeInlineEditableText,
} from "@/components/editor/overlays/inlineTextModel";
import {
  computeInlineAlignmentOffsetV2,
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
  resolveCanvasTextVisualWidth,
} from "@/components/editor/overlays/inlineEditor/inlineEditorTextMetrics";
import {
  INLINE_LAYOUT_VERSION,
  INLINE_VISUAL_NUDGE_CACHE,
} from "@/components/editor/overlays/inlineEditor/inlineEditorConstants";
import useInlineViewportSyncRevision from "@/components/editor/overlays/inlineEditor/useInlineViewportSyncRevision";
import useInlinePhaseAtomicLifecycle from "@/components/editor/overlays/inlineEditor/useInlinePhaseAtomicLifecycle";
import useInlineDebugEmitter from "@/components/editor/overlays/inlineEditor/useInlineDebugEmitter";
import useInlineEditorMountLifecycle from "@/components/editor/overlays/inlineEditor/useInlineEditorMountLifecycle";
import InlineEditorPortalView from "@/components/editor/overlays/inlineEditor/InlineEditorPortalView";
import useInlineInputHandlers from "@/components/editor/textSystem/render/domOverlay/useInlineInputHandlers";

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
  const [legacyExitPending, setLegacyExitPending] = useState(false);
  const legacyStableOverlayWidthRef = useRef(null);
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
  const v2InitEditingIdRef = useRef(null);
  const pendingDoneDispatchRef = useRef({
    timerId: 0,
    id: null,
    sessionId: null,
  });
  const legacyEntryFocusStateRef = useRef({
    editingId: null,
    settled: false,
  });
  const nudgeDiagPrevRef = useRef({
    projectedY: null,
    konvaTopInset: null,
    liveTopInset: null,
    residual: null,
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
    emitInlineNudgeDiag(DEBUG_MODE, "nudge-cache-read", {
      event: "nudge-cache-read",
      id: editingId || null,
      sessionId: overlaySessionIdRef.current || null,
      phase: isPhaseAtomicV2 ? "phase_atomic_v2" : "legacy",
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
    legacyEntryFocusStateRef.current = {
      editingId,
      settled: false,
    };
  }, [editingId, isPhaseAtomicV2]);

  useEffect(() => {
    if (!editingId) return;
    setLegacyExitPending(false);
    legacyStableOverlayWidthRef.current = null;
  }, [editingId, isPhaseAtomicV2]);

  useLayoutEffect(() => {
    if (isPhaseAtomicV2) return undefined;
    if (!editingId) return undefined;
    if (!editorVisualReady) return undefined;

    const state = legacyEntryFocusStateRef.current || {};
    if (state.editingId !== editingId) {
      legacyEntryFocusStateRef.current = {
        editingId,
        settled: false,
      };
    }
    if (legacyEntryFocusStateRef.current?.settled) return undefined;

    const initialEl = editorRef.current;
    if (!initialEl) return undefined;

    let cancelled = false;
    let rafId = 0;
    let attempt = 0;
    const maxAttempts = 4;

    const placeCaretAtEnd = (targetEl) => {
      if (!targetEl) return;
      if (targetEl instanceof HTMLInputElement) {
        const len = String(targetEl.value || "").length;
        try {
          targetEl.setSelectionRange(len, len);
        } catch {
          // no-op
        }
        return;
      }
      try {
        const range = document.createRange();
        range.selectNodeContents(targetEl);
        range.collapse(false);
        const sel = window.getSelection?.();
        if (!sel) return;
        sel.removeAllRanges();
        sel.addRange(range);
      } catch {
        // no-op
      }
    };

    const tryFocus = () => {
      if (cancelled) return;
      const targetEl = editorRef.current;
      if (!targetEl) return;
      attempt += 1;
      const sameNodeAsInitial = targetEl === initialEl;
      try {
        targetEl.focus({ preventScroll: true });
      } catch {
        targetEl.focus();
      }
      const isFocused =
        typeof document !== "undefined" && document.activeElement === targetEl;

      emitInlineNudgeDiag(DEBUG_MODE, "focus-ownership-entry", {
        event: "focus-ownership-entry",
        id: editingId || null,
        sessionId: overlaySessionIdRef.current || null,
        phase: "legacy-entry-ready",
        attempt,
        maxAttempts,
        editorVisualReady: Boolean(editorVisualReady),
        isFocused,
        sameNodeAsInitial,
      });

      if (isFocused) {
        placeCaretAtEnd(targetEl);
        legacyEntryFocusStateRef.current = {
          editingId,
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
  }, [editingId, editorVisualReady, isPhaseAtomicV2]);

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
  const measuredOverlayWidthRawPx =
    normalizedWidthMode === "measured" && Number.isFinite(effectiveTextWidth)
      ? effectiveTextWidth
      : null;
  const shouldFreezeLegacyExitGeometry =
    !isPhaseAtomicV2 &&
    Boolean(legacyExitPending);
  const frozenLegacyOverlayWidthPx =
    Number.isFinite(Number(legacyStableOverlayWidthRef.current))
      ? Number(legacyStableOverlayWidthRef.current)
      : (
        hasProjectedKonvaWidth
          ? projectedWidth
          : measuredOverlayWidthRawPx
      );
  const measuredOverlayWidthPx =
    shouldFreezeLegacyExitGeometry
      ? frozenLegacyOverlayWidthPx
      : measuredOverlayWidthRawPx;
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
    !shouldFreezeLegacyExitGeometry &&
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
  useEffect(() => {
    if (isPhaseAtomicV2) return;
    if (shouldFreezeLegacyExitGeometry) return;
    if (!Number.isFinite(Number(resolvedOverlayWidthPx))) return;
    legacyStableOverlayWidthRef.current = Number(resolvedOverlayWidthPx);
  }, [isPhaseAtomicV2, resolvedOverlayWidthPx, shouldFreezeLegacyExitGeometry]);
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
    domToKonvaVisualOffsetPx,
    effectiveVisualOffsetPx,
    v2OffsetOneShotPx,
    fontMetricsRevision,
    fontLoadStatus,
    isPhaseAtomicV2,
    normalizedOverlayEngine,
    nodeProps,
    overlayPhase,
    scaleVisual,
    editorRef,
    contentBoxRef,
    editableHostRef,
    overlaySessionIdRef,
  });
  useInlinePhaseAtomicLifecycle({
    editingId,
    isPhaseAtomicV2,
    fontLoadStatusAvailable: fontLoadStatus?.available,
    domToKonvaOffsetApplied: domToKonvaOffsetModel?.appliedOffset,
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
    swapAckSeenRef,
    setOverlayPhase,
    setEditorVisualReady,
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

  // Handoff visual: avisar al canvas recien cuando el editor DOM ya esta
  // visualmente calibrado para evitar saltos Konva->DOM al entrar en edicion.
  useEffect(() => {
    if (isPhaseAtomicV2) return undefined;
    if (typeof onOverlayMountChange !== "function") return;
    if (!editingId) return;
    if (!editorVisualReady) return;
    const visualEl = editorRef.current;
    const isEditorFocused =
      Boolean(visualEl) &&
      typeof document !== "undefined" &&
      document.activeElement === visualEl;
    if (!isEditorFocused) return;

    onOverlayMountChange(editingId, true);
    return () => {
      onOverlayMountChange(editingId, false);
    };
  }, [
    editingId,
    editorVisualReady,
    isPhaseAtomicV2,
    onOverlayMountChange,
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
    setLayoutProbeRevision,
    normalizedFinishMode,
    onFinish,
  });

  const {
    handleInput,
    handleKeyDown,
    handleBlur,
  } = useInlineInputHandlers({
    normalizedValue,
    onChange,
    emitDebug,
    triggerFinish,
  });
  const handleLegacyAwareBlur = useCallback((event) => {
    if (!isPhaseAtomicV2) {
      setLegacyExitPending(true);
    }
    handleBlur(event);
  }, [handleBlur, isPhaseAtomicV2]);

  return (
    <InlineEditorPortalView
      BOX_DEBUG_MODE={BOX_DEBUG_MODE}
      konvaRectDebugStyle={konvaRectDebugStyle}
      konvaLabelDebugStyle={konvaLabelDebugStyle}
      editingId={editingId}
      editorVisualReady={editorVisualReady}
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
      editorRef={editorRef}
      centeredEditorWidthPx={centeredEditorWidthPx}
      centeredEditorLeftPx={centeredEditorLeftPx}
      effectiveVisualOffsetPx={effectiveVisualOffsetPx}
      isEditorVisible={isEditorVisible}
      fontSizePx={fontSizePx}
      nodeProps={nodeProps}
      editableLineHeightPx={editableLineHeightPx}
      letterSpacingPx={letterSpacingPx}
      editorTextColor={editorTextColor}
      editorPaddingTopPx={editorPaddingTopPx}
      editorPaddingBottomPx={editorPaddingBottomPx}
      textAlign={textAlign}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onBlur={handleLegacyAwareBlur}
    />
  );
}
