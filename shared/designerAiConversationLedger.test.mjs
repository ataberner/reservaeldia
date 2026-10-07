import test from "node:test";
import assert from "node:assert/strict";
import ledgerRuntime from "./designerAiConversationLedger.js";
import { projectDesignerAiValues } from "./designerAiActionProjection.cjs";

const {
  DESIGNER_AI_LEDGER_STATUSES,
  DESIGNER_AI_GIFT_REQUEST_LEAF_IDS,
  DESIGNER_AI_RESOLUTION_RULES,
  buildAutomaticEventName,
  buildDesignerAiGalleryCompletionLeafId,
  buildDesignerAiConversationBrief,
  buildDesignerAiNextStep,
  buildDesignerAiLedger,
  captureDesignerAiActionEvidence,
  isTerminalDesignerAiLedgerStatus,
  mapDesignerAiActionToLeafIds,
  normalizeDesignerAiConversationState,
  prepareDesignerAiConversationEntry,
  reconcileDesignerAiConversationState,
} = ledgerRuntime;

const giftRequest = (leafId) => ({ leafId, status: "needs_clarification", rule: null });
const enableGifts = { type: "gifts.set_enabled", arguments: { enabled: true } };
const giftMethod = (method, value, visible = true) => ({ type: "gifts.set_method", arguments: { method, value, visible } });

function giftRequestSnapshot(values, state = {}, availability = null, documentIdentity = "draft:gift-choice") {
  const input = fixture();
  const allowed = availability || Object.fromEntries(Object.keys(input.availability)
    .map((key) => [key, ["gifts", "cover"].includes(key)]));
  const currentValues = values || { ...input.values, galleries: [] };
  return { values: currentValues, availability: allowed, documentIdentity,
    ledger: buildDesignerAiLedger({ values: currentValues, availability: allowed,
      conversationState: state, sourceContext: { templateDerived: true, changedKeys: [] } }),
    conversation: { mode: "guided", namePolicy: { mode: "unknown", lastAutomaticName: "" } } };
}

function giftRequestTurn(before, previousState, actions, requests = [], options = {}) {
  const applied = giftRequestSnapshot(projectDesignerAiValues(before, actions), previousState, before.availability, before.documentIdentity);
  const receipts = actions.map((action) => ({ action, executed: true, effective: true, persisted: true,
    evidence: captureDesignerAiActionEvidence(action, applied) }));
  const state = reconcileDesignerAiConversationState({ snapshot: applied, previousState,
    previousSnapshot: Object.hasOwn(options, "previousSnapshot") ? options.previousSnapshot : before,
    actionResults: options.receipts ? options.receipts(receipts) : receipts,
    resolutions: options.resolutions || requests.map(giftRequest) });
  return { state, applied, snapshot: giftRequestSnapshot(applied.values, state, before.availability, before.documentIdentity) };
}

const giftStep = (snapshot) => buildDesignerAiConversationBrief(snapshot).nextStep?.kind;

test("gift family requests are available but outside guided flow until activation and an explicit choice persist", () => {
  const initial = giftRequestSnapshot();
  for (const id of DESIGNER_AI_GIFT_REQUEST_LEAF_IDS) {
    assert.equal(initial.ledger.leaves.find((leaf) => leaf.id === id).status, "not_applicable_by_dependency");
    assert.equal(initial.ledger.guidedFlow.leafIds.includes(id), false);
  }
  assert.equal(giftStep(initial), "gifts_choice");
  const active = giftRequestTurn(initial, {}, [enableGifts]);
  assert.equal(giftStep(active.snapshot), "gifts_choice", "activation is not a choice between banking and list");
  const unavailable = giftRequestSnapshot(initial.values, {}, { ...initial.availability, gifts: false });
  for (const id of DESIGNER_AI_GIFT_REQUEST_LEAF_IDS) {
    assert.equal(unavailable.ledger.leaves.find((leaf) => leaf.id === id).status, "unavailable");
  }
});

test("choosing only banking survives reload without exposing sample fields and one confirmed alias satisfies it", () => {
  const initial = giftRequestSnapshot();
  const chosen = giftRequestTurn(initial, {}, [enableGifts], ["gifts.bank_details"]);
  assert.equal(giftStep(chosen.snapshot), "gift_bank_details");
  assert.equal(chosen.snapshot.values.gifts.methods.alias.value, initial.values.gifts.methods.alias.value);
  assert.ok(Object.values(chosen.snapshot.values.gifts.methods).every((method) => method.visible === false));
  const restored = giftRequestSnapshot(chosen.snapshot.values, JSON.parse(JSON.stringify(chosen.state)));
  assert.equal(giftStep(restored), "gift_bank_details");
  const supplied = giftRequestTurn(restored, chosen.state, [giftMethod("alias", "SYNTHETIC.ALIAS")]);
  assert.equal(giftStep(supplied.snapshot), "cover");
  assert.equal(supplied.snapshot.ledger.leaves.find((leaf) => leaf.id === "gifts.bank_details").rule, "gift_request_fulfilled");
  assert.equal(supplied.snapshot.values.gifts.methods.cbu.visible, false);
});

test("a selected external list asks only for its URL without setting a visibility flag or inventing a URL", () => {
  const chosen = giftRequestTurn(giftRequestSnapshot(), {}, [enableGifts], ["gifts.external_list"]);
  assert.equal(giftStep(chosen.snapshot), "gift_external_list");
  assert.equal(chosen.snapshot.values.gifts.methods.giftListLink.visible, false);
  assert.equal(chosen.snapshot.values.gifts.methods.giftListLink.configured, false);
  const supplied = giftRequestTurn(chosen.snapshot, chosen.state, [giftMethod("giftListLink", "https://example.test/list")]);
  assert.equal(giftStep(supplied.snapshot), "cover");
});

test("both selected families require both, banking first, including reload between their values", () => {
  const chosen = giftRequestTurn(giftRequestSnapshot(), {}, [enableGifts], DESIGNER_AI_GIFT_REQUEST_LEAF_IDS);
  assert.equal(giftStep(chosen.snapshot), "gift_bank_details");
  const bank = giftRequestTurn(chosen.snapshot, chosen.state, [giftMethod("alias", "SYNTHETIC.ALIAS")]);
  assert.equal(giftStep(bank.snapshot), "gift_external_list");
  const restored = giftRequestSnapshot(bank.snapshot.values, JSON.parse(JSON.stringify(bank.state)));
  assert.equal(giftStep(restored), "gift_external_list");
  const list = giftRequestTurn(restored, bank.state, [giftMethod("giftListLink", "https://example.test/list")]);
  assert.equal(giftStep(list.snapshot), "cover");
});

test("a new explicit family set replaces the old choice; unrelated turns keep the current choice", () => {
  let turn = giftRequestTurn(giftRequestSnapshot(), {}, [enableGifts], ["gifts.bank_details"]);
  for (const id of ["gifts.external_list", "gifts.bank_details"]) {
    turn = giftRequestTurn(turn.snapshot, turn.state, [enableGifts], [id]);
    assert.deepEqual(turn.state.resolutions.filter((item) => DESIGNER_AI_GIFT_REQUEST_LEAF_IDS.includes(item.leafId))
      .map((item) => item.leafId), [id]);
  }
  const unchanged = reconcileDesignerAiConversationState({ snapshot: turn.snapshot, previousState: turn.state });
  assert.equal(giftStep(giftRequestSnapshot(turn.snapshot.values, unchanged)), "gift_bank_details");
});

test("family choice and data in the same persisted batch satisfy the family immediately", () => {
  const result = giftRequestTurn(giftRequestSnapshot(), {}, [enableGifts, giftMethod("alias", "SYNTHETIC.ALIAS")], ["gifts.bank_details"]);
  assert.equal(giftStep(result.snapshot), "cover");
});

test("default visibility, hidden banking data and template provenance cannot satisfy a chosen family", () => {
  const initial = giftRequestSnapshot();
  initial.values.gifts.methods.alias.visible = true;
  const chosen = giftRequestTurn(giftRequestSnapshot(initial.values), {}, [enableGifts], ["gifts.bank_details"]);
  assert.equal(giftStep(chosen.snapshot), "gift_bank_details");
  const hidden = giftRequestTurn(chosen.snapshot, chosen.state, [giftMethod("alias", "SYNTHETIC.HIDDEN", false)]);
  assert.equal(giftStep(hidden.snapshot), "gift_bank_details");
  const untrusted = structuredClone(chosen.state);
  untrusted.resolutions.find((item) => item.leafId === "gifts.bank_details").provenance = "template_value";
  assert.equal(giftStep(giftRequestSnapshot(chosen.snapshot.values, untrusted)), "gifts_choice");
});

for (const failure of ["proposal", "not_effective", "not_persisted", "wrong_document", "partial"]) {
  test(`a gift family choice cannot be credited from ${failure}`, () => {
    const actions = [enableGifts, ...(failure === "partial" ? [giftMethod("alias", "SYNTHETIC.ALIAS")] : [])];
    const result = giftRequestTurn(giftRequestSnapshot(), {}, actions, ["gifts.bank_details"], { receipts: (receipts) => {
      if (failure === "proposal") return [];
      if (failure === "not_effective") receipts[0].effective = false;
      if (failure === "not_persisted") receipts[0].persisted = false;
      if (failure === "wrong_document") receipts[0].evidence.documentIdentity = "draft:other";
      if (failure === "partial") Object.assign(receipts[1], { executed: false, effective: false, persisted: false, error: "failed" });
      return receipts;
    } });
    assert.equal(result.state.resolutions.some((item) => item.leafId === "gifts.bank_details"), false);
    assert.notEqual(giftStep(result.snapshot), "gift_bank_details");
  });
}

