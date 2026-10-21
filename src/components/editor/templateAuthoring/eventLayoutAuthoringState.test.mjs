import test from "node:test";
import assert from "node:assert/strict";
import { planEventLayoutAuthoringRenderState, restoreEventMode } from "./eventLayoutAuthoringState.js";

test("authoring publishes and persists the same mode transition including section checkpoints", () => {
  const previousState = {
    objetos: [{ id: "c", tipo: "forma", figura: "rect", width: 100, height: 40, x: 200, y: 40, seccionId: "s", functionalAssociation: "ceremony" }],
    secciones: [{ id: "s", altura: 500, altoModo: "fijo" }],
    eventDetails: { mode: "ceremony_party" },
  };
  const next = planEventLayoutAuthoringRenderState({ previousState, nextEventDetails: { mode: "single", dressCode: { value: "Current", enabled: true } } });
  assert.equal(next.eventDetails.mode, "single");
  assert.equal(next.secciones[0].eventLayout.materializedMode, "single");
  assert.equal(next.eventDetails.dressCode.value, "Current");
  assert.equal(previousState.secciones[0].eventLayout, undefined);
  const contentOnly = planEventLayoutAuthoringRenderState({ previousState: next, nextObjects: next.objetos.map(o => ({ ...o, color: "red" })) });
  assert.equal(contentOnly.objetos[0].x, next.objetos[0].x);
  assert.equal(contentOnly.secciones, next.secciones);
});

test("content-only authoring on legacy documents never initializes a layout", () => {
  const previousState = { objetos: [], secciones: [{ id: "s" }], eventDetails: { mode: "single" } };
  const next = planEventLayoutAuthoringRenderState({ previousState, nextObjects: [{ id: "new", x: 30, y: 80, seccionId: "s" }] });
  assert.equal(next.secciones, previousState.secciones);
  assert.equal(next.secciones[0].eventLayout, undefined);
});

test("history mode restore retains live semantic values and ignores absent legacy mode", () => {
  const current = { mode: "single", dressCode: { enabled: false, value: "Today" } };
  assert.equal(restoreEventMode(current, undefined), current);
  assert.deepEqual(restoreEventMode(current, "ceremony_party"), { ...current, mode: "ceremony_party" });
});

test("authoring deletion prunes inactive and initial coordinates without resurrecting the deleted view", () => {
  const pose = { x: 50, y: 40 };
  const previousState = {
    objetos: [{ id: "removed", seccionId: "s", ...pose }],
    secciones: [{ id: "s", eventLayout: { version: 1, materializedMode: "single",
      positionsByMode: { ceremony_party: { removed: pose } },
      initialPositionsByMode: { single: { removed: pose }, ceremony_party: { removed: pose } },
    } }],
    eventDetails: { mode: "single" },
  };
  const next = planEventLayoutAuthoringRenderState({ previousState, nextObjects: [] });
  assert.deepEqual(next.secciones[0].eventLayout.positionsByMode.ceremony_party, {});
  assert.deepEqual(next.secciones[0].eventLayout.initialPositionsByMode.single, {});
  assert.deepEqual(previousState.secciones[0].eventLayout.positionsByMode.ceremony_party.removed, pose);
});
