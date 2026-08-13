import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./MiniToolbarTabTexto.jsx", import.meta.url),
  "utf8"
);

test("text preset loading uses a content-shaped accessible skeleton", () => {
  assert.match(source, /function TextPresetCatalogSkeleton\(\)/);
  assert.match(source, /aria-label="Cargando presets de texto"/);
  assert.match(source, /aria-busy="true"/);
  assert.match(source, /textPresetSkeletonLineWidths\.map/);
  assert.match(source, /min-h-\[104px\]/);
  assert.match(source, /h-\[84px\]/);
  assert.match(source, /motion-reduce:animate-none/);
  assert.match(
    source,
    /loading\s*&&\s*\(\s*<TextPresetCatalogSkeleton\s*\/>/
  );
  assert.doesNotMatch(source, />\s*Cargando presets de texto\.\.\.\s*</);
});

test("text presets stay hidden until the current catalog load completes", () => {
  assert.match(source, /!loading\s*&&\s*textPresets\.map\(\(preset\)\s*=>/);
  assert.match(source, /!loading\s*&&\s*error/);
  assert.match(source, /!loading\s*&&\s*\(!Array\.isArray\(textPresets\)/);
});
