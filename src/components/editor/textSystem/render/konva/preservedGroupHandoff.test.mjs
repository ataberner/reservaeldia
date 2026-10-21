import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { resolveTransformerVisualMode } from "./selectionVisualModes.js";

const require = createRequire(import.meta.url);
const ts = require("../../../../../../functions/node_modules/typescript");
const source = readFileSync(new URL("./SelectionTransformer.jsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("SelectionTransformer.jsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
assert.equal(tree.parseDiagnostics.length, 0);
const component = tree.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "SelectionBounds");
assert.ok(component);
const helpers = tree.statements.filter((statement) => ts.isFunctionDeclaration(statement) &&
  ["roundNodeMetric", "resolveBoundsVisualReadiness", "buildBoundsVisualReadinessKey"].includes(statement.name?.text))
  .map((statement) => statement.getText(tree)).join("\n");
const statements = component.body.statements;
const effects = statements.filter((statement) => ts.isExpressionStatement(statement) &&
  ts.isCallExpression(statement.expression) && statement.expression.expression.getText(tree) === "useEffect")
  .map((statement) => statement.expression.arguments[0]);
function containsAssignmentToRef(node, name) {
  let found = false;
  const visit = (entry) => {
    if (ts.isBinaryExpression(entry) && entry.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(entry.left) && entry.left.name.text === "current" &&
        ts.isIdentifier(entry.left.expression) && entry.left.expression.text === name) found = true;
    ts.forEachChild(entry, visit);
  };
  visit(node);
  return found;
}
const snapshotEffect = effects.find((effect) => containsAssignmentToRef(effect, "transformerBoxFlowSnapshotRef"));
const readinessEffect = effects.find((effect) => effect.body.statements?.some((statement) =>
  ts.isVariableStatement(statement) && statement.declarationList.declarations.some((declaration) =>
    declaration.name.getText(tree) === "gateState" &&
    declaration.initializer?.getText(tree) === "selectedPhaseVisualReadyGateRef.current")));
const indicatorBranch = statements.find((statement) => ts.isIfStatement(statement) &&
  ts.isBinaryExpression(statement.expression) && statement.expression.right.text === "line-indicator");
const indicatorReadyCallback = statements.filter(ts.isVariableStatement)
  .flatMap((statement) => [...statement.declarationList.declarations])
  .find((declaration) => declaration.name.getText(tree) === "handleGroupIndicatorVisualReadyChange")
  ?.initializer?.arguments?.[0];
assert.ok(snapshotEffect && readinessEffect && indicatorBranch);

function execute(code, scope) {
  const output = ts.transpileModule(`${helpers}\n${code}`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(scope), output)(...Object.values(scope));
}

// Exercise the production indicator branch, snapshot effect and post-paint
// gate. React scheduling and the mounted indicator's existing bounds API are
// adapted here; browser acceptance separately observes real Konva frames.
function fixture({ type = "grupo", bounds = { kind: "rect", x: 240, y: 120, width: 115, height: 60 }, mounted = true } = {}) {
  const node = { id: () => "active" };
  const selectedElements = ["active"];
  const object = { id: "active", tipo: type, ...(type === "forma" ? { figura: "line" } : {}) };
  const ready = [], visibility = [], rafs = new Map();
  let transformTick = 0;
  let rafSequence = 0;
  const scope = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    Group: "Group", SelectionBoundsIndicator: "SelectionBoundsIndicator",
    selectedElements, elementRefs: { current: { active: node } }, objetos: [object], isMobile: false, slog() {},
    boxFlowSessionIdentity: "gesture-1", hasPreservedGroupSelection: type === "grupo",
    isTransformerAttachBlocked: false, hasDragOverlayVisualOwnership: true,
    shouldSuppressTransformerVisualsForDragOverlay: true,
    shouldProbeSelectedPhaseReadinessUnderOverlay: type === "grupo",
    shouldUseGenericTransformer: false, canvasInteractionSettling: false, dragSelectionOverlayVisible: true,
    transformerVisualMode: resolveTransformerVisualMode({ selectedIds: selectedElements,
      selectedObjects: [object], dragSelectionOverlayVisible: true }),
    lineIndicatorRef: { current: mounted ? { isControlledMountReady: () => true, getAppliedBoundsDigest: () => bounds } : null },
    getLifecycleTransformerNode: () => null,
    buildAttachedNodeIdsDigest: (nodes) => nodes.map((node) => node.id()).join(","),
    buildSelectionBoxFlowSessionIdentity: () => scope.boxFlowSessionIdentity,
    buildSelectionBoxFlowIdentity: (ids) => ids,
    resolveSelectionSessionIdentity: (session, fallback) => session || scope.boxFlowSessionIdentity || fallback,
    resolveSelectedPhaseBoundsDigest: () => { throw new Error("indicator must reuse its own applied geometry"); },
    transformerBoxFlowSnapshotRef: { current: null },
    selectedPhaseVisualReadyGateRef: { current: { rafId: 0, pendingKey: null, confirmedKey: null, blockedKey: null, lastMeta: null } },
    onPrimarySelectionVisualReadyChange: (value, meta) => ready.push({ value, meta }),
    onPrimarySelectionVisibilityChange: (value, meta) => visibility.push({ value, meta }),
    logCanvasBoxFlow() {}, flushCanvasBoxFlowSummary() {},
    sampleCanvasInteractionLog: () => ({ shouldLog: false }),
    requestAnimationFrame: (callback) => { rafs.set(++rafSequence, callback); return rafSequence; },
    cancelAnimationFrame: (id) => rafs.delete(id),
    setTransformTick: (update) => { transformTick = update(transformTick); },
  };
  scope.handleGroupIndicatorVisualReadyChange = indicatorReadyCallback
    ? execute(`return ${indicatorReadyCallback.getText(tree)};`, scope)
    : null;
  return {
    scope, ready, visibility, rafs,
    render: () => execute(`${indicatorBranch.getText(tree)}\nreturn null;`, scope),
    snapshot() { execute(`(${snapshotEffect.getText(tree)})();`, scope); return scope.transformerBoxFlowSnapshotRef.current; },
    evaluateReady: () => execute(`(${readinessEffect.getText(tree)})();`, scope),
    paint() { const queued = [...rafs.values()]; rafs.clear(); queued.forEach((callback) => callback()); },
    get transformTick() { return transformTick; },
  };
}

