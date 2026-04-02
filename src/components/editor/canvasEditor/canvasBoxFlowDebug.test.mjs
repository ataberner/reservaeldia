import test from "node:test";
import assert from "node:assert/strict";

import {
  CANVAS_BOX_FLOW_SUMMARY_THROTTLE_MS,
  endCanvasBoxFlowSession,
  ensureCanvasBoxFlowSession,
  flushCanvasBoxFlowSummary,
  logCanvasBoxFlow,
  recordCanvasBoxFlowSummary,
  resetCanvasBoxFlowDebugState,
} from "./canvasBoxFlowDebug.js";

function createFakeWindow() {
  let nowMs = 0;
  const logs = [];

  return {
    __DBG_CANVAS_BOX_FLOW: true,
    console: {
      log(...args) {
        logs.push(args);
      },
    },
    performance: {
      now() {
        return nowMs;
      },
    },
    getLogs() {
      return logs;
    },
    advance(ms) {
      nowMs += Number(ms) || 0;
      return nowMs;
    },
  };
}

test("disabled box-flow debug produces no session or log output", () => {
  const fakeWindow = createFakeWindow();
  fakeWindow.__DBG_CANVAS_BOX_FLOW = false;

  const session = ensureCanvasBoxFlowSession(
    "hover",
    "obj-1",
    { source: "stage" },
    {},
    fakeWindow
  );
  const logEntry = logCanvasBoxFlow(
    "hover",
    "target:resolved",
    { hoverId: "obj-1" },
    { identity: "obj-1" },
    fakeWindow
  );

  assert.equal(session, null);
  assert.equal(logEntry, null);
  assert.deepEqual(fakeWindow.getLogs(), []);
});

test("box-flow sessions keep stable token, sequence, and relative time", () => {
  const fakeWindow = createFakeWindow();
  resetCanvasBoxFlowDebugState(fakeWindow);

  const session = ensureCanvasBoxFlowSession(
    "hover",
    "obj-1",
    { source: "stage" },
    {},
    fakeWindow
  );

  fakeWindow.advance(5);

  const entry = logCanvasBoxFlow(
    "hover",
    "target:resolved",
    { hoverId: "obj-1", source: "enter" },
    { identity: "obj-1" },
    fakeWindow
  );

  assert.equal(session?.token, "hover#1");
  assert.equal(entry?.token, "hover#1");
  assert.equal(entry?.seq, 2);
  assert.equal(entry?.relativeMs, 5);
  assert.equal(fakeWindow.getLogs().length, 2);
  assert.equal(
    fakeWindow.getLogs()[1][0],
    "[BOXFLOW][hover#1][#2][+5ms] target:resolved"
  );
});

test("repeated movement summaries stay bounded and flush on the throttle window", () => {
  const fakeWindow = createFakeWindow();
  resetCanvasBoxFlowDebugState(fakeWindow);

  ensureCanvasBoxFlowSession(
    "selection",
    "obj-1",
    { source: "selection" },
    {},
    fakeWindow
  );

  recordCanvasBoxFlowSummary(
    "selection",
    "drag-move",
    { x: 10, y: 20 },
    {
      identity: "obj-1",
      eventName: "drag:summary",
    },
    fakeWindow
  );
  fakeWindow.advance(CANVAS_BOX_FLOW_SUMMARY_THROTTLE_MS / 2);
  recordCanvasBoxFlowSummary(
    "selection",
    "drag-move",
    { x: 14, y: 24 },
    {
      identity: "obj-1",
      eventName: "drag:summary",
    },
    fakeWindow
  );
  fakeWindow.advance(CANVAS_BOX_FLOW_SUMMARY_THROTTLE_MS);
  const summaryEntry = recordCanvasBoxFlowSummary(
    "selection",
    "drag-move",
    { x: 18, y: 28 },
    {
      identity: "obj-1",
      eventName: "drag:summary",
    },
    fakeWindow
  );

  assert.equal(fakeWindow.getLogs().length, 2);
  assert.equal(summaryEntry?.eventName, "drag:summary");
  assert.equal(summaryEntry?.payload?.count, 3);
  assert.equal(summaryEntry?.payload?.flowKind, "selection");
  assert.equal(summaryEntry?.payload?.sessionToken, "selection#1");
  assert.equal(summaryEntry?.payload?.summaryKey, "drag-move");
  assert.equal(summaryEntry?.payload?.firstPos, "x=10 y=20");
  assert.equal(summaryEntry?.payload?.lastPos, "x=18 y=28");
  assert.equal("first" in (summaryEntry?.payload || {}), false);
  assert.equal("last" in (summaryEntry?.payload || {}), false);
  assert.match(fakeWindow.getLogs()[1][1], /summary=drag-move/);
  assert.match(fakeWindow.getLogs()[1][1], /firstPos=x=10 y=20/);
  assert.deepEqual(fakeWindow.getLogs()[1][2], summaryEntry?.payload);
});

