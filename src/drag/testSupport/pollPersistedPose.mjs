const defaultNow = () => performance.now();
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errorDetails = (error) => error ? {
  name: error.name || "Error",
  message: String(error.message ?? error),
  ...(error.code != null ? { code: error.code } : {}),
} : null;
const isAbort = (error) => error?.name === "AbortError" ||
  error?.name === "TimeoutError" || error?.code === "ABORT_ERR";

export class PersistedPoseTimeoutError extends Error {
  constructor(diagnostics, cause = null) {
    super(`Persisted pose was not observed within ${diagnostics.timeoutMs} ms ` +
      `(elapsed ${diagnostics.elapsedMs} ms; polls ${diagnostics.polls}; ` +
      `expected ${JSON.stringify(diagnostics.expected)}; last pose ${JSON.stringify(diagnostics.lastPose)})`,
    cause ? { cause } : undefined);
    this.name = "PersistedPoseTimeoutError";
    this.code = "PERSISTED_POSE_TIMEOUT";
    this.diagnostics = diagnostics;
  }
}

// Test-only observation of the real autosave owner. This never flushes, mutates,
// retries failed transports or changes autosave scheduling. readPose receives
// the remaining budget so its transport can use an AbortSignal timeout.
//
// onSlow runs once at the first observation at/after the warning threshold,
// including a successful slow read. It may be async. Its timestamp describes
// observation, not when the server first stored the pose. pollWaitMs ends at the
// accepted read; observer work afterward is outside that duration and outside
// the benchmark's drag window.
export async function pollPersistedPose({
  readPose,
  expected,
  timeoutMs = 15_000,
  slowThresholdMs = 5_000,
  pollIntervalMs = 100,
  epsilon = .01,
  now = defaultNow,
  sleep = defaultSleep,
  onSlow = null,
}) {
  if (typeof readPose !== "function" || typeof now !== "function" || typeof sleep !== "function") {
    throw new TypeError("readPose, now and sleep must be functions");
  }
  for (const [key, value] of Object.entries({ timeoutMs, slowThresholdMs, pollIntervalMs, epsilon })) {
    if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${key} must be positive and finite`);
  }
  if (![expected?.x, expected?.y].every(Number.isFinite)) {
    throw new TypeError("Expected pose must have finite x and y");
  }
  const expectedSnapshot = { ...expected };
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  let polls = 0;
  let lastPose = null;
  let lastError = null;
  let exceededSlowThreshold = false;
  let slowObservationMs = null;
  const elapsed = () => Math.max(0, now() - startedAt);
  const diagnostics = (elapsedMs = elapsed()) => ({
    expected: { ...expectedSnapshot },
    lastPose: lastPose == null ? null : { ...lastPose },
    elapsedMs,
    timeoutMs,
    slowThresholdMs,
    polls,
    exceededSlowThreshold,
    slowObservationMs,
    lastError: errorDetails(lastError),
  });
  const observeSlow = async (elapsedMs) => {
    if (exceededSlowThreshold || elapsedMs < slowThresholdMs) return;
    exceededSlowThreshold = true;
    slowObservationMs = elapsedMs;
    await onSlow?.({ warning: "PERSISTED_POSE_SLOW", ...diagnostics(elapsedMs) });
  };
  const timeout = () => new PersistedPoseTimeoutError(diagnostics(), lastError);

  while (true) {
    const remaining = deadline - now();
    if (remaining <= 0) {
      await observeSlow(elapsed());
      throw timeout();
    }
    polls++;
    let observedElapsedMs;
    try {
      // Ceil prevents a fractional final millisecond from becoming a premature
      // zero-duration AbortSignal; an early abort is still a transport error.
      lastPose = await readPose(Math.max(1, Math.ceil(remaining)));
      observedElapsedMs = elapsed();
    } catch (error) {
      lastError = error;
      const exhaustedAtReadFailure = now() >= deadline;
      await observeSlow(elapsed());
      if (isAbort(error) && exhaustedAtReadFailure) throw timeout();
      throw error;
    }
    await observeSlow(observedElapsedMs);
    if (observedElapsedMs >= timeoutMs) throw timeout();
    if (["x", "y"].every((axis) => Number.isFinite(lastPose?.[axis]) &&
      Math.abs(lastPose[axis] - expectedSnapshot[axis]) < epsilon)) {
      return { pose: lastPose, polls, pollWaitMs: observedElapsedMs,
        exceededSlowThreshold, slowObservationMs };
    }
    // Wake at the warning boundary when it falls before the next regular poll.
    // A single pending read can observe it later; no timestamp is backdated.
    const untilSlow = exceededSlowThreshold ? Infinity : slowThresholdMs - elapsed();
    const waitMs = Math.min(pollIntervalMs, Math.max(0, deadline - now()),
      untilSlow > 0 ? untilSlow : Infinity);
    if (waitMs > 0) await sleep(waitMs);
  }
}
