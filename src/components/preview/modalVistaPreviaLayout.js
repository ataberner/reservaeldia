export const MOBILE_VIEWPORT_WIDTH = 390;
export const MOBILE_VIEWPORT_HEIGHT = 844;
export const DESKTOP_VIEWPORT_WIDTH = 1280;
export const DESKTOP_VIEWPORT_HEIGHT = 820;

const SHOWCASE_MIN_STAGE_WIDTH = 1400;
const DUAL_COLUMN_MIN_STAGE_WIDTH = 980;

const DESKTOP_CARD_CHROME_X = 12;
const DESKTOP_CARD_CHROME_Y = 34;
const MOBILE_CARD_CHROME_X = 12;
const MOBILE_CARD_CHROME_Y = 16;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildScaledFrameMetrics({
  viewportWidth,
  viewportHeight,
  widthBudget,
  heightBudget,
  minScale,
}) {
  const safeWidthBudget = Math.max(0, Number(widthBudget) || 0);
  const safeHeightBudget = Math.max(0, Number(heightBudget) || 0);
  const scale = clamp(
    Math.min(
      1,
      safeWidthBudget / viewportWidth || 0,
      safeHeightBudget / viewportHeight || 0
    ),
    minScale,
    1
  );

  return {
    scale,
    scaledWidth: Math.round(viewportWidth * scale),
    scaledHeight: Math.round(viewportHeight * scale),
  };
}

function buildShowcaseOverlapLayout(stageWidth, stageHeight) {
  const stagePaddingX = stageWidth >= 1540 ? 36 : 30;
  const stagePaddingY = stageHeight >= 720 ? 22 : 16;
  const availableWidth = Math.max(420, stageWidth - stagePaddingX * 2);
  const availableHeight = Math.max(280, stageHeight - stagePaddingY * 2);

  const mobileFrame = buildScaledFrameMetrics({
    viewportWidth: MOBILE_VIEWPORT_WIDTH,
    viewportHeight: MOBILE_VIEWPORT_HEIGHT,
    widthBudget: clamp(Math.round(stageWidth * 0.15), 190, 236),
    heightBudget: Math.min(
      availableHeight - MOBILE_CARD_CHROME_Y,
      Math.round(availableHeight * 0.82)
    ),
    minScale: 0.32,
  });
  const mobileCardWidth = mobileFrame.scaledWidth + MOBILE_CARD_CHROME_X;
  const mobileCardHeight = mobileFrame.scaledHeight + MOBILE_CARD_CHROME_Y;
  const overlapX = clamp(Math.round(mobileCardWidth * 0.48), 96, 124);
  const mobileLift = clamp(Math.round(mobileCardHeight * 0.1), 22, 34);

  const desktopFrame = buildScaledFrameMetrics({
    viewportWidth: DESKTOP_VIEWPORT_WIDTH,
    viewportHeight: DESKTOP_VIEWPORT_HEIGHT,
    widthBudget:
      Math.max(420, availableWidth - mobileCardWidth + overlapX) -
      DESKTOP_CARD_CHROME_X,
    heightBudget:
      Math.max(240, availableHeight - mobileLift) - DESKTOP_CARD_CHROME_Y,
    minScale: 0.2,
  });
  const desktopCardWidth = desktopFrame.scaledWidth + DESKTOP_CARD_CHROME_X;
  const desktopCardHeight = desktopFrame.scaledHeight + DESKTOP_CARD_CHROME_Y;

  const mobileLeft = Math.max(0, desktopCardWidth - overlapX);
  const mobileTop = Math.max(
    10,
    desktopCardHeight - mobileCardHeight + mobileLift
  );

  return {
    mode: "showcase-overlap",
    toolbarMode: "inline",
    stagePaddingX,
    stagePaddingY,
    gap: 0,
    desktopFrame,
    mobileFrame,
    desktopCardWidth,
    desktopCardHeight,
    mobileCardWidth,
    mobileCardHeight,
    desktopSlotHeight: desktopCardHeight,
    mobileSlotHeight: mobileCardHeight,
    mobileColumnWidth: mobileCardWidth,
    sceneWidth: Math.max(desktopCardWidth, mobileLeft + mobileCardWidth),
    sceneHeight: Math.max(desktopCardHeight, mobileTop + mobileCardHeight),
    mobileLeft,
    mobileTop,
  };
}

