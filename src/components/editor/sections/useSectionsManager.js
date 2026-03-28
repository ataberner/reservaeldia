// src/components/editor/sections/useSectionsManager.js
import { useCallback, useEffect, useRef, useState } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import {
    buildNextSectionHeightState,
    buildNextSectionModeState,
    buildSectionCreationState,
    buildSectionMutationWritePayload,
    shouldPersistSectionMutationSnapshot,
} from "./sectionMutationPersistence.js";
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
    validarPuntosLinea,
    enqueueDraftWrite,

    ALTURA_REFERENCIA_PANTALLA,
    ALTURA_PANTALLA_EDITOR,
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
    const objetosRef = useRef(objetos);
    const resizePersistTimeoutRef = useRef(null);
    const resizeSessionRef = useRef({
        isResizing: false,
        seccionId: null,
        alturaInicial: 0,
        posicionInicialMouse: 0,
        posicionActualMouse: 0,
        ultimaAlturaAplicada: null,
        ultimaSeccionesCalculadas: null,
        rafId: null,
        pointerId: null,
        targetConCapture: null,
    });
    const lastStartRef = useRef({ type: "", at: 0 });

    useEffect(() => {
        seccionesRef.current = secciones;
    }, [secciones]);

    useEffect(() => {
        objetosRef.current = objetos;
    }, [objetos]);

    useEffect(() => () => {
        if (resizePersistTimeoutRef.current) {
            clearTimeout(resizePersistTimeoutRef.current);
        }
    }, []);

    const applySectionSnapshot = useCallback(
        (nextSecciones) => {
            seccionesRef.current = nextSecciones;
            setSecciones(nextSecciones);
            return nextSecciones;
        },
        [setSecciones]
    );

    const applyDraftSnapshot = useCallback(
        ({
            nextSecciones,
            nextObjetos = objetosRef.current,
            updateObjetos = false,
        }) => {
            applySectionSnapshot(nextSecciones);

            if (updateObjetos) {
                objetosRef.current = nextObjetos;
                setObjetos(nextObjetos);
            }

            return {
                nextSecciones,
                nextObjetos: updateObjetos ? nextObjetos : objetosRef.current,
            };
        },
        [applySectionSnapshot, setObjetos]
    );

    const persistSectionMutation = useCallback(
        async ({
            nextSecciones,
            nextObjetos = objetosRef.current,
            reason,
            includeObjetos = false,
        }) => {
            if (!slug) return;

            const persistTask = async () => {
                const ref = doc(db, "borradores", slug);
                const { payload } = buildSectionMutationWritePayload({
                    secciones: nextSecciones,
                    objetos: nextObjetos,
                    reason,
                    includeObjetos,
                    validarPuntosLinea,
                    ALTURA_PANTALLA_EDITOR,
                    createTimestamp: () => serverTimestamp(),
                });

                await updateDoc(ref, payload);
            };

            // Compatibility boundary: section writes remain direct, but they
            // now join the shared draft-write FIFO used by autosave/flush.
            if (typeof enqueueDraftWrite === "function") {
                return enqueueDraftWrite(persistTask);
            }

            return persistTask();
        },
        [slug, validarPuntosLinea, ALTURA_PANTALLA_EDITOR, enqueueDraftWrite]
    );

    const aplicarResizeAltura = useCallback(() => {
        const session = resizeSessionRef.current;
        if (!session.isResizing || !session.seccionId) return;

        const deltaY = session.posicionActualMouse - session.posicionInicialMouse;
        const nuevaAltura = Math.max(50, Math.round(session.alturaInicial + deltaY));
        if (session.ultimaAlturaAplicada === nuevaAltura) return;

        session.ultimaAlturaAplicada = nuevaAltura;
        const nextSecciones = buildNextSectionHeightState(seccionesRef.current, {
            seccionId: session.seccionId,
            altura: nuevaAltura,
        });

        session.ultimaSeccionesCalculadas = nextSecciones;
        applySectionSnapshot(nextSecciones);
        return nextSecciones;
    }, [applySectionSnapshot]);

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
            session.ultimaSeccionesCalculadas = seccionesRef.current;
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
        const nextSecciones =
            aplicarResizeAltura() ||
            session.ultimaSeccionesCalculadas ||
            seccionesRef.current;

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
        session.ultimaSeccionesCalculadas = null;
        session.pointerId = null;
        session.targetConCapture = null;

        setControlandoAltura(false);

        const nextObjetos = objetosRef.current;

        if (resizePersistTimeoutRef.current) {
            clearTimeout(resizePersistTimeoutRef.current);
        }
        resizePersistTimeoutRef.current = setTimeout(async () => {
            resizePersistTimeoutRef.current = null;
            // Delayed section-height persists must not replay after a newer
            // local section/object snapshot has already superseded them.
            if (
                !shouldPersistSectionMutationSnapshot({
                    currentSecciones: seccionesRef.current,
                    currentObjetos: objetosRef.current,
                    nextSecciones,
                    nextObjetos,
                })
            ) {
                return;
            }
            try {
                await persistSectionMutation({
                    nextSecciones,
                    nextObjetos,
                    reason: "section-height",
                });

                clearGlobalCursor?.(stageRef);
                console.log("✅ Altura guardada:", seccionId);
            } catch (error) {
                console.error("❌ Error guardando altura:", error);
            }
        }, 220);
    }, [aplicarResizeAltura, clearGlobalCursor, persistSectionMutation, stageRef]);


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

            const nextSecciones = buildNextSectionModeState(seccionesRef.current, {
                seccionId,
                normalizarAltoModo,
                ALTURA_REFERENCIA_PANTALLA,
            });
            const nextObjetos = objetosRef.current;

            applySectionSnapshot(nextSecciones);

            try {
                await persistSectionMutation({
                    nextSecciones,
                    nextObjetos,
                    reason: "section-mode-toggle",
                    includeObjetos: true,
                });

                console.log("✅ altoModo actualizado:", seccionId);
            } catch (e) {
                console.error("❌ Error guardando altoModo:", e);
            }
        },
        [
            ALTURA_REFERENCIA_PANTALLA,
            applySectionSnapshot,
            normalizarAltoModo,
            persistSectionMutation,
        ]
    );

    // ------------------------------------------
    // C) Crear sección (y persistir)
    // ------------------------------------------
    const handleCrearSeccion = useCallback(
        async (datos) => {
            if (!slug) return;
            const { nuevaSeccion, nextSecciones, nextObjetos } = buildSectionCreationState({
                datos,
                secciones: seccionesRef.current,
                objetos: objetosRef.current,
                crearSeccion,
            });

            applyDraftSnapshot({
                nextSecciones,
                nextObjetos,
                updateObjetos: true,
            });

            try {
                await persistSectionMutation({
                    nextSecciones,
                    nextObjetos,
                    reason: "section-create",
                    includeObjetos: true,
                });
                console.log("✅ Sección agregada:", nuevaSeccion);
            } catch (error) {
                console.error("❌ Error al guardar sección", error);
            }
        },
        [slug, crearSeccion, applyDraftSnapshot, persistSectionMutation]
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
