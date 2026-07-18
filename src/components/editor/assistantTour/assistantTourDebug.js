export const ASSISTANT_TOUR_DEBUG_STORAGE_KEY =
  "reservaeldia:assistant-tour-debug";

const DEBUG_LOG_LIMIT = 1000;

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
