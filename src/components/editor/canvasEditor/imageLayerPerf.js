import { trackCanvasDragPerf } from "@/components/editor/canvasEditor/canvasDragPerf";
import { recordImageRotationLayerDraw } from "@/components/editor/canvasEditor/imageRotationDebug";
import { resolveObjectPrimaryAssetUrl } from "../../../../shared/renderAssetContract.js";

function getPerfNow() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function roundPerfMetric(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const precision = 10 ** digits;
  return Math.round(numeric * precision) / precision;
}

function resolveCacheStateKeys(options = {}) {
  const rawStateKey =
    typeof options?.cacheStateKey === "string" && options.cacheStateKey.trim()
      ? options.cacheStateKey.trim()
      : "canvasDragCache";
  const normalizedStateKey = rawStateKey.replace(/[^a-zA-Z0-9_$]/g, "") || "canvasDragCache";

  return {
    appliedKey: `__${normalizedStateKey}Applied`,
    wasCachedKey: `__${normalizedStateKey}WasCached`,
    signatureKey: `__${normalizedStateKey}Signature`,
  };
}

function buildImageCacheSignature(payload = null) {
  if (!payload) return "";

  return JSON.stringify([
    payload.src || "",
    Number(payload.sourceWidth || 0) || 0,
    Number(payload.sourceHeight || 0) || 0,
    Number(payload.displayWidth || 0) || 0,
    Number(payload.displayHeight || 0) || 0,
    Number(payload.cropX || 0) || 0,
    Number(payload.cropY || 0) || 0,
    Number(payload.cropWidth || 0) || 0,
    Number(payload.cropHeight || 0) || 0,
  ]);
}

export function buildImagePerfPayload(obj, img, imageCrop, node) {
  if (!obj || !img || !imageCrop) return null;

  const naturalWidth = Number(img?.naturalWidth || img?.width || 0) || 0;
  const naturalHeight = Number(img?.naturalHeight || img?.height || 0) || 0;
  const sourceWidth = Number(imageCrop?.sourceWidth || naturalWidth || 0) || 0;
  const sourceHeight = Number(imageCrop?.sourceHeight || naturalHeight || 0) || 0;
  const displayWidth = Number(imageCrop?.width || obj?.width || 0) || 0;
  const displayHeight = Number(imageCrop?.height || obj?.height || 0) || 0;
  const crop = imageCrop?.crop || null;
  const cropWidth = Number(crop?.width || sourceWidth || 0) || 0;
  const cropHeight = Number(crop?.height || sourceHeight || 0) || 0;
  const cropX = Number(crop?.x || 0) || 0;
  const cropY = Number(crop?.y || 0) || 0;
  const cropPixels = cropWidth * cropHeight;
  const sourcePixels = sourceWidth * sourceHeight;
  const displayPixels = displayWidth * displayHeight;
  const layer = node?.getLayer?.() || null;
  const layerCanvasHandle =
    layer && typeof layer.getCanvas === "function" ? layer.getCanvas() : null;
  const layerCanvas = layerCanvasHandle?._canvas || null;

  return {
    elementId: obj.id,
    tipo: obj.tipo,
    src: resolveObjectPrimaryAssetUrl(obj) || null,
    naturalWidth: naturalWidth || null,
    naturalHeight: naturalHeight || null,
    sourceWidth: sourceWidth || null,
    sourceHeight: sourceHeight || null,
    displayWidth: displayWidth || null,
    displayHeight: displayHeight || null,
    cropX: cropX || 0,
    cropY: cropY || 0,
    cropWidth: cropWidth || null,
    cropHeight: cropHeight || null,
    sourceMp: roundPerfMetric(sourcePixels / 1000000, 3),
    cropMp: roundPerfMetric(cropPixels / 1000000, 3),
    displayMp: roundPerfMetric(displayPixels / 1000000, 3),
    cropCoverage: sourcePixels > 0 ? roundPerfMetric(cropPixels / sourcePixels, 4) : null,
    cropScaleX: displayWidth > 0 ? roundPerfMetric(cropWidth / displayWidth, 3) : null,
    cropScaleY: displayHeight > 0 ? roundPerfMetric(cropHeight / displayHeight, 3) : null,
    rotation: Number(obj?.rotation || 0) || 0,
    opacity: Number.isFinite(Number(obj?.opacity)) ? Number(obj.opacity) : 1,
    nodeCached: typeof node?.isCached === "function" ? node.isCached() : null,
    layerCanvasWidth: Number(layerCanvas?.width || 0) || null,
    layerCanvasHeight: Number(layerCanvas?.height || 0) || null,
  };
}

