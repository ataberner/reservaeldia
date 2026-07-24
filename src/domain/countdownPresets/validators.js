import {
  COUNTDOWN_DEFAULT_CATEGORY,
  COUNTDOWN_DEFAULT_VISIBLE_UNITS,
  COUNTDOWN_DISTRIBUTIONS,
  COUNTDOWN_ENTRY_ANIMATIONS,
  COUNTDOWN_EVENT_CATEGORIES,
  COUNTDOWN_FRAME_ANIMATIONS,
  COUNTDOWN_LABEL_TRANSFORMS,
  COUNTDOWN_LAYOUT_TYPES,
  COUNTDOWN_NUMERIC_LIMITS,
  COUNTDOWN_SVG_COLOR_MODES,
  COUNTDOWN_STYLE_CATEGORIES,
  COUNTDOWN_TICK_ANIMATIONS,
  COUNTDOWN_UNITS,
  buildCountdownCategoryLabel,
  createDefaultCountdownPresetConfig,
} from "./contract.js";
import { parseLinearGradientColors } from "../colors/presets.js";
import {
  normalizeCountdownFrameColorMode,
  resolveCountdownFrameAssetType,
  resolveCountdownFrameMimeType,
} from "./frameAssetContract.js";

function clampNumber(value, range) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return range.default;
  return Math.max(range.min, Math.min(range.max, parsed));
}

function optionalClampNumber(value, range) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
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

function isSafeCssPaint(value) {
  const safe = String(value || "").trim();
  if (!safe) return false;
  if (/[<>;]/.test(safe)) return false;
  if (/(url\s*\(|javascript:|expression\s*\()/i.test(safe)) return false;
  if (!/^[#(),.%\-+\s\w:/]*$/i.test(safe)) return false;
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
    if (CSS.supports("color", safe) || CSS.supports("background", safe)) return true;
  }
  if (parseLinearGradientColors(safe)) return true;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(safe)) return true;
  if (/^rgba?\([^)]+\)$/i.test(safe)) return true;
  if (/^hsla?\([^)]+\)$/i.test(safe)) return true;
  if (/^[a-z]+$/i.test(safe)) return true;
  return false;
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

  return unique;
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
  const frameAssetType = resolveCountdownFrameAssetType(svgRef, null);

  const normalized = {
    layout: {
      type: hasValueInSet(layout.type, COUNTDOWN_LAYOUT_TYPES)
        ? layout.type
        : base.layout.type,
      distribution: hasValueInSet(layout.distribution, COUNTDOWN_DISTRIBUTIONS)
        ? layout.distribution
        : base.layout.distribution,
      visibleUnits: normalizeVisibleUnits(layout.visibleUnits),
      chipWidth: optionalClampNumber(layout.chipWidth, COUNTDOWN_NUMERIC_LIMITS.chipWidth),
      gap: clampNumber(layout.gap, COUNTDOWN_NUMERIC_LIMITS.gap),
      framePadding: clampNumber(layout.framePadding, COUNTDOWN_NUMERIC_LIMITS.framePadding),
      frameScale: clampNumber(layout.frameScale, COUNTDOWN_NUMERIC_LIMITS.frameScale),
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
      numberColor: sanitizeCssPaint(colores.numberColor, base.colores.numberColor),
      labelColor: sanitizeCssPaint(colores.labelColor, base.colores.labelColor),
      frameColor: sanitizeCssPaint(colores.frameColor, base.colores.frameColor),
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
      type: frameAssetType,
      mimeType: resolveCountdownFrameMimeType(svgRef, frameAssetType),
      colorMode: normalizeCountdownFrameColorMode(
        frameAssetType,
        hasValueInSet(svgRef.colorMode, COUNTDOWN_SVG_COLOR_MODES)
          ? svgRef.colorMode
          : "fixed"
      ),
    },
  };

  return normalized;
}

function isFrameColor(value) {
  const safe = String(value || "").trim();
  if (!safe) return false;
  if (safe.toLowerCase() === "transparent") return true;
  if (parseLinearGradientColors(safe)) return false;
  return isSafeCssPaint(safe);
}

