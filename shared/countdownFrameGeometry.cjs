const COUNTDOWN_FRAME_SCALE_LIMITS = Object.freeze({
  min: 0.5,
  max: 5,
  default: 1,
});

function normalizeCountdownFrameScale(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return COUNTDOWN_FRAME_SCALE_LIMITS.default;
  return Math.max(
    COUNTDOWN_FRAME_SCALE_LIMITS.min,
    Math.min(COUNTDOWN_FRAME_SCALE_LIMITS.max, parsed)
  );
}

function normalizeCountdownRect(rect = {}) {
  const source =
    rect && typeof rect === "object" && !Array.isArray(rect) ? rect : {};
  const x = Number.isFinite(Number(source.x)) ? Number(source.x) : 0;
  const y = Number.isFinite(Number(source.y)) ? Number(source.y) : 0;
  const width = Math.max(0, Number(source.width) || 0);
  const height = Math.max(0, Number(source.height) || 0);
  return { x, y, width, height };
}

function resolveCountdownRectUnion(rects = []) {
  const safeRects = (Array.isArray(rects) ? rects : [])
    .filter(
      (rect) =>
        rect !== null &&
        typeof rect === "object" &&
        !Array.isArray(rect)
    )
    .map(normalizeCountdownRect)
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (safeRects.length === 0) return null;

  const left = Math.min(...safeRects.map((rect) => rect.x));
  const top = Math.min(...safeRects.map((rect) => rect.y));
  const right = Math.max(...safeRects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...safeRects.map((rect) => rect.y + rect.height));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function resolveContainedCountdownFrameRect({
  sourceWidth,
  sourceHeight,
  targetRect,
} = {}) {
  const target = normalizeCountdownRect(targetRect);
  const width = Math.max(0, Number(sourceWidth) || 0);
  const height = Math.max(0, Number(sourceHeight) || 0);
  if (
    width <= 0 ||
    height <= 0 ||
    target.width <= 0 ||
    target.height <= 0
  ) {
    return target;
  }

  const scale = Math.min(target.width / width, target.height / height);
  const containedWidth = width * scale;
  const containedHeight = height * scale;
  return {
    x: target.x + (target.width - containedWidth) / 2,
    y: target.y + (target.height - containedHeight) / 2,
    width: containedWidth,
    height: containedHeight,
  };
}

function resolveCenteredScaledFrameRect(rect = {}, scaleValue) {
  const { x, y, width, height } = normalizeCountdownRect(rect);
  const scale = normalizeCountdownFrameScale(scaleValue);
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;

  return {
    x: x + (width - scaledWidth) / 2,
    y: y + (height - scaledHeight) / 2,
    width: scaledWidth,
    height: scaledHeight,
    scale,
  };
}

function resolveCountdownSelectionGeometry({
  contentRects,
  frameRects,
  frameScale,
  fallbackRect,
} = {}) {
  const safeFallback = normalizeCountdownRect(fallbackRect);
  const contentBounds =
    resolveCountdownRectUnion(contentRects) ||
    (safeFallback.width > 0 && safeFallback.height > 0
      ? safeFallback
      : null);
  const scale = normalizeCountdownFrameScale(frameScale);
  const scaledFrameRects = (Array.isArray(frameRects) ? frameRects : [])
    .map((rect) => resolveCenteredScaledFrameRect(rect, scale))
    .filter((rect) => rect.width > 0 && rect.height > 0);
  const visualFrameBounds = resolveCountdownRectUnion(scaledFrameRects);
  const selectionBounds =
    resolveCountdownRectUnion([contentBounds, visualFrameBounds]) ||
    contentBounds ||
    visualFrameBounds ||
    { x: 0, y: 0, width: 1, height: 1 };

  return {
    contentBounds,
    visualFrameBounds,
    selectionBounds,
    scaledFrameRects,
    scale,
  };
}

function resolveCountdownBoundsXWithinCanvas({
  bounds,
  canvasWidth,
  preferredCenterX,
} = {}) {
  const safeBounds = normalizeCountdownRect(bounds);
  const safeCanvasWidth = Math.max(0, Number(canvasWidth) || 0);
  const centerX = Number.isFinite(Number(preferredCenterX))
    ? Number(preferredCenterX)
    : safeCanvasWidth / 2;
  const localCenterX = safeBounds.x + safeBounds.width / 2;
  const centeredX = centerX - localCenterX;

  if (safeBounds.width <= 0 || safeCanvasWidth <= 0) return centeredX;
  if (safeBounds.width > safeCanvasWidth) {
    return safeCanvasWidth / 2 - localCenterX;
  }

  const minX = -safeBounds.x;
  const maxX = safeCanvasWidth - (safeBounds.x + safeBounds.width);
  return Math.min(Math.max(centeredX, minX), maxX);
}

function resolveCountdownFrameVisualBounds({
  width,
  height,
  frameScale,
  frameRects,
} = {}) {
  const safeWidth = Math.max(0, Number(width) || 0);
  const safeHeight = Math.max(0, Number(height) || 0);
  const scale = normalizeCountdownFrameScale(frameScale);
  const sourceRects =
    Array.isArray(frameRects) && frameRects.length > 0
      ? frameRects
      : [{ x: 0, y: 0, width: safeWidth, height: safeHeight }];
  const scaledRects = sourceRects.map((rect) =>
    resolveCenteredScaledFrameRect(rect, scale)
  );
  const left = Math.min(0, ...scaledRects.map((rect) => rect.x));
  const top = Math.min(0, ...scaledRects.map((rect) => rect.y));
  const right = Math.max(
    safeWidth,
    ...scaledRects.map((rect) => rect.x + rect.width)
  );
  const bottom = Math.max(
    safeHeight,
    ...scaledRects.map((rect) => rect.y + rect.height)
  );

  return {
    width: right - left,
    height: bottom - top,
    offsetX: Math.max(0, -left),
    offsetY: Math.max(0, -top),
    scale,
  };
}

module.exports = {
  COUNTDOWN_FRAME_SCALE_LIMITS,
  normalizeCountdownFrameScale,
  normalizeCountdownRect,
  resolveCountdownRectUnion,
  resolveContainedCountdownFrameRect,
  resolveCenteredScaledFrameRect,
  resolveCountdownSelectionGeometry,
  resolveCountdownBoundsXWithinCanvas,
  resolveCountdownFrameVisualBounds,
};
