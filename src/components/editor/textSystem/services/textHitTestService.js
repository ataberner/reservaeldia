import {
  applySelectionRange,
  createBoundaryCaretRange,
  createLogicalCaretRange,
  getCanonicalEditorTextLength,
  resolveEditorRangeTextPosition,
} from "@/components/editor/textSystem/services/textCaretPositionService";

function containsNode(editorEl, node) {
  if (!editorEl || !node) return false;
  return node === editorEl || editorEl.contains(node);
}

function createRangeFromCaretPosition(position) {
  if (!position?.offsetNode) return null;
  try {
    const range = document.createRange();
    range.setStart(position.offsetNode, Number(position.offset || 0));
    range.collapse(true);
    return range;
  } catch {
    return null;
  }
}

function getViewportPointPosition({ clientX, clientY }) {
  if (
    typeof document === "undefined" ||
    !Number.isFinite(Number(clientX)) ||
    !Number.isFinite(Number(clientY))
  ) {
    return null;
  }

  if (typeof document.caretPositionFromPoint === "function") {
    const position = document.caretPositionFromPoint(clientX, clientY);
    const range = createRangeFromCaretPosition(position);
    if (range) return range;
  }

  if (typeof document.caretRangeFromPoint === "function") {
    try {
      return document.caretRangeFromPoint(clientX, clientY) || null;
    } catch {
      return null;
    }
  }

  return null;
}

function isUsableViewportRect(rect) {
  return (
    rect &&
    Number.isFinite(Number(rect.left)) &&
    Number.isFinite(Number(rect.top)) &&
    Number.isFinite(Number(rect.bottom))
  );
}

function readCollapsedCaretViewportRect(range) {
  if (!range) return null;
  try {
    const rects = range.getClientRects?.() || [];
    for (const rect of rects) {
      if (isUsableViewportRect(rect)) {
        return rect;
      }
    }
    const boundingRect = range.getBoundingClientRect?.() || null;
    return isUsableViewportRect(boundingRect) ? boundingRect : null;
  } catch {
    return null;
  }
}

function computeAxisDistance(value, start, end) {
  const numericValue = Number(value);
  const numericStart = Number(start);
  const numericEnd = Number(end);
  if (
    !Number.isFinite(numericValue) ||
    !Number.isFinite(numericStart) ||
    !Number.isFinite(numericEnd)
  ) {
    return Number.POSITIVE_INFINITY;
  }
  if (numericValue < numericStart) return numericStart - numericValue;
  if (numericValue > numericEnd) return numericValue - numericEnd;
  return 0;
}

function resolveLogicalCaretRangeFromPoint({
  editorEl,
  clientX,
  clientY,
}) {
  if (!editorEl) return null;
  const textLength = getCanonicalEditorTextLength(editorEl);
  let bestMatch = null;

  for (let logicalOffset = 0; logicalOffset <= textLength; logicalOffset += 1) {
    const { range } = createLogicalCaretRange(editorEl, logicalOffset, {
      textLength,
    });
    const caretRect = readCollapsedCaretViewportRect(range);
    if (!caretRect) continue;

    const verticalDistance = computeAxisDistance(
      clientY,
      caretRect.top,
      caretRect.bottom
    );
    const horizontalDistance = Math.abs(
      Number(clientX) - Number(caretRect.left)
    );
    const score = verticalDistance * 10000 + horizontalDistance;

    if (!bestMatch || score < bestMatch.score) {
      bestMatch = {
        score,
        range,
      };
    }
  }

  return bestMatch?.range || null;
}

export function focusSemanticEditor(editorEl) {
  if (!editorEl || typeof editorEl.focus !== "function") return;
  try {
    editorEl.focus({ preventScroll: true });
  } catch {
    editorEl.focus();
  }
}

export function moveSemanticCaretToBoundary(editorEl, boundary = "end") {
  if (!editorEl || typeof document === "undefined") return false;
  try {
    const { range } = createBoundaryCaretRange(editorEl, boundary);
    return applySelectionRange(range);
  } catch {
    return false;
  }
}

export function resolveSemanticCaretRangeFromPoint({
  editorEl,
  clientX,
  clientY,
}) {
  if (!editorEl) return null;
  const range = getViewportPointPosition({ clientX, clientY });
  if (range && containsNode(editorEl, range.startContainer)) {
    const canonicalPosition = resolveEditorRangeTextPosition(editorEl, range);
    return canonicalPosition.canonicalRange || range;
  }

  const logicalFallbackRange = resolveLogicalCaretRangeFromPoint({
    editorEl,
    clientX,
    clientY,
  });
  if (logicalFallbackRange) {
    return logicalFallbackRange;
  }

  const editorRect = editorEl.getBoundingClientRect?.() || null;
  if (!editorRect) return null;
  const resolvedBoundary =
    Number(clientX) < Number(editorRect.left || 0) ? "start" : "end";

  const { range: boundaryRange } = createBoundaryCaretRange(
    editorEl,
    resolvedBoundary
  );
  if (applySelectionRange(boundaryRange)) {
    return boundaryRange;
  }

  return null;
}

export function placeSemanticCaretFromPoint({
  editorEl,
  clientX,
  clientY,
}) {
  if (!editorEl || typeof window === "undefined") return false;
  const range = resolveSemanticCaretRangeFromPoint({
    editorEl,
    clientX,
    clientY,
  });
  if (!range) return false;

  try {
    return applySelectionRange(range);
  } catch {
    return false;
  }
}

export default placeSemanticCaretFromPoint;
