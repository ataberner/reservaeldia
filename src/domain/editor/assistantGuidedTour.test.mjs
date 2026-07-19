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
  resolveAssistantGuidedTourUsableViewport,
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
  const left = Number(viewport?.left) || 0;
  const top = Number(viewport?.top) || 0;
  const width = Number(viewport?.width) || 0;
  const height = Number(viewport?.height) || 0;
  assert.ok(rect.left >= left + margin);
  assert.ok(rect.top >= top + margin);
  assert.ok(rect.right <= left + width - margin);
  assert.ok(rect.bottom <= top + height - margin);
}

function assertDoesNotOverlapAny(rect, obstructionRects = []) {
  obstructionRects.forEach((obstructionRect) => {
    assert.equal(
      doAssistantGuidedTourRectsOverlap(rect, obstructionRect),
      false
    );
  });
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

test("guided tour usable viewport keeps the desktop/no-obstruction viewport unchanged", () => {
  const viewport = { left: 0, top: 52, width: 1024, height: 716 };

  assert.deepEqual(
    resolveAssistantGuidedTourUsableViewport({
      viewport,
      bottomObstructionRects: [],
      gap: 12,
    }),
    viewport
  );
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

test("guided tour mobile usable viewport excludes lower Assistant controls and navigation", () => {
  const viewport = { width: 390, height: 700 };
  const lowerControlsRect = {
    left: 8,
    top: 570,
    width: 374,
    height: 72,
    right: 382,
    bottom: 642,
  };
  const mobileNavigationRect = {
    left: 0,
    top: 604,
    width: 390,
    height: 96,
    right: 390,
    bottom: 700,
  };
  const usableViewport = resolveAssistantGuidedTourUsableViewport({
    viewport,
    bottomObstructionRects: [lowerControlsRect, mobileNavigationRect],
    gap: 12,
  });
  const targetRect = {
    left: 26,
    top: 518,
    width: 338,
    height: 38,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect,
    tooltipSize: { width: 204, height: 84 },
    viewport: usableViewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    avoidRects: [lowerControlsRect, mobileNavigationRect],
    minWidth: 144,
    minHeight: 58,
  });

  assert.equal(usableViewport.height, 558);
  assert.notEqual(position.placement, "bottom");
  assertInsideViewport(position.rect, usableViewport, 8);
  assertDoesNotOverlapAny(position.rect, [
    targetRect,
    lowerControlsRect,
    mobileNavigationRect,
  ]);
});

test("guided tour mobile field tooltip stays above lower surfaces at min and max panel heights", () => {
  const viewport = { width: 390, height: 700 };
  const panelCases = [
    { label: "min-panel", controlsTop: 612 },
    { label: "max-panel", controlsTop: 420 },
  ];

  panelCases.forEach(({ label, controlsTop }) => {
    const lowerControlsRect = {
      left: 8,
      top: controlsTop,
      width: 374,
      height: 68,
      right: 382,
      bottom: controlsTop + 68,
    };
    const usableViewport = resolveAssistantGuidedTourUsableViewport({
      viewport,
      bottomObstructionRects: [lowerControlsRect],
      gap: 12,
    });
    const targetRect = {
      left: 28,
      top: controlsTop - 56,
      width: 334,
      height: 38,
    };
    const position = resolveAssistantGuidedTourTooltipPosition({
      targetRect,
      tooltipSize: { width: 204, height: 76 },
      viewport: usableViewport,
      margin: 8,
      gap: 8,
      placementPriority: [
        ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
        ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
        ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
        ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
      ],
      avoidRects: [lowerControlsRect],
      minWidth: 144,
      minHeight: 58,
    });

    assert.equal(position.placement, "top", label);
    assertInsideViewport(position.rect, usableViewport, 8);
    assertDoesNotOverlapAny(position.rect, [targetRect, lowerControlsRect]);
  });
});

test("guided tour mobile action tooltip stays inside the usable viewport above footer controls", () => {
  const viewport = { width: 390, height: 700 };
  const controlsRect = {
    left: 8,
    top: 568,
    width: 374,
    height: 82,
    right: 382,
    bottom: 650,
  };
  const navigationRect = {
    left: 0,
    top: 604,
    width: 390,
    height: 96,
    right: 390,
    bottom: 700,
  };
  const usableViewport = resolveAssistantGuidedTourUsableViewport({
    viewport,
    bottomObstructionRects: [controlsRect, navigationRect],
    gap: 12,
  });
  const targetRect = {
    left: 206,
    top: 606,
    width: 160,
    height: 40,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect,
    tooltipSize: { width: 164, height: 72 },
    viewport: usableViewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
    ],
    avoidRects: [controlsRect, navigationRect],
    minWidth: 144,
    minHeight: 58,
  });

  assertInsideViewport(position.rect, usableViewport, 8);
  assertDoesNotOverlapAny(position.rect, [
    targetRect,
    controlsRect,
    navigationRect,
  ]);
});

