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
    "edge-decorations-pantalla",
    "section-wave-dividers",
    "simple-pantalla-section",
    "decorative-fullbleed",
    "text-with-decoration-behind",
    "gallery",
    "countdown",
    "mixed-fijo-pantalla",
    "fixed-reflow-columns",
    "fixed-reflow-title-visual-columns",
    "fixed-overflow-expansion",
    "grouped-cta-fixed-section",
    "group-nested-children",
    "fixed-fullbleed-mixed-lanes",
    "pantalla-ynorm-positioning",
    "pantalla-composition-related-text",
  ]);
  assert.equal(new Set(previewPublishVisualBaselineCaseIds).size, 16);
});

test("fixed reflow heading fixture freezes inferred composition relationships", () => {
  const fixture = previewPublishVisualBaselineFixtures.find(
    (entry) => entry.id === "fixed-reflow-title-visual-columns"
  );
  assert.ok(fixture);
  const ids = fixture.publishDraft.objetos.map((object) => object.id);
  assert.deepEqual(ids.slice(0, 2), ["where-title", "where-subtitle"]);
  assert.equal(ids.includes("ceremony-icon"), true);
  assert.equal(ids.includes("ceremony-place"), true);
  assert.equal(ids.includes("party-icon"), true);
  assert.equal(ids.includes("party-place"), true);
});

test("fixed reflow columns fixture freezes wide text boxes with weak gutter overlap", () => {
  const fixture = previewPublishVisualBaselineFixtures.find(
    (entry) => entry.id === "fixed-reflow-columns"
  );
  assert.ok(fixture);
  const objects = fixture.publishDraft.objetos;
  assert.equal(objects.length, 10);
  assert.equal(objects.every((object) => object.tipo === "texto"), true);
  assert.equal(objects.every((object) => object.width === 360), true);

  const left = objects.filter((object) => object.id.startsWith("mobile-column-left-"));
  const right = objects.filter((object) => object.id.startsWith("mobile-column-right-"));
  assert.equal(left.length, 5);
  assert.equal(right.length, 5);
  assert.ok(Math.max(...left.map((object) => object.x + object.width)) > 400);
  assert.ok(Math.min(...right.map((object) => object.x)) < 400);
  assert.ok(
    Math.min(...right.map((object) => object.x + object.width / 2)) -
      Math.max(...left.map((object) => object.x + object.width / 2)) >
      300
  );
});

test("pantalla composition fixture freezes the real no-width related text geometry", () => {
  const fixture = previewPublishVisualBaselineFixtures.find(
    (entry) => entry.id === "pantalla-composition-related-text"
  );
  assert.ok(fixture);
  assert.equal(fixture.publishDraft.secciones[0].altoModo, "pantalla");
  assert.deepEqual(
    fixture.publishDraft.objetos.map((object) => ({
      id: object.id,
      y: object.y,
      yNorm: object.yNorm,
      width: object.width,
    })),
    [
      {
        id: "pantalla-composition-title",
        y: 302.6077543409347,
        yNorm: 0.6052155086818695,
        width: undefined,
      },
      {
        id: "pantalla-composition-names",
        y: 387.8768467071258,
        yNorm: 0.7757536934142516,
        width: undefined,
      },
    ]
  );
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
