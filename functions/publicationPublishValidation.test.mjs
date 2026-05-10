import test from "node:test";
import assert from "node:assert/strict";

import {
  FIXTURE_BUCKET,
  FIXTURE_PATHS,
  buildGsUrl,
} from "../shared/renderAssetContractFixtures.mjs";
import {
  createPublishValidationImageDownloadBuffer,
  createRepresentativeBlockingDraftFixture,
  createRepresentativeCompatibilityWarningDraftFixture,
  createRepresentativeGiftNoUsableMethodsDraftFixture,
  createRepresentativePublishReadyDraftFixture,
} from "../shared/publicationPublishValidationFixtures.mjs";
import {
  installFirebaseStorageMock,
} from "./testUtils/firebaseStorageMock.mjs";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const {
  buildPreviewRenderPayloadFromPreparedPayload,
  generateHtmlFromPreparedRenderPayload,
  prepareRenderPayload,
  preparePublicationRenderState,
  validatePreparedRenderPayload,
  validatePreparedPublicationRenderState,
} = requireBuiltModule("lib/payments/publicationPublishValidation.js");

const FIXED_SECTION = [{ id: "section-1", orden: 1, altoModo: "fijo", altura: 600 }];

function createRepresentativeStorageFiles() {
  return {
    [FIXTURE_PATHS.heroImage]: {
      downloadBuffer: createPublishValidationImageDownloadBuffer(),
    },
    [FIXTURE_PATHS.rasterIcon]: {},
    [FIXTURE_PATHS.galleryOne]: {},
    [FIXTURE_PATHS.galleryTwo]: {},
    [FIXTURE_PATHS.galleryThree]: {},
    [FIXTURE_PATHS.sectionBackground]: {},
    [FIXTURE_PATHS.decorTop]: {},
    [FIXTURE_PATHS.decorBottom]: {},
    [FIXTURE_PATHS.countdownFrame]: {},
  };
}

function createGroupedImageCaptionObject(overrides = {}) {
  return {
    id: "photo-caption-group",
    tipo: "grupo",
    seccionId: "section-details",
    anclaje: "content",
    x: 72,
    y: 248,
    width: 280,
    height: 220,
    children: [
      {
        id: "photo-caption-image",
        tipo: "imagen",
        x: 0,
        y: 0,
        width: 220,
        height: 140,
        url: buildGsUrl(FIXTURE_PATHS.heroImage),
        storagePath: FIXTURE_PATHS.heroImage,
        cropX: 1,
        cropY: 1,
        cropWidth: 2,
        cropHeight: 2,
      },
      {
        id: "photo-caption-text",
        tipo: "texto",
        x: 12,
        y: 156,
        width: 220,
        texto: "Ceremonia al aire libre",
        fontSize: 22,
      },
    ],
    ...overrides,
  };
}

function createMalformedGroupedObject(overrides = {}) {
  return {
    id: "broken-group",
    tipo: "grupo",
    seccionId: "section-1",
    anclaje: "content",
    x: 40,
    y: 80,
    width: 260,
    height: 120,
    children: [
      {
        id: "nested-group",
        tipo: "grupo",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        children: [],
      },
      {
        id: "broken-child",
        tipo: "texto",
        x: 24,
        y: 30,
        yNorm: 0.4,
        width: 180,
        texto: "Contrato invalido",
        fontSize: 24,
      },
    ],
    ...overrides,
  };
}

function issueKeys(issues) {
  return [...issues]
    .map(
      (issue) =>
        `${issue.code}|${issue.objectId ?? "-"}|${issue.sectionId ?? "-"}|${issue.fieldPath ?? "-"}`
    )
    .sort();
}

function validatePreparedDraft(draftState, prepared) {
  return validatePreparedPublicationRenderState({
    rawObjetos: draftState.objetos,
    rawSecciones: draftState.secciones,
    objetosFinales: prepared.objetosFinales,
    seccionesFinales: prepared.seccionesFinales,
    rawRsvp: draftState.rsvp,
    rawGifts: draftState.gifts,
    functionalCtaContract: prepared.functionalCtaContract,
  });
}

