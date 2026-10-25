import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { getIdToken } from "firebase/auth";
import { doc, getDocFromServer, getDocsFromServer, collection, setDoc } from "firebase/firestore";
import { getBytes, ref } from "firebase/storage";
import { ordinary, adminClaim } from "./providerBetaFixtures.mjs";
import { createProviderDirectoryFixtures, venueDraft, photographerDraft } from "./providerDirectoryFixtures.mjs";
import { contract, functionUrl } from "./editorFlowFixtures.mjs";

let fixture, privileged, common, claim, anonymous, venue, professional;
const checks = [];
const rejects = (operation, code) => assert.rejects(operation, error => error.code === code);
const read = (operation, data = {}, who = privileged) => fixture.directory(who, operation, data);
const list = (fields = {}) => read("list", { kind: "lugar", ...fields });
const imageUrl = (provider, imageId, revision = provider.approved.revision) => `${functionUrl("providerDirectoryImageV1")}?${new URLSearchParams({ providerId: provider.id, imageId, approvedRevision: String(revision) })}`;
async function imageRequest(url, who = privileged, method = "GET") {
  return fetch(url, { method, headers: { Origin: "http://localhost:3100", ...(who ? { Authorization: `Bearer ${await getIdToken(who.auth.currentUser)}` } : {}) } });
}
async function withSyntheticRows(count, template, matching, run) {
  const ids = Array.from({ length: count }, (_, index) => `000_directory_${String(index).padStart(5, "0")}`);
  for (let offset = 0; offset < ids.length; offset += 400) {
    const batch = fixture.db.batch();
    for (let index = offset; index < Math.min(offset + 400, ids.length); index += 1) {
      const data = structuredClone(template);
      data.aprobada.contenido.nombre = matching(index) ? "Coincidencia dispersa sintética" : "Otra ficha sintética";
      batch.create(fixture.db.doc(`proveedores/${ids[index]}`), data);
      fixture.providerIds.add(ids[index]);
    }
    await batch.commit();
  }
  try { await run(ids); }
  finally {
    for (let offset = 0; offset < ids.length; offset += 400) {
      const batch = fixture.db.batch();
      for (const id of ids.slice(offset, offset + 400)) batch.delete(fixture.db.doc(`proveedores/${id}`));
      await batch.commit();
      for (const id of ids.slice(offset, offset + 400)) fixture.providerIds.delete(id);
    }
  }
}

before(async () => {
  fixture = await createProviderDirectoryFixtures({ privateEnabled: false, panelEnabled: false });
  privileged = fixture.privileged;
  common = await fixture.client(ordinary); claim = await fixture.client(adminClaim); anonymous = await fixture.client();
});
after(async () => { if (fixture) await fixture.cleanup(); });

test("directory is closed by default and only verified superadmin can use the independent private gate", async () => {
  await fixture.db.doc("app_config/proveedoresBeta").delete();
  assert.deepEqual(await read("access"), { enabled: false, mode: "private", publicEnabled: false });
  await rejects(() => list(), "functions/permission-denied");
  for (const who of [anonymous, common, claim]) await rejects(() => read("access", {}, who), who === anonymous ? "functions/unauthenticated" : "functions/permission-denied");
  await setDoc(doc(common.db, "usuarios", ordinary.uid), { admin: true, superadmin: true, role: "admin", privateDirectoryEnabled: true }, { merge: true });
  await rejects(() => read("access", {}, common), "functions/permission-denied");
  await fixture.setControls({ panelEnabled: true, directoryEnabled: true, onboardingEnabled: true, privateDirectoryEnabled: "true" });
  assert.equal((await read("access")).enabled, false);
  await rejects(() => list(), "functions/permission-denied");
  await fixture.setControls({ panelEnabled: false, privateDirectoryEnabled: true, directoryEnabled: false, onboardingEnabled: false });
  assert.deepEqual(await read("access"), { enabled: true, mode: "private", publicEnabled: false });
  assert.deepEqual((await list()).items, []);
  await rejects(() => fixture.admin("list"), "functions/permission-denied");
  await fixture.setControls({ panelEnabled: true });
  checks.push("default denial", "verified superadmin only", "forged profile/admin claim denied", "independent private/panel/public gates");
});

