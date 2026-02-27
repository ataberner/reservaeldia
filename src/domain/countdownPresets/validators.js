import {
  COUNTDOWN_DEFAULT_CATEGORY,
  COUNTDOWN_DEFAULT_VISIBLE_UNITS,
  COUNTDOWN_DISTRIBUTIONS,
  COUNTDOWN_ENTRY_ANIMATIONS,
  COUNTDOWN_FRAME_ANIMATIONS,
  COUNTDOWN_LABEL_TRANSFORMS,
  COUNTDOWN_LAYOUT_TYPES,
  COUNTDOWN_NUMERIC_LIMITS,
  COUNTDOWN_SVG_COLOR_MODES,
  COUNTDOWN_TICK_ANIMATIONS,
  COUNTDOWN_UNITS,
  buildCountdownCategoryLabel,
  createDefaultCountdownPresetConfig,
} from "@/domain/countdownPresets/contract";

function clampNumber(value, range) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return range.default;
  return Math.max(range.min, Math.min(range.max, parsed));
}

function hasValueInSet(value, setValues) {
  return setValues.includes(value);
}

function sanitizeText(value, fallback = "", maxLength = 160) {
  if (value === null || typeof value === "undefined") return fallback;
  const clean = String(value).replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  return clean.slice(0, maxLength);
}

