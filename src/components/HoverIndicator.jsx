import { Rect, Group } from "react-konva";

export default function HoverIndicator({ hoveredElement, elementRefs, objetos = [] }) {
  if (!hoveredElement || !elementRefs?.current?.[hoveredElement]) return null;

  const node = elementRefs.current[hoveredElement];
  if (!node?.getStage?.()) return null;

  const hoveredObj = Array.isArray(objetos)
    ? objetos.find((o) => o.id === hoveredElement)
    : null;

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
  } else {
    box = node.getClientRect();
  }

  if (!box || isNaN(box.x) || isNaN(box.y) || box.width <= 0 || box.height <= 0) {
    return null;
  }

  return (
    <Group name="ui-hover-indicator">
      <Rect
        x={box.x - 2}
        y={box.y - 2}
        width={box.width + 4}
        height={box.height + 4}
        fill="transparent"
        stroke="#9333EA"
        strokeWidth={2}
        listening={false}
      />
    </Group>
  );
}
