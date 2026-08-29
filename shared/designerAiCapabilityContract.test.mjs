import test from "node:test";
import assert from "node:assert/strict";
import {
  DESIGNER_AI_ACTION_ORIGINS,
  DESIGNER_AI_CONTRACT_VERSION,
  DESIGNER_AI_MODEL_ACTION_TYPES,
  DESIGNER_AI_TRUSTED_CONTROL_ACTION_TYPES,
  containsForbiddenSnapshotData,
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

test("the versioned allowlist keeps model and trusted-control actions disjoint", () => {
  assert.equal(DESIGNER_AI_CONTRACT_VERSION, "2.2.0");
  assert.equal(new Set([...DESIGNER_AI_MODEL_ACTION_TYPES, ...DESIGNER_AI_TRUSTED_CONTROL_ACTION_TYPES]).size,
    DESIGNER_AI_MODEL_ACTION_TYPES.length + DESIGNER_AI_TRUSTED_CONTROL_ACTION_TYPES.length);
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
