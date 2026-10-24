import test from "node:test";
import assert from "node:assert/strict";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";
import { installFirebaseStorageMock, buildMockSignedUrl } from "./testUtils/firebaseStorageMock.mjs";

const { normalizePublishRenderStateAssets: normalize } = requireBuiltModule("lib/utils/publishAssetNormalization.js");
const catalog = requireBuiltModule("lib/render/renderAssetCatalogAccess.js");
const { parseRenderAssetReference } = requireBuiltModule("lib/render/renderAssetReference.js");
const BUCKET = "demo-render-authorization.firebasestorage.app";
const A = { kind: "draft", ownerUid: "owner-a", draftId: "draft-a" };
const B = { kind: "draft", ownerUid: "owner-b", draftId: "draft-b" };
const own = "usuarios/owner-a/imagenes/photo.webp";
const foreign = "usuarios/owner-b/imagenes/photo.webp";
const firebase = (path, suffix = "?alt=media&token=previous-token") =>
  `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}${suffix}`;
const state = (src, rest = {}) => ({ objetos: [{ tipo: "imagen", id: "image", src, ...rest }], secciones: [] });
const denied = error => error.code === "permission-denied" &&
  !/owner-|proveedores|token=|https:/.test(error.message);

function storage(t, files = {}) {
  const mock = installFirebaseStorageMock({ defaultBucketName: BUCKET, files });
  t.after(() => mock.restore());
  return mock;
}

test("missing or invalid authorization context fails before any Storage access", async () => {
  for (const assetAccess of [undefined, {}, { kind: "internal" }, { ...A, ownerUid: "" }, { ...A, ownerUid: "owner-a%2fother" }]) {
    await assert.rejects(normalize(state(firebase(foreign)), { assetAccess }), denied);
  }
});

test("owner can render own image and thumbnails, without consulting catalog permissions", async t => {
  const paths = [own, "usuarios/owner-a/thumbnails/photo.webp", "thumbnails_borradores/owner-a/draft-a.webp"];
  const mock = storage(t, Object.fromEntries(paths.map(path => [path, {}])));
  const result = await normalize({ objetos: paths.map(src => ({ tipo: "imagen", src })), secciones: [] }, { assetAccess: A });
  assert.deepEqual(result.objetos.map(object => object.src), paths.map(path => buildMockSignedUrl(BUCKET, path)));
  assert.equal(mock.signedUrlReads.length, paths.length);
});

test("all C0 and DEL control characters fail closed in context and raw or encoded object paths", async t => {
  const mock = storage(t);
  for (const code of [...Array(32).keys(), 127]) {
    const character = String.fromCharCode(code);
    const badPath = `${own}-x${character}x`;
    for (const value of [badPath, firebase(badPath)]) {
      assert.throws(() => parseRenderAssetReference(value, BUCKET), denied);
    }
    for (const key of ["ownerUid", "draftId"]) {
      await assert.rejects(normalize(state(own), { assetAccess: { ...A, [key]: `x${character}x` } }), denied);
    }
  }
  assert.equal(mock.metadataReads.length, 0);
  assert.equal(mock.signedUrlReads.length, 0);
});

