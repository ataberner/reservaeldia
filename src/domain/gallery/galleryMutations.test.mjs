import assert from "node:assert/strict";
import test from "node:test";

import {
  addGalleryPhotos,
  applyGalleryMutationToObjects,
  getGalleryPhotos,
  removeGalleryPhoto,
  replaceGalleryPhoto,
  reorderGalleryPhotos,
  resolveGalleryMediaKey,
  switchGalleryLayout,
} from "./galleryMutations.js";

function fixedGallery(overrides = {}) {
  return {
    id: "gal-1",
    tipo: "galeria",
    rows: 1,
    cols: 3,
    gap: 8,
    radius: 6,
    ratio: "1:1",
    width: 300,
    height: 100,
    cells: [
      { id: "slot-a", mediaUrl: "https://cdn.test/a.jpg", storagePath: "usuarios/u/imagenes/a.jpg" },
      { id: "slot-b", mediaUrl: null, fit: "contain", bg: "#fff" },
      { id: "slot-c", src: "https://cdn.test/c.jpg", assetId: "asset-c" },
    ],
    ...overrides,
  };
}

test("getGalleryPhotos resolves mediaUrl/url/src in display order", () => {
  const gallery = fixedGallery({
    cells: [
      { id: "a", url: "https://cdn.test/a.jpg" },
      { id: "empty", mediaUrl: "" },
      { id: "c", src: "https://cdn.test/c.jpg" },
    ],
  });

  assert.deepEqual(
    getGalleryPhotos(gallery).map((photo) => ({
      displayIndex: photo.displayIndex,
      sourceIndex: photo.sourceIndex,
      mediaUrl: photo.mediaUrl,
    })),
    [
      { displayIndex: 0, sourceIndex: 0, mediaUrl: "https://cdn.test/a.jpg" },
      { displayIndex: 1, sourceIndex: 2, mediaUrl: "https://cdn.test/c.jpg" },
    ]
  );
});

test("addGalleryPhotos fills fixed empty slots and preserves storage identity", () => {
  const gallery = fixedGallery();
  const result = addGalleryPhotos(gallery, {
    mediaUrl: "https://cdn.test/b.jpg",
    storagePath: "usuarios/u/imagenes/b.jpg",
    assetId: "asset-b",
    fit: "cover",
  });

  assert.equal(result.changed, true);
  assert.equal(result.addedCount, 1);
  assert.equal(result.gallery.cells[1].id, "slot-b");
  assert.equal(result.gallery.cells[1].mediaUrl, "https://cdn.test/b.jpg");
  assert.equal(result.gallery.cells[1].storagePath, "usuarios/u/imagenes/b.jpg");
  assert.equal(result.gallery.cells[1].assetId, "asset-b");
  assert.equal(gallery.cells[1].mediaUrl, null);
});

test("fixed full galleries reject add without appending hidden cells", () => {
  const gallery = fixedGallery({
    cells: [
      { mediaUrl: "https://cdn.test/a.jpg" },
      { mediaUrl: "https://cdn.test/b.jpg" },
      { mediaUrl: "https://cdn.test/c.jpg" },
    ],
  });

  const result = addGalleryPhotos(gallery, "https://cdn.test/d.jpg");
  assert.equal(result.changed, false);
  assert.equal(result.reason, "fixed-gallery-full");
  assert.equal(result.gallery.cells.length, 3);
});

test("removeGalleryPhoto removes only a gallery usage and keeps cell style/id", () => {
  const uploadedLibrary = [{ id: "asset-a", url: "https://cdn.test/a.jpg" }];
  const gallery = fixedGallery();
  const result = removeGalleryPhoto(gallery, { sourceIndex: 0 });

  assert.equal(result.changed, true);
  assert.equal(result.gallery.cells[0].id, "slot-a");
  assert.equal(result.gallery.cells[0].mediaUrl, null);
  assert.equal(result.gallery.cells[0].storagePath, undefined);
  assert.equal(result.gallery.cells[0].fit, "cover");
  assert.deepEqual(uploadedLibrary, [{ id: "asset-a", url: "https://cdn.test/a.jpg" }]);
});

test("replaceGalleryPhoto preserves position and stable cell id", () => {
  const gallery = fixedGallery();
  const result = replaceGalleryPhoto(gallery, { sourceIndex: 2 }, {
    mediaUrl: "https://cdn.test/new.jpg",
    storagePath: "usuarios/u/imagenes/new.jpg",
  });

  assert.equal(result.changed, true);
  assert.equal(result.gallery.cells[2].id, "slot-c");
  assert.equal(result.gallery.cells[2].mediaUrl, "https://cdn.test/new.jpg");
  assert.equal(result.gallery.cells[2].storagePath, "usuarios/u/imagenes/new.jpg");
  assert.equal(result.gallery.cells[2].src, undefined);
});

test("reorderGalleryPhotos affects populated photo order only within selected gallery", () => {
  const gallery = fixedGallery({
    cells: [
      { id: "slot-a", mediaUrl: "https://cdn.test/a.jpg", storagePath: "usuarios/u/a.jpg" },
      { id: "slot-empty", mediaUrl: null },
      { id: "slot-c", mediaUrl: "https://cdn.test/c.jpg", assetId: "asset-c" },
    ],
  });
  const result = reorderGalleryPhotos(gallery, 1, 0);

  assert.equal(result.changed, true);
  assert.deepEqual(
    result.gallery.cells.map((cell) => cell.mediaUrl || null),
    ["https://cdn.test/c.jpg", null, "https://cdn.test/a.jpg"]
  );
  assert.equal(result.gallery.cells[0].id, "slot-c");
  assert.equal(result.gallery.cells[0].assetId, "asset-c");
  assert.equal(result.gallery.cells[2].id, "slot-a");
  assert.equal(result.gallery.cells[2].storagePath, "usuarios/u/a.jpg");
});