test("a failed gift write cannot refresh a prior choice, but its verified retry uses the original pre-action snapshot", () => {
  const chosen = giftRequestTurn(giftRequestSnapshot(), {}, [enableGifts], DESIGNER_AI_GIFT_REQUEST_LEAF_IDS);
  const action = giftMethod("alias", "SYNTHETIC.ALIAS");
  const failed = giftRequestTurn(chosen.snapshot, chosen.state, [action], [], {
    receipts: (receipts) => receipts.map((receipt) => ({ ...receipt, persisted: false, error: "failed" })),
  });
  assert.equal(failed.state.resolutions.find((item) => item.leafId === "gifts.external_list").fingerprint,
    chosen.state.resolutions.find((item) => item.leafId === "gifts.external_list").fingerprint);
  const retried = giftRequestTurn(failed.snapshot, failed.state, [action], [], { previousSnapshot: chosen.snapshot });
  assert.equal(giftStep(retried.snapshot), "gift_external_list");
});

test("missing context, another document or intervening manual edits cannot refresh a gift request", () => {
  const chosen = giftRequestTurn(giftRequestSnapshot(), {}, [enableGifts], DESIGNER_AI_GIFT_REQUEST_LEAF_IDS);
  for (const previousSnapshot of [undefined, { ...chosen.snapshot, documentIdentity: "draft:other" }]) {
    const result = giftRequestTurn(chosen.snapshot, chosen.state, [giftMethod("alias", "SYNTHETIC.ALIAS")], [], { previousSnapshot });
    assert.equal(result.snapshot.ledger.guidedFlow.leafIds.includes("gifts.external_list"), false);
  }
  const manualValues = structuredClone(chosen.snapshot.values);
  manualValues.gifts.methods.cbu.value = "SYNTHETIC.MANUAL";
  const manual = giftRequestSnapshot(manualValues, chosen.state);
  assert.equal(manual.ledger.guidedFlow.leafIds.includes("gifts.bank_details"), false);
  const later = giftRequestTurn(manual, chosen.state, [giftMethod("alias", "SYNTHETIC.ALIAS")]);
  assert.equal(later.snapshot.ledger.guidedFlow.leafIds.includes("gifts.external_list"), false);
});

test("gift request renewal uses the local leaf fingerprint before private URL minimization", () => {
  const initial = giftRequestSnapshot();
  initial.values.gifts.methods.giftListLink = {
    value: "https://example.test/hidden-list", configured: true, contentRevision: "synthetic-url-revision", visible: false,
  };
  const chosen = giftRequestTurn(giftRequestSnapshot(initial.values), {}, [enableGifts], DESIGNER_AI_GIFT_REQUEST_LEAF_IDS);
  const minimizedPreviousSnapshot = structuredClone(chosen.snapshot);
  minimizedPreviousSnapshot.values.gifts.methods.giftListLink.value = "";
  const supplied = giftRequestTurn(chosen.snapshot, chosen.state, [giftMethod("alias", "SYNTHETIC.ALIAS")], [], {
    previousSnapshot: minimizedPreviousSnapshot,
  });
  assert.equal(giftStep(supplied.snapshot), "gift_external_list");
});

test("successive writes to one gift field renew both requests using the final verified receipt", () => {
  const chosen = giftRequestTurn(giftRequestSnapshot(), {}, [enableGifts], DESIGNER_AI_GIFT_REQUEST_LEAF_IDS);
  const first = giftMethod("alias", "SYNTHETIC.FIRST");
  const last = giftMethod("alias", "SYNTHETIC.FINAL");
  const intermediate = giftRequestSnapshot(projectDesignerAiValues(chosen.snapshot, [first]), chosen.state);
  const result = giftRequestTurn(chosen.snapshot, chosen.state, [first, last], [], {
    receipts: (receipts) => {
      receipts[0].evidence = captureDesignerAiActionEvidence(first, intermediate);
      return receipts;
    },
  });
  assert.equal(giftStep(result.snapshot), "gift_external_list");
  assert.equal(result.snapshot.values.gifts.methods.alias.value, "SYNTHETIC.FINAL");
});

test("verified deactivation clears both family requests and explicit field questions keep priority", () => {
  const chosen = giftRequestTurn(giftRequestSnapshot(), {}, [enableGifts], DESIGNER_AI_GIFT_REQUEST_LEAF_IDS);
  const specific = giftRequestTurn(chosen.snapshot, chosen.state, [giftMethod("alias", "", true)]);
  assert.equal(giftStep(specific.snapshot), "gift_method_values");
  assert.deepEqual(buildDesignerAiConversationBrief(specific.snapshot).nextStep.leafIds, ["gifts.method.alias.value"]);
  const disabled = giftRequestTurn(chosen.snapshot, chosen.state, [{ type: "gifts.set_enabled", arguments: { enabled: false } }]);
  assert.equal(disabled.state.resolutions.some((item) => DESIGNER_AI_GIFT_REQUEST_LEAF_IDS.includes(item.leafId)), false);
  assert.equal(giftStep(disabled.snapshot), "cover");
});

const deferGiftRequest = (leafId) => ({ leafId, status: "deferred_by_user", rule: null });

for (const [leafId, method, value] of [
  ["gifts.bank_details", "alias", "SYNTHETIC.ALIAS"],
  ["gifts.external_list", "giftListLink", "https://example.test/list"],
]) {
  test(`deferring ${leafId} preserves the selected family across reentry without repeating the choice`, () => {
    const chosen = giftRequestTurn(giftRequestSnapshot(), {}, [enableGifts], [leafId]);
    const deferred = giftRequestTurn(chosen.snapshot, chosen.state, [], [], {
      resolutions: [deferGiftRequest(leafId)],
    });
    const restored = giftRequestSnapshot(deferred.snapshot.values, JSON.parse(JSON.stringify(deferred.state)));
    assert.equal(giftStep(restored), "cover");
    assert.ok(restored.ledger.guidedFlow.leafIds.includes(leafId));
    assert.ok(!restored.ledger.guidedFlow.leafIds.includes("gifts.enabled"));
    assert.equal(restored.ledger.leaves.find((leaf) => leaf.id === "gifts.enabled").status, "needs_clarification");
    assert.equal(restored.ledger.leaves.find((leaf) => leaf.id === leafId).status, "deferred_by_user");
    assert.deepEqual(buildDesignerAiConversationBrief(restored).deferredLeafIds, [leafId]);
    assert.deepEqual(restored.values.gifts, chosen.snapshot.values.gifts);
    const supplied = giftRequestTurn(restored, deferred.state, [giftMethod(method, value)]);
    assert.equal(supplied.snapshot.ledger.leaves.find((leaf) => leaf.id === leafId).rule, "gift_request_fulfilled");
    assert.equal(giftStep(supplied.snapshot), "cover");
    const resumed = giftRequestTurn(restored, deferred.state, [enableGifts], [leafId]);
    assert.equal(resumed.snapshot.ledger.leaves.find((leaf) => leaf.id === leafId).status, "needs_clarification");
    assert.equal(giftStep(resumed.snapshot), leafId === "gifts.bank_details" ? "gift_bank_details" : "gift_external_list");
  });
}

test("deferring both gift families leaves both unresolved and removes only their guided blocking", () => {
  const initial = giftRequestSnapshot();
  initial.availability.cover = false;
  const chosen = giftRequestTurn(initial, {}, [enableGifts], DESIGNER_AI_GIFT_REQUEST_LEAF_IDS);
  const deferred = giftRequestTurn(chosen.snapshot, chosen.state, [], [], {
    resolutions: DESIGNER_AI_GIFT_REQUEST_LEAF_IDS.map(deferGiftRequest),
  });
  assert.equal(giftStep(deferred.snapshot), undefined);
  assert.equal(deferred.snapshot.ledger.guidedFlow.completion.complete, true);
  assert.deepEqual(buildDesignerAiConversationBrief(deferred.snapshot).deferredLeafIds, DESIGNER_AI_GIFT_REQUEST_LEAF_IDS);
  for (const leafId of DESIGNER_AI_GIFT_REQUEST_LEAF_IDS) {
    assert.equal(deferred.snapshot.ledger.leaves.find((leaf) => leaf.id === leafId).status, "deferred_by_user");
  }
  const restored = giftRequestSnapshot(deferred.snapshot.values, deferred.state, initial.availability);
  assert.equal(buildDesignerAiConversationBrief(restored).nextStep, null);
});

test("a combination can defer just the list after banking is complete and enabled is already terminal", () => {
  const chosen = giftRequestTurn(giftRequestSnapshot(), {}, [enableGifts], DESIGNER_AI_GIFT_REQUEST_LEAF_IDS);
  const bank = giftRequestTurn(chosen.snapshot, chosen.state, [giftMethod("alias", "SYNTHETIC.ALIAS")]);
  assert.ok(isTerminalDesignerAiLedgerStatus(bank.snapshot.ledger.leaves.find((leaf) => leaf.id === "gifts.enabled").status));
  const deferred = giftRequestTurn(bank.snapshot, bank.state, [], [], {
    resolutions: [deferGiftRequest("gifts.external_list")],
  });
  assert.equal(giftStep(deferred.snapshot), "cover");
  assert.deepEqual(buildDesignerAiConversationBrief(deferred.snapshot).deferredLeafIds, ["gifts.external_list"]);
  assert.equal(deferred.snapshot.values.gifts.methods.alias.value, "SYNTHETIC.ALIAS");
});

test("a verified other-family write can be combined with deferring the still-pending gift family", () => {
  const chosen = giftRequestTurn(giftRequestSnapshot(), {}, [enableGifts], DESIGNER_AI_GIFT_REQUEST_LEAF_IDS);
  const result = giftRequestTurn(chosen.snapshot, chosen.state, [giftMethod("alias", "SYNTHETIC.ALIAS")], [], {
    resolutions: [deferGiftRequest("gifts.external_list")],
  });
  assert.equal(giftStep(result.snapshot), "cover");
  assert.deepEqual(buildDesignerAiConversationBrief(result.snapshot).deferredLeafIds, ["gifts.external_list"]);
  const failed = giftRequestTurn(chosen.snapshot, chosen.state, [giftMethod("alias", "SYNTHETIC.ALIAS")], [], {
    resolutions: [deferGiftRequest("gifts.external_list")],
    receipts: (receipts) => receipts.map((receipt) => ({ ...receipt, persisted: false, error: "failed" })),
  });
  assert.equal(failed.state.resolutions.find((item) => item.leafId === "gifts.external_list").status, "needs_clarification");
});

