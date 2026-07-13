import {
  findRenderObjectById,
} from "../editor/renderObjectTree.js";
import {
  EVENT_DETAIL_FEATURES,
  getEventDetailFeatureLabel,
  normalizeEventDetailFeature,
} from "./features.js";
import {
  DEFAULT_DATE_TEXT_TRANSFORM_PRESET,
  isDateLikeTemplateFieldType,
  isTextualTemplateTargetPath,
  normalizeDateTextFormatPreset,
} from "../templates/fieldValueResolver.js";

export const EVENT_DATE_FIELD_KEYS = Object.freeze({
  [EVENT_DETAIL_FEATURES.CEREMONY]: "event_ceremony_date",
  [EVENT_DETAIL_FEATURES.PARTY]: "event_party_date",
});

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeComparableText(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function padDateSegment(value) {
  return String(value).padStart(2, "0");
}

const SPANISH_MONTH_BY_NAME = Object.freeze({
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
});

function buildDateInputValue({ year, month, day } = {}) {
  const safeYear = Number(year);
  const safeMonth = Number(month);
  const safeDay = Number(day);
  if (
    !Number.isInteger(safeYear) ||
    !Number.isInteger(safeMonth) ||
    !Number.isInteger(safeDay) ||
    safeYear < 1000 ||
    safeMonth < 1 ||
    safeMonth > 12 ||
    safeDay < 1 ||
    safeDay > 31
  ) {
    return "";
  }

  const parsed = new Date(safeYear, safeMonth - 1, safeDay);
  if (
    parsed.getFullYear() !== safeYear ||
    parsed.getMonth() !== safeMonth - 1 ||
    parsed.getDate() !== safeDay
  ) {
    return "";
  }

  return `${safeYear}-${padDateSegment(safeMonth)}-${padDateSegment(safeDay)}`;
}

function expandTwoDigitYear(year) {
  const safeYear = Number(year);
  if (!Number.isInteger(safeYear) || safeYear < 0 || safeYear > 99) return "";
  return 2000 + safeYear;
}

function parsePath(path) {
  const source = normalizeText(path);
  if (!source) return [];

  return source
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function readObjectPathValue(object, path) {
  const segments = parsePath(path);
  if (!segments.length) return "";

  let current = object;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return "";
    current = current[segment];
  }

  if (typeof current === "string") return current;
  if (typeof current === "number" || typeof current === "boolean") {
    return String(current);
  }
  return "";
}

export function normalizeVisibleEventDateValue(value) {
  const raw = normalizeText(value);
  if (!raw) return "";

  const isoDateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnlyMatch) {
    return buildDateInputValue({
      year: isoDateOnlyMatch[1],
      month: isoDateOnlyMatch[2],
      day: isoDateOnlyMatch[3],
    });
  }

  const slashDateMatch = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D.*)?$/
  );
  if (slashDateMatch) {
    return buildDateInputValue({
      day: slashDateMatch[1],
      month: slashDateMatch[2],
      year: slashDateMatch[3],
    });
  }

  const dottedDateMatch = raw.match(
    /^(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})(?:\D.*)?$/
  );
  if (dottedDateMatch) {
    return buildDateInputValue({
      day: dottedDateMatch[1],
      month: dottedDateMatch[2],
      year: dottedDateMatch[3],
    });
  }

  const pipeShortYearDateMatch = raw.match(
    /^(\d{1,2})\|(\d{1,2})\|(\d{2})(?:\D.*)?$/
  );
  if (pipeShortYearDateMatch) {
    return buildDateInputValue({
      day: pipeShortYearDateMatch[1],
      month: pipeShortYearDateMatch[2],
      year: expandTwoDigitYear(pipeShortYearDateMatch[3]),
    });
  }

  const comparableRaw = normalizeComparableText(raw);
  const spanishDateMatch = comparableRaw.match(
    /^(\d{1,2}) de ([a-z]+) de (\d{4})(?: .*)?$/
  );
  if (spanishDateMatch) {
    return buildDateInputValue({
      day: spanishDateMatch[1],
      month: SPANISH_MONTH_BY_NAME[spanishDateMatch[2]],
      year: spanishDateMatch[3],
    });
  }

  if (/^\d{1,2} de [a-z]+(?: \d{1,2} \d{2})?$/.test(comparableRaw)) {
    return "";
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";

  return buildDateInputValue({
    year: parsed.getFullYear(),
    month: parsed.getMonth() + 1,
    day: parsed.getDate(),
  });
}

