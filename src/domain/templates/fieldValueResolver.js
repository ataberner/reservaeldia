const TARGET_TRANSFORM_KINDS = new Set([
  "identity",
  "date_to_countdown_iso",
  "date_to_text",
  "images_to_first_url",
]);

const DATE_LIKE_FIELD_TYPES = new Set(["date", "datetime"]);
const TEXTUAL_TARGET_PATHS = new Set(["texto", "text", "title", "label"]);
const IMAGE_TARGET_PATHS = new Set(["src", "url", "mediaurl", "fondoimagen"]);

export const DEFAULT_DATE_TEXT_TRANSFORM_PRESET = "event_date_long_es_ar";
export const DEFAULT_DATETIME_TEXT_TRANSFORM_PRESET = "event_datetime_long_es_ar";
export const DATE_TEXT_FORMAT_PRESETS = Object.freeze([
  "event_date_long_es_ar",
  "event_date_short_es_ar",
  "event_date_dotted_es_ar",
  "event_date_slash_short_year_es_ar",
  "event_date_pipe_short_year_es_ar",
  "event_date_day_month_es_ar",
  "event_datetime_long_es_ar",
  "event_datetime_short_es_ar",
]);
export const DATE_TEXT_FORMAT_PRESET_OPTIONS = Object.freeze([
  {
    value: "event_date_long_es_ar",
    label: "Fecha larga",
    example: "13 de diciembre de 2026",
  },
  {
    value: "event_date_short_es_ar",
    label: "Fecha corta",
    example: "13/12/2026",
  },
  {
    value: "event_date_dotted_es_ar",
    label: "Dia.mes.anio",
    example: "27.4.2026",
  },
  {
    value: "event_date_slash_short_year_es_ar",
    label: "D/M/AA",
    example: "2/7/26",
  },
  {
    value: "event_date_pipe_short_year_es_ar",
    label: "DD|MM|YY",
    example: "26|08|27",
  },
  {
    value: "event_date_day_month_es_ar",
    label: "Dia y mes",
    example: "13 de diciembre",
  },
  {
    value: "event_datetime_long_es_ar",
    label: "Fecha y hora larga",
    example: "13 de diciembre de 2026, 18:00",
  },
  {
    value: "event_datetime_short_es_ar",
    label: "Fecha y hora corta",
    example: "13/12/2026, 18:00",
  },
]);
const DATE_TEXT_FORMAT_PRESET_SET = new Set(DATE_TEXT_FORMAT_PRESETS);

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function sanitizeImageUrls(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
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

function formatShortDateText(date) {
  return `${padDateSegment(date.getDate())}/${padDateSegment(
    date.getMonth() + 1
  )}/${date.getFullYear()}`;
}

function formatDottedDateText(date) {
  return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
}

function formatPipeShortYearDateText(date) {
  const shortYear = String(date.getFullYear()).slice(-2);
  return `${padDateSegment(date.getDate())}|${padDateSegment(date.getMonth() + 1)}|${shortYear}`;
}

function formatSlashShortYearDateText(date) {
  const shortYear = String(date.getFullYear()).slice(-2);
  return `${date.getDate()}/${date.getMonth() + 1}/${shortYear}`;
}

function formatTimeText(date) {
  return `${padDateSegment(date.getHours())}:${padDateSegment(date.getMinutes())}`;
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

function shouldIncludeTimeInDateText(preset) {
  const safePreset = normalizeText(preset);

  if (
    safePreset === DEFAULT_DATETIME_TEXT_TRANSFORM_PRESET ||
    safePreset === "event_datetime_short_es_ar"
  ) {
    return true;
  }

  return false;
}

export function normalizeDateTextFormatPreset(preset, fieldType = "") {
  const safePreset = normalizeText(preset);
  if (DATE_TEXT_FORMAT_PRESET_SET.has(safePreset)) return safePreset;

  return normalizeText(fieldType).toLowerCase() === "datetime"
    ? DEFAULT_DATETIME_TEXT_TRANSFORM_PRESET
    : DEFAULT_DATE_TEXT_TRANSFORM_PRESET;
}

export function isDateTextFormatPreset(preset) {
  return DATE_TEXT_FORMAT_PRESET_SET.has(normalizeText(preset));
}

function formatDateTextPreset(date, preset, fieldType = "") {
  const safePreset = normalizeDateTextFormatPreset(preset, fieldType);
  const includeTime = shouldIncludeTimeInDateText(safePreset);

  if (safePreset === "event_date_long_es_ar") {
    return new Intl.DateTimeFormat("es-AR", buildDateTextFormatOptions(includeTime)).format(date);
  }

  if (safePreset === "event_date_short_es_ar") {
    return includeTime
      ? `${formatShortDateText(date)}, ${formatTimeText(date)}`
      : formatShortDateText(date);
  }

  if (safePreset === "event_date_dotted_es_ar") {
    return formatDottedDateText(date);
  }

  if (safePreset === "event_date_slash_short_year_es_ar") {
    return formatSlashShortYearDateText(date);
  }

  if (safePreset === "event_date_pipe_short_year_es_ar") {
    return formatPipeShortYearDateText(date);
  }

  if (safePreset === "event_date_day_month_es_ar") {
    return new Intl.DateTimeFormat("es-AR", {
      day: "numeric",
      month: "long",
    }).format(date);
  }

  if (safePreset === DEFAULT_DATETIME_TEXT_TRANSFORM_PRESET) {
    return new Intl.DateTimeFormat("es-AR", buildDateTextFormatOptions(true)).format(date);
  }

  if (safePreset === "event_datetime_short_es_ar") {
    return `${formatShortDateText(date)}, ${formatTimeText(date)}`;
  }

  return new Intl.DateTimeFormat("es-AR", buildDateTextFormatOptions(includeTime)).format(date);
}

export function isDateLikeTemplateFieldType(fieldType) {
  return DATE_LIKE_FIELD_TYPES.has(normalizeText(fieldType).toLowerCase());
}

export function isTextualTemplateTargetPath(path) {
  return TEXTUAL_TARGET_PATHS.has(normalizeText(path).toLowerCase());
}

export function isImageTemplateTargetPath(path) {
  return IMAGE_TARGET_PATHS.has(normalizeText(path).toLowerCase());
}

export function normalizeTemplateTargetTransform(rawTransform, fieldType = "") {
  const source = asObject(rawTransform);
  const kind = normalizeText(source.kind).toLowerCase();
  if (!kind || !TARGET_TRANSFORM_KINDS.has(kind)) return undefined;

  if (kind === "date_to_text") {
    return {
      kind,
      preset: normalizeDateTextFormatPreset(source.preset, fieldType),
    };
  }

  return { kind };
}

export function normalizeTemplateTargetTransformWithFallback(
  rawTransform,
  fieldType = "",
  fallbackPreset = ""
) {
  const source = asObject(rawTransform);
  const kind = normalizeText(source.kind).toLowerCase();
  if (!kind || !TARGET_TRANSFORM_KINDS.has(kind)) return undefined;

  if (kind === "date_to_text") {
    return {
      kind,
      preset: isDateTextFormatPreset(source.preset)
        ? normalizeText(source.preset)
        : normalizeDateTextFormatPreset(fallbackPreset, fieldType),
    };
  }

  return { kind };
}

export function resolveFieldDateTextFormatPreset(field) {
  const safeField = asObject(field);
  const ownPreset = normalizeText(safeField.dateTextFormatPreset);
  if (DATE_TEXT_FORMAT_PRESET_SET.has(ownPreset)) return ownPreset;

  const targets = Array.isArray(safeField.applyTargets) ? safeField.applyTargets : [];
  for (const target of targets) {
    if (!isTextualTemplateTargetPath(target?.path)) continue;
    const transform = asObject(target?.transform);
    const preset = normalizeText(transform.preset);
    if (
      normalizeText(transform.kind).toLowerCase() === "date_to_text" &&
      DATE_TEXT_FORMAT_PRESET_SET.has(preset)
    ) {
      return preset;
    }
  }

  return normalizeDateTextFormatPreset("", safeField.type);
}

export function buildDateTextTransformForField(field, preset = "") {
  return {
    kind: "date_to_text",
    preset: normalizeDateTextFormatPreset(
      preset || field?.dateTextFormatPreset,
      field?.type
    ),
  };
}

export function buildSuggestedTemplateTargetTransform({ field, fieldType, path } = {}) {
  const safeField = asObject(field);
  const resolvedFieldType = normalizeText(fieldType || safeField.type);
  const safePath = normalizeText(path);
  if (!safePath) return undefined;

  if (resolvedFieldType.toLowerCase() === "images" && isImageTemplateTargetPath(safePath)) {
    return {
      kind: "images_to_first_url",
    };
  }

  if (safePath.toLowerCase() === "fechaobjetivo") {
    return {
      kind: "date_to_countdown_iso",
    };
  }

  if (isDateLikeTemplateFieldType(resolvedFieldType) && isTextualTemplateTargetPath(safePath)) {
    return buildDateTextTransformForField(
      Object.keys(safeField).length
        ? { ...safeField, type: resolvedFieldType }
        : { type: resolvedFieldType }
    );
  }

  return undefined;
}

export function resolveEffectiveTemplateTargetTransform({ field, target } = {}) {
  const explicitTransform = normalizeTemplateTargetTransformWithFallback(
    target?.transform,
    field?.type,
    field?.dateTextFormatPreset
  );
  if (explicitTransform) return explicitTransform;

  const safePath = normalizeText(target?.path).toLowerCase();
  if (normalizeText(field?.type).toLowerCase() === "images" && isImageTemplateTargetPath(safePath)) {
    return {
      kind: "images_to_first_url",
    };
  }
  if (safePath === "fechaobjetivo") {
    return {
      kind: "date_to_countdown_iso",
    };
  }
  if (isDateLikeTemplateFieldType(field?.type) && isTextualTemplateTargetPath(safePath)) {
    return {
      kind: "date_to_text",
      preset: normalizeDateTextFormatPreset(field?.dateTextFormatPreset, field?.type),
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

export function resolveFirstTemplateImageUrl(value) {
  return sanitizeImageUrls(value)[0] || "";
}

export function resolveTemplateTargetValue({ field, target, value } = {}) {
  const transform = resolveEffectiveTemplateTargetTransform({ field, target });

  if (transform.kind === "date_to_countdown_iso") {
    return normalizeCountdownDateValue(value);
  }

  if (transform.kind === "date_to_text") {
    return formatTemplateDateTextValue(value, transform.preset, field?.type);
  }

  if (transform.kind === "images_to_first_url") {
    return resolveFirstTemplateImageUrl(value);
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
