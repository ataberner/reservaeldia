import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Stage, Line, Rect, Text, Group, Circle } from "react-konva";
import CanvasElementsLayer from "@/components/canvas/CanvasElementsLayer";
import FondoSeccion from "@/components/editor/FondoSeccion";
import GaleriaKonva from "@/components/editor/GaleriaKonva";
import CountdownKonva from "@/components/editor/countdown/CountdownKonva";
import ElementoCanvas from "@/components/ElementoCanvas";
import SectionDecorationEditorOverlay from "@/components/editor/SectionDecorationEditorOverlay";
import SelectionBounds from "@/components/SelectionBounds";
import SelectionBoundsIndicator, {
  resolveSelectionBounds,
} from "@/components/editor/textSystem/render/konva/SelectionBoundsIndicator";
import ImageCropOverlay from "@/components/editor/textSystem/render/konva/ImageCropOverlay";
import InlineTextEditDecorationsLayer from "@/components/editor/textSystem/render/konva/InlineTextEditDecorationsLayer";
import HoverIndicator from "@/components/HoverIndicator";
import LineControls from "@/components/LineControls";
import CanvasGuideLayer from "@/components/editor/canvasEditor/CanvasGuideLayer";
import { calcularOffsetY } from "@/utils/layout";
import { resolveKonvaFill } from "@/domain/colors/presets";
import {
  getCurrentInlineEditingId,
  getWindowObjectResolver,
  setCurrentInlineEditingId,
} from "@/components/editor/textSystem/bridges/window/inlineWindowBridge";
import {
  resolveInlineKonvaTextNode,
} from "@/components/editor/overlays/inlineGeometry";
import {
  emitInlineFocusRcaEvent,
} from "@/components/editor/textSystem/debug/inlineFocusOperationalDebug";
import {
  buildCanvasDragPerfDiff,
  trackCanvasDragPerf,
} from "@/components/editor/canvasEditor/canvasDragPerf";
import {
  buildCanvasBoxFlowBoundsDigest,
  buildCanvasBoxFlowIdsDigest,
  endCanvasBoxFlowSession,
  ensureCanvasBoxFlowSession,
  flushCanvasBoxFlowSummary,
  isCanvasBoxFlowDebugEnabled,
  logCanvasBoxFlow,
  recordCanvasBoxFlowSummary,
} from "@/components/editor/canvasEditor/canvasBoxFlowDebug";
import {
  buildImageCropObjectState,
} from "@/components/editor/textSystem/render/konva/imageCropStatePatch";
import {
  resolveActiveInlineSessionId,
} from "@/components/editor/canvasEditor/inlineCriticalBoundary";
import {
  getCountdownRepeatDragActiveState,
  isCountdownRepeatDragDebugEnabled,
  publishCountdownRepeatDragDebugEntry,
} from "@/components/editor/canvasEditor/countdownRepeatDragDebug";
import {
  getCanvasPointerDebugInfo,
  getKonvaNodeDebugInfo,
  logSelectedDragDebug,
} from "@/components/editor/canvasEditor/selectedDragDebug";
import { resolveCanonicalNodePose } from "@/components/editor/canvasEditor/konvaCanonicalPose";
import {
  finishImageRotationDebugSession,
  noteImageRotationOptionButtonSkip,
  noteImageRotationReactPreviewSkipped,
  trackImageRotationCommit,
  trackImageRotationDebug,
} from "@/components/editor/canvasEditor/imageRotationDebug";
import {
  getImageResizeNodeSnapshot,
  trackImageResizeDebug,
} from "@/components/editor/canvasEditor/imageResizeDebug";
import { isPostDragSelectionGuardActive } from "@/components/editor/canvasEditor/postDragSelectionGuard";
import {
  readClientPointFromCanvasEvent,
} from "@/components/editor/textSystem/services/textCanvasPointerService";
import {
  INLINE_ENTRY_SELECTION_MODE_SELECT_ALL,
} from "@/components/editor/textSystem/runtime/inlineEntrySelectionMode";
import {
  buildSelectionFramePolygon,
  getSelectionFramePadding,
} from "@/components/editor/textSystem/render/konva/selectionFrameVisuals";
import {
  resolveStageSelectionVisualMode,
  resolvePredragOverlayStartupPolicy,
} from "./selectionVisualModes.js";
import {
  createDragOverlayDriftPairingState,
  finalizeDragOverlayDriftPairingState,
  matchDragOverlayDriftOverlaySample,
  queuePendingDragOverlayDriftSample,
} from "./dragOverlayDriftPairing.js";
import {
  canReplayDragOverlayStartupSnapshot,
  createDragOverlayStartupGateState,
  getPendingDragOverlayStartupVisibleSnapshot,
  markDragOverlayStartupFrameVisible,
  noteDragOverlayStartupAuthoritativeDrag,
  resolveDragOverlayStartupApply,
} from "./dragOverlayStartupGate.js";
import { resolveDragOverlayShownEmission } from "./dragOverlayVisibilityLifecycle.js";
import {
  resolveStageHoverSuppression,
  shouldStageRenderHoverIndicator,
} from "./hoverLifecycle.js";
import {
  getFunctionalCtaDefaultText,
  isFunctionalCtaButton,
} from "@/domain/functionalCtaButtons";
import { updateBackgroundDecorationTransform } from "@/domain/sections/backgrounds";
import { shouldPreserveTextCenterPosition } from "@/lib/textCenteringPolicy";

const INLINE_INTENT_STALE_MS = 1500;

function toFiniteMetric(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundRotationMetric(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function sanitizeSelectionIds(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((id) => id !== null && typeof id !== "undefined" && id !== "");
}

function areSelectionIdListsEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}

function getImageRotationNodeSnapshot(node) {
  if (!node) {
    return {
      nodePresentAfterCommit: false,
    };
  }

  const layer = node?.getLayer?.() || null;
  const canvasHandle =
    layer && typeof layer.getCanvas === "function" ? layer.getCanvas() : null;
  const canvas = canvasHandle?._canvas || null;
  const scaleX = typeof node?.scaleX === "function" ? node.scaleX() || 1 : 1;
  const scaleY = typeof node?.scaleY === "function" ? node.scaleY() || 1 : 1;

  return {
    nodePresentAfterCommit: true,
    committedNodeX:
      typeof node?.x === "function" ? roundRotationMetric(node.x()) : null,
    committedNodeY:
      typeof node?.y === "function" ? roundRotationMetric(node.y()) : null,
    committedNodeRotation:
      typeof node?.rotation === "function"
        ? roundRotationMetric(node.rotation() || 0)
        : null,
    committedNodeScaleX: roundRotationMetric(scaleX, 3),
    committedNodeScaleY: roundRotationMetric(scaleY, 3),
    committedNodeWidth:
      typeof node?.width === "function"
        ? roundRotationMetric(node.width() * Math.abs(scaleX || 1), 3)
        : null,
    committedNodeHeight:
      typeof node?.height === "function"
        ? roundRotationMetric(node.height() * Math.abs(scaleY || 1), 3)
        : null,
    committedNodeCached:
      typeof node?.isCached === "function" ? node.isCached() : null,
    committedLayerChildren:
      typeof layer?.getChildren === "function" ? layer.getChildren().length : null,
    committedLayerCanvasWidth: Number(canvas?.width || 0) || null,
    committedLayerCanvasHeight: Number(canvas?.height || 0) || null,
  };
}

function withDefinedMetrics(source = {}) {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => typeof value !== "undefined")
  );
}

function clampNormalizedPosition(value) {
  return Math.max(0, Math.min(1, value));
}

function canonicalizeFinalizedDragPatch({
  objOriginal,
  dragPatch,
  seccionesOrdenadas,
  determinarNuevaSeccion,
  convertirAbsARel,
  esSeccionPantallaById,
  ALTURA_PANTALLA_EDITOR,
}) {
  const { nuevaSeccion, coordenadasAjustadas } = determinarNuevaSeccion(
    dragPatch.y,
    objOriginal.seccionId,
    seccionesOrdenadas
  );

  let nextPatch = { ...dragPatch };
  delete nextPatch.finalizoDrag;

  if (nuevaSeccion) {
    nextPatch = {
      ...nextPatch,
      ...coordenadasAjustadas,
      seccionId: nuevaSeccion,
    };
  } else {
    nextPatch.y = convertirAbsARel(
      dragPatch.y,
      objOriginal.seccionId,
      seccionesOrdenadas
    );
  }

  const seccionFinalId = nextPatch.seccionId || objOriginal.seccionId;
  const yRelPx = Number.isFinite(nextPatch.y) ? nextPatch.y : 0;

  if (esSeccionPantallaById(seccionFinalId)) {
    const safePantallaHeight =
      Number.isFinite(ALTURA_PANTALLA_EDITOR) && ALTURA_PANTALLA_EDITOR > 0
        ? ALTURA_PANTALLA_EDITOR
        : 1;
    nextPatch.yNorm = clampNormalizedPosition(yRelPx / safePantallaHeight);
    delete nextPatch.y;
  } else {
    nextPatch.y = yRelPx;
    delete nextPatch.yNorm;
  }

  return nextPatch;
}

function createEmptyDragSettleSession() {
  return {
    dragId: null,
    tipo: null,
    startedSelected: false,
    selectionSnapshot: [],
    overlaySelectionSnapshot: [],
    needsDeferredCommit: false,
    hadVisualSelection: false,
    needsGuideCleanup: false,
    interactionEpoch: 0,
  };
}

function createEmptyDragOverlayBoxFlowSession() {
  return {
    sessionKey: null,
    dragId: null,
    selectedIds: [],
    selectedIdsDigest: "",
    interactionEpoch: 0,
    phase: null,
    skipInitialSeed: false,
  };
}

const DRAG_OVERLAY_DRIFT_SUMMARY_KEY = "drag-overlay:drift";
const DRAG_OVERLAY_STARTUP_SUMMARY_KEY = "drag-overlay:startup";
const DRAG_OVERLAY_DRIFT_THROTTLE_MS = 120;
const DRAG_OVERLAY_DRIFT_STABLE_EPSILON_PX = 1;
const DRAG_OVERLAY_SEED_SOURCES = new Set([
  "predrag-seed",
  "drag-selection-seed",
  "controlled-seed",
]);

function createEmptyDragOverlayControlledBoundsState() {
  return {
    sessionKey: null,
    selectedIds: [],
    bounds: null,
    source: null,
    dragId: null,
    phase: null,
    syncToken: null,
    startupVisibleEligible: false,
    startupEligibilityReason: null,
  };
}

function createEmptyDragOverlayStartupState(sessionKey = null) {
  return {
    sessionKey: sessionKey || null,
    sampleSequence: 0,
    firstVisibleBox: null,
    firstLiveDrag: null,
    summaryEmitted: false,
  };
}

