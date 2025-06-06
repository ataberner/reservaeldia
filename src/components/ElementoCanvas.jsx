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
  hasDragged
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
  draggable: false,
  ref: handleRef,

  onMouseDown: (e) => {
  dragStartPos.current = e.target.getStage().getPointerPosition();
  mouseDownTime.current = Date.now();
  hasDragged.current = false;
},


  onMouseMove: (e) => {
  if (!dragStartPos.current || !mouseDownTime.current) return;

  const pos = e.target.getStage().getPointerPosition();
  const dx = pos.x - dragStartPos.current.x;
  const dy = pos.y - dragStartPos.current.y;
  const distancia = Math.sqrt(dx * dx + dy * dy);
  const tiempoPresionado = Date.now() - mouseDownTime.current;

  if (distancia > 5 && tiempoPresionado > 50 && !hasDragged.current) {
    hasDragged.current = true;
    e.target.startDrag(); // ✅ iniciamos manualmente el drag
  }
},

  onMouseUp: () => {
  dragStartPos.current = null;
  mouseDownTime.current = null;
},

  onClick: (e) => {
  if (!hasDragged.current) {
    onSelect(obj.id, obj, e);
  }
},

  onTap: (e) => onSelect(obj.id, obj, e),
  onDragEnd: (e) => onChange(obj.id, { x: e.target.x(), y: e.target.y() }),
  onTransformEnd: (e) => {
    const node = e.target;
    if (obj.tipo === "texto") {
      const scale = node.scaleX();
      const newFontSize = (obj.fontSize || 24) * scale;
      node.scaleX(1);
      node.scaleY(1);

      onChange(obj.id, {
        x: node.x(),
        y: node.y(),
        fontSize: Math.max(6, Math.round(newFontSize)),
        rotation: node.rotation(),
      });
    } else {
      onChange(obj.id, {
        x: node.x(),
        y: node.y(),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
        rotation: node.rotation(),
      });
    }
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
        onDblClick={(e) => {
          if (modoEdicion) return; // ❌ No hacer nada si hay edición en curso
          if (isSelected && obj.tipo === "texto") {
            onSelect(obj.id, obj, e); // ✅ selecciona normalmente
          }
        }}


        onMouseEnter={() => onHover(obj.id)}
        onMouseLeave={() => onHover(null)}
        onContextMenu={(e) => {
          e.evt.preventDefault(); // 🔒 Evita que aparezca el menú del navegador

          
          // 🟣 Seleccionamos el objeto
          onSelect(obj.id, obj);

          // 📦 Coordenadas del canvas en pantalla
          const stageBox = e.target.getStage().container().getBoundingClientRect();
          const mousePos = e.evt;

          const x = mousePos.clientX;
          const y = mousePos.clientY;

          // 🚀 Lanzamos un evento global personalizado con las coordenadas
          const customEvent = new CustomEvent("abrir-menu-contextual", {
            detail: { x, y },
          });

          window.dispatchEvent(customEvent);
        }}
              onDragMove={(e) => {
  const pos = e.target.getStage().getPointerPosition();

  // Detectamos si el usuario realmente arrastró (movió al menos 5px)
  if (!hasDragged.current && dragStartPos.current) {
    const dx = pos.x - dragStartPos.current.x;
    const dy = pos.y - dragStartPos.current.y;
    const distancia = Math.sqrt(dx * dx + dy * dy);
    if (distancia > 5) {
      hasDragged.current = true;
    }
  }

  // Ejecutamos la función personalizada si existe
  const node = e.target;
  const nuevaPos = node.position();
  if (onDragMovePersonalizado) {
    onDragMovePersonalizado(nuevaPos, obj.id);
  }
}}

            onDragEnd={(e) => {
  const node = e.target;
  onChange(obj.id, {
    x: node.x(),
    y: node.y(),
    scaleX: node.scaleX(),
    scaleY: node.scaleY(),
    rotation: node.rotation(),
  });
  if (onDragEndPersonalizado) onDragEndPersonalizado();
  hasDragged.current = false;

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
         onDragMove={(e) => {
  const pos = e.target.getStage().getPointerPosition();

  // Detectamos si el usuario realmente arrastró (movió al menos 5px)
  if (!hasDragged.current && dragStartPos.current) {
    const dx = pos.x - dragStartPos.current.x;
    const dy = pos.y - dragStartPos.current.y;
    const distancia = Math.sqrt(dx * dx + dy * dy);
    if (distancia > 5) {
      hasDragged.current = true;
    }
  }

  // Ejecutamos la función personalizada si existe
  const node = e.target;
  const nuevaPos = node.position();
  if (onDragMovePersonalizado) {
    onDragMovePersonalizado(nuevaPos, obj.id);
  }
}}

            onDragEnd={(e) => {
  const node = e.target;
  onChange(obj.id, {
    x: node.x(),
    y: node.y(),
    scaleX: node.scaleX(),
    scaleY: node.scaleY(),
    rotation: node.rotation(),
  });
  if (onDragEndPersonalizado) onDragEndPersonalizado();
  hasDragged.current = false;

}}


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
      scaleX={obj.scaleX || 1}
      scaleY={obj.scaleY || 1}
      onMouseEnter={() => onHover(obj.id)}
      onMouseLeave={() => onHover(null)}
        onDragMove={(e) => {
  const pos = e.target.getStage().getPointerPosition();

  // Detectamos si el usuario realmente arrastró (movió al menos 5px)
  if (!hasDragged.current && dragStartPos.current) {
    const dx = pos.x - dragStartPos.current.x;
    const dy = pos.y - dragStartPos.current.y;
    const distancia = Math.sqrt(dx * dx + dy * dy);
    if (distancia > 5) {
      hasDragged.current = true;
    }
  }

  // Ejecutamos la función personalizada si existe
  const node = e.target;
  const nuevaPos = node.position();
  if (onDragMovePersonalizado) {
    onDragMovePersonalizado(nuevaPos, obj.id);
  }
}}

            onDragEnd={(e) => {
  const node = e.target;
  onChange(obj.id, {
    x: node.x(),
    y: node.y(),
    scaleX: node.scaleX(),
    scaleY: node.scaleY(),
    rotation: node.rotation(),
  });
  if (onDragEndPersonalizado) onDragEndPersonalizado();
  hasDragged.current = false;

}}

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
        width={img?.width}
        height={img?.height}
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
        return <Rect
                {...propsForma}
                width={100}
                height={100}
                onMouseEnter={() => onHover(obj.id)}
                 onMouseLeave={() => onHover(null)}
                onDragMove={(e) => {
  const pos = e.target.getStage().getPointerPosition();

  // Detectamos si el usuario realmente arrastró (movió al menos 5px)
  if (!hasDragged.current && dragStartPos.current) {
    const dx = pos.x - dragStartPos.current.x;
    const dy = pos.y - dragStartPos.current.y;
    const distancia = Math.sqrt(dx * dx + dy * dy);
    if (distancia > 5) {
      hasDragged.current = true;
    }
  }

  // Ejecutamos la función personalizada si existe
  const node = e.target;
  const nuevaPos = node.position();
  if (onDragMovePersonalizado) {
    onDragMovePersonalizado(nuevaPos, obj.id);
  }
}}

                onDragEnd={(e) => {
  const node = e.target;
  onChange(obj.id, {
    x: node.x(),
    y: node.y(),
    scaleX: node.scaleX(),
    scaleY: node.scaleY(),
    rotation: node.rotation(),
  });
  if (onDragEndPersonalizado) onDragEndPersonalizado();
  hasDragged.current = false;

}}



                stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
                strokeWidth={isSelected || preSeleccionado ? 1 : 0} 
              />;
      case "circle":
        return <Circle
         {...propsForma}
         radius={50}
         onMouseEnter={() => onHover(obj.id)}
        onMouseLeave={() => onHover(null)}
         onDragMove={(e) => {
  const pos = e.target.getStage().getPointerPosition();

  // Detectamos si el usuario realmente arrastró (movió al menos 5px)
  if (!hasDragged.current && dragStartPos.current) {
    const dx = pos.x - dragStartPos.current.x;
    const dy = pos.y - dragStartPos.current.y;
    const distancia = Math.sqrt(dx * dx + dy * dy);
    if (distancia > 5) {
      hasDragged.current = true;
    }
  }

  // Ejecutamos la función personalizada si existe
  const node = e.target;
  const nuevaPos = node.position();
  if (onDragMovePersonalizado) {
    onDragMovePersonalizado(nuevaPos, obj.id);
  }
}}

        onDragEnd={(e) => {
  const node = e.target;
  onChange(obj.id, {
    x: node.x(),
    y: node.y(),
    scaleX: node.scaleX(),
    scaleY: node.scaleY(),
    rotation: node.rotation(),
  });
  if (onDragEndPersonalizado) onDragEndPersonalizado();
  hasDragged.current = false;

}}


        stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
        strokeWidth={isSelected || preSeleccionado ? 1 : 0}
      />;
      case "line":
        return (
          <Line
            {...propsForma}
            points={[0, 0, 100, 0]}
            onMouseEnter={() => onHover(obj.id)}
            onMouseLeave={() => onHover(null)}
            stroke={obj.color || "#000000"}
            strokeWidth={4}
            tension={0}
            lineCap="round"
            onDragMove={(e) => {
  const pos = e.target.getStage().getPointerPosition();

  // Detectamos si el usuario realmente arrastró (movió al menos 5px)
  if (!hasDragged.current && dragStartPos.current) {
    const dx = pos.x - dragStartPos.current.x;
    const dy = pos.y - dragStartPos.current.y;
    const distancia = Math.sqrt(dx * dx + dy * dy);
    if (distancia > 5) {
      hasDragged.current = true;
    }
  }

  // Ejecutamos la función personalizada si existe
  const node = e.target;
  const nuevaPos = node.position();
  if (onDragMovePersonalizado) {
    onDragMovePersonalizado(nuevaPos, obj.id);
  }
}}

          onDragEnd={(e) => {
  const node = e.target;
  onChange(obj.id, {
    x: node.x(),
    y: node.y(),
    scaleX: node.scaleX(),
    scaleY: node.scaleY(),
    rotation: node.rotation(),
  });
  if (onDragEndPersonalizado) onDragEndPersonalizado();
  hasDragged.current = false;

}}
          
          />
        );
      case "triangle":
        return (
          <RegularPolygon
            {...propsForma}
            sides={3}
            radius={60}
            rotation={180}
            onMouseEnter={() => onHover(obj.id)}
           onMouseLeave={() => onHover(null)}
            onDragMove={(e) => {
  const pos = e.target.getStage().getPointerPosition();

  // Detectamos si el usuario realmente arrastró (movió al menos 5px)
  if (!hasDragged.current && dragStartPos.current) {
    const dx = pos.x - dragStartPos.current.x;
    const dy = pos.y - dragStartPos.current.y;
    const distancia = Math.sqrt(dx * dx + dy * dy);
    if (distancia > 5) {
      hasDragged.current = true;
    }
  }

  // Ejecutamos la función personalizada si existe
  const node = e.target;
  const nuevaPos = node.position();
  if (onDragMovePersonalizado) {
    onDragMovePersonalizado(nuevaPos, obj.id);
  }
}}

            onDragEnd={(e) => {
  const node = e.target;
  onChange(obj.id, {
    x: node.x(),
    y: node.y(),
    scaleX: node.scaleX(),
    scaleY: node.scaleY(),
    rotation: node.rotation(),
  });
  if (onDragEndPersonalizado) onDragEndPersonalizado();
  hasDragged.current = false;

}}



            stroke={isSelected || preSeleccionado ? "#773dbe" : undefined}
      strokeWidth={isSelected || preSeleccionado ? 1 : 0}
          />
        );
      default:
        return null;
    }
  }}