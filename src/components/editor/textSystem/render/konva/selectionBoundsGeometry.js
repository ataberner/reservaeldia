import {
  getSelectionFramePaddingForSelection,
  getSelectionFrameStrokeWidth,
} from "@/components/editor/textSystem/render/konva/selectionFrameVisuals";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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

function resolveNodeSelectionRect(object, node) {
  if (!node || typeof node.getClientRect !== "function") return null;

  if (object?.tipo === "forma" && object?.figura === "line") {
    return resolveLineSelectionRect(object, node);
  }

  const rect = node.getClientRect({
    skipTransform: false,
    skipShadow: true,
    skipStroke: true,
  });
  if (
    !rect ||
    !Number.isFinite(Number(rect.x)) ||
    !Number.isFinite(Number(rect.y)) ||
    !Number.isFinite(Number(rect.width)) ||
    !Number.isFinite(Number(rect.height))
  ) {
    return null;
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
    const liveRect = resolveNodeSelectionRect(object, node);
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