function areCanvasBoxFlowBoundsDigestsEqual(left, right) {
  if (!left || !right) return left === right;
  return (
    left.kind === right.kind &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function roundDragOverlayDriftMetric(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 1000) / 1000;
}

function formatDragOverlayStartupJump(boxBounds, dragBounds) {
  if (!boxBounds || !dragBounds) return null;

  const dx = roundDragOverlayDriftMetric(
    Number(boxBounds.x || 0) - Number(dragBounds.x || 0)
  );
  const dy = roundDragOverlayDriftMetric(
    Number(boxBounds.y || 0) - Number(dragBounds.y || 0)
  );
  const distance = roundDragOverlayDriftMetric(
    Math.sqrt((Number(dx || 0) ** 2) + (Number(dy || 0) ** 2))
  );

  if (dx === null && dy === null && distance === null) {
    return null;
  }

  const parts = [];
  if (dx !== null) parts.push(`dx=${dx}`);
  if (dy !== null) parts.push(`dy=${dy}`);
  if (distance !== null) parts.push(`dist=${distance}`);
  return parts.join(" ");
}

function classifyDragOverlayDriftState(previousDrift, nextDrift) {
  const distance = Number(nextDrift?.distance || 0);
  if (distance <= DRAG_OVERLAY_DRIFT_STABLE_EPSILON_PX) {
    return "aligned";
  }
  if (!previousDrift) {
    return "new";
  }

  const driftDeltaX = Math.abs(
    Number(nextDrift?.dx || 0) - Number(previousDrift?.dx || 0)
  );
  const driftDeltaY = Math.abs(
    Number(nextDrift?.dy || 0) - Number(previousDrift?.dy || 0)
  );
  const distanceDelta =
    Number(nextDrift?.distance || 0) - Number(previousDrift?.distance || 0);

  if (
    driftDeltaX <= DRAG_OVERLAY_DRIFT_STABLE_EPSILON_PX &&
    driftDeltaY <= DRAG_OVERLAY_DRIFT_STABLE_EPSILON_PX
  ) {
    return "stable";
  }
  if (
    distanceDelta <= -DRAG_OVERLAY_DRIFT_STABLE_EPSILON_PX
  ) {
    return "catching-up";
  }
  if (
    distanceDelta >= DRAG_OVERLAY_DRIFT_STABLE_EPSILON_PX
  ) {
    return "growing";
  }
  return "changing";
}

function areDragOverlayBoxFlowSessionsEqual(left, right) {
  return (
    left?.sessionKey === right?.sessionKey &&
    left?.dragId === right?.dragId &&
    areSelectionIdListsEqual(left?.selectedIds, right?.selectedIds) &&
    left?.selectedIdsDigest === right?.selectedIdsDigest &&
    Number(left?.interactionEpoch || 0) === Number(right?.interactionEpoch || 0) &&
    left?.phase === right?.phase &&
    Boolean(left?.skipInitialSeed) === Boolean(right?.skipInitialSeed)
  );
}

function buildDragOverlayBoxFlowSessionKey(sequence, dragId, selectedIdsDigest) {
  return [
    "drag-overlay",
    Number(sequence || 0) || 0,
    dragId || "selection",
    selectedIdsDigest || "none",
  ].join(":");
}

function resolveDragVisualSelectionIds(dragId, selectionIds) {
  const safeDragId = String(dragId ?? "").trim();
  const currentSelection = sanitizeSelectionIds(selectionIds);
  if (!safeDragId) {
    return currentSelection;
  }
  if (currentSelection.length === 0) {
    return [safeDragId];
  }
  if (currentSelection.includes(safeDragId)) {
    return currentSelection;
  }
  return [safeDragId];
}

function buildScaledCountdownResizeAttrs(source, nextWidth, nextHeight) {
  const originalWidth = Math.max(1, toFiniteMetric(source?.width, 1));
  const originalHeight = Math.max(1, toFiniteMetric(source?.height, 1));
  const safeNextWidth = Math.max(1, toFiniteMetric(nextWidth, originalWidth));
  const safeNextHeight = Math.max(1, toFiniteMetric(nextHeight, originalHeight));
  const scaleX = safeNextWidth / originalWidth;
  const scaleY = safeNextHeight / originalHeight;
  const safeScaleX = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1;
  const safeScaleY = Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1;
  const uniformScale = safeScaleX || safeScaleY || 1;

  const scaleMetric = (value, { min = null } = {}) => {
    const numeric = toFiniteMetric(value, null);
    if (!Number.isFinite(numeric)) return undefined;
    let scaled = numeric * uniformScale;
    if (Number.isFinite(min)) scaled = Math.max(min, scaled);
    return scaled;
  };

  return withDefinedMetrics({
    width: safeNextWidth,
    height: safeNextHeight,
    scaleX: 1,
    scaleY: 1,
    tamanoBase: scaleMetric(source?.tamanoBase, { min: 40 }),
    chipWidth: scaleMetric(source?.chipWidth, { min: 10 }),
    fontSize: scaleMetric(source?.fontSize, { min: 6 }),
    labelSize: scaleMetric(source?.labelSize, { min: 6 }),
    gap: scaleMetric(source?.gap, { min: 0 }),
    framePadding: scaleMetric(source?.framePadding, { min: 0 }),
    paddingX: scaleMetric(source?.paddingX, { min: 2 }),
    paddingY: scaleMetric(source?.paddingY, { min: 2 }),
    boxRadius: scaleMetric(source?.boxRadius, { min: 0 }),
    letterSpacing: scaleMetric(source?.letterSpacing),
  });
}

function buildFinalMultiTransformPatch({
  objOriginal,
  batchPatch,
  convertirAbsARel,
  seccionesOrdenadas,
  esSeccionPantallaById,
  ALTURA_PANTALLA_EDITOR,
  normalizarMedidasGaleria,
}) {
  if (!objOriginal || !batchPatch) return null;

  const safeX = toFiniteMetric(batchPatch.x, toFiniteMetric(objOriginal.x, 0));
  const safeRotation = toFiniteMetric(
    batchPatch.rotation,
    toFiniteMetric(objOriginal.rotation, 0)
  );
  const safeYAbs = toFiniteMetric(batchPatch.y, null);
  const safeYRel = Number.isFinite(safeYAbs)
    ? convertirAbsARel(safeYAbs, objOriginal.seccionId, seccionesOrdenadas)
    : toFiniteMetric(objOriginal.y, 0);

  let finalPatch = withDefinedMetrics({
    x: safeX,
    y: safeYRel,
    rotation: safeRotation,
  });

  if (objOriginal.tipo === "texto") {
    finalPatch = {
      ...finalPatch,
      fontSize: Math.max(
        6,
        toFiniteMetric(batchPatch.fontSize, toFiniteMetric(objOriginal.fontSize, 24))
      ),
      scaleX: 1,
      scaleY: 1,
    };
  } else if (objOriginal.tipo === "countdown") {
    finalPatch = {
      ...finalPatch,
      ...buildScaledCountdownResizeAttrs(
        objOriginal,
        batchPatch.width,
        batchPatch.height
      ),
    };
  } else if (objOriginal.tipo === "forma" && objOriginal.figura === "circle") {
    finalPatch = {
      ...finalPatch,
      radius: Math.max(
        1,
        toFiniteMetric(batchPatch.radius, toFiniteMetric(objOriginal.radius, 50))
      ),
      scaleX: 1,
      scaleY: 1,
    };
  } else if (objOriginal.tipo === "forma" && objOriginal.figura === "triangle") {
    finalPatch = {
      ...finalPatch,
      radius: Math.max(
        1,
        toFiniteMetric(batchPatch.radius, toFiniteMetric(objOriginal.radius, 60))
      ),
      scaleX: 1,
      scaleY: 1,
    };
  } else if (objOriginal.tipo === "galeria") {
    const galleryMetrics = normalizarMedidasGaleria(
      objOriginal,
      batchPatch.width,
      safeX
    );
    finalPatch = {
      ...finalPatch,
      x: galleryMetrics.x,
      width: galleryMetrics.width,
      height: galleryMetrics.height,
      widthPct: galleryMetrics.widthPct,
      ...(galleryMetrics.galleryLayoutBlueprint
        ? {
            galleryLayoutBlueprint: galleryMetrics.galleryLayoutBlueprint,
          }
        : {}),
      rotation: toFiniteMetric(objOriginal.rotation, 0),
      scaleX: 1,
      scaleY: 1,
    };
  } else {
    const nextWidth = toFiniteMetric(batchPatch.width, null);
    const nextHeight = toFiniteMetric(batchPatch.height, null);
    const nextRadius = toFiniteMetric(batchPatch.radius, null);

    finalPatch = {
      ...finalPatch,
      ...(Number.isFinite(nextWidth) ? { width: Math.abs(nextWidth) } : {}),
      ...(Number.isFinite(nextHeight) ? { height: Math.abs(nextHeight) } : {}),
      ...(Number.isFinite(nextRadius)
        ? { radius: Math.max(1, nextRadius) }
        : {}),
      scaleX: 1,
      scaleY: 1,
    };
  }

  const finalSectionUsesYNorm = esSeccionPantallaById(objOriginal.seccionId);
  const finalYRel = toFiniteMetric(finalPatch.y, toFiniteMetric(objOriginal.y, null));
  const safePantallaHeight =
    Number.isFinite(Number(ALTURA_PANTALLA_EDITOR)) && Number(ALTURA_PANTALLA_EDITOR) > 0
      ? Number(ALTURA_PANTALLA_EDITOR)
      : 1;

  if (Number.isFinite(finalYRel)) {
    finalPatch.y = finalYRel;
  }

  if (finalSectionUsesYNorm && Number.isFinite(finalYRel)) {
    finalPatch.yNorm = clampNormalizedPosition(finalYRel / safePantallaHeight);
  } else if (!finalSectionUsesYNorm) {
    delete finalPatch.yNorm;
  }

  return finalPatch;
}

function isInlineIntentDebugEnabled() {
  if (typeof window === "undefined") return false;
  return window.__DBG_INLINE_INTENT === true;
}

function isInlineDiagCompactEnabled() {
  if (typeof window === "undefined") return true;
  const raw = window.__INLINE_DIAG_COMPACT;
  if (raw === true || raw === 1 || raw === "1") return true;
  if (raw === false || raw === 0 || raw === "0") return false;
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return true;
}

function isRectInlineEditableObject(obj) {
  return (
    obj?.tipo === "forma" &&
    obj?.figura === "rect" &&
    typeof obj?.texto === "string"
  );
}

function isSemanticInlineEditableObject(obj) {
  return (
    obj?.tipo === "texto" ||
    isRectInlineEditableObject(obj) ||
    isFunctionalCtaButton(obj)
  );
}

function isLegacyDoubleInlineEditableObject(obj) {
  return false;
}

function getRuntimeInteractionState() {
  if (typeof window === "undefined") {
    return {
      dragging: false,
      resizing: false,
    };
  }

  return {
    dragging: Boolean(window._isDragging),
    resizing: Boolean(window._resizeData?.isResizing),
  };
}

function resolveInlineEditOutlineRect(editingId, elementRefs, stage, isMobile = false) {
  if (!editingId || !elementRefs?.current || !stage) return null;
  const sourceNode = elementRefs.current[editingId] || null;
  const textNode = resolveInlineKonvaTextNode(sourceNode, stage) || sourceNode;
  if (!textNode || typeof textNode.getClientRect !== "function") return null;
  try {
    const rect = textNode.getClientRect({
      relativeTo: stage,
      skipTransform: false,
      skipShadow: true,
      skipStroke: true,
    });
    if (!rect) return null;
    const padding = getSelectionFramePadding(isMobile);
    return {
      x: Number(rect.x) - padding,
      y: Number(rect.y) - padding,
      width: Number(rect.width) + padding * 2,
      height: Number(rect.height) + padding * 2,
    };
  } catch {
    return null;
  }
}

function resolveInlineEditOutlinePoints(editingId, elementRefs, stage, isMobile = false) {
  if (!editingId || !elementRefs?.current || !stage) return null;
  const sourceNode = elementRefs.current[editingId] || null;
  const textNode = resolveInlineKonvaTextNode(sourceNode, stage) || sourceNode;
  if (!textNode) return null;
  return buildSelectionFramePolygon(textNode, getSelectionFramePadding(isMobile));
}

export default function CanvasStageContent({
  stageRef,
  altoCanvasDinamico,
  stageGestures,
  seccionesOrdenadas,
  altoCanvas,
  seccionActivaId,
  seccionesAnimando,
  onSelectSeccion,
  actualizarOffsetFondo,
  isMobile,
  backgroundEditSectionId,
  onRequestBackgroundEdit,
  handleBackgroundImageStatusChange,
  controlandoAltura,
  normalizarAltoModo,
  iniciarControlAltura,
  supportsPointerEvents,
  setGlobalCursor,
  clearGlobalCursor,
  objetos,
  editing,
  elementosSeleccionados,
  elementosPreSeleccionados,
  setElementosPreSeleccionados,
  seleccionActiva,
  areaSeleccion,
  setHoverId,
  registerRef,
  celdaGaleriaActiva,
  setCeldaGaleriaActiva,
  prepararGuias,
  mostrarGuias,
  elementRefs,
  actualizarPosicionBotonOpciones,
  limpiarGuias,
  dragStartPos,
  hasDragged,
  setObjetos,
  determinarNuevaSeccion,
  convertirAbsARel,
  esSeccionPantallaById,
  ALTURA_PANTALLA_EDITOR,
  inlineEditPreviewRef,
  calcularXTextoCentrado,
  ensureInlineFontReady,
  pendingInlineStartRef,
  inlineDebugLog,
  obtenerMetricasNodoInline,
  obtenerCentroVisualTextoX,
  setInlineOverlayMountedId,
  setInlineOverlayMountSession,
  setInlineSwapAck,
  captureInlineSnapshot,
  startEdit,
  inlineOverlayMountedId,
  inlineOverlayMountSession,
  inlineDebugAB,
  finishEdit,
  restoreElementDrag,
  requestInlineEditFinish,
  onInlineEditCanvasPointer,
  inlineEditDecorations,
  configurarDragEnd,
  ajustarFontSizeAAnchoVisual,
  calcularPosTextoDesdeCentro,
  textResizeDebug,
  isTextResizeDebugEnabled,
  actualizarObjeto,
  hoverId,
  isDragging,
  setIsDragging = () => {},
  actualizarLinea,
  guiaLineas = [],
  guideOverlayRef,
  handleTransformInteractionStart,
  handleTransformInteractionEnd,
  canvasInteractionCoordinator = null,
  normalizarMedidasGaleria,
  setElementosSeleccionados,
  setSecciones,
  selectionRuntime,
  sectionDecorationEdit,
  setSectionDecorationEdit,
  onRegisterBackgroundEditNode,
  onBackgroundEditInteractionChange,
}) {
  const inlineIntentRef = useRef({ candidateId: null, armedAtMs: 0 });
  const inlineActivationRef = useRef({
    openingId: null,
    openingAtMs: 0,
  });
  const canvasStageRenderCountRef = useRef(0);
  const canvasStageRenderSnapshotRef = useRef(null);
  const canvasStageObjectsRef = useRef(null);
  const canvasStageObjectsVersionRef = useRef(0);
  const countdownDragDebugSnapshotRef = useRef(null);
  const dragLayerRef = useRef(null);
  const dragOverlayIndicatorRef = useRef(null);
  const dragSettleSessionRef = useRef(createEmptyDragSettleSession());
  const dragOverlayBoxFlowSessionCounterRef = useRef(0);
  const dragOverlaySyncTokenCounterRef = useRef(0);
  const dragOverlayBoxFlowSessionRef = useRef(createEmptyDragOverlayBoxFlowSession());
  const dragOverlayControlledBoundsRef = useRef(
    createEmptyDragOverlayControlledBoundsState()
  );
  const dragOverlayDriftStateRef = useRef(createDragOverlayDriftPairingState());
  const dragOverlayStartupGateRef = useRef(createDragOverlayStartupGateState());
  const dragOverlayStartupStateRef = useRef(createEmptyDragOverlayStartupState());
  const dragOverlayShownSessionKeyRef = useRef(null);
  const boxFlowSelectionSnapshotRef = useRef(null);
  const boxFlowHoverSnapshotRef = useRef(null);
  const hoverBoxFlowMetaRef = useRef(null);
  const activeTransformInteractionRef = useRef({
    isRotate: false,
    activeAnchor: null,
    pointerType: null,
  });
  const canvasInteractionApi = canvasInteractionCoordinator || {};
  const canvasInteractionEpoch = Number(canvasInteractionApi.interactionEpoch || 0);
  const canvasInteractionActive =
    canvasInteractionApi.isInteractionActive === true;
  const canvasInteractionSettling = canvasInteractionApi.isSettling === true;
  const beginCanvasInteraction =
    typeof canvasInteractionApi.beginCanvasInteraction === "function"
      ? canvasInteractionApi.beginCanvasInteraction
      : () => 0;
  const endCanvasInteraction =
    typeof canvasInteractionApi.endCanvasInteraction === "function"
      ? canvasInteractionApi.endCanvasInteraction
      : () => 0;
  const scheduleCanvasUiAfterSettle =
    typeof canvasInteractionApi.scheduleCanvasUiAfterSettle === "function"
      ? canvasInteractionApi.scheduleCanvasUiAfterSettle
      : null;
  const [isImageRotateInteractionActive, setIsImageRotateInteractionActive] = useState(false);
  const dragGuideObjectsRef = useRef(objetos);
  const guideDragFrameRef = useRef({ rafId: 0, payload: null });
  const hoverIndicatorRef = useRef(null);
  const [isImageCropInteracting, setIsImageCropInteracting] = useState(false);
  const [dragVisualSelectionIds, setDragVisualSelectionIds] = useState([]);
  const dragVisualSelectionIdsRef = useRef([]);
  const [isPredragVisualSelectionActive, setIsPredragVisualSelectionActive] = useState(false);
  const [isDragSelectionOverlayVisualReady, setIsDragSelectionOverlayVisualReady] = useState(false);
  const [dragOverlayBoxFlowSession, setDragOverlayBoxFlowSession] = useState(
    createEmptyDragOverlayBoxFlowSession()
  );
  const readSelectionRuntimeSnapshot = useCallback(() => {
    if (typeof selectionRuntime?.readSnapshot === "function") {
      return selectionRuntime.readSnapshot();
    }

    return {
      selectedIds: sanitizeSelectionIds(elementosSeleccionados),
      preselectedIds: sanitizeSelectionIds(elementosPreSeleccionados),
      galleryCell: celdaGaleriaActiva || null,
      marquee: {
        active: Boolean(seleccionActiva),
        start: null,
        area: areaSeleccion || null,
      },
      pendingDragSelection: {
        id:
          typeof window !== "undefined" ? window._pendingDragSelectionId || null : null,
        phase:
          typeof window !== "undefined"
            ? window._pendingDragSelectionPhase || null
            : null,
      },
      dragVisualSelection: {
        ids:
          sanitizeSelectionIds(dragOverlayBoxFlowSessionRef.current?.selectedIds).length > 0
            ? sanitizeSelectionIds(dragOverlayBoxFlowSessionRef.current?.selectedIds)
            : sanitizeSelectionIds(dragVisualSelectionIdsRef.current),
        predragActive: Boolean(isPredragVisualSelectionActive),
        sessionKey: dragOverlayBoxFlowSessionRef.current?.sessionKey || null,
        dragId: dragOverlayBoxFlowSessionRef.current?.dragId || null,
      },
    };
  }, [
    areaSeleccion,
    celdaGaleriaActiva,
    elementosPreSeleccionados,
    elementosSeleccionados,
    isPredragVisualSelectionActive,
    seleccionActiva,
    selectionRuntime,
  ]);
  const setCommittedSelectionRuntime = useCallback((ids, options = {}) => {
    if (typeof selectionRuntime?.setCommittedSelection === "function") {
      return selectionRuntime.setCommittedSelection(ids, options);
    }

    const nextSelection = sanitizeSelectionIds(ids);
    setElementosSeleccionados((current) => (
      areSelectionIdListsEqual(current, nextSelection) ? current : nextSelection
    ));

    if (typeof window !== "undefined") {
      window._elementosSeleccionados = nextSelection;
    }

    return nextSelection;
  }, [selectionRuntime, setElementosSeleccionados]);
  const toggleCommittedSelectionRuntime = useCallback((id, options = {}) => {
    if (typeof selectionRuntime?.toggleCommittedSelection === "function") {
      return selectionRuntime.toggleCommittedSelection(id, options);
    }

    const safeId = String(id || "").trim();
    if (!safeId) return null;

    setElementosSeleccionados((current) => {
      const nextSelection = current.includes(safeId)
        ? current.filter((currentId) => currentId !== safeId)
        : [...current, safeId];

      if (typeof window !== "undefined") {
        window._elementosSeleccionados = nextSelection;
      }

      return nextSelection;
    });

    return null;
  }, [selectionRuntime, setElementosSeleccionados]);
  const setPendingDragSelectionRuntime = useCallback((value, options = {}) => {
    if (typeof selectionRuntime?.setPendingDragSelection === "function") {
      return selectionRuntime.setPendingDragSelection(value, options);
    }

    if (typeof window !== "undefined") {
      window._pendingDragSelectionId = value?.id || null;
      window._pendingDragSelectionPhase = value?.phase || null;
    }

    return null;
  }, [selectionRuntime]);
  const setDragVisualSelectionRuntime = useCallback((value, options = {}) => {
    if (typeof selectionRuntime?.setDragVisualSelection === "function") {
      return selectionRuntime.setDragVisualSelection(value, options);
    }

    return null;
  }, [selectionRuntime]);
  const clearSelectionStateRuntime = useCallback((options = {}) => {
    if (typeof selectionRuntime?.clearSelectionState === "function") {
      return selectionRuntime.clearSelectionState(options);
    }

    const clearCommittedSelection = options?.clearCommittedSelection !== false;
    const clearPreselection = options?.clearPreselection !== false;

    if (clearCommittedSelection) {
      setElementosSeleccionados([]);
    }
    if (clearPreselection) {
      setElementosPreSeleccionados([]);
    }
    return null;
  }, [
    selectionRuntime,
    setElementosPreSeleccionados,
    setElementosSeleccionados,
  ]);
  const activeInlineEditingId = resolveActiveInlineSessionId({
    editingId: editing.id,
    currentInlineEditingId: getCurrentInlineEditingId(),
    inlineOverlayMountedId,
    inlineOverlayMountSession,
  });
  const runtimeSelectionSnapshot = readSelectionRuntimeSnapshot();
  const runtimeSelectedIds = sanitizeSelectionIds(
    runtimeSelectionSnapshot?.selectedIds
  );
  const runtimePendingDragSelectionId =
    runtimeSelectionSnapshot?.pendingDragSelection?.id || null;
  const runtimePendingDragSelectionPhase =
    runtimeSelectionSnapshot?.pendingDragSelection?.phase || null;
  const readPendingDragSelectionSnapshot = useCallback(() => {
    const snapshot = readSelectionRuntimeSnapshot();
    return {
      id: snapshot?.pendingDragSelection?.id || null,
      phase: snapshot?.pendingDragSelection?.phase || null,
    };
  }, [readSelectionRuntimeSnapshot]);
  const readActiveDragOverlaySelectionIds = useCallback((dragId = null, fallbackIds = []) => {
    const activeSession = dragOverlayBoxFlowSessionRef.current;
    const sessionSelectedIds = sanitizeSelectionIds(activeSession?.selectedIds);
    const safeDragId = String(dragId ?? "").trim();

    if (!activeSession?.sessionKey || sessionSelectedIds.length === 0) {
      return resolveDragVisualSelectionIds(safeDragId, fallbackIds);
    }

    if (
      safeDragId &&
      activeSession.dragId &&
      activeSession.dragId !== safeDragId &&
      !sessionSelectedIds.includes(safeDragId)
    ) {
      return resolveDragVisualSelectionIds(safeDragId, fallbackIds);
    }

    return sessionSelectedIds;
  }, []);
  useEffect(() => {
    setDragVisualSelectionRuntime(
      {
        ids: readActiveDragOverlaySelectionIds(
          dragOverlayBoxFlowSessionRef.current?.dragId || null,
          dragVisualSelectionIds
        ),
        predragActive: isPredragVisualSelectionActive,
        sessionKey: dragOverlayBoxFlowSessionRef.current?.sessionKey || null,
        dragId: dragOverlayBoxFlowSessionRef.current?.dragId || null,
      },
      {
        source: "drag-visual-selection:sync",
      }
    );
  }, [
    dragVisualSelectionIds,
    readActiveDragOverlaySelectionIds,
    isPredragVisualSelectionActive,
    setDragVisualSelectionRuntime,
  ]);
  useEffect(() => {
    dragOverlayBoxFlowSessionRef.current = dragOverlayBoxFlowSession;
  }, [dragOverlayBoxFlowSession]);
  const resetDragOverlayStartupGate = useCallback((sessionKey = null) => {
    dragOverlayStartupGateRef.current = createDragOverlayStartupGateState(
      sessionKey || null
    );
    return dragOverlayStartupGateRef.current;
  }, []);
  const commitDragOverlayBoxFlowSession = useCallback((updater) => {
    const previousSession = dragOverlayBoxFlowSessionRef.current;
    const nextSessionCandidate =
      typeof updater === "function" ? updater(previousSession) : updater;
    const nextSession = nextSessionCandidate?.sessionKey
      ? nextSessionCandidate
      : createEmptyDragOverlayBoxFlowSession();

    if (areDragOverlayBoxFlowSessionsEqual(previousSession, nextSession)) {
      return previousSession;
    }

    dragOverlayBoxFlowSessionRef.current = nextSession;
    setDragOverlayBoxFlowSession((currentSession) => (
      areDragOverlayBoxFlowSessionsEqual(currentSession, nextSession)
        ? currentSession
        : nextSession
    ));
    return nextSession;
  }, []);
  const allocateDragOverlayBoxFlowSession = useCallback(({
    dragId = null,
    selectedIds = [],
    interactionEpoch = 0,
    phase = "predrag",
    skipInitialSeed = false,
  } = {}) => {
    const selectedIdsDigest = buildCanvasBoxFlowIdsDigest(
      sanitizeSelectionIds(selectedIds)
    );
    dragOverlayBoxFlowSessionCounterRef.current += 1;
    return {
      sessionKey: buildDragOverlayBoxFlowSessionKey(
        dragOverlayBoxFlowSessionCounterRef.current,
        dragId,
        selectedIdsDigest
      ),
      dragId: dragId || null,
      selectedIds: [...sanitizeSelectionIds(selectedIds)],
      selectedIdsDigest,
      interactionEpoch: Number(interactionEpoch || 0),
      phase,
      skipInitialSeed: Boolean(skipInitialSeed),
    };
  }, []);
  const beginDragOverlayBoxFlowSession = useCallback(({
    dragId = null,
    selectedIds = [],
    phase = "predrag",
    skipInitialSeed = false,
  } = {}) => {
    const nextSelectedIds = sanitizeSelectionIds(selectedIds);
    const nextSelectedIdsDigest = buildCanvasBoxFlowIdsDigest(nextSelectedIds);

    const nextSession = commitDragOverlayBoxFlowSession((currentSession) => {
      if (
        currentSession?.sessionKey &&
        currentSession.dragId === (dragId || null) &&
        currentSession.selectedIdsDigest === nextSelectedIdsDigest &&
        Number(currentSession.interactionEpoch || 0) === 0
      ) {
        return {
          ...currentSession,
          selectedIds: [...nextSelectedIds],
          phase,
          skipInitialSeed: Boolean(skipInitialSeed),
        };
      }

      return allocateDragOverlayBoxFlowSession({
        dragId,
        selectedIds: nextSelectedIds,
        interactionEpoch: 0,
        phase,
        skipInitialSeed,
      });
    });
    resetDragOverlayStartupGate(nextSession?.sessionKey || null);
    if (nextSession?.sessionKey) {
      ensureCanvasBoxFlowSession("selection", nextSession.sessionKey, {
        source: "stage-composer",
        selectedIds: nextSession.selectedIdsDigest,
        dragOverlaySessionKey: nextSession.sessionKey,
        dragOverlayPhase: nextSession.phase,
        dragOverlayInteractionEpoch: nextSession.interactionEpoch || null,
      });
    }
    return nextSession;
  }, [
    allocateDragOverlayBoxFlowSession,
    commitDragOverlayBoxFlowSession,
    resetDragOverlayStartupGate,
  ]);
  const activateDragOverlayBoxFlowSession = useCallback(({
    dragId = null,
    selectedIds = [],
    interactionEpoch = 0,
    phase = "drag",
  } = {}) => {
    const nextSelectedIds = sanitizeSelectionIds(selectedIds);
    const nextSelectedIdsDigest = buildCanvasBoxFlowIdsDigest(nextSelectedIds);
    const nextInteractionEpoch = Number(interactionEpoch || 0);

    const nextSession = commitDragOverlayBoxFlowSession((currentSession) => {
      if (
        currentSession?.sessionKey &&
        currentSession.dragId === (dragId || null) &&
        currentSession.selectedIdsDigest === nextSelectedIdsDigest &&
        (
          Number(currentSession.interactionEpoch || 0) === 0 ||
          Number(currentSession.interactionEpoch || 0) === nextInteractionEpoch
        )
      ) {
        return {
          ...currentSession,
          selectedIds: [...nextSelectedIds],
          interactionEpoch: nextInteractionEpoch,
          phase,
          skipInitialSeed: Boolean(currentSession.skipInitialSeed),
        };
      }

      return allocateDragOverlayBoxFlowSession({
        dragId,
        selectedIds: nextSelectedIds,
        interactionEpoch: nextInteractionEpoch,
        phase,
        skipInitialSeed: false,
      });
    });
    resetDragOverlayStartupGate(nextSession?.sessionKey || null);
    if (nextSession?.sessionKey) {
      ensureCanvasBoxFlowSession("selection", nextSession.sessionKey, {
        source: "stage-composer",
        selectedIds: nextSession.selectedIdsDigest,
        dragOverlaySessionKey: nextSession.sessionKey,
        dragOverlayPhase: nextSession.phase,
        dragOverlayInteractionEpoch: nextSession.interactionEpoch || null,
      });
    }
    return nextSession;
  }, [
    allocateDragOverlayBoxFlowSession,
    commitDragOverlayBoxFlowSession,
    resetDragOverlayStartupGate,
  ]);
  const updateDragOverlayBoxFlowSessionPhase = useCallback((phase, {
    dragId = null,
    interactionEpoch = 0,
  } = {}) => (
    commitDragOverlayBoxFlowSession((currentSession) => {
      if (!currentSession?.sessionKey) {
        return currentSession;
      }
      if (dragId && currentSession.dragId && currentSession.dragId !== dragId) {
        return currentSession;
      }
      if (
        Number(interactionEpoch || 0) > 0 &&
        Number(currentSession.interactionEpoch || 0) > 0 &&
        Number(currentSession.interactionEpoch || 0) !== Number(interactionEpoch || 0)
      ) {
        return currentSession;
      }
      return {
        ...currentSession,
        interactionEpoch:
          Number(interactionEpoch || 0) || Number(currentSession.interactionEpoch || 0) || 0,
        phase,
      };
    })
  ), [commitDragOverlayBoxFlowSession]);
  const clearDragOverlayBoxFlowSession = useCallback((matcher = null) => (
    commitDragOverlayBoxFlowSession((currentSession) => {
      if (!currentSession?.sessionKey) {
        return currentSession;
      }
      if (typeof matcher === "function" && matcher(currentSession) !== true) {
        return currentSession;
      }
      return createEmptyDragOverlayBoxFlowSession();
    })
  ), [commitDragOverlayBoxFlowSession]);
  const resetControlledDragOverlayBounds = useCallback((sessionKey = null) => {
    dragOverlayControlledBoundsRef.current = {
      ...createEmptyDragOverlayControlledBoundsState(),
      sessionKey: sessionKey || null,
    };
    return dragOverlayControlledBoundsRef.current;
  }, []);
  const resolveLiveDragSelectionBounds = useCallback((selectedIds = []) => {
    const safeSelectedIds = sanitizeSelectionIds(selectedIds);
    if (safeSelectedIds.length === 0) return null;

    return resolveSelectionBounds({
      selectedElements: safeSelectedIds,
      elementRefs,
      objetos,
      isMobile,
      requireLiveNodes: true,
    });
  }, [elementRefs, isMobile, objetos]);
  const syncControlledDragOverlayBounds = useCallback((selectedIds = [], {
    dragId = null,
    source = "controlled-sync",
    syncToken = null,
  } = {}) => {
    const activeSession = dragOverlayBoxFlowSessionRef.current;
    const safeSelectedIds = sanitizeSelectionIds(selectedIds);
    const existingSnapshot = dragOverlayControlledBoundsRef.current;
    if (!activeSession?.sessionKey || safeSelectedIds.length === 0) {
      return null;
    }
    const isSeedSource =
      source === "predrag-seed" ||
      source === "drag-selection-seed" ||
      source === "controlled-seed";
    const shouldSkipInitialSeed = Boolean(
      activeSession.skipInitialSeed === true &&
      isSeedSource &&
      (
        existingSnapshot?.sessionKey !== activeSession.sessionKey ||
        !existingSnapshot?.bounds
      )
    );
    if (shouldSkipInitialSeed) {
      return existingSnapshot?.sessionKey === activeSession.sessionKey
        ? existingSnapshot
        : null;
    }

    const nextBounds = resolveLiveDragSelectionBounds(safeSelectedIds);
    if (!nextBounds) {
      return existingSnapshot?.sessionKey === activeSession.sessionKey
        ? existingSnapshot
        : null;
    }

    const nextSnapshot = {
      sessionKey: activeSession.sessionKey,
      selectedIds: safeSelectedIds,
      bounds: nextBounds,
      source,
      dragId: dragId || activeSession.dragId || null,
      phase: activeSession.phase || null,
      syncToken: syncToken || null,
      startupVisibleEligible: false,
      startupEligibilityReason: null,
    };
    const startupDecision = resolveDragOverlayStartupApply(
      dragOverlayStartupGateRef.current,
      activeSession.sessionKey,
      nextSnapshot
    );
    dragOverlayStartupGateRef.current = startupDecision.nextState;
    nextSnapshot.startupVisibleEligible = Boolean(
      startupDecision.startupVisibleEligible
    );
    nextSnapshot.startupEligibilityReason = startupDecision.reason || null;
    dragOverlayControlledBoundsRef.current = nextSnapshot;

    if (startupDecision.shouldApply) {
      const appliedSnapshot = dragOverlayIndicatorRef.current?.applyControlledBounds?.(nextBounds, {
        source,
        debugSource: "drag-overlay",
        selectedIds: safeSelectedIds,
        identity: activeSession.sessionKey,
        lifecycleKey: activeSession.sessionKey,
        dragId: nextSnapshot.dragId,
        phase: nextSnapshot.phase,
        syncToken: nextSnapshot.syncToken,
      });
      if (appliedSnapshot && nextSnapshot.startupVisibleEligible) {
        dragOverlayStartupGateRef.current = markDragOverlayStartupFrameVisible(
          dragOverlayStartupGateRef.current,
          activeSession.sessionKey,
          nextSnapshot
        );
      }
    }

    return nextSnapshot;
  }, [
    markDragOverlayStartupFrameVisible,
    resolveLiveDragSelectionBounds,
  ]);
  const clearControlledDragOverlayBounds = useCallback((reason = "overlay-hidden") => {
    const currentSnapshot = dragOverlayControlledBoundsRef.current;
    if (currentSnapshot?.sessionKey) {
      dragOverlayIndicatorRef.current?.clearControlledBounds?.({
        source: "stage-composer",
        debugSource: "drag-overlay",
        identity: currentSnapshot.sessionKey,
        reason,
      });
    }
    return resetControlledDragOverlayBounds(null);
  }, [resetControlledDragOverlayBounds]);
  const resetDragOverlayDriftState = useCallback((sessionKey = null) => {
    dragOverlayDriftStateRef.current = createDragOverlayDriftPairingState(
      sessionKey || null
    );
    return dragOverlayDriftStateRef.current;
  }, []);
  const resetDragOverlayStartupState = useCallback((sessionKey = null) => {
    dragOverlayStartupStateRef.current = createEmptyDragOverlayStartupState(
      sessionKey || null
    );
    return dragOverlayStartupStateRef.current;
  }, []);
  const ensureDragOverlayStartupState = useCallback((sessionKey = null) => {
    const currentState = dragOverlayStartupStateRef.current;
    if (!sessionKey) {
      if (currentState?.sessionKey) {
        return resetDragOverlayStartupState(null);
      }
      return currentState;
    }
    if (currentState?.sessionKey === sessionKey) {
      return currentState;
    }
    return resetDragOverlayStartupState(sessionKey);
  }, [resetDragOverlayStartupState]);
  const maybeEmitDragOverlayStartupSummary = useCallback((
    sessionKey = null,
    startupStateOverride = null
  ) => {
    if (!isCanvasBoxFlowDebugEnabled()) return null;

    const activeSession = dragOverlayBoxFlowSessionRef.current;
    const targetSessionKey =
      sessionKey ||
      startupStateOverride?.sessionKey ||
      activeSession?.sessionKey ||
      null;
    if (!targetSessionKey) return null;

    const startupState =
      startupStateOverride?.sessionKey === targetSessionKey
        ? startupStateOverride
        : ensureDragOverlayStartupState(targetSessionKey);

    if (
      !startupState?.sessionKey ||
      startupState.summaryEmitted === true ||
      !startupState.firstVisibleBox ||
      !startupState.firstLiveDrag
    ) {
      return null;
    }

    const firstVisibleBeforeLiveDrag =
      Number(startupState.firstVisibleBox.order || 0) <
      Number(startupState.firstLiveDrag.order || 0);
    const visibleSeedBeforeLiveDrag = Boolean(
      firstVisibleBeforeLiveDrag &&
      DRAG_OVERLAY_SEED_SOURCES.has(
        String(startupState.firstVisibleBox.source || "").trim()
      )
    );

    recordCanvasBoxFlowSummary(
      "selection",
      DRAG_OVERLAY_STARTUP_SUMMARY_KEY,
      {
        source: "startup-diagnostic",
        debugSource: "drag-overlay-startup",
        dragId:
          startupState.firstLiveDrag.dragId ||
          activeSession?.dragId ||
          null,
        selectedIds:
          startupState.firstLiveDrag.selectedIdsDigest ||
          startupState.firstVisibleBox.selectedIdsDigest ||
          activeSession?.selectedIdsDigest ||
          null,
        dragSource: startupState.firstLiveDrag.source || null,
        boxSource: startupState.firstVisibleBox.source || null,
        dragBounds: startupState.firstLiveDrag.bounds || null,
        overlayBounds: startupState.firstVisibleBox.bounds || null,
        firstVisibleBeforeLiveDrag,
        visibleSeedBeforeLiveDrag,
        startupJump: formatDragOverlayStartupJump(
          startupState.firstVisibleBox.bounds,
          startupState.firstLiveDrag.bounds
        ),
      },
      {
        identity: targetSessionKey,
        eventName: "startup:summary",
        throttleMs: 0,
      }
    );
    const flushedSummary = flushCanvasBoxFlowSummary(
      "selection",
      DRAG_OVERLAY_STARTUP_SUMMARY_KEY,
      { reason: "startup-captured" }
    );

    dragOverlayStartupStateRef.current = {
      ...startupState,
      summaryEmitted: true,
    };

    return flushedSummary;
  }, [ensureDragOverlayStartupState]);
  const ensureDragOverlayDriftState = useCallback((sessionKey = null) => {
    const currentState = dragOverlayDriftStateRef.current;
    if (!sessionKey) {
      if (currentState?.sessionKey) {
        return resetDragOverlayDriftState(null);
      }
      return currentState;
    }
    if (currentState?.sessionKey === sessionKey) {
      return currentState;
    }
    return resetDragOverlayDriftState(sessionKey);
  }, [resetDragOverlayDriftState]);
  const recordDragOverlayDriftComparison = useCallback((dragSample, overlaySample) => {
    if (!isCanvasBoxFlowDebugEnabled()) return null;
    const activeSession = dragOverlayBoxFlowSessionRef.current;
    if (!activeSession?.sessionKey) return null;
    if (!dragSample?.bounds || !overlaySample?.bounds) return null;

    const dragBounds = buildCanvasBoxFlowBoundsDigest(dragSample.bounds);
    const overlayBounds = buildCanvasBoxFlowBoundsDigest(overlaySample.bounds);
    if (!dragBounds || !overlayBounds) return null;

    const dx = roundDragOverlayDriftMetric(
      Number(overlayBounds.x || 0) - Number(dragBounds.x || 0)
    );
    const dy = roundDragOverlayDriftMetric(
      Number(overlayBounds.y || 0) - Number(dragBounds.y || 0)
    );
    const distance = roundDragOverlayDriftMetric(
      Math.sqrt(
        (Number(dx || 0) ** 2) +
        (Number(dy || 0) ** 2)
      )
    );
    const driftStateRef = dragOverlayDriftStateRef.current;
    const previousDrift = driftStateRef?.lastDrift || null;
    const driftPayload = {
      source: "controlled-sync-pair",
      debugSource: "drag-overlay-drift",
      boxMode: "drag-overlay",
      phase: activeSession.phase || null,
      dragId: dragSample.dragId || activeSession.dragId || null,
      selectedIds:
        activeSession.selectedIdsDigest ||
        dragSample.selectedIdsDigest ||
        overlaySample.selectedIdsDigest ||
        null,
      comparisonSide: "sync-paired",
      comparisonOrder: "drag-before-overlay-sync",
      syncToken: overlaySample.syncToken || dragSample.syncToken || null,
      dragSource: dragSample.source || null,
      overlaySource: overlaySample.source || null,
      dx,
      dy,
      distance,
      driftState: classifyDragOverlayDriftState(previousDrift, {
        dx,
        dy,
        distance,
      }),
      dragBounds,
      overlayBounds,
    };

    recordCanvasBoxFlowSummary(
      "selection",
      DRAG_OVERLAY_DRIFT_SUMMARY_KEY,
      driftPayload,
      {
        identity: activeSession.sessionKey,
        eventName: "drift:summary",
        throttleMs: DRAG_OVERLAY_DRIFT_THROTTLE_MS,
      }
    );

    dragOverlayDriftStateRef.current = {
      ...driftStateRef,
      sessionKey: activeSession.sessionKey,
      lastDrift: driftPayload,
    };
    return driftPayload;
  }, []);
  const noteDragOverlayDragSample = useCallback(({
    dragId = null,
    selectedIds = [],
    pos = null,
    source = "drag-move",
  } = {}) => {
    const activeSession = dragOverlayBoxFlowSessionRef.current;
    if (!activeSession?.sessionKey || activeSession.phase !== "drag") return null;

    const dragBounds = buildCanvasBoxFlowBoundsDigest(
      resolveLiveDragSelectionBounds(selectedIds)
    );
    if (!dragBounds) return null;

    dragOverlaySyncTokenCounterRef.current += 1;
    const syncToken = [
      activeSession.sessionKey,
      "sync",
      dragOverlaySyncTokenCounterRef.current,
    ].join(":");
    const dragSample = {
      syncToken,
      dragId: dragId || activeSession.dragId || null,
      selectedIdsDigest:
        buildCanvasBoxFlowIdsDigest(sanitizeSelectionIds(selectedIds)) ||
        activeSession.selectedIdsDigest ||
        null,
      source,
      pos: pos
        ? {
            x: roundDragOverlayDriftMetric(pos.x),
            y: roundDragOverlayDriftMetric(pos.y),
          }
        : null,
      bounds: dragBounds,
    };
    dragOverlayStartupGateRef.current = noteDragOverlayStartupAuthoritativeDrag(
      dragOverlayStartupGateRef.current,
      activeSession.sessionKey,
      dragSample
    );
    const startupState = ensureDragOverlayStartupState(activeSession.sessionKey);
    if (!startupState?.firstLiveDrag) {
      const nextOrder = Number(startupState?.sampleSequence || 0) + 1;
      const nextStartupState = {
        ...startupState,
        sampleSequence: nextOrder,
        firstLiveDrag: {
          order: nextOrder,
          dragId: dragSample.dragId,
          selectedIdsDigest: dragSample.selectedIdsDigest,
          source: dragSample.source,
          bounds: dragSample.bounds,
        },
      };
      dragOverlayStartupStateRef.current = nextStartupState;
      maybeEmitDragOverlayStartupSummary(
        activeSession.sessionKey,
        nextStartupState
      );
    }
    if (isCanvasBoxFlowDebugEnabled()) {
      const driftState = ensureDragOverlayDriftState(activeSession.sessionKey);
      const { nextState } = queuePendingDragOverlayDriftSample(
        driftState,
        activeSession.sessionKey,
        dragSample
      );

      dragOverlayDriftStateRef.current = nextState;
    }
    return {
      syncToken,
      dragSample,
    };
  }, [
    ensureDragOverlayStartupState,
    ensureDragOverlayDriftState,
    maybeEmitDragOverlayStartupSummary,
    queuePendingDragOverlayDriftSample,
    resolveLiveDragSelectionBounds,
  ]);
  const noteDragOverlayBoundsSample = useCallback((sample = null) => {
    if (!isCanvasBoxFlowDebugEnabled()) return null;
    const activeSession = dragOverlayBoxFlowSessionRef.current;
    if (
      !activeSession?.sessionKey ||
      !sample?.bounds ||
      (
        sample.lifecycleKey &&
        sample.lifecycleKey !== activeSession.sessionKey
      )
    ) {
      return null;
    }
    const boundsDigest = buildCanvasBoxFlowBoundsDigest(sample.bounds);
    if (!boundsDigest) {
      return null;
    }
    const startupState = ensureDragOverlayStartupState(activeSession.sessionKey);
    if (!startupState?.firstVisibleBox) {
      const nextOrder = Number(startupState?.sampleSequence || 0) + 1;
      const nextStartupState = {
        ...startupState,
        sampleSequence: nextOrder,
        firstVisibleBox: {
          order: nextOrder,
          selectedIdsDigest:
            buildCanvasBoxFlowIdsDigest(sanitizeSelectionIds(sample.selectedIds)) ||
            activeSession.selectedIdsDigest ||
            null,
          source: sample.source || sample.debugSource || "overlay-update",
          bounds: boundsDigest,
        },
      };
      dragOverlayStartupStateRef.current = nextStartupState;
      maybeEmitDragOverlayStartupSummary(
        activeSession.sessionKey,
        nextStartupState
      );
    }
    if (activeSession.phase !== "drag" && activeSession.phase !== "settling") {
      return null;
    }
    if (!sample?.syncToken) {
      return null;
    }

    const driftState = ensureDragOverlayDriftState(activeSession.sessionKey);
    const overlaySample = {
      syncToken: sample.syncToken,
      selectedIdsDigest:
        buildCanvasBoxFlowIdsDigest(sanitizeSelectionIds(sample.selectedIds)) ||
        activeSession.selectedIdsDigest ||
        null,
      source: sample.source || sample.debugSource || "overlay-update",
      bounds: boundsDigest,
    };

    if (!overlaySample.bounds) return null;

    const {
      matched,
      dragSample,
      overlaySample: matchedOverlaySample,
      nextState,
    } = matchDragOverlayDriftOverlaySample(
      driftState,
      activeSession.sessionKey,
      overlaySample
    );
    dragOverlayDriftStateRef.current = nextState;

    if (matched && dragSample && matchedOverlaySample) {
      return recordDragOverlayDriftComparison(
        dragSample,
        matchedOverlaySample
      );
    }
    return null;
  }, [
    ensureDragOverlayStartupState,
    ensureDragOverlayDriftState,
    matchDragOverlayDriftOverlaySample,
    maybeEmitDragOverlayStartupSummary,
    recordDragOverlayDriftComparison,
  ]);
  const finalizeDragOverlayDrift = useCallback((reason = "manual") => {
    if (!isCanvasBoxFlowDebugEnabled()) {
      resetDragOverlayDriftState(null);
      return null;
    }
    const driftState = dragOverlayDriftStateRef.current;
    if (!driftState?.sessionKey) {
      return null;
    }
    const finalizedState = finalizeDragOverlayDriftPairingState(
      driftState,
      driftState.sessionKey
    );

    const flushedSummary = flushCanvasBoxFlowSummary(
      "selection",
      DRAG_OVERLAY_DRIFT_SUMMARY_KEY,
      { reason }
    );
    const lastDrift = driftState.lastDrift || null;
    const entry = (lastDrift || finalizedState.syncMisses > 0)
      ? logCanvasBoxFlow("selection", "drift:end", {
          source: "stage-composer",
          debugSource: "drag-overlay-drift",
          reason,
          syncMisses: finalizedState.syncMisses,
          ...lastDrift,
        }, {
          identity: driftState.sessionKey,
        })
      : null;
    dragOverlayDriftStateRef.current = finalizedState.nextState;
    return {
      flushedSummary,
      entry,
    };
  }, [finalizeDragOverlayDriftPairingState, resetDragOverlayDriftState]);
  const hoverSuppressionState = resolveStageHoverSuppression({
    isDragging: Boolean(isDragging),
    backgroundEditSectionId,
    isPredragVisualSelectionActive,
    canvasInteractionActive,
    canvasInteractionSettling,
    isImageCropInteracting,
    runtimeDragActive:
      typeof window !== "undefined" ? Boolean(window._isDragging) : false,
    runtimeGroupDragActive:
      typeof window !== "undefined" ? Boolean(window._grupoLider) : false,
    runtimeResizeActive:
      typeof window !== "undefined"
        ? Boolean(window._resizeData?.isResizing)
        : false,
  });
  const isHoverSuppressed = hoverSuppressionState.suppressed;
  const hoverSuppressionReasons = hoverSuppressionState.reasons;
  const hoverSuppressionReasonsKey = hoverSuppressionReasons.join(",");
  const effectiveHoverId = isHoverSuppressed ? null : hoverId;
  const shouldMountHoverIndicator = shouldStageRenderHoverIndicator({
    isPredragVisualSelectionActive,
    isDragging: Boolean(isDragging),
    runtimeDragActive:
      typeof window !== "undefined" ? Boolean(window._isDragging) : false,
    runtimeGroupDragActive:
      typeof window !== "undefined" ? Boolean(window._grupoLider) : false,
    runtimeResizeActive:
      typeof window !== "undefined"
        ? Boolean(window._resizeData?.isResizing)
        : false,
  });
  const selectedPrimaryObject =
    elementosSeleccionados.length === 1
      ? objetos.find((obj) => obj.id === elementosSeleccionados[0]) || null
      : null;
  const selectedObjectsForVisualMode = useMemo(
    () =>
      sanitizeSelectionIds(elementosSeleccionados)
        .map((id) => objetos.find((obj) => obj.id === id) || null)
        .filter(Boolean),
    [elementosSeleccionados, objetos]
  );
  const isAnyCanvasDragActive =
    Boolean(isDragging) ||
    canvasInteractionActive ||
    canvasInteractionSettling ||
    (typeof window !== "undefined" && Boolean(window._isDragging)) ||
    (typeof window !== "undefined" && Boolean(window._grupoLider));
  const isCanvasDragGestureActive =
    Boolean(isDragging) ||
    (typeof window !== "undefined" && Boolean(window._isDragging)) ||
    (typeof window !== "undefined" && Boolean(window._grupoLider));
  const shouldRenderImageCropOverlay =
    !editing.id &&
    !isCanvasDragGestureActive &&
    !isImageRotateInteractionActive &&
    (!isAnyCanvasDragActive || isImageCropInteracting);
  const canvasInteractionLastBegin =
    typeof window !== "undefined" ? window.__CANVAS_INTERACTION_LAST_BEGIN || null : null;
  const isCanvasDragCoordinatorActive = Boolean(
    canvasInteractionActive &&
    Number(canvasInteractionLastBegin?.interactionEpoch || 0) === canvasInteractionEpoch &&
    canvasInteractionLastBegin?.kind === "drag"
  );
  const stageSelectionVisualMode = useMemo(
    () =>
      resolveStageSelectionVisualMode({
        selectedIds: elementosSeleccionados,
        selectedObjects: selectedObjectsForVisualMode,
        selectionActive: seleccionActiva,
        selectionArea: areaSeleccion,
        activeInlineEditingId,
        hasSectionDecorationEdit: Boolean(sectionDecorationEdit),
        isAnyCanvasDragActive,
        isCanvasDragGestureActive,
        isCanvasDragCoordinatorActive,
        canvasInteractionActive,
        canvasInteractionSettling,
        isImageRotateInteractionActive,
        dragOverlaySessionSelectedIds: dragOverlayBoxFlowSession.selectedIds,
        dragVisualSelectionIds,
        predragVisualSelectionActive: isPredragVisualSelectionActive,
      }),
    [
      activeInlineEditingId,
      areaSeleccion,
      canvasInteractionActive,
      canvasInteractionSettling,
      dragOverlayBoxFlowSession.selectedIds,
      dragVisualSelectionIds,
      elementosSeleccionados,
      isAnyCanvasDragActive,
      isCanvasDragCoordinatorActive,
      isCanvasDragGestureActive,
      isImageRotateInteractionActive,
      isPredragVisualSelectionActive,
      sectionDecorationEdit,
      seleccionActiva,
      selectedObjectsForVisualMode,
    ]
  );
  const shouldShowDragSelectionOverlay =
    stageSelectionVisualMode.showDragSelectionOverlay;
  const canonicalSelectedIdsForBoxFlow =
    dragOverlayBoxFlowSession.selectedIds.length > 0
      ? sanitizeSelectionIds(dragOverlayBoxFlowSession.selectedIds)
      : (
          runtimeSelectedIds.length > 0
            ? runtimeSelectedIds
            : sanitizeSelectionIds(elementosSeleccionados)
        );
  const selectedIdsDigest = buildCanvasBoxFlowIdsDigest(
    canonicalSelectedIdsForBoxFlow
  );
  const dragOverlaySelectionIdsDigest = buildCanvasBoxFlowIdsDigest(
    stageSelectionVisualMode.dragOverlaySelectionIds
  );
  const dragOverlayBoxFlowIdentity =
    dragOverlayBoxFlowSession.sessionKey || null;
  const selectionBoxFlowIdentity =
    dragOverlayBoxFlowIdentity ||
    selectedIdsDigest ||
    dragOverlaySelectionIdsDigest ||
    null;
  const handleDragSelectionOverlayReadyChange = useCallback((isReady) => {
    setIsDragSelectionOverlayVisualReady((current) => (
      current === Boolean(isReady) ? current : Boolean(isReady)
    ));
  }, []);
  const handleDragOverlayFirstVisibleFrame = useCallback((visibilitySample = null) => {
    const emission = resolveDragOverlayShownEmission({
      lastShownSessionKey: dragOverlayShownSessionKeyRef.current,
      activeSession: dragOverlayBoxFlowSessionRef.current,
      visibilitySample,
      selectedIdsDigest,
      dragOverlaySelectionIdsDigest,
    });

    dragOverlayShownSessionKeyRef.current = emission.nextShownSessionKey || null;
    if (!emission.shouldEmit || !emission.payload) {
      return false;
    }

    logCanvasBoxFlow("selection", "drag-overlay:shown", emission.payload, {
      identity: emission.payload.dragOverlaySessionKey,
    });
    return true;
  }, [
    dragOverlaySelectionIdsDigest,
    selectedIdsDigest,
  ]);

  useEffect(() => {
    if (shouldShowDragSelectionOverlay) return;
    setIsDragSelectionOverlayVisualReady((current) => (current ? false : current));
  }, [shouldShowDragSelectionOverlay]);
  useEffect(() => {
    if (!shouldShowDragSelectionOverlay || !dragOverlayBoxFlowIdentity) {
      return;
    }

    const currentSnapshot = dragOverlayControlledBoundsRef.current;
    const pendingStartupVisibleSnapshot = getPendingDragOverlayStartupVisibleSnapshot(
      dragOverlayStartupGateRef.current,
      dragOverlayBoxFlowIdentity
    );
    const snapshotToReplay =
      pendingStartupVisibleSnapshot?.bounds
        ? pendingStartupVisibleSnapshot
        : currentSnapshot;

    if (
      snapshotToReplay?.sessionKey === dragOverlayBoxFlowIdentity &&
      snapshotToReplay.bounds
    ) {
      const shouldReplayPendingStartupVisibleSnapshot = Boolean(
        pendingStartupVisibleSnapshot?.bounds
      );
      if (!shouldReplayPendingStartupVisibleSnapshot) {
        if (
          !canReplayDragOverlayStartupSnapshot(
            dragOverlayStartupGateRef.current,
            dragOverlayBoxFlowIdentity,
            snapshotToReplay
          )
        ) {
          return;
        }
      }
      const currentAppliedDigest =
        dragOverlayIndicatorRef.current?.getAppliedBoundsDigest?.() || null;
      const storedDigest = buildCanvasBoxFlowBoundsDigest(snapshotToReplay.bounds);
      if (
        currentAppliedDigest &&
        storedDigest &&
        areCanvasBoxFlowBoundsDigestsEqual(currentAppliedDigest, storedDigest)
      ) {
        return;
      }
      const appliedSnapshot = dragOverlayIndicatorRef.current?.applyControlledBounds?.(snapshotToReplay.bounds, {
        source: snapshotToReplay.source || "controlled-replay",
        debugSource: "drag-overlay",
        selectedIds: snapshotToReplay.selectedIds || [],
        identity: dragOverlayBoxFlowIdentity,
        lifecycleKey: dragOverlayBoxFlowIdentity,
        dragId: snapshotToReplay.dragId || null,
        phase: snapshotToReplay.phase || null,
        syncToken: snapshotToReplay.syncToken || null,
      });
      if (
        appliedSnapshot &&
        shouldReplayPendingStartupVisibleSnapshot &&
        snapshotToReplay.startupVisibleEligible
      ) {
        dragOverlayStartupGateRef.current = markDragOverlayStartupFrameVisible(
          dragOverlayStartupGateRef.current,
          dragOverlayBoxFlowIdentity,
          snapshotToReplay
        );
      }
      return;
    }

    syncControlledDragOverlayBounds(
      stageSelectionVisualMode.dragOverlaySelectionIds,
      {
        dragId: dragOverlayBoxFlowSessionRef.current?.dragId || null,
        source: "controlled-seed",
      }
    );
  }, [
    getPendingDragOverlayStartupVisibleSnapshot,
    dragOverlayBoxFlowIdentity,
    dragOverlaySelectionIdsDigest,
    markDragOverlayStartupFrameVisible,
    shouldShowDragSelectionOverlay,
    stageSelectionVisualMode.dragOverlaySelectionIds,
    syncControlledDragOverlayBounds,
  ]);

  const setHoverIdWhenIdle = useCallback((nextHoverId, meta = null) => {
    const dragActive =
      Boolean(isDragging) ||
      isPredragVisualSelectionActive ||
      canvasInteractionActive ||
      canvasInteractionSettling ||
      (typeof window !== "undefined" &&
        Boolean(window._isDragging || window._grupoLider));

    if (dragActive) return;

    hoverBoxFlowMetaRef.current = meta || null;

    setHoverId((currentHoverId) => (
      typeof nextHoverId === "function"
        ? nextHoverId(currentHoverId)
        : nextHoverId
    ), meta || null);
  }, [
    canvasInteractionActive,
    canvasInteractionSettling,
    isDragging,
    isPredragVisualSelectionActive,
    setHoverId,
  ]);

  const clearHoverForInteractionBoundary = useCallback(({
    dragId = null,
    source = "interaction-clear",
    reason = "interaction-active",
    targetType = null,
  } = {}) => {
    const nextHoverId =
      hoverId ||
      hoverIndicatorRef.current?.getVisibleHoverId?.() ||
      null;
    if (!nextHoverId) return false;

    hoverBoxFlowMetaRef.current = {
      source,
      targetType: targetType || null,
    };
    logCanvasBoxFlow("hover", "forced-clear", {
      source: "stage-composer",
      hoverId: nextHoverId,
      dragId: dragId || null,
      reason,
      targetType: targetType || null,
    }, {
      identity: nextHoverId,
    });
    hoverIndicatorRef.current?.forceHide?.({
      hoverId: nextHoverId,
      reason,
    });
    setHoverId(null, {
      source,
      reason,
      targetType: targetType || null,
    });
    return true;
  }, [hoverId, setHoverId]);

  const resolveSelectionBoxFlowIdentity = useCallback((fallbackId = null, ids = null) => {
    const idsDigest = buildCanvasBoxFlowIdsDigest(
      Array.isArray(ids) ? ids : []
    );
    const activeDragOverlayIdentity =
      dragOverlayBoxFlowSessionRef.current?.sessionKey || null;
    return (
      activeDragOverlayIdentity ||
      idsDigest ||
      selectionBoxFlowIdentity ||
      fallbackId ||
      "selection:implicit"
    );
  }, [selectionBoxFlowIdentity]);

  const recordSelectionDragMoveSummary = useCallback((dragId, tipo, pos, meta = {}) => {
    const safeSelectedIds = Array.isArray(meta.selectedIds) ? meta.selectedIds : [];
    const dragSample = noteDragOverlayDragSample({
      dragId,
      selectedIds: safeSelectedIds,
      pos,
      source: meta.source || "stage-composer",
    });
    recordCanvasBoxFlowSummary("selection", "selection-drag-move", {
      source: meta.source || "stage-composer",
      dragId,
      tipo: tipo || null,
      pipeline: meta.pipeline || "individual",
      x: Number(pos?.x ?? null),
      y: Number(pos?.y ?? null),
    }, {
      identity: resolveSelectionBoxFlowIdentity(
        dragId,
        safeSelectedIds
      ),
      eventName: "drag:summary",
    });
    syncControlledDragOverlayBounds(safeSelectedIds, {
      dragId,
      source: "controlled-sync",
      syncToken: dragSample?.syncToken || null,
    });
  }, [
    noteDragOverlayDragSample,
    resolveSelectionBoxFlowIdentity,
    syncControlledDragOverlayBounds,
  ]);

  const logSelectionDragLifecycle = useCallback((eventName, {
    dragId = null,
    tipo = null,
    pos = null,
    selectedIds = null,
    pipeline = "individual",
    source = "stage-composer",
    reason = null,
  } = {}) => {
    const identity = resolveSelectionBoxFlowIdentity(dragId, selectedIds);

    if (eventName === "drag:summary") {
      recordSelectionDragMoveSummary(dragId, tipo, pos, {
        pipeline,
        selectedIds,
        source,
      });
      return;
    }

    flushCanvasBoxFlowSummary("selection", "selection-drag-move", {
      reason: eventName,
    });
    logCanvasBoxFlow("selection", eventName, {
      source,
      dragId,
      tipo,
      pipeline,
      reason,
      selectedIds: buildCanvasBoxFlowIdsDigest(
        Array.isArray(selectedIds) ? selectedIds : []
      ),
      x: Number(pos?.x ?? null),
      y: Number(pos?.y ?? null),
    }, {
      identity,
    });
  }, [recordSelectionDragMoveSummary, resolveSelectionBoxFlowIdentity]);

  useEffect(() => {
    const nextSnapshot = {
      identity: selectionBoxFlowIdentity,
      dragOverlayBoxFlowIdentity,
      dragOverlayInteractionEpoch: Number(
        dragOverlayBoxFlowSession.interactionEpoch || 0
      ),
      dragOverlayPhase: dragOverlayBoxFlowSession.phase || null,
      selectedIdsDigest,
      dragOverlaySelectionIdsDigest,
      mountPrimarySelectionOverlay: Boolean(
        stageSelectionVisualMode.mountPrimarySelectionOverlay
      ),
      showDragSelectionOverlay: Boolean(shouldShowDragSelectionOverlay),
      dragOverlayVisualReady: Boolean(isDragSelectionOverlayVisualReady),
      predragActive: Boolean(isPredragVisualSelectionActive),
      singleSelectedLineId: stageSelectionVisualMode.singleSelectedLineId || null,
      activeInlineEditingId: activeInlineEditingId || null,
      hasSectionDecorationEdit: Boolean(sectionDecorationEdit),
    };
    const previousSnapshot = boxFlowSelectionSnapshotRef.current;
    boxFlowSelectionSnapshotRef.current = nextSnapshot;
    const overlayHiddenIdentity =
      previousSnapshot?.showDragSelectionOverlay && !nextSnapshot.showDragSelectionOverlay
        ? previousSnapshot.dragOverlayBoxFlowIdentity ||
          previousSnapshot.identity ||
          null
        : null;

    if (overlayHiddenIdentity) {
      clearControlledDragOverlayBounds("overlay-hidden");
      finalizeDragOverlayDrift("drag-overlay-hidden");
      resetDragOverlayStartupGate(null);
      resetDragOverlayStartupState(null);
      if (dragOverlayShownSessionKeyRef.current === overlayHiddenIdentity) {
        dragOverlayShownSessionKeyRef.current = null;
      }
      logCanvasBoxFlow("selection", "drag-overlay:hidden", {
        source: "stage-composer",
        dragOverlaySelectionIds: previousSnapshot?.dragOverlaySelectionIdsDigest || "",
        selectedIds: previousSnapshot?.selectedIdsDigest || "",
        dragOverlaySessionKey: overlayHiddenIdentity,
        phase: previousSnapshot?.dragOverlayPhase || null,
        interactionEpoch:
          Number(previousSnapshot?.dragOverlayInteractionEpoch || 0) || null,
      }, {
        identity: overlayHiddenIdentity,
        flushSummaryKeys: ["selection-drag-move"],
        flushReason: "drag-overlay-hidden",
      });
    }

    if (!selectionBoxFlowIdentity) {
      if (previousSnapshot?.identity) {
        endCanvasBoxFlowSession("selection", {
          reason: "selection-cleared",
          selectedIds: previousSnapshot.selectedIdsDigest || "",
          dragOverlaySelectionIds: previousSnapshot.dragOverlaySelectionIdsDigest || "",
        });
      }
      if (overlayHiddenIdentity) {
        clearDragOverlayBoxFlowSession((currentSession) => (
          currentSession?.sessionKey === overlayHiddenIdentity
        ));
      }
      return;
    }

    ensureCanvasBoxFlowSession("selection", selectionBoxFlowIdentity, {
      source: "stage-composer",
      selectedIds: selectedIdsDigest,
      dragOverlaySelectionIds: dragOverlaySelectionIdsDigest,
      dragOverlaySessionKey: dragOverlayBoxFlowIdentity,
      dragOverlayPhase: nextSnapshot.dragOverlayPhase,
      dragOverlayInteractionEpoch:
        nextSnapshot.dragOverlayInteractionEpoch || null,
    });

    const didVisualModeChange =
      !previousSnapshot ||
      previousSnapshot.identity !== nextSnapshot.identity ||
      previousSnapshot.mountPrimarySelectionOverlay !==
        nextSnapshot.mountPrimarySelectionOverlay ||
      previousSnapshot.showDragSelectionOverlay !==
        nextSnapshot.showDragSelectionOverlay ||
      previousSnapshot.predragActive !== nextSnapshot.predragActive ||
      previousSnapshot.singleSelectedLineId !== nextSnapshot.singleSelectedLineId ||
      previousSnapshot.activeInlineEditingId !== nextSnapshot.activeInlineEditingId ||
      previousSnapshot.hasSectionDecorationEdit !==
        nextSnapshot.hasSectionDecorationEdit;

    if (didVisualModeChange) {
      logCanvasBoxFlow("selection", "visual-mode:changed", {
        source: "stage-composer",
        selectedIds: selectedIdsDigest,
        dragOverlaySelectionIds: dragOverlaySelectionIdsDigest,
        dragOverlaySessionKey: dragOverlayBoxFlowIdentity,
        dragOverlayPhase: nextSnapshot.dragOverlayPhase,
        dragOverlayInteractionEpoch:
          nextSnapshot.dragOverlayInteractionEpoch || null,
        mountPrimarySelectionOverlay: nextSnapshot.mountPrimarySelectionOverlay,
        showDragSelectionOverlay: nextSnapshot.showDragSelectionOverlay,
        predragActive: nextSnapshot.predragActive,
        singleSelectedLineId: nextSnapshot.singleSelectedLineId,
        activeInlineEditingId: nextSnapshot.activeInlineEditingId,
        hasSectionDecorationEdit: nextSnapshot.hasSectionDecorationEdit,
      }, {
        identity: selectionBoxFlowIdentity,
      });
    }

    if (
      previousSnapshot?.dragOverlayVisualReady !==
      nextSnapshot.dragOverlayVisualReady
    ) {
      const readyStateIdentity = nextSnapshot.showDragSelectionOverlay
        ? nextSnapshot.dragOverlayBoxFlowIdentity ||
          nextSnapshot.identity
        : previousSnapshot?.dragOverlayBoxFlowIdentity ||
          previousSnapshot?.identity ||
          nextSnapshot.identity;
      logCanvasBoxFlow("selection", "drag-overlay:ready-state", {
        source: "stage-composer",
        isReady: nextSnapshot.dragOverlayVisualReady,
        dragOverlaySelectionIds: dragOverlaySelectionIdsDigest,
        dragOverlaySessionKey: nextSnapshot.showDragSelectionOverlay
          ? dragOverlayBoxFlowIdentity
          : previousSnapshot?.dragOverlayBoxFlowIdentity || null,
        phase: nextSnapshot.showDragSelectionOverlay
          ? nextSnapshot.dragOverlayPhase
          : previousSnapshot?.dragOverlayPhase || null,
        interactionEpoch: nextSnapshot.showDragSelectionOverlay
          ? nextSnapshot.dragOverlayInteractionEpoch || null
          : Number(previousSnapshot?.dragOverlayInteractionEpoch || 0) || null,
      }, {
        identity: readyStateIdentity,
      });
    }
    if (overlayHiddenIdentity) {
      clearDragOverlayBoxFlowSession((currentSession) => (
        currentSession?.sessionKey === overlayHiddenIdentity
      ));
    }
  }, [
    activeInlineEditingId,
    clearControlledDragOverlayBounds,
    clearDragOverlayBoxFlowSession,
    dragOverlayBoxFlowIdentity,
    dragOverlayBoxFlowSession.interactionEpoch,
    dragOverlayBoxFlowSession.phase,
    dragOverlaySelectionIdsDigest,
    finalizeDragOverlayDrift,
    isDragSelectionOverlayVisualReady,
    isPredragVisualSelectionActive,
    resetDragOverlayStartupGate,
    resetDragOverlayStartupState,
    sectionDecorationEdit,
    selectedIdsDigest,
    selectionBoxFlowIdentity,
    shouldShowDragSelectionOverlay,
    stageSelectionVisualMode.dragOverlaySelectionIds,
    stageSelectionVisualMode.mountPrimarySelectionOverlay,
    stageSelectionVisualMode.singleSelectedLineId,
  ]);

  useEffect(() => {
    const nextRawHoverId = hoverId || null;
    const nextEffectiveHoverId = effectiveHoverId || null;
    const hoverMeta = hoverBoxFlowMetaRef.current || null;
    const suppressionReasons = hoverSuppressionReasonsKey
      ? hoverSuppressionReasonsKey.split(",")
      : [];

    const nextSnapshot = {
      rawHoverId: nextRawHoverId,
      effectiveHoverId: nextEffectiveHoverId,
      isSuppressed: isHoverSuppressed,
      suppressionReasons: hoverSuppressionReasonsKey,
      source: hoverMeta?.source || null,
      targetType: hoverMeta?.targetType || null,
    };
    const previousSnapshot = boxFlowHoverSnapshotRef.current;
    boxFlowHoverSnapshotRef.current = nextSnapshot;

    if (!nextRawHoverId) {
      if (previousSnapshot?.rawHoverId) {
        endCanvasBoxFlowSession("hover", {
          reason: "hover-cleared",
          previousHoverId: previousSnapshot.rawHoverId,
          source: previousSnapshot.source || "stage-composer",
        });
      }
      return;
    }

    ensureCanvasBoxFlowSession("hover", nextRawHoverId, {
      source: hoverMeta?.source || "stage-composer",
      hoverId: nextRawHoverId,
      targetType: hoverMeta?.targetType || null,
    });

    if (!previousSnapshot || previousSnapshot.rawHoverId !== nextRawHoverId) {
      logCanvasBoxFlow(
        "hover",
        previousSnapshot?.rawHoverId ? "target:changed" : "target:resolved",
        {
          source: hoverMeta?.source || "stage-composer",
          targetType: hoverMeta?.targetType || null,
          previousHoverId: previousSnapshot?.rawHoverId || null,
          hoverId: nextRawHoverId,
        },
        {
          identity: nextRawHoverId,
        }
      );
    }

    if (
      previousSnapshot?.isSuppressed !== nextSnapshot.isSuppressed ||
      previousSnapshot?.suppressionReasons !== nextSnapshot.suppressionReasons
    ) {
      logCanvasBoxFlow(
        "hover",
        nextSnapshot.isSuppressed ? "stage:suppressed" : "stage:resumed",
        {
          source: "stage-composer",
          hoverId: nextRawHoverId,
          reasons: suppressionReasons,
        },
        {
          identity: nextRawHoverId,
        }
      );
    }
  }, [
    backgroundEditSectionId,
    canvasInteractionActive,
    canvasInteractionSettling,
    effectiveHoverId,
    hoverId,
    hoverSuppressionReasonsKey,
    isHoverSuppressed,
    isDragging,
    isImageCropInteracting,
  ]);

  useEffect(
    () => () => {
      endCanvasBoxFlowSession("hover", {
        reason: "component-unmount",
      });
      endCanvasBoxFlowSession("selection", {
        reason: "component-unmount",
      });
    },
    []
  );

  useEffect(() => {
    canvasStageRenderCountRef.current += 1;
    if (typeof window === "undefined") return;

    if (canvasStageObjectsRef.current !== objetos) {
      canvasStageObjectsRef.current = objetos;
      canvasStageObjectsVersionRef.current += 1;
    }

    const isInteractionActive =
      window._isDragging ||
      window._grupoLider ||
      window._resizeData?.isResizing ||
      isImageCropInteracting;
    if (!isInteractionActive) return;

    const nextSnapshot = {
      objetosVersion: canvasStageObjectsVersionRef.current,
      selectedIds: elementosSeleccionados.join(","),
      preselectedIds: elementosPreSeleccionados.join(","),
      hoverId: effectiveHoverId || null,
      activeInlineEditingId: activeInlineEditingId || null,
      selectionBoxActive: Boolean(seleccionActiva || areaSeleccion),
      imageCropInteracting: Boolean(isImageCropInteracting),
      sectionDecorationEditKey: sectionDecorationEdit
        ? `${sectionDecorationEdit.sectionId || "?"}:${sectionDecorationEdit.decorationId || "?"}`
        : null,
      activeSectionId: seccionActivaId || null,
      isDraggingProp: Boolean(isDragging),
      guidesCount: guideOverlayRef?.current?.getGuideLinesCount?.() || 0,
      pendingDragSelectionId:
        runtimePendingDragSelectionId ||
        (
          dragSettleSessionRef.current?.needsDeferredCommit
            ? dragSettleSessionRef.current.dragId
            : null
        ) ||
        null,
    };
    const diff = buildCanvasDragPerfDiff(
      canvasStageRenderSnapshotRef.current,
      nextSnapshot
    );
    canvasStageRenderSnapshotRef.current = nextSnapshot;

    trackCanvasDragPerf("render:CanvasStageContent", {
      renderCount: canvasStageRenderCountRef.current,
      objectsCount: objetos.length,
      selectedCount: elementosSeleccionados.length,
      dragging: Boolean(window._isDragging),
      groupLeader: window._grupoLider || null,
      resizing: Boolean(window._resizeData?.isResizing),
      changedKeys: diff.changedKeys,
      changes: diff.changes,
      ...nextSnapshot,
    }, {
      throttleMs: 120,
      throttleKey: "render:CanvasStageContent",
    });
  }, [
    activeInlineEditingId,
    areaSeleccion,
    editing.id,
    effectiveHoverId,
    elementosPreSeleccionados,
    elementosSeleccionados,
    guideOverlayRef,
    hoverId,
    inlineOverlayMountSession?.phase,
    inlineOverlayMountSession?.mounted,
    inlineOverlayMountedId,
    isDragging,
    isImageCropInteracting,
    objetos,
    sectionDecorationEdit,
    seccionActivaId,
    seleccionActiva,
  ]);

  const publishCountdownRuntimeDebug = useCallback((eventName, payload = {}) => {
    if (!isCountdownRepeatDragDebugEnabled()) return false;

    const activeDebugState = getCountdownRepeatDragActiveState();
    if (!activeDebugState?.elementId) return false;

    const activeObject =
      objetos.find((item) => item?.id === activeDebugState.elementId) || null;
    if (activeObject?.tipo !== "countdown") return false;

    publishCountdownRepeatDragDebugEntry({
      event: eventName,
      elementId: activeDebugState.elementId,
      source: "CanvasStageContentComposer",
      activeDebugState,
      ...payload,
    });
    return true;
  }, [objetos]);

  useEffect(() => {
    if (!isCountdownRepeatDragDebugEnabled()) return;

    const activeDebugState = getCountdownRepeatDragActiveState();
    if (!activeDebugState?.elementId) return;

    const activeCountdown =
      objetos.find((item) => item?.id === activeDebugState.elementId) || null;
    if (activeCountdown?.tipo !== "countdown") return;

    const nextSnapshot = {
      renderCount: canvasStageRenderCountRef.current,
      elementId: activeDebugState.elementId,
      activeSessionId: activeDebugState.sessionId || null,
      canvasInteractionEpoch: Number(canvasInteractionEpoch || 0),
      canvasInteractionActive: Boolean(canvasInteractionActive),
      canvasInteractionSettling: Boolean(canvasInteractionSettling),
      isDraggingProp: Boolean(isDragging),
      globalDragging: typeof window !== "undefined" ? Boolean(window._isDragging) : false,
      isCanvasDragGestureActive: Boolean(isCanvasDragGestureActive),
      isCanvasDragCoordinatorActive: Boolean(isCanvasDragCoordinatorActive),
      pendingDragSelectionId: runtimePendingDragSelectionId,
      pendingDragSelectionPhase: runtimePendingDragSelectionPhase,
      dragSettleDragId: dragSettleSessionRef.current?.dragId || null,
      dragSettleTipo: dragSettleSessionRef.current?.tipo || null,
      dragSettleStartedSelected: Boolean(dragSettleSessionRef.current?.startedSelected),
      dragSettleNeedsDeferredCommit: Boolean(
        dragSettleSessionRef.current?.needsDeferredCommit
      ),
      dragSettleInteractionEpoch: Number(
        dragSettleSessionRef.current?.interactionEpoch || 0
      ),
      dragVisualSelectionIds: sanitizeSelectionIds(dragVisualSelectionIds).join(","),
      dragVisualSelectionCount: dragVisualSelectionIds.length,
      selectedIds: sanitizeSelectionIds(elementosSeleccionados).join(","),
      preselectedIds: sanitizeSelectionIds(elementosPreSeleccionados).join(","),
      guidesCount: guideOverlayRef?.current?.getGuideLinesCount?.() || 0,
    };
    const previousSnapshot = countdownDragDebugSnapshotRef.current;
    const changedKeys = !previousSnapshot
      ? Object.keys(nextSnapshot)
      : Object.keys(nextSnapshot).filter(
          (key) => previousSnapshot[key] !== nextSnapshot[key]
        );

    if (changedKeys.length === 0) return;

    countdownDragDebugSnapshotRef.current = nextSnapshot;
    publishCountdownRuntimeDebug("composer:countdown-drag-state", {
      changedKeys,
      snapshot: nextSnapshot,
    });
  }, [
    canvasInteractionActive,
    canvasInteractionEpoch,
    canvasInteractionSettling,
    dragVisualSelectionIds,
    elementosPreSeleccionados,
    elementosSeleccionados,
    guideOverlayRef,
    isCanvasDragCoordinatorActive,
    isCanvasDragGestureActive,
    isDragging,
    objetos,
    publishCountdownRuntimeDebug,
  ]);

  useEffect(() => {
    dragGuideObjectsRef.current = objetos;
  }, [objetos]);

  useEffect(() => {
    if (!hoverId || !activeInlineEditingId || hoverId !== activeInlineEditingId) return;
    hoverBoxFlowMetaRef.current = {
      source: "inline-editing-clear",
      targetType: "texto",
    };
    setHoverId(null, {
      source: "inline-editing-clear",
      targetType: "texto",
    });
  }, [activeInlineEditingId, hoverId, setHoverId]);

  useEffect(() => {
    const stage = stageRef?.current?.getStage?.() || stageRef?.current || null;
    if (!stage || stage.__canvasStageBatchPerfInstrumented) return undefined;

    const originalBatchDraw =
      typeof stage.batchDraw === "function" ? stage.batchDraw : null;
    if (!originalBatchDraw) return undefined;

    stage.batchDraw = function patchedStageBatchDraw(...args) {
      const activeSession =
        typeof window !== "undefined" ? window.__CANVAS_DRAG_PERF_ACTIVE_SESSION : null;
      if (activeSession) {
        trackCanvasDragPerf(
          "stage:batch-draw-request",
          {
            elementId: activeSession.elementId || null,
            tipo: activeSession.tipo || null,
            layerCount: typeof this.getLayers === "function" ? this.getLayers().length : null,
          },
          {
            throttleMs: 50,
            throttleKey: `stage:batch-draw-request:${activeSession.elementId || "unknown"}`,
          }
        );
      }

      return originalBatchDraw.apply(this, args);
    };

    stage.__canvasStageBatchPerfInstrumented = true;

    return () => {
      if (!stage) return;
      stage.batchDraw = originalBatchDraw;
      delete stage.__canvasStageBatchPerfInstrumented;
    };
  }, [stageRef]);

  const cancelScheduledGuideEvaluation = useCallback(() => {
    const current = guideDragFrameRef.current;
    if (
      current.rafId &&
      typeof window !== "undefined" &&
      typeof window.cancelAnimationFrame === "function"
    ) {
      window.cancelAnimationFrame(current.rafId);
    }
    guideDragFrameRef.current = { rafId: 0, payload: null };
  }, []);

  const flushScheduledGuideEvaluation = useCallback(() => {
    const current = guideDragFrameRef.current;
    const payload = current.payload;
    guideDragFrameRef.current = { rafId: 0, payload: null };
    if (!payload) return;

    mostrarGuias(
      payload.pos,
      payload.elementId,
      dragGuideObjectsRef.current,
      elementRefs
    );
  }, [elementRefs, mostrarGuias]);

  const scheduleGuideEvaluation = useCallback((pos, elementId) => {
    cancelScheduledGuideEvaluation();
    guideDragFrameRef.current = {
      rafId: 0,
      payload: { pos, elementId },
    };
    flushScheduledGuideEvaluation();
  }, [cancelScheduledGuideEvaluation, flushScheduledGuideEvaluation]);

  useEffect(() => (
    () => {
      cancelScheduledGuideEvaluation();
    }
  ), [cancelScheduledGuideEvaluation]);

  const startDragSettleSession = useCallback((
    dragId,
    seleccionActual,
    tipo = null,
    interactionEpoch = 0,
    options = {}
  ) => {
    const currentSelection = Array.isArray(seleccionActual) ? seleccionActual : [];
    const requestedOverlaySelection = sanitizeSelectionIds(
      options?.overlaySelectionSnapshot
    );
    const overlaySelectionSnapshot =
      requestedOverlaySelection.length > 0
        ? requestedOverlaySelection
        : resolveDragVisualSelectionIds(dragId, currentSelection);
    const startedSelected = currentSelection.includes(dragId);
    const nextSession = {
      dragId,
      tipo,
      startedSelected,
      selectionSnapshot: [...currentSelection],
      overlaySelectionSnapshot: [...overlaySelectionSnapshot],
      needsDeferredCommit: !startedSelected,
      hadVisualSelection:
        overlaySelectionSnapshot.length > 0,
      needsGuideCleanup: true,
      interactionEpoch: Number(interactionEpoch || 0),
    };

    dragSettleSessionRef.current = nextSession;
    publishCountdownRuntimeDebug("composer:drag-settle-start", {
      dragId,
      tipo,
      interactionEpoch: Number(interactionEpoch || 0),
      startedSelected,
      needsDeferredCommit: Boolean(nextSession.needsDeferredCommit),
      selectionSnapshot: [...currentSelection],
      overlaySelectionSnapshot: [...overlaySelectionSnapshot],
    });

    if (!nextSession.needsDeferredCommit) {
      setPendingDragSelectionRuntime(null, {
        source: "drag-settle:already-selected",
      });
      trackCanvasDragPerf("selection:defer-skipped", {
        elementId: dragId,
        tipo,
        reason: "already-selected",
        selectedSnapshot: currentSelection.join(","),
      }, {
        throttleMs: 40,
        throttleKey: `selection:defer-skipped:${dragId}`,
      });
      return nextSession;
    }

    setPendingDragSelectionRuntime(
      {
        id: dragId,
        phase: "deferred-drag",
      },
      {
        source: "drag-settle:deferred-drag",
      }
    );

    trackCanvasDragPerf("selection:defer-dragstart", {
      elementId: dragId,
      tipo,
      selectedSnapshot: currentSelection.join(","),
    }, {
      throttleMs: 40,
      throttleKey: `selection:defer-dragstart:${dragId}`,
    });
    return nextSession;
  }, [
    publishCountdownRuntimeDebug,
    setPendingDragSelectionRuntime,
  ]);

  const beginDragVisualSelection = useCallback((dragId, seleccionActual) => {
    const currentSelection = Array.isArray(seleccionActual)
      ? seleccionActual.filter(Boolean)
      : [];
    const nextSelection = readActiveDragOverlaySelectionIds(
      dragId,
      currentSelection
    );

    publishCountdownRuntimeDebug("composer:drag-visual-selection", {
      dragId,
      currentSelectionSnapshot: [...currentSelection],
      nextSelectionSnapshot: [...nextSelection],
    });

    setDragVisualSelectionIds((current) => {
      if (
        Array.isArray(current) &&
        current.length === nextSelection.length &&
        current.every((id, index) => id === nextSelection[index])
      ) {
        setDragVisualSelectionRuntime(
          {
            ids: nextSelection,
            predragActive: isPredragVisualSelectionActive,
            sessionKey: dragOverlayBoxFlowSessionRef.current?.sessionKey || null,
            dragId: dragId || dragOverlayBoxFlowSessionRef.current?.dragId || null,
          },
          {
            source: "drag-visual-selection:no-op",
          }
        );
        return current;
      }
      dragVisualSelectionIdsRef.current = nextSelection;
      setDragVisualSelectionRuntime(
        {
          ids: nextSelection,
          predragActive: isPredragVisualSelectionActive,
          sessionKey: dragOverlayBoxFlowSessionRef.current?.sessionKey || null,
          dragId: dragId || dragOverlayBoxFlowSessionRef.current?.dragId || null,
        },
        {
          source: "drag-visual-selection:update",
        }
      );
      return nextSelection;
    });
    syncControlledDragOverlayBounds(nextSelection, {
      dragId,
      source: isPredragVisualSelectionActive
        ? "predrag-seed"
        : "drag-selection-seed",
    });
  }, [
    isPredragVisualSelectionActive,
    publishCountdownRuntimeDebug,
    readActiveDragOverlaySelectionIds,
    syncControlledDragOverlayBounds,
    setDragVisualSelectionRuntime,
  ]);

  useEffect(() => {
    if (!isPredragVisualSelectionActive) return;

    if (dragVisualSelectionIds.length === 0) {
      setIsPredragVisualSelectionActive((current) => (current ? false : current));
      return;
    }

    if (
      !isCanvasDragGestureActive &&
      !isCanvasDragCoordinatorActive &&
      !canvasInteractionActive &&
      !canvasInteractionSettling
    ) {
      return;
    }

    setIsPredragVisualSelectionActive((current) => (current ? false : current));
  }, [
    canvasInteractionActive,
    canvasInteractionSettling,
    dragVisualSelectionIds.length,
    isCanvasDragCoordinatorActive,
    isCanvasDragGestureActive,
    isPredragVisualSelectionActive,
  ]);

  const beginPredragVisualSelection = useCallback((dragId, seleccionActual, meta = null) => {
    const run = () => {
      const dragTargetType = Array.isArray(objetos)
        ? (objetos.find((obj) => obj.id === dragId)?.tipo || null)
        : null;
      const currentSelection = Array.isArray(seleccionActual)
        ? seleccionActual.filter(Boolean)
        : [];
      const nextSelection = resolveDragVisualSelectionIds(dragId, currentSelection);
      clearHoverForInteractionBoundary({
        dragId,
        source: "predrag-start-clear",
        reason: "predrag-active",
        targetType: dragTargetType,
      });
      const livePendingDragSelection = readPendingDragSelectionSnapshot();
      const startupPolicy = resolvePredragOverlayStartupPolicy({
        dragId,
        pendingDragSelectionId: livePendingDragSelection.id,
        pendingDragSelectionPhase: livePendingDragSelection.phase,
        predragIntent: meta?.predragIntent || null,
      });
      const nextDragOverlaySession = beginDragOverlayBoxFlowSession({
        dragId,
        selectedIds: nextSelection,
        phase: "predrag",
        skipInitialSeed: startupPolicy.skipInitialSeed,
      });
      ensureDragOverlayStartupState(nextDragOverlaySession.sessionKey || null);

      logCanvasBoxFlow("selection", "predrag:visual-selection-start", {
        source: "stage-composer",
        dragId: dragId || null,
        selectedIds: buildCanvasBoxFlowIdsDigest(nextSelection),
        dragOverlaySessionKey: nextDragOverlaySession.sessionKey || null,
        skipInitialSeed: startupPolicy.skipInitialSeed,
        startupPolicySource: startupPolicy.policySource,
        startupPolicyReason: startupPolicy.policyReason,
        predragIntent: meta?.predragIntent || null,
      }, {
        identity:
          nextDragOverlaySession.sessionKey ||
          resolveSelectionBoxFlowIdentity(dragId, nextSelection),
      });

      setIsPredragVisualSelectionActive((current) => (current ? current : true));
      setDragVisualSelectionIds((current) => {
        const visualSelection = sanitizeSelectionIds(
          nextDragOverlaySession.selectedIds
        );
        if (
          Array.isArray(current) &&
          current.length === visualSelection.length &&
          current.every((id, index) => id === visualSelection[index])
        ) {
          dragVisualSelectionIdsRef.current = visualSelection;
          setDragVisualSelectionRuntime(
            {
              ids: visualSelection,
              predragActive: true,
              sessionKey: nextDragOverlaySession.sessionKey || null,
              dragId: dragId || nextDragOverlaySession.dragId || null,
            },
            {
              source: "predrag-visual-selection:no-op",
            }
          );
          return current;
        }
        dragVisualSelectionIdsRef.current = visualSelection;
        setDragVisualSelectionRuntime(
          {
            ids: visualSelection,
            predragActive: true,
            sessionKey: nextDragOverlaySession.sessionKey || null,
            dragId: dragId || nextDragOverlaySession.dragId || null,
          },
          {
            source: "predrag-visual-selection:update",
          }
        );
        return visualSelection;
      });
      if (startupPolicy.shouldSeedPredragBounds) {
        syncControlledDragOverlayBounds(nextDragOverlaySession.selectedIds, {
          dragId,
          source: "predrag-seed",
        });
      }
    };

    if (typeof flushSync === "function") {
      flushSync(run);
      return;
    }

    run();
  }, [
    beginDragOverlayBoxFlowSession,
    clearHoverForInteractionBoundary,
    ensureDragOverlayStartupState,
    objetos,
    readPendingDragSelectionSnapshot,
    resolvePredragOverlayStartupPolicy,
    resolveSelectionBoxFlowIdentity,
    syncControlledDragOverlayBounds,
    setDragVisualSelectionRuntime,
  ]);

  const clearDragVisualSelection = useCallback((options = {}) => {
    const currentSelection = sanitizeSelectionIds(dragVisualSelectionIdsRef.current);
    const expectedSelection = sanitizeSelectionIds(options?.expectedSelectionIds);
    const shouldSkipOnMismatch = expectedSelection.length > 0;
    const hasSelectionMismatch =
      shouldSkipOnMismatch &&
      currentSelection.length > 0 &&
      !areSelectionIdListsEqual(currentSelection, expectedSelection);

    if (hasSelectionMismatch) {
      logCanvasBoxFlow("selection", "predrag:visual-selection-clear-skipped", {
        source: options?.source || "stage-composer",
        reason: options?.reason || "selection-mismatch",
        selectedIds: buildCanvasBoxFlowIdsDigest(currentSelection),
        expectedSelectionIds: buildCanvasBoxFlowIdsDigest(expectedSelection),
      }, {
        identity: resolveSelectionBoxFlowIdentity(null, currentSelection),
      });
      return false;
    }

    if (
      currentSelection.length > 0 ||
      isPredragVisualSelectionActive
    ) {
      logCanvasBoxFlow("selection", "predrag:visual-selection-clear", {
        source: options?.source || "stage-composer",
        selectedIds: buildCanvasBoxFlowIdsDigest(currentSelection),
        predragActive: Boolean(isPredragVisualSelectionActive),
        reason: options?.reason || null,
      }, {
        identity: resolveSelectionBoxFlowIdentity(null, currentSelection),
        flushSummaryKeys: ["selection-drag-move"],
        flushReason: options?.reason || "predrag-visual-selection-clear",
      });
    }
    clearControlledDragOverlayBounds(
      options?.reason ||
      (isPredragVisualSelectionActive ? "predrag-cancelled" : "overlay-hidden")
    );
    resetDragOverlayStartupGate(null);
    resetDragOverlayStartupState(null);
    setIsPredragVisualSelectionActive((current) => (current ? false : current));
    dragVisualSelectionIdsRef.current = [];
    setDragVisualSelectionRuntime(
      {
        ids: [],
        predragActive: false,
        sessionKey: null,
        dragId: null,
      },
      {
        source: "drag-visual-selection:clear",
      }
    );
    setDragVisualSelectionIds((current) => (
      Array.isArray(current) && current.length === 0 ? current : []
    ));
    return true;
  }, [
    clearControlledDragOverlayBounds,
    isPredragVisualSelectionActive,
    resetDragOverlayStartupGate,
    resetDragOverlayStartupState,
    resolveSelectionBoxFlowIdentity,
    setDragVisualSelectionRuntime,
  ]);

  const getPostDragSelectionSnapshots = useCallback(() => {
    const selectionFromState = sanitizeSelectionIds(elementosSeleccionados);
    const runtimeSelection = sanitizeSelectionIds(
      readSelectionRuntimeSnapshot()?.selectedIds
    );
    const effectiveSelection =
      runtimeSelection.length > 0 ? runtimeSelection : selectionFromState;

    return {
      selectionFromState,
      selectionFromWindow: runtimeSelection,
      effectiveSelection,
    };
  }, [elementosSeleccionados, readSelectionRuntimeSnapshot]);

  const resolveDragSettleOutcome = useCallback((session) => {
    const safeSession =
      session && session.dragId
        ? session
        : createEmptyDragSettleSession();
    const outcome = {
      dragId: safeSession.dragId || null,
      tipo: safeSession.tipo || null,
      interactionEpoch: Number(safeSession.interactionEpoch || 0),
      committedDeferredSelection: false,
      restoredSelectionAfterDrag: false,
      clearedVisualSelection: false,
      deferredVisualSelectionCleanup: false,
      visualSelectionMatchesSession: false,
      cleanedGuides: false,
      selectionSnapshotFromState: [],
      selectionSnapshotFromWindow: [],
      currentSelectionSnapshot: [],
      nextSelectionSnapshot: [],
      expectedVisualSelectionSnapshot: [],
      visualSelectionSnapshot: [],
      hasWork: false,
    };

    if (!safeSession.dragId) {
      dragSettleSessionRef.current = createEmptyDragSettleSession();
      setPendingDragSelectionRuntime(null, {
        source: "drag-settle:empty-session",
      });
      return outcome;
    }

    setPendingDragSelectionRuntime(null, {
      source: "drag-settle:resolve-outcome",
    });

    const {
      selectionFromState,
      selectionFromWindow,
      effectiveSelection,
    } = getPostDragSelectionSnapshots();
    outcome.selectionSnapshotFromState = [...selectionFromState];
    outcome.selectionSnapshotFromWindow = [...selectionFromWindow];
    outcome.currentSelectionSnapshot = [...effectiveSelection];

    let nextSelectionSnapshot = [...effectiveSelection];

    if (safeSession.needsDeferredCommit) {
      if (!(effectiveSelection.length === 1 && effectiveSelection[0] === safeSession.dragId)) {
        outcome.committedDeferredSelection = true;
        nextSelectionSnapshot = [safeSession.dragId];
        setCommittedSelectionRuntime(nextSelectionSnapshot, {
          source: "drag-settle:deferred-commit",
        });
      }
    } else if (safeSession.startedSelected) {
      if (!effectiveSelection.includes(safeSession.dragId)) {
        outcome.restoredSelectionAfterDrag = true;
        nextSelectionSnapshot =
          safeSession.selectionSnapshot.length > 0
            ? sanitizeSelectionIds(safeSession.selectionSnapshot)
            : [safeSession.dragId];
        setCommittedSelectionRuntime(nextSelectionSnapshot, {
          source: "drag-settle:restore-selection",
        });
      }
    }
    outcome.nextSelectionSnapshot = [...nextSelectionSnapshot];

    const expectedVisualSelectionSnapshot = sanitizeSelectionIds(
      safeSession.overlaySelectionSnapshot
    );
    const visualSelectionSnapshot = sanitizeSelectionIds(
      dragVisualSelectionIdsRef.current
    );
    const visualSelectionMatchesSession =
      expectedVisualSelectionSnapshot.length === 0
        ? visualSelectionSnapshot.length === 0
        : areSelectionIdListsEqual(
            visualSelectionSnapshot,
            expectedVisualSelectionSnapshot
          );
    outcome.expectedVisualSelectionSnapshot = [...expectedVisualSelectionSnapshot];
    outcome.visualSelectionSnapshot = [...visualSelectionSnapshot];
    outcome.visualSelectionMatchesSession = visualSelectionMatchesSession;
    outcome.deferredVisualSelectionCleanup = Boolean(
      safeSession.hadVisualSelection &&
      visualSelectionSnapshot.length > 0 &&
      visualSelectionMatchesSession
    );

    const hasGuideCleanupWork =
      safeSession.needsGuideCleanup &&
      (
        Boolean(guideDragFrameRef.current?.payload) ||
        (guideOverlayRef?.current?.getGuideLinesCount?.() || 0) > 0
      );
    if (hasGuideCleanupWork) {
      outcome.cleanedGuides = true;
      cancelScheduledGuideEvaluation();
      limpiarGuias?.();
      configurarDragEnd([]);
    }

    outcome.hasWork = Boolean(
      outcome.committedDeferredSelection ||
      outcome.restoredSelectionAfterDrag ||
      outcome.deferredVisualSelectionCleanup ||
      (
        safeSession.hadVisualSelection &&
        outcome.visualSelectionSnapshot.length > 0 &&
        !outcome.visualSelectionMatchesSession
      ) ||
      outcome.cleanedGuides
    );

    dragSettleSessionRef.current = createEmptyDragSettleSession();
    return outcome;
  }, [
    cancelScheduledGuideEvaluation,
    configurarDragEnd,
    getPostDragSelectionSnapshots,
    guideOverlayRef,
    limpiarGuias,
    setCommittedSelectionRuntime,
    setPendingDragSelectionRuntime,
  ]);

  const beginCanvasDragGesture = useCallback((dragId, tipo = null) => {
    clearHoverForInteractionBoundary({
      dragId,
      source: "drag-start-clear",
      reason: "drag-active",
      targetType: tipo || null,
    });

    return beginCanvasInteraction("drag", {
      dragId,
      tipo,
      source: "canvas-object",
    });
  }, [beginCanvasInteraction, clearHoverForInteractionBoundary]);

  const queuePostDragUiRefresh = useCallback((dragId, tipo = null, source = "element-drag-end") => {
    publishCountdownRuntimeDebug("composer:post-drag-ui-refresh:scheduled", {
      dragId,
      tipo,
      source,
      sessionSnapshot: dragSettleSessionRef.current || null,
    });
    const runPostDragUi = () => {
      const session = dragSettleSessionRef.current;
      if (!session?.dragId || session.dragId !== dragId) {
        setPendingDragSelectionRuntime(null, {
          source: "post-drag-ui:missing-session",
        });
        dragSettleSessionRef.current = createEmptyDragSettleSession();
        publishCountdownRuntimeDebug("composer:post-drag-ui-refresh:skipped", {
          dragId,
          tipo,
          source,
          reason: "missing-or-mismatched-session",
          sessionSnapshot: session || null,
        });
        return;
      }

      const outcome = resolveDragSettleOutcome(session);
      if (outcome.deferredVisualSelectionCleanup) {
        outcome.clearedVisualSelection = clearDragVisualSelection({
          source: "post-drag-ui-refresh",
          reason: "post-drag-ui-refresh",
          expectedSelectionIds: outcome.expectedVisualSelectionSnapshot,
        }) === true;
      }
      if (!outcome.hasWork) {
        publishCountdownRuntimeDebug("composer:post-drag-ui-refresh:no-work", {
          dragId,
          tipo,
          source,
          outcome,
        });
        return;
      }

      publishCountdownRuntimeDebug("composer:post-drag-ui-refresh", {
        dragId,
        tipo,
        source,
        outcome,
      });

      logSelectedDragDebug("selection:post-drag-ui-refresh", {
        elementId: dragId,
        tipo,
        source,
        interactionEpoch: outcome.interactionEpoch,
        committedDeferredSelection: outcome.committedDeferredSelection,
        restoredSelectionAfterDrag: outcome.restoredSelectionAfterDrag,
        clearedVisualSelection: outcome.clearedVisualSelection,
        deferredVisualSelectionCleanup: outcome.deferredVisualSelectionCleanup,
        visualSelectionMatchesSession: outcome.visualSelectionMatchesSession,
        cleanedGuides: outcome.cleanedGuides,
        selectionSnapshotFromState: outcome.selectionSnapshotFromState,
        selectionSnapshotFromWindow: outcome.selectionSnapshotFromWindow,
        currentSelectionSnapshot: outcome.currentSelectionSnapshot,
        nextSelectionSnapshot: outcome.nextSelectionSnapshot,
        expectedVisualSelectionSnapshot: outcome.expectedVisualSelectionSnapshot,
        visualSelectionSnapshot: outcome.visualSelectionSnapshot,
        selectedIdsFromWindow:
          runtimeSelectedIds.length > 0
            ? [...runtimeSelectedIds]
            : [...elementosSeleccionados],
        globalDragging:
          typeof window !== "undefined" ? Boolean(window._isDragging) : false,
        canvasInteractionEpoch,
      });
    };

    const taskKey = `post-drag-ui:${source}:${dragId}`;
    if (typeof scheduleCanvasUiAfterSettle === "function") {
      scheduleCanvasUiAfterSettle(taskKey, runPostDragUi);
      return;
    }

    requestAnimationFrame(runPostDragUi);
  }, [
    canvasInteractionEpoch,
    clearDragVisualSelection,
    elementosSeleccionados,
    publishCountdownRuntimeDebug,
    resolveDragSettleOutcome,
    scheduleCanvasUiAfterSettle,
  ]);

  useEffect(() => {
    if (dragVisualSelectionIds.length === 0) return;
    if (isPredragVisualSelectionActive) return;
    if (isAnyCanvasDragActive || canvasInteractionActive || canvasInteractionSettling) {
      return;
    }
    if (dragSettleSessionRef.current?.dragId) {
      return;
    }

    const selectionFromState = sanitizeSelectionIds(elementosSeleccionados);
    const selectionFromWindow = sanitizeSelectionIds(
      runtimeSelectionSnapshot?.selectedIds
    );

    logSelectedDragDebug("selection:drag-visual-cleanup", {
      source: "idle-handoff",
      visualSelectionSnapshot: [...dragVisualSelectionIds],
      selectedIdsFromState: selectionFromState,
      selectedIdsFromWindow: selectionFromWindow,
      sameAsState: areSelectionIdListsEqual(dragVisualSelectionIds, selectionFromState),
      sameAsWindow: areSelectionIdListsEqual(dragVisualSelectionIds, selectionFromWindow),
    });
    logCanvasBoxFlow("selection", "predrag:visual-selection-cleanup", {
      source: "idle-handoff",
      visualSelectionSnapshot: buildCanvasBoxFlowIdsDigest(dragVisualSelectionIds),
      selectedIdsFromState: buildCanvasBoxFlowIdsDigest(selectionFromState),
      selectedIdsFromWindow: buildCanvasBoxFlowIdsDigest(selectionFromWindow),
      sameAsState: areSelectionIdListsEqual(dragVisualSelectionIds, selectionFromState),
      sameAsWindow: areSelectionIdListsEqual(dragVisualSelectionIds, selectionFromWindow),
    }, {
      identity: resolveSelectionBoxFlowIdentity(null, dragVisualSelectionIds),
      flushSummaryKeys: ["selection-drag-move"],
      flushReason: "idle-handoff",
    });

    clearDragVisualSelection();
  }, [
    canvasInteractionActive,
    canvasInteractionSettling,
    clearDragVisualSelection,
    dragVisualSelectionIds,
    elementosSeleccionados,
    isAnyCanvasDragActive,
    isPredragVisualSelectionActive,
    resolveSelectionBoxFlowIdentity,
    runtimeSelectedIds,
    runtimeSelectionSnapshot,
  ]);

  const logInlineIntent = useCallback((eventName, payload = {}) => {
    if (!isInlineIntentDebugEnabled()) return;
    if (isInlineDiagCompactEnabled()) {
      const compactEvents = new Set([
        "gate-start-inline",
        "inline-opening-arm",
        "start-inline-font-ready",
        "start-inline-commit",
      ]);
      if (!compactEvents.has(eventName)) return;
    }
    console.log(`[INLINE-INTENT] ${eventName}`, {
      ts: new Date().toISOString(),
      ...payload,
    });
  }, []);

  const clearInlineActivation = useCallback((reason, extra = {}) => {
    const previous = inlineActivationRef.current || {};
    if (previous.openingId || isInlineIntentDebugEnabled()) {
      logInlineIntent("inline-opening-clear", {
        reason,
        previousOpeningId: previous.openingId || null,
        previousOpeningAtMs: Number.isFinite(previous.openingAtMs)
          ? previous.openingAtMs
          : null,
        ...extra,
      });
    }
    inlineActivationRef.current = {
      openingId: null,
      openingAtMs: 0,
    };
  }, [logInlineIntent]);

  const armInlineActivation = useCallback((id, reason, extra = {}) => {
    if (!id) return;
    const next = {
      openingId: id,
      openingAtMs: Date.now(),
    };
    inlineActivationRef.current = next;
    logInlineIntent("inline-opening-arm", {
      reason,
      openingId: id,
      openingAtMs: next.openingAtMs,
      ...extra,
    });
  }, [logInlineIntent]);

  const clearInlineIntent = useCallback((reason, extra = {}) => {
    const previous = inlineIntentRef.current || {};
    if (previous.candidateId || isInlineIntentDebugEnabled()) {
      logInlineIntent("intent-clear", {
        reason,
        previousCandidateId: previous.candidateId || null,
        previousArmedAtMs: Number.isFinite(previous.armedAtMs)
          ? previous.armedAtMs
          : null,
        ...extra,
      });
    }
    inlineIntentRef.current = {
      candidateId: null,
      armedAtMs: 0,
    };
  }, [logInlineIntent]);

  const armInlineIntent = useCallback((id, reason, extra = {}) => {
    if (!id) return;
    const next = {
      candidateId: id,
      armedAtMs: Date.now(),
    };
    inlineIntentRef.current = next;
    logInlineIntent("intent-arm", {
      reason,
      candidateId: id,
      armedAtMs: next.armedAtMs,
      ...extra,
    });
  }, [logInlineIntent]);

  const isIntentFresh = useCallback((intent, nowMs = Date.now()) => {
    if (!intent?.candidateId) return false;
    if (!Number.isFinite(Number(intent.armedAtMs))) return false;
    return nowMs - Number(intent.armedAtMs) <= INLINE_INTENT_STALE_MS;
  }, []);

  const isInlineSemanticContextValid = useCallback(({ obj, event }) => {
    if (!isSemanticInlineEditableObject(obj)) return false;

    const nativeEvent = event?.evt || null;
    const runtimeInteraction = getRuntimeInteractionState();
    const hasDisallowedModifiers =
      Boolean(nativeEvent?.ctrlKey) ||
      Boolean(nativeEvent?.metaKey) ||
      Boolean(nativeEvent?.altKey);
    if (hasDisallowedModifiers) return false;
    if (Boolean(nativeEvent?.shiftKey)) return false;

    if (seleccionActiva) return false;
    if (runtimeInteraction.dragging || isDragging) return false;
    if (runtimeInteraction.resizing) return false;
    if (hasDragged?.current) return false;

    return true;
  }, [hasDragged, isDragging, seleccionActiva]);

  const startInlineFromDecision = useCallback(async ({
    id,
    targetObj,
    sourceGesture = "primary",
    sourceReason = null,
    sourceClientPoint = null,
  }) => {
    if (!id || !targetObj) return;

    const initialText = String(
      targetObj?.texto ??
        getFunctionalCtaDefaultText(targetObj)
    );

    armInlineActivation(id, "start-inline-decision", {
      sourceGesture,
      sourceReason: sourceReason || null,
    });

    const startAttempt = Number(pendingInlineStartRef.current || 0) + 1;
    pendingInlineStartRef.current = startAttempt;

    const fontWait = await ensureInlineFontReady(targetObj?.fontFamily);
    if (pendingInlineStartRef.current !== startAttempt) {
      clearInlineActivation("start-inline-stale-attempt", {
        id,
        startAttempt,
        pendingAttempt: Number(pendingInlineStartRef.current || 0),
        sourceGesture,
        sourceReason: sourceReason || null,
      });
      return;
    }

    inlineDebugLog("start-inline-font-ready", {
      id,
      objectFontFamily: targetObj?.fontFamily ?? null,
      sourceGesture,
      ...fontWait,
    });
    logInlineIntent("start-inline-font-ready", {
      id,
      sourceGesture,
      sourceReason: sourceReason || null,
      waited: fontWait?.waited ?? null,
      ready: fontWait?.ready ?? null,
    });

    const node = elementRefs.current[id];
    const nodeMetrics = obtenerMetricasNodoInline(node);
    const shouldKeepCenterXDuringEdit =
      shouldPreserveTextCenterPosition(targetObj);
    const centerXLock = shouldKeepCenterXDuringEdit
      ? obtenerCentroVisualTextoX(targetObj, node)
      : null;
    const previousCurrentEditingId = getCurrentInlineEditingId();
    setInlineOverlayMountedId(null);
    setInlineOverlayMountSession((prev) => ({
      id: null,
      sessionId: null,
      mounted: false,
      swapCommitted: false,
      phase: "reset",
      token: Number(prev?.token || 0) + 1,
      offsetY: 0,
      offsetRevision: null,
      offsetSource: null,
      offsetSpace: "content-ink",
      renderAuthority: "konva",
      caretVisible: false,
      paintStable: false,
    }));
    setInlineSwapAck((prev) => ({
      id: null,
      sessionId: null,
      phase: "reset",
      token: Number(prev?.token || 0) + 1,
      offsetY: 0,
      offsetRevision: null,
      offsetSource: null,
      offsetSpace: "content-ink",
      renderAuthority: "konva",
      caretVisible: false,
      paintStable: false,
    }));
    captureInlineSnapshot("enter: pre-start", {
      id,
      previousId: previousCurrentEditingId,
      textoLength: initialText.length,
    });
    setCurrentInlineEditingId(id);
    inlineEditPreviewRef.current = {
      id: shouldKeepCenterXDuringEdit ? id : null,
      centerX: Number.isFinite(centerXLock) ? centerXLock : null,
    };
    inlineDebugLog("start-inline-edit", {
      id,
      textoLength: initialText.length,
      objectX: targetObj?.x ?? null,
      objectY: targetObj?.y ?? null,
      shouldKeepCenterXDuringEdit,
      centerXLock,
      previousCurrentEditingId,
      nextCurrentEditingId: getCurrentInlineEditingId(),
      sourceGesture,
      nodeMetrics,
    });
    logInlineIntent("start-inline-commit", {
      id,
      sourceGesture,
      sourceReason: sourceReason || null,
      previousCurrentEditingId: previousCurrentEditingId || null,
    });

    startEdit(id, initialText, {
      initialCaretClientPoint: sourceClientPoint,
      entrySelectionMode: INLINE_ENTRY_SELECTION_MODE_SELECT_ALL,
    });
    node?.draggable(false);
    node?.getLayer?.()?.batchDraw?.();
    captureInlineSnapshot("enter: after-start-sync", {
      id,
      previousId: previousCurrentEditingId,
      nextCurrentEditingId: getCurrentInlineEditingId(),
      requestedCaretClientX: Number.isFinite(Number(sourceClientPoint?.clientX))
        ? Number(sourceClientPoint.clientX)
        : null,
      requestedCaretClientY: Number.isFinite(Number(sourceClientPoint?.clientY))
        ? Number(sourceClientPoint.clientY)
        : null,
    });
    captureInlineSnapshot("overlay: before-mount", {
      id,
      source: "start-inline-edit",
    });
  }, [
    armInlineActivation,
    captureInlineSnapshot,
    clearInlineActivation,
    elementRefs,
    ensureInlineFontReady,
    inlineDebugLog,
    inlineEditPreviewRef,
    obtenerCentroVisualTextoX,
    obtenerMetricasNodoInline,
    pendingInlineStartRef,
    setInlineOverlayMountedId,
    setInlineOverlayMountSession,
    setInlineSwapAck,
    startEdit,
    logInlineIntent,
  ]);

  const decideInlineIntent = useCallback(({
    id,
    obj,
    event,
    meta,
    selectionSnapshot,
  }) => {
    const gesture = meta?.gesture === "double" ? "double" : "primary";
    const nativeEvent = event?.evt || null;
    const shift = Boolean(nativeEvent?.shiftKey);
    const nowMs = Date.now();
    const intent = inlineIntentRef.current || {};
    const sameCandidate = intent.candidateId === id;
    const intentFresh = sameCandidate && isIntentFresh(intent, nowMs);
    const supportsSemanticInline = isSemanticInlineEditableObject(obj);
    const supportsLegacyDoubleInline = isLegacyDoubleInlineEditableObject(obj);
    const semanticValid = isInlineSemanticContextValid({ obj, event });
    const runtimeInteraction = getRuntimeInteractionState();
    const selectionOrigin = meta?.selectionOrigin === "press" ? "press" : "gesture";
    const allowSameGestureDragRequested =
      selectionOrigin === "press" &&
      meta?.allowSameGestureDrag === true &&
      gesture === "primary" &&
      !shift;
    const selectionIsSingleSame =
      Array.isArray(selectionSnapshot) &&
      selectionSnapshot.length === 1 &&
      selectionSnapshot[0] === id;
    const selectionHasConflict =
      Array.isArray(selectionSnapshot) &&
      selectionSnapshot.length > 0 &&
      !selectionSnapshot.includes(id);
    const selectionAllowsInline = !selectionHasConflict;
    const canStartBySemanticSelection =
      supportsSemanticInline &&
      semanticValid &&
      selectionIsSingleSame &&
      selectionAllowsInline;
    const canStartByFreshCandidateFallback =
      supportsSemanticInline &&
      semanticValid &&
      sameCandidate &&
      intentFresh &&
      selectionAllowsInline;

    logInlineIntent("gate-input", {
      id,
      gesture,
      shift,
      editingId: editing.id || null,
      candidateId: intent.candidateId || null,
      intentArmedAtMs: Number.isFinite(intent.armedAtMs) ? intent.armedAtMs : null,
      intentFresh,
      semanticValid,
      selectionSnapshot,
      selectionIsSingleSame,
      selectionHasConflict,
      selectionAllowsInline,
      selectionOrigin,
      allowSameGestureDragRequested,
      dragging: runtimeInteraction.dragging || Boolean(isDragging),
      resizing: runtimeInteraction.resizing,
      seleccionActiva: Boolean(seleccionActiva),
      supportsSemanticInline,
      supportsLegacyDoubleInline,
      canStartBySemanticSelection,
      canStartByFreshCandidateFallback,
    });

    if (shift) {
      return { decision: "multiselect_toggle", gesture };
    }

    if (!supportsSemanticInline && !supportsLegacyDoubleInline) {
      return {
        decision: allowSameGestureDragRequested ? "select_and_drag" : "select_only",
        gesture,
        reason: allowSameGestureDragRequested
          ? "press-select-drag-non-inline-target"
          : "non-inline-target",
      };
    }

    if (!semanticValid && !(supportsLegacyDoubleInline && gesture === "double")) {
      return { decision: "ignore", gesture };
    }

    if (canStartBySemanticSelection) {
      return {
        decision: "start_inline",
        gesture,
        reason: "semantic-selected-same-id",
      };
    }

    if (canStartByFreshCandidateFallback) {
      return {
        decision: "start_inline",
        gesture,
        reason: "fresh-candidate-fallback",
      };
    }

    if (supportsLegacyDoubleInline && gesture === "double") {
      return {
        decision: "start_inline",
        gesture,
        reason: "legacy-double",
      };
    }

    return {
      decision: allowSameGestureDragRequested ? "select_and_drag" : "select_only",
      gesture,
      reason: allowSameGestureDragRequested
        ? "press-select-drag"
        : "select-first-gesture",
    };
  }, [
    editing.id,
    isDragging,
    isInlineSemanticContextValid,
    isIntentFresh,
    logInlineIntent,
    seleccionActiva,
  ]);

  const applyInlineIntentDecision = useCallback(({
    id,
    obj,
    event,
    decision,
    gesture,
    reason = null,
  }) => {
    const targetSupportsInline =
      isSemanticInlineEditableObject(obj) || isLegacyDoubleInlineEditableObject(obj);

    if (editing.id && (editing.id !== id || !targetSupportsInline)) {
      const previousEditingId = editing.id;
      const finishHandled =
        typeof requestInlineEditFinish === "function"
          ? requestInlineEditFinish("selection-change")
          : false;
      if (!finishHandled) {
        finishEdit();
        restoreElementDrag(previousEditingId);
      }
      clearInlineIntent("editing-finished-by-selection", {
        clickedId: id,
        previousEditingId,
      });
    }

    event && (event.cancelBubble = true);
    event?.evt && (event.evt.cancelBubble = true);

    if (decision === "ignore") {
      logInlineIntent("gate-ignore", { id, gesture, reason: reason || null });
      emitInlineFocusRcaEvent("intent-ignore", {
        editingId: id,
        extra: {
          gesture,
          decision,
          reason: reason || null,
        },
      });
      return;
    }

    if (decision === "multiselect_toggle") {
      toggleCommittedSelectionRuntime(id, {
        source: "inline-intent:multiselect-toggle",
      });
      setPendingDragSelectionRuntime(null, {
        source: "inline-intent:multiselect-toggle",
      });
      clearInlineIntent("multiselect-toggle", { id, gesture });
      emitInlineFocusRcaEvent("intent-multiselect-toggle", {
        editingId: id,
        extra: {
          gesture,
          decision,
          reason: reason || null,
        },
      });
      return { decision };
    }

    if (decision === "select_only" || decision === "select_and_drag") {
      const nextSelection = [id];
      setCommittedSelectionRuntime(nextSelection, {
        source: `inline-intent:${decision}`,
      });
      setPendingDragSelectionRuntime(
        decision === "select_and_drag"
          ? {
              id,
              phase: "predrag",
            }
          : null,
        {
          source: `inline-intent:${decision}`,
        }
      );
      if (isSemanticInlineEditableObject(obj)) {
        armInlineIntent(id, "first-valid-selection", { gesture });
      } else {
        clearInlineIntent("non-inline-selection", { id, gesture });
      }
      logInlineIntent(
        decision === "select_and_drag" ? "gate-select-and-drag" : "gate-select-only",
        { id, gesture, reason: reason || null }
      );
      emitInlineFocusRcaEvent(
        decision === "select_and_drag" ? "intent-select-and-drag" : "intent-select-only",
        {
          editingId: id,
          extra: {
            gesture,
            decision,
            reason: reason || null,
          },
        }
      );
      return {
        decision,
        selectionIds: nextSelection,
        allowSameGestureDrag: decision === "select_and_drag",
      };
    }

    if (decision === "start_inline") {
      setCommittedSelectionRuntime([id], {
        source: "inline-intent:start-inline",
      });
      setPendingDragSelectionRuntime(null, {
        source: "inline-intent:start-inline",
      });
      clearInlineIntent("start-inline", { id, gesture });
      logInlineIntent("gate-start-inline", {
        id,
        gesture,
        reason: reason || null,
      });
      emitInlineFocusRcaEvent("intent-start-inline", {
        editingId: id,
        extra: {
          gesture,
          decision,
          reason: reason || null,
        },
      });
      startInlineFromDecision({
        id,
        targetObj: obj,
        sourceGesture: gesture,
        sourceReason: reason || null,
        sourceClientPoint: readClientPointFromCanvasEvent(
          event,
          stageRef.current?.getStage?.() || stageRef.current || null
        ),
      });
      return { decision };
    }
  }, [
    armInlineIntent,
    clearInlineIntent,
    editing.id,
    finishEdit,
    logInlineIntent,
    requestInlineEditFinish,
    restoreElementDrag,
    setCommittedSelectionRuntime,
    setPendingDragSelectionRuntime,
    stageRef,
    startInlineFromDecision,
    toggleCommittedSelectionRuntime,
  ]);

  const handleElementSelectIntent = useCallback((id, obj, event, meta = {}) => {
    const gesture = meta?.gesture === "double" ? "double" : "primary";
    const opening = inlineActivationRef.current || {};
    const openingId = opening.openingId || null;
    if (openingId && openingId !== id) {
      clearInlineActivation("opening-replaced-by-other-target", {
        openingId,
        clickedId: id,
        gesture,
      });
    }

    const isInlineOpenOrOpeningSameId =
      openingId === id ||
      (editing.id === id && isSemanticInlineEditableObject(obj));
    if (isInlineOpenOrOpeningSameId) {
      event && (event.cancelBubble = true);
      event?.evt && (event.evt.cancelBubble = true);
      logInlineIntent("gate-ignore-inline-open-or-opening", {
        id,
        gesture,
        openingId,
        editingId: editing.id || null,
      });
      emitInlineFocusRcaEvent("intent-ignore-inline-open-or-opening", {
        editingId: id,
        extra: {
          gesture,
          openingId,
          editingId: editing.id || null,
        },
      });
      return;
    }

    const selectionSnapshot =
      runtimeSelectedIds.length > 0
        ? [...runtimeSelectedIds]
        : [...elementosSeleccionados];
    const decision = decideInlineIntent({
      id,
      obj,
      event,
      meta,
      selectionSnapshot,
    });
    logInlineIntent("selection-intent-decision", {
      id,
      tipo: obj?.tipo || null,
      gesture,
      selectionOrigin: meta?.selectionOrigin || "gesture",
      allowSameGestureDragRequested: meta?.allowSameGestureDrag === true,
      decision: decision?.decision || null,
      reason: decision?.reason || null,
      selectionSnapshot,
      editingId: editing.id || null,
      pointer: getCanvasPointerDebugInfo(event),
    });
    logSelectedDragDebug("selection:intent-decision", {
      elementId: id,
      tipo: obj?.tipo || null,
      gesture,
      selectionOrigin: meta?.selectionOrigin || "gesture",
      allowSameGestureDragRequested: meta?.allowSameGestureDrag === true,
      decision: decision?.decision || null,
      reason: decision?.reason || null,
      selectionSnapshot,
      target: getKonvaNodeDebugInfo(event?.target),
      currentTarget: getKonvaNodeDebugInfo(event?.currentTarget),
      pointer: getCanvasPointerDebugInfo(event),
      editingId: editing.id || null,
    });

    return applyInlineIntentDecision({
      id,
      obj,
      event,
      decision: decision.decision,
      gesture: decision.gesture,
      reason: decision.reason || null,
    });
  }, [
    applyInlineIntentDecision,
    clearInlineActivation,
    decideInlineIntent,
    editing.id,
    elementosSeleccionados,
    runtimeSelectedIds,
  ]);

  const handleSpecialElementSelectIntent = useCallback((id, obj, event) => (
    handleElementSelectIntent(id, obj, event, {
      gesture: "primary",
      selectionOrigin: "gesture",
    })
  ), [handleElementSelectIntent]);

  const selectSectionAndClearInlineIntent = useCallback((sectionId, reason = "section-select") => {
    if (isPostDragSelectionGuardActive()) return;
    clearInlineActivation(reason, {
      sectionId: sectionId || null,
    });
    clearInlineIntent(reason, {
      sectionId: sectionId || null,
    });
    if (typeof onSelectSeccion === "function") {
      onSelectSeccion(sectionId);
    }
  }, [clearInlineActivation, clearInlineIntent, onSelectSeccion]);

  const isInlineIntentElementTarget = useCallback((target) => {
    if (!target || !elementRefs?.current) return false;
    const roots = Object.values(elementRefs.current || {}).filter(Boolean);
    if (roots.length === 0) return false;

    try {
      return Boolean(target.findAncestor?.((node) => roots.includes(node), true));
    } catch {
      return false;
    }
  }, [elementRefs]);

  const requestBackgroundDecorationEdit = useCallback((sectionId, decorationId) => {
    const safeSectionId = String(sectionId || "").trim();
    const safeDecorationId = String(decorationId || "").trim();
    if (!safeSectionId || !safeDecorationId) return;

    if (editing.id) {
      requestInlineEditFinish?.("background-decoration-edit");
    }

    selectSectionAndClearInlineIntent(safeSectionId, "background-decoration-edit");
    if (
      typeof selectionRuntime?.clearPolicy?.prepareForBackgroundDecorationEdit ===
      "function"
    ) {
      selectionRuntime.clearPolicy.prepareForBackgroundDecorationEdit();
    } else {
      clearSelectionStateRuntime({
        clearCommittedSelection: true,
        clearPreselection: true,
        clearMarquee: false,
        clearBackgroundEdit: false,
        clearBackgroundInteraction: false,
        clearPendingDrag: true,
        clearDragVisual: true,
        source: "background-decoration-edit",
      });
    }
    setSectionDecorationEdit((previous) => {
      if (
        previous?.sectionId === safeSectionId &&
        previous?.decorationId === safeDecorationId
      ) {
        return previous;
      }

      return {
        sectionId: safeSectionId,
        decorationId: safeDecorationId,
        overlayReady: false,
      };
    });
  }, [
    clearSelectionStateRuntime,
    editing.id,
    requestInlineEditFinish,
    selectionRuntime,
    selectSectionAndClearInlineIntent,
    setSectionDecorationEdit,
  ]);

  const handleStageMouseDownWithInlineIntent = useCallback((e) => {
    const target = e?.target || null;
    const targetClass = target?.getClassName?.() || null;

    if (isInlineIntentElementTarget(target)) {
      logInlineIntent("preserve-intent-on-element-mousedown", {
        targetClass,
      });
      if (typeof stageGestures?.onMouseDown === "function") {
        stageGestures.onMouseDown(e);
      }
      return;
    }

    clearInlineActivation("canvas-mousedown", {
      targetClass,
    });
    clearInlineIntent("canvas-mousedown", {
      targetClass,
    });
    if (editing.id) {
      requestInlineEditFinish?.("canvas-mousedown");
      return;
    }
    if (typeof stageGestures?.onMouseDown === "function") {
      stageGestures.onMouseDown(e);
    }
  }, [
    clearInlineActivation,
    clearInlineIntent,
    editing.id,
    isInlineIntentElementTarget,
    logInlineIntent,
    requestInlineEditFinish,
    stageGestures,
  ]);

  const handleStageTouchStartWithInlineIntent = useCallback((e) => {
    const target = e?.target || null;
    const targetClass = target?.getClassName?.() || null;

    if (isInlineIntentElementTarget(target)) {
      logInlineIntent("preserve-intent-on-element-touchstart", {
        targetClass,
      });
      if (typeof stageGestures?.onTouchStart === "function") {
        stageGestures.onTouchStart(e);
      }
      return;
    }

    clearInlineActivation("canvas-touchstart", {
      targetClass,
    });
    clearInlineIntent("canvas-touchstart", {
      targetClass,
    });
    if (editing.id) {
      requestInlineEditFinish?.("canvas-touchstart");
      return;
    }
    if (typeof stageGestures?.onTouchStart === "function") {
      stageGestures.onTouchStart(e);
    }
  }, [
    clearInlineActivation,
    clearInlineIntent,
    editing.id,
    isInlineIntentElementTarget,
    logInlineIntent,
    requestInlineEditFinish,
    stageGestures,
  ]);

  const handleTransformInteractionStartWithInlineIntent = useCallback((payload = {}) => {
    const isImageRotateInteraction =
      payload?.isRotate === true &&
      selectedPrimaryObject?.tipo === "imagen" &&
      !selectedPrimaryObject?.esFondo;
    activeTransformInteractionRef.current = {
      isRotate: payload?.isRotate === true,
      activeAnchor: payload?.activeAnchor ?? null,
      pointerType: payload?.pointerType ?? null,
    };
    setIsImageRotateInteractionActive(isImageRotateInteraction);
    clearInlineActivation("transform-start", {
      selected: [...elementosSeleccionados],
    });
    clearInlineIntent("transform-start", {
      selected: [...elementosSeleccionados],
    });
    beginCanvasInteraction("transform", {
      selectedIds: [...elementosSeleccionados],
      isRotate: payload?.isRotate === true,
      activeAnchor: payload?.activeAnchor ?? null,
      pointerType: payload?.pointerType ?? null,
    });
    if (typeof handleTransformInteractionStart === "function") {
      handleTransformInteractionStart(payload);
    }
  }, [
    beginCanvasInteraction,
    clearInlineActivation,
    clearInlineIntent,
    elementosSeleccionados,
    handleTransformInteractionStart,
    selectedPrimaryObject?.esFondo,
    selectedPrimaryObject?.tipo,
  ]);

  const handleTransformInteractionEndWithInlineIntent = useCallback((payload = {}) => {
    clearInlineActivation("transform-end", {
      selected: [...elementosSeleccionados],
    });
    clearInlineIntent("transform-end", {
      selected: [...elementosSeleccionados],
    });
    if (typeof handleTransformInteractionEnd === "function") {
      handleTransformInteractionEnd(payload);
    }
    endCanvasInteraction("transform", {
      selectedIds: [...elementosSeleccionados],
      isRotate: payload?.isRotate === true,
      activeAnchor: payload?.activeAnchor ?? null,
      pointerType: payload?.pointerType ?? null,
    });
    activeTransformInteractionRef.current = {
      isRotate: false,
      activeAnchor: null,
      pointerType: null,
    };
    setIsImageRotateInteractionActive(false);
  }, [
    clearInlineActivation,
    clearInlineIntent,
    elementosSeleccionados,
    endCanvasInteraction,
    handleTransformInteractionEnd,
  ]);

  useEffect(() => {
    if (
      isImageRotateInteractionActive &&
      !(
        activeTransformInteractionRef.current?.isRotate === true &&
        selectedPrimaryObject?.tipo === "imagen" &&
        !selectedPrimaryObject?.esFondo
      )
    ) {
      setIsImageRotateInteractionActive(false);
    }
  }, [
    isImageRotateInteractionActive,
    selectedPrimaryObject?.esFondo,
    selectedPrimaryObject?.tipo,
    elementosSeleccionados.join(","),
  ]);

  const handleImageCropPreview = useCallback((cropAttrs = {}) => {
    if (elementosSeleccionados.length !== 1) return;
    const selectedId = elementosSeleccionados[0];

    setObjetos((prev) => {
      const objIndex = prev.findIndex((obj) => obj.id === selectedId);
      if (objIndex === -1) return prev;

      const current = prev[objIndex];
      if (!current || current.tipo !== "imagen" || current.esFondo) return prev;

      const next = [...prev];
      const nextObject = buildImageCropObjectState({
        current,
        cropAttrs,
        seccionesOrdenadas,
        convertirAbsARel,
        esSeccionPantallaById,
        ALTURA_PANTALLA_EDITOR,
      });
      next[objIndex] = nextObject;
      return next;
    });

    requestAnimationFrame(() => {
      if (typeof actualizarPosicionBotonOpciones === "function") {
        actualizarPosicionBotonOpciones("image-crop-preview");
      }
    });
  }, [
    ALTURA_PANTALLA_EDITOR,
    actualizarPosicionBotonOpciones,
    convertirAbsARel,
    esSeccionPantallaById,
    elementosSeleccionados,
    seccionesOrdenadas,
    setObjetos,
  ]);

  const handleImageCropCommit = useCallback((cropAttrs = {}) => {
    if (elementosSeleccionados.length !== 1) return;
    const selectedId = elementosSeleccionados[0];
    setObjetos((prev) => {
      const objIndex = prev.findIndex((obj) => obj.id === selectedId);
      if (objIndex === -1) return prev;

      const current = prev[objIndex];
      if (!current || current.tipo !== "imagen" || current.esFondo) return prev;

      const next = [...prev];
      const nextObject = buildImageCropObjectState({
        current,
        cropAttrs,
        seccionesOrdenadas,
        convertirAbsARel,
        esSeccionPantallaById,
        ALTURA_PANTALLA_EDITOR,
      });
      next[objIndex] = nextObject;
      return next;
    });

    requestAnimationFrame(() => {
      if (typeof actualizarPosicionBotonOpciones === "function") {
        actualizarPosicionBotonOpciones("image-crop-commit");
      }
    });
  }, [
    ALTURA_PANTALLA_EDITOR,
    actualizarPosicionBotonOpciones,
    convertirAbsARel,
    esSeccionPantallaById,
    elementosSeleccionados,
    seccionesOrdenadas,
    setObjetos,
  ]);

  const handleImageCropInteractionStart = useCallback((payload = {}) => {
    setIsImageCropInteracting(true);
    setHoverId(null, {
      source: "image-crop-interaction-start",
      reason: "transform-interaction",
    });
    handleTransformInteractionStartWithInlineIntent(payload);
  }, [handleTransformInteractionStartWithInlineIntent, setHoverId]);

  const handleImageCropInteractionEnd = useCallback((payload = {}) => {
    setIsImageCropInteracting(false);
    handleTransformInteractionEndWithInlineIntent(payload);
  }, [handleTransformInteractionEndWithInlineIntent]);

  useEffect(() => {
    if (elementosSeleccionados.length !== 1) {
      clearInlineActivation("selection-size-change", {
        selectionCount: elementosSeleccionados.length,
      });
      clearInlineIntent("selection-size-change", {
        selectionCount: elementosSeleccionados.length,
      });
      return;
    }
    const selectedId = elementosSeleccionados[0];
    const currentCandidateId = inlineIntentRef.current?.candidateId;
    if (currentCandidateId && currentCandidateId !== selectedId) {
      clearInlineIntent("selection-id-change", {
        selectedId,
        candidateId: currentCandidateId,
      });
    }
    const currentOpeningId = inlineActivationRef.current?.openingId;
    if (currentOpeningId && currentOpeningId !== selectedId) {
      clearInlineActivation("selection-id-change", {
        selectedId,
        openingId: currentOpeningId,
      });
    }
  }, [clearInlineActivation, clearInlineIntent, elementosSeleccionados]);

  useEffect(() => {
    if (seleccionActiva) {
      clearInlineActivation("marquee-selection-active");
      clearInlineIntent("marquee-selection-active");
    }
  }, [clearInlineActivation, clearInlineIntent, seleccionActiva]);

  useEffect(() => {
    if (editing.id) {
      clearInlineActivation("editing-active", {
        editingId: editing.id,
      });
      clearInlineIntent("editing-active", {
        editingId: editing.id,
      });
    } else {
      clearInlineActivation("editing-finished");
      clearInlineIntent("editing-finished");
    }
  }, [clearInlineActivation, clearInlineIntent, editing.id]);

  useEffect(() => {
    if (editing.id || elementosSeleccionados.length !== 1) {
      setIsImageCropInteracting(false);
      return;
    }

    const selectedObject = objetos.find((obj) => obj.id === elementosSeleccionados[0]);
    if (!selectedObject || selectedObject.tipo !== "imagen" || selectedObject.esFondo) {
      setIsImageCropInteracting(false);
    }
  }, [editing.id, elementosSeleccionados, objetos]);

  const sectionIndexById = useMemo(() => {
    const next = new Map();
    seccionesOrdenadas.forEach((section, index) => {
      if (section?.id) {
        next.set(section.id, index);
      }
    });
    return next;
  }, [seccionesOrdenadas]);

  const resolveObjectStageY = useCallback((objectPreview) => {
    const sectionIndex = sectionIndexById.get(objectPreview?.seccionId);
    const safeSectionIndex = Number.isInteger(sectionIndex) ? sectionIndex : 0;
    const offsetY = calcularOffsetY(seccionesOrdenadas, safeSectionIndex, altoCanvas);
    const yLocal = esSeccionPantallaById(objectPreview?.seccionId)
      ? (
        Number.isFinite(objectPreview?.yNorm)
          ? objectPreview.yNorm * ALTURA_PANTALLA_EDITOR
          : objectPreview?.y
      )
      : objectPreview?.y;

    return (Number.isFinite(yLocal) ? yLocal : 0) + (Number.isFinite(offsetY) ? offsetY : 0);
  }, [
    ALTURA_PANTALLA_EDITOR,
    altoCanvas,
    esSeccionPantallaById,
    sectionIndexById,
    seccionesOrdenadas,
  ]);

  const applyCanonicalDragFinalization = useCallback((objOriginal, dragPatch) => (
    canonicalizeFinalizedDragPatch({
      objOriginal,
      dragPatch,
      seccionesOrdenadas,
      determinarNuevaSeccion,
      convertirAbsARel,
      esSeccionPantallaById,
      ALTURA_PANTALLA_EDITOR,
    })
  ), [
    ALTURA_PANTALLA_EDITOR,
    convertirAbsARel,
    determinarNuevaSeccion,
    esSeccionPantallaById,
    seccionesOrdenadas,
  ]);

  const renderCanvasObject = (obj) => {
    const isInlineEditableObject = obj.tipo === "texto";
    const isInEditMode =
      isInlineEditableObject &&
      editing.id === obj.id &&
      elementosSeleccionados[0] === obj.id;

    if (obj.tipo === "galeria") {
      return (
        <GaleriaKonva
          key={obj.id}
          obj={obj}
          registerRef={registerRef}
          onHover={setHoverIdWhenIdle}
          isSelected={elementosSeleccionados.includes(obj.id)}
          celdaGaleriaActiva={celdaGaleriaActiva}
          onPickCell={(info) => setCeldaGaleriaActiva(info)}
          setCeldaGaleriaActiva={setCeldaGaleriaActiva}
          seccionesOrdenadas={seccionesOrdenadas}
          altoCanvas={altoCanvas}
          ALTURA_PANTALLA_EDITOR={ALTURA_PANTALLA_EDITOR}
          onSelect={(id, e) => handleSpecialElementSelectIntent(id, obj, e)}
          onDragMovePersonalizado={(pos, id) => {
            window._isDragging = true;
            scheduleGuideEvaluation(pos, id);
            logSelectionDragLifecycle("drag:summary", {
              dragId: id,
              tipo: "galeria",
              pos,
              selectedIds: readActiveDragOverlaySelectionIds(
                id,
                runtimeSelectedIds.length > 0
                  ? runtimeSelectedIds
                  : elementosSeleccionados
              ),
              pipeline: "individual",
              source: "gallery-drag-move",
            });
          }}
          onDragStartPersonalizado={(dragId = obj.id) => {
            clearInlineIntent("drag-start", { dragId, tipo: "galeria" });
            const overlaySelectionSnapshot = resolveDragVisualSelectionIds(
              dragId,
              runtimeSelectedIds.length > 0
                ? runtimeSelectedIds
                : elementosSeleccionados
            );
            const interactionEpoch = beginCanvasDragGesture(dragId, "galeria");
            activateDragOverlayBoxFlowSession({
              dragId,
              selectedIds: overlaySelectionSnapshot,
              interactionEpoch,
              phase: "drag",
            });
            startDragSettleSession(
              dragId,
              runtimeSelectedIds.length > 0
                ? runtimeSelectedIds
                : elementosSeleccionados,
              "galeria",
              interactionEpoch,
              {
                overlaySelectionSnapshot,
              }
            );
            beginDragVisualSelection(
              dragId,
              runtimeSelectedIds.length > 0
                ? runtimeSelectedIds
                : elementosSeleccionados
            );
            cancelScheduledGuideEvaluation();
            prepararGuias?.(dragId, objetos, elementRefs);
            logSelectionDragLifecycle("drag:start", {
              dragId,
              tipo: "galeria",
              selectedIds: overlaySelectionSnapshot,
              pipeline: "individual",
              source: "gallery-drag-start",
            });
          }}
          onDragEndPersonalizado={() => {
            cancelScheduledGuideEvaluation();
            const overlaySelectionSnapshot = readActiveDragOverlaySelectionIds(
              obj.id,
              runtimeSelectedIds.length > 0
                ? runtimeSelectedIds
                : sanitizeSelectionIds(elementosSeleccionados)
            );
            logSelectionDragLifecycle("drag:end", {
              dragId: obj.id,
              tipo: "galeria",
              selectedIds: overlaySelectionSnapshot,
              pipeline: "individual",
              source: "gallery-drag-end",
            });
            updateDragOverlayBoxFlowSessionPhase("settling", {
              dragId: obj.id,
              interactionEpoch: dragOverlayBoxFlowSessionRef.current?.interactionEpoch || 0,
            });
            queuePostDragUiRefresh(obj.id, "galeria", "gallery-drag-end");
            endCanvasInteraction("drag", {
              dragId: obj.id,
              tipo: "galeria",
              source: "gallery-drag-end",
            });
          }}
          onChange={(id, nuevo) => {
            setObjetos((prev) => {
              const index = prev.findIndex((o) => o.id === id);
              if (index === -1) return prev;
              const objOriginal = prev[index];
              const updated = [...prev];
              updated[index] = nuevo.finalizoDrag
                ? {
                    ...updated[index],
                    ...applyCanonicalDragFinalization(objOriginal, nuevo),
                  }
                : { ...updated[index], ...nuevo };
              return updated;
            });
          }}
        />
      );
    }

    if (obj.tipo === "countdown") {
      return (
        <CountdownKonva
          key={obj.id}
          obj={obj}
          registerRef={registerRef}
          onHover={setHoverIdWhenIdle}
          isSelected={elementosSeleccionados.includes(obj.id)}
        selectionCount={elementosSeleccionados.length}
        seccionesOrdenadas={seccionesOrdenadas}
        altoCanvas={altoCanvas}
        ALTURA_PANTALLA_EDITOR={ALTURA_PANTALLA_EDITOR}
        selectionRuntime={selectionRuntime}
        onSelect={handleElementSelectIntent}
          onPredragVisualSelectionStart={beginPredragVisualSelection}
          onPredragVisualSelectionCancel={clearDragVisualSelection}
          onDragStartPersonalizado={(dragId = obj.id, _event = null) => {
            const selectionSnapshotFromWindow = sanitizeSelectionIds(
              readSelectionRuntimeSnapshot()?.selectedIds
            );
            const selectionSnapshot =
              selectionSnapshotFromWindow.length > 0
                ? selectionSnapshotFromWindow
                : sanitizeSelectionIds(elementosSeleccionados);
            const overlaySelectionSnapshot = resolveDragVisualSelectionIds(
              dragId,
              selectionSnapshot
            );
            publishCountdownRuntimeDebug("composer:countdown-dragstart-callback", {
              dragId,
              selectedIds: selectionSnapshot,
            });
            clearInlineIntent("drag-start", { dragId, tipo: "countdown" });
            const interactionEpoch = beginCanvasDragGesture(dragId, "countdown");
            activateDragOverlayBoxFlowSession({
              dragId,
              selectedIds: overlaySelectionSnapshot,
              interactionEpoch,
              phase: "drag",
            });
            startDragSettleSession(
              dragId,
              selectionSnapshot,
              "countdown",
              interactionEpoch,
              {
                overlaySelectionSnapshot,
              }
            );
            beginDragVisualSelection(dragId, selectionSnapshot);
            cancelScheduledGuideEvaluation();
            setElementosPreSeleccionados((current) => (
              Array.isArray(current) && current.length === 0 ? current : []
            ));
            prepararGuias?.(dragId, objetos, elementRefs);
            logSelectionDragLifecycle("drag:start", {
              dragId,
              tipo: "countdown",
              selectedIds: overlaySelectionSnapshot,
              pipeline: "individual",
              source: "countdown-drag-start",
            });
          }}
          onDragMovePersonalizado={(pos, id) => {
            publishCountdownRuntimeDebug("composer:countdown-dragmove-callback", {
              dragId: id,
              x: Number(pos?.x ?? null),
              y: Number(pos?.y ?? null),
            });
            scheduleGuideEvaluation(pos, id);
            logSelectionDragLifecycle("drag:summary", {
              dragId: id,
              tipo: "countdown",
              pos,
              selectedIds: readActiveDragOverlaySelectionIds(
                id,
                runtimeSelectedIds.length > 0
                  ? runtimeSelectedIds
                  : sanitizeSelectionIds(elementosSeleccionados)
              ),
              pipeline: "individual",
              source: "countdown-drag-move",
            });
          }}
          onDragEndPersonalizado={() => {
            const overlaySelectionSnapshot = readActiveDragOverlaySelectionIds(
              obj.id,
              runtimeSelectedIds.length > 0
                ? runtimeSelectedIds
                : sanitizeSelectionIds(elementosSeleccionados)
            );
            publishCountdownRuntimeDebug("composer:countdown-dragend-callback", {
              dragId: obj.id,
              selectedIds: overlaySelectionSnapshot,
            });
            cancelScheduledGuideEvaluation();
            logSelectionDragLifecycle("drag:end", {
              dragId: obj.id,
              tipo: "countdown",
              selectedIds: overlaySelectionSnapshot,
              pipeline: "individual",
              source: "countdown-drag-end",
            });
            updateDragOverlayBoxFlowSessionPhase("settling", {
              dragId: obj.id,
              interactionEpoch: dragOverlayBoxFlowSessionRef.current?.interactionEpoch || 0,
            });
            queuePostDragUiRefresh(obj.id, "countdown", "countdown-drag-end");
            endCanvasInteraction("drag", {
              dragId: obj.id,
              tipo: "countdown",
              source: "countdown-drag-end",
            });
          }}
          dragStartPos={dragStartPos}
          hasDragged={hasDragged}
          onChange={(id, cambios) => {
            setObjetos((prev) => {
              const index = prev.findIndex((o) => o.id === id);
              if (index === -1) return prev;

              const objOriginal = prev[index];

              if (!cambios.finalizoDrag) {
                const updated = [...prev];
                updated[index] = { ...updated[index], ...cambios };
                return updated;
              }

              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                ...applyCanonicalDragFinalization(objOriginal, cambios),
              };
              return updated;
            });
          }}
        />
      );
    }

    const supportsInlinePreview = isSemanticInlineEditableObject(obj);
    const objPreview =
      editing.id === obj.id && supportsInlinePreview
        ? (() => {
          const textoPreview = String(editing.value ?? "");
          const textoOriginal = String(obj.texto ?? "");
          const hasPreviewTextChanged = textoPreview !== textoOriginal;
          const previewObj = hasPreviewTextChanged
            ? { ...obj, texto: textoPreview }
            : obj;
          const shouldKeepCenterPreview = shouldPreserveTextCenterPosition(obj);

          if (shouldKeepCenterPreview && hasPreviewTextChanged) {
            const lockedCenterX =
              inlineEditPreviewRef.current?.id === obj.id &&
              Number.isFinite(inlineEditPreviewRef.current?.centerX)
                ? inlineEditPreviewRef.current.centerX
                : null;
            const previewX = calcularXTextoCentrado(
              obj,
              textoPreview,
              lockedCenterX
            );
            if (Number.isFinite(previewX)) {
              previewObj.x = previewX;
            }
          }

          return previewObj;
        })()
        : obj;

    return (
      <ElementoCanvas
        key={obj.id}
        obj={{
          ...objPreview,
          y: resolveObjectStageY(objPreview),
        }}
        anchoCanvas={800}
        isSelected={!isInEditMode && elementosSeleccionados.includes(obj.id)}
        selectionCount={elementosSeleccionados.length}
        preSeleccionado={!isInEditMode && elementosPreSeleccionados.includes(obj.id)}
        isInEditMode={isInEditMode}
        onHover={isInEditMode ? null : setHoverIdWhenIdle}
        registerRef={registerRef}
        selectionRuntime={selectionRuntime}
        editingId={editing.id}
        inlineOverlayMountedId={inlineOverlayMountedId}
        inlineOverlayMountSession={inlineOverlayMountSession}
        inlineVisibilityMode={inlineDebugAB.visibilitySource}
        inlineOverlayEngine={inlineDebugAB.overlayEngine}
        finishInlineEdit={finishEdit}
        onInlineEditPointer={
          isInEditMode ? onInlineEditCanvasPointer : null
        }
        onPredragVisualSelectionStart={beginPredragVisualSelection}
        onPredragVisualSelectionCancel={clearDragVisualSelection}
        onSelect={isInEditMode ? null : handleElementSelectIntent}
        onChange={(id, nuevo) => {
          if (nuevo.isDragPreview) {
            setObjetos((prev) => {
              const index = prev.findIndex((o) => o.id === id);
              if (index === -1) return prev;

              const updated = [...prev];
              const { isDragPreview, skipHistorial, ...cleanNuevo } = nuevo;
              updated[index] = { ...updated[index], ...cleanNuevo };
              return updated;
            });
            return;
          }

          if (nuevo.isBatchUpdateFinal && id === "BATCH_UPDATE_GROUP_FINAL") {
            const { elementos, dragInicial, deltaX, deltaY } = nuevo;

            setObjetos((prev) => {
              return prev.map((objeto) => {
                if (elementos.includes(objeto.id) && dragInicial && dragInicial[objeto.id]) {
                  const posInicial = dragInicial[objeto.id];
                  const node = elementRefs.current?.[objeto.id] || null;
                  const canonicalPose = resolveCanonicalNodePose(node, objeto, {
                    x: posInicial.x + deltaX,
                    y: posInicial.y + deltaY,
                    rotation:
                      typeof node?.rotation === "function"
                        ? node.rotation()
                        : objeto.rotation || 0,
                  });
                  return {
                    ...objeto,
                    x: canonicalPose.x,
                    y: canonicalPose.y,
                  };
                }
                return objeto;
              });
            });
            return;
          }

          if (nuevo.fromTransform) {
            return;
          }

          const objOriginal = objetos.find((o) => o.id === id);
          if (!objOriginal) return;

          if (nuevo.finalizoDrag) {
            const coordenadasFinales = applyCanonicalDragFinalization(objOriginal, nuevo);

            setObjetos((prev) => {
              const index = prev.findIndex((o) => o.id === id);
              if (index === -1) return prev;

              const updated = [...prev];
              updated[index] = { ...updated[index], ...coordenadasFinales };
              return updated;
            });

            return;
          }

          const hayDiferencias = Object.keys(nuevo).some((key) => {
            const valorAnterior = objOriginal[key];
            const valorNuevo = nuevo[key];

            if (typeof valorAnterior === "number" && typeof valorNuevo === "number") {
              return Math.abs(valorAnterior - valorNuevo) > 0.01;
            }

            return valorAnterior !== valorNuevo;
          });

          if (!hayDiferencias) return;

          const seccionId = nuevo.seccionId || objOriginal.seccionId;
          const seccion = seccionesOrdenadas.find((s) => s.id === seccionId);
          if (!seccion) return;

          setObjetos((prev) => {
            const index = prev.findIndex((o) => o.id === id);
            if (index === -1) return prev;

            const updated = [...prev];
            updated[index] = { ...updated[index], ...nuevo };
            return updated;
          });
        }}
        onDragStartPersonalizado={isInEditMode ? null : (dragId = obj.id, _event = null, meta = null) => {
          const isGroupPipeline = meta?.pipeline === "group";
          clearInlineIntent("drag-start", { dragId });
          const interactionEpoch = beginCanvasDragGesture(dragId, obj.tipo || null);
          cancelScheduledGuideEvaluation();
          const selectionSnapshotForLog = resolveDragVisualSelectionIds(
            dragId,
            runtimeSelectedIds.length > 0
              ? runtimeSelectedIds
              : elementosSeleccionados
          );

          if (isGroupPipeline) {
            activateDragOverlayBoxFlowSession({
              dragId,
              selectedIds: selectionSnapshotForLog,
              interactionEpoch,
              phase: "drag",
            });
            syncControlledDragOverlayBounds(selectionSnapshotForLog, {
              dragId,
              source: "group-drag-start",
            });
            logSelectionDragLifecycle("drag:start", {
              dragId,
              tipo: obj.tipo || null,
              selectedIds: selectionSnapshotForLog,
              pipeline: "group",
              source: "group-drag-start",
            });
            return;
          }

          const seleccionActual = runtimeSelectedIds.length > 0
            ? runtimeSelectedIds
            : elementosSeleccionados;
          const overlaySelectionSnapshot = resolveDragVisualSelectionIds(
            dragId,
            seleccionActual
          );
          const preselectedSnapshot = Array.isArray(elementosPreSeleccionados)
            ? [...elementosPreSeleccionados]
            : [];
          const hoverSnapshot = hoverId || null;

          if (typeof window !== "undefined") {
            const nowMs =
              typeof performance !== "undefined" && typeof performance.now === "function"
                ? performance.now()
                : Date.now();
            window.__CANVAS_DRAG_ANALYSIS_UNTIL = nowMs + 900;
          }

          trackCanvasDragPerf("drag:start-context", {
            elementId: dragId,
            tipo: obj.tipo || null,
            selectedSnapshot: Array.isArray(seleccionActual)
              ? seleccionActual.join(",")
              : "",
            wasSelected: Array.isArray(seleccionActual)
              ? seleccionActual.includes(dragId)
              : false,
            hoverId: hoverSnapshot,
            preselectedIds: preselectedSnapshot.join(","),
            preselectedCount: preselectedSnapshot.length,
            activeInlineEditingId: activeInlineEditingId || null,
          }, {
            throttleMs: 40,
            throttleKey: `drag:start-context:${dragId}`,
          });

          startDragSettleSession(
            dragId,
            seleccionActual,
            obj.tipo || null,
            interactionEpoch,
            {
              overlaySelectionSnapshot,
            }
          );
            activateDragOverlayBoxFlowSession({
              dragId,
              selectedIds: overlaySelectionSnapshot,
              interactionEpoch,
              phase: "drag",
            });
          beginDragVisualSelection(dragId, seleccionActual);

          trackCanvasDragPerf("drag:start-ui-cleanup", {
            elementId: dragId,
            tipo: obj.tipo || null,
            hoverBefore: hoverSnapshot,
            willClearHover: false,
            willSuppressHover: hoverSnapshot !== null,
            preselectedBefore: preselectedSnapshot.join(","),
            willClearPreselected: preselectedSnapshot.length > 0,
          }, {
            throttleMs: 40,
            throttleKey: `drag:start-ui-cleanup:${dragId}`,
          });

          setElementosPreSeleccionados((current) => (
            Array.isArray(current) && current.length === 0 ? current : []
          ));
          prepararGuias?.(dragId, objetos, elementRefs);
          logSelectionDragLifecycle("drag:start", {
            dragId,
            tipo: obj.tipo || null,
            selectedIds: overlaySelectionSnapshot,
            pipeline: "individual",
            source: "element-drag-start",
          });
        }}
        onDragEndPersonalizado={isInEditMode ? null : (dragId = obj.id, meta = null) => {
          const isGroupPipeline = meta?.pipeline === "group";
          const overlaySelectionSnapshot = readActiveDragOverlaySelectionIds(
            dragId,
            runtimeSelectedIds.length > 0
              ? runtimeSelectedIds
              : sanitizeSelectionIds(elementosSeleccionados)
          );
          cancelScheduledGuideEvaluation();
          if (!isGroupPipeline) {
            queuePostDragUiRefresh(obj.id, obj.tipo || null, "element-drag-end");
          }
          logSelectionDragLifecycle("drag:end", {
            dragId,
            tipo: obj.tipo || null,
            selectedIds: overlaySelectionSnapshot,
            pipeline: isGroupPipeline ? "group" : "individual",
            source: isGroupPipeline ? "group-drag-end" : "element-drag-end",
          });
          updateDragOverlayBoxFlowSessionPhase("settling", {
            dragId,
            interactionEpoch: dragOverlayBoxFlowSessionRef.current?.interactionEpoch || 0,
          });
          endCanvasInteraction("drag", {
            dragId,
            tipo: obj.tipo || null,
            source: isGroupPipeline ? "group-drag-end" : "element-drag-end",
          });
        }}
        onDragMovePersonalizado={isInEditMode ? null : (pos, elementId, meta = null) => {
          const isGroupPipeline = meta?.pipeline === "group";
          if (!isGroupPipeline) {
            scheduleGuideEvaluation(pos, elementId);
          }
          logSelectionDragLifecycle("drag:summary", {
            dragId: elementId,
            tipo: obj.tipo || null,
            pos,
            selectedIds: readActiveDragOverlaySelectionIds(
              elementId,
              runtimeSelectedIds.length > 0
                ? runtimeSelectedIds
                : sanitizeSelectionIds(elementosSeleccionados)
            ),
            pipeline: isGroupPipeline ? "group" : "individual",
            source: isGroupPipeline ? "group-drag-move" : "element-drag-move",
          });
        }}
        dragLayerRef={dragLayerRef}
        dragStartPos={dragStartPos}
        hasDragged={hasDragged}
      />
    );
  };

  const shouldDisableObjectsMainListening =
    isAnyCanvasDragActive || isImageRotateInteractionActive;

  return (
              <Stage
                ref={stageRef}
                width={800}
                height={altoCanvasDinamico}
                perfectDrawEnabled={false}
                listening={true}
                imageSmoothingEnabled={false}
                preventDefault={false}
                style={{
                  background: "white",
                  overflow: "visible",
                  position: "relative",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                }}


                onMouseDown={handleStageMouseDownWithInlineIntent}

                onTouchStart={handleStageTouchStartWithInlineIntent}

                onTouchMove={stageGestures.onTouchMove}

                onTouchEnd={stageGestures.onTouchEnd}

                onMouseMove={stageGestures.onMouseMove}

                onMouseUp={stageGestures.onMouseUp}
              >
                <CanvasElementsLayer
                  perfLabel="sections-base"
                  listening={!isAnyCanvasDragActive}
                >

                  {seccionesOrdenadas.flatMap((seccion, index) => {
                    const alturaPx = seccion.altura;
                    const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);
                    const esActiva = seccion.id === seccionActivaId;
                    const estaAnimando = seccionesAnimando.includes(seccion.id);
                    const sectionFill = resolveKonvaFill(
                      seccion.fondo,
                      800,
                      alturaPx,
                      "#ffffff"
                    );

                    const elementos = [
                      // Fondo de secciÃ³n - puede ser color o imagen
                      true ? (
                        <FondoSeccion
                          key={`fondo-${seccion.id}`}
                          seccion={seccion}
                          offsetY={offsetY}
                          alturaPx={alturaPx}
                          onSelect={() => selectSectionAndClearInlineIntent(seccion.id, "section-bg-image-select")}
                          onUpdateFondoOffset={actualizarOffsetFondo}
                          isMobile={isMobile}
                          isEditing={backgroundEditSectionId === seccion.id}
                          onRequestEdit={() => onRequestBackgroundEdit?.(seccion.id)}
                          onBackgroundImageStatusChange={handleBackgroundImageStatusChange}
                          editingDecorationId={
                            sectionDecorationEdit?.sectionId === seccion.id &&
                            sectionDecorationEdit?.overlayReady === true
                              ? sectionDecorationEdit.decorationId
                              : null
                          }
                          onRegisterBackgroundNode={onRegisterBackgroundEditNode}
                          onInteractionChange={onBackgroundEditInteractionChange}
                          onRequestDecorationEdit={requestBackgroundDecorationEdit}
                        />
                      ) : (
                        <Rect
                          key={`seccion-${seccion.id}`}
                          id={seccion.id}
                          x={0}
                          y={offsetY}
                          width={800}
                          height={alturaPx}
                          fill={sectionFill.fillColor}
                          fillPriority={sectionFill.hasGradient ? "linear-gradient" : "color"}
                          fillLinearGradientStartPoint={
                            sectionFill.hasGradient ? sectionFill.startPoint : undefined
                          }
                          fillLinearGradientEndPoint={
                            sectionFill.hasGradient ? sectionFill.endPoint : undefined
                          }
                          fillLinearGradientColorStops={
                            sectionFill.hasGradient
                              ? [0, sectionFill.gradientFrom, 1, sectionFill.gradientTo]
                              : undefined
                          }
                          stroke="transparent"
                          strokeWidth={0}
                          listening={true}
                          preventDefault={false}
                          onClick={() => selectSectionAndClearInlineIntent(seccion.id, "section-bg-color-select")}
                          onTap={() => selectSectionAndClearInlineIntent(seccion.id, "section-bg-color-select")}
                        />
                      )
                    ];


                    return elementos;
                  })}

                  {(() => {
                    if (!seccionActivaId) return null;

                    const index = seccionesOrdenadas.findIndex((s) => s.id === seccionActivaId);
                    if (index === -1) return null;

                    const seccion = seccionesOrdenadas[index];
                    const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);
                    const estaAnimando = seccionesAnimando.includes(seccion.id);

                    return (
                      <Rect
                        key={`base-border-seccion-${seccion.id}`}
                        x={0}
                        y={offsetY}
                        width={800}
                        height={seccion.altura}
                        fill="transparent"
                        stroke="#773dbe"
                        strokeWidth={estaAnimando ? 4 : 3}
                        cornerRadius={0}
                        shadowColor={estaAnimando ? "rgba(119, 61, 190, 0.4)" : "rgba(119, 61, 190, 0.25)"}
                        shadowBlur={estaAnimando ? 16 : 12}
                        shadowOffset={{ x: 0, y: estaAnimando ? 4 : 3 }}
                        listening={false}
                        perfectDrawEnabled={false}
                      />
                    );
                  })()}


                
                  {/* Control de altura para secciÃ³n activa */}
                  {seccionActivaId && seccionesOrdenadas.map((seccion, index) => {
                    if (seccion.id !== seccionActivaId) return null;

                    const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);
                    const controlY = offsetY + seccion.altura - 5; // 5px antes del final

                    const modoSeccion = normalizarAltoModo(seccion.altoModo);
                    const permiteResizeAltura = (modoSeccion !== "pantalla");


                    return (
                      <Group name="ui" key={`control-altura-${seccion.id}`}>
                        {/* LÃ­nea indicadora */}
                        <Line
                          name="ui"
                          points={[50, controlY, 750, controlY]}
                          stroke="#773dbe"
                          strokeWidth={2}
                          dash={[5, 5]}
                          listening={false}
                        />

                        {/* Control central mejorado */}
                        <Group
                          x={400}
                          y={controlY}
                          listening={permiteResizeAltura}                 // ? clave: si es false, no captura eventos
                          opacity={permiteResizeAltura ? 1 : 0.25}        // ? visual deshabilitado
                          onPointerDown={permiteResizeAltura ? (e) => iniciarControlAltura(e, seccion.id) : undefined}
                          onMouseDown={
                            permiteResizeAltura && !supportsPointerEvents
                              ? (e) => iniciarControlAltura(e, seccion.id)
                              : undefined
                          }
                          onTouchStart={
                            permiteResizeAltura && !supportsPointerEvents
                              ? (e) => iniciarControlAltura(e, seccion.id)
                              : undefined
                          }
                          onMouseEnter={() => {
                            if (!controlandoAltura && permiteResizeAltura) setGlobalCursor("ns-resize", stageRef);
                          }}
                          onMouseLeave={() => {
                            if (!controlandoAltura && permiteResizeAltura) clearGlobalCursor(stageRef);
                          }}
                          draggable={false}
                        >


                          {/* Ãrea de detecciÃ³n */}
                          <Rect
                            x={-45}
                            y={-22}
                            width={90}
                            height={44}
                            fill="transparent"
                            listening={true}
                          />

                          {/* Fondo del control con estado activo */}
                          <Rect
                            x={-25}
                            y={-6}
                            width={50}
                            height={12}
                            fill={controlandoAltura === seccion.id ? "#773dbe" : "rgba(119, 61, 190, 0.9)"}
                            cornerRadius={6}
                            shadowColor="rgba(0,0,0,0.3)"
                            shadowBlur={controlandoAltura === seccion.id ? 8 : 6}
                            shadowOffset={{ x: 0, y: controlandoAltura === seccion.id ? 4 : 3 }}
                            listening={false}
                          />

                          {/* AnimaciÃ³n de pulso durante el control */}
                          {controlandoAltura === seccion.id && (
                            <Rect
                              x={-30}
                              y={-8}
                              width={60}
                              height={16}
                              fill="transparent"
                              stroke="#773dbe"
                              strokeWidth={2}
                              cornerRadius={8}
                              opacity={0.6}
                              listening={false}
                            />
                          )}

                          {/* Indicador visual */}
                          <Text
                            x={-6}
                            y={-3}
                            text="??"
                            fontSize={10}
                            fill="white"
                            fontFamily="Arial"
                            listening={false}
                          />

                          {/* Puntos de agarre */}
                          <Circle x={-15} y={0} radius={1.5} fill="rgba(255,255,255,0.8)" listening={false} />
                          <Circle x={-10} y={0} radius={1.5} fill="rgba(255,255,255,0.8)" listening={false} />
                          <Circle x={10} y={0} radius={1.5} fill="rgba(255,255,255,0.8)" listening={false} />
                          <Circle x={15} y={0} radius={1.5} fill="rgba(255,255,255,0.8)" listening={false} />
                        </Group>


                        {/* Fondo del indicador */}
                        <Rect
                          x={755}
                          y={controlY - 10}
                          width={40}
                          height={20}
                          fill="rgba(119, 61, 190, 0.1)"
                          stroke="rgba(119, 61, 190, 0.3)"
                          strokeWidth={1}
                          cornerRadius={4}
                          listening={false}
                        />

                        {/* Texto del indicador */}
                        <Text
                          x={760}
                          y={controlY - 6}
                          text={`${Math.round(seccion.altura)}px`}
                          fontSize={11}
                          fill="#773dbe"
                          fontFamily="Arial"
                          fontWeight="bold"
                          listening={false}
                        />
                      </Group>
                    );
                  })}

                  {/* Overlay mejorado durante control de altura */}
                  {controlandoAltura && (
                    <Group name="ui">
                      {/* Overlay sutil */}
                      <Rect
                        x={0}
                        y={0}
                        width={800}
                        height={altoCanvasDinamico}
                        fill="rgba(119, 61, 190, 0.05)"
                        listening={false}
                      />

                      {/* Indicador de la secciÃ³n que se estÃ¡ modificando */}
                      {seccionesOrdenadas.map((seccion, index) => {
                        const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);
                        const controlSectionFill = resolveKonvaFill(
                          seccion.fondo,
                          800,
                          seccion.altura,
                          "transparent"
                        );

                        const modoSeccion = normalizarAltoModo(seccion.altoModo);
                        const permiteResizeAltura = (modoSeccion !== "pantalla");

                        return (
                          <Group key={seccion.id}>
                            {/* Rect â€œfondoâ€ clickeable */}
                            <Rect
                              x={0}
                              y={offsetY}
                              width={800}
                              height={seccion.altura}
                              fill={controlSectionFill.fillColor}
                              fillPriority={controlSectionFill.hasGradient ? "linear-gradient" : "color"}
                              fillLinearGradientStartPoint={
                                controlSectionFill.hasGradient
                                  ? controlSectionFill.startPoint
                                  : undefined
                              }
                              fillLinearGradientEndPoint={
                                controlSectionFill.hasGradient
                                  ? controlSectionFill.endPoint
                                  : undefined
                              }
                              fillLinearGradientColorStops={
                                controlSectionFill.hasGradient
                                  ? [0, controlSectionFill.gradientFrom, 1, controlSectionFill.gradientTo]
                                  : undefined
                              }
                              onClick={() => selectSectionAndClearInlineIntent(seccion.id, "section-overlay-select")}   // ?? dispara el evento
                            />

                            {/* Rect highlight si estÃ¡s controlando la altura */}
                            {seccion.id === controlandoAltura && (
                              <Rect
                                x={0}
                                y={offsetY}
                                width={800}
                                height={seccion.altura}
                                fill="transparent"
                                stroke="#773dbe"
                                strokeWidth={3}
                                dash={[8, 4]}
                                listening={false}
                              />
                            )}
                          </Group>
                        );
                      })}

                    </Group>
                  )}



                </CanvasElementsLayer>

                <CanvasElementsLayer
                  perfLabel="objects-main"
                  listening={!shouldDisableObjectsMainListening}
                >
                  {objetos.map((obj) => renderCanvasObject(obj))}
                </CanvasElementsLayer>

                <CanvasElementsLayer
                  perfLabel="ui-overlay"
                  listening={!isAnyCanvasDragActive && !isImageRotateInteractionActive}
                >
                  {editing.id && (
                    <InlineTextEditDecorationsLayer
                      isMobile={isMobile}
                      decorations={inlineEditDecorations}
                      outlinePoints={resolveInlineEditOutlinePoints(
                        editing.id,
                        elementRefs,
                        stageRef.current?.getStage?.() || stageRef.current || null,
                        isMobile
                      )}
                      outlineRect={resolveInlineEditOutlineRect(
                        editing.id,
                        elementRefs,
                        stageRef.current?.getStage?.() || stageRef.current || null,
                        isMobile
                      )}
                    />
                  )}

                  {sectionDecorationEdit?.sectionId && sectionDecorationEdit?.decorationId && (() => {
                    const editedSectionIndex = seccionesOrdenadas.findIndex(
                      (section) => section?.id === sectionDecorationEdit.sectionId
                    );
                    if (editedSectionIndex === -1) return null;

                    const editedSection = seccionesOrdenadas[editedSectionIndex];
                    const editedSectionOffsetY = calcularOffsetY(
                      seccionesOrdenadas,
                      editedSectionIndex,
                      altoCanvas
                    );

                    return (
                      <SectionDecorationEditorOverlay
                        seccion={editedSection}
                        decorationId={sectionDecorationEdit.decorationId}
                        offsetY={editedSectionOffsetY}
                        alturaPx={editedSection.altura}
                        isMobile={isMobile}
                        onCommit={(nextDecoration) => {
                          setSecciones((prev) =>
                            updateBackgroundDecorationTransform(
                              prev,
                              editedSection.id,
                              sectionDecorationEdit.decorationId,
                              nextDecoration,
                              editedSection.altura,
                              800
                            )
                          );
                        }}
                        onImageReadyChange={(isReady) => {
                          setSectionDecorationEdit((previous) => {
                            if (
                              previous?.sectionId !== editedSection.id ||
                              previous?.decorationId !== sectionDecorationEdit.decorationId
                            ) {
                              return previous;
                            }
                            if (previous?.overlayReady === Boolean(isReady)) {
                              return previous;
                            }
                            return {
                              ...previous,
                              overlayReady: Boolean(isReady),
                            };
                          });
                        }}
                        onExit={() => setSectionDecorationEdit(null)}
                      />
                    );
                  })()}



                  {stageSelectionVisualMode.showMarqueeRect && areaSeleccion && (
                    <Rect
                      name="ui"
                      x={areaSeleccion.x}
                      y={areaSeleccion.y}
                      width={areaSeleccion.width}
                      height={areaSeleccion.height}
                      fill="rgba(119, 61, 190, 0.1)" // violeta claro
                      stroke="#773dbe"
                      strokeWidth={1}
                      dash={[4, 4]}
                    />
                  )}


                  {stageSelectionVisualMode.mountPrimarySelectionOverlay && (() => {
                    return (
                      <SelectionBounds
                        selectedElements={elementosSeleccionados}
                        elementRefs={elementRefs}
                        objetos={objetos}
                        isDragging={isCanvasDragGestureActive}
                        isInteractionLocked={isImageCropInteracting}
                        isMobile={isMobile}
                        dragLayerRef={dragLayerRef}
                        canvasInteractionEpoch={canvasInteractionEpoch}
                        canvasInteractionActive={canvasInteractionActive}
                        canvasInteractionSettling={canvasInteractionSettling}
                        predragVisualSelectionActive={isPredragVisualSelectionActive}
                        dragSelectionOverlayVisible={shouldShowDragSelectionOverlay}
                        dragSelectionOverlayVisualReady={
                          shouldShowDragSelectionOverlay && isDragSelectionOverlayVisualReady
                        }
                        scheduleCanvasUiAfterSettle={scheduleCanvasUiAfterSettle}
                        cancelCanvasUiAfterSettle={
                          canvasInteractionApi.cancelCanvasUiAfterSettle
                        }
                        selectionRuntime={selectionRuntime}
                        onTransformInteractionStart={handleTransformInteractionStartWithInlineIntent}
                        onTransformInteractionEnd={handleTransformInteractionEndWithInlineIntent}
                        editingId={editing.id || null}
                        activeInlineEditingId={activeInlineEditingId || null}
                        requestInlineEditFinish={requestInlineEditFinish}
                        onTransform={(newAttrs) => {
                          if (
                            newAttrs?.isFinal &&
                            Array.isArray(newAttrs.batch) &&
                            newAttrs.batch.length > 0
                          ) {
                            window._resizeData = { isResizing: false };

                            const batchById = new Map();
                            let hasImage = false;

                            newAttrs.batch.forEach((entry) => {
                              const id = entry?.id;
                              if (!id) return;

                              const objOriginal = objetos.find((o) => o.id === id);
                              if (!objOriginal) return;

                              if (objOriginal.tipo === "imagen") {
                                hasImage = true;
                              }

                              const finalPatch = buildFinalMultiTransformPatch({
                                objOriginal,
                                batchPatch: entry,
                                convertirAbsARel,
                                seccionesOrdenadas,
                                esSeccionPantallaById,
                                ALTURA_PANTALLA_EDITOR,
                                normalizarMedidasGaleria,
                              });
                              if (finalPatch) {
                                batchById.set(id, finalPatch);
                              }
                            });

                            if (batchById.size === 0) {
                              return;
                            }

                            const commitBatch = () => {
                              setObjetos((prev) => {
                                let changed = false;
                                const next = prev.map((obj) => {
                                  const patch = batchById.get(obj.id);
                                  if (!patch) return obj;
                                  changed = true;
                                  return { ...obj, ...patch };
                                });
                                return changed ? next : prev;
                              });
                            };

                            if (hasImage && typeof flushSync === "function") {
                              flushSync(commitBatch);
                            } else {
                              commitBatch();
                            }
                            return;
                          }

                          if (elementosSeleccionados.length === 1) {
                            const id = elementosSeleccionados[0];
                            const objIndex = objetos.findIndex(o => o.id === id);

                            if (objIndex !== -1) {

                              if (newAttrs.isPreview) {
                                // Preview: actualizaciÃ³n sin historial
                                setObjetos(prev => {
                                  const nuevos = [...prev];
                                  const elemento = nuevos[objIndex];
                                  const isPureRotatePreview =
                                    activeTransformInteractionRef.current?.isRotate === true;
                                  const isImageRotatePreview =
                                    isPureRotatePreview &&
                                    elemento?.tipo === "imagen" &&
                                    !elemento?.esFondo;
                                  // Countdown: durante preview dejamos que Konva escale el nodo
                                  // sin tocar estado React para evitar desincronizaciÃ³n con Transformer.
                                  if (
                                    elemento.tipo === "countdown" ||
                                    elemento.tipo === "imagen" ||
                                    (
                                      elemento.tipo === "forma" &&
                                      (elemento.figura === "circle" || elemento.figura === "triangle")
                                    )
                                  ) {
                                    return prev;
                                  }

                                  if (isPureRotatePreview) {
                                    if (isImageRotatePreview) {
                                      noteImageRotationReactPreviewSkipped({
                                        elementId: elemento?.id ?? null,
                                        activeAnchor:
                                          activeTransformInteractionRef.current?.activeAnchor ?? null,
                                        pointerType:
                                          activeTransformInteractionRef.current?.pointerType ?? null,
                                        incomingRotation: roundRotationMetric(
                                          newAttrs.rotation ?? elemento?.rotation ?? 0
                                        ),
                                      });
                                    }
                                    return prev;
                                  }

                                  if (elemento.tipo === "texto" && Number.isFinite(newAttrs.fontSize)) {
                                    // Para texto dejamos que Konva haga el preview de escala en vivo.
                                    // Actualizar estado React en cada frame genera micro-jitter visual.
                                    return prev;
                                  }

                                  const updatedElement = {
                                    ...elemento,
                                    rotation: newAttrs.rotation || elemento.rotation || 0
                                  };

                                  if (elemento.tipo === "galeria") {
                                    const galleryMetrics = normalizarMedidasGaleria(
                                      elemento,
                                      newAttrs.width,
                                      newAttrs.x
                                    );
                                    updatedElement.width = galleryMetrics.width;
                                    updatedElement.height = galleryMetrics.height;
                                    updatedElement.widthPct = galleryMetrics.widthPct;
                                    updatedElement.x = galleryMetrics.x;
                                    if (galleryMetrics.galleryLayoutBlueprint) {
                                      updatedElement.galleryLayoutBlueprint =
                                        galleryMetrics.galleryLayoutBlueprint;
                                    }
                                    updatedElement.rotation = elemento.rotation || 0;
                                    updatedElement.scaleX = 1;
                                    updatedElement.scaleY = 1;
                                  } else {
                                    if (newAttrs.width !== undefined) updatedElement.width = newAttrs.width;
                                    if (newAttrs.height !== undefined) updatedElement.height = newAttrs.height;
                                    if (newAttrs.radius !== undefined) updatedElement.radius = newAttrs.radius;
                                    updatedElement.scaleX = 1;
                                    updatedElement.scaleY = 1;
                                  }

                                  nuevos[objIndex] = updatedElement;
                                  return nuevos;
                                });

                                // ?? ACTUALIZAR POSICIÃ“N DEL BOTÃ“N DURANTE TRANSFORM
                                if (!activeTransformInteractionRef.current?.isRotate) {
                                  requestAnimationFrame(() => {
                                    if (typeof actualizarPosicionBotonOpciones === 'function') {
                                      actualizarPosicionBotonOpciones();
                                    }
                                  });
                                } else {
                                  noteImageRotationOptionButtonSkip({
                                    elementId: elementosSeleccionados[0] || null,
                                    activeAnchor:
                                      activeTransformInteractionRef.current?.activeAnchor ?? null,
                                  });
                                }

                              } else if (newAttrs.isFinal) {
                                // Final: actualizaciÃ³n completa
                                window._resizeData = { isResizing: false };

                                const { isPreview, isFinal, ...cleanAttrs } = newAttrs;

                                // ?? CONVERTIR coordenadas absolutas a relativas ANTES de guardar
                                const objOriginal = objetos[objIndex];
                                let finalAttrs = {
                                  ...cleanAttrs,
                                  y: convertirAbsARel(cleanAttrs.y, objOriginal.seccionId, seccionesOrdenadas),
                                  fromTransform: true
                                };

                                // ? COUNTDOWN: conservar escala final del drag (sin reconversiÃ³n a chipWidth)
                                // para que el tamaÃ±o final coincida exactamente con lo soltado.
                                if (objOriginal.tipo === "texto" && Number.isFinite(cleanAttrs.fontSize)) {
                                  const requestedFontSize = Math.max(6, Number(cleanAttrs.fontSize) || 6);
                                  const originalFontSize = Number.isFinite(objOriginal.fontSize)
                                    ? objOriginal.fontSize
                                    : 24;
                                  const rotationFinal = Number.isFinite(cleanAttrs.rotation)
                                    ? cleanAttrs.rotation
                                    : (Number.isFinite(objOriginal.rotation) ? objOriginal.rotation : 0);
                                  const previousRotation = Number.isFinite(objOriginal.rotation)
                                    ? objOriginal.rotation
                                    : 0;
                                  const rotationChanged = Math.abs(rotationFinal - previousRotation) > 0.1;
                                  const fontSizeChanged = Math.abs(requestedFontSize - originalFontSize) > 0.05;
                                  const shouldMatchVisualWidth =
                                    objOriginal.__autoWidth !== false &&
                                    !Number.isFinite(objOriginal.width) &&
                                    !rotationChanged;
                                  const nextFontSize = shouldMatchVisualWidth
                                    ? ajustarFontSizeAAnchoVisual(
                                      objOriginal,
                                      requestedFontSize,
                                      cleanAttrs.textVisualWidth
                                    )
                                    : requestedFontSize;
                                  const shouldUseNodePose =
                                    rotationChanged &&
                                    !fontSizeChanged &&
                                    Number.isFinite(cleanAttrs.x) &&
                                    Number.isFinite(cleanAttrs.y);
                                  const centeredPosAbs = shouldUseNodePose
                                    ? { x: Number(cleanAttrs.x), y: Number(cleanAttrs.y) }
                                    : calcularPosTextoDesdeCentro(
                                      objOriginal,
                                      nextFontSize,
                                      cleanAttrs.textCenterX,
                                      cleanAttrs.textCenterY,
                                      rotationFinal
                                    );
                                  const centeredX = centeredPosAbs.x;
                                  const centeredYAbs = centeredPosAbs.y;
                                  const centeredY = Number.isFinite(centeredYAbs)
                                    ? convertirAbsARel(
                                      centeredYAbs,
                                      objOriginal.seccionId,
                                      seccionesOrdenadas
                                    )
                                    : (Number.isFinite(objOriginal.y) ? objOriginal.y : 0);
                                  textResizeDebug("transform-final:text", {
                                    id: objOriginal?.id ?? null,
                                    requestedFontSize,
                                    nextFontSize,
                                    shouldMatchVisualWidth,
                                    cleanFontSize: cleanAttrs.fontSize ?? null,
                                    textVisualWidth: cleanAttrs.textVisualWidth ?? null,
                                    textCenterX: cleanAttrs.textCenterX ?? null,
                                    textCenterY: cleanAttrs.textCenterY ?? null,
                                    rotationFinal,
                                    rotationChanged,
                                    fontSizeChanged,
                                    shouldUseNodePose,
                                    centeredX,
                                    centeredYAbs,
                                    centeredY,
                                    originalX: objOriginal?.x ?? null,
                                    originalY: objOriginal?.y ?? null,
                                  });
                                  finalAttrs = {
                                    ...finalAttrs,
                                    fontSize: nextFontSize,
                                    x: Number.isFinite(centeredX)
                                      ? centeredX
                                      : (Number.isFinite(objOriginal.x) ? objOriginal.x : 0),
                                    y: centeredY,
                                    scaleX: 1,
                                    scaleY: 1,
                                  };
                                  delete finalAttrs.textCenterX;
                                  delete finalAttrs.textCenterY;
                                  delete finalAttrs.textVisualWidth;
                                  textResizeDebug("transform-final:text-attrs", {
                                    id: objOriginal?.id ?? null,
                                    finalFontSize: finalAttrs.fontSize ?? null,
                                    finalX: finalAttrs.x ?? null,
                                    finalY: finalAttrs.y ?? null,
                                  });
                                } else if (objOriginal.tipo === "countdown") {
                                  finalAttrs = {
                                    ...finalAttrs,
                                    ...buildScaledCountdownResizeAttrs(
                                      objOriginal,
                                      cleanAttrs.width,
                                      cleanAttrs.height
                                    ),
                                  };
                                } else if (objOriginal.tipo === "forma" && objOriginal.figura === "circle") {
                                  finalAttrs = {
                                    ...finalAttrs,
                                    x: Number.isFinite(cleanAttrs.x) ? cleanAttrs.x : (objOriginal.x || 0),
                                    radius: Number.isFinite(cleanAttrs.radius)
                                      ? cleanAttrs.radius
                                      : (objOriginal.radius || 50),
                                    scaleX: 1,
                                    scaleY: 1,
                                  };
                                  delete finalAttrs.width;
                                  delete finalAttrs.height;
                                } else if (objOriginal.tipo === "forma" && objOriginal.figura === "triangle") {
                                  finalAttrs = {
                                    ...finalAttrs,
                                    x: Number.isFinite(cleanAttrs.x) ? cleanAttrs.x : (objOriginal.x || 0),
                                    radius: Number.isFinite(cleanAttrs.radius)
                                      ? cleanAttrs.radius
                                      : (objOriginal.radius || 60),
                                    scaleX: 1,
                                    scaleY: 1,
                                  };
                                  delete finalAttrs.width;
                                  delete finalAttrs.height;
                                } else if (objOriginal.tipo === "galeria") {
                                  const galleryMetrics = normalizarMedidasGaleria(
                                    objOriginal,
                                    cleanAttrs.width,
                                    cleanAttrs.x
                                  );
                                  finalAttrs = {
                                    ...finalAttrs,
                                    x: galleryMetrics.x,
                                    width: galleryMetrics.width,
                                    height: galleryMetrics.height,
                                    widthPct: galleryMetrics.widthPct,
                                    ...(galleryMetrics.galleryLayoutBlueprint
                                      ? {
                                          galleryLayoutBlueprint:
                                            galleryMetrics.galleryLayoutBlueprint,
                                        }
                                      : {}),
                                    rotation: objOriginal.rotation || 0,
                                    scaleX: 1,
                                    scaleY: 1,
                                  };
                                }

                                const finalSectionId = finalAttrs.seccionId || objOriginal.seccionId;
                                const finalSectionUsesYNorm = esSeccionPantallaById(finalSectionId);
                                const finalYRel = Number.isFinite(Number(finalAttrs.y))
                                  ? Number(finalAttrs.y)
                                  : (Number.isFinite(Number(objOriginal.y)) ? Number(objOriginal.y) : null);

                                if (Number.isFinite(finalYRel)) {
                                  finalAttrs.y = finalYRel;
                                }

                                if (finalSectionUsesYNorm && Number.isFinite(finalYRel)) {
                                  finalAttrs.yNorm = Math.max(
                                    0,
                                    Math.min(1, finalYRel / ALTURA_PANTALLA_EDITOR)
                                  );
                                } else if (!finalSectionUsesYNorm) {
                                  delete finalAttrs.yNorm;
                                }

                                // ? offsetY solo para debug (evita ReferenceError)
                                let offsetY = 0;
                                try {
                                  const idx = seccionesOrdenadas.findIndex(s => s.id === objOriginal.seccionId);
                                  const safe = idx >= 0 ? idx : 0;
                                  // Nota: en tu cÃ³digo lo llamÃ¡s a veces con 2 params, a veces con 3.
                                  // AcÃ¡ usamos 3, consistente con otras partes del archivo.
                                  offsetY = calcularOffsetY(seccionesOrdenadas, safe, altoCanvas) || 0;
                                } catch {
                                  offsetY = 0;
                                }

                                const imageRotationCommitContext =
                                  objOriginal.tipo === "imagen" &&
                                  !objOriginal.esFondo &&
                                  activeTransformInteractionRef.current?.isRotate === true
                                    ? {
                                      elementId: objOriginal?.id ?? null,
                                      activeAnchor:
                                        activeTransformInteractionRef.current?.activeAnchor ?? null,
                                      pointerType:
                                        activeTransformInteractionRef.current?.pointerType ?? null,
                                    }
                                    : null;

                                if (objOriginal.tipo === "imagen" && !objOriginal.esFondo) {
                                  trackImageResizeDebug("composer:image-commit-request", {
                                    elementId: objOriginal?.id ?? null,
                                    objBefore: {
                                      x: objOriginal?.x ?? null,
                                      y: objOriginal?.y ?? null,
                                      width: objOriginal?.width ?? null,
                                      height: objOriginal?.height ?? null,
                                      cropX: objOriginal?.cropX ?? null,
                                      cropY: objOriginal?.cropY ?? null,
                                      cropWidth: objOriginal?.cropWidth ?? null,
                                      cropHeight: objOriginal?.cropHeight ?? null,
                                    },
                                    cleanAttrs: {
                                      x: cleanAttrs?.x ?? null,
                                      y: cleanAttrs?.y ?? null,
                                      width: cleanAttrs?.width ?? null,
                                      height: cleanAttrs?.height ?? null,
                                      rotation: cleanAttrs?.rotation ?? null,
                                      scaleX: cleanAttrs?.scaleX ?? null,
                                      scaleY: cleanAttrs?.scaleY ?? null,
                                    },
                                    finalAttrs: {
                                      x: finalAttrs?.x ?? null,
                                      y: finalAttrs?.y ?? null,
                                      yNorm: finalAttrs?.yNorm ?? null,
                                      width: finalAttrs?.width ?? null,
                                      height: finalAttrs?.height ?? null,
                                      cropX: finalAttrs?.cropX ?? null,
                                      cropY: finalAttrs?.cropY ?? null,
                                      cropWidth: finalAttrs?.cropWidth ?? null,
                                      cropHeight: finalAttrs?.cropHeight ?? null,
                                    },
                                    nodeBeforeCommit: getImageResizeNodeSnapshot(
                                      elementRefs.current?.[objOriginal.id] || null
                                    ),
                                  });
                                }

                                if (imageRotationCommitContext) {
                                  trackImageRotationCommit({
                                    ...imageRotationCommitContext,
                                    previousRotation: roundRotationMetric(objOriginal?.rotation ?? 0),
                                    finalRotation: roundRotationMetric(
                                      finalAttrs.rotation ?? objOriginal?.rotation ?? 0
                                    ),
                                    finalX: roundRotationMetric(finalAttrs.x ?? objOriginal?.x ?? 0),
                                    finalYRel: roundRotationMetric(
                                      finalYRel ?? finalAttrs.y ?? objOriginal?.y ?? 0
                                    ),
                                    finalYNorm: roundRotationMetric(
                                      finalAttrs.yNorm ?? objOriginal?.yNorm ?? null,
                                      4
                                    ),
                                    finalYAbs: roundRotationMetric(cleanAttrs.y ?? null),
                                    finalSectionUsesYNorm,
                                    width: roundRotationMetric(
                                      finalAttrs.width ?? objOriginal?.width ?? null,
                                      3
                                    ),
                                    height: roundRotationMetric(
                                      finalAttrs.height ?? objOriginal?.height ?? null,
                                      3
                                    ),
                                  });
                                }

                                const finalizeImageRotationDebugAfterCommit =
                                  imageRotationCommitContext
                                    ? () => {
                                      requestAnimationFrame(() => {
                                        requestAnimationFrame(() => {
                                          const committedNode =
                                            elementRefs.current?.[imageRotationCommitContext.elementId] || null;
                                          const committedNodeSnapshot =
                                            getImageRotationNodeSnapshot(committedNode);

                                          trackImageRotationDebug("image-rotate:post-commit-node", {
                                            ...imageRotationCommitContext,
                                            ...committedNodeSnapshot,
                                          });

                                          finishImageRotationDebugSession({
                                            ...imageRotationCommitContext,
                                            ...committedNodeSnapshot,
                                            finalRotation: roundRotationMetric(
                                              finalAttrs.rotation ?? objOriginal?.rotation ?? 0
                                            ),
                                            reason: "state-commit",
                                          });
                                        });
                                      });
                                    }
                                    : null;

                                if (
                                  objOriginal.tipo === "countdown" ||
                                  objOriginal.tipo === "texto" ||
                                  objOriginal.tipo === "imagen"
                                ) {
                                  if (objOriginal.tipo === "texto") {
                                    const commitSnapshot = {
                                      id: objOriginal?.id ?? null,
                                      finalFontSize: finalAttrs.fontSize ?? null,
                                      finalX: finalAttrs.x ?? null,
                                      finalY: finalAttrs.y ?? null,
                                      seccionId: objOriginal?.seccionId ?? null,
                                    };
                                    textResizeDebug("transform-final:commit", {
                                      ...commitSnapshot,
                                    });
                                    if (isTextResizeDebugEnabled()) {
                                      requestAnimationFrame(() => {
                                        requestAnimationFrame(() => {
                                          const nodeAfterCommit = elementRefs.current?.[commitSnapshot.id];
                                          if (!nodeAfterCommit) {
                                            textResizeDebug("transform-final:post-render:no-node", {
                                              id: commitSnapshot.id,
                                            });
                                            return;
                                          }
                                          try {
                                            const rectAfterCommit = nodeAfterCommit.getClientRect({
                                              skipTransform: false,
                                              skipShadow: true,
                                              skipStroke: true,
                                            });
                                            textResizeDebug("transform-final:post-render", {
                                              ...commitSnapshot,
                                              nodeX: typeof nodeAfterCommit.x === "function" ? nodeAfterCommit.x() : null,
                                              nodeY: typeof nodeAfterCommit.y === "function" ? nodeAfterCommit.y() : null,
                                              nodeScaleX:
                                                typeof nodeAfterCommit.scaleX === "function"
                                                  ? nodeAfterCommit.scaleX()
                                                  : null,
                                              nodeScaleY:
                                                typeof nodeAfterCommit.scaleY === "function"
                                                  ? nodeAfterCommit.scaleY()
                                                  : null,
                                              nodeFontSize:
                                                typeof nodeAfterCommit.fontSize === "function"
                                                  ? nodeAfterCommit.fontSize()
                                                  : null,
                                              nodeRectWidth:
                                                Number.isFinite(rectAfterCommit?.width)
                                                  ? rectAfterCommit.width
                                                  : null,
                                              nodeRectHeight:
                                                Number.isFinite(rectAfterCommit?.height)
                                                  ? rectAfterCommit.height
                                                  : null,
                                            });
                                          } catch (err) {
                                            textResizeDebug("transform-final:post-render:error", {
                                              id: commitSnapshot.id,
                                              message: err?.message || String(err),
                                            });
                                          }
                                        });
                                      });
                                    }
                                  }
                                  if (objOriginal.tipo === "imagen") {
                                    flushSync(() => {
                                      actualizarObjeto(objIndex, finalAttrs);
                                    });
                                  } else {
                                    actualizarObjeto(objIndex, finalAttrs);
                                  }
                                  finalizeImageRotationDebugAfterCommit?.();

                                  if (objOriginal.tipo === "imagen" && !objOriginal.esFondo) {
                                    const objectResolver = getWindowObjectResolver();
                                    requestAnimationFrame(() => {
                                      const resolvedObject =
                                        typeof objectResolver === "function"
                                          ? objectResolver(objOriginal.id)
                                          : null;
                                      trackImageResizeDebug("composer:image-commit-raf1", {
                                        elementId: objOriginal?.id ?? null,
                                        resolvedObject: {
                                          width: resolvedObject?.width ?? null,
                                          height: resolvedObject?.height ?? null,
                                          cropX: resolvedObject?.cropX ?? null,
                                          cropY: resolvedObject?.cropY ?? null,
                                          cropWidth: resolvedObject?.cropWidth ?? null,
                                          cropHeight: resolvedObject?.cropHeight ?? null,
                                        },
                                        node: getImageResizeNodeSnapshot(
                                          elementRefs.current?.[objOriginal.id] || null
                                        ),
                                        resizeActive: Boolean(window._resizeData?.isResizing),
                                      });

                                      requestAnimationFrame(() => {
                                        const resolvedObject2 =
                                          typeof objectResolver === "function"
                                            ? objectResolver(objOriginal.id)
                                            : null;
                                        trackImageResizeDebug("composer:image-commit-raf2", {
                                          elementId: objOriginal?.id ?? null,
                                          resolvedObject: {
                                            width: resolvedObject2?.width ?? null,
                                            height: resolvedObject2?.height ?? null,
                                            cropX: resolvedObject2?.cropX ?? null,
                                            cropY: resolvedObject2?.cropY ?? null,
                                            cropWidth: resolvedObject2?.cropWidth ?? null,
                                            cropHeight: resolvedObject2?.cropHeight ?? null,
                                          },
                                          node: getImageResizeNodeSnapshot(
                                            elementRefs.current?.[objOriginal.id] || null
                                          ),
                                          resizeActive: Boolean(window._resizeData?.isResizing),
                                        });
                                      });
                                    });
                                  }
                                } else {
                                  requestAnimationFrame(() => {
                                    actualizarObjeto(objIndex, finalAttrs);
                                    finalizeImageRotationDebugAfterCommit?.();
                                  });
                                }

                              }
                            }
                          }
                        }}
                      />
                    );
                  })()}


                  {/* No mostrar hover durante drag/resize/ediciÃ³n NI cuando hay lÃ­der de grupo */}
                  {shouldRenderImageCropOverlay && (
                    <ImageCropOverlay
                      selectedElementId={
                        elementosSeleccionados.length === 1 ? elementosSeleccionados[0] : null
                      }
                      objetos={objetos}
                      elementRefs={elementRefs}
                      stageRef={stageRef}
                      isMobile={isMobile}
                      supportsPointerEvents={supportsPointerEvents}
                      setGlobalCursor={setGlobalCursor}
                      clearGlobalCursor={clearGlobalCursor}
                      onCropPreview={handleImageCropPreview}
                      onCropCommit={handleImageCropCommit}
                      onInteractionStart={handleImageCropInteractionStart}
                      onInteractionEnd={handleImageCropInteractionEnd}
                    />
                  )}

                  {shouldMountHoverIndicator && (
                    <HoverIndicator
                      ref={hoverIndicatorRef}
                      hoveredElement={effectiveHoverId}
                      elementRefs={elementRefs}
                      objetos={objetos}
                      activeInlineEditingId={activeInlineEditingId}
                      isMobile={isMobile}
                    />
                  )}



                  {/* ?? Controles especiales para lÃ­neas seleccionadas */}
                  {stageSelectionVisualMode.showLineControls && (() => {
                    const elementoSeleccionado =
                      stageSelectionVisualMode.singleSelectedLineId
                        ? objetos.find(
                            (obj) =>
                              obj.id === stageSelectionVisualMode.singleSelectedLineId
                          ) || null
                        : null;
                    if (elementoSeleccionado?.tipo === 'forma' && elementoSeleccionado?.figura === 'line') {
                      return (
                        <LineControls
                          name="ui"
                          key={`line-controls-${elementoSeleccionado.id}-${JSON.stringify(elementoSeleccionado.points)}`}
                          lineElement={elementoSeleccionado}
                          elementRefs={elementRefs}
                          onUpdateLine={actualizarLinea}
                          altoCanvas={altoCanvasDinamico}
                          isMobile={isMobile}
                          // ?? NUEVA PROP: Pasar informaciÃ³n sobre drag grupal
                          isDragGrupalActive={window._grupoLider !== null}
                          elementosSeleccionados={elementosSeleccionados}
                          selectionRuntime={selectionRuntime}
                        />
                      );
                    }
                    return null;
                  })()}





                  {/* LÃ­neas de guÃ­a dinÃ¡micas mejoradas */}
                  {!isImageRotateInteractionActive && guiaLineas.map((linea, i) => {
                    // Determinar el estilo visual segÃºn el tipo
                    const esLineaSeccion = linea.priority === 'seccion';

                    return (
                      <Line
                        name="ui"
                        key={`${linea.type}-${i}`}
                        points={linea.points}
                        stroke={esLineaSeccion ? "#773dbe" : "#9333ea"} // Violeta mÃ¡s intenso para secciÃ³n
                        strokeWidth={esLineaSeccion ? 2 : 1} // LÃ­neas de secciÃ³n mÃ¡s gruesas
                        dash={linea.style === 'dashed' ? [8, 6] : undefined} // Punteado para elementos
                        opacity={esLineaSeccion ? 0.9 : 0.7} // LÃ­neas de secciÃ³n mÃ¡s opacas
                        listening={false}
                        perfectDrawEnabled={false}
                        // Efecto sutil de resplandor para lÃ­neas de secciÃ³n
                        shadowColor={esLineaSeccion ? "rgba(119, 61, 190, 0.3)" : undefined}
                        shadowBlur={esLineaSeccion ? 4 : 0}
                        shadowEnabled={esLineaSeccion}
                      />
                    );
                  })}

                </CanvasElementsLayer>

                <CanvasGuideLayer ref={guideOverlayRef} />

                {/* ? Overlay superior: borde de secciÃ³n activa SIEMPRE arriba de todo */}
                <CanvasElementsLayer
                  ref={dragLayerRef}
                  perfLabel="drag-overlay"
                >
                  {(() => {
                    // Este overlay existe para mantener visible la seleccion durante drag
                    // cuando el Transformer principal puede ocultarse. En transform/rotate
                    // el Transformer sigue pintando su borde, asi que mostrar ambos genera
                    // un doble recuadro desalineado.
                    if (editing.id || sectionDecorationEdit || !shouldShowDragSelectionOverlay) {
                      return null;
                    }
                    const indicatorSelectionIds =
                      stageSelectionVisualMode.dragOverlaySelectionIds;

                    if (indicatorSelectionIds.length === 0) return null;

                    return (
                      <SelectionBoundsIndicator
                        ref={dragOverlayIndicatorRef}
                        key={
                          dragOverlayBoxFlowIdentity ||
                          `drag-overlay:${dragOverlaySelectionIdsDigest || "selection"}`
                        }
                        selectedElements={indicatorSelectionIds}
                        elementRefs={elementRefs}
                        objetos={objetos}
                        isMobile={isMobile}
                        debugSource="drag-overlay"
                        boxFlowIdentity={dragOverlayBoxFlowIdentity}
                        lifecycleKey={dragOverlayBoxFlowIdentity}
                        boundsControlMode="controlled"
                        bringToFront
                        onVisualReadyChange={handleDragSelectionOverlayReadyChange}
                        onFirstControlledFrameVisible={handleDragOverlayFirstVisibleFrame}
                        onBoxFlowBoundsSample={noteDragOverlayBoundsSample}
                      />
                    );
                  })()}

                </CanvasElementsLayer>

              </Stage>
  );
}
