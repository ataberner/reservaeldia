import {
  resolveObjectPrimaryAssetUrl,
  resolveSectionDecorationAssetUrl,
} from "../../../shared/renderAssetContract.js";
const CANVAS_WIDTH = 800;
const DEFAULT_SECTION_HEIGHT = 600;
const DEFAULT_DECORATION_WIDTH = 220;
const DEFAULT_DECORATION_HEIGHT = 160;
const MIN_DECORATION_SIZE = 32;
const MIN_VISIBLE_DECORATION_PORTION = 24;
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

  return assets;
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
