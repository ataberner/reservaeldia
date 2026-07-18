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

function getRectOverlapArea(firstRect, secondRect) {
  if (!firstRect || !secondRect) return 0;
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
  return width * height;
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

function getCandidateAvoidanceScore({
  candidate,
  avoidRects = [],
  minWidth,
  minHeight,
  targetRect,
} = {}) {
  if (!candidate?.rect) return Number.POSITIVE_INFINITY;
  const undersizedPenalty =
    candidate.width < minWidth || candidate.height < minHeight ? 1_000_000 : 0;
  const targetOverlapPenalty =
    getRectOverlapArea(candidate.rect, targetRect) * 1_000;
  return (
    undersizedPenalty +
    targetOverlapPenalty +
    getAvoidOverlapArea(candidate.rect, avoidRects)
  );
}

function hasFullPlacementSpace({ placement, targetRect, bounds, gap, width, height }) {
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
} = {}) {
  if (!candidate?.rect) return false;
  if (candidate.width < minWidth || candidate.height < minHeight) return false;
  if (getRectOverlapArea(candidate.rect, targetRect) > 0) return false;
  return getAvoidOverlapArea(candidate.rect, avoidRects) <= 0;
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
  minWidth = MIN_COMPACT_TOOLTIP_WIDTH_PX,
  minHeight = MIN_COMPACT_TOOLTIP_HEIGHT_PX,
} = {}) {
  const safeTargetRect = normalizeRect(targetRect);
  const bounds = normalizeViewportBounds(viewport, margin);
  const safeGap = Math.max(0, toFiniteNumber(gap, DEFAULT_TARGET_GAP_PX));
  const safeAvoidRects = normalizeAvoidRects(avoidRects);
  const safeMinWidth = Math.max(
    1,
    toFiniteNumber(minWidth, MIN_COMPACT_TOOLTIP_WIDTH_PX)
  );
  const safeMinHeight = Math.max(
    1,
    toFiniteNumber(minHeight, MIN_COMPACT_TOOLTIP_HEIGHT_PX)
  );
  const baseWidth = Math.min(
    Math.max(0, toFiniteNumber(tooltipSize?.width, DEFAULT_TOOLTIP_WIDTH_PX)),
    bounds.width
  );
  const baseHeight = Math.min(
    Math.max(0, toFiniteNumber(tooltipSize?.height, DEFAULT_TOOLTIP_HEIGHT_PX)),
    bounds.height
  );
  const placements =
    Array.isArray(placementPriority) && placementPriority.length > 0
      ? placementPriority
      : DEFAULT_PLACEMENT_PRIORITY;
  const fallbackCandidates = [];
  const safePreferredPlacement = normalizeTourText(preferredPlacement);

  if (placements.includes(safePreferredPlacement)) {
    const preferredCandidate = createConstrainedPositionCandidate({
      placement: safePreferredPlacement,
      targetRect: safeTargetRect,
      bounds,
      gap: safeGap,
      baseWidth,
      baseHeight,
      minWidth: safeMinWidth,
      minHeight: safeMinHeight,
    });
    if (
      isPositionCandidateSafe({
        candidate: preferredCandidate,
        avoidRects: safeAvoidRects,
        minWidth: safeMinWidth,
        minHeight: safeMinHeight,
        targetRect: safeTargetRect,
      })
    ) {
      return preferredCandidate;
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
      });
      if (getAvoidOverlapArea(candidate.rect, safeAvoidRects) <= 0) {
        return candidate;
      }
      fallbackCandidates.push(candidate);
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
    if (isHorizontal && availableSpace >= safeMinWidth) {
      const candidate = createPositionCandidate({
        placement,
        targetRect: safeTargetRect,
        bounds,
        gap: safeGap,
        width: Math.min(baseWidth, availableSpace),
        height: baseHeight,
      });
      if (getAvoidOverlapArea(candidate.rect, safeAvoidRects) <= 0) {
        return candidate;
      }
      fallbackCandidates.push(candidate);
    }
    if (!isHorizontal && availableSpace >= safeMinHeight) {
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
      if (getAvoidOverlapArea(candidate.rect, safeAvoidRects) <= 0) {
        return candidate;
      }
      fallbackCandidates.push(candidate);
    }
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
          maxHeight: isHorizontal ? undefined : placementSpace.space,
        });
        const overlapArea = getCandidateAvoidanceScore({
          candidate,
          avoidRects: safeAvoidRects,
          minWidth: safeMinWidth,
          minHeight: safeMinHeight,
          targetRect: safeTargetRect,
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
    maxHeight: isHorizontal ? undefined : height,
  });

  if (safeAvoidRects.length <= 0 || fallbackCandidates.length <= 0) {
    return fallbackCandidate;
  }

  return [...fallbackCandidates, fallbackCandidate].reduce(
    (bestCandidate, candidate) => {
      const overlapArea = getCandidateAvoidanceScore({
        candidate,
        avoidRects: safeAvoidRects,
        minWidth: safeMinWidth,
        minHeight: safeMinHeight,
        targetRect: safeTargetRect,
      });
      const bestOverlapArea = getCandidateAvoidanceScore({
        candidate: bestCandidate,
        avoidRects: safeAvoidRects,
        minWidth: safeMinWidth,
        minHeight: safeMinHeight,
        targetRect: safeTargetRect,
      });
      if (overlapArea < bestOverlapArea) return candidate;
      return bestCandidate;
    },
    fallbackCandidate
  );
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
