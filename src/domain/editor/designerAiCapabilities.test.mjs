import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDesignerAiCallablePayload,
  buildDesignerAiCapabilitySnapshot,
} from "./designerAiCapabilities.js";
import { containsForbiddenSnapshotData } from "../../../shared/designerAiCapabilityContract.js";

const fieldsSchema = [
  { key: "event_primary_person_name", eventDetailsRole: "primary_person_name", type: "text", applyTargets: [] },
  { key: "event_secondary_person_name", eventDetailsRole: "secondary_person_name", type: "text", applyTargets: [] },
  { key: "event_ceremony_date", eventDetailsRole: "ceremony_date", type: "date", applyTargets: [{ scope: "objeto", id: "countdown-1", path: "fechaObjetivo" }] },
  { key: "event_ceremony_start_time", eventDetailsRole: "ceremony_start_time", type: "time", applyTargets: [] },
  { key: "event_ceremony_venue_name", eventDetailsRole: "ceremony_venue_name", type: "text", applyTargets: [] },
  { key: "event_ceremony_venue_address", eventDetailsRole: "ceremony_venue_address", type: "text", applyTargets: [] },
  { key: "texto_historia", type: "textarea", applyTargets: [{ scope: "objeto", id: "story-1", path: "texto" }] },
];

test("builds only the minimal Assistant capability snapshot", () => {
  const snapshot = buildDesignerAiCapabilitySnapshot({
    documentNameState: { name: "Evento", documentKind: "draft", editable: true },
    coverImage: "https://private.example/cover.jpg",
    authoringSnapshot: {
      fieldsSchema,
      defaults: {
        event_primary_person_name: "Ana",
        event_secondary_person_name: "Luz",
        event_ceremony_date: "2027-04-10T21:30:00.000Z",
        event_ceremony_start_time: "18:30",
        event_ceremony_venue_name: "Salon",
        event_ceremony_venue_address: "Calle 123",
        texto_historia: "Fallback",
      },
    },
    renderSnapshot: {
      objetos: [
        { id: "countdown-1", tipo: "countdown", fechaObjetivo: "2027-04-10T21:30:00.000Z", x: 10 },
        { id: "story-1", tipo: "texto", texto: "Nuestra historia", width: 420 },
        { id: "gallery-1", tipo: "galeria", rows: 1, cols: 2, cells: [{ id: "a", mediaUrl: "https://private.example/a.jpg" }, { id: "b" }] },
      ],
      eventDetails: { mode: "single", dressCode: { enabled: false, value: "" } },
      rsvp: { enabled: false },
      gifts: { enabled: false },
    },
  });

  assert.equal(snapshot.values.documentName, "Evento");
  assert.deepEqual(snapshot.values.people, { primaryName: "Ana", secondaryName: "Luz" });
  assert.equal(snapshot.values.story, "Nuestra historia");
  assert.equal(snapshot.values.media.hasCover, true);
  assert.equal(snapshot.values.galleries[0].slots[0].occupied, true);
  assert.equal(containsForbiddenSnapshotData(snapshot), false);
  assert.equal(JSON.stringify(snapshot).includes("private.example"), false);
  assert.equal(JSON.stringify(snapshot).includes('"x"'), false);
  const callablePayload = buildDesignerAiCallablePayload({
    clientMessageId: "message-1",
    message: "Continuemos",
    snapshot,
  });
  assert.equal(callablePayload.capabilitySnapshot.values.media.contentRevision, undefined);
  assert.equal(callablePayload.capabilitySnapshot.values.galleries[0].slots[0].contentRevision, undefined);
  assert.equal(callablePayload.capabilitySnapshot.ledger.leaves.every((leaf) => leaf.fingerprint === ""), true);
});

test("marks template document names and unbound story as unavailable", () => {
  const snapshot = buildDesignerAiCapabilitySnapshot({
    documentNameState: { name: "Template", documentKind: "template", editable: true },
    authoringSnapshot: { fieldsSchema: [], defaults: {} },
    renderSnapshot: { objetos: [] },
  });

  assert.equal(snapshot.availability.documentName, false);
  assert.equal(snapshot.availability.story, false);
  assert.equal(snapshot.availability.cover, false);
});

test("conversation coverage cannot remove unresolved leaves from completeness", () => {
  const current = buildDesignerAiCapabilitySnapshot({
    documentNameState: { name: "", documentKind: "draft", editable: true },
    authoringSnapshot: { fieldsSchema: [], defaults: {} },
    renderSnapshot: { objetos: [] },
  });
  const documentLeaf = current.ledger.leaves.find((leaf) => leaf.id === "document.name");
  assert.equal(documentLeaf.status, "pending");
  assert.equal(current.ledger.completion.complete, false);
  assert.equal(current.ledger.completion.unresolvedLeafIds.includes("document.name"), true);
});

test("does not confuse a template value with existing user personalization", () => {
  const current = buildDesignerAiCapabilitySnapshot({
    documentNameState: {
      name: "Borgoña · Floral contemporánea",
      documentKind: "draft",
      editable: true,
      designerAiSourceContext: { templateDerived: true, changedKeys: [] },
    },
    authoringSnapshot: { fieldsSchema: [], defaults: {} },
    renderSnapshot: { objetos: [] },
  });
  const documentLeaf = current.ledger.leaves.find((leaf) => leaf.id === "document.name");
  assert.equal(documentLeaf.status, "pending");
  assert.equal(documentLeaf.provenance, "placeholder_or_sample");
});
