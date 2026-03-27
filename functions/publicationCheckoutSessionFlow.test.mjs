import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
const { HttpsError } = require("firebase-functions/v2/https");

const {
  autoApproveZeroAmountCheckoutSessionFlow,
  buildCheckoutStatusResponseFromSession,
  buildExpiredCheckoutPaymentResult,
  buildExpiredCheckoutStatusResponse,
  expireCheckoutSessionIfNeededFlow,
  readOwnedCheckoutSessionFlow,
} = requireBuiltModule("lib/payments/publicationCheckoutSessionFlow.js");

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

function createSessionRef(initialData) {
  const state = {
    session: clone(initialData),
    writes: [],
  };

  return {
    state,
    ref: {
      async get() {
        return createSnapshot(state.session);
      },
      async set(payload, options) {
        state.session = {
          ...(state.session || {}),
          ...clone(payload),
        };
        state.writes.push({
          payload: clone(payload),
          options,
        });
      },
    },
  };
}

function createSessionData(overrides = {}) {
  return {
    uid: "user-1",
    status: "awaiting_payment",
    operation: "new",
    publicSlug: "mi-slug",
    expiresAt: {
      kind: "future",
    },
    ...overrides,
  };
}

test("readOwnedCheckoutSessionFlow returns owned session data unchanged", async () => {
  const runtime = createSessionRef(createSessionData());

  const result = await readOwnedCheckoutSessionFlow({
    uid: "user-1",
    sessionId: "session-1",
    sessionRef: runtime.ref,
  });

  assert.equal(result.ref, runtime.ref);
  assert.equal(result.snap.exists, true);
  assert.equal(result.data.uid, "user-1");
  assert.equal(result.data.status, "awaiting_payment");
});

test("readOwnedCheckoutSessionFlow throws not-found with the current message", async () => {
  const runtime = createSessionRef(null);

  await assert.rejects(
    () =>
      readOwnedCheckoutSessionFlow({
        uid: "user-1",
        sessionId: "missing-session",
        sessionRef: runtime.ref,
      }),
    (error) => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, "not-found");
      assert.equal(error.message, "Sesion de checkout no encontrada");
      return true;
    }
  );
});

test("readOwnedCheckoutSessionFlow throws permission-denied with the current message", async () => {
  const runtime = createSessionRef(createSessionData({ uid: "user-2" }));

  await assert.rejects(
    () =>
      readOwnedCheckoutSessionFlow({
        uid: "user-1",
        sessionId: "session-1",
        sessionRef: runtime.ref,
      }),
    (error) => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, "permission-denied");
      assert.equal(error.message, "No tenes acceso a esta sesion");
      return true;
    }
  );
});

test("expireCheckoutSessionIfNeededFlow expires an expired new session and marks its reservation expired", async () => {
  const runtime = createSessionRef(createSessionData());
  const reservationUpdates = [];

  const expired = await expireCheckoutSessionIfNeededFlow({
    sessionId: "session-1",
    sessionData: runtime.state.session,
    sessionRef: runtime.ref,
    isExpiredAt() {
      return true;
    },
    createUpdatedAtValue() {
      return "ts-expired";
    },
    async updateReservationStatus(update) {
      reservationUpdates.push(clone(update));
    },
  });

  assert.equal(expired, true);
  assert.equal(runtime.state.session.status, "expired");
  assert.equal(runtime.state.session.lastError, "La sesion de pago expiro. Inicia una nueva.");
  assert.equal(runtime.state.session.updatedAt, "ts-expired");
  assert.deepEqual(reservationUpdates, [
    {
      slug: "mi-slug",
      sessionId: "session-1",
      nextStatus: "expired",
    },
  ]);
});

test("expireCheckoutSessionIfNeededFlow expires an expired update session without touching reservations", async () => {
  const runtime = createSessionRef(createSessionData({ operation: "update" }));
  let reservationCalls = 0;

  const expired = await expireCheckoutSessionIfNeededFlow({
    sessionId: "session-1",
    sessionData: runtime.state.session,
    sessionRef: runtime.ref,
    isExpiredAt() {
      return true;
    },
    createUpdatedAtValue() {
      return "ts-expired-update";
    },
    async updateReservationStatus() {
      reservationCalls += 1;
    },
  });

  assert.equal(expired, true);
  assert.equal(runtime.state.session.status, "expired");
  assert.equal(reservationCalls, 0);
});

