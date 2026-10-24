import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";
import { installFirebaseStorageMock } from "./testUtils/firebaseStorageMock.mjs";

const { inspectAndNormalizeSvg } = requireBuiltModule("lib/iconCatalog/svgValidation.js");
const { prepareRenderPayload, generateHtmlFromPreparedRenderPayload, validatePreparedRenderPayload } =
  requireBuiltModule("lib/render/prepareRenderPayload.js");
const catalog = requireBuiltModule("lib/render/renderAssetCatalogAccess.js");
const bucket = "demo-icon-snapshot.firebasestorage.app";
const access = { kind: "draft", ownerUid: "synthetic-owner", draftId: "synthetic-draft" };
const catalogPath = "iconos/synthetic-archived.svg";
const foreignPath = "usuarios/another-owner/imagenes/private.svg";
const url = (path, name = bucket) => `https://firebasestorage.googleapis.com/v0/b/${name}/o/${encodeURIComponent(path)}?alt=media&token=synthetic-token`;
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="currentColor"/></svg>';

async function canonicalSnapshot() {
  const report = await inspectAndNormalizeSvg({ svgText: svg, bytes: Buffer.byteLength(svg),
    fileName: "synthetic.svg", normalizeSafe: true, normalizeCurrentColor: false });
  assert.ok(report.renderable, "The existing backend SVG authority must accept the fixture");
  return report.renderable;
}

function icon(iconRender, extra = {}) {
  return { id: "synthetic-icon", tipo: "icono", formato: "svg", seccionId: "synthetic-section",
    x: 10, y: 20, width: 48, height: 48, color: "#7c3aed", iconRender,
    src: url(catalogPath), url: url(catalogPath), ...extra };
}

function draft(objects) {
  return { objetos: objects, secciones: [{ id: "synthetic-section", altoModo: "fijo", altura: 600 }] };
}

function harness(t, files = {}) {
  const storage = installFirebaseStorageMock({ defaultBucketName: bucket, files });
  const original = catalog.hasSharedRenderAssetAccess;
  const lookups = [];
  catalog.hasSharedRenderAssetAccess = async (path) => { lookups.push(path); return false; };
  t.after(() => { catalog.hasSharedRenderAssetAccess = original; storage.restore(); });
  return { storage, lookups };
}

const denied = (error) => error.code === "permission-denied";

test("the full prepared pipeline retains a verified SVG snapshot after catalog archival", async (t) => {
  const { storage, lookups } = harness(t);
  const source = draft([icon(await canonicalSnapshot(), {
    storagePath: catalogPath, storageGeneration: "synthetic-generation", storageDownloadToken: "synthetic-token",
  })]);
  const before = structuredClone(source);
  const prepared = await prepareRenderPayload(source, { assetAccess: access });
  assert.deepEqual(source, before, "Preparation must not mutate the stored draft/provenance");
  const normalized = prepared.objetosFinales[0];
  assert.match(normalized.src, /^data:image\/svg\+xml/);
  assert.equal(normalized.url, normalized.src);
  assert.equal("storagePath" in normalized, false);
  assert.equal("storageDownloadToken" in normalized, false);
  assert.equal(validatePreparedRenderPayload(prepared).canPublish, true);
  const html = generateHtmlFromPreparedRenderPayload(prepared, { isPreview: true, slug: "synthetic-preview" });
  assert.match(html, /icono-svg-canonico/);
  assert.doesNotMatch(html, /synthetic-token|synthetic-archived/);
  assert.deepEqual(lookups, []);
  assert.equal(storage.metadataReads.length, 0);
  assert.equal(storage.signedUrlReads.length, 0);
  assert.equal(storage.downloadReads.length, 0);
});

test("a valid SVG snapshot cannot hide an arbitrary private source or descriptor", async (t) => {
  const { storage, lookups } = harness(t);
  const snapshot = await canonicalSnapshot();
  for (const extra of [
    { src: url(foreignPath) }, { url: url(foreignPath) }, { storagePath: foreignPath },
    { src: url("proveedores/synthetic/private.webp") },
    { src: url(catalogPath, "another-project.appspot.com") },
    { src: url("iconos_archived/synthetic.svg") },
  ]) await assert.rejects(prepareRenderPayload(draft([icon(snapshot, extra)]), { assetAccess: access }), denied);
  assert.equal(storage.metadataReads.length, 0);
  assert.equal(storage.signedUrlReads.length, 0);
  assert.deepEqual(lookups, []);
});

test("invalid snapshots do not bypass the active catalog requirement", async (t) => {
  const { storage, lookups } = harness(t);
  const valid = await canonicalSnapshot();
  const unsafeSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script><rect width="24" height="24"/></svg>';
  const forged = { ...valid, svgText: unsafeSvg, bytes: Buffer.byteLength(unsafeSvg),
    hashSha256: createHash("sha256").update(unsafeSvg).digest("hex") };
  for (const snapshot of [{ schemaVersion: 1 }, { ...valid, bytes: valid.bytes + 1 },
    { ...valid, hashSha256: "0".repeat(64) }, { ...valid, geometryCount: valid.geometryCount + 1 }, forged]) {
    await assert.rejects(prepareRenderPayload(draft([icon(snapshot)]), { assetAccess: access }), denied);
  }
  assert.ok(lookups.length >= 5);
  assert.equal(storage.metadataReads.length, 0);
  assert.equal(storage.signedUrlReads.length, 0);
});

test("a forged canonical snapshot using an otherwise owned asset remains blocked by render validation", async (t) => {
  const path = "usuarios/synthetic-owner/imagenes/synthetic.svg";
  const { lookups } = harness(t, { [path]: {} });
  const valid = await canonicalSnapshot();
  const prepared = await prepareRenderPayload(draft([icon({ ...valid, hashSha256: "0".repeat(64) },
    { src: url(path), url: url(path) })]), { assetAccess: access });
  const validation = validatePreparedRenderPayload(prepared);
  assert.equal(prepared.objetosFinales[0].iconRender, null);
  assert.equal(validation.canPublish, false);
  assert.ok(validation.blockers.some((entry) => entry.code === "icon-svg-canonical-invalid"));
  assert.deepEqual(lookups, []);
});

test("adding iconRender to another object type does not open the snapshot exception", async (t) => {
  const { storage } = harness(t);
  const snapshot = await canonicalSnapshot();
  await assert.rejects(prepareRenderPayload(draft([icon(snapshot, { tipo: "imagen" })]), { assetAccess: access }), denied);
  await assert.rejects(prepareRenderPayload(draft([icon(snapshot, { formato: "png" })]), { assetAccess: access }), denied);
  assert.equal(storage.metadataReads.length, 0);
  assert.equal(storage.signedUrlReads.length, 0);
});
