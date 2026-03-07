import { useEffect, useState } from "react";
import { Rect } from "react-konva";

export default function SelectionBoundsIndicator({
  selectedElements,
  elementRefs,
  objetos,
  debugLog = () => {},
}) {
  const [forceUpdate, setForceUpdate] = useState(0);

  useEffect(() => {
    const firstRef = elementRefs.current?.[selectedElements[0]];
    const stage = firstRef?.getStage?.();
    if (!stage) return;

    const handleDragMove = () => {
      setForceUpdate((p) => p + 1);
    };

    stage.on("dragmove", handleDragMove);
    return () => {
      stage.off("dragmove", handleDragMove);
    };
  }, [selectedElements.join(",")]);

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
        const r = box;
        const sx = node?.scaleX?.() ?? 1;
        const sy = node?.scaleY?.() ?? 1;
        debugLog(
          "[BI]",
          `id=${obj.id}`,
          `tipo=${obj.tipo}`,
          `sx=${sx.toFixed(3)}`,
          `sy=${sy.toFixed(3)}`,
          `rect(w=${r.width.toFixed(1)},h=${r.height.toFixed(1)})`
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

  const padding = 10;
  const finalX = minX - padding;
  const finalY = minY - padding;
  const finalWidth = maxX - minX + padding * 2;
  const finalHeight = maxY - minY + padding * 2;

  void forceUpdate;

  return (
    <Rect
      name="ui"
      x={finalX}
      y={finalY}
      width={finalWidth}
      height={finalHeight}
      fill="transparent"
      stroke="#9333EA"
      strokeWidth={1}
      listening={false}
      opacity={0.7}
    />
  );
}
