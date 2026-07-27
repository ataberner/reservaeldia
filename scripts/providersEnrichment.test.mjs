import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const analyzer = require("./providers/analyzeProviderJson.cjs");
const enrichment = require("./providers/enrichProviders.cjs");
const pageTools = require("./providers/providerEnrichmentPage.cjs");
const imageTools = require("./providers/providerEnrichmentImages.cjs");
const contract = analyzer.loadProviderContract();

const SOURCE_URL =
  "https://www.portalcasamientos.com.ar/foto-video/estudio-piloto-ab123/";
const NORMALIZED_SOURCE_URL =
  contract.normalizeOriginalProviderUrl(SOURCE_URL).normalized;
const PROVIDER_ID = contract.createProviderDocumentId(
  NORMALIZED_SOURCE_URL
);

const COMPLETE_HTML = `<!doctype html>
<html>
  <head>
    <meta property="og:description" content="Versión corta literal publicada por el proveedor para presentar su servicio." />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "ProfessionalService",
        "name": "Estudio Piloto",
        "description": "Descripción completa y literal del proveedor. Documentamos bodas con fotografía espontánea, video y una mirada editorial respetando cada momento de la celebración.",
        "image": [
          "https://cdn.example.test/portada.jpg",
          "https://cdn.example.test/galeria-1.jpg",
          "https://cdn.example.test/galeria-2.jpg"
        ]
      }
    </script>
  </head>
  <body><main><h1>Estudio Piloto</h1></main></body>
</html>`;

const NO_GALLERY_HTML = `<!doctype html>
<html>
  <head>
    <script type="application/ld+json">
      {
        "@type": "ProfessionalService",
        "description": "Descripción completa del proveedor sin galería adicional, conservada exactamente como aparece en su página original.",
        "image": "https://cdn.example.test/solo-portada.jpg"
      }
    </script>
  </head>
</html>`;

const NO_DESCRIPTION_HTML = `<!doctype html>
<html>
  <head>
    <meta property="og:image" content="https://cdn.example.test/portada.jpg" />
  </head>
  <body><main><h1>Estudio Piloto</h1></main></body>
</html>`;

const DESCRIPTION_ONLY_HTML = `<!doctype html>
<html>
  <head>
    <meta
      name="description"
      content="Descripción literal disponible sin imágenes asociadas."
    />
  </head>
  <body><main><h1>Estudio Piloto</h1></main></body>
</html>`;

const NO_ENRICHABLE_CONTENT_HTML = `<!doctype html>
<html>
  <head><title>Estudio Piloto</title></head>
  <body><main><h1>Estudio Piloto</h1></main></body>
</html>`;

function sourceEnvelope(record) {
  return contract.parseProviderSourceFile({
    version: 9,
    createdAt: "2026-07-26T18:17:40.871Z",
    reason: "enrichment-test",
    origin: "https://www.portalcasamientos.com.ar",
    providerUrls: [],
    results: [record],
  });
}

function providerDocument() {
  const record = {
    categoria: "foto-video",
    nombre: "Estudio Piloto",
    pagina: SOURCE_URL,
    sitio_web: "",
    telefono: "",
    email: "",
    direccion: "AR",
    calle: "",
    localidad: "",
    provincia: "",
    codigo_postal: "",
    pais: "AR",
    tipo_schema: "ProfessionalService",
    fuente_extraccion: "fixture",
  };
  return contract.mapPortalProviderRecord(record, {
    sourceFile: sourceEnvelope(record),
    sourceFileName: "fixture.json",
  }).document;
}

function args(overrides = {}) {
  return {
    apply: false,
    force: false,
    completeGallery: false,
    debugLocal: false,
    maxGalleryImages: 100,
    providerId: PROVIDER_ID,
    project: "demo-provider-enrichment",
    confirmProject: "demo-provider-enrichment",
    credentials: "fixture-credentials.json",
    report: "",
    ...overrides,
  };
}

function createFakeRuntime({
  provider = providerDocument(),
  providerExists = true,
  failUploadAt = 0,
  failCommit = false,
  existingStoragePaths = [],
} = {}) {
  const state = {
    provider,
    storage: new Map(
      existingStoragePaths.map((storagePath) => [
        storagePath,
        Buffer.from("existing"),
      ])
    ),
    uploadCalls: 0,
    commitCalls: 0,
    updateKeys: [],
  };
  const metrics = {
    remoteReads: 0,
    remoteWrites: 0,
  };
  return {
    state,
    runtime: {
      metrics,
      async readProvider() {
        metrics.remoteReads += 1;
        return {
          exists: providerExists,
          data: providerExists ? state.provider : null,
        };
      },
      async checkStorageAccess() {
        metrics.remoteReads += 1;
        return true;
      },
      async objectExists(storagePath) {
        metrics.remoteReads += 1;
        return state.storage.has(storagePath);
      },
      async uploadObject(upload) {
        state.uploadCalls += 1;
        if (
          failUploadAt > 0 &&
          state.uploadCalls === failUploadAt
        ) {
          const error = new Error("Storage upload fixture failure");
          error.code = "storage_upload_failed";
          throw error;
        }
        assert.equal(state.storage.has(upload.storagePath), false);
        state.storage.set(upload.storagePath, upload.buffer);
        metrics.remoteWrites += 1;
      },
      async deleteObject(storagePath) {
        state.storage.delete(storagePath);
        metrics.remoteWrites += 1;
      },
      async commitProviderUpdate({
        expectedFingerprint,
        update,
      }) {
        state.commitCalls += 1;
        assert.equal(
          enrichment.providerEnrichmentFingerprint(state.provider),
          expectedFingerprint
        );
        if (failCommit) {
          const error = new Error("Firestore commit fixture failure");
          error.code = "firestore_commit_failed";
          throw error;
        }
        state.updateKeys = Object.keys(update).sort();
        state.provider = {
          ...state.provider,
          ...update,
        };
        contract.assertValidProveedor(state.provider);
        metrics.remoteWrites += 1;
      },
    },
  };
}

