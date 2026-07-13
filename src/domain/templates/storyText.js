import { findRenderObjectById } from "../editor/renderObjectTree.js";
import { isTextualTemplateTargetPath } from "./fieldValueResolver.js";

export const STORY_TEXT_FIELD_KEY = "texto_historia";
export const STORY_TEXT_FIELD_LABEL = "Texto historia";
export const STORY_TEXT_SIDEBAR_TITLE = "Nuestra historia";
export const DRESS_CODE_FIELD_KEY = "event_dress_code";
export const DRESS_CODE_FIELD_LABEL = "Dress Code";
export const DRESS_CODE_EVENT_DETAILS_ROLE = "dress_code";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeStoryTextValue(value) {
  if (value == null) return "";
  return String(value).replace(/\r\n/g, "\n");
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
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

function isTextObject(object) {
  return normalizeText(object?.tipo).toLowerCase() === "texto";
}

function isFieldKey(field, fieldKey) {
  return normalizeText(asObject(field).key) === fieldKey;
}

export function getStoryTextFieldKey() {
  return STORY_TEXT_FIELD_KEY;
}

export function isStoryTextField(field) {
  return isFieldKey(field, STORY_TEXT_FIELD_KEY);
}

export function buildStoryTextField() {
  return {
    key: STORY_TEXT_FIELD_KEY,
    label: STORY_TEXT_FIELD_LABEL,
    type: "textarea",
    group: "Datos principales",
    optional: true,
    applyTargets: [],
  };
}

export function resolveStoryTextTargetOptions(field, path = "texto") {
  if (!isStoryTextField(field)) return null;
  if (!isTextualTemplateTargetPath(path)) return null;

  return {
    fixedTextBox: true,
    wrapMode: "word",
    defaultToMeasuredWidth: true,
  };
}

export function getDressCodeFieldKey() {
  return DRESS_CODE_FIELD_KEY;
}

export function isDressCodeField(field) {
  return (
    isFieldKey(field, DRESS_CODE_FIELD_KEY) ||
    normalizeText(asObject(field).eventDetailsRole).toLowerCase() === DRESS_CODE_EVENT_DETAILS_ROLE
  );
}

export function buildDressCodeField() {
  return {
    key: DRESS_CODE_FIELD_KEY,
    label: DRESS_CODE_FIELD_LABEL,
    type: "text",
    group: "Detalles del evento",
    optional: true,
    eventDetailsRole: DRESS_CODE_EVENT_DETAILS_ROLE,
    applyTargets: [],
  };
}

export function resolveDressCodeTargetOptions(field, path = "texto") {
  if (!isDressCodeField(field)) return null;
  if (!isTextualTemplateTargetPath(path)) return null;

  return {
    fixedTextBox: true,
    wrapMode: "word",
    defaultToMeasuredWidth: true,
  };
}

export function ensureStoryTextField({ fieldsSchema } = {}) {
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const templateField = buildStoryTextField();
  let changed = false;
  let field = null;

  const nextFields = fields.map((entry) => {
    const current = asObject(entry);
    if (!isStoryTextField(current)) return entry;

    const patched = {
      ...current,
      label: STORY_TEXT_FIELD_LABEL,
      type: "textarea",
      group: normalizeText(current.group) || templateField.group,
      optional:
        typeof current.optional === "boolean"
          ? current.optional
          : templateField.optional,
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

export function ensureDressCodeField({ fieldsSchema } = {}) {
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const templateField = buildDressCodeField();
  let changed = false;
  let field = null;

  const nextFields = fields.map((entry) => {
    const current = asObject(entry);
    if (!isDressCodeField(current)) return entry;

    const patched = {
      ...current,
      key: DRESS_CODE_FIELD_KEY,
      label: DRESS_CODE_FIELD_LABEL,
      type: "text",
      group: normalizeText(current.group) || templateField.group,
      optional:
        typeof current.optional === "boolean"
          ? current.optional
          : templateField.optional,
      eventDetailsRole: DRESS_CODE_EVENT_DETAILS_ROLE,
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

function resolveStoryTextTarget(field, objetos) {
  const targets = Array.isArray(field?.applyTargets) ? field.applyTargets : [];

  for (const target of targets) {
    if (normalizeText(target?.scope).toLowerCase() !== "objeto") continue;
    if (!isTextualTemplateTargetPath(target?.path)) continue;

    const targetObject = findRenderObjectById(objetos, target?.id);
    if (!isTextObject(targetObject)) continue;

    return {
      target,
      targetObject,
    };
  }

  return {
    target: null,
    targetObject: null,
  };
}

export function resolveStoryTextSidebarBinding({
  fieldsSchema,
  defaults,
  objetos,
} = {}) {
  const safeDefaults = asObject(defaults);
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const field = fields.find((entry) => isStoryTextField(entry)) || null;
  const fieldKey = normalizeText(field?.key);
  const { target, targetObject } = resolveStoryTextTarget(field, objetos);
  const targetValue = targetObject
    ? readObjectPathValue(targetObject, target?.path || "texto")
    : undefined;
  const fallbackValue = fieldKey
    ? normalizeStoryTextValue(safeDefaults[fieldKey])
    : "";

  return {
    field,
    fieldKey,
    target,
    objectId: normalizeText(targetObject?.id),
    value: targetObject ? normalizeStoryTextValue(targetValue) : fallbackValue,
    hasBinding: Boolean(fieldKey && targetObject),
  };
}

export function resolveDressCodeSidebarBinding({
  fieldsSchema,
  defaults,
  objetos,
} = {}) {
  const safeDefaults = asObject(defaults);
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const field = fields.find((entry) => isDressCodeField(entry)) || null;
  const fieldKey = normalizeText(field?.key);
  const { target, targetObject } = resolveStoryTextTarget(field, objetos);
  const targetValue = targetObject
    ? readObjectPathValue(targetObject, target?.path || "texto")
    : undefined;
  const fallbackValue = fieldKey
    ? normalizeStoryTextValue(safeDefaults[fieldKey])
    : "";

  return {
    field,
    fieldKey,
    target,
    objectId: normalizeText(targetObject?.id),
    value: targetObject ? normalizeStoryTextValue(targetValue) : fallbackValue,
    hasBinding: Boolean(fieldKey && targetObject),
  };
}
