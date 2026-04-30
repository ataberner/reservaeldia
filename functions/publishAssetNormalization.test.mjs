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
