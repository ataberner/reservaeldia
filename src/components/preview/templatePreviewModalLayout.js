const TEMPLATE_PREVIEW_DESKTOP_VIEWPORT_WIDTH = 1280;
const TEMPLATE_PREVIEW_DESKTOP_VIEWPORT_HEIGHT = 820;
const TEMPLATE_PREVIEW_MOBILE_VIEWPORT_WIDTH = 390;
const TEMPLATE_PREVIEW_MOBILE_VIEWPORT_HEIGHT = 844;
const TEMPLATE_PREVIEW_MOBILE_STAGE_MAX_WIDTH = 640;
const TEMPLATE_PREVIEW_TABLET_HOST_MIN_WIDTH = 640;
const TEMPLATE_PREVIEW_TABLET_HOST_MAX_WIDTH = 1024;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function resolveTemplatePreviewViewportLayout({
  stageWidth = 0,
  stageHeight = 0,
  hostViewportWidth = 0,
} = {}) {
  const measuredStageWidth = Math.max(0, Number(stageWidth) || 0);
  const measuredStageHeight = Math.max(0, Number(stageHeight) || 0);
  const measuredHostViewportWidth = Math.max(
    0,
    Number(hostViewportWidth) || 0
  );
  const isMobileHost =
    measuredStageWidth > 0
      ? measuredStageWidth < TEMPLATE_PREVIEW_MOBILE_STAGE_MAX_WIDTH
      : measuredHostViewportWidth > 0 &&
        measuredHostViewportWidth < TEMPLATE_PREVIEW_MOBILE_STAGE_MAX_WIDTH;
  const isTabletHost =
    !isMobileHost &&
    measuredHostViewportWidth >= TEMPLATE_PREVIEW_TABLET_HOST_MIN_WIDTH &&
    measuredHostViewportWidth <= TEMPLATE_PREVIEW_TABLET_HOST_MAX_WIDTH;
  const previewViewport = isMobileHost ? "mobile" : "desktop";
  const viewportWidth = isMobileHost
    ? TEMPLATE_PREVIEW_MOBILE_VIEWPORT_WIDTH
    : TEMPLATE_PREVIEW_DESKTOP_VIEWPORT_WIDTH;
  const baseViewportHeight = isMobileHost
    ? TEMPLATE_PREVIEW_MOBILE_VIEWPORT_HEIGHT
    : TEMPLATE_PREVIEW_DESKTOP_VIEWPORT_HEIGHT;
  const widthBudget = measuredStageWidth || 240;
  const scale = clamp(widthBudget / viewportWidth, 0, 1);
  const scaledWidth = Math.round(viewportWidth * scale);

  // The iframe is a viewing window. Its height follows the host, while section
  // layout keeps the canonical viewport height regardless of host proportions.
  if (measuredStageHeight > 0) {
    const scaledHeight = Math.max(1, Math.floor(measuredStageHeight));
    return {
      isMobileHost,
      isTabletHost,
      previewViewport,
      viewportWidth,
      viewportHeight: scaledHeight / scale,
      layoutViewportHeight: baseViewportHeight,
      scale,
      scaledWidth,
      scaledHeight,
    };
  }

  return {
    isMobileHost,
    isTabletHost,
    previewViewport,
    viewportWidth,
    viewportHeight: baseViewportHeight,
    layoutViewportHeight: baseViewportHeight,
    scale,
    scaledWidth,
    scaledHeight: Math.round(baseViewportHeight * scale),
  };
}
