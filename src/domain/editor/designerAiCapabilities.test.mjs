import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDesignerAiCallablePayload,
  buildDesignerAiCapabilitySnapshot,
} from "./designerAiCapabilities.js";
import { containsForbiddenSnapshotData, validateDesignerAiActionBatch } from "../../../shared/designerAiCapabilityContract.js";
import ledgerRuntime from "../../../shared/designerAiConversationLedger.js";
import { setEventLocationProviderMetadata } from "../eventDetails/location.js";

const { buildDesignerAiConversationBrief, reconcileDesignerAiConversationState } = ledgerRuntime;

test("a time-only template never asks for or accepts an absent date field", () => {
  const authoringSnapshot = { fieldsSchema: [
    { key: "event_ceremony_start_time", type: "time", eventDetailsRole: "ceremony_start_time", applyTargets: [] },
  ], values: { event_ceremony_start_time: "18:00" }, templateInput: { changedKeys: ["event_ceremony_start_time"] } };
  const initial = buildDesignerAiCapabilitySnapshot({ authoringSnapshot });
  const mode = initial.ledger.leaves.find((leaf) => leaf.id === "event.mode");
  const snapshot = buildDesignerAiCapabilitySnapshot({ authoringSnapshot, conversationState: { resolutions: [
    { leafId: mode.id, status: "resolved_from_user", provenance: "user_current_session", fingerprint: mode.fingerprint, rule: null },
  ] } });
  assert.equal(snapshot.availability.ceremonyDatetime, true);
  assert.equal(snapshot.ledger.leaves.find((leaf) => leaf.id === "event.ceremony.date").status, "unavailable");
  assert.equal(snapshot.ledger.leaves.find((leaf) => leaf.id === "event.ceremony.end_time").status, "unavailable");
  assert.equal(snapshot.ledger.leaves.find((leaf) => leaf.id === "event.ceremony.start_time").status, "resolved_from_existing_user_data");
  assert.equal(buildDesignerAiConversationBrief(snapshot).nextStep.kind, "rsvp_enabled");
  const payload = buildDesignerAiCallablePayload({ snapshot, message: "3 de abril", clientMessageId: "partial-date" });
  const result = validateDesignerAiActionBatch([
    { type: "event.set_datetime", arguments: { phase: "ceremony", date: "2027-04-03", startTime: null, endTime: null } },
  ], { origin: "model", snapshot: payload.capabilitySnapshot });
  assert.equal(result.ok, false);
});

test("datetime bindings support start time while date-only and inactive absent Party fields remain unavailable", () => {
  for (const type of ["date", "datetime"]) {
    const authoringSnapshot = { fieldsSchema: [
      { key: "custom_date", type, eventDetailsRole: "ceremony_date", applyTargets: [] },
    ], values: { custom_date: type === "date" ? "2027-04-03" : "2027-04-03T18:30" } };
    const initial = buildDesignerAiCapabilitySnapshot({ authoringSnapshot });
    const mode = initial.ledger.leaves.find((leaf) => leaf.id === "event.mode");
    const snapshot = buildDesignerAiCapabilitySnapshot({ authoringSnapshot, conversationState: { resolutions: [
      { leafId: mode.id, status: "resolved_from_user", provenance: "user_current_session", fingerprint: mode.fingerprint, rule: null },
    ] } });
    assert.equal(snapshot.ledger.leaves.find((leaf) => leaf.id === "event.ceremony.start_time").status === "unavailable", type === "date");
    assert.equal(snapshot.ledger.leaves.find((leaf) => leaf.id === "event.party.date").status, "unavailable");
  }
});

