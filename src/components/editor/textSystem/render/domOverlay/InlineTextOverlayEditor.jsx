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
import { getFirstGlyphRectInEditor } from "@/components/editor/overlays/inlineEditor/inlineEditorSelectionRects";
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

    onOverlayMountChange(editingId, true);
    return () => {
      onOverlayMountChange(editingId, false);
    };
  }, [editingId, editorVisualReady, isPhaseAtomicV2, onOverlayMountChange]);

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
      onBlur={handleBlur}
    />
  );
}
