import { buildTemplateFormState, getChangedKeys } from "./formModel.js";
import { normalizeDraftRenderState } from "@/domain/drafts/sourceOfTruth";

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function deepClone(value) {
  if (Array.isArray(value)) return value.map((entry) => deepClone(entry));
  if (!value || typeof value !== "object") return value;

  const out = {};
  Object.entries(value).forEach(([key, nested]) => {
    out[key] = deepClone(nested);
  });
  return out;
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

function getByPath(root, path) {
  const segments = parsePath(path);
  let current = root;
  for (const segment of segments) {
    if (current === null || typeof current === "undefined") return undefined;
    current = current[segment];
  }
  return current;
}

function setByPath(root, path, value) {
  const segments = parsePath(path);
  if (!segments.length || !root || typeof root !== "object") return false;

  let current = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const nextSegment = segments[index + 1];
    if (typeof current[segment] === "undefined" || current[segment] === null) {
      const shouldBeArray = /^\d+$/.test(nextSegment);
      current[segment] = shouldBeArray ? [] : {};
    }
    current = current[segment];
    if (!current || typeof current !== "object") return false;
  }

  current[segments[segments.length - 1]] = value;
  return true;
}

function normalizeCountdownDateValue(value) {
  const raw = normalizeText(value);
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toISOString();
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toISOString();
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toISOString();
}

function normalizeValueForTargetPath(path, value) {
  const safePath = normalizeText(path);
  if (!safePath) return value;
  if (safePath === "fechaObjetivo") {
    return normalizeCountdownDateValue(value);
  }
  return value;
}

function sanitizeImageUrls(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
}

function replaceInText(baseText, findText, replaceText) {
  const source = String(baseText ?? "");
  const find = String(findText ?? "");
  const replace = String(replaceText ?? "");
  if (!find) return source;
  if (!source.includes(find)) return source;
  return source.split(find).join(replace);
}

function applyGalleryCells(targetObject, urls) {
  if (!targetObject || typeof targetObject !== "object") return false;
  const safeUrls = sanitizeImageUrls(urls);
  if (!safeUrls.length) return false;

  const cells = Array.isArray(targetObject.cells) ? targetObject.cells : [];
  const cellCount = cells.length || safeUrls.length;
  const nextCells = Array.from({ length: cellCount }, (_, index) => {
    const currentCell = cells[index] && typeof cells[index] === "object" ? cells[index] : {};
    const fallbackUrl = normalizeText(currentCell.mediaUrl || currentCell.url || currentCell.src);
    const nextUrl = safeUrls[index] || fallbackUrl || "";

    return {
      ...currentCell,
      mediaUrl: nextUrl,
      fit: normalizeText(currentCell.fit) || "cover",
      bg: normalizeText(currentCell.bg) || "#f3f4f6",
    };
  });

  targetObject.cells = nextCells;
  return true;
}

function findObjetoById(objetos, id) {
  if (!Array.isArray(objetos)) return null;
  const safeId = normalizeText(id);
  if (!safeId) return null;
  return objetos.find((objeto) => normalizeText(objeto?.id) === safeId) || null;
}

function findSeccionById(secciones, id) {
  if (!Array.isArray(secciones)) return null;
  const safeId = normalizeText(id);
  if (!safeId) return null;
  return secciones.find((seccion) => normalizeText(seccion?.id) === safeId) || null;
}

function applyTarget({
  target,
  path,
  mode,
  nextValue,
  defaultValue,
}) {
  if (!target || typeof target !== "object") return { applied: false };
  const safePath = normalizeText(path);
  if (!safePath) return { applied: false };

  const normalizedNextValue = normalizeValueForTargetPath(safePath, nextValue);

  if (safePath === "cells" && Array.isArray(normalizedNextValue)) {
    return { applied: applyGalleryCells(target, normalizedNextValue) };
  }

  const currentValue = getByPath(target, safePath);
  if (mode === "replace") {
    if (typeof currentValue === "string") {
      const replaced = replaceInText(currentValue, defaultValue, nextValue);
      if (replaced !== currentValue) {
        setByPath(target, safePath, replaced);
        return { applied: true };
      }
      if (normalizeText(normalizedNextValue) && normalizeText(defaultValue) === "") {
        setByPath(target, safePath, String(normalizedNextValue));
        return { applied: true };
      }
      return { applied: false };
    }
  }

  setByPath(target, safePath, normalizedNextValue);
  return { applied: true };
}

