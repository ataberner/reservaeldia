const TEXT_FIELD_TYPES = new Set([
  "text",
  "textarea",
  "date",
  "time",
  "datetime",
  "location",
  "url",
]);

const DEFAULT_GROUP = "Datos principales";
const SUPPORTED_SOURCE_ELEMENT_TYPES = new Set(["texto", "countdown"]);

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const token = value.trim().toLowerCase();
    if (token === "true" || token === "1" || token === "si" || token === "yes") {
      return true;
    }
    if (token === "false" || token === "0" || token === "no") {
      return false;
    }
  }
  return fallback;
}

function normalizeFieldType(value) {
  const token = normalizeText(value).toLowerCase();
  if (!token) return "text";
  if (!TEXT_FIELD_TYPES.has(token)) return "text";
  return token;
}

function normalizeFieldGroup(value) {
  return normalizeText(value) || DEFAULT_GROUP;
}

function normalizeFieldLabel(value, fallback = "Campo") {
  return normalizeText(value) || fallback;
}

function normalizeElementType(value) {
  return normalizeText(value).toLowerCase();
}

export function isSupportedAuthoringElementType(value) {
  return SUPPORTED_SOURCE_ELEMENT_TYPES.has(normalizeElementType(value));
}

function sanitizeFieldKeyToken(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeApplyTarget(rawTarget) {
  const source = asObject(rawTarget);
  const scope = normalizeText(source.scope).toLowerCase();
  const id = normalizeText(source.id);
  const path = normalizeText(source.path);
  const mode = normalizeText(source.mode).toLowerCase() === "replace" ? "replace" : "set";

  if (!scope || !path) return null;
  if ((scope === "objeto" || scope === "seccion") && !id) return null;

  return {
    scope,
    ...(id ? { id } : {}),
    path,
    mode,
  };
}

function normalizeField(field, index = 0) {
  const source = asObject(field);
  const key = sanitizeFieldKeyToken(source.key) || `campo_${index + 1}`;
  const label = normalizeFieldLabel(source.label, key);
  const type = normalizeFieldType(source.type);
  const group = normalizeFieldGroup(source.group);
  const optional = normalizeBoolean(source.optional, false);
  const applyTargets = Array.isArray(source.applyTargets)
    ? source.applyTargets
        .map((target) => normalizeApplyTarget(target))
        .filter(Boolean)
    : [];

  return {
    ...source,
    key,
    label,
    type,
    group,
    optional,
    applyTargets,
  };
}

export function generateFieldKey(label, existingFields = []) {
  const existing = new Set(
    (Array.isArray(existingFields) ? existingFields : [])
      .map((field) => sanitizeFieldKeyToken(field?.key))
      .filter(Boolean)
  );

  const base = sanitizeFieldKeyToken(label) || "campo";
  if (!existing.has(base)) return base;

  let sequence = 2;
  while (sequence < 1000) {
    const candidate = `${base}_${sequence}`;
    if (!existing.has(candidate)) return candidate;
    sequence += 1;
  }

  return `${base}_${Date.now()}`;
}

export function buildFieldFromTextElement({
  element,
  label,
  type = "text",
  group = DEFAULT_GROUP,
  optional = false,
  existingFields = [],
} = {}) {
  return buildFieldFromElement({
    element,
    label,
    type,
    group,
    optional,
    existingFields,
  });
}

export function resolveAuthoringTargetForElement(element) {
  const safeElement = asObject(element);
  const elementId = normalizeText(safeElement.id);
  const elementType = normalizeElementType(safeElement.tipo);

  if (!elementId || !isSupportedAuthoringElementType(elementType)) {
    return null;
  }

  if (elementType === "countdown") {
    return {
      elementType,
      path: "fechaObjetivo",
      defaultType: "date",
      defaultLabel: "Fecha del evento",
      defaultValue: normalizeText(safeElement.fechaObjetivo || safeElement.targetISO || safeElement.fechaISO),
    };
  }

  return {
    elementType: "texto",
    path: "texto",
    defaultType: "text",
    defaultLabel: "Campo",
    defaultValue: normalizeText(safeElement.texto),
  };
}

export function buildFieldFromElement({
  element,
  label,
  type = "",
  group = DEFAULT_GROUP,
  optional = false,
  existingFields = [],
} = {}) {
  const safeElement = asObject(element);
  const elementId = normalizeText(safeElement.id);
  const targetConfig = resolveAuthoringTargetForElement(safeElement);

  if (!targetConfig || !elementId) {
    throw new Error("Solo se pueden crear campos dinamicos desde texto o countdown.");
  }

  const elementType = targetConfig.elementType;
  const defaultLabel =
    elementType === "countdown"
      ? targetConfig.defaultLabel
      : normalizeText(safeElement.texto).slice(0, 60) || targetConfig.defaultLabel;
  const suggestedLabel =
    normalizeFieldLabel(label) || defaultLabel || "Campo";
  const key = generateFieldKey(suggestedLabel, existingFields);
  const normalizedType = normalizeFieldType(type || targetConfig.defaultType);

  return {
    key,
    label: suggestedLabel,
    type: normalizedType,
    group: normalizeFieldGroup(group),
    optional: normalizeBoolean(optional, false),
    applyTargets: [
      {
        scope: "objeto",
        id: elementId,
        path: targetConfig.path,
        mode: "set",
      },
    ],
  };
}

export function buildElementFieldIndex(fieldsSchema) {
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const index = {};

  fields.forEach((field, fieldIndex) => {
    const normalized = normalizeField(field, fieldIndex);
    const fieldKey = normalized.key;
    normalized.applyTargets.forEach((target) => {
      if (target.scope !== "objeto") return;
      const targetId = normalizeText(target.id);
      if (!targetId) return;
      if (index[targetId]) return;
      index[targetId] = fieldKey;
    });
  });

  return index;
}

export function linkElementToField({
  fieldsSchema,
  fieldKey,
  elementId,
  path = "texto",
} = {}) {
  const safeFieldKey = sanitizeFieldKeyToken(fieldKey);
  const safeElementId = normalizeText(elementId);
  const safePath = normalizeText(path) || "texto";
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];

  if (!safeFieldKey || !safeElementId) {
    return {
      fieldsSchema: fields.map((field, index) => normalizeField(field, index)),
      changed: false,
      previousFieldKey: null,
    };
  }

  let previousFieldKey = null;
  let changed = false;
  const nextFields = fields.map((field, index) => {
    const normalized = normalizeField(field, index);
    const nextTargets = normalized.applyTargets.filter((target) => {
      if (target.scope !== "objeto") return true;
      if (target.id !== safeElementId) return true;
      if (normalized.key !== safeFieldKey) {
        previousFieldKey = normalized.key;
      }
      changed = true;
      return false;
    });

    return {
      ...normalized,
      applyTargets: nextTargets,
    };
  });

  const targetIndex = nextFields.findIndex((field) => field.key === safeFieldKey);
  if (targetIndex < 0) {
    return {
      fieldsSchema: nextFields,
      changed,
      previousFieldKey,
    };
  }

  const targetField = nextFields[targetIndex];
  const alreadyLinked = targetField.applyTargets.some(
    (target) =>
      target.scope === "objeto" &&
      target.id === safeElementId &&
      target.path === safePath
  );

  if (!alreadyLinked) {
    changed = true;
    nextFields[targetIndex] = {
      ...targetField,
      applyTargets: [
        ...targetField.applyTargets,
        {
          scope: "objeto",
          id: safeElementId,
          path: safePath,
          mode: "set",
        },
      ],
    };
  }

  return {
    fieldsSchema: nextFields,
    changed,
    previousFieldKey,
  };
}

