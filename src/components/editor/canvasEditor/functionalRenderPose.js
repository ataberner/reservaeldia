import { FUNCTIONAL_RENDER_OFFSET_X_FIELD } from "../../../../shared/functionalAssociations.js";
import { EVENT_LAYOUT_MANAGED_FIELD, getSectionEventLayout } from "../../../../shared/eventLayoutState.js";

// Legacy centering is a render projection. Managed layouts already store the
// active pose in root coordinates, so they have no additional render offset.
export function getFunctionalRenderOffsetX(object) {
  if (object?.[EVENT_LAYOUT_MANAGED_FIELD] === true) return 0;
  const offset = Number(object?.[FUNCTIONAL_RENDER_OFFSET_X_FIELD]);
  return Number.isFinite(offset) ? offset : 0;
}

// Input x is a scene pose with text-origin offsets already resolved. Keep this
// conversion at mutation boundaries, never in live node/selection geometry.
export function functionalScenePatchToBase(object, patch) {
  const offset = getFunctionalRenderOffsetX(object);
  if (!offset || !Number.isFinite(patch?.x)) return patch;
  return { ...patch, x: patch.x - offset };
}

export function functionalPositionMutationOptions(object, patch, reason) {
  const offset = getFunctionalRenderOffsetX(object);
  const hasOffset = object?.id && offset && Number.isFinite(patch?.x);
  return hasOffset || reason
    ? { ...(hasOffset ? { functionalPositionOffsets: { [object.id]: offset } } : {}), ...(reason ? { reason } : {}) }
    : undefined;
}

// Several previews may be queued from one legacy render. The first materializes
// the section; subsequent base-frame patches must then return to the now-active
// scene frame. This metadata is an adapter input and is never persisted.
export function reconcileFunctionalMutationFrame({ previousObjects, nextObjects, secciones, offsets }) {
  if (!offsets || !Array.isArray(nextObjects) || nextObjects === previousObjects) return nextObjects;
  const previousById = new Map((previousObjects || []).map(object => [object.id, object]));
  const managedSections = new Set((secciones || []).filter(getSectionEventLayout).map(section => section.id));
  let changed = false;
  const reconciled = nextObjects.map(object => {
    const offset = Number(offsets[object.id]);
    const previous = previousById.get(object.id);
    if (object === previous || !Number.isFinite(offset) || !offset || !Number.isFinite(object.x) || !managedSections.has(previous?.seccionId)) return object;
    changed = true;
    return { ...object, x: object.x + offset };
  });
  return changed ? reconciled : nextObjects;
}