function applyFallbackTextReplace({
  objetos,
  defaultValue,
  nextValue,
}) {
  const find = String(defaultValue ?? "");
  const replace = String(nextValue ?? "");
  if (!find || find === replace) return 0;
  if (!Array.isArray(objetos)) return 0;

  let replacements = 0;
  objetos.forEach((objeto) => {
    if (!objeto || typeof objeto !== "object") return;
    if (normalizeText(objeto.tipo).toLowerCase() !== "texto") return;
    const currentText = String(objeto.texto ?? "");
    const nextText = replaceInText(currentText, find, replace);
    if (nextText === currentText) return;
    objeto.texto = nextText;
    replacements += 1;
  });
  return replacements;
}

function applyFallbackGalleryReplace({ objetos, urls }) {
  if (!Array.isArray(objetos)) return 0;
  const safeUrls = sanitizeImageUrls(urls);
  if (!safeUrls.length) return 0;

  const galeria = objetos.find(
    (objeto) =>
      normalizeText(objeto?.tipo).toLowerCase() === "galeria" &&
      Array.isArray(objeto?.cells)
  );
  if (!galeria) return 0;

  const applied = applyGalleryCells(galeria, safeUrls);
  return applied ? 1 : 0;
}

export function buildDraftPersonalizationPatch({
  template,
  draftData,
  resolvedValues,
}) {
  const safeTemplate = asObject(template);
  const safeDraftData = asObject(draftData);
  const safeResolvedValues = asObject(resolvedValues);
  const formState = buildTemplateFormState(safeTemplate);
  const renderState = normalizeDraftRenderState(safeDraftData);

  const objetos = deepClone(renderState.objetos);
  const secciones = deepClone(renderState.secciones);
  let rsvp = renderState.rsvp ? deepClone(renderState.rsvp) : null;
  const defaults = asObject(formState.defaults);
  const changedKeys = getChangedKeys({
    fields: formState.fields,
    defaults,
    resolvedValues: safeResolvedValues,
  });

  const report = {
    fieldsProcessed: formState.fields.length,
    fieldsChanged: changedKeys.length,
    targetsApplied: 0,
    fallbackReplacements: 0,
    skippedFields: [],
  };

  formState.fields.forEach((field) => {
    const key = field.key;
    if (!changedKeys.includes(key)) return;

    const nextValue = safeResolvedValues[key];
    const defaultValue = defaults[key];
    const applyTargets = Array.isArray(field.applyTargets) ? field.applyTargets : [];
    let appliedInField = 0;

    applyTargets.forEach((target) => {
      const scope = normalizeText(target?.scope).toLowerCase();
      const path = target?.path;
      const mode = normalizeText(target?.mode).toLowerCase() === "replace" ? "replace" : "set";
      const targetId = target?.id;

      if (scope === "objeto") {
        const objeto = findObjetoById(objetos, targetId);
        if (!objeto) return;
        const result = applyTarget({
          target: objeto,
          path,
          mode,
          nextValue,
          defaultValue,
        });
        if (result.applied) {
          appliedInField += 1;
          report.targetsApplied += 1;
        }
        return;
      }

      if (scope === "seccion") {
        const seccion = findSeccionById(secciones, targetId);
        if (!seccion) return;
        const result = applyTarget({
          target: seccion,
          path,
          mode,
          nextValue,
          defaultValue,
        });
        if (result.applied) {
          appliedInField += 1;
          report.targetsApplied += 1;
        }
        return;
      }

      if (scope === "rsvp") {
        const rsvpTarget = rsvp || {};
        const result = applyTarget({
          target: rsvpTarget,
          path,
          mode,
          nextValue,
          defaultValue,
        });
        if (result.applied) {
          appliedInField += 1;
          report.targetsApplied += 1;
          rsvp = rsvpTarget;
        }
      }
    });

    if (appliedInField > 0) return;

    if (field.type === "images") {
      const replaced = applyFallbackGalleryReplace({
        objetos,
        urls: nextValue,
      });
      report.fallbackReplacements += replaced;
      if (!replaced) {
        report.skippedFields.push(key);
      }
      return;
    }

    if (typeof defaultValue === "string" && typeof nextValue === "string") {
      const replaced = applyFallbackTextReplace({
        objetos,
        defaultValue,
        nextValue,
      });
      report.fallbackReplacements += replaced;
      if (!replaced) {
        report.skippedFields.push(key);
      }
      return;
    }

    report.skippedFields.push(key);
  });

  const normalizedSkippedFields = Array.from(
    new Set(report.skippedFields.map((entry) => normalizeText(entry)).filter(Boolean))
  );

  return {
    objetos,
    secciones,
    rsvp: rsvp || null,
    applyReport: {
      ...report,
      skippedFields: normalizedSkippedFields,
    },
    changedKeys,
    defaults,
  };
}