test("guided tour mobile NEXT action searches free space before overlapping hard controls", () => {
  let diagnostics = null;
  const usefulViewport = { left: 0, top: 57, width: 400, height: 425 };
  const targetRect = {
    left: 199,
    top: 517,
    width: 186,
    height: 48,
    right: 385,
    bottom: 565,
  };
  const hardAvoidRects = [
    { left: 19, top: 521, width: 178, height: 40, right: 197, bottom: 561 },
    { left: 351, top: 118, width: 32, height: 32, right: 383, bottom: 150 },
    { left: 20, top: 206, width: 361, height: 38, right: 381, bottom: 244 },
    { left: 20, top: 365, width: 361, height: 38, right: 381, bottom: 403 },
    { left: 20, top: 451, width: 173, height: 38, right: 192, bottom: 489 },
    { left: 208, top: 451, width: 173, height: 38, right: 381, bottom: 489 },
    { left: 9, top: 494, width: 382, height: 75, right: 391, bottom: 569 },
    { left: 0, top: 572, width: 400, height: 96, right: 400, bottom: 668 },
  ];

  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect,
    tooltipSize: { width: 164, height: 137 },
    viewport: usefulViewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
    ],
    preferredPlacement: ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
    avoidRects: hardAvoidRects,
    minWidth: 144,
    minHeight: 58,
    enforceHardAvoidRects: true,
    debugCandidates: (payload) => {
      diagnostics = payload;
    },
  });

  assert.equal(position.reason, "hard-avoid-free-space");
  assert.equal(position.constraintMode, "hard-avoid-free-space");
  assert.equal(position.height, 137);
  assert.equal(position.hardAvoidOverlapArea, 0);
  assert.ok(position.rect.bottom <= 206);
  assertInsideViewport(position.rect, usefulViewport, 8);
  assertDoesNotOverlapAny(position.rect, [targetRect, ...hardAvoidRects]);
  assert.ok(
    diagnostics.candidates.some(
      (candidate) => candidate.stage === "hard-avoid-free-space"
    )
  );
  assert.notEqual(diagnostics.reason, "hard-avoid-overlap-fallback");
});

test("guided tour mobile PREVIEW action avoids footer controls when preferred placement is blocked", () => {
  const usefulViewport = { left: 0, top: 57, width: 430, height: 430 };
  const previewTargetRect = {
    left: 215,
    top: 522,
    width: 192,
    height: 42,
    right: 407,
    bottom: 564,
  };
  const hardAvoidRects = [
    { left: 24, top: 522, width: 176, height: 42, right: 200, bottom: 564 },
    { left: 24, top: 202, width: 382, height: 40, right: 406, bottom: 242 },
    { left: 24, top: 360, width: 382, height: 40, right: 406, bottom: 400 },
    { left: 24, top: 452, width: 182, height: 40, right: 206, bottom: 492 },
    { left: 224, top: 452, width: 182, height: 40, right: 406, bottom: 492 },
    { left: 12, top: 496, width: 406, height: 76, right: 418, bottom: 572 },
  ];

  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect: previewTargetRect,
    tooltipSize: { width: 164, height: 132 },
    viewport: usefulViewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
    ],
    preferredPlacement: ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    avoidRects: hardAvoidRects,
    minWidth: 144,
    minHeight: 58,
    enforceHardAvoidRects: true,
  });

  assert.equal(position.hardAvoidOverlapArea, 0);
  assert.ok(position.height >= 58);
  assert.ok(position.rect.bottom <= 360);
  assertInsideViewport(position.rect, usefulViewport, 8);
  assertDoesNotOverlapAny(position.rect, [previewTargetRect, ...hardAvoidRects]);
});

