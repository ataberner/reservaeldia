import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBrowserStorageRecoveryViewModel,
  readDashboardPendingChangesState,
  runBrowserStorageRecoveryReload,
} from "./browserStorageRecoveryUi.js";

test("recovery UI appears only for active IndexedDB recovery state", () => {
  const hidden = buildBrowserStorageRecoveryViewModel(
    { active: false, storageKind: null },
    {}
  );
  const visible = buildBrowserStorageRecoveryViewModel(
    {
      active: true,
      storageKind: "indexeddb",
      repetitions: 1,
      operation: "sync-editor-slug-from-query",
    },
    { known: false }
  );

  assert.equal(hidden.visible, false);
  assert.equal(visible.visible, true);
  assert.match(visible.pendingWarning, /No podemos confirmar/);
});

test("pending changes reader uses the existing canvas editor bridge", () => {
  const pending = readDashboardPendingChangesState({
    canvasEditor: {
      hasPendingDraftWrites: () => true,
      flushPersistenceNow: async () => ({ ok: true }),
    },
  });

  assert.equal(pending.known, true);
  assert.equal(pending.hasPendingChanges, true);
  assert.equal(pending.hasFlushBridge, true);
});

test("manual recovery reload flushes once and reloads once when confirmed", async () => {
  let flushes = 0;
  let reloads = 0;

  const result = await runBrowserStorageRecoveryReload({
    canvasEditor: {
      hasPendingDraftWrites: () => true,
      flushPersistenceNow: async () => {
        flushes += 1;
        return { ok: true };
      },
    },
    reload: () => {
      reloads += 1;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(flushes, 1);
  assert.equal(reloads, 1);
});

test("manual recovery reload does not reload when flush is not confirmed", async () => {
  let reloads = 0;

  const result = await runBrowserStorageRecoveryReload({
    canvasEditor: {
      hasPendingDraftWrites: () => true,
      flushPersistenceNow: async () => ({ ok: false, reason: "write-failed" }),
    },
    reload: () => {
      reloads += 1;
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.blocked, true);
  assert.equal(reloads, 0);
});

test("manual unconfirmed reload is explicit and does not loop", async () => {
  let reloads = 0;

  const result = await runBrowserStorageRecoveryReload({
    canvasEditor: {
      hasPendingDraftWrites: () => true,
      flushPersistenceNow: async () => ({ ok: false }),
    },
    allowUnconfirmed: true,
    reload: () => {
      reloads += 1;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.allowUnconfirmed, true);
  assert.equal(reloads, 1);
});
