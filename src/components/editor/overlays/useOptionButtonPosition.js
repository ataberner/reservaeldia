import { useCallback, useEffect } from "react";

export default function useOptionButtonPosition({
  botonOpcionesRef,
  elementRefs,
  elementosSeleccionados,
  stageRef,
  escalaVisual,
  escalaActiva,
}) {
  const actualizarPosicionBotonOpciones = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!botonOpcionesRef.current || elementosSeleccionados.length !== 1) return;

    const nodeRef = elementRefs.current[elementosSeleccionados[0]];
    const stage = stageRef.current;
    if (!nodeRef || !stage) return;

    try {
      const box = nodeRef.getClientRect();
      const stageContainer =
        typeof stage.container === "function"
          ? stage.container()
          : stage.getStage?.()?.container?.();
      if (!stageContainer) return;

      const stageRect = stageContainer.getBoundingClientRect();
      const scale =
        Number.isFinite(escalaVisual) && escalaVisual > 0
          ? escalaVisual
          : Number.isFinite(escalaActiva) && escalaActiva > 0
            ? escalaActiva
            : 1;

      const elementoX = stageRect.left + box.x * scale;
      const elementoY = stageRect.top + box.y * scale;
      const anchoElemento = box.width * scale;

      const botonX = elementoX + anchoElemento;
      const botonY = elementoY - 24;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (botonX >= 0 && botonX <= viewportWidth && botonY >= 0 && botonY <= viewportHeight) {
        botonOpcionesRef.current.style.left = `${botonX}px`;
        botonOpcionesRef.current.style.top = `${botonY}px`;
        botonOpcionesRef.current.style.display = "flex";
      } else {
        botonOpcionesRef.current.style.display = "none";
      }
    } catch {
      if (botonOpcionesRef.current) {
        botonOpcionesRef.current.style.display = "none";
      }
    }
  }, [
    botonOpcionesRef,
    elementosSeleccionados,
    elementRefs,
    stageRef,
    escalaVisual,
    escalaActiva,
  ]);

  useEffect(() => {
    if (elementosSeleccionados.length !== 1) return undefined;
    const timeoutId = window.setTimeout(() => {
      actualizarPosicionBotonOpciones();
    }, 50);
    return () => window.clearTimeout(timeoutId);
  }, [elementosSeleccionados, escalaActiva, actualizarPosicionBotonOpciones]);

  useEffect(() => {
    const handleScrollResize = () => {
      if (elementosSeleccionados.length === 1) {
        actualizarPosicionBotonOpciones();
      }
    };

    window.addEventListener("scroll", handleScrollResize, true);
    window.addEventListener("resize", handleScrollResize);

    return () => {
      window.removeEventListener("scroll", handleScrollResize, true);
      window.removeEventListener("resize", handleScrollResize);
    };
  }, [elementosSeleccionados, actualizarPosicionBotonOpciones]);

  return {
    actualizarPosicionBotonOpciones,
  };
}

