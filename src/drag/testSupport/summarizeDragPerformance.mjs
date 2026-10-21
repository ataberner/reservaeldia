import { readFileSync } from "node:fs";

// Read-only report over recorded trials. Warmups are excluded, nested spans
// remain separate, and RAF frequency is never labelled physical display FPS.
const quantile = (values, q) => values.length
  ? [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)]
  : null;
const stats = (values) => {
  const finite = values.filter(Number.isFinite);
  return {
    count: finite.length,
    p50: quantile(finite, .5), p95: quantile(finite, .95), p99: quantile(finite, .99),
    mean: finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null,
    min: finite.length ? finite.reduce((min, value) => Math.min(min, value), Infinity) : null,
    max: finite.length ? finite.reduce((max, value) => Math.max(max, value), -Infinity) : null,
  };
};
const gaps = (values) => values.slice(1).map((value, index) => value - values[index]);

function summarize(input) {
  const groups = new Map();
  for (const trial of input.trials.filter((trial) => !trial.warmup)) {
    const identity = {
      family: trial.family, count: trial.actualCount ?? trial.count,
      zoom: trial.effectiveScale ?? trial.zoom, alt: trial.alt,
      trajectory: trial.trajectory || "sweep",
      direction: trial.direction ?? null,
    };
    const key = JSON.stringify(identity);
    if (!groups.has(key)) groups.set(key, { identity, trials: [] });
    groups.get(key).trials.push(trial);
  }
  return [...groups.values()].map(({ identity, trials }) => {
    const metrics = trials.map((trial) => trial.metrics);
    const frameGaps = metrics.flatMap((metric) => gaps(metric.frames));
    const spanNames = new Set(metrics.flatMap((metric) => Object.keys(metric.spans)));
    const spanSummary = {};
    for (const name of spanNames) {
      const entries = metrics.map((metric) => metric.spans[name]);
      spanSummary[name] = {
        callsPerGesture: stats(entries.map((entry) => entry?.count || 0)),
        inclusiveMsPerGesture: stats(entries.map((entry) => entry?.totalMs || 0)),
        sampleMs: stats(entries.flatMap((entry) => entry?.samplesMs || [])),
      };
    }
    const profilerIds = new Set(metrics.flatMap((metric) => metric.commits.map((commit) => commit.id)));
    const profiler = Object.fromEntries([...profilerIds].map((id) => [id, {
      callbacksPerGesture: stats(metrics.map((metric) => metric.commits.filter((commit) => commit.id === id).length)),
      actualDurationMs: stats(metrics.flatMap((metric) => metric.commits.filter((commit) => commit.id === id).map((commit) => commit.actualDuration))),
    }]));
    return {
      ...identity, repetitions: trials.length,
      measuredWindowMs: stats(metrics.map((metric) => metric.endedAt - metric.startedAt)),
      rafCallbackHz: stats(metrics.filter((metric) => metric.frames.length > 1).map((metric) =>
        (metric.frames.length - 1) * 1000 / (metric.frames.at(-1) - metric.frames[0]))),
      frameIntervalMs: stats(frameGaps),
      frameGapsOver33_4ms: frameGaps.filter((gap) => gap > 33.4).length,
      frameGapsOver50ms: frameGaps.filter((gap) => gap > 50).length,
      frameGapOver33_4Fraction: frameGaps.length ? frameGaps.filter((gap) => gap > 33.4).length / frameGaps.length : null,
      scriptMsPerGesture: stats(metrics.map((metric) => 1000 * metric.cdpMetricDeltas.ScriptDuration)),
      layoutMsPerGesture: stats(metrics.map((metric) => 1000 * metric.cdpMetricDeltas.LayoutDuration)),
      styleMsPerGesture: stats(metrics.map((metric) => 1000 * metric.cdpMetricDeltas.RecalcStyleDuration)),
      taskMsPerGesture: stats(metrics.map((metric) => 1000 * metric.cdpMetricDeltas.TaskDuration)),
      observedInputIntervalsMs: stats(metrics.flatMap((metric) => gaps(metric.inputs))),
      profilerAvailable: profilerIds.size > 0,
      profiler,
      spans: spanSummary,
    };
  });
}

const files = process.argv.slice(2);
if (!files.length) throw new Error("Pass one or more recorded results.json paths");
const reports = files.map((file) => {
  const input = JSON.parse(readFileSync(file, "utf8"));
  return {
    file, label: input.manifest.label, runtime: input.manifest.runtime || input.manifest.build?.mode,
    diagnostic: input.manifest.diagnostic ?? input.manifest.mode === "diagnostic",
    recordedTrials: input.trials.length,
    completion: input.completed ?? "Check runner TAP log; partial JSON is also written on failure.",
    quantileEstimator: "sorted[floor((n-1)*q)]; use median/range for five-gesture populations, pooled percentiles for frame/handler samples",
    errors: input.errors, outbound: input.outbound, blockedOrigins: input.blockedOrigins,
    rows: summarize(input),
    caveats: input.manifest.caveats,
  };
});
process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
