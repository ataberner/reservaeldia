import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { snapshot } = require("./testUtils/deploymentSnapshot.cjs");
const { emailNames, smokeNames } = require("./testUtils/emailManifest.cjs");
const { paymentNames, canonical, endpointHash } = require("./testUtils/paymentsManifest.cjs");
const { assertPartition, assertConfigurationNames } = require("./testUtils/functionOwnership.cjs");
const snapshots = Object.fromEntries(["default", "payments", "email"].map(codebase =>
  [codebase, snapshot(codebase === "default" ? "functions" : "functions-" + codebase)]));
const evidence = path.join(root, ".local-isolation/email-codebase/manifests");
mkdirSync(evidence, { recursive: true });
for (const [name, value] of Object.entries(snapshots)) writeFileSync(path.join(evidence, name + ".json"), JSON.stringify(canonical(value.manifest), null, 2));
const remote = require("../docs/operations/baselines/email-remote-2026-09-25.json");
const endpoints = snapshots.email.manifest.endpoints;

test("partition matches registered ownership, without losses or duplicates", () => {
  assert.deepEqual(snapshots.email.names, emailNames);
  assert.deepEqual(snapshots.payments.names, paymentNames);
  assertPartition(Object.fromEntries(Object.entries(snapshots).map(([name, value]) => [name, value.manifest])));
  const baseline = require("./testFixtures/payments/manifest-baseline.json");
  const all = Object.assign({}, ...Object.values(snapshots).map(s => s.manifest.endpoints));
  // Default/Payments adopted explicit instance limits on 2026-09-27; the
  // registry above protects current full metadata. Preserve the dated fixture.
  for (const [name, hash] of Object.entries(baseline.endpointHashes)) {
    assert.ok(endpointHash(all[name]) === hash || endpointHash({ ...all[name], maxInstances: null }) === hash, `Changed original options beyond maxInstances: ${name}`);
  }
});

test("email discovery does not load AWS SDK, React Email or application stores/default/payments runtime", () => {
  const loaded = snapshots.email.loaded;
  // firebase-functions/v1 itself imports Firebase Admin/Firestore. Our own store
  // and the AWS/template runtimes remain lazy; the installed SDK is unchanged.
  assert.equal(loaded.some(file => /node_modules\/(?:@aws-sdk|react-email|react\/|react-dom)/.test(file)), false);
  assert.equal(loaded.some(file => /^lib\/(?:index\.js|payments\/|designerAi\/)|^lib\/emails\/(?:renderEmail|sesClient|welcomeRegistration|welcomeDeliveryStore)\.js$/.test(file)), false);
  assert.equal(existsSync(path.join(root, "functions-email/lib/index.js")), false);
});

test("both existing private smoke endpoints preserve the dated pre-migration remote contracts", () => {
  assert.equal(remote.authTriggerExists, false);
  for (const fn of remote.functions) {
    const name = fn.buildConfig.entryPoint, endpoint = endpoints[name], service = fn.serviceConfig;
    assert.ok(smokeNames.includes(name));
    assert.equal(fn.name, `projects/${remote.project}/locations/${endpoint.region[0]}/functions/${name}`);
    assert.equal(endpoint.platform, "gcfv2"); assert.equal(fn.environment, "GEN_2");
    assert.equal(fn.buildConfig.runtime, "nodejs20"); assert.equal(fn.trigger, "https");
    assert.deepEqual(endpoint.httpsTrigger.invoker, ["private"]);
    assert.equal(fn.invoker.iamCheckEnabled, true); assert.deepEqual(fn.invoker.publicPrincipals, []);
    assert.equal(service.serviceAccountEmail, endpoint.serviceAccountEmail);
    assert.equal(service.availableMemory, `${endpoint.availableMemoryMb}Mi`);
    assert.equal(Number(service.availableCpu), endpoint.cpu);
    assert.equal(service.timeoutSeconds, endpoint.timeoutSeconds);
    assert.equal(service.maxInstanceRequestConcurrency, endpoint.concurrency);
    assert.equal(service.minInstanceCount ?? 0, endpoint.minInstances);
    assert.equal(service.maxInstanceCount, endpoint.maxInstances);
    assert.deepEqual(service.secretEnvironmentVariables.map(s => s.key).sort(), endpoint.secretEnvironmentVariables.map(s => s.key).sort());
    assert.equal(fn.url, `https://${endpoint.region[0]}-${remote.project}.cloudfunctions.net/${name}`);
    assert.equal(fn.invoker.uri, service.uri);
    assert.equal(fn.labels["firebase-functions-codebase"] ?? "default", "default");
  }
});

test("Auth remains v1 onCreate; only AWS bindings and original identities enter email", () => {
  const auth = endpoints.onUserCreatedWelcomeEmail;
  assert.equal(auth.platform, "gcfv1");
  assert.equal(auth.eventTrigger.eventType, "providers/firebase.auth/eventTypes/user.create");
  assert.equal(auth.serviceAccountEmail, "welcome-email-sender@reservaeldia-7a440.iam.gserviceaccount.com");
  assert.equal(auth.eventTrigger.retry, true);
  for (const endpoint of Object.values(endpoints)) assert.deepEqual(endpoint.secretEnvironmentVariables.map(s => s.key).sort(), ["AWS_SES_ACCESS_KEY_ID", "AWS_SES_SECRET_ACCESS_KEY"]);
});

