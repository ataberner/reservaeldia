// ElementoCanvas.jsx - REEMPLAZAR TODO EL ARCHIVO
import { Text, Image as KonvaImage, Rect, Circle, Line, RegularPolygon, Path, Group } from "react-konva";
import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { LINE_CONSTANTS } from '@/models/lineConstants';
import {
  armManualGroupDragSession,
  endDragGrupal,
  finishManualGroupDragSession,
  getAnyGroupDragSession,
  getManualGroupDragPreviewPose,
  isManualGroupDragMemberLocked,
  previewDragGrupal,
  resolveSessionLeaderNode,
  shouldSuppressIndividualDragForElement,
  startDragGrupalLider,
  updateManualGroupDragSession,
} from "@/drag/dragGrupal";
import { startDragIndividual, previewDragIndividual, endDragIndividual } from "@/drag/dragIndividual";
import { getCenteredTextPosition } from "@/utils/getTextMetrics";
import { resolveRsvpButtonVisual } from "@/domain/rsvp/buttonStyles";
import { resolveKonvaFill } from "@/domain/colors/presets";
import { resolveKonvaFontStyle } from "@/components/editor/textSystem/metricsLayout/services/textFontStyleService";
import {
  getFunctionalCtaDefaultText,
  isFunctionalCtaButton,
} from "@/domain/functionalCtaButtons";
import {
  getCurrentInlineEditingId,
  getWindowElementRefs,
  getWindowObjectResolver,
} from "@/components/editor/textSystem/bridges/window/inlineWindowBridge";
import resolveInlineCanvasVisibility from "@/components/editor/textSystem/adapters/konvaDom/resolveInlineCanvasVisibility";
import { resolveKonvaImageCrop } from "@/components/editor/textSystem/render/konva/imageCropUtils";
import { shouldPreserveTextCenterPosition } from "@/lib/textCenteringPolicy";
import GaleriaKonva from "@/components/editor/GaleriaKonva";
import CountdownKonva from "@/components/editor/countdown/CountdownKonva";
import {
  getTemplateDraftDebugSession,
  groupTemplateDraftDebug,
  markTemplateDraftRenderLogged,
} from "@/domain/templates/draftPersonalizationDebug";
import useSharedImage from "@/hooks/useSharedImage";
import { resolveObjectPrimaryAssetUrl } from "../../../../../../shared/renderAssetContract.js";
import {
  buildCanvasDragPerfDiff,
  endCanvasDragPerfSession,
  startCanvasDragPerfSession,
  startCanvasDragPerfSpan,
  trackCanvasDragPerf,
} from "@/components/editor/canvasEditor/canvasDragPerf";
import {
  activateImageLayerPerf,
  buildImagePerfPayload,
  deactivateImageLayerPerf,
} from "@/components/editor/canvasEditor/imageLayerPerf";
import { notePostDragSelectionGuard } from "@/components/editor/canvasEditor/postDragSelectionGuard";
import {
  liftNodeToOverlayLayer,
  restoreNodeFromOverlayLayer,
} from "@/components/editor/canvasEditor/imageOverlayLayerLift";
import {
  getCanvasPointerDebugInfo,
  getKonvaNodeDebugInfo,
  logSelectedDragDebug,
  sampleCanvasInteractionLog,
} from "@/components/editor/canvasEditor/selectedDragDebug";
import {
  buildTextGeometryContractRect,
  logTextGeometryContractInvariant,
} from "@/components/editor/canvasEditor/textGeometryContractDebug";
import {
  getActiveCanvasBoxFlowSession,
  logCanvasBoxFlow,
} from "@/components/editor/canvasEditor/canvasBoxFlowDebug";
import {
  clearCanonicalPoseMetadata,
  markTextOriginOffsetCanonicalPose,
} from "@/components/editor/canvasEditor/konvaCanonicalPose";
import {
  resolveAuthoritativeTextRect,
} from "@/components/editor/canvasEditor/konvaAuthoritativeBounds";
import {
  getImageResizeNodeSnapshot,
  trackImageResizeDebug,
} from "@/components/editor/canvasEditor/imageResizeDebug";
import { trackImageRotationDebug } from "@/components/editor/canvasEditor/imageRotationDebug";
import {
  clearImageResizeSessionActive,
  clearPendingImageTransformCommit,
  getImageResizeSession,
  getPendingImageTransformCommit,
  hasImageTransformCommitSettled,
  resolveImageObjectWithPendingCommit,
} from "@/components/editor/canvasEditor/imagePendingTransformCommit";
import {
  EDITOR_BRIDGE_EVENTS,
  buildEditorDragLifecycleDetail,
} from "@/lib/editorBridgeContracts";
import {
  decidePressSelection,
  decideSelectionGestureDispatch,
  isManualGroupDragEligible,
  resolveEffectiveSelectionState,
  resolveInteractionAccess,
  shouldArmPredragRelease,
  shouldArmSelectedTextPrimaryRelease,
} from "./elementInteractionDecisions.js";

