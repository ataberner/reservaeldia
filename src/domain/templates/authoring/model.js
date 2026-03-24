import {
  buildSuggestedTemplateTargetTransform,
  normalizeTemplateTargetTransform,
} from "@/domain/templates/fieldValueResolver.js";
import {
  resolveGalleryCellMediaUrl,
  resolveObjectPrimaryAssetUrl,
} from "../../../../shared/renderAssetContract.js";
import { resolveCountdownTargetIso } from "../../../../shared/renderContractPolicy.js";

const FIELD_TYPES = new Set([
  "text",
  "textarea",
  "date",
  "time",
  "datetime",
  "location",
  "url",
  "images",
]);

const DEFAULT_GROUP = "Datos principales";
const DEFAULT_MEDIA_GROUP = "Galeria";
const SUPPORTED_SOURCE_ELEMENT_TYPES = new Set(["texto", "countdown", "imagen", "galeria"]);

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
  if (!FIELD_TYPES.has(token)) return "text";
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

function toPositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

function normalizeFieldHelperText(value) {
  const safe = normalizeText(value);
  return safe || undefined;
}

function normalizeFieldValidation(value, fieldType) {
  const source = asObject(value);
  const type = normalizeFieldType(fieldType);
  const validation = {};

  if (type === "images") {
    const minItems = toPositiveInteger(source.minItems);
    const maxItems = toPositiveInteger(source.maxItems);
    if (minItems) validation.minItems = minItems;
    if (maxItems) validation.maxItems = maxItems;
  } else {
    const maxLength = toPositiveInteger(source.maxLength);
    if (maxLength) validation.maxLength = maxLength;
  }

  return Object.keys(validation).length ? validation : undefined;
}

function normalizeMediaUrls(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
}

function collectGalleryElementMediaUrls(element) {
  const cells = Array.isArray(element?.cells) ? element.cells : [];
  return cells
    .map((cell) => resolveGalleryCellMediaUrl(cell))
    .filter(Boolean);
}

function resolveElementWidth(element) {
  return (
    toPositiveInteger(element?.width) ||
    toPositiveInteger(element?.ancho) ||
    null
  );
}

function resolveElementHeight(element) {
  return (
    toPositiveInteger(element?.height) ||
    toPositiveInteger(element?.alto) ||
    null
  );
}

function computeGreatestCommonDivisor(a, b) {
  let left = Math.abs(Math.round(a));
  let right = Math.abs(Math.round(b));
  while (right) {
    const tmp = right;
    right = left % right;
    left = tmp;
  }
  return left || 1;
}

function buildAspectRatioLabel(width, height) {
  const safeWidth = toPositiveInteger(width);
  const safeHeight = toPositiveInteger(height);
  if (!safeWidth || !safeHeight) return "";
  const divisor = computeGreatestCommonDivisor(safeWidth, safeHeight);
  const ratioWidth = Math.max(1, Math.round(safeWidth / divisor));
  const ratioHeight = Math.max(1, Math.round(safeHeight / divisor));
  return `${ratioWidth}:${ratioHeight}`;
}

function buildImageFieldHelperText(element) {
  const ratioLabel = buildAspectRatioLabel(
    resolveElementWidth(element),
    resolveElementHeight(element)
  );
  if (!ratioLabel) {
    return "Puedes reemplazar esta imagen desde el formulario.";
  }
  return `Proporcion sugerida: ${ratioLabel}.`;
}

function buildGalleryFieldHelperText() {
  return "La composicion se adapta automaticamente segun la cantidad de fotos.";
}

function resolveGalleryDefaultMaxItems(element) {
  const explicitCellCount = Array.isArray(element?.cells) ? element.cells.length : 0;
  const gridCellCount =
    Math.max(1, toPositiveInteger(element?.rows) || 1) *
    Math.max(1, toPositiveInteger(element?.cols) || 1);
  return Math.max(12, explicitCellCount, gridCellCount);
}

function stripUndefinedTransform(target) {
  if (!target || typeof target !== "object") return target;
  if (target.transform) return target;
  const { transform: _unusedTransform, ...rest } = target;
  return rest;
}

function resolveSuggestedTransformForTarget(fieldType, path) {
  return buildSuggestedTemplateTargetTransform({
    fieldType,
    path,
  });
}

