import test from "node:test";
import assert from "node:assert/strict";
import { pollPersistedPose, PersistedPoseTimeoutError } from "./pollPersistedPose.mjs";

const expected = { x: 240, y: 120 };
const wrong = { x: 520, y: 240 };
function clock() {
  let value = 0;
  const waits = [];
  return { now: () => value, advance: (ms) => { value += ms; }, waits,
    sleep: async (ms) => { waits.push(ms); value += ms; } };
}

test("immediate persisted pose returns one read and the full default budget", async () => {
  const time = clock(), budgets = [], warnings = [];
  const result = await pollPersistedPose({ ...time, expected,
    readPose: async (remainingMs) => { budgets.push(remainingMs); return { ...expected }; },
    onSlow: (warning) => warnings.push(warning) });
  assert.deepEqual(budgets, [15_000]);
  assert.deepEqual(result, { pose: expected, polls: 1, pollWaitMs: 0,
    exceededSlowThreshold: false, slowObservationMs: null });
  assert.deepEqual(warnings, []);
  assert.deepEqual(time.waits, []);
});

test("a successful read returning at 6 s still emits a slow observation", async () => {
  const time = clock(), warnings = [];
  const result = await pollPersistedPose({ ...time, expected,
    readPose: async () => { time.advance(6_000); return { ...expected }; },
    onSlow: async (warning) => { warnings.push(warning); time.advance(250); } });
  assert.equal(result.pollWaitMs, 6_000, "observer work is not persistence observation time");
  assert.equal(result.exceededSlowThreshold, true);
  assert.equal(result.slowObservationMs, 6_000, "do not backdate a slow read to 5 s");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].elapsedMs, 6_000);
  assert.deepEqual(warnings[0].lastPose, expected);
  assert.equal(warnings[0].warning, "PERSISTED_POSE_SLOW");
});

test("later persistence below 15 s succeeds and retains the crossed 5 s warning", async () => {
  const time = clock(), warnings = [], budgets = [];
  const result = await pollPersistedPose({ ...time, expected,
    readPose: async (remainingMs) => { budgets.push(remainingMs); return time.now() >= 6_100 ? { ...expected } : { ...wrong }; },
    onSlow: (warning) => warnings.push(warning) });
  assert.equal(result.pollWaitMs, 6_100);
  assert.equal(result.polls, 62);
  assert.equal(result.exceededSlowThreshold, true);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].elapsedMs, 5_000);
  assert.deepEqual(warnings[0].lastPose, wrong);
  assert.equal(budgets.at(-1), 8_900);
});

test("a final 1 ms abort preserves expected, last pose, elapsed time and cause", async () => {
  const time = clock(), budgets = [];
  const abort = new DOMException("Read deadline reached", "TimeoutError");
  let calls = 0;
  await assert.rejects(pollPersistedPose({ ...time, expected, pollIntervalMs: 1,
    readPose: async (remainingMs) => {
      budgets.push(remainingMs);
      if (++calls === 1) { time.advance(14_998); return { ...wrong }; }
      time.advance(remainingMs);
      throw abort;
    },
  }), (error) => {
    assert.ok(error instanceof PersistedPoseTimeoutError);
    assert.equal(error.code, "PERSISTED_POSE_TIMEOUT");
    assert.equal(error.cause, abort);
    assert.deepEqual(error.diagnostics.expected, expected);
    assert.deepEqual(error.diagnostics.lastPose, wrong);
    assert.equal(error.diagnostics.elapsedMs, 15_000);
    assert.equal(error.diagnostics.polls, 2);
    assert.equal(error.diagnostics.exceededSlowThreshold, true);
    assert.equal(error.diagnostics.lastError.name, "TimeoutError");
    assert.equal(error.diagnostics.lastError.message, "Read deadline reached");
    return true;
  });
  assert.deepEqual(budgets, [15_000, 1]);
});

test("an abort before the real budget expires is propagated unchanged", async () => {
  const time = clock();
  const abort = new DOMException("Early transport cancellation", "AbortError");
  await assert.rejects(pollPersistedPose({ ...time, expected,
    readPose: async () => { time.advance(1_000); throw abort; },
  }), (error) => error === abort);
  assert.deepEqual(time.waits, []);
});

test("a real read error propagates without retries, even at the deadline", async () => {
  const time = clock(), failure = new Error("Synthetic emulator permission denied");
  let calls = 0;
  await assert.rejects(pollPersistedPose({ ...time, expected,
    readPose: async () => { calls++; time.advance(15_000); throw failure; },
  }), (error) => error === failure);
  assert.equal(calls, 1);
  assert.deepEqual(time.waits, []);
});

test("an inconsistent pose exhausts the budget without losing its last observation", async () => {
  const time = clock(), warnings = [];
  await assert.rejects(pollPersistedPose({ ...time, expected,
    readPose: async () => ({ ...wrong }), onSlow: (warning) => warnings.push(warning),
  }), (error) => {
    assert.ok(error instanceof PersistedPoseTimeoutError);
    assert.equal(error.diagnostics.elapsedMs, 15_000);
    assert.equal(error.diagnostics.polls, 150);
    assert.deepEqual(error.diagnostics.lastPose, wrong);
    assert.equal(error.diagnostics.lastError, null);
    assert.equal(error.diagnostics.slowObservationMs, 5_000);
    assert.equal(warnings.length, 1);
    return true;
  });
});

test("a matching pose observed beyond the deadline is not presented as timely success", async () => {
  const time = clock();
  await assert.rejects(pollPersistedPose({ ...time, expected,
    readPose: async () => { time.advance(15_001); return { ...expected }; },
  }), (error) => {
    assert.ok(error instanceof PersistedPoseTimeoutError);
    assert.deepEqual(error.diagnostics.lastPose, expected);
    assert.equal(error.diagnostics.elapsedMs, 15_001);
    return true;
  });
});
