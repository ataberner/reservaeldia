import { useCallback, useEffect, useRef } from "react";
import { Rect } from "react-konva";
import {
  getSelectionFramePaddingForSelection,
  getSelectionFrameStrokeWidth,
  SELECTION_FRAME_STROKE,
} from "@/components/editor/textSystem/render/konva/selectionFrameVisuals";

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

        if (obj.tipo === "texto" && node.getTextHeight) {
          const textHeight = node.getTextHeight();
          if (textHeight) {
            height = textHeight;
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

  const padding = getSelectionFramePaddingForSelection(elementosData, isMobile);

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
    strokeWidth: getSelectionFrameStrokeWidth(isMobile),
  };
}

export default function SelectionBoundsIndicator({
  selectedElements,
  elementRefs,
  objetos,
  isMobile = false,
  debugLog = () => {},
}) {
  const rectRef = useRef(null);

  const syncIndicatorBounds = useCallback(() => {
    const rectNode = rectRef.current;
    if (!rectNode) return;

    const nextBounds = resolveSelectionBounds({
      selectedElements,
      elementRefs,
      objetos,
      isMobile,
      debugLog,
    });

    if (!nextBounds) return;

    const didChange =
      rectNode.x() !== nextBounds.x ||
      rectNode.y() !== nextBounds.y ||
      rectNode.width() !== nextBounds.width ||
      rectNode.height() !== nextBounds.height ||
      rectNode.strokeWidth() !== nextBounds.strokeWidth;

    if (!didChange) return;

    rectNode.setAttrs(nextBounds);
    rectNode.getLayer?.()?.batchDraw?.();
  }, [debugLog, elementRefs, isMobile, objetos, selectedElements]);

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
    });

    stage?.on("dragmove.selection-bounds-indicator", syncIndicatorBounds);
    syncIndicatorBounds();

    return () => {
      selectedNodes.forEach((node) => {
        node.off("dragmove.selection-bounds-indicator", syncIndicatorBounds);
        node.off("transform.selection-bounds-indicator", syncIndicatorBounds);
        node.off("xChange.selection-bounds-indicator", syncIndicatorBounds);
        node.off("yChange.selection-bounds-indicator", syncIndicatorBounds);
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

  if (!bounds) {
    return null;
  }

  return (
    <Rect
      ref={rectRef}
      name="ui"
      x={bounds.x}
      y={bounds.y}
      width={bounds.width}
      height={bounds.height}
      fill="transparent"
      stroke={SELECTION_FRAME_STROKE}
      strokeWidth={bounds.strokeWidth}
      listening={false}
      opacity={0.7}
    />
  );
}
