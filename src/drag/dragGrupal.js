// C:\Reservaeldia\src\drag\dragGrupal.js
import { determinarNuevaSeccion } from "@/utils/layout";
import {
  getCanvasPointerDebugInfo,
  getCanvasSelectionDebugInfo,
  getKonvaNodeDebugInfo,
  logSelectedDragDebug,
  resetCanvasInteractionLogSample,
  sampleCanvasInteractionLog,
} from "@/components/editor/canvasEditor/selectedDragDebug";
import { resolveCanonicalNodePose } from "@/components/editor/canvasEditor/konvaCanonicalPose";

const isDragGrupalDebugEnabled = () =>
  typeof window !== "undefined" && window.__DBG_DRAG_GRUPAL === true;

const dlog = (...args) => {
  if (!isDragGrupalDebugEnabled()) return;
  console.log(...args);
};

const dwarn = (...args) => {
  if (!isDragGrupalDebugEnabled()) return;
  console.warn(...args);
};

function getGrupoElementos() {
  if (Array.isArray(window._grupoElementos) && window._grupoElementos.length > 0) {
    return window._grupoElementos;
  }
  return window._elementosSeleccionados || [];
}

function buildGroupPreviewSampleKey(leaderId) {
  return `drag-group-preview:${leaderId || "unknown"}`;
}

function buildSelectionSnapshot() {
  return {
    ...getCanvasSelectionDebugInfo(),
    dragStartPos: window._dragStartPos || null,
  };
}

function calcularDeltaGrupal(stage) {
  const leaderId = window._grupoLider;
  const dragInicial = window._dragInicial || null;
  const posInicialLider = leaderId && dragInicial ? dragInicial[leaderId] : null;
  const leaderNode = leaderId ? window._elementRefs?.[leaderId] : null;

  if (
    leaderNode &&
    posInicialLider &&
    typeof leaderNode.x === "function" &&
    typeof leaderNode.y === "function"
  ) {
    return {
      deltaX: leaderNode.x() - posInicialLider.x,
      deltaY: leaderNode.y() - posInicialLider.y,
      source: "leader-node"
    };
  }

  const currentPos = stage?.getPointerPosition?.();
  const startPos = window._dragStartPos;
  if (currentPos && startPos) {
    return {
      deltaX: currentPos.x - startPos.x,
      deltaY: currentPos.y - startPos.y,
      source: "pointer"
    };
  }

  return null;
}

function applyPreviewDragGrupal(stage, leaderId, deltaX, deltaY) {
  if (!stage || !window._dragInicial) return;

  const last = window._groupPreviewLastDelta;
  if (
    last &&
    Math.abs(last.deltaX - deltaX) < 0.01 &&
    Math.abs(last.deltaY - deltaY) < 0.01
  ) {
    return;
  }
  window._groupPreviewLastDelta = { deltaX, deltaY };

  const seguidores = Array.isArray(window._grupoSeguidores)
    ? window._grupoSeguidores
    : getGrupoElementos().filter((id) => id !== leaderId);

  const syncAttachedTextNode = (elementId, x, y) => {
    const textNode = window._elementRefs?.[`${elementId}-text`];
    if (!textNode || typeof textNode.position !== "function") return;
    textNode.position({ x, y });
  };

  seguidores.forEach((elementId) => {
    const node = window._elementRefs?.[elementId];
    const posInicial = window._dragInicial[elementId];
    if (!node || !posInicial) return;
    const nextX = posInicial.x + deltaX;
    const nextY = posInicial.y + deltaY;
    node.position({
      x: nextX,
      y: nextY
    });
    syncAttachedTextNode(elementId, nextX, nextY);
  });

  if (!window._groupPreviewRaf) {
    window._groupPreviewRaf = requestAnimationFrame(() => {
      window._groupPreviewRaf = null;
      stage.batchDraw();
    });
  }
}

