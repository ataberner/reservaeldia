import test from "node:test";
import assert from "node:assert/strict";
import contractRuntime from "./designerAiCapabilityContract.cjs";
import {
  DESIGNER_AI_ACTION_ORIGINS,
  DESIGNER_AI_CONTRACT_VERSION,
  DESIGNER_AI_MODEL_ACTION_TYPES,
  DESIGNER_AI_TRUSTED_CONTROL_ACTION_TYPES,
  containsForbiddenSnapshotData,
  discardRedundantDesignerAiControlResolutions,
  sanitizeCapabilitySnapshot,
  validateDesignerAiActionBatch,
  validateDesignerAiControlRequest,
  validateDesignerAiResolutionUpdates,
} from "./designerAiCapabilityContract.js";

const snapshot = sanitizeCapabilitySnapshot({
  revision: "rev-1",
  availability: Object.fromEntries([
    "documentName", "people", "eventMode", "ceremonyDatetime", "partyDatetime",
    "ceremonyLocation", "partyLocation", "dressCode", "story", "cover", "gallery",
    "rsvp", "gifts",
  ].map((key) => [key, true])),
  values: {
    galleries: [{ id: "gallery-1", slots: [{ cellId: "cell-a", index: 0, occupied: true }, { cellId: "cell-b", index: 1, occupied: false }] }],
    rsvp: {
      questions: [{ id: "attendance", type: "single_select", options: [{ id: "yes", label: "Sí" }] }],
    },
  },
});

function controlResolutionSnapshot() {
  const ids = [
    "event.people.primary_name", "event.mode", "event.ceremony.date", "rsvp.enabled",
    "gifts.enabled", "gifts.method.alias.visible", "gifts.method.alias.value",
    "gifts.method.cbu.value", "media.cover", "media.gallery.gallery-1.guided_completion",
    "media.gallery.gallery-1.slot.cell-a", "media.gallery.gallery-1.order",
    ...["ceremony", "party"].flatMap((phase) =>
      ["venue_name", "address", "place_selection"].map((field) => `event.${phase}.${field}`)),
  ];
  return sanitizeCapabilitySnapshot({ ...snapshot, ledger: { leaves: ids.map((id) => ({
    id, status: "pending", provenance: "unknown", fingerprint: id,
  })) } });
}

test("requires_control is offered and validated only for leaves with an existing local control", () => {
  const initial = controlResolutionSnapshot();
  const tool = contractRuntime.buildDesignerAiTool(initial);
  for (const leaf of initial.ledger.leaves) {
    const supported = leaf.id === "media.cover" ||
      leaf.id === "media.gallery.gallery-1.guided_completion" ||
      leaf.id === "media.gallery.gallery-1.slot.cell-a" ||
      /^event\.(ceremony|party)\.(venue_name|address|place_selection)$/.test(leaf.id);
    const resolution = { leafId: leaf.id, status: "requires_control", rule: null };
    assert.equal(validateDesignerAiResolutionUpdates([resolution], initial).ok, supported, leaf.id);
    const schemaAllowsControl = tool.parameters.properties.resolutions.items.anyOf.some((branch) => {
      const definition = branch.properties.leafId.$ref.split("/").at(-1);
      return tool.parameters.$defs[definition].enum.includes(leaf.id) &&
        branch.properties.status.enum?.includes("requires_control");
    });
    assert.equal(schemaAllowsControl, supported, `schema: ${leaf.id}`);
  }
});

test("redundant unsupported control resolutions are dropped without confirming a proposal", () => {
  const initial = controlResolutionSnapshot();
  const original = structuredClone(initial);
  const actions = [
    { type: "gifts.set_enabled", arguments: { enabled: true } },
    { type: "gifts.set_method", arguments: { method: "alias", value: "SYNTHETIC.ALIAS", visible: true } },
  ];
  const redundant = ["gifts.enabled", "gifts.method.alias.visible", "gifts.method.alias.value"]
    .map((leafId) => ({ leafId, status: "requires_control", rule: null }));
  assert.equal(validateDesignerAiResolutionUpdates(redundant, initial, { actions }).ok, false);
  assert.deepEqual(discardRedundantDesignerAiControlResolutions(redundant, initial, { actions }), []);
  assert.deepEqual(initial, original, "normalization cannot write values, evidence or state");
  assert.equal(redundant.length, 3, "provider result is preserved for diagnostics");
});

