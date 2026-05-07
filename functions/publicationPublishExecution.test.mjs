import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

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

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const {
  preparePublicationRenderState,
} = requireBuiltModule("lib/payments/publicationPublishValidation.js");
const {
  executePublicationPublish,
} = requireBuiltModule("lib/payments/publicationPublishExecution.js");
const {
  injectOpenGraphMetadata,
  isCompliantPublishedShareImageBuffer,
  isCurrentGeneratedShareImageRequest,
  isPublishedShareImageEnabled,
  resolveRequiredGeneratedPublishedShareImageMetadata,
  resolvePublishedShareImageMetadata,
} = requireBuiltModule("lib/payments/publishedShareImage.js");
const {
  captureFirstSectionShareImage,
  parseCssTimeListForShareRenderer,
  resolveFiniteCssMotionWaitMsForShareRenderer,
} = requireBuiltModule("lib/payments/publishedShareImageRenderer.js");

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

async function createJpegBuffer(width = 1200, height = 630, color = "#ffffff") {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function createBandJpegBuffer({
  width = 1200,
  height = 900,
  splitY = 630,
  top = "#ff0000",
  bottom = "#0000ff",
} = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect x="0" y="0" width="${width}" height="${splitY}" fill="${top}" />
    <rect x="0" y="${splitY}" width="${width}" height="${height - splitY}" fill="${bottom}" />
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

async function readImageMetadata(buffer) {
  const metadata = await sharp(buffer).metadata();
  return {
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
  };
}

async function readPixel(buffer, x, y) {
  const { data, info } = await sharp(buffer)
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });
  const index = (y * info.width + x) * info.channels;
  return {
    r: data[index],
    g: data[index + 1],
    b: data[index + 2],
    a: data[index + 3],
  };
}

function installFetchImageMock(t, imagesByUrl) {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    const imageUrl = String(url);
    requests.push(imageUrl);
    const buffer = imagesByUrl[imageUrl] || null;
    return {
      ok: Boolean(buffer),
      status: buffer ? 200 : 404,
      headers: {
        get(name) {
          const key = String(name || "").toLowerCase();
          if (key === "content-type") return buffer ? "image/jpeg" : "text/plain";
          if (key === "content-length") return buffer ? String(buffer.length) : "0";
          return "";
        },
      },
      async arrayBuffer() {
        if (!buffer) return new ArrayBuffer(0);
        return buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength
        );
      },
    };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  return requests;
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
    portada: "https://cdn.example.test/draft-portada.webp",
    thumbnailUrl: "https://cdn.example.test/cover.webp",
    previewUrl: "https://cdn.example.test/draft-preview.webp",
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
    savedShareImages: [],
    confirmedShareImages: [],
    shareUrlValidations: [],
    loadedTemplateShareImages: [],
    iconUsage: [],
    writes: [],
    analytics: [],
    warnings: [],
    errors: [],
    order: [],
    readArtifacts: [],
    restoredArtifacts: [],
    deletedArtifacts: [],
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
        calls.order.push("save-html");
        calls.savedHtml.push(input);
        if (overrides.savePublicHtml) {
          return overrides.savePublicHtml(input);
        }
      },
      async savePublicShareImage(input) {
        calls.order.push("save-share");
        calls.savedShareImages.push(input);
        if (overrides.savePublicShareImage) {
          return overrides.savePublicShareImage(input);
        }
      },
      async confirmPublicShareImage(input) {
        calls.order.push("confirm-share");
        calls.confirmedShareImages.push(input);
        if (overrides.confirmPublicShareImage) {
          return overrides.confirmPublicShareImage(input);
        }
        return true;
      },
      async generateShareImage(input) {
        calls.order.push("generate-share");
        if (overrides.generateShareImage) {
          return overrides.generateShareImage(input);
        }
        return {
          buffer: await createJpegBuffer(),
          width: 1200,
          height: 630,
          mimeType: "image/jpeg",
        };
      },
      async validatePublicShareImageUrl(input) {
        calls.shareUrlValidations.push(input);
        if (overrides.validatePublicShareImageUrl) {
          return overrides.validatePublicShareImageUrl(input);
        }
        return input.source === "static-default";
      },
      async loadTemplateShareImageUrl(input) {
        calls.loadedTemplateShareImages.push(input);
        if (overrides.loadTemplateShareImageUrl) {
          return overrides.loadTemplateShareImageUrl(input);
        }
        return null;
      },
      shareImageEnabled: Object.prototype.hasOwnProperty.call(
        overrides,
        "shareImageEnabled"
      )
        ? overrides.shareImageEnabled
        : true,
      async readPublicArtifact(input) {
        calls.readArtifacts.push(input);
        if (overrides.readPublicArtifact) {
          return overrides.readPublicArtifact(input);
        }
        return null;
      },
      async restorePublicArtifact(input) {
        calls.restoredArtifacts.push(input);
        if (overrides.restorePublicArtifact) {
          return overrides.restorePublicArtifact(input);
        }
      },
      async deletePublicArtifact(input) {
        calls.deletedArtifacts.push(input);
        if (overrides.deletePublicArtifact) {
          return overrides.deletePublicArtifact(input);
        }
      },
      defaultShareImageUrl:
        overrides.defaultShareImageUrl ||
        "https://reservaeldia.com.ar/assets/img/default-share.jpg",
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

