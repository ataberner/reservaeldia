import test from "node:test";
import assert from "node:assert/strict";

import {
  attachInlineCaretScrollDebugWindowHelpers,
  resolveInlineCaretScrollDebugState,
  setInlineCaretScrollDebugEnabled,
} from "./inlineCaretScrollDebug.js";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function createFakeWindow() {
  return {
    sessionStorage: createStorage(),
    localStorage: createStorage(),
  };
}

test("resolveInlineCaretScrollDebugState prefers explicit window flag", () => {
  const fakeWindow = createFakeWindow();
  fakeWindow.__INLINE_CARET_SCROLL_DEBUG = true;
  fakeWindow.sessionStorage.setItem("debug:inline-caret-scroll", "0");
  fakeWindow.localStorage.setItem("debug:inline-caret-scroll:persist", "0");

  assert.deepEqual(resolveInlineCaretScrollDebugState(fakeWindow), {
    enabled: true,
    source: "window",
    rawValue: true,
  });
});

test("resolveInlineCaretScrollDebugState falls back to session storage", () => {
  const fakeWindow = createFakeWindow();
  fakeWindow.sessionStorage.setItem("debug:inline-caret-scroll", "1");

  assert.deepEqual(resolveInlineCaretScrollDebugState(fakeWindow), {
    enabled: true,
    source: "sessionStorage",
    rawValue: "1",
  });
});

test("setInlineCaretScrollDebugEnabled enables debug with persistent session state", () => {
  const fakeWindow = createFakeWindow();
  attachInlineCaretScrollDebugWindowHelpers(fakeWindow);

  const state = setInlineCaretScrollDebugEnabled(true, {
    targetWindow: fakeWindow,
    persist: "session",
    resetTrace: true,
  });

  assert.deepEqual(state, {
    enabled: true,
    source: "window",
    rawValue: true,
  });
  assert.equal(fakeWindow.__INLINE_CARET_SCROLL_DEBUG, true);
  assert.equal(
    fakeWindow.sessionStorage.getItem("debug:inline-caret-scroll"),
    "1"
  );
  assert.deepEqual(fakeWindow.__INLINE_CARET_SCROLL_EVENTS, []);
  assert.equal(fakeWindow.__INLINE_CARET_SCROLL_LAST_EVENT, null);
  assert.equal(typeof fakeWindow.__ENABLE_INLINE_CARET_SCROLL_DEBUG, "function");
  assert.equal(typeof fakeWindow.__GET_INLINE_CARET_SCROLL_DEBUG_STATE, "function");
});

test("setInlineCaretScrollDebugEnabled can disable debug and clear persisted state", () => {
  const fakeWindow = createFakeWindow();
  fakeWindow.sessionStorage.setItem("debug:inline-caret-scroll", "1");

  const state = setInlineCaretScrollDebugEnabled(false, {
    targetWindow: fakeWindow,
    persist: "none",
    clearTrace: true,
  });

  assert.deepEqual(state, {
    enabled: false,
    source: "window",
    rawValue: false,
  });
  assert.equal(fakeWindow.__INLINE_CARET_SCROLL_DEBUG, false);
  assert.equal(
    fakeWindow.sessionStorage.getItem("debug:inline-caret-scroll"),
    null
  );
  assert.deepEqual(fakeWindow.__INLINE_CARET_SCROLL_EVENTS, []);
  assert.equal(fakeWindow.__INLINE_CARET_SCROLL_LAST_EVENT, null);
});
