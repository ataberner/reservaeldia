// Offline verification only. Never imports deploy commands or reads dotenv/ADC.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { paymentNames, canonical } = require("../testUtils/paymentsManifest.cjs");

const root = path.resolve(__dirname, "../..");
const source = path.join(root, "functions-payments");
const evidence = path.join(root, ".local-isolation/payments-activation");
const cleanEnv = () => Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC)$/i.test(key)));

function materializeLocalDependencies(destination) {
  // Reuse only installed packages present in this lock, at identical versions.
  // This is an offline alternative for verification, not a deployment build step.
  const lock = JSON.parse(fs.readFileSync(path.join(source, "package-lock.json"), "utf8"));
  const installed = path.join(root, "functions");
  const modules = path.join(destination, "node_modules");
  assert.equal(fs.existsSync(modules), false, "Use a fresh dependency destination");
  let copied = 0, optionalMissing = 0;
  for (const [relative, expected] of Object.entries(lock.packages)) {
    if (!relative) continue;
    assert.ok(relative.startsWith("node_modules/") && !relative.split("/").includes("..") && !expected.link);
    const from = path.join(installed, relative);
    if (!fs.existsSync(from) && expected.optional) { optionalMissing++; continue; }
    assert.equal(fs.realpathSync(from), from, "Linked dependencies are not autonomous");
    const actual = JSON.parse(fs.readFileSync(path.join(from, "package.json"), "utf8"));
    assert.equal(actual.version, expected.version, `Installed version mismatch: ${relative}`);
    fs.cpSync(from, path.join(destination, relative), { recursive: true, filter: file => {
      if (file !== from && path.basename(file) === "node_modules") return false;
      assert.equal(fs.lstatSync(file).isSymbolicLink(), false, "Dependency contains a link");
      return true;
    } });
    copied++;
  }
  fs.mkdirSync(path.join(modules, ".bin"), { recursive: true });
  for (const suffix of ["", ".cmd", ".ps1"]) {
    const shim = path.join(installed, "node_modules/.bin/firebase-functions" + suffix);
    if (fs.existsSync(shim)) fs.copyFileSync(shim, path.join(modules, ".bin/firebase-functions" + suffix));
  }
  return { copied, optionalMissing };
}

