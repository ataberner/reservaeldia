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
