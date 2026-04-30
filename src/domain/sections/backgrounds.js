import {
  resolveObjectPrimaryAssetUrl,
  resolveSectionDecorationAssetUrl,
  resolveSectionEdgeDecorationAssetUrl,
} from "../../../shared/renderAssetContract.js";
const CANVAS_WIDTH = 800;
const DEFAULT_SECTION_HEIGHT = 600;
const DEFAULT_DECORATION_WIDTH = 220;
const DEFAULT_DECORATION_HEIGHT = 160;
const MIN_DECORATION_SIZE = 32;
const MIN_VISIBLE_DECORATION_PORTION = 24;
const DEFAULT_EDGE_DECORATION_DESKTOP_HEIGHT_RATIO = 0.36;
const DEFAULT_EDGE_DECORATION_MOBILE_HEIGHT_RATIO = 0.2;
const MIN_EDGE_DECORATION_DESKTOP_HEIGHT_RATIO = 0.08;
const MAX_EDGE_DECORATION_DESKTOP_HEIGHT_RATIO = 0.55;
const MIN_EDGE_DECORATION_MOBILE_HEIGHT_RATIO = 0.08;
const MAX_EDGE_DECORATION_MOBILE_HEIGHT_RATIO = 0.32;
const DEFAULT_EDGE_DECORATION_HEIGHT_MODEL = "intrinsic-clamp";
const DEFAULT_EDGE_DECORATION_DESKTOP_MIN_HEIGHT_PX = 96;
const DEFAULT_EDGE_DECORATION_DESKTOP_MAX_HEIGHT_PX = 280;
const DEFAULT_EDGE_DECORATION_DESKTOP_MAX_SECTION_RATIO = 0.3;
const DEFAULT_EDGE_DECORATION_DESKTOP_COMBINED_SECTION_RATIO = 0.58;
const DEFAULT_EDGE_DECORATION_MOBILE_MIN_HEIGHT_PX = 64;
const DEFAULT_EDGE_DECORATION_MOBILE_MAX_HEIGHT_PX = 150;
const DEFAULT_EDGE_DECORATION_MOBILE_MAX_SECTION_RATIO = 0.24;
const DEFAULT_EDGE_DECORATION_MOBILE_COMBINED_SECTION_RATIO = 0.4;
const MIN_EDGE_DECORATION_HEIGHT_PX = 24;
const MAX_EDGE_DECORATION_DESKTOP_HEIGHT_PX = 640;
const MAX_EDGE_DECORATION_MOBILE_HEIGHT_PX = 360;
const MIN_EDGE_DECORATION_COMBINED_SECTION_RATIO = 0.16;
const MAX_EDGE_DECORATION_DESKTOP_COMBINED_SECTION_RATIO = 0.75;
const MAX_EDGE_DECORATION_MOBILE_COMBINED_SECTION_RATIO = 0.6;
const DEFAULT_EDGE_DECORATION_FALLBACK_ASPECT_RATIO = 0.22;
const MAX_EDGE_DECORATION_OFFSET_PX = 240;
export const BACKGROUND_DECORATION_PARALLAX_VALUES = Object.freeze([
  "none",
  "soft",
  "dynamic",
]);
const BACKGROUND_DECORATION_PARALLAX_SET = new Set(
  BACKGROUND_DECORATION_PARALLAX_VALUES
);

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeText(value) {
  return String(value || "").trim();
}

export function sanitizeBackgroundDecorationParallax(value, fallback = "none") {
  const normalized = normalizeText(value).toLowerCase();
  if (BACKGROUND_DECORATION_PARALLAX_SET.has(normalized)) {
    return normalized;
  }

  const fallbackNormalized = normalizeText(fallback).toLowerCase();
  if (BACKGROUND_DECORATION_PARALLAX_SET.has(fallbackNormalized)) {
    return fallbackNormalized;
  }

  return "none";
}

function toPositiveNumber(value, fallback = null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveSectionBaseImageScale(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toOrderNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function buildLegacyDecorationId(slot) {
  return `legacy-${normalizeText(slot).toLowerCase() || "decoracion"}`;
}

function getEdgeDecorationFallbackName(slot) {
  return slot === "top" ? "Decoración arriba" : "Decoración abajo";
}

function normalizeEdgeDecorationMode(value) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === "contain-x" ? "contain-x" : "cover-x";
}

function normalizeEdgeDecorationHeightModel(value) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === "ratio-band" ? "ratio-band" : DEFAULT_EDGE_DECORATION_HEIGHT_MODEL;
}

function normalizeEdgeDecorationRatio(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return clamp(parsed, min, max);
}

function hasPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function normalizeEdgeDecorationDimension(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(clamp(parsed, 1, 20000) * 100) / 100;
}

function normalizeEdgeDecorationHeightPx(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(clamp(parsed, MIN_EDGE_DECORATION_HEIGHT_PX, max));
}

function normalizeEdgeDecorationMaxSectionRatio(
  value,
  legacyRatioValue,
  fallback,
  max
) {
  if (hasPositiveNumber(value)) {
    return normalizeEdgeDecorationRatio(value, fallback, 0.08, max);
  }

  if (hasPositiveNumber(legacyRatioValue)) {
    return normalizeEdgeDecorationRatio(legacyRatioValue, fallback, 0.08, max);
  }

  return fallback;
}

function normalizeEdgeDecorationOffsetPx(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return clamp(parsed, -MAX_EDGE_DECORATION_OFFSET_PX, MAX_EDGE_DECORATION_OFFSET_PX);
}

function normalizeEdgeDecorationsLayout(rawLayout) {
  const safeRaw = asObject(rawLayout);
  return {
    maxCombinedSectionRatioDesktop: normalizeEdgeDecorationRatio(
      safeRaw.maxCombinedSectionRatioDesktop,
      DEFAULT_EDGE_DECORATION_DESKTOP_COMBINED_SECTION_RATIO,
      MIN_EDGE_DECORATION_COMBINED_SECTION_RATIO,
      MAX_EDGE_DECORATION_DESKTOP_COMBINED_SECTION_RATIO
    ),
    maxCombinedSectionRatioMobile: normalizeEdgeDecorationRatio(
      safeRaw.maxCombinedSectionRatioMobile,
      DEFAULT_EDGE_DECORATION_MOBILE_COMBINED_SECTION_RATIO,
      MIN_EDGE_DECORATION_COMBINED_SECTION_RATIO,
      MAX_EDGE_DECORATION_MOBILE_COMBINED_SECTION_RATIO
    ),
  };
}

function hasEdgeDecorationSlots(decoracionesBorde) {
  return Boolean(decoracionesBorde?.top || decoracionesBorde?.bottom);
}

