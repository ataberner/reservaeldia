import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { distribution, validateRecordedGesture, summarizeRealRun, compareRealRuns, summarizeRealInputs } from "./summarizeRealDragPerformance.mjs";

const clone = (value) => structuredClone(value);
const resolveName = "CanvasStageContentComposer.jsx:resolveLiveDragSelectionSnapshot";
function makeSample() {
  const session = { sessionId: "gesture-1", epoch: 1, elementId: "active", phase: "drag", selectedIds: ["active"] };
  return { id: 1, startedAt: 5, endedAt: 8, durationMs: 3,
    handler: "onDragMovePersonalizado", elementId: "active", pipeline: "individual", session, endSession: clone(session),
    counts: { [resolveName]: 2 }, selectionResolutionAttempts: 2, selectionResolutionCount: 2,
    spans: [{ id: 1, name: resolveName, startedAt: 5, endedAt: 6, durationMs: 1, exclusiveAmongMeasuredMs: 1 },
      { id: 2, name: resolveName, startedAt: 6, endedAt: 7.5, durationMs: 1.5, exclusiveAmongMeasuredMs: 1.5 }],
    events: [{ sequence: 1, kind: "selection-resolved", spanId: 1 }, { sequence: 2, kind: "selection-resolved", spanId: 2 },
      { sequence: 3, kind: "target-cache", cacheHit: true, sameSession: true, targetCount: 9, sectionCandidateCount: 4 },
      { sequence: 4, kind: "overlay-request", source: "post-snap" }],
    repeatedSelectionResults: [{ previousEvent: 1, nextEvent: 2, sameBounds: true, sameRecordedContext: true }] };
}

function makeTrial(repeat = 0) {
  const object = { id: "active", x: 30, y: 20, seccionId: "s1" };
  const final = { object, node: { x: 30, y: 20 }, dragging: false, guideCount: 0,
    canonicalPose: { x: 30, y: 20 }, expectedCanonicalStagePose: { x: 30, y: 20 } };
  return { family: "text", count: 10, actualCount: 10, zoom: 1, effectiveScale: 1.00000002,
    trajectory: "sweep", alt: false, repeat, warmup: false, traced: false,
    before: { object: { ...object, x: 10 } }, final, settled: clone(final), savedPose: { x: 30, y: 20 },
    metrics: { startedAt: 0, endedAt: 40, frames: [0, 10, 30], inputs: [3, 15, 25], dispatches: [1, 11, 21], releases: [{ observedAt: 25 }],
      nativeInputs: [{ observedAt: 4 }],
      spans: { [resolveName]: { count: 2, totalMs: 2.5, samplesMs: [1, 1.5] },
        "useGuiasCentrado.js:getSectionGuideTargets": { count: 1, totalMs: .2, samplesMs: [.2] },
        "Konva:drawScene:elements": { count: 1, totalMs: .5, samplesMs: [.5] } },
      cdpMetricDeltas: { ScriptDuration: .01, LayoutDuration: .001, RecalcStyleDuration: .002, TaskDuration: .02 },
      realSamples: { version: 1, samples: [makeSample()], outsideCounts: { [resolveName]: 1 }, truncated: false },
      reactRootCommits: { available: true, renderers: [{ id: 1, name: "react-dom", version: "18" }],
        commits: [{ rootId: 1, rendererId: 1, at: 10 }, { rootId: 1, rendererId: 1, at: 20 }] },
      longTasks: { available: true, entries: [], truncated: false } } };
}

