import assert from "node:assert/strict";
import test from "node:test";
import { Layer } from "konva/lib/Layer.js";
import { Group } from "konva/lib/Group.js";
import { Rect } from "konva/lib/shapes/Rect.js";
import { DD } from "konva/lib/DragAndDrop.js";
import { Konva } from "konva/lib/Global.js";
import { createKonvaLayerHitDraw } from "./konvaLayerHitDraw.js";
import { activateKonvaLayerFreeze, deactivateKonvaLayerFreeze } from "./konvaLayerFreeze.js";

// Exercise installed Konva Layer/Container/Shape hit routing with a small pixel
// model. This does not measure browser rasterization or canvas performance.
function bitmap(width = 20, height = 10) {
  const pixels = new Set();
  let translation = [0, 0];
  let path = [];
  const saved = [];
  const paint = (x, y, w, h) => {
    for (let px = x; px < x + w; px++) {
      for (let py = y; py < y + h; py++) pixels.add(`${px},${py}`);
    }
  };
  const canvas = {
    width, height, pixelRatio: 1, pixels, clears: 0,
    _canvas: { pixels },
    getWidth() { return this.width; },
    getHeight() { return this.height; },
    getContext() { return context; },
  };
  const context = {
    clear() { canvas.clears++; pixels.clear(); },
    save() { saved.push([...translation]); },
    restore() { translation = saved.pop(); },
    transform(_a, _b, _c, _d, x, y) {
      translation[0] += x;
      translation[1] += y;
    },
    translate(x, y) { translation[0] += x; translation[1] += y; },
    beginPath() { path = []; },
    rect(x, y, w, h) { path.push([x + translation[0], y + translation[1], w, h]); },
    closePath() {},
    clip() {},
    _applyLineJoin() {},
    fillStrokeShape() { for (const rectangle of path) paint(...rectangle); },
    fillRect(x, y, w, h) { paint(x + translation[0], y + translation[1], w, h); },
    drawImage(source) {
      for (const pixel of source.pixels) {
        const [x, y] = pixel.split(",").map(Number);
        paint(x + translation[0], y + translation[1], 1, 1);
      }
    },
  };
  return canvas;
}

function fixture(factory = createKonvaLayerHitDraw) {
  // Group supplies actual Node/Container state without Layer's DOM constructor.
  const layer = new Group();
  Object.setPrototypeOf(layer, Layer.prototype);
  layer.hitCanvas = bitmap();
  layer.batchDraw = () => layer;
  layer._requestDraw = () => {};
  layer.drawScene = () => layer;
  const calls = [];
  const original = function (...args) {
    calls.push({ receiver: this, args });
    return Layer.prototype.drawHit.apply(this, args);
  };
  layer.drawHit = factory(layer, original);
  return { layer, calls, original, hit: layer.hitCanvas };
}

function rectangle(layer, attrs = {}) {
  const node = new Rect({ x: 2, y: 3, width: 2, height: 2, fill: "red", ...attrs });
  layer.add(node);
  return node;
}

function setDrag(node, status = "dragging") {
  DD._dragElements.set(node._id, { node, dragStatus: status });
}

function clearDrag(node) {
  DD._dragElements.delete(node._id);
}

test("reuses a cleared bitmap but preserves the first clear of previous hit targets", () => {
  function exercise(factory) {
    const { layer, hit } = fixture(factory);
    rectangle(layer);
    layer.drawHit();
    assert.equal(hit.pixels.has("2,3"), true);
    layer.listening(false);
    const before = hit.clears;
    assert.equal(layer.drawHit(), layer);
    assert.equal(hit.pixels.size, 0, "old targets disappear on the first skipped hit graph");
    assert.equal(layer.drawHit(), layer);
    assert.equal(hit.pixels.size, 0);
    return hit.clears - before;
  }
  assert.equal(exercise((_layer, original) => original), 2, "installed Konva baseline clears twice");
  assert.equal(exercise(createKonvaLayerHitDraw), 1, "same routing avoids only the repeated clear");
});

test("real drag eligibility clears old hits and reconstructs the final position on release", () => {
  const { layer, hit } = fixture();
  const node = rectangle(layer);
  layer.drawHit();
  setDrag(node);
  try {
    layer.drawHit();
    const afterFirst = hit.clears;
    node.x(9);
    layer.drawHit();
    assert.equal(hit.clears, afterFirst);
    assert.equal(hit.pixels.size, 0);
    setDrag(node, "stopped");
    layer.drawHit();
    assert.equal(hit.pixels.has("2,3"), false);
    assert.equal(hit.pixels.has("9,3"), true);
  } finally {
    clearDrag(node);
  }
});

