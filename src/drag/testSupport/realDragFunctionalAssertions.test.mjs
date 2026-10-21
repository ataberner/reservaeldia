import test from "node:test";
import assert from "node:assert/strict";
import {
  makeCountdownFixture, collectRealInteractionSnapshot, assertSettledVisuals, assertSettledInteraction,
  assertKeyboardHistoryReady, assertGroupChildrenPreserved, assertSelectionTranslation,
} from "./realDragFunctionalAssertions.mjs";

const frame = ({ type = "Rect", visible = false, width = 80, height = 40, points = [] } = {}) => ({
  getClassName: () => type, isVisible: () => visible, getAbsoluteOpacity: () => 1,
  width: () => width, height: () => height, points: () => points,
  strokeEnabled: () => true, strokeWidth: () => 1,
});

function fixtureWindow({ direct = [frame()], badge = frame({ visible: true }) } = {}) {
  const indicator = { _id: 1, isVisible: () => true, getChildren: () => [
    ...direct, { getClassName: () => "Group", getChildren: () => [badge] },
  ] };
  const stage = { find: (selector) => selector === ".selection-bounds-indicator" ? [indicator] : [],
    findOne: () => ({ getChildren: () => [] }) };
  const node = { getStage: () => stage, getClassName: () => "Text", x: () => 100, y: () => 120,
    getClientRect: () => ({ x: 100, y: 120, width: 80, height: 40 }) };
  const runtime = { selectedIds: ["active"], pendingDragSelection: { id: null, phase: null },
    dragVisualSelection: { ids: [], predragActive: false, sessionKey: null, dragId: null } };
  return { _elementRefs: { active: node }, _objetosActuales: [{ id: "active", tipo: "texto", x: 100, y: 120 }],
    _elementosSeleccionados: ["active"], __EDITOR_SELECTION_RUNTIME__: { getSnapshot: () => runtime },
    document: { querySelectorAll: () => [], activeElement: { tagName: "BODY" } } };
}

test("countdown fixture uses production defaults with stable local identity and date", () => {
  const first = makeCountdownFixture(), second = makeCountdownFixture();
  assert.deepEqual(first, second);
  assert.equal(first.tipo, "countdown");
  assert.equal(first.fechaObjetivo, "2035-06-15T12:00:00.000Z");
  assert.equal(first.layout, "pills");
  assert.equal(first.fontFamily, "Arial");
  assert.equal(first.mostrarCuentaRegresiva, true);
  assert.equal(first.seccionId, "s1");
});

test("visible mounted indicator with hidden leaves is not counted as visible overlay", () => {
  const snapshot = collectRealInteractionSnapshot({}, fixtureWindow());
  assert.equal(snapshot.indicators[0].groupVisible, true);
  assert.equal(snapshot.visibleIndicatorFrames, 0);
  assert.equal(snapshot.visibleTransformerFrames, 0);
});

test("only direct visible frame leaves count; a visible group badge does not", () => {
  const snapshot = collectRealInteractionSnapshot({}, fixtureWindow({ direct: [
    frame(), frame({ type: "Line", visible: true, points: [0, 0, 40, 40, 10, 50, -30, 10] }),
  ] }));
  assert.equal(snapshot.visibleIndicatorFrames, 1);
  assertSettledInteraction(snapshot);
});

test("empty or collapsed leaves do not prove a ready selected frame", () => {
  const snapshot = collectRealInteractionSnapshot({}, fixtureWindow({ direct: [frame({ visible: true, width: 0 })] }));
  assert.equal(snapshot.visibleIndicatorFrames, 0);
  assert.throws(() => assertSettledInteraction(snapshot), /exactly one/);
});

test("settled assertions reject stale drag ownership and duplicate frames", () => {
  const snapshot = collectRealInteractionSnapshot({}, fixtureWindow({ direct: [frame({ visible: true })] }));
  assertSettledInteraction(snapshot);
  assert.throws(() => assertSettledInteraction({ ...snapshot, visibleTransformerFrames: 1 }), /exactly one/);
  snapshot.runtime.dragVisualSelection.ids = ["active"];
  assert.throws(() => assertSettledInteraction(snapshot), /drag visual selection/);
});

test("a visual pass with a residual drag runtime remains an integral handoff failure", () => {
  const snapshot = collectRealInteractionSnapshot({}, fixtureWindow({ direct: [frame({ visible: true })] }));
  snapshot.runtime.dragVisualSelection = {
    ids: ["active"], predragActive: false, sessionKey: "drag-overlay:1:active:active", dragId: "active",
  };
  assert.doesNotThrow(() => assertSettledVisuals(snapshot));
  assert.throws(() => assertSettledInteraction(snapshot), /drag visual selection must clear/);
  snapshot.runtime.dragVisualSelection.ids = [];
  assert.throws(() => assertSettledInteraction(snapshot), /strictly equal/);
});

test("keyboard history preparation rejects active text controls", () => {
  const snapshot = collectRealInteractionSnapshot({}, fixtureWindow());
  assertKeyboardHistoryReady(snapshot);
  assert.throws(() => assertKeyboardHistoryReady({ ...snapshot, activeElement: { tag: "INPUT", editable: false } }), /form field/);
});

test("group session observation excludes the circular live Stage graph", () => {
  const window = fixtureWindow();
  const stage = {};
  stage.self = stage;
  window._groupDragSession = { stage, active: true, phase: "active", engine: "manual-pointer",
    sessionId: "synthetic:1", leaderId: "active", elementIds: ["active", "other"] };
  const snapshot = collectRealInteractionSnapshot({}, window);
  assert.equal(snapshot.groupSession.engine, "manual-pointer");
  assert.equal(snapshot.groupSession.stage, undefined);
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});

test("group translation preserves every local child field and identity", () => {
  const before = { id: "group", tipo: "grupo", x: 0, y: 0, seccionId: "s1", children: [{ id: "child", tipo: "texto", x: 15, y: 20, texto: "Grupo" }] };
  assertGroupChildrenPreserved(before, { ...before, x: 70, y: 20 });
  assert.throws(() => assertGroupChildrenPreserved(before, { ...before, children: [{ ...before.children[0], x: 85 }] }), /local data/);
});

test("multi-root translation rejects omitted follower commits and section-space mixing", () => {
  const before = [{ id: "a", x: 10, y: 20, seccionId: "s1" }, { id: "b", x: 100, y: 120, seccionId: "s1" }];
  const after = before.map((object) => ({ ...object, x: object.x + 30, y: object.y + 40 }));
  assert.deepEqual(assertSelectionTranslation(before, after, ["a", "b"]), { x: 30, y: 40 });
  assert.throws(() => assertSelectionTranslation(before, [after[0], before[1]], ["a", "b"]), /same x delta/);
  assert.throws(() => assertSelectionTranslation(before, [{ ...after[0], seccionId: "s2" }, after[1]], ["a", "b"]), /canonical stage poses/);
});
