// src/components/editor/window/useEditorWindowBridge.js
import { useEffect } from "react";
import { registerCountdownAuditContext } from "@/domain/countdownAudit/runtime";
import {
  CANVAS_EDITOR_COMPATIBILITY_KEYS,
} from "@/lib/editorBridgeContracts";
import {
  clearEditorSnapshotResolvers,
  ensureEditorSnapshotAdapter,
  readEditorObjectSnapshot,
  readEditorSectionInfo,
  syncEditorSnapshotResolvers,
} from "@/lib/editorSnapshotAdapter";

/**
 * Puente con window:
 * - window.canvasEditor
 * - window.__getSeccionInfo
 * - window.__getObjById
 */
export default function useEditorWindowBridge({
  seccionesOrdenadas,
  secciones,
  seccionActivaId,
  objetos,
  altoCanvas,
  calcularOffsetY,
  cambiarColorFondoSeccion,
  onDeshacer,
  onRehacer,
  historialLength,
  futurosLength,
  stageRef,
  getTemplateAuthoringSnapshot,
  getTemplateAuthoringStatus,
  repairTemplateAuthoringState,
  ensureInlineEditSettledBeforeCriticalAction,
  flushPersistenceNow,
}) {
  const EXTRA_CANVAS_EDITOR_COMPATIBILITY_KEYS = [
    "cambiarColorFondoSeccion",
    "secciones",
  ];

  const mergeCanvasEditor = (patch = {}) => {
    if (typeof window === "undefined") return;
    // Compatibility boundary: preview/header tooling still reads window.canvasEditor.
    window.canvasEditor = {
      ...(window.canvasEditor || {}),
      ...patch,
    };
  };

  const clearCanvasEditorKeys = (keys = []) => {
    if (typeof window === "undefined") return;
    if (!window.canvasEditor || typeof window.canvasEditor !== "object") return;
    keys.forEach((key) => {
      if (key in window.canvasEditor) delete window.canvasEditor[key];
    });
    if (Object.keys(window.canvasEditor).length === 0) {
      delete window.canvasEditor;
    }
  };

  if (typeof window !== "undefined") {
    const snapshot = ensureEditorSnapshotAdapter(window);
    mergeCanvasEditor({
      cambiarColorFondoSeccion,
      snapshot,
    });
  }

  useEffect(() => {
    const snapshot = ensureEditorSnapshotAdapter(window);
    mergeCanvasEditor({
      cambiarColorFondoSeccion,
      snapshot,
      seccionActivaId,
      secciones,
      deshacer: onDeshacer,
      rehacer: onRehacer,
      stageRef: stageRef.current,
      getHistorial: () => ({ historial: historialLength, futuros: futurosLength }),
      getTemplateAuthoringSnapshot:
        typeof getTemplateAuthoringSnapshot === "function"
          ? getTemplateAuthoringSnapshot
          : undefined,
      getTemplateAuthoringStatus:
        typeof getTemplateAuthoringStatus === "function"
          ? getTemplateAuthoringStatus
          : undefined,
      repairTemplateAuthoringState:
        typeof repairTemplateAuthoringState === "function"
          ? repairTemplateAuthoringState
          : undefined,
      ensureInlineEditSettledBeforeCriticalAction:
        typeof ensureInlineEditSettledBeforeCriticalAction === "function"
          ? ensureInlineEditSettledBeforeCriticalAction
          : undefined,
      flushPersistenceNow:
        typeof flushPersistenceNow === "function"
          ? flushPersistenceNow
          : undefined,
    });
  }, [
    cambiarColorFondoSeccion,
    seccionActivaId,
    secciones,
    onDeshacer,
    onRehacer,
    historialLength,
    futurosLength,
    stageRef,
    getTemplateAuthoringSnapshot,
    getTemplateAuthoringStatus,
    repairTemplateAuthoringState,
    ensureInlineEditSettledBeforeCriticalAction,
    flushPersistenceNow,
  ]);

  useEffect(() => {
    registerCountdownAuditContext({
      getCurrentCountdown: () =>
        (Array.isArray(objetos) ? objetos : []).find((item) => item?.tipo === "countdown") || null,
      getCurrentSections: () => (Array.isArray(seccionesOrdenadas) ? [...seccionesOrdenadas] : []),
      stageRef,
      seccionActivaId,
    });
  }, [objetos, seccionesOrdenadas, stageRef, seccionActivaId]);

  useEffect(() => {
    const getSectionInfo = (id) => {
      try {
        const idx = seccionesOrdenadas.findIndex((s) => s.id === id);
        if (idx === -1) return null;

        const height = Number(
          seccionesOrdenadas[idx]?.altura ?? seccionesOrdenadas[idx]?.height ?? 400
        );

        const top = calcularOffsetY(seccionesOrdenadas, idx);
        return { idx, top, height };
      } catch {
        return null;
      }
    };
    const getObjectById = (id) => (objetos || []).find((o) => o.id === id) || null;

    syncEditorSnapshotResolvers({
      getSectionInfo,
      getObjectById,
    });

    window.__getSeccionInfo = (id) => readEditorSectionInfo(window, id);
    window.__getObjById = (id) => readEditorObjectSnapshot(window, id);

    return () => {
      clearEditorSnapshotResolvers(window);
      delete window.__getSeccionInfo;
      delete window.__getObjById;
    };
  }, [seccionesOrdenadas, calcularOffsetY, objetos]);

  useEffect(() => {
    return () => {
      clearCanvasEditorKeys([
        ...CANVAS_EDITOR_COMPATIBILITY_KEYS,
        ...EXTRA_CANVAS_EDITOR_COMPATIBILITY_KEYS,
        "getHistorial",
      ]);
    };
  }, []);

  // altoCanvas queda disponible para futuras extensiones del bridge.
  void altoCanvas;
}

