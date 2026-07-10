import assert from "node:assert/strict";
import test from "node:test";

import {
  addGalleryPhotos,
  applyGalleryMutationToObjects,
  configureGalleryLayout,
  getGalleryPhotos,
  getGallerySlots,
  moveGalleryPhotoToSlot,
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

test("getGallerySlots exposes fixed empty slots in cell order", () => {
  const gallery = fixedGallery({
    rows: 2,
    cols: 2,
    cells: [
      { id: "slot-1", mediaUrl: "https://cdn.test/1.jpg" },
      { id: "slot-2", mediaUrl: null },
      { id: "slot-3", src: "https://cdn.test/3.jpg" },
      { id: "slot-4", mediaUrl: "" },
    ],
  });

  assert.deepEqual(
    getGallerySlots(gallery).map((slot) => ({
      slotIndex: slot.slotIndex,
      cellId: slot.cellId,
      isEmpty: slot.isEmpty,
      displayIndex: slot.displayIndex,
      mediaUrl: slot.mediaUrl,
    })),
    [
      {
        slotIndex: 0,
        cellId: "slot-1",
        isEmpty: false,
        displayIndex: 0,
        mediaUrl: "https://cdn.test/1.jpg",
      },
      {
        slotIndex: 1,
        cellId: "slot-2",
        isEmpty: true,
        displayIndex: null,
        mediaUrl: "",
      },
      {
        slotIndex: 2,
        cellId: "slot-3",
        isEmpty: false,
        displayIndex: 1,
        mediaUrl: "https://cdn.test/3.jpg",
      },
      {
        slotIndex: 3,
        cellId: "slot-4",
        isEmpty: true,
        displayIndex: null,
        mediaUrl: "",
      },
    ]
  );
});

test("getGallerySlots can limit sidebar slots to the current visible design", () => {
  const gallery = fixedGallery({
    rows: 3,
    cols: 2,
    allowedLayouts: ["grid_2x2", "grid_2x3"],
    defaultLayout: "grid_2x3",
    currentLayout: "grid_2x2",
    cells: [
      { id: "slot-1", mediaUrl: "https://cdn.test/1.jpg" },
      { id: "slot-2", mediaUrl: "https://cdn.test/2.jpg" },
      { id: "slot-3", mediaUrl: null },
      { id: "slot-4", mediaUrl: null },
      { id: "slot-5", mediaUrl: "https://cdn.test/5.jpg" },
      { id: "slot-6", mediaUrl: "https://cdn.test/6.jpg" },
    ],
  });

  const visibleSlots = getGallerySlots(gallery, { visibleOnly: true });

  assert.equal(visibleSlots.length, 4);
  assert.deepEqual(
    visibleSlots.map((slot) => ({
      slotIndex: slot.slotIndex,
      cellId: slot.cellId,
      isEmpty: slot.isEmpty,
      mediaUrl: slot.mediaUrl,
    })),
    [
      {
        slotIndex: 0,
        cellId: "slot-1",
        isEmpty: false,
        mediaUrl: "https://cdn.test/1.jpg",
      },
      {
        slotIndex: 1,
        cellId: "slot-2",
        isEmpty: false,
        mediaUrl: "https://cdn.test/2.jpg",
      },
      { slotIndex: 2, cellId: "slot-3", isEmpty: true, mediaUrl: "" },
      { slotIndex: 3, cellId: "slot-4", isEmpty: true, mediaUrl: "" },
    ]
  );
  assert.deepEqual(
    getGalleryPhotos(gallery).map((photo) => photo.mediaUrl),
    [
      "https://cdn.test/1.jpg",
      "https://cdn.test/2.jpg",
      "https://cdn.test/5.jpg",
      "https://cdn.test/6.jpg",
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

test("moveGalleryPhotoToSlot moves a fixed photo into an empty slot while preserving slot ids", () => {
  const gallery = fixedGallery({
    rows: 1,
    cols: 3,
    cells: [
      {
        id: "slot-a",
        mediaUrl: "https://cdn.test/a.jpg",
        storagePath: "usuarios/u/imagenes/a.jpg",
        assetId: "asset-a",
      },
      { id: "slot-b", mediaUrl: null, fit: "contain", bg: "#fff" },
      { id: "slot-c", mediaUrl: "https://cdn.test/c.jpg" },
    ],
  });

  const moved = moveGalleryPhotoToSlot(
    gallery,
    { sourceIndex: 0 },
    { sourceIndex: 1 }
  );

  assert.equal(moved.changed, true);
  assert.equal(moved.gallery.cells[0].id, "slot-a");
  assert.equal(moved.gallery.cells[0].mediaUrl, null);
  assert.equal(moved.gallery.cells[1].id, "slot-b");
  assert.equal(moved.gallery.cells[1].mediaUrl, "https://cdn.test/a.jpg");
  assert.equal(moved.gallery.cells[1].storagePath, "usuarios/u/imagenes/a.jpg");
  assert.equal(moved.gallery.cells[1].assetId, "asset-a");
});

test("moveGalleryPhotoToSlot swaps fixed occupied slots without deleting photos", () => {
  const gallery = fixedGallery({
    rows: 1,
    cols: 2,
    cells: [
      { id: "slot-a", mediaUrl: "https://cdn.test/a.jpg", storagePath: "a-path" },
      { id: "slot-b", mediaUrl: "https://cdn.test/b.jpg", storagePath: "b-path" },
    ],
  });

  const moved = moveGalleryPhotoToSlot(
    gallery,
    { sourceIndex: 0 },
    { sourceIndex: 1 }
  );

  assert.equal(moved.changed, true);
  assert.equal(moved.gallery.cells[0].id, "slot-a");
  assert.equal(moved.gallery.cells[0].mediaUrl, "https://cdn.test/b.jpg");
  assert.equal(moved.gallery.cells[0].storagePath, "b-path");
  assert.equal(moved.gallery.cells[1].id, "slot-b");
  assert.equal(moved.gallery.cells[1].mediaUrl, "https://cdn.test/a.jpg");
  assert.equal(moved.gallery.cells[1].storagePath, "a-path");
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

test("switchGalleryLayout materializes safe layout fields for draft galleries without allowedLayouts", () => {
  const gallery = fixedGallery({
    allowedLayouts: undefined,
    defaultLayout: undefined,
    currentLayout: undefined,
  });

  const switched = switchGalleryLayout(gallery, "two_by_n");

  assert.equal(switched.changed, true);
  assert.deepEqual(switched.gallery.allowedLayouts, [
    "one_by_n",
    "two_by_n",
    "three_by_n",
    "squares",
  ]);
  assert.equal(switched.gallery.defaultLayout, "two_by_n");
  assert.equal(switched.gallery.currentLayout, "two_by_n");
  assert.equal(switched.gallery.cells, gallery.cells);
});

test("switchGalleryLayout materializes draft fallback even when currentLayout already matches", () => {
  const gallery = fixedGallery({
    allowedLayouts: undefined,
    defaultLayout: undefined,
    currentLayout: "squares",
  });

  const switched = switchGalleryLayout(gallery, "squares");

  assert.equal(switched.changed, true);
  assert.deepEqual(switched.gallery.allowedLayouts, [
    "one_by_n",
    "two_by_n",
    "three_by_n",
    "squares",
  ]);
  assert.equal(switched.gallery.defaultLayout, "squares");
  assert.equal(switched.gallery.currentLayout, "squares");
  assert.equal(switched.gallery.cells, gallery.cells);
});

test("photo-count fixed layouts add only within visible capacity and preserve hidden usages", () => {
  const gallery = fixedGallery({
    rows: 2,
    cols: 3,
    allowedLayouts: ["grid_count_5", "grid_count_16"],
    defaultLayout: "grid_count_5",
    currentLayout: "grid_count_5",
    cells: [
      { id: "slot-1", mediaUrl: "https://cdn.test/1.jpg" },
      { id: "slot-2", mediaUrl: "https://cdn.test/2.jpg" },
      { id: "slot-3", mediaUrl: "https://cdn.test/3.jpg" },
      { id: "slot-4", mediaUrl: "https://cdn.test/4.jpg" },
      { id: "slot-5", mediaUrl: "https://cdn.test/5.jpg" },
    ],
  });

  const rejected = addGalleryPhotos(gallery, "https://cdn.test/6.jpg");
  assert.equal(rejected.changed, false);
  assert.equal(rejected.reason, "fixed-gallery-full");
  assert.equal(rejected.gallery.cells.length, 5);

  const expanded = switchGalleryLayout(gallery, "grid_count_16");
  const added = addGalleryPhotos(expanded.gallery, "https://cdn.test/6.jpg");
  assert.equal(added.changed, true);
  assert.equal(added.gallery.cells.length, 16);
  assert.equal(added.gallery.cells[5].mediaUrl, "https://cdn.test/6.jpg");
  assert.deepEqual(
    getGalleryPhotos(added.gallery).map((photo) => photo.mediaUrl),
    [
      "https://cdn.test/1.jpg",
      "https://cdn.test/2.jpg",
      "https://cdn.test/3.jpg",
      "https://cdn.test/4.jpg",
      "https://cdn.test/5.jpg",
      "https://cdn.test/6.jpg",
    ]
  );

  const compactAgain = switchGalleryLayout(added.gallery, "grid_count_5");
  assert.equal(compactAgain.changed, true);
  assert.equal(compactAgain.gallery.cells.length, 16);
  assert.deepEqual(
    getGalleryPhotos(compactAgain.gallery).map((photo) => photo.mediaUrl),
    [
      "https://cdn.test/1.jpg",
      "https://cdn.test/2.jpg",
      "https://cdn.test/3.jpg",
      "https://cdn.test/4.jpg",
      "https://cdn.test/5.jpg",
      "https://cdn.test/6.jpg",
    ]
  );
});

test("grid-size fixed layouts fill first empty slot and preserve photos across size changes", () => {
  const gallery = fixedGallery({
    rows: 3,
    cols: 2,
    allowedLayouts: ["grid_2x3", "grid_4x4"],
    defaultLayout: "grid_2x3",
    currentLayout: "grid_2x3",
    cells: [
      { id: "slot-1", mediaUrl: "https://cdn.test/1.jpg" },
      { id: "slot-2", mediaUrl: null },
      { id: "slot-3", mediaUrl: "https://cdn.test/3.jpg" },
      { id: "slot-4", mediaUrl: "https://cdn.test/4.jpg" },
      { id: "slot-5", mediaUrl: "https://cdn.test/5.jpg" },
      { id: "slot-6", mediaUrl: "https://cdn.test/6.jpg" },
    ],
  });

  const filled = addGalleryPhotos(gallery, "https://cdn.test/2.jpg");
  assert.equal(filled.changed, true);
  assert.equal(filled.gallery.cells[1].id, "slot-2");
  assert.equal(filled.gallery.cells[1].mediaUrl, "https://cdn.test/2.jpg");

  const rejected = addGalleryPhotos(filled.gallery, "https://cdn.test/7.jpg");
  assert.equal(rejected.changed, false);
  assert.equal(rejected.reason, "fixed-gallery-full");
  assert.equal(rejected.gallery.cells.length, 6);

  const expanded = switchGalleryLayout(filled.gallery, "grid_4x4");
  const added = addGalleryPhotos(expanded.gallery, "https://cdn.test/7.jpg");
  assert.equal(added.changed, true);
  assert.equal(added.gallery.cells.length, 16);
  assert.equal(added.gallery.cells[6].mediaUrl, "https://cdn.test/7.jpg");

  const compactAgain = switchGalleryLayout(added.gallery, "grid_2x3");
  assert.equal(compactAgain.changed, true);
  assert.equal(compactAgain.gallery.cells.length, 16);
  assert.deepEqual(
    getGalleryPhotos(compactAgain.gallery).map((photo) => photo.mediaUrl),
    [
      "https://cdn.test/1.jpg",
      "https://cdn.test/2.jpg",
      "https://cdn.test/3.jpg",
      "https://cdn.test/4.jpg",
      "https://cdn.test/5.jpg",
      "https://cdn.test/6.jpg",
      "https://cdn.test/7.jpg",
    ]
  );
});

test("configureGalleryLayout can add a Builder-selected layout without changing photos", () => {
  const gallery = fixedGallery({
    allowedLayouts: ["squares"],
    defaultLayout: "squares",
    currentLayout: "squares",
  });

  const configured = configureGalleryLayout(gallery, "two_by_n");

  assert.equal(configured.changed, true);
  assert.deepEqual(configured.gallery.allowedLayouts, ["squares", "two_by_n"]);
  assert.equal(configured.gallery.defaultLayout, "squares");
  assert.equal(configured.gallery.currentLayout, "two_by_n");
  assert.equal(configured.gallery.cells, gallery.cells);
});

test("configureGalleryLayout rejects unknown and nonselectable layouts", () => {
  const gallery = fixedGallery({
    allowedLayouts: ["squares"],
    defaultLayout: "squares",
    currentLayout: "squares",
  });

  assert.equal(configureGalleryLayout(gallery, "unknown").changed, false);
  assert.equal(configureGalleryLayout(gallery, "unknown").reason, "layout-not-allowed");
  assert.equal(configureGalleryLayout(gallery, "slideshow").changed, false);
  assert.equal(configureGalleryLayout(gallery, "slideshow").reason, "layout-not-allowed");
  assert.equal(configureGalleryLayout(gallery, "full_width").changed, false);
  assert.equal(configureGalleryLayout(gallery, "full_width").reason, "layout-not-allowed");
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

test("replace through object mutation updates only the target gallery cell", () => {
  const galleryA = fixedGallery({ id: "gal-a" });
  const galleryB = fixedGallery({ id: "gal-b" });
  const uploadedAssets = [
    { id: "asset-new", url: "https://cdn.test/new.jpg" },
  ];
  const objects = [galleryA, galleryB];

  const result = applyGalleryMutationToObjects(objects, "gal-b", (gallery) =>
    replaceGalleryPhoto(gallery, { sourceIndex: 2 }, uploadedAssets[0])
  );

  assert.equal(result.changed, true);
  assert.equal(result.objects[0], galleryA);
  assert.notEqual(result.objects[1], galleryB);
  assert.equal(result.objects[1].cells[0].mediaUrl, galleryB.cells[0].mediaUrl);
  assert.equal(result.objects[1].cells[1].mediaUrl, galleryB.cells[1].mediaUrl);
  assert.equal(result.objects[1].cells[2].mediaUrl, "https://cdn.test/new.jpg");
  assert.deepEqual(uploadedAssets, [
    { id: "asset-new", url: "https://cdn.test/new.jpg" },
  ]);
});