function normalizeApplyTarget(rawTarget) {
  const source = asObject(rawTarget);
  const scope = normalizeText(source.scope).toLowerCase();
  const id = normalizeText(source.id);
  const path = normalizeText(source.path);
  const mode = normalizeText(source.mode).toLowerCase() === "replace" ? "replace" : "set";
  const transform = normalizeTemplateTargetTransform(source.transform);

  if (!scope || !path) return null;
  if ((scope === "objeto" || scope === "seccion") && !id) return null;

  return {
    scope,
    ...(id ? { id } : {}),
    path,
    mode,
    ...(transform ? { transform } : {}),
  };
}

function normalizeField(field, index = 0) {
  const source = asObject(field);
  const key = sanitizeFieldKeyToken(source.key) || `campo_${index + 1}`;
  const label = normalizeFieldLabel(source.label, key);
  const type = normalizeFieldType(source.type);
  const group = normalizeFieldGroup(source.group);
  const optional = normalizeBoolean(source.optional, false);
  const helperText = normalizeFieldHelperText(source.helperText);
  const validation = normalizeFieldValidation(source.validation, type);
  const applyTargets = Array.isArray(source.applyTargets)
    ? source.applyTargets
        .map((target) => normalizeApplyTarget(target))
        .filter(Boolean)
    : [];

  const {
    helperText: _unusedHelperText,
    validation: _unusedValidation,
    ...restSource
  } = source;

  return {
    ...restSource,
    key,
    label,
    type,
    group,
    optional,
    ...(helperText ? { helperText } : {}),
    ...(validation ? { validation } : {}),
    applyTargets: applyTargets
      .map((target) => {
        const suggestedTransform =
          normalizeTemplateTargetTransform(target.transform) ||
          resolveSuggestedTransformForTarget(type, target.path);
        return stripUndefinedTransform({
          ...target,
          ...(suggestedTransform ? { transform: suggestedTransform } : {}),
        });
      }),
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
    const countdownTarget = resolveCountdownTargetIso(safeElement);
    return {
      elementType,
      path: "fechaObjetivo",
      defaultType: "date",
      defaultLabel: "Fecha del evento",
      defaultValue: normalizeText(countdownTarget.targetISO),
    };
  }

  if (elementType === "imagen") {
    const imageUrl = resolveObjectPrimaryAssetUrl(safeElement);
    return {
      elementType,
      path: "src",
      defaultType: "images",
      defaultLabel: "Imagen principal",
      defaultValue: imageUrl ? [imageUrl] : [],
      helperText: buildImageFieldHelperText(safeElement),
      validation: {
        maxItems: 1,
      },
    };
  }

  if (elementType === "galeria") {
    return {
      elementType,
      path: "cells",
      defaultType: "images",
      defaultLabel: "Fotos",
      defaultValue: collectGalleryElementMediaUrls(safeElement),
      helperText: buildGalleryFieldHelperText(),
      validation: {
        maxItems: resolveGalleryDefaultMaxItems(safeElement),
      },
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
    throw new Error("Solo se pueden crear campos dinamicos desde texto, countdown, imagen o galeria.");
  }

  const elementType = targetConfig.elementType;
  const defaultLabel =
    elementType === "countdown"
      ? targetConfig.defaultLabel
      : elementType === "texto"
        ? normalizeText(safeElement.texto).slice(0, 60) || targetConfig.defaultLabel
        : targetConfig.defaultLabel;
  const suggestedLabel =
    normalizeFieldLabel(label) || defaultLabel || "Campo";
  const key = generateFieldKey(suggestedLabel, existingFields);
  const normalizedType = (
    elementType === "imagen" || elementType === "galeria"
      ? "images"
      : normalizeFieldType(type || targetConfig.defaultType)
  );
  const resolvedGroup =
    elementType === "imagen" || elementType === "galeria"
      ? normalizeFieldGroup(group || DEFAULT_MEDIA_GROUP)
      : normalizeFieldGroup(group);

  return {
    key,
    label: suggestedLabel,
    type: normalizedType,
    group: resolvedGroup,
    optional: normalizeBoolean(optional, false),
    ...(targetConfig.helperText ? { helperText: targetConfig.helperText } : {}),
    ...(targetConfig.validation ? { validation: targetConfig.validation } : {}),
    applyTargets: [
      {
        scope: "objeto",
        id: elementId,
        path: targetConfig.path,
        mode: "set",
        ...(() => {
          const suggestedTransform = resolveSuggestedTransformForTarget(
            normalizedType,
            targetConfig.path
          );
          return suggestedTransform ? { transform: suggestedTransform } : {};
        })(),
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
  const suggestedTransform = resolveSuggestedTransformForTarget(targetField.type, safePath);

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
          ...(suggestedTransform ? { transform: suggestedTransform } : {}),
        },
      ],
    };
  } else {
    const nextTargets = targetField.applyTargets.map((target) => {
      if (
        target.scope !== "objeto" ||
        target.id !== safeElementId ||
        target.path !== safePath
      ) {
        return target;
      }

      const normalizedTransform = normalizeTemplateTargetTransform(target.transform);
      const sameTransform =
        (normalizedTransform?.kind || "") === (suggestedTransform?.kind || "") &&
        (normalizedTransform?.preset || "") === (suggestedTransform?.preset || "");
      if (sameTransform) return target;

      changed = true;
      return stripUndefinedTransform({
        ...target,
        ...(suggestedTransform ? { transform: suggestedTransform } : {}),
      });
    });

    nextFields[targetIndex] = {
      ...targetField,
      applyTargets: nextTargets,
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
    const nextHelperText = normalizeFieldHelperText(
      Object.prototype.hasOwnProperty.call(safePatch, "helperText")
        ? safePatch.helperText
        : normalized.helperText
    );
    const nextValidation = normalizeFieldValidation(
      Object.prototype.hasOwnProperty.call(safePatch, "validation")
        ? safePatch.validation
        : normalized.validation,
      nextType
    );
    const nextTargets = normalized.applyTargets.map((target) =>
      stripUndefinedTransform({
        ...target,
        ...(resolveSuggestedTransformForTarget(nextType, target.path)
          ? { transform: resolveSuggestedTransformForTarget(nextType, target.path) }
          : {}),
      })
    );

    if (
      nextLabel !== normalized.label ||
      nextType !== normalized.type ||
      nextGroup !== normalized.group ||
      nextOptional !== normalized.optional ||
      nextHelperText !== normalizeFieldHelperText(normalized.helperText) ||
      JSON.stringify(nextValidation || null) !== JSON.stringify(normalized.validation || null) ||
      JSON.stringify(nextTargets) !== JSON.stringify(normalized.applyTargets)
    ) {
      changed = true;
    }

    const {
      helperText: _unusedHelperText,
      validation: _unusedValidation,
      ...restNormalized
    } = normalized;
    return {
      ...restNormalized,
      label: nextLabel,
      type: nextType,
      group: nextGroup,
      optional: nextOptional,
      ...(nextHelperText ? { helperText: nextHelperText } : {}),
      ...(nextValidation ? { validation: nextValidation } : {}),
      applyTargets: nextTargets,
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

export function sanitizeAuthoringSchema({
  fieldsSchema,
  defaults,
  objetos,
  dropOrphans = true,
} = {}) {
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const safeDefaults = { ...asObject(defaults) };
  const objectIds = new Set(
    (Array.isArray(objetos) ? objetos : [])
      .map((objeto) => normalizeText(objeto?.id))
      .filter(Boolean)
  );

  const removedFieldKeys = [];
  const removedTargets = [];
  let changed = false;

  const nextFields = fields
    .map((field, index) => {
      const normalized = normalizeField(field, index);
      const nextTargets = normalized.applyTargets.filter((target) => {
        if (target.scope !== "objeto") return true;
        const targetId = normalizeText(target.id);
        if (!targetId || objectIds.has(targetId)) return true;

        changed = true;
        removedTargets.push({
          fieldKey: normalized.key,
          targetId,
          path: normalizeText(target.path) || null,
        });
        return false;
      });

      if (nextTargets.length === normalized.applyTargets.length) {
        return normalized;
      }

      return {
        ...normalized,
        applyTargets: nextTargets,
      };
    })
    .filter((field) => {
      if (!dropOrphans) return true;
      if (Array.isArray(field.applyTargets) && field.applyTargets.length > 0) {
        return true;
      }

      changed = true;
      removedFieldKeys.push(field.key);
      if (Object.prototype.hasOwnProperty.call(safeDefaults, field.key)) {
        delete safeDefaults[field.key];
      }
      return false;
    });

  return {
    fieldsSchema: nextFields,
    defaults: safeDefaults,
    changed,
    removedFieldKeys,
    removedTargets,
  };
}
