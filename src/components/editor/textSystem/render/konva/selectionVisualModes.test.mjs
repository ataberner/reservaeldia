import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveStageSelectionVisualMode,
  resolveTransformerVisualMode,
} from "./selectionVisualModes.js";

test("stage visual mode mounts the primary overlay for an idle committed selection", () => {
  const mode = resolveStageSelectionVisualMode({
    selectedIds: ["obj-1"],
    selectedObjects: [{ id: "obj-1", tipo: "texto" }],
    selectionActive: false,
    selectionArea: null,
    activeInlineEditingId: null,
    hasSectionDecorationEdit: false,
    isAnyCanvasDragActive: false,
    isImageRotateInteractionActive: false,
    predragVisualSelectionActive: false,
    isCanvasDragCoordinatorActive: false,
    isCanvasDragGestureActive: false,
    canvasInteractionActive: false,
    canvasInteractionSettling: false,
    dragVisualSelectionIds: [],
  });

  assert.deepEqual(mode, {
    showMarqueeRect: false,
    mountPrimarySelectionOverlay: true,
    showLineControls: false,
    showDragSelectionOverlay: false,
    dragOverlaySelectionIds: [],
    singleSelectedLineId: null,
  });
});

test("stage visual mode preserves marquee-only preview state", () => {
  const mode = resolveStageSelectionVisualMode({
    selectedIds: [],
    selectedObjects: [],
    selectionActive: true,
    selectionArea: { x: 10, y: 12, width: 40, height: 60 },
    activeInlineEditingId: null,
    hasSectionDecorationEdit: false,
  });

  assert.equal(mode.showMarqueeRect, true);
  assert.equal(mode.mountPrimarySelectionOverlay, false);
  assert.equal(mode.showDragSelectionOverlay, false);
});

test("stage visual mode enables line controls only for an idle single selected line", () => {
  const line = { id: "line-1", tipo: "forma", figura: "line" };

  const idleMode = resolveStageSelectionVisualMode({
    selectedIds: ["line-1"],
    selectedObjects: [line],
    isAnyCanvasDragActive: false,
    isImageRotateInteractionActive: false,
  });
  assert.equal(idleMode.mountPrimarySelectionOverlay, true);
  assert.equal(idleMode.showLineControls, true);
  assert.equal(idleMode.singleSelectedLineId, "line-1");

  const draggingMode = resolveStageSelectionVisualMode({
    selectedIds: ["line-1"],
    selectedObjects: [line],
    isAnyCanvasDragActive: true,
    isImageRotateInteractionActive: false,
  });
  assert.equal(draggingMode.showLineControls, false);
});

test("stage visual mode activates the drag overlay for predrag and keeps explicit overlay ids", () => {
  const mode = resolveStageSelectionVisualMode({
    selectedIds: ["obj-1"],
    selectedObjects: [{ id: "obj-1", tipo: "texto" }],
    predragVisualSelectionActive: true,
    dragVisualSelectionIds: ["obj-1", "obj-2"],
  });

  assert.equal(mode.showDragSelectionOverlay, true);
  assert.deepEqual(mode.dragOverlaySelectionIds, ["obj-1", "obj-2"]);
});

test("stage visual mode falls back to committed selection ids during coordinated drag overlay", () => {
  const mode = resolveStageSelectionVisualMode({
    selectedIds: ["obj-1", "obj-2"],
    selectedObjects: [
      { id: "obj-1", tipo: "texto" },
      { id: "obj-2", tipo: "imagen" },
    ],
    predragVisualSelectionActive: false,
    isCanvasDragCoordinatorActive: true,
    dragVisualSelectionIds: [],
  });

  assert.equal(mode.showDragSelectionOverlay, true);
  assert.deepEqual(mode.dragOverlaySelectionIds, ["obj-1", "obj-2"]);
});

test("stage visual mode suppresses the primary overlay during inline edit and decoration edit", () => {
  const inlineMode = resolveStageSelectionVisualMode({
    selectedIds: ["obj-1"],
    selectedObjects: [{ id: "obj-1", tipo: "texto" }],
    activeInlineEditingId: "obj-1",
    hasSectionDecorationEdit: false,
  });
  const decorationMode = resolveStageSelectionVisualMode({
    selectedIds: ["obj-1"],
    selectedObjects: [{ id: "obj-1", tipo: "texto" }],
    activeInlineEditingId: null,
    hasSectionDecorationEdit: true,
  });

  assert.equal(inlineMode.mountPrimarySelectionOverlay, false);
  assert.equal(decorationMode.mountPrimarySelectionOverlay, false);
});

