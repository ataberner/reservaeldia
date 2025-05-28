// src/components/ElementoCanvas.jsx
import { Text, Image as KonvaImage } from "react-konva";
import useImage from "use-image";

export default function ElementoCanvas({ obj, anchoCanvas, isSelected, onSelect, onChange, registerRef }) {
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
      onChange(obj.id, {
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
      });
    },
    ref: handleRef,
  };

  if (obj.tipo === "texto") {
    return (
      <Text
  {...commonProps}
  text={obj.texto}
  width={obj.width || 800}
  fontSize={obj.fontSize}
  fontFamily={obj.fontFamily}
  fill={obj.color}
/>

    );
  }

  if (obj.tipo === "imagen" && img) {
    const isFondo = obj.esFondo;
    const width = isFondo ? anchoCanvas : obj.width;
    const height = isFondo ? (anchoCanvas * (img.height / img.width)) : obj.height;

    return (
      <KonvaImage
        {...commonProps}
        image={img}
        width={width}
        height={height}
      />
    );
  }

  return null;
}
