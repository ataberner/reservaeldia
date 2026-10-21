import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

import { buildPersistableRenderState } from "../components/editor/persistence/borradorSyncRenderState.js";
import {
  evaluateEditorHistoryCapture,
  planRedoHistoryTransition,
  planUndoHistoryTransition,
} from "../components/editor/history/historyState.js";

const require = createRequire(import.meta.url);
const { Node: KonvaNode } = require("konva/lib/Node.js");
const { DD: KonvaDD } = require("konva/lib/DragAndDrop.js");

function toDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function loadDragGrupalModule() {
  const source = await readFile(new URL("./dragGrupal.js", import.meta.url), "utf8");
  const layoutStub = toDataUrl(`
    export function determinarNuevaSeccion(_stageY, currentSectionId) {
      return { nuevaSeccion: currentSectionId || null };
    }
  `);
  const debugStub = toDataUrl(`
    export function getCanvasPointerDebugInfo() { return {}; }
    export function getCanvasSelectionDebugInfo() { return {}; }
    export function getKonvaNodeDebugInfo() { return {}; }
    export function logSelectedDragDebug() {}
    export function resetCanvasInteractionLogSample() {}
    export function sampleCanvasInteractionLog() {
      return { shouldLog: false, sampleCount: 0 };
    }
  `);
  const canonicalPoseStub = toDataUrl(`
    function readNumber(value, fallback = 0) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : fallback;
    }
    export function resolveCanonicalNodePose(node, objectMeta = null, overrides = {}) {
      const rawX = Number.isFinite(Number(overrides.x))
        ? Number(overrides.x)
        : readNumber(node?.x?.(), readNumber(objectMeta?.x, 0));
      const rawY = Number.isFinite(Number(overrides.y))
        ? Number(overrides.y)
        : readNumber(node?.y?.(), readNumber(objectMeta?.y, 0));
      const rotation = Number.isFinite(Number(overrides.rotation))
        ? Number(overrides.rotation)
        : readNumber(node?.rotation?.(), readNumber(objectMeta?.rotation, 0));
      return { rawX, rawY, x: rawX, y: rawY, rotation };
    }
  `);
  const bridgeStub = toDataUrl(`
    export const EDITOR_BRIDGE_EVENTS = {
      DRAGGING_START: "dragging-start",
      DRAGGING_END: "dragging-end",
    };
    export function buildEditorDragLifecycleDetail(detail = {}) { return { ...detail }; }
    export function projectLegacyGroupDragGlobals(session, options = {}) {
      if (!session) {
        return {
          _groupDragSession: null,
          _grupoLider: null,
          _grupoElementos: null,
          _grupoSeguidores: null,
          _dragStartPos: null,
          _dragInicial: null,
          _groupPreviewLastDelta: null,
        };
      }
      return {
        _groupDragSession: session,
        _grupoLider: session.leaderId || null,
        _grupoElementos: Array.isArray(session.elementIds) ? [...session.elementIds] : null,
        _grupoSeguidores: Array.isArray(session.followerIds) ? [...session.followerIds] : null,
        _dragStartPos:
          session.engine === "manual-pointer" && typeof options.resolveManualStartPointer === "function"
            ? options.resolveManualStartPointer(session)
            : session.startPointer || null,
        _dragInicial: session.dragInicial || null,
        _groupPreviewLastDelta: session.lastPreviewDelta || null,
      };
    }
  `);

  const transformedSource = source
    .replace('"@/drag/konvaDragSession"', JSON.stringify(new URL("./konvaDragSession.js", import.meta.url).href))
    .replace('"@/utils/layout"', JSON.stringify(layoutStub))
    .replace(
      '"@/components/editor/canvasEditor/selectedDragDebug"',
      JSON.stringify(debugStub)
    )
    .replace(
      '"@/components/editor/canvasEditor/konvaCanonicalPose"',
      JSON.stringify(canonicalPoseStub)
    )
    .replace('"@/lib/editorBridgeContracts"', JSON.stringify(bridgeStub));

  const groupModuleUrl = toDataUrl(transformedSource);
  const individualSource = await readFile(new URL("./dragIndividual.js", import.meta.url), "utf8");
  const touchModuleUrl = new URL("../lib/editorTouchDragIntent.js", import.meta.url).href;
  const individualModuleUrl = toDataUrl(individualSource
    .replace('"@/drag/konvaDragSession"', JSON.stringify(new URL("./konvaDragSession.js", import.meta.url).href))
    .replace('"@/drag/dragGrupal"', JSON.stringify(groupModuleUrl))
    .replace('"@/components/editor/canvasEditor/selectedDragDebug"', JSON.stringify(debugStub))
    .replace('"@/components/editor/canvasEditor/konvaCanonicalPose"', JSON.stringify(canonicalPoseStub))
    .replace('"@/lib/editorTouchDragIntent"', JSON.stringify(touchModuleUrl)));

  return {
    ...await import(groupModuleUrl),
    ...await import(individualModuleUrl),
  };
}

