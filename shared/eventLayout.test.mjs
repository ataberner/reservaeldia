import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const domain = require("./eventLayout.cjs");
const { applyFunctionalAssociationsToRenderState } = require("./functionalAssociations.cjs");
const { initializeEventLayouts, transitionEventLayoutMode, resetEventLayouts, applyEventLayoutObjectMutation, reconcileEventLayoutMembership } = domain;

function fixture(mode = "single") {
  return {
    secciones: [{ id: "event", altura: 500 }, { id: "other", altura: 500 }],
    objetos: [
      { id: "ceremony-a", seccionId: "event", tipo: "texto", texto: "Ceremony", x: 80, y: 40, width: 100, height: 30, functionalAssociation: "ceremony" },
      { id: "ceremony-b", seccionId: "event", tipo: "texto", texto: "Place", x: 70, y: 100, width: 120, height: 30, functionalAssociation: "ceremony" },
      { id: "party", seccionId: "event", tipo: "texto", texto: "Party", x: 560, y: 40, width: 120, height: 30, functionalAssociation: "party" },
      { id: "shared-title", seccionId: "event", tipo: "texto", x: 300, y: 0, width: 200, height: 30 },
      { id: "unrelated", seccionId: "other", tipo: "forma", x: 50, y: 20, width: 100, height: 100 },
    ],
    eventDetails: { mode, dressCode: { enabled: true, value: "Formal" } },
    rsvp: { enabled: false }, gifts: { enabled: false },
  };
}
const obj = (state, id) => state.objetos.find(item => item.id === id);
const section = state => state.secciones.find(item => item.id === "event");
function mutate(state, id, patch, options = {}) {
  return applyEventLayoutObjectMutation({ ...state, previousObjects: state.objetos, nextObjects: state.objetos.map(item => item.id === id ? { ...item, ...patch } : item), ...options });
}

test("initialization freezes both modes from one legacy source and includes shared and hidden roots", () => {
  const source = fixture(); const original = structuredClone(source);
  const initialized = initializeEventLayouts(source);
  assert.deepEqual(source, original);
  assert.equal(obj(initialized, "ceremony-a").x, 350);
  assert.equal(obj(initialized, "ceremony-b").x, 340);
  assert.equal(obj(initialized, "party").x, 560);
  assert.equal(section(initialized).eventLayout.materializedMode, "single");
  assert.equal(section(initialized).eventLayout.positionsByMode.single, undefined);
  assert.equal(section(initialized).eventLayout.positionsByMode.ceremony_party["ceremony-a"].x, 80);
  assert.equal(section(initialized).eventLayout.initialPositionsByMode.single["shared-title"].x, 300);
  assert.equal(section(initialized).eventLayout.initialPositionsByMode.single.party.x, 560);
  assert.equal(initialized.secciones[1].eventLayout, undefined);
  assert.deepEqual(initializeEventLayouts(initialized), initialized);
});

test("first manual move uses prior render offset without moving companions", () => {
  const source = fixture(); const result = mutate(source, "ceremony-a", { x: 120, y: 55 });
  assert.equal(obj(result, "ceremony-a").x, 390);
  assert.equal(obj(result, "ceremony-a").y, 55);
  assert.equal(obj(result, "ceremony-b").x, 340);
  assert.equal(section(result).eventLayout.initialPositionsByMode.single["ceremony-a"].x, 350);
  const rendered = applyFunctionalAssociationsToRenderState({ ...result, materializeOffsets: false });
  assert.deepEqual(rendered.centeredObjectDeltas, {});
  assert.equal(obj(rendered, "ceremony-a").x, 390);
  assert.equal(obj(rendered, "ceremony-a").__eventLayoutManaged, true);
  assert.equal(obj(result, "ceremony-a").__eventLayoutManaged, undefined);
});

test("switches keep active roots authoritative and preserve both independent shared-title positions", () => {
  let state = mutate(fixture(), "shared-title", { x: 250 });
  state = transitionEventLayoutMode({ ...state, nextMode: "ceremony_party" });
  assert.equal(obj(state, "shared-title").x, 300);
  assert.equal(obj(state, "ceremony-a").x, 80);
  state = mutate(state, "shared-title", { x: 440 });
  state = transitionEventLayoutMode({ ...state, nextMode: "single" });
  assert.equal(obj(state, "shared-title").x, 250);
  state = transitionEventLayoutMode({ ...state, nextMode: "ceremony_party" });
  assert.equal(obj(state, "shared-title").x, 440);
  assert.equal(section(state).eventLayout.positionsByMode.ceremony_party, undefined);
  assert.equal(state.eventDetails.dressCode.value, "Formal");
});

