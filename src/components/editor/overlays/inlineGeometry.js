function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function roundInlineMetric(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function rectToPayload(rect) {
  if (!rect) return null;
  return {
    x: Number(rect.x),
    y: Number(rect.y),
    width: Number(rect.width),
    height: Number(rect.height),
  };
}

function readNodeProp(node, key, fallback = null) {
  if (!node) return fallback;
  try {
    const fn = node[key];
    if (typeof fn === "function") {
      return fn.call(node);
    }
    if (typeof node.getAttr === "function") {
      const attrValue = node.getAttr(key);
      if (typeof attrValue !== "undefined") return attrValue;
    }
    if (node?.attrs && Object.prototype.hasOwnProperty.call(node.attrs, key)) {
      return node.attrs[key];
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export function resolveInlineKonvaTextNode(node, stage) {
  if (!node) return null;
  try {
    if (typeof node.getClassName === "function" && node.getClassName() === "Text") {
      return node;
    }

    const nodeId =
      (typeof node.id === "function" ? node.id() : node?.attrs?.id) || null;
    if (nodeId && typeof stage?.findOne === "function") {
      const pairedText = stage.findOne(`#${nodeId}-text`);
      if (pairedText?.getClassName?.() === "Text") {
        return pairedText;
      }
    }

    if (typeof node.findOne === "function") {
      const found = node.findOne((n) => n.getClassName?.() === "Text");
      if (found) return found;
    }

    if (typeof node.findAncestor === "function") {
      const ancestor = node.findAncestor((n) => n.getClassName?.() === "Text");
      if (ancestor) return ancestor;
    }
  } catch {
    return node;
  }
  return node;
}

export function resolveInlineStageViewportMetrics(stage, { scaleVisual = 1 } = {}) {
  const stageRect = stage?.container?.()?.getBoundingClientRect?.() || null;

  const stageWidth = toFiniteNumber(readNodeProp(stage, "width"), null);
  const stageHeight = toFiniteNumber(readNodeProp(stage, "height"), null);
  const stageScaleX = toFiniteNumber(readNodeProp(stage, "scaleX"), 1) || 1;
  const stageScaleY = toFiniteNumber(readNodeProp(stage, "scaleY"), 1) || 1;
  const visualScale = toFiniteNumber(scaleVisual, 1) || 1;

  const fallbackScaleX = visualScale * stageScaleX;
  const fallbackScaleY = visualScale * stageScaleY;

  const measuredScaleX =
    stageRect && Number.isFinite(stageWidth) && stageWidth > 0
      ? Number(stageRect.width) / stageWidth
      : null;
  const measuredScaleY =
    stageRect && Number.isFinite(stageHeight) && stageHeight > 0
      ? Number(stageRect.height) / stageHeight
      : null;

  const totalScaleX =
    Number.isFinite(measuredScaleX) && measuredScaleX > 0
      ? measuredScaleX
      : fallbackScaleX;
  const totalScaleY =
    Number.isFinite(measuredScaleY) && measuredScaleY > 0
      ? measuredScaleY
      : fallbackScaleY;

  return {
    stageRect,
    stageWidth: Number.isFinite(stageWidth) ? roundInlineMetric(stageWidth) : null,
    stageHeight: Number.isFinite(stageHeight) ? roundInlineMetric(stageHeight) : null,
    stageScaleX: roundInlineMetric(stageScaleX),
    stageScaleY: roundInlineMetric(stageScaleY),
    totalScaleX: roundInlineMetric(totalScaleX),
    totalScaleY: roundInlineMetric(totalScaleY),
    scaleSourceX:
      Number.isFinite(measuredScaleX) && measuredScaleX > 0 ? "measured" : "fallback",
    scaleSourceY:
      Number.isFinite(measuredScaleY) && measuredScaleY > 0 ? "measured" : "fallback",
  };
}

export function projectInlineRectToViewport(rect, stageMetrics) {
  if (!rect || !stageMetrics?.stageRect) return null;
  const x = Number(rect.x);
  const y = Number(rect.y);
  const width = Number(rect.width);
  const height = Number(rect.height);
  const totalScaleX = Number(stageMetrics.totalScaleX);
  const totalScaleY = Number(stageMetrics.totalScaleY);

  if (![x, y, width, height, totalScaleX, totalScaleY].every(Number.isFinite)) {
    return null;
  }

  return {
    x: roundInlineMetric(Number(stageMetrics.stageRect.left) + x * totalScaleX),
    y: roundInlineMetric(Number(stageMetrics.stageRect.top) + y * totalScaleY),
    width: roundInlineMetric(width * totalScaleX),
    height: roundInlineMetric(height * totalScaleY),
  };
}

export function getInlineKonvaProjectedRectViewport(node, stage, scaleVisual = 1) {
  const stageMetrics = resolveInlineStageViewportMetrics(stage, { scaleVisual });
  if (!node || !stage) {
    return {
      konvaTextClientRect: null,
      konvaProjectedRectViewport: null,
      ...stageMetrics,
    };
  }

  let localRect = null;
  try {
    localRect =
      typeof node.getClientRect === "function"
        ? node.getClientRect({
            relativeTo: stage,
            skipTransform: false,
            skipShadow: true,
            skipStroke: true,
          })
        : null;
  } catch {
    localRect = null;
  }

  const konvaTextClientRect = rectToPayload(localRect);
  const konvaProjectedRectViewport = projectInlineRectToViewport(localRect, stageMetrics);

  return {
    konvaTextClientRect,
    konvaProjectedRectViewport,
    ...stageMetrics,
  };
}
