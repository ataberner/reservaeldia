const CANVAS_WIDTH = 800;
const DEFAULT_SECTION_HEIGHT = 600;
const DEFAULT_DECORATION_WIDTH = 220;
const DEFAULT_DECORATION_HEIGHT = 160;
const MIN_DECORATION_SIZE = 32;
const MIN_VISIBLE_DECORATION_PORTION = 24;

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeText(value) {
  return String(value || "").trim();
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
  const src = normalizeText(safeRaw.src);
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
  const safeSectionHeight = resolveSectionHeight(
    safeSource.altura ?? sectionHeight
  );

  return {
    items: normalizeBackgroundDecorations(
      safeSource.decoracionesFondo ?? safeSource,
      {
        sectionHeight: safeSectionHeight,
        canvasWidth,
      }
    ),
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
    },
    decoraciones: normalizeBackgroundDecorations(safeSection.decoracionesFondo, {
      sectionHeight: safeSectionHeight,
      canvasWidth: safeCanvasWidth,
    }),
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

    const items = normalizeBackgroundDecorations(
      {
        items: Array.isArray(nextDecorations) ? nextDecorations : [],
      },
      {
        sectionHeight: toPositiveNumber(section?.altura, sectionHeight) || sectionHeight,
        canvasWidth,
      }
    );

    return {
      ...section,
      decoracionesFondo: {
        items,
      },
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
    const currentDecorations = normalizeSectionBackgroundModel(section, {
      sectionHeight: safeSectionHeight,
      canvasWidth,
    }).decoraciones;

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
      decoracionesFondo: {
        items: normalizeDecorationOrder(nextDecorations.filter(Boolean)),
      },
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

    const currentDecorations = normalizeSectionBackgroundModel(section, {
      sectionHeight: section?.altura,
    }).decoraciones;
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
      decoracionesFondo: {
        items: normalizeDecorationOrder(reordered),
      },
    };
  });
}

export function removeBackgroundDecoration(sections, sectionId, decorationId) {
  const targetId = normalizeText(decorationId);
  if (!targetId) return Array.isArray(sections) ? sections : [];

  return (Array.isArray(sections) ? sections : []).map((section) => {
    if (section?.id !== sectionId) return section;

    const currentDecorations = normalizeSectionBackgroundModel(section, {
      sectionHeight: section?.altura,
    }).decoraciones;

    return {
      ...section,
      decoracionesFondo: {
        items: normalizeDecorationOrder(
          currentDecorations.filter((decoration) => decoration.id !== targetId)
        ),
      },
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
  const src = normalizeText(safeImage.src);
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

  return normalizeBackgroundDecoration(
    {
      id: normalizeText(id) || createBackgroundDecorationId(),
      decorId: normalizeText(safeImage.decorId || safeImage.catalogItemId) || null,
      src,
      storagePath: normalizeText(safeImage.storagePath) || null,
      nombre: normalizeText(safeImage.nombre || safeImage.label) || "Decoracion",
      x: toFiniteNumber(safeImage.x, 0),
      y: toFiniteNumber(safeImage.y, 0),
      width,
      height,
      rotation: toFiniteNumber(safeImage.rotation, 0),
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

  return {
    id: normalizeText(id) || `imagen-${Date.now().toString(36)}`,
    tipo: "imagen",
    src: normalizedDecoration.src,
    x: normalizedDecoration.x,
    y: normalizedDecoration.y,
    width: normalizedDecoration.width,
    height: normalizedDecoration.height,
    rotation: normalizedDecoration.rotation || 0,
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