test("guided tour mobile action can constrain height without covering hard controls", () => {
  const usefulViewport = { left: 0, top: 57, width: 390, height: 390 };
  const targetRect = {
    left: 204,
    top: 492,
    width: 164,
    height: 42,
    right: 368,
    bottom: 534,
  };
  const hardAvoidRects = [
    { left: 18, top: 492, width: 170, height: 42, right: 188, bottom: 534 },
    { left: 20, top: 200, width: 350, height: 42, right: 370, bottom: 242 },
    { left: 20, top: 360, width: 350, height: 42, right: 370, bottom: 402 },
    { left: 8, top: 448, width: 374, height: 86, right: 382, bottom: 534 },
  ];

  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect,
    tooltipSize: { width: 164, height: 180 },
    viewport: usefulViewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
    ],
    avoidRects: hardAvoidRects,
    minWidth: 144,
    minHeight: 58,
    enforceHardAvoidRects: true,
  });

  assert.equal(position.reason, "hard-avoid-constrained");
  assert.equal(position.constraintMode, "hard-avoid-free-space");
  assert.ok(position.height >= 58);
  assert.ok(position.maxHeight >= 58);
  assert.equal(position.hardAvoidOverlapArea, 0);
  assertInsideViewport(position.rect, usefulViewport, 8);
  assertDoesNotOverlapAny(position.rect, [targetRect, ...hardAvoidRects]);
});

test("guided tour mobile action identifies the physical last fallback when controls fill the viewport", () => {
  const usefulViewport = { left: 0, top: 57, width: 360, height: 240 };
  const targetRect = {
    left: 190,
    top: 316,
    width: 148,
    height: 40,
    right: 338,
    bottom: 356,
  };
  const hardAvoidRects = [
    { left: 8, top: 65, width: 344, height: 84, right: 352, bottom: 149 },
    { left: 8, top: 149, width: 344, height: 84, right: 352, bottom: 233 },
    { left: 8, top: 233, width: 344, height: 72, right: 352, bottom: 305 },
  ];

  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect,
    tooltipSize: { width: 164, height: 120 },
    viewport: usefulViewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
    ],
    avoidRects: hardAvoidRects,
    minWidth: 144,
    minHeight: 58,
    enforceHardAvoidRects: true,
  });

  assert.equal(position.reason, "hard-avoid-overlap-fallback");
  assert.equal(position.constraintMode, "hard-avoid-overlap-fallback");
  assert.ok(position.hardAvoidOverlapArea > 0);
  assertInsideViewport(position.rect, usefulViewport, 8);
});

test("guided tour mobile tooltip recomputes when the lower panel surface changes height", () => {
  const viewport = { width: 390, height: 700 };
  const targetRect = {
    left: 28,
    top: 456,
    width: 334,
    height: 40,
  };
  const expandedControlsRect = {
    left: 8,
    top: 620,
    width: 374,
    height: 64,
    right: 382,
    bottom: 684,
  };
  const reducedControlsRect = {
    left: 8,
    top: 540,
    width: 374,
    height: 64,
    right: 382,
    bottom: 604,
  };
  const resolvePosition = (controlsRect) => {
    const usableViewport = resolveAssistantGuidedTourUsableViewport({
      viewport,
      bottomObstructionRects: [controlsRect],
      gap: 12,
    });
    return {
      usableViewport,
      position: resolveAssistantGuidedTourTooltipPosition({
        targetRect,
        tooltipSize: { width: 204, height: 84 },
        viewport: usableViewport,
        margin: 8,
        gap: 8,
        placementPriority: [
          ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
          ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
          ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
          ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
        ],
        preferredPlacement: ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
        avoidRects: [controlsRect],
        minWidth: 144,
        minHeight: 58,
      }),
    };
  };
  const expanded = resolvePosition(expandedControlsRect);
  const reduced = resolvePosition(reducedControlsRect);

  assert.equal(expanded.position.placement, "bottom");
  assert.notEqual(reduced.position.placement, "bottom");
  assertInsideViewport(expanded.position.rect, expanded.usableViewport, 8);
  assertInsideViewport(reduced.position.rect, reduced.usableViewport, 8);
  assertDoesNotOverlapAny(reduced.position.rect, [
    targetRect,
    reducedControlsRect,
  ]);
});

