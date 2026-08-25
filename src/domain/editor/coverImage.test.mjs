import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCoverImageUpdate,
  replaceCoverImageInCanvasObjects,
  replaceCoverImageInBackgroundSections,
  resolveCoverImageState,
} from "./coverImage.js";
import { normalizeTemplateDocument } from "../../../shared/templates/contract.js";

test("cover metadata is independent from the first section background", () => {
  const sections = [
    {
      id: "first",
      orden: 1,
      fondoTipo: "imagen",
      fondoImagen: "https://example.test/background.jpg",
    },
  ];

  assert.deepEqual(
    resolveCoverImageState({
      coverImage: "https://example.test/cover.jpg",
      sections,
    }),
    {
      hasImage: true,
      imageUrl: "https://example.test/cover.jpg",
      persistedImageUrl: "https://example.test/cover.jpg",
      coverSource: null,
      sourceResolved: false,
      backgroundSectionIds: [],
      canvasObjectIds: [],
      isUsedAsBackground: false,
      isUsedAsCanvasImage: false,
    }
  );
  assert.equal(resolveCoverImageState({ sections }).hasImage, false);
});

test("template thumbnails do not enable the Assistant cover block without a marked visual", () => {
  const state = resolveCoverImageState({
    coverImage: "https://example.test/template-card-thumbnail.jpg",
    objects: [
      {
        id: "unmarked-image",
        tipo: "imagen",
        src: "https://example.test/unmarked-image.jpg",
      },
    ],
    allowLegacyPortadaFallback: false,
  });

  assert.equal(state.hasImage, false);
  assert.equal(state.imageUrl, "");
  assert.equal(
    state.persistedImageUrl,
    "https://example.test/template-card-thumbnail.jpg"
  );
  assert.deepEqual(state.canvasObjectIds, []);
});

test("standalone legacy drafts may still expose portada without an explicit source", () => {
  const state = resolveCoverImageState({
    coverImage: "https://example.test/legacy-cover.jpg",
  });

  assert.equal(state.hasImage, true);
  assert.equal(state.imageUrl, "https://example.test/legacy-cover.jpg");
});

test("template cover block stays hidden when its marked visual no longer resolves", () => {
  const state = resolveCoverImageState({
    coverImage: "https://example.test/template-card-thumbnail.jpg",
    coverSource: {
      kind: "canvas-object",
      objectId: "deleted-cover",
    },
    objects: [{ id: "another-image", tipo: "imagen", src: "another.jpg" }],
    allowLegacyPortadaFallback: false,
  });

  assert.equal(state.hasImage, false);
  assert.equal(state.sourceResolved, false);
});