export function validateCountdownPresetInput({
  nombre,
  categoria,
  config,
  svgInspection,
}) {
  const errors = [];
  const warnings = [];
  const fieldErrors = {};
  const sectionErrors = {};

  const addError = (fieldId, sectionId, message) => {
    errors.push(message);
    if (fieldId && !fieldErrors[fieldId]) fieldErrors[fieldId] = message;
    if (sectionId) {
      sectionErrors[sectionId] = [
        ...(sectionErrors[sectionId] || []),
        message,
      ];
    }
  };

  const safeNombre = sanitizeText(nombre, "", 100);
  if (!safeNombre) {
    addError("nombre", "information", "El nombre del preset es obligatorio.");
  }

  const safeCategoria = normalizeCountdownCategory(categoria);
  const normalizedConfig = normalizeCountdownPresetConfig(config);

  if (!COUNTDOWN_EVENT_CATEGORIES.includes(String(categoria?.event || ""))) {
    addError(
      "categoria.event",
      "information",
      "Seleccioná una categoría de evento válida."
    );
  }
  if (!COUNTDOWN_STYLE_CATEGORIES.includes(String(categoria?.style || ""))) {
    addError(
      "categoria.style",
      "information",
      "Seleccioná una categoría visual válida."
    );
  }

  if (!Array.isArray(config?.layout?.visibleUnits) || !config.layout.visibleUnits.length) {
    addError(
      "layout.visibleUnits",
      "layout",
      "Seleccioná al menos una unidad visible."
    );
  }

  if (!COUNTDOWN_LAYOUT_TYPES.includes(config?.layout?.type)) {
    addError("layout.type", "layout", "Seleccioná un tipo de layout válido.");
  }
  if (!COUNTDOWN_DISTRIBUTIONS.includes(config?.layout?.distribution)) {
    addError(
      "layout.distribution",
      "layout",
      "Seleccioná una distribución válida."
    );
  }

  const numericFields = [
    ["layout.gap", "layout", config?.layout?.gap, COUNTDOWN_NUMERIC_LIMITS.gap, false, "Espaciado"],
    ["layout.framePadding", "layout", config?.layout?.framePadding, COUNTDOWN_NUMERIC_LIMITS.framePadding, false, "Padding del frame"],
    ["layout.frameScale", "frame", config?.layout?.frameScale, COUNTDOWN_NUMERIC_LIMITS.frameScale, false, "Tamaño del frame"],
    ["layout.chipWidth", "layout", config?.layout?.chipWidth, COUNTDOWN_NUMERIC_LIMITS.chipWidth, true, "Ancho del chip"],
    ["tamanoBase", "layout", config?.tamanoBase, COUNTDOWN_NUMERIC_LIMITS.tamanoBase, false, "Tamaño base"],
    ["tipografia.numberSize", "typography", config?.tipografia?.numberSize, COUNTDOWN_NUMERIC_LIMITS.numberSize, false, "Tamaño de números"],
    ["tipografia.labelSize", "typography", config?.tipografia?.labelSize, COUNTDOWN_NUMERIC_LIMITS.labelSize, false, "Tamaño de etiquetas"],
    ["tipografia.letterSpacing", "typography", config?.tipografia?.letterSpacing, COUNTDOWN_NUMERIC_LIMITS.letterSpacing, false, "Espaciado entre letras"],
    ["tipografia.lineHeight", "typography", config?.tipografia?.lineHeight, COUNTDOWN_NUMERIC_LIMITS.lineHeight, false, "Interlineado"],
    ["unidad.boxRadius", "colors", config?.unidad?.boxRadius, COUNTDOWN_NUMERIC_LIMITS.boxRadius, false, "Radio de unidad"],
  ];
  numericFields.forEach(
    ([fieldId, sectionId, rawValue, range, optional, label]) => {
      if (
        optional &&
        (rawValue === "" || rawValue === null || typeof rawValue === "undefined")
      ) {
        return;
      }
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed)) {
        addError(fieldId, sectionId, `${label} debe ser un número.`);
        return;
      }
      if (parsed < range.min || parsed > range.max) {
        addError(
          fieldId,
          sectionId,
          `${label} debe estar entre ${range.min} y ${range.max}.`
        );
      }
    }
  );

  if (!sanitizeText(config?.tipografia?.fontFamily, "", 120)) {
    addError(
      "tipografia.fontFamily",
      "typography",
      "Indicá una fuente para el countdown."
    );
  }
  if (!COUNTDOWN_LABEL_TRANSFORMS.includes(config?.tipografia?.labelTransform)) {
    addError(
      "tipografia.labelTransform",
      "typography",
      "Seleccioná una transformación de etiquetas válida."
    );
  }
  if (!COUNTDOWN_ENTRY_ANIMATIONS.includes(config?.animaciones?.entry)) {
    addError(
      "animaciones.entry",
      "animations",
      "Seleccioná una animación de entrada válida."
    );
  }
  if (!COUNTDOWN_TICK_ANIMATIONS.includes(config?.animaciones?.tick)) {
    addError(
      "animaciones.tick",
      "animations",
      "Seleccioná una animación de tick válida."
    );
  }
  if (!COUNTDOWN_FRAME_ANIMATIONS.includes(config?.animaciones?.frame)) {
    addError(
      "animaciones.frame",
      "animations",
      "Seleccioná una animación de frame válida."
    );
  }

  if (!isSafeCssPaint(config?.colores?.numberColor)) {
    addError(
      "colores.numberColor",
      "colors",
      "El color de los números debe ser un color o gradiente CSS seguro."
    );
  }
  if (!isSafeCssPaint(config?.colores?.labelColor)) {
    addError(
      "colores.labelColor",
      "colors",
      "El color de las etiquetas debe ser un color o gradiente CSS seguro."
    );
  }
  if (!isFrameColor(config?.colores?.frameColor)) {
    addError(
      "colores.frameColor",
      "frame",
      "El color del frame debe ser un color seguro o transparente."
    );
  }
  if (!isSafeCssPaint(config?.unidad?.boxBg)) {
    addError(
      "unidad.boxBg",
      "colors",
      "El fondo de la unidad no tiene un formato CSS válido."
    );
  }
  if (!isSafeCssPaint(config?.unidad?.boxBorder)) {
    addError(
      "unidad.boxBorder",
      "colors",
      "El borde de la unidad no tiene un formato CSS válido."
    );
  }

  if (svgInspection) {
    if (Array.isArray(svgInspection.criticalErrors) && svgInspection.criticalErrors.length > 0) {
      svgInspection.criticalErrors.forEach((message) =>
        addError("svgAsset", "frame", message)
      );
    }
    if (Array.isArray(svgInspection.warnings) && svgInspection.warnings.length > 0) {
      warnings.push(...svgInspection.warnings);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    fieldErrors,
    sectionErrors,
    firstField: Object.keys(fieldErrors)[0] || null,
    normalized: {
      nombre: safeNombre,
      categoria: safeCategoria,
      config: normalizedConfig,
    },
  };
}