test("control normalization preserves malformed, unrelated, unavailable and valid control resolutions", () => {
  const initial = controlResolutionSnapshot();
  const action = { type: "gifts.set_method", arguments: { method: "alias", value: "SYNTHETIC.ALIAS", visible: true } };
  const redundant = { leafId: "gifts.method.alias.value", status: "requires_control", rule: null };
  const preserved = [
    { ...redundant, extra: true }, { ...redundant, rule: "keep_existing" },
    { ...redundant, leafId: "unknown.leaf" }, { ...redundant, leafId: "gifts.method.cbu.value" },
    { ...redundant, status: "needs_clarification" }, { ...redundant, status: "deferred_by_user" },
    { ...redundant, leafId: "media.cover" },
    { ...redundant, leafId: "event.ceremony.address" },
    { ...redundant, leafId: "media.gallery.gallery-1.guided_completion" },
    null,
  ];
  assert.deepEqual(discardRedundantDesignerAiControlResolutions([redundant, ...preserved], initial, { actions: [action] }), preserved);
  assert.deepEqual(discardRedundantDesignerAiControlResolutions([redundant], initial), [redundant]);
  for (const actions of [
    [{ ...action, arguments: { ...action.arguments, visible: null } }],
    [action, { type: "unsupported.action", arguments: {} }],
    [{ ...action, arguments: { ...action.arguments, value: null } }],
  ]) {
    assert.deepEqual(discardRedundantDesignerAiControlResolutions([redundant], initial, { actions }), [redundant]);
  }
  const unavailable = structuredClone(initial);
  unavailable.ledger.leaves.find((leaf) => leaf.id === redundant.leafId).status = "unavailable";
  assert.deepEqual(discardRedundantDesignerAiControlResolutions([redundant], unavailable, { actions: [action] }), [redundant]);
  const locationAction = { type: "event.set_location_text", arguments: { phase: "ceremony", venueName: "", address: "Synthetic address" } };
  const addressControl = { ...redundant, leafId: "event.ceremony.address" };
  assert.equal(validateDesignerAiActionBatch([locationAction], { origin: "model", snapshot: initial }).ok, true);
  assert.deepEqual(discardRedundantDesignerAiControlResolutions([addressControl], initial, { actions: [locationAction] }), [addressControl]);
});

test("inactive phase normalization leaves the raw semantic validator strict", () => {
  const initial = sanitizeCapabilitySnapshot({
    ...snapshot, values: { eventMode: "ceremony_party" },
    ledger: { leaves: [
      { id: "event.mode", status: "pending", provenance: "unknown", fingerprint: "mode" },
      { id: "event.party.end_time", status: "pending", provenance: "unknown", fingerprint: "end" },
    ] },
  });
  const resolutions = [{ leafId: "event.party.end_time", status: "resolved_by_rule", rule: "optional_end_time_omitted" }];
  const actions = [{ type: "event.set_mode", arguments: { mode: "single" } }];
  assert.match(validateDesignerAiResolutionUpdates(resolutions, initial, { actions }).errors.join(" "), /Party no está activo/);
  const normalized = contractRuntime.discardInactiveDesignerAiPhaseResolutions(resolutions, initial, { actions });
  assert.deepEqual(normalized, []);
  assert.equal(validateDesignerAiResolutionUpdates(normalized, initial, { actions }).ok, true);
  assert.equal(resolutions.length, 1);
});

test("phase normalization does not generalize to RSVP, Gifts, Dress Code or Gallery dependencies", () => {
  const ids = ["rsvp.modal.title", "rsvp.question.attendance.options", "gifts.method.alias.value", "event.dress_code.value", "media.gallery.gallery-1.order"];
  const initial = sanitizeCapabilitySnapshot({
    ...snapshot, values: { eventMode: "single", rsvp: { enabled: false }, gifts: { enabled: false }, dressCode: { enabled: false } },
    ledger: { leaves: [
      { id: "event.mode", status: "resolved_from_user", provenance: "user_current_session", fingerprint: "mode" },
      ...ids.map((id) => ({ id, status: "not_applicable_by_dependency", provenance: "automatic_rule", rule: "parent_inactive", fingerprint: id })),
    ] },
  });
  const resolutions = ids.map((leafId) => ({ leafId, status: "resolved_by_rule", rule: "keep_existing" }));
  assert.deepEqual(contractRuntime.discardInactiveDesignerAiPhaseResolutions(resolutions, initial), resolutions);
  assert.equal(validateDesignerAiResolutionUpdates(resolutions, initial).ok, false);
});

