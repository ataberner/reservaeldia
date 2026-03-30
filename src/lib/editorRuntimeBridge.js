import {
  ensureEditorSnapshotAdapter,
  readEditorObjectSnapshot,
  readEditorRenderSnapshot,
} from "./editorSnapshotAdapter.js";
import {
  readEditorSelectionRuntimeSnapshot,
} from "./editorSelectionRuntime.js";
import {
  EDITOR_RUNTIME_COMPATIBILITY_CONTRACT,
} from "./editorBridgeContracts.js";
export { EDITOR_RUNTIME_COMPATIBILITY_CONTRACT } from "./editorBridgeContracts.js";

function resolveTargetWindow(targetWindow) {
  if (targetWindow && typeof targetWindow === "object") return targetWindow;
  return typeof window !== "undefined" ? window : null;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" ? value : null;
}

export function readCanvasEditorBridge(targetWindow) {
  const resolvedWindow = resolveTargetWindow(targetWindow);
  return asObject(resolvedWindow?.canvasEditor);
}

export function readCanvasEditorMethod(methodName, targetWindow) {
  const safeMethodName = normalizeText(methodName);
  if (!safeMethodName) return null;

  const bridge = readCanvasEditorBridge(targetWindow);
  const method = bridge?.[safeMethodName];
  if (typeof method !== "function") return null;
  return method.bind(bridge);
}

export function callCanvasEditorMethod(methodName, args = [], targetWindow) {
  const method = readCanvasEditorMethod(methodName, targetWindow);
  if (!method) return null;
  return method(...(Array.isArray(args) ? args : []));
}

export function readCanvasEditorStage(targetWindow) {
  const bridge = readCanvasEditorBridge(targetWindow);
  return bridge?.stageRef || null;
}

export function ensureCanvasEditorSnapshot(targetWindow) {
  const resolvedWindow = resolveTargetWindow(targetWindow);
  if (!resolvedWindow) return null;

  const bridgeSnapshot = readCanvasEditorBridge(resolvedWindow)?.snapshot;
  if (
    bridgeSnapshot &&
    typeof bridgeSnapshot === "object" &&
    typeof bridgeSnapshot.getRenderSnapshot === "function"
  ) {
    return bridgeSnapshot;
  }

  return ensureEditorSnapshotAdapter(resolvedWindow);
}

export function readEditorObjects(targetWindow) {
  const snapshot = readEditorRenderSnapshot(targetWindow);
  return Array.isArray(snapshot?.objetos) ? snapshot.objetos : [];
}

export function readEditorSections(targetWindow) {
  const snapshot = readEditorRenderSnapshot(targetWindow);
  return Array.isArray(snapshot?.secciones) ? snapshot.secciones : [];
}

export function readEditorObjectByType(tipo, targetWindow) {
  const safeTipo = normalizeText(tipo);
  if (!safeTipo) return null;
  return readEditorObjects(targetWindow).find((item) => item?.tipo === safeTipo) || null;
}

export function readEditorObjectById(id, targetWindow) {
  const resolvedWindow = resolveTargetWindow(targetWindow);
  const safeId = normalizeText(id);
  if (!resolvedWindow || !safeId) return null;
  return readEditorObjectSnapshot(resolvedWindow, safeId);
}

export function readEditorActiveSectionId(targetWindow) {
  const resolvedWindow = resolveTargetWindow(targetWindow);
  if (!resolvedWindow) return null;

  const bridge = readCanvasEditorBridge(resolvedWindow);
  const activeSectionId =
    normalizeText(resolvedWindow._seccionActivaId) ||
    normalizeText(bridge?.seccionActivaId) ||
    normalizeText(resolvedWindow._lastSeccionActivaId);

  if (activeSectionId) return activeSectionId;

  return normalizeText(readEditorSections(resolvedWindow)?.[0]?.id) || null;
}

export function readEditorInvitationType(targetWindow) {
  const resolvedWindow = resolveTargetWindow(targetWindow);
  if (!resolvedWindow) return "";

  const bridge = readCanvasEditorBridge(resolvedWindow);
  return (
    normalizeText(resolvedWindow._draftTipoInvitacion) ||
    normalizeText(bridge?.tipoInvitacion) ||
    normalizeText(resolvedWindow._tipoInvitacionActual)
  );
}

export function readEditorSelectionSnapshot(targetWindow) {
  const resolvedWindow = resolveTargetWindow(targetWindow);
  if (!resolvedWindow) {
    return {
      selectedIds: [],
      galleryCell: null,
    };
  }

  const runtimeSnapshot = readEditorSelectionRuntimeSnapshot(resolvedWindow);
  return {
    selectedIds: Array.isArray(runtimeSnapshot?.selectedIds)
      ? [...runtimeSnapshot.selectedIds]
      : [],
    galleryCell: asObject(runtimeSnapshot?.galleryCell)
      ? { ...runtimeSnapshot.galleryCell }
      : null,
  };
}
