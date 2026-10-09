import test from "node:test";
import assert from "node:assert/strict";
import { GOOGLE_MAP_MIN_SIZE } from "../../../../../domain/eventDetails/googleMapGeometry.js";
import { resolveGoogleMapResizeBounds } from "./googleMapResizeBounds.js";

const INITIAL = Object.freeze({ x: 100, y: 100, width: 361, height: 220, rotation: 0 });

function resize(oldBox, patch, options = {}) {
  return resolveGoogleMapResizeBounds({
    oldBox, newBox: { ...oldBox, ...patch }, stageWidth: 800, stageHeight: 600, ...options,
  });
}

function corners(box) {
  const cos = Math.cos(box.rotation);
  const sin = Math.sin(box.rotation);
  return [[0, 0], [box.width, 0], [0, box.height], [box.width, box.height]]
    .map(([x, y]) => ({ x: box.x + cos * x - sin * y, y: box.y + sin * x + cos * y }));
}

test("map minimum clamps only the offending axis, including floating-point drift", () => {
  assert.deepEqual(resize(INITIAL, { width: 340, height: 199 }), {
    ...INITIAL, width: 340, height: GOOGLE_MAP_MIN_SIZE,
  });
  const minimum = { ...INITIAL, width: 400, height: GOOGLE_MAP_MIN_SIZE };
  assert.deepEqual(resize(minimum, { width: 450, height: 199.99999999999997 }), {
    ...minimum, width: 450,
  });
});

test("lateral handles preserve the inactive dimension and the rotated origin", () => {
  const oldBox = { ...INITIAL, x: 300, rotation: Math.PI / 6 };
  const proposed = { width: 420, height: 310, x: -900, y: -900, rotation: 2 };
  const horizontal = resize(oldBox, proposed, { activeAnchor: "middle-right" });
  assert.deepEqual(horizontal, { ...oldBox, width: 420 });
  const vertical = resize(oldBox, proposed, { activeAnchor: "bottom-center" });
  assert.equal(vertical.width, oldBox.width);
  assert.equal(vertical.x, oldBox.x);
  assert.equal(vertical.y, oldBox.y);
  assert.equal(vertical.rotation, oldBox.rotation);
  assert.ok(vertical.height > oldBox.height);
});

test("legacy boxes below the minimum grow gradually without changing an inactive axis", () => {
  const legacy = { ...INITIAL, width: 120, height: 100 };
  const first = resize(legacy, { width: 150, height: 80 }, { activeAnchor: "middle-right" });
  assert.deepEqual(first, { ...legacy, width: 150 });
  assert.equal(resize(first, { width: 140 }, { activeAnchor: "middle-right" }).width, 150);
  const recovered = resize(first, { width: 240 }, { activeAnchor: "middle-right" });
  assert.equal(recovered.width, 240);
  assert.equal(resize(recovered, { width: 190 }, { activeAnchor: "middle-right" }).width, GOOGLE_MAP_MIN_SIZE);
  assert.equal(recovered.height, 100);
});

test("the maximum is independent per axis and legacy oversized boxes can recover gradually", () => {
  const largeStage = { stageWidth: 3000, stageHeight: 3000 };
  assert.deepEqual(resize(INITIAL, { width: 1200, height: 450 }, largeStage), {
    ...INITIAL, width: 800, height: 450,
  });
  const legacy = { ...INITIAL, width: 1000, height: 900 };
  assert.deepEqual(resize(legacy, { width: 1100, height: 950 }, largeStage), legacy);
  const shrinking = resize(legacy, { width: 950, height: 850 }, largeStage);
  assert.deepEqual(shrinking, { ...legacy, width: 950, height: 850 });
});

test("one stage edge stops its axis while allowing the other to keep resizing", () => {
  const oldBox = { ...INITIAL, width: 640 };
  assert.deepEqual(resize(oldBox, { width: 720, height: 260 }), {
    ...oldBox, width: 700, height: 260,
  });
  const bottom = { ...INITIAL, y: 360 };
  assert.deepEqual(resize(bottom, { width: 400, height: 300 }), {
    ...bottom, width: 400, height: 240,
  });
});

test("existing stage overflow may improve but cannot be worsened by another resize", () => {
  const oldBox = { ...INITIAL, width: 750 };
  assert.deepEqual(resize(oldBox, { width: 720, height: 260 }), {
    ...oldBox, width: 720, height: 260,
  });
  assert.deepEqual(resize(oldBox, { width: 780, height: 260 }), {
    ...oldBox, height: 260,
  });
});

