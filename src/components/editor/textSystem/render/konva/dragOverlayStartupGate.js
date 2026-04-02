const NON_VISUAL_STARTUP_SOURCES = new Set([
  "predrag-seed",
  "drag-selection-seed",
  "controlled-seed",
  "group-drag-start",
]);

function normalizeSource(source) {
  const trimmed = String(source ?? "").trim();
  return trimmed || "unknown";
}

function ensureStartupGateSession(state, sessionKey = null) {
  const safeSessionKey = String(sessionKey ?? "").trim();
  if (!safeSessionKey) {
    return createDragOverlayStartupGateState();
  }
  if (state?.sessionKey === safeSessionKey) {
    return state;
  }
  return createDragOverlayStartupGateState(safeSessionKey);
}

export function createDragOverlayStartupGateState(sessionKey = null) {
  return {
    sessionKey: String(sessionKey ?? "").trim() || null,
    firstAuthoritativeDragSample: null,
    firstAuthoritativeSyncToken: null,
    firstVisibleFrameShown: false,
    bufferedSnapshot: null,
    pendingVisibleSnapshot: null,
  };
}

export function noteDragOverlayStartupAuthoritativeDrag(
  currentState,
  sessionKey = null,
  dragSample = null
) {
  const nextState = ensureStartupGateSession(currentState, sessionKey);
  if (!nextState.sessionKey || !dragSample) {
    return nextState;
  }
  if (nextState.firstAuthoritativeDragSample) {
    return nextState;
  }

  return {
    ...nextState,
    firstAuthoritativeDragSample: { ...dragSample },
    firstAuthoritativeSyncToken: dragSample.syncToken || null,
  };
}

export function resolveDragOverlayStartupApply(
  currentState,
  sessionKey = null,
  snapshot = null
) {
  const nextState = ensureStartupGateSession(currentState, sessionKey);
  if (!nextState.sessionKey || !snapshot) {
    return {
      nextState,
      shouldApply: false,
      startupVisibleEligible: false,
      reason: "startup-session-unavailable",
    };
  }

  if (nextState.firstVisibleFrameShown) {
    return {
      nextState: {
        ...nextState,
        bufferedSnapshot: null,
        pendingVisibleSnapshot: null,
      },
      shouldApply: true,
      startupVisibleEligible: true,
      reason: "startup-visible-established",
    };
  }

  const source = normalizeSource(snapshot.source);
  const syncToken = String(snapshot.syncToken ?? "").trim() || null;
  const firstAuthoritativeSyncToken =
    String(nextState.firstAuthoritativeSyncToken ?? "").trim() || null;
  const isFirstAuthoritativeSync = Boolean(
    source === "controlled-sync" &&
      syncToken &&
      firstAuthoritativeSyncToken &&
      syncToken === firstAuthoritativeSyncToken
  );

  if (isFirstAuthoritativeSync) {
    const visibleSnapshot = {
      ...snapshot,
      source,
      syncToken,
      startupVisibleEligible: true,
    };
    return {
      nextState: {
        ...nextState,
        bufferedSnapshot: null,
        pendingVisibleSnapshot: visibleSnapshot,
      },
      shouldApply: true,
      startupVisibleEligible: true,
      reason: "startup-first-authoritative-sync",
    };
  }

  const reason = NON_VISUAL_STARTUP_SOURCES.has(source)
    ? `startup-buffered:${source}`
    : "startup-waiting-for-authoritative-sync";

  return {
    nextState: {
      ...nextState,
      bufferedSnapshot: {
        source,
        syncToken,
      },
      pendingVisibleSnapshot:
        nextState.pendingVisibleSnapshot &&
        nextState.pendingVisibleSnapshot.syncToken === firstAuthoritativeSyncToken
          ? nextState.pendingVisibleSnapshot
          : null,
    },
    shouldApply: false,
    startupVisibleEligible: false,
    reason,
  };
}

export function markDragOverlayStartupFrameVisible(
  currentState,
  sessionKey = null,
  appliedSnapshot = null
) {
  const nextState = ensureStartupGateSession(currentState, sessionKey);
  if (!nextState.sessionKey) {
    return nextState;
  }

  const appliedSyncToken = String(appliedSnapshot?.syncToken ?? "").trim() || null;
  const firstAuthoritativeSyncToken =
    String(nextState.firstAuthoritativeSyncToken ?? "").trim() || null;

  if (
    firstAuthoritativeSyncToken &&
    appliedSyncToken &&
    appliedSyncToken !== firstAuthoritativeSyncToken
  ) {
    return nextState;
  }

  return {
    ...nextState,
    firstVisibleFrameShown: true,
    bufferedSnapshot: null,
    pendingVisibleSnapshot: null,
  };
}

export function getPendingDragOverlayStartupVisibleSnapshot(
  currentState,
  sessionKey = null
) {
  const nextState = ensureStartupGateSession(currentState, sessionKey);
  if (!nextState.sessionKey || nextState.firstVisibleFrameShown) {
    return null;
  }

  return nextState.pendingVisibleSnapshot
    ? { ...nextState.pendingVisibleSnapshot }
    : null;
}

export function canReplayDragOverlayStartupSnapshot(
  currentState,
  sessionKey = null,
  snapshot = null
) {
  const nextState = ensureStartupGateSession(currentState, sessionKey);
  if (!nextState.sessionKey || !snapshot) {
    return false;
  }

  return Boolean(
    nextState.firstVisibleFrameShown === true &&
      snapshot.startupVisibleEligible === true
  );
}
