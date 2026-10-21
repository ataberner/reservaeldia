import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Read-only analysis of the full-editor experiment. This module does not load
// React, Konva, Firebase, the runner, or the application. Missing observations
// are unknown, not zero. Nested diagnostic spans must never be added as CPU.
const array = (value) => Array.isArray(value) ? value : [];
const finite = (value) => Number.isFinite(value);
const sum = (values) => values.reduce((total, value) => total + value, 0);
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const quantile = (sorted, fraction) => sorted.length ? sorted[Math.floor((sorted.length - 1) * fraction)] : null;
const hasPose = (pose) => finite(pose?.x) && finite(pose?.y);
const poseEqual = (left, right) => hasPose(left) && hasPose(right) &&
  ["x", "y"].every((axis) => Math.abs(left[axis] - right[axis]) < .01);
const movement = (before, after) => hasPose(before) && hasPose(after)
  ? Math.abs(after.x - before.x) + Math.abs(after.y - before.y) : null;
const RESOLVE = "CanvasStageContentComposer.jsx:resolveLiveDragSelectionSnapshot";
const EXPECTED_CHANGED_SOURCES = new Set([
  "src/hooks/useGuiasCentrado.js",
  "src/components/editor/textSystem/render/konva/SelectionBoundsIndicator.jsx",
]);

export function distribution(values) {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return { count: sorted.length,
    median: sorted.length ? (sorted[(sorted.length - 1) >> 1] + sorted[middle]) / 2 : null,
    min: sorted.length ? sorted[0] : null, max: sorted.length ? sorted.at(-1) : null,
    p50: quantile(sorted, .5), p95: quantile(sorted, .95), p99: quantile(sorted, .99),
    mean: sorted.length ? sum(sorted) / sorted.length : null };
}

function gaps(timestamps) {
  return array(timestamps).slice(1).map((value, index) => value - timestamps[index])
    .filter((value) => finite(value) && value >= 0);
}

function alert(code, detail, severity = "warning") { return { code, severity, detail }; }

export function validateRecordedGesture(trial) {
  const failed = [], missing = [], notes = [];
  const before = trial.before, final = trial.final;
  const recordedFailure = trial.functional?.passed === false || trial.functionalValid === false || trial.valid === false;
  if (recordedFailure) failed.push("runner recorded functional failure");
  const delta = movement(before?.object, final?.object);
  if (delta === null) missing.push("before/final model position");
  else if (delta <= 1) failed.push("model movement must exceed one canvas unit (Manhattan)");
  if (typeof final?.dragging !== "boolean") missing.push("final native drag state");
  else if (final.dragging) failed.push("native drag still active after release");
  if (!finite(final?.guideCount)) missing.push("final guide count");
  else if (final.guideCount !== 0) failed.push("guides remain after release");
  for (const [label, snapshot] of [["final", final], ["settled", trial.settled]]) {
    if (!snapshot) continue;
    if (!hasPose(snapshot.canonicalPose) || !hasPose(snapshot.expectedCanonicalStagePose)) missing.push(`${label} canonical geometry evidence`);
    else if (!poseEqual(snapshot.canonicalPose, snapshot.expectedCanonicalStagePose)) failed.push(`${label} canonical geometry mismatch`);
  }
  if (!final) missing.push("final snapshot");
  if (trial.savedPose) {
    if (!poseEqual(trial.savedPose, trial.settled?.object || final?.object)) failed.push("saved/model position mismatch");
  } else if (trial.kind === "handoff") notes.push("persistence observed only at the end of this handoff batch, not this gesture");
  else missing.push("saved pose");
  if (trial.settled && final && !poseEqual(trial.settled.object, final.object)) failed.push("model position changed during release settling");
  if (trial.family === "multiselect") {
    if (!hasPose(trial.companionBefore?.object) || !hasPose(trial.companionFinal?.object) || !hasPose(before?.object) || !hasPose(final?.object)) missing.push("multiselect companion movement");
    else for (const axis of ["x", "y"]) {
      if (Math.abs((trial.companionFinal.object[axis] - trial.companionBefore.object[axis]) -
        (final.object[axis] - before.object[axis])) >= .01) failed.push(`companion ${axis} translation differs`);
    }
  }
  if (before?.object?.seccionId !== undefined && final?.object?.seccionId !== undefined && before.object.seccionId !== final.object.seccionId) {
    notes.push("section changed; model delta is section-local and cannot be interpreted as cursor displacement");
  }
  if (trial.metrics?.endedAt <= trial.metrics?.startedAt || !finite(trial.metrics?.startedAt) || !finite(trial.metrics?.endedAt)) missing.push("positive measurement window");
  return { status: failed.length ? "failed" : missing.length ? "insufficient" : "verified-recorded-invariants",
    failed, missing, notes, modelManhattanDelta: delta,
    scope: "Recorded movement, canonical pose, release cleanup and available persistence only; not a substitute for runner assertions or visual inspection." };
}

