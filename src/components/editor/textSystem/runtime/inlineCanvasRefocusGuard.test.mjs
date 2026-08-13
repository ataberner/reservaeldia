import test from "node:test";
import assert from "node:assert/strict";

import {
  createInlineCanvasRefocusIntent,
  shouldHonorInlineCanvasRefocus,
} from "./inlineCanvasRefocusGuard.js";

test("arms the blur guard after caret placement so hit-test duration cannot expire the same click", () => {
  const hitTestStartedAtMs = 100;
  const hitTestFinishedAtMs = 600;
  const pendingRefocus = createInlineCanvasRefocusIntent({
    editingId: "text-multiline",
    clientX: 220,
    clientY: 245,
    nowMs: hitTestFinishedAtMs,
  });

  assert.equal(
    shouldHonorInlineCanvasRefocus({
      pendingRefocus,
      editingId: "text-multiline",
      nowMs: hitTestFinishedAtMs + 1,
    }),
    true
  );

  assert.equal(
    shouldHonorInlineCanvasRefocus({
      pendingRefocus: {
        ...pendingRefocus,
        armedAtMs: hitTestStartedAtMs,
      },
      editingId: "text-multiline",
      nowMs: hitTestFinishedAtMs + 1,
    }),
    false
  );
});

test("rejects stale and different-session canvas refocus intents", () => {
  const pendingRefocus = createInlineCanvasRefocusIntent({
    editingId: "text-current",
    nowMs: 1000,
  });

  assert.equal(
    shouldHonorInlineCanvasRefocus({
      pendingRefocus,
      editingId: "text-current",
      nowMs: 1251,
    }),
    false
  );
  assert.equal(
    shouldHonorInlineCanvasRefocus({
      pendingRefocus,
      editingId: "text-new",
      nowMs: 1001,
    }),
    false
  );
});
