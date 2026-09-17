import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { initializeFirebaseServices } from "../../src/config/initializeFirebaseServices.js";
const require = createRequire(import.meta.url);
const contract = require("../../shared/firebaseEnvironment.cjs");
const { ROOT, cleanEnvironment, validateInheritedDestinations, removeSession } = require("./session.cjs");

test("local mode is the non-production default, with four coherent destinations", () => {
  const input = contract.localEnvironmentInput();
  const result = contract.resolveFirebaseEnvironment({ ...input, mode: undefined, nodeEnv: "development" });
  assert.equal(result.mode, "emulators");
  assert.equal(result.config.projectId, contract.LOCAL_PROJECT);
  assert.equal(result.config.storageBucket, contract.LOCAL_BUCKET);
  assert.equal(new URL(result.functionsBaseUrl).pathname, `/${contract.LOCAL_PROJECT}/us-central1`);
  assert.deepEqual(Object.keys(result.ports).sort(), ["auth", "firestore", "functions", "storage"]);
});

test("unknown, incomplete, partial or incompatible configuration fails closed", () => {
  const local = contract.localEnvironmentInput();
  for (const override of [{ mode: "functions-local" }, { mode: "typo" }, { mode: "prod" },
    { projectId: "reservaeldia-7a440" }, { bucket: "reservaeldia-7a440.firebasestorage.app" },
    { projectId: undefined }, { bucket: undefined }, { hostname: "reservaeldia.com.ar" }, { authDomain: "remote.example" }]) {
    assert.throws(() => contract.resolveFirebaseEnvironment({ ...local, ...override }));
  }
  for (const name of Object.keys(local.emulators)) {
    assert.throws(() => contract.resolveFirebaseEnvironment({ ...local, emulators: { ...local.emulators, [name]: undefined } }), new RegExp(name));
    assert.throws(() => contract.resolveFirebaseEnvironment({ ...local, emulators: { ...local.emulators, [name]: "remote.example:18080" } }), new RegExp(name));
  }
  assert.throws(() => contract.resolveFirebaseEnvironment(), /proyecto/);
});

test("production configuration preserves original values and makes no SDK calls", () => {
  const production = contract.resolveFirebaseEnvironment({ nodeEnv: "production" });
  assert.deepEqual(production.config, { ...contract.PRODUCTION_CONFIG, authDomain: "reservaeldia.com.ar" });
  assert.equal(production.functionsBaseUrl, "https://us-central1-reservaeldia-7a440.cloudfunctions.net");
  assert.equal(contract.resolveFirebaseEnvironment({ nodeEnv: "production", authDomain: "custom.example" }).config.authDomain, "custom.example");
  assert.throws(() => contract.resolveFirebaseEnvironment({ nodeEnv: "production", projectId: contract.LOCAL_PROJECT }));
  assert.throws(() => contract.resolveFirebaseEnvironment({ nodeEnv: "production", emulators: { auth: "127.0.0.1:19099" } }));
});

function fakeSdk() {
  const apps = [], events = [];
  const sdk = { getApps: () => apps, initializeApp: (options, name) => { const app = { options, name }; apps.push(app); events.push("app"); return app; } };
  for (const name of ["Auth", "Firestore", "Functions", "Storage"]) {
    sdk[`get${name}`] = () => { events.push(`get${name}`); return { name }; };
    sdk[`connect${name}Emulator`] = (...args) => events.push({ name: `connect${name}`, args });
  }
  return { sdk, apps, events };
}

test("services connect before being returned, once across HMR/server initialization", () => {
  const { sdk, events, apps } = fakeSdk();
  const environment = contract.resolveFirebaseEnvironment(contract.localEnvironmentInput());
  const result = initializeFirebaseServices(sdk, environment);
  const first = [...events];
  assert.deepEqual(first.map((event) => typeof event === "string" ? event : event.name), ["app", "getAuth", "connectAuth", "getFirestore", "connectFirestore", "getFunctions", "connectFunctions", "getStorage", "connectStorage"]);
  assert.equal(first[2].args[1], "http://127.0.0.1:19099");
  assert.deepEqual(first[4].args.slice(1), ["127.0.0.1", 18080]);
  assert.deepEqual(first[6].args.slice(1), ["127.0.0.1", 15001]);
  assert.deepEqual(first[8].args.slice(1), ["127.0.0.1", 19199]);
  assert.strictEqual(initializeFirebaseServices(sdk, environment), result);
  assert.equal(events.length, first.length);
  apps[0].options = { ...apps[0].options, storageBucket: "wrong" };
  assert.throws(() => initializeFirebaseServices(sdk, environment), /incompatible/);
});

test("production SDK initialization does not connect emulators (fake SDK only)", () => {
  const { sdk, events } = fakeSdk();
  initializeFirebaseServices(sdk, contract.resolveFirebaseEnvironment({ nodeEnv: "production" }));
  assert.deepEqual(events, ["app", "getAuth", "getFirestore", "getFunctions", "getStorage"]);
});