test("eligible overlay with ineligible children reuses empty hits and sees newly eligible children", () => {
  const { layer, hit } = fixture();
  const node = rectangle(layer, { listening: false });
  assert.equal(layer.shouldDrawHit(), true);
  layer.drawHit();
  layer.drawHit();
  assert.equal(hit.clears, 1);
  node.listening(true);
  layer.drawHit();
  assert.equal(hit.pixels.has("2,3"), true);
  node.visible(false);
  layer.drawHit();
  layer.drawHit();
  assert.equal(hit.pixels.size, 0);
  const beforeAdd = hit.clears;
  rectangle(layer, { x: 12 });
  layer.drawHit();
  assert.equal(hit.clears, beforeAdd + 1);
  assert.equal(hit.pixels.has("12,3"), true);
});

test("replacement canvas and changed dimensions require a new normal clear", () => {
  const { layer, hit } = fixture();
  layer.drawHit();
  layer.drawHit();
  assert.equal(hit.clears, 1);
  const replacement = bitmap();
  replacement.pixels.add("1,1");
  layer.hitCanvas = replacement;
  layer.drawHit();
  assert.equal(replacement.pixels.size, 0);
  assert.equal(replacement.clears, 1);
  replacement.width += 1;
  layer.drawHit();
  assert.equal(replacement.clears, 2);
  replacement.height += 1;
  layer.drawHit();
  assert.equal(replacement.clears, 3);
});

test("custom arguments, including explicit undefined, delegate and invalidate prior evidence", () => {
  const { layer, calls, hit } = fixture();
  layer.drawHit();
  layer.drawHit(undefined);
  assert.deepEqual(calls.at(-1).args, [undefined]);
  layer.drawHit();
  assert.equal(hit.clears, 3);
  const node = rectangle(layer);
  const destination = bitmap();
  layer.drawHit(destination, layer);
  assert.equal(calls.at(-1).args[0], destination);
  assert.equal(calls.at(-1).args[1], layer);
  assert.equal(destination.pixels.has("2,3"), true);
  node.listening(false);
  layer.drawHit();
  assert.equal(hit.pixels.size, 0);
});

test("clearBeforeDraw false always delegates and returning to true clears normally", () => {
  const { layer, calls, hit } = fixture();
  layer.drawHit();
  layer.clearBeforeDraw(false);
  hit.pixels.add("1,1");
  layer.drawHit();
  layer.drawHit();
  assert.equal(calls.length, 3);
  assert.equal(hit.clears, 1);
  assert.equal(hit.pixels.has("1,1"), true);
  layer.clearBeforeDraw(true);
  layer.drawHit();
  assert.equal(hit.clears, 2);
  assert.equal(hit.pixels.size, 0);
});

test("another receiver delegates with its arguments and invalidates owner evidence", () => {
  const owner = fixture();
  const other = fixture();
  owner.layer.drawHit();
  owner.layer.drawHit.call(other.layer, undefined);
  assert.equal(owner.calls.at(-1).receiver, other.layer);
  assert.deepEqual(owner.calls.at(-1).args, [undefined]);
  assert.equal(other.hit.clears, 1);
  owner.layer.drawHit();
  assert.equal(owner.hit.clears, 2);
});

test("a throwing delegated draw invalidates previous empty evidence", () => {
  const { layer, hit, original } = fixture();
  let fail = false;
  layer.drawHit = createKonvaLayerHitDraw(layer, function (...args) {
    if (fail) {
      hit.pixels.add("1,1");
      throw new Error("draw failed");
    }
    return original.apply(this, args);
  });
  layer.drawHit();
  fail = true;
  assert.throws(() => layer.drawHit(undefined), /draw failed/);
  fail = false;
  layer.drawHit();
  assert.equal(hit.pixels.size, 0);
  assert.equal(hit.clears, 2);
});

test("layer cache paints its hit image even when it has no eligible children", () => {
  const { layer, hit } = fixture();
  layer.drawHit();
  const cached = bitmap();
  cached.pixels.add("4,4");
  layer._cache.set("canvas", { hit: cached, x: 0, y: 0 });
  layer.drawHit();
  layer.drawHit();
  assert.equal(hit.clears, 3);
  assert.equal(hit.pixels.has("4,4"), true);
  layer._cache.delete("canvas");
  layer.drawHit();
  layer.drawHit();
  assert.equal(hit.clears, 4);
  assert.equal(hit.pixels.size, 0);
});

