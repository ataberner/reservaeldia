import { shouldPreserveTextCenterPosition } from "../../lib/textCenteringPolicy.js";
import {
  measureTextPositionFromPreviewSemantics,
} from "../../lib/templatePreviewTextMeasure.js";

const DEFAULT_TEXT_CONTAINER_WIDTH_PX = 800;
const DEFAULT_FIXED_TEXT_BOX_WIDTH_PX = 360;
const MIN_FIXED_TEXT_BOX_WIDTH_PX = 120;

function normalizeText(value) {
  return String(value || "").trim();
}

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeWrapMode(value) {
  const mode = normalizeText(value).toLowerCase();
  if (mode === "char") return "char";
  if (mode === "word") return "word";
  return "word";
}

function normalizeTextAlign(value) {
  const align = normalizeText(value).toLowerCase();
  if (align === "center" || align === "right") return align;
  return "left";
}

function resolveFixedTextBoxWidth(objeto, options = {}) {
  const currentWidth = toFiniteNumber(objeto?.width, null);
  if (Number.isFinite(currentWidth) && currentWidth > 0) {
    return currentWidth;
  }

  const requestedWidth = toFiniteNumber(options.width, null);
  if (options.defaultToMeasuredWidth === true) {
    const measuredWidth = toFiniteNumber(
      measureTextBox(objeto, objeto?.texto).width,
      null
    );
    if (Number.isFinite(measuredWidth) && measuredWidth > 0) {
      return Math.max(MIN_FIXED_TEXT_BOX_WIDTH_PX, measuredWidth);
    }
  }

  const fallbackWidth =
    Number.isFinite(requestedWidth) && requestedWidth > 0
      ? requestedWidth
      : DEFAULT_FIXED_TEXT_BOX_WIDTH_PX;
  return Math.max(MIN_FIXED_TEXT_BOX_WIDTH_PX, fallbackWidth);
}

export function buildFixedTextBoxLayoutPatch(objeto, options = {}) {
  if (!objeto || typeof objeto !== "object") return {};

  const width = resolveFixedTextBoxWidth(objeto, options);
  const textWrapMode = normalizeWrapMode(options.wrapMode);
  const patch = {};

  if (objeto.__autoWidth !== false) {
    patch.__autoWidth = false;
  }
  if (toFiniteNumber(objeto.width, null) !== width) {
    patch.width = width;
  }
  const currentWrapMode = normalizeText(objeto.textWrapMode)
    ? normalizeWrapMode(objeto.textWrapMode)
    : "";
  if (currentWrapMode !== textWrapMode) {
    patch.textWrapMode = textWrapMode;
  }
  const rawTextAlign =
    options.align ?? objeto.align ?? objeto.textAlign ?? objeto.alignment ?? objeto.alineacion;
  if (normalizeText(rawTextAlign)) {
    const textAlign = normalizeTextAlign(rawTextAlign);
    if (normalizeText(objeto.align).toLowerCase() !== textAlign) {
      patch.align = textAlign;
    }
  }

  return patch;
}

function parsePath(path) {
  const source = normalizeText(path);
  if (!source) return [];

  return source
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function cloneContainer(value, nextSegment) {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === "object") return { ...value };
  return /^\d+$/.test(nextSegment) ? [] : {};
}

function normalizeSectionMode(value) {
  return normalizeText(value).toLowerCase() === "pantalla" ? "pantalla" : "fijo";
}

export function buildSectionModeById(secciones) {
  const out = new Map();
  if (!Array.isArray(secciones)) return out;

  secciones.forEach((seccion) => {
    const sectionId = normalizeText(seccion?.id);
    if (!sectionId) return;
    out.set(sectionId, normalizeSectionMode(seccion?.altoModo));
  });

  return out;
}

