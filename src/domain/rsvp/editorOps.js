import { normalizeRsvpConfig, getOrderedQuestions } from "@/domain/rsvp/config";
import { createQuestionsForPreset, resolvePresetId } from "@/domain/rsvp/catalog";

function withNormalizedConfig(config) {
  return normalizeRsvpConfig(config, { forceEnabled: false });
}

function updateQuestions(config, updater) {
  const normalized = withNormalizedConfig(config);
  const questions = getOrderedQuestions(normalized);
  const nextQuestions = updater(questions);

  return normalizeRsvpConfig(
    {
      ...normalized,
      questions: nextQuestions,
    },
    { forceEnabled: false }
  );
}

export function applyPresetToRsvpConfig(config, presetId) {
  const normalized = withNormalizedConfig(config);
  const resolvedPresetId = resolvePresetId(presetId);

  return normalizeRsvpConfig(
    {
      ...normalized,
      presetId: resolvedPresetId,
      enabled: true,
      questions: createQuestionsForPreset(resolvedPresetId),
    },
    { forceEnabled: false }
  );
}

export function toggleQuestionActive(config, questionId, active) {
  return updateQuestions(config, (questions) =>
    questions.map((question) =>
      question.id === questionId ? { ...question, active: Boolean(active) } : question
    )
  );
}

export function setQuestionRequired(config, questionId, required) {
  return updateQuestions(config, (questions) =>
    questions.map((question) =>
      question.id === questionId ? { ...question, required: Boolean(required) } : question
    )
  );
}

export function setQuestionLabel(config, questionId, label) {
  return updateQuestions(config, (questions) =>
    questions.map((question) =>
      question.id === questionId ? { ...question, label } : question
    )
  );
}

export function setCustomQuestionType(config, questionId, type) {
  return updateQuestions(config, (questions) =>
    questions.map((question) => {
      if (question.id !== questionId || question.source !== "custom") return question;
      const nextType = type === "long_text" ? "long_text" : "short_text";
      return { ...question, type: nextType };
    })
  );
}

export function setMenuOptionLabel(config, optionId, label) {
  return updateQuestions(config, (questions) =>
    questions.map((question) => {
      if (question.id !== "menu_type" || !Array.isArray(question.options)) return question;
      return {
        ...question,
        options: question.options.map((option) =>
          option.id === optionId ? { ...option, label } : option
        ),
      };
    })
  );
}

export function moveQuestion(config, questionId, direction) {
  const normalized = withNormalizedConfig(config);
  const questions = getOrderedQuestions(normalized);
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  const currentIndex = sorted.findIndex((question) => question.id === questionId);
  if (currentIndex < 0) return normalized;

  const offset = direction === "up" ? -1 : direction === "down" ? 1 : 0;
  if (!offset) return normalized;

  const targetIndex = currentIndex + offset;
  if (targetIndex < 0 || targetIndex >= sorted.length) return normalized;

  const swapped = [...sorted];
  const [item] = swapped.splice(currentIndex, 1);
  swapped.splice(targetIndex, 0, item);

  const reordered = swapped.map((question, index) => ({ ...question, order: index }));

  return normalizeRsvpConfig(
    {
      ...normalized,
      questions: reordered,
    },
    { forceEnabled: false }
  );
}

export function reorderQuestion(config, sourceQuestionId, targetQuestionId) {
  if (!sourceQuestionId || !targetQuestionId || sourceQuestionId === targetQuestionId) {
    return withNormalizedConfig(config);
  }

  const normalized = withNormalizedConfig(config);
  const sorted = getOrderedQuestions(normalized);

  const sourceIndex = sorted.findIndex((question) => question.id === sourceQuestionId);
  const targetIndex = sorted.findIndex((question) => question.id === targetQuestionId);

  if (sourceIndex < 0 || targetIndex < 0) return normalized;

  const reordered = [...sorted];
  const [moved] = reordered.splice(sourceIndex, 1);
  reordered.splice(targetIndex, 0, moved);

  return normalizeRsvpConfig(
    {
      ...normalized,
      questions: reordered.map((question, index) => ({ ...question, order: index })),
    },
    { forceEnabled: false }
  );
}

export function setModalSettings(config, patch = {}) {
  const normalized = withNormalizedConfig(config);
  return normalizeRsvpConfig(
    {
      ...normalized,
      modal: {
        ...normalized.modal,
        ...patch,
      },
    },
    { forceEnabled: false }
  );
}
