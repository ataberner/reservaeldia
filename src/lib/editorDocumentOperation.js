import { DASHBOARD_DOCUMENT_NAME_EVENTS, readDashboardDocumentNameState } from "./dashboardDocumentNameBridge.js";

// A document change is terminal, even if the user later returns to the same id.
// Call run immediately before consulting a mutable editor bridge, never before an await.
export function createEditorDocumentOperation(targetWindow) {
  const initial = readDashboardDocumentNameState(targetWindow);
  let active = Boolean(initial.documentId && initial.hydrated && initial.editable);
  const cancel = () => {
    active = false;
    targetWindow?.removeEventListener(DASHBOARD_DOCUMENT_NAME_EVENTS.STATE_CHANGE, check);
  };
  const check = () => {
    const current = readDashboardDocumentNameState(targetWindow);
    if (!current.editable || !current.hydrated || current.documentId !== initial.documentId ||
        current.documentKind !== initial.documentKind) cancel();
    return active;
  };
  targetWindow?.addEventListener(DASHBOARD_DOCUMENT_NAME_EVENTS.STATE_CHANGE, check);
  return {
    documentId: initial.documentId,
    isCurrent: check,
    cancel,
    run(mutate) {
      if (!check()) throw new Error("La operación pertenece a una sesión del editor que ya se cerró.");
      return mutate();
    },
  };
}
