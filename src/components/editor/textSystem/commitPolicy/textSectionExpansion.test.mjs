import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expandSectionsForTextChanges } from "../../../../domain/sections/textContentExpansion.js";
import { canEditObject } from "../../../../domain/editor/protectedSections.js";
import { shouldPreserveTextCenterPosition } from "../../../../lib/textCenteringPolicy.js";
import {
  normalizeInlineEditableDomText,
  normalizeInlineEditableText,
} from "../../overlays/inlineTextModel.js";

const source = readFileSync(new URL("./useInlineCommitPolicy.js", import.meta.url), "utf8");
const authoring = readFileSync(new URL("../../templateAuthoring/useTemplateFieldAuthoring.js", import.meta.url), "utf8");

function makeHandlers(params) {
  // Execute the actual coordinator with synchronous UI/diagnostic adapters. No Firebase.
  const dependencies = {
    flushSync: (commit) => commit(),
    getInlineLineStats: (value) => ({ length: String(value).length, lineCount: 1, trailingNewlines: 0 }),
    inlineDebugLog: () => {},
    normalizeInlineEditableDomTextShared: normalizeInlineEditableDomText,
    normalizeInlineEditableTextShared: normalizeInlineEditableText,
    clearCurrentInlineEditingIdIfMatches: () => {},
    getCurrentInlineEditingId: () => null,
    shouldPreserveTextCenterPosition,
    canEditObject,
    normalizeDynamicInlineFieldValue: ({ value }) => value,
  };
  const body = source.replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, "")
    .replace("export default function", "return function");
  return new Function(...Object.keys(dependencies), body)(...Object.values(dependencies))(params);
}

function fixture(altoModo = "fijo") {
  const object = { id: "story", tipo: "texto", texto: "Una línea", seccionId: "section",
    x: 10, y: 80, width: 200, __autoWidth: false };
  let objects = [object];
  let sections = [{ id: "section", altura: 110, altoModo }];
  const resolveSectionsAfterTextChange = (mutation) => expandSectionsForTextChanges({
    ...mutation,
    measureTextBottom: ({ object, text }) => object.y + String(text).split("\n").length * 20,
  });
  return {
    params: {
      editing: { id: "story", value: "Una línea\nDos líneas\nTres líneas" },
      objetos: objects, secciones: sections,
      captureInlineSnapshot: () => {},
      updateEdit: () => {},
      inlineEditPreviewRef: { current: {} }, inlineCommitDebugRef: { current: {} },
      setInlineOverlayMountedId: () => {}, setInlineOverlayMountSession: () => {},
      finishEdit: () => {}, restoreElementDrag: () => {},
      setObjetos: (next) => { objects = typeof next === "function" ? next(objects) : next; },
      setSecciones: (next) => { sections = next; },
      resolveSectionsAfterTextChange,
    },
    snapshot: () => ({ objects, sections }),
  };
}

test("ordinary inline commit includes exactly the required section height with the text", () => {
  const { params, snapshot } = fixture();
  makeHandlers(params).onInlineFinish();
  assert.equal(snapshot().objects[0].texto, params.editing.value);
  assert.equal(snapshot().sections[0].altura, 140);
  assert.equal(snapshot().objects[0].y, 80);
  assert.equal(snapshot().objects[0].width, 200);
});

test("inline Pantalla commit preserves section height", () => {
  const { params, snapshot } = fixture("pantalla");
  makeHandlers(params).onInlineFinish();
  assert.equal(snapshot().sections, params.secciones);
  assert.equal(snapshot().objects[0].texto, params.editing.value);
});

test("linked inline delegates to the panel owner without a second height mutation", () => {
  const { params, snapshot } = fixture();
  const calls = [];
  params.editing.linkedField = { fieldKey: "texto_historia" };
  params.onLinkedInlineValueChange = (change) => calls.push(change);
  params.resolveSectionsAfterTextChange = () => assert.fail("linked inline must use authoring");
  const handlers = makeHandlers(params);
  handlers.onInlineChange("Nuestra historia\nContinúa");
  handlers.onInlineFinish();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].fieldKey, "texto_historia");
  assert.equal(snapshot().objects, params.objetos);
});

test("authoring publishes and persists the same expanded sections under existing history suppression", async () => {
  const start = authoring.indexOf("  const commitSnapshot = useCallback(");
  const end = authoring.indexOf("  const reloadAvailableFields = useCallback(", start);
  assert.ok(start >= 0 && end > start);
  const { params } = fixture();
  const nextObjects = [{ ...params.objetos[0], texto: params.editing.value }];
  const nextSections = params.resolveSectionsAfterTextChange({
    previousObjects: params.objetos, nextObjects, sections: params.secciones,
  });
  const updates = [];
  const latestAuthoringStateRef = { current: { objetos: params.objetos, secciones: params.secciones } };
  const deps = {
    useCallback: (callback) => callback,
    latestAuthoringStateRef,
    hydrateSnapshot: (snapshot) => snapshot,
    setError: () => {}, setSnapshot: () => {}, onSnapshotChange: () => {},
    onReplaceObjects: (objects) => updates.push(["objects", objects]),
    onReplaceSections: (sections) => updates.push(["sections", sections]),
    onReplaceEventDetails: () => {},
    suppressNextHistoryCapture: () => updates.push(["suppress-history"]),
    persistSnapshot: async (_snapshot, options) => updates.push(["persist", options.nextSections]),
  };
  const commit = new Function(...Object.keys(deps),
    `${authoring.slice(start, end)}\nreturn commitSnapshot;`)(...Object.values(deps));
  await commit({ values: { texto_historia: params.editing.value } },
    { nextObjects, nextSections, excludeFromHistory: true });
  assert.deepEqual(updates.map(([kind]) => kind), ["suppress-history", "objects", "sections", "persist"]);
  assert.equal(updates[2][1], nextSections);
  assert.equal(updates[3][1], nextSections);
  assert.equal(latestAuthoringStateRef.current.secciones, nextSections);
  const valueUpdate = authoring.slice(authoring.indexOf("  const updateTemplateFieldValues = useCallback("),
    authoring.indexOf("  const updateTemplateFieldValue = useCallback("));
  assert.match(valueUpdate, /nextSections: resolveSectionsAfterTextChange\?\.\(\{\s*previousObjects: baseObjects,\s*nextObjects,\s*sections: baseSections,/);
});
