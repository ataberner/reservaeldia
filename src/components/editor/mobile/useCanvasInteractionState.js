import { useEffect, useRef, useState } from "react";

export default function useCanvasInteractionState() {
  const dragStartPos = useRef(null);
  const hasDragged = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncDragState = () => {
      setIsDragging(Boolean(window._isDragging || window._grupoLider));
    };

    syncDragState();
    window.addEventListener("dragging-start", syncDragState);
    window.addEventListener("dragging-end", syncDragState);

    return () => {
      window.removeEventListener("dragging-start", syncDragState);
      window.removeEventListener("dragging-end", syncDragState);
    };
  }, []);

  return {
    dragStartPos,
    hasDragged,
    isDragging,
    setIsDragging,
  };
}
