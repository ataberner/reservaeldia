import test from "node:test";
import assert from "node:assert/strict";

import {
  clearMatchingPredragSelectionLock,
  readEditorSelectionRuntimeSnapshot,
  setEditorCommittedSelection,
  setEditorPendingDragSelection,
} from "../../../lib/editorSelectionRuntime.js";
import { resolveTransformerVisualMode } from "../textSystem/render/konva/selectionVisualModes.js";

function resolveCountdownTransformerMode(snapshot) {
  return resolveTransformerVisualMode({
    selectedIds: snapshot.selectedIds,
    selectedObjects: [{ id: "countdown-1", tipo: "countdown" }],
    pendingDragSelectionId: snapshot.pendingDragSelection.id,
    pendingDragSelectionPhase: snapshot.pendingDragSelection.phase,
    effectiveDragging: false,
    dragSelectionOverlayVisible: false,
    dragSelectionOverlayVisualReady: false,
    isResizeGestureActive: false,
    isTransformingResize: false,
    interactionLocked: false,
    shouldUseLightweightRotateOverlay: false,
    isGallerySelection: false,
  });
}

test("countdown click-without-drag clears matching predrag lock and restores selected-phase visual ownership", () => {
  const fakeWindow = {};

  setEditorCommittedSelection(["countdown-1"], {}, fakeWindow);
  setEditorPendingDragSelection(
    {
      id: "countdown-1",
      phase: "predrag",
    },
    {},
    fakeWindow
  );

  const preCancelSnapshot = readEditorSelectionRuntimeSnapshot(fakeWindow);
  const preCancelMode = resolveCountdownTransformerMode(preCancelSnapshot);

  assert.equal(preCancelMode.hasDragOverlayVisualOwnership, true);
  assert.equal(preCancelMode.shouldSuppressTransformerVisualsForDragOverlay, true);
  assert.equal(preCancelMode.borderEnabled, false);

  const cleared = clearMatchingPredragSelectionLock({
    elementId: "countdown-1",
    source: "countdown:predrag-cancel",
    targetWindow: fakeWindow,
  });

  assert.equal(cleared, true);
  assert.equal(fakeWindow._pendingDragSelectionId, null);
  assert.equal(fakeWindow._pendingDragSelectionPhase, null);

  const postCancelSnapshot = readEditorSelectionRuntimeSnapshot(fakeWindow);
  const postCancelMode = resolveCountdownTransformerMode(postCancelSnapshot);

  assert.deepEqual(postCancelSnapshot.selectedIds, ["countdown-1"]);
  assert.deepEqual(postCancelSnapshot.pendingDragSelection, {
    id: null,
    phase: null,
  });
  assert.equal(postCancelMode.hasDragOverlayVisualOwnership, false);
  assert.equal(postCancelMode.shouldSuppressTransformerVisualsForDragOverlay, false);
  assert.equal(postCancelMode.borderEnabled, true);
});

test("countdown predrag cleanup ignores other ids and non-predrag phases", () => {
  const fakeWindow = {};

  setEditorCommittedSelection(["countdown-1"], {}, fakeWindow);
  setEditorPendingDragSelection(
    {
      id: "countdown-2",
      phase: "predrag",
    },
    {},
    fakeWindow
  );

  assert.equal(
    clearMatchingPredragSelectionLock({
      elementId: "countdown-1",
      source: "countdown:predrag-cancel",
      targetWindow: fakeWindow,
    }),
    false
  );
  assert.deepEqual(
    readEditorSelectionRuntimeSnapshot(fakeWindow).pendingDragSelection,
    {
      id: "countdown-2",
      phase: "predrag",
    }
  );

  setEditorPendingDragSelection(
    {
      id: "countdown-1",
      phase: "deferred-drag",
    },
    {},
    fakeWindow
  );

  assert.equal(
    clearMatchingPredragSelectionLock({
      elementId: "countdown-1",
      source: "countdown:predrag-cancel",
      targetWindow: fakeWindow,
    }),
    false
  );
  assert.deepEqual(
    readEditorSelectionRuntimeSnapshot(fakeWindow).pendingDragSelection,
    {
      id: "countdown-1",
      phase: "deferred-drag",
    }
  );
});
