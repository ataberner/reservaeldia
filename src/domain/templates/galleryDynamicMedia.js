import {
  buildGalleryLayoutBlueprint,
  collectGalleryMediaUrls,
  normalizeGalleryLayoutBlueprint,
  normalizeGalleryLayoutType,
  normalizeMediaUrls,
  resolveGalleryRenderLayout,
  roundMetric,
  scaleGalleryLayoutBlueprint,
} from "../../../shared/templates/galleryDynamicLayout.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function toFiniteMetric(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function resolveGalleryCellFallback(existingCells) {
  const safeCells = Array.isArray(existingCells) ? existingCells : [];
  return (
    safeCells.find((cell) => cell && typeof cell === "object") || {
      fit: "cover",
      bg: "#f3f4f6",
    }
  );
}

function resolveLayoutTypeForGallery(galleryObject) {
  return normalizeGalleryLayoutType(galleryObject?.galleryLayoutType);
}

function isDynamicGalleryObject(galleryObject) {
  return normalizeText(galleryObject?.galleryLayoutMode).toLowerCase() === "dynamic_media";
}

function resolveCurrentGalleryFrame(galleryObject) {
  const safeGalleryObject = asObject(galleryObject);
  const width = Math.max(0, toFiniteMetric(safeGalleryObject.width, 0) || 0);
  const height = Math.max(0, toFiniteMetric(safeGalleryObject.height, 0) || 0);
  const x = toFiniteMetric(safeGalleryObject.x, 0) || 0;
  const y = toFiniteMetric(safeGalleryObject.y, 0) || 0;

  return {
    x,
    y,
    width,
    height,
    centerX: roundMetric(x + width / 2),
    centerY: roundMetric(y + height / 2),
  };
}

function buildFrameFromLayout(galleryObject, layout) {
  const currentFrame = resolveCurrentGalleryFrame(galleryObject);
  const width = Math.max(
    0,
    toFiniteMetric(layout?.totalWidth, currentFrame.width) || currentFrame.width
  );
  const height = Math.max(
    0,
    toFiniteMetric(layout?.totalHeight, currentFrame.height) || currentFrame.height
  );

  return {
    x: roundMetric(currentFrame.centerX - width / 2),
    y: roundMetric(currentFrame.centerY - height / 2),
    width: roundMetric(width),
    height: roundMetric(height),
  };
}

function resolveBlueprintCaptureWidth(galleryObject) {
  const safeGalleryObject = asObject(galleryObject);
  const existingBlueprint = normalizeGalleryLayoutBlueprint(
    safeGalleryObject.galleryLayoutBlueprint
  );
  return (
    toFiniteMetric(existingBlueprint?.baseWidth, null) ??
    toFiniteMetric(safeGalleryObject.width, null) ??
    0
  );
}

export function buildGalleryCellsFromUrls(urls, existingCells = []) {
  const safeUrls = normalizeMediaUrls(urls);
  const safeCells = Array.isArray(existingCells) ? existingCells : [];
  const fallbackCell = resolveGalleryCellFallback(safeCells);

  return safeUrls.map((url, index) => {
    const currentCell =
      safeCells[index] && typeof safeCells[index] === "object"
        ? safeCells[index]
        : fallbackCell;

    return {
      ...asObject(currentCell),
      mediaUrl: url,
      fit: normalizeText(currentCell?.fit || fallbackCell?.fit) || "cover",
      bg: normalizeText(currentCell?.bg || fallbackCell?.bg) || "#f3f4f6",
    };
  });
}

export function buildGalleryLayoutBlueprintFromObject(galleryObject, options = {}) {
  const safeGalleryObject = asObject(galleryObject);
  const safeOptions = asObject(options);

  return buildGalleryLayoutBlueprint({
    width:
      toFiniteMetric(safeOptions.width, null) ??
      resolveBlueprintCaptureWidth(safeGalleryObject),
    rows: safeGalleryObject.rows,
    cols: safeGalleryObject.cols,
    gap: safeGalleryObject.gap,
    ratio: safeGalleryObject.ratio,
    baseHeight:
      toFiniteMetric(safeOptions.baseHeight, null) ??
      toFiniteMetric(safeGalleryObject.height, null) ??
      undefined,
  });
}