function resolveEdgeDecorationAspectRatio(decoration, image) {
  const intrinsicWidth =
    normalizeEdgeDecorationDimension(decoration?.intrinsicWidth) ||
    normalizeEdgeDecorationDimension(image?.width);
  const intrinsicHeight =
    normalizeEdgeDecorationDimension(decoration?.intrinsicHeight) ||
    normalizeEdgeDecorationDimension(image?.height);

  if (intrinsicWidth && intrinsicHeight) {
    return intrinsicHeight / intrinsicWidth;
  }

  return DEFAULT_EDGE_DECORATION_FALLBACK_ASPECT_RATIO;
}

export function resolveEdgeDecorationCanvasHeight(
  decoration,
  {
    image,
    imageWidth,
    imageHeight,
    sectionHeight = DEFAULT_SECTION_HEIGHT,
    canvasWidth = CANVAS_WIDTH,
    isMobile = false,
  } = {}
) {
  const safeDecoration = asObject(decoration);
  const safeCanvasWidth = resolveCanvasWidth(canvasWidth);
  const safeSectionHeight = resolveSectionHeight(sectionHeight);
  const rawImage =
    image ||
    (imageWidth || imageHeight
      ? {
          width: imageWidth,
          height: imageHeight,
        }
      : null);
  const aspectRatio = resolveEdgeDecorationAspectRatio(safeDecoration, rawImage);
  const naturalHeight = Math.max(1, Math.round(safeCanvasWidth * aspectRatio));

  if (normalizeEdgeDecorationHeightModel(safeDecoration.heightModel) === "ratio-band") {
    return naturalHeight;
  }

  const minHeight = isMobile
    ? normalizeEdgeDecorationHeightPx(
        safeDecoration.minHeightMobilePx,
        DEFAULT_EDGE_DECORATION_MOBILE_MIN_HEIGHT_PX,
        MAX_EDGE_DECORATION_MOBILE_HEIGHT_PX
      )
    : normalizeEdgeDecorationHeightPx(
        safeDecoration.minHeightDesktopPx,
        DEFAULT_EDGE_DECORATION_DESKTOP_MIN_HEIGHT_PX,
        MAX_EDGE_DECORATION_DESKTOP_HEIGHT_PX
      );
  const maxHeight = isMobile
    ? normalizeEdgeDecorationHeightPx(
        safeDecoration.maxHeightMobilePx,
        DEFAULT_EDGE_DECORATION_MOBILE_MAX_HEIGHT_PX,
        MAX_EDGE_DECORATION_MOBILE_HEIGHT_PX
      )
    : normalizeEdgeDecorationHeightPx(
        safeDecoration.maxHeightDesktopPx,
        DEFAULT_EDGE_DECORATION_DESKTOP_MAX_HEIGHT_PX,
        MAX_EDGE_DECORATION_DESKTOP_HEIGHT_PX
      );
  const maxRatio = isMobile
    ? normalizeEdgeDecorationMaxSectionRatio(
        safeDecoration.maxSectionRatioMobile,
        safeDecoration.heightMobileRatio,
        DEFAULT_EDGE_DECORATION_MOBILE_MAX_SECTION_RATIO,
        MAX_EDGE_DECORATION_MOBILE_HEIGHT_RATIO
      )
    : normalizeEdgeDecorationMaxSectionRatio(
        safeDecoration.maxSectionRatioDesktop,
        safeDecoration.heightDesktopRatio,
        DEFAULT_EDGE_DECORATION_DESKTOP_MAX_SECTION_RATIO,
        MAX_EDGE_DECORATION_DESKTOP_HEIGHT_RATIO
      );
  const slotMax = Math.max(1, Math.min(maxHeight, safeSectionHeight * maxRatio));
  const clampedHeight = Math.min(naturalHeight, slotMax);

  return Math.round(clampedHeight < minHeight ? Math.min(minHeight, slotMax) : clampedHeight);
}

export function resolveEdgeDecorationCanvasRenderBox(
  decoration,
  {
    slot = "top",
    image,
    imageWidth,
    imageHeight,
    sectionHeight = DEFAULT_SECTION_HEIGHT,
    canvasWidth = CANVAS_WIDTH,
    isMobile = false,
  } = {}
) {
  const safeDecoration = asObject(decoration);
  const bandWidth = resolveCanvasWidth(canvasWidth);
  const bandHeight = resolveEdgeDecorationCanvasHeight(safeDecoration, {
    image,
    imageWidth,
    imageHeight,
    sectionHeight,
    canvasWidth: bandWidth,
    isMobile,
  });
  const rawImage =
    image ||
    (imageWidth || imageHeight
      ? {
          width: imageWidth,
          height: imageHeight,
        }
      : null);
  const aspectRatio = resolveEdgeDecorationAspectRatio(safeDecoration, rawImage);
  const naturalHeight = Math.max(1, bandWidth * aspectRatio);
  const mode = normalizeEdgeDecorationMode(safeDecoration.mode);
  const isBottom = slot === "bottom";
  let renderedWidth = bandWidth;
  let renderedHeight = naturalHeight;

  if (mode === "contain-x") {
    if (renderedHeight > bandHeight) {
      renderedHeight = bandHeight;
      renderedWidth = bandHeight / aspectRatio;
    }
  } else if (renderedHeight < bandHeight) {
    renderedHeight = bandHeight;
    renderedWidth = bandHeight / aspectRatio;
  }

  const imageX = (bandWidth - renderedWidth) / 2;
  const imageY =
    mode === "contain-x"
      ? isBottom
        ? bandHeight - renderedHeight
        : 0
      : isBottom
        ? bandHeight - renderedHeight
        : 0;

  return {
    bandWidth,
    bandHeight,
    imageX,
    imageY,
    imageWidth: renderedWidth,
    imageHeight: renderedHeight,
  };
}

function resolveSectionHeight(sectionHeight) {
  return Math.max(1, toPositiveNumber(sectionHeight, DEFAULT_SECTION_HEIGHT) || DEFAULT_SECTION_HEIGHT);
}

function resolveCanvasWidth(canvasWidth) {
  return Math.max(1, toPositiveNumber(canvasWidth, CANVAS_WIDTH) || CANVAS_WIDTH);
}

function resolveImageObjectDimension(value, scaledValue, fallback) {
  const base = toPositiveNumber(value);
  const scale = Math.abs(toFiniteNumber(scaledValue, 1)) || 1;
  if (base) return Math.max(MIN_DECORATION_SIZE, Math.round(base * scale));
  return fallback;
}

