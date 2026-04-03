import test from "node:test";
import assert from "node:assert/strict";

import { resolveDragOverlayShownEmission } from "./dragOverlayVisibilityLifecycle.js";

test("drag-overlay shown emission fires once for the active visible session", () => {
  const result = resolveDragOverlayShownEmission({
    lastShownSessionKey: null,
    activeSession: {
      sessionKey: "drag-overlay:10:obj-1",
      selectedIdsDigest: "obj-1",
      phase: "drag",
      interactionEpoch: 3,
    },
    visibilitySample: {
      lifecycleKey: "drag-overlay:10:obj-1",
      source: "controlled-sync",
      syncToken: "sync-10",
      bounds: { kind: "rect", x: 10, y: 20, width: 30, height: 40 },
    },
    selectedIdsDigest: "obj-1",
    dragOverlaySelectionIdsDigest: "obj-1",
  });

  assert.equal(result.shouldEmit, true);
  assert.equal(result.nextShownSessionKey, "drag-overlay:10:obj-1");
  assert.deepEqual(result.payload, {
    source: "stage-composer",
    overlaySource: "controlled-sync",
    dragOverlaySelectionIds: "obj-1",
    selectedIds: "obj-1",
    dragOverlaySessionKey: "drag-overlay:10:obj-1",
    phase: "drag",
    interactionEpoch: 3,
    syncToken: "sync-10",
    bounds: { kind: "rect", x: 10, y: 20, width: 30, height: 40 },
  });
});

test("drag-overlay shown emission skips frames that do not belong to the active session", () => {
  const result = resolveDragOverlayShownEmission({
    lastShownSessionKey: null,
    activeSession: {
      sessionKey: "drag-overlay:10:obj-1",
      selectedIdsDigest: "obj-1",
      phase: "drag",
      interactionEpoch: 3,
    },
    visibilitySample: {
      lifecycleKey: "drag-overlay:11:obj-2",
      source: "controlled-sync",
      syncToken: "sync-11",
    },
    selectedIdsDigest: "obj-1",
    dragOverlaySelectionIdsDigest: "obj-1",
  });

  assert.equal(result.shouldEmit, false);
  assert.equal(result.reason, "inactive-session");
  assert.equal(result.payload, null);
});

test("drag-overlay shown emission does not duplicate within the same session", () => {
  const result = resolveDragOverlayShownEmission({
    lastShownSessionKey: "drag-overlay:10:obj-1",
    activeSession: {
      sessionKey: "drag-overlay:10:obj-1",
      selectedIdsDigest: "obj-1",
      phase: "drag",
      interactionEpoch: 3,
    },
    visibilitySample: {
      lifecycleKey: "drag-overlay:10:obj-1",
      source: "controlled-sync",
      syncToken: "sync-10",
    },
    selectedIdsDigest: "obj-1",
    dragOverlaySelectionIdsDigest: "obj-1",
  });

  assert.equal(result.shouldEmit, false);
  assert.equal(result.reason, "already-emitted");
  assert.equal(result.payload, null);
});
