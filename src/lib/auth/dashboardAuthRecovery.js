const RETRY_DELAYS_MS = [700, 1500, 3000];
const RECOVERY_PROBE_DELAY_MS = 15000;

export function isTransientDashboardAuthError(error) {
  return [
    "auth/network-request-failed",
    "functions/unavailable",
    "functions/deadline-exceeded",
    // The callable SDK also uses internal when a response cannot be read.
    "functions/internal",
  ].includes(error?.code);
}

// Owns one pending request or one wait, never both. SDK calls cannot be aborted;
// cancellation prevents their late results from advancing the current session.
export function createDashboardAuthRecovery({
  task,
  shouldRetry = isTransientDashboardAuthError,
  isCurrent = () => true,
  onStateChange = () => {},
  onRetry = () => {},
  eventTarget = typeof window === "undefined" ? null : window,
  visibilityTarget = typeof document === "undefined" ? null : document,
}) {
  let cancelled = false;
  let timer = null;
  let finishWait = null;
  let state = "idle";
  let failures = 0;
  const active = () => !cancelled && isCurrent();
  const isVisible = () => visibilityTarget?.visibilityState !== "hidden";
  const isReportedOffline = () => eventTarget?.navigator?.onLine === false;
  const setState = (next) => {
    if (!active() || next === state) return;
    state = next;
    onStateChange(next);
  };
  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const wake = () => {
    if (!finishWait || !active()) return;
    if (!isVisible()) {
      clearTimer();
      setState("waiting");
      return;
    }
    finishWait(true);
  };
  const deferOfflineProbe = () => {
    if (!finishWait || !active()) return;
    clearTimer();
    setState("waiting");
    if (isVisible()) timer = setTimeout(wake, RECOVERY_PROBE_DELAY_MS);
  };
  eventTarget?.addEventListener("online", wake);
  eventTarget?.addEventListener("offline", deferOfflineProbe);
  eventTarget?.addEventListener("pageshow", wake);
  eventTarget?.addEventListener("focus", wake);
  visibilityTarget?.addEventListener("visibilitychange", wake);

  const dispose = () => {
    clearTimer();
    eventTarget?.removeEventListener("online", wake);
    eventTarget?.removeEventListener("offline", deferOfflineProbe);
    eventTarget?.removeEventListener("pageshow", wake);
    eventTarget?.removeEventListener("focus", wake);
    visibilityTarget?.removeEventListener("visibilitychange", wake);
  };
  const wait = (delayMs) => new Promise((resolve) => {
    finishWait = (continueRecovery) => {
      clearTimer();
      finishWait = null;
      resolve(continueRecovery);
    };
    if (!active()) {
      finishWait(false);
    } else if (isVisible()) {
      timer = setTimeout(wake, delayMs);
    } else {
      setState("waiting");
    }
  });

  const promise = (async () => {
    try {
      while (active()) {
        try {
          const value = await task();
          if (!active()) break;
          setState("idle");
          return { status: "success", value, recovered: failures > 0 };
        } catch (error) {
          if (!active()) break;
          if (!shouldRetry(error)) throw error;
          failures += 1;
          // navigator.onLine is advisory. A visible page still probes slowly if
          // Safari retains a stale offline flag, and pageshow can wake it early.
          const delayMs = isReportedOffline()
            ? RECOVERY_PROBE_DELAY_MS
            : RETRY_DELAYS_MS[failures - 1] ?? RECOVERY_PROBE_DELAY_MS;
          setState(!isReportedOffline() && failures <= RETRY_DELAYS_MS.length ? "retrying" : "waiting");
          onRetry({ error, attempt: failures, delayMs });
          if (!(await wait(delayMs))) break;
        }
      }
      return { status: "cancelled" };
    } finally {
      dispose();
    }
  })();

  return {
    promise,
    cancel() {
      cancelled = true;
      dispose();
      finishWait?.(false);
    },
  };
}