test("build is canonical and copies only email and its necessary shared dependencies", () => {
  assert.deepEqual(readdirSync(path.join(root, "functions-email/lib")).sort(), ["auth", "emails", "firebaseAdmin.js", "shared"]);
  function compare(relative) {
    for (const entry of readdirSync(path.join(root, "functions-email/lib", relative), { withFileTypes: true })) {
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) compare(file);
      else assert.deepEqual(readFileSync(path.join(root, "functions-email/lib", file)), readFileSync(path.join(root, "functions/lib", file)), `Changed compiled module: ${file}`);
    }
  }
  compare("");
  assert.deepEqual(readFileSync(path.join(root, "functions-email/shared/firebaseEnvironment.cjs")), readFileSync(path.join(root, "shared/firebaseEnvironment.cjs")));
  assert.deepEqual(readdirSync(path.join(root, "functions-email/shared")), ["firebaseEnvironment.cjs"]);
});

test("package lock uses only existing locked versions, without outside-package links", () => {
  const original = require("./package-lock.json"), pkg = require("../functions-email/package.json");
  const lock = require("../functions-email/package-lock.json");
  const { projectLock } = require("./scripts/emailPackageLock.cjs");
  assert.deepEqual(lock, projectLock(original, pkg));
  for (const [name, entry] of Object.entries(lock.packages)) if (name) {
    assert.equal(entry.link, undefined); assert.equal(entry.version, original.packages[name].version);
  }
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ["@aws-sdk/client-sesv2", "firebase-admin", "firebase-functions", "react", "react-dom", "react-email"]);
  assert.equal(pkg.engines.node, "20"); assert.equal(pkg.main, "lib/emails/entrypoint.js");
});

test("email normal configuration is sandbox, activation unset and only canonical superadmin data is shared", () => {
  const directory = path.join(root, "functions-email");
  for (const file of readdirSync(directory).filter(n => /^\.env(?:\.|$)/.test(n))) {
    const source = readFileSync(path.join(directory, file), "utf8");
    const names = [...source.matchAll(/^\s*(?:export\s+)?([\w.-]+)\s*=/gm)].map(m => m[1]);
    assertConfigurationNames("email", names);
    assert.ok(/^EMAIL_MODE=sandbox\s*$/m.test(source), "Sandbox configuration required");
    assert.ok(/^WELCOME_EMAIL_ACTIVATION_AT=[ \t]*$/m.test(source), "Activation must remain unset");
    const before = readFileSync(path.join(root, "functions/.env.reservaeldia-7a440"), "utf8").split(/\r?\n/).find(line => /^SUPERADMINS_UIDS=/.test(line));
    assert.ok(source.split(/\r?\n/).includes(before), "Canonical superadmin authority must be preserved; values omitted");
    const ignored = spawnSync("git", ["check-ignore", "functions-email/" + file], { cwd: root, encoding: "utf8", windowsHide: true });
    assert.equal(ignored.status, 0);
  }
  assert.deepEqual(readdirSync(directory).filter(n => /^\.secret|^\.runtimeconfig/.test(n)), []);
});

test("active source and rollback use only the email build with sensitive files excluded", () => {
  const firebase = require("../firebase.json"), rollback = require("../firebase.email-rollback.json");
  const email = firebase.functions.find(f => f.codebase === "email");
  assert.equal(email.source, "functions-email");
  assert.deepEqual(email.predeploy, ["npm --prefix functions run build:email"]);
  assert.deepEqual(rollback.functions, [{ ...email, codebase: "default" }]);
  for (const ignored of [".env*", ".secret*", ".runtimeconfig.json", "node_modules"]) assert.ok(email.ignore.includes(ignored));
});

test("metadata tool rejects complete environments; parity detects privacy, URLs, credentials bindings and ownership drift", () => {
  const { fields, sanitize } = require("./scripts/captureEmailMetadata.cjs");
  const { compareMetadata } = require("./scripts/compareEmailMetadata.cjs");
  assert.equal(/(?:^|[,(/])environmentVariables|sourceToken|secretVolumes/.test(fields), false);
  const fixture = { name: remote.functions[0].name, environment: "GEN_2", serviceConfig: {} };
  assert.throws(() => sanitize({ ...fixture, serviceConfig: { environmentVariables: {} } }), /field selection/);
  assert.deepEqual(sanitize({ ...fixture, unexpected: "synthetic" }), sanitize(fixture));
  for (let count = 0; count <= 2; count++) {
    const moved = smokeNames.slice(0, count), current = structuredClone(remote);
    for (const fn of current.functions) if (moved.includes(fn.buildConfig.entryPoint)) fn.labels["firebase-functions-codebase"] = "email";
    assert.equal(compareMetadata(remote, current, moved).metadataUnchanged, true);
    if (count) assert.throws(() => compareMetadata(remote, current, []), /ownership/);
  }
  for (const mutate of [fn => { fn.url = "https://synthetic.invalid"; }, fn => { fn.invoker.iamCheckEnabled = false; },
    fn => { fn.serviceConfig.secretEnvironmentVariables[0].version = "999"; }, fn => { fn.serviceConfig.serviceAccountEmail = "fixture"; }]) {
    const changed = structuredClone(remote); mutate(changed.functions[0]);
    assert.throws(() => compareMetadata(remote, changed, []), /changed/);
  }
});
