import { useEffect } from "react";
import {
  EDITOR_BRIDGE_EVENTS,
  buildEditorActiveSectionDetail,
  buildEditorGalleryCellChangeDetail,
  buildEditorSelectionChangeDetail,
} from "@/lib/editorBridgeContracts";
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

    window._objetosActuales = objetos;
    window._elementRefs = elementRefs.current;
    window._seccionesOrdenadas = seccionesOrdenadas;
    window._seccionActivaId = seccionActivaId || null;
    window._altoCanvas = altoCanvas;
    // RSVP/gift globals are owned by their dedicated bridges so they stay normalized.
    syncEditorSnapshotRenderState({
      objetos,
      secciones: seccionesOrdenadas,
      rsvp: rsvpConfig,
      gifts: giftsConfig,
    });
    window.dispatchEvent(
      new CustomEvent(EDITOR_BRIDGE_EVENTS.SELECTION_CHANGE, {
        detail: buildEditorSelectionChangeDetail({
          ids: elementosSeleccionados,
          activeSectionId: seccionActivaId,
          galleryCell: celdaGaleriaActiva,
        }),
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
    window.dispatchEvent(
      new CustomEvent(EDITOR_BRIDGE_EVENTS.GALLERY_CELL_CHANGE, {
        detail: buildEditorGalleryCellChangeDetail(celdaGaleriaActiva),
      })
    );
  }, [celdaGaleriaActiva]);

  useEffect(() => {
    window._seccionActivaId = seccionActivaId || null;
    window.dispatchEvent(
      new CustomEvent(EDITOR_BRIDGE_EVENTS.ACTIVE_SECTION_CHANGE, {
        detail: buildEditorActiveSectionDetail(seccionActivaId),
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