function resolveBlueprintForDynamicGallery(galleryObject, explicitBlueprint = undefined) {
  const safeGalleryObject = asObject(galleryObject);
  const safeLayoutType = resolveLayoutTypeForGallery(safeGalleryObject);

  if (safeLayoutType !== "canvas_preserve") {
    return normalizeGalleryLayoutBlueprint(
      explicitBlueprint ?? safeGalleryObject.galleryLayoutBlueprint
    );
  }

  return (
    normalizeGalleryLayoutBlueprint(explicitBlueprint) ||
    normalizeGalleryLayoutBlueprint(safeGalleryObject.galleryLayoutBlueprint) ||
    buildGalleryLayoutBlueprintFromObject(safeGalleryObject)
  );
}

export function scaleDynamicGalleryBlueprintToVisibleWidth(galleryObject, nextVisibleWidth) {
  const safeGalleryObject = asObject(galleryObject);
  const desiredVisibleWidth = toFiniteMetric(nextVisibleWidth, null);
  if (!Number.isFinite(desiredVisibleWidth) || desiredVisibleWidth <= 0) {
    return resolveBlueprintForDynamicGallery(safeGalleryObject);
  }

  const blueprint = resolveBlueprintForDynamicGallery(safeGalleryObject);
  if (!blueprint) return undefined;

  const currentLayout = resolveGalleryRenderLayout({
    width: safeGalleryObject.width,
    rows: safeGalleryObject.rows,
    cols: safeGalleryObject.cols,
    gap: safeGalleryObject.gap,
    ratio: safeGalleryObject.ratio,
    layoutMode: "dynamic_media",
    layoutType: resolveLayoutTypeForGallery(safeGalleryObject),
    layoutBlueprint: blueprint,
    mediaUrls: collectGalleryMediaUrls(safeGalleryObject.cells),
    isMobile: false,
  });

  const currentVisibleWidth =
    toFiniteMetric(currentLayout?.totalWidth, null) ??
    toFiniteMetric(safeGalleryObject.width, null) ??
    toFiniteMetric(blueprint?.baseWidth, null) ??
    1;

  const safeReferenceWidth = Math.max(1, currentVisibleWidth);
  const scaleFactor = desiredVisibleWidth / safeReferenceWidth;
  return scaleGalleryLayoutBlueprint(blueprint, scaleFactor);
}

export function resolveGalleryLayoutForObject({
  galleryObject,
  mediaUrls,
  isMobile = false,
  layoutMode,
  layoutBlueprint,
} = {}) {
  const safeGalleryObject = asObject(galleryObject);
  const safeUrls = normalizeMediaUrls(
    mediaUrls ?? collectGalleryMediaUrls(safeGalleryObject.cells)
  );
  const safeLayoutMode =
    normalizeText(layoutMode) || normalizeText(safeGalleryObject.galleryLayoutMode) || "fixed";
  const safeLayoutType = resolveLayoutTypeForGallery(safeGalleryObject);
  const safeBlueprint = resolveBlueprintForDynamicGallery(
    safeGalleryObject,
    layoutBlueprint
  );

  return resolveGalleryRenderLayout({
    width:
      toFiniteMetric(safeBlueprint?.baseWidth, null) ??
      toFiniteMetric(safeGalleryObject.width, null) ??
      1,
    rows: safeGalleryObject.rows,
    cols: safeGalleryObject.cols,
    gap: safeGalleryObject.gap,
    ratio: safeGalleryObject.ratio,
    layoutMode: safeLayoutMode,
    layoutType: safeLayoutType,
    layoutBlueprint: safeBlueprint,
    mediaUrls: safeUrls,
    isMobile,
  });
}

