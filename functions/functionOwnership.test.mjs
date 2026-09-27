import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { snapshot } = require("./testUtils/deploymentSnapshot.cjs");
const { registry, assertPartition, assertConfigurationNames, assertSourceConfigurationNames, assertDeployReady, validateRegistry } = require("./testUtils/functionOwnership.cjs");
const { endpointHash } = require("./testUtils/paymentsManifest.cjs");
const manifests = Object.fromEntries(Object.entries(registry.codebases).map(([codebase, owner]) => [codebase, snapshot(owner.source).manifest]));

test("every discovered endpoint has explicit ownership and unchanged metadata", () => {
  const result = assertPartition(manifests);
  console.log(JSON.stringify(result));
});

test("registry agrees with active Firebase sources and actual package entrypoints", () => {
  const firebase = require("../firebase.json");
  assert.deepEqual(firebase.functions.map(f => f.codebase).sort(), Object.keys(registry.codebases).sort());
  for (const [codebase, owner] of Object.entries(registry.codebases)) {
    assert.equal(firebase.functions.find(f => f.codebase === codebase).source, owner.source);
    assert.equal(require(path.join(root, owner.source, "package.json")).main, owner.main);
    assert.ok(existsSync(path.join(root, owner.entrypoint)), `Missing canonical entrypoint: ${codebase}`);
    // Parameter declarations are not secret bindings. Normal parameters still
    // belong to their owner, even if they were imported transitively.
    assertConfigurationNames(codebase, (manifests[codebase].params || []).filter(p => p.type !== "secret").map(p => p.name));
  }
});

test("a new export fails until explicitly registered, even in an existing domain", () => {
  const changed = structuredClone(manifests);
  changed.default.endpoints.newUnassignedFunction = { ...changed.default.endpoints.getMyProfileStatus, entryPoint: "newUnassignedFunction" };
  assert.throws(() => assertPartition(changed), /Unregistered endpoint: newUnassignedFunction/);
  const assigned = structuredClone(registry);
  const endpoint = changed.default.endpoints.newUnassignedFunction;
  assigned.endpoints.push({ name: "newUnassignedFunction", domain: "identity-support", codebase: "default",
    regions: endpoint.region, secrets: [], manifestHash: endpointHash(endpoint) });
  assert.equal(assertPartition(changed, assigned).total, registry.endpoints.length + 1);
  assigned.endpoints.at(-1).domain = "unassigned-domain";
  assert.throws(() => assertPartition(changed, assigned), /Unassigned domain/);
});

test("missing endpoints and Payments/Email reexports or moves into core fail", () => {
  for (const codebase of ["payments", "email"]) {
    const name = Object.keys(manifests[codebase].endpoints)[0];
    const duplicate = structuredClone(manifests);
    duplicate[codebase].endpoints[name].platform = "gcfv1";
    duplicate.default.endpoints[name] = duplicate[codebase].endpoints[name];
    assert.throws(() => assertPartition(duplicate), /Wrong owner|Duplicate endpoint/);
    delete duplicate[codebase].endpoints[name];
    assert.throws(() => assertPartition(duplicate), /Wrong owner/);
    const missing = structuredClone(manifests);
    delete missing[codebase].endpoints[name];
    assert.throws(() => assertPartition(missing), /Missing registered endpoint/);
  }
  const duplicate = structuredClone(manifests);
  duplicate.email.endpoints.getMyProfileStatus = duplicate.default.endpoints.getMyProfileStatus;
  assert.throws(() => assertPartition(duplicate), /Duplicate endpoint/);
});

test("all deployment attributes, including triggers and identities, are protected", () => {
  for (const [key, value] of Object.entries({ platform: "gcfv1", region: ["europe-west1"], availableMemoryMb: 2048,
    cpu: 2, timeoutSeconds: 500, concurrency: 99, minInstances: 2, maxInstances: 9,
    serviceAccountEmail: "synthetic@example.invalid", entryPoint: "renamed", httpsTrigger: {} })) {
    const changed = structuredClone(manifests);
    changed.default.endpoints.getMyProfileStatus[key] = value;
    assert.throws(() => assertPartition(changed), /Unregistered|Region drift|Metadata drift/, key);
  }
  const retry = structuredClone(manifests);
  retry.email.endpoints.onUserCreatedWelcomeEmail.eventTrigger.retry = false;
  assert.throws(() => assertPartition(retry), /Metadata drift/);
});

test("secret allowlists constrain both codebase and individual endpoint", () => {
  for (const key of ["AWS_SES_ACCESS_KEY_ID", "OPENAI_API_KEY"]) {
    const changed = structuredClone(manifests);
    changed.default.endpoints.getMyProfileStatus.secretEnvironmentVariables = [{ key }];
    assert.throws(() => assertPartition(changed), /Secret outside owner|Unexpected secret bindings/);
  }
  const changed = structuredClone(registry);
  changed.endpoints.find(e => e.codebase === "payments").codebase = "default";
  assert.throws(() => assertPartition(manifests, changed), /Domain ownership/);
  const duplicate = structuredClone(registry);
  duplicate.endpoints.push(duplicate.endpoints[0]);
  assert.throws(() => assertPartition(manifests, duplicate), /Duplicate registry identity/);
});

