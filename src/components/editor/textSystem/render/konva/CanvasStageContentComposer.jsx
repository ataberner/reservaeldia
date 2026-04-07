import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  getActiveCanvasBoxFlowSession,
  isCanvasBoxFlowIdentityRetired,
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
  sampleCanvasInteractionLog,
} from "@/components/editor/canvasEditor/selectedDragDebug";
import {
  buildTextGeometryContractRect,
  evaluateTextGeometryContractRectAlignment,
  logTextGeometryContractInvariant,
} from "@/components/editor/canvasEditor/textGeometryContractDebug";
import {
  resolveAuthoritativeTextRect,
} from "@/components/editor/canvasEditor/konvaAuthoritativeBounds";
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

function getComposerVisualNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function buildComposerDebugRect(rect = null) {
  if (!rect) return null;
  return {
    x: roundRotationMetric(rect.x),
    y: roundRotationMetric(rect.y),
    width: roundRotationMetric(rect.width),
    height: roundRotationMetric(rect.height),
    centerX: roundRotationMetric(
      Number(rect.x) + Number(rect.width) / 2
    ),
    centerY: roundRotationMetric(
      Number(rect.y) + Number(rect.height) / 2
    ),
  };
}

function buildComposerRectDelta(primaryRect = null, secondaryRect = null) {
  if (!primaryRect || !secondaryRect) return null;
  return {
    dx: roundRotationMetric(Number(secondaryRect.x) - Number(primaryRect.x)),
    dy: roundRotationMetric(Number(secondaryRect.y) - Number(primaryRect.y)),
    dWidth: roundRotationMetric(
      Number(secondaryRect.width) - Number(primaryRect.width)
    ),
    dHeight: roundRotationMetric(
      Number(secondaryRect.height) - Number(primaryRect.height)
    ),
    dCenterX: roundRotationMetric(
      (
        Number(secondaryRect.x) + Number(secondaryRect.width) / 2
      ) - (
        Number(primaryRect.x) + Number(primaryRect.width) / 2
      )
    ),
    dCenterY: roundRotationMetric(
      (
        Number(secondaryRect.y) + Number(secondaryRect.height) / 2
      ) - (
        Number(primaryRect.y) + Number(primaryRect.height) / 2
      )
    ),
  };
}