test("executePublicationPublish preserves first-publication writes, html path, analytics, and draft-first metadata derivation", async (t) => {
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
  assert.equal(write.publicationWrite.tipo, "boda");
  assert.equal(write.publicationWrite.portada, "https://cdn.example.test/cover.webp");
  assert.equal(write.publicationWrite.share.status, "generated");
  assert.equal(write.publicationWrite.share.source, "renderer");
  assert.equal(write.publicationWrite.share.storagePath, "publicadas/mi-slug/share.jpg");
  assert.match(
    write.publicationWrite.share.imageUrl,
    /^https:\/\/reservaeldia\.com\.ar\/i\/mi-slug\/share\.jpg\?v=/
  );
  assert.notEqual(write.publicationWrite.share.status, "pending");
  assert.equal(harness.calls.savedShareImages.length, 1);
  assert.deepEqual(harness.calls.order.slice(0, 4), [
    "generate-share",
    "save-share",
    "confirm-share",
    "save-html",
  ]);
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

test("executePublicationPublish falls back to compatibility metadata only when modern draft metadata is absent", async (t) => {
  const { draftData, artifacts } = await createExecutionInput(t, {
    tipoInvitacion: "",
    tipo: "empresarial",
    plantillaTipo: "cumple",
    thumbnailUrl: "",
    portada: "https://cdn.example.test/from-portada.webp",
    previewUrl: "https://cdn.example.test/from-preview.webp",
  });
  const harness = createExecutionHarness();

  await executePublicationPublish({
    draftSlug: "draft-1",
    publicSlug: "mi-slug",
    uid: "user-1",
    operation: "new",
    paymentSessionId: "session-compat",
    draftData,
    existingData: null,
    artifacts,
    now: new Date("2026-03-27T09:00:00.000Z"),
    ...harness.deps,
  });

  const write = harness.calls.writes[0];
  assert.equal(write.publicationWrite.tipo, "empresarial");
  assert.equal(
    write.publicationWrite.portada,
    "https://cdn.example.test/from-portada.webp"
  );
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

test("executePublicationPublish keeps icon usage failures non-blocking after generated share succeeds", async (t) => {
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
  assert.equal(harness.calls.writes[0].publicationWrite.share.status, "generated");
  assert.equal(harness.calls.savedShareImages.length, 1);
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

test("injectOpenGraphMetadata escapes managed Open Graph and Twitter metadata", () => {
  const html = '<html><head><meta property="og:image" content="old" /></head><body></body></html>';
  const output = injectOpenGraphMetadata(html, {
    title: 'Fiesta "A" & <B>',
    description: "Venite > ahora & disfruta",
    imageUrl: 'https://cdn.example.test/share.jpg?x=1&name="bad"',
    url: "https://reservaeldia.com.ar/i/mi-slug?x=1&y=2",
  });

  assert.doesNotMatch(output, /content="old"/);
  assert.match(output, /property="og:title" content="Fiesta &quot;A&quot; &amp; &lt;B&gt;"/);
  assert.match(output, /property="og:description" content="Venite &gt; ahora &amp; disfruta"/);
  assert.match(output, /name="twitter:card" content="summary_large_image"/);
  assert.match(output, /og:image:width" content="1200"/);
  assert.match(output, /og:image:height" content="630"/);
});

test("resolvePublishedShareImageMetadata follows fallback order from portada to template to static default", async () => {
  const validations = [];
  const share = await resolvePublishedShareImageMetadata({
    publicSlug: "mi-slug",
    publicUrl: "https://reservaeldia.com.ar/i/mi-slug",
    baseHtml: "<html><body></body></html>",
    title: "Titulo",
    description: "Descripcion",
    portada: "https://cdn.example.test/portada.jpg",
    templateId: "tpl-1",
    generatedAt: "generated-at",
    shareImageEnabled: false,
    defaultShareImageUrl: "https://reservaeldia.com.ar/assets/img/default-share.jpg",
    async validatePublicImageUrl(input) {
      validations.push(input);
      return input.source === "template-share-image";
    },
    async loadTemplateShareImageUrl(input) {
      assert.deepEqual(input, { templateId: "tpl-1" });
      return "https://cdn.example.test/template-share.jpg";
    },
  });

  assert.deepEqual(
    validations.map((item) => item.source),
    ["portada", "template-share-image"]
  );
  assert.equal(share.status, "fallback");
  assert.equal(share.source, "template-share-image");
  assert.equal(share.storagePath, null);
  assert.match(share.imageUrl, /^https:\/\/cdn\.example\.test\/template-share\.jpg\?v=/);
});

test("resolvePublishedShareImageMetadata rejects tall fallback portada and uses valid template share image", async (t) => {
  const portadaUrl = "https://cdn.example.test/portada.jpg";
  const templateUrl = "https://cdn.example.test/template-share.jpg";
  const requests = installFetchImageMock(t, {
    [portadaUrl]: await createJpegBuffer(1200, 900),
    [templateUrl]: await createJpegBuffer(1200, 630),
  });

  const share = await resolvePublishedShareImageMetadata({
    publicSlug: "mi-slug",
    publicUrl: "https://reservaeldia.com.ar/i/mi-slug",
    baseHtml: "<html><body></body></html>",
    title: "Titulo",
    description: "Descripcion",
    portada: portadaUrl,
    templateId: "tpl-1",
    generatedAt: "generated-at",
    shareImageEnabled: false,
    defaultShareImageUrl: "https://reservaeldia.com.ar/assets/img/default-share.jpg",
    async loadTemplateShareImageUrl() {
      return templateUrl;
    },
  });

  assert.deepEqual(requests, [portadaUrl, templateUrl]);
  assert.equal(share.status, "fallback");
  assert.equal(share.source, "template-share-image");
  assert.match(share.imageUrl, /^https:\/\/cdn\.example\.test\/template-share\.jpg\?v=/);
});

test("PUBLISH_SHARE_IMAGE_ENABLED=0 disables renderer execution and resolves fallback metadata", async () => {
  assert.equal(isPublishedShareImageEnabled({ PUBLISH_SHARE_IMAGE_ENABLED: "0" }), false);

  const share = await resolvePublishedShareImageMetadata({
    publicSlug: "mi-slug",
    publicUrl: "https://reservaeldia.com.ar/i/mi-slug",
    baseHtml: "<html><body></body></html>",
    title: "Titulo",
    description: "Descripcion",
    portada: "",
    generatedAt: "generated-at",
    shareImageEnabled: false,
    defaultShareImageUrl: "https://reservaeldia.com.ar/assets/img/default-share.jpg",
    async generateShareImage() {
      throw new Error("renderer should not run");
    },
    async validatePublicImageUrl(input) {
      return input.source === "static-default";
    },
  });

  assert.equal(share.status, "fallback");
  assert.equal(share.source, "static-default");
  assert.equal(share.fallbackReason, "disabled");
});

test("executePublicationPublish fails closed when share image rollback flag disables renderer", async (t) => {
  const { draftData, artifacts } = await createExecutionInput(t);
  const harness = createExecutionHarness({
    shareImageEnabled: false,
    async generateShareImage() {
      throw new Error("renderer should not run");
    },
  });

  await assert.rejects(
    () =>
      executePublicationPublish({
        draftSlug: "draft-1",
        publicSlug: "mi-slug",
        uid: "user-1",
        operation: "new",
        paymentSessionId: "session-disabled",
        draftData,
        existingData: null,
        artifacts,
        now: new Date("2026-03-27T09:00:00.000Z"),
        ...harness.deps,
      }),
    /disabled/
  );

  assert.equal(harness.calls.order.length, 0);
  assert.equal(harness.calls.writes.length, 0);
  assert.equal(harness.calls.savedHtml.length, 0);
  assert.equal(harness.calls.savedShareImages.length, 0);
});

test("publish-capable functions use browser-safe runtime options", () => {
  const source = readFileSync(new URL("./src/index.ts", import.meta.url), "utf8");
  const publishCapableFunctions = [
    "publicarInvitacion",
    "createPublicationPayment",
    "retryPaidPublicationWithNewSlug",
    "mercadoPagoWebhook",
  ];

  for (const functionName of publishCapableFunctions) {
    const start = source.indexOf(`export const ${functionName} =`);
    assert.notEqual(start, -1, `${functionName} export must exist`);
    const snippet = source.slice(start, start + 500);
    assert.match(snippet, /memory:\s*"1GiB"/, `${functionName} memory`);
    assert.match(snippet, /timeoutSeconds:\s*60/, `${functionName} timeout`);
    assert.match(snippet, /cpu:\s*1/, `${functionName} cpu`);
    assert.match(snippet, /concurrency:\s*1/, `${functionName} concurrency`);
  }

  assert.equal(
    source.includes("export const generatePublishedShareImage ="),
    false,
    "async share image trigger must not be exported"
  );
  assert.equal(
    source.includes("onDocumentWritten"),
    false,
    "publish completion must not depend on Firestore async share trigger"
  );
});

test("executePublicationPublish requires generated share metadata before final public write", async (t) => {
  const { draftData, artifacts } = await createExecutionInput(t, {
    thumbnailUrl: "",
    portada: "https://cdn.example.test/fallback-portada.jpg",
  });
  const harness = createExecutionHarness({
    shareImageEnabled: true,
    async generateShareImage() {
      return {
        buffer: await createJpegBuffer(),
        width: 1200,
        height: 630,
        mimeType: "image/jpeg",
      };
    },
  });

  await executePublicationPublish({
    draftSlug: "draft-1",
    publicSlug: "mi-slug",
    uid: "user-1",
    operation: "new",
    paymentSessionId: "session-share",
    draftData,
    existingData: null,
    artifacts,
    now: new Date("2026-03-27T09:00:00.000Z"),
    ...harness.deps,
  });

  assert.deepEqual(harness.calls.order.slice(0, 4), [
    "generate-share",
    "save-share",
    "confirm-share",
    "save-html",
  ]);
  assert.equal(harness.calls.savedShareImages.length, 1);
  assert.equal(harness.calls.confirmedShareImages.length, 1);

  const write = harness.calls.writes[0];
  assert.equal(write.publicationWrite.share.status, "generated");
  assert.equal(write.publicationWrite.share.source, "renderer");
  assert.equal(write.publicationWrite.share.storagePath, "publicadas/mi-slug/share.jpg");
  assert.match(
    write.publicationWrite.share.imageUrl,
    /^https:\/\/reservaeldia\.com\.ar\/i\/mi-slug\/share\.jpg\?v=/
  );
  assert.match(
    harness.calls.savedHtml[0].html,
    new RegExp(`property="og:image" content="${write.publicationWrite.share.imageUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`)
  );
});

test("resolvePublishedShareImageMetadata top-crops tall generated JPEG before saving", async () => {
  const tallBuffer = await createBandJpegBuffer({
    width: 1200,
    height: 900,
    splitY: 630,
    top: "#ff0000",
    bottom: "#0000ff",
  });
  let savedImage = null;

  const share = await resolvePublishedShareImageMetadata({
    publicSlug: "mi-slug",
    publicUrl: "https://reservaeldia.com.ar/i/mi-slug",
    baseHtml: "<html><body></body></html>",
    title: "Titulo",
    description: "Descripcion",
    generatedAt: "generated-at",
    shareImageEnabled: true,
    defaultShareImageUrl: "https://reservaeldia.com.ar/assets/img/default-share.jpg",
    async generateShareImage() {
      return tallBuffer;
    },
    async saveGeneratedShareImage(input) {
      savedImage = input.image;
    },
    async confirmGeneratedShareImage() {
      return true;
    },
    async validatePublicImageUrl(input) {
      return input.source === "static-default";
    },
  });

  assert.equal(share.status, "generated");
  assert.ok(Buffer.isBuffer(savedImage));
  assert.deepEqual(await readImageMetadata(savedImage), {
    format: "jpeg",
    width: 1200,
    height: 630,
  });
  const bottomPixel = await readPixel(savedImage, 600, 629);
  assert.ok(bottomPixel.r > 180);
  assert.ok(bottomPixel.b < 80);
});

test("resolvePublishedShareImageMetadata supports async renderer source and delay", async () => {
  const share = await resolvePublishedShareImageMetadata({
    publicSlug: "mi-slug",
    publicUrl: "https://reservaeldia.com.ar/i/mi-slug",
    baseHtml: "<html><body></body></html>",
    title: "Titulo",
    description: "Descripcion",
    generatedAt: "generated-at",
    shareImageEnabled: true,
    renderDelayMs: 15000,
    generatedSource: "renderer",
    async generateShareImage(input) {
      assert.equal(input.delayMs, 15000);
      return {
        buffer: await createJpegBuffer(),
        width: 1200,
        height: 630,
        mimeType: "image/jpeg",
      };
    },
    async saveGeneratedShareImage() {},
    async confirmGeneratedShareImage() {
      return true;
    },
    async validatePublicImageUrl(input) {
      return input.source === "static-default";
    },
  });

  assert.equal(share.status, "generated");
  assert.equal(share.source, "renderer");
  assert.equal(share.storagePath, "publicadas/mi-slug/share.jpg");
});

test("resolvePublishedShareImageMetadata rejects generated buffers that cannot be safely normalized", async () => {
  let saveCalled = false;
  const wrongWidthBuffer = await createJpegBuffer(1000, 630);

  const share = await resolvePublishedShareImageMetadata({
    publicSlug: "mi-slug",
    publicUrl: "https://reservaeldia.com.ar/i/mi-slug",
    baseHtml: "<html><body></body></html>",
    title: "Titulo",
    description: "Descripcion",
    generatedAt: "generated-at",
    shareImageEnabled: true,
    defaultShareImageUrl: "https://reservaeldia.com.ar/assets/img/default-share.jpg",
    async generateShareImage() {
      return wrongWidthBuffer;
    },
    async saveGeneratedShareImage() {
      saveCalled = true;
    },
    async confirmGeneratedShareImage() {
      return true;
    },
    async validatePublicImageUrl(input) {
      return input.source === "static-default";
    },
  });

  assert.equal(saveCalled, false);
  assert.equal(share.status, "fallback");
  assert.equal(share.source, "static-default");
  assert.equal(share.fallbackReason, "invalid-generated-image");
});

test("isCompliantPublishedShareImageBuffer rejects stored images with wrong dimensions", async () => {
  assert.equal(
    await isCompliantPublishedShareImageBuffer(await createJpegBuffer(1200, 630)),
    true
  );
  assert.equal(
    await isCompliantPublishedShareImageBuffer(await createJpegBuffer(1200, 900)),
    false
  );
});

test("resolvePublishedShareImageMetadata falls back when stored generated share image confirmation rejects dimensions", async () => {
  const corruptStoredImage = await createJpegBuffer(1200, 900);
  const share = await resolvePublishedShareImageMetadata({
    publicSlug: "mi-slug",
    publicUrl: "https://reservaeldia.com.ar/i/mi-slug",
    baseHtml: "<html><body></body></html>",
    title: "Titulo",
    description: "Descripcion",
    generatedAt: "generated-at",
    shareImageEnabled: true,
    async generateShareImage() {
      return await createJpegBuffer();
    },
    async saveGeneratedShareImage() {
      // Simulates a bad stored object even though the generated bytes were valid.
    },
    async confirmGeneratedShareImage() {
      return isCompliantPublishedShareImageBuffer(corruptStoredImage);
    },
    defaultShareImageUrl: "https://reservaeldia.com.ar/assets/img/default-share.jpg",
    async validatePublicImageUrl(input) {
      return input.source === "static-default";
    },
  });

  assert.equal(share.status, "fallback");
  assert.equal(share.source, "static-default");
  assert.equal(share.fallbackReason, "share-upload-failed");
});

test("isCurrentGeneratedShareImageRequest gates public share route against stale or fallback metadata", () => {
  const generatedPublication = {
    share: {
      status: "generated",
      source: "published-html-first-section",
      storagePath: "publicadas/mi-slug/share.jpg",
      version: "v1",
      imageUrl: "https://reservaeldia.com.ar/i/mi-slug/share.jpg?v=v1",
    },
  };

  assert.equal(
    isCurrentGeneratedShareImageRequest({
      publicationData: generatedPublication,
      publicSlug: "mi-slug",
      requestedVersion: "v1",
    }),
    true
  );
  assert.equal(
    isCurrentGeneratedShareImageRequest({
      publicationData: {
        share: {
          ...generatedPublication.share,
          source: "renderer",
        },
      },
      publicSlug: "mi-slug",
      requestedVersion: "v1",
    }),
    true
  );
  assert.notEqual(generatedPublication.share.status, "pending");
  assert.equal(
    isCurrentGeneratedShareImageRequest({
      publicationData: generatedPublication,
      publicSlug: "mi-slug",
      requestedVersion: "old",
    }),
    false
  );
  assert.equal(
    isCurrentGeneratedShareImageRequest({
      publicationData: {
        share: {
          ...generatedPublication.share,
          status: "fallback",
          storagePath: null,
        },
      },
      publicSlug: "mi-slug",
      requestedVersion: "v1",
    }),
    false
  );
  assert.equal(
    isCurrentGeneratedShareImageRequest({
      publicationData: {
        share: {
          ...generatedPublication.share,
          storagePath: "publicadas/otro-slug/share.jpg",
        },
      },
      publicSlug: "mi-slug",
      requestedVersion: "v1",
    }),
    false
  );
});

test("executePublicationPublish regenerates share metadata on republish", async (t) => {
  const { draftData, artifacts } = await createExecutionInput(t, {
    thumbnailUrl: "",
    portada: "",
  });
  const harness = createExecutionHarness({
    shareImageEnabled: true,
  });

  await executePublicationPublish({
    draftSlug: "draft-1",
    publicSlug: "mi-slug",
    uid: "user-1",
    operation: "new",
    paymentSessionId: "session-first",
    draftData,
    existingData: null,
    artifacts,
    now: new Date("2026-03-27T09:00:00.000Z"),
    ...harness.deps,
  });
  const firstShare = harness.calls.writes[0].publicationWrite.share;

  await executePublicationPublish({
    draftSlug: "draft-1",
    publicSlug: "mi-slug",
    uid: "user-1",
    operation: "update",
    paymentSessionId: "session-update",
    draftData: { ...draftData, nombre: "Fiesta actualizada" },
    existingData: harness.calls.writes[0].publicationWrite,
    artifacts,
    now: new Date("2026-03-28T09:00:00.000Z"),
    ...harness.deps,
  });
  const secondShare = harness.calls.writes[1].publicationWrite.share;

  assert.equal(harness.calls.savedShareImages.length, 2);
  assert.equal(firstShare.status, "generated");
  assert.equal(secondShare.status, "generated");
  assert.equal(firstShare.storagePath, "publicadas/mi-slug/share.jpg");
  assert.equal(secondShare.storagePath, "publicadas/mi-slug/share.jpg");
  assert.notEqual(firstShare.version, secondShare.version);
  assert.notEqual(firstShare.imageUrl, secondShare.imageUrl);
});

test("resolvePublishedShareImageMetadata uses new slug in generated share storage path and image URL", async () => {
  let savedPath = "";
  const share = await resolvePublishedShareImageMetadata({
    publicSlug: "nuevo-slug",
    publicUrl: "https://reservaeldia.com.ar/i/nuevo-slug",
    baseHtml: "<html><body></body></html>",
    title: "Titulo",
    description: "Descripcion",
    generatedAt: "generated-at",
    shareImageEnabled: true,
    async generateShareImage() {
      return {
        buffer: await createJpegBuffer(),
        width: 1200,
        height: 630,
        mimeType: "image/jpeg",
      };
    },
    async saveGeneratedShareImage(input) {
      savedPath = input.storagePath;
    },
    async confirmGeneratedShareImage() {
      return true;
    },
    async validatePublicImageUrl(input) {
      return input.source === "static-default";
    },
  });
  assert.equal(savedPath, "publicadas/nuevo-slug/share.jpg");
  assert.equal(share.storagePath, "publicadas/nuevo-slug/share.jpg");
  assert.match(
    share.imageUrl,
    /^https:\/\/reservaeldia\.com\.ar\/i\/nuevo-slug\/share\.jpg\?v=/
  );
});

test("resolvePublishedShareImageMetadata falls back when generated share upload cannot be confirmed", async () => {
  const share = await resolvePublishedShareImageMetadata({
    publicSlug: "mi-slug",
    publicUrl: "https://reservaeldia.com.ar/i/mi-slug",
    baseHtml: "<html><body></body></html>",
    title: "Titulo",
    description: "Descripcion",
    portada: "https://cdn.example.test/valid-portada.jpg",
    generatedAt: "generated-at",
    shareImageEnabled: true,
    async generateShareImage() {
      return {
        buffer: await createJpegBuffer(),
        width: 1200,
        height: 630,
        mimeType: "image/jpeg",
      };
    },
    async saveGeneratedShareImage() {},
    async confirmGeneratedShareImage() {
      return false;
    },
    async validatePublicImageUrl(input) {
      return input.source === "portada";
    },
  });

  assert.equal(share.status, "fallback");
  assert.equal(share.source, "portada");
  assert.equal(share.storagePath, null);
  assert.equal(share.fallbackReason, "share-upload-failed");
  assert.match(share.imageUrl, /^https:\/\/cdn\.example\.test\/valid-portada\.jpg\?v=/);
});

test("executePublicationPublish does not reuse stale existing share metadata when generated share fails", async (t) => {
  const { draftData, artifacts } = await createExecutionInput(t, {
    thumbnailUrl: "",
    previewUrl: "",
    portada: "",
  });
  const harness = createExecutionHarness({
    shareImageEnabled: true,
    async generateShareImage() {
      throw new Error("renderer failed");
    },
  });

  await assert.rejects(
    () =>
      executePublicationPublish({
        draftSlug: "draft-1",
        publicSlug: "mi-slug",
        uid: "user-1",
        operation: "update",
        paymentSessionId: "session-retry",
        draftData,
        existingData: {
          estado: "publicada_activa",
          publicadaAt: "2026-03-26T09:00:00.000Z",
          vigenteHasta: "2027-03-26T09:00:00.000Z",
          borradorSlug: "draft-1",
          share: {
            status: "generated",
            source: "published-html-first-section",
            storagePath: "publicadas/mi-slug/share.jpg",
            imageUrl: "https://stale.example.test/share.jpg?v=old",
            version: "old",
          },
        },
        artifacts,
        now: new Date("2026-03-27T09:00:00.000Z"),
        ...harness.deps,
      }),
    /renderer failed/
  );

  assert.equal(harness.calls.writes.length, 0);
  assert.equal(harness.calls.savedHtml.length, 0);
  assert.equal(harness.calls.savedShareImages.length, 0);
});

test("executePublicationPublish restores same-slug artifacts when republish fails after share upload", async (t) => {
  const { draftData, artifacts } = await createExecutionInput(t);
  const oldHtml = Buffer.from("<html>old</html>");
  const oldShare = await createJpegBuffer(1200, 630, "#00ff00");
  const harness = createExecutionHarness({
    async readPublicArtifact({ filePath }) {
      if (filePath.endsWith("/index.html")) {
        return {
          content: oldHtml,
          contentType: "text/html",
          cacheControl: "public,max-age=3600",
        };
      }
      if (filePath.endsWith("/share.jpg")) {
        return {
          content: oldShare,
          contentType: "image/jpeg",
          cacheControl: "public,max-age=31536000,immutable",
        };
      }
      return null;
    },
    async savePublicHtml() {
      throw new Error("html upload failed");
    },
  });

  await assert.rejects(
    () =>
      executePublicationPublish({
        draftSlug: "draft-1",
        publicSlug: "mi-slug",
        uid: "user-1",
        operation: "update",
        paymentSessionId: "session-update",
        draftData,
        existingData: {
          estado: "publicada_activa",
          publicadaAt: "2026-03-26T09:00:00.000Z",
          vigenteHasta: "2027-03-26T09:00:00.000Z",
          borradorSlug: "draft-1",
        },
        artifacts,
        now: new Date("2026-03-27T09:00:00.000Z"),
        ...harness.deps,
      }),
    /html upload failed/
  );

  assert.deepEqual(
    harness.calls.restoredArtifacts.map((item) => item.filePath).sort(),
    ["publicadas/mi-slug/index.html", "publicadas/mi-slug/share.jpg"]
  );
  assert.equal(harness.calls.deletedArtifacts.length, 0);
  assert.equal(harness.calls.writes.length, 0);
});

test("executePublicationPublish cleans new slug artifacts when publish fails after share upload", async (t) => {
  const { draftData, artifacts } = await createExecutionInput(t);
  const harness = createExecutionHarness({
    async savePublicHtml() {
      throw new Error("html upload failed");
    },
  });

  await assert.rejects(
    () =>
      executePublicationPublish({
        draftSlug: "draft-1",
        publicSlug: "nuevo-slug",
        uid: "user-1",
        operation: "new",
        paymentSessionId: "session-new",
        draftData,
        existingData: null,
        artifacts,
        now: new Date("2026-03-27T09:00:00.000Z"),
        ...harness.deps,
      }),
    /html upload failed/
  );

  assert.deepEqual(
    harness.calls.deletedArtifacts.map((item) => item.filePath).sort(),
    ["publicadas/nuevo-slug/index.html", "publicadas/nuevo-slug/share.jpg"]
  );
  assert.equal(harness.calls.restoredArtifacts.length, 0);
  assert.equal(harness.calls.writes.length, 0);
});

test("executePublicationPublish fails closed on renderer timeout or error", async (t) => {
  const { draftData, artifacts } = await createExecutionInput(t, {
    thumbnailUrl: "",
    previewUrl: "",
    portada: "",
  });
  const harness = createExecutionHarness({
    shareImageEnabled: true,
    async generateShareImage() {
      throw new Error("TimeoutError: renderer timed out");
    },
  });

  await assert.rejects(
    () =>
      executePublicationPublish({
        draftSlug: "draft-1",
        publicSlug: "mi-slug",
        uid: "user-1",
        operation: "new",
        paymentSessionId: "session-timeout",
        draftData,
        existingData: null,
        artifacts,
        now: new Date("2026-03-27T09:00:00.000Z"),
        ...harness.deps,
      }),
    /renderer-timeout/
  );

  assert.equal(harness.calls.writes.length, 0);
  assert.equal(harness.calls.savedHtml.length, 0);
  assert.equal(harness.calls.savedShareImages.length, 0);
  assert.equal(harness.calls.warnings.length, 1);
  assert.equal(
    harness.calls.warnings[0].message,
    "No se pudo generar imagen share publicada; se bloquea publish"
  );
});

test("executePublicationPublish rejects upload-confirmation failure instead of publishing fallback", async (t) => {
  const { draftData, artifacts } = await createExecutionInput(t, {
    portada: "https://cdn.example.test/valid-fallback.jpg",
  });
  const harness = createExecutionHarness({
    async confirmPublicShareImage() {
      return false;
    },
  });

  await assert.rejects(
    () =>
      executePublicationPublish({
        draftSlug: "draft-1",
        publicSlug: "mi-slug",
        uid: "user-1",
        operation: "new",
        paymentSessionId: "session-confirm",
        draftData,
        existingData: null,
        artifacts,
        now: new Date("2026-03-27T09:00:00.000Z"),
        ...harness.deps,
      }),
    /share-upload-failed/
  );

  assert.equal(harness.calls.writes.length, 0);
  assert.equal(harness.calls.savedHtml.length, 0);
  assert.equal(harness.calls.deletedArtifacts.length, 1);
  assert.equal(harness.calls.deletedArtifacts[0].filePath, "publicadas/mi-slug/share.jpg");
});

test("resolvePublishedShareImageMetadata enforces renderer timeout budget", async () => {
  const share = await resolvePublishedShareImageMetadata({
    publicSlug: "mi-slug",
    publicUrl: "https://reservaeldia.com.ar/i/mi-slug",
    baseHtml: "<html><body></body></html>",
    title: "Titulo",
    description: "Descripcion",
    generatedAt: "generated-at",
    shareImageEnabled: true,
    renderTimeoutMs: 5,
    defaultShareImageUrl: "https://reservaeldia.com.ar/assets/img/default-share.jpg",
    async generateShareImage() {
      return new Promise(() => undefined);
    },
    async saveGeneratedShareImage() {
      throw new Error("save should not run after timeout");
    },
    async confirmGeneratedShareImage() {
      return true;
    },
    async validatePublicImageUrl(input) {
      return input.source === "static-default";
    },
  });

  assert.equal(share.status, "fallback");
  assert.equal(share.source, "static-default");
  assert.equal(share.fallbackReason, "renderer-timeout");
});

test("resolveRequiredGeneratedPublishedShareImageMetadata rejects renderer timeout instead of fallback", async () => {
  await assert.rejects(
    () =>
      resolveRequiredGeneratedPublishedShareImageMetadata({
        publicSlug: "mi-slug",
        publicUrl: "https://reservaeldia.com.ar/i/mi-slug",
        baseHtml: "<html><body></body></html>",
        generatedAt: "generated-at",
        shareImageEnabled: true,
        renderTimeoutMs: 5,
        async generateShareImage() {
          return new Promise(() => undefined);
        },
        async saveGeneratedShareImage() {
          throw new Error("save should not run after timeout");
        },
        async confirmGeneratedShareImage() {
          return true;
        },
      }),
    /renderer-timeout/
  );
});

test("resolvePublishedShareImageMetadata changes fallback version per publish attempt", async () => {
  const baseInput = {
    publicSlug: "mi-slug",
    publicUrl: "https://reservaeldia.com.ar/i/mi-slug",
    baseHtml: "<html><body></body></html>",
    title: "Titulo",
    description: "Descripcion",
    shareImageEnabled: false,
    defaultShareImageUrl: "https://reservaeldia.com.ar/assets/img/default-share.jpg",
    async validatePublicImageUrl(input) {
      return input.source === "static-default";
    },
  };
  const first = await resolvePublishedShareImageMetadata({
    ...baseInput,
    generatedAt: "generated-at-1",
  });
  const second = await resolvePublishedShareImageMetadata({
    ...baseInput,
    generatedAt: "generated-at-2",
  });

  assert.equal(first.source, "static-default");
  assert.equal(second.source, "static-default");
  assert.notEqual(first.version, second.version);
  assert.notEqual(first.imageUrl, second.imageUrl);
});

test("share renderer CSS motion helper includes finite entrance animation and transition durations", () => {
  assert.deepEqual(parseCssTimeListForShareRenderer("640ms, 0.2s"), [640, 200]);
  assert.equal(
    resolveFiniteCssMotionWaitMsForShareRenderer({
      className: "objeto mefx-reveal-init mefx-reveal-on",
      dataMotion: "reveal",
      transitionDuration: "640ms, 120ms",
      transitionDelay: "90ms, 0ms",
      animationName: "none",
    }),
    730
  );
  assert.equal(
    resolveFiniteCssMotionWaitMsForShareRenderer({
      className: "countdown-v2 cdv2-entry-scale",
      animationName: "cdv2EntryScale",
      animationDuration: "420ms",
      animationDelay: "80ms",
      animationIterationCount: "1",
    }),
    500
  );
});

test("share renderer CSS motion helper ignores infinite decorative loops and absent animation", () => {
  assert.equal(
    resolveFiniteCssMotionWaitMsForShareRenderer({
      className: "objeto mefx-pulse",
      dataMotion: "pulse",
      animationName: "mefxPulse",
      animationDuration: "2.6s",
      animationIterationCount: "infinite",
    }),
    0
  );
  assert.equal(
    resolveFiniteCssMotionWaitMsForShareRenderer({
      className: "objeto",
      dataMotion: "none",
      transitionDuration: "230ms",
      transitionDelay: "0ms",
    }),
    0
  );
});

test("captureFirstSectionShareImage isolates .inv > .sec:first-child and captures a top-aligned 1200x630 JPEG viewport", async () => {
  const calls = {
    viewport: null,
    content: null,
    launchOptions: null,
    executablePathCalls: 0,
    waitForFunction: 0,
    evaluate: 0,
    evaluateSources: [],
    screenshot: null,
    closed: false,
  };
  const fakePage = {
    setDefaultTimeout() {},
    setDefaultNavigationTimeout() {},
    async setViewport(input) {
      calls.viewport = input;
    },
    async setContent(html) {
      calls.content = html;
    },
    async waitForFunction() {
      calls.waitForFunction += 1;
    },
    async evaluate(fn) {
      calls.evaluate += 1;
      calls.evaluateSources.push(String(fn));
      return calls.evaluate === 2
        ? { x: 0, y: 0, width: 1200, height: 630 }
        : undefined;
    },
    async screenshot(options) {
      calls.screenshot = options;
      return Buffer.from("final-jpeg");
    },
  };
  const fakeBrowser = {
    async newPage() {
      return fakePage;
    },
    async close() {
      calls.closed = true;
    },
  };
  const output = await captureFirstSectionShareImage(
    {
      html: '<html><body><div class="inv"><section class="sec">A</section><section class="sec">B</section></div></body></html>',
    },
    {
      loadBrowserRuntime: () => ({
        puppeteer: {
          async launch(options) {
            calls.launchOptions = options;
            return fakeBrowser;
          },
        },
        chromium: {
          args: ["--serverless-arg"],
          headless: "shell",
          async executablePath() {
            calls.executablePathCalls += 1;
            return "/tmp/chromium";
          },
        },
      }),
    }
  );

  assert.equal(output.toString(), "final-jpeg");
  assert.equal(calls.executablePathCalls, 1);
  assert.deepEqual(calls.launchOptions, {
    executablePath: "/tmp/chromium",
    args: ["--serverless-arg"],
    headless: "shell",
    defaultViewport: { width: 1200, height: 630, deviceScaleFactor: 1 },
    timeout: 7000,
  });
  assert.deepEqual(calls.viewport, { width: 1200, height: 630, deviceScaleFactor: 1 });
  assert.match(calls.content, /class="inv"/);
  assert.equal(calls.waitForFunction, 1);
  assert.equal(calls.evaluate, 4);
  assert.ok(
    calls.evaluateSources.some((source) =>
      source.includes('querySelector(".inv > .sec:first-child")')
    )
  );
  assert.ok(calls.evaluateSources.some((source) => source.includes("window.scrollTo(0, 0)")));
  assert.ok(calls.evaluateSources.some((source) => source.includes("getAnimations")));
  assert.ok(
    calls.evaluateSources.some((source) =>
      source.includes("waitForFirstSectionVisualSettled")
    )
  );
  assert.deepEqual(calls.screenshot, {
    type: "jpeg",
    quality: 85,
    fullPage: false,
    clip: { x: 0, y: 0, width: 1200, height: 630 },
    captureBeyondViewport: true,
  });
  assert.equal(calls.closed, true);
});

test("captureFirstSectionShareImage awaits first-section settle phase before screenshot", async () => {
  const calls = {
    evaluate: 0,
    order: [],
  };
  const fakePage = {
    setDefaultTimeout() {},
    setDefaultNavigationTimeout() {},
    async setViewport() {},
    async setContent() {},
    async waitForFunction() {},
    async evaluate(fn) {
      calls.evaluate += 1;
      const source = String(fn);
      if (calls.evaluate === 2) {
        return { x: 0, y: 0, width: 1200, height: 630 };
      }
      if (source.includes("waitForFirstSectionVisualSettled")) {
        calls.order.push("settle-start");
        await new Promise((resolve) => setTimeout(resolve, 20));
        calls.order.push("settle-end");
      }
      return undefined;
    },
    async screenshot() {
      calls.order.push("screenshot");
      return Buffer.from("settled-jpeg");
    },
  };
  const fakeBrowser = {
    async newPage() {
      return fakePage;
    },
    async close() {},
  };

  const output = await captureFirstSectionShareImage(
    {
      html: '<html><body><div class="inv"><section class="sec"><div class="objeto" data-motion="reveal">A</div></section></div></body></html>',
      effectSettleMaxMs: 80,
    },
    {
      loadBrowserRuntime: () => ({
        puppeteer: {
          async launch() {
            return fakeBrowser;
          },
        },
        chromium: {
          args: [],
          headless: "shell",
          async executablePath() {
            return "/tmp/chromium";
          },
        },
      }),
    }
  );

  assert.equal(output.toString(), "settled-jpeg");
  assert.deepEqual(calls.order, ["settle-start", "settle-end", "screenshot"]);
});

test("captureFirstSectionShareImage closes page and browser before renderer timeout fallback", async () => {
  const calls = {
    launchOptions: null,
    setContentStarted: false,
    pageClosed: false,
    browserClosed: false,
  };
  const fakePage = {
    setDefaultTimeout() {},
    setDefaultNavigationTimeout() {},
    async setViewport() {},
    async setContent() {
      calls.setContentStarted = true;
      return new Promise(() => undefined);
    },
    async close() {
      calls.pageClosed = true;
    },
  };
  const fakeBrowser = {
    async newPage() {
      return fakePage;
    },
    async close() {
      calls.browserClosed = true;
    },
  };

  await assert.rejects(
    () =>
      captureFirstSectionShareImage(
        {
          html: '<html><body><div class="inv"><section class="sec">A</section></div></body></html>',
          timeoutMs: 20,
        },
        {
          loadBrowserRuntime: () => ({
            puppeteer: {
              async launch(options) {
                calls.launchOptions = options;
                return fakeBrowser;
              },
            },
            chromium: {
              args: ["--serverless-arg"],
              headless: "shell",
              async executablePath() {
                return "/tmp/chromium";
              },
            },
          }),
        }
      ),
    /renderer-timeout/
  );

  assert.equal(calls.setContentStarted, true);
  assert.equal(calls.pageClosed, true);
  assert.equal(calls.browserClosed, true);
  assert.equal(calls.launchOptions.timeout, 20);
});

test("captureFirstSectionShareImage uses PUPPETEER_EXECUTABLE_PATH for local emulator override", async () => {
  const previousExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  const calls = {
    launchOptions: null,
    chromiumExecutablePathCalls: 0,
    evaluate: 0,
  };
  const fakePage = {
    setDefaultTimeout() {},
    setDefaultNavigationTimeout() {},
    async setViewport() {},
    async setContent() {},
    async waitForFunction() {},
    async evaluate() {
      calls.evaluate += 1;
      return calls.evaluate === 2
        ? { x: 0, y: 0, width: 1200, height: 630 }
        : undefined;
    },
    async screenshot() {
      return Buffer.from("local-jpeg");
    },
  };
  const fakeBrowser = {
    async newPage() {
      return fakePage;
    },
    async close() {},
  };

  try {
    process.env.PUPPETEER_EXECUTABLE_PATH = "/usr/bin/local-chrome";

    const output = await captureFirstSectionShareImage(
      {
        html: '<html><body><div class="inv"><section class="sec">A</section></div></body></html>',
      },
      {
        loadBrowserRuntime: () => ({
          puppeteer: {
            async launch(options) {
              calls.launchOptions = options;
              return fakeBrowser;
            },
          },
          chromium: {
            args: ["--serverless-arg"],
            headless: "shell",
            async executablePath() {
              calls.chromiumExecutablePathCalls += 1;
              return "/tmp/chromium";
            },
          },
        }),
      }
    );

    assert.equal(output.toString(), "local-jpeg");
    assert.equal(calls.chromiumExecutablePathCalls, 0);
    assert.equal(calls.launchOptions.executablePath, "/usr/bin/local-chrome");
  } finally {
    if (previousExecutablePath === undefined) {
      delete process.env.PUPPETEER_EXECUTABLE_PATH;
    } else {
      process.env.PUPPETEER_EXECUTABLE_PATH = previousExecutablePath;
    }
  }
});
