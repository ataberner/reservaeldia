import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { installRealSampleProbeRuntime } from "./realDragSampleProbe.mjs";
import { installRealReactCommitProbeRuntime, installRealLongTaskProbeRuntime } from "./realDragObservations.mjs";

const require = createRequire(import.meta.url);
const ts = require("../../../functions/node_modules/typescript");
const { instrumentDragPerformance, TARGETS } = require("./instrumentDragPerformance.cjs");
const sources = {
  "CanvasStageContentComposer.jsx": "../../components/editor/textSystem/render/konva/CanvasStageContentComposer.jsx",
  "SelectionBoundsIndicator.jsx": "../../components/editor/textSystem/render/konva/SelectionBoundsIndicator.jsx",
  "useGuiasCentrado.js": "../../hooks/useGuiasCentrado.js",
  "konvaAuthoritativeBounds.js": "../../components/editor/canvasEditor/konvaAuthoritativeBounds.js",
  "selectionBoundsGeometry.js": "../../components/editor/textSystem/render/konva/selectionBoundsGeometry.js",
};
const parse = (source, name) => ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true,
  name.endsWith("jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.JS);

function baseProbe() {
  let active = false;
  const calls = {};
  return {
    calls,
    begin(name) { if (!active) return null; return () => { calls[name] = (calls[name] || 0) + 1; }; },
    start() { active = true; return "started"; },
    stop() { active = false; return { original: true, spans: calls }; },
  };
}

test("all production owners parse after AST instrumentation and expose exact composer sample boundaries", async () => {
  for (const [name, relative] of Object.entries(sources)) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8");
    const result = instrumentDragPerformance(source, name);
    assert.equal(parse(result.source, name).parseDiagnostics.length, 0, name);
    for (const target of TARGETS[name]) assert.ok(result.functions.includes(`${name}:${target}`), `${name}:${target}`);
    if (name === "CanvasStageContentComposer.jsx") {
      assert.equal(result.sampleHooks.filter((entry) => entry.endsWith(":onDragMovePersonalizado")).length, 3);
      for (const kind of ["selection-resolved", "guide-outcome", "overlay-request", "overlay-result", "authoritative-drag-sample", "text-authority-diagnostic"]) {
        assert.equal(result.sampleHooks.filter((entry) => entry === `${name}:${kind}`).length, 1);
      }
    }
    if (name === "useGuiasCentrado.js") assert.deepEqual(result.sampleHooks, ["useGuiasCentrado.js:target-cache"]);
    assert.throws(() => instrumentDragPerformance(result.source, name), /already instrumented/);
  }
});

test("instrumentation preserves expression/block returns, this, arguments and throwing calls", () => {
  const source = `
    function getNodeBox(value) { if (value < 0) throw new Error("negative"); return this.factor * value; }
    const readGuideTargetGeometrySample = value => value + 2;
    return { getNodeBox, readGuideTargetGeometrySample };
  `;
  const original = new Function(source)();
  const transformed = new Function(instrumentDragPerformance(source, "useGuiasCentrado.js").source)();
  assert.equal(transformed.getNodeBox.call({ factor: 3 }, 4), original.getNodeBox.call({ factor: 3 }, 4));
  assert.equal(transformed.readGuideTargetGeometrySample(5), 7);
  const previous = globalThis.__DRAG_PERF_PROBE;
  const probe = baseProbe(); globalThis.__DRAG_PERF_PROBE = probe; probe.start();
  try {
    assert.equal(transformed.getNodeBox.call({ factor: 3 }, 4), 12);
    assert.throws(() => transformed.getNodeBox(-1), /negative/);
    assert.equal(probe.calls["useGuiasCentrado.js:getNodeBox"], 2);
  } finally { globalThis.__DRAG_PERF_PROBE = previous; }
});

