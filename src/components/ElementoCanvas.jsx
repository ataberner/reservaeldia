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

  // 🔥 PREVENIR onChange RECURSIVO PARA AUTOFIX
const handleChange = useCallback((id, newData) => {
  // No procesar cambios que vienen del autofix para evitar bucles
  if (newData.fromAutoFix || !onChange) return;
  onChange(id, newData);
}, [onChange]);

    const handleRef = useCallback((node) => {
    if (node && registerRef) {
      registerRef(obj.id, node);
    }
  }, [obj.id, registerRef]);

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
  
  // 🔥 SIEMPRE habilitar draggable para permitir drag directo
  e.target.draggable(true);
},

    onMouseUp: (e) => {
      // Solo deshabilitar si no estamos arrastrando
      if (e.target.draggable && !hasDragged.current) {
        e.target.draggable(false);
      }
    },

// MANTENER ESTE onClick (que ya funciona bien):
onClick: (e) => {
  e.cancelBubble = true;
  
  if (!hasDragged.current) {
    if (obj.tipo === "texto") {
      if (isSelected) {
        // Ya está seleccionado - entrar en edición
      
        if (onStartTextEdit) {
          onStartTextEdit(obj.id, obj);
        }
      } else {
        // No está seleccionado - solo seleccionar
     
        onSelect(obj.id, obj, e);
      }
    } else {
      // Para otros elementos - siempre seleccionar
      onSelect(obj.id, obj, e);
    }
  }
},



onDragStart: (e) => {
  console.log("🚀 Iniciando drag para:", obj.id);
  hasDragged.current = true;
  window._isDragging = true;
  
  const elementosSeleccionados = window._elementosSeleccionados || [];
  const esSeleccionMultiple = elementosSeleccionados.length > 1;
  
  if (esSeleccionMultiple) {
    console.log("👥 Drag grupal detectado para:", elementosSeleccionados.length, "elementos");
    
    // 🔥 NO DESHABILITAR DRAGGABLE - mantenerlo activo
    // e.target.draggable(false); // ❌ COMENTAR ESTA LÍNEA
    
    // 🔥 CONFIGURAR DRAG MANUAL
    window._grupoLider = obj.id;
    window._dragStartPos = e.target.getStage().getPointerPosition();
    window._dragInicial = {};
    
    // 🔥 GUARDAR POSICIONES INICIALES
    elementosSeleccionados.forEach(id => {
      const objeto = window._objetosActuales?.find(o => o.id === id);
      if (objeto) {
        window._dragInicial[id] = { x: objeto.x || 0, y: objeto.y || 0 };
        console.log(`📍 Posición inicial guardada para ${id}:`, window._dragInicial[id]);
      }
    });
    
    console.log("✅ Drag grupal configurado:", {
      lider: window._grupoLider,
      startPos: window._dragStartPos,
      posicionesIniciales: Object.keys(window._dragInicial).length
    });
    
    // 🔥 NO HACER RETURN - permitir que continúe el drag normal
  } else {
    // 🔄 DRAG INDIVIDUAL
    dragStartPos.current = e.target.getStage().getPointerPosition();
    console.log("🎯 Drag individual configurado para:", obj.id);
  }
},



onDragMove: (e) => {
  hasDragged.current = true;
  
  // 🔥 SI HAY DRAG GRUPAL MANUAL ACTIVO, USAR MÉTODO ALTERNATIVO
  if (window._grupoLider && obj.id === window._grupoLider) {
    const stage = e.target.getStage();
    const currentPos = stage.getPointerPosition();
    
    if (currentPos && window._dragStartPos && window._dragInicial) {
      const deltaX = currentPos.x - window._dragStartPos.x;
      const deltaY = currentPos.y - window._dragStartPos.y;
      
      const elementosSeleccionados = window._elementosSeleccionados || [];
      
      // 🔥 USAR onChange INMEDIATO SIN THROTTLE
      if (onChange) {
        // 🔥 ENVIAR ACTUALIZACIONES INDIVIDUALES INMEDIATAS
        elementosSeleccionados.forEach(elementId => {
          if (elementId !== obj.id && window._dragInicial[elementId]) {
            const posInicial = window._dragInicial[elementId];
            onChange(elementId, {
              x: posInicial.x + deltaX,
              y: posInicial.y + deltaY,
              isDragPreview: true,
              skipHistorial: true // Flag para evitar historial durante preview
            });
          }
        });
      }
    }
    return;
  }
  
  // 🔥 SI ES PARTE DEL GRUPO PERO NO ES EL LÍDER, NO PROCESAR
  if (window._grupoLider && obj.id !== window._grupoLider) {
    const elementosSeleccionados = window._elementosSeleccionados || [];
    if (elementosSeleccionados.includes(obj.id)) {
      return;
    }
  }
  
  // 🔄 DRAG INDIVIDUAL (código original)
  const node = e.target;
  if (node && node.position) {
    const nuevaPos = node.position();
    
    if (onDragMovePersonalizado) {
      onDragMovePersonalizado(nuevaPos, obj.id);
    }
  }
},

