import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const require = createRequire(import.meta.url);
const { HttpsError } = require("firebase-functions/v2/https");

const {
  parseSignatureHeader,
  readMercadoPagoWebhookEnvelope,
  resolvePaymentById,
  toQueryValue,
  validateMercadoPagoSignature,
} = requireBuiltModule("lib/payments/mercadoPagoWebhookEdge.js");

test("parseSignatureHeader keeps the current ts/v1 parsing behavior", () => {
  assert.deepEqual(parseSignatureHeader("ts=123,v1=abc"), {
    ts: "123",
    v1: "abc",
  });
  assert.equal(parseSignatureHeader("ts=123"), null);
  assert.equal(parseSignatureHeader(""), null);
});

test("validateMercadoPagoSignature keeps the current acceptance and fallback behavior", () => {
  const secret = "test-secret";
  const manifest = "id:payment-1;request-id:req-1;ts:1700000000;";
  const digest = createHmac("sha256", secret).update(manifest).digest("hex");

  assert.equal(
    validateMercadoPagoSignature({
      signatureHeader: `ts=1700000000,v1=${digest}`,
      requestId: "req-1",
      dataId: "payment-1",
      getWebhookSecret() {
        return secret;
      },
    }),
    true
  );
  assert.equal(
    validateMercadoPagoSignature({
      signatureHeader: "ts=1700000000,v1=bad-digest",
      requestId: "req-1",
      dataId: "payment-1",
      getWebhookSecret() {
        return secret;
      },
    }),
    false
  );
  assert.equal(
    validateMercadoPagoSignature({
      signatureHeader: `ts=1700000000,v1=${digest}`,
      requestId: "req-1",
      dataId: "payment-1",
      getWebhookSecret() {
        throw new Error("missing secret");
      },
    }),
    false
  );
});

test("webhook envelope parsing keeps the current query/body precedence and missing-field behavior", () => {
  assert.equal(toQueryValue(["payment"]), "payment");
  assert.equal(toQueryValue("payment"), "payment");

  assert.deepEqual(
    readMercadoPagoWebhookEnvelope({
      headers: {
        "x-signature": "ts=123,v1=abc",
        "x-request-id": "req-1",
      },
      query: {
        action: ["payment.updated"],
        "data.id": "987",
        type: "payment",
      },
      body: {
        action: "ignored-action",
        type: "ignored-type",
        data: {
          id: "ignored-id",
        },
      },
    }),
    {
      signatureHeader: "ts=123,v1=abc",
      requestId: "req-1",
      action: "payment.updated",
      dataId: "987",
      topic: "payment",
    }
  );

  assert.deepEqual(
    readMercadoPagoWebhookEnvelope({
      headers: {},
      query: {},
      body: {},
    }),
    {
      signatureHeader: "",
      requestId: "",
      action: "",
      dataId: "",
      topic: "",
    }
  );
});

test("resolvePaymentById keeps numeric validation and numeric-id loading behavior", async () => {
  const payment = await resolvePaymentById({
    paymentId: "12345",
    async loadPayment(id) {
      return { id, status: "approved" };
    },
  });

  assert.deepEqual(payment, {
    id: 12345,
    status: "approved",
  });

  await assert.rejects(
    () =>
      resolvePaymentById({
        paymentId: "invalid",
        async loadPayment() {
          throw new Error("should not load");
        },
      }),
    (error) => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, "invalid-argument");
      assert.equal(error.message, "paymentId invalido");
      return true;
    }
  );
});
