import { forEachRenderObject } from "../editor/renderObjectTree.js";
import { isTextualTemplateTargetPath } from "./fieldValueResolver.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeFieldKeys(value) {
  const source = Array.isArray(value) ? value : [value];
  return source.map((entry) => normalizeText(entry)).filter(Boolean);
}

function buildObjectOrderIndex(objetos) {
  const orderById = new Map();
  let index = 0;
  forEachRenderObject(objetos, (object) => {
    const id = normalizeText(object?.id);
    if (!id || orderById.has(id)) return;
    orderById.set(id, index);
    index += 1;
  });
  return orderById;
}

function normalizeTarget(target) {
  const safeTarget = asObject(target);
  const objectId = normalizeText(safeTarget.id);
  if (!objectId) return null;
  if (normalizeText(safeTarget.scope).toLowerCase() !== "objeto") return null;

  return {
    ...safeTarget,
    id: objectId,
    path: normalizeText(safeTarget.path),
  };
}

function isRenderableTargetObject(object) {
  const safeObject = asObject(object);
  if (!normalizeText(safeObject.id)) return false;
  if (safeObject.hidden === true) return false;
  if (safeObject.visible === false) return false;
  if (safeObject.mostrar === false) return false;
  const type = normalizeText(safeObject.tipo).toLowerCase();
  if (type === "countdown" && safeObject.mostrarCuentaRegresiva === false) {
    return false;
  }
  if (type === "mapa-google" && safeObject.mostrarMapa === false) {
    return false;
  }
  return true;
}

function collectFieldCandidates({ field, fieldKey, objectOrder, objectById }) {
  const targets = Array.isArray(field?.applyTargets) ? field.applyTargets : [];
  return targets
    .map(normalizeTarget)
    .filter(Boolean)
    .map((target, targetIndex) => {
      const object = objectById.get(target.id) || null;
      if (!isRenderableTargetObject(object)) return null;
      return {
        field,
        fieldKey,
        target,
        object,
        objectId: target.id,
        targetIndex,
        objectOrder: objectOrder.has(target.id)
          ? objectOrder.get(target.id)
          : Number.POSITIVE_INFINITY,
        isTextualTarget: isTextualTemplateTargetPath(target.path),
      };
    })
    .filter(Boolean);
}

export function resolveDynamicFieldScrollTarget({
  fieldsSchema,
  fieldKeys,
  objetos,
} = {}) {
  const keys = normalizeFieldKeys(fieldKeys);
  if (!keys.length) return null;

  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const fieldByKey = new Map(
    fields
      .map((field) => [normalizeText(field?.key), field])
      .filter(([key]) => Boolean(key))
  );
  const objectOrder = buildObjectOrderIndex(objetos);
  const objectById = new Map();
  forEachRenderObject(objetos, (object) => {
    const id = normalizeText(object?.id);
    if (id && !objectById.has(id)) objectById.set(id, object);
  });

  for (const fieldKey of keys) {
    const field = fieldByKey.get(fieldKey);
    if (!field) continue;

    const candidates = collectFieldCandidates({
      field,
      fieldKey,
      objectOrder,
      objectById,
    });
    if (!candidates.length) continue;

    candidates.sort((left, right) => {
      if (left.isTextualTarget !== right.isTextualTarget) {
        return left.isTextualTarget ? -1 : 1;
      }
      if (left.objectOrder !== right.objectOrder) {
        return left.objectOrder - right.objectOrder;
      }
      return left.targetIndex - right.targetIndex;
    });

    return candidates[0];
  }

  return null;
}
