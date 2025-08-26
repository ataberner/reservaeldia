// C:\Reservaeldia\src\drag\dragGrupal.js
import { determinarNuevaSeccion } from "@/utils/layout";

export function startDragGrupalLider(e, obj) {
  console.log("🚀 [DRAG GRUPAL] Iniciando drag grupal - Objeto:", {
    id: obj.id,
    tipo: obj.tipo,
    figura: obj.figura
  });

  const seleccion = window._elementosSeleccionados || [];
  console.log("📋 [DRAG GRUPAL] Selección actual:", seleccion);

  if (seleccion.length > 1 && seleccion.includes(obj.id)) {
    console.log("✅ [DRAG GRUPAL] Condiciones cumplidas para drag grupal");

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

    console.log("📊 [DRAG GRUPAL] Análisis detallado de elementos:", elementosDetallados);

    const hayLineas = seleccion.some(id => {
      const objeto = window._objetosActuales?.find(o => o.id === id);
      return objeto?.tipo === 'forma' && objeto?.figura === 'line';
    });

    console.log("📏 [DRAG GRUPAL] ¿Hay líneas en la selección?", hayLineas);

    if (hayLineas) {
      console.log("🔧 [DRAG GRUPAL] Preparando líneas para drag grupal...");
      seleccion.forEach(id => {
        const objeto = window._objetosActuales?.find(o => o.id === id);
        if (objeto?.tipo === 'forma' && objeto?.figura === 'line') {
          const node = window._elementRefs?.[id];
          console.log(`📏 [DRAG GRUPAL] Línea ${id}:`, {
            nodeExists: !!node,
            draggableBefore: node ? node.draggable() : null
          });

          if (node && node.draggable) {
            node.draggable(true);
            console.log(`✅ [DRAG GRUPAL] Línea ${id} habilitada para drag`);
          }
        }
      });
    }

    if (!window._grupoLider) {
      console.log("👑 [DRAG GRUPAL] Estableciendo líder:", obj.id);
      window._grupoLider = obj.id;
      window._dragStartPos = e.target.getStage().getPointerPosition();
      window._dragInicial = {};
      window._skipIndividualEnd = new Set(seleccion);
      window._skipUntil = 0;

      window._isDragging = true;
      try {
        document.body.style.cursor = "grabbing";
      } catch { }
      window.dispatchEvent(new Event("dragging-start"));

      // Bloqueo de drag individual en seguidores + snapshot inicial
      seleccion.forEach((id) => {
        const objeto = window._objetosActuales?.find(o => o.id === id);
        const node = window._elementRefs?.[id];

        console.log(`🔄 [DRAG GRUPAL] Procesando elemento ${id}:`, {
          esLider: id === obj.id,
          nodeExists: !!node,
          objetoType: objeto?.tipo
        });

        if (node && id !== obj.id) {
          const draggableBefore = node.draggable();
          try {
            node.draggable(false);
            console.log(`🚫 [DRAG GRUPAL] Deshabilitado drag para seguidor ${id} (era: ${draggableBefore})`);
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

          console.log(`📍 [DRAG GRUPAL] Posición inicial guardada para ${id}:`, window._dragInicial[id]);
        }
      });

      console.log("🎯 [DRAG GRUPAL] Drag grupal iniciado correctamente");
    } else {
      console.log("⚠️ [DRAG GRUPAL] Ya hay un líder activo:", window._grupoLider);
    }
    return true;
  }

  console.log("❌ [DRAG GRUPAL] Condiciones no cumplidas para drag grupal");
  return false;
}



export function previewDragGrupal(e, obj, onChange) {
  // tu lógica actual de preview (si la hay) queda igual
}

export function endDragGrupal(e, obj, onChange, hasDragged, setIsDragging) {
  console.log("🏁 [DRAG GRUPAL] endDragGrupal llamado:", {
    objId: obj.id,
    esLider: obj.id === window._grupoLider,
    grupoLider: window._grupoLider
  });

  // Solo procesa el líder
  if (window._grupoLider && obj.id === window._grupoLider) {
    console.log("👑 [DRAG GRUPAL] Procesando como líder...");

    const stage = e.target.getStage();
    const currentPos = stage.getPointerPosition();
    const startPos = window._dragStartPos;

    console.log("📍 [DRAG GRUPAL] Posiciones:", {
      inicial: startPos,
      actual: currentPos
    });

    if (currentPos && startPos && window._dragInicial) {
      // 🔥 CALCULAR EL DELTA DEL MOVIMIENTO
      const deltaX = currentPos.x - startPos.x;
      const deltaY = currentPos.y - startPos.y;

      console.log("📏 [DRAG GRUPAL] Delta calculado:", { deltaX, deltaY });

      const seleccion = window._elementosSeleccionados || [];

      // 🔥 APLICAR EL DELTA A CADA ELEMENTO
      seleccion.forEach((elementId) => {
        // 🔥 SKIP: No procesar al líder aquí - ya está en su posición correcta
        if (elementId === window._grupoLider) {
          console.log(`👑 [DRAG GRUPAL] Saltando líder ${elementId} - ya procesado por Konva`);

          // Solo mutear para evitar procesamiento individual
          const node = window._elementRefs?.[elementId];
          try {
            node?.setAttr && node.setAttr("_muteNextEnd", true);
          } catch { }

          return;
        }

        // Procesar seguidores normalmente
        const objeto = window._objetosActuales?.find(o => o.id === elementId);
        if (!objeto) return;

        const posInicial = window._dragInicial[elementId];
        if (!posInicial) return;

        const nuevaX = posInicial.x + deltaX;
        const nuevaY = posInicial.y + deltaY;

        console.log(`👥 [DRAG GRUPAL] Seguidor ${elementId}:`, {
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
    }

    // Cleanup
    window._skipUntil = performance.now() + 400;

    const seleccion = window._elementosSeleccionados || [];
    seleccion.forEach((id) => {
      const elNode = window._elementRefs?.[id];
      if (elNode) {
        setTimeout(() => {
          try { elNode.draggable(true); } catch { }
        }, 24);
      }
    });

    window._grupoLider = null;
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


