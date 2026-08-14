import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  ICON_RENDER_CONTRACT_ID,
  ICON_RENDER_SCHEMA_VERSION,
  buildIconSvgDataUrl,
  buildIconSvgMarkup,
  computeIconContainRect,
  normalizeIconRenderable,
} from "./iconRenderableContract.js";

function createRenderable(overrides = {}) {
  const svgText = overrides.svgText ||
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><path fill="currentColor" d="M0 0h40v20H0z"/></svg>';
  return {
    schemaVersion: ICON_RENDER_SCHEMA_VERSION,
    contractId: ICON_RENDER_CONTRACT_ID,
    mediaType: "image/svg+xml",
    svgText,
    viewBox: "0 0 40 20",
    viewBoxWidth: 40,
    viewBoxHeight: 20,
    colorMode: "currentColor",
    geometryCount: 1,
    bytes: Buffer.byteLength(svgText),
    hashSha256: createHash("sha256").update(svgText).digest("hex"),
    ...overrides,
  };
}

test("normalizes only the versioned canonical SVG snapshot", () => {
  const normalized = normalizeIconRenderable(createRenderable());
  assert.equal(normalized?.contractId, ICON_RENDER_CONTRACT_ID);
  assert.equal(normalized?.viewBox, "0 0 40 20");
  assert.equal(normalizeIconRenderable({ paths: [{ d: "M0 0" }] }), null);
  assert.equal(normalizeIconRenderable(createRenderable({ geometryCount: 0 })), null);
  assert.equal(normalizeIconRenderable(createRenderable({ hashSha256: "bad" })), null);
});

test("recolors only currentColor snapshots and preserves fixed multicolor markup", () => {
  const recolorable = createRenderable();
  assert.match(buildIconSvgMarkup(recolorable, "#ff00aa"), /fill="#ff00aa"/);
  assert.doesNotMatch(buildIconSvgMarkup(recolorable, "#ff00aa"), /currentColor/i);

  const fixedSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><path fill="#f00" d="M0 0h20v20H0z"/><path fill="#00f" d="M20 0h20v20H20z"/></svg>';
  const fixed = createRenderable({
    svgText: fixedSvg,
    colorMode: "fixed",
    geometryCount: 2,
    bytes: Buffer.byteLength(fixedSvg),
    hashSha256: createHash("sha256").update(fixedSvg).digest("hex"),
  });
  assert.equal(buildIconSvgMarkup(fixed, "#00ff00"), fixedSvg);
  assert.match(buildIconSvgDataUrl(fixed, "#00ff00"), /^data:image\/svg\+xml/);
});

test("computes a centered contain box without distorting a non-square viewBox", () => {
  assert.deepEqual(computeIconContainRect(createRenderable(), 100, 100), {
    x: 0,
    y: 25,
    width: 100,
    height: 50,
  });
});
