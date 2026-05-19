export const DASHBOARD_DOCUMENT_NAME_EVENTS = Object.freeze({
  STATE_CHANGE: "dashboard-document-name-state-change",
  UPDATE_REQUEST: "dashboard-document-name-update-request",
});

const DASHBOARD_DOCUMENT_NAME_STATE_KEY = "__dashboardDocumentNameState";

function resolveTargetWindow(targetWindow) {
  if (targetWindow && typeof targetWindow === "object") return targetWindow;
  return typeof window !== "undefined" ? window : null;
}

function normalizeDocumentName(value) {
  return String(value ?? "");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" ? value : null;
}

function createDocumentNameEvent(targetWindow, eventName, detail) {
  const EventCtor =
    typeof targetWindow?.CustomEvent === "function"
      ? targetWindow.CustomEvent
      : typeof CustomEvent === "function"
        ? CustomEvent
        : null;

  if (EventCtor) {
    return new EventCtor(eventName, { detail });
  }

  const fallbackEvent = new targetWindow.Event(eventName);
  fallbackEvent.detail = detail;
  return fallbackEvent;
}

export function buildDashboardDocumentNameState({
  name = "",
  documentId = "",
  documentKind = "draft",
  editable = false,
} = {}) {
  const normalizedKind = normalizeText(documentKind).toLowerCase();

  return {
    name: normalizeDocumentName(name),
    documentId: normalizeText(documentId) || null,
    documentKind: normalizedKind === "template" ? "template" : "draft",
    editable: editable === true,
  };
}

export function readDashboardDocumentNameState(targetWindow) {
  const resolvedWindow = resolveTargetWindow(targetWindow);
  if (!resolvedWindow) return buildDashboardDocumentNameState();

  return buildDashboardDocumentNameState(
    asObject(resolvedWindow[DASHBOARD_DOCUMENT_NAME_STATE_KEY]) || {}
  );
}

export function publishDashboardDocumentNameState(detail, targetWindow) {
  const resolvedWindow = resolveTargetWindow(targetWindow);
  const nextState = buildDashboardDocumentNameState(detail);
  if (!resolvedWindow) return nextState;

  resolvedWindow[DASHBOARD_DOCUMENT_NAME_STATE_KEY] = nextState;
  resolvedWindow.dispatchEvent(
    createDocumentNameEvent(
      resolvedWindow,
      DASHBOARD_DOCUMENT_NAME_EVENTS.STATE_CHANGE,
      nextState
    )
  );

  return nextState;
}

export function requestDashboardDocumentNameUpdate(detail, targetWindow) {
  const resolvedWindow = resolveTargetWindow(targetWindow);
  if (!resolvedWindow) return null;

  const safeDetail = asObject(detail) || {};
  const updateDetail = {
    name: normalizeDocumentName(safeDetail.name),
    persist: safeDetail.persist !== false,
  };

  resolvedWindow.dispatchEvent(
    createDocumentNameEvent(
      resolvedWindow,
      DASHBOARD_DOCUMENT_NAME_EVENTS.UPDATE_REQUEST,
      updateDetail
    )
  );

  return updateDetail;
}
