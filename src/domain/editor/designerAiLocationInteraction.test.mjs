import test from "node:test";
import assert from "node:assert/strict";
import { buildDesignerAiLedger, buildDesignerAiNextStep } from "../../../shared/designerAiConversationLedger.js";

import {
  buildDesignerAiGooglePlaceControlState,
  buildDesignerAiLocationSearchQuery,
  buildDesignerAiManualLocationReply,
  buildDesignerAiManualLocationResolution,
  isDesignerAiGooglePlaceControlReflected,
  getDesignerAiGooglePlaceVerifiedLeafIds,
  isDesignerAiGooglePlaceSelectionReflected,
  resolveDesignerAiLocationDecisions,
} from "./designerAiLocationInteraction.js";

function snapshot(overrides = {}) {
  return {
    conversation: { mode: "editing" },
    availability: { ceremonyLocation: true, partyLocation: true },
    values: {
      eventMode: "single",
      ceremony: { venueName: "Salón Los Robles", address: "Av. Ejemplo 1234", placeSelected: false },
      party: { venueName: "Fiesta", address: "Ruta 8 km 40", placeSelected: false },
      ...overrides.values,
    },
    ledger: {
      leaves: [
        { id: "event.ceremony.place_selection", fingerprint: "ceremony-before" },
        { id: "event.party.place_selection", fingerprint: "party-before" },
      ],
    },
    ...overrides,
  };
}

function guidedSnapshot({ pending = ["event.ceremony.address", "event.ceremony.place_selection"], eventMode = "single" } = {}) {
  const availability = { people: true, eventMode: true, ceremonyDatetime: true, ceremonyLocation: true,
    partyDatetime: true, partyLocation: true };
  const location = { date: "2027-10-06", startTime: "18:00", endTime: "", venueName: "Salón Los Robles", address: "Calle 123", placeSelected: false };
  const values = { documentName: "", people: { primaryName: "Ana", secondaryName: "Luz" }, eventMode,
    ceremony: { ...location }, party: { ...location, venueName: "Estancia", address: "Ruta 8 km 40" },
    dressCode: { enabled: false, value: "" }, story: "", media: { hasCover: false, contentRevision: "" }, galleries: [],
    rsvp: { enabled: false, questions: [], modal: { title: "", subtitle: "", submitLabel: "", primaryColor: "" } },
    gifts: { enabled: false, methods: {}, introText: "", buttonText: "" } };
  const sourceContext = { templateDerived: true, changedKeys: [] };
  const initial = buildDesignerAiLedger({ availability, values, sourceContext });
  const confirmedIds = ["event.people.primary_name", "event.people.secondary_name", "event.mode",
    ...["ceremony", "party"].flatMap(phase => ["date", "start_time", "venue_name", "address"].map(field => `event.${phase}.${field}`))];
  const resolutions = initial.leaves.filter(leaf => confirmedIds.includes(leaf.id) && !pending.includes(leaf.id))
    .map(leaf => ({ leafId: leaf.id, fingerprint: leaf.fingerprint, status: "resolved_from_user", provenance: "user_current_session", rule: null }));
  return { availability, values, conversation: { mode: "guided" },
    ledger: buildDesignerAiLedger({ availability, values, sourceContext, conversationState: { resolutions } }) };
}

test("guided passive Maps offers cannot bypass pending names, dates or the venue", () => {
  for (const leafId of ["event.people.primary_name", "event.ceremony.date", "event.ceremony.start_time", "event.ceremony.venue_name"]) {
    const current = guidedSnapshot({ pending: [leafId, "event.ceremony.address", "event.ceremony.place_selection"] });
    assert.deepEqual(resolveDesignerAiLocationDecisions({
      actions: [{ type: "event.set_location_text", arguments: { phase: "ceremony", venueName: "Salón Los Robles" } }],
      resolutions: [{ leafId: "event.ceremony.place_selection", status: "needs_clarification" }],
    }, current), [], leafId);
  }
});

test("guided entry and reentry derive Maps buttons from the current step without model output", () => {
  const current = guidedSnapshot();
  assert.equal(buildDesignerAiNextStep(current).kind, "location_method");
  for (const result of [undefined, {}, { actions: [], resolutions: [], controlRequest: null }]) {
    const decisions = resolveDesignerAiLocationDecisions(result, current);
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].phase, "ceremony");
    assert.equal(decisions[0].query, "Salón Los Robles");
    assert.equal(decisions[0].address, "", "unconfirmed template address is not suggested or preloaded");
  }
});

