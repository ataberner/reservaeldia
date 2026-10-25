import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, doc, getDocFromServer, setDoc, terminate } from "firebase/firestore";
import { getStorage, connectStorageEmulator, ref, getBytes, uploadBytes } from "firebase/storage";
import { assertEditorFlowSession, contract } from "./editorFlowFixtures.mjs";

const require = createRequire(import.meta.url);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function loadRules(name, content) {
  // Exact local admin endpoints used by the pinned Firebase CLI 14.4.0.
  const url = name === "firestore"
    ? `http://${contract.HOST}:${contract.EMULATORS.firestore}/emulator/v1/projects/${contract.LOCAL_PROJECT}:securityRules`
    : `http://${contract.HOST}:${contract.EMULATORS.storage}/internal/setRules`;
  contract.assertLocalUrl(url);
  const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules: { files: [{ name: `${name}.rules`, content }] } }), signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `${name} local Rules load`);
  const body = await response.text();
  if (body.startsWith("{")) assert.ok(!(JSON.parse(body).issues || []).some(issue => issue.severity === "ERROR"), `${name} Rules compilation errors`);
}

test("exact private deployment Rules deny provider SDK access and preserve owned wedding drafts in demo", { timeout: 90000 }, async () => {
  const session = assertEditorFlowSession();
  const directory = "deployment/provider-beta";
  const manifest = JSON.parse(await readFile(`${directory}/manifest.json`, "utf8"));
  const canonical = {}, candidate = {}, candidateHashes = {};
  for (const name of ["firestore", "storage"]) {
    canonical[name] = await readFile(`${name}.rules`, "utf8");
    const bytes = await readFile(`${directory}/${name}.rules`);
    assert.equal(hash(bytes), manifest.rules[name].candidateSha256);
    candidate[name] = bytes.toString("utf8"); candidateHashes[name] = hash(bytes);
  }
  const { ensureAdminApp } = require("../../functions/lib/firebaseAdmin.js");
  const admin = ensureAdminApp(), db = admin.firestore(), bucket = admin.storage().bucket();
  assert.equal(bucket.name, contract.LOCAL_BUCKET);
  const id = `provider-artifact-${randomUUID()}`, owner = `${id}-owner`;
  const providerPath = `proveedores/${id}`, imagePath = `${providerPath}/media/synthetic.webp`, draftPath = `borradores/${id}`;
  const clients = [], checks = [];
  let restored = false;
  try {
    await db.doc(providerPath).create({ estado: "publicado", visible: true, activo: true, internal: "synthetic-private" });
    await db.doc(draftPath).create({ userId: owner, nombre: "Casamiento sintético de Rules", estado: "activo" });
    await bucket.file(imagePath).save(Buffer.from("synthetic-private-image"), { contentType: "image/webp" });
    for (const name of ["firestore", "storage"]) await loadRules(name, candidate[name]);
    for (const [label, claims] of [["anonymous", null], ["owner", { sub: owner }], ["other", { sub: `${id}-other` }], ["admin", { sub: `${id}-admin`, admin: true }]]) {
      const app = initializeApp({ projectId: contract.LOCAL_PROJECT, storageBucket: contract.LOCAL_BUCKET, apiKey: "synthetic-only" }, `${id}-${label}`);
      const clientDb = getFirestore(app), storage = getStorage(app), options = claims ? { mockUserToken: claims } : undefined;
      connectFirestoreEmulator(clientDb, contract.HOST, contract.EMULATORS.firestore, options);
      connectStorageEmulator(storage, contract.HOST, contract.EMULATORS.storage, options);
      storage.maxOperationRetryTime = 2000; storage.maxUploadRetryTime = 2000;
      clients.push({ app, db: clientDb });
      for (const resource of [providerPath, `${providerPath}/historial/entry`, `${providerPath}/archivos/image`, "app_config/proveedoresBeta"]) {
        await assert.rejects(() => getDocFromServer(doc(clientDb, resource)), error => error.code === "permission-denied");
        await assert.rejects(() => setDoc(doc(clientDb, resource), { injected: true }), error => error.code === "permission-denied");
        checks.push(`${label}:${resource.startsWith(providerPath) ? resource.slice(providerPath.length) || "provider" : "controls"}:read/write-denied`);
      }
      await assert.rejects(() => getBytes(ref(storage, imagePath)), error => error.code === "storage/unauthorized");
      await assert.rejects(() => uploadBytes(ref(storage, imagePath), Buffer.from("replacement")), error => error.code === "storage/unauthorized");
      checks.push(`${label}:image-read/write-denied`);
      if (label === "owner") assert.equal((await getDocFromServer(doc(clientDb, draftPath))).data().userId, owner);
      if (label === "other" || label === "anonymous") await assert.rejects(() => getDocFromServer(doc(clientDb, draftPath)), error => error.code === "permission-denied");
    }
    checks.push("owned-wedding-draft-readable", "foreign-wedding-draft-denied");
  } finally {
    try { for (const name of ["firestore", "storage"]) await loadRules(name, canonical[name]); restored = true; }
    finally {
      await Promise.all(clients.map(async client => { await terminate(client.db); await deleteApp(client.app); }));
      await Promise.all([db.doc(providerPath).delete(), db.doc(draftPath).delete(), bucket.file(imagePath).delete({ ignoreNotFound: true })]);
      await admin.delete();
      await writeFile(path.join(session, "providers-artifact-evidence.json"), JSON.stringify({ project: contract.LOCAL_PROJECT, candidateHashes, sourceHash: hash(await readFile(new URL(import.meta.url))), restoredCanonicalRules: restored, checks, remoteEffects: false }, null, 2));
    }
  }
});