test("reports legacy frozen contracts as warnings without blocking publish", () => {
  const rawObjetos = [
    {
      id: "count-legacy",
      tipo: "countdown",
      seccionId: "section-1",
      fechaISO: "2026-05-10T20:00:00.000Z",
      width: 280,
      height: 96,
    },
    {
      id: "icon-legacy",
      tipo: "icono-svg",
      seccionId: "section-1",
      width: 96,
      height: 96,
      color: "#111111",
      d: "M0 0 L10 10",
    },
  ];

  const result = validatePreparedPublicationRenderState({
    rawObjetos,
    rawSecciones: FIXED_SECTION,
    objetosFinales: rawObjetos,
    seccionesFinales: FIXED_SECTION,
  });

  assert.equal(result.canPublish, true);
  assert.equal(result.blockers.length, 0);
  assert.deepEqual(issueKeys(result.warnings), [
    "countdown-target-compat-alias|count-legacy|section-1|fechaISO",
    "legacy-countdown-schema-v1-frozen|count-legacy|section-1|countdownSchemaVersion",
    "legacy-icono-svg-frozen|icon-legacy|section-1|tipo",
  ]);
});

test("keeps v2 frame validation blocking while avoiding false legacy warnings", () => {
  const rawObjetos = [
    {
      id: "count-modern",
      tipo: "countdown",
      seccionId: "section-1",
      countdownSchemaVersion: 2,
      fechaObjetivo: "2026-05-10T20:00:00.000Z",
      frameSvgUrl: "gs://private/frame.svg",
      width: 320,
      height: 120,
      visibleUnits: ["days", "hours", "minutes", "seconds"],
    },
  ];

  const result = validatePreparedPublicationRenderState({
    rawObjetos,
    rawSecciones: FIXED_SECTION,
    objetosFinales: rawObjetos,
    seccionesFinales: FIXED_SECTION,
  });

  assert.equal(result.canPublish, false);
  assert.deepEqual(issueKeys(result.blockers), [
    "countdown-frame-unresolved|count-modern|section-1|frameSvgUrl",
  ]);
  assert.deepEqual(issueKeys(result.warnings), []);
});

test("allows editor pill shapes once published HTML supports them", () => {
  const rawObjetos = [
    {
      id: "shape-pill",
      tipo: "forma",
      figura: "pill",
      seccionId: "section-1",
      width: 170,
      height: 72,
      color: "#111111",
    },
  ];

  const result = validatePreparedPublicationRenderState({
    rawObjetos,
    rawSecciones: FIXED_SECTION,
    objetosFinales: rawObjetos,
    seccionesFinales: FIXED_SECTION,
  });

  assert.equal(result.canPublish, true);
  assert.deepEqual(issueKeys(result.blockers), []);
  assert.deepEqual(issueKeys(result.warnings), []);
});

test("prepares a representative clean draft into a publish-ready state without warnings", async (t) => {
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: FIXTURE_BUCKET,
    files: createRepresentativeStorageFiles(),
  });
  t.after(() => storageMock.restore());

  const draftState = createRepresentativePublishReadyDraftFixture();
  const prepared = await preparePublicationRenderState(draftState);
  const result = validatePreparedDraft(draftState, prepared);
  const heroImage = prepared.objetosFinales.find((entry) => entry.id === "hero-image");

  assert.equal(result.canPublish, true);
  assert.deepEqual(issueKeys(result.blockers), []);
  assert.deepEqual(issueKeys(result.warnings), []);
  assert.equal(prepared.functionalCtaContract.rsvp.reason, "ready");
  assert.equal(prepared.functionalCtaContract.gifts.reason, "ready");
  assert.equal(heroImage.ancho, 4);
  assert.equal(heroImage.alto, 4);
});

