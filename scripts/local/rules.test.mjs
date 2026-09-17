import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, doc, collection, collectionGroup, query, where, orderBy, limit, startAfter, getDocFromServer,
  getDocsFromServer, setDoc, updateDoc, deleteDoc, deleteField, terminate } from "firebase/firestore";
import { getStorage, connectStorageEmulator, ref, uploadBytes, getBytes, list, deleteObject } from "firebase/storage";
import { cases, identities, authorities } from "./rulesCases.mjs";

const require = createRequire(import.meta.url);
const contract = require("../../shared/firebaseEnvironment.cjs");
const runId = `rules-${randomUUID()}`;
const replacements = { A: `${runId}-a`, B: `${runId}-b`, ADMIN: `${runId}-admin`, SUPER: `${runId}-server-super` };
const expand = (value, id) => JSON.parse(JSON.stringify(value).replace(/\{(A|B|ADMIN|SUPER|ID)\}/g,
  (_, key) => key === "ID" ? `${runId}-${id}` : replacements[key]));
const clients = new Map();
const results = [];
const infrastructure = [];
let admin, adminDb, bucket, adminHelpers, manifest, session;

function hash(file) { return createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function assertRulesCopy() {
  const config = JSON.parse(fs.readFileSync("firebase.local.json"));
  assert.equal(config.firestore.rules, "firestore.rules");
  assert.equal(config.storage.rules, "storage.rules");
  for (const file of ["firestore.rules", "storage.rules"]) assert.equal(hash(file), manifest.rules[file], `${file}: working-tree copy changed`);
  for (const [name, port] of Object.entries(contract.EMULATORS)) {
    assert.equal(config.emulators[name].host, contract.HOST);
    assert.equal(config.emulators[name].port, port);
  }
}
function client(identity) {
  if (clients.has(identity)) return clients.get(identity);
  const app = initializeApp({ projectId: contract.LOCAL_PROJECT, storageBucket: contract.LOCAL_BUCKET,
    apiKey: "synthetic-emulator-only", authDomain: "localhost" }, `${runId}-${identity}`);
  const db = getFirestore(app), storage = getStorage(app);
  const claims = expand(identities[identity], "identity");
  const options = claims ? { mockUserToken: claims } : undefined;
  // Official emulator mock tokens are evaluated as request.auth, not Admin bypass.
  connectFirestoreEmulator(db, contract.HOST, contract.EMULATORS.firestore, options);
  connectStorageEmulator(storage, contract.HOST, contract.EMULATORS.storage, options);
  storage.maxOperationRetryTime = 3000;
  storage.maxUploadRetryTime = 3000;
  assert.equal(db._settings.host, process.env.FIRESTORE_EMULATOR_HOST);
  assert.equal(storage.host, process.env.FIREBASE_STORAGE_EMULATOR_HOST);
  const result = { app, db, storage, claims };
  clients.set(identity, result);
  return result;
}

before(async () => {
  let preflightStep = "configuration";
  try {
    session = process.env.RESERVA_LOCAL_SESSION;
    assert.ok(session, "Run through npm run test:local:rules; no standalone/remote mode");
    assert.equal(path.resolve(process.cwd()), path.resolve(session, "workspace"));
    const marker = JSON.parse(fs.readFileSync(path.join(session, "session.json")));
    assert.equal(marker.owner, "reservaeldia-local");
    assert.equal(marker.stopped, undefined);
    manifest = JSON.parse(fs.readFileSync(path.join(session, "rules-source.json")));
    assert.equal(manifest.project, contract.LOCAL_PROJECT);
    assert.equal(manifest.bucket, contract.LOCAL_BUCKET);
    assertRulesCopy();
    // The existing validator checks all destinations and the credential-free HOME.
    const { localBackendEnvironment, ensureAdminApp } = require("../../functions/lib/firebaseAdmin.js");
    assert.equal(localBackendEnvironment().config.projectId, contract.LOCAL_PROJECT);
    const hub = await (await fetch("http://127.0.0.1:14400/emulators", { signal: AbortSignal.timeout(5000) })).json();
    for (const [name, port] of Object.entries(contract.EMULATORS)) assert.equal(hub[name].port, port);
    // Only disabled wrappers are probed; no business handler is invoked.
    for (const endpoint of ["getAdminAccess", "setAdminClaim", "publicRsvpSubmit",
      "listCountdownPresetsPublic", "saveCountdownPresetDraft", "publishCountdownPresetDraft", "listCountdownPresetVersionsAdmin"]) {
      preflightStep = `disabled-wrapper:${endpoint}`;
      const response = await fetch(`http://${process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST}/${contract.LOCAL_PROJECT}/${contract.REGION}/${endpoint}`, {
        // 5A clean installs can cold-start a Functions worker beyond 10s.
        // Same disabled-wrapper assertion, bounded wait, no automatic retry.
        method: "POST", headers: { "Content-Type": "application/json" }, body: '{"data":{}}', signal: AbortSignal.timeout(30000),
      });
      // Callable failed-precondition maps to HTTP 400; the HTTP wrapper uses 412.
      assert.equal(response.status, endpoint === "publicRsvpSubmit" ? 412 : 400, `${endpoint} must stay disabled`);
      const body = await response.json();
      if (endpoint !== "publicRsvpSubmit") assert.equal(body.error.status, "FAILED_PRECONDITION");
      assert.match(JSON.stringify(body), /LOCAL_FLOW_DISABLED/);
    }
    preflightStep = "admin-fixture-client";
    admin = ensureAdminApp();
    adminDb = admin.firestore();
    bucket = admin.storage().bucket();
    assert.equal(bucket.name, contract.LOCAL_BUCKET);
    adminHelpers = require("../../functions/lib/auth/adminAuth.js");
  } catch (error) {
    infrastructure.push({ stage: "preflight", step: preflightStep, code: error.code || error.name, name: error.name });
    throw error;
  }
});

async function evaluate(c, cl) {
  if (c.store === "backend-helper") {
    // Pure authorization helper characterization, explicitly NOT a Rules test.
    const previous = process.env.SUPERADMINS_UIDS;
    const previousRuntime = process.env.CLOUD_RUNTIME_CONFIG;
    process.env.SUPERADMINS_UIDS = replacements.SUPER;
    delete process.env.CLOUD_RUNTIME_CONFIG;
    try {
      return adminHelpers[c.resource]({ auth: cl.claims ? { uid: cl.claims.sub, token: cl.claims } : undefined });
    } finally {
      if (previous === undefined) delete process.env.SUPERADMINS_UIDS; else process.env.SUPERADMINS_UIDS = previous;
      if (previousRuntime === undefined) delete process.env.CLOUD_RUNTIME_CONFIG; else process.env.CLOUD_RUNTIME_CONFIG = previousRuntime;
    }
  }
  if (c.store === "storage") {
    const target = ref(cl.storage, c.resource);
    if (c.operation === "get") {
      const bytes = await getBytes(target);
      assert.equal(new Uint8Array(bytes).length, 8, "Must read seeded bytes, not an absent object");
      return;
    }
    if (c.operation === "list") {
      const result = await list(target);
      assert.ok(result.items.length + result.prefixes.length > 0, "Must observe a seeded listing");
      return;
    }
    if (c.operation === "delete") return deleteObject(target);
    return uploadBytes(target, new Uint8Array(c.byteLength || 8), { contentType: c.contentType || "image/png" });
  }
  if (c.operation === "list") {
    const source = c.queryType === "group" ? collectionGroup(cl.db, c.resource) : collection(cl.db, c.resource);
    const constraints = [...(c.filters || []).map(f => where(...f)), ...(c.order || []).map(f => orderBy(...f))];
    if (c.cursor) constraints.push(startAfter(...c.cursor));
    if (c.limit) constraints.push(limit(c.limit));
    const snapshot = await getDocsFromServer(query(source, ...constraints));
    assert.ok(snapshot.size > 0, "Must read a seeded query, not cache/empty success");
    if (c.expectedIds) assert.deepEqual(snapshot.docs.map(d => d.id), c.expectedIds, "Consumer query must return the intended page");
    return;
  }
  const target = doc(cl.db, c.resource);
  if (c.operation === "get") { assert.equal((await getDocFromServer(target)).exists(), true); return; }
  if (c.operation === "delete") return deleteDoc(target);
  if (c.operation === "removeOwner") return updateDoc(target, { userId: deleteField() });
  const data = c.payload || (c.operation === "create" ? c.data || { userId: replacements.A, marker: "synthetic-4b1" } : { marker: "synthetic-update" });
  return ["create", "replace"].includes(c.operation) ? setDoc(target, data) : updateDoc(target, data);
}

async function fixture(c) {
  const documents = new Set(), objects = new Set();
  async function cleanup() {
    // Exact paths only: never clearFirestore, bucket-wide deletion, or Auth reset.
    const settled = await Promise.allSettled([
      ...[...objects].map(p => bucket.file(p).delete({ ignoreNotFound: true })),
      ...[...documents].map(p => adminDb.doc(p).delete()),
    ]);
    const failures = settled.filter(r => r.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map(r => r.reason), "Synthetic fixture cleanup failed");
  }
  try {
    for (const f of c.fixtures || []) { documents.add(f.path); await adminDb.doc(f.path).set(f.data); }
    if (c.store === "firestore" && c.operation !== "list") {
      documents.add(c.resource);
      if (c.operation !== "create") await adminDb.doc(c.resource).set(c.data || { userId: replacements.A, marker: "synthetic-4b1" });
    }
    if (c.store === "storage") {
      const object = c.objectFixture || c.resource;
      objects.add(object);
      if (c.operation !== "create") await bucket.file(object).save(Buffer.alloc(8), { resumable: false, metadata: { contentType: "image/png" } });
    }
    return cleanup;
  } catch (error) { await cleanup(); throw error; }
}

for (const entry of cases) test(`${entry.group}: ${entry.id}`, { timeout: 25000 }, async () => {
  const c = expand(entry, entry.id);
  const row = { ...entry, resource: c.resource, authority: authorities[entry.authority],
    syntheticIdentity: entry.identity === "anonymous" ? null : expand(identities[entry.identity], entry.id),
    observed: "not-executed", classification: "error de infraestructura" };
  // Do not retain seed/payload contents in the result; test source owns fixtures.
  for (const key of ["data", "fixtures", "payload", "objectFixture", "byteLength"]) delete row[key];
  results.push(row);
  let cleanup;
  try {
    cleanup = await fixture(c);
    const cl = client(entry.identity);
    let timer;
    try {
      await Promise.race([Promise.resolve().then(() => evaluate(c, cl)), new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("Operation timed out"), { code: "infra/timeout" })), 15000);
      })]);
      row.observed = "allow";
    } catch (error) {
      if (!["permission-denied", "storage/unauthorized"].includes(error.code)) throw error;
      row.observed = "deny";
      row.errorCode = error.code;
    } finally { clearTimeout(timer); }
    row.matchesExpected = row.observed === c.expected;
    row.classification = c.group === "acceptance" ? (row.matchesExpected ? "cumple" : "vulnera")
      : "pendiente de política";
    // Proposed policy has no normative assert yet; infrastructure must still fail.
    if (c.group !== "proposal") assert.equal(row.observed, c.expected, `${c.id}: ${row.authority}`);
  } catch (error) {
    if (row.observed === "not-executed") {
      row.observed = "infrastructure-error";
      row.errorCode = error.code || error.name;
    }
    throw error;
  } finally {
    if (cleanup) try { await cleanup(); } catch (error) {
      infrastructure.push({ stage: "cleanup", case: c.id, code: error.code || error.name });
      throw error;
    }
  }
});

after(async () => {
  try {
    if (manifest) assertRulesCopy();
    for (const cl of clients.values()) { await terminate(cl.db); await deleteApp(cl.app); }
    if (admin) await admin.delete();
  } catch (error) {
    infrastructure.push({ stage: "teardown", code: error.code || error.name });
    throw error;
  } finally {
    if (session) {
      const report = { schemaVersion: 1, runId, checkedAt: new Date().toISOString(), source: manifest,
        method: "Firebase client SDK mockUserToken; Admin used only for exact synthetic fixture setup/cleanup",
        planned: cases.length, executed: results.length, infrastructure,
        summary: Object.fromEntries(["acceptance", "characterization", "proposal"].map(group => {
          const rows = results.filter(r => r.group === group);
          return [group, { total: rows.length, matches: rows.filter(r => r.matchesExpected === true).length,
            differs: rows.filter(r => r.matchesExpected === false).length, infrastructureErrors: rows.filter(r => r.observed === "infrastructure-error").length }];
        })), results };
      fs.writeFileSync(path.join(session, "rules-evidence.json"), JSON.stringify(report, null, 2));
      console.log(`Rules evidence: ${path.join(session, "rules-evidence.json")}`);
      console.log(JSON.stringify(report.summary));
    }
  }
});
