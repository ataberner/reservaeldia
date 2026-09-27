// Offline verification: real CLI discovery, isolated package and pure deployment planner.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { canonical } = require('../testUtils/paymentsManifest.cjs');
const { emailNames, smokeNames } = require('../testUtils/emailManifest.cjs');
const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'functions-email');
const evidence = path.join(root, '.local-isolation/email-codebase');
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC)$/i.test(key)));
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

async function discoveryChild(cliRoot, codebase) {
  const discoverySource = path.join(root, codebase === "default" ? "functions" : "functions-" + codebase);
  const expectedNames = require("../testUtils/functionOwnership.cjs").namesFor(codebase);
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
      FIREBASE_CONFIG: JSON.stringify(firebase), GCLOUD_PROJECT: firebase.projectId, GOOGLE_CLOUD_QUOTA_PROJECT: firebase.projectId, EMAIL_MODE: "sandbox", WELCOME_EMAIL_ACTIVATION_AT: "",
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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "reserva-email-"));
  assert.ok(!directory.startsWith(root + path.sep));
  for (const name of ["package.json", "package-lock.json", "lib", "shared"]) {
    fs.cpSync(path.join(source, name), path.join(directory, name), { recursive: true });
  }
  const dependencies = materializeLocalDependencies(directory);
  const probe = spawnSync(process.execPath, ["-e", `
    const assert = require('node:assert/strict'), path = require('node:path');
    const Module = require('node:module'), net = require('node:net');
    let networkAttempts = 0, sends = 0;
    net.Socket.prototype.connect = () => { networkAttempts++; throw new Error('Network forbidden'); };
    globalThis.fetch = () => { networkAttempts++; throw new Error('Network forbidden'); };
    const boundary = process.cwd() + path.sep, resolve = Module._resolveFilename;
    Module._resolveFilename = function(...args) {
      const file = resolve.apply(this, args);
      assert.ok(!path.isAbsolute(file) || file.startsWith(boundary), 'Runtime resolved outside isolated package');
      return file;
    };
    const { SecretParam } = require('./node_modules/firebase-functions/lib/params/types.js');
    SecretParam.prototype.value = () => { throw new Error('Secret read forbidden'); };
    assert.deepEqual(Object.keys(require(process.cwd())).sort(), ${JSON.stringify(emailNames)});
    for (const name of Object.keys(require('./package.json').dependencies)) require.resolve(name);
    const { renderEmail } = require('./lib/emails/renderEmail.js');
    const { createWelcomeRegistrationProcessor } = require('./lib/emails/welcomeRegistration.js');
    const { createNewUserNotificationProcessor } = require('./lib/emails/newUserNotification.js');
    const { createRegistrationEmailsProcessor } = require('./lib/emails/registrationEmails.js');
    const { createWelcomeRegistrationHandler } = require('./lib/emails/welcomeRegistrationFunction.js');
    (async () => {
      for (const request of [{template:'test',data:{}}, {template:'welcome',data:{dashboardUrl:'https://reservaeldia.com.ar/dashboard'}},
        {template:'newUserNotification',data:{registrationMethod:'unavailable'}}]) {
        const rendered = await renderEmail(request);
        assert.ok(rendered.html && rendered.text && rendered.subject);
      }
      const records = new Map();
      const dependencies = template => ({getMode:()=> 'sandbox', isSuperAdmin:()=>false,
        send:async()=>{sends++; throw Error('Sender forbidden');},
        store:{reserve:async(uid,record)=>{const key=template+'/'+uid; if(records.has(key)) return false; records.set(key,record); return true;}, complete:async()=>{throw Error('Unexpected write');}}});
      const processor = createRegistrationEmailsProcessor({
        welcome:createWelcomeRegistrationProcessor(dependencies('welcome')),
        internal:createNewUserNotificationProcessor(dependencies('newUserNotification'))});
      const handler = createWelcomeRegistrationHandler(processor);
      const user = {uid:'synthetic-package-check',email:'synthetic@example.invalid',disabled:false,metadata:{creationTime:new Date().toUTCString()}};
      await Promise.all([handler(user,{eventId:'fixture-event'}),handler(user,{eventId:'fixture-event'})]);
      assert.equal(records.size,2);
      for (const delivery of records.values()) {
        assert.equal(delivery.status,'skipped'); assert.equal(delivery.attempts,0);
        assert.equal(delivery.skipReason,'EMAIL_SANDBOX_BUSINESS_BLOCKED');
      }
      assert.equal(networkAttempts,0); assert.equal(sends,0);
      console.log(JSON.stringify({ok:true,node:process.version,resolvedOutsidePackage:0,networkAttempts,sends,templates:3}));
    })().catch(error=>{console.error(error.message);process.exitCode=1;});
  `], { cwd: directory, env: cleanEnv(), windowsHide: true, encoding: "utf8", timeout: 60000 });
  assert.equal(probe.error, undefined);
  assert.equal(probe.status, 0, probe.stderr || "Autonomous runtime failed");
  return { directory, dependencies, runtime: JSON.parse(probe.stdout) };
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
  const remote = require("../../docs/operations/baselines/email-remote-2026-09-25.json");
  assert.equal(remote.authTriggerExists, false);
  const endpoints = codebase => {
    const wire = JSON.parse(fs.readFileSync(path.join(evidence, "manifests", codebase + ".json"), "utf8"));
    const resolved = build.toBackend(converter.buildFromV1Alpha1(wire, remote.project, "us-central1", "nodejs20"), {});
    resolveCpuAndConcurrency(resolved);
    return backend.allEndpoints(resolved).map(endpoint => ({ ...endpoint, codebase }));
  };
  const core = endpoints("default"), payments = endpoints("payments"), email = endpoints("email");
  assert.equal(core.length, 101); assert.equal(payments.length, 3);
  assert.deepEqual(email.map(e => e.id).sort(), emailNames);
  let state = [...core, ...payments, ...remote.functions.map(fn => gcf.endpointFromFunction(fn))];
  const simulate = (codebase, name, configuration, existing) => {
    const want = email.map(e => ({ ...e, codebase }));
    const selector = `functions:${codebase}:${name}`;
    const filters = helper.getEndpointFilters({ only: selector });
    assert.deepEqual(helper.targetCodebases(configuration, filters), [codebase]);
    const grouped = helper.groupEndpointsByCodebase({ [codebase]: backend.of(...want) }, existing);
    const plan = Object.values(planner.createDeploymentPlan({ wantBackend: backend.of(...want), haveBackend: grouped[codebase], codebase, filters, deleteAll: false }));
    return { selector,
      updates: plan.flatMap(c => c.endpointsToUpdate).map(e => e.endpoint.id),
      creates: plan.flatMap(c => c.endpointsToCreate).map(e => e.id),
      deletes: plan.flatMap(c => c.endpointsToDelete).map(e => e.id),
      recreates: plan.flatMap(c => c.endpointsToUpdate).filter(e => e.deleteAndRecreate).length };
  };
  const forward = [], rollback = [];
  for (const name of [...smokeNames, "onUserCreatedWelcomeEmail"]) {
    const result = simulate("email", name, require("../../firebase.json").functions, state);
    assert.deepEqual(result.updates, smokeNames.includes(name) ? [name] : []);
    assert.deepEqual(result.creates, smokeNames.includes(name) ? [] : [name]);
    assert.deepEqual(result.deletes, []); assert.equal(result.recreates, 0);
    forward.push(result);
    state = [...state.filter(e => e.id !== name), email.find(e => e.id === name)];
    // Test rollback at each partial migration, keeping every other endpoint untouched.
    for (const moved of smokeNames.filter(n => state.find(e => e.id === n)?.codebase === "email")) {
      const reverse = simulate("default", moved, require("../../firebase.email-rollback.json").functions, state);
      assert.deepEqual(reverse.updates, [moved]); assert.deepEqual(reverse.creates, []);
      assert.deepEqual(reverse.deletes, []); assert.equal(reverse.recreates, 0);
      rollback.push({ after: name, ...reverse });
    }
  }
  assert.equal(guard.attempts.length, 0);
  return { cliVersion: "14.4.0", forward, rollback, untouched: 104, remoteMetadataCapturedAt: remote.capturedAt,
    limitation: "Only email smoke metadata and Auth absence were remotely verified. Other endpoint existence and intermediate ownership are simulated. No deploy, provider call, Secret resolution or IAM mutation." };
}

