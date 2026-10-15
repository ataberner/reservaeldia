import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Group } from "konva/lib/Group.js";
import { Rect } from "konva/lib/shapes/Rect.js";
import { resolveCanonicalNodePose } from "./konvaCanonicalPose.js";

const source = await readFile(new URL("./konvaAuthoritativeBounds.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source.replace(
  '"@/components/editor/canvasEditor/konvaCanonicalPose"',
  JSON.stringify(new URL("./konvaCanonicalPose.js", import.meta.url).href)
)).toString("base64")}`;
const authority = await import(moduleUrl);

// Konva's real node/ancestor transforms without a DOM or canvas measurement.
// The dimensions stand for the already measured Text box; browser tests cover
// real Text measurement, wrapping, fonts and React consumers separately.
function textBox(attributes = {}, parentAttributes = null, stageAttributes = {}) {
  const stage = new Group(stageAttributes);
  stage.getStage = () => stage;
  stage.batchDraw = () => {};
  const parent = parentAttributes ? new Group(parentAttributes) : stage;
  if (parent !== stage) stage.add(parent);
  const node = new Rect({
    x: 400, y: 100, width: 200, height: 40, offsetX: 100, offsetY: 0,
    __canonicalPoseMode: "text-origin-offset",
    ...attributes,
  });
  parent.add(node);
  return { node, parent, stage, meta: { id: "text", tipo: "texto" } };
}

function near(actual, expected, label = "metric") {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} !== ${expected}`);
}

function rectNear(actual, expected) {
  assert.ok(actual, "authority must resolve a live box");
  for (const key of ["x", "y", "width", "height"]) near(actual[key], expected[key], key);
}

function transformPoint(point, attributes) {
  const x = (point.x - (attributes.offsetX ?? 0)) * (attributes.scaleX ?? 1);
  const y = (point.y - (attributes.offsetY ?? 0)) * (attributes.scaleY ?? 1);
  const skewedX = x + (attributes.skewX ?? 0) * y;
  const skewedY = y + (attributes.skewY ?? 0) * x;
  const radians = (attributes.rotation ?? 0) * Math.PI / 180;
  return {
    x: (attributes.x ?? 0) + skewedX * Math.cos(radians) - skewedY * Math.sin(radians),
    y: (attributes.y ?? 0) + skewedX * Math.sin(radians) + skewedY * Math.cos(radians),
  };
}

function expectedGeometry(attributes, parentAttributes = null) {
  const { width, height } = attributes;
  const corners = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }]
    .map((point) => transformPoint(point, attributes))
    .map((point) => parentAttributes ? transformPoint(point, parentAttributes) : point);
  const xs = corners.map((point) => point.x), ys = corners.map((point) => point.y);
  return {
    corners,
    rect: {
      x: Math.min(...xs), y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
    },
  };
}

test("GEO-03: 200x40 offset text rotated 90 degrees has the visual center (380, 100)", () => {
  const { node, meta } = textBox({ rotation: 90 });
  const rect = authority.resolveAuthoritativeTextRect(node, meta);
  near(rect.x + rect.width / 2, 380, "center X");
  near(rect.y + rect.height / 2, 100, "center Y");
  rectNear(rect, { x: 360, y: 0, width: 40, height: 200 });
});

for (const rotation of [0, 45, 90, 180, -45, -90]) {
  for (const align of ["left", "center", "right"]) {
    test(`live text box ${rotation} degrees / ${align} keeps offset, nonuniform scale and measured multiline height`, () => {
      const { node, meta } = textBox({ rotation, align, offsetY: 12, scaleX: 1.5, scaleY: 0.75, height: 96 });
      const originalAttributes = structuredClone(node.attrs);
      const originalPose = resolveCanonicalNodePose(node, meta);
      rectNear(authority.resolveAuthoritativeTextRect(node, meta), expectedGeometry(node.attrs).rect);
      assert.deepEqual(node.attrs, originalAttributes, "bounds are read-only");
      assert.deepEqual(resolveCanonicalNodePose(node, meta), originalPose, "persistible pose is unchanged");
    });
  }
}

test("inherited group transforms are included; stage transforms and CSS zoom are excluded", () => {
  const parentAttributes = { x: 30, y: 80, offsetX: 9, offsetY: 11, rotation: -25, scaleX: 1.25, scaleY: 0.8, skewX: 0.15 };
  const { node, meta, stage } = textBox(
    { rotation: 45, scaleX: -1.4, scaleY: 0.6, offsetY: 17 },
    parentAttributes,
    { x: 150, y: 200, rotation: 15, scaleX: 2, scaleY: 3 }
  );
  stage.container = () => ({ getBoundingClientRect: () => { throw new Error("CSS layout is not a canvas geometry authority"); } });
  rectNear(authority.resolveAuthoritativeTextRect(node, meta), expectedGeometry(node.attrs, parentAttributes).rect);
});