test("the real instrumented snapshot callback preserves identity/results and records without extra node measurements", async () => {
  const source = await readFile(new URL(sources["CanvasStageContentComposer.jsx"], import.meta.url), "utf8");
  const transformed = instrumentDragPerformance(source, "CanvasStageContentComposer.jsx").source;
  const tree = parse(transformed, "CanvasStageContentComposer.jsx");
  let callback;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "resolveLiveDragSelectionSnapshot") callback = node.initializer.arguments[0].getText(tree);
    ts.forEachChild(node, visit);
  };
  visit(tree); assert.ok(callback);
  let geometryCalls = 0;
  const geometry = { kind: "polygon", points: [0, 0, 10, 0, 10, 20, 0, 20], strokeWidth: 1 };
  const node = new Proxy({}, { get() { throw new Error("diagnostics must not measure the node"); } });
  const deps = {
    sanitizeSelectionIds: (value) => value,
    resolveSelectionBounds() { geometryCalls += 1; return geometry; },
    buildCanvasBoxFlowIdsDigest: (value) => value.join(","),
    elementRefs: { current: { text: node } }, objetos: [{ id: "text", tipo: "texto" }], objectLookup: new Map(),
    stageRef: { current: {} }, isMobile: false,
    dragOverlayBoxFlowSessionRef: { current: { sessionKey: "session-a", interactionEpoch: 4, phase: "drag", dragId: "text", selectedIds: ["text"] } },
  };
  const resolve = new Function(...Object.keys(deps), `return (${callback});`)(...Object.values(deps));
  const previous = globalThis.__DRAG_PERF_PROBE;
  const probe = baseProbe(); let clock = 0;
  installRealSampleProbeRuntime(probe, () => ++clock);
  globalThis.__DRAG_PERF_PROBE = probe;
  try {
    probe.start();
    const close = probe.beginRealSample({ elementId: "text", session: deps.dragOverlayBoxFlowSessionRef.current });
    const first = resolve(["text"]), second = resolve(["text"]);
    assert.equal(first.bounds, geometry); assert.equal(second.bounds, geometry);
    close({ session: deps.dragOverlayBoxFlowSessionRef.current });
    const raw = probe.stop(), sample = raw.realSamples.samples[0];
    assert.equal(geometryCalls, 2);
    assert.equal(sample.selectionResolutionAttempts, 2);
    assert.deepEqual(sample.repeatedSelectionResults.map(({ sameBounds, sameRecordedContext }) => ({ sameBounds, sameRecordedContext })), [{ sameBounds: true, sameRecordedContext: true }]);
    geometry.points[0] = 99;
    assert.equal(sample.events[0].bounds.points[0], 0, "observations copy already-computed geometry");
    assert.equal(raw.original, true);
  } finally { globalThis.__DRAG_PERF_PROBE = previous; }
});

test("sample probe isolates gestures, keeps base spans and distinguishes changed sessions/results", () => {
  const probe = baseProbe(); let clock = 0;
  installRealSampleProbeRuntime(probe, () => ++clock);
  assert.deepEqual(installRealSampleProbeRuntime(probe), { installed: false, version: 1 });
  assert.equal(probe.beginRealSample({}), null);
  probe.start();
  const end = probe.beginRealSample({ elementId: "text", session: { sessionKey: "a", interactionEpoch: 1 } });
  const outer = probe.begin("CanvasStageContentComposer.jsx:recordSelectionDragMoveSummary");
  const inner = probe.begin("CanvasStageContentComposer.jsx:resolveLiveDragSelectionSnapshot");
  probe.noteRealDrag("selection-resolved", { selectedIds: ["text"], bounds: { x: 1 }, session: { sessionKey: "a" } });
  inner();
  probe.noteRealDrag("selection-resolved", { selectedIds: ["text"], bounds: { x: 2 }, session: { sessionKey: "b" } });
  outer(); end({ session: { sessionKey: "b", interactionEpoch: 2 } });
  const raw = probe.stop(), sample = raw.realSamples.samples[0];
  assert.equal(sample.repeatedSelectionResults[0].sameBounds, false);
  assert.equal(sample.repeatedSelectionResults[0].sameRecordedContext, false);
  assert.ok(sample.spans.find((span) => span.name.endsWith("recordSelectionDragMoveSummary")).exclusiveAmongMeasuredMs < sample.spans.find((span) => span.name.endsWith("recordSelectionDragMoveSummary")).durationMs);
  assert.equal(probe.calls["CanvasStageContentComposer.jsx:resolveLiveDragSelectionSnapshot"], 1);
  probe.start(); assert.equal(probe.stop().realSamples.samples.length, 0);
});

