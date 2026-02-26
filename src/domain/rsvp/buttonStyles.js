export const DEFAULT_RSVP_BUTTON_STYLE_ID = "aurora_glow";
export const CUSTOM_SOLID_RSVP_BUTTON_STYLE_ID = "custom_solid";
export const CUSTOM_GRADIENT_RSVP_BUTTON_STYLE_ID = "custom_gradient";

export const RSVP_BUTTON_STYLE_PRESETS = Object.freeze([
  {
    id: "aurora_glow",
    name: "Aurora",
    gradientFrom: "#7C3AED",
    gradientTo: "#EC4899",
    textColor: "#FFFFFF",
    strokeColor: "rgba(255,255,255,0.34)",
    strokeWidth: 1.2,
    shadowColor: "rgba(124,58,237,0.42)",
    shadowBlur: 18,
    shadowOffsetY: 8,
  },
  {
    id: "ocean_shine",
    name: "Ocean",
    gradientFrom: "#0EA5E9",
    gradientTo: "#2563EB",
    textColor: "#F8FBFF",
    strokeColor: "rgba(255,255,255,0.32)",
    strokeWidth: 1.2,
    shadowColor: "rgba(14,165,233,0.35)",
    shadowBlur: 18,
    shadowOffsetY: 8,
  },
  {
    id: "sunset_punch",
    name: "Sunset",
    gradientFrom: "#F97316",
    gradientTo: "#EF4444",
    textColor: "#FFFFFF",
    strokeColor: "rgba(255,255,255,0.3)",
    strokeWidth: 1.2,
    shadowColor: "rgba(239,68,68,0.34)",
    shadowBlur: 18,
    shadowOffsetY: 8,
  },
  {
    id: "emerald_pop",
    name: "Emerald",
    gradientFrom: "#10B981",
    gradientTo: "#14B8A6",
    textColor: "#F5FFFD",
    strokeColor: "rgba(255,255,255,0.28)",
    strokeWidth: 1.2,
    shadowColor: "rgba(16,185,129,0.33)",
    shadowBlur: 18,
    shadowOffsetY: 8,
  },
  {
    id: "rose_gold",
    name: "Rose Gold",
    gradientFrom: "#FB7185",
    gradientTo: "#F59E0B",
    textColor: "#FFFFFF",
    strokeColor: "rgba(255,255,255,0.3)",
    strokeWidth: 1.2,
    shadowColor: "rgba(251,113,133,0.35)",
    shadowBlur: 18,
    shadowOffsetY: 8,
  },
]);

function hasString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasFinite(value) {
  return Number.isFinite(Number(value));
}

export function getRsvpButtonStyleById(styleId) {
  const normalizedId = hasString(styleId) ? styleId.trim() : "";
  return (
    RSVP_BUTTON_STYLE_PRESETS.find((preset) => preset.id === normalizedId) ||
    RSVP_BUTTON_STYLE_PRESETS.find((preset) => preset.id === DEFAULT_RSVP_BUTTON_STYLE_ID) ||
    RSVP_BUTTON_STYLE_PRESETS[0]
  );
}

export function createRsvpButtonStylePatch(styleId = DEFAULT_RSVP_BUTTON_STYLE_ID) {
  const preset = getRsvpButtonStyleById(styleId);
  return {
    rsvpStyleId: preset.id,
    fillMode: "gradient",
    gradientFrom: preset.gradientFrom,
    gradientTo: preset.gradientTo,
    color: preset.gradientFrom,
    colorTexto: preset.textColor,
    strokeColor: preset.strokeColor,
    strokeWidth: preset.strokeWidth,
    shadowColor: preset.shadowColor,
    shadowBlur: preset.shadowBlur,
    shadowOffsetY: preset.shadowOffsetY,
  };
}

export function createRsvpButtonSolidPatch(color = "#773dbe", textColor = "#ffffff") {
  return {
    rsvpStyleId: CUSTOM_SOLID_RSVP_BUTTON_STYLE_ID,
    fillMode: "solid",
    color,
    colorTexto: textColor,
    gradientFrom: null,
    gradientTo: null,
    strokeColor: "rgba(255,255,255,0.28)",
    strokeWidth: 1.1,
    shadowColor: "rgba(15,23,42,0.24)",
    shadowBlur: 14,
    shadowOffsetY: 6,
  };
}

export function createRsvpButtonGradientPatch(
  gradientFrom = "#7C3AED",
  gradientTo = "#EC4899",
  textColor = "#ffffff"
) {
  return {
    rsvpStyleId: CUSTOM_GRADIENT_RSVP_BUTTON_STYLE_ID,
    fillMode: "gradient",
    color: gradientFrom,
    colorTexto: textColor,
    gradientFrom,
    gradientTo,
    strokeColor: "rgba(255,255,255,0.28)",
    strokeWidth: 1.1,
    shadowColor: "rgba(15,23,42,0.24)",
    shadowBlur: 14,
    shadowOffsetY: 6,
  };
}

export function resolveRsvpButtonVisual(button = {}) {
  const preset = getRsvpButtonStyleById(button?.rsvpStyleId);
  const hasGradientOverride = hasString(button?.gradientFrom) && hasString(button?.gradientTo);
  const hasPresetId =
    hasString(button?.rsvpStyleId) &&
    button.rsvpStyleId !== CUSTOM_SOLID_RSVP_BUTTON_STYLE_ID;

  let fillMode = button?.fillMode;
  if (fillMode !== "gradient" && fillMode !== "solid") {
    fillMode = hasGradientOverride || hasPresetId ? "gradient" : "solid";
  }

  const gradientFrom = hasString(button?.gradientFrom)
    ? button.gradientFrom
    : preset.gradientFrom;
  const gradientTo = hasString(button?.gradientTo)
    ? button.gradientTo
    : preset.gradientTo;
  const fillColor = hasString(button?.color) ? button.color : gradientFrom;

  const hasGradient =
    fillMode === "gradient" &&
    hasString(gradientFrom) &&
    hasString(gradientTo);

  const strokeColor = hasString(button?.strokeColor)
    ? button.strokeColor
    : preset.strokeColor;
  const strokeWidth = hasFinite(button?.strokeWidth)
    ? Number(button.strokeWidth)
    : Number(preset.strokeWidth || 0);
  const shadowColor = hasString(button?.shadowColor)
    ? button.shadowColor
    : preset.shadowColor;
  const shadowBlur = hasFinite(button?.shadowBlur)
    ? Number(button.shadowBlur)
    : Number(preset.shadowBlur || 0);
  const shadowOffsetY = hasFinite(button?.shadowOffsetY)
    ? Number(button.shadowOffsetY)
    : Number(preset.shadowOffsetY || 0);
  const textColor = hasString(button?.colorTexto)
    ? button.colorTexto
    : preset.textColor;

  const cssBackground = hasGradient
    ? `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`
    : fillColor;
  const cssBorder = strokeWidth > 0 ? `${strokeWidth}px solid ${strokeColor}` : "none";
  const cssShadow =
    shadowBlur > 0
      ? `0 ${shadowOffsetY}px ${shadowBlur}px ${shadowColor}`
      : "none";

  return {
    styleId: hasString(button?.rsvpStyleId) ? button.rsvpStyleId : preset.id,
    hasGradient,
    fillColor,
    gradientFrom,
    gradientTo,
    strokeColor,
    strokeWidth,
    shadowColor,
    shadowBlur,
    shadowOffsetY,
    textColor,
    cssBackground,
    cssBorder,
    cssShadow,
  };
}