test("deferrals cannot select an unchosen family or renew an incompatible manual edit", () => {
  const initial = giftRequestSnapshot();
  const unchosen = giftRequestTurn(initial, {}, [], [], {
    resolutions: [deferGiftRequest("gifts.bank_details")],
  });
  assert.equal(unchosen.state.resolutions.some((entry) => entry.leafId === "gifts.bank_details"), false);
  assert.equal(giftStep(unchosen.snapshot), "gifts_choice");
  const chosen = giftRequestTurn(initial, {}, [enableGifts], ["gifts.bank_details"]);
  const manualValues = structuredClone(chosen.snapshot.values);
  manualValues.gifts.methods.alias.value = "SYNTHETIC.MANUAL";
  const manual = giftRequestSnapshot(manualValues, chosen.state);
  const deferred = giftRequestTurn(manual, chosen.state, [], [], {
    resolutions: [deferGiftRequest("gifts.bank_details")],
  });
  assert.equal(deferred.state.resolutions.find((entry) => entry.leafId === "gifts.bank_details").status, "needs_clarification");
  assert.equal(deferred.snapshot.ledger.guidedFlow.leafIds.includes("gifts.bank_details"), false);
});

test("an explicit initial gift choice may defer its data only with verified activation", () => {
  const initial = giftRequestSnapshot();
  const choice = [deferGiftRequest("gifts.bank_details")];
  const chosen = giftRequestTurn(initial, {}, [enableGifts], [], { resolutions: choice });
  assert.equal(giftStep(chosen.snapshot), "cover");
  assert.deepEqual(buildDesignerAiConversationBrief(chosen.snapshot).deferredLeafIds, ["gifts.bank_details"]);
  assert.deepEqual(chosen.snapshot.values.gifts.methods, initial.values.gifts.methods);
  const restored = giftRequestSnapshot(chosen.snapshot.values, chosen.state);
  assert.equal(restored.ledger.leaves.find((leaf) => leaf.id === "gifts.bank_details").status, "deferred_by_user");
  for (const receipts of [() => [], (results) => results.map((result) => ({ ...result, persisted: false }))]) {
    const failed = giftRequestTurn(initial, {}, [enableGifts], [], { resolutions: choice, receipts });
    assert.equal(failed.state.resolutions.some((entry) => entry.leafId === "gifts.bank_details"), false);
  }
});

test("a new combination may request banking now and the external list later in the same turn", () => {
  const choices = [giftRequest("gifts.bank_details"), deferGiftRequest("gifts.external_list")];
  const chosen = giftRequestTurn(giftRequestSnapshot(), {}, [enableGifts], [], { resolutions: choices });
  assert.equal(giftStep(chosen.snapshot), "gift_bank_details");
  assert.deepEqual(buildDesignerAiConversationBrief(chosen.snapshot).deferredLeafIds, ["gifts.external_list"]);
  const bank = giftRequestTurn(chosen.snapshot, chosen.state, [giftMethod("alias", "SYNTHETIC.ALIAS")]);
  assert.equal(giftStep(bank.snapshot), "cover");
  assert.deepEqual(buildDesignerAiConversationBrief(bank.snapshot).deferredLeafIds, ["gifts.external_list"]);
  const withData = giftRequestTurn(giftRequestSnapshot(), {}, [enableGifts, giftMethod("alias", "SYNTHETIC.ALIAS")], [], {
    resolutions: choices,
  });
  assert.equal(giftStep(withData.snapshot), "cover");
  assert.deepEqual(buildDesignerAiConversationBrief(withData.snapshot).deferredLeafIds, ["gifts.external_list"]);
});

test("verified activation plus deferred choices replaces the complete previous set", () => {
  const chosen = giftRequestTurn(giftRequestSnapshot(), {}, [enableGifts], DESIGNER_AI_GIFT_REQUEST_LEAF_IDS);
  const changed = giftRequestTurn(chosen.snapshot, chosen.state, [enableGifts], [], {
    resolutions: [deferGiftRequest("gifts.bank_details")],
  });
  assert.deepEqual(changed.state.resolutions.filter((entry) => DESIGNER_AI_GIFT_REQUEST_LEAF_IDS.includes(entry.leafId))
    .map((entry) => [entry.leafId, entry.status]), [["gifts.bank_details", "deferred_by_user"]]);
  assert.equal(giftStep(changed.snapshot), "cover");
  const failed = giftRequestTurn(chosen.snapshot, chosen.state, [enableGifts], [], {
    resolutions: [deferGiftRequest("gifts.bank_details")],
    receipts: (receipts) => receipts.map((receipt) => ({ ...receipt, persisted: false, error: "failed" })),
  });
  assert.deepEqual(failed.state.resolutions.filter((entry) => DESIGNER_AI_GIFT_REQUEST_LEAF_IDS.includes(entry.leafId))
    .map((entry) => [entry.leafId, entry.status]), DESIGNER_AI_GIFT_REQUEST_LEAF_IDS.map((id) => [id, "needs_clarification"]));
});

function fixture(overrides = {}) {
  const availability = {
    documentName: true,
    people: true,
    eventMode: true,
    ceremonyDatetime: true,
    partyDatetime: true,
    ceremonyLocation: true,
    partyLocation: true,
    dressCode: true,
    story: true,
    cover: true,
    gallery: true,
    rsvp: true,
    gifts: true,
    ...overrides.availability,
  };
  const values = {
    documentName: "Borgoña · Floral contemporánea",
    people: { primaryName: "Ana", secondaryName: "Luz" },
    eventMode: "ceremony_party",
    ceremony: { date: "2027-11-14", startTime: "18:00", endTime: "", venueName: "Parroquia", address: "Diego Palma 215", placeSelected: false },
    party: { date: "2027-11-14", startTime: "21:00", endTime: "", venueName: "Estancia", address: "Ruta 8 km 47", placeSelected: false },
    dressCode: { enabled: false, value: "Elegante sport" },
    story: "Texto de ejemplo",
    media: { hasCover: true, contentRevision: "cover-a" },
    galleries: [{ id: "gallery-1", slots: [
      { cellId: "a", index: 0, occupied: true, contentRevision: "photo-a" },
      { cellId: "b", index: 1, occupied: false, contentRevision: "empty" },
    ] }],
    rsvp: {
      enabled: false,
      questions: [
        { id: "full_name", active: true, label: "Nombre y apellido", type: "short_text", required: true, options: [] },
        { id: "attendance", active: true, label: "¿Asistís?", type: "single_select", required: true, options: [{ id: "yes", label: "Sí" }, { id: "no", label: "No" }] },
        { id: "dietary_notes", active: false, label: "Alergias", type: "long_text", required: false, options: [] },
      ],
      modal: { title: "Confirmar asistencia", subtitle: "Completá tus datos", submitLabel: "Enviar", primaryColor: "#7c3aed" },
    },
    gifts: {
      enabled: false,
      methods: {
        holder: { value: "Ana Pérez", visible: false },
        bank: { value: "", visible: false },
        alias: { value: "ANA.LUZ", visible: false },
        cbu: { value: "", visible: false },
        cuit: { value: "", visible: false },
        giftListLink: { value: "", configured: false, visible: false },
      },
      introText: "Si querés hacernos un regalo",
      buttonText: "Ver regalos",
    },
    ...overrides.values,
  };
  return { availability, values };
}

test("legacy terminal name resolutions without user provenance do not confirm template names", () => {
  const input = fixture();
  const initial = buildDesignerAiLedger(input);
  const conversationState = {
    resolutions: initial.leaves.filter((leaf) => leaf.id.startsWith("event.people.")).map((leaf) => ({
      leafId: leaf.id, fingerprint: leaf.fingerprint, status: "resolved_from_existing_user_data", provenance: "unknown", rule: null,
    })),
  };
  const ledger = buildDesignerAiLedger({ ...input, conversationState });
  assert.equal(ledger.leaves.filter((leaf) => leaf.id.startsWith("event.people.")).every((leaf) => leaf.status === "pending"), true);
});

function build(options = {}) {
  const data = fixture(options);
  return buildDesignerAiLedger({
    ...data,
    conversationState: options.conversationState,
    sourceContext: options.sourceContext || { templateDerived: true, changedKeys: [] },
  });
}

function snapshotFor(ledger, values = fixture().values) {
  return { ledger, values, conversation: { namePolicy: { mode: "unknown", lastAutomaticName: "" } } };
}

for (const leafId of ["gifts.enabled", "gifts.method.alias.visible", "gifts.method.alias.value"]) {
  test(`a persisted gift receipt outranks requires_control and survives reentry: ${leafId}`, () => {
    const base = fixture();
    const values = {
      ...base.values,
      eventMode: "single",
      ceremony: { ...base.values.ceremony, placeSelected: true },
      gifts: {
        ...base.values.gifts,
        enabled: true,
        methods: { ...base.values.gifts.methods, alias: { value: "SYNTHETIC.ALIAS", visible: true } },
      },
    };
    const initial = build({ values });
    const previousState = { resolutions: initial.leaves
      .filter((leaf) => initial.guidedFlow.leafIds.includes(leaf.id) && !["gifts", "cover", "galleries"].includes(leaf.block))
      .map((leaf) => ({ leafId: leaf.id, fingerprint: leaf.fingerprint,
        status: "resolved_from_user", provenance: "user_current_session", rule: null })) };
    const snapshot = snapshotFor(build({ values, conversationState: previousState }), values);
    const actions = [
      { type: "gifts.set_enabled", arguments: { enabled: true } },
      { type: "gifts.set_method", arguments: { method: "alias", value: "SYNTHETIC.ALIAS", visible: true } },
    ];
    const actionResults = actions.map((action) => ({ action, executed: true, effective: true, persisted: true,
      evidence: captureDesignerAiActionEvidence(action, snapshot) }));
    const state = reconcileDesignerAiConversationState({ snapshot, previousState, actionResults,
      resolutions: [{ leafId, status: "requires_control", rule: null }] });
    const restored = JSON.parse(JSON.stringify(state));
    const current = build({ values, conversationState: prepareDesignerAiConversationEntry(restored).persistedState });
    assert.equal(current.leaves.find((leaf) => leaf.id === leafId).status, "resolved_from_user");
    assert.equal(buildDesignerAiConversationBrief(snapshotFor(current, values)).nextStep.blockId, "cover");
  });
}

