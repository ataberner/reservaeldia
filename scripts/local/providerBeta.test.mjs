import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, getIdToken } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, getDocFromServer, getDocsFromServer, collection, setDoc, terminate } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
import { getStorage, connectStorageEmulator, ref, getBytes, uploadBytes } from "firebase/storage";
import { createRequire } from "node:module";
import { contract, functionUrl } from "./editorFlowFixtures.mjs";
import { createProviderBetaFixtures, operator, ordinary, adminClaim, publishableDraft } from "./providerBetaFixtures.mjs";

const require = createRequire(import.meta.url);
const clients = [];
let fixture, privileged, common, claim, anonymous;
let legacyId;
async function client(user) {
  const app = initializeApp({ projectId: contract.LOCAL_PROJECT, storageBucket: contract.LOCAL_BUCKET, apiKey: "synthetic-emulator-only", authDomain: "localhost" }, `provider-${clients.length}`);
  const auth = getAuth(app), db = getFirestore(app), functions = getFunctions(app), storage = getStorage(app);
  connectAuthEmulator(auth, `http://${contract.HOST}:${contract.EMULATORS.auth}`, { disableWarnings: true });
  connectFirestoreEmulator(db, contract.HOST, contract.EMULATORS.firestore);
  connectFunctionsEmulator(functions, contract.HOST, contract.EMULATORS.functions);
  connectStorageEmulator(storage, contract.HOST, contract.EMULATORS.storage);
  storage.maxOperationRetryTime = 2000; storage.maxUploadRetryTime = 2000;
  const result = { app, auth, db, functions, storage };
  clients.push(result);
  if (user) await signInWithEmailAndPassword(auth, user.email, user.password);
  return result;
}
async function call(who, operation, data = {}) {
  return (await httpsCallable(who.functions, "adminProvidersV1", { timeout: 60000 })({ operation, ...data })).data;
}
const rejects = (operation, code) => assert.rejects(operation, error => error.code === code);
async function create(draft = publishableDraft, extra = {}) {
  const { provider } = await call(privileged, "create", { draft, ...extra });
  fixture.providerIds.add(provider.id);
  return provider;
}
const mutate = async (provider, operation, fields = {}) => (await call(privileged, operation, { id: provider.id, expectedRevision: provider.revision, ...(provider.versionToken ? { expectedVersionToken: provider.versionToken } : {}), ...fields })).provider;
before(async () => {
  fixture = await createProviderBetaFixtures({ enabled: false });
  privileged = await client(operator); common = await client(ordinary); claim = await client(adminClaim); anonymous = await client();
});
after(async () => {
  await Promise.all(clients.map(async item => { await terminate(item.db); await deleteApp(item.app); }));
  if (fixture) await fixture.cleanup();
});

test("beta defaults closed and admin claims or editable profiles never grant management", async () => {
  assert.deepEqual(await call(privileged, "access"), { enabled: false, controls: { panelEnabled: false, onboardingEnabled: false, directoryEnabled: false } });
  await rejects(() => call(privileged, "list"), "functions/permission-denied");
  await rejects(() => call(anonymous, "access"), "functions/unauthenticated");
  for (const who of [common, claim]) await rejects(() => call(who, "access"), "functions/permission-denied");
  await setDoc(doc(common.db, "usuarios", ordinary.uid), { admin: true, superadmin: true, role: "admin", providerBeta: true }, { merge: true });
  await rejects(() => call(common, "access"), "functions/permission-denied");
  await fixture.createDocument("app_config/proveedoresBeta", { panelEnabled: true, onboardingEnabled: true, directoryEnabled: true });
  assert.deepEqual((await call(privileged, "access")).controls, { panelEnabled: true, onboardingEnabled: false, directoryEnabled: false });
});

test("incomplete drafts save and public requirements block submission", async () => {
  const draft = await create({ nombre: "Borrador incompleto" });
  assert.equal(draft.publication.state, "borrador");
  assert.equal(draft.approved, null);
  assert.equal(draft.draft.espacio.capacidadMaxima, null);
  await rejects(() => mutate(draft, "submit"), "functions/failed-precondition");
  await rejects(() => create({ ...publishableDraft, contacto: { email: "not-an-email" } }), "functions/invalid-argument");
});

