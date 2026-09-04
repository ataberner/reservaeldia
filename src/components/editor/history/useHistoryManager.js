// src/components/editor/history/useHistoryManager.js
import { useEffect, useRef } from "react";
import { evaluateEditorHistoryCapture } from "./historyState.js";

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
    dynamicVisualState = null,
    authoringHydrated = true,

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
        const interactionActive = Boolean(
            window._resizeData?.isResizing || window._isDragging || window._grupoLider
        );
        const decision = evaluateEditorHistoryCapture({
            cargado,
            authoringHydrated,
            suppressed: Boolean(ignoreNextUpdateRef.current),
            interactionActive,
            lastSignature: lastSnapshotRef.current,
            objetos,
            secciones,
            dynamicVisualState,
        });
        lastSnapshotRef.current = decision.nextBaselineSignature;

        if (decision.consumeSuppression) {
            requestAnimationFrame(() => {
                ignoreNextUpdateRef.current = Math.max(0, (ignoreNextUpdateRef.current || 0) - 1);
            });
            return;
        }
        if (!decision.shouldCapture) return;

        const maxHistorial = isMobileRuntime() ? 12 : 20;
        const estadoCompleto = {
            ...decision.comparable,
            timestamp: Date.now(),
        };
        setHistorial((prev) => {
            return [...prev.slice(-(maxHistorial - 1)), estadoCompleto];
        });

        // Limpiar futuros cuando hay nuevos cambios
        setFuturos([]);
    }, [
        objetos,
        secciones,
        dynamicVisualState,
        authoringHydrated,
        cargado,
        setHistorial,
        setFuturos,
        ignoreNextUpdateRef,
    ]);
}