test("custom role-bound fields use live provenance and restoring template values reopens them", () => {
  const definitions = [
    ["ceremony_date", "date", "event.ceremony.date", "2027-10-09", "2026-12-24"],
    ["ceremony_start_time", "time", "event.ceremony.start_time", "18:30", "19:00"],
    ["ceremony_end_time", "time", "event.ceremony.end_time", "23:30", "23:00"],
    ["ceremony_venue_name", "text", "event.ceremony.venue_name", "Bodega Borgoña", "Salón plantilla"],
    ["ceremony_venue_address", "text", "event.ceremony.address", "Calle 321", "Calle 123"],
    ["party_date", "date", "event.party.date", "2027-10-10", "2026-12-25"],
    ["party_start_time", "time", "event.party.start_time", "21:30", "22:00"],
    ["party_end_time", "time", "event.party.end_time", "04:30", "03:00"],
    ["party_venue_name", "text", "event.party.venue_name", "Club Encuentro", "Club plantilla"],
    ["party_venue_address", "text", "event.party.address", "Ruta 321", "Ruta 123"],
    ["dress_code", "text", "event.dress_code.value", "Cocktail", "Formal"],
  ];
  const fields = definitions.map(([role, type]) => ({ key: `custom_${role}`, eventDetailsRole: role, type, applyTargets: [] }));
  const build = (column, changedKeys, conversationState = {}) => buildDesignerAiCapabilitySnapshot({
    authoringSnapshot: { fieldsSchema: fields, values: Object.fromEntries(definitions.map(([role, , , userValue, templateValue]) =>
      [`custom_${role}`, column === "user" ? userValue : templateValue])), templateInput: { changedKeys } },
    renderSnapshot: { eventDetails: { mode: "ceremony_party" } }, conversationState,
  });
  const current = build("user", fields.map((field) => field.key));
  const state = reconcileDesignerAiConversationState({ snapshot: current });
  const restored = build("template", [], state);
  const staleCanonical = build("user", definitions.map(([role]) => `event_${role}`));
  for (const [, , id] of definitions) {
    assert.equal(current.ledger.leaves.find((leaf) => leaf.id === id).status, "resolved_from_existing_user_data", id);
    assert.equal(restored.ledger.leaves.find((leaf) => leaf.id === id).status, "pending", id);
    assert.equal(staleCanonical.ledger.leaves.find((leaf) => leaf.id === id).status, "pending", id);
  }
});

const customPersonFields = [
  { key: "custom_first", type: "text", eventDetailsRole: "primary_person_name", applyTargets: [{ scope: "objeto", id: "first", path: "texto" }] },
  { key: "custom_second", type: "text", eventDetailsRole: "secondary_person_name", applyTargets: [{ scope: "objeto", id: "second", path: "texto" }] },
];
function customNamesSnapshot({ fields = customPersonFields, values = { custom_first: "Ana", custom_second: "Luz" },
  changedKeys = [], objects = [], conversationState = {} } = {}) {
  return buildDesignerAiCapabilitySnapshot({
    authoringSnapshot: { fieldsSchema: fields, values, templateInput: { changedKeys } },
    renderSnapshot: { objetos: objects }, conversationState,
  });
}
const nameLeaves = snapshot => snapshot.ledger.leaves.filter(leaf => leaf.block === "names");

test("custom semantic name fields stay unconfirmed when template objects hydrate after entry", () => {
  const initial = customNamesSnapshot();
  assert.deepEqual(initial.values.people, { primaryName: "Ana", secondaryName: "Luz" });
  const conversationState = reconcileDesignerAiConversationState({ snapshot: initial, previousState: {} });
  const hydrated = customNamesSnapshot({ conversationState,
    objects: [{ id: "first", tipo: "texto", texto: "Ana" }, { id: "second", tipo: "texto", texto: "Luz" }] });
  assert.equal(buildDesignerAiConversationBrief(hydrated).nextStep.kind, "names");
  assert.ok(nameLeaves(hydrated).every(leaf => leaf.status === "pending" && leaf.provenance === "template_value"));
  assert.equal(hydrated.revision, initial.revision);
});

