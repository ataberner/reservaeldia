import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function createSnapshot(store) {
  return {
    interactionEpoch: store.interactionEpoch,
    isInteractionActive: store.activeCount > 0,
    isSettling: store.isSettling,
  };
}

function snapshotsAreEqual(left, right) {
  return (
    left?.interactionEpoch === right?.interactionEpoch &&
    left?.isInteractionActive === right?.isInteractionActive &&
    left?.isSettling === right?.isSettling
  );
}

function getNowIso() {
  return new Date().toISOString();
}

export default function useCanvasInteractionCoordinator() {
  const storeRef = useRef({
    interactionEpoch: 0,
    activeCount: 0,
    activeKinds: {},
    isSettling: false,
    settleRafA: 0,
    settleRafB: 0,
    scheduledCallbacks: new Map(),
  });
  const [snapshot, setSnapshot] = useState(() =>
    createSnapshot(storeRef.current)
  );

  const publishSnapshot = useCallback(() => {
    const nextSnapshot = createSnapshot(storeRef.current);
    setSnapshot((current) =>
      snapshotsAreEqual(current, nextSnapshot) ? current : nextSnapshot
    );

    if (typeof window !== "undefined") {
      window.__CANVAS_INTERACTION_COORDINATOR_STATE = {
        ...nextSnapshot,
        activeKinds: { ...storeRef.current.activeKinds },
        scheduledKeys: Array.from(storeRef.current.scheduledCallbacks.keys()),
        ts: getNowIso(),
      };
    }
  }, []);

  const cancelSettleFrames = useCallback(() => {
    const store = storeRef.current;
    if (store.settleRafA && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(store.settleRafA);
    }
    if (store.settleRafB && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(store.settleRafB);
    }
    store.settleRafA = 0;
    store.settleRafB = 0;
  }, []);

  const cancelCanvasUiAfterSettle = useCallback((key) => {
    const safeKey = String(key || "");
    if (!safeKey) return;
    storeRef.current.scheduledCallbacks.delete(safeKey);
  }, []);

  const flushScheduledCallbacks = useCallback((epoch) => {
    const store = storeRef.current;
    const pendingEntries = Array.from(store.scheduledCallbacks.entries())
      .filter(([, entry]) => Number(entry?.epoch) === Number(epoch));

    pendingEntries.forEach(([key]) => {
      store.scheduledCallbacks.delete(key);
    });

    pendingEntries.forEach(([, entry]) => {
      try {
        entry?.callback?.();
      } catch (error) {
        console.error("[CANVAS-INTERACTION] after-settle callback error", error);
      }
    });
  }, []);

  const completeSettle = useCallback(() => {
    const store = storeRef.current;
    if (store.activeCount > 0) return;

    const settledEpoch = store.interactionEpoch;
    store.isSettling = false;
    publishSnapshot();

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        if (storeRef.current.interactionEpoch !== settledEpoch) return;
        flushScheduledCallbacks(settledEpoch);
      });
      return;
    }

    flushScheduledCallbacks(settledEpoch);
  }, [flushScheduledCallbacks, publishSnapshot]);

  const scheduleSettle = useCallback(() => {
    const store = storeRef.current;
    cancelSettleFrames();

    if (store.activeCount > 0) {
      store.isSettling = false;
      publishSnapshot();
      return;
    }

    store.isSettling = true;
    publishSnapshot();

    if (typeof requestAnimationFrame !== "function") {
      completeSettle();
      return;
    }

    store.settleRafA = requestAnimationFrame(() => {
      store.settleRafA = 0;
      store.settleRafB = requestAnimationFrame(() => {
        store.settleRafB = 0;
        completeSettle();
      });
    });
  }, [cancelSettleFrames, completeSettle, publishSnapshot]);

  const beginCanvasInteraction = useCallback((kind, meta = {}) => {
    const safeKind = String(kind || "unknown");
    const store = storeRef.current;
    const wasIdle = store.activeCount === 0;

    cancelSettleFrames();
    store.isSettling = false;

    store.activeKinds[safeKind] = Number(store.activeKinds[safeKind] || 0) + 1;
    store.activeCount += 1;

    if (wasIdle) {
      store.interactionEpoch += 1;
      store.scheduledCallbacks.forEach((entry, key) => {
        if (Number(entry?.epoch) < Number(store.interactionEpoch)) {
          store.scheduledCallbacks.delete(key);
        }
      });
    }

    if (typeof window !== "undefined") {
      window.__CANVAS_INTERACTION_LAST_BEGIN = {
        interactionEpoch: store.interactionEpoch,
        kind: safeKind,
        meta,
        ts: getNowIso(),
      };
    }

    publishSnapshot();
    return store.interactionEpoch;
  }, [cancelSettleFrames, publishSnapshot]);

  const endCanvasInteraction = useCallback((kind, meta = {}) => {
    const safeKind = String(kind || "unknown");
    const store = storeRef.current;
    const currentKindCount = Number(store.activeKinds[safeKind] || 0);

    if (currentKindCount > 1) {
      store.activeKinds[safeKind] = currentKindCount - 1;
      store.activeCount = Math.max(0, store.activeCount - 1);
    } else if (currentKindCount === 1) {
      delete store.activeKinds[safeKind];
      store.activeCount = Math.max(0, store.activeCount - 1);
    }

    if (typeof window !== "undefined") {
      window.__CANVAS_INTERACTION_LAST_END = {
        interactionEpoch: store.interactionEpoch,
        kind: safeKind,
        meta,
        ts: getNowIso(),
      };
    }

    if (store.activeCount === 0) {
      scheduleSettle();
    } else {
      publishSnapshot();
    }

    return store.interactionEpoch;
  }, [publishSnapshot, scheduleSettle]);

  const scheduleCanvasUiAfterSettle = useCallback((key, callback) => {
    const safeKey = String(key || "");
    if (!safeKey || typeof callback !== "function") return;

    const store = storeRef.current;

    if (store.activeCount === 0 && !store.isSettling) {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          if (storeRef.current.activeCount > 0 || storeRef.current.isSettling) return;
          callback();
        });
      } else {
        callback();
      }
      return;
    }

    store.scheduledCallbacks.set(safeKey, {
      epoch: store.interactionEpoch,
      callback,
    });
  }, []);

  const isCanvasUiSuppressed = useCallback(() => {
    const store = storeRef.current;
    return store.activeCount > 0 || store.isSettling;
  }, []);

  useEffect(() => () => {
    cancelSettleFrames();
    storeRef.current.scheduledCallbacks.clear();
  }, [cancelSettleFrames]);

  return useMemo(() => ({
    interactionEpoch: snapshot.interactionEpoch,
    isInteractionActive: snapshot.isInteractionActive,
    isSettling: snapshot.isSettling,
    beginCanvasInteraction,
    endCanvasInteraction,
    scheduleCanvasUiAfterSettle,
    cancelCanvasUiAfterSettle,
    isCanvasUiSuppressed,
  }), [
    beginCanvasInteraction,
    cancelCanvasUiAfterSettle,
    endCanvasInteraction,
    isCanvasUiSuppressed,
    scheduleCanvasUiAfterSettle,
    snapshot.interactionEpoch,
    snapshot.isInteractionActive,
    snapshot.isSettling,
  ]);
}