const representations = [
  ["raw", foreign],
  ["leading slash", `/${foreign}`],
  ["encoded path", encodeURIComponent(foreign)],
  ["double encoded path", encodeURIComponent(encodeURIComponent(foreign))],
  ["gs", `gs://${BUCKET}/${foreign}`],
  ["legacy bucket spelling", `gs://demo-render-authorization.appspot.com/${foreign}`],
  ["Firebase token", firebase(foreign)],
  ["Firebase parameters", firebase(foreign, "?generation=123&token=old&alt=media#fragment")],
  ["Firebase double encoded", firebase(encodeURIComponent(foreign))],
  ["Firebase trailing hostname dot", firebase(foreign).replace("googleapis.com/", "googleapis.com./")],
  ["Firebase encoded hostname", firebase(foreign).replace("firebasestorage", "%66irebasestorage")],
  ["protocol relative", firebase(foreign).replace("https:", "")],
  ["GCS path style", `https://storage.googleapis.com/${BUCKET}/${foreign}?X-Goog-Signature=old`],
  ["GCS virtual host", `https://${BUCKET}.storage.googleapis.com/${foreign}`],
  ["GCS browser", `https://storage.cloud.google.com/${BUCKET}/${foreign}`],
  ["JSON metadata", `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(foreign)}?alt=media`],
  ["JSON download", `https://www.googleapis.com/download/storage/v1/b/${BUCKET}/o/${encodeURIComponent(foreign)}?alt=media`],
  ["content API", `https://content-storage.googleapis.com/download/storage/v1/b/${BUCKET}/o/${encodeURIComponent(foreign)}?alt=media`],
  ["emulator form", `http://127.0.0.1:19199/v0/b/${BUCKET}/o/${encodeURIComponent(foreign)}?alt=media&token=old`],
];
for (const [name, value] of representations) {
  test(`A cannot obtain B's asset through ${name}, including a forged canonical descriptor`, async t => {
    const mock = storage(t, { [foreign]: { metadata: { generation: "123", metadata: { firebaseStorageDownloadTokens: "previous-token" } } } });
    await assert.rejects(normalize(state(value), { assetAccess: A }), denied);
    await assert.rejects(normalize(state(value, { storagePath: foreign, storageGeneration: "123", storageDownloadToken: "previous-token" }), { assetAccess: A }), denied);
    assert.equal(mock.metadataReads.length, 0);
    assert.equal(mock.signedUrlReads.length, 0);
    assert.equal(mock.downloadReads.length, 0);
  });
}

// Endpoint sources are recorded beside isStorageHost. These cases deliberately
// omit a private descriptor: otherwise that descriptor could hide an alias bug.
const officialAliases = [
  ["mTLS JSON", (path, bucket = BUCKET) => `https://storage.mtls.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=previous-token`],
  ["mTLS XML", (path, bucket = BUCKET) => `https://storage.mtls.googleapis.com/${bucket}/${path}?X-Goog-Signature=old`],
  ["mTLS browser", (path, bucket = BUCKET) => `https://storage.mtls.cloud.google.com/${bucket}/${path}?token=previous-token`],
  ["mTLS content", (path, bucket = BUCKET) => `https://content-storage.mtls.googleapis.com/download/storage/v1/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=previous-token`],
  ["legacy download path", (path, bucket = BUCKET) => `https://storage-download.googleapis.com/${bucket}/${path}?X-Goog-Signature=old`],
  ["legacy download virtual host", (path, bucket = BUCKET) => `https://${bucket}.storage-download.googleapis.com/${path}?X-Goog-Signature=old`],
  ["authenticated browser redirect", (path, bucket = BUCKET) => `https://abc123-apidata.googleusercontent.com/download/storage/v1/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=previous-token`],
];
for (const [name, representation] of officialAliases) {
  test(`official ${name} cannot expose foreign or provider assets with a prior token`, async t => {
    const provider = "proveedores/provider/portada/photo.webp";
    const mock = storage(t, { [own]: {}, [foreign]: {}, [provider]: {} });
    for (const path of [foreign, provider]) {
      for (const descriptor of [{}, { storagePath: own, storageGeneration: "123", storageDownloadToken: "previous-token" }]) {
        await assert.rejects(normalize(state(representation(path), descriptor), { assetAccess: A }), denied);
      }
    }
    await assert.rejects(normalize(state(representation(own, "other-bucket")), { assetAccess: A }), denied);
    assert.equal(mock.metadataReads.length, 0);
    assert.equal(mock.signedUrlReads.length, 0);
    assert.equal(mock.downloadReads.length, 0);
  });
}

test("documented own aliases resolve to the authorized canonical object, never the input URL", async t => {
  const mock = storage(t, { [own]: {} });
  for (const [, representation] of officialAliases) {
    const input = representation(own);
    assert.deepEqual(parseRenderAssetReference(input, BUCKET), { kind: "storage", bucketName: BUCKET, path: own });
    const result = await normalize(state(input), { assetAccess: A });
    assert.equal(result.objetos[0].src, buildMockSignedUrl(BUCKET, own));
  }
  assert.equal(mock.metadataReads.length, officialAliases.length);
  assert.equal(mock.signedUrlReads.length, officialAliases.length);
  assert.equal(mock.downloadReads.length, 0);
});

