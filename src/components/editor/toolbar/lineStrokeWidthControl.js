import { LINE_CONSTANTS } from "../../../models/lineConstants.js";

export const LINE_STROKE_WIDTH_MIN = 1;
export const LINE_STROKE_WIDTH_MAX = 50;
export const LINE_STROKE_WIDTH_DEFAULT = LINE_CONSTANTS.STROKE_WIDTH;

function toFiniteNumber(value) {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value === "string" && value.trim() === "") return null;

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function normalizeLineStrokeWidth(
  value,
  fallback = LINE_STROKE_WIDTH_DEFAULT
) {
  const numericValue = toFiniteNumber(value);
  const numericFallback = toFiniteNumber(fallback);
  const resolvedValue = numericValue ?? numericFallback ?? LINE_STROKE_WIDTH_DEFAULT;

  return Math.min(
    LINE_STROKE_WIDTH_MAX,
    Math.max(LINE_STROKE_WIDTH_MIN, Math.round(resolvedValue))
  );
}
