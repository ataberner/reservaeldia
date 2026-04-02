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
} = {}) {
  const reasons = [];

  if (isDragging) reasons.push("drag-prop");
  if (backgroundEditSectionId) reasons.push("background-edit");
  if (isPredragVisualSelectionActive) reasons.push("predrag-visual-selection");
  if (canvasInteractionActive) reasons.push("canvas-interaction-active");
  if (canvasInteractionSettling) reasons.push("canvas-interaction-settling");
  if (isImageCropInteracting) reasons.push("image-crop");
  if (runtimeDragActive) reasons.push("global-drag");
  if (runtimeGroupDragActive) reasons.push("group-drag");
  if (runtimeResizeActive) reasons.push("resize");

  return {
    suppressed: reasons.length > 0,
    reasons,
  };
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