test("ambiguous Storage backslashes fail closed while ordinary external URLs remain external", async t => {
  const mock = storage(t);
  const values = [
    `https://storage.googleapis.com\\${BUCKET}/${own}`,
    `https://storage.mtls.googleapis.com/${BUCKET}\\${own}`,
    `https://${BUCKET}.storage-download.googleapis.com\\${own}`,
    `https://abc123-apidata.googleusercontent.com/download\\storage/v1/b/${BUCKET}/o/${encodeURIComponent(own)}`,
  ];
  for (const value of values) await assert.rejects(normalize(state(value), { assetAccess: A }), denied);
  for (const value of ["https://cdn.example.test/path\\image.png", "https://abc123-apidata.googleusercontent.com/images/photo.png",
    "https://abc123-apidata.googleusercontent.com/images/photo%25.png"]) {
    assert.deepEqual(parseRenderAssetReference(value, BUCKET), { kind: "external", value });
  }
  assert.equal(mock.metadataReads.length, 0);
  assert.equal(mock.signedUrlReads.length, 0);
});

test("encoded Storage API paths on browser redirect hosts never fall through as external URLs", async t => {
  const mock = storage(t);
  const value = `https://abc123-apidata.googleusercontent.com/%64ownload/storage/v1/b/${BUCKET}/o/${encodeURIComponent(foreign)}`;
  await assert.rejects(normalize(state(value), { assetAccess: A }), denied);
  assert.equal(mock.metadataReads.length, 0);
  assert.equal(mock.signedUrlReads.length, 0);
});

test("private and ambiguous namespaces never become shared by an internal or template context", async t => {
  const mock = storage(t);
  const original = catalog.hasSharedRenderAssetAccess;
  let lookups = 0;
  catalog.hasSharedRenderAssetAccess = async () => { lookups++; return true; };
  t.after(() => { catalog.hasSharedRenderAssetAccess = original; });
  const paths = [foreign, "proveedores/provider/portada/photo.webp", "borradores/draft-a/index.html",
    "publicadas/slug/index.html", "analytics-exports/raw/report.csv", "user_uploads/owner-a/image.jpg",
    "previews/owner-a/image.jpg", "public/image.jpg", "plantillas_secciones/image.jpg", "iconos_archived/icon.png",
    "assets/countdown/staging/frame.svg", "assets/countdown/frames/preset/draft/frame.svg",
    "usuarios/owner-a/private/secret.txt", "plantillas/template-a/private/image.jpg"];
  for (const assetAccess of [A, { kind: "template", actorUid: "admin", templateId: "template-a" }]) {
    for (const path of paths) await assert.rejects(normalize(state(firebase(path)), { assetAccess }), denied);
  }
  assert.equal(lookups, 0);
  assert.equal(mock.metadataReads.length, 0);
  assert.equal(mock.signedUrlReads.length, 0);
});

test("an allowed descriptor cannot hide an unauthorized URL, or vice versa", async t => {
  const mock = storage(t, { [own]: {}, [foreign]: {} });
  for (const [src, storagePath] of [[firebase(foreign), own], [firebase(own), foreign], ["https://cdn.example.test/photo.webp", foreign]]) {
    await assert.rejects(normalize(state(src, { storagePath }), { assetAccess: A }), denied);
  }
  await assert.rejects(normalize({ objetos: [{ storagePath: foreign }], secciones: [] }, { assetAccess: A }), denied);
  assert.equal(mock.metadataReads.length, 0);
  assert.equal(mock.signedUrlReads.length, 0);
});

test("authorization precedes resolution caches and never survives into another owner render", async t => {
  const mock = storage(t, { [own]: {} });
  const allowed = await normalize({ objetos: [{ src: own, url: firebase(own) }, { src: `gs://${BUCKET}/${own}` }], secciones: [] }, { assetAccess: A });
  assert.equal(mock.metadataReads.length, 1);
  assert.equal(mock.signedUrlReads.length, 1);
  assert.ok(allowed.diagnostics.metadataCacheHitCount >= 1);
  assert.ok(allowed.diagnostics.signedUrlCacheHitCount >= 1);
  await assert.rejects(normalize(state(firebase(own)), { assetAccess: B }), denied);
  assert.equal(mock.metadataReads.length, 1);
  assert.equal(mock.signedUrlReads.length, 1);
});

