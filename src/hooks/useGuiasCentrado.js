// hooks/useGuiasCentrado.js
import { useState, useCallback } from "react";

/**
 * Guías con:
 * - Sección: muestra CX/CY SOLO si estás cerca (no siempre).
 * - Elementos: SOLO misma sección, líneas punteadas tipo "reach" hasta el otro elemento.
 * - Nada de otras secciones.
 */
export default function useGuiasCentrado({
    anchoCanvas = 800,
    altoCanvas = 800,
    magnetRadius = 16,       // distancia para activar el snap
    sectionShowRadius = 18,  // distancia para MOSTRAR las líneas de sección (puede ser = o > magnetRadius)
    snapStrength = 1,        // 1 = pegado exacto; 0.4-0.6 = tracción suave
    seccionesOrdenadas = []
}) {
    const [guiaLineas, setGuiaLineas] = useState([]);

    // ---- Utilidades de secciones ----
    const calcularOffsetSeccion = useCallback((seccionId) => {
        let offsetY = 0;
        for (const s of seccionesOrdenadas) {
            if (s.id === seccionId) break;
            offsetY += s.altura;
        }
        return offsetY;
    }, [seccionesOrdenadas]);

    const obtenerSeccionElemento = useCallback((objId, objetos) => {
        const obj = objetos.find(o => o.id === objId);
        if (!obj?.seccionId) return null;
        return seccionesOrdenadas.find(s => s.id === obj.seccionId) || null;
    }, [seccionesOrdenadas]);

    // ---- Segmentos "reach" entre cajas (va hasta el otro elemento) ----
    const reachVertical = (x, selfBox, otherBox, gap = 6) => {
        const selfCy = selfBox.y + selfBox.height / 2;
        const otherCy = otherBox.y + otherBox.height / 2;
        let y1, y2;
        if (otherCy <= selfCy) {
            y1 = otherBox.y + otherBox.height + gap; // desde borde inferior del otro
            y2 = selfBox.y - gap;                     // hasta borde superior del self
        } else {
            y1 = selfBox.y + selfBox.height + gap;
            y2 = otherBox.y - gap;
        }
        return [x, y1, x, y2];
    };

    const reachHorizontal = (y, selfBox, otherBox, gap = 6) => {
        const selfCx = selfBox.x + selfBox.width / 2;
        const otherCx = otherBox.x + otherBox.width / 2;
        let x1, x2;
        if (otherCx <= selfCx) {
            x1 = otherBox.x + otherBox.width + gap; // desde borde derecho del otro
            x2 = selfBox.x - gap;                    // hasta borde izquierdo del self
        } else {
            x1 = selfBox.x + selfBox.width + gap;
            x2 = otherBox.x - gap;
        }
        return [x1, y, x2, y];
    };

    // ---- Delta para alinear a la guía más cercana ----
    const deltaForGuide = (axis, guideValue, box) => {
        if (axis === "x") {
            const center = box.x + box.width / 2;
            const left = box.x;
            const right = box.x + box.width;
            const opts = [
                { dist: Math.abs(center - guideValue), delta: guideValue - center },
                { dist: Math.abs(left - guideValue), delta: guideValue - left },
                { dist: Math.abs(right - guideValue), delta: guideValue - right },
            ].sort((a, b) => a.dist - b.dist)[0];
            return opts.delta;
        } else {
            const center = box.y + box.height / 2;
            const top = box.y;
            const bottom = box.y + box.height;
            const opts = [
                { dist: Math.abs(center - guideValue), delta: guideValue - center },
                { dist: Math.abs(top - guideValue), delta: guideValue - top },
                { dist: Math.abs(bottom - guideValue), delta: guideValue - bottom },
            ].sort((a, b) => a.dist - b.dist)[0];
            return opts.delta;
        }
    };

    // ---- Candidatos de la MISMA sección (centros + bordes) ----
    const buildSameSectionGuides = (node, stage, objetos, elementRefs, idSelf, seccionId) => {
        const selfBox = node.getClientRect({ relativeTo: stage });
        const candidates = objetos
            .filter(o => o.id !== idSelf && o.seccionId === seccionId) // 🔒 MISMA SECCIÓN
            .map(o => {
                const n = elementRefs.current?.[o.id];
                if (!n) return null;
                try {
                    const b = n.getClientRect({ relativeTo: stage });
                    const d = Math.abs((selfBox.x + selfBox.width / 2) - (b.x + b.width / 2))
                        + Math.abs((selfBox.y + selfBox.height / 2) - (b.y + b.height / 2));
                    return { box: b, d };
                } catch { return null; }
            })
            .filter(Boolean)
            .sort((a, b) => a.d - b.d)
            .slice(0, 3); // pocos vecinos → menos ruido

        const g = [];
        for (const { box } of candidates) {
            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;
            const left = box.x;
            const right = box.x + box.width;
            const top = box.y;
            const bottom = box.y + box.height;

            // Centros
            g.push({ axis: "x", value: cx, type: "el-cx", targetBox: box, priority: "elemento", style: "dashed" });
            g.push({ axis: "y", value: cy, type: "el-cy", targetBox: box, priority: "elemento", style: "dashed" });
            // Bordes
            g.push({ axis: "x", value: left, type: "el-left", targetBox: box, priority: "elemento", style: "dashed" });
            g.push({ axis: "x", value: right, type: "el-right", targetBox: box, priority: "elemento", style: "dashed" });
            g.push({ axis: "y", value: top, type: "el-top", targetBox: box, priority: "elemento", style: "dashed" });
            g.push({ axis: "y", value: bottom, type: "el-bottom", targetBox: box, priority: "elemento", style: "dashed" });
        }
        return g;
    };

    // ---- Mostrar guías durante el drag ----
    const mostrarGuias = useCallback((pos, idActual, objetos, elementRefs) => {
        // 🔥 NO mostrar guías durante drag grupal
        if (window._grupoLider) {
            setGuiaLineas([]);
            return;
        }
        const node = elementRefs.current?.[idActual];
        if (!node) return;
        const stage = node.getStage?.();
        if (!stage) return;

        try {
            const selfBoxBefore = node.getClientRect({ relativeTo: stage });
            const selfCx = selfBoxBefore.x + selfBoxBefore.width / 2;
            const selfCy = selfBoxBefore.y + selfBoxBefore.height / 2;

            const seccion = obtenerSeccionElemento(idActual, objetos);
            if (!seccion) {
                setGuiaLineas([]);
                return;
            }
            const offY = calcularOffsetSeccion(seccion.id);
            const secCx = anchoCanvas / 2;
            const secCy = offY + seccion.altura / 2;

            const lines = [];

            // 1) SECCIÓN: mostrar CX/CY SOLO si está cerca
            const distSecX = Math.abs(selfCx - secCx);
            const distSecY = Math.abs(selfCy - secCy);

            if (distSecX <= sectionShowRadius) {
                lines.push({
                    type: "seccion-cx",
                    priority: "seccion",
                    style: "solid",
                    points: [secCx, offY, secCx, offY + seccion.altura] // línea vertical solo dentro de la sección
                });
                // (opcional snap al centro de sección si querés)
                if (distSecX <= magnetRadius) {
                    const delta = deltaForGuide("x", secCx, selfBoxBefore);
                    node.x(node.x() + delta * snapStrength);
                }
            }
            if (distSecY <= sectionShowRadius) {
                lines.push({
                    type: "seccion-cy",
                    priority: "seccion",
                    style: "solid",
                    points: [0, secCy, anchoCanvas, secCy] // la sección ocupa todo el ancho
                });
                if (distSecY <= magnetRadius) {
                    const delta = deltaForGuide("y", secCy, selfBoxBefore);
                    node.y(node.y() + delta * snapStrength);
                }
            }

            // 2) ELEMENTOS (MISMA SECCIÓN): elegimos mejor candidato por eje y, si hay snap, dibujamos reach punteada
            const elementGuides = buildSameSectionGuides(node, stage, objetos, elementRefs, idActual, seccion.id);

            const nearX = elementGuides
                .filter(g => g.axis === "x")
                .map(g => ({ g, dist: Math.abs(selfCx - g.value) }))
                .sort((a, b) => a.dist - b.dist)[0];

            const nearY = elementGuides
                .filter(g => g.axis === "y")
                .map(g => ({ g, dist: Math.abs(selfCy - g.value) }))
                .sort((a, b) => a.dist - b.dist)[0];

            // aplicar snap sólo si está dentro del magnetRadius (para reducir ruido)
            const trySnapAxis = (axis, near) => {
                if (!near) return false;
                if (near.dist > magnetRadius) return false;
                const fresh = node.getClientRect({ relativeTo: stage });
                const delta = deltaForGuide(axis, near.g.value, fresh);
                if (axis === "x") node.x(node.x() + delta * snapStrength);
                else node.y(node.y() + delta * snapStrength);
                return true;
            };

            const snappedX = trySnapAxis("x", nearX);
            const snappedY = trySnapAxis("y", nearY);

            // Recalcular box luego del snap para dibujar reach exacta
            const selfBoxAfter = node.getClientRect({ relativeTo: stage });

            if (snappedX && nearX?.g?.targetBox) {
                lines.push({
                    type: "reach-x",
                    priority: "elemento",
                    style: "dashed", // 🔴 punteada
                    points: reachVertical(nearX.g.value, selfBoxAfter, nearX.g.targetBox)
                });
            }
            if (snappedY && nearY?.g?.targetBox) {
                lines.push({
                    type: "reach-y",
                    priority: "elemento",
                    style: "dashed", // 🔴 punteada
                    points: reachHorizontal(nearY.g.value, selfBoxAfter, nearY.g.targetBox)
                });
            }

            setGuiaLineas(lines);
        } catch (e) {
            // silencioso para no cortar el drag
        }
    }, [
        anchoCanvas, altoCanvas,
        magnetRadius, sectionShowRadius, snapStrength,
        seccionesOrdenadas,
        obtenerSeccionElemento, calcularOffsetSeccion
    ]);

    const limpiarGuias = useCallback(() => setGuiaLineas([]), []);
    const configurarDragEnd = useCallback(() => setGuiaLineas([]), []);

    return {
        guiaLineas,
        mostrarGuias,
        limpiarGuias,
        configurarDragEnd
    };
}
