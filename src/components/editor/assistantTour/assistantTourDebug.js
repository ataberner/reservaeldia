export const ASSISTANT_TOUR_DEBUG_STORAGE_KEY =
  "reservaeldia:assistant-tour-debug";
export const ASSISTANT_TOUR_DEBUG_VISUAL_STORAGE_KEY =
  "reservaeldia:assistant-tour-debug-visual";

const DEBUG_LOG_LIMIT = 1000;
const DEBUG_SNAPSHOT_LIMIT = 100;

function getDebugWindow() {
  return typeof window === "undefined" ? null : window;
}

export function shouldDebugAssistantTour() {
  const debugWindow = getDebugWindow();
  if (!debugWindow) return false;
  try {
    return (
      debugWindow.localStorage?.getItem(ASSISTANT_TOUR_DEBUG_STORAGE_KEY) ===
      "1"
    );
  } catch {
    return false;
  }
}

export function shouldShowAssistantTourDebugVisual() {
  const debugWindow = getDebugWindow();
  if (!debugWindow || !shouldDebugAssistantTour()) return false;
  try {
    return (
      debugWindow.localStorage?.getItem(
        ASSISTANT_TOUR_DEBUG_VISUAL_STORAGE_KEY
      ) === "1"
    );
  } catch {
    return false;
  }
}

function readDebugHistory(debugWindow) {
  if (!debugWindow) return [];
  if (!Array.isArray(debugWindow.__assistantTourDebugHistory)) {
    debugWindow.__assistantTourDebugHistory = [];
  }
  return debugWindow.__assistantTourDebugHistory;
}

export function recordAssistantTourDebugSnapshot(snapshot = {}) {
  const debugWindow = getDebugWindow();
  if (!debugWindow || !shouldDebugAssistantTour()) return null;

  const record =
    snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
      ? {
          timestamp: Date.now(),
          performanceNow:
            typeof debugWindow.performance?.now === "function"
              ? Math.round(debugWindow.performance.now())
              : null,
          ...snapshot,
        }
      : {
          timestamp: Date.now(),
          snapshotError: "invalid-snapshot",
        };
  const history = readDebugHistory(debugWindow);
  history.push(record);
  if (history.length > DEBUG_SNAPSHOT_LIMIT) {
    history.splice(0, history.length - DEBUG_SNAPSHOT_LIMIT);
  }
  debugWindow.__assistantTourDebugLastSnapshot = record;
  console.debug("[assistant-tour:snapshot]", record);
  return record;
}

export function installAssistantTourDebugApi(captureSnapshot) {
  const debugWindow = getDebugWindow();
  if (!debugWindow || !shouldDebugAssistantTour()) return;

  const capture =
    typeof captureSnapshot === "function"
      ? captureSnapshot
      : () => ({ captureError: "capture-unavailable" });

  debugWindow.__assistantTourDebug = {
    capture(options = {}) {
      const snapshot = capture({
        reason: "manual-capture",
        manualPoint: options,
      });
      const record = recordAssistantTourDebugSnapshot(snapshot);
      console.debug("[assistant-tour:capture]", record);
      return record;
    },
    clear() {
      debugWindow.__assistantTourDebugHistory = [];
      debugWindow.__assistantTourDebugLog = [];
      debugWindow.__assistantTourDebugLastSnapshot = null;
      debugWindow.__assistantTourLastDebugRecord = null;
      console.debug("[assistant-tour] debug history cleared");
    },
    get history() {
      return readDebugHistory(debugWindow);
    },
    get log() {
      return Array.isArray(debugWindow.__assistantTourDebugLog)
        ? debugWindow.__assistantTourDebugLog
        : [];
    },
  };
}

export function logAssistantTourDebug(eventName, detail = {}) {
  const debugWindow = getDebugWindow();
  if (!debugWindow || !shouldDebugAssistantTour()) return;

  let resolvedDetail = {};
  try {
    resolvedDetail = typeof detail === "function" ? detail() : detail;
  } catch (error) {
    resolvedDetail = {
      debugError: error?.message || String(error),
    };
  }

  const safeDetail =
    resolvedDetail && typeof resolvedDetail === "object" && !Array.isArray(resolvedDetail)
      ? { ...resolvedDetail }
      : {};
  if (Object.prototype.hasOwnProperty.call(safeDetail, "eventName")) {
    safeDetail.detailEventName = safeDetail.eventName;
    delete safeDetail.eventName;
  }

  const record = {
    eventName,
    timestamp: Date.now(),
    performanceNow:
      typeof debugWindow.performance?.now === "function"
        ? Math.round(debugWindow.performance.now())
        : null,
    ...safeDetail,
  };

  const currentLog = Array.isArray(debugWindow.__assistantTourDebugLog)
    ? debugWindow.__assistantTourDebugLog
    : [];
  currentLog.push(record);
  if (currentLog.length > DEBUG_LOG_LIMIT) {
    currentLog.splice(0, currentLog.length - DEBUG_LOG_LIMIT);
  }
  debugWindow.__assistantTourDebugLog = currentLog;
  debugWindow.__assistantTourLastDebugRecord = record;

  console.debug("[assistant-tour]", eventName, record);
}
