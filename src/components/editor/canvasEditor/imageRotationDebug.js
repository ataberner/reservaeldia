const IMAGE_ROTATION_FRAME_BUDGET_MS = 16.7;
const IMAGE_ROTATION_GAP_ANOMALY_MS = 120;

function readExplicitDebugFlag(rawValue) {
  if (rawValue === true || rawValue === 1 || rawValue === "1") return true;
  if (rawValue === false || rawValue === 0 || rawValue === "0") return false;
  if (typeof rawValue === "string") {
    const normalized = rawValue.trim().toLowerCase();
    if (normalized === "true" || normalized === "on" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "off" || normalized === "no") return false;
  }
  return null;
}

function parseDebugFlag(value, fallback = false) {
  if (typeof value === "undefined") return fallback;
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function isLocalDebugHostname(hostname) {
  const normalizedHost = String(hostname || "").trim().toLowerCase();
  if (!normalizedHost) return true;

  return (
    normalizedHost === "localhost" ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost === "0.0.0.0" ||
    normalizedHost === "::1" ||
    normalizedHost.endsWith(".local")
  );
}

function getNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function roundMetric(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function getPointerDistance(dx, dy) {
  const numericDx = Number(dx);
  const numericDy = Number(dy);
  if (!Number.isFinite(numericDx) || !Number.isFinite(numericDy)) return null;
  return roundMetric(Math.hypot(numericDx, numericDy), 2);
}

function normalizeAngleDelta(current, previous) {
  const numericCurrent = Number(current);
  const numericPrevious = Number(previous);
  if (!Number.isFinite(numericCurrent) || !Number.isFinite(numericPrevious)) return null;
  let delta = numericCurrent - numericPrevious;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return roundMetric(Math.abs(delta), 2);
}

function getVisibilityStateSnapshot() {
  if (typeof document === "undefined") return "unknown";
  return document.visibilityState || "unknown";
}

function getFocusStateSnapshot() {
  if (typeof document === "undefined" || typeof document.hasFocus !== "function") {
    return null;
  }
  try {
    return document.hasFocus();
  } catch {
    return null;
  }
}

function isPerformanceObserverSupported(entryType) {
  if (typeof PerformanceObserver === "undefined") return false;
  const supported = PerformanceObserver.supportedEntryTypes;
  return Array.isArray(supported) ? supported.includes(entryType) : false;
}

function disconnectImageRotationSessionObservers(session) {
  if (!session?.observers) return;
  try {
    session.observers.longTask?.disconnect?.();
  } catch {}
  try {
    session.observers.visibilityCleanup?.();
  } catch {}
  session.observers = null;
}

function attachImageRotationSessionObservers(session) {
  if (typeof window === "undefined" || !session || session.observers) return;

  const observers = {};

  if (isPerformanceObserverSupported("longtask")) {
    try {
      observers.longTask = new PerformanceObserver((list) => {
        const entries = list.getEntries?.() || [];
        entries.forEach((entry) => {
          const startTime = Number(entry?.startTime);
          const durationMs = roundMetric(entry?.duration);
          if (!Number.isFinite(startTime) || !Number.isFinite(durationMs)) return;
          if (startTime + durationMs < session.startedAt) return;

          session.longTaskCount += 1;
          session.longTaskMaxMs = Math.max(session.longTaskMaxMs, durationMs);
          session.lastLongTask = {
            startTime: roundMetric(startTime),
            durationMs,
            name: entry?.name || "longtask",
          };

          trackImageRotationDebug(
            "image-rotate:longtask",
            {
              sessionId: session.sessionId,
              elementId: session.elementId,
              durationMs,
              offsetMs: roundMetric(Math.max(0, startTime - session.startedAt)),
              visibilityState: getVisibilityStateSnapshot(),
              hasFocus: getFocusStateSnapshot(),
            },
            {
              throttleMs: 80,
              throttleKey: `image-rotate:longtask:${session.sessionId}`,
            }
          );
        });
      });
      observers.longTask.observe({ entryTypes: ["longtask"] });
    } catch {}
  }

  const handleVisibilityChange = () => {
    const visibilityState = getVisibilityStateSnapshot();
    const hasFocus = getFocusStateSnapshot();
    if (visibilityState === "hidden") {
      session.visibilityHiddenCount += 1;
    }
    if (hasFocus === false) {
      session.blurCount += 1;
    }
    trackImageRotationDebug("image-rotate:visibility", {
      sessionId: session.sessionId,
      elementId: session.elementId,
      visibilityState,
      hasFocus,
      previewCount: session.previewCount,
    });
  };

  const handleFocus = () => {
    session.focusCount += 1;
    trackImageRotationDebug("image-rotate:focus", {
      sessionId: session.sessionId,
      elementId: session.elementId,
      visibilityState: getVisibilityStateSnapshot(),
      hasFocus: true,
      previewCount: session.previewCount,
    });
  };

  const handleBlur = () => {
    session.blurCount += 1;
    trackImageRotationDebug("image-rotate:blur", {
      sessionId: session.sessionId,
      elementId: session.elementId,
      visibilityState: getVisibilityStateSnapshot(),
      hasFocus: false,
      previewCount: session.previewCount,
    });
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }
  window.addEventListener("focus", handleFocus);
  window.addEventListener("blur", handleBlur);

  observers.visibilityCleanup = () => {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
    window.removeEventListener("focus", handleFocus);
    window.removeEventListener("blur", handleBlur);
  };

  session.observers = observers;
}

function isImageRotationDebugEnabled() {
  if (typeof window === "undefined") return false;
  if (typeof window.__DBG_IMAGE_ROTATION === "undefined") return true;
  return parseDebugFlag(window.__DBG_IMAGE_ROTATION, true);
}

function isImageRotationVerboseConsoleEnabled() {
  if (typeof window === "undefined") return false;

  const explicitWindowFlag = readExplicitDebugFlag(
    window.__DBG_IMAGE_ROTATION_VERBOSE_CONSOLE
  );
  if (explicitWindowFlag !== null) return explicitWindowFlag;

  let storageRawValue = null;
  try {
    storageRawValue = window.sessionStorage?.getItem?.(
      "debug:image-rotation:verbose"
    );
  } catch {
    storageRawValue = null;
  }

  const explicitStorageFlag = readExplicitDebugFlag(storageRawValue);
  if (explicitStorageFlag !== null) return explicitStorageFlag;

  return (
    process.env.NODE_ENV !== "production" ||
    isLocalDebugHostname(window.location?.hostname)
  );
}

function shouldEmitImageRotationConsole(eventName) {
  if (isImageRotationVerboseConsoleEnabled()) return true;

  return (
    eventName === "image-rotate:start" ||
    eventName === "image-rotate:overlay-lift" ||
    eventName === "image-rotate:source-layer-freeze" ||
    eventName === "image-rotate:cache-state" ||
    eventName === "image-rotate:gap-anomaly" ||
    eventName === "image-rotate:longtask" ||
    eventName === "image-rotate:visibility" ||
    eventName === "image-rotate:focus" ||
    eventName === "image-rotate:blur" ||
    eventName === "image-rotate:commit-snap" ||
    eventName === "image-rotate:commit-pose-stabilized" ||
    eventName === "image-rotate:renderer-selection-state" ||
    eventName === "image-rotate:deselect-before-clear" ||
    eventName === "image-rotate:deselect-after-clear" ||
    eventName === "image-rotate:commit" ||
    eventName === "image-rotate:overlay-restore" ||
    eventName === "image-rotate:source-layer-thaw" ||
    eventName === "image-rotate:cache-release" ||
    eventName === "image-rotate:summary"
  );
}

function getImageRotationDebugStore() {
  if (typeof window === "undefined") return null;
  if (!window.__IMAGE_ROTATION_DEBUG_STORE) {
    window.__IMAGE_ROTATION_DEBUG_STORE = {
      counts: {},
      lastLogAt: {},
      trace: [],
      activeSession: null,
      lastSessionSummary: null,
    };
  }
  return window.__IMAGE_ROTATION_DEBUG_STORE;
}

function buildImageRotationDebugSummary(eventName, payload = {}, count = null) {
  const summary = [];
  if (Number.isFinite(count)) summary.push(`#${count}`);
  if (payload?.sessionId) summary.push(`session=${payload.sessionId}`);
  if (payload?.elementId) summary.push(`id=${payload.elementId}`);
  if (payload?.activeAnchor) summary.push(`anchor=${payload.activeAnchor}`);
  if (payload?.rotation != null) summary.push(`rot=${payload.rotation}deg`);
  if (payload?.finalRotation != null) summary.push(`final=${payload.finalRotation}deg`);
  if (payload?.previewCount != null) summary.push(`preview=${payload.previewCount}`);
  if (payload?.frameGapMs != null) summary.push(`gap=${payload.frameGapMs}ms`);
  if (payload?.rotationDeltaDeg != null) summary.push(`dRot=${payload.rotationDeltaDeg}deg`);
  if (payload?.snapDeltaDeg != null) summary.push(`snap=${payload.snapDeltaDeg}deg`);
  if (payload?.pointerDistancePx != null) summary.push(`dPtr=${payload.pointerDistancePx}px`);
  if (payload?.handlerDurationMs != null) summary.push(`handler=${payload.handlerDurationMs}ms`);
  if (payload?.totalDurationMs != null) summary.push(`total=${payload.totalDurationMs}ms`);
  if (payload?.avgPreviewGapMs != null) summary.push(`gapAvg=${payload.avgPreviewGapMs}ms`);
  if (payload?.maxPreviewGapMs != null) summary.push(`gapMax=${payload.maxPreviewGapMs}ms`);
  if (payload?.overBudgetPreviewCount != null) summary.push(`over=${payload.overBudgetPreviewCount}`);
  if (payload?.longTaskMaxMs != null) summary.push(`longMax=${payload.longTaskMaxMs}ms`);
  if (payload?.longTaskCount != null) summary.push(`long=${payload.longTaskCount}`);
  if (payload?.sceneDrawMaxMs != null) summary.push(`sceneMax=${payload.sceneDrawMaxMs}ms`);
  if (payload?.hitDrawMaxMs != null) summary.push(`hitMax=${payload.hitDrawMaxMs}ms`);
  if (payload?.stageSceneDrawMaxMs != null) summary.push(`stageSceneMax=${payload.stageSceneDrawMaxMs}ms`);
  if (payload?.stageSceneDrawMaxLabel) summary.push(`stageSceneLayer=${payload.stageSceneDrawMaxLabel}`);
  if (payload?.stageHitDrawMaxMs != null) summary.push(`stageHitMax=${payload.stageHitDrawMaxMs}ms`);
  if (payload?.stageHitDrawMaxLabel) summary.push(`stageHitLayer=${payload.stageHitDrawMaxLabel}`);
  if (payload?.visibilityState) summary.push(`vis=${payload.visibilityState}`);
  if (payload?.hasFocus === false) summary.push("focus=false");
  if (payload?.skippedReactWrites != null) summary.push(`skipReact=${payload.skippedReactWrites}`);
  if (payload?.skippedOptionButtonUpdates != null) summary.push(`skipUI=${payload.skippedOptionButtonUpdates}`);
  if (payload?.cacheApplied === true) summary.push("cache=applied");
  if (payload?.cacheReused === true) summary.push("cache=reused");
  if (payload?.cacheCleared === true) summary.push("cache=cleared");
  if (payload?.overlayLifted === true) summary.push("overlay=lifted");
  if (payload?.overlayRestored === true) summary.push("overlay=restored");
  if (payload?.sourceLayerFrozen === true) summary.push("source=freeze");
  if (payload?.sourceLayerThawed === true) summary.push("source=thaw");
  if (payload?.sourceLayerLabel) summary.push(`sourceLayer=${payload.sourceLayerLabel}`);
  if (payload?.reason) summary.push(`reason=${payload.reason}`);
  return `[IMAGE-ROTATE-DBG] ${eventName}${summary.length ? ` ${summary.join(" ")}` : ""}`;
}

export function trackImageRotationDebug(eventName, payload = {}, options = {}) {
  if (!isImageRotationDebugEnabled()) return null;

  const safeEventName = String(eventName || "unknown");
  const nowMs = getNowMs();
  const throttleMs = Number(options?.throttleMs || 0);
  const throttleKey = String(options?.throttleKey || safeEventName);
  const store = getImageRotationDebugStore();
  if (!store) return null;

  if (throttleMs > 0) {
    const lastLogAt = Number(store.lastLogAt[throttleKey] || 0);
    if (nowMs - lastLogAt < throttleMs) {
      return null;
    }
    store.lastLogAt[throttleKey] = nowMs;
  }

  const nextCount = Number(store.counts[safeEventName] || 0) + 1;
  store.counts[safeEventName] = nextCount;

  const entry = {
    eventName: safeEventName,
    count: nextCount,
    nowMs: roundMetric(nowMs),
    ...payload,
  };

  store.trace.push(entry);
  if (store.trace.length > 300) {
    store.trace.splice(0, store.trace.length - 300);
  }

  if (typeof window !== "undefined") {
    window.__IMAGE_ROTATION_DEBUG_TRACE = store.trace;
    window.__IMAGE_ROTATION_DEBUG_LAST = entry;
    window.__IMAGE_ROTATION_DEBUG_TRACE_TEXT = store.trace
      .map((item) => JSON.stringify(item, null, 2))
      .join("\n\n");
    window.__IMAGE_ROTATION_DEBUG_LAST_TEXT = JSON.stringify(entry, null, 2);
  }

  if (!shouldEmitImageRotationConsole(safeEventName)) {
    return entry;
  }

  const summary = buildImageRotationDebugSummary(safeEventName, entry, nextCount);
  const formattedEntry = JSON.stringify(entry, null, 2);
  console.log(`${summary}\n${formattedEntry}`);
  return entry;
}

export function startImageRotationDebugSession(payload = {}) {
  if (!isImageRotationDebugEnabled()) return null;

  const store = getImageRotationDebugStore();
  if (!store) return null;

  const nowMs = getNowMs();
  const session = {
    sessionId: `${payload?.elementId || "unknown"}:${Math.round(nowMs)}`,
    elementId: payload?.elementId || null,
    startedAt: nowMs,
    previewCount: 0,
    previewGapTotalMs: 0,
    previewGapMaxMs: 0,
    overBudgetPreviewCount: 0,
    skippedReactWrites: 0,
    skippedOptionButtonUpdates: 0,
    lastPreviewAt: null,
    lastRotation: Number.isFinite(Number(payload?.rotation)) ? Number(payload.rotation) : null,
    lastPointerX: Number.isFinite(Number(payload?.pointerX)) ? Number(payload.pointerX) : null,
    lastPointerY: Number.isFinite(Number(payload?.pointerY)) ? Number(payload.pointerY) : null,
    gapAnomalyCount: 0,
    maxRotationDeltaDeg: 0,
    maxPointerDistancePx: 0,
    lastLongTask: null,
    longTaskCount: 0,
    longTaskMaxMs: 0,
    sceneDrawCount: 0,
    sceneDrawMaxMs: 0,
    hitDrawCount: 0,
    hitDrawMaxMs: 0,
    stageSceneDrawCount: 0,
    stageSceneDrawMaxMs: 0,
    stageSceneDrawMaxLabel: null,
    stageHitDrawCount: 0,
    stageHitDrawMaxMs: 0,
    stageHitDrawMaxLabel: null,
    visibilityHiddenCount: 0,
    blurCount: 0,
    focusCount: 0,
    commitPayload: null,
    startPayload: payload,
    observers: null,
  };

  store.activeSession = session;
  if (typeof window !== "undefined") {
    window.__IMAGE_ROTATION_DEBUG_ACTIVE_SESSION = session;
  }

  attachImageRotationSessionObservers(session);

  trackImageRotationDebug("image-rotate:start", {
    sessionId: session.sessionId,
    visibilityState: getVisibilityStateSnapshot(),
    hasFocus: getFocusStateSnapshot(),
    ...payload,
  });

  return session;
}

export function trackImageRotationPreview(payload = {}, options = {}) {
  if (!isImageRotationDebugEnabled()) return null;

  const store = getImageRotationDebugStore();
  const session = store?.activeSession;
  if (!session) return null;

  const nowMs = getNowMs();
  let frameGapMs = null;
  const rotationDeltaDeg = normalizeAngleDelta(payload?.rotation, session.lastRotation);
  const pointerDx =
    Number.isFinite(Number(payload?.pointerX)) && Number.isFinite(session.lastPointerX)
      ? Number(payload.pointerX) - Number(session.lastPointerX)
      : null;
  const pointerDy =
    Number.isFinite(Number(payload?.pointerY)) && Number.isFinite(session.lastPointerY)
      ? Number(payload.pointerY) - Number(session.lastPointerY)
      : null;
  const pointerDistancePx = getPointerDistance(pointerDx, pointerDy);

  if (Number.isFinite(session.lastPreviewAt)) {
    frameGapMs = nowMs - session.lastPreviewAt;
    session.previewGapTotalMs += frameGapMs;
    session.previewGapMaxMs = Math.max(session.previewGapMaxMs, frameGapMs);
    if (frameGapMs > IMAGE_ROTATION_FRAME_BUDGET_MS) {
      session.overBudgetPreviewCount += 1;
    }
  }

  session.lastPreviewAt = nowMs;
  session.previewCount += 1;
  if (Number.isFinite(rotationDeltaDeg)) {
    session.maxRotationDeltaDeg = Math.max(session.maxRotationDeltaDeg, rotationDeltaDeg);
  }
  if (Number.isFinite(pointerDistancePx)) {
    session.maxPointerDistancePx = Math.max(session.maxPointerDistancePx, pointerDistancePx);
  }
  session.lastRotation = Number.isFinite(Number(payload?.rotation))
    ? Number(payload.rotation)
    : session.lastRotation;
  session.lastPointerX = Number.isFinite(Number(payload?.pointerX))
    ? Number(payload.pointerX)
    : session.lastPointerX;
  session.lastPointerY = Number.isFinite(Number(payload?.pointerY))
    ? Number(payload.pointerY)
    : session.lastPointerY;

  if (Number.isFinite(frameGapMs) && frameGapMs >= IMAGE_ROTATION_GAP_ANOMALY_MS) {
    session.gapAnomalyCount += 1;
    trackImageRotationDebug("image-rotate:gap-anomaly", {
      sessionId: session.sessionId,
      elementId: session.elementId,
      previewCount: session.previewCount,
      frameGapMs: roundMetric(frameGapMs),
      rotationDeltaDeg,
      pointerDx: roundMetric(pointerDx),
      pointerDy: roundMetric(pointerDy),
      pointerDistancePx,
      visibilityState: getVisibilityStateSnapshot(),
      hasFocus: getFocusStateSnapshot(),
      longTaskNearbyMs: session.lastLongTask?.durationMs ?? null,
      longTaskOffsetMs:
        session.lastLongTask?.startTime != null
          ? roundMetric(session.lastLongTask.startTime - session.startedAt)
          : null,
    });
  }

  return trackImageRotationDebug(
    "image-rotate:preview",
    {
      sessionId: session.sessionId,
      previewCount: session.previewCount,
      frameGapMs: roundMetric(frameGapMs),
      rotationDeltaDeg,
      pointerDx: roundMetric(pointerDx),
      pointerDy: roundMetric(pointerDy),
      pointerDistancePx,
      overBudget:
        Number.isFinite(frameGapMs) ? frameGapMs > IMAGE_ROTATION_FRAME_BUDGET_MS : false,
      visibilityState: getVisibilityStateSnapshot(),
      hasFocus: getFocusStateSnapshot(),
      ...payload,
    },
    {
      throttleMs: Number(options?.throttleMs || 140),
      throttleKey: options?.throttleKey || `image-rotate:preview:${session.sessionId}`,
    }
  );
}

export function noteImageRotationReactPreviewSkipped(payload = {}) {
  if (!isImageRotationDebugEnabled()) return null;

  const store = getImageRotationDebugStore();
  const session = store?.activeSession;
  if (!session) return null;

  session.skippedReactWrites += 1;
  return trackImageRotationDebug(
    "image-rotate:react-preview-skipped",
    {
      sessionId: session.sessionId,
      skippedReactWrites: session.skippedReactWrites,
      ...payload,
    },
    {
      throttleMs: 220,
      throttleKey: `image-rotate:react-preview-skipped:${session.sessionId}`,
    }
  );
}

export function noteImageRotationOptionButtonSkip(payload = {}) {
  if (!isImageRotationDebugEnabled()) return null;

  const store = getImageRotationDebugStore();
  const session = store?.activeSession;
  if (!session) return null;

  session.skippedOptionButtonUpdates += 1;
  return trackImageRotationDebug(
    "image-rotate:option-button-skip",
    {
      sessionId: session.sessionId,
      skippedOptionButtonUpdates: session.skippedOptionButtonUpdates,
      ...payload,
    },
    {
      throttleMs: 220,
      throttleKey: `image-rotate:option-button-skip:${session.sessionId}`,
    }
  );
}

export function trackImageRotationCommit(payload = {}) {
  if (!isImageRotationDebugEnabled()) return null;

  const store = getImageRotationDebugStore();
  const session = store?.activeSession;
  if (!session) return null;

  session.commitPayload = payload;
  return trackImageRotationDebug("image-rotate:commit", {
    sessionId: session.sessionId,
    ...payload,
  });
}

export function recordImageRotationLayerDraw(eventName, payload = {}) {
  if (!isImageRotationDebugEnabled()) return null;

  const store = getImageRotationDebugStore();
  const session = store?.activeSession;
  if (!session) return null;
  if (payload?.elementId && session.elementId && payload.elementId !== session.elementId) {
    return null;
  }
  if (
    payload?.rotationDebugSessionId &&
    session.sessionId &&
    payload.rotationDebugSessionId !== session.sessionId
  ) {
    return null;
  }

  const durationMs = roundMetric(payload?.durationMs);
  if (!Number.isFinite(durationMs)) return null;

  if (eventName === "image:layer-draw-scene") {
    session.sceneDrawCount += 1;
    session.sceneDrawMaxMs = Math.max(session.sceneDrawMaxMs, durationMs);
  } else if (eventName === "image:layer-draw-hit") {
    session.hitDrawCount += 1;
    session.hitDrawMaxMs = Math.max(session.hitDrawMaxMs, durationMs);
  } else if (eventName === "stage:layer-draw-scene") {
    session.stageSceneDrawCount += 1;
    if (durationMs >= session.stageSceneDrawMaxMs) {
      session.stageSceneDrawMaxMs = Math.max(session.stageSceneDrawMaxMs, durationMs);
      session.stageSceneDrawMaxLabel = payload?.layerLabel || session.stageSceneDrawMaxLabel;
    }
  } else if (eventName === "stage:layer-draw-hit") {
    session.stageHitDrawCount += 1;
    if (durationMs >= session.stageHitDrawMaxMs) {
      session.stageHitDrawMaxMs = Math.max(session.stageHitDrawMaxMs, durationMs);
      session.stageHitDrawMaxLabel = payload?.layerLabel || session.stageHitDrawMaxLabel;
    }
  } else {
    return null;
  }

  if (!isImageRotationVerboseConsoleEnabled()) {
    return {
      durationMs,
    };
  }

  return trackImageRotationDebug("image-rotate:layer-draw", {
    sessionId: session.sessionId,
    elementId: session.elementId,
    sourceEvent: eventName,
    durationMs,
    sceneDrawCount: session.sceneDrawCount,
    hitDrawCount: session.hitDrawCount,
  }, {
    throttleMs: 120,
    throttleKey: `image-rotate:layer-draw:${session.sessionId}:${eventName}`,
  });
}

export function finishImageRotationDebugSession(payload = {}) {
  if (!isImageRotationDebugEnabled()) return null;

  const store = getImageRotationDebugStore();
  const session = store?.activeSession;
  if (!store || !session) return null;

  const nowMs = getNowMs();
  const previewGapCount = Math.max(0, session.previewCount - 1);
  const summary = {
    sessionId: session.sessionId,
    elementId: session.elementId,
    totalDurationMs: roundMetric(nowMs - session.startedAt),
    previewCount: session.previewCount,
    avgPreviewGapMs: roundMetric(
      previewGapCount > 0 ? session.previewGapTotalMs / previewGapCount : null
    ),
    maxPreviewGapMs: roundMetric(session.previewGapMaxMs),
    overBudgetPreviewCount: session.overBudgetPreviewCount,
    gapAnomalyCount: session.gapAnomalyCount,
    maxRotationDeltaDeg: roundMetric(session.maxRotationDeltaDeg),
    maxPointerDistancePx: roundMetric(session.maxPointerDistancePx),
    longTaskCount: session.longTaskCount,
    longTaskMaxMs: roundMetric(session.longTaskMaxMs),
    sceneDrawCount: session.sceneDrawCount,
    sceneDrawMaxMs: roundMetric(session.sceneDrawMaxMs),
    hitDrawCount: session.hitDrawCount,
    hitDrawMaxMs: roundMetric(session.hitDrawMaxMs),
    stageSceneDrawCount: session.stageSceneDrawCount,
    stageSceneDrawMaxMs: roundMetric(session.stageSceneDrawMaxMs),
    stageSceneDrawMaxLabel: session.stageSceneDrawMaxLabel || null,
    stageHitDrawCount: session.stageHitDrawCount,
    stageHitDrawMaxMs: roundMetric(session.stageHitDrawMaxMs),
    stageHitDrawMaxLabel: session.stageHitDrawMaxLabel || null,
    visibilityHiddenCount: session.visibilityHiddenCount,
    blurCount: session.blurCount,
    focusCount: session.focusCount,
    visibilityState: getVisibilityStateSnapshot(),
    hasFocus: getFocusStateSnapshot(),
    skippedReactWrites: session.skippedReactWrites,
    skippedOptionButtonUpdates: session.skippedOptionButtonUpdates,
    finalRotation:
      payload?.finalRotation ??
      session.commitPayload?.finalRotation ??
      session.commitPayload?.rotation ??
      session.startPayload?.rotation ??
      null,
    reason: payload?.reason || "transform-complete",
    ...payload,
  };

  disconnectImageRotationSessionObservers(session);
  store.activeSession = null;
  store.lastSessionSummary = summary;

  if (typeof window !== "undefined") {
    window.__IMAGE_ROTATION_DEBUG_ACTIVE_SESSION = null;
    window.__IMAGE_ROTATION_DEBUG_LAST_SESSION = summary;
  }

  trackImageRotationDebug("image-rotate:summary", summary);
  return summary;
}
