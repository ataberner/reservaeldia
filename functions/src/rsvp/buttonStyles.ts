export const DEFAULT_RSVP_BUTTON_STYLE_ID = "aurora_glow";
export const CUSTOM_SOLID_RSVP_BUTTON_STYLE_ID = "custom_solid";

type ButtonStylePreset = {
  id: string;
  gradientFrom: string;
  gradientTo: string;
  textColor: string;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetY: number;
};

const RSVP_BUTTON_STYLE_PRESETS: ButtonStylePreset[] = [
  {
    id: "aurora_glow",
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
    gradientFrom: "#FB7185",
    gradientTo: "#F59E0B",
    textColor: "#FFFFFF",
    strokeColor: "rgba(255,255,255,0.3)",
    strokeWidth: 1.2,
    shadowColor: "rgba(251,113,133,0.35)",
    shadowBlur: 18,
    shadowOffsetY: 8,
  },
];

type AnyRecord = Record<string, unknown>;

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const next = value.trim();
  return next.length > 0 ? next : null;
}

function asFiniteNumber(value: unknown): number | null {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function getStyleById(styleId: unknown): ButtonStylePreset {
  const normalized = asNonEmptyString(styleId);
  return (
    RSVP_BUTTON_STYLE_PRESETS.find((preset) => preset.id === normalized) ||
    RSVP_BUTTON_STYLE_PRESETS.find((preset) => preset.id === DEFAULT_RSVP_BUTTON_STYLE_ID) ||
    RSVP_BUTTON_STYLE_PRESETS[0]
  );
}

export function resolveRsvpButtonVisual(input: AnyRecord = {}) {
  const preset = getStyleById(input.rsvpStyleId);
  const hasGradientOverride =
    Boolean(asNonEmptyString(input.gradientFrom)) &&
    Boolean(asNonEmptyString(input.gradientTo));
  const hasPresetId =
    Boolean(asNonEmptyString(input.rsvpStyleId)) &&
    input.rsvpStyleId !== CUSTOM_SOLID_RSVP_BUTTON_STYLE_ID;

  let fillMode = asNonEmptyString(input.fillMode);
  if (fillMode !== "gradient" && fillMode !== "solid") {
    fillMode = hasGradientOverride || hasPresetId ? "gradient" : "solid";
  }

  const gradientFrom = asNonEmptyString(input.gradientFrom) || preset.gradientFrom;
  const gradientTo = asNonEmptyString(input.gradientTo) || preset.gradientTo;
  const fillColor = asNonEmptyString(input.color) || gradientFrom;
  const textColor = asNonEmptyString(input.colorTexto) || preset.textColor;
  const strokeColor = asNonEmptyString(input.strokeColor) || preset.strokeColor;
  const strokeWidth = asFiniteNumber(input.strokeWidth) ?? preset.strokeWidth;
  const shadowColor = asNonEmptyString(input.shadowColor) || preset.shadowColor;
  const shadowBlur = asFiniteNumber(input.shadowBlur) ?? preset.shadowBlur;
  const shadowOffsetY = asFiniteNumber(input.shadowOffsetY) ?? preset.shadowOffsetY;

  const hasGradient =
    fillMode === "gradient" &&
    Boolean(asNonEmptyString(gradientFrom)) &&
    Boolean(asNonEmptyString(gradientTo));

  const cssBackground = hasGradient
    ? `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`
    : fillColor;
  const cssBorder = strokeWidth > 0 ? `${strokeWidth}px solid ${strokeColor}` : "none";
  const cssShadow = shadowBlur > 0
    ? `0 ${shadowOffsetY}px ${shadowBlur}px ${shadowColor}`
    : "none";

  return {
    hasGradient,
    fillColor,
    gradientFrom,
    gradientTo,
    textColor,
    strokeColor,
    strokeWidth,
    shadowColor,
    shadowBlur,
    shadowOffsetY,
    cssBackground,
    cssBorder,
    cssShadow,
  };
}

