// src/components/editor/history/useHistoryManager.js
import { useEffect, useRef } from "react";

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
    const lastSnapshotRef = useRef("");

    const isMobileRuntime = () => {
        if (typeof window === "undefined") return false;
        if (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) {
            return true;
        }
        const width = Number(window.innerWidth || 0);
        return width > 0 && width <= 1024;
    };

    useEffect(() => {
        if (!cargado) return;

        if (ignoreNextUpdateRef.current) {
            requestAnimationFrame(() => {
                ignoreNextUpdateRef.current = Math.max(0, (ignoreNextUpdateRef.current || 0) - 1);
            });
            return;
        }


        // No guardar historial durante transformaciones o drag activo.
        if (window._resizeData?.isResizing || window._isDragging || window._grupoLider) return;

        const estadoComparable = { objetos, secciones };
        const estadoStringified = JSON.stringify(estadoComparable);
        if (estadoStringified === lastSnapshotRef.current) return;
        lastSnapshotRef.current = estadoStringified;

        const maxHistorial = isMobileRuntime() ? 12 : 20;
        const estadoCompleto = {
            ...estadoComparable,
            timestamp: Date.now(),
        };
        setHistorial((prev) => {
            return [...prev.slice(-(maxHistorial - 1)), estadoCompleto];
        });

        // Limpiar futuros cuando hay nuevos cambios
        setFuturos([]);
    }, [objetos, secciones, cargado, setHistorial, setFuturos, ignoreNextUpdateRef]);
}
