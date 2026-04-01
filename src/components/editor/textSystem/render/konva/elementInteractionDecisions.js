export function resolveEffectiveSelectionState({
  elementId,
  isSelected,
  selectionCount,
  runtimeSelectedIds,
}) {
  const safeRuntimeSelectedIds = Array.isArray(runtimeSelectedIds)
    ? runtimeSelectedIds.filter(Boolean)
    : [];
  const safeElementId = String(elementId || "").trim();
  const safeSelectionCount = Number.isFinite(Number(selectionCount))
    ? Number(selectionCount)
    : 0;

  return {
    runtimeSelectedIds: safeRuntimeSelectedIds,
    effectiveIsSelected:
      Boolean(isSelected) ||
      (safeElementId ? safeRuntimeSelectedIds.includes(safeElementId) : false),
    effectiveSelectionCount:
      safeRuntimeSelectedIds.length > 0
        ? safeRuntimeSelectedIds.length
        : safeSelectionCount,
  };
}

export function isManualGroupDragEligible({
  isSelected,
  selectionCount,
  editingMode,
  isInEditMode,
  inlineEditPointerActive,
}) {
  return Boolean(
    isSelected &&
      Number(selectionCount) > 1 &&
      !editingMode &&
      !isInEditMode &&
      !inlineEditPointerActive
  );
}

export function resolveInteractionAccess({
  editingMode,
  isInEditMode,
  inlineEditPointerActive,
  isActiveGroupFollower,
  isManualGroupMember,
  manualGroupDragEligible,
}) {
  const followerSuppressed = Boolean(isActiveGroupFollower);

  return {
    draggable:
      !editingMode &&
      !inlineEditPointerActive &&
      !followerSuppressed &&
      !isManualGroupMember &&
      !manualGroupDragEligible,
    listening:
      (!isInEditMode || inlineEditPointerActive) && !followerSuppressed,
    followerSuppressed,
  };
}

export function shouldArmSelectedTextPrimaryRelease({
  tipo,
  effectiveIsSelected,
  effectiveSelectionCount,
  editingMode,
  inlineEditPointerActive,
  shiftKey,
  ctrlKey,
  metaKey,
  altKey,
}) {
  const hasDisallowedModifiers =
    Boolean(shiftKey) ||
    Boolean(ctrlKey) ||
    Boolean(metaKey) ||
    Boolean(altKey);

  return (
    tipo === "texto" &&
    Boolean(effectiveIsSelected) &&
    Number(effectiveSelectionCount) === 1 &&
    !editingMode &&
    !inlineEditPointerActive &&
    !hasDisallowedModifiers
  );
}

export function decidePressSelection({
  hasOnSelect,
  effectiveIsSelected,
  effectiveSelectionCount,
  inlineEditPointerActive,
  selectionGestureSuppressed,
  button,
  shiftKey,
  ctrlKey,
  metaKey,
}) {
  const additiveSelectionRequested = Boolean(shiftKey);

  if (!hasOnSelect) {
    return {
      shouldSelectOnPress: false,
      allowSameGestureDrag: false,
      reason: "missing-onSelect",
    };
  }

  if (effectiveIsSelected) {
    return {
      shouldSelectOnPress: false,
      allowSameGestureDrag: false,
      reason: "already-selected",
    };
  }

  if (
    Number(effectiveSelectionCount) > 1 &&
    !additiveSelectionRequested
  ) {
    return {
      shouldSelectOnPress: false,
      allowSameGestureDrag: false,
      reason: "multiselection-active",
    };
  }

  if (inlineEditPointerActive) {
    return {
      shouldSelectOnPress: false,
      allowSameGestureDrag: false,
      reason: "inline-edit-pointer-active",
    };
  }

  if (selectionGestureSuppressed) {
    return {
      shouldSelectOnPress: false,
      allowSameGestureDrag: false,
      reason: "selection-gesture-suppressed",
    };
  }

  if (button != null && Number(button) !== 0) {
    return {
      shouldSelectOnPress: false,
      allowSameGestureDrag: false,
      reason: "non-primary-button",
    };
  }

  return {
    shouldSelectOnPress: true,
    allowSameGestureDrag:
      !Boolean(shiftKey) &&
      !Boolean(ctrlKey) &&
      !Boolean(metaKey),
    reason: "select-on-press",
  };
}

export function decideSelectionGestureDispatch({
  gesture,
  suppressNativeClickUntilActive,
  pressSelectionGuardConsumed,
  selectionGestureSuppressed,
  hasDragged,
}) {
  if (gesture === "primary" && suppressNativeClickUntilActive) {
    return {
      shouldEmit: false,
      reason: "manual-release-inline",
    };
  }

  if (gesture === "primary" && pressSelectionGuardConsumed) {
    return {
      shouldEmit: false,
      reason: "press-selection-guard",
    };
  }

  if (selectionGestureSuppressed) {
    return {
      shouldEmit: false,
      reason: "selection-gesture-suppressed",
    };
  }

  if (hasDragged) {
    return {
      shouldEmit: false,
      reason: "drag-active",
    };
  }

  return {
    shouldEmit: true,
    reason: "emit",
  };
}

export function shouldArmPredragRelease({
  assumeSingleSelection,
  isSelected,
  selectionCount,
  manualGroupDragEligible,
}) {
  const canTreatAsSingleSelection =
    Boolean(assumeSingleSelection) ||
    (Boolean(isSelected) && Number(selectionCount) === 1);

  return canTreatAsSingleSelection && !manualGroupDragEligible;
}
