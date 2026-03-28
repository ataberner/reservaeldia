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
