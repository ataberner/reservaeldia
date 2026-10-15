import React, { useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Stage, Layer, Group, Rect, Line, Text, Transformer } from "react-konva";
import GaleriaKonva from "../../components/editor/GaleriaKonva.jsx";
import CanvasGuideLayer from "../../components/editor/canvasEditor/CanvasGuideLayer.jsx";
import useGuiasCentrado from "../../hooks/useGuiasCentrado.js";
import { startDragIndividual, previewDragIndividual, endDragIndividual } from "../dragIndividual.js";
import { startDragGrupalLider, previewDragGrupal, endDragGrupal } from "../dragGrupal.js";
import { markTextOriginOffsetCanonicalPose, resolveCanonicalNodePose } from "../../components/editor/canvasEditor/konvaCanonicalPose.js";
import { finalizeDragPosition } from "../../components/editor/canvasEditor/dragPositionFinalization.js";
import { resolveNodeSelectionRect } from "../../components/editor/textSystem/render/konva/selectionBoundsGeometry.js";
import { resolveSelectionBounds } from "../../components/editor/textSystem/render/konva/SelectionBoundsIndicator.jsx";
import { resolveAuthoritativeTextGeometry, resolveAuthoritativeTextRect } from "../../components/editor/canvasEditor/konvaAuthoritativeBounds.js";
import { getInlineKonvaProjectedRectViewport } from "../../components/editor/overlays/inlineGeometry.js";
import { calcularOffsetY, convertirAbsARel, determinarNuevaSeccion } from "../../utils/layout.ts";
import { buildPersistableRenderState } from "../../components/editor/persistence/borradorSyncRenderState.js";

