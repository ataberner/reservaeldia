import { useCallback, useRef } from "react";
import { EDITOR_BRIDGE_EVENTS } from "@/lib/editorBridgeContracts";

export default function useCanvasEditorPersistenceBridge() {
  const persistenceBridgeRef = useRef(null);

  const registerPersistenceBridge = useCallback((bridge) => {
    persistenceBridgeRef.current =
      bridge && typeof bridge === "object" ? bridge : null;
  }, []);

  const flushEditorPersistence = useCallback((options = {}) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(EDITOR_BRIDGE_EVENTS.DRAFT_FLUSH_REQUEST, {
          detail: {
            prepareOnly: true,
            reason: options?.reason || "direct-bridge-flush",
          },
        })
      );
    }
    const flushNow = persistenceBridgeRef.current?.flushNow;
    if (typeof flushNow !== "function") {
      return Promise.resolve({
        ok: false,
        reason: "bridge-unavailable",
        error: "El editor todavia no expuso un flush directo.",
      });
    }
    return flushNow(options);
  }, []);

  return {
    registerPersistenceBridge,
    flushEditorPersistence,
  };
}
