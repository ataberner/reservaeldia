import { useState, useRef, useEffect } from "react";
import { Group, Rect, Transformer, Image as KonvaImage } from "react-konva";
import useImage from "use-image";

export default function FondoSeccion({ seccion, offsetY, alturaPx, onSelect, onUpdateFondoOffset, isMobile = false }) {
  const [fondoImage] = useImage(seccion.fondoImagen, "anonymous");
  const [modoMoverFondo, setModoMoverFondo] = useState(false);
  const imagenRef = useRef(null);
  const allowBackgroundInteraction = !isMobile; // ✅ mobile: no capturar eventos

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
        listening={allowBackgroundInteraction}
        onClick={allowBackgroundInteraction ? onSelect : undefined}
        onTap={allowBackgroundInteraction ? onSelect : undefined}
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
        listening={allowBackgroundInteraction}
        onClick={allowBackgroundInteraction ? onSelect : undefined}
        onTap={allowBackgroundInteraction ? onSelect : undefined}
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
          draggable={allowBackgroundInteraction && modoMoverFondo}
          opacity={modoMoverFondo ? 0.9 : 1}
          shadowColor={modoMoverFondo ? "#773dbe" : "transparent"}
          shadowBlur={modoMoverFondo ? 10 : 0}
          listening={allowBackgroundInteraction} // ✅ en mobile NO escucha

          // ✅ NUEVO: la imagen tapa al Rect, así que el click simple debe seleccionar la sección
          onClick={allowBackgroundInteraction ? (e) => {
            // Si estoy ajustando el fondo, no quiero que un click seleccione sección accidentalmente
            if (modoMoverFondo) {
              e.cancelBubble = true;
              return;
            }
            onSelect?.();
          } : undefined}

          onTap={allowBackgroundInteraction ? (e) => {
            if (modoMoverFondo) {
              e.cancelBubble = true;
              return;
            }
            onSelect?.();
          } : undefined}

          onMouseDown={allowBackgroundInteraction ? (e) => {
            if (modoMoverFondo) e.cancelBubble = true;
          } : undefined}

          onDblClick={allowBackgroundInteraction ? (e) => {
            e.cancelBubble = true;
            setModoMoverFondo(true);
            document.body.style.cursor = "move";
          } : undefined}

          onDblTap={allowBackgroundInteraction ? (e) => {
            e.cancelBubble = true;
            setModoMoverFondo(true);
            document.body.style.cursor = "move";
          } : undefined}


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
        {allowBackgroundInteraction && modoMoverFondo && (
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