test("90-degree rotation constrains local axes against their corresponding stage edges", () => {
  const oldBox = { x: 300, y: 100, width: 200, height: 200, rotation: Math.PI / 2 };
  const next = resize(oldBox, { width: 600, height: 350 });
  assert.deepEqual(next, { ...oldBox, width: 500, height: 300 });
  for (const point of corners(next)) {
    assert.ok(point.x >= -1e-7 && point.x <= 800 + 1e-7);
    assert.ok(point.y >= -1e-7 && point.y <= 600 + 1e-7);
  }
});

test("oblique rotation preserves the corner and shares a joint edge along requested growth", () => {
  const oldBox = { x: 300, y: 100, width: 200, height: 200, rotation: Math.PI / 4 };
  const next = resize(oldBox, { width: 600, height: 400 });
  assert.equal(next.x, oldBox.x);
  assert.equal(next.y, oldBox.y);
  assert.equal(next.rotation, oldBox.rotation);
  assert.ok(Math.abs((next.width - 200) / (next.height - 200) - 2) < 1e-7);
  assert.ok(Math.abs(Math.max(...corners(next).map(({ y }) => y)) - 600) < 1e-7);
  for (const point of corners(next)) {
    assert.ok(point.x >= -1e-7 && point.x <= 800 + 1e-7);
    assert.ok(point.y >= -1e-7 && point.y <= 600 + 1e-7);
  }
});

test("a rotated top-edge limit does not freeze growth in the unrelated local axis", () => {
  const oldBox = { x: 100, y: 100, width: 200, height: 200, rotation: -Math.PI / 6 };
  const next = resize(oldBox, { width: 400, height: 300 });
  assert.ok(Math.abs(next.width - 200) < 1e-7);
  assert.equal(next.height, 300);
});

test("all rotation quadrants keep an initially contained box inside the stage", () => {
  for (let degrees = -180; degrees <= 180; degrees += 15) {
    const oldBox = { x: 800, y: 800, width: 320, height: 240, rotation: degrees * Math.PI / 180 };
    for (const activeAnchor of ["bottom-right", "middle-right", "bottom-center"]) {
      const next = resize(oldBox, { width: 1100, height: 900 }, {
        activeAnchor, stageWidth: 1600, stageHeight: 1600,
      });
      assert.equal(next.x, oldBox.x);
      assert.equal(next.y, oldBox.y);
      assert.ok(next.width >= GOOGLE_MAP_MIN_SIZE && next.width <= 800);
      assert.ok(next.height >= GOOGLE_MAP_MIN_SIZE && next.height <= 800);
      for (const point of corners(next)) {
        assert.ok(point.x >= -1e-7 && point.x <= 1600 + 1e-7, `${degrees} ${activeAnchor}: x containment`);
        assert.ok(point.y >= -1e-7 && point.y <= 1600 + 1e-7, `${degrees} ${activeAnchor}: y containment`);
      }
    }
  }
});

test("invalid proposals keep finite prior dimensions and invalid stage sizes add no phantom limits", () => {
  assert.deepEqual(resize(INITIAL, { width: NaN, height: Infinity, x: Infinity, y: NaN }), INITIAL);
  assert.deepEqual(resize(INITIAL, { width: 780, height: 750 }, { stageWidth: NaN, stageHeight: Infinity }), {
    ...INITIAL, width: 780, height: 750,
  });
  const malformed = resolveGoogleMapResizeBounds({ oldBox: null, newBox: { width: Infinity, height: NaN } });
  assert.deepEqual(malformed, { x: 0, y: 0, width: 200, height: 200, rotation: 0 });
  for (const value of Object.values(malformed)) assert.ok(Number.isFinite(value));
});

test("unsupported handles leave geometry unchanged and the inputs remain untouched", () => {
  const proposal = Object.freeze({ ...INITIAL, width: 440, height: 280 });
  assert.deepEqual(resolveGoogleMapResizeBounds({ oldBox: INITIAL, newBox: proposal, activeAnchor: "rotater" }), INITIAL);
  assert.deepEqual(resize(INITIAL, proposal), proposal);
  assert.equal(INITIAL.width, 361);
});