test("a persisted-group destination mounts an invisible indicator under the drag overlay", () => {
  const lifecycle = fixture();
  const rendered = lifecycle.render();
  assert.ok(rendered, "handoff requires the destination renderer to mount");
  assert.equal(rendered.type, "Group");
  assert.equal(rendered.props.visible, false, "the underlay must not paint a second frame");
  assert.equal(rendered.props.children[0].type, "SelectionBoundsIndicator");
});

test("the mounted group indicator confirms its applied bounds only after the existing post-paint gate", () => {
  const lifecycle = fixture();
  const snapshot = lifecycle.snapshot();
  assert.equal(snapshot.readyProbeActive, true);
  assert.equal(snapshot.visible, false);
  assert.deepEqual(snapshot.bounds, lifecycle.scope.lineIndicatorRef.current.getAppliedBoundsDigest());
  lifecycle.evaluateReady();
  assert.equal(lifecycle.ready.filter(({ value }) => value).length, 0);
  assert.equal(lifecycle.rafs.size, 1, "reuse the existing confirmation frame");
  lifecycle.paint();
  assert.equal(lifecycle.ready.filter(({ value }) => value).length, 1);
  assert.equal(lifecycle.ready.at(-1).meta.postPaintConfirmed, true);
  assert.equal(lifecycle.ready.at(-1).meta.readyProbeActive, true);
  assert.equal(lifecycle.ready.at(-1).meta.selectedPhaseActuallyVisible, false);
});

test("the same indicator becomes the visible selected destination after overlay release", () => {
  const lifecycle = fixture();
  lifecycle.snapshot(); lifecycle.evaluateReady(); lifecycle.paint();
  Object.assign(lifecycle.scope, { hasDragOverlayVisualOwnership: false,
    shouldSuppressTransformerVisualsForDragOverlay: false,
    shouldProbeSelectedPhaseReadinessUnderOverlay: false, dragSelectionOverlayVisible: false });
  const rendered = lifecycle.render();
  assert.equal(rendered.type, "Group");
  assert.equal(rendered.props.visible, true);
  assert.equal(lifecycle.snapshot().visible, true);
  assert.equal(lifecycle.visibility.at(-1).value, true);
});

