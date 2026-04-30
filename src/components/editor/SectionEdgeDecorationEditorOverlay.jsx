import { useEffect, useMemo, useRef } from "react";
import { Group, Rect, Text, Image as KonvaImage } from "react-konva";
import {
  normalizeSectionBackgroundModel,
  resolveEdgeDecorationCanvasRenderBox,
} from "@/domain/sections/backgrounds";
import useSharedImage from "@/hooks/useSharedImage";

const CANVAS_WIDTH = 800;
const EDGE_OFFSET_LIMIT = 240;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeSlot(slot) {
  return slot === "bottom" ? "bottom" : slot === "top" ? "top" : null;
}

function resolveYFromOffset(slot, offsetY, alturaPx, imageHeight, offsetPx) {
  if (slot === "bottom") {
    return offsetY + alturaPx - imageHeight - offsetPx;
  }
  return offsetY + offsetPx;
}

function resolveOffsetFromY(slot, y, offsetY, alturaPx, imageHeight) {
  if (slot === "bottom") {
    return offsetY + alturaPx - imageHeight - y;
  }
  return y - offsetY;
}

function roundOffset(value) {
  return Math.round(value * 100) / 100;
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function cancelCanvasEvent(event) {
  if (!event) return;
  event.cancelBubble = true;
  if (event.evt) {
    event.evt.cancelBubble = true;
  }
}

export default function SectionEdgeDecorationEditorOverlay({
  seccion,
  slot,
  offsetY,
  alturaPx,
  isMobile = false,
  onCommitOffset,
  onImageReadyChange,
  onExit,
}) {
  const imageRef = useRef(null);
  const imageReadyChangeRef = useRef(onImageReadyChange);
  const safeSlot = normalizeSlot(slot);
  const backgroundModel = normalizeSectionBackgroundModel(seccion, {
    sectionHeight: alturaPx,
  });
  const decoration = safeSlot ? backgroundModel.decoracionesBorde?.[safeSlot] : null;
  const [image] = useSharedImage(decoration?.src || null, "anonymous");
  const renderBox = useMemo(
    () =>
      resolveEdgeDecorationCanvasRenderBox(decoration, {
        slot: safeSlot,
        image,
        sectionHeight: alturaPx,
        canvasWidth: CANVAS_WIDTH,
      }),
    [alturaPx, decoration, image, safeSlot]
  );
  const shouldClipToBand = decoration?.mode === "contain-x";
  const bandHeight = renderBox.bandHeight;
  const currentOffset = Number.isFinite(Number(decoration?.offsetDesktopPx))
    ? Number(decoration.offsetDesktopPx)
    : 0;
  const currentY = safeSlot
    ? resolveYFromOffset(safeSlot, offsetY, alturaPx, bandHeight, currentOffset)
    : offsetY;
  const label =
    safeSlot === "bottom"
      ? "Ajustando decoración abajo"
      : "Ajustando decoración arriba";

  const handleExitInteraction = (event) => {
    cancelCanvasEvent(event);
    onExit?.();
  };

  const dragBoundFunc = useMemo(
    () => (pos) => {
      if (!safeSlot) {
        return {
          x: 0,
          y: offsetY,
        };
      }

      const rawOffset = resolveOffsetFromY(
        safeSlot,
        toFiniteNumber(pos?.y, offsetY),
        offsetY,
        alturaPx,
        bandHeight
      );
      const nextOffset = clamp(rawOffset, -EDGE_OFFSET_LIMIT, EDGE_OFFSET_LIMIT);

      return {
        x: 0,
        y: resolveYFromOffset(safeSlot, offsetY, alturaPx, bandHeight, nextOffset),
      };
    },
    [alturaPx, bandHeight, offsetY, safeSlot]
  );

  useEffect(() => {
    imageReadyChangeRef.current = onImageReadyChange;
  }, [onImageReadyChange]);

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

  if (!safeSlot || !decoration?.src || decoration.enabled === false || !image) return null;

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

        <Group
          ref={imageRef}
          x={0}
          y={currentY}
          {...(shouldClipToBand
            ? {
                clipX: 0,
                clipY: 0,
                clipWidth: renderBox.bandWidth,
                clipHeight: renderBox.bandHeight,
              }
            : {})}
          draggable
          dragBoundFunc={dragBoundFunc}
          opacity={0.96}
          onClick={cancelCanvasEvent}
          onTap={cancelCanvasEvent}
          onMouseDown={cancelCanvasEvent}
          onTouchStart={cancelCanvasEvent}
          onPointerDown={cancelCanvasEvent}
          onDragStart={cancelCanvasEvent}
          onDragMove={cancelCanvasEvent}
          onDragEnd={(event) => {
            cancelCanvasEvent(event);
            const node = event?.target || imageRef.current;
            if (!node || !safeSlot) return;

            const nextOffset = roundOffset(
              clamp(
                resolveOffsetFromY(
                  safeSlot,
                  toFiniteNumber(node.y(), offsetY),
                  offsetY,
                  alturaPx,
                  bandHeight
                ),
                -EDGE_OFFSET_LIMIT,
                EDGE_OFFSET_LIMIT
              )
            );

            node.position({
              x: 0,
              y: resolveYFromOffset(
                safeSlot,
                offsetY,
                alturaPx,
                bandHeight,
                nextOffset
              ),
            });
            onCommitOffset?.(nextOffset);
          }}
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
            shadowColor="rgba(119, 61, 190, 0.34)"
            shadowBlur={12}
          />
        </Group>
      </Group>

      <Group x={14} y={offsetY + 14} listening={false}>
        <Rect
          width={isMobile ? 250 : 236}
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
    </Group>
  );
}
