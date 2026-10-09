import React, { useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Stage, Layer, Group, Rect, Image as KonvaImage } from "react-konva";
import SelectionTransformer from "../../../components/editor/textSystem/render/konva/SelectionTransformer.jsx";
import { resolveGoogleMapDimensions } from "../googleMapGeometry.js";
import useGoogleMapImage from "../../../hooks/useGoogleMapImage.js";
import useCanvasInteractionCoordinator from "../../../components/editor/canvasEditor/useCanvasInteractionCoordinator.js";

const INITIAL_MAP = Object.freeze({
  id: "synthetic-map", tipo: "mapa-google", x: 100, y: 100,
  width: 361, height: 220, scaleX: 1, scaleY: 1, rotation: 0,
});
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="722" height="440"><rect width="722" height="440" fill="#edf0e7"/><path d="M0 180H722M240 0V440" stroke="white" stroke-width="20"/><circle cx="361" cy="220" r="15" fill="#bd3f3f"/></svg>';
const SOURCE = `data:image/svg+xml,${encodeURIComponent(SVG)}`;

// Exercise the actual selection component and React/Konva event/reconciliation
// lifecycle. The small scene replaces the editor shell, remote data and save
// transport, retaining the map's hitbox, clipping, stroke and shadow geometry.
function GoogleMapTransformerProbe() {
  const [object, setObject] = useState({ ...INITIAL_MAP });
  const [cssZoom, setCssZoom] = useState(1);
  const [isMobile, setIsMobile] = useState(false);
  const elementRefs = useRef({});
  const stageRef = useRef(null);
  const events = useRef([]);
  const releaseCapture = useRef(null);
  const sampleRef = useRef(null);
  const coordinator = useCanvasInteractionCoordinator();
  const dimensions = resolveGoogleMapDimensions(object);
  const image = useGoogleMapImage(SOURCE, "synthetic-location");

  sampleRef.current = (kind) => {
    const capture = releaseCapture.current;
    if (!capture) return;
    const node = elementRefs.current[object.id];
    const transformer = stageRef.current?.findOne("Transformer");
    const border = transformer?.findOne(".back");
    const mapImage = node?.findOne(".map-image");
    // Read actual painted children/attributes, without forceUpdate or a draw.
    // The Transformer getter can recompute its cache, so use its .back shape.
    capture.samples.push({
      kind, time: performance.now(), target: capture.target,
      object: { width: object.width, height: object.height },
      node: node ? { x: node.x(), y: node.y(), width: node.width(), height: node.height(), scaleX: node.scaleX(), scaleY: node.scaleY(), rotation: node.rotation() } : null,
      image: mapImage ? { width: mapImage.width() * node.scaleX(), height: mapImage.height() * node.scaleY() } : null,
      border: border ? { width: border.width(), height: border.height(), visible: border.isVisible(), transform: border.getAbsoluteTransform().getMatrix().slice() } : null,
      coordinator: { active: coordinator.isInteractionActive, settling: coordinator.isSettling },
    });
  };

  useLayoutEffect(() => {
    const layer = stageRef.current?.getLayers()[0];
    const onDraw = () => sampleRef.current?.("paint");
    layer?.on("draw.releaseProbe", onDraw);
    return () => layer?.off("draw.releaseProbe", onDraw);
  }, []);

  useLayoutEffect(() => {
    globalThis.googleMapTransformerProbe = {
      reset(patch = {}) {
        globalThis._resizeData = { isResizing: false };
        flushSync(() => {
          setObject({ ...INITIAL_MAP, ...patch });
          setCssZoom(1);
          setIsMobile(false);
        });
        events.current = [];
      },
      setCssZoom(value) { flushSync(() => setCssZoom(value)); },
      setMobile(value) { flushSync(() => setIsMobile(value)); },
      startReleaseCapture() {
        const capture = { samples: [], target: null, done: null };
        releaseCapture.current = capture;
        sampleRef.current("before-release");
        capture.done = new Promise((resolve) => {
          let frames = 0;
          let totalFrames = 0;
          const frame = () => {
            if (releaseCapture.current !== capture) return resolve();
            sampleRef.current("frame");
            totalFrames += 1;
            if (capture.target) frames += 1;
            if (frames < 10 && totalFrames < 120) requestAnimationFrame(frame);
            else resolve();
          };
          requestAnimationFrame(frame);
        });
      },
      async finishReleaseCapture() {
        const capture = releaseCapture.current;
        await capture?.done;
        const samples = capture?.samples || [];
        releaseCapture.current = null;
        return samples;
      },
      snapshot() {
        const stage = stageRef.current;
        const node = elementRefs.current[object.id];
        const transformer = stage?.findOne("Transformer");
        const contentRect = stage?.content?.getBoundingClientRect();
        const screenScaleX = contentRect ? contentRect.width / stage.width() : 1;
        const screenScaleY = contentRect ? contentRect.height / stage.height() : 1;
        const anchors = {};
        for (const name of transformer?.enabledAnchors() || []) {
          const anchor = transformer.findOne(`.${name}`);
          if (!anchor) continue;
          const position = anchor.getAbsolutePosition();
          anchors[name] = {
            x: contentRect.left + position.x * screenScaleX,
            y: contentRect.top + position.y * screenScaleY,
            visible: anchor.visible(),
            width: anchor.width(), height: anchor.height(),
            hitStrokeWidth: anchor.hitStrokeWidth(),
          };
        }
        return {
          object,
          cssZoom,
          isMobile,
          runtimeResizeActive: Boolean(globalThis._resizeData?.isResizing),
          hasImage: Boolean(image),
          anchors,
          screenScaleX,
          screenScaleY,
          node: node ? {
            width: node.width(), height: node.height(),
            scaleX: node.scaleX(), scaleY: node.scaleY(),
            visibleWidth: node.width() * node.scaleX(),
            visibleHeight: node.height() * node.scaleY(),
            rect: node.getClientRect({ skipShadow: true, skipStroke: true }),
          } : null,
          transformer: transformer ? {
            width: transformer.width(), height: transformer.height(),
            nodes: transformer.nodes().map((item) => item.id()),
            enabledAnchors: transformer.enabledAnchors(),
            activeAnchor: transformer.getActiveAnchor(),
            isTransforming: transformer.isTransforming(),
          } : null,
          events: events.current.slice(),
        };
      },
    };
  });

  const onTransform = (payload) => {
    events.current.push({ kind: payload.isFinal ? "final" : "preview", payload });
    // Match the map owner: transient dimensions remain on the live Konva node;
    // only the final payload updates React's canonical object snapshot.
    if (!payload.isFinal) return;
    if (releaseCapture.current) releaseCapture.current.target = { ...payload };
    sampleRef.current("final-before-flush");
    // CanvasStageContentComposer releases this runtime guard before its final
    // flushSync. Leaving it set in a fixture suppresses mobile hit testing.
    globalThis._resizeData = { isResizing: false };
    const { isPreview, isFinal, ...patch } = payload;
    flushSync(() => setObject((previous) => ({ ...previous, ...patch })));
    sampleRef.current("final-after-flush");
    queueMicrotask(() => sampleRef.current?.("final-microtask"));
  };
  const clip = (context) => {
    context.beginPath();
    context.roundRect(0, 0, dimensions.width, dimensions.height, 10);
    context.closePath();
  };

  return React.createElement("div", { style: { zoom: cssZoom, width: 1100 } },
    React.createElement(Stage, { ref: stageRef, width: 1100, height: 820 },
      React.createElement(Layer, null,
        React.createElement(Group, {
          ...object, ...dimensions,
          ref: (node) => { elementRefs.current[object.id] = node; },
        },
        React.createElement(Rect, {
          ...dimensions, fill: "rgba(0,0,0,0.001)", stroke: "transparent", listening: true,
        }),
        React.createElement(Group, { clipFunc: clip, listening: false },
          React.createElement(KonvaImage, { ...dimensions, image, name: "map-image", listening: false })),
        React.createElement(Rect, {
          ...dimensions, fill: "transparent", stroke: "#773dbe", strokeWidth: 2,
          cornerRadius: 10, shadowColor: "rgba(15,23,42,0.12)", shadowBlur: 8,
          shadowOffset: { x: 0, y: 3 }, listening: false,
        })),
        React.createElement(SelectionTransformer, {
          selectedElements: [object.id], elementRefs, objetos: [object],
          onTransform, isDragging: false, isMobile,
          canvasInteractionEpoch: coordinator.interactionEpoch,
          canvasInteractionActive: coordinator.isInteractionActive,
          canvasInteractionSettling: coordinator.isSettling,
          scheduleCanvasUiAfterSettle: coordinator.scheduleCanvasUiAfterSettle,
          cancelCanvasUiAfterSettle: coordinator.cancelCanvasUiAfterSettle,
          onTransformInteractionStart: () => {
            events.current.push({ kind: "start" });
            coordinator.beginCanvasInteraction("transform");
          },
          onTransformInteractionEnd: () => {
            events.current.push({ kind: "end" });
            coordinator.endCanvasInteraction("transform");
          },
        })
      )
    )
  );
}

createRoot(document.querySelector("#app")).render(React.createElement(GoogleMapTransformerProbe));
