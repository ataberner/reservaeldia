import {
  collectDuplicateRenderObjectIds as collectDuplicateRenderObjectIdsFromContract,
} from "../../../shared/renderAssetContract.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function isObjectLike(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toObjectArray(value) {
  return Array.isArray(value) ? value : [];
}

let cloneIdentitySequence = 0;

function createDefaultCloneIdentity(object) {
  cloneIdentitySequence = (cloneIdentitySequence + 1) % Number.MAX_SAFE_INTEGER;
  const typeToken = normalizeText(object?.tipo)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "obj";
  const randomToken = Math.random().toString(36).slice(2, 10);
  return `${typeToken}-${Date.now().toString(36)}-${cloneIdentitySequence.toString(36)}-${randomToken}`;
}

export function isGroupRenderObject(object) {
  return (
    isObjectLike(object) &&
    normalizeText(object.tipo).toLowerCase() === "grupo" &&
    Array.isArray(object.children)
  );
}

export function forEachRenderObject(objetos, visitor, options = {}) {
  if (typeof visitor !== "function") return;
  const includeGroups = options.includeGroups !== false;

  const visit = (object, context) => {
    if (!isObjectLike(object)) return;
    const isGroup = isGroupRenderObject(object);
    if (includeGroups || !isGroup) {
      visitor(object, context);
    }
    if (!isGroup) return;
    object.children.forEach((child, childIndex) => {
      visit(child, {
        parentGroup: object,
        parentGroupId: normalizeText(object.id) || null,
        childIndex,
      });
    });
  };

  toObjectArray(objetos).forEach((object, index) => {
    visit(object, {
      parentGroup: null,
      parentGroupId: null,
      rootIndex: index,
    });
  });
}

export function findRenderObjectById(objetos, id) {
  const safeId = normalizeText(id);
  if (!safeId) return null;

  let found = null;
  forEachRenderObject(objetos, (object) => {
    if (found) return;
    if (normalizeText(object.id) === safeId) {
      found = object;
    }
  });
  return found;
}

export function collectRenderObjectIds(objetos, options = {}) {
  const ids = new Set();
  forEachRenderObject(
    objetos,
    (object) => {
      const id = normalizeText(object.id);
      if (id) ids.add(id);
    },
    options
  );
  return ids;
}

export function collectDuplicateRenderObjectIds(objetos, options = {}) {
  return collectDuplicateRenderObjectIdsFromContract(objetos, options);
}

export function cloneRenderObjectWithFreshIdentity(object, options = {}) {
  if (!isObjectLike(object)) return object;

  const createIdentity =
    typeof options.createIdentity === "function"
      ? options.createIdentity
      : createDefaultCloneIdentity;
  const cloneObject = (current, context) => {
    if (!isObjectLike(current)) return current;

    const cloned = {
      ...current,
      id: normalizeText(createIdentity(current, context)) || createDefaultCloneIdentity(current),
    };
    if (!isGroupRenderObject(current)) return cloned;

    cloned.children = current.children.map((child, childIndex) =>
      cloneObject(child, {
        parentGroupId: normalizeText(cloned.id) || null,
        childIndex,
      })
    );
    return cloned;
  };

  return cloneObject(object, {
    parentGroupId: null,
    childIndex: null,
  });
}

export function updateRenderObjectById(objetos, id, updater) {
  const safeObjects = toObjectArray(objetos);
  const safeId = normalizeText(id);
  if (!safeId || typeof updater !== "function") {
    return {
      objetos,
      changed: false,
      updatedObject: null,
    };
  }

  let changed = false;
  let updatedObject = null;

  const updateObject = (object) => {
    if (!isObjectLike(object)) return object;

    if (!changed && normalizeText(object.id) === safeId) {
      const nextObject = updater(object);
      if (nextObject && nextObject !== object) {
        changed = true;
        updatedObject = nextObject;
        return nextObject;
      }
      return object;
    }

    if (!isGroupRenderObject(object)) return object;

    let childrenChanged = false;
    const nextChildren = object.children.map((child) => {
      if (changed) return child;
      const nextChild = updateObject(child);
      if (nextChild !== child) {
        childrenChanged = true;
      }
      return nextChild;
    });

    if (!childrenChanged) return object;
    return {
      ...object,
      children: nextChildren,
    };
  };

  const nextObjects = safeObjects.map((object) => {
    if (changed) return object;
    return updateObject(object);
  });

  return {
    objetos: changed ? nextObjects : objetos,
    changed,
    updatedObject,
  };
}
