import {
  GALLERY_LAYOUT_PRESET_DEFINITIONS,
  applyGalleryLayoutPresetToRenderObject,
  getGalleryLayoutPreset,
  getGalleryLayoutPresets,
  isKnownGalleryLayoutPreset,
  isSelectableGalleryLayoutPreset,
  normalizeGalleryLayoutIds,
  resolveGalleryLayoutRenderCellLimit,
  resolveGalleryLayoutSelection,
} from "../../../shared/galleryLayoutPresets.js";

export const DEFAULT_GALLERY_LAYOUT_SELECTOR_IDS = Object.freeze([
  "one_by_n",
  "two_by_n",
  "three_by_n",
  "squares",
]);

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