test("configuration checks use names only and need no personal dotenv files", () => {
  assertConfigurationNames("default", ["SUPERADMINS_UIDS", "GOOGLE_MAPS_EMBED_API_KEY"]);
  assertConfigurationNames("payments", ["MERCADO_PAGO_PUBLIC_KEY", "GOOGLE_MAPS_EMBED_API_KEY"]);
  assertConfigurationNames("email", ["EMAIL_MODE", "WELCOME_EMAIL_ACTIVATION_AT"]);
  for (const [owner, name] of [["default", "MERCADO_PAGO_PUBLIC_KEY"], ["email", "GOOGLE_MAPS_EMBED_API_KEY"],
    ["payments", "EMAIL_MODE"], ["default", "OPENAI_API_KEY"], ["email", "AWS_SES_SECRET_ACCESS_KEY"]]) {
    assert.throws(() => assertConfigurationNames(owner, [name]), /Configuration outside/);
  }
  for (const name of ["MERCADO_PAGO_ACCESS_TOKEN", "MERCADO_PAGO_CLIENT_SECRET", "MP_WEBHOOK_SECRET",
    "MERCADO_PAGO_CLIENT_ID", "MERCADO_PAGO_PUBLIC_KEY", "MERCADO_PAGO_WEBHOOK_URL",
    "EMAIL_MODE", "WELCOME_EMAIL_ACTIVATION_AT", "UNASSIGNED_CONFIGURATION"]) {
    assert.throws(() => assertConfigurationNames("default", [name]), /Configuration outside/);
  }
});

test("the original dotenv names are checked before isolation, with no value leakage", () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "functions-env-ownership-"));
  const secretMarker = "synthetic-sensitive-value-must-not-appear";
  try {
    for (const owner of Object.values(registry.codebases)) mkdirSync(path.join(fixture, owner.source));
    const coreFile = path.join(fixture, "functions/.env.synthetic");
    writeFileSync(coreFile, "SUPERADMINS_UIDS=synthetic-admin\nGOOGLE_MAPS_EMBED_API_KEY=synthetic-maps\n");
    writeFileSync(path.join(fixture, "functions-email/.env.synthetic"), "EMAIL_MODE=sandbox\n");
    assert.doesNotThrow(() => assertSourceConfigurationNames(fixture));
    for (const assignment of [`EMAIL_MODE=${secretMarker}`, `export MERCADO_PAGO_PUBLIC_KEY=${secretMarker}`, `WELCOME_EMAIL_ACTIVATION_AT: ${secretMarker}`]) {
      writeFileSync(coreFile, assignment + "\n");
      assert.throws(() => assertSourceConfigurationNames(fixture), error => {
        assert.match(error.message, /Configuration outside default/);
        assert.ok(!error.stack.includes(secretMarker));
        return true;
      });
    }
    const gate = readFileSync(path.join(root, "scripts/local/verifyFunctionsOwnership.cjs"), "utf8");
    assert.ok(gate.indexOf("assertSourceConfigurationNames(ROOT)") < gate.indexOf("copyWorkspace(workspace)"));
    assert.match(readFileSync(path.join(root, "functions/scripts/checkDeployReadiness.cjs"), "utf8"), /assertSourceConfigurationNames/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("the normal verification flow requires the offline ownership gate before services", () => {
  const source = readFileSync(path.join(root, "scripts/local/runLocal.cjs"), "utf8");
  assert.match(source, /verifyFunctionsOwnership\.cjs/);
  assert.ok(source.indexOf('stage("functions-ownership"') < source.indexOf('stage("copy"'));
  const ci = readFileSync(path.join(root, ".github/workflows/local-verification.yml"), "utf8");
  assert.match(ci, /run verify:local/);
});

test("adopted limits have no blockers; an unresolved decision still blocks its owner", () => {
  for (const codebase of ["default", "payments"]) assert.doesNotThrow(() => assertDeployReady(codebase));
  assert.doesNotThrow(() => assertDeployReady("email")); // Only the registered-limit check; not business activation approval.
  const synthetic = structuredClone(registry);
  for (const entry of synthetic.endpoints) delete entry.deployBlocker;
  assert.doesNotThrow(() => assertDeployReady("default", synthetic));
  synthetic.endpoints[0].deployBlocker = { classification: "C", remoteMaxInstances: 5,
    evidence: "docs/operations/DEFAULT_DEPLOY_READINESS.md#instance-limits" };
  assert.throws(() => assertDeployReady("default", synthetic), /DEPLOY BLOCKER.*adminCommitTemplateWorkspaceV1/);
  assert.doesNotThrow(() => assertDeployReady("payments", synthetic));
});

test("blocker metadata fails closed on malformed decisions", () => {
  for (const blocker of [null, {}, { classification: "A" }, { classification: "C", remoteMaxInstances: 0 },
    { classification: "C", remoteMaxInstances: 20, evidence: "" }]) {
    const changed = structuredClone(registry);
    changed.endpoints[0].deployBlocker = blocker;
    assert.throws(() => validateRegistry(changed));
  }
});

test("real predeploy hooks pass resolved decisions and reject invalid invocations", () => {
  const firebase = require("../firebase.json");
  for (const codebase of ["default", "payments"]) {
    const hook = `node functions/scripts/checkDeployReadiness.cjs ${codebase}`;
    assert.equal(firebase.functions.find(f => f.codebase === codebase).predeploy[0], hook);
    const result = spawnSync(process.execPath, [path.join(root, "functions/scripts/checkDeployReadiness.cjs"), codebase], { encoding: "utf8", timeout: 10000, windowsHide: true });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /No registered deploy blockers/);
  }
  assert.equal(require("../firebase.payments-rollback.json").functions[0].predeploy[0], "node functions/scripts/checkDeployReadiness.cjs payments");
  for (const args of [[], ["unknown"], ["default", "--ignore"]]) {
    const result = spawnSync(process.execPath, [path.join(root, "functions/scripts/checkDeployReadiness.cjs"), ...args], { encoding: "utf8", timeout: 10000, windowsHide: true });
    assert.equal(result.status, 1);
  }
});
