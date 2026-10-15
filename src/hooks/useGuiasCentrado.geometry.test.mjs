import assert from "node:assert/strict";
import test from "node:test";

import { applyGalleryLayoutPresetToRenderObject } from "../domain/gallery/galleryLayoutPresets.js";
import { resolveGalleryRenderLayout } from "../../shared/templates/galleryDynamicLayout.js";

import {
  resolveNodeSelectionRect,
  resolveGallerySelectionRect,
  useGuiasCentrado,
} from "./testSupport/loadGuideHook.mjs";

function nodeAt({ x = 0, y = 0, width = 20, height = 20, stage = {} } = {}) {
  return {
    x(value) { if (value !== undefined) x = value; return x; },
    y(value) { if (value !== undefined) y = value; return y; },
    rotation: () => 0,
    getStage: () => stage,
    getClientRect: () => ({ x, y, width, height }),
  };
}

function galleryFixture(layout, { x = 50, y = 70, stage = {} } = {}) {
  const object = {
    id: "gallery",
    tipo: "galeria",
    seccionId: "section",
    x,
    y,
    width: 400,
    height: 100, // Kept stale by a valid layout switch; never the live authority.
    gap: 8,
    ratio: "1:1",
    allowedLayouts: ["one_by_n", "two_by_n", "three_by_n"],
    defaultLayout: "two_by_n",
    currentLayout: layout,
    cells: Array.from({ length: 6 }, (_, i) => ({ mediaUrl: `https://example.test/${i}.jpg` })),
  };
  const rendered = applyGalleryLayoutPresetToRenderObject(object);
  const { totalHeight } = resolveGalleryRenderLayout({
    width: rendered.width,
    rows: rendered.rows,
    cols: rendered.cols,
    gap: rendered.gap,
    ratio: rendered.ratio,
    layoutMode: rendered.galleryLayoutMode,
    layoutType: rendered.galleryLayoutType,
    layoutBlueprint: rendered.galleryLayoutBlueprint,
    mediaUrls: object.cells.map((cell) => cell.mediaUrl),
    isMobile: false,
  });
  assert.notEqual(totalHeight, object.height, "fixture must discriminate the persisted-height bug");
  const node = nodeAt({ x, y, width: object.width + 40, height: totalHeight + 40, stage });
  const frame = {
    name: () => "gallery-transform-frame",
    getClientRect(options) {
      assert.equal(options.relativeTo, stage);
      assert.equal(options.skipTransform, false);
      assert.equal(options.skipShadow, true);
      assert.equal(options.skipStroke, true);
      return { x: node.x(), y: node.y(), width: object.width, height: totalHeight };
    },
  };
  node.findOne = (selector) => selector === ".gallery-transform-frame" ? frame : null;
  return { object, node, frame, totalHeight };
}

function createGuides(altura = 4000) {
  let lines = [];
  const hook = useGuiasCentrado({
    anchoCanvas: 800,
    elementMagnetRadius: 10,
    sectionMagnetRadius: 6,
    seccionesOrdenadas: [{ id: "section", altura }],
    onGuideLinesChange: (next) => { lines = next; },
  });
  return { ...hook, lines: () => lines };
}

function request(id) {
  return { elementId: id, sessionId: `drag-${id}`, dragMode: "single-element", pipeline: "individual" };
}