test("mode switch initializes legacy without deriving second mode from already centered roots", () => {
  const state = transitionEventLayoutMode({ ...fixture(), nextMode: "ceremony_party" });
  assert.equal(obj(state, "ceremony-a").x, 80);
  assert.equal(section(state).eventLayout.positionsByMode.single["ceremony-a"].x, 350);
  assert.equal(section(state).eventLayout.initialPositionsByMode.ceremony_party["ceremony-a"].x, 80);
});

test("content, size and named automatic mutations do not initialize layout", () => {
  for (const [patch, options] of [[{ texto: "A longer value" }, {}], [{ width: 250 }, {}], [{ x: 100 }, { reason: "legacy-group-align" }], [{ x: 100 }, { reason: "text-center-preservation" }]]) {
    const result = mutate(fixture(), "ceremony-a", patch, options);
    assert.equal(section(result).eventLayout, undefined);
  }
});

test("manual layout does not recenter after shared dimensions and content change", () => {
  let state = initializeEventLayouts(fixture());
  state = mutate(state, "ceremony-a", { width: 300, texto: "Longer" });
  const rendered = applyFunctionalAssociationsToRenderState({ ...state, materializeOffsets: true });
  assert.equal(obj(rendered, "ceremony-a").x, 350);
  assert.equal(obj(rendered, "ceremony-b").x, 340);
  assert.equal(obj(rendered, "ceremony-a").__eventLayoutManaged, undefined);
});

test("reset restores current mode baseline once, preserving the other mode and current content", () => {
  let state = initializeEventLayouts(fixture());
  state = mutate(state, "shared-title", { x: 200 });
  state = transitionEventLayoutMode({ ...state, nextMode: "ceremony_party" });
  state = mutate(state, "shared-title", { x: 500, texto: "Current value", width: 310 });
  state = resetEventLayouts(state);
  assert.equal(obj(state, "shared-title").x, 300);
  assert.equal(obj(state, "shared-title").texto, "Current value");
  assert.equal(obj(state, "shared-title").width, 310);
  state = transitionEventLayoutMode({ ...state, nextMode: "single" });
  assert.equal(obj(state, "shared-title").x, 200);
});

test("render fallback uses inactive checkpoint without modifying roots or applying another centering", () => {
  const state = initializeEventLayouts(fixture()); const original = structuredClone(state);
  const rendered = applyFunctionalAssociationsToRenderState({ ...state, eventDetails: { mode: "ceremony_party" }, materializeOffsets: true });
  assert.equal(obj(rendered, "ceremony-a").x, 80);
  assert.equal(obj(rendered, "party").x, 560);
  assert.deepEqual(rendered.centeredObjectDeltas, {});
  assert.deepEqual(state, original);
});

test("deleted IDs are never resurrected and newly inserted roots keep their present pose", () => {
  let state = initializeEventLayouts(fixture());
  state.objetos = state.objetos.filter(item => item.id !== "party");
  state.objetos.push({ id: "new", seccionId: "event", tipo: "texto", x: 45, y: 77, width: 100 });
  state = transitionEventLayoutMode({ ...state, nextMode: "ceremony_party" });
  assert.equal(obj(state, "party"), undefined);
  assert.equal(obj(state, "new").x, 45);
  state = resetEventLayouts(state);
  assert.equal(obj(state, "new").y, 77);
});

test("section-scoped operations do not initialize unrelated RSVP/Gifts sections", () => {
  const source = fixture();
  source.objetos.push({ id: "rsvp", tipo: "texto", seccionId: "other", x: 40, y: 100, width: 100, functionalAssociation: "rsvp" }, { id: "gift", tipo: "texto", seccionId: "other", x: 500, y: 100, width: 100, functionalAssociation: "gifts" });
  const state = transitionEventLayoutMode({ ...source, nextMode: "ceremony_party" });
  assert.equal(state.secciones[1].eventLayout, undefined);
  assert.equal(obj(state, "rsvp").x, 40);
  assert.equal(initializeEventLayouts({ ...source, sectionIds: [] }).secciones[0].eventLayout, undefined);
});

