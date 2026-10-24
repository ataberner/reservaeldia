import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase/app";
import { getStorage, connectStorageEmulator, ref, getBytes, list, uploadBytes, deleteObject } from "firebase/storage";
import { sha256, validateArtifact } from "./storageReleaseArtifact.mjs";

const require = createRequire(import.meta.url);
const contract = require("../../shared/firebaseEnvironment.cjs");
const mode = process.env.RESERVA_STORAGE_ARTIFACT_MODE;
const candidate = mode === "candidate";
const run = `storage-release-${randomUUID()}`;
const session = process.env.RESERVA_LOCAL_SESSION;
const actors = {
  anonymous: null, owner: { sub: `${run}-a` }, other: { sub: `${run}-b` },
  admin: { sub: `${run}-admin`, admin: true }, superadmin: { sub: `${run}-superadmin`, superadmin: true },
  roleAdmin: { sub: `${run}-role`, role: "admin" }, stringAdmin: { sub: `${run}-string`, admin: "true" },
  profileAdmin: { sub: `${run}-profile` },
};
const isAdmin = actor => ["admin", "superadmin", "roleAdmin"].includes(actor);
const clients = new Map(), objects = new Set(), documents = new Set(), results = [];
let adminApp, db, bucket, infrastructureError, artifact;
let cleanupFailures = 0;

function client(actor) {
  if (clients.has(actor)) return clients.get(actor);
  const app = initializeApp({ projectId: contract.LOCAL_PROJECT, storageBucket: contract.LOCAL_BUCKET, apiKey: "synthetic-only", authDomain: "localhost" }, `${run}-${actor}`);
  const storage = getStorage(app);
  connectStorageEmulator(storage, "127.0.0.1", 19199, actors[actor] ? { mockUserToken: actors[actor] } : undefined);
  storage.maxOperationRetryTime = 2000; storage.maxUploadRetryTime = 2000;
  assert.equal(storage.host, "127.0.0.1:19199");
  const result = { app, storage }; clients.set(actor, result); return result;
}

