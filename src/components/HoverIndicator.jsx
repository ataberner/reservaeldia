import { Rect, Group } from "react-konva";

export default function HoverIndicator({ hoveredElement, elementRefs }) {
  if (!hoveredElement || !elementRefs?.current?.[hoveredElement]) return null;

  const node = elementRefs.current[hoveredElement];
  const box = node.getClientRect();

  // Validar que el box tiene valores válidos
  if (!box || isNaN(box.x) || isNaN(box.y) || box.width <= 0 || box.height <= 0) {
    return null;
  }

  return (
    <Group>
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