function rotatePoint(x, y, rotationDeg = 0) {
  const radians = (Math.PI / 180) * toFiniteNumber(rotationDeg, 0);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

// Image objects rotate from top-left; background decorations rotate from center.
function imagePoseToBackgroundDecorationPose(
  { x, y, width, height, rotation } = {}
) {
  const safeWidth = Math.max(
    MIN_DECORATION_SIZE,
    toPositiveNumber(width, DEFAULT_DECORATION_WIDTH) || DEFAULT_DECORATION_WIDTH
  );
  const safeHeight = Math.max(
    MIN_DECORATION_SIZE,
    toPositiveNumber(height, DEFAULT_DECORATION_HEIGHT) || DEFAULT_DECORATION_HEIGHT
  );
  const safeRotation = toFiniteNumber(rotation, 0);
  const half = {
    x: safeWidth / 2,
    y: safeHeight / 2,
  };
  const rotatedHalf = rotatePoint(half.x, half.y, safeRotation);
  const center = {
    x: toFiniteNumber(x, 0) + rotatedHalf.x,
    y: toFiniteNumber(y, 0) + rotatedHalf.y,
  };

  return {
    x: center.x - half.x,
    y: center.y - half.y,
    width: safeWidth,
    height: safeHeight,
    rotation: safeRotation,
  };
}

function backgroundDecorationPoseToImagePose(
  { x, y, width, height, rotation } = {}
) {
  const safeWidth = Math.max(
    MIN_DECORATION_SIZE,
    toPositiveNumber(width, DEFAULT_DECORATION_WIDTH) || DEFAULT_DECORATION_WIDTH
  );
  const safeHeight = Math.max(
    MIN_DECORATION_SIZE,
    toPositiveNumber(height, DEFAULT_DECORATION_HEIGHT) || DEFAULT_DECORATION_HEIGHT
  );
  const safeRotation = toFiniteNumber(rotation, 0);
  const half = {
    x: safeWidth / 2,
    y: safeHeight / 2,
  };
  const rotatedHalf = rotatePoint(half.x, half.y, safeRotation);
  const center = {
    x: toFiniteNumber(x, 0) + half.x,
    y: toFiniteNumber(y, 0) + half.y,
  };

  return {
    x: center.x - rotatedHalf.x,
    y: center.y - rotatedHalf.y,
    width: safeWidth,
    height: safeHeight,
    rotation: safeRotation,
  };
}

function ensureDecorationBounds(width, height, sectionHeight, canvasWidth) {
  let nextWidth = Math.max(MIN_DECORATION_SIZE, Math.round(toPositiveNumber(width, DEFAULT_DECORATION_WIDTH) || DEFAULT_DECORATION_WIDTH));
  let nextHeight = Math.max(MIN_DECORATION_SIZE, Math.round(toPositiveNumber(height, DEFAULT_DECORATION_HEIGHT) || DEFAULT_DECORATION_HEIGHT));

  return {
    width: nextWidth,
    height: nextHeight,
  };
}

function clampDecorationAxisPosition(value, size, viewportSize) {
  const safeSize = Math.max(MIN_DECORATION_SIZE, Math.round(toPositiveNumber(size, MIN_DECORATION_SIZE) || MIN_DECORATION_SIZE));
  const safeViewport = Math.max(1, Math.round(toPositiveNumber(viewportSize, 1) || 1));
  const visiblePortion = Math.min(safeSize, MIN_VISIBLE_DECORATION_PORTION);
  const minPosition = visiblePortion - safeSize;
  const maxPosition = safeViewport - visiblePortion;
  return Math.round(clamp(toFiniteNumber(value, 0), minPosition, maxPosition));
}

function normalizeDecorationOrder(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .slice()
    .sort((left, right) => {
      const leftOrder = toOrderNumber(left?.orden, 0);
      const rightOrder = toOrderNumber(right?.orden, 0);
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return normalizeText(left?.id).localeCompare(normalizeText(right?.id));
    })
    .map((item, index) => ({
      ...item,
      orden: index,
    }));
}

function resolveBackgroundDecorationParallax(rawDecoracionesFondo, fallback = "none") {
  return sanitizeBackgroundDecorationParallax(
    asObject(rawDecoracionesFondo).parallax,
    fallback
  );
}

export function createBackgroundDecorationId(seed = Date.now()) {
  const seedText = Math.round(toFiniteNumber(seed, Date.now())).toString(36);
  const randomText = Math.random().toString(36).slice(2, 8);
  return `decoracion-fondo-${seedText}-${randomText}`;
}

export function clampBackgroundDecorationToBounds(
  decoration,
  sectionHeight = DEFAULT_SECTION_HEIGHT,
  canvasWidth = CANVAS_WIDTH
) {
  const safeSectionHeight = resolveSectionHeight(sectionHeight);
  const safeCanvasWidth = resolveCanvasWidth(canvasWidth);
  const boundedSize = ensureDecorationBounds(
    decoration?.width,
    decoration?.height,
    safeSectionHeight,
    safeCanvasWidth
  );

  return {
    ...asObject(decoration),
    x: clampDecorationAxisPosition(decoration?.x, boundedSize.width, safeCanvasWidth),
    y: clampDecorationAxisPosition(decoration?.y, boundedSize.height, safeSectionHeight),
    width: boundedSize.width,
    height: boundedSize.height,
    rotation: Math.round(toFiniteNumber(decoration?.rotation, 0) * 100) / 100,
  };
}

export function normalizeBackgroundDecoration(
  raw,
  {
    sectionHeight = DEFAULT_SECTION_HEIGHT,
    canvasWidth = CANVAS_WIDTH,
    fallbackId = "",
    fallbackOrder = 0,
  } = {}
) {
  const safeRaw = asObject(raw);
  const src = resolveSectionDecorationAssetUrl(safeRaw);
  if (!src) return null;

  const baseDecoration = {
    id: normalizeText(safeRaw.id || safeRaw.decorationId) || fallbackId || `decoracion-${fallbackOrder + 1}`,
    decorId: normalizeText(safeRaw.decorId) || null,
    src,
    storagePath: normalizeText(safeRaw.storagePath) || null,
    nombre: normalizeText(safeRaw.nombre || safeRaw.label) || "Decoracion",
    x: toFiniteNumber(safeRaw.x, 0),
    y: toFiniteNumber(safeRaw.y, 0),
    width: toPositiveNumber(safeRaw.width, DEFAULT_DECORATION_WIDTH),
    height: toPositiveNumber(safeRaw.height, DEFAULT_DECORATION_HEIGHT),
    rotation: toFiniteNumber(safeRaw.rotation, 0),
    orden: toOrderNumber(safeRaw.orden, fallbackOrder),
  };

  return clampBackgroundDecorationToBounds(baseDecoration, sectionHeight, canvasWidth);
}

export function normalizeBackgroundDecorations(
  rawDecoracionesFondo,
  {
    sectionHeight = DEFAULT_SECTION_HEIGHT,
    canvasWidth = CANVAS_WIDTH,
  } = {}
) {
  const safeRaw = asObject(rawDecoracionesFondo);
  const safeSectionHeight = resolveSectionHeight(sectionHeight);
  const safeCanvasWidth = resolveCanvasWidth(canvasWidth);

  const sourceItems = Array.isArray(safeRaw.items)
    ? safeRaw.items
    : [
        safeRaw.superior
          ? {
              ...asObject(safeRaw.superior),
              id: normalizeText(safeRaw.superior?.id) || buildLegacyDecorationId("superior"),
              orden: 0,
            }
          : null,
        safeRaw.inferior
          ? {
              ...asObject(safeRaw.inferior),
              id: normalizeText(safeRaw.inferior?.id) || buildLegacyDecorationId("inferior"),
              orden: 1,
            }
          : null,
      ].filter(Boolean);

  const normalized = sourceItems
    .map((item, index) =>
      normalizeBackgroundDecoration(item, {
        sectionHeight: safeSectionHeight,
        canvasWidth: safeCanvasWidth,
        fallbackId:
          index === 0 && !Array.isArray(safeRaw.items)
            ? buildLegacyDecorationId("superior")
            : index === 1 && !Array.isArray(safeRaw.items)
              ? buildLegacyDecorationId("inferior")
              : `decoracion-${index + 1}`,
        fallbackOrder: index,
      })
    )
    .filter(Boolean);

  return normalizeDecorationOrder(normalized);
}

export function buildSectionDecorationsPayload(
  sectionOrDecoraciones,
  {
    sectionHeight = DEFAULT_SECTION_HEIGHT,
    canvasWidth = CANVAS_WIDTH,
  } = {}
) {
  const safeSource = asObject(sectionOrDecoraciones);
  const decorationsSource = safeSource.decoracionesFondo ?? safeSource;
  const safeSectionHeight = resolveSectionHeight(
    safeSource.altura ?? sectionHeight
  );

  return {
    items: normalizeBackgroundDecorations(decorationsSource, {
      sectionHeight: safeSectionHeight,
      canvasWidth,
    }),
    parallax: resolveBackgroundDecorationParallax(decorationsSource),
  };
}

export function normalizeEdgeDecorationSlot(rawSlot, slot) {
  const safeRaw = asObject(rawSlot);
  const src = resolveSectionEdgeDecorationAssetUrl(safeRaw);
  if (!src) return null;
  const heightDesktopRatio = normalizeEdgeDecorationRatio(
    safeRaw.heightDesktopRatio,
    DEFAULT_EDGE_DECORATION_DESKTOP_HEIGHT_RATIO,
    MIN_EDGE_DECORATION_DESKTOP_HEIGHT_RATIO,
    MAX_EDGE_DECORATION_DESKTOP_HEIGHT_RATIO
  );
  const heightMobileRatio = normalizeEdgeDecorationRatio(
    safeRaw.heightMobileRatio,
    DEFAULT_EDGE_DECORATION_MOBILE_HEIGHT_RATIO,
    MIN_EDGE_DECORATION_MOBILE_HEIGHT_RATIO,
    MAX_EDGE_DECORATION_MOBILE_HEIGHT_RATIO
  );
  const minHeightDesktopPx = normalizeEdgeDecorationHeightPx(
    safeRaw.minHeightDesktopPx,
    DEFAULT_EDGE_DECORATION_DESKTOP_MIN_HEIGHT_PX,
    MAX_EDGE_DECORATION_DESKTOP_HEIGHT_PX
  );
  const minHeightMobilePx = normalizeEdgeDecorationHeightPx(
    safeRaw.minHeightMobilePx,
    DEFAULT_EDGE_DECORATION_MOBILE_MIN_HEIGHT_PX,
    MAX_EDGE_DECORATION_MOBILE_HEIGHT_PX
  );
  const maxHeightDesktopPx = Math.max(
    minHeightDesktopPx,
    normalizeEdgeDecorationHeightPx(
      safeRaw.maxHeightDesktopPx,
      DEFAULT_EDGE_DECORATION_DESKTOP_MAX_HEIGHT_PX,
      MAX_EDGE_DECORATION_DESKTOP_HEIGHT_PX
    )
  );
  const maxHeightMobilePx = Math.max(
    minHeightMobilePx,
    normalizeEdgeDecorationHeightPx(
      safeRaw.maxHeightMobilePx,
      DEFAULT_EDGE_DECORATION_MOBILE_MAX_HEIGHT_PX,
      MAX_EDGE_DECORATION_MOBILE_HEIGHT_PX
    )
  );

  return {
    enabled: safeRaw.enabled === false ? false : true,
    src,
    storagePath: normalizeText(safeRaw.storagePath) || null,
    decorId: normalizeText(safeRaw.decorId) || null,
    nombre:
      normalizeText(safeRaw.nombre || safeRaw.label) ||
      getEdgeDecorationFallbackName(slot),
    heightModel: normalizeEdgeDecorationHeightModel(safeRaw.heightModel),
    intrinsicWidth: normalizeEdgeDecorationDimension(safeRaw.intrinsicWidth),
    intrinsicHeight: normalizeEdgeDecorationDimension(safeRaw.intrinsicHeight),
    minHeightDesktopPx,
    maxHeightDesktopPx,
    maxSectionRatioDesktop: normalizeEdgeDecorationMaxSectionRatio(
      safeRaw.maxSectionRatioDesktop,
      hasPositiveNumber(safeRaw.heightDesktopRatio) ? heightDesktopRatio : null,
      DEFAULT_EDGE_DECORATION_DESKTOP_MAX_SECTION_RATIO,
      MAX_EDGE_DECORATION_DESKTOP_HEIGHT_RATIO
    ),
    minHeightMobilePx,
    maxHeightMobilePx,
    maxSectionRatioMobile: normalizeEdgeDecorationMaxSectionRatio(
      safeRaw.maxSectionRatioMobile,
      hasPositiveNumber(safeRaw.heightMobileRatio) ? heightMobileRatio : null,
      DEFAULT_EDGE_DECORATION_MOBILE_MAX_SECTION_RATIO,
      MAX_EDGE_DECORATION_MOBILE_HEIGHT_RATIO
    ),
    heightDesktopRatio,
    heightMobileRatio,
    offsetDesktopPx: normalizeEdgeDecorationOffsetPx(safeRaw.offsetDesktopPx),
    offsetMobilePx: normalizeEdgeDecorationOffsetPx(safeRaw.offsetMobilePx),
    mode: normalizeEdgeDecorationMode(safeRaw.mode),
  };
}

export function normalizeEdgeDecorations(rawDecoracionesBorde) {
  const safeRaw = asObject(rawDecoracionesBorde);
  const normalized = ["top", "bottom"].reduce((acc, slot) => {
    const normalizedSlot = normalizeEdgeDecorationSlot(safeRaw[slot], slot);
    if (normalizedSlot) {
      acc[slot] = normalizedSlot;
    }
    return acc;
  }, {});
  if (hasEdgeDecorationSlots(normalized)) {
    normalized.layout = normalizeEdgeDecorationsLayout(safeRaw.layout);
  }
  return normalized;
}

export function buildSectionEdgeDecorationsPayload(sectionOrDecoraciones) {
  const safeSource = asObject(sectionOrDecoraciones);
  return normalizeEdgeDecorations(safeSource.decoracionesBorde ?? safeSource);
}

export function normalizeSectionBackgroundModel(
  section,
  {
    canvasWidth = CANVAS_WIDTH,
    sectionHeight = DEFAULT_SECTION_HEIGHT,
  } = {}
) {
  const safeSection = asObject(section);
  const safeSectionHeight = resolveSectionHeight(
    safeSection.altura ?? sectionHeight
  );
  const safeCanvasWidth = resolveCanvasWidth(canvasWidth);

  return {
    base: {
      fondo: normalizeText(safeSection.fondo) || "#ffffff",
      fondoTipo: normalizeText(safeSection.fondoTipo) || null,
      fondoImagen: normalizeText(safeSection.fondoImagen) || "",
      fondoImagenOffsetX: toFiniteNumber(safeSection.fondoImagenOffsetX, 0),
      fondoImagenOffsetY: toFiniteNumber(safeSection.fondoImagenOffsetY, 0),
      fondoImagenScale: resolveSectionBaseImageScale(safeSection.fondoImagenScale, 1),
    },
    parallax: resolveBackgroundDecorationParallax(safeSection.decoracionesFondo),
    decoraciones: normalizeBackgroundDecorations(safeSection.decoracionesFondo, {
      sectionHeight: safeSectionHeight,
      canvasWidth: safeCanvasWidth,
    }),
    decoracionesBorde: normalizeEdgeDecorations(safeSection.decoracionesBorde),
  };
}

export function resolveSectionBaseImageLayout(
  section,
  {
    imageWidth,
    imageHeight,
    canvasWidth = CANVAS_WIDTH,
    sectionHeight = DEFAULT_SECTION_HEIGHT,
  } = {}
) {
  const safeSectionHeight = resolveSectionHeight(
    asObject(section).altura ?? sectionHeight
  );
  const safeCanvasWidth = resolveCanvasWidth(canvasWidth);
  const safeImageWidth = Math.max(1, toPositiveNumber(imageWidth, 1) || 1);
  const safeImageHeight = Math.max(1, toPositiveNumber(imageHeight, 1) || 1);
  const backgroundModel = normalizeSectionBackgroundModel(section, {
    canvasWidth: safeCanvasWidth,
    sectionHeight: safeSectionHeight,
  });
  const coverScale = Math.max(
    safeCanvasWidth / safeImageWidth,
    safeSectionHeight / safeImageHeight
  );
  const imageScale = resolveSectionBaseImageScale(
    backgroundModel.base.fondoImagenScale,
    1
  );
  const renderScale = coverScale * imageScale;
  const renderedWidth = safeImageWidth * renderScale;
  const renderedHeight = safeImageHeight * renderScale;
  const centeredOffsetX = (safeCanvasWidth - renderedWidth) / 2;
  const centeredOffsetY = (safeSectionHeight - renderedHeight) / 2;
  const offsetX = toFiniteNumber(backgroundModel.base.fondoImagenOffsetX, 0);
  const offsetY = toFiniteNumber(backgroundModel.base.fondoImagenOffsetY, 0);

  return {
    coverScale,
    imageScale,
    renderScale,
    renderedWidth,
    renderedHeight,
    centeredOffsetX,
    centeredOffsetY,
    offsetX,
    offsetY,
    x: centeredOffsetX + offsetX,
    y: centeredOffsetY + offsetY,
  };
}

export function buildSectionBaseImagePatchFromRenderBox(
  section,
  {
    imageWidth,
    imageHeight,
    x = 0,
    y = 0,
    width,
    height,
    canvasWidth = CANVAS_WIDTH,
    sectionHeight = DEFAULT_SECTION_HEIGHT,
  } = {}
) {
  const safeSectionHeight = resolveSectionHeight(
    asObject(section).altura ?? sectionHeight
  );
  const safeCanvasWidth = resolveCanvasWidth(canvasWidth);
  const safeImageWidth = Math.max(1, toPositiveNumber(imageWidth, 1) || 1);
  const safeImageHeight = Math.max(1, toPositiveNumber(imageHeight, 1) || 1);
  const coverScale = Math.max(
    safeCanvasWidth / safeImageWidth,
    safeSectionHeight / safeImageHeight
  );
  const coverWidth = safeImageWidth * coverScale;
  const coverHeight = safeImageHeight * coverScale;
  const widthScale = toPositiveNumber(width, coverWidth)
    ? Number(width) / coverWidth
    : 1;
  const heightScale = toPositiveNumber(height, coverHeight)
    ? Number(height) / coverHeight
    : 1;
  const nextScale = Math.max(
    1,
    Number.isFinite(widthScale) ? widthScale : 1,
    Number.isFinite(heightScale) ? heightScale : 1
  );
  const renderedWidth = coverWidth * nextScale;
  const renderedHeight = coverHeight * nextScale;
  const centeredOffsetX = (safeCanvasWidth - renderedWidth) / 2;
  const centeredOffsetY = (safeSectionHeight - renderedHeight) / 2;

  return {
    offsetX: toFiniteNumber(x, 0) - centeredOffsetX,
    offsetY: toFiniteNumber(y, 0) - centeredOffsetY,
    scale: nextScale,
  };
}

export function findBackgroundDecoration(
  section,
  decorationId,
  {
    canvasWidth = CANVAS_WIDTH,
    sectionHeight = DEFAULT_SECTION_HEIGHT,
  } = {}
) {
  const targetId = normalizeText(decorationId);
  if (!targetId) return null;
  return (
    normalizeSectionBackgroundModel(section, {
      canvasWidth,
      sectionHeight,
    }).decoraciones.find((item) => item.id === targetId) || null
  );
}

export function listSectionVisualAssets(section) {
  const safeSection = asObject(section);
  const sectionId = normalizeText(safeSection.id);
  const model = normalizeSectionBackgroundModel(section, {
    sectionHeight: safeSection.altura,
  });
  const assets = [];

  if (model.base.fondoTipo === "imagen" && model.base.fondoImagen) {
    assets.push({
      assetKey: `${sectionId}:base`,
      sectionId,
      kind: "base",
      decorationId: null,
      imageUrl: model.base.fondoImagen,
      storagePath: null,
    });
  }

  model.decoraciones.forEach((decoration) => {
    if (!decoration?.src) return;
    assets.push({
      assetKey: `${sectionId}:decoracion:${decoration.id}`,
      sectionId,
      kind: "background-decoration",
      decorationId: decoration.id,
      imageUrl: decoration.src,
      storagePath: decoration.storagePath || null,
    });
  });

  ["top", "bottom"].forEach((slot) => {
    const decoration = model.decoracionesBorde[slot];
    if (!decoration?.src) return;
    if (decoration.enabled === false) return;
    assets.push({
      assetKey: `${sectionId}:borde:${slot}`,
      sectionId,
      kind: "edge-decoration",
      slot,
      decorationId: slot,
      imageUrl: decoration.src,
      storagePath: decoration.storagePath || null,
    });
  });

  return assets;
}

export function setSectionEdgeDecoration(
  sections,
  sectionId,
  slot,
  decoration
) {
  const safeSlot = slot === "bottom" ? "bottom" : slot === "top" ? "top" : "";
  if (!safeSlot) return Array.isArray(sections) ? sections : [];

  return (Array.isArray(sections) ? sections : []).map((section) => {
    if (section?.id !== sectionId) return section;

    const current = buildSectionEdgeDecorationsPayload(section);
    const normalizedSlot = normalizeEdgeDecorationSlot(
      {
        ...asObject(decoration),
        enabled: asObject(decoration).enabled === false ? false : true,
      },
      safeSlot
    );
    if (!normalizedSlot) return section;

    return {
      ...section,
      decoracionesBorde: {
        ...current,
        [safeSlot]: normalizedSlot,
      },
    };
  });
}

export function buildEdgeDecorationFromImageObject(imageObject, slot = "top") {
  const safeImage = asObject(imageObject);
  const safeSlot = slot === "bottom" ? "bottom" : "top";
  const src = resolveObjectPrimaryAssetUrl(safeImage);
  if (!src) return null;

  return normalizeEdgeDecorationSlot(
    {
      enabled: true,
      src,
      storagePath: normalizeText(safeImage.storagePath) || null,
      decorId: normalizeText(safeImage.decorId || safeImage.catalogItemId) || null,
      intrinsicWidth:
        normalizeEdgeDecorationDimension(safeImage.naturalWidth) ||
        normalizeEdgeDecorationDimension(safeImage.imageWidth) ||
        normalizeEdgeDecorationDimension(safeImage.width) ||
        normalizeEdgeDecorationDimension(safeImage.ancho),
      intrinsicHeight:
        normalizeEdgeDecorationDimension(safeImage.naturalHeight) ||
        normalizeEdgeDecorationDimension(safeImage.imageHeight) ||
        normalizeEdgeDecorationDimension(safeImage.height) ||
        normalizeEdgeDecorationDimension(safeImage.alto),
      nombre:
        normalizeText(safeImage.nombre || safeImage.label) ||
        getEdgeDecorationFallbackName(safeSlot),
    },
    safeSlot
  );
}

export function setSectionEdgeDecorationFromImageObject(
  sections,
  imageObject,
  slot = "top"
) {
  const safeImage = asObject(imageObject);
  const sectionId = normalizeText(safeImage.seccionId);
  const safeSlot = slot === "bottom" ? "bottom" : slot === "top" ? "top" : "";
  const decoration = safeSlot
    ? buildEdgeDecorationFromImageObject(safeImage, safeSlot)
    : null;

  if (!sectionId || !safeSlot || !decoration) {
    return {
      sections: Array.isArray(sections) ? sections : [],
      decoration: null,
      sectionId: sectionId || null,
      slot: safeSlot || null,
    };
  }

  return {
    sections: setSectionEdgeDecoration(sections, sectionId, safeSlot, decoration),
    decoration,
    sectionId,
    slot: safeSlot,
  };
}

export function convertImageObjectToSectionEdgeDecorationState({
  sections,
  objects,
  imageObject,
  slot = "top",
} = {}) {
  const safeObjects = Array.isArray(objects) ? objects : [];
  const sourceObjectId = normalizeText(asObject(imageObject).id);

  if (!sourceObjectId) {
    return {
      sections: Array.isArray(sections) ? sections : [],
      objects: safeObjects,
      decoration: null,
      sectionId: null,
      slot: null,
      removedObjectId: null,
    };
  }

  const result = setSectionEdgeDecorationFromImageObject(
    sections,
    imageObject,
    slot
  );

  if (!result?.decoration || !Array.isArray(result.sections)) {
    return {
      sections: Array.isArray(sections) ? sections : [],
      objects: safeObjects,
      decoration: null,
      sectionId: result?.sectionId || null,
      slot: result?.slot || null,
      removedObjectId: null,
    };
  }

  return {
    sections: result.sections,
    objects: safeObjects.filter(
      (item) => normalizeText(asObject(item).id) !== sourceObjectId
    ),
    decoration: result.decoration,
    sectionId: result.sectionId,
    slot: result.slot,
    removedObjectId: sourceObjectId,
  };
}

export function setSectionEdgeDecorationEnabled(
  sections,
  sectionId,
  slot,
  enabled
) {
  const safeSlot = slot === "bottom" ? "bottom" : slot === "top" ? "top" : "";
  if (!safeSlot) return Array.isArray(sections) ? sections : [];

  return (Array.isArray(sections) ? sections : []).map((section) => {
    if (section?.id !== sectionId) return section;

    const current = buildSectionEdgeDecorationsPayload(section);
    const currentSlot = current[safeSlot];
    if (!currentSlot) return section;

    return {
      ...section,
      decoracionesBorde: {
        ...current,
        [safeSlot]: {
          ...currentSlot,
          enabled: Boolean(enabled),
        },
      },
    };
  });
}

export function updateSectionEdgeDecorationOffset(
  sections,
  sectionId,
  slot,
  patch
) {
  const safeSectionId = normalizeText(sectionId);
  const safeSlot = slot === "bottom" ? "bottom" : slot === "top" ? "top" : "";
  if (!safeSectionId || !safeSlot) return Array.isArray(sections) ? sections : [];

  return (Array.isArray(sections) ? sections : []).map((section) => {
    if (section?.id !== safeSectionId) return section;

    const current = buildSectionEdgeDecorationsPayload(section);
    const currentSlot = current[safeSlot];
    if (!currentSlot) return section;

    const normalizedSlot = normalizeEdgeDecorationSlot(
      {
        ...currentSlot,
        ...asObject(patch),
      },
      safeSlot
    );
    if (!normalizedSlot) return section;

    return {
      ...section,
      decoracionesBorde: {
        ...current,
        [safeSlot]: normalizedSlot,
      },
    };
  });
}

export function removeSectionEdgeDecoration(sections, sectionId, slot) {
  const safeSlot = slot === "bottom" ? "bottom" : slot === "top" ? "top" : "";
  if (!safeSlot) return Array.isArray(sections) ? sections : [];

  return (Array.isArray(sections) ? sections : []).map((section) => {
    if (section?.id !== sectionId) return section;

    const current = buildSectionEdgeDecorationsPayload(section);
    const nextDecorations = { ...current };
    delete nextDecorations[safeSlot];
    const nextSection = { ...section };

    if (hasEdgeDecorationSlots(nextDecorations)) {
      nextSection.decoracionesBorde = nextDecorations;
    } else {
      delete nextSection.decoracionesBorde;
    }

    return nextSection;
  });
}

function updateSectionDecorationsCollection(
  sections,
  sectionId,
  nextDecorations,
  sectionHeight = DEFAULT_SECTION_HEIGHT,
  canvasWidth = CANVAS_WIDTH
) {
  return (Array.isArray(sections) ? sections : []).map((section) => {
    if (section?.id !== sectionId) return section;

    const safeSectionHeight =
      toPositiveNumber(section?.altura, sectionHeight) || sectionHeight;
    const currentBackgroundModel = normalizeSectionBackgroundModel(section, {
      sectionHeight: safeSectionHeight,
      canvasWidth,
    });

    return {
      ...section,
      decoracionesFondo: buildSectionDecorationsPayload(
        {
          items: Array.isArray(nextDecorations) ? nextDecorations : [],
          parallax: currentBackgroundModel.parallax,
        },
        {
          sectionHeight: safeSectionHeight,
          canvasWidth,
        }
      ),
    };
  });
}

export function addBackgroundDecoration(
  sections,
  sectionId,
  decoration,
  sectionHeight = DEFAULT_SECTION_HEIGHT,
  canvasWidth = CANVAS_WIDTH
) {
  const targetSection = (Array.isArray(sections) ? sections : []).find((section) => section?.id === sectionId);
  if (!targetSection) return Array.isArray(sections) ? sections : [];

  const currentDecorations = normalizeSectionBackgroundModel(targetSection, {
    sectionHeight: targetSection.altura ?? sectionHeight,
    canvasWidth,
  }).decoraciones;

  return updateSectionDecorationsCollection(
    sections,
    sectionId,
    [
      ...currentDecorations,
      {
        ...asObject(decoration),
        orden: currentDecorations.length,
      },
    ],
    targetSection.altura ?? sectionHeight,
    canvasWidth
  );
}

export function updateBackgroundDecorationTransform(
  sections,
  sectionId,
  decorationId,
  patch,
  sectionHeight = DEFAULT_SECTION_HEIGHT,
  canvasWidth = CANVAS_WIDTH
) {
  const targetId = normalizeText(decorationId);
  if (!targetId) return Array.isArray(sections) ? sections : [];

  return (Array.isArray(sections) ? sections : []).map((section) => {
    if (section?.id !== sectionId) return section;

    const safeSectionHeight = toPositiveNumber(section?.altura, sectionHeight) || sectionHeight;
    const currentBackgroundModel = normalizeSectionBackgroundModel(section, {
      sectionHeight: safeSectionHeight,
      canvasWidth,
    });
    const currentDecorations = currentBackgroundModel.decoraciones;

    const nextDecorations = currentDecorations.map((decoration) => {
      if (decoration.id !== targetId) return decoration;
      return normalizeBackgroundDecoration(
        {
          ...decoration,
          ...asObject(patch),
        },
        {
          sectionHeight: safeSectionHeight,
          canvasWidth,
          fallbackId: decoration.id,
          fallbackOrder: decoration.orden,
        }
      );
    });

    return {
      ...section,
      decoracionesFondo: buildSectionDecorationsPayload(
        {
          items: normalizeDecorationOrder(nextDecorations.filter(Boolean)),
          parallax: currentBackgroundModel.parallax,
        },
        {
          sectionHeight: safeSectionHeight,
          canvasWidth,
        }
      ),
    };
  });
}

export function reorderBackgroundDecoration(
  sections,
  sectionId,
  decorationId,
  direction
) {
  const normalizedDirection = normalizeText(direction).toLowerCase();
  if (normalizedDirection !== "up" && normalizedDirection !== "down") {
    return Array.isArray(sections) ? sections : [];
  }

  return (Array.isArray(sections) ? sections : []).map((section) => {
    if (section?.id !== sectionId) return section;

    const currentBackgroundModel = normalizeSectionBackgroundModel(section, {
      sectionHeight: section?.altura,
    });
    const currentDecorations = currentBackgroundModel.decoraciones;
    const currentIndex = currentDecorations.findIndex((item) => item.id === decorationId);
    if (currentIndex === -1) return section;

    const targetIndex =
      normalizedDirection === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentDecorations.length) return section;

    const reordered = currentDecorations.slice();
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    return {
      ...section,
      decoracionesFondo: buildSectionDecorationsPayload(
        {
          items: normalizeDecorationOrder(reordered),
          parallax: currentBackgroundModel.parallax,
        },
        {
          sectionHeight: section?.altura,
        }
      ),
    };
  });
}

