import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as historyState from "./historyState.js";
import { transitionEventLayoutMode } from "../../../../shared/eventLayout.js";
import {
  buildProtectedSectionObjectSanitizer,
  buildProtectedSectionStateSanitizer,
} from "../../../domain/editor/protectedSections.js";

const require = createRequire(import.meta.url);
const ts = require("../../../../functions/node_modules/typescript");
const sections = [{ id: "s1", altura: 1000 }];
const objects = [{ id: "active", seccionId: "s1", x: 240, y: 200 }];

function loadModule(relative, imports) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", output)((name) => {
    if (!(name in imports)) throw new Error("Unexpected test import " + name);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}

test("history captures a mode-only transition without copying semantic event configuration", () => {
  const common = { cargado: true, objetos: objects, secciones: sections };
  const before = historyState.evaluateEditorHistoryCapture({ ...common, eventMode: "single" });
  const after = historyState.evaluateEditorHistoryCapture({
    ...common, eventMode: "ceremony_party", lastSignature: before.nextBaselineSignature,
    eventDetails: { mode: "ceremony_party", dressCode: { value: "Formal" } },
  });
  assert.equal(before.comparable.eventMode, "single");
  assert.equal(after.shouldCapture, true, "a visible mode change needs its own undo step");
  assert.equal(after.comparable.eventMode, "ceremony_party");
  assert.equal("eventDetails" in after.comparable, false);
  assert.equal("dressCode" in after.comparable, false);
});

test("omitted event mode preserves the legacy history snapshot shape", () => {
  const result = historyState.evaluateEditorHistoryCapture({ cargado: true, objetos: objects, secciones: sections });
  assert.deepEqual(result.comparable, { objetos: objects, secciones: sections, dynamicVisualState: null });
});

test("history does not capture event configuration or unsupported values as a mode", () => {
  for (const eventMode of [null, "", "party", { mode: "single", dressCode: { value: "Formal" } }]) {
    const result = historyState.evaluateEditorHistoryCapture({ cargado: true, eventMode });
    assert.equal("eventMode" in result.comparable, false);
  }
});

test("history hook reacts when only the event mode changes", () => {
  const refs = [], dependencies = [];
  let hookIndex = 0, captures = [], futures = ["old"];
  const hook = loadModule("./useHistoryManager.js", {
    react: {
      useRef(value) { const i = hookIndex++; return refs[i] ||= { current: value }; },
      useEffect(effect, deps) {
        const i = hookIndex++, previous = dependencies[i];
        if (!previous || deps.some((entry, index) => !Object.is(entry, previous[index]))) effect();
        dependencies[i] = deps;
      },
    },
    "./historyState.js": historyState,
  }).default;
  const initialWindow = globalThis.window;
  globalThis.window = { innerWidth: 1365 };
  try {
    const props = { cargado: true, objetos: objects, secciones: sections, ignoreNextUpdateRef: { current: 0 },
      setHistorial: updater => { captures = updater(captures); }, setFuturos: value => { futures = value; } };
    hookIndex = 0; hook({ ...props, eventMode: "single" });
    hookIndex = 0; hook({ ...props, eventMode: "ceremony_party" });
    assert.deepEqual(captures.map(entry => entry.eventMode), ["single", "ceremony_party"]);
    assert.deepEqual(futures, []);
  } finally { globalThis.window = initialWindow; }
});

function loadActions() {
  return loadModule("../../../utils/editorActions.js", {
    "@/domain/functionalCtaButtons": {}, "../../shared/functionalAssociations.js": {},
    "../../shared/eventLayout.js": { transitionEventLayoutMode },
    "@/domain/editor/renderObjectTree": {},
    "@/domain/editor/protectedSections": { buildProtectedSectionObjectSanitizer, buildProtectedSectionStateSanitizer },
    "../components/editor/history/historyState.js": historyState,
  });
}

function makeActionState() {
  const first = { objetos: objects, secciones: sections, eventMode: "single", dynamicVisualState: { id: "one" } };
  const second = { objetos: objects.map(o => ({ ...o, x: 350 })), secciones: sections, eventMode: "ceremony_party", dynamicVisualState: { id: "two" } };
  const calls = [];
  const state = { historial: [first, second], futuros: [], objetos: second.objetos, secciones: sections,
    ignoreNextUpdateRef: { current: 0 }, setElementosSeleccionados: ids => calls.push(["selection", ids]),
    setMostrarPanelZ: value => calls.push(["panel", value]), setHistorial: value => { state.historial = value; },
    setFuturos: value => { state.futuros = value; }, setObjetos: value => calls.push(["objects", value]),
    setSecciones: value => calls.push(["sections", value]),
    restoreDynamicVisualState: (...args) => { calls.push(["dynamic", ...args]); return args[1]; },
    restoreCanvasState: value => calls.push(["canvas", value]) };
  return { state, calls, first, second };
}