test("setting a cover without linked-visual synchronization leaves canvas visuals untouched", () => {
  const sections = [
    {
      id: "first",
      orden: 1,
      fondoTipo: "imagen",
      fondoImagen: "https://example.test/old-cover.jpg",
      fondoImagenOffsetX: 18,
    },
  ];

  const result = buildCoverImageUpdate({
    currentCoverImage: "https://example.test/old-cover.jpg",
    nextImage: "https://example.test/new-cover.jpg",
    sections,
    objects: [],
    nextCoverSource: {
      kind: "section-background",
      sectionId: "first",
    },
    syncLinkedVisuals: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.coverImage, "https://example.test/new-cover.jpg");
  assert.deepEqual(result.coverSource, {
    kind: "section-background",
    sectionId: "first",
  });
  assert.equal(result.sections, sections);
  assert.deepEqual(result.objects, []);
  assert.deepEqual(result.replacedBackgroundSectionIds, []);
  assert.deepEqual(result.replacedCanvasObjectIds, []);
});

test("Assistant cover replacement keeps linked canvas images and base backgrounds in sync", () => {
  const sections = [
    {
      id: "second",
      orden: 2,
      fondoTipo: "imagen",
      fondoImagen: "https://example.test/unrelated.jpg",
      fondoImagenOffsetX: 3,
    },
    {
      id: "first",
      orden: 1,
      fondoTipo: "imagen",
      fondoImagen: "https://example.test/old-cover.jpg",
      fondoImagenOffsetX: 18,
      fondoImagenOffsetY: -9,
      fondoImagenScale: 1.4,
      fondoImagenDraggable: false,
    },
    {
      id: "third",
      orden: 3,
      fondoTipo: "imagen",
      fondoImagen: "https://example.test/old-cover.jpg",
      fondoImagenOffsetX: -4,
      fondoImagenOffsetY: 7,
      fondoImagenScale: 1.1,
    },
  ];
  const nextImage = {
    url: "https://example.test/new-cover.jpg",
    storagePath: "usuarios/admin/images/new-cover.jpg",
    storageGeneration: "42",
    storageDownloadToken: "token-42",
  };
  const objects = [
    {
      id: "cover-object",
      tipo: "imagen",
      src: "https://example.test/old-cover.jpg",
      x: 125,
      y: 90,
      ancho: 360,
      alto: 240,
      rotacion: 12,
    },
    {
      id: "unrelated-object",
      tipo: "imagen",
      src: "https://example.test/unrelated-object.jpg",
    },
  ];

  const result = buildCoverImageUpdate({
    currentCoverImage: "https://example.test/stale-dashboard-cover.jpg",
    currentCoverSource: {
      kind: "canvas-object",
      objectId: "cover-object",
    },
    nextImage,
    sections,
    objects,
    syncLinkedVisuals: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.coverImage, nextImage.url);
  assert.deepEqual(result.coverSource, {
    kind: "canvas-object",
    objectId: "cover-object",
  });
  assert.deepEqual(result.replacedBackgroundSectionIds, ["first", "third"]);
  assert.deepEqual(result.replacedCanvasObjectIds, ["cover-object"]);
  assert.equal(result.sections[0], sections[0]);

  const first = result.sections.find((section) => section.id === "first");
  assert.equal(first.fondoImagen, nextImage.url);
  assert.equal(first.fondoImagenStoragePath, nextImage.storagePath);
  assert.equal(first.fondoImagenStorageGeneration, nextImage.storageGeneration);
  assert.equal(first.fondoImagenDownloadToken, nextImage.storageDownloadToken);
  assert.equal(first.fondoImagenOffsetX, 18);
  assert.equal(first.fondoImagenOffsetY, -9);
  assert.equal(first.fondoImagenScale, 1.4);
  assert.equal(first.fondoImagenDraggable, false);

  const third = result.sections.find((section) => section.id === "third");
  assert.equal(third.fondoImagen, nextImage.url);
  assert.equal(third.fondoImagenOffsetX, -4);
  assert.equal(third.fondoImagenOffsetY, 7);
  assert.equal(third.fondoImagenScale, 1.1);

  const coverObject = result.objects.find((object) => object.id === "cover-object");
  assert.equal(coverObject.src, nextImage.url);
  assert.equal(coverObject.storagePath, nextImage.storagePath);
  assert.equal(coverObject.storageGeneration, nextImage.storageGeneration);
  assert.equal(coverObject.storageDownloadToken, nextImage.storageDownloadToken);
  assert.equal(coverObject.x, 125);
  assert.equal(coverObject.y, 90);
  assert.equal(coverObject.ancho, 360);
  assert.equal(coverObject.alto, 240);
  assert.equal(coverObject.rotacion, 12);
  assert.equal(result.objects[1], objects[1]);
});

test("Assistant cover state follows the marked canvas visual instead of stale preview metadata", () => {
  const state = resolveCoverImageState({
    coverImage: "https://example.test/stale-preview.jpg",
    coverSource: {
      kind: "canvas-object",
      objectId: "marked-cover",
    },
    objects: [
      {
        id: "marked-cover",
        tipo: "imagen",
        src: "https://example.test/canvas-cover.jpg",
      },
    ],
  });

  assert.equal(state.imageUrl, "https://example.test/canvas-cover.jpg");
  assert.equal(state.persistedImageUrl, "https://example.test/stale-preview.jpg");
  assert.equal(state.sourceResolved, true);
  assert.deepEqual(state.canvasObjectIds, ["marked-cover"]);
});

test("Assistant cover state follows a section background explicitly marked as cover", () => {
  const state = resolveCoverImageState({
    coverImage: "https://example.test/stale-preview.jpg",
    coverSource: {
      kind: "section-background",
      sectionId: "hero",
    },
    sections: [
      {
        id: "hero",
        fondoTipo: "imagen",
        fondoImagen: "https://example.test/current-hero.jpg",
      },
    ],
  });

  assert.equal(state.imageUrl, "https://example.test/current-hero.jpg");
  assert.equal(state.sourceResolved, true);
  assert.deepEqual(state.backgroundSectionIds, ["hero"]);
});

test("template cover identity survives draft copy and Assistant replacement updates the marked object", () => {
  const template = normalizeTemplateDocument({
    id: "template-cover-flow",
    nombre: "Template cover flow",
    portada: "https://example.test/dashboard-template-thumbnail.jpg",
    portadaSource: {
      kind: "canvas-object",
      objectId: "marked-cover",
    },
    objetos: [
      {
        id: "marked-cover",
        tipo: "imagen",
        src: "https://example.test/marked-canvas-cover.jpg",
        x: 80,
        y: 120,
        ancho: 320,
        alto: 210,
      },
      {
        id: "different-image",
        tipo: "imagen",
        src: "https://example.test/different-image.jpg",
      },
    ],
    secciones: [{ id: "hero", orden: 1, fondoTipo: "color" }],
  });
  const copiedDraft = {
    portada: template.portada,
    portadaSource: template.portadaSource,
    objetos: template.objetos,
    secciones: template.secciones,
  };

  const state = resolveCoverImageState({
    coverImage: copiedDraft.portada,
    coverSource: copiedDraft.portadaSource,
    objects: copiedDraft.objetos,
    sections: copiedDraft.secciones,
  });
  assert.equal(state.imageUrl, "https://example.test/marked-canvas-cover.jpg");

  const replacement = buildCoverImageUpdate({
    currentCoverImage: copiedDraft.portada,
    currentCoverSource: copiedDraft.portadaSource,
    nextImage: "https://example.test/new-assistant-cover.jpg",
    objects: copiedDraft.objetos,
    sections: copiedDraft.secciones,
    syncLinkedVisuals: true,
  });
  const markedCover = replacement.objects.find(
    (object) => object.id === "marked-cover"
  );
  const differentImage = replacement.objects.find(
    (object) => object.id === "different-image"
  );

  assert.equal(replacement.ok, true);
  assert.equal(markedCover.src, "https://example.test/new-assistant-cover.jpg");
  assert.equal(markedCover.x, 80);
  assert.equal(markedCover.y, 120);
  assert.equal(markedCover.ancho, 320);
  assert.equal(markedCover.alto, 210);
  assert.equal(differentImage.src, "https://example.test/different-image.jpg");
});

test("invalid replacement input preserves cover metadata and sections", () => {
  const sections = [{ id: "first", orden: 1, fondo: "#ffffff" }];
  const result = buildCoverImageUpdate({
    currentCoverImage: "https://example.test/cover.jpg",
    nextImage: null,
    sections,
    objects: [],
    syncLinkedVisuals: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid-cover-image");
  assert.equal(result.coverImage, "https://example.test/cover.jpg");
  assert.equal(result.sections, sections);
  assert.deepEqual(result.objects, []);
  assert.deepEqual(result.replacedCanvasObjectIds, []);
});

test("canvas cover replacement reaches grouped images without changing their geometry", () => {
  const objects = [
    {
      id: "group",
      tipo: "grupo",
      children: [
        {
          id: "nested-cover",
          tipo: "imagen",
          src: "https://example.test/old-cover.jpg",
          x: 14,
          y: 22,
          ancho: 180,
        },
      ],
    },
  ];

  const result = replaceCoverImageInCanvasObjects({
    objects,
    objectIds: ["nested-cover"],
    nextImage: "https://example.test/new-cover.jpg",
  });
  const nested = result[0].children[0];

  assert.equal(nested.src, "https://example.test/new-cover.jpg");
  assert.equal(nested.x, 14);
  assert.equal(nested.y, 22);
  assert.equal(nested.ancho, 180);
});

test("a queued cover completion reapplies its captured background targets", () => {
  const sectionsAfterEarlierCompletion = [
    {
      id: "first",
      fondoTipo: "imagen",
      fondoImagen: "https://example.test/intermediate-cover.jpg",
      fondoImagenOffsetX: 12,
    },
    {
      id: "second",
      fondoTipo: "imagen",
      fondoImagen: "https://example.test/unrelated.jpg",
    },
  ];

  const result = replaceCoverImageInBackgroundSections({
    sections: sectionsAfterEarlierCompletion,
    sectionIds: ["first"],
    nextImage: "https://example.test/final-cover.jpg",
  });

  assert.equal(result[0].fondoImagen, "https://example.test/final-cover.jpg");
  assert.equal(result[0].fondoImagenOffsetX, 12);
  assert.equal(result[1], sectionsAfterEarlierCompletion[1]);
});
