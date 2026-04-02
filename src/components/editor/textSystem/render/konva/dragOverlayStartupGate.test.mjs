import test from "node:test";
import assert from "node:assert/strict";

import {
  canReplayDragOverlayStartupSnapshot,
  createDragOverlayStartupGateState,
  getPendingDragOverlayStartupVisibleSnapshot,
  markDragOverlayStartupFrameVisible,
  noteDragOverlayStartupAuthoritativeDrag,
  resolveDragOverlayStartupApply,
} from "./dragOverlayStartupGate.js";

test("startup gate keeps non-authoritative startup sources non-visual until first controlled sync", () => {
  const sessionKey = "drag-overlay:1:obj-1";
  let state = createDragOverlayStartupGateState(sessionKey);

  const seeded = resolveDragOverlayStartupApply(state, sessionKey, {
    source: "predrag-seed",
    syncToken: null,
  });
  state = seeded.nextState;

  assert.equal(seeded.shouldApply, false);
  assert.equal(seeded.startupVisibleEligible, false);
  assert.equal(seeded.reason, "startup-buffered:predrag-seed");
  assert.deepEqual(state.bufferedSnapshot, {
    source: "predrag-seed",
    syncToken: null,
  });

  state = noteDragOverlayStartupAuthoritativeDrag(state, sessionKey, {
    syncToken: "sync-1",
    source: "element-drag-move",
  });

  const firstControlledSync = resolveDragOverlayStartupApply(state, sessionKey, {
    source: "controlled-sync",
    syncToken: "sync-1",
  });

  assert.equal(firstControlledSync.shouldApply, true);
  assert.equal(firstControlledSync.startupVisibleEligible, true);
  assert.equal(firstControlledSync.reason, "startup-first-authoritative-sync");
  assert.equal(firstControlledSync.nextState.firstVisibleFrameShown, false);
  assert.equal(firstControlledSync.nextState.bufferedSnapshot, null);
  assert.equal(
    getPendingDragOverlayStartupVisibleSnapshot(
      firstControlledSync.nextState,
      sessionKey
    )?.syncToken,
    "sync-1"
  );
});

test("startup gate blocks startup replay until a visible authoritative frame exists", () => {
  const sessionKey = "drag-overlay:2:obj-1";
  let state = createDragOverlayStartupGateState(sessionKey);

  const buffered = resolveDragOverlayStartupApply(state, sessionKey, {
    source: "controlled-seed",
    syncToken: null,
  });
  state = buffered.nextState;

  assert.equal(
    canReplayDragOverlayStartupSnapshot(state, sessionKey, {
      startupVisibleEligible: false,
    }),
    false
  );

  state = noteDragOverlayStartupAuthoritativeDrag(state, sessionKey, {
    syncToken: "sync-2",
    source: "countdown-drag-move",
  });
  const firstControlledSync = resolveDragOverlayStartupApply(state, sessionKey, {
    source: "controlled-sync",
    syncToken: "sync-2",
  });
  state = firstControlledSync.nextState;

  assert.equal(
    canReplayDragOverlayStartupSnapshot(state, sessionKey, {
      startupVisibleEligible: true,
    }),
    false
  );

  state = markDragOverlayStartupFrameVisible(state, sessionKey, {
    syncToken: "sync-2",
  });

  assert.equal(
    canReplayDragOverlayStartupSnapshot(state, sessionKey, {
      startupVisibleEligible: true,
    }),
    true
  );
});

test("startup gate does not allow mismatched controlled sync tokens to show the first frame", () => {
  const sessionKey = "drag-overlay:3:obj-1";
  let state = createDragOverlayStartupGateState(sessionKey);

  state = noteDragOverlayStartupAuthoritativeDrag(state, sessionKey, {
    syncToken: "sync-3",
    source: "group-drag-move",
  });

  const mismatched = resolveDragOverlayStartupApply(state, sessionKey, {
    source: "controlled-sync",
    syncToken: "sync-4",
  });

  assert.equal(mismatched.shouldApply, false);
  assert.equal(mismatched.startupVisibleEligible, false);
  assert.equal(mismatched.reason, "startup-waiting-for-authoritative-sync");
  assert.equal(mismatched.nextState.firstVisibleFrameShown, false);
});

test("startup gate preserves the first authoritative visible snapshot until it is actually shown", () => {
  const sessionKey = "drag-overlay:4:obj-1";
  let state = createDragOverlayStartupGateState(sessionKey);

  state = noteDragOverlayStartupAuthoritativeDrag(state, sessionKey, {
    syncToken: "sync-5",
    source: "element-drag-move",
  });

  const firstControlledSync = resolveDragOverlayStartupApply(state, sessionKey, {
    source: "controlled-sync",
    syncToken: "sync-5",
    bounds: { kind: "rect", x: 10, y: 20, width: 30, height: 40 },
  });
  state = firstControlledSync.nextState;

  const laterControlledSync = resolveDragOverlayStartupApply(state, sessionKey, {
    source: "controlled-sync",
    syncToken: "sync-6",
    bounds: { kind: "rect", x: 50, y: 60, width: 30, height: 40 },
  });
  state = laterControlledSync.nextState;

  assert.deepEqual(
    getPendingDragOverlayStartupVisibleSnapshot(state, sessionKey)?.bounds,
    { kind: "rect", x: 10, y: 20, width: 30, height: 40 }
  );

  state = markDragOverlayStartupFrameVisible(state, sessionKey, {
    syncToken: "sync-5",
  });

  assert.equal(
    getPendingDragOverlayStartupVisibleSnapshot(state, sessionKey),
    null
  );
});