test("requires_control protection never promotes proposals, failed writes or old metadata to confirmation", () => {
  const values = fixture().values;
  const snapshot = snapshotFor(build(), values);
  const action = { type: "gifts.set_method", arguments: { method: "alias", value: "SYNTHETIC.ALIAS", visible: true } };
  const leafId = "gifts.method.alias.value";
  const resolutions = [{ leafId, status: "requires_control", rule: null }];
  for (const actionResults of [[], [{ action, executed: true, effective: true, persisted: false }],
    [{ action, executed: true, effective: true, persisted: true,
      evidence: captureDesignerAiActionEvidence(action, { ...snapshot, documentIdentity: "another-draft" }) }]]) {
    const state = reconcileDesignerAiConversationState({ snapshot, actionResults, resolutions });
    const resolution = state.resolutions.find((entry) => entry.leafId === leafId);
    assert.equal(resolution.status, actionResults.length ? "needs_clarification" : "requires_control");
  }
  const existing = { resolutions: [{ ...resolutions[0], provenance: "user_current_session",
    fingerprint: snapshot.ledger.leaves.find((leaf) => leaf.id === leafId).fingerprint }] };
  const restored = reconcileDesignerAiConversationState({ snapshot, previousState: existing });
  assert.equal(restored.resolutions.find((entry) => entry.leafId === leafId).status, "requires_control");
});

test("ledger expands RSVP, Gifts and media into structural leaves", () => {
  const ledger = build();
  const ids = new Set(ledger.leaves.map((leaf) => leaf.id));
  for (const id of [
    "event.people.primary_name",
    "event.ceremony.end_time",
    "media.gallery.gallery-1.guided_completion",
    "media.gallery.gallery-1.slot.b",
    "rsvp.question.attendance.options",
    "rsvp.modal.primary_color",
    "gifts.method.alias.visible",
    "gifts.method.alias.value",
  ]) assert.equal(ids.has(id), true, id);
  assert.equal(ledger.completion.complete, false);
  assert.ok(ledger.completion.unresolvedLeafIds.length > 10);
});

test("completeness is true only when every available leaf is terminal", () => {
  const values = { ...fixture().values, documentName: "Nuestra fiesta", story: "Nos conocimos en la universidad" };
  const initial = build({ values });
  const resolutions = initial.leaves
    .filter((leaf) => leaf.status !== DESIGNER_AI_LEDGER_STATUSES.UNAVAILABLE)
    .map((leaf) => terminalResolution(leaf));
  const complete = build({ values, conversationState: { resolutions } });
  assert.equal(complete.completion.complete, true);
  const incomplete = build({ values, conversationState: { resolutions: resolutions.slice(1) } });
  assert.equal(incomplete.completion.complete, false);
  assert.ok(incomplete.completion.unresolvedLeafIds.length > 0);
});

test("template, placeholder and system defaults are not mistaken for personalization", () => {
  const ledger = build();
  const byId = new Map(ledger.leaves.map((leaf) => [leaf.id, leaf]));
  assert.equal(byId.get("document.name").provenance, "placeholder_or_sample");
  assert.equal(byId.get("document.name").status, "pending");
  assert.equal(byId.get("rsvp.modal.title").provenance, "system_default");
  assert.equal(byId.get("rsvp.modal.title").status, "pending");
  assert.equal(byId.get("story.text").provenance, "placeholder_or_sample");
});

test("template changedKeys provide evidence for existing user data", () => {
  const ledger = build({
    sourceContext: {
      templateDerived: true,
      changedKeys: ["event_primary_person_name", "event_ceremony_date"],
    },
  });
  assert.equal(ledger.leaves.find((leaf) => leaf.id === "event.people.primary_name").status, "resolved_from_existing_user_data");
  assert.equal(ledger.leaves.find((leaf) => leaf.id === "event.ceremony.date").status, "resolved_from_existing_user_data");
  assert.equal(ledger.leaves.find((leaf) => leaf.id === "event.people.secondary_name").status, "pending");
});

test("entry baseline preserves proven names on reentry without repeating source metadata", () => {
  const initial = build({ sourceContext: { templateDerived: true,
    changedKeys: ["event_primary_person_name", "event_secondary_person_name"] } });
  const conversationState = reconcileDesignerAiConversationState({ snapshot: snapshotFor(initial) });
  const reopened = build({ conversationState, sourceContext: { templateDerived: true, changedKeys: [] } });
  for (const leaf of reopened.leaves.filter((entry) => entry.id.startsWith("event.people."))) {
    assert.equal(leaf.status, "resolved_from_existing_user_data");
    assert.equal(leaf.provenance, "existing_user_data");
  }
  assert.equal(buildDesignerAiConversationBrief({ ledger: reopened }).nextBlock.id, "event_structure");
});

test("unknown/template baselines and missing legacy fingerprints never confirm unchanged names", () => {
  const initial = build();
  for (const provenance of ["unknown", "template_value", "placeholder_or_sample"]) {
    for (const missingFingerprint of [false, true]) {
      const conversationState = { baseline: initial.leaves.map((leaf) => ({ leafId: leaf.id,
        fingerprint: missingFingerprint ? "" : leaf.fingerprint, provenance })) };
      const reopened = build({ conversationState });
      assert.equal(buildDesignerAiConversationBrief({ ledger: reopened }).nextBlock.id, "names");
      assert.ok(reopened.leaves.filter((leaf) => leaf.id.startsWith("event.people.")).every((leaf) => leaf.status === "pending"));
    }
  }
});

test("restoring template names after entry cannot acquire confirmation from a baseline delta", () => {
  const values = { ...fixture().values, people: { primaryName: "Mica", secondaryName: "Juana" } };
  const initial = build({ values,
    sourceContext: { templateDerived: true, changedKeys: ["event_primary_person_name", "event_secondary_person_name"] } });
  const conversationState = reconcileDesignerAiConversationState({ snapshot: snapshotFor(initial, values) });
  const restored = build({ conversationState,
    sourceContext: { templateDerived: true, changedKeys: [], changedKeysAuthoritative: true } });
  assert.ok(restored.leaves.filter((leaf) => leaf.id.startsWith("event.people.")).every((leaf) => leaf.status === "pending"));
  assert.equal(buildDesignerAiConversationBrief({ ledger: restored }).nextBlock.id, "names");
});

test("authoritative changedKeys recognize canonical and legacy Dress Code fields", () => {
  for (const key of ["event_dress_code", "dress_code"]) {
    const ledger = build({ sourceContext: { templateDerived: true, changedKeysAuthoritative: true,
      authoringFieldKeys: [key], changedKeys: [key] } });
    const dress = ledger.leaves.find((leaf) => leaf.id === "event.dress_code.value");
    assert.equal(dress.status, "resolved_from_existing_user_data", key);
    assert.equal(dress.provenance, "existing_user_data", key);
  }
});

test("an authoritative comparison does not treat an absent canonical key as an unchanged template field", () => {
  const initial = build();
  const conversationState = reconcileDesignerAiConversationState({ snapshot: snapshotFor(initial) });
  const changed = build({ conversationState, values: { dressCode: { enabled: false, value: "Cocktail" } },
    sourceContext: { templateDerived: true, changedKeysAuthoritative: true,
      authoringFieldKeys: ["custom_dress_code"], changedKeys: ["custom_dress_code"] } });
  assert.equal(changed.leaves.find((leaf) => leaf.id === "event.dress_code.value").status, "resolved_from_existing_user_data");
});

test("name provenance separates template, unknown inference and explicit confirmation of identical text", () => {
  const template = build();
  const inferred = build({ sourceContext: { templateDerived: false, changedKeys: [] } });
  const action = { type: "event.set_people", arguments: { primaryName: "Ana", secondaryName: "Luz" } };
  const snapshot = snapshotFor(template);
  const conversationState = reconcileDesignerAiConversationState({ snapshot,
    actionResults: [{ action, executed: true, effective: true, persisted: true,
      evidence: captureDesignerAiActionEvidence(action, snapshot) }] });
  const confirmed = build({ conversationState });
  for (const id of ["event.people.primary_name", "event.people.secondary_name"]) {
    assert.equal(template.leaves.find((leaf) => leaf.id === id).provenance, "template_value");
    assert.equal(inferred.leaves.find((leaf) => leaf.id === id).provenance, "unknown");
    assert.equal(inferred.leaves.find((leaf) => leaf.id === id).status, "pending");
    assert.equal(confirmed.leaves.find((leaf) => leaf.id === id).provenance, "user_current_session");
    assert.equal(confirmed.leaves.find((leaf) => leaf.id === id).status, "resolved_from_user");
  }
});

test("automatic event name is safe, normalized and rejects samples", () => {
  assert.equal(buildAutomaticEventName("  Martina ", "Juan  Pérez"), "Casamiento Martina y Juan Pérez");
  assert.equal(buildAutomaticEventName("Nombre de la novia", "Juan"), "");
  assert.equal(buildAutomaticEventName("", "Juan"), "");
});

