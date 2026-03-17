import { useEffect, useMemo, useRef } from "react";
import { Group, Rect, Text, Transformer, Image as KonvaImage } from "react-konva";
import useImage from "use-image";
import {
  clampBackgroundDecorationToBounds,
  findBackgroundDecoration,
} from "@/domain/sections/backgrounds";

const CANVAS_WIDTH = 800;
const MIN_DECORATION_SIZE = 32;
const MIN_VISIBLE_DECORATION_PORTION = 24;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeNodeScaleToSize(node) {
  if (!node) {
    return {
      width: MIN_DECORATION_SIZE,
      height: MIN_DECORATION_SIZE,
    };
  }

  const nextWidth = Math.max(
    MIN_DECORATION_SIZE,
    (Number(node.width()) || MIN_DECORATION_SIZE) * Math.abs(Number(node.scaleX()) || 1)
  );
  const nextHeight = Math.max(
    MIN_DECORATION_SIZE,
    (Number(node.height()) || MIN_DECORATION_SIZE) * Math.abs(Number(node.scaleY()) || 1)
  );

  node.width(nextWidth);
  node.height(nextHeight);
  node.scaleX(1);
  node.scaleY(1);
  node.offsetX(nextWidth / 2);
  node.offsetY(nextHeight / 2);

  return {
    width: nextWidth,
    height: nextHeight,
  };
}

function resolveRotatedBoundingSize(width, height, rotation) {
  const safeWidth = Math.max(MIN_DECORATION_SIZE, Number(width) || MIN_DECORATION_SIZE);
  const safeHeight = Math.max(MIN_DECORATION_SIZE, Number(height) || MIN_DECORATION_SIZE);
  const radians = (Math.PI / 180) * (Number(rotation) || 0);
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));

  return {
    width: safeWidth * cos + safeHeight * sin,
    height: safeWidth * sin + safeHeight * cos,
  };
}

function clampCenteredDecorationState(
  {
    centerX,
    centerY,
    width,
    height,
    rotation,
  },
  alturaPx,
  offsetY
) {
  const safeRotation = Number(rotation) || 0;
  const fittedSize = {
    width: Math.max(MIN_DECORATION_SIZE, Number(width) || MIN_DECORATION_SIZE),
    height: Math.max(MIN_DECORATION_SIZE, Number(height) || MIN_DECORATION_SIZE),
  };
  const bounding = resolveRotatedBoundingSize(
    fittedSize.width,
    fittedSize.height,
    safeRotation
  );
  const halfWidth = bounding.width / 2;
  const halfHeight = bounding.height / 2;

  const visiblePortionX = Math.min(MIN_VISIBLE_DECORATION_PORTION, bounding.width);
  const visiblePortionY = Math.min(MIN_VISIBLE_DECORATION_PORTION, bounding.height);
  const minCenterX = visiblePortionX - halfWidth;
  const maxCenterX = CANVAS_WIDTH - visiblePortionX + halfWidth;
  const minCenterY = offsetY + visiblePortionY - halfHeight;
  const maxCenterY = offsetY + alturaPx - visiblePortionY + halfHeight;

  const nextCenterX = clamp(Number(centerX) || 0, minCenterX, maxCenterX);
  const nextCenterY = clamp(Number(centerY) || offsetY, minCenterY, maxCenterY);

  return {
    centerX: nextCenterX,
    centerY: nextCenterY,
    width: fittedSize.width,
    height: fittedSize.height,
    rotation: Math.round(safeRotation * 100) / 100,
    x: Math.round(nextCenterX - fittedSize.width / 2),
    y: Math.round(nextCenterY - offsetY - fittedSize.height / 2),
  };
}

