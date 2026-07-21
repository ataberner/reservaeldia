import test from "node:test";
import assert from "node:assert/strict";

import {
  TOUCH_DRAG_INTENT_DEFAULTS,
  allowNativeTouchScrollOnKonvaPress,
  claimNativeTouchDrag,
  getTouchAwareDragThreshold,
  isTouchLikePointerType,
  releaseNativeTouchScrollOnKonvaPress,
  resolveTouchDragIntent,
} from "./editorTouchDragIntent.js";

test("touch vertical movement resolves as scroll", () => {
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

test("a pause before vertical movement still resolves as scroll", () => {
  const decision = resolveTouchDragIntent({
    pointerType: "touch",
    deltaX: 1,
    deltaY: 16,
    elapsedMs: 2_000,
  });

  assert.equal(decision.decision, "scroll");
  assert.equal(decision.reason, "vertical-scroll-dominant");
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

test("vertical-leaning diagonal movement favors scroll", () => {
  const decision = resolveTouchDragIntent({
    pointerType: "touch",
    deltaX: 12,
    deltaY: 15,
    elapsedMs: 90,
  });

  assert.equal(decision.decision, "scroll");
  assert.equal(decision.reason, "vertical-scroll-dominant");
});

test("large horizontal-leaning diagonal movement remains an intentional drag", () => {
  const decision = resolveTouchDragIntent({
    pointerType: "touch",
    deltaX: 13.2,
    deltaY: 13,
    elapsedMs: 90,
  });

  assert.equal(decision.decision, "drag");
  assert.equal(decision.reason, "diagonal-drag-distance");
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
  assert.equal(TOUCH_DRAG_INTENT_DEFAULTS.verticalDominanceRatio, 1);
});

function createKonvaPreventDefaultNode(initialValue, calls, label) {
  let value = Boolean(initialValue);
  return {
    preventDefault(nextValue) {
      if (arguments.length === 0) return value;
      value = Boolean(nextValue);
      calls.push(`${label}:${value}`);
      return this;
    },
    readPreventDefault() {
      return value;
    },
  };
}

test("Konva native-scroll lease changes only touch-like hit targets and restores once", () => {
  const calls = [];
  const touchTarget = createKonvaPreventDefaultNode(true, calls, "touch-target");
  const mouseTarget = createKonvaPreventDefaultNode(true, calls, "mouse-target");

  const touchLease = allowNativeTouchScrollOnKonvaPress({
    evt: { pointerType: "touch" },
    target: touchTarget,
  });
  assert.ok(touchLease);
  assert.equal(touchTarget.readPreventDefault(), false);
  assert.equal(
    allowNativeTouchScrollOnKonvaPress({
      evt: { pointerType: "touch" },
      target: touchTarget,
    }),
    touchLease
  );

  assert.equal(
    allowNativeTouchScrollOnKonvaPress({
      evt: { pointerType: "mouse" },
      target: mouseTarget,
    }),
    null
  );
  assert.equal(mouseTarget.readPreventDefault(), true);

  assert.equal(releaseNativeTouchScrollOnKonvaPress(touchLease), true);
  assert.equal(touchTarget.readPreventDefault(), true);
  assert.equal(releaseNativeTouchScrollOnKonvaPress(touchLease), false);
  assert.deepEqual(calls, ["touch-target:false", "touch-target:true"]);
});

test("claiming touch drag restores lease and node ownership before preventing native move", () => {
  const calls = [];
  const hitTarget = createKonvaPreventDefaultNode(true, calls, "hit");
  const dragNode = createKonvaPreventDefaultNode(false, calls, "drag");
  const lease = allowNativeTouchScrollOnKonvaPress({
    evt: { pointerType: "pen" },
    target: hitTarget,
  });
  const nativeEvent = {
    pointerType: "pen",
    cancelable: true,
    preventDefault() {
      calls.push("native:prevented");
    },
  };

  const result = claimNativeTouchDrag({ lease, dragNode, nativeEvent });

  assert.deepEqual(result, {
    claimed: true,
    leaseReleased: true,
    dragNodeClaimed: true,
    nativeDefaultPrevented: true,
  });
  assert.deepEqual(calls, [
    "hit:false",
    "hit:true",
    "drag:true",
    "native:prevented",
  ]);
});
