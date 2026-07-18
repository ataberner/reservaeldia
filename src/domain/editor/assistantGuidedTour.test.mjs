import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ASSISTANT_GUIDED_TOUR_CONTROLS_ATTR,
  ASSISTANT_GUIDED_TOUR_HYDRATION_ATTR,
  ASSISTANT_GUIDED_TOUR_PHASES,
  ASSISTANT_GUIDED_TOUR_TARGETS,
  ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS,
  areAssistantGuidedTourInitialFieldsHydrated,
  areAssistantGuidedTourPersonNamesComplete,
  buildAssistantGuidedTourJourney,
  closeAssistantGuidedTourSession,
  createAssistantGuidedTourPreferencePatch,
  createAssistantGuidedTourSessionKey,
  doAssistantGuidedTourRectsOverlap,
  getAssistantGuidedTourMessage,
  getAssistantGuidedTourPositionKey,
  reconcileAssistantGuidedTourPosition,
  resolveAssistantGuidedTourOverlayRect,
  resolveAssistantGuidedTourTargetId,
  resolveAssistantGuidedTourTooltipPosition,
  resolveInitialAssistantGuidedTourPhase,
  resolveNextAssistantGuidedTourFieldPhase,
  shouldAdvanceAssistantGuidedTourField,
  shouldAdvanceAssistantGuidedTourFieldEditSignal,
  shouldAdvanceEventNameTour,
  shouldAdvancePersonNamesTour,
  shouldAutoStartAssistantGuidedTour,
} from "./assistantGuidedTour.js";
import { getAssistantSteps } from "./assistantMode.js";
import { resolveAssistantSubstepsForStep } from "./assistantSubsteps.js";

function assertInsideViewport(rect, viewport, margin = 12) {
  assert.ok(rect.left >= margin);
  assert.ok(rect.top >= margin);
  assert.ok(rect.right <= viewport.width - margin);
  assert.ok(rect.bottom <= viewport.height - margin);
}

test("guided tour starts only when the draft, editor, Assistant and targets are ready", () => {
  const readyState = {
    draftKey: "draft-1",
    editorReady: true,
    assistantMounted: true,
    targetsReady: true,
    preferencesLoaded: true,
    assistantTourOptOut: false,
    editorReadOnly: false,
  };

  assert.equal(shouldAutoStartAssistantGuidedTour(readyState), true);
  assert.equal(
    shouldAutoStartAssistantGuidedTour({ ...readyState, draftKey: "" }),
    false
  );
  assert.equal(
    shouldAutoStartAssistantGuidedTour({ ...readyState, editorReady: false }),
    false
  );
  assert.equal(
    shouldAutoStartAssistantGuidedTour({
      ...readyState,
      assistantMounted: false,
    }),
    false
  );
  assert.equal(
    shouldAutoStartAssistantGuidedTour({ ...readyState, targetsReady: false }),
    false
  );
  assert.equal(
    shouldAutoStartAssistantGuidedTour({
      ...readyState,
      preferencesLoaded: false,
    }),
    false
  );
});

test("guided tour respects the No volver a mostrar preference", () => {
  assert.equal(
    shouldAutoStartAssistantGuidedTour({
      draftKey: "draft-1",
      editorReady: true,
      assistantMounted: true,
      targetsReady: true,
      preferencesLoaded: true,
      assistantTourOptOut: true,
    }),
    false
  );
  assert.deepEqual(
    createAssistantGuidedTourPreferencePatch({
      assistantTourOptOut: true,
    }),
    { assistantTourOptOut: true }
  );
});

test("closing the guided tour does not save the opt-out preference", () => {
  assert.deepEqual(
    closeAssistantGuidedTourSession({
      closed: false,
      preferencePatch: { assistantTourOptOut: true },
      navigationCommand: "next",
    }),
    {
      closed: true,
      preferencePatch: null,
      navigationCommand: null,
    }
  );
});

test("guided tour session keys reset across drafts but remain user-scoped", () => {
  assert.equal(
    createAssistantGuidedTourSessionKey({
      userUid: "user-1",
      draftKey: "draft-a",
    }),
    "user-1:draft-a"
  );
  assert.notEqual(
    createAssistantGuidedTourSessionKey({
      userUid: "user-1",
      draftKey: "draft-a",
    }),
    createAssistantGuidedTourSessionKey({
      userUid: "user-1",
      draftKey: "draft-b",
    })
  );
});

