import { resolveAuthoritativeTextRect } from "@/components/editor/canvasEditor/konvaAuthoritativeBounds";
import {
  buildTextGeometryContractRect,
  evaluateTextGeometryContractRectAlignment,
  logTextGeometryContractInvariant,
} from "@/components/editor/canvasEditor/textGeometryContractDebug";

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

function readInlineNodeId(node, fallback = null) {
  if (!node) return fallback;
  try {
    if (typeof node.id === "function") {
      const value = node.id();
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  } catch {}

  if (typeof node?.attrs?.id === "string" && node.attrs.id.trim().length > 0) {
    return node.attrs.id.trim();
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

export function getInlineKonvaProjectedRectViewport(
  node,
  stage,
  scaleVisual = 1,
  options = {}
) {
  const stageMetrics = resolveInlineStageViewportMetrics(stage, { scaleVisual });
  if (!node || !stage) {
    return {
      konvaTextClientRect: null,
      konvaAuthoritativeTextRect: null,
      konvaProjectionLocalRect: null,
      konvaProjectedRectViewport: null,
      konvaProjectionGeometrySource: null,
      authoritativeTextRectAvailable: false,
      ...stageMetrics,
    };
  }

  const textNode = resolveInlineKonvaTextNode(node, stage) || node;

  let renderedLocalRect = null;
  try {
    renderedLocalRect =
      typeof textNode.getClientRect === "function"
        ? textNode.getClientRect({
            relativeTo: stage,
            skipTransform: false,
            skipShadow: true,
            skipStroke: true,
          })
        : null;
  } catch {
    renderedLocalRect = null;
  }

  const inferredElementId =
    readInlineNodeId(textNode, readInlineNodeId(node, null)) || null;
  const authoritativeTextRect = resolveAuthoritativeTextRect(
    textNode,
    options?.objectMeta ||
      (textNode?.getClassName?.() === "Text"
        ? {
            id: inferredElementId,
            tipo: "texto",
          }
        : null),
    {
      fallbackRect: renderedLocalRect,
    }
  );
  const projectionLocalRect = authoritativeTextRect || renderedLocalRect || null;
  const projectionGeometrySource = authoritativeTextRect
    ? "authoritative-text-rect"
    : renderedLocalRect
      ? "client-rect-fallback"
      : "missing";
  const konvaTextClientRect = rectToPayload(renderedLocalRect);
  const konvaAuthoritativeTextRect = rectToPayload(authoritativeTextRect);
  const konvaProjectionLocalRect = rectToPayload(projectionLocalRect);
  const konvaProjectedRectViewport = projectInlineRectToViewport(
    projectionLocalRect,
    stageMetrics
  );
  const projectionCheck = evaluateTextGeometryContractRectAlignment(
    authoritativeTextRect,
    projectionLocalRect,
    {
      tolerance: 0.5,
      expectedLabel: "authoritative Konva text rect",
      actualLabel: "inline projection local rect",
    }
  );

  logTextGeometryContractInvariant(
    "inline-projection-geometry-source",
    {
      phase: options?.phase || "inline-projection",
      surface: options?.surface || "inline-dom-projection",
      authoritySource: projectionGeometrySource,
      sessionIdentity:
        options?.sessionIdentity ||
        inferredElementId ||
        null,
      elementId: options?.elementId || inferredElementId || null,
      tipo: "texto",
      caller: options?.caller || "getInlineKonvaProjectedRectViewport",
      pass:
        projectionGeometrySource === "authoritative-text-rect" &&
        projectionCheck.pass,
      failureReason:
        projectionGeometrySource === "client-rect-fallback"
          ? "inline projection fell back to generic client rect because authoritative text geometry was unavailable"
          : projectionGeometrySource === "missing"
            ? "inline projection could not resolve any Konva text geometry"
            : projectionCheck.failureReason,
      observedRects: {
        authoritativeKonvaRect: buildTextGeometryContractRect(
          authoritativeTextRect
        ),
        inlineProjectionLocalRect: buildTextGeometryContractRect(
          projectionLocalRect
        ),
        renderedTextClientRect: buildTextGeometryContractRect(
          renderedLocalRect
        ),
        inlineProjectedViewportRect: buildTextGeometryContractRect(
          konvaProjectedRectViewport
        ),
      },
      observedSources: {
        authoritativeTextRectAvailable: Boolean(authoritativeTextRect),
        projectionGeometrySource,
        stageScaleSourceX: stageMetrics.scaleSourceX || null,
        stageScaleSourceY: stageMetrics.scaleSourceY || null,
      },
      delta: projectionCheck.delta,
    },
    {
      sampleKey: `text-contract:inline-source:${
        options?.sessionIdentity || options?.elementId || inferredElementId || "unknown"
      }`,
      firstCount: 5,
      throttleMs: 140,
      force:
        projectionGeometrySource !== "authoritative-text-rect" ||
        !projectionCheck.pass,
    }
  );

  return {
    konvaTextClientRect,
    konvaAuthoritativeTextRect,
    konvaProjectionLocalRect,
    konvaProjectedRectViewport,
    konvaProjectionGeometrySource: projectionGeometrySource,
    authoritativeTextRectAvailable: Boolean(authoritativeTextRect),
    ...stageMetrics,
  };
}
