import test from "node:test";
import assert from "node:assert/strict";

import {
  EDITOR_ASSISTANT_STEP_IDS,
  canGoToNextAssistantStep,
  canGoToPreviousAssistantStep,
  clampAssistantStepIndex,
  getAssistantNavigationState,
  getAssistantStep,
  getAssistantStepIndexByTabId,
  getAssistantStepProgressLabel,
  getNextAssistantStepIndex,
  getPreviousAssistantStepIndex,
  isAssistantTabId,
  resolveAssistantResumeStepIndex,
} from "./assistantMode.js";

test("assistant flow keeps the required tab order", () => {
  assert.deepEqual(EDITOR_ASSISTANT_STEP_IDS, [
    "detalles",
    "imagen",
    "rsvp",
    "regalos",
  ]);

  assert.equal(getAssistantStep(0).label, "Evento");
  assert.equal(getAssistantStep(1).label, "Fotos");
  assert.equal(getAssistantStep(2).label, "Asistencia");
  assert.equal(getAssistantStep(3).label, "Regalos");
});

test("assistant step index clamps to the flow boundaries", () => {
  assert.equal(clampAssistantStepIndex(-3), 0);
  assert.equal(clampAssistantStepIndex("2"), 2);
  assert.equal(clampAssistantStepIndex(99), 3);
  assert.equal(clampAssistantStepIndex(Number.NaN), 0);
});

test("assistant navigation respects first and last step limits", () => {
  assert.equal(canGoToPreviousAssistantStep(0), false);
  assert.equal(canGoToNextAssistantStep(0), true);
  assert.equal(getPreviousAssistantStepIndex(0), 0);
  assert.equal(getNextAssistantStepIndex(0), 1);

  assert.equal(canGoToPreviousAssistantStep(3), true);
  assert.equal(canGoToNextAssistantStep(3), false);
  assert.equal(getPreviousAssistantStepIndex(3), 2);
  assert.equal(getNextAssistantStepIndex(3), 3);
});

test("assistant maps only the guided tabs to step indexes", () => {
  assert.equal(getAssistantStepIndexByTabId("detalles"), 0);
  assert.equal(getAssistantStepIndexByTabId("imagen"), 1);
  assert.equal(getAssistantStepIndexByTabId("rsvp"), 2);
  assert.equal(getAssistantStepIndexByTabId("regalos"), 3);
  assert.equal(getAssistantStepIndexByTabId("texto"), -1);

  assert.equal(isAssistantTabId("regalos"), true);
  assert.equal(isAssistantTabId("forma"), false);
});

test("assistant resume starts at Evento first and keeps current step after start", () => {
  assert.equal(
    resolveAssistantResumeStepIndex({
      hasStarted: false,
      currentStepIndex: 2,
    }),
    0
  );

  assert.equal(
    resolveAssistantResumeStepIndex({
      hasStarted: true,
      currentStepIndex: 2,
    }),
    2
  );

  assert.equal(
    resolveAssistantResumeStepIndex({
      hasStarted: true,
      currentStepIndex: 12,
    }),
    3
  );
});

test("assistant navigation state exposes progress and target indexes", () => {
  assert.deepEqual(getAssistantNavigationState(1), {
    currentStepIndex: 1,
    currentStep: { id: "imagen", label: "Fotos" },
    progressLabel: "2/4",
    canGoPrevious: true,
    canGoNext: true,
    previousStepIndex: 0,
    nextStepIndex: 2,
  });

  assert.equal(getAssistantStepProgressLabel(3), "4/4");
});