function makeInput() {
  const protocolHashes = Object.fromEntries(["instrumentDragPerformance.cjs", "realDragSampleProbe.mjs", "realDragObservations.mjs"]
    .map((name) => [`src/drag/testSupport/${name}`, name]));
  return { completed: true, manifest: { label: "before", repetitions: 2, runtime: "real editor dev", mode: "diagnostic", node: "v20", chrome: "test-chrome",
    viewport: { width: 1365, height: 1100 }, cpu: "test-cpu", logicalCpus: 4, platform: "win32", architecture: "x64", osRelease: "test-os",
    eventSource: "CDP", durationMs: 1000, cdpTraceEnabled: false, privateInstrumentationPresent: true, selectionPreparation: "marquee", fixtureStrategy: "stable",
    fixtureDifferenceFromLab: "x240", matrix: "core", warmupPerCaseAndModifier: 1,
    runnerSha256: "runner", sharedGestureRunnerSha256: "shared", protocolHashes,
    sourceHashes: [{ file: "src/hooks/useGuiasCentrado.js", sha256: "before" }, { file: "src/components/editor/CanvasEditor.jsx", sha256: "same" }] },
    trials: [makeTrial(0), makeTrial(1)], errors: [], blockedOrigins: [], failedRequests: [] };
}

test("statistics distinguish conventional gesture median from floor pooled quantiles", () => {
  assert.deepEqual(distribution([9, 1, null, 3, 5, NaN]), { count: 4, median: 4, min: 1, max: 9, p50: 3, p95: 5, p99: 5, mean: 4.5 });
  assert.equal(distribution([]).median, null);
});

test("real summary excludes warmups and failed movement; converts seconds and preserves populations", () => {
  const input = makeInput();
  const warmup = makeTrial(-1); warmup.warmup = true; warmup.metrics.cdpMetricDeltas.ScriptDuration = 99;
  const failed = makeTrial(2); failed.final.object.x = failed.before.object.x;
  input.trials.push(warmup, failed);
  const report = summarizeRealRun(input, "before.json");
  assert.equal(report.discardedWarmups, 1);
  assert.equal(report.includedMeasuredTrials, 2);
  assert.equal(report.excludedTrials.length, 1);
  assert.match(report.excludedTrials[0].validation.failed.join(" "), /movement/);
  const row = report.rows[0];
  assert.equal(row.identity.scale, 1);
  assert.equal(row.observedEffectiveScale.median, 1.00000002);
  assert.equal(row.cdp.scriptMsPerGesture.median, 10);
  assert.equal(row.raf.pooledIntervalMs.count, 4);
  assert.equal(row.raf.pooledIntervalMs.p95, 20);
  assert.equal(row.raf.perGestureMedianIntervalMs.median, 15);
  assert.equal(row.konvaSpans["Konva:drawScene:elements"].callsPerObservedGesture.median, 1);
  assert.equal(row.cacheSpans["useGuiasCentrado.js:getSectionGuideTargets"].inclusiveMsPerObservedGesture.median, .2);
});

test("observed PERF02 pairs link exact next resolution span and retain context, without summed nesting claim", () => {
  const input = makeInput();
  const row = summarizeRealRun(input).rows[0], sample = row.realSamples;
  assert.equal(sample.selectionResolutionAttemptsPerSample.median, 2);
  assert.equal(sample.samplesWithRepeatedEqualResults, 2);
  assert.equal(sample.equalBoundsAndRecordedContextPairs, 2);
  assert.equal(sample.observedDuplicateResolutionInclusiveMsTotal, 3);
  assert.equal(sample.observedDuplicateResolutionInclusiveMsPooled.median, 1.5);
  assert.equal(sample.observedDuplicateResolutionShare.intervalUnionMsTotal, 3);
  assert.equal(sample.observedDuplicateResolutionShare.percentOfObservedCallbackTime, 50);
  assert.equal(sample.duplicateExamples[0].session.sessionId, "gesture-1");
  assert.equal(sample.cache.hits, 2);
  assert.equal(sample.cache.targetCount.median, 9);
  assert.equal(sample.captureToCallbackStartMsPooled.median, 1);
  assert.equal(sample.captureToCallbackEndMsPooled.median, 4);
  assert.equal(row.reactRootCommits.commitsPerObservedGesture.median, 2);
  assert.equal(row.reactRootCommits.distinctRootsPerObservedGesture.median, 1);
  assert.equal(row.longTasks.countPerObservedGesture.median, 0);
  input.trials[1].metrics.realSamples.samples[0].repeatedSelectionResults[0].sameRecordedContext = false;
  assert.equal(summarizeRealRun(input).rows[0].realSamples.equalBoundsAndRecordedContextPairs, 1);
});

