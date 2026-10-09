import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { buildGoogleMapsStaticImageSrc } from "../../../../../domain/eventDetails/googleMapsStatic.js";
import { GOOGLE_MAP_MIN_SIZE, resolveGoogleMapDimensions } from "../../../../../domain/eventDetails/googleMapGeometry.js";
import { clampNormalizedPosition } from "../../../../../domain/editor/canvasObjectPositioning.js";
import { buildLoadedEditorRenderState, buildPersistableRenderState } from "../../../persistence/borradorSyncRenderState.js";
import { resolveGoogleMapNodeTransformPatch, resolveGoogleMapTransformPatch, syncCommittedGoogleMapGeometry } from "./googleMapTransform.js";
import { resolveGoogleMapResizeBounds } from "./googleMapResizeBounds.js";

const require = createRequire(import.meta.url);
const ts = require("../../../../../../functions/node_modules/typescript");

function readJsx(name) {
  const source = readFileSync(new URL(name, import.meta.url), "utf8");
  return ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
}

const composer = readJsx("./CanvasStageContentComposer.jsx");
const transformer = readJsx("./SelectionTransformer.jsx");

function findSource(sourceFile, predicate) {
  let found;
  const visit = (node) => {
    if (predicate(node)) found = node.getText(sourceFile);
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  assert.ok(found, "expected the production callback or function");
  return found;
}

function callbackSource(sourceFile, name) {
  const attribute = findSource(sourceFile, (node) =>
    ts.isJsxAttribute(node) && node.name.getText(sourceFile) === name
  );
  return attribute.slice(attribute.indexOf("{") + 1, -1);
}

function compileExpression(expression, bindings) {
  return new Function(...Object.keys(bindings), `return (${expression});`)(...Object.values(bindings));
}

const multiPatchDeclarations = ["toFiniteMetric", "withDefinedMetrics", "buildFinalMultiTransformPatch"]
  .map((name) => findSource(composer, (node) => ts.isFunctionDeclaration(node) && node.name?.text === name))
  .join("\n");
const buildFinalMultiTransformPatch = new Function(
  "resolveGoogleMapDimensions", "clampNormalizedPosition",
  `${multiPatchDeclarations}\nreturn buildFinalMultiTransformPatch;`
)(resolveGoogleMapDimensions, clampNormalizedPosition);

function mapObject(overrides = {}) {
  return {
    id: "synthetic-map", tipo: "mapa-google", seccionId: "section",
    x: 120, y: 50, width: 361, height: 220, scaleX: 1, scaleY: 1,
    googlePlaceId: "synthetic-place", googleLat: -34, googleLng: -58,
    mostrarMapa: true,
    ...overrides,
  };
}

function createNode(object, scaleX, scaleY) {
  return {
    attrs: { ...resolveGoogleMapDimensions(object), scaleX, scaleY },
    writes: 0,
    scaleX() { return this.attrs.scaleX; },
    scaleY() { return this.attrs.scaleY; },
    setAttrs(patch) { Object.assign(this.attrs, patch); this.writes += 1; },
  };
}

// Execute the actual Composer callback with synthetic editor I/O; no app,
// Firebase, image request or rendering server is started by these tests.
function createComposerHarness(objects) {
  const harness = { objects, updates: 0, synchronousCommits: 0, deferred: [] };
  const bindings = {
    window: {},
    objetos: objects,
    elementosSeleccionados: objects.map(({ id }) => id),
    seccionesOrdenadas: [{ id: "section" }],
    canEditObject: () => true,
    activeTransformInteractionRef: { current: { isRotate: false } },
    setObjetos(update) { harness.objects = update(harness.objects); },
    actualizarObjeto(index, patch) {
      harness.objects = harness.objects.map((object, i) => i === index ? { ...object, ...patch } : object);
      harness.updates += 1;
    },
    flushSync(callback) { harness.synchronousCommits += 1; callback(); },
    requestAnimationFrame(callback) { harness.deferred.push(callback); },
    convertirAbsARel: (y) => y - 100,
    esSeccionPantallaById: () => false,
    ALTURA_PANTALLA_EDITOR: 500,
    calcularOffsetY: () => 100,
    altoCanvas: 600,
    normalizarMedidasGaleria: () => { throw new Error("Unexpected Gallery mutation"); },
    resolveGoogleMapDimensions,
    buildFinalMultiTransformPatch,
  };
  harness.onTransform = compileExpression(callbackSource(composer, "onTransform"), bindings);
  return harness;
}

test("map resize previews keep committed geometry and Static Maps URL stable", () => {
  const object = mapObject();
  const harness = createComposerHarness([object]);
  const initialState = harness.objects;
  const initialUrl = buildGoogleMapsStaticImageSrc(object, { apiKey: "synthetic-key" });
  for (const scaleX of [1.1, 1.2, 1.4, 1.6]) {
    const preview = resolveGoogleMapTransformPatch(object, { scaleX, scaleY: 1.3 });
    harness.onTransform({ ...preview, isPreview: true });
    assert.equal(harness.objects, initialState);
    assert.equal(harness.objects[0], object);
    assert.equal(buildGoogleMapsStaticImageSrc(harness.objects[0], { apiKey: "synthetic-key" }), initialUrl);
  }
  assert.equal(harness.updates, 0);
});

test("map resize keeps live geometry until the committed children can be flattened", () => {
  const object = mapObject();
  const node = createNode(object, 1.5, 1.2);
  const patch = resolveGoogleMapNodeTransformPatch(node, object);
  assert.deepEqual(patch, { width: 541.5, height: 264, scaleX: 1, scaleY: 1 });
  assert.deepEqual(node.attrs, { width: 361, height: 220, scaleX: 1.5, scaleY: 1.2 });
  assert.equal(node.writes, 0, "pointerup must not expose the previous unscaled bounds");

  const harness = createComposerHarness([object]);
  harness.onTransform({ ...patch, x: 120, y: 150, rotation: 0, isFinal: true });
  assert.equal(harness.synchronousCommits, 1);
  assert.equal(harness.updates, 1);
  assert.equal(harness.deferred.length, 0);
  assert.deepEqual(harness.objects[0], { ...object, ...patch, rotation: 0, fromTransform: true });

  syncCommittedGoogleMapGeometry(node, harness.objects[0]);
  assert.deepEqual(node.attrs, patch);
  assert.equal(node.writes, 1);

  node.attrs.scaleX = 0.8;
  node.attrs.scaleY = 1.25;
  const secondPatch = resolveGoogleMapNodeTransformPatch(node, harness.objects[0]);
  assert.deepEqual(secondPatch, { width: 433.20000000000005, height: 330, scaleX: 1, scaleY: 1 });
});

test("committed geometry synchronization preserves legacy scales before a resize", () => {
  const object = mapObject({ scaleX: 0.5, scaleY: 0.75 });
  const node = createNode(object, 1, 1);
  syncCommittedGoogleMapGeometry(node, object);
  assert.deepEqual(node.attrs, { width: 361, height: 220, scaleX: 0.5, scaleY: 0.75 });
});

test("legacy dimensions below the rendered minimum resize from the visible box", () => {
  const object = mapObject({ width: 80, height: 100 });
  const node = createNode(object, 2, 1.1);
  assert.deepEqual(resolveGoogleMapNodeTransformPatch(node, object), {
    width: 400, height: 220.00000000000003, scaleX: 1, scaleY: 1,
  });
  assert.deepEqual(resolveGoogleMapTransformPatch(object, { scaleX: 0.1, scaleY: 0.1 }), {
    width: GOOGLE_MAP_MIN_SIZE, height: GOOGLE_MAP_MIN_SIZE, scaleX: 1, scaleY: 1,
  });
  assert.equal(object.width, 80);
  assert.equal(object.height, 100);
});

test("multi-selection commits map geometry once without changing other object contracts", () => {
  const map = mapObject();
  const image = { id: "synthetic-image", tipo: "imagen", seccionId: "section", x: 20, y: 10, width: 100, height: 80 };
  const mapPatch = resolveGoogleMapNodeTransformPatch(createNode(map, 0.2, 1.5), map);
  const harness = createComposerHarness([map, image]);
  harness.onTransform({
    isFinal: true,
    batch: [
      { id: map.id, ...mapPatch, x: 120, y: 150, rotation: 0 },
      { id: image.id, width: 120, height: 96, x: 20, y: 110, rotation: 0 },
    ],
  });
  assert.equal(harness.synchronousCommits, 1);
  assert.equal(harness.deferred.length, 0);
  assert.deepEqual(harness.objects[0], { ...map, width: 200, height: 330, rotation: 0 });
  assert.deepEqual(harness.objects[1], { ...image, width: 120, height: 96, rotation: 0, scaleX: 1, scaleY: 1 });
});

test("resized map geometry and place survive the draft persistence roundtrip", () => {
  const object = mapObject({ rotation: 30 });
  const patch = resolveGoogleMapNodeTransformPatch(createNode(object, 1.4, 1.1), object);
  const harness = createComposerHarness([object]);
  harness.onTransform({ ...patch, x: 120, y: 150, rotation: 30, isFinal: true });
  const expected = harness.objects[0];
  const saved = buildPersistableRenderState({
    objetos: harness.objects,
    secciones: [{ id: "section", altoModo: "fijo", altura: 600 }],
    ALTURA_PANTALLA_EDITOR: 500,
  });
  const reloaded = buildLoadedEditorRenderState({
    ...JSON.parse(JSON.stringify(saved)),
    ALTURA_PANTALLA_EDITOR: 500,
  });
  assert.deepEqual(reloaded.objetos[0], expected);
  assert.equal(reloaded.objetos[0].scaleX, 1);
  assert.equal(reloaded.objetos[0].scaleY, 1);
});

test("the actual Transformer clamps each map dimension independently and keeps other minimums", () => {
  const oldBox = { x: 120, y: 50, width: 361, height: 220 };
  const bindings = {
    selectedElements: ["synthetic-map"],
    primerElemento: mapObject(),
    esTexto: false, esGaleria: false, esTriangulo: false, lockAspectCountdown: false,
    esMapaSeleccionado: true,
    transformGestureRef: { current: { isRotate: false } },
    transformerRef: { current: {
      getActiveAnchor: () => "bottom-right",
      getStage: () => ({ width: () => 800, height: () => 600 }),
    } },
    isTextBoxWidthResizeGesture: () => false,
    resolveStageBoundBox: (_old, next) => next,
    resolveGoogleMapResizeBounds,
  };
  const boundBox = compileExpression(callbackSource(transformer, "boundBoxFunc"), bindings);
  const narrow = boundBox(oldBox, { ...oldBox, width: 199, height: 260 });
  assert.equal(narrow.width, 200);
  assert.equal(narrow.height, 260);
  const short = boundBox(oldBox, { ...oldBox, width: 450, height: 199 });
  assert.equal(short.width, 450);
  assert.equal(short.height, 200);
  assert.equal(boundBox(oldBox, { ...oldBox, width: 200 }).width, 200);
  const atStageEdge = boundBox(oldBox, { ...oldBox, width: 750, height: 260 });
  assert.equal(atStageEdge.width, 680);
  assert.equal(atStageEdge.height, 260);
  const shapeBoundBox = compileExpression(callbackSource(transformer, "boundBoxFunc"), {
    ...bindings, esMapaSeleccionado: false, primerElemento: { tipo: "forma", figura: "rect" },
  });
  assert.equal(shapeBoundBox(oldBox, { ...oldBox, width: 20 }).width, 20);
  const rotatingBoundBox = compileExpression(callbackSource(transformer, "boundBoxFunc"), {
    ...bindings, transformGestureRef: { current: { isRotate: true } },
  });
  const rotated = { ...oldBox, rotation: Math.PI / 2 };
  assert.equal(rotatingBoundBox(oldBox, rotated), rotated);
});

test("single and multi-selection Transformer commits use the tested map adapter", () => {
  const release = callbackSource(transformer, "onTransformEnd");
  assert.match(release, /Object\.assign\(upd, resolveGoogleMapNodeTransformPatch\(n, obj\)\)/);
  assert.match(release, /Object\.assign\(finalData, resolveGoogleMapNodeTransformPatch\(node, primerElemento\)\)/);
});