function identityOf(trial, manifest = {}) {
  const scale = trial.effectiveScale ?? trial.zoom;
  return { family: trial.family ?? null, count: trial.actualCount ?? trial.count ?? null,
    scale: finite(scale) ? Number(scale.toFixed(6)) : null, trajectory: trial.trajectory ?? trial.metrics?.trajectory ?? "sweep",
    alt: typeof trial.alt === "boolean" ? trial.alt : null,
    traced: typeof trial.traced === "boolean" ? trial.traced : manifest.cdpTraceEnabled === false ? false : null,
    // Keep consecutive-handoff and opposite-direction populations separate.
    kind: trial.kind ?? "measurement", direction: trial.direction ?? trial.metrics?.direction ?? 1 };
}

function metricSpans(metrics, predicate = () => true) {
  const names = [...new Set(metrics.flatMap((metric) => Object.keys(metric.spans || {})))].filter(predicate).sort();
  return Object.fromEntries(names.map((name) => {
    const entries = metrics.map((metric) => metric.spans?.[name]).filter(Boolean);
    return [name, { gesturesObserved: entries.length, gesturesMissingEntry: metrics.length - entries.length,
      callsPerObservedGesture: distribution(entries.map((entry) => entry.count)),
      inclusiveMsPerObservedGesture: distribution(entries.map((entry) => entry.totalMs)),
      pooledCallDurationMs: distribution(entries.flatMap((entry) => array(entry.samplesMs))) }];
  }));
}

function countValues(values) {
  const result = {};
  for (const value of values) result[String(value ?? "unknown")] = (result[String(value ?? "unknown")] || 0) + 1;
  return result;
}

function unionDuration(entries, lower, upper) {
  if (entries.some((entry) => !finite(entry.startedAt) || !finite(entry.endedAt) || entry.endedAt < entry.startedAt)) return null;
  const intervals = entries.map((entry) => [Math.max(lower, entry.startedAt), Math.min(upper, entry.endedAt)])
    .filter(([start, end]) => end > start).sort((left, right) => left[0] - right[0]);
  let total = 0, previousEnd = -Infinity;
  for (const [start, end] of intervals) {
    total += Math.max(0, end - Math.max(start, previousEnd));
    previousEnd = Math.max(previousEnd, end);
  }
  return total;
}

function callbackCostShare(samples, selectSpans) {
  const topLevel = samples.filter(({ sample }) => !sample.parentSampleId);
  const observations = topLevel.map(({ sample }) => ({ duration: sample.durationMs,
    unionMs: unionDuration(selectSpans(sample), sample.startedAt, sample.endedAt) }));
  const valid = observations.filter((entry) => finite(entry.unionMs) && finite(entry.duration) && entry.duration > 0);
  const total = sum(valid.map((entry) => entry.unionMs)), denominator = sum(valid.map((entry) => entry.duration));
  return { observedTopLevelCallbacks: valid.length, missingIntervalCallbacks: observations.length - valid.length,
    intervalUnionMsPerCallback: distribution(valid.map((entry) => entry.unionMs)),
    intervalUnionMsTotal: valid.length ? total : null, observedCallbackTimeMs: valid.length ? denominator : null,
    percentOfObservedCallbackTime: denominator ? 100 * total / denominator : null,
    meaning: "Union of recorded intervals within each complete top-level composer callback; no sum across different function names. Diagnostic overhead included, not predicted savings." };
}

function releaseWindows(metrics) {
  const observations = metrics.flatMap((metric) => {
    const releases = array(metric.releases).filter((release) => finite(release.observedAt) && release.observedAt >= metric.startedAt && release.observedAt <= metric.endedAt);
    if (!releases.length) return [];
    const at = releases.at(-1).observedAt, frames = array(metric.frames), pre = [], post = [], crossing = [];
    for (let index = 1; index < frames.length; index += 1) {
      const start = frames[index - 1], end = frames[index];
      if (!finite(start) || !finite(end) || end < start) continue;
      (end <= at ? pre : start >= at ? post : crossing).push(end - start);
    }
    const entries = metric.longTasks?.available ? array(metric.longTasks.entries) : null;
    const longTaskOverlap = (start, end) => entries ? sum(entries.map((entry) =>
      Math.max(0, Math.min(end, entry.startTime + entry.duration) - Math.max(start, entry.startTime))).filter(finite)) : null;
    return [{ releaseCount: releases.length, pre, post, crossing,
      beforeReleaseMs: at - metric.startedAt, afterReleaseMs: metric.endedAt - at,
      beforeReleaseLongTaskOverlapMs: longTaskOverlap(metric.startedAt, at),
      afterReleaseLongTaskOverlapMs: longTaskOverlap(at, metric.endedAt) }];
  });
  return { availableGestures: observations.length, missingGestures: metrics.length - observations.length,
    multipleReleaseGestures: observations.filter((entry) => entry.releaseCount > 1).length,
    probeStartToReleaseMs: distribution(observations.map((entry) => entry.beforeReleaseMs)),
    releaseToProbeStopMs: distribution(observations.map((entry) => entry.afterReleaseMs)),
    beforeReleaseRafIntervalMsPooled: distribution(observations.flatMap((entry) => entry.pre)),
    afterReleaseRafIntervalMsPooled: distribution(observations.flatMap((entry) => entry.post)),
    crossingReleaseRafIntervalMsPooled: distribution(observations.flatMap((entry) => entry.crossing)),
    beforeReleaseLongTaskOverlapMsPerGesture: distribution(observations.map((entry) => entry.beforeReleaseLongTaskOverlapMs)),
    afterReleaseLongTaskOverlapMsPerGesture: distribution(observations.map((entry) => entry.afterReleaseLongTaskOverlapMs)),
    meaning: "Split at the browser mouseup capture-listener timestamp. Probe start precedes mousedown dispatch, whose exact browser timestamp is not recorded. Pre-release includes drag startup; post-release includes settling and measurement-command delays. Neither segment proves paint or exclusive drag CPU. CDP totals are not partitioned." };
}

