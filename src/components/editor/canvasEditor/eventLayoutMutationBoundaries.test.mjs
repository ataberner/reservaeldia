import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { applyFunctionalAssociationsToRenderState, sanitizeMovedGroupFunctionalAssociation } from "../../../../shared/functionalAssociations.js";
import { EVENT_LAYOUT_MANAGED_FIELD } from "../../../../shared/eventLayoutState.js";
import { canEditObject } from "../../../domain/editor/protectedSections.js";
import { reduceEventLayoutEditorState } from "./eventLayoutEditorState.js";
import { finalizeDragPosition } from "./dragPositionFinalization.js";
import { functionalScenePatchToBase, functionalPositionMutationOptions, getFunctionalRenderOffsetX, reconcileFunctionalMutationFrame } from "./functionalRenderPose.js";
import { buildImageCropObjectState } from "../textSystem/render/konva/imageCropStatePatch.js";

const require = createRequire(import.meta.url);
const ts = require("../../../../functions/node_modules/typescript");
function source(name) {
  return ts.createSourceFile(name, readFileSync(new URL(name, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
}
const composer = source("../textSystem/render/konva/CanvasStageContentComposer.jsx");
const renderer = source("../textSystem/render/konva/ElementoCanvasRenderer.jsx");
function find(ast, predicate) {
  let found;
  const visit = node => { if (!found && predicate(node)) found = node; if (!found) ts.forEachChild(node, visit); };
  visit(ast);
  assert.ok(found, "production boundary must exist");
  return found;
}
function compile(node, ast, bindings) {
  return new Function(...Object.keys(bindings), `return (${node.getText(ast)});`)(...Object.values(bindings));
}
function callback(ast, name, bindings) {
  const node = find(ast, node => ts.isVariableDeclaration(node) && node.name.getText(ast) === name);
  return compile(node.initializer.arguments[0], ast, bindings);
}
function onChangeFor(component, bindings) {
  const node = find(composer, node => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(composer) === component);
  const attr = node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText(composer) === "onChange");
  return compile(attr.initializer.expression, composer, bindings);
}
function fixture(mode = "single") {
  return {
    secciones: [{ id: "event", altura: 500, altoModo: "fijo" }],
    eventDetails: { mode },
    objetos: [
      { id: "a", tipo: "texto", seccionId: "event", x: 80, y: 40, width: 100, height: 30, functionalAssociation: "ceremony" },
      { id: "b", tipo: "texto", seccionId: "event", x: 70, y: 100, width: 120, height: 30, functionalAssociation: "ceremony" },
      { id: "party", tipo: "forma", seccionId: "event", x: 560, y: 40, width: 120, height: 30, functionalAssociation: "party" },
    ],
  };
}

for (const component of ["ElementoCanvas", "GaleriaKonva", "CountdownKonva"]) {
  test(`${component} group boundary materializes all members in one mutation`, () => {
    let state = fixture();
    const objetos = applyFunctionalAssociationsToRenderState({ ...state, materializeOffsets: false }).objetos;
    let mutations = 0;
    const bindings = {
      objetos, seccionesOrdenadas: state.secciones, canEditObject, sanitizeMovedGroupFunctionalAssociation,
      getFunctionalRenderOffsetX,
      applyCanonicalDragFinalization: (objOriginal, dragPatch) => finalizeDragPosition({
        objOriginal, dragPatch, seccionesOrdenadas: state.secciones,
        determinarNuevaSeccion: () => ({ nuevaSeccion: "event" }), convertirAbsARel: y => y,
        esSeccionPantallaById: () => false, ALTURA_PANTALLA_EDITOR: 500,
      }),
      setObjetos(update, options) { mutations++; state = reduceEventLayoutEditorState(state, { type: "objects", update, options }); },
    };
    const applyCanonicalGroupDragFinalization = callback(composer, "applyCanonicalGroupDragFinalization", bindings);
    const onChange = onChangeFor(component, { objectEditable: true, applyCanonicalGroupDragFinalization });
    onChange("BATCH_UPDATE_GROUP_FINAL", { isBatchUpdateFinal: true, changes: [
      { id: "a", patch: { x: 390, y: 55, finalizoDrag: true } },
      { id: "b", patch: { x: 380, y: 115, finalizoDrag: true } },
    ] });
    assert.equal(mutations, 1);
    assert.equal(state.objetos[0].x, 390);
    assert.equal(state.objetos[1].x, 380);
    assert.equal(state.objetos[2].x, 560);
    assert.equal(state.secciones[0].eventLayout.initialPositionsByMode.single.a.x, 350);
    assert.equal(state.secciones[0].eventLayout.initialPositionsByMode.single.b.x, 340);
  });
}

test("legacy text alignment retains its automatic reason through the real render callback", () => {
  let state = fixture("ceremony_party");
  state.objetos[0] = { ...state.objetos[0], x: 300, __groupId: "legacy", __groupAlign: "left", __groupOriginX: 240 };
  const obj = state.objetos[0];
  let receivedMeta;
  const onChange = onChangeFor("ElementoCanvas", {
    objectEditable: true, objetos: state.objetos, canEditObject, seccionesOrdenadas: state.secciones,
    setObjetos(update, meta) { receivedMeta = meta; state = reduceEventLayoutEditorState(state, { type: "objects", update, reason: meta?.reason }); },
  });
  const bindings = {
    obj, window: {}, EVENT_LAYOUT_MANAGED_FIELD,
    getWindowElementRefs: () => ({ a: { getTextWidth: () => 100 } }),
    getWindowObjectResolver: () => id => state.objetos.find(object => object.id === id),
    resolveTextMeasureNode: node => node, onChange,
  };
  callback(renderer, "recalcGroupAlign", bindings)();
  assert.equal(state.objetos[0].x, 240);
  assert.deepEqual(receivedMeta, { reason: "legacy-group-align" });
  assert.equal(state.secciones[0].eventLayout, undefined, "mounting does not materialize a manual layout");
  let writes = 0;
  callback(renderer, "recalcGroupAlign", {
    ...bindings, obj: { ...obj, [EVENT_LAYOUT_MANAGED_FIELD]: true }, onChange: () => writes++,
  })();
  assert.equal(writes, 0, "managed manual x must not return to the legacy group origin");
});

test("functional scene conversion is finite, selective and does not alter text-origin geometry", () => {
  const obj = { __functionalRenderOffsetX: 110 };
  const patch = { x: 410, y: 70, offsetX: 80, width: 200 };
  assert.deepEqual(functionalScenePatchToBase(obj, patch), { ...patch, x: 300 });
  assert.equal(patch.x, 410);
  assert.equal(functionalScenePatchToBase(obj, { width: 200 }).x, undefined);
  assert.equal(getFunctionalRenderOffsetX({ __functionalRenderOffsetX: Infinity }), 0);
  assert.equal(getFunctionalRenderOffsetX({ ...obj, [EVENT_LAYOUT_MANAGED_FIELD]: true }), 0);
});

test("crop preview and release from one legacy closure keep the materialized scene frame", () => {
  let state = fixture();
  state.objetos[0] = { ...state.objetos[0], tipo: "imagen" };
  const objetos = applyFunctionalAssociationsToRenderState({ ...state, materializeOffsets: false }).objetos;
  const bindings = {
    objetos, elementosSeleccionados: ["a"], seccionesOrdenadas: state.secciones, canEditObject,
    functionalScenePatchToBase, functionalPositionMutationOptions, buildImageCropObjectState,
    convertirAbsARel: y => y, esSeccionPantallaById: () => false, ALTURA_PANTALLA_EDITOR: 500,
    requestAnimationFrame: () => 1,
    setObjetos(update, options) { state = reduceEventLayoutEditorState(state, { type: "objects", update, options }); },
  };
  const preview = callback(composer, "handleImageCropPreview", bindings);
  const commit = callback(composer, "handleImageCropCommit", bindings);
  preview({ x: 390, y: 55, width: 110 });
  assert.equal(state.objetos[0].x, 390);
  preview({ x: 400, y: 55, width: 120 });
  commit({ x: 410, y: 55, width: 130 });
  assert.equal(state.objetos[0].x, 410, "no second subtraction after lazy materialization");
  assert.equal(state.objetos[1].x, 340, "unmoved companion retains its prior visual pose");
  assert.equal(state.objetos[0].width, 130);
});

test("stale frame metadata cannot move rejected or unchanged object references", () => {
  const source = fixture();
  const managed = reduceEventLayoutEditorState(source, { type: "objects", update: source.objetos.map(object => object.id === "a" ? { ...object, x: 120 } : object) });
  const options = { previousObjects: managed.objetos, secciones: managed.secciones, offsets: { a: 270, b: 270 } };
  assert.equal(reconcileFunctionalMutationFrame({ ...options, nextObjects: managed.objetos }), managed.objetos);
  const unchanged = [...managed.objetos];
  assert.equal(reconcileFunctionalMutationFrame({ ...options, nextObjects: unchanged }), unchanged);
  const accepted = managed.objetos.map(object => object.id === "a" ? { ...object, x: 140 } : object);
  const result = reconcileFunctionalMutationFrame({ ...options, nextObjects: accepted });
  assert.equal(result[0].x, 410);
  assert.equal(result[1], managed.objetos[1]);
});

test("generic roots allow an offset drag while preserving the normal interaction guard", () => {
  const common = find(renderer, node => ts.isVariableDeclaration(node) && node.name.getText(renderer) === "commonProps");
  const draggable = find(common, node => ts.isPropertyAssignment(node) && node.name.getText(renderer) === "draggable");
  for (const allowed of [true, false]) {
    assert.equal(compile(draggable.initializer, renderer, {
      hasFunctionalRenderOffsetX: true, resolveInteractionDraggableEnabled: () => allowed,
    }), allowed);
  }
});

test("Gallery and Countdown render the legacy offset once and keep managed positions", () => {
  const gallery = source("../GaleriaKonva.jsx");
  const galleryX = find(gallery, node => ts.isJsxAttribute(node) && node.name.getText(gallery) === "x" && node.initializer?.getText(gallery).includes("getFunctionalRenderOffsetX"));
  const countdown = source("../countdown/CountdownKonva.jsx");
  const countdownX = find(countdown, node => ts.isVariableDeclaration(node) && node.name.getText(countdown) === "renderedX");
  for (const obj of [
    { x: 240, __functionalRenderOffsetX: 110 },
    { x: 350, __functionalRenderOffsetX: 110, [EVENT_LAYOUT_MANAGED_FIELD]: true },
  ]) {
    assert.equal(compile(galleryX.initializer.expression, gallery, { obj, getFunctionalRenderOffsetX, toNum: Number }), 350);
    assert.equal(compile(countdownX.initializer, countdown, { obj, getFunctionalRenderOffsetX, shouldRenderLiveDragPose: false }), 350);
    assert.equal(compile(countdownX.initializer, countdown, { obj, getFunctionalRenderOffsetX, shouldRenderLiveDragPose: true, liveRenderNode: { x: () => 410 } }), 410);
  }
});
