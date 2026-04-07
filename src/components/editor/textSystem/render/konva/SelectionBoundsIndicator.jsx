import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Group, Line, Rect, Text } from "react-konva";
import {
  buildSelectionFramePolygon,
  getSelectionFramePaddingForSelection,
  getSelectionFrameStrokeWidth,
  SELECTION_FRAME_STROKE,
} from "@/components/editor/textSystem/render/konva/selectionFrameVisuals";
import {
  resolveSelectionFrameRect,
} from "@/components/editor/textSystem/render/konva/selectionBoundsGeometry";
import {
  getKonvaNodeDebugInfo,
  logSelectedDragDebug,
  sampleCanvasInteractionLog,
} from "@/components/editor/canvasEditor/selectedDragDebug";
import {
  buildCanvasBoxFlowBoundsDigest,
  buildCanvasBoxFlowIdsDigest,
  flushCanvasBoxFlowSummary,
  getActiveCanvasBoxFlowSession,
  isCanvasBoxFlowIdentityRetired,
  logCanvasBoxFlow,
  recordCanvasBoxFlowSummary,
} from "@/components/editor/canvasEditor/canvasBoxFlowDebug";
import {
  buildTextGeometryContractRect,
  buildTextGeometryContractRectDelta,
  evaluateTextGeometryContractRectAlignment,
  logTextGeometryContractInvariant,
  readTextGeometryContractSnapshot,
  roundTextGeometryContractMetric,
} from "@/components/editor/canvasEditor/textGeometryContractDebug";
import {
  resolveAuthoritativeTextRect,
} from "@/components/editor/canvasEditor/konvaAuthoritativeBounds";

function hasFinitePolygonPoints(points) {
  return (
    Array.isArray(points) &&
    points.length === 8 &&
    points.every((value) => Number.isFinite(Number(value)))
  );
}

function arePointArraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (Number(left[index]) !== Number(right[index])) {
      return false;
    }
  }

  return true;
}

