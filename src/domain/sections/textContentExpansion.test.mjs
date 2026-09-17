import test from "node:test";
import assert from "node:assert/strict";
import { expandSectionsForTextChanges } from "./textContentExpansion.js";

const section = { id: "story", altura: 100, altoModo: "fijo", fondo: "white" };
const text = { id: "text", tipo: "texto", seccionId: "story", y: 70, texto: "one" };
const measureTextBottom = ({ object, text: content, rootObject }) =>
  object.y + (rootObject === object ? 0 : rootObject.y) + String(content).split("\n").length * 20;
const expand = (previousObjects, nextObjects, sections = [section], measure = measureTextBottom) =>
  expandSectionsForTextChanges({ previousObjects, nextObjects, sections, measureTextBottom: measure });

test("grows only to the changed text bottom and preserves every object and other section", () => {
  const image = { id: "image", tipo: "imagen", seccionId: "story", y: 800, height: 200 };
  const nextText = { ...text, texto: "one\ntwo\nthree" };
  const before = [text, image];
  const after = [nextText, image];
  const snapshot = structuredClone({ before, after });
  const other = { id: "following", altura: 80 };
  const result = expand(before, after, [section, other]);
  assert.deepEqual(result[0], { ...section, altura: 130 });
  assert.equal(result[1], other);
  assert.deepEqual({ before, after }, snapshot);
});

test("does not shrink after deletion, clearing or repeated updates", () => {
  const long = { ...text, texto: "one\ntwo\nthree" };
  const grown = expand([text], [long]);
  assert.equal(expand([long], [text], grown), grown);
  assert.equal(expand([long], [{ ...text, texto: "" }], grown), grown);
  assert.equal(expand([long], [], grown), grown);
  assert.equal(expand([long], [long], grown), grown);
});

test("does not grow when text fits, touches the boundary, or changes without downward growth", () => {
  const sections = [{ ...section, altura: 110 }];
  assert.equal(expand([text], [{ ...text, texto: "one\ntwo" }], sections), sections);
  const overflowing = [{ ...section, altura: 50 }];
  assert.equal(expand([text], [{ ...text, texto: "different" }], overflowing), overflowing);
  assert.equal(expand([text], [{ ...text, texto: "short" }], sections), sections);
});

test("Pantalla ON and protected sections never even request measurement", () => {
  for (const patch of [{ altoModo: "pantalla" }, { altoModo: "PANTALLA" }, { bloqueada: true }]) {
    const sections = [{ ...section, ...patch }];
    assert.equal(expand([text], [{ ...text, texto: "one\ntwo" }], sections, () => {
      assert.fail("excluded section must not be measured");
    }), sections);
  }
});

test("drag, resize, style, images, decorations, new objects and hydration do not trigger growth", () => {
  const sections = [section];
  for (const patch of [{ y: 500 }, { width: 5 }, { fontSize: 100 }, { rotation: 40 }]) {
    assert.equal(expand([text], [{ ...text, ...patch }], sections, () => assert.fail()), sections);
  }
  const image = { ...text, tipo: "imagen", texto: "one" };
  assert.equal(expand([image], [{ ...image, texto: "one\ntwo", height: 300 }], sections), sections);
  assert.equal(expand([], [{ ...text, texto: "one\ntwo" }], sections), sections);
  assert.equal(expand([text], [text], sections), sections);
});

test("takes the largest required bottom per section, including linked group children", () => {
  const child = { ...text, id: "child", seccionId: undefined, y: 15 };
  const group = { id: "group", tipo: "grupo", seccionId: "story", y: 90, children: [child] };
  const nextGroup = { ...group, children: [{ ...child, texto: "one\ntwo\nthree" }] };
  const nextText = { ...text, texto: "one\ntwo" };
  const result = expand([text, group], [nextText, nextGroup]);
  assert.equal(result[0].altura, 165);
  assert.equal(nextGroup.y, group.y);
  assert.equal(nextGroup.children[0].y, child.y);
});

test("handles missing nodes/sections and invalid measurements without inventing heights", () => {
  const next = [{ ...text, texto: "one\ntwo" }];
  const sections = [section];
  for (const result of [null, undefined, NaN, Infinity]) {
    assert.equal(expand([text], next, sections, () => result), sections);
  }
  const missing = [];
  assert.equal(expand([text], next, missing, () => assert.fail()), missing);
});

test("uses section coordinates and preserves fractional minimum heights", () => {
  const result = expand([text], [{ ...text, texto: "two" }], [section], ({ text: content }) =>
    content === "one" ? 95.25 : 100.125);
  assert.equal(result[0].altura, 100.125);
});
