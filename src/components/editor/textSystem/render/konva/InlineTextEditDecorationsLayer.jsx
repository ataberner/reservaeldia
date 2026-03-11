import { Group, Rect } from "react-konva";
import {
  buildInlineCaretVisual,
  INLINE_CARET_ACCENT,
  INLINE_CARET_ACCENT_SOFT,
} from "@/components/editor/textSystem/render/inlineCaretStyle";

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
  const caretVisual = hasCaret ? buildInlineCaretVisual(caretRect) : null;

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

      {caretVisual && (
        <Group>
          <Rect
            x={caretVisual.glow.x}
            y={caretVisual.glow.y}
            width={caretVisual.glow.width}
            height={caretVisual.glow.height}
            fill={INLINE_CARET_ACCENT_SOFT}
            cornerRadius={caretVisual.glow.radius}
            opacity={0.85}
            perfectDrawEnabled={false}
          />
          <Rect
            x={caretVisual.body.x}
            y={caretVisual.body.y}
            width={caretVisual.body.width}
            height={caretVisual.body.height}
            cornerRadius={caretVisual.body.radius}
            fill={INLINE_CARET_ACCENT}
            opacity={0.82}
            shadowColor="rgba(51, 65, 85, 0.08)"
            shadowBlur={1.5}
            shadowOpacity={0.45}
            perfectDrawEnabled={false}
          />
        </Group>
      )}
    </Group>
  );
}
