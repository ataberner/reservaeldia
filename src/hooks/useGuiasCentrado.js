// hooks/useGuiasCentrado.js
import { useCallback, useEffect, useRef } from "react";
import {
    startCanvasDragPerfSpan,
    trackCanvasDragPerf,
} from "@/components/editor/canvasEditor/canvasDragPerf";
import {
    resolveAuthoritativeTextRect,
    shiftRectToCanonicalPose,
} from "@/components/editor/canvasEditor/konvaAuthoritativeBounds";
import {
    isSelectedDragDebugEnabled,
    logSelectedDragDebug,
    sampleCanvasInteractionLog,
} from "@/components/editor/canvasEditor/selectedDragDebug";
import {
    buildTextGeometryContractRect,
    evaluateTextGeometryContractRectAlignment,
    logTextGeometryContractInvariant,
    recordTextGeometryContractSnapshot,
} from "@/components/editor/canvasEditor/textGeometryContractDebug";

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

function normalizeGuideInputPosition(pos) {
    const x = Number(pos?.x);
    const y = Number(pos?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
}

function resolveGuideEvaluationRequest(input, fallbackElementId = null) {
    const isObjectInput = input && typeof input === "object" && !Array.isArray(input);
    const elementId = isObjectInput
        ? input.elementId || fallbackElementId || null
        : fallbackElementId || null;

    if (!elementId) return null;

    return {
        dragMode:
            isObjectInput && typeof input.dragMode === "string"
                ? input.dragMode
                : "single-element",
        pipeline:
            isObjectInput && typeof input.pipeline === "string"
                ? input.pipeline
                : "individual",
        source:
            isObjectInput && typeof input.source === "string"
                ? input.source
                : "legacy",
        sessionId:
            isObjectInput && input.sessionId != null
                ? String(input.sessionId)
                : null,
        interactionEpoch:
            isObjectInput && Number.isFinite(Number(input.interactionEpoch))
                ? Number(input.interactionEpoch)
                : null,
        elementId,
        pos: isObjectInput ? (input.pos ?? null) : input,
    };
}

function roundGuideDebugNumber(value, digits = 2) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const factor = 10 ** digits;
    return Math.round(numeric * factor) / factor;
}

function buildGuideBoxDebug(box = null) {
    if (!box) return null;
    return {
        x: roundGuideDebugNumber(box.x),
        y: roundGuideDebugNumber(box.y),
        width: roundGuideDebugNumber(box.width),
        height: roundGuideDebugNumber(box.height),
        centerX: roundGuideDebugNumber(
            Number(box.x) + Number(box.width) / 2
        ),
        centerY: roundGuideDebugNumber(
            Number(box.y) + Number(box.height) / 2
        ),
    };
}

function buildGuideBoxDelta(primaryBox = null, secondaryBox = null) {
    if (!primaryBox || !secondaryBox) return null;
    return {
        dx: roundGuideDebugNumber(Number(secondaryBox.x) - Number(primaryBox.x)),
        dy: roundGuideDebugNumber(Number(secondaryBox.y) - Number(primaryBox.y)),
        dWidth: roundGuideDebugNumber(
            Number(secondaryBox.width) - Number(primaryBox.width)
        ),
        dHeight: roundGuideDebugNumber(
            Number(secondaryBox.height) - Number(primaryBox.height)
        ),
        dCenterX: roundGuideDebugNumber(
            (
                Number(secondaryBox.x) + Number(secondaryBox.width) / 2
            ) - (
                Number(primaryBox.x) + Number(primaryBox.width) / 2
            )
        ),
        dCenterY: roundGuideDebugNumber(
            (
                Number(secondaryBox.y) + Number(secondaryBox.height) / 2
            ) - (
                Number(primaryBox.y) + Number(primaryBox.height) / 2
            )
        ),
    };
}

function buildGuideDecisionKey(decision = null) {
    if (!decision) return "none";
    const nearGuide = decision?.near?.g || null;
    return [
        decision.source || "none",
        nearGuide?.type || "none",
        roundGuideDebugNumber(nearGuide?.value),
        decision.locked === true ? "locked" : "free",
    ].join(":");
}

function buildGuideDecisionDebug(decision = null) {
    if (!decision) {
        return {
            source: "none",
            targetType: null,
            targetValue: null,
            locked: false,
        };
    }

    return {
        source: decision.source || "none",
        targetType: decision?.near?.g?.type || null,
        targetValue: roundGuideDebugNumber(decision?.near?.g?.value),
        locked: decision.locked === true,
        lockAgeMs: roundGuideDebugNumber(decision?.lockAgeMs),
        candidateDist: roundGuideDebugNumber(decision?.near?.dist),
    };
}

function buildGuideSnapDebug(snapRes = null, distAfter = null) {
    if (!snapRes) return null;
    return {
        snapped: snapRes.snapped === true,
        source: snapRes.source || "none",
        axis: snapRes.axis || null,
        deltaApplied: roundGuideDebugNumber(snapRes.deltaApplied),
        distBefore: roundGuideDebugNumber(snapRes.distBefore),
        distAfter: roundGuideDebugNumber(distAfter),
        strength: roundGuideDebugNumber(snapRes.strength),
        targetValue: roundGuideDebugNumber(snapRes.targetValue),
        nearType: snapRes.nearType || null,
    };
}

function buildGuideLinesDebug(lines = []) {
    return (Array.isArray(lines) ? lines : []).map((line) => ({
        type: line?.type || null,
        priority: line?.priority || null,
        style: line?.style || null,
        points: Array.isArray(line?.points)
            ? line.points.map((value) => roundGuideDebugNumber(value))
            : [],
    }));
}

function shouldForceGuideGeometryLog(diagnostics = null) {
    if (!diagnostics?.delta) return false;
    return (
        Math.abs(Number(diagnostics.delta.dx || 0)) >= 0.5 ||
        Math.abs(Number(diagnostics.delta.dy || 0)) >= 0.5 ||
        Math.abs(Number(diagnostics.delta.dCenterX || 0)) >= 0.5 ||
        Math.abs(Number(diagnostics.delta.dCenterY || 0)) >= 0.5 ||
        Math.abs(Number(diagnostics.delta.dWidth || 0)) >= 0.5 ||
        Math.abs(Number(diagnostics.delta.dHeight || 0)) >= 0.5
    );
}

