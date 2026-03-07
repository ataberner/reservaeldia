import { useEffect, useMemo } from "react";
import { normalizeInlineDebugAB } from "@/components/editor/canvasEditor/inlineSnapshotPrimitives";

export default function useInlineDebugABConfig({
  editingId,
  editingValue,
}) {
  const inlineDebugAB = useMemo(() => {
    if (typeof window === "undefined") {
      return normalizeInlineDebugAB(null);
    }
    const normalized = normalizeInlineDebugAB(window.__INLINE_AB);
    try {
      const params = new URLSearchParams(window.location?.search || "");
      const queryEngine = params.get("inlineOverlayEngine");
      const hasPhaseAtomicFlag =
        params.has("phase_atomic_v2") ||
        params.get("phase_atomic_v2") === "1" ||
        window.__INLINE_OVERLAY_ENGINE === "phase_atomic_v2";
      if (queryEngine === "phase_atomic_v2" || hasPhaseAtomicFlag) {
        return {
          ...normalized,
          overlayEngine: "phase_atomic_v2",
        };
      }
    } catch {
      // no-op
    }
    return normalized;
  }, [editingId, editingValue]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location?.search || "");
      const queryEngine = params.get("inlineOverlayEngine");
      const hasPhaseAtomicFlag =
        queryEngine === "phase_atomic_v2" ||
        params.has("phase_atomic_v2") ||
        params.get("phase_atomic_v2") === "1";
      if (!hasPhaseAtomicFlag) return;
      window.__INLINE_OVERLAY_ENGINE = "phase_atomic_v2";
      window.__INLINE_AB = {
        ...(window.__INLINE_AB && typeof window.__INLINE_AB === "object"
          ? window.__INLINE_AB
          : {}),
        overlayEngine: "phase_atomic_v2",
      };
    } catch {
      // no-op
    }
  }, [editingId, editingValue]);

  return {
    inlineDebugAB,
  };
}
