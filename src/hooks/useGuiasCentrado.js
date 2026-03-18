// hooks/useGuiasCentrado.js
import { useCallback, useEffect, useRef } from "react";
import {
    startCanvasDragPerfSpan,
    trackCanvasDragPerf,
} from "@/components/editor/canvasEditor/canvasDragPerf";

function roundGuideMetric(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "n";
    return Math.round(numeric * 100) / 100;
}

function getGuidePerfNow() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
        return performance.now();
    }
    return Date.now();
}

function buildGuideLinesSignature(lines = []) {
    return lines.map((line) => [
        line?.type || "",
        line?.priority || "",
        line?.style || "",
        ...(Array.isArray(line?.points) ? line.points.map(roundGuideMetric) : []),
    ].join(":")).join("|");
}

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
    seccionesOrdenadas = [],
    onGuideLinesChange = null,
}) {
    const guideLinesRafRef = useRef(null);
    const pendingGuideLinesRef = useRef(null);
    const lastGuideSignatureRef = useRef("");
    const objectCacheRef = useRef({
        source: null,
        byId: new Map(),
        bySection: new Map(),
    });
    const sectionCacheRef = useRef({
        source: null,
        byId: new Map(),
    });
    const sectionGuideTargetsCacheRef = useRef({
        source: null,
        stage: null,
        selfId: null,
        targets: [],
    });

    const publishGuideLines = useCallback((nextLines = []) => {
        if (typeof onGuideLinesChange === "function") {
            onGuideLinesChange(nextLines);
        }
    }, [onGuideLinesChange]);

    const commitGuideLines = useCallback((nextLines = []) => {
        const safeLines = Array.isArray(nextLines) ? nextLines : [];
        const nextSignature = buildGuideLinesSignature(safeLines);

        if (nextSignature === lastGuideSignatureRef.current) {
            trackCanvasDragPerf("guides:commit-skip", {
                lines: safeLines.length,
                signatureSize: nextSignature.length,
                reason: "same-signature",
            }, {
                throttleMs: 180,
                throttleKey: "guides:commit-skip",
            });
            pendingGuideLinesRef.current = null;
            return;
        }

        pendingGuideLinesRef.current = {
            lines: safeLines,
            signature: nextSignature,
        };

        if (guideLinesRafRef.current != null) return;

        if (typeof window === "undefined") {
            lastGuideSignatureRef.current = nextSignature;
            publishGuideLines(safeLines);
            pendingGuideLinesRef.current = null;
            return;
        }

        guideLinesRafRef.current = window.requestAnimationFrame(() => {
            guideLinesRafRef.current = null;
            const pending = pendingGuideLinesRef.current;
            if (!pending) return;
            pendingGuideLinesRef.current = null;

            if (pending.signature === lastGuideSignatureRef.current) {
                trackCanvasDragPerf("guides:commit-skip", {
                    lines: pending.lines.length,
                    signatureSize: pending.signature.length,
                    reason: "raf-same-signature",
                }, {
                    throttleMs: 180,
                    throttleKey: "guides:commit-skip",
                });
                return;
            }

            lastGuideSignatureRef.current = pending.signature;
            trackCanvasDragPerf("guides:commit", {
                lines: pending.lines.length,
                signatureSize: pending.signature.length,
            }, {
                throttleMs: 180,
                throttleKey: "guides:commit",
            });
            publishGuideLines(pending.lines);
        });
    }, [publishGuideLines]);

    const clearGuideLines = useCallback(() => {
        commitGuideLines([]);
    }, [commitGuideLines]);

    useEffect(() => () => {
        if (
            guideLinesRafRef.current != null &&
            typeof window !== "undefined"
        ) {
            window.cancelAnimationFrame(guideLinesRafRef.current);
        }
    }, []);

    const getObjectCache = useCallback((objetos = []) => {
        if (objectCacheRef.current.source === objetos) {
            return objectCacheRef.current;
        }

        const byId = new Map();
        const bySection = new Map();

        objetos.forEach((obj) => {
            if (!obj?.id) return;
            byId.set(obj.id, obj);

            if (!obj.seccionId) return;

            const sectionItems = bySection.get(obj.seccionId);
            if (sectionItems) {
                sectionItems.push(obj);
                return;
            }

            bySection.set(obj.seccionId, [obj]);
        });

        objectCacheRef.current = {
            source: objetos,
            byId,
            bySection,
        };

        return objectCacheRef.current;
    }, []);

    const getSectionById = useCallback((sectionId) => {
        if (!sectionId) return null;

        if (sectionCacheRef.current.source !== seccionesOrdenadas) {
            const byId = new Map();
            seccionesOrdenadas.forEach((section) => {
                if (!section?.id) return;
                byId.set(section.id, section);
            });

            sectionCacheRef.current = {
                source: seccionesOrdenadas,
                byId,
            };
        }

        return sectionCacheRef.current.byId.get(sectionId) || null;
    }, [seccionesOrdenadas]);


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

    const getSectionGuideTargets = useCallback((stage, objetosSeccion, elementRefs, idSelf, objById) => {
        if (!stage || !Array.isArray(objetosSeccion) || objetosSeccion.length === 0) {
            return {
                targets: [],
                cacheHit: false,
            };
        }

        const cached = sectionGuideTargetsCacheRef.current;
        if (
            cached.source === objetosSeccion &&
            cached.stage === stage &&
            cached.selfId === idSelf
        ) {
            trackCanvasDragPerf("guides:targets-cache-hit", {
                elementId: idSelf,
                sectionCandidates: objetosSeccion.length,
                targets: cached.targets.length,
            }, {
                throttleMs: 180,
                throttleKey: `guides:targets-cache-hit:${idSelf}`,
            });
            return {
                targets: cached.targets,
                cacheHit: true,
            };
        }

        const targets = objetosSeccion
            .filter((obj) => obj?.id && obj.id !== idSelf)
            .map((obj) => {
                const node = elementRefs.current?.[obj.id];
                if (!node) return null;
                const box = getNodeBox(node, stage, objById.get(obj.id) || obj || null);
                if (!box) return null;
                return {
                    id: obj.id,
                    box,
                    centerX: box.x + box.width / 2,
                    centerY: box.y + box.height / 2,
                };
            })
            .filter(Boolean);

        sectionGuideTargetsCacheRef.current = {
            source: objetosSeccion,
            stage,
            selfId: idSelf,
            targets,
        };

        trackCanvasDragPerf("guides:targets-cache-build", {
            elementId: idSelf,
            sectionCandidates: objetosSeccion.length,
            targets: targets.length,
        }, {
            throttleMs: 180,
            throttleKey: `guides:targets-cache-build:${idSelf}`,
        });

        return {
            targets,
            cacheHit: false,
        };
    }, []);

    const buildSameSectionGuides = (selfBox, guideTargets) => {
        if (!selfBox || !Array.isArray(guideTargets) || guideTargets.length === 0) {
            return [];
        }
        const selfCenterX = selfBox.x + selfBox.width / 2;
        const selfCenterY = selfBox.y + selfBox.height / 2;
        const candidates = guideTargets
            .map((target) => ({
                box: target.box,
                d:
                    Math.abs(selfCenterX - target.centerX) +
                    Math.abs(selfCenterY - target.centerY),
            }))
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

    const getUnionBox = (ids, stage, elementRefs, objById) => {
        if (!Array.isArray(ids) || ids.length === 0) return null;

        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        ids.forEach((id) => {
            const n = elementRefs.current?.[id];
            if (!n) return;
            const b = getNodeBox(n, stage, objById.get(id) || null);
            if (!b) return;
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.width);
            maxY = Math.max(maxY, b.y + b.height);
        });

        if (
            !Number.isFinite(minX) ||
            !Number.isFinite(minY) ||
            !Number.isFinite(maxX) ||
            !Number.isFinite(maxY)
        ) {
            return null;
        }

        return {
            x: minX,
            y: minY,
            width: Math.max(0, maxX - minX),
            height: Math.max(0, maxY - minY),
        };
    };

    const shiftNodes = (ids, axis, delta, elementRefs) => {
        if (!Array.isArray(ids) || ids.length === 0 || !Number.isFinite(delta)) return;
        if (Math.abs(delta) < 0.0001) return;

        const shiftSingle = (node) => {
            if (!node) return;
            try {
                if (axis === "x") {
                    node.x(node.x() + delta);
                } else {
                    node.y(node.y() + delta);
                }
            } catch {
                // silencioso para no cortar drag
            }
        };

        ids.forEach((id) => {
            const n = elementRefs.current?.[id];
            shiftSingle(n);
            // Algunas formas (rect/rsvp) renderizan el texto como nodo separado.
            shiftSingle(elementRefs.current?.[`${id}-text`]);
        });
    };

    // ---- Mostrar guías durante el drag ----
    const mostrarGuias = useCallback((pos, idActual, objetos, elementRefs) => {
        const perfStartedAt = getGuidePerfNow();
        let perfLastAt = perfStartedAt;
        const perfBreakdown = {};
        const capturePerfPhase = (phaseName) => {
            const now = getGuidePerfNow();
            perfBreakdown[phaseName] = roundGuideMetric(now - perfLastAt);
            perfLastAt = now;
        };
        const finishPerf = startCanvasDragPerfSpan("guides:evaluate", {
            elementId: idActual,
        }, {
            throttleMs: 180,
            throttleKey: `guides:evaluate:${idActual}`,
        });
        const node = elementRefs.current?.[idActual];
        if (!node) {
            finishPerf?.({ reason: "missing-node" });
            return;
        }
        const stage = node.getStage?.();
        if (!stage) {
            finishPerf?.({ reason: "missing-stage" });
            return;
        }

        try {
            const { byId: objById, bySection } = getObjectCache(objetos);
            const objActual = objById.get(idActual) || null;
            const isGroupLeader = window._grupoLider && idActual === window._grupoLider;
            const rawGroupIds = Array.isArray(window._grupoElementos) && window._grupoElementos.length > 1
                ? window._grupoElementos
                : (Array.isArray(window._elementosSeleccionados) ? window._elementosSeleccionados : []);
            const groupIds = isGroupLeader
                ? [...new Set(rawGroupIds.filter(Boolean))]
                : [];
            const isGroupDrag = isGroupLeader && groupIds.length > 1;

            const selfBoxBefore = isGroupDrag
                ? getUnionBox(groupIds, stage, elementRefs, objById)
                : getNodeBox(node, stage, objActual);
            if (!selfBoxBefore) {
                finishPerf?.({ reason: "missing-self-box-before" });
                return;
            }
            capturePerfPhase("selfBoxResolveMs");
            const selfCx = selfBoxBefore.x + selfBoxBefore.width / 2;
            const selfCy = selfBoxBefore.y + selfBoxBefore.height / 2;

            const seccion = getSectionById(objActual?.seccionId);
            if (!seccion) {
                clearGuideLines();
                finishPerf?.({ reason: "missing-section" });
                return;
            }
            const offY = calcularOffsetSeccion(seccion.id);
            const secCx = anchoCanvas / 2;
            const secCy = offY + seccion.altura / 2;
            const sectionItems = bySection.get(seccion.id) || [];
            capturePerfPhase("sectionResolveMs");

            const lines = [];

            // 1) SECCIÓN: el snap evalúa el centro de la sección.
            const distSecX = Math.abs(selfCx - secCx);
            const distSecY = Math.abs(selfCy - secCy);

            // 2) ELEMENTOS (MISMA SECCIÓN): elegir mejor candidato por eje
            const { targets: sectionGuideTargets, cacheHit: guideCacheHit } = isGroupDrag
                ? { targets: [], cacheHit: false }
                : getSectionGuideTargets(
                    stage,
                    sectionItems,
                    elementRefs,
                    idActual,
                    objById
                );
            capturePerfPhase("targetsLookupMs");

            const elementGuides = isGroupDrag
                ? []
                : buildSameSectionGuides(selfBoxBefore, sectionGuideTargets);

            const bestElX = isGroupDrag
                ? null
                : elementGuides
                    .filter(g => g.axis === "x")
                    .map(g => ({ g, dist: distForGuide("x", g.value, selfBoxBefore) }))
                    .sort((a, b) => a.dist - b.dist)[0];

            const bestElY = isGroupDrag
                ? null
                : elementGuides
                    .filter(g => g.axis === "y")
                    .map(g => ({ g, dist: distForGuide("y", g.value, selfBoxBefore) }))
                    .sort((a, b) => a.dist - b.dist)[0];
            capturePerfPhase("guideBuildMs");

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
            capturePerfPhase("decisionMs");

            trackCanvasDragPerf("guides:snapshot", {
                elementId: idActual,
                isGroupDrag,
                sectionId: seccion.id,
                sectionCandidates: sectionItems.length,
                sectionGuideTargetsCount: sectionGuideTargets.length,
                elementGuidesCount: elementGuides.length,
                guideCacheHit,
                distSecX: roundGuideMetric(distSecX),
                distSecY: roundGuideMetric(distSecY),
                bestElXDist: roundGuideMetric(bestElX?.dist),
                bestElYDist: roundGuideMetric(bestElY?.dist),
                decisionX: decisionX?.source || "none",
                decisionY: decisionY?.source || "none",
            }, {
                throttleMs: 120,
                throttleKey: `guides:snapshot:${idActual}`,
            });

            const finishSnapPerf = startCanvasDragPerfSpan("guides:snap-apply", {
                elementId: idActual,
                sectionId: seccion.id,
                isGroupDrag,
            }, {
                throttleMs: 120,
                throttleKey: `guides:snap-apply:${idActual}`,
            });

            const applySnap = (axis, decision) => {
                if (!decision) {
                    return {
                        snapped: false,
                        source: "none",
                        axis,
                        deltaApplied: 0,
                        distBefore: null,
                        strength: null,
                        targetValue: null,
                        nearType: null,
                    };
                }
                const fresh = isGroupDrag
                    ? getUnionBox(groupIds, stage, elementRefs, objById)
                    : getNodeBox(node, stage, objActual);
                if (!fresh) {
                    return {
                        snapped: false,
                        source: decision.source || "none",
                        axis,
                        deltaApplied: 0,
                        distBefore: null,
                        strength: null,
                        targetValue: null,
                        nearType: decision?.near?.g?.type || null,
                        reason: "missing-fresh-box",
                    };
                }

                if (decision.source === "seccion") {
                    const nextCenter = axis === "x"
                        ? fresh.x + fresh.width / 2
                        : fresh.y + fresh.height / 2;
                    const targetCenter = axis === "x" ? secCx : secCy;
                    const distBefore = Math.abs(targetCenter - nextCenter);
                    const delta = (targetCenter - nextCenter) * effSectionSnapStrength;

                    if (axis === "x") {
                        if (isGroupDrag) shiftNodes(groupIds, "x", delta, elementRefs);
                        else node.x(node.x() + delta);
                    } else {
                        if (isGroupDrag) shiftNodes(groupIds, "y", delta, elementRefs);
                        else node.y(node.y() + delta);
                    }
                    return {
                        snapped: true,
                        source: "seccion",
                        axis,
                        deltaApplied: roundGuideMetric(delta),
                        distBefore: roundGuideMetric(distBefore),
                        strength: roundGuideMetric(effSectionSnapStrength),
                        targetValue: roundGuideMetric(targetCenter),
                        nearType: null,
                    };
                }

                if (isGroupDrag) {
                    return {
                        snapped: false,
                        source: "elemento",
                        axis,
                        deltaApplied: 0,
                        distBefore: roundGuideMetric(decision?.near?.dist),
                        strength: roundGuideMetric(effElementSnapStrength),
                        targetValue: roundGuideMetric(decision?.near?.g?.value),
                        nearType: decision?.near?.g?.type || null,
                        reason: "group-element-snap-disabled",
                    };
                }

                const delta = deltaForGuide(axis, decision.near.g.value, fresh);
                const appliedDelta = delta * effElementSnapStrength;
                if (axis === "x") node.x(node.x() + appliedDelta);
                else node.y(node.y() + appliedDelta);
                return {
                    snapped: true,
                    source: "elemento",
                    axis,
                    deltaApplied: roundGuideMetric(appliedDelta),
                    distBefore: roundGuideMetric(decision?.near?.dist),
                    strength: roundGuideMetric(effElementSnapStrength),
                    targetValue: roundGuideMetric(decision?.near?.g?.value),
                    nearType: decision?.near?.g?.type || null,
                    near: decision.near,
                };
            };

            const snapResX = applySnap("x", decisionX);
            const snapResY = applySnap("y", decisionY);
            capturePerfPhase("snapApplyMs");

            // Recalcular box luego del snap para dibujar reach exacta
            const selfBoxAfter = isGroupDrag
                ? getUnionBox(groupIds, stage, elementRefs, objById)
                : getNodeBox(node, stage, objActual);
            if (!selfBoxAfter) {
                finishPerf?.({ reason: "missing-self-box-after" });
                return;
            }
            const selfCxAfter = selfBoxAfter.x + selfBoxAfter.width / 2;
            const selfCyAfter = selfBoxAfter.y + selfBoxAfter.height / 2;
            const computeSnapAfterDistance = (axis, snapRes) => {
                if (!snapRes?.snapped) return null;
                if (snapRes.source === "seccion") {
                    const nextCenter = axis === "x" ? selfCxAfter : selfCyAfter;
                    const targetCenter = axis === "x" ? secCx : secCy;
                    return roundGuideMetric(Math.abs(nextCenter - targetCenter));
                }
                if (snapRes.source === "elemento" && snapRes.targetValue != null) {
                    return roundGuideMetric(
                        distForGuide(axis, snapRes.targetValue, selfBoxAfter)
                    );
                }
                return null;
            };

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

            if (!isGroupDrag && snapResX.snapped && snapResX.source === "elemento" && snapResX.near?.g?.targetBox) {
                lines.push({
                    type: "reach-x",
                    priority: "elemento",
                    style: "dashed",
                    points: reachVertical(snapResX.near.g.value, selfBoxAfter, snapResX.near.g.targetBox)
                });
            }
            if (!isGroupDrag && snapResY.snapped && snapResY.source === "elemento" && snapResY.near?.g?.targetBox) {
                lines.push({
                    type: "reach-y",
                    priority: "elemento",
                    style: "dashed",
                    points: reachHorizontal(snapResY.near.g.value, selfBoxAfter, snapResY.near.g.targetBox)
                });
            }
            capturePerfPhase("lineBuildMs");

            if (decisionX || decisionY) {
                finishSnapPerf?.({
                    sectionId: seccion.id,
                    isGroupDrag,
                    xSource: snapResX.source || "none",
                    ySource: snapResY.source || "none",
                    xAppliedDelta: snapResX.deltaApplied ?? null,
                    yAppliedDelta: snapResY.deltaApplied ?? null,
                    xStrength: snapResX.strength ?? null,
                    yStrength: snapResY.strength ?? null,
                    xDistBefore: snapResX.distBefore ?? null,
                    yDistBefore: snapResY.distBefore ?? null,
                    xDistAfter: computeSnapAfterDistance("x", snapResX),
                    yDistAfter: computeSnapAfterDistance("y", snapResY),
                    xTargetType: snapResX.nearType || null,
                    yTargetType: snapResY.nearType || null,
                    linesPlanned: lines.length,
                });
            }

            const commitStartedAt = getGuidePerfNow();
            commitGuideLines(lines);
            perfBreakdown.commitEnqueueMs = roundGuideMetric(getGuidePerfNow() - commitStartedAt);
            finishPerf?.({
                isGroupDrag,
                lines: lines.length,
                sectionId: seccion.id,
                guideCacheHit,
                snapXSource: snapResX.source || "none",
                snapYSource: snapResY.source || "none",
                totalElapsedMs: roundGuideMetric(getGuidePerfNow() - perfStartedAt),
                ...perfBreakdown,
            });
        } catch (e) {
            finishPerf?.({
                reason: "error",
                message: e?.message || String(e),
                totalElapsedMs: roundGuideMetric(getGuidePerfNow() - perfStartedAt),
                ...perfBreakdown,
            });
            // silencioso para no cortar el drag
        }
    }, [
        anchoCanvas, altoCanvas,
        magnetRadius, sectionShowRadius, snapStrength,
        seccionesOrdenadas,
        calcularOffsetSeccion, getSectionById,
        elementMagnetRadius, sectionMagnetRadius, sectionPriorityBias,
        sectionSnapStrength, elementSnapStrength, sectionLineTolerance,
        clearGuideLines, commitGuideLines, getObjectCache, getSectionGuideTargets
    ]);

    const prepararGuias = useCallback((idActual, objetos, elementRefs) => {
        const node = elementRefs.current?.[idActual];
        const stage = node?.getStage?.();
        if (!node || !stage) return;

        try {
            const { byId: objById, bySection } = getObjectCache(objetos);
            const objActual = objById.get(idActual) || null;
            if (!objActual?.seccionId) return;

            const sectionItems = bySection.get(objActual.seccionId) || [];
            const { targets } = getSectionGuideTargets(
                stage,
                sectionItems,
                elementRefs,
                idActual,
                objById
            );

            trackCanvasDragPerf("guides:prewarm", {
                elementId: idActual,
                sectionId: objActual.seccionId,
                sectionCandidates: sectionItems.length,
                targets: targets.length,
            }, {
                throttleMs: 180,
                throttleKey: `guides:prewarm:${idActual}`,
            });
        } catch {
            // silencioso para no cortar el drag
        }
    }, [getObjectCache, getSectionGuideTargets]);

    const limpiarGuias = useCallback(() => clearGuideLines(), [clearGuideLines]);
    const configurarDragEnd = useCallback(() => clearGuideLines(), [clearGuideLines]);

    return {
        prepararGuias,
        mostrarGuias,
        limpiarGuias,
        configurarDragEnd
    };
}
