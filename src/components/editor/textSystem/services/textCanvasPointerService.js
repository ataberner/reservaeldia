import {
  resolveInlineStageViewportMetrics,
} from "@/components/editor/overlays/inlineGeometry";

function toFiniteClientCoordinate(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readClientPointFromNativeEvent(nativeEvent) {
  const touchPoint =
    nativeEvent?.touches?.[0] ||
    nativeEvent?.changedTouches?.[0] ||
    null;
  const clientX =
    toFiniteClientCoordinate(touchPoint?.clientX) ??
    toFiniteClientCoordinate(nativeEvent?.clientX);
  const clientY =
    toFiniteClientCoordinate(touchPoint?.clientY) ??
    toFiniteClientCoordinate(nativeEvent?.clientY);
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return null;
  }
  return { clientX, clientY };
}

export function readClientPointFromCanvasEvent(event, stage, scaleVisual = 1) {
  const nativeEvent = event?.evt || event || null;
  const directPoint = readClientPointFromNativeEvent(nativeEvent);
  if (directPoint) return directPoint;

  const pointerPosition =
    stage?.getPointerPosition?.() ||
    (Number.isFinite(Number(event?.x)) && Number.isFinite(Number(event?.y))
      ? { x: Number(event.x), y: Number(event.y) }
      : null);
  const stageMetrics = resolveInlineStageViewportMetrics(stage, { scaleVisual });
  if (pointerPosition && stageMetrics?.stageRect) {
    return {
      clientX:
        Number(stageMetrics.stageRect.left || 0) +
        Number(pointerPosition.x || 0) * Number(stageMetrics.totalScaleX || 1),
      clientY:
        Number(stageMetrics.stageRect.top || 0) +
        Number(pointerPosition.y || 0) * Number(stageMetrics.totalScaleY || 1),
    };
  }

  const containerRect = stage?.container?.()?.getBoundingClientRect?.() || null;
  const stageWidth =
    typeof stage?.width === "function" ? Number(stage.width()) : null;
  const stageHeight =
    typeof stage?.height === "function" ? Number(stage.height()) : null;
  if (!pointerPosition || !containerRect) {
    return { clientX: null, clientY: null };
  }

  const fallbackScaleX =
    Number.isFinite(stageWidth) && stageWidth > 0
      ? Number(containerRect.width || 0) / stageWidth
      : 1;
  const fallbackScaleY =
    Number.isFinite(stageHeight) && stageHeight > 0
      ? Number(containerRect.height || 0) / stageHeight
      : 1;
  return {
    clientX:
      Number(containerRect.left || 0) +
      Number(pointerPosition.x || 0) * Number(fallbackScaleX || 1),
    clientY:
      Number(containerRect.top || 0) +
      Number(pointerPosition.y || 0) * Number(fallbackScaleY || 1),
  };
}

export default readClientPointFromCanvasEvent;
