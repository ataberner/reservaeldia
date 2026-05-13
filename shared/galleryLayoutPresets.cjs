"use strict";

const {
  resolveGalleryCellMediaUrl,
} = require("./renderAssetContract.cjs");
const {
  buildFixedGridLayout,
  buildGalleryLayoutBlueprint,
} = require("./templates/galleryDynamicLayout.cjs");

function normalizeText(value) {
  return String(value || "").trim();
}

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clonePlain(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(clonePlain);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clonePlain(entry)]));
}

const GALLERY_LAYOUT_PRESET_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "one_by_n",
    label: "1xN",
    previewKind: "row-1",
    minPhotos: 1,
    maxPhotos: null,
    recommendedPhotoCount: 4,
    emptyCellsAllowed: true,
    supportsDynamicMedia: false,
    selectableByEndUsers: true,
    render: Object.freeze({
      galleryLayoutMode: "fixed",
      galleryLayoutType: "canvas_preserve",
      rows: 1,
      cols: 4,
      ratio: "1:1",
      autoColumnsFromPhotos: true,
    }),
  }),
  Object.freeze({
    id: "two_by_n",
    label: "2xN",
    previewKind: "row-2",
    minPhotos: 1,
    maxPhotos: null,
    recommendedPhotoCount: 4,
    emptyCellsAllowed: true,
    supportsDynamicMedia: false,
    selectableByEndUsers: true,
    render: Object.freeze({
      galleryLayoutMode: "fixed",
      galleryLayoutType: "canvas_preserve",
      rows: 2,
      cols: 2,
      ratio: "1:1",
      autoColumnsFromPhotos: true,
    }),
  }),
  Object.freeze({
    id: "three_by_n",
    label: "2x3",
    previewKind: "row-3",
    minPhotos: 1,
    maxPhotos: 6,
    recommendedPhotoCount: 6,
    emptyCellsAllowed: true,
    supportsDynamicMedia: false,
    selectableByEndUsers: true,
    render: Object.freeze({
      galleryLayoutMode: "fixed",
      galleryLayoutType: "canvas_preserve",
      rows: 2,
      cols: 3,
      ratio: "1:1",
    }),
  }),
  Object.freeze({
    id: "squares",
    label: "Collage",
    previewKind: "collage",
    minPhotos: 1,
    maxPhotos: 2,
    recommendedPhotoCount: 2,
    emptyCellsAllowed: true,
    supportsDynamicMedia: false,
    selectableByEndUsers: true,
    render: Object.freeze({
      galleryLayoutMode: "fixed",
      galleryLayoutType: "canvas_preserve",
      rows: 1,
      cols: 2,
      ratio: "1:1",
      collageStack: true,
    }),
  }),
  Object.freeze({
    id: "banner",
    label: "Banner",
    previewKind: "wide",
    minPhotos: 1,
    maxPhotos: 1,
    recommendedPhotoCount: 1,
    emptyCellsAllowed: false,
    supportsDynamicMedia: false,
    selectableByEndUsers: true,
    render: Object.freeze({
      galleryLayoutMode: "fixed",
      galleryLayoutType: "canvas_preserve",
      rows: 1,
      cols: 1,
      ratio: "16:9",
    }),
  }),
  Object.freeze({
    id: "full_width",
    label: "Full width",
    previewKind: "wide",
    minPhotos: 1,
    maxPhotos: 1,
    recommendedPhotoCount: 1,
    emptyCellsAllowed: false,
    supportsDynamicMedia: false,
    selectableByEndUsers: false,
    render: Object.freeze({
      galleryLayoutMode: "fixed",
      galleryLayoutType: "canvas_preserve",
      rows: 1,
      cols: 1,
      ratio: "16:9",
    }),
  }),
  Object.freeze({
    id: "side_by_side",
    label: "Side by side",
    previewKind: "split",
    minPhotos: 2,
    maxPhotos: 2,
    recommendedPhotoCount: 2,
    emptyCellsAllowed: true,
    supportsDynamicMedia: false,
    selectableByEndUsers: true,
    render: Object.freeze({
      galleryLayoutMode: "fixed",
      galleryLayoutType: "canvas_preserve",
      rows: 1,
      cols: 2,
      ratio: "4:3",
    }),
  }),
  Object.freeze({
    id: "single_page",
    label: "Single page",
    previewKind: "single",
    minPhotos: 1,
    maxPhotos: 1,
    recommendedPhotoCount: 1,
    emptyCellsAllowed: false,
    supportsDynamicMedia: false,
    selectableByEndUsers: true,
    render: Object.freeze({
      galleryLayoutMode: "fixed",
      galleryLayoutType: "canvas_preserve",
      rows: 1,
      cols: 1,
      ratio: "4:3",
    }),
  }),
  Object.freeze({
    id: "slideshow",
    label: "Slideshow",
    previewKind: "carousel",
    minPhotos: 1,
    maxPhotos: null,
    recommendedPhotoCount: 6,
    emptyCellsAllowed: false,
    supportsDynamicMedia: true,
    selectableByEndUsers: false,
    render: null,
  }),
  Object.freeze({
    id: "marquee",
    label: "Marquee",
    previewKind: "strip",
    minPhotos: 3,
    maxPhotos: null,
    recommendedPhotoCount: 8,
    emptyCellsAllowed: false,
    supportsDynamicMedia: true,
    selectableByEndUsers: false,
    render: null,
  }),
  Object.freeze({
    id: "text_only",
    label: "Text only",
    previewKind: "text",
    minPhotos: 0,
    maxPhotos: 0,
    recommendedPhotoCount: 0,
    emptyCellsAllowed: true,
    supportsDynamicMedia: false,
    selectableByEndUsers: false,
    render: null,
  }),
]);

