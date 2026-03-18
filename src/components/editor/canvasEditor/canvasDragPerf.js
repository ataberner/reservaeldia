function roundMetric(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
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

function getNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function normalizeDuration(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function getDistanceFromDelta(dx, dy) {
  const numericDx = Number(dx);
  const numericDy = Number(dy);
  if (!Number.isFinite(numericDx) || !Number.isFinite(numericDy)) return 0;
  return Math.hypot(numericDx, numericDy);
}

function getAverage(total, count) {
  const numericTotal = Number(total);
  const numericCount = Number(count);
  if (!Number.isFinite(numericTotal) || !Number.isFinite(numericCount) || numericCount <= 0) {
    return null;
  }
  return numericTotal / numericCount;
}

const FRAME_BUDGET_MS = 16.7;
const MOVE_GAP_ANOMALY_MS = 24;
const FRAME_GAP_ANOMALY_MS = 24;
const ANOMALY_CONTEXT_WINDOW_MS = 160;
const MAX_STORED_ANOMALIES = 8;

function getSupportedPerformanceEntryTypes() {
  if (typeof PerformanceObserver === "undefined") return [];
  const supported = PerformanceObserver.supportedEntryTypes;
  return Array.isArray(supported) ? supported : [];
}

function supportsPerformanceEntryType(type) {
  return getSupportedPerformanceEntryTypes().includes(type);
}

function isCanvasDragPerfEnabled() {
  if (typeof window === "undefined") return false;
  return parseDebugFlag(window.__DBG_CANVAS_DRAG_PERF, false);
}

function isCanvasDragPerfExpanded() {
  if (typeof window === "undefined") return false;
  if (typeof window.__CANVAS_DRAG_PERF_EXPANDED !== "undefined") {
    return parseDebugFlag(window.__CANVAS_DRAG_PERF_EXPANDED, true);
  }
  return false;
}

function shouldEmitCanvasDragPerfConsole(eventName) {
  if (isCanvasDragPerfExpanded()) return true;

  return (
    eventName === "drag:timing-summary" ||
    eventName === "drag:gap-anomaly" ||
    eventName === "drag:frame-gap-anomaly"
  );
}

function updateNamedDurationMap(store, name, durationMs) {
  if (!store || !name || durationMs == null) return;
  const current = store[name] || {
    count: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
  };
  current.count += 1;
  current.totalDurationMs += durationMs;
  current.maxDurationMs = Math.max(current.maxDurationMs, durationMs);
  store[name] = current;
}

function buildTopNamedDurationEntries(store = {}, limit = 5) {
  return Object.entries(store)
    .map(([name, stats]) => ({
      name,
      count: Number(stats?.count || 0),
      totalDurationMs: roundMetric(stats?.totalDurationMs),
      avgDurationMs: roundMetric(
        getAverage(Number(stats?.totalDurationMs || 0), Number(stats?.count || 0))
      ),
      maxDurationMs: roundMetric(stats?.maxDurationMs),
    }))
    .sort((a, b) => (b.totalDurationMs || 0) - (a.totalDurationMs || 0))
    .slice(0, limit);
}

function getCanvasDragPerfSummary(eventName, payload = {}, count = null) {
  const summary = [];
  if (Number.isFinite(count)) summary.push(`#${count}`);
  if (payload?.elementId) summary.push(`id=${payload.elementId}`);
  if (payload?.tipo) summary.push(`tipo=${payload.tipo}`);
  if (payload?.source) summary.push(`src=${payload.source}`);
  if (payload?.selectedCount != null) summary.push(`sel=${payload.selectedCount}`);
  if (payload?.lines != null) summary.push(`lines=${payload.lines}`);
  if (payload?.reason) summary.push(`reason=${payload.reason}`);
  if (Array.isArray(payload?.changedKeys) && payload.changedKeys.length > 0) {
    summary.push(`keys=${payload.changedKeys.slice(0, 4).join(",")}`);
  }
  if (payload?.totalDurationMs != null) summary.push(`total=${payload.totalDurationMs}ms`);
  if (payload?.moveCount != null) summary.push(`moves=${payload.moveCount}`);
  if (payload?.avgMoveGapMs != null) summary.push(`gapAvg=${payload.avgMoveGapMs}ms`);
  if (payload?.maxMoveGapMs != null) summary.push(`gapMax=${payload.maxMoveGapMs}ms`);
  if (payload?.avgFrameGapMs != null) summary.push(`frameAvg=${payload.avgFrameGapMs}ms`);
  if (payload?.maxFrameGapMs != null) summary.push(`frameMax=${payload.maxFrameGapMs}ms`);
  if (payload?.droppedFrameCount != null) summary.push(`drops=${payload.droppedFrameCount}`);
  if (payload?.guidesEvalMaxMs != null) summary.push(`guideMax=${payload.guidesEvalMaxMs}ms`);
  if (payload?.sceneDrawMaxMs != null) summary.push(`sceneMax=${payload.sceneDrawMaxMs}ms`);
  if (payload?.guideLayerSceneDrawMaxMs != null) {
    summary.push(`guideLayerMax=${payload.guideLayerSceneDrawMaxMs}ms`);
  }
  if (payload?.stageLayerSceneDrawMaxMs != null) {
    summary.push(`stageLayerMax=${payload.stageLayerSceneDrawMaxMs}ms`);
  }
  if (payload?.snapApplyMaxMs != null) summary.push(`snapMax=${payload.snapApplyMaxMs}ms`);
  if (payload?.longTaskMaxMs != null) summary.push(`longMax=${payload.longTaskMaxMs}ms`);
  if (payload?.eventTimingMaxMs != null) summary.push(`evtMax=${payload.eventTimingMaxMs}ms`);
  if (payload?.hotEventName && payload?.hotEventMaxDurationMs != null) {
    summary.push(`hot=${payload.hotEventName}:${payload.hotEventMaxDurationMs}ms`);
  }
  if (payload?.durationMs != null) summary.push(`dt=${payload.durationMs}ms`);
  return `[CANVAS-DRAG-PERF] ${eventName}${summary.length ? ` ${summary.join(" ")}` : ""}`;
}

function getCanvasDragPerfStore() {
  if (typeof window === "undefined") return null;
  if (!window.__CANVAS_DRAG_PERF_STORE) {
    window.__CANVAS_DRAG_PERF_STORE = {
      counts: {},
      lastLogAt: {},
      trace: [],
      activeSession: null,
      lastSessionSummary: null,
    };
  }
  return window.__CANVAS_DRAG_PERF_STORE;
}

function createCanvasDragPerfSession(payload = {}, nowMs = getNowMs()) {
  return {
    sessionId: `${payload?.elementId || "unknown"}:${Math.round(nowMs)}`,
    elementId: payload?.elementId || null,
    tipo: payload?.tipo || null,
    startedAt: nowMs,
    eventCount: 0,
    eventCounts: {},
    durationByEvent: {},
    timedEventTotalMs: 0,
    crossElementEventCount: 0,
    renderEventCount: 0,
    moveStats: {
      count: 0,
      lastAt: null,
      totalGapMs: 0,
      maxGapMs: 0,
      minGapMs: null,
      pointerDistanceTotalPx: 0,
      elementDistanceTotalPx: 0,
    },
    frameStats: {
      count: 0,
      lastAt: null,
      totalGapMs: 0,
      maxGapMs: 0,
      minGapMs: null,
      droppedFrameCount: 0,
      rafId: null,
    },
    handlerStats: {
      start: { count: 0, totalDurationMs: 0, maxDurationMs: 0 },
      move: { count: 0, totalDurationMs: 0, maxDurationMs: 0 },
      end: { count: 0, totalDurationMs: 0, maxDurationMs: 0 },
    },
    guidesCommitCount: 0,
    guidesCommitMaxLines: 0,
    guidesCommitSkipCount: 0,
    guidesEvalTotalMs: 0,
    guidesEvalMaxMs: 0,
    sceneDrawTotalMs: 0,
    sceneDrawMaxMs: 0,
    hitDrawTotalMs: 0,
    hitDrawMaxMs: 0,
    guideLayerSceneDrawTotalMs: 0,
    guideLayerSceneDrawMaxMs: 0,
    guideLayerHitDrawTotalMs: 0,
    guideLayerHitDrawMaxMs: 0,
    stageLayerSceneDrawTotalMs: 0,
    stageLayerSceneDrawMaxMs: 0,
    stageLayerHitDrawTotalMs: 0,
    stageLayerHitDrawMaxMs: 0,
    stageBatchDrawCount: 0,
    stageLayerSceneByLabel: {},
    stageLayerHitByLabel: {},
    snapApplyCount: 0,
    snapApplyTotalMs: 0,
    snapApplyMaxMs: 0,
    guideCacheHitCount: 0,
    guideCacheMissCount: 0,
    longTasks: [],
    slowEvents: [],
    longTaskCount: 0,
    longTaskTotalMs: 0,
    longTaskMaxMs: 0,
    eventTimingCount: 0,
    eventTimingTotalMs: 0,
    eventTimingMaxMs: 0,
    maxEventInputDelayMs: 0,
    observers: null,
    phaseTimeline: [],
    hotspots: [],
    gapAnomalies: [],
    frameGapAnomalies: [],
    latestContext: {
      lastGuideSnapshot: null,
      lastGuideCommit: null,
      lastSnapApply: null,
      lastLongTask: null,
      lastSceneDraw: null,
      lastGuideLayerSceneDraw: null,
      lastGuideLayerHitDraw: null,
      lastStageLayerSceneDraw: null,
      lastStageBatchDraw: null,
    },
  };
}

function createObserverRecord(entry, sessionStartedAt) {
  const startTime = Number(entry?.startTime);
  const duration = normalizeDuration(entry?.duration);
  return {
    name: entry?.name || null,
    entryType: entry?.entryType || null,
    startTime: roundMetric(startTime),
    offsetMs: roundMetric(startTime - sessionStartedAt),
    durationMs: roundMetric(duration),
  };
}

function disconnectSessionObservers(session) {
  if (session?.observers) {
    try {
      session.observers.longTask?.disconnect?.();
    } catch {}
    try {
      session.observers.eventTiming?.disconnect?.();
    } catch {}
  }
  stopSessionFrameMonitor(session);
  session.observers = null;
}

function stopSessionFrameMonitor(session) {
  if (
    typeof window === "undefined" ||
    !session?.frameStats ||
    session.frameStats.rafId == null
  ) {
    return;
  }
  try {
    window.cancelAnimationFrame(session.frameStats.rafId);
  } catch {}
  session.frameStats.rafId = null;
}

function pushRankedSessionEntry(list, entry, key = "durationMs") {
  if (!Array.isArray(list) || !entry) return;
  list.push(entry);
  list.sort((a, b) => Number(b?.[key] || 0) - Number(a?.[key] || 0));
  if (list.length > MAX_STORED_ANOMALIES) {
    list.length = MAX_STORED_ANOMALIES;
  }
}

function buildCanvasDragPerfAnomalyContext(session, nowMs) {
  const latestContext = session?.latestContext || {};
  const isRecent = (entry) =>
    Boolean(entry && Number.isFinite(Number(entry.atMs)) && nowMs - Number(entry.atMs) <= ANOMALY_CONTEXT_WINDOW_MS);

  return {
    guideLines: Number(latestContext.lastGuideCommit?.lines || 0),
    guideSignatureSize: latestContext.lastGuideCommit?.signatureSize ?? null,
    guideDecisionX: latestContext.lastGuideSnapshot?.decisionX || "none",
    guideDecisionY: latestContext.lastGuideSnapshot?.decisionY || "none",
    sectionId: latestContext.lastGuideSnapshot?.sectionId || null,
    sectionGuideTargetsCount:
      latestContext.lastGuideSnapshot?.sectionGuideTargetsCount ?? null,
    elementGuidesCount: latestContext.lastGuideSnapshot?.elementGuidesCount ?? null,
    snapXSource: latestContext.lastSnapApply?.xSource || "none",
    snapYSource: latestContext.lastSnapApply?.ySource || "none",
    snapXDelta: latestContext.lastSnapApply?.xAppliedDelta ?? null,
    snapYDelta: latestContext.lastSnapApply?.yAppliedDelta ?? null,
    longTaskNearbyMs: isRecent(latestContext.lastLongTask)
      ? roundMetric(latestContext.lastLongTask.durationMs)
      : null,
    imageSceneDrawNearbyMs: isRecent(latestContext.lastSceneDraw)
      ? roundMetric(latestContext.lastSceneDraw.durationMs)
      : null,
    guideLayerSceneDrawNearbyMs: isRecent(latestContext.lastGuideLayerSceneDraw)
      ? roundMetric(latestContext.lastGuideLayerSceneDraw.durationMs)
      : null,
    guideLayerHitDrawNearbyMs: isRecent(latestContext.lastGuideLayerHitDraw)
      ? roundMetric(latestContext.lastGuideLayerHitDraw.durationMs)
      : null,
    stageLayerSceneNearbyMs: isRecent(latestContext.lastStageLayerSceneDraw)
      ? roundMetric(latestContext.lastStageLayerSceneDraw.durationMs)
      : null,
    stageBatchDrawNearby: isRecent(latestContext.lastStageBatchDraw),
  };
}

function pushCanvasDragPerfGapAnomaly(session, gapMs, nowMs, payload = {}) {
  if (!session || !Number.isFinite(Number(gapMs)) || gapMs < MOVE_GAP_ANOMALY_MS) return;

  const anomaly = {
    elementId: session.elementId,
    tipo: session.tipo,
    gapMs: roundMetric(gapMs),
    offsetMs: roundMetric(nowMs - session.startedAt),
    moveCount: session.moveStats.count,
    pointerDx: payload?.pointerDx ?? null,
    pointerDy: payload?.pointerDy ?? null,
    elementDx: payload?.elementDx ?? null,
    elementDy: payload?.elementDy ?? null,
    ...buildCanvasDragPerfAnomalyContext(session, nowMs),
  };

  pushRankedSessionEntry(session.gapAnomalies, anomaly, "gapMs");
  trackCanvasDragPerf("drag:gap-anomaly", anomaly, {
    throttleMs: 40,
    throttleKey: `drag:gap-anomaly:${session.sessionId}:${session.moveStats.count}`,
  });
}

function pushCanvasDragPerfFrameGapAnomaly(session, gapMs, droppedFrames, nowMs) {
  if (!session || !Number.isFinite(Number(gapMs)) || gapMs < FRAME_GAP_ANOMALY_MS) return;

  const anomaly = {
    elementId: session.elementId,
    tipo: session.tipo,
    gapMs: roundMetric(gapMs),
    offsetMs: roundMetric(nowMs - session.startedAt),
    frameCount: session.frameStats.count,
    droppedFrames: Number.isFinite(Number(droppedFrames)) ? Number(droppedFrames) : 0,
    ...buildCanvasDragPerfAnomalyContext(session, nowMs),
  };

  pushRankedSessionEntry(session.frameGapAnomalies, anomaly, "gapMs");
  trackCanvasDragPerf("drag:frame-gap-anomaly", anomaly, {
    throttleMs: 40,
    throttleKey: `drag:frame-gap-anomaly:${session.sessionId}:${session.frameStats.count}`,
  });
}

function startSessionFrameMonitor(session) {
  if (
    typeof window === "undefined" ||
    !session?.frameStats ||
    typeof window.requestAnimationFrame !== "function"
  ) {
    return;
  }

  const tick = (rafNowMs) => {
    const nowMs = Number.isFinite(Number(rafNowMs)) ? Number(rafNowMs) : getNowMs();
    const stats = session.frameStats;

    if (stats.lastAt != null) {
      const gapMs = nowMs - stats.lastAt;
      stats.count += 1;
      stats.totalGapMs += gapMs;
      stats.maxGapMs = Math.max(stats.maxGapMs, gapMs);
      stats.minGapMs = stats.minGapMs == null ? gapMs : Math.min(stats.minGapMs, gapMs);

      const droppedFrames = Math.max(0, Math.round(gapMs / FRAME_BUDGET_MS) - 1);
      stats.droppedFrameCount += droppedFrames;

      if (gapMs >= FRAME_GAP_ANOMALY_MS) {
        pushCanvasDragPerfFrameGapAnomaly(session, gapMs, droppedFrames, nowMs);
      }
    }

    stats.lastAt = nowMs;
    stats.rafId = window.requestAnimationFrame(tick);
  };

  session.frameStats.rafId = window.requestAnimationFrame(tick);
}

function pushSessionLongTask(session, entry) {
  if (!session || !entry) return;
  const observedAtMs = getNowMs();
  const record = createObserverRecord(entry, session.startedAt);
  const firstAttribution =
    Array.isArray(entry?.attribution) && entry.attribution.length > 0
      ? entry.attribution[0]
      : null;

  if (firstAttribution) {
    record.attribution = {
      name: firstAttribution.name || null,
      containerType: firstAttribution.containerType || null,
      containerName: firstAttribution.containerName || null,
      containerSrc: firstAttribution.containerSrc || null,
    };
  }

  session.longTasks.push(record);
  session.longTaskCount += 1;
  session.longTaskTotalMs += Number(record.durationMs || 0);
  session.longTaskMaxMs = Math.max(session.longTaskMaxMs, Number(record.durationMs || 0));
  session.longTasks.sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0));
  if (session.longTasks.length > 8) session.longTasks.length = 8;
  session.latestContext.lastLongTask = {
    atMs: observedAtMs,
    durationMs: record.durationMs,
  };

  trackCanvasDragPerf("browser:longtask", {
    elementId: session.elementId,
    tipo: session.tipo,
    durationMs: record.durationMs,
    offsetMs: record.offsetMs,
    attribution: record.attribution || null,
  });
}

