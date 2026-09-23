const { createHash } = require("node:crypto");
const assert = require("node:assert/strict");

const paymentNames = ["createPublicationCheckoutSession", "createPublicationPayment", "mercadoPagoWebhook"];
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const endpointHash = endpoint => createHash("sha256").update(JSON.stringify(canonical(endpoint))).digest("hex");

function assertFuturePartition(core, payments, expectedNames) {
  const names = [...Object.keys(core), ...Object.keys(payments)];
  assert.equal(new Set(names).size, names.length, "Duplicate endpoint in future partition");
  assert.deepEqual(names.sort(), [...expectedNames].sort(), "Missing/unexpected endpoint in future partition");
}

module.exports = { paymentNames, canonical, endpointHash, assertFuturePartition };
