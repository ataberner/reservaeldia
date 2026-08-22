import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_TEXT_BOX_WIDTH,
  MIN_TEXT_BOX_WIDTH,
  buildTextBoxWidthCommitPatch,
  isTextBoxWidthResizeGesture,
  resolveTextBoxWidthAnchorVisual,
  resolveTextBoxWidthResize,
} from "./textBoxWidthResize.js";

test("text width anchor is rendered as a vertical bar on desktop and mobile", () => {
  const desktop = resolveTextBoxWidthAnchorVisual({
    isMobile: false,
    padding: 6,
  });
  const mobile = resolveTextBoxWidthAnchorVisual({
    isMobile: true,
    padding: 10,
  });

  assert.deepEqual(desktop, {
    width: 8,
    height: 28,
    offsetX: -2,
    offsetY: 14,
    cornerRadius: 3,
  });
  assert.deepEqual(mobile, {
    width: 12,
    height: 40,
    offsetX: -4,
    offsetY: 20,
    cornerRadius: 4,
  });
  assert.ok(desktop.height > desktop.width * 3);
  assert.ok(mobile.height > mobile.width * 3);
});

test("middle-right is the width-only gesture for one selected text", () => {
  assert.equal(
    isTextBoxWidthResizeGesture({
      activeAnchor: "middle-right",
      selectedCount: 1,
      object: { tipo: "texto" },
    }),
    true
  );
  assert.equal(
    isTextBoxWidthResizeGesture({
      activeAnchor: "bottom-right",
      selectedCount: 1,
      object: { tipo: "texto" },
    }),
    false
  );
  assert.equal(
    isTextBoxWidthResizeGesture({
      activeAnchor: "middle-right",
      selectedCount: 2,
      object: { tipo: "texto" },
    }),
    false
  );
  assert.equal(
    isTextBoxWidthResizeGesture({
      activeAnchor: "middle-right",
      selectedCount: 1,
      object: { tipo: "imagen" },
    }),
    false
  );
});

test("text box width resize changes width without changing font size", () => {
  const result = resolveTextBoxWidthResize({
    baseWidth: 240,
    scaleX: 1.5,
    fontSize: 32,
    align: "left",
  });

  assert.deepEqual(result, {
    width: 360,
    fontSize: 32,
    __autoWidth: false,
    textWrapMode: "word",
    scaleX: 1,
    scaleY: 1,
    originOffsetX: 0,
  });
});

test("text box width resize clamps both extremes and preserves char wrapping", () => {
  const reduced = resolveTextBoxWidthResize({
    baseWidth: 200,
    scaleX: 0.01,
    fontSize: 18,
    align: "center",
    textWrapMode: "char",
  });
  const enlarged = resolveTextBoxWidthResize({
    baseWidth: 500,
    scaleX: 4,
    fontSize: 18,
    align: "right",
  });

  assert.equal(reduced.width, MIN_TEXT_BOX_WIDTH);
  assert.equal(reduced.originOffsetX, MIN_TEXT_BOX_WIDTH / 2);
  assert.equal(reduced.textWrapMode, "char");
  assert.equal(reduced.fontSize, 18);

  assert.equal(enlarged.width, MAX_TEXT_BOX_WIDTH);
  assert.equal(enlarged.originOffsetX, MAX_TEXT_BOX_WIDTH);
  assert.equal(enlarged.fontSize, 18);
});

test("text box width resize rejects invalid geometry", () => {
  assert.equal(resolveTextBoxWidthResize({ baseWidth: 0, scaleX: 1 }), null);
  assert.equal(resolveTextBoxWidthResize({ baseWidth: 100, scaleX: 0 }), null);
  assert.equal(resolveTextBoxWidthResize({ baseWidth: 100, scaleX: NaN }), null);
});

test("text box width commit persists fixed layout and keeps the stored font size", () => {
  const patch = buildTextBoxWidthCommitPatch({
    object: {
      tipo: "texto",
      fontSize: 28,
      align: "center",
      textWrapMode: "char",
    },
    transformAttrs: {
      x: 135,
      width: 420,
      fontSize: 99,
      textWrapMode: "char",
    },
  });

  assert.deepEqual(patch, {
    x: 135,
    width: 420,
    fontSize: 28,
    __autoWidth: false,
    textWrapMode: "char",
    scaleX: 1,
    scaleY: 1,
  });
});
