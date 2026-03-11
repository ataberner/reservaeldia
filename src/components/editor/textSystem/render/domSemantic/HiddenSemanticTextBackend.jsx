import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  getInlineKonvaProjectedRectViewport,
  resolveInlineKonvaTextNode,
  resolveInlineStageViewportMetrics,
} from "@/components/editor/overlays/inlineGeometry";
import {
  resolveVerticalAuthoritySnapshot,
} from "@/components/editor/overlays/inlineAlignmentModelV2";
import {
  normalizeInlineEditableText,
} from "@/components/editor/overlays/inlineTextModel";
import {
  applyInlineDomTextRenderParity,
  estimateDomCssInkProbe,
  measureCanvasInkMetrics,
  measureDomInkProbe,
  measureKonvaInkProbe,
  normalizeInlineFontProps,
  resolveInlineDomPerceptualScale,
} from "@/components/editor/overlays/inlineEditor/inlineEditorTextMetrics";
import {
  emitSemanticCaretDebug,
  rectToSemanticCaretPayload,
  roundSemanticCaretMetric,
} from "@/components/editor/textSystem/debug";

function readNodeAttr(node, key, fallback = null) {
  if (!node) return fallback;
  try {
    const fn = node[key];
    if (typeof fn === "function") {
      const value = fn.call(node);
      return value ?? fallback;
    }
    if (typeof node.getAttr === "function") {
      const attrValue = node.getAttr(key);
      if (typeof attrValue !== "undefined") return attrValue;
    }
    if (node?.attrs && Object.prototype.hasOwnProperty.call(node.attrs, key)) {
      return node.attrs[key];
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function buildCssMatrix(node, stageMetrics) {
  if (!node || !stageMetrics?.stageRect) return null;
  let matrix = null;
  try {
    matrix = node.getAbsoluteTransform?.()?.getMatrix?.() || null;
  } catch {
    matrix = null;
  }
  if (!Array.isArray(matrix) || matrix.length < 6) return null;

  const [a, b, c, d, e, f] = matrix;
  const scaleX = Number(stageMetrics.totalScaleX || 1);
  const scaleY = Number(stageMetrics.totalScaleY || 1);
  const translateX = Number(stageMetrics.stageRect.left || 0) + Number(e || 0) * scaleX;
  const translateY = Number(stageMetrics.stageRect.top || 0) + Number(f || 0) * scaleY;

  return `matrix(${a * scaleX}, ${b * scaleY}, ${c * scaleX}, ${d * scaleY}, ${translateX}, ${translateY})`;
}

function toPositiveNumber(value, fallback = 1) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function areProjectionRectsEqual(nextRect, prevRect) {
  const keys = ["x", "y", "width", "height"];
  return keys.every((key) => {
    const nextValue = Number(nextRect?.[key]);
    const prevValue = Number(prevRect?.[key]);
    if (!Number.isFinite(nextValue) && !Number.isFinite(prevValue)) return true;
    if (!Number.isFinite(nextValue) || !Number.isFinite(prevValue)) return false;
    return Math.abs(nextValue - prevValue) < 0.01;
  });
}

function HiddenSemanticTextBackend({
  editing,
  node,
  textAlign = "left",
  scaleVisual = 1,
  controller,
  preserveCenterDuringEdit = false,
}) {
  const overlayRootRef = useRef(null);
  const editableRef = useRef(null);
  const layoutDebugSignatureRef = useRef(null);
  const projectionSyncSignatureRef = useRef(null);
  const [liveKonvaProjection, setLiveKonvaProjection] = useState(null);
  const registerBackend = controller?.registerBackend;
  const editingId = editing?.id || null;
  const rawValue = String(editing?.value ?? "");
  const normalizedValue = useMemo(
    () => normalizeInlineEditableText(rawValue, {
      trimPhantomTrailingNewline: true,
    }),
    [rawValue]
  );

  const stage = node?.getStage?.() || null;
  const textNode = useMemo(
    () => resolveInlineKonvaTextNode(node, stage),
    [node, stage]
  );
  const stageMetrics = useMemo(
    () => resolveInlineStageViewportMetrics(stage, { scaleVisual }),
    [scaleVisual, stage]
  );
  const konvaProjection = useMemo(
    () => getInlineKonvaProjectedRectViewport(textNode, stage, scaleVisual),
    [rawValue, scaleVisual, stage, textNode]
  );
  const effectiveKonvaProjection =
    liveKonvaProjection?.konvaProjectedRectViewport &&
    liveKonvaProjection?.stageRect
      ? {
          ...konvaProjection,
          ...liveKonvaProjection,
          konvaProjectedRectViewport: liveKonvaProjection.konvaProjectedRectViewport,
          stageRect: liveKonvaProjection.stageRect,
          totalScaleX: liveKonvaProjection.totalScaleX,
          totalScaleY: liveKonvaProjection.totalScaleY,
        }
      : konvaProjection;

  const nodeProps = useMemo(() => {
    const rawFontStyle = readNodeAttr(textNode, "fontStyle", "normal");
    const rawFontWeight = readNodeAttr(textNode, "fontWeight", "normal");
    const normalizedFont = normalizeInlineFontProps(rawFontStyle, rawFontWeight);
    return {
      fontFamily: readNodeAttr(textNode, "fontFamily", "sans-serif"),
      fontSize: toPositiveNumber(readNodeAttr(textNode, "fontSize", 24), 24),
      fontStyle: normalizedFont.fontStyle,
      fontWeight: normalizedFont.fontWeight,
      fill: readNodeAttr(textNode, "fill", "#111111") || "#111111",
      lineHeight: toPositiveNumber(readNodeAttr(textNode, "lineHeight", 1.2), 1.2),
      letterSpacing: Number(readNodeAttr(textNode, "letterSpacing", 0)) || 0,
      width: toPositiveNumber(readNodeAttr(textNode, "width", 0), 1),
      height: toPositiveNumber(readNodeAttr(textNode, "height", 0), 1),
      rotation: Number(readNodeAttr(textNode, "rotation", 0)) || 0,
      scaleX: Number(readNodeAttr(textNode, "scaleX", 1)) || 1,
      scaleY: Number(readNodeAttr(textNode, "scaleY", 1)) || 1,
    };
  }, [textNode]);

  useLayoutEffect(() => {
    const editorEl = editableRef.current;
    if (!editorEl) return;
    const currentText = normalizeInlineEditableText(
      String(editorEl.innerText || ""),
      { trimPhantomTrailingNewline: true }
    );
    if (currentText !== rawValue) {
      editorEl.innerText = rawValue;
    }
  }, [rawValue]);

  useEffect(() => {
    const editorEl = editableRef.current;
    if (!editorEl) return;
    applyInlineDomTextRenderParity(editorEl.style);
  }, [
    nodeProps.fontFamily,
    nodeProps.fontSize,
    nodeProps.fontStyle,
    nodeProps.fontWeight,
  ]);

  useEffect(() => {
    layoutDebugSignatureRef.current = null;
    projectionSyncSignatureRef.current = null;
    setLiveKonvaProjection(null);
  }, [editingId]);

  useLayoutEffect(() => {
    if (!editingId || !textNode || !stage) return;
    const nextProjection = getInlineKonvaProjectedRectViewport(
      textNode,
      stage,
      scaleVisual
    );
    const nextRect = nextProjection?.konvaProjectedRectViewport || null;
    const nextStageRect = nextProjection?.stageRect || null;
    setLiveKonvaProjection((previous) => {
      const previousRect = previous?.konvaProjectedRectViewport || null;
      const previousStageRect = previous?.stageRect || null;
      const stageRectUnchanged =
        areProjectionRectsEqual(nextStageRect, previousStageRect);
      if (
        areProjectionRectsEqual(nextRect, previousRect) &&
        stageRectUnchanged &&
        Math.abs(
          Number(nextProjection?.totalScaleX || 0) -
            Number(previous?.totalScaleX || 0)
        ) < 0.0001 &&
        Math.abs(
          Number(nextProjection?.totalScaleY || 0) -
            Number(previous?.totalScaleY || 0)
        ) < 0.0001
      ) {
        return previous;
      }
      return {
        konvaProjectedRectViewport: nextRect,
        stageRect: nextStageRect,
        totalScaleX: Number(nextProjection?.totalScaleX || 1),
        totalScaleY: Number(nextProjection?.totalScaleY || 1),
      };
    });
  }, [editingId, rawValue, scaleVisual, stage, textNode]);

  const hasRenderableBackend = Boolean(
    editingId && node && textNode && stageMetrics?.stageRect
  );

  const projectedRect =
    effectiveKonvaProjection?.konvaProjectedRectViewport || null;
  const totalScaleX = Number(
    effectiveKonvaProjection?.totalScaleX || stageMetrics?.totalScaleX || 1
  );
  const totalScaleY = Number(
    effectiveKonvaProjection?.totalScaleY || stageMetrics?.totalScaleY || 1
  );
  const useProjectedBoxLayout =
    projectedRect &&
    Math.abs(Number(nodeProps.rotation || 0)) < 0.01 &&
    Math.abs(Number(nodeProps.scaleX || 1) - 1) < 0.01 &&
    Math.abs(Number(nodeProps.scaleY || 1) - 1) < 0.01;
  const usesTransformedBackendLayout = !useProjectedBoxLayout;
  const backendMetricScaleX = useProjectedBoxLayout ? totalScaleX : 1;
  const backendMetricScaleY = useProjectedBoxLayout ? totalScaleY : 1;

  useEffect(() => {
    if (!registerBackend) return undefined;
    if (!hasRenderableBackend) {
      registerBackend({
        rootEl: null,
        editorEl: null,
        preserveCenterDuringEdit: false,
        renderCaretNatively: false,
      });
      return undefined;
    }
    registerBackend?.({
      rootEl: overlayRootRef.current,
      editorEl: editableRef.current,
      preserveCenterDuringEdit,
      renderCaretNatively: usesTransformedBackendLayout,
    });
    return () => {
      registerBackend?.({
        rootEl: null,
        editorEl: null,
        preserveCenterDuringEdit: false,
        renderCaretNatively: false,
      });
    };
  }, [
    hasRenderableBackend,
    editingId,
    preserveCenterDuringEdit,
    registerBackend,
    usesTransformedBackendLayout,
  ]);

  const fontSizePx = Math.max(
    1,
    Number(nodeProps.fontSize || 24) * backendMetricScaleY
  );
  const lineHeightPx = Math.max(1, fontSizePx * Number(nodeProps.lineHeight || 1.2));
  const letterSpacingPx = Number(nodeProps.letterSpacing || 0) * backendMetricScaleX;
  const normalizedValueForMeasure = normalizedValue.replace(/[ \t]+$/gm, "");
  const isSingleLine = !normalizedValueForMeasure.includes("\n");

  const domPerceptualScaleModel = useMemo(
    () =>
      resolveInlineDomPerceptualScale({
        totalScaleY: backendMetricScaleY,
        fontFamily: nodeProps.fontFamily,
        fontStyle: nodeProps.fontStyle,
        fontWeight: nodeProps.fontWeight,
        fontSizePx,
        lineHeightPx,
        letterSpacingPx,
        probeText: "HgAy",
      }),
    [
      fontSizePx,
      letterSpacingPx,
      lineHeightPx,
      nodeProps.fontFamily,
      nodeProps.fontStyle,
      nodeProps.fontWeight,
      backendMetricScaleY,
    ]
  );
  const domPerceptualScale = Number(domPerceptualScaleModel?.scale || 1);
  const domRenderFontSizePx = Math.max(1, fontSizePx * domPerceptualScale);

  const singleLineCaretProbeModel = useMemo(() => {
    if (!isSingleLine) return null;
    return measureDomInkProbe({
      fontStyle: nodeProps.fontStyle,
      fontWeight: nodeProps.fontWeight,
      fontSizePx: domRenderFontSizePx,
      fontFamily: nodeProps.fontFamily,
      lineHeightPx: fontSizePx,
      letterSpacingPx,
      probeText: "HgAy",
    });
  }, [
    domRenderFontSizePx,
    fontSizePx,
    isSingleLine,
    letterSpacingPx,
    nodeProps.fontFamily,
    nodeProps.fontStyle,
    nodeProps.fontWeight,
  ]);
  const singleLineProbeOverflowPx = useMemo(() => {
    const top = Number(singleLineCaretProbeModel?.glyphTopInsetPx);
    const bottom = Number(singleLineCaretProbeModel?.glyphBottomInsetPx);
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) return 0;
    return Math.max(0, -top) + Math.max(0, -bottom);
  }, [singleLineCaretProbeModel]);
  const useKonvaLineHeightForSingleLine =
    isSingleLine &&
    Number.isFinite(singleLineProbeOverflowPx) &&
    singleLineProbeOverflowPx > Math.max(4, fontSizePx * 0.18);
  const editableLineHeightPx = isSingleLine
    ? (useKonvaLineHeightForSingleLine ? lineHeightPx : fontSizePx)
    : lineHeightPx;

  const canvasInkMetricsModel = useMemo(
    () =>
      measureCanvasInkMetrics({
        fontStyle: nodeProps.fontStyle,
        fontWeight: nodeProps.fontWeight,
        fontSizePx,
        fontFamily: nodeProps.fontFamily,
        probeText: "HgAy",
      }),
    [
      fontSizePx,
      nodeProps.fontFamily,
      nodeProps.fontStyle,
      nodeProps.fontWeight,
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
        probeText: "HgAy",
        canvasInkMetrics: canvasInkMetricsModel,
      }),
    [
      canvasInkMetricsModel,
      domRenderFontSizePx,
      editableLineHeightPx,
      letterSpacingPx,
      nodeProps.fontFamily,
      nodeProps.fontStyle,
      nodeProps.fontWeight,
    ]
  );
  const domCssInkProbeModel = useMemo(
    () =>
      estimateDomCssInkProbe({
        domInkProbe: domInkProbeModel,
        canvasInkMetrics: canvasInkMetricsModel,
        probeText: "HgAy",
      }),
    [canvasInkMetricsModel, domInkProbeModel]
  );
  const konvaInkProbeModel = useMemo(
    () =>
      measureKonvaInkProbe({
        fontStyle: nodeProps.fontStyle,
        fontWeight: nodeProps.fontWeight,
        fontSizePx,
        fontFamily: nodeProps.fontFamily,
        lineHeightPx,
        letterSpacingPx,
        probeText: "HgAy",
      }),
    [
      fontSizePx,
      letterSpacingPx,
      lineHeightPx,
      nodeProps.fontFamily,
      nodeProps.fontStyle,
      nodeProps.fontWeight,
    ]
  );
  const alignmentSnapshot = useMemo(
    () =>
      resolveVerticalAuthoritySnapshot({
        domCssInkProbe: domCssInkProbeModel,
        domInkProbe: domInkProbeModel,
        konvaInkProbe: konvaInkProbeModel,
        editableLineHeightPx,
        fontFamily: nodeProps.fontFamily,
        fallbackOffset: 0,
      }),
    [
      domCssInkProbeModel,
      domInkProbeModel,
      editableLineHeightPx,
      konvaInkProbeModel,
      nodeProps.fontFamily,
    ]
  );

  const visualOffsetXPx = Number(alignmentSnapshot?.visualOffsetXPx || 0);
  const visualOffsetYPx = Number(alignmentSnapshot?.visualOffsetPx || 0);
  const internalContentOffsetBasePx = Number(alignmentSnapshot?.internalContentOffsetPx || 0);
  const externalOffsetRouteThresholdPx = Math.max(
    2.2,
    Number(alignmentSnapshot?.diagnostics?.largeStableOffsetLimitPx || 0)
  );
  const shouldRouteLargeExternalOffsetToInternal =
    Number.isFinite(visualOffsetYPx) &&
    Math.abs(visualOffsetYPx) >= externalOffsetRouteThresholdPx &&
    String(alignmentSnapshot?.source || "") !== "conflictNeutral";
  const effectiveVisualOffsetPx = shouldRouteLargeExternalOffsetToInternal
    ? 0
    : visualOffsetYPx;
  const effectiveInternalContentOffsetPx =
    internalContentOffsetBasePx +
    (shouldRouteLargeExternalOffsetToInternal ? visualOffsetYPx : 0);

  const rootWidth = useProjectedBoxLayout
    ? Math.max(1, Number(projectedRect?.width || 0))
    : Math.max(1, Number(nodeProps.width || 1));
  const rootHeight = useProjectedBoxLayout
    ? Math.max(1, Number(projectedRect?.height || 0))
    : Math.max(1, Number(nodeProps.height || 1));
  const cssTransform = buildCssMatrix(textNode, stageMetrics);

  useLayoutEffect(() => {
    if (!hasRenderableBackend || typeof controller?.syncDecorations !== "function") {
      return;
    }
    const signature = JSON.stringify({
      x: roundSemanticCaretMetric(projectedRect?.x),
      y: roundSemanticCaretMetric(projectedRect?.y),
      width: roundSemanticCaretMetric(projectedRect?.width),
      height: roundSemanticCaretMetric(projectedRect?.height),
      totalScaleX: roundSemanticCaretMetric(totalScaleX),
      totalScaleY: roundSemanticCaretMetric(totalScaleY),
    });
    if (projectionSyncSignatureRef.current === signature) return;
    projectionSyncSignatureRef.current = signature;
    controller.syncDecorations();
  }, [
    controller,
    hasRenderableBackend,
    projectedRect,
    totalScaleX,
    totalScaleY,
  ]);

  useLayoutEffect(() => {
    const rootEl = overlayRootRef.current;
    const editorEl = editableRef.current;
    if (!hasRenderableBackend || !rootEl || !editorEl) return;

    const payload = {
      id: editingId,
      engine: "semantic-hidden-canvas-first",
      layoutMode: useProjectedBoxLayout ? "projected-box" : "css-transform",
      text: {
        length: rawValue.length,
        isSingleLine,
        textAlign,
      },
      projectedRectViewport: rectToSemanticCaretPayload(projectedRect),
      rootRectViewport: rectToSemanticCaretPayload(
        rootEl.getBoundingClientRect?.()
      ),
      editorRectViewport: rectToSemanticCaretPayload(
        editorEl.getBoundingClientRect?.()
      ),
      rootBox: {
        width: roundSemanticCaretMetric(rootWidth),
        height: roundSemanticCaretMetric(rootHeight),
      },
      backend: {
        usesTransformedBackendLayout,
      },
      stage: {
        stageRectViewport: rectToSemanticCaretPayload(stageMetrics?.stageRect),
        totalScaleX: roundSemanticCaretMetric(totalScaleX),
        totalScaleY: roundSemanticCaretMetric(totalScaleY),
        backendMetricScaleX: roundSemanticCaretMetric(backendMetricScaleX),
        backendMetricScaleY: roundSemanticCaretMetric(backendMetricScaleY),
      },
      typography: {
        fontFamily: nodeProps.fontFamily,
        fontStyle: nodeProps.fontStyle,
        fontWeight: nodeProps.fontWeight,
        fontSizePx: roundSemanticCaretMetric(fontSizePx),
        domRenderFontSizePx: roundSemanticCaretMetric(domRenderFontSizePx),
        lineHeightPx: roundSemanticCaretMetric(lineHeightPx),
        editableLineHeightPx: roundSemanticCaretMetric(editableLineHeightPx),
        letterSpacingPx: roundSemanticCaretMetric(letterSpacingPx),
      },
      offsets: {
        visualOffsetXPx: roundSemanticCaretMetric(visualOffsetXPx),
        visualOffsetYPx: roundSemanticCaretMetric(visualOffsetYPx),
        effectiveVisualOffsetPx: roundSemanticCaretMetric(
          effectiveVisualOffsetPx
        ),
        internalContentOffsetBasePx: roundSemanticCaretMetric(
          internalContentOffsetBasePx
        ),
        effectiveInternalContentOffsetPx: roundSemanticCaretMetric(
          effectiveInternalContentOffsetPx
        ),
        externalOffsetRouteThresholdPx: roundSemanticCaretMetric(
          externalOffsetRouteThresholdPx
        ),
        reroutedToInternal: shouldRouteLargeExternalOffsetToInternal,
      },
      alignment: {
        source: alignmentSnapshot?.source || null,
        domPerceptualScale: roundSemanticCaretMetric(domPerceptualScale),
        diagnostics: alignmentSnapshot?.diagnostics
          ? {
              stableOffsetPx: roundSemanticCaretMetric(
                alignmentSnapshot.diagnostics.stableOffsetPx
              ),
              unstableOffsetPx: roundSemanticCaretMetric(
                alignmentSnapshot.diagnostics.unstableOffsetPx
              ),
              largeStableOffsetLimitPx: roundSemanticCaretMetric(
                alignmentSnapshot.diagnostics.largeStableOffsetLimitPx
              ),
              domLineBoxSlackPx: roundSemanticCaretMetric(
                alignmentSnapshot.diagnostics.domLineBoxSlackPx
              ),
              konvaLineBoxSlackPx: roundSemanticCaretMetric(
                alignmentSnapshot.diagnostics.konvaLineBoxSlackPx
              ),
              baselineDeltaPx: roundSemanticCaretMetric(
                alignmentSnapshot.diagnostics.baselineDeltaPx
              ),
            }
          : null,
      },
    };

    const signature = JSON.stringify(payload);
    if (layoutDebugSignatureRef.current === signature) return;
    layoutDebugSignatureRef.current = signature;
    emitSemanticCaretDebug("semantic:hidden-backend-layout", payload);
  }, [
    alignmentSnapshot?.diagnostics,
    alignmentSnapshot?.source,
    domPerceptualScale,
    domRenderFontSizePx,
    editableLineHeightPx,
    editingId,
    effectiveInternalContentOffsetPx,
    effectiveVisualOffsetPx,
    externalOffsetRouteThresholdPx,
    fontSizePx,
    internalContentOffsetBasePx,
    isSingleLine,
    letterSpacingPx,
    lineHeightPx,
    nodeProps.fontFamily,
    nodeProps.fontStyle,
    nodeProps.fontWeight,
    projectedRect,
    rawValue.length,
    rootHeight,
    rootWidth,
    shouldRouteLargeExternalOffsetToInternal,
    stageMetrics?.stageRect,
    textAlign,
    usesTransformedBackendLayout,
    backendMetricScaleX,
    backendMetricScaleY,
    totalScaleX,
    totalScaleY,
    useProjectedBoxLayout,
    visualOffsetXPx,
    visualOffsetYPx,
  ]);

  if (!hasRenderableBackend) {
    return null;
  }

  return (
    <div
      ref={overlayRootRef}
      data-inline-editor-id={editingId}
      data-inline-editor-engine="semantic-hidden-canvas-first"
      data-inline-editor-visual-ready="true"
      style={{
        position: "fixed",
        left: useProjectedBoxLayout ? Number(projectedRect?.x || 0) : 0,
        top: useProjectedBoxLayout ? Number(projectedRect?.y || 0) : 0,
        width: rootWidth,
        height: rootHeight,
        minWidth: rootWidth,
        minHeight: rootHeight,
        transform: useProjectedBoxLayout ? undefined : (cssTransform || undefined),
        transformOrigin: "0 0",
        overflow: "visible",
        pointerEvents: "none",
        zIndex: 10010,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "visible",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: `${visualOffsetXPx}px`,
            top: `${effectiveVisualOffsetPx}px`,
            width: "100%",
            height: "100%",
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          <div
            ref={editableRef}
            data-inline-editor-content="true"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            role="textbox"
            aria-multiline="true"
            onInput={controller?.handleInput}
            onFocus={controller?.handleFocus}
            onBlur={controller?.handleBlur}
            onKeyDown={controller?.handleKeyDown}
            onKeyUp={controller?.handleSelectionMutation}
            onMouseUp={controller?.handleSelectionMutation}
            onCompositionEnd={controller?.handleSelectionMutation}
            style={{
              position: "absolute",
              left: 0,
              top: `${effectiveInternalContentOffsetPx}px`,
              width: "100%",
              minWidth: "100%",
              height: "100%",
              minHeight: "100%",
              margin: 0,
              padding: 0,
              border: "none",
              outline: "none",
              boxSizing: "border-box",
              overflow: "visible",
              background: "transparent",
              color: "transparent",
              WebkitTextFillColor: "transparent",
              caretColor: usesTransformedBackendLayout
                ? nodeProps.fill
                : "transparent",
              whiteSpace: isSingleLine ? "pre" : "pre-wrap",
              overflowWrap: isSingleLine ? "normal" : "break-word",
              wordBreak: isSingleLine ? "normal" : "break-word",
              userSelect: "text",
              pointerEvents: "none",
              fontFamily: nodeProps.fontFamily,
              fontSize: `${domRenderFontSizePx}px`,
              fontStyle: nodeProps.fontStyle,
              fontWeight: nodeProps.fontWeight,
              lineHeight: `${editableLineHeightPx}px`,
              letterSpacing: `${letterSpacingPx}px`,
              textAlign,
              textRendering: "geometricPrecision",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function areHiddenSemanticBackendPropsEqual(previousProps, nextProps) {
  return (
    previousProps.node === nextProps.node &&
    previousProps.controller === nextProps.controller &&
    previousProps.textAlign === nextProps.textAlign &&
    Number(previousProps.scaleVisual || 1) === Number(nextProps.scaleVisual || 1) &&
    Boolean(previousProps.preserveCenterDuringEdit) ===
      Boolean(nextProps.preserveCenterDuringEdit) &&
    String(previousProps.editing?.id || "") === String(nextProps.editing?.id || "") &&
    String(previousProps.editing?.value ?? "") ===
      String(nextProps.editing?.value ?? "")
  );
}

export default memo(HiddenSemanticTextBackend, areHiddenSemanticBackendPropsEqual);