export function removeBackgroundDecoration(sections, sectionId, decorationId) {
  const targetId = normalizeText(decorationId);
  if (!targetId) return Array.isArray(sections) ? sections : [];

  return (Array.isArray(sections) ? sections : []).map((section) => {
    if (section?.id !== sectionId) return section;

    const currentBackgroundModel = normalizeSectionBackgroundModel(section, {
      sectionHeight: section?.altura,
    });
    const currentDecorations = currentBackgroundModel.decoraciones;

    return {
      ...section,
      decoracionesFondo: buildSectionDecorationsPayload(
        {
          items: normalizeDecorationOrder(
            currentDecorations.filter((decoration) => decoration.id !== targetId)
          ),
          parallax: currentBackgroundModel.parallax,
        },
        {
          sectionHeight: section?.altura,
        }
      ),
    };
  });
}

export function updateBackgroundDecorationsParallax(
  sections,
  sectionId,
  nextParallax,
  {
    sectionHeight = DEFAULT_SECTION_HEIGHT,
    canvasWidth = CANVAS_WIDTH,
  } = {}
) {
  const targetSectionId = normalizeText(sectionId);
  if (!targetSectionId) return Array.isArray(sections) ? sections : [];

  const safeParallax = sanitizeBackgroundDecorationParallax(nextParallax);

  return (Array.isArray(sections) ? sections : []).map((section) => {
    if (section?.id !== targetSectionId) return section;

    const safeSectionHeight =
      toPositiveNumber(section?.altura, sectionHeight) || sectionHeight;
    const currentBackgroundModel = normalizeSectionBackgroundModel(section, {
      sectionHeight: safeSectionHeight,
      canvasWidth,
    });

    if (currentBackgroundModel.parallax === safeParallax) {
      return section;
    }

    return {
      ...section,
      decoracionesFondo: buildSectionDecorationsPayload(
        {
          items: currentBackgroundModel.decoraciones,
          parallax: safeParallax,
        },
        {
          sectionHeight: safeSectionHeight,
          canvasWidth,
        }
      ),
    };
  });
}