test("automatic name policy follows corrections while explicit names remain explicit", () => {
  // Receipts now require the actual post-action state, not boolean success mocks.
  const makeSnapshot = (name, secondaryName = "Luz") => {
    const values = { ...fixture().values, documentName: name, people: { primaryName: "Ana", secondaryName } };
    return snapshotFor(build({ values }), values);
  };
  const receipt = (action, current) => ({ action, executed: true, effective: true, persisted: true, evidence: captureDesignerAiActionEvidence(action, current) });
  const snapshot = makeSnapshot("Casamiento Ana y Luz");
  const automatic = reconcileDesignerAiConversationState({
    snapshot,
    actionResults: [
      { type: "event.set_people", arguments: { primaryName: "Ana", secondaryName: "Luz" } },
      { type: "document.set_name", arguments: { name: "Casamiento Ana y Luz" } },
    ].map((action) => receipt(action, snapshot)),
    resolutions: [{
      leafId: "document.name",
      status: "resolved_by_rule",
      rule: DESIGNER_AI_RESOLUTION_RULES.AUTOMATIC_EVENT_NAME,
    }],
  });
  assert.deepEqual(automatic.namePolicy, { mode: "automatic", lastAutomaticName: "Casamiento Ana y Luz" });
  const corrected = reconcileDesignerAiConversationState({
    snapshot: makeSnapshot("Casamiento Ana y Lucía", "Lucía"),
    previousState: automatic,
    actionResults: [
      { type: "event.set_people", arguments: { primaryName: "Ana", secondaryName: "Lucía" } },
      { type: "document.set_name", arguments: { name: "Casamiento Ana y Lucía" } },
    ].map((action) => receipt(action, makeSnapshot("Casamiento Ana y Lucía", "Lucía"))),
    resolutions: [{ leafId: "document.name", status: "resolved_by_rule", rule: DESIGNER_AI_RESOLUTION_RULES.AUTOMATIC_EVENT_NAME }],
  });
  assert.equal(corrected.namePolicy.lastAutomaticName, "Casamiento Ana y Lucía");
  const explicit = reconcileDesignerAiConversationState({
    snapshot: makeSnapshot("Nuestra fiesta"),
    previousState: corrected,
    actionResults: [receipt({ type: "document.set_name", arguments: { name: "Nuestra fiesta" } }, makeSnapshot("Nuestra fiesta"))],
  });
  assert.equal(explicit.namePolicy.mode, "explicit");
});

test("party and question dependencies reopen when their parent changes", () => {
  const singleValues = { ...fixture().values, eventMode: "single" };
  const initial = build({ values: singleValues });
  const modeLeaf = initial.leaves.find((leaf) => leaf.id === "event.mode");
  const state = { resolutions: [{ ...modeLeaf, leafId: modeLeaf.id, status: "resolved_from_user", provenance: "user_current_session" }] };
  const single = build({ values: singleValues, conversationState: state });
  assert.equal(single.leaves.find((leaf) => leaf.id === "event.party.date").status, "not_applicable_by_dependency");
  const party = build({ conversationState: state });
  assert.equal(party.leaves.find((leaf) => leaf.id === "event.party.date").status, "pending");

  const inactive = initial.leaves.find((leaf) => leaf.id === "rsvp.question.dietary_notes.active");
  const inactiveState = { resolutions: [{ ...inactive, leafId: inactive.id, status: "resolved_from_user", provenance: "user_current_session" }] };
  const child = build({ conversationState: inactiveState }).leaves.find((leaf) => leaf.id === "rsvp.question.dietary_notes.label");
  assert.equal(child.status, "not_applicable_by_dependency");
});

test("preserve_while_inactive resolves every internal RSVP/Gifts leaf and reopens on activation", () => {
  const initial = build();
  const preserved = initial.leaves
    .filter((leaf) => (leaf.id.startsWith("rsvp.") && leaf.id !== "rsvp.enabled") || (leaf.id.startsWith("gifts.") && leaf.id !== "gifts.enabled"))
    .map((leaf) => ({ ...leaf, leafId: leaf.id, status: "resolved_by_rule", provenance: "automatic_rule", rule: "preserve_while_inactive" }));
  const parentLeaves = ["rsvp.enabled", "gifts.enabled"].map((id) => {
    const leaf = initial.leaves.find((entry) => entry.id === id);
    return { ...leaf, leafId: leaf.id, status: "resolved_from_user", provenance: "user_current_session" };
  });
  const inactive = build({ conversationState: { resolutions: [...preserved, ...parentLeaves] } });
  assert.equal(inactive.leaves.find((leaf) => leaf.id === "rsvp.modal.title").status, "resolved_by_rule");
  const activeValues = {
    ...fixture().values,
    rsvp: { ...fixture().values.rsvp, enabled: true },
    gifts: { ...fixture().values.gifts, enabled: true },
  };
  const activeUnresolved = build({ values: activeValues });
  const activeParents = ["rsvp.enabled", "gifts.enabled"].map((id) => {
    const leaf = activeUnresolved.leaves.find((entry) => entry.id === id);
    return { ...leaf, leafId: leaf.id, status: "resolved_from_user", provenance: "user_current_session" };
  });
  const active = build({ values: activeValues, conversationState: { resolutions: [...preserved, ...activeParents] } });
  assert.equal(active.leaves.find((leaf) => leaf.id === "rsvp.modal.title").status, "pending");
  assert.equal(active.leaves.find((leaf) => leaf.id === "gifts.intro_text").status, "pending");
});

test("RSVP order follows active-question dependency and enabled Gifts require a complete visible method", () => {
  const singleQuestionValues = {
    ...fixture().values,
    rsvp: {
      ...fixture().values.rsvp,
      questions: fixture().values.rsvp.questions.map((question) => ({
        ...question,
        active: question.id === "full_name",
      })),
    },
  };
  const initial = build({ values: singleQuestionValues });
  const activeResolutions = initial.leaves
    .filter((leaf) => leaf.id.match(/^rsvp\.question\..+\.active$/))
    .map((leaf) => ({ ...leaf, leafId: leaf.id, status: "resolved_from_user", provenance: "user_current_session" }));
  const oneQuestion = build({ values: singleQuestionValues, conversationState: { resolutions: activeResolutions } });
  assert.equal(oneQuestion.leaves.find((leaf) => leaf.id === "rsvp.questions.order").status, "not_applicable_by_dependency");

  const giftsEnabledValues = {
    ...fixture().values,
    gifts: { ...fixture().values.gifts, enabled: true },
  };
  const unresolvedGifts = build({ values: giftsEnabledValues });
  const enabledLeaf = unresolvedGifts.leaves.find((leaf) => leaf.id === "gifts.enabled");
  const invalidGifts = build({
    values: giftsEnabledValues,
    conversationState: {
      resolutions: [{ ...enabledLeaf, leafId: enabledLeaf.id, status: "resolved_from_user", provenance: "user_current_session" }],
    },
  });
  assert.equal(invalidGifts.leaves.find((leaf) => leaf.id === "gifts.enabled").status, "needs_clarification");
});

test("brief selects the highest-priority real pending block and groups related leaves", () => {
  const ledger = build();
  const brief = buildDesignerAiConversationBrief({ ledger });
  assert.equal(brief.nextBlock.id, "names");
  assert.ok(brief.nextBlock.leafIds.includes("event.people.primary_name"));
  assert.ok(brief.needsAttention.find((block) => block.id === "event_data").leafIds.length >= 4);
});

test("legacy drafts enter once as first_entry and persist an unambiguous reentry marker", () => {
  const legacy = prepareDesignerAiConversationEntry(null);
  assert.equal(legacy.entryMode, "first_entry");
  assert.equal(legacy.requestState.usage.hasStarted, false);
  assert.equal(legacy.persistedState.usage.hasStarted, true);

  const reopened = prepareDesignerAiConversationEntry(legacy.persistedState);
  assert.equal(reopened.entryMode, "reentry");
  assert.equal(reopened.requestState.usage.hasStarted, true);
  assert.equal(reopened.persistedState.usage.hasStarted, true);
});

test("guided completion marker is strict, preserved by entry and reconciliation, and cannot resolve leaves", () => {
  for (const value of [undefined, false, "true", 1]) {
    assert.equal(normalizeDesignerAiConversationState({ usage: { guidedFlowCompleted: value } }).usage.guidedFlowCompleted, false);
  }
  const state = normalizeDesignerAiConversationState({ usage: { guidedFlowCompleted: true } });
  const entry = prepareDesignerAiConversationEntry(state);
  assert.equal(entry.persistedState.usage.guidedFlowCompleted, true);
  const pending = build({ conversationState: state });
  assert.deepEqual(pending, build());
  assert.equal(pending.guidedFlow.completion.complete, false);
  const next = reconcileDesignerAiConversationState({ snapshot: snapshotFor(pending), previousState: entry.persistedState });
  assert.equal(next.usage.guidedFlowCompleted, true);
});

function terminalResolution(leaf, status = DESIGNER_AI_LEDGER_STATUSES.RESOLVED_FROM_USER) {
  // These fixtures deliberately omit end times, use manual addresses and leave
  // slot b empty. Such choices require their semantic rule, not a fictitious
  // user value. Gallery completion requires the explicit human control.
  let rule = null;
  if (status === DESIGNER_AI_LEDGER_STATUSES.RESOLVED_FROM_USER) {
    if (leaf.id.endsWith(".end_time")) rule = "optional_end_time_omitted";
    if (leaf.id.endsWith(".place_selection") || leaf.id === "media.gallery.gallery-1.slot.b") rule = "leave_empty";
    if (rule) status = DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_RULE;
    if (leaf.id.endsWith(".guided_completion")) status = DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_CONTROL;
  }
  return {
    leafId: leaf.id,
    status,
    provenance: "user_current_session",
    rule,
    fingerprint: leaf.fingerprint,
  };
}

function buildWithResolvedIds(values, predicate, availability = {}) {
  const initial = build({ values, availability });
  return build({
    values,
    availability,
    conversationState: {
      resolutions: initial.leaves.filter(predicate).map((leaf) => terminalResolution(leaf)),
    },
  });
}

