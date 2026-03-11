export const INLINE_CARET_ACCENT = "#334155";
export const INLINE_CARET_ACCENT_SOFT = "rgba(51, 65, 85, 0.05)";
export const INLINE_CARET_BLINK_INTERVAL_MS = 480;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function buildInlineCaretVisual(caretRect = null) {
  const x = Number(caretRect?.x);
  const y = Number(caretRect?.y);
  const width = Number(caretRect?.width);
  const height = Number(caretRect?.height);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(height)
  ) {
    return null;
  }

  const safeWidth = Number.isFinite(width) ? Math.max(1, width) : 1;
  const bodyWidth = clamp(Math.max(safeWidth, height * 0.03), 1.15, 1.75);
  const bodyHeight = Math.max(8, height - Math.max(3, height * 0.12));
  const bodyX = x + (safeWidth - bodyWidth) / 2;
  const bodyY = y + (height - bodyHeight) / 2;
  const radius = bodyWidth / 2;
  const glowPadX = Math.max(0.6, bodyWidth * 0.45);
  const glowPadY = Math.max(0.4, height * 0.02);

  return {
    glow: {
      x: bodyX - glowPadX,
      y: bodyY - glowPadY,
      width: bodyWidth + glowPadX * 2,
      height: bodyHeight + glowPadY * 2,
      radius: bodyWidth + glowPadX,
    },
    body: {
      x: bodyX,
      y: bodyY,
      width: bodyWidth,
      height: bodyHeight,
      radius,
    },
  };
}