test("the versioned allowlist keeps model and trusted-control actions disjoint", () => {
  assert.equal(DESIGNER_AI_CONTRACT_VERSION, "2.3.0");
  assert.equal(new Set([...DESIGNER_AI_MODEL_ACTION_TYPES, ...DESIGNER_AI_TRUSTED_CONTROL_ACTION_TYPES]).size,
    DESIGNER_AI_MODEL_ACTION_TYPES.length + DESIGNER_AI_TRUSTED_CONTROL_ACTION_TYPES.length);
});

test("calendar validation rejects impossible dates, including non-leap February", () => {
  for (const [date, valid] of [["2027-99-99", false], ["2027-02-29", false], ["2028-02-29", true], ["2100-02-29", false], ["2027-04-31", false], ["2027-05-10", true]]) {
    assert.equal(validateDesignerAiActionBatch([{ type: "event.set_datetime", arguments: { phase: "ceremony", date, startTime: null, endTime: null } }], { origin: DESIGNER_AI_ACTION_ORIGINS.MODEL, snapshot }).ok, valid, date);
  }
});

test("Gallery control rejects nonexistent indices and inconsistent cell-id/index pairs", () => {
  for (const [cellId, cellIndex, valid] of [[null, 999, false], ["cell-a", 1, false], ["cell-a", -1, false], ["missing", 0, false], ["cell-b", 1, true], [null, 0, true]]) {
    assert.equal(validateDesignerAiControlRequest({ type: "gallery_cell_upload", galleryId: "gallery-1", cellId, cellIndex }, snapshot).ok, valid);
  }
  assert.equal(validateDesignerAiActionBatch([{ type: "gallery.move_photo", arguments: { galleryId: "gallery-1", sourceCellId: "cell-a", sourceIndex: 1, targetCellId: "cell-b", targetIndex: 0 } }], { origin: DESIGNER_AI_ACTION_ORIGINS.MODEL, snapshot }).ok, false);
});

test("Party respects the effective sequential mode for actions and controls", () => {
  const mode = (mode) => ({ type: "event.set_mode", arguments: { mode } });
  const party = { type: "event.set_datetime", arguments: { phase: "party", date: "2027-05-10", startTime: null, endTime: null } };
  const validate = (actions) => validateDesignerAiActionBatch(actions, { origin: DESIGNER_AI_ACTION_ORIGINS.MODEL, snapshot }).ok;
  assert.equal(validate([party, mode("ceremony_party")]), false);
  assert.equal(validate([mode("ceremony_party"), party]), true);
  assert.equal(validate([mode("ceremony_party"), mode("single"), party]), false);
  const control = { type: "google_place_picker", phase: "party" };
  assert.equal(validateDesignerAiControlRequest(control, snapshot).ok, false);
  assert.equal(validateDesignerAiControlRequest(control, snapshot, { actions: [mode("ceremony_party")] }).ok, true);
  assert.equal(validateDesignerAiControlRequest(control, snapshot, { actions: [mode("ceremony_party"), mode("single")] }).ok, false);
});

test("accepts a valid multi-action model batch against the current snapshot", () => {
  const result = validateDesignerAiActionBatch([
    { type: "document.set_name", arguments: { name: "Boda de Ana y Luz" } },
    { type: "event.set_datetime", arguments: { phase: "ceremony", date: "2027-04-10", startTime: "18:30", endTime: null } },
    { type: "gallery.move_photo", arguments: { galleryId: "gallery-1", sourceCellId: "cell-a", sourceIndex: 0, targetCellId: "cell-b", targetIndex: 1 } },
  ], { origin: DESIGNER_AI_ACTION_ORIGINS.MODEL, snapshot });

  assert.deepEqual(result, { ok: true, errors: [] });
});

