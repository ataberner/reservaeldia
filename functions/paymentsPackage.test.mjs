import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { paymentNames, canonical, endpointHash } = require("./testUtils/paymentsManifest.cjs");
const { registry, assertPartition, namesFor } = require("./testUtils/functionOwnership.cjs");
const { snapshot } = require("./testUtils/deploymentSnapshot.cjs");
const baseline = require("./testFixtures/payments/manifest-baseline.json");

const defaults = snapshot("functions");
const payments = snapshot("functions-payments");
const email = snapshot("functions-email");
const { emailNames } = require("./testUtils/emailManifest.cjs");
// Safe local discovery artifacts: names/options only, from credential-free children.
const evidence = path.join(root, ".local-isolation/payments-activation/manifests");
mkdirSync(evidence, { recursive: true });
for (const [name, snapshot] of Object.entries({ default: defaults, payments, email })) {
  writeFileSync(path.join(evidence, `${name}.json`), JSON.stringify(canonical(snapshot.manifest), null, 2));
}

test("default exports exactly its registered endpoints, excluding Payments and Email", () => {
  assert.deepEqual(defaults.names, namesFor("default"));
  for (const name of [...paymentNames, ...emailNames]) assert.equal(defaults.names.includes(name), false);
});

test("standalone Payments preserves original options apart from adopted instance limits", () => {
  assert.deepEqual(payments.names, paymentNames);
  // The current registry protects the adopted maxInstances. Keep the historical
  // fixture intact and compare every other original deployment attribute.
  for (const [name, endpoint] of Object.entries(baseline.payments)) {
    assert.deepEqual(canonical({ ...payments.manifest.endpoints[name], maxInstances: endpoint.maxInstances }), endpoint);
  }
  assert.deepEqual(payments.loaded.filter(file => /^(?:lib\/(?:emails|designerAi)\/|lib\/index\.js$)/.test(file)), []);
  assert.equal(existsSync(path.join(root, "functions-payments/lib/index.js")), false);
});

test("registered partition preserves the dated migration baseline as a subset", () => {
  assertPartition({ default: defaults.manifest, payments: payments.manifest, email: email.manifest });
  const union = { ...defaults.manifest.endpoints, ...payments.manifest.endpoints, ...email.manifest.endpoints };
  // Historical parity excludes only the now-explicit instance limits accepted
  // on 2026-09-27. Full current metadata is enforced by assertPartition above.
  for (const [name, hash] of Object.entries(baseline.endpointHashes)) {
    assert.ok(endpointHash(union[name]) === hash || endpointHash({ ...union[name], maxInstances: null }) === hash, `Changed original options beyond maxInstances: ${name}`);
  }
});

test("active sources and isolated rollback share the canonical Payments build and exclusions", () => {
  const firebase = JSON.parse(readFileSync(path.join(root, "firebase.json"), "utf8"));
  assert.deepEqual(firebase.functions.map(({ source, codebase }) => ({ source, codebase })), [{ source: "functions", codebase: "default" }, { source: "functions-payments", codebase: "payments" }, { source: "functions-email", codebase: "email" }]);
  const rollback = JSON.parse(readFileSync(path.join(root, "firebase.payments-rollback.json"), "utf8"));
  assert.deepEqual(rollback.functions, [{ ...firebase.functions[1], codebase: "default" }]);
  assert.deepEqual(firebase.functions[1].predeploy, ["node functions/scripts/checkDeployReadiness.cjs payments", "npm --prefix functions run build:payments"]);
  const files = readdirSync(path.join(root, "functions-payments"));
  assert.deepEqual(files.filter(name => /^\.secret|^\.runtimeconfig/.test(name)), []);
  const secretConsumers = secret => Object.entries(payments.manifest.endpoints).filter(([, endpoint]) => endpoint.secretEnvironmentVariables?.some(({ key }) => key === secret)).map(([name]) => name).sort();
  for (const secret of registry.codebases.payments.allowedSecrets) assert.deepEqual(secretConsumers(secret), registry.endpoints.filter(e => e.codebase === "payments" && e.secrets.includes(secret)).map(e => e.name).sort());
  assert.deepEqual(secretConsumers("MERCADO_PAGO_CLIENT_SECRET"), []);
  for (const endpoint of Object.values(payments.manifest.endpoints)) {
    assert.ok((endpoint.secretEnvironmentVariables || []).every(({ key }) => registry.codebases.payments.allowedSecrets.includes(key)));
  }
});

