// src/components/editor/persistence/useBorradorSync.js
import { useEffect } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase"; // ajustá si tu alias difiere

/**
 * Hook de sincronización Firestore para el borrador (carga + guardado con debounce).
 * Mantiene la lógica EXACTA que hoy está en CanvasEditor, solo la mueve de lugar.
 */
export default function useBorradorSync({
    slug,
    userId,

    // estado actual
    objetos,
    secciones,
    cargado,

    // setters
    setObjetos,
    setSecciones,
    setCargado,
    setSeccionActivaId,

    // refs / helpers que ya existen en CanvasEditor
    ignoreNextUpdateRef,
    stageRef,

    // helpers de tu layout actual
    normalizarAltoModo,
    validarPuntosLinea,

    // constantes
    ALTURA_PANTALLA_EDITOR,
}) {
    // 🔥 helper: limpiar undefined recursivo
    const limpiarUndefined = (obj) => {
        if (Array.isArray(obj)) return obj.map(limpiarUndefined);

        if (obj !== null && typeof obj === "object") {
            const objLimpio = {};
            Object.keys(obj).forEach((key) => {
                const valor = obj[key];
                if (valor !== undefined) objLimpio[key] = limpiarUndefined(valor);
            });
            return objLimpio;
        }

        return obj;
    };

    // ✅ 1) Cargar borrador desde Firestore
    useEffect(() => {
        if (!slug) return;

        const cargar = async () => {
            const ref = doc(db, "borradores", slug);
            const snap = await getDoc(ref);

            if (snap.exists()) {
                const data = snap.data();
                const seccionesData = data.secciones || [];
                const objetosData = data.objetos || [];

                // ✅ Mantengo tu migración de yNorm para secciones pantalla
                const objsMigrados = objetosData.map((o) => {
                    if (!o?.seccionId) return o;

                    const sec = seccionesData.find((s) => s.id === o.seccionId);
                    const modo = normalizarAltoModo(sec?.altoModo);

                    if (modo === "pantalla") {
                        if (!Number.isFinite(o.yNorm)) {
                            const yPx = Number.isFinite(o.y) ? o.y : 0;
                            const yNorm = Math.max(0, Math.min(1, yPx / ALTURA_PANTALLA_EDITOR));
                            return { ...o, yNorm };
                        }
                    }

                    return o;
                });

                setObjetos(objsMigrados);
                setSecciones(seccionesData);

                // ✅ Setear primera sección activa si no hay
                if (typeof setSeccionActivaId === "function" && seccionesData.length > 0) {
                    setSeccionActivaId((prev) => prev || seccionesData[0].id);
                }
            }

            setCargado(true);
        };

        cargar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug]);

    // ✅ 2) Guardar en Firestore con debounce cuando cambian objetos/secciones
    useEffect(() => {
        if (!cargado) return;
        if (!slug) return;

        if (ignoreNextUpdateRef?.current) {
            requestAnimationFrame(() => {
                ignoreNextUpdateRef.current = Math.max(0, (ignoreNextUpdateRef.current || 0) - 1);
            });
            return;
        }


        // 🎯 No guardar durante resize (tu lógica actual)
        if (window._resizeData?.isResizing) return;

        const timeoutId = setTimeout(async () => {
            try {
                // 🎯 Validación: asegurar líneas con puntos válidos + normalización de textos (tu lógica)
                const objetosValidados = (objetos || []).map((obj) => {
                    if (obj?.tipo === "forma" && obj?.figura === "line") {
                        return validarPuntosLinea(obj);
                    }

                    if (obj?.tipo === "texto") {
                        return {
                            ...obj,
                            color: obj.colorTexto || obj.color || obj.fill || "#000000",
                            stroke: obj.stroke || null,
                            strokeWidth: obj.strokeWidth || 0,
                            shadowColor: obj.shadowColor || null,
                            shadowBlur: obj.shadowBlur || 0,
                            shadowOffsetX: obj.shadowOffsetX || 0,
                            shadowOffsetY: obj.shadowOffsetY || 0,
                        };
                    }

                    return obj;
                });

                const seccionesLimpias = limpiarUndefined(secciones);
                const objetosLimpios = limpiarUndefined(objetosValidados);

                const ref = doc(db, "borradores", slug);
                await updateDoc(ref, {
                    objetos: objetosLimpios,
                    secciones: seccionesLimpias,
                    ultimaEdicion: serverTimestamp(),
                });

                // ✅ Thumbnail (mantengo tu lógica con import dinámico)
                if (stageRef?.current && userId && slug) {
                    const { guardarThumbnailDesdeStage } = await import("@/utils/guardarThumbnail");
                    await guardarThumbnailDesdeStage({ stageRef, uid: userId, slug });
                }
            } catch (error) {
                console.error("❌ Error guardando en Firebase:", error);
            }
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [objetos, secciones, cargado, slug, userId, ignoreNextUpdateRef, stageRef, validarPuntosLinea]);
}