test("rejects generic canvas mutation, unknown IDs and trusted controls from the model", () => {
  for (const action of [
    { type: "canvas.update_object", arguments: { id: "x", x: 20 } },
    { type: "gallery.move_photo", arguments: { galleryId: "missing", sourceCellId: null, sourceIndex: 0, targetCellId: null, targetIndex: 1 } },
    { type: "media.replace_cover", arguments: {} },
  ]) {
    const result = validateDesignerAiActionBatch([action], {
      origin: DESIGNER_AI_ACTION_ORIGINS.MODEL,
      snapshot,
    });
    assert.equal(result.ok, false);
  }
});

test("trusted controls validate their local target without accepting media metadata", () => {
  assert.equal(validateDesignerAiControlRequest({
    type: "gallery_cell_upload",
    galleryId: "gallery-1",
    cellId: "cell-b",
    cellIndex: 1,
  }, snapshot).ok, true);

  assert.equal(validateDesignerAiControlRequest({
    type: "gallery_cell_upload",
    galleryId: "gallery-1",
    cellId: "missing",
    cellIndex: 1,
    url: "https://should-not-pass.example",
  }, snapshot).ok, false);
});

test("snapshot sanitizer emits a minimal shape and strips canvas, urls and geometry", () => {
  const raw = {
    revision: "x",
    availability: { story: true },
    values: {
      story: "Hola",
      objetos: [{ id: "secret" }],
      galleries: [{ id: "g", x: 10, slots: [{ index: 0, mediaUrl: "https://secret", occupied: true }] }],
    },
  };
  assert.equal(containsForbiddenSnapshotData(raw), true);

  const safe = sanitizeCapabilitySnapshot(raw);
  assert.equal(containsForbiddenSnapshotData(safe), false);
  assert.equal(safe.values.story, "Hola");
  assert.deepEqual(safe.values.galleries[0], {
    id: "g",
    slots: [{ cellId: null, index: 0, occupied: true, contentRevision: "" }],
  });
});

test("validates leaf resolutions against the current ledger", () => {
  const ledgerSnapshot = sanitizeCapabilitySnapshot({
    ...snapshot,
    ledger: {
      version: 1,
      leaves: [
        {
          id: "event.people.primary_name",
          block: "couple",
          status: "pending",
          provenance: "unknown",
          rule: null,
          fingerprint: "fp-1",
        },
        {
          id: "media.gallery.gallery-1.guided_completion",
          block: "galleries",
          status: "requires_control",
          provenance: "unknown",
          rule: null,
          fingerprint: "fp-gallery-1",
        },
      ],
    },
  });
  assert.equal(validateDesignerAiResolutionUpdates([{
    leafId: "event.people.primary_name",
    status: "resolved_from_user",
    rule: null,
  }], ledgerSnapshot).ok, true);
  assert.equal(validateDesignerAiResolutionUpdates([{
    leafId: "event.people",
    status: "resolved_from_user",
    rule: null,
  }], ledgerSnapshot).ok, false);
  assert.equal(validateDesignerAiResolutionUpdates([{
    leafId: "event.people.primary_name",
    status: "resolved_by_rule",
    rule: "not_a_real_rule",
  }], ledgerSnapshot).ok, false);
  assert.equal(validateDesignerAiResolutionUpdates([{
    leafId: "event.people.primary_name",
    status: "resolved_by_rule",
    rule: "optional_end_time_omitted",
  }], ledgerSnapshot).ok, false);
  assert.equal(validateDesignerAiResolutionUpdates([{
    leafId: "media.gallery.gallery-1.guided_completion",
    status: "requires_control",
    rule: null,
  }], ledgerSnapshot).ok, true);
  assert.equal(validateDesignerAiResolutionUpdates([{
    leafId: "media.gallery.gallery-1.guided_completion",
    status: "resolved_from_user",
    rule: null,
  }], ledgerSnapshot).ok, false);
});