test("prepares grouped image compositions recursively so publish validates the child assets too", async (t) => {
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: FIXTURE_BUCKET,
    files: createRepresentativeStorageFiles(),
  });
  t.after(() => storageMock.restore());

  const draftState = createRepresentativePublishReadyDraftFixture();
  draftState.objetos.push(createGroupedImageCaptionObject());

  const prepared = await preparePublicationRenderState(draftState);
  const result = validatePreparedDraft(draftState, prepared);
  const groupedObject = prepared.objetosFinales.find((entry) => entry.id === "photo-caption-group");
  const groupedImage = groupedObject.children.find((entry) => entry.id === "photo-caption-image");

  assert.equal(result.canPublish, true);
  assert.deepEqual(issueKeys(result.blockers), []);
  assert.equal(groupedImage.ancho, 4);
  assert.equal(groupedImage.alto, 4);
});

test("canonical prepared render payload preserves the publication wrapper and validation shape", async (t) => {
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: FIXTURE_BUCKET,
    files: createRepresentativeStorageFiles(),
  });
  t.after(() => storageMock.restore());

  const draftState = createRepresentativePublishReadyDraftFixture();
  const canonical = await prepareRenderPayload(draftState);
  const compatibility = await preparePublicationRenderState(draftState);
  const canonicalValidation = validatePreparedRenderPayload(canonical);
  const compatibilityValidation = validatePreparedPublicationRenderState({
    rawObjetos: compatibility.draftRenderState.objetos,
    rawSecciones: compatibility.draftRenderState.secciones,
    objetosFinales: compatibility.objetosFinales,
    seccionesFinales: compatibility.seccionesFinales,
    rawRsvp: compatibility.draftRenderState.rsvp,
    rawGifts: compatibility.draftRenderState.gifts,
    functionalCtaContract: compatibility.functionalCtaContract,
  });

  assert.deepEqual(canonical, compatibility);
  assert.deepEqual(canonicalValidation, compatibilityValidation);
});

test("preview and publish html can be generated from the same prepared render payload", async (t) => {
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: FIXTURE_BUCKET,
    files: createRepresentativeStorageFiles(),
  });
  t.after(() => storageMock.restore());

  const draftState = createRepresentativePublishReadyDraftFixture();
  draftState.objetos.push(createGroupedImageCaptionObject());

  const prepared = await prepareRenderPayload(draftState);
  const previewPayload = buildPreviewRenderPayloadFromPreparedPayload(prepared);
  const previewHtml = generateHtmlFromPreparedRenderPayload(prepared, {
    slug: "fixture-public",
    isPreview: true,
  });
  const publishHtml = generateHtmlFromPreparedRenderPayload(prepared, {
    slug: "fixture-public",
  });

  assert.deepEqual(previewPayload.objetos, prepared.objetosFinales);
  assert.deepEqual(previewPayload.secciones, prepared.seccionesFinales);
  assert.equal(previewPayload.rsvpPreviewConfig.enabled, true);
  assert.equal(previewPayload.giftPreviewConfig.enabled, true);
  assert.match(previewHtml, /<html[^>]*data-preview="1"/);
  assert.match(previewHtml, /<body[^>]*data-preview="1"/);
  assert.doesNotMatch(publishHtml, /<html[^>]*data-preview="1"/);
  assert.doesNotMatch(publishHtml, /<body[^>]*data-preview="1"/);
  assert.match(previewHtml, /data-rsvp-open/);
  assert.match(publishHtml, /data-rsvp-open/);
  assert.match(previewHtml, /data-mobile-cluster="isolated"/);
  assert.match(publishHtml, /data-mobile-cluster="isolated"/);
});

test("validates grouped countdown and gallery children through the normal publish contract", () => {
  const rawObjetos = [
    {
      id: "countdown-gallery-group",
      tipo: "grupo",
      seccionId: "section-1",
      anclaje: "content",
      x: 72,
      y: 140,
      width: 340,
      height: 240,
      children: [
        {
          id: "countdown-child",
          tipo: "countdown",
          x: 0,
          y: 0,
          width: 240,
          height: 96,
          countdownSchemaVersion: 2,
          fechaObjetivo: "2026-05-10T20:00:00.000Z",
          frameSvgUrl: "https://cdn.example.com/frame.svg",
          visibleUnits: ["days", "hours", "minutes", "seconds"],
        },
        {
          id: "gallery-child",
          tipo: "galeria",
          x: 24,
          y: 112,
          width: 240,
          height: 128,
          rows: 1,
          cols: 2,
          gap: 8,
          cells: [
            { mediaUrl: "https://cdn.example.com/gallery-1.jpg", fit: "cover" },
            { mediaUrl: "https://cdn.example.com/gallery-2.jpg", fit: "cover" },
          ],
        },
      ],
    },
  ];

  const result = validatePreparedPublicationRenderState({
    rawObjetos,
    rawSecciones: FIXED_SECTION,
    objetosFinales: rawObjetos,
    seccionesFinales: FIXED_SECTION,
  });

  assert.equal(result.canPublish, true);
  assert.deepEqual(issueKeys(result.blockers), []);
  assert.deepEqual(issueKeys(result.warnings), []);
});

