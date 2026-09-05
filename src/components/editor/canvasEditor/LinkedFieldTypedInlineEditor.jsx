import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getInlineKonvaProjectedRectViewport } from "@/components/editor/overlays/inlineGeometry";

const CONTROL_WIDTH_PX = 224;
const VIEWPORT_GUTTER_PX = 12;
const TARGET_GAP_PX = 8;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function LinkedFieldTypedInlineEditor({
  editing,
  node,
  scaleVisual = 1,
  onChange,
  onRequestFinish,
}) {
  const inputRef = useRef(null);
  const [position, setPosition] = useState(null);
  const descriptor = editing?.linkedField || null;
  const inputType = descriptor?.controlKind || "text";
  const positionReady = Boolean(position);

  const syncPosition = useCallback(() => {
    const stage = node?.getStage?.() || null;
    const projection = getInlineKonvaProjectedRectViewport(
      node,
      stage,
      scaleVisual
    );
    const rect = projection?.konvaProjectedRectViewport || null;
    if (!rect || typeof window === "undefined") {
      setPosition(null);
      return;
    }

    const width = Math.min(
      CONTROL_WIDTH_PX,
      Math.max(160, window.innerWidth - VIEWPORT_GUTTER_PX * 2)
    );
    const estimatedHeight = 70;
    const preferredTop = rect.y + rect.height + TARGET_GAP_PX;
    const top =
      preferredTop + estimatedHeight <= window.innerHeight - VIEWPORT_GUTTER_PX
        ? preferredTop
        : Math.max(VIEWPORT_GUTTER_PX, rect.y - estimatedHeight - TARGET_GAP_PX);
    setPosition({
      left: clamp(
        rect.x,
        VIEWPORT_GUTTER_PX,
        Math.max(VIEWPORT_GUTTER_PX, window.innerWidth - width - VIEWPORT_GUTTER_PX)
      ),
      top,
      width,
    });
  }, [node, scaleVisual]);

  useLayoutEffect(() => {
    syncPosition();
  }, [editing?.id, syncPosition]);

  useLayoutEffect(() => {
    if (!positionReady) return;
    const input = inputRef.current;
    if (!input) return;
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
  }, [editing?.id, inputType, positionReady]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let animationFrame = 0;
    const schedulePositionSync = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        syncPosition();
      });
    };
    window.addEventListener("resize", schedulePositionSync);
    window.addEventListener("scroll", schedulePositionSync, true);
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", schedulePositionSync);
      window.removeEventListener("scroll", schedulePositionSync, true);
    };
  }, [syncPosition]);

  if (!descriptor || !position) return null;

  return (
    <div
      data-inline-editor="true"
      data-preserve-inline-edit="true"
      data-preserve-canvas-selection="true"
      data-inline-editor-id={editing.id}
      data-inline-editor-visual-ready="true"
      className="fixed z-[160] rounded-xl border border-[#d7c4f3] bg-white p-2 shadow-xl"
      style={position}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <label
        htmlFor={`linked-inline-${editing.id}`}
        className="mb-1 block truncate text-xs font-semibold text-[#654d78]"
      >
        {descriptor.label || "Dato del evento"}
      </label>
      <input
        ref={inputRef}
        id={`linked-inline-${editing.id}`}
        data-inline-editor-content="true"
        type={inputType}
        step={inputType === "time" || inputType === "datetime-local" ? 60 : undefined}
        value={String(editing.value ?? "")}
        onChange={(event) => onChange?.(event.target.value)}
        onBlur={() => onRequestFinish?.("blur")}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            onRequestFinish?.("escape");
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            onRequestFinish?.("enter");
            return;
          }
          if (event.key === "Tab") {
            event.preventDefault();
            onRequestFinish?.("tab");
          }
        }}
        aria-label={descriptor.label || "Dato del evento"}
        className="h-10 w-full rounded-lg border border-[#bca5dc] bg-white px-3 text-sm text-[#352442] outline-none focus:border-[#773dbe] focus:ring-2 focus:ring-[#d9c3f3]"
      />
    </div>
  );
}