test("event name advances only when it changes from empty to valid", () => {
  assert.equal(
    shouldAdvanceEventNameTour({
      previousValue: "",
      nextValue: "Casamiento de Ana y Leo",
    }),
    true
  );
  assert.equal(
    shouldAdvanceEventNameTour({
      previousValue: "",
      nextValue: "     ",
    }),
    false
  );
  assert.equal(
    shouldAdvanceEventNameTour({
      previousValue: "Borrador inicial",
      nextValue: "Borrador editado",
    }),
    false
  );
  assert.equal(
    shouldAdvanceEventNameTour({
      previousValue: "",
      nextValue: "Fiesta",
      alreadyAdvanced: true,
    }),
    false
  );
});

test("field tour advances only from explicit owner edit signals for the active target", () => {
  assert.equal(
    shouldAdvanceAssistantGuidedTourFieldEditSignal({
      expectedTargetId: ASSISTANT_GUIDED_TOUR_TARGETS.EVENT_NAME,
      signalTargetId: ASSISTANT_GUIDED_TOUR_TARGETS.EVENT_NAME,
      signalValue: "Casamiento de Ana y Leo",
    }),
    true
  );
  assert.equal(
    shouldAdvanceAssistantGuidedTourFieldEditSignal({
      expectedTargetId: ASSISTANT_GUIDED_TOUR_TARGETS.EVENT_NAME,
      signalTargetId: ASSISTANT_GUIDED_TOUR_TARGETS.EVENT_NAME,
      signalValue: "    ",
    }),
    false
  );
  assert.equal(
    shouldAdvanceAssistantGuidedTourFieldEditSignal({
      expectedTargetId: ASSISTANT_GUIDED_TOUR_TARGETS.EVENT_NAME,
      signalTargetId: ASSISTANT_GUIDED_TOUR_TARGETS.PERSON_PRIMARY,
      signalValue: "Sofia",
    }),
    false
  );
  assert.equal(
    shouldAdvanceAssistantGuidedTourFieldEditSignal({
      expectedTargetId: ASSISTANT_GUIDED_TOUR_TARGETS.EVENT_NAME,
      signalTargetId: ASSISTANT_GUIDED_TOUR_TARGETS.EVENT_NAME,
      signalValue: "Casamiento",
      alreadyAdvanced: true,
    }),
    false
  );
});

test("person names advance only when both fields are complete", () => {
  assert.equal(
    areAssistantGuidedTourPersonNamesComplete({
      primaryName: "Sofia",
      secondaryName: "Mateo",
    }),
    true
  );
  assert.equal(
    shouldAdvancePersonNamesTour({
      primaryName: "Sofia",
      secondaryName: "   ",
    }),
    false
  );
  assert.equal(
    shouldAdvancePersonNamesTour({
      primaryName: "Sofia",
      secondaryName: "Mateo",
    }),
    true
  );
  assert.equal(
    shouldAdvancePersonNamesTour({
      primaryName: "Sofia",
      secondaryName: "Mateo",
      alreadyAdvanced: true,
    }),
    false
  );
});

test("guided tour waits for all initial name fields to hydrate", () => {
  assert.equal(
    areAssistantGuidedTourInitialFieldsHydrated({
      eventNameHydrated: true,
      primaryNameHydrated: true,
      secondaryNameHydrated: false,
    }),
    false
  );
  assert.equal(
    areAssistantGuidedTourInitialFieldsHydrated({
      eventNameHydrated: true,
      primaryNameHydrated: true,
      secondaryNameHydrated: true,
    }),
    true
  );
});

test("guided tour always starts the names substep at event name", () => {
  const currentStep = { id: "detalles", label: "Evento" };
  const currentSubstep = {
    id: "event-names",
    scope: "event-names",
    label: "Nombres",
  };
  const phase = resolveInitialAssistantGuidedTourPhase({
    currentStep,
    currentSubstep,
  });

  assert.equal(phase, ASSISTANT_GUIDED_TOUR_PHASES.EVENT_NAME);
  assert.equal(
    resolveAssistantGuidedTourTargetId({
      phase,
      isPreviewStep: false,
    }),
    ASSISTANT_GUIDED_TOUR_TARGETS.EVENT_NAME
  );
});

