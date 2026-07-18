import {
  isDateTextFormatPreset,
  isDateLikeTemplateFieldType,
  isTextualTemplateTargetPath,
  normalizeDateTextFormatPreset,
  resolveTemplateTargetValue,
} from "../fieldValueResolver.js";
import {
  buildObjectTargetPatch,
  buildTextMeasurementOptions,
} from "../objectTargetPatch.js";
import {
  resolveCountdownTargetValue,
} from "../../eventDetails/countdownEventDetails.js";
import {
  resolveEventDateValueFromTextTargets,
} from "../../eventDetails/date.js";
import {
  isEventVenueAddressField,
} from "../../eventDetails/location.js";
import {
  resolveDressCodeTargetOptions,
  resolveStoryTextTargetOptions,
} from "../storyText.js";
import {
  findRenderObjectById,
} from "../../editor/renderObjectTree.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function areValuesEqual(left, right) {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function findObjectById(objetos, id) {
  return findRenderObjectById(objetos, id);
}

function isCountdownFechaObjetivoTarget(field, target, objetos) {
  const safeFieldType = normalizeText(field?.type).toLowerCase();
  const safePath = normalizeText(target?.path).toLowerCase();
  if (safeFieldType !== "date" && safeFieldType !== "datetime") return false;
  if (safePath !== "fechaobjetivo") return false;

  const targetObject = findObjectById(objetos, target?.id);
  return normalizeText(targetObject?.tipo).toLowerCase() === "countdown";
}

export function resolveFieldValueFromLinkedCountdown({
  field,
  objetos,
  fallbackValue,
} = {}) {
  const targets = Array.isArray(field?.applyTargets) ? field.applyTargets : [];

  for (const target of targets) {
    if (!isCountdownFechaObjetivoTarget(field, target, objetos)) continue;
    const countdown = findObjectById(objetos, target?.id);
    const value = resolveCountdownTargetValue(countdown);
    if (value) return value;
  }

  return fallbackValue;
}

export function resolveFieldValueFromLinkedDateTargets({
  field,
  objetos,
  fallbackValue,
} = {}) {
  return (
    resolveFieldValueFromLinkedCountdown({
      field,
      objetos,
      fallbackValue: "",
    }) ||
    resolveEventDateValueFromTextTargets({
      field,
      objetos,
    }) ||
    fallbackValue
  );
}

export function collectTextualTargetObjectIds(field) {
  const targets = Array.isArray(field?.applyTargets) ? field.applyTargets : [];
  return Array.from(
    new Set(
      targets
        .filter(
          (target) =>
            normalizeText(target?.scope).toLowerCase() === "objeto" &&
            isTextualTemplateTargetPath(target?.path)
        )
        .map((target) => normalizeText(target?.id))
        .filter(Boolean)
    )
  );
}

function isFieldFallbackDateTextTarget(field, target) {
  if (!isDateLikeTemplateFieldType(field?.type)) return false;
  if (!isTextualTemplateTargetPath(target?.path)) return false;

  const transform = asObject(target?.transform);
  const kind = normalizeText(transform.kind).toLowerCase();
  if (kind && kind !== "date_to_text") return false;

  return !isDateTextFormatPreset(transform.preset);
}

export function collectFieldFallbackDateTextTargetObjectIds(field) {
  const targets = Array.isArray(field?.applyTargets) ? field.applyTargets : [];
  return Array.from(
    new Set(
      targets
        .filter(
          (target) =>
            normalizeText(target?.scope).toLowerCase() === "objeto" &&
            isFieldFallbackDateTextTarget(field, target)
        )
        .map((target) => normalizeText(target?.id))
        .filter(Boolean)
    )
  );
}

export function updateFieldDateTextFormatInSchema({
  fieldsSchema,
  fieldKey,
  preset,
} = {}) {
  const safeFieldKey = normalizeText(fieldKey);
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  if (!safeFieldKey) {
    return {
      fieldsSchema: fields,
      changed: false,
      field: null,
      preset: "",
      targetObjectIds: [],
    };
  }

  let changed = false;
  let updatedField = null;
  let resolvedPreset = "";
  const nextFields = fields.map((field) => {
    const safeField = asObject(field);
    if (normalizeText(safeField.key) !== safeFieldKey) return field;

    if (!isDateLikeTemplateFieldType(safeField.type)) {
      updatedField = safeField;
      return field;
    }

    resolvedPreset = normalizeDateTextFormatPreset(preset, safeField.type);
    const nextField = {
      ...safeField,
      dateTextFormatPreset: resolvedPreset,
    };

    if (!areValuesEqual(nextField, safeField)) {
      changed = true;
    }

    updatedField = nextField;
    return nextField;
  });

  return {
    fieldsSchema: nextFields,
    changed,
    field: updatedField,
    preset: resolvedPreset,
    targetObjectIds: updatedField ? collectFieldFallbackDateTextTargetObjectIds(updatedField) : [],
  };
}

