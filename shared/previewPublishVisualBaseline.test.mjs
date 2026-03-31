import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildPreviewPublishVisualBaselineManifest,
  PREVIEW_PUBLISH_VISUAL_BASELINE_ALLOWED_WARNING_CODES,
  PREVIEW_PUBLISH_VISUAL_BASELINE_REQUIRED_VIEWS,
  previewPublishVisualBaselineCaseIds,
  previewPublishVisualBaselineFixtures,
} from "./previewPublishVisualBaselineFixtures.mjs";

test("visual baseline fixtures keep the required case ids frozen", () => {
  assert.deepEqual(previewPublishVisualBaselineCaseIds, [
    "simple-pantalla-section",
    "decorative-fullbleed",
    "text-with-decoration-behind",
    "gallery",
    "countdown",
    "mixed-fijo-pantalla",
  ]);
  assert.equal(new Set(previewPublishVisualBaselineCaseIds).size, 6);
});

test("visual baseline fixtures require the same capture views for every case", () => {
  for (const fixture of previewPublishVisualBaselineFixtures) {
    assert.deepEqual(fixture.requiredViews, [
      ...PREVIEW_PUBLISH_VISUAL_BASELINE_REQUIRED_VIEWS,
    ]);
    assert.deepEqual(fixture.requiredViews, [
      "canvas-editor",
      "preview-desktop-frame",
      "preview-mobile-frame",
      "publish-desktop",
      "publish-mobile",
    ]);
    assert.equal(Array.isArray(fixture.focusCheckpoints), true);
    assert.equal(fixture.focusCheckpoints.length > 0, true);
    assert.equal(Boolean(fixture.sourceFixture), true);
    assert.equal(Boolean(fixture.expectedParityMode), true);
  }
});

test("visual baseline fixtures only tolerate currently accepted warning codes", () => {
  const allowedWarningCodes = new Set(
    PREVIEW_PUBLISH_VISUAL_BASELINE_ALLOWED_WARNING_CODES
  );

  for (const fixture of previewPublishVisualBaselineFixtures) {
    for (const code of fixture.acceptedWarningCodes) {
      assert.equal(
        allowedWarningCodes.has(code),
        true,
        `Unexpected warning code tolerated by ${fixture.id}: ${code}`
      );
    }
  }
});

test("visual baseline manifest stays in sync with the committed fixture catalog", () => {
  const manifestPath = new URL(
    "../artifacts/preview-publish-baseline/manifest.json",
    import.meta.url
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  assert.deepEqual(manifest, buildPreviewPublishVisualBaselineManifest());
});