function summarizeExistingSessions(metrics) {
  const sessions = metrics.map((metric) => metric.existingSession).filter((session) => session && typeof session === "object");
  const fields = ["totalDurationMs", "eventCount", "moveCount", "renderEventCount", "crossElementEventCount",
    "guidesCommitCount", "guidesCommitMaxLines", "guidesCommitSkipCount", "guidesEvalTotalMs", "guidesEvalMaxMs",
    "guideLayerSceneDrawTotalMs", "guideLayerSceneDrawMaxMs", "guideLayerHitDrawTotalMs", "guideLayerHitDrawMaxMs",
    "stageLayerSceneDrawTotalMs", "stageLayerSceneDrawMaxMs", "stageLayerHitDrawTotalMs", "stageLayerHitDrawMaxMs",
    "stageBatchDrawCount", "sceneDrawTotalMs", "sceneDrawMaxMs", "hitDrawTotalMs", "hitDrawMaxMs",
    "snapApplyCount", "snapApplyTotalMs", "snapApplyMaxMs", "guideCacheHitCount", "guideCacheMissCount",
    "handlerStartMaxMs", "handlerMoveMaxMs", "handlerEndMaxMs"];
  const byField = Object.fromEntries(fields.map((field) => {
    const values = sessions.map((session) => session[field]).filter(finite);
    return [field, { perObservedSession: distribution(values), missingFieldSessions: sessions.length - values.length }];
  }));
  const namedLayers = (field) => {
    const lists = sessions.map((session) => session[field]).filter(Array.isArray);
    const names = [...new Set(lists.flatMap((entries) => entries.map((entry) => entry.name).filter(Boolean)))].sort();
    return { sessionsWithList: lists.length, sessionsMissingList: sessions.length - lists.length,
      listsAtTopFiveLimit: lists.filter((entries) => entries.length >= 5).length,
      byRecordedLabel: Object.fromEntries(names.map((name) => {
        const entries = lists.map((list) => list.find((entry) => entry.name === name)).filter(Boolean);
        return [name, { listedSessions: entries.length, sessionsNotListingLabel: lists.length - entries.length,
          callsPerListedSession: distribution(entries.map((entry) => entry.count)),
          totalMsPerListedSession: distribution(entries.map((entry) => entry.totalDurationMs)),
          maxCallMsPerListedSession: distribution(entries.map((entry) => entry.maxDurationMs)),
          meanCallMsPerListedSession: distribution(entries.map((entry) => entry.avgDurationMs)) }];
      })),
      meaning: "Existing session top-five lists ranked by total duration. A label absent from a list is unknown, not zero; five entries may hide additional layers. Labels come from __canvasStagePerfLabel, not prototype-wrapper fallback names." };
  };
  return { availableSessions: sessions.length, missingOrUnavailableGestures: metrics.length - sessions.length,
    reasons: countValues(sessions.map((session) => session.reason)), types: countValues(sessions.map((session) => session.tipo)),
    perSessionFields: byField,
    topStageSceneLayers: namedLayers("topStageSceneLayers"), topStageHitLayers: namedLayers("topStageHitLayers"),
    source: "metrics.existingSession, the existing canvasDragPerf session summary; independent from prototype-wrapper spans.",
    limitations: ["Counters and durations cover the product diagnostic session, which can end in drag-end before the probe's final RAFs and post-release work. Its summary does not expose absolute start/end timestamps for exact clipping.",
      "Existing session statistics update before console throttling; recorded durations are rounded by the existing logger.",
      "renderEventCount counts instrumented render:* events, not all component renders or React root commits.",
      "sceneDrawTotalMs/hitDrawTotalMs are the existing image:layer-draw channels; stageLayer* and guideLayer* are separate channels.",
      "Instance draw wrappers can retain original methods before prototype instrumentation. Prototype Konva spans therefore cannot establish complete per-layer coverage; fallback label guides is not layer identity.",
      "Do not add these durations to Konva prototype spans, guide spans, React durations or each other as exclusive CPU; channels and windows can overlap."] };
}

