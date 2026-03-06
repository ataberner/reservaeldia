import { useState, useRef, useCallback, useEffect } from "react";

export default function useInlineViewportSyncRevision({
  isPhaseAtomicV2,
}) {
  const [viewportSyncRevision, setViewportSyncRevision] = useState(0);
  const viewportSyncRafRef = useRef(0);

  const scheduleViewportSync = useCallback(() => {
    if (viewportSyncRafRef.current) return;
    viewportSyncRafRef.current = window.requestAnimationFrame(() => {
      viewportSyncRafRef.current = 0;
      setViewportSyncRevision((prev) => prev + 1);
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onViewportChange = () => {
      scheduleViewportSync();
    };

    window.addEventListener("resize", onViewportChange);
    const vv = window.visualViewport || null;
    vv?.addEventListener("resize", onViewportChange);

    if (!isPhaseAtomicV2) {
      window.addEventListener("scroll", onViewportChange, true);
      vv?.addEventListener("scroll", onViewportChange);
    }

    return () => {
      window.removeEventListener("resize", onViewportChange);
      vv?.removeEventListener("resize", onViewportChange);
      if (!isPhaseAtomicV2) {
        window.removeEventListener("scroll", onViewportChange, true);
        vv?.removeEventListener("scroll", onViewportChange);
      }
      if (viewportSyncRafRef.current) {
        window.cancelAnimationFrame(viewportSyncRafRef.current);
        viewportSyncRafRef.current = 0;
      }
    };
  }, [isPhaseAtomicV2, scheduleViewportSync]);

  return {
    viewportSyncRevision,
  };
}
