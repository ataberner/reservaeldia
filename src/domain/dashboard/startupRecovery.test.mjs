import test from "node:test";
import assert from "node:assert/strict";
import { runDashboardStartupOperation } from "./startupRecovery.js";
import { resetBrowserStorageRecoveryForTests } from "../../lib/storage/browserStorageRecovery.js";

function waitForUnhandledTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("rejected startup promises are captured and do not reach unhandledRejection", async () => {
  resetBrowserStorageRecoveryForTests();
  const error = new DOMException(
    "Connection to Indexed Database server lost. Refresh the page to try again",
    "UnknownError"
  );
  const captured = [];
  let unhandled = null;
  const onUnhandled = (reason) => {
    unhandled = reason;
  };

  process.once("unhandledRejection", onUnhandled);
  const result = await runDashboardStartupOperation({
    task: async () => {
      throw error;
    },
    operation: "sync-editor-slug-from-query",
    module: "useDashboardEditorRoute",
    phase: "route-sync",
    slug: "amelia",
    captureIssue: (payload) => {
      captured.push(payload);
      return { id: "issue-1" };
    },
  });
  await waitForUnhandledTurn();
  process.removeListener("unhandledRejection", onUnhandled);

  assert.equal(result.ok, false);
  assert.equal(result.isRecoverableStorageError, true);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].severity, "recoverable");
  assert.equal(unhandled, null);
});

test("successful startup operations keep the normal dashboard flow", async () => {
  const result = await runDashboardStartupOperation({
    task: async () => ({ slug: "amelia" }),
    operation: "sync-editor-slug-from-query",
    module: "useDashboardEditorRoute",
    phase: "route-sync",
    captureIssue: () => {
      throw new Error("should not capture successful startup");
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { slug: "amelia" });
});
