import assert from "node:assert/strict";
import test from "node:test";

import {
  DRAFT_SOURCE_OF_TRUTH_VERSION,
  normalizeDraftTemplateInput,
} from "./sourceOfTruth.js";

test("draft template input v2 keeps explicit empty field values and structured extras", () => {
  const normalized = normalizeDraftTemplateInput({
    fieldsSchema: [
      { key: "story_text", type: "textarea" },
      { key: "gallery_images", type: "images" },
      { key: "event_name", type: "text" },
    ],
    defaults: {
      story_text: "Historia base",
      gallery_images: ["default.jpg"],
      event_name: "Evento base",
    },
    templateInput: {
      policyVersion: 1,
      initialValues: {
        story_text: "Historia inicial",
        gallery_images: ["initial.jpg"],
        event_name: "Evento inicial",
        __eventDetails: {
          locations: { ceremony: { address: "Inicial 123" } },
        },
      },
      values: {
        story_text: "",
        gallery_images: [],
        __eventDetails: {
          locations: { ceremony: { address: "Actual 456" } },
        },
      },
    },
  });

  assert.equal(DRAFT_SOURCE_OF_TRUTH_VERSION, 2);
  assert.equal(normalized.policyVersion, 2);
  assert.equal(normalized.values.story_text, "");
  assert.deepEqual(normalized.values.gallery_images, []);
  assert.equal(normalized.values.event_name, "Evento inicial");
  assert.deepEqual(normalized.values.__eventDetails, {
    locations: { ceremony: { address: "Actual 456" } },
  });
  assert.deepEqual(normalized.changedKeys, [
    "story_text",
    "gallery_images",
    "event_name",
  ]);
});

test("draft template input carries structured extras through per-field fallback", () => {
  const normalized = normalizeDraftTemplateInput({
    fieldsSchema: [{ key: "story_text", type: "textarea" }],
    defaults: { story_text: "Base" },
    fallbackValues: {
      story_text: "Legacy",
      __eventDetails: {
        locations: { party: { address: "Fiesta 789" } },
      },
    },
  });

  assert.equal(normalized.values.story_text, "Legacy");
  assert.deepEqual(normalized.values.__eventDetails, {
    locations: { party: { address: "Fiesta 789" } },
  });
});