test("Payments options match the sanitized deployed baseline after resolving platform defaults", () => {
  const remote = require("../docs/operations/baselines/payments-remote-2026-09-22.json");
  assert.deepEqual(remote.functions.map(fn => fn.buildConfig.entryPoint).sort(), Object.keys(baseline.payments).sort());
  for (const fn of remote.functions) {
    const id = fn.buildConfig.entryPoint, endpoint = payments.manifest.endpoints[id], service = fn.serviceConfig;
    assert.equal(fn.name, `projects/${remote.project}/locations/${endpoint.region[0]}/functions/${id}`);
    assert.equal(endpoint.platform, "gcfv2");
    assert.equal(fn.environment, "GEN_2");
    assert.equal(fn.buildConfig.runtime, "nodejs20");
    assert.equal(fn.trigger, endpoint.callableTrigger ? "callable" : "https");
    assert.equal(service.availableMemory, `${endpoint.availableMemoryMb}Mi`);
    // CLI 14.4.0 backend.memoryToGen1Cpu(256); also exercised by verifyPayments plan.
    assert.equal(Number(service.availableCpu), endpoint.cpu === "gcf_gen1" ? 0.1666 : endpoint.cpu);
    assert.equal(service.timeoutSeconds, endpoint.timeoutSeconds ?? 60);
    assert.equal(service.maxInstanceRequestConcurrency, endpoint.concurrency ?? (Number(service.availableCpu) < 1 ? 1 : 80));
    assert.equal(service.serviceAccountEmail, endpoint.serviceAccountEmail ?? "860495975406-compute@developer.gserviceaccount.com");
    assert.equal(service.ingressSettings, endpoint.ingressSettings ?? "ALLOW_ALL");
    assert.equal(fn.url, `https://${endpoint.region[0]}-${remote.project}.cloudfunctions.net/${id}`);
    assert.deepEqual(service.secretEnvironmentVariables.map(({ key }) => key).sort(), endpoint.secretEnvironmentVariables.map(({ key }) => key).sort());
    for (const secret of service.secretEnvironmentVariables) {
      assert.equal(secret.projectId, remote.project);
      assert.equal(secret.secret, secret.key);
      assert.equal(secret.version, secret.key === "MERCADO_PAGO_ACCESS_TOKEN" ? "2" : "1");
    }
  }
});

test("remote metadata capture requests only safe fields and rejects full environment responses", () => {
  const { fields, sanitize } = require("./scripts/capturePaymentsMetadata.cjs");
  assert.equal(/(?:^|[,(/])environmentVariables|sourceToken|secretVolumes/.test(fields), false);
  assert.ok(fields.includes("secretEnvironmentVariables(key,projectId,secret,version)"));
  const fixture = { name: "projects/reservaeldia-7a440/locations/us-central1/functions/mercadoPagoWebhook", environment: "GEN_2", serviceConfig: {} };
  assert.deepEqual(sanitize({ ...fixture, unexpected: "synthetic-sensitive-value" }), sanitize(fixture));
  assert.throws(() => sanitize({ ...fixture, serviceConfig: { environmentVariables: { EXAMPLE: "synthetic-sensitive-value" } } }), /field selection/);
});

test("post-deploy comparison rejects URL, Secret-version and ownership changes", () => {
  const { compareMetadata } = require("./scripts/comparePaymentsMetadata.cjs");
  const remote = require("../docs/operations/baselines/payments-remote-2026-09-22.json");
  assert.equal(compareMetadata(remote, remote, []).metadataUnchanged, true);
  const historicalNames = remote.functions.map(fn => fn.buildConfig.entryPoint).sort();
  for (let count = 1; count <= historicalNames.length; count++) {
    const moved = historicalNames.slice(0, count), current = structuredClone(remote);
    for (const fn of current.functions) if (moved.includes(fn.buildConfig.entryPoint)) fn.labels["firebase-functions-codebase"] = "payments";
    assert.equal(compareMetadata(remote, current, moved).expectedOwnership, true);
    assert.throws(() => compareMetadata(remote, current, []), /ownership/);
  }
  for (const change of [
    fn => { fn.url = "https://synthetic.invalid"; },
    fn => { fn.serviceConfig.secretEnvironmentVariables[0].version = "999"; },
    fn => { fn.serviceConfig.serviceAccountEmail = "synthetic@example.invalid"; },
  ]) {
    const current = structuredClone(remote); change(current.functions[0]);
    assert.throws(() => compareMetadata(remote, current, []), /changed/);
  }
});

test("Payments lockfile is self-contained and preserves existing dependency versions", () => {
  const original = require("./package-lock.json");
  const lock = require("../functions-payments/package-lock.json");
  const pkg = require("../functions-payments/package.json");
  assert.deepEqual(lock.packages[""].dependencies, pkg.dependencies);
  assert.equal(pkg.engines.node, "20");
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (!name) continue;
    assert.equal(entry.link, undefined, `External link: ${name}`);
    assert.equal(entry.version, original.packages[name]?.version, `Dependency changed: ${name}`);
    assert.ok(!entry.resolved || !/^(file:|\.\.)/.test(entry.resolved), `External dependency: ${name}`);
  }
});

test("generated shared contracts come from the existing canonical mapping", () => {
  const { artifacts } = require("./scripts/syncTemplateContract.cjs");
  for (const { sourcePath, targetPaths } of artifacts) for (const target of targetPaths) {
    const relative = path.relative(path.join(root, "functions"), target);
    assert.deepEqual(readFileSync(path.join(root, "functions-payments", relative)), readFileSync(sourcePath), `Stale generated contract: ${relative}`);
  }
});

test("Payments services are byte-identical to the default build, including render and publication", () => {
  function visit(relative) {
    for (const entry of readdirSync(path.join(root, "functions-payments/lib", relative), { withFileTypes: true })) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) visit(name);
      else assert.deepEqual(readFileSync(path.join(root, "functions-payments/lib", name)), readFileSync(path.join(root, "functions/lib", name)), `Compiled service differs: ${name}`);
    }
  }
  visit("");
});
