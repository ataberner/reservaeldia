export const COUNTDOWN_PRESET_SCHEMA_VERSION = 2;
export const COUNTDOWN_RENDER_CONTRACT_VERSION = 2;

export const COUNTDOWN_LAYOUT_TYPES = Object.freeze(["singleFrame", "multiUnit"]);
export const COUNTDOWN_DISTRIBUTIONS = Object.freeze([
  "centered",
  "vertical",
  "grid",
  "editorial",
]);
export const COUNTDOWN_UNITS = Object.freeze(["days", "hours", "minutes", "seconds"]);
export const COUNTDOWN_ENTRY_ANIMATIONS = Object.freeze([
  "fadeUp",
  "fadeIn",
  "scaleIn",
  "none",
]);
export const COUNTDOWN_TICK_ANIMATIONS = Object.freeze(["flipSoft", "pulse", "none"]);
export const COUNTDOWN_FRAME_ANIMATIONS = Object.freeze([
  "rotateSlow",
  "shimmer",
  "none",
]);
export const COUNTDOWN_LABEL_TRANSFORMS = Object.freeze([
  "none",
  "uppercase",
  "lowercase",
  "capitalize",
]);
export const COUNTDOWN_SVG_COLOR_MODES = Object.freeze(["currentColor", "fixed"]);

export const COUNTDOWN_EVENT_CATEGORIES = Object.freeze([
  "boda",
  "quince",
  "cumpleanos",
  "aniversario",
  "baby-shower",
  "corporativo",
  "general",
]);
export const COUNTDOWN_STYLE_CATEGORIES = Object.freeze([
  "minimal",
  "floral",
  "romantico",
  "editorial",
  "moderno",
  "clasico",
  "premium",
]);

export const COUNTDOWN_DEFAULT_VISIBLE_UNITS = Object.freeze([
  "days",
  "hours",
  "minutes",
  "seconds",
]);

export const COUNTDOWN_DEFAULT_CATEGORY = Object.freeze({
  event: "general",
  style: "minimal",
  custom: null,
  label: "General / Minimal",
});

export const COUNTDOWN_NUMERIC_LIMITS = Object.freeze({
  tamanoBase: { min: 220, max: 640, default: 320 },
  gap: { min: 0, max: 48, default: 8 },
  framePadding: { min: 0, max: 64, default: 10 },
  numberSize: { min: 10, max: 120, default: 28 },
  labelSize: { min: 8, max: 72, default: 12 },
  letterSpacing: { min: -2, max: 12, default: 0 },
  lineHeight: { min: 0.8, max: 2, default: 1.05 },
  boxRadius: { min: 0, max: 120, default: 10 },
});

function toTitleLike(text) {
  return String(text || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function buildCountdownCategoryLabel(category = {}) {
  const eventLabel = toTitleLike(category.event || "general");
  const styleLabel = toTitleLike(category.style || "minimal");
  const custom = String(category.custom || "").trim();
  if (custom) return `${eventLabel} / ${styleLabel} / ${custom}`;
  return `${eventLabel} / ${styleLabel}`;
}

export function createDefaultCountdownPresetConfig() {
  return {
    layout: {
      type: "singleFrame",
      distribution: "centered",
      visibleUnits: [...COUNTDOWN_DEFAULT_VISIBLE_UNITS],
      gap: COUNTDOWN_NUMERIC_LIMITS.gap.default,
      framePadding: COUNTDOWN_NUMERIC_LIMITS.framePadding.default,
    },
    tipografia: {
      fontFamily: "Poppins",
      numberSize: COUNTDOWN_NUMERIC_LIMITS.numberSize.default,
      labelSize: COUNTDOWN_NUMERIC_LIMITS.labelSize.default,
      letterSpacing: COUNTDOWN_NUMERIC_LIMITS.letterSpacing.default,
      lineHeight: COUNTDOWN_NUMERIC_LIMITS.lineHeight.default,
      labelTransform: "uppercase",
    },
    colores: {
      numberColor: "#111111",
      labelColor: "#4b5563",
      frameColor: "#773dbe",
    },
    animaciones: {
      entry: "fadeUp",
      tick: "flipSoft",
      frame: "none",
    },
    unidad: {
      showLabels: true,
      separator: "",
      boxBg: "transparent",
      boxBorder: "transparent",
      boxRadius: COUNTDOWN_NUMERIC_LIMITS.boxRadius.default,
      boxShadow: false,
    },
    tamanoBase: COUNTDOWN_NUMERIC_LIMITS.tamanoBase.default,
  };
}

export function createDefaultCountdownPresetDraft() {
  return {
    id: null,
    nombre: "",
    categoria: { ...COUNTDOWN_DEFAULT_CATEGORY },
    config: createDefaultCountdownPresetConfig(),
    svgRef: null,
    validationReport: {
      warnings: [],
      checks: {},
    },
  };
}
