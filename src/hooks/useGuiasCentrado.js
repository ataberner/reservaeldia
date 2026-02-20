// hooks/useGuiasCentrado.js
import { useState, useCallback } from "react";

/**
 * Guías con:
 * - Sección: muestra CX/CY solo cuando el elemento quedó centrado.
 * - Elementos: SOLO misma sección, líneas punteadas tipo "reach" hasta el otro elemento.
 * - Nada de otras secciones.
 */
export default function useGuiasCentrado({
    anchoCanvas = 800,
    altoCanvas = 800,
    magnetRadius = 16,       // distancia para activar el snap
    elementMagnetRadius = null,   // null => magnetRadius
    sectionMagnetRadius = null,   // null => magnetRadius
    sectionShowRadius = 18,  // legado (no usado para mostrar líneas de sección)
    sectionPriorityBias = 4,      // ventaja extra para que gane sección vs elementos
    snapStrength = 1,        // 1 = pegado exacto; 0.4-0.6 = tracción suave
    sectionSnapStrength = null,   // null => snapStrength
    elementSnapStrength = null,   // null => snapStrength
    sectionLineTolerance = 0.75,  // solo mostrar guía de sección cuando está realmente centrado
    seccionesOrdenadas = []
}) {
    const [guiaLineas, setGuiaLineas] = useState([]);


    const effElementMagnetRadius = elementMagnetRadius ?? magnetRadius;
    const effSectionMagnetRadius = sectionMagnetRadius ?? magnetRadius;
    const effSectionSnapStrength = sectionSnapStrength ?? snapStrength;
    const effElementSnapStrength = elementSnapStrength ?? snapStrength;


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

    // Misma heurística que deltaForGuide, pero devuelve distancia mínima
    const distForGuide = (axis, guideValue, box) => {
        if (axis === "x") {
            const center = box.x + box.width / 2;
            const left = box.x;
            const right = box.x + box.width;
            return Math.min(
                Math.abs(center - guideValue),
                Math.abs(left - guideValue),
                Math.abs(right - guideValue)
            );
        }
        const center = box.y + box.height / 2;
        const top = box.y;
        const bottom = box.y + box.height;
        return Math.min(
            Math.abs(center - guideValue),
            Math.abs(top - guideValue),
            Math.abs(bottom - guideValue)
        );
    };

    // ---- Candidatos de la MISMA sección (centros + bordes) ----
    const getNodeBox = (node, stage, obj = null) => {
        if (!node || !stage || typeof node.getClientRect !== "function") return null;

        const rectOpts = { relativeTo: stage };

        if (
            obj?.tipo === "galeria" &&
            Number.isFinite(Number(obj?.width)) &&
            Number.isFinite(Number(obj?.height))
        ) {
            const xFromNode = typeof node.x === "function" ? node.x() : null;
            const yFromNode = typeof node.y === "function" ? node.y() : null;
            const absPos =
                typeof node.getAbsolutePosition === "function"
                    ? node.getAbsolutePosition(stage)
                    : null;
            const x =
                Number.isFinite(xFromNode)
                    ? xFromNode
                    : Number.isFinite(absPos?.x)
                    ? absPos.x
                    : (typeof node.x === "function" ? node.x() : 0);
            const y =
                Number.isFinite(yFromNode)
                    ? yFromNode
                    : Number.isFinite(absPos?.y)
                    ? absPos.y
                    : (typeof node.y === "function" ? node.y() : 0);

            return {
                x,
                y,
                width: Number(obj.width),
                height: Number(obj.height),
            };
        }

        // La galeria usa overlays por celda; medir su frame base evita offsets falsos.
        if (obj?.tipo === "galeria" && typeof node.findOne === "function") {
            const galleryFrame = node.findOne(".gallery-transform-frame");
            if (galleryFrame && typeof galleryFrame.getClientRect === "function") {
                try {
                    return galleryFrame.getClientRect({
                        relativeTo: stage,
                        skipShadow: true,
                        skipStroke: true,
                    });
                } catch {
                    // fallback al rect completo
                }
            }
        }

        try {
            return node.getClientRect(rectOpts);
        } catch {
            return null;
        }
    };

    const buildSameSectionGuides = (node, stage, objetos, elementRefs, idSelf, seccionId, objById) => {
        const selfObj = objById.get(idSelf) || null;
        const selfBox = getNodeBox(node, stage, selfObj);
        if (!selfBox) return [];
        const candidates = objetos
            .filter(o => o.id !== idSelf && o.seccionId === seccionId) // 🔒 MISMA SECCIÓN
            .map(o => {
                const n = elementRefs.current?.[o.id];
                if (!n) return null;
                try {
                    const b = getNodeBox(n, stage, objById.get(o.id) || null);
                    if (!b) return null;
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
            const objById = new Map(objetos.map((o) => [o.id, o]));
            const objActual = objById.get(idActual) || null;
            const selfBoxBefore = getNodeBox(node, stage, objActual);
            if (!selfBoxBefore) return;
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

            // 1) SECCIÓN: el snap evalúa el centro de la sección.
            const distSecX = Math.abs(selfCx - secCx);
            const distSecY = Math.abs(selfCy - secCy);

            // 2) ELEMENTOS (MISMA SECCIÓN): elegir mejor candidato por eje
            const elementGuides = buildSameSectionGuides(
                node,
                stage,
                objetos,
                elementRefs,
                idActual,
                seccion.id,
                objById
            );

            const bestElX = elementGuides
                .filter(g => g.axis === "x")
                .map(g => ({ g, dist: distForGuide("x", g.value, selfBoxBefore) }))
                .sort((a, b) => a.dist - b.dist)[0];

            const bestElY = elementGuides
                .filter(g => g.axis === "y")
                .map(g => ({ g, dist: distForGuide("y", g.value, selfBoxBefore) }))
                .sort((a, b) => a.dist - b.dist)[0];

            // Decidir qué guía “gana” por eje (sección vs elemento)
            const decidirSnap = (secDistCenter, bestEl) => {
                const secOk = secDistCenter <= effSectionMagnetRadius;
                const elOk = !!bestEl && bestEl.dist <= effElementMagnetRadius;
                if (!secOk && !elOk) return null;
                if (secOk && !elOk) return { source: "seccion" };
                if (!secOk && elOk) return { source: "elemento", near: bestEl };

                // ambos aplican: la sección tiene ventaja (bias)
                const elBeatsSection = (bestEl.dist + sectionPriorityBias) < secDistCenter;
                return elBeatsSection
                    ? { source: "elemento", near: bestEl }
                    : { source: "seccion" };
            };

            const decisionX = decidirSnap(distSecX, bestElX);
            const decisionY = decidirSnap(distSecY, bestElY);


            const applySnap = (axis, decision) => {
                if (!decision) return { snapped: false };
                const fresh = getNodeBox(node, stage, objActual);
                if (!fresh) return { snapped: false };

                if (decision.source === "seccion") {
                    if (axis === "x") {
                        const cx = fresh.x + fresh.width / 2;
                        node.x(node.x() + (secCx - cx) * effSectionSnapStrength);
                    } else {
                        const cy = fresh.y + fresh.height / 2;
                        node.y(node.y() + (secCy - cy) * effSectionSnapStrength);
                    }
                    return { snapped: true, source: "seccion" };
                }

                const delta = deltaForGuide(axis, decision.near.g.value, fresh);
                if (axis === "x") node.x(node.x() + delta * effElementSnapStrength);
                else node.y(node.y() + delta * effElementSnapStrength);
                return { snapped: true, source: "elemento", near: decision.near };
            };

            const snapResX = applySnap("x", decisionX);
            const snapResY = applySnap("y", decisionY);

            // Recalcular box luego del snap para dibujar reach exacta
            const selfBoxAfter = getNodeBox(node, stage, objActual);
            if (!selfBoxAfter) return;
            const selfCxAfter = selfBoxAfter.x + selfBoxAfter.width / 2;
            const selfCyAfter = selfBoxAfter.y + selfBoxAfter.height / 2;

            // 2) SECCIÓN: mostrar guía SOLO cuando quedó efectivamente alineado.
            if (
                snapResX.snapped &&
                snapResX.source === "seccion" &&
                Math.abs(selfCxAfter - secCx) <= sectionLineTolerance
            ) {
                lines.push({
                    type: "seccion-cx",
                    priority: "seccion",
                    style: "solid",
                    points: [secCx, offY, secCx, offY + seccion.altura]
                });
            }
            if (
                snapResY.snapped &&
                snapResY.source === "seccion" &&
                Math.abs(selfCyAfter - secCy) <= sectionLineTolerance
            ) {
                lines.push({
                    type: "seccion-cy",
                    priority: "seccion",
                    style: "solid",
                    points: [0, secCy, anchoCanvas, secCy]
                });
            }

            if (snapResX.snapped && snapResX.source === "elemento" && snapResX.near?.g?.targetBox) {
                lines.push({
                    type: "reach-x",
                    priority: "elemento",
                    style: "dashed",
                    points: reachVertical(snapResX.near.g.value, selfBoxAfter, snapResX.near.g.targetBox)
                });
            }
            if (snapResY.snapped && snapResY.source === "elemento" && snapResY.near?.g?.targetBox) {
                lines.push({
                    type: "reach-y",
                    priority: "elemento",
                    style: "dashed",
                    points: reachHorizontal(snapResY.near.g.value, selfBoxAfter, snapResY.near.g.targetBox)
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
        obtenerSeccionElemento, calcularOffsetSeccion,
        elementMagnetRadius, sectionMagnetRadius, sectionPriorityBias,
        sectionSnapStrength, elementSnapStrength, sectionLineTolerance
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
