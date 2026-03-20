import { resolveCanonicalNodePose } from "@/components/editor/canvasEditor/konvaCanonicalPose";

function readExplicitDebugFlag(rawValue) {
  if (rawValue === true || rawValue === 1 || rawValue === "1") return true;
  if (rawValue === false || rawValue === 0 || rawValue === "0") return false;

  if (typeof rawValue === "string") {
    const normalized = rawValue.trim().toLowerCase();
    if (normalized === "true" || normalized === "on" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "off" || normalized === "no") {
      return false;
    }
  }

  return null;
}

function isLocalDebugHostname(hostname) {
  const normalizedHost = String(hostname || "").trim().toLowerCase();
  if (!normalizedHost) return true;

  return (
    normalizedHost === "localhost" ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost === "0.0.0.0" ||
    normalizedHost === "::1" ||
    normalizedHost.endsWith(".local")
  );
}

export function isSelectedDragDebugEnabled() {
  if (typeof window === "undefined") return false;

  const explicitWindowFlag = readExplicitDebugFlag(
    window.__DEBUG_SELECTED_DRAG
  );
  if (explicitWindowFlag !== null) return explicitWindowFlag;

  let storageRawValue = null;
  try {
    storageRawValue = window.sessionStorage?.getItem?.("debug:selected-drag");
  } catch {
    storageRawValue = null;
  }

  const explicitStorageFlag = readExplicitDebugFlag(storageRawValue);
  if (explicitStorageFlag !== null) return explicitStorageFlag;

  return (
    process.env.NODE_ENV !== "production" ||
    isLocalDebugHostname(window.location?.hostname)
  );
}

function roundMetric(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const precision = 10 ** digits;
  return Math.round(numeric * precision) / precision;
}

function getDebugNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function getCanvasInteractionDebugStore() {
  if (typeof window === "undefined") return null;
  if (!window.__CANVAS_INTERACTION_DEBUG_STORE) {
    window.__CANVAS_INTERACTION_DEBUG_STORE = {
      sampleCounts: {},
      sampleLastLogAt: {},
    };
  }
  return window.__CANVAS_INTERACTION_DEBUG_STORE;
}

export function sampleCanvasInteractionLog(sampleKey, options = {}) {
  if (!isSelectedDragDebugEnabled()) {
    return {
      shouldLog: false,
      sampleCount: 0,
      nowMs: null,
    };
  }

  const store = getCanvasInteractionDebugStore();
  if (!store) {
    return {
      shouldLog: false,
      sampleCount: 0,
      nowMs: null,
    };
  }

  const safeSampleKey = String(sampleKey || "canvas-interaction");
  const firstCount = Math.max(0, Number(options?.firstCount ?? 3) || 0);
  const throttleMs = Math.max(0, Number(options?.throttleMs ?? 120) || 0);
  const nowMs = getDebugNowMs();
  const nextCount = Number(store.sampleCounts[safeSampleKey] || 0) + 1;
  store.sampleCounts[safeSampleKey] = nextCount;

  const lastLogAt = Number(store.sampleLastLogAt[safeSampleKey] || 0);
  const shouldLog =
    nextCount <= firstCount ||
    throttleMs === 0 ||
    nowMs - lastLogAt >= throttleMs;

  if (shouldLog) {
    store.sampleLastLogAt[safeSampleKey] = nowMs;
  }

  return {
    shouldLog,
    sampleCount: nextCount,
    nowMs: roundMetric(nowMs),
  };
}

export function resetCanvasInteractionLogSample(sampleKey) {
  if (typeof window === "undefined") return;
  const store = getCanvasInteractionDebugStore();
  if (!store) return;

  const safeSampleKey = String(sampleKey || "canvas-interaction");
  delete store.sampleCounts[safeSampleKey];
  delete store.sampleLastLogAt[safeSampleKey];
}

export function getCanvasSelectionDebugInfo() {
  if (typeof window === "undefined") {
    return {
      selectedIds: [],
      selectedCount: 0,
      groupLeader: null,
      groupElementIds: [],
      groupFollowerIds: [],
    };
  }

  const selectedIds = Array.isArray(window._elementosSeleccionados)
    ? [...window._elementosSeleccionados]
    : [];
  const groupElementIds = Array.isArray(window._grupoElementos)
    ? [...window._grupoElementos]
    : [];
  const groupFollowerIds = Array.isArray(window._grupoSeguidores)
    ? [...window._grupoSeguidores]
    : [];

  return {
    selectedIds,
    selectedCount: selectedIds.length,
    groupLeader: window._grupoLider || null,
    groupElementIds,
    groupFollowerIds,
  };
}