test("expireCheckoutSessionIfNeededFlow is a no-op for active and terminal statuses", async () => {
  const scenarios = [
    createSessionData(),
    createSessionData({ status: "published" }),
    createSessionData({ status: "payment_rejected" }),
    createSessionData({ status: "approved_slug_conflict" }),
    createSessionData({ status: "expired" }),
  ];

  for (const sessionData of scenarios) {
    const runtime = createSessionRef(sessionData);
    let reservationCalls = 0;

    const expired = await expireCheckoutSessionIfNeededFlow({
      sessionId: "session-1",
      sessionData: runtime.state.session,
      sessionRef: runtime.ref,
      isExpiredAt() {
        return sessionData.status === "awaiting_payment" ? false : true;
      },
      createUpdatedAtValue() {
        return "ts-noop";
      },
      async updateReservationStatus() {
        reservationCalls += 1;
      },
    });

    assert.equal(expired, false);
    assert.deepEqual(runtime.state.writes, []);
    assert.equal(reservationCalls, 0);
  }
});

test("buildExpiredCheckoutPaymentResult matches the current payment-handler contract", () => {
  assert.deepEqual(buildExpiredCheckoutPaymentResult(), {
    sessionStatus: "expired",
    paymentId: "",
    message: "La sesion expiro",
    errorMessage: "La sesion de pago expiro. Inicia una nueva.",
  });
});

test("buildExpiredCheckoutStatusResponse matches the current status-handler contract", () => {
  assert.deepEqual(buildExpiredCheckoutStatusResponse(), {
    sessionStatus: "expired",
    errorMessage: "La sesion de pago expiro. Inicia una nueva.",
  });
});

test("buildCheckoutStatusResponseFromSession preserves session fields and fallback status", () => {
  const withStatus = buildCheckoutStatusResponseFromSession({
    status: "published",
    publicUrl: "https://reservaeldia.com.ar/i/mi-slug",
    receipt: { ok: true },
    lastError: "warning",
  });
  const fallbackStatus = buildCheckoutStatusResponseFromSession({
    status: "",
  });

  assert.deepEqual(withStatus, {
    sessionStatus: "published",
    publicUrl: "https://reservaeldia.com.ar/i/mi-slug",
    receipt: { ok: true },
    errorMessage: "warning",
  });
  assert.deepEqual(fallbackStatus, {
    sessionStatus: "awaiting_payment",
    publicUrl: undefined,
    receipt: undefined,
    errorMessage: undefined,
  });
});

test("autoApproveZeroAmountCheckoutSessionFlow writes the current synthetic approval fields and fallback payment id", async () => {
  const runtime = createSessionRef(createSessionData({ mpPaymentId: "" }));

  const result = await autoApproveZeroAmountCheckoutSessionFlow({
    sessionId: "session-1",
    sessionData: runtime.state.session,
    sessionRef: runtime.ref,
    createUpdatedAtValue() {
      return "ts-zero";
    },
    approvedAt: "2026-03-27T12:00:00.000Z",
  });

  assert.deepEqual(result, {
    paymentId: "discount-full-session-1",
    approvedAt: "2026-03-27T12:00:00.000Z",
  });
  assert.deepEqual(runtime.state.writes, [
    {
      payload: {
        mpPaymentId: "discount-full-session-1",
        mpStatus: "approved",
        mpStatusDetail: "discount_100_auto_approved",
        status: "payment_approved",
        lastError: null,
        updatedAt: "ts-zero",
      },
      options: { merge: true },
    },
  ]);
});

test("autoApproveZeroAmountCheckoutSessionFlow preserves an existing payment id when present", async () => {
  const runtime = createSessionRef(createSessionData({ mpPaymentId: "existing-pay-id" }));

  const result = await autoApproveZeroAmountCheckoutSessionFlow({
    sessionId: "session-1",
    sessionData: runtime.state.session,
    sessionRef: runtime.ref,
    createUpdatedAtValue() {
      return "ts-existing";
    },
    approvedAt: "2026-03-27T12:00:00.000Z",
  });

  assert.equal(result.paymentId, "existing-pay-id");
  assert.equal(runtime.state.session.mpPaymentId, "existing-pay-id");
});
