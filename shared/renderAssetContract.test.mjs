import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeRenderAssetObject,
  normalizeRenderAssetState,
  normalizeRenderAssetSection,
  resolveGalleryCellMediaUrl,
  resolveObjectPrimaryAssetUrl,
  resolveSectionDecorationAssetUrl,
  resolveSectionEdgeDecorationAssetUrl,
} from "./renderAssetContract.js";
import {
  FIXTURE_PATHS,
  buildFirebaseDownloadUrl,
  createRepresentativeDraftLoadStageState,
  createRepresentativePreviewPreparationStageState,
} from "./renderAssetContractFixtures.mjs";

test("normalizes image objects with legacy url into canonical src", () => {
  const normalized = normalizeRenderAssetObject({
    id: "img-1",
    tipo: "imagen",
    url: "https://cdn.example.com/photo.jpg",
  });

  assert.equal(resolveObjectPrimaryAssetUrl(normalized), "https://cdn.example.com/photo.jpg");
  assert.equal(normalized.src, "https://cdn.example.com/photo.jpg");
  assert.equal(normalized.url, "https://cdn.example.com/photo.jpg");
});

test("normalizes raster icon objects with legacy url into canonical src", () => {
  const normalized = normalizeRenderAssetObject({
    id: "icon-1",
    tipo: "icono",
    formato: "png",
    url: "https://cdn.example.com/icon.png",
  });

  assert.equal(resolveObjectPrimaryAssetUrl(normalized), "https://cdn.example.com/icon.png");
  assert.equal(normalized.src, "https://cdn.example.com/icon.png");
});

test("normalizes gallery cells to canonical mediaUrl", () => {
  const normalized = normalizeRenderAssetObject({
    id: "gallery-1",
    tipo: "galeria",
    cells: [
      { mediaUrl: "https://cdn.example.com/a.jpg" },
      { url: "https://cdn.example.com/b.jpg" },
      { src: "https://cdn.example.com/c.jpg" },
    ],
  });

  assert.deepEqual(
    normalized.cells.map((cell) => resolveGalleryCellMediaUrl(cell)),
    [
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/b.jpg",
      "https://cdn.example.com/c.jpg",
    ]
  );
  assert.deepEqual(
    normalized.cells.map((cell) => cell.mediaUrl),
    [
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/b.jpg",
      "https://cdn.example.com/c.jpg",
    ]
  );
});

test("preserves canonical section background and decoration fields", () => {
  const normalized = normalizeRenderAssetSection({
    id: "section-1",
    fondoImagen: "https://cdn.example.com/background.jpg",
    decoracionesFondo: {
      parallax: "soft",
      items: [
        {
          id: "decor-1",
          src: "https://cdn.example.com/decor.png",
        },
      ],
    },
    decoracionesBorde: {
      top: {
        url: "https://cdn.example.com/edge-top.png",
        enabled: true,
        heightDesktopRatio: 0.42,
        heightMobileRatio: 0.18,
        offsetDesktopPx: 12,
        offsetMobilePx: -8,
        mode: "contain-x",
      },
      bottom: {
        src: "https://cdn.example.com/edge-bottom.png",
        enabled: false,
      },
    },
  });

  assert.equal(normalized.fondoImagen, "https://cdn.example.com/background.jpg");
  assert.equal(
    normalized.decoracionesFondo.items[0].src,
    "https://cdn.example.com/decor.png"
  );
  assert.equal(
    resolveSectionEdgeDecorationAssetUrl(normalized.decoracionesBorde.top),
    "https://cdn.example.com/edge-top.png"
  );
  assert.equal(normalized.decoracionesBorde.top.heightDesktopRatio, 0.42);
  assert.equal(normalized.decoracionesBorde.top.heightMobileRatio, 0.18);
  assert.equal(normalized.decoracionesBorde.top.offsetDesktopPx, 12);
  assert.equal(normalized.decoracionesBorde.top.offsetMobilePx, -8);
  assert.equal(normalized.decoracionesBorde.top.mode, "contain-x");
  assert.equal(
    normalized.decoracionesBorde.bottom.src,
    "https://cdn.example.com/edge-bottom.png"
  );
  assert.equal(normalized.decoracionesBorde.bottom.enabled, false);
});

test("normalizes representative draft-load assets the same way preview preparation expects them", () => {
  const draftLoadState = createRepresentativeDraftLoadStageState();
  const previewPreparationState = createRepresentativePreviewPreparationStageState();

  const normalizedDraftLoad = normalizeRenderAssetState(draftLoadState);
  const normalizedPreviewPreparation = normalizeRenderAssetState(
    previewPreparationState
  );

  assert.deepEqual(normalizedPreviewPreparation, normalizedDraftLoad);

  const heroImage = normalizedDraftLoad.objetos.find((entry) => entry.id === "hero-image");
  const rasterIcon = normalizedDraftLoad.objetos.find((entry) => entry.id === "icon-raster");
  const gallery = normalizedDraftLoad.objetos.find((entry) => entry.id === "gallery-main");
  const countdown = normalizedDraftLoad.objetos.find((entry) => entry.id === "count-modern");
  const heroSection = normalizedDraftLoad.secciones.find(
    (entry) => entry.id === "section-hero"
  );

  assert.equal(
    heroImage.src,
    buildFirebaseDownloadUrl(FIXTURE_PATHS.heroImage, "hero-load")
  );
  assert.equal(
    resolveObjectPrimaryAssetUrl(rasterIcon),
    buildFirebaseDownloadUrl(FIXTURE_PATHS.rasterIcon, "icon-load")
  );
  assert.deepEqual(
    gallery.cells.map((cell) => resolveGalleryCellMediaUrl(cell)),
    [
      buildFirebaseDownloadUrl(FIXTURE_PATHS.galleryOne, "gallery-load-1"),
      buildFirebaseDownloadUrl(FIXTURE_PATHS.galleryTwo, "gallery-load-2"),
      buildFirebaseDownloadUrl(FIXTURE_PATHS.galleryThree, "gallery-load-3"),
    ]
  );
  assert.equal(
    countdown.frameSvgUrl,
    buildFirebaseDownloadUrl(FIXTURE_PATHS.countdownFrame, "countdown-load")
  );
  assert.equal(
    heroSection.fondoImagen,
    buildFirebaseDownloadUrl(FIXTURE_PATHS.sectionBackground, "section-load")
  );
  assert.equal(
    resolveSectionDecorationAssetUrl(heroSection.decoracionesFondo.superior),
    buildFirebaseDownloadUrl(FIXTURE_PATHS.decorTop, "decor-top-load")
  );
  assert.equal(
    resolveSectionDecorationAssetUrl(heroSection.decoracionesFondo.inferior),
    buildFirebaseDownloadUrl(FIXTURE_PATHS.decorBottom, "decor-bottom-load")
  );
});
