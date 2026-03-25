import test from "node:test";
import assert from "node:assert/strict";

import {
  DRAFT_FLUSH_REQUEST_EVENT,
  DRAFT_FLUSH_RESULT_EVENT,
  createEditorDraftFlushRequester,
} from "./flushGate.js";

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(eventName, listener) {
    const current = this.listeners.get(eventName) || new Set();
    current.add(listener);
    this.listeners.set(eventName, current);
  }

  removeEventListener(eventName, listener) {
    const current = this.listeners.get(eventName);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      this.listeners.delete(eventName);
    }
  }

  dispatchEvent(event) {
    const current = this.listeners.get(event?.type) || new Set();
    [...current].forEach((listener) => listener(event));
    return true;
  }
}

function createEvent(type, detail) {
  return { type, detail };
}

test("flush gate dispatches a request and resolves from the matching result", async () => {
  const eventTarget = new FakeEventTarget();
  const requester = createEditorDraftFlushRequester({
    eventTarget,
    createEvent,
    createRequestIdFn: () => "flush-1",
  });
  let requestDetail = null;

  eventTarget.addEventListener(DRAFT_FLUSH_REQUEST_EVENT, (event) => {
    requestDetail = event.detail;
    eventTarget.dispatchEvent(
      createEvent(DRAFT_FLUSH_RESULT_EVENT, {
        requestId: event.detail.requestId,
        slug: event.detail.slug,
        ok: true,
        reason: "saved-now",
      })
    );
  });

  const result = await requester({
    slug: " draft-a ",
    reason: "preview-before-open",
  });

  assert.deepEqual(requestDetail, {
    requestId: "flush-1",
    slug: "draft-a",
    reason: "preview-before-open",
  });
  assert.deepEqual(result, {
    ok: true,
    reason: "saved-now",
    error: undefined,
  });
});

test("flush gate ignores unrelated results and times out when confirmation never arrives", async () => {
  const eventTarget = new FakeEventTarget();
  const pendingTimeouts = [];
  const requester = createEditorDraftFlushRequester({
    eventTarget,
    createEvent,
    createRequestIdFn: () => "flush-timeout",
    setTimer: (fn) => {
      pendingTimeouts.push(fn);
      return pendingTimeouts.length;
    },
    clearTimer: () => {},
  });

  const requestPromise = requester({
    slug: "draft-timeout",
    reason: "checkout-before-open",
    timeoutMs: 2000,
  });

  eventTarget.dispatchEvent(
    createEvent(DRAFT_FLUSH_RESULT_EVENT, {
      requestId: "another-request",
      slug: "draft-timeout",
      ok: true,
      reason: "ignored",
    })
  );

  assert.equal(pendingTimeouts.length, 1);
  pendingTimeouts[0]();

  const result = await requestPromise;
  assert.deepEqual(result, {
    ok: false,
    reason: "timeout",
    error: "No se recibio confirmacion de guardado del editor a tiempo.",
  });
});
