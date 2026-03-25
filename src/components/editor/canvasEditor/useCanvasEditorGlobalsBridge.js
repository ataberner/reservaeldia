import { useEffect } from "react";
import {
  clearEditorSnapshotRenderState,
  syncEditorSnapshotRenderState,
} from "@/lib/editorSnapshotAdapter";

export default function useCanvasEditorGlobalsBridge({
  elementosSeleccionados,
  objetos,
  elementRefs,
  secciones,
  rsvpConfig,
  giftsConfig,
  altoCanvas,
  seccionActivaId,
  celdaGaleriaActiva,
  setCeldaGaleriaActiva,
  hoverId,
  setHoverId,
}) {
  useEffect(() => {
    const seccionesOrdenadas = [...secciones].sort((a, b) => a.orden - b.orden);

    window._elementosSeleccionados = elementosSeleccionados;
    window._objetosActuales = objetos;
    window._elementRefs = elementRefs.current;
    window._seccionesOrdenadas = seccionesOrdenadas;
    window._rsvpConfigActual = rsvpConfig && typeof rsvpConfig === "object" ? rsvpConfig : null;
    window._giftsConfigActual = giftsConfig && typeof giftsConfig === "object" ? giftsConfig : null;
    window._altoCanvas = altoCanvas;
    syncEditorSnapshotRenderState({
      objetos,
      secciones: seccionesOrdenadas,
      rsvp: rsvpConfig,
      gifts: giftsConfig,
    });
    window.dispatchEvent(
      new CustomEvent("editor-selection-change", {
        detail: {
          ids: [...elementosSeleccionados],
          activeSectionId: seccionActivaId || null,
          galleryCell: celdaGaleriaActiva || null,
        },
      })
    );
  }, [
    elementosSeleccionados,
    objetos,
    secciones,
    rsvpConfig,
    giftsConfig,
    altoCanvas,
    seccionActivaId,
    celdaGaleriaActiva,
    elementRefs,
  ]);

  useEffect(() => {
    return () => {
      clearEditorSnapshotRenderState();
    };
  }, []);

  useEffect(() => {
    if (!celdaGaleriaActiva) return;

    const { objId } = celdaGaleriaActiva;
    const galeriaExiste = objetos.some((o) => o.id === objId && o.tipo === "galeria");
    if (!galeriaExiste) {
      setCeldaGaleriaActiva(null);
      return;
    }

    if (elementosSeleccionados.length !== 1 || elementosSeleccionados[0] !== objId) {
      setCeldaGaleriaActiva(null);
    }
  }, [celdaGaleriaActiva, elementosSeleccionados, objetos, setCeldaGaleriaActiva]);

  useEffect(() => {
    window._celdaGaleriaActiva = celdaGaleriaActiva || null;
    window.dispatchEvent(
      new CustomEvent("editor-gallery-cell-change", {
        detail: { cell: celdaGaleriaActiva || null },
      })
    );
  }, [celdaGaleriaActiva]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("seccion-activa", {
        detail: { id: seccionActivaId || null },
      })
    );
  }, [seccionActivaId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.setHoverIdGlobal = setHoverId;
    return () => {
      if (window.setHoverIdGlobal === setHoverId) {
        delete window.setHoverIdGlobal;
      }
    };
  }, [setHoverId]);

  useEffect(() => {
    if (!hoverId) return;
    const exists = objetos.some((o) => o.id === hoverId);
    if (!exists) setHoverId(null);
  }, [hoverId, objetos, setHoverId]);
}
