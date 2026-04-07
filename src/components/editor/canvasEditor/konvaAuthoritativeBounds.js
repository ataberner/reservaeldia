import {
  CANONICAL_POSE_MODE_TEXT_ORIGIN_OFFSET,
  getNodeCanonicalPoseMode,
  resolveCanonicalNodePose,
} from "@/components/editor/canvasEditor/konvaCanonicalPose";

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

function readNodeScale(node, getterName, attrName) {
  const scale = Math.abs(readNodeMetric(node, getterName, attrName, 1) || 1);
  return scale > 0 ? scale : 1;
}

export function shouldUseTextAuthorityBounds(node, objectMeta = null) {
  const canonicalPoseMode = getNodeCanonicalPoseMode(node, objectMeta);
  return (
    objectMeta?.tipo === "texto" ||
    canonicalPoseMode === CANONICAL_POSE_MODE_TEXT_ORIGIN_OFFSET
  );
}

export function resolveAuthoritativeTextRect(
  node,
  objectMeta = null,
  options = {}
) {
  if (!shouldUseTextAuthorityBounds(node, objectMeta)) {
    return null;
  }

  const fallbackRect = options?.fallbackRect || null;
  const fallbackPose = options?.fallbackPose || null;
  const pose = resolveCanonicalNodePose(node, objectMeta, fallbackPose);

  const widthMetric = readNodeMetric(node, "width", "width", null);
  const heightMetric = readNodeMetric(node, "height", "height", null);
  const width =
    Number.isFinite(widthMetric) && widthMetric > 0
      ? widthMetric * readNodeScale(node, "scaleX", "scaleX")
      : toFiniteNumber(fallbackRect?.width, null);
  const height =
    Number.isFinite(heightMetric) && heightMetric > 0
      ? heightMetric * readNodeScale(node, "scaleY", "scaleY")
      : toFiniteNumber(fallbackRect?.height, null);

  if (
    !Number.isFinite(pose?.x) ||
    !Number.isFinite(pose?.y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }

  return {
    x: pose.x,
    y: pose.y,
    width,
    height,
  };
}

export function shiftRectToCanonicalPose(
  rect,
  node,
  objectMeta = null,
  fallbackPose = null
) {
  if (
    !rect ||
    !Number.isFinite(Number(rect.x)) ||
    !Number.isFinite(Number(rect.y)) ||
    !Number.isFinite(Number(rect.width)) ||
    !Number.isFinite(Number(rect.height))
  ) {
    return null;
  }

  if (!fallbackPose) {
    return {
      x: Number(rect.x),
      y: Number(rect.y),
      width: Number(rect.width),
      height: Number(rect.height),
    };
  }

  const livePose = resolveCanonicalNodePose(node, objectMeta);
  const nextPose = resolveCanonicalNodePose(node, objectMeta, fallbackPose);
  const deltaX = Number(nextPose?.x || 0) - Number(livePose?.x || 0);
  const deltaY = Number(nextPose?.y || 0) - Number(livePose?.y || 0);

  return {
    x: Number(rect.x) + deltaX,
    y: Number(rect.y) + deltaY,
    width: Number(rect.width),
    height: Number(rect.height),
  };
}