test("guided Maps offers follow only the current phase and accept a confirmed address preload", () => {
  const current = guidedSnapshot({ pending: ["event.party.place_selection"], eventMode: "ceremony_party" });
  const ceremonyLeaf = current.ledger.leaves.find(leaf => leaf.id === "event.ceremony.place_selection");
  Object.assign(ceremonyLeaf, { status: "resolved_by_rule", rule: "leave_empty" });
  assert.deepEqual(buildDesignerAiNextStep(current), {
    blockId: "event_data", kind: "place_selection", phase: "party", leafIds: ["event.party.place_selection"],
  });
  const decisions = resolveDesignerAiLocationDecisions({ resolutions: [
    { leafId: "event.ceremony.place_selection", status: "needs_clarification" },
  ] }, current);
  assert.deepEqual(decisions.map(decision => [decision.phase, decision.query]), [["party", "Estancia, Ruta 8 km 40"]]);
});

test("a guided manual decision removes passive offers and explicit Maps controls are not duplicated", () => {
  const current = guidedSnapshot();
  assert.deepEqual(resolveDesignerAiLocationDecisions({ controlRequest: { type: "google_place_picker", phase: "ceremony" } }, current), []);
  Object.assign(current.ledger.leaves.find(leaf => leaf.id === "event.ceremony.place_selection"), { status: "resolved_by_rule", rule: "leave_empty" });
  assert.equal(buildDesignerAiNextStep(current).kind, "address");
  assert.deepEqual(resolveDesignerAiLocationDecisions({ actions: [{ type: "event.set_location_text", arguments: { phase: "ceremony" } }] }, current), []);
});

test("a guided Maps search never preloads deferred or unconfirmed template text", () => {
  const current = guidedSnapshot({ pending: ["event.ceremony.venue_name", "event.ceremony.address", "event.ceremony.place_selection"] });
  for (const leaf of current.ledger.leaves.filter(leaf => ["event.ceremony.venue_name", "event.ceremony.address"].includes(leaf.id))) {
    leaf.status = "deferred_by_user";
  }
  assert.equal(buildDesignerAiNextStep(current).kind, "place_selection");
  const [decision] = resolveDesignerAiLocationDecisions({}, current);
  assert.deepEqual([decision.query, decision.venueName, decision.address], ["", "", ""]);
});

test("manual venue and address produce a preloaded single-event Maps decision", () => {
  const decisions = resolveDesignerAiLocationDecisions({
    actions: [{ type: "event.set_location_text", arguments: { phase: "ceremony", venueName: "Salón Los Robles", address: "Av. Ejemplo 1234" } }],
    resolutions: [{ leafId: "event.ceremony.place_selection", status: "needs_clarification", rule: null }],
    controlRequest: null,
  }, snapshot());

  assert.deepEqual(decisions, [{
    phase: "ceremony",
    eventMode: "single",
    label: "evento",
    query: "Salón Los Robles, Av. Ejemplo 1234",
    venueName: "Salón Los Robles",
    address: "Av. Ejemplo 1234",
    cancelled: false,
  }]);
});

test("only a venue can offer Maps but remains distinct from a completed manual address", () => {
  const decisions = resolveDesignerAiLocationDecisions({
    actions: [{ type: "event.set_location_text", arguments: { phase: "ceremony", venueName: "Salón Los Robles", address: "" } }],
    resolutions: [],
    controlRequest: null,
  }, snapshot({ values: {
    eventMode: "single",
    ceremony: { venueName: "Salón Los Robles", address: "", placeSelected: false },
  } }));
  assert.equal(decisions[0].query, "Salón Los Robles");
  assert.equal(decisions[0].address, "");
});

