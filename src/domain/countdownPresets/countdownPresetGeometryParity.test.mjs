import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildCountdownCanvasPatchFromPreset } from "./toCanvasPatch.js";
import {
  resolveCountdownEffectiveGeometry,
  resolveCountdownInsertGeometry,
} from "./effectiveGeometry.js";
import functionsMaterialization from "../../../functions/shared/countdownPresetMaterialization.cjs";

const functionsServiceSource = readFileSync(
  new URL("../../../functions/src/countdownPresets/service.ts", import.meta.url),
  "utf8"
);
const frontendMaterializationSource = readFileSync(
  new URL("./toCanvasPatch.js", import.meta.url),
  "utf8"
);
const builderPreviewSource = readFileSync(
  new URL(
    "../../components/admin/countdown/CountdownPresetLivePreview.jsx",
    import.meta.url
  ),
  "utf8"
);

function roundTrip(value) {
  return JSON.parse(JSON.stringify(value));
}

function close(actual, expected, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  );
}

function boundsCenter(bounds) {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

function contentToFrameRatio(geometry) {
  const frame = geometry.visualFrameBounds;
  if (!frame) return null;
  return {
    width: geometry.layoutMetrics.contentBounds.width / frame.width,
    height: geometry.layoutMetrics.contentBounds.height / frame.height,
    numberToFrameWidth: geometry.layoutMetrics.valueSize / frame.width,
  };
}

function assertNormalizedPresetParity(fixture) {
  const serializedFixture = roundTrip(fixture);
  const frontendPatch = buildCountdownCanvasPatchFromPreset(fixture);
  const reloadedFrontendPatch = buildCountdownCanvasPatchFromPreset(
    serializedFixture
  );
  const backendPatch =
    functionsMaterialization.buildCountdownCanvasPatchFromPreset(
      serializedFixture
    );

  assert.deepEqual(reloadedFrontendPatch, frontendPatch);
  assert.deepEqual(backendPatch, frontendPatch);

  const builderGeometry = resolveCountdownInsertGeometry(frontendPatch);
  const reloadedCanvasGeometry = resolveCountdownEffectiveGeometry({
    ...roundTrip(reloadedFrontendPatch),
    width: builderGeometry.width,
    height: builderGeometry.height,
  });

  assert.deepEqual(
    { width: reloadedCanvasGeometry.width, height: reloadedCanvasGeometry.height },
    { width: builderGeometry.width, height: builderGeometry.height }
  );
  assert.deepEqual(
    reloadedCanvasGeometry.layoutMetrics.contentBounds,
    builderGeometry.layoutMetrics.contentBounds
  );
  assert.deepEqual(
    reloadedCanvasGeometry.layoutMetrics.unitLayouts,
    builderGeometry.layoutMetrics.unitLayouts
  );
  assert.deepEqual(
    {
      valueSize: reloadedCanvasGeometry.layoutMetrics.valueSize,
      labelSize: reloadedCanvasGeometry.layoutMetrics.labelSize,
      startX: reloadedCanvasGeometry.layoutMetrics.startX,
      startY: reloadedCanvasGeometry.layoutMetrics.startY,
    },
    {
      valueSize: builderGeometry.layoutMetrics.valueSize,
      labelSize: builderGeometry.layoutMetrics.labelSize,
      startX: builderGeometry.layoutMetrics.startX,
      startY: builderGeometry.layoutMetrics.startY,
    }
  );
  assert.deepEqual(
    reloadedCanvasGeometry.visualFrameBounds,
    builderGeometry.visualFrameBounds
  );
  assert.deepEqual(
    boundsCenter(reloadedCanvasGeometry.selectionBounds),
    boundsCenter(builderGeometry.selectionBounds)
  );
  assert.deepEqual(
    contentToFrameRatio(reloadedCanvasGeometry),
    contentToFrameRatio(builderGeometry)
  );

  if (
    frontendPatch.frameAssetType === "png" &&
    frontendPatch.frameIntrinsicWidth > 0 &&
    frontendPatch.frameIntrinsicHeight > 0
  ) {
    const frameRect = builderGeometry.frameRects[0];
    close(
      frameRect.width / frameRect.height,
      frontendPatch.frameIntrinsicWidth / frontendPatch.frameIntrinsicHeight
    );
  }

  return { patch: frontendPatch, geometry: builderGeometry };
}

const baseTypography = Object.freeze({
  fontFamily: "Poppins",
  numberSize: 28,
  labelSize: 12,
  letterSpacing: 0,
  lineHeight: 1.05,
  labelTransform: "uppercase",
});
const baseColors = Object.freeze({
  numberColor: "#111111",
  labelColor: "#4b5563",
  frameColor: "#773dbe",
});
const noAnimations = Object.freeze({
  entry: "none",
  tick: "none",
  frame: "none",
});
const baseUnit = Object.freeze({
  showLabels: true,
  separator: "",
  boxBg: "transparent",
  boxBorder: "transparent",
  boxRadius: 10,
  boxShadow: false,
});

test("orna_red preserves one normalized geometry from builder through serialized canvas insertion", () => {
  const { patch, geometry } = assertNormalizedPresetParity({
    presetId: "orna-red-saveandpublishsa",
    activeVersion: 1,
    layout: {
      gap: 4.8,
      type: "singleFrame",
      distribution: "vertical",
      chipWidth: null,
      framePadding: 14,
      visibleUnits: ["days", "hours", "minutes"],
      frameScale: 5,
    },
    tipografia: {
      labelSize: 12,
      labelTransform: "uppercase",
      letterSpacing: 0,
      numberSize: 32,
      lineHeight: 1.05,
      fontFamily: "raleway",
    },
    colores: baseColors,
    animaciones: noAnimations,
    unidad: baseUnit,
    tamanoBase: 220,
    svgRef: {
      type: "png",
      mimeType: "image/png",
      downloadUrl: "https://assets.invalid/orna-red.png",
      width: 1165,
      height: 982,
      hasAlpha: true,
      hasTransparency: true,
      colorMode: "fixed",
    },
  });

  assert.equal(patch.chipWidth, 106);
  assert.deepEqual(
    { width: geometry.width, height: geometry.height },
    { width: 148, height: 223.6 }
  );
  assert.deepEqual(geometry.layoutMetrics.contentBounds, {
    x: 14,
    y: 14,
    width: 120,
    height: 195.6,
  });
  assert.deepEqual(
    {
      x: geometry.layoutMetrics.unitLayouts[0].x,
      y: geometry.layoutMetrics.unitLayouts[0].y,
      width: geometry.layoutMetrics.unitLayouts[0].width,
      height: geometry.layoutMetrics.unitLayouts[0].height,
    },
    { x: 14, y: 14, width: 120, height: 62 }
  );
  close(boundsCenter(geometry.selectionBounds).x, 74);
  close(boundsCenter(geometry.selectionBounds).y, 111.8);
});

test("preset without a frame keeps external, internal and number geometry stable", () => {
  const { patch, geometry } = assertNormalizedPresetParity({
    presetId: "no-frame",
    activeVersion: 2,
    layout: {
      type: "singleFrame",
      distribution: "centered",
      visibleUnits: ["days", "hours", "minutes", "seconds"],
      chipWidth: null,
      gap: 8,
      framePadding: 20,
      frameScale: 1,
    },
    tipografia: baseTypography,
    colores: baseColors,
    animaciones: noAnimations,
    unidad: baseUnit,
    tamanoBase: 320,
    svgRef: {},
  });

  assert.equal(patch.frameSvgUrl, null);
  assert.equal(patch.chipWidth, 72);
  assert.equal(geometry.visualFrameBounds, null);
  assert.equal(geometry.layoutMetrics.contentBounds.width, geometry.width);
  assert.equal(geometry.layoutMetrics.contentBounds.height, geometry.height);
});

test("transparent square PNG preserves alpha metadata inputs and contained aspect ratio", () => {
  const { patch, geometry } = assertNormalizedPresetParity({
    presetId: "transparent-square",
    activeVersion: 3,
    layout: {
      type: "singleFrame",
      distribution: "grid",
      visibleUnits: ["days", "hours", "minutes", "seconds"],
      chipWidth: null,
      gap: 12,
      framePadding: 18,
      frameScale: 1.5,
    },
    tipografia: baseTypography,
    colores: baseColors,
    animaciones: noAnimations,
    unidad: baseUnit,
    tamanoBase: 420,
    svgRef: {
      type: "png",
      mimeType: "image/png",
      downloadUrl: "https://assets.invalid/transparent-square.png",
      width: 1600,
      height: 1600,
      hasAlpha: true,
      hasTransparency: true,
      colorMode: "fixed",
    },
  });

  assert.equal(patch.frameAssetType, "png");
  assert.equal(patch.frameIntrinsicWidth, 1600);
  assert.equal(patch.frameIntrinsicHeight, 1600);
  close(geometry.frameRects[0].width / geometry.frameRects[0].height, 1);
});

test("wide transparent PNG keeps its authored ratio while layout centers stay invariant", () => {
  const { geometry } = assertNormalizedPresetParity({
    presetId: "transparent-wide",
    activeVersion: 4,
    layout: {
      type: "singleFrame",
      distribution: "editorial",
      visibleUnits: ["days", "hours", "minutes"],
      chipWidth: 92,
      gap: 6.5,
      framePadding: 24,
      frameScale: 2,
    },
    tipografia: { ...baseTypography, numberSize: 36, labelSize: 10 },
    colores: baseColors,
    animaciones: noAnimations,
    unidad: baseUnit,
    tamanoBase: 520,
    svgRef: {
      type: "png",
      mimeType: "image/png",
      downloadUrl: "https://assets.invalid/transparent-wide.png",
      width: 1800,
      height: 600,
      hasAlpha: true,
      hasTransparency: true,
      colorMode: "fixed",
    },
  });

  close(geometry.frameRects[0].width / geometry.frameRects[0].height, 3);
  close(boundsCenter(geometry.selectionBounds).x, geometry.width / 2);
  close(boundsCenter(geometry.selectionBounds).y, geometry.height / 2);
});

test("legacy countdown compatibility keeps its persisted box after serialization", () => {
  const legacy = {
    tipo: "countdown",
    countdownSchemaVersion: 1,
    width: 320,
    height: 90,
    gap: 8,
    chipWidth: 46,
    paddingX: 8,
    paddingY: 6,
    fontSize: 28,
    labelSize: 12,
    showLabels: true,
    boxRadius: 12,
  };
  const before = resolveCountdownEffectiveGeometry(legacy);
  const after = resolveCountdownEffectiveGeometry(roundTrip(legacy));

  assert.deepEqual(after.layoutMetrics, before.layoutMetrics);
  assert.deepEqual(after.effectiveBounds, before.effectiveBounds);
  assert.deepEqual(after.effectiveBounds, {
    x: 0,
    y: 0,
    width: 320,
    height: 90,
  });
});

test("frontend, Functions and builder reference the same materialization and insertion authorities", () => {
  assert.match(
    frontendMaterializationSource,
    /shared\/countdownPresetMaterialization\.js/
  );
  assert.doesNotMatch(frontendMaterializationSource, /Number\(layout\.chipWidth\)/);
  assert.match(
    functionsServiceSource,
    /buildSharedCountdownCanvasPatchFromPreset/
  );
  assert.doesNotMatch(functionsServiceSource, /function estimateChipWidth/);
  assert.match(builderPreviewSource, /resolveCountdownInsertGeometry/);
  assert.match(builderPreviewSource, /previewGeometry\.layoutMetrics/);
  assert.match(builderPreviewSource, /frameIntrinsicWidth/);
  assert.match(builderPreviewSource, /frameIntrinsicHeight/);
});
