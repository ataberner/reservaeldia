// src/components/editor/sections/useSectionsManager.js
import { useCallback, useEffect, useRef, useState } from "react";
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
    const seccionesRef = useRef(secciones);
    const resizeSessionRef = useRef({
        isResizing: false,
        seccionId: null,
        alturaInicial: 0,
        posicionInicialMouse: 0,
        posicionActualMouse: 0,
        ultimaAlturaAplicada: null,
        rafId: null,
        pointerId: null,
        targetConCapture: null,
    });
    const lastStartRef = useRef({ type: "", at: 0 });

    useEffect(() => {
        seccionesRef.current = secciones;
    }, [secciones]);

    const aplicarResizeAltura = useCallback(() => {
        const session = resizeSessionRef.current;
        if (!session.isResizing || !session.seccionId) return;

        const deltaY = session.posicionActualMouse - session.posicionInicialMouse;
        const nuevaAltura = Math.max(50, Math.round(session.alturaInicial + deltaY));
        if (session.ultimaAlturaAplicada === nuevaAltura) return;

        session.ultimaAlturaAplicada = nuevaAltura;

        setSecciones((prev) => {
            const next = prev.map((s) =>
                s.id === session.seccionId ? { ...s, altura: nuevaAltura } : s
            );
            seccionesRef.current = next;
            return next;
        });
    }, [setSecciones]);

    const scheduleResizeFrame = useCallback(() => {
        const session = resizeSessionRef.current;
        if (session.rafId != null) return;

        session.rafId = requestAnimationFrame(() => {
            resizeSessionRef.current.rafId = null;
            aplicarResizeAltura();
        });
    }, [aplicarResizeAltura]);

    const iniciarControlAltura = useCallback(
        (e, seccionId) => {
            const evt = e?.evt;
            if (!evt) return;

            const now = typeof performance !== "undefined" ? performance.now() : Date.now();
            const tipo = evt.type || "";
            const last = lastStartRef.current;

            const esFallbackDuplicado =
                (tipo === "mousedown" || tipo === "touchstart") &&
                last.type === "pointerdown" &&
                now - last.at < 120;
            if (esFallbackDuplicado) return;

            lastStartRef.current = { type: tipo, at: now };

            const session = resizeSessionRef.current;
            if (session.isResizing) return;

            const seccion = seccionesRef.current.find((s) => s.id === seccionId);
            if (!seccion) return;

            const pointerY = getClientYFromEvent(evt);
            if (!Number.isFinite(pointerY)) return;

            setGlobalCursor?.("ns-resize", stageRef);
            evt.stopPropagation();
            if (evt.cancelable) evt.preventDefault();

            setControlandoAltura(seccionId);

            session.isResizing = true;
            session.seccionId = seccionId;
            session.alturaInicial = seccion.altura;
            session.posicionInicialMouse = pointerY;
            session.posicionActualMouse = pointerY;
            session.ultimaAlturaAplicada = seccion.altura;
            session.pointerId = Number.isFinite(evt.pointerId) ? evt.pointerId : null;
            session.rafId = null;

            try { document.body.style.userSelect = "none"; } catch { }
            try { document.body.style.touchAction = "none"; } catch { }

            const target =
                e.target?.getStage?.()?.content || e.target?.getStage?.()?.container?.();
            session.targetConCapture = target || null;

            if (target && target.setPointerCapture && session.pointerId != null) {
                try { target.setPointerCapture(session.pointerId); } catch { }
            }
        },
        [setGlobalCursor, stageRef, getClientYFromEvent]
    );


    const manejarControlAltura = useCallback(
        (e) => {
            const session = resizeSessionRef.current;
            if (!session.isResizing) return;
            if (e?.cancelable) e.preventDefault();

            const posicionActualMouse = getClientYFromEvent(e);
            if (!Number.isFinite(posicionActualMouse)) return;

            session.posicionActualMouse = posicionActualMouse;
            scheduleResizeFrame();
        },
        [getClientYFromEvent, scheduleResizeFrame]
    );

    const finalizarControlAltura = useCallback(async () => {
        const session = resizeSessionRef.current;
        if (!session.isResizing) return;

        if (session.rafId != null) {
            cancelAnimationFrame(session.rafId);
            session.rafId = null;
        }
        aplicarResizeAltura();

        clearGlobalCursor?.(stageRef);

        try { document.body.style.userSelect = ""; } catch { }
        try { document.body.style.touchAction = ""; } catch { }

        if (session.targetConCapture?.releasePointerCapture && session.pointerId != null) {
            try { session.targetConCapture.releasePointerCapture(session.pointerId); } catch { }
        }

        const seccionId = session.seccionId;
        session.isResizing = false;
        session.seccionId = null;
        session.alturaInicial = 0;
        session.posicionInicialMouse = 0;
        session.posicionActualMouse = 0;
        session.ultimaAlturaAplicada = null;
        session.pointerId = null;
        session.targetConCapture = null;

        setControlandoAltura(false);

        if (window._saveAlturaTimeout) clearTimeout(window._saveAlturaTimeout);
        window._saveAlturaTimeout = setTimeout(async () => {
            try {
                if (!slug) return;

                const ref = doc(db, "borradores", slug);
                await updateDoc(ref, {
                    secciones: seccionesRef.current,
                    ultimaEdicion: serverTimestamp(),
                });

                clearGlobalCursor?.(stageRef);
                console.log("✅ Altura guardada:", seccionId);
            } catch (error) {
                console.error("❌ Error guardando altura:", error);
            }
        }, 220);
    }, [aplicarResizeAltura, slug, clearGlobalCursor, stageRef]);


    // listeners globales (mouse/touch/pointer)
    useEffect(() => {
        if (!controlandoAltura) return;

        const hasPointerEvents = typeof window !== "undefined" && typeof window.PointerEvent !== "undefined";
        if (hasPointerEvents) {
            window.addEventListener("pointermove", manejarControlAltura, { passive: false });
            window.addEventListener("pointerup", finalizarControlAltura, { passive: true });
            window.addEventListener("pointercancel", finalizarControlAltura, { passive: true });
        } else {
            document.addEventListener("mousemove", manejarControlAltura, { passive: false });
            document.addEventListener("touchmove", manejarControlAltura, { passive: false });
            document.addEventListener("mouseup", finalizarControlAltura);
            document.addEventListener("touchend", finalizarControlAltura, { passive: true });
            document.addEventListener("touchcancel", finalizarControlAltura, { passive: true });
        }

        return () => {
            window.removeEventListener("pointerup", finalizarControlAltura);
            window.removeEventListener("pointercancel", finalizarControlAltura);
            window.removeEventListener("pointermove", manejarControlAltura);
            document.removeEventListener("mouseup", finalizarControlAltura);
            document.removeEventListener("mousemove", manejarControlAltura);
            document.removeEventListener("touchmove", manejarControlAltura);
            document.removeEventListener("touchend", finalizarControlAltura);
            document.removeEventListener("touchcancel", finalizarControlAltura);
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


