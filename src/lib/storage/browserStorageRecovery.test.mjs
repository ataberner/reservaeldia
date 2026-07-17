import test from "node:test";
import assert from "node:assert/strict";
import {
  getBrowserStorageRecoveryState,
  markBrowserStorageFailure,
  resetBrowserStorageRecoveryForTests,
  shouldStopBrowserStorageRetries,
} from "./browserStorageRecovery.js";

test("marks IndexedDB connection loss as a single active recovery state", () => {
  resetBrowserStorageRecoveryForTests();
  const error = new DOMException(
    "Connection to Indexed Database server lost. Refresh the page to try again",
    "UnknownError"
  );

  const first = markBrowserStorageFailure(error, {
    operation: "sync-editor-slug-from-query",
    module: "useDashboardEditorRoute",
    phase: "route-sync",
    slug: "amelia",
  });
  const second = markBrowserStorageFailure(error, {
    operation: "sync-editor-slug-from-query",
    module: "useDashboardEditorRoute",
    phase: "route-sync",
    slug: "amelia",
  });
  const state = getBrowserStorageRecoveryState();

  assert.equal(first.handled, true);
  assert.equal(second.handled, true);
  assert.equal(state.active, true);
  assert.equal(state.storageKind, "indexeddb");
  assert.equal(state.repetitions, 2);
  assert.equal(state.slug, "amelia");
});

test("does not activate recovery for unrelated errors", () => {
  resetBrowserStorageRecoveryForTests();

  const result = markBrowserStorageFailure(new Error("network unavailable"), {
    operation: "load-dashboard",
  });

  assert.equal(result.handled, false);
  assert.equal(getBrowserStorageRecoveryState().active, false);
});

test("stops retries once the IndexedDB connection is known unusable", () => {
  resetBrowserStorageRecoveryForTests();
  const error = new DOMException(
    "An internal error was encountered in the Indexed Database server",
    "AbortError"
  );

  assert.equal(shouldStopBrowserStorageRetries(), false);
  markBrowserStorageFailure(error, { operation: "auth-state-listener" });
  assert.equal(shouldStopBrowserStorageRetries(), true);
  assert.equal(shouldStopBrowserStorageRetries(error), true);
});
