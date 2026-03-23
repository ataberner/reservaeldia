import { buildTemplateFormState, resolveTemplateFieldByKey } from "./formModel.js";
import { resolveTemplateTargetValuePair } from "./fieldValueResolver.js";

const PREVIEW_SCROLL_SCOPES = new Set(["objeto", "seccion"]);

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

function normalizeTargets(field) {
  if (!Array.isArray(field?.applyTargets)) return [];

  return field.applyTargets
    .map((target) => {
      const scope = normalizeText(target?.scope).toLowerCase();
      const id = normalizeText(target?.id);
      const path = normalizeText(target?.path);
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
    })
    .filter(Boolean);
}

function normalizePreviewScrollTarget(target) {
  const scope = normalizeText(target?.scope).toLowerCase();
  const id = normalizeText(target?.id);
  if (!PREVIEW_SCROLL_SCOPES.has(scope) || !id) return null;

  return {
    scope,
    id,
  };
}

function dedupePreviewScrollTargets(targets) {
  const seen = new Set();
  const out = [];

  (Array.isArray(targets) ? targets : []).forEach((target) => {
    const normalized = normalizePreviewScrollTarget(target);
    if (!normalized) return;

    const dedupeKey = `${normalized.scope}|${normalized.id}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    out.push(normalized);
  });

  return out;
}

function shouldDispatchFieldForPhase(field, phase) {
  const safePhase = normalizeText(phase).toLowerCase();
  if (!safePhase) return false;
  return normalizeText(field?.updateMode).toLowerCase() === safePhase;
}

export function resolvePreviewScrollTargetsForField(template, fieldKey) {
  const field = resolveTemplateFieldByKey(template, fieldKey);
  if (!field) return [];
  return dedupePreviewScrollTargets(normalizeTargets(field));
}

export function buildPreviewOperationsForField({
  template,
  fieldKey,
  value,
  phase,
}) {
  const field = resolveTemplateFieldByKey(template, fieldKey);
  if (!field) return [];
  if (!shouldDispatchFieldForPhase(field, phase)) return [];

  const formState = buildTemplateFormState(template);
  const defaults = asObject(formState.defaults);
  const defaultValue = defaults[field.key];
  const targets = normalizeTargets(field);

  if (targets.length > 0) {
    return targets.map((target) => {
      const incomingValue = field.type === "images" ? sanitizeImageUrls(value) : value;
      const resolvedValues = resolveTemplateTargetValuePair({
        field,
        target,
        nextValue: incomingValue,
        defaultValue,
      });

      return {
        ...target,
        fieldKey: field.key,
        value: resolvedValues.nextValue,
        defaultValue: resolvedValues.defaultValue,
      };
    });
  }

  if (field.type === "images") {
    const urls = sanitizeImageUrls(value);
    if (!urls.length) return [];
    return [
      {
        scope: "global",
        mode: "setFirstGalleryCells",
        fieldKey: field.key,
        value: urls,
      },
    ];
  }

  const nextValue = String(value ?? "");
  const previous = String(defaultValue ?? "");
  if (!previous || nextValue === previous) return [];

  return [
    {
      scope: "global",
      mode: "replaceTextGlobal",
      fieldKey: field.key,
      find: previous,
      replace: nextValue,
    },
  ];
}

export function buildPreviewPatchMessage(operations, options = {}) {
  const safeOperations = Array.isArray(operations)
    ? operations.filter((operation) => operation && typeof operation === "object")
    : [];
  const safeOptions = asObject(options);
  const safeScrollTargets = dedupePreviewScrollTargets(safeOptions.scrollTargets);

  return {
    type: "template-preview:apply",
    operations: safeOperations,
    ...(safeScrollTargets.length ? { scrollTargets: safeScrollTargets } : {}),
  };
}
