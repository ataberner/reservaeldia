import {
  buildSelectionFramePolygon,
  getSelectionFramePaddingForSelection,
  getSelectionFrameStrokeWidth,
} from "@/components/editor/textSystem/render/konva/selectionFrameVisuals";
import {
  resolveAuthoritativeTextRect,
} from "@/components/editor/canvasEditor/konvaAuthoritativeBounds";
import {
  logSelectedDragDebug,
  sampleCanvasInteractionLog,
} from "@/components/editor/canvasEditor/selectedDragDebug";
import {
  getActiveCanvasBoxFlowSession,
} from "@/components/editor/canvasEditor/canvasBoxFlowDebug";
import {
  buildTextGeometryContractRect,
  logTextGeometryContractInvariant,
} from "@/components/editor/canvasEditor/textGeometryContractDebug";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundSelectionDebugNumber(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function buildSelectionBoxDebug(box = null) {
  if (!box) return null;
  return {
    x: roundSelectionDebugNumber(box.x),
    y: roundSelectionDebugNumber(box.y),
    width: roundSelectionDebugNumber(box.width),
    height: roundSelectionDebugNumber(box.height),
    centerX: roundSelectionDebugNumber(
      Number(box.x) + Number(box.width) / 2
    ),
    centerY: roundSelectionDebugNumber(
      Number(box.y) + Number(box.height) / 2
    ),
  };
}

function buildSelectionBoxDelta(primaryBox = null, secondaryBox = null) {
  if (!primaryBox || !secondaryBox) return null;
  return {
    dx: roundSelectionDebugNumber(Number(secondaryBox.x) - Number(primaryBox.x)),
    dy: roundSelectionDebugNumber(Number(secondaryBox.y) - Number(primaryBox.y)),
    dWidth: roundSelectionDebugNumber(
      Number(secondaryBox.width) - Number(primaryBox.width)
    ),
    dHeight: roundSelectionDebugNumber(
      Number(secondaryBox.height) - Number(primaryBox.height)
    ),
    dCenterX: roundSelectionDebugNumber(
      (
        Number(secondaryBox.x) + Number(secondaryBox.width) / 2
      ) - (
        Number(primaryBox.x) + Number(primaryBox.width) / 2
      )
    ),
    dCenterY: roundSelectionDebugNumber(
      (
        Number(secondaryBox.y) + Number(secondaryBox.height) / 2
      ) - (
        Number(primaryBox.y) + Number(primaryBox.height) / 2
      )
    ),
  };
}

function normalizeSelectionIds(selectedElements = []) {
  return asArray(selectedElements)
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);
}

function normalizeSelectedObjects(selectedObjects = []) {
  return asArray(selectedObjects).filter(Boolean);
}

function buildSelectionData(selectedElements = [], objetos = [], objectLookup = null) {
  const selectedIds = normalizeSelectionIds(selectedElements);
  if (selectedIds.length === 0) return [];

  if (objectLookup instanceof Map) {
    return selectedIds
      .map((selectedId) => objectLookup.get(selectedId) || null)
      .filter(Boolean);
  }

  if (objectLookup && typeof objectLookup === "object") {
    return selectedIds
      .map((selectedId) => objectLookup[selectedId] || null)
      .filter(Boolean);
  }

  const selectedIdSet = new Set(selectedIds);
  return asArray(objetos).filter((object) => selectedIdSet.has(object?.id));
}

function resolveLineSelectionRect(object, node) {
  if (!node || object?.tipo !== "forma" || object?.figura !== "line") {
    return null;
  }

  const points = Array.isArray(object?.points) ? object.points : [0, 0, 100, 0];
  const cleanPoints = [
    parseFloat(points[0]) || 0,
    parseFloat(points[1]) || 0,
    parseFloat(points[2]) || 100,
    parseFloat(points[3]) || 0,
  ];
  const nodeX = typeof node?.x === "function" ? node.x() : toFiniteNumber(node?.attrs?.x, 0) || 0;
  const nodeY = typeof node?.y === "function" ? node.y() : toFiniteNumber(node?.attrs?.y, 0) || 0;
  const linePadding = 5;
  const x1 = nodeX + cleanPoints[0];
  const y1 = nodeY + cleanPoints[1];
  const x2 = nodeX + cleanPoints[2];
  const y2 = nodeY + cleanPoints[3];

  return {
    x: Math.min(x1, x2) - linePadding,
    y: Math.min(y1, y2) - linePadding,
    width: Math.abs(x2 - x1) + linePadding * 2,
    height: Math.abs(y2 - y1) + linePadding * 2,
  };
}

