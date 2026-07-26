import { resolveCountdownLayoutMetrics } from "./renderModel.js";
import {
  resolveContainedCountdownFrameRect,
  resolveCountdownSelectionGeometry,
} from "./frameGeometry.js";

function toFinite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveFrameSourceDimension(override, persistedValue) {
  return Math.max(0, toFinite(override, toFinite(persistedValue, 0)));
}

export function resolveCountdownEffectiveGeometry(
  countdown = {},
  {
    width = countdown?.width,
    height = countdown?.height,
    frameSourceWidth,
    frameSourceHeight,
  } = {}
) {
  const layoutMetrics = resolveCountdownLayoutMetrics({
    ...countdown,
    width,
    height,
  });
  const contentRects = [
    ...layoutMetrics.unitLayouts,
    ...layoutMetrics.separatorLayouts.map((separator) => ({
      x: separator.x,
      y: separator.y,
      width: separator.width,
      height: Math.max(
        1,
        layoutMetrics.separatorFontSize * layoutMetrics.lineHeight
      ),
    })),
  ];
  const isPngFrame = layoutMetrics.frameAssetType === "png";
  const sourceWidth = resolveFrameSourceDimension(
    frameSourceWidth,
    countdown?.frameIntrinsicWidth
  );
  const sourceHeight = resolveFrameSourceDimension(
    frameSourceHeight,
    countdown?.frameIntrinsicHeight
  );
  const resolveFrameRect = (targetRect) =>
    isPngFrame
      ? resolveContainedCountdownFrameRect({
          sourceWidth,
          sourceHeight,
          targetRect,
        })
      : targetRect;
  const frameRects = !layoutMetrics.hasFrameConfigured
    ? []
    : layoutMetrics.useSingleFrameLayout
      ? [
          resolveFrameRect({
            x: 0,
            y: 0,
            width: layoutMetrics.containerW,
            height: layoutMetrics.containerH,
          }),
        ]
      : layoutMetrics.useMultiUnitFrame
        ? layoutMetrics.unitLayouts.map(resolveFrameRect)
        : [];
  const geometry = resolveCountdownSelectionGeometry({
    contentRects,
    frameRects,
    frameScale: layoutMetrics.frameScale,
    fallbackRect: {
      x: 0,
      y: 0,
      width: layoutMetrics.containerW,
      height: layoutMetrics.containerH,
    },
  });
  const effectiveBounds =
    Number(countdown?.countdownSchemaVersion || 1) >= 2
      ? geometry.selectionBounds
      : {
          x: 0,
          y: 0,
          width: layoutMetrics.containerW,
          height: layoutMetrics.containerH,
        };

  return {
    ...geometry,
    effectiveBounds,
    layoutMetrics,
    width: layoutMetrics.containerW,
    height: layoutMetrics.containerH,
    frameRects,
  };
}

export function resolveCountdownInsertGeometry(
  presetProps = {},
  { width: requestedWidth = null, height: requestedHeight = null } = {}
) {
  const naturalMetrics = resolveCountdownLayoutMetrics(presetProps);
  const defaultWidth = Math.max(
    180,
    Math.round(naturalMetrics.naturalContainerW)
  );
  const defaultHeight =
    naturalMetrics.distribution === "vertical"
      ? Math.max(120, Math.round(naturalMetrics.naturalContainerH))
      : naturalMetrics.distribution === "grid" ||
          naturalMetrics.distribution === "editorial"
        ? Math.max(110, Math.round(naturalMetrics.naturalContainerH))
        : Math.max(90, Math.round(naturalMetrics.naturalContainerH));
  const width = Math.max(
    naturalMetrics.naturalContainerW,
    toFinite(requestedWidth, defaultWidth)
  );
  const height = Math.max(
    naturalMetrics.naturalContainerH,
    toFinite(requestedHeight, defaultHeight)
  );
  const geometry = resolveCountdownEffectiveGeometry(presetProps, {
    width,
    height,
  });

  return {
    width: geometry.width,
    height: geometry.height,
    contentBounds: geometry.contentBounds,
    visualFrameBounds: geometry.visualFrameBounds,
    selectionBounds: geometry.selectionBounds,
  };
}
