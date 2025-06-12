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
      {/* Glow sutil en hover */}
      <Rect
        x={box.x - 2}
        y={box.y - 2}
        width={box.width + 4}
        height={box.height + 4}
        fill="transparent"
        stroke="rgba(119, 61, 190, 0.4)"
        strokeWidth={1}
        cornerRadius={4}
        shadowColor="rgba(119, 61, 190, 0.2)"
        shadowBlur={6}
        listening={false}
      />
      
      {/* Puntos en las esquinas para indicar interactividad */}
      {[
        { x: box.x, y: box.y },
        { x: box.x + box.width, y: box.y },
        { x: box.x, y: box.y + box.height },
        { x: box.x + box.width, y: box.y + box.height }
      ].map((point, i) => (
        <Rect
          key={i}
          x={point.x - 1}
          y={point.y - 1}
          width={2}
          height={2}
          fill="#773dbe"
          listening={false}
        />
      ))}
    </Group>
  );
}