import { useCallback, useEffect, useRef } from "react";
import { Group, Line, Rect } from "react-konva";
import {
  buildSelectionFramePolygon,
  getSelectionFramePaddingForSelection,
  getSelectionFrameStrokeWidth,
  SELECTION_FRAME_STROKE,
} from "@/components/editor/textSystem/render/konva/selectionFrameVisuals";

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

function resolveSelectionBounds({
  selectedElements,
  elementRefs,
  objetos,
  isMobile,
  debugLog,
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

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  elementosData.forEach((obj) => {
    const node = elementRefs.current[obj.id];
    if (!node) return;

    try {
      if (obj.tipo === "forma" && obj.figura === "line") {
        const points = obj.points || [0, 0, 100, 0];
        const cleanPoints = [
          parseFloat(points[0]) || 0,
          parseFloat(points[1]) || 0,
          parseFloat(points[2]) || 100,
          parseFloat(points[3]) || 0,
        ];

        const realX = node.x();
        const realY = node.y();

        const x1 = realX + cleanPoints[0];
        const y1 = realY + cleanPoints[1];
        const x2 = realX + cleanPoints[2];
        const y2 = realY + cleanPoints[3];

        const linePadding = 5;

        minX = Math.min(minX, x1 - linePadding, x2 - linePadding);
        minY = Math.min(minY, y1 - linePadding, y2 - linePadding);
        maxX = Math.max(maxX, x1 + linePadding, x2 + linePadding);
        maxY = Math.max(maxY, y1 + linePadding, y2 + linePadding);
      } else {
        const box = node.getClientRect({
          skipTransform: false,
          skipShadow: true,
          skipStroke: true,
        });
        const sx = node?.scaleX?.() ?? 1;
        const sy = node?.scaleY?.() ?? 1;
        debugLog(
          "[BI]",
          `id=${obj.id}`,
          `tipo=${obj.tipo}`,
          `sx=${sx.toFixed(3)}`,
          `sy=${sy.toFixed(3)}`,
          `rect(w=${box.width.toFixed(1)},h=${box.height.toFixed(1)})`
        );

        const realX = box.x;
        const realY = box.y;
        let width = box.width;
        let height = box.height;

        if (obj.tipo === "texto" && typeof node.height === "function") {
          const computedTextHeight = Number(node.height());
          const scaledTextHeight = computedTextHeight * Math.abs(Number(sy) || 1);
          if (Number.isFinite(scaledTextHeight) && scaledTextHeight > 0) {
            height = scaledTextHeight;
          }
        }

        minX = Math.min(minX, realX);
        minY = Math.min(minY, realY);
        maxX = Math.max(maxX, realX + width);
        maxY = Math.max(maxY, realY + height);
      }
    } catch {
      const fallbackX = obj.x || 0;
      const fallbackY = obj.y || 0;
      const fallbackSize = 20;

      minX = Math.min(minX, fallbackX);
      minY = Math.min(minY, fallbackY);
      maxX = Math.max(maxX, fallbackX + fallbackSize);
      maxY = Math.max(maxY, fallbackY + fallbackSize);
    }
  });

  if (minX === Infinity || maxX === -Infinity) {
    const primerElemento = elementosData[0];
    if (!primerElemento) return null;
    minX = primerElemento.x || 0;
    minY = primerElemento.y || 0;
    maxX = minX + 100;
    maxY = minY + 50;
  }

  return {
    kind: "rect",
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
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
      debugLog,
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
        listening={false}
        perfectDrawEnabled={false}
        strokeScaleEnabled={false}
      />
    </Group>
  );
}
