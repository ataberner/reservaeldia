import test from "node:test";
import assert from "node:assert/strict";

import {
  ensureInlineSessionSettledBeforeCriticalAction,
  resolveActiveInlineSessionId,
} from "./inlineCriticalBoundary.js";

test("resolveActiveInlineSessionId prefers live editing, then window, then mounted overlay", () => {
  assert.equal(
    resolveActiveInlineSessionId({
      editingId: "text-editing",
      currentInlineEditingId: "text-window",
      inlineOverlayMountedId: "text-overlay-mounted",
      inlineOverlayMountSession: {
        mounted: true,
        id: "text-overlay-session",
      },
    }),
    "text-editing"
  );

  assert.equal(
    resolveActiveInlineSessionId({
      editingId: null,
      currentInlineEditingId: "text-window",
      inlineOverlayMountedId: "text-overlay-mounted",
      inlineOverlayMountSession: {
        mounted: true,
        id: "text-overlay-session",
      },
    }),
    "text-window"
  );

  assert.equal(
    resolveActiveInlineSessionId({
      editingId: null,
      currentInlineEditingId: null,
      inlineOverlayMountedId: "text-overlay-mounted",
      inlineOverlayMountSession: {
        mounted: true,
        id: "text-overlay-session",
      },
    }),
    "text-overlay-session"
  );

  assert.equal(
    resolveActiveInlineSessionId({
      editingId: null,
      currentInlineEditingId: null,
      inlineOverlayMountedId: "text-overlay-mounted",
      inlineOverlayMountSession: {
        mounted: false,
        id: "text-overlay-session",
      },
    }),
    "text-overlay-mounted"
  );
});

test("ensureInlineSessionSettledBeforeCriticalAction requests finish and waits until inline clears", async () => {
  let currentState = {
    editingId: "text-1",
    currentInlineEditingId: "text-1",
    inlineOverlayMountedId: "text-1",
    inlineOverlayMountSession: {
      mounted: true,
      id: "text-1",
    },
  };
  let nowMs = 0;

  const result = await ensureInlineSessionSettledBeforeCriticalAction({
    getState: () => currentState,
    requestInlineEditFinish: (reason) => {
      assert.equal(reason, "preview-before-open");
      currentState = {
        editingId: null,
        currentInlineEditingId: "text-1",
        inlineOverlayMountedId: "text-1",
        inlineOverlayMountSession: {
          mounted: true,
          id: "text-1",
        },
      };
      return true;
    },
    reason: "preview-before-open",
    maxWaitMs: 120,
    getNow: () => nowMs,
    waitFrame: (callback) => {
      nowMs += 16;
      currentState = {
        editingId: null,
        currentInlineEditingId: null,
        inlineOverlayMountedId: null,
        inlineOverlayMountSession: {
          mounted: false,
          id: null,
        },
      };
      callback();
    },
  });

  assert.deepEqual(result, {
    ok: true,
    settled: true,
    handled: true,
    activeId: "text-1",
    reason: "preview-before-open",
  });
});

test("ensureInlineSessionSettledBeforeCriticalAction fails closed when inline never settles", async () => {
  let nowMs = 0;
  const currentState = {
    editingId: null,
    currentInlineEditingId: "text-stuck",
    inlineOverlayMountedId: "text-stuck",
    inlineOverlayMountSession: {
      mounted: true,
      id: "text-stuck",
    },
  };

  const result = await ensureInlineSessionSettledBeforeCriticalAction({
    getState: () => currentState,
    reason: "checkout-before-open",
    maxWaitMs: 120,
    getNow: () => nowMs,
    waitFrame: (callback) => {
      nowMs += 60;
      callback();
    },
  });

  assert.deepEqual(result, {
    ok: false,
    settled: false,
    handled: false,
    activeId: "text-stuck",
    reason: "inline-session-still-active",
    actionReason: "checkout-before-open",
    error: "No se pudo cerrar la edicion de texto en curso. Intenta nuevamente.",
  });
});
