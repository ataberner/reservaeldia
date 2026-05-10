"use strict";

function normalizeText(value) {
  return String(value || "").trim();
}

function clonePlain(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(clonePlain);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clonePlain(entry)]));
}

const GALLERY_LAYOUT_PRESET_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "squares",
    label: "Squares",
    previewKind: "grid",
    minPhotos: 1,
    maxPhotos: 36,
    recommendedPhotoCount: 4,
    emptyCellsAllowed: true,
    supportsDynamicMedia: false,
    selectableByEndUsers: true,
    render: Object.freeze({
      galleryLayoutMode: "fixed",
      galleryLayoutType: "canvas_preserve",
      ratio: "1:1",
      preserveGrid: true,
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

function resolveGalleryLayoutSelection(gallery, options = {}) {
  const allowedLayouts = normalizeGalleryLayoutIds(gallery?.allowedLayouts, options);
  const rawDefaultLayout = normalizeText(gallery?.defaultLayout);
  const rawCurrentLayout = normalizeText(gallery?.currentLayout);
  const defaultLayout = allowedLayouts.includes(rawDefaultLayout) ? rawDefaultLayout : "";
  const currentLayout = allowedLayouts.includes(rawCurrentLayout) ? rawCurrentLayout : "";
  const selectedLayout = currentLayout || defaultLayout || allowedLayouts[0] || "";
  const preset = selectedLayout ? getGalleryLayoutPreset(selectedLayout) : null;
  const hasPresetContract = allowedLayouts.length > 0;

  let reason = hasPresetContract ? "selected" : "legacy-fields-authoritative";
  if (hasPresetContract && rawCurrentLayout && !currentLayout) {
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
    hasLayoutFields: Boolean(allowedLayouts.length || rawDefaultLayout || rawCurrentLayout),
    reason,
  };
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

  if (render.preserveGrid !== true) {
    if (render.rows !== undefined) next.rows = render.rows;
    if (render.cols !== undefined) next.cols = render.cols;
  }

  return next;
}

module.exports = {
  GALLERY_LAYOUT_PRESET_DEFINITIONS,
  applyGalleryLayoutPresetToRenderObject,
  getGalleryLayoutPreset,
  getGalleryLayoutPresets,
  isKnownGalleryLayoutPreset,
  isSelectableGalleryLayoutPreset,
  normalizeGalleryLayoutIds,
  resolveGalleryLayoutSelection,
};
