import { useCallback } from "react";
import {
  resolveGlobalHoverInteractionSuppression,
} from "@/components/editor/textSystem/render/konva/hoverLifecycle";

function getGlobalHoverInteractionSuppressionState() {
  if (typeof window === "undefined") {
    return resolveGlobalHoverInteractionSuppression();
  }

  return resolveGlobalHoverInteractionSuppression({
    runtimeDragActive: Boolean(window._isDragging),
    runtimeGroupDragActive: Boolean(window._grupoLider),
    runtimeResizeActive: Boolean(window._resizeData?.isResizing),
  });
}

export function resolveCanvasHoverIdUpdate(
  currentHoverId,
  nextHoverId,
  { interactionSuppressed = false } = {}
) {
  const resolvedHoverId =
    typeof nextHoverId === "function"
      ? nextHoverId(currentHoverId)
      : nextHoverId;

  const isHoverClear = resolvedHoverId == null;
  if (interactionSuppressed && !isHoverClear) {
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
      const hoverSuppressionState = getGlobalHoverInteractionSuppressionState();
      setHoverIdState((currentHoverId) => {
        return resolveCanvasHoverIdUpdate(currentHoverId, nextHoverId, {
          interactionSuppressed: hoverSuppressionState.suppressed,
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

  const isHoverSuppressed =
    getGlobalHoverInteractionSuppressionState().suppressed;
  const effectiveHoverId = isHoverSuppressed ? null : hoverId;

  return {
    setHoverId,
    cerrarMenusFlotantes,
    clearCanvasSelectionUi,
    isHoverSuppressed,
    effectiveHoverId,
  };
}
