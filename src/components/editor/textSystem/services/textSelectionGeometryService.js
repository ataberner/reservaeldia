import {
  getCollapsedCaretProbeRectInEditor,
  getFirstGlyphRectInEditor,
  getFullRangeRect,
  getLastGlyphRectInEditor,
  getSelectionRectInEditor,
} from "@/components/editor/overlays/inlineEditor/inlineEditorSelectionRects";
import {
  resolveInlineStageViewportMetrics,
} from "@/components/editor/overlays/inlineGeometry";
import projectSemanticRectToStage from "@/components/editor/textSystem/adapters/konvaDom/projectSemanticRectToStage";
import { measureTextWidthCanvas } from "@/components/editor/textSystem/metricsLayout/services/textMeasureService";
import {
  resolveEditorRangeTextPosition,
} from "@/components/editor/textSystem/services/textCaretPositionService";

export function createEmptyTextSelectionGeometry() {
  return {
    isActive: false,
    isCollapsed: true,
    selectionRects: [],
    selectionBounds: null,
    caretRect: null,
    diagnostics: null,
  };
}

function isSelectionInsideEditor(editorEl, range) {
  if (!editorEl || !range) return false;
  const startContainer = range.startContainer || null;
  const endContainer = range.endContainer || null;
  return Boolean(
    startContainer &&
      endContainer &&
      editorEl.contains(startContainer) &&
      editorEl.contains(endContainer)
  );
}

function rectHasArea(rect) {
  const width = Number(rect?.width);
  const height = Number(rect?.height);
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    (width > 0 || height > 0)
  );
}

function rectHasVisibleHeight(rect) {
  const height = Number(rect?.height);
  return Number.isFinite(height) && height > 0;
}