export function startDragGrupalLider(e, obj) {
  logSelectedDragDebug("drag:group:attempt", {
    elementId: obj?.id || null,
    tipo: obj?.tipo || null,
    figura: obj?.figura || null,
    pointer: getCanvasPointerDebugInfo(e),
    node: getKonvaNodeDebugInfo(e?.currentTarget || e?.target || null),
    selection: buildSelectionSnapshot(),
  });
  dlog("🚀 [DRAG GRUPAL] Iniciando drag grupal - Objeto:", {
    id: obj.id,
    tipo: obj.tipo,
    figura: obj.figura
  });

  const seleccion = window._elementosSeleccionados || [];
  dlog("📋 [DRAG GRUPAL] Selección actual:", seleccion);

  if (seleccion.length > 1 && seleccion.includes(obj.id)) {
    dlog("✅ [DRAG GRUPAL] Condiciones cumplidas para drag grupal");
    const stage = e?.target?.getStage?.();
    const hoverCountBeforeStart = stage?.find?.(".ui-hover-indicator")?.length ?? 0;
    dlog("🧪 [HOVER][GROUP-CANDIDATE]", {
      leaderCandidate: obj.id,
      seleccionSize: seleccion.length,
      hoverCountBeforeStart,
      windowIsDragging: window._isDragging,
      grupoLider: window._grupoLider || null,
    });

    // 🔥 DETECTAR LÍNEAS EN LA SELECCIÓN
    const elementosDetallados = seleccion.map(id => {
      const objeto = window._objetosActuales?.find(o => o.id === id);
      const node = window._elementRefs?.[id];
      return {
        id,
        objeto: objeto ? {
          tipo: objeto.tipo,
          figura: objeto.figura
        } : null,
        nodeExists: !!node,
        nodeDraggable: node ? node.draggable() : null
      };
    });

    dlog("📊 [DRAG GRUPAL] Análisis detallado de elementos:", elementosDetallados);

    const hayLineas = seleccion.some(id => {
      const objeto = window._objetosActuales?.find(o => o.id === id);
      return objeto?.tipo === 'forma' && objeto?.figura === 'line';
    });

    dlog("📏 [DRAG GRUPAL] ¿Hay líneas en la selección?", hayLineas);

    if (hayLineas) {
      dlog("🔧 [DRAG GRUPAL] Preparando líneas para drag grupal...");
      seleccion.forEach(id => {
        const objeto = window._objetosActuales?.find(o => o.id === id);
        if (objeto?.tipo === 'forma' && objeto?.figura === 'line') {
          const node = window._elementRefs?.[id];
          dlog(`📏 [DRAG GRUPAL] Línea ${id}:`, {
            nodeExists: !!node,
            draggableBefore: node ? node.draggable() : null
          });

          if (node && node.draggable) {
            node.draggable(true);
            dlog(`✅ [DRAG GRUPAL] Línea ${id} habilitada para drag`);
          }
        }
      });
    }

    if (!window._grupoLider) {
      dlog("👑 [DRAG GRUPAL] Estableciendo líder:", obj.id);
      if (window._groupPreviewRaf) {
        cancelAnimationFrame(window._groupPreviewRaf);
        window._groupPreviewRaf = null;
      }
      window._groupPreviewLastDelta = null;
      window._grupoLider = obj.id;
      window._grupoElementos = [...seleccion];
      window._grupoSeguidores = seleccion.filter((id) => id !== obj.id);
      window._dragStartPos = e.target.getStage().getPointerPosition();
      resetCanvasInteractionLogSample(buildGroupPreviewSampleKey(obj.id));
      window._dragInicial = {};
      window._skipIndividualEnd = new Set(seleccion);
      window._skipUntil = 0;

      window._isDragging = true;
      try {
        document.body.style.cursor = "grabbing";
      } catch { }
      window.dispatchEvent(new Event("dragging-start"));
      const hoverCountAfterGlobalStart = stage?.find?.(".ui-hover-indicator")?.length ?? 0;
      dlog("🧪 [HOVER][GROUP-START-DISPATCH]", {
        leader: obj.id,
        hoverCountAfterGlobalStart,
        windowIsDragging: window._isDragging,
        grupoLider: window._grupoLider || null,
      });
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          const hoverCountRaf = stage?.find?.(".ui-hover-indicator")?.length ?? 0;
          dlog("🧪 [HOVER][GROUP-START-DISPATCH][RAF]", {
            leader: obj.id,
            hoverCountRaf,
            windowIsDragging: window._isDragging,
            grupoLider: window._grupoLider || null,
          });
        });
      }

      // Bloqueo de drag individual en seguidores + snapshot inicial
      seleccion.forEach((id) => {
        const objeto = window._objetosActuales?.find(o => o.id === id);
        const node = window._elementRefs?.[id];

        dlog(`🔄 [DRAG GRUPAL] Procesando elemento ${id}:`, {
          esLider: id === obj.id,
          nodeExists: !!node,
          objetoType: objeto?.tipo
        });

        if (node && id !== obj.id) {
          const draggableBefore = node.draggable();
          try {
            node.draggable(false);
            dlog(`🚫 [DRAG GRUPAL] Deshabilitado drag para seguidor ${id} (era: ${draggableBefore})`);
          } catch (err) {
            console.error(`❌ [DRAG GRUPAL] Error deshabilitando ${id}:`, err);
          }
        }

        if (objeto) {
          const yAbsIni = (() => {
            if (node && node.y) return node.y();
            const idx = (window._seccionesOrdenadas || []).findIndex(s => s.id === objeto.seccionId);
            const offsetY = idx >= 0 ? (window._seccionesOrdenadas || [])
              .slice(0, idx)
              .reduce((sum, s) => sum + (s.altura || 0), 0) : 0;
            return (objeto.y || 0) + offsetY;
          })();

          window._dragInicial[id] = {
            x: node?.x ? node.x() : (objeto.x || 0),
            y: yAbsIni
          };

          dlog(`📍 [DRAG GRUPAL] Posición inicial guardada para ${id}:`, window._dragInicial[id]);
        }
      });

      dlog("🎯 [DRAG GRUPAL] Drag grupal iniciado correctamente");
    } else {
      dlog("⚠️ [DRAG GRUPAL] Ya hay un líder activo:", window._grupoLider);
    }
    logSelectedDragDebug("drag:group:start", {
      elementId: obj?.id || null,
      tipo: obj?.tipo || null,
      figura: obj?.figura || null,
      pointer: getCanvasPointerDebugInfo(e),
      node: getKonvaNodeDebugInfo(e?.currentTarget || e?.target || null),
      selection: buildSelectionSnapshot(),
    });
    return true;
  }
  // 🔍 DEBUG CLAVE: si NO se inicia drag grupal, NO deberíamos tocar estado global
  dlog("🧪 [DRAG GRUPAL] NO-START snapshot", {
    objId: obj.id,
    seleccion,
    grupoLider: window._grupoLider,
    isDragging: window._isDragging,
    skipIndividualEndSize: window._skipIndividualEnd ? window._skipIndividualEnd.size : null,
    skipUntil: window._skipUntil,
    dragStartPos: window._dragStartPos,
  });

  dlog("❌ [DRAG GRUPAL] Condiciones no cumplidas para drag grupal");
  logSelectedDragDebug("drag:group:skip", {
    elementId: obj?.id || null,
    tipo: obj?.tipo || null,
    figura: obj?.figura || null,
    pointer: getCanvasPointerDebugInfo(e),
    node: getKonvaNodeDebugInfo(e?.currentTarget || e?.target || null),
    selection: buildSelectionSnapshot(),
    reason: "selection-not-eligible",
  });
  return false;
}