function buildDualColumnCompactLayout(stageWidth, stageHeight) {
  const stagePaddingX = stageWidth >= 1180 ? 22 : 14;
  const stagePaddingY = stageHeight >= 640 ? 18 : 12;
  const gap = stageWidth >= 1180 ? 16 : 12;
  const availableWidth = Math.max(360, stageWidth - stagePaddingX * 2);
  const availableHeight = Math.max(260, stageHeight - stagePaddingY * 2);

  const mobileFrame = buildScaledFrameMetrics({
    viewportWidth: MOBILE_VIEWPORT_WIDTH,
    viewportHeight: MOBILE_VIEWPORT_HEIGHT,
    widthBudget:
      clamp(Math.round(stageWidth * 0.18), 180, 220) - MOBILE_CARD_CHROME_X,
    heightBudget: availableHeight - MOBILE_CARD_CHROME_Y,
    minScale: 0.32,
  });
  const mobileCardWidth = mobileFrame.scaledWidth + MOBILE_CARD_CHROME_X;
  const mobileCardHeight = mobileFrame.scaledHeight + MOBILE_CARD_CHROME_Y;

  const desktopFrame = buildScaledFrameMetrics({
    viewportWidth: DESKTOP_VIEWPORT_WIDTH,
    viewportHeight: DESKTOP_VIEWPORT_HEIGHT,
    widthBudget:
      Math.max(320, availableWidth - mobileCardWidth - gap) -
      DESKTOP_CARD_CHROME_X,
    heightBudget: availableHeight - DESKTOP_CARD_CHROME_Y,
    minScale: 0.2,
  });
  const desktopCardWidth = desktopFrame.scaledWidth + DESKTOP_CARD_CHROME_X;
  const desktopCardHeight = desktopFrame.scaledHeight + DESKTOP_CARD_CHROME_Y;

  return {
    mode: "dual-column-compact",
    toolbarMode: stageWidth >= 1080 ? "inline" : "stacked",
    stagePaddingX,
    stagePaddingY,
    gap,
    desktopFrame,
    mobileFrame,
    desktopCardWidth,
    desktopCardHeight,
    mobileCardWidth,
    mobileCardHeight,
    desktopSlotHeight: availableHeight,
    mobileSlotHeight: availableHeight,
    mobileColumnWidth: mobileCardWidth,
    sceneWidth: availableWidth,
    sceneHeight: availableHeight,
  };
}

function buildStackedPriorityLayout(stageWidth, stageHeight) {
  const stagePaddingX = stageWidth >= 720 ? 14 : stageWidth >= 420 ? 10 : 6;
  const stagePaddingY = stageHeight >= 760 ? 12 : 8;
  const gap = stageHeight >= 760 ? 12 : 10;
  const availableWidth = Math.max(220, stageWidth - stagePaddingX * 2);
  const availableHeight = Math.max(320, stageHeight - stagePaddingY * 2 - gap);
  const desktopSlotHeight = clamp(
    Math.round(availableHeight * 0.41),
    180,
    Math.max(180, availableHeight - 212)
  );
  const mobileSlotHeight = Math.max(200, availableHeight - desktopSlotHeight);

  const desktopFrame = buildScaledFrameMetrics({
    viewportWidth: DESKTOP_VIEWPORT_WIDTH,
    viewportHeight: DESKTOP_VIEWPORT_HEIGHT,
    widthBudget: availableWidth - DESKTOP_CARD_CHROME_X,
    heightBudget: desktopSlotHeight - DESKTOP_CARD_CHROME_Y,
    minScale: 0.2,
  });

  const mobileFrame = buildScaledFrameMetrics({
    viewportWidth: MOBILE_VIEWPORT_WIDTH,
    viewportHeight: MOBILE_VIEWPORT_HEIGHT,
    widthBudget: Math.min(
      Math.max(170, availableWidth - MOBILE_CARD_CHROME_X),
      clamp(Math.round(stageWidth * 0.56), 180, 296)
    ),
    heightBudget: mobileSlotHeight - MOBILE_CARD_CHROME_Y,
    minScale: 0.32,
  });

  return {
    mode: "stacked-priority",
    toolbarMode: "stacked",
    stagePaddingX,
    stagePaddingY,
    gap,
    desktopFrame,
    mobileFrame,
    desktopCardWidth: desktopFrame.scaledWidth + DESKTOP_CARD_CHROME_X,
    desktopCardHeight: desktopFrame.scaledHeight + DESKTOP_CARD_CHROME_Y,
    mobileCardWidth: mobileFrame.scaledWidth + MOBILE_CARD_CHROME_X,
    mobileCardHeight: mobileFrame.scaledHeight + MOBILE_CARD_CHROME_Y,
    desktopSlotHeight,
    mobileSlotHeight,
    mobileColumnWidth: mobileFrame.scaledWidth + MOBILE_CARD_CHROME_X,
    sceneWidth: availableWidth,
    sceneHeight: availableHeight,
  };
}

export function computeModalVistaPreviaLayout({
  stageWidth,
  stageHeight,
  fallbackWidth = 320,
  fallbackHeight = 320,
} = {}) {
  const safeStageWidth = Math.max(
    320,
    Number(stageWidth) || Number(fallbackWidth) || 0
  );
  const safeStageHeight = Math.max(
    320,
    Number(stageHeight) || Number(fallbackHeight) || 0
  );

  const baseLayout =
    safeStageWidth >= SHOWCASE_MIN_STAGE_WIDTH
      ? buildShowcaseOverlapLayout(safeStageWidth, safeStageHeight)
      : safeStageWidth >= DUAL_COLUMN_MIN_STAGE_WIDTH
        ? buildDualColumnCompactLayout(safeStageWidth, safeStageHeight)
        : buildStackedPriorityLayout(safeStageWidth, safeStageHeight);

  return {
    ...baseLayout,
    safeStageWidth,
    safeStageHeight,
    isCompactToolbar: baseLayout.toolbarMode !== "inline",
  };
}
