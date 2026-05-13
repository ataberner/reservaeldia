import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGalleryLayoutPresetToRenderObject,
  getGalleryLayoutPresets,
  getGalleryLayoutPreset,
  getDefaultGalleryLayoutSelectorIds,
  isSelectableGalleryLayoutPreset,
  normalizeGalleryLayoutIds,
  resolveGalleryLayoutRenderCellLimit,
  resolveGalleryLayoutSelectionForEditor,
  resolveGalleryLayoutSelection,
} from "./galleryLayoutPresets.js";
import { resolveGalleryRenderLayout } from "../../../shared/templates/galleryDynamicLayout.js";

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
    [
      "one_by_n",
      "two_by_n",
      "three_by_n",
      "squares",
      "banner",
      "side_by_side",
      "single_page",
    ]
  );
  assert.equal(presets.find((preset) => preset.id === "squares")?.label, "Collage");
  assert.equal(isSelectableGalleryLayoutPreset("full_width"), false);
  assert.equal(getGalleryLayoutPreset("full_width")?.render?.cols, 1);
});

test("layout id normalization removes duplicates, unknown ids, and unavailable presets", () => {
  assert.deepEqual(
    normalizeGalleryLayoutIds(["banner", "unknown", "slideshow", "full_width", "banner", "squares"]),
    ["banner", "squares"]
  );

  assert.deepEqual(
    normalizeGalleryLayoutIds(["banner", "slideshow", "full_width"], { selectableOnly: false }),
    ["banner", "slideshow", "full_width"]
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

test("legacy full_width layout fields fall back to the current default selectable preset", () => {
  const selection = resolveGalleryLayoutSelection(
    gallery({
      allowedLayouts: ["full_width"],
      defaultLayout: "full_width",
      currentLayout: "full_width",
    })
  );

  assert.deepEqual(selection.allowedLayouts, ["one_by_n"]);
  assert.equal(selection.selectedLayout, "one_by_n");
  assert.equal(selection.reason, "legacy-full-width-fallback");

  const rendered = applyGalleryLayoutPresetToRenderObject(
    gallery({
      width: 400,
      gap: 8,
      allowedLayouts: ["full_width"],
      defaultLayout: "full_width",
      currentLayout: "full_width",
    })
  );

  assert.equal(rendered.currentLayout, "one_by_n");
  assert.equal(rendered.rows, 1);
  assert.equal(rendered.cols, 3);
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

test("editor selection exposes safe fallback layouts for draft galleries without allowedLayouts", () => {
  assert.deepEqual(getDefaultGalleryLayoutSelectorIds(), [
    "one_by_n",
    "two_by_n",
    "three_by_n",
    "squares",
  ]);

  const selection = resolveGalleryLayoutSelectionForEditor(
    gallery({
      allowedLayouts: undefined,
      defaultLayout: "",
      currentLayout: "",
    })
  );

  assert.deepEqual(selection.allowedLayouts, [
    "one_by_n",
    "two_by_n",
    "three_by_n",
    "squares",
  ]);
  assert.equal(selection.selectedLayout, "");
  assert.equal(selection.hasPresetContract, false);
  assert.equal(selection.reason, "editor-fallback-available");

  const selected = resolveGalleryLayoutSelectionForEditor(
    gallery({
      allowedLayouts: undefined,
      defaultLayout: "",
      currentLayout: "squares",
    })
  );

  assert.equal(selected.selectedLayout, "squares");
  assert.equal(selected.reason, "editor-fallback-selected");
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

test("row-count presets derive columns from gallery photo count and render height", () => {
  const original = gallery({
    width: 400,
    gap: 8,
    allowedLayouts: ["one_by_n", "two_by_n", "three_by_n"],
    defaultLayout: "one_by_n",
    currentLayout: "two_by_n",
    cells: [
      { mediaUrl: "https://cdn.test/a.jpg" },
      { mediaUrl: "https://cdn.test/b.jpg" },
      { mediaUrl: "https://cdn.test/c.jpg" },
      { mediaUrl: "https://cdn.test/d.jpg" },
    ],
  });

  const rendered = applyGalleryLayoutPresetToRenderObject(original);

  assert.equal(rendered.rows, 2);
  assert.equal(rendered.cols, 2);
  assert.equal(rendered.height, 400);
  assert.equal(rendered.cells, original.cells);

  const renderedTwoByThree = applyGalleryLayoutPresetToRenderObject({
    ...original,
    currentLayout: "three_by_n",
    cells: [...original.cells, { mediaUrl: "https://cdn.test/e.jpg" }],
  });
  const twoByThreeLayout = resolveGalleryRenderLayout({
    width: renderedTwoByThree.width,
    rows: renderedTwoByThree.rows,
    cols: renderedTwoByThree.cols,
    gap: renderedTwoByThree.gap,
    ratio: renderedTwoByThree.ratio,
    layoutMode: renderedTwoByThree.galleryLayoutMode,
    layoutType: renderedTwoByThree.galleryLayoutType,
    layoutBlueprint: renderedTwoByThree.galleryLayoutBlueprint,
    mediaUrls: renderedTwoByThree.cells.map((cell) => cell.mediaUrl),
    isMobile: false,
  });

  assert.equal(renderedTwoByThree.rows, 2);
  assert.equal(renderedTwoByThree.cols, 3);
  assert.equal(renderedTwoByThree.height, 264);
  assert.equal(twoByThreeLayout.rects.length, 6);
  assert.equal(twoByThreeLayout.rects[2].x, 272);
  assert.equal(twoByThreeLayout.rects[3].y, 136);
});

test("collage preset renders a two-image overlapping stack without deleting cells", () => {
  const original = gallery({
    width: 400,
    gap: 8,
    allowedLayouts: ["squares"],
    defaultLayout: "squares",
    currentLayout: "squares",
    cells: [
      { mediaUrl: "https://cdn.test/a.jpg" },
      { mediaUrl: "https://cdn.test/b.jpg" },
      { mediaUrl: "https://cdn.test/c.jpg" },
    ],
  });

  const rendered = applyGalleryLayoutPresetToRenderObject(original);
  const renderCellLimit = resolveGalleryLayoutRenderCellLimit(rendered);
  const layout = resolveGalleryRenderLayout({
    width: rendered.width,
    rows: rendered.rows,
    cols: rendered.cols,
    gap: rendered.gap,
    ratio: rendered.ratio,
    layoutMode: rendered.galleryLayoutMode,
    layoutType: rendered.galleryLayoutType,
    layoutBlueprint: rendered.galleryLayoutBlueprint,
    mediaUrls: rendered.cells.map((cell) => cell.mediaUrl).slice(0, renderCellLimit ?? undefined),
    isMobile: false,
  });

  assert.equal(rendered.galleryLayoutMode, "dynamic_media");
  assert.equal(rendered.galleryLayoutType, "canvas_preserve");
  assert.equal(rendered.rows, 1);
  assert.equal(rendered.cols, 2);
  assert.equal(renderCellLimit, 2);
  assert.equal(rendered.cells, original.cells);
  assert.equal(layout.rects.length, 2);
  assert.equal(layout.totalWidth, 400);
  assert.equal(rendered.height, layout.totalHeight);
  assert.equal(layout.rects[1].x > layout.rects[0].x, true);
  assert.equal(layout.rects[1].y > layout.rects[0].y, true);
  assert.equal(layout.rects[1].x < layout.rects[0].x + layout.rects[0].width, true);

  const emptyRendered = applyGalleryLayoutPresetToRenderObject({
    ...original,
    cells: [{ mediaUrl: "" }, { mediaUrl: null }],
  });
  const emptyLimit = resolveGalleryLayoutRenderCellLimit(emptyRendered);
  const emptyLayout = resolveGalleryRenderLayout({
    width: emptyRendered.width,
    rows: emptyRendered.rows,
    cols: emptyRendered.cols,
    gap: emptyRendered.gap,
    ratio: emptyRendered.ratio,
    layoutMode: emptyRendered.galleryLayoutMode,
    layoutType: emptyRendered.galleryLayoutType,
    layoutBlueprint: emptyRendered.galleryLayoutBlueprint,
    mediaUrls: Array.from({ length: emptyLimit }, (_, index) => `placeholder-${index}`),
    isMobile: false,
  });

  assert.equal(emptyRendered.galleryLayoutMode, "dynamic_media");
  assert.equal(emptyRendered.rows, 1);
  assert.equal(emptyRendered.cols, 2);
  assert.equal(emptyLimit, 2);
  assert.equal(emptyLayout.rects.length, 2);
  assert.equal(emptyLayout.rects[1].x < emptyLayout.rects[0].x + emptyLayout.rects[0].width, true);
});

test("legacy galleries without preset fields render unchanged", () => {
  const original = gallery();
  const rendered = applyGalleryLayoutPresetToRenderObject(original);

  assert.equal(rendered, original);
});