test("group roots, negative coordinates, numeric zero and pantalla pose survive transitions", () => {
  const source = fixture(); source.secciones[0].altoModo = "pantalla";
  source.objetos[0] = { ...source.objetos[0], tipo: "grupo", x: -80, y: 0, yNorm: 0, children: [{ id: "child", tipo: "texto", x: -10, y: 20, width: 100, height: 30 }] };
  const initial = initializeEventLayouts(source);
  const both = transitionEventLayoutMode({ ...initial, nextMode: "ceremony_party" });
  assert.equal(obj(both, "ceremony-a").x, -80);
  assert.equal(obj(both, "ceremony-a").y, 0);
  assert.equal(obj(both, "ceremony-a").yNorm, 0);
  assert.deepEqual(obj(both, "ceremony-a").children, source.objetos[0].children);
});

test("a section-level event association initializes hidden roots without changing their pose", () => {
  const source = fixture("single");
  source.secciones[1].functionalAssociation = "party";
  const state = initializeEventLayouts(source);
  assert.equal(state.secciones[1].eventLayout.materializedMode, "single");
  assert.equal(state.secciones[1].eventLayout.initialPositionsByMode.single.unrelated.x, 50);
  assert.equal(obj(state, "unrelated").x, 50);
  const rendered = applyFunctionalAssociationsToRenderState({ ...state });
  assert.equal(obj(rendered, "unrelated"), undefined);
});

test("section move retains accepted old-frame displacement and does not alter shared dimensions", () => {
  const source = fixture();
  const state = mutate(source, "ceremony-a", { seccionId: "other", x: 130, y: 70 });
  assert.equal(obj(state, "ceremony-a").x, 400);
  assert.equal(obj(state, "ceremony-a").y, 70);
  assert.equal(obj(state, "ceremony-a").width, 100);
  assert.equal(state.secciones[1].eventLayout.materializedMode, "single");
  assert.equal(obj(state, "unrelated").x, 50);
  const switched = transitionEventLayoutMode({ ...state, nextMode: "ceremony_party" });
  assert.equal(obj(switched, "ceremony-a").x, 400);
  assert.equal(obj(switched, "ceremony-a").seccionId, "other");
});

test("first mutation tolerates legacy missing coordinates without producing NaN in companions", () => {
  const source = fixture();
  delete source.objetos[1].y;
  const state = mutate(source, "ceremony-a", { x: 120 });
  assert.ok(state.objetos.every(object => Number.isFinite(object.x) && Number.isFinite(object.y)));
});

test("reset is section scoped and keeps canonical hidden Party positions independently editable", () => {
  let state = initializeEventLayouts(fixture());
  state = mutate(state, "party", { x: 620 });
  const noReset = resetEventLayouts({ ...state, sectionIds: [] });
  assert.equal(obj(noReset, "party").x, 620);
  state = transitionEventLayoutMode({ ...state, nextMode: "ceremony_party" });
  assert.equal(obj(state, "party").x, 560);
  state = transitionEventLayoutMode({ ...state, nextMode: "single" });
  assert.equal(obj(state, "party").x, 620);
});

test("group then ungroup treats returning roots as new identities for stored positions", () => {
  let state = initializeEventLayouts(fixture());
  const original = structuredClone(state);
  const children = state.objetos.filter(item => item.id.startsWith("ceremony-"));
  const group = { id: "new-group", tipo: "grupo", seccionId: "event", x: 340, y: 40, children };
  state = applyEventLayoutObjectMutation({ ...state, previousObjects: state.objetos,
    nextObjects: [...state.objetos.filter(item => !item.id.startsWith("ceremony-")), group] });
  for (const mode of ["single", "ceremony_party"]) {
    assert.equal(section(state).eventLayout.initialPositionsByMode[mode]["ceremony-a"], undefined);
  }
  assert.equal(section(state).eventLayout.positionsByMode.ceremony_party["ceremony-a"], undefined);
  state = mutate(state, "new-group", { x: 440 });
  state = transitionEventLayoutMode({ ...state, nextMode: "ceremony_party" });
  state = applyEventLayoutObjectMutation({ ...state, previousObjects: state.objetos,
    nextObjects: [...state.objetos.filter(item => item.id !== "new-group"), ...children.map(item => ({ ...item, x: item.x + 100 }))] });
  state = transitionEventLayoutMode({ ...state, nextMode: "single" });
  state = resetEventLayouts(state);
  assert.equal(obj(state, "ceremony-a").x, 450);
  assert.equal(obj(state, "ceremony-b").x, 440);
  assert.equal(original.secciones[0].eventLayout.initialPositionsByMode.single["ceremony-a"].x, 350);
});

