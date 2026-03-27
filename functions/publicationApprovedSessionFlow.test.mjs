import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
const { HttpsError } = require("firebase-functions/v2/https");

const {
  finalizeApprovedSessionFlow,
  processMercadoPagoPaymentFlow,
} = requireBuiltModule("lib/payments/publicationApprovedSessionFlow.js");

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createSnapshot(data) {
  return {
    exists: data != null,
    data() {
      return clone(data) ?? undefined;
    },
  };
}

function createBaseSession(overrides = {}) {
  return {
    uid: "user-1",
    draftSlug: "draft-1",
    operation: "new",
    publicSlug: "mi-slug",
    amountBaseArs: 12000,
    amountArs: 12000,
    discountAmountArs: 0,
    discountCode: null,
    discountDescription: null,
    currency: "ARS",
    pricingSnapshot: {
      pricingVersion: 1,
      operationType: "new",
      appliedPrice: 12000,
      currency: "ARS",
    },
    status: "payment_approved",
    ...overrides,
  };
}

function createSessionRuntime(initialSessionData) {
  const state = {
    session: clone(initialSessionData),
    writes: [],
  };

  function mergeSession(payload) {
    state.session = {
      ...(state.session || {}),
      ...clone(payload),
    };
  }

  const sessionRef = {
    async get() {
      return createSnapshot(state.session);
    },
    async set(payload, options) {
      mergeSession(payload);
      state.writes.push({
        kind: "set",
        payload: clone(payload),
        options,
      });
    },
  };

  async function runTransaction(updateFn) {
    const tx = {
      async get(ref) {
        assert.equal(ref, sessionRef);
        return createSnapshot(state.session);
      },
      set(ref, payload, options) {
        assert.equal(ref, sessionRef);
        mergeSession(payload);
        state.writes.push({
          kind: "tx-set",
          payload: clone(payload),
          options,
        });
      },
    };

    return updateFn(tx);
  }

  return {
    state,
    sessionRef,
    runTransaction,
  };
}

function createSettlementHarness(initialSessionData, overrides = {}) {
  const runtime = createSessionRuntime(initialSessionData);
  const calls = {
    publish: [],
    reservationUpdates: [],
    discountUsage: [],
    analyticsEvents: [],
    analyticsDraftLoads: [],
    analyticsPublishedLoads: [],
    logs: [],
  };
  let updatedAtCounter = 0;

  const loadDraftData =
    overrides.loadDraftData ||
    (async (draftSlug) => {
      calls.analyticsDraftLoads.push(draftSlug);
      return {
        plantillaId: "tpl-draft",
        nombre: "Template Draft",
      };
    });

  const loadPublishedData =
    overrides.loadPublishedData ||
    (async (publicSlug) => {
      calls.analyticsPublishedLoads.push(publicSlug);
      return null;
    });

  return {
    runtime,
    calls,
    deps: {
      sessionRef: runtime.sessionRef,
      runTransaction: runtime.runTransaction,
      createUpdatedAtValue: () => `ts-${++updatedAtCounter}`,
      publishDraftToPublic:
        overrides.publishDraftToPublic ||
        (async (input) => {
          calls.publish.push(clone(input));
          return {
            publicSlug: input.publicSlug,
            publicUrl: `https://reservaeldia.com.ar/i/${input.publicSlug}`,
          };
        }),
      updateReservationStatus:
        overrides.updateReservationStatus ||
        (async (update) => {
          calls.reservationUpdates.push(clone(update));
        }),
      recordDiscountUsageIfNeeded:
        overrides.recordDiscountUsageIfNeeded ||
        (async (input) => {
          calls.discountUsage.push(clone(input));
        }),
      approvedPaymentAnalytics:
        Object.prototype.hasOwnProperty.call(overrides, "approvedPaymentAnalytics")
          ? overrides.approvedPaymentAnalytics
          : {
              unknownTemplateAnalyticsId: "unknown-template",
              loadDraftData,
              loadPublishedData,
              async recordEvent(input) {
                calls.analyticsEvents.push(clone(input));
              },
            },
      logError(message, context) {
        calls.logs.push({
          message,
          context: clone(context),
        });
      },
    },
  };
}

async function runApprovedPayment(harness, paymentId = "pay-1", approvedAt = "2026-03-27T12:00:00.000Z") {
  return processMercadoPagoPaymentFlow({
    sessionId: "session-1",
    paymentId,
    paymentStatus: "approved",
    paymentStatusDetail: "accredited",
    approvedAt,
    sessionRef: harness.runtime.sessionRef,
    createUpdatedAtValue: harness.deps.createUpdatedAtValue,
    finalizeApprovedSession: (input) =>
      finalizeApprovedSessionFlow({
        ...input,
        ...harness.deps,
      }),
  });
}