function commitDecorationNode(node, decoration, alturaPx, offsetY, onCommit) {
  if (!node || !decoration || typeof onCommit !== "function") return;

  const normalizedSize = normalizeNodeScaleToSize(node);
  const nextDecoration = clampCenteredDecorationState(
    {
      centerX: Number(node.x()) || 0,
      centerY: Number(node.y()) || offsetY,
      width: normalizedSize.width,
      height: normalizedSize.height,
      rotation: Number(node.rotation()) || 0,
    },
    alturaPx,
    offsetY
  );

  node.position({
    x: nextDecoration.centerX,
    y: nextDecoration.centerY,
  });
  node.width(nextDecoration.width);
  node.height(nextDecoration.height);
  node.offsetX(nextDecoration.width / 2);
  node.offsetY(nextDecoration.height / 2);
  node.rotation(nextDecoration.rotation);

  onCommit(
    clampBackgroundDecorationToBounds(
      {
        ...decoration,
        x: nextDecoration.x,
        y: nextDecoration.y,
        width: nextDecoration.width,
        height: nextDecoration.height,
        rotation: nextDecoration.rotation,
      },
      alturaPx,
      CANVAS_WIDTH
    )
  );
}

export default function SectionDecorationEditorOverlay({
  seccion,
  decorationId,
  offsetY,
  alturaPx,
  isMobile = false,
  onCommit,
  onImageReadyChange,
  onExit,
}) {
  const imageRef = useRef(null);
  const transformerRef = useRef(null);
  const imageReadyChangeRef = useRef(onImageReadyChange);
  const decoration = findBackgroundDecoration(seccion, decorationId, {
    sectionHeight: alturaPx,
  });
  const label = "Ajustando decoracion del fondo";
  const finishLabel = "Listo";
  const [image] = useImage(decoration?.src || null, "anonymous");

  const handleExitInteraction = (event) => {
    if (event) {
      event.cancelBubble = true;
      if (event.evt) {
        event.evt.cancelBubble = true;
      }
    }
    onExit?.();
  };

  const dragBoundFunc = useMemo(
    () => (pos) => {
      const node = imageRef.current;
      const width = Math.max(
        MIN_DECORATION_SIZE,
        Number(node?.width?.()) || Number(decoration?.width) || MIN_DECORATION_SIZE
      );
      const height = Math.max(
        MIN_DECORATION_SIZE,
        Number(node?.height?.()) || Number(decoration?.height) || MIN_DECORATION_SIZE
      );
      const clamped = clampCenteredDecorationState(
        {
          centerX: Number(pos?.x) || 0,
          centerY: Number(pos?.y) || offsetY,
          width,
          height,
          rotation: Number(node?.rotation?.()) || Number(decoration?.rotation) || 0,
        },
        alturaPx,
        offsetY
      );

      return {
        x: clamped.centerX,
        y: clamped.centerY,
      };
    },
    [alturaPx, decoration, offsetY]
  );

  useEffect(() => {
    imageReadyChangeRef.current = onImageReadyChange;
  }, [onImageReadyChange]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const node = imageRef.current;
    if (!transformer || !node || !image) return;
    transformer.nodes([node]);
    transformer.getLayer()?.batchDraw?.();
  }, [image]);

  useEffect(() => {
    if (typeof imageReadyChangeRef.current !== "function") return undefined;
    imageReadyChangeRef.current(Boolean(image));
    return () => {
      imageReadyChangeRef.current?.(false);
    };
  }, [image]);

  useEffect(() => {
    if (typeof onExit !== "function") return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onExit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onExit]);

  if (!decoration?.src || !image) return null;

  return (
    <Group name="ui">
      <Group clipX={0} clipY={offsetY} clipWidth={CANVAS_WIDTH} clipHeight={alturaPx}>
        <Rect
          x={0}
          y={offsetY}
          width={CANVAS_WIDTH}
          height={alturaPx}
          fill="rgba(255,255,255,0.001)"
          onMouseDown={handleExitInteraction}
          onTouchStart={handleExitInteraction}
          onClick={handleExitInteraction}
          onTap={handleExitInteraction}
        />

        <Rect
          x={0}
          y={offsetY}
          width={CANVAS_WIDTH}
          height={alturaPx}
          fill="rgba(119, 61, 190, 0.04)"
          stroke="rgba(119, 61, 190, 0.24)"
          dash={[10, 8]}
          listening={false}
        />

        <KonvaImage
          ref={imageRef}
          image={image}
          x={decoration.x + decoration.width / 2}
          y={offsetY + decoration.y + decoration.height / 2}
          width={decoration.width}
          height={decoration.height}
          offsetX={decoration.width / 2}
          offsetY={decoration.height / 2}
          rotation={decoration.rotation || 0}
          draggable
          dragBoundFunc={dragBoundFunc}
          shadowColor="rgba(119, 61, 190, 0.34)"
          shadowBlur={12}
          opacity={0.96}
          onClick={(event) => {
            event.cancelBubble = true;
          }}
          onTap={(event) => {
            event.cancelBubble = true;
          }}
          onMouseDown={(event) => {
            event.cancelBubble = true;
          }}
          onTouchStart={(event) => {
            event.cancelBubble = true;
          }}
          onPointerDown={(event) => {
            event.cancelBubble = true;
          }}
          onDragEnd={(event) => {
            event.cancelBubble = true;
            commitDecorationNode(event.target, decoration, alturaPx, offsetY, onCommit);
          }}
          onTransform={() => {
            const node = imageRef.current;
            if (!node) return;
            normalizeNodeScaleToSize(node);
            transformerRef.current?.forceUpdate?.();
          }}
          onTransformEnd={() => {
            commitDecorationNode(imageRef.current, decoration, alturaPx, offsetY, onCommit);
          }}
        />

        <Transformer
          ref={transformerRef}
          enabledAnchors={[
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
          ]}
          rotateEnabled
          keepRatio
          borderStroke="#773dbe"
          borderStrokeWidth={isMobile ? 2 : 1.5}
          padding={isMobile ? 12 : 8}
          anchorFill="#773dbe"
          anchorStroke="#ffffff"
          anchorStrokeWidth={2}
          anchorSize={isMobile ? 24 : 14}
          anchorCornerRadius={999}
          flipEnabled={false}
          boundBoxFunc={(oldBox, nextBox) => {
            const nextWidth = Math.abs(Number(nextBox.width) || 0);
            const nextHeight = Math.abs(Number(nextBox.height) || 0);
            if (nextWidth < MIN_DECORATION_SIZE || nextHeight < MIN_DECORATION_SIZE) {
              return oldBox;
            }
            return nextBox;
          }}
        />
      </Group>

      <Group x={14} y={offsetY + 14} listening={false}>
        <Rect
          width={220}
          height={30}
          fill="rgba(255,255,255,0.92)"
          stroke="rgba(119, 61, 190, 0.25)"
          cornerRadius={999}
          shadowColor="rgba(15,23,42,0.1)"
          shadowBlur={8}
        />
        <Text
          x={12}
          y={8}
          text={label}
          fontSize={12}
          fontStyle="bold"
          fill="#5f3596"
        />
      </Group>

      <Group
        x={CANVAS_WIDTH - 102}
        y={offsetY + 14}
        onMouseDown={handleExitInteraction}
        onTouchStart={handleExitInteraction}
        onClick={handleExitInteraction}
        onTap={handleExitInteraction}
      >
        <Rect
          width={88}
          height={30}
          fill="rgba(255,255,255,0.96)"
          stroke="rgba(119, 61, 190, 0.25)"
          cornerRadius={999}
          shadowColor="rgba(15,23,42,0.12)"
          shadowBlur={8}
        />
        <Text
          x={25}
          y={8}
          text={finishLabel}
          fontSize={12}
          fontStyle="bold"
          fill="#5f3596"
        />
      </Group>
    </Group>
  );
}
