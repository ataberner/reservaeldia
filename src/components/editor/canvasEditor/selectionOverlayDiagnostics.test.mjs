import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { Transform } from "konva/lib/Util.js";
import { authorityUrl, moduleUrl, sourceUrl } from "../../../hooks/testSupport/loadGuideHook.mjs";
import { withDiagnosticFlags } from "../../../hooks/testSupport/loadGuideDiagnostics.mjs";

const require = createRequire(import.meta.url);
// The repository's browser performance instrumentation uses this same parser.
const ts = require("../../../../functions/node_modules/typescript");
const selectedDebugUrl = await moduleUrl("components/editor/canvasEditor/selectedDragDebug", {
  "@/components/editor/canvasEditor/konvaCanonicalPose": sourceUrl("components/editor/canvasEditor/konvaCanonicalPose"),
});
const selectedDebug = await import(selectedDebugUrl);
const contractDebug = await import(await moduleUrl("components/editor/canvasEditor/textGeometryContractDebug", {
  "@/components/editor/canvasEditor/selectedDragDebug": selectedDebugUrl,
}));
const authority = await import(authorityUrl);
const sourcePath = new URL("../textSystem/render/konva/SelectionBoundsIndicator.jsx", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const tree = ts.createSourceFile(sourcePath.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
assert.equal(tree.parseDiagnostics.length, 0);
let callbackSource = null;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "maybeLogOverlayTextMismatch") {
    assert.ok(ts.isCallExpression(node.initializer));
    const callback = node.initializer.arguments[0];
    assert.ok(ts.isArrowFunction(callback));
    callbackSource = callback.getText(tree);
  }
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(callbackSource, "the real diagnostic callback must be present");
const helperDeclarations = tree.statements
  .filter((statement) => ts.isFunctionDeclaration(statement) &&
    !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
  .map((statement) => statement.getText(tree)).join("\n");

function createDiagnosticFixture() {
  const counts = { domRect: 0, textClientRect: 0, textTransform: 0 };
  const bounds = { kind: "rect", x: 100, y: 200, width: 200, height: 40 };
  const stage = {
    width: () => 800, height: () => 4000,
    container: () => ({ getBoundingClientRect() {
      counts.domRect += 1;
      return { left: 20, top: 30, width: 480, height: 2400 };
    } }),
  };
  const node = {
    attrs: { x: 100, y: 200, width: 200, height: 40, scaleX: 1, scaleY: 1 },
    getStage: () => stage, getParent: () => stage,
    x: () => 100, y: () => 200, width: () => 200, height: () => 40,
    scaleX: () => 1, scaleY: () => 1, rotation: () => 0,
    getAbsoluteTransform() {
      counts.textTransform += 1;
      return new Transform().translate(100, 200);
    },
    getClientRect() { counts.textClientRect += 1; return bounds; },
  };
  const visualMismatchSnapshotRef = { current: null };
  const dependencies = {
    ...selectedDebug, ...contractDebug, ...authority,
    debugSource: "drag-overlay", isControlledMode: true,
    latestInputsRef: { current: {
      debugSource: "drag-overlay", selectedElements: ["text"],
      objetos: [{ id: "text", tipo: "texto" }],
      elementRefs: { current: { text: node } },
      boxFlowIdentity: "drag-overlay-test", boxFlowSessionIdentity: "drag-overlay-test",
      boxFlowPhase: "drag",
    } },
    groupRef: { current: { getStage: () => stage } },
    rectRef: { current: null }, polygonRef: { current: null }, visualMismatchSnapshotRef,
  };
  // AST extraction executes the production callback and its production local
  // helpers. Assertions observe real calls; they do not inspect source strings.
  const create = new Function(...Object.keys(dependencies),
    `"use strict";\n${helperDeclarations}\nreturn (${callbackSource});`);
  const callback = create(...Object.values(dependencies));
  return {
    counts, visualMismatchSnapshotRef,
    invoke: () => callback(bounds, { source: "guide-post-snap-sync" }),
  };
}

test("PERF01: disabled overlay diagnostics avoid all DOM and text measurements", (t) => {
  withDiagnosticFlags(false, () => {
    const fixture = createDiagnosticFixture();
    fixture.invoke();
    t.diagnostic(JSON.stringify(fixture.counts));
    assert.deepEqual(fixture.counts, { domRect: 0, textClientRect: 0, textTransform: 0 });
    assert.equal(fixture.visualMismatchSnapshotRef.current, null);
  });
});

test("enabled overlay diagnostics still project and compare the actual text geometry", () => {
  withDiagnosticFlags(true, ({ logs }) => {
    const fixture = createDiagnosticFixture();
    fixture.invoke();
    assert.equal(fixture.counts.domRect, 3);
    assert.ok(fixture.counts.textClientRect >= 1);
    assert.ok(fixture.counts.textTransform >= 1);
    assert.ok(logs.length > 0);
    assert.deepEqual(fixture.visualMismatchSnapshotRef.current.textStageRect,
      { x: 100, y: 200, width: 200, height: 40 });
    assert.deepEqual(fixture.visualMismatchSnapshotRef.current.textViewportRect, {
      x: 80, y: 150, width: 120, height: 24, projectionScaleX: 0.6, projectionScaleY: 0.6,
    });
  });
});
