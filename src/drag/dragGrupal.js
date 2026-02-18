// C:\Reservaeldia\src\drag\dragGrupal.js
import { determinarNuevaSeccion } from "@/utils/layout";

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

  seguidores.forEach((elementId) => {
    const node = window._elementRefs?.[elementId];
    const posInicial = window._dragInicial[elementId];
    if (!node || !posInicial) return;
    node.position({
      x: posInicial.x + deltaX,
      y: posInicial.y + deltaY
    });
  });

  if (!window._groupPreviewRaf) {
    window._groupPreviewRaf = requestAnimationFrame(() => {
      window._groupPreviewRaf = null;
      stage.batchDraw();
    });
  }
}

export function startDragGrupalLider(e, obj) {
  dlog("ðŸš€ [DRAG GRUPAL] Iniciando drag grupal - Objeto:", {
    id: obj.id,
    tipo: obj.tipo,
    figura: obj.figura
  });

  const seleccion = window._elementosSeleccionados || [];
  dlog("ðŸ“‹ [DRAG GRUPAL] SelecciÃ³n actual:", seleccion);

  if (seleccion.length > 1 && seleccion.includes(obj.id)) {
    dlog("âœ… [DRAG GRUPAL] Condiciones cumplidas para drag grupal");
    const stage = e?.target?.getStage?.();
    const hoverCountBeforeStart = stage?.find?.(".ui-hover-indicator")?.length ?? 0;
    dlog("ðŸ§ª [HOVER][GROUP-CANDIDATE]", {
      leaderCandidate: obj.id,
      seleccionSize: seleccion.length,
      hoverCountBeforeStart,
      windowIsDragging: window._isDragging,
      grupoLider: window._grupoLider || null,
    });

    // ðŸ”¥ DETECTAR LÃNEAS EN LA SELECCIÃ“N
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

    dlog("ðŸ“Š [DRAG GRUPAL] AnÃ¡lisis detallado de elementos:", elementosDetallados);

    const hayLineas = seleccion.some(id => {
      const objeto = window._objetosActuales?.find(o => o.id === id);
      return objeto?.tipo === 'forma' && objeto?.figura === 'line';
    });

    dlog("ðŸ“ [DRAG GRUPAL] Â¿Hay lÃ­neas en la selecciÃ³n?", hayLineas);

    if (hayLineas) {
      dlog("ðŸ”§ [DRAG GRUPAL] Preparando lÃ­neas para drag grupal...");
      seleccion.forEach(id => {
        const objeto = window._objetosActuales?.find(o => o.id === id);
        if (objeto?.tipo === 'forma' && objeto?.figura === 'line') {
          const node = window._elementRefs?.[id];
          dlog(`ðŸ“ [DRAG GRUPAL] LÃ­nea ${id}:`, {
            nodeExists: !!node,
            draggableBefore: node ? node.draggable() : null
          });

          if (node && node.draggable) {
            node.draggable(true);
            dlog(`âœ… [DRAG GRUPAL] LÃ­nea ${id} habilitada para drag`);
          }
        }
      });
    }

    if (!window._grupoLider) {
      dlog("ðŸ‘‘ [DRAG GRUPAL] Estableciendo lÃ­der:", obj.id);
      if (window._groupPreviewRaf) {
        cancelAnimationFrame(window._groupPreviewRaf);
        window._groupPreviewRaf = null;
      }
      window._groupPreviewLastDelta = null;
      window._grupoLider = obj.id;
      window._grupoElementos = [...seleccion];
      window._grupoSeguidores = seleccion.filter((id) => id !== obj.id);
      window._dragStartPos = e.target.getStage().getPointerPosition();
      window._dragInicial = {};
      window._skipIndividualEnd = new Set(seleccion);
      window._skipUntil = 0;

      window._isDragging = true;
      try {
        document.body.style.cursor = "grabbing";
      } catch { }
      window.dispatchEvent(new Event("dragging-start"));
      const hoverCountAfterGlobalStart = stage?.find?.(".ui-hover-indicator")?.length ?? 0;
      dlog("ðŸ§ª [HOVER][GROUP-START-DISPATCH]", {
        leader: obj.id,
        hoverCountAfterGlobalStart,
        windowIsDragging: window._isDragging,
        grupoLider: window._grupoLider || null,
      });
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          const hoverCountRaf = stage?.find?.(".ui-hover-indicator")?.length ?? 0;
          dlog("ðŸ§ª [HOVER][GROUP-START-DISPATCH][RAF]", {
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

        dlog(`ðŸ”„ [DRAG GRUPAL] Procesando elemento ${id}:`, {
          esLider: id === obj.id,
          nodeExists: !!node,
          objetoType: objeto?.tipo
        });

        if (node && id !== obj.id) {
          const draggableBefore = node.draggable();
          try {
            node.draggable(false);
            dlog(`ðŸš« [DRAG GRUPAL] Deshabilitado drag para seguidor ${id} (era: ${draggableBefore})`);
          } catch (err) {
            console.error(`âŒ [DRAG GRUPAL] Error deshabilitando ${id}:`, err);
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

          dlog(`ðŸ“ [DRAG GRUPAL] PosiciÃ³n inicial guardada para ${id}:`, window._dragInicial[id]);
        }
      });

      dlog("ðŸŽ¯ [DRAG GRUPAL] Drag grupal iniciado correctamente");
    } else {
      dlog("âš ï¸ [DRAG GRUPAL] Ya hay un lÃ­der activo:", window._grupoLider);
    }
    return true;
  }
  // ðŸ” DEBUG CLAVE: si NO se inicia drag grupal, NO deberÃ­amos tocar estado global
  dlog("ðŸ§ª [DRAG GRUPAL] NO-START snapshot", {
    objId: obj.id,
    seleccion,
    grupoLider: window._grupoLider,
    isDragging: window._isDragging,
    skipIndividualEndSize: window._skipIndividualEnd ? window._skipIndividualEnd.size : null,
    skipUntil: window._skipUntil,
    dragStartPos: window._dragStartPos,
  });

  dlog("âŒ [DRAG GRUPAL] Condiciones no cumplidas para drag grupal");
  return false;
}



export function previewDragGrupal(e, obj, onChange) {
  // Solo el lÃ­der debe mover visualmente al resto durante el preview.
  if (!window._grupoLider || obj?.id !== window._grupoLider) return;

  const stage = e?.target?.getStage?.();
  if (!stage || !window._dragInicial) return;

  const deltaData = calcularDeltaGrupal(stage);
  if (!deltaData) return;

  const { deltaX, deltaY } = deltaData;
  applyPreviewDragGrupal(stage, obj.id, deltaX, deltaY);
}

export function endDragGrupal(e, obj, onChange, hasDragged, setIsDragging) {
  dlog("ðŸ [DRAG GRUPAL] endDragGrupal llamado:", {
    objId: obj.id,
    esLider: obj.id === window._grupoLider,
    grupoLider: window._grupoLider,
    isDragging: window._isDragging,
    skipIndividualEndSize: window._skipIndividualEnd ? window._skipIndividualEnd.size : null,
    skipUntil: window._skipUntil,
  });


  // Solo procesa el lÃ­der
  if (window._grupoLider && obj.id === window._grupoLider) {
    dlog("ðŸ‘‘ [DRAG GRUPAL] Procesando como lÃ­der...");

    const stage = e.target.getStage();
    const deltaData = window._dragInicial ? calcularDeltaGrupal(stage) : null;

    if (deltaData && window._dragInicial) {
      if (window._groupPreviewRaf) {
        cancelAnimationFrame(window._groupPreviewRaf);
        window._groupPreviewRaf = null;
      }
      window._groupPreviewLastDelta = null;

      const { deltaX, deltaY, source } = deltaData;
      dlog("ðŸ“ [DRAG GRUPAL] Delta calculado:", { deltaX, deltaY, source });

      const elementosGrupo = getGrupoElementos();

      // ðŸ”¥ APLICAR EL DELTA A CADA ELEMENTO (incluyendo al lÃ­der)
      elementosGrupo.forEach((elementId) => {
        const objeto = window._objetosActuales?.find(o => o.id === elementId);
        if (!objeto) return;

        const posInicial = window._dragInicial[elementId];
        if (!posInicial) return;

        const nuevaX = posInicial.x + deltaX;
        const nuevaY = posInicial.y + deltaY;

        dlog(`ðŸ‘¥ [DRAG GRUPAL] Elemento ${elementId}:`, {
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

        try {
          node?.setAttr && node.setAttr("_muteNextEnd", true);
        } catch { }

        const cambios = {
          x: nuevaX,
          y: nuevaY,
          ...(nuevaSeccion ? { seccionId: nuevaSeccion } : {}),
          finalizoDrag: true,
          causa: "drag-grupal"
        };

        onChange(elementId, cambios);
      });
    } else {
      dwarn("âš ï¸ [DRAG GRUPAL] No se pudo calcular delta final del grupo");
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
          dlog("ðŸ§© [DRAG GRUPAL] restore draggable", { id, before, after });
        } catch (err) {
          dwarn("âŒ [DRAG GRUPAL] restore draggable error", { id, err });
        }
      }, 24);
    });


    window._grupoLider = null;
    window._grupoElementos = null;
    window._grupoSeguidores = null;
    window._dragStartPos = null;
    window._dragInicial = null;

    // ðŸ”¥ RESETEAR CURSOR AL FINALIZAR DRAG GRUPAL
    try {
      document.body.style.cursor = "default";
    } catch { }

    setTimeout(() => {
      window._skipIndividualEnd = null;
      window._skipUntil = 0;
    }, 450);

    setTimeout(() => { hasDragged.current = false; }, 40);
    return true;
  }

  // Seguidores
  if (window._grupoLider) {
    const seleccion = window._elementosSeleccionados || [];
    if (seleccion.includes(obj.id)) {
      setTimeout(() => { hasDragged.current = false; }, 40);
      return true;
    }
  }

  return false;
}