export function buildTextMeasurementOptions(renderState = {}, overrides = {}) {
  const safeOverrides = overrides && typeof overrides === "object" ? overrides : {};
  const safeContainerWidthPx =
    toFiniteNumber(safeOverrides.containerWidthPx, DEFAULT_TEXT_CONTAINER_WIDTH_PX) ||
    DEFAULT_TEXT_CONTAINER_WIDTH_PX;

  return {
    containerWidthPx: safeContainerWidthPx,
    sectionModeById:
      safeOverrides.sectionModeById instanceof Map
        ? safeOverrides.sectionModeById
        : buildSectionModeById(renderState?.secciones),
  };
}

function resolveTextMeasurementContext(objeto, textMeasurementOptions) {
  const sectionModeById =
    textMeasurementOptions?.sectionModeById instanceof Map
      ? textMeasurementOptions.sectionModeById
      : null;
  const safeSectionId = normalizeText(objeto?.seccionId);

  return {
    containerWidthPx:
      toFiniteNumber(textMeasurementOptions?.containerWidthPx, DEFAULT_TEXT_CONTAINER_WIDTH_PX) ||
      DEFAULT_TEXT_CONTAINER_WIDTH_PX,
    sectionMode: normalizeSectionMode(sectionModeById?.get(safeSectionId)),
  };
}

