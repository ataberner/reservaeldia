export const MIN_IMAGE_CROP_DISPLAY_SIZE = 24;

function toFiniteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toPositiveNumber(value, fallback = null) {
  const parsed = toFiniteNumber(value, fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return value;
  return Math.min(Math.max(value, min), max);
}

function roundMetric(value) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(3));
}

export function resolveImageSourceSize(obj = {}, imageLike = null) {
  const width =
    toPositiveNumber(obj?.ancho) ??
    toPositiveNumber(imageLike?.naturalWidth) ??
    toPositiveNumber(imageLike?.width) ??
    1;
  const height =
    toPositiveNumber(obj?.alto) ??
    toPositiveNumber(imageLike?.naturalHeight) ??
    toPositiveNumber(imageLike?.height) ??
    1;

  return {
    width,
    height,
  };
}

export function resolveImageCropState(obj = {}, imageLike = null) {
  const source = resolveImageSourceSize(obj, imageLike);
  const displayWidth =
    toPositiveNumber(obj?.width) ??
    toPositiveNumber(imageLike?.width) ??
    source.width;
  const displayHeight =
    toPositiveNumber(obj?.height) ??
    toPositiveNumber(imageLike?.height) ??
    source.height;

  const rawCropX = clamp(toFiniteNumber(obj?.cropX, 0), 0, Math.max(0, source.width - 1));
  const rawCropY = clamp(toFiniteNumber(obj?.cropY, 0), 0, Math.max(0, source.height - 1));
  const cropWidth = clamp(
    toPositiveNumber(obj?.cropWidth, source.width),
    1,
    Math.max(1, source.width - rawCropX)
  );
  const cropHeight = clamp(
    toPositiveNumber(obj?.cropHeight, source.height),
    1,
    Math.max(1, source.height - rawCropY)
  );

  return {
    sourceWidth: source.width,
    sourceHeight: source.height,
    x: toFiniteNumber(obj?.x, 0),
    y: toFiniteNumber(obj?.y, 0),
    width: Math.max(1, displayWidth),
    height: Math.max(1, displayHeight),
    rotation: toFiniteNumber(obj?.rotation, 0),
    cropX: rawCropX,
    cropY: rawCropY,
    cropWidth,
    cropHeight,
  };
}

export function resolveKonvaImageCrop(obj = {}, imageLike = null) {
  const state = resolveImageCropState(obj, imageLike);

  return {
    width: state.width,
    height: state.height,
    crop: {
      x: state.cropX,
      y: state.cropY,
      width: state.cropWidth,
      height: state.cropHeight,
    },
    sourceWidth: state.sourceWidth,
    sourceHeight: state.sourceHeight,
  };
}

export function applyImageCropEdgeDrag({
  edge,
  deltaLocal = 0,
  snapshot,
  minDisplaySize = MIN_IMAGE_CROP_DISPLAY_SIZE,
}) {
  if (!snapshot || !edge) return null;

  const width = Math.max(1, toPositiveNumber(snapshot.width, 1));
  const height = Math.max(1, toPositiveNumber(snapshot.height, 1));
  const cropWidth = Math.max(1, toPositiveNumber(snapshot.cropWidth, 1));
  const cropHeight = Math.max(1, toPositiveNumber(snapshot.cropHeight, 1));
  const scaleX = width / cropWidth;
  const scaleY = height / cropHeight;
  const safeScaleX = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1;
  const safeScaleY = Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1;
  const minSourceWidth = Math.max(1, minDisplaySize / safeScaleX);
  const minSourceHeight = Math.max(1, minDisplaySize / safeScaleY);
  const rotationDeg = toFiniteNumber(snapshot.rotation, 0);
  const rotationRad = (rotationDeg * Math.PI) / 180;
  const axisX = { x: Math.cos(rotationRad), y: Math.sin(rotationRad) };
  const axisY = { x: -Math.sin(rotationRad), y: Math.cos(rotationRad) };
  const next = {
    x: toFiniteNumber(snapshot.x, 0),
    y: toFiniteNumber(snapshot.y, 0),
    width,
    height,
    rotation: rotationDeg,
    cropX: clamp(
      toFiniteNumber(snapshot.cropX, 0),
      0,
      Math.max(0, Number(snapshot.sourceWidth || 1) - 1)
    ),
    cropY: clamp(
      toFiniteNumber(snapshot.cropY, 0),
      0,
      Math.max(0, Number(snapshot.sourceHeight || 1) - 1)
    ),
    cropWidth,
    cropHeight,
    sourceWidth: Math.max(1, toPositiveNumber(snapshot.sourceWidth, 1)),
    sourceHeight: Math.max(1, toPositiveNumber(snapshot.sourceHeight, 1)),
  };

  if (edge === "left") {
    const minDelta = -next.cropX * safeScaleX;
    const maxDelta = Math.min(
      next.width - minDisplaySize,
      (next.cropWidth - minSourceWidth) * safeScaleX
    );
    const delta = clamp(deltaLocal, minDelta, maxDelta);
    const cropDelta = delta / safeScaleX;
    next.x += axisX.x * delta;
    next.y += axisX.y * delta;
    next.width -= delta;
    next.cropX += cropDelta;
    next.cropWidth -= cropDelta;
  } else if (edge === "right") {
    const minDelta = Math.max(
      minDisplaySize - next.width,
      -(next.cropWidth - minSourceWidth) * safeScaleX
    );
    const maxDelta =
      (next.sourceWidth - next.cropX - next.cropWidth) * safeScaleX;
    const delta = clamp(deltaLocal, minDelta, maxDelta);
    const cropDelta = delta / safeScaleX;
    next.width += delta;
    next.cropWidth += cropDelta;
  } else if (edge === "top") {
    const minDelta = -next.cropY * safeScaleY;
    const maxDelta = Math.min(
      next.height - minDisplaySize,
      (next.cropHeight - minSourceHeight) * safeScaleY
    );
    const delta = clamp(deltaLocal, minDelta, maxDelta);
    const cropDelta = delta / safeScaleY;
    next.x += axisY.x * delta;
    next.y += axisY.y * delta;
    next.height -= delta;
    next.cropY += cropDelta;
    next.cropHeight -= cropDelta;
  } else if (edge === "bottom") {
    const minDelta = Math.max(
      minDisplaySize - next.height,
      -(next.cropHeight - minSourceHeight) * safeScaleY
    );
    const maxDelta =
      (next.sourceHeight - next.cropY - next.cropHeight) * safeScaleY;
    const delta = clamp(deltaLocal, minDelta, maxDelta);
    const cropDelta = delta / safeScaleY;
    next.height += delta;
    next.cropHeight += cropDelta;
  } else {
    return null;
  }

  return {
    x: roundMetric(next.x),
    y: roundMetric(next.y),
    width: roundMetric(Math.max(minDisplaySize, next.width)),
    height: roundMetric(Math.max(minDisplaySize, next.height)),
    rotation: roundMetric(next.rotation),
    cropX: roundMetric(clamp(next.cropX, 0, Math.max(0, next.sourceWidth - 1))),
    cropY: roundMetric(clamp(next.cropY, 0, Math.max(0, next.sourceHeight - 1))),
    cropWidth: roundMetric(
      clamp(next.cropWidth, 1, Math.max(1, next.sourceWidth - next.cropX))
    ),
    cropHeight: roundMetric(
      clamp(next.cropHeight, 1, Math.max(1, next.sourceHeight - next.cropY))
    ),
    sourceWidth: roundMetric(next.sourceWidth),
    sourceHeight: roundMetric(next.sourceHeight),
  };
}
