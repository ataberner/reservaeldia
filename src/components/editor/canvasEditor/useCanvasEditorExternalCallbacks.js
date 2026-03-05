import { useEffect } from "react";

export default function useCanvasEditorExternalCallbacks({
  historial,
  onHistorialChange,
  futuros,
  onFuturosChange,
}) {
  useEffect(() => {
    if (onHistorialChange) {
      onHistorialChange(historial);
    }
  }, [historial, onHistorialChange]);

  useEffect(() => {
    if (onFuturosChange) {
      onFuturosChange(futuros);
    }
  }, [futuros, onFuturosChange]);
}
