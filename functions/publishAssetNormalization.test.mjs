import test from "node:test";
import assert from "node:assert/strict";

import {
  FIXTURE_BUCKET,
  FIXTURE_PATHS,
  createRepresentativePublishNormalizationStageState,
} from "../shared/renderAssetContractFixtures.mjs";
import {
  buildMockSignedUrl,
  installFirebaseStorageMock,
} from "./testUtils/firebaseStorageMock.mjs";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const { normalizePublishRenderStateAssets } = requireBuiltModule(
  "lib/utils/publishAssetNormalization.js"
);

test("normalizes representative publish assets and rebuilds section decorations", async (t) => {
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: FIXTURE_BUCKET,
    files: {
      [FIXTURE_PATHS.heroImage]: {},
      [FIXTURE_PATHS.rasterIcon]: {},
      [FIXTURE_PATHS.galleryOne]: {},
      [FIXTURE_PATHS.galleryTwo]: {},
      [FIXTURE_PATHS.galleryThree]: {},
      [FIXTURE_PATHS.sectionBackground]: {},
      [FIXTURE_PATHS.decorTop]: {},
      [FIXTURE_PATHS.decorBottom]: {},
      [FIXTURE_PATHS.countdownFrame]: {},
    },
  });
  t.after(() => storageMock.restore());

  const rawState = createRepresentativePublishNormalizationStageState();
  const normalizedState = await normalizePublishRenderStateAssets(rawState);

  const heroImage = normalizedState.objetos.find((entry) => entry.id === "hero-image");
  const rasterIcon = normalizedState.objetos.find((entry) => entry.id === "icon-raster");
  const gallery = normalizedState.objetos.find((entry) => entry.id === "gallery-main");
  const countdown = normalizedState.objetos.find((entry) => entry.id === "count-modern");
  const heroSection = normalizedState.secciones.find(
    (entry) => entry.id === "section-hero"
  );

  assert.equal(
    heroImage.src,
    buildMockSignedUrl(FIXTURE_BUCKET, FIXTURE_PATHS.heroImage)
  );
  assert.equal(
    heroImage.url,
    buildMockSignedUrl(FIXTURE_BUCKET, FIXTURE_PATHS.heroImage)
  );
  assert.equal(
    rasterIcon.src,
    buildMockSignedUrl(FIXTURE_BUCKET, FIXTURE_PATHS.rasterIcon)
  );
  assert.deepEqual(
    gallery.cells.map((cell) => cell.mediaUrl),
    [
      buildMockSignedUrl(FIXTURE_BUCKET, FIXTURE_PATHS.galleryOne),
      buildMockSignedUrl(FIXTURE_BUCKET, FIXTURE_PATHS.galleryTwo),
      buildMockSignedUrl(FIXTURE_BUCKET, FIXTURE_PATHS.galleryThree),
    ]
  );
  assert.equal(
    countdown.frameSvgUrl,
    buildMockSignedUrl(FIXTURE_BUCKET, FIXTURE_PATHS.countdownFrame)
  );
  assert.equal(
    heroSection.fondoImagen,
    buildMockSignedUrl(FIXTURE_BUCKET, FIXTURE_PATHS.sectionBackground)
  );
  assert.equal(heroSection.decoracionesFondo.parallax, "soft");
  assert.deepEqual(
    heroSection.decoracionesFondo.items.map((item) => item.id),
    ["decor-top", "decor-bottom"]
  );
  assert.deepEqual(
    heroSection.decoracionesFondo.items.map((item) => item.src),
    [
      buildMockSignedUrl(FIXTURE_BUCKET, FIXTURE_PATHS.decorTop),
      buildMockSignedUrl(FIXTURE_BUCKET, FIXTURE_PATHS.decorBottom),
    ]
  );
  assert.equal("superior" in heroSection.decoracionesFondo, false);
  assert.equal("inferior" in heroSection.decoracionesFondo, false);
  assert.equal(storageMock.downloadReads.length, 0);
  assert.equal(normalizedState.diagnostics.dimensionDownloadCount, 0);
});

test("does not download full image bytes for a legacy crop without dimensions", async (t) => {
  const path = "usuarios/u-legacy/imagenes/cropped.webp";
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: FIXTURE_BUCKET,
    files: { [path]: {} },
  });
  t.after(() => storageMock.restore());

  const normalizedState = await normalizePublishRenderStateAssets({
    objetos: [
      {
        id: "legacy-crop",
        tipo: "imagen",
        src: path,
        storagePath: path,
        cropX: 10,
        cropY: 12,
        cropWidth: 120,
        cropHeight: 80,
      },
    ],
    secciones: [],
  }, { purpose: "draft-preview" });

  assert.equal(normalizedState.objetos[0].ancho, undefined);
  assert.equal(normalizedState.objetos[0].alto, undefined);
  assert.equal(normalizedState.diagnostics.legacyMissingDimensionCount, 1);
  assert.equal(normalizedState.diagnostics.dimensionDownloadCount, 0);
  assert.equal(storageMock.downloadReads.length, 0);
});

