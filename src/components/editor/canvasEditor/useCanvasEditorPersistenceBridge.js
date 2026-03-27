import { useCallback, useRef } from "react";

export default function useCanvasEditorPersistenceBridge() {
  const persistenceBridgeRef = useRef(null);

  const registerPersistenceBridge = useCallback((bridge) => {
    persistenceBridgeRef.current =
      bridge && typeof bridge === "object" ? bridge : null;
  }, []);

  const flushEditorPersistence = useCallback((options = {}) => {
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
