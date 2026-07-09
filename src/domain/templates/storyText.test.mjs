import test from "node:test";
import assert from "node:assert/strict";

import {
  ensureStoryTextField,
  getStoryTextFieldKey,
  resolveStoryTextTargetOptions,
  resolveStoryTextSidebarBinding,
  STORY_TEXT_FIELD_LABEL,
} from "./storyText.js";
import { linkElementToField } from "./authoring/model.js";
import { validateAuthoringState } from "./authoring/validation.js";

test("story text field is created with the standard dynamic field metadata", () => {
  const result = ensureStoryTextField({ fieldsSchema: [] });
  const fieldKey = getStoryTextFieldKey();

  assert.equal(result.changed, true);
  assert.equal(result.field.key, fieldKey);
  assert.equal(result.field.label, STORY_TEXT_FIELD_LABEL);
  assert.equal(result.field.type, "textarea");
  assert.equal(result.field.group, "Datos principales");
  assert.equal(result.field.optional, true);
  assert.deepEqual(result.field.applyTargets, []);
  assert.equal(result.fieldsSchema.length, 1);
});

test("story text field repairs the label typo without creating a duplicate field", () => {
  const fieldKey = getStoryTextFieldKey();
  const result = ensureStoryTextField({
    fieldsSchema: [
      {
        key: fieldKey,
        label: "Textto historia",
        type: "text",
        group: "",
        applyTargets: "invalid",
      },
    ],
  });

  assert.equal(result.changed, true);
  assert.equal(result.fieldsSchema.length, 1);
  assert.equal(result.field.key, fieldKey);
  assert.equal(result.field.label, "Texto historia");
  assert.equal(result.field.type, "textarea");
  assert.equal(result.field.group, "Datos principales");
  assert.equal(result.field.optional, true);
  assert.deepEqual(result.field.applyTargets, []);
});

test("story text targets request fixed width word wrapping for text paths", () => {
  const fieldKey = getStoryTextFieldKey();
  assert.deepEqual(
    resolveStoryTextTargetOptions({ key: fieldKey }, "texto"),
    {
      fixedTextBox: true,
      wrapMode: "word",
      defaultToMeasuredWidth: true,
    }
  );
  assert.equal(resolveStoryTextTargetOptions({ key: fieldKey }, "src"), null);
  assert.equal(resolveStoryTextTargetOptions({ key: "otra" }, "texto"), null);
});

test("story text binding uses the linked canvas text and validates as a regular dynamic field", () => {
  const fieldKey = getStoryTextFieldKey();
  const ensured = ensureStoryTextField({ fieldsSchema: [] });
  const linked = linkElementToField({
    fieldsSchema: ensured.fieldsSchema,
    fieldKey,
    elementId: "story-copy",
    path: "texto",
  });
  const fieldsSchema = linked.fieldsSchema;
  const defaults = {
    [fieldKey]: "Historia default",
  };
  const objetos = [
    {
      id: "story-copy",
      tipo: "texto",
      texto: "Texto desde canvas\r\nsegunda linea",
    },
  ];

  const binding = resolveStoryTextSidebarBinding({
    fieldsSchema,
    defaults,
    objetos,
  });
  const status = validateAuthoringState({
    fieldsSchema,
    defaults,
    objetos,
  });

  assert.equal(binding.hasBinding, true);
  assert.equal(binding.fieldKey, fieldKey);
  assert.equal(binding.objectId, "story-copy");
  assert.equal(binding.value, "Texto desde canvas\nsegunda linea");
  assert.equal(status.isReady, true);
  assert.deepEqual(status.issues, []);
});

test("story text sidebar binding stays hidden when no text object is linked", () => {
  const fieldKey = getStoryTextFieldKey();
  const ensured = ensureStoryTextField({ fieldsSchema: [] });

  assert.deepEqual(
    resolveStoryTextSidebarBinding({
      fieldsSchema: ensured.fieldsSchema,
      defaults: {
        [fieldKey]: "Historia default",
      },
      objetos: [],
    }),
    {
      field: ensured.field,
      fieldKey,
      target: null,
      objectId: "",
      value: "Historia default",
      hasBinding: false,
    }
  );
});
