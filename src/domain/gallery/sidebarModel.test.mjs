import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessGalleryBuilder,
  getGalleryAllowedLayoutState,
  getSelectedGalleryPhotoUsages,
  isTemplateGalleryAuthoringSession,
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