test("guided tour mobile tooltip stays visible when visual viewport is reduced by keyboard", () => {
  const visualViewport = { width: 390, height: 430 };
  const keyboardControlsRect = {
    left: 8,
    top: 392,
    width: 374,
    height: 54,
    right: 382,
    bottom: 446,
  };
  const usableViewport = resolveAssistantGuidedTourUsableViewport({
    viewport: visualViewport,
    bottomObstructionRects: [keyboardControlsRect],
    gap: 12,
  });
  const targetRect = {
    left: 28,
    top: 348,
    width: 334,
    height: 36,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect,
    tooltipSize: { width: 204, height: 74 },
    viewport: usableViewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    avoidRects: [keyboardControlsRect],
    minWidth: 144,
    minHeight: 58,
  });

  assert.equal(position.placement, "top");
  assertInsideViewport(position.rect, usableViewport, 8);
  assertDoesNotOverlapAny(position.rect, [targetRect, keyboardControlsRect]);
});

test("guided tour mobile tooltip constrains max height when the useful viewport is short", () => {
  const viewport = { width: 390, height: 260 };
  const targetRect = {
    left: 28,
    top: 176,
    width: 334,
    height: 36,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect,
    tooltipSize: { width: 204, height: 180 },
    viewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    minWidth: 144,
    minHeight: 58,
  });

  assertInsideViewport(position.rect, viewport, 8);
  assert.ok(Number(position.maxHeight) <= 244);
  assert.ok(Number(position.maxHeight) < 180);
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

test("guided tour mobile content spotlight is avoided when there is room outside it", () => {
  const viewport = { width: 390, height: 700 };
  const controlsRect = {
    left: 8,
    top: 612,
    width: 374,
    height: 68,
    right: 382,
    bottom: 680,
  };
  const usableViewport = resolveAssistantGuidedTourUsableViewport({
    viewport,
    bottomObstructionRects: [controlsRect],
    gap: 12,
  });
  const contentSpotlightRect = {
    left: 8,
    top: 132,
    width: 374,
    height: 316,
    right: 382,
    bottom: 448,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect: contentSpotlightRect,
    tooltipSize: { width: 204, height: 84 },
    viewport: usableViewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    avoidRects: [controlsRect],
    spotlightAvoidRects: [contentSpotlightRect],
    minWidth: 144,
    minHeight: 58,
  });

  assert.equal(position.placement, "top");
  assertInsideViewport(position.rect, usableViewport, 8);
  assertDoesNotOverlapAny(position.rect, [contentSpotlightRect, controlsRect]);
});

test("guided tour mobile content spotlight stays avoided at min and max panel heights", () => {
  const viewport = { width: 390, height: 700 };
  const panelCases = [
    { label: "min-panel", controlsTop: 612, contentTop: 220 },
    { label: "max-panel", controlsTop: 420, contentTop: 96 },
  ];

  panelCases.forEach(({ label, controlsTop, contentTop }) => {
    const controlsRect = {
      left: 8,
      top: controlsTop,
      width: 374,
      height: 68,
      right: 382,
      bottom: controlsTop + 68,
    };
    const usableViewport = resolveAssistantGuidedTourUsableViewport({
      viewport,
      bottomObstructionRects: [controlsRect],
      gap: 12,
    });
    const contentSpotlightRect = {
      left: 8,
      top: contentTop,
      width: 374,
      height: controlsTop - contentTop - 18,
      right: 382,
      bottom: controlsTop - 18,
    };
    const position = resolveAssistantGuidedTourTooltipPosition({
      targetRect: contentSpotlightRect,
      tooltipSize: { width: 204, height: 76 },
      viewport: usableViewport,
      margin: 8,
      gap: 8,
      placementPriority: [
        ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
        ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
        ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
        ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
      ],
      avoidRects: [controlsRect],
      spotlightAvoidRects: [contentSpotlightRect],
      minWidth: 144,
      minHeight: 58,
    });

    assert.equal(position.placement, "top", label);
    assertInsideViewport(position.rect, usableViewport, 8);
    assertDoesNotOverlapAny(position.rect, [contentSpotlightRect, controlsRect]);
  });
});

test("guided tour mobile content spotlight with long tooltip uses max height outside the spotlight", () => {
  const viewport = { width: 390, height: 430 };
  const controlsRect = {
    left: 8,
    top: 392,
    width: 374,
    height: 54,
    right: 382,
    bottom: 446,
  };
  const usableViewport = resolveAssistantGuidedTourUsableViewport({
    viewport,
    bottomObstructionRects: [controlsRect],
    gap: 12,
  });
  const contentSpotlightRect = {
    left: 8,
    top: 176,
    width: 374,
    height: 204,
    right: 382,
    bottom: 380,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect: contentSpotlightRect,
    tooltipSize: { width: 204, height: 220 },
    viewport: usableViewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    avoidRects: [controlsRect],
    spotlightAvoidRects: [contentSpotlightRect],
    minWidth: 144,
    minHeight: 58,
  });

  assert.equal(position.placement, "top");
  assertInsideViewport(position.rect, usableViewport, 8);
  assertDoesNotOverlapAny(position.rect, [contentSpotlightRect, controlsRect]);
  assert.ok(Number(position.maxHeight) < 220);
  assert.ok(Number(position.maxHeight) >= 58);
});