test("guided priority is names, structure, data, Dress Code, RSVP, Gifts, cover and Galleries", () => {
  const values = { ...fixture().values, eventMode: "single" };
  const initial = build({ values });
  assert.equal(buildDesignerAiConversationBrief({ ledger: initial }).nextBlock.id, "names");

  const namesDone = buildWithResolvedIds(values, (leaf) => leaf.id.startsWith("event.people."));
  assert.equal(buildDesignerAiConversationBrief({ ledger: namesDone }).nextBlock.id, "event_structure");

  const eventDone = buildWithResolvedIds(values, (leaf) => (
    leaf.id.startsWith("event.people.") ||
    leaf.id === "event.mode" ||
    leaf.id.startsWith("event.ceremony.")
  ));
  assert.equal(buildDesignerAiConversationBrief({ ledger: eventDone }).nextBlock.id, "dress_code");

  const giftsRejected = buildWithResolvedIds(values, (leaf) => (
    leaf.id.startsWith("event.people.") ||
    leaf.id === "event.mode" ||
    leaf.id.startsWith("event.ceremony.") ||
    leaf.id === "gifts.enabled"
  ));
  assert.equal(buildDesignerAiConversationBrief({ ledger: giftsRejected }).nextBlock.id, "dress_code");

  const dressRejected = buildWithResolvedIds(values, (leaf) => (
    leaf.id.startsWith("event.people.") ||
    leaf.id === "event.mode" ||
    leaf.id.startsWith("event.ceremony.") ||
    leaf.id === "gifts.enabled" ||
    leaf.id === "event.dress_code.enabled"
  ));
  assert.equal(buildDesignerAiConversationBrief({ ledger: dressRejected }).nextBlock.id, "rsvp");

  const coverDone = buildWithResolvedIds(values, (leaf) => (
    leaf.id.startsWith("event.people.") ||
    leaf.id === "event.mode" ||
    leaf.id.startsWith("event.ceremony.") ||
    leaf.id === "gifts.enabled" ||
    leaf.id === "event.dress_code.enabled" ||
    leaf.id === "rsvp.enabled" ||
    leaf.id === "media.cover"
  ));
  const mediaBrief = buildDesignerAiConversationBrief({ ledger: coverDone });
  assert.equal(mediaBrief.nextBlock.id, "galleries");
  assert.deepEqual(mediaBrief.nextBlock.leafIds, ["media.gallery.gallery-1.guided_completion"]);
});

test("single mode never adds party data to guided flow", () => {
  const values = { ...fixture().values, eventMode: "single" };
  const ledger = buildWithResolvedIds(values, (leaf) => leaf.id === "event.mode");
  assert.equal(
    ledger.guidedFlow.leafIds.some((leafId) => leafId.startsWith("event.party.")),
    false
  );
  assert.equal(
    ledger.leaves.find((leaf) => leaf.id === "event.party.date").status,
    "not_applicable_by_dependency"
  );
});

test("phase dependency belongs to the ledger and reopens after single to double", () => {
  const singleValues = { ...fixture().values, eventMode: "single" };
  const unconfirmed = build({ values: singleValues });
  assert.notEqual(unconfirmed.leaves.find((leaf) => leaf.id === "event.party.date").status, "not_applicable_by_dependency");
  const single = buildWithResolvedIds(singleValues, (leaf) => leaf.id === "event.mode");
  const party = single.leaves.filter((leaf) => leaf.id.startsWith("event.party."));
  assert.ok(party.every((leaf) => leaf.status === "not_applicable_by_dependency" && leaf.rule === "parent_inactive"));
  const doubleValues = { ...singleValues, eventMode: "ceremony_party" };
  const double = buildWithResolvedIds(doubleValues, (leaf) => leaf.id === "event.mode");
  assert.ok(double.leaves.filter((leaf) => leaf.id.startsWith("event.party.")).every((leaf) => leaf.status !== "not_applicable_by_dependency"));
  assert.ok(double.guidedFlow.leafIds.includes("event.party.date"));
});

test("guided completion ignores optional RSVP customization, story, Gallery order and empty slots without falsifying them", () => {
  const values = {
    ...fixture().values,
    eventMode: "single",
    galleries: [{ id: "gallery-1", slots: [
      { cellId: "a", index: 0, occupied: true, contentRevision: "photo-a" },
      { cellId: "b", index: 1, occupied: true, contentRevision: "photo-b" },
      { cellId: "c", index: 2, occupied: false, contentRevision: "empty" },
    ] }],
  };
  const initial = build({ values });
  const guidedIds = new Set(initial.guidedFlow.leafIds);
  const ledger = build({
    values,
    conversationState: {
      resolutions: initial.leaves
        .filter((leaf) => guidedIds.has(leaf.id))
        .map((leaf) => terminalResolution(leaf)),
    },
  });
  assert.equal(ledger.guidedFlow.completion.complete, true);
  assert.equal(ledger.completion.complete, false);
  assert.ok(!ledger.completion.unresolvedLeafIds.includes("rsvp.enabled"));
  assert.ok(ledger.completion.unresolvedLeafIds.includes("rsvp.question.attendance.active"));
  assert.ok(ledger.completion.unresolvedLeafIds.includes("story.text"));
  assert.ok(ledger.completion.unresolvedLeafIds.includes("media.gallery.gallery-1.order"));
  assert.ok(ledger.completion.unresolvedLeafIds.includes("media.gallery.gallery-1.slot.c"));
});

test("non-applicable cover and Galleries are skipped and multiple Galleries stay distinct in canonical order", () => {
  const noMediaValues = { ...fixture().values, eventMode: "single", media: { hasCover: false }, galleries: [] };
  const noMedia = build({
    values: noMediaValues,
    availability: { cover: false, gallery: false },
  });
  assert.equal(noMedia.guidedFlow.leafIds.includes("media.cover"), false);
  assert.equal(noMedia.guidedFlow.leafIds.some((id) => id.startsWith("media.gallery.")), false);

  const noEditableSlots = build({
    values: { ...noMediaValues, galleries: [{ id: "gallery-without-slots", slots: [] }] },
    availability: { cover: false, gallery: true },
  });
  assert.equal(
    noEditableSlots.guidedFlow.leafIds.includes("media.gallery.gallery-without-slots.guided_completion"),
    false
  );

  const multipleValues = {
    ...fixture().values,
    galleries: [
      ...fixture().values.galleries,
      { id: "gallery-2", slots: [
        { cellId: "c", index: 0, occupied: true, contentRevision: "photo-c" },
        { cellId: "d", index: 1, occupied: true, contentRevision: "photo-d" },
      ] },
    ],
  };
  const multiple = build({ values: multipleValues });
  assert.deepEqual(
    multiple.guidedFlow.leafIds.filter((id) => id.startsWith("media.gallery.")),
    [
      "media.gallery.gallery-1.guided_completion",
      "media.gallery.gallery-2.guided_completion",
    ]
  );
});

test("Gallery edits and reordering never complete its guided step without explicit finalization", () => {
  const initialValues = {
    ...fixture().values,
    galleries: [{ id: "gallery-1", slots: [
      { cellId: "a", index: 0, occupied: true, contentRevision: "photo-a" },
      { cellId: "b", index: 1, occupied: true, contentRevision: "photo-b" },
    ] }],
  };
  const initial = build({ values: initialValues });
  const completionLeafId = buildDesignerAiGalleryCompletionLeafId("gallery-1");
  assert.equal(
    initial.leaves.find((leaf) => leaf.id === completionLeafId).status,
    DESIGNER_AI_LEDGER_STATUSES.REQUIRES_CONTROL
  );

  const changedValues = {
    ...initialValues,
    galleries: [{ id: "gallery-1", slots: [
      { cellId: "b", index: 0, occupied: true, contentRevision: "photo-b" },
      { cellId: "a", index: 1, occupied: true, contentRevision: "photo-replaced" },
    ] }],
  };
  const changedWithoutFinish = build({ values: changedValues });
  assert.equal(
    changedWithoutFinish.leaves.find((leaf) => leaf.id === completionLeafId).status,
    DESIGNER_AI_LEDGER_STATUSES.REQUIRES_CONTROL
  );
  assert.ok(changedWithoutFinish.guidedFlow.completion.unresolvedLeafIds.includes(completionLeafId));
});

test("explicit Gallery finalization is durable and advances only to the next real Gallery", () => {
  const values = {
    ...fixture().values,
    eventMode: "single",
    galleries: [
      { id: "gallery-1", slots: [{ cellId: "a", index: 0, occupied: true, contentRevision: "photo-a" }] },
      { id: "gallery-2", slots: [{ cellId: "b", index: 0, occupied: true, contentRevision: "photo-b" }] },
    ],
  };
  const initial = build({ values });
  const firstCompletionId = buildDesignerAiGalleryCompletionLeafId("gallery-1");
  const secondCompletionId = buildDesignerAiGalleryCompletionLeafId("gallery-2");
  const precedingResolutions = initial.leaves
    .filter((leaf) => initial.guidedFlow.leafIds.includes(leaf.id) && !leaf.id.endsWith(".guided_completion"))
    .map((leaf) => terminalResolution(leaf));
  const state = reconcileDesignerAiConversationState({
    snapshot: snapshotFor(initial, values),
    previousState: { resolutions: precedingResolutions },
    controlLeafIds: [firstCompletionId],
  });
  const changedValues = {
    ...values,
    galleries: [
      { id: "gallery-1", slots: [{ cellId: "a", index: 0, occupied: true, contentRevision: "photo-after-finish" }] },
      values.galleries[1],
    ],
  };
  const reopened = build({ values: changedValues, conversationState: state });
  assert.equal(
    reopened.leaves.find((leaf) => leaf.id === firstCompletionId).status,
    DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_CONTROL
  );
  assert.equal(
    reopened.leaves.find((leaf) => leaf.id === secondCompletionId).status,
    DESIGNER_AI_LEDGER_STATUSES.REQUIRES_CONTROL
  );
  assert.deepEqual(
    buildDesignerAiConversationBrief({ ledger: reopened }).nextBlock.leafIds,
    [secondCompletionId]
  );
});

test("legacy drafts without explicit Gallery completion remain pending regardless of media fingerprints", () => {
  const values = {
    ...fixture().values,
    galleries: [{ id: "legacy-gallery", slots: [
      { cellId: "legacy-a", index: 0, occupied: true, contentRevision: "heavily-customized-photo" },
    ] }],
  };
  const ledger = build({
    values,
    conversationState: { version: 2, resolutions: [], baseline: [] },
    sourceContext: { templateDerived: false, changedKeys: [] },
  });
  const completionLeafId = buildDesignerAiGalleryCompletionLeafId("legacy-gallery");
  assert.equal(
    ledger.leaves.find((leaf) => leaf.id === completionLeafId).status,
    DESIGNER_AI_LEDGER_STATUSES.REQUIRES_CONTROL
  );
});

