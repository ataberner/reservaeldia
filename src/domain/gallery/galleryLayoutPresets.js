import {
  GALLERY_COUNT_LAYOUT_PRESET_DEFINITIONS,
  GALLERY_GRID_SIZE_LAYOUT_PRESET_DEFINITIONS,
  GALLERY_LAYOUT_PRESET_DEFINITIONS,
  applyGalleryLayoutPresetToRenderObject,
  getGalleryCountLayoutPhotoCount,
  getGalleryCountLayoutPresetIds,
  getGalleryCountLayoutPresets,
  getGalleryGridSizeLayoutPresetIds,
  getGalleryGridSizeLayoutPresets,
  getGalleryLayoutPreset,
  getGalleryLayoutPresets,
  isGalleryCountLayoutPreset,
  isGalleryGridSizeLayoutPreset,
  isKnownGalleryLayoutPreset,
  isSelectableGalleryLayoutPreset,
  normalizeGalleryLayoutIds,
  resolveGalleryGridSizeSelection,
  resolveGalleryLayoutRenderCellLimit,
  resolveGalleryLayoutSelection,
} from "../../../shared/galleryLayoutPresets.js";

export const DEFAULT_GALLERY_LAYOUT_SELECTOR_IDS = Object.freeze([
  "one_by_n",
  "two_by_n",
  "three_by_n",
  "squares",
]);

export const GALLERY_COUNT_LAYOUT_SELECTOR_IDS = Object.freeze(
  getGalleryCountLayoutPresetIds()
);

export const GALLERY_GRID_SIZE_LAYOUT_SELECTOR_IDS = Object.freeze(
  getGalleryGridSizeLayoutPresetIds()
);

function hasExplicitAllowedLayouts(gallery) {
  const value = gallery?.allowedLayouts;
  if (Array.isArray(value)) {
    return value.some((entry) => String(entry || "").trim());
  }
  return Boolean(String(value || "").trim());
}

export function getDefaultGalleryLayoutSelectorIds() {
  return normalizeGalleryLayoutIds(DEFAULT_GALLERY_LAYOUT_SELECTOR_IDS);
}

export function getGalleryCountLayoutSelectorIds() {
  return normalizeGalleryLayoutIds(GALLERY_COUNT_LAYOUT_SELECTOR_IDS);
}

export function getGalleryGridSizeLayoutSelectorIds() {
  return normalizeGalleryLayoutIds(GALLERY_GRID_SIZE_LAYOUT_SELECTOR_IDS);
}

export function getGalleryCountLayoutSelectorOptions() {
  return getGalleryCountLayoutPresets().map((preset) => ({
    id: preset.id,
    label: preset.label,
    previewKind: preset.previewKind,
    photoCount: getGalleryCountLayoutPhotoCount(preset.id),
    rows: preset.render?.rows,
    cols: preset.render?.cols,
    ratio: preset.render?.ratio,
    minPhotos: preset.minPhotos,
    maxPhotos: preset.maxPhotos,
    recommendedPhotoCount: preset.recommendedPhotoCount,
    supportsDynamicMedia: preset.supportsDynamicMedia === true,
    emptyCellsAllowed: preset.emptyCellsAllowed === true,
  }));
}

export function resolveGalleryLayoutSelectionForEditor(gallery) {
  const selection = resolveGalleryLayoutSelection(gallery);
  if (selection.allowedLayouts.length > 0 || hasExplicitAllowedLayouts(gallery)) {
    return selection;
  }

  const fallbackAllowedLayouts = getDefaultGalleryLayoutSelectorIds();
  if (fallbackAllowedLayouts.length === 0) return selection;

  const defaultLayout = fallbackAllowedLayouts.includes(selection.rawDefaultLayout)
    ? selection.rawDefaultLayout
    : "";
  const currentLayout = fallbackAllowedLayouts.includes(selection.rawCurrentLayout)
    ? selection.rawCurrentLayout
    : "";
  const selectedLayout = currentLayout || defaultLayout || "";

  return {
    ...selection,
    allowedLayouts: fallbackAllowedLayouts,
    defaultLayout,
    currentLayout,
    selectedLayout,
    preset: selectedLayout ? getGalleryLayoutPreset(selectedLayout) : null,
    reason: selectedLayout ? "editor-fallback-selected" : "editor-fallback-available",
  };
}

export {
  GALLERY_COUNT_LAYOUT_PRESET_DEFINITIONS,
  GALLERY_GRID_SIZE_LAYOUT_PRESET_DEFINITIONS,
  GALLERY_LAYOUT_PRESET_DEFINITIONS,
  applyGalleryLayoutPresetToRenderObject,
  getGalleryCountLayoutPhotoCount,
  getGalleryCountLayoutPresetIds,
  getGalleryCountLayoutPresets,
  getGalleryGridSizeLayoutPresetIds,
  getGalleryGridSizeLayoutPresets,
  getGalleryLayoutPreset,
  getGalleryLayoutPresets,
  isGalleryCountLayoutPreset,
  isGalleryGridSizeLayoutPreset,
  isKnownGalleryLayoutPreset,
  isSelectableGalleryLayoutPreset,
  normalizeGalleryLayoutIds,
  resolveGalleryGridSizeSelection,
  resolveGalleryLayoutRenderCellLimit,
  resolveGalleryLayoutSelection,
};