test("custom field provenance blocks baseline-only confirmation of late template values", () => {
  const initial = customNamesSnapshot({ values: {} });
  const conversationState = reconcileDesignerAiConversationState({ snapshot: initial, previousState: {} });
  const hydrated = customNamesSnapshot({ values: {}, conversationState,
    objects: [{ id: "first", tipo: "texto", texto: "Ana" }, { id: "second", tipo: "texto", texto: "Luz" }] });
  assert.deepEqual(hydrated.values.people, { primaryName: "Ana", secondaryName: "Luz" });
  assert.ok(nameLeaves(hydrated).every(leaf => leaf.status === "pending"));
  assert.equal(buildDesignerAiConversationBrief(hydrated).nextStep.kind, "names");
});

test("custom semantic changed keys confirm only their actual individual values and undo restores pending", () => {
  const baseline = customNamesSnapshot();
  const conversationState = reconcileDesignerAiConversationState({ snapshot: baseline, previousState: {} });
  const partial = customNamesSnapshot({ values: { custom_first: "Sol", custom_second: "Luz" }, changedKeys: ["custom_first"], conversationState });
  assert.deepEqual(nameLeaves(partial).map(leaf => leaf.status), ["resolved_from_existing_user_data", "pending"]);
  assert.deepEqual(buildDesignerAiConversationBrief(partial).nextStep.leafIds, ["event.people.secondary_name"]);
  const confirmed = customNamesSnapshot({ values: { custom_first: "Sol", custom_second: "Mar" }, changedKeys: ["custom_first", "custom_second"], conversationState });
  assert.equal(buildDesignerAiConversationBrief(confirmed).nextStep.kind, "event_structure");
  const restored = customNamesSnapshot({ conversationState });
  assert.ok(nameLeaves(restored).every(leaf => leaf.status === "pending"));
  assert.equal(buildDesignerAiConversationBrief(restored).nextStep.kind, "names");
});

test("custom combined names confirm both only when that field supplies the names", () => {
  const couple = { key: "couple_title", type: "text", eventDetailsRole: "couple_names", applyTargets: [] };
  const confirmed = customNamesSnapshot({ fields: [couple], values: { couple_title: "Ana y Luz" }, changedKeys: ["couple_title"] });
  assert.ok(nameLeaves(confirmed).every(leaf => leaf.status === "resolved_from_existing_user_data"));
  const separate = customNamesSnapshot({ fields: [...customPersonFields, couple],
    values: { custom_first: "Ana", custom_second: "Luz", couple_title: "Sol y Mar" }, changedKeys: ["couple_title"] });
  assert.deepEqual(separate.values.people, { primaryName: "Ana", secondaryName: "Luz" });
  assert.ok(nameLeaves(separate).every(leaf => leaf.status === "pending"));
});

test("obsolete canonical changed keys cannot confirm custom semantic fields", () => {
  const current = customNamesSnapshot({ changedKeys: ["event_primary_person_name", "event_secondary_person_name"] });
  assert.ok(nameLeaves(current).every(leaf => leaf.status === "pending"));
  const input = { fieldsSchema: customPersonFields, values: { custom_first: "Ana", custom_second: "Luz" } };
  const legacy = buildDesignerAiCapabilitySnapshot({ authoringSnapshot: input,
    sourceContext: { templateDerived: true, changedKeys: ["custom_first", "custom_second"] } });
  assert.ok(nameLeaves(legacy).every(leaf => leaf.status === "resolved_from_existing_user_data"));
  const malformed = buildDesignerAiCapabilitySnapshot({ authoringSnapshot: input,
    sourceContext: { templateDerived: true, changedKeys: {} } });
  assert.ok(nameLeaves(malformed).every(leaf => leaf.status === "pending"));
});

