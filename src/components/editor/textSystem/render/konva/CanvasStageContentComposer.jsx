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
import SelectionBoundsIndicator from "@/components/editor/textSystem/render/konva/SelectionBoundsIndicator";
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
  buildSelectionFramePolygon,
  getSelectionFramePadding,
} from "@/components/editor/textSystem/render/konva/selectionFrameVisuals";
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

function createEmptyDragSettleSession() {
  return {
    dragId: null,
    tipo: null,
    startedSelected: false,
    selectionSnapshot: [],
    needsDeferredCommit: false,
    hadVisualSelection: false,
    needsGuideCleanup: false,
    interactionEpoch: 0,
  };
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
  const dragLayerRef = useRef(null);
  const dragSettleSessionRef = useRef(createEmptyDragSettleSession());
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
  const [isImageCropInteracting, setIsImageCropInteracting] = useState(false);
  const [dragVisualSelectionIds, setDragVisualSelectionIds] = useState([]);
  const dragVisualSelectionIdsRef = useRef([]);
  const activeInlineEditingId =
    editing.id ||
    getCurrentInlineEditingId() ||
    (inlineOverlayMountSession?.mounted ? inlineOverlayMountSession.id : null) ||
    inlineOverlayMountedId ||
    null;
  const isHoverSuppressed =
    Boolean(isDragging) ||
    Boolean(backgroundEditSectionId) ||
    canvasInteractionActive ||
    canvasInteractionSettling ||
    isImageCropInteracting ||
    (typeof window !== "undefined" &&
      Boolean(window._isDragging || window._grupoLider || window._resizeData?.isResizing));
  const effectiveHoverId = isHoverSuppressed ? null : hoverId;
  const selectedPrimaryObject =
    elementosSeleccionados.length === 1
      ? objetos.find((obj) => obj.id === elementosSeleccionados[0]) || null
      : null;
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

  const setHoverIdWhenIdle = useCallback((nextHoverId) => {
    const dragActive =
      Boolean(isDragging) ||
      canvasInteractionActive ||
      canvasInteractionSettling ||
      (typeof window !== "undefined" &&
        Boolean(window._isDragging || window._grupoLider));

    if (dragActive) return;

    setHoverId((currentHoverId) => (
      typeof nextHoverId === "function"
        ? nextHoverId(currentHoverId)
        : nextHoverId
    ));
  }, [canvasInteractionActive, canvasInteractionSettling, isDragging, setHoverId]);

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
        (typeof window !== "undefined" && window._pendingDragSelectionId) ||
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

  useEffect(() => {
    dragGuideObjectsRef.current = objetos;
  }, [objetos]);

  useEffect(() => {
    if (!hoverId || !activeInlineEditingId || hoverId !== activeInlineEditingId) return;
    setHoverId(null);
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
    interactionEpoch = 0
  ) => {
    const currentSelection = Array.isArray(seleccionActual) ? seleccionActual : [];
    const startedSelected = currentSelection.includes(dragId);
    const nextSession = {
      dragId,
      tipo,
      startedSelected,
      selectionSnapshot: [...currentSelection],
      needsDeferredCommit: !startedSelected,
      hadVisualSelection:
        currentSelection.length > 0 || Boolean(dragId),
      needsGuideCleanup: true,
      interactionEpoch: Number(interactionEpoch || 0),
    };

    dragSettleSessionRef.current = nextSession;

    if (!nextSession.needsDeferredCommit) {
      if (typeof window !== "undefined") {
        window._pendingDragSelectionId = null;
        window._pendingDragSelectionPhase = null;
      }
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

    if (typeof window !== "undefined") {
      window._pendingDragSelectionId = dragId;
      window._pendingDragSelectionPhase = "deferred-drag";
    }

    trackCanvasDragPerf("selection:defer-dragstart", {
      elementId: dragId,
      tipo,
      selectedSnapshot: currentSelection.join(","),
    }, {
      throttleMs: 40,
      throttleKey: `selection:defer-dragstart:${dragId}`,
    });
    return nextSession;
  }, []);

  const beginDragVisualSelection = useCallback((dragId, seleccionActual) => {
    const currentSelection = Array.isArray(seleccionActual) ? seleccionActual.filter(Boolean) : [];
    const nextSelection =
      currentSelection.length > 0
        ? currentSelection
        : (dragId ? [dragId] : []);

    setDragVisualSelectionIds((current) => {
      if (
        Array.isArray(current) &&
        current.length === nextSelection.length &&
        current.every((id, index) => id === nextSelection[index])
      ) {
        return current;
      }
      dragVisualSelectionIdsRef.current = nextSelection;
      return nextSelection;
    });
  }, []);

  const clearDragVisualSelection = useCallback(() => {
    dragVisualSelectionIdsRef.current = [];
    setDragVisualSelectionIds((current) => (
      Array.isArray(current) && current.length === 0 ? current : []
    ));
  }, []);

  const getPostDragSelectionSnapshots = useCallback(() => {
    const selectionFromState = sanitizeSelectionIds(elementosSeleccionados);
    const selectionFromWindow =
      typeof window !== "undefined" && Array.isArray(window._elementosSeleccionados)
        ? sanitizeSelectionIds(window._elementosSeleccionados)
        : [];
    const effectiveSelection =
      selectionFromWindow.length > 0 ? selectionFromWindow : selectionFromState;

    return {
      selectionFromState,
      selectionFromWindow,
      effectiveSelection,
    };
  }, [elementosSeleccionados]);

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
      cleanedGuides: false,
      selectionSnapshotFromState: [],
      selectionSnapshotFromWindow: [],
      currentSelectionSnapshot: [],
      nextSelectionSnapshot: [],
      visualSelectionSnapshot: [],
      hasWork: false,
    };

    if (!safeSession.dragId) {
      dragSettleSessionRef.current = createEmptyDragSettleSession();
      if (typeof window !== "undefined") {
        window._pendingDragSelectionId = null;
        window._pendingDragSelectionPhase = null;
      }
      return outcome;
    }

    if (typeof window !== "undefined") {
      window._pendingDragSelectionId = null;
      window._pendingDragSelectionPhase = null;
    }

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
        setElementosSeleccionados(nextSelectionSnapshot);
      }
    } else if (safeSession.startedSelected) {
      if (!effectiveSelection.includes(safeSession.dragId)) {
        outcome.restoredSelectionAfterDrag = true;
        nextSelectionSnapshot =
          safeSession.selectionSnapshot.length > 0
            ? sanitizeSelectionIds(safeSession.selectionSnapshot)
            : [safeSession.dragId];
        setElementosSeleccionados(nextSelectionSnapshot);
      }
    }
    outcome.nextSelectionSnapshot = [...nextSelectionSnapshot];

    const visualSelectionSnapshot = sanitizeSelectionIds(
      dragVisualSelectionIdsRef.current
    );
    outcome.visualSelectionSnapshot = [...visualSelectionSnapshot];
    outcome.deferredVisualSelectionCleanup = Boolean(
      safeSession.hadVisualSelection && visualSelectionSnapshot.length > 0
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
    setElementosSeleccionados,
  ]);

  const beginCanvasDragGesture = useCallback((dragId, tipo = null) => {
    return beginCanvasInteraction("drag", {
      dragId,
      tipo,
      source: "canvas-object",
    });
  }, [beginCanvasInteraction]);

  const queuePostDragUiRefresh = useCallback((dragId, tipo = null, source = "element-drag-end") => {
    const runPostDragUi = () => {
      const session = dragSettleSessionRef.current;
      if (!session?.dragId || session.dragId !== dragId) {
        if (typeof window !== "undefined") {
          window._pendingDragSelectionId = null;
          window._pendingDragSelectionPhase = null;
        }
        dragSettleSessionRef.current = createEmptyDragSettleSession();
        return;
      }

      const outcome = resolveDragSettleOutcome(session);
      if (!outcome.hasWork) return;

      logSelectedDragDebug("selection:post-drag-ui-refresh", {
        elementId: dragId,
        tipo,
        source,
        interactionEpoch: outcome.interactionEpoch,
        committedDeferredSelection: outcome.committedDeferredSelection,
        restoredSelectionAfterDrag: outcome.restoredSelectionAfterDrag,
        clearedVisualSelection: outcome.clearedVisualSelection,
        deferredVisualSelectionCleanup: outcome.deferredVisualSelectionCleanup,
        cleanedGuides: outcome.cleanedGuides,
        selectionSnapshotFromState: outcome.selectionSnapshotFromState,
        selectionSnapshotFromWindow: outcome.selectionSnapshotFromWindow,
        currentSelectionSnapshot: outcome.currentSelectionSnapshot,
        nextSelectionSnapshot: outcome.nextSelectionSnapshot,
        visualSelectionSnapshot: outcome.visualSelectionSnapshot,
        selectedIdsFromWindow:
          typeof window !== "undefined" && Array.isArray(window._elementosSeleccionados)
            ? [...window._elementosSeleccionados]
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
    elementosSeleccionados,
    resolveDragSettleOutcome,
    scheduleCanvasUiAfterSettle,
  ]);

  useEffect(() => {
    if (dragVisualSelectionIds.length === 0) return;
    if (isAnyCanvasDragActive || canvasInteractionActive || canvasInteractionSettling) {
      return;
    }

    const selectionFromState = sanitizeSelectionIds(elementosSeleccionados);
    const selectionFromWindow =
      typeof window !== "undefined" && Array.isArray(window._elementosSeleccionados)
        ? sanitizeSelectionIds(window._elementosSeleccionados)
        : [];

    logSelectedDragDebug("selection:drag-visual-cleanup", {
      source: "idle-handoff",
      visualSelectionSnapshot: [...dragVisualSelectionIds],
      selectedIdsFromState: selectionFromState,
      selectedIdsFromWindow: selectionFromWindow,
      sameAsState: areSelectionIdListsEqual(dragVisualSelectionIds, selectionFromState),
      sameAsWindow: areSelectionIdListsEqual(dragVisualSelectionIds, selectionFromWindow),
    });

    clearDragVisualSelection();
  }, [
    canvasInteractionActive,
    canvasInteractionSettling,
    clearDragVisualSelection,
    dragVisualSelectionIds,
    elementosSeleccionados,
    isAnyCanvasDragActive,
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
      setElementosSeleccionados((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        return [...prev, id];
      });
      if (typeof window !== "undefined") {
        window._pendingDragSelectionId = null;
        window._pendingDragSelectionPhase = null;
      }
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
      setElementosSeleccionados((prev) =>
        prev.length === 1 && prev[0] === id ? prev : [id]
      );
      if (typeof window !== "undefined") {
        window._pendingDragSelectionId =
          decision === "select_and_drag" ? id : null;
        window._pendingDragSelectionPhase =
          decision === "select_and_drag" ? "predrag" : null;
      }
      if (decision === "select_and_drag" && typeof window !== "undefined") {
        window._elementosSeleccionados = nextSelection;
      }
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
      setElementosSeleccionados((prev) =>
        prev.length === 1 && prev[0] === id ? prev : [id]
      );
      if (typeof window !== "undefined") {
        window._pendingDragSelectionId = null;
        window._pendingDragSelectionPhase = null;
      }
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
    setElementosSeleccionados,
    stageRef,
    startInlineFromDecision,
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
      typeof window !== "undefined" && Array.isArray(window._elementosSeleccionados)
      ? [...window._elementosSeleccionados]
      : [...elementosSeleccionados];
    const decision = decideInlineIntent({
      id,
      obj,
      event,
      meta,
      selectionSnapshot,
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
  ]);

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

  const requestBackgroundDecorationEdit = useCallback((sectionId, decorationId) => {
    const safeSectionId = String(sectionId || "").trim();
    const safeDecorationId = String(decorationId || "").trim();
    if (!safeSectionId || !safeDecorationId) return;

    if (editing.id) {
      requestInlineEditFinish?.("background-decoration-edit");
    }

    selectSectionAndClearInlineIntent(safeSectionId, "background-decoration-edit");
    setElementosSeleccionados([]);
    setElementosPreSeleccionados([]);
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
    editing.id,
    requestInlineEditFinish,
    selectSectionAndClearInlineIntent,
    setElementosPreSeleccionados,
    setElementosSeleccionados,
    setSectionDecorationEdit,
  ]);

  const handleStageMouseDownWithInlineIntent = useCallback((e) => {
    clearInlineActivation("canvas-mousedown", {
      targetClass: e?.target?.getClassName?.() || null,
    });
    clearInlineIntent("canvas-mousedown", {
      targetClass: e?.target?.getClassName?.() || null,
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
    requestInlineEditFinish,
    stageGestures,
  ]);

  const handleStageTouchStartWithInlineIntent = useCallback((e) => {
    clearInlineActivation("canvas-touchstart", {
      targetClass: e?.target?.getClassName?.() || null,
    });
    clearInlineIntent("canvas-touchstart", {
      targetClass: e?.target?.getClassName?.() || null,
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
      next[objIndex] = {
        ...current,
        x: Number.isFinite(cropAttrs.x) ? cropAttrs.x : current.x,
        y: Number.isFinite(cropAttrs.y)
          ? convertirAbsARel(cropAttrs.y, current.seccionId, seccionesOrdenadas)
          : current.y,
        width: Number.isFinite(cropAttrs.width) ? cropAttrs.width : current.width,
        height: Number.isFinite(cropAttrs.height) ? cropAttrs.height : current.height,
        cropX: Number.isFinite(cropAttrs.cropX) ? cropAttrs.cropX : current.cropX,
        cropY: Number.isFinite(cropAttrs.cropY) ? cropAttrs.cropY : current.cropY,
        cropWidth: Number.isFinite(cropAttrs.cropWidth)
          ? cropAttrs.cropWidth
          : current.cropWidth,
        cropHeight: Number.isFinite(cropAttrs.cropHeight)
          ? cropAttrs.cropHeight
          : current.cropHeight,
        ancho: Number.isFinite(cropAttrs.ancho) ? cropAttrs.ancho : current.ancho,
        alto: Number.isFinite(cropAttrs.alto) ? cropAttrs.alto : current.alto,
        rotation: Number.isFinite(cropAttrs.rotation)
          ? cropAttrs.rotation
          : (current.rotation || 0),
        scaleX: 1,
        scaleY: 1,
      };
      return next;
    });

    requestAnimationFrame(() => {
      if (typeof actualizarPosicionBotonOpciones === "function") {
        actualizarPosicionBotonOpciones("image-crop-preview");
      }
    });
  }, [
    actualizarPosicionBotonOpciones,
    convertirAbsARel,
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
      next[objIndex] = {
        ...current,
        x: Number.isFinite(cropAttrs.x) ? cropAttrs.x : current.x,
        y: Number.isFinite(cropAttrs.y)
          ? convertirAbsARel(cropAttrs.y, current.seccionId, seccionesOrdenadas)
          : current.y,
        width: Number.isFinite(cropAttrs.width) ? cropAttrs.width : current.width,
        height: Number.isFinite(cropAttrs.height) ? cropAttrs.height : current.height,
        cropX: Number.isFinite(cropAttrs.cropX) ? cropAttrs.cropX : current.cropX,
        cropY: Number.isFinite(cropAttrs.cropY) ? cropAttrs.cropY : current.cropY,
        cropWidth: Number.isFinite(cropAttrs.cropWidth)
          ? cropAttrs.cropWidth
          : current.cropWidth,
        cropHeight: Number.isFinite(cropAttrs.cropHeight)
          ? cropAttrs.cropHeight
          : current.cropHeight,
        ancho: Number.isFinite(cropAttrs.ancho) ? cropAttrs.ancho : current.ancho,
        alto: Number.isFinite(cropAttrs.alto) ? cropAttrs.alto : current.alto,
        rotation: Number.isFinite(cropAttrs.rotation)
          ? cropAttrs.rotation
          : (current.rotation || 0),
        scaleX: 1,
        scaleY: 1,
      };
      return next;
    });

    requestAnimationFrame(() => {
      if (typeof actualizarPosicionBotonOpciones === "function") {
        actualizarPosicionBotonOpciones("image-crop-commit");
      }
    });
  }, [
    actualizarPosicionBotonOpciones,
    convertirAbsARel,
    elementosSeleccionados,
    seccionesOrdenadas,
    setObjetos,
  ]);

  const handleImageCropInteractionStart = useCallback((payload = {}) => {
    setIsImageCropInteracting(true);
    setHoverId(null);
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
          seccionesOrdenadas={seccionesOrdenadas}
          altoCanvas={altoCanvas}
          onSelect={(id, e) => {
            e?.evt && (e.evt.cancelBubble = true);
            clearInlineIntent("non-inline-select", { id, tipo: "galeria" });
            setElementosSeleccionados([id]);
          }}
          onDragMovePersonalizado={(pos, id) => {
            window._isDragging = true;
            scheduleGuideEvaluation(pos, id);
          }}
          onDragStartPersonalizado={(dragId = obj.id) => {
            clearInlineIntent("drag-start", { dragId, tipo: "galeria" });
            const interactionEpoch = beginCanvasDragGesture(dragId, "galeria");
            startDragSettleSession(
              dragId,
              elementosSeleccionados,
              "galeria",
              interactionEpoch
            );
            beginDragVisualSelection(dragId, elementosSeleccionados);
            cancelScheduledGuideEvaluation();
            prepararGuias?.(dragId, objetos, elementRefs);
          }}
          onDragEndPersonalizado={() => {
            cancelScheduledGuideEvaluation();
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
              const updated = [...prev];
              updated[index] = { ...updated[index], ...nuevo };
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
          seccionesOrdenadas={seccionesOrdenadas}
          altoCanvas={altoCanvas}
          onSelect={(id, e) => {
            e?.evt && (e.evt.cancelBubble = true);
            clearInlineIntent("non-inline-select", { id, tipo: "countdown" });
            setElementosSeleccionados([id]);
          }}
          onDragStartPersonalizado={(dragId = obj.id) => {
            clearInlineIntent("drag-start", { dragId, tipo: "countdown" });
            const interactionEpoch = beginCanvasDragGesture(dragId, "countdown");
            startDragSettleSession(
              dragId,
              elementosSeleccionados,
              "countdown",
              interactionEpoch
            );
            beginDragVisualSelection(dragId, elementosSeleccionados);
            cancelScheduledGuideEvaluation();
            prepararGuias?.(dragId, objetos, elementRefs);
          }}
          onDragMovePersonalizado={(pos, id) => {
            scheduleGuideEvaluation(pos, id);
          }}
          onDragEndPersonalizado={() => {
            cancelScheduledGuideEvaluation();
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

              const { nuevaSeccion, coordenadasAjustadas } = determinarNuevaSeccion(
                cambios.y,
                objOriginal.seccionId,
                seccionesOrdenadas
              );

              let next = { ...cambios };
              delete next.finalizoDrag;

              if (nuevaSeccion) {
                next = { ...next, ...coordenadasAjustadas, seccionId: nuevaSeccion };
              } else {
                next.y = convertirAbsARel(cambios.y, objOriginal.seccionId, seccionesOrdenadas);
              }

              const updated = [...prev];
              updated[index] = { ...updated[index], ...next };
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
        editingId={editing.id}
        inlineOverlayMountedId={inlineOverlayMountedId}
        inlineOverlayMountSession={inlineOverlayMountSession}
        inlineVisibilityMode={inlineDebugAB.visibilitySource}
        inlineOverlayEngine={inlineDebugAB.overlayEngine}
        finishInlineEdit={finishEdit}
        onInlineEditPointer={
          isInEditMode ? onInlineEditCanvasPointer : null
        }
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
            const { nuevaSeccion, coordenadasAjustadas } = determinarNuevaSeccion(
              nuevo.y,
              objOriginal.seccionId,
              seccionesOrdenadas
            );

            let coordenadasFinales = { ...nuevo };
            delete coordenadasFinales.finalizoDrag;

            if (nuevaSeccion) {
              coordenadasFinales = {
                ...coordenadasFinales,
                ...coordenadasAjustadas,
                seccionId: nuevaSeccion,
              };
            } else {
              coordenadasFinales.y = convertirAbsARel(
                nuevo.y,
                objOriginal.seccionId,
                seccionesOrdenadas
              );
            }

            const seccionFinalId = coordenadasFinales.seccionId || objOriginal.seccionId;
            const yRelPx = Number.isFinite(coordenadasFinales.y) ? coordenadasFinales.y : 0;

            if (esSeccionPantallaById(seccionFinalId)) {
              const yNorm = Math.max(0, Math.min(1, yRelPx / ALTURA_PANTALLA_EDITOR));
              coordenadasFinales.yNorm = yNorm;
              delete coordenadasFinales.y;
            } else {
              coordenadasFinales.y = yRelPx;
              delete coordenadasFinales.yNorm;
            }

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

          if (isGroupPipeline) {
            return;
          }

          const seleccionActual = Array.isArray(window._elementosSeleccionados)
            ? window._elementosSeleccionados
            : elementosSeleccionados;
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
            interactionEpoch
          );
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
        }}
        onDragEndPersonalizado={isInEditMode ? null : (dragId = obj.id, meta = null) => {
          const isGroupPipeline = meta?.pipeline === "group";
          cancelScheduledGuideEvaluation();
          if (!isGroupPipeline) {
            queuePostDragUiRefresh(obj.id, obj.tipo || null, "element-drag-end");
          }
          endCanvasInteraction("drag", {
            dragId,
            tipo: obj.tipo || null,
            source: isGroupPipeline ? "group-drag-end" : "element-drag-end",
          });
        }}
        onDragMovePersonalizado={isInEditMode ? null : (pos, elementId, meta = null) => {
          if (meta?.pipeline === "group") return;
          scheduleGuideEvaluation(pos, elementId);
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



                  {seleccionActiva && areaSeleccion && (
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


                  {!editing.id &&
                    !sectionDecorationEdit &&
                    elementosSeleccionados.length > 0 && (() => {
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
                        scheduleCanvasUiAfterSettle={scheduleCanvasUiAfterSettle}
                        cancelCanvasUiAfterSettle={
                          canvasInteractionApi.cancelCanvasUiAfterSettle
                        }
                        onTransformInteractionStart={handleTransformInteractionStartWithInlineIntent}
                        onTransformInteractionEnd={handleTransformInteractionEndWithInlineIntent}
                        onTransform={(newAttrs) => {
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
                  {!editing.id && !isAnyCanvasDragActive && !isImageRotateInteractionActive && (
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

                  {!window._resizeData?.isResizing &&
                    !isDragging &&
                    !window._isDragging &&
                    !window._grupoLider && (
                    <HoverIndicator
                      hoveredElement={effectiveHoverId}
                      elementRefs={elementRefs}
                      objetos={objetos}
                      activeInlineEditingId={activeInlineEditingId}
                      isMobile={isMobile}
                    />
                  )}



                  {/* ?? Controles especiales para lÃ­neas seleccionadas */}
                  {!isAnyCanvasDragActive && !isImageRotateInteractionActive && elementosSeleccionados.length === 1 && (() => {
                    const elementoSeleccionado = objetos.find(obj => obj.id === elementosSeleccionados[0]);
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
                    if (
                      editing.id ||
                      sectionDecorationEdit ||
                      !isCanvasDragGestureActive
                    ) {
                      return null;
                    }

                    const indicatorSelectionIds =
                      dragVisualSelectionIds.length > 0
                        ? dragVisualSelectionIds
                        : elementosSeleccionados;

                    if (indicatorSelectionIds.length === 0) return null;

                    return (
                      <SelectionBoundsIndicator
                        selectedElements={indicatorSelectionIds}
                        elementRefs={elementRefs}
                        objetos={objetos}
                        isMobile={isMobile}
                        bringToFront
                      />
                    );
                  })()}

                </CanvasElementsLayer>

              </Stage>
  );
}
