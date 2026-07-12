import test from "node:test";
import assert from "node:assert/strict";

import {
  getTouchAwareDragThreshold,
  isTouchLikePointerType,
  resolveTouchDragIntent,
} from "./editorTouchDragIntent.js";

test("touch vertical movement before hold resolves as scroll", () => {
  const decision = resolveTouchDragIntent({
    pointerType: "touch",
    deltaX: 2,
    deltaY: 18,
    elapsedMs: 80,
  });

  assert.equal(decision.decision, "scroll");
  assert.equal(decision.reason, "vertical-scroll-dominant");
});

test("brief touch below threshold remains pending for tap selection", () => {
  const decision = resolveTouchDragIntent({
    pointerType: "touch",
    deltaX: 2,
    deltaY: 3,
    elapsedMs: 60,
  });

  assert.equal(decision.decision, "pending");
  assert.equal(decision.reason, "below-threshold");
});

test("touch horizontal movement resolves as intentional drag", () => {
  const decision = resolveTouchDragIntent({
    pointerType: "touch",
    deltaX: 14,
    deltaY: 3,
    elapsedMs: 70,
  });

  assert.equal(decision.decision, "drag");
  assert.equal(decision.reason, "horizontal-drag-dominant");
});

test("touch vertical drag is still possible after a deliberate hold", () => {
  const decision = resolveTouchDragIntent({
    pointerType: "touch",
    deltaX: 1,
    deltaY: 16,
    elapsedMs: 220,
  });

  assert.equal(decision.decision, "drag");
  assert.equal(decision.reason, "vertical-drag-after-hold");
});

test("native scroll observation permanently favors scroll over drag", () => {
  const decision = resolveTouchDragIntent({
    pointerType: "touch",
    deltaX: 16,
    deltaY: 2,
    elapsedMs: 90,
    scrollDeltaY: 5,
  });

  assert.equal(decision.decision, "scroll");
  assert.equal(decision.reason, "native-scroll-observed");
});

test("small ambiguous diagonal waits instead of starting drag too early", () => {
  const decision = resolveTouchDragIntent({
    pointerType: "touch",
    deltaX: 8,
    deltaY: 9,
    elapsedMs: 90,
  });

  assert.equal(decision.decision, "pending");
  assert.equal(decision.reason, "ambiguous-diagonal");
});

test("mouse keeps immediate low-threshold drag behavior", () => {
  const decision = resolveTouchDragIntent({
    pointerType: "mouse",
    deltaX: 2,
    deltaY: 0,
    elapsedMs: 20,
    dragThresholdPx: 1,
  });

  assert.equal(decision.decision, "drag");
  assert.equal(decision.reason, "non-touch-threshold");
});

test("pointer helpers classify touch-like pointers and thresholds", () => {
  assert.equal(isTouchLikePointerType("touch"), true);
  assert.equal(isTouchLikePointerType("pen"), true);
  assert.equal(isTouchLikePointerType("mouse"), false);
  assert.equal(getTouchAwareDragThreshold("touch"), 10);
  assert.equal(getTouchAwareDragThreshold("pen"), 8);
  assert.equal(getTouchAwareDragThreshold("mouse", 5), 5);
});
