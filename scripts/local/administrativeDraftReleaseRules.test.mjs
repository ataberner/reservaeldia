import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, doc, getDocFromServer, setDoc, updateDoc, deleteDoc, terminate } from "firebase/firestore";
import { cases, identities } from "./rulesCases.mjs";

const require = createRequire(import.meta.url);
const artifactHelper = require("./administrativeDraftReleaseArtifact.cjs");
const contract = require("../../shared/firebaseEnvironment.cjs");
const run = `ad1-release-${randomUUID()}`;
const replacements = { A: `${run}-a`, B: `${run}-b`, ADMIN: `${run}-admin`, SUPER: `${run}-server-super` };
const expand = (value, id) => JSON.parse(JSON.stringify(value).replace(/\{(A|B|ADMIN|SUPER|ID)\}/g, (_, key) => key === "ID" ? `${run}-${id}` : replacements[key]));
const matrix = cases.filter(row => row.id.startsWith("admin-draft-"));
assert.equal(matrix.length, 48, "Review changes to the shared AD1 matrix explicitly");
for (const row of matrix) assert.equal(row.store, "firestore");
const checks = [...matrix];
for (const namespace of ["iconos", "decoraciones"]) {
  for (const [operation, expected] of [["get", "allow"], ["update", "deny"]]) checks.push({
    id: `preserved-${namespace}-${operation}`, identity: "A", resource: `${namespace}/{ID}`, operation, expected,
    data: { status: "active" }, payload: { status: "archived" },
  });
}
for (const identity of ["A", "admin", "superclaim"]) {
  for (const nested of [false, true]) checks.push({ id: `preserved-provider-${identity}-${nested}`, identity,
    resource: nested ? "proveedores/{ID}/private/detail" : "proveedores/{ID}", operation: "get", expected: "deny", data: { nombre: "Synthetic" } });
}
for (const [operation, expected] of [["create", "allow"], ["get", "allow"], ["update", "allow"]]) checks.push({
  id: `preserved-owner-unmanaged-${operation}`, identity: "A", resource: "borradores/{ID}", operation, expected,
  data: { userId: "{A}", nombre: "Unmanaged synthetic draft" }, payload: { userId: "{A}", nombre: "Own synthetic edit" },
});
checks.push({ id: "anonymous-draft-read", identity: "anonymous", resource: "borradores/{ID}", operation: "get", expected: "deny", data: { userId: "{A}" } });

const session = process.env.RESERVA_LOCAL_SESSION;
const clients = new Map(), documents = new Set(), results = [];
let adminApp, adminDb, artifact, infrastructureError;
let cleanupFailures = 0;
function client(identity) {
  if (clients.has(identity)) return clients.get(identity);
  const app = initializeApp({ projectId: contract.LOCAL_PROJECT, apiKey: "synthetic-only", authDomain: "localhost" }, `${run}-${identity}`);
  const db = getFirestore(app), claims = expand(identities[identity], "identity");
  connectFirestoreEmulator(db, "127.0.0.1", 18080, claims ? { mockUserToken: claims } : undefined);
  assert.equal(db._settings.host, "127.0.0.1:18080");
  const value = { app, db }; clients.set(identity, value); return value;
}
before(async () => {
  try {
    assert.ok(session, "Use runStorageRelease.cjs --administrative-drafts only");
    assert.equal(process.env.RESERVA_STORAGE_ARTIFACT_MODE, "administrative-drafts");
    assert.equal(fs.realpathSync(process.cwd()), fs.realpathSync(path.join(session, "workspace")));
    const marker = JSON.parse(fs.readFileSync(path.join(session, "session.json")));
    assert.equal(marker.owner, "reservaeldia-storage-release"); assert.equal(marker.stopped, undefined);
    assert.equal(marker.project, contract.LOCAL_PROJECT); assert.equal(marker.mode, "administrative-drafts");
    const manifest = JSON.parse(fs.readFileSync(path.join(session, "source-manifest.json")));
    for (const [file, hash] of Object.entries(manifest.sources)) assert.equal(artifactHelper.hash(fs.readFileSync(file)), hash, `Changed copied input: ${file}`);
    artifact = artifactHelper.check();
    assert.deepEqual(artifact, manifest.firestoreArtifact);
    const config = JSON.parse(fs.readFileSync("firebase.local.json"));
    assert.equal(config.firestore.rules, "deployment/administrative-drafts/firestore.rules");
    assert.equal(config.functions, undefined); assert.equal(config.hosting, undefined);
    for (const [key, value] of Object.entries({ GCLOUD_PROJECT: contract.LOCAL_PROJECT, GOOGLE_CLOUD_PROJECT: contract.LOCAL_PROJECT,
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:18080", FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:19199",
      RESERVA_FIREBASE_MODE: "emulators", EMAIL_MODE: "disabled", METADATA_SERVER_DETECTION: "none" })) assert.equal(process.env[key], value);
    assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined); assert.equal(process.env.FIREBASE_TOKEN, undefined);
    assert.equal(path.resolve(process.env.HOME), path.resolve(session, "home"));
    assert.ok(process.env.NODE_OPTIONS.includes("networkGuard.cjs"));
    const hub = await (await fetch("http://127.0.0.1:14400/emulators", { signal: AbortSignal.timeout(5000) })).json();
    assert.equal(hub.firestore.port, 18080); assert.equal(hub.storage.port, 19199);
    assert.equal(hub.functions, undefined); assert.equal(hub.auth, undefined);
    const admin = createRequire(path.resolve("functions/package.json"))("firebase-admin");
    const credential = admin.credential.applicationDefault();
    credential.getAccessToken = async () => { throw new Error("ADC token request blocked in local mode"); };
    adminApp = admin.initializeApp({ projectId: contract.LOCAL_PROJECT, credential }, run);
    adminDb = adminApp.firestore();
  } catch (error) { infrastructureError = error.code || error.name; throw error; }
});