async function main() {
  const [mode, argument, cliArgument, countArgument] = process.argv.slice(2);
  fs.mkdirSync(evidence, { recursive: true });
  if (mode === "materialize") { console.log(JSON.stringify(materializeLocalDependencies(source))); return; }
  if (mode === "autonomy") {
    const result = autonomy(); fs.writeFileSync(path.join(evidence, "autonomy.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); return;
  }
  if (mode === "plan") {
    const result = assertPlan(path.resolve(argument)); fs.writeFileSync(path.join(evidence, "plan.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); return;
  }
  const codebase = argument, cliRoot = path.resolve(cliArgument || "");
  assert.ok(["email", "default", "payments"].includes(codebase));
  assert.ok(fs.existsSync(path.join(cliRoot, "lib/deploy/functions/runtimes/node/index.js")), "Pass installed firebase-tools directory");
  if (mode === "discovery-child") return discoveryChild(cliRoot, codebase);
  assert.equal(mode, "discovery", "Usage: materialize|autonomy|plan CLI|discovery CODEBASE CLI [count]");
  const count = Number(countArgument || 10); assert.ok(Number.isInteger(count) && count >= (codebase === "email" ? 10 : 1));
  const samples = [];
  for (let i = 0; i < count; i++) {
    const child = spawnSync(process.execPath, [__filename, "discovery-child", codebase, cliRoot], {
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