function summarizeRealSamples(metrics) {
  const available = metrics.filter((metric) => metric.realSamples);
  const all = available.flatMap((metric, gestureIndex) => array(metric.realSamples.samples).map((sample) => ({ sample, metric, gestureIndex })));
  const usable = all.filter(({ sample }) => !sample.truncated && !sample.incomplete && !sample.stackMismatch);
  const events = usable.flatMap(({ sample }) => array(sample.events));
  const repeated = [], observedEqual = [], cache = events.filter((event) => event.kind === "target-cache");
  const captureStart = [], captureEnd = [];
  let samplesWithRepeatedEqualResults = 0;
  for (const { sample, metric, gestureIndex } of usable) {
    const pairs = array(sample.repeatedSelectionResults);
    if (pairs.some((pair) => pair.sameBounds && pair.sameRecordedContext)) samplesWithRepeatedEqualResults += 1;
    for (const pair of pairs) {
      const nextEvent = array(sample.events).find((event) => event.sequence === pair.nextEvent);
      const span = array(sample.spans).find((entry) => entry.id === nextEvent?.spanId && entry.name === RESOLVE);
      const record = { gestureIndex, sampleId: sample.id, handler: sample.handler, pipeline: sample.pipeline,
        session: sample.session, endSession: sample.endSession, elementId: sample.elementId,
        previousEvent: pair.previousEvent, nextEvent: pair.nextEvent,
        sameBounds: pair.sameBounds, sameRecordedContext: pair.sameRecordedContext,
        nextResolutionInclusiveMs: span?.durationMs ?? null,
        nextResolutionExclusiveAmongMeasuredMs: span?.exclusiveAmongMeasuredMs ?? null };
      repeated.push(record);
      if (pair.sameBounds && pair.sameRecordedContext) observedEqual.push(record);
    }
    // A nearest preceding capture listener is a timing correlation only. It
    // does not measure hardware latency and cannot prove event causality.
    const input = array(metric.nativeInputs).filter((entry) => finite(entry.observedAt) && entry.observedAt <= sample.startedAt).at(-1);
    if (input) { captureStart.push(sample.startedAt - input.observedAt); captureEnd.push(sample.endedAt - input.observedAt); }
  }
  const costs = Object.fromEntries([...new Set(usable.flatMap(({ sample }) => array(sample.spans).map((span) => span.name)))].sort().map((name) => {
    const entries = usable.flatMap(({ sample }) => array(sample.spans).filter((span) => span.name === name));
    return [name, { calls: entries.length, inclusiveMs: distribution(entries.map((entry) => entry.durationMs)),
      exclusiveAmongMeasuredMs: distribution(entries.map((entry) => entry.exclusiveAmongMeasuredMs)) }];
  }));
  const counts = Object.fromEntries([...new Set(usable.flatMap(({ sample }) => Object.keys(sample.counts || {})))].sort().map((name) =>
    [name, distribution(usable.map(({ sample }) => sample.counts?.[name] || 0))]));
  const sources = events.filter((event) => ["guide-outcome", "overlay-request", "authoritative-drag-sample"].includes(event.kind))
    .map((event) => `${event.kind}:${event.source ?? event.request?.source ?? "unknown"}`);
  const outsideNames = [...new Set(available.flatMap((metric) => Object.keys(metric.realSamples.outsideCounts || {})))].sort();
  const names = [...new Set(usable.flatMap(({ sample }) => array(sample.spans).map((span) => span.name)))].sort();
  return { availableGestures: available.length, missingGestures: metrics.length - available.length,
    truncatedGestures: available.filter((metric) => metric.realSamples.truncated).length,
    recordedSamples: all.length, usableSamples: usable.length, excludedIncompleteOrTruncatedSamples: all.length - usable.length,
    callbackDurationMsPooled: distribution(usable.map(({ sample }) => sample.durationMs)),
    captureToCallbackStartMsPooled: distribution(captureStart), captureToCallbackEndMsPooled: distribution(captureEnd),
    latencyMeaning: "Composer callback duration plus nearest preceding browser mousemove capture correlation; not physical input latency, paint latency or FPS.",
    samplesByHandler: countValues(usable.map(({ sample }) => sample.handler)),
    samplesByPipeline: countValues(usable.map(({ sample }) => sample.pipeline)), eventsBySource: countValues(sources),
    samplesMissingSession: usable.filter(({ sample }) => !sample.session?.sessionId).length,
    samplesChangingRecordedSession: usable.filter(({ sample }) => !equal(sample.session, sample.endSession)).length,
    sessionIdentitiesPerGesture: distribution(available.map((metric) => new Set(array(metric.realSamples.samples).map((sample) => sample.session?.sessionId).filter(Boolean)).size)),
    selectionResolutionAttemptsPerSample: distribution(usable.map(({ sample }) => sample.selectionResolutionAttempts)),
    selectionResultsPerSample: distribution(usable.map(({ sample }) => sample.selectionResolutionCount)),
    adjacentResolutionPairs: repeated.length, equalBoundsAndRecordedContextPairs: observedEqual.length,
    samplesWithRepeatedEqualResults,
    observedDuplicateResolutionInclusiveMsPooled: distribution(observedEqual.map((entry) => entry.nextResolutionInclusiveMs)),
    observedDuplicateResolutionInclusiveMsTotal: usable.length ? sum(observedEqual.map((entry) => entry.nextResolutionInclusiveMs).filter(finite)) : null,
    observedDuplicateResolutionCostMissing: observedEqual.filter((entry) => !finite(entry.nextResolutionInclusiveMs)).length,
    duplicateExamples: observedEqual.slice(0, 6),
    observedDuplicateResolutionShare: callbackCostShare(usable, (sample) => {
      const nextIds = new Set(array(sample.repeatedSelectionResults).filter((pair) => pair.sameBounds && pair.sameRecordedContext).map((pair) => pair.nextEvent));
      const spanIds = new Set(array(sample.events).filter((event) => nextIds.has(event.sequence)).map((event) => event.spanId));
      return array(sample.spans).filter((span) => span.name === RESOLVE && spanIds.has(span.id));
    }),
    duplicateMeaning: "Observed equal adjacent results within one callback and equal recorded context. This is not proof of reusable state, safe optimization or attainable savings. Inclusive costs may overlap other spans.",
    cache: { observations: cache.length, hits: cache.filter((event) => event.cacheHit).length,
      misses: cache.filter((event) => !event.cacheHit).length, sameSession: cache.filter((event) => event.sameSession).length,
      targetCount: distribution(cache.map((event) => event.targetCount)),
      sectionCandidateCount: distribution(cache.map((event) => event.sectionCandidateCount)),
      meaning: "Target-cache result; a hit still checks its fingerprint. No inference of bounding-box reads avoided." },
    countsPerSample: counts, measuredCosts: costs,
    functionShareOfTopLevelCallbackTime: Object.fromEntries(names.map((name) => [name,
      callbackCostShare(usable, (sample) => array(sample.spans).filter((span) => span.name === name))])),
    outsideCallbackCountsPerObservedGesture: Object.fromEntries(outsideNames.map((name) =>
      [name, distribution(available.map((metric) => metric.realSamples.outsideCounts?.[name] || 0))])),
    caveats: [...new Set(available.flatMap((metric) => array(metric.realSamples.caveats)))] };
}