export function getKonvaNodeDebugInfo(node) {
  if (!node) return null;

  const canonicalPose = resolveCanonicalNodePose(node);

  let absolutePosition = null;
  try {
    absolutePosition =
      typeof node.absolutePosition === "function"
        ? node.absolutePosition()
        : null;
  } catch {
    absolutePosition = null;
  }

  let clientRect = null;
  try {
    clientRect =
      typeof node.getClientRect === "function"
        ? node.getClientRect({
            skipTransform: false,
            skipShadow: true,
            skipStroke: true,
          })
        : null;
  } catch {
    clientRect = null;
  }

  return {
    className:
      typeof node.getClassName === "function" ? node.getClassName() : null,
    id: typeof node.id === "function" ? node.id() || null : node?.attrs?.id || null,
    name:
      typeof node.name === "function" ? node.name() || null : node?.attrs?.name || null,
    draggable:
      typeof node.draggable === "function" ? Boolean(node.draggable()) : null,
    listening:
      typeof node.listening === "function" ? Boolean(node.listening()) : null,
    x: roundMetric(canonicalPose?.x),
    y: roundMetric(canonicalPose?.y),
    rotation: roundMetric(canonicalPose?.rotation),
    rawX: roundMetric(canonicalPose?.rawX),
    rawY: roundMetric(canonicalPose?.rawY),
    rawRotation: roundMetric(canonicalPose?.rawRotation),
    rawOffsetX: roundMetric(canonicalPose?.rawOffsetX),
    rawOffsetY: roundMetric(canonicalPose?.rawOffsetY),
    canonicalPoseMode: canonicalPose?.canonicalPoseMode || null,
    canonicalUsesOriginOffset: canonicalPose?.usesOriginOffset === true,
    scaleX:
      typeof node.scaleX === "function" ? roundMetric(node.scaleX(), 3) : null,
    scaleY:
      typeof node.scaleY === "function" ? roundMetric(node.scaleY(), 3) : null,
    width:
      typeof node.width === "function" ? roundMetric(node.width(), 3) : null,
    height:
      typeof node.height === "function" ? roundMetric(node.height(), 3) : null,
    radius:
      typeof node.radius === "function" ? roundMetric(node.radius(), 3) : null,
    absoluteX: roundMetric(absolutePosition?.x),
    absoluteY: roundMetric(absolutePosition?.y),
    clientRectX: roundMetric(clientRect?.x),
    clientRectY: roundMetric(clientRect?.y),
    clientRectWidth: roundMetric(clientRect?.width, 3),
    clientRectHeight: roundMetric(clientRect?.height, 3),
  };
}

export function getCanvasPointerDebugInfo(event) {
  if (!event) return null;

  const nativeEvent = event?.evt || null;
  const stage =
    event?.target?.getStage?.() ||
    event?.currentTarget?.getStage?.() ||
    null;

  let stagePointer = null;
  try {
    stagePointer =
      stage && typeof stage.getPointerPosition === "function"
        ? stage.getPointerPosition()
        : null;
  } catch {
    stagePointer = null;
  }

  return {
    type: nativeEvent?.type || null,
    pointerType: nativeEvent?.pointerType || null,
    button:
      Number.isFinite(Number(nativeEvent?.button)) ? Number(nativeEvent.button) : null,
    buttons:
      Number.isFinite(Number(nativeEvent?.buttons)) ? Number(nativeEvent.buttons) : null,
    clientX: roundMetric(nativeEvent?.clientX),
    clientY: roundMetric(nativeEvent?.clientY),
    stageX: roundMetric(stagePointer?.x),
    stageY: roundMetric(stagePointer?.y),
  };
}

function toSerializableDebugValue(value, seen = new WeakSet()) {
  if (value == null) return value;

  const valueType = typeof value;
  if (valueType === "string" || valueType === "boolean") return value;
  if (valueType === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (valueType === "bigint") return String(value);
  if (valueType === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }
  if (valueType === "symbol") return String(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack || null,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => toSerializableDebugValue(item, seen));
  }

  if (valueType === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);

    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        toSerializableDebugValue(nestedValue, seen),
      ])
    );
  }

  return String(value);
}

export function logSelectedDragDebug(eventName, payload = {}) {
  if (!isSelectedDragDebugEnabled()) return;

  const snapshot = toSerializableDebugValue({
    ts: new Date().toISOString(),
    ...payload,
  });

  const formattedSnapshot = JSON.stringify(snapshot, null, 2);

  if (typeof console.group === "function") {
    console.group(`[SELECTED-DRAG] ${eventName}`);
    console.log(formattedSnapshot);
    console.groupEnd();
    return;
  }

  console.log(`[SELECTED-DRAG] ${eventName}\n${formattedSnapshot}`);
}