test("guided tour user input advances exactly one objective after initial stop", () => {
  let phase = ASSISTANT_GUIDED_TOUR_PHASES.EVENT_NAME;
  const shouldAdvance = shouldAdvanceAssistantGuidedTourField({
    previousValue: "",
    nextValue: "Casamiento",
  });

  if (shouldAdvance) {
    phase = resolveNextAssistantGuidedTourFieldPhase(phase);
  }

  assert.equal(phase, ASSISTANT_GUIDED_TOUR_PHASES.PERSON_PRIMARY);
});

test("guided tour backtracking to names starts again at event name", () => {
  const currentStep = { id: "detalles", label: "Evento" };
  const currentSubstep = {
    id: "event-names",
    scope: "event-names",
    label: "Nombres",
  };
  assert.equal(
    resolveInitialAssistantGuidedTourPhase({ currentStep, currentSubstep }),
    ASSISTANT_GUIDED_TOUR_PHASES.EVENT_NAME
  );
  assert.equal(
    resolveInitialAssistantGuidedTourPhase({ currentStep, currentSubstep }),
    ASSISTANT_GUIDED_TOUR_PHASES.EVENT_NAME
  );
});

test("guided tour advances one field phase at a time", () => {
  assert.equal(
    resolveNextAssistantGuidedTourFieldPhase(
      ASSISTANT_GUIDED_TOUR_PHASES.EVENT_NAME
    ),
    ASSISTANT_GUIDED_TOUR_PHASES.PERSON_PRIMARY
  );
  assert.equal(
    resolveNextAssistantGuidedTourFieldPhase(
      ASSISTANT_GUIDED_TOUR_PHASES.PERSON_PRIMARY
    ),
    ASSISTANT_GUIDED_TOUR_PHASES.PERSON_SECONDARY
  );
  assert.equal(
    resolveNextAssistantGuidedTourFieldPhase(
      ASSISTANT_GUIDED_TOUR_PHASES.PERSON_SECONDARY
    ),
    ASSISTANT_GUIDED_TOUR_PHASES.NEXT
  );
});

test("single field transition fires only once from incomplete to complete", () => {
  assert.equal(
    shouldAdvanceAssistantGuidedTourField({
      previousValue: "",
      nextValue: "Sofia",
    }),
    true
  );
  assert.equal(
    shouldAdvanceAssistantGuidedTourField({
      previousValue: "Sofia",
      nextValue: "Sofia M.",
    }),
    false
  );
  assert.equal(
    shouldAdvanceAssistantGuidedTourField({
      previousValue: "",
      nextValue: "Sofia",
      alreadyAdvanced: true,
    }),
    false
  );
});

test("guided tour maps phases to semantic targets without text selectors", () => {
  assert.equal(
    resolveAssistantGuidedTourTargetId({
      phase: ASSISTANT_GUIDED_TOUR_PHASES.EVENT_NAME,
    }),
    ASSISTANT_GUIDED_TOUR_TARGETS.EVENT_NAME
  );
  assert.equal(
    resolveAssistantGuidedTourTargetId({
      phase: ASSISTANT_GUIDED_TOUR_PHASES.PERSON_NAMES,
    }),
    ASSISTANT_GUIDED_TOUR_TARGETS.PERSON_NAMES
  );
  assert.equal(
    resolveAssistantGuidedTourTargetId({
      phase: ASSISTANT_GUIDED_TOUR_PHASES.PERSON_PRIMARY,
    }),
    ASSISTANT_GUIDED_TOUR_TARGETS.PERSON_PRIMARY
  );
  assert.equal(
    resolveAssistantGuidedTourTargetId({
      phase: ASSISTANT_GUIDED_TOUR_PHASES.PERSON_SECONDARY,
    }),
    ASSISTANT_GUIDED_TOUR_TARGETS.PERSON_SECONDARY
  );
  assert.equal(
    resolveAssistantGuidedTourTargetId({
      phase: ASSISTANT_GUIDED_TOUR_PHASES.NEXT,
    }),
    ASSISTANT_GUIDED_TOUR_TARGETS.ASSISTANT_NEXT
  );
  assert.equal(
    resolveAssistantGuidedTourTargetId({
      phase: ASSISTANT_GUIDED_TOUR_PHASES.PREVIEW,
    }),
    ASSISTANT_GUIDED_TOUR_TARGETS.ASSISTANT_PREVIEW
  );
});