test("party edits require ceremony_party now or in the same validated batch", () => {
  const partySnapshot = sanitizeCapabilitySnapshot({
    ...snapshot,
    availability: { ...snapshot.availability, partyDatetime: true },
    values: { ...snapshot.values, eventMode: "single" },
  });
  const partyDate = {
    type: "event.set_datetime",
    arguments: { phase: "party", date: "2027-04-10", startTime: "22:00", endTime: null },
  };
  assert.equal(validateDesignerAiActionBatch([partyDate], {
    origin: DESIGNER_AI_ACTION_ORIGINS.MODEL,
    snapshot: partySnapshot,
  }).ok, false);
  assert.equal(validateDesignerAiActionBatch([
    { type: "event.set_mode", arguments: { mode: "ceremony_party" } },
    partyDate,
  ], {
    origin: DESIGNER_AI_ACTION_ORIGINS.MODEL,
    snapshot: partySnapshot,
  }).ok, true);
  assert.equal(validateDesignerAiActionBatch([
    { type: "event.set_mode", arguments: { mode: "ceremony_party" } },
    partyDate,
    { type: "event.set_mode", arguments: { mode: "single" } },
  ], {
    origin: DESIGNER_AI_ACTION_ORIGINS.MODEL,
    snapshot: partySnapshot,
  }).ok, false);
});

test("validates RSVP option mutations in deterministic batch order", () => {
  const rsvpSnapshot = sanitizeCapabilitySnapshot({
    revision: "rsvp-rev",
    availability: { rsvp: true },
    values: {
      rsvp: {
        questions: [{
          id: "custom_1",
          type: "short_text",
          options: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
        }],
      },
    },
  });
  assert.equal(validateDesignerAiActionBatch([
    { type: "rsvp.update_question", arguments: { questionId: "custom_1", label: null, questionType: "single_select", required: null } },
    { type: "rsvp.add_option", arguments: { questionId: "custom_1", label: "C" } },
  ], {
    origin: DESIGNER_AI_ACTION_ORIGINS.MODEL,
    snapshot: rsvpSnapshot,
  }).ok, true);
  assert.equal(validateDesignerAiActionBatch([
    { type: "rsvp.remove_option", arguments: { questionId: "custom_1", optionId: "a" } },
    { type: "rsvp.remove_option", arguments: { questionId: "custom_1", optionId: "b" } },
  ], {
    origin: DESIGNER_AI_ACTION_ORIGINS.MODEL,
    snapshot: rsvpSnapshot,
  }).ok, false);
  assert.equal(validateDesignerAiActionBatch([{
    type: "rsvp.move_question",
    arguments: { questionId: "custom_1", targetQuestionId: "custom_1", placement: "before" },
  }], {
    origin: DESIGNER_AI_ACTION_ORIGINS.MODEL,
    snapshot: rsvpSnapshot,
  }).ok, false);
});

test("RSVP remains callable for an explicit supported request", () => {
  const result = validateDesignerAiActionBatch([{
    type: "rsvp.set_enabled",
    arguments: { enabled: true },
  }], {
    origin: DESIGNER_AI_ACTION_ORIGINS.MODEL,
    snapshot,
  });
  assert.deepEqual(result, { ok: true, errors: [] });
});

test("gift-list snapshot reveals presence but not its URL and visibility-only actions preserve value", () => {
  const safe = sanitizeCapabilitySnapshot({
    revision: "gift-rev",
    availability: { gifts: true },
    values: {
      gifts: {
        enabled: true,
        methods: {
          giftListLink: {
            value: "https://private.example/list",
            visible: true,
          },
        },
      },
    },
  });
  assert.deepEqual(safe.values.gifts.methods.giftListLink, {
    value: "",
    visible: true,
    configured: true,
  });
  assert.equal(JSON.stringify(safe).includes("private.example"), false);
  assert.equal(validateDesignerAiActionBatch([{
    type: "gifts.set_method",
    arguments: { method: "giftListLink", value: null, visible: false },
  }], {
    origin: DESIGNER_AI_ACTION_ORIGINS.MODEL,
    snapshot: safe,
  }).ok, true);
  assert.equal(validateDesignerAiActionBatch([
    { type: "gifts.set_enabled", arguments: { enabled: false } },
    { type: "gifts.set_button_text", arguments: { text: "Ver regalos" } },
  ], {
    origin: DESIGNER_AI_ACTION_ORIGINS.MODEL,
    snapshot: safe,
  }).ok, false);
});