function assertPlan(cliRoot) {
  const guard = require(path.join(root, "scripts/local/networkGuard.cjs"));
  assert.equal(require(path.join(cliRoot, "package.json")).version, "14.4.0");
  const backend = require(path.join(cliRoot, "lib/deploy/functions/backend.js"));
  const helper = require(path.join(cliRoot, "lib/deploy/functions/functionsDeployHelper.js"));
  const planner = require(path.join(cliRoot, "lib/deploy/functions/release/planner.js"));
  const converter = require(path.join(cliRoot, "lib/deploy/functions/runtimes/discovery/v1alpha1.js"));
  const build = require(path.join(cliRoot, "lib/deploy/functions/build.js"));
  const gcf = require(path.join(cliRoot, "lib/gcp/cloudfunctionsv2.js"));
  const { resolveCpuAndConcurrency } = require(path.join(cliRoot, "lib/deploy/functions/prepare.js"));
  const remote = require("../../docs/operations/baselines/payments-remote-2026-09-22.json");
  const config = require("../../firebase.json").functions;
  const rollbackConfig = require("../../firebase.payments-rollback.json").functions;
  const endpoints = codebase => {
    const wire = JSON.parse(fs.readFileSync(path.join(evidence, "manifests", codebase + ".json"), "utf8"));
    const converted = converter.buildFromV1Alpha1(wire, remote.project, "us-central1", "nodejs20");
    const resolved = build.toBackend(converted, {});
    resolveCpuAndConcurrency(resolved);
    return backend.allEndpoints(resolved).map(endpoint => ({ ...endpoint, codebase }));
  };
  const core = endpoints("default"), wanted = endpoints("payments");
  // Only these three deployed resources were queried. Core existence is simulated.
  const existing = [...core, ...remote.functions.map(fn => gcf.endpointFromFunction(fn))];
  assert.equal(core.length, 102);
  assert.deepEqual(wanted.map(e => e.id).sort(), paymentNames);
  const parity = wanted.map(endpoint => {
    const deployed = existing.find(e => e.id === endpoint.id);
    for (const key of ["id", "project", "region", "platform", "runtime", "entryPoint", "availableMemoryMb", "cpu", "concurrency"]) assert.deepEqual(endpoint[key], deployed[key], key);
    assert.deepEqual(backend.endpointTriggerType(endpoint), backend.endpointTriggerType(deployed));
    assert.equal(endpoint.timeoutSeconds ?? 60, deployed.timeoutSeconds);
    assert.equal(endpoint.serviceAccount ?? "860495975406-compute@developer.gserviceaccount.com", deployed.serviceAccount);
    assert.equal(endpoint.ingressSettings ?? "ALLOW_ALL", deployed.ingressSettings);
    assert.deepEqual(endpoint.secretEnvironmentVariables.map(s => s.key).sort(), deployed.secretEnvironmentVariables.map(s => s.key).sort());
    return { name: endpoint.id, optionsMatch: true, expectedSecretVersions: Object.fromEntries(deployed.secretEnvironmentVariables.map(s => [s.key, s.version])) };
  });
  function simulate(want, have, codebase, selected, configuration) {
    const only = selected.map(n => "functions:" + codebase + ":" + n).join(",");
    const filters = helper.getEndpointFilters({ only });
    assert.deepEqual(helper.targetCodebases(configuration, filters), [codebase]);
    assert.deepEqual(want.filter(e => helper.endpointMatchesAnyFilter(e, filters)).map(e => e.id).sort(), [...selected].sort());
    const grouped = helper.groupEndpointsByCodebase({ [codebase]: backend.of(...want) }, have);
    const plan = Object.values(planner.createDeploymentPlan({ wantBackend: backend.of(...want), haveBackend: grouped[codebase], codebase, filters, deleteAll: false }));
    const result = {
      updates: plan.flatMap(c => c.endpointsToUpdate).map(e => e.endpoint.id).sort(),
      creates: plan.flatMap(c => c.endpointsToCreate).length,
      deletes: plan.flatMap(c => c.endpointsToDelete).length,
      recreates: plan.flatMap(c => c.endpointsToUpdate).filter(e => e.deleteAndRecreate).length,
    };
    assert.deepEqual(result, { updates: [...selected].sort(), creates: 0, deletes: 0, recreates: 0 });
    return { selector: only, ...result };
  }
  const allLocal = [...core, ...wanted];
  const selectors = paymentNames.map(name => {
    const filters = helper.getEndpointFilters({ only: "functions:payments:" + name });
    assert.deepEqual(allLocal.filter(e => helper.endpointMatchesAnyFilter(e, filters)).map(e => e.id), [name]);
    return simulate(wanted, existing, "payments", [name], config);
  });
  const forward = simulate(wanted, existing, "payments", paymentNames, config);
  const rollback = [1, 2, 3].map(count => {
    const moved = paymentNames.slice(0, count);
    const state = existing.map(e => moved.includes(e.id) ? { ...e, codebase: "payments" } : e);
    return simulate(wanted.map(e => ({ ...e, codebase: "default" })), state, "default", moved, rollbackConfig);
  });
  assert.equal(guard.attempts.length, 0);
  return { cliVersion: "14.4.0", selectors, forward, rollback, parity, untouched: 102,
    remoteMetadataCapturedAt: remote.capturedAt, remoteStateFullyVerified: false,
    limitation: "Only three safe metadata snapshots are real; the other 102 and post-migration ownership are simulated. No remote planner/deploy/IAM/Secret resolution was executed." };
}

