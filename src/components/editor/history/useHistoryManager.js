// src/components/editor/history/useHistoryManager.js
import { useEffect } from "react";

/**
 * Maneja el historial (undo/redo) del editor:
 * - Guarda snapshots (objetos + secciones)
 * - Limpia futuros cuando hay cambios nuevos
 * - Respeta ignoreNextUpdateRef para que undo/redo no borre futuros
 *
 * ⚠️ No cambia lógica: es el mismo useEffect movido a un hook.
 */
export default function useHistoryManager({
    cargado,
    objetos,
    secciones,

    setHistorial,
    setFuturos,

    ignoreNextUpdateRef,
}) {
    useEffect(() => {
        if (!cargado) return;

        if (ignoreNextUpdateRef.current) {
            requestAnimationFrame(() => {
                ignoreNextUpdateRef.current = Math.max(0, (ignoreNextUpdateRef.current || 0) - 1);
            });
            return;
        }


        // 🎯 No guardar historial durante transformaciones
        if (window._resizeData?.isResizing) return;

        const estadoCompleto = {
            objetos,
            secciones,
            timestamp: Date.now(),
        };

        const estadoStringified = JSON.stringify(estadoCompleto);

        setHistorial((prev) => {
            const ultimoStringified =
                prev.length > 0 ? JSON.stringify(prev[prev.length - 1]) : null;

            if (ultimoStringified !== estadoStringified) {
                return [...prev.slice(-19), estadoCompleto]; // max 20
            }
            return prev;
        });

        // Limpiar futuros cuando hay nuevos cambios
        setFuturos([]);
    }, [objetos, secciones, cargado, setHistorial, setFuturos, ignoreNextUpdateRef]);
}
