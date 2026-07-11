import { normalizeRsvpConfig, getOrderedQuestions } from "@/domain/rsvp/config";
import {
  createQuestionsForPreset,
  getQuestionTemplate,
  resolvePresetId,
} from "@/domain/rsvp/catalog";

const RSVP_FIELD_TYPES = new Set([
  "short_text",
  "long_text",
  "number",
  "single_select",
  "boolean",
  "phone",
]);

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

function normalizeFieldType(type, fallback = "short_text") {
  return RSVP_FIELD_TYPES.has(type) ? type : fallback;
}

function createOptionId(existingOptions = []) {
  const existingIds = new Set(
    (Array.isArray(existingOptions) ? existingOptions : [])
      .map((option) => String(option?.id || ""))
      .filter(Boolean)
  );

  let index = existingIds.size + 1;
  let id = `option_${index}`;
  while (existingIds.has(id)) {
    index += 1;
    id = `option_${index}`;
  }
  return id;
}

function createDefaultOptions(question) {
  const existingOptions = Array.isArray(question?.options) ? question.options : [];
  if (existingOptions.length > 0) return existingOptions;

  const templateOptions = getQuestionTemplate(question?.id)?.options;
  if (Array.isArray(templateOptions) && templateOptions.length > 0) {
    return templateOptions.map((option) => ({ ...option }));
  }

  return [
    { id: "option_1", label: "Opcion 1" },
    { id: "option_2", label: "Opcion 2" },
  ];
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
  return setQuestionType(config, questionId, type);
}

export function setQuestionType(config, questionId, type) {
  return updateQuestions(config, (questions) =>
    questions.map((question) => {
      if (question.id !== questionId) return question;
      const nextType = normalizeFieldType(type, question.type);

      if (nextType === "single_select") {
        return {
          ...question,
          type: nextType,
          options: createDefaultOptions(question),
        };
      }

      const { options: _options, ...questionWithoutOptions } = question;
      return {
        ...questionWithoutOptions,
        type: nextType,
      };
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

export function setQuestionOptionLabel(config, questionId, optionId, label) {
  return updateQuestions(config, (questions) =>
    questions.map((question) => {
      if (question.id !== questionId || !Array.isArray(question.options)) return question;
      return {
        ...question,
        options: question.options.map((option) =>
          option.id === optionId ? { ...option, label } : option
        ),
      };
    })
  );
}

export function addQuestionOption(config, questionId) {
  return updateQuestions(config, (questions) =>
    questions.map((question) => {
      if (question.id !== questionId) return question;
      const options = createDefaultOptions(question);
      const nextId = createOptionId(options);
      return {
        ...question,
        type: "single_select",
        options: [
          ...options,
          {
            id: nextId,
            label: `Opcion ${options.length + 1}`,
          },
        ],
      };
    })
  );
}

export function removeQuestionOption(config, questionId, optionId) {
  return updateQuestions(config, (questions) =>
    questions.map((question) => {
      if (question.id !== questionId || !Array.isArray(question.options)) return question;
      const nextOptions = question.options.filter((option) => option.id !== optionId);
      return {
        ...question,
        options: nextOptions.length > 0 ? nextOptions : question.options,
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
