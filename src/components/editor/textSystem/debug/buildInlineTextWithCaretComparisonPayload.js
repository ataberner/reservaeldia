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

function buildRectDelta(afterRect, beforeRect) {
  return {
    dx: deltaMetric(afterRect?.x, beforeRect?.x),
    dy: deltaMetric(afterRect?.y, beforeRect?.y),
    dw: deltaMetric(afterRect?.width, beforeRect?.width),
    dh: deltaMetric(afterRect?.height, beforeRect?.height),
  };
}

export function buildInlineTextWithCaretSnapshot({
  ts = null,
  eventName = null,
  phase = null,
  contentRect = null,
  editableVisualRect = null,
  fullRangeRect = null,
  firstGlyphRect = null,
  lastGlyphRect = null,
  textInkRect = null,
  editorEl = null,
}) {
  return {
    ts: ts || null,
    eventName: eventName || null,
    phase: phase || null,
    contentBoxRect: roundRect(contentRect),
    editableVisualRect: roundRect(editableVisualRect),
    fullTextRangeRect: roundRect(fullRangeRect),
    firstGlyphRect: roundRect(firstGlyphRect),
    lastGlyphRect: roundRect(lastGlyphRect),
    textInkRect: roundRect(textInkRect),
    scroll: {
      left: roundNullable(editorEl?.scrollLeft),
      top: roundNullable(editorEl?.scrollTop),
      clientWidth: roundNullable(editorEl?.clientWidth),
      scrollWidth: roundNullable(editorEl?.scrollWidth),
      clientHeight: roundNullable(editorEl?.clientHeight),
      scrollHeight: roundNullable(editorEl?.scrollHeight),
    },
  };
}

export function buildInlineTextWithCaretComparisonPayload({
  beforeCaretVisible = null,
  afterCaretVisibleStable = null,
}) {
  const before = beforeCaretVisible || null;
  const after = afterCaretVisibleStable || null;
  const contentDelta = buildRectDelta(after?.contentBoxRect, before?.contentBoxRect);
  const editableDelta = buildRectDelta(after?.editableVisualRect, before?.editableVisualRect);
  const firstGlyphDelta = buildRectDelta(after?.firstGlyphRect, before?.firstGlyphRect);
  const lastGlyphDelta = buildRectDelta(after?.lastGlyphRect, before?.lastGlyphRect);
  const fullRangeDelta = buildRectDelta(after?.fullTextRangeRect, before?.fullTextRangeRect);
  const textInkDelta = buildRectDelta(after?.textInkRect, before?.textInkRect);

  return {
    beforeCaretVisible: before,
    afterCaretVisibleStable: after,
    delta: {
      contentDx: contentDelta.dx,
      contentDy: contentDelta.dy,
      contentDw: contentDelta.dw,
      contentDh: contentDelta.dh,
      editableDx: editableDelta.dx,
      editableDy: editableDelta.dy,
      editableDw: editableDelta.dw,
      editableDh: editableDelta.dh,
      firstGlyphDx: firstGlyphDelta.dx,
      firstGlyphDy: firstGlyphDelta.dy,
      firstGlyphDw: firstGlyphDelta.dw,
      firstGlyphDh: firstGlyphDelta.dh,
      lastGlyphDx: lastGlyphDelta.dx,
      lastGlyphDy: lastGlyphDelta.dy,
      lastGlyphDw: lastGlyphDelta.dw,
      lastGlyphDh: lastGlyphDelta.dh,
      fullRangeDx: fullRangeDelta.dx,
      fullRangeDy: fullRangeDelta.dy,
      fullRangeDw: fullRangeDelta.dw,
      fullRangeDh: fullRangeDelta.dh,
      textInkDx: textInkDelta.dx,
      textInkDy: textInkDelta.dy,
      textInkDw: textInkDelta.dw,
      textInkDh: textInkDelta.dh,
    },
  };
}

