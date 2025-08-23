// C:\Reservaeldia\src\drag\dragGrupal.js
import { determinarNuevaSeccion } from "@/utils/layout";

export function startDragGrupalLider(e, obj) {
  const seleccion = window._elementosSeleccionados || [];
  if (seleccion.length > 1 && seleccion.includes(obj.id)) {
    if (!window._grupoLider) {
      window._grupoLider = obj.id;
      window._dragStartPos = e.target.getStage().getPointerPosition();
      window._dragInicial = {};
      window._skipIndividualEnd = new Set(seleccion);
      window._skipUntil = 0;

      console.log("🎯 INICIANDO DRAG GRUPAL");
      console.log("Líder del grupo:", obj.id);
      console.log("Sección del líder:", obj.seccionId);

      // Bloqueo de drag individual en seguidores + snapshot inicial
      seleccion.forEach((id) => {
        const objeto = window._objetosActuales?.find(o => o.id === id);
        const node = window._elementRefs?.[id];

        if (node && id !== obj.id) {
          try { node.draggable(false); } catch {}
        }

        if (objeto) {
          // guardamos posición absoluta de inicio (para preview si la usás)
          const yAbsIni = (() => {
            if (node && node.y) return node.y();
            // fallback: y relativa + offset de su sección
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
        }
      });
    }
    return true;
  }
  return false;
}

export function previewDragGrupal(e, obj, onChange) {
  // tu lógica actual de preview (si la hay) queda igual
}

export function endDragGrupal(e, obj, onChange, hasDragged, setIsDragging) {
  // Solo procesa el líder
  if (window._grupoLider && obj.id === window._grupoLider) {
    console.log("🏁 FIN DRAG GRUPAL - LÍDER:", obj.id);

    const stage = e.target.getStage();
    const currentPos = stage.getPointerPosition();

    if (currentPos && window._dragInicial) {
      const seleccion = window._elementosSeleccionados || [];

      // Leemos posición REAL de cada nodo al soltar, y persistimos eso.
      seleccion.forEach((elementId) => {
        const objeto = window._objetosActuales?.find(o => o.id === elementId);
        if (!objeto) return;

        const node = window._elementRefs?.[elementId];
        // x/y ABSOLUTAS en el Stage
        const xAbs = node?.x ? node.x() : (window._dragInicial[elementId]?.x ?? objeto.x ?? 0);
        const yAbs = node?.y ? node.y() : (window._dragInicial[elementId]?.y ?? objeto.y ?? 0);

        // Determinamos nueva sección por yAbs
        const { nuevaSeccion } = determinarNuevaSeccion(
          yAbs,
          objeto.seccionId,
          window._seccionesOrdenadas || []
        );

        // 🔇 Muteamos el próximo end individual de este nodo
        try { node?.setAttr && node.setAttr("_muteNextEnd", true); } catch {}

        // 📌 Persistimos SIEMPRE con coord. absolutas (CanvasEditor convierte a relativas)
        onChange(elementId, {
          x: xAbs,
          y: yAbs,
          ...(nuevaSeccion ? { seccionId: nuevaSeccion } : {}),
          finalizoDrag: true,
          causa: "drag-grupal"
        });
      });
    }

    // Ventana para ignorar cualquier end individual rezagado
    window._skipUntil = performance.now() + 400;

    // Rehabilitar drags y limpiar flags
    const seleccion = window._elementosSeleccionados || [];
    seleccion.forEach((id) => {
      const elNode = window._elementRefs?.[id];
      if (elNode) setTimeout(() => { try { elNode.draggable(true); } catch {} }, 24);
    });

    window._grupoLider = null;
    window._dragStartPos = null;
    window._dragInicial = null;

    // Limpiar el set un poquito después
    setTimeout(() => {
      window._skipIndividualEnd = null;
      window._skipUntil = 0;
    }, 450);

    setTimeout(() => { hasDragged.current = false; }, 40);
    return true;
  }

  // Si aún hay líder, los seguidores no persisten nada acá
  if (window._grupoLider) {
    const seleccion = window._elementosSeleccionados || [];
    if (seleccion.includes(obj.id)) {
      setTimeout(() => { hasDragged.current = false; }, 40);
      return true;
    }
  }

  return false;
}