test("reorderGalleryPhotos can move preset-hidden photos without deleting metadata", () => {
  const gallery = fixedGallery({
    rows: 1,
    cols: 4,
    allowedLayouts: ["banner", "squares"],
    defaultLayout: "banner",
    currentLayout: "banner",
    cells: [
      { id: "slot-a", mediaUrl: "https://cdn.test/a.jpg", storagePath: "usuarios/u/a.jpg" },
      { id: "slot-b", mediaUrl: "https://cdn.test/b.jpg", assetId: "asset-b", alt: "B" },
      { id: "slot-c", mediaUrl: "https://cdn.test/c.jpg", storagePath: "usuarios/u/c.jpg" },
      { id: "slot-empty", mediaUrl: null },
    ],
  });

  const result = reorderGalleryPhotos(gallery, 2, 0);

  assert.equal(result.changed, true);
  assert.equal(result.gallery.currentLayout, "banner");
  assert.deepEqual(
    getGalleryPhotos(result.gallery).map((photo) => photo.mediaUrl),
    ["https://cdn.test/c.jpg", "https://cdn.test/a.jpg", "https://cdn.test/b.jpg"]
  );
  assert.equal(result.gallery.cells[0].id, "slot-c");
  assert.equal(result.gallery.cells[0].storagePath, "usuarios/u/c.jpg");
  assert.equal(result.gallery.cells[2].id, "slot-b");
  assert.equal(result.gallery.cells[2].assetId, "asset-b");
  assert.equal(result.gallery.cells[2].alt, "B");
  assert.equal(result.gallery.cells[3].mediaUrl, null);
});

test("dynamic gallery mutations rebuild through dynamic state while preserving identity fields", () => {
  const gallery = fixedGallery({
    galleryLayoutMode: "dynamic_media",
    galleryLayoutType: "canvas_preserve",
    cells: [
      { id: "a", mediaUrl: "https://cdn.test/a.jpg", storagePath: "usuarios/u/imagenes/a.jpg" },
    ],
  });

  const added = addGalleryPhotos(gallery, {
    mediaUrl: "https://cdn.test/b.jpg",
    assetId: "asset-b",
  });
  const replaced = replaceGalleryPhoto(added.gallery, { displayIndex: 1 }, {
    mediaUrl: "https://cdn.test/c.jpg",
    storagePath: "usuarios/u/imagenes/c.jpg",
  });

  assert.equal(added.changed, true);
  assert.equal(added.gallery.galleryLayoutMode, "dynamic_media");
  assert.equal(replaced.gallery.cells[1].mediaUrl, "https://cdn.test/c.jpg");
  assert.equal(replaced.gallery.cells[1].storagePath, "usuarios/u/imagenes/c.jpg");
});

test("switchGalleryLayout changes currentLayout only when allowed", () => {
  const gallery = fixedGallery({
    allowedLayouts: ["banner", "squares", "slideshow"],
    defaultLayout: "banner",
    currentLayout: "banner",
  });

  const switched = switchGalleryLayout(gallery, "squares");
  const rejected = switchGalleryLayout(gallery, "marquee");
  const unavailable = switchGalleryLayout(gallery, "slideshow");

  assert.equal(switched.changed, true);
  assert.equal(switched.gallery.currentLayout, "squares");
  assert.equal(switched.gallery.cells, gallery.cells);
  assert.equal(rejected.changed, false);
  assert.equal(rejected.reason, "layout-not-allowed");
  assert.equal(unavailable.changed, false);
  assert.equal(unavailable.reason, "layout-not-allowed");
});

test("resolveGalleryMediaKey prefers storagePath, assetId, then mediaUrl", () => {
  assert.equal(
    resolveGalleryMediaKey({
      mediaUrl: "https://cdn.test/a.jpg",
      assetId: "asset-a",
      storagePath: "usuarios/u/imagenes/a.jpg",
    }),
    "usuarios/u/imagenes/a.jpg"
  );
  assert.equal(
    resolveGalleryMediaKey({
      mediaUrl: "https://cdn.test/a.jpg",
      assetId: "asset-a",
    }),
    "asset-a"
  );
  assert.equal(resolveGalleryMediaKey({ url: "https://cdn.test/a.jpg" }), "https://cdn.test/a.jpg");
});

test("applyGalleryMutationToObjects updates only the selected gallery object", () => {
  const galleryA = fixedGallery({ id: "gal-a" });
  const galleryB = fixedGallery({ id: "gal-b" });
  const objects = [galleryA, { id: "txt-1", tipo: "texto" }, galleryB];

  const result = applyGalleryMutationToObjects(objects, "gal-b", (gallery) =>
    addGalleryPhotos(gallery, "https://cdn.test/new.jpg")
  );

  assert.equal(result.changed, true);
  assert.equal(result.objects[0], galleryA);
  assert.equal(result.objects[1], objects[1]);
  assert.notEqual(result.objects[2], galleryB);
});