const {
  activateManualGroupDragSession,
  armManualGroupDragSession,
  buildIndividualDragModifierState,
  endDragIndividual,
  endDragGrupal,
  finishManualGroupDragSession,
  getActiveGroupDragSession,
  previewDragIndividual,
  previewDragGrupal,
  shouldSuppressIndividualDragEnd,
  startDragIndividual,
  startDragGrupalLider,
  updateManualGroupDragSession,
} = await loadDragGrupalModule();

class TestCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

function createStage() {
  let pointer = { x: 0, y: 0 };
  return {
    batchDraw() {},
    getPointerPosition() {
      return { ...pointer };
    },
    getStage() {
      return this;
    },
    setPointersPositions(event) {
      if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
        pointer = { x: event.clientX, y: event.clientY };
      }
    },
    setPointer(nextPointer) {
      pointer = { ...nextPointer };
    },
  };
}

function createNode({ id, x, y, stage }) {
  let position = { x, y };
  let draggable = true;
  let listening = true;
  let rotation = 0;
  const attrs = {};

  return {
    draggable(nextValue) {
      if (arguments.length > 0) draggable = Boolean(nextValue);
      return draggable;
    },
    getAttr(key) {
      return attrs[key];
    },
    getLayer() {
      return { batchDraw() {} };
    },
    getParent() {
      return null;
    },
    getStage() {
      return stage;
    },
    id() {
      return id;
    },
    listening(nextValue) {
      if (arguments.length > 0) listening = Boolean(nextValue);
      return listening;
    },
    position(nextPosition) {
      if (nextPosition) position = { ...nextPosition };
      return { ...position };
    },
    rotation(nextValue) {
      if (arguments.length > 0) rotation = Number(nextValue) || 0;
      return rotation;
    },
    setAttr(key, value) {
      attrs[key] = value;
    },
    x(nextValue) {
      if (arguments.length > 0) position.x = Number(nextValue);
      return position.x;
    },
    y(nextValue) {
      if (arguments.length > 0) position.y = Number(nextValue);
      return position.y;
    },
  };
}

function createScenario(sourceObjects, selectedIds) {
  const stage = createStage();
  const objects = sourceObjects.map((object) => structuredClone(object));
  const nodes = Object.fromEntries(
    objects.map((object) => [
      object.id,
      createNode({
        id: object.id,
        x: Number(object.x || 0),
        y: Number(object.y || 0),
        stage,
      }),
    ])
  );
  const changes = [];

  globalThis.CustomEvent = TestCustomEvent;
  globalThis.document = { body: { style: { cursor: "default" } } };
  globalThis.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.window = {
    _elementosSeleccionados: [...selectedIds],
    _objetosActuales: objects,
    _elementRefs: nodes,
    _seccionesOrdenadas: [{ id: "section-1", orden: 0, altura: 1000 }],
    dispatchEvent() {},
  };

  const emissions = [];
  const applyPatch = (id, patch) => {
    const index = objects.findIndex((object) => object.id === id);
    assert.notEqual(index, -1, `missing object ${id}`);
    objects[index] = { ...objects[index], ...patch };
    window._objetosActuales = objects;
    changes.push({ id, patch: { ...patch } });
  };
  const onChange = (id, patch) => {
    emissions.push({ id, patch });
    if (patch.isBatchUpdateFinal) {
      for (const change of patch.changes) applyPatch(change.id, change.patch);
    } else {
      applyPatch(id, patch);
    }
  };

  const drag = (leaderId, deltas, pointerType = "mouse") => {
    const leaderObject = objects.find((object) => object.id === leaderId);
    const leaderNode = nodes[leaderId];
    const start = leaderNode.position();
    const event = {
      currentTarget: leaderNode,
      target: leaderNode,
      evt: { pointerId: 1, pointerType },
    };
    const startResult = startDragGrupalLider(event, leaderObject);
    if (startResult.mode !== "started") return startResult;

    deltas.forEach(({ x, y }) => {
      leaderNode.position({ x: start.x + x, y: start.y + y });
      previewDragGrupal(event, leaderObject, onChange);
    });

    const endResult = endDragGrupal(event, leaderObject, onChange, null);
    return { startResult, endResult };
  };

  return {
    changes,
    emissions,
    drag,
    nodes,
    objects,
    onChange,
    stage,
    select(ids) {
      window._elementosSeleccionados = [...ids];
    },
  };
}