export function resolveNodeSelectionRect(object, node, debugMeta = null) {
  if (!node || typeof node.getClientRect !== "function") return null;

  if (object?.tipo === "forma" && object?.figura === "line") {
    return resolveLineSelectionRect(object, node);
  }

  const rectOptions = {
    skipTransform: false,
    skipShadow: true,
    skipStroke: true,
  };
  if (debugMeta?.relativeTo) {
    rectOptions.relativeTo = debugMeta.relativeTo;
  }
  const rect = node.getClientRect(rectOptions);
  if (
    !rect ||
    !Number.isFinite(Number(rect.x)) ||
    !Number.isFinite(Number(rect.y)) ||
    !Number.isFinite(Number(rect.width)) ||
    !Number.isFinite(Number(rect.height))
  ) {
    return null;
  }

  const authoritativeTextRect = resolveAuthoritativeTextRect(node, object, {
    fallbackRect: rect,
  });
  if (authoritativeTextRect) {
    if (object?.tipo === "texto") {
      const selectionSession = getActiveCanvasBoxFlowSession("selection");
      const sample = sampleCanvasInteractionLog(
        `selection:text-authority:${object.id || "unknown"}`,
        {
          firstCount: 5,
          throttleMs: 120,
        }
      );
      if (sample.shouldLog) {
        logSelectedDragDebug("selection:text-authority", {
          sampleCount: sample.sampleCount,
          selectionSessionId:
            selectionSession?.sessionIdentity ||
            selectionSession?.identity ||
            null,
          dragOverlaySessionKey: selectionSession?.dragOverlaySessionKey || null,
          elementId: object.id || null,
          tipo: object.tipo || null,
          authoritativeSelectionBox: buildSelectionBoxDebug(authoritativeTextRect),
          renderedTextContentBox: buildSelectionBoxDebug(rect),
          delta: buildSelectionBoxDelta(authoritativeTextRect, rect),
        });
      }

      logTextGeometryContractInvariant(
        "text-geometry-source-of-truth",
        {
          phase: debugMeta?.phase || "selection-bounds-resolve",
          surface: debugMeta?.surface || "selection-bounds",
          authoritySource: "resolveAuthoritativeTextRect",
          caller: debugMeta?.caller || null,
          elementId: object.id || null,
          tipo: object.tipo || null,
          sessionIdentity:
            debugMeta?.sessionIdentity ||
            selectionSession?.sessionIdentity ||
            selectionSession?.identity ||
            object.id ||
            null,
          pass: true,
          failureReason: null,
          observedRects: {
            authoritativeKonvaRect:
              buildTextGeometryContractRect(authoritativeTextRect),
            renderedTextClientRect: buildTextGeometryContractRect(rect),
          },
          observedSources: {
            fallbackRectAvailable: true,
            requireLiveNodes: debugMeta?.requireLiveNodes === true,
          },
          delta: buildSelectionBoxDelta(authoritativeTextRect, rect),
        },
        {
          sampleKey: `text-contract:source:${object.id || "unknown"}:${
            debugMeta?.surface || "selection-bounds"
          }`,
          firstCount: 4,
          throttleMs: 160,
          force: false,
        }
      );
    }
    return authoritativeTextRect;
  }

  if (object?.tipo === "texto") {
    const selectionSession = getActiveCanvasBoxFlowSession("selection");
    logTextGeometryContractInvariant(
      "text-geometry-source-of-truth",
      {
        phase: debugMeta?.phase || "selection-bounds-resolve",
        surface: debugMeta?.surface || "selection-bounds",
        authoritySource: "client-rect-fallback",
        caller: debugMeta?.caller || null,
        elementId: object.id || null,
        tipo: object.tipo || null,
        sessionIdentity:
          debugMeta?.sessionIdentity ||
          selectionSession?.sessionIdentity ||
          selectionSession?.identity ||
          object.id ||
          null,
        pass: false,
        failureReason:
          "text geometry fell back to generic client rect because authoritative text rect was unavailable",
        observedRects: {
          authoritativeKonvaRect: null,
          renderedTextClientRect: buildTextGeometryContractRect(rect),
        },
        observedSources: {
          fallbackRectAvailable: true,
          requireLiveNodes: debugMeta?.requireLiveNodes === true,
        },
      },
      {
        sampleKey: `text-contract:source:${object.id || "unknown"}:${
          debugMeta?.surface || "selection-bounds"
        }`,
        firstCount: 4,
        throttleMs: 160,
        force: true,
      }
    );
    if (debugMeta?.requireLiveNodes === true) {
      return null;
    }
  }

  let width = rect.width;
  let height = rect.height;
  if (object?.tipo === "texto" && typeof node.height === "function") {
    const textHeight = Number(node.height());
    const scaleY = Math.abs(
      typeof node.scaleY === "function" ? (node.scaleY() || 1) : 1
    );
    const scaledTextHeight = textHeight * scaleY;
    if (Number.isFinite(scaledTextHeight) && scaledTextHeight > 0) {
      height = scaledTextHeight;
    }
  }

  return {
    x: rect.x,
    y: rect.y,
    width,
    height,
  };
}

function hasFiniteSelectionPolygonPoints(points) {
  return (
    Array.isArray(points) &&
    points.length === 8 &&
    points.every((value) => Number.isFinite(Number(value)))
  );
}

