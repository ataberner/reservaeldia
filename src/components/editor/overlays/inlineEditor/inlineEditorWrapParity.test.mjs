import test from "node:test";
import assert from "node:assert/strict";

import {
  isInlineDomSoftWrapEnabled,
  resolveInlineDomTextFlow,
} from "./inlineEditorWrapParity.js";

test("fixed-width word wrapping applies to a paragraph without explicit newlines", () => {
  const flow = resolveInlineDomTextFlow({
    isSingleLine: true,
    konvaWrapMode: "word",
  });

  assert.deepEqual(flow, {
    konvaWrapMode: "word",
    usesBrowserWrap: true,
    isSingleVisualLine: false,
    shouldUsePerceptualScale: true,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    wordBreak: "break-word",
  });
});

test("character wrapping uses the same multiline DOM layout as Konva", () => {
  const flow = resolveInlineDomTextFlow({
    isSingleLine: true,
    konvaWrapMode: "char",
  });

  assert.equal(flow.usesBrowserWrap, true);
  assert.equal(flow.isSingleVisualLine, false);
  assert.equal(flow.whiteSpace, "pre-wrap");
  assert.equal(flow.overflowWrap, "break-word");
});

test("unconstrained text without explicit newlines retains single-line layout", () => {
  const flow = resolveInlineDomTextFlow({
    isSingleLine: true,
    konvaWrapMode: "none",
  });

  assert.equal(flow.usesBrowserWrap, false);
  assert.equal(flow.isSingleVisualLine, true);
  assert.equal(flow.whiteSpace, "pre");
  assert.equal(flow.overflowWrap, "normal");
});

test("explicit newlines remain multiline without enabling soft wrap", () => {
  const flow = resolveInlineDomTextFlow({
    isSingleLine: false,
    konvaWrapMode: "none",
  });

  assert.equal(flow.usesBrowserWrap, false);
  assert.equal(flow.isSingleVisualLine, false);
  assert.equal(flow.whiteSpace, "pre");
});

test("single-line caret fallback is disabled for CSS modes that allow soft wrapping", () => {
  for (const whiteSpace of ["normal", "pre-wrap", "pre-line", "break-spaces"]) {
    assert.equal(isInlineDomSoftWrapEnabled({ whiteSpace }), true, whiteSpace);
  }
  for (const whiteSpace of ["pre", "nowrap", ""]) {
    assert.equal(isInlineDomSoftWrapEnabled({ whiteSpace }), false, whiteSpace || "empty");
  }
});