test("explicit ancestor coordinates exclude that ancestor's transform", () => {
  const { node, meta, parent } = textBox({ rotation: 90 }, { x: 100, y: 250, rotation: 45, scaleX: 2 });
  rectNear(authority.resolveAuthoritativeTextRect(node, meta, { relativeTo: parent }), expectedGeometry(node.attrs).rect);
});

test("a fallback position is a raw local node pose and its delta follows the transformed parent", () => {
  const parentAttributes = { x: 30, y: 80, rotation: 90, scaleX: 2, scaleY: 0.5 };
  const { node, meta } = textBox({ rotation: -45 }, parentAttributes);
  const originalAttributes = structuredClone(node.attrs);
  const fallbackPose = { x: 420, y: 125, rotation: 90 };
  rectNear(
    authority.resolveAuthoritativeTextRect(node, meta, { fallbackPose }),
    expectedGeometry({ ...node.attrs, ...fallbackPose }, parentAttributes).rect
  );
  assert.deepEqual(node.attrs, originalAttributes);
});

test("missing live dimensions never reinterpret a transformed fallback AABB as local text dimensions", () => {
  const { node, meta } = textBox({ rotation: 90 });
  node.width = () => undefined;
  assert.equal(authority.resolveAuthoritativeTextRect(node, meta, {
    fallbackRect: { x: 360, y: 0, width: 40, height: 200 },
  }), null);
});

test("an empty Text's measured zero width preserves its live origin and transform", () => {
  const { node, meta } = textBox({ width: 0, rotation: 45, offsetX: 10 });
  const geometry = authority.resolveAuthoritativeTextGeometry(node, meta);
  assert.ok(geometry, "zero measured width is valid empty Text geometry");
  assert.equal(geometry.localRect.width, 0);
  assert.deepEqual(geometry.transform, node.getAbsoluteTransform(node.getStage()).getMatrix());
  rectNear(geometry.rect, expectedGeometry(node.attrs).rect);
});

test("invalid measured dimensions fail closed without adopting fallback dimensions", () => {
  for (const width of [-1, NaN, Infinity, null, undefined]) {
    const { node, meta } = textBox();
    node.width = () => width;
    assert.equal(authority.resolveAuthoritativeTextGeometry(node, meta, {
      fallbackRect: { x: 300, y: 100, width: 200, height: 40 },
    }), null);
  }
});

test("non-text nodes do not acquire text authority", () => {
  const { node } = textBox({ __canonicalPoseMode: null });
  assert.equal(authority.resolveAuthoritativeTextRect(node, { tipo: "forma" }), null);
});

test("unrotated unscaled text retains its local box and previously accepted canvas bounds", () => {
  const { node, meta } = textBox();
  const geometry = authority.resolveAuthoritativeTextGeometry(node, meta);
  assert.deepEqual(geometry.localRect, { x: 0, y: 0, width: 200, height: 40 });
  assert.deepEqual(geometry.rect, { x: 300, y: 100, width: 200, height: 40 });
  assert.deepEqual(geometry.points, [300, 100, 500, 100, 500, 140, 300, 140]);
});

test("explicit null coordinate frame includes the stage transform once for viewport consumers", () => {
  const stageAttributes = { x: 20, y: 50, rotation: -15, scaleX: 2, scaleY: 3 };
  const { node, meta } = textBox({ rotation: 90 }, null, stageAttributes);
  const expected = expectedGeometry(node.attrs, stageAttributes);
  const geometry = authority.resolveAuthoritativeTextGeometry(node, meta, { relativeTo: null });
  rectNear(geometry.rect, expected.rect);
  geometry.points.forEach((value, i) => near(value, expected.corners.flatMap((point) => [point.x, point.y])[i]));
});

for (const rotation of [0, 45, 90]) {
  test(`shared text polygon and AABB apply eight-unit padding once at ${rotation} degrees`, () => {
    const { node, meta } = textBox({ rotation, scaleX: 2, scaleY: 0.5 });
    const geometry = authority.resolveAuthoritativeTextGeometry(node, meta, { padding: 8 });
    rectNear(geometry.localRect, { x: -4, y: -16, width: 208, height: 72 });
    const expected = [{ x: -4, y: -16 }, { x: 204, y: -16 }, { x: 204, y: 56 }, { x: -4, y: 56 }]
      .map((point) => transformPoint(point, node.attrs));
    geometry.points.forEach((value, i) => near(value, expected.flatMap((point) => [point.x, point.y])[i]));
    const [a, b, c, d, e, f] = geometry.transform;
    near(a * geometry.localRect.x + c * geometry.localRect.y + e, geometry.points[0]);
    near(b * geometry.localRect.x + d * geometry.localRect.y + f, geometry.points[1]);
    rectNear(authority.resolveAuthoritativeTextRect(node, meta, { padding: 8 }), geometry.rect);
  });
}

test("invalid live transform fails closed rather than returning object-data or client bounds", () => {
  const { node, meta } = textBox({ x: Infinity });
  assert.equal(authority.resolveAuthoritativeTextGeometry(node, meta, {
    fallbackRect: { x: 300, y: 100, width: 200, height: 40 },
  }), null);
});
