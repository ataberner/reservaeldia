import { useState, useRef, useEffect } from "react";
import { Group, Rect, Transformer, Image as KonvaImage } from "react-konva";
import useImage from "use-image";

export default function FondoSeccion({ seccion, offsetY, alturaPx, onSelect, onUpdateFondoOffset }) {
  const [fondoImage] = useImage(seccion.fondoImagen, "anonymous");
  const [modoMoverFondo, setModoMoverFondo] = useState(false);
  const imagenRef = useRef(null);

  // 🔹 Click global para salir del modo mover fondo
  useEffect(() => {
    if (!modoMoverFondo) return;

    const handleClickGlobal = (e) => {
      const stage = imagenRef.current?.getStage?.();
      if (!stage) return;
      const container = stage.container();
      if (!container.contains(e.target)) {
        setModoMoverFondo(false);
        document.body.style.cursor = "default";
      }
    };

    window.addEventListener("mousedown", handleClickGlobal);
    return () => window.removeEventListener("mousedown", handleClickGlobal);
  }, [modoMoverFondo]);

  if (!seccion.fondoImagen || !fondoImage) {
    return (
      <Rect
        id={seccion.id}
        x={0}
        y={offsetY}
        width={800}
        height={alturaPx}
        fill={seccion.fondo || "#f0f0f0"}
        listening={true}
        onClick={onSelect}
      />
    );
  }

  // 🎯 Dimensiones del canvas e imagen
  const canvasWidth = 800;
  const canvasHeight = alturaPx;
  const imageWidth = fondoImage.width;
  const imageHeight = fondoImage.height;

  const scaleX = canvasWidth / imageWidth;
  const scaleY = canvasHeight / imageHeight;
  const scale = Math.max(scaleX, scaleY);

  const scaledWidth = imageWidth * scale;
  const scaledHeight = imageHeight * scale;

  const offsetXCentrado = (canvasWidth - scaledWidth) / 2;
  const offsetYCentrado = (canvasHeight - scaledHeight) / 2;

  const offsetXFinal = offsetXCentrado + (seccion.fondoImagenOffsetX || 0);
  const offsetYFinal = offsetYCentrado + (seccion.fondoImagenOffsetY || 0);

  return (
    <Group>
      {/* Fondo base */}
      <Rect
        id={seccion.id}
        x={0}
        y={offsetY}
        width={800}
        height={alturaPx}
        fill={seccion.fondo || "#f0f0f0"}
        listening={true}
        onClick={onSelect}
      />

      {/* Sombreado en modo mover fondo */}
      {modoMoverFondo && (
        <Rect
          x={-200}
          y={offsetY - 200}
          width={1200}
          height={alturaPx + 400}
          fill="rgba(0,0,0,0.05)"
          listening={false}
        />
      )}

      {/* Imagen de fondo */}
      <Group
        clipX={modoMoverFondo ? undefined : 0}
        clipY={modoMoverFondo ? undefined : offsetY}
        clipWidth={modoMoverFondo ? undefined : 800}
        clipHeight={modoMoverFondo ? undefined : alturaPx}
      >
        <KonvaImage
  ref={imagenRef}
  image={fondoImage}
  x={offsetXFinal}
  y={offsetY + offsetYFinal}
  width={scaledWidth}
  height={scaledHeight}
  draggable={modoMoverFondo}
  opacity={modoMoverFondo ? 0.9 : 1}
  shadowColor={modoMoverFondo ? "#773dbe" : "transparent"}
  shadowBlur={modoMoverFondo ? 10 : 0}
  listening={true} // ✅ Siempre escucha

  // 🔹 Mousedown: solo bloquea si estamos moviendo el fondo
  onMouseDown={(e) => {
        console.log("🐛 MOUSEDOWN en imagen. modoMoverFondo:", modoMoverFondo, "cancelBubble?", e.cancelBubble);

    if (modoMoverFondo) {
      e.cancelBubble = true; // Bloquea drag del Stage
    } else {
      // Si no estamos moviendo, dejamos pasar el evento para selección múltiple
      // No cancelamos aquí
    }
  }}

  // 🔹 Doble click: activa modo mover y cancela propagación
  onDblClick={(e) => {
        console.log("🐛 DBLCLICK en imagen. modoMoverFondo:", modoMoverFondo);

     

    e.cancelBubble = true; // Evita que inicie selección múltiple
    setModoMoverFondo(true);
    document.body.style.cursor = "move";
  }}

  onDragMove={(e) => {
    const node = e.target;
    const nuevaX = node.x();
    const nuevaY = node.y() - offsetY;
    const nuevoOffsetX = nuevaX - offsetXCentrado;
    const nuevoOffsetY = nuevaY - offsetYCentrado;
    onUpdateFondoOffset?.(seccion.id, { offsetX: nuevoOffsetX, offsetY: nuevoOffsetY }, true);
  }}

  onDragEnd={(e) => {
    const node = e.target;
    const nuevaX = node.x();
    const nuevaY = node.y() - offsetY;
    const nuevoOffsetX = nuevaX - offsetXCentrado;
    const nuevoOffsetY = nuevaY - offsetYCentrado;
    onUpdateFondoOffset?.(seccion.id, { offsetX: nuevoOffsetX, offsetY: nuevoOffsetY }, false);

    setModoMoverFondo(false);
    document.body.style.cursor = "default";
  }}
/>


        {/* Transformer solo cuando está en modo mover */}
        {modoMoverFondo && (
          <Transformer
            nodes={[imagenRef.current]}
            enabledAnchors={['bottom-right']}
            borderStroke="#773dbe"
            anchorFill="#773dbe"
            anchorSize={12}
            keepRatio={true}
            onTransform={(e) => {
              const node = imagenRef.current;
              if (!node) return;
              const scaleX = node.scaleX();
              const scaleY = node.scaleY();
              node.width(node.width() * scaleX);
              node.height(node.height() * scaleY);
              node.scaleX(1);
              node.scaleY(1);
            }}
            onTransformEnd={(e) => {
              const node = imagenRef.current;
              if (!node) return;
              const nuevaX = node.x();
              const nuevaY = node.y() - offsetY;
              const nuevoOffsetX = nuevaX - offsetXCentrado;
              const nuevoOffsetY = nuevaY - offsetYCentrado;
              onUpdateFondoOffset?.(seccion.id, { offsetX: nuevoOffsetX, offsetY: nuevoOffsetY }, false);
            }}
          />
        )}
      </Group>
    </Group>
  );
}
