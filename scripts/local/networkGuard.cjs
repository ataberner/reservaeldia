// Local tooling preload only; never installed in the deployed runtime.
// Stop Node sockets before DNS/connect, including fetch, HTTP and gRPC transports.
const net = require("node:net");
const { syncBuiltinESMExports } = require("node:module");
const { assertLocalUrl } = require("../../shared/firebaseEnvironment.cjs");
const allowedHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const attempts = [];

function assertHost(host) {
  if (!allowedHosts.has(String(host || "localhost").toLowerCase())) {
    attempts.push({ transport: "socket", blocked: true });
    throw new Error("LOCAL_NETWORK_BLOCKED: destino no loopback; petición impedida.");
  }
}

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  // Node sometimes passes the normalized [options, callback] form.
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (first && typeof first === "object") {
    if (!first.path) assertHost(first.host || first.hostname);
  } else if (typeof first === "number" || /^\d+$/.test(String(first))) {
    assertHost(typeof args[1] === "string" ? args[1] : "localhost");
  } else if (typeof first !== "string") {
    throw new Error("LOCAL_NETWORK_BLOCKED: formato de conexión desconocido.");
  }
  return originalConnect.apply(this, args);
};

// Catch URL identity mismatches as well as remote sockets before fetch dispatch.
const originalFetch = globalThis.fetch;
if (originalFetch) globalThis.fetch = function (input, options) {
  const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
  try { assertLocalUrl(url); } catch {
    attempts.push({ transport: "fetch", blocked: true });
    return Promise.reject(new Error("LOCAL_NETWORK_BLOCKED: URL o identidad incompatible; petición impedida."));
  }
  return originalFetch(input, { ...options, redirect: "error" });
};
syncBuiltinESMExports();
module.exports = { attempts, assertHost };
