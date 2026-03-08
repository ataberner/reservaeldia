export default function resolveInlineCanvasVisibility({
  overlayEngine,
  visibilityMode,
  inlineOverlayMountedId,
  objectId,
  editingId,
  currentInlineEditingId,
}) {
  const normalizedOverlayEngine = "phase_atomic_v2";
  const normalizedVisibilityMode =
    visibilityMode === "window" ? "window" : "reactive";
  const isEditingByWindow = currentInlineEditingId === objectId;
  const isEditingByReactive = editingId === objectId;
  let overlayDomPresentLoose = false;
  let overlayFocused = false;
  let overlayVisualReady = false;
  const overlayLegacyExitHolding = false;

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

  const isEditingByOverlay = inlineOverlayMountedId === objectId;
  const isEditing = isEditingByOverlay;

  return {
    isEditing,
    isEditingByWindow,
    isEditingByReactive,
    isEditingByOverlay,
    overlayDomPresentLoose,
    overlayFocused,
    overlayVisualReady,
    overlayLegacyExitHolding,
    overlayEngine: normalizedOverlayEngine,
    visibilityMode: normalizedVisibilityMode,
  };
}
