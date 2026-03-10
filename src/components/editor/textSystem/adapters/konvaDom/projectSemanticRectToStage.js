import {
  resolveInlineStageViewportMetrics,
  roundInlineMetric,
} from "@/components/editor/overlays/inlineGeometry";

function readRectMetric(rect, primaryKey, secondaryKey) {
  const primary = Number(rect?.[primaryKey]);
  if (Number.isFinite(primary)) return primary;
  const secondary = Number(rect?.[secondaryKey]);
  return Number.isFinite(secondary) ? secondary : null;
}

export default function projectSemanticRectToStage(
  rect,
  stage,
  { scaleVisual = 1 } = {}
) {
  if (!rect || !stage) return null;

  const stageMetrics = resolveInlineStageViewportMetrics(stage, { scaleVisual });
  const stageRect = stageMetrics?.stageRect || null;
  const totalScaleX = Number(stageMetrics?.totalScaleX);
  const totalScaleY = Number(stageMetrics?.totalScaleY);
  const left = readRectMetric(rect, "left", "x");
  const top = readRectMetric(rect, "top", "y");
  const width = Number(rect?.width);
  const height = Number(rect?.height);

  if (
    !stageRect ||
    !Number.isFinite(totalScaleX) ||
    !Number.isFinite(totalScaleY) ||
    totalScaleX <= 0 ||
    totalScaleY <= 0 ||
    !Number.isFinite(left) ||
    !Number.isFinite(top) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }

  return {
    x: roundInlineMetric((left - Number(stageRect.left || 0)) / totalScaleX),
    y: roundInlineMetric((top - Number(stageRect.top || 0)) / totalScaleY),
    width: roundInlineMetric(width / totalScaleX),
    height: roundInlineMetric(height / totalScaleY),
  };
}

export { projectSemanticRectToStage };