test("guided tour content spotlight preserves readability when only 33px are free above it", () => {
  let diagnostics = null;
  const usableViewport = {
    left: 0,
    top: 57,
    width: 375.20001220703125,
    height: 425,
  };
  const contentSpotlightRect = {
    left: 5,
    top: 106,
    width: 366,
    height: 392,
    right: 371,
    bottom: 498,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect: contentSpotlightRect,
    tooltipSize: { width: 204, height: 123 },
    viewport: usableViewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    spotlightAvoidRects: [contentSpotlightRect],
    minWidth: 144,
    minHeight: 58,
    debugCandidates: (payload) => {
      diagnostics = payload;
    },
  });

  assert.equal(position.placement, "top");
  assert.equal(position.height, 123);
  assert.equal(position.maxHeight, undefined);
  assert.equal(position.reason, "readability-over-spotlight");
  assert.equal(position.constraintMode, "readability-over-spotlight");
  assert.equal(position.overlapsSpotlight, true);
  assert.equal(position.spotlightEdge, "top-edge");
  assert.equal(position.spotlightCoreOverlapArea, 0);
  assert.ok(position.spotlightPenetrationDepth > 0);
  assert.equal(typeof position.spotlightScore, "number");
  assert.ok(position.spotlightOverlapArea > 0);
  assertInsideViewport(position.rect, usableViewport, 8);
  assert.equal(diagnostics.reason, "readability-over-spotlight");
  assert.equal(diagnostics.constraintMode, "readability-over-spotlight");
  assert.equal(diagnostics.chosenCandidate.height, 123);
  assert.notEqual(diagnostics.chosenCandidate.reason, "below-min-size");
  assert.ok(
    diagnostics.candidates.some(
      (candidate) =>
        candidate.stage === "readability-fallback" &&
        candidate.result === "scored"
    )
  );
});

test("guided tour content spotlight falls back with controlled overlap when no minimum-size outside space exists", () => {
  const viewport = { width: 390, height: 300 };
  const contentSpotlightRect = {
    left: 8,
    top: 32,
    width: 374,
    height: 238,
    right: 382,
    bottom: 270,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect: contentSpotlightRect,
    tooltipSize: { width: 204, height: 120 },
    viewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    spotlightAvoidRects: [contentSpotlightRect],
    minWidth: 144,
    minHeight: 58,
  });

  assertInsideViewport(position.rect, viewport, 8);
  assert.equal(
    doAssistantGuidedTourRectsOverlap(position.rect, contentSpotlightRect),
    true
  );
  assert.ok(position.height >= 58);
  assert.equal(position.reason, "readability-over-spotlight");
  assert.equal(position.constraintMode, "readability-over-spotlight");
  assert.equal(position.overlapsSpotlight, true);
  assert.notEqual(position.spotlightEdge, "center-fallback");
  assert.ok(position.spotlightOverlapArea > 0);
});

test("guided tour content spotlight readability fallback chooses the least-overlap edge", () => {
  const viewport = {
    left: 0,
    top: 57,
    width: 375.20001220703125,
    height: 425,
  };
  const contentSpotlightRect = {
    left: 5,
    top: 106,
    width: 366,
    height: 392,
    right: 371,
    bottom: 498,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect: contentSpotlightRect,
    tooltipSize: { width: 204, height: 123 },
    viewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    spotlightAvoidRects: [contentSpotlightRect],
    minWidth: 144,
    minHeight: 58,
  });
  const bottomCandidate = resolveAssistantGuidedTourTooltipPosition({
    targetRect: contentSpotlightRect,
    tooltipSize: { width: 204, height: 123 },
    viewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    spotlightAvoidRects: [contentSpotlightRect],
    minWidth: 144,
    minHeight: 58,
  });

  assert.equal(position.placement, "top");
  assert.equal(position.spotlightEdge, "top-edge");
  assert.ok(position.spotlightOverlapArea < bottomCandidate.spotlightOverlapArea);
});