export function resolveEventDateValueFromTextTargets({ field, objetos } = {}) {
  const targets = Array.isArray(field?.applyTargets) ? field.applyTargets : [];

  for (const target of targets) {
    if (normalizeText(target?.scope).toLowerCase() !== "objeto") continue;
    if (!isTextualTemplateTargetPath(target?.path)) continue;

    const targetObject = findRenderObjectById(objetos, target?.id);
    const value = normalizeVisibleEventDateValue(
      readObjectPathValue(targetObject, target?.path)
    );
    if (value) return value;
  }

  return "";
}

function hasTextualTarget(field) {
  const safeField = asObject(field);
  return (Array.isArray(safeField.applyTargets) ? safeField.applyTargets : [])
    .some((target) => isTextualTemplateTargetPath(target?.path));
}

function isEventDateNamedField(field) {
  const safeField = asObject(field);
  const signature = normalizeComparableText(
    `${safeField.key || ""} ${safeField.label || ""} ${safeField.eventDetailsRole || ""}`
  );
  return (
    isEventDateField(safeField) ||
    signature.includes("ceremony date") ||
    signature.includes("party date") ||
    signature.includes("fecha ceremonia") ||
    signature.includes("fecha de la ceremonia") ||
    signature.includes("fecha fiesta") ||
    signature.includes("fecha de la fiesta")
  );
}

function isEventDateNamedFieldForFeature(
  field,
  feature = EVENT_DETAIL_FEATURES.CEREMONY
) {
  if (!isEventDateNamedField(field)) return false;
  const safeFeature = normalizeEventDetailFeature(feature);
  const safeField = asObject(field);
  const signature = normalizeComparableText(
    `${safeField.key || ""} ${safeField.label || ""} ${safeField.eventDetailsRole || ""}`
  );
  if (safeFeature === EVENT_DETAIL_FEATURES.PARTY) {
    return (
      signature.includes("party date") ||
      signature.includes("fecha fiesta") ||
      signature.includes("fecha de la fiesta")
    );
  }
  return (
    signature.includes("ceremony date") ||
    signature.includes("fecha ceremonia") ||
    signature.includes("fecha de la ceremonia")
  );
}

export function getEventDateFieldKey(feature = EVENT_DETAIL_FEATURES.CEREMONY) {
  return EVENT_DATE_FIELD_KEYS[normalizeEventDetailFeature(feature)] || EVENT_DATE_FIELD_KEYS.ceremony;
}

export function getEventDateFieldRole(feature = EVENT_DETAIL_FEATURES.CEREMONY) {
  return `${normalizeEventDetailFeature(feature)}_date`;
}

export function resolveEventDateFieldFeature(field) {
  const safeField = asObject(field);
  const key = normalizeText(safeField.key);
  const role = normalizeText(safeField.eventDetailsRole).toLowerCase();
  if (key === EVENT_DATE_FIELD_KEYS.party || role === "party_date") {
    return EVENT_DETAIL_FEATURES.PARTY;
  }
  return EVENT_DETAIL_FEATURES.CEREMONY;
}

export function isEventDateField(field, feature = null) {
  const safeField = asObject(field);
  const key = normalizeText(safeField.key);
  const role = normalizeText(safeField.eventDetailsRole).toLowerCase();
  const isKnown =
    Object.values(EVENT_DATE_FIELD_KEYS).includes(key) ||
    role === "ceremony_date" ||
    role === "party_date";
  if (!isKnown) return false;
  if (!feature) return true;
  return resolveEventDateFieldFeature(safeField) === normalizeEventDetailFeature(feature);
}

export function buildEventDateField(feature = EVENT_DETAIL_FEATURES.CEREMONY) {
  const safeFeature = normalizeEventDetailFeature(feature);
  const featureLabel = getEventDetailFeatureLabel(safeFeature).toLowerCase();
  return {
    key: getEventDateFieldKey(safeFeature),
    label: `Fecha de la ${featureLabel}`,
    type: "date",
    group: getEventDetailFeatureLabel(safeFeature),
    optional: false,
    eventDetailsRole: getEventDateFieldRole(safeFeature),
    dateTextFormatPreset: DEFAULT_DATE_TEXT_TRANSFORM_PRESET,
    applyTargets: [],
  };
}

