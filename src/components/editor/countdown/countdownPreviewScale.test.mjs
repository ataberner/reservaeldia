import test from "node:test";
import assert from "node:assert/strict";

import {
  COUNTDOWN_PREVIEW_FIT_MODES,
  computeCountdownPreviewScale,
} from "./countdownPreviewScale.js";

test("width fit mode preserves the current width-only countdown preview scaling", () => {
  const scale = computeCountdownPreviewScale({
    containerWidth: 100,
    containerHeight: 40,
    contentWidth: 200,
    contentHeight: 120,
    fitMode: COUNTDOWN_PREVIEW_FIT_MODES.WIDTH,
  });

  assert.equal(scale, 0.475);
});

test("contain fit mode shrinks tall countdown previews to fit sidebar-height cards", () => {
  const scale = computeCountdownPreviewScale({
    containerWidth: 240,
    containerHeight: 72,
    contentWidth: 160,
    contentHeight: 240,
    fitMode: COUNTDOWN_PREVIEW_FIT_MODES.CONTAIN,
  });

  assert.equal(scale, 0.285);
});

test("countdown preview scaling never upscales beyond the existing margin-capped maximum", () => {
  const scale = computeCountdownPreviewScale({
    containerWidth: 300,
    containerHeight: 300,
    contentWidth: 120,
    contentHeight: 80,
    fitMode: COUNTDOWN_PREVIEW_FIT_MODES.CONTAIN,
  });

  assert.equal(scale, 0.95);
});

