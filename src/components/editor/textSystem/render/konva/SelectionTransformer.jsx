// SelectionBounds.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { Transformer, Rect, Group, Text } from "react-konva";
import SelectionBoundsIndicator from "@/components/editor/textSystem/render/konva/SelectionBoundsIndicator";
import {
  buildCanvasDragPerfDiff,
  trackCanvasDragPerf,
} from "@/components/editor/canvasEditor/canvasDragPerf";
import {
  buildCanvasBoxFlowBoundsDigest,
  flushCanvasBoxFlowSummary,
  getActiveCanvasBoxFlowSession,
  isCanvasBoxFlowIdentityRetired,
  logCanvasBoxFlow,
  recordCanvasBoxFlowSummary,
} from "@/components/editor/canvasEditor/canvasBoxFlowDebug";
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
  getCanvasSelectionDebugInfo,
  getCanvasPointerDebugInfo,
  getKonvaNodeDebugInfo,
  logSelectedDragDebug,
  resetCanvasInteractionLogSample,
  sampleCanvasInteractionLog,
} from "@/components/editor/canvasEditor/selectedDragDebug";
import {
  buildTextGeometryContractRect,
  logTextGeometryContractInvariant,
} from "@/components/editor/canvasEditor/textGeometryContractDebug";
import { resolveCanonicalNodePose } from "@/components/editor/canvasEditor/konvaCanonicalPose";
import {
  resolveAuthoritativeTextRect,
} from "@/components/editor/canvasEditor/konvaAuthoritativeBounds";
import {
  getImageResizeNodeSnapshot,
  trackImageResizeDebug,
} from "@/components/editor/canvasEditor/imageResizeDebug";
import {
  clearImageResizeSessionActive,
  setImageResizeSessionActive,
  setPendingImageTransformCommit,
} from "@/components/editor/canvasEditor/imagePendingTransformCommit";
import {
  getCountdownRepeatDragActiveState,
  isCountdownRepeatDragDebugEnabled,
  publishCountdownRepeatDragDebugEntry,
} from "@/components/editor/canvasEditor/countdownRepeatDragDebug";
import {
  resolveTransformerVisualMode,
} from "./selectionVisualModes.js";
import {
  applyGalleryLayoutPresetToRenderObject,
} from "@/domain/gallery/galleryLayoutPresets";

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

function getNodeRenderedSize(node) {
  if (!node) return { width: null, height: null };

  const baseWidth =
    typeof node.width === "function"
      ? Number(node.width() || 0)
      : Number(node?.attrs?.width || 0);
  const baseHeight =
    typeof node.height === "function"
      ? Number(node.height() || 0)
      : Number(node?.attrs?.height || 0);
  const scaleX =
    typeof node.scaleX === "function"
      ? Number(node.scaleX() || 1)
      : Number(node?.attrs?.scaleX || 1);
  const scaleY =
    typeof node.scaleY === "function"
      ? Number(node.scaleY() || 1)
      : Number(node?.attrs?.scaleY || 1);

  const width = baseWidth * Math.abs(scaleX || 1);
  const height = baseHeight * Math.abs(scaleY || 1);

  return {
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
  };
}

function resolveRotatedCenterFromPose(pose, size) {
  const x = Number(pose?.x);
  const y = Number(pose?.y);
  const rotationDeg = Number(pose?.rotation);
  const width = Number(size?.width);
  const height = Number(size?.height);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(rotationDeg) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }

  const rotationRad = (rotationDeg * Math.PI) / 180;
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  return {
    centerX: x + (halfWidth * Math.cos(rotationRad)) - (halfHeight * Math.sin(rotationRad)),
    centerY: y + (halfWidth * Math.sin(rotationRad)) + (halfHeight * Math.cos(rotationRad)),
  };
}

function resolvePoseFromRotatedCenter(center, size, rotationDeg) {
  const centerX = Number(center?.centerX);
  const centerY = Number(center?.centerY);
  const width = Number(size?.width);
  const height = Number(size?.height);
  const rotation = Number(rotationDeg);

  if (
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerY) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(rotation)
  ) {
    return null;
  }

  const rotationRad = (rotation * Math.PI) / 180;
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  return {
    x: centerX - (halfWidth * Math.cos(rotationRad)) + (halfHeight * Math.sin(rotationRad)),
    y: centerY - (halfWidth * Math.sin(rotationRad)) - (halfHeight * Math.cos(rotationRad)),
  };
}

function describeRotationSnapState(
  angle,
  toleranceDeg = 0,
  snapAngles = ROTATION_SNAP_ANGLES
) {
  const numericAngle = Number(angle);
  const numericTolerance = Number(toleranceDeg);
  if (!Number.isFinite(numericAngle)) {
    return {
      snapCandidate: null,
      snapDistance: null,
      insideSnapBand: false,
    };
  }

  let bestRotation = null;
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
    snapCandidate: roundNodeMetric(bestRotation, 3),
    snapDistance: Number.isFinite(bestDelta) ? roundNodeMetric(bestDelta, 3) : null,
    insideSnapBand:
      Number.isFinite(numericTolerance) &&
      numericTolerance > 0 &&
      Number.isFinite(bestDelta) &&
      bestDelta <= numericTolerance,
  };
}

function resolveBoundsVisualReadiness(bounds) {
  const width = Number(bounds?.width);
  const height = Number(bounds?.height);
  const hasBounds = Boolean(bounds);
  const boundsValid =
    hasBounds &&
    Number.isFinite(width) &&
    Number.isFinite(height);
  const zeroBounds =
    boundsValid &&
    (width <= 0 || height <= 0);

  return {
    hasBounds,
    boundsValid,
    zeroBounds,
    visuallyReadyBounds: boundsValid && width > 0 && height > 0,
    width: boundsValid ? roundNodeMetric(width, 3) : null,
    height: boundsValid ? roundNodeMetric(height, 3) : null,
  };
}

function buildBoundsVisualReadinessKey(bounds) {
  if (!bounds) return "none";
  return [
    String(bounds.kind || "rect"),
    Number.isFinite(Number(bounds.x)) ? roundNodeMetric(bounds.x, 3) : "na",
    Number.isFinite(Number(bounds.y)) ? roundNodeMetric(bounds.y, 3) : "na",
    Number.isFinite(Number(bounds.width)) ? roundNodeMetric(bounds.width, 3) : "na",
    Number.isFinite(Number(bounds.height)) ? roundNodeMetric(bounds.height, 3) : "na",
  ].join(":");
}

function normalizeSelectionIdsForHandoff(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((id) => String(id ?? "").trim())
    .filter((id) => id !== "");
}

function areSelectionIdsEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}


