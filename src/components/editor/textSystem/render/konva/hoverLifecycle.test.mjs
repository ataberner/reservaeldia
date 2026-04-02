import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveStageHoverSuppression,
  shouldStageRenderHoverIndicator,
} from "./hoverLifecycle.js";

test("stage hover suppression includes predrag ownership before drag becomes active", () => {
  assert.deepEqual(
    resolveStageHoverSuppression({
      isPredragVisualSelectionActive: true,
    }),
    {
      suppressed: true,
      reasons: ["predrag-visual-selection"],
    }
  );
});

test("stage hover suppression stays idle without interaction signals", () => {
  assert.deepEqual(
    resolveStageHoverSuppression({}),
    {
      suppressed: false,
      reasons: [],
    }
  );
});

test("stage hover suppression preserves existing drag-active reasons", () => {
  assert.deepEqual(
    resolveStageHoverSuppression({
      isDragging: true,
      runtimeDragActive: true,
    }),
    {
      suppressed: true,
      reasons: ["drag-prop", "global-drag"],
    }
  );
});

test("stage hover indicator unmounts during predrag and drag ownership", () => {
  assert.equal(
    shouldStageRenderHoverIndicator({
      isPredragVisualSelectionActive: true,
    }),
    false
  );
  assert.equal(
    shouldStageRenderHoverIndicator({
      runtimeDragActive: true,
    }),
    false
  );
  assert.equal(
    shouldStageRenderHoverIndicator({}),
    true
  );
});
