import { useCallback, useEffect, useMemo } from "react";
import { calcularOffsetY } from "@/utils/layout";
import { borrarSeccion as borrarSeccionExternal, moverSeccion as moverSeccionExternal } from "@/utils/editorSecciones";
import {
  EDITOR_BRIDGE_EVENTS,
  buildEditorActiveSectionDetail,
} from "@/lib/editorBridgeContracts";

export default function useCanvasEditorSectionFlow({
  slug,
  secciones,
  objetos,
  seccionesOrdenadas,
  seccionActivaId,
  setSeccionActivaId,
  setSecciones,
  setObjetos,
  seccionesAnimando,
  setSeccionesAnimando,
  deleteSectionModal,
  setDeleteSectionModal,
  isDeletingSection,
  setIsDeletingSection,
  stageRef,
  autoSectionViewportRef,
  autoSectionScrollRafRef,
  followMoveScrollRafRef,
  seccionesAnimandoActivasRef,
  bloqueoAutoSeleccionSeccionRef,
  ultimaSeccionMovidaRef,
  previoAnimandoSeccionesRef,
  seccionActivaIdRef,
  normalizarAltoModo,
  validarPuntosLinea,
  enqueueDraftWrite,
  ALTURA_PANTALLA_EDITOR,
}) {
  const seccionPendienteEliminar = useMemo(
    () => secciones.find((seccion) => seccion.id === deleteSectionModal.sectionId) || null,
    [secciones, deleteSectionModal.sectionId]
  );

  const cantidadElementosSeccionPendiente = useMemo(() => {
    if (!seccionPendienteEliminar?.id) return 0;
    return objetos.filter((obj) => obj.seccionId === seccionPendienteEliminar.id).length;
  }, [objetos, seccionPendienteEliminar]);

  const esSeccionPantallaById = useCallback((seccionId) => {
    const s = seccionesOrdenadas.find((x) => x.id === seccionId);
    return s && normalizarAltoModo(s.altoModo) === "pantalla";
  }, [seccionesOrdenadas, normalizarAltoModo]);

  const altoCanvasDinamico = useMemo(
    () => seccionesOrdenadas.reduce((acc, s) => acc + s.altura, 0) || 800,
    [seccionesOrdenadas]
  );

  const abrirModalBorrarSeccion = useCallback((seccionId) => {
    if (!seccionId || isDeletingSection) return;
    setDeleteSectionModal({ isOpen: true, sectionId: seccionId });
  }, [isDeletingSection, setDeleteSectionModal]);

  const cerrarModalBorrarSeccion = useCallback(() => {
    if (isDeletingSection) return;
    setDeleteSectionModal({ isOpen: false, sectionId: null });
  }, [isDeletingSection, setDeleteSectionModal]);

  const confirmarBorrarSeccion = useCallback(async () => {
    const seccionId = deleteSectionModal.sectionId;
    if (!seccionId || isDeletingSection) return;

    setIsDeletingSection(true);
    try {
      await borrarSeccionExternal({
        seccionId,
        secciones,
        objetos,
        slug,
        seccionActivaId,
        setSecciones,
        setObjetos,
        setSeccionActivaId,
        validarPuntosLinea,
        enqueueDraftWrite,
        ALTURA_PANTALLA_EDITOR,
      });
      setDeleteSectionModal({ isOpen: false, sectionId: null });
    } finally {
      setIsDeletingSection(false);
    }
  }, [
    deleteSectionModal.sectionId,
    isDeletingSection,
    secciones,
    objetos,
    slug,
    seccionActivaId,
    setSecciones,
    setObjetos,
    setSeccionActivaId,
    setDeleteSectionModal,
    setIsDeletingSection,
    validarPuntosLinea,
    enqueueDraftWrite,
    ALTURA_PANTALLA_EDITOR,
  ]);

  const onSelectSeccion = useCallback((id) => {
    try {
      setSeccionActivaId(id);
      window._seccionActivaId = id;
      window.dispatchEvent(
        new CustomEvent(EDITOR_BRIDGE_EVENTS.ACTIVE_SECTION_CHANGE, {
          detail: buildEditorActiveSectionDetail(id),
        })
      );
    } catch (e) {
      console.warn("No pude emitir seccion-activa:", e);
    }
  }, [setSeccionActivaId]);

  const resolverViewportScrollSecciones = useCallback(() => {
    const stage = stageRef.current?.getStage?.() || stageRef.current || null;
    const stageContainer = stage?.container?.();
    if (!stageContainer || typeof window === "undefined") return null;

    const mainElement = stageContainer.closest?.("main");
    if (mainElement) return mainElement;

    let current = stageContainer.parentElement;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      const overflowY = String(style.overflowY || "").toLowerCase();
      const overflow = String(style.overflow || "").toLowerCase();
      const isScrollable =
        overflowY === "auto" ||
        overflowY === "scroll" ||
        overflowY === "overlay" ||
        overflow === "auto" ||
        overflow === "scroll" ||
        overflow === "overlay";

      if (isScrollable && current.scrollHeight > current.clientHeight + 1) {
        return current;
      }
      current = current.parentElement;
    }

    return window;
  }, [stageRef]);

  const obtenerObjetivoScrollSeccion = useCallback(({
    seccionId,
    seccionesFuente = null,
  } = {}) => {
    if (!seccionId || typeof window === "undefined") return null;

    const stage = stageRef.current?.getStage?.() || stageRef.current || null;
    const stageContainer = stage?.container?.();
    if (!stageContainer) return null;

    const stageRect = stageContainer.getBoundingClientRect?.();
    if (!stageRect || !Number.isFinite(stageRect.top) || !Number.isFinite(stageRect.height)) {
      return null;
    }

    const viewport = autoSectionViewportRef.current || resolverViewportScrollSecciones();
    if (!viewport) return null;

    const base = Array.isArray(seccionesFuente) && seccionesFuente.length > 0
      ? seccionesFuente
      : seccionesOrdenadas;
    if (!Array.isArray(base) || base.length === 0) return null;

    const ordenadas = [...base].sort((a, b) => a.orden - b.orden);
    const index = ordenadas.findIndex((s) => s.id === seccionId);
    if (index < 0) return null;

    const alturaCanvasLocal = Math.max(
      1,
      ordenadas.reduce((acc, s) => acc + (Number(s.altura) || 0), 0)
    );
    const pxPorUnidad = Number(stageRect.height || 0) / alturaCanvasLocal;
    if (!(pxPorUnidad > 0)) return null;

    const offsetY = calcularOffsetY(ordenadas, index);
    const alturaSeccion = Math.max(1, Number(ordenadas[index]?.altura) || 1);
    const seccionTopViewport = stageRect.top + offsetY * pxPorUnidad;
    const seccionBottomViewport = seccionTopViewport + alturaSeccion * pxPorUnidad;
    const centroSeccion = (seccionTopViewport + seccionBottomViewport) / 2;

    let viewportTop = 0;
    let viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    let scrollActual = window.scrollY || window.pageYOffset || 0;

    if (viewport !== window) {
      const viewportRect = viewport.getBoundingClientRect?.();
      if (!viewportRect) return null;
      viewportTop = viewportRect.top;
      viewportHeight = viewport.clientHeight || (viewportRect.bottom - viewportRect.top) || 0;
      scrollActual = viewport.scrollTop || 0;
    }

    if (!(viewportHeight > 0)) return null;

    const centroDeseadoViewport = viewportTop + viewportHeight / 2;
    const delta = centroSeccion - centroDeseadoViewport;
    const targetScroll = Math.max(0, scrollActual + delta);

    return {
      viewport,
      currentScroll: scrollActual,
      targetScroll,
    };
  }, [autoSectionViewportRef, resolverViewportScrollSecciones, seccionesOrdenadas, stageRef]);

  const desplazarViewportHaciaSeccion = useCallback(({
    seccionId,
    seccionesFuente = null,
    behavior = "smooth",
  } = {}) => {
    const objetivo = obtenerObjetivoScrollSeccion({ seccionId, seccionesFuente });
    if (!objetivo) return;

    const { viewport, currentScroll, targetScroll } = objetivo;
    if (Math.abs(targetScroll - currentScroll) < 2) return;

    if (viewport === window) {
      window.scrollTo({ top: Math.round(targetScroll), behavior });
      return;
    }

    viewport.scrollTo({ top: Math.round(targetScroll), behavior });
  }, [obtenerObjetivoScrollSeccion]);

  const seguirScrollDuranteMovimientoSeccion = useCallback(({
    seccionId,
    maxDurationMs = 1400,
  } = {}) => {
    if (!seccionId || typeof window === "undefined") return;

    if (followMoveScrollRafRef.current) {
      window.cancelAnimationFrame(followMoveScrollRafRef.current);
      followMoveScrollRafRef.current = 0;
    }

    const startedAt = window.performance?.now?.() || Date.now();

    const step = (nowRaw) => {
      const now = Number.isFinite(nowRaw) ? nowRaw : (window.performance?.now?.() || Date.now());
      const elapsed = now - startedAt;

      const objetivo = obtenerObjetivoScrollSeccion({
        seccionId,
      });

      if (!objetivo) {
        if (elapsed < maxDurationMs) {
          followMoveScrollRafRef.current = window.requestAnimationFrame(step);
        } else {
          followMoveScrollRafRef.current = 0;
        }
        return;
      }

      const { viewport, currentScroll, targetScroll } = objetivo;
      const delta = targetScroll - currentScroll;
      const animando = seccionesAnimandoActivasRef.current;
      const gain = animando ? 0.08 : 0.14;
      const nextScroll = Math.abs(delta) < 0.8
        ? targetScroll
        : currentScroll + delta * gain;
      const roundedTop = Math.round(Math.max(0, nextScroll));

      if (viewport === window) {
        window.scrollTo({ top: roundedTop, behavior: "auto" });
      } else {
        viewport.scrollTo({ top: roundedTop, behavior: "auto" });
      }

      bloqueoAutoSeleccionSeccionRef.current = Math.max(
        bloqueoAutoSeleccionSeccionRef.current,
        Date.now() + 220
      );

      const remaining = Math.abs(targetScroll - nextScroll);
      if (!animando) {
        followMoveScrollRafRef.current = 0;
        return;
      }

      if (elapsed < maxDurationMs && remaining > 0.9) {
        followMoveScrollRafRef.current = window.requestAnimationFrame(step);
        return;
      }

      followMoveScrollRafRef.current = 0;
    };

    followMoveScrollRafRef.current = window.requestAnimationFrame(step);
  }, [
    bloqueoAutoSeleccionSeccionRef,
    followMoveScrollRafRef,
    obtenerObjetivoScrollSeccion,
    seccionesAnimandoActivasRef,
  ]);

  const moverSeccionConScroll = useCallback(({
    seccionId,
    direccion,
  }) => {
    if (!seccionId || (direccion !== "subir" && direccion !== "bajar")) return;

    ultimaSeccionMovidaRef.current = seccionId;
    bloqueoAutoSeleccionSeccionRef.current = Date.now() + 1500;
    onSelectSeccion(seccionId);

    const ordenadasActuales = [...secciones].sort((a, b) => a.orden - b.orden);
    const indiceActual = ordenadasActuales.findIndex((s) => s.id === seccionId);
    if (indiceActual < 0) return;

    const indiceDestino = direccion === "subir" ? indiceActual - 1 : indiceActual + 1;
    if (indiceDestino < 0 || indiceDestino >= ordenadasActuales.length) return;

    moverSeccionExternal({
      seccionId,
      direccion,
      secciones,
      slug,
      setSecciones,
      setSeccionesAnimando,
      validarPuntosLinea,
      enqueueDraftWrite,
      ALTURA_PANTALLA_EDITOR,
    });

    seguirScrollDuranteMovimientoSeccion({
      seccionId,
      maxDurationMs: 1400,
    });
  }, [
    bloqueoAutoSeleccionSeccionRef,
    onSelectSeccion,
    secciones,
    setSecciones,
    setSeccionesAnimando,
    seguirScrollDuranteMovimientoSeccion,
    slug,
    ultimaSeccionMovidaRef,
    validarPuntosLinea,
    enqueueDraftWrite,
    ALTURA_PANTALLA_EDITOR,
  ]);

  const sincronizarSeccionVisiblePorScroll = useCallback(() => {
    if (!seccionesOrdenadas.length || typeof window === "undefined") return;
    if (bloqueoAutoSeleccionSeccionRef.current > Date.now()) return;

    const stage = stageRef.current?.getStage?.() || stageRef.current || null;
    const stageContainer = stage?.container?.();
    if (!stageContainer) return;

    const stageRect = stageContainer.getBoundingClientRect?.();
    if (!stageRect || !Number.isFinite(stageRect.top) || !Number.isFinite(stageRect.height)) {
      return;
    }

    const viewport = autoSectionViewportRef.current || resolverViewportScrollSecciones();
    if (!viewport) return;

    let viewportTop = 0;
    let viewportBottom = window.innerHeight || document.documentElement.clientHeight || 0;

    if (viewport !== window) {
      const viewportRect = viewport.getBoundingClientRect?.();
      if (!viewportRect) return;
      viewportTop = viewportRect.top;
      viewportBottom = viewportRect.bottom;
    }

    if (!Number.isFinite(viewportTop) || !Number.isFinite(viewportBottom) || viewportBottom <= viewportTop) {
      return;
    }

    const alturaStagePx = Number(stageRect.height || 0);
    const alturaCanvas = Math.max(1, Number(altoCanvasDinamico) || 1);
    if (!(alturaStagePx > 0)) return;

    const pxPorUnidad = alturaStagePx / alturaCanvas;
    if (!(pxPorUnidad > 0)) return;

    const centroViewport = (viewportTop + viewportBottom) / 2;
    let mejorId = null;
    let mejorVisible = 0;
    let mejorRatio = -1;
    let mejorDistanciaCentro = Number.POSITIVE_INFINITY;

    seccionesOrdenadas.forEach((seccion, index) => {
      const alturaSeccion = Math.max(1, Number(seccion.altura) || 1);
      const offsetY = calcularOffsetY(seccionesOrdenadas, index);
      const top = stageRect.top + offsetY * pxPorUnidad;
      const bottom = top + alturaSeccion * pxPorUnidad;

      const visible = Math.max(0, Math.min(bottom, viewportBottom) - Math.max(top, viewportTop));
      if (visible <= 0) return;

      const ratioVisible = visible / (alturaSeccion * pxPorUnidad);
      const distanciaCentro = Math.abs((top + bottom) / 2 - centroViewport);

      const mejoraPorVisible = visible > mejorVisible + 1;
      const empateVisible = Math.abs(visible - mejorVisible) <= 1;
      const mejoraPorRatio = empateVisible && ratioVisible > mejorRatio + 0.001;
      const empateRatio = empateVisible && Math.abs(ratioVisible - mejorRatio) <= 0.001;
      const mejoraPorCentro = empateRatio && distanciaCentro < mejorDistanciaCentro;

      if (mejoraPorVisible || mejoraPorRatio || mejoraPorCentro) {
        mejorId = seccion.id;
        mejorVisible = visible;
        mejorRatio = ratioVisible;
        mejorDistanciaCentro = distanciaCentro;
      }
    });

    if (!mejorId) return;
    if (seccionActivaIdRef.current === mejorId) return;

    onSelectSeccion(mejorId);
  }, [
    altoCanvasDinamico,
    autoSectionViewportRef,
    bloqueoAutoSeleccionSeccionRef,
    onSelectSeccion,
    resolverViewportScrollSecciones,
    seccionActivaIdRef,
    seccionesOrdenadas,
    stageRef,
  ]);

  useEffect(() => {
    seccionesAnimandoActivasRef.current = seccionesAnimando.length > 0;
  }, [seccionesAnimando, seccionesAnimandoActivasRef]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && followMoveScrollRafRef.current) {
        window.cancelAnimationFrame(followMoveScrollRafRef.current);
        followMoveScrollRafRef.current = 0;
      }
    };
  }, [followMoveScrollRafRef]);

  useEffect(() => {
    const estabaAnimando = previoAnimandoSeccionesRef.current;
    const estaAnimandoAhora = seccionesAnimando.length > 0;

    if (estabaAnimando && !estaAnimandoAhora) {
      const seccionMovidaId = ultimaSeccionMovidaRef.current;
      if (seccionMovidaId) {
        bloqueoAutoSeleccionSeccionRef.current = Date.now() + 750;
        onSelectSeccion(seccionMovidaId);
        if (typeof window !== "undefined" && followMoveScrollRafRef.current) {
          window.cancelAnimationFrame(followMoveScrollRafRef.current);
          followMoveScrollRafRef.current = 0;
        }
        ultimaSeccionMovidaRef.current = null;
      }
    }

    previoAnimandoSeccionesRef.current = estaAnimandoAhora;
  }, [
    bloqueoAutoSeleccionSeccionRef,
    followMoveScrollRafRef,
    onSelectSeccion,
    previoAnimandoSeccionesRef,
    seccionesAnimando,
    ultimaSeccionMovidaRef,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!seccionesOrdenadas.length) return undefined;

    autoSectionViewportRef.current = resolverViewportScrollSecciones();
    const scrollTarget = autoSectionViewportRef.current || window;

    const scheduleSync = () => {
      if (autoSectionScrollRafRef.current) return;
      autoSectionScrollRafRef.current = window.requestAnimationFrame(() => {
        autoSectionScrollRafRef.current = 0;
        sincronizarSeccionVisiblePorScroll();
      });
    };

    scheduleSync();

    const eventTarget = scrollTarget === window ? window : scrollTarget;
    eventTarget.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
    window.addEventListener("orientationchange", scheduleSync);

    if (window.visualViewport) {
      window.visualViewport.addEventListener("scroll", scheduleSync);
      window.visualViewport.addEventListener("resize", scheduleSync);
    }

    return () => {
      eventTarget.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("orientationchange", scheduleSync);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("scroll", scheduleSync);
        window.visualViewport.removeEventListener("resize", scheduleSync);
      }
      if (autoSectionScrollRafRef.current) {
        window.cancelAnimationFrame(autoSectionScrollRafRef.current);
        autoSectionScrollRafRef.current = 0;
      }
    };
  }, [
    autoSectionScrollRafRef,
    autoSectionViewportRef,
    resolverViewportScrollSecciones,
    seccionesOrdenadas.length,
    sincronizarSeccionVisiblePorScroll,
  ]);

  return {
    seccionPendienteEliminar,
    cantidadElementosSeccionPendiente,
    altoCanvasDinamico,
    esSeccionPantallaById,
    abrirModalBorrarSeccion,
    cerrarModalBorrarSeccion,
    confirmarBorrarSeccion,
    onSelectSeccion,
    moverSeccionConScroll,
  };
}
