import test from "node:test";
import assert from "node:assert/strict";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const {
  CHECKOUT_CONFIG_DOC_PATH,
  DEFAULT_PAYMENT_CONFIG,
  getPublicationConfigFromData,
  getPublicationPaymentConfig,
} = requireBuiltModule("lib/payments/publicationCheckoutConfig.js");

function createSnapshot(data) {
  return {
    exists: data != null,
    data() {
      return data == null ? undefined : JSON.parse(JSON.stringify(data));
    },
  };
}

test("publication checkout config keeps the current config doc path and default fallback", async () => {
  assert.equal(CHECKOUT_CONFIG_DOC_PATH, "app_config/publicationPayments");

  const result = await getPublicationPaymentConfig({
    async loadConfigDoc() {
      return createSnapshot(null);
    },
  });

  assert.deepEqual(result, DEFAULT_PAYMENT_CONFIG);
});

test("getPublicationConfigFromData preserves boolean overrides and clamps the ttl floor", () => {
  const result = getPublicationConfigFromData({
    enabled: false,
    slugReservationTtlMinutes: 4.2,
    enforcePayment: false,
  });

  assert.deepEqual(result, {
    enabled: false,
    slugReservationTtlMinutes: 5,
    enforcePayment: false,
  });
});

test("getPublicationConfigFromData keeps current fallback behavior for invalid booleans and rounds ttl", () => {
  const result = getPublicationConfigFromData({
    enabled: "yes",
    slugReservationTtlMinutes: 21.6,
    enforcePayment: "no",
  });

  assert.deepEqual(result, {
    enabled: true,
    slugReservationTtlMinutes: 22,
    enforcePayment: true,
  });
});
