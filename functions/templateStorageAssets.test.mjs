import test from "node:test";
import assert from "node:assert/strict";

import { normalizeRenderAssetState } from "../shared/renderAssetContract.js";
import {
  FIXTURE_BUCKET,
  FIXTURE_PATHS,
  buildFirebaseDownloadUrl,
  createRepresentativeTemplateCopyStagePayload,
} from "../shared/renderAssetContractFixtures.mjs";
import {
  installFirebaseStorageMock,
} from "./testUtils/firebaseStorageMock.mjs";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const {
  normalizeTemplateAssetValue,
  normalizeTemplateAssetsDeep,
} = requireBuiltModule("lib/templates/storageAssets.js");

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertTemplateSharedDownloadUrl(value, plantillaId, fileName) {
  assert.match(
    String(value || ""),
    new RegExp(
      `^https://firebasestorage\\.googleapis\\.com/v0/b/${escapeRegex(
        FIXTURE_BUCKET
      )}/o/plantillas%2F${escapeRegex(
        plantillaId
      )}%2Fassets%2F.+-${escapeRegex(fileName)}\\?alt=media&token=`
    )
  );
}

test("normalizes representative template-copy assets across supported field keys", async (t) => {
  const plantillaId = "template-fixture";
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: FIXTURE_BUCKET,
    files: {
      [FIXTURE_PATHS.heroImage]: {
        metadata: {
          contentType: "image/jpeg",
        },
      },
      [FIXTURE_PATHS.rasterIcon]: {
        metadata: {
          contentType: "image/png",
        },
      },
      [FIXTURE_PATHS.galleryOne]: {
        metadata: {
          contentType: "image/jpeg",
        },
      },
      [FIXTURE_PATHS.galleryTwo]: {
        metadata: {
          contentType: "image/jpeg",
        },
      },
      [FIXTURE_PATHS.sectionBackground]: {
        metadata: {
          contentType: "image/svg+xml",
        },
      },
      [FIXTURE_PATHS.decorTop]: {
        metadata: {
          contentType: "image/png",
        },
      },
      [FIXTURE_PATHS.decorBottom]: {
        metadata: {
          contentType: "image/png",
        },
      },
      [FIXTURE_PATHS.countdownFrame]: {
        metadata: {
          contentType: "image/svg+xml",
        },
      },
    },
  });
  t.after(() => storageMock.restore());

  const payload = createRepresentativeTemplateCopyStagePayload({ plantillaId });
  const assetCache = new Map();
  const [objetos, secciones, portada] = await Promise.all([
    normalizeTemplateAssetsDeep(payload.objetos, plantillaId, assetCache),
    normalizeTemplateAssetsDeep(payload.secciones, plantillaId, assetCache),
    normalizeTemplateAssetValue(payload.portada, plantillaId, assetCache),
  ]);
  const normalizedPayload = {
    ...payload,
    portada,
    objetos,
    secciones,
  };
  const normalizedRenderState = normalizeRenderAssetState({
    objetos: normalizedPayload.objetos,
    secciones: normalizedPayload.secciones,
  });

  const heroImage = normalizedPayload.objetos.find((entry) => entry.id === "hero-image");
  const gallery = normalizedPayload.objetos.find((entry) => entry.id === "gallery-main");
  const countdown = normalizedPayload.objetos.find((entry) => entry.id === "count-modern");
  const heroSection = normalizedPayload.secciones.find(
    (entry) => entry.id === "section-hero"
  );
  const normalizedHeroImage = normalizedRenderState.objetos.find(
    (entry) => entry.id === "hero-image"
  );
  const normalizedGallery = normalizedRenderState.objetos.find(
    (entry) => entry.id === "gallery-main"
  );
  const heroCopies = storageMock.copies.filter(
    (entry) => entry.sourcePath === FIXTURE_PATHS.heroImage
  );

  assert.equal(normalizedPayload.portada, heroImage.url);
  assert.equal(heroCopies.length, 1);
  assertTemplateSharedDownloadUrl(
    normalizedPayload.portada,
    plantillaId,
    "1769726410069_portada.jpg"
  );
  assertTemplateSharedDownloadUrl(
    heroImage.url,
    plantillaId,
    "1769726410069_portada.jpg"
  );
  assertTemplateSharedDownloadUrl(
    normalizedPayload.objetos.find((entry) => entry.id === "icon-raster").url,
    plantillaId,
    "1775000000002-marker-gold.png"
  );
  assertTemplateSharedDownloadUrl(
    gallery.cells[0].url,
    plantillaId,
    "1769826362132_9.jpg"
  );
  assertTemplateSharedDownloadUrl(
    gallery.cells[1].src,
    plantillaId,
    "1769826365146_10.jpg"
  );
  assert.equal(
    gallery.cells[2].mediaUrl,
    buildFirebaseDownloadUrl(
      `plantillas/${plantillaId}/assets/1775000000004-already-shared-gallery.jpg`,
      "shared-gallery-stable"
    )
  );
  assertTemplateSharedDownloadUrl(
    countdown.frameSvgUrl,
    plantillaId,
    "1775000000003-frame-floral.svg"
  );
  assertTemplateSharedDownloadUrl(
    heroSection.fondoImagen,
    plantillaId,
    "1754504606456_fondo-pareja3.svg"
  );
  assertTemplateSharedDownloadUrl(
    heroSection.decoracionesFondo.items[0].src,
    plantillaId,
    "1775000000000-flor-superior.png"
  );
  assertTemplateSharedDownloadUrl(
    heroSection.decoracionesFondo.items[1].url,
    plantillaId,
    "1775000000001-flor-inferior.png"
  );

  assert.equal(normalizedHeroImage.src, heroImage.url);
  assert.deepEqual(
    normalizedGallery.cells.map((cell) => cell.mediaUrl),
    [gallery.cells[0].url, gallery.cells[1].src, gallery.cells[2].mediaUrl]
  );
});
