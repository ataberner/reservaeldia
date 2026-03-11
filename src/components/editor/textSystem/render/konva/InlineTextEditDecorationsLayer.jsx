import { Group, Rect, Line } from "react-konva";
import {
  buildInlineCaretVisual,
  INLINE_CARET_ACCENT,
  INLINE_CARET_ACCENT_SOFT,
} from "@/components/editor/textSystem/render/inlineCaretStyle";
import {
  getSelectionFrameStrokeWidth,
  SELECTION_FRAME_STROKE,
} from "@/components/editor/textSystem/render/konva/selectionFrameVisuals";

export default function InlineTextEditDecorationsLayer({
  decorations = null,
  outlineRect = null,
  outlinePoints = null,
  isMobile = false,
}) {
  const selectionRects = Array.isArray(decorations?.selectionRects)
    ? decorations.selectionRects
    : [];
  const caretRect = decorations?.caretRect || null;
  const hasOutlinePoints =
    Array.isArray(outlinePoints) &&
    outlinePoints.length >= 8 &&
    outlinePoints.every((value) => Number.isFinite(Number(value)));
  const hasOutline =
    !hasOutlinePoints &&
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

  if (!hasSelection && !hasCaret && !hasOutline && !hasOutlinePoints) {
    return null;
  }

  return (
    <Group name="inline-text-edit-decorations" listening={false}>
      {hasOutlinePoints && (
        <Line
          points={outlinePoints}
          closed
          fillEnabled={false}
          stroke={SELECTION_FRAME_STROKE}
          strokeWidth={getSelectionFrameStrokeWidth(isMobile)}
          perfectDrawEnabled={false}
        />
      )}
      {hasOutline && (
        <Rect
          x={outlineRect.x}
          y={outlineRect.y}
          width={outlineRect.width}
          height={outlineRect.height}
          stroke={SELECTION_FRAME_STROKE}
          strokeWidth={getSelectionFrameStrokeWidth(isMobile)}
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