function summarizeRow(identity, records) {
  const metrics = records.map(({ trial }) => trial.metrics);
  const rafGaps = metrics.flatMap((metric) => gaps(metric.frames));
  const cdp = (name) => distribution(metrics.map((metric) => finite(metric.cdpMetricDeltas?.[name]) ? metric.cdpMetricDeltas[name] * 1000 : null));
  const react = metrics.filter((metric) => metric.reactRootCommits?.available === true);
  const longTasks = metrics.filter((metric) => metric.longTasks?.available === true);
  const longEntries = longTasks.flatMap((metric) => array(metric.longTasks.entries));
  const strictChecks = records.map(({ trial }) => trial.strictInteractionCheck).filter((check) => typeof check?.passed === "boolean");
  return { identity, repetitions: records.length, repeatIds: records.map(({ trial }) => trial.repeat ?? null),
    recordedTrialIndices: records.map(({ index }) => index),
    strictInteraction: { checkedGestures: strictChecks.length, missingGestures: records.length - strictChecks.length,
      passed: strictChecks.filter((check) => check.passed).length, failed: strictChecks.filter((check) => !check.passed).length,
      failureMessages: [...new Set(strictChecks.filter((check) => !check.passed).map((check) => check.message || "no message"))],
      meaning: "Separate full interaction-contract check. A failure is retained even when observable pose/visual cleanup/persistence permit measurement." },
    observedEffectiveScale: distribution(records.map(({ trial }) => trial.effectiveScale ?? trial.zoom)),
    measuredWindowMs: distribution(metrics.map((metric) => metric.endedAt - metric.startedAt)),
    releaseWindows: releaseWindows(metrics),
    raf: { pooledIntervalMs: distribution(rafGaps), perGestureMedianIntervalMs: distribution(metrics.map((metric) => distribution(gaps(metric.frames)).median)),
      perGestureP95IntervalMs: distribution(metrics.map((metric) => distribution(gaps(metric.frames)).p95)),
      callbackHzPerGesture: distribution(metrics.map((metric) => {
        const frames = array(metric.frames); return frames.length > 1 && frames.at(-1) > frames[0] ? (frames.length - 1) * 1000 / (frames.at(-1) - frames[0]) : null;
      })),
      gapsOver33_4ms: rafGaps.filter((gap) => gap > 33.4).length, gapsOver50ms: rafGaps.filter((gap) => gap > 50).length,
      fractionOver33_4ms: rafGaps.length ? rafGaps.filter((gap) => gap > 33.4).length / rafGaps.length : null,
      meaning: "RAF callback scheduling in this browser; not presented frames or physical display FPS." },
    cdp: { scriptMsPerGesture: cdp("ScriptDuration"), taskMsPerGesture: cdp("TaskDuration"),
      layoutMsPerGesture: cdp("LayoutDuration"), styleMsPerGesture: cdp("RecalcStyleDuration"),
      meaning: "CDP cumulative deltas converted seconds to ms. Separate CDP commands bracket most of the probe window; command latency can make the windows differ. No dragmove-only or release-phase attribution." },
    observedInputIntervalMsPooled: distribution(metrics.flatMap((metric) => gaps(metric.inputs))),
    dispatchedInputIntervalMsPooled: distribution(metrics.flatMap((metric) => gaps(metric.dispatches))),
    spans: metricSpans(metrics), cacheSpans: metricSpans(metrics, (name) => /getSectionGuideTargets|getObjectCache|readGuideTargetGeometrySample|getNodeBox/.test(name)),
    perf01Spans: metricSpans(metrics, (name) => /readTextGuideGeometryDiagnostics|maybeLogOverlayTextMismatch|DOM:getBoundingClientRect/.test(name)),
    konvaSpans: metricSpans(metrics, (name) => name.startsWith("Konva:")),
    existingCanvasDragSessions: summarizeExistingSessions(metrics),
    realSamples: summarizeRealSamples(metrics),
    reactRootCommits: { availableGestures: react.length, missingOrUnavailableGestures: metrics.length - react.length,
      commitsPerObservedGesture: distribution(react.map((metric) => array(metric.reactRootCommits.commits).length)),
      distinctRootsPerObservedGesture: distribution(react.map((metric) => new Set(array(metric.reactRootCommits.commits).map((commit) => `${commit.rendererId}:${commit.rootId}`)).size)),
      renderers: [...new Set(react.flatMap((metric) => array(metric.reactRootCommits.renderers).map((renderer) => `${renderer.name ?? "unknown"}@${renderer.version ?? "unknown"}`)))],
      unavailableReasons: [...new Set(metrics.filter((metric) => !metric.reactRootCommits?.available).map((metric) => metric.reactRootCommits?.reason || "not recorded"))],
      meaning: "DevTools root commit callbacks; not component renders or React durations." },
    longTasks: { availableGestures: longTasks.length, missingOrUnavailableGestures: metrics.length - longTasks.length,
      truncatedGestures: longTasks.filter((metric) => metric.longTasks.truncated).length,
      countPerObservedGesture: distribution(longTasks.map((metric) => array(metric.longTasks.entries).length)),
      durationMsPerObservedGesture: distribution(longTasks.map((metric) => sum(array(metric.longTasks.entries).map((entry) => entry.duration).filter(finite)))),
      pooledDurationMs: distribution(longEntries.map((entry) => entry.duration)),
      unavailableReasons: [...new Set(metrics.filter((metric) => !metric.longTasks?.available).map((metric) => metric.longTasks?.reason || "not recorded"))],
      meaning: "PerformanceObserver Long Tasks (50ms threshold), potentially including other page work; not missed frames or exclusively drag CPU." } };
}

