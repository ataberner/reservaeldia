// C:\Reservaeldia\src\drag\dragGrupal.js
import { determinarNuevaSeccion } from "@/utils/layout";


export function previewDragGrupal(e, obj, onChange) {

    // 🔥 DRAG GRUPAL - SOLO EL LÍDER PROCESA
    if (window._grupoLider && obj.id === window._grupoLider) {
        const stage = e.target.getStage();
        const currentPos = stage.getPointerPosition();

        if (currentPos && window._dragStartPos && window._dragInicial) {
            const deltaX = currentPos.x - window._dragStartPos.x;
            const deltaY = currentPos.y - window._dragStartPos.y;

            console.log("📐 Deltas de movimiento:", { deltaX, deltaY });


            const elementosSeleccionados = window._elementosSeleccionados || [];

            // 🔥 ACTUALIZACIÓN INMEDIATA SIN THROTTLE PARA EVITAR LAG
            elementosSeleccionados.forEach(elementId => {
                if (window._dragInicial[elementId]) {
                    const posInicial = window._dragInicial[elementId];

                    console.log(`🔄 Moviendo ${elementId}:`, {
                        posInicial: posInicial,
                        nuevaPos: {
                            x: posInicial.x + deltaX,
                            y: posInicial.y + deltaY
                        }
                    });

                    // 🎯 Actualizar posición directamente en el nodo para feedback inmediato
                    const node = window._elementRefs?.[elementId];
                    if (node) {
                        node.x(posInicial.x + deltaX);
                        node.y(posInicial.y + deltaY);
                    }

                    // También actualizar via onChange para sincronizar con React
                    onChange(elementId, {
                        x: posInicial.x + deltaX,
                        y: posInicial.y + deltaY,
                        isDragPreview: true,
                        skipHistorial: true
                    });
                }
            });

            // 🔥 Forzar redibujado inmediato
            e.target.getLayer()?.batchDraw();
        }
        return;
    }
}


export function startDragGrupalLider(e, obj) {
  const elementosSeleccionados = window._elementosSeleccionados || [];
  const esSeleccionMultiple = elementosSeleccionados.length > 1;

  if (esSeleccionMultiple && elementosSeleccionados.includes(obj.id)) {
    if (!window._grupoLider) {
      window._grupoLider = obj.id;
      window._dragStartPos = e.target.getStage().getPointerPosition();
      window._dragInicial = {};

      console.log("🎯 INICIANDO DRAG GRUPAL");
      console.log("Líder del grupo:", obj.id);
      console.log("Sección del líder:", obj.seccionId);

      elementosSeleccionados.forEach(id => {
        const objeto = window._objetosActuales?.find(o => o.id === id);
        const nodoActual = window._elementRefs?.[id];

        if (objeto && nodoActual) {
          const xActual = nodoActual.x ? nodoActual.x() : (objeto.x || 0);
          const yActual = nodoActual.y ? nodoActual.y() : (objeto.y || 0);

          if (objeto.tipo === 'forma' && objeto.figura === 'line') {
            window._dragInicial[id] = {
              x: xActual,
              y: yActual,
              points: [...(objeto.points || [0, 0, 100, 0])]
            };
          } else {
            window._dragInicial[id] = { x: xActual, y: yActual };
          }
        } else if (objeto) {
          console.warn(`⚠️ No se encontró nodo para ${id}, usando valores del objeto`);
          const seccionIndex = window._seccionesOrdenadas?.findIndex(s => s.id === objeto.seccionId);
          const offsetY = seccionIndex >= 0
            ? window._seccionesOrdenadas.slice(0, seccionIndex).reduce((sum, s) => sum + s.altura, 0)
            : 0;

          if (objeto.tipo === 'forma' && objeto.figura === 'line') {
            window._dragInicial[id] = {
              x: objeto.x || 0,
              y: (objeto.y || 0) + offsetY,
              points: [...(objeto.points || [0, 0, 100, 0])]
            };
          } else {
            window._dragInicial[id] = {
              x: objeto.x || 0,
              y: (objeto.y || 0) + offsetY
            };
          }
        }
      });
    }
    return true; // indica que fue grupal
  }
  return false; // no fue grupal
}

export function endDragGrupal(e, obj, onChange, hasDragged, setIsDragging) {
  // 🔥 FINALIZAR DRAG GRUPAL SI ES EL LÍDER
  if (window._grupoLider && obj.id === window._grupoLider) {
    console.log("🏁 FIN DRAG GRUPAL - LÍDER:", obj.id);

    const stage = e.target.getStage();
    const currentPos = stage.getPointerPosition();

    if (currentPos && window._dragStartPos && window._dragInicial) {
      const deltaX = currentPos.x - window._dragStartPos.x;
      const deltaY = currentPos.y - window._dragStartPos.y;
      const elementosSeleccionados = window._elementosSeleccionados || [];

      console.log("📏 Deltas finales:", { deltaX, deltaY });

      if (onChange) {
        elementosSeleccionados.forEach(elementId => {
          if (window._dragInicial[elementId]) {
            const posInicial = window._dragInicial[elementId];
            const objeto = window._objetosActuales?.find(o => o.id === elementId);

            if (objeto) {
              const yAbsoluta = posInicial.y + deltaY;
              const xFinal = posInicial.x + deltaX;

              const { nuevaSeccion } = determinarNuevaSeccion(
                yAbsoluta,
                objeto.seccionId,
                window._seccionesOrdenadas || []
              );

              if (nuevaSeccion) {
                onChange(elementId, {
                  x: xFinal,
                  y: yAbsoluta,
                  seccionId: nuevaSeccion,
                  finalizoDrag: true
                });
              } else {
                const seccionIndex = window._seccionesOrdenadas?.findIndex(s => s.id === objeto.seccionId);
                let yRelativa = yAbsoluta;

                if (seccionIndex >= 0 && window._seccionesOrdenadas) {
                  const offsetY = window._seccionesOrdenadas
                    .slice(0, seccionIndex)
                    .reduce((sum, s) => sum + (s.altura || 0), 0);
                  yRelativa = yAbsoluta - offsetY;
                  console.log(`   Conversión: Y abs ${yAbsoluta} → Y rel ${yRelativa} (offset ${offsetY})`);
                }

                onChange(elementId, {
                  x: xFinal,
                  y: yAbsoluta,
                  finalizoDrag: true
                });
              }
            }
          }
        });
      }
    }

    // 🔥 LIMPIAR FLAGS
    window._grupoLider = null;
    window._dragStartPos = null;
    window._dragInicial = null;
    window._dragGroupThrottle = false;

    const elementosSeleccionados = window._elementosSeleccionados || [];
    elementosSeleccionados.forEach(id => {
      const elNode = window._elementRefs?.[id];
      if (elNode) {
        setTimeout(() => elNode.draggable(true), 50);
      }
    });

    setTimeout(() => {
      hasDragged.current = false;
    }, 50);

    return true; // se procesó grupal líder
  }

  // 🔥 SI ES SEGUIDOR, SOLO LIMPIAR FLAGS
  if (window._grupoLider) {
    const elementosSeleccionados = window._elementosSeleccionados || [];
    if (elementosSeleccionados.includes(obj.id)) {
      console.log("🏁 FIN DRAG GRUPAL - SEGUIDOR:", obj.id);
      setTimeout(() => {
        hasDragged.current = false;
      }, 50);
      return true; // se procesó grupal seguidor
    }
  }

  return false; // no fue drag grupal
}

