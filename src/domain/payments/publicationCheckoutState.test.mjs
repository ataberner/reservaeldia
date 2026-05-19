import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCheckoutModalContextKey,
  isProcessingCheckoutStatus,
  isPublishedCheckoutStatus,
  isRecoverableCheckoutStatus,
  isTerminalCheckoutFailureStatus,
  resolveCheckoutStatusFlowState,
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

test("checkout status helpers classify lifecycle states by explicit role", () => {
  assert.equal(isPublishedCheckoutStatus("published"), true);

  ["payment_processing", "payment_approved", "publishing"].forEach((status) => {
    assert.equal(isPublishedCheckoutStatus(status), false);
    assert.equal(isProcessingCheckoutStatus(status), true);
    assert.equal(isTerminalCheckoutFailureStatus(status), false);
    assert.equal(isRecoverableCheckoutStatus(status), false);
  });

  ["payment_rejected", "expired"].forEach((status) => {
    assert.equal(isPublishedCheckoutStatus(status), false);
    assert.equal(isProcessingCheckoutStatus(status), false);
    assert.equal(isTerminalCheckoutFailureStatus(status), true);
    assert.equal(isRecoverableCheckoutStatus(status), false);
  });

  assert.equal(isPublishedCheckoutStatus("approved_slug_conflict"), false);
  assert.equal(isProcessingCheckoutStatus("approved_slug_conflict"), false);
  assert.equal(isTerminalCheckoutFailureStatus("approved_slug_conflict"), false);
  assert.equal(isRecoverableCheckoutStatus("approved_slug_conflict"), true);
});

test("publishing stays in progress and published still needs a final backend URL", () => {
  assert.equal(isPublishedCheckoutStatus("publishing"), false);
  assert.equal(isProcessingCheckoutStatus("publishing"), true);

  assert.deepEqual(resolveCheckoutStatusFlowState("publishing"), {
    status: "publishing",
    isProcessing: true,
    isRecoverable: false,
    isTerminalSuccess: false,
    isTerminalFailure: false,
    shouldContinuePolling: true,
    shouldClearPolling: false,
  });

  const missingUrlResult = resolveTerminalPublicationResult({
    publicUrl: "",
    receiptData: {
      operation: "new",
      paymentId: "pay-1",
    },
  });

  assert.deepEqual(missingUrlResult, {
    publicUrl: "",
    publicSlug: "",
    receipt: null,
  });
});

test("terminal and recoverable checkout flow states stop polling without reporting success", () => {
  assert.deepEqual(resolveCheckoutStatusFlowState("payment_rejected"), {
    status: "payment_rejected",
    isProcessing: false,
    isRecoverable: false,
    isTerminalSuccess: false,
    isTerminalFailure: true,
    shouldContinuePolling: false,
    shouldClearPolling: true,
  });

  assert.deepEqual(resolveCheckoutStatusFlowState("expired"), {
    status: "expired",
    isProcessing: false,
    isRecoverable: false,
    isTerminalSuccess: false,
    isTerminalFailure: true,
    shouldContinuePolling: false,
    shouldClearPolling: true,
  });

  assert.deepEqual(resolveCheckoutStatusFlowState("approved_slug_conflict"), {
    status: "approved_slug_conflict",
    isProcessing: false,
    isRecoverable: true,
    isTerminalSuccess: false,
    isTerminalFailure: false,
    shouldContinuePolling: false,
    shouldClearPolling: true,
  });
});
