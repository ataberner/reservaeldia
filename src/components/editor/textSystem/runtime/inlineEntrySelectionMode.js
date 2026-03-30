export const INLINE_ENTRY_SELECTION_MODE_CARET_FROM_POINT = "caret-from-point";
export const INLINE_ENTRY_SELECTION_MODE_SELECT_ALL = "select-all";

function hasFiniteClientCoordinate(value) {
  return Number.isFinite(Number(value));
}

export function hasInitialCaretClientPoint(initialCaretClientPoint) {
  return (
    hasFiniteClientCoordinate(initialCaretClientPoint?.clientX) &&
    hasFiniteClientCoordinate(initialCaretClientPoint?.clientY)
  );
}

export function normalizeInlineEntrySelectionMode(
  entrySelectionMode,
  { initialCaretClientPoint = null } = {}
) {
  if (entrySelectionMode === INLINE_ENTRY_SELECTION_MODE_CARET_FROM_POINT) {
    return INLINE_ENTRY_SELECTION_MODE_CARET_FROM_POINT;
  }
  if (entrySelectionMode === INLINE_ENTRY_SELECTION_MODE_SELECT_ALL) {
    return INLINE_ENTRY_SELECTION_MODE_SELECT_ALL;
  }
  return hasInitialCaretClientPoint(initialCaretClientPoint)
    ? INLINE_ENTRY_SELECTION_MODE_CARET_FROM_POINT
    : INLINE_ENTRY_SELECTION_MODE_SELECT_ALL;
}

export function buildInlineEntrySelectionPlan({
  entrySelectionMode = null,
  initialCaretClientPoint = null,
} = {}) {
  const normalizedMode = normalizeInlineEntrySelectionMode(entrySelectionMode, {
    initialCaretClientPoint,
  });

  if (normalizedMode === INLINE_ENTRY_SELECTION_MODE_CARET_FROM_POINT) {
    if (hasInitialCaretClientPoint(initialCaretClientPoint)) {
      return {
        mode: normalizedMode,
        primaryAction: "point",
        fallbackAction: "restore",
        consumesInitialCaretPoint: true,
      };
    }

    return {
      mode: normalizedMode,
      primaryAction: "restore",
      fallbackAction: null,
      consumesInitialCaretPoint: false,
    };
  }

  return {
    mode: normalizedMode,
    primaryAction: "select-all",
    fallbackAction: "restore",
    consumesInitialCaretPoint: false,
  };
}