export function summarizeRealRun(input, file = null) {
  const manifest = input.manifest || {}, trials = array(input.trials), groups = new Map(), exclusions = [], functionalOnlyTrials = [], alerts = [];
  const completion = input.completed === true ? "explicitly-completed" : input.completed === false ? "explicitly-incomplete" : "unknown-check-runner-TAP";
  if (completion !== "explicitly-completed") alerts.push(alert("completion-unverified", completion, "blocker"));
  if (!Array.isArray(input.trials)) alerts.push(alert("trials-missing", "This may be failure.json or an incomplete results artifact.", "blocker"));
  if (array(input.errors).length) alerts.push(alert("browser-errors", `${input.errors.length} recorded browser errors`, "blocker"));
  if (array(input.blockedOrigins).length) alerts.push(alert("blocked-origins", input.blockedOrigins));
  if (array(input.failedRequests).length) alerts.push(alert("failed-requests", `${input.failedRequests.length} recorded; inspect raw artifact for expected versus unexpected requests`));
  if (manifest.collectionSizeAtMeasurementStart !== undefined && manifest.collectionSizeAtMeasurementEnd !== undefined &&
    manifest.collectionSizeAtMeasurementStart !== manifest.collectionSizeAtMeasurementEnd) alerts.push(alert("collection-size-changed", "Fixture collection size changed during measurement", "blocker"));
  const warmups = trials.filter((trial) => trial.warmup === true || trial.repeat < 0).length;
  const strictFailures = trials.map((trial, index) => ({ trial, index })).filter(({ trial }) => trial.strictInteractionCheck?.passed === false);
  if (strictFailures.length) alerts.push(alert("strict-interaction-contract-failed", { measured: strictFailures.filter(({ trial }) => !trial.warmup && !(trial.repeat < 0)).length,
    warmup: strictFailures.filter(({ trial }) => trial.warmup || trial.repeat < 0).length,
    messages: [...new Set(strictFailures.map(({ trial }) => trial.strictInteractionCheck.message || "no message"))] }));
  for (const [index, trial] of trials.entries()) {
    if (trial.warmup === true || trial.repeat < 0) continue;
    const validation = validateRecordedGesture(trial), identity = identityOf(trial, manifest);
    if (trial.functionalOnly) { functionalOnlyTrials.push({ index, identity, validation, strictInteractionCheck: trial.strictInteractionCheck ?? null }); continue; }
    if (validation.status !== "verified-recorded-invariants") { exclusions.push({ index, identity, repeat: trial.repeat ?? null, validation }); continue; }
    if (!identity.family || !finite(identity.count) || !finite(identity.scale) || identity.alt === null) {
      exclusions.push({ index, identity, repeat: trial.repeat ?? null, validation: { status: "insufficient", missing: ["scenario identity"] } }); continue;
    }
    const key = JSON.stringify(identity);
    if (!groups.has(key)) groups.set(key, { identity, records: [] });
    groups.get(key).records.push({ trial, index, validation });
  }
  const rows = [...groups.values()].map(({ identity, records }) => summarizeRow(identity, records));
  for (const row of rows) {
    const expected = manifest.cdpTraceEnabled === true && !row.identity.alt && row.identity.traced !== null
      ? row.identity.traced ? 1 : manifest.repetitions - 1 : manifest.repetitions;
    if (row.identity.kind !== "handoff" && finite(expected) && row.repetitions !== expected) alerts.push(alert("repetition-count-mismatch", { identity: row.identity, expected, actual: row.repetitions }, "blocker"));
    if (row.identity.traced === null) alerts.push(alert("trace-state-unrecorded", row.identity, "blocker"));
    if (manifest.cdpTraceEnabled === false && row.identity.traced === true) alerts.push(alert("trace-state-inconsistent", row.identity, "blocker"));
    if (new Set(row.repeatIds).size !== row.repeatIds.length) alerts.push(alert("duplicate-repeat-id", row.identity, "blocker"));
    if (row.realSamples.truncatedGestures || row.realSamples.excludedIncompleteOrTruncatedSamples || row.longTasks.truncatedGestures) alerts.push(alert("truncated-observations", { identity: row.identity, diagnosticGestures: row.realSamples.truncatedGestures, excludedSamples: row.realSamples.excludedIncompleteOrTruncatedSamples, longTaskGestures: row.longTasks.truncatedGestures }));
    if (manifest.mode === "diagnostic" && row.realSamples.missingGestures) alerts.push(alert("sample-probe-missing", { identity: row.identity, missingGestures: row.realSamples.missingGestures }));
  }
  if (exclusions.length) alerts.push(alert("functional-or-evidence-exclusions", `${exclusions.length} non-warmup gestures excluded`, "blocker"));
  return { file, label: manifest.label ?? null, completion, manifest,
    recordedTrials: trials.length, discardedWarmups: warmups, includedMeasuredTrials: rows.reduce((count, row) => count + row.repetitions, 0),
    strictInteractionFailures: strictFailures.map(({ trial, index }) => ({ index, warmup: Boolean(trial.warmup || trial.repeat < 0), identity: identityOf(trial, manifest), message: trial.strictInteractionCheck.message ?? null })),
    functionalOnlyTrials, excludedTrials: exclusions, alerts, rows,
    failureMessage: input.message ?? input.failure?.message ?? null,
    caveats: array(manifest.caveats) };
}

