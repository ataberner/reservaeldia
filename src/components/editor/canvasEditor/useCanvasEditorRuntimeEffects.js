import { useEffect } from "react";
import Konva from "konva";
import {
  shouldPreserveCanvasSelectionTarget,
  shouldPreserveInlineEditTarget,
} from "@/components/editor/canvasEditor/selectionPreservationPolicy";

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

export default function useCanvasEditorRuntimeEffects({
  stageRef,
  resolveKonvaPixelRatio,
  setMostrarSelectorFuente,
  setMostrarSelectorTamano,
  editingId,
  selectedCount,
  requestInlineEditFinishRef,
  clearCanvasSelectionUi,
  preserveCanvasSelectionSelector,
  preserveInlineEditSelector,
}) {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const applyKonvaPixelRatio = () => {
      const desiredRatio = resolveKonvaPixelRatio();
      if (Konva.pixelRatio !== desiredRatio) {
        Konva.pixelRatio = desiredRatio;
        stageRef.current?.getStage?.()?.batchDraw?.();
      }
    };

    applyKonvaPixelRatio();
    window.addEventListener("resize", applyKonvaPixelRatio);
    return () => {
      window.removeEventListener("resize", applyKonvaPixelRatio);
    };
  }, [resolveKonvaPixelRatio, stageRef]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window._resizeData = null;
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const handleClickFuera = (event) => {
      const target = event?.target;
      if (target instanceof Element && target.closest(".popup-fuente")) {
        return;
      }
      setMostrarSelectorFuente(false);
      setMostrarSelectorTamano(false);
    };

    document.addEventListener("mousedown", handleClickFuera);
    return () => {
      document.removeEventListener("mousedown", handleClickFuera);
    };
  }, [setMostrarSelectorFuente, setMostrarSelectorTamano]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (selectedCount === 0 && !editingId) return undefined;

    const resolveTargetElement = (target) => {
      if (target instanceof Element) return target;
      if (target instanceof Node) return target.parentElement;
      return null;
    };

    const isInsideCanvasStage = (targetElement) => {
      if (!targetElement) return false;
      const stage = stageRef.current?.getStage?.() || stageRef.current;
      const container = stage?.container?.() || stage?.content || null;
      return Boolean(
        container &&
          typeof container.contains === "function" &&
          container.contains(targetElement)
      );
    };

    const handlePointerOutsideCanvas = (event) => {
      if (isGlobalCanvasInteractionActive()) {
        return;
      }
      const targetElement = resolveTargetElement(event.target);
      if (!targetElement) return;
      if (isInsideCanvasStage(targetElement)) return;

      const shouldPreserveInlineEdit = shouldPreserveInlineEditTarget(
        targetElement,
        preserveInlineEditSelector
      );

      if (editingId && !shouldPreserveInlineEdit) {
        requestInlineEditFinishRef.current?.("outside-canvas-pointerdown");
      }

      const shouldPreserveSelection = shouldPreserveCanvasSelectionTarget(
        targetElement,
        preserveCanvasSelectionSelector
      );
      if (shouldPreserveSelection) return;

      clearCanvasSelectionUi();
    };

    if (typeof window !== "undefined" && "PointerEvent" in window) {
      document.addEventListener("pointerdown", handlePointerOutsideCanvas, true);
      return () => {
        document.removeEventListener(
          "pointerdown",
          handlePointerOutsideCanvas,
          true
        );
      };
    }

    document.addEventListener("mousedown", handlePointerOutsideCanvas, true);
    document.addEventListener("touchstart", handlePointerOutsideCanvas, {
      capture: true,
      passive: true,
    });

    return () => {
      document.removeEventListener(
        "mousedown",
        handlePointerOutsideCanvas,
        true
      );
      document.removeEventListener(
        "touchstart",
        handlePointerOutsideCanvas,
        true
      );
    };
  }, [
    clearCanvasSelectionUi,
    editingId,
    preserveCanvasSelectionSelector,
    preserveInlineEditSelector,
    requestInlineEditFinishRef,
    selectedCount,
    stageRef,
  ]);
}
