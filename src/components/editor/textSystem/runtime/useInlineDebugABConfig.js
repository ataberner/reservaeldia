import { useEffect, useMemo } from "react";
import { normalizeInlineDebugAB } from "@/components/editor/canvasEditor/inlineSnapshotPrimitives";

export default function useInlineDebugABConfig({
  editingId,
  editingValue,
}) {
  const inlineDebugAB = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        ...normalizeInlineDebugAB(null),
        overlayEngine: "phase_atomic_v2",
      };
    }
    const normalized = normalizeInlineDebugAB(window.__INLINE_AB);
    return {
      ...normalized,
      overlayEngine: "phase_atomic_v2",
    };
  }, [editingId, editingValue]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__INLINE_OVERLAY_ENGINE = "phase_atomic_v2";
    window.__INLINE_AB = {
      ...(window.__INLINE_AB && typeof window.__INLINE_AB === "object"
        ? window.__INLINE_AB
        : {}),
      overlayEngine: "phase_atomic_v2",
    };
  }, [editingId, editingValue]);

  return {
    inlineDebugAB,
  };
}
