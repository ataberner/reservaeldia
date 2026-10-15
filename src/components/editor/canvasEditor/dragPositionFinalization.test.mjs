import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { canonicalizeFinalizedDragPatch } from "../../../domain/editor/canvasObjectPositioning.js";
import { canEditObject } from "../../../domain/editor/protectedSections.js";
import { resolveCanonicalNodePose } from "./konvaCanonicalPose.js";
import { finalizeDragPosition } from "./dragPositionFinalization.js";
import { createEditorSessionPersistence } from "../persistence/editorSessionPersistenceCore.js";

const require = createRequire(import.meta.url);
const { applyNodeProps } = require("react-konva/lib/makeUpdates.js");
const ts = require("../../../../functions/node_modules/typescript");
const layoutSource = readFileSync(new URL("../../../utils/layout.ts", import.meta.url), "utf8");
const layoutExports = {};
new Function("exports", ts.transpileModule(layoutSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(layoutExports);
const { calcularOffsetY, convertirAbsARel, determinarNuevaSeccion } = layoutExports;

const sections = [
  { id: "first", altura: 100, altoModo: "fijo" },
  { id: "fixed", altura: 200, altoModo: "fijo" },
  { id: "screen", altura: 500, altoModo: "pantalla" },
  { id: "locked", altura: 200, altoModo: "fijo", bloqueada: true },
];
const esSeccionPantallaById = (id) => sections.find((section) => section.id === id)?.altoModo === "pantalla";
const resolveObjectStageY = (object) => calcularOffsetY(sections, sections.findIndex((section) => section.id === object.seccionId)) +
  (esSeccionPantallaById(object.seccionId) && Number.isFinite(object.yNorm) ? object.yNorm * 500 : object.y || 0);

function makeNode(x, y, text = false) {
  const attrs = { x, y, offsetX: text ? 80 : 0, offsetY: text ? 4 : 0,
    __canonicalPoseMode: text ? "text-origin-offset" : null };
  let draws = 0;
  return {
    attrs, x: () => attrs.x, y: () => attrs.y, rotation: () => 30,
    offsetX: () => attrs.offsetX, offsetY: () => attrs.offsetY,
    position: (pose) => Object.assign(attrs, pose),
    getAttr: (key) => attrs[key], setAttr: (key, value) => { attrs[key] = value; },
    setAttrs: (patch) => Object.assign(attrs, patch), on() {}, off() {},
    getLayer: () => ({ batchDraw: () => { draws += 1; } }),
    getStage: () => null, getDraws: () => draws,
  };
}

// Execute the production composer boundary, not a second copy of its behavior.
// Its React/overlay collaborators are injected; the domain and reconciliation are real.
function makeFinalizer(object, node) {
  const source = readFileSync(new URL("../textSystem/render/konva/CanvasStageContentComposer.jsx", import.meta.url), "utf8");
  const start = source.indexOf("  const applyCanonicalDragFinalization = useCallback(");
  const end = source.indexOf("  const renderCanvasObject =", start);
  assert.ok(start >= 0 && end > start);
  const overlaySamples = [];
  const bindings = {
    useCallback: (callback) => callback,
    canonicalizeFinalizedDragPatch,
    finalizeDragPosition,
    seccionesOrdenadas: sections, determinarNuevaSeccion, convertirAbsARel,
    esSeccionPantallaById, ALTURA_PANTALLA_EDITOR: 500,
    resolveObjectStageY, elementRefs: { current: { [object.id]: node } },
    dragOverlayBoxFlowSessionRef: { current: { phase: "drag", dragId: object.id, selectedIds: [object.id], sessionKey: "test-drag" } },
    readActiveDragOverlaySelectionIds: () => [object.id],
    recordSelectionDragMoveSummary: () => { overlaySamples.push({ ...resolveCanonicalNodePose(node, object) }); },
  };
  const callback = new Function(...Object.keys(bindings), `${source.slice(start, end)}; return applyCanonicalDragFinalization;`)(...Object.values(bindings));
  return { finalize: callback, overlaySamples };
}

for (const mode of ["fixed", "screen"]) {
  for (const text of [false, true]) {
    test(`rejected ${mode} drag reconciles ${text ? "offset text" : "shape"}, overlay and persisted state before settling`, async () => {
      const original = { id: "dragged", tipo: text ? "texto" : "forma", seccionId: mode, x: 20,
        ...(mode === "screen" ? { y: 999, yNorm: 0.4 } : { y: 30 }) };
      const node = makeNode(160, 854, text);
      const { finalize, overlaySamples } = makeFinalizer(original, node);
      const patch = finalize(original, { x: 80, y: 850, finalizoDrag: true });
      const state = { ...original, ...patch };
      const oldProps = { x: original.x + node.offsetX(), y: resolveObjectStageY(original) + node.offsetY() };
      const nextProps = { x: state.x + node.offsetX(), y: resolveObjectStageY(state) + node.offsetY() };
      applyNodeProps(node, nextProps, oldProps);
      const pose = resolveCanonicalNodePose(node, state);
      assert.equal(pose.x, state.x);
      assert.equal(pose.y, resolveObjectStageY(state));
      assert.equal(state.seccionId, original.seccionId);
      assert.equal(overlaySamples.length, 1);
      assert.equal(overlaySamples[0].y, pose.y);
      const writes = [];
      const persistence = createEditorSessionPersistence({ writeDraftPatch: async (entry) => writes.push(entry), createTimestamp: () => "synthetic" });
      await persistence.persistEditorSessionSnapshot({ state: { editorSession: { kind: "draft", id: "synthetic-drag" } }, patch: { objetos: [state], secciones: sections } });
      assert.deepEqual(writes[0].patch.objetos[0], state);
    });
  }
}

test("accepted section crossing preserves stage pose and does not add a correction draw", () => {
  const original = { id: "dragged", tipo: "forma", seccionId: "fixed", x: 20, y: 30 };
  const node = makeNode(45, 450);
  const { finalize, overlaySamples } = makeFinalizer(original, node);
  const patch = finalize(original, { x: 45, y: 450, finalizoDrag: true });
  assert.equal(patch.seccionId, "screen");
  assert.equal(patch.yNorm, 0.3);
  assert.equal(node.y(), 450);
  assert.equal(node.getDraws(), 0);
  assert.equal(overlaySamples.length, 0);
});

for (const [component, tipo] of [["GaleriaKonva", "galeria"], ["CountdownKonva", "countdown"]]) {
  test(`${component} restores a rejected drop before React runs its state updater`, () => {
    const source = readFileSync(new URL("../textSystem/render/konva/CanvasStageContentComposer.jsx", import.meta.url), "utf8");
    const ast = ts.createSourceFile("composer.jsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
    let handler;
    function visit(node) {
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(ast) === component) {
        const attribute = node.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(ast) === "onChange");
        handler = attribute?.initializer?.expression?.getText(ast);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(handler, `production ${component} onChange must exist`);
    const original = { id: "dragged", tipo, seccionId: "fixed", x: 20, y: 30 };
    const node = makeNode(80, 850);
    const { finalize, overlaySamples } = makeFinalizer(original, node);
    let queuedUpdater;
    const bindings = {
      objectEditable: true, objetos: [original], canEditObject,
      seccionesOrdenadas: sections, applyCanonicalDragFinalization: finalize,
      setObjetos: (updater) => { queuedUpdater = updater; },
      sanitizeMovedGroupFunctionalAssociation: () => ({ changed: false }),
    };
    const onChange = new Function(...Object.keys(bindings), `return (${handler});`)(...Object.values(bindings));
    onChange(original.id, { x: 80, y: 850, finalizoDrag: true });
    assert.equal(node.x(), original.x, "restore before React flush / personalized drag end");
    assert.equal(node.y(), resolveObjectStageY(original));
    assert.equal(overlaySamples.length, 1);
    const draws = node.getDraws();
    const state = queuedUpdater([original]);
    assert.deepEqual(queuedUpdater([original]), state, "React updater can safely be replayed");
    assert.equal(node.getDraws(), draws, "updater does not perform imperative redraws");
    assert.equal(overlaySamples.length, 1);
    assert.equal(state[0].x, original.x);
    assert.equal(resolveObjectStageY(state[0]), node.y());
  });
}