test("guided tour content spotlight readability fallback can choose the bottom edge", () => {
  const viewport = { width: 390, height: 440 };
  const contentSpotlightRect = {
    left: 8,
    top: 20,
    width: 374,
    height: 370,
    right: 382,
    bottom: 390,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect: contentSpotlightRect,
    tooltipSize: { width: 204, height: 120 },
    viewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    spotlightAvoidRects: [contentSpotlightRect],
    minWidth: 144,
    minHeight: 58,
  });

  assert.equal(position.reason, "readability-over-spotlight");
  assert.equal(position.placement, "bottom");
  assert.equal(position.spotlightEdge, "bottom-edge");
  assert.equal(position.spotlightCoreOverlapArea, 0);
  assertInsideViewport(position.rect, viewport, 8);
});

test("guided tour content spotlight readability fallback favors edge over central overlap", () => {
  let diagnostics = null;
  const viewport = { width: 390, height: 440 };
  const contentSpotlightRect = {
    left: 20,
    top: 20,
    width: 260,
    height: 380,
    right: 280,
    bottom: 400,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect: contentSpotlightRect,
    tooltipSize: { width: 180, height: 80 },
    viewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    spotlightAvoidRects: [contentSpotlightRect],
    minWidth: 144,
    minHeight: 58,
    debugCandidates: (payload) => {
      diagnostics = payload;
    },
  });
  const centerCandidate = diagnostics.candidates.find(
    (candidate) =>
      candidate.stage === "readability-fallback" &&
      candidate.result === "scored" &&
      candidate.diagnostics?.spotlightEdge === "center-fallback" &&
      candidate.diagnostics?.spotlightOverlapArea < position.spotlightOverlapArea
  );

  assert.equal(position.reason, "readability-over-spotlight");
  assert.equal(position.spotlightEdge, "bottom-edge");
  assert.equal(position.spotlightCoreOverlapArea, 0);
  assert.ok(centerCandidate);
  assert.ok(centerCandidate.diagnostics.spotlightCoreOverlapArea > 0);
});

test("guided tour content spotlight readability fallback uses center only when edges are blocked", () => {
  let diagnostics = null;
  const viewport = { width: 390, height: 440 };
  const contentSpotlightRect = {
    left: 20,
    top: 20,
    width: 260,
    height: 380,
    right: 280,
    bottom: 400,
  };
  const topHardRect = {
    left: 0,
    top: 0,
    width: 390,
    height: 104,
    right: 390,
    bottom: 104,
  };
  const bottomHardRect = {
    left: 0,
    top: 336,
    width: 390,
    height: 104,
    right: 390,
    bottom: 440,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect: contentSpotlightRect,
    tooltipSize: { width: 180, height: 80 },
    viewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    avoidRects: [topHardRect, bottomHardRect],
    spotlightAvoidRects: [contentSpotlightRect],
    minWidth: 144,
    minHeight: 58,
    debugCandidates: (payload) => {
      diagnostics = payload;
    },
  });

  assert.equal(position.reason, "readability-over-spotlight");
  assert.equal(position.spotlightEdge, "center-fallback");
  assert.equal(position.hardAvoidOverlapArea, 0);
  assertDoesNotOverlapAny(position.rect, [topHardRect, bottomHardRect]);
  assert.ok(
    diagnostics.candidates.some(
      (candidate) =>
        candidate.stage === "readability-fallback" &&
        candidate.diagnostics?.spotlightEdge === "top-edge" &&
        candidate.reason === "avoid-rect-overlap"
    )
  );
  assert.ok(
    diagnostics.candidates.some(
      (candidate) =>
        candidate.stage === "readability-fallback" &&
        candidate.diagnostics?.spotlightEdge === "bottom-edge" &&
        candidate.reason === "avoid-rect-overlap"
    )
  );
});

test("guided tour content spotlight readability fallback keeps the previous edge for minor changes", () => {
  const viewport = { width: 390, height: 440 };
  const contentSpotlightRect = {
    left: 20,
    top: 20,
    width: 260,
    height: 401,
    right: 280,
    bottom: 421,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect: contentSpotlightRect,
    tooltipSize: { width: 180, height: 80 },
    viewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    preferredPlacement: ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
    spotlightAvoidRects: [contentSpotlightRect],
    minWidth: 144,
    minHeight: 58,
  });

  assert.equal(position.reason, "readability-over-spotlight");
  assert.equal(position.placement, "bottom");
  assert.equal(position.spotlightEdge, "bottom-edge");
});