function baseObject(id, tipo, x, y, overrides = {}) {
  return {
    id,
    tipo,
    seccionId: "section-1",
    x,
    y,
    width: 100,
    height: 80,
    ...overrides,
  };
}

test("group drag applies one absolute delta to normal objects and persists final positions", () => {
  const scenario = createScenario(
    [baseObject("text-a", "texto", 10, 20), baseObject("image-b", "imagen", 100, 140)],
    ["text-a", "image-b"]
  );

  const result = scenario.drag("text-a", [{ x: 3, y: 5 }, { x: 12, y: -7 }]);

  assert.equal(result.endResult.mode, "completed");
  assert.equal(scenario.emissions.length, 1, "one group gesture is one atomic mutation");
  assert.equal(scenario.emissions[0].id, "BATCH_UPDATE_GROUP_FINAL");
  assert.equal(scenario.emissions[0].patch.changes.length, 2);
  assert.deepEqual(scenario.nodes["text-a"].position(), { x: 22, y: 13 });
  assert.deepEqual(scenario.nodes["image-b"].position(), { x: 112, y: 133 });
  assert.deepEqual(
    scenario.changes.map(({ id, patch }) => ({ id, x: patch.x, y: patch.y })),
    [
      { id: "text-a", x: 22, y: 13 },
      { id: "image-b", x: 112, y: 133 },
    ]
  );

  const persisted = buildPersistableRenderState({
    objetos: scenario.objects,
    secciones: window._seccionesOrdenadas,
    validarPuntosLinea: (points) => points,
    ALTURA_PANTALLA_EDITOR: 500,
  });
  assert.deepEqual(
    persisted.objetos.map(({ id, x, y }) => ({ id, x, y })),
    [
      { id: "text-a", x: 22, y: 13 },
      { id: "image-b", x: 112, y: 133 },
    ]
  );
});

test("group drag moves one Gallery with another object without changing Gallery-local data", () => {
  const galleryCells = [
    { id: "slot-a", mediaUrl: "https://cdn.test/a.jpg" },
    { id: "slot-b", mediaUrl: null },
  ];
  const scenario = createScenario(
    [
      baseObject("gallery-a", "galeria", 40, 60, {
        rows: 1,
        cols: 2,
        currentLayout: "grid_2x1",
        cells: galleryCells,
      }),
      baseObject("shape-b", "forma", 180, 240),
    ],
    ["gallery-a", "shape-b"]
  );

  scenario.drag("shape-b", [{ x: -20, y: 30 }]);

  assert.deepEqual(scenario.nodes["gallery-a"].position(), { x: 20, y: 90 });
  assert.deepEqual(scenario.nodes["shape-b"].position(), { x: 160, y: 270 });
  const gallery = scenario.objects.find((object) => object.id === "gallery-a");
  assert.deepEqual(gallery.cells, galleryCells);
  assert.equal(gallery.currentLayout, "grid_2x1");
});

test("a preserved group root moves by wrapper identity while its children remain group-local", () => {
  const children = [
    baseObject("group-text", "texto", 5, 8),
    baseObject("group-gallery", "galeria", 30, 40, {
      rows: 1,
      cols: 1,
      cells: [{ id: "nested-slot", mediaUrl: "https://cdn.test/nested.jpg" }],
    }),
  ].map(({ seccionId: _seccionId, ...child }) => child);
  const scenario = createScenario(
    [
      baseObject("group-a", "grupo", 50, 70, { children }),
      baseObject("gallery-b", "galeria", 250, 270, {
        rows: 2,
        cols: 2,
        currentLayout: "grid_2x2",
        cells: [],
      }),
    ],
    ["group-a", "gallery-b"]
  );

  scenario.drag("group-a", [{ x: 15, y: 25 }]);

  const finalGroup = scenario.objects.find((object) => object.id === "group-a");
  assert.deepEqual({ x: finalGroup.x, y: finalGroup.y }, { x: 65, y: 95 });
  assert.deepEqual(finalGroup.children, children);
  assert.deepEqual(scenario.nodes["gallery-b"].position(), { x: 265, y: 295 });
});

