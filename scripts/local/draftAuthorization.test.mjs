import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, getIdToken } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, getDocFromServer, setDoc, updateDoc, deleteField, terminate } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

const require = createRequire(import.meta.url);
const contract = require("../../shared/firebaseEnvironment.cjs");
const runId = `draft-auth-${randomUUID()}`;
const clients = [];
const documents = new Set();
const objects = new Set();
let admin, db, bucket, owner, other, anonymous;
const endpoint = name => `http://${contract.HOST}:${contract.EMULATORS.functions}/${contract.LOCAL_PROJECT}/${contract.REGION}/${name}`;
const draftId = label => `${runId}-${label}`;
const templateId = draftId("template");
const alternativeTemplateId = draftId("alternative-template");
const legacyTemplateId = draftId("legacy-template");
const templateHtml = "<!doctype html><html><head><style>.editable { color:red }</style></head><body><h1 data-id=\"title\">Synthetic legacy title</h1></body></html>";

function documentRef(resource) {
  documents.add(resource);
  return db.doc(resource);
}
function draftRef(slug) {
  documents.add(`analyticsEvents/invitacion_creada:${slug}`);
  objects.add(`borradores/${slug}/index.html`);
  return documentRef(`borradores/${slug}`);
}
function objectRef(resource) {
  objects.add(resource);
  return bucket.file(resource);
}
async function createClient(label, authenticated = true) {
  const app = initializeApp({ projectId: contract.LOCAL_PROJECT, storageBucket: contract.LOCAL_BUCKET,
    apiKey: "synthetic-emulator-only", authDomain: "localhost" }, `${runId}-${label}`);
  const auth = getAuth(app), firestore = getFirestore(app), functions = getFunctions(app);
  connectAuthEmulator(auth, `http://${contract.HOST}:${contract.EMULATORS.auth}`, { disableWarnings: true });
  connectFirestoreEmulator(firestore, contract.HOST, contract.EMULATORS.firestore);
  connectFunctionsEmulator(functions, contract.HOST, contract.EMULATORS.functions);
  assert.equal(firestore._settings.host, process.env.FIRESTORE_EMULATOR_HOST);
  assert.equal(functions.emulatorOrigin, `http://${process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST}`);
  const client = { app, auth, firestore, functions };
  clients.push(client);
  if (authenticated) {
    client.user = (await createUserWithEmailAndPassword(auth, `${runId}-${label}@example.test`, `Synthetic-${randomUUID()}!`)).user;
    client.token = await getIdToken(client.user);
  }
  return client;
}
function copy(client, name, slug, source = templateId) {
  draftRef(slug);
  return httpsCallable(client.functions, name, { timeout: 60000 })({ plantillaId: source, slug });
}
function rejectsCode(operation, ...codes) {
  return assert.rejects(operation, error => codes.includes(error.code));
}
async function privatePreview(slug, { token, query = "" } = {}) {
  return fetch(`${endpoint("verInvitacion")}?slug=${encodeURIComponent(slug)}${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(30000),
  });
}
async function assertPrivateDenied(slug, options, expectedStatuses) {
  const response = await privatePreview(slug, options);
  assert.ok(expectedStatuses.includes(response.status), `private preview returned ${response.status}`);
  assert.match(response.headers.get("cache-control") || "", /private/);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  assert.doesNotMatch(await response.text(), /Synthetic legacy title|Owner edited title|SYNTHETIC-PRIVATE/);
}

before(async () => {
  // No standalone or remote mode: validate the owning launcher before fixtures.
  const session = process.env.RESERVA_LOCAL_SESSION;
  assert.ok(session, "Run through the isolated test:local/verify:local launcher");
  assert.equal(path.resolve(process.cwd()), path.resolve(session, "workspace"));
  const marker = JSON.parse(fs.readFileSync(path.join(session, "session.json")));
  assert.equal(marker.owner, "reservaeldia-local");
  assert.equal(marker.project, contract.LOCAL_PROJECT);
  assert.equal(marker.stopped, undefined);
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  const { localBackendEnvironment, ensureAdminApp } = require("../../functions/lib/firebaseAdmin.js");
  assert.equal(localBackendEnvironment().config.projectId, contract.LOCAL_PROJECT);
  const hub = await (await fetch("http://127.0.0.1:14400/emulators", { signal: AbortSignal.timeout(5000) })).json();
  for (const [name, port] of Object.entries(contract.EMULATORS)) assert.equal(hub[name].port, port);
  admin = ensureAdminApp(); db = admin.firestore(); bucket = admin.storage().bucket();
  assert.equal(bucket.name, contract.LOCAL_BUCKET);
  owner = await createClient("a"); other = await createClient("b"); anonymous = await createClient("anonymous", false);
  for (const id of [templateId, alternativeTemplateId, legacyTemplateId]) {
    await documentRef(`plantillas/${id}`).set({ nombre: "Synthetic authorization template", tipo: "boda", estado: "active",
      estadoEditorial: "publicada", objetos: [], secciones: [], editor: id === legacyTemplateId ? "html" : "konva" });
  }
  await objectRef(`plantillas/${legacyTemplateId}/index.html`).save(templateHtml, { contentType: "text/html" });
});

after(async () => {
  const cleanup = [];
  // These exact resources all carry this run's random prefix. No collection or
  // bucket-wide deletion is used, even when an assertion fails.
  for (const resource of objects) cleanup.push(bucket.file(resource).delete({ ignoreNotFound: true }));
  for (const resource of documents) cleanup.push(db.doc(resource).delete());
  const results = await Promise.allSettled(cleanup);
  for (const client of clients) {
    if (client.user) await admin.auth().deleteUser(client.user.uid);
    await terminate(client.firestore);
    await deleteApp(client.app);
  }
  if (admin) await admin.delete();
  const rejected = results.filter(result => result.status === "rejected");
  assert.equal(rejected.length, 0, "synthetic fixture cleanup must succeed");
});

test("copy handlers reject anonymous callers and unsafe identifiers before creating resources", { timeout: 90000 }, async () => {
  for (const name of ["copiarPlantilla", "copiarPlantillaHTML"]) {
    const source = name === "copiarPlantillaHTML" ? legacyTemplateId : templateId;
    const slug = draftId(`anonymous-${name}`);
    await rejectsCode(() => copy(anonymous, name, slug, source), "functions/unauthenticated");
    assert.equal((await draftRef(slug).get()).exists, false);
    for (const invalid of ["..", "parent/child", "parent\\child", "__reserved__"]) {
      await rejectsCode(() => httpsCallable(owner.functions, name)({ plantillaId: source, slug: invalid }), "functions/invalid-argument");
      await rejectsCode(() => httpsCallable(owner.functions, name)({ plantillaId: invalid, slug }), "functions/invalid-argument");
    }
    assert.equal((await draftRef(slug).get()).exists, false);
  }
});

test("modern copy preserves owner edits on retry and rejects foreign, source and mode collisions", { timeout: 90000 }, async () => {
  const slug = draftId("modern-owned"), resource = draftRef(slug);
  assert.equal((await copy(owner, "copiarPlantilla", slug)).data.slug, slug);
  await updateDoc(doc(owner.firestore, "borradores", slug), { nombre: "Owner edited modern draft" });
  const beforeRetry = (await resource.get()).data();
  assert.equal(beforeRetry.userId, owner.user.uid);
  assert.equal(beforeRetry.editor, "konva");
  assert.equal((await getDocFromServer(doc(owner.firestore, "borradores", slug))).data().nombre, "Owner edited modern draft");
  await rejectsCode(() => getDocFromServer(doc(other.firestore, "borradores", slug)), "permission-denied");
  await copy(owner, "copiarPlantilla", slug);
  await rejectsCode(() => copy(other, "copiarPlantilla", slug), "functions/permission-denied");
  await rejectsCode(() => copy(owner, "copiarPlantilla", slug, alternativeTemplateId), "functions/already-exists");
  await rejectsCode(() => copy(owner, "copiarPlantillaHTML", slug, legacyTemplateId), "functions/already-exists");
  assert.deepEqual((await resource.get()).data(), beforeRetry);
  assert.equal((await bucket.file(`borradores/${slug}/index.html`).exists())[0], false);
});

test("concurrent modern creation has one owner and same-owner retries never reset the draft", { timeout: 90000 }, async () => {
  const slug = draftId("modern-race");
  const attempts = await Promise.allSettled([copy(owner, "copiarPlantilla", slug), copy(other, "copiarPlantilla", slug)]);
  assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
  const loser = attempts.find(result => result.status === "rejected");
  assert.equal(loser.reason.code, "functions/permission-denied");
  const initial = (await draftRef(slug).get()).data();
  const winner = initial.userId === owner.user.uid ? owner : other;
  await Promise.all([copy(winner, "copiarPlantilla", slug), copy(winner, "copiarPlantilla", slug)]);
  assert.deepEqual((await draftRef(slug).get()).data(), initial);
  const sameOwnerSlug = draftId("modern-same-owner-race");
  const repeated = await Promise.all([copy(owner, "copiarPlantilla", sameOwnerSlug), copy(owner, "copiarPlantilla", sameOwnerSlug)]);
  assert.deepEqual(repeated.map(result => result.data.slug), [sameOwnerSlug, sameOwnerSlug]);
  assert.equal((await draftRef(sameOwnerSlug).get()).data().userId, owner.user.uid);
});

test("legacy copy preserves bytes and owner content on retry and rejects collisions", { timeout: 90000 }, async () => {
  const slug = draftId("legacy-owned"), resource = draftRef(slug);
  await copy(owner, "copiarPlantillaHTML", slug, legacyTemplateId);
  await updateDoc(doc(owner.firestore, "borradores", slug), { "contenido.title.texto": "Owner edited title" });
  const documentBefore = (await resource.get()).data();
  const file = bucket.file(`borradores/${slug}/index.html`);
  const [bytesBefore] = await file.download();
  const [metadataBefore] = await file.getMetadata();
  assert.equal(documentBefore.userId, owner.user.uid);
  assert.equal(documentBefore.editor, "html");
  await copy(owner, "copiarPlantillaHTML", slug, legacyTemplateId);
  await rejectsCode(() => copy(other, "copiarPlantillaHTML", slug, legacyTemplateId), "functions/permission-denied");
  await rejectsCode(() => copy(owner, "copiarPlantilla", slug), "functions/already-exists");
  assert.deepEqual((await resource.get()).data(), documentBefore);
  assert.deepEqual((await file.download())[0], bytesBefore);
  assert.equal((await file.getMetadata())[0].generation, metadataBefore.generation);
});

test("legacy reservation with a missing blob recovers only for its owner without resetting data", { timeout: 90000 }, async () => {
  const slug = draftId("legacy-resume"), resource = draftRef(slug);
  await copy(owner, "copiarPlantillaHTML", slug, legacyTemplateId);
  await updateDoc(doc(owner.firestore, "borradores", slug), { "contenido.title.texto": "Owner edited title" });
  const expected = (await resource.get()).data();
  const file = bucket.file(`borradores/${slug}/index.html`), [bytes] = await file.download();
  // Reproduce the exact persisted reservation/no-object boundary of interruption
  // after create, using metadata produced by the real handler rather than a mock.
  await file.delete();
  await assertPrivateDenied(slug, { token: owner.token }, [404]);
  await rejectsCode(() => copy(other, "copiarPlantillaHTML", slug, legacyTemplateId), "functions/permission-denied");
  assert.equal((await file.exists())[0], false);
  await copy(owner, "copiarPlantillaHTML", slug, legacyTemplateId);
  assert.deepEqual((await resource.get()).data(), expected);
  assert.deepEqual((await file.download())[0], bytes);
});

test("legacy concurrent owners cannot overwrite the winner or adopt an orphan HTML object", { timeout: 90000 }, async () => {
  const slug = draftId("legacy-race");
  const attempts = await Promise.allSettled([copy(owner, "copiarPlantillaHTML", slug, legacyTemplateId), copy(other, "copiarPlantillaHTML", slug, legacyTemplateId)]);
  assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(attempts.find(result => result.status === "rejected").reason.code, "functions/permission-denied");
  const winner = (await draftRef(slug).get()).data().userId;
  assert.ok([owner.user.uid, other.user.uid].includes(winner));
  assert.equal((await bucket.file(`borradores/${slug}/index.html`).download())[0].toString(), templateHtml);
  const sameOwnerSlug = draftId("legacy-same-owner-race");
  const repeated = await Promise.all([copy(owner, "copiarPlantillaHTML", sameOwnerSlug, legacyTemplateId), copy(owner, "copiarPlantillaHTML", sameOwnerSlug, legacyTemplateId)]);
  assert.deepEqual(repeated.map(result => result.data.slug), [sameOwnerSlug, sameOwnerSlug]);
  const sameOwnerFile = bucket.file(`borradores/${sameOwnerSlug}/index.html`);
  assert.equal((await sameOwnerFile.download())[0].toString(), templateHtml);
  assert.equal((await sameOwnerFile.getMetadata())[0].metadata.ownerUid, owner.user.uid);
  const orphanSlug = draftId("legacy-orphan");
  const orphan = objectRef(`borradores/${orphanSlug}/index.html`);
  await orphan.save("SYNTHETIC-PRIVATE-ORPHAN", { contentType: "text/html" });
  const [beforeMetadata] = await orphan.getMetadata();
  await rejectsCode(() => copy(owner, "copiarPlantillaHTML", orphanSlug, legacyTemplateId), "functions/already-exists", "functions/failed-precondition");
  assert.equal((await orphan.download())[0].toString(), "SYNTHETIC-PRIVATE-ORPHAN");
  assert.equal((await orphan.getMetadata())[0].generation, beforeMetadata.generation);
  await assertPrivateDenied(orphanSlug, { token: owner.token }, [404]);
});

test("legacy creation rechecks ownership when another request completes between document and object reads", { timeout: 90000 }, async () => {
  const { copyLegacyTemplateDraft } = require("../../functions/lib/drafts/legacyHtmlDraft.js");
  for (const contender of [owner, other]) {
    const slug = draftId(`legacy-between-reads-${contender === owner ? "same" : "foreign"}`);
    const resource = draftRef(slug);
    let intercepted = false, expectedDocument, expectedGeneration;
    // Delay only the helper's first object-existence read. The other creation
    // uses the actual callable and real emulators, with all writes unmocked.
    const interleavedBucket = { file(...args) {
      const file = bucket.file(...args);
      const exists = file.exists.bind(file);
      file.exists = async () => {
        assert.equal(intercepted, false);
        intercepted = true;
        assert.equal((await resource.get()).exists, false);
        await copy(owner, "copiarPlantillaHTML", slug, legacyTemplateId);
        expectedDocument = (await resource.get()).data();
        expectedGeneration = (await file.getMetadata())[0].generation;
        return exists();
      };
      return file;
    } };
    const operation = () => copyLegacyTemplateDraft({ db, bucket: interleavedBucket,
      uid: contender.user.uid, plantillaId: legacyTemplateId, slug,
      assertTemplateAvailable: async () => assert.fail("A completed creation must be resolved without copying the source again"),
    });
    if (contender === owner) await operation();
    else await rejectsCode(operation, "permission-denied");
    assert.equal(intercepted, true);
    assert.deepEqual((await resource.get()).data(), expectedDocument);
    const file = bucket.file(`borradores/${slug}/index.html`);
    assert.equal((await file.getMetadata())[0].generation, expectedGeneration);
    assert.equal((await file.download())[0].toString(), templateHtml);
  }
});

test("missing or unpublished source and trashed drafts do not create or reset copies", { timeout: 90000 }, async () => {
  const unpublished = draftId("unpublished-template");
  await documentRef(`plantillas/${unpublished}`).set({ nombre: "Synthetic unpublished", estadoEditorial: "en_proceso", objetos: [], secciones: [] });
  await objectRef(`plantillas/${unpublished}/index.html`).save(templateHtml, { contentType: "text/html" });
  for (const name of ["copiarPlantilla", "copiarPlantillaHTML"]) {
    const slug = draftId(`unpublished-${name}`);
    await rejectsCode(() => copy(owner, name, slug, unpublished), "functions/permission-denied");
    assert.equal((await draftRef(slug).get()).exists, false);
    assert.equal((await bucket.file(`borradores/${slug}/index.html`).exists())[0], false);
  }
  const missingHtmlSlug = draftId("missing-html");
  await rejectsCode(() => copy(owner, "copiarPlantillaHTML", missingHtmlSlug, templateId), "functions/not-found");
  assert.equal((await draftRef(missingHtmlSlug).get()).exists, false);
  const slug = draftId("trashed"), resource = draftRef(slug);
  await copy(owner, "copiarPlantilla", slug);
  await resource.update({ estadoBorrador: "borrador_papelera" });
  const snapshot = (await resource.get()).data();
  await rejectsCode(() => copy(owner, "copiarPlantilla", slug), "functions/failed-precondition");
  assert.deepEqual((await resource.get()).data(), snapshot);
});

test("private HTML verifies bearer identity and never accepts query tokens or foreign access", { timeout: 90000 }, async () => {
  const slug = draftId("legacy-owned");
  await assertPrivateDenied(slug, {}, [401]);
  await assertPrivateDenied(slug, { token: "synthetic-invalid-token" }, [401]);
  await assertPrivateDenied(slug, { query: `&token=${encodeURIComponent(owner.token)}&idToken=${encodeURIComponent(owner.token)}` }, [401]);
  await assertPrivateDenied(slug, { token: other.token }, [403]);
  const response = await privatePreview(slug, { token: owner.token });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /private/);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.match(await response.text(), /Owner edited title/);
  const modernSlug = draftId("modern-owned");
  await objectRef(`borradores/${modernSlug}/index.html`).save("SYNTHETIC-PRIVATE-MODERN", { contentType: "text/html" });
  await assertPrivateDenied(modernSlug, { token: owner.token }, [404]);
  const ownerless = draftId("ownerless");
  await draftRef(ownerless).set({ editor: "html", contenido: {} });
  await objectRef(`borradores/${ownerless}/index.html`).save("SYNTHETIC-PRIVATE-OWNERLESS", { contentType: "text/html" });
  await assertPrivateDenied(ownerless, { token: owner.token }, [403]);
  await assertPrivateDenied(draftId("missing"), { token: owner.token }, [404]);
});

test("private HTML rejects a new draft artifact whose metadata or bytes no longer match its reservation", { timeout: 90000 }, async () => {
  const slug = draftId("legacy-tampered");
  await copy(owner, "copiarPlantillaHTML", slug, legacyTemplateId);
  const file = bucket.file(`borradores/${slug}/index.html`);
  const [original] = await file.getMetadata();
  await file.setMetadata({ metadata: { ...original.metadata, ownerUid: other.user.uid } });
  await assertPrivateDenied(slug, { token: owner.token }, [404]);
  // Matching metadata alone cannot authorize replaced bytes.
  await file.save("SYNTHETIC-PRIVATE-TAMPERED", { resumable: false,
    metadata: { contentType: "text/html", metadata: original.metadata } });
  await assertPrivateDenied(slug, { token: owner.token }, [404]);
});

test("client-owned documents cannot forge, change or remove the server's HTML creation evidence", { timeout: 90000 }, async () => {
  const slug = draftId("server-creation-marker");
  await copy(owner, "copiarPlantillaHTML", slug, legacyTemplateId);
  const expected = (await draftRef(slug).get()).data();
  const clientDocument = doc(owner.firestore, "borradores", slug);
  await rejectsCode(() => updateDoc(clientDocument, { draftCreation: deleteField() }), "permission-denied");
  await rejectsCode(() => updateDoc(clientDocument, { "draftCreation.htmlSha256": "0".repeat(64) }), "permission-denied");
  assert.deepEqual((await draftRef(slug).get()).data(), expected);

  const forgedSlug = draftId("forged-creation-marker");
  draftRef(forgedSlug);
  await rejectsCode(() => setDoc(doc(owner.firestore, "borradores", forgedSlug), {
    userId: owner.user.uid, slug: forgedSlug, plantillaId: legacyTemplateId,
    editor: "html", contenido: {}, draftCreation: expected.draftCreation,
  }), "permission-denied");
  assert.equal((await draftRef(forgedSlug).get()).exists, false);

  const orphanSlug = draftId("forged-owner-orphan");
  await objectRef(`borradores/${orphanSlug}/index.html`).save("SYNTHETIC-PRIVATE-ORPHAN", { contentType: "text/html" });
  draftRef(orphanSlug);
  // Owning a client-created document is insufficient evidence of blob origin.
  await setDoc(doc(owner.firestore, "borradores", orphanSlug), {
    userId: owner.user.uid, slug: orphanSlug, plantillaId: legacyTemplateId, editor: "html", contenido: {},
  });
  await assertPrivateDenied(orphanSlug, { token: owner.token }, [404]);

  const legacySlug = draftId("legacy-without-marker");
  await draftRef(legacySlug).set({ userId: owner.user.uid, plantillaId: legacyTemplateId, contenido: {} });
  const legacyFile = objectRef(`borradores/${legacySlug}/index.html`);
  await legacyFile.save("SYNTHETIC-PRIVATE-UNVERIFIED-LEGACY", { contentType: "text/html" });
  const legacyDocument = (await draftRef(legacySlug).get()).data();
  const [legacyMetadata] = await legacyFile.getMetadata();
  await rejectsCode(() => copy(owner, "copiarPlantillaHTML", legacySlug, legacyTemplateId), "functions/failed-precondition");
  assert.deepEqual((await draftRef(legacySlug).get()).data(), legacyDocument);
  assert.equal((await legacyFile.getMetadata())[0].generation, legacyMetadata.generation);
  assert.equal((await legacyFile.download())[0].toString(), "SYNTHETIC-PRIVATE-UNVERIFIED-LEGACY");
  await assertPrivateDenied(legacySlug, { token: owner.token }, [404]);
});

test("private HTML rejects tokens from disabled users and tokens revoked after issuance", { timeout: 90000 }, async () => {
  const disabled = await createClient("disabled"), revoked = await createClient("revoked");
  for (const [label, client] of [["disabled", disabled], ["revoked", revoked]]) {
    const slug = draftId(`legacy-${label}`);
    await copy(client, "copiarPlantillaHTML", slug, legacyTemplateId);
    const initial = await privatePreview(slug, { token: client.token });
    assert.equal(initial.status, 200);
    await initial.text();
    if (label === "disabled") await admin.auth().updateUser(client.user.uid, { disabled: true });
    else {
      // Auth's valid-since comparison has second precision. Cross that boundary
      // once so this tests revocation, rather than a same-second token race.
      const issued = await admin.auth().verifyIdToken(client.token);
      const wait = Math.max(0, (issued.auth_time + 1) * 1000 - Date.now() + 20);
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      await admin.auth().revokeRefreshTokens(client.user.uid);
    }
    await assertPrivateDenied(slug, { token: client.token }, [401]);
  }
});

test("published HTML remains public while paused and missing publications remain unavailable", { timeout: 90000 }, async () => {
  const slug = draftId("published");
  const resource = documentRef(`publicadas/${slug}`);
  await resource.set({ userId: owner.user.uid, estado: "publicada_activa", publicadaEn: new Date(), venceAt: new Date(Date.now() + 86400000) });
  await objectRef(`publicadas/${slug}/index.html`).save("<!doctype html><html><body>SYNTHETIC-PUBLIC-PUBLISHED</body></html>", { contentType: "text/html" });
  const url = `${endpoint("verInvitacionPublicada")}/i/${slug}`;
  const active = await fetch(url, { signal: AbortSignal.timeout(30000) });
  assert.equal(active.status, 200);
  assert.match(await active.text(), /SYNTHETIC-PUBLIC-PUBLISHED/);
  await resource.update({ estado: "publicada_pausada" });
  const paused = await fetch(url, { signal: AbortSignal.timeout(30000) });
  assert.equal(paused.status, 404);
  assert.doesNotMatch(await paused.text(), /SYNTHETIC-PUBLIC-PUBLISHED/);
  const absent = await fetch(`${endpoint("verInvitacionPublicada")}/i/${draftId("absent-publication")}`, { signal: AbortSignal.timeout(30000) });
  assert.equal(absent.status, 404);
  const visit = await fetch(`${url}/visit`, { method: "POST", signal: AbortSignal.timeout(30000) });
  assert.equal(visit.status, 412);
  assert.match(await visit.text(), /LOCAL_FLOW_DISABLED/);
});

test("modern preview authorization rejects foreign access before rendering while its local HTTP wrapper stays blocked", { timeout: 90000 }, async () => {
  const draftSlug = draftId("modern-owned");
  const handler = require("../../functions/lib/index.js").prepareDraftPreviewRender;
  await rejectsCode(() => handler.run({ data: { draftSlug } }), "unauthenticated");
  // The request identity comes from a verified Auth emulator token. Invoke the
  // existing handler only for denials before render; no preview side effect is
  // newly enabled by the HTTP wrapper or by this negative regression.
  const decoded = await admin.auth().verifyIdToken(other.token);
  const auth = { uid: decoded.uid, token: decoded };
  documentRef(`usuarios/${other.user.uid}`);
  await setDoc(doc(other.firestore, "usuarios", other.user.uid), {
    admin: true, superadmin: true, role: "admin", uid: owner.user.uid,
  }, { merge: true });
  const access = await require("../../functions/lib/index.js").getAdminAccess.run({ auth, data: {} });
  assert.equal(access.adminClaim, false);
  assert.equal(access.isAdmin, false);
  assert.equal(access.isSuperAdmin, false);
  await rejectsCode(() => copy(other, "copiarPlantilla", draftSlug), "functions/permission-denied");
  await assertPrivateDenied(draftId("legacy-owned"), { token: other.token }, [403]);
  await rejectsCode(() => handler.run({ auth, data: { draftSlug } }), "permission-denied");
  await rejectsCode(() => handler.run({ auth, data: { draftSlug, administrativeOwnerUid: owner.user.uid } }), "permission-denied");
  await assert.rejects(() => httpsCallable(owner.functions, "prepareDraftPreviewRender")({ draftSlug }),
    error => error.code === "functions/failed-precondition" && /LOCAL_FLOW_DISABLED/.test(error.message));
});

test("real render handlers authorize each emulator asset independently of draft ownership", { timeout: 120000 }, async () => {
  const handlers = require("../../functions/lib/index.js");
  const decoded = await admin.auth().verifyIdToken(owner.token);
  const auth = { uid: decoded.uid, token: decoded };
  const slug = draftId("asset-authorization");
  const ownPath = `usuarios/${owner.user.uid}/imagenes/${runId}.png`;
  const otherPath = `usuarios/${other.user.uid}/imagenes/${runId}.png`;
  const providerPath = `proveedores/${runId}/portada/photo.png`;
  const sharedPath = `iconos/${runId}.png`;
  const syntheticPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2s5sAAAAASUVORK5CYII=", "base64");
  const url = resource => `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${bucket.name}/o/${encodeURIComponent(resource)}?alt=media&token=synthetic-token`;
  for (const resource of [ownPath, otherPath, providerPath, sharedPath]) {
    await objectRef(resource).save(syntheticPng, { contentType: "image/png", metadata: {
      metadata: { firebaseStorageDownloadTokens: "synthetic-token" },
    } });
  }
  await documentRef(`iconos/${runId}`).set({ status: "active", storagePath: sharedPath });
  const value = { userId: owner.user.uid, editor: "konva", objetos: [
    { id: "gift-cta", tipo: "regalo-boton", seccionId: "hero", x: 40, y: 100, width: 180, height: 44, texto: "Ver regalos" }],
    secciones: [{ id: "hero", orden: 1, altura: 600, fondo: "#fff", fondoTipo: "imagen", fondoImagen: url(ownPath) },
      { id: "shared", orden: 2, altura: 600, fondo: "#fff", fondoTipo: "imagen", fondoImagen: url(sharedPath) }],
    gifts: { version: 2, enabled: true, giftLinks: [{ id: "gift", visible: true,
      url: "https://shop.example.test/gift", imageUrl: "https://cdn.example.test/gift.png" }] } };
  await draftRef(slug).set(value);
  const data = { draftSlug: slug, resolvePublicationLink: false };
  const preview = await handlers.prepareDraftPreviewRender.run({ auth, data });
  assert.equal(preview.blocked, false);
  assert.ok(preview.htmlGenerado.includes(encodeURIComponent(ownPath)));
  assert.ok(preview.htmlGenerado.includes(encodeURIComponent(sharedPath)));
  assert.equal((await handlers.validateDraftForPublication.run({ auth, data })).canPublish, true);
  for (const resource of [otherPath, providerPath]) {
    for (const reference of [resource, `gs://${bucket.name}/${resource}`, url(resource)]) {
      await draftRef(slug).update({ "gifts.giftLinks": [{ id: "gift", visible: true,
        url: "https://shop.example.test/gift", imageUrl: reference }] });
      for (const handler of [handlers.prepareDraftPreviewRender, handlers.validateDraftForPublication]) {
        await rejectsCode(() => handler.run({ auth, data: { ...data,
          assetAccess: { kind: "draft", ownerUid: other.user.uid, draftId: slug }, admin: true } }), "permission-denied");
      }
    }
  }
  await draftRef(slug).set(value);
  assert.equal((await handlers.prepareDraftPreviewRender.run({ auth, data })).blocked, false);
  assert.equal((await draftRef(slug).get()).data().userId, owner.user.uid);
});
