// src/components/editor/countdown/CountdownKonva.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { flushSync } from "react-dom";
import { Group, Image as KonvaImage, Rect, Text } from "react-konva";
import useImage from "use-image";
import { getRemainingParts, fmt } from "./countdownUtils";
import { calcularOffsetY } from "@/utils/layout";
import {
  estimateCountdownUnitHeight,
  resolveCountdownUnitWidth,
  resolveCanvasPaint,
} from "@/domain/countdownPresets/renderModel";
import { recordCountdownAuditSnapshot } from "@/domain/countdownAudit/runtime";
import { resolveKonvaFill } from "@/domain/colors/presets";
import { notePostDragSelectionGuard } from "@/components/editor/canvasEditor/postDragSelectionGuard";
import {
  getCountdownRepeatDragActiveState,
  getCountdownRepeatDragNodeIdentity,
  isCountdownRepeatDragDebugEnabled,
  publishCountdownRepeatDragDebugEntry,
  setCountdownRepeatDragActiveState,
} from "@/components/editor/canvasEditor/countdownRepeatDragDebug";
import {
  EDITOR_BRIDGE_EVENTS,
  buildEditorDragLifecycleDetail,
} from "@/lib/editorBridgeContracts";
import { resolveCountdownTargetIso } from "../../../../shared/renderContractPolicy.js";

import { startDragGrupalLider, previewDragGrupal, endDragGrupal } from "@/drag/dragGrupal";
import { startDragIndividual, previewDragIndividual, endDragIndividual } from "@/drag/dragIndividual";

const UNIT_LABELS = Object.freeze({
  days: "Dias",
  hours: "Horas",
  minutes: "Min",
  seconds: "Seg",
});

const DEFAULT_UNITS = Object.freeze(["days", "hours", "minutes", "seconds"]);
let countdownRepeatDragDebugInstanceCounter = 0;

function normalizeUnits(value) {
  if (!Array.isArray(value)) return [...DEFAULT_UNITS];
  const out = [];
  value.forEach((unit) => {
    const safe = String(unit || "").trim();
    if (!UNIT_LABELS[safe]) return;
    if (!out.includes(safe)) out.push(safe);
  });
  return out.length > 0 ? out : [...DEFAULT_UNITS];
}

function applyLabelTransform(label, mode) {
  const safe = String(label || "");
  if (mode === "uppercase") return safe.toUpperCase();
  if (mode === "lowercase") return safe.toLowerCase();
  if (mode === "capitalize") return safe.replace(/\b\w/g, (m) => m.toUpperCase());
  return safe;
}

