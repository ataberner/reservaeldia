// src/components/editor/window/useEditorWindowBridge.js
import { useEffect } from "react";

/**
 * Puente con window (NO cambia lógica):
 * - window.canvasEditor (todas las exposiciones existentes)
 * - window.__getSeccionInfo
 * - window.__getObjById
 *
 * Importante: este hook replica los bloques tal cual estaban en CanvasEditor.
 */
export default function useEditorWindowBridge({
  // datos para getters
  seccionesOrdenadas,
  secciones,
  seccionActivaId,
  objetos,
  altoCanvas,
  calcularOffsetY,

  // acciones expuestas
  cambiarColorFondoSeccion,

  // historial / acciones
  onDeshacer,
  onRehacer,
  historialLength,
  futurosLength,

  // refs
  stageRef,
}) {
  // ✅ Exponer inmediatamente (no solo en useEffect) — replicado
  // (esto estaba en CanvasEditor como asignación inmediata)
  if (typeof window !== "undefined") {
    window.canvasEditor = {
      ...(window.canvasEditor || {}),
      cambiarColorFondoSeccion,
    };
  }

  // 🔥 Exponer globalmente (en cada render actualizamos la ref) — replicado
  useEffect(() => {
    window.canvasEditor = {
      ...(window.canvasEditor || {}),
      cambiarColorFondoSeccion,
      seccionActivaId,
      secciones,
    };
  }, [cambiarColorFondoSeccion, seccionActivaId, secciones]);

  // ✅ Exponer al window para usarlo en DashboardHeader — replicado (sí, es redundante)
  useEffect(() => {
    window.canvasEditor = {
      ...(window.canvasEditor || {}),
      cambiarColorFondoSeccion,
    };
  }, [cambiarColorFondoSeccion]);

  // 1) Exponer info de secciones (top/height) para centrar correctamente — replicado
  useEffect(() => {
    window.__getSeccionInfo = (id) => {
      try {
        const idx = seccionesOrdenadas.findIndex((s) => s.id === id);
        if (idx === -1) return null;

        const height = Number(
          seccionesOrdenadas[idx]?.altura ?? seccionesOrdenadas[idx]?.height ?? 400
        );

        const top = calcularOffsetY(seccionesOrdenadas, idx); // tu helper actual
        return { idx, top, height };
      } catch {
        return null;
      }
    };

    return () => {
      delete window.__getSeccionInfo;
    };
  }, [seccionesOrdenadas, calcularOffsetY]);

  // 2) Exponer un getter de objetos por id — replicado
  useEffect(() => {
    window.__getObjById = (id) => (objetos || []).find((o) => o.id === id) || null;
    return () => {
      delete window.__getObjById;
    };
  }, [objetos]);

  // Exposición de canvasEditor para deshacer/rehacer + stageRef + getHistorial — replicado
  useEffect(() => {
    window.canvasEditor = {
      deshacer: onDeshacer,
      rehacer: onRehacer,
      stageRef: stageRef.current, // ✅ ahora sí
      getHistorial: () => ({ historial: historialLength, futuros: futurosLength }),
    };

    return () => {
      delete window.canvasEditor;
    };
  }, [onDeshacer, onRehacer, historialLength, futurosLength, stageRef]);

  // Nota: altoCanvas se pasa por si lo necesitás en el futuro, pero no lo usa este bridge
}