for (const row of checks) test(`AD1 release: ${row.id}`, async () => {
  const current = expand(row, row.id);
  const ownPaths = new Set();
  try {
    for (const fixture of current.fixtures || []) { ownPaths.add(fixture.path); documents.add(fixture.path); await adminDb.doc(fixture.path).set(fixture.data); }
    ownPaths.add(current.resource); documents.add(current.resource);
    if (current.operation !== "create") await adminDb.doc(current.resource).set(current.data || { userId: replacements.A });
    let error;
    try {
      const target = doc(client(current.identity).db, current.resource);
      const payload = current.payload || { marker: "synthetic-update" };
      if (current.operation === "get") assert.equal((await getDocFromServer(target)).exists(), true);
      else if (current.operation === "delete") await deleteDoc(target);
      else if (["create", "replace"].includes(current.operation)) await setDoc(target, payload);
      else if (current.operation === "update") await updateDoc(target, payload);
      else throw new Error("Unexpected shared-matrix operation");
    } catch (caught) { error = caught; }
    if (current.expected === "allow") assert.equal(error, undefined, `${current.id}: unexpected ${error?.code || error?.name}`);
    else { assert.ok(error, `${current.id}: unexpectedly allowed`); assert.equal(error.code, "permission-denied"); }
    results.push({ id: current.id, expected: current.expected, passed: true });
  } catch (error) { results.push({ id: current.id, failed: true, code: error.code || error.name }); throw error; }
  finally {
    const cleaned = await Promise.allSettled([...ownPaths].map(resource => adminDb.doc(resource).delete()));
    const failures = cleaned.filter(result => result.status === "rejected").length;
    cleanupFailures += failures;
    if (!failures) for (const resource of ownPaths) documents.delete(resource);
    assert.equal(failures, 0, "Exact synthetic fixture cleanup failed");
  }
});

after(async () => {
  if (adminDb) {
    const cleanup = await Promise.allSettled([...documents].map(resource => adminDb.doc(resource).delete()));
    cleanupFailures += cleanup.filter(result => result.status === "rejected").length;
  }
  const closed = await Promise.allSettled([...clients.values()].map(async ({ app, db }) => { await terminate(db); await deleteApp(app); }));
  cleanupFailures += closed.filter(result => result.status === "rejected").length;
  if (adminApp) await adminApp.delete();
  const blockedNetworkAttempts = require("./networkGuard.cjs").attempts.length;
  if (session && fs.existsSync(path.join(session, "session.json"))) fs.writeFileSync(path.join(session, "rules-results.json"), JSON.stringify({
    mode: "administrative-drafts", artifact, project: contract.LOCAL_PROJECT, database: "(default)", expectedCases: checks.length,
    passed: results.filter(result => !result.failed).length, failed: results.filter(result => result.failed).length,
    infrastructureError, cleanupFailures, blockedNetworkAttempts, results, finishedAt: new Date().toISOString(),
  }, null, 2));
  assert.equal(cleanupFailures, 0); assert.equal(blockedNetworkAttempts, 0);
});
