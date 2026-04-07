function pushHoverSuppressionReason(reasons, reason, higherPriorityOwnerRef, owner) {
  reasons.push(reason);
  if (!higherPriorityOwnerRef.current && owner) {
    higherPriorityOwnerRef.current = owner;
  }
}

export function resolveStageHoverSuppression({
  isDragging = false,
  backgroundEditSectionId = null,
  isPredragVisualSelectionActive = false,
  canvasInteractionActive = false,
  canvasInteractionSettling = false,
  isImageCropInteracting = false,
  runtimeDragActive = false,
  runtimeGroupDragActive = false,
  runtimeResizeActive = false,
  hasSelectedPhaseTargetConflict = false,
  hasInlineVisibilityOwner = false,
  hasDragOverlayOwner = false,
} = {}) {
  const reasons = [];
  const higherPriorityOwnerRef = { current: null };
  let hasGlobalSuppression = false;
  let hasTargetConflictSuppression = false;

  const pushGlobalSuppressionReason = (reason, owner) => {
    hasGlobalSuppression = true;
    pushHoverSuppressionReason(
      reasons,
      reason,
      higherPriorityOwnerRef,
      owner
    );
  };

  const pushTargetConflictSuppressionReason = (reason, owner) => {
    hasTargetConflictSuppression = true;
    pushHoverSuppressionReason(
      reasons,
      reason,
      higherPriorityOwnerRef,
      owner
    );
  };

  if (hasDragOverlayOwner) {
    pushGlobalSuppressionReason("drag-overlay-owner", "drag-overlay");
  }
  if (isPredragVisualSelectionActive) {
    pushGlobalSuppressionReason("predrag-visual-selection", "drag-overlay");
  }
  if (isDragging) {
    pushGlobalSuppressionReason("drag-prop", "drag-overlay");
  }
  if (runtimeDragActive) {
    pushGlobalSuppressionReason("global-drag", "drag-overlay");
  }
  if (runtimeGroupDragActive) {
    pushGlobalSuppressionReason("group-drag", "drag-overlay");
  }
  if (canvasInteractionSettling) {
    pushGlobalSuppressionReason(
      "canvas-interaction-settling",
      "drag-overlay"
    );
  }
  if (hasSelectedPhaseTargetConflict) {
    pushTargetConflictSuppressionReason(
      "selected-phase-target-conflict",
      "selected-phase"
    );
  }
  if (hasInlineVisibilityOwner) {
    pushGlobalSuppressionReason("inline-dom-authority", "inline-dom");
  }
  if (runtimeResizeActive) {
    pushGlobalSuppressionReason("resize", "resize");
  }
  if (isImageCropInteracting) {
    pushGlobalSuppressionReason("image-crop", "image-crop");
  }
  if (backgroundEditSectionId) {
    pushGlobalSuppressionReason("background-edit", "background-edit");
  }
  if (canvasInteractionActive) {
    pushGlobalSuppressionReason(
      "canvas-interaction-active",
      "interaction-boundary"
    );
  }

  const suppressionScope =
    hasGlobalSuppression && hasTargetConflictSuppression
      ? "mixed"
      : hasGlobalSuppression
        ? "global"
        : hasTargetConflictSuppression
          ? "target-conflict"
          : "none";

  return {
    suppressed: reasons.length > 0,
    reasons,
    higherPriorityOwner: higherPriorityOwnerRef.current || "none",
    suppressionScope,
    hasGlobalSuppression,
    hasTargetConflictSuppression,
  };
}

export function resolveGlobalHoverInteractionSuppression({
  runtimeDragActive = false,
  runtimeGroupDragActive = false,
  runtimeResizeActive = false,
} = {}) {
  return resolveStageHoverSuppression({
    runtimeDragActive,
    runtimeGroupDragActive,
    runtimeResizeActive,
  });
}

export function shouldStageRenderHoverIndicator({
  isPredragVisualSelectionActive = false,
  isDragging = false,
  runtimeDragActive = false,
  runtimeGroupDragActive = false,
  runtimeResizeActive = false,
} = {}) {
  return !(
    runtimeResizeActive ||
    isPredragVisualSelectionActive ||
    isDragging ||
    runtimeDragActive ||
    runtimeGroupDragActive
  );
}
