import test from "node:test";
import assert from "node:assert/strict";
import { syncEditorSnapshotRenderState } from "../../lib/editorSnapshotAdapter.js";
import { executeDesignerAiActionBatch } from "./designerAiActionExecutor.js";
import { sanitizeCapabilitySnapshot } from "../../../shared/designerAiCapabilityContract.js";

class TestCustomEvent extends Event {
  constructor(type, options = {}) {
    super(type);
    this.detail = options.detail;
  }
}

function createRuntime() {
  const target = new EventTarget();
  target.CustomEvent = TestCustomEvent;
  target.Event = Event;
  const calls = [];
  const authoring = {
    fieldsSchema: [
      { key: "event_primary_person_name", eventDetailsRole: "primary_person_name", type: "text", applyTargets: [] },
      { key: "event_secondary_person_name", eventDetailsRole: "secondary_person_name", type: "text", applyTargets: [] },
      { key: "texto_historia", type: "textarea", applyTargets: [{ scope: "objeto", id: "story", path: "texto" }] },
    ],
    defaults: {},
  };
  target.canvasEditor = {
    getTemplateAuthoringSnapshot: () => authoring,
    updateTemplateAuthoringEventPersonNames: async (value) => calls.push(["people", value]),
    updateTemplateAuthoringDefault: async (...args) => calls.push(["default", ...args]),
  };
  syncEditorSnapshotRenderState({
    objetos: [{ id: "story", tipo: "texto", texto: "Anterior" }],
    secciones: [],
    rsvp: { enabled: false },
    gifts: { enabled: false },
    eventDetails: { mode: "single" },
  }, target);
  return { target, calls };
}

function snapshot() {
  return sanitizeCapabilitySnapshot({
    revision: "rev-1",
    availability: {
      documentName: true,
      people: true,
      eventMode: true,
      ceremonyDatetime: false,
      partyDatetime: false,
      ceremonyLocation: false,
      partyLocation: false,
      dressCode: false,
      story: true,
      cover: false,
      gallery: false,
      rsvp: true,
      gifts: true,
    },
    values: {
      rsvp: { questions: [] },
      gifts: { enabled: false },
    },
  });
}

test("applies shared document, people and story owners without generic setters", async () => {
  const { target, calls } = createRuntime();
  const documentUpdates = [];
  target.addEventListener("dashboard-document-name-update-request", (event) => documentUpdates.push(event.detail));

  const result = await executeDesignerAiActionBatch([
    { type: "document.set_name", arguments: { name: "Boda de Ana y Luz" } },
    { type: "event.set_people", arguments: { primaryName: "Ana", secondaryName: "Luz" } },
    { type: "story.set_text", arguments: { text: "Nos conocimos en otoño." } },
  ], { snapshot: snapshot(), targetWindow: target });

  assert.deepEqual(result.appliedActions, ["document.set_name", "event.set_people", "story.set_text"]);
  assert.deepEqual(documentUpdates, [{
    hasName: true,
    name: "Boda de Ana y Luz",
    persist: true,
    source: "designer-ai",
    designerAiConversation: null,
  }]);
  assert.deepEqual(calls[0], ["people", { primaryName: "Ana", secondaryName: "Luz" }]);
  assert.deepEqual(calls[1], ["default", "texto_historia", "Nos conocimos en otoño.", { applyTargets: true }]);
  assert.equal("setObjetos" in target.canvasEditor, false);
});

test("prevalidation is atomic and rejects an out-of-allowlist action before dispatch", async () => {
  const { target, calls } = createRuntime();
  let events = 0;
  target.addEventListener("dashboard-document-name-update-request", () => events += 1);

  await assert.rejects(
    executeDesignerAiActionBatch([
      { type: "document.set_name", arguments: { name: "Nombre válido" } },
      { type: "canvas.update_object", arguments: { id: "x", x: 40 } },
    ], { snapshot: snapshot(), targetWindow: target }),
    (error) => error.code === "designer-ai/prevalidation-failed"
  );
  assert.equal(events, 0);
  assert.deepEqual(calls, []);
});

test("stale draft identity cancels the batch before the first mutation", async () => {
  const { target, calls } = createRuntime();
  await assert.rejects(
    executeDesignerAiActionBatch([
      { type: "story.set_text", arguments: { text: "No aplicar" } },
    ], {
      snapshot: snapshot(),
      targetWindow: target,
      isSessionCurrent: () => false,
    }),
    (error) => error.code === "designer-ai/stale-session"
  );
  assert.deepEqual(calls, []);
});