function fixturePageFetcher(html = COMPLETE_HTML) {
  return async ({ url }) => ({
    html,
    finalUrl: url,
    bytes: Buffer.byteLength(html),
    status: 200,
  });
}

async function fixtureImageDownloader({
  candidate,
  index,
  temporaryDirectory,
}) {
  const buffer = Buffer.from(`fixture-image:${candidate.url}`);
  const hashSha256 = crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
  const temporaryPath = path.join(
    temporaryDirectory,
    `${index}-${hashSha256.slice(0, 8)}.jpg`
  );
  fs.writeFileSync(temporaryPath, buffer);
  return {
    ...candidate,
    finalUrl: candidate.url,
    buffer,
    temporaryPath,
    hashSha256,
    mimeType: "image/jpeg",
    extension: "jpg",
    width: 1200,
    height: 800,
    bytes: buffer.length,
  };
}

function deterministicNow() {
  return new Date("2026-07-27T18:00:00.000Z");
}

function structuredGalleryHtml(
  count,
  {
    declaredCount = count,
    useEmbeddedJson = true,
    lazy = false,
    srcset = false,
  } = {}
) {
  const items = Array.from({ length: count }, (_, index) => ({
    url: `https://cdn.example.test/gallery/photo-${String(index + 1).padStart(2, "0")}-1200x800.jpg`,
    lightbox_url: `https://cdn.example.test/gallery/photo-${String(index + 1).padStart(2, "0")}-1200x800.jpg`,
    lightbox_url_md: `https://cdn.example.test/gallery/photo-${String(index + 1).padStart(2, "0")}-800x533.jpg`,
  }));
  const htmlItems = items
    .map((item, index) => {
      const imageAttributes = lazy
        ? `src="data:image/svg+xml,placeholder" data-lazy="${item.lightbox_url}"`
        : srcset
          ? `src="${item.lightbox_url_md}" srcset="${item.lightbox_url_md} 800w, ${item.lightbox_url} 1200w"`
          : `src="${item.lightbox_url}"`;
      return `<a data-gallery-item data-index="${index}" href="${item.lightbox_url}">
        <img ${imageAttributes} alt="Foto ${index + 1}" />
      </a>`;
    })
    .join("\n");
  return `<!doctype html>
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@type": "ProfessionalService",
            "description": "Descripción literal suficientemente extensa para probar una galería completa y preservar el contrato del proveedor.",
            "image": "https://cdn.example.test/provider-cover.jpg"
          }
        </script>
      </head>
      <body>
        <main>
          <div class="provider-cover">
            <img src="https://cdn.example.test/provider-cover.jpg" alt="Portada" />
          </div>
          <section data-gallery-display>
            <button>Galería (${declaredCount})</button>
            ${htmlItems}
            ${
              useEmbeddedJson
                ? `<script type="application/json" data-gallery-all-images>${JSON.stringify(items)}</script>`
                : ""
            }
            <span data-lightbox-counter>1 / ${declaredCount}</span>
          </section>
        </main>
      </body>
    </html>`;
}

test("page analysis prioritizes JSON-LD and keeps literal source descriptions", () => {
  const extracted = pageTools.extractProviderPage(
    COMPLETE_HTML,
    NORMALIZED_SOURCE_URL
  );
  assert.equal(extracted.descriptionSource, "json_ld");
  assert.match(extracted.description, /^Descripción completa y literal/);
  assert.equal(
    extracted.shortDescription,
    "Versión corta literal publicada por el proveedor para presentar su servicio."
  );
  assert.equal(extracted.shortDescriptionSource, "open_graph");
  assert.equal(extracted.cover.url, "https://cdn.example.test/portada.jpg");
  assert.equal(extracted.gallery.length, 2);
  assert.equal(extracted.imageCandidatesFound, 3);
});

test("embedded JavaScript JSON assignments are parsed without evaluating code", () => {
  const embeddedDescription =
    "Descripción literal incluida en el estado embebido de la página del proveedor para presentar sus servicios de foto y video.";
  const html = `<!doctype html>
    <html>
      <head>
        <script>
          window.__PROVIDER__ = {
            "description": ${JSON.stringify(embeddedDescription)},
            "gallery": ["https://cdn.example.test/embedded-gallery.jpg"]
          };
        </script>
      </head>
    </html>`;
  const extracted = pageTools.extractProviderPage(
    html,
    NORMALIZED_SOURCE_URL
  );

  assert.equal(extracted.description, embeddedDescription);
  assert.equal(extracted.descriptionSource, "embedded_json");
  assert.equal(extracted.imageCandidatesFound, 1);
  assert.equal(
    extracted.cover.url,
    "https://cdn.example.test/embedded-gallery.jpg"
  );
});

test("complete HTML galleries support lazy attributes, srcset, and declared totals", () => {
  const lazy = pageTools.extractProviderPage(
    structuredGalleryHtml(4, {
      useEmbeddedJson: false,
      lazy: true,
    }),
    NORMALIZED_SOURCE_URL
  );
  const responsive = pageTools.extractProviderPage(
    structuredGalleryHtml(4, {
      useEmbeddedJson: false,
      srcset: true,
    }),
    NORMALIZED_SOURCE_URL
  );

  for (const extracted of [lazy, responsive]) {
    assert.equal(extracted.galleryExtractionSource, "gallery_html");
    assert.equal(extracted.galleryExpectedCount, 4);
    assert.equal(extracted.galleryDetectedCount, 4);
    assert.equal(extracted.gallery.length, 4);
    assert.equal(extracted.galleryCompleteEvidence, true);
  }
  assert.match(responsive.gallery[0].url, /1200x800/);
});

