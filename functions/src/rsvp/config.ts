export type RsvpQuestionSource = "catalog" | "custom";
export type RsvpQuestionType =
  | "short_text"
  | "long_text"
  | "number"
  | "single_select"
  | "boolean"
  | "phone";

export type RsvpQuestionOption = {
  id: string;
  label: string;
  metricTag?: string;
};

export type RsvpQuestion = {
  id: string;
  source: RsvpQuestionSource;
  type: RsvpQuestionType;
  label: string;
  required: boolean;
  active: boolean;
  order: number;
  options?: RsvpQuestionOption[];
};

export type RsvpPresetId = "basic" | "wedding_complete" | "minimal";

export type RsvpConfigV2 = {
  version: 2;
  enabled: boolean;
  presetId: RsvpPresetId;
  limits: {
    maxQuestions: number;
    maxCustomQuestions: number;
  };
  modal: {
    title: string;
    subtitle: string;
    submitLabel: string;
    primaryColor: string;
  };
  questions: RsvpQuestion[];
  sheetUrl?: string;
};

export type RSVPConfig = RsvpConfigV2;

const RSVP_VERSION = 2;
const RSVP_LIMITS = Object.freeze({
  maxQuestions: 12,
  maxCustomQuestions: 2,
});

const CUSTOM_IDS = ["custom_1", "custom_2"] as const;

type QuestionTemplate = {
  id: string;
  source: RsvpQuestionSource;
  type: RsvpQuestionType;
  label: string;
  required: boolean;
  options?: RsvpQuestionOption[];
};

