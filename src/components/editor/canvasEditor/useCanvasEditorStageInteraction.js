import { useEffect } from "react";
import Konva from "konva";

export default function useCanvasEditorStageInteraction({
  stageRef,
  isMobile,
}) {
  useEffect(() => {
    const stage = stageRef.current?.getStage?.();
    if (!stage) return;

    const content = stage.content;
    if (!content) return;

    const setScrollMode = () => {
      content.style.touchAction = "pan-y";
    };

    const setEditMode = () => {
      content.style.touchAction = "none";
    };

    const stopDragging = () => {
      setScrollMode();
    };

    setScrollMode();
    content.style.WebkitUserSelect = "none";
    content.style.WebkitTouchCallout = "none";

    stage.on("dragstart", setEditMode);
    stage.on("dragend", setScrollMode);

    stage.on("touchend", stopDragging);
    stage.on("pointerup", stopDragging);
    stage.on("mouseup", stopDragging);
    stage.on("touchcancel", stopDragging);

    return () => {
      stage.off("dragstart", setEditMode);
      stage.off("dragend", setScrollMode);

      stage.off("touchend", stopDragging);
      stage.off("pointerup", stopDragging);
      stage.off("mouseup", stopDragging);
      stage.off("touchcancel", stopDragging);
    };
  }, [stageRef]);

  useEffect(() => {
    const stage = stageRef.current?.getStage?.() || stageRef.current;
    const content = stage?.content || stage?.container?.();
    if (!content) return;

    const setDragDistanceForInput = (pointerType) => {
      const isTouchLike =
        pointerType === "touch" ||
        pointerType === "pen" ||
        (typeof pointerType !== "string" && isMobile);
      Konva.dragDistance = isTouchLike ? 14 : 5;
    };

    const onPointerDown = (event) => setDragDistanceForInput(event.pointerType);
    const onTouchStart = () => setDragDistanceForInput("touch");
    const onMouseDown = () => setDragDistanceForInput("mouse");

    setDragDistanceForInput(isMobile ? "touch" : "mouse");

    content.addEventListener("pointerdown", onPointerDown, { passive: true });
    content.addEventListener("touchstart", onTouchStart, { passive: true });
    content.addEventListener("mousedown", onMouseDown, { passive: true });

    return () => {
      content.removeEventListener("pointerdown", onPointerDown);
      content.removeEventListener("touchstart", onTouchStart);
      content.removeEventListener("mousedown", onMouseDown);
    };
  }, [isMobile, stageRef]);
}