function measureTextBox(objeto, textValue) {
  const fontSize = Math.max(6, toFiniteNumber(objeto?.fontSize, 24) || 24);
  const baseLineHeight = toFiniteNumber(objeto?.lineHeight, 1.2) || 1.2;
  const lineHeight = baseLineHeight * 0.92;
  const fontWeight = String(objeto?.fontWeight || "normal");
  const fontStyle = String(objeto?.fontStyle || "normal");
  const fontFamily = String(objeto?.fontFamily || "sans-serif");
  const letterSpacing = toFiniteNumber(objeto?.letterSpacing, 0) || 0;
  const normalizedText = String(textValue ?? "").replace(/[ \t]+$/gm, "");
  const lines = normalizedText.split(/\r?\n/);

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const fontForCanvas = fontFamily.includes(",")
        ? fontFamily
        : (/\s/.test(fontFamily) ? `"${fontFamily}"` : fontFamily);
      ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontForCanvas}`;

      const maxLineWidth = Math.max(
        ...lines.map((line) => {
          const safeLine = String(line || "");
          const baseWidth = ctx.measureText(safeLine).width;
          const spacingExtra = Math.max(0, safeLine.length - 1) * letterSpacing;
          return baseWidth + spacingExtra;
        }),
        20
      );

      return {
        width: maxLineWidth,
        height: fontSize * lineHeight * Math.max(lines.length, 1),
      };
    }
  }

  const fallbackWidth = Math.max(
    20,
    ...lines.map((line) => {
      const safeLine = String(line || "");
      return safeLine.length * (fontSize * 0.55) + Math.max(0, safeLine.length - 1) * letterSpacing;
    })
  );

  return {
    width: fallbackWidth,
    height: fontSize * lineHeight * Math.max(lines.length, 1),
  };
}

function getTextBoxCenter(objeto, textValue) {
  const x = toFiniteNumber(objeto?.x, 0) || 0;
  const y = toFiniteNumber(objeto?.y, 0) || 0;
  const rotationRad = ((toFiniteNumber(objeto?.rotation, 0) || 0) * Math.PI) / 180;
  const { width, height } = measureTextBox(objeto, textValue);
  const scaleX = toFiniteNumber(objeto?.scaleX, 1) || 1;
  const scaleY = toFiniteNumber(objeto?.scaleY, 1) || 1;
  const halfWidth = (width * scaleX) / 2;
  const halfHeight = (height * scaleY) / 2;

  return {
    centerX: x + (halfWidth * Math.cos(rotationRad)) - (halfHeight * Math.sin(rotationRad)),
    centerY: y + (halfWidth * Math.sin(rotationRad)) + (halfHeight * Math.cos(rotationRad)),
  };
}

function getTextPositionFromCenter(objeto, textValue, centerX, centerY) {
  const rotationRad = ((toFiniteNumber(objeto?.rotation, 0) || 0) * Math.PI) / 180;
  const { width, height } = measureTextBox(objeto, textValue);
  const scaleX = toFiniteNumber(objeto?.scaleX, 1) || 1;
  const scaleY = toFiniteNumber(objeto?.scaleY, 1) || 1;
  const halfWidth = (width * scaleX) / 2;
  const halfHeight = (height * scaleY) / 2;
  const offsetX = (halfWidth * Math.cos(rotationRad)) - (halfHeight * Math.sin(rotationRad));
  const offsetY = (halfWidth * Math.sin(rotationRad)) + (halfHeight * Math.cos(rotationRad));

  return {
    x: Number(centerX) - offsetX,
    y: Number(centerY) - offsetY,
  };
}

export function buildTextValuePatchPreservingCenter(
  objeto,
  nextText,
  textMeasurementOptions,
  options = {}
) {
  if (!objeto || typeof objeto !== "object") return null;

  const safeOptions = options && typeof options === "object" ? options : {};
  const currentText = String(objeto.texto ?? "");
  const resolvedNextText = String(nextText ?? "");
  const fixedTextBoxPatch =
    safeOptions.fixedTextBox === true
      ? buildFixedTextBoxLayoutPatch(objeto, safeOptions)
      : {};
  if (
    currentText === resolvedNextText &&
    Object.keys(fixedTextBoxPatch).length === 0
  ) {
    return null;
  }

  if (safeOptions.fixedTextBox === true) {
    return {
      ...(currentText === resolvedNextText ? {} : { texto: resolvedNextText }),
      ...fixedTextBoxPatch,
    };
  }

  const patch = { texto: resolvedNextText };
  const shouldPreserveCenter = shouldPreserveTextCenterPosition(objeto);
  const currentCenter = shouldPreserveCenter
    ? getTextBoxCenter(objeto, currentText)
    : null;
  const previewSemanticMeasure = shouldPreserveCenter
    ? measureTextPositionFromPreviewSemantics({
        objeto,
        nextText: resolvedNextText,
        ...resolveTextMeasurementContext(objeto, textMeasurementOptions),
      })
    : null;

  if (
    shouldPreserveCenter &&
    previewSemanticMeasure?.usedFallback === false &&
    Number.isFinite(previewSemanticMeasure?.x) &&
    Number.isFinite(previewSemanticMeasure?.y)
  ) {
    patch.x = previewSemanticMeasure.x;
    patch.y = previewSemanticMeasure.y;
    return patch;
  }

  if (
    !shouldPreserveCenter ||
    !Number.isFinite(currentCenter?.centerX) ||
    !Number.isFinite(currentCenter?.centerY)
  ) {
    return patch;
  }

  const nextPosition = getTextPositionFromCenter(
    objeto,
    resolvedNextText,
    currentCenter.centerX,
    currentCenter.centerY
  );

  if (Number.isFinite(nextPosition?.x)) {
    patch.x = nextPosition.x;
  }
  if (Number.isFinite(nextPosition?.y)) {
    patch.y = nextPosition.y;
  }

  return patch;
}

export function buildObjectTargetPatch({
  object,
  path,
  value,
  textMeasurementOptions,
  textTargetOptions = null,
} = {}) {
  if (!object || typeof object !== "object") return null;
  const segments = parsePath(path);
  if (!segments.length) return null;

  if (
    segments.length === 1 &&
    normalizeText(segments[0]).toLowerCase() === "texto" &&
    normalizeText(object.tipo).toLowerCase() === "texto"
  ) {
    return buildTextValuePatchPreservingCenter(
      object,
      value,
      textMeasurementOptions,
      textTargetOptions
    );
  }

  if (segments.length === 1) {
    const key = segments[0];
    if (object[key] === value) return null;
    return { [key]: value };
  }

  const rootKey = segments[0];
  const rootValue = cloneContainer(object[rootKey], segments[1]);
  let current = rootValue;

  for (let index = 1; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const nextSegment = segments[index + 1];
    const nextValue = cloneContainer(current[segment], nextSegment);
    current[segment] = nextValue;
    current = nextValue;
  }

  current[segments[segments.length - 1]] = value;
  return { [rootKey]: rootValue };
}