test("transformer visual mode is none without selection", () => {
  const mode = resolveTransformerVisualMode({
    selectedIds: [],
    selectedObjects: [],
  });

  assert.equal(mode.renderMode, "none");
  assert.equal(mode.shouldUseGenericTransformer, false);
});

test("transformer visual mode resolves line selection to the line-indicator path", () => {
  const mode = resolveTransformerVisualMode({
    selectedIds: ["line-1"],
    selectedObjects: [{ id: "line-1", tipo: "forma", figura: "line" }],
  });

  assert.equal(mode.renderMode, "line-indicator");
  assert.equal(mode.shouldUseGenericTransformer, false);
});

test("transformer visual mode resolves idle non-line selection to the generic transformer", () => {
  const mode = resolveTransformerVisualMode({
    selectedIds: ["obj-1"],
    selectedObjects: [{ id: "obj-1", tipo: "texto" }],
    interactionLocked: false,
    effectiveDragging: false,
    isGallerySelection: false,
    shouldUseLightweightRotateOverlay: false,
  });

  assert.equal(mode.renderMode, "transformer");
  assert.equal(mode.shouldUseGenericTransformer, true);
  assert.deepEqual(mode.enabledAnchors, ["bottom-right"]);
  assert.equal(mode.rotateEnabled, true);
  assert.equal(mode.borderEnabled, true);
});

test("transformer visual mode suppresses rendering during deferred drag handoff", () => {
  const mode = resolveTransformerVisualMode({
    selectedIds: ["obj-1"],
    selectedObjects: [{ id: "obj-1", tipo: "texto" }],
    effectiveDragging: true,
    pendingDragSelectionId: "obj-2",
    pendingDragSelectionPhase: "deferred-drag",
  });

  assert.equal(mode.shouldSuppressDuringDeferredDrag, true);
  assert.equal(mode.renderMode, "none");
});

test("transformer visual mode hides itself during active drag once the drag overlay is ready", () => {
  const mode = resolveTransformerVisualMode({
    selectedIds: ["obj-1"],
    selectedObjects: [{ id: "obj-1", tipo: "texto" }],
    effectiveDragging: true,
    dragSelectionOverlayVisible: true,
    dragSelectionOverlayVisualReady: true,
    isResizeGestureActive: false,
    isTransformingResize: false,
  });

  assert.equal(mode.shouldHideTransformerDuringDrag, true);
  assert.equal(mode.renderMode, "none");
});

test("transformer visual mode suppresses its visuals for the drag overlay while keeping transformer mode", () => {
  const mode = resolveTransformerVisualMode({
    selectedIds: ["obj-1"],
    selectedObjects: [{ id: "obj-1", tipo: "texto" }],
    effectiveDragging: false,
    dragSelectionOverlayVisible: true,
    dragSelectionOverlayVisualReady: true,
    isResizeGestureActive: false,
    isTransformingResize: false,
    interactionLocked: false,
    shouldUseLightweightRotateOverlay: false,
    isGallerySelection: false,
  });

  assert.equal(mode.renderMode, "transformer");
  assert.equal(mode.shouldSuppressTransformerVisualsForDragOverlay, true);
  assert.deepEqual(mode.enabledAnchors, []);
  assert.equal(mode.rotateEnabled, false);
  assert.equal(mode.borderEnabled, false);
});

test("transformer visual mode matches current anchor and rotation disable rules for locked lightweight selections", () => {
  const mode = resolveTransformerVisualMode({
    selectedIds: ["obj-1"],
    selectedObjects: [{ id: "obj-1", tipo: "imagen" }],
    effectiveDragging: false,
    interactionLocked: true,
    shouldUseLightweightRotateOverlay: true,
    isGallerySelection: true,
  });

  assert.equal(mode.renderMode, "transformer");
  assert.deepEqual(mode.enabledAnchors, []);
  assert.equal(mode.rotateEnabled, false);
  assert.equal(mode.borderEnabled, false);
});
