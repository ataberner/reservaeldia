import { useCallback, useEffect } from "react";
import { flushSync } from "react-dom";

export default function useCanvasEditorInteractionEffects({
  elementosSeleccionados,
  editingId,
  setIsSelectionRotating,
  setMostrarPanelZ,
  actualizarPosicionBotonOpciones,
  setHoverId,
  setElementosPreSeleccionados,
  setIsDragging,
  objetos,
  elementRefs,
}) {
  const handleTransformInteractionStart = useCallback((payload = {}) => {
    const rotating = payload?.isRotate === true;
    setIsSelectionRotating(rotating);
    if (rotating) {
      setMostrarPanelZ(false);
    }
  }, [setIsSelectionRotating, setMostrarPanelZ]);

  const handleTransformInteractionEnd = useCallback(() => {
    setIsSelectionRotating(false);
    requestAnimationFrame(() => {
      if (typeof actualizarPosicionBotonOpciones === "function") {
        actualizarPosicionBotonOpciones("transform-interaction-end");
      }
    });
  }, [actualizarPosicionBotonOpciones, setIsSelectionRotating]);

  useEffect(() => {
    if (elementosSeleccionados.length === 1 && !editingId) return;
    setIsSelectionRotating(false);
  }, [elementosSeleccionados.length, editingId, setIsSelectionRotating]);

  useEffect(() => {
    const onDragStartGlobal = () => {
      flushSync(() => {
        setHoverId(null);
        setElementosPreSeleccionados([]);
        setIsDragging(true);
      });
    };
    const onDragEndGlobal = () => {};

    window.addEventListener("dragging-start", onDragStartGlobal);
    window.addEventListener("dragging-end", onDragEndGlobal);
    return () => {
      window.removeEventListener("dragging-start", onDragStartGlobal);
      window.removeEventListener("dragging-end", onDragEndGlobal);
    };
  }, [setElementosPreSeleccionados, setHoverId, setIsDragging]);

  useEffect(() => {
    if (window._lineIntersectionCache) {
      window._lineIntersectionCache = {};
    }
  }, [elementosSeleccionados.length]);

  useEffect(() => {
    if (window._grupoLider || elementosSeleccionados.length === 0) return;

    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const recentlyEndedGroupDrag =
      Number.isFinite(window._skipUntil) && window._skipUntil > now;
    if (!recentlyEndedGroupDrag) return;

    const hayLineas = objetos.some((obj) =>
      elementosSeleccionados.includes(obj.id) &&
      obj.tipo === "forma" &&
      obj.figura === "line"
    );
    if (!hayLineas) return;

    const timer = setTimeout(() => {
      elementosSeleccionados.forEach((id) => {
        const node = elementRefs.current[id];
        if (node && node.getLayer) {
          node.getLayer()?.batchDraw();
        }
      });
    }, 50);

    return () => clearTimeout(timer);
  }, [elementRefs, elementosSeleccionados, objetos]);

  return {
    handleTransformInteractionStart,
    handleTransformInteractionEnd,
  };
}