test("event datetime uses authoring owners and keeps the linked countdown aligned", async () => {
  const target = new EventTarget();
  target.CustomEvent = TestCustomEvent;
  target.Event = Event;
  const calls = [];
  const updates = [];
  const authoring = {
    fieldsSchema: [
      { key: "event_ceremony_date", eventDetailsRole: "ceremony_date", type: "date", applyTargets: [{ scope: "objeto", id: "countdown", path: "fechaObjetivo" }] },
      { key: "event_ceremony_start_time", eventDetailsRole: "ceremony_start_time", type: "time", applyTargets: [] },
      { key: "event_ceremony_end_time", eventDetailsRole: "ceremony_end_time", type: "time", applyTargets: [] },
    ],
    defaults: {},
  };
  target.canvasEditor = {
    getTemplateAuthoringSnapshot: () => authoring,
    updateTemplateAuthoringEventTimes: async (...args) => calls.push(["times", ...args]),
    updateTemplateAuthoringDefault: async (...args) => calls.push(["default", ...args]),
  };
  target.addEventListener("actualizar-elemento", (event) => updates.push(event.detail));
  syncEditorSnapshotRenderState({
    objetos: [{ id: "countdown", tipo: "countdown", fechaObjetivo: "" }],
    secciones: [],
    eventDetails: { mode: "single" },
  }, target);
  const current = sanitizeCapabilitySnapshot({
    revision: "date-rev",
    availability: { ceremonyDatetime: true },
    values: { eventMode: "single", ceremony: { date: "", startTime: "", endTime: "" } },
  });

  await executeDesignerAiActionBatch([
    { type: "event.set_datetime", arguments: { phase: "ceremony", date: "2027-04-10", startTime: "18:30", endTime: "23:45" } },
  ], { snapshot: current, targetWindow: target });

  assert.deepEqual(calls[0], ["times", { startTime: "18:30", endTime: "23:45" }, { feature: "ceremony" }]);
  assert.equal(calls[1][0], "default");
  assert.equal(calls[1][1], "event_ceremony_date");
  assert.match(calls[1][2], /^2027-04-10T/);
  assert.deepEqual(updates[0].id, "countdown");
  assert.equal(updates[0].cambios.fechaObjetivo, calls[1][2]);
});

test("Gallery, RSVP and Gifts delegate to existing mutation/config/CTA events", async () => {
  const target = new EventTarget();
  target.CustomEvent = TestCustomEvent;
  target.Event = Event;
  target.canvasEditor = { getTemplateAuthoringSnapshot: () => ({ fieldsSchema: [], defaults: {} }) };
  const events = [];
  for (const name of ["actualizar-elemento", "insertar-elemento", "rsvp-config-update", "gift-config-update"]) {
    target.addEventListener(name, (event) => events.push([name, event.detail]));
  }
  syncEditorSnapshotRenderState({
    objetos: [{
      id: "gallery",
      tipo: "galeria",
      rows: 1,
      cols: 2,
      cells: [{ id: "a", mediaUrl: "https://not-sent.example/a" }, { id: "b" }],
    }],
    secciones: [],
    rsvp: { enabled: false },
    gifts: { enabled: false },
  }, target);
  const current = sanitizeCapabilitySnapshot({
    revision: "config-rev",
    availability: { gallery: true, rsvp: true, gifts: true },
    values: {
      galleries: [{ id: "gallery", slots: [{ cellId: "a", index: 0, occupied: true }, { cellId: "b", index: 1, occupied: false }] }],
      rsvp: { enabled: false, questions: [] },
      gifts: { enabled: false, buttonText: "" },
    },
  });

  await executeDesignerAiActionBatch([
    { type: "gallery.move_photo", arguments: { galleryId: "gallery", sourceCellId: "a", sourceIndex: 0, targetCellId: "b", targetIndex: 1 } },
    { type: "rsvp.set_enabled", arguments: { enabled: true } },
    { type: "gifts.set_enabled", arguments: { enabled: true } },
    { type: "gifts.set_button_text", arguments: { text: "Ver nuestra lista" } },
  ], { snapshot: current, targetWindow: target });

  assert.equal(events.some(([name, detail]) => name === "actualizar-elemento" && detail.id === "gallery"), true);
  assert.equal(events.some(([name, detail]) => name === "rsvp-config-update" && detail.config.enabled), true);
  assert.equal(events.some(([name, detail]) => name === "gift-config-update" && detail.config.enabled), true);
  assert.equal(events.some(([name, detail]) => name === "insertar-elemento" && detail.tipo === "rsvp-boton"), true);
  assert.equal(events.some(([name, detail]) => name === "insertar-elemento" && detail.tipo === "regalo-boton" && detail.texto === "Ver nuestra lista"), true);
});

test("reports config actions already reflected when a later owner fails", async () => {
  const { target } = createRuntime();
  const dispatched = [];
  target.dispatchEvent = (event) => {
    dispatched.push(event.type);
    if (event.type === "gift-config-update") throw new Error("gift runtime failed");
    return true;
  };
  const current = sanitizeCapabilitySnapshot({
    revision: "partial-config-rev",
    availability: { rsvp: true, gifts: true },
    values: {
      rsvp: { enabled: false, questions: [] },
      gifts: { enabled: false, buttonText: "" },
    },
  });

  await assert.rejects(
    executeDesignerAiActionBatch([
      { type: "rsvp.set_enabled", arguments: { enabled: true } },
      { type: "gifts.set_enabled", arguments: { enabled: true } },
    ], { snapshot: current, targetWindow: target }),
    (error) => {
      assert.deepEqual(error.appliedActions, ["rsvp.set_enabled"]);
      return true;
    }
  );
  assert.deepEqual(dispatched.slice(0, 3), [
    "rsvp-config-update",
    "insertar-elemento",
    "gift-config-update",
  ]);
});
