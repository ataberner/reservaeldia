import test from "node:test";
import assert from "node:assert/strict";

import { flushEditorPersistenceBeforeCriticalAction } from "./criticalFlush.js";
import { createEditorDraftFlushRequester, DRAFT_FLUSH_REQUEST_EVENT, DRAFT_FLUSH_RESULT_EVENT } from "./flushGate.js";

test("critical flush uses the direct bridge for template sessions and captures the boundary snapshot", async () => {
  let directFlushPayload = null;
  const result = await flushEditorPersistenceBeforeCriticalAction({
    slug: "template-hero",
    reason: "preview-before-open",
    editorMode: "konva",
    editorSession: {
      kind: "template",
      id: "template-hero",
    },
    directFlush: async (payload) => {
      directFlushPayload = payload;
      return { ok: true, reason: "direct-flush" };
    },
    requestFlush: async () => {
      throw new Error("template flush should not use the event requester");
    },
    captureSnapshot: () => ({
      objetos: [{ id: "hero-title" }],
      secciones: [{ id: "section-1", orden: 1 }],
      rsvp: null,
      gifts: null,
    }),
  });

  assert.deepEqual(directFlushPayload, {
    reason: "preview-before-open",
  });
  assert.equal(result.ok, true);
  assert.equal(result.transport, "direct-bridge");
  assert.deepEqual(result.compatibilitySnapshot, {
    objetos: [{ id: "hero-title" }],
    secciones: [{ id: "section-1", orden: 1 }],
    rsvp: null,
    gifts: null,
  });
});

test("critical flush uses the event requester for draft sessions", async () => {
  let requestPayload = null;
  const result = await flushEditorPersistenceBeforeCriticalAction({
    slug: " draft-live ",
    reason: "checkout-before-open",
    editorMode: "konva",
    editorSession: {
      kind: "draft",
      id: "draft-live",
    },
    requestFlush: async (payload) => {
      requestPayload = payload;
      return { ok: true, reason: "request-flush" };
    },
  });

  assert.deepEqual(requestPayload, {
    slug: "draft-live",
    reason: "checkout-before-open",
    timeoutMs: 90000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.transport, "window-event");
});

test("critical flush returns a contextual error message when confirmation fails", async () => {
  const result = await flushEditorPersistenceBeforeCriticalAction({
    slug: "draft-broken",
    reason: "preview-before-open",
    editorMode: "konva",
    editorSession: {
      kind: "draft",
      id: "draft-broken",
    },
    requestFlush: async () => ({
      ok: false,
      reason: "timeout",
      error: "No se recibio confirmacion",
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.transport, "window-event");
  assert.equal(
    result.error,
    "No se pudo confirmar el guardado reciente de el borrador (No se recibio confirmacion). Intenta nuevamente."
  );
});

test("a slow music save stays pending beyond six seconds and captures only after confirmation", async () => {
  const eventTarget = new EventTarget();
  let now = 0;
  let request;
  let captured = false;
  let settled = false;
  const timers = new Map();
  let nextTimer = 0;
  const requestFlush = createEditorDraftFlushRequester({
    eventTarget,
    setTimer(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimer(id) { timers.delete(id); },
  });
  eventTarget.addEventListener(DRAFT_FLUSH_REQUEST_EVENT, event => { request = event.detail; });
  const pending = flushEditorPersistenceBeforeCriticalAction({
    slug: "draft-music", reason: "preview-before-open", editorMode: "konva", requestFlush,
    captureSnapshot() { captured = true; return { music: { enabled: true } }; },
  }).then(result => { settled = true; return result; });
  now = 8000;
  for (const timer of timers.values()) if (timer.at <= now) timer.fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, "a pending server write must not become a six-second error");
  assert.equal(captured, false);
  eventTarget.dispatchEvent(new CustomEvent(DRAFT_FLUSH_RESULT_EVENT, {
    detail: { ...request, ok: true },
  }));
  assert.equal((await pending).ok, true);
  assert.equal(captured, true);
  assert.equal(timers.size, 0);
});

test("an unconfirmed critical save still fails at the bounded deadline without a snapshot", async () => {
  let expire;
  const requestFlush = createEditorDraftFlushRequester({
    eventTarget: new EventTarget(), setTimer(fn) { expire = fn; return 1; }, clearTimer() {},
  });
  const pending = flushEditorPersistenceBeforeCriticalAction({
    slug: "draft-music", reason: "preview-before-open", editorMode: "konva", requestFlush,
    captureSnapshot() { assert.fail("must not trust an unsaved snapshot"); },
  });
  expire();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.reason, "timeout");
});
