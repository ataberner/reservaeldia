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
  const [draggable, setDraggable] = useState(false);

  const mouseDownTime = useRef(null);


  
    const handleRef = (node) => {
    if (node && registerRef) {
      registerRef(obj.id, node);
    }
  };

  const borde = isSelected || preSeleccionado;

const commonProps = {
  x: obj.x ?? 0,
  y: obj.y ?? 0,
  rotation: obj.rotation || 0,
  scaleX: obj.scaleX || 1,
  scaleY: obj.scaleY || 1,
  draggable: false, // 🔥 MANTENER FALSE por defecto
  ref: handleRef,

  onMouseDown: (e) => {
    e.cancelBubble = true;
    hasDragged.current = false;
    
    // 🔥 SOLO habilitar draggable si ya está seleccionado
    if (isSelected) {
      e.target.draggable(true);
    }
  },

  onMouseUp: (e) => {
    // 🔥 SIEMPRE deshabilitar draggable al soltar
    if (e.target.draggable) {
      e.target.draggable(false);
    }
  },

  onMouseLeave: (e) => {
    // 🔥 TAMBIÉN deshabilitar al salir del elemento
    if (e.target.draggable) {
      e.target.draggable(false);
    }
  },

  onClick: (e) => {
    e.cancelBubble = true;
    
    if (!hasDragged.current) {
      if (obj.tipo === "texto") {
        if (isSelected) {
          console.log("🖊️ Iniciando edición de texto para:", obj.id);
          if (onStartTextEdit) {
            onStartTextEdit(obj.id, obj);
          }
        } else {
          console.log("🎯 Seleccionando texto:", obj.id);
          onSelect(obj.id, obj, e);
        }
      } else {
        onSelect(obj.id, obj, e);
      }
    }
  },

  onDragStart: (e) => {
    console.log("🚀 Iniciando drag de:", obj.id);
    hasDragged.current = true; // 🔥 MARCAR como drag inmediatamente
    dragStartPos.current = e.target.getStage().getPointerPosition();
  },

  onDragMove: (e) => {
    hasDragged.current = true;
    
    const node = e.target;
    const nuevaPos = node.position();
    
    if (onDragMovePersonalizado) {
      onDragMovePersonalizado(nuevaPos, obj.id);
    }
  },

  onDragEnd: (e) => {
    console.log("🏁 Finalizando drag de:", obj.id);
    const node = e.target;
    
    // 🔥 DESHABILITAR draggable INMEDIATAMENTE
    if (node.draggable) {
      node.draggable(false);
    }
    
    onChange(obj.id, {
      x: node.x(),
      y: node.y(),
      finalizoDrag: true
    });
    
    if (onDragEndPersonalizado) onDragEndPersonalizado();
    
    // 🔥 RESET con delay más corto
    setTimeout(() => {
      hasDragged.current = false;
    }, 50);
  },
};


  if (obj.tipo === "texto") {
  return (
    <Text
      {...commonProps} // 🔥 USAR commonProps en lugar de props específicos
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
        onSelect(obj.id, obj);
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

  // ⭐ Ícono SVG como Path
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

  // 🧩 Ícono como imagen (no SVG path, sino imagen desde Firebase)
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

// ⬛ Forma básica
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
          points={obj.points || [0, 0, 100, 0]}
          onMouseEnter={() => onHover(obj.id)}
          onMouseLeave={() => onHover(null)}
          stroke={obj.color || "#000000"}
          strokeWidth={4}
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
          rotation={180}
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