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

export function resolveSelectionBounds({
  selectedElements,
  elementRefs,
  objetos,
  objectLookup = null,
  isMobile,
  requireLiveNodes = false,
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
        paintMode: isControlledMode ? "immediate-draw" : "batched-draw",
      });
    }

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

  const bounds = isControlledMode
    ? null
    : resolveSelectionBounds({
        selectedElements,
        elementRefs,
        objetos,
        isMobile,
        debugLog,
      });
  const hasBounds = Boolean(bounds);
  const boundsDigest = isControlledMode
    ? null
    : buildCanvasBoxFlowBoundsDigest(bounds);
  const indicatorVisualIdentity =
    resolveVisualIdentity();
  const indicatorSessionIdentity =
    resolveSessionIdentity(latestInputsRef.current || {}, indicatorVisualIdentity);
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
