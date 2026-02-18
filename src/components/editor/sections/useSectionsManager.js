// src/components/editor/sections/useSectionsManager.js
import { useCallback, useEffect, useState } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../firebase"; // ✅ ajustado a tu estructura real

/**
 * Maneja todo lo relacionado a secciones:
 * - resize de altura (drag)
 * - toggle Pantalla ON/OFF
 * - crear sección (y persistir)
 */
export default function useSectionsManager({
    slug,
    secciones,
    setSecciones,
    objetos,
    setObjetos,
    seccionActivaId,
    setSeccionActivaId,

    stageRef,
    setGlobalCursor,
    clearGlobalCursor,

    crearSeccion,
    normalizarAltoModo,
    limpiarObjetoUndefined,

    ALTURA_REFERENCIA_PANTALLA,
}) {
    const getClientYFromEvent = useCallback((event) => {
        if (!event) return null;
        if (Number.isFinite(event.clientY)) return event.clientY;
        if (event.touches?.[0] && Number.isFinite(event.touches[0].clientY)) {
            return event.touches[0].clientY;
        }
        if (event.changedTouches?.[0] && Number.isFinite(event.changedTouches[0].clientY)) {
            return event.changedTouches[0].clientY;
        }
        return null;
    }, []);

    // ------------------------------------------
    // A) Resize altura de sección
    // ------------------------------------------
    const [controlandoAltura, setControlandoAltura] = useState(false);
    const [alturaInicial, setAlturaInicial] = useState(0);
    const [posicionInicialMouse, setPosicionInicialMouse] = useState(0);

    const iniciarControlAltura = useCallback(
        (e, seccionId) => {
            setGlobalCursor?.("ns-resize", stageRef);
            e.evt.stopPropagation();
            if (e?.evt?.cancelable) e.evt.preventDefault();

            const seccion = secciones.find((s) => s.id === seccionId);
            if (!seccion) return;

            const pointerY = getClientYFromEvent(e?.evt);
            if (!Number.isFinite(pointerY)) return;

            setControlandoAltura(seccionId);
            setAlturaInicial(seccion.altura);
            setPosicionInicialMouse(pointerY);

            try { document.body.style.userSelect = "none"; } catch { }
            try { document.body.style.touchAction = "none"; } catch { }

            const target =
                e.target?.getStage?.()?.content || e.target?.getStage?.()?.container?.();

            if (target && target.setPointerCapture && e.evt.pointerId != null) {
                try { target.setPointerCapture(e.evt.pointerId); } catch { }
            }
        },
        [secciones, setGlobalCursor, stageRef, getClientYFromEvent]
    );


    const manejarControlAltura = useCallback(
        (e) => {
            if (!controlandoAltura) return;
            if (e?.cancelable) e.preventDefault();
            const posicionActualMouse = getClientYFromEvent(e);
            if (!Number.isFinite(posicionActualMouse)) return;

            if (window._alturaResizeThrottle) return;
            window._alturaResizeThrottle = true;

            requestAnimationFrame(() => {
                const deltaY = posicionActualMouse - posicionInicialMouse;
                const nuevaAltura = Math.max(50, Math.round(alturaInicial + deltaY));

                setSecciones((prev) =>
                    prev.map((s) =>
                        s.id === controlandoAltura ? { ...s, altura: nuevaAltura } : s
                    )
                );

                setTimeout(() => {
                    window._alturaResizeThrottle = false;
                }, 8);
            });
        },
        [controlandoAltura, posicionInicialMouse, alturaInicial, setSecciones, getClientYFromEvent]
    );

    const finalizarControlAltura = useCallback(async () => {
        if (!controlandoAltura) return;

        clearGlobalCursor?.(stageRef);

        try { document.body.style.userSelect = ""; } catch { }
        try { document.body.style.touchAction = ""; } catch { }

        if (window._alturaResizeThrottle) window._alturaResizeThrottle = false;

        const seccionId = controlandoAltura;
        setControlandoAltura(false);
        setAlturaInicial(0);
        setPosicionInicialMouse(0);

        if (window._saveAlturaTimeout) clearTimeout(window._saveAlturaTimeout);
        window._saveAlturaTimeout = setTimeout(async () => {
            try {
                if (!slug) return;

                const ref = doc(db, "borradores", slug);
                await updateDoc(ref, {
                    secciones,
                    ultimaEdicion: serverTimestamp(),
                });

                clearGlobalCursor?.(stageRef);
                console.log("✅ Altura guardada:", seccionId);
            } catch (error) {
                console.error("❌ Error guardando altura:", error);
            }
        }, 300);
    }, [controlandoAltura, secciones, slug, clearGlobalCursor, stageRef]);


    // listeners globales (mouse/touch/pointer)
    useEffect(() => {
        if (!controlandoAltura) return;

        document.addEventListener("mousemove", manejarControlAltura, { passive: true });
        document.addEventListener("touchmove", manejarControlAltura, { passive: false });
        window.addEventListener("pointermove", manejarControlAltura, { passive: false });
        document.addEventListener("mouseup", finalizarControlAltura);
        document.addEventListener("touchend", finalizarControlAltura, { passive: true });
        document.addEventListener("touchcancel", finalizarControlAltura, { passive: true });
        window.addEventListener("pointerup", finalizarControlAltura, { passive: true });
        window.addEventListener("pointercancel", finalizarControlAltura, { passive: true });

        return () => {
            document.removeEventListener("mousemove", manejarControlAltura);
            document.removeEventListener("touchmove", manejarControlAltura);
            window.removeEventListener("pointermove", manejarControlAltura);
            document.removeEventListener("mouseup", finalizarControlAltura);
            document.removeEventListener("touchend", finalizarControlAltura);
            document.removeEventListener("touchcancel", finalizarControlAltura);
            window.removeEventListener("pointerup", finalizarControlAltura);
            window.removeEventListener("pointercancel", finalizarControlAltura);
            if (window._alturaResizeThrottle) window._alturaResizeThrottle = false;
        };
    }, [controlandoAltura, manejarControlAltura, finalizarControlAltura]);

    // failsafes (pointerup, blur, visibility, esc...)
    useEffect(() => {
        if (!controlandoAltura) return;

        const end = () => finalizarControlAltura();
        const handlePointerUp = end;
        const handlePointerCancel = end;
        const handleMouseLeave = (ev) => {
            if (ev.relatedTarget === null) end();
        };
        const handleBlur = end;
        const handleVisibility = () => {
            if (document.visibilityState !== "visible") end();
        };
        const handleKeyDown = (e) => {
            if (e.key === "Escape") end();
        };

        window.addEventListener("pointerup", handlePointerUp, { capture: true });
        window.addEventListener("pointercancel", handlePointerCancel, { capture: true });
        window.addEventListener("mouseleave", handleMouseLeave, { capture: true });
        window.addEventListener("blur", handleBlur, { capture: true });
        document.addEventListener("visibilitychange", handleVisibility, { capture: true });
        document.addEventListener("keydown", handleKeyDown, { capture: true });

        return () => {
            window.removeEventListener("pointerup", handlePointerUp, { capture: true });
            window.removeEventListener("pointercancel", handlePointerCancel, { capture: true });
            window.removeEventListener("mouseleave", handleMouseLeave, { capture: true });
            window.removeEventListener("blur", handleBlur, { capture: true });
            document.removeEventListener("visibilitychange", handleVisibility, { capture: true });
            document.removeEventListener("keydown", handleKeyDown, { capture: true });
        };
    }, [controlandoAltura, finalizarControlAltura]);

    // ------------------------------------------
    // B) Toggle Pantalla ON/OFF
    // ------------------------------------------
    const togglePantallaCompletaSeccion = useCallback(
        async (seccionId) => {
            if (!seccionId) return;

            // 1) Actualizar estado local
            setSecciones((prev) => {
                const next = prev.map((s) => {
                    if (s.id !== seccionId) return s;

                    const modoActual = normalizarAltoModo(s.altoModo);
                    const modoNuevo = modoActual === "pantalla" ? "fijo" : "pantalla";

                    if (modoNuevo === "pantalla") {
                        return {
                            ...s,
                            altoModo: "pantalla",
                            alturaFijoBackup: Number.isFinite(s.altura) ? s.altura : 600,
                            altura: ALTURA_REFERENCIA_PANTALLA,
                        };
                    }

                    const backup = Number.isFinite(s.alturaFijoBackup)
                        ? s.alturaFijoBackup
                        : s.altura;

                    const { alturaFijoBackup, ...rest } = s;

                    return {
                        ...rest,
                        altoModo: "fijo",
                        altura: Number.isFinite(backup) ? backup : 600,
                    };
                });

                return next;
            });

            // 2) Persistir en Firestore usando el snapshot actual
            try {
                if (!slug) return;

                const ref = doc(db, "borradores", slug);

                const seccionesNext = secciones.map((s) => {
                    if (s.id !== seccionId) return s;

                    const modoActual = normalizarAltoModo(s.altoModo);
                    const modoNuevo = modoActual === "pantalla" ? "fijo" : "pantalla";

                    if (modoNuevo === "pantalla") {
                        return {
                            ...s,
                            altoModo: "pantalla",
                            alturaFijoBackup: Number.isFinite(s.altura) ? s.altura : 600,
                            altura: ALTURA_REFERENCIA_PANTALLA,
                        };
                    }

                    const backup = Number.isFinite(s.alturaFijoBackup)
                        ? s.alturaFijoBackup
                        : s.altura;

                    const { alturaFijoBackup, ...rest } = s;

                    return {
                        ...rest,
                        altoModo: "fijo",
                        altura: Number.isFinite(backup) ? backup : 600,
                    };
                });

                await updateDoc(ref, {
                    secciones: seccionesNext,
                    ultimaEdicion: serverTimestamp(),
                });

                console.log("✅ altoModo actualizado:", seccionId);
            } catch (e) {
                console.error("❌ Error guardando altoModo:", e);
            }
        },
        [slug, secciones, setSecciones, normalizarAltoModo, ALTURA_REFERENCIA_PANTALLA]
    );

    // ------------------------------------------
    // C) Crear sección (y persistir)
    // ------------------------------------------
    const handleCrearSeccion = useCallback(
        async (datos) => {
            if (!slug) return;
            const ref = doc(db, "borradores", slug);

            setSecciones((prevSecciones) => {
                const nueva = crearSeccion(datos, prevSecciones);

                let objetosDesdePlantilla = [];

                if (datos?.desdePlantilla && Array.isArray(datos.objetos)) {
                    objetosDesdePlantilla = datos.objetos.map((obj) => ({
                        ...obj,
                        id: "obj-" + Date.now() + Math.random().toString(36).substring(2, 6),
                        seccionId: nueva.id,
                    }));
                }

                const nuevasSecciones = [...prevSecciones, nueva];

                setObjetos((prevObjetos) => {
                    const nuevosObjetos = [...prevObjetos, ...objetosDesdePlantilla];

                    // limpiar antes de guardar (tu helper existente)
                    const seccionesLimpias = limpiarObjetoUndefined(nuevasSecciones);
                    const objetosLimpios = limpiarObjetoUndefined(nuevosObjetos);

                    updateDoc(ref, {
                        secciones: seccionesLimpias,
                        objetos: objetosLimpios,
                    })
                        .then(() => console.log("✅ Sección agregada:", nueva))
                        .catch((error) => console.error("❌ Error al guardar sección", error));

                    return nuevosObjetos;
                });

                return nuevasSecciones;
            });
        },
        [slug, setSecciones, setObjetos, crearSeccion, limpiarObjetoUndefined]
    );

    // Listener global: "crear-seccion"
    useEffect(() => {
        const handler = (e) => {
            handleCrearSeccion(e.detail);
        };
        window.addEventListener("crear-seccion", handler);
        return () => window.removeEventListener("crear-seccion", handler);
    }, [handleCrearSeccion]);

    return {
        // resize altura
        controlandoAltura,
        iniciarControlAltura,
        finalizarControlAltura,

        // toggle pantalla
        togglePantallaCompletaSeccion,

        // crear sección
        handleCrearSeccion,
    };
}