test("keeps representative compatibility and preview drift branches as warnings only", async (t) => {
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: FIXTURE_BUCKET,
    files: createRepresentativeStorageFiles(),
  });
  t.after(() => storageMock.restore());

  const draftState = createRepresentativeCompatibilityWarningDraftFixture();
  const prepared = await preparePublicationRenderState(draftState);
  const result = validatePreparedDraft(draftState, prepared);

  assert.equal(result.canPublish, true);
  assert.deepEqual(issueKeys(result.blockers), []);
  assert.deepEqual(issueKeys(result.warnings), [
    "countdown-target-compat-alias|count-legacy|section-details|fechaISO",
    "fullbleed-editor-drift|hero-image|section-hero|anclaje",
    "functional-cta-link-ignored|gift-cta|section-details|enlace",
    "functional-cta-link-ignored|rsvp-cta|section-details|enlace",
    "gift-modal-field-incomplete|gift-cta|section-details|gifts.bank.holder",
    "gift-modal-field-incomplete|gift-cta|section-details|gifts.giftListUrl",
    "legacy-countdown-schema-v1-frozen|count-legacy|section-details|countdownSchemaVersion",
    "legacy-icono-svg-frozen|icon-legacy|section-details|tipo",
    "pantalla-ynorm-drift|hero-image|section-hero|yNorm",
    "pantalla-ynorm-missing|hero-title|section-hero|yNorm",
    "rsvp-missing-root-config|rsvp-cta|section-details|rsvp",
  ]);
  assert.equal(prepared.functionalCtaContract.rsvp.reason, "missing-root");
  assert.equal(prepared.functionalCtaContract.gifts.reason, "ready");
});

test("keeps a gift CTA without usable methods as a warning-only compatibility case", async (t) => {
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: FIXTURE_BUCKET,
    files: createRepresentativeStorageFiles(),
  });
  t.after(() => storageMock.restore());

  const draftState = createRepresentativeGiftNoUsableMethodsDraftFixture();
  const prepared = await preparePublicationRenderState(draftState);
  const result = validatePreparedDraft(draftState, prepared);

  assert.equal(result.canPublish, true);
  assert.deepEqual(issueKeys(result.blockers), []);
  assert.deepEqual(issueKeys(result.warnings), [
    "gift-no-usable-methods|gift-cta|section-details|gifts",
  ]);
  assert.equal(prepared.functionalCtaContract.gifts.reason, "no-usable-methods");
  assert.equal(prepared.functionalCtaContract.gifts.ready, false);
});

