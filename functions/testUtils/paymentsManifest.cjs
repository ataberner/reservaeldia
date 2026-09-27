const { createHash } = require("node:crypto");

const paymentNames = require("../functionOwnership.json").endpoints.filter(e => e.codebase === "payments").map(e => e.name).sort();
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const endpointHash = endpoint => createHash("sha256").update(JSON.stringify(canonical(endpoint))).digest("hex");

module.exports = { paymentNames, canonical, endpointHash };
