import { useState, useRef, useEffect } from "react";
import { Group, Rect, Transformer, Image as KonvaImage } from "react-konva";
import useImage from "use-image";

export default function FondoSeccion({
  seccion,
  offsetY,
  alturaPx,
  onSelect,
  onUpdateFondoOffset,
  isMobile = false,
  mobileBackgroundEditEnabled = false,
  onBackgroundImageStatusChange,
}) {
  const [fondoImage, fondoImageStatus] = useImage(seccion.fondoImagen, "anonymous");
  const [modoMoverFondo, setModoMoverFondo] = useState(false);
  const imagenRef = useRef(null);

  const allowBackgroundEdit = !isMobile || mobileBackgroundEditEnabled;
  const transformerAnchorSize = isMobile ? 24 : 14;
  const transformerPadding = isMobile ? 10 : 4;
  const transformerBorderStrokeWidth = isMobile ? 1.5 : 1;
  const transformerAnchorStrokeWidth = isMobile ? 2.5 : 2;

  useEffect(() => {
    if (typeof onBackgroundImageStatusChange !== "function") return;

    const hasBackgroundImage =
      typeof seccion?.fondoImagen === "string" && seccion.fondoImagen.trim().length > 0;

    const status = !hasBackgroundImage
      ? "none"
      : fondoImageStatus === "loaded" || fondoImage
        ? "loaded"
        : fondoImageStatus === "failed"
          ? "failed"
          : "loading";

    onBackgroundImageStatusChange({
      sectionId: seccion.id,
      imageUrl: hasBackgroundImage ? seccion.fondoImagen : "",
      hasBackgroundImage,
      status,
    });
  }, [
    fondoImage,
    fondoImageStatus,
    onBackgroundImageStatusChange,
    seccion?.fondoImagen,
    seccion?.id,
  ]);

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
    window.addEventListener("touchstart", handleClickGlobal, { passive: true });
    return () => {
      window.removeEventListener("mousedown", handleClickGlobal);
      window.removeEventListener("touchstart", handleClickGlobal);
    };
  }, [modoMoverFondo]);

  useEffect(() => {
    const onActivate = (e) => {
      if (e?.detail?.sectionId !== seccion.id) return;
      setModoMoverFondo(true);
      try {
        document.body.style.cursor = "move";
      } catch {}
    };

    const onExit = (e) => {
      const targetSectionId = e?.detail?.sectionId;
      if (targetSectionId && targetSectionId !== seccion.id) return;
      setModoMoverFondo(false);
      try {
        document.body.style.cursor = "default";
      } catch {}
    };

    window.addEventListener("activar-modo-mover-fondo", onActivate);
    window.addEventListener("salir-modo-mover-fondo", onExit);
    return () => {
      window.removeEventListener("activar-modo-mover-fondo", onActivate);
      window.removeEventListener("salir-modo-mover-fondo", onExit);
    };
  }, [seccion.id]);

  useEffect(() => {
    if (allowBackgroundEdit) return;
    if (!modoMoverFondo) return;
    setModoMoverFondo(false);
  }, [allowBackgroundEdit, modoMoverFondo]);

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
        preventDefault={false}
        onClick={onSelect}
        onTap={onSelect}
      />
    );
  }

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
    <Group id={seccion.id}>
      <Rect
        id={seccion.id}
        x={0}
        y={offsetY}
        width={800}
        height={alturaPx}
        fill={seccion.fondo || "#f0f0f0"}
        listening={true}
        preventDefault={false}
        onClick={onSelect}
        onTap={onSelect}
      />

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
          draggable={allowBackgroundEdit && modoMoverFondo}
          opacity={modoMoverFondo ? 0.9 : 1}
          shadowColor={modoMoverFondo ? "#773dbe" : "transparent"}
          shadowBlur={modoMoverFondo ? 10 : 0}
          listening={true}
          preventDefault={allowBackgroundEdit && modoMoverFondo}
          onClick={(e) => {
            if (modoMoverFondo) {
              e.cancelBubble = true;
              return;
            }
            onSelect?.();
          }}
          onTap={(e) => {
            if (modoMoverFondo) {
              e.cancelBubble = true;
            }
          }}
          onMouseDown={(e) => {
            if (modoMoverFondo) e.cancelBubble = true;
          }}
          onDblClick={allowBackgroundEdit ? (e) => {
            e.cancelBubble = true;
            setModoMoverFondo(true);
            document.body.style.cursor = "move";
          } : undefined}
          onDblTap={allowBackgroundEdit ? (e) => {
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

        {allowBackgroundEdit && modoMoverFondo && (
          <Transformer
            nodes={[imagenRef.current]}
            enabledAnchors={["bottom-right"]}
            borderStroke="#773dbe"
            borderStrokeWidth={transformerBorderStrokeWidth}
            padding={transformerPadding}
            anchorFill="#773dbe"
            anchorStroke="#ffffff"
            anchorStrokeWidth={transformerAnchorStrokeWidth}
            anchorSize={transformerAnchorSize}
            anchorCornerRadius={999}
            keepRatio={true}
            onTransform={() => {
              const node = imagenRef.current;
              if (!node) return;
              const sx = node.scaleX();
              const sy = node.scaleY();
              node.width(node.width() * sx);
              node.height(node.height() * sy);
              node.scaleX(1);
              node.scaleY(1);
            }}
            onTransformEnd={() => {
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
