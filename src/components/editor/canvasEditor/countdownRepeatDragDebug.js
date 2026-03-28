const DEBUG_FLAG_KEY = "__COUNTDOWN_REPEAT_DRAG_DEBUG";
const EVENTS_KEY = "__COUNTDOWN_REPEAT_DRAG_EVENTS";
const LAST_EVENT_KEY = "__COUNTDOWN_REPEAT_DRAG_LAST_EVENT";
const ACTIVE_KEY = "__COUNTDOWN_REPEAT_DRAG_ACTIVE";
const DEBUG_EVENT_NAME = "countdown-repeat-drag-debug";

function readWindowValue(key) {
  if (typeof window === "undefined") return null;
  return window[key] ?? null;
}

function toRoundedMetric(value, digits = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

export function isCountdownRepeatDragDebugEnabled() {
  if (typeof window === "undefined") return false;
  const flag = readWindowValue(DEBUG_FLAG_KEY);
  return flag === true || flag === "true" || flag === 1 || flag === "1";
}

export function publishCountdownRepeatDragDebugEntry(entry) {
  if (typeof window === "undefined") return;

  const nextEntry = entry && typeof entry === "object" ? entry : { event: "unknown" };
  const existingEntries = Array.isArray(window[EVENTS_KEY]) ? window[EVENTS_KEY] : [];
  const nextEntries = [...existingEntries, nextEntry];
  const maxEntries = 300;

  if (nextEntries.length > maxEntries) {
    nextEntries.splice(0, nextEntries.length - maxEntries);
  }

  window[EVENTS_KEY] = nextEntries;
  window[LAST_EVENT_KEY] = nextEntry;

  try {
    window.dispatchEvent(
      new CustomEvent(DEBUG_EVENT_NAME, {
        detail: nextEntry,
      })
    );
  } catch {}
}

export function getCountdownRepeatDragActiveState() {
  const state = readWindowValue(ACTIVE_KEY);
  return state && typeof state === "object" ? state : null;
}

export function setCountdownRepeatDragActiveState(nextState) {
  if (typeof window === "undefined") return;

  if (nextState && typeof nextState === "object") {
    window[ACTIVE_KEY] = nextState;
    return;
  }

  try {
    delete window[ACTIVE_KEY];
  } catch {
    window[ACTIVE_KEY] = null;
  }
}

export function getCountdownRepeatDragNodeIdentity(node) {
  if (!node) {
    return {
      present: false,
      key: "missing",
    };
  }

  let id = null;
  let name = null;
  let className = null;
  let internalNodeId = null;
  let draggable = null;
  let isDragging = null;
  let destroyed = null;
  let x = null;
  let y = null;
  let rotation = null;
  let scaleX = null;
  let scaleY = null;

  try {
    id = typeof node.id === "function" ? node.id() || null : node?.attrs?.id || null;
  } catch {}
  try {
    name = typeof node.name === "function" ? node.name() || null : node?.attrs?.name || null;
  } catch {}
  try {
    className =
      typeof node.getClassName === "function"
        ? node.getClassName() || null
        : node?.className || null;
  } catch {}
  try {
    internalNodeId = Number.isFinite(Number(node?._id)) ? Number(node._id) : null;
  } catch {}
  try {
    draggable = typeof node.draggable === "function" ? Boolean(node.draggable()) : null;
  } catch {}
  try {
    isDragging = typeof node.isDragging === "function" ? Boolean(node.isDragging()) : null;
  } catch {}
  try {
    destroyed = typeof node.isDestroyed === "function" ? Boolean(node.isDestroyed()) : null;
  } catch {}
  try {
    x = typeof node.x === "function" ? toRoundedMetric(node.x()) : null;
  } catch {}
  try {
    y = typeof node.y === "function" ? toRoundedMetric(node.y()) : null;
  } catch {}
  try {
    rotation = typeof node.rotation === "function" ? toRoundedMetric(node.rotation()) : null;
  } catch {}
  try {
    scaleX = typeof node.scaleX === "function" ? toRoundedMetric(node.scaleX()) : null;
  } catch {}
  try {
    scaleY = typeof node.scaleY === "function" ? toRoundedMetric(node.scaleY()) : null;
  } catch {}

  const key = [id || "?", className || "?", internalNodeId || "?"].join(":");

  return {
    present: true,
    key,
    id,
    name,
    className,
    internalNodeId,
    draggable,
    isDragging,
    destroyed,
    x,
    y,
    rotation,
    scaleX,
    scaleY,
  };
}