const PRESET_QUESTION_IDS: Record<RsvpPresetId, string[]> = {
  basic: ["full_name", "attendance", "party_size"],
  wedding_complete: [
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
  minimal: ["full_name", "attendance"],
};

const QUESTION_TEMPLATES: QuestionTemplate[] = [
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
  ...CUSTOM_IDS.map((id, index) => ({
    id,
    source: "custom" as const,
    type: "short_text" as const,
    label: `Pregunta personalizada ${index + 1}`,
    required: false,
  })),
];

const DEFAULT_MODAL = {
  title: "Confirmar asistencia",
  subtitle: "Completa el formulario para confirmar tu presencia.",
  submitLabel: "Enviar",
  primaryColor: "#773dbe",
};

function sanitizeText(value: unknown, fallback: string, maxLength = 120): string {
  if (value === null || typeof value === "undefined") return fallback;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.slice(0, maxLength);
}

function sanitizeLongText(value: unknown, fallback: string, maxLength = 240): string {
  if (value === null || typeof value === "undefined") return fallback;
  const text = String(value).trim();
  if (!text) return fallback;
  return text.slice(0, maxLength);
}

function sanitizeColor(value: unknown, fallback: string): string {
  const text = sanitizeText(value, "", 32);
  if (/^#[0-9a-fA-F]{3}$/.test(text) || /^#[0-9a-fA-F]{6}$/.test(text)) {
    return text;
  }
  return fallback;
}

function sanitizeLimit(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function toOrder(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function resolvePresetId(value: unknown): RsvpPresetId {
  if (value === "wedding_complete" || value === "minimal" || value === "basic") {
    return value;
  }
  return "basic";
}

function isCustomQuestionId(id: string): boolean {
  return CUSTOM_IDS.includes(id as (typeof CUSTOM_IDS)[number]);
}

function cloneTemplate(template: QuestionTemplate, active: boolean, order: number): RsvpQuestion {
  const options = Array.isArray(template.options)
    ? template.options.map((option) => ({
        id: option.id,
        label: option.label,
        ...(typeof option.metricTag === "string" && option.metricTag
          ? { metricTag: option.metricTag }
          : {}),
      }))
    : undefined;

  return {
    id: template.id,
    source: template.source,
    type: template.type,
    label: template.label,
    required: template.required,
    active,
    order,
    ...(options ? { options } : {}),
  };
}

function createPresetQuestions(presetId: RsvpPresetId): RsvpQuestion[] {
  const activeSet = new Set(PRESET_QUESTION_IDS[presetId]);
  const activeOrder = new Map(PRESET_QUESTION_IDS[presetId].map((id, idx) => [id, idx]));

  return QUESTION_TEMPLATES.map((template, index) => {
    const active = activeSet.has(template.id);
    const order = active
      ? activeOrder.get(template.id) ?? index
      : PRESET_QUESTION_IDS[presetId].length + index;
    return cloneTemplate(template, active, order);
  }).sort((a, b) => a.order - b.order);
}

function buildOptions(
  templateOptions: RsvpQuestionOption[] | undefined,
  incomingOptions: unknown
): RsvpQuestionOption[] | undefined {
  if (!Array.isArray(templateOptions) || templateOptions.length === 0) return undefined;

  const incomingById = new Map<string, Record<string, unknown>>();
  if (Array.isArray(incomingOptions)) {
    for (const raw of incomingOptions) {
      if (!raw || typeof raw !== "object") continue;
      const rawId = (raw as Record<string, unknown>).id;
      if (typeof rawId !== "string" || !rawId) continue;
      incomingById.set(rawId, raw as Record<string, unknown>);
    }
  }

  const nextOptions = templateOptions.map((option) => {
    const incoming = incomingById.get(option.id);
    return {
      id: option.id,
      label: sanitizeText(incoming?.label, option.label, 80),
      ...(typeof option.metricTag === "string" && option.metricTag
        ? { metricTag: option.metricTag }
        : {}),
    };
  });

  return nextOptions.length ? nextOptions : undefined;
}

function sanitizeQuestion(
  fallbackQuestion: RsvpQuestion,
  incomingQuestion: unknown,
  fallbackOrder: number
): RsvpQuestion {
  const incoming = incomingQuestion && typeof incomingQuestion === "object"
    ? incomingQuestion as Record<string, unknown>
    : {};

  const template = QUESTION_TEMPLATES.find((question) => question.id === fallbackQuestion.id) || {
    id: fallbackQuestion.id,
    source: fallbackQuestion.source,
    type: fallbackQuestion.type,
    label: fallbackQuestion.label,
    required: fallbackQuestion.required,
    options: fallbackQuestion.options,
  };

  const custom = isCustomQuestionId(template.id);
  const source: RsvpQuestionSource = custom ? "custom" : "catalog";

  const requestedType = incoming.type;
  const type: RsvpQuestionType = custom
    ? (requestedType === "long_text" ? "long_text" : "short_text")
    : fallbackQuestion.type;

  const options = buildOptions(template.options, incoming.options);

  return {
    id: template.id,
    source,
    type,
    label: sanitizeText(incoming.label, fallbackQuestion.label, 120),
    required: Boolean(incoming.required),
    active: Boolean(incoming.active),
    order: toOrder(incoming.order, fallbackOrder),
    ...(options ? { options } : {}),
  };
}

function enforceLimits(questions: RsvpQuestion[], limits: { maxQuestions: number; maxCustomQuestions: number }): RsvpQuestion[] {
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  let activeCount = 0;
  let customCount = 0;

  return sorted.map((question) => {
    if (!question.active) return question;

    if (activeCount >= limits.maxQuestions) {
      return { ...question, active: false };
    }

    if (question.source === "custom" && customCount >= limits.maxCustomQuestions) {
      return { ...question, active: false };
    }

    activeCount += 1;
    if (question.source === "custom") customCount += 1;

    return question;
  });
}

function normalizeQuestionOrder(questions: RsvpQuestion[]): RsvpQuestion[] {
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

export function isRsvpConfigV2(value: unknown): value is RsvpConfigV2 {
  return Boolean(
    value &&
      typeof value === "object" &&
      Number((value as Record<string, unknown>).version) === RSVP_VERSION &&
      Array.isArray((value as Record<string, unknown>).questions)
  );
}

export function normalizeRsvpConfig(value: unknown): RsvpConfigV2 {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};

  const presetId = resolvePresetId(raw.presetId);
  const baseQuestions = createPresetQuestions(presetId);

  const incomingQuestions = Array.isArray(raw.questions) ? raw.questions : [];
  const incomingById = new Map<string, unknown>();
  for (const question of incomingQuestions) {
    if (!question || typeof question !== "object") continue;
    const rawId = (question as Record<string, unknown>).id;
    if (typeof rawId !== "string" || !rawId) continue;
    incomingById.set(rawId, question);
  }

  const legacyTitle = sanitizeText(raw.title, DEFAULT_MODAL.title, 80);
  const legacySubtitle = sanitizeLongText(raw.subtitle, DEFAULT_MODAL.subtitle, 160);
  const legacySubmitLabel = sanitizeText(raw.buttonText, DEFAULT_MODAL.submitLabel, 30);
  const legacyColor = sanitizeColor(raw.primaryColor, DEFAULT_MODAL.primaryColor);

  const modalRaw = raw.modal && typeof raw.modal === "object"
    ? raw.modal as Record<string, unknown>
    : {};

  const modal = {
    title: sanitizeText(modalRaw.title, legacyTitle, 80),
    subtitle: sanitizeLongText(modalRaw.subtitle, legacySubtitle, 160),
    submitLabel: sanitizeText(modalRaw.submitLabel, legacySubmitLabel, 30),
    primaryColor: sanitizeColor(modalRaw.primaryColor, legacyColor),
  };

  const limitsRaw = raw.limits && typeof raw.limits === "object"
    ? raw.limits as Record<string, unknown>
    : {};

  const limits = {
    maxQuestions: sanitizeLimit(
      limitsRaw.maxQuestions,
      RSVP_LIMITS.maxQuestions,
      1,
      RSVP_LIMITS.maxQuestions
    ),
    maxCustomQuestions: sanitizeLimit(
      limitsRaw.maxCustomQuestions,
      RSVP_LIMITS.maxCustomQuestions,
      0,
      RSVP_LIMITS.maxCustomQuestions
    ),
  };

  const questions = baseQuestions.map((question, index) =>
    sanitizeQuestion(question, incomingById.get(question.id), index)
  );

  const sheetUrl = sanitizeLongText(raw.sheetUrl, "", 400);

  return {
    version: RSVP_VERSION,
    enabled: raw.enabled !== false,
    presetId,
    limits,
    modal,
    questions: normalizeQuestionOrder(enforceLimits(questions, limits)),
    ...(sheetUrl ? { sheetUrl } : {}),
  };
}

export function getActiveQuestions(config: RsvpConfigV2): RsvpQuestion[] {
  return [...config.questions]
    .filter((question) => question.active)
    .sort((a, b) => a.order - b.order);
}
