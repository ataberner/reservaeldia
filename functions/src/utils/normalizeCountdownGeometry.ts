function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCountdownObjectGeometry(
  value: Record<string, unknown>
): Record<string, unknown> {
  if (normalizeText(value.tipo).toLowerCase() !== "countdown") {
    return value;
  }

  const scaleX = toFiniteNumber(value.scaleX);
  const scaleY = toFiniteNumber(value.scaleY);
  const hasScaleX = scaleX !== null && scaleX !== 1;
  const hasScaleY = scaleY !== null && scaleY !== 1;

  if (!hasScaleX && !hasScaleY) {
    return value;
  }

  const next = { ...value };
  const width = toFiniteNumber(value.width);
  const height = toFiniteNumber(value.height);

  if (width !== null && scaleX !== null) {
    next.width = Math.abs(width * scaleX);
  }

  if (height !== null && scaleY !== null) {
    next.height = Math.abs(height * scaleY);
  }

  next.scaleX = 1;
  next.scaleY = 1;

  return next;
}

export function normalizeCountdownGeometryDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeCountdownGeometryDeep(entry));
  }

  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const normalizedEntries = Object.entries(source).map(([key, nested]) => [
      key,
      normalizeCountdownGeometryDeep(nested),
    ]);
    return normalizeCountdownObjectGeometry(Object.fromEntries(normalizedEntries));
  }

  return value;
}