test("only approved eligible records and strict public projections reach the directory", async () => {
  venue = await fixture.create(venueDraft, { image: true });
  professional = await fixture.create({ ...photographerDraft, cobertura: ["Berisso", "Ensenada"] });
  const incomplete = await fixture.create({ nombre: "Borrador secreto" }, { approved: false });
  const legacy = "synthetic_unapproved_legacy";
  fixture.providerIds.add(legacy);
  await fixture.createDocument(`proveedores/${legacy}`, { estado: "publicado", activo: true, visible: true, nombre: "Legacy sin aprobación", contacto: { email: "legacy@example.test" } });
  const reference = fixture.db.doc(`proveedores/${venue.id}`);
  await reference.update({ "propietario.userId": ordinary.uid, "fuente.archivo": "DIRECTORY-PRIVATE-SOURCE", "aprobada.contenido.notasInternas": "DIRECTORY-PRIVATE-INJECTED", "aprobada.contenido.ubicacion.userId": "PRIVATE-GEO" });
  const page = await list();
  assert.deepEqual(page.items.map(item => item.id), [venue.id]);
  const detail = await read("get", { id: venue.id });
  assert.equal(detail.private, true); assert.equal(detail.content.nombre, venueDraft.nombre);
  assert.equal(detail.approvedRevision, venue.approved.revision);
  assert.equal(detail.content.contacto.email, venueDraft.contacto.email);
  assert.ok(detail.content.imagenes.portada.id);
  assert.doesNotMatch(JSON.stringify([page, detail]), /DIRECTORY-PRIVATE|PRIVATE-GEO|storagePath|urlOriginal|urlPublica|firebaseStorageDownloadTokens|propietario|aprobadaPor|actorUid|userId/);
  await rejects(() => read("get", { id: incomplete.id }), "functions/not-found");
  await rejects(() => read("get", { id: legacy }), "functions/not-found");
  assert.equal((await reference.get()).data().visible, false);
  checks.push("approved whitelist only", "legacy/unapproved omitted", "public delivery remains false", "business may have no owner");
});

test("edits and pending review do not replace approved descriptions, contact or photos", async () => {
  const before = await read("get", { id: venue.id });
  const pendingImage = await fixture.upload(venue.id, "#7761a8");
  venue = await fixture.mutate(venue, "save", { draft: { ...venue.draft, nombre: "Nombre pendiente privado", contacto: { ...venue.draft.contacto, email: "pending@example.test" },
    imagenes: { portada: pendingImage, logo: null, galeria: [pendingImage] } } });
  venue = await fixture.mutate(venue, "submit");
  assert.deepEqual(await read("get", { id: venue.id }), before);
  assert.equal((await list({ search: "pendiente privado" })).items.length, 0);
  assert.equal((await imageRequest(imageUrl(venue, pendingImage.id))).status, 404);
  checks.push("pending review preserves approved content/contact/image", "pending image ID denied");
});

test("filters use approved categories, normalized name/location and professional coverage", async () => {
  assert.deepEqual((await list({ search: "jardin claro", categoryId: "salones-fiestas", location: "buenos aires" })).items.map(row => row.id), [venue.id]);
  assert.deepEqual((await list({ kind: "profesional", categoryId: "foto-video", location: "ensenada" })).items.map(row => row.id), [professional.id]);
  assert.equal((await list({ location: "Sin coincidencias" })).items.length, 0);
  assert.deepEqual((await list({ minCapacity: 150 })).items.map(row => row.id), [venue.id]);
  assert.equal((await list({ minCapacity: 201 })).items.length, 0);
  const unknownId = "capacity_unknown_synthetic";
  const unknown = (await fixture.db.doc(`proveedores/${venue.id}`).get()).data();
  unknown.aprobada.contenido.espacio.capacidadMaxima = null;
  fixture.providerIds.add(unknownId);
  await fixture.db.doc(`proveedores/${unknownId}`).create(unknown);
  try { assert.deepEqual((await list({ minCapacity: 1 })).items.map(row => row.id), [venue.id]); }
  finally { await fixture.db.doc(`proveedores/${unknownId}`).delete(); fixture.providerIds.delete(unknownId); }
  const neutral = (await read("get", { id: professional.id })).content;
  assert.doesNotMatch(JSON.stringify(neutral), /DIRECCION-PARTICULAR-SINTETICA/);
  assert.deepEqual(neutral.imagenes, { portada: null, logo: null, galeria: [] });
  assert.equal(neutral.precio.modalidad, "consultar");
  await rejects(() => list({ categoryId: "foto-video" }), "functions/invalid-argument");
  await rejects(() => list({ pageSize: 25 }), "functions/invalid-argument");
  await rejects(() => list({ kind: "profesional", minCapacity: 1 }), "functions/invalid-argument");
  checks.push("name/category/location/coverage filters", "minimum confirmed capacity excludes unknown", "no photo or optional price requirement");
});

test("pagination fills sparse results beyond 500 candidates and binds cursor to all filters", { timeout: 90000 }, async () => {
  const template = (await fixture.db.doc(`proveedores/${professional.id}`).get()).data();
  await withSyntheticRows(532, template, index => [0, 501, 531].includes(index), async ids => {
    const filters = { kind: "profesional", search: "coincidencia dispersa", pageSize: 2 };
    const first = await list(filters);
    assert.deepEqual(first.items.map(row => row.id), [ids[0], ids[501]]);
    assert.equal(first.hasMore, true); assert.ok(first.nextCursor);
    const second = await list({ ...filters, cursor: first.nextCursor });
    assert.deepEqual(second.items.map(row => row.id), [ids[531]]);
    assert.equal(second.hasMore, false); assert.equal(second.nextCursor, null);
    await rejects(() => list({ ...filters, location: "La Plata", cursor: first.nextCursor }), "functions/invalid-argument");
    await rejects(() => list({ ...filters, cursor: `${first.nextCursor}!` }), "functions/invalid-argument");
  });
  checks.push("sparse pagination past 500 candidates", "lookahead hasMore", "filter-bound invalid cursor denial");
});

