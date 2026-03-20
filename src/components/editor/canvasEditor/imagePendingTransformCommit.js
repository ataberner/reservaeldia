const IMAGE_PENDING_TRANSFORM_COMMIT_ATTR = "__imagePendingTransformCommit";
const IMAGE_PENDING_TRANSFORM_COMMIT_TTL_MS = 2000;
const IMAGE_RESIZE_SESSION_ATTR = "__imageResizeSession";

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isNearEqual(a, b, tolerance = 0.05) {
  const numA = Number(a);
  const numB = Number(b);
  if (!Number.isFinite(numA) || !Number.isFinite(numB)) return false;
  return Math.abs(numA - numB) <= tolerance;
}

function sanitizePendingCommit(payload = {}) {
  const createdAtMs = Date.now();

  return {
    x: toFiniteNumber(payload.x),
    y: toFiniteNumber(payload.y),
    width: toFiniteNumber(payload.width),
    height: toFiniteNumber(payload.height),
    rotation: toFiniteNumber(payload.rotation, 0),
    scaleX: toFiniteNumber(payload.scaleX, 1) ?? 1,
    scaleY: toFiniteNumber(payload.scaleY, 1) ?? 1,
    createdAtMs,
  };
}

function sanitizeResizeSession(payload = {}) {
  return {
    activeAnchor:
      typeof payload.activeAnchor === "string" && payload.activeAnchor.trim()
        ? payload.activeAnchor.trim()
        : null,
    startedAtMs: Date.now(),
  };
}

export function setPendingImageTransformCommit(node, payload = {}) {
  if (!node || typeof node.setAttr !== "function") return null;

  const sanitized = sanitizePendingCommit(payload);
  try {
    node.setAttr(IMAGE_PENDING_TRANSFORM_COMMIT_ATTR, sanitized);
  } catch {
    return null;
  }

  return sanitized;
}

export function setImageResizeSessionActive(node, payload = {}) {
  if (!node || typeof node.setAttr !== "function") return null;

  const sanitized = sanitizeResizeSession(payload);
  try {
    node.setAttr(IMAGE_RESIZE_SESSION_ATTR, sanitized);
  } catch {
    return null;
  }

  return sanitized;
}

export function getImageResizeSession(node) {
  if (!node || typeof node.getAttr !== "function") return null;

  try {
    return node.getAttr(IMAGE_RESIZE_SESSION_ATTR) || null;
  } catch {
    return null;
  }
}

export function hasImageResizeSessionActive(node) {
  return Boolean(getImageResizeSession(node));
}

export function getPendingImageTransformCommit(node) {
  if (!node || typeof node.getAttr !== "function") return null;

  let raw = null;
  try {
    raw = node.getAttr(IMAGE_PENDING_TRANSFORM_COMMIT_ATTR);
  } catch {
    raw = null;
  }

  if (!raw || typeof raw !== "object") return null;

  const createdAtMs = toFiniteNumber(raw.createdAtMs, null);
  if (
    Number.isFinite(createdAtMs) &&
    Date.now() - createdAtMs > IMAGE_PENDING_TRANSFORM_COMMIT_TTL_MS
  ) {
    clearPendingImageTransformCommit(node);
    return null;
  }

  return raw;
}

export function clearPendingImageTransformCommit(node) {
  if (!node || typeof node.setAttr !== "function") return;
  try {
    node.setAttr(IMAGE_PENDING_TRANSFORM_COMMIT_ATTR, null);
  } catch {}
}

export function clearImageResizeSessionActive(node) {
  if (!node || typeof node.setAttr !== "function") return;
  try {
    node.setAttr(IMAGE_RESIZE_SESSION_ATTR, null);
  } catch {}
}

export function hasImageTransformCommitSettled(objectLike = {}, pendingCommit = null) {
  if (!pendingCommit) return true;

  const widthSettled =
    pendingCommit.width == null ||
    isNearEqual(objectLike?.width, pendingCommit.width);
  const heightSettled =
    pendingCommit.height == null ||
    isNearEqual(objectLike?.height, pendingCommit.height);
  const xSettled =
    pendingCommit.x == null ||
    isNearEqual(objectLike?.x, pendingCommit.x);
  const ySettled =
    pendingCommit.y == null ||
    isNearEqual(objectLike?.y, pendingCommit.y);
  const rotationSettled =
    pendingCommit.rotation == null ||
    isNearEqual(objectLike?.rotation, pendingCommit.rotation, 0.1);

  return widthSettled && heightSettled && xSettled && ySettled && rotationSettled;
}

export function resolveImageObjectWithPendingCommit(objectLike = {}, pendingCommit = null) {
  if (!pendingCommit) return objectLike;

  return {
    ...objectLike,
    x: pendingCommit.x ?? objectLike.x,
    y: pendingCommit.y ?? objectLike.y,
    width: pendingCommit.width ?? objectLike.width,
    height: pendingCommit.height ?? objectLike.height,
    rotation: pendingCommit.rotation ?? objectLike.rotation,
    scaleX: pendingCommit.scaleX ?? 1,
    scaleY: pendingCommit.scaleY ?? 1,
  };
}
