export const ASSISTANT_GUIDED_TOUR_TARGET_ATTR = "data-assistant-tour-target";
export const ASSISTANT_GUIDED_TOUR_HYDRATION_ATTR =
  "data-assistant-tour-hydrated";
export const ASSISTANT_GUIDED_TOUR_CONTROLS_ATTR =
  "data-assistant-tour-controls";

export const ASSISTANT_GUIDED_TOUR_TARGETS = Object.freeze({
  EVENT_NAME: "assistant-tour-event-name",
  PERSON_NAMES: "assistant-tour-person-names",
  PERSON_PRIMARY: "assistant-tour-person-primary",
  PERSON_SECONDARY: "assistant-tour-person-secondary",
  ASSISTANT_CONTENT: "assistant-tour-content",
  ASSISTANT_NEXT: "assistant-tour-next",
  ASSISTANT_PREVIEW: "assistant-tour-preview",
});

export const ASSISTANT_GUIDED_TOUR_PHASES = Object.freeze({
  EVENT_NAME: "event-name",
  PERSON_NAMES: "person-names",
  PERSON_PRIMARY: "person-primary",
  PERSON_SECONDARY: "person-secondary",
  CONTENT: "content",
  NEXT: "next",
  PREVIEW: "preview",
  COMPLETE: "complete",
});

export const ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS = Object.freeze({
  RIGHT: "right",
  LEFT: "left",
  TOP: "top",
  BOTTOM: "bottom",
});

const DEFAULT_TOOLTIP_WIDTH_PX = 320;
const DEFAULT_TOOLTIP_HEIGHT_PX = 154;
const DEFAULT_VIEWPORT_MARGIN_PX = 12;
const DEFAULT_TARGET_GAP_PX = 14;
const MIN_COMPACT_TOOLTIP_WIDTH_PX = 192;
const MIN_COMPACT_TOOLTIP_HEIGHT_PX = 88;
const DEFAULT_PLACEMENT_PRIORITY = Object.freeze([
  ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
  ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
  ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
  ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
]);
const DEFAULT_NEXT_MESSAGE =
  "Cuando termines de completar esta sección, presioná Siguiente.";

function normalizeTourText(value) {
  return String(value ?? "").trim();
}

function toFiniteNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function clampNumber(value, min, max) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeRect(rect) {
  const left = toFiniteNumber(rect?.left);
  const top = toFiniteNumber(rect?.top);
  const width = Math.max(0, toFiniteNumber(rect?.width));
  const height = Math.max(0, toFiniteNumber(rect?.height));
  return {
    left,
    top,
    width,
    height,
    right: toFiniteNumber(rect?.right, left + width),
    bottom: toFiniteNumber(rect?.bottom, top + height),
  };
}

function normalizeViewportBounds(viewport = {}, margin = DEFAULT_VIEWPORT_MARGIN_PX) {
  const left = toFiniteNumber(viewport.left);
  const top = toFiniteNumber(viewport.top);
  const width = Math.max(0, toFiniteNumber(viewport.width));
  const height = Math.max(0, toFiniteNumber(viewport.height));
  const safeMargin = Math.max(0, toFiniteNumber(margin, DEFAULT_VIEWPORT_MARGIN_PX));
  return {
    left: left + safeMargin,
    top: top + safeMargin,
    right: left + width - safeMargin,
    bottom: top + height - safeMargin,
    width: Math.max(0, width - safeMargin * 2),
    height: Math.max(0, height - safeMargin * 2),
  };
}

