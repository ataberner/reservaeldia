import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Rect } from "react-konva";
import {
  MIN_IMAGE_CROP_DISPLAY_SIZE,
  applyImageCropEdgeDrag,
  resolveImageCropState,
} from "@/components/editor/textSystem/render/konva/imageCropUtils";

function getClientPoint(nativeEvent) {
  if (!nativeEvent) return null;

  if (nativeEvent.touches?.[0]) {
    return {
      clientX: Number(nativeEvent.touches[0].clientX),
      clientY: Number(nativeEvent.touches[0].clientY),
    };
  }

  if (nativeEvent.changedTouches?.[0]) {
    return {
      clientX: Number(nativeEvent.changedTouches[0].clientX),
      clientY: Number(nativeEvent.changedTouches[0].clientY),
    };
  }

  if (
    Number.isFinite(Number(nativeEvent.clientX)) &&
    Number.isFinite(Number(nativeEvent.clientY))
  ) {
    return {
      clientX: Number(nativeEvent.clientX),
      clientY: Number(nativeEvent.clientY),
    };
  }

  return null;
}

function resolveStagePointer(stage, nativeEvent) {
  if (!stage || !nativeEvent) return null;

  try {
    stage.setPointersPositions(nativeEvent);
    const point = stage.getPointerPosition();
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
      return { x: Number(point.x), y: Number(point.y) };
    }
  } catch {
    // fall through
  }

  const clientPoint = getClientPoint(nativeEvent);
  const rect = stage.container?.().getBoundingClientRect?.();
  if (!clientPoint || !rect) return null;

  const scaleX = rect.width > 0 ? stage.width() / rect.width : 1;
  const scaleY = rect.height > 0 ? stage.height() / rect.height : 1;

  return {
    x: (clientPoint.clientX - rect.left) * scaleX,
    y: (clientPoint.clientY - rect.top) * scaleY,
  };
}

function buildCropPayload(result) {
  if (!result) return null;

  return {
    x: result.x,
    y: result.y,
    width: result.width,
    height: result.height,
    rotation: result.rotation,
    cropX: result.cropX,
    cropY: result.cropY,
    cropWidth: result.cropWidth,
    cropHeight: result.cropHeight,
    ancho: result.sourceWidth,
    alto: result.sourceHeight,
    scaleX: 1,
    scaleY: 1,
  };
}

function buildHandlePosition(node, point) {
  if (!node || !point) return null;

  try {
    const transform = node.getAbsoluteTransform?.();
    if (!transform) return null;
    const projected = transform.point(point);
    if (!projected) return null;
    return {
      x: Number(projected.x),
      y: Number(projected.y),
    };
  } catch {
    return null;
  }
}

function buildHandleDefinitions(node, cropState) {
  if (!node || !cropState) return [];

  const localWidth =
    typeof node.width === "function" ? Number(node.width()) : cropState.width;
  const localHeight =
    typeof node.height === "function" ? Number(node.height()) : cropState.height;

  if (!Number.isFinite(localWidth) || !Number.isFinite(localHeight)) {
    return [];
  }

  const definitions = [
    { edge: "left", point: { x: 0, y: localHeight / 2 } },
    { edge: "right", point: { x: localWidth, y: localHeight / 2 } },
    { edge: "top", point: { x: localWidth / 2, y: 0 } },
    { edge: "bottom", point: { x: localWidth / 2, y: localHeight } },
  ];
  const baseRotation =
    typeof node.getAbsoluteRotation === "function"
      ? Number(node.getAbsoluteRotation() || 0)
      : (typeof node.rotation === "function"
        ? Number(node.rotation() || 0)
        : cropState.rotation);

  return definitions
    .map((definition) => {
      const position = buildHandlePosition(node, definition.point);
      if (!position) return null;
      return {
        ...definition,
        ...position,
        rotation:
          definition.edge === "left" || definition.edge === "right"
            ? baseRotation + 90
            : baseRotation,
      };
    })
    .filter(Boolean);
}

