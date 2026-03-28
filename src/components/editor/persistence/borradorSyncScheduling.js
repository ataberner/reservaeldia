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
  let pendingReason = null;

  const clearScheduledPersist = () => {
    if (!timeoutId) return false;
    clearTimer(timeoutId);
    timeoutId = null;
    pendingReason = null;
    return true;
  };

  const scheduleDebouncedPersist = ({ reason = "debounced-autosave" } = {}) => {
    clearScheduledPersist();
    pendingReason = normalizePersistReason(reason, "debounced-autosave");
    timeoutId = setTimer(() => {
      const scheduledReason = pendingReason || "debounced-autosave";
      timeoutId = null;
      pendingReason = null;
      void Promise.resolve(
        typeof runPersistNow === "function"
          ? runPersistNow({
              reason: scheduledReason,
              immediate: false,
            })
          : null
      );
    }, debounceMs);
  };

  const flushPersistBoundary = async ({ reason = "manual-flush" } = {}) => {
    const restoredReason = pendingReason || null;
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
      return Boolean(timeoutId);
    },
    getPendingReason() {
      return pendingReason || null;
    },
  };
}