test("normalizes section edge decoration assets", async (t) => {
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: FIXTURE_BUCKET,
    files: {
      [FIXTURE_PATHS.decorTop]: {},
      [FIXTURE_PATHS.decorBottom]: {},
    },
  });
  t.after(() => storageMock.restore());

  const normalizedState = await normalizePublishRenderStateAssets({
    objetos: [],
    secciones: [
      {
        id: "section-edge",
        altura: 500,
        altoModo: "pantalla",
        fondo: "#fff",
        decoracionesBorde: {
          top: {
            enabled: true,
            src: FIXTURE_PATHS.decorTop,
            storagePath: FIXTURE_PATHS.decorTop,
            nombre: "Flor superior",
            heightDesktopRatio: 0.4,
            heightMobileRatio: 0.18,
            offsetDesktopPx: 8,
            offsetMobilePx: -4,
            mode: "cover-x",
          },
          bottom: {
            enabled: false,
            src: buildMockSignedUrl(FIXTURE_BUCKET, FIXTURE_PATHS.decorBottom),
            storagePath: FIXTURE_PATHS.decorBottom,
            nombre: "Flor inferior",
          },
        },
      },
    ],
  });

  const section = normalizedState.secciones[0];
  assert.equal(
    section.decoracionesBorde.top.src,
    buildMockSignedUrl(FIXTURE_BUCKET, FIXTURE_PATHS.decorTop)
  );
  assert.equal(section.decoracionesBorde.top.heightDesktopRatio, 0.4);
  assert.equal(section.decoracionesBorde.top.heightMobileRatio, 0.18);
  assert.equal(section.decoracionesBorde.top.offsetDesktopPx, 8);
  assert.equal(section.decoracionesBorde.top.offsetMobilePx, -4);
  assert.equal(section.decoracionesBorde.top.mode, "cover-x");
  assert.equal(
    section.decoracionesBorde.bottom.src,
    buildMockSignedUrl(FIXTURE_BUCKET, FIXTURE_PATHS.decorBottom)
  );
  assert.equal(section.decoracionesBorde.bottom.enabled, false);
});

test("reuses a verified Firebase download URL without signing the asset again", async (t) => {
  const token = "persisted-download-token";
  const path = "usuarios/u-1/imagenes/hero.webp";
  const encodedPath = encodeURIComponent(path);
  const downloadUrl =
    `https://firebasestorage.googleapis.com/v0/b/${FIXTURE_BUCKET}/o/` +
    `${encodedPath}?alt=media&token=${token}`;
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: FIXTURE_BUCKET,
    files: {
      [path]: {
        metadata: {
          metadata: {
            firebaseStorageDownloadTokens: token,
          },
        },
      },
    },
  });
  t.after(() => storageMock.restore());

  const normalizedState = await normalizePublishRenderStateAssets({
    objetos: [
      {
        id: "hero",
        tipo: "imagen",
        src: downloadUrl,
        url: downloadUrl,
        storagePath: path,
      },
    ],
    secciones: [],
  });

  assert.equal(normalizedState.objetos[0].src, downloadUrl);
  assert.equal(normalizedState.objetos[0].url, downloadUrl);
  assert.equal(storageMock.metadataReads.length, 1);
  assert.equal(storageMock.existsReads.length, 0);
  assert.equal(storageMock.signedUrlReads.length, 0);
});

test("trusts a canonical upload descriptor without repeating metadata or signing reads", async (t) => {
  const token = "canonical-download-token";
  const generation = "1777000000000000";
  const path = "usuarios/u-1/imagenes/canonical.webp";
  const downloadUrl =
    `https://firebasestorage.googleapis.com/v0/b/${FIXTURE_BUCKET}/o/` +
    `${encodeURIComponent(path)}?alt=media&token=${token}`;
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: FIXTURE_BUCKET,
    files: {
      [path]: {
        metadata: {
          generation,
          metadata: {
            firebaseStorageDownloadTokens: token,
          },
        },
      },
    },
  });
  t.after(() => storageMock.restore());

  const normalizedState = await normalizePublishRenderStateAssets({
    objetos: [
      {
        id: "canonical",
        tipo: "imagen",
        src: downloadUrl,
        url: downloadUrl,
        storagePath: path,
        storageGeneration: generation,
        storageDownloadToken: token,
        ancho: 1600,
        alto: 1067,
        cropX: 10,
        cropY: 12,
        cropWidth: 800,
        cropHeight: 600,
      },
    ],
    secciones: [],
  }, { purpose: "draft-preview" });

  assert.equal(normalizedState.objetos[0].src, downloadUrl);
  assert.equal(normalizedState.objetos[0].url, downloadUrl);
  assert.equal(storageMock.metadataReads.length, 0);
  assert.equal(storageMock.signedUrlReads.length, 0);
  assert.equal(storageMock.downloadReads.length, 0);
  assert.equal(normalizedState.diagnostics.canonicalDescriptorReuseCount, 2);
  assert.equal(normalizedState.diagnostics.persistedDimensionCount, 1);
  assert.equal(normalizedState.diagnostics.dimensionDownloadCount, 0);
});

test("falls back to a signed URL when the persisted download token is stale", async (t) => {
  const path = "usuarios/u-1/imagenes/stale.webp";
  const staleUrl =
    `https://firebasestorage.googleapis.com/v0/b/${FIXTURE_BUCKET}/o/` +
    `${encodeURIComponent(path)}?alt=media&token=stale-token`;
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: FIXTURE_BUCKET,
    files: {
      [path]: {
        metadata: {
          metadata: {
            firebaseStorageDownloadTokens: "current-token",
          },
        },
      },
    },
  });
  t.after(() => storageMock.restore());

  const normalizedState = await normalizePublishRenderStateAssets({
    objetos: [{ id: "stale", tipo: "imagen", src: staleUrl }],
    secciones: [],
  });

  assert.equal(
    normalizedState.objetos[0].src,
    buildMockSignedUrl(FIXTURE_BUCKET, path)
  );
  assert.equal(storageMock.metadataReads.length, 1);
  assert.equal(storageMock.signedUrlReads.length, 1);
});
