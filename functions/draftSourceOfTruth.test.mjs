import assert from "node:assert/strict";
import test from "node:test";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const {
  DRAFT_SOURCE_OF_TRUTH_VERSION,
  normalizeDraftTemplateInput,
} = requireBuiltModule("lib/drafts/sourceOfTruth.js");

test("functions draft source-of-truth v2 preserves empty values and structured extras", () => {
  const normalized = normalizeDraftTemplateInput({
    fieldsSchema: [
      { key: "story_text", type: "textarea" },
      { key: "gallery_images", type: "images" },
    ],
    defaults: {
      story_text: "Base",
      gallery_images: ["base.jpg"],
    },
    templateInput: {
      initialValues: {
        story_text: "Inicial",
        gallery_images: ["initial.jpg"],
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
  assert.equal(normalized.values.story_text, "");
  assert.deepEqual(normalized.values.gallery_images, []);
  assert.deepEqual(normalized.values.__eventDetails, {
    locations: { ceremony: { address: "Actual 456" } },
  });
});
