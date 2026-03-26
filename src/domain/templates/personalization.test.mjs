import test from "node:test";
import assert from "node:assert/strict";

import { preparePostCopyTemplatePersonalizationPatch } from "./personalization.js";
import { resolveTemplatePersonalizationInput } from "./personalizationContract.js";
import {
  createRepresentativeDraftFixture,
  createRepresentativePersonalizationInput,
  createRepresentativePreviewTextPositions,
  createRepresentativeTemplateFixture,
} from "./templatePreviewPersonalizationFixtures.mjs";

test("post-copy personalization patch keeps shared field mappings and preview text overrides aligned", () => {
  const template = createRepresentativeTemplateFixture();
  const draftData = createRepresentativeDraftFixture();
  const input = createRepresentativePersonalizationInput();
  const previewTextPositions = createRepresentativePreviewTextPositions();
  const { resolvedValues } = resolveTemplatePersonalizationInput({
    template,
    rawValues: input.rawValues,
    touchedKeys: input.touchedKeys,
    galleryUrlsByField: input.galleryUrlsByField,
  });

  const patch = preparePostCopyTemplatePersonalizationPatch({
    template,
    draftData,
    resolvedValues,
    previewTextPositions,
  });
  const expectedCountdownIso = new Date("2027-01-05T00:00:00").toISOString();

  const titleObject = patch.objetos.find((entry) => entry.id === "title-main");
  const dateObject = patch.objetos.find((entry) => entry.id === "date-main");
  const welcomeObject = patch.objetos.find((entry) => entry.id === "welcome-copy");
  const countdownObject = patch.objetos.find((entry) => entry.id === "countdown-main");
  const galleryObject = patch.objetos.find((entry) => entry.id === "gallery-main");

  assert.deepEqual(patch.changedKeys, [
    "event_name",
    "event_date",
    "welcome_copy",
    "gallery_images",
    "rsvp_title",
  ]);
  assert.deepEqual(patch.applyReport.skippedFields, []);

  assert.equal(titleObject.texto, "Mara y Nico");
  assert.equal(titleObject.x, 222);
  assert.equal(titleObject.y, 144);

  assert.equal(dateObject.texto, "5 de enero de 2027");
  assert.equal(welcomeObject.texto, "Celebremos juntos");
  assert.equal(countdownObject.fechaObjetivo, expectedCountdownIso);
  assert.deepEqual(
    galleryObject.cells.map((cell) => cell.mediaUrl),
    [
      "https://images.example.com/gallery-upload-1.jpg",
      "https://images.example.com/gallery-upload-2.jpg",
      "https://images.example.com/gallery-default-3.jpg",
    ]
  );
  assert.equal(patch.rsvp.title, "Avisanos si venis");
});
