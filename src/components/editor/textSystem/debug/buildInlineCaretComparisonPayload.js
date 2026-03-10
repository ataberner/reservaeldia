import { roundMetric } from "@/components/editor/overlays/inlineEditor/inlineEditorNumeric";

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundNullable(value) {
  const numeric = toFiniteNumber(value);
  return numeric === null ? null : roundMetric(numeric);
}

function roundRect(rect) {
  if (!rect) return null;
  const x = toFiniteNumber(rect.x);
  const y = toFiniteNumber(rect.y);
  const width = toFiniteNumber(rect.width);
  const height = toFiniteNumber(rect.height);
  if ([x, y, width, height].some((value) => value === null)) return null;
  return {
    x: roundMetric(x),
    y: roundMetric(y),
    width: roundMetric(width),
    height: roundMetric(height),
  };
}

function deltaMetric(afterValue, beforeValue) {
  const after = toFiniteNumber(afterValue);
  const before = toFiniteNumber(beforeValue);
  if (after === null || before === null) return null;
  return roundMetric(after - before);
}

function normalizeGeometryState(rawState = null) {
  const state = rawState && typeof rawState === "object" ? rawState : {};
  return {
    exists: Boolean(state.exists),
    isCollapsed:
      typeof state.isCollapsed === "boolean" ? state.isCollapsed : null,
    inEditor: Boolean(state.inEditor),
    geometryReady: Boolean(state.geometryReady),
    geometryEmpty: Boolean(state.geometryEmpty),
    geometryReason: state.geometryReason || null,
  };
}

export function buildInlineCaretStateSnapshot({
  ts = null,
  eventName = null,
  phase = null,
  contentRect = null,
  editableVisualRect = null,
  fullRangeRect = null,
  firstGlyphRect = null,
  selectionRect = null,
  caretRect = null,
  editorEl = null,
  computedStyle = null,
  isFocused = false,
  focusClaimed = false,
  selectionInEditor = false,
  selectionGeometryReady = false,
  caretGeometryReady = false,
  selectionState = null,
  caretState = null,
}) {
  return {
    ts: ts || null,
    eventName: eventName || null,
    phase: phase || null,
    contentBoxRect: roundRect(contentRect),
    editableVisualRect: roundRect(editableVisualRect),
    fullTextRangeRect: roundRect(fullRangeRect),
    firstGlyphRect: roundRect(firstGlyphRect),
    selectionRect: roundRect(selectionRect),
    caretRect: roundRect(caretRect),
    selectionState: normalizeGeometryState(selectionState),
    caretState: normalizeGeometryState(caretState),
    scroll: {
      left: roundNullable(editorEl?.scrollLeft),
      top: roundNullable(editorEl?.scrollTop),
      clientWidth: roundNullable(editorEl?.clientWidth),
      scrollWidth: roundNullable(editorEl?.scrollWidth),
      clientHeight: roundNullable(editorEl?.clientHeight),
      scrollHeight: roundNullable(editorEl?.scrollHeight),
    },
    typography: {
      paddingLeft: computedStyle?.paddingLeft ?? null,
      paddingTop: computedStyle?.paddingTop ?? null,
      textIndent: computedStyle?.textIndent ?? null,
      letterSpacing: computedStyle?.letterSpacing ?? null,
      fontFamily: computedStyle?.fontFamily ?? null,
      fontSize: computedStyle?.fontSize ?? null,
      lineHeight: computedStyle?.lineHeight ?? null,
      fontWeight: computedStyle?.fontWeight ?? null,
      fontStyle: computedStyle?.fontStyle ?? null,
      textRendering: computedStyle?.textRendering ?? null,
      fontKerning: computedStyle?.fontKerning ?? null,
      fontFeatureSettings: computedStyle?.fontFeatureSettings ?? null,
      fontVariantLigatures: computedStyle?.fontVariantLigatures ?? null,
    },
    focus: {
      isFocused: Boolean(isFocused),
      focusClaimed: Boolean(focusClaimed),
      selectionInEditor: Boolean(selectionInEditor),
      selectionGeometryReady: Boolean(selectionGeometryReady),
      caretGeometryReady: Boolean(caretGeometryReady),
    },
  };
}

export function buildInlineCaretComparisonPayload({
  beforeCaret = null,
  afterCaret = null,
}) {
  const before = beforeCaret || null;
  const after = afterCaret || null;
  return {
    beforeCaret: before,
    afterCaret: after,
    delta: {
      firstGlyphDx: deltaMetric(after?.firstGlyphRect?.x, before?.firstGlyphRect?.x),
      firstGlyphDy: deltaMetric(after?.firstGlyphRect?.y, before?.firstGlyphRect?.y),
      fullRangeDx: deltaMetric(after?.fullTextRangeRect?.x, before?.fullTextRangeRect?.x),
      fullRangeDy: deltaMetric(after?.fullTextRangeRect?.y, before?.fullTextRangeRect?.y),
      contentDx: deltaMetric(after?.contentBoxRect?.x, before?.contentBoxRect?.x),
      contentDy: deltaMetric(after?.contentBoxRect?.y, before?.contentBoxRect?.y),
      editableDx: deltaMetric(after?.editableVisualRect?.x, before?.editableVisualRect?.x),
      editableDy: deltaMetric(after?.editableVisualRect?.y, before?.editableVisualRect?.y),
      caretDx: deltaMetric(after?.caretRect?.x, before?.caretRect?.x),
      caretDy: deltaMetric(after?.caretRect?.y, before?.caretRect?.y),
      selectionDx: deltaMetric(after?.selectionRect?.x, before?.selectionRect?.x),
      selectionDy: deltaMetric(after?.selectionRect?.y, before?.selectionRect?.y),
    },
  };
}
