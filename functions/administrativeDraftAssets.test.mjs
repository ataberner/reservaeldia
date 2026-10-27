import assert from "node:assert/strict";
import test from "node:test";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";
const { normalizeAdministrativeDraftAssets } = requireBuiltModule("lib/drafts/administrativeDraftAssets.js");
const context = { actorUid: "actor", ownerUid: "owner", slug: "draft" };
const bucketName = "demo-administrative-assets.firebasestorage.app";
const url = path => `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=source-secret`;
const catalog = requireBuiltModule("lib/render/renderAssetCatalogAccess.js");
const { createRenderAssetAuthorizer } = requireBuiltModule("lib/render/renderAssetAuthorization.js");

function storage(files = {}) {
  const state = new Map(Object.entries(files));
  const copies = [];
  const bucket = { name: bucketName, file(path, options = {}) {
    return { path,
      getMetadata: async () => { if (!state.has(path)) throw Object.assign(new Error("missing"), { code: 404 }); return [structuredClone(state.get(path))]; },
      copy: async (destination, config) => {
        const prior = state.get(destination.path);
        if (String(config.preconditionOpts.ifGenerationMatch) !== String(prior?.generation || 0)) {
          throw Object.assign(new Error("generation changed"), { code: 412 });
        }
        assert.equal(options.generation, state.get(path).generation);
        copies.push({ path, destination: destination.path });
        state.set(destination.path, { generation: String(100 + copies.length), ...config });
      },
    };
  } };
  return { bucket, copies, state };
}

test("actor images copy into owner namespace with descriptor and stable source-generation identity", async () => {
  const source = "usuarios/actor/imagenes/photo.webp";
  const f = storage({ [source]: { generation: "7", contentType: "image/webp", metadata: { sourceWidth: "100", firebaseStorageDownloadTokens: "actor-secret" } } });
  const raw = { objetos: [{ src: url(source), storagePath: source, storageGeneration: "7", storageDownloadToken: "actor-secret", imageCrop: { originalSrc: url(source) } }],
    templateInput: { values: { gallery: [url(source)] } }, portada: url(source) };
  const result = await normalizeAdministrativeDraftAssets(raw, context, f.bucket);
  assert.equal(f.copies.length, 1);
  const image = result.objetos[0];
  assert.match(image.storagePath, /^usuarios\/owner\/imagenes\/admin-[a-f0-9]{64}\.webp$/);
  assert.equal(image.storageGeneration, "101");
  assert.notEqual(image.storageDownloadToken, "actor-secret");
  assert.equal(image.src, result.portada);
  assert.equal(image.imageCrop.originalSrc, image.src);
  assert.equal(result.templateInput.values.gallery[0], image.src);
  assert.equal(f.state.get(image.storagePath).metadata.sourceWidth, "100");
  const retry = await normalizeAdministrativeDraftAssets(raw, context, f.bucket);
  assert.deepEqual(retry, result);
  assert.equal(f.copies.length, 1);
  f.state.set(source, { ...f.state.get(source), generation: "8" });
  const newer = await normalizeAdministrativeDraftAssets(raw, context, f.bucket);
  assert.notEqual(newer.objetos[0].storagePath, image.storagePath);
  assert.equal(f.copies.length, 2);
});

test("owner assets and external images remain unchanged and are never copied", async () => {
  const f = storage();
  const patch = { objetos: [{ src: url("usuarios/owner/imagenes/own.webp") }, { src: "https://example.test/photo.webp" }],
    nombre: "Invitation", templateInput: { values: { title: "Hello", date: "2026-12-20" } } };
  assert.deepEqual(await normalizeAdministrativeDraftAssets(patch, context, f.bucket), patch);
  assert.equal(f.copies.length, 0);
});

test("trimmed and encoded actor references normalize before being persisted", async () => {
  const source = "usuarios/actor/imagenes/photo.webp";
  const f = storage({ [source]: { generation: "7", contentType: "image/webp" } });
  for (const input of [`  ${url(source)}  `, encodeURIComponent(source), encodeURIComponent(encodeURIComponent(source))]) {
    const result = await normalizeAdministrativeDraftAssets({ portada: input }, context, f.bucket);
    assert.match(result.portada, /usuarios%2Fowner%2Fimagenes/);
  }
  assert.equal(f.copies.length, 1);
});

test("foreign resources, another draft thumbnail and non-images fail closed", async () => {
  for (const path of ["usuarios/third/imagenes/photo.webp", "proveedores/private/portada.webp",
    "thumbnails_borradores/actor/another-draft.webp", "borradores/draft/index.html"]) {
    const f = storage();
    await assert.rejects(normalizeAdministrativeDraftAssets({ portada: url(path) }, context, f.bucket), { code: "permission-denied" });
    assert.equal(f.copies.length, 0);
  }
  const path = "usuarios/actor/imagenes/unsafe.html";
  const f = storage({ [path]: { generation: "7", contentType: "text/html" } });
  await assert.rejects(normalizeAdministrativeDraftAssets({ portada: url(path) }, context, f.bucket), { code: "failed-precondition" });
  assert.equal(f.copies.length, 0);
});