before(async () => {
  try {
    assert.ok(session, "Use runStorageRelease.cjs only");
    assert.ok(["base", "candidate"].includes(mode));
    assert.equal(fs.realpathSync(process.cwd()), fs.realpathSync(path.join(session, "workspace")));
    const marker = JSON.parse(fs.readFileSync(path.join(session, "session.json")));
    assert.equal(marker.owner, "reservaeldia-storage-release"); assert.equal(marker.stopped, undefined);
    assert.equal(marker.project, contract.LOCAL_PROJECT); assert.equal(marker.bucket, contract.LOCAL_BUCKET); assert.equal(marker.mode, mode);
    const manifest = JSON.parse(fs.readFileSync(path.join(session, "source-manifest.json")));
    for (const [file, hash] of Object.entries(manifest.sources)) assert.equal(sha256(fs.readFileSync(file)), hash, `Changed copied input: ${file}`);
    artifact = validateArtifact();
    assert.deepEqual(artifact, manifest.artifact);
    const config = JSON.parse(fs.readFileSync("firebase.local.json"));
    assert.equal(config.storage.rules, `deployment/storage-draft-provider/${candidate ? "storage.rules" : "base.rules"}`);
    assert.equal(config.functions, undefined); assert.equal(config.hosting, undefined);
    for (const [key, value] of Object.entries({ GCLOUD_PROJECT: contract.LOCAL_PROJECT, GOOGLE_CLOUD_PROJECT: contract.LOCAL_PROJECT,
      FIREBASE_STORAGE_BUCKET: contract.LOCAL_BUCKET, FIRESTORE_EMULATOR_HOST: "127.0.0.1:18080", FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:19199",
      RESERVA_FIREBASE_MODE: "emulators", EMAIL_MODE: "disabled" })) assert.equal(process.env[key], value);
    assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined); assert.equal(process.env.FIREBASE_TOKEN, undefined);
    assert.equal(process.env.METADATA_SERVER_DETECTION, "none");
    assert.equal(path.resolve(process.env.HOME), path.resolve(session, "home"));
    assert.ok(process.env.NODE_OPTIONS.includes("networkGuard.cjs"));
    const hub = await (await fetch("http://127.0.0.1:14400/emulators", { signal: AbortSignal.timeout(5000) })).json();
    assert.equal(hub.firestore.port, 18080); assert.equal(hub.storage.port, 19199); assert.equal(hub.functions, undefined); assert.equal(hub.auth, undefined);
    const adminRequire = createRequire(path.resolve("functions/package.json"));
    const admin = adminRequire("firebase-admin");
    // Same Admin 13 type requirement as functions/src/firebaseAdmin.ts. No token
    // acquisition is allowed; both transports use the exact emulator endpoints.
    const credential = admin.credential.applicationDefault();
    credential.getAccessToken = async () => { throw new Error("ADC token request blocked in local mode"); };
    adminApp = admin.initializeApp({ projectId: contract.LOCAL_PROJECT, storageBucket: contract.LOCAL_BUCKET,
      credential }, run);
    db = adminApp.firestore(); bucket = adminApp.storage().bucket();
    assert.equal(bucket.name, contract.LOCAL_BUCKET);
    for (const [id, data] of [
      [`${run}-public`, { estado: "publicado", activo: true, visible: true }],
      [`${run}-private`, { estado: "importado", activo: true, visible: false }],
      [`${run}-inactive`, { estado: "publicado", activo: false, visible: true }],
      [`${run}-hidden`, { estado: "publicado", activo: true, visible: false }],
    ]) { const p = `proveedores/${id}`; documents.add(p); await db.doc(p).set(data); }
    const profile = `usuarios/${actors.profileAdmin.sub}`; documents.add(profile);
    await db.doc(profile).set({ admin: true, superadmin: true, role: "admin", roles: ["admin"], tipo: "proveedor" });
    for (const id of ["own", "foreign"]) { const p = `borradores/${run}-${id}`; documents.add(p); await db.doc(p).set({ userId: actors[id === "own" ? "owner" : "other"].sub }); }
  } catch (error) { infrastructureError = error.code || error.name; throw error; }
});

async function execute({ actor, operation, resource, allow, bytes = 8, contentType = "image/png", category }) {
  const storage = client(actor).storage;
  const object = operation === "list" ? `${resource}/seed.png` : resource;
  objects.add(object);
  if (operation !== "create") await bucket.file(object).save(Buffer.alloc(8), { resumable: false, metadata: { contentType: "image/png" } });
  let error;
  try {
    const target = ref(storage, resource);
    if (operation === "get") assert.equal((await getBytes(target)).byteLength, 8);
    else if (operation === "list") { const found = await list(target); assert.ok(found.items.length + found.prefixes.length > 0); }
    else if (operation === "delete") await deleteObject(target);
    else await uploadBytes(target, new Uint8Array(bytes), { contentType });
  } catch (caught) { error = caught; }
  // Cleanup each target before the next case so create really is a create.
  await bucket.file(object).delete({ ignoreNotFound: true }); objects.delete(object);
  if (allow) assert.equal(error, undefined, `${actor} ${operation}: unexpected ${error?.code || error?.name}`);
  else { assert.ok(error, `${actor} ${operation}: unexpectedly allowed`); assert.equal(error.code, "storage/unauthorized"); }
  results.push({ category, actor, operation, allowed: allow });
}
let index = 0;
function add(category, actor, operation, resource, allow, options = {}) {
  const number = ++index;
  test(`${mode}: ${category} #${number} ${actor} ${operation}`, async () => {
    try { await execute({ actor, operation, resource, allow, category, ...options }); }
    catch (error) { results.push({ category, actor, operation, failed: true, code: error.code || error.name }); throw error; }
  });
}

