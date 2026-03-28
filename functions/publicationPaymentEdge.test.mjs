import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
const { HttpsError } = require("firebase-functions/v2/https");

const {
  buildAwaitingRetryResult,
  buildPublishedRetryResult,
  extractPaymentMethodId,
  isAccountMoneyPaymentMethod,
  isZeroAmount,
  mapMercadoPagoConfigError,
  mapMercadoPagoPaymentError,
  normalizeDraftSlug,
  normalizeOperation,
  normalizePublicationStateTransitionAction,
  normalizeSessionId,
  parseOptionalDateString,
  resolvePayerEmail,
  toAmount,
  toIsoFromTimestamp,
} = requireBuiltModule("lib/payments/publicationPaymentEdge.js");

test("request normalizers keep the current values and error messages", async () => {
  assert.equal(normalizeSessionId("  session-1 "), "session-1");
  assert.equal(normalizeDraftSlug("  draft-1 "), "draft-1");
  assert.equal(normalizeOperation("new"), "new");
  assert.equal(normalizeOperation("update"), "update");
  assert.equal(
    normalizePublicationStateTransitionAction(" Restore_From_Trash "),
    "restore_from_trash"
  );

  assert.throws(
    () => normalizeSessionId(""),
    (error) => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, "invalid-argument");
      assert.equal(error.message, "Falta sessionId");
      return true;
    }
  );

  assert.throws(
    () => normalizeDraftSlug(""),
    (error) => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, "invalid-argument");
      assert.equal(error.message, "Falta draftSlug");
      return true;
    }
  );
});

test("payment method extraction keeps the current precedence and account-money helper", () => {
  assert.equal(
    extractPaymentMethodId({
      payment_method_id: "visa",
      paymentMethodId: "master",
      selectedPaymentMethod: { id: "amex" },
    }),
    "visa"
  );
  assert.equal(
    extractPaymentMethodId({
      paymentMethodId: "master",
      selectedPaymentMethod: "amex",
    }),
    "master"
  );
  assert.equal(
    extractPaymentMethodId({
      selectedPaymentMethod: { id: "amex" },
    }),
    "amex"
  );
  assert.equal(isAccountMoneyPaymentMethod(" account_money "), true);
  assert.equal(isAccountMoneyPaymentMethod("visa"), false);
});

test("zero-amount helpers keep the current rounding and floor semantics", () => {
  assert.equal(toAmount("1499.7", 0), 1500);
  assert.equal(toAmount(-20, 5), 0);
  assert.equal(toAmount("not-a-number", 7), 7);
  assert.equal(isZeroAmount(0), true);
  assert.equal(isZeroAmount(-5), true);
  assert.equal(isZeroAmount(1), false);
});

test("retry result shapers keep the current published and awaiting-retry shapes", () => {
  assert.deepEqual(
    buildPublishedRetryResult(
      "https://reservaeldia.com.ar/i/mi-slug",
      "Invitacion publicada correctamente."
    ),
    {
      sessionStatus: "published",
      publicUrl: "https://reservaeldia.com.ar/i/mi-slug",
      message: "Invitacion publicada correctamente.",
    }
  );
  assert.deepEqual(buildAwaitingRetryResult("El enlace elegido no esta disponible."), {
    sessionStatus: "awaiting_retry",
    message: "El enlace elegido no esta disponible.",
  });
});

test("mercado pago error mappers keep the current codes and messages", () => {
  const configError = mapMercadoPagoConfigError(
    new Error("Falta variable de entorno requerida: MERCADO_PAGO_PUBLIC_KEY")
  );
  assert.equal(configError.code, "failed-precondition");
  assert.equal(
    configError.message,
    "Configuracion de pagos incompleta. Falta configurar Mercado Pago en backend."
  );

  const tokenError = mapMercadoPagoPaymentError(new Error("Missing token in request"));
  assert.equal(tokenError.code, "invalid-argument");
  assert.equal(tokenError.message, "Completa los datos del medio de pago.");

  const genericError = mapMercadoPagoPaymentError(new Error("gateway timeout"));
  assert.equal(genericError.code, "failed-precondition");
  assert.equal(
    genericError.message,
    "No se pudo procesar el pago. Intenta nuevamente."
  );
});

test("date helpers keep the current iso parsing and payer-email fallback behavior", () => {
  const timestamp = parseOptionalDateString("2026-03-27T12:00:00.000Z", "startsAt");
  assert.equal(toIsoFromTimestamp(timestamp), "2026-03-27T12:00:00.000Z");
  assert.equal(toIsoFromTimestamp("2026-03-27T12:00:00.000Z"), "2026-03-27T12:00:00.000Z");
  assert.equal(
    resolvePayerEmail(
      {
        auth: {
          token: {
            email: "owner@reservaeldia.com",
          },
        },
      },
      "fallback@example.com"
    ),
    "owner@reservaeldia.com"
  );
  assert.equal(resolvePayerEmail({ auth: null }, "fallback@example.com"), "fallback@example.com");
});
