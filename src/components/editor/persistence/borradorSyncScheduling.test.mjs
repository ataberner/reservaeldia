import test from "node:test";
import assert from "node:assert/strict";

import {
  BORRADOR_SYNC_PERSIST_DEBOUNCE_MS,
  createBorradorSyncSchedulingController,
  shouldRestoreClearedPersistSchedule,
} from "./borradorSyncScheduling.js";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

test("flush with a pending debounced autosave clears the timer and performs one immediate persist", async () => {
  const persistCalls = [];
  const clearedTimers = [];
  const timerCallbacks = [];
  const controller = createBorradorSyncSchedulingController({
    runPersistNow: async (options) => {
      persistCalls.push(options);
      return {
        ok: true,
        reason: "manual-flush",
      };
    },
    setTimer: (fn, delay) => {
      timerCallbacks.push({ fn, delay });
      return timerCallbacks.length;
    },
    clearTimer: (timerId) => {
      clearedTimers.push(timerId);
    },
  });

  controller.scheduleDebouncedPersist({
    reason: "debounced-autosave",
  });

  const result = await controller.flushPersistBoundary({
    reason: "preview-before-open",
  });

  assert.equal(timerCallbacks.length, 1);
  assert.equal(timerCallbacks[0].delay, BORRADOR_SYNC_PERSIST_DEBOUNCE_MS);
  assert.deepEqual(clearedTimers, [1]);
  assert.deepEqual(persistCalls, [
    {
      reason: "preview-before-open",
      immediate: true,
    },
  ]);
  assert.deepEqual(result, {
    ok: true,
    reason: "manual-flush",
    clearedScheduledPersist: true,
    restoredScheduledPersist: false,
  });
  assert.equal(controller.hasScheduledPersist(), false);
  assert.equal(controller.getPendingReason(), null);
});

test("flush restores the cleared autosave only for resize or draft-loading guard results", async () => {
  const persistCalls = [];
  const timerCallbacks = [];
  const controller = createBorradorSyncSchedulingController({
    runPersistNow: async (options) => {
      persistCalls.push(options);
      return {
        ok: false,
        reason: "resize-in-progress",
      };
    },
    setTimer: (fn) => {
      timerCallbacks.push(fn);
      return timerCallbacks.length;
    },
    clearTimer: () => {},
  });

  controller.scheduleDebouncedPersist({
    reason: "section-height",
  });

  const result = await controller.flushPersistBoundary({
    reason: "manual-flush",
  });

  assert.equal(result.clearedScheduledPersist, true);
  assert.equal(result.restoredScheduledPersist, true);
  assert.equal(controller.getPendingReason(), "section-height");
  assert.equal(timerCallbacks.length, 2);

  timerCallbacks[1]();
  await Promise.resolve();

  assert.deepEqual(persistCalls, [
    {
      reason: "manual-flush",
      immediate: true,
    },
    {
      reason: "section-height",
      immediate: false,
    },
  ]);
  assert.equal(controller.getPendingReason(), null);
  assert.equal(controller.hasScheduledPersist(), false);
});

test("restore decisions stay limited to the current guard reasons", () => {
  assert.equal(
    shouldRestoreClearedPersistSchedule({
      reason: "resize-in-progress",
    }),
    true
  );
  assert.equal(
    shouldRestoreClearedPersistSchedule({
      reason: "draft-not-loaded",
    }),
    true
  );
  assert.equal(
    shouldRestoreClearedPersistSchedule({
      reason: "persist-failed",
    }),
    false
  );
});

test("autosaves that expire while another autosave is in flight coalesce to one latest follow-up", async () => {
  const firstPersist = createDeferred();
  const timerCallbacks = [];
  const persistCalls = [];
  const controller = createBorradorSyncSchedulingController({
    runPersistNow: async (options) => {
      persistCalls.push(options);
      if (persistCalls.length === 1) {
        await firstPersist.promise;
      }
      return { ok: true };
    },
    setTimer: (fn) => {
      timerCallbacks.push(fn);
      return timerCallbacks.length;
    },
    clearTimer: () => {},
  });

  controller.scheduleDebouncedPersist({ reason: "autosave-a" });
  timerCallbacks[0]();
  await flushMicrotasks();
  assert.equal(persistCalls.length, 1);

  controller.scheduleDebouncedPersist({ reason: "autosave-b" });
  timerCallbacks[1]();
  controller.scheduleDebouncedPersist({ reason: "autosave-c" });
  timerCallbacks[2]();
  await flushMicrotasks();

  assert.equal(persistCalls.length, 1);
  assert.equal(controller.hasScheduledPersist(), true);
  assert.equal(controller.getPendingReason(), "autosave-c");

  firstPersist.resolve();
  await flushMicrotasks();

  assert.deepEqual(persistCalls, [
    { reason: "autosave-a", immediate: false },
    { reason: "autosave-c", immediate: false },
  ]);
  assert.equal(controller.hasScheduledPersist(), false);
});

test("clearing a deferred autosave prevents it from running after the active write settles", async () => {
  const firstPersist = createDeferred();
  const timerCallbacks = [];
  const persistCalls = [];
  const controller = createBorradorSyncSchedulingController({
    runPersistNow: async (options) => {
      persistCalls.push(options);
      await firstPersist.promise;
      return { ok: true };
    },
    setTimer: (fn) => {
      timerCallbacks.push(fn);
      return timerCallbacks.length;
    },
    clearTimer: () => {},
  });

  controller.scheduleDebouncedPersist({ reason: "autosave-active" });
  timerCallbacks[0]();
  await flushMicrotasks();
  controller.scheduleDebouncedPersist({ reason: "autosave-stale" });
  timerCallbacks[1]();

  assert.equal(controller.clearScheduledPersist(), true);
  firstPersist.resolve();
  await flushMicrotasks();

  assert.deepEqual(persistCalls, [
    { reason: "autosave-active", immediate: false },
  ]);
  assert.equal(controller.hasScheduledPersist(), false);
});