const PRESET_BY_ID = new Map(
  GALLERY_LAYOUT_PRESET_DEFINITIONS.map((preset) => [preset.id, preset])
);
const LEGACY_FULL_WIDTH_FALLBACK_LAYOUT_ID = "one_by_n";

function countPopulatedGalleryCells(gallery) {
  const cells = Array.isArray(gallery?.cells) ? gallery.cells : [];
  return cells.reduce((count, cell) => {
    return normalizeText(resolveGalleryCellMediaUrl(cell)) ? count + 1 : count;
  }, 0);
}

function resolvePresetPhotoCount(gallery, preset) {
  const populatedCount = countPopulatedGalleryCells(gallery);
  const recommendedCount = Math.max(0, Math.round(toFiniteNumber(preset?.recommendedPhotoCount, 0)));
  const rawMaxPhotos = preset?.maxPhotos;
  const maxPhotos =
    rawMaxPhotos === null || typeof rawMaxPhotos === "undefined"
      ? null
      : Math.max(0, Math.round(toFiniteNumber(rawMaxPhotos, 0)));

  let count = populatedCount || recommendedCount || 1;
  if (maxPhotos !== null && maxPhotos > 0) {
    count = Math.min(count, maxPhotos);
  }
  return Math.max(1, count);
}

function resolveAutoColumns(gallery, preset, render) {
  const rows = Math.max(1, Math.round(toFiniteNumber(render?.rows, 1)));
  const photoCount = resolvePresetPhotoCount(gallery, preset);
  return Math.max(1, Math.ceil(photoCount / rows));
}

function roundMetric(value) {
  return Math.round(toFiniteNumber(value, 0) * 1000) / 1000;
}

function buildCollageStackBlueprint(gallery) {
  const width = Math.max(1, toFiniteNumber(gallery?.width, 400));
  const gap = Math.max(0, toFiniteNumber(gallery?.gap, 0));
  const cellSize = roundMetric(width * 0.64);
  const verticalOffset = roundMetric(Math.max(gap, width * 0.08));

  return buildGalleryLayoutBlueprint({
    kind: "custom",
    width,
    baseHeight: roundMetric(cellSize + verticalOffset),
    slots: [
      {
        x: 0,
        y: 0,
        width: cellSize,
        height: cellSize,
      },
      {
        x: roundMetric(width - cellSize),
        y: verticalOffset,
        width: cellSize,
        height: cellSize,
      },
    ],
    anchor: "center",
  });
}