function pushSessionSlowEvent(session, entry) {
  if (!session || !entry) return;
  const record = createObserverRecord(entry, session.startedAt);
  const processingStart = Number(entry?.processingStart);
  const processingEnd = Number(entry?.processingEnd);
  record.interactionId = Number.isFinite(Number(entry?.interactionId))
    ? Number(entry.interactionId)
    : null;
  record.inputDelayMs =
    Number.isFinite(processingStart) && Number.isFinite(Number(entry?.startTime))
      ? roundMetric(processingStart - Number(entry.startTime))
      : null;
  record.handlingDurationMs =
    Number.isFinite(processingEnd) && Number.isFinite(processingStart)
      ? roundMetric(processingEnd - processingStart)
      : null;

  session.slowEvents.push(record);
  session.eventTimingCount += 1;
  session.eventTimingTotalMs += Number(record.durationMs || 0);
  session.eventTimingMaxMs = Math.max(session.eventTimingMaxMs, Number(record.durationMs || 0));
  session.maxEventInputDelayMs = Math.max(
    session.maxEventInputDelayMs,
    Number(record.inputDelayMs || 0)
  );
  session.slowEvents.sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0));
  if (session.slowEvents.length > 8) session.slowEvents.length = 8;

  trackCanvasDragPerf("browser:event-timing", {
    elementId: session.elementId,
    tipo: session.tipo,
    source: record.name,
    durationMs: record.durationMs,
    inputDelayMs: record.inputDelayMs,
    handlingDurationMs: record.handlingDurationMs,
    offsetMs: record.offsetMs,
  });
}

