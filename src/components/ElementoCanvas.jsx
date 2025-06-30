// ElementoCanvas.jsx - REEMPLAZAR TODO EL ARCHIVO
import { Text, Image as KonvaImage } from "react-konva";
import { Rect, Circle, Line, RegularPolygon, Path } from "react-konva";
import useImage from "use-image";
import { useState, useRef, useMemo, useCallback } from "react";

export default function ElementoCanvas({
  obj,
  isSelected,
  onSelect,
  onChange,
  registerRef,
  onHover,
  preSeleccionado,
  onDragMovePersonalizado,
  onDragEndPersonalizado,
  dragStartPos,
  hasDragged,
  onStartTextEdit
}) {
  const [img] = useImage(obj.src || null);
  const [isDragging, setIsDragging] = useState(false);

  // 🔥 PREVENIR onChange RECURSIVO PARA AUTOFIX
  const handleChange = useCallback((id, newData) => {
    if (newData.fromAutoFix || !onChange) return;
    onChange(id, newData);
  }, [onChange]);

  const handleRef = useCallback((node) => {
    if (node && registerRef) {
      registerRef(obj.id, node);
    }
  }, [obj.id, registerRef]);

  // 🔥 MEMOIZAR PROPIEDADES COMUNES
  const commonProps = useMemo(() => ({
    x: obj.x ?? 0,
    y: obj.y ?? 0,
    rotation: obj.rotation || 0,
    scaleX: obj.scaleX || 1,
    scaleY: obj.scaleY || 1,
    draggable: false,
    ref: handleRef,

    onMouseDown: (e) => {
      e.cancelBubble = true;
      hasDragged.current = false;
      
      // 🔥 HABILITAR draggable SIEMPRE
      e.target.draggable(true);
    },

    onMouseUp: (e) => {
      if (e.target.draggable && !hasDragged.current) {
        e.target.draggable(false);
      }
    },

    onClick: (e) => {
      e.cancelBubble = true;
      
      if (!hasDragged.current) {
        if (obj.tipo === "texto") {
          if (isSelected) {
            if (onStartTextEdit) {
              onStartTextEdit(obj.id, obj);
            }
          } else {
            onSelect(obj.id, obj, e);
          }
        } else {
          onSelect(obj.id, obj, e);
        }
      }
    },

    onDragStart: (e) => {
     
      hasDragged.current = true;
      window._isDragging = true;
      setIsDragging(true);
      
      const elementosSeleccionados = window._elementosSeleccionados || [];
      const esSeleccionMultiple = elementosSeleccionados.length > 1;
      const esLinea = obj.tipo === 'forma' && obj.figura === 'line';
      
      if (esSeleccionMultiple && elementosSeleccionados.includes(obj.id)) {
     
        
        // 🔥 CONFIGURAR LÍDER DEL GRUPO
        if (!window._grupoLider) {
          window._grupoLider = obj.id;
          window._dragStartPos = e.target.getStage().getPointerPosition();
          window._dragInicial = {};
          
          // 🔥 GUARDAR POSICIONES INICIALES DE TODOS LOS ELEMENTOS
          elementosSeleccionados.forEach(id => {
            const objeto = window._objetosActuales?.find(o => o.id === id);
            if (objeto) {
              // 🎯 Para líneas, guardar también los puntos
              if (objeto.tipo === 'forma' && objeto.figura === 'line') {
                window._dragInicial[id] = { 
                  x: objeto.x || 0, 
                  y: objeto.y || 0,
                  points: [...(objeto.points || [0, 0, 100, 0])] // Clonar array
                };
              } else {
                window._dragInicial[id] = { 
                  x: objeto.x || 0, 
                  y: objeto.y || 0 
                };
              }
          
            }
          });
          
      
        }
      } else {
        // 🔄 DRAG INDIVIDUAL
        dragStartPos.current = e.target.getStage().getPointerPosition();
   
      }
    },

// En ElementoCanvas.jsx, dentro de commonProps, reemplazar onDragMove:
onDragMove: (e) => {
  hasDragged.current = true;
  
  // 🔥 DRAG GRUPAL - SOLO EL LÍDER PROCESA
  if (window._grupoLider && obj.id === window._grupoLider) {
    const stage = e.target.getStage();
    const currentPos = stage.getPointerPosition();
    
    if (currentPos && window._dragStartPos && window._dragInicial) {
      const deltaX = currentPos.x - window._dragStartPos.x;
      const deltaY = currentPos.y - window._dragStartPos.y;
      
      const elementosSeleccionados = window._elementosSeleccionados || [];
      
      // 🔥 ACTUALIZACIÓN INMEDIATA SIN THROTTLE PARA EVITAR LAG
      elementosSeleccionados.forEach(elementId => {
        if (window._dragInicial[elementId]) {
          const posInicial = window._dragInicial[elementId];
          
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
  
  // 🔥 SI ES SEGUIDOR DEL GRUPO, NO PROCESAR
  if (window._grupoLider) {
    const elementosSeleccionados = window._elementosSeleccionados || [];
    if (elementosSeleccionados.includes(obj.id) && obj.id !== window._grupoLider) {
      return;
    }
  }
  
  // 🔄 DRAG INDIVIDUAL - Solo si no hay drag grupal activo
  if (!window._grupoLider) {
    const node = e.target;
    if (node && node.position) {
      const nuevaPos = node.position();
      
      if (onDragMovePersonalizado) {
        onDragMovePersonalizado(nuevaPos, obj.id);
      }
    }
  }
},

    onDragEnd: (e) => {
            
      window._isDragging = false;
      setIsDragging(false);
      
      const node = e.target;
      
      // 🔥 FINALIZAR DRAG GRUPAL SI ES EL LÍDER
      if (window._grupoLider && obj.id === window._grupoLider) {
      
        
        const stage = e.target.getStage();
        const currentPos = stage.getPointerPosition();
        
        if (currentPos && window._dragStartPos && window._dragInicial) {
          const deltaX = currentPos.x - window._dragStartPos.x;
          const deltaY = currentPos.y - window._dragStartPos.y;
          const elementosSeleccionados = window._elementosSeleccionados || [];
          
         
          
          // 🔥 APLICAR CAMBIOS FINALES
          if (onChange) {
            onChange('BATCH_UPDATE_GROUP_FINAL', {
              elementos: elementosSeleccionados,
              dragInicial: window._dragInicial,
              deltaX,
              deltaY,
              isBatchUpdateFinal: true
            });
          }
        }
        
        // 🔥 LIMPIAR FLAGS
        window._grupoLider = null;
        window._dragStartPos = null;
        window._dragInicial = null;
        window._dragGroupThrottle = false;
        
        // Re-habilitar draggable para todos
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
        
        return;
      }
      
      // 🔥 SI ES SEGUIDOR, SOLO LIMPIAR FLAGS
      if (window._grupoLider) {
        const elementosSeleccionados = window._elementosSeleccionados || [];
        if (elementosSeleccionados.includes(obj.id)) {
          setTimeout(() => {
            hasDragged.current = false;
          }, 50);
          return;
        }
      }
      
      // 🔄 DRAG INDIVIDUAL
      onChange(obj.id, {
        x: node.x(),
        y: node.y(),
        finalizoDrag: true
      });
      
      if (onDragEndPersonalizado) onDragEndPersonalizado();
      
      setTimeout(() => {
        hasDragged.current = false;
      }, 50);
    },
  }), [obj.x, obj.y, obj.rotation, obj.scaleX, obj.scaleY, handleRef, onChange]);

  // 🔥 MEMOIZAR HANDLERS HOVER
  const handleMouseEnter = useCallback(() => {
    if (onHover && !isDragging && !window._isDragging) {
      onHover(obj.id);
    }
  }, [onHover, obj.id, isDragging]);

  const handleMouseLeave = useCallback(() => {
    if (onHover) onHover(null);
  }, [onHover]);

  // 🎯 RENDER DE LÍNEA OPTIMIZADO
  if (obj.tipo === "forma" && obj.figura === "line") {
    let linePoints = obj.points;
    let pointsFixed = false;
    
    if (!linePoints || !Array.isArray(linePoints) || linePoints.length < 4) {
      linePoints = [0, 0, 100, 0];
      pointsFixed = true;
    } else {
      const puntosValidados = [];
      for (let i = 0; i < 4; i++) {
        const punto = parseFloat(linePoints[i]);
        puntosValidados.push(isNaN(punto) ? 0 : punto);
      }
      
      if (JSON.stringify(puntosValidados) !== JSON.stringify(linePoints.slice(0, 4))) {
        linePoints = puntosValidados;
        pointsFixed = true;
      } else {
        linePoints = linePoints.slice(0, 4);
      }
    }
    
    if (pointsFixed && handleChange) {
      setTimeout(() => {
        handleChange(obj.id, { 
          points: linePoints,
          fromAutoFix: true
        });
      }, 0);
    }
    
    return (
      <Line
        {...commonProps}
        points={linePoints}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        stroke={obj.color || "#000000"}
        strokeWidth={obj.strokeWidth || 2} // 🔥 Usar strokeWidth del objeto
        tension={0}
        lineCap="round"
        lineJoin="round"
        perfectDrawEnabled={false}
        hitStrokeWidth={Math.max(15, (obj.strokeWidth || 2) + 10)} // 🔥 Área de click adaptativa
        shadowForStrokeEnabled={false}
        // 🎨 Efecto visual sutil cuando está seleccionada
        opacity={isSelected ? 1 : 0.95}
        shadowColor={isSelected ? "rgba(119, 61, 190, 0.3)" : "transparent"}
        shadowBlur={isSelected ? 8 : 0}
        shadowOffset={{ x: 0, y: 2 }}
      />
    );
  }

  // 🔄 RESTO DE ELEMENTOS (sin cambios)
  if (obj.tipo === "texto") {
    return (
      <Text
        {...commonProps}
        text={obj.texto}
        fontSize={obj.fontSize || 24}
        fontFamily={obj.fontFamily || "sans-serif"}
        fontWeight={obj.fontWeight || "normal"}
        fontStyle={obj.fontStyle || "normal"}
        align="center"
        textDecoration={obj.textDecoration || "none"}
        fill={obj.color || "#000"}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
        strokeWidth={isSelected || preSeleccionado ? 1 : 0}
      />
    );
  }

  if (obj.tipo === "imagen" && img) {
    return (
      <KonvaImage
        {...commonProps}
        image={img}
        width={obj.width || img.width}
        height={obj.height || img.height}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
        strokeWidth={isSelected || preSeleccionado ? 1 : 0}
      />
    );
  }

  if (obj.tipo === "icono-svg") {
    return (
      <Path
        {...commonProps}
        data={obj.d}
        fill={obj.color || "#000"}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
        strokeWidth={isSelected || preSeleccionado ? 1 : 0}
      />
    );
  }

  if (obj.tipo === "icono" && img) {
    return (
      <KonvaImage
        {...commonProps}
        image={img}
        width={obj.width || img.width}
        height={obj.height || img.height}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
        strokeWidth={isSelected || preSeleccionado ? 1 : 0}
      />
    );
  }

  if (obj.tipo === "forma") {
    const propsForma = {
      ...commonProps,
      fill: obj.color || "#000000",
    };
      
    switch (obj.figura) {
      case "rect":
        return (
          <Rect
            {...propsForma}
            width={Math.abs(obj.width || 100)}
            height={Math.abs(obj.height || 100)}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
            strokeWidth={isSelected || preSeleccionado ? 1 : 0}
          />
        );
        
      case "circle":
        return (
          <Circle
            {...propsForma}
            radius={obj.radius || 50}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
            strokeWidth={isSelected || preSeleccionado ? 1 : 0}
          />
        );
        
      case "triangle":
        return (
          <RegularPolygon
            {...propsForma}
            sides={3}
            radius={obj.radius || 60}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
            strokeWidth={isSelected || preSeleccionado ? 1 : 0}
          />
        );
        
      default:
        return null;
    }
  }

  return null;
}