function applyFixedPresetHeight(next) {
  const mode = normalizeText(next?.galleryLayoutMode).toLowerCase();
  if (mode === "dynamic_media") return next;

  const width = toFiniteNumber(next?.width, null);
  if (!Number.isFinite(width) || width <= 0) return next;

  const layout = buildFixedGridLayout({
    width,
    rows: next.rows,
    cols: next.cols,
    gap: next.gap,
    ratio: next.ratio,
  });
  const totalHeight = toFiniteNumber(layout?.totalHeight, null);
  if (Number.isFinite(totalHeight) && totalHeight > 0) {
    next.height = totalHeight;
  }

  return next;
}

function clonePreset(preset) {
  return preset ? clonePlain(preset) : null;
}

function getGalleryLayoutPreset(id) {
  return clonePreset(PRESET_BY_ID.get(normalizeText(id)) || null);
}

function getGalleryLayoutPresets(options = {}) {
  const includeUnavailable = options.includeUnavailable === true;
  return GALLERY_LAYOUT_PRESET_DEFINITIONS
    .filter((preset) => includeUnavailable || preset.selectableByEndUsers === true)
    .map(clonePreset);
}

function isKnownGalleryLayoutPreset(id) {
  return PRESET_BY_ID.has(normalizeText(id));
}

function isSelectableGalleryLayoutPreset(id) {
  const preset = PRESET_BY_ID.get(normalizeText(id));
  return preset?.selectableByEndUsers === true;
}

function normalizeGalleryLayoutIds(value, options = {}) {
  const selectableOnly = options.selectableOnly !== false;
  const source = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const seen = new Set();
  const result = [];

  for (const entry of source) {
    const id = normalizeText(entry);
    if (!id || seen.has(id)) continue;

    const preset = PRESET_BY_ID.get(id);
    if (!preset) continue;
    if (selectableOnly && preset.selectableByEndUsers !== true) continue;

    seen.add(id);
    result.push(id);
  }

  return result;
}

function shouldUseLegacyFullWidthFallback({
  rawAllowedLayouts = [],
  rawDefaultLayout = "",
  rawCurrentLayout = "",
  selectableOnly = true,
} = {}) {
  if (!selectableOnly) return false;
  return (
    rawAllowedLayouts.includes("full_width") ||
    rawDefaultLayout === "full_width" ||
    rawCurrentLayout === "full_width"
  );
}

function resolveGalleryLayoutSelection(gallery, options = {}) {
  const selectableOnly = options.selectableOnly !== false;
  const rawAllowedLayouts = normalizeGalleryLayoutIds(gallery?.allowedLayouts, {
    ...options,
    selectableOnly: false,
  });
  let allowedLayouts = normalizeGalleryLayoutIds(gallery?.allowedLayouts, options);
  const rawDefaultLayout = normalizeText(gallery?.defaultLayout);
  const rawCurrentLayout = normalizeText(gallery?.currentLayout);
  const usedLegacyFullWidthFallback =
    allowedLayouts.length === 0 &&
    shouldUseLegacyFullWidthFallback({
      rawAllowedLayouts,
      rawDefaultLayout,
      rawCurrentLayout,
      selectableOnly,
    }) &&
    isSelectableGalleryLayoutPreset(LEGACY_FULL_WIDTH_FALLBACK_LAYOUT_ID);
  if (usedLegacyFullWidthFallback) {
    allowedLayouts = [LEGACY_FULL_WIDTH_FALLBACK_LAYOUT_ID];
  }
  const defaultLayout = allowedLayouts.includes(rawDefaultLayout) ? rawDefaultLayout : "";
  const currentLayout = allowedLayouts.includes(rawCurrentLayout) ? rawCurrentLayout : "";
  const selectedLayout = currentLayout || defaultLayout || allowedLayouts[0] || "";
  const preset = selectedLayout ? getGalleryLayoutPreset(selectedLayout) : null;
  const hasPresetContract = allowedLayouts.length > 0;

  let reason = hasPresetContract ? "selected" : "legacy-fields-authoritative";
  if (usedLegacyFullWidthFallback) {
    reason = "legacy-full-width-fallback";
  } else if (hasPresetContract && rawCurrentLayout && !currentLayout) {
    reason = "current-layout-not-allowed";
  } else if (hasPresetContract && !rawCurrentLayout && defaultLayout) {
    reason = "default-layout-selected";
  } else if (hasPresetContract && !rawCurrentLayout && !defaultLayout && selectedLayout) {
    reason = "first-allowed-selected";
  } else if (hasPresetContract && !selectedLayout) {
    reason = "no-valid-layout";
  }

  return {
    allowedLayouts,
    defaultLayout,
    currentLayout,
    rawDefaultLayout,
    rawCurrentLayout,
    selectedLayout,
    preset,
    hasPresetContract,
    hasLayoutFields: Boolean(rawAllowedLayouts.length || allowedLayouts.length || rawDefaultLayout || rawCurrentLayout),
    reason,
  };
}