test("guided tour derives its phase from the existing Assistant position", () => {
  assert.equal(
    resolveInitialAssistantGuidedTourPhase({
      currentStep: { id: "detalles", label: "Evento" },
      currentSubstep: { id: "event-names", scope: "event-names" },
    }),
    ASSISTANT_GUIDED_TOUR_PHASES.EVENT_NAME
  );
  assert.equal(
    resolveInitialAssistantGuidedTourPhase({
      currentStep: { id: "imagen", label: "Fotos" },
      currentSubstep: { id: "cover", scope: "cover" },
    }),
    ASSISTANT_GUIDED_TOUR_PHASES.CONTENT
  );
  assert.equal(
    resolveInitialAssistantGuidedTourPhase({
      currentStep: { id: "regalos", label: "Regalos" },
      isPreviewStep: true,
    }),
    ASSISTANT_GUIDED_TOUR_PHASES.PREVIEW
  );
});

test("real Assistant step changes move the tour without emitting navigation commands", () => {
  const previousPositionKey = getAssistantGuidedTourPositionKey({
    currentStep: { id: "detalles" },
    currentSubstep: { id: "event-names" },
  });
  const nextPositionKey = getAssistantGuidedTourPositionKey({
    currentStep: { id: "detalles" },
    currentSubstep: { id: "event-date" },
  });

  assert.deepEqual(
    reconcileAssistantGuidedTourPosition({
      previousPositionKey,
      nextPositionKey,
      nextPhase: ASSISTANT_GUIDED_TOUR_PHASES.CONTENT,
    }),
    {
      changed: true,
      phase: ASSISTANT_GUIDED_TOUR_PHASES.CONTENT,
      navigationCommand: null,
    }
  );
});

test("guided tour builds progress from the Assistant authority without fixed step count", () => {
  const steps = getAssistantSteps({
    includeStoryText: true,
    includePhotos: false,
  });
  const journey = buildAssistantGuidedTourJourney({
    steps,
    stepSubstepCounts: [3, 1, 1, 1],
  });

  assert.deepEqual(
    journey.map((item) => item.stepId),
    ["detalles", "detalles", "detalles", "texto", "rsvp", "regalos"]
  );
  assert.equal(journey.at(0).progressLabel, "1/6");
  assert.equal(journey.at(-1).progressLabel, "6/6");
});

test("guided tour copy follows the current Assistant step label for generic content steps", () => {
  assert.equal(
    getAssistantGuidedTourMessage({
      phase: ASSISTANT_GUIDED_TOUR_PHASES.CONTENT,
      currentStep: { id: "imagen", label: "Fotos" },
      currentSubstep: { id: "cover", label: "Portada" },
    }),
    "Completá Portada desde el Asistente."
  );
});

test("guided tour Next copy comes from Assistant substep metadata", () => {
  const [eventNamesSubstep, eventDateSubstep, eventLocationSubstep] =
    resolveAssistantSubstepsForStep("detalles");
  const [rsvpSubstep] = resolveAssistantSubstepsForStep("rsvp");
  const [giftsSubstep] = resolveAssistantSubstepsForStep("regalos");

  assert.equal(
    getAssistantGuidedTourMessage({
      phase: ASSISTANT_GUIDED_TOUR_PHASES.NEXT,
      currentSubstep: eventDateSubstep,
    }),
    "Cuando termines de configurar la fecha y el horario, presioná Siguiente."
  );
  assert.equal(
    getAssistantGuidedTourMessage({
      phase: ASSISTANT_GUIDED_TOUR_PHASES.NEXT,
      currentSubstep: eventLocationSubstep,
    }),
    "Cuando termines de configurar la ubicación, presioná Siguiente."
  );
  assert.equal(
    getAssistantGuidedTourMessage({
      phase: ASSISTANT_GUIDED_TOUR_PHASES.NEXT,
      currentSubstep: rsvpSubstep,
    }),
    "Cuando termines de configurar el formulario de asistencia, presioná Siguiente."
  );
  assert.equal(
    getAssistantGuidedTourMessage({
      phase: ASSISTANT_GUIDED_TOUR_PHASES.NEXT,
      currentSubstep: giftsSubstep,
    }),
    "Cuando termines de configurar la sección de regalos, presioná Siguiente."
  );
  assert.equal(
    getAssistantGuidedTourMessage({
      phase: ASSISTANT_GUIDED_TOUR_PHASES.NEXT,
      currentSubstep: eventNamesSubstep,
    }),
    "Cuando termines de completar esta sección, presioná Siguiente."
  );
});

