import {
  buildCountdownEditorialWidths,
  estimateCountdownUnitHeight,
  normalizeVisibleUnits,
  resolveCountdownUnitWidth,
} from "../domain/countdownPresets/renderModel.js";
import {
  normalizeCountdownFrameScale,
  resolveContainedCountdownFrameRect,
  resolveCountdownFrameVisualBounds,
  resolveCountdownSelectionGeometry,
} from "../domain/countdownPresets/frameGeometry.js";
import {
  COUNTDOWN_PREVIEW_FIT_MODES,
  computeCountdownPreviewScale,
} from "./editor/countdown/countdownPreviewScale.js";

export const COUNTDOWN_SIDEBAR_PREVIEW_HEIGHT_LIMITS = Object.freeze({
  min: 88,
  max: 288,
});

export const COUNTDOWN_SIDEBAR_PREVIEW_ASPECT_LIMITS = Object.freeze({
  min: 0.85,
  max: 4,
});

const PREVIEW_MARGIN_FACTOR = 0.95;

function toFinite(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function resolveCountdownSidebarPreviewFrameDimensions({
  preset = {},
  loadedFrame = null,
} = {}) {
  const source = String(preset.frameSvgUrl || "").trim();
  const isPng =
    String(preset.frameAssetType || "").trim().toLowerCase() === "png";
  const metadataWidth = Math.max(
    0,
    toFinite(preset.frameIntrinsicWidth, 0)
  );
  const metadataHeight = Math.max(
    0,
    toFinite(preset.frameIntrinsicHeight, 0)
  );
  const loadedSource = String(loadedFrame?.source || "").trim();
  const loadedWidth = Math.max(0, toFinite(loadedFrame?.width, 0));
  const loadedHeight = Math.max(0, toFinite(loadedFrame?.height, 0));
  const hasLoadedDimensions =
    isPng &&
    source.length > 0 &&
    loadedSource === source &&
    loadedWidth > 0 &&
    loadedHeight > 0;
  const hasMetadataDimensions =
    metadataWidth > 0 && metadataHeight > 0;

  return {
    source,
    isPng,
    width: hasLoadedDimensions ? loadedWidth : metadataWidth,
    height: hasLoadedDimensions ? loadedHeight : metadataHeight,
    status:
      !isPng || !source
        ? "not-applicable"
        : hasLoadedDimensions
          ? "loaded"
          : hasMetadataDimensions
            ? "metadata"
            : "pending",
  };
}

function buildLegacyGeometry(preset = {}) {
  const itemCount = 4;
  const gap = Math.max(0, toFinite(preset.gap, 8));
  const paddingX = Math.max(2, toFinite(preset.paddingX, 8));
  const paddingY = Math.max(2, toFinite(preset.paddingY, 6));
  const valueSize = Math.max(10, toFinite(preset.fontSize, 15));
  const labelSize = Math.max(8, toFinite(preset.labelSize, 8));
  const showLabels = preset.showLabels !== false;
  const chipHeight = Math.max(
    44,
    paddingY * 2 + valueSize + (showLabels ? labelSize + 6 : 0)
  );
  const chipWidth = resolveCountdownUnitWidth({
    width: Math.max(36, toFinite(preset.chipWidth, 46) + paddingX * 2),
    height: chipHeight,
    boxRadius: Math.max(0, toFinite(preset.boxRadius, 12)),
  });
  const separatorWidth = String(preset.separator || "").trim()
    ? Math.max(12, Math.round(valueSize * 0.64))
    : 0;
  const width =
    itemCount * chipWidth +
    (itemCount - 1) * (gap + separatorWidth);

  return {
    fullBounds: {
      width: Math.max(1, width),
      height: Math.max(1, chipHeight),
    },
    visualBounds: {
      x: 0,
      y: 0,
      width: Math.max(1, width),
      height: Math.max(1, chipHeight),
    },
    visualCenterOffset: { x: 0, y: 0 },
  };
}

function buildV2Geometry(preset = {}) {
  const units = normalizeVisibleUnits(preset.visibleUnits);
  const itemCount = Math.max(1, units.length);
  const distribution = String(preset.distribution || "centered").toLowerCase();
  const layoutType = String(preset.layoutType || "singleFrame").toLowerCase();
  const frameUrl = String(preset.frameSvgUrl || "").trim();
  const hasFrame = frameUrl.length > 0;
  const useSingleFrame = layoutType === "singleframe" && hasFrame;
  const useMultiUnitFrame = layoutType === "multiunit" && hasFrame;
  const framePadding = Math.max(0, toFinite(preset.framePadding, 8));
  const frameScale = normalizeCountdownFrameScale(preset.frameScale);
  const gap = Math.max(0, toFinite(preset.gap, 8));
  const paddingX = Math.max(2, toFinite(preset.paddingX, 8));
  const paddingY = Math.max(2, toFinite(preset.paddingY, 6));
  const valueSize = Math.max(10, toFinite(preset.fontSize, 28));
  const labelSize = Math.max(8, toFinite(preset.labelSize, 12));
  const showLabels = preset.showLabels !== false;
  const chipRadius = Math.max(0, toFinite(preset.boxRadius, 10));
  const textDrivenChipHeight = Math.max(
    44,
    paddingY * 2 + valueSize + (showLabels ? labelSize + 6 : 0)
  );
  const layoutDrivenChipHeight = estimateCountdownUnitHeight({
    tamanoBase: toFinite(preset.tamanoBase, 320),
    distribution,
    unitsCount: itemCount,
  });
  const chipHeight = Math.max(
    textDrivenChipHeight,
    layoutDrivenChipHeight
  );
  const chipWidth = resolveCountdownUnitWidth({
    width: Math.max(36, toFinite(preset.chipWidth, 46) + paddingX * 2),
    height: chipHeight,
    boxRadius: chipRadius,
  });
  const columns =
    distribution === "vertical"
      ? 1
      : distribution === "grid"
        ? Math.min(2, itemCount)
        : itemCount;
  const rows =
    distribution === "vertical"
      ? itemCount
      : distribution === "grid"
        ? Math.ceil(itemCount / columns)
        : 1;
  const editorialWidths =
    distribution === "editorial"
      ? buildCountdownEditorialWidths({
          unitsCount: itemCount,
          baseChipWidth: chipWidth,
          chipHeight,
          boxRadius: chipRadius,
        })
      : [];
  const naturalWidth =
    distribution === "vertical"
      ? chipWidth
      : distribution === "grid"
        ? columns * chipWidth + gap * (columns - 1)
        : distribution === "editorial"
          ? editorialWidths.reduce((total, width) => total + width, 0) +
            gap * Math.max(0, itemCount - 1)
          : itemCount * chipWidth + gap * (itemCount - 1);
  const naturalHeight =
    distribution === "vertical" || distribution === "grid"
      ? rows * chipHeight + gap * Math.max(0, rows - 1)
      : chipHeight;
  const containerWidth = Math.max(
    1,
    naturalWidth + (useSingleFrame ? framePadding * 2 : 0)
  );
  const containerHeight = Math.max(
    1,
    naturalHeight + (useSingleFrame ? framePadding * 2 : 0)
  );
  const contentBounds = {
    x: useSingleFrame ? framePadding : 0,
    y: useSingleFrame ? framePadding : 0,
    width: Math.max(
      1,
      containerWidth - (useSingleFrame ? framePadding * 2 : 0)
    ),
    height: Math.max(
      1,
      containerHeight - (useSingleFrame ? framePadding * 2 : 0)
    ),
  };
  const distributionWidth =
    distribution === "grid"
      ? columns * chipWidth + gap * (columns - 1)
      : distribution === "vertical"
        ? chipWidth
        : naturalWidth;
  const distributionHeight =
    distribution === "vertical" || distribution === "grid"
      ? rows * chipHeight + gap * Math.max(0, rows - 1)
      : chipHeight;
  const startX =
    contentBounds.x + (contentBounds.width - distributionWidth) / 2;
  const startY =
    contentBounds.y + (contentBounds.height - distributionHeight) / 2;

  let cursorX = startX;
  const unitRects = units.map((_, index) => {
    if (distribution === "vertical") {
      return {
        x: contentBounds.x + (contentBounds.width - chipWidth) / 2,
        y: startY + index * (chipHeight + gap),
        width: chipWidth,
        height: chipHeight,
      };
    }
    if (distribution === "grid") {
      const row = Math.floor(index / columns);
      const column = index % columns;
      return {
        x: startX + column * (chipWidth + gap),
        y: startY + row * (chipHeight + gap),
        width: chipWidth,
        height: chipHeight,
      };
    }
    if (distribution === "editorial") {
      const width = editorialWidths[index] || chipWidth;
      const rect = {
        x: cursorX,
        y: startY,
        width,
        height: chipHeight,
      };
      cursorX += width + gap;
      return rect;
    }
    return {
      x: startX + index * (chipWidth + gap),
      y: startY,
      width: chipWidth,
      height: chipHeight,
    };
  });

  const fullBounds = resolveCountdownFrameVisualBounds({
    width: containerWidth,
    height: containerHeight,
    frameScale: hasFrame ? frameScale : 1,
  });
  const frameAssetType =
    String(preset.frameAssetType || "").toLowerCase() === "png"
      ? "png"
      : "svg";
  const sourceWidth = Math.max(0, toFinite(preset.frameIntrinsicWidth, 0));
  const sourceHeight = Math.max(0, toFinite(preset.frameIntrinsicHeight, 0));
  const containFrameRect = (rect) =>
    frameAssetType === "png"
      ? resolveContainedCountdownFrameRect({
          sourceWidth,
          sourceHeight,
          targetRect: rect,
        })
      : rect;
  const frameRects = !hasFrame
    ? []
    : useSingleFrame
      ? [
          containFrameRect({
            x: 0,
            y: 0,
            width: containerWidth,
            height: containerHeight,
          }),
        ]
      : useMultiUnitFrame
        ? unitRects.map(containFrameRect)
        : [];
  const selectionGeometry = resolveCountdownSelectionGeometry({
    contentRects: unitRects,
    frameRects,
    frameScale,
    fallbackRect: {
      x: 0,
      y: 0,
      width: containerWidth,
      height: containerHeight,
    },
  });
  const visualBounds = selectionGeometry.selectionBounds;
  const visualCenterX =
    fullBounds.offsetX + visualBounds.x + visualBounds.width / 2;
  const visualCenterY =
    fullBounds.offsetY + visualBounds.y + visualBounds.height / 2;

  return {
    fullBounds: {
      width: Math.max(1, fullBounds.width),
      height: Math.max(1, fullBounds.height),
    },
    visualBounds,
    visualCenterOffset: {
      x: visualCenterX - fullBounds.width / 2,
      y: visualCenterY - fullBounds.height / 2,
    },
  };
}

export function resolveCountdownSidebarPreviewLayout(preset = {}) {
  const geometry =
    Number(preset.countdownSchemaVersion) >= 2
      ? buildV2Geometry(preset)
      : buildLegacyGeometry(preset);
  const visualAspectRatio =
    geometry.visualBounds.width / geometry.visualBounds.height;
  const viewportAspectRatio = clamp(
    visualAspectRatio,
    COUNTDOWN_SIDEBAR_PREVIEW_ASPECT_LIMITS.min,
    COUNTDOWN_SIDEBAR_PREVIEW_ASPECT_LIMITS.max
  );

  return {
    ...geometry,
    visualAspectRatio,
    viewportAspectRatio,
  };
}

export function resolveCountdownSidebarPreviewHeight({
  availableWidth,
  layout,
} = {}) {
  const safeWidth = Math.max(1, toFinite(availableWidth, 1));
  const aspectRatio = Math.max(
    0.01,
    toFinite(layout?.viewportAspectRatio, 1)
  );
  return clamp(
    safeWidth / aspectRatio,
    COUNTDOWN_SIDEBAR_PREVIEW_HEIGHT_LIMITS.min,
    COUNTDOWN_SIDEBAR_PREVIEW_HEIGHT_LIMITS.max
  );
}

export function resolveCountdownSidebarPreviewTransform({
  viewportWidth,
  viewportHeight,
  layout,
} = {}) {
  const safeViewportWidth = Math.max(1, toFinite(viewportWidth, 1));
  const safeViewportHeight = Math.max(1, toFinite(viewportHeight, 1));
  const fullWidth = Math.max(1, toFinite(layout?.fullBounds?.width, 1));
  const fullHeight = Math.max(1, toFinite(layout?.fullBounds?.height, 1));
  const visualWidth = Math.max(
    1,
    toFinite(layout?.visualBounds?.width, fullWidth)
  );
  const visualHeight = Math.max(
    1,
    toFinite(layout?.visualBounds?.height, fullHeight)
  );
  const baseScale =
    computeCountdownPreviewScale({
      containerWidth: safeViewportWidth,
      containerHeight: safeViewportHeight,
      contentWidth: fullWidth,
      contentHeight: fullHeight,
      fitMode: COUNTDOWN_PREVIEW_FIT_MODES.CONTAIN,
    }) || 1;
  const fittedVisualScale =
    Math.min(
      safeViewportWidth / visualWidth,
      safeViewportHeight / visualHeight
    ) * PREVIEW_MARGIN_FACTOR;
  const zoom = Math.max(0.01, fittedVisualScale / baseScale);
  const centerOffsetX = toFinite(layout?.visualCenterOffset?.x, 0);
  const centerOffsetY = toFinite(layout?.visualCenterOffset?.y, 0);

  return {
    zoom,
    translateX: -centerOffsetX * fittedVisualScale,
    translateY: -centerOffsetY * fittedVisualScale,
    baseScale,
    fittedVisualScale,
    renderedVisualWidth: visualWidth * fittedVisualScale,
    renderedVisualHeight: visualHeight * fittedVisualScale,
  };
}
