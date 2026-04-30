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
const MAX_EDGE_DECORATION_OFFSET_PX = 240;
export const BACKGROUND_DECORATION_PARALLAX_VALUES = [
  "none",
  "soft",
  "dynamic",
] as const;
export type BackgroundDecorationParallaxMode =
  (typeof BACKGROUND_DECORATION_PARALLAX_VALUES)[number];
const BACKGROUND_DECORATION_PARALLAX_SET = new Set<string>(
  BACKGROUND_DECORATION_PARALLAX_VALUES
);
const {
  resolveSectionDecorationAssetUrl,
  resolveSectionEdgeDecorationAssetUrl,
} = require("../../shared/renderAssetContract.cjs");

export type BackgroundDecorationItem = {
  id: string;
  decorId: string | null;
  src: string;
  storagePath: string | null;
  nombre: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  orden: number;
};

export type BackgroundDecorationsPayload = {
  items: BackgroundDecorationItem[];
  parallax: BackgroundDecorationParallaxMode;
};

export type EdgeDecorationSlotName = "top" | "bottom";
export type EdgeDecorationMode = "cover-x" | "contain-x";
export type EdgeDecorationHeightModel = "intrinsic-clamp" | "ratio-band";

export type EdgeDecorationSlot = {
  enabled: boolean;
  src: string;
  storagePath: string | null;
  decorId: string | null;
  nombre: string;
  heightModel: EdgeDecorationHeightModel;
  intrinsicWidth: number | null;
  intrinsicHeight: number | null;
  minHeightDesktopPx: number;
  maxHeightDesktopPx: number;
  maxSectionRatioDesktop: number;
  minHeightMobilePx: number;
  maxHeightMobilePx: number;
  maxSectionRatioMobile: number;
  heightDesktopRatio: number;
  heightMobileRatio: number;
  offsetDesktopPx: number;
  offsetMobilePx: number;
  mode: EdgeDecorationMode;
};

export type EdgeDecorationsLayout = {
  maxCombinedSectionRatioDesktop: number;
  maxCombinedSectionRatioMobile: number;
};

export type EdgeDecorationsPayload = Partial<
  Record<EdgeDecorationSlotName, EdgeDecorationSlot>
> & {
  layout?: EdgeDecorationsLayout;
};

