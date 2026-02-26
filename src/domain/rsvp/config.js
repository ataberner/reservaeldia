import {
  RSVP_LIMITS,
  RSVP_VERSION,
  createQuestionsForPreset,
  getPresetDefinition,
  getQuestionTemplate,
  isCustomQuestionId,
  resolvePresetId,
} from "@/domain/rsvp/catalog";

export const RSVP_DEFAULT_MODAL = Object.freeze({
  title: "Confirmar asistencia",
  subtitle: "Completa el formulario para confirmar tu presencia.",
  submitLabel: "Enviar",
  primaryColor: "#773dbe",
});

function sanitizeText(value, fallback = "", maxLength = 120) {
  if (value === null || typeof value === "undefined") return fallback;
  const next = String(value).replace(/\s+/g, " ").trim();
  if (!next) return fallback;
  return next.slice(0, maxLength);
}

function sanitizeLongText(value, fallback = "", maxLength = 240) {
  if (value === null || typeof value === "undefined") return fallback;
  const next = String(value).trim();
  if (!next) return fallback;
  return next.slice(0, maxLength);
}

function sanitizeColor(value, fallback = RSVP_DEFAULT_MODAL.primaryColor) {
  const next = sanitizeText(value, "", 32);
  if (/^#[0-9a-fA-F]{6}$/.test(next) || /^#[0-9a-fA-F]{3}$/.test(next)) {
    return next;
  }
  return fallback;
}

