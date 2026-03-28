export const COUNTDOWN_PREVIEW_FIT_MODES = Object.freeze({
  WIDTH: "width",
  CONTAIN: "contain",
});

const DEFAULT_MARGIN_FACTOR = 0.95;

function toPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function computeCountdownPreviewScale({
  containerWidth,
  containerHeight,
  contentWidth,
  contentHeight,
  fitMode = COUNTDOWN_PREVIEW_FIT_MODES.WIDTH,
  marginFactor = DEFAULT_MARGIN_FACTOR,
} = {}) {
  const safeContainerWidth = toPositiveNumber(containerWidth);
  const safeContentWidth = toPositiveNumber(contentWidth);
  if (!safeContainerWidth || !safeContentWidth) return null;

  const safeMarginFactor = Math.min(
    1,
    toPositiveNumber(marginFactor) || DEFAULT_MARGIN_FACTOR
  );
  const widthScale = Math.min(1, safeContainerWidth / safeContentWidth);

  if (fitMode !== COUNTDOWN_PREVIEW_FIT_MODES.CONTAIN) {
    return widthScale * safeMarginFactor;
  }

  const safeContainerHeight = toPositiveNumber(containerHeight);
  const safeContentHeight = toPositiveNumber(contentHeight);
  if (!safeContainerHeight || !safeContentHeight) {
    return widthScale * safeMarginFactor;
  }

  const heightScale = Math.min(1, safeContainerHeight / safeContentHeight);
  return Math.min(widthScale, heightScale) * safeMarginFactor;
}
