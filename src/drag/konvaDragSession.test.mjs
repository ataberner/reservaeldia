import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { Node } = require("konva/lib/Node.js");
const { DD } = require("konva/lib/DragAndDrop.js");
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const debug = dataUrl(`
  export function getCanvasPointerDebugInfo() { return {}; }
  export function getCanvasSelectionDebugInfo() { return {}; }
  export function getKonvaNodeDebugInfo() { return {}; }
  export function logSelectedDragDebug() {}
  export function resetCanvasInteractionLogSample() {}
  export function sampleCanvasInteractionLog() { return { shouldLog: false }; }
`);
const group = dataUrl(`
  export function clearCompletedGroupDragForElement() {}
  export function shouldSuppressIndividualDragEnd() { return false; }
  export function shouldSuppressIndividualDragForElement() { return false; }
`);
const source = await readFile(new URL("./dragIndividual.js", import.meta.url), "utf8");
const { startDragIndividual, endDragIndividual } = await import(dataUrl(source
  .replace('"@/components/editor/canvasEditor/selectedDragDebug"', JSON.stringify(debug))
  .replace('"@/drag/dragGrupal"', JSON.stringify(group))
  .replace('"@/components/editor/canvasEditor/konvaCanonicalPose"', JSON.stringify(new URL("../components/editor/canvasEditor/konvaCanonicalPose.js", import.meta.url).href))
  .replace('"@/lib/editorTouchDragIntent"', JSON.stringify(new URL("../lib/editorTouchDragIntent.js", import.meta.url).href))
  .replace('"@/drag/konvaDragSession"', JSON.stringify(new URL("./konvaDragSession.js", import.meta.url).href))));

// Installed Konva implements the actual drag positioning, event order and
// transforms. Only pointer input/drawing and unrelated debug/group guards are
// replaced; no native method or private position cache is patched by the test.
function fixture(t, attrs = {}, parentAttrs = null) {
  const previousWindow = globalThis.window;
  globalThis.window = {};
  const initial = { x: 240, y: 120, ...attrs };
  const node = new Node({ id: "active", ...initial });
  if (parentAttrs) node.parent = new Node(parentAttrs);
  let pointer;
  const stage = {
    _getPointerById: () => pointer,
    getPointerPosition: () => pointer,
    setPointersPositions(evt) { pointer = { id: 1, x: evt.clientX, y: evt.clientY }; },
    get _changedPointerPositions() { return [pointer]; },
    batchDraw() {},
  };
  node.getStage = () => stage;
  const commits = [];
  node.on("dragstart", event => startDragIndividual(event, { current: null }));
  node.on("dragend", () => endDragIndividual(
    { id: "active", tipo: "forma", ...initial }, node,
    (_id, change) => commits.push(change), null, { current: true }
  ));
  const begin = () => {
    const position = node.getAbsolutePosition();
    pointer = { id: 1, x: position.x + 20, y: position.y + 20 };
    node._createDragElement({ pointerId: 1 });
    return { ...pointer };
  };
  const move = (start, dx = 80, dy = 0) => DD._drag({ pointerId: 1, clientX: start.x + dx, clientY: start.y + dy });
  const release = () => {
    DD._dragElements.get(node._id).dragStatus = "stopped";
    DD._endDragAfter({});
  };
  t.after(() => {
    DD._dragElements.delete(node._id);
    globalThis.window = previousWindow;
  });
  return { node, initial, begin, move, release, commits };
}

function nearPosition(actual, expected) {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-8, `x ${actual.x} != ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-8, `y ${actual.y} != ${expected.y}`);
}

test("one-move drag repeats the same destination after undo and commits it once", t => {
  const { node, begin, move, release, commits } = fixture(t);
  move(begin());
  release();
  assert.deepEqual(node.position(), { x: 320, y: 120 });
  node.position({ x: 240, y: 120 }); // accepted pose restored by history/React
  assert.deepEqual(node._lastPos, { x: 320, y: 120 });
  move(begin());
  release();
  assert.deepEqual(node.position(), { x: 320, y: 120 });
  assert.equal(commits.length, 2);
  assert.deepEqual(commits[1], commits[0]);
});

test("new gesture repeats a destination after rejected-pose reconciliation", t => {
  const { node, begin, move, release } = fixture(t);
  move(begin(), 80, 35);
  release();
  node.position({ x: 190, y: 95 });
  move(begin(), 130, 60);
  release();
  assert.deepEqual(node.position(), { x: 320, y: 155 });
});

test("repeated destination respects offset, rotation, scale and inherited transforms", t => {
  const { node, initial, begin, move, release } = fixture(t,
    { offsetX: 100, offsetY: 20, rotation: 90, scaleX: 1.3, scaleY: 0.7 },
    { x: 60, y: 400, rotation: -30, scaleX: 0.6, scaleY: 1.4 });
  move(begin(), 80, 45);
  release();
  const target = node.getAbsolutePosition();
  const localTarget = node.position();
  node.position({ x: initial.x, y: initial.y });
  move(begin(), 80, 45);
  release();
  nearPosition(node.getAbsolutePosition(), target);
  nearPosition(node.position(), localTarget);
});

test("native dragBoundFunc still owns the constrained destination", t => {
  const { node, begin, move, release } = fixture(t);
  node.dragBoundFunc(position => ({ x: Math.min(position.x, 300), y: position.y }));
  move(begin()); release();
  node.position({ x: 240, y: 120 });
  move(begin()); release();
  assert.deepEqual(node.position(), { x: 300, y: 120 });
});

test("identical samples within one gesture retain native redundant-write suppression", t => {
  const { node, begin, move, release } = fixture(t);
  let xChanges = 0;
  node.on("xChange", () => { xChanges += 1; });
  const start = begin();
  move(start);
  move(start);
  move(start);
  release();
  assert.equal(xChanges, 1);
});