test("unavailable observations stay unknown and truncated samples are omitted from detailed costs", () => {
  const input = makeInput();
  const first = input.trials[0].metrics;
  first.realSamples.truncated = true; first.realSamples.samples[0].truncated = true;
  first.longTasks.truncated = true;
  delete input.trials[1].metrics.realSamples;
  delete input.trials[1].metrics.reactRootCommits;
  input.trials[1].metrics.longTasks = { available: false, reason: "unsupported" };
  delete input.trials[1].metrics.spans[resolveName];
  const report = summarizeRealRun(input), row = report.rows[0];
  assert.equal(row.realSamples.excludedIncompleteOrTruncatedSamples, 1);
  assert.equal(row.realSamples.usableSamples, 0);
  assert.equal(row.realSamples.observedDuplicateResolutionInclusiveMsTotal, null);
  assert.equal(row.spans[resolveName].gesturesMissingEntry, 1);
  assert.equal(row.spans[resolveName].callsPerObservedGesture.median, 2);
  assert.equal(row.reactRootCommits.missingOrUnavailableGestures, 1);
  assert.equal(row.longTasks.missingOrUnavailableGestures, 1);
  assert.ok(report.alerts.some((entry) => entry.code === "truncated-observations"));
});

test("functional evidence rejects canonical mismatch and absent ordinary persistence; handoff records limited coverage", () => {
  const trial = makeTrial();
  assert.equal(validateRecordedGesture(trial).status, "verified-recorded-invariants");
  trial.final.canonicalPose.x += 2;
  assert.equal(validateRecordedGesture(trial).status, "failed");
  trial.final.canonicalPose.x -= 2;
  delete trial.savedPose;
  assert.equal(validateRecordedGesture(trial).status, "insufficient");
  trial.kind = "handoff";
  const handoff = validateRecordedGesture(trial);
  assert.equal(handoff.status, "verified-recorded-invariants");
  assert.match(handoff.notes.join(" "), /batch/);
  const multi = makeTrial(); multi.family = "multiselect";
  multi.companionBefore = { object: { x: 5, y: 20 } }; multi.companionFinal = { object: { x: 25, y: 20 } };
  assert.equal(validateRecordedGesture(multi).status, "verified-recorded-invariants");
  multi.companionFinal.object.y += 2;
  assert.equal(validateRecordedGesture(multi).status, "failed");
});

test("A/B comparison reports delta and gates mode, protocol, source, completion and repeat mismatches", () => {
  const before = makeInput(), after = clone(before); after.manifest.label = "after";
  after.manifest.sourceHashes[0].sha256 = "after";
  for (const trial of after.trials) trial.metrics.cdpMetricDeltas.ScriptDuration = .008;
  let result = compareRealRuns(summarizeRealRun(before), summarizeRealRun(after));
  assert.equal(result.numericallyComparableRecordedProtocol, true);
  assert.deepEqual(result.rows[0].scriptMsGestureMedian, { left: 10, right: 8, absolute: -2, percent: -20 });
  assert.equal(result.sourceDifferences[0].expectedPerf01File, true);
  after.manifest.mode = "timing-flags-off";
  after.manifest.protocolHashes["src/drag/testSupport/realDragSampleProbe.mjs"] = "changed";
  after.manifest.sourceHashes[1].sha256 = "unexpected";
  after.completed = false;
  after.trials[1].repeat = 9;
  result = compareRealRuns(summarizeRealRun(before), summarizeRealRun(after));
  assert.equal(result.numericallyComparableRecordedProtocol, false);
  for (const code of ["configuration-mismatch", "protocol-file-hash-mismatch", "unexpected-source-difference", "completion-unverified", "repeat-population-mismatch"]) assert.ok(result.alerts.some((entry) => entry.code === code), code);
});

