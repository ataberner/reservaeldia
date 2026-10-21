const { EVENT_DETAILS_MODES, normalizeEventDetailsMode } = require("./eventDetailsConfig.cjs");

const EVENT_LAYOUT_VERSION = 1;
const EVENT_LAYOUT_FIELD = "eventLayout";
const EVENT_LAYOUT_MANAGED_FIELD = "__eventLayoutManaged";
const isRecord = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
const finite = value => typeof value === "number" && Number.isFinite(value);

function normalizeEventLayoutPose(value) {
  if (!isRecord(value) || !finite(value.x) || !finite(value.y)) return null;
  return { x: value.x, y: value.y, ...(finite(value.yNorm) ? { yNorm: value.yNorm } : {}) };
}

function normalizePositions(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, pose]) => {
    const normalized = normalizeEventLayoutPose(pose);
    return id && normalized ? [[id, normalized]] : [];
  }));
}

// Reading validates existing data only. It never initializes or migrates a layout.
function normalizeEventLayoutState(value) {
  if (!isRecord(value) || value.version !== EVENT_LAYOUT_VERSION ||
      !EVENT_DETAILS_MODES.includes(value.materializedMode) ||
      !isRecord(value.initialPositionsByMode) ||
      !EVENT_DETAILS_MODES.every(mode => isRecord(value.initialPositionsByMode[mode]))) return null;
  const materializedMode = value.materializedMode;
  return {
    version: EVENT_LAYOUT_VERSION,
    materializedMode,
    positionsByMode: Object.fromEntries(EVENT_DETAILS_MODES
      .filter(mode => mode !== materializedMode && isRecord(value.positionsByMode?.[mode]))
      .map(mode => [mode, normalizePositions(value.positionsByMode[mode])])),
    initialPositionsByMode: Object.fromEntries(EVENT_DETAILS_MODES
      .map(mode => [mode, normalizePositions(value.initialPositionsByMode[mode])])),
  };
}

function getSectionEventLayout(section) {
  return normalizeEventLayoutState(section?.[EVENT_LAYOUT_FIELD]);
}

function captureEventLayoutPositions(objetos, sectionId) {
  return Object.fromEntries((Array.isArray(objetos) ? objetos : [])
    .filter(object => object?.seccionId === sectionId && typeof object.id === "string" && object.id)
    .map(object => [object.id, {
      x: finite(object.x) ? object.x : 0,
      y: finite(object.y) ? object.y : 0,
      ...(finite(object.yNorm) ? { yNorm: object.yNorm } : {}),
    }]));
}

function applyEventLayoutPose(object, pose) {
  const normalized = normalizeEventLayoutPose(pose);
  if (!normalized) return object;
  const next = { ...object, x: normalized.x, y: normalized.y };
  if (Object.prototype.hasOwnProperty.call(normalized, "yNorm")) next.yNorm = normalized.yNorm;
  else delete next.yNorm;
  return next;
}

function stripEventLayoutTransientFields(object) {
  if (!isRecord(object)) return object;
  const children = Array.isArray(object.children) ? object.children.map(stripEventLayoutTransientFields) : null;
  const childrenChanged = children?.some((child, index) => child !== object.children[index]);
  if (!Object.prototype.hasOwnProperty.call(object, EVENT_LAYOUT_MANAGED_FIELD) && !childrenChanged) return object;
  const { [EVENT_LAYOUT_MANAGED_FIELD]: _managed, ...next } = object;
  if (childrenChanged) next.children = children;
  return next;
}

function resolveEventLayoutRenderObjects({ objetos, secciones, eventDetails, markManaged = false } = {}) {
  const mode = normalizeEventDetailsMode(eventDetails?.mode);
  const layouts = new Map((Array.isArray(secciones) ? secciones : [])
    .map(section => [section?.id, getSectionEventLayout(section)]));
  return (Array.isArray(objetos) ? objetos : []).map(object => {
    if (!isRecord(object)) return object;
    const layout = layouts.get(object.seccionId);
    let next = stripEventLayoutTransientFields(object);
    if (!layout) return next;
    // Active root coordinates are the authority; an old active slot is never read.
    if (layout.materializedMode !== mode) {
      next = applyEventLayoutPose(next, layout.positionsByMode[mode]?.[object.id]);
    }
    return markManaged ? { ...next, [EVENT_LAYOUT_MANAGED_FIELD]: true } : next;
  });
}

module.exports = {
  EVENT_LAYOUT_VERSION,
  EVENT_LAYOUT_FIELD,
  EVENT_LAYOUT_MANAGED_FIELD,
  normalizeEventLayoutPose,
  normalizeEventLayoutState,
  getSectionEventLayout,
  captureEventLayoutPositions,
  applyEventLayoutPose,
  stripEventLayoutTransientFields,
  resolveEventLayoutRenderObjects,
};
