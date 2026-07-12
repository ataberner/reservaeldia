const FUNCTIONAL_ASSOCIATION_VALUES = Object.freeze(["rsvp", "gifts"]);
const FUNCTIONAL_ASSOCIATION_SET = new Set(FUNCTIONAL_ASSOCIATION_VALUES);
const FUNCTIONAL_ASSOCIATION_FIELD = "functionalAssociation";
const FUNCTIONAL_RENDER_OFFSET_X_FIELD = "__functionalRenderOffsetX";
const DEFAULT_CANVAS_WIDTH = 800;

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase();
}

function deepClone(value) {
  if (Array.isArray(value)) return value.map((entry) => deepClone(entry));
  if (!value || typeof value !== "object") return value;
  const next = {};
  Object.entries(value).forEach(([key, nestedValue]) => {
    next[key] = deepClone(nestedValue);
  });
  return next;
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toPositiveNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function roundMetric(value, precision = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const factor = 10 ** precision;
  return Math.round(parsed * factor) / factor;
}

function normalizeFunctionalAssociation(value) {
  const normalized = normalizeLowerText(value);
  if (normalized === "rsvp" || normalized === "confirmacion" || normalized === "confirmacion-asistencia") {
    return "rsvp";
  }
  if (normalized === "gifts" || normalized === "gift" || normalized === "regalo" || normalized === "regalos") {
    return "gifts";
  }
  return null;
}

function setFunctionalAssociationField(record, association) {
  const safeRecord = asObject(record);
  const normalized = normalizeFunctionalAssociation(association);
  if (normalized) {
    return {
      ...safeRecord,
      [FUNCTIONAL_ASSOCIATION_FIELD]: normalized,
    };
  }

  const {
    [FUNCTIONAL_ASSOCIATION_FIELD]: _functionalAssociation,
    ...rest
  } = safeRecord;
  return rest;
}

function isGroupObject(value) {
  return normalizeLowerText(asObject(value).tipo) === "grupo";
}

function isRsvpCta(value) {
  return normalizeLowerText(asObject(value).tipo) === "rsvp-boton";
}

function isGiftCta(value) {
  return normalizeLowerText(asObject(value).tipo) === "regalo-boton";
}

function isFunctionalCta(value) {
  return isRsvpCta(value) || isGiftCta(value);
}

function isCtaHidden(value) {
  const safeValue = asObject(value);
  return isFunctionalCta(safeValue) && safeValue.hidden === true;
}

function findVisibleFunctionalCta(items, predicate) {
  if (!Array.isArray(items)) return false;
  for (const item of items) {
    const safeItem = asObject(item);
    if (predicate(safeItem) && !isCtaHidden(safeItem)) {
      return true;
    }
    if (Array.isArray(safeItem.children) && findVisibleFunctionalCta(safeItem.children, predicate)) {
      return true;
    }
  }
  return false;
}

function parseEnabledFlag(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "si", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return fallback;
}

function hasOwnEnabled(config) {
  return Boolean(
    config &&
      typeof config === "object" &&
      !Array.isArray(config) &&
      Object.prototype.hasOwnProperty.call(config, "enabled")
  );
}

function resolveFeatureEnabled({ config, fallbackVisible }) {
  if (hasOwnEnabled(config)) {
    return parseEnabledFlag(config.enabled, false);
  }
  if (typeof fallbackVisible === "boolean") {
    return fallbackVisible;
  }
  return Boolean(config && typeof config === "object" && !Array.isArray(config));
}

function resolveFunctionalEnabledState({ objetos, rsvp, gifts } = {}) {
  const safeObjetos = Array.isArray(objetos) ? objetos : [];
  return {
    rsvp: resolveFeatureEnabled({
      config: rsvp,
      fallbackVisible: findVisibleFunctionalCta(safeObjetos, isRsvpCta),
    }),
    gifts: resolveFeatureEnabled({
      config: gifts,
      fallbackVisible: findVisibleFunctionalCta(safeObjetos, isGiftCta),
    }),
  };
}

function normalizeFunctionalConfigs({ objetos, rsvp, gifts } = {}) {
  const safeObjetos = Array.isArray(objetos) ? objetos : [];
  const rsvpFallbackVisible = findVisibleFunctionalCta(safeObjetos, isRsvpCta);
  const giftsFallbackVisible = findVisibleFunctionalCta(safeObjetos, isGiftCta);
  const enabled = {
    rsvp: resolveFeatureEnabled({
      config: rsvp,
      fallbackVisible: rsvpFallbackVisible,
    }),
    gifts: resolveFeatureEnabled({
      config: gifts,
      fallbackVisible: giftsFallbackVisible,
    }),
  };
  const hasRsvpSource = Boolean(rsvp && typeof rsvp === "object" && !Array.isArray(rsvp));
  const hasGiftsSource = Boolean(gifts && typeof gifts === "object" && !Array.isArray(gifts));
  const normalizedRsvp =
    hasRsvpSource
      ? { ...rsvp, enabled: enabled.rsvp }
      : rsvpFallbackVisible
        ? { enabled: enabled.rsvp }
        : null;
  const normalizedGifts =
    hasGiftsSource
      ? { ...gifts, enabled: enabled.gifts }
      : giftsFallbackVisible
        ? { enabled: enabled.gifts }
        : null;

  return {
    rsvp: normalizedRsvp,
    gifts: normalizedGifts,
    enabled,
  };
}

function normalizeCtaVisibilityForFeatureState(object, enabledState) {
  const safeObject = asObject(object);
  let next = safeObject;

  if (isRsvpCta(safeObject)) {
    next = {
      ...next,
      hidden: !enabledState.rsvp,
    };
  } else if (isGiftCta(safeObject)) {
    next = {
      ...next,
      hidden: !enabledState.gifts,
    };
  }

  if (Array.isArray(next.children)) {
    next = {
      ...next,
      children: next.children.map((child) => normalizeCtaVisibilityForFeatureState(child, enabledState)),
    };
  }

  return next;
}

function resolveObjectWidth(object) {
  const safeObject = asObject(object);
  return (
    toPositiveNumber(safeObject.width, 0) ||
    toPositiveNumber(safeObject.ancho, 0) ||
    toPositiveNumber(safeObject.w, 0) ||
    toPositiveNumber(safeObject.alto, 0) ||
    toPositiveNumber(safeObject.height, 0) ||
    0
  );
}

function resolveObjectHeight(object) {
  const safeObject = asObject(object);
  return (
    toPositiveNumber(safeObject.height, 0) ||
    toPositiveNumber(safeObject.alto, 0) ||
    toPositiveNumber(safeObject.h, 0) ||
    toPositiveNumber(safeObject.ancho, 0) ||
    toPositiveNumber(safeObject.width, 0) ||
    0
  );
}

function transformPoint(point, { rotation = 0, scaleX = 1, scaleY = 1 } = {}) {
  const radians = (Math.PI / 180) * toFiniteNumber(rotation, 0);
  const x = toFiniteNumber(point.x, 0) * toFiniteNumber(scaleX, 1);
  const y = toFiniteNumber(point.y, 0) * toFiniteNumber(scaleY, 1);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

function boundsFromPoints(points) {
  const validPoints = (Array.isArray(points) ? points : []).filter(
    (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y)
  );
  if (!validPoints.length) return null;
  const xs = validPoints.map((point) => point.x);
  const ys = validPoints.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function unionBounds(boundsList) {
  const validBounds = (Array.isArray(boundsList) ? boundsList : []).filter(
    (bounds) =>
      bounds &&
      Number.isFinite(bounds.left) &&
      Number.isFinite(bounds.top) &&
      Number.isFinite(bounds.right) &&
      Number.isFinite(bounds.bottom)
  );
  if (!validBounds.length) return null;
  const left = Math.min(...validBounds.map((bounds) => bounds.left));
  const top = Math.min(...validBounds.map((bounds) => bounds.top));
  const right = Math.max(...validBounds.map((bounds) => bounds.right));
  const bottom = Math.max(...validBounds.map((bounds) => bounds.bottom));
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function resolveObjectLocalBounds(object) {
  const safeObject = asObject(object);
  const x = toFiniteNumber(safeObject.x, 0);
  const y = toFiniteNumber(safeObject.y, 0);
  const width = resolveObjectWidth(safeObject);
  const height = resolveObjectHeight(safeObject);
  if (width <= 0 || height <= 0) return null;

  const localCorners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ].map((point) => transformPoint(point, {
    rotation: safeObject.rotation,
    scaleX: safeObject.scaleX,
    scaleY: safeObject.scaleY,
  }));

  return boundsFromPoints(localCorners.map((point) => ({
    x: x + point.x,
    y: y + point.y,
  })));
}

function resolveGroupContentLocalBounds(group) {
  const safeGroup = asObject(group);
  const childBounds = Array.isArray(safeGroup.children)
    ? safeGroup.children.map((child) => resolveObjectLocalBounds(child)).filter(Boolean)
    : [];
  const union = unionBounds(childBounds);
  if (union && union.width > 0 && union.height > 0) return union;

  const width = toPositiveNumber(safeGroup.width, 0);
  const height = toPositiveNumber(safeGroup.height, 0);
  if (width <= 0 || height <= 0) return null;
  return {
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
  };
}

function resolveGroupAbsoluteBounds(group) {
  const safeGroup = asObject(group);
  const local = resolveGroupContentLocalBounds(safeGroup);
  if (!local) return null;
  const x = toFiniteNumber(safeGroup.x, 0);
  const y = toFiniteNumber(safeGroup.y, 0);
  const corners = [
    { x: local.left, y: local.top },
    { x: local.right, y: local.top },
    { x: local.right, y: local.bottom },
    { x: local.left, y: local.bottom },
  ].map((point) => transformPoint(point, {
    rotation: safeGroup.rotation,
    scaleX: safeGroup.scaleX,
    scaleY: safeGroup.scaleY,
  }));

  const transformed = boundsFromPoints(corners.map((point) => ({
    x: x + point.x,
    y: y + point.y,
  })));
  return transformed;
}

function buildSectionLookup(secciones) {
  const lookup = new Map();
  (Array.isArray(secciones) ? secciones : []).forEach((section) => {
    const safeSection = asObject(section);
    const sectionId = normalizeText(safeSection.id);
    if (sectionId) lookup.set(sectionId, safeSection);
  });
  return lookup;
}

function collectFunctionalGroupsBySection(objetos, visibleSectionIds) {
  const groupsBySection = new Map();
  (Array.isArray(objetos) ? objetos : []).forEach((object) => {
    const safeObject = asObject(object);
    if (!isGroupObject(safeObject)) return;
    const sectionId = normalizeText(safeObject.seccionId);
    if (!sectionId || (visibleSectionIds && !visibleSectionIds.has(sectionId))) return;
    const association = normalizeFunctionalAssociation(safeObject[FUNCTIONAL_ASSOCIATION_FIELD]);
    if (!association) return;
    if (!groupsBySection.has(sectionId)) {
      groupsBySection.set(sectionId, {
        rsvp: [],
        gifts: [],
      });
    }
    groupsBySection.get(sectionId)[association].push(safeObject);
  });
  return groupsBySection;
}

function addRenderOffset(object, deltaX, { materializeOffsets = true } = {}) {
  const safeObject = asObject(object);
  const roundedDelta = roundMetric(deltaX, 3);
  if (!roundedDelta) return safeObject;
  if (materializeOffsets) {
    return {
      ...safeObject,
      x: roundMetric(toFiniteNumber(safeObject.x, 0) + roundedDelta, 3),
    };
  }
  return {
    ...safeObject,
    [FUNCTIONAL_RENDER_OFFSET_X_FIELD]: roundedDelta,
  };
}

function applyFunctionalAssociationsToRenderState({
  secciones,
  objetos,
  rsvp = null,
  gifts = null,
  canvasWidth = DEFAULT_CANVAS_WIDTH,
  materializeOffsets = true,
} = {}) {
  const safeSecciones = Array.isArray(secciones) ? secciones.map((section) => deepClone(section)) : [];
  const sourceObjetos = Array.isArray(objetos) ? objetos.map((object) => deepClone(object)) : [];
  const enabled = resolveFunctionalEnabledState({ objetos: sourceObjetos, rsvp, gifts });
  const sectionLookup = buildSectionLookup(safeSecciones);
  const hiddenSectionIds = new Set();
  const hiddenObjectIds = new Set();
  const warnings = [];
  const visibleSectionIdsAfterGlobal = new Set();

  safeSecciones.forEach((section) => {
    const sectionId = normalizeText(section?.id);
    if (!sectionId) return;
    const association = normalizeFunctionalAssociation(section[FUNCTIONAL_ASSOCIATION_FIELD]);
    if (association && enabled[association] !== true) {
      hiddenSectionIds.add(sectionId);
      return;
    }
    visibleSectionIdsAfterGlobal.add(sectionId);
  });

  const groupsBySection = collectFunctionalGroupsBySection(sourceObjetos, visibleSectionIdsAfterGlobal);

  groupsBySection.forEach((groupSet, sectionId) => {
    const section = sectionLookup.get(sectionId);
    const sectionAssociation = normalizeFunctionalAssociation(section?.[FUNCTIONAL_ASSOCIATION_FIELD]);
    if (sectionAssociation) return;

    const activeGroupCount =
      groupSet.rsvp.filter(() => enabled.rsvp === true).length +
      groupSet.gifts.filter(() => enabled.gifts === true).length;

    if (activeGroupCount === 0) {
      hiddenSectionIds.add(sectionId);
    }
  });

  const sectionIds = new Set(safeSecciones.map((section) => normalizeText(section?.id)).filter(Boolean));
  const visibleSecciones = safeSecciones.filter((section) => {
    const sectionId = normalizeText(section?.id);
    return sectionId && !hiddenSectionIds.has(sectionId);
  });

  const centeredGroupDeltas = new Map();
  groupsBySection.forEach((groupSet, sectionId) => {
    if (hiddenSectionIds.has(sectionId)) return;
    const section = sectionLookup.get(sectionId);
    const sectionAssociation = normalizeFunctionalAssociation(section?.[FUNCTIONAL_ASSOCIATION_FIELD]);
    if (sectionAssociation) return;

    const typesPresent = FUNCTIONAL_ASSOCIATION_VALUES.filter((association) => groupSet[association].length > 0);
    const activeTypes = typesPresent.filter((association) => enabled[association] === true);
    if (typesPresent.length < 2 || activeTypes.length !== 1) return;

    const activeAssociation = activeTypes[0];
    const visibleGroups = groupSet[activeAssociation];
    const jointBounds = unionBounds(visibleGroups.map((group) => resolveGroupAbsoluteBounds(group)));
    if (!jointBounds || jointBounds.width <= 0) return;

    const safeCanvasWidth = toPositiveNumber(canvasWidth, DEFAULT_CANVAS_WIDTH) || DEFAULT_CANVAS_WIDTH;
    const targetCenterX = safeCanvasWidth / 2;
    const currentCenterX = jointBounds.left + jointBounds.width / 2;
    const deltaX = roundMetric(targetCenterX - currentCenterX, 3);
    if (!deltaX) return;

    visibleGroups.forEach((group) => {
      const groupId = normalizeText(group.id);
      if (groupId) centeredGroupDeltas.set(groupId, deltaX);
    });
  });

  const visibleObjetos = sourceObjetos.flatMap((object) => {
    const safeObject = asObject(object);
    const objectId = normalizeText(safeObject.id);
    const sectionId = normalizeText(safeObject.seccionId);
    if (!sectionId || !sectionIds.has(sectionId) || hiddenSectionIds.has(sectionId)) {
      if (objectId) hiddenObjectIds.add(objectId);
      return [];
    }

    const section = sectionLookup.get(sectionId);
    const sectionAssociation = normalizeFunctionalAssociation(section?.[FUNCTIONAL_ASSOCIATION_FIELD]);
    const objectAssociation = normalizeFunctionalAssociation(safeObject[FUNCTIONAL_ASSOCIATION_FIELD]);
    if (!sectionAssociation && isGroupObject(safeObject) && objectAssociation && enabled[objectAssociation] !== true) {
      if (objectId) hiddenObjectIds.add(objectId);
      return [];
    }

    let nextObject = normalizeCtaVisibilityForFeatureState(safeObject, enabled);
    if (isGroupObject(nextObject) && centeredGroupDeltas.has(objectId)) {
      nextObject = addRenderOffset(nextObject, centeredGroupDeltas.get(objectId), {
        materializeOffsets,
      });
    }
    return [nextObject];
  });

  return {
    secciones: visibleSecciones,
    objetos: visibleObjetos,
    enabled,
    hiddenSectionIds: Array.from(hiddenSectionIds),
    hiddenObjectIds: Array.from(hiddenObjectIds),
    centeredGroupDeltas: Object.fromEntries(centeredGroupDeltas.entries()),
    warnings,
  };
}

function setSectionFunctionalAssociation({ secciones, objetos, sectionId, association } = {}) {
  const safeSectionId = normalizeText(sectionId);
  const normalized = normalizeFunctionalAssociation(association);
  let changed = false;

  const nextSecciones = (Array.isArray(secciones) ? secciones : []).map((section) => {
    const safeSection = asObject(section);
    if (normalizeText(safeSection.id) !== safeSectionId) return section;
    changed = true;
    return setFunctionalAssociationField(safeSection, normalized);
  });

  let nextObjetos = Array.isArray(objetos) ? objetos : [];
  if (normalized) {
    nextObjetos = nextObjetos.map((object) => {
      const safeObject = asObject(object);
      if (!isGroupObject(safeObject) || normalizeText(safeObject.seccionId) !== safeSectionId) return object;
      if (!normalizeFunctionalAssociation(safeObject[FUNCTIONAL_ASSOCIATION_FIELD])) return object;
      changed = true;
      return setFunctionalAssociationField(safeObject, null);
    });
  }

  return {
    secciones: changed ? nextSecciones : secciones,
    objetos: changed ? nextObjetos : objetos,
    changed,
  };
}

function setGroupFunctionalAssociation({ secciones, objetos, groupId, association } = {}) {
  const safeGroupId = normalizeText(groupId);
  const normalized = normalizeFunctionalAssociation(association);
  const safeObjetos = Array.isArray(objetos) ? objetos : [];
  const targetGroup = safeObjetos.find((object) => {
    const safeObject = asObject(object);
    return isGroupObject(safeObject) && normalizeText(safeObject.id) === safeGroupId;
  });
  const targetSectionId = normalizeText(targetGroup?.seccionId);
  let changed = false;

  const nextSecciones = (Array.isArray(secciones) ? secciones : []).map((section) => {
    const safeSection = asObject(section);
    if (!normalized || normalizeText(safeSection.id) !== targetSectionId) return section;
    if (!normalizeFunctionalAssociation(safeSection[FUNCTIONAL_ASSOCIATION_FIELD])) return section;
    changed = true;
    return setFunctionalAssociationField(safeSection, null);
  });

  const nextObjetos = safeObjetos.map((object) => {
    const safeObject = asObject(object);
    if (!isGroupObject(safeObject) || normalizeText(safeObject.seccionId) !== targetSectionId) return object;

    const objectId = normalizeText(safeObject.id);
    if (objectId === safeGroupId) {
      const nextObject = setFunctionalAssociationField(safeObject, normalized);
      if (nextObject !== safeObject) changed = true;
      return nextObject;
    }

    if (
      normalized &&
      normalizeFunctionalAssociation(safeObject[FUNCTIONAL_ASSOCIATION_FIELD]) === normalized
    ) {
      changed = true;
      return setFunctionalAssociationField(safeObject, null);
    }

    return object;
  });

  return {
    secciones: changed ? nextSecciones : secciones,
    objetos: changed ? nextObjetos : objetos,
    changed,
  };
}

function stripFunctionalAssociationFromClonedObject(object) {
  const safeObject = asObject(object);
  if (!isGroupObject(safeObject)) return object;
  return setFunctionalAssociationField(safeObject, null);
}

function sanitizeMovedGroupFunctionalAssociation({
  secciones,
  objetos,
  groupId,
  previousSectionId = null,
} = {}) {
  const safeGroupId = normalizeText(groupId);
  if (!safeGroupId || !Array.isArray(objetos)) {
    return { objetos, changed: false };
  }

  const targetGroup = objetos.find((object) => {
    const safeObject = asObject(object);
    return isGroupObject(safeObject) && normalizeText(safeObject.id) === safeGroupId;
  });
  const association = normalizeFunctionalAssociation(targetGroup?.[FUNCTIONAL_ASSOCIATION_FIELD]);
  const targetSectionId = normalizeText(targetGroup?.seccionId);
  const previousSafeSectionId = normalizeText(previousSectionId);

  if (!targetGroup || !association || !targetSectionId || targetSectionId === previousSafeSectionId) {
    return { objetos, changed: false };
  }

  const targetSection = (Array.isArray(secciones) ? secciones : []).find(
    (section) => normalizeText(section?.id) === targetSectionId
  );
  const targetSectionAssociation = normalizeFunctionalAssociation(
    targetSection?.[FUNCTIONAL_ASSOCIATION_FIELD]
  );
  const conflictsWithSection = Boolean(targetSectionAssociation);
  const conflictsWithGroup = objetos.some((object) => {
    const safeObject = asObject(object);
    return (
      isGroupObject(safeObject) &&
      normalizeText(safeObject.id) !== safeGroupId &&
      normalizeText(safeObject.seccionId) === targetSectionId &&
      normalizeFunctionalAssociation(safeObject[FUNCTIONAL_ASSOCIATION_FIELD]) === association
    );
  });

  if (!conflictsWithSection && !conflictsWithGroup) {
    return { objetos, changed: false };
  }

  const nextObjetos = objetos.map((object) => {
    const safeObject = asObject(object);
    if (normalizeText(safeObject.id) !== safeGroupId) return object;
    return setFunctionalAssociationField(safeObject, null);
  });

  return {
    objetos: nextObjetos,
    changed: true,
    reason: conflictsWithSection ? "section-functional-association" : "group-functional-association",
  };
}

module.exports = {
  DEFAULT_CANVAS_WIDTH,
  FUNCTIONAL_ASSOCIATION_FIELD,
  FUNCTIONAL_ASSOCIATION_VALUES,
  FUNCTIONAL_RENDER_OFFSET_X_FIELD,
  applyFunctionalAssociationsToRenderState,
  normalizeFunctionalAssociation,
  normalizeFunctionalConfigs,
  resolveFunctionalEnabledState,
  resolveGroupAbsoluteBounds,
  sanitizeMovedGroupFunctionalAssociation,
  setGroupFunctionalAssociation,
  setSectionFunctionalAssociation,
  stripFunctionalAssociationFromClonedObject,
};