test("undo and redo restore destination mode with the raw canvas in one owner callback", () => {
  const { ejecutarDeshacer, ejecutarRehacer } = loadActions();
  const { state, calls, first, second } = makeActionState();
  assert.equal(ejecutarDeshacer(state), true);
  assert.equal(calls.find(c => c[0] === "dynamic")[4], "single");
  assert.deepEqual(calls.find(c => c[0] === "canvas")?.[1], { objetos: first.objetos, secciones: sections, eventMode: "single" });
  assert.equal(calls.filter(c => ["objects", "sections"].includes(c[0])).length, 0);
  calls.length = 0;
  assert.equal(ejecutarRehacer(state), true);
  assert.equal(calls.find(c => c[0] === "dynamic")[4], "ceremony_party");
  assert.deepEqual(calls.find(c => c[0] === "canvas")?.[1], { objetos: second.objetos, secciones: sections, eventMode: "ceremony_party" });
  assert.equal(calls.filter(c => c[0] === "canvas").length, 1);
  assert.equal(state.ignoreNextUpdateRef.current, 2);
});

test("legacy snapshots and callers keep setter fallback without synthesizing an event mode", () => {
  const { ejecutarDeshacer } = loadActions();
  const { state, calls, first } = makeActionState();
  delete first.eventMode; delete state.restoreCanvasState;
  assert.equal(ejecutarDeshacer(state), true);
  assert.equal(calls.find(c => c[0] === "dynamic")[4], undefined);
  assert.deepEqual(calls.find(c => c[0] === "objects")[1], first.objetos);
  assert.deepEqual(calls.find(c => c[0] === "sections")[1], sections);
});

test("atomic history restore still protects locked sections and their objects", () => {
  const { ejecutarDeshacer } = loadActions();
  const { state, calls } = makeActionState();
  state.secciones = [{ id: "s1", altura: 1000, bloqueada: true }];
  state.objetos = [{ ...objects[0], x: 800 }];
  ejecutarDeshacer(state);
  assert.equal(calls.find(c => c[0] === "canvas")?.[1].objetos[0].x, 800);
  assert.equal(calls.find(c => c[0] === "canvas")?.[1].secciones[0].bloqueada, true);
});

for (const action of ["ejecutarDeshacer", "ejecutarRehacer"]) {
  test(`${action} supplies the same reconciled protected layout to persistence and canvas restore`, () => {
    const actions = loadActions();
    const { state, calls } = makeActionState();
    const pose = x => ({ x, y: 200 });
    state.secciones = [{ id: "s1", altura: 1000, bloqueada: true, eventLayout: {
      version: 1, materializedMode: "ceremony_party",
      positionsByMode: { single: { active: pose(350) } },
      initialPositionsByMode: { single: { active: pose(350) }, ceremony_party: { active: pose(240) } },
    } }];
    state.objetos = [{ ...objects[0], x: 240, color: "current-style" }];
    const before = structuredClone({ objetos: state.objetos, secciones: state.secciones });
    const target = { objetos: objects, secciones: sections, eventMode: "single", dynamicVisualState: { id: "target" } };
    if (action === "ejecutarDeshacer") state.historial = [target, state.historial[1]];
    else state.futuros = [target];
    assert.equal(actions[action](state), true);
    const persisted = calls.find(c => c[0] === "dynamic");
    const restored = calls.find(c => c[0] === "canvas")[1];
    assert.equal(persisted[2][0].x, 350, "authoring persistence must receive target-mode coordinates");
    assert.equal(persisted[3][0].eventLayout.materializedMode, "single");
    assert.equal(persisted[3][0].eventLayout.positionsByMode.ceremony_party.active.x, 240);
    assert.equal(persisted[2], restored.objetos);
    assert.equal(persisted[3], restored.secciones);
    assert.equal(restored.secciones[0].bloqueada, true);
    assert.equal(restored.objetos[0].color, "current-style");
    assert.deepEqual({ objetos: state.objetos, secciones: state.secciones }, before);
  });
}

test("editor handlers forward the atomic restore callback to undo and redo", () => {
  const calls = [], deps = [], restoreCanvasState = () => {};
  const hook = loadModule("../../../hooks/useEditorHandlers.js", {
    react: { useCallback: (callback, dependencies) => { deps.push(dependencies); return callback; } },
    "@/utils/editorActions": { ejecutarDeshacer: value => calls.push(value), ejecutarRehacer: value => calls.push(value) },
    "@/domain/editor/grouping": {}, "../../shared/functionalAssociations.js": {},
    "@/components/editor/textSystem/render/konva/selectionBoundsGeometry": {},
    "@/domain/editor/canvasObjectPositioning": {}, "@/utils/layout": {},
    "@/components/editor/canvasEditor/canvasEditorCoreUtils": {}, "@/domain/editor/protectedSections": {},
  }).default;
  const handlers = hook({ objetos: objects, secciones: sections, restoreCanvasState });
  handlers.onDeshacer(); handlers.onRehacer();
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.restoreCanvasState === restoreCanvasState));
  assert.ok(deps[0].includes(restoreCanvasState));
  assert.ok(deps[1].includes(restoreCanvasState));
});
