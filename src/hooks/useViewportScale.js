// src/hooks/useViewportScale.js
import { useEffect, useState } from "react";

/**
 * Centraliza toda la logica de:
 * - isMobile / isMobilePortrait
 * - ResizeObserver del contenedor
 * - calculo de scale, anchoContenedor
 * - escalaActiva / escalaVisual / wrapperBaseWidth / fit mobile portrait
 */
export default function useViewportScale({
  contenedorRef,
  zoom,
  // base widths (tu logica actual)
  baseDesktop = 800,
  baseMobilePortrait = 1000,

  // wrapper real que escalas visualmente (tu logica actual)
  wrapperBaseWidthZoom1 = 1000,
  wrapperBaseWidthZoom08 = 1220,

  // boosts (tu logica actual)
  fitBoost = 1.2,
  zoomVisualBoost = 1.15,

  // debug
  debug = false,
} = {}) {
  const [isMobile, setIsMobile] = useState(false);
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [scale, setScale] = useState(1);
  const [anchoContenedor, setAnchoContenedor] = useState(0);

  // isMobile + isMobilePortrait reactivo con coarse pointer
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mqMobile = window.matchMedia("(max-width: 640px)");
    const mqTablet = window.matchMedia("(max-width: 1024px)");
    const mqPortrait = window.matchMedia("(max-width: 1024px) and (orientation: portrait)");
    const mqCoarse = window.matchMedia("(pointer: coarse)");

    const update = () => {
      const compactWidth = mqMobile.matches;
      const tabletWidth = mqTablet.matches;
      const coarsePointer = mqCoarse.matches;
      const nextIsMobile = compactWidth || (coarsePointer && tabletWidth);
      setIsMobile(nextIsMobile);
      setIsMobilePortrait(mqPortrait.matches && (compactWidth || coarsePointer));
    };

    update();

    mqMobile.addEventListener?.("change", update);
    mqTablet.addEventListener?.("change", update);
    mqPortrait.addEventListener?.("change", update);
    mqCoarse.addEventListener?.("change", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      mqMobile.removeEventListener?.("change", update);
      mqTablet.removeEventListener?.("change", update);
      mqPortrait.removeEventListener?.("change", update);
      mqCoarse.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  // scale: solo cuando zoom === 1 (igual que hoy)
  useEffect(() => {
    if (!contenedorRef?.current || zoom !== 1) return;

    let raf = null;

    const actualizarEscala = () => {
      if (!contenedorRef.current) return;

      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const ancho = contenedorRef.current?.offsetWidth || 0;
        const base = isMobilePortrait ? baseMobilePortrait : baseDesktop;
        const nextScale = base > 0 ? ancho / base : 1;

        setScale(nextScale);

        if (debug) {
          console.log(
            "[useViewportScale] anchoContenedor=",
            ancho,
            "base=",
            base,
            "scale=",
            nextScale.toFixed(3)
          );
        }
      });
    };

    actualizarEscala();

    const observer = new ResizeObserver(actualizarEscala);
    observer.observe(contenedorRef.current);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [contenedorRef, zoom, isMobilePortrait, baseDesktop, baseMobilePortrait, debug]);

  // anchoContenedor: siempre (igual que hoy)
  useEffect(() => {
    const el = contenedorRef?.current;
    if (!el) return;

    const actualizar = () => {
      if (!contenedorRef.current) return;
      setAnchoContenedor(contenedorRef.current.offsetWidth || 0);
    };

    requestAnimationFrame(actualizar);

    const observer = new ResizeObserver(actualizar);
    observer.observe(el);

    return () => observer.disconnect();
  }, [contenedorRef]);

  // Derivados (identicos a tu logica actual)
  const escalaActiva = zoom === 1 ? scale : zoom;

  const wrapperBaseWidth = zoom === 0.8 ? wrapperBaseWidthZoom08 : wrapperBaseWidthZoom1;

  const escalaFitMobilePortrait =
    anchoContenedor > 0 ? (anchoContenedor / wrapperBaseWidth) * fitBoost : 1;

  const escalaVisual = isMobilePortrait
    ? escalaFitMobilePortrait
    : zoom === 1
      ? scale
      : zoom * zoomVisualBoost;

  return {
    isMobile,
    isMobilePortrait,

    scale,
    anchoContenedor,

    escalaActiva,
    escalaVisual,

    wrapperBaseWidth,
    escalaFitMobilePortrait,
  };
}