function attachSessionObservers(session) {
  if (!session) return;

  const observers = {};

  if (typeof PerformanceObserver !== "undefined" && supportsPerformanceEntryType("longtask")) {
    try {
      observers.longTask = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          pushSessionLongTask(session, entry);
        });
      });
      observers.longTask.observe({ type: "longtask", buffered: false });
    } catch {}
  }

  if (typeof PerformanceObserver !== "undefined" && supportsPerformanceEntryType("event")) {
    try {
      observers.eventTiming = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          pushSessionSlowEvent(session, entry);
        });
      });
      observers.eventTiming.observe({
        type: "event",
        buffered: false,
        durationThreshold: 16,
      });
    } catch {}
  }

  session.observers = observers;
  startSessionFrameMonitor(session);
}

function pushCanvasDragPerfTimelineEvent(session, eventName, payload, nowMs) {
  if (!session || session.phaseTimeline.length >= 24) return;
  const shouldRecord =
    eventName.startsWith("drag:") ||
    eventName.startsWith("selection:") ||
    eventName.startsWith("render:") ||
    eventName.startsWith("guides:") ||
    eventName.startsWith("image:layer-draw");
  if (!shouldRecord) return;

  session.phaseTimeline.push({
    eventName,
    offsetMs: roundMetric(nowMs - session.startedAt),
    durationMs: normalizeDuration(payload?.durationMs),
    elementId: payload?.elementId || null,
  });
}

