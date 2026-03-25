import test from "node:test";
import assert from "node:assert/strict";

import { flushEditorPersistenceBeforeCriticalAction } from "./criticalFlush.js";

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
    timeoutMs: 6000,
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
