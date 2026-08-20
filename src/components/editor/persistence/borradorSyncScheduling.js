export const BORRADOR_SYNC_PERSIST_DEBOUNCE_MS = 500;

function normalizePersistReason(value, fallback) {
  const reason = String(value || "").trim();
  return reason || fallback;
}

export function shouldRestoreClearedPersistSchedule(result) {
  const reason = String(result?.reason || "").trim();
  return reason === "resize-in-progress" || reason === "draft-not-loaded";
}

export function createBorradorSyncSchedulingController({
  runPersistNow,
  setTimer = (...args) => setTimeout(...args),
  clearTimer = (...args) => clearTimeout(...args),
  debounceMs = BORRADOR_SYNC_PERSIST_DEBOUNCE_MS,
} = {}) {
  let timeoutId = null;
  let timerReason = null;
  let deferredReason = null;
  let scheduledPersistInFlight = null;

  const clearScheduledPersist = () => {
    const hadScheduledPersist = Boolean(timeoutId || deferredReason);
    if (timeoutId) {
      clearTimer(timeoutId);
      timeoutId = null;
    }
    timerReason = null;
    deferredReason = null;
    return hadScheduledPersist;
  };

  const runScheduledPersist = (reason) => {
    if (scheduledPersistInFlight) {
      deferredReason = normalizePersistReason(reason, "debounced-autosave");
      return;
    }

    const persistPromise = Promise.resolve().then(() =>
      typeof runPersistNow === "function"
        ? runPersistNow({
            reason: normalizePersistReason(reason, "debounced-autosave"),
            immediate: false,
          })
        : null
    );
    scheduledPersistInFlight = persistPromise;

    void persistPromise
      .catch(() => undefined)
      .finally(() => {
        if (scheduledPersistInFlight !== persistPromise) return;
        scheduledPersistInFlight = null;
        if (!deferredReason) return;
        const nextReason = deferredReason;
        deferredReason = null;
        runScheduledPersist(nextReason);
      });
  };

  const scheduleDebouncedPersist = ({ reason = "debounced-autosave" } = {}) => {
    if (timeoutId) {
      clearTimer(timeoutId);
      timeoutId = null;
    }
    deferredReason = null;
    timerReason = normalizePersistReason(reason, "debounced-autosave");
    timeoutId = setTimer(() => {
      const scheduledReason = timerReason || "debounced-autosave";
      timeoutId = null;
      timerReason = null;
      runScheduledPersist(scheduledReason);
    }, debounceMs);
  };

  const flushPersistBoundary = async ({ reason = "manual-flush" } = {}) => {
    const restoredReason = timerReason || deferredReason || null;
    const clearedScheduledPersist = clearScheduledPersist();
    const result =
      typeof runPersistNow === "function"
        ? await runPersistNow({
            reason: normalizePersistReason(reason, "manual-flush"),
            immediate: true,
          })
        : null;

    const restoredScheduledPersist =
      clearedScheduledPersist && shouldRestoreClearedPersistSchedule(result);

    if (restoredScheduledPersist) {
      scheduleDebouncedPersist({
        reason: restoredReason || "debounced-autosave",
      });
    }

    return {
      ...(result && typeof result === "object" ? result : {}),
      clearedScheduledPersist,
      restoredScheduledPersist,
    };
  };

  return {
    clearScheduledPersist,
    scheduleDebouncedPersist,
    flushPersistBoundary,
    hasScheduledPersist() {
      return Boolean(timeoutId || deferredReason);
    },
    getPendingReason() {
      return timerReason || deferredReason || null;
    },
  };
}
