import test from "node:test";
import assert from "node:assert/strict";
import {
  __resetEditorIssueReporterForTests,
  captureEditorIssue,
  installGlobalEditorIssueHandlers,
  runWithEditorIssueReporterSuppressed,
} from "./editorIssueReporter.js";
import { resetBrowserStorageRecoveryForTests } from "../storage/browserStorageRecovery.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => {
      values.set(key, String(value));
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

function installFakeWindow() {
  const listeners = new Map();
  const dispatched = [];
  const previousWindow = global.window;
  const previousCustomEvent = global.CustomEvent;

  global.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };

  global.window = {
    location: {
      href: "https://reservaeldia.com.ar/dashboard/?slug=amelia",
      pathname: "/dashboard/",
      search: "?slug=amelia",
    },
    navigator: {
      userAgent: "Safari iPhone",
      language: "es-419",
      platform: "iPhone",
    },
    performance: {},
    innerWidth: 390,
    innerHeight: 699,
    devicePixelRatio: 3,
    localStorage: createMemoryStorage(),
    sessionStorage: createMemoryStorage(),
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    dispatchEvent(event) {
      dispatched.push(event);
      listeners.get(event.type)?.forEach((handler) => handler(event));
      return true;
    },
  };

  return {
    dispatched,
    listeners,
    emit(type, event) {
      listeners.get(type)?.forEach((handler) => handler(event));
    },
    teardown() {
      global.window = previousWindow;
      global.CustomEvent = previousCustomEvent;
    },
  };
}

test("deduplicates the same captured issue inside the reporting window", () => {
  __resetEditorIssueReporterForTests();
  resetBrowserStorageRecoveryForTests();
  const env = installFakeWindow();

  try {
    const first = captureEditorIssue({
      source: "window.unhandledrejection",
      error: new Error("same failure"),
      detail: {},
      severity: "fatal",
    });
    const second = captureEditorIssue({
      source: "window.unhandledrejection",
      error: new Error("same failure"),
      detail: {},
      severity: "fatal",
    });
    const capturedEvents = env.dispatched.filter(
      (event) => event.type === "editor-issue-captured"
    );

    assert.equal(first.fingerprint, second.fingerprint);
    assert.equal(second.repetitions, 2);
    assert.equal(capturedEvents.length, 1);
  } finally {
    env.teardown();
    __resetEditorIssueReporterForTests();
  }
});

test("global handlers are installed once per window and removed after all teardowns", () => {
  __resetEditorIssueReporterForTests();
  const env = installFakeWindow();

  try {
    const teardownFirst = installGlobalEditorIssueHandlers();
    const teardownSecond = installGlobalEditorIssueHandlers();

    assert.equal(env.listeners.get("error")?.size, 1);
    assert.equal(env.listeners.get("unhandledrejection")?.size, 1);

    teardownFirst();
    assert.equal(env.listeners.get("unhandledrejection")?.size, 1);

    teardownSecond();
    assert.equal(env.listeners.get("unhandledrejection")?.size, 0);
  } finally {
    env.teardown();
    __resetEditorIssueReporterForTests();
  }
});

test("global IndexedDB rejections are recoverable, contextual and prevented", () => {
  __resetEditorIssueReporterForTests();
  resetBrowserStorageRecoveryForTests();
  const env = installFakeWindow();
  const teardown = installGlobalEditorIssueHandlers();
  let prevented = false;

  try {
    env.emit("unhandledrejection", {
      reason: new DOMException(
        "Connection to Indexed Database server lost. Refresh the page to try again",
        "UnknownError"
      ),
      preventDefault: () => {
        prevented = true;
      },
    });

    const captured = env.dispatched.find(
      (event) => event.type === "editor-issue-captured"
    )?.detail;
    const detail = JSON.parse(captured.detail);

    assert.equal(prevented, true);
    assert.equal(captured.severity, "recoverable");
    assert.equal(captured.slug, "amelia");
    assert.equal(detail.operation, "global-unhandledrejection");
    assert.equal(detail.storage.kind, "indexeddb");
  } finally {
    teardown();
    env.teardown();
    __resetEditorIssueReporterForTests();
  }
});

test("reporter failures are not captured recursively", async () => {
  __resetEditorIssueReporterForTests();
  const env = installFakeWindow();
  const teardown = installGlobalEditorIssueHandlers();
  let prevented = false;

  try {
    await runWithEditorIssueReporterSuppressed(async () => {
      env.emit("unhandledrejection", {
        reason: new Error("reportClientIssue failed"),
        preventDefault: () => {
          prevented = true;
        },
      });
    });

    const capturedEvents = env.dispatched.filter(
      (event) => event.type === "editor-issue-captured"
    );
    assert.equal(prevented, true);
    assert.equal(capturedEvents.length, 0);
  } finally {
    teardown();
    env.teardown();
    __resetEditorIssueReporterForTests();
  }
});