test("ending a session flushes pending summaries before cleanup", () => {
  const fakeWindow = createFakeWindow();
  resetCanvasBoxFlowDebugState(fakeWindow);

  ensureCanvasBoxFlowSession(
    "hover",
    "obj-2",
    { source: "stage" },
    {},
    fakeWindow
  );
  recordCanvasBoxFlowSummary(
    "hover",
    "bounds",
    {
      source: "clientRect",
      hoverId: "obj-2",
      bounds: { x: 8, y: 10, width: 20, height: 30 },
    },
    {
      identity: "obj-2",
      eventName: "bounds:summary",
    },
    fakeWindow
  );
  fakeWindow.advance(16);
  recordCanvasBoxFlowSummary(
    "hover",
    "bounds",
    {
      source: "clientRect",
      hoverId: "obj-2",
      bounds: { x: 10, y: 14, width: 20, height: 30 },
    },
    {
      identity: "obj-2",
      eventName: "bounds:summary",
    },
    fakeWindow
  );

  const endEntry = endCanvasBoxFlowSession(
    "hover",
    { reason: "hidden" },
    {},
    fakeWindow
  );

  assert.equal(fakeWindow.getLogs().length, 3);
  assert.equal(fakeWindow.getLogs()[1][0], "[BOXFLOW][hover#1][#2][+16ms] bounds:summary");
  assert.match(fakeWindow.getLogs()[1][1], /hover=obj-2/);
  assert.match(fakeWindow.getLogs()[1][1], /firstBounds=rect@8,10 20x30/);
  assert.match(fakeWindow.getLogs()[1][1], /lastBounds=rect@10,14 20x30/);
  assert.equal(endEntry?.payload?.reason, "hidden");
});

test("summary logs flatten bounds and source lineage into the top-level payload", () => {
  const fakeWindow = createFakeWindow();
  resetCanvasBoxFlowDebugState(fakeWindow);

  ensureCanvasBoxFlowSession(
    "selection",
    "drag-overlay:1:obj-1",
    { source: "selection" },
    {},
    fakeWindow
  );

  recordCanvasBoxFlowSummary(
    "selection",
    "drag-overlay:bounds",
    {
      source: "effect-init",
      debugSource: "drag-overlay",
      selectedIds: "obj-1",
      bounds: { kind: "rect", x: 10, y: 20, width: 30, height: 40 },
    },
    {
      identity: "drag-overlay:1:obj-1",
      eventName: "bounds:summary",
    },
    fakeWindow
  );

  fakeWindow.advance(16);

  const summaryEntry = recordCanvasBoxFlowSummary(
    "selection",
    "drag-overlay:bounds",
    {
      source: "node-dragmove",
      debugSource: "drag-overlay",
      selectedIds: "obj-1",
      bounds: { kind: "rect", x: 14, y: 24, width: 30, height: 40 },
    },
    {
      identity: "drag-overlay:1:obj-1",
      eventName: "bounds:summary",
      throttleMs: 0,
    },
    fakeWindow
  );

  assert.equal(summaryEntry?.payload?.sources, "effect-init | node-dragmove");
  assert.equal(summaryEntry?.payload?.debugSource, "drag-overlay");
  assert.equal(summaryEntry?.payload?.selectedIds, "obj-1");
  assert.equal(summaryEntry?.payload?.firstBounds, "rect@10,20 30x40");
  assert.equal(summaryEntry?.payload?.lastBounds, "rect@14,24 30x40");
  assert.equal(summaryEntry?.payload?.firstSource, "effect-init");
  assert.equal(summaryEntry?.payload?.lastSource, "node-dragmove");
  assert.equal(summaryEntry?.payload?.flowKind, "selection");
  assert.equal(fakeWindow.getLogs().length, 2);
  assert.match(fakeWindow.getLogs()[1][1], /src=effect-init \| node-dragmove/);
  assert.match(fakeWindow.getLogs()[1][1], /selected=obj-1/);
  assert.deepEqual(fakeWindow.getLogs()[1][2], summaryEntry?.payload);
});