function normalizeFontSize(value, fallback = 24) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isInlineCanvasTextDebugEnabled() {
  if (typeof window === "undefined") return false;
  return (
    window.__INLINE_CANVAS_TEXT_DEBUG === true ||
    window.__INLINE_BOX_DEBUG === true
  );
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

function supportsPointerEvents() {
  return typeof window !== "undefined" && typeof window.PointerEvent !== "undefined";
}

function isNativePressStillActive(nativeEvent) {
  if (!nativeEvent) return false;

  const touches = nativeEvent.touches;
  if (touches && typeof touches.length === "number") {
    return touches.length > 0;
  }

  const buttons = Number(nativeEvent.buttons);
  if (Number.isFinite(buttons)) {
    return buttons !== 0;
  }

  const which = Number(nativeEvent.which);
  if (Number.isFinite(which)) {
    return which > 0;
  }

  const pressure = Number(nativeEvent.pressure);
  if (Number.isFinite(pressure)) {
    return pressure > 0;
  }

  const eventType =
    typeof nativeEvent.type === "string" ? nativeEvent.type.toLowerCase() : "";
  if (eventType.endsWith("up") || eventType.endsWith("cancel")) {
    return false;
  }

  return true;
}

function getClientPoint(nativeEvent) {
  if (!nativeEvent) return null;

  const touch =
    nativeEvent.touches?.[0] ||
    nativeEvent.changedTouches?.[0] ||
    null;
  const x = Number.isFinite(touch?.clientX) ? touch.clientX : nativeEvent.clientX;
  const y = Number.isFinite(touch?.clientY) ? touch.clientY : nativeEvent.clientY;

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function resolvePointerType(nativeEvent) {
  if (nativeEvent?.pointerType) return String(nativeEvent.pointerType).toLowerCase();
  if (nativeEvent?.touches || nativeEvent?.changedTouches) return "touch";
  return "mouse";
}

function getSelectAndDragIntentThreshold(pointerType) {
  if (pointerType === "touch" || pointerType === "pen") return 4;
  return 1;
}

function getStageContentNode(node) {
  const stage = node?.getStage?.() || null;
  return stage?.content || stage?.container?.() || null;
}

function syncStagePointerFromNativeEvent(node, nativeEvent) {
  const stage = node?.getStage?.() || null;
  if (!stage || typeof stage.setPointersPositions !== "function" || !nativeEvent) {
    return false;
  }

  try {
    stage.setPointersPositions(nativeEvent);
    return true;
  } catch {
    return false;
  }
}

function getStagePointerPoint(node) {
  const stage = node?.getStage?.() || null;
  if (!stage || typeof stage.getPointerPosition !== "function") {
    return null;
  }

  try {
    const point = stage.getPointerPosition();
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
      return null;
    }
    return {
      x: point.x,
      y: point.y,
    };
  } catch {
    return null;
  }
}

function drawRectangularHitRegion(context, shape, width, height) {
  const safeWidth = Math.max(0, Number(width) || 0);
  const safeHeight = Math.max(0, Number(height) || 0);
  if (!safeWidth || !safeHeight) return;

  context.beginPath();
  context.rect(0, 0, safeWidth, safeHeight);
  context.closePath();
  context.fillStrokeShape(shape);
}

function detachSelectionTransformerForNode(node, payload = null) {
  const stage = node?.getStage?.() || null;
  if (!stage || typeof stage.findOne !== "function") return false;

  let transformer = null;
  try {
    transformer = stage.findOne("Transformer");
  } catch {
    transformer = null;
  }
  if (!transformer || typeof transformer.nodes !== "function") return false;

  let attachedNodes = [];
  try {
    attachedNodes = transformer.nodes() || [];
  } catch {
    attachedNodes = [];
  }

  const shouldDetach = attachedNodes.some((attachedNode) => attachedNode === node);
  if (!shouldDetach) return false;
  const attachedNodeIds = attachedNodes
    .map((attachedNode) => {
      try {
        return (
          (typeof attachedNode?.id === "function"
            ? attachedNode.id()
            : attachedNode?.attrs?.id) || null
        );
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  try {
    transformer.stopTransform?.();
  } catch {}
  try {
    transformer.nodes([]);
  } catch {}
  try {
    transformer.getLayer?.()?.batchDraw?.();
  } catch {}

  trackCanvasDragPerf("transformer:detach-before-image-drag-lift", {
    elementId: payload?.elementId || null,
    tipo: payload?.tipo || null,
    attachedNodeCount: attachedNodes.length,
  }, {
    throttleMs: 60,
    throttleKey: `transformer:detach-before-image-drag-lift:${payload?.elementId || "unknown"}`,
  });
  logCanvasBoxFlow("selection", "transformer:predrag-detach", {
    source: payload?.source || "element-renderer",
    elementId: payload?.elementId || null,
    tipo: payload?.tipo || null,
    attachedNodeIds,
  }, {
    identity: payload?.selectionIdentity || payload?.elementId || "selection:implicit",
    sessionIdentity: resolveActiveSelectionBoxFlowSessionIdentity(
      payload?.selectionIdentity || payload?.elementId || null
    ),
    startPayload: {
      selectedIds: Array.isArray(payload?.selectedIds) ? payload.selectedIds : [],
    },
  });

  return true;
}

function resolveTextMeasureNode(node) {
  if (!node) return null;
  if (typeof node.getTextWidth === "function") return node;

  try {
    if (typeof node.findOne === "function") {
      const nestedText = node.findOne((candidate) => candidate.getClassName?.() === "Text");
      if (nestedText && typeof nestedText.getTextWidth === "function") {
        return nestedText;
      }
    }
  } catch {}

  return null;
}

function resolveTextTransformOriginOffset(align, width) {
  const safeWidth = Math.max(0, Number(width) || 0);
  const normalizedAlign = String(align || "left").trim().toLowerCase();

  if (normalizedAlign === "center") return safeWidth / 2;
  if (normalizedAlign === "right") return safeWidth;
  return 0;
}

function logInlineIntentEmitter(eventName, payload = {}) {
  if (!isInlineIntentDebugEnabled()) return;
  if (isInlineDiagCompactEnabled()) return;
  console.log(`[INLINE-INTENT][EMIT] ${eventName}`, {
    ts: new Date().toISOString(),
    ...payload,
  });
}

function resolveActiveSelectionBoxFlowSessionIdentity(fallback = null) {
  const activeSession = getActiveCanvasBoxFlowSession("selection");
  if (activeSession?.identity) {
    return activeSession.identity;
  }

  const trimmedFallback = String(fallback ?? "").trim();
  return trimmedFallback || "selection:implicit";
}

function toShapeSize(obj, fallbackWidth = 120, fallbackHeight = 120) {
  return {
    width: Math.max(1, Math.abs(Number(obj?.width) || fallbackWidth)),
    height: Math.max(1, Math.abs(Number(obj?.height) || fallbackHeight)),
  };
}

function buildRegularPolygonPoints(sides, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2;
  const ry = height / 2;
  const points = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = -Math.PI / 2 + (i * (Math.PI * 2)) / sides;
    points.push(cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry);
  }
  return points;
}

function buildStarPoints(width, height, innerRatio = 0.45) {
  const cx = width / 2;
  const cy = height / 2;
  const outerX = width / 2;
  const outerY = height / 2;
  const innerX = outerX * innerRatio;
  const innerY = outerY * innerRatio;
  const points = [];

  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radiusX = i % 2 === 0 ? outerX : innerX;
    const radiusY = i % 2 === 0 ? outerY : innerY;
    points.push(cx + Math.cos(angle) * radiusX, cy + Math.sin(angle) * radiusY);
  }

  return points;
}

function buildDiamondPoints(width, height) {
  return [width / 2, 0, width, height / 2, width / 2, height, 0, height / 2];
}

function buildArrowPoints(width, height) {
  return [
    0, height * 0.34,
    width * 0.6, height * 0.34,
    width * 0.6, 0,
    width, height / 2,
    width * 0.6, height,
    width * 0.6, height * 0.66,
    0, height * 0.66,
  ];
}

function buildHeartPath(width, height) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  return `M ${w * 0.5} ${h * 0.84}
    C ${w * 0.08} ${h * 0.58}, ${w * 0.14} ${h * 0.25}, ${w * 0.34} ${h * 0.25}
    C ${w * 0.42} ${h * 0.25}, ${w * 0.47} ${h * 0.30}, ${w * 0.5} ${h * 0.36}
    C ${w * 0.53} ${h * 0.30}, ${w * 0.58} ${h * 0.25}, ${w * 0.66} ${h * 0.25}
    C ${w * 0.86} ${h * 0.25}, ${w * 0.92} ${h * 0.58}, ${w * 0.5} ${h * 0.84}
    Z`;
}

function shapeFillProps(fillModel) {
  if (!fillModel?.hasGradient) {
    return {
      fill: fillModel?.fillColor || "#000000",
    };
  }

  return {
    fill: fillModel.fillColor,
    fillPriority: "linear-gradient",
    fillLinearGradientStartPoint: fillModel.startPoint,
    fillLinearGradientEndPoint: fillModel.endPoint,
    fillLinearGradientColorStops: [0, fillModel.gradientFrom, 1, fillModel.gradientTo],
  };
}





export default function ElementoCanvas({
  obj,
  isSelected,
  isInEditMode,
  onSelect,
  onChange,
  editingId,
  registerRef,
  onHover,
  preSeleccionado,
  selectionCount = 0,
  onDragMovePersonalizado,
  onDragStartPersonalizado,
  onDragEndPersonalizado,
  dragStartPos,
  hasDragged,
  editingMode = false,
  inlineOverlayMountedId = null,
  inlineOverlayMountSession = null,
  inlineVisibilityMode = "reactive",
  inlineOverlayEngine = "phase_atomic_v2",
  onInlineEditPointer = null,
  dragLayerRef = null,
  onPredragVisualSelectionStart = null,
  onPredragVisualSelectionCancel = null,
  selectionRuntime = null,
  isPassiveRender = false,
}) {
  const primaryAssetUrl = resolveObjectPrimaryAssetUrl(obj) || null;
  const imageAssetUrl = obj.tipo === "imagen" ? primaryAssetUrl : null;
  const rasterIconAssetUrl =
    obj.tipo === "icono" &&
    (
      obj.formato === "png" ||
      obj.formato === "jpg" ||
      obj.formato === "jpeg" ||
      obj.formato === "webp" ||
      obj.formato === "gif" ||
      obj.formato === "avif"
    )
      ? primaryAssetUrl
      : null;
  const [img] = useSharedImage(imageAssetUrl, "anonymous");
  const [rasterIconImg] = useSharedImage(rasterIconAssetUrl, "anonymous");
  const [measuredTextWidth, setMeasuredTextWidth] = useState(null);
  const [debugTextClientRect, setDebugTextClientRect] = useState(null);

  const elementNodeRef = useRef(null);
  const textNodeRef = useRef(null);
  const baseTextLayoutRef = useRef(null); // guarda el centro/baseline inicial
  const currentInlineEditingId = getCurrentInlineEditingId();
  const inlineVisibilityForText = useMemo(
    () => (
      obj?.tipo === "texto"
        ? resolveInlineCanvasVisibility({
            overlayEngine: inlineOverlayEngine,
            visibilityMode: inlineVisibilityMode,
            inlineOverlayMountedId,
            inlineOverlayMountSession,
            objectId: obj.id,
            editingId,
            currentInlineEditingId,
          })
        : null
    ),
    [
      currentInlineEditingId,
      editingId,
      inlineOverlayEngine,
      inlineOverlayMountSession,
      inlineOverlayMountedId,
      inlineVisibilityMode,
      obj?.id,
      obj?.tipo,
    ]
  );

  useEffect(() => {
    if (obj?.tipo !== "texto") return;

    const textNode = textNodeRef.current;
    const renderAuthority = inlineVisibilityForText?.renderAuthority || "konva";
    const overlayOwnsVisualAuthority =
      inlineVisibilityForText?.overlayOwnsVisualAuthority === true;
    const konvaVisible =
      typeof textNode?.visible === "function" ? Boolean(textNode.visible()) : null;
    const konvaOpacity =
      typeof textNode?.opacity === "function" ? Number(textNode.opacity()) : 1;
    const fallbackRect =
      typeof textNode?.getClientRect === "function"
        ? textNode.getClientRect({
            skipTransform: false,
            skipShadow: true,
            skipStroke: true,
          })
        : null;
    const authoritativeTextRect = textNode
      ? resolveAuthoritativeTextRect(textNode, obj, {
          fallbackRect,
        })
      : null;
    const pass = overlayOwnsVisualAuthority
      ? !(konvaVisible !== false && Number(konvaOpacity || 0) > 0.01)
      : true;

    logTextGeometryContractInvariant(
      "inline-visibility-authority-swap",
      {
        phase: overlayOwnsVisualAuthority ? renderAuthority : "konva",
        surface: "konva-text-visibility",
        authoritySource: renderAuthority,
        sessionIdentity:
          inlineOverlayMountSession?.sessionId ||
          getActiveCanvasBoxFlowSession("selection")?.identity ||
          obj.id ||
          null,
        elementId: obj.id || null,
        tipo: obj.tipo || null,
        pass,
        failureReason: pass
          ? null
          : "DOM inline overlay owns visual authority but the Konva text node remains visible with non-zero opacity",
        observedRects: {
          authoritativeKonvaRect: buildTextGeometryContractRect(authoritativeTextRect),
        },
        observedSources: {
          overlayOwnsVisualAuthority,
          overlayMountSwapCommitted:
            inlineVisibilityForText?.overlayMountSwapCommitted === true,
          overlayVisualReady: inlineVisibilityForText?.overlayVisualReady === true,
          overlayFocused: inlineVisibilityForText?.overlayFocused === true,
          konvaVisible,
          konvaOpacity:
            Number.isFinite(konvaOpacity) ? Number(konvaOpacity) : null,
        },
      },
      {
        sampleKey: `text-contract:inline-visibility:${obj.id || "unknown"}`,
        firstCount: 4,
        throttleMs: 160,
        force: overlayOwnsVisualAuthority || !pass,
      }
    );
  }, [
    inlineOverlayMountSession,
    inlineVisibilityForText,
    obj,
  ]);
  const readRuntimeSelectedIds = useCallback(() => {
    if (isPassiveRender) return [];
    if (typeof selectionRuntime?.readSnapshot === "function") {
      const runtimeSelectedIds = selectionRuntime.readSnapshot()?.selectedIds;
      if (Array.isArray(runtimeSelectedIds)) {
        return runtimeSelectedIds.filter(Boolean);
      }
    }

    return typeof window !== "undefined" && Array.isArray(window._elementosSeleccionados)
      ? window._elementosSeleccionados.filter(Boolean)
      : [];
  }, [isPassiveRender, selectionRuntime]);
  const readEffectiveSelectionState = useCallback(() => (
    resolveEffectiveSelectionState({
      elementId: obj.id,
      isSelected,
      selectionCount,
      runtimeSelectedIds: readRuntimeSelectedIds(),
    })
  ), [
    isSelected,
    obj.id,
    readRuntimeSelectedIds,
    selectionCount,
  ]);
  const readPendingDragSelectionRuntime = useCallback(() => {
    if (typeof selectionRuntime?.readSnapshot === "function") {
      const pendingDragSelection =
        selectionRuntime.readSnapshot()?.pendingDragSelection;
      return {
        id: pendingDragSelection?.id || null,
        phase: pendingDragSelection?.phase || null,
      };
    }

    return {
      id:
        typeof window !== "undefined" ? window._pendingDragSelectionId || null : null,
      phase:
        typeof window !== "undefined"
          ? window._pendingDragSelectionPhase || null
          : null,
    };
  }, [selectionRuntime]);
  const clearPendingDragSelectionRuntime = useCallback((source = null) => {
    if (typeof selectionRuntime?.setPendingDragSelection === "function") {
      selectionRuntime.setPendingDragSelection(null, { source });
      return;
    }

    if (typeof window !== "undefined") {
      window._pendingDragSelectionId = null;
      window._pendingDragSelectionPhase = null;
    }
  }, [selectionRuntime]);
  const dragLifecycleRef = useRef({
    lastStartAt: 0,
    lastStartId: null,
    activeMode: "idle",
    activeGroupSessionId: null,
    leaderId: null,
    suppressIndividualUntilMs: 0,
    suppressSelectionUntilMs: 0,
  });
  const manualGroupListenersRef = useRef({
    sessionId: null,
    detach: null,
    startHandled: false,
  });
  const predragReleaseListenersRef = useRef({
    detach: null,
  });
  const manualGroupRuntimeRef = useRef({
    finishPointerSession: null,
    detachWindowListeners: null,
    finishRetryTimeoutId: 0,
    finishRetrySessionId: null,
  });
  const latestObjRef = useRef(obj);
  const latestOnChangeRef = useRef(onChange);
  const latestOnDragMovePersonalizadoRef = useRef(onDragMovePersonalizado);
  const latestOnDragStartPersonalizadoRef = useRef(onDragStartPersonalizado);
  const latestOnDragEndPersonalizadoRef = useRef(onDragEndPersonalizado);
  const latestSelectionStateRef = useRef({
    isSelected,
    selectionCount,
    tipo: obj.tipo || null,
    elementId: obj.id,
  });
  const pendingPrimarySelectionClickGuardRef = useRef({
    elementId: null,
    expiresAt: 0,
  });
  const selectedTextPrimaryReleaseRef = useRef({
    armed: false,
    suppressNativeClickUntilMs: 0,
  });
  const selectAndDragFastStartRef = useRef({
    active: false,
    pressAtMs: 0,
    pointerType: null,
    thresholdPx: null,
    pointSpace: null,
    pressPoint: null,
  });
  const selectAndDragTouchActionRef = useRef({
    active: false,
    content: null,
    previousTouchAction: "",
  });
  const renderCountRef = useRef(0);
  const renderSnapshotRef = useRef(null);
  const objRefSnapshotRef = useRef(null);
  const objRefVersionRef = useRef(0);
  const imageSelectionTransitionDebugRef = useRef({
    isSelected: null,
    pendingCommitActive: false,
    resizeSessionActive: false,
  });
  const lastImagePerfSignatureRef = useRef("");
  const preDetachedSelectionTransformerRef = useRef(false);
  const pendingTransformerRestoreRafRef = useRef(0);
  const selectionImageCacheWarmupRafRef = useRef(0);
  const inlineEditPointerActive =
    isInEditMode && typeof onInlineEditPointer === "function";
  const hasPointerEvents = supportsPointerEvents();
  const imageResizeSession =
    obj.tipo === "imagen"
      ? getImageResizeSession(elementNodeRef.current)
      : null;
  const pendingImageTransformCommit =
    obj.tipo === "imagen"
      ? getPendingImageTransformCommit(elementNodeRef.current)
      : null;
  const isImageResizeGestureActive =
    typeof window !== "undefined"
      ? Boolean(window._resizeData?.isResizing)
      : false;

  const renderImageObject =
    obj.tipo === "imagen" &&
    pendingImageTransformCommit &&
    !hasImageTransformCommitSettled(obj, pendingImageTransformCommit)
      ? resolveImageObjectWithPendingCommit(obj, pendingImageTransformCommit)
      : obj;

  const imageCropData = useMemo(() => {
    if (renderImageObject.tipo !== "imagen" || !img) return null;
    return resolveKonvaImageCrop(renderImageObject, img);
  }, [img, renderImageObject]);

  useEffect(() => {
    if (obj.tipo !== "imagen") return;

    const previous = imageSelectionTransitionDebugRef.current || {};
    const nextIsSelected = Boolean(isSelected);
    const nextPendingCommitActive = Boolean(pendingImageTransformCommit);
    const nextResizeSessionActive = Boolean(imageResizeSession);
    const selectionChanged =
      previous.isSelected !== null && previous.isSelected !== nextIsSelected;
    const pendingCommitChanged =
      previous.pendingCommitActive !== nextPendingCommitActive;
    const resizeSessionChanged =
      previous.resizeSessionActive !== nextResizeSessionActive;

    imageSelectionTransitionDebugRef.current = {
      isSelected: nextIsSelected,
      pendingCommitActive: nextPendingCommitActive,
      resizeSessionActive: nextResizeSessionActive,
    };

    if (
      !selectionChanged &&
      !pendingCommitChanged &&
      !resizeSessionChanged &&
      !nextIsSelected &&
      !nextPendingCommitActive
    ) {
      return;
    }

    trackImageRotationDebug("image-rotate:renderer-selection-state", {
      elementId: obj.id,
      isSelected: nextIsSelected,
      previousIsSelected:
        previous.isSelected == null ? null : Boolean(previous.isSelected),
      selectionChanged,
      selectionCount,
      pendingCommitActive: nextPendingCommitActive,
      pendingCommitChanged,
      resizeSessionActive: nextResizeSessionActive,
      resizeSessionChanged,
      object: {
        x: obj.x ?? null,
        y: obj.y ?? null,
        yNorm: obj.yNorm ?? null,
        width: obj.width ?? null,
        height: obj.height ?? null,
        rotation: obj.rotation ?? null,
        scaleX: obj.scaleX ?? 1,
        scaleY: obj.scaleY ?? 1,
        cropX: obj.cropX ?? null,
        cropY: obj.cropY ?? null,
        cropWidth: obj.cropWidth ?? null,
        cropHeight: obj.cropHeight ?? null,
      },
      renderObject: {
        x: renderImageObject?.x ?? null,
        y: renderImageObject?.y ?? null,
        yNorm: renderImageObject?.yNorm ?? null,
        width: renderImageObject?.width ?? null,
        height: renderImageObject?.height ?? null,
        rotation: renderImageObject?.rotation ?? null,
        scaleX: renderImageObject?.scaleX ?? 1,
        scaleY: renderImageObject?.scaleY ?? 1,
      },
      pendingCommit: pendingImageTransformCommit
        ? {
            x: pendingImageTransformCommit.x ?? null,
            y: pendingImageTransformCommit.y ?? null,
            width: pendingImageTransformCommit.width ?? null,
            height: pendingImageTransformCommit.height ?? null,
            rotation: pendingImageTransformCommit.rotation ?? null,
            scaleX: pendingImageTransformCommit.scaleX ?? null,
            scaleY: pendingImageTransformCommit.scaleY ?? null,
            createdAtMs: pendingImageTransformCommit.createdAtMs ?? null,
          }
        : null,
      node: getImageResizeNodeSnapshot(elementNodeRef.current),
    }, {
      throttleMs: 40,
      throttleKey: `image-rotate:renderer-selection-state:${obj.id}`,
    });
  }, [
    imageResizeSession,
    isSelected,
    obj.cropHeight,
    obj.cropWidth,
    obj.cropX,
    obj.cropY,
    obj.height,
    obj.id,
    obj.rotation,
    obj.scaleX,
    obj.scaleY,
    obj.tipo,
    obj.width,
    obj.x,
    obj.y,
    pendingImageTransformCommit,
    renderImageObject,
    selectionCount,
  ]);

  useEffect(() => {
    if (obj.tipo !== "imagen") return;

    const node = elementNodeRef.current;
    if (!node) return;

    if (!isSelected) {
      const commitSettled = hasImageTransformCommitSettled(obj, pendingImageTransformCommit);
      trackImageRotationDebug("image-rotate:deselect-before-clear", {
        elementId: obj.id,
        selectionCount,
        commitSettled,
        pendingCommitActive: Boolean(pendingImageTransformCommit),
        resizeSessionActive: Boolean(imageResizeSession),
        object: {
          x: obj.x ?? null,
          y: obj.y ?? null,
          yNorm: obj.yNorm ?? null,
          width: obj.width ?? null,
          height: obj.height ?? null,
          rotation: obj.rotation ?? null,
          scaleX: obj.scaleX ?? 1,
          scaleY: obj.scaleY ?? 1,
        },
        renderObject: {
          x: renderImageObject?.x ?? null,
          y: renderImageObject?.y ?? null,
          yNorm: renderImageObject?.yNorm ?? null,
          width: renderImageObject?.width ?? null,
          height: renderImageObject?.height ?? null,
          rotation: renderImageObject?.rotation ?? null,
          scaleX: renderImageObject?.scaleX ?? 1,
          scaleY: renderImageObject?.scaleY ?? 1,
        },
        pendingCommit: pendingImageTransformCommit
          ? {
              x: pendingImageTransformCommit.x ?? null,
              y: pendingImageTransformCommit.y ?? null,
              width: pendingImageTransformCommit.width ?? null,
              height: pendingImageTransformCommit.height ?? null,
              rotation: pendingImageTransformCommit.rotation ?? null,
            }
          : null,
        node: getImageResizeNodeSnapshot(node),
      });

      clearImageResizeSessionActive(node);
      if (commitSettled) {
        clearPendingImageTransformCommit(node);
      }

      trackImageRotationDebug("image-rotate:deselect-after-clear", {
        elementId: obj.id,
        selectionCount,
        commitSettled,
        pendingCommitActive: Boolean(getPendingImageTransformCommit(node)),
        resizeSessionActive: Boolean(getImageResizeSession(node)),
        node: getImageResizeNodeSnapshot(node),
      });
      return;
    }

    if (hasImageTransformCommitSettled(obj, pendingImageTransformCommit)) {
      clearImageResizeSessionActive(node);
      clearPendingImageTransformCommit(node);
    }
  }, [
    imageResizeSession,
    isSelected,
    obj,
    obj.height,
    obj.id,
    obj.rotation,
    obj.scaleX,
    obj.scaleY,
    obj.width,
    obj.x,
    obj.y,
    pendingImageTransformCommit,
    renderImageObject,
    selectionCount,
  ]);

  useEffect(() => {
    renderCountRef.current += 1;
    if (typeof window === "undefined") return;

    if (objRefSnapshotRef.current !== obj) {
      objRefSnapshotRef.current = obj;
      objRefVersionRef.current += 1;
    }

    const isInteractionActive =
      window._isDragging ||
      window._grupoLider ||
      window._resizeData?.isResizing;
    const shouldLogRender =
      isInteractionActive &&
      (isSelected || obj.id === window._grupoLider || obj.tipo === "imagen");

    if (!shouldLogRender) return;

    const nextSnapshot = {
      objRefVersion: objRefVersionRef.current,
      objSignature: [
        obj.id || "",
        obj.seccionId || "",
        obj.x ?? 0,
        obj.y ?? 0,
        obj.width ?? "",
        obj.height ?? "",
        obj.scaleX ?? 1,
        obj.scaleY ?? 1,
        obj.rotation ?? 0,
      ].join(":"),
      isSelected: Boolean(isSelected),
      preSeleccionado: Boolean(preSeleccionado),
      selectionCount,
      isInEditMode: Boolean(isInEditMode),
      editingId: editingId || null,
      inlineOverlayMountedId: inlineOverlayMountedId || null,
    };
    const diff = buildCanvasDragPerfDiff(
      renderSnapshotRef.current,
      nextSnapshot
    );
    renderSnapshotRef.current = nextSnapshot;

    trackCanvasDragPerf("render:ElementoCanvas", {
      renderCount: renderCountRef.current,
      elementId: obj.id,
      tipo: obj.tipo,
      dragging: Boolean(window._isDragging),
      groupLeader: window._grupoLider || null,
      resizing: Boolean(window._resizeData?.isResizing),
      x: obj.x ?? 0,
      y: obj.y ?? 0,
      width: obj.width ?? null,
      height: obj.height ?? null,
      scaleX: obj.scaleX ?? 1,
      scaleY: obj.scaleY ?? 1,
      rotation: obj.rotation ?? 0,
      changedKeys: diff.changedKeys,
      changes: diff.changes,
      ...nextSnapshot,
    }, {
      throttleMs: 120,
      throttleKey: `render:ElementoCanvas:${obj.id}`,
    });
  });

  useEffect(() => {
    if (obj.tipo !== "imagen" || !img || !imageCropData) return;
    const nextPayload = buildImagePerfPayload(
      obj,
      img,
      imageCropData,
      elementNodeRef.current
    );
    if (!nextPayload) return;

    const signature = JSON.stringify([
      nextPayload.src || "",
      nextPayload.sourceWidth || 0,
      nextPayload.sourceHeight || 0,
      nextPayload.displayWidth || 0,
      nextPayload.displayHeight || 0,
      nextPayload.cropX || 0,
      nextPayload.cropY || 0,
      nextPayload.cropWidth || 0,
      nextPayload.cropHeight || 0,
    ]);

    if (signature === lastImagePerfSignatureRef.current) return;
    lastImagePerfSignatureRef.current = signature;

    trackCanvasDragPerf("image:asset-profile", nextPayload, {
      throttleMs: 60,
      throttleKey: `image:asset-profile:${obj.id}`,
    });
  }, [imageCropData, img, obj, obj.id, obj.tipo]);

  useEffect(() => {
    if (
      obj.tipo !== "imagen" ||
      !img ||
      !imageCropData ||
      !isSelected ||
      selectionCount !== 1 ||
      isInEditMode ||
      isImageResizeGestureActive ||
      imageResizeSession ||
      pendingImageTransformCommit
    ) {
      if (
        selectionImageCacheWarmupRafRef.current &&
        typeof cancelAnimationFrame === "function"
      ) {
        cancelAnimationFrame(selectionImageCacheWarmupRafRef.current);
        selectionImageCacheWarmupRafRef.current = 0;
      }
      deactivateImageLayerPerf(elementNodeRef.current, obj.id, {
        cacheEventPrefix: "image:selection-cache",
        cacheStateKey: "canvasSelectionCache",
        manageActivePayload: false,
      });
      return;
    }

    if (typeof requestAnimationFrame !== "function") return undefined;

    selectionImageCacheWarmupRafRef.current = requestAnimationFrame(() => {
      selectionImageCacheWarmupRafRef.current = 0;
      const node = elementNodeRef.current;
      if (!node) return;

      const selectionPayload = buildImagePerfPayload(
        obj,
        img,
        imageCropData,
        node
      );

      activateImageLayerPerf(node, selectionPayload, {
        cacheEventPrefix: "image:selection-cache",
        cacheStateKey: "canvasSelectionCache",
        manageActivePayload: false,
      });
    });

    return () => {
      if (
        selectionImageCacheWarmupRafRef.current &&
        typeof cancelAnimationFrame === "function"
      ) {
        cancelAnimationFrame(selectionImageCacheWarmupRafRef.current);
        selectionImageCacheWarmupRafRef.current = 0;
      }
    };
  }, [
    imageCropData,
    img,
    imageAssetUrl,
    isInEditMode,
    isImageResizeGestureActive,
    isSelected,
    imageResizeSession,
    obj.id,
    obj.tipo,
    obj.width,
    obj.height,
    obj.cropX,
    obj.cropY,
    obj.cropWidth,
    obj.cropHeight,
    pendingImageTransformCommit,
    selectionCount,
  ]);

  useEffect(() => () => {
    if (
      selectionImageCacheWarmupRafRef.current &&
      typeof cancelAnimationFrame === "function"
    ) {
      cancelAnimationFrame(selectionImageCacheWarmupRafRef.current);
      selectionImageCacheWarmupRafRef.current = 0;
    }
    if (
      pendingTransformerRestoreRafRef.current &&
      typeof cancelAnimationFrame === "function"
    ) {
      cancelAnimationFrame(pendingTransformerRestoreRafRef.current);
      pendingTransformerRestoreRafRef.current = 0;
    }
    deactivateImageLayerPerf(elementNodeRef.current, obj.id, {
      cacheEventPrefix: "image:selection-cache",
      cacheStateKey: "canvasSelectionCache",
      manageActivePayload: false,
    });
    clearImageResizeSessionActive(elementNodeRef.current);
    deactivateImageLayerPerf(elementNodeRef.current, obj.id);
      restoreNodeFromOverlayLayer(elementNodeRef.current, obj.id, {
        eventPrefix: "image:drag-layer",
      });
  }, [obj.id]);


  // Ã°Å¸â€Â¥ PREVENIR onChange RECURSIVO PARA AUTOFIX
  const handleChange = useCallback((id, newData) => {
    if (newData.fromAutoFix || !onChange) return;
    onChange(id, newData);
  }, [onChange]);

  const handleRef = useCallback((node) => {
    elementNodeRef.current = node || null;
    if (node && obj.tipo !== "texto") {
      clearCanonicalPoseMetadata(node);
    }
    if (registerRef) {
      registerRef(obj.id, node || null);
      // Ã¢ÂÅ’ NO despachar "element-ref-registrado" acÃƒÂ¡
      // CanvasEditor.registerRef ya lo hace.
    }
  }, [obj.id, obj.tipo, registerRef]);

  const cancelPendingTransformerRestore = useCallback(() => {
    if (
      !pendingTransformerRestoreRafRef.current ||
      typeof cancelAnimationFrame !== "function"
    ) {
      return;
    }

    cancelAnimationFrame(pendingTransformerRestoreRafRef.current);
    pendingTransformerRestoreRafRef.current = 0;
  }, []);

  const queueTransformerRestoreAfterPredragCancel = useCallback(() => {
    if (!preDetachedSelectionTransformerRef.current) return;

    cancelPendingTransformerRestore();
    logCanvasBoxFlow("selection", "transformer:restore-after-predrag-cancel-scheduled", {
      source: "element-renderer",
      elementId: obj.id,
      tipo: obj.tipo,
    }, {
      identity: obj.id,
      sessionIdentity: resolveActiveSelectionBoxFlowSessionIdentity(obj.id),
    });

    if (
      typeof window === "undefined" ||
      typeof requestAnimationFrame !== "function"
    ) {
      preDetachedSelectionTransformerRef.current = false;
      return;
    }

    pendingTransformerRestoreRafRef.current = requestAnimationFrame(() => {
      pendingTransformerRestoreRafRef.current = 0;
      preDetachedSelectionTransformerRef.current = false;

      trackCanvasDragPerf("transformer:restore-after-predrag-cancel", {
        elementId: obj.id,
        tipo: obj.tipo,
      }, {
        throttleMs: 60,
        throttleKey: `transformer:restore-after-predrag-cancel:${obj.id}`,
      });
      logCanvasBoxFlow("selection", "transformer:restore-after-predrag-cancel-applied", {
        source: "element-renderer",
        elementId: obj.id,
        tipo: obj.tipo,
      }, {
        identity: obj.id,
        sessionIdentity: resolveActiveSelectionBoxFlowSessionIdentity(obj.id),
      });

      try {
        window.dispatchEvent(
          new CustomEvent("element-ref-registrado", { detail: { id: obj.id } })
        );
      } catch {}
    });
  }, [cancelPendingTransformerRestore, obj.id, obj.tipo]);

  const getActiveGroupInteractionState = useCallback(() => {
    const activeGroupSession = getAnyGroupDragSession();
    const isManualGroupMember = Boolean(
      activeGroupSession?.active &&
      activeGroupSession?.engine === "manual-pointer" &&
      Array.isArray(activeGroupSession.elementIds) &&
      activeGroupSession.elementIds.includes(obj.id)
    );
    const isManualGroupLeader = Boolean(
      isManualGroupMember && activeGroupSession?.leaderId === obj.id
    );
    const isActiveGroupFollower = Boolean(
      activeGroupSession?.active &&
      activeGroupSession.leaderId !== obj.id &&
      Array.isArray(activeGroupSession.elementIds) &&
      activeGroupSession.elementIds.includes(obj.id)
    );

    return {
      activeGroupSession,
      isActiveGroupFollower,
      isManualGroupMember,
      isManualGroupLeader,
    };
  }, [obj.id]);

  const shouldUseManualGroupDrag = useCallback(() => (
    isManualGroupDragEligible({
      isSelected,
      selectionCount,
      editingMode,
      isInEditMode,
      inlineEditPointerActive,
    })
  ), [
    editingMode,
    inlineEditPointerActive,
    isInEditMode,
    isSelected,
    selectionCount,
  ]);

  useEffect(() => {
    if (obj.tipo !== "imagen" || !isSelected) return;

    trackImageResizeDebug("renderer:selected-image-sync", {
      elementId: obj.id,
      isSelected: Boolean(isSelected),
      selectionCount,
      resizeActive:
        typeof window !== "undefined"
          ? Boolean(window._resizeData?.isResizing)
          : false,
      resizeSessionActive: Boolean(imageResizeSession),
      object: {
        width: obj.width ?? null,
        height: obj.height ?? null,
        scaleX: obj.scaleX ?? 1,
        scaleY: obj.scaleY ?? 1,
        cropX: obj.cropX ?? null,
        cropY: obj.cropY ?? null,
        cropWidth: obj.cropWidth ?? null,
        cropHeight: obj.cropHeight ?? null,
        rotation: obj.rotation ?? null,
      },
      imageCrop: imageCropData
        ? {
            width: imageCropData.width ?? null,
            height: imageCropData.height ?? null,
            cropX: imageCropData.crop?.x ?? null,
            cropY: imageCropData.crop?.y ?? null,
            cropWidth: imageCropData.crop?.width ?? null,
            cropHeight: imageCropData.crop?.height ?? null,
          }
        : null,
      node: getImageResizeNodeSnapshot(elementNodeRef.current),
    }, {
      throttleMs: 40,
      throttleKey: `renderer:selected-image-sync:${obj.id}`,
    });
  }, [
    imageCropData,
    isSelected,
    obj.cropHeight,
    obj.cropWidth,
    obj.cropX,
    obj.cropY,
    obj.height,
    obj.id,
    obj.rotation,
    obj.scaleX,
    obj.scaleY,
    obj.tipo,
    obj.width,
    imageResizeSession,
    selectionCount,
  ]);

  const resolveInteractionAccessState = useCallback(() => {
    if (isPassiveRender) {
      return {
        draggable: false,
        listening: false,
        followerSuppressed: false,
      };
    }
    const { isActiveGroupFollower, isManualGroupMember } =
      getActiveGroupInteractionState();
    return resolveInteractionAccess({
      editingMode,
      isInEditMode,
      inlineEditPointerActive,
      isActiveGroupFollower,
      isManualGroupMember,
      manualGroupDragEligible: shouldUseManualGroupDrag(),
    });
  }, [
    editingMode,
    getActiveGroupInteractionState,
    inlineEditPointerActive,
    isPassiveRender,
    isInEditMode,
    shouldUseManualGroupDrag,
  ]);

  const resolveInteractionDraggableEnabled = useCallback(() => {
    return resolveInteractionAccessState().draggable;
  }, [resolveInteractionAccessState]);

  const resolveInteractionListeningEnabled = useCallback(() => {
    return resolveInteractionAccessState().listening;
  }, [resolveInteractionAccessState]);

  const isActiveGroupFollowerInteractionSuppressed = useCallback(() => {
    return resolveInteractionAccessState().followerSuppressed;
  }, [resolveInteractionAccessState]);

  const syncInteractionDraggableState = useCallback((node) => {
    if (!node) return;
    const nextDraggable = resolveInteractionDraggableEnabled();
    const nextListening = resolveInteractionListeningEnabled();
    if (typeof node.draggable === "function") {
      node.draggable(nextDraggable);
    }
    if (typeof node.listening === "function") {
      node.listening(nextListening);
    }
    logSelectedDragDebug("element:sync-draggable", {
      elementId: obj.id,
      tipo: obj.tipo,
      isSelected,
      selectionCount,
      nextDraggable,
      nextListening,
      node: getKonvaNodeDebugInfo(node),
    });
  }, [
    isSelected,
    obj.id,
    obj.tipo,
    resolveInteractionDraggableEnabled,
    resolveInteractionListeningEnabled,
    selectionCount,
  ]);

  const ignoreActiveGroupFollowerDragStart = useCallback((event, groupDragResult) => {
    const node = event?.currentTarget || event?.target || null;
    const restorePose = groupDragResult?.restorePose || null;

    try {
      if (typeof node?.isDragging === "function" && node.isDragging()) {
        node.stopDrag?.();
      }
    } catch {}
    try {
      if (restorePose && typeof node?.position === "function") {
        node.position({
          x: restorePose.x,
          y: restorePose.y,
        });
      }
    } catch {}
    try {
      node?.draggable?.(false);
    } catch {}
    try {
      node?.listening?.(false);
    } catch {}
    try {
      node?.getLayer?.()?.batchDraw?.();
    } catch {}
  }, []);

  const shouldSuppressIndividualPipeline = useCallback((elementId = obj.id, nowMs = null) => {
    const dragLifecycle = dragLifecycleRef.current || {};
    const currentNowMs =
      Number.isFinite(Number(nowMs))
        ? Number(nowMs)
        : (
            typeof performance !== "undefined" && typeof performance.now === "function"
              ? performance.now()
              : Date.now()
          );

    const localSuppressed =
      dragLifecycle.lastStartId === elementId &&
      Number(dragLifecycle.suppressIndividualUntilMs || 0) > currentNowMs;

    return localSuppressed || shouldSuppressIndividualDragForElement(elementId);
  }, [obj.id]);

  const shouldSuppressSelectionGesture = useCallback((nowMs = null) => {
    const dragLifecycle = dragLifecycleRef.current || {};
    const currentNowMs =
      Number.isFinite(Number(nowMs))
        ? Number(nowMs)
        : (
            typeof performance !== "undefined" && typeof performance.now === "function"
              ? performance.now()
              : Date.now()
          );
    const activeSession = getAnyGroupDragSession();
    const isManualSessionForElement = Boolean(
      activeSession?.active &&
      activeSession?.engine === "manual-pointer" &&
      Array.isArray(activeSession.elementIds) &&
      activeSession.elementIds.includes(obj.id)
    );
    return (
      isManualSessionForElement ||
      (
        dragLifecycle.lastStartId === obj.id &&
        Number(dragLifecycle.suppressSelectionUntilMs || 0) > currentNowMs
      )
    );
  }, [obj.id]);

  const logElementGestureDebug = useCallback((eventName, event, extra = {}) => {
    logSelectedDragDebug(eventName, {
      elementId: obj.id,
      tipo: obj.tipo,
      isSelected,
      selectionCount,
      editingMode: Boolean(editingMode),
      isInEditMode: Boolean(isInEditMode),
      inlineEditPointerActive: Boolean(inlineEditPointerActive),
      hasDragged: Boolean(hasDragged?.current),
      target: getKonvaNodeDebugInfo(event?.target),
      currentTarget: getKonvaNodeDebugInfo(event?.currentTarget),
      pointer: getCanvasPointerDebugInfo(event),
      ...extra,
    });
  }, [
    editingMode,
    hasDragged,
    inlineEditPointerActive,
    isInEditMode,
    isSelected,
    obj.id,
    obj.tipo,
    selectionCount,
  ]);

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

  const shouldArmSelectedTextPrimaryOnRelease = useCallback((nativeEvent = null) => {
    const { effectiveIsSelected, effectiveSelectionCount } =
      readEffectiveSelectionState();

    return shouldArmSelectedTextPrimaryRelease({
      tipo: obj.tipo,
      effectiveIsSelected,
      effectiveSelectionCount,
      editingMode,
      inlineEditPointerActive,
      shiftKey: Boolean(nativeEvent?.shiftKey),
      ctrlKey: Boolean(nativeEvent?.ctrlKey),
      metaKey: Boolean(nativeEvent?.metaKey),
      altKey: Boolean(nativeEvent?.altKey),
    });
  }, [
    editingMode,
    inlineEditPointerActive,
    obj.tipo,
    readEffectiveSelectionState,
  ]);

  const armSelectedTextPrimaryOnRelease = useCallback((event, source = "pointerdown") => {
    const nativeEvent = event?.evt || null;
    const { runtimeSelectedIds } = readEffectiveSelectionState();
    const armed = shouldArmSelectedTextPrimaryOnRelease(nativeEvent);
    selectedTextPrimaryReleaseRef.current = {
      armed,
      suppressNativeClickUntilMs: 0,
    };
    logInlineIntentEmitter("selected-text-release-arm", {
      id: obj.id,
      tipo: obj.tipo,
      source,
      armed,
      isSelectedProp: Boolean(isSelected),
      selectionCount,
      runtimeSelectedIds,
    });
    return armed;
  }, [
    isSelected,
    obj.id,
    obj.tipo,
    readEffectiveSelectionState,
    selectionCount,
    shouldArmSelectedTextPrimaryOnRelease,
  ]);

  const maybeSelectElementOnPress = useCallback((event) => {
    const {
      runtimeSelectedIds,
      effectiveIsSelected,
      effectiveSelectionCount,
    } = readEffectiveSelectionState();
    const nativeEvent = event?.evt || null;
    const pressSelectionDecision = decidePressSelection({
      hasOnSelect: typeof onSelect === "function",
      effectiveIsSelected,
      effectiveSelectionCount,
      inlineEditPointerActive,
      selectionGestureSuppressed: shouldSuppressSelectionGesture(),
      button: nativeEvent?.button,
      shiftKey: Boolean(nativeEvent?.shiftKey),
      ctrlKey: Boolean(nativeEvent?.ctrlKey),
      metaKey: Boolean(nativeEvent?.metaKey),
    });

    if (!pressSelectionDecision.shouldSelectOnPress) {
      if (pressSelectionDecision.reason !== "non-primary-button") {
        logInlineIntentEmitter("press-selection-skip", {
          id: obj.id,
          tipo: obj.tipo,
          reason: pressSelectionDecision.reason,
          ...(pressSelectionDecision.reason === "already-selected"
            ? {
                isSelectedProp: Boolean(isSelected),
                runtimeSelectedIds,
                effectiveSelectionCount,
              }
            : {}),
          ...(pressSelectionDecision.reason === "multiselection-active"
            ? {
                runtimeSelectedIds,
                effectiveSelectionCount,
              }
            : {}),
        });
      }
      return false;
    }

    armPrimarySelectionClickGuard();
    logElementGestureDebug("element:selection-press", event, {
      shift: Boolean(nativeEvent?.shiftKey),
      ctrl: Boolean(nativeEvent?.ctrlKey),
      meta: Boolean(nativeEvent?.metaKey),
      allowSameGestureDrag: pressSelectionDecision.allowSameGestureDrag,
    });
    const selectionIntent = onSelect(obj.id, obj, event, {
      gesture: "primary",
      selectionOrigin: "press",
      allowSameGestureDrag: pressSelectionDecision.allowSameGestureDrag,
    });
    logInlineIntentEmitter("press-selection-result", {
      id: obj.id,
      tipo: obj.tipo,
      decision: selectionIntent?.decision || null,
      didSelectOnPress: Boolean(selectionIntent),
      allowSameGestureDrag: pressSelectionDecision.allowSameGestureDrag,
      runtimeSelectedIds,
      effectiveSelectionCount,
    });
    const shouldAllowSameGestureDrag =
      selectionIntent?.decision === "select_and_drag";
    if (shouldAllowSameGestureDrag && typeof window !== "undefined") {
      logSelectedDragDebug("element:selection-press-drag-handoff", {
        elementId: obj.id,
        tipo: obj.tipo,
        decision: selectionIntent?.decision || null,
        mirroredSelection:
          Array.isArray(selectionIntent?.selectionIds) && selectionIntent.selectionIds.length > 0
            ? selectionIntent.selectionIds
            : [obj.id],
      });
    }
    return {
      didSelectOnPress: Boolean(selectionIntent),
      allowSameGestureDrag: shouldAllowSameGestureDrag,
      decision: selectionIntent?.decision || null,
    };
  }, [
    armPrimarySelectionClickGuard,
    decidePressSelection,
    inlineEditPointerActive,
    isSelected,
    logElementGestureDebug,
    obj,
    onSelect,
    readEffectiveSelectionState,
    shouldSuppressSelectionGesture,
  ]);

  useEffect(() => {
    latestObjRef.current = obj;
    latestOnChangeRef.current = onChange;
    latestOnDragMovePersonalizadoRef.current = onDragMovePersonalizado;
    latestOnDragStartPersonalizadoRef.current = onDragStartPersonalizado;
    latestOnDragEndPersonalizadoRef.current = onDragEndPersonalizado;
    latestSelectionStateRef.current = {
      isSelected,
      selectionCount,
      tipo: obj.tipo || null,
      elementId: obj.id,
    };
  }, [
    isSelected,
    obj,
    onChange,
    onDragMovePersonalizado,
    onDragEndPersonalizado,
    onDragStartPersonalizado,
    selectionCount,
  ]);

  const forwardManualGroupPreviewToDragOverlay = useCallback((session, reason = "manual-preview") => {
    if (!session?.active || session.engine !== "manual-pointer") {
      return false;
    }

    const onDragMovePersonalizadoCurrent = latestOnDragMovePersonalizadoRef.current;
    if (typeof onDragMovePersonalizadoCurrent !== "function") {
      return false;
    }

    const latestObj = latestObjRef.current || {};
    const leaderId = session.leaderId || latestObj.id || null;
    if (!leaderId) {
      return false;
    }

    const leaderNode = resolveSessionLeaderNode(session) || elementNodeRef.current;
    const previewPose = getManualGroupDragPreviewPose(leaderId);
    const leaderPos =
      leaderNode &&
      typeof leaderNode.x === "function" &&
      typeof leaderNode.y === "function"
        ? {
            x: leaderNode.x(),
            y: leaderNode.y(),
          }
        : (
            Number.isFinite(previewPose?.x) && Number.isFinite(previewPose?.y)
              ? {
                  x: previewPose.x,
                  y: previewPose.y,
                }
              : null
          );

    if (!Number.isFinite(leaderPos?.x) || !Number.isFinite(leaderPos?.y)) {
      return false;
    }

    onDragMovePersonalizadoCurrent(leaderPos, leaderId, {
      pipeline: "group",
      engine: "manual-pointer",
      sessionId: session.sessionId || null,
      leaderId,
    });

    const syncSample = sampleCanvasInteractionLog(
      `drag-group-overlay-forward:${leaderId}`,
      {
        firstCount: 3,
        throttleMs: 120,
      }
    );

    if (syncSample.shouldLog) {
      logCanvasBoxFlow("selection", "group-drag:overlay-sync-forwarded", {
        source: "manual-group-pointermove",
        reason,
        phase: "drag",
        owner: "drag-overlay",
        dragId: leaderId,
        selectedIds: Array.isArray(session.elementIds) ? session.elementIds : [leaderId],
        visualIds: Array.isArray(session.elementIds) ? session.elementIds : [leaderId],
        selectionAuthority: "drag-session",
        geometryAuthority: "live-nodes",
        overlayVisible: true,
        settling: false,
        suppressedLayers: ["hover-indicator", "selected-phase"],
        pipeline: "group",
      }, {
        identity: session.sessionId || leaderId,
        sessionIdentity: resolveActiveSelectionBoxFlowSessionIdentity(
          session.sessionId || leaderId
        ),
      });
    }

    return true;
  }, []);

  const cancelManualGroupFinishRetry = useCallback(() => {
    const runtime = manualGroupRuntimeRef.current;
    if (runtime.finishRetryTimeoutId) {
      clearTimeout(runtime.finishRetryTimeoutId);
    }
    runtime.finishRetryTimeoutId = 0;
    runtime.finishRetrySessionId = null;
  }, []);

  const detachManualGroupWindowListeners = useCallback(() => {
    const current = manualGroupListenersRef.current;
    try {
      current?.detach?.();
    } catch {}
    manualGroupListenersRef.current = {
      sessionId: null,
      detach: null,
      startHandled: false,
    };
    manualGroupRuntimeRef.current.detachWindowListeners = null;
  }, []);

  const detachPredragReleaseListeners = useCallback(() => {
    const current = predragReleaseListenersRef.current;
    try {
      current?.detach?.();
    } catch {}
    predragReleaseListenersRef.current = {
      detach: null,
    };
  }, []);

  const restoreSelectAndDragPredragTouchAction = useCallback((restore = true) => {
    const current = selectAndDragTouchActionRef.current;
    if (current?.active && current.content && restore) {
      try {
        current.content.style.touchAction = current.previousTouchAction || "pan-y";
      } catch {}
    }
    selectAndDragTouchActionRef.current = {
      active: false,
      content: null,
      previousTouchAction: "",
    };
  }, []);

  const cancelPendingNativePredrag = useCallback((
    nativeEvent = null,
    reason = "pointerup",
    explicitNode = null
  ) => {
    detachPredragReleaseListeners();

    const dragLifecycle = dragLifecycleRef.current || {};
    if (String(dragLifecycle.activeMode || "idle").startsWith("group")) {
      return;
    }

    if (hasDragged.current) {
      return;
    }

    onPredragVisualSelectionCancel?.(obj.id);

    const node = explicitNode || elementNodeRef.current;
    if (!node) return;

    try {
      node.stopDrag?.();
    } catch {}
    try {
      node.draggable?.(false);
    } catch {}
    try {
      node.getLayer?.()?.batchDraw?.();
    } catch {}

    syncInteractionDraggableState(node);
    let clearedPredragSelectionLock = false;
    if (typeof window !== "undefined") {
      window._isDragging = false;
      const pendingDragSelection = readPendingDragSelectionRuntime();
      if (
        pendingDragSelection.phase === "predrag" &&
        pendingDragSelection.id === obj.id
      ) {
        clearPendingDragSelectionRuntime("element:predrag-cancel");
        clearedPredragSelectionLock = true;
      }
    }

    logSelectedDragDebug("element:predrag-cancel", {
      elementId: obj.id,
      tipo: obj.tipo,
      reason,
      nativeEventType: nativeEvent?.type ?? null,
      buttons:
        nativeEvent && Number.isFinite(Number(nativeEvent.buttons))
          ? Number(nativeEvent.buttons)
          : null,
      clearedPredragSelectionLock,
      hasDragged: Boolean(hasDragged.current),
      node: getKonvaNodeDebugInfo(node),
    });
    logCanvasBoxFlow("selection", "predrag:cancel", {
      source: "element-renderer",
      elementId: obj.id,
      tipo: obj.tipo,
      reason,
      clearedPredragSelectionLock,
      node: getKonvaNodeDebugInfo(node),
    }, {
      identity: obj.id,
      sessionIdentity: resolveActiveSelectionBoxFlowSessionIdentity(obj.id),
    });

    if (clearedPredragSelectionLock && typeof window !== "undefined") {
      try {
        window.dispatchEvent(
          new CustomEvent("element-ref-registrado", { detail: { id: obj.id } })
        );
      } catch {}
    }

    restoreSelectAndDragPredragTouchAction(true);
    selectAndDragFastStartRef.current = {
      active: false,
      pressAtMs: 0,
      pointerType: null,
      thresholdPx: null,
      pointSpace: null,
      pressPoint: null,
    };

    queueTransformerRestoreAfterPredragCancel();
  }, [
    detachPredragReleaseListeners,
    hasDragged,
    onPredragVisualSelectionCancel,
    obj.id,
    obj.tipo,
    queueTransformerRestoreAfterPredragCancel,
    restoreSelectAndDragPredragTouchAction,
    syncInteractionDraggableState,
  ]);

  const finishManualGroupPointerSession = useCallback((nativeEvent = null, reason = "pointerup", options = {}) => {
    const session = getAnyGroupDragSession();
    const latestObj = latestObjRef.current;
    const latestSelectionState = latestSelectionStateRef.current || {};
    if (!session?.active || session.engine !== "manual-pointer" || session.leaderId !== latestObj?.id) {
      cancelManualGroupFinishRetry();
      detachManualGroupWindowListeners();
      return null;
    }

    const forceFinish = options?.force === true;
    const leaderNodeBeforeFinish = resolveSessionLeaderNode(session);
    const shouldRetryForUnmount = reason === "leader-unmount" && !forceFinish;
    const shouldRetryForMissingLeader =
      !forceFinish &&
      !leaderNodeBeforeFinish &&
      (
        reason === "pointerup" ||
        reason === "pointercancel" ||
        reason === "mouseup" ||
        reason === "touchend" ||
        reason === "touchcancel"
      );

    if (shouldRetryForUnmount || shouldRetryForMissingLeader) {
      const retrySessionId = session.sessionId;
      cancelManualGroupFinishRetry();
      manualGroupRuntimeRef.current.finishRetrySessionId = retrySessionId;
      manualGroupRuntimeRef.current.finishRetryTimeoutId = setTimeout(() => {
        const activeSession = getAnyGroupDragSession();
        const runtime = manualGroupRuntimeRef.current;
        runtime.finishRetryTimeoutId = 0;
        runtime.finishRetrySessionId = null;

        if (
          !activeSession?.active ||
          activeSession.engine !== "manual-pointer" ||
          activeSession.sessionId !== retrySessionId ||
          activeSession.leaderId !== latestObjRef.current?.id
        ) {
          return;
        }

        const resolvedLeaderNode = resolveSessionLeaderNode(activeSession);
        if (resolvedLeaderNode && reason === "leader-unmount") {
          logSelectedDragDebug("drag:group:leader-ref-recovered", {
            sessionId: activeSession.sessionId,
            leaderId: activeSession.leaderId,
            reason,
            node: getKonvaNodeDebugInfo(resolvedLeaderNode),
          });
          return;
        }

        const nextReason = resolvedLeaderNode
          ? reason
          : (reason === "leader-unmount" ? "leader-unmount" : "timeout-retry-exhausted");
        runtime.finishPointerSession?.(nativeEvent, nextReason, {
          force: true,
        });
      }, 40);

      logSelectedDragDebug("drag:group:finish-retry-scheduled", {
        sessionId: session.sessionId,
        leaderId: session.leaderId,
        reason,
        leaderResolvedById: Boolean(leaderNodeBeforeFinish),
      });
      return {
        handled: true,
        role: "leader",
        mode: "finish-retry-scheduled",
        sessionId: session.sessionId,
        leaderId: session.leaderId,
        completed: false,
      };
    }

    const finishDragEndPerf = startCanvasDragPerfSpan("drag:handler-end", {
      elementId: latestObj?.id || null,
      tipo: latestObj?.tipo || null,
    }, {
      throttleMs: 60,
      throttleKey: `drag:handler-end:${latestObj?.id || "unknown"}`,
    });
    cancelManualGroupFinishRetry();
    const leaderNodeForMetrics = resolveSessionLeaderNode(session) || elementNodeRef.current;
    const finalNodeX =
      typeof leaderNodeForMetrics?.x === "function"
        ? leaderNodeForMetrics.x()
        : latestObj?.x ?? 0;
    const finalNodeY =
      typeof leaderNodeForMetrics?.y === "function"
        ? leaderNodeForMetrics.y()
        : latestObj?.y ?? 0;

    const finishResult = finishManualGroupDragSession(nativeEvent, {
      reason,
      obj: latestObj,
      onChange: latestOnChangeRef.current,
      hasDragged,
    });

    detachManualGroupWindowListeners();
    cancelPendingTransformerRestore();
    preDetachedSelectionTransformerRef.current = false;

    const nowMs =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    dragLifecycleRef.current = {
      lastStartAt: nowMs,
      lastStartId: latestObj?.id || null,
      activeMode: "idle",
      activeGroupSessionId: null,
      leaderId: null,
      suppressIndividualUntilMs: finishResult?.completed ? nowMs + 120 : 0,
      suppressSelectionUntilMs: finishResult?.completed ? nowMs + 120 : 0,
    };

    if (finishResult?.completed) {
      notePostDragSelectionGuard();
      if (typeof window !== "undefined" && finishResult.shouldDispatchDraggingEnd) {
        window.dispatchEvent(
          new CustomEvent(EDITOR_BRIDGE_EVENTS.DRAGGING_END, {
            detail: buildEditorDragLifecycleDetail({
              id: latestObj?.id || null,
              tipo: latestObj?.tipo || null,
              group: true,
              engine: "manual-pointer",
              sessionId: finishResult.sessionId || null,
              leaderId: finishResult.leaderId || null,
            }),
          })
        );
      }
      trackCanvasDragPerf("drag:end", {
        elementId: latestObj?.id || null,
        tipo: latestObj?.tipo || null,
        isSelected: Boolean(latestSelectionState?.isSelected),
        selectionCount: latestSelectionState?.selectionCount ?? 0,
        finalX: finalNodeX,
        finalY: finalNodeY,
      });
      if (finishResult.shouldRunPersonalizedEnd) {
        latestOnDragEndPersonalizadoRef.current?.(latestObj?.id, {
          pipeline: "group",
          engine: "manual-pointer",
          sessionId: finishResult.sessionId || null,
          leaderId: finishResult.leaderId || latestObj?.id,
        });
      }
      finishDragEndPerf?.({
        branch: "group-manual",
        selectionCount: latestSelectionState?.selectionCount ?? 0,
        isSelected: Boolean(latestSelectionState?.isSelected),
        reason: "group-manual-end",
      });
      endCanvasDragPerfSession({
        elementId: latestObj?.id || null,
        tipo: latestObj?.tipo || null,
        reason: "group-manual-end",
      });
      return finishResult;
    }

    queueTransformerRestoreAfterPredragCancel();
    finishDragEndPerf?.({
      branch: "group-manual-cancel",
      selectionCount: latestSelectionState?.selectionCount ?? 0,
      isSelected: Boolean(latestSelectionState?.isSelected),
      reason,
    });
    endCanvasDragPerfSession({
      elementId: latestObj?.id || null,
      tipo: latestObj?.tipo || null,
      reason: "group-manual-cancel",
    });
    return finishResult;
  }, [
    cancelPendingTransformerRestore,
    cancelManualGroupFinishRetry,
    detachManualGroupWindowListeners,
    hasDragged,
    queueTransformerRestoreAfterPredragCancel,
  ]);

  const attachManualGroupWindowListeners = useCallback((sessionId) => {
    if (typeof window === "undefined") return;
    if (manualGroupListenersRef.current.sessionId === sessionId) return;

    detachManualGroupWindowListeners();

    const handlePointerMove = (nativeEvent) => {
      const session = getAnyGroupDragSession();
      if (!session?.active || session.engine !== "manual-pointer" || session.sessionId !== sessionId) {
        detachManualGroupWindowListeners();
        return;
      }
      if (session.leaderId !== obj.id) return;

      if (!isNativePressStillActive(nativeEvent)) {
        finishManualGroupPointerSession(nativeEvent, "implicit-pointerup", {
          force: true,
        });
        return;
      }

      const updateResult = updateManualGroupDragSession(nativeEvent);
      if (!updateResult?.handled) return;

      if (updateResult.activatedNow && !manualGroupListenersRef.current.startHandled) {
        const latestObj = latestObjRef.current;
        const latestSelectionState = latestSelectionStateRef.current || {};
        manualGroupListenersRef.current.startHandled = true;
        hasDragged.current = true;
        window._dragCount = 0;
        window._lastMouse = null;
        window._lastElement = null;
        const nowMs =
          typeof performance !== "undefined" && typeof performance.now === "function"
            ? performance.now()
            : Date.now();
        dragLifecycleRef.current = {
          lastStartAt: nowMs,
          lastStartId: latestObj?.id || null,
          activeMode: "group-manual",
          activeGroupSessionId: updateResult.sessionId || sessionId,
          leaderId: latestObj?.id || null,
          suppressIndividualUntilMs: 0,
          suppressSelectionUntilMs: nowMs + 120,
        };
        logElementGestureDebug("element:group-manual-start", {
          target: resolveSessionLeaderNode(session) || elementNodeRef.current,
          currentTarget: resolveSessionLeaderNode(session) || elementNodeRef.current,
          evt: nativeEvent,
        }, {
          sessionId: updateResult.sessionId || sessionId,
        });
        startCanvasDragPerfSession({
          elementId: latestObj?.id || null,
          tipo: latestObj?.tipo || null,
          isSelected: Boolean(latestSelectionState?.isSelected),
          selectionCount: latestSelectionState?.selectionCount ?? 0,
        });
        latestOnDragStartPersonalizadoRef.current?.(latestObj?.id, {
          target: resolveSessionLeaderNode(session) || elementNodeRef.current,
          currentTarget: resolveSessionLeaderNode(session) || elementNodeRef.current,
          evt: nativeEvent,
        }, {
          pipeline: "group",
          engine: "manual-pointer",
          sessionId: updateResult.sessionId || sessionId,
          leaderId: latestObj?.id || null,
        });
      }

      if (updateResult.mode === "activated" || updateResult.mode === "preview") {
        if (updateResult.mode === "preview") {
          forwardManualGroupPreviewToDragOverlay(
            session,
            "forward-preview-to-controlled-sync"
          );
        }
        if (nativeEvent?.cancelable) {
          try {
            nativeEvent.preventDefault();
          } catch {}
        }
      }
    };

    const handlePointerEnd = (nativeEvent, reason) => {
      const session = getAnyGroupDragSession();
      if (!session?.active || session.engine !== "manual-pointer" || session.sessionId !== sessionId) {
        detachManualGroupWindowListeners();
        return;
      }
      if (session.leaderId !== obj.id) return;
      finishManualGroupPointerSession(nativeEvent, reason);
    };

    if (hasPointerEvents) {
      const onPointerMoveWindow = (event) => handlePointerMove(event);
      const onPointerUpWindow = (event) => handlePointerEnd(event, "pointerup");
      const onPointerCancelWindow = (event) => handlePointerEnd(event, "pointercancel");
      window.addEventListener("pointermove", onPointerMoveWindow);
      window.addEventListener("pointerup", onPointerUpWindow);
      window.addEventListener("pointercancel", onPointerCancelWindow);
      manualGroupListenersRef.current = {
        sessionId,
        startHandled: false,
        detach: () => {
          window.removeEventListener("pointermove", onPointerMoveWindow);
          window.removeEventListener("pointerup", onPointerUpWindow);
          window.removeEventListener("pointercancel", onPointerCancelWindow);
        },
      };
      return;
    }

    const onMouseMoveWindow = (event) => handlePointerMove(event);
    const onMouseUpWindow = (event) => handlePointerEnd(event, "mouseup");
    const onTouchMoveWindow = (event) => handlePointerMove(event);
    const onTouchEndWindow = (event) => handlePointerEnd(event, "touchend");
    const onTouchCancelWindow = (event) => handlePointerEnd(event, "touchcancel");
    window.addEventListener("mousemove", onMouseMoveWindow);
    window.addEventListener("mouseup", onMouseUpWindow);
    window.addEventListener("touchmove", onTouchMoveWindow, { passive: false });
    window.addEventListener("touchend", onTouchEndWindow);
    window.addEventListener("touchcancel", onTouchCancelWindow);
    manualGroupListenersRef.current = {
      sessionId,
      startHandled: false,
      detach: () => {
        window.removeEventListener("mousemove", onMouseMoveWindow);
        window.removeEventListener("mouseup", onMouseUpWindow);
        window.removeEventListener("touchmove", onTouchMoveWindow);
        window.removeEventListener("touchend", onTouchEndWindow);
        window.removeEventListener("touchcancel", onTouchCancelWindow);
      },
    };
  }, [
    detachManualGroupWindowListeners,
    finishManualGroupPointerSession,
    forwardManualGroupPreviewToDragOverlay,
    hasDragged,
    hasPointerEvents,
    logElementGestureDebug,
  ]);

  const armPredragReleaseListeners = useCallback((event, options = {}) => {
    if (typeof window === "undefined") return;
    const assumeSingleSelection = options?.assumeSingleSelection === true;
    const fastStartSelectAndDrag = options?.fastStartSelectAndDrag === true;
    const manualGroupDragEligible = shouldUseManualGroupDrag();
    if (
      !shouldArmPredragRelease({
        assumeSingleSelection,
        isSelected,
        selectionCount,
        manualGroupDragEligible,
      })
    ) {
      return;
    }

    detachPredragReleaseListeners();

    const node = event?.currentTarget || event?.target || elementNodeRef.current || null;
    if (!node) return;

    const pointerType = resolvePointerType(event?.evt);
    const pressPointerSynced = syncStagePointerFromNativeEvent(node, event?.evt);
    const pressStagePoint = pressPointerSynced ? getStagePointerPoint(node) : null;
    const pressClientPoint = getClientPoint(event?.evt);
    const pressPoint = pressStagePoint || pressClientPoint;
    const pointSpace = pressStagePoint ? "stage" : (pressClientPoint ? "client" : null);
    const pressAtMs =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const fastStartThresholdPx =
      fastStartSelectAndDrag && pressPoint
        ? getSelectAndDragIntentThreshold(pointerType)
        : null;
    selectAndDragFastStartRef.current = {
      active: Boolean(fastStartSelectAndDrag && pressPoint && Number.isFinite(fastStartThresholdPx)),
      pressAtMs,
      pointerType,
      thresholdPx: Number.isFinite(fastStartThresholdPx) ? fastStartThresholdPx : null,
      pointSpace,
      pressPoint,
    };
    const pointerLooksTouchLike = pointerType === "touch" || pointerType === "pen";
    if (fastStartSelectAndDrag && pointerLooksTouchLike) {
      const content = getStageContentNode(node);
      if (content) {
        selectAndDragTouchActionRef.current = {
          active: true,
          content,
          previousTouchAction: content.style.touchAction || "",
        };
        try {
          content.style.touchAction = "none";
        } catch {}
      }
      if (event?.evt?.cancelable) {
        try {
          event.evt.preventDefault();
        } catch {}
      }
    } else {
      restoreSelectAndDragPredragTouchAction(false);
    }

    const selectedPredragVisualThresholdPx =
      !fastStartSelectAndDrag &&
      isSelected &&
      selectionCount === 1 &&
      pressPoint
        ? getSelectAndDragIntentThreshold(pointerType)
        : null;
    let selectedPredragVisualPrimed = false;

    const cancel = (nativeEvent = null, reason = "pointerup") => {
      cancelPendingNativePredrag(nativeEvent, reason, node);
    };

    const maybePrimeSelectedPredragVisual = (nativeEvent = null) => {
      if (
        selectedPredragVisualPrimed ||
        !pressPoint ||
        !Number.isFinite(selectedPredragVisualThresholdPx)
      ) {
        return false;
      }
      if (hasDragged.current) return false;

      const stagePointerSynced = syncStagePointerFromNativeEvent(node, nativeEvent);
      const currentStagePoint = stagePointerSynced ? getStagePointerPoint(node) : null;
      const currentClientPoint = getClientPoint(nativeEvent);
      const currentPoint =
        pointSpace === "stage" && currentStagePoint
          ? currentStagePoint
          : currentClientPoint;
      if (!currentPoint) return false;

      const distancePx = Math.hypot(
        currentPoint.x - pressPoint.x,
        currentPoint.y - pressPoint.y
      );
      if (distancePx < selectedPredragVisualThresholdPx) return false;

      selectedPredragVisualPrimed = true;
      const selectionSnapshot = readRuntimeSelectedIds();

      onPredragVisualSelectionStart?.(
        obj.id,
        selectionSnapshot.length > 0 ? selectionSnapshot : [obj.id],
        {
          predragIntent: "selected-predrag",
        }
      );
      preDetachedSelectionTransformerRef.current = detachSelectionTransformerForNode(node, {
        elementId: obj.id,
        tipo: obj.tipo,
        source: "selected-predrag",
        selectedIds: selectionSnapshot,
        selectionIdentity:
          selectionSnapshot.length > 0 ? selectionSnapshot.join(",") : obj.id,
      });

      logSelectedDragDebug("element:selected-predrag-visual-start", {
        elementId: obj.id,
        tipo: obj.tipo,
        distancePx: Math.round(distancePx * 100) / 100,
        thresholdPx: selectedPredragVisualThresholdPx,
        pointSpace: pointSpace || null,
        pressPoint,
        currentPoint,
        stagePointerSynced,
        detachedTransformer: Boolean(preDetachedSelectionTransformerRef.current),
      });
      logCanvasBoxFlow("selection", "predrag:visual-start", {
        source: "selected-predrag",
        elementId: obj.id,
        tipo: obj.tipo,
        distancePx: Math.round(distancePx * 100) / 100,
        thresholdPx: selectedPredragVisualThresholdPx,
        detachedTransformer: Boolean(preDetachedSelectionTransformerRef.current),
      }, {
        identity: selectionSnapshot.length > 0 ? selectionSnapshot.join(",") : obj.id,
        sessionIdentity: resolveActiveSelectionBoxFlowSessionIdentity(
          selectionSnapshot.length > 0 ? selectionSnapshot.join(",") : obj.id
        ),
        startPayload: {
          selectedIds: selectionSnapshot,
        },
      });
      return true;
    };

    const maybeFastStartDrag = (nativeEvent = null) => {
      const fastStartState = selectAndDragFastStartRef.current || {};
      if (!fastStartState.active || !pressPoint || !Number.isFinite(fastStartThresholdPx)) {
        return false;
      }
      if (hasDragged.current) return false;

      const pointerLooksTouchLike =
        fastStartState.pointerType === "touch" ||
        fastStartState.pointerType === "pen" ||
        Boolean(nativeEvent?.touches || nativeEvent?.changedTouches);
      if (pointerLooksTouchLike && nativeEvent?.cancelable) {
        try {
          nativeEvent.preventDefault();
        } catch {}
      }

      const stagePointerSynced = syncStagePointerFromNativeEvent(node, nativeEvent);
      const currentStagePoint = stagePointerSynced ? getStagePointerPoint(node) : null;
      const currentClientPoint = getClientPoint(nativeEvent);
      const currentPoint =
        fastStartState.pointSpace === "stage" && currentStagePoint
          ? currentStagePoint
          : currentClientPoint;
      if (!currentPoint) return false;

      const distancePx = Math.hypot(
        currentPoint.x - fastStartState.pressPoint.x,
        currentPoint.y - fastStartState.pressPoint.y
      );
      if (distancePx < fastStartThresholdPx) return false;

      const selectionSnapshot = readRuntimeSelectedIds();

      onPredragVisualSelectionStart?.(
        obj.id,
        selectionSnapshot.length > 0 ? selectionSnapshot : [obj.id],
        {
          predragIntent: "same-gesture-select-drag",
        }
      );
      if (!preDetachedSelectionTransformerRef.current) {
        preDetachedSelectionTransformerRef.current = detachSelectionTransformerForNode(node, {
          elementId: obj.id,
          tipo: obj.tipo,
          source: "select-and-drag-predrag",
          selectedIds: selectionSnapshot,
          selectionIdentity:
            selectionSnapshot.length > 0 ? selectionSnapshot.join(",") : obj.id,
        });
      }

      logSelectedDragDebug("element:select-and-drag-predrag-visual-start", {
        elementId: obj.id,
        tipo: obj.tipo,
        distancePx: Math.round(distancePx * 100) / 100,
        thresholdPx: fastStartThresholdPx,
        pointSpace: fastStartState.pointSpace || null,
        pressPoint: fastStartState.pressPoint || null,
        currentPoint,
        stagePointerSynced,
        detachedTransformer: Boolean(preDetachedSelectionTransformerRef.current),
        mirroredSelection: selectionSnapshot,
      });
      logCanvasBoxFlow("selection", "predrag:visual-start", {
        source: "select-and-drag-predrag",
        elementId: obj.id,
        tipo: obj.tipo,
        distancePx: Math.round(distancePx * 100) / 100,
        thresholdPx: fastStartThresholdPx,
        detachedTransformer: Boolean(preDetachedSelectionTransformerRef.current),
      }, {
        identity: selectionSnapshot.length > 0 ? selectionSnapshot.join(",") : obj.id,
        sessionIdentity: resolveActiveSelectionBoxFlowSessionIdentity(
          selectionSnapshot.length > 0 ? selectionSnapshot.join(",") : obj.id
        ),
        startPayload: {
          selectedIds: selectionSnapshot,
        },
      });

      let startedDrag = false;
      try {
        node.draggable?.(true);
      } catch {}
      try {
        node.startDrag?.({ evt: nativeEvent });
        startedDrag =
          typeof node.isDragging === "function" ? Boolean(node.isDragging()) : true;
      } catch {
        startedDrag = false;
      }

      if (!startedDrag) {
        onPredragVisualSelectionCancel?.(obj.id);
        queueTransformerRestoreAfterPredragCancel();
        return false;
      }

      hasDragged.current = true;
      restoreSelectAndDragPredragTouchAction(false);
      selectAndDragFastStartRef.current = {
        active: false,
        pressAtMs: fastStartState.pressAtMs,
        pointerType: fastStartState.pointerType,
        thresholdPx: fastStartState.thresholdPx,
        pointSpace: fastStartState.pointSpace,
        pressPoint: fastStartState.pressPoint,
      };
      logSelectedDragDebug("element:select-and-drag-faststart", {
        elementId: obj.id,
        tipo: obj.tipo,
        pointerType: fastStartState.pointerType || pointerType,
        thresholdPx: fastStartState.thresholdPx,
        distancePx: Math.round(distancePx * 100) / 100,
        pointSpace: fastStartState.pointSpace || null,
        pressPoint: fastStartState.pressPoint || null,
        currentPoint,
        stagePointerSynced,
        touchActionPredragActive: pointerLooksTouchLike,
        pressToFastStartMs: Math.round(
          (
            (
              typeof performance !== "undefined" && typeof performance.now === "function"
                ? performance.now()
                : Date.now()
            ) - Number(fastStartState.pressAtMs || pressAtMs)
          ) * 100
        ) / 100,
      });
      detachPredragReleaseListeners();
      return true;
    };

    if (hasPointerEvents) {
      const onPointerMoveWindow = (nativeEvent) => {
        if (hasDragged.current) {
          detachPredragReleaseListeners();
          return;
        }
        maybePrimeSelectedPredragVisual(nativeEvent);
        if (maybeFastStartDrag(nativeEvent)) {
          return;
        }
        if (!isNativePressStillActive(nativeEvent)) {
          cancel(nativeEvent, "implicit-pointerup");
        }
      };
      const onPointerUpWindow = (nativeEvent) => cancel(nativeEvent, "pointerup");
      const onPointerCancelWindow = (nativeEvent) => cancel(nativeEvent, "pointercancel");
      const onBlurWindow = () => cancel(null, "window-blur");

      window.addEventListener("pointermove", onPointerMoveWindow);
      window.addEventListener("pointerup", onPointerUpWindow);
      window.addEventListener("pointercancel", onPointerCancelWindow);
      window.addEventListener("blur", onBlurWindow);
      predragReleaseListenersRef.current = {
        detach: () => {
          window.removeEventListener("pointermove", onPointerMoveWindow);
          window.removeEventListener("pointerup", onPointerUpWindow);
          window.removeEventListener("pointercancel", onPointerCancelWindow);
          window.removeEventListener("blur", onBlurWindow);
        },
      };
      return;
    }

    const onMouseMoveWindow = (nativeEvent) => {
      if (hasDragged.current) {
        detachPredragReleaseListeners();
        return;
      }
      maybePrimeSelectedPredragVisual(nativeEvent);
      if (maybeFastStartDrag(nativeEvent)) {
        return;
      }
      if (!isNativePressStillActive(nativeEvent)) {
        cancel(nativeEvent, "implicit-mouseup");
      }
    };
    const onMouseUpWindow = (nativeEvent) => cancel(nativeEvent, "mouseup");
    const onTouchMoveWindow = (nativeEvent) => {
      if (hasDragged.current) {
        detachPredragReleaseListeners();
        return;
      }
      maybePrimeSelectedPredragVisual(nativeEvent);
      if (maybeFastStartDrag(nativeEvent)) {
        return;
      }
      if (!isNativePressStillActive(nativeEvent)) {
        cancel(nativeEvent, "implicit-touchend");
      }
    };
    const onTouchEndWindow = (nativeEvent) => cancel(nativeEvent, "touchend");
    const onTouchCancelWindow = (nativeEvent) => cancel(nativeEvent, "touchcancel");
    const onBlurWindow = () => cancel(null, "window-blur");

    window.addEventListener("mousemove", onMouseMoveWindow);
    window.addEventListener("mouseup", onMouseUpWindow);
    window.addEventListener("touchmove", onTouchMoveWindow, { passive: false });
    window.addEventListener("touchend", onTouchEndWindow);
    window.addEventListener("touchcancel", onTouchCancelWindow);
    window.addEventListener("blur", onBlurWindow);
    predragReleaseListenersRef.current = {
      detach: () => {
        window.removeEventListener("mousemove", onMouseMoveWindow);
        window.removeEventListener("mouseup", onMouseUpWindow);
        window.removeEventListener("touchmove", onTouchMoveWindow);
        window.removeEventListener("touchend", onTouchEndWindow);
        window.removeEventListener("touchcancel", onTouchCancelWindow);
        window.removeEventListener("blur", onBlurWindow);
      },
    };
  }, [
    cancelPendingNativePredrag,
    detachPredragReleaseListeners,
    hasDragged,
    hasPointerEvents,
    isSelected,
    onPredragVisualSelectionCancel,
    onPredragVisualSelectionStart,
    obj.id,
    obj.tipo,
    queueTransformerRestoreAfterPredragCancel,
    restoreSelectAndDragPredragTouchAction,
    selectionCount,
    shouldArmPredragRelease,
    shouldUseManualGroupDrag,
  ]);

  const tryArmManualGroupDrag = useCallback((e) => {
    if (!shouldUseManualGroupDrag()) return null;
    const result = armManualGroupDragSession(e, obj);
    if (result?.mode !== "armed") return result;

    const nowMs =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    dragLifecycleRef.current = {
      lastStartAt: nowMs,
      lastStartId: obj.id,
      activeMode: "group-manual-armed",
      activeGroupSessionId: result.sessionId || null,
      leaderId: obj.id,
      suppressIndividualUntilMs: 0,
      suppressSelectionUntilMs: 0,
    };
    e?.currentTarget?.draggable?.(false);
    attachManualGroupWindowListeners(result.sessionId);
    return result;
  }, [
    attachManualGroupWindowListeners,
    obj,
    shouldUseManualGroupDrag,
  ]);

  useEffect(() => {
    manualGroupRuntimeRef.current.finishPointerSession = finishManualGroupPointerSession;
    manualGroupRuntimeRef.current.detachWindowListeners = detachManualGroupWindowListeners;
  }, [detachManualGroupWindowListeners, finishManualGroupPointerSession]);

  useEffect(() => () => {
    const session = getAnyGroupDragSession();
    const runtime = manualGroupRuntimeRef.current;
    if (session?.active && session.engine === "manual-pointer" && session.leaderId === obj.id) {
      runtime.finishPointerSession?.(null, "leader-unmount");
      return;
    }
    cancelManualGroupFinishRetry();
    detachPredragReleaseListeners();
    restoreSelectAndDragPredragTouchAction(false);
    runtime.detachWindowListeners?.();
  }, [cancelManualGroupFinishRetry, detachPredragReleaseListeners, obj.id, restoreSelectAndDragPredragTouchAction]);

  const prepareSelectedElementForPossibleDrag = useCallback((e, options = {}) => {
    const assumeSingleSelection = options?.assumeSingleSelection === true;
    const fastStartSelectAndDrag = options?.fastStartSelectAndDrag === true;
    if (
      !shouldArmPredragRelease({
        assumeSingleSelection,
        isSelected,
        selectionCount,
        manualGroupDragEligible: false,
      })
    ) {
      return;
    }

    const node = e?.currentTarget || e?.target || elementNodeRef.current;
    if (!node) return;

    cancelPendingTransformerRestore();
    // Keep the visible selection frame on press; detach only when drag truly starts.
    preDetachedSelectionTransformerRef.current = false;
    armPredragReleaseListeners(e, {
      assumeSingleSelection,
      fastStartSelectAndDrag,
    });
  }, [
    armPredragReleaseListeners,
    cancelPendingTransformerRestore,
    isSelected,
    selectionCount,
    shouldArmPredragRelease,
  ]);



  // Ã¢Å“â€¦ Click con estado fresco (evita stale closures del useMemo)
  const emitSelectionGesture = useCallback((gesture, e) => {
    if (!onSelect) return;

    e && (e.cancelBubble = true);
    e?.evt && (e.evt.cancelBubble = true);

    const nowMs =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const suppressNativeClickUntilMs = Number(
      selectedTextPrimaryReleaseRef.current?.suppressNativeClickUntilMs || 0
    );
    const gestureDispatchDecision = decideSelectionGestureDispatch({
      gesture,
      suppressNativeClickUntilActive:
        gesture === "primary" && suppressNativeClickUntilMs > nowMs,
      pressSelectionGuardConsumed:
        gesture === "primary" ? consumePrimarySelectionClickGuard() : false,
      selectionGestureSuppressed: shouldSuppressSelectionGesture(),
      hasDragged: Boolean(hasDragged.current),
    });

    if (!gestureDispatchDecision.shouldEmit) {
      if (gestureDispatchDecision.reason === "manual-release-inline") {
        selectedTextPrimaryReleaseRef.current = {
          armed: false,
          suppressNativeClickUntilMs: 0,
        };
        logInlineIntentEmitter("skip-due-manual-release-inline", {
          id: obj.id,
          tipo: obj.tipo,
          gesture,
        });
      } else if (gestureDispatchDecision.reason === "press-selection-guard") {
        logInlineIntentEmitter("skip-due-press-selection-guard", {
          id: obj.id,
          tipo: obj.tipo,
          gesture,
        });
      } else if (
        gestureDispatchDecision.reason === "selection-gesture-suppressed"
      ) {
        logInlineIntentEmitter("skip-due-manual-group-session", {
          id: obj.id,
          tipo: obj.tipo,
          gesture,
        });
      } else if (gestureDispatchDecision.reason === "drag-active") {
        logInlineIntentEmitter("skip-due-drag", {
          id: obj.id,
          tipo: obj.tipo,
          gesture,
        });
      }
      return;
    }

    logInlineIntentEmitter("emit-gesture", {
      id: obj.id,
      tipo: obj.tipo,
      gesture,
      shift: Boolean(e?.evt?.shiftKey),
      ctrl: Boolean(e?.evt?.ctrlKey),
      meta: Boolean(e?.evt?.metaKey),
    });
    logElementGestureDebug("element:selection-gesture", e, {
      gesture,
      shift: Boolean(e?.evt?.shiftKey),
      ctrl: Boolean(e?.evt?.ctrlKey),
      meta: Boolean(e?.evt?.metaKey),
    });

    onSelect(obj.id, obj, e, { gesture });
  }, [
    consumePrimarySelectionClickGuard,
    decideSelectionGestureDispatch,
    hasDragged,
    logElementGestureDebug,
    obj,
    onSelect,
    shouldSuppressSelectionGesture,
  ]);

  const maybeEmitSelectedTextPrimaryOnRelease = useCallback((event) => {
    const current = selectedTextPrimaryReleaseRef.current || {};
    if (!current.armed || hasDragged.current) {
      selectedTextPrimaryReleaseRef.current = {
        armed: false,
        suppressNativeClickUntilMs: Number(current.suppressNativeClickUntilMs || 0),
      };
      return false;
    }

    emitSelectionGesture("primary", event);
    const releaseNowMs =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    selectedTextPrimaryReleaseRef.current = {
      armed: false,
      suppressNativeClickUntilMs: releaseNowMs + 250,
    };
    logInlineIntentEmitter("emit-primary-from-release", {
      id: obj.id,
      tipo: obj.tipo,
    });
    return true;
  }, [
    emitSelectionGesture,
    hasDragged,
    obj.id,
    obj.tipo,
  ]);

  const handlePressStart = useCallback((event, source = "pointerdown") => {
    event.cancelBubble = true;
    if (isActiveGroupFollowerInteractionSuppressed()) {
      event.currentTarget?.draggable?.(false);
      event.currentTarget?.listening?.(false);
      return;
    }

    hasDragged.current = false;
    logElementGestureDebug(`element:${source}`, event);
    if (inlineEditPointerActive) {
      onInlineEditPointer(event, obj);
      return;
    }

    const manualGroupResult = tryArmManualGroupDrag(event);
    if (manualGroupResult?.handled) {
      return;
    }

    armSelectedTextPrimaryOnRelease(event, source);
    const pressSelectionResult = maybeSelectElementOnPress(event);

    event.currentTarget?.draggable(resolveInteractionDraggableEnabled());
    event.currentTarget?.listening?.(resolveInteractionListeningEnabled());
    prepareSelectedElementForPossibleDrag(event, {
      assumeSingleSelection: pressSelectionResult?.allowSameGestureDrag === true,
      fastStartSelectAndDrag: pressSelectionResult?.allowSameGestureDrag === true,
    });
  }, [
    armSelectedTextPrimaryOnRelease,
    hasDragged,
    inlineEditPointerActive,
    isActiveGroupFollowerInteractionSuppressed,
    logElementGestureDebug,
    maybeSelectElementOnPress,
    obj,
    onInlineEditPointer,
    prepareSelectedElementForPossibleDrag,
    resolveInteractionDraggableEnabled,
    resolveInteractionListeningEnabled,
    tryArmManualGroupDrag,
  ]);

  const handlePressEnd = useCallback((event, reason = "pointerup") => {
    const dragLifecycle = dragLifecycleRef.current || {};
    if (
      isActiveGroupFollowerInteractionSuppressed() ||
      isManualGroupDragMemberLocked(obj.id) ||
      String(dragLifecycle.activeMode || "").startsWith("group-manual")
    ) {
      syncInteractionDraggableState(event.currentTarget);
      return;
    }
    if (!hasDragged.current) {
      logElementGestureDebug(`element:${reason}`, event);
      cancelPendingNativePredrag(event?.evt || null, reason, event.currentTarget);
      maybeEmitSelectedTextPrimaryOnRelease(event);
    }
  }, [
    cancelPendingNativePredrag,
    hasDragged,
    isActiveGroupFollowerInteractionSuppressed,
    logElementGestureDebug,
    maybeEmitSelectedTextPrimaryOnRelease,
    obj.id,
    syncInteractionDraggableState,
  ]);

  const handleClick = useCallback(
    (e) => {
      emitSelectionGesture("primary", e);
    },
    [emitSelectionGesture]
  );

  const handleDoubleClick = useCallback(
    (e) => {
      emitSelectionGesture("double", e);
    },
    [emitSelectionGesture]
  );

  const resolveRootDelegatedEvent = useCallback((event) => {
    const rootNode = elementNodeRef.current;
    if (!event || !rootNode || event.currentTarget === rootNode) {
      return event;
    }

    return {
      ...event,
      currentTarget: rootNode,
    };
  }, []);

  const handleNestedHitboxPressStart = useCallback((event, source = "pointerdown") => {
    handlePressStart(resolveRootDelegatedEvent(event), source);
  }, [handlePressStart, resolveRootDelegatedEvent]);

  const manualGroupPreviewPose = getManualGroupDragPreviewPose(obj.id);
  const manualGroupPreviewSignature = manualGroupPreviewPose?.signature || "";
  const visualRenderObject = obj.tipo === "imagen" ? renderImageObject : obj;


  // Ã°Å¸â€Â¥ MEMOIZAR PROPIEDADES COMUNES
  const commonProps = useMemo(() => ({
    x: manualGroupPreviewPose?.x ?? (visualRenderObject.x ?? 0),
    y: manualGroupPreviewPose?.y ?? (visualRenderObject.y ?? 0),
    rotation: visualRenderObject.rotation || 0,
    scaleX: visualRenderObject.scaleX || 1,
    scaleY: visualRenderObject.scaleY || 1,
    draggable: resolveInteractionDraggableEnabled(),
    listening: resolveInteractionListeningEnabled(),

    onMouseDown: !hasPointerEvents
      ? (e) => handlePressStart(e, "mousedown")
      : undefined,

    onTouchStart: !hasPointerEvents
      ? (e) => handlePressStart(e, "touchstart")
      : undefined,

    onPointerDown: (e) => {
      handlePressStart(e, "pointerdown");
    },

    onMouseUp: !hasPointerEvents
      ? (e) => handlePressEnd(e, "mouseup")
      : undefined,

    onTouchEnd: !hasPointerEvents
      ? (e) => handlePressEnd(e, "touchend")
      : undefined,

    onPointerUp: (e) => {
      handlePressEnd(e, "pointerup");
    },

    onClick: handleClick,
    onTap: handleClick,
    onDblClick: handleDoubleClick,
    onDblTap: handleDoubleClick,

    onDragStart: (e) => {
      detachPredragReleaseListeners();
      const manualSession = getAnyGroupDragSession();
      if (
        manualSession?.active &&
        manualSession.engine === "manual-pointer" &&
        Array.isArray(manualSession.elementIds) &&
        manualSession.elementIds.includes(obj.id)
      ) {
        try {
          if (typeof e?.target?.isDragging === "function" && e.target.isDragging()) {
            e.target.stopDrag?.();
          }
        } catch {}
        logElementGestureDebug("drag:group:native-drag-blocked", e, {
          sessionId: manualSession.sessionId || null,
          leaderId: manualSession.leaderId || null,
          phase: manualSession.phase || null,
        });
        return;
      }

      const nowMs =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
      const dragLifecycle = dragLifecycleRef.current || {};
      const lastDragStart = dragLifecycle;
      const isDuplicateDragStart =
        lastDragStart.lastStartId === obj.id &&
        nowMs - Number(lastDragStart.lastStartAt || 0) < 80;

      if (isDuplicateDragStart) {
        logElementGestureDebug("element:dragstart-duplicate-ignored", e, {
          elapsedSinceLastStartMs: Math.round(
            nowMs - Number(lastDragStart.lastStartAt || 0)
          ),
        });
        trackCanvasDragPerf("drag:start-duplicate-ignored", {
          elementId: obj.id,
          tipo: obj.tipo,
          elapsedSinceLastStartMs: Math.round(nowMs - Number(lastDragStart.lastStartAt || 0)),
        }, {
          throttleMs: 120,
          throttleKey: `drag:start-duplicate-ignored:${obj.id}`,
        });
        return;
      }

      const dragNode = e?.target || e?.currentTarget || elementNodeRef.current;
      const shouldBlockNativeGroupStart =
        shouldUseManualGroupDrag() ||
        dragLifecycle.activeMode === "group-manual-armed" ||
        dragLifecycle.activeMode === "group-manual";

      if (shouldBlockNativeGroupStart) {
        try {
          dragNode?.stopDrag?.();
        } catch {}
        syncInteractionDraggableState(dragNode);
        logElementGestureDebug("drag:group:native-start-blocked", e, {
          reason: "manual-group-eligible",
          activeMode: dragLifecycle.activeMode || "idle",
        });
        return;
      }

      const groupDragResult = startDragGrupalLider(e, obj);
      if (groupDragResult.mode === "follower-ignored") {
        ignoreActiveGroupFollowerDragStart(e, groupDragResult);
        return;
      }
      if (groupDragResult.mode === "duplicate-leader-ignored") {
        return;
      }

      const startedGroupDrag = groupDragResult.mode === "started";
      if (!startedGroupDrag && shouldSuppressIndividualPipeline(obj.id, nowMs)) {
        logElementGestureDebug("element:dragstart-individual-suppressed", e, {
          suppressUntilMs: Number(dragLifecycleRef.current?.suppressIndividualUntilMs || 0),
          recentGroupGuard: shouldSuppressIndividualDragForElement(obj.id),
        });
        return;
      }

      dragLifecycleRef.current = {
        lastStartAt: nowMs,
        lastStartId: obj.id,
        activeMode: startedGroupDrag ? "group" : "individual",
        activeGroupSessionId: startedGroupDrag ? groupDragResult.sessionId || null : null,
        leaderId: startedGroupDrag ? groupDragResult.leaderId || obj.id : null,
        suppressIndividualUntilMs: 0,
        suppressSelectionUntilMs: 0,
      };
      cancelPendingTransformerRestore();
      restoreSelectAndDragPredragTouchAction(false);
      logInlineIntentEmitter("selected-text-release-clear-on-dragstart", {
        id: obj.id,
        tipo: obj.tipo,
        wasArmed: Boolean(selectedTextPrimaryReleaseRef.current?.armed),
      });
      selectedTextPrimaryReleaseRef.current = {
        armed: false,
        suppressNativeClickUntilMs: 0,
      };
      logElementGestureDebug("element:dragstart", e);
      const fastStartState = selectAndDragFastStartRef.current || {};
      const pressToDragStartMs =
        Number.isFinite(Number(fastStartState.pressAtMs)) && Number(fastStartState.pressAtMs) > 0
          ? Math.round((nowMs - Number(fastStartState.pressAtMs)) * 100) / 100
          : null;

      startCanvasDragPerfSession({
        elementId: obj.id,
        tipo: obj.tipo,
        isSelected,
        selectionCount,
      });
      const finishDragStartPerf = startCanvasDragPerfSpan("drag:handler-start", {
        elementId: obj.id,
        tipo: obj.tipo,
      }, {
        throttleMs: 60,
        throttleKey: `drag:handler-start:${obj.id}`,
      });
      const dragPipelineMeta = startedGroupDrag
        ? {
            pipeline: "group",
            sessionId: groupDragResult.sessionId || null,
            leaderId: groupDragResult.leaderId || obj.id,
          }
        : {
            pipeline: "individual",
            sessionId: null,
            leaderId: null,
          };
      onDragStartPersonalizado?.(obj.id, e, dragPipelineMeta);
      trackCanvasDragPerf("drag:start", {
        elementId: obj.id,
        tipo: obj.tipo,
        isSelected,
        selectionCount,
        selectAndDragFastStartActive: Boolean(fastStartState.pressAtMs),
        selectAndDragPointerType: fastStartState.pointerType || null,
        selectAndDragThresholdPx: fastStartState.thresholdPx,
        pressToDragStartMs,
        x: typeof dragNode?.x === "function" ? dragNode.x() : obj.x ?? 0,
        y: typeof dragNode?.y === "function" ? dragNode.y() : obj.y ?? 0,
        width: obj.width ?? null,
        height: obj.height ?? null,
        scaleX: obj.scaleX ?? 1,
        scaleY: obj.scaleY ?? 1,
        rotation: obj.rotation ?? 0,
      });

      if (!startedGroupDrag && obj.tipo === "imagen" && img && imageCropData) {
        const imageDragNode = dragNode || elementNodeRef.current;

        if (preDetachedSelectionTransformerRef.current) {
          preDetachedSelectionTransformerRef.current = false;
          trackCanvasDragPerf("transformer:predetach-reused", {
            elementId: obj.id,
            tipo: obj.tipo,
          }, {
            throttleMs: 60,
            throttleKey: `transformer:predetach-reused:${obj.id}`,
          });
        } else {
          detachSelectionTransformerForNode(imageDragNode, {
            elementId: obj.id,
            tipo: obj.tipo,
            source: "image-drag-start",
            selectionIdentity: obj.id,
            selectedIds: [obj.id],
          });
        }

        liftNodeToOverlayLayer(imageDragNode, dragLayerRef, {
          elementId: obj.id,
          tipo: obj.tipo,
        }, {
          eventPrefix: "image:drag-layer",
        });
        const imageDragPayload = buildImagePerfPayload(
          obj,
          img,
          imageCropData,
          imageDragNode
        );
        activateImageLayerPerf(imageDragNode, imageDragPayload);
        trackCanvasDragPerf("image:drag-profile-start", imageDragPayload, {
          throttleMs: 60,
          throttleKey: `image:drag-profile-start:${obj.id}`,
        });
      }

      window._dragCount = 0;
      window._lastMouse = null;
      window._lastElement = null;

      hasDragged.current = true;
      if (!startedGroupDrag) {
        window._isDragging = true;
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent(EDITOR_BRIDGE_EVENTS.DRAGGING_START, {
              detail: buildEditorDragLifecycleDetail({
                id: obj.id,
                tipo: obj.tipo || null,
              }),
            })
          );
        }
        startDragIndividual(e, dragStartPos);
      }
      selectAndDragFastStartRef.current = {
        active: false,
        pressAtMs: 0,
        pointerType: null,
        thresholdPx: null,
        pointSpace: null,
        pressPoint: null,
      };
      finishDragStartPerf?.({
        branch: startedGroupDrag ? "group" : "individual",
        selectionCount,
        isSelected,
        imageDragPerfActive:
          !startedGroupDrag && obj.tipo === "imagen" && img && imageCropData
            ? true
            : false,
      });
    },


    onDragMove: (e) => {
      const manualSession = getAnyGroupDragSession();
      if (
        manualSession?.active &&
        manualSession.engine === "manual-pointer" &&
        Array.isArray(manualSession.elementIds) &&
        manualSession.elementIds.includes(obj.id)
      ) {
        return;
      }

      hasDragged.current = true;
      const dragLifecycle = dragLifecycleRef.current || {};
      const finishDragMovePerf = startCanvasDragPerfSpan("drag:handler-move", {
        elementId: obj.id,
        tipo: obj.tipo,
      }, {
        throttleMs: 120,
        throttleKey: `drag:handler-move:${obj.id}`,
      });

      const stage = e.target.getStage();
      const mousePos = stage.getPointerPosition();
      const elementPos = { x: e.target.x(), y: e.target.y() };
      const prevMousePos = window._lastMouse;
      const prevElementPos = window._lastElement;

      window._lastMouse = mousePos;
      window._lastElement = elementPos;
      trackCanvasDragPerf("drag:move", {
        elementId: obj.id,
        tipo: obj.tipo,
        isSelected,
        selectionCount,
        groupLeader: window._grupoLider || null,
        pointerX: mousePos?.x ?? null,
        pointerY: mousePos?.y ?? null,
        elementX: elementPos.x,
        elementY: elementPos.y,
        pointerDx:
          mousePos && prevMousePos
            ? Number(mousePos.x) - Number(prevMousePos.x)
            : null,
        pointerDy:
          mousePos && prevMousePos
            ? Number(mousePos.y) - Number(prevMousePos.y)
            : null,
        elementDx:
          prevElementPos
            ? Number(elementPos.x) - Number(prevElementPos.x)
            : null,
        elementDy:
          prevElementPos
            ? Number(elementPos.y) - Number(prevElementPos.y)
            : null,
      }, {
        throttleMs: 120,
        throttleKey: `drag:move:${obj.id}`,
      });

      if (dragLifecycle.activeMode === "group" && dragLifecycle.leaderId === obj.id) {
        previewDragGrupal(e, obj, onChange);
        onDragMovePersonalizado?.(
          { x: e.target.x(), y: e.target.y() },
          obj.id,
          {
            pipeline: "group",
            sessionId: dragLifecycle.activeGroupSessionId || null,
            leaderId: dragLifecycle.leaderId || obj.id,
          }
        );
        finishDragMovePerf?.({
          branch: "group-leader",
          selectionCount,
          isSelected,
        });

        return;
      }

      if (dragLifecycle.activeMode === "group") {
        const elementosSeleccionados = readRuntimeSelectedIds();
        if (elementosSeleccionados.includes(obj.id) && obj.id !== dragLifecycle.leaderId) {
          finishDragMovePerf?.({
            branch: "group-follower-skip",
            selectionCount,
            isSelected,
          });
          return;
        }
      }

      if (shouldSuppressIndividualPipeline(obj.id)) {
        finishDragMovePerf?.({
          branch: "individual-suppressed",
          selectionCount,
          isSelected,
        });
        return;
      }

      previewDragIndividual(e, obj, onDragMovePersonalizado, {
        pipeline: "individual",
        sessionId: null,
        leaderId: null,
      });
      finishDragMovePerf?.({
        branch: "individual",
        selectionCount,
        isSelected,
      });
    },




    onDragEnd: (e) => {
      detachPredragReleaseListeners();
      const manualSession = getAnyGroupDragSession();
      if (
        manualSession?.active &&
        manualSession.engine === "manual-pointer" &&
        Array.isArray(manualSession.elementIds) &&
        manualSession.elementIds.includes(obj.id)
      ) {
        logElementGestureDebug("drag:group:native-drag-blocked", e, {
          sessionId: manualSession.sessionId || null,
          leaderId: manualSession.leaderId || null,
          phase: manualSession.phase || null,
          reason: "native-dragend-ignored",
        });
        return;
      }

      const dragLifecycle = dragLifecycleRef.current || {};
      logElementGestureDebug("element:dragend", e, {
        wasDragging: Boolean(window._isDragging),
        dragMode: dragLifecycle.activeMode || "idle",
      });
      const finishDragEndPerf = startCanvasDragPerfSpan("drag:handler-end", {
        elementId: obj.id,
        tipo: obj.tipo,
      }, {
        throttleMs: 60,
        throttleKey: `drag:handler-end:${obj.id}`,
      });
      const groupDragResult = endDragGrupal(e, obj, onChange, hasDragged);

      if (groupDragResult.role === "follower") {
        finishDragEndPerf?.({
          branch: "group-follower-ignored",
          selectionCount,
          isSelected,
          reason: "group-follower-end-ignored",
        });
        return;
      }

      if (groupDragResult.role === "leader" && groupDragResult.completed) {
        notePostDragSelectionGuard();
        window._isDragging = false;
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
        cancelPendingTransformerRestore();
        preDetachedSelectionTransformerRef.current = false;
        const nowMs =
          typeof performance !== "undefined" && typeof performance.now === "function"
            ? performance.now()
            : Date.now();
        dragLifecycleRef.current = {
          lastStartAt: nowMs,
          lastStartId: obj.id,
          activeMode: "idle",
          activeGroupSessionId: null,
          leaderId: null,
          suppressIndividualUntilMs: nowMs + 120,
          suppressSelectionUntilMs: nowMs + 120,
        };
        trackCanvasDragPerf("drag:end", {
          elementId: obj.id,
          tipo: obj.tipo,
          isSelected,
          selectionCount,
          finalX: typeof e?.currentTarget?.x === "function" ? e.currentTarget.x() : obj.x ?? 0,
          finalY: typeof e?.currentTarget?.y === "function" ? e.currentTarget.y() : obj.y ?? 0,
        });
        if (groupDragResult.shouldRunPersonalizedEnd) {
          onDragEndPersonalizado?.(obj.id, {
            pipeline: "group",
            sessionId: groupDragResult.sessionId || null,
            leaderId: groupDragResult.leaderId || obj.id,
          });
        }
        finishDragEndPerf?.({
          branch: "group",
          selectionCount,
          isSelected,
          reason: "group-drag-end",
        });
        endCanvasDragPerfSession({
          elementId: obj.id,
          tipo: obj.tipo,
          reason: "group-drag-end",
        });
        return;
      }

      if (dragLifecycle.activeMode === "group") {
        const nowMs =
          typeof performance !== "undefined" && typeof performance.now === "function"
            ? performance.now()
            : Date.now();
        dragLifecycleRef.current = {
          lastStartAt: nowMs,
          lastStartId: obj.id,
          activeMode: "idle",
          activeGroupSessionId: null,
          leaderId: null,
          suppressIndividualUntilMs: nowMs + 120,
          suppressSelectionUntilMs: nowMs + 120,
        };
        finishDragEndPerf?.({
          branch: "group-suppressed-fallback",
          selectionCount,
          isSelected,
          reason: groupDragResult.mode || "group-session-missing",
        });
        endCanvasDragPerfSession({
          elementId: obj.id,
          tipo: obj.tipo,
          reason: "group-drag-fallback-suppressed",
        });
        return;
      }

      notePostDragSelectionGuard();

      window._isDragging = false;
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(EDITOR_BRIDGE_EVENTS.DRAGGING_END, {
            detail: buildEditorDragLifecycleDetail({
              id: obj.id,
              tipo: obj.tipo || null,
            }),
          })
        );
      }
      cancelPendingTransformerRestore();
      preDetachedSelectionTransformerRef.current = false;
      dragLifecycleRef.current = {
        lastStartAt: 0,
        lastStartId: null,
        activeMode: "idle",
        activeGroupSessionId: null,
        leaderId: null,
        suppressIndividualUntilMs: 0,
        suppressSelectionUntilMs: 0,
      };
      trackCanvasDragPerf("drag:end", {
        elementId: obj.id,
        tipo: obj.tipo,
        isSelected,
        selectionCount,
        finalX: typeof e?.currentTarget?.x === "function" ? e.currentTarget.x() : obj.x ?? 0,
        finalY: typeof e?.currentTarget?.y === "function" ? e.currentTarget.y() : obj.y ?? 0,
      });

      if (obj.tipo === "imagen") {
        deactivateImageLayerPerf(e?.currentTarget || elementNodeRef.current, obj.id);
      }

      const node = e.currentTarget;
      if (obj.tipo === "imagen") {
        restoreNodeFromOverlayLayer(node, obj.id, {
          eventPrefix: "image:drag-layer",
        });
      }

      // Ã°Å¸â€â€ž DRAG INDIVIDUAL (no cambiÃƒÂ³)
      endDragIndividual(
        obj,
        node,
        onChange,
        onDragEndPersonalizado,
        hasDragged,
        {
          pipeline: "individual",
          sessionId: null,
          leaderId: null,
        }
      );
      finishDragEndPerf?.({
        branch: "individual",
        selectionCount,
        isSelected,
        reason: "drag-end",
      });
      endCanvasDragPerfSession({
        elementId: obj.id,
        tipo: obj.tipo,
        reason: "drag-end",
      });


    },


  }), [
    obj,
    visualRenderObject,
    editingMode,
    inlineEditPointerActive,
    isInEditMode,
    handleClick,
    handleDoubleClick,
    isActiveGroupFollowerInteractionSuppressed,
    logElementGestureDebug,
    armSelectedTextPrimaryOnRelease,
    maybeEmitSelectedTextPrimaryOnRelease,
    maybeSelectElementOnPress,
    resolveInteractionDraggableEnabled,
    resolveInteractionListeningEnabled,
    syncInteractionDraggableState,
    onInlineEditPointer,
    onDragMovePersonalizado,
    onDragStartPersonalizado,
    onDragEndPersonalizado,
    dragStartPos,
    hasDragged,
    hasPointerEvents,
    imageCropData,
    img,
    isSelected,
    selectionCount,
    handlePressEnd,
    handlePressStart,
    dragLayerRef,
    onChange,
    onHover,
    cancelPendingTransformerRestore,
    cancelPendingNativePredrag,
    detachPredragReleaseListeners,
    ignoreActiveGroupFollowerDragStart,
    queueTransformerRestoreAfterPredragCancel,
    prepareSelectedElementForPossibleDrag,
    shouldSuppressIndividualPipeline,
    tryArmManualGroupDrag,
    shouldUseManualGroupDrag,
    manualGroupPreviewSignature,
  ]);

  // Ã°Å¸â€Â¥ MEMOIZAR HANDLERS HOVER
  const handleMouseEnter = useCallback(() => {
    if (!onHover || window._isDragging || isInEditMode) return;
    onHover(obj.id, {
      source: "element-enter",
      targetType: obj.tipo || null,
    });
  }, [onHover, obj.id, isInEditMode, obj.tipo]);


  const handleMouseLeave = useCallback(() => {
    if (!onHover || window._isDragging || isInEditMode) return;
    onHover(null, {
      source: "element-leave",
      targetType: obj.tipo || null,
    });
  }, [onHover, isInEditMode, obj.tipo]);

  const recalcGroupAlign = useCallback(() => {
    if (obj.tipo !== "texto") return;
    if (!obj.__groupAlign || !obj.__groupId) return;
    if (typeof window === "undefined" || typeof onChange !== "function") return;

    const refs = getWindowElementRefs() || {};
    const getObj = getWindowObjectResolver() || (() => null);

    let maxW = 0;
    let thisW = 0;

    for (const [id, node] of Object.entries(refs)) {
      const o = getObj(id);
      if (!o || o.tipo !== "texto" || o.__groupId !== obj.__groupId) continue;
      const textNode = resolveTextMeasureNode(node);
      const w = textNode?.getTextWidth ? Math.ceil(textNode.getTextWidth()) : 0;
      if (id === obj.id) thisW = w;
      if (w > maxW) maxW = w;
    }
    if (!maxW || !thisW) return;

    const baseX = Number.isFinite(obj.__groupOriginX) ? obj.__groupOriginX : (obj.x || 0);
    let targetX = baseX;
    if (obj.__groupAlign === "center") {
      targetX = baseX + (maxW - thisW) / 2;
    } else if (obj.__groupAlign === "right") {
      targetX = baseX + (maxW - thisW);
    }

    if (Math.abs((obj.x || 0) - targetX) > 0.5) {
      onChange(obj.id, { x: targetX });
    }
  }, [obj.id, obj.x, obj.tipo, obj.__groupAlign, obj.__groupId, obj.__groupOriginX, onChange]);




  useEffect(() => {
    // Recalcular cuando este texto cambia y tras montar sus vecinos
    let r1, r2;
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => {
        recalcGroupAlign();
      });
    });
    return () => {
      if (r1) cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recalcGroupAlign, obj.texto, obj.fontFamily, obj.fontSize, obj.fontStyle, obj.fontWeight]);




  useEffect(() => {
    if (!obj || obj.tipo !== "texto") return;
    if (obj.__groupAlign) return;

    const isAutoWidth = shouldPreserveTextCenterPosition(obj);
    if (!isAutoWidth) return;

    let raf1 = null;
    let raf2 = null;

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const node = textNodeRef.current;
        if (!node || typeof node.getTextWidth !== "function") return;

        const wReal = Math.ceil(node.getTextWidth() || 0);
        if (wReal > 0) setMeasuredTextWidth(wReal);
      });
    });

    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [
    obj?.id,
    obj?.texto,
    obj?.fontFamily,
    obj?.fontSize,
    obj?.fontStyle,
    obj?.fontWeight,
    obj?.lineHeight,
    obj?.width,
    obj?.__autoWidth,
    obj?.__groupAlign,
  ]);

  useEffect(() => {
    if (!obj || obj.tipo !== "texto") return;
    if (typeof window === "undefined") return;

    const remeasure = () => {
      const node = textNodeRef.current;
      if (!node || typeof node.getTextWidth !== "function") return;
      const wReal = Math.ceil(node.getTextWidth() || 0);
      if (wReal > 0) setMeasuredTextWidth(wReal);
    };

    remeasure();
    window.addEventListener("fonts-loaded", remeasure);
    return () => {
      window.removeEventListener("fonts-loaded", remeasure);
    };
  }, [
    obj?.id,
    obj?.tipo,
    obj?.texto,
    obj?.fontFamily,
    obj?.fontSize,
    obj?.fontStyle,
    obj?.fontWeight,
    obj?.lineHeight,
    obj?.letterSpacing,
  ]);



  useEffect(() => {
    setMeasuredTextWidth(null);
    setDebugTextClientRect(null);
    // tambiÃƒÂ©n conviene resetear el layout base cuando cambia de texto
    if (obj?.tipo === "texto") baseTextLayoutRef.current = null;
  }, [obj?.id]);

  useEffect(() => {
    if (!obj || obj.tipo !== "texto") {
      setDebugTextClientRect(null);
      return;
    }
    if (!isInlineCanvasTextDebugEnabled()) {
      setDebugTextClientRect(null);
      return;
    }
    if (typeof window === "undefined") return;

    let raf1 = null;
    let raf2 = null;

    const measureClientRect = () => {
      const node = textNodeRef.current;
      if (!node || typeof node.getClientRect !== "function") {
        setDebugTextClientRect(null);
        return;
      }
      try {
        const stage = node.getStage?.() || null;
        const rect = node.getClientRect({
          relativeTo: stage || undefined,
          skipTransform: false,
          skipShadow: true,
          skipStroke: true,
        });
        if (
          rect &&
          Number.isFinite(rect.x) &&
          Number.isFinite(rect.y) &&
          Number.isFinite(rect.width) &&
          Number.isFinite(rect.height)
        ) {
          setDebugTextClientRect({
            x: Number(rect.x),
            y: Number(rect.y),
            width: Math.max(0, Number(rect.width)),
            height: Math.max(0, Number(rect.height)),
          });
          return;
        }
      } catch {
        // no-op
      }
      setDebugTextClientRect(null);
    };

    raf1 = requestAnimationFrame(() => {
      measureClientRect();
      raf2 = requestAnimationFrame(measureClientRect);
    });

    window.addEventListener("fonts-loaded", measureClientRect);
    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      window.removeEventListener("fonts-loaded", measureClientRect);
    };
  }, [
    obj?.id,
    obj?.tipo,
    obj?.texto,
    obj?.x,
    obj?.y,
    obj?.rotation,
    obj?.scaleX,
    obj?.scaleY,
    obj?.fontFamily,
    obj?.fontSize,
    obj?.fontStyle,
    obj?.fontWeight,
    obj?.lineHeight,
    obj?.letterSpacing,
    obj?.width,
    measuredTextWidth,
    editingId,
    inlineOverlayMountedId,
  ]);



  const groupRef = useRef(null);

  useEffect(() => {
    // Cachear cuando cambie el color
    if (groupRef.current && obj.tipo === "icono" && obj.color && obj.color !== "#000000") {
      groupRef.current.cache();
      groupRef.current.getLayer()?.batchDraw();
    }
  }, [obj.color, obj.id]);


  // Convierte "minX minY width height" -> nÃƒÂºmeros
  function parseViewBox(vb) {
    if (!vb || typeof vb !== "string") return null;
    const parts = vb.trim().split(/\s+/).map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
    const [minX, minY, vbWidth, vbHeight] = parts;
    return { minX, minY, vbWidth, vbHeight };
  }


  if (obj.tipo === "forma" && obj.figura === "line") {
    let linePoints = obj.points;
    let pointsFixed = false;

    if (!linePoints || !Array.isArray(linePoints) || linePoints.length < 4) {
      linePoints = [0, 0, LINE_CONSTANTS.DEFAULT_LENGTH, 0]; // Usar constante
      pointsFixed = true;
    } else {
      const puntosValidados = [];
      for (let i = 0; i < 4; i++) {
        const punto = parseFloat(linePoints[i]);
        puntosValidados.push(isNaN(punto) ? 0 : punto);
      }

      if (JSON.stringify(puntosValidados) !== JSON.stringify(linePoints.slice(0, 4))) {
        linePoints = puntosValidados;
        pointsFixed = true;
      } else {
        linePoints = linePoints.slice(0, 4);
      }
    }

    if (pointsFixed && handleChange) {
      setTimeout(() => {
        handleChange(obj.id, {
          points: linePoints,
          fromAutoFix: true
        });
      }, 0);
    }


    return (
      <Line
        {...commonProps}
        ref={handleRef}
        points={linePoints}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        stroke={obj.color || LINE_CONSTANTS.DEFAULT_COLOR}
        strokeWidth={obj.strokeWidth || LINE_CONSTANTS.STROKE_WIDTH}
        tension={0}
        lineCap="round"
        lineJoin="round"
        perfectDrawEnabled={false}
        hitStrokeWidth={Math.max(LINE_CONSTANTS.HIT_STROKE_WIDTH, obj.strokeWidth || 2)}
        shadowForStrokeEnabled={false}
        opacity={isSelected ? 1 : 0.95}
        shadowColor={isSelected ? "rgba(119, 61, 190, 0.3)" : "transparent"}
        shadowBlur={isSelected ? 8 : 0}
        shadowOffset={{ x: 0, y: 2 }}
      />
    );
  }

  if (obj.tipo === "grupo") {
    const groupWidth = Math.max(1, Math.abs(Number(obj.width) || 1));
    const groupHeight = Math.max(1, Math.abs(Number(obj.height) || 1));
    const children = Array.isArray(obj.children) ? obj.children : [];

    return (
      <Group
        {...commonProps}
        id={obj.id}
        ref={handleRef}
        width={groupWidth}
        height={groupHeight}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <Rect
          x={0}
          y={0}
          width={groupWidth}
          height={groupHeight}
          fill="rgba(0,0,0,0.001)"
          stroke="transparent"
          listening={true}
          draggable={false}
          onClick={handleClick}
          onTap={handleClick}
          onDblClick={handleDoubleClick}
          onDblTap={handleDoubleClick}
        />

        <Group listening={false}>
          {children.map((child, childIndex) => {
            const childKey = `${obj.id}:${child?.id || childIndex}`;

            if (child?.tipo === "countdown") {
              return (
                <CountdownKonva
                  key={childKey}
                  obj={child}
                  registerRef={null}
                  onHover={null}
                  isSelected={false}
                  selectionCount={0}
                  seccionesOrdenadas={[]}
                  altoCanvas={0}
                  ALTURA_PANTALLA_EDITOR={0}
                  onSelect={null}
                  onChange={null}
                  onDragStartPersonalizado={null}
                  onDragMovePersonalizado={null}
                  onDragEndPersonalizado={null}
                  dragStartPos={dragStartPos}
                  hasDragged={hasDragged}
                  onPredragVisualSelectionStart={null}
                  onPredragVisualSelectionCancel={null}
                  selectionRuntime={null}
                  isPassiveRender={true}
                />
              );
            }

            if (child?.tipo === "galeria") {
              return (
                <GaleriaKonva
                  key={childKey}
                  obj={child}
                  registerRef={null}
                  onHover={null}
                  isSelected={false}
                  onSelect={null}
                  onChange={null}
                  onDragStartPersonalizado={null}
                  onDragMovePersonalizado={null}
                  onDragEndPersonalizado={null}
                  celdaGaleriaActiva={null}
                  onPickCell={null}
                  setCeldaGaleriaActiva={null}
                  seccionesOrdenadas={[]}
                  altoCanvas={0}
                  ALTURA_PANTALLA_EDITOR={0}
                  isPassiveRender={true}
                />
              );
            }

            return (
              <ElementoCanvas
                key={childKey}
                obj={child}
                isSelected={false}
                isInEditMode={false}
                onSelect={null}
                onChange={undefined}
                editingId={null}
                registerRef={null}
                onHover={null}
                preSeleccionado={false}
                selectionCount={0}
                onDragMovePersonalizado={null}
                onDragStartPersonalizado={null}
                onDragEndPersonalizado={null}
                dragStartPos={dragStartPos}
                hasDragged={hasDragged}
                editingMode={false}
                inlineOverlayMountedId={null}
                inlineOverlayMountSession={null}
                inlineVisibilityMode="reactive"
                inlineOverlayEngine="phase_atomic_v2"
                onInlineEditPointer={null}
                dragLayerRef={null}
                onPredragVisualSelectionStart={null}
                onPredragVisualSelectionCancel={null}
                selectionRuntime={null}
                isPassiveRender={true}
              />
            );
          })}
        </Group>
      </Group>
    );
  }


  if (obj.tipo === "texto") {
        const inlineVisibility = inlineVisibilityForText;
    const isEditing = inlineVisibility.isEditing;
    const fontFamily = obj.fontFamily || "sans-serif";
    const align = (obj.align || "left").toLowerCase();
    const fillColor = obj.colorTexto ?? obj.fill ?? obj.color ?? "#000";
    const baseLineHeight =
      typeof obj.lineHeight === "number" && obj.lineHeight > 0 ? obj.lineHeight : 1.2;
    const lineHeight = baseLineHeight * 0.92;
    const letterSpacing =
      Number.isFinite(Number(obj.letterSpacing)) ? Number(obj.letterSpacing) : 0;


    // Ã¢Å“â€¦ Evita bbox sobrado a la derecha por espacios/tabs invisibles al final de lÃƒÂ­nea
    const rawText = String(obj.texto ?? "");
    const safeText = rawText.replace(/[ \t]+$/gm, "");


    // Ã¢Å“â€¦ VALIDACIÃƒâ€œN: Asegurar valores numÃƒÂ©ricos vÃƒÂ¡lidos
    const validX = typeof obj.x === "number" && !isNaN(obj.x) ? obj.x : 0;
    const validY = typeof obj.y === "number" && !isNaN(obj.y) ? obj.y : 0;
    const validFontSize = normalizeFontSize(obj.fontSize, 24);
    const textDecoration =
      typeof obj.textDecoration === "string" && obj.textDecoration.trim().length > 0
        ? obj.textDecoration
        : "none";

    // Ã°Å¸â€Â¹ PASO 1: Calcular dimensiones del texto PRIMERO
    const ctx = document.createElement("canvas").getContext("2d");
    const style = obj.fontStyle || "normal";
    const weight = obj.fontWeight || "normal";
    const konvaFontStyle = resolveKonvaFontStyle(style, weight);

    // Ã¢Å“â€¦ si la fuente tiene espacios, envolverla en comillas para que canvas no caiga a fallback
    const fontForCanvas = fontFamily.includes(",")
      ? fontFamily
      : (/\s/.test(fontFamily) ? `"${fontFamily}"` : fontFamily);

    // Ã¢Å“â€¦ orden correcto: style -> weight -> size -> family
    ctx.font = `${style} ${weight} ${validFontSize}px ${fontForCanvas}`;

    const lines = safeText.split(/\r?\n/);
    const maxLineWidth = Math.max(
      ...lines.map((line) => {
        const safeLine = String(line || "");
        const baseWidth = ctx.measureText(safeLine).width;
        const spacingExtra = Math.max(0, safeLine.length - 1) * letterSpacing;
        return baseWidth + spacingExtra;
      }),
      20
    );
    const numLines = lines.length;
    const textWidth = Math.ceil(maxLineWidth);
    const textHeight = validFontSize * lineHeight * numLines;

    // Ã°Å¸â€Â¹ PASO 2: Calcular posiciÃƒÂ³n solo una vez y congelar el centro
    let positionRaw = getCenteredTextPosition({
      rectY: validY,
      rectHeight: textHeight,
      fontSize: validFontSize,
      fontFamily,
      fontWeight: obj.fontWeight || "normal",
      fontStyle: obj.fontStyle || "normal",
    });

    // Inicializar layout base solo la PRIMERA vez
    if (!baseTextLayoutRef.current) {
      baseTextLayoutRef.current = {
        // centro vertical "ideal" que queremos conservar
        rectCenter: positionRaw.rectCenter,
        // offset desde el centro al baseline (depende solo de la fuente/tamaÃƒÂ±o)
        baselineToCenter: positionRaw.baseline - positionRaw.rectCenter,
        ascent: positionRaw.ascent,
        descent: positionRaw.descent,
      };
    }

    const base = baseTextLayoutRef.current;
    const rectCenterFixed = base.rectCenter;
    const baselineY = rectCenterFixed + base.baselineToCenter;
    const textTopFixed = baselineY - base.ascent;

    const position = {
      baseline: baselineY,
      textTop: textTopFixed,
      ascent: base.ascent,
      descent: base.descent,
      rectCenter: rectCenterFixed,
    };

    // Ã°Å¸â€Â Debug: informaciÃƒÂ³n completa de posiciÃƒÂ³n y centrado


    // Ã¢Å¡Â Ã¯Â¸Â Warning si hay valores invÃƒÂ¡lidos
    if (obj.x !== validX || obj.y !== validY || obj.fontSize !== validFontSize) {
      console.warn("Ã¢Å¡Â Ã¯Â¸Â Objeto de texto tiene valores invÃƒÂ¡lidos:", {
        id: obj.id,
        x: obj.x,
        y: obj.y,
        fontSize: obj.fontSize,
      });
    }

        const ANCHO_CANVAS = 800;
    const availableWidth = Math.max(1, ANCHO_CANVAS - validX);

    // ancho real del texto (mÃƒÂ¡xima lÃƒÂ­nea, segÃƒÂºn tu cÃƒÂ¡lculo actual)
    const realTextWidth = Math.max(
      1,
      Number.isFinite(measuredTextWidth) && measuredTextWidth > 0
        ? measuredTextWidth
        : textWidth
    );

    // Ã¢Å“â€¦ Si entra, NO usamos width (bounds ajustado)
    // Ã¢Å“â€¦ Si no entra, usamos width=available y wrap por caracteres para cortar en el borde
    const shouldWrapToCanvasEdge = realTextWidth > availableWidth;

    const wrapToUse = shouldWrapToCanvasEdge ? "char" : "none";
    const widthToUse = shouldWrapToCanvasEdge ? availableWidth : undefined;
    const visualTextBoxWidth = Number.isFinite(widthToUse) ? widthToUse : realTextWidth;
    const textOriginOffsetX = resolveTextTransformOriginOffset(
      align,
      visualTextBoxWidth
    );
    const templateDraftDebugSession = getTemplateDraftDebugSession();
    const templateDraftDebugObject =
      templateDraftDebugSession?.objectsById &&
      Object.prototype.hasOwnProperty.call(templateDraftDebugSession.objectsById, obj.id)
        ? templateDraftDebugSession.objectsById[obj.id]
        : null;
    if (
      templateDraftDebugSession?.slug &&
      templateDraftDebugObject &&
      markTemplateDraftRenderLogged(templateDraftDebugSession.slug, obj.id)
    ) {
      groupTemplateDraftDebug(`konva-render:${obj.id}`, [
        ["konva-render:session", templateDraftDebugSession],
        ["konva-render:expected", templateDraftDebugObject],
        ["konva-render:actual", {
          id: obj.id,
          text: safeText,
          x: validX,
          y: validY,
          align,
          wrapToUse,
          widthToUse: Number.isFinite(widthToUse) ? widthToUse : null,
          availableWidth,
          realTextWidth,
          visualTextBoxWidth,
          textOriginOffsetX,
          rotation: Number.isFinite(Number(obj.rotation)) ? Number(obj.rotation) : 0,
          scaleX: Number.isFinite(Number(obj.scaleX)) ? Number(obj.scaleX) : 1,
          scaleY: Number.isFinite(Number(obj.scaleY)) ? Number(obj.scaleY) : 1,
          shouldPreserveCenter: shouldPreserveTextCenterPosition(obj),
        }],
      ]);
    }
    // Durante inline edit mostramos el texto del overlay DOM y ocultamos el Konva
    // para evitar que cursor y glifos salgan de sincronía visual.
    const appliedOpacity = 1;
    const canvasTextDebugEnabled = isInlineCanvasTextDebugEnabled();
    const canvasTextDebugRect =
      debugTextClientRect &&
      Number.isFinite(debugTextClientRect.x) &&
      Number.isFinite(debugTextClientRect.y) &&
      Number.isFinite(debugTextClientRect.width) &&
      Number.isFinite(debugTextClientRect.height)
        ? debugTextClientRect
        : null;
    const canvasTextDebugLabelX = canvasTextDebugRect ? canvasTextDebugRect.x + 2 : 0;
    const canvasTextDebugLabelY = canvasTextDebugRect ? Math.max(0, canvasTextDebugRect.y - 14) : 0;

    return (
      <>
        {canvasTextDebugEnabled && canvasTextDebugRect && (
          <>
            <Rect
              x={canvasTextDebugRect.x}
              y={canvasTextDebugRect.y}
              width={canvasTextDebugRect.width}
              height={canvasTextDebugRect.height}
              fill="rgba(16, 185, 129, 0.20)"
              stroke="rgba(5, 150, 105, 0.95)"
              strokeWidth={1}
              dash={[6, 4]}
              listening={false}
              perfectDrawEnabled={false}
            />
            <Rect
              x={canvasTextDebugLabelX - 2}
              y={canvasTextDebugLabelY - 1}
              width={72}
              height={14}
              fill="rgba(5, 150, 105, 0.95)"
              listening={false}
              perfectDrawEnabled={false}
            />
            <Text
              x={canvasTextDebugLabelX}
              y={canvasTextDebugLabelY}
              text="KONVA TEXT"
              fontSize={10}
              fontFamily="monospace"
              fill="#ffffff"
              listening={false}
              lineHeight={1}
              perfectDrawEnabled={false}
            />
          </>
        )}
        <Text
          {...commonProps}
          id={obj.id}
          ref={(node) => {
            textNodeRef.current = node || null;
            if (node) {
              markTextOriginOffsetCanonicalPose(node);
            }
            handleRef(node);
          }}
          x={validX + textOriginOffsetX}
          y={validY}
          offsetX={textOriginOffsetX}
          offsetY={0}
          text={safeText}
          wrap={wrapToUse}
          width={widthToUse}
          align={align}
          fontSize={validFontSize}
          fontFamily={fontFamily}
          fontWeight={obj.fontWeight || "normal"}
          fontStyle={konvaFontStyle}
          textDecoration={textDecoration}
          lineHeight={lineHeight}
          letterSpacing={letterSpacing}
          fill={fillColor}
          verticalAlign="top"
          opacity={appliedOpacity}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />


      </>
    );
  }

  if (isFunctionalCtaButton(obj)) {
    const fontFamily = obj.fontFamily || "sans-serif";
    const rsvpVisual = resolveRsvpButtonVisual(obj);
    const textOpacity = 1;

    const width = Number.isFinite(obj.width) ? obj.width : (obj.ancho || 200);
    const height = Number.isFinite(obj.height) ? obj.height : (obj.alto || 50);

    return (
      <Group
        {...commonProps}
        id={obj.id}
        ref={handleRef}
        width={width}
        height={height}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="rgba(0,0,0,0.001)"
          stroke="transparent"
          listening={true}
          draggable={false}
          onClick={handleClick}
          onTap={handleClick}
          onDblClick={handleDoubleClick}
          onDblTap={handleDoubleClick}
        />
        {/* ðŸŸ£ BotÃ³n (fondo) */}
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          cornerRadius={Number.isFinite(obj.cornerRadius) ? obj.cornerRadius : 8}
          fill={rsvpVisual.fillColor}
          fillPriority={rsvpVisual.hasGradient ? "linear-gradient" : "color"}
          fillLinearGradientStartPoint={rsvpVisual.hasGradient ? { x: 0, y: 0 } : undefined}
          fillLinearGradientEndPoint={rsvpVisual.hasGradient ? { x: width, y: height } : undefined}
          fillLinearGradientColorStops={
            rsvpVisual.hasGradient
              ? [0, rsvpVisual.gradientFrom, 1, rsvpVisual.gradientTo]
              : undefined
          }
          stroke={isSelected || preSeleccionado ? "#773dbe" : rsvpVisual.strokeColor}
          strokeWidth={isSelected || preSeleccionado ? 2 : rsvpVisual.strokeWidth}
          shadowColor={rsvpVisual.shadowColor}
          shadowBlur={rsvpVisual.shadowBlur}
          shadowOffset={{ x: 0, y: rsvpVisual.shadowOffsetY }}
          listening={false}
        />

        {/* ðŸ”¤ Texto encima del botÃ³n */}
        <Text
          ref={(node) => {
            if (registerRef) {
              registerRef(`${obj.id}-text`, node || null); // si querÃ©s manipular el texto aparte
            }
          }}
          id={`${obj.id}-text`}
          x={0}
          y={0}
          width={width}
          height={height}
          text={obj.texto ?? getFunctionalCtaDefaultText(obj)}
          fontSize={normalizeFontSize(obj.fontSize, 18)}
          fontFamily={fontFamily}
          fontStyle={resolveKonvaFontStyle(obj.fontStyle || "normal", obj.fontWeight || "bold")}
          fontWeight={obj.fontWeight || "bold"}
          textDecoration={obj.textDecoration || "none"}
          fill={rsvpVisual.textColor}
          align={obj.align || "center"}
          verticalAlign="middle"
          listening={false}
          opacity={textOpacity}
        />

      </Group>
    );
  }



  if (obj.tipo === "imagen" && img) {
    const imageCrop = imageCropData || resolveKonvaImageCrop(obj, img);
    const mostrarBordeSeleccionImagen = preSeleccionado && !isSelected;
    const shouldUseRectangularSelectionHitRegion =
      !isSelected && !preSeleccionado;
    return (
      <KonvaImage
        {...commonProps}
        ref={handleRef}
        id={obj.id}
        image={img}
        crossOrigin="anonymous"
        width={imageCrop.width}
        height={imageCrop.height}
        crop={imageCrop.crop}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        perfectDrawEnabled={false}
        hitFunc={shouldUseRectangularSelectionHitRegion
          ? (context, shape) => {
              drawRectangularHitRegion(
                context,
                shape,
                imageCrop.width,
                imageCrop.height
              );
            }
          : undefined}
        stroke={mostrarBordeSeleccionImagen ? "#773dbe" : undefined}
        strokeWidth={mostrarBordeSeleccionImagen ? 1 : 0}
      />
    );
  }


  /* ---------------- ICONO SVG (tipo:"icono", formato:"svg") Ã¢â‚¬â€ CON HITBOX FUNCIONAL ---------------- */
  if (obj.tipo === "icono" && obj.formato === "svg") {
    const color = obj.color || "#000000";
    const paths = Array.isArray(obj.paths) ? obj.paths : [];
    const W = Number(obj.width) || 128;
    const H = Number(obj.height) || 128;
    const vb = parseViewBox(obj.viewBox) || { minX: 0, minY: 0, vbWidth: 100, vbHeight: 100 };
    return (
      <Group
        {...commonProps}
        ref={handleRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        width={W}
        height={H}
      >
        {/* Ã°Å¸â€Â¥ HITBOX INVISIBLE - SOLO para eventos de drag/click */}
        <Rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="rgba(0,0,0,0.001)"  // Casi transparente pero clickeable
          stroke="transparent"      // Sin borde
          listening={true}          // DEBE recibir eventos
          draggable={false}
          onMouseDown={!hasPointerEvents ? (e) => handleNestedHitboxPressStart(e, "mousedown") : undefined}
          onTouchStart={!hasPointerEvents ? (e) => handleNestedHitboxPressStart(e, "touchstart") : undefined}
          onPointerDown={(e) => handleNestedHitboxPressStart(e, "pointerdown")}
        />

        {/* Contenido SVG visual - NO maneja eventos */}
        {paths.map((p, i) => (
          <Path
            key={i}
            data={p.d}
            fill={color}
            scaleX={W / vb.vbWidth}
            scaleY={H / vb.vbHeight}
            x={-vb.minX * (W / vb.vbWidth)}
            y={-vb.minY * (H / vb.vbHeight)}
            listening={false}        // NO maneja eventos
            perfectDrawEnabled={false}
          />
        ))}

        {/* Marco de selecciÃƒÂ³n visual */}
      </Group>
    );
  }


  /* ---------------- ICONO RASTER (PNG/JPG/WEBP) Ã¢â‚¬â€œ sin recolor ---------------- */
  if (
    obj.tipo === "icono" &&
    (
      obj.formato === "png" ||
      obj.formato === "jpg" ||
      obj.formato === "jpeg" ||
      obj.formato === "webp" ||
      obj.formato === "gif" ||
      obj.formato === "avif"
    )
  ) {
    return (
      <KonvaImage
        {...commonProps}
        ref={handleRef}
        image={rasterIconImg}
        crossOrigin="anonymous"
        width={obj.width || (rasterIconImg?.width ?? 120)}
        height={obj.height || (rasterIconImg?.height ?? 120)}
        listening={true}

        // UX cursor (sin romper tu hover)
        onMouseEnter={(e) => {
          const stage = e.currentTarget.getStage();
          if (stage) stage.container().style.cursor = "grab";
          handleMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
          const stage = e.currentTarget.getStage();
          if (stage) stage.container().style.cursor = "default";
          handleMouseLeave?.(e);
        }}

        // Ã¢Å“â€¦ CLAVE: NO pisar el onClick/onTap ni el onDragEnd "real" del sistema
        // Si querÃƒÂ©s mantener un comportamiento extra en click, hacelo sin cambiar la firma:
        onClick={(e) => {
          // delega al commonProps.onClick (selecciÃƒÂ³n consistente)
          commonProps.onClick?.(e);
        }}
        onTap={(e) => {
          // en Konva, tap suele mapear a click; si querÃƒÂ©s, delegalo igual
          commonProps.onClick?.(e);
        }}

        // Ã¢Å“â€¦ CLAVE: delegar a commonProps.onDragEnd para que:
        // - se limpien guÃƒÂ­as (onDragEndPersonalizado)
        // - se haga finalizoDrag + ABSÃ¢â€ â€™REL
        onDragEnd={(e) => {
          commonProps.onDragEnd?.(e);

          // limpieza de cursor (extra)
          const stage = e.currentTarget.getStage();
          if (stage) stage.container().style.cursor = "default";
        }}
      />
    );
  }




  /* ---------------- LEGACY: ICONO SVG (tipo: "icono-svg" con obj.d) ---------------- */
  if (obj.tipo === "icono-svg") {
    const W = Number(obj.width) || 128;
    const H = Number(obj.height) || 128;
    const vb = parseViewBox(obj.viewBox) || { minX: 0, minY: 0, vbWidth: 100, vbHeight: 100 };
    const scaleX = vb.vbWidth ? W / vb.vbWidth : 1;
    const scaleY = vb.vbHeight ? H / vb.vbHeight : 1;

    return (
      <Group
        {...commonProps}
        ref={handleRef}
        draggable={true}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => commonProps.onClick?.(e)}
        onTap={(e) => commonProps.onTap?.(e)}
        onDragEnd={(e) => {
          commonProps.onDragEnd?.(e);
        }}
        onTransformEnd={(e) => {
          const node = e.target;
          const scaleXNode =
            typeof node.scaleX === "function" ? node.scaleX() : (node.scaleX ?? 1);
          const scaleYNode =
            typeof node.scaleY === "function" ? node.scaleY() : (node.scaleY ?? 1);
          const patch = {
            x: node.x(),
            y: node.y(),
            rotation: node.rotation() || 0,
            width: Math.max(1, W * Math.abs(scaleXNode || 1)),
            height: Math.max(1, H * Math.abs(scaleYNode || 1)),
            scaleX: 1,
            scaleY: 1,
            isFinal: true,
          };
          onChange?.(obj.id, patch);
        }}
      >
        <Rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="rgba(0,0,0,0.001)"
          stroke="transparent"
          strokeWidth={0}
          listening={true}
        />
        <Group x={0} y={0} scaleX={scaleX} scaleY={scaleY}>
          <Group x={-vb.minX} y={-vb.minY}>
            <Path
              data={obj.d}
              fill={obj.color || "#000"}
              stroke={obj.color || "#000"}
              strokeWidth={1}
              perfectDrawEnabled
              listening={false}
            />
          </Group>
        </Group>
      </Group>
    );
  }





  if (obj.tipo === "forma") {
    const figura = obj.figura || "rect";
    const selectionStroke = isSelected || preSeleccionado ? "#773dbe" : undefined;
    const selectionStrokeWidth = isSelected || preSeleccionado ? 1 : 0;

    switch (figura) {
      case "rect": {
        const { width, height } = toShapeSize(obj, 100, 100);
        const rectFill = resolveKonvaFill(obj.color, width, height, "#000000");
        const textOpacity = 1;

        return (
          <Group
            {...commonProps}
            id={obj.id}
            ref={handleRef}
            width={width}
            height={height}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <Rect
              x={0}
              y={0}
              width={width}
              height={height}
              fill="rgba(0,0,0,0.001)"
              stroke="transparent"
              listening={true}
              draggable={false}
              onClick={handleClick}
              onTap={handleClick}
              onDblClick={handleDoubleClick}
              onDblTap={handleDoubleClick}
            />
            <Rect
              x={0}
              y={0}
              width={width}
              height={height}
              {...shapeFillProps(rectFill)}
              cornerRadius={obj.cornerRadius || 0}
              stroke={selectionStroke}
              strokeWidth={selectionStrokeWidth}
              listening={false}
            />

            {typeof obj.texto === "string" && (
              <Text
                id={`${obj.id}-text`}
                ref={(node) => {
                  if (registerRef) registerRef(`${obj.id}-text`, node || null);
                }}
                x={0}
                y={0}
                width={width}
                height={height}
                text={obj.texto ?? ""}
                fontSize={normalizeFontSize(obj.fontSize, 24)}
                fontFamily={obj.fontFamily || "sans-serif"}
                fontWeight={obj.fontWeight || "normal"}
                fontStyle={resolveKonvaFontStyle(obj.fontStyle || "normal", obj.fontWeight || "normal")}
                textDecoration={obj.textDecoration || "none"}
                fill={obj.colorTexto || "#000000"}
                align={obj.align || "center"}
                verticalAlign="middle"
                listening={false}
                opacity={textOpacity}
              />
            )}
          </Group>
        );
      }

      case "circle": {
        const circleRadius = obj.radius || 50;
        const circleFill = resolveKonvaFill(obj.color, circleRadius * 2, circleRadius * 2, "#000000");
        return (
          <Group
            {...commonProps}
            id={obj.id}
            ref={handleRef}
            width={circleRadius * 2}
            height={circleRadius * 2}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <Rect
              x={-circleRadius}
              y={-circleRadius}
              width={circleRadius * 2}
              height={circleRadius * 2}
              fill="rgba(0,0,0,0.001)"
              stroke="transparent"
              listening={true}
              draggable={false}
              onClick={handleClick}
              onTap={handleClick}
              onDblClick={handleDoubleClick}
              onDblTap={handleDoubleClick}
            />
            <Circle
              x={0}
              y={0}
              radius={circleRadius}
              {...shapeFillProps(circleFill)}
              stroke={selectionStroke}
              strokeWidth={selectionStrokeWidth}
              listening={false}
            />
          </Group>
        );
      }

      case "triangle": {
        const triangleRadius = obj.radius || 60;
        const triangleFill = resolveKonvaFill(obj.color, triangleRadius * 2, triangleRadius * 2, "#000000");
        return (
          <Group
            {...commonProps}
            id={obj.id}
            ref={handleRef}
            width={triangleRadius * 2}
            height={triangleRadius * 2}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <Rect
              x={-triangleRadius}
              y={-triangleRadius}
              width={triangleRadius * 2}
              height={triangleRadius * 2}
              fill="rgba(0,0,0,0.001)"
              stroke="transparent"
              listening={true}
              draggable={false}
              onClick={handleClick}
              onTap={handleClick}
              onDblClick={handleDoubleClick}
              onDblTap={handleDoubleClick}
            />
            <RegularPolygon
              x={0}
              y={0}
              sides={3}
              radius={triangleRadius}
              {...shapeFillProps(triangleFill)}
              stroke={selectionStroke}
              strokeWidth={selectionStrokeWidth}
              listening={false}
            />
          </Group>
        );
      }

      case "diamond":
      case "star":
      case "arrow":
      case "pentagon":
      case "hexagon": {
        const { width, height } = toShapeSize(obj, 120, 120);
        const fillModel = resolveKonvaFill(obj.color, width, height, "#000000");
        let points = buildDiamondPoints(width, height);

        if (figura === "star") points = buildStarPoints(width, height);
        if (figura === "arrow") points = buildArrowPoints(width, height);
        if (figura === "pentagon") points = buildRegularPolygonPoints(5, width, height);
        if (figura === "hexagon") points = buildRegularPolygonPoints(6, width, height);

        return (
          <Group
            {...commonProps}
            id={obj.id}
            ref={handleRef}
            width={width}
            height={height}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <Rect
              x={0}
              y={0}
              width={width}
              height={height}
              fill="rgba(0,0,0,0.001)"
              stroke="transparent"
              listening={true}
              draggable={false}
              onClick={handleClick}
              onTap={handleClick}
              onDblClick={handleDoubleClick}
              onDblTap={handleDoubleClick}
            />
            <Line
              x={0}
              y={0}
              points={points}
              closed
              {...shapeFillProps(fillModel)}
              stroke={selectionStroke}
              strokeWidth={selectionStrokeWidth}
              lineJoin="round"
              listening={false}
            />
          </Group>
        );
      }

      case "heart": {
        const { width, height } = toShapeSize(obj, 120, 108);
        const fillModel = resolveKonvaFill(obj.color, width, height, "#000000");
        return (
          <Group
            {...commonProps}
            id={obj.id}
            ref={handleRef}
            width={width}
            height={height}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <Rect
              x={0}
              y={0}
              width={width}
              height={height}
              fill="rgba(0,0,0,0.001)"
              stroke="transparent"
              listening={true}
              draggable={false}
              onClick={handleClick}
              onTap={handleClick}
              onDblClick={handleDoubleClick}
              onDblTap={handleDoubleClick}
            />
            <Path
              x={0}
              y={0}
              data={buildHeartPath(width, height)}
              {...shapeFillProps(fillModel)}
              stroke={selectionStroke}
              strokeWidth={selectionStrokeWidth}
              listening={false}
            />
          </Group>
        );
      }

      case "pill": {
        const { width, height } = toShapeSize(obj, 170, 72);
        const fillModel = resolveKonvaFill(obj.color, width, height, "#000000");
        const cornerRadius = Number.isFinite(obj.cornerRadius)
          ? obj.cornerRadius
          : Math.max(10, Math.round(height / 2));
        return (
          <Group
            {...commonProps}
            id={obj.id}
            ref={handleRef}
            width={width}
            height={height}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <Rect
              x={0}
              y={0}
              width={width}
              height={height}
              fill="rgba(0,0,0,0.001)"
              stroke="transparent"
              listening={true}
              draggable={false}
              onClick={handleClick}
              onTap={handleClick}
              onDblClick={handleDoubleClick}
              onDblTap={handleDoubleClick}
            />
            <Rect
              x={0}
              y={0}
              width={width}
              height={height}
              cornerRadius={cornerRadius}
              {...shapeFillProps(fillModel)}
              stroke={selectionStroke}
              strokeWidth={selectionStrokeWidth}
              listening={false}
            />
          </Group>
        );
      }

      default:
        return null;
    }
  }

  return null;
}





