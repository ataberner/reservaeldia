import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Stage, Line, Rect, Text, Group, Circle } from "react-konva";
import CanvasElementsLayer from "@/components/canvas/CanvasElementsLayer";
import FondoSeccion from "@/components/editor/FondoSeccion";
import GaleriaKonva from "@/components/editor/GaleriaKonva";
import CountdownKonva from "@/components/editor/countdown/CountdownKonva";
import ElementoCanvas from "@/components/ElementoCanvas";
import SelectionBounds from "@/components/SelectionBounds";
import ImageCropOverlay from "@/components/editor/textSystem/render/konva/ImageCropOverlay";
import InlineTextEditDecorationsLayer from "@/components/editor/textSystem/render/konva/InlineTextEditDecorationsLayer";
import HoverIndicator from "@/components/HoverIndicator";
import LineControls from "@/components/LineControls";
import { calcularOffsetY } from "@/utils/layout";
import { resolveKonvaFill } from "@/domain/colors/presets";
import {
  getCurrentInlineEditingId,
  setCurrentInlineEditingId,
} from "@/components/editor/textSystem/bridges/window/inlineWindowBridge";
import {
  resolveInlineKonvaTextNode,
} from "@/components/editor/overlays/inlineGeometry";
import {
  emitInlineFocusRcaEvent,
} from "@/components/editor/textSystem/debug/inlineFocusOperationalDebug";
import {
  readClientPointFromCanvasEvent,
} from "@/components/editor/textSystem/services/textCanvasPointerService";
import {
  buildSelectionFramePolygon,
  getSelectionFramePadding,
} from "@/components/editor/textSystem/render/konva/selectionFrameVisuals";

const INLINE_INTENT_STALE_MS = 1500;

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

function isRsvpInlineEditableObject(obj) {
  return obj?.tipo === "rsvp-boton";
}

