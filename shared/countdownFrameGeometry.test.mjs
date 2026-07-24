import test from "node:test";
import assert from "node:assert/strict";

import {
  COUNTDOWN_FRAME_SCALE_LIMITS,
  normalizeCountdownFrameScale,
  normalizeCountdownRect,
  resolveCountdownRectUnion,
  resolveContainedCountdownFrameRect,
  resolveCountdownBoundsXWithinCanvas,
  resolveCenteredScaledFrameRect,
  resolveCountdownSelectionGeometry,
  resolveCountdownFrameVisualBounds,
} from "./countdownFrameGeometry.js";

test("absent bounds are an explicit empty geometry, not a rect to dereference", () => {
  assert.deepEqual(normalizeCountdownRect(null), {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  assert.deepEqual(
    resolveCountdownRectUnion([
      null,
      undefined,
      { x: 12, y: 18, width: 140, height: 60 },
    ]),
    { x: 12, y: 18, width: 140, height: 60 }
  );
});

test("a countdown without frame uses content bounds as selection bounds", () => {
  const geometry = resolveCountdownSelectionGeometry({
    contentRects: [{ x: 20, y: 15, width: 180, height: 70 }],
    frameRects: [],
    frameScale: 5,
    fallbackRect: { x: 0, y: 0, width: 220, height: 100 },
  });

  assert.deepEqual(geometry.contentBounds, {
    x: 20,
    y: 15,
    width: 180,
    height: 70,
  });
  assert.equal(geometry.visualFrameBounds, null);
  assert.deepEqual(geometry.selectionBounds, geometry.contentBounds);
  assert.deepEqual(geometry.scaledFrameRects, []);
});

test("frame scale uses schema 2 additive defaults and bounded compatibility reads", () => {
  assert.deepEqual(COUNTDOWN_FRAME_SCALE_LIMITS, {
    min: 0.5,
    max: 5,
    default: 1,
  });
  assert.equal(normalizeCountdownFrameScale(undefined), 1);
  assert.equal(normalizeCountdownFrameScale("invalid"), 1);
  assert.equal(normalizeCountdownFrameScale(0.1), 0.5);
  assert.equal(normalizeCountdownFrameScale(1.5), 1.5);
  assert.equal(normalizeCountdownFrameScale(2), 2);
  assert.equal(normalizeCountdownFrameScale(3), 3);
  assert.equal(normalizeCountdownFrameScale(4), 4);
  assert.equal(normalizeCountdownFrameScale(5), 5);
  assert.equal(normalizeCountdownFrameScale(5.1), 5);
});

test("scaled frame rect keeps its center and aspect ratio", () => {
  const original = { x: 10, y: 20, width: 200, height: 100 };
  const scaled = resolveCenteredScaledFrameRect(original, 1.5);

  assert.deepEqual(scaled, {
    x: -40,
    y: -5,
    width: 300,
    height: 150,
    scale: 1.5,
  });
  assert.equal(scaled.x + scaled.width / 2, original.x + original.width / 2);
  assert.equal(scaled.y + scaled.height / 2, original.y + original.height / 2);
  assert.equal(scaled.width / scaled.height, original.width / original.height);
});

test("50% through 500% keep the same center and aspect ratio", () => {
  const original = { x: 0, y: 0, width: 240, height: 120 };
  for (const scale of [0.5, 1, 1.5, 2, 3, 4, 5]) {
    const scaled = resolveCenteredScaledFrameRect(original, scale);
    assert.equal(scaled.width, original.width * scale);
    assert.equal(scaled.height, original.height * scale);
    assert.equal(scaled.x + scaled.width / 2, 120);
    assert.equal(scaled.y + scaled.height / 2, 60);
    assert.equal(scaled.width / scaled.height, 2);
  }
});

test("preview visual bounds reserve overflow only when the frame grows", () => {
  assert.deepEqual(
    resolveCountdownFrameVisualBounds({
      width: 240,
      height: 120,
      frameScale: 0.5,
    }),
    { width: 240, height: 120, offsetX: 0, offsetY: 0, scale: 0.5 }
  );
  assert.deepEqual(
    resolveCountdownFrameVisualBounds({
      width: 240,
      height: 120,
      frameScale: 5,
    }),
    { width: 1200, height: 600, offsetX: 480, offsetY: 240, scale: 5 }
  );
});

test("preview visual bounds use each editorial frame instead of the whole countdown", () => {
  assert.deepEqual(
    resolveCountdownFrameVisualBounds({
      width: 220,
      height: 100,
      frameScale: 5,
      frameRects: [
        { x: 10, y: 20, width: 80, height: 60 },
        { x: 130, y: 20, width: 80, height: 60 },
      ],
    }),
    { width: 520, height: 300, offsetX: 150, offsetY: 100, scale: 5 }
  );
});

test("a square PNG is contained without deformation before frame scaling", () => {
  const contained = resolveContainedCountdownFrameRect({
    sourceWidth: 1600,
    sourceHeight: 1600,
    targetRect: { x: 0, y: 0, width: 320, height: 100 },
  });

  assert.deepEqual(contained, {
    x: 110,
    y: 0,
    width: 100,
    height: 100,
  });
});

test("selection bounds are the union of visible content and the scaled frame", () => {
  const base = {
    contentRects: [{ x: 40, y: 20, width: 240, height: 60 }],
    frameRects: [{ x: 110, y: 0, width: 100, height: 100 }],
    fallbackRect: { x: 0, y: 0, width: 320, height: 100 },
  };

  const at100 = resolveCountdownSelectionGeometry({
    ...base,
    frameScale: 1,
  });
  assert.deepEqual(at100.contentBounds, {
    x: 40,
    y: 20,
    width: 240,
    height: 60,
  });
  assert.deepEqual(at100.visualFrameBounds, {
    x: 110,
    y: 0,
    width: 100,
    height: 100,
  });
  assert.deepEqual(at100.selectionBounds, {
    x: 40,
    y: 0,
    width: 240,
    height: 100,
  });

  const at500 = resolveCountdownSelectionGeometry({
    ...base,
    frameScale: 5,
  });
  assert.deepEqual(at500.visualFrameBounds, {
    x: -90,
    y: -200,
    width: 500,
    height: 500,
  });
  assert.deepEqual(at500.selectionBounds, {
    x: -90,
    y: -200,
    width: 500,
    height: 500,
  });
});

test("insertion centers the visual selection and keeps it inside the canvas", () => {
  const bounds = { x: -90, y: -200, width: 500, height: 500 };
  const x = resolveCountdownBoundsXWithinCanvas({
    bounds,
    canvasWidth: 800,
  });
  assert.equal(x, 240);
  assert.equal(x + bounds.x, 150);
  assert.equal(x + bounds.x + bounds.width, 650);

  const oversized = resolveCountdownBoundsXWithinCanvas({
    bounds: { x: -400, y: 0, width: 1200, height: 100 },
    canvasWidth: 800,
  });
  assert.equal(oversized, 200);
});
