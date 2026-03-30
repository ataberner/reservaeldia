const INLINE_CARET_SCROLL_DEBUG_FLAG_KEY = "__INLINE_CARET_SCROLL_DEBUG";
const INLINE_CARET_SCROLL_EVENTS_KEY = "__INLINE_CARET_SCROLL_EVENTS";
const INLINE_CARET_SCROLL_LAST_EVENT_KEY = "__INLINE_CARET_SCROLL_LAST_EVENT";
const INLINE_CARET_SCROLL_EVENT_SEQ_KEY = "__INLINE_CARET_SCROLL_EVENT_SEQ";
const INLINE_CARET_SCROLL_ENABLE_FN_KEY =
  "__ENABLE_INLINE_CARET_SCROLL_DEBUG";
const INLINE_CARET_SCROLL_DISABLE_FN_KEY =
  "__DISABLE_INLINE_CARET_SCROLL_DEBUG";
const INLINE_CARET_SCROLL_STATE_FN_KEY =
  "__GET_INLINE_CARET_SCROLL_DEBUG_STATE";
const INLINE_CARET_SCROLL_RESET_FN_KEY =
  "__RESET_INLINE_CARET_SCROLL_DEBUG_TRACE";
const INLINE_CARET_SCROLL_SESSION_STORAGE_KEY =
  "debug:inline-caret-scroll";
const INLINE_CARET_SCROLL_LOCAL_STORAGE_KEY =
  "debug:inline-caret-scroll:persist";
const INLINE_CARET_SCROLL_EVENT_LIMIT = 250;

function getDebugWindow(targetWindow = null) {
  if (targetWindow && typeof targetWindow === "object") {
    return targetWindow;
  }
  if (typeof window !== "undefined") {
    return window;
  }
  return null;
}

function readInlineCaretScrollDebugFlag(value, fallback = null) {
  if (typeof value === "undefined" || value === null) return fallback;
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
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
  return fallback;
}

