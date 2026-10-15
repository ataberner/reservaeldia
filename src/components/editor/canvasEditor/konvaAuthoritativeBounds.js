import {
  CANONICAL_POSE_MODE_TEXT_ORIGIN_OFFSET,
  getNodeCanonicalPoseMode,
  resolveCanonicalNodePose,
} from "@/components/editor/canvasEditor/konvaCanonicalPose";

function toFiniteNumber(value, fallback = null) {
  if (value === null || typeof value === "undefined") return fallback;
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

export function shouldUseTextAuthorityBounds(node, objectMeta = null) {
  const canonicalPoseMode = getNodeCanonicalPoseMode(node, objectMeta);
  return (
    objectMeta?.tipo === "texto" ||
    canonicalPoseMode === CANONICAL_POSE_MODE_TEXT_ORIGIN_OFFSET
  );
}

function resolveTextTransform(node, objectMeta, relativeTo, fallbackPose) {
  if (typeof node?.getAbsoluteTransform !== "function") return null;
  const liveTransform = node.getAbsoluteTransform(relativeTo);
  if (!fallbackPose) return liveTransform;

  // Input poses use the same raw local node coordinates as canonical-pose
  // overrides. Compose them with the parent, never add a local delta to stage X/Y.
  const pose = resolveCanonicalNodePose(node, objectMeta, fallbackPose);
  const localTransform = liveTransform.copy();
  localTransform.reset();
  const transformsEnabled = node.transformsEnabled?.() || "all";
  if (transformsEnabled === "all") {
    localTransform.translate(pose.rawX, pose.rawY);
    localTransform.rotate(pose.rawRotation * Math.PI / 180);
    localTransform.skew(
      readNodeMetric(node, "skewX", "skewX", 0),
      readNodeMetric(node, "skewY", "skewY", 0)
    );
    localTransform.scale(
      readNodeMetric(node, "scaleX", "scaleX", 1),
      readNodeMetric(node, "scaleY", "scaleY", 1)
    );
    localTransform.translate(-pose.rawOffsetX, -pose.rawOffsetY);
  } else if (transformsEnabled === "position") {
    localTransform.translate(pose.rawX - pose.rawOffsetX, pose.rawY - pose.rawOffsetY);
  }

  const parent = node.getParent?.();
  const parentTransform = parent && parent !== relativeTo
    ? parent.getAbsoluteTransform(relativeTo).copy()
    : liveTransform.copy();
  if (!parent || parent === relativeTo) parentTransform.reset();
  return parentTransform.multiply(localTransform);
}

// The measured local Text box is the authority. Its matrix projects that box
// once into canvas coordinates; CSS zoom and the stage's own transform belong
// to viewport projection, not to snapping or overlay geometry.
// An explicit relativeTo: null includes the stage transform for DOM projection.
// Optional padding is measured along the transformed box axes in target units.
export function resolveAuthoritativeTextGeometry(
  node,
  objectMeta = null,
  options = {}
) {
  if (!shouldUseTextAuthorityBounds(node, objectMeta)) {
    return null;
  }

  const width = readNodeMetric(node, "width", "width", null);
  const height = readNodeMetric(node, "height", "height", null);
  if (
    !Number.isFinite(width) || width < 0 ||
    !Number.isFinite(height) || height < 0
  ) {
    return null;
  }

  try {
    const relativeTo = Object.prototype.hasOwnProperty.call(options, "relativeTo")
      ? options.relativeTo || undefined
      : node?.getStage?.() || undefined;
    const transform = resolveTextTransform(node, objectMeta, relativeTo, options.fallbackPose);
    const matrix = transform?.getMatrix?.();
    if (!matrix || matrix.length !== 6 || !matrix.every(Number.isFinite)) return null;

    const padding = Math.max(0, toFiniteNumber(options.padding, 0));
    const paddingX = padding / Math.max(0.0001, Math.hypot(matrix[0], matrix[1]));
    const paddingY = padding / Math.max(0.0001, Math.hypot(matrix[2], matrix[3]));
    const localRect = {
      x: paddingX > 0 ? -paddingX : 0,
      y: paddingY > 0 ? -paddingY : 0,
      width: width + paddingX * 2,
      height: height + paddingY * 2,
    };
    const corners = [
      { x: localRect.x, y: localRect.y },
      { x: localRect.x + localRect.width, y: localRect.y },
      { x: localRect.x + localRect.width, y: localRect.y + localRect.height },
      { x: localRect.x, y: localRect.y + localRect.height },
    ].map((point) => transform.point(point));
    const points = corners.flatMap((point) => [point.x, point.y]);
    if (!points.every(Number.isFinite)) return null;

    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return {
      localRect,
      transform: [...matrix],
      points,
      rect: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y },
    };
  } catch {
    return null;
  }
}

export function resolveAuthoritativeTextRect(node, objectMeta = null, options = {}) {
  return resolveAuthoritativeTextGeometry(node, objectMeta, options)?.rect || null;
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
