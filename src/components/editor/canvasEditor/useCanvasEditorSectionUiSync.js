import { useEffect } from "react";

export default function useCanvasEditorSectionUiSync({
  seccionActivaIdRef,
  seccionActivaId,
  backgroundEditSectionId,
  setBackgroundEditSectionId,
}) {
  useEffect(() => {
    seccionActivaIdRef.current = seccionActivaId;
  }, [seccionActivaId, seccionActivaIdRef]);

  useEffect(() => {
    if (seccionActivaId) window._lastSeccionActivaId = seccionActivaId;
  }, [seccionActivaId]);

  useEffect(() => {
    if (!backgroundEditSectionId) {
      window.dispatchEvent(new Event("salir-modo-mover-fondo"));
      return;
    }

    window.dispatchEvent(
      new CustomEvent("activar-modo-mover-fondo", {
        detail: { sectionId: backgroundEditSectionId },
      })
    );
  }, [backgroundEditSectionId]);

  useEffect(() => {
    if (typeof setBackgroundEditSectionId !== "function") return undefined;

    const handleExit = (event) => {
      const targetSectionId =
        typeof event?.detail?.sectionId === "string" ? event.detail.sectionId : null;

      setBackgroundEditSectionId((previous) => {
        if (!previous) return previous;
        if (targetSectionId && previous !== targetSectionId) return previous;
        return null;
      });
    };

    window.addEventListener("salir-modo-mover-fondo", handleExit);
    return () => {
      window.removeEventListener("salir-modo-mover-fondo", handleExit);
    };
  }, [setBackgroundEditSectionId]);
}