function updateCanvasDragPerfDurationStats(session, eventName, durationMs, payload = {}) {
  if (!session || durationMs == null) return;
  const existing = session.durationByEvent[eventName] || {
    count: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    minDurationMs: null,
    lastDurationMs: 0,
  };

  existing.count += 1;
  existing.totalDurationMs += durationMs;
  existing.maxDurationMs = Math.max(existing.maxDurationMs, durationMs);
  existing.minDurationMs =
    existing.minDurationMs == null ? durationMs : Math.min(existing.minDurationMs, durationMs);
  existing.lastDurationMs = durationMs;
  session.durationByEvent[eventName] = existing;
  session.timedEventTotalMs += durationMs;

  if (eventName === "guides:evaluate") {
    session.guidesEvalTotalMs += durationMs;
    session.guidesEvalMaxMs = Math.max(session.guidesEvalMaxMs, durationMs);
  }
  if (eventName === "image:layer-draw-scene") {
    session.sceneDrawTotalMs += durationMs;
    session.sceneDrawMaxMs = Math.max(session.sceneDrawMaxMs, durationMs);
  }
  if (eventName === "image:layer-draw-hit") {
    session.hitDrawTotalMs += durationMs;
    session.hitDrawMaxMs = Math.max(session.hitDrawMaxMs, durationMs);
  }
  if (eventName === "guides:layer-draw-scene") {
    session.guideLayerSceneDrawTotalMs += durationMs;
    session.guideLayerSceneDrawMaxMs = Math.max(session.guideLayerSceneDrawMaxMs, durationMs);
  }
  if (eventName === "guides:layer-draw-hit") {
    session.guideLayerHitDrawTotalMs += durationMs;
    session.guideLayerHitDrawMaxMs = Math.max(session.guideLayerHitDrawMaxMs, durationMs);
  }
  if (eventName === "stage:layer-draw-scene") {
    session.stageLayerSceneDrawTotalMs += durationMs;
    session.stageLayerSceneDrawMaxMs = Math.max(session.stageLayerSceneDrawMaxMs, durationMs);
    updateNamedDurationMap(
      session.stageLayerSceneByLabel,
      payload?.layerLabel || "unknown",
      durationMs
    );
  }
  if (eventName === "stage:layer-draw-hit") {
    session.stageLayerHitDrawTotalMs += durationMs;
    session.stageLayerHitDrawMaxMs = Math.max(session.stageLayerHitDrawMaxMs, durationMs);
    updateNamedDurationMap(
      session.stageLayerHitByLabel,
      payload?.layerLabel || "unknown",
      durationMs
    );
  }
  if (eventName === "guides:snap-apply") {
    session.snapApplyCount += 1;
    session.snapApplyTotalMs += durationMs;
    session.snapApplyMaxMs = Math.max(session.snapApplyMaxMs, durationMs);
  }
  if (eventName === "drag:handler-start") {
    session.handlerStats.start.count += 1;
    session.handlerStats.start.totalDurationMs += durationMs;
    session.handlerStats.start.maxDurationMs = Math.max(
      session.handlerStats.start.maxDurationMs,
      durationMs
    );
  }
  if (eventName === "drag:handler-move") {
    session.handlerStats.move.count += 1;
    session.handlerStats.move.totalDurationMs += durationMs;
    session.handlerStats.move.maxDurationMs = Math.max(
      session.handlerStats.move.maxDurationMs,
      durationMs
    );
  }
  if (eventName === "drag:handler-end") {
    session.handlerStats.end.count += 1;
    session.handlerStats.end.totalDurationMs += durationMs;
    session.handlerStats.end.maxDurationMs = Math.max(
      session.handlerStats.end.maxDurationMs,
      durationMs
    );
  }
}

