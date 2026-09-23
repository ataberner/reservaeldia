import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { paymentNames, canonical, endpointHash, assertFuturePartition } = require("./testUtils/paymentsManifest.cjs");
const baseline = require("./testFixtures/payments/manifest-baseline.json");

function snapshot(source) {
  const child = spawnSync(process.execPath, ["--require", path.join(root, "scripts/local/networkGuard.cjs"), "-e", `
    const assert = require('node:assert/strict');
    const path = require('node:path');
    const source = process.cwd();
    const { SecretParam } = require(path.join(source, 'node_modules/firebase-functions/lib/params/types.js'));
    let secretReads = 0;
    SecretParam.prototype.value = () => { secretReads++; throw new Error('Secret reads forbidden during discovery'); };
    const api = require(source);
    const { loadStack } = require(path.join(source, 'node_modules/firebase-functions/lib/runtime/loader.js'));
    const { stackToWire } = require(path.join(source, 'node_modules/firebase-functions/lib/runtime/manifest.js'));
    (async () => {
      const manifest = stackToWire(await loadStack(source));
      assert.equal(secretReads, 0);
      const forbidden = Object.keys(require.cache).filter(file => /[/\\\\](emails|designerAi)[/\\\\]|[/\\\\]lib[/\\\\]index.js$/.test(file) && !file.includes('node_modules'));
      console.log(JSON.stringify({ manifest, names: Object.keys(api).sort(), forbidden }));
    })().catch(() => process.exit(1));
  `], { cwd: path.join(root, source), encoding: "utf8", timeout: 30_000, windowsHide: true,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC)$/i.test(key))) });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, "Offline entrypoint snapshot failed");
  return JSON.parse(child.stdout);
}

const defaults = snapshot("functions");
const payments = snapshot("functions-payments");
// Safe local discovery artifacts: names/options only, from credential-free children.
const evidence = path.join(root, ".local-isolation/payments-activation/manifests");
mkdirSync(evidence, { recursive: true });
for (const [name, snapshot] of Object.entries({ default: defaults, payments })) {
  writeFileSync(path.join(evidence, `${name}.json`), JSON.stringify(canonical(snapshot.manifest), null, 2));
}

test("default keeps exactly the other 102 original endpoints and their complete options", () => {
  assert.equal(Object.keys(defaults.manifest.endpoints).length, 102);
  const expected = Object.fromEntries(Object.entries(baseline.endpointHashes).filter(([name]) => !paymentNames.includes(name)));
  assert.deepEqual(Object.fromEntries(Object.entries(defaults.manifest.endpoints).map(([name, endpoint]) => [name, endpointHash(endpoint)])), expected);
  for (const name of paymentNames) assert.equal(defaults.names.includes(name), false);
});

test("standalone Payments exports exactly three endpoints with complete original options", () => {
  assert.deepEqual(payments.names, paymentNames);
  assert.deepEqual(canonical(payments.manifest.endpoints), baseline.payments);
  assert.deepEqual(payments.forbidden, []);
  assert.equal(existsSync(path.join(root, "functions-payments/lib/index.js")), false);
});

test("active 102 + 3 partition preserves every name/option and rejects missing/duplicate endpoints", () => {
  const core = defaults.manifest.endpoints;
  const expected = Object.keys(baseline.endpointHashes);
  assert.equal(Object.keys(core).length, 102);
  assertFuturePartition(core, payments.manifest.endpoints, expected);
  const union = { ...core, ...payments.manifest.endpoints };
  assert.deepEqual(Object.fromEntries(Object.entries(union).map(([name, endpoint]) => [name, endpointHash(endpoint)])), baseline.endpointHashes);
  assert.throws(() => assertFuturePartition(union, payments.manifest.endpoints, expected), /Duplicate/);
  assert.throws(() => assertFuturePartition(core, {}, expected), /Missing/);
});

test("active sources and isolated rollback share the canonical Payments build and exclusions", () => {
  const firebase = JSON.parse(readFileSync(path.join(root, "firebase.json"), "utf8"));
  assert.deepEqual(firebase.functions.map(({ source, codebase }) => ({ source, codebase })), [{ source: "functions", codebase: "default" }, { source: "functions-payments", codebase: "payments" }]);
  const rollback = JSON.parse(readFileSync(path.join(root, "firebase.payments-rollback.json"), "utf8"));
  assert.deepEqual(rollback.functions, [{ ...firebase.functions[1], codebase: "default" }]);
  assert.deepEqual(firebase.functions[1].predeploy, ["npm --prefix functions run build:payments"]);
  const files = readdirSync(path.join(root, "functions-payments"));
  assert.deepEqual(files.filter(name => /^\.secret|^\.runtimeconfig/.test(name)), []);
  const secretConsumers = secret => Object.entries(payments.manifest.endpoints).filter(([, endpoint]) => endpoint.secretEnvironmentVariables?.some(({ key }) => key === secret)).map(([name]) => name).sort();
  assert.deepEqual(secretConsumers("MERCADO_PAGO_ACCESS_TOKEN"), paymentNames);
  assert.deepEqual(secretConsumers("MP_WEBHOOK_SECRET"), ["mercadoPagoWebhook"]);
  assert.deepEqual(secretConsumers("MERCADO_PAGO_CLIENT_SECRET"), []);
  for (const endpoint of Object.values(payments.manifest.endpoints)) {
    assert.ok(endpoint.secretEnvironmentVariables.every(({ key }) => ["MERCADO_PAGO_ACCESS_TOKEN", "MP_WEBHOOK_SECRET"].includes(key)));
  }
});

test("Payments options match the sanitized deployed baseline after resolving platform defaults", () => {
  const remote = require("../docs/operations/baselines/payments-remote-2026-09-22.json");
  assert.deepEqual(remote.functions.map(fn => fn.buildConfig.entryPoint).sort(), paymentNames);
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
  for (let count = 1; count <= 3; count++) {
    const moved = paymentNames.slice(0, count), current = structuredClone(remote);
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
