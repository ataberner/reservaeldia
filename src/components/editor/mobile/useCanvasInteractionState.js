import { useRef, useState } from "react";

export default function useCanvasInteractionState() {
  const dragStartPos = useRef(null);
  const hasDragged = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  return {
    dragStartPos,
    hasDragged,
    isDragging,
    setIsDragging,
  };
}

