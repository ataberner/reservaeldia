import { Text, Image as KonvaImage } from "react-konva";
import { Rect, Circle, Line, RegularPolygon, Path } from "react-konva";
import useImage from "use-image";
import { useState, useRef } from "react";

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

  const handleRef = (node) => {
    if (node && registerRef) {
      registerRef(obj.id, node);
    }
  };

  const commonProps = {
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
        console.log("🖊️ Iniciando edición de texto para:", obj.id);
        if (onStartTextEdit) {
          onStartTextEdit(obj.id, obj);
        }
      } else {
        // No está seleccionado - solo seleccionar
        console.log("🎯 Seleccionando texto:", obj.id);
        onSelect(obj.id, obj, e);
      }
    } else {
      // Para otros elementos - siempre seleccionar
      onSelect(obj.id, obj, e);
    }
  }
},


onDragStart: (e) => {
  console.log("🚀 Iniciando drag de:", obj.id);
  hasDragged.current = true;
  
  // 🔥 MARCAR QUE ESTAMOS DRAGGEANDO
  window._isDragging = true;
  
  dragStartPos.current = e.target.getStage().getPointerPosition();
},

    onDragMove: (e) => {
  hasDragged.current = true;
  
  // 🔥 THROTTLE: Solo ejecutar cada 16ms (~60fps)
  if (!window._dragMoveTimeout) {
    window._dragMoveTimeout = setTimeout(() => {
      const node = e.target;
      if (node && node.position) {
        const nuevaPos = node.position();
        
        if (onDragMovePersonalizado) {
          onDragMovePersonalizado(nuevaPos, obj.id);
        }
      }
      
      window._dragMoveTimeout = null;
    }, 16);
  }
},

 onDragEnd: (e) => {
  console.log("🏁 Finalizando drag de:", obj.id);
  
  // 🔥 LIMPIAR FLAG DE DRAG
  window._isDragging = false;
  
  // 🔥 LIMPIAR TIMEOUT
  if (window._dragMoveTimeout) {
    clearTimeout(window._dragMoveTimeout);
    window._dragMoveTimeout = null;
  }
      const node = e.target;
      
      // Deshabilitar draggable
      if (node.draggable) {
        node.draggable(false);
      }
      
      // Limpiar timeout si existe
      if (window._dragMoveTimeout) {
        clearTimeout(window._dragMoveTimeout);
        window._dragMoveTimeout = null;
      }
      
      onChange(obj.id, {
        x: node.x(),
        y: node.y(),
        finalizoDrag: true
      });
      
      if (onDragEndPersonalizado) onDragEndPersonalizado();
      
      // Reset con delay
      setTimeout(() => {
        hasDragged.current = false;
      }, 50);
    },
  };

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
  return (
    <Line
      {...propsForma}
      points={[0, 0, obj.width || 100, 0]}
      onMouseEnter={() => onHover(obj.id)}
      onMouseLeave={() => onHover(null)}
      stroke={obj.color || "#000000"}
      strokeWidth={2}
      tension={0}
      lineCap="round"
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