export default function SelectionBounds({
  selectedElements,
  elementRefs,
  objetos,
  onTransform,
  onTransformInteractionStart = null,
  onTransformInteractionEnd = null,
  editingId = null,
  activeInlineEditingId = null,
  requestInlineEditFinish = null,
  isDragging,
  isInteractionLocked = false,
  isMobile = false,
  dragLayerRef = null,
  boxFlowIdentity = null,
  boxFlowSessionIdentity = null,
  canvasInteractionEpoch = 0,
  canvasInteractionActive = false,
  canvasInteractionSettling = false,
  scheduleCanvasUiAfterSettle = null,
  cancelCanvasUiAfterSettle = null,
  predragVisualSelectionActive = false,
  dragSelectionOverlayVisible = false,
  dragSelectionOverlayVisualReady = false,
  selectedPhaseHandoffActive = false,
  selectedPhaseHandoffSelectionRepairPending = false,
  selectedPhaseHandoffExpectedSelectionIds = [],
  onPrimarySelectionVisualReadyChange = null,
  onPrimarySelectionVisibilityChange = null,
  selectionRuntime = null,
}) {
  const transformerRef = useRef(null);
  const lastKnownTransformerRef = useRef(null);
  const latestDetachTransformerRef = useRef(null);
  const renderCountRef = useRef(0);
  const renderSnapshotRef = useRef(null);
  const countdownDragDebugSnapshotRef = useRef(null);
  const lastAttachedNodeIdsRef = useRef("");
  const lastTransformerSyncSnapshotRef = useRef({
    attachedNodeIds: "",
    selectedGeomKey: "",
  });
  const [transformTick, setTransformTick] = useState(0);
  const [isImageRotateGestureActive, setIsImageRotateGestureActive] = useState(false);
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
  const rotationLifecycleDebugRef = useRef({
    interactionId: null,
    previewCount: 0,
  });
  const pendingRotatePreviewRef = useRef({
    rafId: 0,
    payload: null,
  });
  const lastProcessedRotatePreviewRef = useRef({
    rotation: null,
    pointerX: null,
    pointerY: null,
    roundedDegrees: null,
    snapCandidate: null,
    snapDistance: null,
    insideSnapBand: false,
  });
  const lastVisibilitySnapshotRef = useRef(null);
  const transformerBoxFlowSnapshotRef = useRef(null);
  const transformerStaleAttachmentSnapshotRef = useRef(null);
  const attachBlockSnapshotRef = useRef(null);
  const lineIndicatorVisibilitySnapshotRef = useRef(null);
  const selectedPhaseVisualReadyGateRef = useRef({
    rafId: 0,
    pendingKey: null,
    confirmedKey: null,
    blockedKey: null,
    lastMeta: null,
  });
  const selectionBoxFlowIdentityRef = useRef(null);
  const pendingUiRestoreEpochRef = useRef(0);
  const isTransformingResizeRef = useRef(false);
  const [isResizeGestureActive, setIsResizeGestureActive] = useState(false);
  const [pressedResizeAnchorName, setPressedResizeAnchorName] = useState(null);
  const [resizeHintPhase, setResizeHintPhase] = useState(0);
  const runtimeSelectionSnapshot =
    typeof selectionRuntime?.readSnapshot === "function"
      ? selectionRuntime.readSnapshot()
      : null;
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
  const hasActiveInlineEditingSession = Boolean(activeInlineEditingId);
  const interactionLocked = Boolean(
    isInteractionLocked || hasActiveInlineEditingSession
  );

  const buildRotationPreviewSampleKey = (interactionId = null) =>
    `transform-rotate-preview:${interactionId || primerElemento?.id || "selection"}`;

  const resetRotationLifecycleDebug = () => {
    const interactionId = rotationLifecycleDebugRef.current?.interactionId || null;
    resetCanvasInteractionLogSample(buildRotationPreviewSampleKey(interactionId));
    rotationLifecycleDebugRef.current = {
      interactionId: null,
      previewCount: 0,
    };
  };

  const buildRotationDebugPayload = (event, node, extra = {}) => ({
    interactionId: rotationLifecycleDebugRef.current?.interactionId || null,
    previewCount: rotationLifecycleDebugRef.current?.previewCount || 0,
    selectedIds: selectedElements,
    selectedCount: selectedElements.length,
    primerElementoId: primerElemento?.id || null,
    primerElementoTipo: primerElemento?.tipo || null,
    isImageRotateGesture: Boolean(esImagenSeleccionada),
    activeAnchor: transformGestureRef.current?.activeAnchor ?? null,
    pointer: getCanvasPointerDebugInfo(event),
    node: getKonvaNodeDebugInfo(node),
    selection: getCanvasSelectionDebugInfo(),
    ...extra,
  });
  const selectionKey = selectedElements.join(",");
  selectionBoxFlowIdentityRef.current =
    boxFlowIdentity || selectionKey || primerElemento?.id || null;

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

  const hayLineas = elementosSeleccionadosData.some(
    (obj) => obj.tipo === "forma" && obj.figura === "line"
  );
  const hasPreservedGroupSelection = elementosSeleccionadosData.some(
    (obj) => obj?.tipo === "grupo"
  );
  const pendingDragSelectionId =
    runtimeSelectionSnapshot?.pendingDragSelection?.id ||
    (typeof window !== "undefined" ? window._pendingDragSelectionId || null : null);
  const pendingDragSelectionPhase =
    runtimeSelectionSnapshot?.pendingDragSelection?.phase ||
    (typeof window !== "undefined"
      ? window._pendingDragSelectionPhase || null
      : null);
  const globalDragging =
    typeof window !== "undefined" ? Boolean(window._isDragging) : false;
  const groupDragging =
    typeof window !== "undefined" ? Boolean(window._grupoLider) : false;
  const manualGroupSession =
    typeof window !== "undefined" ? window._groupDragSession || null : null;
  const manualGroupSessionId =
    manualGroupSession?.engine === "manual-pointer"
      ? manualGroupSession.sessionId || null
      : null;
  const manualGroupPhase =
    manualGroupSession?.engine === "manual-pointer"
      ? manualGroupSession.phase || null
      : null;
  const runtimeResizeActive =
    typeof window !== "undefined" ? Boolean(window._resizeData?.isResizing) : false;
  const effectiveDragging = Boolean(isDragging || globalDragging || groupDragging);
  const shouldUseLightweightRotateOverlay =
    esImagenSeleccionada && isImageRotateGestureActive;
  const normalizedSelectedElements = normalizeSelectionIdsForHandoff(
    selectedElements
  );
  const normalizedHandoffExpectedSelectionIds =
    normalizeSelectionIdsForHandoff(selectedPhaseHandoffExpectedSelectionIds);
  const selectionMatchesHandoffExpected = areSelectionIdsEqual(
    normalizedSelectedElements,
    normalizedHandoffExpectedSelectionIds
  );
  const shouldSuppressBeforeFirstDragStart = Boolean(
    pendingDragSelectionPhase === "predrag" &&
    pendingDragSelectionId &&
    !effectiveDragging &&
    selectedElements.length === 1 &&
    selectedElements[0] === pendingDragSelectionId
  );
  const transformerVisualMode = resolveTransformerVisualMode({
    selectedIds: selectedElements,
    selectedObjects: elementosSeleccionadosData,
    hasLineSelection: hayLineas,
    pendingDragSelectionId,
    pendingDragSelectionPhase,
    effectiveDragging,
    predragVisualSelectionActive,
    canvasInteractionActive,
    canvasInteractionSettling,
    runtimeResizeActive,
    dragSelectionOverlayVisible,
    dragSelectionOverlayVisualReady,
    isResizeGestureActive,
    isTransformingResize: isTransformingResizeRef.current,
    interactionLocked,
    hasActiveInlineEditingSession,
    isGallerySelection: esGaleria,
    shouldUseLightweightRotateOverlay,
  });
  const shouldUseGenericTransformer =
    transformerVisualMode.shouldUseGenericTransformer;
  const isTransformerAttachSuppressed =
    transformerVisualMode.isAttachSuppressed;
  const isTransformerAttachBlocked = Boolean(isTransformerAttachSuppressed);
  const shouldSuppressDuringDeferredDrag =
    transformerVisualMode.shouldSuppressDuringDeferredDrag;
  const hasDragOverlayVisualOwnership =
    transformerVisualMode.hasDragOverlayVisualOwnership;
  const shouldHideTransformerDuringDrag =
    transformerVisualMode.shouldHideTransformerDuringDrag;
  const shouldSuppressTransformerVisualsForDragOverlay =
    transformerVisualMode.shouldSuppressTransformerVisualsForDragOverlay;
  const shouldProbeSelectedPhaseReadinessUnderOverlay = Boolean(
    selectedPhaseHandoffActive &&
      dragSelectionOverlayVisible &&
      shouldSuppressTransformerVisualsForDragOverlay &&
      selectedPhaseHandoffSelectionRepairPending !== true &&
      normalizedHandoffExpectedSelectionIds.length > 0 &&
      selectionMatchesHandoffExpected
  );

  useEffect(() => {
    const visibilitySnapshot = {
      selectionKey,
      pendingDragSelectionId,
      pendingDragSelectionPhase,
      shouldSuppressBeforeFirstDragStart: Boolean(shouldSuppressBeforeFirstDragStart),
      shouldSuppressDuringDeferredDrag: Boolean(shouldSuppressDuringDeferredDrag),
      shouldHideTransformerDuringDrag: Boolean(shouldHideTransformerDuringDrag),
      hasDragOverlayVisualOwnership: Boolean(hasDragOverlayVisualOwnership),
      shouldSuppressTransformerVisualsForDragOverlay: Boolean(
        shouldSuppressTransformerVisualsForDragOverlay
      ),
      dragSelectionOverlayVisualReady: Boolean(dragSelectionOverlayVisualReady),
      selectedPhaseHandoffActive: Boolean(selectedPhaseHandoffActive),
      selectedPhaseHandoffSelectionRepairPending: Boolean(
        selectedPhaseHandoffSelectionRepairPending
      ),
      selectionMatchesHandoffExpected: Boolean(selectionMatchesHandoffExpected),
      shouldProbeSelectedPhaseReadinessUnderOverlay: Boolean(
        shouldProbeSelectedPhaseReadinessUnderOverlay
      ),
      attachSuppressed: Boolean(isTransformerAttachSuppressed),
      predragVisualSelectionActive: Boolean(predragVisualSelectionActive),
      manualGroupSessionId,
      manualGroupPhase,
      isResizeGestureActive: Boolean(isResizeGestureActive),
      isImageRotateGestureActive: Boolean(isImageRotateGestureActive),
      interactionLocked: Boolean(interactionLocked),
      dragSelectionOverlayVisible: Boolean(dragSelectionOverlayVisible),
    };
    const previousSnapshot = lastVisibilitySnapshotRef.current;
    const visibilityChanged =
      !previousSnapshot ||
      Object.keys(visibilitySnapshot).some(
        (key) => previousSnapshot[key] !== visibilitySnapshot[key]
      );

    if (!visibilityChanged) {
      return;
    }

    lastVisibilitySnapshotRef.current = visibilitySnapshot;

    logSelectedDragDebug("transformer:visibility-state", {
      selectedIds: selectedElements,
      selectedCount: selectedElements.length,
      primerElementoId: primerElemento?.id || null,
      primerElementoTipo: primerElemento?.tipo || null,
      effectiveDragging: Boolean(effectiveDragging),
      globalDragging,
      groupDragging,
      manualGroupSessionId,
      manualGroupPhase,
      pendingDragSelectionId,
      pendingDragSelectionPhase,
      shouldSuppressBeforeFirstDragStart: Boolean(shouldSuppressBeforeFirstDragStart),
      shouldSuppressDuringDeferredDrag: Boolean(shouldSuppressDuringDeferredDrag),
      shouldHideTransformerDuringDrag: Boolean(shouldHideTransformerDuringDrag),
      hasDragOverlayVisualOwnership: Boolean(hasDragOverlayVisualOwnership),
      shouldSuppressTransformerVisualsForDragOverlay: Boolean(
        shouldSuppressTransformerVisualsForDragOverlay
      ),
      dragSelectionOverlayVisualReady: Boolean(dragSelectionOverlayVisualReady),
      selectedPhaseHandoffActive: Boolean(selectedPhaseHandoffActive),
      selectedPhaseHandoffSelectionRepairPending: Boolean(
        selectedPhaseHandoffSelectionRepairPending
      ),
      selectionMatchesHandoffExpected: Boolean(selectionMatchesHandoffExpected),
      shouldProbeSelectedPhaseReadinessUnderOverlay: Boolean(
        shouldProbeSelectedPhaseReadinessUnderOverlay
      ),
      canvasInteractionActive: Boolean(canvasInteractionActive),
      canvasInteractionSettling: Boolean(canvasInteractionSettling),
      attachSuppressed: Boolean(isTransformerAttachSuppressed),
      predragVisualSelectionActive: Boolean(predragVisualSelectionActive),
      isResizeGestureActive: Boolean(isResizeGestureActive),
      isImageRotateGestureActive: Boolean(isImageRotateGestureActive),
      isTransformingResize: Boolean(isTransformingResizeRef.current),
      isInteractionLocked: Boolean(interactionLocked),
      activeInlineEditingId: activeInlineEditingId || null,
      dragSelectionOverlayVisible: Boolean(dragSelectionOverlayVisible),
    });
  }, [
    selectionKey,
    effectiveDragging,
    globalDragging,
    groupDragging,
    manualGroupSessionId,
    manualGroupPhase,
    pendingDragSelectionId,
    pendingDragSelectionPhase,
    shouldSuppressBeforeFirstDragStart,
    shouldSuppressDuringDeferredDrag,
    hasDragOverlayVisualOwnership,
    shouldHideTransformerDuringDrag,
    shouldSuppressTransformerVisualsForDragOverlay,
    dragSelectionOverlayVisualReady,
    selectedPhaseHandoffActive,
    selectedPhaseHandoffSelectionRepairPending,
    selectionMatchesHandoffExpected,
    shouldProbeSelectedPhaseReadinessUnderOverlay,
    canvasInteractionActive,
    canvasInteractionSettling,
    isTransformerAttachSuppressed,
    predragVisualSelectionActive,
    isResizeGestureActive,
    isImageRotateGestureActive,
    interactionLocked,
    activeInlineEditingId,
    dragSelectionOverlayVisible,
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
      selectedIds: selectionKey,
      effectiveDragging: Boolean(effectiveDragging),
      interactionLocked: Boolean(interactionLocked),
      canvasInteractionActive: Boolean(canvasInteractionActive),
      canvasInteractionSettling: Boolean(canvasInteractionSettling),
      resizeActive: Boolean(isResizeGestureActive),
      resizeHintPhase,
      transformTick,
      pendingDragSelectionId,
      pendingDragSelectionPhase,
      suppressBeforeFirstDragStart: shouldSuppressBeforeFirstDragStart,
      suppressDuringDeferredDrag: shouldSuppressDuringDeferredDrag,
      dragSelectionOverlayVisible: Boolean(dragSelectionOverlayVisible),
      dragSelectionOverlayVisualReady: Boolean(dragSelectionOverlayVisualReady),
      selectedPhaseHandoffActive: Boolean(selectedPhaseHandoffActive),
      selectedPhaseHandoffSelectionRepairPending: Boolean(
        selectedPhaseHandoffSelectionRepairPending
      ),
      selectionMatchesHandoffExpected: Boolean(selectionMatchesHandoffExpected),
      shouldProbeSelectedPhaseReadinessUnderOverlay: Boolean(
        shouldProbeSelectedPhaseReadinessUnderOverlay
      ),
      predragVisualSelectionActive: Boolean(predragVisualSelectionActive),
      transformerVisualSuppressedForOverlay: Boolean(
        shouldSuppressTransformerVisualsForDragOverlay
      ),
      dragOverlayVisualOwnership: Boolean(hasDragOverlayVisualOwnership),
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
    pendingDragSelectionPhase,
    primerElemento?.id,
    primerElemento?.tipo,
    selectedElements.length,
    selectionKey,
    shouldSuppressBeforeFirstDragStart,
    shouldSuppressDuringDeferredDrag,
    hasDragOverlayVisualOwnership,
    canvasInteractionActive,
    canvasInteractionSettling,
    predragVisualSelectionActive,
    dragSelectionOverlayVisible,
    dragSelectionOverlayVisualReady,
    selectedPhaseHandoffActive,
    selectedPhaseHandoffSelectionRepairPending,
    selectionMatchesHandoffExpected,
    shouldProbeSelectedPhaseReadinessUnderOverlay,
    shouldSuppressTransformerVisualsForDragOverlay,
    interactionLocked,
    transformTick,
  ]);

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
        o.galleryLayoutMode ?? "",
        o.galleryLayoutType ?? "",
        o.currentLayout ?? "",
        o.defaultLayout ?? "",
        Array.isArray(o.allowedLayouts) ? o.allowedLayouts.join(",") : "",
        o.galleryLayoutBlueprint ? JSON.stringify(o.galleryLayoutBlueprint) : "",
        Array.isArray(o.cells)
          ? o.cells
              .map((cell) =>
                [
                  cell?.mediaUrl ?? "",
                  cell?.url ?? "",
                  cell?.src ?? "",
                ].join("/")
              )
              .join(",")
          : "",
      ].join(":")
    )
    .join("|");
  const elementosTransformables = elementosSeleccionadosData.filter(
    (obj) => !(obj.tipo === "forma" && obj.figura === "line")
  );

  const getTransformPose = (node) => {
    if (!node) return { x: 0, y: 0, rotation: 0 };

    if (esGaleria && typeof node.getParent === "function") {
      const parent = node.getParent();
      if (parent) {
        const parentPose = resolveCanonicalNodePose(parent, null);
        return {
          x: parentPose.x,
          y: parentPose.y,
          rotation: parentPose.rotation,
        };
      }
    }

    const canonicalPose = resolveCanonicalNodePose(node, primerElemento);
    return {
      x: canonicalPose.x,
      y: canonicalPose.y,
      rotation: canonicalPose.rotation,
    };
  };

  const getTransformNodeId = (node) =>
    typeof node?.id === "function" ? node.id() || null : node?.attrs?.id || null;

  const buildSelectionBoxFlowIdentity = (fallback = null) =>
    boxFlowIdentity ||
    selectionBoxFlowIdentityRef.current ||
    selectionKey ||
    primerElemento?.id ||
    fallback ||
    "selection:implicit";

  const resolveSelectionSessionIdentity = (
    preferredIdentity = null,
    fallback = null
  ) => {
    const candidates = [
      preferredIdentity,
      boxFlowSessionIdentity,
      getActiveCanvasBoxFlowSession("selection")?.identity || null,
      buildSelectionBoxFlowIdentity(fallback),
    ];

    for (const candidate of candidates) {
      const safeCandidate = String(candidate ?? "").trim();
      if (!safeCandidate) continue;
      if (isCanvasBoxFlowIdentityRetired("selection", safeCandidate)) {
        continue;
      }
      return safeCandidate;
    }

    return buildSelectionBoxFlowIdentity(fallback);
  };

  const buildSelectionBoxFlowSessionIdentity = (fallback = null) =>
    resolveSelectionSessionIdentity(null, fallback);

  const collectTransformNodeIds = (nodes = []) =>
    nodes
      .map((node) => getTransformNodeId(node))
      .filter(Boolean);

  const buildAttachedNodeIdsKey = (nodes = []) =>
    collectTransformNodeIds(nodes).join("|");

  const buildAttachedNodeIdsDigest = (nodes = []) =>
    collectTransformNodeIds(nodes).join(",");

  const getLifecycleTransformerNode = () =>
    transformerRef.current || lastKnownTransformerRef.current || null;

  const getTransformerBoundsDigest = (node = null) => {
    const transformerNode = node || getLifecycleTransformerNode();
    if (!transformerNode) return null;
    try {
      return buildCanvasBoxFlowBoundsDigest(
        transformerNode.getClientRect?.({
          skipTransform: false,
          skipShadow: true,
          skipStroke: true,
        }) || null
      );
    } catch {
      return null;
    }
  };

  const getNodeBoundsDigest = (node) => {
    if (!node) return null;
    try {
      return buildCanvasBoxFlowBoundsDigest(
        node.getClientRect?.({
          skipTransform: false,
          skipShadow: true,
          skipStroke: true,
        }) || null
      );
    } catch {
      return null;
    }
  };

  const getAttachedNodeProbeBoundsDigest = (nodes = []) => {
    const attachedNodes = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
    if (attachedNodes.length === 0) return null;

    if (attachedNodes.length === 1) {
      const attachedNode = attachedNodes[0];
      const attachedNodeId =
        getTransformNodeId(attachedNode) ||
        (selectedElements.length === 1 ? selectedElements[0] || null : null);
      const selectedObject =
        attachedNodeId && Array.isArray(objetos)
          ? objetos.find((candidate) => candidate?.id === attachedNodeId) || null
          : null;

      if (selectedObject?.tipo === "texto") {
        let fallbackRect = null;
        try {
          fallbackRect = attachedNode.getClientRect?.({
            skipTransform: false,
            skipShadow: true,
            skipStroke: true,
          }) || null;
        } catch {
          fallbackRect = null;
        }

        const authoritativeTextRect = resolveAuthoritativeTextRect(
          attachedNode,
          selectedObject,
          { fallbackRect }
        );
        if (authoritativeTextRect) {
          return buildCanvasBoxFlowBoundsDigest(authoritativeTextRect);
        }
      }
    }

    return buildCanvasBoxFlowBoundsDigest(rectFromNodes(attachedNodes));
  };

  const resolveSelectedPhaseBoundsDigest = ({
    transformerNode = null,
    attachedNodes = [],
    preferAttachedNodeBounds = false,
  } = {}) => {
    const attachedNodeBounds = getAttachedNodeProbeBoundsDigest(attachedNodes);
    const transformerBounds = getTransformerBoundsDigest(transformerNode);

    if (preferAttachedNodeBounds) {
      return attachedNodeBounds || transformerBounds || null;
    }

    return transformerBounds || attachedNodeBounds || null;
  };

  const buildTransformBoxFlowPayload = (node, transformData = {}, extra = {}) => {
    const transformerNode = transformerRef.current;
    const attachedNodes =
      typeof transformerNode?.nodes === "function" ? transformerNode.nodes() || [] : [];

    return {
      source: "selection-transformer",
      mode: transformGestureRef.current?.isRotate ? "rotate" : "transform",
      activeAnchor: transformGestureRef.current?.activeAnchor ?? null,
      selectedIds: selectionKey || null,
      attachedNodeIds: buildAttachedNodeIdsDigest(attachedNodes) || null,
      bounds: getNodeBoundsDigest(node) || getTransformerBoundsDigest(transformerNode),
      x: roundNodeMetric(transformData?.x),
      y: roundNodeMetric(transformData?.y),
      rotation: roundNodeMetric(transformData?.rotation),
      width: roundNodeMetric(transformData?.width),
      height: roundNodeMetric(transformData?.height),
      fontSize: roundNodeMetric(transformData?.fontSize),
      ...extra,
    };
  };

  const setTransformerNodeRef = useCallback((node) => {
    const previousNode = transformerRef.current || null;
    if (previousNode === node) {
      return;
    }

    transformerRef.current = node || null;
    if (node) {
      lastKnownTransformerRef.current = node;
    }

    const identity =
      selectionBoxFlowIdentityRef.current ||
      lastAttachedNodeIdsRef.current.replace(/\|/g, ",") ||
      "selection:implicit";

    if (node) {
      logCanvasBoxFlow("selection", "transformer-ref:attached", {
        source: "selection-transformer",
        hasPreviousRef: Boolean(previousNode),
      }, {
        identity,
      });
      return;
    }

    if (previousNode) {
      flushCanvasBoxFlowSummary("selection", "transform-preview", {
        reason: "transformer-ref-detached",
      });
      logCanvasBoxFlow("selection", "transformer-ref:detached", {
        source: "selection-transformer",
      }, {
        identity,
      });
    }
  }, []);

  const resetTransformerAttachmentSnapshot = () => {
    lastAttachedNodeIdsRef.current = "";
    lastTransformerSyncSnapshotRef.current = {
      attachedNodeIds: "",
      selectedGeomKey: "",
    };
  };

  useEffect(() => {
    if (!isCountdownRepeatDragDebugEnabled()) return;
    if (!(selectedElements.length === 1 && primerElemento?.tipo === "countdown")) return;

    const activeDebugState = getCountdownRepeatDragActiveState();
    const selectedCountdownId = primerElemento?.id || null;
    const shouldLog =
      activeDebugState?.elementId === selectedCountdownId ||
      effectiveDragging ||
      globalDragging ||
      canvasInteractionSettling ||
      pendingDragSelectionId === selectedCountdownId;

    if (!shouldLog) return;

    const tr = transformerRef.current;
    const attachedNodeIds = buildAttachedNodeIdsKey(
      typeof tr?.nodes === "function" ? tr.nodes() || [] : []
    );
    const nextSnapshot = {
      selectedCountdownId,
      activeDebugSessionId: activeDebugState?.sessionId || null,
      effectiveDragging: Boolean(effectiveDragging),
      globalDragging: Boolean(globalDragging),
      groupDragging: Boolean(groupDragging),
      canvasInteractionActive: Boolean(canvasInteractionActive),
      canvasInteractionSettling: Boolean(canvasInteractionSettling),
      pendingDragSelectionId,
      pendingDragSelectionPhase,
      shouldSuppressBeforeFirstDragStart: Boolean(shouldSuppressBeforeFirstDragStart),
      shouldSuppressDuringDeferredDrag: Boolean(shouldSuppressDuringDeferredDrag),
      shouldHideTransformerDuringDrag: Boolean(shouldHideTransformerDuringDrag),
      attachSuppressed: Boolean(isTransformerAttachSuppressed),
      attachedNodeIds,
      lastStableAttachedNodeIds:
        lastTransformerSyncSnapshotRef.current?.attachedNodeIds || null,
    };
    const previousSnapshot = countdownDragDebugSnapshotRef.current;
    const changedKeys = !previousSnapshot
      ? Object.keys(nextSnapshot)
      : Object.keys(nextSnapshot).filter(
          (key) => previousSnapshot[key] !== nextSnapshot[key]
        );

    if (changedKeys.length === 0) return;

    countdownDragDebugSnapshotRef.current = nextSnapshot;
    publishCountdownRepeatDragDebugEntry({
      event: "transformer:countdown-drag-state",
      source: "SelectionTransformer",
      elementId: selectedCountdownId,
      activeDebugState,
      changedKeys,
      snapshot: nextSnapshot,
    });
  }, [
    canvasInteractionActive,
    canvasInteractionSettling,
    effectiveDragging,
    globalDragging,
    groupDragging,
    isTransformerAttachSuppressed,
    pendingDragSelectionId,
    pendingDragSelectionPhase,
    primerElemento?.id,
    primerElemento?.tipo,
    selectedElements.length,
    shouldHideTransformerDuringDrag,
    shouldSuppressBeforeFirstDragStart,
    shouldSuppressDuringDeferredDrag,
  ]);

  const resolveTransformableNodes = () => {
    let nodosTransformables = elementosTransformables
      .map((obj) => elementRefs.current?.[obj.id])
      .filter(Boolean);

    if (selectedElements.length === 1) {
      const selectedId = selectedElements[0];
      const refNode = elementRefs.current?.[selectedId] || null;
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

    return nodosTransformables;
  };

  const syncAttachedTransformerNodes = (
    nodosTransformables,
    { source = "unknown", force = false, logEvent = "transformer:attach" } = {}
  ) => {
    const tr = transformerRef.current;
    if (!tr || !Array.isArray(nodosTransformables) || nodosTransformables.length === 0) {
      return false;
    }

    const attachedNodeIds = collectTransformNodeIds(nodosTransformables);
    const nextAttachedNodeIds = buildAttachedNodeIdsKey(nodosTransformables);
    const currentAttachedNodeIds = buildAttachedNodeIdsKey(
      typeof tr.nodes === "function" ? tr.nodes() || [] : []
    );

    if (
      !force &&
      nextAttachedNodeIds &&
      nextAttachedNodeIds === currentAttachedNodeIds &&
      nextAttachedNodeIds === lastAttachedNodeIdsRef.current
    ) {
      return false;
    }

    tr.nodes(nodosTransformables);
    lastAttachedNodeIdsRef.current = nextAttachedNodeIds;

    if (logEvent) {
      logSelectedDragDebug(logEvent, {
        source,
        selectedIds: selectedElements,
        selectedCount: selectedElements.length,
        effectiveDragging: Boolean(effectiveDragging),
        pendingDragSelectionId,
        attachedNodeIds: nodosTransformables.map((node) => getTransformNodeId(node)),
        attachedNodes: nodosTransformables.map((node) => getKonvaNodeDebugInfo(node)),
      });
    }

    lastTransformerSyncSnapshotRef.current = {
      attachedNodeIds: nextAttachedNodeIds,
      selectedGeomKey,
    };

    try {
      tr.forceUpdate?.();
    } catch {}
    tr.getLayer?.()?.batchDraw?.();

    logCanvasBoxFlow("selection", "attach:applied", {
      source,
      force: Boolean(force),
      selectedIds: selectionKey || null,
      attachedNodeIds,
      bounds: getTransformerBoundsDigest(tr),
    }, {
      identity: buildSelectionBoxFlowSessionIdentity(buildAttachedNodeIdsDigest(nodosTransformables)),
      flushSummaryKeys: ["transform-preview"],
      flushReason: "attach-applied",
    });
    return true;
  };

  const syncTransformerGeometryNow = (source = "unknown") => {
    const tr = transformerRef.current;
    const currentAttachedNodes =
      typeof tr?.nodes === "function" ? tr.nodes() || [] : [];
    const attachedNodeIds = collectTransformNodeIds(currentAttachedNodes);
    const identity = buildSelectionBoxFlowSessionIdentity(attachedNodeIds.join(","));

    logCanvasBoxFlow("selection", "bounds-sync:requested", {
      source,
      selectedIds: selectionKey || null,
      attachedNodeIds,
      selectedGeomKey,
    }, {
      identity,
    });

    if (!tr) {
      logCanvasBoxFlow("selection", "bounds-sync:skipped", {
        source,
        reason: "missing-transformer",
        selectedIds: selectionKey || null,
      }, {
        identity,
      });
      return false;
    }

    try {
      if (tr.isTransforming?.()) {
        logCanvasBoxFlow("selection", "bounds-sync:skipped", {
          source,
          reason: "native-transform-in-flight",
          selectedIds: selectionKey || null,
          attachedNodeIds,
        }, {
          identity,
        });
        return false;
      }
    } catch {}

    try {
      tr.forceUpdate?.();
    } catch {}
    tr.getLayer?.()?.batchDraw?.();

    lastTransformerSyncSnapshotRef.current = {
      attachedNodeIds: buildAttachedNodeIdsKey(
        typeof tr.nodes === "function" ? tr.nodes() || [] : []
      ),
      selectedGeomKey,
    };

    trackCanvasDragPerf(
      "transformer:sync",
      {
        selectedCount: selectedElements.length,
        source,
      },
      {
        throttleMs: 180,
        throttleKey: `transformer:sync:${source}`,
      }
    );

    logCanvasBoxFlow("selection", "bounds-sync:applied", {
      source,
      selectedIds: selectionKey || null,
      attachedNodeIds,
      bounds: getTransformerBoundsDigest(tr),
    }, {
      identity,
    });

    if (selectedElements.length === 1) {
      const selectedId = String(selectedElements[0] || "").trim();
      const selectedObject =
        selectedId && Array.isArray(objetos)
          ? objetos.find((candidate) => candidate?.id === selectedId) || null
          : null;
      const selectedNode = selectedId ? elementRefs?.current?.[selectedId] || null : null;

      if (selectedObject?.tipo === "texto") {
        const fallbackRect =
          typeof selectedNode?.getClientRect === "function"
            ? selectedNode.getClientRect({
                skipTransform: false,
                skipShadow: true,
                skipStroke: true,
              })
            : null;
        const authoritativeTextRect = selectedNode
          ? resolveAuthoritativeTextRect(selectedNode, selectedObject, {
              fallbackRect,
            })
          : null;
        const transformerRect =
          typeof tr?.getClientRect === "function"
            ? tr.getClientRect({
                skipTransform: false,
                skipShadow: true,
                skipStroke: true,
              })
            : null;
        const pass = Boolean(selectedNode && authoritativeTextRect);

        logTextGeometryContractInvariant(
          "transformer-selected-phase-authority",
          {
            phase: "selected",
            surface: "transformer",
            authoritySource: "live-attached-konva-node",
            sessionIdentity: identity,
            elementId: selectedId,
            tipo: selectedObject?.tipo || null,
            pass,
            failureReason: !selectedNode
              ? "selected text transformer sync has no attached Konva node"
              : !authoritativeTextRect
                ? "selected text transformer sync could not resolve authoritative Konva text rect"
                : null,
            observedRects: {
              authoritativeKonvaRect:
                buildTextGeometryContractRect(authoritativeTextRect),
              selectedNodeRect: buildTextGeometryContractRect(fallbackRect),
              transformerRect: buildTextGeometryContractRect(transformerRect),
            },
            observedSources: {
              source,
              attachedNodeIds,
              selectedIds: selectionKey || null,
            },
          },
          {
            sampleKey: `text-contract:transformer:${identity || selectedId}`,
            firstCount: 4,
            throttleMs: 160,
            force: !pass || source === "selection-change",
          }
        );
      }
    }
    return true;
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
    const transformer = getLifecycleTransformerNode();
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

  const clearPendingRotatePreview = () => {
    if (
      pendingRotatePreviewRef.current.rafId &&
      typeof cancelAnimationFrame === "function"
    ) {
      cancelAnimationFrame(pendingRotatePreviewRef.current.rafId);
    }
    pendingRotatePreviewRef.current = {
      rafId: 0,
      payload: null,
    };
  };

  const resetProcessedRotatePreview = () => {
    lastProcessedRotatePreviewRef.current = {
      rotation: null,
      pointerX: null,
      pointerY: null,
      roundedDegrees: null,
      snapCandidate: null,
      snapDistance: null,
      insideSnapBand: false,
    };
  };

  const shouldProcessRotatePreview = (payload, { force = false } = {}) => {
    if (force) return true;
    if (!payload) return false;

    const previous = lastProcessedRotatePreviewRef.current || {};
    const rotationThreshold = isMobile ? 0.6 : 0.35;
    const pointerThreshold = isMobile ? 2.5 : 1.5;
    const hysteresisThreshold = isMobile ? 0.75 : 0.45;
    const snapTolerance = esImagenSeleccionada
      ? imageRotationCommitSnapTolerance
      : transformerRotationSnapTolerance;
    const nextRoundedDegrees = normalizeRotationIndicatorDegrees(payload.rotation);
    const nextSnapState = describeRotationSnapState(
      payload.rotation,
      snapTolerance
    );
    const stableInsideSnapBand =
      previous.insideSnapBand === true &&
      nextSnapState.insideSnapBand === true &&
      previous.snapCandidate === nextSnapState.snapCandidate;
    const roundedDegreeChanged =
      previous.roundedDegrees !== nextRoundedDegrees;
    const snapCandidateChanged =
      previous.snapCandidate !== nextSnapState.snapCandidate;
    const snapBandChanged =
      Boolean(previous.insideSnapBand) !== Boolean(nextSnapState.insideSnapBand);

    const hasRotationDelta =
      !Number.isFinite(previous.rotation) ||
      !Number.isFinite(payload.rotation) ||
      Math.abs(payload.rotation - previous.rotation) >= rotationThreshold;
    const hasPointerXDelta =
      !Number.isFinite(previous.pointerX) ||
      !Number.isFinite(payload.pointerX) ||
      Math.abs(payload.pointerX - previous.pointerX) >= pointerThreshold;
    const hasPointerYDelta =
      !Number.isFinite(previous.pointerY) ||
      !Number.isFinite(payload.pointerY) ||
      Math.abs(payload.pointerY - previous.pointerY) >= pointerThreshold;

    if (
      stableInsideSnapBand &&
      !roundedDegreeChanged &&
      Number.isFinite(nextSnapState.snapDistance) &&
      nextSnapState.snapDistance <= hysteresisThreshold
    ) {
      return false;
    }

    return (
      hasRotationDelta ||
      hasPointerXDelta ||
      hasPointerYDelta ||
      roundedDegreeChanged ||
      snapCandidateChanged ||
      snapBandChanged
    );
  };

  const flushPendingRotatePreview = ({ force = false } = {}) => {
    const pendingPayload = pendingRotatePreviewRef.current.payload;
    pendingRotatePreviewRef.current.payload = null;
    pendingRotatePreviewRef.current.rafId = 0;

    if (!pendingPayload || !shouldProcessRotatePreview(pendingPayload, { force })) {
      return false;
    }

    const {
      node,
      transformData,
      pointerType = null,
      pointerX = null,
      pointerY = null,
      scheduledAtMs = null,
    } = pendingPayload;
    const roundedDegrees = normalizeRotationIndicatorDegrees(transformData?.rotation);
    const snapTolerance = esImagenSeleccionada
      ? imageRotationCommitSnapTolerance
      : transformerRotationSnapTolerance;
    const snapState = describeRotationSnapState(
      transformData?.rotation,
      snapTolerance
    );

    lastProcessedRotatePreviewRef.current = {
      rotation: transformData?.rotation,
      pointerX,
      pointerY,
      roundedDegrees,
      snapCandidate: snapState.snapCandidate,
      snapDistance: snapState.snapDistance,
      insideSnapBand: snapState.insideSnapBand,
    };

    updateRotationIndicator(node);

    if (esImagenSeleccionada) {
      const pose = getTransformPose(node);
      trackImageRotationPreview({
        elementId: primerElemento?.id ?? null,
        tipo: primerElemento?.tipo ?? null,
        activeAnchor: transformGestureRef.current?.activeAnchor ?? null,
        pointerType,
        pointerX,
        pointerY,
        handlerDurationMs:
          Number.isFinite(scheduledAtMs) &&
          typeof performance !== "undefined" &&
          typeof performance.now === "function"
            ? roundNodeMetric(performance.now() - scheduledAtMs)
            : null,
        ...getImageRotationNodeMetrics(node, pose),
      });
    }

    const interactionId =
      rotationLifecycleDebugRef.current?.interactionId ||
      `${primerElemento?.id || selectionKey || "selection"}:adhoc`;
    const sample = sampleCanvasInteractionLog(
      buildRotationPreviewSampleKey(interactionId),
      {
        firstCount: 3,
        throttleMs: 120,
      }
    );
    rotationLifecycleDebugRef.current.previewCount = sample.sampleCount;

    if (sample.shouldLog) {
      logSelectedDragDebug(
        "transform:rotate:preview",
        buildRotationDebugPayload(null, node, {
          pointer: {
            pointerType,
            x: pointerX,
            y: pointerY,
          },
          transformData,
          previewCount: sample.sampleCount,
        })
      );
    }

    return true;
  };

  const scheduleRotatePreview = (payload) => {
    pendingRotatePreviewRef.current.payload = payload;

    if (pendingRotatePreviewRef.current.rafId) {
      return;
    }

    if (typeof requestAnimationFrame !== "function") {
      flushPendingRotatePreview();
      return;
    }

    pendingRotatePreviewRef.current.rafId = requestAnimationFrame(() => {
      flushPendingRotatePreview();
    });
  };

  const clearResizeAnchorPressFeedback = useCallback(() => {
    setPressedResizeAnchorName((current) => (current ? null : current));
  }, []);

  const resetTransformerGestureUiState = useCallback(({
    syncOverlay = true,
    clearRotatePreviewState = true,
  } = {}) => {
    hideRotationIndicator();
    if (clearRotatePreviewState) {
      clearPendingRotatePreview();
      resetProcessedRotatePreview();
    }
    if (syncOverlay) {
      syncTransformerLayer({ useDragOverlay: false });
    }
    setIsImageRotateGestureActive((current) => (current ? false : current));
    isTransformingResizeRef.current = false;
    setIsResizeGestureActive((current) => (current ? false : current));
    clearResizeAnchorPressFeedback();
  }, [clearResizeAnchorPressFeedback, hideRotationIndicator, syncTransformerLayer]);

  const runTextTransformCommitDebug = (selectedId, textPreviewEndSnapshot) => {
    if (!textPreviewEndSnapshot || typeof requestAnimationFrame !== "function") {
      return;
    }

    requestAnimationFrame(() => {
      const freshNode = selectedId ? elementRefs.current?.[selectedId] : null;
      if (!freshNode) return;

      try {
        const postRect = freshNode.getClientRect({
          skipTransform: false,
          skipShadow: true,
          skipStroke: true,
        });
        TXTDBG("post-commit:raf1", {
          id: selectedId,
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
        const freshNode2 = selectedId ? elementRefs.current?.[selectedId] : null;
        if (!freshNode2) return;
        try {
          const postRect2 = freshNode2.getClientRect({
            skipTransform: false,
            skipShadow: true,
            skipStroke: true,
          });
          TXTDBG("post-commit:raf2", {
            id: selectedId,
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
    });
  };

  const transformerRestoreKey = `transformer:restore:${selectionKey || "empty"}`;

  const scheduleTransformerRestoreAfterSettle = (
    source = "unknown",
    { textPreviewEndSnapshot = null, forceAttach = false } = {}
  ) => {
    if (!shouldUseGenericTransformer) {
      logCanvasBoxFlow("selection", "restore-after-settle:skipped", {
        source,
        reason: "generic-transformer-disabled",
        forceAttach: Boolean(forceAttach),
      }, {
        identity: buildSelectionBoxFlowSessionIdentity(),
      });
      return;
    }

    const restoreEpoch = canvasInteractionEpoch;
    const identity = buildSelectionBoxFlowSessionIdentity();
    const schedulingStrategy =
      typeof scheduleCanvasUiAfterSettle === "function"
        ? "canvas-ui-settle"
        : typeof requestAnimationFrame === "function"
          ? "raf"
          : "sync";

    logCanvasBoxFlow("selection", "restore-after-settle:scheduled", {
      source,
      restoreEpoch,
      forceAttach: Boolean(forceAttach),
      strategy: schedulingStrategy,
    }, {
      identity,
    });

    const runRestore = () => {
      if (pendingUiRestoreEpochRef.current !== restoreEpoch) {
        logCanvasBoxFlow("selection", "restore-after-settle:skipped", {
          source,
          reason: "stale-epoch",
          restoreEpoch,
          pendingEpoch: pendingUiRestoreEpochRef.current,
        }, {
          identity,
        });
        return;
      }

      const tr = transformerRef.current;
      if (!tr) {
        logCanvasBoxFlow("selection", "restore-after-settle:skipped", {
          source,
          reason: "missing-transformer",
          restoreEpoch,
        }, {
          identity,
        });
        return;
      }

      const nodosTransformables = resolveTransformableNodes();
      const attachedNodeIdsDigest = buildAttachedNodeIdsDigest(nodosTransformables);
      if (nodosTransformables.length === 0) {
        logCanvasBoxFlow("selection", "restore-after-settle:skipped", {
          source,
          reason: "missing-transformable-nodes",
          restoreEpoch,
        }, {
          identity,
        });
        return;
      }
      const nextAttachedNodeIds = buildAttachedNodeIdsKey(nodosTransformables);
      const currentAttachedNodeIds = buildAttachedNodeIdsKey(
        typeof tr.nodes === "function" ? tr.nodes() || [] : []
      );
      const lastStableSnapshot = lastTransformerSyncSnapshotRef.current || {};

      if (
        currentAttachedNodeIds &&
        currentAttachedNodeIds === nextAttachedNodeIds &&
        lastStableSnapshot.attachedNodeIds === nextAttachedNodeIds &&
        lastStableSnapshot.selectedGeomKey === selectedGeomKey
      ) {
        logCanvasBoxFlow("selection", "restore-after-settle:skipped", {
          source,
          reason: "already-synced",
          restoreEpoch,
          attachedNodeIds: attachedNodeIdsDigest,
        }, {
          identity,
        });
        return;
      }

      const attached = syncAttachedTransformerNodes(nodosTransformables, {
        source,
        force: forceAttach,
        logEvent: "transformer:restore",
      });

      let syncApplied = false;
      if (!attached) {
        syncApplied = syncTransformerGeometryNow(`restore:${source}`);
      }

      logCanvasBoxFlow("selection", "restore-after-settle:applied", {
        source,
        restoreEpoch,
        forceAttach: Boolean(forceAttach),
        action: attached ? "attach" : syncApplied ? "sync" : "noop",
        attachedNodeIds: attachedNodeIdsDigest,
        bounds: getTransformerBoundsDigest(tr),
      }, {
        identity: buildSelectionBoxFlowSessionIdentity(attachedNodeIdsDigest),
      });

      if (textPreviewEndSnapshot && selectedElements.length === 1) {
        runTextTransformCommitDebug(selectedElements[0], textPreviewEndSnapshot);
      }
    };

    pendingUiRestoreEpochRef.current = restoreEpoch;

    if (typeof scheduleCanvasUiAfterSettle === "function") {
      scheduleCanvasUiAfterSettle(transformerRestoreKey, runRestore);
      return;
    }

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(runRestore);
      return;
    }

    runRestore();
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
    const tr = getLifecycleTransformerNode();
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

  const detachTransformerNodes = (
    source = "unknown",
    { logEvent = "transformer:detach" } = {}
  ) => {
    flushCanvasBoxFlowSummary("selection", "transform-preview", {
      reason: source || "detach",
    });
    pendingUiRestoreEpochRef.current = 0;
    if (typeof cancelCanvasUiAfterSettle === "function") {
      cancelCanvasUiAfterSettle(transformerRestoreKey);
    }

    stopResizeHintPulse();
    resetTransformerGestureUiState({
      syncOverlay: true,
      clearRotatePreviewState: true,
    });

    const tr = getLifecycleTransformerNode();
    if (!tr) {
      resetTransformerAttachmentSnapshot();
      return false;
    }

    let attachedNodes = [];
    try {
      attachedNodes = typeof tr.nodes === "function" ? tr.nodes() || [] : [];
    } catch {
      attachedNodes = [];
    }

    const attachedNodeIds = buildAttachedNodeIdsKey(attachedNodes);
    const attachedNodeIdsDigest = buildAttachedNodeIdsDigest(attachedNodes);

    try {
      tr.stopTransform?.();
    } catch {}
    try {
      tr.nodes([]);
    } catch {}
    try {
      tr.forceUpdate?.();
    } catch {}
    try {
      tr.getLayer?.()?.batchDraw?.();
    } catch {}

    resetTransformerAttachmentSnapshot();

    if (logEvent && attachedNodeIds) {
      logSelectedDragDebug(logEvent, {
        source,
        selectedIds: selectedElements,
        selectedCount: selectedElements.length,
        attachedNodeIds: attachedNodes.map((node) => getTransformNodeId(node)),
        effectiveDragging: Boolean(effectiveDragging),
        attachSuppressed: Boolean(isTransformerAttachBlocked),
        shouldUseGenericTransformer: Boolean(shouldUseGenericTransformer),
      });
    }

    if (attachedNodeIds) {
      logCanvasBoxFlow("selection", "detach:applied", {
        source,
        selectedIds: selectionKey || null,
        attachedNodeIds: attachedNodeIdsDigest,
        effectiveDragging: Boolean(effectiveDragging),
        attachSuppressed: Boolean(isTransformerAttachBlocked),
        shouldUseGenericTransformer: Boolean(shouldUseGenericTransformer),
      }, {
        identity: buildSelectionBoxFlowSessionIdentity(attachedNodeIdsDigest),
      });
    }

    return Boolean(attachedNodeIds);
  };

  latestDetachTransformerRef.current = detachTransformerNodes;

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
      resetTransformerGestureUiState({
        syncOverlay: true,
        clearRotatePreviewState: true,
      });
      syncRotationIndicatorLayer({ useDragOverlay: false });
    }
  }, [
    esImagenSeleccionada,
    resetTransformerGestureUiState,
    selectionKey,
    syncRotationIndicatorLayer,
  ]);

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
      resetTransformerGestureUiState({
        syncOverlay: true,
        clearRotatePreviewState: true,
      });
    };
  }, [resetTransformerGestureUiState]);

  useEffect(() => () => {
    if (typeof cancelCanvasUiAfterSettle === "function") {
      cancelCanvasUiAfterSettle(transformerRestoreKey);
    }
  }, [cancelCanvasUiAfterSettle, transformerRestoreKey]);

  useEffect(() => {
    if (!selectionKey || !shouldUseGenericTransformer) {
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
    selectionKey,
    shouldUseGenericTransformer,
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
  }, [isResizeGestureActive, isMobile, selectionKey]);

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
      const lifecycleNode = getLifecycleTransformerNode();
      const attachedNodes =
        typeof lifecycleNode?.nodes === "function" ? lifecycleNode.nodes() || [] : [];
      logCanvasBoxFlow("selection", "cleanup", {
        source: "selection-transformer",
        reason: "component-unmount",
        attachedNodeIds: buildAttachedNodeIdsDigest(attachedNodes),
        visible: Boolean(transformerBoxFlowSnapshotRef.current?.visible),
      }, {
        identity: buildSelectionBoxFlowSessionIdentity(buildAttachedNodeIdsDigest(attachedNodes)),
        flushSummaryKeys: ["transform-preview"],
        flushReason: "cleanup",
      });
      latestDetachTransformerRef.current?.("component-unmount");
    },
    []
  );

  useEffect(() => {
    if (selectedElements.length === 0 || !shouldUseGenericTransformer) {
      detachTransformerNodes(
        selectedElements.length === 0
          ? "selection-empty"
          : hayLineas
            ? "selection-line-path"
            : "selection-no-transformables"
      );
      return;
    }
    if (effectiveDragging && !isTransformingResizeRef.current) {
      stopResizeHintPulse();
      setIsResizeGestureActive(false);
      setPressedResizeAnchorName((current) => (current ? null : current));
    }
  }, [
    selectedElements.length,
    effectiveDragging,
    hayLineas,
    selectionKey,
    shouldUseGenericTransformer,
  ]);

  useEffect(() => {
    if (!interactionLocked) return;
    stopResizeHintPulse();
    setIsResizeGestureActive(false);
    setPressedResizeAnchorName((current) => (current ? null : current));
    hideRotationIndicator();
  }, [interactionLocked]);

  useEffect(() => {
    const nextSnapshot = isTransformerAttachBlocked
      ? {
          renderMode: transformerVisualMode.renderMode,
          canvasInteractionActive: Boolean(canvasInteractionActive),
          canvasInteractionSettling: Boolean(canvasInteractionSettling),
          effectiveDragging: Boolean(effectiveDragging),
          pendingDragSelectionId: pendingDragSelectionId || null,
          pendingDragSelectionPhase: pendingDragSelectionPhase || null,
          shouldSuppressBeforeFirstDragStart: Boolean(shouldSuppressBeforeFirstDragStart),
          shouldSuppressDuringDeferredDrag: Boolean(shouldSuppressDuringDeferredDrag),
          shouldHideTransformerDuringDrag: Boolean(shouldHideTransformerDuringDrag),
          hasDragOverlayVisualOwnership: Boolean(hasDragOverlayVisualOwnership),
          shouldSuppressTransformerVisualsForDragOverlay: Boolean(
            shouldSuppressTransformerVisualsForDragOverlay
          ),
          dragSelectionOverlayVisible: Boolean(dragSelectionOverlayVisible),
          dragSelectionOverlayVisualReady: Boolean(dragSelectionOverlayVisualReady),
          predragVisualSelectionActive: Boolean(predragVisualSelectionActive),
          interactionLocked: Boolean(interactionLocked),
        }
      : null;
    const previousSnapshot = attachBlockSnapshotRef.current;

    if (!nextSnapshot) {
      if (previousSnapshot) {
        logCanvasBoxFlow("selection", "attach:block-cleared", {
          source: "selection-transformer",
          selectedIds: selectionKey || null,
          visualIds: selectionKey || null,
          phase: "selected",
          owner: "selected-phase",
          selectionAuthority: "logical-selection",
          geometryAuthority: "transformer-live",
          overlayVisible: false,
          settling: false,
          suppressedLayers: [],
          reason: "selected-phase-allowed",
        }, {
          identity: buildSelectionBoxFlowSessionIdentity(),
        });
      }
      attachBlockSnapshotRef.current = null;
      return;
    }

    const didChange =
      !previousSnapshot ||
      Object.keys(nextSnapshot).some((key) => previousSnapshot[key] !== nextSnapshot[key]);

    attachBlockSnapshotRef.current = nextSnapshot;

    if (!didChange) return;

    logCanvasBoxFlow("selection", "attach:blocked", {
      source: "selection-transformer",
      selectedIds: selectionKey || null,
      visualIds: selectionKey || null,
      phase: predragVisualSelectionActive
        ? "predrag"
        : canvasInteractionSettling
          ? "settling"
          : (effectiveDragging || canvasInteractionActive ? "drag" : "selected"),
      owner: "selected-phase",
      selectionAuthority: "logical-selection",
      geometryAuthority: "transformer-live",
      overlayVisible: false,
      settling: Boolean(canvasInteractionSettling),
      suppressedLayers: ["selected-phase"],
      reason:
        hasDragOverlayVisualOwnership
          ? "drag-overlay-owned"
          : shouldHideTransformerDuringDrag
            ? "drag-active"
            : shouldSuppressDuringDeferredDrag
              ? "deferred-drag"
              : "attach-blocked",
      ...nextSnapshot,
    }, {
      identity: buildSelectionBoxFlowSessionIdentity(),
    });
  }, [
    canvasInteractionActive,
    canvasInteractionSettling,
    dragSelectionOverlayVisible,
    dragSelectionOverlayVisualReady,
    effectiveDragging,
    interactionLocked,
    isTransformerAttachBlocked,
    pendingDragSelectionId,
    pendingDragSelectionPhase,
    predragVisualSelectionActive,
    selectionKey,
    hasDragOverlayVisualOwnership,
    shouldHideTransformerDuringDrag,
    shouldSuppressBeforeFirstDragStart,
    shouldSuppressDuringDeferredDrag,
    shouldSuppressTransformerVisualsForDragOverlay,
    transformerVisualMode.renderMode,
  ]);

  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;

    let nativeTransforming = false;
    try {
      nativeTransforming = Boolean(tr.isTransforming?.());
    } catch {}

    TRDBG("ATTACH effect start", {
      selKey: selectionKey,
      isDragging: effectiveDragging,
      shouldUseGenericTransformer,
      elementosTransformablesLen: elementosTransformables.length,
      transformTick,
      attachSuppressed: isTransformerAttachBlocked,
      nativeTransforming,
    });

    if (nativeTransforming || isTransformingResizeRef.current) {
      TRDBG("ATTACH effect exit: transform in flight", {
        selKey: selectionKey,
        nativeTransforming,
      });
      return;
    }

    if (!shouldUseGenericTransformer) {
      resetTransformerAttachmentSnapshot();
      TRDBG("ATTACH effect exit: transformer disabled", { selKey: selectionKey });
      return;
    }

    if (isTransformerAttachBlocked) {
      TRDBG("ATTACH effect exit: suppressed", {
        selKey: selectionKey,
        canvasInteractionActive,
        canvasInteractionSettling,
        effectiveDragging,
        pendingDragSelectionPhase,
        suppressBeforeFirstDragStart: shouldSuppressBeforeFirstDragStart,
      });
      return;
    }

    const nodosTransformables = resolveTransformableNodes();
    if (nodosTransformables.length === 0) {
      logSelectedDragDebug("transformer:attach-skip-no-nodes", {
        selectedIds: selectedElements,
        wantedIds: elementosTransformables.map((obj) => obj.id),
        refsPresent: elementosTransformables.map((obj) =>
          Boolean(elementRefs.current?.[obj.id])
        ),
        effectiveDragging: Boolean(effectiveDragging),
      });
      TRDBG("ATTACH effect exit: no nodes yet", {
        selKey: selectionKey,
        wantedIds: elementosTransformables.map(o => o.id),
        refsPresent: elementosTransformables.map(o => !!elementRefs.current?.[o.id]),
      });
      logCanvasBoxFlow("selection", "attach:skipped", {
        source: "selection-effect",
        reason: "missing-transformable-nodes",
        selectedIds: selectionKey || null,
        wantedIds: elementosTransformables.map((obj) => obj.id),
      }, {
        identity: buildSelectionBoxFlowSessionIdentity(),
      });
      return;
    }

    const attached = syncAttachedTransformerNodes(nodosTransformables, {
      source: "selection-effect",
    });

    TRDBG("ATTACH effect done", {
      selKey: selectionKey,
      attached,
      attachedNodeIdsKey: buildAttachedNodeIdsKey(nodosTransformables),
    });
  }, [
    selectionKey,
    shouldUseGenericTransformer,
    elementosTransformables.length,
    transformTick,
    effectiveDragging,
    canvasInteractionActive,
    canvasInteractionSettling,
    isTransformerAttachBlocked,
    pendingDragSelectionPhase,
    shouldSuppressBeforeFirstDragStart,
  ]);

  useEffect(() => {
    if (!shouldUseGenericTransformer || isTransformerAttachBlocked) return;
    const tr = transformerRef.current;
    if (!tr) return;

    const attachedNodeIds = buildAttachedNodeIdsKey(
      typeof tr.nodes === "function" ? tr.nodes() || [] : []
    );
    if (!attachedNodeIds) return;

    syncTransformerGeometryNow("selected-geom");
  }, [
    selectionKey,
    shouldUseGenericTransformer,
    isTransformerAttachBlocked,
    selectedGeomKey,
    transformTick,
  ]);

  useEffect(() => {
    if (!isTransformerAttachBlocked) return;

    const tr = getLifecycleTransformerNode();
    if (!tr || typeof tr.nodes !== "function") return;

    const currentAttachedNodeIds = buildAttachedNodeIdsKey(tr.nodes() || []);
    if (!currentAttachedNodeIds) return;

    if (!shouldUseGenericTransformer) {
      detachTransformerNodes("attach-blocked-ineligible-selection");
      return;
    }

    if (hasDragOverlayVisualOwnership) {
      detachTransformerNodes("attach-blocked-drag-overlay-ownership");
      return;
    }

    const desiredNodeIds = buildAttachedNodeIdsKey(resolveTransformableNodes());
    if (!desiredNodeIds || desiredNodeIds === currentAttachedNodeIds) return;

    detachTransformerNodes("attach-blocked-stale-selection");
  }, [
    hasDragOverlayVisualOwnership,
    isTransformerAttachBlocked,
    selectionKey,
    shouldUseGenericTransformer,
    transformTick,
  ]);

  useEffect(() => {
    const lifecycleNode = getLifecycleTransformerNode();
    const attachedNodes =
      typeof lifecycleNode?.nodes === "function" ? lifecycleNode.nodes() || [] : [];
    const attachedNodeIds = buildAttachedNodeIdsDigest(attachedNodes);
    const desiredNodeIds = buildAttachedNodeIdsDigest(resolveTransformableNodes());
    const nextSnapshot = {
      selectionKey,
      attachedNodeIds: attachedNodeIds || null,
      desiredNodeIds: desiredNodeIds || null,
      attachBlocked: Boolean(isTransformerAttachBlocked),
      dragOverlayOwnerActive: Boolean(hasDragOverlayVisualOwnership),
      settlingActive: Boolean(canvasInteractionSettling),
      handoffActive: Boolean(selectedPhaseHandoffActive),
      readyProbeActive: Boolean(shouldProbeSelectedPhaseReadinessUnderOverlay),
    };
    const previousSnapshot = transformerStaleAttachmentSnapshotRef.current;
    transformerStaleAttachmentSnapshotRef.current = nextSnapshot;
    const snapshotChanged =
      !previousSnapshot ||
      Object.keys(nextSnapshot).some(
        (key) => previousSnapshot[key] !== nextSnapshot[key]
      );

    if (!snapshotChanged) {
      return;
    }

    const hasStaleAttachment = Boolean(
      nextSnapshot.attachedNodeIds &&
        nextSnapshot.desiredNodeIds &&
        nextSnapshot.attachedNodeIds !== nextSnapshot.desiredNodeIds
    );
    if (hasStaleAttachment) {
      logCanvasBoxFlow("selection", "transformer:stale-attachment", {
        source: "selection-transformer",
        reason: "attached-node-ids-do-not-match-current-selection-target",
        selectedIds: selectionKey || null,
        visualIds: nextSnapshot.attachedNodeIds || null,
        attachedNodeIds: nextSnapshot.attachedNodeIds || null,
        desiredNodeIds: nextSnapshot.desiredNodeIds || null,
        attachBlocked: nextSnapshot.attachBlocked,
        dragOverlayOwnerActive: nextSnapshot.dragOverlayOwnerActive,
        settlingActive: nextSnapshot.settlingActive,
        handoffActive: nextSnapshot.handoffActive,
        readyProbeActive: nextSnapshot.readyProbeActive,
        overlayVisible: Boolean(dragSelectionOverlayVisible),
      }, {
        identity:
          buildSelectionBoxFlowSessionIdentity(
            nextSnapshot.attachedNodeIds || nextSnapshot.desiredNodeIds || selectionKey
          ),
      });
    }

    const attachmentRecovered = Boolean(
      previousSnapshot?.attachedNodeIds &&
        previousSnapshot?.desiredNodeIds &&
        previousSnapshot.attachedNodeIds !== previousSnapshot.desiredNodeIds &&
        nextSnapshot.attachedNodeIds &&
        nextSnapshot.desiredNodeIds &&
        nextSnapshot.attachedNodeIds === nextSnapshot.desiredNodeIds
    );
    if (attachmentRecovered) {
      logCanvasBoxFlow("selection", "transformer:attachment-rebound", {
        source: "selection-transformer",
        reason: "attached-node-ids-rebound-to-current-selection-target",
        selectedIds: selectionKey || null,
        visualIds: nextSnapshot.attachedNodeIds || null,
        attachedNodeIds: nextSnapshot.attachedNodeIds || null,
        desiredNodeIds: nextSnapshot.desiredNodeIds || null,
        attachBlocked: nextSnapshot.attachBlocked,
        dragOverlayOwnerActive: nextSnapshot.dragOverlayOwnerActive,
        settlingActive: nextSnapshot.settlingActive,
        handoffActive: nextSnapshot.handoffActive,
        readyProbeActive: nextSnapshot.readyProbeActive,
        overlayVisible: Boolean(dragSelectionOverlayVisible),
      }, {
        identity:
          buildSelectionBoxFlowSessionIdentity(
            nextSnapshot.attachedNodeIds || selectionKey
          ),
      });
    }
  }, [
    canvasInteractionSettling,
    dragSelectionOverlayVisible,
    hasDragOverlayVisualOwnership,
    isTransformerAttachBlocked,
    selectedPhaseHandoffActive,
    selectionKey,
    shouldProbeSelectedPhaseReadinessUnderOverlay,
    transformTick,
  ]);

  useEffect(() => {
    const handler = (e) => {
      const id = e?.detail?.id;
      if (!id) return;

      TRDBG("REF event", {
        id,
        isSelected: selectedElements.includes(id),
        selKey: selectionKey,
      });

      if (!selectedElements.includes(id)) return;
      setTransformTick(t => t + 1);
    };

    window.addEventListener("element-ref-registrado", handler);
    return () => window.removeEventListener("element-ref-registrado", handler);
  }, [selectionKey, selectedElements]);

  useEffect(() => {
    const lifecycleNode = getLifecycleTransformerNode();
    const attachedNodes =
      typeof lifecycleNode?.nodes === "function" ? lifecycleNode.nodes() || [] : [];
    const attachedNodeIds = buildAttachedNodeIdsDigest(attachedNodes);
    const nextVisible = Boolean(
      selectedElements.length > 0 &&
      attachedNodes.length > 0 &&
      shouldUseGenericTransformer &&
      transformerVisualMode.renderMode !== "none" &&
      transformerVisualMode.renderMode !== "line-indicator" &&
      !shouldSuppressTransformerVisualsForDragOverlay
    );
    const nextReadyProbeActive = Boolean(
      !nextVisible &&
        selectedElements.length > 0 &&
        attachedNodes.length > 0 &&
        shouldUseGenericTransformer &&
        transformerVisualMode.renderMode !== "none" &&
        transformerVisualMode.renderMode !== "line-indicator" &&
        shouldProbeSelectedPhaseReadinessUnderOverlay
    );
    const nextSnapshot = {
      visible: nextVisible,
      readyProbeActive: nextReadyProbeActive,
      sessionIdentity: buildSelectionBoxFlowSessionIdentity(attachedNodeIds),
      visualIdentity: buildSelectionBoxFlowIdentity(attachedNodeIds),
      renderMode: transformerVisualMode.renderMode,
      attachedNodeIds,
      bounds:
        nextVisible || nextReadyProbeActive
          ? resolveSelectedPhaseBoundsDigest({
              transformerNode: lifecycleNode,
              attachedNodes,
              preferAttachedNodeBounds: nextReadyProbeActive,
            })
          : null,
    };
    const previousSnapshot = transformerBoxFlowSnapshotRef.current;
    transformerBoxFlowSnapshotRef.current = nextSnapshot;
    const previousSessionIdentity = resolveSelectionSessionIdentity(
      previousSnapshot?.sessionIdentity || null,
      previousSnapshot?.visualIdentity || attachedNodeIds
    );
    const nextSessionIdentity = resolveSelectionSessionIdentity(
      nextSnapshot.sessionIdentity,
      nextSnapshot.visualIdentity
    );

    if (
      previousSnapshot?.visible &&
      (
        !nextSnapshot.visible ||
        previousSnapshot.sessionIdentity !== nextSnapshot.sessionIdentity ||
        previousSnapshot.visualIdentity !== nextSnapshot.visualIdentity
      )
    ) {
      flushCanvasBoxFlowSummary("selection", "transform-preview", {
        reason: "selection-box-hidden",
      });
      logCanvasBoxFlow("selection", "selection-box:hidden", {
        source: "transformer-primary",
        selectedIds: previousSnapshot.visualIdentity,
        visualIds: previousSnapshot.visualIdentity,
        phase: "selected",
        owner: "selected-phase",
        selectionAuthority: "logical-selection",
        geometryAuthority: "transformer-live",
        overlayVisible: false,
        settling: false,
        suppressedLayers:
          hasDragOverlayVisualOwnership ||
          shouldSuppressTransformerVisualsForDragOverlay
            ? ["selected-phase"]
            : [],
        renderMode: previousSnapshot.renderMode,
        attachedNodeIds: previousSnapshot.attachedNodeIds || null,
        reason:
          previousSnapshot.visualIdentity !== nextSnapshot.visualIdentity
            ? "selection-changed"
            : hasDragOverlayVisualOwnership
              ? "drag-overlay-owned"
              : shouldSuppressTransformerVisualsForDragOverlay
                ? "drag-overlay-suppressed"
              : transformerVisualMode.renderMode,
      }, {
        identity: previousSessionIdentity,
      });
      onPrimarySelectionVisualReadyChange?.(false, {
        source: "transformer-primary",
        reason:
          previousSnapshot.visualIdentity !== nextSnapshot.visualIdentity
            ? "selection-changed"
            : hasDragOverlayVisualOwnership
              ? "drag-overlay-owned"
              : shouldSuppressTransformerVisualsForDragOverlay
                ? "drag-overlay-suppressed"
                : transformerVisualMode.renderMode,
        renderMode: previousSnapshot.renderMode,
        readySource: "selection-box-hidden",
        readySignal: "transformer-hidden",
        postPaintConfirmed: false,
        boundsValid: false,
        zeroBounds: false,
        visualIdentity: previousSnapshot.visualIdentity,
        sessionIdentity: previousSessionIdentity,
        bounds: previousSnapshot.bounds,
        attachedNodeIds: previousSnapshot.attachedNodeIds || null,
        readyProbeActive: Boolean(previousSnapshot.readyProbeActive),
        selectedPhaseActuallyVisible: false,
      });
      onPrimarySelectionVisibilityChange?.(false, {
        source: "transformer-primary",
        reason:
          previousSnapshot.visualIdentity !== nextSnapshot.visualIdentity
            ? "selection-changed"
            : hasDragOverlayVisualOwnership
              ? "drag-overlay-owned"
              : shouldSuppressTransformerVisualsForDragOverlay
                ? "drag-overlay-suppressed"
                : transformerVisualMode.renderMode,
        renderMode: previousSnapshot.renderMode,
        visibilitySource: "selection-box-hidden",
        visualIdentity: previousSnapshot.visualIdentity,
        sessionIdentity: previousSessionIdentity,
        bounds: previousSnapshot.bounds,
        attachedNodeIds: previousSnapshot.attachedNodeIds || null,
        readyProbeActive: Boolean(previousSnapshot.readyProbeActive),
        selectedPhaseActuallyVisible: false,
      });
    }

    if (
      nextSnapshot.visible &&
      (
        !previousSnapshot?.visible ||
        previousSnapshot.sessionIdentity !== nextSnapshot.sessionIdentity ||
        previousSnapshot.visualIdentity !== nextSnapshot.visualIdentity
      )
    ) {
      logCanvasBoxFlow("selection", "selection-box:shown", {
        source: "transformer-primary",
        selectedIds: nextSnapshot.visualIdentity,
        visualIds: nextSnapshot.visualIdentity,
        phase: "selected",
        owner: "selected-phase",
        selectionAuthority: "logical-selection",
        geometryAuthority: "transformer-live",
        overlayVisible: false,
        settling: false,
        suppressedLayers: [],
        renderMode: nextSnapshot.renderMode,
        attachedNodeIds: nextSnapshot.attachedNodeIds || null,
        bounds: nextSnapshot.bounds,
      }, {
        identity: nextSessionIdentity,
      });
      onPrimarySelectionVisibilityChange?.(true, {
        source: "transformer-primary",
        reason: "selection-box-shown",
        renderMode: nextSnapshot.renderMode,
        visibilitySource: "selection-box-shown",
        visualIdentity: nextSnapshot.visualIdentity,
        sessionIdentity: nextSessionIdentity,
        bounds: nextSnapshot.bounds,
        attachedNodeIds: nextSnapshot.attachedNodeIds || null,
        readyProbeActive: Boolean(nextSnapshot.readyProbeActive),
        selectedPhaseActuallyVisible: true,
      });
    }
  }, [
    onPrimarySelectionVisibilityChange,
    onPrimarySelectionVisualReadyChange,
    selectedElements.length,
    selectedGeomKey,
    selectionKey,
    hasDragOverlayVisualOwnership,
    shouldSuppressTransformerVisualsForDragOverlay,
    shouldUseGenericTransformer,
    transformTick,
    transformerVisualMode.renderMode,
  ]);

  useEffect(() => {
    const gateState = selectedPhaseVisualReadyGateRef.current;
    const currentSnapshot = transformerBoxFlowSnapshotRef.current;
    const currentSessionIdentity = resolveSelectionSessionIdentity(
      currentSnapshot?.sessionIdentity || null,
      currentSnapshot?.visualIdentity || null
    );
    const currentBounds = currentSnapshot?.bounds || null;
    const boundsReadiness = resolveBoundsVisualReadiness(currentBounds);
    const boundsKey = buildBoundsVisualReadinessKey(currentBounds);
    const currentReadyProbeActive = Boolean(
      currentSnapshot?.readyProbeActive && !currentSnapshot?.visible
    );
    const currentReadinessEligible = Boolean(
      currentSnapshot?.visualIdentity &&
      currentSessionIdentity &&
      (currentSnapshot?.visible || currentReadyProbeActive)
    );
    const currentReadySource = currentReadyProbeActive
      ? "bounds-ready-probe"
      : "bounds-visible";
    const currentReadySignalBase = currentReadyProbeActive
      ? "selection-box-ready-probe+valid-bounds"
      : "selection-box-shown+valid-bounds";
    const readyCandidateKey =
      currentReadinessEligible
        ? [
            currentSessionIdentity,
            currentSnapshot.visualIdentity,
            boundsKey,
          ].join("|")
        : null;

    const resetReadyState = (reason, meta = {}) => {
      if (
        gateState.rafId &&
        typeof cancelAnimationFrame === "function"
      ) {
        cancelAnimationFrame(gateState.rafId);
      }
      const hadConfirmedReady = Boolean(gateState.confirmedKey && gateState.lastMeta);
      gateState.rafId = 0;
      gateState.pendingKey = null;
      gateState.confirmedKey = null;
      gateState.blockedKey = null;

      if (!hadConfirmedReady) {
        gateState.lastMeta = null;
        return;
      }

      const lastMeta = gateState.lastMeta || {};
      gateState.lastMeta = null;
      logCanvasBoxFlow("selection", "selected-phase:ready-reset", {
        source: "transformer-primary",
        phase: canvasInteractionSettling ? "settling" : "selected",
        owner: "selected-phase",
        selectedIds:
          meta.visualIdentity || lastMeta.visualIdentity || currentSnapshot?.visualIdentity || null,
        visualIds:
          meta.visualIdentity || lastMeta.visualIdentity || currentSnapshot?.visualIdentity || null,
        selectionAuthority: "logical-selection",
        geometryAuthority: "transformer-live",
        overlayVisible: Boolean(dragSelectionOverlayVisible),
        settling: Boolean(canvasInteractionSettling),
        suppressedLayers:
          dragSelectionOverlayVisible
            ? ["drag-overlay", "hover-indicator"]
            : ["hover-indicator"],
        reason,
        readySource: meta.readySource || lastMeta.readySource || null,
        readySignal: meta.readySignal || lastMeta.readySignal || null,
        postPaintConfirmed: false,
        boundsValid:
          typeof meta.boundsValid === "boolean"
            ? meta.boundsValid
            : (typeof lastMeta.boundsValid === "boolean" ? lastMeta.boundsValid : false),
        zeroBounds:
          typeof meta.zeroBounds === "boolean"
            ? meta.zeroBounds
            : (typeof lastMeta.zeroBounds === "boolean" ? lastMeta.zeroBounds : false),
        bounds: meta.bounds || lastMeta.bounds || currentBounds,
        readyProbeActive: Boolean(meta.readyProbeActive),
        selectedPhaseActuallyVisible: Boolean(meta.selectedPhaseActuallyVisible),
      }, {
        identity:
          meta.sessionIdentity ||
          lastMeta.sessionIdentity ||
          currentSessionIdentity ||
          currentSnapshot?.visualIdentity ||
          null,
      });
      onPrimarySelectionVisualReadyChange?.(false, {
        source: "transformer-primary",
        reason,
        renderMode:
          meta.renderMode || lastMeta.renderMode || currentSnapshot?.renderMode || null,
        readySource: meta.readySource || lastMeta.readySource || null,
        readySignal: meta.readySignal || lastMeta.readySignal || null,
        postPaintConfirmed: false,
        boundsValid:
          typeof meta.boundsValid === "boolean"
            ? meta.boundsValid
            : (typeof lastMeta.boundsValid === "boolean" ? lastMeta.boundsValid : false),
        zeroBounds:
          typeof meta.zeroBounds === "boolean"
            ? meta.zeroBounds
            : (typeof lastMeta.zeroBounds === "boolean" ? lastMeta.zeroBounds : false),
        visualIdentity:
          meta.visualIdentity || lastMeta.visualIdentity || currentSnapshot?.visualIdentity || null,
        sessionIdentity:
          meta.sessionIdentity || lastMeta.sessionIdentity || currentSessionIdentity || null,
        bounds: meta.bounds || lastMeta.bounds || currentBounds,
        attachedNodeIds:
          meta.attachedNodeIds ||
          lastMeta.attachedNodeIds ||
          currentSnapshot?.attachedNodeIds ||
          null,
        readyProbeActive: Boolean(
          Object.prototype.hasOwnProperty.call(meta, "readyProbeActive")
            ? meta.readyProbeActive
            : (
                Object.prototype.hasOwnProperty.call(lastMeta, "readyProbeActive")
                  ? lastMeta.readyProbeActive
                  : currentReadyProbeActive
              )
        ),
        selectedPhaseActuallyVisible: Boolean(
          Object.prototype.hasOwnProperty.call(meta, "selectedPhaseActuallyVisible")
            ? meta.selectedPhaseActuallyVisible
            : (
                Object.prototype.hasOwnProperty.call(
                  lastMeta,
                  "selectedPhaseActuallyVisible"
                )
                  ? lastMeta.selectedPhaseActuallyVisible
                  : currentSnapshot?.visible
              )
        ),
      });
    };

    if (!currentReadinessEligible) {
      resetReadyState(
        currentSnapshot?.visible
          ? "selection-session-unavailable"
          : dragSelectionOverlayVisible && shouldSuppressTransformerVisualsForDragOverlay
            ? "drag-overlay-suppressed"
            : "selection-box-hidden",
        {
          readySource: currentReadyProbeActive
            ? "ready-probe-reset"
            : "selection-box-hidden",
          readySignal: currentReadyProbeActive
            ? "selection-box-ready-probe-lost"
            : "transformer-hidden",
          boundsValid: false,
          zeroBounds: false,
          bounds: currentBounds,
          readyProbeActive: currentReadyProbeActive,
          selectedPhaseActuallyVisible: Boolean(currentSnapshot?.visible),
          visualIdentity: currentSnapshot?.visualIdentity || null,
          sessionIdentity: currentSessionIdentity || null,
          renderMode: currentSnapshot?.renderMode || null,
        }
      );
      return;
    }

    if (!boundsReadiness.visuallyReadyBounds) {
      resetReadyState(
        boundsReadiness.zeroBounds ? "zero-bounds" : "invalid-bounds",
        {
          readySource: currentReadySource,
          readySignal: currentReadySignalBase,
          boundsValid: boundsReadiness.boundsValid,
          zeroBounds: boundsReadiness.zeroBounds,
          bounds: currentBounds,
          readyProbeActive: currentReadyProbeActive,
          selectedPhaseActuallyVisible: Boolean(currentSnapshot?.visible),
          visualIdentity: currentSnapshot.visualIdentity,
          sessionIdentity: currentSessionIdentity,
          renderMode: currentSnapshot.renderMode,
        }
      );
      const blockedKey = [
        currentSessionIdentity || "selection",
        currentSnapshot.visualIdentity || "selection",
        boundsKey,
        boundsReadiness.zeroBounds ? "zero-bounds" : "invalid-bounds",
      ].join("|");
      if (gateState.blockedKey !== blockedKey) {
        gateState.blockedKey = blockedKey;
        logCanvasBoxFlow("selection", "selected-phase:ready-blocked", {
          source: "transformer-primary",
          phase: canvasInteractionSettling ? "settling" : "selected",
          owner: "selected-phase",
          selectedIds: currentSnapshot.visualIdentity,
          visualIds: currentSnapshot.visualIdentity,
          selectionAuthority: "logical-selection",
          geometryAuthority: "transformer-live",
          overlayVisible: Boolean(dragSelectionOverlayVisible),
          settling: Boolean(canvasInteractionSettling),
          suppressedLayers:
            dragSelectionOverlayVisible
              ? ["drag-overlay", "hover-indicator"]
              : ["hover-indicator"],
          reason: boundsReadiness.zeroBounds
            ? "zero-bounds"
            : (boundsReadiness.hasBounds ? "invalid-bounds" : "missing-bounds"),
          readySource: currentReadySource,
          readySignal: currentReadyProbeActive
            ? "selection-box-ready-probe"
            : "selection-box-shown",
          postPaintConfirmed: false,
          boundsValid: boundsReadiness.boundsValid,
          zeroBounds: boundsReadiness.zeroBounds,
          bounds: currentBounds,
          readyProbeActive: currentReadyProbeActive,
          selectedPhaseActuallyVisible: Boolean(currentSnapshot.visible),
        }, {
          identity: currentSessionIdentity || currentSnapshot.visualIdentity || null,
        });
      }
      return;
    }

    gateState.blockedKey = null;
    if (gateState.confirmedKey === readyCandidateKey) {
      return;
    }
    if (gateState.pendingKey === readyCandidateKey) {
      return;
    }
    if (
      gateState.rafId &&
      typeof cancelAnimationFrame === "function"
    ) {
      cancelAnimationFrame(gateState.rafId);
    }
    gateState.rafId = 0;
    gateState.pendingKey = readyCandidateKey;

    logCanvasBoxFlow("selection", "selected-phase:ready-pending", {
      source: "transformer-primary",
      phase: canvasInteractionSettling ? "settling" : "selected",
      owner: "selected-phase",
      selectedIds: currentSnapshot.visualIdentity,
      visualIds: currentSnapshot.visualIdentity,
      selectionAuthority: "logical-selection",
      geometryAuthority: "transformer-live",
      overlayVisible: Boolean(dragSelectionOverlayVisible),
      settling: Boolean(canvasInteractionSettling),
      suppressedLayers:
        dragSelectionOverlayVisible
          ? ["drag-overlay", "hover-indicator"]
          : ["hover-indicator"],
      reason: currentReadyProbeActive
        ? "await-post-paint-confirmation-under-overlay"
        : "await-post-paint-confirmation",
      readySource: currentReadySource,
      readySignal: currentReadySignalBase,
      postPaintConfirmed: false,
      boundsValid: boundsReadiness.boundsValid,
      zeroBounds: boundsReadiness.zeroBounds,
      bounds: currentBounds,
      readyProbeActive: currentReadyProbeActive,
      selectedPhaseActuallyVisible: Boolean(currentSnapshot.visible),
    }, {
      identity: currentSessionIdentity || currentSnapshot.visualIdentity || null,
    });

    const confirmReady = () => {
      const latestSnapshot = transformerBoxFlowSnapshotRef.current;
      const latestSessionIdentity = resolveSelectionSessionIdentity(
        latestSnapshot?.sessionIdentity || null,
        latestSnapshot?.visualIdentity || null
      );
      const latestBounds = latestSnapshot?.bounds || null;
      const latestBoundsReadiness = resolveBoundsVisualReadiness(latestBounds);
      const latestBoundsKey = buildBoundsVisualReadinessKey(latestBounds);
      const latestReadyProbeActive = Boolean(
        latestSnapshot?.readyProbeActive && !latestSnapshot?.visible
      );
      const latestReadinessEligible = Boolean(
        latestSnapshot?.visualIdentity &&
        latestSessionIdentity &&
        (latestSnapshot?.visible || latestReadyProbeActive)
      );
      const latestReadyConfirmedSource = latestReadyProbeActive
        ? "post-paint-ready-probe-confirmed"
        : "post-paint-confirmed";
      const latestReadyConfirmedSignal = latestReadyProbeActive
        ? "selection-box-ready-probe+valid-bounds+post-paint"
        : "selection-box-shown+valid-bounds+post-paint";
      const latestReadyCandidateKey =
        latestReadinessEligible
          ? [
              latestSessionIdentity,
              latestSnapshot.visualIdentity,
              latestBoundsKey,
            ].join("|")
          : null;

      gateState.rafId = 0;

      if (latestReadyCandidateKey !== readyCandidateKey) {
        gateState.pendingKey = null;
        gateState.confirmedKey = null;
        const staleReadySample = sampleCanvasInteractionLog(
          `selected-phase:stale-ready:${readyCandidateKey || "none"}:${latestReadyCandidateKey || "none"}`,
          {
            firstCount: 8,
            throttleMs: 120,
          }
        );
        if (staleReadySample.shouldLog) {
          logCanvasBoxFlow("selection", "selected-phase:stale-ready-ignored", {
            source: "transformer-primary",
            phase: canvasInteractionSettling ? "settling" : "selected",
            owner: "selected-phase",
            selectedIds:
              latestSnapshot?.visualIdentity || currentSnapshot.visualIdentity,
            visualIds:
              latestSnapshot?.visualIdentity || currentSnapshot.visualIdentity,
            selectionAuthority: "logical-selection",
            geometryAuthority: "transformer-live",
            overlayVisible: Boolean(dragSelectionOverlayVisible),
            settling: Boolean(canvasInteractionSettling),
            suppressedLayers:
              dragSelectionOverlayVisible
                ? ["drag-overlay", "hover-indicator"]
                : ["hover-indicator"],
            reason: !latestReadinessEligible
              ? "selection-session-changed-before-post-paint-confirmation"
              : "ready-candidate-changed-before-post-paint-confirmation",
            readySource: "post-paint-check",
            readySignal: currentReadySignalBase,
            postPaintConfirmed: false,
            pendingReadyCandidateKey: readyCandidateKey,
            latestReadyCandidateKey,
            expectedSessionIdentity: currentSessionIdentity || null,
            latestSessionIdentity: latestSessionIdentity || null,
            bounds: latestBounds,
            readyProbeActive: latestReadyProbeActive,
            selectedPhaseActuallyVisible: Boolean(latestSnapshot?.visible),
          }, {
            identity:
              latestSessionIdentity ||
              latestSnapshot?.visualIdentity ||
              currentSessionIdentity ||
              currentSnapshot.visualIdentity ||
              null,
          });
        }
        return;
      }

      if (!latestBoundsReadiness.visuallyReadyBounds) {
        gateState.pendingKey = null;
        gateState.confirmedKey = null;
        const blockedKey = [
          latestSessionIdentity || currentSessionIdentity || "selection",
          latestSnapshot?.visualIdentity || currentSnapshot.visualIdentity || "selection",
          latestBoundsKey,
          !latestSnapshot?.visible
            ? "post-paint-hidden"
            : latestBoundsReadiness.zeroBounds
              ? "post-paint-zero-bounds"
              : "post-paint-invalid-bounds",
        ].join("|");
        if (gateState.blockedKey !== blockedKey) {
          gateState.blockedKey = blockedKey;
          logCanvasBoxFlow("selection", "selected-phase:ready-blocked", {
            source: "transformer-primary",
            phase: canvasInteractionSettling ? "settling" : "selected",
            owner: "selected-phase",
            selectedIds:
              latestSnapshot?.visualIdentity || currentSnapshot.visualIdentity,
            visualIds:
              latestSnapshot?.visualIdentity || currentSnapshot.visualIdentity,
            selectionAuthority: "logical-selection",
            geometryAuthority: "transformer-live",
            overlayVisible: Boolean(dragSelectionOverlayVisible),
            settling: Boolean(canvasInteractionSettling),
            suppressedLayers:
              dragSelectionOverlayVisible
                ? ["drag-overlay", "hover-indicator"]
                : ["hover-indicator"],
            reason: !latestReadinessEligible
              ? latestReadyProbeActive
                ? "post-paint-ready-probe-hidden"
                : "post-paint-hidden"
              : latestBoundsReadiness.zeroBounds
                ? "post-paint-zero-bounds"
                : "post-paint-invalid-bounds",
            readySource: "post-paint-check",
            readySignal: currentReadySignalBase,
            postPaintConfirmed: false,
            boundsValid: latestBoundsReadiness.boundsValid,
            zeroBounds: latestBoundsReadiness.zeroBounds,
            bounds: latestBounds,
            readyProbeActive: latestReadyProbeActive,
            selectedPhaseActuallyVisible: Boolean(latestSnapshot?.visible),
          }, {
            identity:
              latestSessionIdentity ||
              latestSnapshot?.visualIdentity ||
              currentSessionIdentity ||
              currentSnapshot.visualIdentity ||
              null,
          });
        }
        return;
      }

      gateState.pendingKey = null;
      gateState.confirmedKey = readyCandidateKey;
      gateState.blockedKey = null;
      gateState.lastMeta = {
        renderMode: latestSnapshot.renderMode,
        readySource: latestReadyConfirmedSource,
        readySignal: latestReadyConfirmedSignal,
        boundsValid: latestBoundsReadiness.boundsValid,
        zeroBounds: latestBoundsReadiness.zeroBounds,
        visualIdentity: latestSnapshot.visualIdentity,
        sessionIdentity: latestSessionIdentity,
        bounds: latestBounds,
        attachedNodeIds: latestSnapshot.attachedNodeIds || null,
        readyProbeActive: latestReadyProbeActive,
        selectedPhaseActuallyVisible: Boolean(latestSnapshot.visible),
      };
      logCanvasBoxFlow("selection", "selected-phase:ready-confirmed", {
        source: "transformer-primary",
        phase: canvasInteractionSettling ? "settling" : "selected",
        owner: "selected-phase",
        selectedIds: latestSnapshot.visualIdentity,
        visualIds: latestSnapshot.visualIdentity,
        selectionAuthority: "logical-selection",
        geometryAuthority: "transformer-live",
        overlayVisible: Boolean(dragSelectionOverlayVisible),
        settling: Boolean(canvasInteractionSettling),
        suppressedLayers:
          dragSelectionOverlayVisible
            ? ["drag-overlay", "hover-indicator"]
            : ["hover-indicator"],
        reason: latestReadyProbeActive
          ? "post-paint-ready-probe-bounds"
          : "post-paint-visible-bounds",
        readySource: latestReadyConfirmedSource,
        readySignal: latestReadyConfirmedSignal,
        postPaintConfirmed: true,
        boundsValid: latestBoundsReadiness.boundsValid,
        zeroBounds: latestBoundsReadiness.zeroBounds,
        bounds: latestBounds,
        readyProbeActive: latestReadyProbeActive,
        selectedPhaseActuallyVisible: Boolean(latestSnapshot.visible),
      }, {
        identity: latestSessionIdentity || latestSnapshot.visualIdentity || null,
      });
      onPrimarySelectionVisualReadyChange?.(true, {
        source: "transformer-primary",
        reason: latestReadyProbeActive
          ? "post-paint-ready-probe-bounds"
          : "post-paint-visible-bounds",
        renderMode: latestSnapshot.renderMode,
        readySource: latestReadyConfirmedSource,
        readySignal: latestReadyConfirmedSignal,
        postPaintConfirmed: true,
        boundsValid: latestBoundsReadiness.boundsValid,
        zeroBounds: latestBoundsReadiness.zeroBounds,
        visualIdentity: latestSnapshot.visualIdentity,
        sessionIdentity: latestSessionIdentity,
        bounds: latestBounds,
        attachedNodeIds: latestSnapshot.attachedNodeIds || null,
        readyProbeActive: latestReadyProbeActive,
        selectedPhaseActuallyVisible: Boolean(latestSnapshot.visible),
      });
    };

    if (typeof requestAnimationFrame !== "function") {
      confirmReady();
      return;
    }

    gateState.rafId = requestAnimationFrame(confirmReady);
  }, [
    canvasInteractionSettling,
    dragSelectionOverlayVisible,
    onPrimarySelectionVisualReadyChange,
    selectedElements.length,
    selectedGeomKey,
    selectionKey,
    hasDragOverlayVisualOwnership,
    shouldSuppressTransformerVisualsForDragOverlay,
    shouldProbeSelectedPhaseReadinessUnderOverlay,
    shouldUseGenericTransformer,
    transformTick,
    transformerVisualMode.renderMode,
  ]);

  useEffect(
    () => () => {
      const gateState = selectedPhaseVisualReadyGateRef.current;
      if (
        gateState.rafId &&
        typeof cancelAnimationFrame === "function"
      ) {
        cancelAnimationFrame(gateState.rafId);
      }
      gateState.rafId = 0;
      gateState.pendingKey = null;
      gateState.confirmedKey = null;
      gateState.blockedKey = null;
      gateState.lastMeta = null;
    },
    []
  );

  useEffect(() => {
    if (transformerVisualMode.renderMode !== "line-indicator") {
      lineIndicatorVisibilitySnapshotRef.current = null;
      return;
    }

    const nextPhase = predragVisualSelectionActive
      ? "predrag"
      : canvasInteractionSettling
        ? "settling"
        : (effectiveDragging || canvasInteractionActive ? "drag" : "selected");
    const nextSuppressed = Boolean(
      isTransformerAttachBlocked ||
      hasDragOverlayVisualOwnership ||
      shouldSuppressTransformerVisualsForDragOverlay
    );
    const nextSelectionKind = hayLineas
      ? "line"
      : (hasPreservedGroupSelection ? "preserved-group" : "line-indicator");
    const nextSnapshot = {
      suppressed: nextSuppressed,
      phase: nextPhase,
      selectionKind: nextSelectionKind,
      visualIds: selectionKey || null,
    };
    const previousSnapshot = lineIndicatorVisibilitySnapshotRef.current;
    const didChange =
      !previousSnapshot ||
      previousSnapshot.suppressed !== nextSnapshot.suppressed ||
      previousSnapshot.phase !== nextSnapshot.phase ||
      previousSnapshot.selectionKind !== nextSnapshot.selectionKind ||
      previousSnapshot.visualIds !== nextSnapshot.visualIds;

    lineIndicatorVisibilitySnapshotRef.current = nextSnapshot;
    if (!didChange) return;

    logCanvasBoxFlow(
      "selection",
      nextSuppressed ? "line-indicator:suppressed" : "line-indicator:allowed",
      {
        source: "line-indicator",
        phase: nextPhase,
        owner: "selected-phase",
        selectedIds: selectionKey || null,
        visualIds: selectionKey || null,
        selectionKind: nextSelectionKind,
        selectionAuthority: "logical-selection",
        geometryAuthority: "selected-auto-bounds",
        overlayVisible: false,
        settling: nextPhase === "settling",
        suppressedLayers: nextSuppressed ? ["selected-phase"] : [],
        reason: nextSuppressed
          ? (
              isTransformerAttachBlocked
                ? "attach-blocked"
                : hasDragOverlayVisualOwnership
                  ? "drag-overlay-owned"
                  : "drag-overlay-suppressed"
            )
          : "selected-phase-allowed",
      },
      {
        identity: buildSelectionBoxFlowSessionIdentity(),
      }
    );
  }, [
    canvasInteractionActive,
    canvasInteractionSettling,
    effectiveDragging,
    hasDragOverlayVisualOwnership,
    hasPreservedGroupSelection,
    hayLineas,
    isTransformerAttachBlocked,
    predragVisualSelectionActive,
    selectionKey,
    shouldSuppressTransformerVisualsForDragOverlay,
    transformerVisualMode.renderMode,
  ]);




  // ðŸ”¥ Render

  if (transformerVisualMode.renderMode === "none") {
    return null;
  }

  if (selectedElements.length === 0) return null;

  if (transformerVisualMode.renderMode === "line-indicator") {
    if (
      isTransformerAttachBlocked ||
      hasDragOverlayVisualOwnership ||
      shouldSuppressTransformerVisualsForDragOverlay
    ) {
      return null;
    }

    return (
      <SelectionBoundsIndicator
        selectedElements={selectedElements}
        elementRefs={elementRefs}
        objetos={objetos}
        isMobile={isMobile}
        debugLog={slog}
        debugSource="line-indicator"
        boxFlowSessionIdentity={boxFlowSessionIdentity || null}
      />
    );
  }

  const isResizeHintVisible =
    resizeHintPhase > 0 &&
    !isResizeGestureActive &&
    !isTransformingResizeRef.current;
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
      ref={setTransformerNodeRef}
      visible={!shouldSuppressTransformerVisualsForDragOverlay}

      // ðŸ”µ borde siempre visible
      borderEnabled={transformerVisualMode.borderEnabled}

      borderStroke={transformerBorderStroke}


      borderStrokeWidth={transformerBorderVisualWidth}
      padding={transformerPaddingForRender}

      // âŒ nodos y rotaciÃ³n OFF durante drag
      enabledAnchors={transformerVisualMode.enabledAnchors}
      rotateEnabled={transformerVisualMode.rotateEnabled}
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
          const currentRenderGallery =
            applyGalleryLayoutPresetToRenderObject(primerElemento) || primerElemento;
          const rows = Math.max(1, Number(currentRenderGallery?.rows) || 1);
          const cols = Math.max(1, Number(currentRenderGallery?.cols) || 1);
          const gap = Math.max(0, Number(currentRenderGallery?.gap) || 0);
          const cellRatio =
            currentRenderGallery?.ratio === "4:3"
              ? 3 / 4
              : currentRenderGallery?.ratio === "16:9"
                ? 9 / 16
                : 1;
          const hasPresetContract =
            Array.isArray(primerElemento?.allowedLayouts) &&
            primerElemento.allowedLayouts.length > 0;

          const minGridWidth = gap * (cols - 1) + cols;
          const nextWidth = Math.min(
            maxSize,
            Math.max(minSize, minGridWidth, Math.abs(newBox.width))
          );
          const nextRenderGallery =
            applyGalleryLayoutPresetToRenderObject({
              ...primerElemento,
              width: nextWidth,
            }) || {
              ...currentRenderGallery,
              width: nextWidth,
            };
          const cellW = Math.max(1, (nextWidth - gap * (cols - 1)) / cols);
          const fallbackHeight = rows * (cellW * cellRatio) + gap * (rows - 1);
          const nextHeight =
            hasPresetContract && Number.isFinite(Number(nextRenderGallery?.height))
              ? Number(nextRenderGallery.height)
              : fallbackHeight;

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
        if (hasActiveInlineEditingSession) {
          logCanvasBoxFlow("selection", "transform:start-blocked", {
            source: "selection-transformer",
            reason: "inline-editing-active",
            selectedIds: selectionKey || null,
          }, {
            identity: buildSelectionBoxFlowSessionIdentity(),
          });
          if (editingId && typeof requestInlineEditFinish === "function") {
            requestInlineEditFinish("transform-start");
          }
          try {
            e?.evt?.preventDefault?.();
            e?.evt?.stopPropagation?.();
          } catch {}
          stopNativeTransformerIfActive();
          resetTransformerGestureUiState({
            syncOverlay: true,
            clearRotatePreviewState: true,
          });
          transformerRef.current?.getLayer?.()?.batchDraw?.();
          return;
        }
        stopResizeHintPulse();
        isTransformingResizeRef.current = true;
        window._resizeData = { isResizing: true };
        pendingUiRestoreEpochRef.current = 0;
        if (typeof cancelCanvasUiAfterSettle === "function") {
          cancelCanvasUiAfterSettle(transformerRestoreKey);
        }
        clearPendingRotatePreview();
        resetProcessedRotatePreview();
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
        logCanvasBoxFlow("selection", "transform:start", buildTransformBoxFlowPayload(
          null,
          {},
          {
            pointerType: e?.evt?.pointerType ?? null,
            isImageSelection: Boolean(esImagenSeleccionada),
          }
        ), {
          identity: buildSelectionBoxFlowSessionIdentity(),
          flushSummaryKeys: ["transform-preview"],
          flushReason: "transform-start",
        });
        if (!isRotateGesture && esImagenSeleccionada) {
          const imageNode = typeof tr?.nodes === "function" ? (tr.nodes() || [])[0] || null : null;
          setImageResizeSessionActive(imageNode, {
            activeAnchor: activeAnchor ?? null,
          });
          deactivateImageLayerPerf(imageNode, primerElemento?.id ?? null, {
            cacheEventPrefix: "image:selection-cache",
            cacheStateKey: "canvasSelectionCache",
            manageActivePayload: false,
          });
          trackImageResizeDebug("transform-start:image-cache-cleared", {
            elementId: primerElemento?.id ?? null,
            activeAnchor: activeAnchor ?? null,
            node: getImageResizeNodeSnapshot(imageNode),
          });
        }
        if (isRotateGesture) {
          const interactionId = `${
            primerElemento?.id || selectedElements.join(",") || "selection"
          }:${Date.now()}`;
          rotationLifecycleDebugRef.current = {
            interactionId,
            previewCount: 0,
          };
          resetCanvasInteractionLogSample(buildRotationPreviewSampleKey(interactionId));
        } else {
          resetRotationLifecycleDebug();
        }
        if (isRotateGesture) {
          const nodes = typeof tr?.nodes === "function" ? tr.nodes() || [] : [];
          logSelectedDragDebug("transform:rotate:start", buildRotationDebugPayload(
            e,
            nodes[0] || null,
            {
              pointerType: e?.evt?.pointerType ?? null,
              activeAnchor: activeAnchor ?? null,
            }
          ));
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
          resetTransformerGestureUiState({
            syncOverlay: false,
            clearRotatePreviewState: true,
          });
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
        if (!transformGestureRef.current?.isRotate) {
          hideRotationIndicator();
        }

        try {
          const pose = getTransformPose(node);
          const stage = node?.getStage?.() || null;
          const pointer =
            stage && typeof stage.getPointerPosition === "function"
              ? stage.getPointerPosition()
              : null;
          const pointerX = Number.isFinite(Number(pointer?.x))
            ? roundNodeMetric(pointer.x)
            : null;
          const pointerY = Number.isFinite(Number(pointer?.y))
            ? roundNodeMetric(pointer.y)
            : null;
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

          if (transformGestureRef.current?.isRotate) {
            scheduleRotatePreview({
              node,
              transformData,
              pointerType: e?.evt?.pointerType ?? null,
              pointerX,
              pointerY,
              scheduledAtMs:
                typeof performance !== "undefined" && typeof performance.now === "function"
                  ? performance.now()
                  : null,
            });
          } else {
            onTransform(transformData);
          }

          recordCanvasBoxFlowSummary(
            "selection",
            "transform-preview",
            buildTransformBoxFlowPayload(node, transformData, {
              pointerType: e?.evt?.pointerType ?? null,
            }),
            {
              identity: buildSelectionBoxFlowSessionIdentity(
                buildAttachedNodeIdsDigest(nodes)
              ),
              eventName: "transform:summary",
            }
          );

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
          flushPendingRotatePreview({ force: true });
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

            const updates = nodes
              .map((n) => {
                let id = null;
                try {
                  id = (typeof n.id === "function" ? n.id() : n.attrs?.id) || null;
                } catch { }
                if (!id) return null;

                const obj = (objetos || []).find((o) => o.id === id);
                if (!obj) return null;

                const canonicalPose = resolveCanonicalNodePose(n, obj);
                const upd = {
                  id,
                  x: canonicalPose.x,
                  y: canonicalPose.y,
                  rotation: canonicalPose.rotation,
                };
                const nodeScaleX =
                  typeof n.scaleX === "function" ? n.scaleX() || 1 : 1;
                const nodeScaleY =
                  typeof n.scaleY === "function" ? n.scaleY() || 1 : 1;
                const avgScale =
                  (Math.abs(nodeScaleX) + Math.abs(nodeScaleY)) / 2;
                let liveRect = null;
                try {
                  liveRect = n.getClientRect({
                    skipTransform: false,
                    skipShadow: true,
                    skipStroke: true,
                  });
                } catch {}

                if (obj.tipo === "texto") {
                  const base = obj.fontSize || 24;
                  upd.fontSize = Math.max(6, Math.round(base * avgScale));
                  if (typeof n.scaleX === "function") {
                    n.scaleX(1);
                    n.scaleY(1);
                  }
                  if (
                    Number.isFinite(upd.fontSize) &&
                    typeof n.fontSize === "function"
                  ) {
                    n.fontSize(upd.fontSize);
                  }
                  TRDBG("multi-transform:end:update", {
                    id,
                    tipo: obj.tipo,
                    trScaleX: roundNodeMetric(tScaleX, 3),
                    trScaleY: roundNodeMetric(tScaleY, 3),
                    nodeScaleX: roundNodeMetric(nodeScaleX, 3),
                    nodeScaleY: roundNodeMetric(nodeScaleY, 3),
                    rectW: roundNodeMetric(liveRect?.width, 3),
                    rectH: roundNodeMetric(liveRect?.height, 3),
                    fontSize: roundNodeMetric(upd.fontSize, 3),
                  });
                  return upd;
                }

                if (obj.tipo === "forma" && obj.figura === "circle") {
                  const baseR = obj.radius || 50;
                  const diameter =
                    Number.isFinite(liveRect?.width) &&
                    Number.isFinite(liveRect?.height)
                      ? Math.max(1, Math.max(liveRect.width, liveRect.height))
                      : Math.max(1, baseR * 2 * avgScale);
                  upd.radius = diameter / 2;
                  if (typeof n.scaleX === "function") {
                    n.scaleX(1);
                    n.scaleY(1);
                  }
                  if (
                    Number.isFinite(upd.radius) &&
                    typeof n.radius === "function"
                  ) {
                    n.radius(upd.radius);
                  }
                  TRDBG("multi-transform:end:update", {
                    id,
                    tipo: `${obj.tipo}:${obj.figura}`,
                    trScaleX: roundNodeMetric(tScaleX, 3),
                    trScaleY: roundNodeMetric(tScaleY, 3),
                    nodeScaleX: roundNodeMetric(nodeScaleX, 3),
                    nodeScaleY: roundNodeMetric(nodeScaleY, 3),
                    rectW: roundNodeMetric(liveRect?.width, 3),
                    rectH: roundNodeMetric(liveRect?.height, 3),
                    radius: roundNodeMetric(upd.radius, 3),
                  });
                  return upd;
                }

                if (obj.tipo === "forma" && obj.figura === "triangle") {
                  const baseR = obj.radius || 60;
                  upd.radius = Math.max(1, baseR * avgScale);
                  if (typeof n.scaleX === "function") {
                    n.scaleX(1);
                    n.scaleY(1);
                  }
                  if (
                    Number.isFinite(upd.radius) &&
                    typeof n.radius === "function"
                  ) {
                    n.radius(upd.radius);
                  }
                  TRDBG("multi-transform:end:update", {
                    id,
                    tipo: `${obj.tipo}:${obj.figura}`,
                    trScaleX: roundNodeMetric(tScaleX, 3),
                    trScaleY: roundNodeMetric(tScaleY, 3),
                    nodeScaleX: roundNodeMetric(nodeScaleX, 3),
                    nodeScaleY: roundNodeMetric(nodeScaleY, 3),
                    rectW: roundNodeMetric(liveRect?.width, 3),
                    rectH: roundNodeMetric(liveRect?.height, 3),
                    radius: roundNodeMetric(upd.radius, 3),
                  });
                  return upd;
                }

                if (obj.tipo === "countdown") {
                  const countdownSize = getCountdownScaledSize(n);
                  upd.width = countdownSize.width;
                  upd.height = countdownSize.height;
                  if (typeof n.scaleX === "function") {
                    n.scaleX(1);
                    n.scaleY(1);
                  }
                  if (typeof n.width === "function") {
                    n.width(upd.width);
                  }
                  if (typeof n.height === "function") {
                    n.height(upd.height);
                  }
                  TRDBG("multi-transform:end:update", {
                    id,
                    tipo: obj.tipo,
                    trScaleX: roundNodeMetric(tScaleX, 3),
                    trScaleY: roundNodeMetric(tScaleY, 3),
                    nodeScaleX: roundNodeMetric(nodeScaleX, 3),
                    nodeScaleY: roundNodeMetric(nodeScaleY, 3),
                    rectW: roundNodeMetric(liveRect?.width, 3),
                    rectH: roundNodeMetric(liveRect?.height, 3),
                    width: roundNodeMetric(upd.width, 3),
                    height: roundNodeMetric(upd.height, 3),
                  });
                  return upd;
                }

                const baseW =
                  obj.width != null ? obj.width : (typeof n.width === "function" ? n.width() : 100);
                const baseH =
                  obj.height != null ? obj.height : (typeof n.height === "function" ? n.height() : 100);

                upd.width = Math.abs(baseW * nodeScaleX);
                upd.height = Math.abs(baseH * nodeScaleY);

                if (typeof n.scaleX === "function") {
                  n.scaleX(1);
                  n.scaleY(1);
                }
                if (Number.isFinite(upd.width) && typeof n.width === "function") {
                  n.width(upd.width);
                }
                if (Number.isFinite(upd.height) && typeof n.height === "function") {
                  n.height(upd.height);
                }
                TRDBG("multi-transform:end:update", {
                  id,
                  tipo: obj.tipo,
                  trScaleX: roundNodeMetric(tScaleX, 3),
                  trScaleY: roundNodeMetric(tScaleY, 3),
                  nodeScaleX: roundNodeMetric(nodeScaleX, 3),
                  nodeScaleY: roundNodeMetric(nodeScaleY, 3),
                  baseW: roundNodeMetric(baseW, 3),
                  baseH: roundNodeMetric(baseH, 3),
                  rectW: roundNodeMetric(liveRect?.width, 3),
                  rectH: roundNodeMetric(liveRect?.height, 3),
                  width: roundNodeMetric(upd.width, 3),
                  height: roundNodeMetric(upd.height, 3),
                });
                return upd;
              })
              .filter(Boolean);

            if (transformGestureRef.current?.isRotate) {
              logSelectedDragDebug("transform:rotate:end", {
                interactionId: rotationLifecycleDebugRef.current?.interactionId || null,
                previewCount: rotationLifecycleDebugRef.current?.previewCount || 0,
                selectedIds: selectedElements,
                selectedCount: selectedElements.length,
                primerElementoId: primerElemento?.id || null,
                primerElementoTipo: primerElemento?.tipo || null,
                isImageRotateGesture: Boolean(esImagenSeleccionada),
                activeAnchor: transformGestureRef.current?.activeAnchor ?? null,
                batch: updates,
                selection: getCanvasSelectionDebugInfo(),
              });
            }

            onTransform({ isFinal: true, batch: updates });

            if (typeof tr.scaleX === "function") {
              tr.scaleX(1);
              tr.scaleY(1);
            }
            tr.getLayer()?.batchDraw();
            scheduleTransformerRestoreAfterSettle("transform-end-multi", {
              forceAttach: true,
            });
            logCanvasBoxFlow("selection", "transform:end", {
              source: "selection-transformer",
              mode: transformGestureRef.current?.isRotate ? "rotate" : "transform",
              activeAnchor: transformGestureRef.current?.activeAnchor ?? null,
              selectedIds: selectionKey || null,
              batchCount: updates.length,
              attachedNodeIds: buildAttachedNodeIdsDigest(nodes),
              bounds: getTransformerBoundsDigest(tr),
            }, {
              identity: buildSelectionBoxFlowSessionIdentity(buildAttachedNodeIdsDigest(nodes)),
              flushSummaryKeys: ["transform-preview"],
              flushReason: "transform-end-multi",
            });

            window._resizeData = { isResizing: false };
            setTimeout(() => {
              window._resizeData = null;
            }, 100);

            return;
          } catch (err) {
            console.warn("Error en onTransformEnd (multi):", err);
            logCanvasBoxFlow("selection", "transform:error", {
              source: "selection-transformer",
              mode: transformGestureRef.current?.isRotate ? "rotate" : "transform",
              activeAnchor: transformGestureRef.current?.activeAnchor ?? null,
              selectedIds: selectionKey || null,
              message: err?.message || String(err),
              branch: "multi",
            }, {
              identity: buildSelectionBoxFlowSessionIdentity(buildAttachedNodeIdsDigest(nodes)),
              flushSummaryKeys: ["transform-preview"],
              flushReason: "transform-error-multi",
            });
            window._resizeData = null;
            return;
          }
        }

        // -------------------------
        // SINGLE-SELECCIÃ“N
        // -------------------------
        const node = nodes[0];
        if (!node) {
          logCanvasBoxFlow("selection", "transform:end", {
            source: "selection-transformer",
            mode: transformGestureRef.current?.isRotate ? "rotate" : "transform",
            activeAnchor: transformGestureRef.current?.activeAnchor ?? null,
            selectedIds: selectionKey || null,
            reason: "missing-node",
          }, {
            identity: buildSelectionBoxFlowSessionIdentity(),
            flushSummaryKeys: ["transform-preview"],
            flushReason: "transform-end-missing-node",
          });
          if (transformGestureRef.current?.isRotate) {
            logSelectedDragDebug("transform:rotate:end-missing-node", {
              interactionId: rotationLifecycleDebugRef.current?.interactionId || null,
              previewCount: rotationLifecycleDebugRef.current?.previewCount || 0,
              selectedIds: selectedElements,
              selectedCount: selectedElements.length,
              primerElementoId: primerElemento?.id || null,
              primerElementoTipo: primerElemento?.tipo || null,
              isImageRotateGesture: Boolean(esImagenSeleccionada),
              activeAnchor: transformGestureRef.current?.activeAnchor ?? null,
              selection: getCanvasSelectionDebugInfo(),
            });
          }
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
            const endPoseSnapshot = resolveCanonicalNodePose(node, primerElemento);
            textPreviewEndSnapshot = {
              id: primerElemento?.id ?? null,
              x: endPoseSnapshot.x,
              y: endPoseSnapshot.y,
              rawX: endPoseSnapshot.rawX,
              rawY: endPoseSnapshot.rawY,
              rawOffsetX: endPoseSnapshot.rawOffsetX,
              rawOffsetY: endPoseSnapshot.rawOffsetY,
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
              nodeX: endPoseSnapshot.x,
              nodeY: endPoseSnapshot.y,
              rawNodeX: endPoseSnapshot.rawX,
              rawNodeY: endPoseSnapshot.rawY,
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
              const committedPose = resolveCanonicalNodePose(node, primerElemento);
              finalData.x = committedPose.x;
              finalData.y = committedPose.y;
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

            const renderedSize = getNodeRenderedSize(node);
            const visualCenter = resolveRotatedCenterFromPose(pose, renderedSize);
            const stabilizedPose = resolvePoseFromRotatedCenter(
              visualCenter,
              renderedSize,
              finalData.rotation
            );

            if (stabilizedPose) {
              finalData.x = stabilizedPose.x;
              finalData.y = stabilizedPose.y;
              try {
                if (typeof node.x === "function") {
                  node.x(stabilizedPose.x);
                }
                if (typeof node.y === "function") {
                  node.y(stabilizedPose.y);
                }
                node.getLayer?.()?.batchDraw?.();
              } catch {}
              trackImageRotationDebug("image-rotate:commit-pose-stabilized", {
                elementId: primerElemento?.id ?? null,
                activeAnchor: transformGestureRef.current?.activeAnchor ?? null,
                width: roundNodeMetric(renderedSize.width, 3),
                height: roundNodeMetric(renderedSize.height, 3),
                centerX: roundNodeMetric(visualCenter?.centerX, 3),
                centerY: roundNodeMetric(visualCenter?.centerY, 3),
                finalRotation: roundNodeMetric(finalData.rotation),
                finalX: roundNodeMetric(finalData.x, 3),
                finalY: roundNodeMetric(finalData.y, 3),
              });
            }
          }

          if (transformGestureRef.current?.isRotate) {
            logSelectedDragDebug(
              "transform:rotate:end",
              buildRotationDebugPayload(e, node, {
                finalData,
              })
            );
          }

          if (esImagenSeleccionada) {
            deactivateImageLayerPerf(node, primerElemento?.id ?? null, {
              cacheEventPrefix: "image:selection-cache",
              cacheStateKey: "canvasSelectionCache",
              manageActivePayload: false,
            });
            setPendingImageTransformCommit(node, finalData);
            trackImageResizeDebug("transform-end:image-cache-cleared", {
              elementId: primerElemento?.id ?? null,
              activeAnchor: transformGestureRef.current?.activeAnchor ?? null,
              node: getImageResizeNodeSnapshot(node),
            });
            trackImageResizeDebug("transform-end:image-final", {
              elementId: primerElemento?.id ?? null,
              activeAnchor: transformGestureRef.current?.activeAnchor ?? null,
              finalData: {
                x: finalData.x ?? null,
                y: finalData.y ?? null,
                width: finalData.width ?? null,
                height: finalData.height ?? null,
                rotation: finalData.rotation ?? null,
                scaleX: finalData.scaleX ?? null,
                scaleY: finalData.scaleY ?? null,
              },
              node: getImageResizeNodeSnapshot(node),
              resizeActive: Boolean(window._resizeData?.isResizing),
            });
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
          scheduleTransformerRestoreAfterSettle("transform-end-single", {
            textPreviewEndSnapshot,
            forceAttach: true,
          });
          logCanvasBoxFlow("selection", "transform:end", buildTransformBoxFlowPayload(
            node,
            finalData,
            {
              isFinal: true,
            }
          ), {
            identity: buildSelectionBoxFlowSessionIdentity(buildAttachedNodeIdsDigest(nodes)),
            flushSummaryKeys: ["transform-preview"],
            flushReason: "transform-end-single",
          });


        } catch (error) {
          console.warn("Error en onTransformEnd:", error);
          logCanvasBoxFlow("selection", "transform:error", {
            source: "selection-transformer",
            mode: transformGestureRef.current?.isRotate ? "rotate" : "transform",
            activeAnchor: transformGestureRef.current?.activeAnchor ?? null,
            selectedIds: selectionKey || null,
            message: error?.message || String(error),
          }, {
            identity: buildSelectionBoxFlowSessionIdentity(),
            flushSummaryKeys: ["transform-preview"],
            flushReason: "transform-error",
          });
          if (transformGestureRef.current?.isRotate) {
            logSelectedDragDebug("transform:rotate:error", {
              interactionId: rotationLifecycleDebugRef.current?.interactionId || null,
              previewCount: rotationLifecycleDebugRef.current?.previewCount || 0,
              selectedIds: selectedElements,
              selectedCount: selectedElements.length,
              primerElementoId: primerElemento?.id || null,
              primerElementoTipo: primerElemento?.tipo || null,
              isImageRotateGesture: Boolean(esImagenSeleccionada),
              activeAnchor: transformGestureRef.current?.activeAnchor ?? null,
              message: error?.message || String(error),
              selection: getCanvasSelectionDebugInfo(),
            });
          }
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
          if (esImagenSeleccionada) {
            clearImageResizeSessionActive(node);
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
          resetTransformerGestureUiState({
            syncOverlay: true,
            clearRotatePreviewState: true,
          });
          notifyTransformInteractionEnd();
          resetRotationLifecycleDebug();
        }
      }}

      />
    </>
  );
}




