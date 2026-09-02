import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  LINE_STROKE_WIDTH_DEFAULT,
  LINE_STROKE_WIDTH_MAX,
  LINE_STROKE_WIDTH_MIN,
  normalizeLineStrokeWidth,
} from "./lineStrokeWidthControl.js";

const toolbarSource = readFileSync(
  new URL(
    "../textSystem/render/domOverlay/FloatingTextToolbarView.jsx",
    import.meta.url
  ),
  "utf8"
);

test("line stroke width normalization preserves valid values and the render fallback", () => {
  assert.equal(normalizeLineStrokeWidth(6), 6);
  assert.equal(normalizeLineStrokeWidth("12"), 12);
  assert.equal(normalizeLineStrokeWidth(undefined), LINE_STROKE_WIDTH_DEFAULT);
  assert.equal(normalizeLineStrokeWidth("invalid"), LINE_STROKE_WIDTH_DEFAULT);
});

test("line stroke width normalization clamps and rounds edge values", () => {
  assert.equal(normalizeLineStrokeWidth(0), LINE_STROKE_WIDTH_MIN);
  assert.equal(normalizeLineStrokeWidth(-8), LINE_STROKE_WIDTH_MIN);
  assert.equal(normalizeLineStrokeWidth(50.6), LINE_STROKE_WIDTH_MAX);
  assert.equal(normalizeLineStrokeWidth(100), LINE_STROKE_WIDTH_MAX);
  assert.equal(normalizeLineStrokeWidth(7.6), 8);
});

test("the visible shape toolbar exposes thickness only for lines and preserves color editing", () => {
  assert.match(toolbarSource, /const esLinea\s*=\s*[\s\S]*?figura === "line"/);
  assert.match(toolbarSource, /\{esLinea && \(\s*<div[\s\S]*?>\s*Grosor\s*<\/label>/);
  assert.match(toolbarSource, /type="range"/);
  assert.match(toolbarSource, /min=\{LINE_STROKE_WIDTH_MIN\}/);
  assert.match(toolbarSource, /max=\{LINE_STROKE_WIDTH_MAX\}/);
  assert.match(toolbarSource, /strokeWidth: nextStrokeWidth/);
  assert.match(toolbarSource, /<UnifiedColorPicker[\s\S]*?value=\{fondoPickerValue\}/);
});
