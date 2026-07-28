const SECTION_DIVIDER_DEFAULT_HEIGHT = 72;
const SECTION_DIVIDER_MIN_HEIGHT = 32;
const SECTION_DIVIDER_MAX_HEIGHT = 160;
const SECTION_DIVIDER_VIEW_BOX = "0 0 1000 100";

const SECTION_DIVIDER_PRESETS = Object.freeze([
  Object.freeze({
    id: "none",
    label: "Ninguno",
    viewBox: SECTION_DIVIDER_VIEW_BOX,
    path: "",
  }),
  Object.freeze({
    id: "wave-soft",
    label: "Onda suave",
    viewBox: SECTION_DIVIDER_VIEW_BOX,
    path: "M0 40 C170 10 330 10 500 40 C670 70 830 70 1000 40 L1000 100 L0 100 Z",
  }),
  Object.freeze({
    id: "wave-wide",
    label: "Onda amplia",
    viewBox: SECTION_DIVIDER_VIEW_BOX,
    path: "M0 58 C260 -4 740 -4 1000 58 L1000 100 L0 100 Z",
  }),
  Object.freeze({
    id: "wave-double",
    label: "Onda doble",
    viewBox: SECTION_DIVIDER_VIEW_BOX,
    path: "M0 48 C125 8 250 8 375 48 C500 88 625 88 750 48 C835 20 920 20 1000 48 L1000 100 L0 100 Z",
  }),
  Object.freeze({
    id: "wave-asymmetric",
    label: "Onda asimetrica",
    viewBox: SECTION_DIVIDER_VIEW_BOX,
    path: "M0 28 C150 72 285 78 430 44 C620 0 765 8 1000 62 L1000 100 L0 100 Z",
  }),
]);

const SECTION_DIVIDER_PRESET_MAP = new Map(
  SECTION_DIVIDER_PRESETS.map((preset) => [preset.id, preset])
);

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeSectionDividerPresetId(value) {
  const id = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SECTION_DIVIDER_PRESET_MAP.has(id) ? id : "none";
}

function normalizeSectionDividerHeight(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return SECTION_DIVIDER_DEFAULT_HEIGHT;
  return Math.min(
    SECTION_DIVIDER_MAX_HEIGHT,
    Math.max(SECTION_DIVIDER_MIN_HEIGHT, Math.round(parsed))
  );
}

function normalizeSectionDividers(value) {
  const safeValue = asObject(value);
  return {
    top: normalizeSectionDividerPresetId(safeValue.top),
    bottom: normalizeSectionDividerPresetId(safeValue.bottom),
    height: normalizeSectionDividerHeight(safeValue.height),
  };
}

function resolveSectionDividerPreset(value) {
  return (
    SECTION_DIVIDER_PRESET_MAP.get(
      normalizeSectionDividerPresetId(value)
    ) || SECTION_DIVIDER_PRESETS[0]
  );
}

function hasActiveSectionDividers(value) {
  const normalized = normalizeSectionDividers(value);
  return normalized.top !== "none" || normalized.bottom !== "none";
}

function resolveSectionDividerRenderSlots(value, { nextDividers = null } = {}) {
  const normalized = normalizeSectionDividers(value);
  const normalizedNext = normalizeSectionDividers(nextDividers);

  return {
    ...normalized,
    // A section boundary has one visual owner. The following section's top
    // divider wins over the preceding section's bottom divider because it is
    // painted later in normal document order.
    bottom:
      normalizedNext.top !== "none" ? "none" : normalized.bottom,
  };
}

function resolveSectionDividerFillColor(value, fallback = "#ffffff") {
  const source = typeof value === "string" ? value.trim() : "";
  if (!source) return fallback;

  const colorMatch = source.match(
    /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/i
  );
  if (colorMatch?.[0]) return colorMatch[0];

  if (/^[a-z]+$/i.test(source) && source.toLowerCase() !== "transparent") {
    return source;
  }

  return fallback;
}

module.exports = {
  SECTION_DIVIDER_DEFAULT_HEIGHT,
  SECTION_DIVIDER_MIN_HEIGHT,
  SECTION_DIVIDER_MAX_HEIGHT,
  SECTION_DIVIDER_VIEW_BOX,
  SECTION_DIVIDER_PRESETS,
  normalizeSectionDividerPresetId,
  normalizeSectionDividerHeight,
  normalizeSectionDividers,
  resolveSectionDividerPreset,
  hasActiveSectionDividers,
  resolveSectionDividerRenderSlots,
  resolveSectionDividerFillColor,
};