async function discoveryChild(cliRoot, codebase) {
  const discoverySource = codebase === "default" ? path.join(root, "functions") : source;
  const expectedNames = Object.keys(require("../testFixtures/payments/manifest-baseline.json").endpointHashes).filter(name => codebase === "default" ? !paymentNames.includes(name) : paymentNames.includes(name)).sort();
  const guardPath = path.join(root, "scripts/local/networkGuard.cjs");
  const guard = require(guardPath);
  const spawnPath = require.resolve("cross-spawn", { paths: [cliRoot] });
  const spawn = require(spawnPath);
  let errors = "", child, quitTimer;
  // Retain the actual CLI wrapper, cwd, environment construction and detector.
  // Only add network protection/hidden Windows launch; never extend its timeout.
  require.cache[spawnPath].exports = (command, args, options) => {
    options.windowsHide = true;
    options.env.NODE_OPTIONS = `--require="${guardPath.replace(/\\/g, "/")}"`;
    child = spawn(command, args, options);
    child.stderr.on("data", bytes => { errors += bytes.toString(); });
    return child;
  };
  const logger = require(path.join(cliRoot, "lib/logger.js")).logger;
  for (const method of ["info", "warn", "error", "debug"]) logger[method] = () => {};
  const discovery = require(path.join(cliRoot, "lib/deploy/functions/runtimes/discovery/index.js"));
  assert.equal(discovery.getFunctionDiscoveryTimeout(), 0);
  const detect = discovery.detectFromPort;
  let detectorMs;
  discovery.detectFromPort = async (...args) => {
    const started = performance.now();
    try { return await detect(...args); } finally { detectorMs = performance.now() - started; }
  };
  const { Delegate } = require(path.join(cliRoot, "lib/deploy/functions/runtimes/node/index.js"));
  const delegate = new Delegate("reservaeldia-7a440", root, discoverySource, "nodejs20");
  const firebase = { projectId: "reservaeldia-7a440", storageBucket: "reservaeldia-7a440.firebasestorage.app" };
  // The SDK's shutdown leaves a CLI kill timer. Observe completion, then exit.
  quitTimer = setTimeout(() => { if (child) child.kill(); process.exit(2); }, 45000);
  const started = performance.now();
  let result;
  try {
    const manifest = await delegate.discoverBuild({ firebase }, {
      FIREBASE_CONFIG: JSON.stringify(firebase), GCLOUD_PROJECT: firebase.projectId, GOOGLE_CLOUD_QUOTA_PROJECT: firebase.projectId,
    });
    assert.deepEqual(Object.keys(manifest.endpoints).sort(), expectedNames);
    fs.mkdirSync(path.join(evidence, "cli-manifests"), { recursive: true });
    fs.writeFileSync(path.join(evidence, "cli-manifests", codebase + ".json"), JSON.stringify(canonical(manifest), null, 2));
    assert.equal(guard.attempts.length, 0);
    assert.equal(errors.includes("LOCAL_NETWORK_BLOCKED"), false);
    result = { ok: true, detectorMs, totalMs: performance.now() - started, endpointCount: Object.keys(manifest.endpoints).length, codebase };
  } catch (error) {
    result = { ok: false, detectorMs, totalMs: performance.now() - started, timeout: /Timeout after 10000/.test(error.message) };
  }
  clearTimeout(quitTimer);
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}