// Real React/Konva, drag handlers, gallery renderer, guides and canonicalization.
// The scene replaces only the editor shell/overlay coordinator and remote save.
// It does not certify the full editor's settling/handoff or Firestore transport.
function DragPhase1Probe() {
  const [scene, setScene] = useState({ objects: [], sections: [], selected: [], guides: false, zoom: 1 });
  const [viewOverrides, setViewOverrides] = useState({});
  const refs = useRef({});
  const stageRef = useRef(null);
  const stageVersion = useRef(0);
  const transformerRef = useRef(null);
  const guideLayerRef = useRef(null);
  const lines = useRef([]);
  const commits = useRef([]);
  const lifecycle = useRef({});
  const dragStart = useRef(null);
  const hasDragged = useRef(false);
  const guideSessions = useRef({});
  const guideSessionCounter = useRef(0);
  const guides = useGuiasCentrado({
    anchoCanvas: 800, visualScale: scene.zoom, elementMagnetRadius: 10,
    sectionMagnetRadius: 6, seccionesOrdenadas: scene.sections,
    onGuideLinesChange(value) { lines.current = value; guideLayerRef.current?.setGuideLines(value); },
  });
  const isPantalla = (id) => scene.sections.find((section) => section.id === id)?.altoModo === "pantalla";
  const stageY = (object) => {
    const index = scene.sections.findIndex((section) => section.id === object.seccionId);
    return calcularOffsetY(scene.sections, Math.max(0, index)) +
      (isPantalla(object.seccionId) && Number.isFinite(object.yNorm) ? object.yNorm * 500 : object.y || 0);
  };
  const change = (id, patch) => {
    const original = window._objetosActuales.find((object) => object.id === id);
    const accepted = patch.finalizoDrag ? finalizeDragPosition({
      objOriginal: original, dragPatch: patch, seccionesOrdenadas: scene.sections,
      determinarNuevaSeccion, convertirAbsARel, esSeccionPantallaById: isPantalla,
      ALTURA_PANTALLA_EDITOR: 500, node: refs.current[id], resolveObjectStageY: stageY,
    }) : patch;
    commits.current.push({ id, patch: accepted });
    flushSync(() => setScene((previous) => ({
      ...previous, objects: previous.objects.map((object) => object.id === id ? { ...object, ...accepted } : object),
    })));
  };
  const prepare = (id, _event, meta = {}) => {
    if (!scene.guides || meta.pipeline === "group") return;
    guideSessions.current[id] = `probe-${id}-${++guideSessionCounter.current}`;
    guides.prepararGuias({ elementId: id, sessionId: guideSessions.current[id] }, scene.objects, refs);
  };
  const move = (pos, id, meta = {}) => {
    if (!scene.guides || meta.pipeline === "group") return;
    guides.mostrarGuias({ elementId: id, sessionId: guideSessions.current[id], pos, modifierState: meta.modifierState }, scene.objects, refs);
  };
  useLayoutEffect(() => {
    window._objetosActuales = scene.objects;
    window._elementRefs = refs.current;
    window._elementosSeleccionados = scene.selected;
    window._seccionesOrdenadas = scene.sections;
    transformerRef.current?.nodes(scene.selected.map((id) => refs.current[id]).filter(Boolean));
  });
  useLayoutEffect(() => {
    window.dragPhase1Probe = {
      reset(next) {
        guides.limpiarGuias();
        window._recentGroupDragGuard = null;
        window._skipIndividualEnd = null;
        window._groupDragSession = null;
        window._isDragging = false;
        commits.current = [];
        lifecycle.current = {};
        stageVersion.current += 1;
        flushSync(() => {
          setViewOverrides({});
          setScene({ objects: [], sections: [{ id: "s1", altura: 1000, orden: 0 }], selected: [], guides: false, zoom: 1, ...next });
        });
      },
      select(ids) { flushSync(() => setScene((previous) => ({ ...previous, selected: ids }))); },
      prepareGuides(id) { prepare(id); },
      evaluateGuides(id, position) {
        if (position) refs.current[id]?.position(position);
        move(refs.current[id]?.position(), id);
      },
      mutateNode(id, attrs) { refs.current[id]?.setAttrs(attrs); stageRef.current.batchDraw(); },
      replaceNode(id, attrs = {}) {
        flushSync(() => setViewOverrides((previous) => ({ ...previous, [id]: { ...attrs, fixtureVersion: (previous[id]?.fixtureVersion || 0) + 1 } })));
      },
      changeGalleryLayout(id, layout) {
        flushSync(() => setViewOverrides((previous) => ({ ...previous, [id]: { ...previous[id], currentLayout: layout } })));
      },
      async loadLocalFont(id) {
        const font = new FontFace("Phase2LateFont", 'local("Georgia")');
        await font.load();
        document.fonts.add(font);
        const node = refs.current[id];
        // The small scene is the text owner here: emulate its font-load
        // remeasurement without changing the canonical objects array.
        const text = node.text();
        node.text(`${text} `);
        node.text(text);
        window.dispatchEvent(new Event("fonts-loaded"));
        node.getLayer().batchDraw();
        return font.status;
      },
      clearGuides() { guides.limpiarGuias(); },
      snapshot() {
        const stage = stageRef.current;
        const container = stage.content.getBoundingClientRect();
        return {
          objects: scene.objects, commits: commits.current, lines: lines.current,
          persisted: buildPersistableRenderState({ objetos: scene.objects, secciones: scene.sections, validarPuntosLinea: (points) => points, ALTURA_PANTALLA_EDITOR: 500 }).objetos,
          nodes: Object.fromEntries(scene.objects.map((object) => {
            const node = refs.current[object.id];
            const frame = node?.findOne?.(".gallery-transform-frame");
            const rect = frame ? frame.getClientRect({ skipStroke: true, relativeTo: stage }) : node?.getClientRect({ skipStroke: true, relativeTo: stage });
            const screenRect = (frame || node)?.getClientRect({ skipStroke: true });
            let inline = null;
            let domMatrixRect = null;
            if (object.tipo === "texto") {
              inline = getInlineKonvaProjectedRectViewport(node, stage, scene.zoom, { objectMeta: object });
              const geometry = resolveAuthoritativeTextGeometry(node, object, { relativeTo: null });
              if (geometry) {
                // Real DOM box projected by the shared authority matrix. This
                // verifies projection, not the full inline backend's caret or IME.
                const element = document.createElement("div");
                Object.assign(element.style, {
                  position: "fixed", left: `${container.left}px`, top: `${container.top}px`,
                  width: `${geometry.localRect.width}px`, height: `${geometry.localRect.height}px`,
                  transformOrigin: "0 0", transform: `matrix(${geometry.transform.map((value) => value * scene.zoom).join(",")})`,
                  pointerEvents: "none",
                });
                document.body.appendChild(element);
                const domRect = element.getBoundingClientRect();
                domMatrixRect = { x: domRect.x, y: domRect.y, width: domRect.width, height: domRect.height };
                element.remove();
              }
            }
            return [object.id, {
              position: node?.position(), canonical: resolveCanonicalNodePose(node, object),
              authority: object.tipo === "texto" ? resolveAuthoritativeTextRect(node, object, { relativeTo: stage }) : null,
              authorityPoints: object.tipo === "texto" ? resolveAuthoritativeTextGeometry(node, object)?.points : null,
              overlayBounds: object.tipo === "texto" ? resolveSelectionBounds({ selectedElements: [object.id], elementRefs: refs, objetos: scene.objects, isMobile: false, requireLiveNodes: true }) : null,
              nodeId: node?._id,
              measuredSize: { width: node?.width(), height: node?.height() },
              inlineProjection: inline?.konvaProjectedRectViewport,
              inlineTransform: inline?.konvaTextViewportTransform,
              inlineSource: inline?.konvaProjectionGeometrySource,
              canUseProjectedBoxLayout: inline?.canUseProjectedBoxLayout,
              domMatrixRect,
              viewportRect: screenRect ? { x: container.left + screenRect.x * scene.zoom, y: container.top + screenRect.y * scene.zoom, width: screenRect.width * scene.zoom, height: screenRect.height * scene.zoom } : null,
              rect, selection: resolveNodeSelectionRect(object, node, { relativeTo: stage }),
              screen: screenRect ? { x: container.left + (screenRect.x + (frame ? 20 : screenRect.width / 2)) * scene.zoom, y: container.top + (screenRect.y + (frame ? 20 : screenRect.height / 2)) * scene.zoom } : null,
            }];
          })),
          transformer: { nodes: transformerRef.current.nodes().map((node) => node.id()), rect: transformerRef.current.getClientRect() },
        };
      },
    };
  });
  const generic = (object) => {
    const view = { ...object, ...(viewOverrides[object.id] || {}) };
    const offsetX = object.tipo === "texto" ? view.offsetX ?? 40 : 0;
    const offsetY = object.tipo === "texto" ? view.offsetY ?? 0 : 0;
    const props = {
      ...view, key: `${object.id}-${view.fixtureVersion || 0}`, x: view.x + offsetX, y: stageY(view) + offsetY, offsetX, offsetY,
      draggable: true,
      ref(node) { refs.current[object.id] = node; if (node && object.tipo === "texto") markTextOriginOffsetCanonicalPose(node); },
      onDragStart(event) {
        const result = startDragGrupalLider(event, object);
        lifecycle.current[object.id] = result.mode === "started" ? "group" : "individual";
        if (result.handled) return;
        startDragIndividual(event, dragStart);
        prepare(object.id, event);
      },
      onDragMove(event) {
        if (lifecycle.current[object.id] === "group") previewDragGrupal(event, object, change);
        else previewDragIndividual(event, object, move);
      },
      onDragEnd(event) {
        const result = endDragGrupal(event, object, change, hasDragged);
        if (!result.handled) endDragIndividual(object, event.target, change, () => guides.limpiarGuias(), hasDragged);
      },
    };
    let element;
    if (object.figura === "line") element = React.createElement(Line, { ...props, stroke: "#773dbe", strokeWidth: 4, hitStrokeWidth: 14 });
    else if (object.tipo === "texto") element = React.createElement(Text, { ...props, text: view.text ?? "Texto sintético", fontSize: view.fontSize ?? 24, fill: "#151515" });
    else element = React.createElement(Rect, { ...props, fill: "#bf9bdd" });
    return view.testParent ? React.createElement(Group, { key: object.id, ...view.testParent }, element) : element;
  };
  return React.createElement("div", { style: { width: 800, transform: `scale(${scene.zoom})`, transformOrigin: "top left" } },
    React.createElement(Stage, { key: stageVersion.current, ref: stageRef, width: 800, height: 1200, ...(scene.stageTransform || {}) },
      React.createElement(Layer, null,
        ...scene.objects.map((object) => object.tipo === "galeria" ? React.createElement(GaleriaKonva, {
          key: object.id, obj: viewOverrides[object.id] ? { ...object, ...viewOverrides[object.id] } : object, registerRef: (id, node) => { refs.current[id] = node; },
          isSelected: scene.selected.includes(object.id), onSelect() {}, onChange: change,
          seccionesOrdenadas: scene.sections, ALTURA_PANTALLA_EDITOR: 500,
          onDragStartPersonalizado: prepare, onDragMovePersonalizado: move,
          onDragEndPersonalizado: () => guides.limpiarGuias(),
        }) : generic(object)),
        React.createElement(Transformer, { ref: transformerRef, enabledAnchors: [], rotateEnabled: false, listening: false })
      ),
      React.createElement(CanvasGuideLayer, { ref: guideLayerRef, visualScale: scene.zoom })
    )
  );
}

window.__DEBUG_SELECTED_DRAG = false;
window.__DBG_CANVAS_BOX_FLOW = false;
createRoot(document.querySelector("#app")).render(React.createElement(DragPhase1Probe));
