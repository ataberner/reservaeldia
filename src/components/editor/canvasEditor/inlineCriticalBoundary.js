function normalizeInlineId(value) {
  const safeValue = String(value || "").trim();
  return safeValue || null;
}

function resolveNow() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function resolveWaitFrame(waitFrame) {
  if (typeof waitFrame === "function") {
    return waitFrame;
  }

  if (typeof requestAnimationFrame === "function") {
    return (callback) => requestAnimationFrame(callback);
  }

  return (callback) => setTimeout(callback, 16);
}

function waitForNextFrame(waitFrame) {
  return new Promise((resolve) => {
    waitFrame(resolve);
  });
}

export function resolveActiveInlineSessionId({
  editingId = null,
  currentInlineEditingId = null,
  inlineOverlayMountedId = null,
  inlineOverlayMountSession = null,
} = {}) {
  const mountedOverlaySessionId =
    inlineOverlayMountSession?.mounted === true
      ? normalizeInlineId(inlineOverlayMountSession.id)
      : null;

  return (
    normalizeInlineId(editingId) ||
    normalizeInlineId(currentInlineEditingId) ||
    mountedOverlaySessionId ||
    normalizeInlineId(inlineOverlayMountedId) ||
    null
  );
}

export async function ensureInlineSessionSettledBeforeCriticalAction({
  getState,
  requestInlineEditFinish,
  reason = "critical-action",
  maxWaitMs = 120,
  waitFrame = null,
  getNow = resolveNow,
} = {}) {
  const readState =
    typeof getState === "function"
      ? getState
      : () => ({});
  const readNow =
    typeof getNow === "function"
      ? getNow
      : resolveNow;
  const waitForFrame = resolveWaitFrame(waitFrame);
  const safeMaxWaitMs = Number.isFinite(Number(maxWaitMs))
    ? Math.max(0, Number(maxWaitMs))
    : 120;

  const initialState = readState() || {};
  const initialActiveId = resolveActiveInlineSessionId(initialState);
  const initialEditingId = normalizeInlineId(initialState.editingId);

  if (!initialActiveId) {
    return {
      ok: true,
      settled: true,
      handled: false,
      activeId: null,
      reason,
      skipped: true,
    };
  }

  let handled = false;
  if (initialEditingId && typeof requestInlineEditFinish === "function") {
    try {
      handled = requestInlineEditFinish(reason) === true;
    } catch {
      return {
        ok: false,
        settled: false,
        handled: false,
        activeId: initialActiveId,
        reason: "inline-finish-request-failed",
        actionReason: reason,
        error: "No se pudo cerrar la edicion de texto en curso. Intenta nuevamente.",
      };
    }
  }

  let currentActiveId = resolveActiveInlineSessionId(readState() || {});
  if (!currentActiveId) {
    return {
      ok: true,
      settled: true,
      handled,
      activeId: initialActiveId,
      reason,
    };
  }

  const startedAtMs = Number(readNow()) || 0;

  while (currentActiveId) {
    const elapsedMs = (Number(readNow()) || 0) - startedAtMs;
    if (elapsedMs >= safeMaxWaitMs) {
      return {
        ok: false,
        settled: false,
        handled,
        activeId: currentActiveId,
        reason: "inline-session-still-active",
        actionReason: reason,
        error: "No se pudo cerrar la edicion de texto en curso. Intenta nuevamente.",
      };
    }

    await waitForNextFrame(waitForFrame);
    currentActiveId = resolveActiveInlineSessionId(readState() || {});
  }

  return {
    ok: true,
    settled: true,
    handled,
    activeId: initialActiveId,
    reason,
  };
}
