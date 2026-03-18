import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Layer, Line } from "react-konva";
import { trackCanvasDragPerf } from "@/components/editor/canvasEditor/canvasDragPerf";

function getGuideLayerPerfNow() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

const CanvasGuideLayer = forwardRef(function CanvasGuideLayer(_props, ref) {
  const [guideLines, setGuideLines] = useState([]);
  const layerRef = useRef(null);
  const guideLinesRef = useRef([]);

  useEffect(() => {
    guideLinesRef.current = guideLines;
  }, [guideLines]);

  const setGuideLinesState = useCallback((nextLines = []) => {
    setGuideLines(Array.isArray(nextLines) ? nextLines : []);
  }, []);

  const clearGuideLines = useCallback(() => {
    setGuideLines([]);
  }, []);

  const getGuideLinesCount = useCallback(() => guideLines.length, [guideLines.length]);

  useImperativeHandle(ref, () => ({
    setGuideLines: setGuideLinesState,
    clearGuideLines,
    getGuideLinesCount,
  }), [clearGuideLines, getGuideLinesCount, setGuideLinesState]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || layer.__canvasGuidePerfInstrumented) return;

    const originalDrawScene =
      typeof layer.drawScene === "function" ? layer.drawScene : null;
    const originalDrawHit =
      typeof layer.drawHit === "function" ? layer.drawHit : null;

    if (originalDrawScene) {
      layer.drawScene = function patchedGuideDrawScene(...args) {
        const activeSession =
          typeof window !== "undefined" ? window.__CANVAS_DRAG_PERF_ACTIVE_SESSION : null;
        if (!activeSession) {
          return originalDrawScene.apply(this, args);
        }

        const startedAt = getGuideLayerPerfNow();
        const result = originalDrawScene.apply(this, args);
        const durationMs = getGuideLayerPerfNow() - startedAt;
        const canvasHandle =
          typeof this.getCanvas === "function" ? this.getCanvas() : null;
        const canvas = canvasHandle?._canvas || null;

        trackCanvasDragPerf("guides:layer-draw-scene", {
          elementId: activeSession.elementId || null,
          tipo: activeSession.tipo || null,
          lines: guideLinesRef.current.length,
          durationMs: Number(durationMs.toFixed(2)),
          layerChildren: typeof this.getChildren === "function" ? this.getChildren().length : null,
          canvasWidth: Number(canvas?.width || 0) || null,
          canvasHeight: Number(canvas?.height || 0) || null,
        }, {
          throttleMs: 90,
          throttleKey: `guides:layer-draw-scene:${activeSession.elementId || "unknown"}`,
        });

        return result;
      };
    }

    if (originalDrawHit) {
      layer.drawHit = function patchedGuideDrawHit(...args) {
        const activeSession =
          typeof window !== "undefined" ? window.__CANVAS_DRAG_PERF_ACTIVE_SESSION : null;
        if (!activeSession) {
          return originalDrawHit.apply(this, args);
        }

        const startedAt = getGuideLayerPerfNow();
        const result = originalDrawHit.apply(this, args);
        const durationMs = getGuideLayerPerfNow() - startedAt;

        trackCanvasDragPerf("guides:layer-draw-hit", {
          elementId: activeSession.elementId || null,
          tipo: activeSession.tipo || null,
          lines: guideLinesRef.current.length,
          durationMs: Number(durationMs.toFixed(2)),
        }, {
          throttleMs: 120,
          throttleKey: `guides:layer-draw-hit:${activeSession.elementId || "unknown"}`,
        });

        return result;
      };
    }

    layer.__canvasGuidePerfInstrumented = true;

    return () => {
      if (!layer) return;
      if (originalDrawScene) {
        layer.drawScene = originalDrawScene;
      }
      if (originalDrawHit) {
        layer.drawHit = originalDrawHit;
      }
      delete layer.__canvasGuidePerfInstrumented;
    };
  }, []);

  return (
    <Layer ref={layerRef} listening={false}>
      {guideLines.map((linea, index) => {
        const esLineaSeccion = linea?.priority === "seccion";
        return (
          <Line
            key={`${linea?.type || "guide"}-${index}`}
            name="ui"
            points={Array.isArray(linea?.points) ? linea.points : []}
            stroke={esLineaSeccion ? "#773dbe" : "#9333ea"}
            strokeWidth={esLineaSeccion ? 2 : 1}
            dash={linea?.style === "dashed" ? [8, 6] : undefined}
            opacity={esLineaSeccion ? 0.9 : 0.7}
            listening={false}
            perfectDrawEnabled={false}
            shadowColor={esLineaSeccion ? "rgba(119, 61, 190, 0.3)" : undefined}
            shadowBlur={esLineaSeccion ? 4 : 0}
            shadowEnabled={esLineaSeccion}
          />
        );
      })}
    </Layer>
  );
});

export default CanvasGuideLayer;