function normalizeViewportBox(viewport = {}) {
  const left = toFiniteNumber(viewport.left);
  const top = toFiniteNumber(viewport.top);
  const width = Math.max(0, toFiniteNumber(viewport.width));
  const height = Math.max(0, toFiniteNumber(viewport.height));
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

function resolveArrowOffset(value, size) {
  const safeSize = Math.max(0, toFiniteNumber(size));
  if (safeSize <= 32) return safeSize / 2;
  return clampNumber(value, 16, safeSize - 16);
}

function createPositionCandidate({
  placement,
  targetRect,
  bounds,
  gap,
  width,
  height,
  maxHeight,
}) {
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  let left = targetCenterX - width / 2;
  let top = targetRect.bottom + gap;

  if (placement === ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT) {
    left = targetRect.right + gap;
    top = targetCenterY - height / 2;
  } else if (placement === ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT) {
    left = targetRect.left - gap - width;
    top = targetCenterY - height / 2;
  } else if (placement === ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP) {
    left = targetCenterX - width / 2;
    top = targetRect.top - gap - height;
  }

  left = clampNumber(left, bounds.left, bounds.right - width);
  top = clampNumber(top, bounds.top, bounds.bottom - height);

  const arrowOffset =
    placement === ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT ||
    placement === ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT
      ? resolveArrowOffset(targetCenterY - top, height)
      : resolveArrowOffset(targetCenterX - left, width);

  return {
    left,
    top,
    width,
    height,
    maxHeight,
    placement,
    arrowOffset,
    rect: {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    },
  };
}

function createAbsolutePositionCandidate({
  placement,
  targetRect,
  left,
  top,
  width,
  height,
  maxHeight,
}) {
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const arrowOffset =
    placement === ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT ||
    placement === ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT
      ? resolveArrowOffset(targetCenterY - top, height)
      : resolveArrowOffset(targetCenterX - left, width);

  return {
    left,
    top,
    width,
    height,
    maxHeight,
    placement,
    arrowOffset,
    rect: {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    },
  };
}

function getRectIntersection(firstRect, secondRect) {
  if (!firstRect || !secondRect) return null;
  const first = normalizeRect(firstRect);
  const second = normalizeRect(secondRect);
  const width = Math.max(
    0,
    Math.min(first.right, second.right) - Math.max(first.left, second.left)
  );
  const height = Math.max(
    0,
    Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top)
  );
  if (width <= 0 || height <= 0) return null;
  const left = Math.max(first.left, second.left);
  const top = Math.max(first.top, second.top);
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

function getRectOverlapArea(firstRect, secondRect) {
  const intersection = getRectIntersection(firstRect, secondRect);
  return intersection ? intersection.width * intersection.height : 0;
}

function normalizeAvoidRects(avoidRects = []) {
  if (!Array.isArray(avoidRects)) return [];
  return avoidRects
    .map((rect) => normalizeRect(rect))
    .filter((rect) => rect.width > 0 && rect.height > 0);
}

function getAvoidOverlapArea(rect, avoidRects = []) {
  return avoidRects.reduce(
    (total, avoidRect) => total + getRectOverlapArea(rect, avoidRect),
    0
  );
}

function createSpotlightCoreRect(spotlightRect) {
  const spotlight = normalizeRect(spotlightRect);
  const edgeBandHeight = spotlight.height / 3;
  const top = spotlight.top + edgeBandHeight;
  const bottom = spotlight.bottom - edgeBandHeight;
  return {
    left: spotlight.left,
    top,
    width: spotlight.width,
    height: Math.max(0, bottom - top),
    right: spotlight.right,
    bottom,
  };
}

function createSpotlightTopBandRect(spotlightRect) {
  const spotlight = normalizeRect(spotlightRect);
  const core = createSpotlightCoreRect(spotlight);
  return {
    left: spotlight.left,
    top: spotlight.top,
    width: spotlight.width,
    height: Math.max(0, core.top - spotlight.top),
    right: spotlight.right,
    bottom: core.top,
  };
}

function createSpotlightBottomBandRect(spotlightRect) {
  const spotlight = normalizeRect(spotlightRect);
  const core = createSpotlightCoreRect(spotlight);
  return {
    left: spotlight.left,
    top: core.bottom,
    width: spotlight.width,
    height: Math.max(0, spotlight.bottom - core.bottom),
    right: spotlight.right,
    bottom: spotlight.bottom,
  };
}

function getSpotlightOverlapMetrics(rect, spotlightAvoidRects = []) {
  if (!rect || spotlightAvoidRects.length <= 0) {
    return {
      spotlightOverlapArea: 0,
      spotlightCoreOverlapArea: 0,
      spotlightPenetrationDepth: 0,
      spotlightEdgeDistance: 0,
      spotlightEdge: "outside",
    };
  }

  const safeRect = normalizeRect(rect);
  let spotlightOverlapArea = 0;
  let spotlightCoreOverlapArea = 0;
  let topBandOverlapArea = 0;
  let bottomBandOverlapArea = 0;
  let centerOnlyOverlapArea = 0;
  let spotlightPenetrationDepth = 0;
  let spotlightEdgeDistance = Number.POSITIVE_INFINITY;

  spotlightAvoidRects.forEach((spotlightRect) => {
    const spotlight = normalizeRect(spotlightRect);
    const intersection = getRectIntersection(safeRect, spotlight);
    if (!intersection) return;

    const coreRect = createSpotlightCoreRect(spotlight);
    const topBandRect = createSpotlightTopBandRect(spotlight);
    const bottomBandRect = createSpotlightBottomBandRect(spotlight);
    const overlapArea = intersection.width * intersection.height;
    const coreOverlapArea = getRectOverlapArea(safeRect, coreRect);
    const topOverlapArea = getRectOverlapArea(safeRect, topBandRect);
    const bottomOverlapArea = getRectOverlapArea(safeRect, bottomBandRect);
    const centerY = safeRect.top + safeRect.height / 2;
    const spotlightCenterY = spotlight.top + spotlight.height / 2;
    const overlapStartsAtTopEdge = intersection.top <= spotlight.top;
    const overlapEndsAtBottomEdge = intersection.bottom >= spotlight.bottom;
    const topPenetration = Math.max(0, intersection.bottom - spotlight.top);
    const bottomPenetration = Math.max(0, spotlight.bottom - intersection.top);
    const centralPenetration = Math.min(topPenetration, bottomPenetration);
    const penetrationDepth =
      overlapStartsAtTopEdge || centerY < spotlightCenterY
        ? topPenetration
        : overlapEndsAtBottomEdge || centerY > spotlightCenterY
          ? bottomPenetration
          : centralPenetration;
    const verticalEdgeDistance = Math.min(
      Math.abs(safeRect.top - spotlight.top),
      Math.abs(safeRect.bottom - spotlight.bottom)
    );

    spotlightOverlapArea += overlapArea;
    spotlightCoreOverlapArea += coreOverlapArea;
    topBandOverlapArea += topOverlapArea;
    bottomBandOverlapArea += bottomOverlapArea;
    if (
      coreOverlapArea > 0 &&
      topOverlapArea <= 0 &&
      bottomOverlapArea <= 0 &&
      overlapStartsAtTopEdge !== true &&
      overlapEndsAtBottomEdge !== true
    ) {
      centerOnlyOverlapArea += coreOverlapArea;
    }
    spotlightPenetrationDepth = Math.max(
      spotlightPenetrationDepth,
      penetrationDepth
    );
    spotlightEdgeDistance = Math.min(
      spotlightEdgeDistance,
      verticalEdgeDistance
    );
  });

  let spotlightEdge = "outside";
  if (spotlightOverlapArea > 0) {
    if (
      centerOnlyOverlapArea > 0 ||
      (topBandOverlapArea <= 0 && bottomBandOverlapArea <= 0)
    ) {
      spotlightEdge = "center-fallback";
    } else if (topBandOverlapArea >= bottomBandOverlapArea) {
      spotlightEdge = "top-edge";
    } else {
      spotlightEdge = "bottom-edge";
    }
  }

  return {
    spotlightOverlapArea,
    spotlightCoreOverlapArea,
    spotlightPenetrationDepth,
    spotlightEdgeDistance: Number.isFinite(spotlightEdgeDistance)
      ? spotlightEdgeDistance
      : 0,
    spotlightEdge,
  };
}

function getSpotlightEdgeRank(spotlightEdge) {
  if (spotlightEdge === "outside") return 0;
  if (spotlightEdge === "top-edge" || spotlightEdge === "bottom-edge") return 1;
  return 2;
}

function compareReadabilitySpotlightCandidates({
  currentCandidate,
  nextCandidate,
  preferredPlacement = "",
  areaTolerance = 0,
  depthTolerance = 0,
} = {}) {
  if (!currentCandidate) return nextCandidate;
  if (!nextCandidate) return currentCandidate;

  const currentMetrics = currentCandidate.spotlightMetrics || {};
  const nextMetrics = nextCandidate.spotlightMetrics || {};
  const currentEdgeRank = getSpotlightEdgeRank(currentMetrics.spotlightEdge);
  const nextEdgeRank = getSpotlightEdgeRank(nextMetrics.spotlightEdge);
  if (nextEdgeRank < currentEdgeRank) return nextCandidate;
  if (nextEdgeRank > currentEdgeRank) return currentCandidate;

  const coreDifference =
    nextMetrics.spotlightCoreOverlapArea -
    currentMetrics.spotlightCoreOverlapArea;
  if (Math.abs(coreDifference) > areaTolerance) {
    return coreDifference < 0 ? nextCandidate : currentCandidate;
  }

  const depthDifference =
    nextMetrics.spotlightPenetrationDepth -
    currentMetrics.spotlightPenetrationDepth;
  if (Math.abs(depthDifference) > depthTolerance) {
    return depthDifference < 0 ? nextCandidate : currentCandidate;
  }

  const overlapDifference =
    nextMetrics.spotlightOverlapArea - currentMetrics.spotlightOverlapArea;
  if (Math.abs(overlapDifference) > areaTolerance) {
    return overlapDifference < 0 ? nextCandidate : currentCandidate;
  }

  const safePreferredPlacement = normalizeTourText(preferredPlacement);
  const currentIsPreferred =
    normalizeTourText(currentCandidate.candidate?.placement) ===
    safePreferredPlacement;
  const nextIsPreferred =
    normalizeTourText(nextCandidate.candidate?.placement) ===
    safePreferredPlacement;
  if (nextIsPreferred && !currentIsPreferred) return nextCandidate;
  if (currentIsPreferred && !nextIsPreferred) return currentCandidate;

  const edgeDistanceDifference =
    nextMetrics.spotlightEdgeDistance - currentMetrics.spotlightEdgeDistance;
  if (Math.abs(edgeDistanceDifference) > depthTolerance) {
    return edgeDistanceDifference < 0 ? nextCandidate : currentCandidate;
  }

  return nextCandidate.index < currentCandidate.index
    ? nextCandidate
    : currentCandidate;
}

function getCandidateAvoidanceScore({
  candidate,
  avoidRects = [],
  minWidth,
  minHeight,
  targetRect,
  allowTargetOverlap = false,
} = {}) {
  if (!candidate?.rect) return Number.POSITIVE_INFINITY;
  const undersizedPenalty =
    candidate.width < minWidth || candidate.height < minHeight ? 1_000_000 : 0;
  const targetOverlapPenalty =
    allowTargetOverlap ? 0 : getRectOverlapArea(candidate.rect, targetRect) * 1_000;
  return (
    undersizedPenalty +
    targetOverlapPenalty +
    getAvoidOverlapArea(candidate.rect, avoidRects)
  );
}

function pushUniqueFiniteNumber(values, value, tolerance = 0.5) {
  const numericValue = toFiniteNumber(value, Number.NaN);
  if (!Number.isFinite(numericValue)) return;
  if (
    values.some(
      (existingValue) => Math.abs(existingValue - numericValue) <= tolerance
    )
  ) {
    return;
  }
  values.push(numericValue);
}

function doRectsOverlapHorizontally(firstRect, secondRect) {
  if (!firstRect || !secondRect) return false;
  const first = normalizeRect(firstRect);
  const second = normalizeRect(secondRect);
  return first.left < second.right && first.right > second.left;
}

function resolveVerticalFreeIntervalsForWidth({
  left,
  width,
  bounds,
  avoidRects = [],
}) {
  const probeRect = {
    left,
    top: bounds.top,
    width,
    height: bounds.height,
    right: left + width,
    bottom: bounds.bottom,
  };
  let intervals = [{ top: bounds.top, bottom: bounds.bottom }];

  avoidRects.forEach((avoidRect) => {
    if (!doRectsOverlapHorizontally(probeRect, avoidRect)) return;
    const blockedTop = clampNumber(avoidRect.top, bounds.top, bounds.bottom);
    const blockedBottom = clampNumber(avoidRect.bottom, bounds.top, bounds.bottom);
    if (blockedBottom <= blockedTop) return;

    intervals = intervals.flatMap((interval) => {
      if (blockedBottom <= interval.top || blockedTop >= interval.bottom) {
        return [interval];
      }

      const nextIntervals = [];
      if (blockedTop > interval.top) {
        nextIntervals.push({ top: interval.top, bottom: blockedTop });
      }
      if (blockedBottom < interval.bottom) {
        nextIntervals.push({ top: blockedBottom, bottom: interval.bottom });
      }
      return nextIntervals;
    });
  });

  return intervals
    .map((interval) => ({
      ...interval,
      height: Math.max(0, interval.bottom - interval.top),
    }))
    .filter((interval) => interval.height > 0);
}

function createHardAvoidFreeSpaceCandidates({
  targetRect,
  bounds,
  gap,
  baseWidth,
  baseHeight,
  baseMaxHeight,
  minWidth,
  minHeight,
  hardAvoidRects = [],
  placements = [],
  preferredPlacement = "",
} = {}) {
  const width = Math.max(1, Math.min(baseWidth, bounds.width));
  if (width < minWidth || bounds.height < minHeight) return [];

  const safePlacements =
    Array.isArray(placements) && placements.length > 0
      ? placements
      : DEFAULT_PLACEMENT_PRIORITY;
  const verticalPlacement = safePlacements.includes(
    ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP
  )
    ? ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP
    : safePlacements[0];
  const safePreferredPlacement = normalizeTourText(preferredPlacement);
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const xValues = [];
  const minLeft = bounds.left;
  const maxLeft = Math.max(bounds.left, bounds.right - width);
  const addClampedX = (value) => {
    pushUniqueFiniteNumber(xValues, clampNumber(value, minLeft, maxLeft));
  };

  addClampedX(targetCenterX - width / 2);
  addClampedX(bounds.left);
  addClampedX(bounds.right - width);
  addClampedX(bounds.left + (bounds.width - width) / 2);
  hardAvoidRects.forEach((avoidRect) => {
    addClampedX(avoidRect.left - width);
    addClampedX(avoidRect.right);
    addClampedX(avoidRect.left - gap - width);
    addClampedX(avoidRect.right + gap);
    addClampedX(avoidRect.left);
    addClampedX(avoidRect.right - width);
  });

  const candidates = [];
  let index = 0;
  xValues.forEach((left) => {
    const freeIntervals = resolveVerticalFreeIntervalsForWidth({
      left,
      width,
      bounds,
      avoidRects: hardAvoidRects,
    });

    freeIntervals.forEach((interval) => {
      if (interval.height < minHeight) return;
      const height = Math.min(baseHeight, interval.height);
      const maxTop = interval.bottom - height;
      const yValues = [];
      pushUniqueFiniteNumber(yValues, interval.top);
      pushUniqueFiniteNumber(yValues, maxTop);
      pushUniqueFiniteNumber(
        yValues,
        interval.top + (interval.height - height) / 2
      );

      yValues.forEach((top) => {
        const safeTop = clampNumber(top, interval.top, maxTop);
        const placement =
          safeTop + height <= targetRect.top
            ? ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP
            : safeTop >= targetRect.bottom
              ? ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM
              : verticalPlacement;
        const maxHeight =
          height < baseHeight || baseMaxHeight !== undefined
            ? Math.min(height, baseMaxHeight || height)
            : undefined;
        const candidate = createAbsolutePositionCandidate({
          placement,
          targetRect,
          left,
          top: safeTop,
          width,
          height,
          maxHeight,
        });
        const hardAvoidOverlapArea = getAvoidOverlapArea(
          candidate.rect,
          hardAvoidRects
        );
        const targetOverlapArea = getRectOverlapArea(candidate.rect, targetRect);
        if (hardAvoidOverlapArea > 0 || targetOverlapArea > 0) return;

        const heightDeficit = Math.max(0, baseHeight - height);
        const topDistance = Math.max(0, candidate.top - bounds.top);
        const horizontalDistance = Math.abs(
          candidate.left + candidate.width / 2 - targetCenterX
        );
        const preferredPlacementBonus =
          normalizeTourText(candidate.placement) === safePreferredPlacement
            ? -0.25
            : 0;
        const score =
          heightDeficit * 100_000 +
          topDistance * 10 +
          horizontalDistance +
          preferredPlacementBonus +
          index / 100;
        candidates.push({
          candidate: {
            ...candidate,
            hardAvoidScore: score,
          },
          score,
          interval,
          index,
        });
        index += 1;
      });
    });
  });

  return candidates;
}

function hasFullPlacementSpace({
  placement,
  targetRect,
  bounds,
  gap,
  width,
  height,
}) {
  if (placement === ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT) {
    return targetRect.right + gap + width <= bounds.right;
  }
  if (placement === ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT) {
    return targetRect.left - gap - width >= bounds.left;
  }
  if (placement === ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP) {
    return targetRect.top - gap - height >= bounds.top;
  }
  return targetRect.bottom + gap + height <= bounds.bottom;
}

function getPlacementAvailableSpace({ placement, targetRect, bounds, gap }) {
  if (placement === ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT) {
    return Math.max(0, bounds.right - targetRect.right - gap);
  }
  if (placement === ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT) {
    return Math.max(0, targetRect.left - bounds.left - gap);
  }
  if (placement === ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP) {
    return Math.max(0, targetRect.top - bounds.top - gap);
  }
  return Math.max(0, bounds.bottom - targetRect.bottom - gap);
}

function isHorizontalTooltipPlacement(placement) {
  return (
    placement === ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT ||
    placement === ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT
  );
}

function createConstrainedPositionCandidate({
  placement,
  targetRect,
  bounds,
  gap,
  baseWidth,
  baseHeight,
  baseMaxHeight,
  minWidth,
  minHeight,
}) {
  if (
    hasFullPlacementSpace({
      placement,
      targetRect,
      bounds,
      gap,
      width: baseWidth,
      height: baseHeight,
    })
  ) {
    return createPositionCandidate({
      placement,
      targetRect,
      bounds,
      gap,
      width: baseWidth,
      height: baseHeight,
      maxHeight: baseMaxHeight,
    });
  }

  const availableSpace = getPlacementAvailableSpace({
    placement,
    targetRect,
    bounds,
    gap,
  });

  if (isHorizontalTooltipPlacement(placement)) {
    if (availableSpace < minWidth) return null;
    return createPositionCandidate({
      placement,
      targetRect,
      bounds,
      gap,
      width: Math.min(baseWidth, availableSpace),
      height: baseHeight,
      maxHeight: baseMaxHeight,
    });
  }

  if (availableSpace < minHeight) return null;
  const height = Math.min(baseHeight, availableSpace);
  return createPositionCandidate({
    placement,
    targetRect,
    bounds,
    gap,
    width: baseWidth,
    height,
    maxHeight: availableSpace,
  });
}

function isPositionCandidateSafe({
  candidate,
  avoidRects = [],
  minWidth,
  minHeight,
  targetRect,
  allowTargetOverlap = false,
} = {}) {
  if (!candidate?.rect) return false;
  if (candidate.width < minWidth || candidate.height < minHeight) return false;
  if (
    allowTargetOverlap !== true &&
    getRectOverlapArea(candidate.rect, targetRect) > 0
  ) {
    return false;
  }
  return getAvoidOverlapArea(candidate.rect, avoidRects) <= 0;
}

function getPositionCandidateDiagnostics({
  candidate,
  avoidRects = [],
  spotlightAvoidRects = [],
  minWidth,
  minHeight,
  targetRect,
  allowTargetOverlap = false,
} = {}) {
  if (!candidate?.rect) {
    return {
      safe: false,
      reason: "no-candidate",
      targetOverlapArea: 0,
      avoidOverlapArea: 0,
      spotlightOverlapArea: 0,
      spotlightCoreOverlapArea: 0,
      spotlightPenetrationDepth: 0,
      spotlightEdgeDistance: 0,
      spotlightEdge: "outside",
      overlapsSpotlight: false,
      undersized: false,
    };
  }
  const undersized = candidate.width < minWidth || candidate.height < minHeight;
  const targetOverlapArea = getRectOverlapArea(candidate.rect, targetRect);
  const avoidOverlapArea = getAvoidOverlapArea(candidate.rect, avoidRects);
  const spotlightMetrics = getSpotlightOverlapMetrics(
    candidate.rect,
    spotlightAvoidRects
  );
  const {
    spotlightOverlapArea,
    spotlightCoreOverlapArea,
    spotlightPenetrationDepth,
    spotlightEdgeDistance,
    spotlightEdge,
  } = spotlightMetrics;
  let reason = "accepted";
  if (undersized) reason = "below-min-size";
  else if (allowTargetOverlap !== true && targetOverlapArea > 0) {
    reason = "target-overlap";
  }
  else if (avoidOverlapArea > 0) reason = "avoid-rect-overlap";
  return {
    safe: reason === "accepted",
    reason,
    targetOverlapArea,
    avoidOverlapArea,
    spotlightOverlapArea,
    spotlightCoreOverlapArea,
    spotlightPenetrationDepth,
    spotlightEdgeDistance,
    spotlightEdge,
    overlapsSpotlight: spotlightOverlapArea > 0,
    undersized,
  };
}

function addPositionCandidateMetadata({
  candidate,
  reason,
  constraintMode,
  hardAvoidRects = [],
  spotlightAvoidRects = [],
  targetRect,
} = {}) {
  if (!candidate) return null;
  const spotlightMetrics = getSpotlightOverlapMetrics(
    candidate.rect,
    spotlightAvoidRects
  );
  const {
    spotlightOverlapArea,
    spotlightCoreOverlapArea,
    spotlightPenetrationDepth,
    spotlightEdgeDistance,
    spotlightEdge,
  } = spotlightMetrics;
  const hardAvoidOverlapArea = getAvoidOverlapArea(candidate.rect, hardAvoidRects);
  return {
    ...candidate,
    reason,
    constraintMode,
    hardAvoidOverlapArea,
    avoidOverlapArea: hardAvoidOverlapArea,
    targetOverlapArea: getRectOverlapArea(candidate.rect, targetRect),
    spotlightOverlapArea,
    spotlightCoreOverlapArea,
    spotlightPenetrationDepth,
    spotlightEdgeDistance,
    spotlightEdge,
    overlapsSpotlight: spotlightOverlapArea > 0,
  };
}

export function doAssistantGuidedTourRectsOverlap(firstRect, secondRect) {
  if (!firstRect || !secondRect) return false;
  const first = normalizeRect(firstRect);
  const second = normalizeRect(secondRect);
  return (
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top
  );
}

export function resolveAssistantGuidedTourOverlayRect({
  rect,
  visualViewport,
} = {}) {
  const safeRect = normalizeRect(rect);
  const offsetLeft = toFiniteNumber(visualViewport?.offsetLeft);
  const offsetTop = toFiniteNumber(visualViewport?.offsetTop);
  return {
    left: safeRect.left + offsetLeft,
    top: safeRect.top + offsetTop,
    width: safeRect.width,
    height: safeRect.height,
    right: safeRect.right + offsetLeft,
    bottom: safeRect.bottom + offsetTop,
  };
}

export function resolveAssistantGuidedTourUsableViewport({
  viewport,
  bottomObstructionRects = [],
  gap = 0,
} = {}) {
  const safeViewport = normalizeViewportBox(viewport);
  const safeGap = Math.max(0, toFiniteNumber(gap));
  const bottomRects = normalizeAvoidRects(bottomObstructionRects);
  const safeBottom = bottomRects.reduce((currentBottom, rect) => {
    const overlapsViewportX =
      rect.left < safeViewport.right && rect.right > safeViewport.left;
    const intersectsViewportY =
      rect.bottom > safeViewport.top && rect.top < safeViewport.bottom;
    const startsBelowViewportTop = rect.top > safeViewport.top;
    if (!overlapsViewportX || !intersectsViewportY || !startsBelowViewportTop) {
      return currentBottom;
    }
    return Math.min(currentBottom, rect.top - safeGap);
  }, safeViewport.bottom);

  return {
    left: safeViewport.left,
    top: safeViewport.top,
    width: safeViewport.width,
    height: Math.max(0, safeBottom - safeViewport.top),
  };
}

export function isAssistantGuidedTourTextValid(value) {
  return normalizeTourText(value).length > 0;
}

export function areAssistantGuidedTourPersonNamesComplete({
  primaryName,
  secondaryName,
} = {}) {
  return (
    isAssistantGuidedTourTextValid(primaryName) &&
    isAssistantGuidedTourTextValid(secondaryName)
  );
}

export function resolveNextAssistantGuidedTourFieldPhase(phase) {
  if (phase === ASSISTANT_GUIDED_TOUR_PHASES.EVENT_NAME) {
    return ASSISTANT_GUIDED_TOUR_PHASES.PERSON_PRIMARY;
  }
  if (phase === ASSISTANT_GUIDED_TOUR_PHASES.PERSON_PRIMARY) {
    return ASSISTANT_GUIDED_TOUR_PHASES.PERSON_SECONDARY;
  }
  if (phase === ASSISTANT_GUIDED_TOUR_PHASES.PERSON_SECONDARY) {
    return ASSISTANT_GUIDED_TOUR_PHASES.NEXT;
  }
  return phase;
}

export function areAssistantGuidedTourInitialFieldsHydrated({
  eventNameHydrated = false,
  primaryNameHydrated = false,
  secondaryNameHydrated = false,
} = {}) {
  return (
    eventNameHydrated === true &&
    primaryNameHydrated === true &&
    secondaryNameHydrated === true
  );
}

export function shouldAutoStartAssistantGuidedTour({
  draftKey,
  editorReady = false,
  assistantMounted = false,
  targetsReady = false,
  preferencesLoaded = false,
  assistantTourOptOut = false,
  editorReadOnly = false,
} = {}) {
  return (
    Boolean(normalizeTourText(draftKey)) &&
    editorReady === true &&
    assistantMounted === true &&
    targetsReady === true &&
    preferencesLoaded === true &&
    assistantTourOptOut !== true &&
    editorReadOnly !== true
  );
}

export function createAssistantGuidedTourSessionKey({
  draftKey,
  userUid = "",
} = {}) {
  const safeDraftKey = normalizeTourText(draftKey);
  if (!safeDraftKey) return "";
  const safeUserUid = normalizeTourText(userUid);
  return safeUserUid ? `${safeUserUid}:${safeDraftKey}` : safeDraftKey;
}

export function getAssistantGuidedTourPositionKey({
  currentStep,
  currentStepId,
  currentSubstep,
  currentSubstepId,
  currentStepIndex = 0,
  currentSubstepIndex = 0,
} = {}) {
  const stepId = normalizeTourText(currentStep?.id || currentStepId);
  const substepId = normalizeTourText(currentSubstep?.id || currentSubstepId);
  return [
    stepId || `step-${Number(currentStepIndex) || 0}`,
    substepId || `substep-${Number(currentSubstepIndex) || 0}`,
  ].join(":");
}

export function isAssistantGuidedTourFirstNamesSubstep({
  currentStep,
  currentSubstep,
} = {}) {
  return (
    normalizeTourText(currentStep?.id) === "detalles" &&
    normalizeTourText(currentSubstep?.scope || currentSubstep?.id) ===
      "event-names"
  );
}

export function resolveInitialAssistantGuidedTourPhase({
  currentStep,
  currentSubstep,
  isPreviewStep = false,
} = {}) {
  if (isPreviewStep === true) return ASSISTANT_GUIDED_TOUR_PHASES.PREVIEW;
  if (
    isAssistantGuidedTourFirstNamesSubstep({
      currentStep,
      currentSubstep,
    })
  ) {
    return ASSISTANT_GUIDED_TOUR_PHASES.EVENT_NAME;
  }
  return ASSISTANT_GUIDED_TOUR_PHASES.CONTENT;
}

export function resolveAssistantGuidedTourTargetId({
  phase,
  isPreviewStep = false,
} = {}) {
  if (isPreviewStep === true || phase === ASSISTANT_GUIDED_TOUR_PHASES.PREVIEW) {
    return ASSISTANT_GUIDED_TOUR_TARGETS.ASSISTANT_PREVIEW;
  }

  switch (phase) {
    case ASSISTANT_GUIDED_TOUR_PHASES.EVENT_NAME:
      return ASSISTANT_GUIDED_TOUR_TARGETS.EVENT_NAME;
    case ASSISTANT_GUIDED_TOUR_PHASES.PERSON_PRIMARY:
      return ASSISTANT_GUIDED_TOUR_TARGETS.PERSON_PRIMARY;
    case ASSISTANT_GUIDED_TOUR_PHASES.PERSON_SECONDARY:
      return ASSISTANT_GUIDED_TOUR_TARGETS.PERSON_SECONDARY;
    case ASSISTANT_GUIDED_TOUR_PHASES.PERSON_NAMES:
      return ASSISTANT_GUIDED_TOUR_TARGETS.PERSON_NAMES;
    case ASSISTANT_GUIDED_TOUR_PHASES.NEXT:
      return ASSISTANT_GUIDED_TOUR_TARGETS.ASSISTANT_NEXT;
    case ASSISTANT_GUIDED_TOUR_PHASES.CONTENT:
    default:
      return ASSISTANT_GUIDED_TOUR_TARGETS.ASSISTANT_CONTENT;
  }
}

export function getAssistantGuidedTourMessage({
  phase,
  currentStep,
  currentSubstep,
} = {}) {
  const stepLabel = normalizeTourText(currentStep?.label);
  const substepLabel = normalizeTourText(currentSubstep?.label);
  const currentLabel = substepLabel || stepLabel || "esta parte";

  switch (phase) {
    case ASSISTANT_GUIDED_TOUR_PHASES.EVENT_NAME:
      return "Completá acá el nombre del evento.";
    case ASSISTANT_GUIDED_TOUR_PHASES.PERSON_PRIMARY:
      return "Completá el nombre de la primera persona.";
    case ASSISTANT_GUIDED_TOUR_PHASES.PERSON_SECONDARY:
      return "Completá el nombre de la segunda persona.";
    case ASSISTANT_GUIDED_TOUR_PHASES.PERSON_NAMES:
      return "Completá los nombres de los protagonistas del evento.";
    case ASSISTANT_GUIDED_TOUR_PHASES.NEXT:
      return (
        normalizeTourText(currentSubstep?.tourNextMessage) ||
        normalizeTourText(currentStep?.tourNextMessage) ||
        DEFAULT_NEXT_MESSAGE
      );
    case ASSISTANT_GUIDED_TOUR_PHASES.PREVIEW:
      return "Abrí Vista previa para revisar cómo quedará la invitación.";
    case ASSISTANT_GUIDED_TOUR_PHASES.CONTENT:
    default:
      return `Completá ${currentLabel} desde el Asistente.`;
  }
}

export function shouldAdvanceEventNameTour({
  previousValue,
  nextValue,
  alreadyAdvanced = false,
} = {}) {
  return shouldAdvanceAssistantGuidedTourField({
    previousValue,
    nextValue,
    alreadyAdvanced,
  });
}

export function shouldAdvanceAssistantGuidedTourField({
  previousValue,
  nextValue,
  alreadyAdvanced = false,
} = {}) {
  if (alreadyAdvanced === true) return false;
  return (
    !isAssistantGuidedTourTextValid(previousValue) &&
    isAssistantGuidedTourTextValid(nextValue)
  );
}

export function shouldAdvancePersonNamesTour({
  primaryName,
  secondaryName,
  alreadyAdvanced = false,
} = {}) {
  if (alreadyAdvanced === true) return false;
  return areAssistantGuidedTourPersonNamesComplete({
    primaryName,
    secondaryName,
  });
}

export function shouldAdvanceAssistantGuidedTourFieldEditSignal({
  expectedTargetId = "",
  signalTargetId = "",
  signalValue = "",
  alreadyAdvanced = false,
} = {}) {
  if (alreadyAdvanced === true) return false;
  if (!normalizeTourText(expectedTargetId)) return false;
  if (normalizeTourText(signalTargetId) !== normalizeTourText(expectedTargetId)) {
    return false;
  }
  return isAssistantGuidedTourTextValid(signalValue);
}

export function resolveAssistantGuidedTourTooltipPosition({
  targetRect,
  tooltipSize,
  viewport,
  margin = DEFAULT_VIEWPORT_MARGIN_PX,
  gap = DEFAULT_TARGET_GAP_PX,
  placementPriority = DEFAULT_PLACEMENT_PRIORITY,
  preferredPlacement = "",
  avoidRects = [],
  spotlightAvoidRects = [],
  debugCandidates = null,
  minWidth = MIN_COMPACT_TOOLTIP_WIDTH_PX,
  minHeight = MIN_COMPACT_TOOLTIP_HEIGHT_PX,
  enforceHardAvoidRects = false,
} = {}) {
  const safeTargetRect = normalizeRect(targetRect);
  const bounds = normalizeViewportBounds(viewport, margin);
  const safeGap = Math.max(0, toFiniteNumber(gap, DEFAULT_TARGET_GAP_PX));
  const safeHardAvoidRects = normalizeAvoidRects(avoidRects);
  const safeSpotlightAvoidRects = normalizeAvoidRects(spotlightAvoidRects);
  const safeAvoidRects = normalizeAvoidRects([
    ...safeHardAvoidRects,
    ...safeSpotlightAvoidRects,
  ]);
  const safeMinWidth = Math.max(
    1,
    toFiniteNumber(minWidth, MIN_COMPACT_TOOLTIP_WIDTH_PX)
  );
  const safeMinHeight = Math.max(
    1,
    toFiniteNumber(minHeight, MIN_COMPACT_TOOLTIP_HEIGHT_PX)
  );
  const requestedHeight = Math.max(
    0,
    toFiniteNumber(tooltipSize?.height, DEFAULT_TOOLTIP_HEIGHT_PX)
  );
  const requestedWidth = Math.max(
    0,
    toFiniteNumber(tooltipSize?.width, DEFAULT_TOOLTIP_WIDTH_PX)
  );
  const baseWidth = Math.min(
    requestedWidth,
    bounds.width
  );
  const baseHeight = Math.min(requestedHeight, bounds.height);
  const baseMaxHeight = baseHeight < requestedHeight ? baseHeight : undefined;
  const minimumRequestedWidth = Math.min(
    safeMinWidth,
    Math.max(1, requestedWidth || safeMinWidth)
  );
  const minimumRequestedHeight = Math.min(
    safeMinHeight,
    Math.max(1, requestedHeight || safeMinHeight)
  );
  const viewportSmallerThanMinimum =
    bounds.width < minimumRequestedWidth ||
    bounds.height < minimumRequestedHeight;
  const effectiveMinWidth = viewportSmallerThanMinimum
    ? Math.max(1, Math.min(bounds.width, minimumRequestedWidth))
    : minimumRequestedWidth;
  const effectiveMinHeight = viewportSmallerThanMinimum
    ? Math.max(1, Math.min(bounds.height, minimumRequestedHeight))
    : minimumRequestedHeight;
  const placements =
    Array.isArray(placementPriority) && placementPriority.length > 0
      ? placementPriority
      : DEFAULT_PLACEMENT_PRIORITY;
  const fallbackCandidates = [];
  const safePreferredPlacement = normalizeTourText(preferredPlacement);
  const debugCandidateRecords = [];
  const recordDebugCandidate = ({
    stage,
    placement,
    candidate = null,
    result = "evaluated",
    reason = "",
    availableSpace = null,
    score = null,
    constraintMode = "strict",
    hardAvoidRects = safeAvoidRects,
    spotlightRects = safeSpotlightAvoidRects,
    allowTargetOverlap = false,
  } = {}) => {
    if (typeof debugCandidates !== "function") return;
    const diagnostics = getPositionCandidateDiagnostics({
      candidate,
      avoidRects: hardAvoidRects,
      spotlightAvoidRects: spotlightRects,
      minWidth: effectiveMinWidth,
      minHeight: effectiveMinHeight,
      targetRect: safeTargetRect,
      allowTargetOverlap,
    });
    debugCandidateRecords.push({
      stage,
      placement,
      result,
      reason: reason || diagnostics.reason,
      constraintMode,
      availableSpace,
      score,
      rect: candidate?.rect || null,
      width: candidate?.width ?? null,
      height: candidate?.height ?? null,
      maxHeight: candidate?.maxHeight,
      diagnostics,
    });
  };
  const flushDebugCandidates = (chosenCandidate, reason) => {
    if (typeof debugCandidates !== "function") return;
    try {
      debugCandidates({
        reason,
        constraintMode: chosenCandidate?.constraintMode || "strict",
        chosenPlacement: chosenCandidate?.placement || "",
        chosenRect: chosenCandidate?.rect || null,
        chosenCandidate,
        candidates: debugCandidateRecords,
      });
    } catch {
      // Debug callbacks must never affect production positioning.
    }
  };
  const finishCandidate = (
    candidate,
    reason,
    constraintMode = "strict",
    hardAvoidRects = safeHardAvoidRects
  ) =>
    addPositionCandidateMetadata({
      candidate,
      reason,
      constraintMode,
      hardAvoidRects,
      spotlightAvoidRects: safeSpotlightAvoidRects,
      targetRect: safeTargetRect,
    });

  if (placements.includes(safePreferredPlacement)) {
    const preferredCandidate = createConstrainedPositionCandidate({
      placement: safePreferredPlacement,
      targetRect: safeTargetRect,
      bounds,
      gap: safeGap,
      baseWidth,
      baseHeight,
      baseMaxHeight,
      minWidth: effectiveMinWidth,
      minHeight: effectiveMinHeight,
    });
    const preferredSafe = isPositionCandidateSafe({
      candidate: preferredCandidate,
      avoidRects: safeAvoidRects,
      minWidth: effectiveMinWidth,
      minHeight: effectiveMinHeight,
      targetRect: safeTargetRect,
    });
    recordDebugCandidate({
      stage: "preferred",
      placement: safePreferredPlacement,
      candidate: preferredCandidate,
      result: preferredSafe ? "accepted" : "discarded",
    });
    if (
      preferredSafe
    ) {
      const finishedCandidate = finishCandidate(
        preferredCandidate,
        "preferred",
        "strict",
        safeAvoidRects
      );
      flushDebugCandidates(finishedCandidate, "preferred");
      return finishedCandidate;
    }
  }

  for (const placement of placements) {
    if (
      hasFullPlacementSpace({
        placement,
        targetRect: safeTargetRect,
        bounds,
        gap: safeGap,
        width: baseWidth,
        height: baseHeight,
      })
    ) {
      const candidate = createPositionCandidate({
        placement,
        targetRect: safeTargetRect,
        bounds,
        gap: safeGap,
        width: baseWidth,
        height: baseHeight,
        maxHeight: baseMaxHeight,
      });
      const avoidOverlapArea = getAvoidOverlapArea(candidate.rect, safeAvoidRects);
      recordDebugCandidate({
        stage: "full",
        placement,
        candidate,
        result: avoidOverlapArea <= 0 ? "accepted" : "fallback",
        reason: avoidOverlapArea <= 0 ? "accepted" : "avoid-rect-overlap",
      });
      if (avoidOverlapArea <= 0) {
        const finishedCandidate = finishCandidate(
          candidate,
          "preferred",
          "strict",
          safeAvoidRects
        );
        flushDebugCandidates(finishedCandidate, "preferred");
        return finishedCandidate;
      }
      fallbackCandidates.push(candidate);
    } else {
      recordDebugCandidate({
        stage: "full",
        placement,
        result: "discarded",
        reason: "insufficient-full-space",
        availableSpace: getPlacementAvailableSpace({
          placement,
          targetRect: safeTargetRect,
          bounds,
          gap: safeGap,
        }),
      });
    }
  }

  for (const placement of placements) {
    const availableSpace = getPlacementAvailableSpace({
      placement,
      targetRect: safeTargetRect,
      bounds,
      gap: safeGap,
    });
    const isHorizontal = isHorizontalTooltipPlacement(placement);
    if (isHorizontal && availableSpace >= effectiveMinWidth) {
      const candidate = createPositionCandidate({
        placement,
        targetRect: safeTargetRect,
        bounds,
        gap: safeGap,
        width: Math.min(baseWidth, availableSpace),
        height: baseHeight,
        maxHeight: baseMaxHeight,
      });
      const avoidOverlapArea = getAvoidOverlapArea(candidate.rect, safeAvoidRects);
      recordDebugCandidate({
        stage: "constrained",
        placement,
        candidate,
        result: avoidOverlapArea <= 0 ? "accepted" : "fallback",
        reason: avoidOverlapArea <= 0 ? "accepted" : "avoid-rect-overlap",
        availableSpace,
      });
      if (avoidOverlapArea <= 0) {
        const finishedCandidate = finishCandidate(
          candidate,
          "constrained",
          "strict",
          safeAvoidRects
        );
        flushDebugCandidates(finishedCandidate, "constrained");
        return finishedCandidate;
      }
      fallbackCandidates.push(candidate);
    } else if (isHorizontal) {
      recordDebugCandidate({
        stage: "constrained",
        placement,
        result: "discarded",
        reason: "below-min-width",
        availableSpace,
      });
    }
    if (!isHorizontal && availableSpace >= effectiveMinHeight) {
      const height = Math.min(baseHeight, availableSpace);
      const candidate = createPositionCandidate({
        placement,
        targetRect: safeTargetRect,
        bounds,
        gap: safeGap,
        width: baseWidth,
        height,
        maxHeight: availableSpace,
      });
      const avoidOverlapArea = getAvoidOverlapArea(candidate.rect, safeAvoidRects);
      recordDebugCandidate({
        stage: "constrained",
        placement,
        candidate,
        result: avoidOverlapArea <= 0 ? "accepted" : "fallback",
        reason: avoidOverlapArea <= 0 ? "accepted" : "avoid-rect-overlap",
        availableSpace,
      });
      if (avoidOverlapArea <= 0) {
        const finishedCandidate = finishCandidate(
          candidate,
          "constrained",
          "strict",
          safeAvoidRects
        );
        flushDebugCandidates(finishedCandidate, "constrained");
        return finishedCandidate;
      }
      fallbackCandidates.push(candidate);
    } else if (!isHorizontal) {
      recordDebugCandidate({
        stage: "constrained",
        placement,
        result: "discarded",
        reason: "below-min-height",
        availableSpace,
      });
    }
  }

  if (safeSpotlightAvoidRects.length > 0 && viewportSmallerThanMinimum !== true) {
    const readabilityAreaTolerance = Math.max(
      16,
      baseWidth * baseHeight * 0.02
    );
    const readabilityDepthTolerance = 2;
    const readableCandidates = placements
      .map((placement, index) => {
        const candidate = createPositionCandidate({
          placement,
          targetRect: safeTargetRect,
          bounds,
          gap: safeGap,
          width: baseWidth,
          height: baseHeight,
          maxHeight: baseMaxHeight,
        });
        const hardAvoidOverlapArea = getAvoidOverlapArea(
          candidate.rect,
          safeHardAvoidRects
        );
        const spotlightMetrics = getSpotlightOverlapMetrics(
          candidate.rect,
          safeSpotlightAvoidRects
        );
        const {
          spotlightOverlapArea,
          spotlightCoreOverlapArea,
          spotlightPenetrationDepth,
          spotlightEdgeDistance,
          spotlightEdge,
        } = spotlightMetrics;
        const undersized =
          candidate.width < effectiveMinWidth ||
          candidate.height < effectiveMinHeight;
        const rejected = undersized || hardAvoidOverlapArea > 0;
        const edgeRank = getSpotlightEdgeRank(spotlightEdge);
        const isPreferred =
          normalizeTourText(placement) === safePreferredPlacement;
        const score =
          hardAvoidOverlapArea * 1_000_000 +
          (undersized ? 1_000_000 : 0) +
          edgeRank * 1_000_000_000 +
          spotlightCoreOverlapArea * 10_000 +
          spotlightPenetrationDepth * 1_000 +
          spotlightOverlapArea +
          spotlightEdgeDistance +
          (isPreferred ? -0.25 : 0) +
          index / 100;

        recordDebugCandidate({
          stage: "readability-fallback",
          placement,
          candidate,
          result: rejected ? "discarded" : "scored",
          reason: rejected
            ? undersized
              ? "below-min-size"
              : "avoid-rect-overlap"
            : spotlightOverlapArea > 0
              ? "spotlight-overlap"
              : "accepted",
          score,
          constraintMode: "readability-over-spotlight",
          hardAvoidRects: safeHardAvoidRects,
          spotlightRects: safeSpotlightAvoidRects,
          allowTargetOverlap: true,
        });

        const scoredCandidate = {
          ...candidate,
          spotlightScore: score,
        };

        return rejected
          ? null
          : {
              candidate: scoredCandidate,
              score,
              spotlightMetrics,
              index,
            };
      })
      .filter(Boolean);

    if (readableCandidates.length > 0) {
      const bestReadableCandidate = readableCandidates.reduce(
        (bestCandidate, candidate) =>
          compareReadabilitySpotlightCandidates({
            currentCandidate: bestCandidate,
            nextCandidate: candidate,
            preferredPlacement: safePreferredPlacement,
            areaTolerance: readabilityAreaTolerance,
            depthTolerance: readabilityDepthTolerance,
          })
      ).candidate;
      const finishedCandidate = finishCandidate(
        bestReadableCandidate,
        "readability-over-spotlight",
        "readability-over-spotlight",
        safeHardAvoidRects
      );
      flushDebugCandidates(finishedCandidate, "readability-over-spotlight");
      return finishedCandidate;
    }
  }

  if (enforceHardAvoidRects === true && viewportSmallerThanMinimum !== true) {
    const hardAvoidFreeSpaceCandidates = createHardAvoidFreeSpaceCandidates({
      targetRect: safeTargetRect,
      bounds,
      gap: safeGap,
      baseWidth,
      baseHeight,
      baseMaxHeight,
      minWidth: effectiveMinWidth,
      minHeight: effectiveMinHeight,
      hardAvoidRects: safeHardAvoidRects,
      placements,
      preferredPlacement: safePreferredPlacement,
    });

    hardAvoidFreeSpaceCandidates.forEach(({ candidate, score, interval }) => {
      recordDebugCandidate({
        stage: "hard-avoid-free-space",
        placement: candidate.placement,
        candidate,
        result: "scored",
        reason:
          candidate.height < baseHeight || candidate.maxHeight !== undefined
            ? "constrained"
            : "accepted",
        availableSpace: interval.height,
        score,
        constraintMode: "hard-avoid-free-space",
        hardAvoidRects: safeHardAvoidRects,
        spotlightRects: [],
      });
    });

    if (hardAvoidFreeSpaceCandidates.length > 0) {
      const bestHardAvoidFreeSpaceCandidate = hardAvoidFreeSpaceCandidates.reduce(
        (bestCandidate, candidate) =>
          candidate.score < bestCandidate.score ? candidate : bestCandidate
      ).candidate;
      const reason =
        bestHardAvoidFreeSpaceCandidate.height < baseHeight ||
        bestHardAvoidFreeSpaceCandidate.maxHeight !== undefined
          ? "hard-avoid-constrained"
          : "hard-avoid-free-space";
      const finishedCandidate = finishCandidate(
        bestHardAvoidFreeSpaceCandidate,
        reason,
        "hard-avoid-free-space",
        safeHardAvoidRects
      );
      flushDebugCandidates(finishedCandidate, reason);
      return finishedCandidate;
    }

    recordDebugCandidate({
      stage: "hard-avoid-free-space",
      placement: "",
      result: "discarded",
      reason: "no-legible-free-space",
      constraintMode: "hard-avoid-free-space",
      hardAvoidRects: safeHardAvoidRects,
      spotlightRects: [],
    });
  }

  const placementSpaces = placements.map((placement, index) => ({
    placement,
    index,
    space: getPlacementAvailableSpace({
      placement,
      targetRect: safeTargetRect,
      bounds,
      gap: safeGap,
    }),
  }));

  const fallbackPlacement = placementSpaces.reduce(
    (bestPlacement, placementSpace) => {
      if (safeAvoidRects.length > 0) {
        const isHorizontal = isHorizontalTooltipPlacement(placementSpace.placement);
        const candidate = createPositionCandidate({
          placement: placementSpace.placement,
          targetRect: safeTargetRect,
          bounds,
          gap: safeGap,
          width: isHorizontal
            ? Math.max(1, Math.min(baseWidth, placementSpace.space || baseWidth))
            : baseWidth,
          height: isHorizontal
            ? baseHeight
            : Math.max(1, Math.min(baseHeight, placementSpace.space || baseHeight)),
          maxHeight: isHorizontal
            ? baseMaxHeight
            : Math.min(
                placementSpace.space || baseHeight,
                baseMaxHeight || placementSpace.space || baseHeight
              ),
        });
        const overlapArea = getCandidateAvoidanceScore({
          candidate,
          avoidRects: safeAvoidRects,
          minWidth: effectiveMinWidth,
          minHeight: effectiveMinHeight,
          targetRect: safeTargetRect,
        });
        recordDebugCandidate({
          stage: "fallback-score",
          placement: placementSpace.placement,
          candidate,
          result: "scored",
          availableSpace: placementSpace.space,
          score: overlapArea,
        });
        if (
          overlapArea < bestPlacement.overlapArea ||
          (overlapArea === bestPlacement.overlapArea &&
            placementSpace.space > bestPlacement.space)
        ) {
          return {
            placement: placementSpace.placement,
            space: placementSpace.space,
            overlapArea,
          };
        }
        return bestPlacement;
      }
      const space = getPlacementAvailableSpace({
        placement: placementSpace.placement,
        targetRect: safeTargetRect,
        bounds,
        gap: safeGap,
      });
      return space > bestPlacement.space
        ? { placement: placementSpace.placement, space, overlapArea: 0 }
        : bestPlacement;
    },
    {
      placement: placements[0],
      space: -1,
      overlapArea: Number.POSITIVE_INFINITY,
    }
  ).placement;
  const isHorizontal = isHorizontalTooltipPlacement(fallbackPlacement);
  const availableSpace = getPlacementAvailableSpace({
    placement: fallbackPlacement,
    targetRect: safeTargetRect,
    bounds,
    gap: safeGap,
  });
  const width = isHorizontal
    ? Math.max(1, Math.min(baseWidth, availableSpace || baseWidth))
    : baseWidth;
  const height = isHorizontal
    ? baseHeight
    : Math.max(1, Math.min(baseHeight, availableSpace || baseHeight));

  const fallbackCandidate = createPositionCandidate({
    placement: fallbackPlacement,
    targetRect: safeTargetRect,
    bounds,
    gap: safeGap,
    width,
    height,
    maxHeight: isHorizontal
      ? baseMaxHeight
      : Math.min(height, baseMaxHeight || height),
  });

  if (safeAvoidRects.length <= 0 || fallbackCandidates.length <= 0) {
    const reason =
      viewportSmallerThanMinimum
        ? "viewport-smaller-than-minimum"
        : enforceHardAvoidRects === true
          ? "hard-avoid-overlap-fallback"
          : "fallback";
    const constraintMode =
      enforceHardAvoidRects === true && viewportSmallerThanMinimum !== true
        ? "hard-avoid-overlap-fallback"
        : "strict";
    const finishedCandidate = finishCandidate(
      fallbackCandidate,
      reason,
      constraintMode,
      safeAvoidRects
    );
    flushDebugCandidates(finishedCandidate, reason);
    return finishedCandidate;
  }

  const bestFallbackCandidate = [...fallbackCandidates, fallbackCandidate].reduce(
    (bestCandidate, candidate) => {
      const overlapArea = getCandidateAvoidanceScore({
        candidate,
        avoidRects: safeAvoidRects,
        minWidth: effectiveMinWidth,
        minHeight: effectiveMinHeight,
        targetRect: safeTargetRect,
      });
      const bestOverlapArea = getCandidateAvoidanceScore({
        candidate: bestCandidate,
        avoidRects: safeAvoidRects,
        minWidth: effectiveMinWidth,
        minHeight: effectiveMinHeight,
        targetRect: safeTargetRect,
      });
      if (overlapArea < bestOverlapArea) return candidate;
      return bestCandidate;
    },
    fallbackCandidate
  );
  const reason = viewportSmallerThanMinimum
    ? "viewport-smaller-than-minimum"
    : enforceHardAvoidRects === true
      ? "hard-avoid-overlap-fallback"
      : "fallback";
  const constraintMode =
    enforceHardAvoidRects === true && viewportSmallerThanMinimum !== true
      ? "hard-avoid-overlap-fallback"
      : "strict";
  const finishedCandidate = finishCandidate(
    bestFallbackCandidate,
    reason,
    constraintMode,
    safeAvoidRects
  );
  flushDebugCandidates(finishedCandidate, reason);
  return finishedCandidate;
}

export function closeAssistantGuidedTourSession(state = {}) {
  return {
    ...state,
    closed: true,
    preferencePatch: null,
    navigationCommand: null,
  };
}

export function createAssistantGuidedTourPreferencePatch({
  assistantTourOptOut,
} = {}) {
  return {
    assistantTourOptOut: assistantTourOptOut === true,
  };
}

export function reconcileAssistantGuidedTourPosition({
  previousPositionKey,
  nextPositionKey,
  nextPhase,
} = {}) {
  const safePrevious = normalizeTourText(previousPositionKey);
  const safeNext = normalizeTourText(nextPositionKey);
  if (!safeNext || safePrevious === safeNext) {
    return {
      changed: false,
      phase: nextPhase,
      navigationCommand: null,
    };
  }

  return {
    changed: true,
    phase: nextPhase,
    navigationCommand: null,
  };
}

export function buildAssistantGuidedTourJourney({
  steps = [],
  stepSubstepCounts = [],
} = {}) {
  const safeSteps = Array.isArray(steps) ? steps : [];
  const total = safeSteps.reduce((sum, _step, index) => {
    const count = Number(stepSubstepCounts[index]);
    return sum + Math.max(1, Number.isFinite(count) ? Math.trunc(count) : 1);
  }, 0);

  let progressIndex = 0;
  return safeSteps.flatMap((step, stepIndex) => {
    const rawCount = Number(stepSubstepCounts[stepIndex]);
    const substepCount = Math.max(
      1,
      Number.isFinite(rawCount) ? Math.trunc(rawCount) : 1
    );

    return Array.from({ length: substepCount }, (_item, substepIndex) => {
      progressIndex += 1;
      return {
        stepId: normalizeTourText(step?.id),
        stepIndex,
        substepIndex,
        progressLabel: `${progressIndex}/${total}`,
      };
    });
  });
}
