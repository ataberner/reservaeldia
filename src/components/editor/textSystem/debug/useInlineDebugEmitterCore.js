import { useCallback, useRef } from "react";
import {
  INLINE_ALIGNMENT_MODEL_V2_VERSION,
  pushInlineTraceEvent,
} from "@/components/editor/overlays/inlineAlignmentModelV2";
import {
  formatInlineLogPayload,
  nextInlineFrameMeta,
} from "@/components/editor/overlays/inlineEditor/inlineEditorDebugPrimitives";
import {
  getCollapsedCaretProbeRectInEditor,
  getFirstGlyphRectInEditor,
  getFullRangeRect,
  getLastGlyphRectInEditor,
  getSelectionRectInEditor,
  getTextInkRectInEditor,
} from "@/components/editor/overlays/inlineEditor/inlineEditorSelectionRects";
import {
  estimateDomCssInkProbe,
  measureCanvasInkMetrics,
  measureDomInkProbe,
  measureKonvaInkProbe,
} from "@/components/editor/overlays/inlineEditor/inlineEditorTextMetrics";
import { roundMetric } from "@/components/editor/overlays/inlineEditor/inlineEditorNumeric";
import { INLINE_LAYOUT_VERSION } from "@/components/editor/overlays/inlineEditor/inlineEditorConstants";
import useInlineTraceBridge from "@/components/editor/textSystem/debug/useInlineTraceBridge";
import { buildInlineTextBoxesPayload } from "@/components/editor/textSystem/debug/buildInlineTextBoxesPayload";
import {
  buildInlineCaretComparisonPayload,
  buildInlineCaretStateSnapshot,
} from "@/components/editor/textSystem/debug/buildInlineCaretComparisonPayload";
import {
  buildInlineTextWithCaretComparisonPayload,
  buildInlineTextWithCaretSnapshot,
} from "@/components/editor/textSystem/debug/buildInlineTextWithCaretComparisonPayload";
import { buildInlineTextInkPositionDiagPayload } from "@/components/editor/textSystem/debug/buildInlineTextInkPositionDiagPayload";

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

function readInlineAlignmentDiagConfig(debugEnabled) {
  if (!debugEnabled || typeof window === "undefined") {
    return {
      enabled: false,
      extended: false,
      compact: true,
    };
  }
  const enabled = parseInlineDiagFlag(window.__INLINE_DIAG_ALIGNMENT, true);
  const extended = parseInlineDiagFlag(window.__INLINE_DIAG_ALIGNMENT_EXTENDED, false);
  const compact = parseInlineDiagFlag(window.__INLINE_DIAG_COMPACT, true);
  return {
    enabled,
    extended,
    compact,
  };
}

function buildCenterSnapshot(rect) {
  const x = Number(rect?.x);
  const width = Number(rect?.width);
  if (!Number.isFinite(x) || !Number.isFinite(width)) return null;
  return {
    x: roundMetric(x),
    width: roundMetric(width),
    centerX: roundMetric(x + width / 2),
  };
}

function buildCenterDelta(fromRect, toRect) {
  const fromX = Number(fromRect?.x);
  const fromW = Number(fromRect?.width);
  const toX = Number(toRect?.x);
  const toW = Number(toRect?.width);
  if (![fromX, fromW, toX, toW].every(Number.isFinite)) return null;
  return {
    centerDx: roundMetric(toX + toW / 2 - (fromX + fromW / 2)),
    widthDw: roundMetric(toW - fromW),
  };
}

function isFiniteRectPayload(rect) {
  if (!rect) return false;
  const x = Number(rect.x);
  const y = Number(rect.y);
  const width = Number(rect.width);
  const height = Number(rect.height);
  return [x, y, width, height].every(Number.isFinite);
}

