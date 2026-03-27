import test from "node:test";
import assert from "node:assert/strict";

import {
  FIXTURE_BUCKET,
  FIXTURE_PATHS,
} from "../shared/renderAssetContractFixtures.mjs";
import {
  createPublishValidationImageDownloadBuffer,
  createRepresentativePublishReadyDraftFixture,
} from "../shared/publicationPublishValidationFixtures.mjs";
import {
  installFirebaseStorageMock,
} from "./testUtils/firebaseStorageMock.mjs";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const {
  preparePublicationRenderState,
} = requireBuiltModule("lib/payments/publicationPublishValidation.js");
const {
  executePublicationPublish,
} = requireBuiltModule("lib/payments/publicationPublishExecution.js");

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

function toIsoOrNull(value) {
  if (value === null) return null;
  if (!value || typeof value.toDate !== "function") return undefined;
  return value.toDate().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

async function buildResolvedArtifacts(draftData) {
  const prepared = await preparePublicationRenderState(draftData);

  return {
    draftRenderState: prepared.draftRenderState,
    objetosFinales: prepared.objetosFinales,
    seccionesFinales: prepared.seccionesFinales,
    rsvp: prepared.functionalCtaContract.rsvp.config
      ? clone(prepared.functionalCtaContract.rsvp.config)
      : null,
    gifts: prepared.functionalCtaContract.gifts.config
      ? clone(prepared.functionalCtaContract.gifts.config)
      : null,
    functionalCtaContract: prepared.functionalCtaContract,
  };
}

async function createExecutionInput(t, draftOverrides = {}) {
  const storageMock = installFirebaseStorageMock({
    defaultBucketName: FIXTURE_BUCKET,
    files: createRepresentativeStorageFiles(),
  });
  t.after(() => storageMock.restore());

  const draftData = {
    ...createRepresentativePublishReadyDraftFixture(),
    plantillaId: "tpl-1",
    nombre: "Fiesta de Lucia",
    tipoInvitacion: "boda",
    plantillaTipo: "cumple",
    tipo: undefined,
    thumbnailUrl: "https://cdn.example.test/cover.webp",
    invitadosCount: 42,
    ...draftOverrides,
  };

  return {
    draftData,
    artifacts: await buildResolvedArtifacts(draftData),
  };
}

function createExecutionHarness(overrides = {}) {
  const calls = {
    savedHtml: [],
    iconUsage: [],
    writes: [],
    analytics: [],
    warnings: [],
    errors: [],
  };
  let updatedAtCounter = 0;

  const applyIconUsageDelta = async (input) => {
    calls.iconUsage.push(input);

    if (overrides.applyIconUsageDelta) {
      return overrides.applyIconUsageDelta(input);
    }

    return {
      newUsage: { "icon-heart": 2 },
      appliedDelta: { "icon-heart": 2 },
      unresolvedRefs: ["icon-missing"],
      resolvedRefs: 1,
    };
  };

  const recordPublishedAnalyticsEvent = Object.prototype.hasOwnProperty.call(
    overrides,
    "recordPublishedAnalyticsEvent"
  )
    ? overrides.recordPublishedAnalyticsEvent
    : async (input) => {
        calls.analytics.push(input);
      };

  return {
    calls,
    deps: {
      unknownTemplateAnalyticsId: "unknown-template",
      createUpdatedAtValue: () => `updated-${++updatedAtCounter}`,
      createGeneratedAtValue: (date) => `generated:${date.toISOString()}`,
      async savePublicHtml(input) {
        calls.savedHtml.push(input);
      },
      applyIconUsageDelta,
      async executePublicationWrites(input) {
        calls.writes.push(input);
      },
      recordPublishedAnalyticsEvent,
      warn(message, context) {
        calls.warnings.push({ message, context });
      },
      logError(message, context) {
        calls.errors.push({ message, context });
      },
    },
  };
}

test("executePublicationPublish preserves first-publication writes, html path, analytics, and current tipo derivation", async (t) => {
  const { draftData, artifacts } = await createExecutionInput(t);
  const harness = createExecutionHarness();

  const result = await executePublicationPublish({
    draftSlug: "draft-1",
    publicSlug: "mi-slug",
    uid: "user-1",
    operation: "new",
    paymentSessionId: "session-1",
    draftData,
    existingData: null,
    artifacts,
    now: new Date("2026-03-27T09:00:00.000Z"),
    ...harness.deps,
  });

  assert.deepEqual(result, {
    publicSlug: "mi-slug",
    publicUrl: "https://reservaeldia.com.ar/i/mi-slug",
  });
  assert.equal(harness.calls.savedHtml.length, 1);
  assert.equal(harness.calls.savedHtml[0].filePath, "publicadas/mi-slug/index.html");
  assert.match(harness.calls.savedHtml[0].html, /<html/i);
  assert.equal(harness.calls.writes.length, 1);
  assert.equal(harness.calls.iconUsage.length, 1);

  const write = harness.calls.writes[0];
  assert.equal(write.publicationWrite.slug, "mi-slug");
  assert.equal(write.publicationWrite.slugOriginal, "draft-1");
  assert.equal(write.publicationWrite.userId, "user-1");
  assert.equal(write.publicationWrite.urlPublica, "https://reservaeldia.com.ar/i/mi-slug");
  assert.equal(write.publicationWrite.nombre, "Fiesta de Lucia");
  assert.equal(write.publicationWrite.tipo, "cumple");
  assert.equal(write.publicationWrite.portada, "https://cdn.example.test/cover.webp");
  assert.equal(write.publicationWrite.invitadosCount, 42);
  assert.equal(write.publicationWrite.estado, "publicada_activa");
  assert.equal(
    toIsoOrNull(write.publicationWrite.publicadaAt),
    "2026-03-27T09:00:00.000Z"
  );
  assert.equal(
    toIsoOrNull(write.publicationWrite.ultimaPublicacionEn),
    "2026-03-27T09:00:00.000Z"
  );
  assert.deepEqual(write.publicationWrite.iconUsage, { "icon-heart": 2 });
  assert.deepEqual(write.publicationWrite.iconUsageMeta, {
    source: "publish-delta",
    resolvedRefs: 1,
    unresolvedRefs: 1,
    generatedAt: "generated:2026-03-27T09:00:00.000Z",
    appliedDelta: { "icon-heart": 2 },
  });
  assert.equal(write.draftWrite.slugPublico, "mi-slug");
  assert.equal(write.draftWrite.ultimaOperacionPublicacion, "new");
  assert.equal(write.draftWrite.lastPaymentSessionId, "session-1");
  assert.equal(write.draftWrite.draftContentMeta.updatedAt, "updated-1");

  assert.equal(harness.calls.analytics.length, 1);
  assert.equal(harness.calls.analytics[0].eventId, "invitacion_publicada:draft-1");
  assert.equal(harness.calls.analytics[0].eventName, "invitacion_publicada");
  assert.equal(
    harness.calls.analytics[0].timestamp.toISOString(),
    "2026-03-27T09:00:00.000Z"
  );
  assert.equal(harness.calls.analytics[0].templateId, "tpl-1");
  assert.deepEqual(harness.calls.analytics[0].metadata, {
    publicSlug: "mi-slug",
    firstPublishedAt: "2026-03-27T09:00:00.000Z",
    templateName: "Fiesta de Lucia",
    operation: "new",
  });
});

test("executePublicationPublish preserves planner-driven paused update behavior without first-publication analytics", async (t) => {
  const { draftData, artifacts } = await createExecutionInput(t, {
    nombre: "Actualizacion",
  });
  const harness = createExecutionHarness();

  await executePublicationPublish({
    draftSlug: "draft-1",
    publicSlug: "mi-slug",
    uid: "user-1",
    operation: "update",
    paymentSessionId: "session-2",
    draftData,
    existingData: {
      estado: "publicada_pausada",
      publicadaAt: "2025-05-01T10:00:00.000Z",
      vigenteHasta: "2026-05-01T10:00:00.000Z",
      pausadaAt: "2026-01-10T08:30:00.000Z",
      iconUsage: { legacy: 3 },
    },
    artifacts,
    now: new Date("2026-03-27T09:00:00.000Z"),
    ...harness.deps,
  });

  assert.equal(harness.calls.analytics.length, 0);
  assert.equal(harness.calls.iconUsage.length, 1);
  assert.deepEqual(harness.calls.iconUsage[0].oldUsageMap, { legacy: 3 });

  const write = harness.calls.writes[0];
  assert.equal(write.publicationWrite.estado, "publicada_pausada");
  assert.equal(
    toIsoOrNull(write.publicationWrite.publicadaAt),
    "2025-05-01T10:00:00.000Z"
  );
  assert.equal(
    toIsoOrNull(write.publicationWrite.venceAt),
    "2026-05-01T10:00:00.000Z"
  );
  assert.equal(
    toIsoOrNull(write.publicationWrite.pausadaAt),
    "2026-01-10T08:30:00.000Z"
  );
  assert.equal(
    toIsoOrNull(write.publicationWrite.ultimaPublicacionEn),
    "2026-03-27T09:00:00.000Z"
  );
  assert.equal(write.draftWrite.ultimaOperacionPublicacion, "update");
  assert.equal(write.draftWrite.lastPaymentSessionId, "session-2");
});

test("executePublicationPublish keeps icon usage failures non-blocking and preserves default metadata fallback", async (t) => {
  const { draftData, artifacts } = await createExecutionInput(t, {
    plantillaId: "",
    nombre: "",
  });
  const harness = createExecutionHarness({
    async applyIconUsageDelta(input) {
      throw new Error("icon delta failed");
    },
  });

  const result = await executePublicationPublish({
    draftSlug: "draft-1",
    publicSlug: "mi-slug",
    uid: "user-1",
    operation: "new",
    paymentSessionId: "session-3",
    draftData,
    existingData: null,
    artifacts,
    now: new Date("2026-03-27T09:00:00.000Z"),
    ...harness.deps,
  });

  assert.equal(result.publicUrl, "https://reservaeldia.com.ar/i/mi-slug");
  assert.equal(harness.calls.warnings.length, 1);
  assert.equal(
    harness.calls.warnings[0].message,
    "No se pudo actualizar estadisticas de iconos al publicar"
  );
  assert.equal(harness.calls.writes.length, 1);
  assert.deepEqual(harness.calls.writes[0].publicationWrite.iconUsage, {});
  assert.deepEqual(harness.calls.writes[0].publicationWrite.iconUsageMeta, {
    source: "publish-delta",
    resolvedRefs: 0,
    unresolvedRefs: 0,
    generatedAt: "generated:2026-03-27T09:00:00.000Z",
  });
  assert.equal(harness.calls.analytics.length, 1);
  assert.equal(harness.calls.analytics[0].templateId, "unknown-template");
  assert.deepEqual(harness.calls.analytics[0].metadata, {
    publicSlug: "mi-slug",
    firstPublishedAt: "2026-03-27T09:00:00.000Z",
    templateName: "mi-slug",
    operation: "new",
  });
});