test("two distinct Galleries keep identity, presets, cells, and non-accumulating deltas across repeated drags", () => {
  const galleryA = baseObject("gallery-a", "galeria", 20, 30, {
    rows: 1,
    cols: 2,
    currentLayout: "grid_2x1",
    cells: [
      { id: "a-1", mediaUrl: "https://cdn.test/a-1.jpg" },
      { id: "a-2", mediaUrl: "https://cdn.test/a-2.jpg" },
    ],
  });
  const galleryB = baseObject("gallery-b", "galeria", 220, 330, {
    rows: 3,
    cols: 2,
    currentLayout: "grid_2x3",
    cells: Array.from({ length: 6 }, (_, index) => ({
      id: `b-${index + 1}`,
      mediaUrl: `https://cdn.test/b-${index + 1}.jpg`,
    })),
  });
  const galleryASnapshot = structuredClone(galleryA);
  const galleryBSnapshot = structuredClone(galleryB);
  const scenario = createScenario([galleryA, galleryB], ["gallery-a", "gallery-b"]);

  scenario.drag("gallery-a", [{ x: 4, y: 6 }, { x: 10, y: 15 }], "mouse");
  scenario.select(["gallery-a", "gallery-b"]);
  scenario.drag("gallery-b", [{ x: -5, y: 8 }, { x: -12, y: 20 }], "touch");

  assert.deepEqual(scenario.nodes["gallery-a"].position(), { x: 18, y: 65 });
  assert.deepEqual(scenario.nodes["gallery-b"].position(), { x: 218, y: 365 });

  const finalA = scenario.objects.find((object) => object.id === "gallery-a");
  const finalB = scenario.objects.find((object) => object.id === "gallery-b");
  assert.deepEqual(finalA.cells, galleryASnapshot.cells);
  assert.deepEqual(finalB.cells, galleryBSnapshot.cells);
  assert.equal(finalA.currentLayout, galleryASnapshot.currentLayout);
  assert.equal(finalB.currentLayout, galleryBSnapshot.currentLayout);
  assert.equal(finalA.id, "gallery-a");
  assert.equal(finalB.id, "gallery-b");
  assert.equal(getActiveGroupDragSession(), null);
});

test("an unselected second Gallery is untouched and each Gallery can start a later individual path", () => {
  const scenario = createScenario(
    [
      baseObject("gallery-a", "galeria", 10, 20, {
        rows: 1,
        cols: 1,
        currentLayout: "grid_1x1",
        cells: [{ id: "a-1", mediaUrl: "https://cdn.test/a.jpg" }],
      }),
      baseObject("gallery-b", "galeria", 300, 400, {
        rows: 4,
        cols: 3,
        currentLayout: "grid_3x4",
        cells: Array.from({ length: 12 }, (_, index) => ({ id: `b-${index + 1}` })),
      }),
      baseObject("text-c", "texto", 100, 120),
    ],
    ["gallery-a", "text-c"]
  );

  scenario.drag("text-c", [{ x: 25, y: -10 }]);

  assert.deepEqual(scenario.nodes["gallery-a"].position(), { x: 35, y: 10 });
  assert.deepEqual(scenario.nodes["text-c"].position(), { x: 125, y: 110 });
  assert.deepEqual(scenario.nodes["gallery-b"].position(), { x: 300, y: 400 });
  assert.equal(scenario.changes.some(({ id }) => id === "gallery-b"), false);

  for (const galleryId of ["gallery-a", "gallery-b"]) {
    scenario.select([galleryId]);
    const result = scenario.drag(galleryId, [{ x: 50, y: 50 }]);
    assert.equal(result.mode, "not-eligible");
    assert.equal(getActiveGroupDragSession(), null);
  }
});

test("GaleriaKonva delegates multi-selection drags to the existing group owner and preserves individual metadata", async () => {
  const gallerySource = await readFile(
    new URL("../components/editor/GaleriaKonva.jsx", import.meta.url),
    "utf8"
  );
  const composerSource = await readFile(
    new URL(
      "../components/editor/textSystem/render/konva/CanvasStageContentComposer.jsx",
      import.meta.url
    ),
    "utf8"
  );
  const galleryBranchStart = composerSource.indexOf('if (obj.tipo === "galeria")');
  const galleryBranchEnd = composerSource.indexOf('if (obj.tipo === "countdown")', galleryBranchStart);
  const galleryComposerBranch = composerSource.slice(galleryBranchStart, galleryBranchEnd);

  assert.match(gallerySource, /from "@\/drag\/dragGrupal"/);
  assert.match(gallerySource, /startDragGrupalLider\(e, obj\)/);
  assert.match(gallerySource, /previewDragGrupal\(e, obj, onChange\)/);
  assert.match(gallerySource, /endDragGrupal\(e, obj, onChange, null\)/);
  assert.match(gallerySource, /pipeline: "group"/);
  assert.match(gallerySource, /pipeline: "individual"/);
  assert.match(galleryComposerBranch, /meta\?\.pipeline === "group"/);
  assert.match(galleryComposerBranch, /isGroupPipeline \? "group" : "individual"/);
});

function dragEvent(node, point = { x: 0, y: 0 }) {
  return {
    currentTarget: node,
    target: node,
    evt: { pointerId: 1, pointerType: "mouse", clientX: point.x, clientY: point.y },
  };
}

