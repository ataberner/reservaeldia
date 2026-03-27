import { useCallback } from "react";

function isGlobalCanvasInteractionActive() {
  return (
    typeof window !== "undefined" &&
    Boolean(
      window._isDragging ||
        window._grupoLider ||
        window._resizeData?.isResizing
    )
  );
}

export default function useCanvasEditorSelectionUi({
  hoverId,
  setHoverIdState,
  setMostrarPanelZ,
  setMostrarSubmenuCapa,
  setMostrarSelectorFuente,
  setMostrarSelectorTamano,
  setElementosSeleccionados,
  setElementosPreSeleccionados,
  setSeleccionActiva,
  setInicioSeleccion,
  setAreaSeleccion,
  setBackgroundEditSectionId,
  setIsBackgroundEditInteracting,
}) {
  const setHoverId = useCallback(
    (nextHoverId) => {
      setHoverIdState((currentHoverId) => {
        if (isGlobalCanvasInteractionActive()) {
          return currentHoverId;
        }

        const resolvedHoverId =
          typeof nextHoverId === "function"
            ? nextHoverId(currentHoverId)
            : nextHoverId;

        return Object.is(currentHoverId, resolvedHoverId)
          ? currentHoverId
          : resolvedHoverId;
      });
    },
    [setHoverIdState]
  );

  const cerrarMenusFlotantes = useCallback(() => {
    setMostrarPanelZ(false);
    setMostrarSubmenuCapa(false);
    setMostrarSelectorFuente(false);
    setMostrarSelectorTamano(false);
    setHoverId(null);
  }, [
    setHoverId,
    setMostrarPanelZ,
    setMostrarSelectorFuente,
    setMostrarSelectorTamano,
    setMostrarSubmenuCapa,
  ]);

  const clearCanvasSelectionUi = useCallback(() => {
    setElementosSeleccionados([]);
    setElementosPreSeleccionados([]);
    setSeleccionActiva(false);
    setInicioSeleccion(null);
    setAreaSeleccion(null);
    setBackgroundEditSectionId(null);
    setIsBackgroundEditInteracting(false);
    cerrarMenusFlotantes();
  }, [
    cerrarMenusFlotantes,
    setAreaSeleccion,
    setBackgroundEditSectionId,
    setElementosPreSeleccionados,
    setElementosSeleccionados,
    setInicioSeleccion,
    setIsBackgroundEditInteracting,
    setSeleccionActiva,
  ]);

  const isHoverSuppressed = isGlobalCanvasInteractionActive();
  const effectiveHoverId = isHoverSuppressed ? null : hoverId;

  return {
    setHoverId,
    cerrarMenusFlotantes,
    clearCanvasSelectionUi,
    isHoverSuppressed,
    effectiveHoverId,
  };
}