test("guided tour content spotlight max height never drops below minimum unless the useful viewport is smaller", () => {
  const viewport = { width: 390, height: 220 };
  const contentSpotlightRect = {
    left: 8,
    top: 32,
    width: 374,
    height: 160,
    right: 382,
    bottom: 192,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect: contentSpotlightRect,
    tooltipSize: { width: 204, height: 360 },
    viewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    spotlightAvoidRects: [contentSpotlightRect],
    minWidth: 144,
    minHeight: 58,
  });

  assertInsideViewport(position.rect, viewport, 8);
  assert.equal(position.reason, "readability-over-spotlight");
  assert.ok(position.height >= 58);
  assert.ok(Number(position.maxHeight) >= 58);
});

test("guided tour content spotlight uses exceptional fallback when useful viewport is smaller than minimum", () => {
  const viewport = { width: 390, height: 72 };
  const contentSpotlightRect = {
    left: 8,
    top: 10,
    width: 374,
    height: 52,
    right: 382,
    bottom: 62,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect: contentSpotlightRect,
    tooltipSize: { width: 204, height: 120 },
    viewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    spotlightAvoidRects: [contentSpotlightRect],
    minWidth: 144,
    minHeight: 58,
  });

  assertInsideViewport(position.rect, viewport, 8);
  assert.equal(position.reason, "viewport-smaller-than-minimum");
  assert.ok(position.height < 58);
  assert.ok(Number(position.maxHeight) < 58);
});

test("guided tour content spotlight readability fallback keeps footer and mobile bar hard", () => {
  const viewport = {
    left: 0,
    top: 57,
    width: 375.20001220703125,
    height: 610.2000122070312,
  };
  const footerRect = {
    left: 9,
    top: 494,
    width: 358,
    height: 75,
    right: 366,
    bottom: 568,
  };
  const mobileBarRect = {
    left: 0,
    top: 571,
    width: 375,
    height: 96,
    right: 375,
    bottom: 667,
  };
  const usableViewport = resolveAssistantGuidedTourUsableViewport({
    viewport,
    bottomObstructionRects: [footerRect, mobileBarRect],
    gap: 12,
  });
  const contentSpotlightRect = {
    left: 5,
    top: 106,
    width: 366,
    height: 392,
    right: 371,
    bottom: 498,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect: contentSpotlightRect,
    tooltipSize: { width: 204, height: 123 },
    viewport: usableViewport,
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
    ],
    avoidRects: [footerRect, mobileBarRect],
    spotlightAvoidRects: [contentSpotlightRect],
    minWidth: 144,
    minHeight: 58,
  });

  assert.equal(position.reason, "readability-over-spotlight");
  assertInsideViewport(position.rect, usableViewport, 8);
  assertDoesNotOverlapAny(position.rect, [footerRect, mobileBarRect]);
});

test("guided tour spotlight avoid rect can reject a geometrically open placement", () => {
  const targetRect = {
    left: 140,
    top: 220,
    width: 40,
    height: 40,
  };
  const spotlightAvoidRect = {
    left: 188,
    top: 214,
    width: 240,
    height: 80,
    right: 428,
    bottom: 294,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect,
    tooltipSize: { width: 180, height: 84 },
    viewport: { width: 640, height: 520 },
    margin: 8,
    gap: 8,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
    ],
    spotlightAvoidRects: [spotlightAvoidRect],
    minWidth: 144,
    minHeight: 58,
  });

  assert.notEqual(position.placement, "right");
  assertDoesNotOverlapAny(position.rect, [targetRect, spotlightAvoidRect]);
});