test("partial artifacts never imply completion; all input pairs and opposing directions remain explicit", () => {
  const before = makeInput(), after = clone(before);
  delete after.completed; after.trials[1].metrics.direction = -1;
  const report = summarizeRealInputs([{ file: "before", input: before }, { file: "partial", input: after }, { file: "failed", input: { message: "setup failed" } }]);
  assert.equal(report.comparisons.length, 3);
  assert.equal(report.runs[1].completion, "unknown-check-runner-TAP");
  assert.equal(report.runs[1].rows.length, 2);
  assert.equal(report.runs[2].failureMessage, "setup failed");
  assert.equal(report.runs[2].includedMeasuredTrials, 0);
  assert.ok(report.comparisons.every((comparison) => !comparison.numericallyComparableRecordedProtocol));
});

test("strict interaction failure remains explicit while observable-position measurements are retained", () => {
  const input = makeInput();
  input.trials[0].strictInteractionCheck = { passed: false, message: "dragVisualSelection session remains" };
  input.trials[0].functionalValid = true;
  const report = summarizeRealRun(input);
  assert.equal(report.includedMeasuredTrials, 2);
  assert.equal(report.strictInteractionFailures.length, 1);
  assert.equal(report.rows[0].strictInteraction.failed, 1);
  assert.equal(report.rows[0].strictInteraction.passed, 0);
  assert.equal(report.rows[0].strictInteraction.missingGestures, 1);
  assert.ok(report.alerts.some((entry) => entry.code === "strict-interaction-contract-failed"));
});

test("trace-active gestures are separate populations and trace mode blocks A/B pairing", () => {
  const before = makeInput(), traced = clone(before);
  traced.manifest.cdpTraceEnabled = true; traced.trials[0].traced = true;
  const report = summarizeRealRun(traced);
  assert.equal(report.rows.length, 2);
  assert.deepEqual(report.rows.map((row) => row.identity.traced), [true, false]);
  assert.equal(report.alerts.filter((entry) => entry.code === "repetition-count-mismatch").length, 0);
  const comparison = compareRealRuns(summarizeRealRun(before), report);
  assert.equal(comparison.numericallyComparableRecordedProtocol, false);
  assert.ok(comparison.alerts.some((entry) => entry.code === "configuration-mismatch" && entry.detail.key === "cdpTraceEnabled"));
  delete traced.manifest.cdpTraceEnabled; delete traced.trials[0].traced;
  assert.ok(summarizeRealRun(traced).alerts.some((entry) => entry.code === "trace-state-unrecorded"));
});

test("release partition uses recorded browser timestamp and does not assign crossing RAF intervals", () => {
  const input = makeInput();
  input.trials[0].metrics.frames = [0, 10, 20, 30, 40];
  input.trials[0].metrics.longTasks.entries = [{ startTime: 20, duration: 12 }];
  delete input.trials[1].metrics.releases;
  const release = summarizeRealRun(input).rows[0].releaseWindows;
  assert.equal(release.availableGestures, 1);
  assert.equal(release.missingGestures, 1);
  assert.equal(release.probeStartToReleaseMs.median, 25);
  assert.equal(release.releaseToProbeStopMs.median, 15);
  assert.equal(release.beforeReleaseRafIntervalMsPooled.count, 2);
  assert.equal(release.afterReleaseRafIntervalMsPooled.count, 1);
  assert.equal(release.crossingReleaseRafIntervalMsPooled.count, 1);
  assert.equal(release.beforeReleaseLongTaskOverlapMsPerGesture.median, 5);
  assert.equal(release.afterReleaseLongTaskOverlapMsPerGesture.median, 7);
});

