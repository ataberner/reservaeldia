import runtime from "./sectionDividerPresets.cjs";

export const SECTION_DIVIDER_DEFAULT_HEIGHT =
  runtime.SECTION_DIVIDER_DEFAULT_HEIGHT;
export const SECTION_DIVIDER_MIN_HEIGHT =
  runtime.SECTION_DIVIDER_MIN_HEIGHT;
export const SECTION_DIVIDER_MAX_HEIGHT =
  runtime.SECTION_DIVIDER_MAX_HEIGHT;
export const SECTION_DIVIDER_VIEW_BOX = runtime.SECTION_DIVIDER_VIEW_BOX;
export const SECTION_DIVIDER_PRESETS = runtime.SECTION_DIVIDER_PRESETS;
export const normalizeSectionDividerPresetId =
  runtime.normalizeSectionDividerPresetId;
export const normalizeSectionDividerHeight =
  runtime.normalizeSectionDividerHeight;
export const normalizeSectionDividers = runtime.normalizeSectionDividers;
export const resolveSectionDividerPreset =
  runtime.resolveSectionDividerPreset;
export const hasActiveSectionDividers =
  runtime.hasActiveSectionDividers;
export const resolveSectionDividerRenderSlots =
  runtime.resolveSectionDividerRenderSlots;
export const resolveSectionDividerFillColor =
  runtime.resolveSectionDividerFillColor;

export default runtime;