test("finalizeApprovedSessionFlow only publishes once across repeated settlement calls", async () => {
  const harness = createSettlementHarness(createBaseSession(), {
    approvedPaymentAnalytics: null,
  });

  const first = await finalizeApprovedSessionFlow({
    sessionId: "session-1",
    fallbackPaymentId: "pay-1",
    approvedAt: "2026-03-27T12:00:00.000Z",
    ...harness.deps,
  });
  const second = await finalizeApprovedSessionFlow({
    sessionId: "session-1",
    fallbackPaymentId: "pay-1",
    approvedAt: "2026-03-27T12:00:00.000Z",
    ...harness.deps,
  });

  assert.equal(first.sessionStatus, "published");
  assert.equal(second.sessionStatus, "published");
  assert.equal(harness.calls.publish.length, 1);
  assert.equal(harness.calls.reservationUpdates.length, 1);
  assert.equal(harness.runtime.state.session.status, "published");
  assert.equal(harness.runtime.state.session.publicUrl, "https://reservaeldia.com.ar/i/mi-slug");
});

test("finalizeApprovedSessionFlow short-circuits already published sessions without re-publishing", async () => {
  const harness = createSettlementHarness(
    createBaseSession({
      status: "published",
      publicUrl: "https://reservaeldia.com.ar/i/mi-slug",
      receipt: { ok: true },
    }),
    {
      approvedPaymentAnalytics: null,
    }
  );

  const result = await finalizeApprovedSessionFlow({
    sessionId: "session-1",
    fallbackPaymentId: "pay-1",
    ...harness.deps,
  });

  assert.equal(result.sessionStatus, "published");
  assert.equal(result.publicUrl, "https://reservaeldia.com.ar/i/mi-slug");
  assert.deepEqual(result.receipt, { ok: true });
  assert.equal(harness.calls.publish.length, 0);
  assert.equal(harness.calls.reservationUpdates.length, 0);
});

test("finalizeApprovedSessionFlow settles approved publication success with receipt, analytics, and reservation consume", async () => {
  const harness = createSettlementHarness(createBaseSession());

  const result = await finalizeApprovedSessionFlow({
    sessionId: "session-1",
    fallbackPaymentId: "pay-1",
    approvedAt: "2026-03-27T12:00:00.000Z",
    ...harness.deps,
  });

  assert.equal(result.sessionStatus, "published");
  assert.equal(result.publicUrl, "https://reservaeldia.com.ar/i/mi-slug");
  assert.equal(result.receipt.paymentId, "pay-1");
  assert.equal(result.receipt.amountArs, 12000);
  assert.equal(result.receipt.publicSlug, "mi-slug");
  assert.deepEqual(harness.calls.reservationUpdates, [
    {
      slug: "mi-slug",
      sessionId: "session-1",
      nextStatus: "consumed",
    },
  ]);
  assert.equal(harness.calls.discountUsage.length, 1);
  assert.equal(harness.calls.discountUsage[0].sessionPayload.publicSlug, "mi-slug");
  assert.equal(harness.calls.analyticsEvents.length, 1);
  assert.equal(harness.calls.analyticsEvents[0].eventId, "pago_aprobado:pay-1");
  assert.equal(harness.calls.analyticsEvents[0].templateId, "tpl-draft");
  assert.deepEqual(harness.calls.analyticsDraftLoads, ["draft-1"]);
  assert.deepEqual(harness.calls.analyticsPublishedLoads, ["mi-slug"]);
});

test("finalizeApprovedSessionFlow keeps slug conflicts retryable and releases the reservation", async () => {
  const harness = createSettlementHarness(createBaseSession(), {
    approvedPaymentAnalytics: null,
    async publishDraftToPublic() {
      throw new HttpsError("already-exists", "slug conflict");
    },
  });

  const result = await finalizeApprovedSessionFlow({
    sessionId: "session-1",
    fallbackPaymentId: "pay-1",
    ...harness.deps,
  });

  assert.equal(result.sessionStatus, "approved_slug_conflict");
  assert.equal(result.paymentId, "pay-1");
  assert.equal(harness.runtime.state.session.status, "approved_slug_conflict");
  assert.deepEqual(harness.calls.reservationUpdates, [
    {
      slug: "mi-slug",
      sessionId: "session-1",
      nextStatus: "released",
    },
  ]);
  assert.equal(harness.calls.discountUsage.length, 0);
});