export function buildImagePerfPayloadFromNode(obj, node) {
  if (!obj || !node) return null;

  const image =
    typeof node.image === "function"
      ? node.image()
      : (node?.attrs?.image || null);

  const crop =
    typeof node.crop === "function"
      ? node.crop()
      : (node?.attrs?.crop || null);
  const width =
    typeof node.width === "function"
      ? Number(node.width() || 0)
      : Number(node?.attrs?.width || obj?.width || 0);
  const height =
    typeof node.height === "function"
      ? Number(node.height() || 0)
      : Number(node?.attrs?.height || obj?.height || 0);

  return buildImagePerfPayload(
    {
      ...obj,
      width,
      height,
      rotation:
        typeof node.rotation === "function"
          ? Number(node.rotation() || 0)
          : obj?.rotation,
    },
    image,
    {
      width,
      height,
      sourceWidth: crop?.width || image?.naturalWidth || image?.width || 0,
      sourceHeight: crop?.height || image?.naturalHeight || image?.height || 0,
      crop: crop || null,
    },
    node
  );
}

function ensureLayerDrawPerfInstrumentation(layer) {
  if (!layer || layer.__canvasImageDragPerfInstrumented) return;

  const originalDrawScene =
    typeof layer.drawScene === "function" ? layer.drawScene : null;
  const originalDrawHit =
    typeof layer.drawHit === "function" ? layer.drawHit : null;

  if (originalDrawScene) {
    layer.drawScene = function patchedDrawScene(...args) {
      const activePayload = this.__canvasActiveImageDragPerf || null;
      if (!activePayload) {
        return originalDrawScene.apply(this, args);
      }

      const startedAt = getPerfNow();
      const result = originalDrawScene.apply(this, args);
      const durationMs = getPerfNow() - startedAt;
      const canvasHandle =
        typeof this.getCanvas === "function" ? this.getCanvas() : null;
      const canvas = canvasHandle?._canvas || null;

      trackCanvasDragPerf("image:layer-draw-scene", {
        ...activePayload,
        durationMs: roundPerfMetric(durationMs),
        layerChildren: typeof this.getChildren === "function" ? this.getChildren().length : null,
        canvasWidth: Number(canvas?.width || 0) || null,
        canvasHeight: Number(canvas?.height || 0) || null,
      }, {
        throttleMs: 90,
        throttleKey: `image:layer-draw-scene:${activePayload.elementId}`,
      });
      recordImageRotationLayerDraw("image:layer-draw-scene", {
        ...activePayload,
        durationMs: roundPerfMetric(durationMs),
        layerChildren: typeof this.getChildren === "function" ? this.getChildren().length : null,
        canvasWidth: Number(canvas?.width || 0) || null,
        canvasHeight: Number(canvas?.height || 0) || null,
      });

      return result;
    };
  }

  if (originalDrawHit) {
    layer.drawHit = function patchedDrawHit(...args) {
      const activePayload = this.__canvasActiveImageDragPerf || null;
      if (!activePayload) {
        return originalDrawHit.apply(this, args);
      }

      const startedAt = getPerfNow();
      const result = originalDrawHit.apply(this, args);
      const durationMs = getPerfNow() - startedAt;

      trackCanvasDragPerf("image:layer-draw-hit", {
        ...activePayload,
        durationMs: roundPerfMetric(durationMs),
      }, {
        throttleMs: 120,
        throttleKey: `image:layer-draw-hit:${activePayload.elementId}`,
      });
      recordImageRotationLayerDraw("image:layer-draw-hit", {
        ...activePayload,
        durationMs: roundPerfMetric(durationMs),
      });

      return result;
    };
  }

  layer.__canvasImageDragPerfInstrumented = true;
}

function shouldApplyImageLayerCache(payload) {
  if (!payload) return false;
  return (
    Number(payload.sourceMp || 0) >= 0.5 ||
    Number(payload.displayMp || 0) >= 0.08 ||
    Number(payload.cropScaleX || 1) > 1.25 ||
    Number(payload.cropScaleY || 1) > 1.25
  );
}

function getImageLayerCacheConfig(payload) {
  const displayMp = Number(payload?.displayMp || 0);
  const sourceMp = Number(payload?.sourceMp || 0);
  const heavyImage = displayMp >= 0.2 || sourceMp >= 2;

  return {
    pixelRatio: heavyImage ? 1 : 1.5,
    hitCanvasPixelRatio: 1,
    imageSmoothingEnabled: true,
  };
}