test("embedded gallery JSON preserves more than twenty images in source order", () => {
  const extracted = pageTools.extractProviderPage(
    structuredGalleryHtml(25),
    NORMALIZED_SOURCE_URL
  );

  assert.equal(
    extracted.galleryExtractionSource,
    "embedded_gallery_json"
  );
  assert.equal(extracted.galleryExpectedCount, 25);
  assert.equal(extracted.galleryDetectedCount, 25);
  assert.equal(extracted.gallery.length, 25);
  assert.equal(extracted.galleryCompleteEvidence, true);
  assert.match(extracted.gallery[0].declaredUrl, /photo-01/);
  assert.match(extracted.gallery[24].declaredUrl, /photo-25/);
});

test("thumbnail and original variants share one stable WordPress media identity", () => {
  const original =
    "https://media.portalcasamientos.com.ar/wp-content/uploads/2026/07/gallery-photo.jpg";
  const html = `<!doctype html><html><body>
    <section data-gallery-display>
      <span data-lightbox-counter>1 / 2</span>
      <a data-gallery-item href="${original}">
        <img src="${original.replace(".jpg", "-800x533.jpg")}" />
      </a>
      <a data-gallery-item href="${original}">
        <img data-src="${original.replace(".jpg", "-400x267.jpg")}" />
      </a>
    </section>
  </body></html>`;
  const extracted = pageTools.extractProviderPage(
    html,
    NORMALIZED_SOURCE_URL
  );

  assert.equal(extracted.galleryDetectedCount, 2);
  assert.equal(extracted.gallery.length, 1);
  assert.equal(extracted.gallerySourceDuplicateCount, 1);
  assert.equal(extracted.galleryCompleteEvidence, true);
  assert.equal(extracted.gallery[0].stableIdentity, original);
  assert.equal(extracted.gallery[0].downloadUrls[0], original);
});

test("a partial gallery is reported as incomplete and causes no remote writes", async () => {
  const fake = createFakeRuntime();
  const report = await enrichment.enrichSingleProvider({
    args: args(),
    runtime: fake.runtime,
    contract,
    pageFetcher: fixturePageFetcher(
      structuredGalleryHtml(3, {
        declaredCount: 5,
        useEmbeddedJson: false,
      })
    ),
    imageDownloader: fixtureImageDownloader,
    now: deterministicNow,
  });

  assert.equal(report.status, "failed");
  assert.equal(report.galleryExpectedCount, 5);
  assert.equal(report.galleryDetectedCount, 3);
  assert.equal(report.galleryValidCount, 3);
  assert.equal(report.galleryComplete, false);
  assert.equal(report.errors.at(-1).code, "gallery_incomplete");
  assert.equal(report.remoteWrites, 0);
  assert.equal(fake.state.uploadCalls, 0);
  assert.equal(fake.state.commitCalls, 0);
});

async function createPartiallyEnrichedRuntime() {
  const fake = createFakeRuntime();
  const initial = await enrichment.enrichSingleProvider({
    args: args({ apply: true }),
    runtime: fake.runtime,
    contract,
    pageFetcher: fixturePageFetcher(structuredGalleryHtml(3)),
    imageDownloader: fixtureImageDownloader,
    now: deterministicNow,
  });
  assert.equal(initial.status, "completed");
  assert.equal(fake.state.provider.imagenes.galeria.length, 3);
  return fake;
}

test("partial enrichment reuses existing images and plans only missing gallery files", async () => {
  const seeded = await createPartiallyEnrichedRuntime();
  const fake = createFakeRuntime({
    provider: seeded.state.provider,
    existingStoragePaths: [
      seeded.state.provider.imagenes.portada.storagePath,
      ...seeded.state.provider.imagenes.galeria.map(
        (image) => image.storagePath
      ),
    ],
  });
  const report = await enrichment.enrichSingleProvider({
    args: args({ completeGallery: true }),
    runtime: fake.runtime,
    contract,
    pageFetcher: fixturePageFetcher(structuredGalleryHtml(25)),
    imageDownloader: fixtureImageDownloader,
    now: deterministicNow,
  });

  assert.equal(report.status, "dry_run_ready");
  assert.equal(report.galleryExpectedCount, 25);
  assert.equal(report.galleryDetectedCount, 25);
  assert.equal(report.galleryExistingCount, 3);
  assert.equal(report.galleryValidCount, 25);
  assert.equal(report.galleryAddedCount, 22);
  assert.equal(report.galleryUploadedCount, 0);
  assert.equal(report.galleryComplete, true);
  assert.equal(fake.state.uploadCalls, 0);
  assert.equal(report.remoteWrites, 0);
});