test("finalizeApprovedSessionFlow keeps retryable failures on payment_approved with the current error message", async () => {
  const harness = createSettlementHarness(createBaseSession(), {
    approvedPaymentAnalytics: null,
    async publishDraftToPublic() {
      throw new Error("publish failed");
    },
  });

  await assert.rejects(
    () =>
      finalizeApprovedSessionFlow({
        sessionId: "session-1",
        fallbackPaymentId: "pay-1",
        ...harness.deps,
      }),
    (error) => {
      assert.equal(error?.code, "failed-precondition");
      assert.equal(error?.message, "publish failed");
      return true;
    }
  );

  assert.equal(harness.runtime.state.session.status, "payment_approved");
  assert.equal(harness.runtime.state.session.lastError, "publish failed");
  assert.equal(harness.calls.reservationUpdates.length, 0);
  assert.equal(harness.calls.logs[0]?.message, "Error publicando sesion aprobada");
});

test("processMercadoPagoPaymentFlow keeps rejected payments local to the session result", async () => {
  const runtime = createSessionRuntime(
    createBaseSession({
      status: "awaiting_payment",
    })
  );
  let finalizeCalls = 0;

  const result = await processMercadoPagoPaymentFlow({
    sessionId: "session-1",
    paymentId: "pay-rejected",
    paymentStatus: "rejected",
    paymentStatusDetail: "cc_rejected_call_for_authorize",
    sessionRef: runtime.sessionRef,
    createUpdatedAtValue: () => "ts-rejected",
    async finalizeApprovedSession() {
      finalizeCalls += 1;
      throw new Error("should not finalize");
    },
  });

  assert.equal(finalizeCalls, 0);
  assert.equal(result.sessionStatus, "payment_rejected");
  assert.equal(result.paymentId, "pay-rejected");
  assert.equal(result.errorMessage, "El pago fue rechazado. Intenta con otro medio de pago.");
  assert.equal(runtime.state.session.status, "payment_rejected");
  assert.equal(runtime.state.session.mpPaymentId, "pay-rejected");
});

test("processMercadoPagoPaymentFlow keeps in-process payments in payment_processing", async () => {
  const runtime = createSessionRuntime(
    createBaseSession({
      status: "awaiting_payment",
    })
  );
  let finalizeCalls = 0;

  const result = await processMercadoPagoPaymentFlow({
    sessionId: "session-1",
    paymentId: "pay-processing",
    paymentStatus: "in_process",
    paymentStatusDetail: "pending_review_manual",
    sessionRef: runtime.sessionRef,
    createUpdatedAtValue: () => "ts-processing",
    async finalizeApprovedSession() {
      finalizeCalls += 1;
      throw new Error("should not finalize");
    },
  });

  assert.equal(finalizeCalls, 0);
  assert.equal(result.sessionStatus, "payment_processing");
  assert.equal(result.message, "El pago esta siendo procesado.");
  assert.equal(runtime.state.session.status, "payment_processing");
  assert.equal(runtime.state.session.mpStatus, "in_process");
});

test("finalizeApprovedSessionFlow preserves zero-amount approved settlement semantics", async () => {
  const harness = createSettlementHarness(
    createBaseSession({
      amountBaseArs: 12000,
      amountArs: 0,
      discountAmountArs: 12000,
      discountCode: "FULLFREE",
      discountDescription: "Promo 100%",
    }),
    {
      approvedPaymentAnalytics: null,
    }
  );

  const result = await finalizeApprovedSessionFlow({
    sessionId: "session-1",
    fallbackPaymentId: "discount-full-session-1",
    approvedAt: "2026-03-27T12:00:00.000Z",
    ...harness.deps,
  });

  assert.equal(result.sessionStatus, "published");
  assert.equal(result.receipt.amountArs, 0);
  assert.equal(result.receipt.discountAmountArs, 12000);
  assert.equal(result.receipt.discountCode, "FULLFREE");
  assert.equal(result.receipt.paymentId, "discount-full-session-1");
});

test("processMercadoPagoPaymentFlow keeps direct-payment and webhook-approved paths aligned", async () => {
  const directHarness = createSettlementHarness(
    createBaseSession({
      status: "awaiting_payment",
    }),
    {
      approvedPaymentAnalytics: null,
    }
  );
  const webhookHarness = createSettlementHarness(
    createBaseSession({
      status: "awaiting_payment",
    }),
    {
      approvedPaymentAnalytics: null,
    }
  );

  const directResult = await runApprovedPayment(directHarness, "pay-1");
  const webhookResult = await runApprovedPayment(webhookHarness, "pay-1");

  assert.deepEqual(directResult, webhookResult);
  assert.equal(directHarness.runtime.state.session.status, "published");
  assert.equal(webhookHarness.runtime.state.session.status, "published");
  assert.deepEqual(directHarness.runtime.state.session, webhookHarness.runtime.state.session);
  assert.equal(directHarness.calls.publish.length, 1);
  assert.equal(webhookHarness.calls.publish.length, 1);
});
