import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCanvasImageElementFromLibraryImage,
  canAccessGalleryBuilder,
  getGalleryAllowedLayoutState,
  getGallerySidebarCandidates,
  getSelectedGalleryPhotoUsages,
  isTemplateGalleryAuthoringSession,
  resolveAvailableImageGalleryAction,
  resolveGallerySidebarEditingTarget,
} from "./sidebarModel.js";

test("template authoring session is detected from editor session or template metadata", () => {
  assert.equal(isTemplateGalleryAuthoringSession({ editorSession: { kind: "template" } }), true);
  assert.equal(isTemplateGalleryAuthoringSession({ editorSession: { kind: "TEMPLATE" } }), true);
  assert.equal(isTemplateGalleryAuthoringSession({ templateSessionMeta: { enabled: true } }), true);
  assert.equal(isTemplateGalleryAuthoringSession({ editorSession: { kind: "draft" } }), false);
});

test("gallery builder access requires site management, template authoring, and writable editor", () => {
  assert.equal(
    canAccessGalleryBuilder({
      canManageSite: true,
      editorReadOnly: false,
      editorSession: { kind: "template" },
    }),
    true
  );

  assert.equal(
    canAccessGalleryBuilder({
      canManageSite: false,
      editorReadOnly: false,
      editorSession: { kind: "template" },
    }),
    false
  );

  assert.equal(
    canAccessGalleryBuilder({
      canManageSite: true,
      editorReadOnly: false,
      editorSession: { kind: "draft" },
    }),
    false
  );

  assert.equal(
    canAccessGalleryBuilder({
      canManageSite: true,
      editorReadOnly: true,
      editorSession: { kind: "template" },
    }),
    false
  );
});

test("selected gallery photo usages resolve legacy media fields and skip empty cells", () => {
  const photos = getSelectedGalleryPhotoUsages({
    tipo: "galeria",
    cells: [
      { id: "a", mediaUrl: "https://cdn.test/a.jpg", fit: "contain", bg: "#fff" },
      { id: "b", url: "https://cdn.test/b.jpg", storagePath: "usuarios/u/imagenes/b.jpg" },
      { id: "c", src: "https://cdn.test/c.jpg", assetId: "asset-c" },
      { id: "empty", mediaUrl: "" },
    ],
  });

  assert.deepEqual(
    photos.map((photo) => ({
      index: photo.index,
      cellId: photo.cellId,
      mediaUrl: photo.mediaUrl,
      storagePath: photo.storagePath,
      assetId: photo.assetId,
      fit: photo.fit,
    })),
    [
      {
        index: 0,
        cellId: "a",
        mediaUrl: "https://cdn.test/a.jpg",
        storagePath: "",
        assetId: "",
        fit: "contain",
      },
      {
        index: 1,
        cellId: "b",
        mediaUrl: "https://cdn.test/b.jpg",
        storagePath: "usuarios/u/imagenes/b.jpg",
        assetId: "",
        fit: "cover",
      },
      {
        index: 2,
        cellId: "c",
        mediaUrl: "https://cdn.test/c.jpg",
        storagePath: "",
        assetId: "asset-c",
        fit: "cover",
      },
    ]
  );
});

test("gallery layout sidebar state normalizes allowed/default/current selection", () => {
  const state = getGalleryAllowedLayoutState({
    tipo: "galeria",
    allowedLayouts: ["banner", "squares", "banner", "slideshow", "unknown"],
    defaultLayout: "banner",
    currentLayout: "",
  });

  assert.deepEqual(state.allowedLayouts, ["banner", "squares"]);
  assert.deepEqual(
    state.allowedLayoutOptions.map((option) => ({ id: option.id, label: option.label })),
    [
      { id: "banner", label: "Banner" },
      { id: "squares", label: "Collage" },
    ]
  );
  assert.equal(state.defaultLayout, "banner");
  assert.equal(state.currentLayout, "");
  assert.equal(state.selectedLayout, "banner");
  assert.equal(state.hasPresetContract, true);
  assert.equal(state.reason, "default-layout-selected");

  assert.equal(
    getGalleryAllowedLayoutState({
      tipo: "galeria",
      allowedLayouts: ["squares"],
      defaultLayout: "banner",
      currentLayout: "",
    }).selectedLayout,
    "squares"
  );
});

