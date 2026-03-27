import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveDashboardPreviewPublishAction,
  runDashboardPreviewPublishValidation,
  scheduleDashboardPreviewPublishedAuditCapture,
} from "./previewPublicationActions.js";

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test("preview publish validation returns null without calling the service when compatibility is disabled", async () => {
  let serviceCalls = 0;

  const result = await runDashboardPreviewPublishValidation({
    draftSlug: "draft-preview-1",
    canUsePublishCompatibility: false,
    validateDraftForPublication: async () => {
      serviceCalls += 1;
      return { ok: true };
    },
  });

  assert.equal(result, null);
  assert.equal(serviceCalls, 0);
});

test("preview publish validation returns null without calling the service when the draft slug is invalid", async () => {
  let serviceCalls = 0;

  const result = await runDashboardPreviewPublishValidation({
    draftSlug: "   ",
    canUsePublishCompatibility: true,
    validateDraftForPublication: async () => {
      serviceCalls += 1;
      return { ok: true };
    },
  });

  assert.equal(result, null);
  assert.equal(serviceCalls, 0);
});

test("preview publish validation forwards the sanitized draft slug", async () => {
  const receivedDraftSlugs = [];

  const result = await runDashboardPreviewPublishValidation({
    draftSlug: "  draft-preview-1  ",
    canUsePublishCompatibility: true,
    validateDraftForPublication: async ({ draftSlug }) => {
      receivedDraftSlugs.push(draftSlug);
      return {
        blockers: [],
        summary: {
          blockingMessage: "",
        },
      };
    },
  });

  assert.deepEqual(receivedDraftSlugs, ["draft-preview-1"]);
  assert.deepEqual(result, {
    blockers: [],
    summary: {
      blockingMessage: "",
    },
  });
});

test("preview publish action returns blocked with the current summary blocking message", () => {
  const result = resolveDashboardPreviewPublishAction({
    validationResult: {
      blockers: [{ code: "render-contract-blocked" }],
      summary: {
        blockingMessage: "Bloqueado por contrato",
      },
    },
  });

  assert.deepEqual(result, {
    status: "blocked",
    blockingMessage: "Bloqueado por contrato",
  });
});

test("preview publish action returns blocked with the fallback blocking message when summary copy is missing", () => {
  const result = resolveDashboardPreviewPublishAction({
    validationResult: {
      blockers: [{ code: "render-contract-blocked" }],
      summary: {},
    },
  });

  assert.deepEqual(result, {
    status: "blocked",
    blockingMessage:
      "Hay contratos de render que todavia no son seguros para publicar.",
  });
});

test("preview publish action returns ready when there are no blockers", () => {
  assert.deepEqual(
    resolveDashboardPreviewPublishAction({
      validationResult: {
        blockers: [],
      },
    }),
    {
      status: "ready",
    }
  );
});

test("published audit capture uses the current HTML-string audit path when fallback html exists", async () => {
  const htmlAuditCalls = [];

  scheduleDashboardPreviewPublishedAuditCapture({
    fallbackHtml: "<html><body>preview</body></html>",
    windowObject: null,
    loadCountdownAuditRuntimeModule: async () => ({
      captureCountdownAuditFromHtmlString: async (html, options) => {
        htmlAuditCalls.push({ html, options });
      },
      captureCountdownAuditPublicationHtml: async () => {},
    }),
  });

  await flushMicrotasks();

  assert.deepEqual(htmlAuditCalls, [
    {
      html: "<html><body>preview</body></html>",
      options: {
        stage: "published-html",
        renderer: "dom-generated",
        sourceDocument: "publish-preview-html",
        viewport: "public",
        wrapperScale: 1,
        usesRasterThumbnail: false,
      },
    },
  ]);
});

test("published audit capture schedules the current delayed publication checks", () => {
  const scheduledDelays = [];

  scheduleDashboardPreviewPublishedAuditCapture({
    publicUrl: "https://reservaeldia.com.ar/i/publico-ok",
    windowObject: {
      setTimeout: () => {},
    },
    scheduleTimeout: (_callback, delayMs) => {
      scheduledDelays.push(delayMs);
    },
    loadCountdownAuditRuntimeModule: async () => ({
      captureCountdownAuditFromHtmlString: async () => {},
      captureCountdownAuditPublicationHtml: async () => {},
    }),
  });

  assert.deepEqual(scheduledDelays, [900, 2200, 5000]);
});

test("published audit capture skips delayed publication checks when there is no browser window or no public url", () => {
  const scheduledDelays = [];

  scheduleDashboardPreviewPublishedAuditCapture({
    publicUrl: "",
    windowObject: {
      setTimeout: () => {},
    },
    scheduleTimeout: (_callback, delayMs) => {
      scheduledDelays.push(delayMs);
    },
  });
  scheduleDashboardPreviewPublishedAuditCapture({
    publicUrl: "https://reservaeldia.com.ar/i/publico-ok",
    windowObject: null,
    scheduleTimeout: (_callback, delayMs) => {
      scheduledDelays.push(delayMs);
    },
  });

  assert.deepEqual(scheduledDelays, []);
});

test("published audit capture swallows runtime errors from both html and delayed publication audits", async () => {
  const scheduledCallbacks = [];

  scheduleDashboardPreviewPublishedAuditCapture({
    publicUrl: "https://reservaeldia.com.ar/i/publico-ok",
    fallbackHtml: "<html><body>preview</body></html>",
    windowObject: {
      setTimeout: () => {},
    },
    scheduleTimeout: (callback) => {
      scheduledCallbacks.push(callback);
    },
    loadCountdownAuditRuntimeModule: async () => ({
      captureCountdownAuditFromHtmlString: async () => {
        throw new Error("html-audit-error");
      },
      captureCountdownAuditPublicationHtml: async () => {
        throw new Error("publication-audit-error");
      },
    }),
  });

  scheduledCallbacks.forEach((callback) => {
    callback();
  });
  await flushMicrotasks();

  assert.equal(scheduledCallbacks.length, 3);
});