function completeGroupGesture(scenario, engine) {
  if (engine === "native") {
    return scenario.drag("leader", [{ x: 30, y: 40 }]);
  }
  const object = scenario.objects.find(({ id }) => id === "leader");
  const event = dragEvent(scenario.nodes.leader);
  const armed = armManualGroupDragSession(event, object);
  assert.equal(armed.mode, "armed");
  activateManualGroupDragSession(armed.session, event.evt);
  const release = dragEvent(scenario.nodes.leader, { x: 30, y: 40 }).evt;
  updateManualGroupDragSession(release);
  const result = finishManualGroupDragSession(release, { obj: object, onChange: scenario.onChange });
  assert.equal(result.mode, "completed");
  return result;
}

function captureHistory(objects, previousSignature = "") {
  const result = evaluateEditorHistoryCapture({
    cargado: true,
    objetos: structuredClone(objects),
    secciones: window._seccionesOrdenadas,
    lastSignature: previousSignature,
  });
  assert.equal(result.shouldCapture, true);
  return result;
}

for (const scale of [1, 0.6]) {
  for (const altKey of [false, true]) {
    test(`manual group first move previews and immediate release commits the whole delta (zoom ${scale}, Alt ${altKey})`, () => {
      const scenario = createScenario([
        baseObject("leader", "texto", 240, 120),
        baseObject("follower", "galeria", 100, 300),
      ], ["leader", "follower"]);
      // Konva converts client coordinates to logical stage units before the owner reads them.
      scenario.stage.setPointersPositions = (event) => {
        scenario.stage.setPointer({ x: event.clientX / scale, y: event.clientY / scale });
      };
      const nativeEvent = (x, y) => ({
        pointerId: 1, pointerType: "mouse", clientX: x * scale, clientY: y * scale, altKey,
      });
      const node = scenario.nodes.leader;
      const object = scenario.objects[0];
      const down = nativeEvent(260, 140);
      const initialHistory = captureHistory(scenario.objects);
      const armed = armManualGroupDragSession({ target: node, currentTarget: node, evt: down }, object);
      assert.equal(armed.mode, "armed");
      const move = nativeEvent(380, 140);

      const update = updateManualGroupDragSession(move);
      assert.deepEqual(node.position(), { x: 360, y: 120 }, "the activation sample must move the leader");
      assert.deepEqual(scenario.nodes.follower.position(), { x: 220, y: 300 });
      assert.equal(update.mode, "preview", "the existing renderer must forward this sample to the overlay");
      assert.equal(update.activatedNow, true, "the renderer must start the group lifecycle exactly once");
      assert.equal(update.session.hasPreviewSinceActivation, true);
      assert.deepEqual(update.session.lastPreviewDelta, { deltaX: 120, deltaY: 0 });
      assert.equal(scenario.changes.length, 0, "preview does not persist");

      const result = finishManualGroupDragSession(move, { obj: object, onChange: scenario.onChange });
      assert.equal(result.mode, "completed");
      assert.deepEqual(node.position(), { x: 360, y: 120 });
      assert.deepEqual(scenario.nodes.follower.position(), { x: 220, y: 300 });
      assert.deepEqual(scenario.changes.map(({ id, patch }) => ({ id, x: patch.x, y: patch.y })), [
        { id: "leader", x: 360, y: 120 }, { id: "follower", x: 220, y: 300 },
      ]);
      assert.equal(finishManualGroupDragSession(move, { obj: object, onChange: scenario.onChange }).handled, false);
      assert.equal(scenario.changes.length, 2, "a repeated release cannot duplicate either commit");
      assert.equal(getActiveGroupDragSession(), null);
      assert.equal(node.draggable(), true);
      assert.equal(scenario.nodes.follower.draggable(), true);
      assert.equal(scenario.nodes.follower.listening(), true);

      const persisted = buildPersistableRenderState({
        objetos: scenario.objects, secciones: window._seccionesOrdenadas,
        validarPuntosLinea: (points) => points, ALTURA_PANTALLA_EDITOR: 500,
      });
      for (const member of persisted.objetos) {
        assert.deepEqual({ x: member.x, y: member.y }, scenario.nodes[member.id].position());
      }
      const movedHistory = captureHistory(scenario.objects, initialHistory.nextBaselineSignature);
      const undo = planUndoHistoryTransition({ history: [initialHistory.comparable, movedHistory.comparable] });
      assert.deepEqual(undo.targetSnapshot, initialHistory.comparable);
      assert.deepEqual(planRedoHistoryTransition(undo).targetSnapshot, movedHistory.comparable);
    });
  }
}