function isSemanticInlineEditableObject(obj) {
  return (
    obj?.tipo === "texto" ||
    isRectInlineEditableObject(obj) ||
    isRsvpInlineEditableObject(obj)
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
  mobileBackgroundEditSectionId,
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
  mostrarGuias,
  elementRefs,
  actualizarPosicionBotonOpciones,
  setIsDragging,
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
  actualizarLinea,
  guiaLineas,
  handleTransformInteractionStart,
  handleTransformInteractionEnd,
  normalizarMedidasGaleria,
  setElementosSeleccionados,
}) {
  const inlineIntentRef = useRef({ candidateId: null, armedAtMs: 0 });
  const inlineActivationRef = useRef({
    openingId: null,
    openingAtMs: 0,
  });
  const [isImageCropInteracting, setIsImageCropInteracting] = useState(false);
  const activeInlineEditingId =
    editing.id ||
    getCurrentInlineEditingId() ||
    (inlineOverlayMountSession?.mounted ? inlineOverlayMountSession.id : null) ||
    inlineOverlayMountedId ||
    null;

  useEffect(() => {
    if (!hoverId || !activeInlineEditingId || hoverId !== activeInlineEditingId) return;
    setHoverId(null);
  }, [activeInlineEditingId, hoverId, setHoverId]);

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
        (targetObj?.tipo === "rsvp-boton" ? "Confirmar asistencia" : "")
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
      targetObj?.tipo === "texto" &&
      !targetObj.__groupAlign &&
      !Number.isFinite(targetObj.width) &&
      targetObj.__autoWidth !== false;
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
        decision: "select_only",
        gesture,
        reason: "non-inline-target",
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
      decision: "select_only",
      gesture,
      reason: "select-first-gesture",
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
      clearInlineIntent("multiselect-toggle", { id, gesture });
      emitInlineFocusRcaEvent("intent-multiselect-toggle", {
        editingId: id,
        extra: {
          gesture,
          decision,
          reason: reason || null,
        },
      });
      return;
    }

    if (decision === "select_only") {
      setElementosSeleccionados((prev) =>
        prev.length === 1 && prev[0] === id ? prev : [id]
      );
      if (isSemanticInlineEditableObject(obj)) {
        armInlineIntent(id, "first-valid-selection", { gesture });
      } else {
        clearInlineIntent("non-inline-selection", { id, gesture });
      }
      logInlineIntent("gate-select-only", { id, gesture });
      emitInlineFocusRcaEvent("intent-select-only", {
        editingId: id,
        extra: {
          gesture,
          decision,
          reason: reason || null,
        },
      });
      return;
    }

    if (decision === "start_inline") {
      setElementosSeleccionados((prev) =>
        prev.length === 1 && prev[0] === id ? prev : [id]
      );
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

    applyInlineIntentDecision({
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

  const handleTransformInteractionStartWithInlineIntent = useCallback((...args) => {
    clearInlineActivation("transform-start", {
      selected: [...elementosSeleccionados],
    });
    clearInlineIntent("transform-start", {
      selected: [...elementosSeleccionados],
    });
    if (typeof handleTransformInteractionStart === "function") {
      handleTransformInteractionStart(...args);
    }
  }, [clearInlineActivation, clearInlineIntent, elementosSeleccionados, handleTransformInteractionStart]);

  const handleTransformInteractionEndWithInlineIntent = useCallback((...args) => {
    clearInlineActivation("transform-end", {
      selected: [...elementosSeleccionados],
    });
    clearInlineIntent("transform-end", {
      selected: [...elementosSeleccionados],
    });
    if (typeof handleTransformInteractionEnd === "function") {
      handleTransformInteractionEnd(...args);
    }
  }, [clearInlineActivation, clearInlineIntent, elementosSeleccionados, handleTransformInteractionEnd]);

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

  return (
              <Stage
                ref={stageRef}
                width={800}
                height={altoCanvasDinamico}
                perfectDrawEnabled={false}
                listening={true}
                imageSmoothingEnabled={false}
                preventDefault={false}
                hitGraphEnabled={true}
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
                <CanvasElementsLayer>

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
                      seccion.fondoTipo === "imagen" ? (
                        <FondoSeccion
                          key={`fondo-${seccion.id}`}
                          seccion={seccion}
                          offsetY={offsetY}
                          alturaPx={alturaPx}
                          onSelect={() => selectSectionAndClearInlineIntent(seccion.id, "section-bg-image-select")}
                          onUpdateFondoOffset={actualizarOffsetFondo}
                          isMobile={isMobile}
                          mobileBackgroundEditEnabled={mobileBackgroundEditSectionId === seccion.id}
                          onBackgroundImageStatusChange={handleBackgroundImageStatusChange}
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



                  {objetos.map((obj, i) => {
                    // ?? Determinar si estÃ¡ en modo ediciÃ³n
                    const isInlineEditableObject = obj.tipo === "texto";
                    const isInEditMode =
                      isInlineEditableObject &&
                      editing.id === obj.id &&
                      elementosSeleccionados[0] === obj.id;

                    // ??? Caso especial: la galerÃ­a la renderizamos acÃ¡ (no usa ElementoCanvas)
                    if (obj.tipo === "galeria") {

                      return (
                        <GaleriaKonva
                          key={obj.id}
                          obj={obj}
                          registerRef={registerRef}
                          onHover={setHoverId}
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
                            mostrarGuias(pos, id, objetos, elementRefs);
                            requestAnimationFrame(() => {
                              if (typeof actualizarPosicionBotonOpciones === "function") {
                                actualizarPosicionBotonOpciones();
                              }
                            });
                          }}
                          onDragStartPersonalizado={(dragId = obj.id) => {
                            clearInlineIntent("drag-start", { dragId, tipo: "galeria" });
                            if (!elementosSeleccionados.includes(dragId)) {
                              setElementosSeleccionados([dragId]);
                            }
                            setHoverId(null);
                            setIsDragging(true);
                          }}
                          onDragEndPersonalizado={() => {
                            setIsDragging(false);
                            limpiarGuias();
                            if (typeof actualizarPosicionBotonOpciones === "function") {
                              actualizarPosicionBotonOpciones();
                            }
                          }}
                          onChange={(id, nuevo) => {
                            setObjetos((prev) => {
                              const i = prev.findIndex((o) => o.id === id);
                              if (i === -1) return prev;
                              const updated = [...prev];
                              updated[i] = { ...updated[i], ...nuevo };
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
                          onHover={setHoverId}
                          isSelected={elementosSeleccionados.includes(obj.id)}
                          seccionesOrdenadas={seccionesOrdenadas}
                          altoCanvas={altoCanvas}

                          // ? selecciÃ³n
                          onSelect={(id, e) => {
                            e?.evt && (e.evt.cancelBubble = true);
                            clearInlineIntent("non-inline-select", { id, tipo: "countdown" });
                            setElementosSeleccionados([id]);
                          }}

                          // ? PREVIEW liviano (no tocar estado del objeto para que no haya lag)
                          onDragStartPersonalizado={(dragId = obj.id) => {
                            clearInlineIntent("drag-start", { dragId, tipo: "countdown" });
                            if (!elementosSeleccionados.includes(dragId)) {
                              setElementosSeleccionados([dragId]);
                            }
                            setHoverId(null);
                            setIsDragging(true);
                          }}
                          onDragMovePersonalizado={(pos, id) => {
                            mostrarGuias(pos, id, objetos, elementRefs);
                            requestAnimationFrame(() => {
                              if (typeof actualizarPosicionBotonOpciones === "function") {
                                actualizarPosicionBotonOpciones();
                              }
                            });
                          }}

                          // ? FIN de drag: limpiar guÃ­as / UI auxiliar
                          onDragEndPersonalizado={() => {
                            setIsDragging(false);
                            limpiarGuias();
                            if (typeof actualizarPosicionBotonOpciones === "function") {
                              actualizarPosicionBotonOpciones();
                            }
                          }}

                          // ? refs para el motor de drag
                          dragStartPos={dragStartPos}
                          hasDragged={hasDragged}

                          // ? Â¡Clave! Al finalizar, tratamos x/y absolutas como en ElementoCanvas:
                          onChange={(id, cambios) => {
                            setObjetos(prev => {
                              const i = prev.findIndex(o => o.id === id);
                              if (i === -1) return prev;

                              const objOriginal = prev[i];

                              // ?? Si no es final de drag, mergeamos sin mÃ¡s (no tocar coords)
                              if (!cambios.finalizoDrag) {
                                const updated = [...prev];
                                updated[i] = { ...updated[i], ...cambios };
                                return updated;
                              }

                              // ?? Final de drag: 'cambios.y' viene ABSOLUTA (Stage coords)
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
                                // convertir y absoluta ? y relativa a la secciÃ³n actual
                                next.y = convertirAbsARel(cambios.y, objOriginal.seccionId, seccionesOrdenadas);
                              }

                              const updated = [...prev];
                              updated[i] = { ...updated[i], ...next };
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
                          const shouldKeepCenterPreview =
                            obj.tipo === "texto" &&
                            !obj.__groupAlign &&
                            !Number.isFinite(obj.width) &&
                            obj.__autoWidth !== false;

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
                          // ?? yLocal: en secciÃ³n pantalla usamos yNorm * 500
                          // fallback legacy: si no hay yNorm, usamos obj.y
                          y: (() => {
                            const idxSec = seccionesOrdenadas.findIndex(s => s.id === objPreview.seccionId);
                            const offsetY = calcularOffsetY(seccionesOrdenadas, idxSec);

                            const yLocal = esSeccionPantallaById(objPreview.seccionId)
                              ? (Number.isFinite(objPreview.yNorm) ? (objPreview.yNorm * ALTURA_PANTALLA_EDITOR) : objPreview.y)
                              : objPreview.y;

                            return yLocal + offsetY;
                          })(),
                        }}
                        anchoCanvas={800}
                        isSelected={!isInEditMode && elementosSeleccionados.includes(obj.id)}
                        selectionCount={elementosSeleccionados.length}
                        preSeleccionado={!isInEditMode && elementosPreSeleccionados.includes(obj.id)}
                        isInEditMode={isInEditMode} // ?? NUEVA PROP
                        onHover={isInEditMode ? null : setHoverId}
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


                          // ?? NUEVO: Manejar preview inmediato de drag grupal
                          if (nuevo.isDragPreview) {

                            setObjetos(prev => {
                              const index = prev.findIndex(o => o.id === id);
                              if (index === -1) return prev;

                              const updated = [...prev];
                              const { isDragPreview, skipHistorial, ...cleanNuevo } = nuevo;
                              updated[index] = { ...updated[index], ...cleanNuevo };
                              return updated;
                            });
                            return;
                          }

                          // ?? MANEJAR SOLO batch update final de drag grupal
                          if (nuevo.isBatchUpdateFinal && id === 'BATCH_UPDATE_GROUP_FINAL') {

                            const { elementos, dragInicial, deltaX, deltaY } = nuevo;

                            setObjetos(prev => {
                              return prev.map(objeto => {
                                if (elementos.includes(objeto.id)) {
                                  if (dragInicial && dragInicial[objeto.id]) {
                                    const posInicial = dragInicial[objeto.id];
                                    return {
                                      ...objeto,
                                      x: posInicial.x + deltaX,
                                      y: posInicial.y + deltaY
                                    };
                                  }
                                }
                                return objeto;
                              });
                            });
                            return;
                          }

                          // ?? NO procesar si viene del Transform
                          if (nuevo.fromTransform) {

                            return;
                          }

                          const objOriginal = objetos.find((o) => o.id === id);
                          if (!objOriginal) return;

                          // ?? Para drag final, procesar inmediatamente
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
                                seccionId: nuevaSeccion
                              };
                            } else {
                              coordenadasFinales.y = convertirAbsARel(
                                nuevo.y,
                                objOriginal.seccionId,
                                seccionesOrdenadas
                              );
                            }

                            // 1) Determinar secciÃ³n final
                            const seccionFinalId = coordenadasFinales.seccionId || objOriginal.seccionId;

                            // 2) Obtener yRelPx (y relativa dentro de la secciÃ³n en px)
                            let yRelPx;

                            if (nuevaSeccion) {
                              // coordenadasAjustadas normalmente ya trae y relativa
                              yRelPx = Number.isFinite(coordenadasFinales.y) ? coordenadasFinales.y : 0;
                            } else {
                              // si no cambiÃ³ de secciÃ³n, convertimos desde y absoluta
                              yRelPx = Number.isFinite(coordenadasFinales.y) ? coordenadasFinales.y : 0;
                            }

                            // 3) Aplicar polÃ­tica pantalla: guardar yNorm
                            if (esSeccionPantallaById(seccionFinalId)) {
                              const yNorm = Math.max(0, Math.min(1, yRelPx / ALTURA_PANTALLA_EDITOR));
                              coordenadasFinales.yNorm = yNorm;
                              delete coordenadasFinales.y; // ? clave: evitamos mezclar sistemas
                            } else {
                              // fijo: guardar y en px
                              coordenadasFinales.y = yRelPx;
                              delete coordenadasFinales.yNorm;
                            }



                            // Actualizar inmediatamente
                            setObjetos(prev => {
                              const index = prev.findIndex(o => o.id === id);
                              if (index === -1) return prev;

                              const updated = [...prev];
                              updated[index] = { ...updated[index], ...coordenadasFinales };
                              return updated;
                            });

                            return;
                          }

                          // ?? Para otros cambios (transform, etc.)
                          const hayDiferencias = Object.keys(nuevo).some(key => {
                            const valorAnterior = objOriginal[key];
                            const valorNuevo = nuevo[key];

                            if (typeof valorAnterior === 'number' && typeof valorNuevo === 'number') {
                              return Math.abs(valorAnterior - valorNuevo) > 0.01;
                            }

                            return valorAnterior !== valorNuevo;
                          });

                          if (!hayDiferencias) return;

                          const seccionId = nuevo.seccionId || objOriginal.seccionId;
                          const seccion = seccionesOrdenadas.find((s) => s.id === seccionId);
                          if (!seccion) return;

                          setObjetos(prev => {
                            const index = prev.findIndex(o => o.id === id);
                            if (index === -1) return prev;

                            const updated = [...prev];
                            updated[index] = { ...updated[index], ...nuevo };
                            return updated;
                          });
                        }}
                        onDragStartPersonalizado={isInEditMode ? null : (dragId = obj.id, e) => {
                          clearInlineIntent("drag-start", { dragId });
                          const seleccionActual = Array.isArray(window._elementosSeleccionados)
                            ? window._elementosSeleccionados
                            : elementosSeleccionados;

                          if (!seleccionActual.includes(dragId)) {
                            setElementosSeleccionados([dragId]);
                          }

                          flushSync(() => {
                            setHoverId(null);
                            setElementosPreSeleccionados([]);
                            setIsDragging(true);
                          });
                        }}
                        onDragEndPersonalizado={isInEditMode ? null : () => {
                          setIsDragging(false);
                          configurarDragEnd([]);
                        }}
                        onDragMovePersonalizado={isInEditMode ? null : (pos, elementId) => {
                          mostrarGuias(pos, elementId, objetos, elementRefs);
                          if (elementosSeleccionados.includes(elementId)) {
                            requestAnimationFrame(() => {
                              if (typeof actualizarPosicionBotonOpciones === 'function') {
                                actualizarPosicionBotonOpciones();
                              }
                            });
                          }
                        }}
                        dragStartPos={dragStartPos}
                        hasDragged={hasDragged}
                      />
                    );
                  })}

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


                  {!editing.id && elementosSeleccionados.length > 0 && (() => {
                    return (
                      <SelectionBounds
                        selectedElements={elementosSeleccionados}
                        elementRefs={elementRefs}
                        objetos={objetos}
                        isDragging={isDragging}
                        isInteractionLocked={isImageCropInteracting}
                        isMobile={isMobile}
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
                                  // Countdown: durante preview dejamos que Konva escale el nodo
                                  // sin tocar estado React para evitar desincronizaciÃ³n con Transformer.
                                  if (
                                    elemento.tipo === "countdown" ||
                                    (
                                      elemento.tipo === "forma" &&
                                      (elemento.figura === "circle" || elemento.figura === "triangle")
                                    )
                                  ) {
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
                                requestAnimationFrame(() => {
                                  if (typeof actualizarPosicionBotonOpciones === 'function') {
                                    actualizarPosicionBotonOpciones();
                                  }
                                });

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
                                    scaleX: Number.isFinite(cleanAttrs.scaleX) ? cleanAttrs.scaleX : (objOriginal.scaleX ?? 1),
                                    scaleY: Number.isFinite(cleanAttrs.scaleY) ? cleanAttrs.scaleY : (objOriginal.scaleY ?? 1),
                                  };
                                  delete finalAttrs.width;
                                  delete finalAttrs.height;
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

                                if (objOriginal.tipo === "countdown" || objOriginal.tipo === "texto") {
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
                                  actualizarObjeto(objIndex, finalAttrs);
                                } else {
                                  requestAnimationFrame(() => {
                                    actualizarObjeto(objIndex, finalAttrs);
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
                  {!editing.id && (
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
                      hoveredElement={hoverId}
                      elementRefs={elementRefs}
                      objetos={objetos}
                      activeInlineEditingId={activeInlineEditingId}
                      isMobile={isMobile}
                    />
                  )}



                  {/* ?? Controles especiales para lÃ­neas seleccionadas */}
                  {elementosSeleccionados.length === 1 && (() => {
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
                  {guiaLineas.map((linea, i) => {
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

                {/* ? Overlay superior: borde de secciÃ³n activa SIEMPRE arriba de todo */}
                <CanvasElementsLayer>
                  {(() => {
                    if (!seccionActivaId) return null;

                    const index = seccionesOrdenadas.findIndex(s => s.id === seccionActivaId);
                    if (index === -1) return null;

                    const seccion = seccionesOrdenadas[index];
                    const offsetY = calcularOffsetY(seccionesOrdenadas, index, altoCanvas);
                    const estaAnimando = seccionesAnimando.includes(seccion.id);

                    return (
                      <Rect
                        key={`overlay-border-seccion-${seccion.id}`}
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
                      />
                    );
                  })()}
                </CanvasElementsLayer>

              </Stage>
  );
}