test("ceremony and party decisions keep their exact targets in double-event mode", () => {
  const decisions = resolveDesignerAiLocationDecisions({
    actions: [
      { type: "event.set_location_text", arguments: { phase: "ceremony", venueName: "Ceremonia", address: "Calle 1" } },
      { type: "event.set_location_text", arguments: { phase: "party", venueName: "Fiesta", address: "Calle 2" } },
    ],
    resolutions: [],
    controlRequest: null,
  }, snapshot({ values: {
    eventMode: "ceremony_party",
    ceremony: { venueName: "Ceremonia", address: "Calle 1", placeSelected: false },
    party: { venueName: "Fiesta", address: "Calle 2", placeSelected: false },
  } }));
  assert.deepEqual(decisions.map((decision) => [decision.phase, decision.label]), [
    ["ceremony", "ceremonia"],
    ["party", "fiesta"],
  ]);
});

test("explicit Maps control or manual rejection removes the pending decision", () => {
  const accepted = resolveDesignerAiLocationDecisions({
    actions: [],
    resolutions: [],
    controlRequest: { type: "google_place_picker", phase: "ceremony" },
  }, snapshot());
  assert.deepEqual(accepted, []);

  const rejected = resolveDesignerAiLocationDecisions({
    actions: [{ type: "event.set_location_text", arguments: { phase: "ceremony", venueName: "Salón", address: "Dirección" } }],
    resolutions: [{ leafId: "event.ceremony.place_selection", status: "resolved_by_rule", rule: "leave_empty" }],
    controlRequest: null,
  }, snapshot());
  assert.deepEqual(rejected, []);
});

test("a persisted manual decision prevents another offer when the venue name is completed", () => {
  const current = snapshot();
  Object.assign(current.ledger.leaves[0], { status: "resolved_by_rule", rule: "leave_empty" });
  for (const resolutions of [[], [{ leafId: "event.ceremony.place_selection", status: "needs_clarification", rule: null }]]) {
    assert.deepEqual(resolveDesignerAiLocationDecisions({
      actions: [{ type: "event.set_location_text", arguments: { phase: "ceremony", venueName: "Mi casa", address: "Av. Ejemplo 1234" } }],
      resolutions,
      controlRequest: null,
    }, current), []);
  }
});

for (const manualPhase of ["ceremony", "party"]) {
  test(`the saved ${manualPhase} decision does not hide the other phase's pending offer`, () => {
    const current = snapshot();
    current.values.eventMode = "ceremony_party";
    for (const leaf of current.ledger.leaves) {
      Object.assign(leaf, leaf.id === `event.${manualPhase}.place_selection`
        ? { status: "resolved_by_rule", rule: "leave_empty" }
        : { status: "requires_control", rule: null });
    }
    const decisions = resolveDesignerAiLocationDecisions({
      actions: ["ceremony", "party"].map(phase => ({ type: "event.set_location_text", arguments: { phase, venueName: "Lugar", address: "Calle 123" } })),
      resolutions: [],
      controlRequest: null,
    }, current);
    assert.deepEqual(decisions.map(decision => decision.phase), [manualPhase === "ceremony" ? "party" : "ceremony"]);
  });
}

test("control state preserves preload and baseline while manual reply stays phase-specific", () => {
  const decision = {
    phase: "party",
    eventMode: "ceremony_party",
    label: "fiesta",
    query: "Fiesta, Ruta 8 km 40",
  };
  const control = buildDesignerAiGooglePlaceControlState(decision, snapshot());
  assert.deepEqual(control, {
    request: { type: "google_place_picker", phase: "party" },
    leafIds: ["event.party.place_selection"],
    baselineFingerprints: { "event.party.place_selection": "party-before" },
    initialQuery: "Fiesta, Ruta 8 km 40",
    eventMode: "ceremony_party",
  });
  assert.match(buildDesignerAiManualLocationReply(decision), /dirección de fiesta/);
  assert.doesNotMatch(buildDesignerAiManualLocationReply(decision), /dirección que ya te pasé/);
  assert.deepEqual(buildDesignerAiManualLocationResolution(decision), {
    leafId: "event.party.place_selection",
    status: "resolved_by_rule",
    rule: "leave_empty",
  });
  assert.equal(buildDesignerAiLocationSearchQuery({ venueName: "Lugar", address: "Dirección" }), "Lugar, Dirección");
});

