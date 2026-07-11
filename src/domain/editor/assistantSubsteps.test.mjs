import test from "node:test";
import assert from "node:assert/strict";

import {
  clampAssistantSubstepIndex,
  getAssistantSubstep,
  getAssistantSubstepProgressLabel,
  getAssistantSubstepSignature,
  resolveAssistantSubstepsForStep,
} from "./assistantSubsteps.js";

test("assistant photo step splits cover and existing galleries into semantic substeps", () => {
  const sections = [
    {
      id: "second",
      orden: 2,
      fondoTipo: "color",
      fondo: "#ffffff",
    },
    {
      id: "first",
      orden: 1,
      fondoTipo: "imagen",
      fondoImagen: "https://example.test/cover.jpg",
    },
  ];
  const objects = [
    { id: "title", tipo: "texto" },
    { id: "gallery-one", tipo: "galeria" },
    { id: "gallery-two", tipo: "galeria" },
  ];

  const substeps = resolveAssistantSubstepsForStep("imagen", { objects, sections });

  assert.deepEqual(
    substeps.map(({ id, label, scope, galleryId }) => ({
      id,
      label,
      scope,
      galleryId,
    })),
    [
      {
        id: "cover",
        label: "Portada",
        scope: "cover",
        galleryId: undefined,
      },
      {
        id: "gallery:gallery-one",
        label: "Galeria 1",
        scope: "gallery",
        galleryId: "gallery-one",
      },
      {
        id: "gallery:gallery-two",
        label: "Galeria 2",
        scope: "gallery",
        galleryId: "gallery-two",
      },
    ]
  );
});

test("assistant photo step exposes an empty state when there is no cover or gallery", () => {
  assert.deepEqual(resolveAssistantSubstepsForStep("imagen", {}), [
    {
      id: "photos-empty",
      label: "Fotos",
      scope: "empty",
    },
  ]);
});

test("assistant substep helpers clamp indices and expose progress only for split steps", () => {
  const substeps = resolveAssistantSubstepsForStep("detalles");

  assert.deepEqual(
    substeps.map(({ id, scope }) => ({ id, scope })),
    [
      { id: "event-names", scope: "event-names" },
      { id: "event-date", scope: "event-date" },
      { id: "event-location", scope: "event-location" },
    ]
  );
  assert.equal(clampAssistantSubstepIndex(-2, substeps), 0);
  assert.equal(clampAssistantSubstepIndex(99, substeps), 2);
  assert.equal(getAssistantSubstep(99, substeps).id, "event-location");
  assert.equal(getAssistantSubstepProgressLabel(1, substeps), "2/3");
  assert.equal(getAssistantSubstepProgressLabel(0, [substeps[0]]), "");
  assert.equal(
    getAssistantSubstepSignature(substeps),
    "event-names|event-date|event-location"
  );
});

test("assistant RSVP step keeps activation and active questions together", () => {
  assert.deepEqual(
    resolveAssistantSubstepsForStep("rsvp").map(({ id, scope }) => ({ id, scope })),
    [
      { id: "rsvp-start", scope: "activation" },
    ]
  );
});
