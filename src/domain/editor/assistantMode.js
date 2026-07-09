export const EDITOR_ASSISTANT_STEPS = Object.freeze([
  Object.freeze({ id: "detalles", label: "Evento" }),
  Object.freeze({ id: "imagen", label: "Fotos" }),
  Object.freeze({ id: "rsvp", label: "Asistencia" }),
  Object.freeze({ id: "regalos", label: "Regalos" }),
]);

export const EDITOR_ASSISTANT_STEP_IDS = Object.freeze(
  EDITOR_ASSISTANT_STEPS.map((step) => step.id)
);

export const EDITOR_ASSISTANT_FIRST_STEP_INDEX = 0;
export const EDITOR_ASSISTANT_LAST_STEP_INDEX =
  EDITOR_ASSISTANT_STEPS.length - 1;

function toIntegerOrNull(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return Math.trunc(numericValue);
}

export function clampAssistantStepIndex(index) {
  const numericIndex = toIntegerOrNull(index);
  if (numericIndex === null) return EDITOR_ASSISTANT_FIRST_STEP_INDEX;

  return Math.min(
    EDITOR_ASSISTANT_LAST_STEP_INDEX,
    Math.max(EDITOR_ASSISTANT_FIRST_STEP_INDEX, numericIndex)
  );
}

export function getAssistantStep(index) {
  return EDITOR_ASSISTANT_STEPS[clampAssistantStepIndex(index)];
}

export function getAssistantStepIndexByTabId(tabId) {
  const safeTabId = String(tabId || "");
  return EDITOR_ASSISTANT_STEPS.findIndex((step) => step.id === safeTabId);
}

export function isAssistantTabId(tabId) {
  return getAssistantStepIndexByTabId(tabId) >= 0;
}

export function resolveAssistantResumeStepIndex({
  hasStarted = false,
  currentStepIndex = EDITOR_ASSISTANT_FIRST_STEP_INDEX,
} = {}) {
  return hasStarted
    ? clampAssistantStepIndex(currentStepIndex)
    : EDITOR_ASSISTANT_FIRST_STEP_INDEX;
}

export function canGoToPreviousAssistantStep(index) {
  return clampAssistantStepIndex(index) > EDITOR_ASSISTANT_FIRST_STEP_INDEX;
}

export function canGoToNextAssistantStep(index) {
  return clampAssistantStepIndex(index) < EDITOR_ASSISTANT_LAST_STEP_INDEX;
}

export function getPreviousAssistantStepIndex(index) {
  return Math.max(
    EDITOR_ASSISTANT_FIRST_STEP_INDEX,
    clampAssistantStepIndex(index) - 1
  );
}

export function getNextAssistantStepIndex(index) {
  return Math.min(
    EDITOR_ASSISTANT_LAST_STEP_INDEX,
    clampAssistantStepIndex(index) + 1
  );
}

export function getAssistantStepProgressLabel(index) {
  return `${clampAssistantStepIndex(index) + 1}/${EDITOR_ASSISTANT_STEPS.length}`;
}

export function getAssistantNavigationState(index) {
  const currentStepIndex = clampAssistantStepIndex(index);

  return {
    currentStepIndex,
    currentStep: getAssistantStep(currentStepIndex),
    progressLabel: getAssistantStepProgressLabel(currentStepIndex),
    canGoPrevious: canGoToPreviousAssistantStep(currentStepIndex),
    canGoNext: canGoToNextAssistantStep(currentStepIndex),
    previousStepIndex: getPreviousAssistantStepIndex(currentStepIndex),
    nextStepIndex: getNextAssistantStepIndex(currentStepIndex),
  };
}
