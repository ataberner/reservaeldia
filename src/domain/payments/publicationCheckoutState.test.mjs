import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCheckoutModalContextKey,
  isPublishedCheckoutStatus,
  isRetryablePreSuccessCheckoutStatus,
  resolveCheckoutModalInitialization,
  resolveTerminalPublicationResult,
} from "./publicationCheckoutState.js";

test("checkout modal initialization ignores parent public URL sync for the same checkout context", () => {
  const contextKey = buildCheckoutModalContextKey({
    draftSlug: "draft-1",
    operation: "new",
  });

  const afterPublishedParentSync = resolveCheckoutModalInitialization({
    visible: true,
    draftSlug: "draft-1",
    operation: "new",
    previousVisible: true,
    previousContextKey: contextKey,
  });

  assert.equal(afterPublishedParentSync.shouldInitialize, false);
  assert.deepEqual(afterPublishedParentSync.nextTracker, {
    visible: true,
    contextKey,
  });
});

test("checkout modal initialization resets on a true open or checkout context change", () => {
  assert.equal(
    resolveCheckoutModalInitialization({
      visible: true,
      draftSlug: "draft-1",
      operation: "new",
      previousVisible: false,
      previousContextKey: "",
    }).shouldInitialize,
    true
  );

  assert.equal(
    resolveCheckoutModalInitialization({
      visible: true,
      draftSlug: "draft-1",
      operation: "update",
      previousVisible: true,
      previousContextKey: buildCheckoutModalContextKey({
        draftSlug: "draft-1",
        operation: "new",
      }),
    }).shouldInitialize,
    true
  );

  assert.deepEqual(
    resolveCheckoutModalInitialization({
      visible: false,
      draftSlug: "draft-1",
      operation: "new",
      previousVisible: true,
      previousContextKey: buildCheckoutModalContextKey({
        draftSlug: "draft-1",
        operation: "new",
      }),
    }),
    {
      shouldInitialize: false,
      nextTracker: {
        visible: false,
        contextKey: "",
      },
    }
  );
});

test("terminal publication result prefers the backend public URL and preserves receipt metadata", () => {
  const result = resolveTerminalPublicationResult({
    publicUrl: "https://reservaeldia.com.ar/i/final-slug",
    receiptData: {
      operation: "new",
      paymentId: "12345",
      publicUrl: "https://reservaeldia.com.ar/i/receipt-slug",
      publicSlug: "receipt-slug",
    },
  });

  assert.equal(result.publicUrl, "https://reservaeldia.com.ar/i/final-slug");
  assert.equal(result.publicSlug, "final-slug");
  assert.deepEqual(result.receipt, {
    operation: "new",
    paymentId: "12345",
    publicUrl: "https://reservaeldia.com.ar/i/final-slug",
    publicSlug: "final-slug",
  });
});

test("terminal publication result can expose the final URL from the backend receipt", () => {
  const result = resolveTerminalPublicationResult({
    receiptData: {
      operation: "update",
      publicUrl: "https://reservaeldia.com.ar/i/from-receipt",
      publicSlug: "from-receipt",
    },
  });

  assert.equal(result.publicUrl, "https://reservaeldia.com.ar/i/from-receipt");
  assert.equal(result.publicSlug, "from-receipt");
  assert.deepEqual(result.receipt, {
    operation: "update",
    publicUrl: "https://reservaeldia.com.ar/i/from-receipt",
    publicSlug: "from-receipt",
  });
});

test("checkout status helpers only treat published as terminal success", () => {
  assert.equal(isPublishedCheckoutStatus("published"), true);

  ["payment_processing", "payment_approved", "payment_rejected", "expired"].forEach(
    (status) => {
      assert.equal(isPublishedCheckoutStatus(status), false);
      assert.equal(isRetryablePreSuccessCheckoutStatus(status), true);
    }
  );
});
