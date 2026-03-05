import { useEffect } from "react";

export default function useCanvasEditorOptionPanelOutsideClose({
  logOptionButtonMenuDebug,
  setMostrarPanelZ,
}) {
  useEffect(() => {
    const describeTarget = (target) => {
      if (target === window) return "window";
      if (target === document) return "document";
      if (!(target instanceof Element)) return "unknown";
      const tag = String(target.tagName || "").toLowerCase();
      const id = target.id ? `#${target.id}` : "";
      const classes = target.classList?.length
        ? `.${Array.from(target.classList).slice(0, 2).join(".")}`
        : "";
      return `${tag}${id}${classes}` || "element";
    };

    const isInsideFloatingUi = (target) => {
      if (!(target instanceof Element)) return false;
      return Boolean(
        target.closest(".menu-z-index") ||
          target.closest('[data-option-button="true"]')
      );
    };

    const handlePointerOutside = (event) => {
      const insideFloatingUi = isInsideFloatingUi(event.target);
      if (insideFloatingUi) {
        logOptionButtonMenuDebug("outside-ignore", {
          source: "global-pointerdown",
          target: describeTarget(event.target),
          eventType: event.type,
          pointerType: event.pointerType ?? null,
        });
        return;
      }

      setMostrarPanelZ((prev) => {
        if (!prev) return prev;
        logOptionButtonMenuDebug("outside-close", {
          source: "global-pointerdown",
          target: describeTarget(event.target),
          eventType: event.type,
          pointerType: event.pointerType ?? null,
          prev,
          next: false,
        });
        return false;
      });
    };

    if (typeof window !== "undefined" && "PointerEvent" in window) {
      document.addEventListener("pointerdown", handlePointerOutside, true);
      return () => {
        document.removeEventListener("pointerdown", handlePointerOutside, true);
      };
    }

    document.addEventListener("mousedown", handlePointerOutside, true);
    document.addEventListener("touchstart", handlePointerOutside, {
      capture: true,
      passive: true,
    });

    return () => {
      document.removeEventListener("mousedown", handlePointerOutside, true);
      document.removeEventListener("touchstart", handlePointerOutside, true);
    };
  }, [logOptionButtonMenuDebug, setMostrarPanelZ]);
}
