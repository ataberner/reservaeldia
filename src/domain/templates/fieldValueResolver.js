const TARGET_TRANSFORM_KINDS = new Set([
  "identity",
  "date_to_countdown_iso",
  "date_to_text",
]);

const DATE_LIKE_FIELD_TYPES = new Set(["date", "datetime"]);
const TEXTUAL_TARGET_PATHS = new Set(["texto", "text", "title", "label"]);

export const DEFAULT_DATE_TEXT_TRANSFORM_PRESET = "event_date_long_es_ar";
export const DEFAULT_DATETIME_TEXT_TRANSFORM_PRESET = "event_datetime_long_es_ar";

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function padDateSegment(value) {
  return String(value).padStart(2, "0");
}

function formatDateInputValue(date) {
  return `${date.getFullYear()}-${padDateSegment(date.getMonth() + 1)}-${padDateSegment(
    date.getDate()
  )}`;
}

function formatDateTimeInputValue(date) {
  return `${formatDateInputValue(date)}T${padDateSegment(date.getHours())}:${padDateSegment(
    date.getMinutes()
  )}`;
}

function parseTemplateDateValue(value) {
  const raw = normalizeText(value);
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    return {
      raw,
      date: parsed,
      inputDate: raw,
      inputDateTime: `${raw}T00:00`,
    };
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return {
      raw,
      date: parsed,
      inputDate: raw.slice(0, 10),
      inputDateTime: raw.slice(0, 16),
    };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  return {
    raw,
    date: parsed,
    inputDate: formatDateInputValue(parsed),
    inputDateTime: formatDateTimeInputValue(parsed),
  };
}

function buildDateTextFormatOptions(includeTime = false) {
  if (includeTime) {
    return {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    };
  }

  return {
    day: "numeric",
    month: "long",
    year: "numeric",
  };
}

function shouldIncludeTimeInDateText(fieldType, preset) {
  const safeFieldType = normalizeText(fieldType).toLowerCase();
  const safePreset = normalizeText(preset);

  if (safePreset === DEFAULT_DATETIME_TEXT_TRANSFORM_PRESET) {
    return true;
  }

  // Compatibilidad backward: las plantillas viejas guardaban el preset date-only
  // incluso para fields datetime, pero el comportamiento esperado es mostrar ambos.
  if (safeFieldType === "datetime") {
    return true;
  }

  return false;
}

function formatDateTextPreset(date, preset, fieldType = "") {
  const safePreset = normalizeText(preset) || DEFAULT_DATE_TEXT_TRANSFORM_PRESET;
  const includeTime = shouldIncludeTimeInDateText(fieldType, safePreset);

  if (safePreset === "event_date_long_es_ar") {
    return new Intl.DateTimeFormat("es-AR", buildDateTextFormatOptions(includeTime)).format(date);
  }

  if (safePreset === DEFAULT_DATETIME_TEXT_TRANSFORM_PRESET) {
    return new Intl.DateTimeFormat("es-AR", buildDateTextFormatOptions(true)).format(date);
  }

  return new Intl.DateTimeFormat("es-AR", buildDateTextFormatOptions(includeTime)).format(date);
}

export function isDateLikeTemplateFieldType(fieldType) {
  return DATE_LIKE_FIELD_TYPES.has(normalizeText(fieldType).toLowerCase());
}

export function isTextualTemplateTargetPath(path) {
  return TEXTUAL_TARGET_PATHS.has(normalizeText(path).toLowerCase());
}

export function normalizeTemplateTargetTransform(rawTransform) {
  const source = asObject(rawTransform);
  const kind = normalizeText(source.kind).toLowerCase();
  if (!kind || !TARGET_TRANSFORM_KINDS.has(kind)) return undefined;

  if (kind === "date_to_text") {
    return {
      kind,
      preset: normalizeText(source.preset) || DEFAULT_DATE_TEXT_TRANSFORM_PRESET,
    };
  }

  return { kind };
}

export function buildSuggestedTemplateTargetTransform({ fieldType, path } = {}) {
  const safePath = normalizeText(path);
  if (!safePath) return undefined;

  if (safePath.toLowerCase() === "fechaobjetivo") {
    return {
      kind: "date_to_countdown_iso",
    };
  }

  if (isDateLikeTemplateFieldType(fieldType) && isTextualTemplateTargetPath(safePath)) {
    return {
      kind: "date_to_text",
      preset:
        normalizeText(fieldType).toLowerCase() === "datetime"
          ? DEFAULT_DATETIME_TEXT_TRANSFORM_PRESET
          : DEFAULT_DATE_TEXT_TRANSFORM_PRESET,
    };
  }

  return undefined;
}

export function resolveEffectiveTemplateTargetTransform({ field, target } = {}) {
  const explicitTransform = normalizeTemplateTargetTransform(target?.transform);
  if (explicitTransform) return explicitTransform;

  const safePath = normalizeText(target?.path).toLowerCase();
  if (safePath === "fechaobjetivo") {
    return {
      kind: "date_to_countdown_iso",
    };
  }

  return {
    kind: "identity",
  };
}

export function normalizeCountdownDateValue(value) {
  const parsed = parseTemplateDateValue(value);
  if (!parsed) return normalizeText(value);
  return parsed.date.toISOString();
}

export function formatTemplateDateTextValue(
  value,
  preset = DEFAULT_DATE_TEXT_TRANSFORM_PRESET,
  fieldType = ""
) {
  const parsed = parseTemplateDateValue(value);
  if (!parsed) return String(value ?? "");
  return formatDateTextPreset(parsed.date, preset, fieldType);
}

export function resolveTemplateTargetValue({ field, target, value } = {}) {
  const transform = resolveEffectiveTemplateTargetTransform({ field, target });

  if (transform.kind === "date_to_countdown_iso") {
    return normalizeCountdownDateValue(value);
  }

  if (transform.kind === "date_to_text") {
    return formatTemplateDateTextValue(value, transform.preset, field?.type);
  }

  return value;
}

export function resolveTemplateTargetValuePair({
  field,
  target,
  nextValue,
  defaultValue,
} = {}) {
  return {
    nextValue: resolveTemplateTargetValue({
      field,
      target,
      value: nextValue,
    }),
    defaultValue: resolveTemplateTargetValue({
      field,
      target,
      value: defaultValue,
    }),
  };
}

export function normalizeTemplateInputValueForFieldType(fieldType, value) {
  const safeType = normalizeText(fieldType).toLowerCase();

  if (safeType === "date") {
    const parsed = parseTemplateDateValue(value);
    return parsed?.inputDate || "";
  }

  if (safeType === "datetime") {
    const parsed = parseTemplateDateValue(value);
    return parsed?.inputDateTime || "";
  }

  if (value === null || typeof value === "undefined") {
    return "";
  }

  return String(value);
}