test("partial enrichment applies in order without duplicates and is idempotent", async () => {
  const fake = await createPartiallyEnrichedRuntime();
  const first = await enrichment.enrichSingleProvider({
    args: args({ apply: true, completeGallery: true }),
    runtime: fake.runtime,
    contract,
    pageFetcher: fixturePageFetcher(structuredGalleryHtml(25)),
    imageDownloader: fixtureImageDownloader,
    now: deterministicNow,
  });

  assert.equal(first.status, "completed");
  assert.equal(first.galleryAddedCount, 22);
  assert.equal(first.galleryUploadedCount, 22);
  assert.equal(fake.state.provider.imagenes.galeria.length, 25);
  assert.deepEqual(fake.state.updateKeys, [
    "actualizadoEn",
    "imagenes",
    "importacion",
  ]);
  assert.deepEqual(
    fake.state.provider.imagenes.galeria.map((image) => image.orden),
    Array.from({ length: 25 }, (_, index) => index)
  );
  assert.equal(
    new Set(
      fake.state.provider.imagenes.galeria.map(
        (image) => image.storagePath
      )
    ).size,
    25
  );

  const uploadsAfterFirst = fake.state.uploadCalls;
  const commitsAfterFirst = fake.state.commitCalls;
  const second = await enrichment.enrichSingleProvider({
    args: args({ apply: true, completeGallery: true }),
    runtime: fake.runtime,
    contract,
    pageFetcher: fixturePageFetcher(structuredGalleryHtml(25)),
    imageDownloader: fixtureImageDownloader,
    now: deterministicNow,
  });

  assert.equal(second.status, "skipped_gallery_already_complete");
  assert.equal(second.galleryAddedCount, 0);
  assert.equal(fake.state.uploadCalls, uploadsAfterFirst);
  assert.equal(fake.state.commitCalls, commitsAfterFirst);
});

test("partial gallery completion rolls back new files when Firestore update fails", async () => {
  const seeded = await createPartiallyEnrichedRuntime();
  const existingPaths = [
    seeded.state.provider.imagenes.portada.storagePath,
    ...seeded.state.provider.imagenes.galeria.map(
      (image) => image.storagePath
    ),
  ];
  const fake = createFakeRuntime({
    provider: seeded.state.provider,
    failCommit: true,
    existingStoragePaths: existingPaths,
  });
  const report = await enrichment.enrichSingleProvider({
    args: args({ apply: true, completeGallery: true }),
    runtime: fake.runtime,
    contract,
    pageFetcher: fixturePageFetcher(structuredGalleryHtml(25)),
    imageDownloader: fixtureImageDownloader,
    now: deterministicNow,
  });

  assert.equal(report.status, "failed");
  assert.equal(report.rollback.attempted, true);
  assert.equal(report.galleryUploadedCount, 0);
  assert.equal(fake.state.storage.size, existingPaths.length);
  assert.equal(fake.state.provider.imagenes.galeria.length, 3);
});

test("correct provider completes a remote-read dry-run without writes", async () => {
  const fake = createFakeRuntime();
  const report = await enrichment.enrichSingleProvider({
    args: args(),
    runtime: fake.runtime,
    contract,
    pageFetcher: fixturePageFetcher(),
    imageDownloader: fixtureImageDownloader,
    now: deterministicNow,
  });

  assert.equal(report.status, "dry_run_ready");
  assert.equal(report.preflight.completed, true);
  assert.equal(report.description.found, true);
  assert.equal(report.images.candidatesFound, 3);
  assert.equal(report.images.validated, 3);
  assert.equal(report.images.uploaded, 0);
  assert.equal(report.firestore.updated, false);
  assert.equal(report.remoteWrites, 0);
  assert.equal(report.temporaryFilesRemoved, true);
  assert.equal(fake.state.storage.size, 0);
  assert.equal(fake.state.commitCalls, 0);
});

test("missing provider fails before page or Storage processing", async () => {
  const fake = createFakeRuntime({ providerExists: false });
  let pageCalls = 0;
  const report = await enrichment.enrichSingleProvider({
    args: args(),
    runtime: fake.runtime,
    contract,
    pageFetcher: async () => {
      pageCalls += 1;
      throw new Error("must not run");
    },
    imageDownloader: fixtureImageDownloader,
  });

  assert.equal(report.status, "failed");
  assert.equal(report.errors[0].code, "provider_not_found");
  assert.equal(pageCalls, 0);
  assert.equal(report.remoteWrites, 0);
});

test("HTTP 404 fails without uploads or Firestore writes", async () => {
  const fake = createFakeRuntime();
  const report = await enrichment.enrichSingleProvider({
    args: args(),
    runtime: fake.runtime,
    contract,
    pageFetcher: async () => {
      throw new imageTools.ProviderEnrichmentError(
        "page_not_found",
        "El recurso remoto respondió HTTP 404."
      );
    },
    imageDownloader: fixtureImageDownloader,
  });

  assert.equal(report.status, "failed");
  assert.equal(report.errors[0].stage, "page_download");
  assert.equal(report.errors[0].code, "page_not_found");
  assert.equal(report.remoteWrites, 0);
  assert.equal(fake.state.storage.size, 0);
});

test("page without description succeeds and keeps the field absent", async () => {
  const fake = createFakeRuntime();
  let imageDownloads = 0;
  const report = await enrichment.enrichSingleProvider({
    args: args(),
    runtime: fake.runtime,
    contract,
    pageFetcher: fixturePageFetcher(NO_DESCRIPTION_HTML),
    imageDownloader: async (options) => {
      imageDownloads += 1;
      return fixtureImageDownloader(options);
    },
  });

  assert.equal(report.status, "dry_run_ready");
  assert.equal(report.descriptionFound, false);
  assert.equal(report.coverFound, true);
  assert.equal(report.error, null);
  assert.equal(imageDownloads, 1);
  assert.equal(report.remoteWrites, 0);
});