test("guided tour Next copy does not mention real button implementation details", () => {
  const message = getAssistantGuidedTourMessage({
    phase: ASSISTANT_GUIDED_TOUR_PHASES.NEXT,
    currentSubstep: resolveAssistantSubstepsForStep("texto")[0],
  });

  assert.doesNotMatch(message.toLowerCase(), /bot[oó]n real/);
});

test("guided tour tooltip position does not overlap the target", () => {
  const targetRect = {
    left: 120,
    top: 140,
    width: 160,
    height: 42,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect,
    tooltipSize: { width: 260, height: 120 },
    viewport: { width: 900, height: 600 },
  });

  assert.equal(position.placement, "right");
  assert.equal(
    doAssistantGuidedTourRectsOverlap(position.rect, {
      ...targetRect,
      right: targetRect.left + targetRect.width,
      bottom: targetRect.top + targetRect.height,
    }),
    false
  );
});

test("guided tour tooltip falls back when there is no room on the right", () => {
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect: {
      left: 690,
      top: 140,
      width: 180,
      height: 42,
    },
    tooltipSize: { width: 260, height: 120 },
    viewport: { width: 900, height: 600 },
  });

  assert.equal(position.placement, "left");
});

test("guided tour tooltip remains inside a desktop viewport", () => {
  const viewport = { width: 1024, height: 768 };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect: {
      left: 470,
      top: 12,
      width: 120,
      height: 40,
    },
    tooltipSize: { width: 320, height: 140 },
    viewport,
  });

  assertInsideViewport(position.rect, viewport);
});

test("guided tour tooltip remains inside a mobile viewport", () => {
  const viewport = { width: 390, height: 620 };
  const targetRect = {
    left: 22,
    top: 430,
    width: 330,
    height: 38,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect,
    tooltipSize: { width: 300, height: 128 },
    viewport,
  });

  assertInsideViewport(position.rect, viewport);
  assert.equal(
    doAssistantGuidedTourRectsOverlap(position.rect, {
      ...targetRect,
      right: targetRect.left + targetRect.width,
      bottom: targetRect.top + targetRect.height,
    }),
    false
  );
});

test("guided tour target rects are normalized to the visual viewport offset", () => {
  assert.deepEqual(
    resolveAssistantGuidedTourOverlayRect({
      rect: {
        left: 24,
        top: 180,
        width: 320,
        height: 44,
        right: 344,
        bottom: 224,
      },
      visualViewport: {
        offsetLeft: 0,
        offsetTop: 168,
      },
    }),
    {
      left: 24,
      top: 348,
      width: 320,
      height: 44,
      right: 344,
      bottom: 392,
    }
  );

  assert.deepEqual(
    resolveAssistantGuidedTourOverlayRect({
      rect: {
        left: 24,
        top: 180,
        width: 320,
        height: 44,
        right: 344,
        bottom: 224,
      },
      visualViewport: null,
    }),
    {
      left: 24,
      top: 180,
      width: 320,
      height: 44,
      right: 344,
      bottom: 224,
    }
  );
});

test("guided tour mobile placement can prioritize above or below fields", () => {
  const viewport = { width: 390, height: 620 };
  const targetRect = {
    left: 28,
    top: 210,
    width: 334,
    height: 42,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect,
    tooltipSize: { width: 236, height: 112 },
    viewport,
    margin: 8,
    gap: 10,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    minWidth: 156,
    minHeight: 64,
  });

  assert.equal(position.placement, "top");
  assertInsideViewport(position.rect, viewport, 8);
  assert.equal(
    doAssistantGuidedTourRectsOverlap(position.rect, {
      ...targetRect,
      right: targetRect.left + targetRect.width,
      bottom: targetRect.top + targetRect.height,
    }),
    false
  );
});

