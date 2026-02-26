export const RSVP_VERSION = 2;

export const RSVP_LIMITS = Object.freeze({
  maxQuestions: 12,
  maxCustomQuestions: 2,
});

export const RSVP_CUSTOM_IDS = Object.freeze(["custom_1", "custom_2"]);

export const RSVP_PRESETS = Object.freeze({
  basic: {
    id: "basic",
    name: "Basico",
    description: "Confirmacion rapida con datos esenciales.",
    questionIds: ["full_name", "attendance", "party_size"],
  },
  wedding_complete: {
    id: "wedding_complete",
    name: "Completo boda",
    description: "Configuracion recomendada para organizar una boda.",
    questionIds: [
      "full_name",
      "attendance",
      "party_size",
      "event_scope",
      "menu_type",
      "dietary_notes",
      "phone_whatsapp",
      "plus_one",
      "plus_one_name",
      "children_count",
      "host_message",
      "needs_transport",
    ],
  },
  minimal: {
    id: "minimal",
    name: "Minimalista",
    description: "Solo lo imprescindible para confirmar asistencia.",
    questionIds: ["full_name", "attendance"],
  },
});

const CATALOG_QUESTIONS = Object.freeze([
  {
    id: "full_name",
    source: "catalog",
    type: "short_text",
    label: "Nombre y apellido",
    required: true,
  },
  {
    id: "attendance",
    source: "catalog",
    type: "single_select",
    label: "Asistis?",
    required: true,
    options: [
      { id: "yes", label: "Si", metricTag: "attendance_yes" },
      { id: "no", label: "No", metricTag: "attendance_no" },
    ],
  },
  {
    id: "party_size",
    source: "catalog",
    type: "number",
    label: "Cantidad de personas",
    required: false,
  },
  {
    id: "event_scope",
    source: "catalog",
    type: "single_select",
    label: "Ceremonia / Fiesta / Ambos",
    required: false,
    options: [
      { id: "ceremony", label: "Ceremonia" },
      { id: "party", label: "Fiesta" },
      { id: "both", label: "Ambos" },
    ],
  },
  {
    id: "menu_type",
    source: "catalog",
    type: "single_select",
    label: "Tipo de menu",
    required: false,
    options: [
      { id: "standard", label: "Clasico" },
      { id: "vegetarian", label: "Vegetariano", metricTag: "menu_vegetarian" },
      { id: "vegan", label: "Vegano", metricTag: "menu_vegan" },
      { id: "celiac", label: "Sin TACC", metricTag: "menu_celiac" },
    ],
  },
  {
    id: "dietary_notes",
    source: "catalog",
    type: "long_text",
    label: "Alergias o restricciones alimentarias",
    required: false,
  },
  {
    id: "phone_whatsapp",
    source: "catalog",
    type: "phone",
    label: "Telefono / WhatsApp",
    required: false,
  },
  {
    id: "plus_one",
    source: "catalog",
    type: "boolean",
    label: "Vas con acompanante?",
    required: false,
  },
  {
    id: "plus_one_name",
    source: "catalog",
    type: "short_text",
    label: "Nombre del acompanante",
    required: false,
  },
  {
    id: "children_count",
    source: "catalog",
    type: "number",
    label: "Cantidad de ninos",
    required: false,
  },
  {
    id: "host_message",
    source: "catalog",
    type: "long_text",
    label: "Mensaje para los anfitriones",
    required: false,
  },
  {
    id: "song_suggestion",
    source: "catalog",
    type: "short_text",
    label: "Cancion sugerida",
    required: false,
  },
  {
    id: "needs_transport",
    source: "catalog",
    type: "boolean",
    label: "Necesitas transporte?",
    required: false,
  },
]);

const CUSTOM_QUESTIONS = Object.freeze(
  RSVP_CUSTOM_IDS.map((id, index) => ({
    id,
    source: "custom",
    type: "short_text",
    label: `Pregunta personalizada ${index + 1}`,
    required: false,
  }))
);

export function listCatalogQuestionTemplates() {
  return [...CATALOG_QUESTIONS];
}

export function listQuestionTemplates() {
  return [...CATALOG_QUESTIONS, ...CUSTOM_QUESTIONS];
}

export function resolvePresetId(presetId) {
  if (typeof presetId !== "string") return "basic";
  return RSVP_PRESETS[presetId] ? presetId : "basic";
}

export function getPresetDefinition(presetId) {
  const resolved = resolvePresetId(presetId);
  return RSVP_PRESETS[resolved];
}

export function getQuestionTemplate(questionId) {
  if (typeof questionId !== "string") return null;
  const all = listQuestionTemplates();
  return all.find((question) => question.id === questionId) || null;
}

export function isCustomQuestionId(questionId) {
  return RSVP_CUSTOM_IDS.includes(questionId);
}

export function createQuestionsForPreset(presetId) {
  const preset = getPresetDefinition(presetId);
  const activeIds = new Set(preset.questionIds);
  const activeOrder = new Map(preset.questionIds.map((id, idx) => [id, idx]));
  const templates = listQuestionTemplates();

  return templates
    .map((template, index) => {
      const active = activeIds.has(template.id);
      const order = active
        ? activeOrder.get(template.id)
        : preset.questionIds.length + index;

      return {
        id: template.id,
        source: template.source,
        type: template.type,
        label: template.label,
        required: Boolean(template.required),
        active,
        order,
        options: Array.isArray(template.options)
          ? template.options.map((option) => ({
              id: option.id,
              label: option.label,
              metricTag: option.metricTag,
            }))
          : undefined,
      };
    })
    .sort((a, b) => a.order - b.order);
}
