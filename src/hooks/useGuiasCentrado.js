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
import {
    resolveNodeSelectionRect,
} from "@/components/editor/textSystem/render/konva/selectionBoundsGeometry";
import {
    GUIDE_RELATIONS,
    buildReachGuideSegments,
    chooseGuideAxisDecision,
    getGuideAxisAnchors,
    resolveCanvasDistanceForScreenPx,
    resolveExactSectionSnapDelta,
    resolveLockedGuideDecision,
    selectGuideCandidatesByAxis,
    shouldBypassGuideSnap,
} from "@/lib/editorAlignmentGuides";

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
        line?.semantic || "",
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
        modifierState: isObjectInput ? (input.modifierState ?? null) : null,
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
    visualScale = 1,
    magnetRadius = 16,       // distancia para activar el snap
    elementMagnetRadius = null,   // null => magnetRadius
    sectionMagnetRadius = null,   // null => magnetRadius
    sectionPriorityBias = 4,      // ventaja extra para que gane sección vs elementos
    sectionLineTolerance = 0.75,  // solo mostrar guía de sección cuando está realmente centrado
    seccionesOrdenadas = [],
    onGuideLinesChange = null,
}) {
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
        ownerSessionId: null,
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
            ownerSessionId: null,
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

        lastGuideSignatureRef.current = nextSignature;
        trackCanvasDragPerf("guides:commit", {
            lines: safeLines.length,
            signatureSize: nextSignature.length,
        }, {
            throttleMs: 180,
            throttleKey: "guides:commit",
        });
        publishGuideLines(safeLines);
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
        resetSnapLocks();
        lastGuideSignatureRef.current = "";
        publishGuideLines([]);
    }, [publishGuideLines, resetSnapLocks]);

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


    const effElementMagnetRadius = resolveCanvasDistanceForScreenPx(
        elementMagnetRadius ?? magnetRadius,
        visualScale
    );
    const effSectionMagnetRadius = resolveCanvasDistanceForScreenPx(
        sectionMagnetRadius ?? magnetRadius,
        visualScale
    );
    const effSectionPriorityBias = resolveCanvasDistanceForScreenPx(
        sectionPriorityBias,
        visualScale
    );
    const releasePadding = resolveCanvasDistanceForScreenPx(8, visualScale);
    const effElementReleaseRadius = effElementMagnetRadius + releasePadding;
    const effSectionReleaseRadius = effSectionMagnetRadius + releasePadding;
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

    // ---- Candidatos de la MISMA sección (centros + bordes) ----
    const getNodeBox = (node, stage, obj = null, options = {}) => {
        if (!node || !stage || typeof node.getClientRect !== "function") return null;

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

        let geometryFamily = null;

        if (!baseRect) {
            baseRect = resolveNodeSelectionRect(obj, node, {
                phase: "drag",
                surface: "guide-geometry",
                caller: "useGuiasCentrado:getNodeBox",
                requireLiveNodes: true,
                relativeTo: stage,
            });
            if (baseRect) {
                geometryFamily =
                    obj?.tipo === "texto"
                        ? "authoritative-text-rect"
                        : "selection-live-rect";
            } else {
                if (obj?.tipo === "texto") {
                    const guideSessionId =
                        options?.sessionIdentity ||
                        guideDebugContextRef.current?.sessionId ||
                        obj?.id ||
                        null;
                    logTextGeometryContractInvariant(
                        "guide-text-authority-source",
                        {
                            phase: "drag",
                            surface: "snap-system",
                            authoritySource: "authoritative-text-required",
                            sessionIdentity: guideSessionId,
                            guideSessionId,
                            elementId: obj?.id || null,
                            tipo: obj?.tipo || null,
                            pass: false,
                            failureReason:
                                "guide geometry could not resolve the authoritative text rect; generic client rect fallback is disabled for text guides",
                            observedRects: {
                                guideEvaluationRect: null,
                            },
                            observedSources: {
                                requireAuthoritativeTextRect:
                                    requireAuthoritativeTextRect === true,
                                requireLivePoseOnly: useLivePoseOnly,
                            },
                        },
                        {
                            sampleKey: `text-contract:guide-source:${
                                guideSessionId || obj?.id || "unknown"
                            }`,
                            firstCount: 4,
                            throttleMs: 120,
                            force: true,
                        }
                    );
                    return returnDetails
                        ? {
                            box: null,
                            geometrySource: "authoritative-text-missing",
                            geometryFamily: "authoritative-text-required",
                            usedInputPose: false,
                        }
                        : null;
                }
                try {
                    baseRect = node.getClientRect({
                        relativeTo: stage,
                        skipShadow: true,
                        skipStroke: true,
                    });
                    geometryFamily = "client-rect-stage";
                } catch {
                    return null;
                }
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
                    geometryFamily: "authoritative-text-rect",
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
                    geometrySource:
                        geometryFamily === "authoritative-text-rect"
                            ? "textRect"
                            : "live",
                    geometryFamily: geometryFamily || "selection-live-rect",
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
                geometryFamily: geometryFamily
                    ? `${geometryFamily}+input-pose-shift`
                    : "client-rect-stage+input-pose-shift",
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
        return selectGuideCandidatesByAxis(selfBox, guideTargets, {
            limitPerAxis: 3,
        });
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
        if (shouldBypassGuideSnap(guideRequest.modifierState)) {
            clearGuideLines();
            finishPerf?.({ reason: "desktop-modifier-bypass" });
            return {
                elementId: idActual,
                snapCommitted: false,
                snapMovedNode: false,
                snapXSource: "none",
                snapYSource: "none",
                bypassed: true,
            };
        }
        const node = elementRefs.current?.[idActual];
        if (!node) {
            clearGuideLines();
            finishPerf?.({ reason: "missing-node" });
            return null;
        }
        const stage = node.getStage?.();
        if (!stage) {
            clearGuideLines();
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

            if (
                snapLockRef.current.ownerId !== idActual ||
                snapLockRef.current.ownerSessionId !== guideSessionId
            ) {
                snapLockRef.current = {
                    ownerId: idActual,
                    ownerSessionId: guideSessionId,
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
                clearGuideLines();
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

            const elementCandidates = buildSameSectionGuides(
                initialBox,
                sectionGuideTargets
            );
            const elementGuides = elementCandidates.all;

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

            const bestElX = elementCandidates.x[0]
                ? {
                    g: elementCandidates.x[0],
                    dist: elementCandidates.x[0].match.distance,
                }
                : null;
            const bestElY = elementCandidates.y[0]
                ? {
                    g: elementCandidates.y[0],
                    dist: elementCandidates.y[0].match.distance,
                }
                : null;
            capturePerfPhase("guideBuildMs");

            const resolveAxisDecision = (axis, sectionDistance, bestElement) => (
                resolveLockedGuideDecision({
                    axis,
                    lock: snapLockRef.current?.[axis],
                    selfBox: dragSnapshot.selfBox,
                    targets: dragSnapshot.sectionGuideTargets,
                    sectionDistance,
                    sectionReleaseRadius: effSectionReleaseRadius,
                    elementReleaseRadius: effElementReleaseRadius,
                    nowMs: getGuidePerfNow(),
                    lockMinMs: snapLockMinMs,
                    softReleaseMultiplier: snapSoftReleaseMultiplier,
                }) || chooseGuideAxisDecision({
                    sectionDistance,
                    bestElement,
                    sectionRadius: effSectionMagnetRadius,
                    elementRadius: effElementMagnetRadius,
                    sectionPriorityBias: effSectionPriorityBias,
                })
            );

            const decisionX = resolveAxisDecision(
                "x",
                dragSnapshot.distSecX,
                bestElX
            );
            const decisionY = resolveAxisDecision(
                "y",
                dragSnapshot.distSecY,
                bestElY
            );
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
                activeDragGeometrySource: initialBoxInfo?.geometrySource || "fallback",
                activeDragGeometryFamily: initialBoxInfo?.geometryFamily || null,
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
                guideGeometryFamily: initialBoxInfo?.geometryFamily || null,
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
                geometrySource: initialBoxInfo?.geometrySource || "fallback",
                geometryFamily: initialBoxInfo?.geometryFamily || null,
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
                    const delta = resolveExactSectionSnapDelta(
                        axis,
                        boxBeforeSnap,
                        targetCenter
                    );

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
                        strength: 1,
                        targetValue: roundGuideMetric(targetCenter),
                        nearType: null,
                    };
                }

                const delta = Number(decision?.near?.g?.match?.delta);
                if (!Number.isFinite(delta)) {
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
                if (axis === "x") node.x(node.x() + delta);
                else node.y(node.y() + delta);
                return {
                    snapped: true,
                    source: "elemento",
                    axis,
                    deltaApplied: roundGuideMetric(delta),
                    distBefore: roundGuideMetric(decision?.near?.dist),
                    strength: 1,
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
                const nextTargetId = decision?.near?.g?.targetId || null;
                const nextTargetAnchorKind =
                    decision?.near?.g?.targetAnchorKind || null;
                const nextSelfAnchorKind =
                    decision?.near?.g?.selfAnchorKind || null;
                const sameLock =
                    previousLock &&
                    previousLock.source === snapRes.source &&
                    previousLock.nearType === nextNearType &&
                    previousLock.targetId === nextTargetId &&
                    previousLock.targetAnchorKind === nextTargetAnchorKind &&
                    previousLock.selfAnchorKind === nextSelfAnchorKind &&
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
                        targetId: null,
                        targetAnchorKind: null,
                        selfAnchorKind: null,
                        releaseRadius: effSectionReleaseRadius,
                        lockedAtMs,
                    };
                    return;
                }

                snapLockRef.current[axis] = {
                    source: "elemento",
                    targetValue: nextTargetValue,
                    nearType: nextNearType,
                    targetId: nextTargetId,
                    targetAnchorKind: nextTargetAnchorKind,
                    selfAnchorKind: nextSelfAnchorKind,
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
                clearGuideLines();
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
                    const selfAnchorKind = snapRes?.near?.g?.selfAnchorKind;
                    const selfAnchor = getGuideAxisAnchors(postSnapBox, axis).find(
                        (anchor) => anchor.kind === selfAnchorKind
                    );
                    return selfAnchor
                        ? roundGuideMetric(
                            Math.abs(selfAnchor.value - snapRes.targetValue)
                        )
                        : null;
                }
                return null;
            };
            const xDistAfter = computeSnapAfterDistance("x", snapResX);
            const yDistAfter = computeSnapAfterDistance("y", snapResY);

            

                
            
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
                    semantic: GUIDE_RELATIONS.SECTION_CENTER,
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
                    semantic: GUIDE_RELATIONS.SECTION_CENTER,
                    points: [0, dragSnapshot.sectionCenterY, anchoCanvas, dragSnapshot.sectionCenterY]
                });
            }

            if (
                snapResX.snapped &&
                snapResX.source === "elemento" &&
                snapResX.near?.g?.targetBox &&
                xDistAfter != null &&
                Number(xDistAfter) <= sectionLineTolerance
            ) {
                const guide = snapResX.near.g;
                buildReachGuideSegments({
                    axis: "x",
                    coordinate: guide.value,
                    selfBox: postSnapBox,
                    targetBox: guide.targetBox,
                    gap: resolveCanvasDistanceForScreenPx(6, visualScale),
                    exteriorLength: resolveCanvasDistanceForScreenPx(12, visualScale),
                }).forEach((points) => lines.push({
                    type: "reach-x",
                    priority: "elemento",
                    style: guide.style,
                    semantic: guide.semantic,
                    points,
                }));
            }
            if (
                snapResY.snapped &&
                snapResY.source === "elemento" &&
                snapResY.near?.g?.targetBox &&
                yDistAfter != null &&
                Number(yDistAfter) <= sectionLineTolerance
            ) {
                const guide = snapResY.near.g;
                buildReachGuideSegments({
                    axis: "y",
                    coordinate: guide.value,
                    selfBox: postSnapBox,
                    targetBox: guide.targetBox,
                    gap: resolveCanvasDistanceForScreenPx(6, visualScale),
                    exteriorLength: resolveCanvasDistanceForScreenPx(12, visualScale),
                }).forEach((points) => lines.push({
                    type: "reach-y",
                    priority: "elemento",
                    style: guide.style,
                    semantic: guide.semantic,
                    points,
                }));
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
                    xDistAfter,
                    yDistAfter,
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
                preSnapGeometryFamily: initialBoxInfo?.geometryFamily || null,
                postSnapGeometryFamily: postSnapBoxInfo?.geometryFamily || null,
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
                    guideGeometryFamily: postSnapBoxInfo?.geometryFamily || null,
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
                preSnapGeometryFamily: initialBoxInfo?.geometryFamily || null,
                postSnapGeometryFamily: postSnapBoxInfo?.geometryFamily || null,
                snapXSource: snapResX.source || "none",
                snapYSource: snapResY.source || "none",
                rapidFlip,
                rapidFlipCount,
                thresholdOscillationLikely,
                preToPostDelta: postSnapBoxDelta,
            };
        } catch (e) {
            clearGuideLines();
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
        anchoCanvas, visualScale,
        magnetRadius,
        seccionesOrdenadas,
        calcularOffsetSeccion, getSectionById,
        elementMagnetRadius, sectionMagnetRadius, sectionPriorityBias,
        sectionLineTolerance,
        clearGuideLines, commitGuideLines, getObjectCache, getSectionGuideTargets,
        readTextGuideGeometryDiagnostics,
        effElementMagnetRadius, effSectionMagnetRadius,
        effElementReleaseRadius, effSectionReleaseRadius,
        effSectionPriorityBias,
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