test("missing mount and missing, collapsed or invalid applied bounds cannot release the overlay", () => {
  for (const input of [{ mounted: false }, { bounds: null },
    { bounds: { x: 0, y: 0, width: 0, height: 60 } },
    { bounds: { x: 0, y: 0, width: NaN, height: 60 } }]) {
    const lifecycle = fixture(input);
    lifecycle.snapshot(); lifecycle.evaluateReady(); lifecycle.paint();
    assert.equal(lifecycle.ready.some(({ value }) => value), false);
  }
});

test("a newer group session invalidates an older pending readiness confirmation", () => {
  const lifecycle = fixture();
  lifecycle.snapshot(); lifecycle.evaluateReady();
  assert.equal(lifecycle.rafs.size, 1);
  lifecycle.scope.boxFlowSessionIdentity = "gesture-2";
  lifecycle.snapshot();
  lifecycle.paint();
  assert.equal(lifecycle.ready.some(({ value }) => value), false);
  lifecycle.evaluateReady(); lifecycle.paint();
  assert.equal(lifecycle.ready.at(-1).meta.sessionIdentity, "gesture-2");
});

test("active drag and selection repair do not mount a group readiness probe", () => {
  const lifecycle = fixture();
  lifecycle.scope.shouldProbeSelectedPhaseReadinessUnderOverlay = false;
  assert.equal(lifecycle.render(), null);
  assert.equal(lifecycle.snapshot().readyProbeActive, false);
  lifecycle.scope.shouldProbeSelectedPhaseReadinessUnderOverlay = true;
  lifecycle.scope.isTransformerAttachBlocked = true;
  assert.equal(lifecycle.render(), null);
  assert.equal(lifecycle.snapshot().readyProbeActive, false);
});

test("single lines retain their existing suppression and selected renderer", () => {
  const lifecycle = fixture({ type: "forma" });
  assert.equal(lifecycle.render(), null);
  assert.equal(lifecycle.snapshot().readyProbeActive, false);
  Object.assign(lifecycle.scope, { hasDragOverlayVisualOwnership: false, shouldSuppressTransformerVisualsForDragOverlay: false });
  assert.equal(lifecycle.render().type, "SelectionBoundsIndicator");
});

test("a late indicator mount rechecks the existing gate through its stable ready callback", () => {
  const lifecycle = fixture({ mounted: false });
  lifecycle.snapshot(); lifecycle.evaluateReady();
  assert.equal(lifecycle.ready.some(({ value }) => value), false);
  lifecycle.scope.lineIndicatorRef.current = {
    isControlledMountReady: () => true,
    getAppliedBoundsDigest: () => ({ kind: "rect", x: 240, y: 120, width: 115, height: 60 }),
  };
  const callback = lifecycle.render()?.props.children[0].props.onVisualReadyChange;
  assert.equal(typeof callback, "function", "the child must notify the parent after its applied bounds are ready");
  callback(true);
  assert.equal(lifecycle.transformTick, 1);
  lifecycle.snapshot(); lifecycle.evaluateReady(); lifecycle.paint();
  assert.equal(lifecycle.ready.at(-1).value, true);
  lifecycle.scope.lineIndicatorRef.current = null;
  callback(false);
  lifecycle.snapshot(); lifecycle.evaluateReady();
  assert.equal(lifecycle.ready.at(-1).value, false, "unmount must reset an already confirmed group destination");
});

test("a mixed group selection requires every member node before becoming ready", () => {
  const lifecycle = fixture();
  lifecycle.scope.selectedElements.push("peer");
  assert.equal(lifecycle.snapshot().readyProbeActive, false);
  lifecycle.scope.elementRefs.current.peer = { id: () => "peer" };
  assert.equal(lifecycle.snapshot().readyProbeActive, true);
  assert.equal(lifecycle.scope.transformerBoxFlowSnapshotRef.current.visualIdentity, "active,peer");
});

test("changing the selected group invalidates the prior pending candidate", () => {
  const lifecycle = fixture();
  lifecycle.snapshot(); lifecycle.evaluateReady();
  lifecycle.scope.selectedElements.splice(0, 1, "other");
  lifecycle.scope.elementRefs.current = { other: { id: () => "other" } };
  lifecycle.snapshot(); lifecycle.paint();
  assert.equal(lifecycle.ready.some(({ value }) => value), false);
  lifecycle.evaluateReady(); lifecycle.paint();
  assert.equal(lifecycle.ready.at(-1).meta.visualIdentity, "other");
});