test("page with only description is ready without requiring a cover", async () => {
  const fake = createFakeRuntime();
  let imageDownloads = 0;
  const report = await enrichment.enrichSingleProvider({
    args: args(),
    runtime: fake.runtime,
    contract,
    pageFetcher: fixturePageFetcher(DESCRIPTION_ONLY_HTML),
    imageDownloader: async (options) => {
      imageDownloads += 1;
      return fixtureImageDownloader(options);
    },
  });

  assert.deepEqual(
    {
      status: report.status,
      descriptionFound: report.descriptionFound,
      coverFound: report.coverFound,
      galleryExpected: report.galleryExpected,
      galleryDetected: report.galleryDetected,
      galleryComplete: report.galleryComplete,
      error: report.error,
    },
    {
      status: "dry_run_ready",
      descriptionFound: true,
      coverFound: false,
      galleryExpected: 0,
      galleryDetected: 0,
      galleryComplete: true,
      error: null,
    }
  );
  assert.equal(imageDownloads, 0);
  assert.equal(report.remoteWrites, 0);
});

test("page without enrichable content is confirmed without empty writes", async () => {
  const fake = createFakeRuntime();
  let imageDownloads = 0;
  const report = await enrichment.enrichSingleProvider({
    args: args({ apply: true }),
    runtime: fake.runtime,
    contract,
    pageFetcher: fixturePageFetcher(NO_ENRICHABLE_CONTENT_HTML),
    imageDownloader: async (options) => {
      imageDownloads += 1;
      return fixtureImageDownloader(options);
    },
    now: deterministicNow,
  });

  assert.equal(report.status, "completed");
  assert.equal(report.descriptionFound, false);
  assert.equal(report.coverFound, false);
  assert.equal(report.galleryExpected, 0);
  assert.equal(report.galleryDetected, 0);
  assert.equal(report.galleryComplete, true);
  assert.equal(report.error, null);
  assert.equal(imageDownloads, 0);
  assert.deepEqual(fake.state.updateKeys, [
    "actualizadoEn",
    "importacion",
  ]);
  assert.equal(fake.state.provider.descripcion, "");
  assert.equal(fake.state.provider.imagenes.portada, null);
  assert.deepEqual(fake.state.provider.imagenes.galeria, []);
  assert.equal(
    fake.state.provider.importacion.descripcionEncontrada,
    false
  );
  assert.equal(
    fake.state.provider.importacion.portadaEncontrada,
    false
  );
  assert.equal(
    fake.state.provider.importacion.galeriaEncontrada,
    false
  );
  assert.equal(
    fake.state.provider.importacion.descripcionImportada,
    false
  );
  assert.equal(
    fake.state.provider.importacion.portadaImportada,
    false
  );
  assert.equal(
    fake.state.provider.importacion.galeriaImportada,
    true
  );
  assert.equal(
    fake.state.provider.importacion.completadaEn.getTime(),
    deterministicNow().getTime()
  );
  assert.equal(fake.state.commitCalls, 1);
});

test("page without gallery persists an empty completed gallery", async () => {
  const fake = createFakeRuntime();
  const report = await enrichment.enrichSingleProvider({
    args: args({ apply: true }),
    runtime: fake.runtime,
    contract,
    pageFetcher: fixturePageFetcher(NO_GALLERY_HTML),
    imageDownloader: fixtureImageDownloader,
    now: deterministicNow,
  });

  assert.equal(report.status, "completed");
  assert.equal(report.images.candidatesFound, 1);
  assert.equal(report.images.uploaded, 1);
  assert.equal(fake.state.provider.imagenes.galeria.length, 0);
  assert.equal(
    fake.state.provider.importacion.galeriaImportada,
    true
  );
  assert.equal(
    fake.state.provider.importacion.galeriaEncontrada,
    false
  );
  assert.equal(
    fake.state.provider.importacion.cantidadImagenes,
    1
  );
});

test("successful apply uploads images and updates only enrichment fields", async () => {
  const fake = createFakeRuntime();
  const report = await enrichment.enrichSingleProvider({
    args: args({ apply: true }),
    runtime: fake.runtime,
    contract,
    pageFetcher: fixturePageFetcher(),
    imageDownloader: fixtureImageDownloader,
    now: deterministicNow,
  });

  assert.equal(report.status, "completed");
  assert.equal(report.images.uploaded, 3);
  assert.equal(report.images.storagePathsUploaded.length, 3);
  assert.equal(report.firestore.updated, true);
  assert.deepEqual(fake.state.updateKeys, [
    "actualizadoEn",
    "descripcion",
    "descripcionCorta",
    "imagenes",
    "importacion",
  ]);
  assert.equal(fake.state.provider.visible, false);
  assert.equal(fake.state.provider.nombre, "Estudio Piloto");
  assert.equal(
    fake.state.provider.descripcionCorta,
    "Versión corta literal publicada por el proveedor para presentar su servicio."
  );
  assert.equal(
    fake.state.provider.imagenes.portada.url,
    null
  );
  assert.ok(
    fake.state.provider.imagenes.portada.storagePath.startsWith(
      `proveedores/${PROVIDER_ID}/portada/`
    )
  );
});

test("--complete-gallery also enriches a provider that does not yet have description or cover", async () => {
  const { runtime, state } = createFakeRuntime();
  const report = await enrichment.enrichSingleProvider({
    args: args({
      apply: true,
      completeGallery: true,
    }),
    runtime,
    contract,
    pageFetcher: fixturePageFetcher(
      structuredGalleryHtml(2)
    ),
    imageDownloader: fixtureImageDownloader,
    now: deterministicNow,
  });

  assert.equal(report.status, "completed");
  assert.equal(state.provider.descripcion.length > 0, true);
  assert.ok(state.provider.imagenes.portada.storagePath);
  assert.equal(state.provider.imagenes.galeria.length, 2);
  assert.equal(
    state.provider.importacion.descripcionImportada,
    true
  );
  assert.equal(
    state.provider.importacion.portadaImportada,
    true
  );
  assert.equal(
    state.provider.importacion.galeriaImportada,
    true
  );
});

