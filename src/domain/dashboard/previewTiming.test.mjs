import test from "node:test";
import assert from "node:assert/strict";

import {
  cancelPreviewTimingSession,
  isPreviewTimingEnabled,
  isPreviewTimingSessionActive,
  markPreviewTimingSurfaceReady,
  recordPreviewTimingStage,
  setPreviewTimingExpectedSurfaces,
  startPreviewTimingSession,
} from "./previewTiming.js";

function withConsoleCapture(callback) {
  const originalInfo = console.info;
  const originalTable = console.table;
  const infoCalls = [];
  const tableCalls = [];
  console.info = (...args) => infoCalls.push(args);
  console.table = (...args) => tableCalls.push(args);

  try {
    callback({
      infoCalls,
      tableCalls,
    });
  } finally {
    console.info = originalInfo;
    console.table = originalTable;
  }
}

test("preview timing remains completely silent without ?previewTiming=1", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    location: {
      search: "",
    },
  };

  try {
    withConsoleCapture(({ infoCalls, tableCalls }) => {
      const sessionId = startPreviewTimingSession({
        sessionId: "disabled-session",
        targetId: "draft-1",
      });
      recordPreviewTimingStage(sessionId, {
        stage: "should-not-log",
        label: "No visible",
      });

      assert.equal(sessionId, "");
      assert.equal(infoCalls.length, 0);
      assert.equal(tableCalls.length, 0);
      assert.equal(isPreviewTimingEnabled(), false);
    });
  } finally {
    globalThis.window = previousWindow;
  }
});

test("one session groups shared stages and finalizes only after every visible mockup", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    location: {
      search: "?previewTiming=1",
    },
  };

  try {
    withConsoleCapture(({ infoCalls, tableCalls }) => {
      const sessionId = startPreviewTimingSession({
        sessionId: "session-two-mockups",
        previewType: "draft-authoritative",
        targetId: "draft-1",
      });
      setPreviewTimingExpectedSurfaces(sessionId, [
        "desktop-mockup",
        "mobile-mockup",
      ]);
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        2
      );
      recordPreviewTimingStage(sessionId, {
        stage: "backend-call",
        label: "Backend",
        durationMs: 120,
        source: "network",
      });
      recordPreviewTimingStage(sessionId, {
        stage: "backend-call",
        label: "Backend duplicado",
        durationMs: 120,
        source: "network",
      });

      markPreviewTimingSurfaceReady(sessionId, {
        surface: "desktop-mockup",
        viewport: "desktop",
      });
      assert.equal(isPreviewTimingSessionActive(sessionId), true);
      assert.equal(tableCalls.length, 0);

      markPreviewTimingSurfaceReady(sessionId, {
        surface: "mobile-mockup",
        viewport: "mobile",
      });
      assert.equal(isPreviewTimingSessionActive(sessionId), false);
      assert.equal(tableCalls.length, 1);
      assert.equal(
        infoCalls.every((call) =>
          String(call[0]).includes(
            "[PREVIEW:TIMING][session=session-two-mockups]"
          )
        ),
        true
      );
      assert.equal(
        tableCalls[0][0].filter((row) => row.etapa === "Backend").length,
        1
      );
      assert.equal(
        tableCalls[0][0].find((row) => row.etapa === "Backend")
          .duracionMs,
        120
      );
      assert.equal(
        tableCalls[0][0].find((row) => row.etapa === "Backend")
          .acumuladoMs > 0,
        true
      );
      assert.equal(
        tableCalls[0][0].some(
          (row) => row.etapa === "Vista previa lista"
        ),
        true
      );
    });
  } finally {
    globalThis.window = previousWindow;
  }
});

test("cancelled sessions ignore late iframe readiness as a successful result", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    location: {
      search: "?previewTiming=1",
    },
  };

  try {
    withConsoleCapture(({ infoCalls, tableCalls }) => {
      const sessionId = startPreviewTimingSession({
        sessionId: "cancelled-session",
        targetId: "draft-2",
      });
      setPreviewTimingExpectedSurfaces(sessionId, ["desktop-mockup"]);
      cancelPreviewTimingSession(sessionId, {
        reason: "modal-closed",
        label: "Vista previa cerrada",
      });
      markPreviewTimingSurfaceReady(sessionId, {
        surface: "desktop-mockup",
        viewport: "desktop",
      });

      assert.equal(tableCalls.length, 1);
      assert.equal(
        infoCalls.some((call) =>
          String(call[0]).includes("Vista previa lista")
        ),
        false
      );
      assert.equal(
        tableCalls[0][0].at(-1).etapa,
        "Vista previa cerrada"
      );
    });
  } finally {
    globalThis.window = previousWindow;
  }
});

test("an error and retry produce separate sessions without reviving the failed one", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    location: {
      search: "?previewTiming=1",
    },
  };

  try {
    withConsoleCapture(({ infoCalls, tableCalls }) => {
      const failedSessionId = startPreviewTimingSession({
        sessionId: "failed-attempt",
        targetId: "draft-3",
        attempt: 1,
      });
      cancelPreviewTimingSession(failedSessionId, {
        reason: "backend-unavailable",
        status: "error",
        label: "Error de vista previa",
      });

      const retrySessionId = startPreviewTimingSession({
        sessionId: "retry-attempt",
        targetId: "draft-3",
        attempt: 2,
      });
      setPreviewTimingExpectedSurfaces(retrySessionId, ["desktop-mockup"]);
      markPreviewTimingSurfaceReady(retrySessionId, {
        surface: "desktop-mockup",
        viewport: "desktop",
      });
      markPreviewTimingSurfaceReady(failedSessionId, {
        surface: "desktop-mockup",
        viewport: "desktop",
      });

      assert.equal(tableCalls.length, 2);
      assert.equal(
        infoCalls.some(
          (call) =>
            String(call[0]).includes("session=retry-attempt") &&
            String(call[0]).includes("Inicio apertura (reintento)")
        ),
        true
      );
      assert.equal(
        infoCalls.some(
          (call) =>
            String(call[0]).includes("session=failed-attempt") &&
            String(call[0]).includes("Vista previa lista")
        ),
        false
      );
    });
  } finally {
    globalThis.window = previousWindow;
  }
});
