import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveTemplatePreviewSource,
  resolveTemplatePreviewRuntimeState,
} from "./preview.js";
import { buildPreviewOperationsForField } from "./previewLivePatch.js";
import { createRepresentativeTemplateFixture } from "./templatePreviewPersonalizationFixtures.mjs";

test("preview runtime keeps previewUrl as metadata but never activates an external iframe path", () => {
  const template = createRepresentativeTemplateFixture({
    previewUrl: "https://preview.example.com/boda-floral",
  });

  const source = resolveTemplatePreviewSource(template);
  const runtime = resolveTemplatePreviewRuntimeState({
    template,
    previewHtml: null,
    previewStatus: { status: "ready" },
  });

  assert.deepEqual(source, {
    mode: "url",
    previewUrl: "https://preview.example.com/boda-floral",
  });
  assert.equal(runtime.sourceMode, "generated");
  assert.equal(runtime.activeMode, "none");
  assert.equal(runtime.shouldShowPreviewUrl, false);
  assert.equal(runtime.shouldShowGeneratedPreview, false);
  assert.equal(runtime.hasPreviewUrl, true);
  assert.equal(runtime.canPatchPreview, false);
  assert.equal(runtime.canCaptureTextPositions, false);
  assert.equal(runtime.shouldShowMissingPreviewState, true);
});

test("preview runtime exposes generated preview capabilities when HTML is ready", () => {
  const template = createRepresentativeTemplateFixture();
  const runtime = resolveTemplatePreviewRuntimeState({
    template,
    previewHtml: "<html><body>preview</body></html>",
    previewStatus: { status: "ready" },
  });

  assert.equal(runtime.sourceMode, "generated");
  assert.equal(runtime.activeMode, "generated");
  assert.equal(runtime.shouldShowGeneratedPreview, true);
  assert.equal(runtime.shouldShowPreviewUrl, false);
  assert.equal(runtime.canPatchPreview, true);
  assert.equal(runtime.canCaptureTextPositions, true);
  assert.equal(runtime.shouldShowLoadingState, false);
  assert.equal(runtime.shouldShowMissingPreviewState, false);
});

test("generated preview only emits DOM-patchable operations from the shared personalization plan", () => {
  const template = createRepresentativeTemplateFixture();

  const textFallbackOperations = buildPreviewOperationsForField({
    template,
    fieldKey: "welcome_copy",
    value: "Celebremos juntos",
    phase: "blur",
  });
  const rsvpOperations = buildPreviewOperationsForField({
    template,
    fieldKey: "rsvp_title",
    value: "Avisanos si venis",
    phase: "input",
  });

  assert.deepEqual(textFallbackOperations, [
    {
      scope: "global",
      mode: "replaceTextGlobal",
      fieldKey: "welcome_copy",
      find: "Nos vemos pronto",
      replace: "Celebremos juntos",
    },
  ]);
  assert.deepEqual(rsvpOperations, []);
});
