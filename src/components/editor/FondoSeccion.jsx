import { useEffect, useMemo, useRef } from "react";
import { Group, Rect, Transformer, Image as KonvaImage } from "react-konva";
import { resolveKonvaFill } from "@/domain/colors/presets";
import {
  buildSectionBaseImagePatchFromRenderBox,
  normalizeSectionBackgroundModel,
  resolveEdgeDecorationCanvasRenderBox,
  resolveSectionBaseImageLayout,
} from "@/domain/sections/backgrounds";
import useSharedImage from "@/hooks/useSharedImage";

function SectionDecorationImage({
  sectionId,
  decoration,
  offsetY,
  hidden = false,
  onBackgroundImageStatusChange,
  onSelect,
  onRequestEdit,
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

  const handleRequestEdit = (event) => {
    event.cancelBubble = true;
    onRequestEdit?.(sectionId, decorationId);
  };

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
      listening={!hidden}
      opacity={hidden ? 0 : 1}
      onClick={() => {
        onSelect?.();
      }}
      onTap={() => {
        onSelect?.();
      }}
      onDblClick={typeof onRequestEdit === "function" ? handleRequestEdit : undefined}
      onDblTap={typeof onRequestEdit === "function" ? handleRequestEdit : undefined}
    />
  );
}

function SectionEdgeDecorationImage({
  sectionId,
  slot,
  decoration,
  offsetY,
  alturaPx,
  hidden = false,
  onBackgroundImageStatusChange,
  onSelect,
  onRequestEdit,
}) {
  const src = typeof decoration?.src === "string" ? decoration.src : "";
  const [image, imageStatus] = useSharedImage(src || null, "anonymous");
  const renderBox = resolveEdgeDecorationCanvasRenderBox(decoration, {
    slot,
    image,
    sectionHeight: alturaPx,
    canvasWidth: 800,
  });
  const shouldClipToBand = decoration?.mode === "contain-x";
  const offsetPx = Number.isFinite(Number(decoration?.offsetDesktopPx))
    ? Number(decoration.offsetDesktopPx)
    : 0;
  const y =
    slot === "bottom"
      ? offsetY + alturaPx - renderBox.bandHeight - offsetPx
      : offsetY + offsetPx;

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
      assetKey: `${sectionId}:borde:${slot}`,
      sectionId,
      kind: "edge-decoration",
      decorationId: slot,
      slot,
      imageUrl: src,
      hasBackgroundImage,
      status,
    });
  }, [image, imageStatus, onBackgroundImageStatusChange, sectionId, slot, src]);

  if (!src || !image || decoration?.enabled === false) return null;

  const handleRequestEdit = (event) => {
    event.cancelBubble = true;
    onRequestEdit?.(sectionId, slot);
  };

  return (
    <Group
      x={0}
      y={y}
      listening={!hidden && typeof onRequestEdit === "function"}
      opacity={hidden ? 0 : 1}
      {...(shouldClipToBand
        ? {
            clipX: 0,
            clipY: 0,
            clipWidth: renderBox.bandWidth,
            clipHeight: renderBox.bandHeight,
          }
        : {})}
      onClick={() => {
        onSelect?.();
      }}
      onTap={() => {
        onSelect?.();
      }}
      onDblClick={typeof onRequestEdit === "function" ? handleRequestEdit : undefined}
      onDblTap={typeof onRequestEdit === "function" ? handleRequestEdit : undefined}
    >
      <Rect
        x={0}
        y={0}
        width={renderBox.bandWidth}
        height={renderBox.bandHeight}
        fill="rgba(255,255,255,0.001)"
      />
      <KonvaImage
        image={image}
        x={renderBox.imageX}
        y={renderBox.imageY}
        width={renderBox.imageWidth}
        height={renderBox.imageHeight}
      />
    </Group>
  );
}

function updateBodyCursor(nextCursor) {
  try {
    document.body.style.cursor = nextCursor;
  } catch {
    // no-op
  }
}

