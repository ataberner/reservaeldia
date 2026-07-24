import test from "node:test";
import assert from "node:assert/strict";

import {
  COUNTDOWN_PRESET_STYLE_KEYS,
  applyCountdownPresetToExisting,
} from "./applyToExisting.js";
import { buildCountdownCanvasPatchFromPreset } from "./toCanvasPatch.js";

const CURRENT_TARGET = "2031-05-18T21:30:00.000Z";

function buildExisting(overrides = {}) {
  return {
    id: "countdown-existing",
    tipo: "countdown",
    seccionId: "section-ceremony",
    x: 124,
    y: 216,
    yNorm: 0.32,
    rotation: 4,
    width: 640,
    height: 220,
    scaleX: 1.25,
    scaleY: 1.25,
    fechaObjetivo: CURRENT_TARGET,
    presetId: "old-preset",
    presetVersion: 2,
    countdownSchemaVersion: 2,
    frameSvgUrl: "https://cdn.example.com/old.png",
    frameAssetType: "png",
    frameMimeType: "image/png",
    frameScale: 2,
    layoutType: "singleFrame",
    distribution: "centered",
    fontFamily: "Old Font",
    letterSpacing: 1,
    lineHeight: 1.1,
    ...overrides,
  };
}

function buildPrepared({
  presetId = "new-preset",
  activeVersion = 7,
  layout = {},
  svgRef = {},
  tipografia = {},
  target = "2040-01-01T00:00:00.000Z",
  width = 360,
  height = 130,
} = {}) {
  return {
    id: "countdown-transient",
    tipo: "countdown",
    seccionId: "section-other",
    x: 300,
    y: 140,
    width,
    height,
    fechaObjetivo: target,
    mostrarCuentaRegresiva: true,
    ...buildCountdownCanvasPatchFromPreset({
      presetId,
      activeVersion,
      layout: {
        type: "singleFrame",
        distribution: "centered",
        visibleUnits: ["days", "hours", "minutes", "seconds"],
        framePadding: 12,
        frameScale: 1,
        ...layout,
      },
      tipografia: {
        fontFamily: "Poppins",
        numberSize: 30,
        labelSize: 12,
        letterSpacing: 2,
        lineHeight: 1.25,
        ...tipografia,
      },
      svgRef,
    }),
  };
}

test("schema 2 preset application replaces design and geometry but preserves identity and placement", () => {
  const current = buildExisting();
  const prepared = buildPrepared({
    presetId: "schema-two-new",
    activeVersion: 9,
    layout: {
      type: "multiUnit",
      distribution: "editorial",
      frameScale: 5,
    },
    svgRef: {
      type: "svg",
      mimeType: "image/svg+xml",
      downloadUrl: "https://cdn.example.com/new.svg",
      colorMode: "currentColor",
      width: 1200,
      height: 900,
    },
    width: 438,
    height: 156,
  });

  const result = applyCountdownPresetToExisting(current, prepared);

  assert.equal(result.id, current.id);
  assert.equal(result.seccionId, current.seccionId);
  assert.equal(result.x, current.x);
  assert.equal(result.y, current.y);
  assert.equal(result.yNorm, current.yNorm);
  assert.equal(result.rotation, current.rotation);
  assert.equal(result.fechaObjetivo, CURRENT_TARGET);
  assert.equal(result.presetId, "schema-two-new");
  assert.equal(result.presetVersion, 9);
  assert.equal(result.countdownSchemaVersion, 2);
  assert.equal(result.width, 438);
  assert.equal(result.height, 156);
  assert.equal(result.scaleX, 1);
  assert.equal(result.scaleY, 1);
  assert.equal(result.layoutType, "multiUnit");
  assert.equal(result.distribution, "editorial");
  assert.equal(result.frameScale, 5);
  assert.equal(result.frameAssetType, "svg");
  assert.equal(result.frameColorMode, "currentColor");
  assert.equal(result.letterSpacing, 2);
  assert.equal(result.lineHeight, 1.25);
});

