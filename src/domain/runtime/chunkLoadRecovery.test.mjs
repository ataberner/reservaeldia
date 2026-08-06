import test from "node:test";
import assert from "node:assert/strict";

import {
  isChunkLoadError,
  requestChunkLoadRecoveryReload,
} from "./chunkLoadRecovery.js";

function createBrowserHarness({ buildId = "build-a" } = {}) {
  const storage = new Map();
  let reloadCount = 0;

  return {
    browserWindow: {
      __NEXT_DATA__: {
        buildId,
      },
      sessionStorage: {
        getItem(key) {
          return storage.get(key) || null;
        },
        setItem(key, value) {
          storage.set(key, value);
        },
      },
      location: {
        reload() {
          reloadCount += 1;
        },
      },
    },
    getReloadCount() {
      return reloadCount;
    },
  };
}

test("recognizes the Next.js chunk failure emitted by a stale dashboard tab", () => {
  const error = new Error(
    "Loading chunk 264 failed.\n(error: https://reservaeldia.com.ar/_next/static/chunks/264.old.js)"
  );
  error.name = "ChunkLoadError";

  assert.equal(isChunkLoadError(error), true);
  assert.equal(isChunkLoadError(new Error("preview generation failed")), false);
});

test("explicit chunk recovery reloads at most once for the active build", () => {
  const harness = createBrowserHarness({
    buildId: "old-build",
  });

  assert.deepEqual(
    requestChunkLoadRecoveryReload({
      browserWindow: harness.browserWindow,
    }),
    {
      reloaded: true,
      reason: "reload-requested",
      buildId: "old-build",
    }
  );
  assert.equal(harness.getReloadCount(), 1);

  assert.deepEqual(
    requestChunkLoadRecoveryReload({
      browserWindow: harness.browserWindow,
    }),
    {
      reloaded: false,
      reason: "already-attempted",
      buildId: "old-build",
    }
  );
  assert.equal(harness.getReloadCount(), 1);
});