for (const layout of ["one_by_n", "two_by_n", "three_by_n"]) {
  test(`Gallery ${layout}: dragging aligns its live frame center, not persisted height or cell overlays`, () => {
    const stage = {};
    const { object, node, totalHeight } = galleryFixture(layout, { stage });
    const sectionHeight = 4000;
    const centeredY = sectionHeight / 2 - totalHeight / 2;
    node.x(201);
    node.y(centeredY + 1);
    const before = structuredClone(object);
    const guides = createGuides(sectionHeight);
    guides.mostrarGuias(request(object.id), [object], { current: { [object.id]: node } });

    assert.equal(node.x(), 200);
    assert.equal(node.y(), centeredY);
    assert.deepEqual(guides.lines().find((line) => line.type === "seccion-cy")?.points, [0, 2000, 800, 2000]);
    assert.deepEqual(object, before, "snap must not materialize dimensions or alter Gallery data");
  });

  test(`Gallery ${layout}: reference alignment uses the live frame center`, () => {
    const stage = {};
    const { object, node, totalHeight } = galleryFixture(layout, { stage });
    const centerY = node.y() + totalHeight / 2;
    const moving = { id: "moving", tipo: "forma", figura: "rect", seccionId: "section", width: 20, height: 20 };
    const movingNode = nodeAt({ x: 700, y: centerY - 10 + 1, stage });
    const objects = [object, moving];
    const refs = { current: { gallery: node, moving: movingNode } };
    const guides = createGuides();
    guides.prepararGuias(request("moving"), objects, refs);
    guides.mostrarGuias(request("moving"), objects, refs);

    assert.equal(movingNode.y(), centerY - 10);
    const horizontalLines = guides.lines().filter((line) => line.type === "reach-y");
    assert.ok(horizontalLines.length > 0);
    assert.ok(horizontalLines.every((line) => line.points[1] === centerY && line.points[3] === centerY));
  });
}

test("Gallery selection resolver accepts the frame itself and a missing-frame live fallback", () => {
  const stage = {};
  const { object, node, frame, totalHeight } = galleryFixture("two_by_n", { stage });
  assert.deepEqual(resolveGallerySelectionRect(object, frame, { relativeTo: stage }), {
    x: 50, y: 70, width: 400, height: totalHeight,
  });
  node.findOne = () => null;
  assert.deepEqual(resolveGallerySelectionRect(object, node, { relativeTo: stage }), node.getClientRect());
});

for (const { name, points, rect } of [
  { name: "vertical", points: [0, 0, 0, 100], rect: { x: 345, y: 195, width: 10, height: 110 } },
  { name: "horizontal", points: [0, 0, 100, 0], rect: { x: 345, y: 195, width: 110, height: 10 } },
  { name: "inverted horizontal ending at zero", points: [100, 0, 0, 0], rect: { x: 345, y: 195, width: 110, height: 10 } },
  { name: "inverted vertical ending at zero", points: [0, 100, 0, 0], rect: { x: 345, y: 195, width: 10, height: 110 } },
  { name: "negative endpoints", points: [0, 0, -80, -40], rect: { x: 265, y: 155, width: 90, height: 50 } },
  { name: "coincident zero endpoints", points: [0, 0, 0, 0], rect: { x: 345, y: 195, width: 10, height: 10 } },
  { name: "numeric string zero", points: ["0", "0", "0", "100"], rect: { x: 345, y: 195, width: 10, height: 110 } },
]) {
  test(`line selection preserves ${name} and existing five-unit padding`, () => {
    const object = { tipo: "forma", figura: "line", points };
    assert.deepEqual(resolveNodeSelectionRect(object, nodeAt({ x: 350, y: 200 })), rect);
  });
}

for (const points of [undefined, [], [null, "invalid", NaN, undefined], [Infinity, -Infinity, Infinity, NaN]]) {
  test(`line selection keeps default endpoints for missing/invalid data: ${String(points)}`, () => {
    const object = { tipo: "forma", figura: "line", points };
    assert.deepEqual(resolveNodeSelectionRect(object, nodeAt({ x: 350, y: 200 })), {
      x: 345, y: 195, width: 110, height: 10,
    });
  });
}

test("a vertical line near canvas center snaps its actual X and publishes the matching guide", () => {
  const object = { id: "line", tipo: "forma", figura: "line", seccionId: "section", points: [0, 0, 0, 100] };
  const node = nodeAt({ x: 399, y: 200 });
  const guides = createGuides();
  guides.mostrarGuias(request(object.id), [object], { current: { line: node } });
  assert.equal(node.x(), 400);
  assert.deepEqual(guides.lines().find((line) => line.type === "seccion-cx")?.points, [400, 0, 400, 4000]);
});