test("a layer clip function may paint before skipped children and must run each time", () => {
  const { layer, hit } = fixture();
  layer.drawHit();
  let clips = 0;
  layer.clipFunc((context) => { clips++; context.fillRect(6, 6, 1, 1); });
  layer.drawHit();
  layer.drawHit();
  assert.equal(clips, 2);
  assert.equal(hit.pixels.has("6,6"), true);
  assert.equal(hit.clears, 3);
});

test("rectangular clipping does not itself paint when all children are ineligible", () => {
  const { layer, hit } = fixture();
  layer.clip({ x: 0, y: 0, width: 10, height: 10 });
  rectangle(layer, { listening: false });
  layer.drawHit();
  layer.drawHit();
  assert.equal(hit.clears, 1);
  assert.equal(hit.pixels.size, 0);
});

test("ineligible cached child groups do not run cached hits or their custom clipping", () => {
  const { layer, hit } = fixture();
  const group = new Group({ listening: false, clipFunc() { assert.fail("skipped group clip ran"); } });
  const cached = bitmap();
  cached.pixels.add("4,4");
  group._cache.set("canvas", { hit: cached, x: 0, y: 0 });
  layer.add(group);
  layer.drawHit();
  layer.drawHit();
  assert.equal(hit.clears, 1);
  assert.equal(hit.pixels.size, 0);
});

test("a child with its own drawHit is conservatively delegated", () => {
  const { layer, hit } = fixture();
  const node = rectangle(layer, { listening: false });
  layer.drawHit();
  let customDraws = 0;
  node.drawHit = function (canvas) {
    customDraws++;
    canvas.getContext().fillRect(5, 5, 1, 1);
    return this;
  };
  layer.drawHit();
  layer.drawHit();
  assert.equal(customDraws, 2);
  assert.equal(hit.pixels.has("5,5"), true);
  assert.equal(hit.clears, 3);
});

test("opacity and scene compositing do not make a listening hit shape empty", () => {
  const { layer, hit } = fixture();
  rectangle(layer, { opacity: 0, globalCompositeOperation: "destination-out" });
  layer.drawHit();
  layer.drawHit();
  assert.equal(hit.clears, 2);
  assert.equal(hit.pixels.has("2,3"), true);
});

test("real freeze wrapper cannot establish empty evidence and thaw rebuilds eligible hits", () => {
  const { layer, hit } = fixture();
  const node = rectangle(layer);
  layer.drawHit();
  const optimized = layer.drawHit;
  activateKonvaLayerFreeze(layer);
  layer.drawHit();
  assert.equal(hit.pixels.has("2,3"), true, "freeze itself did not clear the bitmap");
  deactivateKonvaLayerFreeze(layer, { batchDraw: false });
  assert.equal(layer.drawHit, optimized);
  layer.listening(false);
  layer.drawHit();
  layer.drawHit();
  assert.equal(hit.clears, 2);
  assert.equal(hit.pixels.size, 0);
  activateKonvaLayerFreeze(layer);
  node.x(10);
  deactivateKonvaLayerFreeze(layer, { batchDraw: false });
  layer.listening(true);
  layer.drawHit();
  assert.equal(hit.pixels.has("10,3"), true);
});

test("an active freeze marker prevents reuse even if this helper is invoked directly", () => {
  const { layer, hit } = fixture();
  layer.drawHit();
  layer.__canvasFreezeState = {};
  layer.drawHit();
  layer.drawHit();
  assert.equal(hit.clears, 3);
  delete layer.__canvasFreezeState;
  layer.drawHit();
  layer.drawHit();
  assert.equal(hit.clears, 4);
});

test("Konva hitOnDragEnabled and transform eligibility changes rebuild hit targets", () => {
  const { layer, hit } = fixture();
  const node = rectangle(layer);
  const originalHitOnDrag = Konva.hitOnDragEnabled;
  const originalTransforming = Konva.isTransforming;
  setDrag(node);
  try {
    Konva.hitOnDragEnabled = false;
    layer.drawHit();
    layer.drawHit();
    assert.equal(hit.clears, 1);
    Konva.hitOnDragEnabled = true;
    layer.drawHit();
    assert.equal(hit.pixels.has("2,3"), true);
    clearDrag(node);
    Konva.hitOnDragEnabled = false;
    Konva.isTransforming = () => true;
    layer.drawHit();
    layer.drawHit();
    assert.equal(hit.pixels.size, 0);
    assert.equal(hit.clears, 3);
    Konva.isTransforming = () => false;
    layer.drawHit();
    assert.equal(hit.pixels.has("2,3"), true);
  } finally {
    clearDrag(node);
    Konva.hitOnDragEnabled = originalHitOnDrag;
    Konva.isTransforming = originalTransforming;
  }
});