test("durable guided completion selects editing without changing ledger, revision or model usage context", () => {
  const build = (guidedFlowCompleted) => buildDesignerAiCapabilitySnapshot({
    documentNameState: { name: "Evento", documentKind: "draft", editable: true },
    conversationState: { usage: { guidedFlowCompleted } },
  });
  const guided = build(undefined);
  const editing = build(true);
  assert.equal(guided.conversation.mode, "guided");
  assert.equal(editing.conversation.mode, "editing");
  assert.deepEqual(editing.ledger, guided.ledger);
  assert.equal(editing.revision, guided.revision);
  assert.deepEqual(editing.conversation.usage, { hasStarted: false });
  assert.equal(buildDesignerAiConversationBrief(editing).nextBlock, null);
});

test("hidden banking data is omitted from callable context without changing local revision or fingerprints", () => {
  const build = (alias, giftListUrl = "https://example.test/a") => buildDesignerAiCapabilitySnapshot({
    renderSnapshot: { objetos: [], gifts: { enabled: true, bank: { alias, cbu: "hidden-cbu-123" }, visibility: { alias: false, cbu: false }, giftListUrl } },
  });
  const original = build("hidden-alias-123");
  const changed = build("hidden-alias-456");
  const linkChanged = build("hidden-alias-123", "https://example.test/b");
  assert.notEqual(original.revision, changed.revision);
  assert.notEqual(original.revision, linkChanged.revision);
  assert.notEqual(original.ledger.leaves.find((l) => l.id === "gifts.method.giftListLink.value").fingerprint, linkChanged.ledger.leaves.find((l) => l.id === "gifts.method.giftListLink.value").fingerprint);
  const before = JSON.stringify(original);
  const payload = buildDesignerAiCallablePayload({ message: "Continuemos", clientMessageId: "privacy", snapshot: original, recentTurns: [{ role: "user", content: "Antes usábamos hidden-alias-123 y hidden-cbu-123" }] });
  assert.equal(JSON.stringify(original), before);
  assert.equal(payload.capabilitySnapshot.revision, original.revision);
  assert.equal(JSON.stringify(payload).includes("hidden-alias-123"), false);
  assert.equal(JSON.stringify(payload).includes("hidden-cbu-123"), false);
  assert.equal(JSON.stringify(payload).includes("contentRevision"), false);
  assert.equal(payload.capabilitySnapshot.values.gifts.methods.alias.configured, true);
});

test("disabled Gifts minimizes even methods whose individual visible flag remains true", () => {
  const snapshot = buildDesignerAiCapabilitySnapshot({ renderSnapshot: { objetos: [], gifts: { enabled: false, bank: { alias: "disabled-alias" }, visibility: { alias: true } } } });
  const payload = buildDesignerAiCallablePayload({ message: "Continuemos", clientMessageId: "privacy-disabled", snapshot });
  assert.equal(JSON.stringify(payload).includes("disabled-alias"), false);
});

const fieldsSchema = [
  { key: "event_primary_person_name", eventDetailsRole: "primary_person_name", type: "text", applyTargets: [] },
  { key: "event_secondary_person_name", eventDetailsRole: "secondary_person_name", type: "text", applyTargets: [] },
  { key: "event_ceremony_date", eventDetailsRole: "ceremony_date", type: "date", applyTargets: [{ scope: "objeto", id: "countdown-1", path: "fechaObjetivo" }] },
  { key: "event_ceremony_start_time", eventDetailsRole: "ceremony_start_time", type: "time", applyTargets: [] },
  { key: "event_ceremony_venue_name", eventDetailsRole: "ceremony_venue_name", type: "text", applyTargets: [] },
  { key: "event_ceremony_venue_address", eventDetailsRole: "ceremony_venue_address", type: "text", applyTargets: [] },
  { key: "texto_historia", type: "textarea", applyTargets: [{ scope: "objeto", id: "story-1", path: "texto" }] },
];