test("manual group subsequent moves and release retain the pointer-down origin", () => {
  const scenario = createScenario([
    baseObject("leader", "forma", 10, 20), baseObject("follower", "countdown", 100, 140),
  ], ["leader", "follower"]);
  const node = scenario.nodes.leader;
  const object = scenario.objects[0];
  armManualGroupDragSession(dragEvent(node, { x: 30, y: 40 }), object);
  const first = updateManualGroupDragSession(dragEvent(node, { x: 50, y: 70 }).evt);
  assert.deepEqual(node.position(), { x: 30, y: 50 });
  assert.equal(first.activatedNow, true);
  const reverse = updateManualGroupDragSession(dragEvent(node, { x: 20, y: 35 }).evt);
  assert.equal(reverse.activatedNow, false);
  assert.deepEqual(node.position(), { x: 0, y: 15 });
  // Release can carry a newer position than the final move; it uses the same origin.
  finishManualGroupDragSession(dragEvent(node, { x: 25, y: 30 }).evt, { obj: object, onChange: scenario.onChange });
  assert.deepEqual(node.position(), { x: 5, y: 10 });
  assert.deepEqual(scenario.nodes.follower.position(), { x: 95, y: 130 });
  assert.equal(scenario.changes.length, 2);
});

for (const [pointerType, threshold] of [["mouse", 4], ["touch", 6]]) {
  test(`manual ${pointerType} group retains its activation threshold and does not commit a pending release`, () => {
    const scenario = createScenario([
      baseObject("leader", "forma", 10, 20), baseObject("follower", "imagen", 100, 140),
    ], ["leader", "follower"]);
    const node = scenario.nodes.leader;
    const object = scenario.objects[0];
    const event = (x, pointerId = 1) => ({ pointerType, pointerId, clientX: x, clientY: 0 });
    armManualGroupDragSession({ target: node, currentTarget: node, evt: event(0) }, object);
    assert.equal(updateManualGroupDragSession(event(100, 2)).mode, "pointer-mismatch");
    assert.equal(updateManualGroupDragSession(event(threshold - 0.1)).mode, "armed-waiting-threshold");
    assert.deepEqual(node.position(), { x: 10, y: 20 });
    assert.equal(finishManualGroupDragSession(event(threshold - 0.1), { obj: object, onChange: scenario.onChange }).mode, "cancelled");
    assert.equal(scenario.changes.length, 0);
    assert.equal(getActiveGroupDragSession(), null);
    assert.equal(node.draggable(), true);
    assert.equal(scenario.nodes.follower.listening(), true);

    // The renderer still owns the shared touch-intent gate; this checks the already-approved adapter path.
    armManualGroupDragSession({ target: node, currentTarget: node, evt: event(0) }, object);
    assert.equal(updateManualGroupDragSession(event(threshold)).activatedNow, true);
    assert.deepEqual(node.position(), { x: 10 + threshold, y: 20 });
    finishManualGroupDragSession(event(threshold), { obj: object, onChange: scenario.onChange });
    assert.equal(scenario.changes.length, 2);
  });
}

test("accepted native group start repeats the same destination after undo using installed Konva", (t) => {
  const scenario = createScenario([
    baseObject("leader", "galeria", 240, 120), baseObject("follower", "countdown", 100, 300),
  ], ["leader", "follower"]);
  const initial = structuredClone(scenario.objects);
  const stage = scenario.stage;
  stage._getPointerById = () => ({ ...stage.getPointerPosition(), id: 1 });
  Object.defineProperty(stage, "_changedPointerPositions", { get: () => [stage._getPointerById()] });
  for (const object of scenario.objects) {
    const node = new KonvaNode({ id: object.id, x: object.x, y: object.y });
    node.getStage = () => stage;
    scenario.nodes[object.id] = node;
    node.on("dragstart", (event) => startDragGrupalLider(event, object));
    node.on("dragmove", (event) => previewDragGrupal(event, object, scenario.onChange));
    node.on("dragend", (event) => endDragGrupal(event, object, scenario.onChange, null));
  }
  const node = scenario.nodes.leader;
  t.after(() => {
    for (const member of Object.values(scenario.nodes)) KonvaDD._dragElements.delete(member._id);
  });
  const gesture = () => {
    stage.setPointer({ x: node.x() + 20, y: node.y() + 20 });
    node._createDragElement({ pointerId: 1 });
    KonvaDD._drag({ pointerId: 1, clientX: 340, clientY: 140 });
    assert.deepEqual(node.position(), { x: 320, y: 120 });
    assert.deepEqual(scenario.nodes.follower.position(), { x: 180, y: 300 });
    // Duplicate and follower starts belong to this gesture; neither may erase its native cache.
    const lastPosition = node._lastPos;
    assert.equal(startDragGrupalLider(dragEvent(node), scenario.objects[0]).mode, "duplicate-leader-ignored");
    assert.equal(node._lastPos, lastPosition);
    assert.equal(startDragGrupalLider(dragEvent(scenario.nodes.follower), scenario.objects[1]).mode, "follower-ignored");
    assert.equal(node._lastPos, lastPosition);
    KonvaDD._dragElements.get(node._id).dragStatus = "stopped";
    KonvaDD._endDragAfter({});
  };
  gesture();
  assert.equal(scenario.changes.length, 2);
  for (const object of initial) {
    scenario.nodes[object.id].position({ x: object.x, y: object.y });
    Object.assign(scenario.objects.find(({ id }) => id === object.id), object);
  }
  assert.deepEqual(node._lastPos, { x: 320, y: 120 }, "native cache survives history's accepted pose restoration");
  gesture();
  assert.equal(scenario.changes.length, 4, "two commits per gesture, including the repeated destination");
  assert.deepEqual(scenario.changes.slice(2), scenario.changes.slice(0, 2));
});

