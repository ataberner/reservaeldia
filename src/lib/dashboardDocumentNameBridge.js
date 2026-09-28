import { normalizeDesignerAiConversationState } from "../../shared/designerAiConversationLedger.js";

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
  hydrated = false,
  designerAiConversation = null,
  designerAiSourceContext = null,
} = {}) {
  const normalizedKind = normalizeText(documentKind).toLowerCase();

  return {
    name: normalizeDocumentName(name),
    documentId: normalizeText(documentId) || null,
    documentKind: normalizedKind === "template" ? "template" : "draft",
    editable: editable === true,
    hydrated: hydrated === true,
    designerAiConversation: normalizeDesignerAiConversationState(designerAiConversation),
    designerAiSourceContext: {
      templateDerived: designerAiSourceContext?.templateDerived === true,
      changedKeys: (Array.isArray(designerAiSourceContext?.changedKeys)
        ? designerAiSourceContext.changedKeys
        : [])
        .map((key) => normalizeText(key))
        .filter(Boolean)
        .slice(0, 200),
    },
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
    hasName: Object.prototype.hasOwnProperty.call(safeDetail, "name"),
    name: normalizeDocumentName(safeDetail.name),
    persist: safeDetail.persist !== false,
    source: normalizeText(safeDetail.source) || "editor",
    ...(safeDetail.expectedDocumentId ? { expectedDocumentId: safeDetail.expectedDocumentId } : {}),
    ...(typeof safeDetail.onAccepted === "function" ? { onAccepted: safeDetail.onAccepted } : {}),
    designerAiConversation: Object.prototype.hasOwnProperty.call(safeDetail, "designerAiConversation")
      ? normalizeDesignerAiConversationState(safeDetail.designerAiConversation)
      : null,
    ...(typeof safeDetail.onPersisted === "function"
      ? { onPersisted: safeDetail.onPersisted }
      : {}),
    ...(typeof safeDetail.onPersistenceError === "function"
      ? { onPersistenceError: safeDetail.onPersistenceError }
      : {}),
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

// An event dispatch is not an acknowledgement. Only the document owner confirms
// acceptance and completion of its existing persistence path.
export function persistDashboardDocumentUpdate(detail, targetWindow, timeoutMs = 15000) {
  const resolvedWindow = resolveTargetWindow(targetWindow);
  const documentId = readDashboardDocumentNameState(resolvedWindow).documentId;
  return new Promise((resolve, reject) => {
    let accepted = false;
    const timer = setTimeout(() => reject(new Error("No se confirmó el guardado del documento.")), timeoutMs);
    const fail = (error) => { clearTimeout(timer); reject(error); };
    requestDashboardDocumentNameUpdate({
      ...detail, persist: true, expectedDocumentId: documentId,
      onAccepted: () => { accepted = true; },
      onPersisted: (receipt) => {
        clearTimeout(timer);
        if (receipt?.documentId !== documentId ||
            (Object.hasOwn(detail, "name") && receipt.name !== detail.name) ||
            (detail.designerAiConversation && JSON.stringify(receipt.designerAiConversation) !== JSON.stringify(normalizeDesignerAiConversationState(detail.designerAiConversation)))) {
          reject(new Error("El guardado no confirmó el valor solicitado."));
        } else resolve(receipt);
      },
      onPersistenceError: fail,
    }, resolvedWindow);
    if (!accepted) fail(new Error("El editor no confirmó recepción de la actualización."));
  });
}