test("the real composer move callback keeps event order and closes a sample on exceptions", async () => {
  const name = "CanvasStageContentComposer.jsx";
  const source = await readFile(new URL(sources[name], import.meta.url), "utf8");
  const findMove = (text) => {
    const tree = parse(text, name); let callback;
    const visit = (node) => {
      if (ts.isArrowFunction(node) && node.parameters[1]?.name.getText(tree) === "elementId" &&
        node.parameters[0]?.name.getText(tree) === "pos") callback = node.getText(tree);
      ts.forEachChild(node, visit);
    };
    visit(tree); assert.ok(callback); return callback;
  };
  const events = [], state = { shouldThrow: false };
  const session = { sessionKey: "move-session", interactionEpoch: 7, phase: "drag" };
  const deps = {
    obj: { tipo: "texto" }, dragOverlayBoxFlowSessionRef: { current: session },
    runtimeSelectedIds: ["text"], elementosSeleccionados: ["text"], sanitizeSelectionIds: (ids) => ids,
    readActiveDragOverlaySelectionIds: (_id, ids) => ids,
    buildGuideEvaluationRequest: (pos, id, meta, source) => ({ pos, elementId: id, source }),
    scheduleGuideEvaluation(request) { events.push(["guide", request]); if (state.shouldThrow) throw new Error("guide-fixture-error"); },
    cancelScheduledGuideEvaluation() { events.push(["cancel"]); },
    logSelectionDragLifecycle(...args) { events.push(args); },
  };
  const compile = (text) => new Function(...Object.keys(deps), `return (${findMove(text)});`)(...Object.values(deps));
  const original = compile(source), changed = compile(instrumentDragPerformance(source, name).source);
  const previous = globalThis.__DRAG_PERF_PROBE;
  try {
    delete globalThis.__DRAG_PERF_PROBE;
    assert.equal(original({ x: 1, y: 2 }, "text"), undefined);
    const expected = [...events]; events.length = 0;
    assert.equal(changed({ x: 1, y: 2 }, "text"), undefined);
    assert.deepEqual(events, expected);
    const probe = baseProbe(); let clock = 0;
    installRealSampleProbeRuntime(probe, () => ++clock); globalThis.__DRAG_PERF_PROBE = probe;
    probe.start(); state.shouldThrow = true;
    assert.throws(() => changed({ x: 4, y: 5 }, "text"), /guide-fixture-error/);
    assert.equal(probe.realSampleActive, false);
    const sample = probe.stop().realSamples.samples[0];
    assert.equal(sample.session.sessionId, "move-session");
    assert.equal(sample.endSession.epoch, 7);
    assert.ok(sample.endedAt > sample.startedAt);
  } finally { globalThis.__DRAG_PERF_PROBE = previous; }
});

test("React observer counts actual injected renderer/root commits without inspecting Fibers", () => {
  const target = { performance: { now: () => 12 } };
  assert.deepEqual(installRealReactCommitProbeRuntime(target), { installed: true });
  assert.equal(target.__DRAG_PERF_REACT_ROOTS.stop().available, false);
  const hook = target.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  const renderer = hook.inject({ rendererPackageName: "react-dom", version: "fixture" });
  const root = new Proxy({}, { get() { throw new Error("no Fiber traversal"); } });
  hook.onCommitFiberRoot(renderer, root);
  target.__DRAG_PERF_REACT_ROOTS.start();
  hook.onCommitFiberRoot(renderer, root, 3, false); hook.onCommitFiberRoot(renderer, root, 3, false);
  const result = target.__DRAG_PERF_REACT_ROOTS.stop();
  assert.equal(result.available, true); assert.equal(result.commits.length, 2);
  assert.equal(result.commits[0].rootId, result.commits[1].rootId);
  assert.deepEqual(installRealReactCommitProbeRuntime(target), { installed: false, reason: "existing-devtools-hook" });
});

test("longtask observer drains queued entries, preserves base API and labels unsupported browsers", () => {
  let instance;
  class Observer {
    static supportedEntryTypes = ["longtask"];
    constructor(callback) { this.callback = callback; instance = this; }
    observe(options) { assert.deepEqual(options, { type: "longtask", buffered: false }); }
    takeRecords() { return [{ startTime: 11, duration: 55, name: "self" }]; }
    disconnect() {}
  }
  const probe = baseProbe(); installRealLongTaskProbeRuntime(probe, Observer, () => 10);
  assert.equal(probe.start(), "started");
  instance.callback({ getEntries: () => [{ startTime: 5, duration: 80 }, { startTime: 10, duration: 60, name: "self" }] });
  const result = probe.stop();
  assert.equal(result.original, true); assert.equal(result.longTasks.available, true);
  assert.deepEqual(result.longTasks.entries.map((entry) => entry.duration), [60, 55]);
  const unsupported = baseProbe(); installRealLongTaskProbeRuntime(unsupported, null, () => 10);
  unsupported.start(); assert.equal(unsupported.stop().longTasks.available, false);
});

test("longtask and sample extensions compose without replacing baseline outputs", () => {
  const probe = baseProbe();
  installRealLongTaskProbeRuntime(probe, null, () => 10);
  installRealSampleProbeRuntime(probe, () => 10);
  assert.equal(probe.start(), "started");
  const close = probe.beginRealSample({ elementId: "one" }); close();
  const result = probe.stop();
  assert.equal(result.original, true);
  assert.equal(result.longTasks.available, false);
  assert.equal(result.realSamples.samples.length, 1);
  assert.equal(result.reactRootCommits.available, false);
});
