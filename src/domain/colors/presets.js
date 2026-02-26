const LINEAR_GRADIENT_PREFIX = "linear-gradient(";

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeValue(value) {
  return hasText(value) ? value.trim() : "";
}

function splitTopLevelArguments(input) {
  const chunks = [];
  let current = "";
  let depth = 0;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);

    if (char === "," && depth === 0) {
      chunks.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}

function isDirectionToken(token) {
  const normalized = normalizeValue(token).toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith("to ")) return true;
  return (
    normalized.endsWith("deg") ||
    normalized.endsWith("rad") ||
    normalized.endsWith("turn")
  );
}

function stripColorStop(rawToken) {
  const token = normalizeValue(rawToken);
  if (!token) return "";

  const cleaned = token.replace(
    /\s+(-?\d+(?:\.\d+)?%?)(?:\s+(-?\d+(?:\.\d+)?%?))?\s*$/i,
    ""
  );
  return cleaned.trim() || token;
}

export const SOLID_COLOR_PRESETS = Object.freeze([
  "#FFFFFF",
  "#F8FAFC",
  "#E2E8F0",
  "#CBD5E1",
  "#FEE2E2",
  "#FEF3C7",
  "#DCFCE7",
  "#DBEAFE",
  "#EDE9FE",
  "#FCE7F3",
  "#111827",
  "#020617",
]);

export const GRADIENT_COLOR_PRESETS = Object.freeze([
  {
    id: "aurora",
    label: "Aurora",
    value: "linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)",
  },
  {
    id: "ocean",
    label: "Ocean",
    value: "linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%)",
  },
  {
    id: "sunset",
    label: "Sunset",
    value: "linear-gradient(135deg, #F97316 0%, #EF4444 100%)",
  },
  {
    id: "emerald",
    label: "Emerald",
    value: "linear-gradient(135deg, #10B981 0%, #14B8A6 100%)",
  },
  {
    id: "champagne",
    label: "Champagne",
    value: "linear-gradient(135deg, #FB7185 0%, #F59E0B 100%)",
  },
  {
    id: "midnight",
    label: "Midnight",
    value: "linear-gradient(135deg, #334155 0%, #0F172A 100%)",
  },
]);

export function isLinearGradientValue(value) {
  const normalized = normalizeValue(value).toLowerCase();
  return (
    normalized.startsWith(LINEAR_GRADIENT_PREFIX) &&
    normalized.endsWith(")")
  );
}

export function parseLinearGradientColors(value) {
  const normalized = normalizeValue(value);
  if (!isLinearGradientValue(normalized)) return null;

  const inner = normalized
    .slice(LINEAR_GRADIENT_PREFIX.length, -1)
    .trim();
  if (!inner) return null;

  const rawArgs = splitTopLevelArguments(inner);
  if (rawArgs.length < 2) return null;

  const colorArgs = isDirectionToken(rawArgs[0]) ? rawArgs.slice(1) : rawArgs;
  if (colorArgs.length < 2) return null;

  const from = stripColorStop(colorArgs[0]);
  const to = stripColorStop(colorArgs[1]);

  if (!hasText(from) || !hasText(to)) return null;
  return { from, to };
}

export function toCssBackground(value, fallback = "#ffffff") {
  const normalized = normalizeValue(value);
  return normalized || fallback;
}

export function resolveSolidPickerValue(value, fallback = "#ffffff") {
  const normalized = normalizeValue(value);
  if (!normalized) return fallback;

  const gradient = parseLinearGradientColors(normalized);
  if (gradient) return gradient.from || fallback;
  return normalized;
}

export function resolveKonvaFill(value, width, height, fallback = "#ffffff") {
  const normalized = normalizeValue(value);
  const safeWidth = Number.isFinite(width) ? Math.max(1, Number(width)) : 1;
  const safeHeight = Number.isFinite(height) ? Math.max(1, Number(height)) : safeWidth;
  const gradient = parseLinearGradientColors(normalized);

  if (gradient) {
    return {
      hasGradient: true,
      fillColor: gradient.from,
      gradientFrom: gradient.from,
      gradientTo: gradient.to,
      startPoint: { x: 0, y: 0 },
      endPoint: { x: safeWidth, y: safeHeight },
    };
  }

  return {
    hasGradient: false,
    fillColor: normalized || fallback,
    gradientFrom: null,
    gradientTo: null,
    startPoint: null,
    endPoint: null,
  };
}
