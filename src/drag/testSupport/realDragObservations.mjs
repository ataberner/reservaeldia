// Optional test-only observers. No DOM/Fiber traversal, scene writes or RAF.
export function installRealReactCommitProbeRuntime(target = globalThis) {
  if (target.__REACT_DEVTOOLS_GLOBAL_HOOK__) return { installed: false, reason: "existing-devtools-hook" };
  let active = false, commits = [], sequence = 0, rootSequence = 0;
  const roots = new WeakMap(), renderers = new Map();
  const state = {
    available: false,
    start() { commits = []; active = true; },
    stop() {
      active = false;
      return { available: state.available, renderers: [...renderers.values()], commits,
        reason: state.available ? null : "React has not injected a renderer",
        meaning: "Root commits by renderer; not component render counts or React durations" };
    },
  };
  target.__DRAG_PERF_REACT_ROOTS = state;
  target.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers,
    inject(renderer) {
      const id = ++sequence;
      renderers.set(id, { id, name: renderer?.rendererPackageName || null, version: renderer?.version || null });
      state.available = true;
      return id;
    },
    onCommitFiberRoot(rendererId, root, priority, didError) {
      if (!active) return;
      if (!roots.has(root)) roots.set(root, ++rootSequence);
      commits.push({ rendererId, rootId: roots.get(root), at: target.performance.now(),
        priority: priority ?? null, didError: Boolean(didError) });
    },
  };
  return { installed: true };
}

export async function installRealReactCommitProbe(page) {
  return page.evaluateOnNewDocument(installRealReactCommitProbeRuntime);
}

export function installRealLongTaskProbeRuntime(
  probe = globalThis.__DRAG_PERF_PROBE,
  Observer = globalThis.PerformanceObserver,
  now = () => performance.now()
) {
  if (!probe?.start || !probe?.stop) throw new Error("Install the base performance probe first");
  if (probe.realLongTasksVersion === 1) return { installed: false, version: 1 };
  const original = { start: probe.start, stop: probe.stop };
  let available = Boolean(Observer?.supportedEntryTypes?.includes("longtask"));
  let active = false, startedAt = 0, entries = [], observer = null, truncated = false;
  let reason = available ? null : "PerformanceObserver longtask is unavailable";
  const append = (batch) => {
    if (!active) return;
    for (const entry of batch) {
      if (entry.startTime < startedAt) continue;
      if (entries.length >= 1000) { truncated = true; continue; }
      entries.push({ startTime: entry.startTime, duration: entry.duration, name: entry.name });
    }
  };
  probe.start = function (...args) {
    observer?.disconnect(); active = false; entries = []; truncated = false;
    const result = original.start.apply(this, args);
    startedAt = now(); active = true;
    if (available) {
      try {
        observer = new Observer((list) => append(list.getEntries()));
        observer.observe({ type: "longtask", buffered: false });
      } catch (error) {
        available = false; reason = String(error?.message || "Longtask observer could not start");
      }
    }
    return result;
  };
  probe.stop = function (...args) {
    if (observer) { append(observer.takeRecords()); observer.disconnect(); }
    const endedAt = now(); active = false;
    const result = original.stop.apply(this, args);
    return { ...result, longTasks: { available, reason, startedAt, endedAt, entries, truncated,
      meaning: "Browser Long Tasks entries (50 ms threshold); not dropped frames or exclusive drag CPU" } };
  };
  probe.realLongTasksVersion = 1;
  return { installed: true, version: 1, available };
}

export async function installRealLongTaskProbe(page) {
  return page.evaluate(installRealLongTaskProbeRuntime);
}
