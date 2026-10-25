import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const { prepareProviderImage, isProviderMediaPath, requireProviderMediaId, verifyProviderImageReferences } = require("./lib/providers/betaMedia.js");

test("provider media paths cannot traverse or proxy other namespaces", () => {
  assert.equal(isProviderMediaPath("provider_a", "proveedores/provider_a/portada/portada-original.jpg"), true);
  assert.equal(isProviderMediaPath("provider_a", "proveedores/provider_a/media/img_123.webp"), true);
  for (const path of ["proveedores/provider_b/media/img_123.webp", "usuarios/a/imagenes/x.png", "proveedores/provider_a/media/../x.png", "proveedores/provider_a/media/x.svg", "https://example.test/x.png"]) {
    assert.equal(isProviderMediaPath("provider_a", path), false);
  }
  assert.throws(() => requireProviderMediaId("../other"));
});

test("new photo validation checks actual bytes and strips metadata", async () => {
  const source = await sharp({ create: { width: 12, height: 8, channels: 3, background: "#692B9A" } }).png().withMetadata().toBuffer();
  const output = await prepareProviderImage(source, "image/png");
  const metadata = await sharp(output.data).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 12);
  assert.equal(metadata.height, 8);
  assert.equal(metadata.exif, undefined);
  await assert.rejects(prepareProviderImage(source, "image/jpeg"), { code: "invalid-argument" });
  await assert.rejects(prepareProviderImage(Buffer.from("not an image"), "image/png"), { code: "invalid-argument" });
  await assert.rejects(prepareProviderImage(Buffer.alloc(15 * 1024 * 1024 + 1), "image/png"), { code: "invalid-argument" });
});

test("only registered own media is accepted; imported images remain reusable", async () => {
  const imported = { id: "legacy", storagePath: "proveedores/provider_a/galeria/legacy.jpg", tipo: "galeria", alt: "Old", orden: 0, url: "https://private.invalid", urlOriginal: "https://source.invalid", tamanioBytes: 80_000_000 };
  const uploaded = { ...imported, id: "new_photo", storagePath: "proveedores/provider_a/media/new_photo.webp", tamanioBytes: 500 };
  const db = { doc: path => path };
  const transaction = { get: async path => ({ data: () => path.endsWith("/new_photo") ? { image: uploaded } : undefined }) };
  const result = await verifyProviderImageReferences(transaction, db, "provider_a", {
    portada: { ...uploaded, tamanioBytes: 1 }, logo: null, galeria: [{ ...imported, alt: "Updated" }],
  }, { imagenes: { portada: null, galeria: [imported] } });
  assert.equal(result.portada.tamanioBytes, 500);
  assert.equal(result.portada.tipo, "portada");
  assert.equal(result.galeria[0].tamanioBytes, 80_000_000);
  assert.equal(result.galeria[0].alt, "Updated");
  assert.equal(result.galeria[0].url, null);
  assert.equal(result.galeria[0].urlOriginal, imported.urlOriginal);
  await assert.rejects(verifyProviderImageReferences(transaction, db, "provider_a", {
    portada: { ...uploaded, id: "unregistered" }, galeria: [],
  }, { imagenes: { portada: null, galeria: [] } }), { code: "failed-precondition" });
  await assert.rejects(verifyProviderImageReferences(transaction, db, "provider_a", {
    portada: { ...uploaded, storagePath: "proveedores/provider_b/media/new_photo.webp" }, galeria: [],
  }, { imagenes: { portada: null, galeria: [] } }), { code: "invalid-argument" });
});
