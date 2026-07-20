import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPersistableRenderState } from "../components/editor/persistence/borradorSyncRenderState.js";

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

  return import(toDataUrl(transformedSource));
}

const {
  endDragGrupal,
  getActiveGroupDragSession,
  previewDragGrupal,
  startDragGrupalLider,
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

  const onChange = (id, patch) => {
    const index = objects.findIndex((object) => object.id === id);
    assert.notEqual(index, -1, `missing object ${id}`);
    objects[index] = { ...objects[index], ...patch };
    window._objetosActuales = objects;
    changes.push({ id, patch: { ...patch } });
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
    drag,
    nodes,
    objects,
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
