import test from "node:test";
import assert from "node:assert/strict";

import { resolveCanvasHoverIdUpdate } from "./useCanvasEditorSelectionUi.js";

test("hover policy blocks new hover targets while a global interaction is active", () => {
  assert.equal(
    resolveCanvasHoverIdUpdate("obj-1", "obj-2", {
      interactionActive: true,
    }),
    "obj-1"
  );
});

test("hover policy still allows clearing hover while a global interaction is active", () => {
  assert.equal(
    resolveCanvasHoverIdUpdate("obj-1", null, {
      interactionActive: true,
    }),
    null
  );
});

test("hover policy preserves normal hover updates while idle", () => {
  assert.equal(
    resolveCanvasHoverIdUpdate("obj-1", "obj-2", {
      interactionActive: false,
    }),
    "obj-2"
  );
});