test("guided tour tooltip positioning can report placement candidate diagnostics", () => {
  let diagnostics = null;
  const avoidRect = {
    left: 356,
    top: 116,
    width: 200,
    height: 160,
    right: 556,
    bottom: 276,
  };
  const position = resolveAssistantGuidedTourTooltipPosition({
    targetRect: {
      left: 220,
      top: 160,
      width: 120,
      height: 50,
    },
    tooltipSize: { width: 180, height: 84 },
    viewport: { width: 720, height: 520 },
    margin: 8,
    gap: 10,
    placementPriority: [
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.RIGHT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.LEFT,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.TOP,
      ASSISTANT_GUIDED_TOUR_TOOLTIP_PLACEMENTS.BOTTOM,
    ],
    avoidRects: [avoidRect],
    minWidth: 144,
    minHeight: 58,
    debugCandidates: (payload) => {
      diagnostics = payload;
    },
  });

  assert.equal(position.placement, "left");
  assert.equal(diagnostics.chosenPlacement, "left");
  assert.ok(diagnostics.candidates.length > 0);
  assert.ok(
    diagnostics.candidates.some(
      (candidate) =>
        candidate.placement === "right" &&
        candidate.reason === "avoid-rect-overlap"
    )
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
  assert.match(css, /\.spotlight\s*{[\s\S]*?z-index:\s*0/);
  assert.match(css, /\.tooltip\s*{[\s\S]*?z-index:\s*1/);
  assert.match(source, /MOBILE_FIELD_TOOLTIP_WIDTH_PX = 204/);
  assert.match(source, /MOBILE_ACTION_TOOLTIP_WIDTH_PX = 164/);
  assert.match(source, /MOBILE_BOTTOM_CONTROLS_GAP_PX = 12/);
  assert.match(source, /resolveMobileTourPositioningViewport/);
  assert.match(source, /resolveAssistantGuidedTourUsableViewport/);
  assert.match(source, /readMobileTourBottomSurfaceRects/);
  assert.match(source, /contentSpotlightActive/);
  assert.match(source, /spotlightAvoidRects/);
  assert.match(source, /DASHBOARD_SIDEBAR_SELECTOR/);
  assert.match(source, /observedResizeElements/);
  assert.match(source, /lastMobileTooltipPlacementRef/);
  assert.match(source, /const preferredPlacement = mobileTourViewport/);
  assert.match(source, /preferredPlacement,/);
  assert.match(source, /areSizesEqual/);
  assert.match(source, /readAssistantControlsRoot/);
  assert.match(source, /enforceHardAvoidRects:\s*mobileTourViewport && actionTarget/);
});

test("guided tour debug instrumentation is opt-in and exposes capture history", () => {
  const debugSource = readFileSync(
    new URL("../../components/editor/assistantTour/assistantTourDebug.js", import.meta.url),
    "utf8"
  );
  const componentSource = readFileSync(
    new URL("../../components/editor/assistantTour/AssistantGuidedTour.jsx", import.meta.url),
    "utf8"
  );

  assert.match(debugSource, /reservaeldia:assistant-tour-debug/);
  assert.match(debugSource, /reservaeldia:assistant-tour-debug-visual/);
  assert.match(debugSource, /DEBUG_SNAPSHOT_LIMIT = 100/);
  assert.match(debugSource, /installAssistantTourDebugApi/);
  assert.match(debugSource, /capture\(options = {}\)/);
  assert.match(debugSource, /get history\(\)/);
  assert.match(componentSource, /readAncestorDebugChain/);
  assert.match(componentSource, /document\.elementFromPoint/);
  assert.match(componentSource, /spotlightAvoidRects/);
  assert.match(componentSource, /debugCandidates/);
  assert.match(componentSource, /shouldShowAssistantTourDebugVisual/);
});

test("guided tour debug instrumentation avoids logging input values", () => {
  const componentSource = readFileSync(
    new URL("../../components/editor/assistantTour/AssistantGuidedTour.jsx", import.meta.url),
    "utf8"
  );
  const sidebarSource = readFileSync(
    new URL("../../components/DashboardSidebar.jsx", import.meta.url),
    "utf8"
  );

  assert.match(componentSource, /readInputDebugMeta/);
  assert.doesNotMatch(componentSource, /value:\s*readInputValue/);
  assert.doesNotMatch(componentSource, /signal:\s*fieldEditSignal/);
  assert.doesNotMatch(sidebarSource, /rawDetail/);
  assert.match(sidebarSource, /hasValue/);
  assert.match(sidebarSource, /trimmedLength/);
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
  assert.match(source, /observedResizeElements\.add\(controlsRoot\)/);
  assert.match(source, /readMobileTourBottomSurfaceElements\(\{ targetElement \}\)/);
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
  assert.match(source, /handleVisualViewportResize/);
  assert.match(source, /handleVisualViewportScroll/);
  assert.match(
    source,
    /visualViewport\?\.removeEventListener\?\.\(\s*"scroll",\s*handleVisualViewportScroll/
  );
});