onDragEnd: (e) => {
  console.log("🏁 Finalizando drag para:", obj.id);
  
  // 🔥 LIMPIAR FLAGS
  window._isDragging = false;
  
  const node = e.target;
  
// 🔥 SI ES EL LÍDER DEL GRUPO, FINALIZAR DRAG GRUPAL
  if (window._grupoLider && obj.id === window._grupoLider) {
    console.log("🏁 Finalizando drag grupal desde elemento líder");
    
    const stage = e.target.getStage();
    const currentPos = stage.getPointerPosition();
    
    if (currentPos && window._dragStartPos && window._dragInicial) {
      const deltaX = currentPos.x - window._dragStartPos.x;
      const deltaY = currentPos.y - window._dragStartPos.y;
      const elementosSeleccionados = window._elementosSeleccionados || [];
      
      console.log("💾 Sincronizando posiciones finales con React state:", { deltaX, deltaY, elementos: elementosSeleccionados.length });
      
      // 🔥 SINCRONIZAR POSICIONES FINALES CON REACT STATE
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
    
    // 🔥 LIMPIAR FLAGS DE DRAG GRUPAL
    console.log("🧹 Limpiando flags de drag grupal desde elemento");
    window._grupoLider = null;
    window._dragStartPos = null;
    window._dragInicial = null;
    
    setTimeout(() => {
      hasDragged.current = false;
    }, 50);
    
    return;
  }
  
  // 🔥 SI ES SEGUIDOR EN GRUPO, NO PROCESAR
  if (window._grupoLider) {
    const elementosSeleccionados = window._elementosSeleccionados || [];
    if (elementosSeleccionados.includes(obj.id)) {
      console.log("🔄 Elemento seguidor finalizando - no procesar");
      setTimeout(() => {
        hasDragged.current = false;
      }, 50);
      return;
    }
  }
  
  // 🔄 DRAG INDIVIDUAL NORMAL
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

  }), [obj.x, obj.y, obj.rotation, obj.scaleX, obj.scaleY, handleRef]);



 // 🔥 MEMOIZAR HANDLERS PARA EVITAR RE-CREACIÓN
  const handleMouseEnter = useCallback(() => {
    if (onHover) onHover(obj.id);
  }, [onHover, obj.id]);

  const handleMouseLeave = useCallback(() => {
    if (onHover) onHover(null);
  }, [onHover]);


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
        onMouseEnter={() => onHover(obj.id)}
        onMouseLeave={() => onHover(null)}
        onContextMenu={(e) => {
          e.evt.preventDefault();
          // Solo mostrar menú contextual
          const mousePos = e.evt;
          const x = mousePos.clientX;
          const y = mousePos.clientY;
          const customEvent = new CustomEvent("abrir-menu-contextual", {
            detail: { x, y },
          });
          window.dispatchEvent(customEvent);
        }}
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
        onMouseEnter={() => onHover(obj.id)}
        onMouseLeave={() => onHover(null)}
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
        onMouseEnter={() => onHover(obj.id)}
        onMouseLeave={() => onHover(null)}
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
        onMouseEnter={() => onHover(obj.id)}
        onMouseLeave={() => onHover(null)}
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
            onMouseEnter={() => onHover(obj.id)}
            onMouseLeave={() => onHover(null)}
            stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
            strokeWidth={isSelected || preSeleccionado ? 1 : 0}
          />
        );
        
      case "circle":
        return (
          <Circle
            {...propsForma}
            radius={obj.radius || 50}
            onMouseEnter={() => onHover(obj.id)}
            onMouseLeave={() => onHover(null)}
            stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
            strokeWidth={isSelected || preSeleccionado ? 1 : 0}
          />
        );
        
   case "line":
  // 🔥 LIMPIEZA COMPLETA DE PUNTOS SIN LOGS REPETITIVOS
  let linePoints = obj.points;
  let pointsFixed = false;
  
  // Verificar si los puntos son válidos
  if (!linePoints || !Array.isArray(linePoints) || linePoints.length < 4) {
    linePoints = [0, 0, 100, 0]; // Fallback
    pointsFixed = true;
  } else {
    // Validar que todos los puntos sean números
    const puntosValidados = [];
    for (let i = 0; i < 4; i++) {
      const punto = parseFloat(linePoints[i]);
      puntosValidados.push(isNaN(punto) ? 0 : punto);
    }
    
    // Verificar si hubo cambios
    if (JSON.stringify(puntosValidados) !== JSON.stringify(linePoints.slice(0, 4))) {
      linePoints = puntosValidados;
      pointsFixed = true;
    } else {
      linePoints = linePoints.slice(0, 4); // Solo tomar los primeros 4
    }
  }
 
  // 🔥 CORREGIR LOS PUNTOS AUTOMÁTICAMENTE SIN LOGS
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
      {...propsForma}
      points={linePoints}
      onMouseEnter={() => onHover && onHover(obj.id)}
      onMouseLeave={() => onHover && onHover(null)}
      stroke={obj.color || "#000000"}
      strokeWidth={2} // 🔥 GROSOR CONSTANTE - SIN CAMBIOS AL SELECCIONAR
      tension={0}
      lineCap="round"
      perfectDrawEnabled={false}
      // 🔥 SIN EFECTOS VISUALES CUANDO ESTÁ SELECCIONADA
    />
  );

      case "triangle":
        return (
          <RegularPolygon
            {...propsForma}
            sides={3}
            radius={obj.radius || 60}
            onMouseEnter={() => onHover(obj.id)}
            onMouseLeave={() => onHover(null)}
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