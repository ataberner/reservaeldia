const EVENT_ASSISTANT_STEP = Object.freeze({ id: "detalles", label: "Evento" });
const PHOTOS_ASSISTANT_STEP = Object.freeze({ id: "imagen", label: "Fotos" });
const STORY_TEXT_ASSISTANT_STEP = Object.freeze({ id: "texto", label: "Texto" });
const RSVP_ASSISTANT_STEP = Object.freeze({ id: "rsvp", label: "Asistencia" });
const GIFTS_ASSISTANT_STEP = Object.freeze({ id: "regalos", label: "Regalos" });

const BASE_ASSISTANT_STEPS = Object.freeze([
  EVENT_ASSISTANT_STEP,
  PHOTOS_ASSISTANT_STEP,
  RSVP_ASSISTANT_STEP,
  GIFTS_ASSISTANT_STEP,
]);

export const EDITOR_ASSISTANT_STEPS = BASE_ASSISTANT_STEPS;

export const EDITOR_ASSISTANT_STEP_IDS = Object.freeze(
  EDITOR_ASSISTANT_STEPS.map((step) => step.id)
);

export const EDITOR_ASSISTANT_FIRST_STEP_INDEX = 0;
export const EDITOR_ASSISTANT_LAST_STEP_INDEX =
  EDITOR_ASSISTANT_STEPS.length - 1;

function shouldIncludeStoryTextStep(options = {}) {
  return options?.includeStoryText === true;
}

function shouldIncludePhotosStep(options = {}) {
  return options?.includePhotos !== false;
}

export function getAssistantSteps(options = {}) {
  const steps = [
    EVENT_ASSISTANT_STEP,
  ];

  if (shouldIncludeStoryTextStep(options)) {
    steps.push(STORY_TEXT_ASSISTANT_STEP);
  }

  if (shouldIncludePhotosStep(options)) {
    steps.push(PHOTOS_ASSISTANT_STEP);
  }

  steps.push(RSVP_ASSISTANT_STEP, GIFTS_ASSISTANT_STEP);

  return Object.freeze(steps);
}

export function getAssistantStepIds(options = {}) {
  return getAssistantSteps(options).map((step) => step.id);
}

function toIntegerOrNull(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return Math.trunc(numericValue);
}

export function clampAssistantStepIndex(index, options = {}) {
  const steps = getAssistantSteps(options);
  const lastStepIndex = Math.max(EDITOR_ASSISTANT_FIRST_STEP_INDEX, steps.length - 1);
  const numericIndex = toIntegerOrNull(index);
  if (numericIndex === null) return EDITOR_ASSISTANT_FIRST_STEP_INDEX;

  return Math.min(
    lastStepIndex,
    Math.max(EDITOR_ASSISTANT_FIRST_STEP_INDEX, numericIndex)
  );
}

export function getAssistantStep(index, options = {}) {
  const steps = getAssistantSteps(options);
  return steps[clampAssistantStepIndex(index, options)];
}

export function getAssistantStepIndexByTabId(tabId, options = {}) {
  const safeTabId = String(tabId || "");
  return getAssistantSteps(options).findIndex((step) => step.id === safeTabId);
}

export function isAssistantTabId(tabId, options = {}) {
  return getAssistantStepIndexByTabId(tabId, options) >= 0;
}

export function resolveAssistantResumeStepIndex({
  hasStarted = false,
  currentStepIndex = EDITOR_ASSISTANT_FIRST_STEP_INDEX,
  includeStoryText = false,
  includePhotos = true,
} = {}) {
  return hasStarted
    ? clampAssistantStepIndex(currentStepIndex, { includeStoryText, includePhotos })
    : EDITOR_ASSISTANT_FIRST_STEP_INDEX;
}

export function canGoToPreviousAssistantStep(index, options = {}) {
  return clampAssistantStepIndex(index, options) > EDITOR_ASSISTANT_FIRST_STEP_INDEX;
}

export function canGoToNextAssistantStep(index, options = {}) {
  const steps = getAssistantSteps(options);
  return clampAssistantStepIndex(index, options) < steps.length - 1;
}

export function getPreviousAssistantStepIndex(index, options = {}) {
  return Math.max(
    EDITOR_ASSISTANT_FIRST_STEP_INDEX,
    clampAssistantStepIndex(index, options) - 1
  );
}

export function getNextAssistantStepIndex(index, options = {}) {
  const steps = getAssistantSteps(options);
  return Math.min(
    steps.length - 1,
    clampAssistantStepIndex(index, options) + 1
  );
}

export function getAssistantStepProgressLabel(index, options = {}) {
  const steps = getAssistantSteps(options);
  return `${clampAssistantStepIndex(index, options) + 1}/${steps.length}`;
}

export function getAssistantNavigationState(index, options = {}) {
  const currentStepIndex = clampAssistantStepIndex(index, options);

  return {
    currentStepIndex,
    currentStep: getAssistantStep(currentStepIndex, options),
    progressLabel: getAssistantStepProgressLabel(currentStepIndex, options),
    canGoPrevious: canGoToPreviousAssistantStep(currentStepIndex, options),
    canGoNext: canGoToNextAssistantStep(currentStepIndex, options),
    previousStepIndex: getPreviousAssistantStepIndex(currentStepIndex, options),
    nextStepIndex: getNextAssistantStepIndex(currentStepIndex, options),
  };
}
