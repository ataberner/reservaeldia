function readExplicitDebugFlag(rawValue) {
  if (rawValue === true || rawValue === 1 || rawValue === "1") return true;
  if (rawValue === false || rawValue === 0 || rawValue === "0") return false;

  if (typeof rawValue === "string") {
    const normalized = rawValue.trim().toLowerCase();
    if (
      normalized === "true" ||
      normalized === "on" ||
      normalized === "yes"
    ) {
      return true;
    }
    if (
      normalized === "false" ||
      normalized === "off" ||
      normalized === "no"
    ) {
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

function getNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function roundImageResizeMetric(value, digits = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

export function isImageResizeDebugEnabled() {
  if (typeof window === "undefined") return false;

  const explicitWindowFlag = readExplicitDebugFlag(window.__DBG_IMAGE_RESIZE);
  if (explicitWindowFlag !== null) return explicitWindowFlag;

  let storageRawValue = null;
  try {
    storageRawValue = window.sessionStorage?.getItem?.("debug:image-resize");
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

function isImageResizeVerboseConsoleEnabled() {
  if (typeof window === "undefined") return false;

  const explicitWindowFlag = readExplicitDebugFlag(
    window.__DBG_IMAGE_RESIZE_VERBOSE_CONSOLE
  );
  if (explicitWindowFlag !== null) return explicitWindowFlag;

  let storageRawValue = null;
  try {
    storageRawValue = window.sessionStorage?.getItem?.(
      "debug:image-resize:verbose"
    );
  } catch {
    storageRawValue = null;
  }

  const explicitStorageFlag = readExplicitDebugFlag(storageRawValue);
  if (explicitStorageFlag !== null) return explicitStorageFlag;

  return true;
}

function shouldEmitConsole(eventName) {
  if (isImageResizeVerboseConsoleEnabled()) return true;
  return (
    eventName === "transform-start:image-cache-cleared" ||
    eventName === "transform-end:image-cache-cleared" ||
    eventName === "transform-end:image-final" ||
    eventName === "composer:image-commit-request" ||
    eventName === "composer:image-commit-raf1" ||
    eventName === "composer:image-commit-raf2" ||
    eventName === "renderer:selected-image-sync"
  );
}

function getImageResizeDebugStore() {
  if (typeof window === "undefined") return null;
  if (!window.__IMAGE_RESIZE_DEBUG_STORE) {
    window.__IMAGE_RESIZE_DEBUG_STORE = {
      counts: {},
      lastLogAt: {},
      trace: [],
    };
  }
  return window.__IMAGE_RESIZE_DEBUG_STORE;
}

export function getImageResizeNodeSnapshot(node) {
  if (!node) {
    return {
      nodePresent: false,
    };
  }

  const scaleX = typeof node.scaleX === "function" ? Number(node.scaleX() || 1) : 1;
  const scaleY = typeof node.scaleY === "function" ? Number(node.scaleY() || 1) : 1;
  const width = typeof node.width === "function" ? Number(node.width() || 0) : Number(node?.attrs?.width || 0);
  const height = typeof node.height === "function" ? Number(node.height() || 0) : Number(node?.attrs?.height || 0);
  const crop = typeof node.crop === "function" ? node.crop() : node?.attrs?.crop || null;
  let clientRect = null;

  try {
    clientRect = node.getClientRect?.({
      skipTransform: false,
      skipShadow: true,
      skipStroke: true,
    }) || null;
  } catch {
    clientRect = null;
  }

  return {
    nodePresent: true,
    x: typeof node.x === "function" ? roundImageResizeMetric(node.x()) : null,
    y: typeof node.y === "function" ? roundImageResizeMetric(node.y()) : null,
    rotation: typeof node.rotation === "function" ? roundImageResizeMetric(node.rotation() || 0, 2) : null,
    width: roundImageResizeMetric(width),
    height: roundImageResizeMetric(height),
    renderedWidth: roundImageResizeMetric(width * Math.abs(scaleX || 1)),
    renderedHeight: roundImageResizeMetric(height * Math.abs(scaleY || 1)),
    scaleX: roundImageResizeMetric(scaleX),
    scaleY: roundImageResizeMetric(scaleY),
    cropX: roundImageResizeMetric(crop?.x),
    cropY: roundImageResizeMetric(crop?.y),
    cropWidth: roundImageResizeMetric(crop?.width),
    cropHeight: roundImageResizeMetric(crop?.height),
    cached: typeof node.isCached === "function" ? node.isCached() : null,
    clientRectWidth: roundImageResizeMetric(clientRect?.width),
    clientRectHeight: roundImageResizeMetric(clientRect?.height),
  };
}

export function trackImageResizeDebug(eventName, payload = {}, options = {}) {
  if (!isImageResizeDebugEnabled()) return;

  const store = getImageResizeDebugStore();
  if (!store) return;

  const throttleMs = Number(options?.throttleMs || 0);
  const throttleKey = String(options?.throttleKey || eventName);
  const nowMs = getNowMs();
  const lastLogAt = Number(store.lastLogAt[throttleKey] || 0);

  if (throttleMs > 0 && nowMs - lastLogAt < throttleMs) {
    return;
  }

  store.lastLogAt[throttleKey] = nowMs;
  store.counts[eventName] = Number(store.counts[eventName] || 0) + 1;

  const entry = {
    count: store.counts[eventName],
    eventName,
    atMs: roundImageResizeMetric(nowMs, 2),
    iso: new Date().toISOString(),
    payload,
  };

  store.trace.push(entry);
  if (store.trace.length > 400) {
    store.trace.splice(0, store.trace.length - 400);
  }

  window.__IMAGE_RESIZE_DEBUG_TRACE = store.trace;
  window.__IMAGE_RESIZE_DEBUG_LAST = entry;
  window.__IMAGE_RESIZE_DEBUG_TRACE_TEXT = store.trace
    .map((item) => JSON.stringify(item, null, 2))
    .join("\n\n");
  window.__IMAGE_RESIZE_DEBUG_LAST_TEXT = JSON.stringify(entry, null, 2);

  if (shouldEmitConsole(eventName)) {
    const formattedEntry = JSON.stringify(entry, null, 2);
    console.log(`[IMG-RESIZE] ${eventName}\n${formattedEntry}`);
  }
}