test("manual arming and suppressed follower starts preserve a native position cache", () => {
  const scenario = createScenario([
    baseObject("leader", "texto", 10, 20), baseObject("follower", "countdown", 100, 140),
  ], ["leader", "follower"]);
  const cache = { x: 200, y: 250 };
  scenario.nodes.leader._lastPos = cache;
  scenario.nodes.follower._lastPos = cache;
  const event = dragEvent(scenario.nodes.leader);
  const armed = armManualGroupDragSession(event, scenario.objects[0]);
  assert.equal(armed.mode, "armed");
  assert.equal(scenario.nodes.leader._lastPos, cache, "manual arming is not an accepted native dragstart");
  startDragIndividual(dragEvent(scenario.nodes.follower), { current: null });
  assert.equal(scenario.nodes.follower._lastPos, cache);
  assert.equal(startDragGrupalLider(dragEvent(scenario.nodes.follower), scenario.objects[1]).mode, "follower-ignored");
  assert.equal(scenario.nodes.follower._lastPos, cache);
  finishManualGroupDragSession(event.evt, { obj: scenario.objects[0], onChange: scenario.onChange });
  assert.equal(scenario.changes.length, 0);
});

for (const engine of ["native", "manual-pointer"]) {
  for (const individualId of ["leader", "follower"]) {
    test(`${engine} group -> immediate individual ${individualId} commits once, persists and remains undoable`, () => {
      const scenario = createScenario([
        baseObject("leader", "texto", 10, 20),
        baseObject("follower", "countdown", 100, 140),
      ], ["leader", "follower"]);
      const initial = captureHistory(scenario.objects);
      completeGroupGesture(scenario, engine);
      const grouped = captureHistory(scenario.objects, initial.nextBaselineSignature);
      assert.equal(scenario.changes.length, 2);

      scenario.select([individualId]);
      const node = scenario.nodes[individualId];
      const object = scenario.objects.find(({ id }) => id === individualId);
      const event = dragEvent(node);
      assert.equal(startDragGrupalLider(event, object).mode, "not-eligible");
      startDragIndividual(event, { current: null });
      node.position({ x: 190, y: 200 });
      const previews = [];
      previewDragIndividual(event, object, (...args) => previews.push(args));
      const ends = [];
      endDragIndividual(object, node, scenario.onChange, (...args) => ends.push(args), { current: true });

      assert.equal(previews.length, 1);
      assert.equal(ends.length, 1);
      assert.equal(scenario.changes.length, 3, "one new commit for the next gesture");
      assert.equal(scenario.changes.at(-1).patch.causa, "drag-individual");
      const persistible = buildPersistableRenderState({
        objetos: scenario.objects,
        secciones: window._seccionesOrdenadas,
        validarPuntosLinea: (points) => points,
        ALTURA_PANTALLA_EDITOR: 500,
      });
      const persisted = persistible.objetos.find(({ id }) => id === individualId);
      assert.deepEqual({ x: persisted.x, y: persisted.y }, node.position());
      const individual = captureHistory(scenario.objects, grouped.nextBaselineSignature);
      const history = [initial.comparable, grouped.comparable, individual.comparable];
      const undo = planUndoHistoryTransition({ history });
      assert.deepEqual(undo.targetSnapshot, grouped.comparable);
      const redo = planRedoHistoryTransition(undo);
      assert.deepEqual(redo.targetSnapshot, individual.comparable);
    });
  }

  test(`${engine} repeated group dragends never commit through the individual finalizer`, async () => {
    const scenario = createScenario([
      baseObject("leader", "texto", 10, 20),
      baseObject("follower", "countdown", 100, 140),
    ], ["leader", "follower"]);
    completeGroupGesture(scenario, engine);
    // Expire the existing time-based guards before delivering repeated late ends.
    await new Promise((resolve) => setTimeout(resolve, 470));
    for (let repeat = 0; repeat < 2; repeat += 1) {
      for (const object of [...scenario.objects]) {
        const node = scenario.nodes[object.id];
        const result = endDragGrupal(dragEvent(node), object, scenario.onChange, null);
        if (!result.handled) {
          endDragIndividual(object, node, scenario.onChange, null, { current: true });
        }
      }
    }
    assert.equal(scenario.changes.length, 2, "only the original group commits survive");
  });
}

