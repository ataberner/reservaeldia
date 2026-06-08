import {
  DEFAULT_DATE_TEXT_TRANSFORM_PRESET,
  isDateLikeTemplateFieldType,
  isTextualTemplateTargetPath,
  normalizeDateTextFormatPreset,
} from "../templates/fieldValueResolver.js";

export const EVENT_DATE_FIELD_KEY = "event_date";

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
    signature.includes("event date") ||
    signature.includes("fecha evento") ||
    signature.includes("fecha del evento")
  );
}

export function getEventDateFieldKey() {
  return EVENT_DATE_FIELD_KEY;
}

export function isEventDateField(field) {
  return normalizeText(asObject(field).key) === EVENT_DATE_FIELD_KEY;
}

export function buildEventDateField() {
  return {
    key: EVENT_DATE_FIELD_KEY,
    label: "Fecha del evento",
    type: "date",
    group: "Datos principales",
    optional: false,
    dateTextFormatPreset: DEFAULT_DATE_TEXT_TRANSFORM_PRESET,
    applyTargets: [],
  };
}

export function ensureEventDateField({ fieldsSchema } = {}) {
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const templateField = buildEventDateField();
  let changed = false;
  let field = null;
  const nextFields = fields.map((entry) => {
    const current = asObject(entry);
    if (!isEventDateField(current)) return entry;

    const patched = {
      ...current,
      type: "date",
      group: normalizeText(current.group) || templateField.group,
      optional:
        typeof current.optional === "boolean"
          ? current.optional
          : templateField.optional,
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

export function resolveEventDateSidebarBinding({
  fieldsSchema,
  defaults,
  countdownDetails,
} = {}) {
  const safeDefaults = asObject(defaults);
  const eventDateField = findEventDateSidebarField(fieldsSchema);
  const countdownField =
    countdownDetails?.field &&
    typeof countdownDetails.field === "object" &&
    !Array.isArray(countdownDetails.field)
      ? countdownDetails.field
      : null;
  const field = eventDateField || countdownField || null;
  const fieldKey =
    normalizeText(field?.key) ||
    normalizeText(countdownDetails?.fieldKey);
  const countdownFieldKey = normalizeText(countdownDetails?.fieldKey);
  const targetISO =
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
