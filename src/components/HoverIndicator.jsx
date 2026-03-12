import { Rect, Group, Line } from "react-konva";
import {
  buildSelectionFramePolygon,
  getSelectionFramePadding,
} from "@/components/editor/textSystem/render/konva/selectionFrameVisuals";
import { isFunctionalCtaButton } from "@/domain/functionalCtaButtons";

export default function HoverIndicator({
  hoveredElement,
  elementRefs,
  objetos = [],
  activeInlineEditingId = null,
  isMobile = false,
}) {
  if (!hoveredElement || !elementRefs?.current?.[hoveredElement]) return null;

  const node = elementRefs.current[hoveredElement];
  if (!node?.getStage?.()) return null;

  const hoveredObj = Array.isArray(objetos)
    ? objetos.find((o) => o.id === hoveredElement)
    : null;
  const suppressInlineTextHover =
    hoveredObj?.tipo === "texto" && hoveredElement === activeInlineEditingId;
  const shouldUseRotatedFrame =
    hoveredObj?.tipo === "texto" ||
    hoveredObj?.tipo === "forma" ||
    isFunctionalCtaButton(hoveredObj);

  if (suppressInlineTextHover) {
    return null;
  }

  let box = null;
  if (
    hoveredObj?.tipo === "galeria" &&
    Number.isFinite(Number(hoveredObj.width)) &&
    Number.isFinite(Number(hoveredObj.height))
  ) {
    const absPos =
      typeof node.getAbsolutePosition === "function"
        ? node.getAbsolutePosition()
        : {
            x: typeof node.x === "function" ? node.x() : 0,
            y: typeof node.y === "function" ? node.y() : 0,
          };

    box = {
      x: absPos.x,
      y: absPos.y,
      width: Number(hoveredObj.width),
      height: Number(hoveredObj.height),
    };
  } else if (isFunctionalCtaButton(hoveredObj)) {
    box = node.getClientRect({
      skipShadow: true,
      skipStroke: true,
    });
  } else {
    box = node.getClientRect();
  }

  const framePadding = getSelectionFramePadding(isMobile);
  const framePoints =
    shouldUseRotatedFrame
      ? buildSelectionFramePolygon(node, framePadding)
      : null;
  const hasFramePoints =
    Array.isArray(framePoints) &&
    framePoints.length === 8 &&
    framePoints.every((value) => Number.isFinite(Number(value)));

  if (
    !hasFramePoints &&
    (!box || isNaN(box.x) || isNaN(box.y) || box.width <= 0 || box.height <= 0)
  ) {
    return null;
  }

  return (
    <Group name="ui-hover-indicator">
      {hasFramePoints ? (
        <Line
          points={framePoints}
          closed
          fillEnabled={false}
          stroke="#9333EA"
          strokeWidth={2}
          listening={false}
          perfectDrawEnabled={false}
        />
      ) : (
        <Rect
          x={box.x - framePadding}
          y={box.y - framePadding}
          width={box.width + framePadding * 2}
          height={box.height + framePadding * 2}
          fill="transparent"
          stroke="#9333EA"
          strokeWidth={2}
          listening={false}
        />
      )}
    </Group>
  );
}
