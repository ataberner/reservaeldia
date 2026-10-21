import React, { Profiler, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import Konva from "konva";
import { Stage, Layer, Group, Rect, Text, Image, Transformer } from "react-konva";
import GaleriaKonva from "../../components/editor/GaleriaKonva.jsx";
import CanvasGuideLayer from "../../components/editor/canvasEditor/CanvasGuideLayer.jsx";
import SelectionBoundsIndicator, { resolveSelectionBounds } from "../../components/editor/textSystem/render/konva/SelectionBoundsIndicator.jsx";
import useGuiasCentrado from "../../hooks/useGuiasCentrado.js";
import { startDragIndividual, previewDragIndividual, endDragIndividual } from "../dragIndividual.js";
import { startDragGrupalLider, previewDragGrupal, endDragGrupal } from "../dragGrupal.js";
import { markTextOriginOffsetCanonicalPose, resolveCanonicalNodePose } from "../../components/editor/canvasEditor/konvaCanonicalPose.js";
import { finalizeDragPosition } from "../../components/editor/canvasEditor/dragPositionFinalization.js";
import { startCanvasDragPerfSession, endCanvasDragPerfSession } from "../../components/editor/canvasEditor/canvasDragPerf.js";
import { calcularOffsetY, convertirAbsARel, determinarNuevaSeccion } from "../../utils/layout.ts";
import { buildPersistableRenderState } from "../../components/editor/persistence/borradorSyncRenderState.js";

// A component integration laboratory, not the editor shell. Real owners under
// measurement: drag handlers, guides hook/layer, controlled selection overlay,
// Gallery, canonicalization and persistible serialization. Generic shape/text/
// image/group nodes replace ElementoCanvasRenderer and composer coordination.
const imageFixture = document.createElement("canvas");
imageFixture.width = 120;
imageFixture.height = 80;
const imageContext = imageFixture.getContext("2d");
imageContext.fillStyle = "#94b9ca";
imageContext.fillRect(0, 0, 120, 80);
imageContext.fillStyle = "#527a89";
imageContext.fillRect(15, 15, 90, 50);
const measure = (name, callback) => {
  const finish = window.__DRAG_PERF_PROBE?.span(name);
  try { return callback(); } finally { finish?.(); }
};

function DragPerformanceLab() {
  const [scene, setScene] = useState({ objects: [], sections: [], selected: [], zoom: 1 });
  const refs = useRef({}), stage = useRef(null), generation = useRef(0);
  const transformer = useRef(null), overlay = useRef(null), guideLayer = useRef(null);
  const commits = useRef([]), lines = useRef([]), sessions = useRef({}), sessionCounter = useRef(0);
  const lifecycle = useRef({}), dragStart = useRef(null), hasDragged = useRef(false);
  const guides = useGuiasCentrado({
    anchoCanvas: 800, visualScale: scene.zoom, elementMagnetRadius: 10,
    sectionMagnetRadius: 6, seccionesOrdenadas: scene.sections,
    onGuideLinesChange(next) { lines.current = next; guideLayer.current?.setGuideLines(next); },
  });
  const isPantalla = (id) => scene.sections.find((section) => section.id === id)?.altoModo === "pantalla";
  const stageY = (object) => calcularOffsetY(scene.sections, Math.max(0, scene.sections.findIndex((section) => section.id === object.seccionId))) +
    (isPantalla(object.seccionId) && Number.isFinite(object.yNorm) ? object.yNorm * 500 : object.y || 0);
  const syncOverlay = () => measure("lab:selection-resolve-and-apply", () => {
    const bounds = resolveSelectionBounds({ selectedElements: scene.selected, elementRefs: refs, objetos: scene.objects, requireLiveNodes: true });
    return overlay.current?.applyControlledBounds(bounds, { source: "perf-lab-native-drag", phase: "drag" });
  });
  const change = (id, patch) => measure("lab:canonical-commit", () => {
    const changes = patch.isBatchUpdateFinal ? patch.changes : [{ id, patch }];
    const acceptedById = new Map(changes.map(({ id, patch }) => {
      const original = window._objetosActuales.find((object) => object.id === id);
      const accepted = patch.finalizoDrag ? finalizeDragPosition({
        objOriginal: original, dragPatch: patch, seccionesOrdenadas: scene.sections,
        determinarNuevaSeccion, convertirAbsARel, esSeccionPantallaById: isPantalla,
        ALTURA_PANTALLA_EDITOR: 500, node: refs.current[id], resolveObjectStageY: stageY,
        onPositionReconciled: syncOverlay,
      }) : patch;
      commits.current.push({ id, patch: accepted });
      return [id, accepted];
    }));
    flushSync(() => setScene((previous) => ({ ...previous, objects: previous.objects.map((object) => acceptedById.has(object.id) ? { ...object, ...acceptedById.get(object.id) } : object) })));
  });
  const prepare = (id, _event, meta = {}) => {
    if (meta.pipeline === "group") return;
    sessions.current[id] = `lab-${++sessionCounter.current}`;
    guides.prepararGuias({ elementId: id, sessionId: sessions.current[id] }, scene.objects, refs);
  };
  const move = (position, id, meta = {}) => measure("lab:move-callback", () => {
    if (meta.pipeline === "group") { syncOverlay(); return; }
    const outcome = guides.mostrarGuias({ elementId: id, sessionId: sessions.current[id], pos: position, modifierState: meta.modifierState }, scene.objects, refs);
    if (outcome?.snapCommitted && outcome?.snapMovedNode) syncOverlay();
    syncOverlay();
  });
  const start = (object) => startCanvasDragPerfSession({ elementId: object.id, tipo: object.tipo });
  const end = () => { guides.limpiarGuias(); syncOverlay(); endCanvasDragPerfSession(); };

  useLayoutEffect(() => {
    window._objetosActuales = scene.objects;
    window._elementRefs = refs.current;
    window._elementosSeleccionados = scene.selected;
    window._seccionesOrdenadas = scene.sections;
    transformer.current?.nodes(scene.selected.map((id) => refs.current[id]).filter(Boolean));
    syncOverlay();
    window.dragPerformanceLab = {
      reset(next) {
        guides.limpiarGuias();
        window._recentGroupDragGuard = null;
        window._skipIndividualEnd = null;
        window._groupDragSession = null;
        window._isDragging = false;
        commits.current = [];
        lifecycle.current = {};
        generation.current += 1;
        flushSync(() => setScene(next));
      },
      point(id = "active") {
        const node = refs.current[id], frame = node.findOne?.(".gallery-transform-frame") || node;
        const box = frame.getClientRect({ skipStroke: true, skipTransform: true }), container = stage.current.container().getBoundingClientRect();
        const isGallery = frame !== node;
        const localPoint = { x: box.x + (isGallery ? 20 : box.width / 2), y: box.y + (isGallery ? 20 : box.height / 2) };
        const point = frame.getAbsoluteTransform().point(localPoint);
        return { x: container.left + point.x * scene.zoom, y: container.top + point.y * scene.zoom };
      },
      inputSample() { return { pointer: stage.current.getPointerPosition(), node: refs.current.active?.position(), lines: lines.current.length }; },
      snapshot() {
        return {
          objects: scene.objects, commits: commits.current, lines: lines.current,
          persisted: buildPersistableRenderState({ objetos: scene.objects, secciones: scene.sections, validarPuntosLinea: (points) => points, ALTURA_PANTALLA_EDITOR: 500 }).objetos,
          activePose: resolveCanonicalNodePose(refs.current.active, scene.objects.find((object) => object.id === "active")),
          overlayDigest: overlay.current?.getAppliedBoundsDigest(),
          group: window._groupDragSession ? { engine: window._groupDragSession.engine, active: window._groupDragSession.active } : null,
        };
      },
    };
  });
  const generic = (object) => {
    const offset = object.tipo === "texto" ? object.width / 2 : 0;
    const props = {
      id: object.id, x: object.x + offset, y: stageY(object), width: object.width, height: object.height,
      offsetX: offset, rotation: object.rotation || 0, draggable: true,
      ref(node) { refs.current[object.id] = node; if (node && object.tipo === "texto") markTextOriginOffsetCanonicalPose(node); },
      onDragStart(event) { measure("lab:handler-start", () => {
        start(object);
        const result = startDragGrupalLider(event, object);
        lifecycle.current[object.id] = result.mode === "started" ? "group" : "individual";
        if (result.handled) return;
        startDragIndividual(event, dragStart);
        prepare(object.id, event);
      }); },
      onDragMove(event) { measure("lab:handler-move", () => {
        if (lifecycle.current[object.id] === "group") { previewDragGrupal(event, object, change); syncOverlay(); }
        else previewDragIndividual(event, object, move);
      }); },
      onDragEnd(event) { measure("lab:handler-end", () => {
        const result = endDragGrupal(event, object, change, hasDragged);
        if (!result.handled) endDragIndividual(object, event.target, change, end, hasDragged);
        else end();
      }); },
    };
    if (object.tipo === "texto") return React.createElement(Text, { ...props, key: object.id, text: object.texto, fontFamily: "Arial", fontSize: object.fontSize || 24, fill: "#202020" });
    if (object.tipo === "imagen") return React.createElement(Image, { ...props, key: object.id, image: imageFixture });
    if (object.tipo === "grupo") return React.createElement(Group, { ...props, key: object.id },
      React.createElement(Rect, { width: object.width, height: object.height, fill: "rgba(0,0,0,0.001)" }),
      ...object.children.map((child) => React.createElement(Rect, { ...child, key: child.id, fill: child.color, listening: false })));
    return React.createElement(Rect, { ...props, key: object.id, fill: "#a58bc9" });
  };
  return React.createElement(Profiler, { id: "integration-lab", onRender(...args) { window.__DRAG_PERF_PROBE?.reactCommit(args); } },
    React.createElement("div", { style: { width: 800, transform: `scale(${scene.zoom})`, transformOrigin: "top left" } },
      React.createElement(Stage, { key: generation.current, ref: stage, width: 800, height: 1000 },
        React.createElement(Profiler, { id: "konva-tree", onRender(...args) { window.__DRAG_PERF_PROBE?.reactCommit(args); } },
        React.createElement(Layer, { name: "objects" },
          ...scene.objects.map((object) => object.tipo === "galeria" ? React.createElement(GaleriaKonva, {
            key: object.id, obj: object, registerRef: (id, node) => { refs.current[id] = node; },
            isSelected: scene.selected.includes(object.id), onSelect() {}, onChange: change,
            seccionesOrdenadas: scene.sections, ALTURA_PANTALLA_EDITOR: 500,
            onDragStartPersonalizado: (id, event, meta) => { start(object); prepare(id, event, meta); },
            onDragMovePersonalizado: move, onDragEndPersonalizado: end,
          }) : generic(object)),
          React.createElement(Transformer, { ref: transformer, enabledAnchors: [], rotateEnabled: false, listening: false })
        ),
        React.createElement(CanvasGuideLayer, { ref: guideLayer, visualScale: scene.zoom }),
        React.createElement(Layer, { name: "overlay", listening: false },
          React.createElement(SelectionBoundsIndicator, { ref: overlay, selectedElements: scene.selected, elementRefs: refs, objetos: scene.objects,
            boundsControlMode: "controlled", debugSource: "drag-overlay", boxFlowPhase: "drag", lifecycleKey: `lab-${generation.current}` }))
      ))));
}

window.__DEBUG_SELECTED_DRAG = false;
window.__DBG_CANVAS_BOX_FLOW = false;
window.__DRAG_PERF_KONVA = Konva;
createRoot(document.querySelector("#app")).render(React.createElement(DragPerformanceLab));