test("the Gallery specialized finalizer ignores repeated group ends and accepts a new individual start", async () => {
  const source = await readFile(new URL("../components/editor/GaleriaKonva.jsx", import.meta.url), "utf8");
  const handlerStart = source.indexOf("onDragEnd={isPassiveRender ? undefined : (e) => {");
  const handlerEnd = source.indexOf("\n      }}", handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  const body = source.slice(source.indexOf("=> {", handlerStart) + 4, handlerEnd);
  const scenario = createScenario([
    baseObject("leader", "texto", 10, 20),
    baseObject("follower", "galeria", 100, 140),
  ], ["leader", "follower"]);
  const object = scenario.objects[1];
  const lifecycle = { current: { mode: "individual" } };
  const dependencies = {
    obj: object,
    dragLifecycleRef: lifecycle,
    endDragGrupal,
    shouldSuppressIndividualDragEnd,
    buildIndividualDragModifierState,
    onChange: scenario.onChange,
    onDragMovePersonalizado: null,
    onDragEndPersonalizado: null,
    notePostDragSelectionGuard() {},
    cleanupGlobal() {},
    pressRef: { current: {} },
    EDITOR_BRIDGE_EVENTS: { DRAGGING_END: "dragging-end" },
    buildEditorDragLifecycleDetail: (detail) => detail,
  };
  const handler = new Function(...Object.keys(dependencies), `return (e) => { ${body} };`)(...Object.values(dependencies));
  completeGroupGesture(scenario, "native");
  // A follower need not have received dragstart; its local lifecycle can be idle.
  lifecycle.current = { mode: "idle" };
  const event = dragEvent(scenario.nodes.follower);
  handler(event);
  handler(event);
  assert.equal(scenario.changes.length, 2);

  scenario.select([object.id]);
  assert.equal(startDragGrupalLider(event, object).mode, "not-eligible");
  lifecycle.current = { mode: "individual" };
  scenario.nodes.follower.position({ x: 190, y: 200 });
  handler(event);
  assert.equal(scenario.changes.length, 3);
  assert.deepEqual(scenario.nodes.follower.position(), { x: scenario.objects[1].x, y: scenario.objects[1].y });
});

test("a later individual start supersedes only its member after the group timer guards expire", async () => {
  const scenario = createScenario([
    baseObject("leader", "texto", 10, 20),
    baseObject("follower", "countdown", 100, 140),
  ], ["leader", "follower"]);
  completeGroupGesture(scenario, "native");
  await new Promise((resolve) => setTimeout(resolve, 470));
  scenario.select(["leader"]);
  startDragIndividual(dragEvent(scenario.nodes.leader), { current: null });
  scenario.nodes.leader.position({ x: 190, y: 200 });
  assert.equal(shouldSuppressIndividualDragEnd("leader", scenario.nodes.leader), false);
  assert.equal(shouldSuppressIndividualDragEnd("follower", scenario.nodes.follower), true);
  endDragIndividual(scenario.objects[0], scenario.nodes.leader, scenario.onChange, null, { current: true });
  endDragIndividual(scenario.objects[1], scenario.nodes.follower, scenario.onChange, null, { current: true });
  assert.equal(scenario.changes.length, 3);
  assert.deepEqual(scenario.nodes.leader.position(), { x: scenario.objects[0].x, y: scenario.objects[0].y });
});

test("an individual callback during an active group cannot release the follower guard", () => {
  const scenario = createScenario([
    baseObject("leader", "texto", 10, 20),
    baseObject("follower", "countdown", 100, 140),
  ], ["leader", "follower"]);
  const leaderEvent = dragEvent(scenario.nodes.leader);
  assert.equal(startDragGrupalLider(leaderEvent, scenario.objects[0]).mode, "started");
  startDragIndividual(dragEvent(scenario.nodes.follower), { current: null });
  endDragIndividual(scenario.objects[1], scenario.nodes.follower, scenario.onChange, null, { current: true });
  assert.equal(scenario.changes.length, 0);
  scenario.nodes.leader.position({ x: 40, y: 60 });
  previewDragGrupal(leaderEvent, scenario.objects[0], scenario.onChange);
  endDragGrupal(leaderEvent, scenario.objects[0], scenario.onChange, null);
  assert.equal(scenario.changes.length, 2);
});
