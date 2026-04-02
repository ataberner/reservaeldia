import test from "node:test";
import assert from "node:assert/strict";

import {
  allocateDragOverlayDriftSyncToken,
  createDragOverlayDriftPairingState,
  finalizeDragOverlayDriftPairingState,
  matchDragOverlayDriftOverlaySample,
  queuePendingDragOverlayDriftSample,
} from "./dragOverlayDriftPairing.js";

test("drag-overlay drift pairing only matches drag and overlay samples from the same sync token", () => {
  const sessionKey = "drag-overlay:1:obj-1";
  let state = createDragOverlayDriftPairingState(sessionKey);

  const firstToken = allocateDragOverlayDriftSyncToken(state, sessionKey);
  state = firstToken.nextState;
  state = queuePendingDragOverlayDriftSample(state, sessionKey, {
    syncToken: firstToken.syncToken,
    source: "element-drag-move",
  }).nextState;

  const firstMatch = matchDragOverlayDriftOverlaySample(state, sessionKey, {
    syncToken: firstToken.syncToken,
    source: "controlled-sync",
  });
  assert.equal(firstMatch.matched, true);
  assert.equal(firstMatch.dragSample?.syncToken, firstToken.syncToken);
  state = firstMatch.nextState;

  const secondToken = allocateDragOverlayDriftSyncToken(state, sessionKey);
  state = secondToken.nextState;
  state = queuePendingDragOverlayDriftSample(state, sessionKey, {
    syncToken: secondToken.syncToken,
    source: "element-drag-move",
  }).nextState;

  const staleOverlay = matchDragOverlayDriftOverlaySample(state, sessionKey, {
    syncToken: firstToken.syncToken,
    source: "controlled-sync",
  });
  assert.equal(staleOverlay.matched, false);
  assert.equal(staleOverlay.dragSample, null);
  assert.equal(staleOverlay.nextState.pendingDragSample?.syncToken, secondToken.syncToken);

  const secondMatch = matchDragOverlayDriftOverlaySample(
    staleOverlay.nextState,
    sessionKey,
    {
      syncToken: secondToken.syncToken,
      source: "controlled-sync",
    }
  );
  assert.equal(secondMatch.matched, true);
  assert.equal(secondMatch.dragSample?.syncToken, secondToken.syncToken);
  assert.equal(secondMatch.nextState.pendingDragSample, null);
});

test("drag-overlay drift pairing rolls unmatched drag samples into bounded sync misses", () => {
  const sessionKey = "drag-overlay:2:obj-1";
  let state = createDragOverlayDriftPairingState(sessionKey);

  const firstToken = allocateDragOverlayDriftSyncToken(state, sessionKey);
  state = firstToken.nextState;
  state = queuePendingDragOverlayDriftSample(state, sessionKey, {
    syncToken: firstToken.syncToken,
    source: "element-drag-move",
  }).nextState;

  const secondToken = allocateDragOverlayDriftSyncToken(state, sessionKey);
  state = secondToken.nextState;
  const queuedSecond = queuePendingDragOverlayDriftSample(state, sessionKey, {
    syncToken: secondToken.syncToken,
    source: "element-drag-move",
  });
  state = queuedSecond.nextState;

  assert.equal(queuedSecond.pendingMissedSync, true);
  assert.equal(state.syncMisses, 1);
  assert.equal(state.pendingDragSample?.syncToken, secondToken.syncToken);

  const finalized = finalizeDragOverlayDriftPairingState(state, sessionKey);
  assert.equal(finalized.syncMisses, 2);
  assert.equal(finalized.nextState.sessionKey, null);
  assert.equal(finalized.nextState.pendingDragSample, null);
});