function hasMeaningfulSelectionRotation(node, object) {
  const rawRotation =
    typeof node?.rotation === "function"
      ? Number(node.rotation() || 0)
      : Number(object?.rotation || 0);

  if (!Number.isFinite(rawRotation)) return false;

  const normalizedRotation = Math.abs(rawRotation % 360);
  return normalizedRotation > 0.01 && Math.abs(normalizedRotation - 360) > 0.01;
}

export function resolveSingleTextSelectionVisualBounds({
  object,
  node,
  isMobile = false,
  includePadding = true,
} = {}) {
  if (object?.tipo !== "texto" || !node) {
    return null;
  }

  const padding = includePadding
    ? getSelectionFramePaddingForSelection([object], isMobile)
    : 0;
  const strokeWidth = getSelectionFrameStrokeWidth(isMobile);

  if (hasMeaningfulSelectionRotation(node, object)) {
    const rotatedPoints = buildSelectionFramePolygon(node, padding);

    if (hasFiniteSelectionPolygonPoints(rotatedPoints)) {
      return {
        kind: "polygon",
        points: rotatedPoints,
        strokeWidth,
        padding,
      };
    }
  }

  const rect = resolveNodeSelectionRect(object, node, {
    phase: "single-text-visual-bounds",
    surface: "selection-bounds",
    caller: "resolveSingleTextSelectionVisualBounds",
    requireLiveNodes: true,
  });
  if (!rect) return null;

  return {
    kind: "rect",
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
    strokeWidth,
    padding,
    unionRect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
  };
}

export function resolveSelectionUnionRect({
  selectedElements,
  selectedObjects = null,
  elementRefs,
  objetos,
  objectLookup = null,
  requireLiveNodes = false,
} = {}) {
  const normalizedSelectedObjects = normalizeSelectedObjects(selectedObjects);
  const resolvedSelectedObjects =
    normalizedSelectedObjects.length > 0
      ? normalizedSelectedObjects
      : buildSelectionData(selectedElements, objetos, objectLookup);
  if (resolvedSelectedObjects.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let liveRectCount = 0;

  resolvedSelectedObjects.forEach((object) => {
    const node = elementRefs?.current?.[object.id] || null;
    const liveRect = resolveNodeSelectionRect(object, node, {
      phase: requireLiveNodes ? "drag" : "selected",
      surface: "selection-union",
      caller: "resolveSelectionUnionRect",
      requireLiveNodes,
    });
    if (liveRect) {
      liveRectCount += 1;
      minX = Math.min(minX, liveRect.x);
      minY = Math.min(minY, liveRect.y);
      maxX = Math.max(maxX, liveRect.x + liveRect.width);
      maxY = Math.max(maxY, liveRect.y + liveRect.height);
      return;
    }

    if (requireLiveNodes) return;

    const fallbackX = toFiniteNumber(object?.x, 0) || 0;
    const fallbackY = toFiniteNumber(object?.y, 0) || 0;
    const fallbackWidth = Math.max(1, toFiniteNumber(object?.width, 20) || 20);
    const fallbackHeight = Math.max(1, toFiniteNumber(object?.height, 20) || 20);
    minX = Math.min(minX, fallbackX);
    minY = Math.min(minY, fallbackY);
    maxX = Math.max(maxX, fallbackX + fallbackWidth);
    maxY = Math.max(maxY, fallbackY + fallbackHeight);
  });

  if (requireLiveNodes && liveRectCount !== resolvedSelectedObjects.length) {
    return null;
  }

  if (
    minX === Infinity ||
    minY === Infinity ||
    maxX === -Infinity ||
    maxY === -Infinity
  ) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    selectedObjects: resolvedSelectedObjects,
  };
}

export function resolveSelectionFrameRect({
  selectedElements,
  selectedObjects = null,
  elementRefs,
  objetos,
  objectLookup = null,
  isMobile = false,
  includePadding = true,
  requireLiveNodes = false,
} = {}) {
  const unionRect = resolveSelectionUnionRect({
    selectedElements,
    selectedObjects,
    elementRefs,
    objetos,
    objectLookup,
    requireLiveNodes,
  });
  if (!unionRect) return null;

  const normalizedSelectedObjects = normalizeSelectedObjects(selectedObjects);
  const resolvedSelectedObjects =
    unionRect.selectedObjects ||
    (normalizedSelectedObjects.length > 0
      ? normalizedSelectedObjects
      : null) ||
    buildSelectionData(selectedElements, objetos, objectLookup);
  const padding = includePadding
    ? getSelectionFramePaddingForSelection(resolvedSelectedObjects, isMobile)
    : 0;

  return {
    x: unionRect.x - padding,
    y: unionRect.y - padding,
    width: unionRect.width + padding * 2,
    height: unionRect.height + padding * 2,
    strokeWidth: getSelectionFrameStrokeWidth(isMobile),
    padding,
    selectedObjects: resolvedSelectedObjects,
    unionRect: {
      x: unionRect.x,
      y: unionRect.y,
      width: unionRect.width,
      height: unionRect.height,
    },
  };
}
