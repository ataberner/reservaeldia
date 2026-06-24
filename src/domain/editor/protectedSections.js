import { forEachRenderObject } from "./renderObjectTree.js";

export const ADMIN_SECTION_LOCK_REASON = "admin-section-lock";

function normalizeText(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toObjectMapById(items) {
  const map = new Map();
  asArray(items).forEach((item) => {
    const id = normalizeText(item?.id);
    if (id && !map.has(id)) map.set(id, item);
  });
  return map;
}

export function isProtectedSection(section) {
  return Boolean(section && typeof section === "object" && section.bloqueada === true);
}

export function applySectionLockState(section, locked, reason = ADMIN_SECTION_LOCK_REASON) {
  if (!section || typeof section !== "object" || Array.isArray(section)) return section;

  if (locked === true) {
    return {
      ...section,
      bloqueada: true,
      bloqueoMotivo: normalizeText(reason) || ADMIN_SECTION_LOCK_REASON,
    };
  }

  const { bloqueada, bloqueoMotivo, ...editableSection } = section;
  return editableSection;
}

export function isSectionProtectedById(sectionId, secciones = []) {
  const safeSectionId = normalizeText(sectionId);
  if (!safeSectionId) return false;
  return asArray(secciones).some(
    (section) => normalizeText(section?.id) === safeSectionId && isProtectedSection(section)
  );
}

export function canMutateSection(sectionOrId, secciones = []) {
  if (sectionOrId && typeof sectionOrId === "object") {
    return !isProtectedSection(sectionOrId);
  }
  return !isSectionProtectedById(sectionOrId, secciones);
}

export function canInsertIntoSection(sectionId, secciones = []) {
  const safeSectionId = normalizeText(sectionId);
  if (!safeSectionId) return false;
  const section = asArray(secciones).find((item) => normalizeText(item?.id) === safeSectionId);
  return Boolean(section && !isProtectedSection(section));
}

export function resolveObjectSectionId(object, context = {}) {
  return (
    normalizeText(context?.parentGroup?.seccionId) ||
    normalizeText(object?.seccionId) ||
    normalizeText(context?.sectionId) ||
    ""
  );
}

export function isObjectInProtectedSection(object, options = {}) {
  const sectionId = resolveObjectSectionId(object, options);
  return isSectionProtectedById(sectionId, options?.secciones);
}

export function canEditObject(object, options = {}) {
  if (!object || typeof object !== "object") return false;
  return !isObjectInProtectedSection(object, options);
}

export function findRenderObjectProtectionContext(objetos = [], objectId = "") {
  const safeObjectId = normalizeText(objectId);
  if (!safeObjectId) return null;

  let found = null;
  forEachRenderObject(objetos, (object, context) => {
    if (found) return;
    if (normalizeText(object?.id) === safeObjectId) {
      found = {
        object,
        parentGroup: context?.parentGroup || null,
        parentGroupId: context?.parentGroupId || null,
      };
    }
  });
  return found;
}

export function isObjectIdInProtectedSection(objectId, options = {}) {
  const context = findRenderObjectProtectionContext(options?.objetos, objectId);
  if (!context) return false;
  return isObjectInProtectedSection(context.object, {
    secciones: options?.secciones,
    parentGroup: context.parentGroup,
  });
}

export function canEditObjectById(objectId, options = {}) {
  const context = findRenderObjectProtectionContext(options?.objetos, objectId);
  if (!context) return false;
  return canEditObject(context.object, {
    secciones: options?.secciones,
    parentGroup: context.parentGroup,
  });
}

export function filterEditableObjectIds(ids = [], options = {}) {
  return asArray(ids).filter((id) => canEditObjectById(id, options));
}

export function filterEditableRootObjects(objetos = [], secciones = []) {
  return asArray(objetos).filter((object) => canEditObject(object, { secciones }));
}

export function getProtectedSectionIds(secciones = []) {
  return new Set(
    asArray(secciones)
      .filter(isProtectedSection)
      .map((section) => normalizeText(section?.id))
      .filter(Boolean)
  );
}

export function resolveProtectedFinalSection(secciones = []) {
  const ordered = [...asArray(secciones)].sort(
    (left, right) => Number(left?.orden ?? 0) - Number(right?.orden ?? 0)
  );
  const lastSection = ordered[ordered.length - 1] || null;
  return isProtectedSection(lastSection) ? lastSection : null;
}

export function placeSectionBeforeProtectedFinal(secciones = [], nuevaSeccion = null) {
  if (!nuevaSeccion) return asArray(secciones);

  const current = asArray(secciones);
  const protectedFinal = resolveProtectedFinalSection(current);
  if (!protectedFinal) return [...current, nuevaSeccion];

  const protectedFinalId = normalizeText(protectedFinal.id);
  const ordered = [...current].sort(
    (left, right) => Number(left?.orden ?? 0) - Number(right?.orden ?? 0)
  );
  const withoutFinal = ordered.filter((section) => normalizeText(section?.id) !== protectedFinalId);
  const nextOrdered = [...withoutFinal, nuevaSeccion, protectedFinal];

  return nextOrdered.map((section, index) => ({
    ...section,
    orden: index,
  }));
}

export function buildProtectedSectionObjectSanitizer({ currentObjetos = [], currentSecciones = [] } = {}) {
  const protectedRootById = new Map();
  const currentById = toObjectMapById(currentObjetos);

  asArray(currentObjetos).forEach((object) => {
    const id = normalizeText(object?.id);
    if (id && isObjectInProtectedSection(object, { secciones: currentSecciones })) {
      protectedRootById.set(id, object);
    }
  });

  return function sanitizeObjetos(nextObjetos) {
    const next = asArray(nextObjetos).filter((object) => {
      const id = normalizeText(object?.id);
      if (!id) return true;
      if (!currentById.has(id) && isObjectInProtectedSection(object, { secciones: currentSecciones })) {
        return false;
      }
      return !protectedRootById.has(id) || currentById.has(id);
    });

    const restoredIds = new Set();
    const sanitized = next.map((object) => {
      const id = normalizeText(object?.id);
      if (!id || !protectedRootById.has(id)) return object;
      restoredIds.add(id);
      return protectedRootById.get(id);
    });

    protectedRootById.forEach((object, id) => {
      if (!restoredIds.has(id)) sanitized.push(object);
    });

    return sanitized;
  };
}

export function buildProtectedSectionStateSanitizer({ currentSecciones = [] } = {}) {
  const protectedSectionById = new Map();
  asArray(currentSecciones).forEach((section) => {
    const id = normalizeText(section?.id);
    if (id && isProtectedSection(section)) {
      protectedSectionById.set(id, section);
    }
  });

  return function sanitizeSecciones(nextSecciones) {
    const restoredIds = new Set();
    const sanitized = asArray(nextSecciones).map((section) => {
      const id = normalizeText(section?.id);
      if (!id || !protectedSectionById.has(id)) return section;
      restoredIds.add(id);
      return protectedSectionById.get(id);
    });

    protectedSectionById.forEach((section, id) => {
      if (!restoredIds.has(id)) sanitized.push(section);
    });

    return sanitized;
  };
}
