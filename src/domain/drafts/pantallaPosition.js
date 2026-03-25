const ALTURA_PANTALLA_FALLBACK = 500;

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clamp01(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return null;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeSectionMode(value) {
  return String(value || "").trim().toLowerCase() === "pantalla"
    ? "pantalla"
    : "fijo";
}

export function normalizePantallaObjectPosition(
  object,
  {
    sectionMode = "fijo",
    alturaPantalla = ALTURA_PANTALLA_FALLBACK,
  } = {}
) {
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    return object;
  }

  if (normalizeSectionMode(sectionMode) !== "pantalla") {
    if (!Object.prototype.hasOwnProperty.call(object, "yNorm")) {
      return object;
    }
    const next = { ...object };
    delete next.yNorm;
    return next;
  }

  const safeHeight = toFiniteNumber(alturaPantalla) || ALTURA_PANTALLA_FALLBACK;
  const yNorm = clamp01(object.yNorm);

  if (yNorm !== null) {
    return {
      ...object,
      y: yNorm * safeHeight,
      yNorm,
    };
  }

  const y = toFiniteNumber(object.y);
  if (y === null) {
    return object;
  }

  return {
    ...object,
    y,
    yNorm: Math.max(0, Math.min(1, y / safeHeight)),
  };
}
