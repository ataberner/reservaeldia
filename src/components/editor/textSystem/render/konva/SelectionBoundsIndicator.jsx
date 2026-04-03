import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
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
    elementRefs,
    objetos,
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
  lifecycleKey = null,
  boundsControlMode = "auto",
  bringToFront = false,
  onVisualReadyChange = null,
  onFirstControlledFrameVisible = null,
  onBoxFlowBoundsSample = null,
}, forwardedRef) {
  const groupRef = useRef(null);
  const rectRef = useRef(null);
  const polygonRef = useRef(null);
  const badgeGroupRef = useRef(null);
  const badgeRectRef = useRef(null);
  const badgeTextRef = useRef(null);
  const indicatorSnapshotRef = useRef(null);
  const latestInputsRef = useRef(null);
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
    lifecycleKey,
    selectedGroupObject,
    boundsControlMode,
  };

  const shouldEmitForIdentity = useCallback((identity) => {
    if (!boxFlowIdentity) {
      return true;
    }
    return getActiveCanvasBoxFlowSession("selection")?.identity === identity;
  }, [boxFlowIdentity]);

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
    const currentIdentity =
      meta.identity ||
      previousSnapshot?.identity ||
      currentInputs.boxFlowIdentity ||
      currentInputs.selectedIdsDigest ||
      currentDebugSource;

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

    if (previousSnapshot?.visible && shouldEmitForIdentity(previousSnapshot.identity)) {
      flushCanvasBoxFlowSummary("selection", `${currentDebugSource}:bounds`, {
        reason: meta.reason || "hidden",
      });
      logCanvasBoxFlow("selection", "selection-box:hidden", {
        source: currentDebugSource,
        selectedIds: previousSnapshot.identity,
        reason: meta.reason || "hidden",
      }, {
        identity: previousSnapshot.identity,
      });
    }

    indicatorSnapshotRef.current = {
      visible: false,
      boundsDigest: null,
      debugSource: currentDebugSource,
      identity: currentIdentity,
    };

    if (isControlledMode && typeof onVisualReadyChange === "function") {
      onVisualReadyChange(false);
    }

    return indicatorSnapshotRef.current;
  }, [
    debugSource,
    isControlledMode,
    onVisualReadyChange,
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
    const currentIdentity =
      meta.identity ||
      currentInputs.boxFlowIdentity ||
      currentInputs.selectedIdsDigest ||
      currentDebugSource ||
      debugSource;
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
      shouldEmitForIdentity(currentIdentity) &&
      (
        !previousSnapshot?.visible ||
        previousSnapshot.identity !== currentIdentity ||
        !areBoundsDigestsEqual(previousSnapshot.boundsDigest, nextBoundsDigest) ||
        previousSnapshot.debugSource !== currentDebugSource
      );
    if (shouldLogRecalc) {
      logCanvasBoxFlow("selection", "bounds:recalc", {
        source: meta.source || "manual",
        debugSource: currentDebugSource,
        selectedIds: currentIdentity,
        bounds: nextBoundsDigest,
      }, {
        identity: currentIdentity,
      });
    }

    if (
      isControlledMode &&
      typeof onFirstControlledFrameVisible === "function" &&
      (!previousSnapshot?.visible || previousSnapshot.identity !== currentIdentity)
    ) {
      onFirstControlledFrameVisible({
        source: meta.source || "manual",
        debugSource: currentDebugSource,
        selectedIds: [...currentSelectedIds],
        bounds: nextBoundsDigest,
        lifecycleKey: meta.lifecycleKey || currentInputs.lifecycleKey || null,
        boxFlowIdentity: currentIdentity,
        syncToken: meta.syncToken || null,
      });
    }

    if (
      shouldEmitForIdentity(currentIdentity) &&
      (!previousSnapshot?.visible || previousSnapshot.identity !== currentIdentity)
    ) {
      logCanvasBoxFlow("selection", "selection-box:shown", {
        source: currentDebugSource,
        selectedIds: currentIdentity,
        bounds: nextBoundsDigest,
      }, {
        identity: currentIdentity,
      });
    }

    if (shouldEmitForIdentity(currentIdentity)) {
      recordCanvasBoxFlowSummary(
        "selection",
        `${currentDebugSource}:bounds`,
        {
          source: meta.source || "manual",
          debugSource: currentDebugSource,
          selectedIds: currentIdentity,
          bounds: nextBoundsDigest,
        },
        {
          identity: currentIdentity,
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
        boxFlowIdentity: currentIdentity,
        syncToken: meta.syncToken || null,
        paintMode: isControlledMode ? "immediate-draw" : "batched-draw",
      });
    }

    indicatorSnapshotRef.current = {
      visible: true,
      boundsDigest: nextBoundsDigest,
      debugSource: currentDebugSource,
      identity: currentIdentity,
    };

    if (
      isControlledMode &&
      typeof onVisualReadyChange === "function" &&
      (
        !previousSnapshot?.visible ||
        previousSnapshot.identity !== currentIdentity
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
    const identity =
      currentInputs.boxFlowIdentity ||
      currentInputs.selectedIdsDigest ||
      currentInputs.debugSource ||
      debugSource;

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
      identity,
      lifecycleKey: currentInputs.lifecycleKey || null,
    });
  }, [
    applyIndicatorBounds,
    debugSource,
    isControlledMode,
  ]);

  useEffect(() => {
    if (isControlledMode) return undefined;
    const stage =
      selectedNodes.find((node) => typeof node?.getStage === "function")?.getStage?.() ||
      null;

    if (selectedNodes.length === 0 && !stage) return;

    const identity = boxFlowIdentity || selectedIdsDigest || debugSource;
    if (shouldEmitForIdentity(identity)) {
      logCanvasBoxFlow("selection", "bounds:listeners-attached", {
        source: debugSource,
        selectedIds: identity,
        nodeCount: selectedNodes.length,
        stageBound: Boolean(stage),
      }, {
        identity,
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
      if (shouldEmitForIdentity(identity)) {
        flushCanvasBoxFlowSummary("selection", `${debugSource}:bounds`, {
          reason: boxFlowIdentity ? "overlay-session-end" : "listeners-detached",
        });
        logCanvasBoxFlow("selection", "bounds:listeners-detached", {
          source: debugSource,
          selectedIds: identity,
          reason: boxFlowIdentity ? "overlay-session-end" : "listeners-detached",
        }, {
          identity,
        });
      }
    };
  }, [
    boxFlowIdentity,
    debugSource,
    isControlledMode,
    lifecycleKey,
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
  const indicatorIdentity =
    boxFlowIdentity || selectedIdsDigest || debugSource;
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
      identity: indicatorIdentity,
    };
    const previousSnapshot = indicatorSnapshotRef.current;
    indicatorSnapshotRef.current = nextSnapshot;

    if (
      previousSnapshot?.visible &&
      (!nextSnapshot.visible || previousSnapshot.identity !== nextSnapshot.identity)
    ) {
      if (shouldEmitForIdentity(previousSnapshot.identity)) {
        flushCanvasBoxFlowSummary("selection", `${debugSource}:bounds`, {
          reason: boxFlowIdentity ? "overlay-hidden" : "hidden",
        });
        logCanvasBoxFlow("selection", "selection-box:hidden", {
          source: debugSource,
          selectedIds: previousSnapshot.identity,
          reason:
            previousSnapshot.identity !== nextSnapshot.identity
              ? "selection-changed"
              : (boxFlowIdentity ? "overlay-hidden" : "hidden"),
        }, {
          identity: previousSnapshot.identity,
        });
      }
    }

    if (!nextSnapshot.visible || !boundsDigest) return;

    if (
      shouldEmitForIdentity(indicatorIdentity) &&
      (!previousSnapshot?.visible || previousSnapshot.identity !== indicatorIdentity)
    ) {
      logCanvasBoxFlow("selection", "selection-box:shown", {
        source: debugSource,
        selectedIds: indicatorIdentity,
        bounds: boundsDigest,
      }, {
        identity: indicatorIdentity,
      });
    }
  }, [
    boundsDigest,
    boxFlowIdentity,
    debugSource,
    hasBounds,
    indicatorIdentity,
    isControlledMode,
    shouldEmitForIdentity,
  ]);

  useEffect(() => {
    if (!isControlledMode) return undefined;

    try {
      rectRef.current?.visible(false);
      polygonRef.current?.visible(false);
      badgeGroupRef.current?.visible(false);
      flushIndicatorLayerDraw(groupRef.current, true);
    } catch {}

    return () => {
      const snapshot = indicatorSnapshotRef.current;
      if (!snapshot?.visible) return;
      if (shouldEmitForIdentity(snapshot.identity)) {
        flushCanvasBoxFlowSummary("selection", `${debugSource}:bounds`, {
          reason: boxFlowIdentity ? "overlay-session-end" : "controlled-unmount",
        });
        logCanvasBoxFlow("selection", "selection-box:hidden", {
          source: debugSource,
          selectedIds: snapshot.identity,
          reason: boxFlowIdentity ? "overlay-session-end" : "controlled-unmount",
        }, {
          identity: snapshot.identity,
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
    debugSource,
    isControlledMode,
    shouldEmitForIdentity,
  ]);

  useImperativeHandle(forwardedRef, () => ({
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
  }), [
    applyIndicatorBounds,
    clearIndicatorVisuals,
    debugSource,
    isControlledMode,
    lifecycleKey,
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
    <Group ref={groupRef} name="ui selection-bounds-indicator" listening={false}>
      <Line
        ref={polygonRef}
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
        ref={rectRef}
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
