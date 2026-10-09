import { resolveGoogleMapDimensions } from "../../../../../domain/eventDetails/googleMapGeometry.js";

function normalizeScale(value) {
  const scale = Number(value);
  return Number.isFinite(scale) ? Math.abs(scale) : 1;
}

export function resolveGoogleMapTransformPatch(object, { scaleX = 1, scaleY = 1 } = {}) {
  const base = resolveGoogleMapDimensions(object);
  return {
    ...resolveGoogleMapDimensions({
      width: base.width * normalizeScale(scaleX),
      height: base.height * normalizeScale(scaleY),
    }),
    scaleX: 1,
    scaleY: 1,
  };
}

export function resolveGoogleMapNodeTransformPatch(node, object) {
  return resolveGoogleMapTransformPatch(object, {
    scaleX: node.scaleX(),
    scaleY: node.scaleY(),
  });
}

export function syncCommittedGoogleMapGeometry(node, object) {
  // Call after React has committed the children: Group bounds come from them.
  // Preserve legacy scales until a resize commits their flattened dimensions.
  node.setAttrs({
    ...resolveGoogleMapDimensions(object),
    scaleX: object.scaleX || 1,
    scaleY: object.scaleY || 1,
  });
}