function toDebugRect(rect) {
  if (!rect) return null;
  const x = Number(rect.x);
  const y = Number(rect.y);
  const width = Number(rect.width);
  const height = Number(rect.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
}

function parseCssPixelValue(value, fallback = null) {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function measureCollapsedRangeRect(range) {
  if (!range) return null;
  try {
    const liveRects = Array.from(range.getClientRects?.() || []);
    const firstRect = liveRects[0] || null;
    if (rectHasVisibleHeight(firstRect)) {
      return toDebugRect(firstRect);
    }
    const boundingRect = range.getBoundingClientRect?.() || null;
    return rectHasVisibleHeight(boundingRect)
      ? toDebugRect(boundingRect)
      : null;
  } catch {
    return null;
  }
}

function resolveSingleLineMetricCaretFallbackRect(
  editorEl,
  {
    preserveCenterDuringEdit = false,
    logicalOffset = null,
    logicalOffsetHint = null,
  } = {}
) {
  if (
    !editorEl ||
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    return null;
  }

  const rawText = String(editorEl.innerText || "");
  if (rawText.includes("\n")) return null;

  const editorRect = editorEl.getBoundingClientRect?.() || null;
  if (!editorRect) return null;

  const resolvedLogicalOffset = Number.isFinite(logicalOffset)
    ? Number(logicalOffset)
    : null;
  const globalOffset = Number.isFinite(resolvedLogicalOffset)
    ? Number(resolvedLogicalOffset)
    : (
      Number.isFinite(logicalOffsetHint)
        ? Number(logicalOffsetHint)
        : null
    );
  if (!Number.isFinite(globalOffset)) return null;

  const computedStyle = window.getComputedStyle?.(editorEl) || null;
  const fontSize = parseCssPixelValue(computedStyle?.fontSize, null);
  const letterSpacing = parseCssPixelValue(computedStyle?.letterSpacing, 0) || 0;
  if (!Number.isFinite(fontSize) || fontSize <= 0) return null;

  const fullTextWidth = measureTextWidthCanvas({
    text: rawText,
    fontSize,
    fontFamily: computedStyle?.fontFamily || "sans-serif",
    fontWeight: computedStyle?.fontWeight || "normal",
    fontStyle: computedStyle?.fontStyle || "normal",
    letterSpacing,
  });
  const prefixWidth = measureTextWidthCanvas({
    text: rawText.slice(0, Math.max(0, globalOffset)),
    fontSize,
    fontFamily: computedStyle?.fontFamily || "sans-serif",
    fontWeight: computedStyle?.fontWeight || "normal",
    fontStyle: computedStyle?.fontStyle || "normal",
    letterSpacing,
  });
  if (!Number.isFinite(prefixWidth)) return null;

  const textAlign = String(computedStyle?.textAlign || "left").toLowerCase();
  const containerWidth = Number(editorRect.width || 0);
  const contentWidth = Number.isFinite(fullTextWidth) ? fullTextWidth : containerWidth;
  let alignOffsetX = 0;
  if (preserveCenterDuringEdit) {
    alignOffsetX = Math.max(0, (containerWidth - contentWidth) / 2);
  } else if (textAlign === "center") {
    alignOffsetX = Math.max(0, (containerWidth - contentWidth) / 2);
  } else if (textAlign === "right" || textAlign === "end") {
    alignOffsetX = Math.max(0, containerWidth - contentWidth);
  }

  const referenceRect =
    getFirstGlyphRectInEditor(editorEl) ||
    getFullRangeRect(editorEl) || {
      x: Number(editorRect.left || 0),
      y: Number(editorRect.top || 0),
      width: Number(editorRect.width || 0),
      height:
        parseCssPixelValue(computedStyle?.lineHeight, fontSize) || fontSize,
    };

  const centerPreservedLeft = preserveCenterDuringEdit
    ? Number(editorRect.left || 0) + (containerWidth / 2) - (contentWidth / 2)
    : Number(editorRect.left || 0);

  const rect = {
    x: centerPreservedLeft + alignOffsetX + prefixWidth,
    y: Number(referenceRect.y || editorRect.top || 0),
    width: 0,
    height: Number(referenceRect.height || fontSize || 0),
  };

  return {
    rect,
    diagnostics: {
      kind: preserveCenterDuringEdit
        ? "metric-single-line-centered"
        : "metric-single-line",
      globalOffset,
      resolvedGlobalOffset: Number.isFinite(resolvedLogicalOffset)
        ? resolvedLogicalOffset
        : null,
      usedLogicalOffsetHint:
        !Number.isFinite(resolvedLogicalOffset) &&
        Number.isFinite(logicalOffsetHint),
      prefixWidth,
      fullTextWidth: Number.isFinite(fullTextWidth) ? fullTextWidth : null,
      alignOffsetX,
      preserveCenterDuringEdit,
      centerPreservedLeft,
      editorCenterX: Number(editorRect.left || 0) + (containerWidth / 2),
      textAlign,
      rawTextLength: rawText.length,
      fontSize,
      letterSpacing,
      editorRect: toDebugRect({
        x: Number(editorRect.left || 0),
        y: Number(editorRect.top || 0),
        width: Number(editorRect.width || 0),
        height: Number(editorRect.height || 0),
      }),
      referenceRect: toDebugRect(referenceRect),
      rect: toDebugRect(rect),
    },
  };
}

function resolveTerminalEmptyLineMetricCaretFallbackRect(
  editorEl,
  {
    preserveCenterDuringEdit = false,
    logicalOffset = null,
    logicalOffsetHint = null,
    selectionAliasKind = null,
    textLength = null,
  } = {}
) {
  if (
    !editorEl ||
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    return null;
  }

  const rawText = String(editorEl.innerText || "");
  const trailingNewlines = rawText.match(/\n+$/)?.[0].length || 0;
  if (trailingNewlines <= 0 || !rawText.includes("\n")) return null;

  const resolvedLogicalOffset = Number.isFinite(logicalOffset)
    ? Number(logicalOffset)
    : null;
  const globalOffset = Number.isFinite(resolvedLogicalOffset)
    ? Number(resolvedLogicalOffset)
    : (
      Number.isFinite(logicalOffsetHint)
        ? Number(logicalOffsetHint)
        : null
    );
  const canonicalTextLength = Number.isFinite(textLength)
    ? Math.max(0, Number(textLength))
    : null;
  const isBoundaryEndSelection =
    selectionAliasKind === "root-end" ||
    selectionAliasKind === "element-end";
  const isAtCanonicalEnd =
    Number.isFinite(globalOffset) &&
    Number.isFinite(canonicalTextLength) &&
    globalOffset >= canonicalTextLength;
  if (!isBoundaryEndSelection && !isAtCanonicalEnd) return null;

  const editorRect = editorEl.getBoundingClientRect?.() || null;
  if (!editorRect) return null;

  const computedStyle = window.getComputedStyle?.(editorEl) || null;
  const fontSize = parseCssPixelValue(computedStyle?.fontSize, null);
  const lineHeight =
    parseCssPixelValue(computedStyle?.lineHeight, fontSize) || fontSize;
  if (!Number.isFinite(fontSize) || fontSize <= 0) return null;
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return null;

  const textAlign = String(computedStyle?.textAlign || "left").toLowerCase();
  const paddingLeft = parseCssPixelValue(computedStyle?.paddingLeft, 0) || 0;
  const paddingRight = parseCssPixelValue(computedStyle?.paddingRight, 0) || 0;
  const paddingTop = parseCssPixelValue(computedStyle?.paddingTop, 0) || 0;
  const containerWidth = Math.max(0, Number(editorRect.width || 0));
  const contentWidth = Math.max(0, containerWidth - paddingLeft - paddingRight);
  const contentLeft = Number(editorRect.left || 0) + paddingLeft;
  const contentTop = Number(editorRect.top || 0) + paddingTop;
  const rawLines = rawText.split("\n");
  const terminalLineIndex = Math.max(0, rawLines.length - 1);

  let x = contentLeft;
  if (preserveCenterDuringEdit || textAlign === "center") {
    x = contentLeft + contentWidth / 2;
  } else if (textAlign === "right" || textAlign === "end") {
    x = contentLeft + contentWidth;
  }

  const rect = {
    x,
    y: contentTop + terminalLineIndex * lineHeight,
    width: 0,
    height: lineHeight,
  };

  return {
    rect,
    diagnostics: {
      kind: "metric-terminal-empty-line",
      globalOffset,
      resolvedGlobalOffset: Number.isFinite(resolvedLogicalOffset)
        ? resolvedLogicalOffset
        : null,
      usedLogicalOffsetHint:
        !Number.isFinite(resolvedLogicalOffset) &&
        Number.isFinite(logicalOffsetHint),
      selectionAliasKind,
      preserveCenterDuringEdit,
      textAlign,
      trailingNewlines,
      canonicalTextLength,
      rawTextLength: rawText.length,
      rawLineCount: rawLines.length,
      terminalLineIndex,
      lineHeight,
      fontSize,
      paddingLeft,
      paddingRight,
      paddingTop,
      editorRect: toDebugRect({
        x: Number(editorRect.left || 0),
        y: Number(editorRect.top || 0),
        width: Number(editorRect.width || 0),
        height: Number(editorRect.height || 0),
      }),
      rect: toDebugRect(rect),
    },
  };
}

function buildCaretProxyRect(rect, edge = "start") {
  if (!rectHasVisibleHeight(rect)) return null;
  const x =
    edge === "end"
      ? Number(rect.x || 0) + Number(rect.width || 0)
      : Number(rect.x || 0);
  return {
    x,
    y: Number(rect.y || 0),
    width: 0,
    height: Number(rect.height || 0),
  };
}

function resolveCollapsedCaretFallbackRect(editorEl, range) {
  if (!editorEl || !range) return null;
  const startContainer = range.startContainer || null;
  const startOffset = Number(range.startOffset || 0);

  if (startContainer === editorEl && startOffset <= 0) {
    return buildCaretProxyRect(getFirstGlyphRectInEditor(editorEl), "start");
  }

  if (startContainer === editorEl) {
    return buildCaretProxyRect(getLastGlyphRectInEditor(editorEl), "end");
  }

  if (startContainer?.nodeType === Node.TEXT_NODE) {
    if (startOffset <= 0) {
      return buildCaretProxyRect(getFirstGlyphRectInEditor(editorEl), "start");
    }
    const textLength = String(startContainer.nodeValue || "").length;
    if (startOffset >= textLength) {
      return buildCaretProxyRect(getLastGlyphRectInEditor(editorEl), "end");
    }
  }

  return (
    buildCaretProxyRect(getLastGlyphRectInEditor(editorEl), "end") ||
    buildCaretProxyRect(getFirstGlyphRectInEditor(editorEl), "start")
  );
}

function normalizeCaretRect(rect, stage, scaleVisual) {
  const projected = projectSemanticRectToStage(rect, stage, { scaleVisual });
  if (!projected) return null;

  const stageMetrics = resolveInlineStageViewportMetrics(stage, { scaleVisual });
  const totalScaleX = Number(stageMetrics?.totalScaleX || 1);
  const minimumCaretWidth = totalScaleX > 0 ? 1 / totalScaleX : 1;

  return {
    ...projected,
    width: Math.max(projected.width || 0, minimumCaretWidth),
  };
}

export function resolveTextSelectionGeometry({
  editorEl,
  stage,
  scaleVisual = 1,
  preserveCenterDuringEdit = false,
  logicalOffsetHint = null,
  preferTerminalEmptyLine = false,
}) {
  if (!editorEl || !stage || typeof window === "undefined") {
    return createEmptyTextSelectionGeometry();
  }

  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0) {
    return createEmptyTextSelectionGeometry();
  }

  let range = null;
  try {
    range = selection.getRangeAt(0);
  } catch {
    return createEmptyTextSelectionGeometry();
  }

  if (!isSelectionInsideEditor(editorEl, range)) {
    return createEmptyTextSelectionGeometry();
  }

  const selectionPosition = resolveEditorRangeTextPosition(editorEl, range);
  const selectionLogicalOffset = Number.isFinite(selectionPosition?.logicalOffset)
    ? Number(selectionPosition.logicalOffset)
    : null;
  const selectionAliasKind = selectionPosition?.selectionAliasKind || null;
  const isCollapsed = Boolean(range.collapsed);
  const selectionRects = !isCollapsed
    ? Array.from(range.getClientRects?.() || [])
        .map((rect) => projectSemanticRectToStage(rect, stage, { scaleVisual }))
        .filter(rectHasArea)
    : [];

  const selectionState = getSelectionRectInEditor(editorEl);
  const selectionBounds =
    selectionState?.inEditor && selectionState?.rect
      ? projectSemanticRectToStage(selectionState.rect, stage, { scaleVisual })
      : null;
  const rawCollapsedCaretRect = getCollapsedCaretProbeRectInEditor(editorEl);
  const canonicalCollapsedCaretRect = isCollapsed
    ? measureCollapsedRangeRect(selectionPosition?.canonicalRange || null)
    : null;
  const hasRawCollapsedCaretRect = rectHasVisibleHeight(rawCollapsedCaretRect);
  const hasCanonicalCollapsedCaretRect = rectHasVisibleHeight(
    canonicalCollapsedCaretRect
  );
  const collapsedRootBoundarySelection = Boolean(
    isCollapsed &&
      selectionAliasKind &&
      selectionAliasKind.startsWith("root-")
  );
  const terminalEmptyLineCaretFallback =
    isCollapsed &&
    preferTerminalEmptyLine &&
    !hasRawCollapsedCaretRect &&
    !hasCanonicalCollapsedCaretRect
      ? resolveTerminalEmptyLineMetricCaretFallbackRect(editorEl, {
          preserveCenterDuringEdit,
          logicalOffset: selectionLogicalOffset,
          logicalOffsetHint: Number.isFinite(selectionLogicalOffset)
            ? null
            : logicalOffsetHint,
          selectionAliasKind,
          textLength: selectionPosition?.textLength ?? null,
        })
      : null;
  const singleLineMetricCaretFallback =
    isCollapsed &&
    !hasRawCollapsedCaretRect &&
    !hasCanonicalCollapsedCaretRect
      ? resolveSingleLineMetricCaretFallbackRect(editorEl, {
          preserveCenterDuringEdit,
          logicalOffset: selectionLogicalOffset,
          logicalOffsetHint: Number.isFinite(selectionLogicalOffset)
            ? null
            : logicalOffsetHint,
        })
      : null;
  const metricCaretFallback =
    terminalEmptyLineCaretFallback || singleLineMetricCaretFallback;
  const glyphCaretFallbackRect = resolveCollapsedCaretFallbackRect(editorEl, range);
  const fullRangeRect = getFullRangeRect(editorEl) || null;
  let caretSourceKind = null;
  let caretSourceRect = null;

  if (hasRawCollapsedCaretRect) {
    caretSourceKind = "native-collapsed";
    caretSourceRect = rawCollapsedCaretRect;
  } else if (hasCanonicalCollapsedCaretRect) {
    caretSourceKind = "canonical-collapsed";
    caretSourceRect = canonicalCollapsedCaretRect;
  } else if (metricCaretFallback?.rect) {
    caretSourceKind =
      metricCaretFallback?.diagnostics?.kind || "metric-single-line";
    caretSourceRect = metricCaretFallback.rect;
  } else if (glyphCaretFallbackRect) {
    caretSourceKind = "glyph-fallback";
    caretSourceRect = glyphCaretFallbackRect;
  } else if (selectionState?.rect) {
    caretSourceKind = "selection-bounds";
    caretSourceRect = selectionState.rect;
  } else if (fullRangeRect) {
    caretSourceKind = "full-range";
    caretSourceRect = fullRangeRect;
  }
  const caretRect =
    isCollapsed && caretSourceRect
      ? normalizeCaretRect(caretSourceRect, stage, scaleVisual)
      : null;

  return {
    isActive: true,
    isCollapsed,
    selectionRects:
      selectionRects.length > 0
        ? selectionRects
        : (selectionBounds && !isCollapsed ? [selectionBounds] : []),
    selectionBounds,
    caretRect,
    diagnostics: {
      caretSourceKind,
      nativeCollapsedRect: toDebugRect(rawCollapsedCaretRect),
      canonicalCollapsedRect: toDebugRect(canonicalCollapsedCaretRect),
      collapsedRootBoundarySelection,
      logicalOffset: Number.isFinite(selectionLogicalOffset)
        ? Number(selectionLogicalOffset)
        : (
          Number.isFinite(logicalOffsetHint)
            ? Number(logicalOffsetHint)
            : null
        ),
      logicalCanonicalOffset: Number.isFinite(selectionLogicalOffset)
        ? Number(selectionLogicalOffset)
        : null,
      logicalOffsetSource: Number.isFinite(selectionLogicalOffset)
        ? (
          selectionAliasKind
            ? "selection-alias"
            : "selection"
        )
        : (
          Number.isFinite(logicalOffsetHint)
            ? "requested-hint"
            : null
        ),
      selectionAliasKind,
      canonicalNodeName: selectionPosition?.canonicalNodeName || null,
      canonicalOffset: Number.isFinite(selectionPosition?.canonicalOffset)
        ? Number(selectionPosition.canonicalOffset)
        : null,
      canonicalStrategy: selectionPosition?.canonicalStrategy || null,
      metricFallback: metricCaretFallback?.diagnostics || null,
      glyphFallbackRect: toDebugRect(glyphCaretFallbackRect),
      selectionRect: toDebugRect(selectionState?.rect),
      fullRangeRect: toDebugRect(fullRangeRect),
      chosenCaretSourceRect: toDebugRect(caretSourceRect),
    },
  };
}

export default resolveTextSelectionGeometry;
