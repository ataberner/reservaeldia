import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDesignerAiCallablePayload,
  buildDesignerAiCapabilitySnapshot,
} from "./designerAiCapabilities.js";
import { containsForbiddenSnapshotData } from "../../../shared/designerAiCapabilityContract.js";
import ledgerRuntime from "../../../shared/designerAiConversationLedger.js";

const { buildDesignerAiConversationBrief } = ledgerRuntime;

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
  const galleryCompletionLeaf = snapshot.ledger.leaves.find(
    (leaf) => leaf.id === "media.gallery.gallery-1.guided_completion"
  );
  const gallerySlotLeaf = snapshot.ledger.leaves.find(
    (leaf) => leaf.id === "media.gallery.gallery-1.slot.a"
  );
  assert.equal(galleryCompletionLeaf.status, "requires_control");
  assert.equal(snapshot.ledger.guidedFlow.leafIds.includes(galleryCompletionLeaf.id), true);
  assert.equal(gallerySlotLeaf.block, "outside_guided_flow");
  assert.equal(snapshot.ledger.guidedFlow.leafIds.includes(gallerySlotLeaf.id), false);
  assert.equal(containsForbiddenSnapshotData(snapshot), false);
  assert.equal(JSON.stringify(snapshot).includes("private.example"), false);
  assert.equal(JSON.stringify(snapshot).includes('"x"'), false);
  const callablePayload = buildDesignerAiCallablePayload({
    clientMessageId: "message-1",
    entryMode: "first_entry",
    message: "Continuemos",
    snapshot,
  });
  assert.equal(callablePayload.entryMode, "first_entry");
  assert.equal(callablePayload.capabilitySnapshot.values.media.contentRevision, undefined);
  assert.equal(callablePayload.capabilitySnapshot.values.galleries[0].slots[0].contentRevision, undefined);
  assert.equal(callablePayload.capabilitySnapshot.ledger.leaves.every((leaf) => leaf.fingerprint === ""), true);
});

test("durable usage metadata reaches the request without changing draft staleness revision", () => {
  const input = {
    documentNameState: { name: "Evento", documentKind: "draft", editable: true },
    authoringSnapshot: { fieldsSchema: [], defaults: {} },
    renderSnapshot: { objetos: [] },
  };
  const firstEntry = buildDesignerAiCapabilitySnapshot({
    ...input,
    conversationState: { usage: { hasStarted: false } },
  });
  const reentry = buildDesignerAiCapabilitySnapshot({
    ...input,
    conversationState: { usage: { hasStarted: true } },
  });
  assert.equal(firstEntry.conversation.usage.hasStarted, false);
  assert.equal(reentry.conversation.usage.hasStarted, true);
  assert.equal(firstEntry.revision, reentry.revision);
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

test("a Party Google map never supplies Ceremony location in ceremony_party", () => {
  const doubleEventFields = [
    ...fieldsSchema,
    { key: "event_party_date", eventDetailsRole: "party_date", type: "date", applyTargets: [] },
    { key: "event_party_start_time", eventDetailsRole: "party_start_time", type: "time", applyTargets: [] },
    { key: "event_party_venue_name", eventDetailsRole: "party_venue_name", type: "text", applyTargets: [] },
    { key: "event_party_venue_address", eventDetailsRole: "party_venue_address", type: "location", applyTargets: [] },
  ];
  const input = {
    documentNameState: { name: "Casamiento Ana y Luz", documentKind: "draft", editable: true },
    authoringSnapshot: {
      fieldsSchema: doubleEventFields,
      defaults: {
        event_primary_person_name: "Ana",
        event_secondary_person_name: "Luz",
        event_ceremony_date: "2027-04-10T18:00:00.000Z",
        event_ceremony_start_time: "18:00",
        event_ceremony_venue_name: "",
        event_ceremony_venue_address: "",
        event_party_date: "2027-04-10T21:00:00.000Z",
        event_party_start_time: "21:00",
        event_party_venue_name: "Estancia La Fiesta",
        event_party_venue_address: "Ruta 8 km 40",
      },
    },
    renderSnapshot: {
      objetos: [{
        id: "party-map",
        tipo: "mapa-google",
        eventDetailsFeature: "party",
        googlePlaceId: "party-place-123",
        googleDisplayName: "Estancia La Fiesta",
        googleFormattedAddress: "Ruta 8 km 40",
        mostrarMapa: false,
      }],
      eventDetails: { mode: "ceremony_party", dressCode: { enabled: false, value: "" } },
      rsvp: { enabled: false },
      gifts: { enabled: false },
    },
    sourceContext: { templateDerived: false, changedKeys: [] },
  };
  const initial = buildDesignerAiCapabilitySnapshot(input);
  const modeLeaf = initial.ledger.leaves.find((leaf) => leaf.id === "event.mode");
  const snapshot = buildDesignerAiCapabilitySnapshot({
    ...input,
    conversationState: {
      resolutions: [{
        leafId: modeLeaf.id,
        status: "resolved_from_user",
        provenance: "user_current_session",
        rule: null,
        fingerprint: modeLeaf.fingerprint,
      }],
    },
  });
  const brief = buildDesignerAiConversationBrief(snapshot);

  assert.deepEqual(snapshot.values.ceremony, {
    date: "2027-04-10",
    startTime: "18:00",
    endTime: "",
    venueName: "",
    address: "",
    placeSelected: false,
  });
  assert.equal(snapshot.values.party.placeSelected, true);
  assert.equal(snapshot.values.party.venueName, "Estancia La Fiesta");
  assert.equal(brief.nextBlock.id, "event_data");
  assert.ok(brief.nextBlock.leafIds.includes("event.ceremony.address"));
  assert.equal(brief.nextBlock.leafIds.includes("event.party.place_selection"), false);
});
