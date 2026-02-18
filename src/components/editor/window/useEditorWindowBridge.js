// src/components/editor/window/useEditorWindowBridge.js
import { useEffect } from "react";

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
}) {
  const mergeCanvasEditor = (patch = {}) => {
    if (typeof window === "undefined") return;
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
    mergeCanvasEditor({
      cambiarColorFondoSeccion,
    });
  }

  useEffect(() => {
    mergeCanvasEditor({
      cambiarColorFondoSeccion,
      seccionActivaId,
      secciones,
      deshacer: onDeshacer,
      rehacer: onRehacer,
      stageRef: stageRef.current,
      getHistorial: () => ({ historial: historialLength, futuros: futurosLength }),
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
  ]);

  useEffect(() => {
    window.__getSeccionInfo = (id) => {
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

    return () => {
      delete window.__getSeccionInfo;
    };
  }, [seccionesOrdenadas, calcularOffsetY]);

  useEffect(() => {
    window.__getObjById = (id) => (objetos || []).find((o) => o.id === id) || null;
    return () => {
      delete window.__getObjById;
    };
  }, [objetos]);

  useEffect(() => {
    return () => {
      clearCanvasEditorKeys([
        "cambiarColorFondoSeccion",
        "seccionActivaId",
        "secciones",
        "deshacer",
        "rehacer",
        "stageRef",
        "getHistorial",
      ]);
    };
  }, []);

  // altoCanvas queda disponible para futuras extensiones del bridge.
  void altoCanvas;
}