export function unlinkElementFromField({
  fieldsSchema,
  fieldKey,
  elementId,
} = {}) {
  const safeFieldKey = sanitizeFieldKeyToken(fieldKey);
  const safeElementId = normalizeText(elementId);
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];

  if (!safeElementId) {
    return {
      fieldsSchema: fields.map((field, index) => normalizeField(field, index)),
      changed: false,
      removedFromFieldKeys: [],
    };
  }

  let changed = false;
  const removedFromFieldKeys = [];
  const nextFields = fields.map((field, index) => {
    const normalized = normalizeField(field, index);
    if (safeFieldKey && normalized.key !== safeFieldKey) return normalized;

    const beforeCount = normalized.applyTargets.length;
    const filteredTargets = normalized.applyTargets.filter((target) => {
      if (target.scope !== "objeto") return true;
      return target.id !== safeElementId;
    });

    if (filteredTargets.length !== beforeCount) {
      changed = true;
      removedFromFieldKeys.push(normalized.key);
    }

    return {
      ...normalized,
      applyTargets: filteredTargets,
    };
  });

  return {
    fieldsSchema: nextFields,
    changed,
    removedFromFieldKeys,
  };
}

export function updateFieldConfig({
  fieldsSchema,
  fieldKey,
  patch,
} = {}) {
  const safeFieldKey = sanitizeFieldKeyToken(fieldKey);
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const safePatch = asObject(patch);

  if (!safeFieldKey) {
    return {
      fieldsSchema: fields.map((field, index) => normalizeField(field, index)),
      changed: false,
    };
  }

  let changed = false;
  const nextFields = fields.map((field, index) => {
    const normalized = normalizeField(field, index);
    if (normalized.key !== safeFieldKey) return normalized;

    const nextLabel = normalizeFieldLabel(safePatch.label, normalized.label);
    const nextType = normalizeFieldType(safePatch.type || normalized.type);
    const nextGroup = normalizeFieldGroup(safePatch.group || normalized.group);
    const nextOptional = normalizeBoolean(
      Object.prototype.hasOwnProperty.call(safePatch, "optional")
        ? safePatch.optional
        : normalized.optional,
      normalized.optional
    );

    if (
      nextLabel !== normalized.label ||
      nextType !== normalized.type ||
      nextGroup !== normalized.group ||
      nextOptional !== normalized.optional
    ) {
      changed = true;
    }

    return {
      ...normalized,
      label: nextLabel,
      type: nextType,
      group: nextGroup,
      optional: nextOptional,
    };
  });

  return {
    fieldsSchema: nextFields,
    changed,
  };
}