function sanitizeCssPaint(value, fallback = "transparent") {
  const normalized = sanitizeText(value, "", 120);
  if (!normalized) return fallback;
  if (/[<>;]/.test(normalized)) return fallback;
  if (/(url\s*\(|javascript:|expression\s*\()/i.test(normalized)) return fallback;
  if (!/^[#(),.%\-+\s\w:/]*$/i.test(normalized)) return fallback;
  return normalized;
}

function normalizeVisibleUnits(units) {
  if (!Array.isArray(units)) return [...COUNTDOWN_DEFAULT_VISIBLE_UNITS];

  const normalized = units
    .map((unit) => String(unit || "").trim())
    .filter((unit) => COUNTDOWN_UNITS.includes(unit));

  const unique = [];
  normalized.forEach((unit) => {
    if (!unique.includes(unit)) unique.push(unit);
  });

  return unique.length > 0 ? unique : [...COUNTDOWN_DEFAULT_VISIBLE_UNITS];
}

export function normalizeCountdownCategory(input) {
  const event = sanitizeText(input?.event, COUNTDOWN_DEFAULT_CATEGORY.event, 60).toLowerCase();
  const style = sanitizeText(input?.style, COUNTDOWN_DEFAULT_CATEGORY.style, 60).toLowerCase();
  const customRaw = sanitizeText(input?.custom, "", 80);
  const custom = customRaw || null;

  const normalized = {
    event,
    style,
    custom,
    label: buildCountdownCategoryLabel({ event, style, custom }),
  };

  return normalized;
}

export function normalizeCountdownPresetConfig(rawConfig = {}) {
  const base = createDefaultCountdownPresetConfig();
  const layout = rawConfig?.layout || {};
  const tipografia = rawConfig?.tipografia || {};
  const colores = rawConfig?.colores || {};
  const animaciones = rawConfig?.animaciones || {};
  const unidad = rawConfig?.unidad || {};
  const svgRef = rawConfig?.svgRef || {};

  const normalized = {
    layout: {
      type: hasValueInSet(layout.type, COUNTDOWN_LAYOUT_TYPES)
        ? layout.type
        : base.layout.type,
      distribution: hasValueInSet(layout.distribution, COUNTDOWN_DISTRIBUTIONS)
        ? layout.distribution
        : base.layout.distribution,
      visibleUnits: normalizeVisibleUnits(layout.visibleUnits),
      gap: clampNumber(layout.gap, COUNTDOWN_NUMERIC_LIMITS.gap),
      framePadding: clampNumber(layout.framePadding, COUNTDOWN_NUMERIC_LIMITS.framePadding),
    },
    tipografia: {
      fontFamily: sanitizeText(tipografia.fontFamily, base.tipografia.fontFamily, 120),
      numberSize: clampNumber(tipografia.numberSize, COUNTDOWN_NUMERIC_LIMITS.numberSize),
      labelSize: clampNumber(tipografia.labelSize, COUNTDOWN_NUMERIC_LIMITS.labelSize),
      letterSpacing: clampNumber(
        tipografia.letterSpacing,
        COUNTDOWN_NUMERIC_LIMITS.letterSpacing
      ),
      lineHeight: clampNumber(tipografia.lineHeight, COUNTDOWN_NUMERIC_LIMITS.lineHeight),
      labelTransform: hasValueInSet(tipografia.labelTransform, COUNTDOWN_LABEL_TRANSFORMS)
        ? tipografia.labelTransform
        : base.tipografia.labelTransform,
    },
    colores: {
      numberColor: sanitizeText(colores.numberColor, base.colores.numberColor, 32),
      labelColor: sanitizeText(colores.labelColor, base.colores.labelColor, 32),
      frameColor: sanitizeText(colores.frameColor, base.colores.frameColor, 32),
    },
    animaciones: {
      entry: hasValueInSet(animaciones.entry, COUNTDOWN_ENTRY_ANIMATIONS)
        ? animaciones.entry
        : base.animaciones.entry,
      tick: hasValueInSet(animaciones.tick, COUNTDOWN_TICK_ANIMATIONS)
        ? animaciones.tick
        : base.animaciones.tick,
      frame: hasValueInSet(animaciones.frame, COUNTDOWN_FRAME_ANIMATIONS)
        ? animaciones.frame
        : base.animaciones.frame,
    },
    unidad: {
      showLabels: unidad.showLabels !== false,
      separator: sanitizeText(unidad.separator, base.unidad.separator, 4),
      boxBg: sanitizeCssPaint(unidad.boxBg, base.unidad.boxBg),
      boxBorder: sanitizeCssPaint(unidad.boxBorder, base.unidad.boxBorder),
      boxRadius: clampNumber(unidad.boxRadius, COUNTDOWN_NUMERIC_LIMITS.boxRadius),
      boxShadow: unidad.boxShadow === true,
    },
    tamanoBase: clampNumber(rawConfig?.tamanoBase, COUNTDOWN_NUMERIC_LIMITS.tamanoBase),
    svgRef: {
      colorMode: hasValueInSet(svgRef.colorMode, COUNTDOWN_SVG_COLOR_MODES)
        ? svgRef.colorMode
        : "fixed",
    },
  };

  return normalized;
}

function isHexColor(value) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || "").trim());
}

function isFrameColor(value) {
  const safe = String(value || "").trim().toLowerCase();
  return safe === "transparent" || isHexColor(safe);
}

export function validateCountdownPresetInput({
  nombre,
  categoria,
  config,
  svgInspection,
}) {
  const errors = [];
  const warnings = [];

  const safeNombre = sanitizeText(nombre, "", 100);
  if (!safeNombre) {
    errors.push("El nombre del preset es obligatorio.");
  }

  const safeCategoria = normalizeCountdownCategory(categoria);
  const normalizedConfig = normalizeCountdownPresetConfig(config);

  if (!Array.isArray(normalizedConfig.layout.visibleUnits) || !normalizedConfig.layout.visibleUnits.length) {
    errors.push("Debes seleccionar al menos una unidad visible.");
  }

  if (!isHexColor(normalizedConfig.colores.numberColor)) {
    errors.push("El color de numero debe ser hexadecimal.");
  }
  if (!isHexColor(normalizedConfig.colores.labelColor)) {
    errors.push("El color de label debe ser hexadecimal.");
  }
  if (!isFrameColor(normalizedConfig.colores.frameColor)) {
    errors.push("El color de frame debe ser hexadecimal o transparent.");
  }

  if (svgInspection) {
    if (Array.isArray(svgInspection.criticalErrors) && svgInspection.criticalErrors.length > 0) {
      errors.push(...svgInspection.criticalErrors);
    }
    if (Array.isArray(svgInspection.warnings) && svgInspection.warnings.length > 0) {
      warnings.push(...svgInspection.warnings);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalized: {
      nombre: safeNombre,
      categoria: safeCategoria,
      config: normalizedConfig,
    },
  };
}
