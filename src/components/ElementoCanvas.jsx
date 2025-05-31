import { Text, Image as KonvaImage } from "react-konva";
import { Rect, Circle, Line } from "react-konva";
import useImage from "use-image";

export default function ElementoCanvas({ obj, isSelected, onSelect, onChange, registerRef }) {
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
      />
    );
  }

  if (obj.tipo === "forma") {
    switch (obj.figura) {
      case "rect":
        return (
          <Rect
            {...commonProps}
            width={obj.width || 100}
            height={obj.height || 100}
            fill={obj.color || "purple"}
          />
        );
      case "circle":
        return (
          <Circle
            {...commonProps}
            radius={obj.radius || 50}
            fill={obj.color || "purple"}
          />
        );
      case "line":
        return (
          <Line
            {...commonProps}
            points={obj.points || [0, 0, 100, 0]}
            stroke={obj.color || "purple"}
            strokeWidth={obj.strokeWidth || 4}
          />
        );
      default:
        return null;
    }
  }

  return null;
}