test("a multi-action turn maps all mentioned values without aggregate coverage", () => {
  const ids = [
    ...mapDesignerAiActionToLeafIds({ type: "event.set_people", arguments: { primaryName: "Ana", secondaryName: "Luz" } }),
    ...mapDesignerAiActionToLeafIds({ type: "event.set_datetime", arguments: { phase: "ceremony", date: "2027-11-14", startTime: "18:00", endTime: null } }),
    ...mapDesignerAiActionToLeafIds({ type: "event.set_dress_code", arguments: { enabled: true, value: "Elegante sport" } }),
  ];
  assert.deepEqual(ids, [
    "event.people.primary_name",
    "event.people.secondary_name",
    "event.ceremony.date",
    "event.ceremony.start_time",
    "event.dress_code.enabled",
    "event.dress_code.value",
  ]);
});

test("manual location resolves only nonempty values and leaves a missing address pending", () => {
  assert.deepEqual(
    mapDesignerAiActionToLeafIds({
      type: "event.set_location_text",
      arguments: { phase: "ceremony", venueName: "Salón Los Robles", address: "" },
    }),
    ["event.ceremony.venue_name"]
  );
  assert.deepEqual(
    mapDesignerAiActionToLeafIds({
      type: "event.set_location_text",
      arguments: { phase: "party", venueName: "", address: "Ruta 8 km 40" },
    }),
    ["event.party.address"]
  );
});

test("trusted control resolution is recorded only against the reread leaf fingerprint", () => {
  const initial = build();
  const changed = build({
    values: {
      ...fixture().values,
      media: { hasCover: true, contentRevision: "cover-b" },
    },
  });
  const state = reconcileDesignerAiConversationState({
    snapshot: snapshotFor(changed, { ...fixture().values, media: { hasCover: true, contentRevision: "cover-b" } }),
    controlLeafIds: ["media.cover"],
  });
  const resolution = state.resolutions.find((item) => item.leafId === "media.cover");
  assert.equal(resolution.status, "resolved_by_control");
  assert.equal(resolution.fingerprint, changed.leaves.find((leaf) => leaf.id === "media.cover").fingerprint);
  assert.notEqual(resolution.fingerprint, initial.leaves.find((leaf) => leaf.id === "media.cover").fingerprint);
});

function buildCeremonyPartyLocationProgress({
  ceremony,
  party,
  googlePhase = "",
  manualPhase = "",
} = {}) {
  const values = {
    ...fixture().values,
    eventMode: "ceremony_party",
    ceremony: {
      date: "2027-11-14",
      startTime: "18:00",
      endTime: "",
      venueName: "",
      address: "",
      placeSelected: false,
      ...ceremony,
    },
    party: {
      date: "2027-11-14",
      startTime: "21:00",
      endTime: "",
      venueName: "",
      address: "",
      placeSelected: false,
      ...party,
    },
    media: { hasCover: false, contentRevision: "" },
    galleries: [],
  };
  const availability = { cover: false, gallery: false };
  const initial = build({
    values,
    availability,
    sourceContext: { templateDerived: false, changedKeys: [] },
  });
  const byId = new Map(initial.leaves.map((leaf) => [leaf.id, leaf]));
  const resolutions = [
    terminalResolution(byId.get("event.mode")),
    terminalResolution(byId.get("event.people.primary_name")),
    terminalResolution(byId.get("event.people.secondary_name")),
    {
      ...terminalResolution(byId.get("event.ceremony.end_time"), DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_RULE),
      rule: DESIGNER_AI_RESOLUTION_RULES.OPTIONAL_END_TIME_OMITTED,
      provenance: "automatic_rule",
    },
    {
      ...terminalResolution(byId.get("event.party.end_time"), DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_RULE),
      rule: DESIGNER_AI_RESOLUTION_RULES.OPTIONAL_END_TIME_OMITTED,
      provenance: "automatic_rule",
    },
  ];
  if (googlePhase) {
    resolutions.push(terminalResolution(
      byId.get(`event.${googlePhase}.place_selection`),
      DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_CONTROL
    ));
  }
  if (manualPhase) {
    resolutions.push({
      ...terminalResolution(
        byId.get(`event.${manualPhase}.place_selection`),
        DESIGNER_AI_LEDGER_STATUSES.RESOLVED_BY_RULE
      ),
      rule: DESIGNER_AI_RESOLUTION_RULES.LEAVE_EMPTY,
      provenance: "automatic_rule",
    });
  }
  return build({
    values,
    availability,
    conversationState: { resolutions },
    sourceContext: { templateDerived: false, changedKeys: [] },
  });
}

test("party Google selection leaves ceremony location pending and blocks Gifts", () => {
  const ledger = buildCeremonyPartyLocationProgress({
    ceremony: {},
    party: {
      venueName: "Estancia La Fiesta",
      address: "Ruta 8 km 40",
      placeSelected: true,
    },
    googlePhase: "party",
  });
  const brief = buildDesignerAiConversationBrief({ ledger });

  assert.equal(ledger.leaves.find((leaf) => leaf.id === "event.party.place_selection").status, "resolved_by_control");
  assert.equal(ledger.leaves.find((leaf) => leaf.id === "event.ceremony.address").status, "pending");
  assert.equal(brief.nextBlock.id, "event_data");
  assert.ok(brief.nextBlock.leafIds.includes("event.ceremony.address"));
  assert.equal(brief.nextBlock.leafIds.some((leafId) => leafId.startsWith("event.party.")), false);
  assert.equal(brief.needsAttention.some((block) => block.id === "gifts"), true);
  assert.equal(ledger.guidedFlow.completion.complete, false);
});

test("ceremony Google selection leaves party location pending and blocks Gifts", () => {
  const ledger = buildCeremonyPartyLocationProgress({
    ceremony: {
      venueName: "Registro Civil",
      address: "Calle 1 123",
      placeSelected: true,
    },
    party: {},
    googlePhase: "ceremony",
  });
  const brief = buildDesignerAiConversationBrief({ ledger });

  assert.equal(ledger.leaves.find((leaf) => leaf.id === "event.ceremony.place_selection").status, "resolved_by_control");
  assert.equal(ledger.leaves.find((leaf) => leaf.id === "event.party.address").status, "pending");
  assert.equal(brief.nextBlock.id, "event_data");
  assert.ok(brief.nextBlock.leafIds.includes("event.party.address"));
  assert.equal(brief.nextBlock.leafIds.some((leafId) => leafId.startsWith("event.ceremony.")), false);
});

test("manual location resolves only its phase and a cancelled control resolves neither phase", () => {
  const manualCeremony = buildCeremonyPartyLocationProgress({
    ceremony: {
      venueName: "Parroquia San José",
      address: "Calle 2 456",
      placeSelected: false,
    },
    party: {},
    manualPhase: "ceremony",
  });
  const manualBrief = buildDesignerAiConversationBrief({ ledger: manualCeremony });
  assert.equal(manualCeremony.leaves.find((leaf) => leaf.id === "event.ceremony.place_selection").status, "resolved_by_rule");
  assert.equal(manualBrief.nextBlock.id, "event_data");
  assert.ok(manualBrief.nextBlock.leafIds.includes("event.party.address"));

  const cancelledParty = buildCeremonyPartyLocationProgress({
    ceremony: {
      venueName: "Parroquia San José",
      address: "Calle 2 456",
      placeSelected: false,
    },
    party: {
      venueName: "Estancia La Fiesta",
      address: "Ruta 8 km 40",
      placeSelected: false,
    },
    manualPhase: "ceremony",
  });
  const cancelledBrief = buildDesignerAiConversationBrief({ ledger: cancelledParty });
  assert.equal(cancelledParty.leaves.find((leaf) => leaf.id === "event.party.place_selection").status, "requires_control");
  assert.equal(cancelledBrief.nextBlock.id, "event_data");
  assert.ok(cancelledBrief.nextBlock.leafIds.includes("event.party.place_selection"));
  assert.notEqual(cancelledBrief.nextBlock.id, "gifts");
});

test("Dress Code becomes next only after both applicable locations are resolved or deferred", () => {
  const ledger = buildCeremonyPartyLocationProgress({
    ceremony: {
      venueName: "Registro Civil",
      address: "Calle 1 123",
      placeSelected: true,
    },
    party: {
      venueName: "Estancia La Fiesta",
      address: "Ruta 8 km 40",
      placeSelected: false,
    },
    googlePhase: "ceremony",
    manualPhase: "party",
  });
  const brief = buildDesignerAiConversationBrief({ ledger });
  assert.equal(brief.nextBlock.id, "dress_code");
  assert.equal(ledger.guidedFlow.completion.unresolvedLeafIds.some((leafId) => (
    leafId.startsWith("event.people.") ||
    leafId === "event.mode" ||
    leafId.startsWith("event.ceremony.") ||
    leafId.startsWith("event.party.")
  )), false);
});

test("nextStep derives names and structure without persisting a new cursor or changing nextBlock", () => {
  const initial = snapshotFor(build());
  const unchanged = JSON.stringify(initial);
  const brief = buildDesignerAiConversationBrief(initial);
  assert.deepEqual(brief.nextStep, { blockId: "names", kind: "names", phase: null,
    leafIds: ["event.people.primary_name", "event.people.secondary_name"] });
  assert.deepEqual(buildDesignerAiNextStep(initial), brief.nextStep);
  assert.deepEqual(brief.nextBlock.leafIds, brief.nextStep.leafIds);
  assert.equal(JSON.stringify(initial), unchanged);
  const oneName = snapshotFor(build({ sourceContext: { templateDerived: true,
    changedKeys: ["event_primary_person_name"] } }));
  assert.deepEqual(buildDesignerAiNextStep(oneName).leafIds, ["event.people.secondary_name"]);
  const knownNames = snapshotFor(buildWithResolvedIds(fixture().values, (leaf) => leaf.block === "names"));
  assert.deepEqual(buildDesignerAiNextStep(knownNames), { blockId: "event_structure", kind: "event_structure",
    phase: null, leafIds: ["event.mode"] });
});

