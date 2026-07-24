import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getCountdownParts } from "../../../domain/countdownPresets/renderModel.js";

const livePreviewSource = readFileSync(
  new URL("./CountdownPresetLivePreview.jsx", import.meta.url),
  "utf8"
);
const previewPanelSource = readFileSync(
  new URL("./CountdownPresetPreviewPanel.jsx", import.meta.url),
  "utf8"
);

test("injected clock reproduces seconds and freezeZero expiration", () => {
  const nowMs = Date.parse("2026-01-01T00:00:00.000Z");
  assert.deepEqual(
    getCountdownParts("2026-01-01T00:00:10.000Z", ["seconds"], nowMs),
    [{ unit: "seconds", label: "Seg", value: "10" }]
  );
  assert.deepEqual(
    getCountdownParts("2025-12-31T23:59:59.000Z", ["days", "seconds"], nowMs),
    [
      { unit: "days", label: "Dias", value: "00" },
      { unit: "seconds", label: "Seg", value: "00" },
    ]
  );
});

test("builder preview keeps currentColor, shadow, and editorial on the existing renderer path", () => {
  assert.match(livePreviewSource, /buildFrameSvgMarkup/);
  assert.match(livePreviewSource, /boxShadow/);
  assert.match(livePreviewSource, /buildCountdownEditorialWidths/);
  assert.match(previewPanelSource, /CountdownPresetLivePreview/);
  assert.doesNotMatch(previewPanelSource, /setInterval|resolveCountdownTemporalState/);
});

test("builder preview renders PNG frames without currentColor or deformation", () => {
  assert.match(previewPanelSource, /frameAssetType=\{frameAssetType\}/);
  assert.match(livePreviewSource, /isPngFrame \? "object-contain" : "object-fill"/);
  assert.match(livePreviewSource, /!isPngFrame && svgColorMode === "currentColor"/);
  assert.match(livePreviewSource, /frame-\$\{frameAssetType === "png"/);
});

test("frozen preview stops its timer and reduced motion disables all builder animations", () => {
  assert.match(
    livePreviewSource,
    /hasInjectedNow.*return undefined/s
  );
  assert.match(livePreviewSource, /reducedMotion/);
  assert.match(livePreviewSource, /data-countdown-preview-motion/);
  assert.match(livePreviewSource, /clearInterval\(timer\)/);
});
