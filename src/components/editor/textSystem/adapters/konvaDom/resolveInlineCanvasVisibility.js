export default function resolveInlineCanvasVisibility({
  overlayEngine,
  visibilityMode,
  inlineOverlayMountedId,
  inlineOverlayMountSession,
  objectId,
  editingId,
  currentInlineEditingId,
  sessionId = null,
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

  const mountSession = inlineOverlayMountSession || null;
  const mountId = mountSession?.mounted ? mountSession.id : null;
  const mountSessionId = mountSession?.mounted ? mountSession.sessionId : null;
  const mountSwapCommitted = Boolean(mountSession?.mounted && mountSession?.swapCommitted);
  const renderAuthority = mountSession?.renderAuthority || "konva";
  const caretVisible = Boolean(mountSession?.caretVisible);
  const paintStable = Boolean(mountSession?.paintStable);
  const sessionMatches = !sessionId || !mountSessionId || mountSessionId === sessionId;
  const overlayOwnsVisualAuthority =
    renderAuthority === "dom-preview" || renderAuthority === "dom-editable";
  const isEditingByOverlay =
    mountSwapCommitted &&
    overlayOwnsVisualAuthority &&
    mountId === objectId &&
    sessionMatches;
  const isEditingByOverlayLegacy = inlineOverlayMountedId === objectId;
  const isEditing = isEditingByOverlay;

  return {
    isEditing,
    isEditingByWindow,
    isEditingByReactive,
    isEditingByOverlay,
    isEditingByOverlayLegacy,
    overlayMountSessionId: mountSessionId || null,
    overlayMountSwapCommitted: mountSwapCommitted,
    overlayMountSessionToken: Number.isFinite(Number(mountSession?.token))
      ? Number(mountSession.token)
      : null,
    renderAuthority,
    caretVisible,
    paintStable,
    overlayOwnsVisualAuthority,
    overlayDomPresentLoose,
    overlayFocused,
    overlayVisualReady,
    overlayLegacyExitHolding,
    overlayEngine: normalizedOverlayEngine,
    visibilityMode: normalizedVisibilityMode,
  };
}