test("PNG, SVG and frame-free transitions replace the complete frame contract", () => {
  const png = applyCountdownPresetToExisting(
    buildExisting({
      frameSvgUrl: "https://cdn.example.com/old.svg",
      frameAssetType: "svg",
      frameMimeType: "image/svg+xml",
      frameColorMode: "currentColor",
    }),
    buildPrepared({
      presetId: "png-preset",
      svgRef: {
        type: "png",
        mimeType: "image/png",
        downloadUrl: "https://cdn.example.com/floral.png",
        width: 1600,
        height: 1600,
      },
    })
  );
  assert.equal(png.frameAssetType, "png");
  assert.equal(png.frameMimeType, "image/png");
  assert.equal(png.frameSvgUrl, "https://cdn.example.com/floral.png");
  assert.equal(png.frameColorMode, "fixed");

  const svg = applyCountdownPresetToExisting(
    png,
    buildPrepared({
      presetId: "svg-preset",
      svgRef: {
        type: "svg",
        mimeType: "image/svg+xml",
        downloadUrl: "https://cdn.example.com/line.svg",
        colorMode: "currentColor",
      },
    })
  );
  assert.equal(svg.frameAssetType, "svg");
  assert.equal(svg.frameMimeType, "image/svg+xml");
  assert.equal(svg.frameColorMode, "currentColor");

  const withoutFrame = applyCountdownPresetToExisting(
    svg,
    buildPrepared({
      presetId: "frame-free",
      layout: { type: "multiUnit", frameScale: 1 },
    })
  );
  assert.equal(withoutFrame.frameSvgUrl, null);
  assert.equal(withoutFrame.frameAssetType, null);
  assert.equal(withoutFrame.frameMimeType, null);
  assert.equal(withoutFrame.frameIntrinsicWidth, null);
  assert.equal(withoutFrame.frameIntrinsicHeight, null);
  assert.equal(withoutFrame.layoutType, "multiUnit");
});

test("legacy countdown date aliases survive an explicit schema 2 design change", () => {
  const legacy = buildExisting({
    fechaObjetivo: undefined,
    targetISO: CURRENT_TARGET,
    countdownSchemaVersion: 1,
    presetVersion: undefined,
  });
  const result = applyCountdownPresetToExisting(
    legacy,
    buildPrepared({
      presetId: "schema-two-for-legacy",
      layout: { frameScale: 3 },
    })
  );

  assert.equal(result.id, legacy.id);
  assert.equal(result.targetISO, CURRENT_TARGET);
  assert.equal(result.fechaObjetivo, CURRENT_TARGET);
  assert.equal(result.countdownSchemaVersion, 2);
  assert.equal(result.presetId, "schema-two-for-legacy");
  assert.equal(result.frameScale, 3);
});

test("mobile placement is preserved while natural dimensions are refreshed", () => {
  const mobile = buildExisting({
    x: 18,
    y: 96,
    width: 310,
    height: 180,
    yNorm: 0.18,
  });
  const result = applyCountdownPresetToExisting(
    mobile,
    buildPrepared({
      layout: { distribution: "vertical" },
      width: 190,
      height: 344,
    })
  );

  assert.deepEqual(
    {
      x: result.x,
      y: result.y,
      yNorm: result.yNorm,
      width: result.width,
      height: result.height,
    },
    { x: 18, y: 96, yNorm: 0.18, width: 190, height: 344 }
  );
});

test("the apply contract covers every materialized schema 2 design field", () => {
  const canvasPatch = buildCountdownCanvasPatchFromPreset({
    presetId: "coverage",
    activeVersion: 3,
    svgRef: {
      type: "png",
      mimeType: "image/png",
      downloadUrl: "https://cdn.example.com/frame.png",
    },
  });
  const keysOutsideStylePatch = new Set(["presetId"]);
  const missing = Object.keys(canvasPatch).filter(
    (key) =>
      !keysOutsideStylePatch.has(key) &&
      !COUNTDOWN_PRESET_STYLE_KEYS.includes(key)
  );

  assert.deepEqual(missing, []);
});

test("invalid prepared dimensions cannot erase the current natural box", () => {
  const current = buildExisting({ width: 420, height: 160 });
  const result = applyCountdownPresetToExisting(
    current,
    buildPrepared({ width: Number.NaN, height: 0 })
  );

  assert.equal(result.width, 420);
  assert.equal(result.height, 160);
});