test("scan budget exhaustion is an explicit error and never an empty or partial success", { timeout: 120000 }, async () => {
  const template = (await fixture.db.doc(`proveedores/${professional.id}`).get()).data();
  await withSyntheticRows(5001, template, index => index === 0 || index === 5000, async () => {
    await rejects(() => list({ kind: "profesional", search: "coincidencia dispersa", pageSize: 2 }), "functions/resource-exhausted");
  });
  checks.push("5000 candidate budget fails explicitly without partial results");
});

test("image endpoint resolves only current approved IDs and keeps bytes private with panel off", async () => {
  const approved = await read("get", { id: venue.id }), imageId = approved.content.imagenes.portada.id;
  const url = imageUrl(venue, imageId);
  await fixture.setControls({ panelEnabled: false });
  for (const [who, expected] of [[null, 401], [common, 403], [claim, 403], [privileged, 200]]) {
    const response = await imageRequest(url, who);
    assert.equal(response.status, expected);
    assert.match(response.headers.get("cache-control"), /private.*no-store/);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:3100");
    if (expected === 200) { assert.equal(response.headers.get("content-type"), "image/webp"); assert.ok((await response.arrayBuffer()).byteLength > 0); }
  }
  assert.equal((await imageRequest(imageUrl(venue, imageId, 999999))).status, 404);
  assert.equal((await imageRequest(imageUrl(venue, "missing-image"))).status, 404);
  assert.equal((await imageRequest(imageUrl(venue, "../private"))).status, 400);
  assert.equal((await imageRequest(url, privileged, "POST")).status, 405);
  await fixture.setControls({ privateDirectoryEnabled: false });
  assert.equal((await imageRequest(url)).status, 403);
  await fixture.setControls({ panelEnabled: true, privateDirectoryEnabled: true });
  venue = await fixture.mutate(venue, "approve", { reviewRevision: venue.review.revision });
  assert.equal((await imageRequest(url)).status, 404);
  const replacement = await read("get", { id: venue.id });
  assert.equal(replacement.content.nombre, "Nombre pendiente privado");
  assert.equal((await imageRequest(imageUrl(venue, replacement.content.imagenes.portada.id))).status, 200);
  checks.push("authenticated approved ID media with panel off", "CORS/cache headers", "wrong revision/path/method denied", "new approval invalidates old media URL");
});

test("pause, archive, suspension and category deactivation withdraw listing/detail/contact/media immediately", async () => {
  const photo = venue.approved.content.imagenes.portada;
  venue = await fixture.mutate(venue, "pause", { reason: "Pausa sintética del directorio" });
  assert.equal((await list()).items.length, 0);
  await rejects(() => read("get", { id: venue.id }), "functions/not-found");
  assert.equal((await imageRequest(imageUrl(venue, photo.id))).status, 404);
  venue = await fixture.mutate(venue, "resume");
  assert.equal((await list()).items.length, 1);
  await fixture.db.doc(`proveedores/${venue.id}`).update({ "validacion.estado": "suspendido" });
  await rejects(() => read("get", { id: venue.id }), "functions/not-found");
  await fixture.db.doc(`proveedores/${venue.id}`).update({ "validacion.estado": "no_validado" });
  await fixture.db.doc("categorias_proveedores/salones-fiestas").update({ activa: false });
  assert.equal((await list()).items.length, 0);
  await fixture.db.doc("categorias_proveedores/salones-fiestas").update({ activa: true });
  venue = await fixture.mutate(venue, "archive", { reason: "Archivo sintético del directorio" });
  await rejects(() => read("get", { id: venue.id }), "functions/not-found");
  assert.ok((await fixture.admin("get", { id: venue.id })).provider.history.some(row => row.action === "archive"));
  checks.push("pause/archive/suspension/category withdrawal", "history remains administrative");
});

test("SDK access stays closed even when private directory works and public flags are forged", async () => {
  const objectPath = venue.approved.content.imagenes.portada.storagePath;
  for (const who of [anonymous, common, claim, privileged]) {
    await rejects(() => getDocFromServer(doc(who.db, `proveedores/${professional.id}`)), "permission-denied");
    await rejects(() => getDocsFromServer(collection(who.db, "proveedores")), "permission-denied");
    await rejects(() => getDocFromServer(doc(who.db, "app_config/proveedoresBeta")), "permission-denied");
    await rejects(() => getBytes(ref(who.storage, objectPath)), "storage/unauthorized");
  }
  await fixture.setControls({ directoryEnabled: true });
  for (const who of [anonymous, common, claim]) await rejects(() => read("get", { id: professional.id }, who), who === anonymous ? "functions/unauthenticated" : "functions/permission-denied");
  assert.equal((await read("access")).publicEnabled, false);
  checks.push("Firestore/Storage SDK closure", "public flag cannot expose directory");
  await writeFile(path.join(process.env.RESERVA_LOCAL_SESSION, "provider-directory-api-evidence.json"), JSON.stringify({ project: contract.LOCAL_PROJECT, remoteEffects: false, synthetic: true, checks }, null, 2));
});