test("gallery layout sidebar state hides legacy full_width and exposes a safe fallback", () => {
  const state = getGalleryAllowedLayoutState({
    tipo: "galeria",
    allowedLayouts: ["full_width"],
    defaultLayout: "full_width",
    currentLayout: "full_width",
  });

  assert.deepEqual(state.allowedLayouts, ["one_by_n"]);
  assert.deepEqual(
    state.allowedLayoutOptions.map((option) => ({ id: option.id, label: option.label })),
    [{ id: "one_by_n", label: "1xN" }]
  );
  assert.equal(state.selectedLayout, "one_by_n");
  assert.equal(state.reason, "legacy-full-width-fallback");
});

test("gallery layout sidebar state shows fallback buttons for draft galleries without allowedLayouts", () => {
  const state = getGalleryAllowedLayoutState({
    tipo: "galeria",
    rows: 2,
    cols: 2,
    cells: [{ mediaUrl: "https://cdn.test/a.jpg" }],
  });

  assert.deepEqual(state.allowedLayouts, [
    "one_by_n",
    "two_by_n",
    "three_by_n",
    "squares",
  ]);
  assert.deepEqual(
    state.allowedLayoutOptions.map((option) => ({ id: option.id, label: option.label })),
    [
      { id: "one_by_n", label: "1xN" },
      { id: "two_by_n", label: "2xN" },
      { id: "three_by_n", label: "2x3" },
      { id: "squares", label: "Collage" },
    ]
  );
  assert.equal(state.selectedLayout, "");
  assert.equal(state.hasPresetContract, false);
  assert.equal(state.reason, "editor-fallback-available");
});

test("gallery layout sidebar state supports simple photo-count gallery layouts", () => {
  const state = getGalleryAllowedLayoutState({
    tipo: "galeria",
    allowedLayouts: ["grid_count_1", "grid_count_5", "grid_count_16"],
    defaultLayout: "grid_count_5",
    currentLayout: "grid_count_16",
  });

  assert.deepEqual(state.allowedLayouts, ["grid_count_1", "grid_count_5", "grid_count_16"]);
  assert.deepEqual(
    state.allowedLayoutOptions.map((option) => ({
      id: option.id,
      label: option.label,
      maxPhotos: option.maxPhotos,
    })),
    [
      { id: "grid_count_1", label: "1 foto", maxPhotos: 1 },
      { id: "grid_count_5", label: "5 fotos", maxPhotos: 5 },
      { id: "grid_count_16", label: "16 fotos", maxPhotos: 16 },
    ]
  );
  assert.equal(state.selectedLayout, "grid_count_16");
});

const galleryA = { id: "gal-a", tipo: "galeria", cells: [] };
const galleryB = { id: "gal-b", tipo: "galeria", cells: [] };
const textObject = { id: "txt-1", tipo: "texto" };

test("gallery sidebar candidates include only normal Gallery objects", () => {
  assert.deepEqual(
    getGallerySidebarCandidates([
      galleryA,
      textObject,
      { id: "", tipo: "galeria" },
      { id: "img-1", tipo: "imagen" },
      galleryB,
    ]),
    [galleryA, galleryB]
  );
});

test("gallery sidebar target keeps selected Gallery as the primary target", () => {
  const result = resolveGallerySidebarEditingTarget({
    objects: [galleryA, galleryB],
    selectedIds: ["gal-b"],
    sidebarGalleryId: "gal-a",
  });

  assert.equal(result.gallery, galleryB);
  assert.equal(result.source, "canvas-selection");
  assert.equal(result.needsSidebarChoice, false);
});

