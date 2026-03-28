import test from "node:test";
import assert from "node:assert/strict";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const { resolvePublishImageCropState } = requireBuiltModule(
  "lib/utils/publishImageCrop.js"
);

test("materializes meaningful crops when source and display sizes are present", () => {
  const state = resolvePublishImageCropState({
    ancho: 400,
    alto: 200,
    width: 200,
    height: 100,
    cropX: 50,
    cropY: 20,
    cropWidth: 200,
    cropHeight: 100,
  });

  assert.equal(state.hasMeaningfulCrop, true);
  assert.equal(state.canMaterializeCrop, true);
  assert.equal(state.materializationIssue, null);
  assert.equal(state.cropX, 50);
  assert.equal(state.cropWidth, 200);
});

test("flags missing source dimensions when a meaningful crop cannot be materialized", () => {
  const state = resolvePublishImageCropState({
    width: 200,
    height: 100,
    cropX: 50,
    cropY: 20,
    cropWidth: 200,
    cropHeight: 100,
  });

  assert.equal(state.hasMeaningfulCrop, true);
  assert.equal(state.canMaterializeCrop, false);
  assert.equal(state.materializationIssue, "missing-source-size");
});

test("falls back to source dimensions when display size is absent but source size exists", () => {
  const state = resolvePublishImageCropState({
    ancho: 400,
    alto: 200,
    width: 0,
    height: 0,
    cropX: 50,
    cropY: 20,
    cropWidth: 200,
    cropHeight: 100,
  });

  assert.equal(state.hasMeaningfulCrop, true);
  assert.equal(state.displayWidth, 400);
  assert.equal(state.displayHeight, 200);
  assert.equal(state.canMaterializeCrop, true);
  assert.equal(state.materializationIssue, null);
});

test("keeps non-meaningful crops out of the materialization issue path", () => {
  const state = resolvePublishImageCropState({
    ancho: 400,
    alto: 200,
    width: 200,
    height: 100,
    cropX: 0,
    cropY: 0,
    cropWidth: 400,
    cropHeight: 200,
  });

  assert.equal(state.hasMeaningfulCrop, false);
  assert.equal(state.canMaterializeCrop, true);
  assert.equal(state.materializationIssue, null);
});