function readStorageValue(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorageValue(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorageValue(storage, key) {
  try {
    storage?.removeItem?.(key);
    return true;
  } catch {
    return false;
  }
}

function resolveStorage(targetWindow, storageKind) {
  if (!targetWindow) return null;
  try {
    return targetWindow[storageKind] ?? null;
  } catch {
    return null;
  }
}

function ensureTraceBuffer(targetWindow, { reset = false } = {}) {
  if (!targetWindow) return;
  if (reset || !Array.isArray(targetWindow[INLINE_CARET_SCROLL_EVENTS_KEY])) {
    targetWindow[INLINE_CARET_SCROLL_EVENTS_KEY] = [];
  }
  if (reset || typeof targetWindow[INLINE_CARET_SCROLL_LAST_EVENT_KEY] === "undefined") {
    targetWindow[INLINE_CARET_SCROLL_LAST_EVENT_KEY] = null;
  }
  if (reset || !Number.isFinite(Number(targetWindow[INLINE_CARET_SCROLL_EVENT_SEQ_KEY]))) {
    targetWindow[INLINE_CARET_SCROLL_EVENT_SEQ_KEY] = 0;
  }
}

export function resolveInlineCaretScrollDebugState(targetWindow = null) {
  const resolvedWindow = getDebugWindow(targetWindow);
  if (!resolvedWindow) {
    return {
      enabled: false,
      source: "unavailable",
      rawValue: null,
    };
  }

  const windowRawValue = resolvedWindow[INLINE_CARET_SCROLL_DEBUG_FLAG_KEY];
  const explicitWindowFlag = readInlineCaretScrollDebugFlag(windowRawValue, null);
  if (explicitWindowFlag !== null) {
    return {
      enabled: explicitWindowFlag,
      source: "window",
      rawValue: windowRawValue,
    };
  }

  const sessionRawValue = readStorageValue(
    resolveStorage(resolvedWindow, "sessionStorage"),
    INLINE_CARET_SCROLL_SESSION_STORAGE_KEY
  );
  const explicitSessionFlag = readInlineCaretScrollDebugFlag(
    sessionRawValue,
    null
  );
  if (explicitSessionFlag !== null) {
    return {
      enabled: explicitSessionFlag,
      source: "sessionStorage",
      rawValue: sessionRawValue,
    };
  }

  const localRawValue = readStorageValue(
    resolveStorage(resolvedWindow, "localStorage"),
    INLINE_CARET_SCROLL_LOCAL_STORAGE_KEY
  );
  const explicitLocalFlag = readInlineCaretScrollDebugFlag(localRawValue, null);
  if (explicitLocalFlag !== null) {
    return {
      enabled: explicitLocalFlag,
      source: "localStorage",
      rawValue: localRawValue,
    };
  }

  return {
    enabled: false,
    source: "default",
    rawValue: null,
  };
}

function syncInlineCaretScrollDebugWindowFlag(targetWindow = null) {
  const resolvedWindow = getDebugWindow(targetWindow);
  const state = resolveInlineCaretScrollDebugState(resolvedWindow);
  if (!resolvedWindow) return state;

  if (
    state.source !== "window" &&
    typeof resolvedWindow[INLINE_CARET_SCROLL_DEBUG_FLAG_KEY] === "undefined"
  ) {
    resolvedWindow[INLINE_CARET_SCROLL_DEBUG_FLAG_KEY] = state.enabled;
  }

  if (state.enabled) {
    ensureTraceBuffer(resolvedWindow);
  }

  return state;
}

export function setInlineCaretScrollDebugEnabled(
  enabled,
  {
    targetWindow = null,
    persist = "session",
    resetTrace = false,
    clearTrace = false,
  } = {}
) {
  const resolvedWindow = getDebugWindow(targetWindow);
  if (!resolvedWindow) {
    return {
      enabled: false,
      source: "unavailable",
      rawValue: null,
    };
  }

  const nextEnabled = Boolean(enabled);
  resolvedWindow[INLINE_CARET_SCROLL_DEBUG_FLAG_KEY] = nextEnabled;

  const sessionStorage = resolveStorage(resolvedWindow, "sessionStorage");
  const localStorage = resolveStorage(resolvedWindow, "localStorage");

  removeStorageValue(sessionStorage, INLINE_CARET_SCROLL_SESSION_STORAGE_KEY);
  removeStorageValue(localStorage, INLINE_CARET_SCROLL_LOCAL_STORAGE_KEY);

  if (nextEnabled) {
    if (persist === "session") {
      writeStorageValue(
        sessionStorage,
        INLINE_CARET_SCROLL_SESSION_STORAGE_KEY,
        "1"
      );
    } else if (persist === "local") {
      writeStorageValue(
        localStorage,
        INLINE_CARET_SCROLL_LOCAL_STORAGE_KEY,
        "1"
      );
    }
  } else if (persist === "session") {
    writeStorageValue(
      sessionStorage,
      INLINE_CARET_SCROLL_SESSION_STORAGE_KEY,
      "0"
    );
  } else if (persist === "local") {
    writeStorageValue(
      localStorage,
      INLINE_CARET_SCROLL_LOCAL_STORAGE_KEY,
      "0"
    );
  }

  if (resetTrace) {
    ensureTraceBuffer(resolvedWindow, { reset: true });
  } else if (clearTrace) {
    ensureTraceBuffer(resolvedWindow, { reset: true });
  } else if (nextEnabled) {
    ensureTraceBuffer(resolvedWindow);
  }

  return syncInlineCaretScrollDebugWindowFlag(resolvedWindow);
}

export function resetInlineCaretScrollDebugTrace(targetWindow = null) {
  const resolvedWindow = getDebugWindow(targetWindow);
  if (!resolvedWindow) return false;
  ensureTraceBuffer(resolvedWindow, { reset: true });
  return true;
}

export function attachInlineCaretScrollDebugWindowHelpers(targetWindow = null) {
  const resolvedWindow = getDebugWindow(targetWindow);
  if (!resolvedWindow) return false;

  resolvedWindow[INLINE_CARET_SCROLL_ENABLE_FN_KEY] = (options = {}) =>
    setInlineCaretScrollDebugEnabled(true, {
      targetWindow: resolvedWindow,
      persist: options?.persist || "session",
      resetTrace: options?.resetTrace !== false,
    });

  resolvedWindow[INLINE_CARET_SCROLL_DISABLE_FN_KEY] = (options = {}) =>
    setInlineCaretScrollDebugEnabled(false, {
      targetWindow: resolvedWindow,
      persist: options?.persist || "none",
      clearTrace: Boolean(options?.clearTrace),
    });

  resolvedWindow[INLINE_CARET_SCROLL_STATE_FN_KEY] = () =>
    resolveInlineCaretScrollDebugState(resolvedWindow);

  resolvedWindow[INLINE_CARET_SCROLL_RESET_FN_KEY] = () =>
    resetInlineCaretScrollDebugTrace(resolvedWindow);

  return true;
}

export function isInlineCaretScrollDebugEnabled(targetWindow = null) {
  return syncInlineCaretScrollDebugWindowFlag(targetWindow).enabled;
}

export function emitInlineCaretScrollDebugEvent(eventName, payload = {}) {
  const resolvedWindow = getDebugWindow();
  const debugState = syncInlineCaretScrollDebugWindowFlag(resolvedWindow);

  if (!debugState.enabled || !resolvedWindow) {
    return null;
  }

  const nextSequence = Math.max(
    1,
    Number(resolvedWindow[INLINE_CARET_SCROLL_EVENT_SEQ_KEY] || 0) + 1
  );
  resolvedWindow[INLINE_CARET_SCROLL_EVENT_SEQ_KEY] = nextSequence;

  const event = {
    seq: nextSequence,
    eventName: String(eventName || "unknown"),
    timestampMs: Date.now(),
    performanceNowMs:
      typeof performance !== "undefined" &&
      Number.isFinite(Number(performance.now?.()))
        ? Number(performance.now())
        : null,
    debugSource: debugState.source,
    ...payload,
  };

  const existingEvents = Array.isArray(
    resolvedWindow[INLINE_CARET_SCROLL_EVENTS_KEY]
  )
    ? resolvedWindow[INLINE_CARET_SCROLL_EVENTS_KEY]
    : [];
  existingEvents.push(event);
  if (existingEvents.length > INLINE_CARET_SCROLL_EVENT_LIMIT) {
    existingEvents.splice(
      0,
      existingEvents.length - INLINE_CARET_SCROLL_EVENT_LIMIT
    );
  }
  resolvedWindow[INLINE_CARET_SCROLL_EVENTS_KEY] = existingEvents;
  resolvedWindow[INLINE_CARET_SCROLL_LAST_EVENT_KEY] = event;

  try {
    console.log(`[INLINE][CARET_SCROLL] ${event.eventName}`, event);
  } catch {
    // no-op
  }

  return event;
}

if (typeof window !== "undefined") {
  attachInlineCaretScrollDebugWindowHelpers(window);
  const initialState = syncInlineCaretScrollDebugWindowFlag(window);
  if (initialState.enabled) {
    console.log(
      "INLINE_CARET_SCROLL_DEBUG_RESTORED",
      initialState.enabled,
      initialState.source
    );
  }
}
