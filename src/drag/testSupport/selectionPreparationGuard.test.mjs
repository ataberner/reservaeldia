import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { decidePressSelection, decideSelectionGestureDispatch } from "../../components/editor/textSystem/render/konva/elementInteractionDecisions.js";
import { ensureEditorSelectionRuntime } from "../../lib/editorSelectionRuntime.js";

const require = createRequire(import.meta.url);
const ts = require("../../../functions/node_modules/typescript");
const rendererUrl = new URL("../../components/editor/textSystem/render/konva/ElementoCanvasRenderer.jsx", import.meta.url);
const composerUrl = new URL("../../components/editor/textSystem/render/konva/CanvasStageContentComposer.jsx", import.meta.url);

function extractCallbacks(url, names) {
  const source = readFileSync(url, "utf8");
  const tree = ts.createSourceFile(url.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  assert.equal(tree.parseDiagnostics.length, 0);
  const callbacks = {};
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(tree))) {
      assert.ok(ts.isCallExpression(node.initializer));
      const callback = node.initializer.arguments[0];
      assert.ok(ts.isArrowFunction(callback));
      callbacks[node.name.getText(tree)] = callback.getText(tree);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  for (const name of names) assert.ok(callbacks[name], `real callback ${name} must exist`);
  return callbacks;
}

const renderer = extractCallbacks(rendererUrl, ["armPrimarySelectionClickGuard", "consumePrimarySelectionClickGuard"]);
const composer = extractCallbacks(composerUrl, ["decideInlineIntent", "applyInlineIntentDecision"]);
const instantiate = (source, dependencies) => new Function(...Object.keys(dependencies),
  `"use strict"; return (${source});`)(...Object.values(dependencies));

function fixture({ shift = true } = {}) {
  let now = 1000;
  const obj = { id: "active", tipo: "texto", texto: "Reserva el Día" };
  const targetWindow = {};
  const runtime = ensureEditorSelectionRuntime(targetWindow);
  runtime.setCommittedSelection([]);
  const guardDependencies = { obj, performance: { now: () => now },
    pendingPrimarySelectionClickGuardRef: { current: { elementId: null, expiresAt: 0 } } };
  const arm = instantiate(renderer.armPrimarySelectionClickGuard, guardDependencies);
  const consume = instantiate(renderer.consumePrimarySelectionClickGuard, guardDependencies);
  const callbackDependencies = {
    // A valid synthetic Text hit, matching the actual browser reproduction.
    // Geometry/DOM authorization is outside this controlled-clock unit test.
    Date: { now: () => now }, inlineIntentRef: { current: {} }, editing: { id: null },
    isIntentFresh: () => false, isSemanticInlineEditableObject: (object) => object.tipo === "texto",
    isLegacyDoubleInlineEditableObject: () => false, isInlineSemanticContextValid: () => true,
    getRuntimeInteractionState: () => ({ dragging: false, resizing: false }),
    isDragging: false, seleccionActiva: false, logInlineIntent() {},
    toggleCommittedSelectionRuntime: runtime.toggleCommittedSelection,
    setCommittedSelectionRuntime: runtime.setCommittedSelection,
    setPendingDragSelectionRuntime: runtime.setPendingDragSelection,
    clearInlineIntent() {}, armInlineIntent() {}, emitInlineFocusRcaEvent() {},
  };
  const decide = instantiate(composer.decideInlineIntent, callbackDependencies);
  const apply = instantiate(composer.applyInlineIntentDecision, callbackDependencies);
  const event = { evt: { shiftKey: shift, button: 0 } };
  const press = () => {
    const selection = decidePressSelection({ hasOnSelect: true, effectiveIsSelected: false,
      effectiveSelectionCount: 0, inlineEditPointerActive: false, selectionGestureSuppressed: false,
      button: 0, shiftKey: shift, ctrlKey: false, metaKey: false });
    assert.equal(selection.shouldSelectOnPress, true);
    arm();
    const decision = decide({ id: obj.id, obj, event,
      meta: { gesture: "primary", selectionOrigin: "press", allowSameGestureDrag: selection.allowSameGestureDrag },
      selectionSnapshot: runtime.getSnapshot().selectedIds });
    apply({ id: obj.id, obj, event, ...decision });
    assert.deepEqual(runtime.getSnapshot().selectedIds, [obj.id]);
  };
  const click = (elapsedMs) => {
    now = 1000 + elapsedMs;
    const dispatch = decideSelectionGestureDispatch({ gesture: "primary",
      suppressNativeClickUntilActive: false, pressSelectionGuardConsumed: consume(),
      selectionGestureSuppressed: false, hasDragged: false });
    if (!dispatch.shouldEmit) return { dispatch, decision: null };
    const decision = decide({ id: obj.id, obj, event, meta: { gesture: "primary" },
      selectionSnapshot: runtime.getSnapshot().selectedIds });
    // Execute the real state mutation for Shift; inline DOM entry is deliberately
    // not mounted here, so its actual decision is returned without simulating it.
    if (decision.decision === "multiselect_toggle") apply({ id: obj.id, obj, event, ...decision });
    return { dispatch, decision };
  };
  return { press, click, runtime, consume, setTime: (value) => { now = value; } };
}

// Characterization of the existing selection defect, NOT an assertion that a
// same-gesture late click should toggle selection. No productive fix in Phase 3B.
for (const elapsedMs of [80, 500]) {
  test(`current guard suppresses the selected-on-press click at ${elapsedMs}ms`, () => {
    const state = fixture();
    state.press();
    assert.equal(state.click(elapsedMs).dispatch.reason, "press-selection-guard");
    assert.deepEqual(state.runtime.getSnapshot().selectedIds, ["active"]);
  });
}

test("current guard expires just after 500ms and allows a second Shift toggle", () => {
  const state = fixture();
  state.press();
  const result = state.click(500.001);
  assert.equal(result.dispatch.shouldEmit, true);
  assert.equal(result.decision.decision, "multiselect_toggle");
  assert.deepEqual(state.runtime.getSnapshot().selectedIds, []);
});

test("controlled 632ms delay reproduces deselection after a Shift press", () => {
  const state = fixture();
  state.press();
  assert.equal(state.click(632).decision.decision, "multiselect_toggle");
  assert.deepEqual(state.runtime.getSnapshot().selectedIds, []);
});

test("ordinary late click resolves to inline entry after selecting on press", () => {
  const state = fixture({ shift: false });
  state.press();
  assert.equal(state.click(632).decision.decision, "start_inline");
});

test("consuming a timely press guard clears it rather than suppressing future clicks", () => {
  const state = fixture();
  state.press();
  state.setTime(1080);
  assert.equal(state.consume(), true);
  assert.equal(state.consume(), false);
});