function resolveComposerBoundsRect(bounds = null) {
  if (!bounds) return null;
  if (bounds.kind === "rect") {
    return bounds;
  }
  if (bounds.kind === "polygon" && Array.isArray(bounds.points) && bounds.points.length >= 8) {
    const xs = [];
    const ys = [];
    for (let index = 0; index < bounds.points.length; index += 2) {
      const x = Number(bounds.points[index]);
      const y = Number(bounds.points[index + 1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      xs.push(x);
      ys.push(y);
    }
    if (xs.length === 0 || ys.length === 0) return null;
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
  return null;
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

function createEmptyDragInteractionSession() {
  return {
    sessionKey: null,
    dragId: null,
    selectedIds: [],
    selectedIdsDigest: "",
    interactionEpoch: 0,
    phase: null,
    overlaySessionKey: null,
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

function areDragInteractionSessionsEqual(left, right) {
  return (
    left?.sessionKey === right?.sessionKey &&
    left?.dragId === right?.dragId &&
    areSelectionIdListsEqual(left?.selectedIds, right?.selectedIds) &&
    left?.selectedIdsDigest === right?.selectedIdsDigest &&
    Number(left?.interactionEpoch || 0) === Number(right?.interactionEpoch || 0) &&
    left?.phase === right?.phase &&
    left?.overlaySessionKey === right?.overlaySessionKey
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

function buildDragInteractionSessionKey(sequence, dragId) {
  return [
    "drag-session",
    Number(sequence || 0) || 0,
    dragId || "selection",
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
  const dragInteractionSessionCounterRef = useRef(0);
  const dragOverlaySyncTokenCounterRef = useRef(0);
  const dragOverlayBoxFlowSessionRef = useRef(createEmptyDragOverlayBoxFlowSession());
  const dragInteractionSessionRef = useRef(createEmptyDragInteractionSession());
  const dragOverlayControlledBoundsRef = useRef(
    createEmptyDragOverlayControlledBoundsState()
  );
  const dragOverlayDriftStateRef = useRef(createDragOverlayDriftPairingState());
  const dragOverlayStartupGateRef = useRef(createDragOverlayStartupGateState());
  const dragOverlayStartupStateRef = useRef(createEmptyDragOverlayStartupState());
  const dragOverlayShownSessionKeyRef = useRef(null);
  const dragOverlayStartupTimingRef = useRef({
    sessionKey: null,
    ownershipStartMs: 0,
    renderCommittedMs: 0,
    controlledSyncReadyMs: 0,
  });
  const dragOverlayStartupVisibilityBlockRef = useRef({
    sessionKey: null,
    source: null,
    reason: null,
  });
  const dragOverlayStartupReplayRafRef = useRef(0);
  const scheduleStartupControlledDragOverlayReplayRef = useRef(null);
  const pendingStartupControlledSyncRequestRef = useRef(null);
  const hoverSuppressionReasonsRef = useRef([]);
  const resolveDragOverlayIndicatorApi = useCallback((indicatorApi = null) => (
    indicatorApi || dragOverlayIndicatorRef.current || null
  ), []);
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
  const [isSelectedPhaseVisualReady, setIsSelectedPhaseVisualReady] = useState(false);
  const [isSelectedPhaseBoxVisible, setIsSelectedPhaseBoxVisible] = useState(false);
  const [isSelectedPhaseHandoffPaintConfirmed, setIsSelectedPhaseHandoffPaintConfirmed] =
    useState(false);
  const [hasDeferredOverlayVisualCleanup, setHasDeferredOverlayVisualCleanup] =
    useState(false);
  const selectedPhaseVisualReadyMetaRef = useRef(null);
  const selectedPhaseVisibilityMetaRef = useRef(null);
  const dragOverlayVisualCleanupGuardRef = useRef({
    shouldKeepDragOverlayMountedForSelectedPhaseHandoff: false,
    shouldRenderDragSelectionOverlay: false,
    isSelectedPhaseVisualReady: false,
    isSelectedPhaseActuallyVisible: false,
    isSelectedPhaseHandoffPaintConfirmed: false,
  });
  const selectedPhaseHandoffPaintConfirmRafRef = useRef(0);
  const selectedPhaseHandoffPaintConfirmKeyRef = useRef(null);
  const deferredOverlayVisualCleanupRef = useRef(null);
  const previousSelectedPhaseHandoffWaitRef = useRef(false);
  const [dragOverlayBoxFlowSession, setDragOverlayBoxFlowSession] = useState(
    createEmptyDragOverlayBoxFlowSession()
  );
  const [dragInteractionSession, setDragInteractionSession] = useState(
    createEmptyDragInteractionSession()
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
  useEffect(() => {
    dragInteractionSessionRef.current = dragInteractionSession;
  }, [dragInteractionSession]);
  const resolveReusableSelectionSessionIdentity = useCallback((...candidates) => {
    const candidateList = [
      ...candidates,
      dragInteractionSessionRef.current?.sessionKey || null,
    ];

    for (const candidate of candidateList) {
      const safeCandidate = String(candidate ?? "").trim();
      if (!safeCandidate) continue;
      if (isCanvasBoxFlowIdentityRetired("selection", safeCandidate)) {
        continue;
      }
      return safeCandidate;
    }

    return null;
  }, []);
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
  const commitDragInteractionSession = useCallback((updater) => {
    const previousSession = dragInteractionSessionRef.current;
    const nextSessionCandidate =
      typeof updater === "function" ? updater(previousSession) : updater;
    const nextSession = nextSessionCandidate?.sessionKey
      ? nextSessionCandidate
      : createEmptyDragInteractionSession();

    if (areDragInteractionSessionsEqual(previousSession, nextSession)) {
      return previousSession;
    }

    dragInteractionSessionRef.current = nextSession;
    setDragInteractionSession((currentSession) => (
      areDragInteractionSessionsEqual(currentSession, nextSession)
        ? currentSession
        : nextSession
    ));
    return nextSession;
  }, []);
  const allocateDragInteractionSession = useCallback(({
    dragId = null,
    selectedIds = [],
    interactionEpoch = 0,
    phase = "predrag",
    overlaySessionKey = null,
  } = {}) => {
    const nextSelectedIds = sanitizeSelectionIds(selectedIds);
    const nextSelectedIdsDigest =
      buildCanvasBoxFlowIdsDigest(nextSelectedIds) || "";
    dragInteractionSessionCounterRef.current += 1;
    return {
      sessionKey: buildDragInteractionSessionKey(
        dragInteractionSessionCounterRef.current,
        dragId
      ),
      dragId: dragId || null,
      selectedIds: [...nextSelectedIds],
      selectedIdsDigest: nextSelectedIdsDigest,
      interactionEpoch: Number(interactionEpoch || 0),
      phase: phase || null,
      overlaySessionKey: overlaySessionKey || null,
    };
  }, []);
  const ensureDragInteractionSession = useCallback(({
    dragId = null,
    selectedIds = [],
    interactionEpoch = 0,
    phase = "predrag",
    overlaySessionKey = null,
  } = {}) => {
    const nextSelectedIds = sanitizeSelectionIds(selectedIds);
    const nextInteractionEpoch = Number(interactionEpoch || 0);

    return commitDragInteractionSession((currentSession) => {
      if (!currentSession?.sessionKey) {
        return allocateDragInteractionSession({
          dragId,
          selectedIds: nextSelectedIds,
          interactionEpoch: nextInteractionEpoch,
          phase,
          overlaySessionKey,
        });
      }

      const normalizedSelectedIds =
        nextSelectedIds.length > 0
          ? nextSelectedIds
          : sanitizeSelectionIds(currentSession.selectedIds);
      const normalizedSelectedIdsDigest =
        buildCanvasBoxFlowIdsDigest(normalizedSelectedIds) ||
        currentSession.selectedIdsDigest ||
        "";
      const normalizedDragId = dragId || currentSession.dragId || null;
      const normalizedInteractionEpoch =
        nextInteractionEpoch > 0
          ? nextInteractionEpoch
          : Number(currentSession.interactionEpoch || 0);
      const normalizedPhase = phase || currentSession.phase || null;
      const normalizedOverlaySessionKey =
        overlaySessionKey || currentSession.overlaySessionKey || null;

      if (
        currentSession.dragId === normalizedDragId &&
        areSelectionIdListsEqual(
          currentSession.selectedIds,
          normalizedSelectedIds
        ) &&
        currentSession.selectedIdsDigest === normalizedSelectedIdsDigest &&
        Number(currentSession.interactionEpoch || 0) ===
          normalizedInteractionEpoch &&
        currentSession.phase === normalizedPhase &&
        currentSession.overlaySessionKey === normalizedOverlaySessionKey
      ) {
        return currentSession;
      }

      return {
        ...currentSession,
        dragId: normalizedDragId,
        selectedIds: [...normalizedSelectedIds],
        selectedIdsDigest: normalizedSelectedIdsDigest,
        interactionEpoch: normalizedInteractionEpoch,
        phase: normalizedPhase,
        overlaySessionKey: normalizedOverlaySessionKey,
      };
    });
  }, [allocateDragInteractionSession, commitDragInteractionSession]);
  const syncDragInteractionSessionFromOverlay = useCallback((overlaySession, phaseOverride = null) => {
    if (!overlaySession?.sessionKey) {
      return dragInteractionSessionRef.current;
    }

    return ensureDragInteractionSession({
      dragId: overlaySession.dragId || null,
      selectedIds: overlaySession.selectedIds,
      interactionEpoch: Number(overlaySession.interactionEpoch || 0),
      phase: phaseOverride || overlaySession.phase || null,
      overlaySessionKey: overlaySession.sessionKey,
    });
  }, [ensureDragInteractionSession]);
  const clearDragInteractionSession = useCallback((matcher = null) => (
    commitDragInteractionSession((currentSession) => {
      if (!currentSession?.sessionKey) {
        return currentSession;
      }
      if (typeof matcher === "function" && matcher(currentSession) !== true) {
        return currentSession;
      }
      return createEmptyDragInteractionSession();
    })
  ), [commitDragInteractionSession]);
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
      const nextInteractionSession = syncDragInteractionSessionFromOverlay(
        nextSession,
        phase
      );
      const nextInteractionSessionKey =
        nextInteractionSession?.sessionKey || nextSession.sessionKey;
      ensureCanvasBoxFlowSession("selection", nextInteractionSessionKey, {
        source: "stage-composer",
        selectedIds: nextSession.selectedIdsDigest,
        dragOverlaySessionKey: nextSession.sessionKey,
        dragOverlayPhase: nextSession.phase,
        dragInteractionSessionKey: nextInteractionSessionKey,
        dragInteractionPhase:
          nextInteractionSession?.phase || phase || nextSession.phase || null,
        dragOverlayInteractionEpoch: nextSession.interactionEpoch || null,
      }, {
        allowIdentityRetarget: true,
        authorityIdentity: nextInteractionSessionKey,
      });
    }
    return nextSession;
  }, [
    allocateDragOverlayBoxFlowSession,
    commitDragOverlayBoxFlowSession,
    resetDragOverlayStartupGate,
    syncDragInteractionSessionFromOverlay,
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
      const nextInteractionSession = syncDragInteractionSessionFromOverlay(
        nextSession,
        phase
      );
      const nextInteractionSessionKey =
        nextInteractionSession?.sessionKey || nextSession.sessionKey;
      ensureCanvasBoxFlowSession("selection", nextInteractionSessionKey, {
        source: "stage-composer",
        selectedIds: nextSession.selectedIdsDigest,
        dragOverlaySessionKey: nextSession.sessionKey,
        dragOverlayPhase: nextSession.phase,
        dragInteractionSessionKey: nextInteractionSessionKey,
        dragInteractionPhase:
          nextInteractionSession?.phase || phase || nextSession.phase || null,
        dragOverlayInteractionEpoch: nextSession.interactionEpoch || null,
      }, {
        allowIdentityRetarget: true,
        authorityIdentity: nextInteractionSessionKey,
      });
    }
    return nextSession;
  }, [
    allocateDragOverlayBoxFlowSession,
    commitDragOverlayBoxFlowSession,
    resetDragOverlayStartupGate,
    syncDragInteractionSessionFromOverlay,
  ]);
  const updateDragOverlayBoxFlowSessionPhase = useCallback((phase, {
    dragId = null,
    interactionEpoch = 0,
    source = "stage-composer",
    reason = null,
    pipeline = null,
  } = {}) => {
    const previousSession = dragOverlayBoxFlowSessionRef.current;
    const nextSession = commitDragOverlayBoxFlowSession((currentSession) => {
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
    });
    let nextInteractionSession = dragInteractionSessionRef.current;
    if (nextSession?.sessionKey) {
      nextInteractionSession = syncDragInteractionSessionFromOverlay(
        nextSession,
        phase
      );
      if (
        phase === "settling" &&
        previousSession?.sessionKey === nextSession.sessionKey &&
        previousSession?.phase !== phase
      ) {
        const sessionIdentity =
          resolveReusableSelectionSessionIdentity(
            nextInteractionSession?.sessionKey,
            nextSession.sessionKey
          ) ||
          nextSession.sessionKey;
        logCanvasBoxFlow("selection", "settling:start", {
          source,
          reason: reason || "drag-end",
          pipeline: pipeline || null,
          phase: "settling",
          owner: "drag-overlay",
          dragId: nextSession.dragId || dragId || null,
          selectedIds: nextSession.selectedIdsDigest || "",
          visualIds: nextSession.selectedIdsDigest || "",
          dragOverlaySessionKey: nextSession.sessionKey,
          dragInteractionSessionKey: nextInteractionSession?.sessionKey || null,
          selectionAuthority: "drag-session",
          geometryAuthority: "frozen-controlled-snapshot",
          overlayVisible: true,
          settling: true,
          suppressedLayers: ["hover-indicator", "selected-phase"],
        }, {
          identity: nextSession.sessionKey,
          sessionIdentity,
        });
      }
    }
    return nextSession;
  }, [
    commitDragOverlayBoxFlowSession,
    resolveReusableSelectionSessionIdentity,
    syncDragInteractionSessionFromOverlay,
  ]);
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
  const objectLookup = useMemo(() => {
    const lookup = new Map();
    (Array.isArray(objetos) ? objetos : []).forEach((objeto) => {
      const objectId = String(objeto?.id ?? "").trim();
      if (!objectId) return;
      lookup.set(objectId, objeto);
    });
    return lookup;
  }, [objetos]);
  const resolveLiveDragSelectionSnapshot = useCallback((selectedIds = []) => {
    const safeSelectedIds = sanitizeSelectionIds(selectedIds);
    if (safeSelectedIds.length === 0) return null;

    const bounds = resolveSelectionBounds({
      selectedElements: safeSelectedIds,
      elementRefs,
      objetos,
      objectLookup,
      isMobile,
      requireLiveNodes: true,
    });
    if (!bounds) {
      return null;
    }

    return {
      selectedIds: safeSelectedIds,
      selectedIdsDigest: buildCanvasBoxFlowIdsDigest(safeSelectedIds),
      bounds,
    };
  }, [elementRefs, isMobile, objectLookup, objetos]);
  const resolveLiveDragSelectionBounds = useCallback((selectedIds = []) => (
    resolveLiveDragSelectionSnapshot(selectedIds)?.bounds || null
  ), [resolveLiveDragSelectionSnapshot]);
  const syncControlledDragOverlayBounds = useCallback((selectedIds = [], {
    dragId = null,
    source = "controlled-sync",
    syncToken = null,
    liveSelectionSnapshot = null,
    startupSchedulingBoundary = null,
    startupApplyReason = null,
    indicatorApi = null,
  } = {}) => {
    const activeSession = dragOverlayBoxFlowSessionRef.current;
    const safeSelectedIds = sanitizeSelectionIds(selectedIds);
    const existingSnapshot = dragOverlayControlledBoundsRef.current;
    const activeIndicatorApi = resolveDragOverlayIndicatorApi(indicatorApi);
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

    const textSelectedId =
      safeSelectedIds.length === 1 ? String(safeSelectedIds[0] || "").trim() : "";
    const textSelectedObject =
      textSelectedId ? objectLookup.get(textSelectedId) || null : null;
    const isTextOverlaySync = textSelectedObject?.tipo === "texto";

    const resolvedLiveSelectionSnapshot =
      liveSelectionSnapshot?.bounds &&
      areSelectionIdListsEqual(liveSelectionSnapshot?.selectedIds, safeSelectedIds)
        ? liveSelectionSnapshot
        : resolveLiveDragSelectionSnapshot(safeSelectedIds);
    const nextBounds = resolvedLiveSelectionSnapshot?.bounds || null;
    if (!nextBounds) {
      const skippedSample = sampleCanvasInteractionLog(
        `drag-overlay:geometry-sync-skipped:${activeSession.sessionKey || dragId || "unknown"}`,
        {
          firstCount: 5,
          throttleMs: 120,
        }
      );
      if (skippedSample.shouldLog) {
        logSelectedDragDebug("drag-overlay:geometry-sync-skipped", {
          sampleCount: skippedSample.sampleCount,
          perfNowMs: roundRotationMetric(getComposerVisualNowMs()),
          dragOverlaySessionKey: activeSession.sessionKey || null,
          interactionEpoch: Number(activeSession.interactionEpoch || 0) || null,
          phase: activeSession.phase || null,
          dragId: dragId || activeSession.dragId || null,
          source,
          syncToken: syncToken || null,
          selectedIds: safeSelectedIds,
          geometrySource: isTextOverlaySync ? "textRect" : "live",
          reason: isTextOverlaySync
            ? "missing-authoritative-live-text-bounds"
            : "missing-live-selection-bounds",
        });
      }
      return existingSnapshot?.sessionKey === activeSession.sessionKey
        ? existingSnapshot
        : null;
    }
    const geometrySource = isTextOverlaySync ? "textRect" : "live";
    const geometrySourceChanged =
      existingSnapshot?.sessionKey === activeSession.sessionKey &&
      typeof existingSnapshot?.geometrySource === "string" &&
      existingSnapshot.geometrySource !== geometrySource;
    if (isTextOverlaySync) {
      const textNode = elementRefs.current?.[textSelectedId] || null;
      const requestedSelectionRect = resolveComposerBoundsRect(nextBounds);
      const authoritativeTextRect = textNode
        ? resolveAuthoritativeTextRect(textNode, textSelectedObject, {
            fallbackRect: requestedSelectionRect,
          })
        : null;
      const overlayAuthorityCheck = evaluateTextGeometryContractRectAlignment(
        authoritativeTextRect,
        requestedSelectionRect,
        {
          tolerance: 0.5,
          expectedLabel: "authoritative Konva text rect",
          actualLabel: "drag overlay requested rect",
        }
      );
      const syncSample = sampleCanvasInteractionLog(
        `drag-overlay:text-sync-request:${activeSession.sessionKey || textSelectedId}`,
        {
          firstCount: 6,
          throttleMs: 120,
        }
      );
      if (syncSample.shouldLog) {
        logSelectedDragDebug("overlay:text-sync-request", {
          sampleCount: syncSample.sampleCount,
          perfNowMs: roundRotationMetric(getComposerVisualNowMs()),
          dragOverlaySessionKey: activeSession.sessionKey || null,
          interactionEpoch: Number(activeSession.interactionEpoch || 0) || null,
          phase: activeSession.phase || null,
          dragId: dragId || activeSession.dragId || null,
          elementId: textSelectedId,
          tipo: textSelectedObject?.tipo || null,
          source,
          syncToken: syncToken || null,
          startupSchedulingBoundary: startupSchedulingBoundary || null,
          startupApplyReason: startupApplyReason || null,
          startupVisibleEligible:
            existingSnapshot?.startupVisibleEligible === true || false,
          liveSelectionSnapshotSource:
            liveSelectionSnapshot?.bounds &&
            areSelectionIdListsEqual(liveSelectionSnapshot?.selectedIds, safeSelectedIds)
              ? "provided"
              : "resolved-live",
          nextBounds: buildComposerDebugRect(nextBounds),
          visibleGuideCount:
            guideOverlayRef?.current?.getGuideLinesCount?.() || 0,
          pendingGuideEvaluation: Boolean(guideDragFrameRef.current?.payload),
          pendingGuideElementId:
            guideDragFrameRef.current?.payload?.elementId || null,
          textNode: getKonvaNodeDebugInfo(textNode),
        });
      }

      logTextGeometryContractInvariant(
        "drag-overlay-authoritative-bounds",
        {
          phase: activeSession.phase || "drag",
          surface: "drag-overlay",
          authoritySource: "resolveSelectionBounds(requireLiveNodes:true)",
          sessionIdentity:
            resolveReusableSelectionSessionIdentity(activeSession.sessionKey) ||
            activeSession.sessionKey ||
            textSelectedId,
          dragOverlaySessionKey: activeSession.sessionKey || null,
          elementId: textSelectedId,
          tipo: textSelectedObject?.tipo || null,
          dragId: dragId || activeSession.dragId || null,
          pass: overlayAuthorityCheck.pass,
          failureReason: overlayAuthorityCheck.failureReason,
          observedRects: {
            authoritativeKonvaRect:
              buildTextGeometryContractRect(authoritativeTextRect),
            dragOverlayRequestedRect:
              buildTextGeometryContractRect(requestedSelectionRect),
          },
          observedSources: {
            syncSource: source,
            startupVisibleEligible:
              existingSnapshot?.startupVisibleEligible === true,
            pendingGuideEvaluation: Boolean(guideDragFrameRef.current?.payload),
            pendingGuideElementId:
              guideDragFrameRef.current?.payload?.elementId || null,
          },
          delta: overlayAuthorityCheck.delta,
        },
        {
          sampleKey: `text-contract:drag-overlay:${activeSession.sessionKey || textSelectedId}`,
          firstCount: 5,
          throttleMs: 120,
          force:
            !overlayAuthorityCheck.pass ||
            source === "dragmove-sync" ||
            source === "controlled-sync",
        }
      );
    }

    const nextSnapshot = {
      sessionKey: activeSession.sessionKey,
      selectedIds: safeSelectedIds,
      bounds: nextBounds,
      source,
      geometrySource,
      dragId: dragId || activeSession.dragId || null,
      phase: activeSession.phase || null,
      syncToken: syncToken || null,
      startupVisibleEligible: false,
      startupEligibilityReason: null,
      applied: false,
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

    const geometrySyncSample = sampleCanvasInteractionLog(
      `drag-overlay:geometry-sync:${activeSession.sessionKey || dragId || "unknown"}`,
      {
        firstCount: 8,
        throttleMs: 120,
      }
    );
    if (
      geometrySyncSample.shouldLog ||
      geometrySourceChanged ||
      source === "guide-post-snap-sync"
    ) {
      logSelectedDragDebug("drag-overlay:geometry-sync", {
        sampleCount: geometrySyncSample.sampleCount,
        perfNowMs: roundRotationMetric(getComposerVisualNowMs()),
        dragOverlaySessionKey: activeSession.sessionKey || null,
        interactionEpoch: Number(activeSession.interactionEpoch || 0) || null,
        phase: activeSession.phase || null,
        dragId: nextSnapshot.dragId || null,
        source,
        syncToken: nextSnapshot.syncToken || null,
        selectedIds: safeSelectedIds,
        geometrySource,
        geometrySourceChanged,
        previousGeometrySource: existingSnapshot?.geometrySource || null,
        liveSelectionSnapshotSource:
          liveSelectionSnapshot?.bounds &&
          areSelectionIdListsEqual(liveSelectionSnapshot?.selectedIds, safeSelectedIds)
            ? "provided"
            : "resolved-live",
        bounds: buildComposerDebugRect(resolveComposerBoundsRect(nextBounds)),
        pendingGuideEvaluation: Boolean(guideDragFrameRef.current?.payload),
        pendingGuideElementId: guideDragFrameRef.current?.payload?.elementId || null,
      });
    }

    if (
      activeSession.phase !== "settling" &&
      startupDecision.shouldApply !== true &&
      nextSnapshot.startupVisibleEligible !== true
    ) {
      const previousStartupBlock = dragOverlayStartupVisibilityBlockRef.current || {};
      const nextStartupBlock = {
        sessionKey: activeSession.sessionKey || null,
        source,
        reason: nextSnapshot.startupEligibilityReason || null,
      };
      const shouldLogStartupBlock =
        previousStartupBlock.sessionKey !== nextStartupBlock.sessionKey ||
        previousStartupBlock.source !== nextStartupBlock.source ||
        previousStartupBlock.reason !== nextStartupBlock.reason;

      dragOverlayStartupVisibilityBlockRef.current = nextStartupBlock;

      if (shouldLogStartupBlock) {
        logCanvasBoxFlow("selection", "startup-visibility:blocked", {
          source: "stage-composer",
          startupSource: source,
          reason: nextSnapshot.startupEligibilityReason || "startup-not-visible",
          phase: nextSnapshot.phase || "predrag",
          owner: "drag-overlay",
          dragId: nextSnapshot.dragId || null,
          selectedIds: buildCanvasBoxFlowIdsDigest(safeSelectedIds),
          visualIds: buildCanvasBoxFlowIdsDigest(safeSelectedIds),
          dragOverlaySessionKey: activeSession.sessionKey || null,
          selectionAuthority: "drag-session",
          geometryAuthority: isSeedSource ? "startup-pending" : "live-nodes",
          overlayVisible: false,
          settling: false,
          suppressedLayers: ["hover-indicator", "selected-phase"],
          selectedPhaseActuallyVisible: Boolean(isSelectedPhaseBoxVisible),
          selectedPhaseVisualReady: Boolean(isSelectedPhaseVisualReady),
          hoverSuppressionReasons: [...hoverSuppressionReasonsRef.current],
        }, {
          identity: activeSession.sessionKey || null,
          sessionIdentity:
            resolveReusableSelectionSessionIdentity(
              activeSession.sessionKey
            ) || activeSession.sessionKey || null,
        });
      }
    } else {
      dragOverlayStartupVisibilityBlockRef.current = {
        sessionKey: activeSession.sessionKey || null,
        source: null,
        reason: null,
      };
    }

    if (nextSnapshot.startupVisibleEligible || isSeedSource) {
      const startupElementId =
        safeSelectedIds.length === 1 ? String(safeSelectedIds[0] || "").trim() : null;
      const startupAuthorityPass = !(
        nextSnapshot.startupVisibleEligible && isSeedSource
      );
      logTextGeometryContractInvariant(
        "drag-overlay-startup-authority",
        {
          phase: nextSnapshot.phase || "drag",
          surface: "drag-overlay",
          authoritySource: source,
          sessionIdentity:
            resolveReusableSelectionSessionIdentity(activeSession.sessionKey) ||
            activeSession.sessionKey ||
            null,
          dragOverlaySessionKey: activeSession.sessionKey || null,
          dragId: nextSnapshot.dragId || null,
          elementId: startupElementId || null,
          pass: startupAuthorityPass,
          failureReason: startupAuthorityPass
            ? null
            : "drag overlay startup promoted a seed snapshot into visible eligibility before authoritative controlled-sync",
          observedRects: {
            dragOverlayRequestedRect:
              buildTextGeometryContractRect(resolveComposerBoundsRect(nextBounds)),
          },
          observedSources: {
            startupVisibleEligible: nextSnapshot.startupVisibleEligible === true,
            startupEligibilityReason: nextSnapshot.startupEligibilityReason || null,
            isSeedSource,
            source,
          },
        },
        {
          sampleKey: `text-contract:drag-startup:${activeSession.sessionKey || "none"}`,
          firstCount: 4,
          throttleMs: 120,
          force: nextSnapshot.startupVisibleEligible || !startupAuthorityPass,
        }
      );
    }

    if (startupDecision.shouldApply) {
      const appliedSnapshot = activeIndicatorApi?.applyControlledBounds?.(nextBounds, {
        source,
        debugSource: "drag-overlay",
        selectedIds: safeSelectedIds,
        identity: activeSession.sessionKey,
        lifecycleKey: activeSession.sessionKey,
        dragId: nextSnapshot.dragId,
        phase: nextSnapshot.phase,
        geometrySource,
        syncToken: nextSnapshot.syncToken,
      });
      nextSnapshot.applied = Boolean(appliedSnapshot);
      const isFirstStartupVisibleApply = Boolean(
        nextSnapshot.startupVisibleEligible &&
        nextSnapshot.startupEligibilityReason === "startup-first-authoritative-sync"
      );
      if (isFirstStartupVisibleApply) {
        const startupTiming = dragOverlayStartupTimingRef.current || {};
        const nowMs =
          typeof performance !== "undefined" && typeof performance.now === "function"
            ? performance.now()
            : Date.now();
        const startupDelaySinceReadyMs =
          startupTiming.sessionKey === activeSession.sessionKey &&
          Number(startupTiming.controlledSyncReadyMs || 0) > 0
            ? roundDragOverlayDriftMetric(
                nowMs - Number(startupTiming.controlledSyncReadyMs || 0)
              )
            : null;
        const startupDelaySinceRenderCommitMs =
          startupTiming.sessionKey === activeSession.sessionKey &&
          Number(startupTiming.renderCommittedMs || 0) > 0
            ? roundDragOverlayDriftMetric(
                nowMs - Number(startupTiming.renderCommittedMs || 0)
              )
            : null;

        logCanvasBoxFlow(
          "selection",
          appliedSnapshot
            ? "startup-controlled-sync-render-eligible"
            : "startup-controlled-sync-apply-deferred",
          {
            source,
            reason: appliedSnapshot
              ? (
                  startupApplyReason ||
                  "immediate-controlled-sync-apply"
                )
              : (
                  startupApplyReason ||
                  "waiting-controlled-overlay-render-ready"
                ),
            phase: nextSnapshot.phase || "drag",
            owner: "drag-overlay",
            dragId: nextSnapshot.dragId,
            selectedIds: buildCanvasBoxFlowIdsDigest(safeSelectedIds),
            visualIds: buildCanvasBoxFlowIdsDigest(safeSelectedIds),
            dragOverlaySessionKey: activeSession.sessionKey,
            selectionAuthority: "drag-session",
            geometryAuthority: "live-nodes",
            overlayVisible: Boolean(appliedSnapshot),
            overlayMounted: Boolean(activeIndicatorApi?.applyControlledBounds),
            settling: false,
            suppressedLayers: ["hover-indicator", "selected-phase"],
            syncToken: nextSnapshot.syncToken || null,
            bounds: buildCanvasBoxFlowBoundsDigest(nextBounds),
            schedulingBoundary:
              startupSchedulingBoundary ||
              (
                appliedSnapshot
                  ? "immediate-controlled-apply"
                  : "waiting-controlled-render-ready"
              ),
            startupDelaySinceReadyMs,
            startupDelaySinceRenderCommitMs,
          },
          {
            identity: activeSession.sessionKey,
            sessionIdentity: resolveReusableSelectionSessionIdentity(
              activeSession.sessionKey
            ),
          }
        );
        if (!appliedSnapshot) {
          scheduleStartupControlledDragOverlayReplayRef.current?.({
            source,
            reason:
              startupApplyReason ||
              "waiting-controlled-overlay-render-ready",
          });
        }
      }
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
    isSelectedPhaseBoxVisible,
    isSelectedPhaseVisualReady,
    markDragOverlayStartupFrameVisible,
    resolveLiveDragSelectionSnapshot,
    resolveDragOverlayIndicatorApi,
    resolveReusableSelectionSessionIdentity,
  ]);
  const clearControlledDragOverlayBounds = useCallback((reason = "overlay-hidden") => {
    const currentSnapshot = dragOverlayControlledBoundsRef.current;
    if (currentSnapshot?.sessionKey) {
      const releaseElementId =
        Array.isArray(currentSnapshot.selectedIds) &&
        currentSnapshot.selectedIds.length === 1
          ? String(currentSnapshot.selectedIds[0] || "").trim()
          : null;
      logTextGeometryContractInvariant(
        "drag-overlay-authority-release",
        {
          phase: currentSnapshot.phase || "drag-end",
          surface: "drag-overlay",
          authoritySource: "stage-composer-clear",
          sessionIdentity:
            resolveReusableSelectionSessionIdentity(currentSnapshot.sessionKey) ||
            currentSnapshot.sessionKey,
          dragOverlaySessionKey: currentSnapshot.sessionKey,
          dragId: currentSnapshot.dragId || null,
          elementId: releaseElementId || null,
          pass: true,
          failureReason: null,
          observedRects: {
            dragOverlayRequestedRect:
              buildTextGeometryContractRect(
                resolveComposerBoundsRect(currentSnapshot.bounds)
              ),
          },
          observedSources: {
            reason,
            selectedIds: buildCanvasBoxFlowIdsDigest(
              currentSnapshot.selectedIds || []
            ),
          },
        },
        {
          sampleKey: `text-contract:drag-end:${currentSnapshot.sessionKey}`,
          firstCount: 3,
          throttleMs: 120,
          force: true,
        }
      );
    }
    if (currentSnapshot?.sessionKey) {
      dragOverlayIndicatorRef.current?.clearControlledBounds?.({
        source: "stage-composer",
        debugSource: "drag-overlay",
        identity: currentSnapshot.sessionKey,
        reason,
      });
    }
    return resetControlledDragOverlayBounds(null);
  }, [resetControlledDragOverlayBounds, resolveReusableSelectionSessionIdentity]);
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
        sessionIdentity: resolveReusableSelectionSessionIdentity(
          targetSessionKey
        ),
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
        sessionIdentity: resolveReusableSelectionSessionIdentity(
          activeSession.sessionKey
        ),
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
    liveSelectionSnapshot = null,
  } = {}) => {
    const activeSession = dragOverlayBoxFlowSessionRef.current;
    if (!activeSession?.sessionKey || activeSession.phase !== "drag") return null;

    const safeSelectedIds = sanitizeSelectionIds(selectedIds);
    const resolvedLiveSelectionSnapshot =
      liveSelectionSnapshot?.bounds &&
      areSelectionIdListsEqual(liveSelectionSnapshot?.selectedIds, safeSelectedIds)
        ? liveSelectionSnapshot
        : resolveLiveDragSelectionSnapshot(safeSelectedIds);
    const dragBounds = buildCanvasBoxFlowBoundsDigest(
      resolvedLiveSelectionSnapshot?.bounds || null
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
        resolvedLiveSelectionSnapshot?.selectedIdsDigest ||
        buildCanvasBoxFlowIdsDigest(safeSelectedIds) ||
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
    resolveLiveDragSelectionSnapshot,
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
          sessionIdentity: resolveReusableSelectionSessionIdentity(
            driftState.sessionKey
          ),
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
  hoverSuppressionReasonsRef.current = [...hoverSuppressionReasons];
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
        .map((id) => objectLookup.get(id) || null)
        .filter(Boolean),
    [elementosSeleccionados, objectLookup]
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
        dragOverlaySessionPhase: dragOverlayBoxFlowSession.phase || null,
        dragVisualSelectionIds,
        predragVisualSelectionActive: isPredragVisualSelectionActive,
      }),
    [
      activeInlineEditingId,
      areaSeleccion,
      canvasInteractionActive,
      canvasInteractionSettling,
      dragOverlayBoxFlowSession.phase,
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
  const shouldMountPrimarySelectionOverlay = Boolean(
    stageSelectionVisualMode.mountPrimarySelectionOverlay &&
      !isPredragVisualSelectionActive
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
  const dragOverlayBoxFlowIdentity =
    dragOverlayBoxFlowSession.sessionKey || null;
  const dragInteractionSessionKey =
    resolveReusableSelectionSessionIdentity(
      dragInteractionSession.sessionKey || null
    );
  const dragOverlayHandoffWaitRef = useRef(false);
  const handleDragSelectionOverlayReadyChange = useCallback((isReady) => {
    setIsDragSelectionOverlayVisualReady((current) => (
      current === Boolean(isReady) ? current : Boolean(isReady)
    ));
  }, []);
  const hasSelectedPhaseReturnTarget = Boolean(
    !stageSelectionVisualMode.singleSelectedLineId &&
      (
        canonicalSelectedIdsForBoxFlow.length > 0 ||
        dragVisualSelectionIds.length > 0 ||
        dragOverlayBoxFlowSession.selectedIds.length > 0
      )
  );
  const shouldKeepDragOverlayMountedForSelectedPhaseHandoff = Boolean(
    dragOverlayBoxFlowIdentity &&
      !shouldShowDragSelectionOverlay &&
      hasSelectedPhaseReturnTarget &&
      (
        !isSelectedPhaseBoxVisible ||
        !isSelectedPhaseVisualReady ||
        !isSelectedPhaseHandoffPaintConfirmed
      )
  );
  const shouldRenderDragSelectionOverlay = Boolean(
    shouldShowDragSelectionOverlay ||
      shouldKeepDragOverlayMountedForSelectedPhaseHandoff
  );
  dragOverlayVisualCleanupGuardRef.current = {
    shouldKeepDragOverlayMountedForSelectedPhaseHandoff,
    shouldRenderDragSelectionOverlay,
    isSelectedPhaseActuallyVisible: Boolean(isSelectedPhaseBoxVisible),
    isSelectedPhaseVisualReady: Boolean(isSelectedPhaseVisualReady),
    isSelectedPhaseHandoffPaintConfirmed: Boolean(
      isSelectedPhaseHandoffPaintConfirmed
    ),
  };
  const dragOverlayRenderSelectionIds =
    shouldShowDragSelectionOverlay
      ? stageSelectionVisualMode.dragOverlaySelectionIds
      : (
          shouldKeepDragOverlayMountedForSelectedPhaseHandoff
            ? (
                dragOverlayBoxFlowSession.selectedIds.length > 0
                  ? sanitizeSelectionIds(dragOverlayBoxFlowSession.selectedIds)
                  : (
                      dragVisualSelectionIds.length > 0
                        ? sanitizeSelectionIds(dragVisualSelectionIds)
                        : canonicalSelectedIdsForBoxFlow
                    )
              )
            : []
        );
  const dragOverlaySelectionIdsDigest = buildCanvasBoxFlowIdsDigest(
    dragOverlayRenderSelectionIds
  );
  const selectionBoxFlowIdentity =
    dragInteractionSessionKey ||
    dragOverlayBoxFlowIdentity ||
    selectedIdsDigest ||
    dragOverlaySelectionIdsDigest ||
    null;
  const resolveSelectionBoxFlowIdentity = useCallback((fallbackId = null, ids = null) => {
    const idsDigest = buildCanvasBoxFlowIdsDigest(
      Array.isArray(ids) ? ids : []
    );
    const activeDragInteractionIdentity =
      resolveReusableSelectionSessionIdentity();
    const activeDragOverlayIdentity =
      dragOverlayBoxFlowSessionRef.current?.sessionKey || null;
    return (
      activeDragInteractionIdentity ||
      activeDragOverlayIdentity ||
      idsDigest ||
      selectionBoxFlowIdentity ||
      fallbackId ||
      "selection:implicit"
    );
  }, [selectionBoxFlowIdentity]);
  const effectiveDragOverlayVisibilityDriver =
    shouldKeepDragOverlayMountedForSelectedPhaseHandoff
      ? "selected-phase-handoff-wait"
      : stageSelectionVisualMode.dragOverlayVisibilityDriver || null;
  const effectiveDragOverlayVisibilityAuthority =
    shouldKeepDragOverlayMountedForSelectedPhaseHandoff
      ? "handoff-guard"
      : stageSelectionVisualMode.dragOverlayVisibilityAuthority || null;
  const handleSelectedPhaseVisualReadyChange = useCallback((isReady, meta = {}) => {
    const nextReady = Boolean(isReady);
    const nextMeta = {
      ...meta,
      isReady: nextReady,
    };
    selectedPhaseVisualReadyMetaRef.current = nextMeta;
    const readinessKey = nextReady
      ? [
          nextMeta.sessionIdentity || "",
          nextMeta.visualIdentity || "",
          buildCanvasBoxFlowBoundsDigest(nextMeta.bounds) ? JSON.stringify(
            buildCanvasBoxFlowBoundsDigest(nextMeta.bounds)
          ) : "none",
        ].join("|")
      : null;

    if (
      selectedPhaseHandoffPaintConfirmRafRef.current &&
      typeof cancelAnimationFrame === "function"
    ) {
      cancelAnimationFrame(selectedPhaseHandoffPaintConfirmRafRef.current);
    }
    selectedPhaseHandoffPaintConfirmRafRef.current = 0;
    selectedPhaseHandoffPaintConfirmKeyRef.current = readinessKey;

    if (!nextReady) {
      setIsSelectedPhaseHandoffPaintConfirmed((current) => (current ? false : current));
    } else {
      setIsSelectedPhaseHandoffPaintConfirmed((current) => (current ? false : current));
      logCanvasBoxFlow("selection", "selected-phase:handoff-paint-pending", {
        source: "stage-composer",
        reason: "await-extra-post-paint-handoff-confirmation",
        phase: dragOverlayHandoffWaitRef.current ? "settling" : "selected",
        owner: "selected-phase",
        selectedIds: nextMeta.visualIdentity || selectedIdsDigest,
        visualIds: nextMeta.visualIdentity || selectedIdsDigest,
        selectionAuthority: "logical-selection",
        geometryAuthority:
          nextMeta.renderMode === "transformer" ? "transformer-live" : "selected-auto-bounds",
        overlayVisible: shouldRenderDragSelectionOverlay,
        settling: dragOverlayHandoffWaitRef.current,
        suppressedLayers:
          dragOverlayHandoffWaitRef.current
            ? ["drag-overlay", "hover-indicator"]
            : ["hover-indicator"],
        hideDeferred: true,
        readySource: nextMeta.readySource || null,
        readySignal: nextMeta.readySignal || null,
        postPaintConfirmed: Boolean(nextMeta.postPaintConfirmed),
        handoffPaintConfirmed: false,
        boundsValid:
          typeof nextMeta.boundsValid === "boolean" ? nextMeta.boundsValid : null,
        zeroBounds:
          typeof nextMeta.zeroBounds === "boolean" ? nextMeta.zeroBounds : null,
        bounds: nextMeta.bounds || null,
      }, {
        identity:
          selectionBoxFlowIdentity || nextMeta.visualIdentity || selectedIdsDigest || null,
      });

      const confirmHandoffPaint = () => {
        selectedPhaseHandoffPaintConfirmRafRef.current = 0;
        const latestMeta = selectedPhaseVisualReadyMetaRef.current || null;
        const latestReadyKey =
          latestMeta?.isReady
            ? [
                latestMeta.sessionIdentity || "",
                latestMeta.visualIdentity || "",
                buildCanvasBoxFlowBoundsDigest(latestMeta.bounds) ? JSON.stringify(
                  buildCanvasBoxFlowBoundsDigest(latestMeta.bounds)
                ) : "none",
              ].join("|")
            : null;

        if (!latestMeta?.isReady || latestReadyKey !== readinessKey) {
          return;
        }

        setIsSelectedPhaseHandoffPaintConfirmed((current) => (
          current ? current : true
        ));
        logCanvasBoxFlow("selection", "selected-phase:handoff-paint-confirmed", {
          source: "stage-composer",
          reason: "extra-post-paint-handoff-confirmation",
          phase: dragOverlayHandoffWaitRef.current ? "settling" : "selected",
          owner: "selected-phase",
          selectedIds: latestMeta.visualIdentity || selectedIdsDigest,
          visualIds: latestMeta.visualIdentity || selectedIdsDigest,
          selectionAuthority: "logical-selection",
          geometryAuthority:
            latestMeta.renderMode === "transformer" ? "transformer-live" : "selected-auto-bounds",
          overlayVisible: shouldRenderDragSelectionOverlay,
          settling: dragOverlayHandoffWaitRef.current,
          suppressedLayers:
            dragOverlayHandoffWaitRef.current
              ? ["drag-overlay", "hover-indicator"]
              : ["hover-indicator"],
          hideDeferred: dragOverlayHandoffWaitRef.current,
          readySource: latestMeta.readySource || null,
          readySignal: latestMeta.readySignal || null,
          postPaintConfirmed: Boolean(latestMeta.postPaintConfirmed),
          handoffPaintConfirmed: true,
          boundsValid:
            typeof latestMeta.boundsValid === "boolean" ? latestMeta.boundsValid : null,
          zeroBounds:
            typeof latestMeta.zeroBounds === "boolean" ? latestMeta.zeroBounds : null,
          bounds: latestMeta.bounds || null,
        }, {
          identity:
            selectionBoxFlowIdentity || latestMeta.visualIdentity || selectedIdsDigest || null,
        });
      };

      if (typeof requestAnimationFrame === "function") {
        selectedPhaseHandoffPaintConfirmRafRef.current =
          requestAnimationFrame(confirmHandoffPaint);
      } else {
        confirmHandoffPaint();
      }
    }
    setIsSelectedPhaseVisualReady((current) => (
      current === nextReady ? current : nextReady
    ));
    logCanvasBoxFlow(
      "selection",
      nextReady ? "selected-phase:visual-ready" : "selected-phase:visual-not-ready",
      {
        source: "stage-composer",
        reason: meta.reason || (nextReady ? "visual-ready" : "visual-reset"),
        phase: dragOverlayHandoffWaitRef.current ? "settling" : "selected",
        owner: "selected-phase",
        selectedIds: meta.visualIdentity || selectedIdsDigest,
        visualIds: meta.visualIdentity || selectedIdsDigest,
        selectionAuthority: "logical-selection",
        geometryAuthority:
          meta.renderMode === "transformer" ? "transformer-live" : "selected-auto-bounds",
        overlayVisible: shouldRenderDragSelectionOverlay,
        settling: dragOverlayHandoffWaitRef.current,
        suppressedLayers:
          dragOverlayHandoffWaitRef.current
            ? ["drag-overlay", "hover-indicator"]
            : ["hover-indicator"],
        hideDeferred: dragOverlayHandoffWaitRef.current,
        renderMode: meta.renderMode || null,
        readySource: meta.readySource || null,
        readySignal: meta.readySignal || null,
        postPaintConfirmed: Boolean(meta.postPaintConfirmed),
        handoffPaintConfirmed: false,
        boundsValid:
          typeof meta.boundsValid === "boolean" ? meta.boundsValid : null,
        zeroBounds:
          typeof meta.zeroBounds === "boolean" ? meta.zeroBounds : null,
        bounds: meta.bounds || null,
      },
      {
        identity: selectionBoxFlowIdentity || meta.visualIdentity || selectedIdsDigest || null,
      }
    );
  }, [
    selectedIdsDigest,
    selectionBoxFlowIdentity,
    shouldRenderDragSelectionOverlay,
  ]);
  const handleSelectedPhaseVisibilityChange = useCallback((isVisible, meta = {}) => {
    const nextVisible = Boolean(isVisible);
    selectedPhaseVisibilityMetaRef.current = {
      ...meta,
      isVisible: nextVisible,
    };
    setIsSelectedPhaseBoxVisible((current) => (
      current === nextVisible ? current : nextVisible
    ));
  }, []);
  useEffect(
    () => () => {
      if (
        selectedPhaseHandoffPaintConfirmRafRef.current &&
        typeof cancelAnimationFrame === "function"
      ) {
        cancelAnimationFrame(selectedPhaseHandoffPaintConfirmRafRef.current);
      }
      selectedPhaseHandoffPaintConfirmRafRef.current = 0;
      selectedPhaseHandoffPaintConfirmKeyRef.current = null;
    },
    []
  );
  useEffect(() => {
    dragOverlayHandoffWaitRef.current =
      shouldKeepDragOverlayMountedForSelectedPhaseHandoff;
  }, [shouldKeepDragOverlayMountedForSelectedPhaseHandoff]);
  useEffect(() => {
    const wasWaiting = previousSelectedPhaseHandoffWaitRef.current;
    previousSelectedPhaseHandoffWaitRef.current =
      shouldKeepDragOverlayMountedForSelectedPhaseHandoff;
    if (
      !wasWaiting ||
      shouldKeepDragOverlayMountedForSelectedPhaseHandoff ||
      shouldShowDragSelectionOverlay ||
      !isSelectedPhaseBoxVisible ||
      !isSelectedPhaseVisualReady ||
      !isSelectedPhaseHandoffPaintConfirmed
    ) {
      return;
    }

    const readyMeta = selectedPhaseVisualReadyMetaRef.current || {};
    logCanvasBoxFlow("selection", "drag-overlay:hide-allowed", {
      source: "stage-composer",
      reason: "selected-phase-visual-ready-confirmed",
      phase: "settling",
      owner: "drag-overlay",
      dragId: dragOverlayBoxFlowSessionRef.current?.dragId || null,
      selectedIds: selectedIdsDigest,
      visualIds: dragOverlaySelectionIdsDigest || selectedIdsDigest,
      dragOverlaySessionKey: dragOverlayBoxFlowIdentity,
      selectionAuthority: "drag-session",
      geometryAuthority: "frozen-controlled-snapshot",
      overlayVisible: false,
      settling: true,
      suppressedLayers: ["hover-indicator", "selected-phase"],
      hideDeferred: false,
      readySource: readyMeta.readySource || null,
      readySignal: readyMeta.readySignal || null,
      postPaintConfirmed: Boolean(readyMeta.postPaintConfirmed),
      selectedPhaseActuallyVisible: true,
      handoffPaintConfirmed: true,
      waitedForPostPaintConfirmation: true,
      boundsValid:
        typeof readyMeta.boundsValid === "boolean"
          ? readyMeta.boundsValid
          : null,
      zeroBounds:
        typeof readyMeta.zeroBounds === "boolean"
          ? readyMeta.zeroBounds
          : null,
      bounds: readyMeta.bounds || null,
    }, {
      identity: dragOverlayBoxFlowIdentity,
      sessionIdentity:
        resolveReusableSelectionSessionIdentity(
          dragInteractionSessionKey,
          dragOverlayBoxFlowIdentity
        ) || dragOverlayBoxFlowIdentity,
    });
  }, [
    dragInteractionSessionKey,
    dragOverlayBoxFlowIdentity,
    dragOverlaySelectionIdsDigest,
    isSelectedPhaseBoxVisible,
    isSelectedPhaseHandoffPaintConfirmed,
    isSelectedPhaseVisualReady,
    resolveReusableSelectionSessionIdentity,
    selectedIdsDigest,
    shouldKeepDragOverlayMountedForSelectedPhaseHandoff,
    shouldShowDragSelectionOverlay,
  ]);
  useEffect(() => {
    if (!hasDeferredOverlayVisualCleanup) return;
    if (shouldRenderDragSelectionOverlay) return;

    const deferredCleanup = deferredOverlayVisualCleanupRef.current || {};
    const readyMeta = selectedPhaseVisualReadyMetaRef.current || {};
    logCanvasBoxFlow("selection", "drag-overlay:cleanup-allowed", {
      source: deferredCleanup.source || "stage-composer",
      reason: deferredCleanup.reason || "handoff-complete",
      phase: "settling",
      owner: "drag-overlay",
      dragId:
        deferredCleanup.dragId ||
        dragOverlayBoxFlowSessionRef.current?.dragId ||
        null,
      selectedIds:
        deferredCleanup.selectedIdsDigest ||
        dragOverlaySelectionIdsDigest ||
        selectedIdsDigest,
      visualIds:
        deferredCleanup.selectedIdsDigest ||
        dragOverlaySelectionIdsDigest ||
        selectedIdsDigest,
      dragOverlaySessionKey:
        deferredCleanup.sessionKey ||
        dragOverlayBoxFlowIdentity,
      selectionAuthority: "drag-session",
      geometryAuthority: "frozen-controlled-snapshot",
      overlayVisible: false,
      overlayMounted: false,
      settling: false,
      suppressedLayers: ["hover-indicator", "selected-phase"],
      cleanupDeferred: false,
      cleanupBlocked: false,
      visualHideDeniedBecause: null,
      selectedPhaseVisualReady: Boolean(isSelectedPhaseVisualReady),
      handoffPaintConfirmed: Boolean(isSelectedPhaseHandoffPaintConfirmed),
      waitedForPostPaintConfirmation: true,
      readySource: readyMeta.readySource || null,
      readySignal: readyMeta.readySignal || null,
      postPaintConfirmed: Boolean(readyMeta.postPaintConfirmed),
      selectedPhaseActuallyVisible: Boolean(isSelectedPhaseBoxVisible),
      boundsValid:
        typeof readyMeta.boundsValid === "boolean"
          ? readyMeta.boundsValid
          : null,
      zeroBounds:
        typeof readyMeta.zeroBounds === "boolean"
          ? readyMeta.zeroBounds
          : null,
      bounds: readyMeta.bounds || null,
    }, {
      identity:
        deferredCleanup.sessionKey ||
        dragOverlayBoxFlowIdentity ||
        selectionBoxFlowIdentity,
      sessionIdentity:
        resolveReusableSelectionSessionIdentity(
          dragInteractionSessionKey,
          deferredCleanup.sessionKey,
          dragOverlayBoxFlowIdentity,
          selectionBoxFlowIdentity
        ) ||
        deferredCleanup.sessionKey ||
        dragOverlayBoxFlowIdentity ||
        selectionBoxFlowIdentity,
    });
    deferredOverlayVisualCleanupRef.current = null;
    setHasDeferredOverlayVisualCleanup(false);
  }, [
    dragInteractionSessionKey,
    dragOverlayBoxFlowIdentity,
    dragOverlaySelectionIdsDigest,
    hasDeferredOverlayVisualCleanup,
    isSelectedPhaseBoxVisible,
    isSelectedPhaseHandoffPaintConfirmed,
    isSelectedPhaseVisualReady,
    resolveReusableSelectionSessionIdentity,
    selectedIdsDigest,
    selectionBoxFlowIdentity,
    shouldRenderDragSelectionOverlay,
  ]);
  useEffect(() => {
    if (!shouldShowDragSelectionOverlay) return;
    if (
      selectedPhaseHandoffPaintConfirmRafRef.current &&
      typeof cancelAnimationFrame === "function"
    ) {
      cancelAnimationFrame(selectedPhaseHandoffPaintConfirmRafRef.current);
    }
    selectedPhaseHandoffPaintConfirmRafRef.current = 0;
    selectedPhaseHandoffPaintConfirmKeyRef.current = null;
    selectedPhaseVisualReadyMetaRef.current = null;
    deferredOverlayVisualCleanupRef.current = null;
    setHasDeferredOverlayVisualCleanup((current) => (current ? false : current));
    setIsSelectedPhaseHandoffPaintConfirmed((current) => (current ? false : current));
    setIsSelectedPhaseVisualReady((current) => (current ? false : current));
  }, [shouldShowDragSelectionOverlay]);
  useEffect(() => {
    if (!shouldKeepDragOverlayMountedForSelectedPhaseHandoff) return;
    const readyMeta = selectedPhaseVisualReadyMetaRef.current || {};

    logCanvasBoxFlow("selection", "drag-overlay:hide-deferred", {
      source: "stage-composer",
      reason: !isSelectedPhaseVisualReady
        ? "waiting-selected-phase-visual-ready"
        : "waiting-selected-phase-handoff-paint-confirmation",
      phase: "settling",
      owner: "drag-overlay",
      dragId: dragOverlayBoxFlowSessionRef.current?.dragId || null,
      selectedIds: selectedIdsDigest,
      visualIds: dragOverlaySelectionIdsDigest || selectedIdsDigest,
      dragOverlaySessionKey: dragOverlayBoxFlowIdentity,
      selectionAuthority: "drag-session",
      geometryAuthority: "frozen-controlled-snapshot",
      overlayVisible: true,
      settling: true,
      suppressedLayers: ["hover-indicator", "selected-phase"],
      hideDeferred: true,
      readySource: readyMeta.readySource || null,
      readySignal: readyMeta.readySignal || null,
      postPaintConfirmed: Boolean(readyMeta.postPaintConfirmed),
      handoffPaintConfirmed: Boolean(isSelectedPhaseHandoffPaintConfirmed),
      waitedForPostPaintConfirmation: Boolean(
        isSelectedPhaseVisualReady && !isSelectedPhaseHandoffPaintConfirmed
      ),
      boundsValid:
        typeof readyMeta.boundsValid === "boolean"
          ? readyMeta.boundsValid
          : null,
      zeroBounds:
        typeof readyMeta.zeroBounds === "boolean"
          ? readyMeta.zeroBounds
          : null,
      bounds: readyMeta.bounds || null,
    }, {
      identity: dragOverlayBoxFlowIdentity,
      sessionIdentity:
        resolveReusableSelectionSessionIdentity(
          dragInteractionSessionKey,
          dragOverlayBoxFlowIdentity
        ) || dragOverlayBoxFlowIdentity,
    });
  }, [
    dragInteractionSessionKey,
    dragOverlayBoxFlowIdentity,
    dragOverlaySelectionIdsDigest,
    isSelectedPhaseBoxVisible,
    isSelectedPhaseHandoffPaintConfirmed,
    isSelectedPhaseVisualReady,
    resolveReusableSelectionSessionIdentity,
    selectedIdsDigest,
    shouldKeepDragOverlayMountedForSelectedPhaseHandoff,
  ]);
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

    const overlayPhase =
      emission.payload.phase ||
      dragOverlayBoxFlowSessionRef.current?.phase ||
      null;
    const startupTiming = dragOverlayStartupTimingRef.current || {};
    const nowMs =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const startupDelaySinceReadyMs =
      startupTiming.sessionKey === emission.payload.dragOverlaySessionKey &&
      Number(startupTiming.controlledSyncReadyMs || 0) > 0
        ? roundDragOverlayDriftMetric(
            nowMs - Number(startupTiming.controlledSyncReadyMs || 0)
          )
        : null;
    const startupDelaySinceRenderCommitMs =
      startupTiming.sessionKey === emission.payload.dragOverlaySessionKey &&
      Number(startupTiming.renderCommittedMs || 0) > 0
        ? roundDragOverlayDriftMetric(
            nowMs - Number(startupTiming.renderCommittedMs || 0)
          )
        : null;
    const visibleHoverId =
      hoverIndicatorRef.current?.getVisibleHoverId?.() || null;
    const startupVisibleSource =
      emission.payload.overlaySource || visibilitySample?.source || null;
    const startupContractViolations = [];
    if (
      (overlayPhase === "predrag" || overlayPhase === "drag") &&
      startupVisibleSource !== "controlled-sync"
    ) {
      startupContractViolations.push("first-visible-source-not-controlled-sync");
    }
    if (visibleHoverId) {
      startupContractViolations.push("hover-visible-during-drag-overlay-startup");
    }
    if (isSelectedPhaseBoxVisible) {
      startupContractViolations.push("selected-phase-visible-during-drag-overlay-startup");
    }

    if (startupContractViolations.length > 0) {
      logCanvasBoxFlow("selection", "startup-contract:violation", {
        source: "stage-composer",
        phase: overlayPhase,
        owner: "drag-overlay",
        dragId: dragOverlayBoxFlowSessionRef.current?.dragId || null,
        selectedIds:
          emission.payload.selectedIds ||
          dragOverlaySelectionIdsDigest ||
          "",
        visualIds:
          emission.payload.dragOverlaySelectionIds ||
          emission.payload.selectedIds ||
          "",
        dragOverlaySessionKey: emission.payload.dragOverlaySessionKey || null,
        selectionAuthority: "drag-session",
        geometryAuthority:
          overlayPhase === "settling"
            ? "frozen-controlled-snapshot"
            : "live-nodes",
        overlayVisible: true,
        settling: overlayPhase === "settling",
        startupSource: startupVisibleSource,
        hoverId: visibleHoverId || null,
        selectedPhaseActuallyVisible: Boolean(isSelectedPhaseBoxVisible),
        selectedPhaseVisualReady: Boolean(isSelectedPhaseVisualReady),
        predragActive: Boolean(isPredragVisualSelectionActive),
        hoverSuppressionReasons:
          hoverSuppressionReasonsKey
            ? hoverSuppressionReasonsKey.split(",")
            : [],
        suppressedLayers: ["hover-indicator", "selected-phase"],
        reason: startupContractViolations.join(","),
      }, {
        identity: emission.payload.dragOverlaySessionKey || null,
        sessionIdentity: resolveReusableSelectionSessionIdentity(
          emission.payload.dragOverlaySessionKey || null
        ),
      });
    }

    logCanvasBoxFlow("selection", "drag-overlay:shown", {
      ...emission.payload,
      owner: "drag-overlay",
      dragId: dragOverlayBoxFlowSessionRef.current?.dragId || null,
      visualIds:
        emission.payload.dragOverlaySelectionIds ||
        emission.payload.selectedIds ||
        "",
      selectionAuthority: "drag-session",
      geometryAuthority:
        overlayPhase === "settling"
          ? "frozen-controlled-snapshot"
          : "live-nodes",
      visibilityAuthority:
        boxFlowSelectionSnapshotRef.current?.dragOverlayVisibilityAuthority || null,
      visibilityDriver:
        boxFlowSelectionSnapshotRef.current?.dragOverlayVisibilityDriver || null,
      overlayVisible: true,
      settling: overlayPhase === "settling",
      suppressedLayers: ["hover-indicator", "selected-phase"],
      startupSource: startupVisibleSource,
      hoverId: visibleHoverId || null,
      selectedPhaseActuallyVisible: Boolean(isSelectedPhaseBoxVisible),
      selectedPhaseVisualReady: Boolean(isSelectedPhaseVisualReady),
      startupContractSatisfied: startupContractViolations.length === 0,
      startupDelaySinceReadyMs,
      startupDelaySinceRenderCommitMs,
      startupVisibilityBoundaryTightened: true,
      reason:
        emission.payload.overlaySource === "controlled-sync"
          ? "first-visible-controlled-sync"
          : (emission.reason || "first-visible-frame"),
    }, {
      identity: emission.payload.dragOverlaySessionKey,
      sessionIdentity: resolveReusableSelectionSessionIdentity(
        emission.payload.dragOverlaySessionKey || null
      ),
    });
    return true;
  }, [
    dragOverlaySelectionIdsDigest,
    hoverSuppressionReasonsKey,
    isPredragVisualSelectionActive,
    isSelectedPhaseBoxVisible,
    isSelectedPhaseVisualReady,
    resolveReusableSelectionSessionIdentity,
    selectedIdsDigest,
  ]);

  const applyPendingStartupControlledDragOverlaySync = useCallback(({
    source = "stage-composer",
    schedulingBoundary = "layout-commit",
    deferredReason = "waiting-controlled-overlay-render-ready",
    indicatorApi = null,
    liveSelectionSnapshot = null,
    pos = null,
  } = {}) => {
    const pendingRequest = pendingStartupControlledSyncRequestRef.current;
    const activeSession = dragOverlayBoxFlowSessionRef.current;
    const activeIndicatorApi = resolveDragOverlayIndicatorApi(indicatorApi);
    const safeSelectedIds = sanitizeSelectionIds(
      pendingRequest?.selectedIds
    );
    const selectedIdsDigest = buildCanvasBoxFlowIdsDigest(safeSelectedIds);
    const sessionIdentity =
      resolveReusableSelectionSessionIdentity(
        activeSession?.sessionKey,
        resolveSelectionBoxFlowIdentity(
          pendingRequest?.dragId || null,
          safeSelectedIds
        )
      ) ||
      activeSession?.sessionKey ||
      resolveSelectionBoxFlowIdentity(
        pendingRequest?.dragId || null,
        safeSelectedIds
      );
    const isControlledOverlayRenderReady = Boolean(
      activeIndicatorApi?.applyControlledBounds &&
      (
        typeof activeIndicatorApi?.isControlledMountReady !== "function" ||
        activeIndicatorApi.isControlledMountReady() === true
      )
    );

    if (
      !pendingRequest?.sessionKey ||
      !activeSession?.sessionKey ||
      pendingRequest.sessionKey !== activeSession.sessionKey
    ) {
      pendingStartupControlledSyncRequestRef.current = null;
      return null;
    }

    if (activeSession.phase !== "drag") {
      logCanvasBoxFlow("selection", "startup-controlled-sync-blocked", {
        source,
        reason: "drag-session-not-active",
        pipeline: pendingRequest.pipeline || "individual",
        phase: activeSession?.phase || "predrag",
        owner: "drag-overlay",
        dragId: pendingRequest.dragId || activeSession.dragId || null,
        tipo: pendingRequest.tipo || null,
        selectedIds: selectedIdsDigest,
        visualIds: selectedIdsDigest,
        dragOverlaySessionKey: activeSession.sessionKey,
        selectionAuthority: "drag-session",
        geometryAuthority: "live-nodes",
        overlayVisible: Boolean(isDragSelectionOverlayVisualReady),
        overlayMounted: Boolean(activeIndicatorApi?.applyControlledBounds),
        settling: false,
        suppressedLayers: ["hover-indicator", "selected-phase"],
        schedulingBoundary,
      }, {
        identity: activeSession.sessionKey,
        sessionIdentity,
      });
      pendingStartupControlledSyncRequestRef.current = null;
      return null;
    }

    if (safeSelectedIds.length === 0) {
      logCanvasBoxFlow("selection", "startup-controlled-sync-blocked", {
        source,
        reason: "empty-selection",
        pipeline: pendingRequest.pipeline || "individual",
        phase: "drag",
        owner: "drag-overlay",
        dragId: pendingRequest.dragId || activeSession.dragId || null,
        tipo: pendingRequest.tipo || null,
        selectedIds: selectedIdsDigest,
        visualIds: selectedIdsDigest,
        dragOverlaySessionKey: activeSession.sessionKey,
        selectionAuthority: "drag-session",
        geometryAuthority: "live-nodes",
        overlayVisible: Boolean(isDragSelectionOverlayVisualReady),
        overlayMounted: Boolean(activeIndicatorApi?.applyControlledBounds),
        settling: false,
        suppressedLayers: ["hover-indicator", "selected-phase"],
        schedulingBoundary,
      }, {
        identity: activeSession.sessionKey,
        sessionIdentity,
      });
      pendingStartupControlledSyncRequestRef.current = null;
      return null;
    }

    if (!isControlledOverlayRenderReady) {
      return null;
    }

    // Startup authority must only be minted once the controlled overlay can
    // actually render it; otherwise a later replay ends up becoming first-visible.
    const resolvedLiveSelectionSnapshot =
      liveSelectionSnapshot?.bounds &&
      areSelectionIdListsEqual(liveSelectionSnapshot?.selectedIds, safeSelectedIds)
        ? liveSelectionSnapshot
        : resolveLiveDragSelectionSnapshot(safeSelectedIds);
    const liveBoundsDigest = buildCanvasBoxFlowBoundsDigest(
      resolvedLiveSelectionSnapshot?.bounds || null
    );

    if (!resolvedLiveSelectionSnapshot?.bounds || !liveBoundsDigest) {
      logCanvasBoxFlow("selection", "startup-controlled-sync-blocked", {
        source,
        reason: "missing-live-bounds",
        pipeline: pendingRequest.pipeline || "individual",
        phase: "drag",
        owner: "drag-overlay",
        dragId: pendingRequest.dragId || activeSession.dragId || null,
        tipo: pendingRequest.tipo || null,
        selectedIds: selectedIdsDigest,
        visualIds: selectedIdsDigest,
        dragOverlaySessionKey: activeSession.sessionKey,
        selectionAuthority: "drag-session",
        geometryAuthority: "live-nodes",
        overlayVisible: Boolean(isDragSelectionOverlayVisualReady),
        overlayMounted: Boolean(activeIndicatorApi?.applyControlledBounds),
        settling: false,
        suppressedLayers: ["hover-indicator", "selected-phase"],
        schedulingBoundary,
      }, {
        identity: activeSession.sessionKey,
        sessionIdentity,
      });
      pendingStartupControlledSyncRequestRef.current = null;
      return null;
    }

    const dragSample = noteDragOverlayDragSample({
      dragId: pendingRequest.dragId,
      selectedIds: safeSelectedIds,
      pos,
      source: `${pendingRequest.source || source}:startup-controlled-sync`,
      liveSelectionSnapshot: resolvedLiveSelectionSnapshot,
    });
    const readNowMs = () => (
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now()
    );
    const previousTiming = dragOverlayStartupTimingRef.current || {};
    dragOverlayStartupTimingRef.current = {
      sessionKey: activeSession.sessionKey,
      ownershipStartMs:
        previousTiming.sessionKey === activeSession.sessionKey
          ? Number(previousTiming.ownershipStartMs || 0)
          : 0,
      renderCommittedMs:
        previousTiming.sessionKey === activeSession.sessionKey
          ? Number(previousTiming.renderCommittedMs || 0)
          : 0,
      controlledSyncReadyMs: readNowMs(),
    };

    logCanvasBoxFlow("selection", "startup-controlled-sync-ready", {
      source: pendingRequest.source || source,
      reason: "drag-start-live-bounds-ready",
      pipeline: pendingRequest.pipeline || "individual",
      phase: "drag",
      owner: "drag-overlay",
      dragId: pendingRequest.dragId || activeSession.dragId || null,
      tipo: pendingRequest.tipo || null,
      selectedIds: selectedIdsDigest,
      visualIds: selectedIdsDigest,
      dragOverlaySessionKey: activeSession.sessionKey,
      selectionAuthority: "drag-session",
      geometryAuthority: "live-nodes",
      overlayVisible: Boolean(isDragSelectionOverlayVisualReady),
      overlayMounted: Boolean(activeIndicatorApi?.applyControlledBounds),
      settling: false,
      suppressedLayers: ["hover-indicator", "selected-phase"],
      syncToken: dragSample?.syncToken || null,
      bounds: liveBoundsDigest,
      schedulingBoundary,
      startupPath: schedulingBoundary,
      deferredReplayConsidered: false,
    }, {
      identity: activeSession.sessionKey,
      sessionIdentity,
    });

    const appliedSnapshot = syncControlledDragOverlayBounds(safeSelectedIds, {
      dragId: pendingRequest.dragId,
      source: "controlled-sync",
      syncToken: dragSample?.syncToken || null,
      liveSelectionSnapshot: resolvedLiveSelectionSnapshot,
      startupSchedulingBoundary: schedulingBoundary,
      startupApplyReason: deferredReason,
      indicatorApi: activeIndicatorApi,
    });
    if (appliedSnapshot?.applied) {
      pendingStartupControlledSyncRequestRef.current = null;
    } else {
      pendingStartupControlledSyncRequestRef.current = {
        ...pendingRequest,
        sessionKey: activeSession.sessionKey,
        dragId: pendingRequest.dragId || activeSession.dragId || null,
      };
    }
    return appliedSnapshot;
  }, [
    isDragSelectionOverlayVisualReady,
    noteDragOverlayDragSample,
    resolveLiveDragSelectionSnapshot,
    resolveDragOverlayIndicatorApi,
    resolveReusableSelectionSessionIdentity,
    resolveSelectionBoxFlowIdentity,
    syncControlledDragOverlayBounds,
  ]);

  useLayoutEffect(() => {
    if (!shouldRenderDragSelectionOverlay || !dragOverlayBoxFlowIdentity) {
      return;
    }
    const pendingRequest = pendingStartupControlledSyncRequestRef.current;
    if (
      !pendingRequest?.sessionKey ||
      pendingRequest.sessionKey !== dragOverlayBoxFlowIdentity
    ) {
      return;
    }
    const isControlledOverlayMountReady = Boolean(
      dragOverlayIndicatorRef.current?.isControlledMountReady?.()
    );
    if (!isControlledOverlayMountReady) {
      logCanvasBoxFlow("selection", "startup-controlled-sync-waiting-for-mount-ready", {
        source: "stage-composer",
        reason: "waiting-controlled-overlay-mount-ready",
        pipeline: pendingRequest.pipeline || "individual",
        phase: dragOverlayBoxFlowSessionRef.current?.phase || "drag",
        owner: "drag-overlay",
        dragId:
          pendingRequest.dragId ||
          dragOverlayBoxFlowSessionRef.current?.dragId ||
          null,
        tipo: pendingRequest.tipo || null,
        selectedIds: buildCanvasBoxFlowIdsDigest(pendingRequest.selectedIds),
        visualIds: buildCanvasBoxFlowIdsDigest(pendingRequest.selectedIds),
        dragOverlaySessionKey: dragOverlayBoxFlowIdentity,
        selectionAuthority: "drag-session",
        geometryAuthority: "live-nodes",
        overlayVisible: Boolean(isDragSelectionOverlayVisualReady),
        overlayMounted: Boolean(dragOverlayIndicatorRef.current?.applyControlledBounds),
        settling: false,
        suppressedLayers: ["hover-indicator", "selected-phase"],
        schedulingBoundary: "layout-commit",
        deferredReplayConsidered: false,
      }, {
        identity: dragOverlayBoxFlowIdentity,
        sessionIdentity:
          resolveReusableSelectionSessionIdentity(
            dragOverlayBoxFlowIdentity
          ) || dragOverlayBoxFlowIdentity,
      });
      return;
    }

    applyPendingStartupControlledDragOverlaySync({
      source: "stage-composer",
      schedulingBoundary: "layout-commit",
      deferredReason: "waiting-controlled-overlay-layout-commit",
    });
  }, [
    applyPendingStartupControlledDragOverlaySync,
    dragOverlayBoxFlowIdentity,
    isDragSelectionOverlayVisualReady,
    resolveReusableSelectionSessionIdentity,
    shouldRenderDragSelectionOverlay,
  ]);

  const replayStoredControlledDragOverlaySnapshot = useCallback(({
    source = "stage-composer",
    reason = "controlled-snapshot-replay",
    schedulingBoundary = "effect-replay",
    indicatorApi = null,
  } = {}) => {
    const activeSession = dragOverlayBoxFlowSessionRef.current;
    const activeSessionKey = activeSession?.sessionKey || null;
    const activeIndicatorApi = resolveDragOverlayIndicatorApi(indicatorApi);
    if (!activeSessionKey || !activeIndicatorApi?.applyControlledBounds) {
      return null;
    }

    const currentSnapshot = dragOverlayControlledBoundsRef.current;
    const pendingStartupVisibleSnapshot =
      getPendingDragOverlayStartupVisibleSnapshot(
        dragOverlayStartupGateRef.current,
        activeSessionKey
      );
    const snapshotToReplay =
      pendingStartupVisibleSnapshot?.bounds
        ? pendingStartupVisibleSnapshot
        : currentSnapshot;

    if (
      snapshotToReplay?.sessionKey !== activeSessionKey ||
      !snapshotToReplay?.bounds
    ) {
      return null;
    }

    const shouldReplayPendingStartupVisibleSnapshot = Boolean(
      pendingStartupVisibleSnapshot?.bounds
    );
    if (
      !shouldReplayPendingStartupVisibleSnapshot &&
      !canReplayDragOverlayStartupSnapshot(
        dragOverlayStartupGateRef.current,
        activeSessionKey,
        snapshotToReplay
      )
    ) {
      return null;
    }

    const currentAppliedDigest =
      activeIndicatorApi?.getAppliedBoundsDigest?.() || null;
    const storedDigest = buildCanvasBoxFlowBoundsDigest(snapshotToReplay.bounds);
    if (
      currentAppliedDigest &&
      storedDigest &&
      areCanvasBoxFlowBoundsDigestsEqual(currentAppliedDigest, storedDigest)
    ) {
      return snapshotToReplay;
    }

    const isPendingStartupVisibleReplay = Boolean(
      shouldReplayPendingStartupVisibleSnapshot &&
      snapshotToReplay.startupVisibleEligible &&
      snapshotToReplay.startupEligibilityReason === "startup-first-authoritative-sync"
    );
    if (isPendingStartupVisibleReplay) {
      const startupTiming = dragOverlayStartupTimingRef.current || {};
      const nowMs =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
      const startupDelaySinceReadyMs =
        startupTiming.sessionKey === activeSessionKey &&
        Number(startupTiming.controlledSyncReadyMs || 0) > 0
          ? roundDragOverlayDriftMetric(
              nowMs - Number(startupTiming.controlledSyncReadyMs || 0)
            )
          : null;
      const startupDelaySinceRenderCommitMs =
        startupTiming.sessionKey === activeSessionKey &&
        Number(startupTiming.renderCommittedMs || 0) > 0
          ? roundDragOverlayDriftMetric(
              nowMs - Number(startupTiming.renderCommittedMs || 0)
            )
          : null;
      logCanvasBoxFlow("selection", "startup-controlled-sync-render-eligible", {
        source,
        reason,
        phase: snapshotToReplay.phase || activeSession?.phase || "drag",
        owner: "drag-overlay",
        dragId: snapshotToReplay.dragId || activeSession?.dragId || null,
        selectedIds: buildCanvasBoxFlowIdsDigest(snapshotToReplay.selectedIds),
        visualIds: buildCanvasBoxFlowIdsDigest(snapshotToReplay.selectedIds),
        dragOverlaySessionKey: activeSessionKey,
        selectionAuthority: "drag-session",
        geometryAuthority: "live-nodes",
        overlayVisible: Boolean(isDragSelectionOverlayVisualReady),
        overlayMounted: true,
        settling: false,
        suppressedLayers: ["hover-indicator", "selected-phase"],
        syncToken: snapshotToReplay.syncToken || null,
        bounds: storedDigest,
        schedulingBoundary,
        startupDelaySinceReadyMs,
        startupDelaySinceRenderCommitMs,
      }, {
        identity: activeSessionKey,
        sessionIdentity: resolveReusableSelectionSessionIdentity(
          activeSessionKey
        ),
      });
    }

    const appliedSnapshot = activeIndicatorApi?.applyControlledBounds?.(
      snapshotToReplay.bounds,
      {
        source: snapshotToReplay.source || "controlled-replay",
        debugSource: "drag-overlay",
        selectedIds: snapshotToReplay.selectedIds || [],
        identity: activeSessionKey,
        lifecycleKey: activeSessionKey,
        dragId: snapshotToReplay.dragId || null,
        phase: snapshotToReplay.phase || null,
        syncToken: snapshotToReplay.syncToken || null,
      }
    );

    if (
      appliedSnapshot &&
      shouldReplayPendingStartupVisibleSnapshot &&
      snapshotToReplay.startupVisibleEligible
    ) {
      dragOverlayStartupGateRef.current = markDragOverlayStartupFrameVisible(
        dragOverlayStartupGateRef.current,
        activeSessionKey,
        snapshotToReplay
      );
    }

    return appliedSnapshot;
  }, [
    canReplayDragOverlayStartupSnapshot,
    getPendingDragOverlayStartupVisibleSnapshot,
    isDragSelectionOverlayVisualReady,
    markDragOverlayStartupFrameVisible,
    resolveDragOverlayIndicatorApi,
    resolveReusableSelectionSessionIdentity,
  ]);

  const handleDragOverlayControlledMountReady = useCallback((meta = {}) => {
    const appliedPendingStartupSync = applyPendingStartupControlledDragOverlaySync({
      source: meta.source || "drag-overlay",
      schedulingBoundary:
        meta.schedulingBoundary || "controlled-layout-ready",
      deferredReason: "waiting-controlled-overlay-layout-ready",
      indicatorApi: meta.indicatorApi || null,
    });
    if (appliedPendingStartupSync?.applied) {
      return true;
    }
    return Boolean(
      replayStoredControlledDragOverlaySnapshot({
        source: meta.source || "drag-overlay",
        reason: "controlled-overlay-layout-ready",
        schedulingBoundary:
          meta.schedulingBoundary || "controlled-layout-ready",
        indicatorApi: meta.indicatorApi || null,
      })
    );
  }, [
    applyPendingStartupControlledDragOverlaySync,
    replayStoredControlledDragOverlaySnapshot,
  ]);

  const scheduleStartupControlledDragOverlayReplay = useCallback(({
    source = "stage-composer",
    reason = "waiting-controlled-overlay-render-ready",
  } = {}) => {
    if (dragOverlayStartupReplayRafRef.current && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(dragOverlayStartupReplayRafRef.current);
    }
    const activeSession = dragOverlayBoxFlowSessionRef.current;
    const sessionKey = activeSession?.sessionKey || null;
    if (!sessionKey) {
      dragOverlayStartupReplayRafRef.current = 0;
      return false;
    }

    logCanvasBoxFlow("selection", "startup-controlled-sync-replay-scheduled", {
      source,
      reason,
      phase: activeSession.phase || "drag",
      owner: "drag-overlay",
      dragId: activeSession.dragId || null,
      selectedIds: activeSession.selectedIdsDigest || "",
      visualIds: activeSession.selectedIdsDigest || "",
      dragOverlaySessionKey: sessionKey,
      selectionAuthority: "drag-session",
      geometryAuthority: "live-nodes",
      overlayVisible: Boolean(isDragSelectionOverlayVisualReady),
      overlayMounted: Boolean(dragOverlayIndicatorRef.current?.applyControlledBounds),
      settling: false,
      suppressedLayers: ["hover-indicator", "selected-phase"],
      schedulingBoundary: "requestAnimationFrame",
    }, {
      identity: sessionKey,
      sessionIdentity: resolveReusableSelectionSessionIdentity(sessionKey),
    });

    const replay = () => {
      dragOverlayStartupReplayRafRef.current = 0;
      replayStoredControlledDragOverlaySnapshot({
        source,
        reason: "startup-controlled-sync-rAF-replay",
        schedulingBoundary: "requestAnimationFrame",
      });
    };

    if (typeof requestAnimationFrame === "function") {
      dragOverlayStartupReplayRafRef.current = requestAnimationFrame(replay);
      return true;
    }

    replay();
    return true;
  }, [
    isDragSelectionOverlayVisualReady,
    replayStoredControlledDragOverlaySnapshot,
    resolveReusableSelectionSessionIdentity,
  ]);
  scheduleStartupControlledDragOverlayReplayRef.current =
    scheduleStartupControlledDragOverlayReplay;

  useEffect(
    () => () => {
      if (
        dragOverlayStartupReplayRafRef.current &&
        typeof cancelAnimationFrame === "function"
      ) {
        cancelAnimationFrame(dragOverlayStartupReplayRafRef.current);
      }
      dragOverlayStartupReplayRafRef.current = 0;
      scheduleStartupControlledDragOverlayReplayRef.current = null;
      pendingStartupControlledSyncRequestRef.current = null;
    },
    []
  );

  useEffect(() => {
    if (shouldRenderDragSelectionOverlay) return;
    pendingStartupControlledSyncRequestRef.current = null;
    setIsDragSelectionOverlayVisualReady((current) => (current ? false : current));
  }, [shouldRenderDragSelectionOverlay]);
  useEffect(() => {
    if (!shouldRenderDragSelectionOverlay || !dragOverlayBoxFlowIdentity) {
      return;
    }

    const appliedSnapshot = replayStoredControlledDragOverlaySnapshot({
      source: "stage-composer",
      reason: "overlay-replay-effect",
      schedulingBoundary: "overlay-replay-effect",
    });
    if (appliedSnapshot) {
      return;
    }

    syncControlledDragOverlayBounds(
      dragOverlayRenderSelectionIds,
      {
        dragId: dragOverlayBoxFlowSessionRef.current?.dragId || null,
        source: "controlled-seed",
      }
    );
  }, [
    dragOverlayBoxFlowIdentity,
    dragOverlayRenderSelectionIds,
    dragOverlaySelectionIdsDigest,
    replayStoredControlledDragOverlaySnapshot,
    shouldRenderDragSelectionOverlay,
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
      source,
      emitter: "stage-composer",
      hoverId: nextHoverId,
      dragId: dragId || null,
      phase: source === "predrag-start-clear" ? "predrag" : "drag",
      owner: "hover-indicator",
      selectionAuthority: "hover-target",
      geometryAuthority: "live-hover",
      overlayVisible: false,
      settling: false,
      suppressedLayers: ["hover-indicator"],
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

  const recordSelectionDragMoveSummary = useCallback((dragId, tipo, pos, meta = {}) => {
    const safeSelectedIds = sanitizeSelectionIds(meta.selectedIds);
    const liveSelectionSnapshot = resolveLiveDragSelectionSnapshot(safeSelectedIds);
    const activeSession = dragOverlayBoxFlowSessionRef.current;
    const startupGateState = dragOverlayStartupGateRef.current;
    const startupVisibilityPending = Boolean(
      activeSession?.phase === "drag" &&
      activeSession?.sessionKey &&
      startupGateState?.sessionKey === activeSession.sessionKey &&
      startupGateState.firstVisibleFrameShown !== true
    );
    const sessionIdentity =
      resolveReusableSelectionSessionIdentity(
        resolveSelectionBoxFlowIdentity(dragId, safeSelectedIds)
      );
    if (safeSelectedIds.length > 1) {
      trackCanvasDragPerf("drag:overlay-sync", {
        elementId: dragId,
        tipo: tipo || null,
        source: meta.source || "stage-composer",
        selectedCount: safeSelectedIds.length,
        reusedLiveBounds: Boolean(liveSelectionSnapshot?.bounds),
      }, {
        throttleMs: 240,
        throttleKey: `drag:overlay-sync:${dragId || "unknown"}`,
      });
    }
    recordCanvasBoxFlowSummary("selection", "selection-drag-move", {
      source: meta.source || "stage-composer",
      dragId,
      tipo: tipo || null,
      pipeline: meta.pipeline || "individual",
      x: Number(pos?.x ?? null),
      y: Number(pos?.y ?? null),
    }, {
      identity: sessionIdentity,
      sessionIdentity,
      eventName: "drag:summary",
    });
    if (startupVisibilityPending) {
      const pendingRequest = pendingStartupControlledSyncRequestRef.current;
      const activeIndicatorApi = resolveDragOverlayIndicatorApi();
      const isControlledOverlayRenderReady = Boolean(
        activeIndicatorApi?.applyControlledBounds &&
        (
          typeof activeIndicatorApi?.isControlledMountReady !== "function" ||
          activeIndicatorApi.isControlledMountReady() === true
        )
      );

      // While startup visibility is unresolved, dragmove samples must feed the
      // queued startup path instead of minting a competing first-visible token.
      pendingStartupControlledSyncRequestRef.current = {
        ...pendingRequest,
        sessionKey: activeSession.sessionKey,
        dragId:
          dragId ||
          activeSession.dragId ||
          pendingRequest?.dragId ||
          null,
        tipo: tipo || pendingRequest?.tipo || null,
        selectedIds:
          safeSelectedIds.length > 0
            ? [...safeSelectedIds]
            : sanitizeSelectionIds(pendingRequest?.selectedIds),
        pipeline: meta.pipeline || pendingRequest?.pipeline || "individual",
        source: pendingRequest?.source || meta.source || "stage-composer",
      };

      if (isControlledOverlayRenderReady) {
        applyPendingStartupControlledDragOverlaySync({
          source: meta.source || "stage-composer",
          schedulingBoundary: "drag-move",
          deferredReason: "waiting-controlled-overlay-render-ready",
          indicatorApi: activeIndicatorApi,
          liveSelectionSnapshot,
          pos,
        });
      }
      return;
    }

    const dragSample = noteDragOverlayDragSample({
      dragId,
      selectedIds: safeSelectedIds,
      pos,
      source: meta.source || "stage-composer",
      liveSelectionSnapshot,
    });
    syncControlledDragOverlayBounds(safeSelectedIds, {
      dragId,
      source: "controlled-sync",
      syncToken: dragSample?.syncToken || null,
      liveSelectionSnapshot,
    });
  }, [
    applyPendingStartupControlledDragOverlaySync,
    noteDragOverlayDragSample,
    resolveDragOverlayIndicatorApi,
    resolveSelectionBoxFlowIdentity,
    resolveLiveDragSelectionSnapshot,
    resolveReusableSelectionSessionIdentity,
    syncControlledDragOverlayBounds,
    trackCanvasDragPerf,
  ]);

  const commitStartupDragOverlayRender = useCallback((commit, {
    dragId = null,
    tipo = null,
    selectedIds = [],
    pipeline = "individual",
    source = "drag-start",
    queueStartupControlledSync = false,
  } = {}) => {
    const readNowMs = () => (
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now()
    );
    const safeSelectedIds = sanitizeSelectionIds(selectedIds);
    const selectedIdsDigest = buildCanvasBoxFlowIdsDigest(safeSelectedIds);
    const usedFlushSync = typeof flushSync === "function";

    if (usedFlushSync) {
      flushSync(() => {
        commit();
        if (queueStartupControlledSync) {
          const activeSession = dragOverlayBoxFlowSessionRef.current;
          pendingStartupControlledSyncRequestRef.current = {
            sessionKey: activeSession?.sessionKey || null,
            dragId: dragId || activeSession?.dragId || null,
            tipo: tipo || null,
            selectedIds: [...safeSelectedIds],
            pipeline,
            source,
          };
        }
      });
    } else {
      if (queueStartupControlledSync) {
        pendingStartupControlledSyncRequestRef.current = {
          sessionKey: null,
          dragId,
          tipo: tipo || null,
          selectedIds: [...safeSelectedIds],
          pipeline,
          source,
        };
      }
      commit();
      if (queueStartupControlledSync) {
        const activeSession = dragOverlayBoxFlowSessionRef.current;
        pendingStartupControlledSyncRequestRef.current = {
          ...(pendingStartupControlledSyncRequestRef.current || {}),
          sessionKey: activeSession?.sessionKey || null,
          dragId: dragId || activeSession?.dragId || null,
        };
      }
    }

    const activeSession = dragOverlayBoxFlowSessionRef.current;
    const nowMs = readNowMs();
    if (activeSession?.sessionKey) {
      const previousTiming = dragOverlayStartupTimingRef.current || {};
      dragOverlayStartupTimingRef.current = {
        sessionKey: activeSession.sessionKey,
        ownershipStartMs:
          previousTiming.sessionKey === activeSession.sessionKey
            ? Number(previousTiming.ownershipStartMs || 0)
            : nowMs,
        renderCommittedMs: nowMs,
        controlledSyncReadyMs:
          previousTiming.sessionKey === activeSession.sessionKey
            ? Number(previousTiming.controlledSyncReadyMs || 0)
            : 0,
      };
    }

    const overlayIndicatorMounted = Boolean(
      dragOverlayIndicatorRef.current?.applyControlledBounds
    );
    logCanvasBoxFlow("selection", "startup-overlay-render-committed", {
      source,
      reason: usedFlushSync
        ? "flush-sync-drag-start-render-commit"
        : "drag-start-render-commit",
      pipeline,
      phase: activeSession?.phase || "drag",
      owner: "drag-overlay",
      dragId: dragId || activeSession?.dragId || null,
      tipo: tipo || null,
      selectedIds: selectedIdsDigest,
      visualIds: selectedIdsDigest,
      dragOverlaySessionKey: activeSession?.sessionKey || null,
      selectionAuthority: "drag-session",
      geometryAuthority: "startup-pending",
      overlayVisible: Boolean(
        boxFlowSelectionSnapshotRef.current?.showDragSelectionOverlay
      ),
      overlayMounted: overlayIndicatorMounted,
      settling: false,
      suppressedLayers: ["hover-indicator", "selected-phase"],
      schedulingBoundary: usedFlushSync ? "flushSync" : "direct-commit",
      visibilityAuthority:
        boxFlowSelectionSnapshotRef.current?.dragOverlayVisibilityAuthority || null,
      visibilityDriver:
        boxFlowSelectionSnapshotRef.current?.dragOverlayVisibilityDriver || null,
    }, {
      identity:
        activeSession?.sessionKey ||
        resolveSelectionBoxFlowIdentity(dragId, safeSelectedIds),
      sessionIdentity:
        resolveReusableSelectionSessionIdentity(
          activeSession?.sessionKey,
          resolveSelectionBoxFlowIdentity(dragId, safeSelectedIds)
        ) ||
        activeSession?.sessionKey ||
        resolveSelectionBoxFlowIdentity(dragId, safeSelectedIds),
    });

    return overlayIndicatorMounted;
  }, [
    resolveReusableSelectionSessionIdentity,
    resolveSelectionBoxFlowIdentity,
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
    const sessionIdentity =
      resolveReusableSelectionSessionIdentity(identity) || identity;

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
      sessionIdentity,
    });

    if (eventName === "drag:start") {
      const safeSelectedIds = sanitizeSelectionIds(selectedIds);
      const activeIndicatorApi = resolveDragOverlayIndicatorApi();
      const isControlledOverlayRenderReady = Boolean(
        activeIndicatorApi?.applyControlledBounds &&
        (
          typeof activeIndicatorApi?.isControlledMountReady !== "function" ||
          activeIndicatorApi.isControlledMountReady() === true
        )
      );

      if (isControlledOverlayRenderReady && safeSelectedIds.length > 0) {
        const liveSelectionSnapshot = resolveLiveDragSelectionSnapshot(
          safeSelectedIds
        );

        if (liveSelectionSnapshot?.bounds) {
          applyPendingStartupControlledDragOverlaySync({
            source,
            schedulingBoundary: "drag-start",
            deferredReason: "waiting-controlled-overlay-render-ready",
            indicatorApi: activeIndicatorApi,
            liveSelectionSnapshot,
            pos,
          });
        }
      }
    }
  }, [
    applyPendingStartupControlledDragOverlaySync,
    recordSelectionDragMoveSummary,
    resolveDragOverlayIndicatorApi,
    resolveLiveDragSelectionSnapshot,
    resolveSelectionBoxFlowIdentity,
    resolveReusableSelectionSessionIdentity,
  ]);

  useEffect(() => {
    const nextLogicalOwnerKind = shouldShowDragSelectionOverlay
      ? "drag-overlay"
      : stageSelectionVisualMode.singleSelectedLineId
        ? "line-controls"
        : shouldMountPrimarySelectionOverlay
          ? "transformer-primary"
          : "none";
    const nextOwnerKind = shouldRenderDragSelectionOverlay
      ? "drag-overlay"
      : nextLogicalOwnerKind;
    const nextSnapshot = {
      identity: selectionBoxFlowIdentity,
      ownerKind: nextOwnerKind,
      logicalOwnerKind: nextLogicalOwnerKind,
      dragInteractionSessionKey: dragInteractionSessionKey,
      dragInteractionEpoch: Number(
        dragInteractionSession.interactionEpoch || 0
      ),
      dragInteractionPhase: dragInteractionSession.phase || null,
      dragOverlayBoxFlowIdentity,
      dragOverlayInteractionEpoch: Number(
        dragOverlayBoxFlowSession.interactionEpoch || 0
      ),
      dragOverlayPhase: dragOverlayBoxFlowSession.phase || null,
      selectedIdsDigest,
      dragOverlaySelectionIdsDigest,
      mountPrimarySelectionOverlay: Boolean(
        shouldMountPrimarySelectionOverlay
      ),
      logicalShowDragSelectionOverlay: Boolean(shouldShowDragSelectionOverlay),
      showDragSelectionOverlay: Boolean(shouldRenderDragSelectionOverlay),
      dragOverlayVisibilityDriver:
        effectiveDragOverlayVisibilityDriver || null,
      dragOverlayVisibilityAuthority:
        effectiveDragOverlayVisibilityAuthority || null,
      dragOverlayVisualReady: Boolean(isDragSelectionOverlayVisualReady),
      selectedPhaseVisualReady: Boolean(isSelectedPhaseVisualReady),
      selectedPhaseActuallyVisible: Boolean(isSelectedPhaseBoxVisible),
      selectedPhaseHandoffPaintConfirmed: Boolean(
        isSelectedPhaseHandoffPaintConfirmed
      ),
      predragActive: Boolean(isPredragVisualSelectionActive),
      singleSelectedLineId: stageSelectionVisualMode.singleSelectedLineId || null,
      activeInlineEditingId: activeInlineEditingId || null,
      hasSectionDecorationEdit: Boolean(sectionDecorationEdit),
    };
    const previousSnapshot = boxFlowSelectionSnapshotRef.current;
    boxFlowSelectionSnapshotRef.current = nextSnapshot;
    const activeSelectionSession = getActiveCanvasBoxFlowSession("selection");
    const hasLockedDragInteractionSession = Boolean(
      activeSelectionSession?.authorityIdentity &&
      activeSelectionSession?.identity === activeSelectionSession?.authorityIdentity &&
      String(activeSelectionSession?.identity || "").startsWith("drag-session:")
    );
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
        owner: "drag-overlay",
        selectionAuthority: "drag-session",
        geometryAuthority:
          previousSnapshot?.dragOverlayPhase === "settling"
            ? "frozen-controlled-snapshot"
            : "live-nodes",
        dragOverlaySelectionIds: previousSnapshot?.dragOverlaySelectionIdsDigest || "",
        selectedIds: previousSnapshot?.selectedIdsDigest || "",
        visualIds: previousSnapshot?.dragOverlaySelectionIdsDigest || "",
        dragOverlaySessionKey: overlayHiddenIdentity,
        phase: previousSnapshot?.dragOverlayPhase || null,
        visibilityAuthority:
          previousSnapshot?.dragOverlayVisibilityAuthority || null,
        visibilityDriver:
          previousSnapshot?.dragOverlayVisibilityDriver || null,
        nextVisibilityDriver:
          nextSnapshot.dragOverlayVisibilityDriver || "none",
        overlayVisible: false,
        settling: previousSnapshot?.dragOverlayPhase === "settling",
        suppressedLayers: ["hover-indicator", "selected-phase"],
        handoffPaintConfirmed: Boolean(
          previousSnapshot?.selectedPhaseHandoffPaintConfirmed
        ),
        selectedPhaseActuallyVisible: Boolean(
          previousSnapshot?.selectedPhaseActuallyVisible
        ),
        waitedForPostPaintConfirmation: Boolean(
          previousSnapshot?.selectedPhaseHandoffPaintConfirmed
        ),
        selectedPhaseVisualReady: Boolean(nextSnapshot.selectedPhaseVisualReady),
        waitedForSelectedPhaseVisualReady: Boolean(
          nextSnapshot.selectedPhaseVisualReady
        ),
        reason:
          previousSnapshot?.dragOverlayPhase === "settling"
            ? "settling-complete"
            : "overlay-hidden",
        interactionEpoch:
          Number(previousSnapshot?.dragOverlayInteractionEpoch || 0) || null,
      }, {
        identity: overlayHiddenIdentity,
        sessionIdentity:
          resolveReusableSelectionSessionIdentity(
            previousSnapshot?.dragInteractionSessionKey,
            overlayHiddenIdentity
          ) ||
          overlayHiddenIdentity,
        flushSummaryKeys: ["selection-drag-move"],
        flushReason: "drag-overlay-hidden",
      });
      if (previousSnapshot?.dragOverlayPhase === "settling") {
        logCanvasBoxFlow("selection", "settling:end", {
          source: "stage-composer",
          reason: "overlay-hidden",
          phase: "settling",
          owner: "drag-overlay",
          dragId: dragOverlayBoxFlowSessionRef.current?.dragId || null,
          selectedIds: previousSnapshot?.selectedIdsDigest || "",
          visualIds: previousSnapshot?.dragOverlaySelectionIdsDigest || "",
          dragOverlaySessionKey: overlayHiddenIdentity,
          dragInteractionSessionKey:
            previousSnapshot?.dragInteractionSessionKey || null,
          selectionAuthority: "drag-session",
          geometryAuthority: "frozen-controlled-snapshot",
          overlayVisible: false,
          settling: false,
          suppressedLayers: ["hover-indicator", "selected-phase"],
          handoffPaintConfirmed: Boolean(
            previousSnapshot?.selectedPhaseHandoffPaintConfirmed
          ),
          waitedForPostPaintConfirmation: Boolean(
            previousSnapshot?.selectedPhaseHandoffPaintConfirmed
          ),
          selectedPhaseVisualReady: Boolean(nextSnapshot.selectedPhaseVisualReady),
          waitedForSelectedPhaseVisualReady: Boolean(
            nextSnapshot.selectedPhaseVisualReady
          ),
        }, {
          identity: overlayHiddenIdentity,
          sessionIdentity:
            resolveReusableSelectionSessionIdentity(
              previousSnapshot?.dragInteractionSessionKey,
              overlayHiddenIdentity
            ) ||
            overlayHiddenIdentity,
        });
      }
    }

    const selectedPhaseAllowedAgain = Boolean(
      previousSnapshot?.logicalShowDragSelectionOverlay &&
      !nextSnapshot.logicalShowDragSelectionOverlay &&
      nextSnapshot.logicalOwnerKind !== "none"
    );
    if (selectedPhaseAllowedAgain) {
      logCanvasBoxFlow("selection", "selected-phase:allowed", {
        source: "stage-composer",
        reason: nextSnapshot.showDragSelectionOverlay
          ? (
              nextSnapshot.selectedPhaseVisualReady &&
              !nextSnapshot.selectedPhaseHandoffPaintConfirmed
                ? "handoff-waiting-paint-confirmation"
                : "handoff-waiting-visual-ready"
            )
          : "drag-overlay-handoff-complete",
        phase: "selected",
        owner: "selected-phase",
        selectedIds: selectedIdsDigest,
        visualIds: selectedIdsDigest,
        dragInteractionSessionKey: dragInteractionSessionKey,
        selectionAuthority: "logical-selection",
        geometryAuthority: nextSnapshot.singleSelectedLineId
          ? "selected-auto-bounds"
          : "transformer-live",
        overlayVisible: nextSnapshot.showDragSelectionOverlay,
        settling: false,
        suppressedLayers: ["hover-indicator"],
        hideDeferred: nextSnapshot.showDragSelectionOverlay,
        handoffPaintConfirmed: Boolean(
          nextSnapshot.selectedPhaseHandoffPaintConfirmed
        ),
        waitedForPostPaintConfirmation: Boolean(
          nextSnapshot.selectedPhaseVisualReady &&
          !nextSnapshot.selectedPhaseHandoffPaintConfirmed
        ),
      }, {
        identity: selectionBoxFlowIdentity || selectedIdsDigest || overlayHiddenIdentity,
      });
    }

    if (!selectionBoxFlowIdentity) {
      if (hasLockedDragInteractionSession) {
        return;
      }
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
      dragInteractionSessionKey: dragInteractionSessionKey,
      dragInteractionPhase: nextSnapshot.dragInteractionPhase,
      dragInteractionEpoch:
        nextSnapshot.dragInteractionEpoch || null,
      dragOverlaySessionKey: dragOverlayBoxFlowIdentity,
      dragOverlayPhase: nextSnapshot.dragOverlayPhase,
      dragOverlayInteractionEpoch:
        nextSnapshot.dragOverlayInteractionEpoch || null,
    }, {
      allowIdentityRetarget: true,
      authorityIdentity: dragInteractionSessionKey || null,
    });

    const didVisualModeChange =
      !previousSnapshot ||
      previousSnapshot.identity !== nextSnapshot.identity ||
      previousSnapshot.ownerKind !== nextSnapshot.ownerKind;

    if (didVisualModeChange) {
      const visualOwner =
        nextSnapshot.ownerKind === "drag-overlay"
          ? "drag-overlay"
          : nextSnapshot.ownerKind === "none"
            ? "none"
            : "selected-phase";
      const visualPhase =
        nextSnapshot.showDragSelectionOverlay
          ? (
              nextSnapshot.dragOverlayPhase ||
              (nextSnapshot.predragActive ? "predrag" : null) ||
              nextSnapshot.dragInteractionPhase ||
              "drag"
            )
          : nextSnapshot.ownerKind === "none"
            ? (selectedIdsDigest ? "selected" : "idle")
            : "selected";
      logCanvasBoxFlow("selection", "visual-mode:changed", {
        source: "stage-composer",
        ownerKind: nextSnapshot.ownerKind,
        owner: visualOwner,
        phase: visualPhase,
        selectedIds: selectedIdsDigest,
        dragOverlaySelectionIds: dragOverlaySelectionIdsDigest,
        visualIds: nextSnapshot.showDragSelectionOverlay
          ? dragOverlaySelectionIdsDigest
          : selectedIdsDigest,
        dragInteractionSessionKey: dragInteractionSessionKey,
        dragInteractionPhase: nextSnapshot.dragInteractionPhase,
        dragInteractionEpoch:
          nextSnapshot.dragInteractionEpoch || null,
        dragOverlaySessionKey: dragOverlayBoxFlowIdentity,
        dragOverlayPhase: nextSnapshot.dragOverlayPhase,
        dragOverlayInteractionEpoch:
          nextSnapshot.dragOverlayInteractionEpoch || null,
        mountPrimarySelectionOverlay: nextSnapshot.mountPrimarySelectionOverlay,
        showDragSelectionOverlay: nextSnapshot.showDragSelectionOverlay,
        logicalShowDragSelectionOverlay:
          nextSnapshot.logicalShowDragSelectionOverlay,
        visibilityAuthority: nextSnapshot.dragOverlayVisibilityAuthority || null,
        visibilityDriver: nextSnapshot.dragOverlayVisibilityDriver || null,
        overlayVisible: nextSnapshot.showDragSelectionOverlay,
        settling: nextSnapshot.dragOverlayPhase === "settling",
        predragActive: nextSnapshot.predragActive,
        selectionAuthority:
          nextSnapshot.showDragSelectionOverlay ? "drag-session" : "logical-selection",
        geometryAuthority:
          nextSnapshot.showDragSelectionOverlay
            ? (
                nextSnapshot.dragOverlayPhase === "settling"
                  ? "frozen-controlled-snapshot"
                  : "live-nodes"
              )
            : (
                nextSnapshot.singleSelectedLineId
                  ? "selected-auto-bounds"
                  : (nextSnapshot.mountPrimarySelectionOverlay ? "transformer-live" : null)
              ),
        suppressedLayers:
          visualOwner === "drag-overlay"
            ? ["hover-indicator", "selected-phase"]
            : visualOwner === "none"
              ? []
              : ["hover-indicator", "drag-overlay"],
        reason:
          previousSnapshot?.ownerKind !== nextSnapshot.ownerKind
            ? "owner-changed"
            : "identity-changed",
        hideDeferred:
          nextSnapshot.showDragSelectionOverlay &&
          !nextSnapshot.logicalShowDragSelectionOverlay,
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
      const isOverlayHideReadyReset =
        overlayHiddenIdentity &&
        nextSnapshot.dragOverlayVisualReady === false;
      if (isOverlayHideReadyReset) {
        if (overlayHiddenIdentity) {
          clearDragOverlayBoxFlowSession((currentSession) => (
            currentSession?.sessionKey === overlayHiddenIdentity
          ));
        }
        return;
      }
      const readyStateIdentity = nextSnapshot.showDragSelectionOverlay
        ? nextSnapshot.dragOverlayBoxFlowIdentity ||
          nextSnapshot.identity
        : previousSnapshot?.dragOverlayBoxFlowIdentity ||
          previousSnapshot?.identity ||
          nextSnapshot.identity;
      logCanvasBoxFlow("selection", "drag-overlay:ready-state", {
        source: "stage-composer",
        isReady: nextSnapshot.dragOverlayVisualReady,
        owner: "drag-overlay",
        dragOverlaySelectionIds: dragOverlaySelectionIdsDigest,
        visualIds: dragOverlaySelectionIdsDigest,
        dragOverlaySessionKey: nextSnapshot.showDragSelectionOverlay
          ? dragOverlayBoxFlowIdentity
          : previousSnapshot?.dragOverlayBoxFlowIdentity || null,
        phase: nextSnapshot.showDragSelectionOverlay
          ? nextSnapshot.dragOverlayPhase
          : previousSnapshot?.dragOverlayPhase || null,
        selectionAuthority: "drag-session",
        geometryAuthority:
          (nextSnapshot.showDragSelectionOverlay
            ? nextSnapshot.dragOverlayPhase
            : previousSnapshot?.dragOverlayPhase) === "settling"
            ? "frozen-controlled-snapshot"
            : "live-nodes",
        visibilityAuthority:
          (nextSnapshot.showDragSelectionOverlay
            ? nextSnapshot.dragOverlayVisibilityAuthority
            : previousSnapshot?.dragOverlayVisibilityAuthority) || null,
        visibilityDriver:
          (nextSnapshot.showDragSelectionOverlay
            ? nextSnapshot.dragOverlayVisibilityDriver
            : previousSnapshot?.dragOverlayVisibilityDriver) || null,
        overlayVisible: nextSnapshot.showDragSelectionOverlay,
        settling:
          (nextSnapshot.showDragSelectionOverlay
            ? nextSnapshot.dragOverlayPhase
            : previousSnapshot?.dragOverlayPhase) === "settling",
        suppressedLayers: ["hover-indicator", "selected-phase"],
        interactionEpoch: nextSnapshot.showDragSelectionOverlay
          ? nextSnapshot.dragOverlayInteractionEpoch || null
          : Number(previousSnapshot?.dragOverlayInteractionEpoch || 0) || null,
      }, {
        identity: readyStateIdentity,
        sessionIdentity:
          resolveReusableSelectionSessionIdentity(
            nextSnapshot.dragInteractionSessionKey,
            previousSnapshot?.dragInteractionSessionKey,
            readyStateIdentity
          ) ||
          readyStateIdentity,
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
    dragInteractionSession.interactionEpoch,
    dragInteractionSession.phase,
    dragInteractionSessionKey,
    dragOverlayBoxFlowIdentity,
    dragOverlayBoxFlowSession.interactionEpoch,
    dragOverlayBoxFlowSession.phase,
    effectiveDragOverlayVisibilityAuthority,
    effectiveDragOverlayVisibilityDriver,
    dragOverlaySelectionIdsDigest,
    finalizeDragOverlayDrift,
    isDragSelectionOverlayVisualReady,
    isPredragVisualSelectionActive,
    isSelectedPhaseHandoffPaintConfirmed,
    isSelectedPhaseVisualReady,
    resetDragOverlayStartupGate,
    resetDragOverlayStartupState,
    sectionDecorationEdit,
    selectedIdsDigest,
    selectionBoxFlowIdentity,
    shouldRenderDragSelectionOverlay,
    shouldShowDragSelectionOverlay,
    stageSelectionVisualMode.dragOverlaySelectionIds,
    shouldMountPrimarySelectionOverlay,
    stageSelectionVisualMode.singleSelectedLineId,
  ]);

  const interactionPhaseSnapshotRef = useRef(null);
  const interactionPhase = shouldRenderDragSelectionOverlay
    ? (
        dragOverlayBoxFlowSession.phase ||
        (isPredragVisualSelectionActive ? "predrag" : null) ||
        dragInteractionSession.phase ||
        "drag"
      )
    : effectiveHoverId
      ? "hover"
      : selectedIdsDigest
        ? "selected"
        : "idle";
  const interactionVisualOwner = shouldRenderDragSelectionOverlay
    ? "drag-overlay"
    : effectiveHoverId
      ? "hover"
      : selectedIdsDigest
        ? "selected-phase"
        : "none";

  useEffect(() => {
    const nextSnapshot = {
      phase: interactionPhase,
      owner: interactionVisualOwner,
      dragOverlaySessionKey: dragOverlayBoxFlowIdentity || null,
      dragInteractionSessionKey: dragInteractionSessionKey || null,
      hoverId: effectiveHoverId || null,
      selectedIdsDigest,
    };
    const previousSnapshot = interactionPhaseSnapshotRef.current;
    interactionPhaseSnapshotRef.current = nextSnapshot;

    const didChange =
      !previousSnapshot ||
      previousSnapshot.phase !== nextSnapshot.phase ||
      previousSnapshot.owner !== nextSnapshot.owner ||
      previousSnapshot.dragOverlaySessionKey !== nextSnapshot.dragOverlaySessionKey ||
      previousSnapshot.dragInteractionSessionKey !== nextSnapshot.dragInteractionSessionKey ||
      previousSnapshot.hoverId !== nextSnapshot.hoverId ||
      previousSnapshot.selectedIdsDigest !== nextSnapshot.selectedIdsDigest;

    if (!didChange) {
      return;
    }

    const identity =
      dragOverlayBoxFlowIdentity ||
      selectionBoxFlowIdentity ||
      effectiveHoverId ||
      selectedIdsDigest ||
      "canvas:interaction-phase";
    const startupSource =
      dragOverlayControlledBoundsRef.current?.sessionKey === dragOverlayBoxFlowIdentity
        ? dragOverlayControlledBoundsRef.current?.source || null
        : null;

    logCanvasBoxFlow("selection", "phase:transition", {
      source: "stage-composer",
      phase: interactionPhase,
      previousPhase: previousSnapshot?.phase || null,
      owner: interactionVisualOwner,
      previousOwner: previousSnapshot?.owner || null,
      hoverId: effectiveHoverId || null,
      dragOverlaySessionKey: dragOverlayBoxFlowIdentity || null,
      dragInteractionSessionKey: dragInteractionSessionKey || null,
      selectedIds: selectedIdsDigest,
      visualIds:
        interactionVisualOwner === "drag-overlay"
          ? dragOverlaySelectionIdsDigest
          : selectedIdsDigest,
      selectionAuthority:
        interactionVisualOwner === "drag-overlay"
          ? "drag-session"
          : interactionVisualOwner === "hover"
            ? "hover-target"
            : selectedIdsDigest
              ? "logical-selection"
              : null,
      geometryAuthority:
        interactionVisualOwner === "drag-overlay"
          ? (
              interactionPhase === "settling"
                ? "frozen-controlled-snapshot"
                : interactionPhase === "predrag"
                  ? "startup-pending"
                  : "live-nodes"
            )
          : interactionVisualOwner === "hover"
            ? "live-hover"
            : stageSelectionVisualMode.singleSelectedLineId
              ? "selected-auto-bounds"
              : (shouldMountPrimarySelectionOverlay ? "transformer-live" : null),
      overlayVisible: interactionVisualOwner === "drag-overlay",
      settling: interactionPhase === "settling",
      predragActive: Boolean(isPredragVisualSelectionActive),
      startupSource,
      dragOverlayVisualReady: Boolean(isDragSelectionOverlayVisualReady),
      selectedPhaseActuallyVisible: Boolean(isSelectedPhaseBoxVisible),
      selectedPhaseVisualReady: Boolean(isSelectedPhaseVisualReady),
      hoverSuppressionReasons:
        hoverSuppressionReasonsKey
          ? hoverSuppressionReasonsKey.split(",")
          : [],
      suppressedLayers:
        interactionVisualOwner === "drag-overlay"
          ? ["hover-indicator", "selected-phase"]
          : interactionVisualOwner === "selected-phase"
            ? ["hover-indicator"]
            : [],
      reason:
        !previousSnapshot
          ? "initial-phase"
          : previousSnapshot.phase !== nextSnapshot.phase
            ? "phase-changed"
            : "owner-or-session-changed",
    }, {
      identity,
      sessionIdentity:
        resolveReusableSelectionSessionIdentity(
          dragInteractionSessionKey,
          dragOverlayBoxFlowIdentity,
          identity
        ) || identity,
    });
  }, [
    dragInteractionSessionKey,
    dragOverlayBoxFlowIdentity,
    dragOverlaySelectionIdsDigest,
    effectiveHoverId,
    hoverSuppressionReasonsKey,
    interactionPhase,
    interactionVisualOwner,
    isDragSelectionOverlayVisualReady,
    isPredragVisualSelectionActive,
    isSelectedPhaseBoxVisible,
    isSelectedPhaseVisualReady,
    resolveReusableSelectionSessionIdentity,
    selectedIdsDigest,
    selectionBoxFlowIdentity,
    shouldMountPrimarySelectionOverlay,
    stageSelectionVisualMode.singleSelectedLineId,
  ]);

  useEffect(() => {
    if (!dragInteractionSessionKey) {
      return;
    }

    const hasSettlingWork =
      Boolean(dragSettleSessionRef.current?.dragId) ||
      dragVisualSelectionIds.length > 0 ||
      isPredragVisualSelectionActive ||
      Boolean(dragOverlayBoxFlowSession.sessionKey) ||
      Boolean(shouldRenderDragSelectionOverlay) ||
      isAnyCanvasDragActive ||
      canvasInteractionActive ||
      canvasInteractionSettling;

    if (hasSettlingWork) {
      return;
    }

    const completedDragInteractionSessionKey = dragInteractionSessionKey;
    clearDragInteractionSession((currentSession) => (
      currentSession?.sessionKey === completedDragInteractionSessionKey
    ));

    const activeSelectionSession = getActiveCanvasBoxFlowSession("selection");
    if (activeSelectionSession?.identity === completedDragInteractionSessionKey) {
      endCanvasBoxFlowSession("selection", {
        reason: "drag-session-complete",
        selectedIds: selectedIdsDigest,
        dragOverlaySelectionIds: dragOverlaySelectionIdsDigest,
        dragInteractionSessionKey: completedDragInteractionSessionKey,
        dragInteractionPhase: dragInteractionSession.phase || null,
        dragInteractionEpoch:
          Number(dragInteractionSession.interactionEpoch || 0) || null,
      }, {
        summaryReason: "drag-session-complete",
      });
    }
  }, [
    canvasInteractionActive,
    canvasInteractionSettling,
    clearDragInteractionSession,
    dragInteractionSession.interactionEpoch,
    dragInteractionSession.phase,
    dragInteractionSessionKey,
    dragOverlayBoxFlowSession.sessionKey,
    dragOverlaySelectionIdsDigest,
    dragVisualSelectionIds.length,
    isAnyCanvasDragActive,
    isPredragVisualSelectionActive,
    selectedIdsDigest,
    shouldRenderDragSelectionOverlay,
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
    }, {
      allowIdentityRetarget: true,
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

  const buildGuideEvaluationRequest = useCallback((
    pos,
    elementId,
    meta = null,
    source = "drag-move"
  ) => {
    const pipeline = meta?.pipeline === "group" ? "group" : "individual";
    if (!elementId || pipeline !== "individual") {
      return null;
    }

    const targetObject = objectLookup.get(elementId) || null;
    const targetType = targetObject?.tipo || null;
    const isText = targetType === "texto";

    const activeOverlaySession = dragOverlayBoxFlowSessionRef.current;
    const activeInteractionSession = dragInteractionSessionRef.current;
    const sessionId =
      activeOverlaySession?.sessionKey ||
      activeInteractionSession?.sessionKey ||
      null;
    const interactionEpoch =
      Number(
        activeOverlaySession?.interactionEpoch ||
        activeInteractionSession?.interactionEpoch ||
        0
      ) || null;

    return {
      dragMode: "single-element",
      pipeline,
      source,
      sessionId,
      interactionEpoch,
      elementId,
      targetType,
      isText,
      pos: pos || null,
    };
  }, [objectLookup]);

  const flushScheduledGuideEvaluation = useCallback(() => {
    const current = guideDragFrameRef.current;
    const payload = current.payload;
    guideDragFrameRef.current = { rafId: 0, payload: null };
    if (!payload) return;

    const flushSample = sampleCanvasInteractionLog(
      `guides:raf-flush:${payload.sessionId || payload.elementId || "unknown"}`,
      {
        firstCount: 5,
        throttleMs: 120,
      }
    );
    if (flushSample.shouldLog) {
      logSelectedDragDebug("guides:raf-flush", {
        sampleCount: flushSample.sampleCount,
        guideSessionId: payload.sessionId || null,
        interactionEpoch: payload.interactionEpoch || null,
        elementId: payload.elementId,
        source: payload.source || "drag-move",
        pipeline: payload.pipeline || "individual",
        pos: payload.pos || null,
      });
    }

    trackCanvasDragPerf("guides:schedule-flush", {
      elementId: payload.elementId,
      pipeline: payload.pipeline || "individual",
      source: payload.source || "drag-move",
      x: Number(payload?.pos?.x ?? null),
      y: Number(payload?.pos?.y ?? null),
    }, {
      throttleMs: 80,
      throttleKey: `guides:schedule-flush:${payload.elementId}`,
    });

    const guideOutcome = mostrarGuias(
      payload,
      dragGuideObjectsRef.current,
      elementRefs
    );
    const activeOverlaySession = dragOverlayBoxFlowSessionRef.current;
    const currentOverlaySessionKey = activeOverlaySession?.sessionKey || null;
    const currentOverlayInteractionEpoch =
      Number(activeOverlaySession?.interactionEpoch || 0) || null;
    const sameGuideSession =
      Boolean(payload.sessionId) &&
      Boolean(currentOverlaySessionKey) &&
      currentOverlaySessionKey === payload.sessionId &&
      (
        payload.interactionEpoch == null ||
        currentOverlayInteractionEpoch == null ||
        currentOverlayInteractionEpoch === payload.interactionEpoch
      );
    const sameGuideDragIdentity =
      !payload.sessionId &&
      Boolean(activeOverlaySession?.dragId) &&
      activeOverlaySession.dragId === payload.elementId;
    const shouldResyncOverlayFromPostSnap = Boolean(
      guideOutcome?.snapCommitted &&
      guideOutcome?.snapMovedNode &&
      activeOverlaySession?.phase === "drag" &&
      (sameGuideSession || sameGuideDragIdentity)
    );

    if (!shouldResyncOverlayFromPostSnap) {
      return;
    }

    const overlaySelectionIds = readActiveDragOverlaySelectionIds(
      payload.elementId,
      runtimeSelectedIds.length > 0
        ? runtimeSelectedIds
        : sanitizeSelectionIds(elementosSeleccionados)
    );
    const preResyncOverlayGeometrySource =
      dragOverlayControlledBoundsRef.current?.geometrySource || null;
    const preResyncOverlayRect = resolveComposerBoundsRect(
      dragOverlayControlledBoundsRef.current?.bounds || null
    );
    const liveSelectionSnapshot = resolveLiveDragSelectionSnapshot(
      overlaySelectionIds
    );
    const postSnapLiveRect = resolveComposerBoundsRect(
      liveSelectionSnapshot?.bounds || null
    );
    const overlayPreResyncDelta = buildComposerRectDelta(
      preResyncOverlayRect,
      postSnapLiveRect
    );
    const overlayWouldDriftWithoutResync = Boolean(
      Math.abs(Number(overlayPreResyncDelta?.dx || 0)) > 0.01 ||
      Math.abs(Number(overlayPreResyncDelta?.dy || 0)) > 0.01 ||
      Math.abs(Number(overlayPreResyncDelta?.dCenterX || 0)) > 0.01 ||
      Math.abs(Number(overlayPreResyncDelta?.dCenterY || 0)) > 0.01
    );
    const resyncedOverlaySnapshot = syncControlledDragOverlayBounds(
      overlaySelectionIds,
      {
        dragId: payload.elementId,
        source: "guide-post-snap-sync",
        liveSelectionSnapshot,
      }
    );
    const resyncSample = sampleCanvasInteractionLog(
      `guides:post-snap-overlay-sync:${payload.sessionId || payload.elementId || "unknown"}`,
      {
        firstCount: 5,
        throttleMs: 120,
      }
    );
    if (resyncSample.shouldLog) {
      logSelectedDragDebug("guides:post-snap-overlay-sync", {
        sampleCount: resyncSample.sampleCount,
        guideSessionId: payload.sessionId || null,
        interactionEpoch: payload.interactionEpoch || null,
        elementId: payload.elementId,
        source: payload.source || "drag-move",
        phase: activeOverlaySession?.phase || null,
        selectedIds: overlaySelectionIds,
        snapXSource: guideOutcome?.snapXSource || "none",
        snapYSource: guideOutcome?.snapYSource || "none",
        snapMovedNode: guideOutcome?.snapMovedNode === true,
        preSnapGeometrySource: guideOutcome?.preSnapGeometrySource || null,
        postSnapGeometrySource: guideOutcome?.postSnapGeometrySource || null,
        rapidFlip: guideOutcome?.rapidFlip === true,
        rapidFlipCount: Number(guideOutcome?.rapidFlipCount || 0),
        thresholdOscillationLikely:
          guideOutcome?.thresholdOscillationLikely === true,
        overlayGeometrySourceBeforeResync: preResyncOverlayGeometrySource,
        overlayGeometrySourceAfterResync:
          resyncedOverlaySnapshot?.geometrySource || null,
        overlayWouldDriftWithoutResync,
        overlayPreResyncDelta,
        overlaySyncApplied: Boolean(resyncedOverlaySnapshot),
        perfNowMs: roundRotationMetric(getComposerVisualNowMs()),
      });
    }
  }, [
    elementRefs,
    elementosSeleccionados,
    mostrarGuias,
    readActiveDragOverlaySelectionIds,
    resolveLiveDragSelectionSnapshot,
    runtimeSelectedIds,
    syncControlledDragOverlayBounds,
  ]);

  const scheduleGuideEvaluation = useCallback((guideRequest) => {
    if (!guideRequest?.elementId) return;

    const current = guideDragFrameRef.current || { rafId: 0, payload: null };
    const nextFrame = {
      rafId: current.rafId || 0,
      payload: guideRequest,
    };

    guideDragFrameRef.current = nextFrame;

    const scheduleSample = sampleCanvasInteractionLog(
      `guides:schedule-request:${guideRequest.sessionId || guideRequest.elementId || "unknown"}`,
      {
        firstCount: 6,
        throttleMs: 120,
      }
    );
    if (scheduleSample.shouldLog) {
      logSelectedDragDebug("guides:schedule-request", {
        sampleCount: scheduleSample.sampleCount,
        guideSessionId: guideRequest.sessionId || null,
        interactionEpoch: guideRequest.interactionEpoch || null,
        elementId: guideRequest.elementId,
        source: guideRequest.source || "drag-move",
        pipeline: guideRequest.pipeline || "individual",
        pos: guideRequest.pos || null,
        hasPendingFrame: Boolean(current.rafId),
        replacedPendingPayload: Boolean(current.payload),
        previousPendingSource: current.payload?.source || null,
      });
    }

    trackCanvasDragPerf("guides:schedule", {
      elementId: guideRequest.elementId,
      pipeline: guideRequest.pipeline || "individual",
      source: guideRequest.source || "drag-move",
      targetType: guideRequest.targetType || null,
      isText: guideRequest.isText === true,
      hasPendingFrame: Boolean(current.rafId),
      x: Number(guideRequest?.pos?.x ?? null),
      y: Number(guideRequest?.pos?.y ?? null),
    }, {
      throttleMs: 80,
      throttleKey: `guides:schedule:${guideRequest.elementId}`,
    });

    const shouldFlushSynchronouslyForText = guideRequest.isText === true;
    if (shouldFlushSynchronouslyForText) {
      if (
        nextFrame.rafId &&
        typeof window !== "undefined" &&
        typeof window.cancelAnimationFrame === "function"
      ) {
        window.cancelAnimationFrame(nextFrame.rafId);
      }
      guideDragFrameRef.current = {
        rafId: 0,
        payload: guideRequest,
      };

      const syncFlushSample = sampleCanvasInteractionLog(
        `guides:text-sync-flush:${guideRequest.sessionId || guideRequest.elementId || "unknown"}`,
        {
          firstCount: 8,
          throttleMs: 120,
        }
      );
      if (syncFlushSample.shouldLog) {
        logSelectedDragDebug("guides:text-sync-flush", {
          sampleCount: syncFlushSample.sampleCount,
          perfNowMs: roundRotationMetric(getComposerVisualNowMs()),
          guideSessionId: guideRequest.sessionId || null,
          interactionEpoch: guideRequest.interactionEpoch || null,
          elementId: guideRequest.elementId,
          targetType: guideRequest.targetType || null,
          source: guideRequest.source || "drag-move",
          pipeline: guideRequest.pipeline || "individual",
          pos: guideRequest.pos || null,
          replacedPendingPayload: Boolean(current.payload),
          cancelledPendingRaf: Boolean(current.rafId),
          flushReason: "text-drag-single-geometry-chain",
        });
      }

      flushScheduledGuideEvaluation();
      return;
    }

    if (nextFrame.rafId) return;

    if (
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      flushScheduledGuideEvaluation();
      return;
    }

    nextFrame.rafId = window.requestAnimationFrame(() => {
      flushScheduledGuideEvaluation();
    });
    guideDragFrameRef.current = nextFrame;
  }, [flushScheduledGuideEvaluation]);

  const clearDragGuides = useCallback((options = {}) => {
    const reason = options?.reason || "drag-end";
    const dragId = options?.dragId || null;
    const tipo = options?.tipo || null;
    const source = options?.source || null;
    const pendingEvaluation = Boolean(guideDragFrameRef.current?.payload);
    const visibleGuideCount = guideOverlayRef?.current?.getGuideLinesCount?.() || 0;
    const pendingPayload = guideDragFrameRef.current?.payload || null;

    logSelectedDragDebug("guides:cleanup", {
      guideSessionId:
        pendingPayload?.sessionId ||
        dragOverlayBoxFlowSessionRef.current?.sessionKey ||
        dragInteractionSessionRef.current?.sessionKey ||
        null,
      interactionEpoch:
        pendingPayload?.interactionEpoch ||
        dragOverlayBoxFlowSessionRef.current?.interactionEpoch ||
        dragInteractionSessionRef.current?.interactionEpoch ||
        null,
      dragId,
      tipo,
      source,
      reason,
      pendingEvaluation,
      pendingElementId: pendingPayload?.elementId || null,
      pendingSource: pendingPayload?.source || null,
      visibleGuideCount,
    });

    trackCanvasDragPerf("guides:cleanup", {
      dragId,
      tipo,
      source,
      reason,
      pendingEvaluation,
      visibleGuideCount,
    }, {
      throttleMs: 80,
      throttleKey: `guides:cleanup:${dragId || "unknown"}`,
    });

    cancelScheduledGuideEvaluation();
    limpiarGuias?.();
  }, [cancelScheduledGuideEvaluation, guideOverlayRef, limpiarGuias]);

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
        visualIds: buildCanvasBoxFlowIdsDigest(nextSelection),
        dragOverlaySessionKey: nextDragOverlaySession.sessionKey || null,
        phase: "predrag",
        owner: "drag-overlay",
        selectionAuthority: "drag-session",
        geometryAuthority: startupPolicy.shouldSeedPredragBounds
          ? "startup-seed"
          : "startup-pending",
        overlayVisible: false,
        settling: false,
        suppressedLayers: ["hover-indicator", "selected-phase"],
        reason: "predrag-ownership-start",
        skipInitialSeed: startupPolicy.skipInitialSeed,
        startupPolicySource: startupPolicy.policySource,
        startupPolicyReason: startupPolicy.policyReason,
        predragIntent: meta?.predragIntent || null,
      }, {
        identity:
          nextDragOverlaySession.sessionKey ||
          resolveSelectionBoxFlowIdentity(dragId, nextSelection),
        sessionIdentity:
          resolveReusableSelectionSessionIdentity(
            resolveSelectionBoxFlowIdentity(dragId, nextSelection)
          ) ||
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
    const currentOverlaySession = dragOverlayBoxFlowSessionRef.current;
    const latestCleanupGuard =
      dragOverlayVisualCleanupGuardRef.current || {};
    const shouldBlockCleanupUntilHandoffComplete = Boolean(
      options?.reason === "cleanup-cleared-drag-visual-state" &&
      (
        latestCleanupGuard.isSelectedPhaseActuallyVisible !== true ||
        latestCleanupGuard.isSelectedPhaseVisualReady !== true ||
        latestCleanupGuard.isSelectedPhaseHandoffPaintConfirmed !== true
      )
    );
    const shouldBlockEarlyCleanupVisualHide = Boolean(
      (
        options?.reason === "post-drag-ui-refresh" &&
        latestCleanupGuard.shouldRenderDragSelectionOverlay === true
      ) ||
      shouldBlockCleanupUntilHandoffComplete ||
      (
        options?.reason === "cleanup-cleared-drag-visual-state" &&
        latestCleanupGuard.shouldRenderDragSelectionOverlay === true
      )
    );
    const visualHideDeniedBecause =
      latestCleanupGuard.isSelectedPhaseActuallyVisible !== true
        ? "selected-phase-not-visible"
        : latestCleanupGuard.isSelectedPhaseVisualReady !== true
          ? "selected-phase-not-ready"
          : latestCleanupGuard.isSelectedPhaseHandoffPaintConfirmed !== true
            ? "selected-phase-not-paint-confirmed"
            : "handoff-incomplete";
    const shouldDeferOverlayVisualCleanup = Boolean(
      shouldBlockEarlyCleanupVisualHide ||
      (
        currentOverlaySession?.phase === "settling" &&
        latestCleanupGuard.shouldKeepDragOverlayMountedForSelectedPhaseHandoff
      )
    );
    const shouldSkipOnMismatch = expectedSelection.length > 0;
    const hasSelectionMismatch =
      shouldSkipOnMismatch &&
      currentSelection.length > 0 &&
      !areSelectionIdListsEqual(currentSelection, expectedSelection);

    if (
      (currentSelection.length > 0 || isPredragVisualSelectionActive) &&
      (
        options?.reason === "post-drag-ui-refresh" ||
        shouldDeferOverlayVisualCleanup
      )
    ) {
      logCanvasBoxFlow("selection", "drag-overlay:cleanup-requested", {
        source: options?.source || "stage-composer",
        reason: options?.reason || null,
        phase:
          currentOverlaySession?.phase ||
          (isPredragVisualSelectionActive ? "predrag" : "selected"),
        owner: "drag-overlay",
        dragId: currentOverlaySession?.dragId || null,
        selectedIds: buildCanvasBoxFlowIdsDigest(currentSelection),
        visualIds: buildCanvasBoxFlowIdsDigest(currentSelection),
        dragOverlaySessionKey: currentOverlaySession?.sessionKey || null,
        selectionAuthority: "drag-session",
        geometryAuthority:
          currentOverlaySession?.phase === "settling"
            ? "frozen-controlled-snapshot"
            : "startup-pending",
        overlayVisible: Boolean(latestCleanupGuard.shouldRenderDragSelectionOverlay),
        overlayMounted: Boolean(latestCleanupGuard.shouldRenderDragSelectionOverlay),
        settling: currentOverlaySession?.phase === "settling",
        suppressedLayers: ["hover-indicator", "selected-phase"],
        cleanupDeferred: shouldDeferOverlayVisualCleanup,
        cleanupBlocked: shouldBlockEarlyCleanupVisualHide,
        visualHideDeniedBecause: shouldBlockEarlyCleanupVisualHide
          ? visualHideDeniedBecause
          : null,
        selectedPhaseActuallyVisible: Boolean(
          latestCleanupGuard.isSelectedPhaseActuallyVisible
        ),
        selectedPhaseVisualReady: Boolean(
          latestCleanupGuard.isSelectedPhaseVisualReady
        ),
        handoffPaintConfirmed: Boolean(
          latestCleanupGuard.isSelectedPhaseHandoffPaintConfirmed
        ),
        waitedForPostPaintConfirmation: Boolean(
          latestCleanupGuard.isSelectedPhaseVisualReady &&
          !latestCleanupGuard.isSelectedPhaseHandoffPaintConfirmed
        ),
      }, {
        identity:
          currentOverlaySession?.sessionKey ||
          resolveSelectionBoxFlowIdentity(null, currentSelection),
      });
    }

    if (hasSelectionMismatch) {
      logCanvasBoxFlow("selection", "predrag:visual-selection-clear-skipped", {
        source: options?.source || "stage-composer",
        reason: options?.reason || "selection-mismatch",
        phase: "settling",
        owner: "drag-overlay",
        selectedIds: buildCanvasBoxFlowIdsDigest(currentSelection),
        visualIds: buildCanvasBoxFlowIdsDigest(currentSelection),
        selectionAuthority: "drag-session",
        geometryAuthority: "frozen-controlled-snapshot",
        overlayVisible: true,
        settling: true,
        suppressedLayers: ["hover-indicator", "selected-phase"],
        expectedSelectionIds: buildCanvasBoxFlowIdsDigest(expectedSelection),
      }, {
        identity: resolveSelectionBoxFlowIdentity(null, currentSelection),
      });
      return false;
    }

    if (shouldDeferOverlayVisualCleanup) {
      deferredOverlayVisualCleanupRef.current = {
        source: options?.source || "stage-composer",
        reason: options?.reason || "handoff-guard-active",
        sessionKey: currentOverlaySession?.sessionKey || null,
        dragId: currentOverlaySession?.dragId || null,
        selectedIdsDigest: buildCanvasBoxFlowIdsDigest(currentSelection),
      };
      setHasDeferredOverlayVisualCleanup((current) => (current ? current : true));

      if (shouldBlockEarlyCleanupVisualHide) {
        logCanvasBoxFlow("selection", "drag-overlay:cleanup-blocked", {
          source: options?.source || "stage-composer",
          reason: options?.reason || "handoff-guard-active",
          phase: currentOverlaySession?.phase || "settling",
          owner: "drag-overlay",
          dragId: currentOverlaySession?.dragId || null,
          selectedIds: buildCanvasBoxFlowIdsDigest(currentSelection),
          visualIds: buildCanvasBoxFlowIdsDigest(currentSelection),
          dragOverlaySessionKey: currentOverlaySession?.sessionKey || null,
          selectionAuthority: "drag-session",
          geometryAuthority:
            currentOverlaySession?.phase === "settling"
              ? "frozen-controlled-snapshot"
              : "startup-pending",
          overlayVisible: Boolean(latestCleanupGuard.shouldRenderDragSelectionOverlay),
          overlayMounted: Boolean(latestCleanupGuard.shouldRenderDragSelectionOverlay),
          settling: currentOverlaySession?.phase === "settling",
          suppressedLayers: ["hover-indicator", "selected-phase"],
          cleanupDeferred: true,
          cleanupBlocked: true,
          visualHideDeniedBecause,
          selectedPhaseActuallyVisible: Boolean(
            latestCleanupGuard.isSelectedPhaseActuallyVisible
          ),
          selectedPhaseVisualReady: Boolean(
            latestCleanupGuard.isSelectedPhaseVisualReady
          ),
          handoffPaintConfirmed: Boolean(
            latestCleanupGuard.isSelectedPhaseHandoffPaintConfirmed
          ),
          waitedForPostPaintConfirmation: Boolean(
            latestCleanupGuard.isSelectedPhaseVisualReady &&
            !latestCleanupGuard.isSelectedPhaseHandoffPaintConfirmed
          ),
        }, {
          identity:
            currentOverlaySession?.sessionKey ||
            resolveSelectionBoxFlowIdentity(null, currentSelection),
        });
      }

      if (
        currentSelection.length > 0 ||
        isPredragVisualSelectionActive
      ) {
        logCanvasBoxFlow("selection", "drag-overlay:cleanup-deferred", {
          source: options?.source || "stage-composer",
          reason: options?.reason || "handoff-guard-active",
          phase: currentOverlaySession?.phase || "settling",
          owner: "drag-overlay",
          dragId: currentOverlaySession?.dragId || null,
          selectedIds: buildCanvasBoxFlowIdsDigest(currentSelection),
          visualIds: buildCanvasBoxFlowIdsDigest(currentSelection),
          dragOverlaySessionKey: currentOverlaySession?.sessionKey || null,
          selectionAuthority: "drag-session",
          geometryAuthority:
            currentOverlaySession?.phase === "settling"
              ? "frozen-controlled-snapshot"
              : "startup-pending",
          overlayVisible: Boolean(latestCleanupGuard.shouldRenderDragSelectionOverlay),
          overlayMounted: Boolean(latestCleanupGuard.shouldRenderDragSelectionOverlay),
          settling: currentOverlaySession?.phase === "settling",
          suppressedLayers: ["hover-indicator", "selected-phase"],
          cleanupDeferred: true,
          cleanupBlocked: shouldBlockEarlyCleanupVisualHide,
          visualHideDeniedBecause: shouldBlockEarlyCleanupVisualHide
            ? visualHideDeniedBecause
            : null,
          selectedPhaseActuallyVisible: Boolean(
            latestCleanupGuard.isSelectedPhaseActuallyVisible
          ),
          selectedPhaseVisualReady: Boolean(
            latestCleanupGuard.isSelectedPhaseVisualReady
          ),
          handoffPaintConfirmed: Boolean(
            latestCleanupGuard.isSelectedPhaseHandoffPaintConfirmed
          ),
          waitedForPostPaintConfirmation: Boolean(
            latestCleanupGuard.isSelectedPhaseVisualReady &&
            !latestCleanupGuard.isSelectedPhaseHandoffPaintConfirmed
          ),
        }, {
          identity:
            currentOverlaySession?.sessionKey ||
            resolveSelectionBoxFlowIdentity(null, currentSelection),
        });
      }

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
          source: "drag-visual-selection:clear-deferred",
        }
      );
      setDragVisualSelectionIds((current) => (
        Array.isArray(current) && current.length === 0 ? current : []
      ));
      return true;
    }

    if (
      currentSelection.length > 0 ||
      isPredragVisualSelectionActive
    ) {
      logCanvasBoxFlow("selection", "predrag:visual-selection-clear", {
        source: options?.source || "stage-composer",
        selectedIds: buildCanvasBoxFlowIdsDigest(currentSelection),
        visualIds: buildCanvasBoxFlowIdsDigest(currentSelection),
        predragActive: Boolean(isPredragVisualSelectionActive),
        phase:
          options?.reason === "post-drag-ui-refresh"
            ? "settling"
            : (isPredragVisualSelectionActive ? "predrag" : "selected"),
        owner: "drag-overlay",
        selectionAuthority: "drag-session",
        geometryAuthority:
          options?.reason === "post-drag-ui-refresh"
            ? "frozen-controlled-snapshot"
            : "startup-pending",
        overlayVisible: false,
        settling: options?.reason === "post-drag-ui-refresh",
        suppressedLayers: ["hover-indicator", "selected-phase"],
        reason: options?.reason || null,
      }, {
        identity: resolveSelectionBoxFlowIdentity(null, currentSelection),
        flushSummaryKeys: ["selection-drag-move"],
        flushReason: options?.reason || "predrag-visual-selection-clear",
      });
    }
    deferredOverlayVisualCleanupRef.current = null;
    setHasDeferredOverlayVisualCleanup((current) => (current ? false : current));
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

    outcome.hasWork = Boolean(
      outcome.committedDeferredSelection ||
      outcome.restoredSelectionAfterDrag ||
      outcome.deferredVisualSelectionCleanup ||
      (
        safeSession.hadVisualSelection &&
        outcome.visualSelectionSnapshot.length > 0 &&
        !outcome.visualSelectionMatchesSession
      )
    );

    dragSettleSessionRef.current = createEmptyDragSettleSession();
    return outcome;
  }, [
    getPostDragSelectionSnapshots,
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
    const latestCleanupGuard =
      dragOverlayVisualCleanupGuardRef.current || {};

    if (
      latestCleanupGuard.shouldRenderDragSelectionOverlay === true ||
      latestCleanupGuard.isSelectedPhaseActuallyVisible !== true ||
      latestCleanupGuard.isSelectedPhaseVisualReady !== true ||
      latestCleanupGuard.isSelectedPhaseHandoffPaintConfirmed !== true
    ) {
      clearDragVisualSelection({
        source: "idle-handoff",
        reason: "cleanup-cleared-drag-visual-state",
      });
      return;
    }

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
      phase: "selected",
      owner: "drag-overlay",
      visualSelectionSnapshot: buildCanvasBoxFlowIdsDigest(dragVisualSelectionIds),
      selectedIdsFromState: buildCanvasBoxFlowIdsDigest(selectionFromState),
      selectedIdsFromWindow: buildCanvasBoxFlowIdsDigest(selectionFromWindow),
      selectionAuthority: "drag-session",
      geometryAuthority: "frozen-controlled-snapshot",
      overlayVisible: false,
      settling: false,
      suppressedLayers: ["hover-indicator", "selected-phase"],
      reason: "cleanup-cleared-drag-visual-state",
      sameAsState: areSelectionIdListsEqual(dragVisualSelectionIds, selectionFromState),
      sameAsWindow: areSelectionIdListsEqual(dragVisualSelectionIds, selectionFromWindow),
    }, {
      identity: resolveSelectionBoxFlowIdentity(null, dragVisualSelectionIds),
      flushSummaryKeys: ["selection-drag-move"],
      flushReason: "idle-handoff",
    });

    clearDragVisualSelection({
      source: "idle-handoff",
      reason: "cleanup-cleared-drag-visual-state",
    });
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
          onDragMovePersonalizado={(pos, id, meta = null) => {
            window._isDragging = true;
            const guideRequest = buildGuideEvaluationRequest(
              pos,
              id,
              meta,
              "gallery-drag-move"
            );
            if (guideRequest) {
              scheduleGuideEvaluation(guideRequest);
            } else {
              cancelScheduledGuideEvaluation();
            }
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
          onDragStartPersonalizado={(dragId = obj.id, _event = null, meta = null) => {
            clearInlineIntent("drag-start", { dragId, tipo: "galeria" });
            const overlaySelectionSnapshot = resolveDragVisualSelectionIds(
              dragId,
              runtimeSelectedIds.length > 0
                ? runtimeSelectedIds
                : elementosSeleccionados
            );
            const interactionEpoch = beginCanvasDragGesture(dragId, "galeria");
            commitStartupDragOverlayRender(() => {
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
            }, {
              dragId,
              tipo: "galeria",
              selectedIds: overlaySelectionSnapshot,
              pipeline: "individual",
              source: "gallery-drag-start",
              queueStartupControlledSync: true,
            });
            cancelScheduledGuideEvaluation();
            const guideRequest = buildGuideEvaluationRequest(
              null,
              dragId,
              meta,
              "gallery-drag-start"
            );
            if (guideRequest) {
              prepararGuias?.(guideRequest, objetos, elementRefs);
            }
            logSelectionDragLifecycle("drag:start", {
              dragId,
              tipo: "galeria",
              selectedIds: overlaySelectionSnapshot,
              pipeline: "individual",
              source: "gallery-drag-start",
            });
          }}
          onDragEndPersonalizado={(dragId = obj.id, meta = null) => {
            clearDragGuides({
              dragId,
              tipo: "galeria",
              source: "gallery-drag-end",
              reason: "drag-end",
            });
            const overlaySelectionSnapshot = readActiveDragOverlaySelectionIds(
              dragId,
              runtimeSelectedIds.length > 0
                ? runtimeSelectedIds
                : sanitizeSelectionIds(elementosSeleccionados)
            );
            logSelectionDragLifecycle("drag:end", {
              dragId,
              tipo: "galeria",
              selectedIds: overlaySelectionSnapshot,
              pipeline: meta?.pipeline === "group" ? "group" : "individual",
              source: "gallery-drag-end",
            });
            updateDragOverlayBoxFlowSessionPhase("settling", {
              dragId,
              interactionEpoch: dragOverlayBoxFlowSessionRef.current?.interactionEpoch || 0,
              source: "gallery-drag-end",
              reason: "drag-end",
              pipeline: meta?.pipeline === "group" ? "group" : "individual",
            });
            queuePostDragUiRefresh(dragId, "galeria", "gallery-drag-end");
            endCanvasInteraction("drag", {
              dragId,
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
          onDragStartPersonalizado={(dragId = obj.id, _event = null, meta = null) => {
            const isGroupPipeline = meta?.pipeline === "group";
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
              pipeline: isGroupPipeline ? "group" : "individual",
            });
            clearInlineIntent("drag-start", { dragId, tipo: "countdown" });
            const interactionEpoch = beginCanvasDragGesture(dragId, "countdown");
            if (isGroupPipeline) {
              commitStartupDragOverlayRender(() => {
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
              }, {
                dragId,
                tipo: "countdown",
                selectedIds: overlaySelectionSnapshot,
                pipeline: "group",
                source: "countdown-group-drag-start",
                queueStartupControlledSync: true,
              });
            } else {
              commitStartupDragOverlayRender(() => {
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
              }, {
                dragId,
                tipo: "countdown",
                selectedIds: overlaySelectionSnapshot,
                pipeline: "individual",
                source: "countdown-drag-start",
                queueStartupControlledSync: true,
              });
            }
            cancelScheduledGuideEvaluation();
            setElementosPreSeleccionados((current) => (
              Array.isArray(current) && current.length === 0 ? current : []
            ));
            const guideRequest = buildGuideEvaluationRequest(
              null,
              dragId,
              meta,
              isGroupPipeline ? "countdown-group-drag-start" : "countdown-drag-start"
            );
            if (guideRequest) {
              prepararGuias?.(guideRequest, objetos, elementRefs);
            }
            logSelectionDragLifecycle("drag:start", {
              dragId,
              tipo: "countdown",
              selectedIds: overlaySelectionSnapshot,
              pipeline: isGroupPipeline ? "group" : "individual",
              source: isGroupPipeline ? "countdown-group-drag-start" : "countdown-drag-start",
            });
          }}
          onDragMovePersonalizado={(pos, id, meta = null) => {
            const isGroupPipeline = meta?.pipeline === "group";
            publishCountdownRuntimeDebug("composer:countdown-dragmove-callback", {
              dragId: id,
              x: Number(pos?.x ?? null),
              y: Number(pos?.y ?? null),
              pipeline: isGroupPipeline ? "group" : "individual",
            });
            const guideRequest = buildGuideEvaluationRequest(
              pos,
              id,
              meta,
              isGroupPipeline ? "countdown-group-drag-move" : "countdown-drag-move"
            );
            if (guideRequest) {
              scheduleGuideEvaluation(guideRequest);
            } else {
              cancelScheduledGuideEvaluation();
            }
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
              pipeline: isGroupPipeline ? "group" : "individual",
              source: isGroupPipeline ? "countdown-group-drag-move" : "countdown-drag-move",
            });
          }}
          onDragEndPersonalizado={(dragId = obj.id, meta = null) => {
            const isGroupPipeline = meta?.pipeline === "group";
            const overlaySelectionSnapshot = readActiveDragOverlaySelectionIds(
              dragId,
              runtimeSelectedIds.length > 0
                ? runtimeSelectedIds
                : sanitizeSelectionIds(elementosSeleccionados)
            );
            publishCountdownRuntimeDebug("composer:countdown-dragend-callback", {
              dragId,
              selectedIds: overlaySelectionSnapshot,
              pipeline: isGroupPipeline ? "group" : "individual",
            });
            clearDragGuides({
              dragId,
              tipo: "countdown",
              source: isGroupPipeline ? "countdown-group-drag-end" : "countdown-drag-end",
              reason: "drag-end",
            });
            logSelectionDragLifecycle("drag:end", {
              dragId,
              tipo: "countdown",
              selectedIds: overlaySelectionSnapshot,
              pipeline: isGroupPipeline ? "group" : "individual",
              source: isGroupPipeline ? "countdown-group-drag-end" : "countdown-drag-end",
            });
            updateDragOverlayBoxFlowSessionPhase("settling", {
              dragId,
              interactionEpoch: dragOverlayBoxFlowSessionRef.current?.interactionEpoch || 0,
              source: isGroupPipeline ? "countdown-group-drag-end" : "countdown-drag-end",
              reason: "drag-end",
              pipeline: isGroupPipeline ? "group" : "individual",
            });
            queuePostDragUiRefresh(
              dragId,
              "countdown",
              isGroupPipeline ? "countdown-group-drag-end" : "countdown-drag-end"
            );
            endCanvasInteraction("drag", {
              dragId,
              tipo: "countdown",
              source: isGroupPipeline ? "countdown-group-drag-end" : "countdown-drag-end",
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
          const currentSelectionSnapshot = runtimeSelectedIds.length > 0
            ? runtimeSelectedIds
            : elementosSeleccionados;
          const overlaySelectionSnapshot = resolveDragVisualSelectionIds(
            dragId,
            currentSelectionSnapshot
          );

          if (isGroupPipeline) {
            commitStartupDragOverlayRender(() => {
              startDragSettleSession(
                dragId,
                currentSelectionSnapshot,
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
              beginDragVisualSelection(dragId, currentSelectionSnapshot);
            }, {
              dragId,
              tipo: obj.tipo || null,
              selectedIds: overlaySelectionSnapshot,
              pipeline: "group",
              source: "group-drag-start",
              queueStartupControlledSync: true,
            });
            logCanvasBoxFlow("selection", "group-drag:settle-flow-joined", {
              source: "group-drag-start",
              reason: "group-pipeline-shared-settle-flow",
              pipeline: "group",
              phase: "drag",
              owner: "drag-overlay",
              dragId,
              selectedIds: buildCanvasBoxFlowIdsDigest(currentSelectionSnapshot),
              visualIds: buildCanvasBoxFlowIdsDigest(overlaySelectionSnapshot),
              dragOverlaySessionKey:
                dragOverlayBoxFlowSessionRef.current?.sessionKey || null,
              dragInteractionSessionKey:
                dragInteractionSessionRef.current?.sessionKey || null,
              selectionAuthority: "drag-session",
              geometryAuthority: "live-nodes",
              overlayVisible: true,
              settling: false,
              suppressedLayers: ["hover-indicator", "selected-phase"],
            }, {
              identity:
                dragOverlayBoxFlowSessionRef.current?.sessionKey ||
                resolveSelectionBoxFlowIdentity(dragId, overlaySelectionSnapshot),
              sessionIdentity:
                resolveReusableSelectionSessionIdentity(
                  dragInteractionSessionRef.current?.sessionKey,
                  dragOverlayBoxFlowSessionRef.current?.sessionKey,
                  resolveSelectionBoxFlowIdentity(dragId, overlaySelectionSnapshot)
                ) ||
                  resolveSelectionBoxFlowIdentity(dragId, overlaySelectionSnapshot),
            });
            logSelectionDragLifecycle("drag:start", {
              dragId,
              tipo: obj.tipo || null,
              selectedIds: overlaySelectionSnapshot,
              pipeline: "group",
              source: "group-drag-start",
            });
            return;
          }

          const seleccionActual = currentSelectionSnapshot;
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
          commitStartupDragOverlayRender(() => {
            activateDragOverlayBoxFlowSession({
              dragId,
              selectedIds: overlaySelectionSnapshot,
              interactionEpoch,
              phase: "drag",
            });
            beginDragVisualSelection(dragId, seleccionActual);
          }, {
            dragId,
            tipo: obj.tipo || null,
            selectedIds: overlaySelectionSnapshot,
            pipeline: "individual",
            source: "element-drag-start",
            queueStartupControlledSync: true,
          });

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
          const guideRequest = buildGuideEvaluationRequest(
            null,
            dragId,
            meta,
            "element-drag-start"
          );
          if (guideRequest) {
            prepararGuias?.(guideRequest, objetos, elementRefs);
          }
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
          const dragEndSource = isGroupPipeline
            ? (
                meta?.engine === "manual-pointer"
                  ? "group-manual-drag-end"
                  : "group-drag-end"
              )
            : "element-drag-end";
          const overlaySelectionSnapshot = readActiveDragOverlaySelectionIds(
            dragId,
            runtimeSelectedIds.length > 0
              ? runtimeSelectedIds
              : sanitizeSelectionIds(elementosSeleccionados)
          );
          clearDragGuides({
            dragId,
            tipo: obj.tipo || null,
            source: dragEndSource,
            reason: "drag-end",
          });
          queuePostDragUiRefresh(dragId, obj.tipo || null, dragEndSource);
          logSelectionDragLifecycle("drag:end", {
            dragId,
            tipo: obj.tipo || null,
            selectedIds: overlaySelectionSnapshot,
            pipeline: isGroupPipeline ? "group" : "individual",
            source: dragEndSource,
          });
          updateDragOverlayBoxFlowSessionPhase("settling", {
            dragId,
            interactionEpoch: dragOverlayBoxFlowSessionRef.current?.interactionEpoch || 0,
            source: dragEndSource,
            reason: "drag-end",
            pipeline: isGroupPipeline ? "group" : "individual",
          });
          endCanvasInteraction("drag", {
            dragId,
            tipo: obj.tipo || null,
            source: dragEndSource,
          });
        }}
        onDragMovePersonalizado={isInEditMode ? null : (pos, elementId, meta = null) => {
          const isGroupPipeline = meta?.pipeline === "group";
          const dragMoveSource = isGroupPipeline
            ? (
                meta?.engine === "manual-pointer"
                  ? "group-manual-drag-move"
                  : "group-drag-move"
              )
            : "element-drag-move";
          const guideRequest = buildGuideEvaluationRequest(
            pos,
            elementId,
            meta,
            dragMoveSource
          );
          if (guideRequest) {
            scheduleGuideEvaluation(guideRequest);
          } else {
            cancelScheduledGuideEvaluation();
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
            source: dragMoveSource,
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


                  {shouldMountPrimarySelectionOverlay && (() => {
                    return (
                      <SelectionBounds
                        selectedElements={elementosSeleccionados}
                        elementRefs={elementRefs}
                        objetos={objetos}
                        boxFlowSessionIdentity={
                          resolveReusableSelectionSessionIdentity(
                            dragInteractionSessionKey
                          ) || null
                        }
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
                        onPrimarySelectionVisualReadyChange={
                          handleSelectedPhaseVisualReadyChange
                        }
                        onPrimarySelectionVisibilityChange={
                          handleSelectedPhaseVisibilityChange
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
                    if (editing.id || sectionDecorationEdit) {
                      return null;
                    }
                    const indicatorSelectionIds =
                      dragOverlayRenderSelectionIds;

                    return (
                      <SelectionBoundsIndicator
                        ref={dragOverlayIndicatorRef}
                        selectedElements={indicatorSelectionIds}
                        elementRefs={elementRefs}
                        objetos={objetos}
                        isMobile={isMobile}
                        debugSource="drag-overlay"
                        boxFlowIdentity={dragOverlayBoxFlowIdentity}
                        boxFlowSessionIdentity={
                          resolveReusableSelectionSessionIdentity(
                            dragInteractionSessionKey
                          ) || null
                        }
                        boxFlowPhase={
                          shouldShowDragSelectionOverlay
                            ? (
                                dragOverlayBoxFlowSession.phase ||
                                (isPredragVisualSelectionActive ? "predrag" : null)
                              )
                            : (
                                shouldKeepDragOverlayMountedForSelectedPhaseHandoff
                                  ? "settling"
                                  : null
                              )
                        }
                        lifecycleKey={dragOverlayBoxFlowIdentity}
                        boundsControlMode="controlled"
                        bringToFront
                        onVisualReadyChange={handleDragSelectionOverlayReadyChange}
                        onFirstControlledFrameVisible={handleDragOverlayFirstVisibleFrame}
                        onBoxFlowBoundsSample={noteDragOverlayBoundsSample}
                        onControlledMountReady={
                          handleDragOverlayControlledMountReady
                        }
                      />
                    );
                  })()}

                </CanvasElementsLayer>

              </Stage>
  );
}
