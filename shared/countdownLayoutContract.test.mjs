import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCountdownVisibleUnits,
  resolveCountdownLayoutMetrics,
} from "./countdownLayoutContract.js";

const BASE = Object.freeze({
  countdownSchemaVersion: 2,
  visibleUnits: ["days", "hours", "minutes", "seconds"],
  layoutType: "singleFrame",
  distribution: "centered",
  gap: 8,
  framePadding: 10,
  frameScale: 1,
  paddingX: 8,
  paddingY: 6,
  chipWidth: 46,
  fontSize: 28,
  labelSize: 11,
  lineHeight: 1.05,
  letterSpacing: 0,
  boxRadius: 8,
  showLabels: true,
  tamanoBase: 320,
});

test("normaliza unidades sin duplicados y conserva el orden semantico", () => {
  assert.deepEqual(
    normalizeCountdownVisibleUnits(["minutes", "days", "minutes", "invalid"]),
    ["minutes", "days"]
  );
  assert.deepEqual(normalizeCountdownVisibleUnits(null), [
    "days",
    "hours",
    "minutes",
    "seconds",
  ]);
});

test("gap conserva cero, decimales y extremos sin reinterpretar unidades", () => {
  for (const gap of [0, 0.5, 27, 48]) {
    const metrics = resolveCountdownLayoutMetrics({ ...BASE, gap });
    assert.equal(metrics.gap, gap);
    assert.equal(
      metrics.unitLayouts[1].x -
        (metrics.unitLayouts[0].x + metrics.unitLayouts[0].width),
      gap
    );
  }

  assert.equal(resolveCountdownLayoutMetrics({ ...BASE, gap: undefined }).gap, 8);
  assert.equal(resolveCountdownLayoutMetrics({ ...BASE, gap: -1 }).gap, 0);
  assert.equal(resolveCountdownLayoutMetrics({ ...BASE, gap: 999 }).gap, 48);
});

test("calcula geometria canonica para horizontal, vertical, grid y editorial", () => {
  const horizontal = resolveCountdownLayoutMetrics(BASE);
  const vertical = resolveCountdownLayoutMetrics({
    ...BASE,
    distribution: "vertical",
  });
  const grid = resolveCountdownLayoutMetrics({ ...BASE, distribution: "grid" });
  const editorial = resolveCountdownLayoutMetrics({
    ...BASE,
    distribution: "editorial",
  });

  assert.equal(horizontal.rows, 1);
  assert.equal(vertical.cols, 1);
  assert.equal(vertical.rows, 4);
  assert.equal(grid.cols, 2);
  assert.equal(grid.rows, 2);
  assert.ok(editorial.unitLayouts[0].width > editorial.unitLayouts[1].width);
  assert.ok(vertical.containerH > horizontal.containerH);
});

test("multiUnit acepta casing historico e incluye los frames en la misma geometria", () => {
  const metrics = resolveCountdownLayoutMetrics({
    ...BASE,
    layoutType: "multiunit",
    frameSvgUrl: "https://cdn.example/frame.png",
    frameAssetType: "png",
    frameScale: 1.75,
  });

  assert.equal(metrics.layoutType, "multiUnit");
  assert.equal(metrics.layoutTypeKey, "multiunit");
  assert.equal(metrics.frameAssetType, "png");
  assert.equal(metrics.useMultiUnitFrame, true);
  assert.equal(metrics.useSingleFrameLayout, false);
  assert.equal(metrics.frameScale, 1.75);
});

test("respeta dimensiones persistidas como minimo sin encoger el contenido natural", () => {
  const natural = resolveCountdownLayoutMetrics(BASE);
  const expanded = resolveCountdownLayoutMetrics({
    ...BASE,
    width: natural.containerW + 120,
    height: natural.containerH + 80,
  });
  const undersized = resolveCountdownLayoutMetrics({
    ...BASE,
    width: 1,
    height: 1,
  });

  assert.equal(expanded.containerW, natural.containerW + 120);
  assert.equal(expanded.containerH, natural.containerH + 80);
  assert.equal(undersized.containerW, natural.containerW);
  assert.equal(undersized.containerH, natural.containerH);
});

test("preserva separadores de cuatro caracteres y la configuracion de entrada", () => {
  const source = {
    ...BASE,
    gap: 27.5,
    separator: "••••",
    frameSvgUrl: "https://cdn.example/frame.svg",
  };
  const before = structuredClone(source);
  const metrics = resolveCountdownLayoutMetrics(source);

  assert.equal(metrics.separatorText, "••••");
  assert.equal(metrics.separatorLayouts.length, 3);
  assert.deepEqual(source, before);
});

test("limita frameScale al contrato historico sin crear valores por superficie", () => {
  assert.equal(resolveCountdownLayoutMetrics({ ...BASE, frameScale: 0 }).frameScale, 0.5);
  assert.equal(resolveCountdownLayoutMetrics({ ...BASE, frameScale: 8 }).frameScale, 5);
  assert.equal(resolveCountdownLayoutMetrics({ ...BASE, frameScale: null }).frameScale, 0.5);
});
