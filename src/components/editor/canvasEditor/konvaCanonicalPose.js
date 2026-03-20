const CANONICAL_POSE_MODE_ATTR = "__canonicalPoseMode";

export const CANONICAL_POSE_MODE_TEXT_ORIGIN_OFFSET = "text-origin-offset";

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function readNodeMetric(node, getterName, attrName, fallback = null) {
  if (node && typeof node[getterName] === "function") {
    return toFiniteNumber(node[getterName](), fallback);
  }

  if (node?.attrs && Object.prototype.hasOwnProperty.call(node.attrs, attrName)) {
    return toFiniteNumber(node.attrs[attrName], fallback);
  }

  return fallback;
}

export function getNodeCanonicalPoseMode(node, objectMeta = null) {
  if (node && typeof node.getAttr === "function") {
    const rawMode = node.getAttr(CANONICAL_POSE_MODE_ATTR);
    if (typeof rawMode === "string" && rawMode.trim().length > 0) {
      return rawMode;
    }
  }

  if (
    objectMeta &&
    typeof objectMeta.canonicalPoseMode === "string" &&
    objectMeta.canonicalPoseMode.trim().length > 0
  ) {
    return objectMeta.canonicalPoseMode;
  }

  return null;
}

export function markTextOriginOffsetCanonicalPose(node) {
  if (!node || typeof node.setAttr !== "function") return;
  try {
    node.setAttr(
      CANONICAL_POSE_MODE_ATTR,
      CANONICAL_POSE_MODE_TEXT_ORIGIN_OFFSET
    );
  } catch {}
}

export function clearCanonicalPoseMetadata(node) {
  if (!node || typeof node.setAttr !== "function") return;
  try {
    node.setAttr(CANONICAL_POSE_MODE_ATTR, null);
  } catch {}
}

export function resolveCanonicalNodePose(
  node,
  objectMeta = null,
  fallbackPose = null
) {
  const rawX = toFiniteNumber(
    fallbackPose?.x,
    readNodeMetric(node, "x", "x", toFiniteNumber(objectMeta?.x, 0))
  );
  const rawY = toFiniteNumber(
    fallbackPose?.y,
    readNodeMetric(node, "y", "y", toFiniteNumber(objectMeta?.y, 0))
  );
  const rawRotation = toFiniteNumber(
    fallbackPose?.rotation,
    readNodeMetric(node, "rotation", "rotation", toFiniteNumber(objectMeta?.rotation, 0))
  );
  const rawOffsetX = toFiniteNumber(
    fallbackPose?.offsetX,
    readNodeMetric(node, "offsetX", "offsetX", 0)
  );
  const rawOffsetY = toFiniteNumber(
    fallbackPose?.offsetY,
    readNodeMetric(node, "offsetY", "offsetY", 0)
  );

  const canonicalPoseMode = getNodeCanonicalPoseMode(node, objectMeta);
  const usesOriginOffset =
    canonicalPoseMode === CANONICAL_POSE_MODE_TEXT_ORIGIN_OFFSET;

  return {
    x: usesOriginOffset ? rawX - rawOffsetX : rawX,
    y: usesOriginOffset ? rawY - rawOffsetY : rawY,
    rotation: rawRotation,
    rawX,
    rawY,
    rawRotation,
    rawOffsetX,
    rawOffsetY,
    canonicalPoseMode,
    usesOriginOffset,
  };
}
