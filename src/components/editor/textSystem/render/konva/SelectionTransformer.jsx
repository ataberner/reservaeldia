// SelectionBounds.jsx
import { useEffect, useRef, useState } from "react";
import { Transformer, Rect, Group, Text } from "react-konva";
import SelectionBoundsIndicator from "@/components/editor/textSystem/render/konva/SelectionBoundsIndicator";
import {
  buildCanvasDragPerfDiff,
  startCanvasDragPerfSpan,
  trackCanvasDragPerf,
} from "@/components/editor/canvasEditor/canvasDragPerf";
import {
  finishImageRotationDebugSession,
  startImageRotationDebugSession,
  trackImageRotationDebug,
  trackImageRotationPreview,
} from "@/components/editor/canvasEditor/imageRotationDebug";
import {
  activateImageLayerPerf,
  buildImagePerfPayloadFromNode,
  deactivateImageLayerPerf,
} from "@/components/editor/canvasEditor/imageLayerPerf";
import {
  activateKonvaLayerFreeze,
  deactivateKonvaLayerFreeze,
} from "@/components/editor/canvasEditor/konvaLayerFreeze";
import {
  liftNodeToOverlayLayer,
  restoreNodeFromOverlayLayer,
} from "@/components/editor/canvasEditor/imageOverlayLayerLift";
import {
  getSelectionFramePaddingForSelection,
  getSelectionFrameStrokeWidth,
  SELECTION_FRAME_ACTIVE_STROKE,
  SELECTION_FRAME_STROKE,
} from "@/components/editor/textSystem/render/konva/selectionFrameVisuals";
import { recordCountdownAuditSnapshot } from "@/domain/countdownAudit/runtime";
import {
  getCanvasPointerDebugInfo,
  getKonvaNodeDebugInfo,
  logSelectedDragDebug,
} from "@/components/editor/canvasEditor/selectedDragDebug";

const DEBUG_SELECTION_BOUNDS = false;

const sbLog = (...args) => {
  if (!DEBUG_SELECTION_BOUNDS) return;
  console.log("[SB]", ...args);
};
const slog = sbLog;

const TRDBG = (...args) => {
  if (!window.__DBG_TR) return;
  console.log("[TRDBG]", ...args);
};

const TXTDBG = (...args) => {
  if (typeof window === "undefined") return;
  if (!window.__DBG_TEXT_RESIZE) return;
  console.log("[TEXT-TR]", ...args);
};

const ROTATION_SNAP_ANGLES = Object.freeze([0, 45, 90, 135, 180, 225, 270, 315]);

function resolveRotateAnchorOffset({ padding = 0, isMobile = false } = {}) {
  const targetDistanceFromElement = isMobile ? 52 : 30;
  const minimumOffset = isMobile ? 34 : 24;
  const safePadding = Number.isFinite(Number(padding)) ? Number(padding) : 0;

  return Math.max(minimumOffset, targetDistanceFromElement - safePadding);
}


function rectFromNodes(nodes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const n of nodes) {
    if (!n?.getClientRect) continue;
    const r = n.getClientRect({ skipTransform: false, skipShadow: true, skipStroke: true });
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }

  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function getCountdownScaledSize(node) {
  try {
    const hitbox = node?.findOne?.(".countdown-hitbox");
    const baseW = typeof hitbox?.width === "function" ? hitbox.width() : NaN;
    const baseH = typeof hitbox?.height === "function" ? hitbox.height() : NaN;
    const sx = Math.abs(typeof node?.scaleX === "function" ? (node.scaleX() || 1) : 1);
    const sy = Math.abs(typeof node?.scaleY === "function" ? (node.scaleY() || 1) : 1);

    if (Number.isFinite(baseW) && Number.isFinite(baseH) && baseW > 0 && baseH > 0) {
      return {
        width: Math.abs(baseW * sx),
        height: Math.abs(baseH * sy),
      };
    }
  } catch {}

  try {
    const r = node.getClientRect({ skipTransform: false, skipShadow: true, skipStroke: true });
    return { width: Math.abs(r.width), height: Math.abs(r.height) };
  } catch {}

  return { width: 100, height: 50 };
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return value;
  return Math.min(Math.max(value, min), max);
}

function roundNodeMetric(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const precision = 10 ** digits;
  return Math.round(numeric * precision) / precision;
}

function normalizeRotationIndicatorDegrees(angle) {
  if (!Number.isFinite(angle)) return 0;
  let normalized = angle % 360;
  if (normalized < 0) normalized += 360;
  const rounded = Math.round(normalized);
  return rounded >= 360 ? 0 : rounded;
}

function snapRotationOnCommit(angle, toleranceDeg = 0, snapAngles = ROTATION_SNAP_ANGLES) {
  const numericAngle = Number(angle);
  const numericTolerance = Number(toleranceDeg);
  if (!Number.isFinite(numericAngle) || !Number.isFinite(numericTolerance) || numericTolerance <= 0) {
    return {
      snapped: false,
      rotation: numericAngle,
      deltaDeg: 0,
    };
  }

  let bestRotation = numericAngle;
  let bestDelta = Infinity;

  snapAngles.forEach((snapAngle) => {
    const numericSnap = Number(snapAngle);
    if (!Number.isFinite(numericSnap)) return;

    const turns = Math.round((numericAngle - numericSnap) / 360);
    const candidate = numericSnap + (turns * 360);
    const delta = Math.abs(candidate - numericAngle);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestRotation = candidate;
    }
  });

  return {
    snapped: bestDelta <= numericTolerance,
    rotation: bestDelta <= numericTolerance ? roundNodeMetric(bestRotation, 3) : numericAngle,
    deltaDeg: roundNodeMetric(bestDelta, 3) || 0,
  };
}


