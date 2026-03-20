import { trackCanvasDragPerf } from "@/components/editor/canvasEditor/canvasDragPerf";

function getOverlayLayerNode(layerOrRef) {
  if (!layerOrRef) return null;
  return layerOrRef?.current || layerOrRef || null;
}

function getOverlayLiftState(node) {
  return {
    parent: node?.__canvasOverlayLiftParent || null,
    zIndex: node?.__canvasOverlayLiftZIndex ?? null,
    sourceLayer: node?.__canvasOverlayLiftLayer || null,
  };
}

function clearOverlayLiftState(node) {
  if (!node) return;
  node.__canvasOverlayLiftParent = null;
  node.__canvasOverlayLiftZIndex = null;
  node.__canvasOverlayLiftLayer = null;
}

export function liftNodeToOverlayLayer(node, overlayLayerRef, payload = {}, options = {}) {
  const overlayLayer = getOverlayLayerNode(overlayLayerRef);
  const currentLayer = node?.getLayer?.() || null;
  const parent = node?.getParent?.() || null;
  const eventPrefix = options?.eventPrefix || "image:overlay-layer";
  const shouldSyncDrawSourceLayer = options?.syncDrawSourceLayer === true;
  const shouldSyncDrawOverlayLayer = options?.syncDrawOverlayLayer === true;

  if (!node || !overlayLayer || !currentLayer || !parent || currentLayer === overlayLayer) {
    return false;
  }

  if (getOverlayLiftState(node).parent) {
    return true;
  }

  node.__canvasOverlayLiftParent = parent;
  node.__canvasOverlayLiftZIndex =
    typeof node.zIndex === "function" ? node.zIndex() : null;
  node.__canvasOverlayLiftLayer = currentLayer;

  node.moveTo(overlayLayer);
  if (typeof node.moveToTop === "function") {
    node.moveToTop();
  }

  if (shouldSyncDrawSourceLayer) {
    currentLayer.draw?.();
  } else {
    currentLayer.batchDraw?.();
  }

  if (shouldSyncDrawOverlayLayer) {
    overlayLayer.draw?.();
  } else {
    overlayLayer.batchDraw?.();
  }

  trackCanvasDragPerf(`${eventPrefix}-lifted`, {
    ...payload,
    fromLayerChildren:
      typeof currentLayer.getChildren === "function"
        ? currentLayer.getChildren().length
        : null,
    toLayerChildren:
      typeof overlayLayer.getChildren === "function"
        ? overlayLayer.getChildren().length
        : null,
    overlayLayerLabel: overlayLayer.__canvasStagePerfLabel || null,
    syncDrawSourceLayer: shouldSyncDrawSourceLayer,
    syncDrawOverlayLayer: shouldSyncDrawOverlayLayer,
  }, {
    throttleMs: 60,
    throttleKey: `${eventPrefix}-lifted:${payload?.elementId || "unknown"}`,
  });

  return true;
}

export function restoreNodeFromOverlayLayer(node, elementId = null, options = {}) {
  const parent = node?.__canvasOverlayLiftParent || null;
  const overlayLayer = node?.getLayer?.() || null;
  const eventPrefix = options?.eventPrefix || "image:overlay-layer";
  const shouldDrawSourceLayer = options?.drawSourceLayer !== false;
  const shouldDrawOverlayLayer = options?.drawOverlayLayer !== false;

  if (!node || !parent) return false;

  node.moveTo(parent);
  if (Number.isInteger(node.__canvasOverlayLiftZIndex) && typeof node.zIndex === "function") {
    node.zIndex(node.__canvasOverlayLiftZIndex);
  }

  if (shouldDrawSourceLayer) {
    parent.getLayer?.()?.batchDraw?.();
  }
  if (shouldDrawOverlayLayer) {
    overlayLayer?.batchDraw?.();
  }

  trackCanvasDragPerf(`${eventPrefix}-restored`, {
    elementId,
    restoredToLayerChildren:
      typeof parent.getChildren === "function"
        ? parent.getChildren().length
        : null,
    overlayLayerLabel: overlayLayer?.__canvasStagePerfLabel || null,
    drewSourceLayer: shouldDrawSourceLayer,
    drewOverlayLayer: shouldDrawOverlayLayer,
  }, {
    throttleMs: 60,
    throttleKey: `${eventPrefix}-restored:${elementId || "unknown"}`,
  });

  clearOverlayLiftState(node);
  return true;
}
