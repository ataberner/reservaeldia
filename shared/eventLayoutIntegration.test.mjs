import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { initializeEventLayouts, transitionEventLayoutMode } from "./eventLayout.js";
import { buildPersistableRenderState, buildLoadedEditorRenderState } from "../src/components/editor/persistence/borradorSyncRenderState.js";
import { normalizeDraftRenderState } from "../src/domain/drafts/sourceOfTruth.js";
import { prepareDashboardPreviewRenderState } from "../src/domain/dashboard/previewSession.js";
const require = createRequire(import.meta.url);
const backendNormalizer = require("../functions/lib/drafts/sourceOfTruth.js");
const backendRender = require("../functions/shared/functionalAssociations.cjs");
const backendLayout = require("../functions/shared/eventLayout.cjs");
const { generarHTMLDesdeSecciones } = require("../functions/lib/utils/generarHTMLDesdeSecciones.js");

function fixture() {
  return { objetos: [
    { id: "ceremony", tipo: "texto", seccionId: "s", x: 80, y: 40, width: 100, height: 30, texto: "Current value", functionalAssociation: "ceremony" },
    { id: "party", tipo: "texto", seccionId: "s", x: 560, y: 40, width: 100, height: 30, texto: "Party", functionalAssociation: "party" },
  ], secciones: [{ id: "s", orden: 0, altura: 500, altoModo: "fijo", fondo: "#ffffff" }], eventDetails: { mode: "single" } };
}

test("layout and inactive pose survive existing frontend/backend render normalizers and editor reload", () => {
  const initialized = initializeEventLayouts(fixture());
  initialized.objetos[0] = { ...initialized.objetos[0], x: 420 };
  const persisted = buildPersistableRenderState({ ...initialized, ALTURA_PANTALLA_EDITOR: 500, validarPuntosLinea: value => value });
  const client = normalizeDraftRenderState(persisted);
  const backend = backendNormalizer.normalizeDraftRenderState(persisted);
  assert.deepEqual(backend.secciones, client.secciones);
  assert.deepEqual(client.secciones[0].eventLayout, initialized.secciones[0].eventLayout);
  const loaded = buildLoadedEditorRenderState({ ...client, ALTURA_PANTALLA_EDITOR: 500 });
  assert.equal(loaded.objetos[0].x, 420);
  const switched = transitionEventLayoutMode({ ...loaded, eventDetails: client.eventDetails, nextMode: "ceremony_party" });
  assert.equal(switched.objetos[0].x, 80);
  assert.equal(switched.secciones[0].eventLayout.positionsByMode.single.ceremony.x, 420);
});

test("dashboard preview and synchronized Functions resolver use the same manual pose without extra offset", () => {
  const initialized = initializeEventLayouts(fixture());
  initialized.objetos[0] = { ...initialized.objetos[0], x: 430 };
  const original = structuredClone(initialized);
  const preview = prepareDashboardPreviewRenderState(initialized).renderState;
  const publish = backendRender.applyFunctionalAssociationsToRenderState(initialized);
  assert.equal(preview.objetos[0].x, 430);
  assert.equal(publish.objetos[0].x, 430);
  assert.equal(preview.objetos[0].__eventLayoutManaged, undefined);
  assert.deepEqual(initialized, original);
  assert.deepEqual(backendLayout.transitionEventLayoutMode({ ...initialized, nextMode: "ceremony_party" }), transitionEventLayoutMode({ ...initialized, nextMode: "ceremony_party" }));
});

test("untouched legacy normalization and preview do not write eventLayout metadata", () => {
  const source = fixture(); const original = structuredClone(source);
  const normalized = normalizeDraftRenderState(source);
  const preview = prepareDashboardPreviewRenderState(source).renderState;
  assert.equal(normalized.secciones[0].eventLayout, undefined);
  assert.equal(preview.secciones[0].eventLayout, undefined);
  assert.equal(preview.objetos[0].x, 350);
  assert.deepEqual(source, original);
});

test("existing HTML generator preserves resolved manual text positions and mobile layout policy", () => {
  const state = initializeEventLayouts(fixture());
  state.objetos[0] = { ...state.objetos[0], x: 430, __groupId: "old-text-group", __groupAlign: "center", __groupOriginX: 70 };
  const original = structuredClone(state);
  for (const mode of ["single", "ceremony_party"]) {
    for (const mobileLayoutMode of ["auto", "preserve"]) {
      const source = { ...state, eventDetails: { ...state.eventDetails, mode },
        secciones: state.secciones.map(section => ({ ...section, mobileLayoutMode })) };
      const preview = prepareDashboardPreviewRenderState(source).renderState;
      const publish = backendRender.applyFunctionalAssociationsToRenderState(source);
      const expectedX = mode === "single" ? 430 : 80;
      for (const prepared of [preview, publish]) {
        const html = generarHTMLDesdeSecciones(prepared.secciones, prepared.objetos, null, { isPreview: true, musicResource: null });
        const tag = html.match(/<div\b[^>]*data-obj-id="ceremony"[^>]*>/)?.[0];
        assert.ok(tag, "text root must reach the actual HTML generator");
        assert.match(tag, new RegExp(`left: calc\\([^;]* \\* ${expectedX}px\\)`));
        assert.equal(html.includes('data-obj-id="party"'), mode === "ceremony_party");
        assert.equal(html.includes('data-mobile-layout-mode="preserve"'), mobileLayoutMode === "preserve");
        assert.equal(html.includes("__eventLayoutManaged"), false);
      }
    }
  }
  assert.deepEqual(state, original);
});
