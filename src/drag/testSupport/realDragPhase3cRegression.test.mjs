import test from "node:test";
import assert from "node:assert/strict";
import { resolveRealDragEvidencePhase, hasPrivateDragInstrumentation } from "../dragPerformance.local.test.mjs";
import { assertImmediateDestination, assertImmediateTranslation } from "./realDragFunctionalAssertions.mjs";

function fixture(scale = 1) {
  return {
    before: { scale, node: { x: 240, y: 120 }, nativeDragNodeId: 31, stageWidth: 800 },
    final: { node: { x: 320, y: 120 }, nodeRectInStage: { x: 320, width: 160 } },
    intendedDelta: { x: 80, y: 0 }, alt: true,
  };
}

test("instrumentation guard ignores a literal held by the instrumenter itself", () => {
  const source = Buffer.from('const prelude = "const __dragPerfStop = globalThis.__DRAG_PERF_PROBE?.begin();";');
  assert.equal(hasPrivateDragInstrumentation("src/drag/testSupport/instrumentDragPerformance.cjs", source), false);
});

test("instrumentation guard ignores its own marker string in the runner", () => {
  const source = Buffer.from('function scan(source) { return source.includes("const __dragPerfStop = globalThis.__DRAG_PERF_PROBE"); }');
  assert.equal(hasPrivateDragInstrumentation("src/drag/dragPerformance.local.test.mjs", source), false);
});

test("instrumentation guard still detects real injected code in JavaScript and JSX", () => {
  for (const file of ["src/drag/dragGrupal.js", "src/hooks/useGuiasCentrado.js", "src/components/editor/textSystem/render/konva/CanvasStageContentComposer.jsx"]) {
    const source = Buffer.from('function move() { const __dragPerfStop = globalThis.__DRAG_PERF_PROBE?.begin(); return <Group />; }');
    assert.equal(hasPrivateDragInstrumentation(file, source), true);
  }
});

test("instrumentation guard ignores comments but fails closed on malformed matching source", () => {
  assert.equal(hasPrivateDragInstrumentation("src/drag/dragGrupal.js", Buffer.from("// const __dragPerfStop = globalThis.__DRAG_PERF_PROBE\nexport const value = 1;")), false);
  assert.throws(() => hasPrivateDragInstrumentation("src/drag/dragGrupal.js", Buffer.from("function broken( { const __dragPerfStop = globalThis.__DRAG_PERF_PROBE;")), /malformed source/);
});

test("immediate group translation requires full displacement before and after release", () => {
  const sample = fixture(.6);
  sample.beforeRelease = { ...sample.final.node };
  assertImmediateTranslation(sample);
  sample.beforeRelease.x = 250;
  assert.throws(() => assertImmediateTranslation(sample), /full x displacement before release/);
  sample.beforeRelease.x = 320;
  sample.final.node.y = 125;
  assert.throws(() => assertImmediateTranslation(sample), /full y displacement after release/);
  assert.throws(() => assertImmediateTranslation({ ...fixture(), beforeRelease: null }), /before pointerup/);
});

test("evidence phase preserves the old default and only accepts known local directories", () => {
  assert.equal(resolveRealDragEvidencePhase(), "drag-phase3b");
  assert.equal(resolveRealDragEvidencePhase("drag-phase3c"), "drag-phase3c");
  for (const invalid of ["../elsewhere", "C:/outside", "phase3c", "", null]) {
    assert.throws(() => resolveRealDragEvidencePhase(invalid), /unsupported/);
  }
});

test("immediate destination accepts an actual repeated target after undo", () => {
  const initial = fixture();
  const first = assertImmediateDestination(initial);
  assert.equal(first.afterUndo, false);
  const repeated = assertImmediateDestination({ ...initial, previous: { before: initial.before, expectedNode: first.expectedNode } });
  assert.equal(repeated.afterUndo, true);
});

test("missing X is rejected even when Normal snapping moves Y", () => {
  const sample = fixture();
  sample.alt = false;
  sample.final.node = { x: 240, y: 112 };
  assert.throws(() => assertImmediateDestination(sample), /requested X destination/);
});

test("Normal accepts a section center while preserving intentional Y snapping", () => {
  const sample = fixture();
  sample.alt = false;
  sample.final.node.y = 112;
  assertImmediateDestination(sample);
  sample.final.nodeRectInStage.x += 10;
  assert.throws(() => assertImmediateDestination(sample), /visual center/);
});

test("Alt rejects movement on the wrong Y axis", () => {
  const sample = fixture();
  sample.final.node.y += 8;
  assert.throws(() => assertImmediateDestination(sample), /requested Y destination/);
});

test("screen rounding tolerance scales to logical coordinates at zoom 0.6", () => {
  const sample = fixture(.6);
  sample.final.node.x += 1.5;
  assertImmediateDestination(sample);
  sample.final.node.x += 1;
  assert.throws(() => assertImmediateDestination(sample), /requested X destination/);
});

test("the repeated fixture cannot silently remount the native node", () => {
  const sample = fixture();
  const previous = { before: { ...sample.before, nativeDragNodeId: 99 }, expectedNode: sample.final.node };
  assert.throws(() => assertImmediateDestination({ ...sample, previous }), /same native node/);
});

test("the repeated fixture rejects incomplete undo and a changed destination", () => {
  const sample = fixture();
  const previous = { before: { ...sample.before, node: { x: 230, y: 120 } }, expectedNode: sample.final.node };
  assert.throws(() => assertImmediateDestination({ ...sample, previous }), /initial visual x/);
  previous.before = sample.before;
  previous.expectedNode = { x: 330, y: 120 };
  assert.throws(() => assertImmediateDestination({ ...sample, previous }), /identical native x/);
});
