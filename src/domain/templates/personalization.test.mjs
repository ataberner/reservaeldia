import test from "node:test";
import assert from "node:assert/strict";

import { preparePostCopyTemplatePersonalizationPatch } from "./personalization.js";
import { resolveTemplatePersonalizationInput } from "./personalizationContract.js";
import {
  getDressCodeFieldKey,
  getStoryTextFieldKey,
} from "./storyText.js";
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
    "event_ceremony_date",
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

test("post-copy personalization patch applies explicit targets inside preserved groups", () => {
  const template = {
    fieldsSchema: [
      {
        key: "event_primary_person_name",
        label: "Primera persona",
        type: "text",
        group: "Datos principales",
        applyTargets: [
          {
            scope: "objeto",
            id: "grouped-primary-name",
            path: "texto",
            mode: "set",
          },
        ],
      },
    ],
    defaults: {
      event_primary_person_name: "Sofia",
    },
  };
  const draftData = {
    objetos: [
      {
        id: "group-hero",
        tipo: "grupo",
        seccionId: "hero",
        x: 80,
        y: 120,
        width: 280,
        height: 120,
        children: [
          {
            id: "grouped-primary-name",
            tipo: "texto",
            texto: "Sofia",
            width: 160,
            __autoWidth: false,
          },
        ],
      },
    ],
    secciones: [{ id: "hero", orden: 0, altura: 500 }],
  };

  const patch = preparePostCopyTemplatePersonalizationPatch({
    template,
    draftData,
    resolvedValues: {
      event_primary_person_name: "Mara",
    },
  });

  assert.equal(patch.applyReport.targetsApplied, 1);
  assert.equal(patch.objetos[0].id, "group-hero");
  assert.equal(patch.objetos[0].children[0].texto, "Mara");
});

test("post-copy personalization patch projects venue address targets as fixed wrapped text boxes", () => {
  const longAddress =
    "Avenida Corrientes 1234, C1043 Ciudad Autonoma de Buenos Aires, Argentina";
  const template = {
    fieldsSchema: [
      {
        key: "event_ceremony_venue_address",
        label: "Direccion del evento",
        type: "location",
        group: "Ubicaciones",
        eventDetailsRole: "ceremony_venue_address",
        applyTargets: [
          {
            scope: "objeto",
            id: "address-text",
            path: "texto",
            mode: "set",
          },
        ],
      },
    ],
    defaults: {
      event_ceremony_venue_address: "Av. Corrientes 1234",
    },
  };
  const draftData = {
    objetos: [
      {
        id: "address-text",
        tipo: "texto",
        texto: "Av. Corrientes 1234",
        x: 120,
        y: 240,
        fontSize: 18,
      },
    ],
    secciones: [{ id: "hero", orden: 0, altura: 500 }],
  };

  const patch = preparePostCopyTemplatePersonalizationPatch({
    template,
    draftData,
    resolvedValues: {
      event_ceremony_venue_address: longAddress,
    },
  });

  const addressObject = patch.objetos.find((entry) => entry.id === "address-text");
  assert.equal(addressObject.texto, longAddress);
  assert.equal(addressObject.__autoWidth, false);
  assert.equal(addressObject.width, 360);
  assert.equal(addressObject.textWrapMode, "word");
});

test("post-copy personalization patch keeps story text inside the linked text box", () => {
  const fieldKey = getStoryTextFieldKey();
  const longStory =
    "Nuestra historia crecio entre viajes, sobremesas y planes compartidos.";
  const template = {
    fieldsSchema: [
      {
        key: fieldKey,
        label: "Texto historia",
        type: "textarea",
        group: "Datos principales",
        applyTargets: [
          {
            scope: "objeto",
            id: "story-text",
            path: "texto",
            mode: "set",
          },
        ],
      },
    ],
    defaults: {
      [fieldKey]: "Historia breve",
    },
  };
  const draftData = {
    objetos: [
      {
        id: "story-text",
        tipo: "texto",
        texto: "Historia breve",
        width: 280,
        align: "center",
        fontSize: 18,
      },
    ],
    secciones: [{ id: "hero", orden: 0, altura: 500 }],
  };

  const patch = preparePostCopyTemplatePersonalizationPatch({
    template,
    draftData,
    resolvedValues: {
      [fieldKey]: longStory,
    },
  });

  const storyObject = patch.objetos.find((entry) => entry.id === "story-text");
  assert.equal(storyObject.texto, longStory);
  assert.equal(storyObject.width, 280);
  assert.equal(storyObject.align, "center");
  assert.equal(storyObject.__autoWidth, false);
  assert.equal(storyObject.textWrapMode, "word");
});

test("post-copy personalization patch syncs dress code field to event details and canvas text", () => {
  const fieldKey = getDressCodeFieldKey();
  const template = {
    fieldsSchema: [
      {
        key: fieldKey,
        label: "Dress Code",
        type: "text",
        group: "Detalles del evento",
        eventDetailsRole: "dress_code",
        applyTargets: [
          {
            scope: "objeto",
            id: "dress-code-text",
            path: "texto",
            mode: "set",
          },
        ],
      },
    ],
    defaults: {
      [fieldKey]: "Formal",
    },
  };
  const draftData = {
    eventDetails: {
      mode: "single",
      dressCode: { enabled: true, value: "Formal" },
    },
    objetos: [
      {
        id: "dress-code-text",
        tipo: "texto",
        texto: "Formal",
        width: 180,
        fontSize: 18,
      },
    ],
    secciones: [{ id: "hero", orden: 0, altura: 500 }],
  };

  const patch = preparePostCopyTemplatePersonalizationPatch({
    template,
    draftData,
    resolvedValues: {
      [fieldKey]: "Elegante sport",
    },
  });

  const dressCodeObject = patch.objetos.find((entry) => entry.id === "dress-code-text");
  assert.equal(dressCodeObject.texto, "Elegante sport");
  assert.equal(dressCodeObject.width, 180);
  assert.equal(dressCodeObject.__autoWidth, false);
  assert.equal(dressCodeObject.textWrapMode, "word");
  assert.deepEqual(patch.eventDetails, {
    mode: "single",
    dressCode: { enabled: true, value: "Elegante sport" },
  });
});
