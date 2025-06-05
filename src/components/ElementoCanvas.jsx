import { Text, Image as KonvaImage } from "react-konva";
import { Rect, Circle, Line, RegularPolygon, Path } from "react-konva";
import useImage from "use-image";


export default function ElementoCanvas({ obj, isSelected, onSelect, onChange, registerRef, onDragMovePersonalizado, onDragEndPersonalizado, }) {
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
    draggable: true,
    onClick: () => onSelect(obj.id),
    onTap: () => onSelect(obj.id),
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
    ref: handleRef,
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
        textDecoration={obj.textDecoration || "none"}
        fill={obj.color || "#000"}
        onDblClick={() => onSelect(obj.id, obj)}
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
              const node = e.target;
              const pos = node.position();
              if (onDragMovePersonalizado) {
                onDragMovePersonalizado(pos, obj.id);
              }
            }}
            onDragEnd={() => {
              if (onDragEndPersonalizado) {
                onDragEndPersonalizado();
              }
            }}
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
          onDragMove={(e) => {
              const node = e.target;
              const pos = node.position();
              if (onDragMovePersonalizado) {
                onDragMovePersonalizado(pos, obj.id);
              }
            }}
            onDragEnd={() => {
              if (onDragEndPersonalizado) {
                onDragEndPersonalizado();
              }
            }}
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
        onDragMove={(e) => {
              const node = e.target;
              const pos = node.position();
              if (onDragMovePersonalizado) {
                onDragMovePersonalizado(pos, obj.id);
              }
            }}
            onDragEnd={() => {
              if (onDragEndPersonalizado) {
                onDragEndPersonalizado();
              }
            }}
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
                onDragMove={(e) => {
                  const pos = e.target.position();
                  if (onDragMovePersonalizado) {
                    onDragMovePersonalizado(pos, obj.id);
                  }
                }}
                onDragEnd={() => {
                  if (onDragEndPersonalizado) {
                    onDragEndPersonalizado();
                  }
                }}
              />;
      case "circle":
        return <Circle
         {...propsForma}
         radius={50}
         onDragMove={(e) => {
          const pos = e.target.position();
          if (onDragMovePersonalizado) {
            onDragMovePersonalizado(pos, obj.id);
          }
        }}
        onDragEnd={() => {
          if (onDragEndPersonalizado) {
            onDragEndPersonalizado();
          }
        }} />;
      case "line":
        return (
          <Line
            {...propsForma}
            points={[0, 0, 100, 0]}
            stroke={obj.color || "#000000"}
            strokeWidth={4}
            tension={0}
            lineCap="round"
            onDragMove={(e) => {
            const pos = e.target.position();
            if (onDragMovePersonalizado) {
              onDragMovePersonalizado(pos, obj.id);
            }
          }}
          onDragEnd={() => {
            if (onDragEndPersonalizado) {
              onDragEndPersonalizado();
            }
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
            onDragMove={(e) => {
              const pos = e.target.position();
              if (onDragMovePersonalizado) {
                onDragMovePersonalizado(pos, obj.id);
              }
            }}
            onDragEnd={() => {
              if (onDragEndPersonalizado) {
                onDragEndPersonalizado();
              }
            }}
          />
        );
      default:
        return null;
    }
  }}