test("drift summaries flatten lag metrics and drag-overlay lineage", () => {
  const fakeWindow = createFakeWindow();
  resetCanvasBoxFlowDebugState(fakeWindow);

  ensureCanvasBoxFlowSession(
    "selection",
    "drag-overlay:2:obj-1",
    { source: "selection" },
    {},
    fakeWindow
  );

  recordCanvasBoxFlowSummary(
    "selection",
    "drag-overlay:drift",
    {
      source: "drag-move",
      debugSource: "drag-overlay-drift",
      dragId: "obj-1",
      selectedIds: "obj-1",
      comparisonOrder: "overlay-before-drag",
      orderGap: 1,
      dragSource: "element-drag-move",
      overlaySource: "node-dragmove",
      dx: 6,
      dy: 2,
      distance: Math.sqrt(40),
      driftState: "growing",
      dragBounds: { kind: "rect", x: 100, y: 200, width: 30, height: 40 },
      overlayBounds: { kind: "rect", x: 106, y: 202, width: 30, height: 40 },
    },
    {
      identity: "drag-overlay:2:obj-1",
      eventName: "drift:summary",
    },
    fakeWindow
  );

  fakeWindow.advance(16);

  const summaryEntry = recordCanvasBoxFlowSummary(
    "selection",
    "drag-overlay:drift",
    {
      source: "overlay-update",
      debugSource: "drag-overlay-drift",
      dragId: "obj-1",
      selectedIds: "obj-1",
      comparisonOrder: "overlay-after-drag",
      orderGap: 2,
      dragSource: "element-drag-move",
      overlaySource: "node-dragmove",
      dx: 3,
      dy: 1,
      distance: Math.sqrt(10),
      driftState: "catching-up",
      dragBounds: { kind: "rect", x: 110, y: 210, width: 30, height: 40 },
      overlayBounds: { kind: "rect", x: 113, y: 211, width: 30, height: 40 },
    },
    {
      identity: "drag-overlay:2:obj-1",
      eventName: "drift:summary",
      throttleMs: 0,
    },
    fakeWindow
  );

  assert.equal(summaryEntry?.payload?.dragId, "obj-1");
  assert.equal(summaryEntry?.payload?.selectedIds, "obj-1");
  assert.equal(summaryEntry?.payload?.dragSources, "element-drag-move");
  assert.equal(summaryEntry?.payload?.boxSources, "node-dragmove");
  assert.equal(
    summaryEntry?.payload?.orders,
    "overlay-before-drag | overlay-after-drag"
  );
  assert.equal(summaryEntry?.payload?.firstDrift, "dx=6 dy=2 dist=6.325");
  assert.equal(summaryEntry?.payload?.maxDrift, "dx=6 dy=2 dist=6.325");
  assert.equal(summaryEntry?.payload?.lastDrift, "dx=3 dy=1 dist=3.162");
  assert.equal(summaryEntry?.payload?.firstDragBounds, "rect@100,200 30x40");
  assert.equal(summaryEntry?.payload?.lastBoxBounds, "rect@113,211 30x40");
  assert.equal(summaryEntry?.payload?.driftPattern, "changing");
  assert.equal(summaryEntry?.payload?.maxEventGap, 2);
  assert.match(fakeWindow.getLogs()[1][1], /maxDrift=dx=6 dy=2 dist=6.325/);
  assert.match(
    fakeWindow.getLogs()[1][1],
    /dragSrc=element-drag-move/
  );
  assert.match(
    fakeWindow.getLogs()[1][1],
    /boxSrc=node-dragmove/
  );
  assert.match(
    fakeWindow.getLogs()[1][1],
    /order=overlay-before-drag \| overlay-after-drag/
  );
});

test("startup summaries expose first visible overlay frame versus first live drag frame", () => {
  const fakeWindow = createFakeWindow();
  resetCanvasBoxFlowDebugState(fakeWindow);

  ensureCanvasBoxFlowSession(
    "selection",
    "drag-overlay:startup:obj-1",
    { source: "selection" },
    {},
    fakeWindow
  );

  recordCanvasBoxFlowSummary(
    "selection",
    "drag-overlay:startup",
    {
      source: "startup-diagnostic",
      debugSource: "drag-overlay-startup",
      dragId: "obj-1",
      selectedIds: "obj-1",
      dragSource: "element-drag-move",
      boxSource: "predrag-seed",
      dragBounds: { kind: "rect", x: 120, y: 200, width: 30, height: 40 },
      overlayBounds: { kind: "rect", x: 110, y: 188, width: 30, height: 40 },
      firstVisibleBeforeLiveDrag: true,
      visibleSeedBeforeLiveDrag: true,
      startupJump: "dx=-10 dy=-12 dist=15.62",
    },
    {
      identity: "drag-overlay:startup:obj-1",
      eventName: "startup:summary",
      throttleMs: 0,
    },
    fakeWindow
  );

  const summaryEntry = flushCanvasBoxFlowSummary(
    "selection",
    "drag-overlay:startup",
    { reason: "startup-captured" },
    fakeWindow
  );

  assert.equal(summaryEntry?.payload?.dragId, "obj-1");
  assert.equal(summaryEntry?.payload?.selectedIds, "obj-1");
  assert.equal(summaryEntry?.payload?.dragSource, "element-drag-move");
  assert.equal(summaryEntry?.payload?.boxSource, "predrag-seed");
  assert.equal(summaryEntry?.payload?.firstDragBounds, "rect@120,200 30x40");
  assert.equal(summaryEntry?.payload?.firstBoxBounds, "rect@110,188 30x40");
  assert.equal(summaryEntry?.payload?.firstVisibleBeforeLiveDrag, true);
  assert.equal(summaryEntry?.payload?.visibleSeedBeforeLiveDrag, true);
  assert.equal(summaryEntry?.payload?.startupJump, "dx=-10 dy=-12 dist=15.62");
  assert.match(fakeWindow.getLogs()[1][1], /visibleBeforeLive=yes/);
  assert.match(fakeWindow.getLogs()[1][1], /seedBeforeLive=yes/);
  assert.match(fakeWindow.getLogs()[1][1], /startupJump=dx=-10 dy=-12 dist=15.62/);
});