function pushCanvasDragPerfHotspot(session, eventName, payload, nowMs, durationMs) {
  if (!session || durationMs == null) return;
  session.hotspots.push({
    eventName,
    durationMs,
    offsetMs: nowMs - session.startedAt,
    elementId: payload?.elementId || null,
    source: payload?.source || null,
    reason: payload?.reason || null,
  });
  session.hotspots.sort((a, b) => b.durationMs - a.durationMs);
  if (session.hotspots.length > 8) {
    session.hotspots.length = 8;
  }
}

function updateCanvasDragPerfMoveStats(session, payload, nowMs) {
  if (!session) return;
  const stats = session.moveStats;
  stats.count += 1;
  if (stats.lastAt != null) {
    const gapMs = nowMs - stats.lastAt;
    stats.totalGapMs += gapMs;
    stats.maxGapMs = Math.max(stats.maxGapMs, gapMs);
    stats.minGapMs = stats.minGapMs == null ? gapMs : Math.min(stats.minGapMs, gapMs);
    if (gapMs >= MOVE_GAP_ANOMALY_MS) {
      pushCanvasDragPerfGapAnomaly(session, gapMs, nowMs, payload);
    }
  }
  stats.lastAt = nowMs;
  stats.pointerDistanceTotalPx += getDistanceFromDelta(payload?.pointerDx, payload?.pointerDy);
  stats.elementDistanceTotalPx += getDistanceFromDelta(payload?.elementDx, payload?.elementDy);
}

