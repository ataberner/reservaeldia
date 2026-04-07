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

function buildSelectionIdsDigestFromObjects(selectedObjects = []) {
  return normalizeSelectedObjects(selectedObjects)
    .map((object) => String(object?.id || "").trim())
    .filter(Boolean)
    .join(",");
}

function buildObjectDataSelectionRect(object) {
  if (!object || typeof object !== "object") return null;

  const fallbackX = toFiniteNumber(object?.x, null);
  const fallbackY = toFiniteNumber(object?.y, null);
  const fallbackWidth = Math.max(1, toFiniteNumber(object?.width, null) || 0);
  const fallbackHeight = Math.max(1, toFiniteNumber(object?.height, null) || 0);

  if (
    !Number.isFinite(fallbackX) ||
    !Number.isFinite(fallbackY) ||
    !Number.isFinite(fallbackWidth) ||
    !Number.isFinite(fallbackHeight)
  ) {
    return null;
  }

  return {
    x: fallbackX,
    y: fallbackY,
    width: fallbackWidth,
    height: fallbackHeight,
  };
}

function resolveObjectDataSelectionFallbackRect(object) {
  return (
    buildObjectDataSelectionRect(object) || {
      x: toFiniteNumber(object?.x, 0) || 0,
      y: toFiniteNumber(object?.y, 0) || 0,
      width: Math.max(1, toFiniteNumber(object?.width, 20) || 20),
      height: Math.max(1, toFiniteNumber(object?.height, 20) || 20),
    }
  );
}

function buildSelectionUnionFromRects(rectEntries = []) {
  if (!Array.isArray(rectEntries) || rectEntries.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  rectEntries.forEach((entry) => {
    const rect = entry?.rect || null;
    if (!rect) return;
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  });

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
  };
}