test("approved snapshot survives edits; stale or superseded reviews cannot approve later changes", async () => {
  let provider = await create(publishableDraft, { internalNotes: "PRIVATE-INTERNAL-MARKER" });
  provider = await mutate(provider, "submit");
  provider = await mutate(provider, "approve", { reviewRevision: provider.review.revision });
  const approved = provider.approved;
  provider = await mutate(provider, "save", { draft: { ...provider.draft, nombre: "Versión dos" } });
  assert.deepEqual(provider.approved, approved);
  provider = await mutate(provider, "submit");
  const stale = provider;
  provider = await mutate(provider, "save", { draft: { ...provider.draft, nombre: "Cambio posterior no revisado" } });
  await rejects(() => mutate(stale, "approve", { reviewRevision: stale.review.revision }), "functions/aborted");
  await rejects(() => mutate(provider, "approve", { reviewRevision: stale.review.revision }), "functions/aborted");
  const preview = await call(privileged, "preview", { id: provider.id, version: "approved" });
  assert.equal(preview.private, true);
  assert.equal(preview.content.nombre, publishableDraft.nombre);
  assert.doesNotMatch(JSON.stringify(preview), /PRIVATE-INTERNAL-MARKER|actorUid|propietario|fuente|revisionManual|userId|emailsAlternativos/);
  for (const who of [anonymous, common, claim]) await rejects(() => call(who, "preview", { id: provider.id, version: "draft" }), who === anonymous ? "functions/unauthenticated" : "functions/permission-denied");
});

test("concurrent saves have exactly one winner and preserve the other edit as a conflict", async () => {
  const provider = await create();
  const results = await Promise.allSettled(["Edición A", "Edición B"].map(nombre => mutate(provider, "save", { draft: { ...provider.draft, nombre } })));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.code, "functions/aborted");
  const saved = (await call(privileged, "get", { id: provider.id })).provider;
  assert.equal(saved.revision, provider.revision + 1);
  assert.equal(saved.history.length, 2);
});

test("approval cannot remove an administrative pause; archive retains versions, owner identity and history", async () => {
  let provider = await create();
  provider = await mutate(provider, "submit");
  provider = await mutate(provider, "pause", { reason: "Revisión operativa sintética" });
  provider = await mutate(provider, "approve", { reviewRevision: provider.review.revision });
  assert.equal(provider.publication.state, "pausada");
  assert.equal(provider.publication.pauseSource, "administracion");
  provider = await mutate(provider, "archive", { reason: "Archivo sintético" });
  assert.equal(provider.publication.state, "archivada");
  assert.ok(provider.approved);
  assert.deepEqual(provider.history.map(row => row.action).sort(), ["approve", "archive", "create", "pause", "submit"]);
  assert.ok(await fixture.app.auth().getUser(operator.uid));
});

test("legacy imported IDs and ownership remain compatible through local edit", async () => {
  const providers = require("../../functions/lib/providers/index.js");
  const record = { categoria: "salones-fiestas", nombre: "Lugar importado sintético", pagina: "https://www.portalcasamientos.com.ar/salones-fiestas/lugar-sintetico-abc123/", sitio_web: "", telefono: "", email: "legacy@example.test", direccion: "", calle: "", localidad: "La Plata", provincia: "Buenos Aires", codigo_postal: "", pais: "AR", tipo_schema: "EventVenue", fuente_extraccion: "synthetic" };
  const mapped = providers.mapPortalProviderRecord(record, { sourceFile: providers.parseProviderSourceFile({ version: 9, createdAt: "2026-07-26T18:17:40.871Z", reason: "synthetic", origin: "https://www.portalcasamientos.com.ar", providerUrls: [], results: [record] }), sourceFileName: "synthetic-providers.json" });
  const id = mapped.id; legacyId = id;
  fixture.providerIds.add(id);
  assert.equal(mapped.document.schemaVersion, 2);
  await fixture.createDocument(`proveedores/${id}`, { ...mapped.document, propietario: { ...mapped.document.propietario, userId: ordinary.uid, reclamado: true } });
  let provider = (await call(privileged, "get", { id })).provider;
  assert.equal(provider.id, id); assert.equal(provider.owner.userId, ordinary.uid);
  assert.equal(typeof provider.versionToken, "string");
  await fixture.db.doc(`proveedores/${id}`).update({ descripcion: "Importación concurrente sintética anterior a la adopción" });
  await rejects(() => mutate(provider, "save", { draft: provider.draft }), "functions/aborted");
  provider = (await call(privileged, "get", { id })).provider;
  provider = await mutate(provider, "save", { draft: { ...provider.draft, contacto: { ...provider.draft.contacto, email: "new@example.test" } } });
  assert.equal(provider.id, id); assert.equal(provider.owner.userId, ordinary.uid);
  assert.equal(provider.draft.espacio.capacidadMaxima, null);
  assert.equal(provider.draft.descripcion, "Importación concurrente sintética anterior a la adopción");
  assert.equal((await fixture.db.doc(`proveedores/${id}`).get()).data().schemaVersion, 3);
  assert.equal((await fixture.db.doc(`proveedores/${id}`).get()).data().fuente.idExterno, mapped.document.fuente.idExterno);
});

