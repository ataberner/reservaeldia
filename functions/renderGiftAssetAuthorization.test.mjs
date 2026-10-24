import test from "node:test";
import assert from "node:assert/strict";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";
import { installFirebaseStorageMock, buildMockSignedUrl } from "./testUtils/firebaseStorageMock.mjs";

const { prepareRenderPayload, generateHtmlFromPreparedRenderPayload } = requireBuiltModule("lib/render/prepareRenderPayload.js");
const bucketName = "demo-render-gifts.firebasestorage.app";
const assetAccess = { kind: "draft", ownerUid: "owner-a", draftId: "draft-a" };
const firebaseUrl = path => `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=old-token`;
const draft = gifts => ({ objetos: [{ id: "gift-cta", tipo: "regalo-boton", seccionId: "main",
  x: 40, y: 100, width: 180, height: 44, texto: "Ver regalos" }],
secciones: [{ id: "main", orden: 1, altura: 600, fondo: "#fff" }], gifts });
const config = imageUrl => ({ version: 2, enabled: true,
  giftLinks: [{ id: "gift", title: "Synthetic gift", url: "https://shop.example.test/gift", imageUrl, visible: true }] });

for (const privatePath of ["usuarios/owner-b/imagenes/private.webp", "proveedores/private/portada/photo.webp"]) {
  for (const field of ["imageUrl", "url", "giftListUrl"]) {
    test(`gift ${field} cannot pass a private ${privatePath.split("/")[0]} token into preview or publication`, async t => {
      const mock = installFirebaseStorageMock({ defaultBucketName: bucketName, files: { [privatePath]: {} } });
      t.after(() => mock.restore());
      const gifts = config("");
      if (field === "giftListUrl") gifts.giftListUrl = firebaseUrl(privatePath);
      else gifts.giftLinks[0][field] = firebaseUrl(privatePath);
      await assert.rejects(prepareRenderPayload(draft(gifts), { assetAccess }), { code: "permission-denied" });
      assert.equal(mock.metadataReads.length, 0);
      assert.equal(mock.signedUrlReads.length, 0);
    });
  }
}

test("own and external gift images reach both HTML surfaces through the shared authorization pipeline", async t => {
  const own = "usuarios/owner-a/imagenes/gift.webp";
  const mock = installFirebaseStorageMock({ defaultBucketName: bucketName, files: { [own]: {} } });
  t.after(() => mock.restore());
  for (const [input, expected] of [[own, buildMockSignedUrl(bucketName, own)], ["https://cdn.example.test/gift.webp", "https://cdn.example.test/gift.webp"]]) {
    const prepared = await prepareRenderPayload(draft(config(input)), { assetAccess });
    assert.equal(prepared.draftRenderState.gifts.giftLinks[0].imageUrl, expected);
    for (const isPreview of [true, false]) {
      const html = generateHtmlFromPreparedRenderPayload(prepared, { slug: "synthetic-gifts", isPreview });
      assert.ok(html.includes(expected.replaceAll("&", "&amp;")), "authorized gift image in HTML");
      assert.ok(html.includes("https://shop.example.test/gift"));
    }
  }
  assert.equal(mock.signedUrlReads.length, 1);
});

test("missing gift context fails closed even with only an external image", async () => {
  await assert.rejects(prepareRenderPayload(draft(config("https://cdn.example.test/gift.webp"))), { code: "permission-denied" });
});

test("scheme-less external gift domains retain the canonical gifts behavior without laundering Storage domains", async t => {
  const mock = installFirebaseStorageMock({ defaultBucketName: bucketName });
  t.after(() => mock.restore());
  const gifts = config("cdn.example.test/gift.webp");
  gifts.giftLinks[0].url = "shop.example.test/gift";
  gifts.giftListUrl = "registry.example.test/list";
  const prepared = await prepareRenderPayload(draft(gifts), { assetAccess });
  assert.equal(prepared.draftRenderState.gifts.giftLinks[0].imageUrl, "https://cdn.example.test/gift.webp");
  assert.equal(prepared.draftRenderState.gifts.giftLinks[0].url, "https://shop.example.test/gift");
  assert.equal(prepared.draftRenderState.gifts.giftListUrl, "https://registry.example.test/list");
  gifts.giftLinks[0].imageUrl = firebaseUrl("usuarios/owner-b/imagenes/private.webp").replace("https://", "");
  await assert.rejects(prepareRenderPayload(draft(gifts), { assetAccess }), { code: "permission-denied" });
  assert.equal(mock.metadataReads.length, 0);
});
