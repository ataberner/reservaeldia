import { resolveTemplateFieldByKey } from "./formModel.js";
import { buildPreviewDynamicGalleryLayout } from "./galleryDynamicMedia.js";
import { resolveTemplatePersonalizationFieldPlan } from "./personalizationContract.js";

const PREVIEW_SCROLL_SCOPES = new Set(["objeto", "seccion"]);
const PREVIEW_PATCHABLE_SCOPES = new Set(["objeto", "seccion"]);

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
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

function findTemplateObjectById(template, objectId) {
  const safeObjectId = normalizeText(objectId);
  if (!safeObjectId) return null;
  const objects = Array.isArray(template?.objetos) ? template.objetos : [];
  return objects.find((object) => normalizeText(object?.id) === safeObjectId) || null;
}

function shouldDispatchFieldForPhase(field, phase) {
  const safePhase = normalizeText(phase).toLowerCase();
  if (!safePhase) return false;
  return normalizeText(field?.updateMode).toLowerCase() === safePhase;
}

export function resolvePreviewScrollTargetsForField(template, fieldKey) {
  const field = resolveTemplateFieldByKey(template, fieldKey);
  if (!field) return [];
  return dedupePreviewScrollTargets(field.applyTargets);
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

  const fieldPlan = resolveTemplatePersonalizationFieldPlan({
    template,
    fieldKey: field.key,
    value,
  });
  if (!fieldPlan) return [];

  if (fieldPlan.applyTargets.length > 0) {
    return fieldPlan.applyTargets
      .filter((target) => PREVIEW_PATCHABLE_SCOPES.has(normalizeText(target?.scope).toLowerCase()))
      .map((target) => {
        const incomingValue =
          fieldPlan.fallback?.kind === "gallery" ? fieldPlan.fallback.value : fieldPlan.nextValue;

        return {
          ...target,
          fieldKey: field.key,
          value: target.nextValue,
          defaultValue: target.defaultValue,
          ...(() => {
            if (target.scope !== "objeto" || normalizeText(target.path).toLowerCase() !== "cells") {
              return {};
            }
            const targetObject = findTemplateObjectById(template, target.id);
            if (
              !targetObject ||
              normalizeText(targetObject?.galleryLayoutMode).toLowerCase() !== "dynamic_media"
            ) {
              return {};
            }
            return {
              galleryLayout: buildPreviewDynamicGalleryLayout(targetObject, incomingValue),
            };
          })(),
        };
      });
  }

  if (fieldPlan.fallback?.kind === "gallery") {
    const urls = fieldPlan.fallback.value;
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

  if (fieldPlan.fallback?.kind !== "text_replace") return [];

  const nextValue = String(fieldPlan.fallback.replace ?? "");
  const previous = String(fieldPlan.fallback.find ?? "");
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