function isZeroRectPayload(rect) {
  if (!isFiniteRectPayload(rect)) return false;
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

function normalizeProbeRect(rect) {
  if (!isFiniteRectPayload(rect)) return null;
  const width = Number(rect.width);
  const height = Number(rect.height);
  if (width < 0 || height < 0) return null;
  if (isZeroRectPayload(rect)) return null;
  return rect;
}

function toFiniteNumber(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundNullableMetric(value) {
  const numeric = toFiniteNumber(value);
  return numeric === null ? null : roundMetric(numeric);
}

function diffNullableMetric(nextValue, prevValue) {
  const next = toFiniteNumber(nextValue);
  const prev = toFiniteNumber(prevValue);
  if (next === null || prev === null) return null;
  return roundMetric(next - prev);
}

function maxAbsFinite(values = []) {
  const normalized = Array.isArray(values)
    ? values
      .map((value) => toFiniteNumber(value))
      .filter((value) => value !== null)
    : [];
  if (normalized.length === 0) return null;
  return Math.max(...normalized.map((value) => Math.abs(value)));
}

function normalizeFontWeightForCompare(value) {
  const token = String(value || "").trim().toLowerCase();
  if (!token) return null;
  if (token === "normal") return "400";
  if (token === "bold") return "700";
  const numeric = Number(token);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 1000) {
    return String(Math.round(numeric));
  }
  return token;
}

export default function useInlineDebugEmitter({
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
  effectiveInternalContentOffsetPx = 0,
  v2OffsetOneShotPx,
  v2VerticalAuthoritySnapshot,
  fontMetricsRevision,
  fontLoadStatus,
  isPhaseAtomicV2,
  normalizedOverlayEngine,
  nodeProps,
  overlayPhase,
  scaleVisual,
  totalScaleX = null,
  totalScaleY = null,
  domPerceptualScale = null,
  domPerceptualScaleModel = null,
  editorRef,
  editorFrameRef = null,
  contentBoxRef,
  editableHostRef,
  overlaySessionIdRef,
  konvaTextNode = null,
}) {
  const horizontalDiagRef = useRef({
    sessionKey: null,
    eventName: null,
    metrics: null,
  });
  const caretComparisonRef = useRef({
    sessionKey: null,
    beforeCaret: null,
    afterCaret: null,
    emitted: false,
  });
  const textWithCaretComparisonRef = useRef({
    sessionKey: null,
    beforeCaretVisible: null,
    afterCaretVisibleStable: null,
    emitted: false,
  });

  const emitDebug = useCallback((eventName, extra = {}) => {
    if (!DEBUG_MODE) return;
    const diagConfig = readInlineAlignmentDiagConfig(DEBUG_MODE);
    const compactMode = Boolean(diagConfig.compact);
    const essentialEvents = compactMode
      ? new Set([
          "overlay: ready-to-swap",
          "overlay: swap-commit",
          "overlay: after-first-paint",
          "finish: blur",
        ])
      : new Set([
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
    const editorVisualEl = editorFrameRef?.current || editorRef.current || null;
    const overlayEl = editorVisualEl || null;
    const overlayRect = overlayEl?.getBoundingClientRect?.() || null;
    const contentRect = contentBoxRef.current?.getBoundingClientRect?.() || null;
    const editableRect = editableHostRef.current?.getBoundingClientRect?.() || null;
    const editableVisualRect = editorVisualEl?.getBoundingClientRect?.() || null;
    const computedStyle = editorRef.current
      ? window.getComputedStyle(editorRef.current)
      : null;
    const computedVisualStyle = editorVisualEl
      ? window.getComputedStyle(editorVisualEl)
      : computedStyle;
    const fullRangeRect = getFullRangeRect(editorRef.current);
    const selectionInfo = getSelectionRectInEditor(editorRef.current);
    const selectionRectRaw = selectionInfo?.rect || null;
    const selectionRect = normalizeProbeRect(selectionRectRaw);
    const selectionRectDegenerate =
      Boolean(selectionRectRaw) && !selectionRect;
    const selectionApi = (
      typeof window !== "undefined" &&
      typeof window.getSelection === "function"
    )
      ? window.getSelection()
      : null;
    const selectionExists = Boolean(selectionApi && selectionApi.rangeCount > 0);
    const selectionIsCollapsed = selectionExists
      ? Boolean(selectionApi?.isCollapsed)
      : null;
    const selectionState = (() => {
      const inEditor = Boolean(selectionInfo.inEditor);
      const isCollapsed = selectionIsCollapsed === true;
      const geometryReady = Boolean(inEditor && !isCollapsed && selectionRect);
      const geometryEmpty = Boolean(selectionRectDegenerate);
      let geometryReason = null;
      if (!selectionExists) geometryReason = "no-selection";
      else if (!inEditor) geometryReason = "selection-outside-editor";
      else if (isCollapsed) geometryReason = "selection-collapsed";
      else if (geometryEmpty) geometryReason = "selection-rect-empty";
      else if (!selectionRectRaw) geometryReason = "browser-no-usable-geometry";
      else if (geometryReady) geometryReason = "ready";
      else geometryReason = "geometry-unavailable";
      return {
        exists: selectionExists,
        isCollapsed: selectionIsCollapsed,
        inEditor,
        geometryReady,
        geometryEmpty,
        geometryReason,
      };
    })();
    const projectedKonvaRect = projectedKonvaRectBase;
    const projectedKonvaRectRawSnapshot = projectedKonvaRectRaw;
    const inlineTextBoxesPayload = buildInlineTextBoxesPayload({
      konvaNode: konvaTextNode,
      projectedKonvaRect,
      projectedKonvaRectRaw: projectedKonvaRectRawSnapshot,
      domRect: editableVisualRect,
      domElement: editorVisualEl,
      domComputedStyle: computedStyle,
      totalScaleX,
      totalScaleY,
      domPerceptualScale,
      domPerceptualScaleModel,
    });
    console.log(
      `[INLINE_TEXT_BOXES] ${eventName}\n${formatInlineLogPayload(inlineTextBoxesPayload)}`
    );
    const overlayToKonvaDx = overlayRect
      ? overlayRect.x - projectedKonvaRect.x
      : null;
    const overlayToKonvaDy = overlayRect
      ? overlayRect.y - projectedKonvaRect.y
      : null;
    const contentToKonvaDx = contentRect
      ? contentRect.x - projectedKonvaRect.x
      : null;
    const contentToKonvaDy = contentRect
      ? contentRect.y - projectedKonvaRect.y
      : null;
    const fullRangeToContentDx =
      fullRangeRect && contentRect ? fullRangeRect.x - contentRect.x : null;
    const fullRangeToContentDy =
      fullRangeRect && contentRect ? fullRangeRect.y - contentRect.y : null;
    const caretToContentDx =
      selectionInfo.inEditor && selectionRect && contentRect
        ? selectionRect.x - contentRect.x
        : null;
    const caretToContentDy =
      selectionInfo.inEditor && selectionRect && contentRect
        ? selectionRect.y - contentRect.y
        : null;
    const caretProbeRectRaw = getCollapsedCaretProbeRectInEditor(editorRef.current);
    const caretProbeRect = normalizeProbeRect(caretProbeRectRaw);
    const caretProbeRectDegenerate =
      Boolean(caretProbeRectRaw) && !caretProbeRect;
    const caretState = (() => {
      const inEditor = Boolean(selectionInfo.inEditor);
      const isCollapsed = selectionIsCollapsed === true;
      const exists = Boolean(selectionExists && inEditor && isCollapsed);
      const geometryReady = Boolean(exists && caretProbeRect);
      const geometryEmpty = Boolean(caretProbeRectDegenerate);
      let geometryReason = null;
      if (!selectionExists) geometryReason = "no-selection";
      else if (!inEditor) geometryReason = "selection-outside-editor";
      else if (!isCollapsed) geometryReason = "selection-not-collapsed";
      else if (geometryEmpty) geometryReason = "caret-rect-empty";
      else if (!caretProbeRectRaw) geometryReason = "browser-no-usable-geometry";
      else if (geometryReady) geometryReason = "ready";
      else geometryReason = "geometry-unavailable";
      return {
        exists,
        isCollapsed: selectionIsCollapsed,
        inEditor,
        geometryReady,
        geometryEmpty,
        geometryReason,
      };
    })();
    const caretProbeToContentDx =
      caretProbeRect && contentRect ? caretProbeRect.x - contentRect.x : null;
    const caretProbeToContentDy =
      caretProbeRect && contentRect ? caretProbeRect.y - contentRect.y : null;
    const caretProbeHeightPx = caretProbeRect ? caretProbeRect.height : null;
    const isFocused = document.activeElement === editorRef.current;
    const focusClaimed = Boolean(isFocused && selectionInfo.inEditor);
    const selectionGeometryReady = Boolean(selectionState.geometryReady);
    const caretGeometryReady = Boolean(caretState.geometryReady);
    const firstGlyphRect = getFirstGlyphRectInEditor(editorRef.current);
    const lastGlyphRect = getLastGlyphRectInEditor(editorRef.current);
    const textInkRect = getTextInkRectInEditor(editorRef.current);
    const firstGlyphToContentDx =
      firstGlyphRect && contentRect ? firstGlyphRect.x - contentRect.x : null;
    const firstGlyphToContentDy =
      firstGlyphRect && contentRect ? firstGlyphRect.y - contentRect.y : null;
    const firstGlyphHeightPx = firstGlyphRect ? firstGlyphRect.height : null;
    const caretComparisonSessionKey = `${editingId || "none"}::${overlaySessionIdRef.current || "none"}`;
    if (caretComparisonRef.current.sessionKey !== caretComparisonSessionKey) {
      caretComparisonRef.current = {
        sessionKey: caretComparisonSessionKey,
        beforeCaret: null,
        afterCaret: null,
        emitted: false,
      };
    }
    if (textWithCaretComparisonRef.current.sessionKey !== caretComparisonSessionKey) {
      textWithCaretComparisonRef.current = {
        sessionKey: caretComparisonSessionKey,
        beforeCaretVisible: null,
        afterCaretVisibleStable: null,
        emitted: false,
      };
    }
    const textWithCaretSnapshot = buildInlineTextWithCaretSnapshot({
      ts,
      eventName,
      phase: extra?.phase || overlayPhase,
      contentRect,
      editableVisualRect,
      fullRangeRect,
      firstGlyphRect,
      lastGlyphRect,
      textInkRect,
      editorEl: editorRef.current,
    });
    const caretStateSnapshot = buildInlineCaretStateSnapshot({
      ts,
      eventName,
      phase: extra?.phase || overlayPhase,
      contentRect,
      editableVisualRect,
      fullRangeRect,
      firstGlyphRect,
      selectionRect,
      caretRect: caretProbeRect,
      editorEl: editorRef.current,
      computedStyle,
      isFocused,
      focusClaimed,
      selectionInEditor: selectionInfo.inEditor,
      selectionGeometryReady,
      caretGeometryReady,
      selectionState,
      caretState,
    });
    const isBeforeCaretCandidateEvent =
      eventName === "overlay: ready-to-swap" ||
      eventName === "overlay: swap-commit";
    const isAfterCaretCandidateEvent =
      eventName === "overlay: after-first-paint" ||
      eventName === "overlay: post-layout" ||
      eventName === "finish: blur";
    if (isBeforeCaretCandidateEvent && !focusClaimed) {
      caretComparisonRef.current.beforeCaret = caretStateSnapshot;
      caretComparisonRef.current.afterCaret = null;
      caretComparisonRef.current.emitted = false;
      textWithCaretComparisonRef.current.beforeCaretVisible = textWithCaretSnapshot;
      textWithCaretComparisonRef.current.afterCaretVisibleStable = null;
      textWithCaretComparisonRef.current.emitted = false;
    }
    if (
      !caretComparisonRef.current.emitted &&
      caretComparisonRef.current.beforeCaret &&
      isAfterCaretCandidateEvent &&
      focusClaimed
    ) {
      caretComparisonRef.current.afterCaret = caretStateSnapshot;
      const caretComparisonPayload = buildInlineCaretComparisonPayload({
        beforeCaret: caretComparisonRef.current.beforeCaret,
        afterCaret: caretComparisonRef.current.afterCaret,
      });
      console.log(
        `[INLINE_CARET_COMPARISON] ${eventName}\n${formatInlineLogPayload(caretComparisonPayload)}`
      );
      caretComparisonRef.current.emitted = true;
    }
    const caretVisibleNow = Boolean(
      isFocused &&
      selectionInfo.inEditor &&
      selectionIsCollapsed === true
    );
    if (
      !textWithCaretComparisonRef.current.emitted &&
      textWithCaretComparisonRef.current.beforeCaretVisible &&
      isAfterCaretCandidateEvent &&
      caretVisibleNow &&
      editorVisualReady
    ) {
      textWithCaretComparisonRef.current.afterCaretVisibleStable = textWithCaretSnapshot;
      const textWithCaretComparisonPayload = buildInlineTextWithCaretComparisonPayload({
        beforeCaretVisible: textWithCaretComparisonRef.current.beforeCaretVisible,
        afterCaretVisibleStable: textWithCaretComparisonRef.current.afterCaretVisibleStable,
      });
      console.log(
        `[INLINE_TEXT_WITH_CARET_COMPARISON] ${eventName}\n${formatInlineLogPayload(textWithCaretComparisonPayload)}`
      );
      textWithCaretComparisonRef.current.emitted = true;
    }
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
        canvasInkMetrics,
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
    const inlineTextInkPositionDiagPayload = buildInlineTextInkPositionDiagPayload({
      konvaBoxRect: projectedKonvaRect,
      domBoxRect: editableVisualRect || contentRect || overlayRect || null,
      domInkAnchorRect:
        editorRef.current?.getBoundingClientRect?.() ||
        editableVisualRect ||
        contentRect ||
        null,
      konvaInkProbe,
      domInkProbe,
      canvasInkMetrics,
      domTextInkRect: textInkRect,
      fullRangeRect,
      firstGlyphRect,
      lastGlyphRect,
    });
    const domInkAnchorRectForChain =
      editorRef.current?.getBoundingClientRect?.() ||
      editableVisualRect ||
      null;
    console.log(
      `[INLINE_TEXT_INK_POSITION_DIAG] ${eventName}\n${formatInlineLogPayload(inlineTextInkPositionDiagPayload)}`
    );
    const offsetApplicationChainPayload = {
      ts,
      id: editingId || null,
      sessionId: overlaySessionIdRef.current || null,
      eventName,
      phase: extra?.phase || overlayPhase,
      offset: {
        source: domToKonvaOffsetModel?.source || null,
        calculatedModelPx: roundNullableMetric(
          v2VerticalAuthoritySnapshot?.modelOffsetPx ??
          domToKonvaOffsetModel?.modelOffsetPx
        ),
        calculatedVisualPx: roundNullableMetric(
          v2VerticalAuthoritySnapshot?.visualOffsetPx ??
          domToKonvaOffsetModel?.visualOffsetPx
        ),
        externalAppliedPx: roundMetric(Number(effectiveVisualOffsetPx || 0)),
        internalAppliedPx: roundMetric(Number(effectiveInternalContentOffsetPx || 0)),
        combinedAppliedPx: roundMetric(
          Number(effectiveVisualOffsetPx || 0) + Number(effectiveInternalContentOffsetPx || 0)
        ),
        routedToInternal: Boolean(domToKonvaOffsetModel?.externalOffsetRoutedToInternalApplied),
        routedFromPx: roundNullableMetric(
          domToKonvaOffsetModel?.externalOffsetRoutedToInternalFromPx
        ),
        routedToPx: roundNullableMetric(domToKonvaOffsetModel?.externalOffsetRoutedToInternalToPx),
      },
      geometry: {
        konvaBoxY: roundNullableMetric(projectedKonvaRect?.y),
        domExternalBoxY: roundNullableMetric(editableVisualRect?.y),
        domInkAnchorBoxY: roundNullableMetric(domInkAnchorRectForChain?.y),
        geometryDy: roundNullableMetric(
          Number.isFinite(Number(editableVisualRect?.y)) && Number.isFinite(Number(projectedKonvaRect?.y))
            ? Number(editableVisualRect.y) - Number(projectedKonvaRect.y)
            : null
        ),
      },
      ink: {
        konvaTop: inlineTextInkPositionDiagPayload?.konva?.ink?.top ?? null,
        domTop: inlineTextInkPositionDiagPayload?.dom?.ink?.top ?? null,
        konvaBaselineY: inlineTextInkPositionDiagPayload?.konva?.baselineY ?? null,
        domBaselineY: inlineTextInkPositionDiagPayload?.dom?.baselineY ?? null,
      },
      delta: {
        inkTopDelta: inlineTextInkPositionDiagPayload?.delta?.inkTopDelta ?? null,
        baselineDelta: inlineTextInkPositionDiagPayload?.delta?.baselineDelta ?? null,
        inkCenterYDelta: inlineTextInkPositionDiagPayload?.delta?.inkCenterYDelta ?? null,
      },
    };
    console.log(
      `[INLINE_OFFSET_APPLICATION_CHAIN] ${eventName}\n${formatInlineLogPayload(offsetApplicationChainPayload)}`
    );
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
    const firstGlyphX = toFiniteNumber(firstGlyphRect?.x);
    const projectedKonvaX = toFiniteNumber(projectedKonvaRect?.x);
    const domProbeHostWidthPx = toFiniteNumber(domInkProbe?.hostWidthPx);
    const konvaProbeHostWidthPx = toFiniteNumber(konvaInkProbe?.hostWidthPx);
    const domProbeGlyphWidthPx = toFiniteNumber(
      domInkProbe?.glyphInkWidthPx ?? domInkProbe?.glyphWidthPx
    );
    const konvaProbeGlyphWidthPx = toFiniteNumber(konvaInkProbe?.glyphWidthPx);
    const domProbeGlyphLeftInsetPx = toFiniteNumber(
      domInkProbe?.glyphInkLeftInsetPx ?? domInkProbe?.glyphLeftInsetPx
    );
    const konvaProbeGlyphLeftInsetPx = toFiniteNumber(konvaInkProbe?.glyphLeftInsetPx);
    const domProbeGlyphRightInsetPx = toFiniteNumber(
      domInkProbe?.glyphInkRightInsetPx ?? domInkProbe?.glyphRightInsetPx
    );
    const konvaProbeGlyphRightInsetPx = toFiniteNumber(konvaInkProbe?.glyphRightInsetPx);
    const firstGlyphToKonvaDx =
      firstGlyphX !== null && projectedKonvaX !== null
        ? firstGlyphX - projectedKonvaX
        : null;
    const probeHostWidthDeltaPx =
      domProbeHostWidthPx !== null && konvaProbeHostWidthPx !== null
        ? domProbeHostWidthPx - konvaProbeHostWidthPx
        : null;
    const probeGlyphWidthDeltaPx =
      domProbeGlyphWidthPx !== null && konvaProbeGlyphWidthPx !== null
        ? domProbeGlyphWidthPx - konvaProbeGlyphWidthPx
        : null;
    const probeGlyphLeftInsetDeltaPx =
      domProbeGlyphLeftInsetPx !== null && konvaProbeGlyphLeftInsetPx !== null
        ? domProbeGlyphLeftInsetPx - konvaProbeGlyphLeftInsetPx
        : null;
    const probeGlyphRightInsetDeltaPx =
      domProbeGlyphRightInsetPx !== null && konvaProbeGlyphRightInsetPx !== null
        ? domProbeGlyphRightInsetPx - konvaProbeGlyphRightInsetPx
        : null;
    const rendererParityThresholdsPx = {
      overlayToKonvaDx: 0.05,
      firstGlyphToKonvaDx: 0.05,
      probeHostWidthDeltaPx: 0.25,
      probeGlyphWidthDeltaPx: 1,
      probeGlyphLeftInsetDeltaPx: 1,
      probeGlyphRightInsetDeltaPx: 1,
    };
    const rendererParityComparable = {
      overlayToKonvaDx: roundNullableMetric(overlayToKonvaDx),
      firstGlyphToKonvaDx: roundNullableMetric(firstGlyphToKonvaDx),
      probeHostWidthDeltaPx: roundNullableMetric(probeHostWidthDeltaPx),
      probeGlyphWidthDeltaPx: roundNullableMetric(probeGlyphWidthDeltaPx),
      probeGlyphLeftInsetDeltaPx: roundNullableMetric(probeGlyphLeftInsetDeltaPx),
      probeGlyphRightInsetDeltaPx: roundNullableMetric(probeGlyphRightInsetDeltaPx),
    };
    const rendererParityKeysLayout = [
      "overlayToKonvaDx",
      "firstGlyphToKonvaDx",
      "probeHostWidthDeltaPx",
    ];
    const rendererParityKeysInk = [
      "probeGlyphWidthDeltaPx",
      "probeGlyphLeftInsetDeltaPx",
      "probeGlyphRightInsetDeltaPx",
    ];
    const isRendererParityBreached = (key) => {
      const comparableValue = toFiniteNumber(rendererParityComparable[key]);
      const thresholdValue = toFiniteNumber(rendererParityThresholdsPx[key]);
      if (comparableValue === null || thresholdValue === null) return false;
      return Math.abs(comparableValue) > thresholdValue;
    };
    const rendererParityBreached = {
      overlayToKonvaDx: isRendererParityBreached("overlayToKonvaDx"),
      firstGlyphToKonvaDx: isRendererParityBreached("firstGlyphToKonvaDx"),
      probeHostWidthDeltaPx: isRendererParityBreached("probeHostWidthDeltaPx"),
      probeGlyphWidthDeltaPx: isRendererParityBreached("probeGlyphWidthDeltaPx"),
      probeGlyphLeftInsetDeltaPx: isRendererParityBreached("probeGlyphLeftInsetDeltaPx"),
      probeGlyphRightInsetDeltaPx: isRendererParityBreached("probeGlyphRightInsetDeltaPx"),
    };
    const rendererParityLayoutBreached = {
      overlayToKonvaDx: rendererParityBreached.overlayToKonvaDx,
      firstGlyphToKonvaDx: rendererParityBreached.firstGlyphToKonvaDx,
      probeHostWidthDeltaPx: rendererParityBreached.probeHostWidthDeltaPx,
    };
    const rendererParityInkBreached = {
      probeGlyphWidthDeltaPx: rendererParityBreached.probeGlyphWidthDeltaPx,
      probeGlyphLeftInsetDeltaPx: rendererParityBreached.probeGlyphLeftInsetDeltaPx,
      probeGlyphRightInsetDeltaPx: rendererParityBreached.probeGlyphRightInsetDeltaPx,
    };
    const rendererParityLayoutMaxAbsDeltaPx = roundNullableMetric(
      maxAbsFinite(rendererParityKeysLayout.map((key) => rendererParityComparable[key]))
    );
    const rendererParityInkMaxAbsDeltaPx = roundNullableMetric(
      maxAbsFinite(rendererParityKeysInk.map((key) => rendererParityComparable[key]))
    );
    const resolveParityStatus = (breachedMap, maxAbsDeltaPx) => {
      if (Object.values(breachedMap).some(Boolean)) return "mismatch";
      const maxAbs = toFiniteNumber(maxAbsDeltaPx);
      return maxAbs !== null && maxAbs > 0.01 ? "subpixel" : "aligned";
    };
    const rendererParityLayoutStatus = resolveParityStatus(
      rendererParityLayoutBreached,
      rendererParityLayoutMaxAbsDeltaPx
    );
    const rendererParityInkStatus = resolveParityStatus(
      rendererParityInkBreached,
      rendererParityInkMaxAbsDeltaPx
    );
    // Estado principal enfocado en desplazamiento geometrico (handoff/layout).
    const rendererParityStatus = rendererParityLayoutStatus;
    const rendererParityMaxAbsDeltaPx = rendererParityLayoutMaxAbsDeltaPx;
    const rendererParityLikelySource = (() => {
      if (rendererParityLayoutStatus === "mismatch") return "layout-rasterization";
      if (rendererParityLayoutStatus === "subpixel") return "subpixel-rasterization";
      return "none";
    })();

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
      isFocused,
      focusClaimed,
      projectedKonvaRect,
      projectedKonvaRectRaw: projectedKonvaRectRawSnapshot,
      lockedCenterStageX: roundMetric(Number(lockedCenterStageX)),
      centerViewportX: roundMetric(Number(centerViewportX)),
      overlayToKonvaDx,
      overlayToKonvaDy,
      contentToKonvaDx,
      contentToKonvaDy,
      fullRangeRect,
      selectionInEditor: selectionInfo.inEditor,
      selectionRect,
      selectionRectRaw,
      selectionRectDegenerate,
      selectionGeometryReady,
      fullRangeToContentDx,
      fullRangeToContentDy,
      caretToContentDx,
      caretToContentDy,
      caretProbeRect,
      caretProbeRectRaw,
      caretProbeRectDegenerate,
      caretGeometryReady,
      caretProbeToContentDx,
      caretProbeToContentDy,
      caretProbeHeightPx,
      firstGlyphRect,
      firstGlyphToContentDx,
      firstGlyphToContentDy,
      firstGlyphHeightPx,
      fontStyleRawNode: nodeProps.fontStyleRaw ?? null,
      fontWeightRawNode: nodeProps.fontWeightRaw ?? null,
      fontStyleNormalizedNode: nodeProps.fontStyle || null,
      fontWeightNormalizedNode: nodeProps.fontWeight || null,
      computedFontSize: computedStyle?.fontSize ?? null,
      computedFontFamily: computedStyle?.fontFamily ?? null,
      computedFontWeight: computedStyle?.fontWeight ?? null,
      computedFontStyle: computedStyle?.fontStyle ?? null,
      computedLineHeight: computedStyle?.lineHeight ?? null,
      computedFontOpticalSizing: computedStyle?.fontOpticalSizing ?? null,
      computedPaddingTop: computedStyle?.paddingTop ?? null,
      computedPaddingBottom: computedStyle?.paddingBottom ?? null,
      computedEditorLeftPx: roundNullableMetric(Number.parseFloat(computedVisualStyle?.left)),
      computedEditorTopPx: roundNullableMetric(Number.parseFloat(computedVisualStyle?.top)),
      computedEditorInnerTopPx: roundNullableMetric(Number.parseFloat(computedStyle?.top)),
      computedEditorTransform: computedVisualStyle?.transform ?? null,
      computedBorderTop: computedStyle?.borderTopWidth ?? null,
      computedBorderBottom: computedStyle?.borderBottomWidth ?? null,
      domPerceptualScale: roundNullableMetric(domPerceptualScale),
      domPerceptualScaleSource: domPerceptualScaleModel?.source || null,
      domPerceptualScaleWidthRatio: roundNullableMetric(domPerceptualScaleModel?.widthRatio),
      domPerceptualScaleDomProbeWidthPx: roundNullableMetric(
        domPerceptualScaleModel?.domProbeWidthPx
      ),
      domPerceptualScaleCanvasProbeWidthPx: roundNullableMetric(
        domPerceptualScaleModel?.canvasProbeWidthPx
      ),
      domPerceptualScaleCanvasProbeInkWidthPx: roundNullableMetric(
        domPerceptualScaleModel?.canvasProbeInkWidthPx
      ),
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
      domToKonvaInternalContentOffsetPx: roundMetric(
        Number(
          domToKonvaOffsetModel?.internalContentOffsetPx ??
          effectiveInternalContentOffsetPx ??
          0
        )
      ),
      domToKonvaVisualOffsetOneShotPx: roundMetric(Number(v2OffsetOneShotPx || 0)),
      authorityRevision: Number.isFinite(Number(v2VerticalAuthoritySnapshot?.revision))
        ? Number(v2VerticalAuthoritySnapshot.revision)
        : (Number.isFinite(Number(domToKonvaOffsetModel?.revision))
          ? Number(domToKonvaOffsetModel.revision)
          : null),
      authorityFrozen: Boolean(
        v2VerticalAuthoritySnapshot?.frozen || domToKonvaOffsetModel?.frozen
      ),
      authoritySource: v2VerticalAuthoritySnapshot?.source || domToKonvaOffsetModel?.source || null,
      authoritySpace:
        v2VerticalAuthoritySnapshot?.coordinateSpace ||
        domToKonvaOffsetModel?.coordinateSpace ||
        "content-ink",
      modelOffsetPx: roundMetric(
        Number(v2VerticalAuthoritySnapshot?.modelOffsetPx ?? domToKonvaOffsetModel?.modelOffsetPx)
      ),
      visualOffsetPx: roundMetric(
        Number(v2VerticalAuthoritySnapshot?.visualOffsetPx ?? domToKonvaOffsetModel?.visualOffsetPx)
      ),
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
    if (!compactMode) {
      console.log(`[INLINE][POS] position:konva-vs-dom\n${formatInlineLogPayload(positionSnapshot)}`);
    }

    const domEditableVisualDyRaw =
      editableVisualRect && contentRect
        ? Number(editableVisualRect.y) - Number(contentRect.y)
        : null;
    const domEditableVisualDy = Number.isFinite(domEditableVisualDyRaw)
      ? roundMetric(domEditableVisualDyRaw)
      : null;
    const rawToBaseCenter = buildCenterDelta(
      projectedKonvaRectRawSnapshot,
      projectedKonvaRect
    );
    const rawToOverlayCenter = buildCenterDelta(
      projectedKonvaRectRawSnapshot,
      overlayRect
    );
    const baseToOverlayCenter = buildCenterDelta(projectedKonvaRect, overlayRect);
    const overlayToContentCenter = buildCenterDelta(overlayRect, contentRect);
    const overlayToEditorCenter = buildCenterDelta(overlayRect, editableVisualRect);
    const contentToEditorCenter = buildCenterDelta(contentRect, editableVisualRect);
    const rawToBaseLeftDx =
      Number.isFinite(Number(projectedKonvaRectRawSnapshot?.x)) &&
      Number.isFinite(Number(projectedKonvaRect?.x))
        ? Number(projectedKonvaRect?.x) - Number(projectedKonvaRectRawSnapshot?.x)
        : null;
    const rawToBaseWidthDw =
      Number.isFinite(Number(projectedKonvaRectRawSnapshot?.width)) &&
      Number.isFinite(Number(projectedKonvaRect?.width))
        ? Number(projectedKonvaRect?.width) - Number(projectedKonvaRectRawSnapshot?.width)
        : null;
    const rawToOverlayLeftDx =
      Number.isFinite(Number(projectedKonvaRectRawSnapshot?.x)) &&
      Number.isFinite(Number(overlayRect?.x))
        ? Number(overlayRect?.x) - Number(projectedKonvaRectRawSnapshot?.x)
        : null;
    const rawToOverlayWidthDw =
      Number.isFinite(Number(projectedKonvaRectRawSnapshot?.width)) &&
      Number.isFinite(Number(overlayRect?.width))
        ? Number(overlayRect?.width) - Number(projectedKonvaRectRawSnapshot?.width)
        : null;

    const overlayToContentDx =
      overlayRect && contentRect
        ? Number(contentRect.x) - Number(overlayRect.x)
        : null;
    const overlayToEditorDx =
      overlayRect && editableVisualRect
        ? Number(editableVisualRect.x) - Number(overlayRect.x)
        : null;
    const contentToEditorDx =
      contentRect && editableVisualRect
        ? Number(editableVisualRect.x) - Number(contentRect.x)
        : null;

    const contentClientWidthRaw = Number(editorRef.current?.clientWidth);
    const contentScrollWidthRaw = Number(editorRef.current?.scrollWidth);
    const contentOverflowXRaw =
      Number.isFinite(contentScrollWidthRaw) && Number.isFinite(contentClientWidthRaw)
        ? contentScrollWidthRaw - contentClientWidthRaw
        : null;

    const horizontalSessionId = overlaySessionIdRef.current || null;
    const horizontalSessionKey = `${editingId || "__no-id__"}::${horizontalSessionId || "__no-session__"}`;
    const horizontalMetricsCurrent = {
      overlayX: Number(overlayRect?.x),
      overlayWidth: Number(overlayRect?.width),
      contentX: Number(contentRect?.x),
      contentWidth: Number(contentRect?.width),
      editableVisualX: Number(editableVisualRect?.x),
      editableVisualWidth: Number(editableVisualRect?.width),
      overlayLeftComputedPx: Number(left),
      centeredEditorLeftPx: Number(centeredEditorLeftPx),
      centeredEditorWidthPx: Number(centeredEditorWidthPx),
      contentClientWidth: contentClientWidthRaw,
      contentScrollWidth: contentScrollWidthRaw,
      contentOverflowX: contentOverflowXRaw,
    };
    const previousHorizontalEntry =
      horizontalDiagRef.current?.sessionKey === horizontalSessionKey
        ? horizontalDiagRef.current
        : null;
    const previousHorizontalMetrics = previousHorizontalEntry?.metrics || null;
    const horizontalShiftFromPrev = previousHorizontalMetrics
      ? {
          fromEvent: previousHorizontalEntry?.eventName || null,
          overlayDx: diffNullableMetric(
            horizontalMetricsCurrent.overlayX,
            previousHorizontalMetrics.overlayX
          ),
          contentDx: diffNullableMetric(
            horizontalMetricsCurrent.contentX,
            previousHorizontalMetrics.contentX
          ),
          editableVisualDx: diffNullableMetric(
            horizontalMetricsCurrent.editableVisualX,
            previousHorizontalMetrics.editableVisualX
          ),
          overlayWidthDw: diffNullableMetric(
            horizontalMetricsCurrent.overlayWidth,
            previousHorizontalMetrics.overlayWidth
          ),
          editableVisualWidthDw: diffNullableMetric(
            horizontalMetricsCurrent.editableVisualWidth,
            previousHorizontalMetrics.editableVisualWidth
          ),
          centeredEditorLeftDx: diffNullableMetric(
            horizontalMetricsCurrent.centeredEditorLeftPx,
            previousHorizontalMetrics.centeredEditorLeftPx
          ),
          centeredEditorWidthDw: diffNullableMetric(
            horizontalMetricsCurrent.centeredEditorWidthPx,
            previousHorizontalMetrics.centeredEditorWidthPx
          ),
          contentOverflowXDx: diffNullableMetric(
            horizontalMetricsCurrent.contentOverflowX,
            previousHorizontalMetrics.contentOverflowX
          ),
          overlayToEditorDx: diffNullableMetric(
            horizontalMetricsCurrent.editableVisualX - horizontalMetricsCurrent.overlayX,
            previousHorizontalMetrics.editableVisualX - previousHorizontalMetrics.overlayX
          ),
        }
      : null;
    horizontalDiagRef.current = {
      sessionKey: horizontalSessionKey,
      eventName,
      metrics: horizontalMetricsCurrent,
    };

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
    if (!compactMode) {
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
      console.log(`[INLINE][ALIGN] glyph-top-alignment\n${formatInlineLogPayload(alignSnapshot)}`);
      const body = formatInlineLogPayload(payload);
      console.log(`[INLINE][${ts}] ${eventName}\n${body}`);
    } else {
      const compactPayload = {
        ts,
        id: editingId || null,
        sessionId: overlaySessionIdRef.current || null,
        eventName,
        phase: payload.phase || eventName,
        overlayEngine: normalizedOverlayEngine,
        geometry: positionSnapshot.delta || null,
        horizontal: {
          x: {
            konvaRawX: roundNullableMetric(projectedKonvaRectRawSnapshot?.x),
            konvaBaseX: roundNullableMetric(projectedKonvaRect?.x),
            overlayX: roundNullableMetric(overlayRect?.x),
            contentX: roundNullableMetric(contentRect?.x),
            editableVisualX: roundNullableMetric(editableVisualRect?.x),
            fullRangeX: roundNullableMetric(fullRangeRect?.x),
            selectionX: roundNullableMetric(selectionRect?.x),
            caretProbeX: roundNullableMetric(caretProbeRect?.x),
            firstGlyphX: roundNullableMetric(firstGlyphRect?.x),
          },
          width: {
            projectedWidthPx: roundNullableMetric(projectedKonvaRect?.width),
            overlayWidthPx: roundNullableMetric(overlayRect?.width),
            contentWidthPx: roundNullableMetric(contentRect?.width),
            editableVisualWidthPx: roundNullableMetric(editableVisualRect?.width),
            measuredOverlayWidthPx: roundNullableMetric(measuredOverlayWidthPx),
            syncedOverlayWidthPx: roundNullableMetric(resolvedOverlayWidthPx),
            centeredEditorWidthPx: roundNullableMetric(centeredEditorWidthPx),
            contentClientWidthPx: roundNullableMetric(contentClientWidthRaw),
            contentScrollWidthPx: roundNullableMetric(contentScrollWidthRaw),
            contentOverflowXPx: roundNullableMetric(contentOverflowXRaw),
          },
          local: {
            overlayLeftComputedPx: roundNullableMetric(left),
            centeredEditorLeftPx: roundNullableMetric(centeredEditorLeftPx),
            overlayToContentDx: roundNullableMetric(overlayToContentDx),
            overlayToEditorDx: roundNullableMetric(overlayToEditorDx),
            contentToEditorDx: roundNullableMetric(contentToEditorDx),
            rawToBaseLeftDx: roundNullableMetric(rawToBaseLeftDx),
            rawToBaseWidthDw: roundNullableMetric(rawToBaseWidthDw),
            rawToOverlayLeftDx: roundNullableMetric(rawToOverlayLeftDx),
            rawToOverlayWidthDw: roundNullableMetric(rawToOverlayWidthDw),
            rawToBaseCenterDx: rawToBaseCenter?.centerDx ?? null,
            rawToOverlayCenterDx: rawToOverlayCenter?.centerDx ?? null,
            baseToOverlayCenterDx: baseToOverlayCenter?.centerDx ?? null,
            overlayToContentCenterDx: overlayToContentCenter?.centerDx ?? null,
            overlayToEditorCenterDx: overlayToEditorCenter?.centerDx ?? null,
            contentToEditorCenterDx: contentToEditorCenter?.centerDx ?? null,
          },
          caret: {
            fullRangeToContentDx: roundNullableMetric(fullRangeToContentDx),
            selectionToContentDx: roundNullableMetric(caretToContentDx),
            caretProbeToContentDx: roundNullableMetric(caretProbeToContentDx),
            firstGlyphToContentDx: roundNullableMetric(firstGlyphToContentDx),
          },
          shiftFromPrev: horizontalShiftFromPrev,
        },
        inkX: {
          comparable: rendererParityComparable,
          probes: {
            domProbeHostWidthPx: roundNullableMetric(domInkProbe?.hostWidthPx),
            konvaProbeHostWidthPx: roundNullableMetric(konvaInkProbe?.hostWidthPx),
            domProbeGlyphWidthPx: roundNullableMetric(
              domInkProbe?.glyphInkWidthPx ?? domInkProbe?.glyphWidthPx
            ),
            domProbeGlyphInkWidthPx: roundNullableMetric(domInkProbe?.glyphInkWidthPx),
            konvaProbeGlyphWidthPx: roundNullableMetric(konvaInkProbe?.glyphWidthPx),
            domProbeGlyphLeftInsetPx: roundNullableMetric(
              domInkProbe?.glyphInkLeftInsetPx ?? domInkProbe?.glyphLeftInsetPx
            ),
            domProbeGlyphInkLeftInsetPx: roundNullableMetric(domInkProbe?.glyphInkLeftInsetPx),
            konvaProbeGlyphLeftInsetPx: roundNullableMetric(konvaInkProbe?.glyphLeftInsetPx),
            domProbeGlyphRightInsetPx: roundNullableMetric(
              domInkProbe?.glyphInkRightInsetPx ?? domInkProbe?.glyphRightInsetPx
            ),
            domProbeGlyphInkRightInsetPx: roundNullableMetric(domInkProbe?.glyphInkRightInsetPx),
            konvaProbeGlyphRightInsetPx: roundNullableMetric(konvaInkProbe?.glyphRightInsetPx),
            domProbeGlyphInkSource: domInkProbe?.glyphInkSource || null,
            canvasActualInkWidthPx: roundNullableMetric(canvasInkMetrics?.actualInkWidthPx),
            canvasAdvanceWidthPx: roundNullableMetric(canvasInkMetrics?.advanceWidthPx),
            canvasAdvanceToInkLeftInsetPx: roundNullableMetric(
              canvasInkMetrics?.advanceToInkLeftInsetPx
            ),
            canvasAdvanceToInkRightInsetPx: roundNullableMetric(
              canvasInkMetrics?.advanceToInkRightInsetPx
            ),
          },
          rendererParity: {
            status: rendererParityStatus,
            likelySource: rendererParityLikelySource,
            maxAbsComparableDeltaPx: rendererParityMaxAbsDeltaPx,
            thresholdsPx: rendererParityThresholdsPx,
            breached: rendererParityBreached,
            layout: {
              status: rendererParityLayoutStatus,
              maxAbsComparableDeltaPx: rendererParityLayoutMaxAbsDeltaPx,
              breached: rendererParityLayoutBreached,
            },
            ink: {
              status: rendererParityInkStatus,
              likelySource:
                rendererParityInkStatus === "mismatch"
                  ? "renderer-ink-rasterization"
                  : (
                    rendererParityInkStatus === "subpixel"
                      ? "subpixel-rasterization"
                      : "none"
                  ),
              maxAbsComparableDeltaPx: rendererParityInkMaxAbsDeltaPx,
              breached: rendererParityInkBreached,
            },
          },
        },
        fontParity: {
          node: {
            rawFontStyle: payload.fontStyleRawNode,
            rawFontWeight: payload.fontWeightRawNode,
            normalizedFontStyle: payload.fontStyleNormalizedNode,
            normalizedFontWeight: payload.fontWeightNormalizedNode,
          },
          computed: {
            fontFamily: payload.computedFontFamily,
            fontStyle: payload.computedFontStyle,
            fontWeight: payload.computedFontWeight,
            fontSize: payload.computedFontSize,
            lineHeight: payload.computedLineHeight,
            domPerceptualScale: payload.domPerceptualScale,
            domPerceptualScaleSource: payload.domPerceptualScaleSource,
            domPerceptualScaleWidthRatio: payload.domPerceptualScaleWidthRatio,
            domPerceptualScaleDomProbeWidthPx: payload.domPerceptualScaleDomProbeWidthPx,
            domPerceptualScaleCanvasProbeWidthPx: payload.domPerceptualScaleCanvasProbeWidthPx,
            domPerceptualScaleCanvasProbeInkWidthPx:
              payload.domPerceptualScaleCanvasProbeInkWidthPx,
            editorTopPx: payload.computedEditorTopPx,
            editorInnerTopPx: payload.computedEditorInnerTopPx,
            editorTransform: payload.computedEditorTransform,
            fontOpticalSizing: payload.computedFontOpticalSizing,
            textRendering: computedStyle?.textRendering ?? null,
            fontKerning: computedStyle?.fontKerning ?? null,
            fontVariantLigatures: computedStyle?.fontVariantLigatures ?? null,
            fontFeatureSettings: computedStyle?.fontFeatureSettings ?? null,
            fontSynthesis: computedStyle?.fontSynthesis ?? null,
            webkitFontSmoothing: computedStyle?.webkitFontSmoothing ?? null,
            mozOsxFontSmoothing: computedStyle?.mozOsxFontSmoothing ?? null,
          },
          compare: {
            weightNodeVsComputed:
              (() => {
                const normalizedNode = normalizeFontWeightForCompare(
                  payload.fontWeightNormalizedNode
                );
                const normalizedComputed = normalizeFontWeightForCompare(
                  payload.computedFontWeight
                );
                if (!normalizedNode || !normalizedComputed) return null;
                return normalizedNode === normalizedComputed ? "match" : "mismatch";
              })(),
            styleNodeVsComputed:
              (() => {
                const nodeStyle = String(payload.fontStyleNormalizedNode || "")
                  .trim()
                  .toLowerCase();
                const computedStyleToken = String(payload.computedFontStyle || "")
                  .trim()
                  .toLowerCase();
                if (!nodeStyle || !computedStyleToken) return null;
                return nodeStyle === computedStyleToken ? "match" : "mismatch";
              })(),
          },
        },
        focus: {
          isFocused: payload.isFocused,
          focusClaimed: payload.focusClaimed,
          selectionReady: payload.selectionGeometryReady,
          caretReady: payload.caretGeometryReady,
        },
        offset: {
          source: payload.authoritySource,
          revision: payload.authorityRevision,
          frozen: payload.authorityFrozen,
          space: payload.authoritySpace,
          modelPx: payload.modelOffsetPx,
          visualPx: payload.visualOffsetPx,
          appliedPx: roundMetric(Number(effectiveVisualOffsetPx || 0)),
          internalContentPx: roundMetric(Number(effectiveInternalContentOffsetPx || 0)),
          appliedPxWithInternal: roundMetric(
            Number(effectiveVisualOffsetPx || 0) + Number(effectiveInternalContentOffsetPx || 0)
          ),
          domVisualDy: domEditableVisualDy,
          domSourceDeltaPx: roundMetric(Number(domToKonvaOffsetModel?.domSourceDeltaPx)),
          domSourceLimitPx: roundMetric(
            Number(domToKonvaOffsetModel?.domSourceDivergenceLimitPx)
          ),
          domCssReliable: Boolean(domToKonvaOffsetModel?.domCssReliable),
          liveFallbackReliable: Boolean(domToKonvaOffsetModel?.liveFallbackReliable),
          liveSampleCount: Number(domToKonvaOffsetModel?.liveSampleCount || 0),
          domCssRawOffsetPx: roundMetric(Number(domToKonvaOffsetModel?.domCssRawOffsetPx)),
          domCssInConflict: Boolean(domToKonvaOffsetModel?.domCssInConflict),
          fontFamilyRaw: domToKonvaOffsetModel?.fontFamilyRaw || null,
          fontFamilyNormalizedForNudge:
            domToKonvaOffsetModel?.fontFamilyNormalizedForNudge || null,
          preferLiveForLargeCssOffset: Boolean(
            domToKonvaOffsetModel?.preferLiveForLargeCssOffset
          ),
          largeStableOffsetLimitPx: roundMetric(
            Number(domToKonvaOffsetModel?.largeStableOffsetLimitPx)
          ),
          largeStableOffsetBaseLimitPx: roundMetric(
            Number(domToKonvaOffsetModel?.largeStableOffsetBaseLimitPx)
          ),
          largeStableOffsetFontUnavailableCapPx: roundMetric(
            Number(domToKonvaOffsetModel?.largeStableOffsetFontUnavailableCapPx)
          ),
          largeStableOffsetStrictCapPx: roundMetric(
            Number(domToKonvaOffsetModel?.largeStableOffsetStrictCapPx)
          ),
          largeStableOffsetStrictCapApplied: Boolean(
            domToKonvaOffsetModel?.largeStableOffsetStrictCapApplied
          ),
          largeStableOffsetFontSpecificCapPx: roundMetric(
            Number(domToKonvaOffsetModel?.largeStableOffsetFontSpecificCapPx)
          ),
          largeStableOffsetFontSpecificCapApplied: Boolean(
            domToKonvaOffsetModel?.largeStableOffsetFontSpecificCapApplied
          ),
          largeStableOffsetFontSpecificZeroDriftApplied: Boolean(
            domToKonvaOffsetModel?.largeStableOffsetFontSpecificZeroDriftApplied
          ),
          largeStableOffsetFontSpecificPerceptualNudgePx: roundNullableMetric(
            domToKonvaOffsetModel?.largeStableOffsetFontSpecificPerceptualNudgePx
          ),
          largeStableOffsetFontSpecificPerceptualNudgeSource:
            domToKonvaOffsetModel?.largeStableOffsetFontSpecificPerceptualNudgeSource || null,
          largeStableOffsetFontSpecificPerceptualNudgeMode:
            domToKonvaOffsetModel?.largeStableOffsetFontSpecificPerceptualNudgeMode || null,
          largeStableOffsetFontSpecificPerceptualNudgeApplied: Boolean(
            domToKonvaOffsetModel?.largeStableOffsetFontSpecificPerceptualNudgeApplied
          ),
          largeStableOffsetFontSpecificPerceptualNudgeAppliedAs:
            domToKonvaOffsetModel?.largeStableOffsetFontSpecificPerceptualNudgeAppliedAs || null,
          fontLoadAvailable:
            typeof domToKonvaOffsetModel?.fontLoadAvailable === "boolean"
              ? domToKonvaOffsetModel.fontLoadAvailable
              : null,
          largeStableOffsetDampened: Boolean(
            domToKonvaOffsetModel?.largeStableOffsetDampened
          ),
          largeStableOffsetDampenedFromPx: roundNullableMetric(
            domToKonvaOffsetModel?.largeStableOffsetDampenedFromPx
          ),
          largeStableOffsetDampenedToPx: roundNullableMetric(
            domToKonvaOffsetModel?.largeStableOffsetDampenedToPx
          ),
          largeStableOffsetFinalAppliedPx: roundNullableMetric(
            domToKonvaOffsetModel?.largeStableOffsetFinalAppliedPx
          ),
          severeLiveDisagreementGuardApplied: Boolean(
            domToKonvaOffsetModel?.severeLiveDisagreementGuardApplied
          ),
          severeLiveDisagreementGuardFromPx: roundNullableMetric(
            domToKonvaOffsetModel?.severeLiveDisagreementGuardFromPx
          ),
          severeLiveDisagreementGuardToPx: roundNullableMetric(
            domToKonvaOffsetModel?.severeLiveDisagreementGuardToPx
          ),
          externalOffsetRoutedToInternalApplied: Boolean(
            domToKonvaOffsetModel?.externalOffsetRoutedToInternalApplied
          ),
          externalOffsetRoutedToInternalFromPx: roundNullableMetric(
            domToKonvaOffsetModel?.externalOffsetRoutedToInternalFromPx
          ),
          externalOffsetRoutedToInternalToPx: roundNullableMetric(
            domToKonvaOffsetModel?.externalOffsetRoutedToInternalToPx
          ),
          largeStableOffsetFinalAppliedWithPerceptualNudgePx: roundNullableMetric(
            domToKonvaOffsetModel?.largeStableOffsetFinalAppliedWithPerceptualNudgePx
          ),
          largeStableOffsetPolicyVersion:
            domToKonvaOffsetModel?.largeStableOffsetPolicyVersion || null,
          severeDomSourceDisagreement: Boolean(
            domToKonvaOffsetModel?.severeDomSourceDisagreement
          ),
          preferDomCssOnDisagreement: Boolean(
            domToKonvaOffsetModel?.preferDomCssOnDisagreement
          ),
          atReadyToSwap: roundMetric(Number(payload?.offsetAtReadyToSwap)),
          atSwapCommit: roundMetric(Number(payload?.offsetAtSwapCommit)),
          atFirstPaint: roundMetric(Number(payload?.offsetAtFirstPaint)),
          invariantOffsetAtomicPass: payload?.invariantOffsetAtomicPass ?? null,
        },
      };
      console.log(
        `[INLINE][DIAG] alignment-compact\n${formatInlineLogPayload(compactPayload)}`
      );
    }
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
      overlayToEditorDx: roundNullableMetric(overlayToEditorDx),
      overlayToContentDx: roundNullableMetric(overlayToContentDx),
      contentToEditorDx: roundNullableMetric(contentToEditorDx),
      centeredEditorLeftPx: roundNullableMetric(centeredEditorLeftPx),
      centeredEditorWidthPx: roundNullableMetric(centeredEditorWidthPx),
      contentOverflowXPx: roundNullableMetric(contentOverflowXRaw),
      editorDxFromPrev: horizontalShiftFromPrev?.editableVisualDx ?? null,
      overlayDxFromPrev: horizontalShiftFromPrev?.overlayDx ?? null,
      overlayToEditorDxFromPrev: horizontalShiftFromPrev?.overlayToEditorDx ?? null,
      rendererParityStatus,
      rendererParityLikelySource,
      rendererParityMaxAbsDeltaPx,
      rendererParityLayoutStatus,
      rendererParityLayoutMaxAbsDeltaPx,
      rendererParityInkStatus,
      rendererParityInkMaxAbsDeltaPx,
      firstGlyphToKonvaDx: rendererParityComparable.firstGlyphToKonvaDx,
      probeHostWidthDeltaPx: rendererParityComparable.probeHostWidthDeltaPx,
      probeGlyphWidthDeltaPx: rendererParityComparable.probeGlyphWidthDeltaPx,
      probeGlyphLeftInsetDeltaPx: rendererParityComparable.probeGlyphLeftInsetDeltaPx,
      probeGlyphRightInsetDeltaPx: rendererParityComparable.probeGlyphRightInsetDeltaPx,
      offsetYApplied: roundMetric(Number(domToKonvaVisualOffsetPx || 0)),
      offsetYResolved: roundMetric(Number(effectiveVisualOffsetPx || 0)),
      offsetYInternal: roundMetric(Number(effectiveInternalContentOffsetPx || 0)),
      offsetYResolvedWithInternal: roundMetric(
        Number(effectiveVisualOffsetPx || 0) + Number(effectiveInternalContentOffsetPx || 0)
      ),
      domVisualDy: roundMetric(domEditableVisualDy),
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

    if (diagConfig.enabled && !compactMode) {
      const defaultDiagEvents = new Set([
        "overlay: before-show",
        "overlay: after-first-paint",
        "overlay: post-layout",
      ]);
      const extendedDiagEvents = new Set([
        "overlay: ready-to-swap",
        "overlay: swap-commit",
      ]);
      const canEmitExtended = isPhaseAtomicV2 || diagConfig.extended;
      const shouldEmitDiag =
        defaultDiagEvents.has(eventName) ||
        (canEmitExtended && extendedDiagEvents.has(eventName));

      if (shouldEmitDiag) {
        try {
          const rawRectSnapshot = buildCenterSnapshot(projectedKonvaRectRawSnapshot);
          const baseRectSnapshot = buildCenterSnapshot(projectedKonvaRect);
          const overlayRectSnapshot = buildCenterSnapshot(overlayRect);
          const editorRectSnapshot = buildCenterSnapshot(editableVisualRect);
          const rawToBase = buildCenterDelta(projectedKonvaRectRawSnapshot, projectedKonvaRect);
          const baseToOverlay = buildCenterDelta(projectedKonvaRect, overlayRect);
          const overlayToEditor = buildCenterDelta(overlayRect, editableVisualRect);

          const alignmentAuthoritiesPayload = {
            id: editingId || null,
            sessionId: overlaySessionIdRef.current || null,
            eventName,
            phase: payload.phase || eventName,
            overlayEngine: normalizedOverlayEngine,
            rawRect: rawRectSnapshot,
            baseRect: baseRectSnapshot,
            overlayRect: overlayRectSnapshot,
            editorRect: editorRectSnapshot,
            centerLocks: {
              lockedCenterStageX: roundMetric(Number(lockedCenterStageX)),
              centerViewportX: roundMetric(Number(centerViewportX)),
            },
            widthModel: {
              projectedWidth: roundMetric(Number(projectedWidth)),
              measuredOverlayWidthPx: roundMetric(Number(measuredOverlayWidthPx)),
              resolvedOverlayWidthPx: roundMetric(Number(resolvedOverlayWidthPx)),
              centeredEditorWidthPx: roundMetric(Number(centeredEditorWidthPx)),
              centeredEditorLeftPx: roundMetric(Number(centeredEditorLeftPx)),
              overlayWidthSource: overlayWidthSource || null,
            },
            deltas: {
              rawToBaseCenterDx: rawToBase?.centerDx ?? null,
              baseToOverlayCenterDx: baseToOverlay?.centerDx ?? null,
              overlayToEditorCenterDx: overlayToEditor?.centerDx ?? null,
              rawToBaseWidthDw: rawToBase?.widthDw ?? null,
              baseToOverlayWidthDw: baseToOverlay?.widthDw ?? null,
            },
          };
          console.log(
            `[INLINE][DIAG] alignment-authorities\n${formatInlineLogPayload(alignmentAuthoritiesPayload)}`
          );
          pushInlineTraceEvent("alignment-authorities", {
            id: alignmentAuthoritiesPayload.id,
            sessionId: alignmentAuthoritiesPayload.sessionId,
            phase: alignmentAuthoritiesPayload.phase,
            overlayEngine: alignmentAuthoritiesPayload.overlayEngine,
            eventName,
            rawToBaseCenterDx: alignmentAuthoritiesPayload.deltas.rawToBaseCenterDx,
            baseToOverlayCenterDx: alignmentAuthoritiesPayload.deltas.baseToOverlayCenterDx,
            overlayToEditorCenterDx: alignmentAuthoritiesPayload.deltas.overlayToEditorCenterDx,
          });

          const alignmentOffsetBreakdownPayload = {
            id: editingId || null,
            sessionId: overlaySessionIdRef.current || null,
            eventName,
            phase: payload.phase || eventName,
            overlayEngine: normalizedOverlayEngine,
            lineModel: {
              isSingleLine: Boolean(isSingleLine),
              singleLineCaretMode: singleLineCaretMode || null,
              lineHeightPx: roundMetric(Number(lineHeightPx)),
              cssLineHeightPx: roundMetric(Number(cssLineHeightPx)),
              editableLineHeightPx: roundMetric(Number(editableLineHeightPx)),
            },
            offsetModel: {
              source: domToKonvaOffsetModel?.source || null,
              revision: Number.isFinite(Number(domToKonvaOffsetModel?.revision))
                ? Number(domToKonvaOffsetModel?.revision)
                : (Number.isFinite(Number(v2VerticalAuthoritySnapshot?.revision))
                  ? Number(v2VerticalAuthoritySnapshot?.revision)
                  : null),
              frozen: Boolean(domToKonvaOffsetModel?.frozen || v2VerticalAuthoritySnapshot?.frozen),
              coordinateSpace:
                domToKonvaOffsetModel?.coordinateSpace ||
                v2VerticalAuthoritySnapshot?.coordinateSpace ||
                "content-ink",
              activeDomTopInset: roundNullableMetric(domToKonvaOffsetModel?.activeDomTopInset),
              domTopInset: roundNullableMetric(domToKonvaOffsetModel?.domTopInset),
              domProbeTopInset: roundNullableMetric(domToKonvaOffsetModel?.domProbeTopInset),
              domLiveTopInset: roundNullableMetric(domToKonvaOffsetModel?.domLiveTopInset),
              domSourceDeltaPx: roundNullableMetric(domToKonvaOffsetModel?.domSourceDeltaPx),
              liveSourceDeltaPx: roundNullableMetric(domToKonvaOffsetModel?.liveSourceDeltaPx),
              domSourceDivergenceLimitPx: roundNullableMetric(
                domToKonvaOffsetModel?.domSourceDivergenceLimitPx
              ),
              liveSourceDivergenceLimitPx: roundNullableMetric(
                domToKonvaOffsetModel?.liveSourceDivergenceLimitPx
              ),
              rawOffset: roundNullableMetric(domToKonvaOffsetModel?.rawOffset),
              saneLimit: roundNullableMetric(domToKonvaOffsetModel?.saneLimit),
              blockedReason: domToKonvaOffsetModel?.blockedReason || null,
              appliedOffset: roundNullableMetric(domToKonvaOffsetModel?.appliedOffset),
              externalOffsetRoutedToInternalApplied: Boolean(
                domToKonvaOffsetModel?.externalOffsetRoutedToInternalApplied
              ),
              externalOffsetRoutedToInternalFromPx: roundNullableMetric(
                domToKonvaOffsetModel?.externalOffsetRoutedToInternalFromPx
              ),
              externalOffsetRoutedToInternalToPx: roundNullableMetric(
                domToKonvaOffsetModel?.externalOffsetRoutedToInternalToPx
              ),
              modelOffsetPx: roundNullableMetric(
                v2VerticalAuthoritySnapshot?.modelOffsetPx ?? domToKonvaOffsetModel?.modelOffsetPx
              ),
              visualOffsetPx: roundNullableMetric(
                v2VerticalAuthoritySnapshot?.visualOffsetPx ?? domToKonvaOffsetModel?.visualOffsetPx
              ),
              internalContentOffsetPx: roundNullableMetric(
                v2VerticalAuthoritySnapshot?.internalContentOffsetPx ??
                domToKonvaOffsetModel?.internalContentOffsetPx
              ),
            },
            breakdown: {
              domToKonvaGlyphOffsetPx: roundMetric(domToKonvaGlyphOffsetPx),
              domToKonvaPaddingOffsetPx: roundMetric(domToKonvaPaddingOffsetPx),
              domToKonvaBaseVisualOffsetPx: roundMetric(domToKonvaBaseVisualOffsetPx),
              domVisualNudgePx: roundMetric(domVisualNudgePx),
              domVisualResidualDeadZonePx: roundMetric(domVisualResidualDeadZonePx),
              domVisualResidualDeadZoneEffectivePx: roundMetric(domVisualResidualDeadZoneEffectivePx),
              domToKonvaVisualOffsetRawPx: roundMetric(domToKonvaVisualOffsetRawPx),
              domToKonvaVisualOffsetPx: roundMetric(domToKonvaVisualOffsetPx),
              v2OffsetOneShotPx: roundMetric(Number(v2OffsetOneShotPx || 0)),
              effectiveVisualOffsetPx: roundMetric(Number(effectiveVisualOffsetPx || 0)),
              effectiveInternalContentOffsetPx: roundMetric(
                Number(effectiveInternalContentOffsetPx || 0)
              ),
              effectiveVisualOffsetWithInternalPx: roundMetric(
                Number(effectiveVisualOffsetPx || 0) +
                Number(effectiveInternalContentOffsetPx || 0)
              ),
              offsetAtReadyToSwap: roundMetric(Number(payload?.offsetAtReadyToSwap)),
              offsetAtSwapCommit: roundMetric(Number(payload?.offsetAtSwapCommit)),
              offsetAtFirstPaint: roundMetric(Number(payload?.offsetAtFirstPaint)),
              offsetAtActiveInit: roundMetric(Number(payload?.offsetAtActiveInit)),
              invariantOffsetAtomicPass: payload?.invariantOffsetAtomicPass ?? null,
            },
          };
          console.log(
            `[INLINE][DIAG] alignment-offset-breakdown\n${formatInlineLogPayload(alignmentOffsetBreakdownPayload)}`
          );
          pushInlineTraceEvent("alignment-offset-breakdown", {
            id: alignmentOffsetBreakdownPayload.id,
            sessionId: alignmentOffsetBreakdownPayload.sessionId,
            phase: alignmentOffsetBreakdownPayload.phase,
            overlayEngine: alignmentOffsetBreakdownPayload.overlayEngine,
            eventName,
            effectiveVisualOffsetPx:
              alignmentOffsetBreakdownPayload.breakdown.effectiveVisualOffsetPx,
            effectiveInternalContentOffsetPx:
              alignmentOffsetBreakdownPayload.breakdown.effectiveInternalContentOffsetPx,
            blockedReason: alignmentOffsetBreakdownPayload.offsetModel.blockedReason,
            authorityRevision: alignmentOffsetBreakdownPayload.offsetModel.revision,
            authorityFrozen: alignmentOffsetBreakdownPayload.offsetModel.frozen,
            invariantOffsetAtomicPass:
              alignmentOffsetBreakdownPayload.breakdown.invariantOffsetAtomicPass,
          });
        } catch (diagError) {
          console.warn("[INLINE][DIAG] alignment-channel-error", {
            eventName,
            error: String(diagError || ""),
          });
        }
      }
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
    effectiveInternalContentOffsetPx,
    v2OffsetOneShotPx,
    v2VerticalAuthoritySnapshot,
    fontMetricsRevision,
    fontLoadStatus?.available,
    fontLoadStatus?.spec,
    isPhaseAtomicV2,
    normalizedOverlayEngine,
    nodeProps.fontStyle,
    nodeProps.fontWeight,
    nodeProps.fontStyleRaw,
    nodeProps.fontWeightRaw,
    nodeProps.fontFamily,
    overlayPhase,
    scaleVisual,
    totalScaleX,
    totalScaleY,
    domPerceptualScale,
    domPerceptualScaleModel?.source,
    domPerceptualScaleModel?.widthRatio,
    domPerceptualScaleModel?.domProbeWidthPx,
    domPerceptualScaleModel?.canvasProbeWidthPx,
    domPerceptualScaleModel?.canvasProbeInkWidthPx,
    editorFrameRef,
    konvaTextNode,
  ]);

  useInlineTraceBridge({
    isPhaseAtomicV2,
    normalizedOverlayEngine,
  });

  return emitDebug;
}