function sanitizeLimit(value, fallback, min = 1, max = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function toSafeOrder(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function buildOptions(templateOptions = [], incomingOptions = []) {
  if (!Array.isArray(templateOptions) || templateOptions.length === 0) {
    return undefined;
  }

  const incomingById = new Map(
    (Array.isArray(incomingOptions) ? incomingOptions : [])
      .filter((option) => option && typeof option.id === "string")
      .map((option) => [option.id, option])
  );

  return templateOptions.map((templateOption) => {
    const incoming = incomingById.get(templateOption.id);
    return {
      id: templateOption.id,
      label: sanitizeText(incoming?.label, templateOption.label, 80),
      metricTag: templateOption.metricTag,
    };
  });
}

function sanitizeQuestion(incomingQuestion, fallbackQuestion, fallbackOrder = 0) {
  const template = getQuestionTemplate(fallbackQuestion.id) || fallbackQuestion;
  const isCustom = isCustomQuestionId(template.id);

  const source = isCustom ? "custom" : "catalog";
  const type = isCustom
    ? (["short_text", "long_text"].includes(incomingQuestion?.type)
      ? incomingQuestion.type
      : fallbackQuestion.type)
    : fallbackQuestion.type;

  const label = sanitizeText(
    incomingQuestion?.label,
    fallbackQuestion.label,
    120
  );

  const required = Boolean(incomingQuestion?.required);
  const active = Boolean(incomingQuestion?.active);
  const order = toSafeOrder(incomingQuestion?.order, fallbackOrder);

  const options = buildOptions(
    template.options,
    Array.isArray(incomingQuestion?.options) ? incomingQuestion.options : []
  );

  return {
    id: template.id,
    source,
    type,
    label,
    required,
    active,
    order,
    options,
  };
}

function enforceLimits(questions, limits) {
  const sorted = [...questions].sort((a, b) => a.order - b.order);

  let activeCount = 0;
  let customActiveCount = 0;

  return sorted.map((question) => {
    if (!question.active) return question;

    if (activeCount >= limits.maxQuestions) {
      return { ...question, active: false };
    }

    if (question.source === "custom" && customActiveCount >= limits.maxCustomQuestions) {
      return { ...question, active: false };
    }

    activeCount += 1;
    if (question.source === "custom") customActiveCount += 1;

    return question;
  });
}

function normalizeQuestionOrder(questions) {
  return [...questions]
    .sort((a, b) => {
      if (a.active === b.active) return a.order - b.order;
      return a.active ? -1 : 1;
    })
    .map((question, index) => ({
      ...question,
      order: index,
    }));
}

export function isRsvpConfigV2(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      Number(value.version) === RSVP_VERSION &&
      Array.isArray(value.questions)
  );
}

export function createDefaultRsvpConfig(presetId = "basic") {
  const resolvedPresetId = resolvePresetId(presetId);
  const preset = getPresetDefinition(resolvedPresetId);

  return {
    version: RSVP_VERSION,
    enabled: true,
    presetId: preset.id,
    limits: {
      maxQuestions: RSVP_LIMITS.maxQuestions,
      maxCustomQuestions: RSVP_LIMITS.maxCustomQuestions,
    },
    modal: { ...RSVP_DEFAULT_MODAL },
    questions: createQuestionsForPreset(preset.id),
  };
}

export function normalizeRsvpConfig(rawConfig, options = {}) {
  const forceEnabled = options.forceEnabled !== false;

  const legacyTitle = sanitizeText(rawConfig?.title, RSVP_DEFAULT_MODAL.title, 80);
  const legacySubtitle = sanitizeLongText(rawConfig?.subtitle, RSVP_DEFAULT_MODAL.subtitle, 160);
  const legacySubmit = sanitizeText(rawConfig?.buttonText, RSVP_DEFAULT_MODAL.submitLabel, 30);
  const legacyColor = sanitizeColor(rawConfig?.primaryColor, RSVP_DEFAULT_MODAL.primaryColor);

  const presetId = resolvePresetId(rawConfig?.presetId);
  const baseConfig = createDefaultRsvpConfig(presetId);

  const modal = {
    title: sanitizeText(rawConfig?.modal?.title, legacyTitle, 80),
    subtitle: sanitizeLongText(rawConfig?.modal?.subtitle, legacySubtitle, 160),
    submitLabel: sanitizeText(rawConfig?.modal?.submitLabel, legacySubmit, 30),
    primaryColor: sanitizeColor(rawConfig?.modal?.primaryColor, legacyColor),
  };

  const limits = {
    maxQuestions: sanitizeLimit(
      rawConfig?.limits?.maxQuestions,
      RSVP_LIMITS.maxQuestions,
      1,
      RSVP_LIMITS.maxQuestions
    ),
    maxCustomQuestions: sanitizeLimit(
      rawConfig?.limits?.maxCustomQuestions,
      RSVP_LIMITS.maxCustomQuestions,
      0,
      RSVP_LIMITS.maxCustomQuestions
    ),
  };

  const incomingQuestions = Array.isArray(rawConfig?.questions) ? rawConfig.questions : [];
  const incomingById = new Map(
    incomingQuestions
      .filter((question) => question && typeof question.id === "string")
      .map((question) => [question.id, question])
  );

  const questions = baseConfig.questions.map((question, index) =>
    sanitizeQuestion(incomingById.get(question.id), question, index)
  );

  const normalized = {
    version: RSVP_VERSION,
    enabled: forceEnabled ? rawConfig?.enabled !== false : Boolean(rawConfig?.enabled),
    presetId,
    limits,
    modal,
    questions: normalizeQuestionOrder(enforceLimits(questions, limits)),
  };

  return normalized;
}

export function getOrderedQuestions(config, { activeOnly = false } = {}) {
  const normalized = normalizeRsvpConfig(config, { forceEnabled: false });
  const questions = [...normalized.questions].sort((a, b) => a.order - b.order);
  if (!activeOnly) return questions;
  return questions.filter((question) => question.active);
}

export function getQuestionById(config, questionId) {
  const questions = getOrderedQuestions(config);
  return questions.find((question) => question.id === questionId) || null;
}

export function countActiveQuestions(config) {
  return getOrderedQuestions(config, { activeOnly: true }).length;
}

export function countActiveCustomQuestions(config) {
  return getOrderedQuestions(config, { activeOnly: true }).filter(
    (question) => question.source === "custom"
  ).length;
}

export function hasActiveQuestion(config, questionId) {
  const question = getQuestionById(config, questionId);
  return Boolean(question?.active);
}
