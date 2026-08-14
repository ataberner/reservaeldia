import {
  canEditObject,
  canInsertIntoSection,
} from "./protectedSections.js";
import {
  sanitizeMovedGroupFunctionalAssociation,
} from "../../../shared/functionalAssociations.js";

export const CANVAS_KEYBOARD_NUDGE_PX = 1;

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeSelectedIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);
}

export function clampNormalizedPosition(value) {
  return Math.max(0, Math.min(1, value));
}

export function resolveCanvasKeyboardNudgeIntent({
  key,
  canMoveSelection = false,
  isEditing = false,
  isTyping = false,
  defaultPrevented = false,
  step = CANVAS_KEYBOARD_NUDGE_PX,
} = {}) {
  if (
    !canMoveSelection ||
    isEditing ||
    isTyping ||
    defaultPrevented
  ) {
    return null;
  }

  const safeStep = Math.abs(toFiniteNumber(step, CANVAS_KEYBOARD_NUDGE_PX));
  const normalizedKey = String(key || "").trim().toLowerCase();

  if (normalizedKey === "arrowleft") return { deltaX: -safeStep, deltaY: 0 };
  if (normalizedKey === "arrowright") return { deltaX: safeStep, deltaY: 0 };
  if (normalizedKey === "arrowup") return { deltaX: 0, deltaY: -safeStep };
  if (normalizedKey === "arrowdown") return { deltaX: 0, deltaY: safeStep };
  return null;
}

export function canonicalizeFinalizedDragPatch({
  objOriginal,
  dragPatch,
  seccionesOrdenadas,
  determinarNuevaSeccion,
  convertirAbsARel,
  esSeccionPantallaById,
  ALTURA_PANTALLA_EDITOR,
}) {
  if (!canEditObject(objOriginal, { secciones: seccionesOrdenadas })) {
    return {};
  }

  const { nuevaSeccion, coordenadasAjustadas } = determinarNuevaSeccion(
    dragPatch.y,
    objOriginal.seccionId,
    seccionesOrdenadas
  );
  if (nuevaSeccion && !canInsertIntoSection(nuevaSeccion, seccionesOrdenadas)) {
    return {
      x: objOriginal.x,
      y: objOriginal.y,
      ...(objOriginal.yNorm != null ? { yNorm: objOriginal.yNorm } : {}),
      seccionId: objOriginal.seccionId,
    };
  }

  let nextPatch = { ...dragPatch };
  delete nextPatch.finalizoDrag;

  if (nuevaSeccion) {
    nextPatch = {
      ...nextPatch,
      ...coordenadasAjustadas,
      seccionId: nuevaSeccion,
    };
  } else {
    nextPatch.y = convertirAbsARel(
      dragPatch.y,
      objOriginal.seccionId,
      seccionesOrdenadas
    );
  }

  const seccionFinalId = nextPatch.seccionId || objOriginal.seccionId;
  const yRelPx = Number.isFinite(nextPatch.y) ? nextPatch.y : 0;

  if (esSeccionPantallaById(seccionFinalId)) {
    const safePantallaHeight =
      Number.isFinite(ALTURA_PANTALLA_EDITOR) && ALTURA_PANTALLA_EDITOR > 0
        ? ALTURA_PANTALLA_EDITOR
        : 1;
    nextPatch.yNorm = clampNormalizedPosition(yRelPx / safePantallaHeight);
    delete nextPatch.y;
  } else {
    nextPatch.y = yRelPx;
    delete nextPatch.yNorm;
  }

  return nextPatch;
}

function buildKeyboardNudgeDragPatch({
  object,
  deltaX,
  deltaY,
  seccionesOrdenadas,
  calcularOffsetY,
  esSeccionPantallaById,
  ALTURA_PANTALLA_EDITOR,
}) {
  const sectionIndex = seccionesOrdenadas.findIndex(
    (section) => section?.id === object?.seccionId
  );
  if (sectionIndex < 0) return null;

  const safePantallaHeight = Math.max(
    1,
    toFiniteNumber(ALTURA_PANTALLA_EDITOR, 1)
  );
  const localY =
    esSeccionPantallaById(object.seccionId) && Number.isFinite(Number(object.yNorm))
      ? Number(object.yNorm) * safePantallaHeight
      : toFiniteNumber(object.y, 0);
  const sectionOffsetY = toFiniteNumber(
    calcularOffsetY(seccionesOrdenadas, sectionIndex),
    0
  );

  return {
    x: toFiniteNumber(object.x, 0) + toFiniteNumber(deltaX, 0),
    y: sectionOffsetY + localY + toFiniteNumber(deltaY, 0),
  };
}

function patchChangesObject(object, patch) {
  const keys = Object.keys(patch || {});
  return keys.some((key) => !Object.is(object?.[key], patch[key]));
}

export function applyKeyboardNudgeToCanvasSelection({
  objetos,
  selectedIds,
  seccionesOrdenadas,
  deltaX = 0,
  deltaY = 0,
  calcularOffsetY,
  determinarNuevaSeccion,
  convertirAbsARel,
  esSeccionPantallaById,
  ALTURA_PANTALLA_EDITOR,
} = {}) {
  const safeObjects = Array.isArray(objetos) ? objetos : [];
  const safeSections = Array.isArray(seccionesOrdenadas) ? seccionesOrdenadas : [];
  const safeSelectedIds = normalizeSelectedIds(selectedIds);
  const hasMovement =
    toFiniteNumber(deltaX, 0) !== 0 || toFiniteNumber(deltaY, 0) !== 0;

  if (
    safeSelectedIds.length !== 1 ||
    !hasMovement ||
    typeof calcularOffsetY !== "function" ||
    typeof determinarNuevaSeccion !== "function" ||
    typeof convertirAbsARel !== "function" ||
    typeof esSeccionPantallaById !== "function"
  ) {
    return { objetos, changed: false, movedObjectId: null, patch: null };
  }

  const selectedId = safeSelectedIds[0];
  const objectIndex = safeObjects.findIndex(
    (object) => String(object?.id ?? "").trim() === selectedId
  );
  if (objectIndex < 0) {
    return { objetos, changed: false, movedObjectId: null, patch: null };
  }

  const currentObject = safeObjects[objectIndex];
  const dragPatch = buildKeyboardNudgeDragPatch({
    object: currentObject,
    deltaX,
    deltaY,
    seccionesOrdenadas: safeSections,
    calcularOffsetY,
    esSeccionPantallaById,
    ALTURA_PANTALLA_EDITOR,
  });
  if (!dragPatch) {
    return { objetos, changed: false, movedObjectId: null, patch: null };
  }

  const positionPatch = canonicalizeFinalizedDragPatch({
    objOriginal: currentObject,
    dragPatch,
    seccionesOrdenadas: safeSections,
    determinarNuevaSeccion,
    convertirAbsARel,
    esSeccionPantallaById,
    ALTURA_PANTALLA_EDITOR,
  });
  if (!patchChangesObject(currentObject, positionPatch)) {
    return { objetos, changed: false, movedObjectId: null, patch: positionPatch };
  }

  const nextObjects = [...safeObjects];
  nextObjects[objectIndex] = {
    ...currentObject,
    ...positionPatch,
  };

  const sanitized = sanitizeMovedGroupFunctionalAssociation({
    secciones: safeSections,
    objetos: nextObjects,
    groupId: selectedId,
    previousSectionId: currentObject.seccionId,
  });

  return {
    objetos: sanitized.changed ? sanitized.objetos : nextObjects,
    changed: true,
    movedObjectId: selectedId,
    patch: positionPatch,
  };
}