export function updateFieldTargetDateTextFormatInSchema({
  fieldsSchema,
  fieldKey,
  targetObjectId,
  path = "",
  preset,
} = {}) {
  const safeFieldKey = normalizeText(fieldKey);
  const safeTargetObjectId = normalizeText(targetObjectId);
  const safePath = normalizeText(path);
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  if (!safeFieldKey || !safeTargetObjectId) {
    return {
      fieldsSchema: fields,
      changed: false,
      field: null,
      preset: "",
      targetObjectIds: [],
    };
  }

  let changed = false;
  let updatedField = null;
  let resolvedPreset = "";
  let matchedTarget = false;
  const nextFields = fields.map((field) => {
    const safeField = asObject(field);
    if (normalizeText(safeField.key) !== safeFieldKey) return field;

    if (!isDateLikeTemplateFieldType(safeField.type)) {
      updatedField = safeField;
      return field;
    }

    resolvedPreset = normalizeDateTextFormatPreset(preset, safeField.type);
    const targets = Array.isArray(safeField.applyTargets) ? safeField.applyTargets : [];
    const nextTargets = targets.map((target) => {
      if (normalizeText(target?.scope).toLowerCase() !== "objeto") return target;
      if (normalizeText(target?.id) !== safeTargetObjectId) return target;
      if (!isTextualTemplateTargetPath(target?.path)) return target;
      if (safePath && normalizeText(target?.path) !== safePath) return target;

      const transform = asObject(target?.transform);
      const kind = normalizeText(transform.kind).toLowerCase();
      if (kind && kind !== "date_to_text") return target;

      matchedTarget = true;
      const nextTarget = {
        ...target,
        transform: {
          kind: "date_to_text",
          preset: resolvedPreset,
        },
      };
      if (!areValuesEqual(nextTarget, target)) {
        changed = true;
      }
      return nextTarget;
    });

    const nextField = matchedTarget
      ? {
          ...safeField,
          applyTargets: nextTargets,
        }
      : safeField;
    updatedField = nextField;
    return nextField;
  });

  return {
    fieldsSchema: nextFields,
    changed,
    field: updatedField,
    preset: resolvedPreset,
    targetObjectIds: matchedTarget ? [safeTargetObjectId] : [],
  };
}

export function buildTemplateAuthoringTargetPatches({
  field,
  value,
  objetos,
  secciones,
  targetObjectIds = null,
  measurementOptions = null,
} = {}) {
  const safeField = asObject(field);
  const safeObjetos = Array.isArray(objetos) ? objetos : [];
  const targets = Array.isArray(safeField.applyTargets) ? safeField.applyTargets : [];
  const objectIdFilter = Array.isArray(targetObjectIds)
    ? new Set(targetObjectIds.map((id) => normalizeText(id)).filter(Boolean))
    : null;
  const textMeasurementOptions =
    measurementOptions ||
    buildTextMeasurementOptions({
      secciones: Array.isArray(secciones) ? secciones : [],
    });
  const workingObjectsById = new Map();
  const patchesById = new Map();

  targets.forEach((target) => {
    if (normalizeText(target?.scope).toLowerCase() !== "objeto") return;

    const targetId = normalizeText(target?.id);
    if (!targetId) return;
    if (objectIdFilter && !objectIdFilter.has(targetId)) return;

    const baseObject =
      workingObjectsById.get(targetId) ||
      findObjectById(safeObjetos, targetId);
    if (!baseObject) return;

    const resolvedValue = resolveTemplateTargetValue({
      field: safeField,
      target,
      value,
    });
    const storyTextTargetOptions = resolveStoryTextTargetOptions(
      safeField,
      target?.path
    );
    const dressCodeTargetOptions = resolveDressCodeTargetOptions(
      safeField,
      target?.path
    );
    const textTargetOptions =
      storyTextTargetOptions ||
      dressCodeTargetOptions ||
      (
        isEventVenueAddressField(safeField) &&
        isTextualTemplateTargetPath(target?.path)
        ? {
            fixedTextBox: true,
            wrapMode: "word",
          }
        : null
      );
    const patch = buildObjectTargetPatch({
      object: baseObject,
      path: target?.path,
      value: resolvedValue,
      textMeasurementOptions,
      textTargetOptions,
    });
    if (!patch || Object.keys(patch).length === 0) return;

    const previousPatch = patchesById.get(targetId) || {};
    const nextPatch = {
      ...previousPatch,
      ...patch,
    };
    patchesById.set(targetId, nextPatch);
    workingObjectsById.set(targetId, {
      ...baseObject,
      ...patch,
    });
  });

  return Array.from(patchesById.entries()).map(([objectId, patch]) => ({
    objectId,
    patch,
  }));
}