test("catalog permissions are checked before metadata and reused only inside the same context", async t => {
  const shared = "iconos/shared.png";
  const mock = storage(t, { [shared]: {} });
  const original = catalog.hasSharedRenderAssetAccess;
  const contexts = [];
  catalog.hasSharedRenderAssetAccess = async (path, bucket, context) => {
    assert.equal(mock.metadataReads.length, 0);
    assert.equal(path, shared); assert.equal(bucket, BUCKET);
    contexts.push(context); return true;
  };
  t.after(() => { catalog.hasSharedRenderAssetAccess = original; });
  const result = await normalize(state(firebase(shared), { url: shared }), { assetAccess: A });
  assert.equal(contexts.length, 1);
  assert.deepEqual(contexts[0], A);
  assert.equal(result.objetos[0].src, buildMockSignedUrl(BUCKET, shared));
  catalog.hasSharedRenderAssetAccess = async () => false;
  await assert.rejects(normalize(state(shared), { assetAccess: A }), denied);
  assert.equal(mock.metadataReads.length, 1);
});

test("fallback cannot return an input Storage URL after resolution fails", async t => {
  const mock = storage(t);
  const result = await normalize(state(firebase(own)), { assetAccess: A });
  assert.equal(result.objetos[0].src, "");
  assert.equal(mock.signedUrlReads.length, 0);
});

test("allowed canonical token reuse reconstructs the authorized current-object URL", async t => {
  const mock = storage(t);
  const result = await normalize(state(firebase(own, "?generation=123&token=previous-token&alt=media&arbitrary=value"), {
    storagePath: own, storageGeneration: "123", storageDownloadToken: "previous-token",
  }), { assetAccess: A });
  assert.equal(result.objetos[0].src, firebase(own));
  assert.equal(mock.metadataReads.length, 0);
  assert.equal(mock.signedUrlReads.length, 0);
});

test("malformed Storage references and foreign buckets fail closed without fallback", async t => {
  const mock = storage(t);
  const values = ["usuarios/owner-a/imagenes/../private.txt", "usuarios/owner-a/imagenes/%252e%252e/private.txt",
    `gs://${BUCKET}/usuarios/owner-a/imagenes/%ZZ`, `https://firebasestorage.googleapis.com/unknown/${foreign}`,
    `https://storage.googleapis.com/${BUCKET}/usuarios/owner-a/imagenes/../../owner-b/image.jpg`,
    "gs://other-bucket/usuarios/owner-a/imagenes/photo.jpg", "javascript:alert(1)", "blob:private"];
  for (const value of values) await assert.rejects(normalize(state(value), { assetAccess: A }), denied);
  assert.equal(mock.metadataReads.length, 0);
  assert.equal(mock.signedUrlReads.length, 0);
});

test("external HTTPS, inline images and checked-in site assets keep their existing delivery", async t => {
  const mock = storage(t);
  const values = ["https://cdn.example.test/image.png?version=2", "data:image/png;base64,AAAA", "/assets/img/sample.png"];
  const result = await normalize({ objetos: values.map(src => ({ tipo: "imagen", src })), secciones: [] }, { assetAccess: A });
  assert.deepEqual(result.objetos.map(object => object.src), values);
  assert.equal(mock.metadataReads.length, 0);
  assert.equal(mock.signedUrlReads.length, 0);
});

test("equivalent own representations resolve to the same authorization identity", () => {
  for (const input of [own, `gs://${BUCKET}/${own}`, firebase(own),
    `https://${BUCKET}.storage.googleapis.com/${own}?X-Goog-Signature=old`, encodeURIComponent(own)]) {
    assert.deepEqual(parseRenderAssetReference(input, BUCKET), { kind: "storage", bucketName: BUCKET, path: own });
  }
});