function autonomy() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "reserva-payments-"));
  assert.ok(!directory.startsWith(root + path.sep));
  for (const name of ["package.json", "package-lock.json", "lib", "shared"]) {
    fs.cpSync(path.join(source, name), path.join(directory, name), { recursive: true });
  }
  const dependencies = materializeLocalDependencies(directory);
  const probe = spawnSync(process.execPath, ["-e", `
    const assert = require('node:assert/strict'), path = require('node:path');
    const Module = require('node:module'), net = require('node:net');
    let networkAttempts = 0;
    net.Socket.prototype.connect = () => { networkAttempts++; throw new Error('Network forbidden'); };
    globalThis.fetch = () => { networkAttempts++; throw new Error('Network forbidden'); };
    const boundary = process.cwd() + path.sep;
    const resolve = Module._resolveFilename;
    Module._resolveFilename = function(...args) {
      const file = resolve.apply(this, args);
      assert.ok(!path.isAbsolute(file) || file.startsWith(boundary), 'Runtime resolved outside isolated package');
      return file;
    };
    const api = require(process.cwd());
    assert.deepEqual(Object.keys(api).sort(), ${JSON.stringify(paymentNames)});
    for (const name of Object.keys(require('./package.json').dependencies)) require.resolve(name);
    // Exercise legitimate lazy/native modules without HTTP handlers or providers.
    const html = require('./lib/payments/publishedShareImage.js').preparePublishedShareImageHtml('<p>fixture</p>');
    assert.equal(html, '<html><head></head><body><p>fixture</p></body></html>');
    const sharp = require('sharp');
    sharp({ create: { width: 1, height: 1, channels: 4, background: '#fff' } }).png().toBuffer()
      .then(bytes => { assert.ok(bytes.length); assert.equal(networkAttempts, 0); console.log(JSON.stringify({ ok: true, node: process.version, resolvedOutsidePackage: 0, networkAttempts })); })
      .catch(() => process.exit(1));
  `], { cwd: directory, env: cleanEnv(), windowsHide: true, encoding: "utf8", timeout: 60000 });
  assert.equal(probe.error, undefined);
  assert.equal(probe.status, 0, probe.stderr || "Autonomous runtime failed");
  return { directory, dependencies, runtime: JSON.parse(probe.stdout) };
}

async function main() {
  const [mode, cliArgument, countArgument] = process.argv.slice(2);
  const codebase = mode.includes("default") ? "default" : "payments";
  fs.mkdirSync(evidence, { recursive: true });
  if (mode === "materialize") { console.log(JSON.stringify(materializeLocalDependencies(source))); return; }
  if (mode === "autonomy") {
    const result = autonomy(); fs.writeFileSync(path.join(evidence, "autonomy.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); return;
  }
  const cliRoot = path.resolve(cliArgument || "");
  assert.ok(fs.existsSync(path.join(cliRoot, "lib/deploy/functions/runtimes/node/index.js")), "Pass the installed firebase-tools directory");
  if (["discovery-child", "discovery-default-child"].includes(mode)) return discoveryChild(cliRoot, codebase);
  if (mode === "plan") {
    const result = assertPlan(cliRoot); fs.writeFileSync(path.join(evidence, "plan.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); return;
  }
  assert.ok(["discovery", "discovery-default"].includes(mode), "Usage: verifyPayments.cjs materialize|autonomy|plan|discovery|discovery-default [firebase-tools directory] [samples]");
  const count = Number(countArgument || 10); assert.ok(Number.isInteger(count) && count >= 10);
  const samples = [];
  for (let i = 0; i < count; i++) {
    const child = spawnSync(process.execPath, [__filename, mode + "-child", cliRoot], {
      cwd: root, env: cleanEnv(), windowsHide: true, encoding: "utf8", timeout: 60000,
    });
    const sample = child.error || !child.stdout.trim() ? { ok: false, processFailure: true } : JSON.parse(child.stdout);
    samples.push(sample); console.log(JSON.stringify({ sample: i + 1, ...sample }));
  }
  const times = samples.filter(s => s.ok).map(s => s.detectorMs).sort((a, b) => a - b);
  const median = times.length ? (times[Math.floor((times.length - 1) / 2)] + times[Math.floor(times.length / 2)]) / 2 : null;
  const report = canonical({ node: process.version, cliVersion: require(path.join(cliRoot, "package.json")).version, samples,
    summary: { count, successes: times.length, failures: samples.filter(s => !s.ok).length, timeouts: samples.filter(s => s.timeout).length,
      minMs: times[0] ?? null, medianMs: median, maxMs: times.at(-1) ?? null } });
  fs.writeFileSync(path.join(evidence, "discovery-" + codebase + ".json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary));
  assert.equal(report.summary.failures, 0, "Discovery had failures; inspect evidence");
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { materializeLocalDependencies, assertPlan };