export default function SelectionBounds({
  selectedElements,
  elementRefs,
  objetos,
  onTransform,
  onTransformInteractionStart = null,
  onTransformInteractionEnd = null,
  isDragging,
  isInteractionLocked = false,
  isMobile = false,
  dragLayerRef = null,
}) {
  const transformerRef = useRef(null);
  const renderCountRef = useRef(0);
  const renderSnapshotRef = useRef(null);
  const [transformTick, setTransformTick] = useState(0);
  const [runtimeDragActive, setRuntimeDragActive] = useState(() => (
    typeof window !== "undefined" && Boolean(window._isDragging)
  ));
  const [isImageRotateGestureActive, setIsImageRotateGestureActive] = useState(false);
  const lastNodesRef = useRef([]);
  const circleAnchorRef = useRef(null);
  const textTransformAnchorRef = useRef(null);
  const rotationIndicatorGroupRef = useRef(null);
  const rotationIndicatorLabelRef = useRef(null);
  const rotationIndicatorVisualStateRef = useRef({
    x: null,
    y: null,
    text: null,
    visible: false,
  });
  const rotationIndicatorRafRef = useRef(0);
  const rotationIndicatorPendingStateRef = useRef(null);
  const deferredSourceLayerThawRef = useRef({
    raf1: 0,
    raf2: 0,
    layer: null,
    node: null,
    elementId: null,
    sourceLayerLabel: null,
    overlayLifted: false,
    logOverlayRestore: false,
  });
  const imageRotationPerfRef = useRef({
    node: null,
    elementId: null,
    cacheApplied: false,
    cacheReused: false,
    overlayLifted: false,
    sourceLayer: null,
    sourceLayerFrozen: false,
    sourceLayerLabel: null,
  });
  const resizeHintTimersRef = useRef([]);
  const lastResizeHintSelectionKeyRef = useRef("");
  const transformGestureRef = useRef({
    isRotate: false,
    activeAnchor: null,
  });
  const isTransformingResizeRef = useRef(false);
  const [isResizeGestureActive, setIsResizeGestureActive] = useState(false);
  const [pressedResizeAnchorName, setPressedResizeAnchorName] = useState(null);
  const [resizeHintPhase, setResizeHintPhase] = useState(0);
  const elementosSeleccionadosData = selectedElements
    .map((id) => objetos.find((obj) => obj.id === id))
    .filter(Boolean);

  const primerElemento = elementosSeleccionadosData[0] || null;
  const esTexto = primerElemento?.tipo === "texto";
  const esCountdown = primerElemento?.tipo === "countdown";
  const esGaleria = selectedElements.length === 1 && primerElemento?.tipo === "galeria";
  const esImagenSeleccionada =
    selectedElements.length === 1 &&
    primerElemento?.tipo === "imagen" &&
    !primerElemento?.esFondo;
  const lockAspectCountdown = selectedElements.length === 1 && esCountdown;
  const lockAspectText = selectedElements.length === 1 && esTexto;
  const transformerAnchorSize = isMobile ? 32 : 14; //tamaÃ±o visual del nodo (mÃ¡s grande en mobile).
  const transformerAnchorRadius = 999; //radio de esquina del nodo (999 lo hace circular).
  const transformerPadding = getSelectionFramePaddingForSelection(
    elementosSeleccionadosData,
    isMobile
  ); // espacio extra entre borde del transformer y elemento.
  const transformerRotateOffset = resolveRotateAnchorOffset({
    padding: transformerPadding,
    isMobile,
  });
  const transformerBorderStrokeWidth = getSelectionFrameStrokeWidth(isMobile); //grosor del borde del transformer.
  const transformerAnchorFillColor = "#9333EA";
  const transformerAnchorStrokeWidth = isMobile ? 1.4 : 2.5; //grosor del borde del nodo.
  const transformerAnchorShadowBlur = isMobile ? 9 : 6; // quÃ© tan difusa es la sombra base del nodo.
  const transformerAnchorShadowOffsetY = isMobile ? 4 : 3; // desplazamiento vertical de esa sombra.
  const transformerAnchorHitStrokeWidth = isMobile ? 62 : 20;
  const transformerAnchorPressedHitStrokeWidth = isMobile ? 96 : 24;
  const transformerAnchorStrokeColor = "#ffffff";
  const transformerAnchorPressedHaloStrokeColor = isMobile
    ? "rgba(255, 255, 255, 1)"
    : transformerAnchorStrokeColor;
  const transformerAnchorPressedHaloStrokeWidth = isMobile ? 8.8 : 3.2;
  const transformerAnchorShadowColor = "rgba(147, 51, 234, 0.3)";
  const transformerAnchorPressedFillColor = isMobile
    ? "#C26BFF"
    : transformerAnchorFillColor;
  const transformerAnchorHintFillColor = isMobile
    ? "#B56AF8"
    : transformerAnchorFillColor;
  const transformerAnchorPressedShadowColor = isMobile
    ? "rgba(150, 32, 255, 1)"
    : "rgba(147, 51, 234, 0.7)";
  const transformerAnchorPressedShadowBlur = isMobile ? 92 : 18;
  const transformerAnchorPressedShadowOffsetY =
    isMobile ? 0 : transformerAnchorShadowOffsetY + 1;
  const transformerAnchorPressedScale = isMobile ? 1.2 : 1.1;
  const transformerAnchorHintShadowColor = isMobile
    ? "rgba(214, 165, 255, 0.95)"
    : "rgba(167, 86, 247, 0.8)";
  const transformerAnchorHintStrokeColor = "rgba(255, 255, 255, 0.98)";
  const transformerAnchorHintStrongScale = isMobile ? 1.12 : 1.14;
  const transformerAnchorHintSoftScale = isMobile ? 1.08 : 1.07;
  const transformerAnchorHintStrongShadowBlur = isMobile ? 54 : 24;
  const transformerAnchorHintSoftShadowBlur = isMobile ? 34 : 14;
  const transformerAnchorHintHitStrokeWidth = isMobile ? 84 : 22;
  const transformerRotateAnchorFillColor = isMobile
    ? "rgba(255, 255, 255, 0.97)"
    : "rgba(255, 255, 255, 0.98)";
  const transformerRotateAnchorStrokeColor = "#9333EA";
  const transformerRotateAnchorStrokeWidth = isMobile ? 2.2 : 1.9;
  const transformerRotateAnchorShadowColor = isMobile
    ? "rgba(147, 51, 234, 0.24)"
    : "rgba(147, 51, 234, 0.18)";
  const transformerRotateAnchorShadowBlur = isMobile ? 20 : 12;
  const transformerRotateAnchorShadowOffsetY = isMobile ? 4 : 2;
  const transformerRotateAnchorScale = isMobile ? 0.88 : 0.9;
  const transformerRotateAnchorHitStrokeWidth = isMobile ? 88 : 28;
  const transformerRotateAnchorPressedFillColor = isMobile
    ? "rgba(245, 238, 255, 0.99)"
    : "rgba(250, 245, 255, 0.99)";
  const transformerRotateAnchorPressedStrokeColor = "#7E22CE";
  const transformerRotateAnchorPressedStrokeWidth = isMobile ? 2.8 : 2.2;
  const transformerRotateAnchorPressedShadowColor = isMobile
    ? "rgba(126, 34, 206, 0.34)"
    : "rgba(126, 34, 206, 0.28)";
  const transformerRotateAnchorPressedShadowBlur = isMobile ? 30 : 16;
  const transformerRotateAnchorPressedShadowOffsetY = isMobile ? 5 : 3;
  const transformerRotateAnchorPressedScale = isMobile ? 0.94 : 0.96;
  const transformerHintBorderStrongStrokeWidth = isMobile ? 2.8 : 1.6;
  const transformerHintBorderSoftStrokeWidth = isMobile ? 2.2 : 1.25;
  const transformerRotationSnapTolerance = esImagenSeleccionada
    ? (isMobile ? 4 : 2)
    : (isMobile ? 8 : 5); //tolerancia para encajar rotacion en angulos fijos.
  const imageRotationCommitSnapTolerance = isMobile ? 2.5 : 1.5;
  const transformerRotationSnaps = esImagenSeleccionada ? [] : ROTATION_SNAP_ANGLES;
  const rotationIndicatorWidth = isMobile ? 92 : 72;
  const rotationIndicatorHeight = isMobile ? 38 : 30;
  const rotationIndicatorOffsetX = isMobile ? 26 : 22;
  const rotationIndicatorOffsetY = isMobile ? 24 : 20;
  const rotationIndicatorMargin = isMobile ? 14 : 10;
  const rotationIndicatorFontSize = isMobile ? 18 : 14;
  const esTriangulo =
    primerElemento?.tipo === "forma" &&
    primerElemento?.figura === "triangle";

  const hasGallery = elementosSeleccionadosData.some(
    (o) => o.tipo === "galeria"
  );

  const hayLineas = elementosSeleccionadosData.some(
    (obj) => obj.tipo === "forma" && obj.figura === "line"
  );
  const pendingDragSelectionId =
    typeof window !== "undefined" ? window._pendingDragSelectionId || null : null;
  const effectiveDragging = Boolean(
    isDragging ||
    runtimeDragActive ||
    (typeof window !== "undefined" && window._isDragging)
  );
  const shouldSuppressDuringDeferredDrag = Boolean(
    effectiveDragging &&
    pendingDragSelectionId &&
    !selectedElements.includes(pendingDragSelectionId)
  );
  const shouldHideTransformerDuringDrag = Boolean(
    effectiveDragging &&
    !isResizeGestureActive &&
    !isTransformingResizeRef.current
  );

  useEffect(() => {
    logSelectedDragDebug("transformer:visibility-state", {
      selectedIds: selectedElements,
      selectedCount: selectedElements.length,
      primerElementoId: primerElemento?.id || null,
      primerElementoTipo: primerElemento?.tipo || null,
      effectiveDragging: Boolean(effectiveDragging),
      runtimeDragActive: Boolean(runtimeDragActive),
      globalDragging:
        typeof window !== "undefined" ? Boolean(window._isDragging) : false,
      pendingDragSelectionId,
      shouldSuppressDuringDeferredDrag: Boolean(shouldSuppressDuringDeferredDrag),
      shouldHideTransformerDuringDrag: Boolean(shouldHideTransformerDuringDrag),
      isResizeGestureActive: Boolean(isResizeGestureActive),
      isTransformingResize: Boolean(isTransformingResizeRef.current),
      isInteractionLocked: Boolean(isInteractionLocked),
    });
  }, [
    selectedElements.join(","),
    effectiveDragging,
    runtimeDragActive,
    pendingDragSelectionId,
    shouldSuppressDuringDeferredDrag,
    shouldHideTransformerDuringDrag,
    isResizeGestureActive,
    isInteractionLocked,
    primerElemento?.id,
    primerElemento?.tipo,
  ]);

  useEffect(() => {
    renderCountRef.current += 1;
    if (typeof window === "undefined") return;
    const isInteractionActive =
      effectiveDragging ||
      window._isDragging ||
      window._grupoLider ||
      window._resizeData?.isResizing;
    if (!isInteractionActive) return;

    const nextSnapshot = {
      selectedIds: selectedElements.join(","),
      effectiveDragging: Boolean(effectiveDragging),
      runtimeDragActive: Boolean(runtimeDragActive),
      interactionLocked: Boolean(interactionLocked),
      resizeActive: Boolean(isResizeGestureActive),
      resizeHintPhase,
      transformTick,
      pendingDragSelectionId,
      suppressDuringDeferredDrag: shouldSuppressDuringDeferredDrag,
      primerElementoId: primerElemento?.id || null,
      primerElementoTipo: primerElemento?.tipo || null,
    };
    const diff = buildCanvasDragPerfDiff(
      renderSnapshotRef.current,
      nextSnapshot
    );
    renderSnapshotRef.current = nextSnapshot;

    trackCanvasDragPerf("render:SelectionTransformer", {
      renderCount: renderCountRef.current,
      selectedCount: selectedElements.length,
      dragging: Boolean(effectiveDragging || window._isDragging),
      groupLeader: window._grupoLider || null,
      resizing: Boolean(window._resizeData?.isResizing),
      changedKeys: diff.changedKeys,
      changes: diff.changes,
      ...nextSnapshot,
    }, {
      throttleMs: 120,
      throttleKey: "render:SelectionTransformer",
    });
  }, [
    effectiveDragging,
    pendingDragSelectionId,
    primerElemento?.id,
    primerElemento?.tipo,
    selectedElements.length,
    shouldSuppressDuringDeferredDrag,
    transformTick,
  ]);

  useEffect(() => {
    const firstId = selectedElements?.[0];
    if (!firstId) {
      setRuntimeDragActive(false);
      return;
    }

    const firstNode = elementRefs.current?.[firstId];
    const stage = firstNode?.getStage?.();
    if (!stage) {
      setRuntimeDragActive(
        Boolean(typeof window !== "undefined" && window._isDragging)
      );
      return;
    }

    const syncDragState = (source = "unknown") => {
      const nextRuntimeDragActive =
        Boolean(typeof window !== "undefined" && window._isDragging);
      logSelectedDragDebug("transformer:runtime-drag-sync", {
        source,
        selectedIds: selectedElements,
        stagePresent: Boolean(stage),
        nextRuntimeDragActive,
        globalDragging:
          typeof window !== "undefined" ? Boolean(window._isDragging) : false,
      });
      setRuntimeDragActive(nextRuntimeDragActive);
    };
    const onStageDragStart = () => {
      logSelectedDragDebug("transformer:runtime-drag-sync", {
        source: "stage-dragstart",
        selectedIds: selectedElements,
        stagePresent: Boolean(stage),
        nextRuntimeDragActive: true,
        globalDragging:
          typeof window !== "undefined" ? Boolean(window._isDragging) : false,
      });
      setRuntimeDragActive(true);
    };
    const onStageDragEnd = () => syncDragState("stage-dragend");
    const onGlobalDraggingEnd = () => syncDragState("window-dragging-end");

    stage.on("dragstart.selection-runtime", onStageDragStart);
    stage.on("dragend.selection-runtime", onStageDragEnd);
    window.addEventListener("dragging-end", onGlobalDraggingEnd);
    syncDragState("effect-init");

    return () => {
      stage.off("dragstart.selection-runtime", onStageDragStart);
      stage.off("dragend.selection-runtime", onStageDragEnd);
      window.removeEventListener("dragging-end", onGlobalDraggingEnd);
    };
  }, [elementRefs, selectedElements.join(",")]);

  const elementosTransformables = elementosSeleccionadosData.filter(
    (obj) => !(obj.tipo === "forma" && obj.figura === "line")
  );

  const deberiaUsarTransformer =
    elementosTransformables.length > 0;
  const interactionLocked = Boolean(isInteractionLocked);

  const selectedGeomKey = elementosSeleccionadosData
    .map((o) =>
      [
        o.id,
        o.x ?? 0,
        o.y ?? 0,
        o.width ?? "",
        o.height ?? "",
        o.scaleX ?? 1,
        o.scaleY ?? 1,
        o.rotation ?? 0,
        o.chipWidth ?? "",
        o.gap ?? "",
        o.paddingX ?? "",
        o.paddingY ?? "",
      ].join(":")
    )
    .join("|");

  const getTransformPose = (node) => {
    if (!node) return { x: 0, y: 0, rotation: 0 };

    if (esGaleria && typeof node.getParent === "function") {
      const parent = node.getParent();
      if (parent) {
        return {
          x: typeof parent.x === "function" ? parent.x() : 0,
          y: typeof parent.y === "function" ? parent.y() : 0,
          rotation: typeof parent.rotation === "function" ? parent.rotation() || 0 : 0,
        };
      }
    }

    return {
      x: typeof node.x === "function" ? node.x() : 0,
      y: typeof node.y === "function" ? node.y() : 0,
      rotation: typeof node.rotation === "function" ? node.rotation() || 0 : 0,
    };
  };

  const getImageRotationNodeMetrics = (node, pose = getTransformPose(node)) => {
    const scaleX = typeof node?.scaleX === "function" ? node.scaleX() || 1 : 1;
    const scaleY = typeof node?.scaleY === "function" ? node.scaleY() || 1 : 1;
    const baseWidth =
      typeof node?.width === "function"
        ? Number(node.width() || 0)
        : Number(node?.attrs?.width || 0);
    const baseHeight =
      typeof node?.height === "function"
        ? Number(node.height() || 0)
        : Number(node?.attrs?.height || 0);
    const layer = node?.getLayer?.() || null;
    const canvasHandle =
      layer && typeof layer.getCanvas === "function" ? layer.getCanvas() : null;
    const canvas = canvasHandle?._canvas || null;
    const stage = node?.getStage?.() || null;

    return {
      x: roundNodeMetric(pose?.x),
      y: roundNodeMetric(pose?.y),
      rotation: roundNodeMetric(pose?.rotation),
      scaleX: roundNodeMetric(scaleX, 3),
      scaleY: roundNodeMetric(scaleY, 3),
      baseWidth: roundNodeMetric(baseWidth, 3),
      baseHeight: roundNodeMetric(baseHeight, 3),
      width: roundNodeMetric(baseWidth * Math.abs(scaleX || 1), 3),
      height: roundNodeMetric(baseHeight * Math.abs(scaleY || 1), 3),
      layerChildren:
        typeof layer?.getChildren === "function" ? layer.getChildren().length : null,
      layerCanvasWidth: Number(canvas?.width || 0) || null,
      layerCanvasHeight: Number(canvas?.height || 0) || null,
      stageWidth:
        typeof stage?.width === "function" ? Number(stage.width() || 0) || null : null,
      stageHeight:
        typeof stage?.height === "function" ? Number(stage.height() || 0) || null : null,
      nodeCached: typeof node?.isCached === "function" ? node.isCached() : null,
    };
  };

  const resetImageRotationPerfState = () => {
    imageRotationPerfRef.current = {
      node: null,
      elementId: null,
      cacheApplied: false,
      cacheReused: false,
      overlayLifted: false,
      sourceLayer: null,
      sourceLayerFrozen: false,
      sourceLayerLabel: null,
    };
  };

  const clearDeferredSourceLayerThaw = ({ thaw = false } = {}) => {
    const current = deferredSourceLayerThawRef.current;
    if (current.raf1 && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(current.raf1);
    }
    if (current.raf2 && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(current.raf2);
    }

    const pendingLayer = current.layer || null;
    const pendingNode = current.node || null;
    const pendingElementId = current.elementId || null;
    const pendingSourceLayerLabel = current.sourceLayerLabel || null;
    const pendingOverlayLifted = current.overlayLifted === true;
    const pendingLogOverlayRestore = current.logOverlayRestore === true;

    deferredSourceLayerThawRef.current = {
      raf1: 0,
      raf2: 0,
      layer: null,
      node: null,
      elementId: null,
      sourceLayerLabel: null,
      overlayLifted: false,
      logOverlayRestore: false,
    };

    if (!thaw || (!pendingLayer && !pendingNode)) {
      return {
        thawed: false,
        overlayRestored: false,
      };
    }

    const shouldRestoreOverlayNode = Boolean(pendingNode && pendingOverlayLifted);
    const sourceLayerRelease = pendingLayer
      ? deactivateKonvaLayerFreeze(pendingLayer, {
          batchDraw: !shouldRestoreOverlayNode,
        })
      : {
          thawed: false,
        };
    let overlayRestored = false;

    if (shouldRestoreOverlayNode) {
      overlayRestored = restoreNodeFromOverlayLayer(pendingNode, pendingElementId, {
        eventPrefix: "image:rotate-overlay",
        drawSourceLayer: true,
        drawOverlayLayer: true,
      });

      if (pendingLogOverlayRestore) {
        trackImageRotationDebug("image-rotate:overlay-restore", {
          elementId: pendingElementId,
          overlayLifted: true,
          overlayRestored,
        });
      }
    }

    if (pendingLayer) {
      trackImageRotationDebug("image-rotate:source-layer-thaw", {
        elementId: pendingElementId,
        sourceLayerFrozen: true,
        sourceLayerThawed: sourceLayerRelease?.thawed === true,
        sourceLayerLabel: pendingSourceLayerLabel,
      });
    }

    return {
      ...sourceLayerRelease,
      overlayRestored,
    };
  };

  const releaseImageRotationPerf = ({
    logCacheRelease = false,
    logOverlayRestore = false,
    deferSourceLayerRedraw = false,
  } = {}) => {
    const currentNode = imageRotationPerfRef.current?.node || null;
    const currentElementId = imageRotationPerfRef.current?.elementId || null;
    const cacheApplied = imageRotationPerfRef.current?.cacheApplied === true;
    const cacheReused = imageRotationPerfRef.current?.cacheReused === true;
    const overlayLifted = imageRotationPerfRef.current?.overlayLifted === true;
    const sourceLayer = imageRotationPerfRef.current?.sourceLayer || null;
    const sourceLayerFrozen = imageRotationPerfRef.current?.sourceLayerFrozen === true;
    const sourceLayerLabel = imageRotationPerfRef.current?.sourceLayerLabel || null;

    const cacheRelease = deactivateImageLayerPerf(
      currentNode,
      currentElementId,
      { cacheEventPrefix: "image:rotate-cache" }
    );
    clearDeferredSourceLayerThaw();
    let sourceLayerRelease = null;
    let overlayRestored = false;
    if (
      sourceLayerFrozen &&
      deferSourceLayerRedraw &&
      sourceLayer &&
      typeof requestAnimationFrame === "function"
    ) {
      deferredSourceLayerThawRef.current = {
        raf1: requestAnimationFrame(() => {
          deferredSourceLayerThawRef.current.raf1 = 0;
          deferredSourceLayerThawRef.current.raf2 = requestAnimationFrame(() => {
            deferredSourceLayerThawRef.current.raf2 = 0;
            clearDeferredSourceLayerThaw({ thaw: true });
          });
        }),
        raf2: 0,
        layer: sourceLayer,
        node: currentNode,
        elementId: currentElementId,
        sourceLayerLabel,
        overlayLifted,
        logOverlayRestore,
      };
      sourceLayerRelease = {
        thawed: false,
        deferred: true,
      };
    } else {
      sourceLayerRelease = deactivateKonvaLayerFreeze(sourceLayer, {
        batchDraw: !(overlayLifted && currentNode),
      });
      overlayRestored = restoreNodeFromOverlayLayer(currentNode, currentElementId, {
        eventPrefix: "image:rotate-overlay",
        drawSourceLayer: !sourceLayerRelease?.deferred,
        drawOverlayLayer: true,
      });
    }

    if (logOverlayRestore && overlayLifted && !sourceLayerRelease?.deferred) {
      trackImageRotationDebug("image-rotate:overlay-restore", {
        elementId: currentElementId,
        overlayLifted,
        overlayRestored,
      });
    }

    if (sourceLayerFrozen && !sourceLayerRelease?.deferred) {
      trackImageRotationDebug("image-rotate:source-layer-thaw", {
        elementId: currentElementId,
        sourceLayerFrozen: true,
        sourceLayerThawed: sourceLayerRelease?.thawed === true,
        sourceLayerLabel,
      });
    }

    if (logCacheRelease) {
      trackImageRotationDebug("image-rotate:cache-release", {
        elementId: currentElementId ?? primerElemento?.id ?? null,
        cacheApplied,
        cacheReused,
        cacheCleared: cacheRelease?.cacheCleared === true,
      });
    }

    resetImageRotationPerfState();

    return {
      cacheRelease,
      overlayRestored,
      cacheApplied,
      cacheReused,
      overlayLifted,
      sourceLayerFrozen,
      sourceLayerThawed: sourceLayerRelease?.thawed === true,
      sourceLayerLabel,
      elementId: currentElementId,
    };
  };

  const syncRotationIndicatorLayer = ({
    useDragOverlay = false,
    forceTop = false,
  } = {}) => {
    const indicator = rotationIndicatorGroupRef.current;
    if (!indicator) return false;

    const isLifted = Boolean(indicator.__canvasOverlayLiftParent);
    const shouldUseDragOverlay =
      useDragOverlay &&
      dragLayerRef &&
      (dragLayerRef.current || dragLayerRef);

    if (shouldUseDragOverlay) {
      const lifted = liftNodeToOverlayLayer(
        indicator,
        dragLayerRef,
        {
          elementId: primerElemento?.id ?? null,
          tipo: "rotation-indicator",
        },
        {
          eventPrefix: "image:rotate-indicator-overlay",
          syncDrawSourceLayer: true,
          syncDrawOverlayLayer: true,
        }
      );

      if (forceTop) {
        const parent = indicator.getParent?.() || null;
        const childCount =
          typeof parent?.getChildren === "function"
            ? parent.getChildren().length
            : null;
        const currentZIndex =
          typeof indicator.zIndex === "function" ? indicator.zIndex() : null;
        const isAlreadyTop =
          Number.isInteger(childCount) &&
          Number.isInteger(currentZIndex) &&
          childCount > 0 &&
          currentZIndex === childCount - 1;

        if (!isAlreadyTop && typeof indicator.moveToTop === "function") {
          indicator.moveToTop();
          indicator.getLayer?.()?.batchDraw?.();
        }
      }

      return lifted;
    }

    if (isLifted) {
      if (typeof indicator.visible === "function") {
        indicator.visible(false);
      }
      rotationIndicatorVisualStateRef.current = {
        ...rotationIndicatorVisualStateRef.current,
        visible: false,
      };
      rotationIndicatorPendingStateRef.current = null;
      restoreNodeFromOverlayLayer(indicator, primerElemento?.id ?? null, {
        eventPrefix: "image:rotate-indicator-overlay",
        drawSourceLayer: true,
        drawOverlayLayer: true,
      });
      return true;
    }

    return false;
  };

  const syncTransformerLayer = ({
    useDragOverlay = false,
    forceTop = false,
  } = {}) => {
    const transformer = transformerRef.current;
    if (!transformer) return false;

    const isLifted = Boolean(transformer.__canvasOverlayLiftParent);
    const shouldUseDragOverlay =
      useDragOverlay &&
      dragLayerRef &&
      (dragLayerRef.current || dragLayerRef);

    if (shouldUseDragOverlay) {
      const lifted = liftNodeToOverlayLayer(
        transformer,
        dragLayerRef,
        {
          elementId: primerElemento?.id ?? null,
          tipo: "selection-transformer",
        },
        {
          eventPrefix: "image:rotate-transformer-overlay",
          syncDrawSourceLayer: true,
          syncDrawOverlayLayer: true,
        }
      );

      if (forceTop && typeof transformer.moveToTop === "function") {
        transformer.moveToTop();
      }

      try {
        transformer.forceUpdate?.();
        transformer.getLayer?.()?.batchDraw?.();
      } catch {}

      return lifted;
    }

    if (isLifted) {
      const restored = restoreNodeFromOverlayLayer(transformer, primerElemento?.id ?? null, {
        eventPrefix: "image:rotate-transformer-overlay",
        drawSourceLayer: true,
        drawOverlayLayer: true,
      });

      try {
        transformer.forceUpdate?.();
        transformer.getLayer?.()?.batchDraw?.();
      } catch {}

      return restored;
    }

    return false;
  };

  const flushRotationIndicatorState = () => {
    rotationIndicatorRafRef.current = 0;
    const indicator = rotationIndicatorGroupRef.current;
    const label = rotationIndicatorLabelRef.current;
    const pendingState = rotationIndicatorPendingStateRef.current;
    if (!indicator || !pendingState) return;

    const currentState = rotationIndicatorVisualStateRef.current;
    let visualChanged = false;

    if (pendingState.visible !== currentState.visible) {
      indicator.visible(Boolean(pendingState.visible));
      visualChanged = true;
    }

    if (pendingState.visible) {
      if (
        pendingState.x !== currentState.x ||
        pendingState.y !== currentState.y
      ) {
        indicator.position({
          x: pendingState.x,
          y: pendingState.y,
        });
        visualChanged = true;
      }

      if (pendingState.text !== currentState.text && label) {
        label.text(pendingState.text);
        visualChanged = true;
      }
    }

    rotationIndicatorVisualStateRef.current = pendingState;
    rotationIndicatorPendingStateRef.current = null;

    if (visualChanged) {
      indicator.getLayer?.()?.batchDraw?.();
    }
  };

  const scheduleRotationIndicatorState = (nextState) => {
    rotationIndicatorPendingStateRef.current = nextState;
    if (rotationIndicatorRafRef.current || typeof requestAnimationFrame !== "function") {
      if (!rotationIndicatorRafRef.current && nextState) {
        flushRotationIndicatorState();
      }
      return;
    }

    rotationIndicatorRafRef.current = requestAnimationFrame(() => {
      flushRotationIndicatorState();
    });
  };

  const hideRotationIndicator = () => {
    if (
      rotationIndicatorRafRef.current &&
      typeof cancelAnimationFrame === "function"
    ) {
      cancelAnimationFrame(rotationIndicatorRafRef.current);
      rotationIndicatorRafRef.current = 0;
    }

    rotationIndicatorPendingStateRef.current = null;

    const indicator = rotationIndicatorGroupRef.current;
    if (indicator && typeof indicator.visible === "function") {
      indicator.visible(false);
      indicator.getLayer?.()?.batchDraw?.();
    }

    rotationIndicatorVisualStateRef.current = {
      ...rotationIndicatorVisualStateRef.current,
      visible: false,
    };

    syncRotationIndicatorLayer({ useDragOverlay: false });
  };

  const updateRotationIndicator = (node) => {
    if (!transformGestureRef.current?.isRotate) {
      hideRotationIndicator();
      return;
    }

    const indicator = rotationIndicatorGroupRef.current;
    const stage = transformerRef.current?.getStage?.();
    const pose = getTransformPose(node);
    const pointer =
      stage && typeof stage.getPointerPosition === "function"
        ? stage.getPointerPosition()
        : null;
    if (!indicator || !stage || !pointer) return;

    const stageWidth =
      typeof stage.width === "function"
        ? Number(stage.width())
        : Number(stage?.attrs?.width);
    const stageHeight =
      typeof stage.height === "function"
        ? Number(stage.height())
        : Number(stage?.attrs?.height);
    const clampIndicatorX = (value) =>
      Number.isFinite(stageWidth)
        ? clamp(
            value,
            rotationIndicatorMargin,
            Math.max(
              rotationIndicatorMargin,
              stageWidth - rotationIndicatorWidth - rotationIndicatorMargin
            )
          )
        : value;
    const clampIndicatorY = (value) =>
      Number.isFinite(stageHeight)
        ? clamp(
            value,
            rotationIndicatorMargin,
            Math.max(
              rotationIndicatorMargin,
              stageHeight - rotationIndicatorHeight - rotationIndicatorMargin
            )
          )
        : value;

    const desiredX = Number(pointer.x) + rotationIndicatorOffsetX;
    const desiredY = Number(pointer.y) + rotationIndicatorOffsetY;
    const nextX = clampIndicatorX(desiredX);
    const nextY = clampIndicatorY(desiredY);

    const degreeText =
      String(normalizeRotationIndicatorDegrees(pose.rotation)) + String.fromCharCode(176);

    syncRotationIndicatorLayer({
      useDragOverlay: esImagenSeleccionada,
      forceTop: esImagenSeleccionada,
    });

    const currentState = rotationIndicatorVisualStateRef.current;
    const shouldUpdatePosition =
      !Number.isFinite(currentState.x) ||
      !Number.isFinite(currentState.y) ||
      Math.abs(Number(currentState.x) - nextX) >= 1 ||
      Math.abs(Number(currentState.y) - nextY) >= 1;
    const shouldUpdateText = currentState.text !== degreeText;
    const shouldShow = currentState.visible !== true;

    if (!shouldUpdatePosition && !shouldUpdateText && !shouldShow) {
      return;
    }

    scheduleRotationIndicatorState({
      x: shouldUpdatePosition ? nextX : currentState.x,
      y: shouldUpdatePosition ? nextY : currentState.y,
      text: shouldUpdateText ? degreeText : currentState.text,
      visible: true,
    });
  };
  const clearResizeAnchorPressFeedback = () => {
    if (isTransformingResizeRef.current) return;
    setIsResizeGestureActive(false);
    setPressedResizeAnchorName((current) => (current ? null : current));
  };

  const clearResizeHintTimers = () => {
    if (!resizeHintTimersRef.current.length) return;
    resizeHintTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    resizeHintTimersRef.current = [];
  };

  const stopResizeHintPulse = () => {
    clearResizeHintTimers();
    setResizeHintPhase((current) => (current === 0 ? current : 0));
  };

  const stopNativeTransformerIfActive = () => {
    const tr = transformerRef.current;
    if (!tr) return false;
    let nativeTransforming = false;
    try {
      nativeTransforming = Boolean(tr.isTransforming?.());
    } catch {}
    if (!nativeTransforming) return false;
    try {
      tr.stopTransform?.();
      tr.getLayer?.()?.batchDraw?.();
    } catch {}
    return true;
  };

  const getResizeAnchorNameFromTarget = (target) => {
    if (!target) return null;
    const isAnchorTarget =
      typeof target.hasName === "function"
        ? target.hasName("_anchor")
        : typeof target.name === "function" &&
          String(target.name() || "").includes("_anchor");
    if (!isAnchorTarget) return null;

    const rawName =
      typeof target.name === "function" ? String(target.name() || "") : "";
    const anchorName = rawName.split(" ")[0] || null;
    if (!anchorName) return null;
    return anchorName;
  };

  const handleResizeAnchorPressStart = (event) => {
    let anchorName = getResizeAnchorNameFromTarget(event?.target);
    if (!anchorName) {
      const activeAnchor =
        typeof transformerRef.current?.getActiveAnchor === "function"
          ? transformerRef.current.getActiveAnchor()
          : null;
      if (
        typeof activeAnchor === "string"
      ) {
        anchorName = activeAnchor;
      }
    }
    logSelectedDragDebug("transformer:pointerdown", {
      selectedIds: selectedElements,
      target: getKonvaNodeDebugInfo(event?.target),
      currentTarget: getKonvaNodeDebugInfo(event?.currentTarget),
      pointer: getCanvasPointerDebugInfo(event),
      resolvedAnchorName: anchorName,
      effectiveDragging: Boolean(effectiveDragging),
      interactionLocked: Boolean(interactionLocked),
      resizeGestureActive: Boolean(isResizeGestureActive),
    });
    if (!anchorName) return;
    setIsResizeGestureActive(true);
    setPressedResizeAnchorName((current) =>
      current === anchorName ? current : anchorName
    );
  };

  const getBoxOverflowAmount = (box, stageWidth, stageHeight) => {
    if (!box) return Number.POSITIVE_INFINITY;
    const x = Number(box.x);
    const y = Number(box.y);
    const width = Number(box.width);
    const height = Number(box.height);

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      return Number.POSITIVE_INFINITY;
    }

    const left = Math.min(x, x + width);
    const right = Math.max(x, x + width);
    const top = Math.min(y, y + height);
    const bottom = Math.max(y, y + height);

    const overflowLeft = Math.max(0, -left);
    const overflowTop = Math.max(0, -top);
    const overflowRight = Math.max(0, right - stageWidth);
    const overflowBottom = Math.max(0, bottom - stageHeight);

    return overflowLeft + overflowTop + overflowRight + overflowBottom;
  };

  const keepBoxInsideStage = (oldBox, nextBox) => {
    const tr = transformerRef.current;
    const stage = tr?.getStage?.();
    const stageWidth =
      typeof stage?.width === "function"
        ? Number(stage.width())
        : Number(stage?.attrs?.width);
    const stageHeight =
      typeof stage?.height === "function"
        ? Number(stage.height())
        : Number(stage?.attrs?.height);

    if (
      !Number.isFinite(stageWidth) ||
      stageWidth <= 0 ||
      !Number.isFinite(stageHeight) ||
      stageHeight <= 0
    ) {
      return nextBox;
    }

    const oldOverflow = getBoxOverflowAmount(oldBox, stageWidth, stageHeight);
    const nextOverflow = getBoxOverflowAmount(nextBox, stageWidth, stageHeight);
    const epsilon = 0.5;

    if (!Number.isFinite(nextOverflow)) {
      return oldBox;
    }

    if (nextOverflow <= epsilon) {
      return nextBox;
    }

    // Permitir transformar de vuelta hacia adentro del canvas.
    if (nextOverflow <= oldOverflow + epsilon) {
      return nextBox;
    }

    // Si el resize empuja mÃ¡s afuera del canvas, mantener el estado anterior.
    return oldBox;
  };

  const resolveStageBoundBox = (oldBox, nextBox) => {
    // Al rotar, el bounding box crece y se achica segun el angulo.
    // Si lo limitamos contra el canvas en vivo, el Transformer rebota y el giro
    // se siente trabado aunque la posicion del elemento no haya cambiado.
    if (transformGestureRef.current?.isRotate) {
      return nextBox;
    }
    return keepBoxInsideStage(oldBox, nextBox);
  };

  useEffect(() => {
    if (!esImagenSeleccionada) {
      setIsImageRotateGestureActive(false);
      syncRotationIndicatorLayer({ useDragOverlay: false });
      syncTransformerLayer({ useDragOverlay: false });
    }
  }, [esImagenSeleccionada, selectedElements.join(",")]);

  useEffect(() => {
    return () => {
      if (
        rotationIndicatorRafRef.current &&
        typeof cancelAnimationFrame === "function"
      ) {
        cancelAnimationFrame(rotationIndicatorRafRef.current);
        rotationIndicatorRafRef.current = 0;
      }
      rotationIndicatorPendingStateRef.current = null;
      clearDeferredSourceLayerThaw({ thaw: true });
      releaseImageRotationPerf();
      syncTransformerLayer({ useDragOverlay: false });
    };
  }, []);

  useEffect(() => {
    const selectionKey = selectedElements.join(",");

    if (!selectionKey || !deberiaUsarTransformer) {
      stopResizeHintPulse();
      lastResizeHintSelectionKeyRef.current = selectionKey;
      return;
    }

    if (effectiveDragging || isResizeGestureActive || isTransformingResizeRef.current) {
      stopResizeHintPulse();
      return;
    }

    if (selectionKey === lastResizeHintSelectionKeyRef.current) return;
    lastResizeHintSelectionKeyRef.current = selectionKey;

    clearResizeHintTimers();
    setResizeHintPhase(2);

    const pulseSteps = isMobile
      ? [
          [1, 360],
          [2, 680],
          [1, 980],
          [2, 1260],
          [1, 1520],
          [0, 1850],
        ]
      : [
          [1, 120],
          [2, 220],
          [1, 360],
          [0, 560],
        ];

    resizeHintTimersRef.current = pulseSteps.map(([phase, delayMs]) =>
      setTimeout(() => setResizeHintPhase(phase), delayMs)
    );

    return () => {
      clearResizeHintTimers();
    };
  }, [
    selectedElements.join(","),
    deberiaUsarTransformer,
    effectiveDragging,
    isResizeGestureActive,
    isMobile,
  ]);

  useEffect(() => {
    if (!isResizeGestureActive) return;
    const cleanupId = setTimeout(() => {
      if (isTransformingResizeRef.current) return;
      if (window._resizeData?.isResizing) return;
      setIsResizeGestureActive(false);
      setPressedResizeAnchorName((current) => (current ? null : current));
    }, isMobile ? 900 : 700);

    return () => clearTimeout(cleanupId);
  }, [isResizeGestureActive, isMobile, selectedElements.join(",")]);

  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    try {
      if (tr.isTransforming?.()) return;
    } catch {}
    try {
      tr.forceUpdate?.();
    } catch {}
    tr.getLayer?.()?.batchDraw?.();
  }, [
    resizeHintPhase,
    isResizeGestureActive,
    pressedResizeAnchorName,
  ]);

  useEffect(
    () => () => {
      stopNativeTransformerIfActive();
      clearResizeHintTimers();
    },
    []
  );

  useEffect(() => {
    if (selectedElements.length === 0 || !deberiaUsarTransformer) {
      stopResizeHintPulse();
      stopNativeTransformerIfActive();
      setIsResizeGestureActive(false);
      setPressedResizeAnchorName((current) => (current ? null : current));
      return;
    }
    if (effectiveDragging && !isTransformingResizeRef.current) {
      stopResizeHintPulse();
      setIsResizeGestureActive(false);
      setPressedResizeAnchorName((current) => (current ? null : current));
    }
  }, [selectedElements.length, effectiveDragging, deberiaUsarTransformer]);

  useEffect(() => {
    if (!interactionLocked) return;
    stopResizeHintPulse();
    setIsResizeGestureActive(false);
    setPressedResizeAnchorName((current) => (current ? null : current));
    hideRotationIndicator();
  }, [interactionLocked]);

  // ðŸ”¥ Efecto principal del Transformer (SIN retry / SIN flicker)
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;

    const selKey = selectedElements.join(",");
    const nativeTransforming = Boolean(tr.isTransforming?.());
    TRDBG("EFFECT start", {
      selKey,
      isDragging: effectiveDragging,
      deberiaUsarTransformer,
      hasGallery,
      elementosTransformablesLen: elementosTransformables.length,
      transformTick,
      editingId: window.editing?.id || null,
      nativeTransforming,
    });

    // Evita re-attach del transformer mientras Konva esta en medio del gesto.
    if (nativeTransforming || isTransformingResizeRef.current) {
      TRDBG("EFFECT exit: transform in flight", { selKey, nativeTransforming });
      return;
    }

    // Si no corresponde transformer, no hagas detach agresivo (evita flicker)
    if (!deberiaUsarTransformer) {
      TRDBG("EFFECT exit: no transformer or gallery", { selKey });
      return;
    }


    // Resolver nodes desde refs (fuente de verdad)
    let nodosTransformables = elementosTransformables
      .map((o) => elementRefs.current?.[o.id])
      .filter(Boolean);

    // Single select: usar ref fresco SIEMPRE
    if (selectedElements.length === 1) {
      const idSel = selectedElements[0];
      const refNode = elementRefs.current?.[idSel] || null;
      if (refNode && typeof refNode.getClientRect === "function") {
        if (esGaleria && typeof refNode.findOne === "function") {
          const galleryFrame = refNode.findOne(".gallery-transform-frame");
          if (galleryFrame && typeof galleryFrame.getClientRect === "function") {
            nodosTransformables = [galleryFrame];
          } else {
            nodosTransformables = [refNode];
          }
        } else {
          nodosTransformables = [refNode];
        }
      }
    }

    // Si aÃºn no hay nodos (imagen cargando, etc.), NO despegar (evita parpadeo)
    if (nodosTransformables.length === 0) {
      logSelectedDragDebug("transformer:attach-skip-no-nodes", {
        selectedIds: selectedElements,
        wantedIds: elementosTransformables.map((obj) => obj.id),
        refsPresent: elementosTransformables.map((obj) =>
          Boolean(elementRefs.current?.[obj.id])
        ),
        effectiveDragging: Boolean(effectiveDragging),
      });
      TRDBG("EFFECT exit: no nodes yet", {
        selKey,
        wantedIds: elementosTransformables.map(o => o.id),
        refsPresent: elementosTransformables.map(o => !!elementRefs.current?.[o.id]),
      });
      return;
    }


    // Attach estable
    TRDBG("ATTACH try", {
      selKey,
      nodesCount: nodosTransformables.length,
      nodeIds: nodosTransformables.map(n => (typeof n.id === "function" ? n.id() : n.attrs?.id)),
    });

    tr.nodes(nodosTransformables);
    logSelectedDragDebug("transformer:attach", {
      selectedIds: selectedElements,
      selectedCount: selectedElements.length,
      effectiveDragging: Boolean(effectiveDragging),
      pendingDragSelectionId,
      attachedNodeIds: nodosTransformables.map((node) =>
        typeof node?.id === "function" ? node.id() || null : node?.attrs?.id || null
      ),
      attachedNodes: nodosTransformables.map((node) => getKonvaNodeDebugInfo(node)),
    });

    TRDBG("ATTACH done", {
      selKey,
      trNodesCount: tr.nodes?.()?.length || 0,
    });

    try { tr.forceUpdate?.(); } catch { }
    tr.getLayer()?.batchDraw();

  }, [
    // Dependencias mÃ­nimas reales
    selectedElements.join(","),
    deberiaUsarTransformer,
    hasGallery,
    elementosTransformables.length,
    selectedGeomKey,
    transformTick,
    elementRefs,
    effectiveDragging,
  ]);



  useEffect(() => {
    const handler = (e) => {
      const id = e?.detail?.id;
      if (!id) return;

      TRDBG("REF event", {
        id,
        isSelected: selectedElements.includes(id),
        selKey: selectedElements.join(","),
      });

      if (!selectedElements.includes(id)) return;
      setTransformTick(t => t + 1);
    };

    window.addEventListener("element-ref-registrado", handler);
    return () => window.removeEventListener("element-ref-registrado", handler);
  }, [selectedElements.join(",")]);

  useEffect(() => {
    const firstId = selectedElements?.[0];
    if (!firstId) return;

    const firstNode = elementRefs.current?.[firstId];
    const stage = firstNode?.getStage?.();
    if (!stage) return;
    const shouldSyncOnDragMove = !(
      selectedElements.length === 1 &&
      esImagenSeleccionada
    );

    let rafId = null;
    const cancelPendingSync = () => {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
    const syncTransformer = (source = "unknown") => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const tr = transformerRef.current;
        if (!tr) return;
        const finishPerf = startCanvasDragPerfSpan("transformer:sync", {
          selectedCount: selectedElements.length,
          source,
        }, {
          throttleMs: 180,
          throttleKey: `transformer:sync:${source}`,
        });
        try {
          if (tr.isTransforming?.()) {
            finishPerf?.({ reason: "is-transforming" });
            return;
          }
        } catch {}
        try { tr.forceUpdate?.(); } catch { }
        tr.getLayer?.()?.batchDraw?.();
        finishPerf?.({
          elementId: firstId,
          elementType: primerElemento?.tipo || null,
        });
      });
    };

    const onStageDragMove = () => syncTransformer("dragmove");
    const onStageDragStart = () => cancelPendingSync();
    const onStageDragEnd = () => syncTransformer("dragend");
    const onGlobalDraggingStart = () => cancelPendingSync();

    if (shouldSyncOnDragMove) {
      stage.on("dragmove", onStageDragMove);
    } else {
      trackCanvasDragPerf("transformer:skip-dragmove-sync", {
        selectedCount: selectedElements.length,
        elementId: firstId,
        elementType: primerElemento?.tipo || null,
      }, {
        throttleMs: 400,
        throttleKey: "transformer:skip-dragmove-sync",
      });
    }
    stage.on("dragstart", onStageDragStart);
    stage.on("dragend", onStageDragEnd);
    window.addEventListener("dragging-start", onGlobalDraggingStart);

    return () => {
      if (shouldSyncOnDragMove) {
        stage.off("dragmove", onStageDragMove);
      }
      stage.off("dragstart", onStageDragStart);
      stage.off("dragend", onStageDragEnd);
      window.removeEventListener("dragging-start", onGlobalDraggingStart);
      cancelPendingSync();
    };
  }, [
    selectedElements,
    selectedElements.join(","),
    elementRefs,
    esImagenSeleccionada,
    primerElemento?.tipo,
  ]);




  // ðŸ”¥ Render

  if (shouldSuppressDuringDeferredDrag || shouldHideTransformerDuringDrag) return null;

  if (selectedElements.length === 0) return null;

  if (hayLineas && elementosTransformables.length === 0) {
    return (
      <SelectionBoundsIndicator
        selectedElements={selectedElements}
        elementRefs={elementRefs}
        objetos={objetos}
        isMobile={isMobile}
        debugLog={slog}
      />
    );
  }

  if (hayLineas && elementosTransformables.length > 0) {
    return (
      <SelectionBoundsIndicator
        selectedElements={selectedElements}
        elementRefs={elementRefs}
        objetos={objetos}
        isMobile={isMobile}
        debugLog={slog}
      />
    );
  }

  const isResizeHintVisible =
    resizeHintPhase > 0 &&
    !isResizeGestureActive &&
    !isTransformingResizeRef.current;
  const shouldUseLightweightRotateOverlay =
    esImagenSeleccionada && isImageRotateGestureActive;
  const transformerBorderStroke = isResizeHintVisible
    ? SELECTION_FRAME_ACTIVE_STROKE
    : SELECTION_FRAME_STROKE;
  const transformerBorderVisualWidth = shouldUseLightweightRotateOverlay
    ? (isMobile ? 1.35 : 1)
    : isResizeHintVisible
    ? resizeHintPhase === 2
      ? transformerHintBorderStrongStrokeWidth
      : transformerHintBorderSoftStrokeWidth
    : transformerBorderStrokeWidth;
  const transformerPaddingForRender = shouldUseLightweightRotateOverlay
    ? Math.max(6, transformerPadding - (isMobile ? 2 : 1))
    : transformerPadding;
  const rotationIndicatorShadowBlur = shouldUseLightweightRotateOverlay
    ? 0
    : (isMobile ? 12 : 8);
  const rotationIndicatorShadowOffset = shouldUseLightweightRotateOverlay
    ? { x: 0, y: 0 }
    : { x: 0, y: isMobile ? 4 : 3 };

  return (
    <>
      <Group
        ref={rotationIndicatorGroupRef}
        name="ui rotation-angle-indicator"
        listening={false}
        visible={false}
      >
        <Rect
          x={0}
          y={0}
          width={rotationIndicatorWidth}
          height={rotationIndicatorHeight}
          cornerRadius={999}
          fill="rgba(255, 255, 255, 0.97)"
          stroke="rgba(147, 51, 234, 0.24)"
          strokeWidth={isMobile ? 1.5 : 1}
          shadowColor="rgba(88, 28, 135, 0.16)"
          shadowBlur={rotationIndicatorShadowBlur}
          shadowOffset={rotationIndicatorShadowOffset}
          shadowOpacity={rotationIndicatorShadowBlur > 0 ? 1 : 0}
          perfectDrawEnabled={false}
        />
        <Text
          ref={rotationIndicatorLabelRef}
          name="rotation-angle-label"
          x={0}
          y={0}
          width={rotationIndicatorWidth}
          height={rotationIndicatorHeight}
          align="center"
          verticalAlign="middle"
          fill="#6B21A8"
          fontSize={rotationIndicatorFontSize}
          fontStyle="bold"
          text={"0" + String.fromCharCode(176)}
          listening={false}
          perfectDrawEnabled={false}
        />
      </Group>

      <Transformer
      name="ui"
      ref={transformerRef}

      // ðŸ”µ borde siempre visible
      borderEnabled={!shouldUseLightweightRotateOverlay}

      borderStroke={transformerBorderStroke}


      borderStrokeWidth={transformerBorderVisualWidth}
      padding={transformerPaddingForRender}

      // âŒ nodos y rotaciÃ³n OFF durante drag
      enabledAnchors={
        interactionLocked || (effectiveDragging && !isResizeGestureActive)
          ? []
          : shouldUseLightweightRotateOverlay
            ? []
          : ["bottom-right"]
      }
      rotateEnabled={!interactionLocked && !effectiveDragging && !esGaleria}
      onMouseDown={handleResizeAnchorPressStart}
      onTouchStart={handleResizeAnchorPressStart}
      onPointerDown={handleResizeAnchorPressStart}
      onMouseUp={clearResizeAnchorPressFeedback}
      onTouchEnd={clearResizeAnchorPressFeedback}
      onPointerUp={clearResizeAnchorPressFeedback}
      onTouchCancel={clearResizeAnchorPressFeedback}
      onPointerCancel={clearResizeAnchorPressFeedback}

      anchorFill={transformerAnchorFillColor}
      anchorStroke={transformerAnchorStrokeColor}
      anchorStrokeWidth={transformerAnchorStrokeWidth}
      anchorSize={transformerAnchorSize}
      anchorCornerRadius={transformerAnchorRadius}
      anchorShadowColor={transformerAnchorShadowColor}
      anchorShadowBlur={transformerAnchorShadowBlur}
      anchorShadowOffset={{ x: 0, y: transformerAnchorShadowOffsetY }}
      anchorStyleFunc={(anchor) => {
        const anchorName =
          typeof anchor?.name === "function"
            ? String(anchor.name() || "").split(" ")[0]
            : "";
        const isRotateAnchorNode = anchorName === "rotater";
        const isResizeAnchorNode = Boolean(anchorName) && !isRotateAnchorNode;
        const isResizeActiveFallback =
          isResizeGestureActive ||
          isTransformingResizeRef.current ||
          (typeof window !== "undefined" &&
            Boolean(window._resizeData?.isResizing));
        const isPressedResizeAnchor =
          isResizeActiveFallback &&
          isResizeAnchorNode &&
          (!pressedResizeAnchorName || anchorName === pressedResizeAnchorName);
        const isResizeHintAnchor =
          !isPressedResizeAnchor &&
          !isResizeActiveFallback &&
          isResizeAnchorNode &&
          resizeHintPhase > 0;
        const isPressedRotateAnchor =
          isResizeActiveFallback &&
          isRotateAnchorNode &&
          (!pressedResizeAnchorName || anchorName === pressedResizeAnchorName);
        const isStrongResizeHint = isResizeHintAnchor && resizeHintPhase === 2;

        if (shouldUseLightweightRotateOverlay) {
          if (isRotateAnchorNode) {
            anchor.fill("rgba(147, 51, 234, 0.001)");
            anchor.stroke("rgba(147, 51, 234, 0.001)");
            anchor.strokeWidth(0.01);
            anchor.shadowEnabled(false);
            anchor.shadowForStrokeEnabled(false);
            anchor.shadowOpacity(0);
            anchor.shadowBlur(0);
            anchor.shadowOffset({ x: 0, y: 0 });
            anchor.hitStrokeWidth(isMobile ? 28 : 14);
            anchor.opacity(0.01);
            anchor.scale({ x: 0.12, y: 0.12 });
            return;
          }
          anchor.fill(transformerAnchorFillColor);
          anchor.shadowEnabled(false);
          anchor.shadowForStrokeEnabled(false);
          anchor.shadowOpacity(0);
          anchor.shadowBlur(0);
          anchor.shadowOffset({ x: 0, y: 0 });
          anchor.hitStrokeWidth(isMobile ? 48 : 20);
          anchor.stroke(transformerAnchorStrokeColor);
          anchor.strokeWidth(isMobile ? 1.8 : 1.4);
          anchor.opacity(0.96);
          anchor.scale({ x: 1, y: 1 });
          return;
        }
        if (isRotateAnchorNode) {
          anchor.shadowColor(
            isPressedRotateAnchor
              ? transformerRotateAnchorPressedShadowColor
              : transformerRotateAnchorShadowColor
          );
          anchor.fill(
            isPressedRotateAnchor
              ? transformerRotateAnchorPressedFillColor
              : transformerRotateAnchorFillColor
          );
          anchor.shadowEnabled(true);
          anchor.shadowForStrokeEnabled(true);
          anchor.shadowOpacity(1);
          anchor.shadowBlur(
            isPressedRotateAnchor
              ? transformerRotateAnchorPressedShadowBlur
              : transformerRotateAnchorShadowBlur
          );
          anchor.shadowOffset({
            x: 0,
            y: isPressedRotateAnchor
              ? transformerRotateAnchorPressedShadowOffsetY
              : transformerRotateAnchorShadowOffsetY,
          });
          anchor.hitStrokeWidth(transformerRotateAnchorHitStrokeWidth);
          anchor.stroke(
            isPressedRotateAnchor
              ? transformerRotateAnchorPressedStrokeColor
              : transformerRotateAnchorStrokeColor
          );
          anchor.strokeWidth(
            isPressedRotateAnchor
              ? transformerRotateAnchorPressedStrokeWidth
              : transformerRotateAnchorStrokeWidth
          );
          anchor.opacity(isPressedRotateAnchor ? 1 : 0.98);
          anchor.scale({
            x: isPressedRotateAnchor
              ? transformerRotateAnchorPressedScale
              : transformerRotateAnchorScale,
            y: isPressedRotateAnchor
              ? transformerRotateAnchorPressedScale
              : transformerRotateAnchorScale,
          });
          return;
        }
        const anchorFillColor = isPressedResizeAnchor
          ? transformerAnchorPressedFillColor
          : isResizeHintAnchor
            ? transformerAnchorHintFillColor
            : transformerAnchorFillColor;
        let anchorShadowColor = isPressedResizeAnchor
          ? transformerAnchorPressedShadowColor
          : isResizeHintAnchor
            ? transformerAnchorHintShadowColor
            : transformerAnchorShadowColor;
        let anchorShadowBlur = isPressedResizeAnchor
          ? transformerAnchorPressedShadowBlur
          : isResizeHintAnchor
            ? isStrongResizeHint
              ? transformerAnchorHintStrongShadowBlur
              : transformerAnchorHintSoftShadowBlur
            : transformerAnchorShadowBlur;
        let anchorShadowOpacity = isPressedResizeAnchor
          ? 1
          : isResizeHintAnchor
            ? isStrongResizeHint
              ? (isMobile ? 1 : 0.72)
              : (isMobile ? 0.85 : 0.42)
            : (isMobile ? 0.26 : 0.12);
        let anchorStrokeColor = isPressedResizeAnchor
          ? transformerAnchorPressedHaloStrokeColor
          : isResizeHintAnchor
            ? transformerAnchorHintStrokeColor
            : transformerAnchorStrokeColor;
        let anchorStrokeWidth = isPressedResizeAnchor
          ? transformerAnchorPressedHaloStrokeWidth
          : isResizeHintAnchor
            ? isStrongResizeHint
              ? (isMobile ? 3.4 : 3.3)
              : (isMobile ? 2.8 : 2.8)
            : transformerAnchorStrokeWidth;
        const anchorHitStrokeWidth = isPressedResizeAnchor
          ? transformerAnchorPressedHitStrokeWidth
          : isResizeHintAnchor
            ? transformerAnchorHintHitStrokeWidth
            : transformerAnchorHitStrokeWidth;
        let anchorScale = isPressedResizeAnchor
          ? transformerAnchorPressedScale
          : isResizeHintAnchor
            ? isStrongResizeHint
              ? transformerAnchorHintStrongScale
              : transformerAnchorHintSoftScale
            : 1;

        anchor.shadowColor(anchorShadowColor);
        anchor.fill(anchorFillColor);
        anchor.shadowEnabled(true);
        // En pressed, el halo nace mÃ¡s cerca del anillo para que se note mejor.
        anchor.shadowForStrokeEnabled(true);
        anchor.shadowOpacity(anchorShadowOpacity);
        anchor.shadowBlur(anchorShadowBlur);
        anchor.shadowOffset({
          x: 0,
          y: isPressedResizeAnchor
            ? transformerAnchorPressedShadowOffsetY
            : isResizeHintAnchor
              ? (isMobile ? 0 : transformerAnchorShadowOffsetY)
            : transformerAnchorShadowOffsetY,
        });
        anchor.hitStrokeWidth(anchorHitStrokeWidth);
        anchor.stroke(anchorStrokeColor);
        anchor.strokeWidth(anchorStrokeWidth);
        anchor.opacity(isResizeHintAnchor || isPressedResizeAnchor ? 1 : 0.98);
        anchor.scale({ x: anchorScale, y: anchorScale });
      }}
      keepRatio={lockAspectCountdown || esGaleria || lockAspectText}
      centeredScaling={selectedElements.length === 1 && esTexto}
      flipEnabled={false}
      resizeEnabled={!interactionLocked && (!effectiveDragging || isResizeGestureActive)}
      rotationSnaps={transformerRotationSnaps}
      rotateAnchorOffset={transformerRotateOffset}
      rotateLineVisible={!shouldUseLightweightRotateOverlay}
      rotationSnapTolerance={transformerRotationSnapTolerance}
      boundBoxFunc={(oldBox, newBox) => {
        const minSize = esTexto ? 20 : 10;
        const maxSize = 800;
        if (esGaleria) {
          const rows = Math.max(1, Number(primerElemento?.rows) || 1);
          const cols = Math.max(1, Number(primerElemento?.cols) || 1);
          const gap = Math.max(0, Number(primerElemento?.gap) || 0);
          const cellRatio =
            primerElemento?.ratio === "4:3"
              ? 3 / 4
              : primerElemento?.ratio === "16:9"
                ? 9 / 16
                : 1;

          const minGridWidth = gap * (cols - 1) + cols;
          const nextWidth = Math.min(
            maxSize,
            Math.max(minSize, minGridWidth, Math.abs(newBox.width))
          );
          const cellW = Math.max(1, (nextWidth - gap * (cols - 1)) / cols);
          const cellH = cellW * cellRatio;
          const nextHeight = rows * cellH + gap * (rows - 1);

          return resolveStageBoundBox(oldBox, {
            ...newBox,
            width: nextWidth,
            height: Math.max(minSize, nextHeight),
          });
        }

        if (newBox.width < minSize || newBox.height < minSize) {
          return oldBox;
        }

        if (lockAspectCountdown) {
          const baseW = Math.max(1, oldBox.width);
          const baseH = Math.max(1, oldBox.height);
          const ratio = baseW / baseH;

          const dw = Math.abs(newBox.width - oldBox.width) / baseW;
          const dh = Math.abs(newBox.height - oldBox.height) / baseH;

          let width = newBox.width;
          let height = newBox.height;

          if (dh > dw) {
            width = height * ratio;
          } else {
            height = width / ratio;
          }

          return resolveStageBoundBox(oldBox, {
            ...newBox,
            width: Math.min(Math.max(width, minSize), maxSize),
            height: Math.min(Math.max(height, minSize), maxSize),
          });
        }

        if (
          primerElemento?.tipo === "forma" &&
          primerElemento?.figura === "circle"
        ) {
          const size = Math.max(newBox.width, newBox.height);
          const finalSize = Math.min(size, maxSize);
          return resolveStageBoundBox(oldBox, {
            ...newBox,
            width: finalSize,
            height: finalSize,
          });
        }

        if (esTriangulo) {
          const safeOldW = Math.max(1, Math.abs(oldBox.width || minSize));
          const safeOldH = Math.max(1, Math.abs(oldBox.height || minSize));
          const scaleX = Math.abs(newBox.width) / safeOldW;
          const scaleY = Math.abs(newBox.height) / safeOldH;
          const uniformScale = Math.max(0.05, Math.min(scaleX, scaleY));

          const width = Math.min(Math.max(safeOldW * uniformScale, minSize), maxSize);
          const height = Math.min(Math.max(safeOldH * uniformScale, minSize), maxSize);

          return resolveStageBoundBox(oldBox, {
            ...newBox,
            width,
            height,
          });
        }

        if (
          primerElemento?.tipo === "imagen" ||
          primerElemento?.tipo === "icono"
        ) {
          const scaleX = newBox.width / oldBox.width;
          const scaleY = newBox.height / oldBox.height;
          const uniformScale = Math.min(scaleX, scaleY);

          const newWidth = oldBox.width * uniformScale;
          const newHeight = oldBox.height * uniformScale;

          return resolveStageBoundBox(oldBox, {
            ...newBox,
            width: Math.min(Math.max(newWidth, minSize), maxSize),
            height: Math.min(Math.max(newHeight, minSize), maxSize),
          });
        }

        return resolveStageBoundBox(oldBox, {
          ...newBox,
          width: Math.min(newBox.width, maxSize),
          height: Math.min(newBox.height, maxSize),
        });
      }}
      onTransformStart={(e) => {
        stopResizeHintPulse();
        isTransformingResizeRef.current = true;
        window._resizeData = { isResizing: true };
        const tr = transformerRef.current;
        const activeAnchor =
          typeof tr?.getActiveAnchor === "function" ? tr.getActiveAnchor() : null;
        const isRotateGesture =
          typeof activeAnchor === "string" &&
          activeAnchor.toLowerCase().includes("rotat");
        transformGestureRef.current = {
          isRotate: isRotateGesture,
          activeAnchor: activeAnchor ?? null,
        };
        if (isRotateGesture) {
          const nodes = typeof tr?.nodes === "function" ? tr.nodes() || [] : [];
          if (esImagenSeleccionada) {
            clearDeferredSourceLayerThaw({ thaw: true });
            setIsImageRotateGestureActive(true);
            const imageNode = nodes[0] || null;
            const imagePose = getTransformPose(imageNode);
            const rotationDebugSession = startImageRotationDebugSession({
              elementId: primerElemento?.id ?? null,
              tipo: primerElemento?.tipo ?? null,
              selectedCount: nodes.length,
              activeAnchor: activeAnchor ?? null,
              pointerType: e?.evt?.pointerType ?? null,
              ...getImageRotationNodeMetrics(imageNode, imagePose),
            });
            const overlayLifted = liftNodeToOverlayLayer(imageNode, dragLayerRef, {
              elementId: primerElemento?.id ?? null,
              tipo: primerElemento?.tipo ?? null,
            }, {
              eventPrefix: "image:rotate-overlay",
              syncDrawSourceLayer: true,
              syncDrawOverlayLayer: true,
            });
            const sourceLayer =
              overlayLifted ? imageNode?.__canvasOverlayLiftLayer || null : null;
            const sourceLayerFreeze = overlayLifted
              ? activateKonvaLayerFreeze(sourceLayer)
              : { frozen: false, layerLabel: null };
            if (overlayLifted) {
              syncTransformerLayer({
                useDragOverlay: true,
                forceTop: true,
              });
              try {
                tr.forceUpdate?.();
                tr.getLayer?.()?.batchDraw?.();
              } catch {}
              syncRotationIndicatorLayer({
                useDragOverlay: true,
                forceTop: true,
              });
              trackImageRotationDebug("image-rotate:overlay-lift", {
                elementId: primerElemento?.id ?? null,
                sessionId: rotationDebugSession?.sessionId || null,
                overlayLifted: true,
              });
            }
            if (sourceLayerFreeze?.frozen) {
              trackImageRotationDebug("image-rotate:source-layer-freeze", {
                elementId: primerElemento?.id ?? null,
                sessionId: rotationDebugSession?.sessionId || null,
                sourceLayerFrozen: true,
                sourceLayerLabel: sourceLayerFreeze?.layerLabel || null,
              });
            }
            const imagePerfPayloadBase = buildImagePerfPayloadFromNode(
              primerElemento,
              imageNode
            );
            const imagePerfPayload = imagePerfPayloadBase
              ? {
                  ...imagePerfPayloadBase,
                  rotationDebugSessionId: rotationDebugSession?.sessionId || null,
                }
              : imagePerfPayloadBase;
            const cacheState = activateImageLayerPerf(imageNode, imagePerfPayload, {
              cacheEventPrefix: "image:rotate-cache",
            });
            imageRotationPerfRef.current = {
              node: imageNode,
              elementId: primerElemento?.id ?? null,
              cacheApplied: cacheState?.cacheApplied === true,
              cacheReused: cacheState?.cacheReused === true,
              overlayLifted,
              sourceLayer,
              sourceLayerFrozen: sourceLayerFreeze?.frozen === true,
              sourceLayerLabel: sourceLayerFreeze?.layerLabel || null,
            };
            trackImageRotationDebug("image-rotate:cache-state", {
              elementId: primerElemento?.id ?? null,
              sessionId:
                typeof window !== "undefined"
                  ? window.__IMAGE_ROTATION_DEBUG_ACTIVE_SESSION?.sessionId || null
                  : null,
              cacheApplied: cacheState?.cacheApplied === true,
              cacheReused: cacheState?.cacheReused === true,
              nodeCached: cacheState?.payload?.nodeCached ?? null,
              cachePixelRatio: cacheState?.payload?.cachePixelRatio ?? null,
              sourceMp: cacheState?.payload?.sourceMp ?? null,
              displayMp: cacheState?.payload?.displayMp ?? null,
              cropScaleX: cacheState?.payload?.cropScaleX ?? null,
              cropScaleY: cacheState?.payload?.cropScaleY ?? null,
              overlayLifted,
              sourceLayerFrozen: sourceLayerFreeze?.frozen === true,
              sourceLayerLabel: sourceLayerFreeze?.layerLabel || null,
            });
            updateRotationIndicator(imageNode);
          } else {
            updateRotationIndicator(nodes[0] || null);
          }
        } else {
          setIsImageRotateGestureActive(false);
          hideRotationIndicator();
        }
        setIsResizeGestureActive(true);
        if (activeAnchor) {
          setPressedResizeAnchorName((current) =>
            current === activeAnchor ? current : activeAnchor
          );
        }
        if (typeof onTransformInteractionStart === "function") {
          onTransformInteractionStart({
            isRotate: isRotateGesture,
            activeAnchor: activeAnchor ?? null,
            pointerType: e?.evt?.pointerType ?? null,
          });
        }
        try {
          const nodes = tr?.nodes?.() || [];
          circleAnchorRef.current = null;
          textTransformAnchorRef.current = null;

          if (
            nodes.length === 1 &&
            primerElemento?.tipo === "forma" &&
            primerElemento?.figura === "circle"
          ) {
            try {
              const r0 = nodes[0].getClientRect({
                skipTransform: false,
                skipShadow: true,
                skipStroke: true,
              });
              circleAnchorRef.current = { left: r0.x, top: r0.y };
            } catch {}
          }

          if (nodes.length === 1 && esTexto) {
            const node = nodes[0];
            let centerX = null;
            let centerY = null;
            let baseWidth = null;
            let baseHeight = null;
            let baseVisualWidth = null;
            try {
              const rect = node.getClientRect({
                skipTransform: false,
                skipShadow: true,
                skipStroke: true,
              });
              if (Number.isFinite(rect?.x) && Number.isFinite(rect?.width)) {
                centerX = rect.x + (rect.width / 2);
              }
              if (Number.isFinite(rect?.y) && Number.isFinite(rect?.height)) {
                centerY = rect.y + (rect.height / 2);
              }
              if (Number.isFinite(rect?.width) && rect.width > 0) {
                baseWidth = rect.width;
                baseVisualWidth = rect.width;
              }
              if (Number.isFinite(rect?.height) && rect.height > 0) {
                baseHeight = rect.height;
              }
            } catch {}
            const safeBaseFontSize =
              Number.isFinite(primerElemento?.fontSize) && primerElemento.fontSize > 0
                ? primerElemento.fontSize
                : 24;
            textTransformAnchorRef.current = {
              y: typeof node?.y === "function" ? node.y() : 0,
              baseRotation:
                typeof node?.rotation === "function" ? (node.rotation() || 0) : 0,
              centerX,
              centerY,
              baseWidth,
              baseHeight,
              baseFontSize: safeBaseFontSize,
              lastPreviewFontSize: safeBaseFontSize,
              lastPreviewCenterX: centerX,
              lastPreviewCenterY: centerY,
              lastPreviewVisualWidth: baseVisualWidth,
              previewTick: 0,
            };
            TXTDBG("start", {
              id: primerElemento?.id ?? null,
              baseFontSize: safeBaseFontSize,
              baseWidth,
              baseHeight,
              centerX,
              centerY,
              nodeX: typeof node?.x === "function" ? node.x() : null,
              nodeY: typeof node?.y === "function" ? node.y() : null,
              nodeScaleX: typeof node?.scaleX === "function" ? node.scaleX() : null,
              nodeScaleY: typeof node?.scaleY === "function" ? node.scaleY() : null,
            });
          }

          const union = rectFromNodes(nodes);

          const pad = typeof tr?.padding === "function" ? tr.padding() : 0;
          const borderRect = union
            ? { x: union.x - pad, y: union.y - pad, width: union.width + pad * 2, height: union.height + pad * 2 }
            : null;

          const n = nodes[0];
          const id = n ? (typeof n.id === "function" ? n.id() : n.attrs?.id) : "âˆ…";
          const trRect = tr?.getClientRect?.({ skipTransform: false, skipShadow: true, skipStroke: true });

          slog(
            "[TR] start",
            `id=${id}`,
            `nodes=${nodes.length}`,
            union ? `union(w=${union.width.toFixed(1)},h=${union.height.toFixed(1)})` : "union(null)",
            borderRect ? `border(w=${borderRect.width.toFixed(1)},h=${borderRect.height.toFixed(1)})` : "border(null)",
            trRect ? `trRect(w=${trRect.width.toFixed(1)},h=${trRect.height.toFixed(1)})` : "trRect(null)",
            `pad=${pad}`
          );
        } catch { }
      }}

      onTransform={(e) => {
        if (!onTransform || !transformerRef.current) return;

        const tr = transformerRef.current;
        const nodes = typeof tr.nodes === "function" ? tr.nodes() || [] : [];
        const node = nodes[0]; // âœ… nodo real (single select)
        if (!node) return;
        if (transformGestureRef.current?.isRotate) {
          updateRotationIndicator(node);
        } else {
          hideRotationIndicator();
        }

        try {
          const transformStartedAt =
            typeof performance !== "undefined" && typeof performance.now === "function"
              ? performance.now()
              : Date.now();
          const pose = getTransformPose(node);
          const stage = node?.getStage?.() || null;
          const pointer =
            stage && typeof stage.getPointerPosition === "function"
              ? stage.getPointerPosition()
              : null;
          if (transformGestureRef.current?.isRotate && esImagenSeleccionada) {
            trackImageRotationPreview({
              elementId: primerElemento?.id ?? null,
              tipo: primerElemento?.tipo ?? null,
              activeAnchor: transformGestureRef.current?.activeAnchor ?? null,
              pointerType: e?.evt?.pointerType ?? null,
              pointerX: Number.isFinite(Number(pointer?.x)) ? roundNodeMetric(pointer.x) : null,
              pointerY: Number.isFinite(Number(pointer?.y)) ? roundNodeMetric(pointer.y) : null,
              handlerDurationMs:
                typeof performance !== "undefined" && typeof performance.now === "function"
                  ? roundNodeMetric(performance.now() - transformStartedAt)
                  : roundNodeMetric(Date.now() - transformStartedAt),
              ...getImageRotationNodeMetrics(node, pose),
            });
          }
          const transformData = {
            x: pose.x,
            y: pose.y,
            rotation: pose.rotation,
            isPreview: true,
          };

          if (esTexto) {
            const originalFontSize = primerElemento.fontSize || 24;
            const scaleX = typeof node.scaleX === "function" ? node.scaleX() : 1;
            const scaleY = typeof node.scaleY === "function" ? node.scaleY() : 1;
            const anchorData = textTransformAnchorRef.current || null;
            const baseFontSize =
              Number.isFinite(anchorData?.baseFontSize) &&
              anchorData.baseFontSize > 0
                ? anchorData.baseFontSize
                : originalFontSize;

            const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
            let scaleFromRect = null;
            let liveRectWidth = null;
            const currentRotation =
              typeof node.rotation === "function" ? (node.rotation() || 0) : 0;
            const baseRotation = Number(anchorData?.baseRotation);
            const rotationDelta = Number.isFinite(baseRotation)
              ? Math.abs(currentRotation - baseRotation)
              : 0;
            try {
              const rect = node.getClientRect({
                skipTransform: false,
                skipShadow: true,
                skipStroke: true,
              });
              if (Number.isFinite(rect?.width) && rect.width > 0) {
                liveRectWidth = rect.width;
              }
              const baseWidth = Number(anchorData?.baseWidth);
              if (
                Number.isFinite(baseWidth) &&
                baseWidth > 0 &&
                Number.isFinite(rect?.width) &&
                rect.width > 0
              ) {
                scaleFromRect = rect.width / baseWidth;
              }
            } catch {}
            const canUseRectScale = rotationDelta < 0.1;
            const effectiveScale =
              canUseRectScale && Number.isFinite(scaleFromRect) && scaleFromRect > 0
                ? scaleFromRect
                : avgScale;
            transformData.fontSize = Math.max(
              6,
              Number((baseFontSize * effectiveScale).toFixed(3))
            );
            if (textTransformAnchorRef.current) {
              const tick = Number(textTransformAnchorRef.current.previewTick || 0) + 1;
              textTransformAnchorRef.current.previewTick = tick;
              textTransformAnchorRef.current.lastPreviewFontSize = transformData.fontSize;
              if (Number.isFinite(liveRectWidth) && liveRectWidth > 0) {
                textTransformAnchorRef.current.lastPreviewVisualWidth = liveRectWidth;
              }
              if (tick <= 2 || tick % 5 === 0) {
                TXTDBG("preview", {
                  id: primerElemento?.id ?? null,
                  tick,
                  scaleX,
                  scaleY,
                  avgScale,
                  scaleFromRect,
                  effectiveScale,
                  baseFontSize,
                  fontSize: transformData.fontSize,
                  liveRectWidth,
                  centerXTarget: textTransformAnchorRef.current?.centerX ?? null,
                  nodeX: typeof node?.x === "function" ? node.x() : null,
                  nodeY: typeof node?.y === "function" ? node.y() : null,
                });
              }
            }
            transformData.scaleX = 1;
            transformData.scaleY = 1;
            if (canUseRectScale && Number.isFinite(textTransformAnchorRef.current?.y)) {
              transformData.y = textTransformAnchorRef.current.y;
            }
            if (Number.isFinite(textTransformAnchorRef.current?.centerX)) {
              transformData.textCenterX = textTransformAnchorRef.current.centerX;
              if (textTransformAnchorRef.current) {
                textTransformAnchorRef.current.lastPreviewCenterX =
                  textTransformAnchorRef.current.centerX;
              }
            }
            if (Number.isFinite(textTransformAnchorRef.current?.centerY)) {
              transformData.textCenterY = textTransformAnchorRef.current.centerY;
              if (textTransformAnchorRef.current) {
                textTransformAnchorRef.current.lastPreviewCenterY =
                  textTransformAnchorRef.current.centerY;
              }
            }
          } else {
            const scaleX = typeof node.scaleX === "function" ? node.scaleX() : 1;
            const scaleY = typeof node.scaleY === "function" ? node.scaleY() : 1;

            transformData.scaleX = scaleX;
            transformData.scaleY = scaleY;

            if (primerElemento?.tipo === "countdown") {
              const countdownSize = getCountdownScaledSize(node);
              transformData.width = countdownSize.width;
              transformData.height = countdownSize.height;
            } else if (esTriangulo) {
              const baseRadius = Number.isFinite(primerElemento?.radius)
                ? primerElemento.radius
                : 60;
              const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
              transformData.radius = Math.max(1, baseRadius * avgScale);
            } else {
              const originalWidth = primerElemento.width || 100;
              const originalHeight = primerElemento.height || 100;
              transformData.width = Math.abs(originalWidth * scaleX);
              transformData.height = Math.abs(originalHeight * scaleY);
            }

            if (primerElemento?.figura === "circle") {
              try {
                const liveRect = node.getClientRect({
                  skipTransform: false,
                  skipShadow: true,
                  skipStroke: true,
                });
                const diameter = Math.max(1, Math.max(liveRect.width, liveRect.height));
                transformData.radius = diameter / 2;
                const anchor = circleAnchorRef.current;
                if (anchor) {
                  transformData.x = anchor.left + transformData.radius;
                  transformData.y = anchor.top + transformData.radius;
                } else {
                  transformData.x = liveRect.x + transformData.radius;
                  transformData.y = liveRect.y + transformData.radius;
                }
              } catch {}
            }
          }

          onTransform(transformData);

          // --- LOG COMPACTO (opcional) ---
          const id = (typeof node.id === "function" ? node.id() : node.attrs?.id) || "âˆ…";
          const sx = node.scaleX?.() ?? 1;
          const sy = node.scaleY?.() ?? 1;
          const r = node.getClientRect({ skipTransform: false, skipShadow: true, skipStroke: true });
          slog(
            "[TR] live",
            `id=${id}`,
            `tipo=${primerElemento?.tipo || "âˆ…"}`,
            `sx=${sx.toFixed(3)}`,
            `sy=${sy.toFixed(3)}`,
            `x=${(node.x?.() ?? 0).toFixed(1)}`,
            `y=${(node.y?.() ?? 0).toFixed(1)}`,
            `nodeRect(w=${r.width.toFixed(1)},h=${r.height.toFixed(1)})`,
            `w=${transformData.width ?? "âˆ…"}`,
            `h=${transformData.height ?? "âˆ…"}`
          );
        } catch (error) {
          console.warn("Error en onTransform:", error);
        }
      }}
      onTransformEnd={(e) => {
        const interactionSnapshot = {
          isRotate: Boolean(transformGestureRef.current?.isRotate),
          activeAnchor: transformGestureRef.current?.activeAnchor ?? null,
          pointerType: e?.evt?.pointerType ?? null,
        };
        const notifyTransformInteractionEnd = () => {
          if (typeof onTransformInteractionEnd === "function") {
            onTransformInteractionEnd(interactionSnapshot);
          }
          transformGestureRef.current = {
            isRotate: false,
            activeAnchor: null,
          };
        };

        try {
          if (!transformerRef.current || !onTransform) return;
          hideRotationIndicator();

          const tr = transformerRef.current;
          const nodes = typeof tr.nodes === "function" ? tr.nodes() || [] : [];

        // -------------------------
        // MULTI-SELECCIÃ“N
        // -------------------------
        if (nodes.length > 1) {
          try {
            const tScaleX = typeof tr.scaleX === "function" ? tr.scaleX() || 1 : 1;
            const tScaleY = typeof tr.scaleY === "function" ? tr.scaleY() || 1 : 1;
            const avg = (Math.abs(tScaleX) + Math.abs(tScaleY)) / 2;

            const updates = nodes
              .map((n) => {
                let id = null;
                try {
                  id = (typeof n.id === "function" ? n.id() : n.attrs?.id) || null;
                } catch { }
                if (!id) return null;

                const obj = (objetos || []).find((o) => o.id === id);
                if (!obj) return null;

                const upd = {
                  id,
                  x: typeof n.x === "function" ? n.x() : obj.x,
                  y: typeof n.y === "function" ? n.y() : obj.y,
                  rotation: typeof n.rotation === "function" ? n.rotation() || 0 : (obj.rotation || 0),
                };

                if (obj.tipo === "texto") {
                  const base = obj.fontSize || 24;
                  upd.fontSize = Math.max(6, Math.round(base * avg));
                  if (typeof n.scaleX === "function") {
                    n.scaleX(1);
                    n.scaleY(1);
                  }
                  return upd;
                }

                if (obj.tipo === "forma" && obj.figura === "circle") {
                  const baseR = obj.radius || 50;
                  upd.radius = baseR * avg;
                  if (typeof n.scaleX === "function") {
                    n.scaleX(1);
                    n.scaleY(1);
                  }
                  return upd;
                }

                if (obj.tipo === "forma" && obj.figura === "triangle") {
                  const baseR = obj.radius || 60;
                  upd.radius = Math.max(1, baseR * avg);
                  if (typeof n.scaleX === "function") {
                    n.scaleX(1);
                    n.scaleY(1);
                  }
                  return upd;
                }

                if (obj.tipo === "countdown") {
                  const countdownSize = getCountdownScaledSize(n);
                  upd.width = countdownSize.width;
                  upd.height = countdownSize.height;
                  return upd;
                }

                const baseW =
                  obj.width != null ? obj.width : (typeof n.width === "function" ? n.width() : 100);
                const baseH =
                  obj.height != null ? obj.height : (typeof n.height === "function" ? n.height() : 100);

                upd.width = Math.abs(baseW * tScaleX);
                upd.height = Math.abs(baseH * tScaleY);

                if (typeof n.scaleX === "function") {
                  n.scaleX(1);
                  n.scaleY(1);
                }
                return upd;
              })
              .filter(Boolean);

            onTransform({ isFinal: true, batch: updates });

            if (typeof tr.scaleX === "function") {
              tr.scaleX(1);
              tr.scaleY(1);
            }
            tr.getLayer()?.batchDraw();

            window._resizeData = { isResizing: false };
            setTimeout(() => {
              window._resizeData = null;
            }, 100);

            return;
          } catch (err) {
            console.warn("Error en onTransformEnd (multi):", err);
            window._resizeData = null;
            return;
          }
        }

        // -------------------------
        // SINGLE-SELECCIÃ“N
        // -------------------------
        const node = nodes[0];
        if (!node) {
          if (transformGestureRef.current?.isRotate && esImagenSeleccionada) {
            const rotationPerfRelease = releaseImageRotationPerf({
              logOverlayRestore: true,
            });
            finishImageRotationDebugSession({
              elementId: primerElemento?.id ?? null,
              reason: "transform-end-missing-node",
              cacheCleared: rotationPerfRelease?.cacheRelease?.cacheCleared === true,
              overlayRestored: rotationPerfRelease?.overlayRestored === true,
            });
          }
          return;
        }

        const pose = getTransformPose(node);
        const finalData = {
            x: pose.x,
            y: pose.y,
            rotation: pose.rotation,
            isFinal: true,
          };
          let textPreviewEndSnapshot = null;

          if (esTexto) {
            const originalFontSize = primerElemento.fontSize || 24;
            const scaleX = typeof node.scaleX === "function" ? node.scaleX() : 1;
            const scaleY = typeof node.scaleY === "function" ? node.scaleY() : 1;
            const anchorData = textTransformAnchorRef.current || null;
            const baseFontSize =
              Number.isFinite(anchorData?.baseFontSize) &&
              anchorData.baseFontSize > 0
                ? anchorData.baseFontSize
                : originalFontSize;
            const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
            let scaleFromRect = null;
            let visualWidthFromRect = null;
            const currentRotation =
              typeof node.rotation === "function" ? (node.rotation() || 0) : 0;
            const baseRotation = Number(anchorData?.baseRotation);
            const rotationDelta = Number.isFinite(baseRotation)
              ? Math.abs(currentRotation - baseRotation)
              : 0;
            try {
              const rect = node.getClientRect({
                skipTransform: false,
                skipShadow: true,
                skipStroke: true,
              });
              if (Number.isFinite(rect?.width) && rect.width > 0) {
                visualWidthFromRect = rect.width;
              }
              const baseWidth = Number(anchorData?.baseWidth);
              if (
                Number.isFinite(baseWidth) &&
                baseWidth > 0 &&
                Number.isFinite(rect?.width) &&
                rect.width > 0
              ) {
                scaleFromRect = rect.width / baseWidth;
              }
            } catch {}
            const canUseRectScale = rotationDelta < 0.1;
            const effectiveScale =
              canUseRectScale && Number.isFinite(scaleFromRect) && scaleFromRect > 0
                ? scaleFromRect
                : avgScale;

            const computedFontSize = Math.max(
              6,
              Number((baseFontSize * effectiveScale).toFixed(3))
            );
            finalData.fontSize = Math.max(
              6,
              Number(
                Number.isFinite(anchorData?.lastPreviewFontSize) &&
                  anchorData.lastPreviewFontSize > 0
                  ? anchorData.lastPreviewFontSize
                  : computedFontSize
              )
            );
            finalData.scaleX = 1;
            finalData.scaleY = 1;
            if (canUseRectScale && Number.isFinite(anchorData?.y)) {
              finalData.y = anchorData.y;
            }
            if (Number.isFinite(anchorData?.lastPreviewCenterX)) {
              finalData.textCenterX = anchorData.lastPreviewCenterX;
            } else if (Number.isFinite(anchorData?.centerX)) {
              finalData.textCenterX = anchorData.centerX;
            }
            if (Number.isFinite(anchorData?.lastPreviewCenterY)) {
              finalData.textCenterY = anchorData.lastPreviewCenterY;
            } else if (Number.isFinite(anchorData?.centerY)) {
              finalData.textCenterY = anchorData.centerY;
            }
            const visualWidth =
              Number.isFinite(anchorData?.lastPreviewVisualWidth) &&
              anchorData.lastPreviewVisualWidth > 0
                ? anchorData.lastPreviewVisualWidth
                : visualWidthFromRect;
            if (Number.isFinite(visualWidth) && visualWidth > 0) {
              finalData.textVisualWidth = visualWidth;
            }
            textPreviewEndSnapshot = {
              id: primerElemento?.id ?? null,
              x: typeof node?.x === "function" ? node.x() : null,
              y: typeof node?.y === "function" ? node.y() : null,
              scaleX,
              scaleY,
              fontSize: typeof node?.fontSize === "function" ? node.fontSize() : null,
              rectWidth: Number.isFinite(visualWidthFromRect) ? visualWidthFromRect : null,
              rectHeight: null,
            };
            try {
              const rectForSnapshot = node.getClientRect({
                skipTransform: false,
                skipShadow: true,
                skipStroke: true,
              });
              if (Number.isFinite(rectForSnapshot?.height)) {
                textPreviewEndSnapshot.rectHeight = rectForSnapshot.height;
              }
            } catch {}
            TXTDBG("end", {
              id: primerElemento?.id ?? null,
              scaleX,
              scaleY,
              avgScale,
              scaleFromRect,
              effectiveScale,
              computedFontSize,
              finalFontSize: finalData.fontSize,
              textCenterX: finalData.textCenterX ?? null,
              textCenterY: finalData.textCenterY ?? null,
              textVisualWidth: finalData.textVisualWidth ?? null,
              nodeRectWidth: visualWidthFromRect,
              nodeX: typeof node?.x === "function" ? node.x() : null,
              nodeY: typeof node?.y === "function" ? node.y() : null,
            });

            // Aplanar escala del texto en el release para evitar doble escalado
            // (escala del nodo + fontSize persistido).
            try {
              if (typeof node.scaleX === "function") node.scaleX(1);
              if (typeof node.scaleY === "function") node.scaleY(1);

              if (
                Number.isFinite(finalData.fontSize) &&
                typeof node.fontSize === "function"
              ) {
                node.fontSize(finalData.fontSize);
              }
              const targetCenterX = Number(finalData.textCenterX);
              const targetCenterY = Number(finalData.textCenterY);
              if (
                (Number.isFinite(targetCenterX) || Number.isFinite(targetCenterY)) &&
                typeof node.x === "function" &&
                typeof node.y === "function"
              ) {
                try {
                  const flattenedRect = node.getClientRect({
                    skipTransform: false,
                    skipShadow: true,
                    skipStroke: true,
                  });
                  const flattenedCenterX =
                    Number.isFinite(flattenedRect?.x) &&
                    Number.isFinite(flattenedRect?.width)
                      ? flattenedRect.x + (flattenedRect.width / 2)
                      : null;
                  const flattenedCenterY =
                    Number.isFinite(flattenedRect?.y) &&
                    Number.isFinite(flattenedRect?.height)
                      ? flattenedRect.y + (flattenedRect.height / 2)
                      : null;

                  if (Number.isFinite(flattenedCenterX) && Number.isFinite(targetCenterX)) {
                    node.x(node.x() + (targetCenterX - flattenedCenterX));
                  }
                  if (Number.isFinite(flattenedCenterY) && Number.isFinite(targetCenterY)) {
                    node.y(node.y() + (targetCenterY - flattenedCenterY));
                  }
                } catch {}
              }

              node.getLayer()?.batchDraw();
            } catch (err) {
              console.warn("Error aplanando escala de texto (sync):", err);
            }

            if (!canUseRectScale) {
              if (typeof node?.x === "function") {
                finalData.x = node.x();
              }
              if (typeof node?.y === "function") {
                finalData.y = node.y();
              }
            }

            // Para texto evitamos aplanar antes del commit en React,
            // asÃ­ no aparece un frame intermedio con tamaÃ±o "saltado".
            textTransformAnchorRef.current = null;
          } else {
            const scaleX = typeof node.scaleX === "function" ? node.scaleX() : 1;
            const scaleY = typeof node.scaleY === "function" ? node.scaleY() : 1;
            if (primerElemento?.tipo === "countdown") {
              // Countdown: aplanamos la escala sobre width/height para que la
              // geometria persistida sea estable entre plantilla y borrador.
              finalData.scaleX = 1;
              finalData.scaleY = 1;
              const countdownSize = getCountdownScaledSize(node);
              finalData.width = countdownSize.width;
              finalData.height = countdownSize.height;

              try {
                if (typeof node.scaleX === "function") node.scaleX(1);
                if (typeof node.scaleY === "function") node.scaleY(1);
                if (typeof node.width === "function") node.width(finalData.width);
                if (typeof node.height === "function") node.height(finalData.height);
                node.getLayer()?.batchDraw();
              } catch (err) {
                console.warn("Error aplanando escala de countdown (sync):", err);
              }
            } else if (esTriangulo) {
              const baseRadius = Number.isFinite(primerElemento?.radius)
                ? primerElemento.radius
                : 60;
              const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
              finalData.scaleX = 1;
              finalData.scaleY = 1;
              finalData.radius = Math.max(1, baseRadius * avgScale);

              try {
                node.scaleX(1);
                node.scaleY(1);
                if (typeof node.radius === "function") node.radius(finalData.radius);
                node.getLayer()?.batchDraw();
              } catch (err) {
                console.warn("Error aplanando escala de triÃ¡ngulo (sync):", err);
              }
            } else {
              finalData.scaleX = 1;
              finalData.scaleY = 1;
              const originalWidth = primerElemento.width || 100;
              const originalHeight = primerElemento.height || 100;

              finalData.width = Math.abs(originalWidth * scaleX);
              finalData.height = Math.abs(originalHeight * scaleY);

              if (primerElemento?.figura === "circle") {
                try {
                  const liveRect = node.getClientRect({
                    skipTransform: false,
                    skipShadow: true,
                    skipStroke: true,
                  });
                  const diameter = Math.max(1, Math.max(liveRect.width, liveRect.height));
                  finalData.radius = diameter / 2;
                  const anchor = circleAnchorRef.current;
                  if (anchor) {
                    finalData.x = anchor.left + finalData.radius;
                    finalData.y = anchor.top + finalData.radius;
                  } else {
                    finalData.x = liveRect.x + finalData.radius;
                    finalData.y = liveRect.y + finalData.radius;
                  }
                } catch {}
              }

              // âœ… Aplanar escala INMEDIATO
              try {
                const fw = finalData.width;
                const fh = finalData.height;

                node.scaleX(1);
                node.scaleY(1);

                if (fw != null && typeof node.width === "function") node.width(fw);
                if (fh != null && typeof node.height === "function") node.height(fh);

                if (
                  primerElemento?.figura === "circle" &&
                  finalData.radius != null &&
                  typeof node.radius === "function"
                ) {
                  node.radius(finalData.radius);
                }

                node.getLayer()?.batchDraw();
              } catch (err) {
                console.warn("Error aplanando escalas (sync):", err);
              }
            }
          }

          if (transformGestureRef.current?.isRotate && esImagenSeleccionada) {
            const rotationCommitSnap = snapRotationOnCommit(
              finalData.rotation,
              imageRotationCommitSnapTolerance
            );
            if (rotationCommitSnap.snapped) {
              finalData.rotation = rotationCommitSnap.rotation;
              try {
                if (typeof node.rotation === "function") {
                  node.rotation(rotationCommitSnap.rotation);
                }
                node.getLayer?.()?.batchDraw?.();
              } catch {}
              trackImageRotationDebug("image-rotate:commit-snap", {
                elementId: primerElemento?.id ?? null,
                activeAnchor: transformGestureRef.current?.activeAnchor ?? null,
                rotation: roundNodeMetric(rotationCommitSnap.rotation),
                finalRotation: roundNodeMetric(rotationCommitSnap.rotation),
                snapDeltaDeg: rotationCommitSnap.deltaDeg,
              });
            }
          }

          onTransform(finalData);
          if (primerElemento?.tipo === "countdown") {
            recordCountdownAuditSnapshot({
              countdown: {
                ...primerElemento,
                ...finalData,
              },
              stage: "canvas-resize-commit",
              renderer: "konva-render",
              sourceDocument: "selection-transformer",
              viewport: "editor",
              wrapperScale: 1,
              usesRasterThumbnail: false,
              sourceLabel: "SelectionTransformer",
            });
          }
          circleAnchorRef.current = null;


          // âœ… Reatachar 1 vez, con ref fresco, en el prÃ³ximo frame
          try {
            const tr2 = transformerRef.current;
            if (!tr2) return;

            TRDBG("onTransformEnd -> schedule RAF reattach", {
              selKey: selectedElements.join(","),
              idSel: selectedElements?.[0] || null
            });

            requestAnimationFrame(() => {
              const idSel = selectedElements?.[0];
              const freshNode = idSel ? elementRefs.current?.[idSel] : null;

              TRDBG("onTransformEnd RAF", {
                idSel,
                hasFresh: !!freshNode,
                destroyed: !!freshNode?._destroyed,
                hasStage: !!freshNode?.getStage?.(),
              });

              // Si el nodo no estÃ¡ listo, despegar y salir
              if (!freshNode || freshNode._destroyed || !freshNode.getStage?.()) {
                TRDBG("onTransformEnd RAF -> DETACH nodes([])", { idSel });
                try { tr2.nodes([]); tr2.getLayer?.()?.batchDraw(); } catch { }
                return;
              }

              try {
                TRDBG("onTransformEnd RAF -> DETACH nodes([])", { idSel });
                tr2.nodes([freshNode]);
                tr2.forceUpdate();
                tr2.getLayer?.()?.batchDraw();

                if (textPreviewEndSnapshot && freshNode) {
                  try {
                    const postRect = freshNode.getClientRect({
                      skipTransform: false,
                      skipShadow: true,
                      skipStroke: true,
                    });
                    TXTDBG("post-commit:raf1", {
                      id: idSel,
                      pre: textPreviewEndSnapshot,
                      post: {
                        x: typeof freshNode?.x === "function" ? freshNode.x() : null,
                        y: typeof freshNode?.y === "function" ? freshNode.y() : null,
                        scaleX: typeof freshNode?.scaleX === "function" ? freshNode.scaleX() : null,
                        scaleY: typeof freshNode?.scaleY === "function" ? freshNode.scaleY() : null,
                        fontSize: typeof freshNode?.fontSize === "function" ? freshNode.fontSize() : null,
                        rectWidth: Number.isFinite(postRect?.width) ? postRect.width : null,
                        rectHeight: Number.isFinite(postRect?.height) ? postRect.height : null,
                      },
                      delta: {
                        width:
                          Number.isFinite(postRect?.width) &&
                          Number.isFinite(textPreviewEndSnapshot.rectWidth)
                            ? (postRect.width - textPreviewEndSnapshot.rectWidth)
                            : null,
                        height:
                          Number.isFinite(postRect?.height) &&
                          Number.isFinite(textPreviewEndSnapshot.rectHeight)
                            ? (postRect.height - textPreviewEndSnapshot.rectHeight)
                            : null,
                      },
                    });
                  } catch {}
                  requestAnimationFrame(() => {
                    const freshNode2 = idSel ? elementRefs.current?.[idSel] : null;
                    if (!freshNode2) return;
                    try {
                      const postRect2 = freshNode2.getClientRect({
                        skipTransform: false,
                        skipShadow: true,
                        skipStroke: true,
                      });
                      TXTDBG("post-commit:raf2", {
                        id: idSel,
                        post: {
                          x: typeof freshNode2?.x === "function" ? freshNode2.x() : null,
                          y: typeof freshNode2?.y === "function" ? freshNode2.y() : null,
                          scaleX: typeof freshNode2?.scaleX === "function" ? freshNode2.scaleX() : null,
                          scaleY: typeof freshNode2?.scaleY === "function" ? freshNode2.scaleY() : null,
                          fontSize: typeof freshNode2?.fontSize === "function" ? freshNode2.fontSize() : null,
                          rectWidth: Number.isFinite(postRect2?.width) ? postRect2.width : null,
                          rectHeight: Number.isFinite(postRect2?.height) ? postRect2.height : null,
                        },
                        deltaFromPre: {
                          width:
                            Number.isFinite(postRect2?.width) &&
                            Number.isFinite(textPreviewEndSnapshot.rectWidth)
                              ? (postRect2.width - textPreviewEndSnapshot.rectWidth)
                              : null,
                          height:
                            Number.isFinite(postRect2?.height) &&
                            Number.isFinite(textPreviewEndSnapshot.rectHeight)
                              ? (postRect2.height - textPreviewEndSnapshot.rectHeight)
                              : null,
                        },
                      });
                    } catch {}
                  });
                }
              } catch { }
            });
          } catch { }


        } catch (error) {
          console.warn("Error en onTransformEnd:", error);
          if (transformGestureRef.current?.isRotate && esImagenSeleccionada) {
            const rotationPerfRelease = releaseImageRotationPerf({
              logOverlayRestore: true,
            });
            finishImageRotationDebugSession({
              elementId: primerElemento?.id ?? null,
              reason: "transform-end-error",
              message: error?.message || String(error),
              cacheCleared: rotationPerfRelease?.cacheRelease?.cacheCleared === true,
              overlayRestored: rotationPerfRelease?.overlayRestored === true,
            });
          }
          window._resizeData = null;
        } finally {
          if (transformGestureRef.current?.isRotate && esImagenSeleccionada) {
            releaseImageRotationPerf({
              logCacheRelease: true,
              logOverlayRestore: true,
              deferSourceLayerRedraw: true,
            });
          }
          hideRotationIndicator();
          syncTransformerLayer({ useDragOverlay: false });
          setIsImageRotateGestureActive(false);
          isTransformingResizeRef.current = false;
          setIsResizeGestureActive(false);
          clearResizeAnchorPressFeedback();
          notifyTransformInteractionEnd();
        }
      }}

      />
    </>
  );
}