function resolveGalleryLayoutRenderCellLimit(gallery, options = {}) {
  const selection = resolveGalleryLayoutSelection(gallery, options);
  const rawMaxPhotos = selection.preset?.maxPhotos;
  if (rawMaxPhotos === null || typeof rawMaxPhotos === "undefined") return null;

  const limit = Math.max(0, Math.round(toFiniteNumber(rawMaxPhotos, 0)));
  return Number.isFinite(limit) ? limit : null;
}

function applyGalleryLayoutPresetToRenderObject(gallery, options = {}) {
  if (!gallery || String(gallery?.tipo || "").trim() !== "galeria") return gallery;

  const selection = resolveGalleryLayoutSelection(gallery, options);
  const render = selection.preset?.render;
  if (!render || !selection.selectedLayout) return gallery;

  const next = {
    ...gallery,
    currentLayout: selection.selectedLayout,
  };

  if (render.galleryLayoutMode !== undefined) next.galleryLayoutMode = render.galleryLayoutMode;
  if (render.galleryLayoutType !== undefined) next.galleryLayoutType = render.galleryLayoutType;
  if (render.galleryLayoutBlueprint !== undefined) {
    next.galleryLayoutBlueprint = clonePlain(render.galleryLayoutBlueprint);
  }
  if (render.ratio !== undefined) next.ratio = render.ratio;

  if (render.collageStack === true) {
    next.galleryLayoutMode = "dynamic_media";
    next.galleryLayoutType = "canvas_preserve";
    next.galleryLayoutBlueprint = buildCollageStackBlueprint(next);
    if (Number.isFinite(Number(next.galleryLayoutBlueprint?.baseHeight))) {
      next.height = Number(next.galleryLayoutBlueprint.baseHeight);
    }
    if (render.rows !== undefined) next.rows = render.rows;
    if (render.cols !== undefined) next.cols = render.cols;
    return next;
  }

  if (render.preserveGrid !== true) {
    if (render.rows !== undefined) next.rows = render.rows;
    if (render.autoColumnsFromPhotos === true) {
      next.cols = resolveAutoColumns(gallery, selection.preset, render);
    } else if (render.cols !== undefined) {
      next.cols = render.cols;
    }
  }

  return applyFixedPresetHeight(next);
}

module.exports = {
  GALLERY_LAYOUT_PRESET_DEFINITIONS,
  applyGalleryLayoutPresetToRenderObject,
  getGalleryLayoutPreset,
  getGalleryLayoutPresets,
  isKnownGalleryLayoutPreset,
  isSelectableGalleryLayoutPreset,
  normalizeGalleryLayoutIds,
  resolveGalleryLayoutRenderCellLimit,
  resolveGalleryLayoutSelection,
};
