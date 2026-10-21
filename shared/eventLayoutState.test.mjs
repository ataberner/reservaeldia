import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEventLayoutState,
  normalizeEventLayoutPose,
  applyEventLayoutPose,
  stripEventLayoutTransientFields,
  resolveEventLayoutRenderObjects,
} from "./eventLayoutState.js";

function layout() {
  return { version: 1, materializedMode: "single", positionsByMode: {
    single: { a: { x: 999, y: 999 } },
    ceremony_party: { a: { x: 80, y: 40 }, bad: { x: NaN, y: 0 } },
  }, initialPositionsByMode: { single: { a: { x: 350, y: 40, width: 200 } }, ceremony_party: { a: { x: 80, y: 40 } } } };
}

test("normalization is read-only, coordinate-only and never creates layout for absent or unsupported data", () => {
  assert.equal(normalizeEventLayoutState(undefined), null);
  assert.equal(normalizeEventLayoutState({ ...layout(), version: 2 }), null);
  assert.equal(normalizeEventLayoutState({ ...layout(), initialPositionsByMode: {} }), null);
  const original = layout(); const before = structuredClone(original);
  const normalized = normalizeEventLayoutState(original);
  assert.deepEqual(original, before);
  assert.equal(normalized.positionsByMode.single, undefined);
  assert.equal(normalized.positionsByMode.ceremony_party.bad, undefined);
  assert.deepEqual(normalized.initialPositionsByMode.single.a, { x: 350, y: 40 });
});

test("pose normalization preserves finite zero, negatives and optional yNorm without truthy defaults", () => {
  assert.deepEqual(normalizeEventLayoutPose({ x: 0, y: -50, yNorm: 0 }), { x: 0, y: -50, yNorm: 0 });
  assert.equal(normalizeEventLayoutPose({ x: Infinity, y: 0 }), null);
  assert.equal(normalizeEventLayoutPose({ x: "0", y: 0 }), null);
  const object = { id: "a", x: 20, y: 40, yNorm: 0.8, width: 300, texto: "Current" };
  const result = applyEventLayoutPose(object, { x: 0, y: -20 });
  assert.deepEqual(result, { id: "a", x: 0, y: -20, width: 300, texto: "Current" });
  assert.equal(object.yNorm, 0.8);
});

test("active root coordinates win over stale active slot while inactive fallback changes only coordinates", () => {
  const objetos = [{ id: "a", seccionId: "s", x: 430, y: 70, width: 220, children: [{ id: "child", x: 2, y: 3 }] }];
  const secciones = [{ id: "s", eventLayout: layout() }];
  const active = resolveEventLayoutRenderObjects({ objetos, secciones, eventDetails: { mode: "single" }, markManaged: true });
  assert.equal(active[0].x, 430);
  assert.equal(active[0].__eventLayoutManaged, true);
  const inactive = resolveEventLayoutRenderObjects({ objetos, secciones, eventDetails: { mode: "ceremony_party" } });
  assert.equal(inactive[0].x, 80);
  assert.equal(inactive[0].width, 220);
  assert.deepEqual(inactive[0].children, objetos[0].children);
  assert.equal(objetos[0].x, 430);
});

test("transient marker strips recursively without changing clean canonical identity", () => {
  const clean = { id: "clean", children: [{ id: "child" }] };
  assert.equal(stripEventLayoutTransientFields(clean), clean);
  const dirty = { id: "a", __eventLayoutManaged: true, children: [{ id: "b", __eventLayoutManaged: true }] };
  assert.deepEqual(stripEventLayoutTransientFields(dirty), { id: "a", children: [{ id: "b" }] });
  assert.equal(dirty.__eventLayoutManaged, true);
});