function delta(left, right) {
  return { left, right, absolute: finite(left) && finite(right) ? right - left : null,
    percent: finite(left) && finite(right) && left !== 0 ? (right - left) * 100 / left : null };
}

export function compareRealRuns(left, right) {
  const alerts = [...left.alerts, ...right.alerts].filter((entry) => entry.severity === "blocker");
  for (const key of ["runtime", "mode", "cdpTraceEnabled", "node", "chrome", "viewport", "cpu", "logicalCpus", "platform", "architecture", "osRelease", "eventSource", "durationMs", "privateInstrumentationPresent", "selectionPreparation", "fixtureStrategy", "fixtureDifferenceFromLab", "matrix", "warmupPerCaseAndModifier"]) {
    const a = left.manifest[key], b = right.manifest[key];
    if (a === undefined || b === undefined) alerts.push(alert("configuration-unrecorded", key, "blocker"));
    else if (!equal(a, b)) alerts.push(alert("configuration-mismatch", { key, left: a, right: b }, "blocker"));
  }
  for (const key of ["runnerSha256", "sharedGestureRunnerSha256"]) {
    if (!left.manifest[key] || !right.manifest[key]) alerts.push(alert("protocol-hash-missing", key, "blocker"));
    else if (left.manifest[key] !== right.manifest[key]) alerts.push(alert("protocol-hash-mismatch", key, "blocker"));
  }
  // Root records executable measurement helpers independently of copied app
  // sources. Prefer neither silently: report both provenance sets separately.
  const hashes = (manifest) => new Map([...array(manifest.sourceHashes), ...array(manifest.instrumentationHashes)].map((entry) => [entry.file.replaceAll("\\", "/"), entry.sha256]));
  const a = hashes(left.manifest), b = hashes(right.manifest), sourceDifferences = [];
  const protocolFiles = new Set([...Object.keys(left.manifest.protocolHashes || {}), ...Object.keys(right.manifest.protocolHashes || {})]);
  for (const file of protocolFiles) {
    if (!left.manifest.protocolHashes?.[file] || !right.manifest.protocolHashes?.[file]) alerts.push(alert("protocol-file-hash-missing", file, "blocker"));
    else if (left.manifest.protocolHashes[file] !== right.manifest.protocolHashes[file]) alerts.push(alert("protocol-file-hash-mismatch", file, "blocker"));
  }
  for (const file of new Set([...a.keys(), ...b.keys()])) {
    if (a.get(file) !== b.get(file)) {
      const expected = EXPECTED_CHANGED_SOURCES.has(file) && a.has(file) && b.has(file);
      sourceDifferences.push({ file, left: a.get(file) ?? null, right: b.get(file) ?? null, expectedPerf01File: expected });
      if (!expected) alerts.push(alert("unexpected-source-difference", file, "blocker"));
    }
  }
  if (!a.size || !b.size) alerts.push(alert("source-provenance-missing", "Cannot compare actual source bytes", "blocker"));
  for (const file of ["instrumentDragPerformance.cjs", "realDragSampleProbe.mjs", "realDragObservations.mjs"]) {
    if (![...a.keys(), ...Object.keys(left.manifest.protocolHashes || {})].some((name) => name.endsWith(`/${file}`)) ||
      ![...b.keys(), ...Object.keys(right.manifest.protocolHashes || {})].some((name) => name.endsWith(`/${file}`))) alerts.push(alert("instrumentation-provenance-unrecorded", file, "blocker"));
  }
  const rightRows = new Map(right.rows.map((row) => [JSON.stringify(row.identity), row]));
  const comparisons = [], unmatchedLeft = [], unmatchedRight = [];
  for (const l of left.rows) {
    const r = rightRows.get(JSON.stringify(l.identity));
    if (!r) { unmatchedLeft.push(l.identity); continue; }
    const sameRepeats = equal([...l.repeatIds].sort(), [...r.repeatIds].sort());
    if (!sameRepeats) alerts.push(alert("repeat-population-mismatch", l.identity, "blocker"));
    comparisons.push({ identity: l.identity, leftRepetitions: l.repetitions, rightRepetitions: r.repetitions, sameRepeatIds: sameRepeats,
      scriptMsGestureMedian: delta(l.cdp.scriptMsPerGesture.median, r.cdp.scriptMsPerGesture.median),
      scriptMsGestureRanges: { left: [l.cdp.scriptMsPerGesture.min, l.cdp.scriptMsPerGesture.max], right: [r.cdp.scriptMsPerGesture.min, r.cdp.scriptMsPerGesture.max] },
      rafPooledP50Ms: delta(l.raf.pooledIntervalMs.p50, r.raf.pooledIntervalMs.p50),
      rafPooledP95Ms: delta(l.raf.pooledIntervalMs.p95, r.raf.pooledIntervalMs.p95),
      rafPooledP99Ms: delta(l.raf.pooledIntervalMs.p99, r.raf.pooledIntervalMs.p99),
      callbackDurationPooledMedianMs: delta(l.realSamples.callbackDurationMsPooled.median, r.realSamples.callbackDurationMsPooled.median),
      observedDuplicateResolutionPooledMedianMs: delta(l.realSamples.observedDuplicateResolutionInclusiveMsPooled.median, r.realSamples.observedDuplicateResolutionInclusiveMsPooled.median),
      rootCommitsGestureMedian: delta(l.reactRootCommits.commitsPerObservedGesture.median, r.reactRootCommits.commitsPerObservedGesture.median),
      longTasksGestureMedian: delta(l.longTasks.countPerObservedGesture.median, r.longTasks.countPerObservedGesture.median) });
  }
  const leftKeys = new Set(left.rows.map((row) => JSON.stringify(row.identity)));
  for (const row of right.rows) if (!leftKeys.has(JSON.stringify(row.identity))) unmatchedRight.push(row.identity);
  if (unmatchedLeft.length || unmatchedRight.length) alerts.push(alert("scenario-population-mismatch", { unmatchedLeft, unmatchedRight }, "blocker"));
  return { left: { file: left.file, label: left.label }, right: { file: right.file, label: right.label },
    numericallyComparableRecordedProtocol: !alerts.some((entry) => entry.severity === "blocker") && comparisons.length > 0,
    direction: "right minus left; negative script delta means less recorded script time, not a causal performance claim",
    sourceDifferences, alerts, rows: comparisons, unmatchedLeft, unmatchedRight };
}

