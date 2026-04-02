export function createDragOverlayDriftPairingState(sessionKey = null) {
  return {
    sessionKey: sessionKey || null,
    syncSequence: 0,
    pendingDragSample: null,
    syncMisses: 0,
    lastDrift: null,
  };
}

function resolveStateForSession(state, sessionKey = null) {
  if (state?.sessionKey === (sessionKey || null)) {
    return state;
  }
  return createDragOverlayDriftPairingState(sessionKey);
}

export function allocateDragOverlayDriftSyncToken(state, sessionKey = null) {
  const currentState = resolveStateForSession(state, sessionKey);
  const nextSyncSequence = Number(currentState.syncSequence || 0) + 1;

  return {
    syncToken: `${sessionKey || "drag-overlay"}:sync:${nextSyncSequence}`,
    nextState: {
      ...currentState,
      sessionKey: sessionKey || null,
      syncSequence: nextSyncSequence,
    },
  };
}

export function queuePendingDragOverlayDriftSample(
  state,
  sessionKey = null,
  dragSample = null
) {
  const currentState = resolveStateForSession(state, sessionKey);
  const hasPendingMiss =
    Boolean(currentState.pendingDragSample?.syncToken) &&
    currentState.pendingDragSample.syncToken !== dragSample?.syncToken;

  return {
    pendingMissedSync: hasPendingMiss,
    nextState: {
      ...currentState,
      sessionKey: sessionKey || null,
      pendingDragSample: dragSample,
      syncMisses:
        Number(currentState.syncMisses || 0) + (hasPendingMiss ? 1 : 0),
    },
  };
}

export function matchDragOverlayDriftOverlaySample(
  state,
  sessionKey = null,
  overlaySample = null
) {
  const currentState = resolveStateForSession(state, sessionKey);
  const pendingDragSample = currentState.pendingDragSample || null;
  const isMatchedPair = Boolean(
    overlaySample?.syncToken &&
      pendingDragSample?.syncToken &&
      overlaySample.syncToken === pendingDragSample.syncToken
  );

  return {
    matched: isMatchedPair,
    dragSample: isMatchedPair ? pendingDragSample : null,
    overlaySample: isMatchedPair ? overlaySample : null,
    nextState: {
      ...currentState,
      sessionKey: sessionKey || null,
      pendingDragSample: isMatchedPair
        ? null
        : currentState.pendingDragSample,
    },
  };
}

export function finalizeDragOverlayDriftPairingState(state, sessionKey = null) {
  const currentState = sessionKey
    ? resolveStateForSession(state, sessionKey)
    : (state || createDragOverlayDriftPairingState(null));
  const hasPendingMiss = Boolean(currentState.pendingDragSample?.syncToken);

  return {
    syncMisses: Number(currentState.syncMisses || 0) + (hasPendingMiss ? 1 : 0),
    nextState: createDragOverlayDriftPairingState(null),
  };
}