export function buildDynamicGalleryObjectPatch({
  galleryObject,
  mediaUrls,
  isMobile = false,
  layoutBlueprint,
} = {}) {
  const safeGalleryObject = asObject(galleryObject);
  const safeUrls = normalizeMediaUrls(mediaUrls);
  const currentlyDynamic = isDynamicGalleryObject(safeGalleryObject);
  const safeLayoutType = currentlyDynamic
    ? resolveLayoutTypeForGallery(safeGalleryObject)
    : "canvas_preserve";
  const safeBlueprint = currentlyDynamic
    ? resolveBlueprintForDynamicGallery(safeGalleryObject, layoutBlueprint)
    : normalizeGalleryLayoutBlueprint(layoutBlueprint) ||
      buildGalleryLayoutBlueprintFromObject(safeGalleryObject);
  const layout = resolveGalleryLayoutForObject({
    galleryObject: {
      ...safeGalleryObject,
      galleryLayoutType: safeLayoutType,
      galleryLayoutBlueprint: safeBlueprint,
    },
    mediaUrls: safeUrls,
    isMobile,
    layoutMode: "dynamic_media",
    layoutBlueprint: safeBlueprint,
  });
  const frame = buildFrameFromLayout(safeGalleryObject, layout);

  return {
    galleryLayoutMode: "dynamic_media",
    galleryLayoutType: safeLayoutType,
    galleryLayoutBlueprint: safeBlueprint || null,
    cells: buildGalleryCellsFromUrls(safeUrls, safeGalleryObject.cells),
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
  };
}

export function buildFixedGalleryObjectPatch(galleryObject) {
  const safeGalleryObject = asObject(galleryObject);
  const safeBlueprint = normalizeGalleryLayoutBlueprint(
    safeGalleryObject.galleryLayoutBlueprint
  );
  const nextWidth =
    toFiniteMetric(safeBlueprint?.baseWidth, null) ??
    toFiniteMetric(safeGalleryObject.width, null) ??
    0;
  const layout = resolveGalleryLayoutForObject({
    galleryObject: {
      ...safeGalleryObject,
      width: nextWidth,
    },
    mediaUrls: collectGalleryMediaUrls(safeGalleryObject.cells),
    isMobile: false,
    layoutMode: "fixed",
  });
  const currentFrame = resolveCurrentGalleryFrame(safeGalleryObject);
  const nextHeight =
    toFiniteMetric(layout?.totalHeight, null) ??
    toFiniteMetric(safeGalleryObject.height, null) ??
    0;

  return {
    galleryLayoutMode: "fixed",
    galleryLayoutType: "canvas_preserve",
    galleryLayoutBlueprint: null,
    width: nextWidth,
    height: nextHeight,
    x: roundMetric(currentFrame.centerX - nextWidth / 2),
    y: roundMetric(currentFrame.centerY - nextHeight / 2),
  };
}

export function buildPreviewDynamicGalleryLayout(galleryObject, mediaUrls) {
  const safeGalleryObject = asObject(galleryObject);
  const safeUrls = normalizeMediaUrls(mediaUrls);
  const safeBlueprint = resolveBlueprintForDynamicGallery(safeGalleryObject);
  const layout = resolveGalleryLayoutForObject({
    galleryObject: safeGalleryObject,
    mediaUrls: safeUrls,
    isMobile: false,
    layoutMode: "dynamic_media",
    layoutBlueprint: safeBlueprint,
  });
  const frame = buildFrameFromLayout(safeGalleryObject, layout);

  return {
    galleryLayoutMode: "dynamic_media",
    galleryLayoutType: resolveLayoutTypeForGallery(safeGalleryObject),
    galleryLayoutBlueprint: safeBlueprint || null,
    totalWidth: roundMetric(layout?.totalWidth),
    totalHeight: roundMetric(layout?.totalHeight),
    rects: Array.isArray(layout?.rects) ? layout.rects : [],
    frame,
  };
}
