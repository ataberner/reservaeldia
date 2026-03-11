import { useEffect, useMemo, useRef } from "react";

export default function useCanvasEditorFontPreload({
  objetos,
  cargado,
  stageRef,
  fontManager,
}) {
  const loadedFontFamiliesRef = useRef(new Set());

  const fuentesNecesarias = useMemo(() => {
    const fonts = (objetos || [])
      .filter(
        (o) =>
          (o.tipo === "texto" ||
            o.tipo === "countdown" ||
            o.tipo === "rsvp-boton" ||
            (o.tipo === "forma" &&
              o.figura === "rect" &&
              typeof o.texto === "string")) &&
          o.fontFamily
      )
      .map((o) => String(o.fontFamily).replace(/['"]/g, "").split(",")[0].trim())
      .filter(Boolean);

    return [...new Set(fonts)];
  }, [objetos]);

  useEffect(() => {
    fontManager.preloadPopularFonts();

    const handleFontsLoaded = () => {
      if (stageRef.current) {
        stageRef.current.batchDraw();
      }
    };

    window.addEventListener("fonts-loaded", handleFontsLoaded);

    return () => {
      window.removeEventListener("fonts-loaded", handleFontsLoaded);
    };
  }, [fontManager, stageRef]);

  useEffect(() => {
    let alive = true;

    async function precargar() {
      if (!fuentesNecesarias.length) return;
      const pendientes = fuentesNecesarias.filter(
        (fontName) => !loadedFontFamiliesRef.current.has(fontName)
      );
      if (!pendientes.length) return;

      try {
        const maybePromise = fontManager.loadFonts?.(pendientes);

        if (maybePromise && typeof maybePromise.then === "function") {
          await maybePromise;
        }

        if (document?.fonts?.load) {
          await Promise.all(pendientes.map((f) => document.fonts.load(`16px "${f}"`)));
        }
        if (!alive) return;
        pendientes.forEach((fontName) => loadedFontFamiliesRef.current.add(fontName));

        requestAnimationFrame(() => {
          stageRef.current?.batchDraw?.();
        });
      } catch (e) {
        console.warn("?? Error precargando fuentes:", e);
      }
    }

    if (cargado) precargar();

    return () => {
      alive = false;
    };
  }, [cargado, fuentesNecesarias, fontManager, stageRef]);
}