test("separates representative blockers from warnings when publish finalization inputs are not ready", () => {
  const draftState = createRepresentativeBlockingDraftFixture();
  const result = validatePreparedPublicationRenderState({
    rawObjetos: draftState.objetos,
    rawSecciones: draftState.secciones,
    objetosFinales: draftState.objetos,
    seccionesFinales: draftState.secciones,
    rawRsvp: draftState.rsvp,
    rawGifts: draftState.gifts,
  });

  assert.equal(result.canPublish, false);
  assert.deepEqual(issueKeys(result.blockers), [
    "countdown-frame-unresolved|count-modern|section-hero|frameSvgUrl",
    "gallery-media-unresolved|gallery-main|section-gallery|cells[0].mediaUrl",
    "gallery-media-unresolved|gallery-main|section-gallery|cells[1].mediaUrl",
    "gift-disabled-with-button|gift-cta|section-details|gifts.enabled",
    "icon-asset-unresolved|icon-raster|section-details|src",
    "image-asset-unresolved|hero-image|section-hero|src",
    "image-crop-not-materialized|hero-image|section-hero|crop",
    "missing-section-reference|orphan-text|section-missing|seccionId",
    "rsvp-disabled-with-button|rsvp-cta|section-details|rsvp.enabled",
    "section-background-unresolved|-|section-hero|fondoImagen",
    "section-decoration-unresolved|-|section-hero|decoracionesFondo.items[0].src",
    "section-decoration-unresolved|-|section-hero|decoracionesFondo.items[1].src",
  ]);
  assert.deepEqual(issueKeys(result.warnings), [
    "countdown-target-compat-alias|count-legacy|section-details|fechaISO",
    "fullbleed-editor-drift|hero-image|section-hero|anclaje",
    "legacy-countdown-schema-v1-frozen|count-legacy|section-details|countdownSchemaVersion",
    "legacy-icono-svg-frozen|icon-legacy|section-details|tipo",
    "pantalla-ynorm-drift|hero-image|section-hero|yNorm",
  ]);
  assert.equal(result.summary.blockerCount, 12);
  assert.equal(result.summary.warningCount, 5);
  assert.match(result.summary.blockingMessage, /^No se puede publicar todavia:/);
  assert.match(result.summary.warningMessage, /advertencias de compatibilidad/);
});

test("blocks unresolved Gallery media even when a preset hides the cell", () => {
  const gallery = {
    id: "gallery-hidden-unresolved",
    tipo: "galeria",
    seccionId: "section-1",
    width: 300,
    height: 180,
    rows: 2,
    cols: 2,
    allowedLayouts: ["banner", "squares"],
    defaultLayout: "squares",
    currentLayout: "banner",
    cells: [
      { mediaUrl: "https://cdn.example.com/visible.jpg" },
      { mediaUrl: "usuarios/u/imagenes/hidden-unresolved.jpg" },
    ],
  };

  const result = validatePreparedPublicationRenderState({
    rawObjetos: [gallery],
    rawSecciones: FIXED_SECTION,
    objetosFinales: [gallery],
    seccionesFinales: FIXED_SECTION,
  });

  assert.equal(result.canPublish, false);
  assert.deepEqual(issueKeys(result.blockers), [
    "gallery-media-unresolved|gallery-hidden-unresolved|section-1|cells[1].mediaUrl",
  ]);
});

test("blocks unresolved enabled section edge decorations", () => {
  const rawSecciones = [
    {
      id: "section-edge",
      orden: 1,
      altoModo: "pantalla",
      altura: 500,
      decoracionesBorde: {
        top: {
          enabled: true,
          src: FIXTURE_PATHS.decorTop,
          storagePath: FIXTURE_PATHS.decorTop,
        },
        bottom: {
          enabled: false,
          src: FIXTURE_PATHS.decorBottom,
          storagePath: FIXTURE_PATHS.decorBottom,
        },
      },
    },
  ];

  const result = validatePreparedPublicationRenderState({
    rawObjetos: [],
    rawSecciones,
    objetosFinales: [],
    seccionesFinales: rawSecciones,
  });

  assert.equal(result.canPublish, false);
  assert.deepEqual(issueKeys(result.blockers), [
    "section-edge-decoration-unresolved|-|section-edge|decoracionesBorde.top.src",
  ]);
});

test("blocks malformed preserved group contracts during publish validation", () => {
  const rawObjetos = [createMalformedGroupedObject()];

  const result = validatePreparedPublicationRenderState({
    rawObjetos,
    rawSecciones: FIXED_SECTION,
    objetosFinales: rawObjetos,
    seccionesFinales: FIXED_SECTION,
  });

  assert.equal(result.canPublish, false);
  assert.deepEqual(issueKeys(result.blockers), [
    "group-child-ynorm-forbidden|broken-group|section-1|children[1].yNorm",
    "group-nested-unsupported|broken-group|section-1|children[0]",
  ]);
});
