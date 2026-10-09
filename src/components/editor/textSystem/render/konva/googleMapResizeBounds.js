import { GOOGLE_MAP_MIN_SIZE } from "../../../../../domain/eventDetails/googleMapGeometry.js";

const MAX_RESIZE_SIZE = 800;
const EPSILON = 1e-7;

function finiteNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveDimension(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : GOOGLE_MAP_MIN_SIZE;
}

function clampDimension(value, previous) {
  // Existing out-of-range boxes can recover without jumping on the first move.
  const minimum = Math.min(GOOGLE_MAP_MIN_SIZE, previous);
  const maximum = Math.max(MAX_RESIZE_SIZE, previous);
  return Math.min(maximum, Math.max(minimum, finiteNumber(value, previous)));
}

function cleanDirection(value) {
  return Math.abs(value) < EPSILON ? 0 : value;
}

function stageConstraints(box, stageWidth, stageHeight) {
  const cos = cleanDirection(Math.cos(box.rotation));
  const sin = cleanDirection(Math.sin(box.rotation));
  const constraints = [];
  if (Number.isFinite(stageWidth) && stageWidth > 0) {
    constraints.push(
      { width: Math.max(cos, 0), height: Math.max(-sin, 0), limit: stageWidth - box.x },
      { width: Math.max(-cos, 0), height: Math.max(sin, 0), limit: box.x }
    );
  }
  if (Number.isFinite(stageHeight) && stageHeight > 0) {
    constraints.push(
      { width: Math.max(sin, 0), height: Math.max(cos, 0), limit: stageHeight - box.y },
      { width: Math.max(-sin, 0), height: Math.max(-cos, 0), limit: box.y }
    );
  }
  return constraints.map((constraint) => ({
    ...constraint,
    // Never worsen an existing overflow; shrinking remains possible.
    limit: Math.max(
      constraint.limit,
      constraint.width * box.width + constraint.height * box.height
    ),
  }));
}

/**
 * Bound a single map's resize in Konva's box coordinates (rotation in radians).
 * The supported handles keep the rotated top-left corner fixed. Only moving
 * axes are constrained; hitting one limit does not veto the other axis.
 */
export function resolveGoogleMapResizeBounds({
  oldBox = {}, newBox = {}, activeAnchor = "bottom-right", stageWidth, stageHeight,
} = {}) {
  const previous = {
    ...oldBox,
    x: finiteNumber(oldBox?.x, 0),
    y: finiteNumber(oldBox?.y, 0),
    width: positiveDimension(oldBox?.width),
    height: positiveDimension(oldBox?.height),
    rotation: finiteNumber(oldBox?.rotation, 0),
  };
  const resizeWidth = activeAnchor === "bottom-right" || activeAnchor === "middle-right";
  const resizeHeight = activeAnchor === "bottom-right" || activeAnchor === "bottom-center";
  if (!resizeWidth && !resizeHeight) return previous;

  const desiredWidth = resizeWidth
    ? clampDimension(newBox?.width, previous.width) : previous.width;
  const desiredHeight = resizeHeight
    ? clampDimension(newBox?.height, previous.height) : previous.height;
  // Reductions release space before considering growth in either direction.
  const baseWidth = Math.min(previous.width, desiredWidth);
  const baseHeight = Math.min(previous.height, desiredHeight);
  let growWidth = desiredWidth - baseWidth;
  let growHeight = desiredHeight - baseHeight;

  for (const constraint of stageConstraints(previous, stageWidth, stageHeight)) {
    const capacity = Math.max(
      0, constraint.limit - constraint.width * baseWidth - constraint.height * baseHeight
    );
    const widthCost = constraint.width * growWidth;
    const heightCost = constraint.height * growHeight;
    const totalCost = widthCost + heightCost;
    if (!Number.isFinite(capacity) || totalCost <= capacity + EPSILON) continue;

    const fraction = Math.max(0, Math.min(1, capacity / totalCost));
    // Rotated edges may depend on both dimensions. Share that edge's remaining
    // space along the requested growth vector; unrelated axes remain untouched.
    if (widthCost > 0) growWidth *= fraction;
    if (heightCost > 0) growHeight *= fraction;
  }

  return {
    ...previous,
    width: baseWidth + growWidth,
    height: baseHeight + growHeight,
  };
}