test("only the selected draft thumbnail is copied to its owner", async () => {
  const source = "thumbnails_borradores/actor/draft.webp";
  const f = storage({ [source]: { generation: "7", contentType: "image/webp" } });
  const result = await normalizeAdministrativeDraftAssets({ thumbnailUrl: url(source) }, context, f.bucket);
  assert.match(result.thumbnailUrl, /thumbnails_borradores%2Fowner%2Fdraft-admin\.webp/);
  assert.equal(f.copies.length, 1);
  const retry = await normalizeAdministrativeDraftAssets({ thumbnailUrl: url(source) }, context, f.bucket);
  assert.deepEqual(retry, result);
  assert.equal(f.copies.length, 1);
  f.state.set(source, { ...f.state.get(source), generation: "8" });
  const updated = await normalizeAdministrativeDraftAssets({ thumbnailUrl: url(source) }, context, f.bucket);
  assert.deepEqual(updated, result);
  assert.equal(f.copies.length, 2);
  assert.equal(f.state.size, 2, "one actor thumbnail and one owner thumbnail survive repeated saves");
});

test("missing or unavailable source images return a sanitized error without persisting references", async () => {
  const f = storage();
  await assert.rejects(normalizeAdministrativeDraftAssets({ portada: url("usuarios/actor/imagenes/missing.webp") }, context, f.bucket),
    error => error.code === "unavailable" && !/usuarios|token|https:|missing/.test(error.message));
  assert.equal(f.copies.length, 0);
});

test("editing keeps existing missing or archived template assets without accessing their bytes", async t => {
  t.mock.method(catalog, "hasSharedRenderAssetAccess", async () => false);
  const photo = url("plantillas/removed/assets/photo.webp");
  const cover = url("plantillas/archived/assets/cover.webp");
  const persistedDraft = { nombre: "Before", objetos: [{ id: "gallery", cells: [{ mediaUrl: photo }] }, { id: "text", texto: "Before" }],
    secciones: [{ fondoImagen: photo }], portada: cover };
  const patch = { ...structuredClone(persistedDraft), nombre: "After", objetos: [...persistedDraft.objetos].reverse() };
  const bucket = { name: bucketName, file() { assert.fail("Preserving an existing reference must never read or copy Storage bytes"); } };
  assert.deepEqual(await normalizeAdministrativeDraftAssets(patch, { ...context, persistedDraft }, bucket), patch);
  assert.equal(catalog.hasSharedRenderAssetAccess.mock.callCount(), 0);
  await assert.rejects(createRenderAssetAuthorizer({ kind: "draft", ownerUid: "owner", draftId: "draft" }, bucketName).authorize(photo), { code: "permission-denied" });
});

test("new template references and altered URLs still require current catalog permission", async t => {
  t.mock.method(catalog, "hasSharedRenderAssetAccess", async () => false);
  const photo = url("plantillas/removed/assets/photo.webp");
  const persistedDraft = { objetos: [{ src: photo }] };
  for (const incoming of [url("plantillas/removed/assets/other.webp"), photo.replace("source-secret", "another-token"),
    ` ${photo}`, photo.replace(".firebasestorage.app", ".appspot.com"), photo.replace(/%2F/g, "%252F"),
    photo.replace(bucketName, "another-project.firebasestorage.app")]) {
    await assert.rejects(normalizeAdministrativeDraftAssets({ objetos: [{ src: incoming }] }, { ...context, persistedDraft }, storage().bucket), { code: "permission-denied" });
  }
  t.mock.method(catalog, "hasSharedRenderAssetAccess", async () => true);
  const fresh = { objetos: [{ src: url("plantillas/active/assets/new.webp") }] };
  assert.deepEqual(await normalizeAdministrativeDraftAssets(fresh, { ...context, persistedDraft }, storage().bucket), fresh);
});

test("text, metadata and different asset fields cannot authorize a new template reference", async t => {
  t.mock.method(catalog, "hasSharedRenderAssetAccess", async () => false);
  const photo = url("plantillas/removed/assets/photo.webp");
  for (const persistedDraft of [{ nombre: photo }, { objetos: [{ texto: photo }] }, { templateInput: { values: { src: photo } } },
    { objetos: [{ url: photo }] }, { thumbnailUrl: photo }, { adminAudit: { src: photo } }]) {
    await assert.rejects(normalizeAdministrativeDraftAssets({ objetos: [{ src: photo }] }, { ...context, persistedDraft }, storage().bucket), { code: "permission-denied" });
  }
  const persistedDraft = { objetos: [{ src: photo }] };
  for (const patch of [{ templateInput: { values: { src: photo } } }, { nombre: photo }, { thumbnailUrl: photo }]) {
    await assert.rejects(normalizeAdministrativeDraftAssets(patch, { ...context, persistedDraft }, storage().bucket), { code: "permission-denied" });
  }
});

test("persisted references to private or other unavailable namespaces are never exempt", async t => {
  t.mock.method(catalog, "hasSharedRenderAssetAccess", async () => false);
  for (const assetPath of ["usuarios/third/imagenes/private.webp", "proveedores/private/photo.webp", "borradores/draft/index.html",
    "previews/private.webp", "iconos/archived.svg", "plantillas/removed/private.webp"]) {
    const persistedDraft = { objetos: [{ src: url(assetPath) }] };
    await assert.rejects(normalizeAdministrativeDraftAssets(persistedDraft, { ...context, persistedDraft }, storage().bucket), { code: "permission-denied" });
  }
});
