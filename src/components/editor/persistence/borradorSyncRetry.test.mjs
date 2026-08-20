import test from "node:test";
import assert from "node:assert/strict";

import { isRetryableTemplatePersistError } from "./borradorSyncRetry.js";

test("template persistence retries only transient callable failures", () => {
  assert.equal(
    isRetryableTemplatePersistError({ code: "functions/internal" }),
    true
  );
  assert.equal(isRetryableTemplatePersistError({ code: "unavailable" }), true);
  assert.equal(
    isRetryableTemplatePersistError({ code: "functions/deadline-exceeded" }),
    true
  );
  assert.equal(
    isRetryableTemplatePersistError({ code: "functions/permission-denied" }),
    false
  );
  assert.equal(isRetryableTemplatePersistError(new Error("internal")), false);
});
