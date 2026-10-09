import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import contract from "../shared/designerAiCapabilityContract.cjs";

const require = createRequire(import.meta.url);
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const express = require("express");
const ts = require("typescript");
// Compile this isolated source in memory. No builds, generated copies, Firebase
// initialization, credentials or external network are needed for these tests.
const source = readFileSync(new URL("./src/designerAi/requestBoundary.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } });
const exports = {};
vm.runInNewContext(compiled.outputText, { exports, Buffer,
  require: (id) => id === "../../shared/designerAiCapabilityContract.cjs" ? contract : require(id),
});
const { withDesignerAiRequestBoundary } = exports;

async function serve(t, callable) {
  const app = express();
  app.use(express.json({ limit: "1mb", verify(request, _response, buffer) { request.rawBody = buffer; } }));
  app.use(callable);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("predecoder wrapper preserves endpoint metadata, SDK CORS, protocol and guarded run", async (t) => {
  let calls = 0;
  const original = onCall({ region: "us-central1", maxInstances: 2, cors: ["https://allowed.example"] }, (request) => {
    calls += 1;
    return { received: request.data.message };
  });
  const wrapped = withDesignerAiRequestBoundary(original);
  assert.strictEqual(wrapped.__endpoint, original.__endpoint);
  assert.deepEqual(wrapped.__trigger, original.__trigger);
  assert.deepEqual(Object.getOwnPropertyDescriptors(wrapped), Object.getOwnPropertyDescriptors(original));
  assert.strictEqual(wrapped.stream, original.stream);
  assert.deepEqual(await wrapped.run({ data: { message: "test" } }), { received: "test" });
  await assert.rejects(wrapped.run({ data: { child: Array(701).fill(1) } }), (error) => error.code === "invalid-argument");
  const url = await serve(t, wrapped);
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://allowed.example" }, body: JSON.stringify({ data: { message: "válido" } }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://allowed.example");
  assert.deepEqual(await response.json(), { result: { received: "válido" } });
  const preflight = await fetch(url, { method: "OPTIONS", headers: { Origin: "https://allowed.example", "Access-Control-Request-Method": "POST" } });
  assert.equal(preflight.status, 204);
  const disallowed = await fetch(url, { method: "OPTIONS", headers: { Origin: "https://other.example", "Access-Control-Request-Method": "POST" } });
  // Firebase folds a one-origin list to a fixed CORS header. Browsers reject
  // the different requesting origin because that header does not match it.
  assert.equal(disallowed.headers.get("access-control-allow-origin"), "https://allowed.example");
  assert.equal(calls, 2);
});

test("raw hostile bodies are rejected by SDK protocol before decode or handler, without echoing values", async (t) => {
  let calls = 0;
  const url = await serve(t, withDesignerAiRequestBoundary(onCall({ cors: ["https://allowed.example"] }, () => { calls += 1; return true; })));
  const sensitive = "PRIVATE_SYNTHETIC_VALUE";
  const bodies = [
    '{"data":' + '{"child":'.repeat(3000) + '{}' + '}'.repeat(3000) + '}',
    JSON.stringify({ data: { list: Array(14000).fill("story.text") } }),
    JSON.stringify({ data: { message: "a".repeat(contract.DESIGNER_AI_REQUEST_LIMITS.maxBytes) } }),
    `{"data":{"__proto__":{"message":"${sensitive}"}}}`,
    JSON.stringify({ data: { "@type": sensitive, value: sensitive } }),
    JSON.stringify({ missingEnvelope: sensitive }),
    JSON.stringify({ data: {}, [sensitive]: sensitive }),
  ];
  for (const body of bodies) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://allowed.example" }, body });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://allowed.example");
    const result = await response.text();
    assert.equal(JSON.parse(result).error.status, "INVALID_ARGUMENT");
    assert.equal(result.includes(sensitive), false);
  }
  assert.equal(calls, 0);
});

test("accepted inputs still pass through Firebase auth and App Check guards", async (t) => {
  let calls = 0;
  const protectedUrl = await serve(t, withDesignerAiRequestBoundary(onCall({ enforceAppCheck: true }, () => { calls += 1; return true; })));
  const rejected = await fetch(protectedUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"data":{"message":"valid"}}' });
  assert.equal(rejected.status, 401);
  assert.equal((await rejected.json()).error.status, "UNAUTHENTICATED");
  const authUrl = await serve(t, withDesignerAiRequestBoundary(onCall({}, (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required");
    calls += 1;
    return true;
  })));
  const badAuth = await fetch(authUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "malformed" }, body: '{"data":{"message":"valid"}}' });
  assert.equal(badAuth.status, 401);
  assert.equal((await badAuth.json()).error.status, "UNAUTHENTICATED");
  assert.equal(calls, 0);
});