export default function FondoSeccion({
  seccion,
  offsetY,
  alturaPx,
  onSelect,
  onUpdateFondoOffset,
  isMobile = false,
  isEditing = false,
  onRequestEdit,
  onBackgroundImageStatusChange,
  editingDecorationId = null,
  editingEdgeSlot = null,
  onRegisterBackgroundNode,
  onInteractionChange,
  onRequestDecorationEdit,
  onRequestEdgeDecorationEdit,
}) {
  const backgroundModel = normalizeSectionBackgroundModel(seccion, {
    sectionHeight: alturaPx,
  });
  const baseImageUrl = backgroundModel.base.fondoImagen;
  const [fondoImage, fondoImageStatus] = useSharedImage(baseImageUrl || null, "anonymous");
  const imagenRef = useRef(null);
  const transformerRef = useRef(null);
  const canvasWidth = 800;
  const canvasHeight = alturaPx;
  const transformerAnchorSize = isMobile ? 24 : 14;
  const transformerPadding = isMobile ? 10 : 4;
  const transformerBorderStrokeWidth = isMobile ? 1.5 : 1;
  const transformerAnchorStrokeWidth = isMobile ? 2.5 : 2;
  const hasBaseImage =
    backgroundModel.base.fondoTipo === "imagen" &&
    Boolean(baseImageUrl) &&
    Boolean(fondoImage);
  const fallbackFill = resolveKonvaFill(seccion.fondo, canvasWidth, alturaPx, "#f0f0f0");
  const baseImageLayout = useMemo(() => {
    if (!hasBaseImage) return null;

    return resolveSectionBaseImageLayout(seccion, {
      imageWidth: fondoImage.width,
      imageHeight: fondoImage.height,
      canvasWidth,
      sectionHeight: canvasHeight,
    });
  }, [canvasHeight, fondoImage, hasBaseImage, seccion]);

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
    if (typeof onRegisterBackgroundNode !== "function") return undefined;
    onRegisterBackgroundNode(seccion.id, hasBaseImage ? imagenRef.current : null);
    return () => {
      onRegisterBackgroundNode(seccion.id, null);
    };
  }, [hasBaseImage, onRegisterBackgroundNode, seccion.id]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const imageNode = imagenRef.current;
    if (!transformer) return;

    transformer.nodes(isEditing && imageNode ? [imageNode] : []);
    transformer.getLayer()?.batchDraw?.();
  }, [isEditing, hasBaseImage, baseImageLayout?.renderedWidth, baseImageLayout?.renderedHeight]);

  useEffect(() => {
    if (!isEditing) return undefined;
    updateBodyCursor("move");
    return () => {
      updateBodyCursor("default");
    };
  }, [isEditing]);

  const handleRequestEdit = (event) => {
    event.cancelBubble = true;
    onRequestEdit?.(seccion.id);
    updateBodyCursor("move");
  };

  const commitBackgroundTransform = (node, isPreview = false) => {
    if (!node || !fondoImage || !baseImageLayout) return;

    const patch = buildSectionBaseImagePatchFromRenderBox(seccion, {
      imageWidth: fondoImage.width,
      imageHeight: fondoImage.height,
      x: node.x(),
      y: node.y() - offsetY,
      width: node.width(),
      height: node.height(),
      canvasWidth,
      sectionHeight: canvasHeight,
    });

    onUpdateFondoOffset?.(seccion.id, patch, isPreview);
  };

  const minCoverWidth = hasBaseImage ? fondoImage.width * baseImageLayout.coverScale : 0;
  const minCoverHeight = hasBaseImage ? fondoImage.height * baseImageLayout.coverScale : 0;

  return (
    <Group id={seccion.id}>
      <Rect
        id={seccion.id}
        x={0}
        y={offsetY}
        width={canvasWidth}
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

      {hasBaseImage && isEditing ? (
        <Rect
          x={-200}
          y={offsetY - 200}
          width={1200}
          height={alturaPx + 400}
          fill="rgba(0,0,0,0.05)"
          listening={false}
        />
      ) : null}

      <Group
        clipX={isEditing ? undefined : 0}
        clipY={isEditing ? undefined : offsetY}
        clipWidth={isEditing ? undefined : canvasWidth}
        clipHeight={isEditing ? undefined : alturaPx}
      >
        {hasBaseImage && baseImageLayout ? (
          <KonvaImage
            ref={imagenRef}
            image={fondoImage}
            x={baseImageLayout.x}
            y={offsetY + baseImageLayout.y}
            width={baseImageLayout.renderedWidth}
            height={baseImageLayout.renderedHeight}
            draggable={isEditing}
            opacity={isEditing ? 0.9 : 1}
            shadowColor={isEditing ? "#773dbe" : "transparent"}
            shadowBlur={isEditing ? 10 : 0}
            listening={true}
            preventDefault={isEditing}
            onClick={(event) => {
              if (isEditing) {
                event.cancelBubble = true;
                return;
              }
              onSelect?.();
            }}
            onTap={(event) => {
              if (isEditing) {
                event.cancelBubble = true;
                return;
              }
              onSelect?.();
            }}
            onMouseDown={(event) => {
              if (isEditing) event.cancelBubble = true;
            }}
            onTouchStart={(event) => {
              if (isEditing) event.cancelBubble = true;
            }}
            onDblClick={typeof onRequestEdit === "function" ? handleRequestEdit : undefined}
            onDblTap={typeof onRequestEdit === "function" ? handleRequestEdit : undefined}
            onDragStart={(event) => {
              event.cancelBubble = true;
              onInteractionChange?.(true);
              updateBodyCursor("move");
            }}
            onDragMove={(event) => {
              event.cancelBubble = true;
              commitBackgroundTransform(event.target, true);
            }}
            onDragEnd={(event) => {
              event.cancelBubble = true;
              commitBackgroundTransform(event.target, false);
              onInteractionChange?.(false);
              updateBodyCursor("move");
            }}
          />
        ) : null}
      </Group>

      <Group clipX={0} clipY={offsetY} clipWidth={canvasWidth} clipHeight={alturaPx}>
        {["top", "bottom"].map((slot) => {
          const edgeDecoration = backgroundModel.decoracionesBorde?.[slot];
          if (!edgeDecoration?.src || edgeDecoration.enabled === false) return null;

          return (
            <SectionEdgeDecorationImage
              key={slot}
              sectionId={seccion.id}
              slot={slot}
              decoration={edgeDecoration}
              offsetY={offsetY}
              alturaPx={alturaPx}
              hidden={editingEdgeSlot === slot}
              onBackgroundImageStatusChange={onBackgroundImageStatusChange}
              onSelect={onSelect}
              onRequestEdit={onRequestEdgeDecorationEdit}
            />
          );
        })}

        {backgroundModel.decoraciones.map((decoration) => (
          <SectionDecorationImage
            key={decoration.id}
            sectionId={seccion.id}
            decoration={decoration}
            offsetY={offsetY}
            hidden={editingDecorationId === decoration.id}
            onBackgroundImageStatusChange={onBackgroundImageStatusChange}
            onSelect={onSelect}
            onRequestEdit={onRequestDecorationEdit}
          />
        ))}
      </Group>

      {isEditing && hasBaseImage ? (
        <Transformer
          ref={transformerRef}
          enabledAnchors={["bottom-right"]}
          rotateEnabled={false}
          flipEnabled={false}
          borderStroke="#773dbe"
          borderStrokeWidth={transformerBorderStrokeWidth}
          padding={transformerPadding}
          anchorFill="#773dbe"
          anchorStroke="#ffffff"
          anchorStrokeWidth={transformerAnchorStrokeWidth}
          anchorSize={transformerAnchorSize}
          anchorCornerRadius={999}
          keepRatio={true}
          boundBoxFunc={(oldBox, newBox) => {
            if (!minCoverWidth || !minCoverHeight) return oldBox;

            const nextScale = Math.max(
              1,
              Number(newBox?.width) / minCoverWidth || 1,
              Number(newBox?.height) / minCoverHeight || 1
            );

            return {
              ...newBox,
              width: minCoverWidth * nextScale,
              height: minCoverHeight * nextScale,
            };
          }}
          onTransformStart={() => {
            onInteractionChange?.(true);
          }}
          onTransform={() => {
            const node = imagenRef.current;
            if (!node) return;

            const scaleX = node.scaleX();
            const scaleY = node.scaleY();
            node.width(node.width() * scaleX);
            node.height(node.height() * scaleY);
            node.scaleX(1);
            node.scaleY(1);
          }}
          onTransformEnd={() => {
            const node = imagenRef.current;
            if (!node) return;

            commitBackgroundTransform(node, false);
            onInteractionChange?.(false);
            updateBodyCursor("move");
          }}
        />
      ) : null}
    </Group>
  );
}
