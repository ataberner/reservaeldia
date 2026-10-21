import test from "node:test";
import assert from "node:assert/strict";
import { reduceEventLayoutEditorState } from "./eventLayoutEditorState.js";

const fixture = () => ({
  objetos: [
    { id: "ceremony", tipo: "forma", figura: "rect", seccionId: "events", x: 240, y: 100, width: 100, height: 60, functionalAssociation: "ceremony" },
    { id: "party", tipo: "forma", figura: "rect", seccionId: "events", x: 550, y: 100, width: 100, height: 60, functionalAssociation: "party" },
  ],
  secciones: [{ id: "events", altura: 500, altoModo: "fijo", orden: 0 }],
  eventDetails: { mode: "ceremony_party", dressCode: { enabled: true, value: "Formal" } },
});

test("hydration preserves uninitialized legacy data without materializing or rewriting positions", () => {
  const input = fixture();
  const loaded = reduceEventLayoutEditorState({ objetos: [], secciones: [], eventDetails: {} }, { type: "replace", value: input });
  assert.equal(loaded.objetos, input.objetos);
  assert.equal(loaded.secciones, input.secciones);
  assert.equal(loaded.secciones[0].eventLayout, undefined);
});

test("mode transitions and active position changes preserve both compositions atomically", () => {
  const original = fixture();
  const single = reduceEventLayoutEditorState(original, { type: "event-details", update: current => ({ ...current, mode: "single" }) });
  const singleX = single.objetos[0].x;
  assert.notEqual(singleX, original.objetos[0].x);
  assert.equal(single.secciones[0].eventLayout.materializedMode, "single");
  const moved = reduceEventLayoutEditorState(single, { type: "objects", update: objects => objects.map(o => o.id === "ceremony" ? { ...o, x: o.x + 75 } : o) });
  const both = reduceEventLayoutEditorState(moved, { type: "event-details", update: current => ({ ...current, mode: "ceremony_party" }) });
  assert.equal(both.objetos[0].x, 240);
  assert.equal(both.objetos[1].x, 550);
  const again = reduceEventLayoutEditorState(both, { type: "event-details", update: current => ({ ...current, mode: "single" }) });
  assert.equal(again.objetos[0].x, singleX + 75);
  assert.equal(again.eventDetails.dressCode.value, "Formal");
});

test("restoring history bypasses initialization and restores only visual mode, keeping current semantic values", () => {
  const original = fixture();
  const single = reduceEventLayoutEditorState(original, { type: "event-details", update: current => ({ ...current, mode: "single" }) });
  single.eventDetails = { ...single.eventDetails, dressCode: { enabled: false, value: "Updated" } };
  const restored = reduceEventLayoutEditorState(single, { type: "restore", value: { objetos: original.objetos, secciones: original.secciones, eventMode: "ceremony_party" } });
  assert.equal(restored.eventDetails.mode, "ceremony_party");
  assert.equal(restored.eventDetails.dressCode.value, "Updated");
  assert.equal(restored.secciones[0].eventLayout, undefined);
  assert.equal(restored.objetos[0].x, 240);
});

test("automatic legacy alignment does not initialize manual compositions", () => {
  const original = fixture();
  const next = reduceEventLayoutEditorState(original, { type: "objects", reason: "legacy-group-align", update: objects => objects.map(o => ({ ...o, x: o.x + 10 })) });
  assert.equal(next.secciones[0].eventLayout, undefined);
});

test("a rejected mutation and same-mode update preserve identity and do not initialize", () => {
  const original = fixture();
  assert.equal(reduceEventLayoutEditorState(original, { type: "objects", update: objects => objects }), original);
  const same = reduceEventLayoutEditorState(original, { type: "event-details", update: config => config });
  assert.equal(same, original);
});

test("history reconciles an initialized protected section to restored mode without initializing untouched sections", () => {
  const original = fixture();
  const single = reduceEventLayoutEditorState(original, { type: "event-details", update: current => ({ ...current, mode: "single" }) });
  const singleX = single.objetos[0].x;
  const both = reduceEventLayoutEditorState(single, { type: "event-details", update: current => ({ ...current, mode: "ceremony_party" }) });
  // Protection retains current section geometry instead of snapshot geometry.
  const protectedSections = [{ ...both.secciones[0], bloqueada: true }, { id: "untouched", functionalAssociation: "ceremony" }];
  const restored = reduceEventLayoutEditorState(both, { type: "restore", value: { objetos: both.objetos, secciones: protectedSections, eventMode: "single" } });
  assert.equal(restored.objetos[0].x, singleX);
  assert.equal(restored.secciones[0].eventLayout.materializedMode, "single");
  assert.equal(restored.secciones[0].bloqueada, true);
  assert.equal(restored.secciones[1].eventLayout, undefined);
});

test("loading an existing layout with a changed mode materializes its checkpoint in memory", () => {
  const both = fixture();
  const initialized = reduceEventLayoutEditorState(both, { type: "event-details", update: config => ({ ...config, mode: "single" }) });
  const loadedInput = { ...initialized, eventDetails: { ...initialized.eventDetails, mode: "ceremony_party" } };
  const loaded = reduceEventLayoutEditorState(both, { type: "replace", value: loadedInput });
  assert.equal(loaded.objetos[0].x, 240);
  assert.equal(loaded.secciones[0].eventLayout.materializedMode, "ceremony_party");
  assert.equal(loadedInput.secciones[0].eventLayout.materializedMode, "single");
});