export function buildBackgroundDecorationFromImageObject(
  imageObject,
  {
    sectionHeight = DEFAULT_SECTION_HEIGHT,
    canvasWidth = CANVAS_WIDTH,
    id = "",
    order = 0,
  } = {}
) {
  const safeImage = asObject(imageObject);
  const src = resolveObjectPrimaryAssetUrl(safeImage);
  if (!src) return null;

  const width = resolveImageObjectDimension(
    safeImage.width ?? safeImage.ancho,
    safeImage.scaleX,
    DEFAULT_DECORATION_WIDTH
  );
  const height = resolveImageObjectDimension(
    safeImage.height ?? safeImage.alto,
    safeImage.scaleY,
    DEFAULT_DECORATION_HEIGHT
  );
  const decorationPose = imagePoseToBackgroundDecorationPose({
    x: safeImage.x,
    y: safeImage.y,
    width,
    height,
    rotation: safeImage.rotation,
  });

  return normalizeBackgroundDecoration(
    {
      id: normalizeText(id) || createBackgroundDecorationId(),
      decorId: normalizeText(safeImage.decorId || safeImage.catalogItemId) || null,
      src,
      storagePath: normalizeText(safeImage.storagePath) || null,
      nombre: normalizeText(safeImage.nombre || safeImage.label) || "Decoracion",
      x: decorationPose.x,
      y: decorationPose.y,
      width: decorationPose.width,
      height: decorationPose.height,
      rotation: decorationPose.rotation,
      orden: toOrderNumber(order, 0),
    },
    {
      sectionHeight,
      canvasWidth,
      fallbackOrder: order,
    }
  );
}

