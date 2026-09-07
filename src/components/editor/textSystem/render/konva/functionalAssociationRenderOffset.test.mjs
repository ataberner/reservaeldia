import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rendererSource = readFileSync(
  new URL("./ElementoCanvasRenderer.jsx", import.meta.url),
  "utf8"
);

test("standalone text roots consume the shared functional centering offset", () => {
  assert.match(
    rendererSource,
    /x=\{\s*validX \+\s*\(hasFunctionalRenderOffsetX \? functionalRenderOffsetX : 0\) \+\s*textOriginOffsetX\s*\}/
  );
});