function updateCanvasDragPerfSessionContext(session, eventName, payload, nowMs) {
  if (!session) return;

  if (eventName === "guides:snapshot") {
    session.latestContext.lastGuideSnapshot = {
      atMs: nowMs,
      sectionId: payload?.sectionId || null,
      decisionX: payload?.decisionX || "none",
      decisionY: payload?.decisionY || "none",
      sectionGuideTargetsCount: payload?.sectionGuideTargetsCount ?? null,
      elementGuidesCount: payload?.elementGuidesCount ?? null,
    };
    return;
  }

  if (eventName === "guides:commit" || eventName === "guides:commit-skip") {
    session.latestContext.lastGuideCommit = {
      atMs: nowMs,
      lines: Number(payload?.lines || 0),
      signatureSize: payload?.signatureSize ?? null,
    };
    return;
  }

  if (eventName === "guides:snap-apply") {
    session.latestContext.lastSnapApply = {
      atMs: nowMs,
      xSource: payload?.xSource || "none",
      ySource: payload?.ySource || "none",
      xAppliedDelta: payload?.xAppliedDelta ?? null,
      yAppliedDelta: payload?.yAppliedDelta ?? null,
    };
    return;
  }

  if (eventName === "image:layer-draw-scene") {
    session.latestContext.lastSceneDraw = {
      atMs: nowMs,
      durationMs: payload?.durationMs ?? null,
    };
    return;
  }

  if (eventName === "guides:layer-draw-scene") {
    session.latestContext.lastGuideLayerSceneDraw = {
      atMs: nowMs,
      durationMs: payload?.durationMs ?? null,
    };
    return;
  }

  if (eventName === "guides:layer-draw-hit") {
    session.latestContext.lastGuideLayerHitDraw = {
      atMs: nowMs,
      durationMs: payload?.durationMs ?? null,
    };
    return;
  }

  if (eventName === "stage:layer-draw-scene") {
    session.latestContext.lastStageLayerSceneDraw = {
      atMs: nowMs,
      durationMs: payload?.durationMs ?? null,
      layerLabel: payload?.layerLabel || null,
    };
    return;
  }

  if (eventName === "stage:batch-draw-request") {
    session.latestContext.lastStageBatchDraw = {
      atMs: nowMs,
    };
  }
}

function recordCanvasDragPerfSessionSample(eventName, payload, nowMs) {
  const store = getCanvasDragPerfStore();
  const session = store?.activeSession;
  if (!session) return;

  session.eventCount += 1;
  session.eventCounts[eventName] = Number(session.eventCounts[eventName] || 0) + 1;

  if (payload?.elementId && session.elementId && payload.elementId !== session.elementId) {
    session.crossElementEventCount += 1;
  }
  if (eventName.startsWith("render:")) {
    session.renderEventCount += 1;
  }
  if (eventName === "guides:commit") {
    session.guidesCommitCount += 1;
    const lines = Number(payload?.lines || 0);
    session.guidesCommitMaxLines = Math.max(session.guidesCommitMaxLines, lines);
  }
  if (eventName === "guides:commit-skip") {
    session.guidesCommitSkipCount += 1;
  }
  if (eventName === "guides:targets-cache-hit") {
    session.guideCacheHitCount += 1;
  }
  if (eventName === "guides:targets-cache-build") {
    session.guideCacheMissCount += 1;
  }
  if (eventName === "stage:batch-draw-request") {
    session.stageBatchDrawCount += 1;
  }
  if (eventName === "drag:move") {
    updateCanvasDragPerfMoveStats(session, payload, nowMs);
  }

  const durationMs = normalizeDuration(payload?.durationMs);
  updateCanvasDragPerfDurationStats(session, eventName, durationMs, payload);
  updateCanvasDragPerfSessionContext(session, eventName, payload, nowMs);
  pushCanvasDragPerfHotspot(session, eventName, payload, nowMs, durationMs);
  pushCanvasDragPerfTimelineEvent(session, eventName, payload, nowMs);
}