export function activateImageLayerPerf(node, payload, options = {}) {
  const layer = node?.getLayer?.();
  const manageActivePayload = options?.manageActivePayload !== false;
  const { appliedKey, wasCachedKey, signatureKey } = resolveCacheStateKeys(options);
  if (!layer || !payload) {
    return {
      cacheApplied: false,
      cacheReused: false,
      payload,
    };
  }

  const cacheEventPrefix = options?.cacheEventPrefix || "image:drag-cache";
  ensureLayerDrawPerfInstrumentation(layer);
  let activePayload = payload;
  let cacheApplied = false;
  let cacheReused = false;
  let cacheInvalidated = false;
  const nextSignature = buildImageCacheSignature(payload);
  const shouldCache = shouldApplyImageLayerCache(payload);
  if (manageActivePayload) {
    layer.__canvasActiveImageDragPerf = activePayload;
  }

  if (
    node?.[appliedKey] === true &&
    typeof node?.clearCache === "function" &&
    (
      !shouldCache ||
      node?.[signatureKey] !== nextSignature
    )
  ) {
    try {
      node.clearCache();
      cacheInvalidated = true;
    } catch {}
    node[appliedKey] = false;
    node[signatureKey] = "";
  }

  if (
    typeof node?.cache === "function" &&
    typeof node?.clearCache === "function" &&
    shouldCache
  ) {
    const wasCached = typeof node.isCached === "function" ? node.isCached() : false;
    node[wasCachedKey] = wasCached;
    if (!wasCached) {
      const cacheConfig = getImageLayerCacheConfig(payload);
      const startedAt = getPerfNow();
      try {
        node.cache(cacheConfig);
        node[appliedKey] = true;
        node[signatureKey] = nextSignature;
        cacheApplied = true;
        activePayload = {
          ...activePayload,
          nodeCached: true,
          cachePixelRatio: cacheConfig.pixelRatio,
        };
        if (manageActivePayload) {
          layer.__canvasActiveImageDragPerf = activePayload;
        }
        trackCanvasDragPerf(`${cacheEventPrefix}-enabled`, {
          ...activePayload,
          cachePixelRatio: cacheConfig.pixelRatio,
          hitCanvasPixelRatio: cacheConfig.hitCanvasPixelRatio,
          durationMs: roundPerfMetric(getPerfNow() - startedAt),
        }, {
          throttleMs: 60,
          throttleKey: `${cacheEventPrefix}-enabled:${payload.elementId}`,
        });
      } catch (error) {
        node[appliedKey] = false;
        trackCanvasDragPerf(`${cacheEventPrefix}-failed`, {
          ...payload,
          durationMs: roundPerfMetric(getPerfNow() - startedAt),
          message: error?.message || String(error),
        }, {
          throttleMs: 60,
          throttleKey: `${cacheEventPrefix}-failed:${payload.elementId}`,
        });
      }
    } else {
      node[signatureKey] = nextSignature;
      activePayload = {
        ...activePayload,
        nodeCached: true,
      };
      if (manageActivePayload) {
        layer.__canvasActiveImageDragPerf = activePayload;
      }
      cacheReused = true;
      trackCanvasDragPerf(`${cacheEventPrefix}-reused`, activePayload, {
        throttleMs: 60,
        throttleKey: `${cacheEventPrefix}-reused:${payload.elementId}`,
      });
    }
  }

  if (cacheInvalidated || cacheApplied) {
    layer.batchDraw?.();
  }

  return {
    cacheApplied,
    cacheReused,
    payload: activePayload,
  };
}

export function deactivateImageLayerPerf(node, elementId, options = {}) {
  const layer = node?.getLayer?.();
  const cacheEventPrefix = options?.cacheEventPrefix || "image:drag-cache";
  const manageActivePayload = options?.manageActivePayload !== false;
  const { appliedKey, wasCachedKey, signatureKey } = resolveCacheStateKeys(options);
  let cacheCleared = false;

  if (
    node?.[appliedKey] === true &&
    typeof node.clearCache === "function"
  ) {
    const startedAt = getPerfNow();
    try {
      node.clearCache();
      cacheCleared = true;
      layer?.batchDraw?.();
      trackCanvasDragPerf(`${cacheEventPrefix}-cleared`, {
        elementId,
        durationMs: roundPerfMetric(getPerfNow() - startedAt),
      }, {
        throttleMs: 60,
        throttleKey: `${cacheEventPrefix}-cleared:${elementId}`,
      });
    } catch {}
  }

  if (node) {
    node[appliedKey] = false;
    node[wasCachedKey] = false;
    node[signatureKey] = "";
  }

  if (
    manageActivePayload &&
    layer &&
    (!elementId || layer.__canvasActiveImageDragPerf?.elementId === elementId)
  ) {
    layer.__canvasActiveImageDragPerf = null;
  }

  return {
    cacheCleared,
  };
}
