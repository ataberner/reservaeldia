import test from "node:test";
import assert from "node:assert/strict";

import { createDraftWriteCoordinator } from "./draftWriteCoordinator.js";

function createDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test("draft write coordinator runs autosave, section writes, and flush in FIFO order", async () => {
  const coordinator = createDraftWriteCoordinator();
  const firstWrite = createDeferred();
  const events = [];

  const autosavePromise = coordinator.enqueueDraftWrite(async () => {
    events.push("autosave:start");
    await firstWrite.promise;
    events.push("autosave:end");
  });
  const sectionWritePromise = coordinator.enqueueDraftWrite(async () => {
    events.push("section");
  });
  const flushPromise = coordinator.enqueueDraftWrite(async () => {
    events.push("flush");
    return { ok: true };
  });

  await flushMicrotasks();
  assert.equal(coordinator.hasPendingDraftWrites(), true);
  assert.deepEqual(events, ["autosave:start"]);

  const waitForIdle = coordinator.waitForDraftWrites();
  firstWrite.resolve();

  await autosavePromise;
  await sectionWritePromise;
  assert.deepEqual(await flushPromise, { ok: true });
  await waitForIdle;

  assert.deepEqual(events, ["autosave:start", "autosave:end", "section", "flush"]);
  assert.equal(coordinator.hasPendingDraftWrites(), false);
});

test("queued follow-up writes read the latest state after earlier writes finish", async () => {
  const coordinator = createDraftWriteCoordinator();
  const blockingWrite = createDeferred();
  const seenStates = [];
  let currentState = { version: "persisted-a" };

  coordinator.enqueueDraftWrite(async () => {
    seenStates.push(currentState.version);
    await blockingWrite.promise;
  });

  const followUpPromise = coordinator.enqueueDraftWrite(async () => {
    seenStates.push(currentState.version);
    return currentState.version;
  });

  await flushMicrotasks();
  currentState = { version: "persisted-b" };
  blockingWrite.resolve();

  assert.equal(await followUpPromise, "persisted-b");
  await coordinator.waitForDraftWrites();
  assert.deepEqual(seenStates, ["persisted-a", "persisted-b"]);
});

test("mixed autosave, direct section mutation, and flush leave the newest persisted snapshot last", async () => {
  const coordinator = createDraftWriteCoordinator();
  const firstAutosave = createDeferred();
  const persistedSnapshots = [];
  let latestState = {
    objetos: [{ id: "obj-1", texto: "Antes" }],
    secciones: [{ id: "sec-1", altura: 300, altoModo: "fijo" }],
  };

  coordinator.enqueueDraftWrite(async () => {
    const snapshot = structuredClone(latestState);
    await firstAutosave.promise;
    persistedSnapshots.push({
      lane: "autosave",
      snapshot,
    });
  });

  await flushMicrotasks();
  latestState = {
    objetos: [{ id: "obj-1", texto: "Despues" }],
    secciones: [{ id: "sec-1", altura: 500, altoModo: "pantalla" }],
  };

  coordinator.enqueueDraftWrite(async () => {
    persistedSnapshots.push({
      lane: "section-write",
      snapshot: structuredClone(latestState),
    });
  });

  const flushPromise = coordinator.enqueueDraftWrite(async () => {
    const snapshot = structuredClone(latestState);
    persistedSnapshots.push({
      lane: "flush",
      snapshot,
    });
    return snapshot;
  });

  firstAutosave.resolve();
  const flushedSnapshot = await flushPromise;
  await coordinator.waitForDraftWrites();

  assert.deepEqual(flushedSnapshot, latestState);
  assert.deepEqual(
    persistedSnapshots.map((entry) => entry.lane),
    ["autosave", "section-write", "flush"]
  );
  assert.deepEqual(persistedSnapshots.at(-1)?.snapshot, latestState);
});

test("a burst of dynamic values keeps only the latest queued snapshot before preview flush", async () => {
  const coordinator = createDraftWriteCoordinator();
  const slowWrite = createDeferred();
  const writes = [];
  const promises = [coordinator.enqueueDraftWrite(async () => {
    writes.push(0);
    await slowWrite.promise;
  }, { coalesceKey: "draft:a:dynamic-values" })];
  await flushMicrotasks();
  for (let value = 1; value <= 100; value += 1) {
    promises.push(coordinator.enqueueDraftWrite(() => writes.push(value), {
      coalesceKey: "draft:a:dynamic-values",
    }));
  }
  const preview = coordinator.enqueueDraftWrite(() => writes.push("preview-flush"));
  slowWrite.resolve();
  await Promise.all([...promises, preview]);
  await coordinator.waitForDraftWrites();
  assert.deepEqual(writes, [0, 100, "preview-flush"]);
  assert.equal(coordinator.hasPendingDraftWrites(), false);
});

test("coalescing cannot cross a section, schema, flush or session boundary", async () => {
  const coordinator = createDraftWriteCoordinator();
  const events = [];
  const valueWrite = (value, key = "draft:a:dynamic-values") =>
    coordinator.enqueueDraftWrite(() => events.push(value), { coalesceKey: key });
  const first = valueWrite("a");
  const section = coordinator.enqueueDraftWrite(() => events.push("section"));
  const second = valueWrite("b");
  const third = valueWrite("c");
  const differentSession = valueWrite("other", "draft:b:dynamic-values");
  const afterDifferentSession = valueWrite("d");
  await Promise.all([first, section, second, third, differentSession, afterDifferentSession]);
  assert.deepEqual(events, ["a", "section", "c", "other", "d"]);
});

test("all coalesced callers observe failure and a subsequent flush can recover", async () => {
  const coordinator = createDraftWriteCoordinator();
  const first = coordinator.enqueueDraftWrite(() => assert.fail("superseded"), { coalesceKey: "values" });
  const error = new Error("write failed");
  const last = coordinator.enqueueDraftWrite(() => { throw error; }, { coalesceKey: "values" });
  const outcomes = Promise.allSettled([first, last]);
  const flush = coordinator.enqueueDraftWrite(() => ({ ok: true }));
  assert.deepEqual(await outcomes, [
    { status: "rejected", reason: error }, { status: "rejected", reason: error },
  ]);
  assert.deepEqual(await flush, { ok: true });
  await coordinator.waitForDraftWrites();
  assert.equal(coordinator.hasPendingDraftWrites(), false);
});
