import test from "node:test";
import assert from "node:assert/strict";

import {
  clearPendingLandingTemplateSelection,
  consumePendingLandingTemplateSelection,
  savePendingLandingTemplateSelection,
} from "./pendingLandingTemplateSelection.js";

const MAX_AGE_MS = 30 * 60 * 1000;

function createStorage() {
  const entries = new Map();

  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
    removeItem(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
  };
}

function installWindow() {
  const previousWindow = globalThis.window;
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const sessionStorage = createStorage();
  const localStorage = createStorage();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage,
      localStorage,
    },
  });

  return {
    sessionStorage,
    localStorage,
    restore() {
      if (hadWindow) {
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: previousWindow,
        });
      } else {
        delete globalThis.window;
      }
    },
  };
}

function withMockedNow(now, callback) {
  const originalNow = Date.now;
  Date.now = () => now;

  try {
    return callback();
  } finally {
    Date.now = originalNow;
  }
}

test("saves and consumes a pending landing template selection once", () => {
  const windowHarness = installWindow();

  try {
    const saved = withMockedNow(1000, () =>
      savePendingLandingTemplateSelection({ id: " tpl-landing " })
    );

    assert.deepEqual(saved, {
      templateId: "tpl-landing",
      createdAt: 1000,
    });

    const consumed = withMockedNow(1500, () =>
      consumePendingLandingTemplateSelection()
    );

    assert.deepEqual(consumed, {
      templateId: "tpl-landing",
      createdAt: 1000,
    });
    assert.equal(consumePendingLandingTemplateSelection(), null);
  } finally {
    windowHarness.restore();
  }
});

test("falls back to the local mirror when session storage is lost", () => {
  const windowHarness = installWindow();

  try {
    withMockedNow(2000, () => savePendingLandingTemplateSelection("tpl-local"));
    windowHarness.sessionStorage.clear();

    assert.deepEqual(
      withMockedNow(2500, () => consumePendingLandingTemplateSelection()),
      {
        templateId: "tpl-local",
        createdAt: 2000,
      }
    );
  } finally {
    windowHarness.restore();
  }
});

test("drops expired or cleared pending landing template selections", () => {
  const windowHarness = installWindow();

  try {
    withMockedNow(3000, () =>
      savePendingLandingTemplateSelection("tpl-expired")
    );

    assert.equal(
      withMockedNow(3000 + MAX_AGE_MS + 1, () =>
        consumePendingLandingTemplateSelection()
      ),
      null
    );

    withMockedNow(4000, () => savePendingLandingTemplateSelection("tpl-clear"));
    clearPendingLandingTemplateSelection();
    assert.equal(consumePendingLandingTemplateSelection(), null);
  } finally {
    windowHarness.restore();
  }
});
