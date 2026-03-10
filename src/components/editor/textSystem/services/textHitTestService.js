import {
  applySelectionRange,
  createBoundaryCaretRange,
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
