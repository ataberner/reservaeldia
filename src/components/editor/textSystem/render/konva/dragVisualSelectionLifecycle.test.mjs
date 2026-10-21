import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import {
  readEditorSelectionRuntimeSnapshot,
  setEditorCommittedSelection,
  setEditorDragVisualSelection,
} from "../../../../../lib/editorSelectionRuntime.js";

const require = createRequire(import.meta.url);
const ts = require("../../../../../../functions/node_modules/typescript");
const sourcePath = new URL("./CanvasStageContentComposer.jsx", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const tree = ts.createSourceFile(sourcePath.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
assert.equal(tree.parseDiagnostics.length, 0);
const callbacks = new Map();
let synchronizationEffect = null;
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
      ts.isCallExpression(node.initializer) && node.initializer.expression.getText(tree) === "useCallback") {
    callbacks.set(node.name.text, node.initializer.arguments[0].getText(tree));
  }
  if (ts.isCallExpression(node) && node.expression.getText(tree) === "useEffect" &&
      ts.isArrayLiteralExpression(node.arguments[1]) &&
      node.arguments[1].elements.some((entry) => ts.isIdentifier(entry) && entry.text === "readActiveDragOverlaySelectionIds")) {
    assert.equal(synchronizationEffect, null, "the runtime synchronization effect must be unique");
    synchronizationEffect = node.getText(tree);
  }
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(synchronizationEffect);
const helperDeclarations = tree.statements
  .filter((statement) => ts.isFunctionDeclaration(statement) &&
    !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
  .map((statement) => statement.getText(tree)).join("\n");

// Execute the composer's production callbacks and dependency list. This small
// lifecycle adapter uses React's Object.is dependency rule; it does not replace
// the runtime store, session matching, or selection resolution under test.
function createLifecycle() {
  const targetWindow = {};
  const overlayRef = { current: null };
  let overlayState = null;
  let previousDependencies = null;
  let publications = 0;
  const createCallbacks = new Function("dragOverlayBoxFlowSessionRef", "setDragOverlayBoxFlowSession", `
    ${helperDeclarations}
    const commitDragOverlayBoxFlowSession = ${callbacks.get("commitDragOverlayBoxFlowSession")};
    const clearDragOverlayBoxFlowSession = ${callbacks.get("clearDragOverlayBoxFlowSession")};
    const readActiveDragOverlaySelectionIds = ${callbacks.get("readActiveDragOverlaySelectionIds")};
    return { commitDragOverlayBoxFlowSession, clearDragOverlayBoxFlowSession, readActiveDragOverlaySelectionIds };
  `);
  const production = createCallbacks(overlayRef, (updater) => { overlayState = updater(overlayState); });
  const setDragVisualSelectionRuntime = (value, options) => {
    publications += 1;
    return setEditorDragVisualSelection(value, options, targetWindow);
  };
  const executeEffect = new Function(
    "useEffect", "dragVisualSelectionIds", "isPredragVisualSelectionActive",
    "dragOverlayBoxFlowSession", "dragOverlayBoxFlowSessionRef",
    "readActiveDragOverlaySelectionIds", "setDragVisualSelectionRuntime",
    synchronizationEffect
  );
  return {
    commit: production.commitDragOverlayBoxFlowSession,
    retire: (sessionKey) => production.clearDragOverlayBoxFlowSession((current) => current.sessionKey === sessionKey),
    render(ids, predragActive = false) {
      executeEffect((effect, dependencies) => {
        const shouldRun = !previousDependencies || dependencies.some((dependency, index) =>
          !Object.is(dependency, previousDependencies[index]));
        previousDependencies = dependencies;
        if (shouldRun) effect();
      }, ids, predragActive, overlayState, overlayRef,
      production.readActiveDragOverlaySelectionIds, setDragVisualSelectionRuntime);
    },
    setCommitted: (ids) => setEditorCommittedSelection(ids, {}, targetWindow),
    snapshot: () => readEditorSelectionRuntimeSnapshot(targetWindow),
    publicationCount: () => publications,
  };
}

const emptyVisualSelection = { ids: [], predragActive: false, sessionKey: null, dragId: null };
function session(sessionKey, ids = ["active"], phase = "drag") {
  return { sessionKey, dragId: ids[0], selectedIds: ids, selectedIdsDigest: ids.join(","),
    interactionEpoch: 1, phase, skipInitialSeed: false };
}

test("handoff clears runtime visual selection when the auxiliary selection was already cleared", () => {
  const lifecycle = createLifecycle();
  const ids = ["active"];
  const clearedIds = [];
  lifecycle.setCommitted(ids);
  lifecycle.commit(session("gesture-1"));
  lifecycle.render(ids);
  lifecycle.commit(session("gesture-1", ids, "settling"));
  lifecycle.render(clearedIds);
  assert.deepEqual(lifecycle.snapshot().dragVisualSelection.ids, ids,
    "settling retains the session while selected-phase readiness is pending");

  lifecycle.retire("gesture-1");
  lifecycle.render(clearedIds);
  assert.deepEqual(lifecycle.snapshot().dragVisualSelection, emptyVisualSelection);
  assert.deepEqual(lifecycle.snapshot().selectedIds, ids, "handoff must not clear committed selection");
});

test("undo and redo after handoff do not retain a previous drag identity", () => {
  const lifecycle = createLifecycle();
  const clearedIds = [];
  lifecycle.commit(session("gesture-before-history", ["active"], "settling"));
  lifecycle.render(clearedIds);
  lifecycle.retire("gesture-before-history");
  lifecycle.render(clearedIds);
  for (const committedIds of [[], ["active"], []]) {
    lifecycle.setCommitted(committedIds);
    lifecycle.render(clearedIds);
    assert.deepEqual(lifecycle.snapshot().dragVisualSelection, emptyVisualSelection);
    assert.deepEqual(lifecycle.snapshot().selectedIds, committedIds);
  }
});

test("a consecutive gesture on the same selection publishes its new identity", () => {
  const lifecycle = createLifecycle();
  const ids = ["active"];
  lifecycle.commit(session("gesture-1", ids));
  lifecycle.render(ids);
  lifecycle.commit(session("gesture-2", ids));
  lifecycle.render(ids);
  assert.equal(lifecycle.snapshot().dragVisualSelection.sessionKey, "gesture-2");
  lifecycle.retire("gesture-1");
  lifecycle.render(ids);
  assert.equal(lifecycle.snapshot().dragVisualSelection.sessionKey, "gesture-2",
    "an older handoff must not clear a newer session");
});

test("session phase changes preserve group selection until the matched handoff", () => {
  const lifecycle = createLifecycle();
  const ids = ["leader", "follower"];
  const clearedIds = [];
  for (const phase of ["predrag", "drag", "settling"]) {
    lifecycle.commit(session("group-gesture", ids, phase));
    lifecycle.render(phase === "settling" ? clearedIds : ids, phase === "predrag");
    assert.deepEqual(lifecycle.snapshot().dragVisualSelection, {
      ids, predragActive: phase === "predrag", sessionKey: "group-gesture", dragId: "leader",
    });
  }
  lifecycle.retire("group-gesture");
  lifecycle.render(clearedIds);
  assert.deepEqual(lifecycle.snapshot().dragVisualSelection, emptyVisualSelection);
});

test("stable render dependencies do not republish visual selection", () => {
  const lifecycle = createLifecycle();
  const ids = ["active"];
  lifecycle.commit(session("gesture-1", ids));
  lifecycle.render(ids);
  const initialPublications = lifecycle.publicationCount();
  for (let index = 0; index < 20; index += 1) lifecycle.render(ids);
  assert.equal(lifecycle.publicationCount(), initialPublications);
});