test("Storage failure rolls back every object created by the run", async () => {
  const original = providerDocument();
  const fake = createFakeRuntime({
    provider: original,
    failUploadAt: 2,
  });
  const report = await enrichment.enrichSingleProvider({
    args: args({ apply: true }),
    runtime: fake.runtime,
    contract,
    pageFetcher: fixturePageFetcher(),
    imageDownloader: fixtureImageDownloader,
  });

  assert.equal(report.status, "failed");
  assert.equal(report.errors[0].code, "storage_upload_failed");
  assert.equal(report.rollback.attempted, true);
  assert.equal(report.rollback.deletedPaths.length, 1);
  assert.equal(report.rollback.failedPaths.length, 0);
  assert.equal(report.images.uploaded, 0);
  assert.equal(fake.state.storage.size, 0);
  assert.equal(fake.state.commitCalls, 0);
  assert.equal(
    enrichment.providerEnrichmentFingerprint(fake.state.provider),
    enrichment.providerEnrichmentFingerprint(original)
  );
});

test("Firestore failure rolls back uploaded Storage objects", async () => {
  const fake = createFakeRuntime({ failCommit: true });
  const report = await enrichment.enrichSingleProvider({
    args: args({ apply: true }),
    runtime: fake.runtime,
    contract,
    pageFetcher: fixturePageFetcher(NO_GALLERY_HTML),
    imageDownloader: fixtureImageDownloader,
  });

  assert.equal(report.status, "failed");
  assert.equal(report.errors[0].code, "firestore_commit_failed");
  assert.equal(report.rollback.deletedPaths.length, 1);
  assert.equal(report.images.uploaded, 0);
  assert.equal(fake.state.storage.size, 0);
});

test("complete provider is idempotently skipped unless force is explicit", async () => {
  const complete = providerDocument();
  const importedAt = deterministicNow();
  complete.descripcion = "Descripción existente que no debe sobrescribirse.";
  complete.descripcionCorta = complete.descripcion;
  complete.imagenes.portada = {
    id: "portada_existente",
    tipo: "portada",
    storagePath: contract.buildProviderCoverStoragePath(
      PROVIDER_ID,
      "jpg"
    ),
    url: null,
    urlOriginal: "https://cdn.example.test/existing.jpg",
    alt: "Estudio Piloto",
    orden: 0,
    ancho: 1200,
    alto: 800,
    mimeType: "image/jpeg",
    formato: "jpg",
    tamanioBytes: 1234,
    importadaEn: importedAt,
  };
  complete.importacion = {
    ...complete.importacion,
    descripcionImportada: true,
    portadaImportada: true,
    galeriaImportada: true,
    cantidadImagenes: 1,
    ultimoIntentoEn: importedAt,
    completadaEn: importedAt,
  };
  contract.assertValidProveedor(complete);
  const fake = createFakeRuntime({
    provider: complete,
    existingStoragePaths: [complete.imagenes.portada.storagePath],
  });
  let pageCalls = 0;
  const report = await enrichment.enrichSingleProvider({
    args: args({ apply: true }),
    runtime: fake.runtime,
    contract,
    pageFetcher: async () => {
      pageCalls += 1;
      return fixturePageFetcher()({
        url: NORMALIZED_SOURCE_URL,
      });
    },
    imageDownloader: fixtureImageDownloader,
  });

  assert.equal(report.status, "skipped_already_complete");
  assert.equal(report.idempotency.skippedCompleteProvider, true);
  assert.equal(pageCalls, 0);
  assert.equal(fake.state.commitCalls, 0);
  assert.equal(report.remoteWrites, 0);
});

test("--force reanalyzes a complete provider without overwriting description or images", async () => {
  const complete = providerDocument();
  const importedAt = deterministicNow();
  complete.descripcion =
    "Descripción existente que debe permanecer exactamente igual.";
  complete.descripcionCorta = complete.descripcion;
  complete.imagenes.portada = {
    id: "portada_existente",
    tipo: "portada",
    storagePath: contract.buildProviderCoverStoragePath(
      PROVIDER_ID,
      "jpg"
    ),
    url: null,
    urlOriginal: "https://cdn.example.test/existing.jpg",
    alt: "Estudio Piloto",
    orden: 0,
    ancho: 1200,
    alto: 800,
    mimeType: "image/jpeg",
    formato: "jpg",
    tamanioBytes: 1234,
    importadaEn: importedAt,
  };
  complete.importacion = {
    ...complete.importacion,
    descripcionImportada: true,
    portadaImportada: true,
    galeriaImportada: true,
    cantidadImagenes: 1,
    ultimoIntentoEn: importedAt,
    completadaEn: importedAt,
  };
  const originalDescription = complete.descripcion;
  const originalCoverPath = complete.imagenes.portada.storagePath;
  const fake = createFakeRuntime({
    provider: complete,
    existingStoragePaths: [complete.imagenes.portada.storagePath],
  });
  let imageDownloads = 0;
  const report = await enrichment.enrichSingleProvider({
    args: args({ apply: true, force: true }),
    runtime: fake.runtime,
    contract,
    pageFetcher: fixturePageFetcher(),
    imageDownloader: async (options) => {
      imageDownloads += 1;
      return fixtureImageDownloader(options);
    },
    now: deterministicNow,
  });

  assert.equal(report.status, "completed");
  assert.equal(imageDownloads, 0);
  assert.equal(report.images.uploaded, 0);
  assert.equal(fake.state.provider.descripcion, originalDescription);
  assert.equal(
    fake.state.provider.imagenes.portada.storagePath,
    originalCoverPath
  );
});