function logSelectionUnionSourceDecision({
  resolvedSelectedObjects = [],
  debugMeta = null,
  geometrySource = "unresolved",
  liveRectCount = 0,
  fallbackRectCount = 0,
  mixedSourcePrevented = false,
  failureReason = null,
  requireLiveNodes = false,
} = {}) {
  const normalizedSelectedObjects = normalizeSelectedObjects(resolvedSelectedObjects);
  const selectedIdsDigest = buildSelectionIdsDigestFromObjects(
    normalizedSelectedObjects
  );
  const hasText = normalizedSelectedObjects.some(
    (object) => object?.tipo === "texto"
  );
  const selectionSession = getActiveCanvasBoxFlowSession("selection");
  const selectionIdentity =
    debugMeta?.sessionIdentity ||
    selectionSession?.sessionIdentity ||
    selectionSession?.identity ||
    selectedIdsDigest ||
    null;
  const sample = sampleCanvasInteractionLog(
    `selection-union:${geometrySource}:${selectedIdsDigest || "none"}:${
      debugMeta?.surface || "selection-union"
    }`,
    {
      firstCount: 4,
      throttleMs: 160,
    }
  );
  const shouldLog =
    sample.shouldLog ||
    mixedSourcePrevented ||
    geometrySource !== "live" ||
    Boolean(failureReason);

  if (!shouldLog) return;

  logSelectedDragDebug("selection:union-source", {
    sampleCount: sample.sampleCount,
    phase: debugMeta?.phase || (requireLiveNodes ? "drag" : "selected"),
    surface: debugMeta?.surface || "selection-union",
    caller: debugMeta?.caller || "resolveSelectionUnionRect",
    sessionIdentity: selectionIdentity,
    selectedIds: selectedIdsDigest || null,
    selectedCount: normalizedSelectedObjects.length,
    hasText,
    requireLiveNodes,
    geometrySource,
    allLive: geometrySource === "live",
    allFallback: geometrySource === "object-data-fallback",
    unresolved: geometrySource === "unresolved",
    mixedSourcePrevented,
    liveRectCount,
    fallbackRectCount,
    failureReason,
  });
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

  const textObjectDataFallbackRect =
    object?.tipo === "texto" ? buildObjectDataSelectionRect(object) : null;
  const allowTextClientRectFallback =
    object?.tipo === "texto" && debugMeta?.allowTextClientRectFallback === true;
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
            clientRectFallbackAllowed: allowTextClientRectFallback,
            objectDataFallbackAvailable: Boolean(textObjectDataFallbackRect),
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
        authoritySource: allowTextClientRectFallback
          ? "client-rect-explicit-fallback"
          : "authoritative-text-required",
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
          allowTextClientRectFallback
            ? "text geometry used an explicit generic client rect fallback because authoritative text rect was unavailable"
            : "text geometry required the authoritative text rect; generic client rect fallback is disabled for this surface",
        observedRects: {
          authoritativeKonvaRect: null,
          renderedTextClientRect: buildTextGeometryContractRect(rect),
          objectDataFallbackRect:
            buildTextGeometryContractRect(textObjectDataFallbackRect),
        },
        observedSources: {
          fallbackRectAvailable: true,
          requireLiveNodes: debugMeta?.requireLiveNodes === true,
          clientRectFallbackAllowed: allowTextClientRectFallback,
          objectDataFallbackAvailable: Boolean(textObjectDataFallbackRect),
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
    if (!allowTextClientRectFallback) {
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
  debugMeta = null,
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
    phase: debugMeta?.phase || "single-text-visual-bounds",
    surface: debugMeta?.surface || "selection-bounds",
    caller:
      debugMeta?.caller || "resolveSingleTextSelectionVisualBounds",
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
  debugMeta = null,
} = {}) {
  const normalizedSelectedObjects = normalizeSelectedObjects(selectedObjects);
  const resolvedSelectedObjects =
    normalizedSelectedObjects.length > 0
      ? normalizedSelectedObjects
      : buildSelectionData(selectedElements, objetos, objectLookup);
  if (resolvedSelectedObjects.length === 0) return null;

  const liveRectEntries = [];
  const fallbackRectEntries = [];

  resolvedSelectedObjects.forEach((object) => {
    const node = elementRefs?.current?.[object.id] || null;
    const liveRect = resolveNodeSelectionRect(object, node, {
      phase: debugMeta?.phase || (requireLiveNodes ? "drag" : "selected"),
      surface: debugMeta?.surface || "selection-union",
      caller: debugMeta?.caller || "resolveSelectionUnionRect",
      requireLiveNodes,
    });
    if (liveRect) {
      liveRectEntries.push({
        object,
        rect: liveRect,
      });
    }

    if (requireLiveNodes) return;

    fallbackRectEntries.push({
      object,
      rect: resolveObjectDataSelectionFallbackRect(object),
    });
  });

  const totalSelectedCount = resolvedSelectedObjects.length;
  const liveRectCount = liveRectEntries.length;
  const fallbackRectCount = fallbackRectEntries.length;
  const allLiveAvailable = liveRectCount === totalSelectedCount;
  const allFallbackAvailable = fallbackRectCount === totalSelectedCount;
  const mixedSourcePrevented =
    !requireLiveNodes &&
    liveRectCount > 0 &&
    liveRectCount !== totalSelectedCount &&
    fallbackRectCount > 0;

  let geometrySource = "unresolved";
  let activeRectEntries = null;
  let failureReason = null;

  if (allLiveAvailable) {
    geometrySource = "live";
    activeRectEntries = liveRectEntries;
  } else if (requireLiveNodes) {
    geometrySource = "unresolved";
    failureReason = "missing-live-geometry";
  } else if (allFallbackAvailable) {
    geometrySource = "object-data-fallback";
    activeRectEntries = fallbackRectEntries;
    failureReason =
      liveRectCount > 0
        ? "mixed-union-prevented-fell-back-to-source-pure-fallback"
        : "live-geometry-unavailable-used-source-pure-fallback";
  } else {
    geometrySource = "unresolved";
    failureReason = "no-lawful-source-for-selection-union";
  }

  if (geometrySource === "object-data-fallback") {
    fallbackRectEntries.forEach(({ object, rect }) => {
      if (object?.tipo !== "texto") return;
      const selectionSession = getActiveCanvasBoxFlowSession("selection");
      const liveGeometryAvailable = liveRectEntries.some(
        (entry) => entry?.object?.id === object.id
      );
      logTextGeometryContractInvariant(
        "text-geometry-explicit-fallback",
        {
          phase: debugMeta?.phase || "selected",
          surface: debugMeta?.surface || "selection-union",
          authoritySource: "object-data-fallback",
          caller: debugMeta?.caller || "resolveSelectionUnionRect",
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
            objectDataFallbackRect: buildTextGeometryContractRect(rect),
          },
          observedSources: {
            liveGeometryAvailable,
            requireLiveNodes,
            fallbackReason: liveGeometryAvailable
              ? "selected-union-source-purity"
              : "authoritative-text-unavailable",
          },
        },
        {
          sampleKey: `text-contract:fallback:${object.id || "unknown"}:${
            debugMeta?.surface || "selection-union"
          }`,
          firstCount: 4,
          throttleMs: 160,
          force: true,
        }
      );
    });
  }

  logSelectionUnionSourceDecision({
    resolvedSelectedObjects,
    debugMeta,
    geometrySource,
    liveRectCount,
    fallbackRectCount,
    mixedSourcePrevented,
    failureReason,
    requireLiveNodes,
  });

  if (!activeRectEntries) {
    return null;
  }

  const unionRect = buildSelectionUnionFromRects(activeRectEntries);
  if (!unionRect) {
    logSelectionUnionSourceDecision({
      resolvedSelectedObjects,
      debugMeta,
      geometrySource: "unresolved",
      liveRectCount,
      fallbackRectCount,
      mixedSourcePrevented,
      failureReason: "selection-union-build-failed",
      requireLiveNodes,
    });
    return null;
  }

  return {
    x: unionRect.x,
    y: unionRect.y,
    width: unionRect.width,
    height: unionRect.height,
    geometrySource,
    selectionUnionSource: geometrySource,
    mixedSourcePrevented,
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
  debugMeta = null,
} = {}) {
  const unionRect = resolveSelectionUnionRect({
    selectedElements,
    selectedObjects,
    elementRefs,
    objetos,
    objectLookup,
    requireLiveNodes,
    debugMeta,
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
    geometrySource: unionRect.geometrySource || null,
    selectionUnionSource: unionRect.selectionUnionSource || null,
    mixedSourcePrevented: unionRect.mixedSourcePrevented === true,
    selectedObjects: resolvedSelectedObjects,
    unionRect: {
      x: unionRect.x,
      y: unionRect.y,
      width: unionRect.width,
      height: unionRect.height,
    },
  };
}
