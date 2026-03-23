import { buildTemplateFormState, getChangedKeys } from "./formModel.js";
import { normalizeDraftRenderState } from "@/domain/drafts/sourceOfTruth";
import { resolveTemplateTargetValuePair } from "./fieldValueResolver.js";
import { shouldPreserveTextCenterPosition } from "@/lib/textCenteringPolicy";
import { measureTextPositionFromPreviewSemantics } from "@/lib/templatePreviewTextMeasure";
import { logTemplateDraftDebug } from "./draftPersonalizationDebug.js";
import {
  buildDynamicGalleryObjectPatch,
  buildFixedGalleryObjectPatch,
} from "./galleryDynamicMedia.js";

const DEFAULT_TEXT_CONTAINER_WIDTH_PX = 800;

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

function sanitizeImageUrls(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
}

function isDynamicGalleryObject(value) {
  return normalizeText(value?.galleryLayoutMode).toLowerCase() === "dynamic_media";
}

function replaceInText(baseText, findText, replaceText) {
  const source = String(baseText ?? "");
  const find = String(findText ?? "");
  const replace = String(replaceText ?? "");
  if (!find) return source;
  if (!source.includes(find)) return source;
  return source.split(find).join(replace);
}

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isDirectTextContentPath(path) {
  const segments = parsePath(path);
  return segments.length === 1 && normalizeText(segments[0]).toLowerCase() === "texto";
}

function shouldKeepTextBoxCenter(objeto) {
  return shouldPreserveTextCenterPosition(objeto);
}

function normalizeSectionMode(value) {
  return normalizeText(value).toLowerCase() === "pantalla" ? "pantalla" : "fijo";
}

function buildSectionModeById(secciones) {
  const out = new Map();
  if (!Array.isArray(secciones)) return out;

  secciones.forEach((seccion) => {
    const sectionId = normalizeText(seccion?.id);
    if (!sectionId) return;
    out.set(sectionId, normalizeSectionMode(seccion?.altoModo));
  });

  return out;
}

function buildTextMeasurementOptions(renderState, overrides) {
  const safeOverrides = overrides && typeof overrides === "object" ? overrides : {};
  const safeContainerWidthPx =
    toFiniteNumber(safeOverrides.containerWidthPx, DEFAULT_TEXT_CONTAINER_WIDTH_PX) ||
    DEFAULT_TEXT_CONTAINER_WIDTH_PX;

  return {
    containerWidthPx: safeContainerWidthPx,
    sectionModeById:
      safeOverrides.sectionModeById instanceof Map
        ? safeOverrides.sectionModeById
        : buildSectionModeById(renderState?.secciones),
  };
}

function resolveTextMeasurementContext(objeto, textMeasurementOptions) {
  const sectionModeById =
    textMeasurementOptions?.sectionModeById instanceof Map
      ? textMeasurementOptions.sectionModeById
      : null;
  const safeSectionId = normalizeText(objeto?.seccionId);

  return {
    containerWidthPx:
      toFiniteNumber(textMeasurementOptions?.containerWidthPx, DEFAULT_TEXT_CONTAINER_WIDTH_PX) ||
      DEFAULT_TEXT_CONTAINER_WIDTH_PX,
    sectionMode: normalizeSectionMode(sectionModeById?.get(safeSectionId)),
  };
}

