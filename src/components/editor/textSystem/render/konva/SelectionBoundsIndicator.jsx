import { useCallback, useEffect, useMemo, useRef } from "react";
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

function resolveSelectionBounds({
  selectedElements,
  elementRefs,
  objetos,
  isMobile,
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

export default function SelectionBoundsIndicator({
  selectedElements,
  elementRefs,
  objetos,
  isMobile = false,
  debugLog = () => {},
  bringToFront = false,
  onVisualReadyChange = null,
}) {
  const groupRef = useRef(null);
  const rectRef = useRef(null);
  const polygonRef = useRef(null);
  const selectedGroupObject = useMemo(
    () => resolveSelectedGroupObject(selectedElements, objetos),
    [objetos, selectedElements]
  );

  const syncIndicatorBounds = useCallback(() => {
    const groupNode = groupRef.current;
    const rectNode = rectRef.current;
    const polygonNode = polygonRef.current;
    if (!groupNode || !rectNode || !polygonNode) return;

    const nextBounds = resolveSelectionBounds({
      selectedElements,
      elementRefs,
      objetos,
      isMobile,
    });

    if (!nextBounds) return;

    let didChange = false;

    if (nextBounds.kind === "polygon") {
      if (
        !polygonNode.visible() ||
        !arePointArraysEqual(polygonNode.points(), nextBounds.points) ||
        polygonNode.strokeWidth() !== nextBounds.strokeWidth
      ) {
        polygonNode.visible(true);
        polygonNode.points(nextBounds.points);
        polygonNode.strokeWidth(nextBounds.strokeWidth);
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
        rectNode.strokeWidth() !== nextBounds.strokeWidth
      ) {
        rectNode.visible(true);
        rectNode.setAttrs({
          x: nextBounds.x,
          y: nextBounds.y,
          width: nextBounds.width,
          height: nextBounds.height,
          strokeWidth: nextBounds.strokeWidth,
        });
        didChange = true;
      }

      if (polygonNode.visible()) {
        polygonNode.visible(false);
        didChange = true;
      }
    }

    if (bringToFront && typeof groupNode.moveToTop === "function") {
      groupNode.moveToTop();
      didChange = true;
    }

    if (didChange) {
      groupNode.getLayer?.()?.batchDraw?.();
    }
  }, [bringToFront, debugLog, elementRefs, isMobile, objetos, selectedElements]);

  useEffect(() => {
    const selectedNodes = selectedElements
      .map((id) => elementRefs.current?.[id] || null)
      .filter(Boolean);
    const stage =
      selectedNodes.find((node) => typeof node?.getStage === "function")?.getStage?.() ||
      null;

    if (selectedNodes.length === 0 && !stage) return;

    selectedNodes.forEach((node) => {
      node.on("dragmove.selection-bounds-indicator", syncIndicatorBounds);
      node.on("transform.selection-bounds-indicator", syncIndicatorBounds);
      node.on("xChange.selection-bounds-indicator", syncIndicatorBounds);
      node.on("yChange.selection-bounds-indicator", syncIndicatorBounds);
      node.on("rotationChange.selection-bounds-indicator", syncIndicatorBounds);
      node.on("scaleXChange.selection-bounds-indicator", syncIndicatorBounds);
      node.on("scaleYChange.selection-bounds-indicator", syncIndicatorBounds);
    });

    stage?.on("dragmove.selection-bounds-indicator", syncIndicatorBounds);
    syncIndicatorBounds();

    return () => {
      selectedNodes.forEach((node) => {
        node.off("dragmove.selection-bounds-indicator", syncIndicatorBounds);
        node.off("transform.selection-bounds-indicator", syncIndicatorBounds);
        node.off("xChange.selection-bounds-indicator", syncIndicatorBounds);
        node.off("yChange.selection-bounds-indicator", syncIndicatorBounds);
        node.off("rotationChange.selection-bounds-indicator", syncIndicatorBounds);
        node.off("scaleXChange.selection-bounds-indicator", syncIndicatorBounds);
        node.off("scaleYChange.selection-bounds-indicator", syncIndicatorBounds);
      });
      stage?.off("dragmove.selection-bounds-indicator", syncIndicatorBounds);
    };
  }, [debugLog, elementRefs, isMobile, objetos, selectedElements, syncIndicatorBounds]);

  const bounds = resolveSelectionBounds({
    selectedElements,
    elementRefs,
    objetos,
    isMobile,
    debugLog,
  });
  const hasBounds = Boolean(bounds);
  const groupBadge = useMemo(
    () => buildGroupBadgeLayout(selectedGroupObject, bounds, isMobile),
    [bounds, isMobile, selectedGroupObject]
  );

  useEffect(() => {
    if (typeof onVisualReadyChange !== "function") return;
    onVisualReadyChange(hasBounds);

    return () => {
      onVisualReadyChange(false);
    };
  }, [hasBounds, onVisualReadyChange]);

  if (!bounds) {
    return null;
  }

  return (
    <Group ref={groupRef} name="ui selection-bounds-indicator" listening={false}>
      <Line
        ref={polygonRef}
        points={bounds.kind === "polygon" ? bounds.points : []}
        closed
        visible={bounds.kind === "polygon"}
        fillEnabled={false}
        stroke={SELECTION_FRAME_STROKE}
        strokeWidth={bounds.strokeWidth}
        dash={selectedGroupObject ? [8, 4] : undefined}
        listening={false}
        perfectDrawEnabled={false}
      />
      <Rect
        ref={rectRef}
        x={bounds.kind === "rect" ? bounds.x : 0}
        y={bounds.kind === "rect" ? bounds.y : 0}
        width={bounds.kind === "rect" ? bounds.width : 0}
        height={bounds.kind === "rect" ? bounds.height : 0}
        visible={bounds.kind === "rect"}
        fill="transparent"
        stroke={SELECTION_FRAME_STROKE}
        strokeWidth={bounds.strokeWidth}
        dash={selectedGroupObject ? [8, 4] : undefined}
        listening={false}
        perfectDrawEnabled={false}
        strokeScaleEnabled={false}
      />
      {groupBadge ? (
        <Group listening={false}>
          <Rect
            x={groupBadge.x}
            y={groupBadge.y}
            width={groupBadge.width}
            height={groupBadge.height}
            fill="rgba(147, 51, 234, 0.96)"
            cornerRadius={groupBadge.height / 2}
            stroke="rgba(255,255,255,0.85)"
            strokeWidth={0.75}
            shadowColor="rgba(88, 28, 135, 0.28)"
            shadowBlur={8}
            shadowOffset={{ x: 0, y: 2 }}
          />
          <Text
            x={groupBadge.x + groupBadge.paddingX}
            y={groupBadge.y + (isMobile ? 6 : 5)}
            text={groupBadge.label}
            fontSize={groupBadge.fontSize}
            fontStyle="bold"
            fill="#ffffff"
            listening={false}
          />
        </Group>
      ) : null}
    </Group>
  );
}
