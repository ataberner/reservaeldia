import { useCallback } from "react";
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
  getSelectionRectInEditor,
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
    };
  }
  const enabled = parseInlineDiagFlag(window.__INLINE_DIAG_ALIGNMENT, true);
  const extended = parseInlineDiagFlag(window.__INLINE_DIAG_ALIGNMENT_EXTENDED, false);
  return {
    enabled,
    extended,
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
}) {
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
    const selectionRectRaw = selectionInfo?.rect || null;
    const selectionRect = normalizeProbeRect(selectionRectRaw);
    const selectionRectDegenerate =
      Boolean(selectionRectRaw) && !selectionRect;
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
      selectionInfo.inEditor && selectionRect && contentRect
        ? selectionRect.y - contentRect.y
        : null;
    const caretProbeRectRaw = getCollapsedCaretProbeRectInEditor(editorRef.current);
    const caretProbeRect = normalizeProbeRect(caretProbeRectRaw);
    const caretProbeRectDegenerate =
      Boolean(caretProbeRectRaw) && !caretProbeRect;
    const caretProbeToContentDy =
      caretProbeRect && contentRect ? caretProbeRect.y - contentRect.y : null;
    const caretProbeHeightPx = caretProbeRect ? caretProbeRect.height : null;
    const isFocused = document.activeElement === editorRef.current;
    const focusClaimed = Boolean(isFocused && selectionInfo.inEditor);
    const selectionGeometryReady = Boolean(selectionRect);
    const caretGeometryReady = Boolean(caretProbeRect);
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
      isFocused,
      focusClaimed,
      projectedKonvaRect,
      projectedKonvaRectRaw: projectedKonvaRectRawSnapshot,
      lockedCenterStageX: roundMetric(Number(lockedCenterStageX)),
      centerViewportX: roundMetric(Number(centerViewportX)),
      overlayToKonvaDy,
      contentToKonvaDy,
      fullRangeRect,
      selectionInEditor: selectionInfo.inEditor,
      selectionRect,
      selectionRectRaw,
      selectionRectDegenerate,
      selectionGeometryReady,
      fullRangeToContentDy,
      caretToContentDy,
      caretProbeRect,
      caretProbeRectRaw,
      caretProbeRectDegenerate,
      caretGeometryReady,
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

    const diagConfig = readInlineAlignmentDiagConfig(DEBUG_MODE);
    if (diagConfig.enabled) {
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
              rawOffset: roundMetric(Number(domToKonvaOffsetModel?.rawOffset)),
              saneLimit: roundMetric(Number(domToKonvaOffsetModel?.saneLimit)),
              blockedReason: domToKonvaOffsetModel?.blockedReason || null,
              appliedOffset: roundMetric(Number(domToKonvaOffsetModel?.appliedOffset)),
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
            blockedReason: alignmentOffsetBreakdownPayload.offsetModel.blockedReason,
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

  useInlineTraceBridge({
    isPhaseAtomicV2,
    normalizedOverlayEngine,
  });

  return emitDebug;
}