test("Places selection reads canonical provider metadata without requiring a map canvas object", () => {
  const values = setEventLocationProviderMetadata({
    event_ceremony_venue_name: "Salón de prueba",
    event_ceremony_venue_address: "Av. de prueba 123",
  }, "ceremony", { googlePlaceId: "synthetic-place", googleDisplayName: "Salón de prueba", googleFormattedAddress: "Av. de prueba 123" });
  const snapshot = buildDesignerAiCapabilitySnapshot({ authoringSnapshot: { fieldsSchema, values }, renderSnapshot: { objetos: [] } });
  assert.equal(snapshot.values.ceremony.placeSelected, true);
  assert.equal(snapshot.values.ceremony.address, "Av. de prueba 123");
  assert.equal(JSON.stringify(buildDesignerAiCallablePayload({ message: "Continuemos", clientMessageId: "places-provenance", snapshot })).includes("synthetic-place"), false);
});

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
  assert.equal(snapshot.values.story, "Fallback");
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

test("keeps schema-declared data-only fields available and reads the structured value bag", () => {
  const snapshot = buildDesignerAiCapabilitySnapshot({
    documentNameState: { name: "Evento", documentKind: "draft", editable: true },
    authoringSnapshot: {
      fieldsSchema: [
        { key: "texto_historia", type: "textarea", applyTargets: [] },
        {
          key: "event_dress_code",
          type: "text",
          eventDetailsRole: "dress_code",
          applyTargets: [],
        },
      ],
      defaults: {
        texto_historia: "Default de plantilla",
        event_dress_code: "Formal",
      },
      values: {
        texto_historia: "Historia guardada sin vista",
        event_dress_code: "Elegante",
      },
    },
    renderSnapshot: {
      objetos: [],
      eventDetails: {
        mode: "single",
        dressCode: { enabled: true, value: "Mirror viejo" },
      },
    },
  });

  assert.equal(snapshot.availability.story, true);
  assert.equal(snapshot.availability.dressCode, true);
  assert.equal(snapshot.values.story, "Historia guardada sin vista");
  assert.deepEqual(snapshot.values.dressCode, {
    enabled: true,
    value: "Elegante",
  });
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

test("live authoring provenance overrides stale Header changedKeys before first opening", () => {
  const names = ["event_primary_person_name", "event_secondary_person_name"];
  const build = (liveKeys, headerKeys) => buildDesignerAiCapabilitySnapshot({
    documentNameState: { designerAiSourceContext: { templateDerived: true, changedKeys: headerKeys } },
    authoringSnapshot: { fieldsSchema, values: {
      event_primary_person_name: "Ana", event_secondary_person_name: "Luz",
    }, templateInput: { changedKeys: liveKeys } },
  });
  const edited = build(names, []);
  assert.equal(buildDesignerAiConversationBrief(edited).nextBlock.id, "event_structure");
  assert.ok(edited.ledger.leaves.filter((leaf) => leaf.id.startsWith("event.people.")).every((leaf) => leaf.provenance === "existing_user_data"));
  const undone = build([], names);
  assert.equal(buildDesignerAiConversationBrief(undone).nextBlock.id, "names");
  assert.ok(undone.ledger.leaves.filter((leaf) => leaf.id.startsWith("event.people.")).every((leaf) => leaf.provenance === "template_value"));
});

test("manual Dress Code edits use the owner's current canonical field provenance", () => {
  const snapshot = buildDesignerAiCapabilitySnapshot({
    authoringSnapshot: { fieldsSchema: [{ key: "event_dress_code", eventDetailsRole: "dress_code", type: "text", applyTargets: [] }],
      values: { event_dress_code: "Cocktail" }, templateInput: { changedKeys: ["event_dress_code"] } },
    documentNameState: { designerAiSourceContext: { templateDerived: true, changedKeys: [] } },
  });
  const dress = snapshot.ledger.leaves.find((leaf) => leaf.id === "event.dress_code.value");
  assert.equal(dress.status, "resolved_from_existing_user_data");
  assert.equal(dress.provenance, "existing_user_data");
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
    sourceContext: { templateDerived: false, changedKeys: ["event_primary_person_name", "event_secondary_person_name"] },
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
