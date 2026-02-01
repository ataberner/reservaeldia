// src/hooks/useViewportScale.js
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Centraliza toda la lógica de:
 * - isMobile / isMobilePortrait
 * - ResizeObserver del contenedor
 * - cálculo de scale, anchoContenedor
 * - escalaActiva / escalaVisual / wrapperBaseWidth / fit mobile portrait
 */
export default function useViewportScale({
  contenedorRef,
  zoom,
  // base widths (tu lógica actual)
  baseDesktop = 800,
  baseMobilePortrait = 1000,

  // wrapper real que escalás visualmente (tu lógica actual)
  wrapperBaseWidthZoom1 = 1000,
  wrapperBaseWidthZoom08 = 1220,

  // boosts (tu lógica actual)
  fitBoost = 1.2,
  zoomVisualBoost = 1.15,

  // debug
  debug = false,
} = {}) {
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [scale, setScale] = useState(1);
  const [anchoContenedor, setAnchoContenedor] = useState(0);

  // ✅ isMobile (simple y estable). Si querés que se actualice en resize,
  // lo convertimos a state + listener, pero por ahora respeta tu implementación actual.
  const isMobile = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 640px)").matches;
  }, []);

  // ✅ isMobilePortrait con listeners (idéntico a tu enfoque actual)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(max-width: 640px) and (orientation: portrait)");
    const update = () => setIsMobilePortrait(mq.matches);

    update();

    mq.addEventListener?.("change", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      mq.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  // ✅ scale: solo cuando zoom === 1 (igual que hoy)
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

  // ✅ anchoContenedor: siempre (igual que hoy)
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

  // ✅ Derivados (idénticos a tu lógica actual)
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