function summarizeCanvasDragPerfSession(session, payload = {}, nowMs = getNowMs()) {
  const durationEntries = Object.entries(session.durationByEvent).map(([eventName, stats]) => ({
    eventName,
    count: stats.count,
    totalDurationMs: roundMetric(stats.totalDurationMs),
    avgDurationMs: roundMetric(getAverage(stats.totalDurationMs, stats.count)),
    maxDurationMs: roundMetric(stats.maxDurationMs),
    minDurationMs: roundMetric(stats.minDurationMs),
    lastDurationMs: roundMetric(stats.lastDurationMs),
  }));
  const topDurationEvents = [...durationEntries]
    .sort((a, b) => (b.maxDurationMs || 0) - (a.maxDurationMs || 0))
    .slice(0, 5);
  const topTotalDurationEvents = [...durationEntries]
    .sort((a, b) => (b.totalDurationMs || 0) - (a.totalDurationMs || 0))
    .slice(0, 5);
  const topEventCounts = Object.entries(session.eventCounts)
    .map(([eventName, count]) => ({ eventName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const hottestEvent = topDurationEvents[0] || null;

  return {
    elementId: payload?.elementId || session.elementId,
    tipo: payload?.tipo || session.tipo,
    sessionId: session.sessionId,
    reason: payload?.reason || null,
    totalDurationMs: roundMetric(nowMs - session.startedAt),
    eventCount: session.eventCount,
    timedEventTotalMs: roundMetric(session.timedEventTotalMs),
    moveCount: session.moveStats.count,
    avgMoveGapMs: roundMetric(getAverage(session.moveStats.totalGapMs, Math.max(0, session.moveStats.count - 1))),
    maxMoveGapMs: roundMetric(session.moveStats.maxGapMs),
    minMoveGapMs: roundMetric(session.moveStats.minGapMs),
    avgFrameGapMs: roundMetric(getAverage(session.frameStats.totalGapMs, session.frameStats.count)),
    maxFrameGapMs: roundMetric(session.frameStats.maxGapMs),
    minFrameGapMs: roundMetric(session.frameStats.minGapMs),
    droppedFrameCount: session.frameStats.droppedFrameCount,
    pointerDistanceTotalPx: roundMetric(session.moveStats.pointerDistanceTotalPx),
    elementDistanceTotalPx: roundMetric(session.moveStats.elementDistanceTotalPx),
    renderEventCount: session.renderEventCount,
    crossElementEventCount: session.crossElementEventCount,
    guidesCommitCount: session.guidesCommitCount,
    guidesCommitMaxLines: session.guidesCommitMaxLines,
    guidesCommitSkipCount: session.guidesCommitSkipCount,
    guidesEvalTotalMs: roundMetric(session.guidesEvalTotalMs),
    guidesEvalMaxMs: roundMetric(session.guidesEvalMaxMs),
    sceneDrawTotalMs: roundMetric(session.sceneDrawTotalMs),
    sceneDrawMaxMs: roundMetric(session.sceneDrawMaxMs),
    hitDrawTotalMs: roundMetric(session.hitDrawTotalMs),
    hitDrawMaxMs: roundMetric(session.hitDrawMaxMs),
    guideLayerSceneDrawTotalMs: roundMetric(session.guideLayerSceneDrawTotalMs),
    guideLayerSceneDrawMaxMs: roundMetric(session.guideLayerSceneDrawMaxMs),
    guideLayerHitDrawTotalMs: roundMetric(session.guideLayerHitDrawTotalMs),
    guideLayerHitDrawMaxMs: roundMetric(session.guideLayerHitDrawMaxMs),
    stageLayerSceneDrawTotalMs: roundMetric(session.stageLayerSceneDrawTotalMs),
    stageLayerSceneDrawMaxMs: roundMetric(session.stageLayerSceneDrawMaxMs),
    stageLayerHitDrawTotalMs: roundMetric(session.stageLayerHitDrawTotalMs),
    stageLayerHitDrawMaxMs: roundMetric(session.stageLayerHitDrawMaxMs),
    stageBatchDrawCount: session.stageBatchDrawCount,
    topStageSceneLayers: buildTopNamedDurationEntries(session.stageLayerSceneByLabel),
    topStageHitLayers: buildTopNamedDurationEntries(session.stageLayerHitByLabel),
    snapApplyCount: session.snapApplyCount,
    snapApplyTotalMs: roundMetric(session.snapApplyTotalMs),
    snapApplyMaxMs: roundMetric(session.snapApplyMaxMs),
    guideCacheHitCount: session.guideCacheHitCount,
    guideCacheMissCount: session.guideCacheMissCount,
    handlerStartMaxMs: roundMetric(session.handlerStats.start.maxDurationMs),
    handlerMoveMaxMs: roundMetric(session.handlerStats.move.maxDurationMs),
    handlerEndMaxMs: roundMetric(session.handlerStats.end.maxDurationMs),
    longTaskCount: session.longTaskCount,
    longTaskTotalMs: roundMetric(session.longTaskTotalMs),
    longTaskMaxMs: roundMetric(session.longTaskMaxMs),
    eventTimingCount: session.eventTimingCount,
    eventTimingTotalMs: roundMetric(session.eventTimingTotalMs),
    eventTimingMaxMs: roundMetric(session.eventTimingMaxMs),
    maxEventInputDelayMs: roundMetric(session.maxEventInputDelayMs),
    hotEventName: hottestEvent?.eventName || null,
    hotEventMaxDurationMs: hottestEvent?.maxDurationMs ?? null,
    topDurationEvents,
    topTotalDurationEvents,
    topEventCounts,
    hotspots: session.hotspots.map((entry) => ({
      ...entry,
      durationMs: roundMetric(entry.durationMs),
      offsetMs: roundMetric(entry.offsetMs),
    })),
    gapAnomalies: session.gapAnomalies,
    frameGapAnomalies: session.frameGapAnomalies,
    longTasks: session.longTasks,
    slowEvents: session.slowEvents,
    phaseTimeline: session.phaseTimeline,
  };
}

export function startCanvasDragPerfSession(payload = {}) {
  if (!isCanvasDragPerfEnabled()) return null;

  const store = getCanvasDragPerfStore();
  if (!store) return null;

  if (store.activeSession) {
    disconnectSessionObservers(store.activeSession);
    store.activeSession = null;
  }

  const nowMs = getNowMs();
  store.activeSession = createCanvasDragPerfSession(payload, nowMs);
  attachSessionObservers(store.activeSession);
  if (typeof window !== "undefined") {
    window.__CANVAS_DRAG_PERF_ACTIVE_SESSION = store.activeSession;
  }
  return store.activeSession.sessionId;
}

export function endCanvasDragPerfSession(payload = {}) {
  if (!isCanvasDragPerfEnabled()) return null;

  const store = getCanvasDragPerfStore();
  const session = store?.activeSession;
  if (!store || !session) return null;

  const nowMs = getNowMs();
  disconnectSessionObservers(session);
  stopSessionFrameMonitor(session);
  const summaryPayload = summarizeCanvasDragPerfSession(session, payload, nowMs);
  store.activeSession = null;
  store.lastSessionSummary = summaryPayload;
  if (typeof window !== "undefined") {
    window.__CANVAS_DRAG_PERF_ACTIVE_SESSION = null;
    window.__CANVAS_DRAG_PERF_LAST_SESSION = summaryPayload;
  }
  trackCanvasDragPerf("drag:timing-summary", summaryPayload, {
    throttleKey: `drag:timing-summary:${session.sessionId}`,
  });
  return summaryPayload;
}

export function trackCanvasDragPerf(eventName, payload = {}, options = {}) {
  if (!isCanvasDragPerfEnabled()) return;

  const safeEventName = String(eventName || "unknown");
  const nowMs = getNowMs();
  const throttleMs = Number(options?.throttleMs || 0);
  const throttleKey = String(options?.throttleKey || safeEventName);
  const store = getCanvasDragPerfStore();
  if (!store) return;

  const nextCount = Number(store.counts[safeEventName] || 0) + 1;
  store.counts[safeEventName] = nextCount;
  recordCanvasDragPerfSessionSample(safeEventName, payload, nowMs);

  if (throttleMs > 0) {
    const lastLogAt = Number(store.lastLogAt[throttleKey] || 0);
    if (nowMs - lastLogAt < throttleMs) {
      return;
    }
    store.lastLogAt[throttleKey] = nowMs;
  }

  const entry = {
    eventName: safeEventName,
    count: nextCount,
    nowMs: roundMetric(nowMs),
    ...payload,
  };

  store.trace.push(entry);
  if (store.trace.length > 400) {
    store.trace.splice(0, store.trace.length - 400);
  }
  window.__CANVAS_DRAG_PERF_TRACE = store.trace;

  if (!shouldEmitCanvasDragPerfConsole(safeEventName)) {
    return;
  }

  const summary = getCanvasDragPerfSummary(safeEventName, entry, nextCount);
  if (isCanvasDragPerfExpanded() && typeof console.group === "function") {
    console.group(summary);
    console.log(entry);
    console.groupEnd();
    return;
  }

  console.log(summary, entry);
}

export function startCanvasDragPerfSpan(eventName, payload = {}, options = {}) {
  if (!isCanvasDragPerfEnabled()) return null;

  const startedAt = getNowMs();
  return (extraPayload = {}) => {
    trackCanvasDragPerf(
      eventName,
      {
        ...payload,
        ...extraPayload,
        durationMs: roundMetric(getNowMs() - startedAt),
      },
      options
    );
  };
}

export function buildCanvasDragPerfDiff(previousSnapshot = null, nextSnapshot = {}) {
  const prev = previousSnapshot && typeof previousSnapshot === "object"
    ? previousSnapshot
    : null;
  const next = nextSnapshot && typeof nextSnapshot === "object"
    ? nextSnapshot
    : {};

  const changedKeys = [];
  const changes = {};

  Object.keys(next).forEach((key) => {
    const previousValue = prev?.[key];
    const nextValue = next[key];
    if (Object.is(previousValue, nextValue)) return;
    changedKeys.push(key);
    changes[key] = {
      previous: previousValue ?? null,
      next: nextValue ?? null,
    };
  });

  return {
    changedKeys,
    changes,
    changeCount: changedKeys.length,
    isFirstSnapshot: !prev,
  };
}
