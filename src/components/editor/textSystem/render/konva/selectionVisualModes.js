function normalizeSelectionIds(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((id) => String(id ?? "").trim())
    .filter((id) => id !== "");
}

function hasMeaningfulSelectionArea(area) {
  return Boolean(
    area &&
      Number.isFinite(Number(area.x)) &&
      Number.isFinite(Number(area.y)) &&
      Number.isFinite(Number(area.width)) &&
      Number.isFinite(Number(area.height))
  );
}

function isLineObject(obj) {
  return obj?.tipo === "forma" && obj?.figura === "line";
}

function isPreservedGroupObject(obj) {
  return obj?.tipo === "grupo";
}

const NO_ANCHORS = Object.freeze([]);
const BOTTOM_RIGHT_ANCHOR = Object.freeze(["bottom-right"]);

export function resolveStageSelectionVisualMode(input = {}) {
  const selectedIds = normalizeSelectionIds(input.selectedIds);
  const selectedObjects = Array.isArray(input.selectedObjects)
    ? input.selectedObjects.filter(Boolean)
    : [];
  const dragVisualSelectionIds = normalizeSelectionIds(input.dragVisualSelectionIds);
  const singleSelectedObject =
    selectedIds.length === 1 ? selectedObjects[0] || null : null;
  const singleSelectedLineId = isLineObject(singleSelectedObject)
    ? singleSelectedObject?.id || selectedIds[0] || null
    : null;

  const showDragSelectionOverlay = Boolean(
    input.predragVisualSelectionActive === true ||
      input.isCanvasDragCoordinatorActive === true ||
      (
        dragVisualSelectionIds.length > 0 &&
        (
          input.isCanvasDragGestureActive === true ||
          input.canvasInteractionActive === true ||
          input.canvasInteractionSettling === true
        )
      )
  );

  return {
    showMarqueeRect: Boolean(
      input.selectionActive === true && hasMeaningfulSelectionArea(input.selectionArea)
    ),
    mountPrimarySelectionOverlay: Boolean(
      selectedIds.length > 0 &&
        !input.activeInlineEditingId &&
        input.hasSectionDecorationEdit !== true
    ),
    showLineControls: Boolean(
      singleSelectedLineId &&
        input.isAnyCanvasDragActive !== true &&
        input.isImageRotateInteractionActive !== true
    ),
    showDragSelectionOverlay,
    dragOverlaySelectionIds: showDragSelectionOverlay
      ? (dragVisualSelectionIds.length > 0 ? dragVisualSelectionIds : selectedIds)
      : [],
    singleSelectedLineId,
  };
}

export function resolveTransformerVisualMode(input = {}) {
  const selectedIds = normalizeSelectionIds(input.selectedIds);
  const selectedObjects = Array.isArray(input.selectedObjects)
    ? input.selectedObjects.filter(Boolean)
    : [];
  const hasLineSelection =
    input.hasLineSelection === true || selectedObjects.some(isLineObject);
  const hasPreservedGroupSelection = selectedObjects.some(isPreservedGroupObject);
  const transformableObjects = selectedObjects.filter((obj) => !isLineObject(obj));
  const shouldUseGenericTransformer = Boolean(
    selectedIds.length > 0 &&
      !hasPreservedGroupSelection &&
      !hasLineSelection &&
      transformableObjects.length > 0
  );

  const shouldSuppressDuringDeferredDrag = Boolean(
    input.effectiveDragging === true &&
      input.pendingDragSelectionId &&
      !selectedIds.includes(String(input.pendingDragSelectionId))
  );

  const isAttachSuppressed = Boolean(
    input.effectiveDragging === true ||
      input.predragVisualSelectionActive === true ||
      input.canvasInteractionSettling === true ||
      (input.canvasInteractionActive === true && input.runtimeResizeActive !== true)
  );

  const shouldHideTransformerDuringDrag = Boolean(
    input.effectiveDragging === true &&
      input.dragSelectionOverlayVisible === true &&
      input.dragSelectionOverlayVisualReady === true &&
      input.isResizeGestureActive !== true &&
      input.isTransformingResize !== true
  );

  const shouldSuppressTransformerVisualsForDragOverlay = Boolean(
    input.dragSelectionOverlayVisible === true &&
      input.dragSelectionOverlayVisualReady === true &&
      !shouldHideTransformerDuringDrag &&
      input.isResizeGestureActive !== true &&
      input.isTransformingResize !== true
  );

  const renderMode =
    input.hasActiveInlineEditingSession === true ||
    shouldSuppressDuringDeferredDrag ||
    shouldHideTransformerDuringDrag
      ? "none"
      : hasLineSelection || hasPreservedGroupSelection
        ? "line-indicator"
        : selectedIds.length > 0
          ? "transformer"
          : "none";

  const enabledAnchors =
    shouldSuppressTransformerVisualsForDragOverlay ||
    input.interactionLocked === true ||
    (input.effectiveDragging === true && input.isResizeGestureActive !== true) ||
    input.shouldUseLightweightRotateOverlay === true
      ? NO_ANCHORS
      : BOTTOM_RIGHT_ANCHOR;

  const rotateEnabled = Boolean(
    !shouldSuppressTransformerVisualsForDragOverlay &&
      input.interactionLocked !== true &&
      input.effectiveDragging !== true &&
      input.isGallerySelection !== true
  );

  const borderEnabled = Boolean(
    input.shouldUseLightweightRotateOverlay !== true &&
      !shouldSuppressTransformerVisualsForDragOverlay
  );

  return {
    renderMode,
    shouldUseGenericTransformer,
    isAttachSuppressed,
    shouldSuppressDuringDeferredDrag,
    shouldHideTransformerDuringDrag,
    shouldSuppressTransformerVisualsForDragOverlay,
    enabledAnchors,
    rotateEnabled,
    borderEnabled,
  };
}