export default function ImageCropOverlay({
  selectedElementId = null,
  objetos = [],
  elementRefs,
  stageRef,
  isMobile = false,
  supportsPointerEvents = true,
  setGlobalCursor,
  clearGlobalCursor,
  onCropPreview,
  onCropCommit,
  onInteractionStart,
  onInteractionEnd,
}) {
  const dragRef = useRef(null);
  const detachListenersRef = useRef(() => {});
  const handleRefs = useRef({});
  const finishCropDragRef = useRef(() => {});
  const [runtimeDragActive, setRuntimeDragActive] = useState(() => (
    typeof window !== "undefined" &&
    Boolean(window._isDragging || window._grupoLider)
  ));
  const selectedObject = useMemo(
    () => objetos.find((obj) => obj?.id === selectedElementId) || null,
    [objetos, selectedElementId]
  );
  const selectedNode = selectedElementId
    ? elementRefs?.current?.[selectedElementId] || null
    : null;
  const imageLike =
    selectedNode && typeof selectedNode.image === "function"
      ? selectedNode.image()
      : null;
  const cropState = selectedObject
    ? resolveImageCropState(selectedObject, imageLike)
    : null;

  const handleLength = isMobile ? 34 : 24;
  const handleThickness = isMobile ? 10 : 7;
  const handleHitStrokeWidth = isMobile ? 34 : 22;
  const handleStrokeWidth = isMobile ? 3 : 2;
  const handleCornerRadius = handleThickness / 2;
  const shouldUsePointerStartEvents =
    supportsPointerEvents &&
    typeof window !== "undefined" &&
    Boolean(window.PointerEvent);
  const edgeCursorByName = {
    left: "ew-resize",
    right: "ew-resize",
    top: "ns-resize",
    bottom: "ns-resize",
  };

  const handles = useMemo(() => {
    if (
      !selectedObject ||
      selectedObject.tipo !== "imagen" ||
      selectedObject.esFondo ||
      !selectedNode ||
      !cropState
    ) {
      return [];
    }

    return buildHandleDefinitions(selectedNode, cropState);
  }, [cropState, selectedNode, selectedObject]);

  const setHandleNodesVisible = useCallback((nextVisible) => {
    let shouldBatchDraw = false;

    Object.values(handleRefs.current).forEach((node) => {
      if (!node || typeof node.visible !== "function") return;

      const currentVisible =
        typeof node.visible === "function" ? Boolean(node.visible()) : true;
      if (currentVisible === nextVisible) return;

      node.visible(nextVisible);
      shouldBatchDraw = true;
    });

    if (!shouldBatchDraw) return;
    const layer = selectedNode?.getLayer?.() || null;
    layer?.batchDraw?.();
  }, [selectedNode]);

  const syncHandleNodes = useCallback(() => {
    const dragActive =
      runtimeDragActive ||
      (typeof window !== "undefined" &&
        Boolean(window._isDragging || window._grupoLider));

    if (
      dragActive ||
      !selectedObject ||
      selectedObject.tipo !== "imagen" ||
      selectedObject.esFondo ||
      !selectedNode ||
      !cropState
    ) {
      Object.values(handleRefs.current).forEach((node) => {
        if (node && typeof node.visible === "function") {
          node.visible(false);
        }
      });
      return;
    }

    const nextHandles = buildHandleDefinitions(selectedNode, cropState);
    const visibleEdges = new Set();

    nextHandles.forEach((handle) => {
      const node = handleRefs.current[handle.edge];
      if (!node) return;
      visibleEdges.add(handle.edge);
      node.setAttrs({
        x: handle.x,
        y: handle.y,
        rotation: handle.rotation,
        width: handleLength,
        height: handleThickness,
        offsetX: handleLength / 2,
        offsetY: handleThickness / 2,
        cornerRadius: handleCornerRadius,
        visible: true,
      });
    });

    Object.entries(handleRefs.current).forEach(([edge, node]) => {
      if (!node) return;
      if (!visibleEdges.has(edge)) {
        node.visible(false);
      }
    });

    const layer = selectedNode.getLayer?.() || null;
    layer?.batchDraw?.();
  }, [
    cropState,
    handleCornerRadius,
    handleLength,
    handleThickness,
    runtimeDragActive,
    selectedNode,
    selectedObject,
  ]);

  const syncRuntimeDragState = useCallback(() => {
    const nextDragActive =
      typeof window !== "undefined" &&
      Boolean(window._isDragging || window._grupoLider);

    setRuntimeDragActive((current) => (
      current === nextDragActive ? current : nextDragActive
    ));

    if (nextDragActive) {
      setHandleNodesVisible(false);
    }
  }, [setHandleNodesVisible]);

  const clearInteractionState = useCallback(() => {
    dragRef.current = null;
    try {
      detachListenersRef.current?.();
    } catch {
      // no-op
    }
    detachListenersRef.current = () => {};
    if (typeof clearGlobalCursor === "function") {
      clearGlobalCursor(stageRef);
    }
  }, [clearGlobalCursor, stageRef]);

  const finishCropDrag = useCallback((nativeEvent = null, { commit = true } = {}) => {
    const drag = dragRef.current;
    if (!drag) {
      clearInteractionState();
      return;
    }

    let finalResult = drag.lastResult || drag.initialResult || null;
    if (nativeEvent) {
      const stagePoint = resolveStagePointer(drag.stage, nativeEvent);
      if (stagePoint) {
        const localPoint = drag.inverseTransform.point(stagePoint);
        const deltaLocal =
          drag.edge === "left" || drag.edge === "right"
            ? localPoint.x - drag.startLocalPoint.x
            : localPoint.y - drag.startLocalPoint.y;
        finalResult =
          applyImageCropEdgeDrag({
            edge: drag.edge,
            deltaLocal,
            snapshot: drag.snapshot,
            minDisplaySize: MIN_IMAGE_CROP_DISPLAY_SIZE,
          }) || finalResult;
      }
    }

    window._resizeData = null;
    clearInteractionState();

    if (commit && finalResult && typeof onCropCommit === "function") {
      onCropCommit(buildCropPayload(finalResult));
    }
    if (typeof onInteractionEnd === "function") {
      onInteractionEnd({
        isRotate: false,
        isCrop: true,
        activeAnchor: drag.edge,
      });
    }
  }, [clearInteractionState, onCropCommit, onInteractionEnd]);

  useEffect(() => {
    finishCropDragRef.current = finishCropDrag;
  }, [finishCropDrag]);

  const handleNativeMove = useCallback((nativeEvent) => {
    const drag = dragRef.current;
    if (!drag) return;

    if (nativeEvent?.cancelable) {
      nativeEvent.preventDefault();
    }

    const stagePoint = resolveStagePointer(drag.stage, nativeEvent);
    if (!stagePoint) return;

    const localPoint = drag.inverseTransform.point(stagePoint);
    const deltaLocal =
      drag.edge === "left" || drag.edge === "right"
        ? localPoint.x - drag.startLocalPoint.x
        : localPoint.y - drag.startLocalPoint.y;
    const result = applyImageCropEdgeDrag({
      edge: drag.edge,
      deltaLocal,
      snapshot: drag.snapshot,
      minDisplaySize: MIN_IMAGE_CROP_DISPLAY_SIZE,
    });
    if (!result) return;

    drag.lastResult = result;

    if (typeof onCropPreview === "function") {
      onCropPreview(buildCropPayload(result));
    }
  }, [onCropPreview]);

  const attachListeners = useCallback(() => {
    const handleMove = (event) => handleNativeMove(event);
    const handleUp = (event) => finishCropDrag(event, { commit: true });

    if (supportsPointerEvents && typeof window !== "undefined" && window.PointerEvent) {
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);
      detachListenersRef.current = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleUp);
      };
      return;
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleUp);
    window.addEventListener("touchcancel", handleUp);
    detachListenersRef.current = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
      window.removeEventListener("touchcancel", handleUp);
    };
  }, [finishCropDrag, handleNativeMove, supportsPointerEvents]);

  const startCropDrag = useCallback((edge, event) => {
    if (dragRef.current) return;

    const nativeEvent = event?.evt || null;
    const node = selectedNode;
    const stage = stageRef?.current || node?.getStage?.() || null;
    const image = imageLike;

    if (!node || !stage || !selectedObject || !image) return;

    const stagePoint = resolveStagePointer(stage, nativeEvent);
    const absoluteTransform = node.getAbsoluteTransform?.();
    if (!stagePoint || !absoluteTransform) return;

    if (nativeEvent?.cancelable) {
      nativeEvent.preventDefault();
    }

    event.cancelBubble = true;
    if (nativeEvent) {
      nativeEvent.cancelBubble = true;
    }

    const inverseTransform = absoluteTransform.copy();
    inverseTransform.invert();
    const startLocalPoint = inverseTransform.point(stagePoint);
    const snapshotBase = resolveImageCropState(selectedObject, image);
    const snapshot = {
      ...snapshotBase,
      x: typeof node.x === "function" ? Number(node.x()) : snapshotBase.x,
      y: typeof node.y === "function" ? Number(node.y()) : snapshotBase.y,
      width:
        typeof node.width === "function" ? Number(node.width()) : snapshotBase.width,
      height:
        typeof node.height === "function" ? Number(node.height()) : snapshotBase.height,
      rotation:
        typeof node.rotation === "function"
          ? Number(node.rotation() || 0)
          : snapshotBase.rotation,
    };

    const initialResult = applyImageCropEdgeDrag({
      edge,
      deltaLocal: 0,
      snapshot,
      minDisplaySize: MIN_IMAGE_CROP_DISPLAY_SIZE,
    });

    dragRef.current = {
      edge,
      stage,
      snapshot,
      inverseTransform,
      startLocalPoint,
      initialResult,
      lastResult: initialResult,
    };

    window._resizeData = { isResizing: true, type: "image-crop", edge };
    if (typeof setGlobalCursor === "function") {
      setGlobalCursor(edgeCursorByName[edge] || "move", stageRef);
    }
    if (typeof onInteractionStart === "function") {
      onInteractionStart({
        isRotate: false,
        isCrop: true,
        activeAnchor: edge,
      });
    }

    attachListeners();
  }, [
    attachListeners,
    edgeCursorByName,
    imageLike,
    onInteractionStart,
    selectedNode,
    selectedObject,
    setGlobalCursor,
    stageRef,
  ]);

  useEffect(() => {
    const node = selectedNode;
    if (!node || typeof node.on !== "function") return undefined;

    const syncFromNode = () => {
      syncHandleNodes();
    };
    const eventNames = [
      "dragmove.image-crop-overlay",
      "dragend.image-crop-overlay",
      "transform.image-crop-overlay",
      "transformend.image-crop-overlay",
      "xChange.image-crop-overlay",
      "yChange.image-crop-overlay",
      "rotationChange.image-crop-overlay",
      "widthChange.image-crop-overlay",
      "heightChange.image-crop-overlay",
      "scaleXChange.image-crop-overlay",
      "scaleYChange.image-crop-overlay",
    ];

    eventNames.forEach((eventName) => {
      node.on(eventName, syncFromNode);
    });
    syncHandleNodes();

    return () => {
      eventNames.forEach((eventName) => {
        node.off(eventName, syncFromNode);
      });
    };
  }, [selectedNode, syncHandleNodes]);

  useEffect(() => {
    syncHandleNodes();
  }, [syncHandleNodes]);

  useEffect(() => {
    const stage = stageRef?.current || selectedNode?.getStage?.() || null;

    const handleStageDragStart = () => {
      setHandleNodesVisible(false);
      setRuntimeDragActive(true);
    };
    const handleDragStateSync = () => {
      syncRuntimeDragState();
    };

    stage?.on?.("dragstart.image-crop-overlay-visibility", handleStageDragStart);
    stage?.on?.("dragend.image-crop-overlay-visibility", handleDragStateSync);

    if (typeof window !== "undefined") {
      window.addEventListener("dragging-start", handleStageDragStart);
      window.addEventListener("dragging-end", handleDragStateSync);
    }

    syncRuntimeDragState();

    return () => {
      stage?.off?.("dragstart.image-crop-overlay-visibility", handleStageDragStart);
      stage?.off?.("dragend.image-crop-overlay-visibility", handleDragStateSync);

      if (typeof window !== "undefined") {
        window.removeEventListener("dragging-start", handleStageDragStart);
        window.removeEventListener("dragging-end", handleDragStateSync);
      }
    };
  }, [selectedNode, setHandleNodesVisible, stageRef, syncRuntimeDragState]);

  useEffect(() => {
    return () => {
      finishCropDragRef.current?.(null, { commit: false });
    };
  }, []);

  if (
    runtimeDragActive ||
    (typeof window !== "undefined" && Boolean(window._isDragging || window._grupoLider)) ||
    !selectedObject ||
    selectedObject.tipo !== "imagen" ||
    selectedObject.esFondo ||
    !selectedNode ||
    !imageLike ||
    handles.length !== 4
  ) {
    return null;
  }

  return (
    <Group name="ui">
      {handles.map((handle) => {
        const cursor = edgeCursorByName[handle.edge] || "move";

        return (
          <Rect
            key={`${selectedObject.id}-${handle.edge}`}
            name="ui image-crop-handle"
            ref={(node) => {
              if (node) {
                handleRefs.current[handle.edge] = node;
              } else {
                delete handleRefs.current[handle.edge];
              }
            }}
            x={handle.x}
            y={handle.y}
            width={handleLength}
            height={handleThickness}
            offsetX={handleLength / 2}
            offsetY={handleThickness / 2}
            rotation={handle.rotation}
            cornerRadius={handleCornerRadius}
            fill="#9333EA"
            stroke="#FFFFFF"
            strokeWidth={handleStrokeWidth}
            shadowColor="rgba(147, 51, 234, 0.35)"
            shadowBlur={isMobile ? 16 : 10}
            shadowOffset={{ x: 0, y: isMobile ? 4 : 3 }}
            shadowOpacity={1}
            hitStrokeWidth={handleHitStrokeWidth}
            listening={true}
            draggable={false}
            onMouseEnter={() => {
              if (typeof setGlobalCursor === "function") {
                setGlobalCursor(cursor, stageRef);
              }
            }}
            onMouseLeave={() => {
              if (!dragRef.current && typeof clearGlobalCursor === "function") {
                clearGlobalCursor(stageRef);
              }
            }}
            onMouseDown={
              shouldUsePointerStartEvents
                ? undefined
                : (event) => startCropDrag(handle.edge, event)
            }
            onTouchStart={
              shouldUsePointerStartEvents
                ? undefined
                : (event) => startCropDrag(handle.edge, event)
            }
            onPointerDown={
              shouldUsePointerStartEvents
                ? (event) => startCropDrag(handle.edge, event)
                : undefined
            }
          />
        );
      })}
    </Group>
  );
}