test("guided tour mobile field tooltip avoids the previously edited field", () => {
  const viewport = { width: 390, height: 640 };
  const targetRect = {
    left: 26,
    top: 250,
    width: 338,
    height: 42,
  };
  const previousFieldRect = {
    left: 26,
    top: 126,
    width: 338,
    height: 108,
    right: 364,
    bottom: 234,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect,
    tooltipSize: { width: 220, height: 84 },
    viewport,
    margin: 8,
    gap: 10,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    avoidRects: [previousFieldRect],
    minWidth: 156,
    minHeight: 64,
  });

  assert.equal(position.placement, "bottom");
  assertInsideViewport(position.rect, viewport, 8);
  assert.equal(doAssistantGuidedTourRectsOverlap(position.rect, targetRect), false);
  assert.equal(
    doAssistantGuidedTourRectsOverlap(position.rect, previousFieldRect),
    false
  );
});

test("guided tour mobile action tooltip avoids edited field rects when choosing a side", () => {
  const viewport = { width: 390, height: 640 };
  const targetRect = {
    left: 206,
    top: 584,
    width: 160,
    height: 40,
  };
  const editedFieldRect = {
    left: 26,
    top: 438,
    width: 338,
    height: 96,
    right: 364,
    bottom: 534,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect,
    tooltipSize: { width: 172, height: 84 },
    viewport,
    margin: 8,
    gap: 10,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
    ],
    avoidRects: [editedFieldRect],
    minWidth: 156,
    minHeight: 64,
  });

  assert.equal(position.placement, "left");
  assertInsideViewport(position.rect, viewport, 8);
  assert.equal(doAssistantGuidedTourRectsOverlap(position.rect, targetRect), false);
  assert.equal(
    doAssistantGuidedTourRectsOverlap(position.rect, editedFieldRect),
    false
  );
});

test("guided tour mobile action tooltip avoids lower controls before choosing a side", () => {
  const viewport = { width: 390, height: 700 };
  const targetRect = {
    left: 206,
    top: 628,
    width: 160,
    height: 40,
  };
  const previousFooterButtonRect = {
    left: 24,
    top: 628,
    width: 160,
    height: 40,
    right: 184,
    bottom: 668,
  };
  const editedFieldRect = {
    left: 26,
    top: 454,
    width: 338,
    height: 76,
    right: 364,
    bottom: 530,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect,
    tooltipSize: { width: 164, height: 72 },
    viewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
    ],
    avoidRects: [previousFooterButtonRect, editedFieldRect],
    minWidth: 144,
    minHeight: 58,
  });

  assert.equal(position.placement, "top");
  assertInsideViewport(position.rect, viewport, 8);
  assert.equal(doAssistantGuidedTourRectsOverlap(position.rect, targetRect), false);
  assert.equal(
    doAssistantGuidedTourRectsOverlap(position.rect, previousFooterButtonRect),
    false
  );
  assert.equal(
    doAssistantGuidedTourRectsOverlap(position.rect, editedFieldRect),
    false
  );
});

test("guided tour mobile tooltip keeps a preferred placement while it remains safe", () => {
  const viewport = { width: 390, height: 640 };
  const targetRect = {
    left: 26,
    top: 260,
    width: 338,
    height: 42,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect,
    tooltipSize: { width: 220, height: 84 },
    viewport,
    margin: 8,
    gap: 10,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    preferredPlacement: ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
    minWidth: 156,
    minHeight: 64,
  });

  assert.equal(position.placement, "bottom");
  assertInsideViewport(position.rect, viewport, 8);
  assert.equal(doAssistantGuidedTourRectsOverlap(position.rect, targetRect), false);
});

test("guided tour mobile tooltip changes preferred placement when it is unsafe", () => {
  const viewport = { width: 390, height: 640 };
  const targetRect = {
    left: 26,
    top: 260,
    width: 338,
    height: 42,
  };
  const lowerContentRect = {
    left: 80,
    top: 306,
    width: 230,
    height: 118,
    right: 310,
    bottom: 424,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect,
    tooltipSize: { width: 220, height: 84 },
    viewport,
    margin: 8,
    gap: 10,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    preferredPlacement: ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
    avoidRects: [lowerContentRect],
    minWidth: 156,
    minHeight: 64,
  });

  assert.equal(position.placement, "top");
  assertInsideViewport(position.rect, viewport, 8);
  assert.equal(
    doAssistantGuidedTourRectsOverlap(position.rect, lowerContentRect),
    false
  );
});