function areBoundsDigestsEqual(left, right) {
  if (!left || !right) return left === right;
  return (
    left.kind === right.kind &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function getSelectionIndicatorNodeId(node) {
  try {
    return (
      (typeof node?.id === "function"
        ? node.id()
        : node?.attrs?.id) || null
    );
  } catch {
    return null;
  }
}

function buildSelectionIndicatorNodesKey(nodes = []) {
  return nodes
    .map((node) => getSelectionIndicatorNodeId(node))
    .filter(Boolean)
    .join(",");
}

function isKonvaNodeDragging(node) {
  try {
    return Boolean(node?.isDragging?.());
  } catch {
    return false;
  }
}

function hasMeaningfulRotation(node, objectData) {
  const rawRotation =
    typeof node?.rotation === "function"
      ? Number(node.rotation() || 0)
      : Number(objectData?.rotation || 0);

  if (!Number.isFinite(rawRotation)) return false;

  const normalizedRotation = Math.abs(rawRotation % 360);
  return normalizedRotation > 0.01 && Math.abs(normalizedRotation - 360) > 0.01;
}

function shouldUseRotatedSelectionBounds(selectedObjects = [], selectedNode = null) {
  const selection = Array.isArray(selectedObjects)
    ? selectedObjects.filter(Boolean)
    : [selectedObjects].filter(Boolean);
  const firstSelectedObject = selection[0] || null;

  return (
    selection.length === 1 &&
    !firstSelectedObject?.esFondo &&
    (
      firstSelectedObject?.tipo === "imagen" ||
      hasMeaningfulRotation(selectedNode, firstSelectedObject)
    )
  );
}

function resolveSelectedGroupObject(selectedElements = [], objetos = []) {
  if (!Array.isArray(selectedElements) || selectedElements.length !== 1) {
    return null;
  }

  const selectedId = String(selectedElements[0] || "").trim();
  if (!selectedId) return null;

  const selectedObject = Array.isArray(objetos)
    ? objetos.find((objeto) => objeto?.id === selectedId) || null
    : null;

  return selectedObject?.tipo === "grupo" ? selectedObject : null;
}

function resolveBoundsOrigin(bounds) {
  if (!bounds || typeof bounds !== "object") {
    return { x: 0, y: 0 };
  }

  if (bounds.kind === "polygon" && Array.isArray(bounds.points) && bounds.points.length >= 8) {
    const xs = bounds.points.filter((_, index) => index % 2 === 0).map((value) => Number(value));
    const ys = bounds.points.filter((_, index) => index % 2 === 1).map((value) => Number(value));

    return {
      x: xs.length ? Math.min(...xs) : 0,
      y: ys.length ? Math.min(...ys) : 0,
    };
  }

  return {
    x: Number(bounds.x) || 0,
    y: Number(bounds.y) || 0,
  };
}

function buildGroupBadgeLayout(groupObject, bounds, isMobile = false) {
  if (!groupObject) return null;

  const childCount = Array.isArray(groupObject.children) ? groupObject.children.length : 0;
  const label =
    childCount === 1
      ? "Grupo seleccionado · 1 elemento"
      : `Grupo seleccionado · ${childCount} elementos`;
  const fontSize = isMobile ? 11 : 10;
  const paddingX = isMobile ? 10 : 8;
  const height = isMobile ? 24 : 22;
  const estimatedWidth = Math.max(132, Math.ceil(label.length * fontSize * 0.58) + paddingX * 2);
  const origin = resolveBoundsOrigin(bounds);
  const y = Math.max(4, origin.y - height - 8);

  return {
    label,
    x: Math.max(4, origin.x),
    y,
    width: estimatedWidth,
    height,
    fontSize,
    paddingX,
  };
}

function flushIndicatorLayerDraw(groupNode, immediate = false) {
  const layer = groupNode?.getLayer?.() || null;
  if (!layer) return;

  if (immediate && typeof layer.draw === "function") {
    layer.draw();
    return;
  }

  layer.batchDraw?.();
}

function getSelectionVisualNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function roundSelectionVisualMetric(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function buildSelectionVisualRect(rect = null) {
  if (!rect) return null;
  return {
    x: roundSelectionVisualMetric(rect.x),
    y: roundSelectionVisualMetric(rect.y),
    width: roundSelectionVisualMetric(rect.width),
    height: roundSelectionVisualMetric(rect.height),
    centerX: roundSelectionVisualMetric(
      Number(rect.x) + Number(rect.width) / 2
    ),
    centerY: roundSelectionVisualMetric(
      Number(rect.y) + Number(rect.height) / 2
    ),
  };
}

function buildSelectionVisualRectDelta(previousRect = null, nextRect = null) {
  if (!previousRect || !nextRect) return null;
  return {
    dx: roundSelectionVisualMetric(Number(nextRect.x) - Number(previousRect.x)),
    dy: roundSelectionVisualMetric(Number(nextRect.y) - Number(previousRect.y)),
    dWidth: roundSelectionVisualMetric(
      Number(nextRect.width) - Number(previousRect.width)
    ),
    dHeight: roundSelectionVisualMetric(
      Number(nextRect.height) - Number(previousRect.height)
    ),
    dCenterX: roundSelectionVisualMetric(
      (
        Number(nextRect.x) + Number(nextRect.width) / 2
      ) - (
        Number(previousRect.x) + Number(previousRect.width) / 2
      )
    ),
    dCenterY: roundSelectionVisualMetric(
      (
        Number(nextRect.y) + Number(nextRect.height) / 2
      ) - (
        Number(previousRect.y) + Number(previousRect.height) / 2
      )
    ),
  };
}

function hasMeaningfulSelectionVisualRectDelta(delta = null, threshold = 0.5) {
  if (!delta) return false;
  return [
    delta.dx,
    delta.dy,
    delta.dWidth,
    delta.dHeight,
    delta.dCenterX,
    delta.dCenterY,
  ].some((value) => Math.abs(Number(value || 0)) >= threshold);
}

function buildSelectionVisualInsets(outerRect = null, innerRect = null) {
  if (!outerRect || !innerRect) return null;
  return {
    left: roundSelectionVisualMetric(Number(innerRect.x) - Number(outerRect.x)),
    top: roundSelectionVisualMetric(Number(innerRect.y) - Number(outerRect.y)),
    right: roundSelectionVisualMetric(
      Number(outerRect.x) +
        Number(outerRect.width) -
        (Number(innerRect.x) + Number(innerRect.width))
    ),
    bottom: roundSelectionVisualMetric(
      Number(outerRect.y) +
        Number(outerRect.height) -
        (Number(innerRect.y) + Number(innerRect.height))
    ),
  };
}

function buildSelectionVisualInsetsDelta(previousInsets = null, nextInsets = null) {
  if (!previousInsets || !nextInsets) return null;
  return {
    dLeft: roundSelectionVisualMetric(
      Number(nextInsets.left) - Number(previousInsets.left)
    ),
    dTop: roundSelectionVisualMetric(
      Number(nextInsets.top) - Number(previousInsets.top)
    ),
    dRight: roundSelectionVisualMetric(
      Number(nextInsets.right) - Number(previousInsets.right)
    ),
    dBottom: roundSelectionVisualMetric(
      Number(nextInsets.bottom) - Number(previousInsets.bottom)
    ),
  };
}

function hasMeaningfulSelectionVisualInsetsDelta(delta = null, threshold = 0.5) {
  if (!delta) return false;
  return [
    delta.dLeft,
    delta.dTop,
    delta.dRight,
    delta.dBottom,
  ].some((value) => Math.abs(Number(value || 0)) >= threshold);
}

function hasMeaningfulSelectionVisualInsets(insets = null, threshold = 0.5) {
  if (!insets) return false;
  return [
    insets.left,
    insets.top,
    insets.right,
    insets.bottom,
  ].some((value) => Math.abs(Number(value || 0)) >= threshold);
}

function didSelectionVisualMetricAlternate(previousValue, nextValue, threshold = 0.5) {
  const previous = Number(previousValue);
  const next = Number(nextValue);
  if (!Number.isFinite(previous) || !Number.isFinite(next)) return false;
  if (Math.abs(previous) <= threshold || Math.abs(next) <= threshold) {
    return false;
  }
  return (previous < 0 && next > 0) || (previous > 0 && next < 0);
}

function detectSelectionVisualRectDeltaAlternation(
  previousDelta = null,
  nextDelta = null,
  threshold = 0.5
) {
  if (!previousDelta || !nextDelta) {
    return {
      alternated: false,
      axes: [],
    };
  }

  const axes = [];
  if (
    didSelectionVisualMetricAlternate(previousDelta.dx, nextDelta.dx, threshold) ||
    didSelectionVisualMetricAlternate(
      previousDelta.dCenterX,
      nextDelta.dCenterX,
      threshold
    )
  ) {
    axes.push("x");
  }
  if (
    didSelectionVisualMetricAlternate(previousDelta.dy, nextDelta.dy, threshold) ||
    didSelectionVisualMetricAlternate(
      previousDelta.dCenterY,
      nextDelta.dCenterY,
      threshold
    )
  ) {
    axes.push("y");
  }

  return {
    alternated: axes.length > 0,
    axes,
  };
}

function boundsToSelectionVisualRect(bounds = null) {
  if (!bounds || typeof bounds !== "object") return null;

  if (bounds.kind === "polygon" && Array.isArray(bounds.points) && bounds.points.length >= 8) {
    const xs = bounds.points
      .filter((_, index) => index % 2 === 0)
      .map((value) => Number(value))
      .filter(Number.isFinite);
    const ys = bounds.points
      .filter((_, index) => index % 2 === 1)
      .map((value) => Number(value))
      .filter(Number.isFinite);
    if (xs.length === 0 || ys.length === 0) return null;
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  return {
    x: Number(bounds.x) || 0,
    y: Number(bounds.y) || 0,
    width: Number(bounds.width) || 0,
    height: Number(bounds.height) || 0,
  };
}

function readOverlayRenderedStageRect(rectNode, polygonNode, bounds = null) {
  const fallbackRect = boundsToSelectionVisualRect(bounds);

  if (bounds?.kind === "polygon") {
    const polygonPoints =
      typeof polygonNode?.points === "function" ? polygonNode.points() : null;
    if (Array.isArray(polygonPoints) && polygonPoints.length >= 8) {
      return boundsToSelectionVisualRect({
        kind: "polygon",
        points: polygonPoints,
      });
    }
    return fallbackRect;
  }

  if (!rectNode) return fallbackRect;
  return {
    x: typeof rectNode.x === "function" ? Number(rectNode.x() || 0) : Number(bounds?.x || 0),
    y: typeof rectNode.y === "function" ? Number(rectNode.y() || 0) : Number(bounds?.y || 0),
    width:
      typeof rectNode.width === "function"
        ? Number(rectNode.width() || 0)
        : Number(bounds?.width || 0),
    height:
      typeof rectNode.height === "function"
        ? Number(rectNode.height() || 0)
        : Number(bounds?.height || 0),
  };
}

function readTextNodeStageRect(node, stage = null, objectMeta = null) {
  if (!node || typeof node.getClientRect !== "function") return null;
  try {
    const rect = node.getClientRect({
      relativeTo: stage || undefined,
      skipTransform: false,
      skipShadow: true,
      skipStroke: true,
    });
    if (
      !rect ||
      !Number.isFinite(Number(rect.x)) ||
      !Number.isFinite(Number(rect.y)) ||
      !Number.isFinite(Number(rect.width)) ||
      !Number.isFinite(Number(rect.height))
    ) {
      return null;
    }
    const authoritativeTextRect = resolveAuthoritativeTextRect(node, objectMeta, {
      fallbackRect: rect,
    });
    if (authoritativeTextRect) {
      return {
        x: Number(authoritativeTextRect.x),
        y: Number(authoritativeTextRect.y),
        width: Number(authoritativeTextRect.width),
        height: Number(authoritativeTextRect.height),
      };
    }
    return {
      x: Number(rect.x),
      y: Number(rect.y),
      width: Number(rect.width),
      height: Number(rect.height),
    };
  } catch {
    return null;
  }
}

function projectSelectionVisualRectToViewport(stage, rect = null) {
  if (!stage || !rect) return null;

  const containerRect = stage.container?.()?.getBoundingClientRect?.() || null;
  const stageWidth =
    typeof stage.width === "function" ? Number(stage.width() || 0) : 0;
  const stageHeight =
    typeof stage.height === "function" ? Number(stage.height() || 0) : 0;

  if (
    !containerRect ||
    !Number.isFinite(containerRect.left) ||
    !Number.isFinite(containerRect.top) ||
    !Number.isFinite(containerRect.width) ||
    !Number.isFinite(containerRect.height) ||
    stageWidth <= 0 ||
    stageHeight <= 0
  ) {
    return null;
  }

  const scaleX = containerRect.width / stageWidth;
  const scaleY = containerRect.height / stageHeight;

  return {
    x: containerRect.left + Number(rect.x) * scaleX,
    y: containerRect.top + Number(rect.y) * scaleY,
    width: Number(rect.width) * scaleX,
    height: Number(rect.height) * scaleY,
    projectionScaleX: roundSelectionVisualMetric(scaleX, 4),
    projectionScaleY: roundSelectionVisualMetric(scaleY, 4),
  };
}

function buildTextNodeVisualMetrics(node, objectMeta = null) {
  if (!node) return null;

  return {
    node: getKonvaNodeDebugInfo(node),
    objectX: roundSelectionVisualMetric(objectMeta?.x),
    objectY: roundSelectionVisualMetric(objectMeta?.y),
    objectWidth: roundSelectionVisualMetric(objectMeta?.width),
    objectHeight: roundSelectionVisualMetric(objectMeta?.height),
    textLength: String(
      (typeof node.text === "function" ? node.text() : objectMeta?.texto) || ""
    ).length,
    fontSize:
      typeof node.fontSize === "function"
        ? roundSelectionVisualMetric(node.fontSize(), 3)
        : roundSelectionVisualMetric(objectMeta?.fontSize, 3),
    lineHeight:
      typeof node.lineHeight === "function"
        ? roundSelectionVisualMetric(node.lineHeight(), 3)
        : roundSelectionVisualMetric(objectMeta?.lineHeight, 3),
    padding:
      typeof node.padding === "function"
        ? roundSelectionVisualMetric(node.padding(), 3)
        : roundSelectionVisualMetric(objectMeta?.padding, 3),
    align: typeof node.align === "function" ? node.align() || null : objectMeta?.align || null,
    verticalAlign:
      typeof node.verticalAlign === "function"
        ? node.verticalAlign() || null
        : objectMeta?.verticalAlign || null,
    wrap: typeof node.wrap === "function" ? node.wrap() || null : objectMeta?.wrap || null,
    ellipsis:
      typeof node.ellipsis === "function"
        ? Boolean(node.ellipsis())
        : Boolean(objectMeta?.ellipsis),
    letterSpacing:
      typeof node.letterSpacing === "function"
        ? roundSelectionVisualMetric(node.letterSpacing(), 3)
        : roundSelectionVisualMetric(objectMeta?.letterSpacing, 3),
    textWidth:
      typeof node.textWidth === "function"
        ? roundSelectionVisualMetric(node.textWidth(), 3)
        : null,
    textHeight:
      typeof node.textHeight === "function"
        ? roundSelectionVisualMetric(node.textHeight(), 3)
        : null,
  };
}

export function resolveSelectionBounds({
  selectedElements,
  elementRefs,
  objetos,
  objectLookup = null,
  isMobile,
  requireLiveNodes = false,
  debugMeta = null,
}) {
  const elementosData = selectedElements
    .map((id) => objetos.find((obj) => obj.id === id))
    .filter(Boolean);

  if (elementosData.length === 0) {
    return null;
  }

  const padding = getSelectionFramePaddingForSelection(elementosData, isMobile);
  const strokeWidth = getSelectionFrameStrokeWidth(isMobile);
  const selectedObject = elementosData[0] || null;
  const selectedNode = selectedObject ? elementRefs.current?.[selectedObject.id] : null;
  const shouldUseRotatedFrame = shouldUseRotatedSelectionBounds(
    elementosData,
    selectedNode
  );

  if (shouldUseRotatedFrame) {
    const rotatedPoints = buildSelectionFramePolygon(selectedNode, padding);

    if (hasFinitePolygonPoints(rotatedPoints)) {
      return {
        kind: "polygon",
        points: rotatedPoints,
        strokeWidth,
      };
    }
  }
  const rectBounds = resolveSelectionFrameRect({
    selectedElements,
    selectedObjects: elementosData,
    elementRefs,
    objetos,
    objectLookup,
    isMobile,
    includePadding: true,
    requireLiveNodes,
    debugMeta: {
      phase: debugMeta?.phase || (requireLiveNodes ? "drag" : "selected"),
      surface:
        debugMeta?.surface || (requireLiveNodes ? "drag-overlay" : "selected-phase"),
      caller:
        debugMeta?.caller || "SelectionBoundsIndicator:resolveSelectionBounds",
      sessionIdentity: debugMeta?.sessionIdentity || null,
    },
  });
  if (!rectBounds) return null;

  rectBounds.selectedObjects.forEach((obj) => {
    const node = elementRefs.current[obj.id];
    const box = rectBounds.unionRect;
    const boundsSample = sampleCanvasInteractionLog(
      `selection-bounds-indicator:${obj.id}`,
      {
        firstCount: 3,
        throttleMs: 120,
      }
    );
    if (boundsSample.shouldLog) {
      logSelectedDragDebug("selection:bounds-indicator-node-rect", {
        elementId: obj.id,
        tipo: obj.tipo || null,
        figura: obj.figura || null,
        rect: {
          x: Number.isFinite(Number(box?.x)) ? Number(box.x) : null,
          y: Number.isFinite(Number(box?.y)) ? Number(box.y) : null,
          width: Number.isFinite(Number(box?.width)) ? Number(box.width) : null,
          height: Number.isFinite(Number(box?.height)) ? Number(box.height) : null,
        },
        node: getKonvaNodeDebugInfo(node),
      });
    }
  });

  return {
    kind: "rect",
    x: rectBounds.x,
    y: rectBounds.y,
    width: rectBounds.width,
    height: rectBounds.height,
    strokeWidth,
  };
}

const SelectionBoundsIndicator = forwardRef(function SelectionBoundsIndicator({
  selectedElements,
  elementRefs,
  objetos,
  isMobile = false,
  debugLog = () => {},
  debugSource = "selection-bounds-indicator",
  boxFlowIdentity = null,
  boxFlowSessionIdentity = null,
  boxFlowPhase = null,
  lifecycleKey = null,
  boundsControlMode = "auto",
  bringToFront = false,
  onVisualReadyChange = null,
  onFirstControlledFrameVisible = null,
  onBoxFlowBoundsSample = null,
  onControlledMountReady = null,
}, forwardedRef) {
  const groupRef = useRef(null);
  const rectRef = useRef(null);
  const polygonRef = useRef(null);
  const badgeGroupRef = useRef(null);
  const badgeRectRef = useRef(null);
  const badgeTextRef = useRef(null);
  const indicatorSnapshotRef = useRef(null);
  const latestInputsRef = useRef(null);
  const visualMismatchSnapshotRef = useRef(null);
  const controlledModeInitializedRef = useRef(false);
  const controlledMountReadyKeyRef = useRef(null);
  const [controlledMountReadyVersion, setControlledMountReadyVersion] = useState(0);
  const isControlledMode = boundsControlMode === "controlled";
  const selectedIdsDigest = buildCanvasBoxFlowIdsDigest(selectedElements);
  const selectedNodes = selectedElements
    .map((id) => elementRefs.current?.[id] || null)
    .filter(Boolean);
  const selectedNodesKey = buildSelectionIndicatorNodesKey(selectedNodes);
  const selectedGroupObject = useMemo(
    () => resolveSelectedGroupObject(selectedElements, objetos),
    [objetos, selectedIdsDigest]
  );

  latestInputsRef.current = {
    selectedElements,
    selectedIdsDigest,
    selectedNodes,
    elementRefs,
    objetos,
    isMobile,
    bringToFront,
    debugSource,
    boxFlowIdentity,
    boxFlowSessionIdentity,
    boxFlowPhase,
    lifecycleKey,
    selectedGroupObject,
    boundsControlMode,
  };

  const resolveVisualIdentity = useCallback((inputs = latestInputsRef.current || {}, fallback = null) => (
    inputs.boxFlowIdentity ||
    inputs.selectedIdsDigest ||
    inputs.debugSource ||
    fallback ||
    debugSource
  ), [debugSource]);

  const resolveSessionIdentity = useCallback((inputs = latestInputsRef.current || {}, fallback = null) => {
    const candidates = [
      inputs.boxFlowSessionIdentity || null,
      getActiveCanvasBoxFlowSession("selection")?.identity || null,
      resolveVisualIdentity(inputs, fallback),
    ];

    for (const candidate of candidates) {
      const safeCandidate = String(candidate ?? "").trim();
      if (!safeCandidate) continue;
      if (isCanvasBoxFlowIdentityRetired("selection", safeCandidate)) {
        continue;
      }
      return safeCandidate;
    }

    return resolveVisualIdentity(inputs, fallback);
  }, [resolveVisualIdentity]);

  const resolveIndicatorOwner = useCallback((currentDebugSource = debugSource) => (
    currentDebugSource === "drag-overlay" ? "drag-overlay" : "selected-phase"
  ), [debugSource]);

  const resolveIndicatorPhase = useCallback((
    currentDebugSource = debugSource,
    meta = null,
    inputs = latestInputsRef.current || {}
  ) => (
    meta?.phase ||
    inputs.boxFlowPhase ||
    (currentDebugSource === "drag-overlay" ? null : "selected")
  ), [debugSource]);

  const resolveIndicatorGeometryAuthority = useCallback(
    (currentDebugSource = debugSource, currentPhase = null, meta = null) => {
      if (currentDebugSource === "drag-overlay") {
        if (currentPhase === "settling") {
          return "frozen-controlled-snapshot";
        }
        if (
          meta?.source === "predrag-seed" ||
          meta?.source === "drag-selection-seed" ||
          meta?.source === "controlled-seed" ||
          meta?.source === "group-drag-start"
        ) {
          return "startup-seed";
        }
        return "live-nodes";
      }
      return "selected-auto-bounds";
    },
    [debugSource]
  );

  const resolveIndicatorSuppressedLayers = useCallback(
    (currentDebugSource = debugSource) => (
      currentDebugSource === "drag-overlay"
        ? ["hover-indicator", "selected-phase"]
        : []
    ),
    [debugSource]
  );

  const shouldEmitForIdentity = useCallback((identity) => {
    if (!identity) return false;
    if (isCanvasBoxFlowIdentityRetired("selection", identity)) {
      return false;
    }
    if (!boxFlowSessionIdentity && !boxFlowIdentity) {
      return true;
    }
    return getActiveCanvasBoxFlowSession("selection")?.identity === identity;
  }, [boxFlowIdentity, boxFlowSessionIdentity]);

  const updateBadgeVisual = useCallback((bounds, inputs = latestInputsRef.current || {}) => {
    const badgeGroupNode = badgeGroupRef.current;
    const badgeRectNode = badgeRectRef.current;
    const badgeTextNode = badgeTextRef.current;
    if (!badgeGroupNode || !badgeRectNode || !badgeTextNode) {
      return false;
    }

    const nextBadge = buildGroupBadgeLayout(
      inputs.selectedGroupObject || null,
      bounds,
      Boolean(inputs.isMobile)
    );
    const nextVisible = Boolean(nextBadge);
    let didChange = false;

    if (badgeGroupNode.visible() !== nextVisible) {
      badgeGroupNode.visible(nextVisible);
      didChange = true;
    }

    if (!nextBadge) {
      return didChange;
    }

    const nextCornerRadius = nextBadge.height / 2;
    const currentShadowOffset = badgeRectNode.shadowOffset?.() || { x: 0, y: 0 };
    if (
      badgeRectNode.x() !== nextBadge.x ||
      badgeRectNode.y() !== nextBadge.y ||
      badgeRectNode.width() !== nextBadge.width ||
      badgeRectNode.height() !== nextBadge.height ||
      badgeRectNode.cornerRadius() !== nextCornerRadius ||
      currentShadowOffset.x !== 0 ||
      currentShadowOffset.y !== 2
    ) {
      badgeRectNode.setAttrs({
        x: nextBadge.x,
        y: nextBadge.y,
        width: nextBadge.width,
        height: nextBadge.height,
        cornerRadius: nextCornerRadius,
        shadowOffset: { x: 0, y: 2 },
      });
      didChange = true;
    }

    const textY = nextBadge.y + (Boolean(inputs.isMobile) ? 6 : 5);
    if (
      badgeTextNode.x() !== nextBadge.x + nextBadge.paddingX ||
      badgeTextNode.y() !== textY ||
      badgeTextNode.text() !== nextBadge.label ||
      badgeTextNode.fontSize() !== nextBadge.fontSize
    ) {
      badgeTextNode.setAttrs({
        x: nextBadge.x + nextBadge.paddingX,
        y: textY,
        text: nextBadge.label,
        fontSize: nextBadge.fontSize,
      });
      didChange = true;
    }

    return didChange;
  }, []);

  const notifyControlledMountCandidateChanged = useCallback(() => {
    if (!isControlledMode) return;
    setControlledMountReadyVersion((current) => current + 1);
  }, [isControlledMode]);

  const setGroupNodeRef = useCallback((node) => {
    if (groupRef.current === node) return;
    groupRef.current = node;
    notifyControlledMountCandidateChanged();
  }, [notifyControlledMountCandidateChanged]);

  const setPolygonNodeRef = useCallback((node) => {
    if (polygonRef.current === node) return;
    polygonRef.current = node;
    notifyControlledMountCandidateChanged();
  }, [notifyControlledMountCandidateChanged]);

  const setRectNodeRef = useCallback((node) => {
    if (rectRef.current === node) return;
    rectRef.current = node;
    notifyControlledMountCandidateChanged();
  }, [notifyControlledMountCandidateChanged]);

  const maybeLogOverlayTextMismatch = useCallback((nextBounds, meta = {}) => {
    const currentInputs = latestInputsRef.current || {};
    const currentDebugSource =
      meta.debugSource ||
      currentInputs.debugSource ||
      debugSource;

    if (currentDebugSource !== "drag-overlay") return;

    const currentSelectedElements = Array.isArray(meta.selectedIds)
      ? meta.selectedIds
      : (
          Array.isArray(currentInputs.selectedElements)
            ? currentInputs.selectedElements
            : []
        );
    if (currentSelectedElements.length !== 1) return;

    const selectedId = String(currentSelectedElements[0] || "").trim();
    if (!selectedId) return;

    const selectedObject = Array.isArray(currentInputs.objetos)
      ? currentInputs.objetos.find((objeto) => objeto?.id === selectedId) || null
      : null;
    if (selectedObject?.tipo !== "texto") return;

    const selectedNode = currentInputs.elementRefs?.current?.[selectedId] || null;
    const stage =
      selectedNode?.getStage?.() ||
      groupRef.current?.getStage?.() ||
      null;
    if (!stage) return;

    const overlayRequestedStageRect = boundsToSelectionVisualRect(nextBounds);
    const overlayRenderedStageRect = readOverlayRenderedStageRect(
      rectRef.current,
      polygonRef.current,
      nextBounds
    );
    const textStageRect = readTextNodeStageRect(selectedNode, stage, selectedObject);
    const overlayRequestedViewportRect = projectSelectionVisualRectToViewport(
      stage,
      overlayRequestedStageRect
    );
    const overlayRenderedViewportRect = projectSelectionVisualRectToViewport(
      stage,
      overlayRenderedStageRect
    );
    const textViewportRect = projectSelectionVisualRectToViewport(
      stage,
      textStageRect
    );
    const stageInsets = buildSelectionVisualInsets(
      overlayRenderedStageRect,
      textStageRect
    );
    const viewportInsets = buildSelectionVisualInsets(
      overlayRenderedViewportRect,
      textViewportRect
    );

    const currentVisualIdentity =
      meta.identity ||
      currentInputs.boxFlowIdentity ||
      selectedId;
    const currentSessionIdentity =
      meta.sessionIdentity ||
      currentInputs.boxFlowSessionIdentity ||
      currentVisualIdentity;
    const previousSnapshot = visualMismatchSnapshotRef.current || {};
    const overlayStageDelta = buildSelectionVisualRectDelta(
      previousSnapshot.overlayRenderedStageRect,
      overlayRenderedStageRect
    );
    const textStageDelta = buildSelectionVisualRectDelta(
      previousSnapshot.textStageRect,
      textStageRect
    );
    const overlayViewportDelta = buildSelectionVisualRectDelta(
      previousSnapshot.overlayRenderedViewportRect,
      overlayRenderedViewportRect
    );
    const textViewportDelta = buildSelectionVisualRectDelta(
      previousSnapshot.textViewportRect,
      textViewportRect
    );
    const stageInsetsDelta = buildSelectionVisualInsetsDelta(
      previousSnapshot.stageInsets,
      stageInsets
    );
    const viewportInsetsDelta = buildSelectionVisualInsetsDelta(
      previousSnapshot.viewportInsets,
      viewportInsets
    );
    const overlayMovedStage = hasMeaningfulSelectionVisualRectDelta(overlayStageDelta);
    const textMovedStage = hasMeaningfulSelectionVisualRectDelta(textStageDelta);
    const overlayMovedViewport = hasMeaningfulSelectionVisualRectDelta(overlayViewportDelta);
    const textMovedViewport = hasMeaningfulSelectionVisualRectDelta(textViewportDelta);
    const stageMismatchChanged =
      hasMeaningfulSelectionVisualInsetsDelta(stageInsetsDelta);
    const viewportMismatchChanged =
      hasMeaningfulSelectionVisualInsetsDelta(viewportInsetsDelta);
    const sample = sampleCanvasInteractionLog(
      `drag-overlay:text-visual-compare:${currentSessionIdentity || selectedId}`,
      {
        firstCount: 6,
        throttleMs: 120,
      }
    );
    const shouldForceLog =
      stageMismatchChanged ||
      viewportMismatchChanged ||
      overlayMovedStage !== textMovedStage ||
      overlayMovedViewport !== textMovedViewport ||
      meta.source === "dragmove-sync" ||
      meta.source === "controlled-apply";
    const hasStageMismatch = hasMeaningfulSelectionVisualInsets(stageInsets);
    const hasViewportMismatch = hasMeaningfulSelectionVisualInsets(viewportInsets);
    const mismatchFailureReason =
      overlayMovedStage !== textMovedStage
        ? "overlay rendered rect and visible text did not move together in stage space"
        : overlayMovedViewport !== textMovedViewport
          ? "overlay rendered rect and visible text did not move together in viewport space"
          : hasStageMismatch
            ? "overlay rendered rect diverged from visible text rect in stage space"
            : hasViewportMismatch
              ? "overlay rendered rect diverged from visible text rect in viewport space"
              : null;
    const latestSnapSnapshot = readTextGeometryContractSnapshot(
      currentSessionIdentity,
      selectedId,
      {
        preferPrimaryOnly: Boolean(currentSessionIdentity),
      }
    );
    const snapAuthoritativeRect =
      latestSnapSnapshot?.postRereadAuthoritativeRect || null;
    const snapAppliedRect = latestSnapSnapshot?.snapAppliedRect || null;
    const preSnapRect = latestSnapSnapshot?.preSnapRect || null;
    const overlayToTextStageDelta = buildTextGeometryContractRectDelta(
      textStageRect,
      overlayRenderedStageRect
    );
    const overlayRequestedToTextStageDelta = buildTextGeometryContractRectDelta(
      textStageRect,
      overlayRequestedStageRect
    );
    const overlayToTextAlternation = detectSelectionVisualRectDeltaAlternation(
      previousSnapshot.overlayToTextStageDelta,
      overlayToTextStageDelta
    );
    const overlayRequestedToTextAlternation =
      detectSelectionVisualRectDeltaAlternation(
        previousSnapshot.overlayRequestedToTextStageDelta,
        overlayRequestedToTextStageDelta
      );
    const textAlignedToSnapCheck = evaluateTextGeometryContractRectAlignment(
      snapAuthoritativeRect,
      textStageRect,
      {
        tolerance: 0.75,
        expectedLabel: "post-snap authoritative rect",
        actualLabel: "visible text rect",
      }
    );
    const overlayAlignedToSnapCheck = evaluateTextGeometryContractRectAlignment(
      snapAuthoritativeRect,
      overlayRenderedStageRect,
      {
        tolerance: 0.75,
        expectedLabel: "post-snap authoritative rect",
        actualLabel: "overlay rendered rect",
      }
    );
    const overlayRequestedAlignedToSnapCheck = evaluateTextGeometryContractRectAlignment(
      snapAuthoritativeRect,
      overlayRequestedStageRect,
      {
        tolerance: 0.75,
        expectedLabel: "post-snap authoritative rect",
        actualLabel: "overlay requested rect",
      }
    );
    const staleSource =
      !overlayRequestedAlignedToSnapCheck.pass
        ? "selection-bounds-request"
        : !overlayAlignedToSnapCheck.pass
          ? "rendered-overlay-frame"
          : null;
    const explicitSnapOverlayFailure =
      Boolean(latestSnapSnapshot?.snapCommitted) &&
      textAlignedToSnapCheck.pass &&
      !overlayAlignedToSnapCheck.pass;
    const visualNowMs = getSelectionVisualNowMs();
    const previousMismatchFrameCount = Number(previousSnapshot.mismatchFrameCount || 0);
    const previousMismatchActive = previousSnapshot.explicitSnapOverlayFailure === true;
    const mismatchFrameCount = explicitSnapOverlayFailure
      ? previousMismatchActive
        ? previousMismatchFrameCount + 1
        : 1
      : 0;
    const mismatchFirstAtMs = explicitSnapOverlayFailure
      ? previousMismatchActive
        ? Number(previousSnapshot.mismatchFirstAtMs || visualNowMs)
        : visualNowMs
      : null;
    const mismatchDurationMs = explicitSnapOverlayFailure
      ? roundTextGeometryContractMetric(visualNowMs - Number(mismatchFirstAtMs || visualNowMs), 3)
      : null;
    const latestSnapRecordedAtMs = Number(latestSnapSnapshot?.recordedAtMs);
    const latestSnapAgeMs = Number.isFinite(latestSnapRecordedAtMs)
      ? roundTextGeometryContractMetric(visualNowMs - latestSnapRecordedAtMs, 3)
      : null;
    const alternatingGeometryValues =
      overlayToTextAlternation.alternated ||
      overlayRequestedToTextAlternation.alternated;
    const previousAlternatingActive =
      previousSnapshot.alternatingGeometryValues === true;
    const alternatingMismatchCount = alternatingGeometryValues
      ? previousAlternatingActive
        ? Number(previousSnapshot.alternatingMismatchCount || 0) + 1
        : 1
      : 0;
    const mismatchRelativeToSnap =
      explicitSnapOverlayFailure
        ? (
            meta.source === "guide-post-snap-sync"
              ? "after-post-snap-overlay-resync"
              : "after-snap-before-overlay-convergence"
          )
        : (
            latestSnapSnapshot?.snapCommitted
              ? "post-snap-converged"
              : "pre-snap-or-no-snap"
          );
    const thresholdOscillationLikely =
      latestSnapSnapshot?.thresholdOscillationLikely === true ||
      latestSnapSnapshot?.rapidFlip === true;

    if (sample.shouldLog || shouldForceLog) {
      logSelectedDragDebug("overlay:text-visual-compare", {
        sampleCount: sample.sampleCount,
        perfNowMs: roundSelectionVisualMetric(getSelectionVisualNowMs()),
        dragOverlaySessionKey: currentVisualIdentity || null,
        sessionIdentity: currentSessionIdentity || null,
        lifecycleKey: meta.lifecycleKey || currentInputs.lifecycleKey || null,
        phase: meta.phase || currentInputs.boxFlowPhase || null,
        dragId: meta.dragId || null,
        elementId: selectedId,
        tipo: selectedObject?.tipo || null,
        source: meta.source || "manual",
        overlayRequestedStageRect:
          buildSelectionVisualRect(overlayRequestedStageRect),
        overlayRenderedStageRect:
          buildSelectionVisualRect(overlayRenderedStageRect),
        textStageRect: buildSelectionVisualRect(textStageRect),
        overlayRequestedViewportRect:
          buildSelectionVisualRect(overlayRequestedViewportRect),
        overlayRenderedViewportRect:
          buildSelectionVisualRect(overlayRenderedViewportRect),
        textViewportRect: buildSelectionVisualRect(textViewportRect),
        stageInsets,
        viewportInsets,
        overlayStageDelta,
        textStageDelta,
        overlayViewportDelta,
        textViewportDelta,
        stageInsetsDelta,
        viewportInsetsDelta,
        overlayMovedStage,
        textMovedStage,
        overlayMovedViewport,
        textMovedViewport,
        stageMismatchChanged,
        viewportMismatchChanged,
        didOverlayAttrsChange: meta.didChange === true,
        overlayRectVisible:
          typeof rectRef.current?.visible === "function"
            ? Boolean(rectRef.current.visible())
            : null,
        overlayPolygonVisible:
          typeof polygonRef.current?.visible === "function"
            ? Boolean(polygonRef.current.visible())
            : null,
        paintMode: isControlledMode ? "immediate-draw" : "batched-draw",
        projectionScaleX:
          overlayRenderedViewportRect?.projectionScaleX ||
          overlayRequestedViewportRect?.projectionScaleX ||
          null,
        projectionScaleY:
          overlayRenderedViewportRect?.projectionScaleY ||
          overlayRequestedViewportRect?.projectionScaleY ||
          null,
        latestSnapSnapshot,
        textAlignedToSnap: textAlignedToSnapCheck.pass,
        overlayAlignedToSnap: overlayAlignedToSnapCheck.pass,
        overlayRequestedAlignedToSnap:
          overlayRequestedAlignedToSnapCheck.pass,
        staleSource,
        mismatchRelativeToSnap,
        latestSnapAgeMs,
        thresholdOscillationLikely,
        mismatchFrameCount,
        mismatchDurationMs,
        overlayToTextStageDelta,
        overlayRequestedToTextStageDelta,
        alternatingGeometryValues,
        alternatingMismatchCount,
        overlayToTextAlternationAxes: overlayToTextAlternation.axes,
        overlayRequestedToTextAlternationAxes:
          overlayRequestedToTextAlternation.axes,
        textNode: buildTextNodeVisualMetrics(selectedNode, selectedObject),
      });
    }

    logTextGeometryContractInvariant(
      "drag-overlay-rendered-vs-visible-text",
      {
        phase: meta.phase || currentInputs.boxFlowPhase || null,
        surface: "drag-overlay",
        authoritySource: meta.source || currentDebugSource || "manual",
        sessionIdentity: currentSessionIdentity || null,
        dragOverlaySessionKey: currentVisualIdentity || null,
        lifecycleKey: meta.lifecycleKey || currentInputs.lifecycleKey || null,
        dragId: meta.dragId || null,
        elementId: selectedId,
        tipo: selectedObject?.tipo || null,
        pass: !mismatchFailureReason,
        failureReason: mismatchFailureReason,
        observedRects: {
          overlayRequestedStageRect:
            buildTextGeometryContractRect(overlayRequestedStageRect),
          overlayRenderedStageRect:
            buildTextGeometryContractRect(overlayRenderedStageRect),
          textStageRect: buildTextGeometryContractRect(textStageRect),
          overlayRequestedViewportRect:
            buildTextGeometryContractRect(overlayRequestedViewportRect),
          overlayRenderedViewportRect:
            buildTextGeometryContractRect(overlayRenderedViewportRect),
          textViewportRect: buildTextGeometryContractRect(textViewportRect),
        },
        observedSources: {
          currentDebugSource,
          didOverlayAttrsChange: meta.didChange === true,
          paintMode: isControlledMode ? "immediate-draw" : "batched-draw",
          overlayMovedStage,
          textMovedStage,
          overlayMovedViewport,
          textMovedViewport,
        },
        stageInsets,
        viewportInsets,
        stageInsetsDelta,
        viewportInsetsDelta,
      },
      {
        sampleKey: `text-contract:overlay-rendered:${currentSessionIdentity || selectedId}`,
        firstCount: 5,
        throttleMs: 120,
        force: shouldForceLog || Boolean(mismatchFailureReason),
      }
    );

    logTextGeometryContractInvariant(
      "drag-overlay-stale-after-snap",
      {
        phase: meta.phase || currentInputs.boxFlowPhase || null,
        surface: "drag-overlay",
        authoritySource: staleSource || (meta.source || currentDebugSource || "manual"),
        sessionIdentity: currentSessionIdentity || null,
        dragOverlaySessionKey: currentVisualIdentity || null,
        lifecycleKey: meta.lifecycleKey || currentInputs.lifecycleKey || null,
        dragId: meta.dragId || null,
        elementId: selectedId,
        tipo: selectedObject?.tipo || null,
        pass: !explicitSnapOverlayFailure,
        failureReason: explicitSnapOverlayFailure
          ? `visible text already matches post-snap authoritative rect, but overlay remains horizontally/visually stale from ${staleSource || "unknown-source"}`
          : null,
        observedRects: {
          preSnapRect,
          snapAppliedRect,
          postRereadAuthoritativeRect: snapAuthoritativeRect,
          renderedVisibleTextRect: buildTextGeometryContractRect(textStageRect),
          overlayRequestedStageRect:
            buildTextGeometryContractRect(overlayRequestedStageRect),
          overlayRenderedStageRect:
            buildTextGeometryContractRect(overlayRenderedStageRect),
        },
        observedSources: {
          latestSnapType: latestSnapSnapshot?.type || null,
          latestSnapSource: latestSnapSnapshot?.source || null,
          latestSnapWinnerX: latestSnapSnapshot?.winnerX || null,
          latestSnapWinnerY: latestSnapSnapshot?.winnerY || null,
          latestSnapXSource: latestSnapSnapshot?.snapXSource || null,
          latestSnapYSource: latestSnapSnapshot?.snapYSource || null,
          latestSnapAgeMs,
          thresholdOscillationLikely,
          staleSource,
          mismatchRelativeToSnap,
          mismatchFrameCount,
          mismatchDurationMs,
          mismatchPersistsMultipleFrames: mismatchFrameCount > 1,
          alternatingGeometryValues,
          alternatingMismatchCount,
          overlayToTextAlternationAxes: overlayToTextAlternation.axes,
          overlayRequestedToTextAlternationAxes:
            overlayRequestedToTextAlternation.axes,
        },
        deltas: {
          textToSnap: textAlignedToSnapCheck.delta,
          overlayRenderedToSnap: overlayAlignedToSnapCheck.delta,
          overlayRequestedToSnap: overlayRequestedAlignedToSnapCheck.delta,
          overlayToVisibleText: buildTextGeometryContractRectDelta(
            textStageRect,
            overlayRenderedStageRect
          ),
          overlayToTextStageDelta,
          overlayRequestedToTextStageDelta,
        },
      },
      {
        sampleKey: `text-contract:overlay-stale-after-snap:${currentSessionIdentity || selectedId}`,
        firstCount: 3,
        throttleMs: 100,
        force: explicitSnapOverlayFailure,
      }
    );

    visualMismatchSnapshotRef.current = {
      sessionIdentity: currentSessionIdentity,
      overlayRenderedStageRect,
      textStageRect,
      overlayRenderedViewportRect,
      textViewportRect,
      stageInsets,
      viewportInsets,
      explicitSnapOverlayFailure,
      mismatchFrameCount,
      mismatchFirstAtMs,
      overlayToTextStageDelta,
      overlayRequestedToTextStageDelta,
      alternatingGeometryValues,
      alternatingMismatchCount,
    };
  }, [debugSource]);

  const clearIndicatorVisuals = useCallback((meta = {}) => {
    const groupNode = groupRef.current;
    const rectNode = rectRef.current;
    const polygonNode = polygonRef.current;
    const badgeGroupNode = badgeGroupRef.current;
    const previousSnapshot = indicatorSnapshotRef.current;
    const currentInputs = latestInputsRef.current || {};
    const currentDebugSource =
      meta.debugSource ||
      currentInputs.debugSource ||
      debugSource;
    const currentVisualIdentity =
      meta.visualIdentity ||
      meta.identity ||
      previousSnapshot?.visualIdentity ||
      resolveVisualIdentity(currentInputs, currentDebugSource);
    const currentSessionIdentity =
      meta.sessionIdentity ||
      previousSnapshot?.sessionIdentity ||
      resolveSessionIdentity(currentInputs, currentVisualIdentity);

    if (groupNode && rectNode && polygonNode) {
      let didChange = false;
      if (rectNode.visible()) {
        rectNode.visible(false);
        didChange = true;
      }
      if (polygonNode.visible()) {
        polygonNode.visible(false);
        didChange = true;
      }
      if (badgeGroupNode?.visible()) {
        badgeGroupNode.visible(false);
        didChange = true;
      }
      if (didChange) {
        flushIndicatorLayerDraw(groupNode, isControlledMode);
      }
    }

    const previousSessionIdentity = resolveSessionIdentity(
      {
        boxFlowSessionIdentity: previousSnapshot?.sessionIdentity || null,
        boxFlowIdentity: previousSnapshot?.visualIdentity || null,
      },
      previousSnapshot?.visualIdentity || currentVisualIdentity
    );
    if (previousSnapshot?.visible && shouldEmitForIdentity(previousSessionIdentity)) {
      const logPhase = resolveIndicatorPhase(currentDebugSource, meta);
      flushCanvasBoxFlowSummary("selection", `${currentDebugSource}:bounds`, {
        reason: meta.reason || "hidden",
      });
      logCanvasBoxFlow("selection", "selection-box:hidden", {
        source: currentDebugSource,
        selectedIds: previousSnapshot.visualIdentity,
        visualIds: previousSnapshot.visualIdentity,
        phase: logPhase,
        owner: resolveIndicatorOwner(currentDebugSource),
        selectionAuthority:
          currentDebugSource === "drag-overlay" ? "drag-session" : "logical-selection",
        geometryAuthority: resolveIndicatorGeometryAuthority(
          currentDebugSource,
          logPhase,
          meta
        ),
        overlayVisible: currentDebugSource === "drag-overlay" ? false : false,
        settling: logPhase === "settling",
        suppressedLayers: resolveIndicatorSuppressedLayers(currentDebugSource),
        reason: meta.reason || "hidden",
      }, {
        identity: previousSessionIdentity,
      });
    }

    indicatorSnapshotRef.current = {
      visible: false,
      boundsDigest: null,
      debugSource: currentDebugSource,
      visualIdentity: currentVisualIdentity,
      sessionIdentity: currentSessionIdentity,
    };
    visualMismatchSnapshotRef.current = null;

    if (isControlledMode && typeof onVisualReadyChange === "function") {
      onVisualReadyChange(false);
    }

    return indicatorSnapshotRef.current;
  }, [
    debugSource,
    isControlledMode,
    onVisualReadyChange,
    resolveIndicatorGeometryAuthority,
    resolveIndicatorOwner,
    resolveIndicatorPhase,
    resolveIndicatorSuppressedLayers,
    shouldEmitForIdentity,
    visualMismatchSnapshotRef,
  ]);

  const applyIndicatorBounds = useCallback((nextBounds, meta = {}) => {
    const groupNode = groupRef.current;
    const rectNode = rectRef.current;
    const polygonNode = polygonRef.current;
    if (!groupNode || !rectNode || !polygonNode) return null;
    if (!nextBounds) {
      return clearIndicatorVisuals(meta);
    }

    const currentInputs = latestInputsRef.current || {};
    const currentDebugSource =
      meta.debugSource ||
      currentInputs.debugSource ||
      debugSource;
    const currentSelectedIds = Array.isArray(meta.selectedIds)
      ? meta.selectedIds
      : (
          Array.isArray(currentInputs.selectedElements)
            ? currentInputs.selectedElements
            : []
        );
    const currentSelectedIdsDigest =
      buildCanvasBoxFlowIdsDigest(currentSelectedIds) ||
      currentInputs.selectedIdsDigest ||
      null;
    const currentVisualIdentity =
      meta.visualIdentity ||
      currentSelectedIdsDigest ||
      meta.identity ||
      resolveVisualIdentity(currentInputs, currentDebugSource);
    const currentSessionIdentity =
      meta.sessionIdentity ||
      resolveSessionIdentity(currentInputs, currentVisualIdentity);
    const nextBoundsDigest = buildCanvasBoxFlowBoundsDigest(nextBounds);
    if (!nextBoundsDigest) return null;

    const nextDash = currentInputs.selectedGroupObject ? [8, 4] : [];
    let didChange = false;

    if (nextBounds.kind === "polygon") {
      if (
        !polygonNode.visible() ||
        !arePointArraysEqual(polygonNode.points(), nextBounds.points) ||
        polygonNode.strokeWidth() !== nextBounds.strokeWidth ||
        !arePointArraysEqual(polygonNode.dash(), nextDash)
      ) {
        polygonNode.visible(true);
        polygonNode.points(nextBounds.points);
        polygonNode.strokeWidth(nextBounds.strokeWidth);
        polygonNode.dash(nextDash);
        didChange = true;
      }

      if (rectNode.visible()) {
        rectNode.visible(false);
        didChange = true;
      }
    } else {
      if (
        !rectNode.visible() ||
        rectNode.x() !== nextBounds.x ||
        rectNode.y() !== nextBounds.y ||
        rectNode.width() !== nextBounds.width ||
        rectNode.height() !== nextBounds.height ||
        rectNode.strokeWidth() !== nextBounds.strokeWidth ||
        !arePointArraysEqual(rectNode.dash(), nextDash)
      ) {
        rectNode.visible(true);
        rectNode.setAttrs({
          x: nextBounds.x,
          y: nextBounds.y,
          width: nextBounds.width,
          height: nextBounds.height,
          strokeWidth: nextBounds.strokeWidth,
          dash: nextDash,
        });
        didChange = true;
      }

      if (polygonNode.visible()) {
        polygonNode.visible(false);
        didChange = true;
      }
    }

    if (currentInputs.bringToFront && typeof groupNode.moveToTop === "function") {
      groupNode.moveToTop();
      didChange = true;
    }

    if (updateBadgeVisual(nextBounds, currentInputs)) {
      didChange = true;
    }

    if (didChange) {
      flushIndicatorLayerDraw(groupNode, isControlledMode);
    }

    const previousSnapshot = indicatorSnapshotRef.current;
    const shouldLogRecalc =
      shouldEmitForIdentity(currentSessionIdentity) &&
      (
        !previousSnapshot?.visible ||
        previousSnapshot.sessionIdentity !== currentSessionIdentity ||
        previousSnapshot.visualIdentity !== currentVisualIdentity ||
        !areBoundsDigestsEqual(previousSnapshot.boundsDigest, nextBoundsDigest) ||
        previousSnapshot.debugSource !== currentDebugSource
      );
    if (shouldLogRecalc) {
      const logPhase = resolveIndicatorPhase(currentDebugSource, meta);
      logCanvasBoxFlow("selection", "bounds:recalc", {
        source: meta.source || "manual",
        debugSource: currentDebugSource,
        selectedIds: currentSelectedIdsDigest,
        visualIds: currentSelectedIdsDigest,
        phase: logPhase,
        owner: resolveIndicatorOwner(currentDebugSource),
        selectionAuthority:
          currentDebugSource === "drag-overlay" ? "drag-session" : "logical-selection",
        geometryAuthority: resolveIndicatorGeometryAuthority(
          currentDebugSource,
          logPhase,
          meta
        ),
        geometrySource: meta.geometrySource || null,
        overlayVisible: currentDebugSource === "drag-overlay",
        settling: logPhase === "settling",
        suppressedLayers: resolveIndicatorSuppressedLayers(currentDebugSource),
        bounds: nextBoundsDigest,
      }, {
        identity: currentSessionIdentity,
      });
    }

    if (
      isControlledMode &&
      typeof onFirstControlledFrameVisible === "function" &&
      (
        !previousSnapshot?.visible ||
        previousSnapshot.sessionIdentity !== currentSessionIdentity ||
        previousSnapshot.visualIdentity !== currentVisualIdentity
      )
    ) {
      onFirstControlledFrameVisible({
        source: meta.source || "manual",
        debugSource: currentDebugSource,
        selectedIds: [...currentSelectedIds],
        bounds: nextBoundsDigest,
        lifecycleKey: meta.lifecycleKey || currentInputs.lifecycleKey || null,
        boxFlowIdentity: currentVisualIdentity,
        sessionIdentity: currentSessionIdentity,
        syncToken: meta.syncToken || null,
      });
    }

    if (
      shouldEmitForIdentity(currentSessionIdentity) &&
      (
        !previousSnapshot?.visible ||
        previousSnapshot.sessionIdentity !== currentSessionIdentity ||
        previousSnapshot.visualIdentity !== currentVisualIdentity
      )
    ) {
      const logPhase = resolveIndicatorPhase(currentDebugSource, meta);
      logCanvasBoxFlow("selection", "selection-box:shown", {
        source: currentDebugSource,
        selectedIds: currentSelectedIdsDigest,
        visualIds: currentSelectedIdsDigest,
        phase: logPhase,
        owner: resolveIndicatorOwner(currentDebugSource),
        selectionAuthority:
          currentDebugSource === "drag-overlay" ? "drag-session" : "logical-selection",
        geometryAuthority: resolveIndicatorGeometryAuthority(
          currentDebugSource,
          logPhase,
          meta
        ),
        geometrySource: meta.geometrySource || null,
        overlayVisible: currentDebugSource === "drag-overlay",
        settling: logPhase === "settling",
        suppressedLayers: resolveIndicatorSuppressedLayers(currentDebugSource),
        bounds: nextBoundsDigest,
        syncToken: meta.syncToken || null,
      }, {
        identity: currentSessionIdentity,
      });
    }

    if (shouldEmitForIdentity(currentSessionIdentity)) {
      const logPhase = resolveIndicatorPhase(currentDebugSource, meta);
      recordCanvasBoxFlowSummary(
        "selection",
        `${currentDebugSource}:bounds`,
        {
          source: meta.source || "manual",
          debugSource: currentDebugSource,
          selectedIds: currentSelectedIdsDigest,
          visualIds: currentSelectedIdsDigest,
          phase: logPhase,
          owner: resolveIndicatorOwner(currentDebugSource),
          selectionAuthority:
            currentDebugSource === "drag-overlay" ? "drag-session" : "logical-selection",
          geometryAuthority: resolveIndicatorGeometryAuthority(
            currentDebugSource,
            logPhase,
            meta
          ),
          geometrySource: meta.geometrySource || null,
          overlayVisible: currentDebugSource === "drag-overlay",
          settling: logPhase === "settling",
          suppressedLayers: resolveIndicatorSuppressedLayers(currentDebugSource),
          bounds: nextBoundsDigest,
        },
        {
          identity: currentSessionIdentity,
          eventName: "bounds:summary",
        }
      );
    }

    if (typeof onBoxFlowBoundsSample === "function") {
      onBoxFlowBoundsSample({
        source: meta.source || "manual",
        debugSource: currentDebugSource,
        selectedIds: [...currentSelectedIds],
        bounds: nextBoundsDigest,
        lifecycleKey: meta.lifecycleKey || currentInputs.lifecycleKey || null,
        boxFlowIdentity: currentVisualIdentity,
        sessionIdentity: currentSessionIdentity,
        syncToken: meta.syncToken || null,
        geometrySource: meta.geometrySource || null,
        paintMode: isControlledMode ? "immediate-draw" : "batched-draw",
      });
    }

    maybeLogOverlayTextMismatch(nextBounds, {
      ...meta,
      didChange,
      debugSource: currentDebugSource,
      selectedIds: currentSelectedIds,
      sessionIdentity: currentSessionIdentity,
      identity: currentVisualIdentity,
    });

    indicatorSnapshotRef.current = {
      visible: true,
      boundsDigest: nextBoundsDigest,
      debugSource: currentDebugSource,
      visualIdentity: currentVisualIdentity,
      sessionIdentity: currentSessionIdentity,
    };

    if (
      isControlledMode &&
      typeof onVisualReadyChange === "function" &&
      (
        !previousSnapshot?.visible ||
        previousSnapshot.sessionIdentity !== currentSessionIdentity ||
        previousSnapshot.visualIdentity !== currentVisualIdentity
      )
    ) {
      onVisualReadyChange(true);
    }

    return indicatorSnapshotRef.current;
  }, [
    clearIndicatorVisuals,
    debugSource,
    isControlledMode,
    onFirstControlledFrameVisible,
    onBoxFlowBoundsSample,
    onVisualReadyChange,
    maybeLogOverlayTextMismatch,
    resolveIndicatorGeometryAuthority,
    resolveIndicatorOwner,
    resolveIndicatorPhase,
    resolveIndicatorSuppressedLayers,
    shouldEmitForIdentity,
    updateBadgeVisual,
  ]);

  const syncIndicatorBounds = useCallback((source = "manual") => {
    if (isControlledMode) return null;
    if (!groupRef.current || !rectRef.current || !polygonRef.current) return null;
    const currentInputs = latestInputsRef.current || {};
    const currentSelectedElements = Array.isArray(currentInputs.selectedElements)
      ? currentInputs.selectedElements
      : [];
    const currentSelectedNodes = Array.isArray(currentInputs.selectedNodes)
      ? currentInputs.selectedNodes
      : [];
    const visualIdentity = resolveVisualIdentity(currentInputs, debugSource);
    const sessionIdentity = resolveSessionIdentity(currentInputs, visualIdentity);

    if (
      (source === "node-x-change" || source === "node-y-change") &&
      currentSelectedNodes.some((node) => isKonvaNodeDragging(node))
    ) {
      return;
    }

    const nextBounds = resolveSelectionBounds({
      selectedElements: currentSelectedElements,
      elementRefs: currentInputs.elementRefs || elementRefs,
      objetos: currentInputs.objetos || objetos,
      isMobile: Boolean(currentInputs.isMobile),
      requireLiveNodes: false,
      debugMeta: {
        phase: "selected",
        surface:
          currentInputs.debugSource === "selection-bounds-indicator"
            ? "selected-phase"
            : currentInputs.debugSource || debugSource,
        caller: "SelectionBoundsIndicator:syncIndicatorBounds",
        sessionIdentity,
      },
    });

    return applyIndicatorBounds(nextBounds, {
      source,
      debugSource: currentInputs.debugSource || debugSource,
      selectedIds: currentSelectedElements,
      visualIdentity,
      sessionIdentity,
      lifecycleKey: currentInputs.lifecycleKey || null,
    });
  }, [
    applyIndicatorBounds,
    debugSource,
    isControlledMode,
    resolveSessionIdentity,
    resolveVisualIdentity,
  ]);

  useEffect(() => {
    if (isControlledMode) return undefined;
    const stage =
      selectedNodes.find((node) => typeof node?.getStage === "function")?.getStage?.() ||
      null;

    if (selectedNodes.length === 0 && !stage) return;

    const visualIdentity = resolveVisualIdentity();
    const sessionIdentity = resolveSessionIdentity(latestInputsRef.current || {}, visualIdentity);
    if (shouldEmitForIdentity(sessionIdentity)) {
      logCanvasBoxFlow("selection", "bounds:listeners-attached", {
        source: debugSource,
        selectedIds: selectedIdsDigest,
        nodeCount: selectedNodes.length,
        stageBound: Boolean(stage),
      }, {
        identity: sessionIdentity,
      });
    }

    const dragMoveHandler = () => syncIndicatorBounds("node-dragmove");
    const transformHandler = () => syncIndicatorBounds("node-transform");
    const xChangeHandler = () => syncIndicatorBounds("node-x-change");
    const yChangeHandler = () => syncIndicatorBounds("node-y-change");
    const rotationChangeHandler = () => syncIndicatorBounds("node-rotation-change");
    const scaleXChangeHandler = () => syncIndicatorBounds("node-scaleX-change");
    const scaleYChangeHandler = () => syncIndicatorBounds("node-scaleY-change");
    const stageDragMoveHandler = (event) => {
      if (
        event?.target &&
        event?.currentTarget &&
        event.target !== event.currentTarget
      ) {
        return;
      }
      syncIndicatorBounds("stage-dragmove");
    };

    selectedNodes.forEach((node) => {
      node.on("dragmove.selection-bounds-indicator", dragMoveHandler);
      node.on("transform.selection-bounds-indicator", transformHandler);
      node.on("xChange.selection-bounds-indicator", xChangeHandler);
      node.on("yChange.selection-bounds-indicator", yChangeHandler);
      node.on("rotationChange.selection-bounds-indicator", rotationChangeHandler);
      node.on("scaleXChange.selection-bounds-indicator", scaleXChangeHandler);
      node.on("scaleYChange.selection-bounds-indicator", scaleYChangeHandler);
    });

    stage?.on("dragmove.selection-bounds-indicator", stageDragMoveHandler);
    syncIndicatorBounds("effect-init");

    return () => {
      selectedNodes.forEach((node) => {
        node.off("dragmove.selection-bounds-indicator", dragMoveHandler);
        node.off("transform.selection-bounds-indicator", transformHandler);
        node.off("xChange.selection-bounds-indicator", xChangeHandler);
        node.off("yChange.selection-bounds-indicator", yChangeHandler);
        node.off("rotationChange.selection-bounds-indicator", rotationChangeHandler);
        node.off("scaleXChange.selection-bounds-indicator", scaleXChangeHandler);
        node.off("scaleYChange.selection-bounds-indicator", scaleYChangeHandler);
      });
      stage?.off("dragmove.selection-bounds-indicator", stageDragMoveHandler);
      if (shouldEmitForIdentity(sessionIdentity)) {
        flushCanvasBoxFlowSummary("selection", `${debugSource}:bounds`, {
          reason: boxFlowIdentity ? "overlay-session-end" : "listeners-detached",
        });
        logCanvasBoxFlow("selection", "bounds:listeners-detached", {
          source: debugSource,
          selectedIds: selectedIdsDigest,
          reason: boxFlowIdentity ? "overlay-session-end" : "listeners-detached",
        }, {
          identity: sessionIdentity,
        });
      }
    };
  }, [
    boxFlowIdentity,
    boxFlowSessionIdentity,
    debugSource,
    isControlledMode,
    lifecycleKey,
    resolveSessionIdentity,
    resolveVisualIdentity,
    selectedIdsDigest,
    selectedNodesKey,
    syncIndicatorBounds,
    shouldEmitForIdentity,
  ]);

  const indicatorVisualIdentity =
    resolveVisualIdentity();
  const indicatorSessionIdentity =
    resolveSessionIdentity(latestInputsRef.current || {}, indicatorVisualIdentity);
  const bounds = isControlledMode
    ? null
    : resolveSelectionBounds({
        selectedElements,
        elementRefs,
        objetos,
        isMobile,
        debugLog,
        debugMeta: {
          phase: "selected",
          surface:
            debugSource === "selection-bounds-indicator"
              ? "selected-phase"
              : debugSource,
          caller: "SelectionBoundsIndicator:render",
          sessionIdentity: indicatorSessionIdentity,
        },
      });
  const hasBounds = Boolean(bounds);
  const boundsDigest = isControlledMode
    ? null
    : buildCanvasBoxFlowBoundsDigest(bounds);
  const groupBadge = useMemo(
    () => (
      isControlledMode
        ? null
        : buildGroupBadgeLayout(selectedGroupObject, bounds, isMobile)
    ),
    [bounds, isControlledMode, isMobile, selectedGroupObject]
  );

  useEffect(() => {
    if (isControlledMode) return undefined;
    const nextSnapshot = {
      visible: hasBounds,
      boundsDigest,
      debugSource,
      visualIdentity: indicatorVisualIdentity,
      sessionIdentity: indicatorSessionIdentity,
    };
    const previousSnapshot = indicatorSnapshotRef.current;
    indicatorSnapshotRef.current = nextSnapshot;
    const previousSessionIdentity = resolveSessionIdentity(
      {
        boxFlowSessionIdentity: previousSnapshot?.sessionIdentity || null,
        boxFlowIdentity: previousSnapshot?.visualIdentity || null,
      },
      previousSnapshot?.visualIdentity || debugSource
    );
    const nextSessionIdentity = resolveSessionIdentity(
      {
        boxFlowSessionIdentity: nextSnapshot.sessionIdentity,
        boxFlowIdentity: nextSnapshot.visualIdentity,
      },
      nextSnapshot.visualIdentity || debugSource
    );

    if (
      previousSnapshot?.visible &&
      (
        !nextSnapshot.visible ||
        previousSnapshot.sessionIdentity !== nextSnapshot.sessionIdentity ||
        previousSnapshot.visualIdentity !== nextSnapshot.visualIdentity
      )
    ) {
      if (shouldEmitForIdentity(previousSessionIdentity)) {
        flushCanvasBoxFlowSummary("selection", `${debugSource}:bounds`, {
          reason: boxFlowIdentity ? "overlay-hidden" : "hidden",
        });
        logCanvasBoxFlow("selection", "selection-box:hidden", {
          source: debugSource,
          selectedIds: previousSnapshot.visualIdentity,
          visualIds: previousSnapshot.visualIdentity,
          phase: "selected",
          owner: resolveIndicatorOwner(debugSource),
          selectionAuthority: "logical-selection",
          geometryAuthority: resolveIndicatorGeometryAuthority(debugSource, "selected"),
          overlayVisible: false,
          settling: false,
          suppressedLayers: [],
          reason:
            previousSnapshot.visualIdentity !== nextSnapshot.visualIdentity
              ? "selection-changed"
              : (boxFlowIdentity ? "overlay-hidden" : "hidden"),
        }, {
          identity: previousSessionIdentity,
        });
      }
    }

    if (!nextSnapshot.visible || !boundsDigest) return;

    if (
      shouldEmitForIdentity(nextSessionIdentity) &&
      (
        !previousSnapshot?.visible ||
        previousSnapshot.sessionIdentity !== indicatorSessionIdentity ||
        previousSnapshot.visualIdentity !== indicatorVisualIdentity
      )
    ) {
      logCanvasBoxFlow("selection", "selection-box:shown", {
        source: debugSource,
        selectedIds: selectedIdsDigest,
        visualIds: selectedIdsDigest,
        phase: "selected",
        owner: resolveIndicatorOwner(debugSource),
        selectionAuthority: "logical-selection",
        geometryAuthority: resolveIndicatorGeometryAuthority(debugSource, "selected"),
        overlayVisible: false,
        settling: false,
        suppressedLayers: [],
        bounds: boundsDigest,
      }, {
        identity: nextSessionIdentity,
      });
    }
  }, [
    boundsDigest,
    boxFlowIdentity,
    boxFlowSessionIdentity,
    debugSource,
    hasBounds,
    indicatorSessionIdentity,
    indicatorVisualIdentity,
    isControlledMode,
    resolveIndicatorGeometryAuthority,
    resolveIndicatorOwner,
    resolveIndicatorPhase,
    resolveSessionIdentity,
    resolveVisualIdentity,
    selectedIdsDigest,
    shouldEmitForIdentity,
  ]);

  useEffect(() => {
    if (!isControlledMode) return undefined;

    if (!controlledModeInitializedRef.current) {
      try {
        rectRef.current?.visible(false);
        polygonRef.current?.visible(false);
        badgeGroupRef.current?.visible(false);
        flushIndicatorLayerDraw(groupRef.current, true);
      } catch {}
      controlledModeInitializedRef.current = true;
    }

    return () => {
      const snapshot = indicatorSnapshotRef.current;
      if (!snapshot?.visible) return;
      const currentInputs = latestInputsRef.current || {};
      const currentDebugSource =
        currentInputs.debugSource ||
        debugSource;
      const snapshotSessionIdentity = resolveSessionIdentity(
        {
          boxFlowSessionIdentity: snapshot.sessionIdentity || null,
          boxFlowIdentity: snapshot.visualIdentity || null,
        },
        snapshot.visualIdentity || currentDebugSource
      );
      const cleanupPhase = resolveIndicatorPhase(
        currentDebugSource,
        null,
        currentInputs
      );
      const cleanupReason =
        currentInputs.boxFlowIdentity ? "overlay-session-end" : "controlled-unmount";
      const isDragOverlay = currentDebugSource === "drag-overlay";
      if (isDragOverlay && shouldEmitForIdentity(snapshotSessionIdentity)) {
        logCanvasBoxFlow("selection", "drag-overlay:session-end-requested", {
          source: currentDebugSource,
          selectedIds: snapshot.visualIdentity,
          visualIds: snapshot.visualIdentity,
          phase: cleanupPhase,
          owner: "drag-overlay",
          dragOverlaySessionKey:
            currentInputs.boxFlowIdentity ||
            snapshot.visualIdentity ||
            null,
          selectionAuthority: "drag-session",
          geometryAuthority: resolveIndicatorGeometryAuthority(
            currentDebugSource,
            cleanupPhase,
            {
              ...currentInputs,
              reason: cleanupReason,
            }
          ),
          overlayVisible: true,
          overlayMounted: true,
          settling: cleanupPhase === "settling",
          suppressedLayers: resolveIndicatorSuppressedLayers(currentDebugSource),
          logicalCleanupOnly: true,
          visualHideAuthorized: false,
          reason: cleanupReason,
        }, {
          identity: snapshotSessionIdentity,
        });
        logCanvasBoxFlow("selection", "drag-overlay:session-end-visual-hide-blocked", {
          source: currentDebugSource,
          selectedIds: snapshot.visualIdentity,
          visualIds: snapshot.visualIdentity,
          phase: cleanupPhase,
          owner: "drag-overlay",
          dragOverlaySessionKey:
            currentInputs.boxFlowIdentity ||
            snapshot.visualIdentity ||
            null,
          selectionAuthority: "drag-session",
          geometryAuthority: resolveIndicatorGeometryAuthority(
            currentDebugSource,
            cleanupPhase,
            {
              ...currentInputs,
              reason: cleanupReason,
            }
          ),
          overlayVisible: true,
          overlayMounted: true,
          settling: cleanupPhase === "settling",
          suppressedLayers: resolveIndicatorSuppressedLayers(currentDebugSource),
          logicalCleanupOnly: true,
          visualHideAuthorized: false,
          reason: cleanupReason,
        }, {
          identity: snapshotSessionIdentity,
        });
        return;
      }
      if (shouldEmitForIdentity(snapshotSessionIdentity)) {
        flushCanvasBoxFlowSummary("selection", `${debugSource}:bounds`, {
          reason: cleanupReason,
        });
        logCanvasBoxFlow("selection", "selection-box:hidden", {
          source: currentDebugSource,
          selectedIds: snapshot.visualIdentity,
          visualIds: snapshot.visualIdentity,
          phase: cleanupPhase,
          owner: resolveIndicatorOwner(currentDebugSource),
          selectionAuthority:
            currentDebugSource === "drag-overlay" ? "drag-session" : "logical-selection",
          geometryAuthority: resolveIndicatorGeometryAuthority(
            currentDebugSource,
            cleanupPhase,
            {
              ...currentInputs,
              reason: cleanupReason,
            }
          ),
          overlayVisible: false,
          settling: cleanupPhase === "settling",
          suppressedLayers: resolveIndicatorSuppressedLayers(currentDebugSource),
          reason: cleanupReason,
        }, {
          identity: snapshotSessionIdentity,
        });
      }
      indicatorSnapshotRef.current = {
        ...snapshot,
        visible: false,
        boundsDigest: null,
      };
    };
  }, [
    boxFlowIdentity,
    boxFlowPhase,
    boxFlowSessionIdentity,
    controlledModeInitializedRef,
    debugSource,
    isControlledMode,
    resolveIndicatorGeometryAuthority,
    resolveIndicatorOwner,
    resolveIndicatorPhase,
    resolveIndicatorSuppressedLayers,
    shouldEmitForIdentity,
  ]);

  useEffect(
    () => () => {
      controlledModeInitializedRef.current = false;
      controlledMountReadyKeyRef.current = null;
    },
    []
  );

  const controlledIndicatorApi = useMemo(() => ({
    applyControlledBounds(nextBounds, meta = {}) {
      if (!isControlledMode) return null;
      return applyIndicatorBounds(nextBounds, {
        ...meta,
        source: meta.source || "controlled-apply",
        debugSource: meta.debugSource || debugSource,
        lifecycleKey: meta.lifecycleKey || lifecycleKey || null,
      });
    },
    clearControlledBounds(meta = {}) {
      if (!isControlledMode) return null;
      return clearIndicatorVisuals({
        ...meta,
        source: meta.source || "controlled-clear",
        debugSource: meta.debugSource || debugSource,
        reason: meta.reason || "overlay-hidden",
      });
    },
    getAppliedBoundsDigest() {
      return indicatorSnapshotRef.current?.boundsDigest || null;
    },
    isControlledMountReady() {
      return Boolean(groupRef.current && rectRef.current && polygonRef.current);
    },
  }), [
    applyIndicatorBounds,
    clearIndicatorVisuals,
    debugSource,
    isControlledMode,
    lifecycleKey,
  ]);

  useImperativeHandle(forwardedRef, () => controlledIndicatorApi, [
    controlledIndicatorApi,
  ]);

  useLayoutEffect(() => {
    if (!isControlledMode) {
      controlledMountReadyKeyRef.current = null;
      return;
    }
    if (typeof onControlledMountReady !== "function") {
      return;
    }
    if (!controlledIndicatorApi.isControlledMountReady()) {
      return;
    }

    const currentInputs = latestInputsRef.current || {};
    const currentVisualIdentity = resolveVisualIdentity(
      currentInputs,
      debugSource
    );
    const currentSessionIdentity = resolveSessionIdentity(
      currentInputs,
      currentVisualIdentity
    );
    const nextReadyKey = [
      lifecycleKey || currentInputs.lifecycleKey || "",
      currentSessionIdentity || "",
      currentVisualIdentity || "",
    ].join("|");

    if (controlledMountReadyKeyRef.current === nextReadyKey) {
      return;
    }
    controlledMountReadyKeyRef.current = nextReadyKey;

    onControlledMountReady({
      source: debugSource,
      lifecycleKey: lifecycleKey || currentInputs.lifecycleKey || null,
      boxFlowIdentity: currentVisualIdentity,
      sessionIdentity: currentSessionIdentity,
      phase: resolveIndicatorPhase(debugSource, null, currentInputs),
      selectedIds: Array.isArray(currentInputs.selectedElements)
        ? [...currentInputs.selectedElements]
        : [],
      schedulingBoundary: "controlled-layout-ready",
      indicatorApi: controlledIndicatorApi,
    });
  }, [
    boxFlowIdentity,
    boxFlowPhase,
    boxFlowSessionIdentity,
    controlledIndicatorApi,
    controlledMountReadyVersion,
    debugSource,
    isControlledMode,
    lifecycleKey,
    onControlledMountReady,
    resolveIndicatorPhase,
    resolveSessionIdentity,
    resolveVisualIdentity,
    selectedIdsDigest,
  ]);

  useEffect(() => {
    if (isControlledMode) return undefined;
    if (typeof onVisualReadyChange !== "function") return;
    onVisualReadyChange(hasBounds);

    return () => {
      onVisualReadyChange(false);
    };
  }, [hasBounds, isControlledMode, onVisualReadyChange]);

  if (!isControlledMode && !bounds) {
    return null;
  }

  const renderBounds = bounds || {
    kind: "rect",
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    strokeWidth: getSelectionFrameStrokeWidth(isMobile),
  };

  return (
    <Group ref={setGroupNodeRef} name="ui selection-bounds-indicator" listening={false}>
      <Line
        ref={setPolygonNodeRef}
        points={isControlledMode ? undefined : (renderBounds.kind === "polygon" ? renderBounds.points : [])}
        closed
        visible={isControlledMode ? undefined : renderBounds.kind === "polygon"}
        fillEnabled={false}
        stroke={SELECTION_FRAME_STROKE}
        strokeWidth={isControlledMode ? undefined : renderBounds.strokeWidth}
        dash={isControlledMode ? undefined : (selectedGroupObject ? [8, 4] : undefined)}
        listening={false}
        perfectDrawEnabled={false}
      />
      <Rect
        ref={setRectNodeRef}
        x={isControlledMode ? undefined : (renderBounds.kind === "rect" ? renderBounds.x : 0)}
        y={isControlledMode ? undefined : (renderBounds.kind === "rect" ? renderBounds.y : 0)}
        width={isControlledMode ? undefined : (renderBounds.kind === "rect" ? renderBounds.width : 0)}
        height={isControlledMode ? undefined : (renderBounds.kind === "rect" ? renderBounds.height : 0)}
        visible={isControlledMode ? undefined : renderBounds.kind === "rect"}
        fill="transparent"
        stroke={SELECTION_FRAME_STROKE}
        strokeWidth={isControlledMode ? undefined : renderBounds.strokeWidth}
        dash={isControlledMode ? undefined : (selectedGroupObject ? [8, 4] : undefined)}
        listening={false}
        perfectDrawEnabled={false}
        strokeScaleEnabled={false}
      />
      {groupBadge || isControlledMode ? (
        <Group
          ref={badgeGroupRef}
          listening={false}
          visible={isControlledMode ? undefined : Boolean(groupBadge)}
        >
          <Rect
            ref={badgeRectRef}
            x={isControlledMode ? undefined : (groupBadge?.x || 0)}
            y={isControlledMode ? undefined : (groupBadge?.y || 0)}
            width={isControlledMode ? undefined : (groupBadge?.width || 0)}
            height={isControlledMode ? undefined : (groupBadge?.height || 0)}
            fill="rgba(147, 51, 234, 0.96)"
            cornerRadius={isControlledMode ? undefined : (groupBadge ? groupBadge.height / 2 : 0)}
            stroke="rgba(255,255,255,0.85)"
            strokeWidth={0.75}
            shadowColor="rgba(88, 28, 135, 0.28)"
            shadowBlur={8}
            shadowOffset={{ x: 0, y: 2 }}
          />
          <Text
            ref={badgeTextRef}
            x={isControlledMode ? undefined : (groupBadge ? groupBadge.x + groupBadge.paddingX : 0)}
            y={isControlledMode ? undefined : (groupBadge ? groupBadge.y + (isMobile ? 6 : 5) : 0)}
            text={isControlledMode ? undefined : (groupBadge?.label || "")}
            fontSize={isControlledMode ? undefined : (groupBadge?.fontSize || (isMobile ? 11 : 10))}
            fontStyle="bold"
            fill="#ffffff"
            listening={false}
          />
        </Group>
      ) : null}
    </Group>
  );
});

SelectionBoundsIndicator.displayName = "SelectionBoundsIndicator";

export default SelectionBoundsIndicator;
