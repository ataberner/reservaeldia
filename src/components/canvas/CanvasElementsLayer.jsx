// src/components/canvas/CanvasElementsLayer.jsx
import React, { forwardRef, useEffect, useRef } from "react";
import { Layer } from "react-konva";
import { trackCanvasDragPerf } from "@/components/editor/canvasEditor/canvasDragPerf";
import { recordImageRotationLayerDraw } from "@/components/editor/canvasEditor/imageRotationDebug";

function getCanvasElementsLayerPerfNow() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

const CanvasElementsLayer = forwardRef(function CanvasElementsLayer(
  {
    children,
    perfLabel = "elements-layer",
    listening = true,
  },
  ref
) {
  const layerRef = useRef(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || layer.__canvasStageLayerPerfInstrumented) return undefined;

    const originalDrawScene =
      typeof layer.drawScene === "function" ? layer.drawScene : null;
    const originalDrawHit =
      typeof layer.drawHit === "function" ? layer.drawHit : null;

    if (originalDrawScene) {
      layer.drawScene = function patchedCanvasElementsLayerDrawScene(...args) {
        const activeSession =
          typeof window !== "undefined" ? window.__CANVAS_DRAG_PERF_ACTIVE_SESSION : null;
        const hasImageRotationSession =
          typeof window !== "undefined" && Boolean(window.__IMAGE_ROTATION_DEBUG_ACTIVE_SESSION);
        if (!activeSession && !hasImageRotationSession) {
          return originalDrawScene.apply(this, args);
        }

        const startedAt = getCanvasElementsLayerPerfNow();
        const result = originalDrawScene.apply(this, args);
        const durationMs = getCanvasElementsLayerPerfNow() - startedAt;
        const canvasHandle =
          typeof this.getCanvas === "function" ? this.getCanvas() : null;
        const canvas = canvasHandle?._canvas || null;

        const scenePayload = {
          elementId: activeSession?.elementId || null,
          tipo: activeSession?.tipo || null,
          layerLabel: this.__canvasStagePerfLabel || "elements-layer",
          durationMs: Number(durationMs.toFixed(2)),
          layerChildren:
            typeof this.getChildren === "function" ? this.getChildren().length : null,
          canvasWidth: Number(canvas?.width || 0) || null,
          canvasHeight: Number(canvas?.height || 0) || null,
        };

        if (activeSession) {
          trackCanvasDragPerf(
            "stage:layer-draw-scene",
            scenePayload,
            {
              throttleMs: 90,
              throttleKey: `stage:layer-draw-scene:${activeSession.elementId || "unknown"}:${this.__canvasStagePerfLabel || "elements-layer"}`,
            }
          );
        }

        if (hasImageRotationSession) {
          recordImageRotationLayerDraw("stage:layer-draw-scene", scenePayload);
        }

        return result;
      };
    }

    if (originalDrawHit) {
      layer.drawHit = function patchedCanvasElementsLayerDrawHit(...args) {
        const activeSession =
          typeof window !== "undefined" ? window.__CANVAS_DRAG_PERF_ACTIVE_SESSION : null;
        const hasImageRotationSession =
          typeof window !== "undefined" && Boolean(window.__IMAGE_ROTATION_DEBUG_ACTIVE_SESSION);
        if (!activeSession && !hasImageRotationSession) {
          return originalDrawHit.apply(this, args);
        }

        const startedAt = getCanvasElementsLayerPerfNow();
        const result = originalDrawHit.apply(this, args);
        const durationMs = getCanvasElementsLayerPerfNow() - startedAt;

        const hitPayload = {
          elementId: activeSession?.elementId || null,
          tipo: activeSession?.tipo || null,
          layerLabel: this.__canvasStagePerfLabel || "elements-layer",
          durationMs: Number(durationMs.toFixed(2)),
          layerChildren:
            typeof this.getChildren === "function" ? this.getChildren().length : null,
        };

        if (activeSession) {
          trackCanvasDragPerf(
            "stage:layer-draw-hit",
            hitPayload,
            {
              throttleMs: 120,
              throttleKey: `stage:layer-draw-hit:${activeSession.elementId || "unknown"}:${this.__canvasStagePerfLabel || "elements-layer"}`,
            }
          );
        }

        if (hasImageRotationSession) {
          recordImageRotationLayerDraw("stage:layer-draw-hit", hitPayload);
        }

        return result;
      };
    }

    layer.__canvasStageLayerPerfInstrumented = true;

    return () => {
      if (!layer) return;
      if (originalDrawScene) {
        layer.drawScene = originalDrawScene;
      }
      if (originalDrawHit) {
        layer.drawHit = originalDrawHit;
      }
      delete layer.__canvasStageLayerPerfInstrumented;
    };
  }, []);

  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.__canvasStagePerfLabel = perfLabel || "elements-layer";
  }, [perfLabel]);

  return (
    <Layer
      listening={listening}
      ref={(node) => {
        layerRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref && typeof ref === "object") {
          ref.current = node;
        }
      }}
    >
      {children}
    </Layer>
  );
});

export default CanvasElementsLayer;