type SectionBackgroundModel = {
  base: {
    fondo: string;
    fondoTipo: string | null;
    fondoImagen: string;
    fondoImagenOffsetX: number;
    fondoImagenOffsetY: number;
    fondoImagenScale: number;
  };
  parallax: BackgroundDecorationParallaxMode;
  decoraciones: BackgroundDecorationItem[];
  decoracionesBorde: EdgeDecorationsPayload;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

export function sanitizeBackgroundDecorationParallax(
  value: unknown,
  fallback: BackgroundDecorationParallaxMode = "none"
): BackgroundDecorationParallaxMode {
  const normalized = normalizeText(value).toLowerCase();
  if (BACKGROUND_DECORATION_PARALLAX_SET.has(normalized)) {
    return normalized as BackgroundDecorationParallaxMode;
  }

  const fallbackNormalized = normalizeText(fallback).toLowerCase();
  if (BACKGROUND_DECORATION_PARALLAX_SET.has(fallbackNormalized)) {
    return fallbackNormalized as BackgroundDecorationParallaxMode;
  }

  return "none";
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveSectionBaseImageScale(value: unknown, fallback = 1): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function toPositiveNumber(value: unknown, fallback: number | null): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function toOrderNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolveSectionHeight(value: unknown): number {
  return Math.max(
    1,
    toPositiveNumber(value, DEFAULT_SECTION_HEIGHT) || DEFAULT_SECTION_HEIGHT
  );
}

function resolveCanvasWidth(value: unknown): number {
  return Math.max(1, toPositiveNumber(value, CANVAS_WIDTH) || CANVAS_WIDTH);
}

function buildLegacyDecorationId(slot: string): string {
  return `legacy-${normalizeText(slot).toLowerCase() || "decoracion"}`;
}

function normalizeEdgeDecorationSlotName(value: unknown): EdgeDecorationSlotName | null {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "top" || normalized === "superior") return "top";
  if (normalized === "bottom" || normalized === "inferior") return "bottom";
  return null;
}

function getEdgeDecorationFallbackName(slot: EdgeDecorationSlotName): string {
  return slot === "top" ? "Decoracion superior" : "Decoracion inferior";
}

function normalizeEdgeDecorationMode(value: unknown): EdgeDecorationMode {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === "contain-x" ? "contain-x" : "cover-x";
}

function normalizeEdgeDecorationHeightModel(value: unknown): EdgeDecorationHeightModel {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === "ratio-band" ? "ratio-band" : DEFAULT_EDGE_DECORATION_HEIGHT_MODEL;
}

function normalizeEdgeDecorationRatio(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return clamp(parsed, min, max);
}

function hasPositiveNumber(value: unknown): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function normalizeEdgeDecorationDimension(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(clamp(parsed, 1, 20000) * 100) / 100;
}

function normalizeEdgeDecorationHeightPx(
  value: unknown,
  fallback: number,
  max: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(clamp(parsed, MIN_EDGE_DECORATION_HEIGHT_PX, max));
}

function normalizeEdgeDecorationMaxSectionRatio(
  value: unknown,
  legacyRatioValue: unknown,
  fallback: number,
  max: number
): number {
  if (hasPositiveNumber(value)) {
    return normalizeEdgeDecorationRatio(value, fallback, 0.08, max);
  }

  if (hasPositiveNumber(legacyRatioValue)) {
    return normalizeEdgeDecorationRatio(legacyRatioValue, fallback, 0.08, max);
  }

  return fallback;
}

function normalizeEdgeDecorationOffsetPx(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return clamp(parsed, -MAX_EDGE_DECORATION_OFFSET_PX, MAX_EDGE_DECORATION_OFFSET_PX);
}

function normalizeEdgeDecorationsLayout(rawLayout: unknown): EdgeDecorationsLayout {
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

function hasEdgeDecorationSlots(decoracionesBorde: EdgeDecorationsPayload): boolean {
  return Boolean(decoracionesBorde.top || decoracionesBorde.bottom);
}

function ensureDecorationBounds(
  width: unknown,
  height: unknown,
  sectionHeight: number,
  canvasWidth = CANVAS_WIDTH
): { width: number; height: number } {
  let nextWidth = Math.max(
    MIN_DECORATION_SIZE,
    Math.round(toPositiveNumber(width, DEFAULT_DECORATION_WIDTH) || DEFAULT_DECORATION_WIDTH)
  );
  let nextHeight = Math.max(
    MIN_DECORATION_SIZE,
    Math.round(toPositiveNumber(height, DEFAULT_DECORATION_HEIGHT) || DEFAULT_DECORATION_HEIGHT)
  );

  return {
    width: nextWidth,
    height: nextHeight,
  };
}

function clampDecorationAxisPosition(
  value: unknown,
  size: number,
  viewportSize: number
): number {
  const safeSize = Math.max(
    MIN_DECORATION_SIZE,
    Math.round(toPositiveNumber(size, MIN_DECORATION_SIZE) || MIN_DECORATION_SIZE)
  );
  const safeViewport = Math.max(1, Math.round(toPositiveNumber(viewportSize, 1) || 1));
  const visiblePortion = Math.min(safeSize, MIN_VISIBLE_DECORATION_PORTION);
  const minPosition = visiblePortion - safeSize;
  const maxPosition = safeViewport - visiblePortion;
  return Math.round(clamp(toFiniteNumber(value, 0), minPosition, maxPosition));
}

function normalizeDecorationOrder(items: BackgroundDecorationItem[]): BackgroundDecorationItem[] {
  return items
    .filter(Boolean)
    .slice()
    .sort((left, right) => {
      if (left.orden !== right.orden) return left.orden - right.orden;
      return left.id.localeCompare(right.id);
    })
    .map((item, index) => ({
      ...item,
      orden: index,
    }));
}

function resolveBackgroundDecorationParallax(
  rawDecoracionesFondo: unknown,
  fallback: BackgroundDecorationParallaxMode = "none"
): BackgroundDecorationParallaxMode {
  return sanitizeBackgroundDecorationParallax(
    asObject(rawDecoracionesFondo).parallax,
    fallback
  );
}

export function clampBackgroundDecorationToBounds(
  decoration: Record<string, unknown>,
  sectionHeight: number,
  canvasWidth = CANVAS_WIDTH
): BackgroundDecorationItem {
  const safeSectionHeight = resolveSectionHeight(sectionHeight);
  const safeCanvasWidth = resolveCanvasWidth(canvasWidth);
  const boundedSize = ensureDecorationBounds(
    decoration.width,
    decoration.height,
    safeSectionHeight,
    safeCanvasWidth
  );

  return {
    id: normalizeText(decoration.id || decoration.decorationId) || "decoracion",
    decorId: normalizeText(decoration.decorId) || null,
    src: normalizeText(decoration.src),
    storagePath: normalizeText(decoration.storagePath) || null,
    nombre: normalizeText(decoration.nombre) || "Decoracion",
    x: clampDecorationAxisPosition(decoration.x, boundedSize.width, safeCanvasWidth),
    y: clampDecorationAxisPosition(decoration.y, boundedSize.height, safeSectionHeight),
    width: boundedSize.width,
    height: boundedSize.height,
    rotation: Math.round(toFiniteNumber(decoration.rotation, 0) * 100) / 100,
    orden: toOrderNumber(decoration.orden, 0),
  };
}

function normalizeBackgroundDecoration(
  raw: unknown,
  {
    sectionHeight = DEFAULT_SECTION_HEIGHT,
    canvasWidth = CANVAS_WIDTH,
    fallbackId = "",
    fallbackOrder = 0,
  }: {
    sectionHeight?: number;
    canvasWidth?: number;
    fallbackId?: string;
    fallbackOrder?: number;
  } = {}
): BackgroundDecorationItem | null {
  const safeRaw = asObject(raw);
  const src = resolveSectionDecorationAssetUrl(safeRaw);
  if (!src) return null;

  return clampBackgroundDecorationToBounds(
    {
      id:
        normalizeText(safeRaw.id || safeRaw.decorationId) ||
        fallbackId ||
        `decoracion-${fallbackOrder + 1}`,
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
    },
    sectionHeight,
    canvasWidth
  );
}

export function normalizeBackgroundDecorations(
  rawDecoracionesFondo: unknown,
  {
    sectionHeight = DEFAULT_SECTION_HEIGHT,
    canvasWidth = CANVAS_WIDTH,
  }: {
    sectionHeight?: number;
    canvasWidth?: number;
  } = {}
): BackgroundDecorationItem[] {
  const safeRaw = asObject(rawDecoracionesFondo);
  const sourceItems = Array.isArray(safeRaw.items)
    ? safeRaw.items
    : [
        safeRaw.superior
          ? {
              ...asObject(safeRaw.superior),
              id: normalizeText(asObject(safeRaw.superior).id) || buildLegacyDecorationId("superior"),
              orden: 0,
            }
          : null,
        safeRaw.inferior
          ? {
              ...asObject(safeRaw.inferior),
              id: normalizeText(asObject(safeRaw.inferior).id) || buildLegacyDecorationId("inferior"),
              orden: 1,
            }
          : null,
      ].filter(Boolean);

  const normalized = sourceItems
    .map((item, index) =>
      normalizeBackgroundDecoration(item, {
        sectionHeight,
        canvasWidth,
        fallbackId:
          index === 0 && !Array.isArray(safeRaw.items)
            ? buildLegacyDecorationId("superior")
            : index === 1 && !Array.isArray(safeRaw.items)
              ? buildLegacyDecorationId("inferior")
              : `decoracion-${index + 1}`,
        fallbackOrder: index,
      })
    )
    .filter((item): item is BackgroundDecorationItem => Boolean(item));

  return normalizeDecorationOrder(normalized);
}

export function normalizeEdgeDecorationSlot(
  rawSlot: unknown,
  slot: EdgeDecorationSlotName
): EdgeDecorationSlot | null {
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

export function normalizeEdgeDecorations(
  rawDecoracionesBorde: unknown
): EdgeDecorationsPayload {
  const safeRaw = asObject(rawDecoracionesBorde);
  const normalized: EdgeDecorationsPayload = {};

  (["top", "bottom"] as EdgeDecorationSlotName[]).forEach((slot) => {
    const slotValue = safeRaw[slot];
    const normalizedSlot = normalizeEdgeDecorationSlot(slotValue, slot);
    if (normalizedSlot) {
      normalized[slot] = normalizedSlot;
    }
  });

  if (hasEdgeDecorationSlots(normalized)) {
    normalized.layout = normalizeEdgeDecorationsLayout(safeRaw.layout);
  }

  return normalized;
}

export function buildSectionEdgeDecorationsPayload(
  sectionOrDecoraciones: unknown
): EdgeDecorationsPayload {
  const safeSource = asObject(sectionOrDecoraciones);
  return normalizeEdgeDecorations(safeSource.decoracionesBorde ?? safeSource);
}

export function buildSectionDecorationsPayload(
  sectionOrDecoraciones: unknown,
  {
    sectionHeight = DEFAULT_SECTION_HEIGHT,
    canvasWidth = CANVAS_WIDTH,
  }: {
    sectionHeight?: number;
    canvasWidth?: number;
  } = {}
): BackgroundDecorationsPayload {
  const safeSource = asObject(sectionOrDecoraciones);
  const decorationsSource = safeSource.decoracionesFondo ?? safeSource;
  const safeSectionHeight = resolveSectionHeight(safeSource.altura ?? sectionHeight);

  return {
    items: normalizeBackgroundDecorations(decorationsSource, {
      sectionHeight: safeSectionHeight,
      canvasWidth,
    }),
    parallax: resolveBackgroundDecorationParallax(decorationsSource),
  };
}

export function normalizeSectionBackgroundModel(section: unknown): SectionBackgroundModel {
  const safeSection = asObject(section);
  const sectionHeight = resolveSectionHeight(safeSection.altura);

  return {
    base: {
      fondo: normalizeText(safeSection.fondo) || "#ffffff",
      fondoTipo: normalizeText(safeSection.fondoTipo) || null,
      fondoImagen: normalizeText(safeSection.fondoImagen),
      fondoImagenOffsetX: toFiniteNumber(safeSection.fondoImagenOffsetX, 0),
      fondoImagenOffsetY: toFiniteNumber(safeSection.fondoImagenOffsetY, 0),
      fondoImagenScale: resolveSectionBaseImageScale(safeSection.fondoImagenScale, 1),
    },
    parallax: resolveBackgroundDecorationParallax(safeSection.decoracionesFondo),
    decoraciones: normalizeBackgroundDecorations(safeSection.decoracionesFondo, {
      sectionHeight,
      canvasWidth: CANVAS_WIDTH,
    }),
    decoracionesBorde: normalizeEdgeDecorations(safeSection.decoracionesBorde),
  };
}

export function listSectionVisualAssets(
  section: unknown
): Array<{
  assetKey: string;
  sectionId: string;
  kind: "base" | "background-decoration" | "edge-decoration";
  slot?: EdgeDecorationSlotName | null;
  decorationId: string | null;
  imageUrl: string;
  storagePath: string | null;
}> {
  const safeSection = asObject(section);
  const sectionId = normalizeText(safeSection.id);
  const model = normalizeSectionBackgroundModel(section);
  const assets: Array<{
    assetKey: string;
    sectionId: string;
    kind: "base" | "background-decoration" | "edge-decoration";
    slot?: EdgeDecorationSlotName | null;
    decorationId: string | null;
    imageUrl: string;
    storagePath: string | null;
  }> = [];

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
    if (!decoration.src) return;
    assets.push({
      assetKey: `${sectionId}:decoracion:${decoration.id}`,
      sectionId,
      kind: "background-decoration",
      decorationId: decoration.id,
      imageUrl: decoration.src,
      storagePath: decoration.storagePath || null,
    });
  });

  (["top", "bottom"] as EdgeDecorationSlotName[]).forEach((slot) => {
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
