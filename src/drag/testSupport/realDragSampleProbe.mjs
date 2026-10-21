// Test-only extension of installPerformanceProbe. Installed only for diagnostic
// copies of the full editor; no geometry getter, DOM read, RAF or product flag.
// This function is self-contained so Puppeteer can serialize it into the page.
export function installRealSampleProbeRuntime(
  probe = globalThis.__DRAG_PERF_PROBE,
  now = () => performance.now()
) {
  if (!probe?.begin || !probe?.start || !probe?.stop) throw new Error("Install the base performance probe first");
  if (probe.realSamplesVersion === 1) return { installed: false, version: 1 };
  const original = { begin: probe.begin, start: probe.start, stop: probe.stop };
  const timedNames = new Set([
    "resolveLiveDragSelectionSnapshot", "syncControlledDragOverlayBounds",
    "recordSelectionDragMoveSummary", "flushScheduledGuideEvaluation",
    "noteDragOverlayDragSample", "applyPendingStartupControlledDragOverlaySync",
    "text-authority-diagnostic", "resolveSelectionBounds", "applyIndicatorBounds",
    "mostrarGuias", "getSectionGuideTargets", "readActiveDragBox",
    "buildSameSectionGuides", "resolveAxisDecision", "applySnap", "commitGuideLines",
  ]);
  const MAX_SAMPLES = 2000, MAX_EVENTS = 200, MAX_SPANS = 200;
  let active = false, samples = [], stack = [], spanStack = [], truncated = false;
  let outsideCounts = {}, sequence = 0, identities = new WeakMap(), identitySequence = 0;
  const identity = (value) => {
    if (!value || !["object", "function"].includes(typeof value)) return null;
    if (!identities.has(value)) identities.set(value, ++identitySequence);
    return identities.get(value);
  };
  const ids = (value) => Array.isArray(value) ? value.map(String) : [];
  const point = (value) => value ? { x: value.x ?? null, y: value.y ?? null } : null;
  const session = (value) => value ? {
    sessionId: value.sessionKey || null, epoch: value.interactionEpoch ?? null,
    elementId: value.dragId || null, phase: value.phase || null,
    selectedIds: ids(value.selectedIds),
  } : null;
  const bounds = (value) => value ? {
    kind: value.kind || "rect", x: value.x ?? null, y: value.y ?? null,
    width: value.width ?? null, height: value.height ?? null,
    points: Array.isArray(value.points) ? [...value.points] : null,
    strokeWidth: value.strokeWidth ?? null, padding: value.padding ?? null,
    geometrySource: value.geometrySource || null,
  } : null;
  const current = () => active ? stack.at(-1) || null : null;
  const compact = (kind, data) => {
    if (kind === "selection-resolved") return {
      selectedIds: ids(data.selectedIds), bounds: bounds(data.bounds), session: session(data.session),
      nodeIds: (data.nodes || []).map(identity), stageId: identity(data.stage),
      objectsId: identity(data.objects), lookupId: identity(data.objectLookup), isMobile: Boolean(data.isMobile),
    };
    if (kind === "guide-outcome") return {
      request: { elementId: data.request?.elementId || null, sessionId: data.request?.sessionId || null,
        epoch: data.request?.interactionEpoch ?? null, source: data.request?.source || null,
        pipeline: data.request?.pipeline || null, inputPosition: point(data.request?.pos),
        altKey: Boolean(data.request?.modifierState?.altKey) },
      outcome: data.outcome ? { ...data.outcome, preToPostDelta: data.outcome.preToPostDelta ? { ...data.outcome.preToPostDelta } : null } : null,
      session: session(data.session),
    };
    if (kind === "overlay-request") return {
      source: data.source, syncToken: data.syncToken || null, elementId: data.dragId || null,
      selectedIds: ids(data.selectedIds), bounds: bounds(data.bounds), provided: Boolean(data.provided),
      session: session(data.session),
    };
    if (kind === "overlay-result") return {
      source: data.snapshot?.source || null, syncToken: data.snapshot?.syncToken || null,
      bounds: bounds(data.snapshot?.bounds), applied: Boolean(data.snapshot?.applied),
      startupVisibleEligible: Boolean(data.snapshot?.startupVisibleEligible),
      startupEligibilityReason: data.snapshot?.startupEligibilityReason || null,
      session: session(data.session),
    };
    if (kind === "authoritative-drag-sample") return {
      source: data.sample?.source || null, syncToken: data.sample?.syncToken || null,
      bounds: bounds(data.sample?.bounds), inputPosition: point(data.sample?.pos), session: session(data.session),
    };
    if (kind === "target-cache") return {
      cacheHit: Boolean(data.cacheHit), sameSession: Boolean(data.sameSession),
      targetCount: data.targetCount, sectionCandidateCount: data.sectionCandidateCount,
      sessionId: data.sessionId || null, elementId: data.elementId || null,
    };
    throw new Error(`Unknown real drag diagnostic event: ${kind}`);
  };
  probe.begin = function (name) {
    const finishOriginal = original.begin.call(this, name);
    const sample = current();
    if (!sample) {
      if (active) outsideCounts[name] = (outsideCounts[name] || 0) + 1;
      return finishOriginal;
    }
    sample.counts[name] = (sample.counts[name] || 0) + 1;
    if (!timedNames.has(name.split(":").at(-1))) return finishOriginal;
    const parent = spanStack.at(-1);
    const frame = { id: ++sample.spanSequence, name, parentId: parent?.id || null,
      startedAt: now(), childMs: 0, sample };
    spanStack.push(frame);
    return () => {
      const endedAt = now(), durationMs = endedAt - frame.startedAt;
      const popped = spanStack.pop();
      if (popped !== frame) sample.stackMismatch = true;
      if (parent?.sample === sample) parent.childMs += durationMs;
      if (sample.spans.length < MAX_SPANS) sample.spans.push({
        id: frame.id, name, parentId: frame.parentId, startedAt: frame.startedAt, endedAt,
        durationMs, exclusiveAmongMeasuredMs: Math.max(0, durationMs - frame.childMs),
      });
      else { sample.truncated = true; truncated = true; }
      finishOriginal?.();
    };
  };
  Object.defineProperty(probe, "realSampleActive", { get: () => Boolean(current()), configurable: true });
  probe.beginRealSample = (meta) => {
    if (!active) return null;
    if (samples.length >= MAX_SAMPLES) { truncated = true; return null; }
    const sample = { id: ++sequence, parentSampleId: current()?.id || null, startedAt: now(),
      handler: meta.handler, elementId: meta.elementId || null, family: meta.family || null,
      pipeline: meta.pipeline || null, inputPosition: point(meta.inputPosition),
      session: session(meta.session), counts: {}, spans: [], events: [], spanSequence: 0 };
    samples.push(sample); stack.push(sample);
    return (endMeta = {}) => {
      sample.endedAt = now(); sample.durationMs = sample.endedAt - sample.startedAt;
      sample.endSession = session(endMeta.session);
      if (stack.pop() !== sample) sample.stackMismatch = true;
      const resolutions = sample.events.filter((event) => event.kind === "selection-resolved");
      sample.selectionResolutionAttempts = sample.counts["CanvasStageContentComposer.jsx:resolveLiveDragSelectionSnapshot"] || 0;
      sample.selectionResolutionCount = resolutions.length;
      sample.repeatedSelectionResults = [];
      for (let index = 1; index < resolutions.length; index += 1) {
        const previous = resolutions[index - 1], next = resolutions[index];
        const context = (event) => ({ selectedIds: event.selectedIds, session: event.session,
          nodeIds: event.nodeIds, stageId: event.stageId, objectsId: event.objectsId,
          lookupId: event.lookupId, isMobile: event.isMobile });
        sample.repeatedSelectionResults.push({ previousEvent: previous.sequence, nextEvent: next.sequence,
          sameBounds: Boolean(previous.bounds && next.bounds) && JSON.stringify(previous.bounds) === JSON.stringify(next.bounds),
          sameRecordedContext: JSON.stringify(context(previous)) === JSON.stringify(context(next)) });
      }
      delete sample.spanSequence;
    };
  };
  probe.noteRealDrag = (kind, data) => {
    const sample = current();
    if (!sample) return;
    if (sample.events.length >= MAX_EVENTS) { sample.truncated = true; truncated = true; return; }
    sample.events.push({ sequence: sample.events.length + 1, kind, at: now(),
      spanId: spanStack.at(-1)?.id || null, ...compact(kind, data) });
  };
  probe.start = function (...args) {
    active = false; samples = []; stack = []; spanStack = []; outsideCounts = {};
    truncated = false; sequence = 0; identities = new WeakMap(); identitySequence = 0;
    const result = original.start.apply(this, args);
    globalThis.__DRAG_PERF_REACT_ROOTS?.start?.();
    active = true;
    return result;
  };
  probe.stop = function (...args) {
    active = false;
    for (const sample of stack) sample.incomplete = true;
    const result = original.stop.apply(this, args);
    const reactRootCommits = globalThis.__DRAG_PERF_REACT_ROOTS?.stop?.() || {
      available: false, renderers: [], commits: [], reason: "React observer was not installed before navigation",
    };
    return { ...result, reactRootCommits, realSamples: { version: 1, samples, outsideCounts, truncated,
      caveats: ["Diagnostic overhead only; do not compare with uninstrumented timing.",
        "Exclusive timings subtract only measured descendants, not every function.",
        "Equal recorded geometry/context is observed duplicate work, not proof of safe snapshot reuse.",
        "No extra geometry or DOM reads. Node/context identities are local to each gesture."] } };
  };
  probe.realSamplesVersion = 1;
  return { installed: true, version: 1 };
}

export async function installRealSampleProbe(page) {
  return page.evaluate(installRealSampleProbeRuntime);
}