test("sensitive environment and personal configuration are not inherited", () => {
  const clean = cleanEnvironment("C:/synthetic-session", { PATH: "synthetic-path", GOOGLE_APPLICATION_CREDENTIALS: "do-not-inherit", FIREBASE_TOKEN: "do-not-inherit", OPENAI_API_KEY: "do-not-inherit", AWS_PROFILE: "do-not-inherit", NODE_OPTIONS: "--danger", HTTPS_PROXY: "do-not-inherit", ARBITRARY_NEW_PROVIDER_SECRET: "do-not-inherit", HOME: "personal" });
  for (const key of ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_TOKEN", "OPENAI_API_KEY", "AWS_PROFILE", "HTTPS_PROXY", "ARBITRARY_NEW_PROVIDER_SECRET"]) assert.equal(clean[key], undefined);
  assert.notEqual(clean.HOME, "personal");
  assert.match(clean.NODE_OPTIONS, /networkGuard/);
  assert.equal(clean.GCLOUD_PROJECT, contract.LOCAL_PROJECT);
  assert.equal(clean.FUNCTIONS_DISCOVERY_TIMEOUT, "60");
  assert.equal(cleanEnvironment("C:/synthetic-session", { FUNCTIONS_DISCOVERY_TIMEOUT: "999999" }).FUNCTIONS_DISCOVERY_TIMEOUT, "60");
});

test("launcher rejects explicit incompatible selections before starting processes", () => {
  validateInheritedDestinations({});
  for (const key of ["NEXT_PUBLIC_FIREBASE_MODE", "GCLOUD_PROJECT", "FIREBASE_STORAGE_BUCKET", "FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST", "STORAGE_EMULATOR_HOST", "FIREBASE_CONFIG"]) assert.throws(() => validateInheritedDestinations({ [key]: "synthetic-incompatible" }), new RegExp(key));
});

test("cleanup rejects foreign/live paths and does not follow dependency junctions", () => {
  const base = path.join(ROOT, ".local-isolation");
  fs.mkdirSync(base, { recursive: true });
  const session = fs.mkdtempSync(path.join(base, "session-cleanup-"));
  const dependency = fs.mkdtempSync(path.join(base, "dependency-sentinel-"));
  const marker = path.join(session, "session.json");
  fs.writeFileSync(path.join(dependency, "sentinel.txt"), "synthetic");
  fs.symlinkSync(dependency, path.join(session, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  fs.writeFileSync(marker, JSON.stringify({ owner: "reservaeldia-local", project: contract.LOCAL_PROJECT }));
  assert.throws(() => removeSession(ROOT), /fuera/);
  assert.throws(() => removeSession(session), /detención/);
  fs.writeFileSync(marker, JSON.stringify({ owner: "reservaeldia-local", project: contract.LOCAL_PROJECT, stopped: true }));
  removeSession(session);
  assert.equal(fs.readFileSync(path.join(dependency, "sentinel.txt"), "utf8"), "synthetic");
  fs.unlinkSync(path.join(dependency, "sentinel.txt"));
  fs.rmdirSync(dependency);
});

test("a cleanup permission failure preserves the ownership marker for safe retry", () => {
  const session = fs.mkdtempSync(path.join(ROOT, ".local-isolation", "session-cleanup-denied-"));
  const marker = path.join(session, "session.json");
  fs.writeFileSync(marker, JSON.stringify({ owner: "reservaeldia-local", project: contract.LOCAL_PROJECT, stopped: true }));
  fs.writeFileSync(path.join(session, "synthetic.txt"), "synthetic");
  const remove = fs.rmSync;
  try {
    fs.rmSync = () => { throw Object.assign(new Error("synthetic permission failure"), { code: "EPERM" }); };
    assert.throws(() => removeSession(session), /synthetic permission failure/);
    assert.equal(fs.existsSync(marker), true);
  } finally { fs.rmSync = remove; removeSession(session); }
});

test("endpoint identity checks reject production and a foreign local bucket/project", () => {
  for (const url of ["https://us-central1-reservaeldia-7a440.cloudfunctions.net/publicRsvpSubmit", "http://127.0.0.1:15001/other/us-central1/f", "http://127.0.0.1:19199/v0/b/production/o/file", "http://127.0.0.1:18080/v1/projects/other/databases/(default)"]) assert.throws(() => contract.assertLocalUrl(url));
  assert.equal(contract.assertLocalUrl(`http://127.0.0.1:19199/v0/b/${contract.LOCAL_BUCKET}/o/file`).hostname, "127.0.0.1");
});

test("network guard prevents fetch and socket effects before dispatch", () => {
  // Reserved .invalid hosts, plus the production URL rejected by the same guard.
  const script = `const assert=require('node:assert/strict'); const net=require('node:net'); let dispatched=0;
    global.fetch=async()=>{dispatched++;throw new Error('sentinel transport must not run')};
    net.Socket.prototype.connect=function(){dispatched++;throw new Error('sentinel socket must not run')};
    const guard=require('./scripts/local/networkGuard.cjs');
    assert.throws(()=>net.connect(443,'provider.invalid'),/LOCAL_NETWORK_BLOCKED/);
    fetch('https://us-central1-reservaeldia-7a440.cloudfunctions.net/publicRsvpSubmit').then(()=>process.exit(3), e=>{assert.match(e.message,/LOCAL_NETWORK_BLOCKED/);assert.equal(guard.attempts.length,2);assert.equal(dispatched,0);console.log('2 attempts blocked before dispatch')});`;
  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", env: { ...cleanEnvironment("C:/synthetic-session"), NODE_OPTIONS: "" } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 attempts blocked before dispatch/);
});
