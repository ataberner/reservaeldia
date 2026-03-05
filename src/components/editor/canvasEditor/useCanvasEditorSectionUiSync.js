import { useEffect } from "react";

export default function useCanvasEditorSectionUiSync({
  seccionActivaIdRef,
  seccionActivaId,
  mobileBackgroundEditSectionId,
}) {
  useEffect(() => {
    seccionActivaIdRef.current = seccionActivaId;
  }, [seccionActivaId, seccionActivaIdRef]);

  useEffect(() => {
    if (seccionActivaId) window._lastSeccionActivaId = seccionActivaId;
  }, [seccionActivaId]);

  useEffect(() => {
    if (!mobileBackgroundEditSectionId) {
      window.dispatchEvent(new Event("salir-modo-mover-fondo"));
      return;
    }

    window.dispatchEvent(
      new CustomEvent("activar-modo-mover-fondo", {
        detail: { sectionId: mobileBackgroundEditSectionId },
      })
    );
  }, [mobileBackgroundEditSectionId]);
}