// Includes objects whose exact names are prefixes. v2 recursive wildcards match
// zero segments; denial in one match cannot override an allowing fallback.
for (const actor of ["anonymous", "owner", "other", "admin"]) {
  for (const resource of ["borradores", `borradores/${run}-own`, `borradores/${run}-foreign/index.html`])
    for (const operation of ["get", "create", "update", "delete", "list"])
      add("draft boundary", actor, operation, resource, !candidate && actor !== "anonymous");
}
for (const actor of ["superadmin", "roleAdmin", "profileAdmin"])
  add("draft boundary", actor, "get", `borradores/${run}-own/index.html`, !candidate);

for (const actor of Object.keys(actors)) {
  for (const folder of ["portada", "galeria"]) {
    const filename = folder === "portada" ? "portada-original.png" : "foto.png";
    for (const status of ["public", "private"])
      add("provider read", actor, "get", `proveedores/${run}-${status}/${folder}/${filename}`, isAdmin(actor) || (!candidate && status === "public"));
    for (const operation of ["create", "update", "delete"])
      add("provider write unchanged", actor, operation, `proveedores/${run}-public/${folder}/${filename}`, isAdmin(actor));
  }
}
for (const status of ["inactive", "hidden", "missing"])
  add("provider tuple", "anonymous", "get", `proveedores/${run}-${status}/galeria/foto.png`, false);
for (const actor of ["anonymous", "owner", "admin"])
  for (const resource of ["proveedores", `proveedores/${run}-public`, `proveedores/${run}-public/portada`])
    for (const operation of ["get", "create", "delete"])
      add("provider unmatched prefix unchanged", actor, operation, resource, false);
// Listing a gallery has a matched child pattern; listing provider root has none.
for (const actor of ["anonymous", "owner", "admin"]) {
  add("provider list", actor, "list", `proveedores/${run}-public/galeria`, isAdmin(actor) || !candidate);
  add("provider list prefix", actor, "list", "proveedores", false);
}
for (const [suffix, bytes, type, allow] of [
  ["portada/other.png", 8, "image/png", false], ["galeria/invalid.svg", 8, "image/svg+xml", false],
  ["galeria/type.png", 8, "text/html", false], ["galeria/large.png", 15 * 1024 * 1024 + 1, "image/png", false],
  ["galeria/limit.png", 15 * 1024 * 1024, "image/png", true],
]) add("provider image validation unchanged", "admin", "create", `proveedores/${run}-public/${suffix}`, allow, { bytes, contentType: type });

// Characterization of the OBSERVED REMOTE base. These broad fallback grants are
// deliberately not endorsed, expanded, or replaced by unrelated local safeguards.
for (const actor of ["anonymous", "owner", "other", "admin"])
  for (const prefix of ["usuarios/another-user/imagenes", "thumbnails_borradores", "publicadas", "assets/countdown", "iconos", "iconos_archived", "decoraciones", "legacy_misc"])
    for (const operation of ["get", "create", "delete", "list"])
      add("unaffected remote behavior", actor, operation, `${prefix}/${run}`, actor !== "anonymous");

after(async () => {
  if (bucket && db) {
    const settled = await Promise.allSettled([...objects].map(p => bucket.file(p).delete({ ignoreNotFound: true }))
      .concat([...documents].map(p => db.doc(p).delete())));
    cleanupFailures = settled.filter(x => x.status === "rejected").length;
  }
  await Promise.allSettled([...clients.values()].map(c => deleteApp(c.app)));
  if (adminApp) await adminApp.delete();
  const blockedNetworkAttempts = require("./networkGuard.cjs").attempts.length;
  if (session && fs.existsSync(path.join(session, "session.json"))) fs.writeFileSync(path.join(session, "rules-results.json"), JSON.stringify({
    mode, artifact, project: contract.LOCAL_PROJECT, bucket: contract.LOCAL_BUCKET,
    expectedCases: index, passed: results.filter(x => !x.failed).length, failed: results.filter(x => x.failed).length,
    infrastructureError, cleanupFailures, blockedNetworkAttempts, results, finishedAt: new Date().toISOString(),
  }, null, 2));
  assert.equal(cleanupFailures, 0); assert.equal(blockedNetworkAttempts, 0);
});
