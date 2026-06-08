import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveTemplateAuthoringCapabilities,
} from "./capabilities.js";

test("normal users can use existing template fields without schema authoring", () => {
  assert.deepEqual(
    resolveTemplateAuthoringCapabilities({
      enabled: true,
      canEditSchema: false,
      canUseFields: true,
      sourceTemplateId: "tpl-boda",
    }),
    {
      canEditSchema: false,
      canUseFields: true,
    }
  );
});

test("schema authoring remains available only when explicitly enabled", () => {
  assert.deepEqual(
    resolveTemplateAuthoringCapabilities({
      enabled: true,
      canEditSchema: true,
      canUseFields: true,
      sourceTemplateId: "tpl-boda",
    }),
    {
      canEditSchema: true,
      canUseFields: true,
    }
  );
});

test("field usage stays disabled until the draft is linked to a template", () => {
  assert.deepEqual(
    resolveTemplateAuthoringCapabilities({
      enabled: true,
      canEditSchema: false,
      canUseFields: true,
      sourceTemplateId: "",
    }),
    {
      canEditSchema: false,
      canUseFields: false,
    }
  );
});