function toFinite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getClientPoint(evt) {
  if (!evt) return null;
  const touch = evt.touches?.[0] || evt.changedTouches?.[0] || null;
  const x = Number.isFinite(touch?.clientX) ? touch.clientX : evt.clientX;
  const y = Number.isFinite(touch?.clientY) ? touch.clientY : evt.clientY;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function getEventTimeStampMs(evt) {
  const timeStamp = Number(evt?.timeStamp);
  return Number.isFinite(timeStamp) ? timeStamp : null;
}

function resolvePointerType(evt) {
  if (evt?.pointerType) return String(evt.pointerType).toLowerCase();
  if (evt?.touches || evt?.changedTouches) return "touch";
  return "mouse";
}

function getDragIntentThreshold(pointerType) {
  if (pointerType === "touch" || pointerType === "pen") return 4;
  return 1;
}

function buildKonvaTextFillProps(fillMeta, fallback = "#111827") {
  if (!fillMeta?.hasGradient) {
    return { fill: fillMeta?.fillColor || fallback };
  }

  return {
    fill: fillMeta.fillColor || fallback,
    fillPriority: "linear-gradient",
    fillLinearGradientStartPoint: fillMeta.startPoint || { x: 0, y: 0 },
    fillLinearGradientEndPoint: fillMeta.endPoint || { x: 1, y: 1 },
    fillLinearGradientColorStops: [
      0,
      fillMeta.gradientFrom || fillMeta.fillColor || fallback,
      1,
      fillMeta.gradientTo || fillMeta.fillColor || fallback,
    ],
  };
}

/**
 * ✅ Comportamiento correcto:
 * - Click simple: SOLO selecciona (0 movimiento)
 * - Drag: SOLO si mantiene apretado + supera un umbral por tipo de puntero
 *
 * ✅ Implementación pro:
 * - El nodo está draggable=false siempre.
 * - En mousedown/touchstart: empezamos un "press".
 * - En pointer/mouse/touch move global: si supera umbral => habilitamos draggable y llamamos startDrag()
 * - En mouseup/touchend global: si no llegó a umbral => no hubo drag; si hubo => cerramos y deshabilitamos.
 */
export default function CountdownKonva({
  obj,
  registerRef,
  onHover,
  isSelected = false,
  selectionCount = 0,
  seccionesOrdenadas,
  altoCanvas,
  ALTURA_PANTALLA_EDITOR,
  onSelect,
  onChange,
  onDragStartPersonalizado,
  onDragMovePersonalizado,
  onDragEndPersonalizado,
  dragStartPos,
  hasDragged,
  onPredragVisualSelectionStart = null,
  onPredragVisualSelectionCancel = null,
  selectionRuntime = null,
  isPassiveRender = false,
}) {
  const rootRef = useRef(null);
  const pressSessionCounterRef = useRef(0);
  const debugRenderCountRef = useRef(0);
  const debugRenderSnapshotRef = useRef(null);
  const dragMoveDebugRef = useRef({
    lastLogAtMs: 0,
    lastX: null,
    lastY: null,
  });
  const lastRootNodeIdentityRef = useRef(null);
  const debugInstanceIdRef = useRef(null);

  if (!debugInstanceIdRef.current) {
    countdownRepeatDragDebugInstanceCounter += 1;
    debugInstanceIdRef.current = `countdown:${obj.id || "unknown"}:${countdownRepeatDragDebugInstanceCounter}`;
  }
  debugRenderCountRef.current += 1;

  // Tick cada 1s (no re-render si estamos arrastrando)
  const [tick, setTick] = useState(0);
  const [reactDraggableEnabled, setReactDraggableEnabled] = useState(false);
  const draggingRef = useRef(false);
  const pendingPrimarySelectionClickGuardRef = useRef({
    elementId: null,
    expiresAt: 0,
  });

  useEffect(() => {
    const t = setInterval(() => {
      if (!draggingRef.current) setTick((n) => (n + 1) % 60);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Registrar nodo raíz
  const setRefs = useCallback(
    (node) => {
      const previousNode = rootRef.current || null;
      const previousNodeIdentity = getCountdownRepeatDragNodeIdentity(previousNode);
      const nextNodeIdentity = getCountdownRepeatDragNodeIdentity(node);

      if (previousNode && previousNode !== node) {
        lastRootNodeIdentityRef.current = previousNodeIdentity;
      }

      rootRef.current = node;

      if (previousNode !== node) {
        if (previousNode) {
          const detachEntry = {
            event: "ref-detach",
            elementId: obj.id || null,
            instanceId: debugInstanceIdRef.current,
            renderCount: debugRenderCountRef.current,
            previousNodeIdentity,
            nextNodeIdentity,
          };
          if (isCountdownRepeatDragDebugEnabled()) {
            publishCountdownRepeatDragDebugEntry(detachEntry);
            console.log("[COUNTDOWN_REPEAT_DRAG]", detachEntry);
          }
        }

        if (node) {
          lastRootNodeIdentityRef.current = nextNodeIdentity;
          const attachEntry = {
            event: "ref-attach",
            elementId: obj.id || null,
            instanceId: debugInstanceIdRef.current,
            renderCount: debugRenderCountRef.current,
            previousNodeIdentity,
            nodeIdentity: nextNodeIdentity,
          };
          if (isCountdownRepeatDragDebugEnabled()) {
            publishCountdownRepeatDragDebugEntry(attachEntry);
            console.log("[COUNTDOWN_REPEAT_DRAG]", attachEntry);
          }
        }
      }

      if (typeof registerRef === "function") registerRef(obj.id, node || null);
    },
    [obj.id, registerRef]
  );

  // y absoluta = y relativa + offset de sección
  const yAbs = useMemo(() => {
    if (isPassiveRender) {
      return Number.isFinite(Number(obj?.y)) ? Number(obj.y) : 0;
    }

    const idx = seccionesOrdenadas.findIndex((s) => s.id === obj.seccionId);
    const safe = idx >= 0 ? idx : 0;
    const off = calcularOffsetY(seccionesOrdenadas, safe, altoCanvas) || 0;
    const sectionMode = String(
      seccionesOrdenadas.find((section) => section?.id === obj?.seccionId)?.altoModo || ""
    ).trim().toLowerCase();
    const yNorm = Number(obj?.yNorm);
    const yFallback = Number.isFinite(Number(obj?.y)) ? Number(obj.y) : 0;
    const usesYNorm =
      sectionMode === "pantalla" &&
      Number.isFinite(yNorm) &&
      Number.isFinite(ALTURA_PANTALLA_EDITOR) &&
      ALTURA_PANTALLA_EDITOR > 0;
    const yLocal = usesYNorm
      ? yNorm * ALTURA_PANTALLA_EDITOR
      : yFallback;
    return yLocal + off;
  }, [
    ALTURA_PANTALLA_EDITOR,
    altoCanvas,
    obj?.seccionId,
    obj?.y,
    obj?.yNorm,
    seccionesOrdenadas,
  ]);

  // Tiempo restante
  const countdownTarget = useMemo(
    () => resolveCountdownTargetIso(obj || null),
    [obj.fechaObjetivo, obj.targetISO, obj.fechaISO]
  );
  const state = useMemo(
    () => getRemainingParts(countdownTarget.targetISO),
    [countdownTarget.targetISO, tick]
  );

  const visibleUnits = useMemo(
    () => normalizeUnits(obj.visibleUnits),
    [obj.visibleUnits]
  );

  const parts = useMemo(() => {
    const values = {
      days: fmt(state.d, obj.padZero),
      hours: fmt(state.h, obj.padZero),
      minutes: fmt(state.m, obj.padZero),
      seconds: fmt(state.s, obj.padZero),
    };

    return visibleUnits.map((unit) => ({
      key: unit,
      value: values[unit],
      label: UNIT_LABELS[unit],
    }));
  }, [state.d, state.h, state.m, state.s, obj.padZero, visibleUnits]);

  // Layout (countdown v2 + fallback legacy)
  const n = Math.max(1, parts.length);
  const frameSvgUrl = String(obj.frameSvgUrl || "").trim();
  const hasFrameConfigured = frameSvgUrl.length > 0;
  const gap = Math.max(0, toFinite(obj.gap, 8));
  const framePadding = Math.max(0, toFinite(obj.framePadding, 10));
  const paddingY = Math.max(2, toFinite(obj.paddingY, 6));
  const paddingX = Math.max(2, toFinite(obj.paddingX, 8));
  const valueSize = Math.max(10, toFinite(obj.fontSize, 16));
  const labelSize = Math.max(8, toFinite(obj.labelSize, 10));
  const showLabels = obj.showLabels !== false;
  const distribution = String(obj.distribution || obj.layoutType || 'centered');
  const layoutType = String(obj.layoutType || 'singleFrame');
  const useSingleFrameLayout = layoutType === "singleFrame" && hasFrameConfigured;
  const useMultiUnitFrame = layoutType === "multiUnit" && hasFrameConfigured;
  const labelTransform = String(obj.labelTransform || 'uppercase');
  const lineHeight = Math.max(0.8, toFinite(obj.lineHeight, 1.05));
  const letterSpacing = toFinite(obj.letterSpacing, 0);
  const frameStrokeColor = resolveCanvasPaint(obj.frameColor, "#773dbe");
  const unitFillColor = resolveCanvasPaint(obj.boxBg, "transparent");
  const unitStrokeColor = resolveCanvasPaint(obj.boxBorder, "transparent");
  const backgroundColor = resolveCanvasPaint(obj.background, "transparent");

  const requestedChipW = Math.max(36, toFinite(obj.chipWidth, 46) + paddingX * 2);
  const textDrivenChipH = Math.max(
    44,
    paddingY * 2 + valueSize + (showLabels ? labelSize + 6 : 0)
  );
  const layoutDrivenChipH = estimateCountdownUnitHeight({
    tamanoBase: toFinite(obj.tamanoBase, 320),
    distribution,
    unitsCount: n,
  });
  const chipH = Math.max(textDrivenChipH, layoutDrivenChipH);
  const unitBoxRadius = Math.max(0, toFinite(obj.boxRadius, 8));
  const baseChipW = resolveCountdownUnitWidth({
    width: requestedChipW,
    height: chipH,
    boxRadius: unitBoxRadius,
  });

  const cols =
    distribution === 'vertical'
      ? 1
      : distribution === 'grid'
      ? Math.min(2, n)
      : n;
  const rows = distribution === 'vertical' ? n : distribution === 'grid' ? Math.ceil(n / cols) : 1;

  const editorialWidths =
    distribution === 'editorial'
      ? Array.from({ length: n }, (_, index) =>
          resolveCountdownUnitWidth({
            width: Math.max(34, Math.round(baseChipW * (index === 0 && n > 1 ? 1.25 : 0.88))),
            height: chipH,
            boxRadius: unitBoxRadius,
          })
        )
      : [];

  const naturalW =
    distribution === 'vertical'
      ? baseChipW
      : distribution === 'grid'
      ? cols * baseChipW + gap * (cols - 1)
      : distribution === 'editorial'
      ? editorialWidths.reduce((acc, width) => acc + width, 0) + gap * Math.max(0, n - 1)
      : n * baseChipW + gap * (n - 1);

  const naturalH =
    distribution === 'vertical' || distribution === 'grid'
      ? rows * chipH + gap * Math.max(0, rows - 1)
      : chipH;

  const containerW = Math.max(
    toFinite(obj.width, 0),
    naturalW + (useSingleFrameLayout ? framePadding * 2 : 0)
  );
  const containerH = Math.max(
    toFinite(obj.height, 0),
    naturalH + (useSingleFrameLayout ? framePadding * 2 : 0)
  );

  const contentBounds = {
    x: useSingleFrameLayout ? framePadding : 0,
    y: useSingleFrameLayout ? framePadding : 0,
    width: Math.max(1, containerW - (useSingleFrameLayout ? framePadding * 2 : 0)),
    height: Math.max(1, containerH - (useSingleFrameLayout ? framePadding * 2 : 0)),
  };

  const distributionW =
    distribution === 'grid'
      ? cols * baseChipW + gap * (cols - 1)
      : distribution === 'vertical'
      ? baseChipW
      : naturalW;
  const distributionH =
    distribution === 'vertical' || distribution === 'grid'
      ? rows * chipH + gap * Math.max(0, rows - 1)
      : chipH;

  const startX = contentBounds.x + (contentBounds.width - distributionW) / 2;
  const startY = contentBounds.y + (contentBounds.height - distributionH) / 2;

  const unitLayouts = useMemo(() => {
    if (distribution === 'vertical') {
      return parts.map((part, index) => ({
        ...part,
        x: contentBounds.x + (contentBounds.width - baseChipW) / 2,
        y: startY + index * (chipH + gap),
        width: baseChipW,
        height: chipH,
      }));
    }

    if (distribution === 'grid') {
      return parts.map((part, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        return {
          ...part,
          x: startX + col * (baseChipW + gap),
          y: startY + row * (chipH + gap),
          width: baseChipW,
          height: chipH,
        };
      });
    }

    if (distribution === 'editorial') {
      let cursorX = startX;
      return parts.map((part, index) => {
        const width = editorialWidths[index] || baseChipW;
        const item = {
          ...part,
          x: cursorX,
          y: startY,
          width,
          height: chipH,
        };
        cursorX += width + gap;
        return item;
      });
    }

    return parts.map((part, index) => ({
      ...part,
      x: startX + index * (baseChipW + gap),
      y: startY,
      width: baseChipW,
      height: chipH,
    }));
  }, [
    distribution,
    parts,
    contentBounds.x,
    contentBounds.width,
    startY,
    gap,
    chipH,
    cols,
    baseChipW,
    startX,
    editorialWidths,
  ]);
  const separatorText = String(obj.separator || "");
  const separatorFontSize = Math.max(10, Math.round(valueSize * 0.64));
  const canRenderSeparators = Boolean(
    separatorText && distribution !== "vertical" && distribution !== "grid" && unitLayouts.length > 1
  );
  const separatorLayouts = useMemo(() => {
    if (!canRenderSeparators) return [];
    return unitLayouts.slice(0, -1).map((item, index) => {
      const next = unitLayouts[index + 1];
      const itemRight = item.x + item.width;
      const midpointX = itemRight + (next.x - itemRight) / 2;
      const width = Math.max(12, Math.round(separatorFontSize * 1.4));
      return {
        key: `${item.key}-${next.key}-${index}`,
        x: midpointX - width / 2,
        y: item.y + Math.max(4, item.height * 0.3),
        width,
      };
    });
  }, [canRenderSeparators, unitLayouts, separatorFontSize]);

  useEffect(() => {
    if (isPassiveRender) return;

    const sectionMode = String(
      seccionesOrdenadas.find((section) => section?.id === obj?.seccionId)?.altoModo || ""
    ).trim().toLowerCase();

    recordCountdownAuditSnapshot({
      countdown: obj,
      stage: "canvas-konva-render",
      renderer: "konva-render",
      sourceDocument: "canvas-konva",
      viewport: "editor",
      wrapperScale: 1,
      usesRasterThumbnail: false,
      altoModo: sectionMode,
      sourceLabel: "CountdownKonva",
    });
  }, [
    obj,
    obj?.x,
    obj?.y,
    obj?.yNorm,
    obj?.width,
    obj?.height,
    obj?.scaleX,
    obj?.scaleY,
    obj?.rotation,
    obj?.seccionId,
    obj?.tamanoBase,
    obj?.distribution,
    obj?.layoutType,
    obj?.gap,
    obj?.framePadding,
    obj?.paddingX,
    obj?.paddingY,
    obj?.chipWidth,
    obj?.fontSize,
    obj?.labelSize,
    obj?.boxRadius,
    obj?.showLabels,
    obj?.separator,
    seccionesOrdenadas,
    chipH,
    baseChipW,
    naturalW,
    naturalH,
    containerW,
    containerH,
    startX,
    startY,
    unitLayouts,
    separatorLayouts,
    isPassiveRender,
  ]);

  const [frameImageWithCors] = useImage(hasFrameConfigured ? frameSvgUrl : null, "anonymous");
  const [frameImageDirect] = useImage(hasFrameConfigured ? frameSvgUrl : null);
  const frameImage = frameImageWithCors || frameImageDirect;

  // ---------------------------
  // Drag gating (la clave)
  // ---------------------------
  const pressRef = useRef({
    sessionId: 0,
    startedAtMs: null,
    active: false,
    movedEnough: false,
    startedDrag: false,
    startClientX: 0,
    startClientY: 0,
    startStageX: 0,
    startStageY: 0,
    startNodeX: 0,
    startNodeY: 0,
    dragThreshold: 3,
    // para ignorar click si se convirtió en drag
    suppressClick: false,
  });
  const dragSessionRef = useRef({
    sessionId: null,
    startedAtMs: null,
    thresholdCrossedAtMs: null,
  });
  const completedDragSessionIdRef = useRef(null);

  const cleanupGlobalRef = useRef(null);

  const logCountdownRepeatDragDiag = useCallback((eventName, payload = {}) => {
    if (!isCountdownRepeatDragDebugEnabled()) {
      return;
    }

    const press = pressRef.current || {};
    const dragSession = dragSessionRef.current || {};
    const activeDebugState = getCountdownRepeatDragActiveState();
    const entry = {
      event: eventName,
      elementId: obj.id || null,
      instanceId: debugInstanceIdRef.current,
      renderCount: debugRenderCountRef.current,
      sessionId: press.sessionId || null,
      currentPressSessionId: press.sessionId || null,
      dragSessionId: dragSession.sessionId || null,
      completedDragSessionId: completedDragSessionIdRef.current || null,
      pressActive: Boolean(press.active),
      movedEnough: Boolean(press.movedEnough),
      startedDrag: Boolean(press.startedDrag),
      suppressClick: Boolean(press.suppressClick),
      globalDragging: Boolean(window._isDragging),
      reactDraggableEnabled: Boolean(reactDraggableEnabled),
      selectedIds:
        typeof selectionRuntime?.readSnapshot === "function"
          ? selectionRuntime.readSnapshot()?.selectedIds || []
          : Array.isArray(window._elementosSeleccionados)
            ? [...window._elementosSeleccionados]
            : [],
      activeDebugState,
      rootNodeIdentity: getCountdownRepeatDragNodeIdentity(rootRef.current),
      ...payload,
    };

    publishCountdownRepeatDragDebugEntry(entry);
    console.log("[COUNTDOWN_REPEAT_DRAG]", entry);
  }, [obj.id, reactDraggableEnabled]);

  const getMirroredSelectedIds = useCallback(() => {
    if (typeof selectionRuntime?.readSnapshot === "function") {
      const runtimeSelectedIds = selectionRuntime.readSnapshot()?.selectedIds;
      if (Array.isArray(runtimeSelectedIds)) {
        return runtimeSelectedIds.filter(
          (id) => id !== null && typeof id !== "undefined" && id !== ""
        );
      }
    }

    if (typeof window === "undefined" || !Array.isArray(window._elementosSeleccionados)) {
      return [];
    }

    return window._elementosSeleccionados.filter(
      (id) => id !== null && typeof id !== "undefined" && id !== ""
    );
  }, [selectionRuntime]);

  const getEffectiveSelectionState = useCallback(() => {
    const runtimeSelectedIds = getMirroredSelectedIds();
    const effectiveSelectionCount =
      runtimeSelectedIds.length > 0 ? runtimeSelectedIds.length : selectionCount;
    const effectiveIsSelected =
      isSelected || runtimeSelectedIds.includes(obj.id);

    return {
      runtimeSelectedIds,
      effectiveSelectionCount,
      effectiveIsSelected,
    };
  }, [getMirroredSelectedIds, isSelected, obj.id, selectionCount]);

  const armPrimarySelectionClickGuard = useCallback(() => {
    const nowMs =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    pendingPrimarySelectionClickGuardRef.current = {
      elementId: obj.id,
      expiresAt: nowMs + 500,
    };
  }, [obj.id]);

  const consumePrimarySelectionClickGuard = useCallback(() => {
    const guard = pendingPrimarySelectionClickGuardRef.current || {};
    const nowMs =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const active =
      guard.elementId === obj.id &&
      Number.isFinite(Number(guard.expiresAt)) &&
      Number(guard.expiresAt) >= nowMs;

    pendingPrimarySelectionClickGuardRef.current = {
      elementId: null,
      expiresAt: 0,
    };

    return active;
  }, [obj.id]);

  const emitSelectionGesture = useCallback((gesture, event, meta = {}) => {
    if (!onSelect) return null;

    event && (event.cancelBubble = true);
    event?.evt && (event.evt.cancelBubble = true);

    return onSelect(obj.id, obj, event, {
      gesture,
      ...meta,
    });
  }, [obj, onSelect]);

  const maybeSelectElementOnPress = useCallback((event) => {
    if (!onSelect) {
      return {
        didSelectOnPress: false,
        allowSameGestureDrag: false,
        decision: null,
      };
    }

    const {
      runtimeSelectedIds,
      effectiveSelectionCount,
      effectiveIsSelected,
    } = getEffectiveSelectionState();
    const nativeEvent = event?.evt || null;
    const additiveSelectionRequested = Boolean(nativeEvent?.shiftKey);

    if (
      effectiveIsSelected ||
      (effectiveSelectionCount > 1 && !additiveSelectionRequested)
    ) {
      return {
        didSelectOnPress: false,
        allowSameGestureDrag: false,
        decision: null,
        runtimeSelectedIds,
        effectiveSelectionCount,
      };
    }

    if (nativeEvent?.button != null && Number(nativeEvent.button) !== 0) {
      return {
        didSelectOnPress: false,
        allowSameGestureDrag: false,
        decision: null,
        runtimeSelectedIds,
        effectiveSelectionCount,
      };
    }

    const allowSameGestureDrag =
      !nativeEvent?.shiftKey &&
      !nativeEvent?.ctrlKey &&
      !nativeEvent?.metaKey;

    armPrimarySelectionClickGuard();

    const selectionIntent = emitSelectionGesture("primary", event, {
      selectionOrigin: "press",
      allowSameGestureDrag,
    });

    return {
      didSelectOnPress: Boolean(selectionIntent),
      allowSameGestureDrag: selectionIntent?.decision === "select_and_drag",
      decision: selectionIntent?.decision || null,
      runtimeSelectedIds,
      effectiveSelectionCount,
    };
  }, [
    armPrimarySelectionClickGuard,
    emitSelectionGesture,
    getEffectiveSelectionState,
    onSelect,
  ]);

  const syncReactDraggableEnabled = useCallback((nextDraggable) => {
    const safeNext = Boolean(nextDraggable);
    const apply = () => {
      setReactDraggableEnabled((current) => (
        current === safeNext ? current : safeNext
      ));
    };

    if (safeNext && typeof flushSync === "function") {
      flushSync(apply);
      return;
    }

    apply();
  }, []);

  const setNodeDraggable = useCallback((node, nextDraggable, reason, extra = {}) => {
    syncReactDraggableEnabled(nextDraggable);

    if (!node) {
      logCountdownRepeatDragDiag("draggable:set-missing-node", {
        reason,
        requestedDraggable: Boolean(nextDraggable),
        ...extra,
      });
      return null;
    }

    let previousDraggable = null;
    try {
      previousDraggable =
        typeof node.draggable === "function" ? Boolean(node.draggable()) : null;
    } catch {}

    try {
      node.draggable(nextDraggable);
    } catch {}

    let nodeDraggable = null;
    try {
      nodeDraggable =
        typeof node.draggable === "function" ? Boolean(node.draggable()) : null;
    } catch {}

    logCountdownRepeatDragDiag("draggable:set", {
      reason,
      requestedDraggable: Boolean(nextDraggable),
      previousDraggable,
      nodeDraggable,
      reactDraggableEnabled: Boolean(nextDraggable),
      nodeIdentity: getCountdownRepeatDragNodeIdentity(node),
      ...extra,
    });

    return nodeDraggable;
  }, [logCountdownRepeatDragDiag, syncReactDraggableEnabled]);

  const ensureIdleNodeNotDraggable = useCallback((reason = "idle-draggable-reset") => {
    const node = rootRef.current || null;
    if (!node) return false;

    const ownsActiveDragSession =
      Boolean(dragSessionRef.current?.sessionId) ||
      Boolean(pressRef.current?.active) ||
      Boolean(draggingRef.current);
    if (ownsActiveDragSession) return false;

    let nodeDraggable = false;
    try {
      nodeDraggable =
        typeof node.draggable === "function" ? Boolean(node.draggable()) : false;
    } catch {}

    if (!reactDraggableEnabled && !nodeDraggable) {
      return false;
    }

    setNodeDraggable(node, false, reason, {
      nodeDraggable,
      reactDraggableEnabled: Boolean(reactDraggableEnabled),
    });
    return true;
  }, [reactDraggableEnabled, setNodeDraggable]);

  const detachTransformerBeforeNativeDrag = useCallback((node, reason = "unknown") => {
    if (!node) {
      return false;
    }

    const stage = node?.getStage?.() || null;
    if (!stage || typeof stage.findOne !== "function") {
      return false;
    }

    let transformer = null;
    try {
      transformer = stage.findOne("Transformer");
    } catch {
      transformer = null;
    }
    if (!transformer || typeof transformer.nodes !== "function") {
      return false;
    }

    let attachedNodes = [];
    try {
      attachedNodes = transformer.nodes() || [];
    } catch {
      attachedNodes = [];
    }

    const shouldDetach = attachedNodes.some((attachedNode) => attachedNode === node);
    if (!shouldDetach) {
      return false;
    }

    try {
      transformer.stopTransform?.();
    } catch {}
    try {
      transformer.nodes([]);
    } catch {}
    try {
      transformer.getLayer?.()?.batchDraw?.();
    } catch {}

    logCountdownRepeatDragDiag("transformer:detach-before-drag", {
      reason,
      attachedNodeCount: attachedNodes.length,
      nodeIdentity: getCountdownRepeatDragNodeIdentity(node),
    });

    return true;
  }, [logCountdownRepeatDragDiag]);

  const markActiveDebugDragSession = useCallback((phase, sessionId, extra = {}) => {
    if (!isCountdownRepeatDragDebugEnabled()) {
      return;
    }

    const previous = getCountdownRepeatDragActiveState();
    setCountdownRepeatDragActiveState({
      ...(previous && previous.elementId === obj.id ? previous : {}),
      elementId: obj.id || null,
      instanceId: debugInstanceIdRef.current,
      sessionId: sessionId ?? previous?.sessionId ?? null,
      phase: phase || null,
      atMs: Date.now(),
      ...extra,
    });
  }, [obj.id]);

  const clearActiveDebugDragSession = useCallback((sessionId = null) => {
    if (!isCountdownRepeatDragDebugEnabled()) {
      return false;
    }

    const current = getCountdownRepeatDragActiveState();
    if (!current || current.elementId !== obj.id) {
      return false;
    }
    if (current.instanceId && current.instanceId !== debugInstanceIdRef.current) {
      return false;
    }
    if (
      sessionId != null &&
      current.sessionId != null &&
      current.sessionId !== sessionId
    ) {
      return false;
    }

    setCountdownRepeatDragActiveState(null);
    return true;
  }, [obj.id]);

  const scheduleDragStartHealthChecks = useCallback((sessionId, sourceNode) => {
    if (!isCountdownRepeatDragDebugEnabled()) {
      return;
    }

    const sourceNodeIdentity = getCountdownRepeatDragNodeIdentity(sourceNode);
    const logHealthCheck = (phase) => {
      const currentNode = rootRef.current || null;
      const currentNodeIdentity = getCountdownRepeatDragNodeIdentity(currentNode);
      logCountdownRepeatDragDiag("dragstart:health-check", {
        phase,
        sessionId,
        sourceNodeIdentity,
        currentNodeIdentity,
        sameNodeKey:
          sourceNodeIdentity?.key && currentNodeIdentity?.key
            ? sourceNodeIdentity.key === currentNodeIdentity.key
            : false,
        nodeDragging: Boolean(currentNode?.isDragging?.()),
        nodeDraggable: Boolean(currentNode?.draggable?.()),
        globalDragging: Boolean(window._isDragging),
      });
    };

    if (typeof queueMicrotask === "function") {
      queueMicrotask(() => {
        logHealthCheck("microtask");
      });
    } else {
      Promise.resolve().then(() => {
        logHealthCheck("microtask");
      });
    }

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        logHealthCheck("raf");
      });
    }
  }, [logCountdownRepeatDragDiag]);

  const logThrottledDragMove = useCallback((node, extra = {}) => {
    if (!isCountdownRepeatDragDebugEnabled()) {
      return;
    }

    const nextX =
      node && typeof node.x === "function" && Number.isFinite(Number(node.x()))
        ? Number(node.x())
        : null;
    const nextY =
      node && typeof node.y === "function" && Number.isFinite(Number(node.y()))
        ? Number(node.y())
        : null;
    const nowMs = Date.now();
    const last = dragMoveDebugRef.current;
    const movedEnough =
      !Number.isFinite(last.lastX) ||
      !Number.isFinite(last.lastY) ||
      Math.abs((nextX ?? 0) - (last.lastX ?? 0)) >= 0.5 ||
      Math.abs((nextY ?? 0) - (last.lastY ?? 0)) >= 0.5;
    const waitedEnough = nowMs - last.lastLogAtMs >= 80;

    if (!movedEnough && !waitedEnough) {
      return;
    }

    dragMoveDebugRef.current = {
      lastLogAtMs: nowMs,
      lastX: nextX,
      lastY: nextY,
    };

    logCountdownRepeatDragDiag("dragmove", {
      x: nextX,
      y: nextY,
      nodeDragging: Boolean(node?.isDragging?.()),
      nodeDraggable: Boolean(node?.draggable?.()),
      nodeIdentity: getCountdownRepeatDragNodeIdentity(node),
      ...extra,
    });
  }, [logCountdownRepeatDragDiag]);

  useEffect(() => {
    logCountdownRepeatDragDiag("instance-state", {
      isSelected: Boolean(isSelected),
      nodeRegistered: Boolean(rootRef.current),
    });
  }, [isSelected, logCountdownRepeatDragDiag]);

  useEffect(() => {
    ensureIdleNodeNotDraggable("selection-sync-reset");
  }, [
    ensureIdleNodeNotDraggable,
    isSelected,
    selectionCount,
  ]);

  useEffect(() => {
    if (isCountdownRepeatDragDebugEnabled()) {
      const entry = {
        event: "instance-mount",
        elementId: obj.id || null,
        instanceId: debugInstanceIdRef.current,
        renderCount: debugRenderCountRef.current,
        isSelected: Boolean(isSelected),
        nodeRegistered: Boolean(rootRef.current),
        nodeIdentity: getCountdownRepeatDragNodeIdentity(rootRef.current),
      };
      publishCountdownRepeatDragDebugEntry(entry);
      console.log("[COUNTDOWN_REPEAT_DRAG]", entry);
    }

    return () => {
      const clearedActiveDebug = clearActiveDebugDragSession();
      const entry = {
        event: "instance-unmount",
        elementId: obj.id || null,
        instanceId: debugInstanceIdRef.current,
        renderCount: debugRenderCountRef.current,
        clearedActiveDebug,
        lastKnownNodeIdentity:
          lastRootNodeIdentityRef.current ||
          getCountdownRepeatDragNodeIdentity(rootRef.current),
      };
      if (isCountdownRepeatDragDebugEnabled()) {
        publishCountdownRepeatDragDebugEntry(entry);
        console.log("[COUNTDOWN_REPEAT_DRAG]", entry);
      }
    };
  }, [clearActiveDebugDragSession, obj.id]);

  useEffect(() => {
    if (!isCountdownRepeatDragDebugEnabled()) {
      return;
    }

    const activeDebugState = getCountdownRepeatDragActiveState();
    const rootNodeIdentity = getCountdownRepeatDragNodeIdentity(rootRef.current);
    const shouldLogRender =
      activeDebugState?.elementId === obj.id ||
      Boolean(isSelected) ||
      Boolean(dragSessionRef.current.sessionId) ||
      Boolean(pressRef.current.active) ||
      Boolean(window._isDragging);

    if (!shouldLogRender) {
      return;
    }

    const nextSnapshot = {
      isSelected: Boolean(isSelected),
      x: obj.x ?? 0,
      yAbs,
      rotation: obj.rotation || 0,
      scaleX: obj.scaleX || 1,
      scaleY: obj.scaleY || 1,
      pressSessionId: pressRef.current.sessionId || null,
      dragSessionId: dragSessionRef.current.sessionId || null,
      pressActive: Boolean(pressRef.current.active),
      localDragging: Boolean(draggingRef.current),
      globalDragging: Boolean(window._isDragging),
      reactDraggableEnabled: Boolean(reactDraggableEnabled),
      rootNodeKey: rootNodeIdentity?.key || null,
      rootNodeDraggable: rootNodeIdentity?.draggable ?? null,
      rootNodeDragging: rootNodeIdentity?.isDragging ?? null,
    };
    const previousSnapshot = debugRenderSnapshotRef.current;
    const changedKeys = !previousSnapshot
      ? Object.keys(nextSnapshot)
      : Object.keys(nextSnapshot).filter(
          (key) => previousSnapshot[key] !== nextSnapshot[key]
        );

    if (changedKeys.length === 0) {
      return;
    }

    debugRenderSnapshotRef.current = nextSnapshot;
    logCountdownRepeatDragDiag("instance-render", {
      changedKeys,
      snapshot: nextSnapshot,
    });
  }, [
    isSelected,
    obj.id,
    obj.rotation,
    obj.scaleX,
    obj.scaleY,
    obj.x,
    reactDraggableEnabled,
    yAbs,
    logCountdownRepeatDragDiag,
  ]);

  const cleanupGlobal = useCallback((expectedSessionId = null) => {
    const cleanupState = cleanupGlobalRef.current;
    if (!cleanupState) {
      return false;
    }

    if (
      expectedSessionId != null &&
      Number.isFinite(cleanupState.sessionId) &&
      cleanupState.sessionId !== expectedSessionId
    ) {
      return false;
    }

    try { cleanupState.cleanup(); } catch {}
    cleanupGlobalRef.current = null;
    return true;
  }, []);

  const scheduleHasDraggedReset = useCallback(() => {
    setTimeout(() => {
      if (hasDragged?.current != null) hasDragged.current = false;
    }, 0);
  }, [hasDragged]);

  const resetPressStateForSession = useCallback((sessionId) => {
    if (pressRef.current.sessionId !== sessionId) {
      return false;
    }

    pressRef.current.active = false;
    pressRef.current.movedEnough = false;
    pressRef.current.startedDrag = false;
    pressRef.current.startedAtMs = null;
    return true;
  }, []);

  const clearDragSession = useCallback((sessionId = null) => {
    const currentDragSessionId = dragSessionRef.current?.sessionId ?? null;
    if (sessionId != null && currentDragSessionId !== sessionId) {
      return false;
    }

    dragSessionRef.current = {
      sessionId: null,
      startedAtMs: null,
      thresholdCrossedAtMs: null,
    };
    return true;
  }, []);

  const finalizeLocalDragCleanup = useCallback((sessionId, node) => {
    if (sessionId == null) {
      return;
    }

    setNodeDraggable(node, false, "finalize-local-drag-cleanup", {
      sessionId,
    });

    draggingRef.current = false;
    window._isDragging = false;

    const resetPressState = resetPressStateForSession(sessionId);
    const clearedDragSession = clearDragSession(sessionId);
    completedDragSessionIdRef.current = sessionId;

    scheduleHasDraggedReset();
    const cleanupGlobalCompleted = cleanupGlobal(sessionId);
    const clearedActiveDebug = clearActiveDebugDragSession(sessionId);
    logCountdownRepeatDragDiag("cleanup:finalized", {
      sessionId,
      resetPressState,
      clearedDragSession,
      cleanupGlobalCompleted,
      clearedActiveDebug,
      nodeIdentity: getCountdownRepeatDragNodeIdentity(node),
    });
  }, [
    cleanupGlobal,
    clearActiveDebugDragSession,
    clearDragSession,
    logCountdownRepeatDragDiag,
    resetPressStateForSession,
    scheduleHasDraggedReset,
    setNodeDraggable,
  ]);

  const attachGlobalListeners = useCallback((listenerSessionId) => {
    cleanupGlobal();

    const onMove = (ev) => {
      if (pressRef.current.sessionId !== listenerSessionId) return;
      if (!pressRef.current.active) return;
      if (pressRef.current.startedDrag) return;

      if (
        ev?.cancelable &&
        (ev?.pointerType === "touch" || ev?.touches || ev?.changedTouches)
      ) {
        try { ev.preventDefault(); } catch {}
      }

      const point = getClientPoint(ev);
      if (!point) return;

      const dxClient = point.x - pressRef.current.startClientX;
      const dyClient = point.y - pressRef.current.startClientY;
      const dist = Math.hypot(dxClient, dyClient);

      if (dist < pressRef.current.dragThreshold) return;

      // ✅ Se convirtió en drag intencional
      pressRef.current.movedEnough = true;
      pressRef.current.startedDrag = true;
      pressRef.current.suppressClick = true;
      dragSessionRef.current = {
        sessionId: listenerSessionId,
        startedAtMs: pressRef.current.startedAtMs,
        thresholdCrossedAtMs: getEventTimeStampMs(ev),
      };
      completedDragSessionIdRef.current = null;

      const node = rootRef.current;
      if (!node) return;
      const mirroredSelection = getMirroredSelectedIds();
      const selectionSnapshot =
        mirroredSelection.length > 0 ? mirroredSelection : [obj.id];
      onPredragVisualSelectionStart?.(obj.id, selectionSnapshot);
      detachTransformerBeforeNativeDrag(node, "threshold-cross");

      // Corregimos posición inicial con el delta real para evitar “arrastre atrasado”.
      // Dejamos que Konva arranque el drag nativo desde la posiciÃ³n actual
      // para evitar el salto del reposicionamiento manual previo.

      // Habilitar drag solo ahora
      setNodeDraggable(node, true, "threshold-cross", {
        listenerSessionId,
      });

      // Bloquear re-render por tick durante drag
      draggingRef.current = true;
      window._isDragging = true;
      if (hasDragged?.current != null) hasDragged.current = true;
      markActiveDebugDragSession("threshold-cross", listenerSessionId, {
        pressStartedAtMs: pressRef.current.startedAtMs ?? null,
        thresholdCrossedAtMs: dragSessionRef.current.thresholdCrossedAtMs ?? null,
      });

      // Iniciar drag nativo de Konva (esto dispara dragstart/dragmove/dragend)
      logCountdownRepeatDragDiag("threshold-cross", {
        listenerSessionId,
        nodeDragging: Boolean(node?.isDragging?.()),
        nodeDraggable: Boolean(node?.draggable?.()),
      });
      try { node.startDrag(); } catch {}
    };

    const onUp = () => {
      const currentPressSessionId = pressRef.current.sessionId ?? null;
      const dragSessionId = dragSessionRef.current.sessionId ?? null;
      const completedDragSessionId = completedDragSessionIdRef.current ?? null;
      const isCurrentPressSession = currentPressSessionId === listenerSessionId;
      const ownsActiveDragSession = dragSessionId === listenerSessionId;
      const alreadyCompleted = completedDragSessionId === listenerSessionId;
      const node = rootRef.current;

      logCountdownRepeatDragDiag("release", {
        listenerSessionId,
        isCurrentPressSession,
        ownsActiveDragSession,
        alreadyCompleted,
        movedEnough: Boolean(pressRef.current.movedEnough),
        startedDrag: Boolean(pressRef.current.startedDrag),
        nodeDragging: Boolean(node?.isDragging?.()),
        nodeDraggable: Boolean(node?.draggable?.()),
      });

      if (alreadyCompleted) {
        cleanupGlobal(listenerSessionId);
        return;
      }

      if (!isCurrentPressSession) {
        logCountdownRepeatDragDiag("release:stale-session-ignored", {
          listenerSessionId,
        });
        return;
      }

      pressRef.current.active = false;

      if (!node) {
        if (!ownsActiveDragSession) {
          resetPressStateForSession(listenerSessionId);
          cleanupGlobal(listenerSessionId);
        }
        return;
      }

      // Si NO se convirtió en drag, garantizamos 0 movimiento
      if (!ownsActiveDragSession && !pressRef.current.movedEnough && !pressRef.current.startedDrag) {
        onPredragVisualSelectionCancel?.(obj.id);
        try {
          node.position({ x: pressRef.current.startNodeX, y: pressRef.current.startNodeY });
          node.getLayer()?.batchDraw();
        } catch {}
        resetPressStateForSession(listenerSessionId);
        setNodeDraggable(node, false, "release-no-drag", {
          listenerSessionId,
        });
        draggingRef.current = false;
        window._isDragging = false;
        cleanupGlobal(listenerSessionId);
        return;
      }

      try {
        if (node.isDragging?.()) node.stopDrag();
      } catch {}
    };

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("touchmove", onMove, { capture: true, passive: false });
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("touchend", onUp, true);
    window.addEventListener("touchcancel", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    window.addEventListener("blur", onUp, true);

    cleanupGlobalRef.current = {
      sessionId: listenerSessionId,
      cleanup: () => {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("touchmove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("touchend", onUp, true);
        window.removeEventListener("touchcancel", onUp, true);
        window.removeEventListener("pointercancel", onUp, true);
        window.removeEventListener("blur", onUp, true);
      },
    };
  }, [
    cleanupGlobal,
    detachTransformerBeforeNativeDrag,
    getMirroredSelectedIds,
    hasDragged,
    logCountdownRepeatDragDiag,
    markActiveDebugDragSession,
    obj.id,
    onPredragVisualSelectionCancel,
    onPredragVisualSelectionStart,
    resetPressStateForSession,
    setNodeDraggable,
  ]);

  // ---------------------------
  // Handlers del nodo
  // ---------------------------
  const handleDown = useCallback(
    (e) => {
      e.cancelBubble = true;
      if (e?.evt) e.evt.cancelBubble = true;
      if (pressRef.current.active) return;

      if (typeof onHover === "function") {
        flushSync(() => {
          onHover(null);
        });
      }

      const ev = e.evt;
      const pointerType = resolvePointerType(ev);
      const node = e.currentTarget || e.target || rootRef.current || null;
      setNodeDraggable(node, false, "press-start-reset", {
        pointerType,
      });

      const selectionState = getEffectiveSelectionState();
      const pressSelectionResult = !selectionState.effectiveIsSelected
        ? maybeSelectElementOnPress(e)
        : {
            didSelectOnPress: false,
            allowSameGestureDrag: false,
            decision: null,
          };
      const canStartDragSession =
        selectionState.effectiveIsSelected ||
        pressSelectionResult?.allowSameGestureDrag === true;

      if (!canStartDragSession) {
        logCountdownRepeatDragDiag("press-start:selection-required", {
          pointerType,
          selectionDecision: pressSelectionResult?.decision || null,
          effectiveSelectionCount: selectionState.effectiveSelectionCount,
          runtimeSelectedIds: selectionState.runtimeSelectedIds || [],
        });
        return;
      }

      const stage = node?.getStage?.();
      const dragThreshold = getDragIntentThreshold(pointerType);
      const clientPoint = getClientPoint(ev);
      const stagePoint = stage?.getPointerPosition?.();
      const nextSessionId = pressSessionCounterRef.current + 1;
      pressSessionCounterRef.current = nextSessionId;

      // Iniciar press
      pressRef.current.sessionId = nextSessionId;
      pressRef.current.startedAtMs = getEventTimeStampMs(ev);
      pressRef.current.active = true;
      pressRef.current.movedEnough = false;
      pressRef.current.startedDrag = false;
      pressRef.current.suppressClick = false;
      pressRef.current.dragThreshold = dragThreshold;

      // Guardar posición inicial del nodo
      pressRef.current.startNodeX = node.x();
      pressRef.current.startNodeY = node.y();

      // Guardar punto inicial del puntero (en px reales)
      pressRef.current.startClientX =
        clientPoint?.x ??
        (Number.isFinite(stagePoint?.x) ? stagePoint.x : 0);
      pressRef.current.startClientY =
        clientPoint?.y ??
        (Number.isFinite(stagePoint?.y) ? stagePoint.y : 0);
      pressRef.current.startStageX =
        Number.isFinite(stagePoint?.x) ? stagePoint.x : 0;
      pressRef.current.startStageY =
        Number.isFinite(stagePoint?.y) ? stagePoint.y : 0;

      // Por defecto NO draggable en press (clave)
      setNodeDraggable(node, false, "press-start", {
        sessionId: nextSessionId,
        selectionDecision: pressSelectionResult?.decision || null,
        allowSameGestureDrag: pressSelectionResult?.allowSameGestureDrag === true,
      });

      if (hasDragged?.current != null) hasDragged.current = false;

      logCountdownRepeatDragDiag("press-start", {
        sessionId: nextSessionId,
        pointerType,
        dragThreshold,
        nodeDragging: Boolean(node?.isDragging?.()),
        nodeDraggable: Boolean(node?.draggable?.()),
      });
      attachGlobalListeners(nextSessionId);
    },
    [
      attachGlobalListeners,
      getEffectiveSelectionState,
      hasDragged,
      logCountdownRepeatDragDiag,
      maybeSelectElementOnPress,
      onHover,
      setNodeDraggable,
    ]
  );

  const handleClick = useCallback(
    (e) => {
      e.cancelBubble = true;
      if (e?.evt) e.evt.cancelBubble = true;

      // Si este click se convirtió en drag, no seleccionar “de vuelta”
      if (pressRef.current.suppressClick) return;
      if (consumePrimarySelectionClickGuard()) return;

      emitSelectionGesture("primary", e, {
        selectionOrigin: "gesture",
      });
    },
    [consumePrimarySelectionClickGuard, emitSelectionGesture]
  );

  const handleMouseEnter = useCallback(() => {
    if (window._isDragging) return;
    onHover?.(obj.id);
  }, [onHover, obj.id]);

  const handleMouseLeave = useCallback(() => {
    onHover?.(null);
  }, [onHover]);

  // Estos handlers solo corren cuando el drag fue habilitado y startDrag() se llamó
  const handleDragStart = useCallback(
    (e) => {
      const node = e?.currentTarget || e?.target || rootRef.current || null;
      const dragSessionId =
        dragSessionRef.current.sessionId ??
        (pressRef.current.startedDrag ? (pressRef.current.sessionId ?? null) : null);
      markActiveDebugDragSession("dragstart", dragSessionId, {
        nodeIdentity: getCountdownRepeatDragNodeIdentity(node),
      });
      logCountdownRepeatDragDiag("dragstart", {
        dragSessionId,
        dragSessionStartedAtMs: dragSessionRef.current.startedAtMs,
        nodeDragging: Boolean(node?.isDragging?.()),
        nodeDraggable: Boolean(node?.draggable?.()),
        nodeIdentity: getCountdownRepeatDragNodeIdentity(node),
      });
      scheduleDragStartHealthChecks(dragSessionId, node);
      // Arranque de tu lógica grupal/individual
      const groupDragResult = startDragGrupalLider(e, obj);
      if (groupDragResult.mode === "follower-ignored") {
        try { e?.target?.stopDrag?.(); } catch {}
        try { node?.stopDrag?.(); } catch {}
        try {
          if (groupDragResult.restorePose && typeof node?.position === "function") {
            node.position({
              x: groupDragResult.restorePose.x,
              y: groupDragResult.restorePose.y,
            });
          }
        } catch {}
        setNodeDraggable(node, false, "dragstart-follower-ignored", {
          dragSessionId,
        });
        try { node?.getLayer?.()?.batchDraw?.(); } catch {}
        if (hasDragged?.current != null) hasDragged.current = false;
        return;
      }
      if (groupDragResult.mode === "duplicate-leader-ignored") {
        return;
      }

      onDragStartPersonalizado?.(obj.id, e);
      if (groupDragResult.mode !== "started") {
        startDragIndividual(e, dragStartPos);
      }
    },
    [
      dragStartPos,
      hasDragged,
      logCountdownRepeatDragDiag,
      markActiveDebugDragSession,
      obj,
      onDragStartPersonalizado,
      scheduleDragStartHealthChecks,
      setNodeDraggable,
    ]
  );

  const handleDragMove = useCallback(
    (e) => {
      if (window._grupoLider) {
        if (obj.id === window._grupoLider) {
          previewDragGrupal(e, obj, onChange);
          logThrottledDragMove(e?.target || e?.currentTarget || rootRef.current, {
            groupMode: "leader",
          });
          onDragMovePersonalizado?.({ x: e.target.x(), y: e.target.y() }, obj.id);
        }
        return;
      }
      previewDragIndividual(e, obj, onDragMovePersonalizado);
      logThrottledDragMove(e?.target || e?.currentTarget || rootRef.current, {
        groupMode: "individual",
      });
    },
    [logThrottledDragMove, obj, onChange, onDragMovePersonalizado]
  );

  const handleDragEnd = useCallback(
    (e) => {
      const node = e.currentTarget;
      const dragSessionId =
        dragSessionRef.current.sessionId ??
        (pressRef.current.startedDrag ? (pressRef.current.sessionId ?? null) : null);
      const currentPressSessionId = pressRef.current.sessionId ?? null;
      const dragEndTimeMs = getEventTimeStampMs(e?.evt);
      const sameSessionStillActive =
        dragSessionId != null &&
        currentPressSessionId === dragSessionId &&
        pressRef.current.active === true;
      const newerPressStartedBySession =
        Number.isFinite(currentPressSessionId) &&
        Number.isFinite(dragSessionId) &&
        currentPressSessionId > dragSessionId;
      const newerPressStartedByTime =
        !newerPressStartedBySession &&
        currentPressSessionId !== dragSessionId &&
        Number.isFinite(pressRef.current.startedAtMs) &&
        Number.isFinite(dragSessionRef.current.startedAtMs) &&
        pressRef.current.startedAtMs > dragSessionRef.current.startedAtMs;
      const newerPressStarted = newerPressStartedBySession || newerPressStartedByTime;
      const skipReason = newerPressStarted
        ? (newerPressStartedBySession ? "newer-press-session" : "newer-press-timestamp")
        : null;
      const shouldSkipLocalCleanup = Boolean(skipReason);

      if (
        dragSessionId != null &&
        completedDragSessionIdRef.current != null &&
        completedDragSessionIdRef.current === dragSessionId
      ) {
        logCountdownRepeatDragDiag("dragend:duplicate-ignored", {
          dragSessionId,
          dragEndTimeMs,
        });
        return;
      }

      logCountdownRepeatDragDiag("dragend:start", {
        shouldSkipLocalCleanup,
        skipReason,
        sameSessionStillActive,
        newerPressStarted,
        dragSessionId,
        currentPressSessionId,
        dragEndTimeMs,
        nativeEventType: e?.evt?.type || null,
        nativeEventPointerType: e?.evt?.pointerType || null,
        nativeEventButton:
          Number.isFinite(Number(e?.evt?.button)) ? Number(e.evt.button) : null,
        nativeEventButtons:
          Number.isFinite(Number(e?.evt?.buttons)) ? Number(e.evt.buttons) : null,
        pressStartedAtMs: pressRef.current.startedAtMs,
        dragSessionStartedAtMs: dragSessionRef.current.startedAtMs,
        nodeDragging: Boolean(node?.isDragging?.()),
        nodeDraggable: Boolean(node?.draggable?.()),
      });
      const groupDragResult = endDragGrupal(e, obj, onChange, hasDragged, () => {});

      if (groupDragResult.role === "follower") {
        if (!shouldSkipLocalCleanup) {
          finalizeLocalDragCleanup(dragSessionId, node);
        } else {
          logCountdownRepeatDragDiag("dragend:follower-skip-cleanup", {
            dragSessionId,
            currentPressSessionId,
            reason: skipReason,
          });
        }
        return;
      }

      if (groupDragResult.role === "leader" && groupDragResult.completed) {
        notePostDragSelectionGuard();
        if (typeof window !== "undefined" && groupDragResult.shouldDispatchDraggingEnd) {
          window.dispatchEvent(
            new CustomEvent(EDITOR_BRIDGE_EVENTS.DRAGGING_END, {
              detail: buildEditorDragLifecycleDetail({
                id: obj.id,
                tipo: obj.tipo || null,
                group: true,
                sessionId: groupDragResult.sessionId || null,
                leaderId: groupDragResult.leaderId || null,
              }),
            })
          );
        }
        if (groupDragResult.shouldRunPersonalizedEnd) {
          onDragEndPersonalizado?.();
        }
      } else {
        notePostDragSelectionGuard();
        endDragIndividual(obj, node, onChange, onDragEndPersonalizado, hasDragged);
      }

      if (shouldSkipLocalCleanup) {
        logCountdownRepeatDragDiag("dragend:skip-local-cleanup", {
          dragSessionId,
          currentPressSessionId,
          sameSessionStillActive,
          newerPressStarted,
          reason: skipReason,
        });
        return;
      }

      finalizeLocalDragCleanup(dragSessionId, node);
    },
    [
      finalizeLocalDragCleanup,
      obj,
      onChange,
      hasDragged,
      onDragEndPersonalizado,
      logCountdownRepeatDragDiag,
    ]
  );

  // Cleanup global por si el componente se desmonta en pleno press
  useEffect(() => {
    return () => {
      cleanupGlobal();
    };
  }, [cleanupGlobal]);

  const liveRenderNode = rootRef.current || null;
  const shouldRenderLiveDragPose = Boolean(
    reactDraggableEnabled &&
    liveRenderNode &&
    (
      dragSessionRef.current.sessionId != null ||
      draggingRef.current
    )
  );
  const renderedX =
    shouldRenderLiveDragPose &&
    typeof liveRenderNode?.x === "function" &&
    Number.isFinite(Number(liveRenderNode.x()))
      ? Number(liveRenderNode.x())
      : (obj.x ?? 0);
  const renderedY =
    shouldRenderLiveDragPose &&
    typeof liveRenderNode?.y === "function" &&
    Number.isFinite(Number(liveRenderNode.y()))
      ? Number(liveRenderNode.y())
      : yAbs;

  return (
    <Group
      ref={setRefs}
      id={obj.id}
      x={renderedX}
      y={renderedY}
      rotation={obj.rotation || 0}
      scaleX={obj.scaleX || 1}
      scaleY={obj.scaleY || 1}

      // ✅ SIEMPRE false: el drag se habilita imperativamente solo si hubo intención
      draggable={isPassiveRender ? false : reactDraggableEnabled}
      listening={!isPassiveRender}

      onMouseDown={isPassiveRender ? undefined : handleDown}
      onTouchStart={isPassiveRender ? undefined : handleDown}
      onPointerDown={isPassiveRender ? undefined : handleDown}

      onClick={isPassiveRender ? undefined : handleClick}
      onTap={isPassiveRender ? undefined : handleClick}
      onMouseEnter={isPassiveRender ? undefined : handleMouseEnter}
      onMouseLeave={isPassiveRender ? undefined : handleMouseLeave}

      onDragStart={isPassiveRender ? undefined : handleDragStart}
      onDragMove={isPassiveRender ? undefined : handleDragMove}
      onDragEnd={isPassiveRender ? undefined : handleDragEnd}
    >
      {/* Hitbox */}
      <Rect
        name="countdown-hitbox"
        width={containerW}
        height={containerH}
        fill={backgroundColor}
        // El borde de selección lo dibuja SelectionBounds (Transformer).
        // Evita doble recuadro (violeta + celeste punteado) en countdown.
        stroke="transparent"
        strokeWidth={0}
        cornerRadius={8}
        listening={true}
        perfectDrawEnabled={false}
      />

      {!state.invalid && !state.ended && (
        <Group listening={false}>
          {useSingleFrameLayout && frameImage && (
            <KonvaImage
              image={frameImage}
              x={0}
              y={0}
              width={containerW}
              height={containerH}
              listening={false}
              perfectDrawEnabled={false}
            />
          )}

          {useSingleFrameLayout && !frameImage && obj.frameColor && (
            <Rect
              x={0}
              y={0}
              width={containerW}
              height={containerH}
              stroke={frameStrokeColor}
              strokeWidth={Math.max(1, Math.round(framePadding * 0.14))}
              cornerRadius={Math.min(18, Math.round(framePadding * 1.4))}
              fill="transparent"
              listening={false}
              perfectDrawEnabled={false}
            />
          )}

          {unitLayouts.map((it) => {
            const itemLabel = applyLabelTransform(it.label, labelTransform);
            const cornerRadius = Math.min(unitBoxRadius, it.width / 2, it.height / 2);
            const valueBlockHeight = Math.max(1, valueSize * lineHeight);
            const labelBlockHeight = Math.max(1, labelSize);
            const valueTextFill = resolveKonvaFill(obj.color, it.width, valueBlockHeight, "#111827");
            const labelTextFill = resolveKonvaFill(obj.labelColor, it.width, labelBlockHeight, "#6b7280");
            const textStackGap = showLabels ? 4 : 0;
            const contentHeight = showLabels
              ? valueBlockHeight + textStackGap + labelBlockHeight
              : valueBlockHeight;
            const contentTop = Math.max(0, (it.height - contentHeight) / 2);
            const valueY = contentTop;
            const labelY = contentTop + valueBlockHeight + textStackGap;

            return (
              <Group key={it.key} x={it.x} y={it.y} listening={false}>
                {useMultiUnitFrame && frameImage && (
                  <KonvaImage
                    image={frameImage}
                    width={it.width}
                    height={it.height}
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                )}

                {useMultiUnitFrame && !frameImage && obj.frameColor && (
                  <Rect
                    width={it.width}
                    height={it.height}
                    stroke={frameStrokeColor}
                    strokeWidth={1.2}
                    cornerRadius={cornerRadius}
                    fill="transparent"
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                )}

                {obj.layout !== "minimal" && (
                  <Rect
                    width={it.width}
                    height={it.height}
                    fill={unitFillColor}
                    stroke={unitStrokeColor}
                    cornerRadius={cornerRadius}
                    shadowBlur={obj.boxShadow ? 8 : 0}
                    shadowColor={obj.boxShadow ? "rgba(0,0,0,0.15)" : "transparent"}
                    listening={false}
                    perfectDrawEnabled={false}
                    shadowForStrokeEnabled={false}
                  />
                )}

                <Text
                  text={it.value}
                  {...buildKonvaTextFillProps(valueTextFill, "#111827")}
                  fontFamily={obj.fontFamily}
                  fontStyle="bold"
                  fontSize={valueSize}
                  width={it.width}
                  align="center"
                  y={valueY}
                  lineHeight={lineHeight}
                  letterSpacing={letterSpacing}
                  listening={false}
                  perfectDrawEnabled={false}
                />

                {showLabels && (
                  <Text
                    text={itemLabel}
                    {...buildKonvaTextFillProps(labelTextFill, "#6b7280")}
                    fontFamily={obj.fontFamily}
                    fontSize={labelSize}
                    width={it.width}
                    align="center"
                    y={labelY}
                    lineHeight={1}
                    letterSpacing={letterSpacing}
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                )}

              </Group>
            );
          })}

          {separatorLayouts.map((item) => {
            const separatorFill = resolveKonvaFill(
              obj.color,
              Math.max(1, item.width),
              Math.max(1, separatorFontSize),
              "#111827"
            );
            return (
              <Text
                key={item.key}
                x={item.x}
                y={item.y}
                width={item.width}
                align="center"
                text={separatorText}
                {...buildKonvaTextFillProps(separatorFill, "#111827")}
                fontFamily={obj.fontFamily}
                fontSize={separatorFontSize}
                listening={false}
                perfectDrawEnabled={false}
              />
            );
          })}
        </Group>
      )}
    </Group>
  );
}