test("Google selection evidence requires the exact persisted provider result", () => {
  const expected = {
    googlePlaceId: "place-123",
    venueName: "Salón Los Robles",
    address: "Av. Ejemplo 1234",
  };

  assert.equal(isDesignerAiGooglePlaceSelectionReflected(expected, expected), true);
  assert.equal(isDesignerAiGooglePlaceSelectionReflected({
    ...expected,
    googlePlaceId: "place-other",
  }, expected), false);
  assert.equal(isDesignerAiGooglePlaceSelectionReflected({
    ...expected,
    address: "Otra dirección",
  }, expected), false);
  assert.equal(isDesignerAiGooglePlaceSelectionReflected({
    venueName: expected.venueName,
    address: expected.address,
  }, expected), false);
});

test("verified place completion is scoped to supplied, nonempty, available location leaves", () => {
  const expected = { googlePlaceId: "synthetic-place", googleDisplayName: "Lugar", googleFormattedAddress: "Calle 123", venueName: "Lugar", address: "Calle 123" };
  const current = { values: { ceremony: { venueName: "Lugar", address: "Calle 123", placeSelected: true } },
    ledger: { leaves: ["venue_name", "address", "place_selection"].map(field => ({ id: `event.ceremony.${field}`, status: "pending" })) } };
  const input = { snapshot: current, phase: "ceremony", expectedLocation: expected, persistedLocation: expected };
  assert.deepEqual(getDesignerAiGooglePlaceVerifiedLeafIds(input), ["event.ceremony.place_selection", "event.ceremony.venue_name", "event.ceremony.address"]);
  assert.deepEqual(getDesignerAiGooglePlaceVerifiedLeafIds({ ...input, phase: "party" }), []);
  assert.deepEqual(getDesignerAiGooglePlaceVerifiedLeafIds({ ...input, persistedLocation: { ...expected, googlePlaceId: "other" } }), []);
  assert.deepEqual(getDesignerAiGooglePlaceVerifiedLeafIds({ ...input, persistedLocation: { ...expected, address: "Other street" } }), []);
  assert.deepEqual(getDesignerAiGooglePlaceVerifiedLeafIds({ ...input, expectedLocation: { ...expected, googleDisplayName: "", googleFormattedAddress: "" } }), ["event.ceremony.place_selection"], "fallback text is not supplied by Google");
  current.ledger.leaves.find(leaf => leaf.id.endsWith("address")).status = "unavailable";
  assert.deepEqual(getDesignerAiGooglePlaceVerifiedLeafIds(input), ["event.ceremony.place_selection", "event.ceremony.venue_name"]);
  current.ledger.leaves.forEach(leaf => { leaf.status = "not_applicable_by_dependency"; });
  assert.deepEqual(getDesignerAiGooglePlaceVerifiedLeafIds(input), []);
});

test("Google control evidence requires the same phase in the reread capability snapshot", () => {
  const expectedParty = {
    googlePlaceId: "party-place-123",
    venueName: "Estancia La Fiesta",
    address: "Ruta 8 km 40",
  };
  const partyPersisted = { ...expectedParty };
  const ceremonyPending = {
    venueName: "",
    address: "",
    placeSelected: false,
  };
  const partySelected = {
    venueName: expectedParty.venueName,
    address: expectedParty.address,
    placeSelected: true,
  };

  assert.equal(isDesignerAiGooglePlaceControlReflected({
    snapshot: snapshot({ values: {
      eventMode: "ceremony_party",
      ceremony: ceremonyPending,
      party: partySelected,
    } }),
    persistedLocation: partyPersisted,
    phase: "party",
    expectedLocation: expectedParty,
  }), true);

  assert.equal(isDesignerAiGooglePlaceControlReflected({
    snapshot: snapshot({ values: {
      eventMode: "ceremony_party",
      ceremony: { ...partySelected },
      party: { ...partySelected, placeSelected: false },
    } }),
    persistedLocation: partyPersisted,
    phase: "party",
    expectedLocation: expectedParty,
  }), false, "la evidencia de Ceremony no puede completar Party");

  assert.equal(isDesignerAiGooglePlaceControlReflected({
    snapshot: snapshot({ values: {
      eventMode: "ceremony_party",
      ceremony: ceremonyPending,
      party: partySelected,
    } }),
    persistedLocation: {
      ...partyPersisted,
      googlePlaceId: "otro-place-id",
    },
    phase: "party",
    expectedLocation: expectedParty,
  }), false, "el snapshot no reemplaza la verificación exacta del owner");
});
