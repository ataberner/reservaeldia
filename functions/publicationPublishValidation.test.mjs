import test from "node:test";
import assert from "node:assert/strict";

import {
  FIXTURE_BUCKET,
  FIXTURE_PATHS,
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
  preparePublicationRenderState,
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
