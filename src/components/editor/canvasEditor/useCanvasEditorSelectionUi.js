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

export function resolveCanvasHoverIdUpdate(
  currentHoverId,
  nextHoverId,
  { interactionActive = false } = {}
) {
  const resolvedHoverId =
    typeof nextHoverId === "function"
      ? nextHoverId(currentHoverId)
      : nextHoverId;

  const isHoverClear = resolvedHoverId == null;
  if (interactionActive && !isHoverClear) {
    return currentHoverId;
  }

  return Object.is(currentHoverId, resolvedHoverId)
    ? currentHoverId
    : resolvedHoverId;
}

export default function useCanvasEditorSelectionUi({
  hoverId,
  setHoverIdState,
  setMostrarPanelZ,
  setMostrarSubmenuCapa,
  setMostrarSelectorFuente,
  setMostrarSelectorTamano,
  selectionClearPolicy,
}) {
  const setHoverId = useCallback(
    (nextHoverId, _meta = null) => {
      setHoverIdState((currentHoverId) => {
        return resolveCanvasHoverIdUpdate(currentHoverId, nextHoverId, {
          interactionActive: isGlobalCanvasInteractionActive(),
        });
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
    selectionClearPolicy?.clearCanvasSelection?.();
    cerrarMenusFlotantes();
  }, [
    selectionClearPolicy,
    cerrarMenusFlotantes,
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
