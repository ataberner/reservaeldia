function normalizeString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeInteractionEpoch(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

export function resolveDragOverlayShownEmission({
  lastShownSessionKey = null,
  activeSession = null,
  visibilitySample = null,
  selectedIdsDigest = null,
  dragOverlaySelectionIdsDigest = null,
} = {}) {
  const activeSessionKey = normalizeString(activeSession?.sessionKey);
  const sampleSessionKey =
    normalizeString(visibilitySample?.lifecycleKey) ||
    normalizeString(visibilitySample?.boxFlowIdentity);

  if (!activeSessionKey || !sampleSessionKey || activeSessionKey !== sampleSessionKey) {
    return {
      shouldEmit: false,
      nextShownSessionKey: normalizeString(lastShownSessionKey),
      reason: "inactive-session",
      payload: null,
    };
  }

  if (normalizeString(lastShownSessionKey) === sampleSessionKey) {
    return {
      shouldEmit: false,
      nextShownSessionKey: sampleSessionKey,
      reason: "already-emitted",
      payload: null,
    };
  }

  return {
    shouldEmit: true,
    nextShownSessionKey: sampleSessionKey,
    reason: "first-visible-frame",
    payload: {
      source: "stage-composer",
      overlaySource: normalizeString(visibilitySample?.source),
      dragOverlaySelectionIds:
        normalizeString(dragOverlaySelectionIdsDigest) ||
        normalizeString(activeSession?.selectedIdsDigest) ||
        "",
      selectedIds:
        normalizeString(selectedIdsDigest) ||
        normalizeString(activeSession?.selectedIdsDigest) ||
        "",
      dragOverlaySessionKey: sampleSessionKey,
      phase: normalizeString(activeSession?.phase),
      interactionEpoch: normalizeInteractionEpoch(activeSession?.interactionEpoch),
      syncToken: normalizeString(visibilitySample?.syncToken),
      bounds: visibilitySample?.bounds || null,
    },
  };
}
