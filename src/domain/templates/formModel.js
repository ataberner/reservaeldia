import { ensureDefaultsForSchema } from "../../../shared/templates/contract.js";
import { normalizeTemplateInputValueForFieldType } from "./fieldValueResolver.js";

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeFieldType(value) {
  const token = normalizeText(value).toLowerCase();
  if (!token) return "text";
  return token;
}

function normalizeFieldUpdateMode(rawMode, field) {
  const token = normalizeText(rawMode).toLowerCase();
  if (token === "input" || token === "blur" || token === "confirm") return token;

  const type = normalizeFieldType(field?.type);
  const group = normalizeText(field?.group);

  if (type === "images") return "confirm";
  if (
    type === "date" ||
    type === "time" ||
    type === "datetime" ||
    type === "location" ||
    type === "url"
  ) {
    return "blur";
  }
  if ((type === "text" || type === "textarea") && group === "Datos principales") {
    return "input";
  }
  return "blur";
}

function normalizeField(field, index) {
  const source = asObject(field);
  const key = normalizeText(source.key) || `campo_${index + 1}`;
  return {
    ...source,
    key,
    type: normalizeFieldType(source.type),
    label: normalizeText(source.label) || key,
    group: normalizeText(source.group) || "Datos principales",
    updateMode: normalizeFieldUpdateMode(source.updateMode, source),
  };
}

function hasRenderableTargets(field) {
  const source = asObject(field);
  if (!Object.prototype.hasOwnProperty.call(source, "applyTargets")) {
    return true;
  }

  const targets = Array.isArray(source.applyTargets) ? source.applyTargets : [];
  return targets.some((target) => {
    const safeTarget = asObject(target);
    return normalizeText(safeTarget.scope) && normalizeText(safeTarget.path);
  });
}

function normalizeFieldsSchema(fieldsSchema) {
  if (!Array.isArray(fieldsSchema)) return [];
  const seen = new Set();
  const out = [];

  fieldsSchema.forEach((field, index) => {
    if (!hasRenderableTargets(field)) return;
    const normalized = normalizeField(field, index);
    if (!normalized.key || seen.has(normalized.key)) return;
    seen.add(normalized.key);
    out.push(normalized);
  });

  return out;
}

function valueToEditableString(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || typeof value === "undefined") return "";
  return "";
}

function sanitizeImagesValue(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
}

function compareValues(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    const a = Array.isArray(left) ? left : [];
    const b = Array.isArray(right) ? right : [];
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (String(a[i]) !== String(b[i])) return false;
    }
    return true;
  }
  return String(left ?? "") === String(right ?? "");
}

function normalizeEditableFieldValue(field, value) {
  const fieldType = normalizeFieldType(field?.type);

  if (fieldType === "images") {
    return sanitizeImagesValue(value);
  }

  if (fieldType === "date" || fieldType === "datetime") {
    return normalizeTemplateInputValueForFieldType(fieldType, value);
  }

  return valueToEditableString(value);
}

export function getTemplateFields(template) {
  const safeTemplate = asObject(template);
  return normalizeFieldsSchema(safeTemplate.fieldsSchema);
}

export function groupTemplateFields(fields) {
  const safeFields = Array.isArray(fields) ? fields : [];
  const byGroup = new Map();

  safeFields.forEach((field) => {
    const group = normalizeText(field.group) || "Datos principales";
    if (!byGroup.has(group)) {
      byGroup.set(group, []);
    }
    byGroup.get(group).push(field);
  });

  return Array.from(byGroup.entries()).map(([name, items]) => ({
    name,
    fields: items,
  }));
}

export function buildTemplateFormState(template, existingState = null) {
  const safeTemplate = asObject(template);
  const fields = getTemplateFields(safeTemplate);
  const schemaDefaults = ensureDefaultsForSchema(fields, safeTemplate.defaults);
  const defaults = {};
  const existing = asObject(existingState);
  const existingRawValues = asObject(existing.rawValues);
  const rawValues = {};

  fields.forEach((field) => {
    const key = field.key;
    defaults[key] = normalizeEditableFieldValue(field, schemaDefaults[key]);

    const preferred = existingRawValues[key];
    if (field.type === "images") {
      rawValues[key] = normalizeEditableFieldValue(
        field,
        typeof preferred === "undefined" ? defaults[key] : preferred
      );
      return;
    }

    rawValues[key] =
      typeof preferred === "string" || typeof preferred === "number" || typeof preferred === "boolean"
        ? normalizeEditableFieldValue(field, preferred)
        : defaults[key];
  });

  const touchedKeys = Array.isArray(existing.touchedKeys)
    ? existing.touchedKeys
        .map((entry) => normalizeText(entry))
        .filter((entry) => fields.some((field) => field.key === entry))
    : [];

  return {
    fields,
    groups: groupTemplateFields(fields),
    defaults,
    rawValues,
    touchedKeys,
  };
}

export function resolveTemplateInputValues({
  template,
  rawValues,
  galleryUrlsByField,
}) {
  const formState = buildTemplateFormState(template, { rawValues });
  const defaults = formState.defaults;
  const safeRawValues = asObject(formState.rawValues);
  const safeGalleryUrlsByField = asObject(galleryUrlsByField);
  const resolvedValues = {};

  formState.fields.forEach((field) => {
    const key = field.key;
    const defaultValue = defaults[key];

    if (field.type === "images") {
      const uploaded = sanitizeImagesValue(safeGalleryUrlsByField[key]);
      if (uploaded.length > 0) {
        resolvedValues[key] = uploaded;
        return;
      }

      const rawExisting = sanitizeImagesValue(safeRawValues[key]);
      if (rawExisting.length > 0) {
        resolvedValues[key] = rawExisting;
        return;
      }

      resolvedValues[key] = sanitizeImagesValue(defaultValue);
      return;
    }

    const rawValue = valueToEditableString(safeRawValues[key]);
    if (!rawValue.trim()) {
      resolvedValues[key] = valueToEditableString(defaultValue);
      return;
    }

    resolvedValues[key] = rawValue;
  });

  return {
    fields: formState.fields,
    defaults,
    resolvedValues,
    changedKeys: getChangedKeys({
      fields: formState.fields,
      defaults,
      resolvedValues,
    }),
  };
}

export function getChangedKeys({ fields, defaults, resolvedValues }) {
  const safeFields = Array.isArray(fields) ? fields : [];
  const safeDefaults = asObject(defaults);
  const safeResolvedValues = asObject(resolvedValues);

  return safeFields
    .map((field) => field.key)
    .filter((key) => !compareValues(safeDefaults[key], safeResolvedValues[key]));
}

export function resolveTemplateFieldByKey(template, fieldKey) {
  const key = normalizeText(fieldKey);
  if (!key) return null;
  const fields = getTemplateFields(template);
  return fields.find((field) => field.key === key) || null;
}