test("event steps ask date, start time, venue, location method and provider decision in order", () => {
  const values = { ...fixture().values, eventMode: "single" };
  const prerequisite = ["event.people.primary_name", "event.people.secondary_name", "event.mode"];
  const ordered = ["date", "start_time", "venue_name", "address", "place_selection"];
  const expected = [
    ["date", ["date"]],
    ["start_time", ["start_time"]],
    ["venue_name", ["venue_name"]],
    ["location_method", ["address", "place_selection"]],
    ["place_selection", ["place_selection"]],
  ];
  for (const [index, [kind, suffixes]] of expected.entries()) {
    const resolved = new Set([...prerequisite, ...ordered.slice(0, index).map((field) => `event.ceremony.${field}`)]);
    const ledger = buildWithResolvedIds(values, (leaf) => resolved.has(leaf.id));
    const snapshot = snapshotFor(ledger, values);
    assert.deepEqual(buildDesignerAiNextStep(snapshot), { blockId: "event_data", kind, phase: "ceremony",
      leafIds: suffixes.map((field) => `event.ceremony.${field}`) }, kind);
    assert.ok(buildDesignerAiConversationBrief(snapshot).nextBlock.leafIds.length >= suffixes.length);
  }
});

test("an inherited venue remains the next datum despite a nonempty address or place result", () => {
  const values = { ...fixture().values, ceremony: { ...fixture().values.ceremony, placeSelected: true } };
  const ledger = buildWithResolvedIds(values, (leaf) => leaf.block === "names" || leaf.id === "event.mode" ||
    ["event.ceremony.date", "event.ceremony.start_time"].includes(leaf.id));
  const venue = ledger.leaves.find((leaf) => leaf.id === "event.ceremony.venue_name");
  assert.equal(venue.provenance, "template_value");
  assert.deepEqual(buildDesignerAiNextStep(snapshotFor(ledger, values)), { blockId: "event_data",
    kind: "venue_name", phase: "ceremony", leafIds: [venue.id] });
});

test("a deferred or rule-omitted venue cannot lend its template text to a location choice", () => {
  for (const omitted of [false, true]) {
    const values = { ...fixture().values, eventMode: "single",
      ceremony: { ...fixture().values.ceremony, ...(omitted ? { venueName: "" } : {}) } };
    const initial = build({ values });
    const resolutions = initial.leaves.filter((leaf) => leaf.block === "names" ||
      ["event.mode", "event.ceremony.date", "event.ceremony.start_time"].includes(leaf.id))
      .map((leaf) => terminalResolution(leaf));
    const venue = initial.leaves.find((leaf) => leaf.id === "event.ceremony.venue_name");
    resolutions.push({ leafId: venue.id, fingerprint: venue.fingerprint,
      status: omitted ? "resolved_by_rule" : "deferred_by_user",
      provenance: omitted ? "automatic_rule" : "user_current_session",
      rule: omitted ? "optional_venue_name_omitted" : null });
    const ledger = build({ values, conversationState: { resolutions } });
    assert.deepEqual(buildDesignerAiNextStep(snapshotFor(ledger, values)), { blockId: "event_data",
      kind: "address", phase: "ceremony", leafIds: ["event.ceremony.address"] });
  }
});

test("an explicit manual-location decision asks only for the pending address", () => {
  const values = { ...fixture().values, eventMode: "single" };
  const ledger = buildWithResolvedIds(values, (leaf) => leaf.block === "names" || leaf.id === "event.mode" ||
    (leaf.id.startsWith("event.ceremony.") && leaf.id !== "event.ceremony.address"));
  assert.deepEqual(buildDesignerAiNextStep(snapshotFor(ledger, values)), { blockId: "event_data",
    kind: "address", phase: "ceremony", leafIds: ["event.ceremony.address"] });
});

test("location_method requires terminal user provenance, not merely text or a legacy terminal status", () => {
  const values = fixture().values;
  const ledger = buildWithResolvedIds(values, (leaf) => leaf.block === "names" || leaf.id === "event.mode" ||
    ["event.ceremony.date", "event.ceremony.start_time", "event.ceremony.venue_name"].includes(leaf.id));
  for (const provenance of ["template_value", "placeholder_or_sample", "unknown", "automatic_rule", "system_default"]) {
    const current = structuredClone(ledger);
    current.leaves.find((leaf) => leaf.id === "event.ceremony.venue_name").provenance = provenance;
    assert.equal(buildDesignerAiNextStep(snapshotFor(current, values)).kind, "address", provenance);
  }
  assert.equal(buildDesignerAiNextStep(snapshotFor(ledger, values)).kind, "location_method");
});

test("a double event completes the first phase before asking even the date of the second", () => {
  const values = fixture().values;
  const partial = buildWithResolvedIds(values, (leaf) => leaf.block === "names" || leaf.id === "event.mode" ||
    ["event.ceremony.date", "event.ceremony.start_time"].includes(leaf.id));
  assert.equal(buildDesignerAiNextStep(snapshotFor(partial, values)).kind, "venue_name");
  assert.equal(buildDesignerAiNextStep(snapshotFor(partial, values)).phase, "ceremony");
  const ceremonyDone = buildWithResolvedIds(values, (leaf) => leaf.block === "names" || leaf.id === "event.mode" ||
    leaf.id.startsWith("event.ceremony."));
  const snapshot = snapshotFor(ceremonyDone, values);
  assert.deepEqual(buildDesignerAiNextStep(snapshot), { blockId: "event_data", kind: "date", phase: "party",
    leafIds: ["event.party.date"] });
  // Phase and field priority do not depend on transport ordering of the leaves.
  snapshot.ledger.leaves.reverse();
  assert.equal(buildDesignerAiNextStep(snapshot).phase, "party");
});

test("nextStep respects skips, reentry, editing and complete flow without inventing confirmation", () => {
  const initial = build();
  const deferredNames = initial.leaves.filter((leaf) => leaf.block === "names").map((leaf) => ({
    leafId: leaf.id, fingerprint: leaf.fingerprint, status: "deferred_by_user", provenance: "user_current_session", rule: null,
  }));
  const partial = snapshotFor(build({ conversationState: { usage: { hasStarted: true }, resolutions: deferredNames } }));
  assert.equal(buildDesignerAiNextStep(partial).kind, "event_structure");
  assert.ok(partial.ledger.leaves.filter((leaf) => leaf.block === "names").every((leaf) => leaf.status === "deferred_by_user"));
  assert.equal(buildDesignerAiNextStep({ ...partial, conversation: { mode: "editing" } }), null);
  const complete = snapshotFor(buildWithResolvedIds(fixture().values, () => true));
  assert.equal(buildDesignerAiNextStep(complete), null);
  const noPeople = snapshotFor(build({ availability: { people: false } }));
  assert.equal(buildDesignerAiNextStep(noPeople).kind, "event_structure");
});

test("non-event nextStep kinds retain decisions, chosen gift values and one gallery target", () => {
  const before = (targetBlock) => {
    const order = ["names", "event_structure", "event_data", "dress_code", "rsvp", "gifts", "cover", "galleries"];
    return (leaf) => order.indexOf(leaf.block) >= 0 && order.indexOf(leaf.block) < order.indexOf(targetBlock);
  };
  for (const [block, kind, leafIds] of [
    ["dress_code", "dress_code_enabled", ["event.dress_code.enabled"]],
    ["rsvp", "rsvp_enabled", ["rsvp.enabled"]],
    ["gifts", "gifts_choice", ["gifts.enabled"]],
    ["cover", "cover", ["media.cover"]],
    ["galleries", "gallery", ["media.gallery.gallery-1.guided_completion"]],
  ]) {
    const values = fixture().values;
    const ledger = buildWithResolvedIds(values, before(block));
    assert.deepEqual(buildDesignerAiNextStep(snapshotFor(ledger, values)), { blockId: block, kind, phase: null, leafIds });
  }
  const dressValues = { ...fixture().values, dressCode: { enabled: true, value: "Elegante" } };
  const dress = buildWithResolvedIds(dressValues, (leaf) => before("dress_code")(leaf) || leaf.id === "event.dress_code.enabled");
  assert.equal(buildDesignerAiNextStep(snapshotFor(dress, dressValues)).kind, "dress_code_value");
  const giftValues = { ...fixture().values, gifts: { ...fixture().values.gifts, enabled: true,
    methods: { alias: { value: "", visible: true }, holder: { value: "", visible: true } } } };
  const gifts = buildWithResolvedIds(giftValues, (leaf) => before("gifts")(leaf) || leaf.id === "gifts.enabled" || leaf.id.endsWith(".visible"));
  assert.deepEqual(buildDesignerAiNextStep(snapshotFor(gifts, giftValues)), { blockId: "gifts", kind: "gift_method_values", phase: null,
    leafIds: ["gifts.method.alias.value", "gifts.method.holder.value"] });
  const galleries = [...fixture().values.galleries, { id: "gallery-2", slots: [{ cellId: "second-a", index: 0, occupied: true, contentRevision: "second-photo" }] }];
  const galleryValues = { ...fixture().values, galleries };
  const galleriesPending = buildWithResolvedIds(galleryValues, before("galleries"));
  assert.deepEqual(buildDesignerAiConversationBrief(snapshotFor(galleriesPending, galleryValues)).nextBlock.leafIds,
    ["media.gallery.gallery-1.guided_completion", "media.gallery.gallery-2.guided_completion"]);
  assert.deepEqual(buildDesignerAiNextStep(snapshotFor(galleriesPending, galleryValues)).leafIds,
    ["media.gallery.gallery-1.guided_completion"]);
  const firstGalleryDone = buildWithResolvedIds(galleryValues, (leaf) => before("galleries")(leaf) || leaf.id === "media.gallery.gallery-1.guided_completion");
  assert.deepEqual(buildDesignerAiNextStep(snapshotFor(firstGalleryDone, galleryValues)).leafIds,
    ["media.gallery.gallery-2.guided_completion"]);
});