test("--force preserves existing content when the source has no enrichment data", async () => {
  const seeded = createFakeRuntime();
  const first = await enrichment.enrichSingleProvider({
    args: args({ apply: true }),
    runtime: seeded.runtime,
    contract,
    pageFetcher: fixturePageFetcher(),
    imageDownloader: fixtureImageDownloader,
    now: deterministicNow,
  });
  assert.equal(first.status, "completed");

  const existingDescription = seeded.state.provider.descripcion;
  const existingShortDescription =
    seeded.state.provider.descripcionCorta;
  const existingImages = structuredClone(
    seeded.state.provider.imagenes
  );
  const existingPaths = [
    existingImages.portada.storagePath,
    ...existingImages.galeria.map(
      (image) => image.storagePath
    ),
  ];
  const fake = createFakeRuntime({
    provider: seeded.state.provider,
    existingStoragePaths: existingPaths,
  });
  const report = await enrichment.enrichSingleProvider({
    args: args({ apply: true, force: true }),
    runtime: fake.runtime,
    contract,
    pageFetcher: fixturePageFetcher(
      NO_ENRICHABLE_CONTENT_HTML
    ),
    imageDownloader: fixtureImageDownloader,
    now: deterministicNow,
  });

  assert.equal(report.status, "completed");
  assert.deepEqual(fake.state.updateKeys, [
    "actualizadoEn",
    "importacion",
  ]);
  assert.equal(
    fake.state.provider.descripcion,
    existingDescription
  );
  assert.equal(
    fake.state.provider.descripcionCorta,
    existingShortDescription
  );
  assert.deepEqual(
    fake.state.provider.imagenes,
    existingImages
  );
  assert.equal(
    fake.state.provider.importacion.descripcionEncontrada,
    false
  );
  assert.equal(
    fake.state.provider.importacion.portadaEncontrada,
    false
  );
  assert.equal(
    fake.state.provider.importacion.galeriaEncontrada,
    false
  );
  assert.equal(
    fake.state.provider.importacion.descripcionImportada,
    true
  );
  assert.equal(
    fake.state.provider.importacion.portadaImportada,
    true
  );
  assert.equal(
    fake.state.provider.importacion.galeriaImportada,
    true
  );
});

test("byte-identical gallery images are deduplicated before Storage", async () => {
  const duplicateHtml = COMPLETE_HTML.replace(
    '"https://cdn.example.test/galeria-2.jpg"',
    '"https://cdn.example.test/galeria-duplicada.jpg"'
  );
  const fake = createFakeRuntime();
  const report = await enrichment.enrichSingleProvider({
    args: args({ apply: true }),
    runtime: fake.runtime,
    contract,
    pageFetcher: fixturePageFetcher(duplicateHtml),
    imageDownloader: async (options) => {
      const downloaded = await fixtureImageDownloader(options);
      if (options.candidate.targetType === "galeria") {
        const buffer = Buffer.from("same-gallery-bytes");
        downloaded.buffer = buffer;
        downloaded.bytes = buffer.length;
        downloaded.hashSha256 = crypto
          .createHash("sha256")
          .update(buffer)
          .digest("hex");
      }
      return downloaded;
    },
  });

  assert.equal(report.status, "completed");
  assert.equal(report.images.duplicatesDiscarded, 1);
  assert.equal(report.images.uploaded, 2);
  assert.equal(fake.state.provider.imagenes.galeria.length, 1);
});

test("an existing target Storage object blocks apply before any upload", async () => {
  const expectedCoverPath =
    contract.buildProviderCoverStoragePath(PROVIDER_ID, "jpg");
  const fake = createFakeRuntime({
    existingStoragePaths: [expectedCoverPath],
  });
  const report = await enrichment.enrichSingleProvider({
    args: args({ apply: true }),
    runtime: fake.runtime,
    contract,
    pageFetcher: fixturePageFetcher(NO_GALLERY_HTML),
    imageDownloader: fixtureImageDownloader,
  });

  assert.equal(report.status, "failed");
  assert.equal(report.errors[0].code, "storage_path_conflict");
  assert.equal(fake.state.uploadCalls, 0);
  assert.equal(fake.state.commitCalls, 0);
  assert.equal(report.remoteWrites, 0);
});

test("durable mode reuses only an exact Storage execution/hash/path match", () => {
  const downloaded = {
    finalUrl: "https://cdn.example.test/gallery.jpg",
    alt: "Gallery",
    hashSha256: "a".repeat(64),
    extension: "jpg",
    width: 1200,
    height: 800,
    mimeType: "image/jpeg",
    bytes: 123,
    buffer: Buffer.from("fixture"),
  };
  const plan = enrichment.createImageDocument({
    providerId: PROVIDER_ID,
    type: "galeria",
    downloaded,
    order: 0,
    providerName: "Estudio Piloto",
    importedAt: deterministicNow(),
    contract,
    executionId: "execution-1",
  });
  const objectInfo = {
    exists: true,
    metadata: {
      size: 123,
      custom: {
        providerId: PROVIDER_ID,
        imageId: plan.document.id,
        executionId: "execution-1",
        hashSha256: "a".repeat(64),
      },
    },
  };
  assert.deepEqual(
    enrichment.resumableUploadRecord(
      plan,
      objectInfo,
      {
        executionId: "execution-1",
        resumeUploads: [],
      }
    ),
    {
      storagePath: plan.document.storagePath,
      imageId: plan.document.id,
      hashSha256: "a".repeat(64),
      bytes: 123,
      executionId: "execution-1",
    }
  );
  assert.equal(
    enrichment.resumableUploadRecord(
      plan,
      {
        ...objectInfo,
        metadata: {
          ...objectInfo.metadata,
          custom: {
            ...objectInfo.metadata.custom,
            hashSha256: "b".repeat(64),
          },
        },
      },
      {
        executionId: "execution-1",
        resumeUploads: [],
      }
    ),
    null
  );
});