export function addBackgroundDecorationFromImageObject(
  sections,
  imageObject,
  canvasWidth = CANVAS_WIDTH
) {
  const safeImage = asObject(imageObject);
  const sectionId = normalizeText(safeImage.seccionId);
  if (!sectionId || normalizeText(safeImage.tipo) !== "imagen") {
    return {
      sections: Array.isArray(sections) ? sections : [],
      decoration: null,
      decorationId: null,
      sectionId: sectionId || null,
    };
  }

  const targetSection = (Array.isArray(sections) ? sections : []).find((section) => section?.id === sectionId);
  if (!targetSection) {
    return {
      sections: Array.isArray(sections) ? sections : [],
      decoration: null,
      decorationId: null,
      sectionId,
    };
  }

  const currentDecorations = normalizeSectionBackgroundModel(targetSection, {
    sectionHeight: targetSection.altura,
    canvasWidth,
  }).decoraciones;
  const decoration = buildBackgroundDecorationFromImageObject(safeImage, {
    sectionHeight: targetSection.altura,
    canvasWidth,
    order: currentDecorations.length,
  });

  if (!decoration) {
    return {
      sections: Array.isArray(sections) ? sections : [],
      decoration: null,
      decorationId: null,
      sectionId,
    };
  }

  return {
    sections: addBackgroundDecoration(
      sections,
      sectionId,
      decoration,
      targetSection.altura,
      canvasWidth
    ),
    decoration,
    decorationId: decoration.id,
    sectionId,
  };
}

