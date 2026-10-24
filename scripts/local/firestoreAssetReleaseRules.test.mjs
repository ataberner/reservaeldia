import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, doc, collection, query, where, documentId,
  getDocFromServer, getDocsFromServer, setDoc, updateDoc, deleteDoc, terminate } from "firebase/firestore";
import { sha256, validateFirestoreAssetArtifact } from "./firestoreAssetReleaseArtifact.mjs";

const require = createRequire(import.meta.url);
const contract = require("../../shared/firebaseEnvironment.cjs");
const run = `firestore-assets-${randomUUID()}`;
const session = process.env.RESERVA_LOCAL_SESSION;
const actors = {
  anonymous: null, owner: { sub: `${run}-a` }, other: { sub: `${run}-b` },
  admin: { sub: `${run}-admin`, admin: true }, superadmin: { sub: `${run}-superadmin`, superadmin: true },
  roleAdmin: { sub: `${run}-role`, role: "admin" }, stringAdmin: { sub: `${run}-string`, admin: "true" },
  profileAdmin: { sub: `${run}-profile` },
};
const isAdmin = actor => ["admin", "superadmin", "roleAdmin"].includes(actor);
const clients = new Map(), documents = new Set(), results = [];
let adminApp, adminDb, artifact, infrastructureError;
let cleanupFailures = 0;

function client(actor) {
  if (clients.has(actor)) return clients.get(actor);
  const app = initializeApp({ projectId: contract.LOCAL_PROJECT, apiKey: "synthetic-only", authDomain: "localhost" }, `${run}-${actor}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 18080, actors[actor] ? { mockUserToken: actors[actor] } : undefined);
  assert.equal(db._settings.host, "127.0.0.1:18080");
  const result = { app, db }; clients.set(actor, result); return result;
}

before(async () => {
  try {
    assert.ok(session, "Use runStorageRelease.cjs --firestore-assets only");
    assert.equal(process.env.RESERVA_STORAGE_ARTIFACT_MODE, "firestore-assets");
    assert.equal(fs.realpathSync(process.cwd()), fs.realpathSync(path.join(session, "workspace")));
    const marker = JSON.parse(fs.readFileSync(path.join(session, "session.json")));
    assert.equal(marker.owner, "reservaeldia-storage-release"); assert.equal(marker.stopped, undefined);
    assert.equal(marker.project, contract.LOCAL_PROJECT); assert.equal(marker.mode, "firestore-assets");
    const manifest = JSON.parse(fs.readFileSync(path.join(session, "source-manifest.json")));
    for (const [file, hash] of Object.entries(manifest.sources)) assert.equal(sha256(fs.readFileSync(file)), hash, `Changed copied input: ${file}`);
    artifact = validateFirestoreAssetArtifact();
    assert.deepEqual(artifact, manifest.firestoreArtifact);
    const config = JSON.parse(fs.readFileSync("firebase.local.json"));
    assert.equal(config.firestore.rules, "deployment/render-asset-firestore/firestore.rules");
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
    const adminRequire = createRequire(path.resolve("functions/package.json"));
    const admin = adminRequire("firebase-admin");
    const credential = admin.credential.applicationDefault();
    credential.getAccessToken = async () => { throw new Error("ADC token request blocked in local mode"); };
    adminApp = admin.initializeApp({ projectId: contract.LOCAL_PROJECT, credential }, run);
    adminDb = adminApp.firestore();

    // Exercise the real editable own-profile path with the client SDK. These
    // fields must not confer any catalogue permission in the subsequent cases.
    const profile = `usuarios/${actors.profileAdmin.sub}`; documents.add(profile);
    const forged = { admin: true, superadmin: true, role: "admin", roles: ["admin"], tipo: "proveedor" };
    const profileRef = doc(client("profileAdmin").db, profile);
    await setDoc(profileRef, forged);
    assert.deepEqual((await getDocFromServer(profileRef)).data(), forged);
  } catch (error) { infrastructureError = error.code || error.name; throw error; }
});

async function execute({ number, namespace, nested, actor, operation, allow }) {
  const db = client(actor).db;
  const collectionPath = nested ? `${namespace}/${run}-parent/children` : namespace;
  const id = `${run}-${number}`;
  const resource = `${collectionPath}/${id}`;
  documents.add(resource);
  if (operation !== "create") await adminDb.doc(resource).set({ status: "processing", storagePath: `${namespace}/unapproved-${number}.svg` });
  let error;
  try {
    const target = doc(db, resource);
    if (operation === "get") assert.equal((await getDocFromServer(target)).exists(), true);
    else if (operation === "list") assert.equal((await getDocsFromServer(query(collection(db, collectionPath), where(documentId(), "==", id)))).size, 1);
    else if (operation === "delete") await deleteDoc(target);
    else if (operation === "create") await setDoc(target, { status: "active", storagePath: `${namespace}/unapproved-${number}.svg` });
    else await updateDoc(target, { status: "active", storagePath: `${namespace}/unapproved-${number}.svg` });
  } catch (caught) { error = caught; }
  await adminDb.doc(resource).delete(); documents.delete(resource);
  if (allow) assert.equal(error, undefined, `${namespace} ${actor} ${operation}: unexpected ${error?.code || error?.name}`);
  else { assert.ok(error, `${namespace} ${actor} ${operation}: unexpectedly allowed`); assert.equal(error.code, "permission-denied"); }
  results.push({ namespace, nested, actor, operation, allowed: allow });
}

let index = 0;
for (const namespace of ["iconos", "decoraciones"])
  for (const nested of [false, true])
    for (const actor of Object.keys(actors))
      for (const operation of ["get", "list", "create", "update", "delete"]) {
        const number = ++index;
        const read = ["get", "list"].includes(operation);
        const allow = read ? actor !== "anonymous" : !nested && isAdmin(actor);
        test(`firestore asset authority #${number} ${namespace} ${nested ? "descendant" : "root"} ${actor} ${operation}`, async () => {
          try { await execute({ number, namespace, nested, actor, operation, allow }); }
          catch (error) { results.push({ namespace, nested, actor, operation, failed: true, code: error.code || error.name }); throw error; }
        });
      }

after(async () => {
  if (adminDb) {
    const cleanup = await Promise.allSettled([...documents].map(resource => adminDb.doc(resource).delete()));
    cleanupFailures = cleanup.filter(result => result.status === "rejected").length;
  }
  const closed = await Promise.allSettled([...clients.values()].map(async ({ app, db }) => { await terminate(db); await deleteApp(app); }));
  cleanupFailures += closed.filter(result => result.status === "rejected").length;
  if (adminApp) await adminApp.delete();
  const blockedNetworkAttempts = require("./networkGuard.cjs").attempts.length;
  if (session && fs.existsSync(path.join(session, "session.json"))) fs.writeFileSync(path.join(session, "rules-results.json"), JSON.stringify({
    mode: "firestore-assets", artifact, project: contract.LOCAL_PROJECT, database: "(default)",
    expectedCases: index, passed: results.filter(result => !result.failed).length, failed: results.filter(result => result.failed).length,
    infrastructureError, cleanupFailures, blockedNetworkAttempts, results, finishedAt: new Date().toISOString(),
  }, null, 2));
  assert.equal(cleanupFailures, 0); assert.equal(blockedNetworkAttempts, 0);
});
