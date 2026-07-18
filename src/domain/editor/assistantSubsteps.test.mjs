import test from "node:test";
import assert from "node:assert/strict";

import {
  clampAssistantSubstepIndex,
  getAssistantLinearProgressLabel,
  getAssistantSubstep,
  getAssistantSubstepProgressLabel,
  getAssistantSubstepSignature,
  hasAssistantPhotoStepContent,
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

  assert.equal(hasAssistantPhotoStepContent({ objects, sections }), true);
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

test("assistant photo step has no substeps when there is no cover or gallery", () => {
  assert.deepEqual(resolveAssistantSubstepsForStep("imagen", {}), []);
  assert.equal(hasAssistantPhotoStepContent({}), false);
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

test("assistant substeps own contextual guided-tour Next copy", () => {
  const detalles = resolveAssistantSubstepsForStep("detalles");
  const imagen = resolveAssistantSubstepsForStep("imagen", {
    sections: [
      {
        id: "cover-section",
        orden: 1,
        fondoTipo: "imagen",
        fondoImagen: "https://example.test/cover.jpg",
      },
    ],
    objects: [{ id: "gallery-one", tipo: "galeria" }],
  });
  const rsvp = resolveAssistantSubstepsForStep("rsvp");
  const regalos = resolveAssistantSubstepsForStep("regalos");

  assert.equal(detalles[0].tourNextMessage, undefined);
  assert.equal(
    detalles[1].tourNextMessage,
    "Cuando termines de configurar la fecha y el horario, presioná Siguiente."
  );
  assert.equal(
    detalles[2].tourNextMessage,
    "Cuando termines de configurar la ubicación, presioná Siguiente."
  );
  assert.equal(
    imagen[0].tourNextMessage,
    "Cuando termines de configurar las fotos, presioná Siguiente."
  );
  assert.equal(
    imagen[1].tourNextMessage,
    "Cuando termines de configurar las fotos, presioná Siguiente."
  );
  assert.equal(
    rsvp[0].tourNextMessage,
    "Cuando termines de configurar el formulario de asistencia, presioná Siguiente."
  );
  assert.equal(
    regalos[0].tourNextMessage,
    "Cuando termines de configurar la sección de regalos, presioná Siguiente."
  );
});

test("assistant linear progress helper counts steps and substeps", () => {
  const counts = [3, 2, 1, 1];

  assert.equal(
    getAssistantLinearProgressLabel({
      stepSubstepCounts: counts,
      currentStepIndex: 0,
      currentSubstepIndex: 0,
    }),
    "1/7"
  );
  assert.equal(
    getAssistantLinearProgressLabel({
      stepSubstepCounts: counts,
      currentStepIndex: 0,
      currentSubstepIndex: 2,
    }),
    "3/7"
  );
  assert.equal(
    getAssistantLinearProgressLabel({
      stepSubstepCounts: counts,
      currentStepIndex: 3,
      currentSubstepIndex: 0,
    }),
    "7/7"
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

test("assistant gifts step stays as a single compact substep", () => {
  assert.deepEqual(
    resolveAssistantSubstepsForStep("regalos").map(({ id, label, scope }) => ({
      id,
      label,
      scope,
    })),
    [
      { id: "gifts", label: "Regalos", scope: "main" },
    ]
  );
});