export function ensureEventDateField({
  fieldsSchema,
  feature = EVENT_DETAIL_FEATURES.CEREMONY,
} = {}) {
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const safeFeature = normalizeEventDetailFeature(feature);
  const templateField = buildEventDateField(safeFeature);
  let changed = false;
  let field = null;
  const nextFields = fields.map((entry) => {
    const current = asObject(entry);
    if (!isEventDateField(current, safeFeature)) return entry;

    const patched = {
      ...current,
      key: templateField.key,
      label: normalizeText(current.label) || templateField.label,
      type: "date",
      group: normalizeText(current.group) || templateField.group,
      optional:
        typeof current.optional === "boolean"
          ? current.optional
          : templateField.optional,
      eventDetailsRole: templateField.eventDetailsRole,
      dateTextFormatPreset: normalizeDateTextFormatPreset(
        current.dateTextFormatPreset,
        "date"
      ),
      applyTargets: Array.isArray(current.applyTargets)
        ? current.applyTargets
        : [],
    };
    if (JSON.stringify(patched) !== JSON.stringify(current)) {
      changed = true;
    }
    field = patched;
    return patched;
  });

  if (!field) {
    field = templateField;
    nextFields.push(templateField);
    changed = true;
  }

  return {
    fieldsSchema: nextFields,
    field,
    changed,
  };
}

export function findEventDateSidebarField(fieldsSchema) {
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const dateLikeTextFields = fields.filter((field) => {
    const safeField = asObject(field);
    return isDateLikeTemplateFieldType(safeField.type) && hasTextualTarget(safeField);
  });
  return (
    fields.find((field) => isEventDateField(field) && hasTextualTarget(field)) ||
    dateLikeTextFields.find((field) => isEventDateNamedField(field)) ||
    fields.find((field) => isEventDateField(field)) ||
    dateLikeTextFields[0] ||
    null
  );
}

export function findEventDateSidebarFieldForFeature(
  fieldsSchema,
  feature = EVENT_DETAIL_FEATURES.CEREMONY
) {
  const safeFeature = normalizeEventDetailFeature(feature);
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const dateLikeTextFields = fields.filter((field) => {
    const safeField = asObject(field);
    return isDateLikeTemplateFieldType(safeField.type) && hasTextualTarget(safeField);
  });
  return (
    fields.find((field) => isEventDateField(field, safeFeature) && hasTextualTarget(field)) ||
    dateLikeTextFields.find((field) => isEventDateNamedFieldForFeature(field, safeFeature)) ||
    fields.find((field) => isEventDateField(field, safeFeature)) ||
    null
  );
}

export function resolveEventDateSidebarBinding({
  fieldsSchema,
  defaults,
  countdownDetails,
  objetos,
  feature = EVENT_DETAIL_FEATURES.CEREMONY,
} = {}) {
  const safeDefaults = asObject(defaults);
  const safeFeature = normalizeEventDetailFeature(feature);
  const eventDateField = findEventDateSidebarFieldForFeature(fieldsSchema, safeFeature);
  const countdownField =
    countdownDetails?.field &&
    typeof countdownDetails.field === "object" &&
    !Array.isArray(countdownDetails.field)
      ? countdownDetails.field
      : null;
  const field =
    eventDateField ||
    (countdownField && isEventDateField(countdownField, safeFeature)
      ? countdownField
      : null);
  const fieldKey =
    normalizeText(field?.key) ||
    normalizeText(countdownDetails?.fieldKey);
  const countdownFieldKey = normalizeText(countdownDetails?.fieldKey);
  const targetISO =
    resolveEventDateValueFromTextTargets({ field, objetos }) ||
    normalizeText(safeDefaults[fieldKey]) ||
    normalizeText(safeDefaults[countdownFieldKey]) ||
    normalizeText(countdownDetails?.targetISO);

  return {
    field,
    fieldKey,
    targetISO,
    hasBinding: Boolean(fieldKey),
    hasEventDateField: Boolean(eventDateField),
  };
}