export function buildImageObjectFromBackgroundDecoration(
  decoration,
  {
    sectionId = "",
    id = "",
    sectionHeight = DEFAULT_SECTION_HEIGHT,
    canvasWidth = CANVAS_WIDTH,
  } = {}
) {
  const normalizedDecoration = normalizeBackgroundDecoration(decoration, {
    sectionHeight,
    canvasWidth,
  });
  if (!normalizedDecoration?.src) return null;
  const imagePose = backgroundDecorationPoseToImagePose(normalizedDecoration);

  return {
    id: normalizeText(id) || `imagen-${Date.now().toString(36)}`,
    tipo: "imagen",
    src: normalizedDecoration.src,
    x: imagePose.x,
    y: imagePose.y,
    width: imagePose.width,
    height: imagePose.height,
    rotation: imagePose.rotation,
    scaleX: 1,
    scaleY: 1,
    seccionId: normalizeText(sectionId) || null,
    decorId: normalizedDecoration.decorId || null,
    storagePath: normalizedDecoration.storagePath || null,
    nombre: normalizedDecoration.nombre || "Decoracion",
  };
}

export function applySectionBaseImage(sections, sectionId, imageUrl) {
  const src = normalizeText(imageUrl);
  if (!src) return Array.isArray(sections) ? sections : [];

  return (Array.isArray(sections) ? sections : []).map((section) => {
    if (section?.id !== sectionId) return section;
    return {
      ...section,
      fondoTipo: "imagen",
      fondoImagen: src,
      fondoImagenOffsetX: 0,
      fondoImagenOffsetY: 0,
      fondoImagenScale: 1,
      fondoImagenDraggable: true,
    };
  });
}

export function clearSectionBaseImage(section) {
  const next = {
    ...asObject(section),
  };
  delete next.fondoTipo;
  delete next.fondoImagen;
  delete next.fondoImagenOffsetX;
  delete next.fondoImagenOffsetY;
  delete next.fondoImagenScale;
  delete next.fondoImagenDraggable;
  return next;
}

export function applySectionSolidBackground(sections, sectionId, backgroundColor) {
  const fondo = normalizeText(backgroundColor) || "#ffffff";
  return (Array.isArray(sections) ? sections : []).map((section) => {
    if (section?.id !== sectionId) return section;
    return {
      ...clearSectionBaseImage(section),
      fondo,
    };
  });
}

export function removeSectionBaseImage(sections, sectionId) {
  return (Array.isArray(sections) ? sections : []).map((section) => {
    if (section?.id !== sectionId) return section;
    return clearSectionBaseImage(section);
  });
}