export function summarizeRealInputs(inputs) {
  const runs = inputs.map(({ input, file }) => summarizeRealRun(input, file));
  const comparisons = [];
  for (let left = 0; left < runs.length; left += 1) for (let right = left + 1; right < runs.length; right += 1) comparisons.push(compareRealRuns(runs[left], runs[right]));
  return { version: 1,
    statistics: "Gesture median is the conventional median (mean of middle two for even N), with range. Pooled percentiles use sorted[floor((N-1)*q)]. Missing observations are unknown, not zero. Warmups are excluded. Group scale is rounded to six decimals; raw observed scales remain in every row.",
    interpretation: "Every input pair is reported in argument order. A timing/diagnostic or protocol mismatch blocks numeric comparability. Complete JSON and matching metadata do not prove causal attribution or production performance. Diagnostic inclusive spans overlap; no physical FPS or input-device claim is made.",
    runs, comparisons };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) throw new Error("Pass one or more real-editor results.json paths (read-only; JSON is written to stdout)");
  const inputs = files.map((file) => {
    try { return { file, input: JSON.parse(readFileSync(file, "utf8")) }; }
    catch (error) { return { file, input: { completed: false, message: `Unreadable or truncated JSON: ${error.message}` } }; }
  });
  process.stdout.write(`${JSON.stringify(summarizeRealInputs(inputs), null, 2)}\n`);
}
