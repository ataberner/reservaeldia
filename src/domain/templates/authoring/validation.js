import {
  isDateLikeTemplateFieldType,
  isImageTemplateTargetPath,
  isTextualTemplateTargetPath,
  normalizeTemplateTargetTransform,
} from "@/domain/templates/fieldValueResolver.js";

const ALLOWED_FIELD_TYPES = new Set([
  "text",
  "textarea",
  "date",
  "time",
  "datetime",
  "location",
  "url",
  "images",
]);

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function collectObjectIds(objetos) {
  if (!Array.isArray(objetos)) return new Set();
  return new Set(
    objetos
      .map((objeto) => normalizeText(objeto?.id))
      .filter(Boolean)
  );
}

function normalizeIssueList(issues) {
  return Array.from(
    new Set(
      (Array.isArray(issues) ? issues : [])
        .map((issue) => normalizeText(issue))
        .filter(Boolean)
    )
  );
}

export function validateAuthoringState({
  fieldsSchema,
  defaults,
  objetos,
} = {}) {
  const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
  const safeDefaults = asObject(defaults);
  const objectIds = collectObjectIds(objetos);
  const issues = [];
  const seenFieldKeys = new Set();
  const elementFieldMap = new Map();
  let targetCount = 0;

  fields.forEach((field, index) => {
    const safeField = asObject(field);
    const key = normalizeText(safeField.key);
    const label = normalizeText(safeField.label);
    const type = normalizeText(safeField.type).toLowerCase();
    const group = normalizeText(safeField.group);
    const applyTargets = Array.isArray(safeField.applyTargets)
      ? safeField.applyTargets
      : [];

    if (!key) {
      issues.push(`Campo #${index + 1}: falta key.`);
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(key)) {
      issues.push(`Campo '${key}': key invalida (solo letras, numeros y _).`);
    }

    if (seenFieldKeys.has(key)) {
      issues.push(`Campo '${key}': key duplicada.`);
    } else {
      seenFieldKeys.add(key);
    }

    if (!label) {
      issues.push(`Campo '${key}': falta label.`);
    }

    if (!type || !ALLOWED_FIELD_TYPES.has(type)) {
      issues.push(`Campo '${key}': tipo '${type || "vacio"}' no soportado.`);
    }

    if (!group) {
      issues.push(`Campo '${key}': falta group.`);
    }

    if (!hasOwn(safeDefaults, key)) {
      issues.push(`Campo '${key}': falta default asociado.`);
    }

    if (!applyTargets.length) {
      issues.push(`Campo '${key}': sin applyTargets.`);
      return;
    }

    applyTargets.forEach((target, targetIndex) => {
      targetCount += 1;
      const safeTarget = asObject(target);
      const scope = normalizeText(safeTarget.scope).toLowerCase();
      const targetId = normalizeText(safeTarget.id);
      const path = normalizeText(safeTarget.path);
      const transform = normalizeTemplateTargetTransform(safeTarget.transform);

      if (!scope || !path) {
        issues.push(`Campo '${key}': applyTarget #${targetIndex + 1} invalido (scope/path).`);
        return;
      }

      if ((scope === "objeto" || scope === "seccion") && !targetId) {
        issues.push(
          `Campo '${key}': applyTarget #${targetIndex + 1} invalido (falta id para scope '${scope}').`
        );
        return;
      }

      if (transform?.kind === "date_to_countdown_iso") {
        if (!isDateLikeTemplateFieldType(type)) {
          issues.push(
            `Campo '${key}': applyTarget #${targetIndex + 1} usa countdown sin ser campo fecha.`
          );
        }
        if (path.toLowerCase() !== "fechaobjetivo") {
          issues.push(
            `Campo '${key}': applyTarget #${targetIndex + 1} countdown debe apuntar a 'fechaObjetivo'.`
          );
        }
      }

      if (transform?.kind === "date_to_text") {
        if (!isDateLikeTemplateFieldType(type)) {
          issues.push(
            `Campo '${key}': applyTarget #${targetIndex + 1} formatea fecha sin ser campo fecha.`
          );
        }
        if (!isTextualTemplateTargetPath(path)) {
          issues.push(
            `Campo '${key}': applyTarget #${targetIndex + 1} date_to_text requiere un path textual.`
          );
        }
      }

      if (transform?.kind === "images_to_first_url") {
        if (type !== "images") {
          issues.push(
            `Campo '${key}': applyTarget #${targetIndex + 1} usa images_to_first_url sin ser campo fotos.`
          );
        }
        if (!isImageTemplateTargetPath(path)) {
          issues.push(
            `Campo '${key}': applyTarget #${targetIndex + 1} images_to_first_url requiere un path de imagen.`
          );
        }
      }

      if (scope === "objeto") {
        if (!objectIds.has(targetId)) {
          issues.push(
            `Campo '${key}': target '${targetId}' no existe en objetos actuales.`
          );
          return;
        }

        const alreadyLinkedField = elementFieldMap.get(targetId);
        if (alreadyLinkedField && alreadyLinkedField !== key) {
          issues.push(
            `Elemento '${targetId}' vinculado a mas de un campo ('${alreadyLinkedField}' y '${key}').`
          );
          return;
        }
        elementFieldMap.set(targetId, key);
      }
    });
  });

  const normalizedIssues = normalizeIssueList(issues);
  return {
    isReady: normalizedIssues.length === 0,
    issues: normalizedIssues,
    fieldCount: fields.length,
    targetCount,
  };
}