test("temporary image files are removed after the pipeline finishes", async () => {
  const fake = createFakeRuntime();
  const parent = fs.mkdtempSync(
    path.join(os.tmpdir(), "provider-enrichment-test-")
  );
  const temporaryDirectory = path.join(parent, "images");
  fs.mkdirSync(temporaryDirectory);
  try {
    const report = await enrichment.enrichSingleProvider({
      args: args(),
      runtime: fake.runtime,
      contract,
      pageFetcher: fixturePageFetcher(NO_GALLERY_HTML),
      imageDownloader: fixtureImageDownloader,
      temporaryDirectoryFactory: () => temporaryDirectory,
      now: deterministicNow,
    });
    assert.equal(report.status, "dry_run_ready");
    assert.equal(report.temporaryFilesRemoved, true);
    assert.equal(fs.existsSync(temporaryDirectory), false);
  } finally {
    fs.rmSync(parent, {
      recursive: true,
      force: true,
    });
  }
});

test("provider and image path validation rejects traversal", () => {
  assert.doesNotThrow(() =>
    enrichment.validateArgs(args(), contract)
  );
  assert.throws(
    () =>
      enrichment.validateArgs(
        args({ providerId: "../provider" }),
        contract
      ),
    /--provider-id/
  );
  assert.throws(() =>
    contract.buildProviderGalleryStoragePath(
      PROVIDER_ID,
      "../image",
      "jpg"
    )
  );
});

test("mass apply requires durable state while one-provider apply may omit it", () => {
  const massArgs = enrichment.parseArgs([
    "--apply",
    "--project=demo-provider-enrichment",
    "--confirm-project=demo-provider-enrichment",
    "--credentials=fixture.json",
  ]);
  assert.throws(
    () => enrichment.validateArgs(massArgs, contract),
    /--resume-state es obligatorio/
  );
  const singleArgs = enrichment.parseArgs([
    "--apply",
    `--provider-id=${PROVIDER_ID}`,
    "--project=demo-provider-enrichment",
    "--confirm-project=demo-provider-enrichment",
    "--credentials=fixture.json",
  ]);
  assert.doesNotThrow(() =>
    enrichment.validateArgs(singleArgs, contract)
  );
  const dryRunWithApplyState = enrichment.parseArgs([
    "--dry-run",
    "--project=demo-provider-enrichment",
    "--confirm-project=demo-provider-enrichment",
    "--credentials=fixture.json",
    "--resume-state=apply-state.json",
  ]);
  assert.throws(
    () =>
      enrichment.validateArgs(
        dryRunWithApplyState,
        contract
      ),
    /--dry-run-state/
  );
});

test("image downloader validates MIME, dimensions, and a temporary file", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const temporaryDirectory = imageTools.createTemporaryDirectory();
  try {
    const downloaded = await imageTools.downloadAndValidateImage({
      candidate: {
        url: "https://cdn.example.test/image.png",
        alt: "Imagen",
      },
      index: 0,
      temporaryDirectory,
      maximumBytes: contract.PROVIDER_IMAGE_MAX_BYTES,
      allowedMimeTypes: [
        ...contract.PROVIDER_IMAGE_MIME_TYPES,
      ],
      fetchImpl: async () =>
        new Response(png, {
          status: 200,
          headers: {
            "content-type": "image/png",
            "content-length": String(png.length),
          },
        }),
      dnsLookup: async () => [
        { address: "93.184.216.34", family: 4 },
      ],
    });
    assert.equal(downloaded.mimeType, "image/png");
    assert.equal(downloaded.width, 1);
    assert.equal(downloaded.height, 1);
    assert.equal(fs.existsSync(downloaded.temporaryPath), true);
  } finally {
    imageTools.removeTemporaryDirectory(temporaryDirectory);
  }
  assert.equal(fs.existsSync(temporaryDirectory), false);
});

test("storage bucket is discovered from authenticated adminSdkConfig", async () => {
  const bucket = await enrichment.discoverStorageBucket({
    app: {
      options: {
        credential: {
          getAccessToken: async () => ({
            access_token: "fixture-token",
          }),
        },
      },
    },
    projectId: "reservaeldia-7a440",
    fetchImpl: async (_url, options) => {
      assert.equal(
        options.headers.authorization,
        "Bearer fixture-token"
      );
      return new Response(
        JSON.stringify({
          projectId: "reservaeldia-7a440",
          storageBucket:
            "reservaeldia-7a440.firebasestorage.app",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      );
    },
  });
  assert.equal(
    bucket,
    "reservaeldia-7a440.firebasestorage.app"
  );
});

test("sanitized report never includes provider contacts or full address", async () => {
  const provider = providerDocument();
  provider.contacto.email = "persona@example.test";
  provider.contacto.telefonoOriginal = "+5491112345678";
  provider.contacto.telefonoNormalizado = "+5491112345678";
  provider.contacto.whatsapp = "+5491112345678";
  provider.ubicacion.direccionOriginal =
    "Calle privada 1234, Buenos Aires";
  const fake = createFakeRuntime({ provider });
  const report = await enrichment.enrichSingleProvider({
    args: args(),
    runtime: fake.runtime,
    contract,
    pageFetcher: fixturePageFetcher(NO_GALLERY_HTML),
    imageDownloader: fixtureImageDownloader,
  });
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("persona@example.test"), false);
  assert.equal(serialized.includes("+5491112345678"), false);
  assert.equal(serialized.includes("Calle privada 1234"), false);
});