function maybeLogGuideDebug(eventName, payload = {}, options = {}) {
    if (!isSelectedDragDebugEnabled()) return;

    const sampleKey = options?.sampleKey || null;
    const force = options?.force === true;
    if (!force && sampleKey) {
        const sample = sampleCanvasInteractionLog(sampleKey, {
            firstCount: options?.firstCount ?? 4,
            throttleMs: options?.throttleMs ?? 120,
        });
        if (!sample.shouldLog) return;
        logSelectedDragDebug(eventName, {
            sampleCount: sample.sampleCount,
            ...payload,
        });
        return;
    }

    logSelectedDragDebug(eventName, payload);
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
    const snapLockRef = useRef({
        ownerId: null,
        x: null,
        y: null,
    });
    const guideDebugContextRef = useRef({
        sessionId: null,
        interactionEpoch: null,
        elementId: null,
        tipo: null,
        isText: false,
    });
    const guideDecisionDebugRef = useRef({
        sessionId: null,
        winnerXKey: "none",
        winnerYKey: "none",
        lastDecisionAtMs: 0,
        rapidFlipCount: 0,
    });

    const resetSnapLocks = useCallback(() => {
        snapLockRef.current = {
            ownerId: null,
            x: null,
            y: null,
        };
    }, []);

    const publishGuideLines = useCallback((nextLines = []) => {
        if (typeof onGuideLinesChange === "function") {
            onGuideLinesChange(nextLines);
        }
    }, [onGuideLinesChange]);

    const commitGuideLines = useCallback((nextLines = []) => {
        const safeLines = Array.isArray(nextLines) ? nextLines : [];
        const nextSignature = buildGuideLinesSignature(safeLines);
        const previousSignature = lastGuideSignatureRef.current;

        if (nextSignature === previousSignature) {
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

        const guideDebugContext = guideDebugContextRef.current || {};
        maybeLogGuideDebug("guides:render-payload", {
            perfNowMs: roundGuideDebugNumber(getGuidePerfNow()),
            guideSessionId: guideDebugContext.sessionId || null,
            interactionEpoch: guideDebugContext.interactionEpoch,
            elementId: guideDebugContext.elementId || null,
            tipo: guideDebugContext.tipo || null,
            isText: guideDebugContext.isText === true,
            change:
                safeLines.length === 0
                    ? "cleared"
                    : previousSignature
                    ? "changed"
                    : "visible",
            linesCount: safeLines.length,
            lines: buildGuideLinesDebug(safeLines),
        }, {
            force: true,
        });

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
        resetSnapLocks();
        guideDebugContextRef.current = {
            sessionId: null,
            interactionEpoch: null,
            elementId: null,
            tipo: null,
            isText: false,
        };
        guideDecisionDebugRef.current = {
            sessionId: null,
            winnerXKey: "none",
            winnerYKey: "none",
            lastDecisionAtMs: 0,
            rapidFlipCount: 0,
        };
        commitGuideLines([]);
    }, [commitGuideLines, resetSnapLocks]);

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
    const effElementReleaseRadius = effElementMagnetRadius + 8;
    const effSectionReleaseRadius = effSectionMagnetRadius + 8;
    const snapLockMinMs = 120;
    const snapSoftReleaseMultiplier = 1.75;


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
    const getNodeBox = (node, stage, obj = null, options = {}) => {
        if (!node || !stage || typeof node.getClientRect !== "function") return null;

        const rectOpts = { relativeTo: stage };
        const useLivePoseOnly = options?.requireLivePoseOnly === true;
        const requireAuthoritativeTextRect =
            options?.requireAuthoritativeTextRect === true;
        const returnDetails = options?.returnDetails === true;
        const inputPosition = useLivePoseOnly
            ? null
            : normalizeGuideInputPosition(options?.inputPosition);
        const fallbackPose = inputPosition
            ? {
                x: inputPosition.x,
                y: inputPosition.y,
                rotation:
                    typeof node.rotation === "function"
                        ? node.rotation()
                        : obj?.rotation,
            }
            : null;

        let baseRect = null;

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

            baseRect = {
                x,
                y,
                width: Number(obj.width),
                height: Number(obj.height),
            };
        } else if (obj?.tipo === "galeria" && typeof node.findOne === "function") {
            // La galeria usa overlays por celda; medir su frame base evita offsets falsos.
            const galleryFrame = node.findOne(".gallery-transform-frame");
            if (galleryFrame && typeof galleryFrame.getClientRect === "function") {
                try {
                    baseRect = galleryFrame.getClientRect({
                        relativeTo: stage,
                        skipShadow: true,
                        skipStroke: true,
                    });
                } catch {
                    // fallback al rect completo
                }
            }
        }

        if (!baseRect) {
            try {
                baseRect = node.getClientRect(rectOpts);
            } catch {
                return null;
            }
        }

        const authoritativeTextRect = resolveAuthoritativeTextRect(node, obj, {
            fallbackRect: baseRect,
            fallbackPose,
        });
        if (authoritativeTextRect) {
            return returnDetails
                ? {
                    box: authoritativeTextRect,
                    geometrySource: "textRect",
                    usedInputPose: false,
                }
                : authoritativeTextRect;
        }

        if (obj?.tipo === "texto" && requireAuthoritativeTextRect) {
            return returnDetails
                ? {
                    box: null,
                    geometrySource: "fallback",
                    usedInputPose: false,
                  }
                : null;
        }

        if (!fallbackPose) {
            return returnDetails
                ? {
                    box: baseRect,
                    geometrySource: "live",
                    usedInputPose: false,
                }
                : baseRect;
        }

        const shiftedRect =
            shiftRectToCanonicalPose(baseRect, node, obj, fallbackPose) || baseRect;
        return returnDetails
            ? {
                box: shiftedRect,
                geometrySource: "fallback",
                usedInputPose: true,
            }
            : shiftedRect;
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

    const readActiveDragBox = ({ stage, node, objActual }) => (
        getNodeBox(node, stage, objActual, {
            requireLivePoseOnly: true,
            requireAuthoritativeTextRect: true,
            returnDetails: true,
        })
    );

    const readTextGuideGeometryDiagnostics = useCallback(({
        stage,
        node,
        objActual,
        authoritativeBox,
    }) => {
        if (
            objActual?.tipo !== "texto" ||
            !node ||
            !stage ||
            typeof node.getClientRect !== "function"
        ) {
            return null;
        }

        let contentBox = null;
        try {
            contentBox = node.getClientRect({
                relativeTo: stage,
                skipTransform: false,
                skipShadow: true,
                skipStroke: true,
            });
        } catch {
            contentBox = null;
        }

        const authoritativeTextRect = resolveAuthoritativeTextRect(node, objActual, {
            fallbackRect: contentBox || authoritativeBox,
        }) || authoritativeBox;

        return {
            guideBox: authoritativeBox || null,
            authoritativeTextBox: authoritativeTextRect || null,
            contentBox: contentBox || null,
            guideBoxDebug: buildGuideBoxDebug(authoritativeBox),
            authoritativeTextBoxDebug: buildGuideBoxDebug(authoritativeTextRect),
            contentBoxDebug: buildGuideBoxDebug(contentBox),
            guideVsAuthoritativeDelta: buildGuideBoxDelta(
                authoritativeBox,
                authoritativeTextRect
            ),
            guideVsContentDelta: buildGuideBoxDelta(
                authoritativeBox,
                contentBox
            ),
            authoritativeVsContentDelta: buildGuideBoxDelta(
                authoritativeTextRect,
                contentBox
            ),
        };
    }, []);

    // ---- Mostrar guías durante el drag ----
    const mostrarGuias = useCallback((guideRequestInput, legacyIdActual, legacyObjetos, legacyElementRefs) => {
        const isLegacyCall = typeof legacyElementRefs !== "undefined";
        const guideRequest = resolveGuideEvaluationRequest(
            guideRequestInput,
            isLegacyCall ? legacyIdActual : null
        );
        const idActual = guideRequest?.elementId || null;
        const objetos = isLegacyCall ? legacyObjetos : legacyIdActual;
        const elementRefs = isLegacyCall ? legacyElementRefs : legacyObjetos;
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
        if (
            !guideRequest ||
            guideRequest.dragMode !== "single-element" ||
            guideRequest.pipeline !== "individual"
        ) {
            clearGuideLines();
            finishPerf?.({
                reason: "guide-request-not-eligible",
                dragMode: guideRequest?.dragMode || null,
                pipeline: guideRequest?.pipeline || null,
                source: guideRequest?.source || null,
            });
            return null;
        }
        const node = elementRefs.current?.[idActual];
        if (!node) {
            finishPerf?.({ reason: "missing-node" });
            return null;
        }
        const stage = node.getStage?.();
        if (!stage) {
            finishPerf?.({ reason: "missing-stage" });
            return null;
        }

        try {
            const { byId: objById, bySection } = getObjectCache(objetos);
            const objActual = objById.get(idActual) || null;
            const guideSessionId = guideRequest.sessionId || idActual;
            const interactionEpoch = guideRequest.interactionEpoch ?? null;
            const isTextElement = objActual?.tipo === "texto";

            guideDebugContextRef.current = {
                sessionId: guideSessionId,
                interactionEpoch,
                elementId: idActual,
                tipo: objActual?.tipo || null,
                isText: isTextElement,
            };
            if (guideDecisionDebugRef.current.sessionId !== guideSessionId) {
                guideDecisionDebugRef.current = {
                    sessionId: guideSessionId,
                    winnerXKey: "none",
                    winnerYKey: "none",
                    lastDecisionAtMs: 0,
                    rapidFlipCount: 0,
                };
            }

            if (snapLockRef.current.ownerId !== idActual) {
                snapLockRef.current = {
                    ownerId: idActual,
                    x: null,
                    y: null,
                };
            }

            const normalizedInputPosition = normalizeGuideInputPosition(guideRequest.pos);
            const initialBoxInfo = readActiveDragBox({
                stage,
                node,
                objActual,
            });
            const initialBox = initialBoxInfo?.box || null;
            if (!initialBox) {
                finishPerf?.({ reason: "missing-self-box-before" });
                return null;
            }
            capturePerfPhase("selfBoxResolveMs");

            const preSnapTextDiagnostics = readTextGuideGeometryDiagnostics({
                stage,
                node,
                objActual,
                authoritativeBox: initialBox,
                inputPosition: normalizedInputPosition,
            });
            const forcePreSnapTextLog =
                shouldForceGuideGeometryLog({
                    delta: preSnapTextDiagnostics?.guideVsAuthoritativeDelta,
                }) ||
                shouldForceGuideGeometryLog({
                    delta: preSnapTextDiagnostics?.guideVsContentDelta,
                }) ||
                shouldForceGuideGeometryLog({
                    delta: preSnapTextDiagnostics?.authoritativeVsContentDelta,
                });

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
            const distSecX = Math.abs(
                initialBox.x + initialBox.width / 2 - secCx
            );
            const distSecY = Math.abs(
                initialBox.y + initialBox.height / 2 - secCy
            );

            // 2) ELEMENTOS (MISMA SECCIÓN): elegir mejor candidato por eje
            const { targets: sectionGuideTargets, cacheHit: guideCacheHit } = getSectionGuideTargets(
                stage,
                sectionItems,
                elementRefs,
                idActual,
                objById
            );
            capturePerfPhase("targetsLookupMs");

            const elementGuides = buildSameSectionGuides(initialBox, sectionGuideTargets);

            // One snapshot per evaluation frame keeps guide decisions and snap math
            // aligned to the same drag-time geometry sample.
            const dragSnapshot = {
                elementId: idActual,
                inputPosition: normalizedInputPosition,
                source: guideRequest.source || null,
                node,
                stage,
                objActual,
                selfBox: initialBox,
                selfCenterX: initialBox.x + initialBox.width / 2,
                selfCenterY: initialBox.y + initialBox.height / 2,
                seccion,
                sectionOffsetY: offY,
                sectionCenterX: secCx,
                sectionCenterY: secCy,
                sectionItems,
                sectionGuideTargets,
                guideCacheHit,
                elementGuides,
                distSecX,
                distSecY,
            };

            const bestElX = dragSnapshot.elementGuides
                .filter(g => g.axis === "x")
                .map(g => ({ g, dist: distForGuide("x", g.value, dragSnapshot.selfBox) }))
                .sort((a, b) => a.dist - b.dist)[0];

            const bestElY = dragSnapshot.elementGuides
                .filter(g => g.axis === "y")
                .map(g => ({ g, dist: distForGuide("y", g.value, dragSnapshot.selfBox) }))
                .sort((a, b) => a.dist - b.dist)[0];
            capturePerfPhase("guideBuildMs");

            const resolveLockedDecision = (axis, secDistCenter, bestEl) => {
                const axisLock = snapLockRef.current?.[axis];
                if (!axisLock) return null;
                const lockAgeMs = Number.isFinite(Number(axisLock.lockedAtMs))
                    ? getGuidePerfNow() - Number(axisLock.lockedAtMs)
                    : Infinity;
                const releaseMultiplier = lockAgeMs <= snapLockMinMs
                    ? snapSoftReleaseMultiplier
                    : 1;

                if (axisLock.source === "seccion") {
                    const releaseRadius =
                        Number(axisLock.releaseRadius || effSectionReleaseRadius) * releaseMultiplier;
                    if (secDistCenter <= releaseRadius) {
                        return {
                            source: "seccion",
                            locked: true,
                            lockAgeMs: roundGuideMetric(lockAgeMs),
                        };
                    }
                    return null;
                }

                const matchingGuide = dragSnapshot.elementGuides
                    .filter((guide) => guide.axis === axis)
                    .map((guide) => ({
                        g: guide,
                        dist: distForGuide(axis, guide.value, dragSnapshot.selfBox),
                    }))
                    .filter(({ g }) => (
                        g.type === axisLock.nearType &&
                        Math.abs((g.value ?? 0) - (axisLock.targetValue ?? 0)) <= 0.5
                    ))
                    .sort((a, b) => a.dist - b.dist)[0];

                const lockedDist = matchingGuide?.dist ?? (
                    Number.isFinite(Number(axisLock.targetValue))
                        ? distForGuide(axis, axisLock.targetValue, dragSnapshot.selfBox)
                        : Infinity
                );

                const releaseRadius =
                    Number(axisLock.releaseRadius || effElementReleaseRadius) * releaseMultiplier;

                if (!Number.isFinite(lockedDist) || lockedDist > releaseRadius) {
                    return null;
                }

                if (matchingGuide) {
                    return {
                        source: "elemento",
                        near: matchingGuide,
                        locked: true,
                        lockAgeMs: roundGuideMetric(lockAgeMs),
                    };
                }

                return {
                    source: "elemento",
                    near: bestEl || {
                        g: {
                            value: axisLock.targetValue,
                            type: axisLock.nearType || null,
                            targetBox: null,
                        },
                        dist: lockedDist,
                    },
                    locked: true,
                    lockAgeMs: roundGuideMetric(lockAgeMs),
                };
            };

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

            const decisionX = resolveLockedDecision("x", dragSnapshot.distSecX, bestElX)
                || decidirSnap(dragSnapshot.distSecX, bestElX);
            const decisionY = resolveLockedDecision("y", dragSnapshot.distSecY, bestElY)
                || decidirSnap(dragSnapshot.distSecY, bestElY);
            capturePerfPhase("decisionMs");

            const previousDecisionDebug = guideDecisionDebugRef.current || {};
            const nextWinnerXKey = buildGuideDecisionKey(decisionX);
            const nextWinnerYKey = buildGuideDecisionKey(decisionY);
            const changedX = previousDecisionDebug.winnerXKey !== nextWinnerXKey;
            const changedY = previousDecisionDebug.winnerYKey !== nextWinnerYKey;
            const decisionNowMs = getGuidePerfNow();
            const previousDecisionAtMs = Number(previousDecisionDebug.lastDecisionAtMs || 0);
            const decisionChanged = changedX || changedY;
            const rapidFlip =
                decisionChanged &&
                previousDecisionAtMs > 0 &&
                decisionNowMs - previousDecisionAtMs <= 120;
            const rapidFlipCount = decisionChanged
                ? (rapidFlip ? Number(previousDecisionDebug.rapidFlipCount || 0) + 1 : 0)
                : Number(previousDecisionDebug.rapidFlipCount || 0);
            const thresholdOscillationLikely = rapidFlip && (
                Boolean(snapLockRef.current?.x) ||
                Boolean(snapLockRef.current?.y)
            );
            guideDecisionDebugRef.current = {
                sessionId: guideSessionId,
                winnerXKey: nextWinnerXKey,
                winnerYKey: nextWinnerYKey,
                lastDecisionAtMs: decisionChanged
                    ? decisionNowMs
                    : previousDecisionAtMs,
                rapidFlipCount,
            };

            maybeLogGuideDebug("guides:decision", {
                perfNowMs: roundGuideDebugNumber(decisionNowMs),
                guideSessionId,
                interactionEpoch,
                elementId: dragSnapshot.elementId,
                tipo: objActual?.tipo || null,
                isText: isTextElement,
                source: guideRequest.source || null,
                inputPosition: dragSnapshot.inputPosition || null,
                activeDragBox: buildGuideBoxDebug(dragSnapshot.selfBox),
                sectionId: dragSnapshot.seccion.id,
                sectionCenter: {
                    x: roundGuideDebugNumber(dragSnapshot.sectionCenterX),
                    y: roundGuideDebugNumber(dragSnapshot.sectionCenterY),
                },
                distSecX: roundGuideDebugNumber(dragSnapshot.distSecX),
                distSecY: roundGuideDebugNumber(dragSnapshot.distSecY),
                bestElXDist: roundGuideDebugNumber(bestElX?.dist),
                bestElYDist: roundGuideDebugNumber(bestElY?.dist),
                winnerChangedX: changedX,
                winnerChangedY: changedY,
                rapidFlip,
                rapidFlipCount,
                thresholdOscillationLikely,
                snapLockXActive: Boolean(snapLockRef.current?.x),
                snapLockYActive: Boolean(snapLockRef.current?.y),
                winnerX: buildGuideDecisionDebug(decisionX),
                winnerY: buildGuideDecisionDebug(decisionY),
            }, {
                sampleKey: `guides:decision:${guideSessionId}`,
                firstCount: 5,
                throttleMs: 120,
                force: decisionChanged || rapidFlip || forcePreSnapTextLog,
            });

            if (isTextElement) {
                const preSnapAuthorityCheck = evaluateTextGeometryContractRectAlignment(
                    preSnapTextDiagnostics?.authoritativeTextBox,
                    dragSnapshot.selfBox,
                    {
                        tolerance: 0.5,
                        expectedLabel: "authoritative Konva text rect",
                        actualLabel: "guide evaluation box",
                    }
                );

                logTextGeometryContractInvariant(
                    "snap-preapply-text-authority",
                    {
                        phase: "drag-pre-snap",
                        surface: "snap-system",
                        authoritySource: "live-konva-text",
                        sessionIdentity: guideSessionId,
                        elementId: dragSnapshot.elementId,
                        tipo: objActual?.tipo || null,
                        pass: preSnapAuthorityCheck.pass,
                        failureReason: preSnapAuthorityCheck.failureReason,
                        observedRects: {
                            guideEvaluationRect:
                                buildTextGeometryContractRect(dragSnapshot.selfBox),
                            authoritativeKonvaRect:
                                buildTextGeometryContractRect(
                                    preSnapTextDiagnostics?.authoritativeTextBox
                                ),
                            renderedTextRect:
                                buildTextGeometryContractRect(
                                    preSnapTextDiagnostics?.contentBox
                                ),
                        },
                        observedSources: {
                            snapAuthoritative: false,
                            source: guideRequest.source || null,
                            winnerX: decisionX?.source || "none",
                            winnerY: decisionY?.source || "none",
                        },
                        delta: preSnapAuthorityCheck.delta,
                    },
                    {
                        sampleKey: `text-contract:snap-pre:${guideSessionId}`,
                        firstCount: 4,
                        throttleMs: 120,
                        force:
                            !preSnapAuthorityCheck.pass ||
                            forcePreSnapTextLog ||
                            decisionChanged,
                    }
                );

                maybeLogGuideDebug("guides:text-geometry", {
                    perfNowMs: roundGuideDebugNumber(getGuidePerfNow()),
                    guideSessionId,
                    interactionEpoch,
                    phase: "pre-snap",
                    elementId: dragSnapshot.elementId,
                    tipo: objActual?.tipo || null,
                    activeDragBox: buildGuideBoxDebug(dragSnapshot.selfBox),
                guideBox: preSnapTextDiagnostics?.guideBoxDebug || null,
                guideGeometrySource: initialBoxInfo?.geometrySource || "fallback",
                authoritativeTextBox:
                    preSnapTextDiagnostics?.authoritativeTextBoxDebug || null,
                    renderedTextContentBox:
                        preSnapTextDiagnostics?.contentBoxDebug || null,
                    guideVsAuthoritativeDelta:
                        preSnapTextDiagnostics?.guideVsAuthoritativeDelta || null,
                    guideVsContentDelta:
                        preSnapTextDiagnostics?.guideVsContentDelta || null,
                    authoritativeVsContentDelta:
                        preSnapTextDiagnostics?.authoritativeVsContentDelta || null,
                    winnerX: buildGuideDecisionDebug(decisionX),
                    winnerY: buildGuideDecisionDebug(decisionY),
                }, {
                    sampleKey: `guides:text-geometry:pre:${guideSessionId}`,
                    firstCount: 4,
                    throttleMs: 120,
                    force:
                        forcePreSnapTextLog ||
                        decisionX?.source === "seccion" ||
                        decisionY?.source === "seccion" ||
                        decisionChanged,
                });
            }

            trackCanvasDragPerf("guides:snapshot", {
                elementId: dragSnapshot.elementId,
                pipeline: guideRequest.pipeline,
                source: dragSnapshot.source || null,
                sectionId: dragSnapshot.seccion.id,
                inputX: roundGuideMetric(dragSnapshot.inputPosition?.x),
                inputY: roundGuideMetric(dragSnapshot.inputPosition?.y),
                selfBoxX: roundGuideMetric(dragSnapshot.selfBox.x),
                selfBoxY: roundGuideMetric(dragSnapshot.selfBox.y),
                selfBoxWidth: roundGuideMetric(dragSnapshot.selfBox.width),
                selfBoxHeight: roundGuideMetric(dragSnapshot.selfBox.height),
                sectionCandidates: dragSnapshot.sectionItems.length,
                sectionGuideTargetsCount: dragSnapshot.sectionGuideTargets.length,
                elementGuidesCount: dragSnapshot.elementGuides.length,
                guideCacheHit: dragSnapshot.guideCacheHit,
                distSecX: roundGuideMetric(dragSnapshot.distSecX),
                distSecY: roundGuideMetric(dragSnapshot.distSecY),
                bestElXDist: roundGuideMetric(bestElX?.dist),
                bestElYDist: roundGuideMetric(bestElY?.dist),
                decisionX: decisionX?.source || "none",
                decisionY: decisionY?.source || "none",
            }, {
                throttleMs: 120,
                throttleKey: `guides:snapshot:${dragSnapshot.elementId}`,
            });

            const finishSnapPerf = startCanvasDragPerfSpan("guides:snap-apply", {
                elementId: idActual,
                sectionId: seccion.id,
                pipeline: guideRequest.pipeline,
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
                const boxBeforeSnap = dragSnapshot.selfBox;

                if (decision.source === "seccion") {
                    const nextCenter = axis === "x"
                        ? boxBeforeSnap.x + boxBeforeSnap.width / 2
                        : boxBeforeSnap.y + boxBeforeSnap.height / 2;
                    const targetCenter = axis === "x"
                        ? dragSnapshot.sectionCenterX
                        : dragSnapshot.sectionCenterY;
                    const distBefore = Math.abs(targetCenter - nextCenter);
                    const delta = (targetCenter - nextCenter) * effSectionSnapStrength;

                    if (axis === "x") {
                        node.x(node.x() + delta);
                    } else {
                        node.y(node.y() + delta);
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

                const delta = deltaForGuide(axis, decision.near.g.value, boxBeforeSnap);
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

            const updateSnapLock = (axis, snapRes, decision) => {
                if (!snapRes?.snapped) {
                    snapLockRef.current[axis] = null;
                    return;
                }

                const previousLock = snapLockRef.current?.[axis] || null;
                const nextTargetValue = snapRes.targetValue ?? null;
                const nextNearType = snapRes.nearType || decision?.near?.g?.type || null;
                const sameLock =
                    previousLock &&
                    previousLock.source === snapRes.source &&
                    previousLock.nearType === nextNearType &&
                    (
                        (previousLock.targetValue == null && nextTargetValue == null) ||
                        (
                            previousLock.targetValue != null &&
                            nextTargetValue != null &&
                            Math.abs(Number(previousLock.targetValue) - Number(nextTargetValue)) <= 0.5
                        )
                    );
                const lockedAtMs = sameLock && Number.isFinite(Number(previousLock?.lockedAtMs))
                    ? Number(previousLock.lockedAtMs)
                    : getGuidePerfNow();

                if (snapRes.source === "seccion") {
                    snapLockRef.current[axis] = {
                        source: "seccion",
                        targetValue: nextTargetValue,
                        nearType: null,
                        releaseRadius: effSectionReleaseRadius,
                        lockedAtMs,
                    };
                    return;
                }

                snapLockRef.current[axis] = {
                    source: "elemento",
                    targetValue: nextTargetValue,
                    nearType: nextNearType,
                    releaseRadius: effElementReleaseRadius,
                    lockedAtMs,
                };
            };

            updateSnapLock("x", snapResX, decisionX);
            updateSnapLock("y", snapResY, decisionY);

            // Re-read once after snap so the rendered guide geometry matches the
            // actual snapped node position for this evaluation frame.
            const postSnapBoxInfo = readActiveDragBox({
                stage,
                node,
                objActual,
            });
            const postSnapBox = postSnapBoxInfo?.box || null;
            if (!postSnapBox) {
                finishPerf?.({ reason: "missing-self-box-after" });
                return null;
            }
            const postSnapTextDiagnostics = readTextGuideGeometryDiagnostics({
                stage,
                node,
                objActual,
                authoritativeBox: postSnapBox,
            });
            const selfCxAfter = postSnapBox.x + postSnapBox.width / 2;
            const selfCyAfter = postSnapBox.y + postSnapBox.height / 2;
            const computeSnapAfterDistance = (axis, snapRes) => {
                if (!snapRes?.snapped) return null;
                if (snapRes.source === "seccion") {
                    const nextCenter = axis === "x" ? selfCxAfter : selfCyAfter;
                    const targetCenter = axis === "x"
                        ? dragSnapshot.sectionCenterX
                        : dragSnapshot.sectionCenterY;
                    return roundGuideMetric(Math.abs(nextCenter - targetCenter));
                }
                if (snapRes.source === "elemento" && snapRes.targetValue != null) {
                    return roundGuideMetric(
                        distForGuide(axis, snapRes.targetValue, postSnapBox)
                    );
                }
                return null;
            };

            

                
            
            // 2) SECCIÓN: mostrar guía SOLO cuando quedó efectivamente alineado.
            if (
                snapResX.snapped &&
                snapResX.source === "seccion" &&
                Math.abs(selfCxAfter - dragSnapshot.sectionCenterX) <= sectionLineTolerance
            ) {
                lines.push({
                    type: "seccion-cx",
                    priority: "seccion",
                    style: "solid",
                    points: [
                        dragSnapshot.sectionCenterX,
                        dragSnapshot.sectionOffsetY,
                        dragSnapshot.sectionCenterX,
                        dragSnapshot.sectionOffsetY + dragSnapshot.seccion.altura
                    ]
                });
            }
            if (
                snapResY.snapped &&
                snapResY.source === "seccion" &&
                Math.abs(selfCyAfter - dragSnapshot.sectionCenterY) <= sectionLineTolerance
            ) {
                lines.push({
                    type: "seccion-cy",
                    priority: "seccion",
                    style: "solid",
                    points: [0, dragSnapshot.sectionCenterY, anchoCanvas, dragSnapshot.sectionCenterY]
                });
            }

            if (snapResX.snapped && snapResX.source === "elemento" && snapResX.near?.g?.targetBox) {
                lines.push({
                    type: "reach-x",
                    priority: "elemento",
                    style: "dashed",
                    points: reachVertical(snapResX.near.g.value, postSnapBox, snapResX.near.g.targetBox)
                });
            }
            if (snapResY.snapped && snapResY.source === "elemento" && snapResY.near?.g?.targetBox) {
                lines.push({
                    type: "reach-y",
                    priority: "elemento",
                    style: "dashed",
                    points: reachHorizontal(snapResY.near.g.value, postSnapBox, snapResY.near.g.targetBox)
                });
            }
            capturePerfPhase("lineBuildMs");

            if (decisionX || decisionY) {
                finishSnapPerf?.({
                    sectionId: seccion.id,
                    pipeline: guideRequest.pipeline,
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

            const postSnapBoxDelta = buildGuideBoxDelta(
                dragSnapshot.selfBox,
                postSnapBox
            );
            const snapBecameAuthoritative =
                Boolean(snapResX?.snapped) || Boolean(snapResY?.snapped);
            const snapMovedNode =
                Math.abs(Number(postSnapBoxDelta?.dx || 0)) > 0.01 ||
                Math.abs(Number(postSnapBoxDelta?.dy || 0)) > 0.01 ||
                Math.abs(Number(postSnapBoxDelta?.dCenterX || 0)) > 0.01 ||
                Math.abs(Number(postSnapBoxDelta?.dCenterY || 0)) > 0.01;
            const xDistAfter = computeSnapAfterDistance("x", snapResX);
            const yDistAfter = computeSnapAfterDistance("y", snapResY);
            const forcePostSnapTextLog =
                shouldForceGuideGeometryLog({
                    delta: postSnapTextDiagnostics?.guideVsAuthoritativeDelta,
                }) ||
                shouldForceGuideGeometryLog({
                    delta: postSnapTextDiagnostics?.guideVsContentDelta,
                }) ||
                shouldForceGuideGeometryLog({
                    delta: postSnapTextDiagnostics?.authoritativeVsContentDelta,
                });

            maybeLogGuideDebug("guides:snap-result", {
                perfNowMs: roundGuideDebugNumber(getGuidePerfNow()),
                guideSessionId,
                interactionEpoch,
                elementId: dragSnapshot.elementId,
                tipo: objActual?.tipo || null,
                isText: isTextElement,
                source: guideRequest.source || null,
                preSnapBox: buildGuideBoxDebug(dragSnapshot.selfBox),
                postSnapBox: buildGuideBoxDebug(postSnapBox),
                preSnapGeometrySource: initialBoxInfo?.geometrySource || "fallback",
                postSnapGeometrySource: postSnapBoxInfo?.geometrySource || "fallback",
                geometrySourceChanged:
                    (initialBoxInfo?.geometrySource || "fallback") !==
                    (postSnapBoxInfo?.geometrySource || "fallback"),
                preToPostDelta: postSnapBoxDelta,
                snapX: buildGuideSnapDebug(snapResX, xDistAfter),
                snapY: buildGuideSnapDebug(snapResY, yDistAfter),
                winnerX: buildGuideDecisionDebug(decisionX),
                winnerY: buildGuideDecisionDebug(decisionY),
                linesPlanned: buildGuideLinesDebug(lines),
                rapidFlip,
                rapidFlipCount,
                thresholdOscillationLikely,
                snapLockXActive: Boolean(snapLockRef.current?.x),
                snapLockYActive: Boolean(snapLockRef.current?.y),
            }, {
                sampleKey: `guides:snap-result:${guideSessionId}`,
                firstCount: 5,
                throttleMs: 120,
                force:
                    decisionChanged ||
                    rapidFlip ||
                    snapResX.source === "seccion" ||
                    snapResY.source === "seccion",
            });

            if (isTextElement) {
                const postSnapAuthorityCheck = evaluateTextGeometryContractRectAlignment(
                    postSnapTextDiagnostics?.authoritativeTextBox,
                    postSnapBox,
                    {
                        tolerance: 0.5,
                        expectedLabel: "post-snap authoritative Konva text rect",
                        actualLabel: "post-snap guide reread box",
                    }
                );
                const stalePreSnapFailureReason =
                    snapBecameAuthoritative &&
                    !postSnapAuthorityCheck.pass &&
                    (
                        Math.abs(Number(postSnapBoxDelta?.dx || 0)) > 0.5 ||
                        Math.abs(Number(postSnapBoxDelta?.dy || 0)) > 0.5 ||
                        Math.abs(Number(postSnapBoxDelta?.dCenterX || 0)) > 0.5 ||
                        Math.abs(Number(postSnapBoxDelta?.dCenterY || 0)) > 0.5
                    )
                        ? `${postSnapAuthorityCheck.failureReason}; snap committed but post-snap reread still diverged from authoritative Konva text rect`
                        : postSnapAuthorityCheck.failureReason;

                logTextGeometryContractInvariant(
                    "snap-postapply-reread-authority",
                    {
                        phase: "drag-post-snap",
                        surface: "snap-system",
                        authoritySource: snapBecameAuthoritative
                            ? "post-snap-reread"
                            : "live-konva-text",
                        sessionIdentity: guideSessionId,
                        elementId: dragSnapshot.elementId,
                        tipo: objActual?.tipo || null,
                        pass: postSnapAuthorityCheck.pass,
                        failureReason: stalePreSnapFailureReason,
                        observedRects: {
                            preSnapRect:
                                buildTextGeometryContractRect(dragSnapshot.selfBox),
                            postSnapGuideRect:
                                buildTextGeometryContractRect(postSnapBox),
                            authoritativeKonvaRect:
                                buildTextGeometryContractRect(
                                    postSnapTextDiagnostics?.authoritativeTextBox
                                ),
                            renderedTextRect:
                                buildTextGeometryContractRect(
                                    postSnapTextDiagnostics?.contentBox
                                ),
                        },
                        observedSources: {
                            snapAuthoritative: snapBecameAuthoritative,
                            source: guideRequest.source || null,
                            winnerX: decisionX?.source || "none",
                            winnerY: decisionY?.source || "none",
                            snapXSource: snapResX?.source || "none",
                            snapYSource: snapResY?.source || "none",
                            rapidFlip,
                            rapidFlipCount,
                            thresholdOscillationLikely,
                        },
                        delta: postSnapAuthorityCheck.delta,
                        preToPostDelta: postSnapBoxDelta,
                    },
                    {
                        sampleKey: `text-contract:snap-post:${guideSessionId}`,
                        firstCount: 4,
                        throttleMs: 120,
                        force:
                            !postSnapAuthorityCheck.pass ||
                            snapBecameAuthoritative ||
                            forcePostSnapTextLog ||
                            rapidFlip,
                    }
                );

                recordTextGeometryContractSnapshot(guideSessionId || dragSnapshot.elementId, {
                    type: "snap-postapply-reread",
                    guideSessionId,
                    elementId: dragSnapshot.elementId,
                    interactionEpoch,
                    source: guideRequest.source || null,
                    snapCommitted: snapBecameAuthoritative,
                    winnerX: decisionX?.source || "none",
                    winnerY: decisionY?.source || "none",
                    snapXSource: snapResX?.source || "none",
                    snapYSource: snapResY?.source || "none",
                    rapidFlip,
                    rapidFlipCount,
                    thresholdOscillationLikely,
                    preSnapRect: buildTextGeometryContractRect(dragSnapshot.selfBox),
                    snapAppliedRect: buildTextGeometryContractRect(postSnapBox),
                    postRereadAuthoritativeRect: buildTextGeometryContractRect(
                        postSnapTextDiagnostics?.authoritativeTextBox
                    ),
                    renderedVisibleTextRect: buildTextGeometryContractRect(
                        postSnapTextDiagnostics?.contentBox
                    ),
                    preToPostDelta: postSnapBoxDelta,
                    deltaToAuthoritative: postSnapAuthorityCheck.delta,
                });
                recordTextGeometryContractSnapshot(dragSnapshot.elementId, {
                    type: "snap-postapply-reread",
                    guideSessionId,
                    elementId: dragSnapshot.elementId,
                    interactionEpoch,
                    source: guideRequest.source || null,
                    snapCommitted: snapBecameAuthoritative,
                    winnerX: decisionX?.source || "none",
                    winnerY: decisionY?.source || "none",
                    snapXSource: snapResX?.source || "none",
                    snapYSource: snapResY?.source || "none",
                    rapidFlip,
                    rapidFlipCount,
                    thresholdOscillationLikely,
                    preSnapRect: buildTextGeometryContractRect(dragSnapshot.selfBox),
                    snapAppliedRect: buildTextGeometryContractRect(postSnapBox),
                    postRereadAuthoritativeRect: buildTextGeometryContractRect(
                        postSnapTextDiagnostics?.authoritativeTextBox
                    ),
                    renderedVisibleTextRect: buildTextGeometryContractRect(
                        postSnapTextDiagnostics?.contentBox
                    ),
                    preToPostDelta: postSnapBoxDelta,
                    deltaToAuthoritative: postSnapAuthorityCheck.delta,
                });

                maybeLogGuideDebug("guides:text-geometry", {
                    perfNowMs: roundGuideDebugNumber(getGuidePerfNow()),
                    guideSessionId,
                    interactionEpoch,
                    phase: "post-snap",
                    elementId: dragSnapshot.elementId,
                    tipo: objActual?.tipo || null,
                    activeDragBox: buildGuideBoxDebug(postSnapBox),
                    guideBox: postSnapTextDiagnostics?.guideBoxDebug || null,
                    guideGeometrySource: postSnapBoxInfo?.geometrySource || "fallback",
                    authoritativeTextBox:
                        postSnapTextDiagnostics?.authoritativeTextBoxDebug || null,
                    renderedTextContentBox:
                        postSnapTextDiagnostics?.contentBoxDebug || null,
                    guideVsAuthoritativeDelta:
                        postSnapTextDiagnostics?.guideVsAuthoritativeDelta || null,
                    guideVsContentDelta:
                        postSnapTextDiagnostics?.guideVsContentDelta || null,
                    authoritativeVsContentDelta:
                        postSnapTextDiagnostics?.authoritativeVsContentDelta || null,
                    preToPostDelta: postSnapBoxDelta,
                    snapX: buildGuideSnapDebug(snapResX, xDistAfter),
                    snapY: buildGuideSnapDebug(snapResY, yDistAfter),
                }, {
                    sampleKey: `guides:text-geometry:post:${guideSessionId}`,
                    firstCount: 4,
                    throttleMs: 120,
                    force:
                        forcePostSnapTextLog ||
                        forcePreSnapTextLog ||
                        snapResX.source === "seccion" ||
                        snapResY.source === "seccion" ||
                        rapidFlip,
                });
            }

            const commitStartedAt = getGuidePerfNow();
            commitGuideLines(lines);
            perfBreakdown.commitEnqueueMs = roundGuideMetric(getGuidePerfNow() - commitStartedAt);
            finishPerf?.({
                pipeline: guideRequest.pipeline,
                source: guideRequest.source || null,
                lines: lines.length,
                sectionId: seccion.id,
                guideCacheHit,
                snapXSource: snapResX.source || "none",
                snapYSource: snapResY.source || "none",
                totalElapsedMs: roundGuideMetric(getGuidePerfNow() - perfStartedAt),
                ...perfBreakdown,
            });
            return {
                guideSessionId,
                interactionEpoch,
                elementId: dragSnapshot.elementId,
                snapCommitted: snapBecameAuthoritative,
                snapMovedNode,
                preSnapGeometrySource: initialBoxInfo?.geometrySource || "fallback",
                postSnapGeometrySource: postSnapBoxInfo?.geometrySource || "fallback",
                snapXSource: snapResX.source || "none",
                snapYSource: snapResY.source || "none",
                rapidFlip,
                rapidFlipCount,
                thresholdOscillationLikely,
                preToPostDelta: postSnapBoxDelta,
            };
        } catch (e) {
            finishPerf?.({
                reason: "error",
                message: e?.message || String(e),
                totalElapsedMs: roundGuideMetric(getGuidePerfNow() - perfStartedAt),
                ...perfBreakdown,
            });
            // silencioso para no cortar el drag
            return null;
        }
    }, [
        anchoCanvas, altoCanvas,
        magnetRadius, sectionShowRadius, snapStrength,
        seccionesOrdenadas,
        calcularOffsetSeccion, getSectionById,
        elementMagnetRadius, sectionMagnetRadius, sectionPriorityBias,
        sectionSnapStrength, elementSnapStrength, sectionLineTolerance,
        clearGuideLines, commitGuideLines, getObjectCache, getSectionGuideTargets,
        readTextGuideGeometryDiagnostics,
        effElementReleaseRadius, effSectionReleaseRadius,
        snapLockMinMs, snapSoftReleaseMultiplier
    ]);

    const prepararGuias = useCallback((guideRequestInput, objetos, elementRefs) => {
        const guideRequest = resolveGuideEvaluationRequest(
            guideRequestInput,
            typeof guideRequestInput === "string" ? guideRequestInput : null
        );
        const idActual = guideRequest?.elementId || null;
        if (
            !guideRequest ||
            guideRequest.dragMode !== "single-element" ||
            guideRequest.pipeline !== "individual"
        ) {
            return;
        }
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
                source: guideRequest.source || null,
                sectionId: objActual.seccionId,
                sectionCandidates: sectionItems.length,
                targets: targets.length,
            }, {
                throttleMs: 180,
                throttleKey: `guides:prewarm:${idActual}`,
            });

            maybeLogGuideDebug("guides:prewarm", {
                perfNowMs: roundGuideDebugNumber(getGuidePerfNow()),
                guideSessionId: guideRequest.sessionId || idActual,
                interactionEpoch: guideRequest.interactionEpoch ?? null,
                elementId: idActual,
                tipo: objActual?.tipo || null,
                isText: objActual?.tipo === "texto",
                source: guideRequest.source || null,
                sectionId: objActual.seccionId,
                sectionCandidates: sectionItems.length,
                targets: targets.length,
            }, {
                sampleKey: `guides:prewarm:${guideRequest.sessionId || idActual}`,
                firstCount: 2,
                throttleMs: 180,
            });
        } catch {
            // silencioso para no cortar el drag
        }
    }, [getObjectCache, getSectionGuideTargets]);

    const limpiarGuias = useCallback(() => clearGuideLines(), [clearGuideLines]);

    return {
        prepararGuias,
        mostrarGuias,
        limpiarGuias
    };
}