function measureTextBox(objeto, textValue) {
  const fontSize = Math.max(6, toFiniteNumber(objeto?.fontSize, 24) || 24);
  const baseLineHeight = toFiniteNumber(objeto?.lineHeight, 1.2) || 1.2;
  const lineHeight = baseLineHeight * 0.92;
  const fontWeight = String(objeto?.fontWeight || "normal");
  const fontStyle = String(objeto?.fontStyle || "normal");
  const fontFamily = String(objeto?.fontFamily || "sans-serif");
  const letterSpacing = toFiniteNumber(objeto?.letterSpacing, 0) || 0;
  const normalizedText = String(textValue ?? "").replace(/[ \t]+$/gm, "");
  const lines = normalizedText.split(/\r?\n/);

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const fontForCanvas = fontFamily.includes(",")
        ? fontFamily
        : (/\s/.test(fontFamily) ? `"${fontFamily}"` : fontFamily);
      ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontForCanvas}`;

      const maxLineWidth = Math.max(
        ...lines.map((line) => {
          const safeLine = String(line || "");
          const baseWidth = ctx.measureText(safeLine).width;
          const spacingExtra = Math.max(0, safeLine.length - 1) * letterSpacing;
          return baseWidth + spacingExtra;
        }),
        20
      );

      return {
        width: maxLineWidth,
        height: fontSize * lineHeight * Math.max(lines.length, 1),
      };
    }
  }

  const fallbackWidth = Math.max(
    20,
    ...lines.map((line) => {
      const safeLine = String(line || "");
      return safeLine.length * (fontSize * 0.55) + Math.max(0, safeLine.length - 1) * letterSpacing;
    })
  );

  return {
    width: fallbackWidth,
    height: fontSize * lineHeight * Math.max(lines.length, 1),
  };
}

function getTextBoxCenter(objeto, textValue) {
  const x = toFiniteNumber(objeto?.x, 0) || 0;
  const y = toFiniteNumber(objeto?.y, 0) || 0;
  const rotationRad = ((toFiniteNumber(objeto?.rotation, 0) || 0) * Math.PI) / 180;
  const { width, height } = measureTextBox(objeto, textValue);
  const scaleX = toFiniteNumber(objeto?.scaleX, 1) || 1;
  const scaleY = toFiniteNumber(objeto?.scaleY, 1) || 1;
  const halfWidth = (width * scaleX) / 2;
  const halfHeight = (height * scaleY) / 2;

  return {
    centerX: x + (halfWidth * Math.cos(rotationRad)) - (halfHeight * Math.sin(rotationRad)),
    centerY: y + (halfWidth * Math.sin(rotationRad)) + (halfHeight * Math.cos(rotationRad)),
  };
}

function getTextPositionFromCenter(objeto, textValue, centerX, centerY) {
  const rotationRad = ((toFiniteNumber(objeto?.rotation, 0) || 0) * Math.PI) / 180;
  const { width, height } = measureTextBox(objeto, textValue);
  const scaleX = toFiniteNumber(objeto?.scaleX, 1) || 1;
  const scaleY = toFiniteNumber(objeto?.scaleY, 1) || 1;
  const halfWidth = (width * scaleX) / 2;
  const halfHeight = (height * scaleY) / 2;
  const offsetX = (halfWidth * Math.cos(rotationRad)) - (halfHeight * Math.sin(rotationRad));
  const offsetY = (halfWidth * Math.sin(rotationRad)) + (halfHeight * Math.cos(rotationRad));

  return {
    x: Number(centerX) - offsetX,
    y: Number(centerY) - offsetY,
  };
}

function setTextValuePreservingCenter(objeto, nextText, textMeasurementOptions) {
  if (!objeto || typeof objeto !== "object") return false;

  const currentText = String(objeto.texto ?? "");
  const resolvedNextText = String(nextText ?? "");
  if (currentText === resolvedNextText) return false;

  const shouldPreserveCenter = shouldKeepTextBoxCenter(objeto);
  const currentCenter = shouldPreserveCenter
    ? getTextBoxCenter(objeto, currentText)
    : null;
  const previewSemanticMeasure = shouldPreserveCenter
    ? measureTextPositionFromPreviewSemantics({
        objeto,
        nextText: resolvedNextText,
        ...resolveTextMeasurementContext(objeto, textMeasurementOptions),
      })
    : null;

  objeto.texto = resolvedNextText;

  if (
    shouldPreserveCenter &&
    previewSemanticMeasure?.usedFallback === false &&
    Number.isFinite(previewSemanticMeasure?.x) &&
    Number.isFinite(previewSemanticMeasure?.y)
  ) {
    objeto.x = previewSemanticMeasure.x;
    objeto.y = previewSemanticMeasure.y;
    logTemplateDraftDebug("personalization:text-update", {
      objectId: objeto.id || null,
      mode: "preview-semantic",
      currentText,
      nextText: resolvedNextText,
      shouldPreserveCenter,
      previewSemanticMeasure,
      finalPosition: {
        x: objeto.x ?? null,
        y: objeto.y ?? null,
      },
    });
    return true;
  }

  if (
    !shouldPreserveCenter ||
    !Number.isFinite(currentCenter?.centerX) ||
    !Number.isFinite(currentCenter?.centerY)
  ) {
    return true;
  }

  const nextPosition = getTextPositionFromCenter(
    objeto,
    resolvedNextText,
    currentCenter.centerX,
    currentCenter.centerY
  );

  if (Number.isFinite(nextPosition?.x)) {
    objeto.x = nextPosition.x;
  }
  if (Number.isFinite(nextPosition?.y)) {
    objeto.y = nextPosition.y;
  }

  logTemplateDraftDebug("personalization:text-update", {
    objectId: objeto.id || null,
    mode: shouldPreserveCenter ? "fallback-center" : "plain-set",
    currentText,
    nextText: resolvedNextText,
    shouldPreserveCenter,
    currentCenter,
    previewSemanticMeasure,
    nextPosition,
    finalPosition: {
      x: objeto.x ?? null,
      y: objeto.y ?? null,
    },
  });

  return true;
}

function setValueAtPath(target, path, value, textMeasurementOptions) {
  if (!target || typeof target !== "object") return false;
  const safePath = normalizeText(path);
  if (!safePath) return false;

  if (isDirectTextContentPath(safePath) && normalizeText(target.tipo).toLowerCase() === "texto") {
    return setTextValuePreservingCenter(target, value, textMeasurementOptions);
  }

  setByPath(target, safePath, value);
  return true;
}

function applyGalleryCells(targetObject, urls) {
  if (!targetObject || typeof targetObject !== "object") return false;
  const safeUrls = sanitizeImageUrls(urls);

  if (isDynamicGalleryObject(targetObject)) {
    const patch = buildDynamicGalleryObjectPatch({
      galleryObject: targetObject,
      mediaUrls: safeUrls,
    });
    Object.assign(targetObject, patch);
    return true;
  }

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
  Object.assign(targetObject, buildFixedGalleryObjectPatch(targetObject));
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
  textMeasurementOptions,
}) {
  if (!target || typeof target !== "object") return { applied: false };
  const safePath = normalizeText(path);
  if (!safePath) return { applied: false };

  if (safePath === "cells" && Array.isArray(nextValue)) {
    return { applied: applyGalleryCells(target, nextValue) };
  }

  const currentValue = getByPath(target, safePath);
  if (mode === "replace") {
    if (typeof currentValue === "string") {
      const replaced = replaceInText(currentValue, defaultValue, nextValue);
      if (replaced !== currentValue) {
        return {
          applied: setValueAtPath(target, safePath, replaced, textMeasurementOptions),
        };
      }
      if (normalizeText(nextValue) && normalizeText(defaultValue) === "") {
        return {
          applied: setValueAtPath(
            target,
            safePath,
            String(nextValue),
            textMeasurementOptions
          ),
        };
      }
      return { applied: false };
    }
  }

  return {
    applied: setValueAtPath(target, safePath, nextValue, textMeasurementOptions),
  };
}

function applyFallbackTextReplace({
  objetos,
  defaultValue,
  nextValue,
  textMeasurementOptions,
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
    setTextValuePreservingCenter(objeto, nextText, textMeasurementOptions);
    replacements += 1;
  });
  return replacements;
}

function applyFallbackGalleryReplace({ objetos, urls }) {
  if (!Array.isArray(objetos)) return 0;
  const safeUrls = sanitizeImageUrls(urls);

  const galeria = objetos.find(
    (objeto) =>
      normalizeText(objeto?.tipo).toLowerCase() === "galeria" &&
      Array.isArray(objeto?.cells)
  );
  if (!galeria) return 0;
  if (!safeUrls.length && !isDynamicGalleryObject(galeria)) return 0;

  const applied = applyGalleryCells(galeria, safeUrls);
  return applied ? 1 : 0;
}

export function buildDraftPersonalizationPatch({
  template,
  draftData,
  resolvedValues,
  measurementOptions,
}) {
  const safeTemplate = asObject(template);
  const safeDraftData = asObject(draftData);
  const safeResolvedValues = asObject(resolvedValues);
  const formState = buildTemplateFormState(safeTemplate);
  const renderState = normalizeDraftRenderState(safeDraftData);
  const textMeasurementOptions = buildTextMeasurementOptions(
    renderState,
    measurementOptions
  );

  const objetos = deepClone(renderState.objetos);
  const secciones = deepClone(renderState.secciones);
  let rsvp = renderState.rsvp ? deepClone(renderState.rsvp) : null;
  let gifts = renderState.gifts ? deepClone(renderState.gifts) : null;
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
      const resolvedTargetValues = resolveTemplateTargetValuePair({
        field,
        target,
        nextValue,
        defaultValue,
      });

      if (scope === "objeto") {
        const objeto = findObjetoById(objetos, targetId);
        if (!objeto) return;
        const result = applyTarget({
          target: objeto,
          path,
          mode,
          nextValue: resolvedTargetValues.nextValue,
          defaultValue: resolvedTargetValues.defaultValue,
          textMeasurementOptions,
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
          nextValue: resolvedTargetValues.nextValue,
          defaultValue: resolvedTargetValues.defaultValue,
          textMeasurementOptions,
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
          nextValue: resolvedTargetValues.nextValue,
          defaultValue: resolvedTargetValues.defaultValue,
          textMeasurementOptions,
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
        textMeasurementOptions,
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
  const debugTextObjects = objetos
    .filter((objeto) => normalizeText(objeto?.tipo).toLowerCase() === "texto")
    .map((objeto) => ({
      id: objeto?.id || null,
      text: String(objeto?.texto || ""),
      x: Number.isFinite(Number(objeto?.x)) ? Number(objeto.x) : null,
      y: Number.isFinite(Number(objeto?.y)) ? Number(objeto.y) : null,
      align: objeto?.align || null,
      width: Number.isFinite(Number(objeto?.width)) ? Number(objeto.width) : null,
      autoWidth: objeto?.__autoWidth !== false,
    }));

  logTemplateDraftDebug("personalization:patch-built", {
    changedKeys,
    report: {
      ...report,
      skippedFields: normalizedSkippedFields,
    },
    textObjects: debugTextObjects,
  });

  return {
    objetos,
    secciones,
    rsvp: rsvp || null,
    gifts: gifts || null,
    applyReport: {
      ...report,
      skippedFields: normalizedSkippedFields,
    },
    changedKeys,
    defaults,
  };
}
