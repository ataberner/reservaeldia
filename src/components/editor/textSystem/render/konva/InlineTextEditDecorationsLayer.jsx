import { Group, Rect } from "react-konva";

export default function InlineTextEditDecorationsLayer({
  decorations = null,
  outlineRect = null,
}) {
  const selectionRects = Array.isArray(decorations?.selectionRects)
    ? decorations.selectionRects
    : [];
  const caretRect = decorations?.caretRect || null;
  const hasOutline =
    outlineRect &&
    Number.isFinite(Number(outlineRect.x)) &&
    Number.isFinite(Number(outlineRect.y)) &&
    Number.isFinite(Number(outlineRect.width)) &&
    Number.isFinite(Number(outlineRect.height));
  const hasSelection = selectionRects.length > 0;
  const hasCaret =
    caretRect &&
    Number.isFinite(Number(caretRect.x)) &&
    Number.isFinite(Number(caretRect.y)) &&
    Number.isFinite(Number(caretRect.height));

  if (!hasSelection && !hasCaret && !hasOutline) {
    return null;
  }

  return (
    <Group name="inline-text-edit-decorations" listening={false}>
      {hasOutline && (
        <Rect
          x={outlineRect.x}
          y={outlineRect.y}
          width={outlineRect.width}
          height={outlineRect.height}
          stroke="#773dbe"
          strokeWidth={1.25}
          dash={[6, 3]}
          perfectDrawEnabled={false}
        />
      )}

      {selectionRects.map((rect, index) => (
        <Rect
          key={`inline-selection-${index}`}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          fill="rgba(47, 109, 246, 0.24)"
          perfectDrawEnabled={false}
        />
      ))}

      {hasCaret && (
        <Rect
          x={caretRect.x}
          y={caretRect.y}
          width={caretRect.width}
          height={caretRect.height}
          fill="#111111"
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  );
}