test("guided tour CSS has the brand tooltip color and no dark overlay mask", () => {
  const css = readFileSync(
    new URL("../../components/editor/assistantTour/AssistantGuidedTour.module.css", import.meta.url),
    "utf8"
  ).toLowerCase();

  assert.match(css, /background:\s*#692b9a/);
  assert.doesNotMatch(css, /9999px/);
  assert.doesNotMatch(css, /rgba\(9,\s*9,\s*11,\s*0\.34\)/);
});

test("guided tour CSS keeps mobile tooltip styles compact and scoped", () => {
  const css = readFileSync(
    new URL("../../components/editor/assistantTour/AssistantGuidedTour.module.css", import.meta.url),
    "utf8"
  ).toLowerCase();
  const source = readFileSync(
    new URL("../../components/editor/assistantTour/AssistantGuidedTour.jsx", import.meta.url),
    "utf8"
  );

  assert.match(css, /@media\s*\(max-width:\s*767px\)/);
  assert.match(css, /width:\s*min\(204px,\s*calc\(100vw - 16px\)\)/);
  assert.match(css, /padding:\s*8px/);
  assert.match(css, /font-size:\s*11px/);
  assert.match(css, /width:\s*32px/);
  assert.match(css, /width:\s*8px/);
  assert.match(source, /MOBILE_FIELD_TOOLTIP_WIDTH_PX = 204/);
  assert.match(source, /MOBILE_ACTION_TOOLTIP_WIDTH_PX = 164/);
  assert.match(source, /MOBILE_BOTTOM_CONTROLS_GAP_PX = 12/);
  assert.match(source, /resolveMobileTourPositioningViewport/);
  assert.match(source, /lastMobileTooltipPlacementRef/);
  assert.match(source, /preferredPlacement: mobileTourViewport/);
  assert.match(source, /areSizesEqual/);
  assert.match(source, /readAssistantControlsRoot/);
});

test("guided tour exposes semantic target and hydration attributes", () => {
  assert.equal(
    ASSISTANT_GUIDED_TOUR_HYDRATION_ATTR,
    "data-assistant-tour-hydrated"
  );
  assert.equal(
    ASSISTANT_GUIDED_TOUR_CONTROLS_ATTR,
    "data-assistant-tour-controls"
  );
});

test("guided tour CSS disables transitions for reduced motion", () => {
  const css = readFileSync(
    new URL("../../components/editor/assistantTour/AssistantGuidedTour.module.css", import.meta.url),
    "utf8"
  ).toLowerCase();

  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /transition:\s*none/);
});

test("guided tour component cleans observers and input listeners", () => {
  const source = readFileSync(
    new URL("../../components/editor/assistantTour/AssistantGuidedTour.jsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /ASSISTANT_GUIDED_TOUR_HYDRATION_ATTR/);
  assert.match(source, /firstNamesHydrationReadyKey/);
  assert.doesNotMatch(source, /resolveAssistantGuidedTourFirstPendingNamesPhase/);
  assert.doesNotMatch(source, /shouldRunAssistantGuidedTourInitialSkip/);
  assert.doesNotMatch(source, /initializedPositions/);
  assert.match(source, /fieldEditSignal/);
  assert.match(source, /shouldAdvanceAssistantGuidedTourFieldEditSignal/);
  assert.match(source, /observer\.disconnect\(\)/);
  assert.match(source, /resizeObserver\?\.disconnect\(\)/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /cancelAnimationFrame/);
  assert.match(source, /resolveTargetScrollOwner/);
  assert.match(source, /previousEditedTargetIdRef/);
  assert.match(source, /previousTargetId: previousEditedTargetIdRef\.current/);
  assert.match(source, /resizeObserver\?\.observe\(controlsRoot\)/);
  assert.match(source, /ASSISTANT_GUIDED_TOUR_CONTROLS_ATTR/);
  assert.match(source, /readTooltipNaturalSize/);
  assert.match(source, /element\.scrollHeight/);
  assert.match(
    source,
    /effectiveTooltipSize\.height - TOUR_MEASUREMENT_TOLERANCE_PX/
  );
  assert.doesNotMatch(source, /recordTrustedIntent/);
  assert.doesNotMatch(source, /input\.addEventListener\("input", handleInput\)/);
  assert.doesNotMatch(source, /input\.addEventListener\("change", handleInput\)/);
  assert.match(
    source,
    /visualViewport\?\.removeEventListener\?\.\("scroll", scheduleUpdate\)/
  );
});
