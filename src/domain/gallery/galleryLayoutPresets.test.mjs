import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGalleryLayoutPresetToRenderObject,
  getGalleryLayoutPresets,
  normalizeGalleryLayoutIds,
  resolveGalleryLayoutSelection,
} from "./galleryLayoutPresets.js";

function gallery(overrides = {}) {
  return {
    id: "gal-1",
    tipo: "galeria",
    rows: 3,
    cols: 3,
    ratio: "1:1",
    galleryLayoutMode: "fixed",
    galleryLayoutType: "canvas_preserve",
    cells: [
      { mediaUrl: "https://cdn.test/a.jpg" },
      { mediaUrl: "https://cdn.test/b.jpg" },
      { mediaUrl: "https://cdn.test/c.jpg" },
    ],
    ...overrides,
  };
}

test("preset catalog exposes only selectable layouts by default", () => {
  const presets = getGalleryLayoutPresets();

  assert.deepEqual(
    presets.map((preset) => preset.id),
    ["squares", "banner", "full_width", "side_by_side", "single_page"]
  );
});

test("layout id normalization removes duplicates, unknown ids, and unavailable presets", () => {
  assert.deepEqual(
    normalizeGalleryLayoutIds(["banner", "unknown", "slideshow", "banner", "squares"]),
    ["banner", "squares"]
  );

  assert.deepEqual(
    normalizeGalleryLayoutIds(["banner", "slideshow"], { selectableOnly: false }),
    ["banner", "slideshow"]
  );
});

test("selection falls back from missing current layout to default and first allowed", () => {
  assert.deepEqual(
    resolveGalleryLayoutSelection(
      gallery({
        allowedLayouts: ["banner", "squares"],
        defaultLayout: "banner",
        currentLayout: "",
      })
    ),
    {
      allowedLayouts: ["banner", "squares"],
      defaultLayout: "banner",
      currentLayout: "",
      rawDefaultLayout: "banner",
      rawCurrentLayout: "",
      selectedLayout: "banner",
      preset: {
        id: "banner",
        label: "Banner",
        previewKind: "wide",
        minPhotos: 1,
        maxPhotos: 1,
        recommendedPhotoCount: 1,
        emptyCellsAllowed: false,
        supportsDynamicMedia: false,
        selectableByEndUsers: true,
        render: {
          galleryLayoutMode: "fixed",
          galleryLayoutType: "canvas_preserve",
          rows: 1,
          cols: 1,
          ratio: "16:9",
        },
      },
      hasPresetContract: true,
      hasLayoutFields: true,
      reason: "default-layout-selected",
    }
  );

  assert.equal(
    resolveGalleryLayoutSelection(
      gallery({
        allowedLayouts: ["squares"],
        defaultLayout: "banner",
        currentLayout: "unknown",
      })
    ).selectedLayout,
    "squares"
  );
});

test("missing allowedLayouts leaves legacy fixed/dynamic fields authoritative", () => {
  const selection = resolveGalleryLayoutSelection(
    gallery({
      allowedLayouts: undefined,
      defaultLayout: "banner",
      currentLayout: "banner",
    })
  );

  assert.equal(selection.hasPresetContract, false);
  assert.equal(selection.selectedLayout, "");
  assert.equal(selection.reason, "legacy-fields-authoritative");
});

test("render preset mapping changes layout view without deleting cells", () => {
  const original = gallery({
    allowedLayouts: ["banner", "squares"],
    defaultLayout: "squares",
    currentLayout: "banner",
  });

  const rendered = applyGalleryLayoutPresetToRenderObject(original);

  assert.equal(rendered.rows, 1);
  assert.equal(rendered.cols, 1);
  assert.equal(rendered.ratio, "16:9");
  assert.equal(rendered.galleryLayoutMode, "fixed");
  assert.equal(rendered.cells, original.cells);
  assert.equal(original.rows, 3);
  assert.equal(original.cells.length, 3);
});

test("legacy galleries without preset fields render unchanged", () => {
  const original = gallery();
  const rendered = applyGalleryLayoutPresetToRenderObject(original);

  assert.equal(rendered, original);
});