export function deleteFieldIfOrphan({
  fieldsSchema,
  defaults,
  fieldKey,
} = {}) {
  const safeFieldKey = sanitizeFieldKeyToken(fieldKey);
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const safeDefaults = { ...asObject(defaults) };

  if (!safeFieldKey) {
    return {
      fieldsSchema: fields.map((field, index) => normalizeField(field, index)),
      defaults: safeDefaults,
      removed: false,
    };
  }

  const targetField = fields
    .map((field, index) => normalizeField(field, index))
    .find((field) => field.key === safeFieldKey);
  if (!targetField) {
    return {
      fieldsSchema: fields.map((field, index) => normalizeField(field, index)),
      defaults: safeDefaults,
      removed: false,
    };
  }

  if (Array.isArray(targetField.applyTargets) && targetField.applyTargets.length > 0) {
    return {
      fieldsSchema: fields.map((field, index) => normalizeField(field, index)),
      defaults: safeDefaults,
      removed: false,
      reason: "field-has-targets",
    };
  }

  const nextFields = fields
    .map((field, index) => normalizeField(field, index))
    .filter((field) => field.key !== safeFieldKey);
  if (Object.prototype.hasOwnProperty.call(safeDefaults, safeFieldKey)) {
    delete safeDefaults[safeFieldKey];
  }

  return {
    fieldsSchema: nextFields,
    defaults: safeDefaults,
    removed: true,
  };
}