export function previewDragGrupal(e, obj, onChange) {
  // Solo el líder debe mover visualmente al resto durante el preview.
  if (!window._grupoLider || obj?.id !== window._grupoLider) return;

  const stage = e?.target?.getStage?.();
  if (!stage || !window._dragInicial) return;

  const deltaData = calcularDeltaGrupal(stage);
  if (!deltaData) return;

  const { deltaX, deltaY, source } = deltaData;
  const sample = sampleCanvasInteractionLog(buildGroupPreviewSampleKey(obj?.id), {
    firstCount: 3,
    throttleMs: 120,
  });
  if (sample.shouldLog) {
    logSelectedDragDebug("drag:group:preview", {
      elementId: obj?.id || null,
      previewCount: sample.sampleCount,
      deltaX,
      deltaY,
      deltaSource: source || null,
      pointer: getCanvasPointerDebugInfo(e),
      node: getKonvaNodeDebugInfo(e?.currentTarget || e?.target || null),
      selection: buildSelectionSnapshot(),
    });
  }
  applyPreviewDragGrupal(stage, obj.id, deltaX, deltaY);
}

export function endDragGrupal(e, obj, onChange, hasDragged, setIsDragging) {
  dlog("🏁 [DRAG GRUPAL] endDragGrupal llamado:", {
    objId: obj.id,
    esLider: obj.id === window._grupoLider,
    grupoLider: window._grupoLider,
    isDragging: window._isDragging,
    skipIndividualEndSize: window._skipIndividualEnd ? window._skipIndividualEnd.size : null,
    skipUntil: window._skipUntil,
  });


  // Solo procesa el líder
  if (window._grupoLider && obj.id === window._grupoLider) {
    dlog("👑 [DRAG GRUPAL] Procesando como líder...");

    const stage = e.target.getStage();
    const deltaData = window._dragInicial ? calcularDeltaGrupal(stage) : null;
    const appliedChanges = [];

    if (deltaData && window._dragInicial) {
      if (window._groupPreviewRaf) {
        cancelAnimationFrame(window._groupPreviewRaf);
        window._groupPreviewRaf = null;
      }
      window._groupPreviewLastDelta = null;

      const { deltaX, deltaY, source } = deltaData;
      dlog("📏 [DRAG GRUPAL] Delta calculado:", { deltaX, deltaY, source });

      const elementosGrupo = getGrupoElementos();

      // 🔥 APLICAR EL DELTA A CADA ELEMENTO (incluyendo al líder)
      elementosGrupo.forEach((elementId) => {
        const objeto = window._objetosActuales?.find(o => o.id === elementId);
        if (!objeto) return;

        const posInicial = window._dragInicial[elementId];
        if (!posInicial) return;

        const nuevaX = posInicial.x + deltaX;
        const nuevaY = posInicial.y + deltaY;

        dlog(`👥 [DRAG GRUPAL] Elemento ${elementId}:`, {
          posInicial,
          delta: { deltaX, deltaY },
          nuevaPos: { x: nuevaX, y: nuevaY }
        });

        const node = window._elementRefs?.[elementId];
        const { nuevaSeccion } = determinarNuevaSeccion(
          nuevaY,
          objeto.seccionId,
          window._seccionesOrdenadas || []
        );
        const canonicalPose = resolveCanonicalNodePose(node, objeto, {
          x: nuevaX,
          y: nuevaY,
          rotation:
            typeof node?.rotation === "function"
              ? node.rotation()
              : objeto.rotation || 0,
        });
        const committedX = Number.isFinite(canonicalPose?.x)
          ? canonicalPose.x
          : nuevaX;
        const committedY = Number.isFinite(canonicalPose?.y)
          ? canonicalPose.y
          : nuevaY;

        try {
          node?.setAttr && node.setAttr("_muteNextEnd", true);
        } catch { }

        const cambios = {
          x: committedX,
          y: committedY,
          ...(nuevaSeccion ? { seccionId: nuevaSeccion } : {}),
          finalizoDrag: true,
          causa: "drag-grupal"
        };

        appliedChanges.push({
          elementId,
          initialPosition: posInicial,
          nextPosition: {
            x: committedX,
            y: committedY,
          },
          nextSectionId: nuevaSeccion || null,
          node: getKonvaNodeDebugInfo(node),
        });
        onChange(elementId, cambios);
      });
      logSelectedDragDebug("drag:group:end", {
        elementId: obj?.id || null,
        deltaX,
        deltaY,
        deltaSource: source || null,
        appliedChanges,
        pointer: getCanvasPointerDebugInfo(e),
        node: getKonvaNodeDebugInfo(e?.currentTarget || e?.target || null),
        selection: buildSelectionSnapshot(),
      });
    } else {
      dwarn("⚠️ [DRAG GRUPAL] No se pudo calcular delta final del grupo");
    }

    if (!deltaData || !window._dragInicial) {
      logSelectedDragDebug("drag:group:end-no-delta", {
        elementId: obj?.id || null,
        pointer: getCanvasPointerDebugInfo(e),
        node: getKonvaNodeDebugInfo(e?.currentTarget || e?.target || null),
        selection: buildSelectionSnapshot(),
      });
    }

    // Cleanup
    window._skipUntil = performance.now() + 400;

    const seleccion = getGrupoElementos();
    seleccion.forEach((id) => {
      const elNode = window._elementRefs?.[id];
      if (!elNode) return;

      setTimeout(() => {
        try {
          const before = elNode.draggable();
          elNode.draggable(true);
          const after = elNode.draggable();
          dlog("🧩 [DRAG GRUPAL] restore draggable", { id, before, after });
        } catch (err) {
          dwarn("❌ [DRAG GRUPAL] restore draggable error", { id, err });
        }
      }, 24);
    });


    window._grupoLider = null;
    window._grupoElementos = null;
    window._grupoSeguidores = null;
    window._dragStartPos = null;
    window._dragInicial = null;

    // 🔥 RESETEAR CURSOR AL FINALIZAR DRAG GRUPAL
    try {
      document.body.style.cursor = "default";
    } catch { }

    setTimeout(() => {
      window._skipIndividualEnd = null;
      window._skipUntil = 0;
    }, 450);

    setTimeout(() => { hasDragged.current = false; }, 40);
    resetCanvasInteractionLogSample(buildGroupPreviewSampleKey(obj?.id));
    return true;
  }

  // Seguidores
  if (window._grupoLider) {
    const seleccion = window._elementosSeleccionados || [];
    if (seleccion.includes(obj.id)) {
      logSelectedDragDebug("drag:group:follower-end-skip", {
        elementId: obj?.id || null,
        node: getKonvaNodeDebugInfo(e?.currentTarget || e?.target || null),
        selection: buildSelectionSnapshot(),
      });
      setTimeout(() => { hasDragged.current = false; }, 40);
      return true;
    }
  }

  return false;
}
