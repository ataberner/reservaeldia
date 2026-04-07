export const SELECTION_FRAME_STROKE = "#9333EA";
export const SELECTION_FRAME_ACTIVE_STROKE = "#A855F7";

export function getSelectionFramePadding(isMobile = false) {
  return isMobile ? 18 : 8;
}

export function shouldUseTightSelectionFrame(selectedObjects = []) {
  const selection = Array.isArray(selectedObjects)
    ? selectedObjects.filter(Boolean)
    : [selectedObjects].filter(Boolean);
  const firstSelectedObject = selection[0] || null;

  return (
    selection.length === 1 &&
    (
      (
        firstSelectedObject?.tipo === "imagen" &&
        !firstSelectedObject?.esFondo
      ) ||
      firstSelectedObject?.tipo === "texto"
    )
  );
}

export function getSelectionFramePaddingForSelection(selectedObjects = [], isMobile = false) {
  return shouldUseTightSelectionFrame(selectedObjects)
    ? 0
    : getSelectionFramePadding(isMobile);
}

export function getSelectionFrameStrokeWidth(isMobile = false) {
  return isMobile ? 1.5 : 1;
}

export function buildSelectionFramePolygon(node, padding = 0) {
  if (
    !node ||
    typeof node.getClientRect !== "function" ||
    typeof node.getAbsoluteTransform !== "function"
  ) {
    return null;
  }

  try {
    const localRect = node.getClientRect({
      skipTransform: true,
      skipShadow: true,
      skipStroke: true,
    });
    const absoluteTransform = node.getAbsoluteTransform();
    const absoluteScale =
      typeof node.getAbsoluteScale === "function"
        ? node.getAbsoluteScale()
        : { x: 1, y: 1 };
    const scaleX = Math.max(0.0001, Math.abs(Number(absoluteScale?.x) || 1));
    const scaleY = Math.max(0.0001, Math.abs(Number(absoluteScale?.y) || 1));
    const localPaddingX = Number(padding) / scaleX;
    const localPaddingY = Number(padding) / scaleY;

    if (
      !localRect ||
      !Number.isFinite(Number(localRect.x)) ||
      !Number.isFinite(Number(localRect.y)) ||
      !Number.isFinite(Number(localRect.width)) ||
      !Number.isFinite(Number(localRect.height))
    ) {
      return null;
    }

    const corners = [
      { x: Number(localRect.x) - localPaddingX, y: Number(localRect.y) - localPaddingY },
      {
        x: Number(localRect.x) + Number(localRect.width) + localPaddingX,
        y: Number(localRect.y) - localPaddingY,
      },
      {
        x: Number(localRect.x) + Number(localRect.width) + localPaddingX,
        y: Number(localRect.y) + Number(localRect.height) + localPaddingY,
      },
      {
        x: Number(localRect.x) - localPaddingX,
        y: Number(localRect.y) + Number(localRect.height) + localPaddingY,
      },
    ];

    const points = corners.flatMap((corner) => {
      const transformed = absoluteTransform.point(corner);
      return [Number(transformed.x), Number(transformed.y)];
    });

    return points.every((value) => Number.isFinite(value)) ? points : null;
  } catch {
    return null;
  }
}
