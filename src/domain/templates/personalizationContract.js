import {
  buildTemplateFormState,
  resolveTemplateFieldByKey,
  resolveTemplateInputValues,
  getChangedKeys,
} from "./formModel.js";
import { resolveTemplateTargetValuePair } from "./fieldValueResolver.js";

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function sanitizeImageUrls(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
}

function normalizeApplyTarget(target) {
  const scope = normalizeText(target?.scope).toLowerCase();
  const path = normalizeText(target?.path);
  const id = normalizeText(target?.id);
  const mode = normalizeText(target?.mode).toLowerCase() === "replace" ? "replace" : "set";

  if (!scope || !path) return null;
  if ((scope === "objeto" || scope === "seccion") && !id) return null;

  return {
    scope,
    ...(id ? { id } : {}),
    path,
    mode,
    ...(target?.transform && typeof target.transform === "object"
      ? { transform: target.transform }
      : {}),
  };
}

export function resolveTemplatePersonalizationInput({
  template,
  rawValues,
  galleryUrlsByField,
  touchedKeys,
} = {}) {
  return resolveTemplateInputValues({
    template,
    rawValues,
    galleryUrlsByField,
    touchedKeys,
  });
}

export function buildTemplatePersonalizationFieldPlan({
  field,
  nextValue,
  defaultValue,
} = {}) {
  const safeField = asObject(field);
  const key = normalizeText(safeField.key);
  if (!key) return null;

  const applyTargets = (Array.isArray(safeField.applyTargets) ? safeField.applyTargets : [])
    .map((target) => normalizeApplyTarget(target))
    .filter(Boolean)
    .map((target) => {
      const resolvedValues = resolveTemplateTargetValuePair({
        field: safeField,
        target,
        nextValue,
        defaultValue,
      });

      return {
        ...target,
        nextValue: resolvedValues.nextValue,
        defaultValue: resolvedValues.defaultValue,
      };
    });

  let fallback = null;

  if (normalizeText(safeField.type).toLowerCase() === "images") {
    fallback = {
      kind: "gallery",
      value: sanitizeImageUrls(nextValue),
    };
  } else if (typeof defaultValue === "string" && typeof nextValue === "string") {
    fallback = {
      kind: "text_replace",
      find: String(defaultValue ?? ""),
      replace: String(nextValue ?? ""),
    };
  }

  return {
    key,
    field: safeField,
    nextValue,
    defaultValue,
    applyTargets,
    fallback,
  };
}

export function resolveTemplatePersonalizationFieldPlan({
  template,
  fieldKey,
  value,
} = {}) {
  const field = resolveTemplateFieldByKey(template, fieldKey);
  if (!field) return null;

  const defaults = asObject(buildTemplateFormState(template).defaults);

  return buildTemplatePersonalizationFieldPlan({
    field,
    nextValue: value,
    defaultValue: defaults[field.key],
  });
}

export function buildTemplatePersonalizationPlan({
  template,
  resolvedValues,
} = {}) {
  const formState = buildTemplateFormState(template);
  const defaults = asObject(formState.defaults);
  const safeResolvedValues = asObject(resolvedValues);
  const changedKeys = getChangedKeys({
    fields: formState.fields,
    defaults,
    resolvedValues: safeResolvedValues,
  });

  const fieldPlans = changedKeys
    .map((key) => {
      const field = formState.fields.find((entry) => entry.key === key);
      if (!field) return null;

      return buildTemplatePersonalizationFieldPlan({
        field,
        nextValue: safeResolvedValues[key],
        defaultValue: defaults[key],
      });
    })
    .filter(Boolean);

  return {
    fields: formState.fields,
    defaults,
    changedKeys,
    fieldPlans,
  };
}