test("interval unions avoid double-counting nested costs and functional-only trials stay out of timing", () => {
  const input = makeInput();
  const sample = input.trials[0].metrics.realSamples.samples[0];
  sample.spans[0].endedAt = 8; sample.spans[0].durationMs = 3;
  input.trials[1].functionalOnly = true;
  const report = summarizeRealRun(input), costs = report.rows[0].realSamples.functionShareOfTopLevelCallbackTime[resolveName];
  assert.equal(report.includedMeasuredTrials, 1);
  assert.equal(report.functionalOnlyTrials.length, 1);
  assert.equal(costs.intervalUnionMsTotal, 3);
  assert.equal(costs.percentOfObservedCallbackTime, 100);
});

test("existing instance-layer session counters remain independent from incomplete prototype wrappers", () => {
  const input = makeInput();
  input.trials[0].metrics.existingSession = { sessionId: "one", tipo: "texto", reason: "drag-end", renderEventCount: 3,
    stageLayerSceneDrawTotalMs: 10, guideLayerSceneDrawTotalMs: 0, guidesCommitCount: 2,
    topStageSceneLayers: [{ name: "elements-main", count: 2, totalDurationMs: 10, maxDurationMs: 7, avgDurationMs: 5 }],
    topStageHitLayers: [{ name: "elements-main", count: 1, totalDurationMs: 1, maxDurationMs: 1, avgDurationMs: 1 }] };
  input.trials[1].metrics.existingSession = { sessionId: "two", tipo: "texto", reason: "drag-end", renderEventCount: 0,
    stageLayerSceneDrawTotalMs: 0, topStageSceneLayers: [] };
  const row = summarizeRealRun(input).rows[0], sessions = row.existingCanvasDragSessions;
  assert.equal(sessions.availableSessions, 2);
  assert.equal(sessions.perSessionFields.stageLayerSceneDrawTotalMs.perObservedSession.median, 5);
  assert.equal(sessions.perSessionFields.guideLayerSceneDrawTotalMs.perObservedSession.median, 0);
  assert.equal(sessions.perSessionFields.guideLayerSceneDrawTotalMs.missingFieldSessions, 1);
  assert.equal(sessions.topStageSceneLayers.byRecordedLabel["elements-main"].callsPerListedSession.median, 2);
  assert.equal(sessions.topStageSceneLayers.byRecordedLabel["elements-main"].sessionsNotListingLabel, 1);
  assert.equal(sessions.topStageHitLayers.sessionsMissingList, 1);
  assert.equal(row.konvaSpans["Konva:drawScene:elements"].inclusiveMsPerObservedGesture.median, .5);
  delete input.trials[0].metrics.existingSession; delete input.trials[1].metrics.existingSession;
  const missing = summarizeRealRun(input).rows[0].existingCanvasDragSessions;
  assert.equal(missing.availableSessions, 0);
  assert.equal(missing.perSessionFields.stageLayerSceneDrawTotalMs.perObservedSession.median, null);
});

test("CLI reads valid and truncated JSON without executing a runner or silently dropping failed inputs", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "real-drag-summary-"));
  try {
    const good = path.join(directory, "good.json"), partial = path.join(directory, "partial.json");
    writeFileSync(good, JSON.stringify(makeInput())); writeFileSync(partial, '{"trials":[');
    const output = execFileSync(process.execPath, [fileURLToPath(new URL("./summarizeRealDragPerformance.mjs", import.meta.url)), good, partial], { encoding: "utf8" });
    const report = JSON.parse(output);
    assert.equal(report.runs.length, 2);
    assert.equal(report.runs[0].includedMeasuredTrials, 2);
    assert.equal(report.runs[1].completion, "explicitly-incomplete");
    assert.match(report.runs[1].failureMessage, /truncated JSON/);
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("real-drag-summary-"));
    rmSync(directory, { recursive: true, force: true });
  }
});
