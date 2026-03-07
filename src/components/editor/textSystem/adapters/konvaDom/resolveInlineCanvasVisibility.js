export default function resolveInlineCanvasVisibility({
  overlayEngine,
  visibilityMode,
  inlineOverlayMountedId,
  objectId,
  editingId,
  currentInlineEditingId,
}) {
  const normalizedOverlayEngine =
    overlayEngine === "phase_atomic_v2" ? "phase_atomic_v2" : "legacy";
  const normalizedVisibilityMode =
    visibilityMode === "window" ? "window" : "reactive";
  const isEditingByWindow = currentInlineEditingId === objectId;
  const isEditingByReactive = editingId === objectId;
  let overlayDomPresentLoose = false;
  let overlayFocused = false;
  let overlayVisualReady = false;

  if (isEditingByReactive && typeof document !== "undefined") {
    const safeId = String(objectId).replace(/"/g, '\\"');
    const overlayRoot = document.querySelector(`[data-inline-editor-id="${safeId}"]`);
    overlayDomPresentLoose = Boolean(overlayRoot);
    overlayVisualReady =
      overlayRoot?.getAttribute("data-inline-editor-visual-ready") === "true";
    const activeEl = document.activeElement;
    overlayFocused = Boolean(
      overlayRoot &&
      activeEl &&
      (activeEl === overlayRoot || overlayRoot.contains(activeEl))
    );
  }

  const isEditingByOverlay =
    normalizedOverlayEngine === "phase_atomic_v2"
      ? inlineOverlayMountedId === objectId
      : (
        inlineOverlayMountedId === objectId ||
        (isEditingByReactive && overlayDomPresentLoose && overlayVisualReady && overlayFocused)
      );

  const isEditing =
    normalizedVisibilityMode === "reactive"
      ? isEditingByOverlay
      : (isEditingByWindow || isEditingByReactive || isEditingByOverlay);

  return {
    isEditing,
    isEditingByWindow,
    isEditingByReactive,
    isEditingByOverlay,
    overlayDomPresentLoose,
    overlayFocused,
    overlayVisualReady,
    overlayEngine: normalizedOverlayEngine,
    visibilityMode: normalizedVisibilityMode,
  };
}