test("membership cleanup is immutable, does not initialize legacy and preserves stable section identity", () => {
  const legacy = fixture();
  assert.equal(reconcileEventLayoutMembership({ previousObjects: legacy.objetos, nextObjects: [], secciones: legacy.secciones }), legacy.secciones);
  const state = initializeEventLayouts(legacy); const before = structuredClone(state);
  assert.equal(reconcileEventLayoutMembership({ previousObjects: state.objetos, nextObjects: state.objetos.map(item => ({ ...item, x: item.x + 1 })), secciones: state.secciones }), state.secciones);
  const sections = reconcileEventLayoutMembership({ previousObjects: state.objetos, nextObjects: state.objetos.filter(item => item.id !== "party"), secciones: state.secciones });
  assert.equal(sections[0].eventLayout.positionsByMode.ceremony_party.party, undefined);
  assert.equal(sections[1], state.secciones[1]);
  assert.deepEqual(state, before);
});

test("leaving and returning to a section cannot reactivate an obsolete inactive checkpoint", () => {
  let state = initializeEventLayouts(fixture());
  state = mutate(state, "ceremony-a", { seccionId: "other", x: 470 });
  assert.equal(section(state).eventLayout.positionsByMode.ceremony_party["ceremony-a"], undefined);
  state = mutate(state, "ceremony-a", { seccionId: "event", x: 510 });
  state = transitionEventLayoutMode({ ...state, nextMode: "ceremony_party" });
  assert.equal(obj(state, "ceremony-a").x, 510);
});

test("explicit manual size-only transformation freezes the old presentation before changing shared width", () => {
  const before = fixture();
  const state = mutate(before, "ceremony-a", { width: 300 }, { reason: "manual-transform" });
  const rendered = applyFunctionalAssociationsToRenderState({ ...state, materializeOffsets: true });
  assert.equal(obj(rendered, "ceremony-a").x, 350);
  assert.equal(obj(rendered, "ceremony-b").x, 340);
  assert.equal(obj(state, "ceremony-a").width, 300);
  const both = transitionEventLayoutMode({ ...state, nextMode: "ceremony_party" });
  assert.equal(obj(both, "ceremony-a").x, 80);
  assert.equal(obj(both, "ceremony-a").width, 300);
});

test("manual rotation and other transformed geometry initialize but unchanged geometry does not", () => {
  for (const patch of [{ height: 60 }, { rotation: 45 }, { scaleX: 2 }, { scaleY: 0.5 }, { radius: 30 }, { fontSize: 48 }, { points: [0, 0, 0, 120] }]) {
    const state = mutate(fixture(), "ceremony-a", patch, { reason: "manual-transform" });
    assert.equal(section(state).eventLayout?.materializedMode, "single");
    assert.equal(obj(state, "ceremony-a").x, 350);
  }
  const source = fixture(); source.objetos[0].points = [0, 0, 100, 0];
  const unchanged = mutate(source, "ceremony-a", { width: 100, points: [0, 0, 100, 0] }, { reason: "manual-transform" });
  assert.equal(section(unchanged).eventLayout, undefined);
});

test("existing-only reconciliation materializes a different stored mode even when global mode already matches", () => {
  const initialized = initializeEventLayouts(fixture());
  const mismatched = { ...initialized, eventDetails: { ...initialized.eventDetails, mode: "ceremony_party" },
    objetos: initialized.objetos.map(item => item.id === "ceremony-a" ? { ...item, color: "current-color" } : item) };
  const original = structuredClone(mismatched);
  const state = transitionEventLayoutMode({ ...mismatched, nextMode: "ceremony_party", initializeMissing: false });
  assert.equal(obj(state, "ceremony-a").x, 80);
  assert.equal(obj(state, "ceremony-a").color, "current-color");
  assert.equal(section(state).eventLayout.materializedMode, "ceremony_party");
  assert.equal(section(state).eventLayout.positionsByMode.single["ceremony-a"].x, 350);
  const moved = mutate(state, "ceremony-a", { x: 90 });
  assert.equal(obj(applyFunctionalAssociationsToRenderState(moved), "ceremony-a").x, 90);
  assert.deepEqual(mismatched, original);
});

test("existing-only reconciliation never initializes legacy sections on load or history restore", () => {
  const source = fixture();
  const state = transitionEventLayoutMode({ ...source, nextMode: "ceremony_party", initializeMissing: false });
  assert.equal(state.objetos[0].x, 80);
  assert.equal(state.secciones, source.secciones);
  assert.equal(section(state).eventLayout, undefined);
  assert.equal(state.eventDetails.mode, "ceremony_party");
});