test("paginated listing and search/filter return the permitted administrative summary", async () => {
  const page = await call(privileged, "list", { pageSize: 2 });
  assert.equal(page.items.length, 2); assert.ok(page.nextCursor);
  const next = await call(privileged, "list", { pageSize: 2, cursor: page.nextCursor });
  assert.ok(next.items.every(item => !page.items.some(first => first.id === item.id)));
  const filtered = await call(privileged, "list", { search: "new@example.test", categoryId: "salones-fiestas", city: "La Plata", owner: "responsable" });
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.items[0].id, legacyId);
  assert.doesNotMatch(JSON.stringify(page), /PRIVATE-INTERNAL-MARKER|fuente|emailsAlternativos/);
});

test("pending filters reflect unpublished content and private notes do not invalidate reviewed content", async () => {
  let provider = await create({ ...publishableDraft, nombre: "Filtro pendiente sintético" });
  const find = async pending => (await call(privileged, "list", { search: "Filtro pendiente sintético", pending })).items;
  assert.equal((await find(true)).length, 1); assert.equal((await find(false)).length, 0);
  provider = await mutate(provider, "submit");
  const contentRevision = provider.contentRevision, reviewRevision = provider.review.revision;
  provider = await mutate(provider, "save", { draft: provider.draft, internalNotes: "Nota interna posterior a revisión" });
  assert.equal(provider.contentRevision, contentRevision);
  provider = await mutate(provider, "approve", { reviewRevision });
  assert.equal((await find(false)).length, 1); assert.equal((await find(true)).length, 0);
  provider = await mutate(provider, "save", { draft: { ...provider.draft, descripcionCorta: "Contenido nuevo sin enviar" } });
  assert.equal((await find(true)).length, 1); assert.equal((await find(false)).length, 0);
  assert.equal(provider.hasPendingChanges, true);
});

test("all client SDK identities are denied canonical data, private control, descendants and storage", async () => {
  const provider = await create();
  const resource = `proveedores/${provider.id}/media/fixture.webp`;
  await fixture.bucket.file(resource).save(Buffer.from("synthetic-private"), { contentType: "image/webp" }); fixture.objects.add(resource);
  for (const who of [anonymous, common, claim, privileged]) {
    for (const resource of [`proveedores/${provider.id}`, `proveedores/${provider.id}/historial/revision-1`, `proveedores/${provider.id}/archivos/image`, "app_config/proveedoresBeta"]) {
      await rejects(() => getDocFromServer(doc(who.db, resource)), "permission-denied");
      await rejects(() => setDoc(doc(who.db, resource), { allowed: true }), "permission-denied");
    }
    await rejects(() => getDocsFromServer(collection(who.db, "proveedores")), "permission-denied");
    await rejects(() => getBytes(ref(who.storage, resource)), "storage/unauthorized");
    await rejects(() => uploadBytes(ref(who.storage, resource), Buffer.from("replacement")), "storage/unauthorized");
  }
});

test("private images require backend authorization, have no download token and do not alter approved media", async () => {
  let provider = await create();
  provider = await mutate(provider, "submit"); provider = await mutate(provider, "approve", { reviewRevision: provider.review.revision });
  const png = await require("../../functions/node_modules/sharp")({ create: { width: 20, height: 20, channels: 3, background: "#dac8e8" } }).png().toBuffer();
  const token = await getIdToken(privileged.auth.currentUser);
  const upload = await fetch(`${functionUrl("providerAdminImageV1")}?providerId=${provider.id}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/png" }, body: png });
  assert.equal(upload.status, 201);
  const { image } = await upload.json(); fixture.objects.add(image.storagePath);
  const [metadata] = await fixture.bucket.file(image.storagePath).getMetadata();
  assert.equal(metadata.metadata?.firebaseStorageDownloadTokens, undefined);
  assert.equal(metadata.cacheControl, "private,no-store");
  const url = `${functionUrl("providerAdminImageV1")}?providerId=${provider.id}&storagePath=${encodeURIComponent(image.storagePath)}`;
  for (const [who, expected] of [[null, 401], [common, 403], [claim, 403], [privileged, 200]]) {
    const response = await fetch(url, { headers: who ? { Authorization: `Bearer ${await getIdToken(who.auth.currentUser)}` } : {} });
    assert.equal(response.status, expected);
    assert.match(response.headers.get("cache-control"), /private.*no-store/);
    if (expected === 200) assert.equal(response.headers.get("content-type"), "image/webp");
  }
  provider = await mutate(provider, "save", { draft: { ...provider.draft, imagenes: { portada: image, logo: null, galeria: [image] } } });
  assert.equal(provider.approved.content.imagenes.portada, null);
  assert.equal(provider.draft.imagenes.portada.storagePath, image.storagePath);
  await writeFile(path.join(process.env.RESERVA_LOCAL_SESSION, "providers-api-evidence.json"), JSON.stringify({ project: contract.LOCAL_PROJECT, synthetic: true, remoteEffects: false, tested: ["closed default", "verified superadmin", "forged profile denied", "draft validation", "review snapshot", "concurrent transaction", "pause/archive history", "legacy compatibility", "pagination/filter", "Firestore/Storage SDK isolation", "token-free private media"] }, null, 2));
});
