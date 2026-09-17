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
    "fixed-reflow-centered-gallery-side-object",
    "countdown",
    "mixed-fijo-pantalla",
    "fixed-reflow-columns",
    "fixed-reflow-title-visual-columns",
    "fixed-reflow-overlap-stacking",
    "fixed-reflow-aquarelle-countdown-overlap",
    "fixed-overflow-expansion",
    "grouped-cta-fixed-section",
    "group-nested-children",
    "fixed-fullbleed-mixed-lanes",
    "pantalla-ynorm-positioning",
    "pantalla-composition-related-text",
  ]);
  assert.equal(new Set(previewPublishVisualBaselineCaseIds).size, 19);
});

test("fixed overlap fixture freezes two exclusive backing and foreground units", () => {
  const fixture = previewPublishVisualBaselineFixtures.find(
    (entry) => entry.id === "fixed-reflow-overlap-stacking"
  );
  assert.ok(fixture);
  const ids = fixture.publishDraft.objetos.map((object) => object.id);
  assert.deepEqual(ids, [
    "overlap-card-backing",
    "overlap-card-copy",
    "overlap-card-detail",
    "overlap-second-card-backing",
    "overlap-second-card-copy",
    "overlap-second-card-detail",
  ]);
  assert.equal(fixture.publishDraft.objetos[0].zIndex, 1);
  assert.equal(fixture.publishDraft.objetos[1].zIndex, 2);
  assert.equal(fixture.publishDraft.objetos[2].zIndex, 2);
  assert.equal(fixture.publishDraft.objetos[3].zIndex, 1);
  assert.equal(fixture.publishDraft.objetos[4].zIndex, 2);
  assert.equal(fixture.publishDraft.objetos[5].zIndex, 2);
});

test("Aquarelle overlap fixture freezes the production Countdown and image geometry", () => {
  const fixture = previewPublishVisualBaselineFixtures.find(
    (entry) => entry.id === "fixed-reflow-aquarelle-countdown-overlap"
  );
  assert.ok(fixture);
  assert.equal(fixture.publishDraft.secciones.length, 1);
  assert.equal(fixture.publishDraft.secciones[0].altura, 249);
  assert.equal(fixture.publishDraft.secciones[0].altoModo, "fijo");
  assert.deepEqual(
    fixture.publishDraft.objetos.map((object) => object.id),
    [
      "aquarelle-countdown",
      "aquarelle-image-rotated",
      "aquarelle-image-left",
    ]
  );
  assert.equal(fixture.publishDraft.objetos[0].countdownSchemaVersion, 2);
  assert.equal(fixture.publishDraft.objetos[1].rotation, 40.495975179163324);
  assert.deepEqual(
    fixture.publishDraft.objetos.map(({ x, y, width, height }) => ({
      x,
      y,
      width,
      height,
    })),
    [
      { x: 200, y: 85.632, width: 400, height: 90 },
      {
        x: 238.964,
        y: 30.288,
        width: 136.64303617309125,
        height: 131.09191282856193,
      },
      {
        x: 79.815,
        y: 65.915,
        width: 151.16470991069377,
        height: 129.43478286103158,
      },
    ]
  );
});

test("fixed centered Gallery fixture freezes the centered-lateral regression shape", () => {
  const fixture = previewPublishVisualBaselineFixtures.find(
    (entry) => entry.id === "fixed-reflow-centered-gallery-side-object"
  );
  assert.ok(fixture);
  const gallery = fixture.publishDraft.objetos.find((object) => object.id === "gallery-main");
  const ornament = fixture.publishDraft.objetos.find(
    (object) => object.id === "centered-gallery-side-ornament"
  );
  assert.ok(gallery);
  assert.ok(ornament);
  assert.equal(gallery.x + gallery.width / 2, 400);
  assert.equal(gallery.cells.length, 2);
  assert.equal(ornament.x > 400, true);
  assert.equal(gallery.y, ornament.y);
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