test("gallery sidebar target auto-targets the only draft Gallery", () => {
  const result = resolveGallerySidebarEditingTarget({
    objects: [textObject, galleryA],
    selectedIds: ["txt-1"],
  });

  assert.equal(result.gallery, galleryA);
  assert.equal(result.source, "single-gallery");
  assert.equal(result.needsSidebarChoice, false);
});

test("gallery sidebar target uses sidebar choice when multiple Galleries exist", () => {
  const result = resolveGallerySidebarEditingTarget({
    objects: [galleryA, textObject, galleryB],
    selectedIds: [],
    sidebarGalleryId: "gal-b",
  });

  assert.equal(result.gallery, galleryB);
  assert.equal(result.source, "sidebar-choice");
  assert.equal(result.needsSidebarChoice, false);
});

test("gallery sidebar target asks for sidebar choice with multiple unselected Galleries", () => {
  const result = resolveGallerySidebarEditingTarget({
    objects: [galleryA, galleryB],
    selectedIds: [],
  });

  assert.equal(result.gallery, null);
  assert.equal(result.source, "multiple-galleries");
  assert.equal(result.needsSidebarChoice, true);
  assert.deepEqual(result.candidates, [galleryA, galleryB]);
});

test("uploaded library image primary action builds a normal canvas image object", () => {
  const element = buildCanvasImageElementFromLibraryImage(
    {
      id: "asset-1",
      url: "https://cdn.test/user-photo.jpg",
      ancho: 1200,
      alto: 800,
    },
    {
      id: "img-fixed",
      seccionActivaId: "sec-1",
    }
  );

  assert.deepEqual(element, {
    id: "img-fixed",
    tipo: "imagen",
    src: "https://cdn.test/user-photo.jpg",
    ancho: 1200,
    alto: 800,
    seccionId: "sec-1",
  });
});

test("available image gallery action requires an explicit gallery target state", () => {
  assert.equal(
    resolveAvailableImageGalleryAction({ gallery: null }).action,
    "none"
  );

  assert.equal(
    resolveAvailableImageGalleryAction({ gallery: galleryA }).action,
    "add-to-gallery"
  );

  assert.equal(
    resolveAvailableImageGalleryAction({
      gallery: galleryA,
      selectedPhotoTarget: { displayIndex: 0 },
    }).action,
    "replace-selected-photo"
  );
  assert.deepEqual(
    resolveAvailableImageGalleryAction({
      gallery: galleryA,
      selectedPhotoTarget: { sourceIndex: 1, isEmpty: true },
    }),
    {
      action: "replace-selected-photo",
      label: "Agregar a celda",
      reason: "selected-empty-slot",
    }
  );

  assert.equal(
    resolveAvailableImageGalleryAction({
      gallery: galleryA,
      activeCell: { objId: "gal-a", index: 1 },
      selectedPhotoTarget: { displayIndex: 0 },
    }).action,
    "assign-active-cell"
  );
});

test("gallery sidebar exposes exact grid-size layout options for simple galleries", () => {
  const state = getGalleryAllowedLayoutState({
    ...galleryA,
    allowedLayouts: ["grid_1x1", "grid_2x3", "grid_4x4"],
    defaultLayout: "grid_2x3",
    currentLayout: "grid_4x4",
  });

  assert.deepEqual(state.allowedLayouts, ["grid_1x1", "grid_2x3", "grid_4x4"]);
  assert.equal(state.selectedLayout, "grid_4x4");
  assert.deepEqual(
    state.allowedLayoutOptions.map((option) => ({
      id: option.id,
      maxPhotos: option.maxPhotos,
    })),
    [
      { id: "grid_1x1", maxPhotos: 1 },
      { id: "grid_2x3", maxPhotos: 6 },
      { id: "grid_4x4", maxPhotos: 16 },
    ]
  );
});
