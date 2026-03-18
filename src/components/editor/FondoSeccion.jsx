import { useState, useRef, useEffect } from "react";
import { Group, Rect, Transformer, Image as KonvaImage } from "react-konva";
import { resolveKonvaFill } from "@/domain/colors/presets";
import { normalizeSectionBackgroundModel } from "@/domain/sections/backgrounds";
import useSharedImage from "@/hooks/useSharedImage";

function SectionDecorationImage({
  sectionId,
  decoration,
  offsetY,
  hidden = false,
  onBackgroundImageStatusChange,
}) {
  const src = typeof decoration?.src === "string" ? decoration.src : "";
  const decorationId = typeof decoration?.id === "string" ? decoration.id : "decoracion";
  const [image, imageStatus] = useSharedImage(src || null, "anonymous");
  const width = Math.max(1, Number(decoration?.width) || image?.width || 1);
  const height = Math.max(1, Number(decoration?.height) || image?.height || 1);
  const centerX = (Number(decoration?.x) || 0) + width / 2;
  const centerY = offsetY + (Number(decoration?.y) || 0) + height / 2;

  useEffect(() => {
    if (typeof onBackgroundImageStatusChange !== "function") return;

    const hasBackgroundImage = Boolean(src);
    const status = !hasBackgroundImage
      ? "none"
      : imageStatus === "loaded" || image
        ? "loaded"
        : imageStatus === "failed"
          ? "failed"
          : "loading";

    onBackgroundImageStatusChange({
      assetKey: `${sectionId}:decoracion:${decorationId}`,
      sectionId,
      kind: "background-decoration",
      decorationId,
      imageUrl: src,
      hasBackgroundImage,
      status,
    });
  }, [decorationId, image, imageStatus, onBackgroundImageStatusChange, sectionId, src]);

  if (!src || !image) return null;

  return (
    <KonvaImage
      image={image}
      x={centerX}
      y={centerY}
      width={width}
      height={height}
      offsetX={width / 2}
      offsetY={height / 2}
      rotation={Number(decoration?.rotation) || 0}
      listening={false}
      opacity={hidden ? 0 : 1}
    />
  );
}

export default function FondoSeccion({
  seccion,
  offsetY,
  alturaPx,
  onSelect,
  onUpdateFondoOffset,
  isMobile = false,
  mobileBackgroundEditEnabled = false,
  onBackgroundImageStatusChange,
  editingDecorationId = null,
}) {
  const backgroundModel = normalizeSectionBackgroundModel(seccion, {
    sectionHeight: alturaPx,
  });
  const baseImageUrl = backgroundModel.base.fondoImagen;
  const [fondoImage, fondoImageStatus] = useSharedImage(baseImageUrl || null, "anonymous");
  const [modoMoverFondo, setModoMoverFondo] = useState(false);
  const imagenRef = useRef(null);

  const allowBackgroundEdit = !isMobile || mobileBackgroundEditEnabled;
  const transformerAnchorSize = isMobile ? 24 : 14;
  const transformerPadding = isMobile ? 10 : 4;
  const transformerBorderStrokeWidth = isMobile ? 1.5 : 1;
  const transformerAnchorStrokeWidth = isMobile ? 2.5 : 2;
  const fallbackFill = resolveKonvaFill(seccion.fondo, 800, alturaPx, "#f0f0f0");

  useEffect(() => {
    if (typeof onBackgroundImageStatusChange !== "function") return;

    const hasBackgroundImage =
      backgroundModel.base.fondoTipo === "imagen" &&
      typeof baseImageUrl === "string" &&
      baseImageUrl.trim().length > 0;

    const status = !hasBackgroundImage
      ? "none"
      : fondoImageStatus === "loaded" || fondoImage
        ? "loaded"
        : fondoImageStatus === "failed"
          ? "failed"
          : "loading";

    onBackgroundImageStatusChange({
      assetKey: `${seccion.id}:base`,
      sectionId: seccion.id,
      kind: "base",
      decorationId: null,
      imageUrl: hasBackgroundImage ? baseImageUrl : "",
      hasBackgroundImage,
      status,
    });
  }, [
    backgroundModel.base.fondoTipo,
    baseImageUrl,
    fondoImage,
    fondoImageStatus,
    onBackgroundImageStatusChange,
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

  const canvasWidth = 800;
  const canvasHeight = alturaPx;
  const hasBaseImage = Boolean(baseImageUrl && fondoImage);
  const imageWidth = hasBaseImage ? fondoImage.width : 0;
  const imageHeight = hasBaseImage ? fondoImage.height : 0;
  const scaleX = hasBaseImage ? canvasWidth / imageWidth : 1;
  const scaleY = hasBaseImage ? canvasHeight / imageHeight : 1;
  const scale = hasBaseImage ? Math.max(scaleX, scaleY) : 1;

  const scaledWidth = hasBaseImage ? imageWidth * scale : 0;
  const scaledHeight = hasBaseImage ? imageHeight * scale : 0;

  const offsetXCentrado = hasBaseImage ? (canvasWidth - scaledWidth) / 2 : 0;
  const offsetYCentrado = hasBaseImage ? (canvasHeight - scaledHeight) / 2 : 0;

  const offsetXFinal = offsetXCentrado + (backgroundModel.base.fondoImagenOffsetX || 0);
  const offsetYFinal = offsetYCentrado + (backgroundModel.base.fondoImagenOffsetY || 0);

  return (
    <Group id={seccion.id}>
      <Rect
        id={seccion.id}
        x={0}
        y={offsetY}
        width={800}
        height={alturaPx}
        fill={fallbackFill.fillColor}
        fillPriority={fallbackFill.hasGradient ? "linear-gradient" : "color"}
        fillLinearGradientStartPoint={fallbackFill.hasGradient ? fallbackFill.startPoint : undefined}
        fillLinearGradientEndPoint={fallbackFill.hasGradient ? fallbackFill.endPoint : undefined}
        fillLinearGradientColorStops={
          fallbackFill.hasGradient
            ? [0, fallbackFill.gradientFrom, 1, fallbackFill.gradientTo]
            : undefined
        }
        listening={true}
        preventDefault={false}
        onClick={onSelect}
        onTap={onSelect}
      />

      {hasBaseImage && modoMoverFondo && (
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
        {hasBaseImage ? (
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
        ) : null}
      </Group>

      <Group clipX={0} clipY={offsetY} clipWidth={800} clipHeight={alturaPx}>
        {backgroundModel.decoraciones.map((decoration) => (
          <SectionDecorationImage
            key={decoration.id}
            sectionId={seccion.id}
            decoration={decoration}
            offsetY={offsetY}
            hidden={editingDecorationId === decoration.id}
            onBackgroundImageStatusChange={onBackgroundImageStatusChange}
          />
        ))}
      </Group>

      {allowBackgroundEdit && modoMoverFondo && hasBaseImage && (
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
  );
}
