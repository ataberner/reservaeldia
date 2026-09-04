import assert from "node:assert/strict";
import test from "node:test";

import { buildTemplateFormState } from "./formModel.js";

test("template form keeps explicit data-only fields and missing-target legacy fields", () => {
  const state = buildTemplateFormState({
    fieldsSchema: [
      {
        key: "story_text",
        label: "Historia",
        type: "textarea",
        group: "Datos principales",
        applyTargets: [],
      },
      {
        key: "legacy_title",
        label: "Titulo legacy",
        type: "text",
        group: "Datos principales",
      },
    ],
    defaults: {
      story_text: "Historia guardada",
      legacy_title: "Titulo",
    },
  });

  assert.deepEqual(
    state.fields.map((field) => field.key),
    ["story_text", "legacy_title"]
  );
  assert.deepEqual(state.fields[0].applyTargets, []);
  assert.equal(
    Object.prototype.hasOwnProperty.call(state.fields[1], "applyTargets"),
    false
  );
});
