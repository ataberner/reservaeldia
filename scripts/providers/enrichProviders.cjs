#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");
const { deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const {
  loadProviderContract,
  writeJsonAtomic,
} = require("./analyzeProviderJson.cjs");
const importer = require("./importProviders.cjs");
const {
  canonicalMediaIdentity,
  extractProviderPage,
} = require("./providerEnrichmentPage.cjs");
const {
  ProviderEnrichmentError,
  DEFAULT_MAX_RETRIES,
  REQUEST_TIMEOUT_MS,
  createTemporaryDirectory,
  downloadAndValidateImage,
  fetchProviderPage,
  removeTemporaryDirectory,
} = require("./providerEnrichmentImages.cjs");

const DEFAULT_MAX_GALLERY_IMAGES = 100;
const ABSOLUTE_MAX_GALLERY_IMAGES = 500;
const MAX_DESCRIPTION_CHARS = 200000;
const FIREBASE_ADMIN_CONFIG_ENDPOINT =
  "https://firebase.googleapis.com/v1beta1/projects";

function parseArgs(argv) {
  const args = {
    apply: false,
    force: false,
    completeGallery: false,
    debugLocal: false,
    maxGalleryImages: DEFAULT_MAX_GALLERY_IMAGES,
    providerId: "",
    category: "",
    limit: 10,
    concurrency: 2,
    resumeState: "",
    dryRunState: "",
    log: "",
    requestDelayMs: 500,
    maxRetries: DEFAULT_MAX_RETRIES,
    timeoutMs: REQUEST_TIMEOUT_MS,
    stopAfterErrors: 10,
    pauseOn429: false,
    recoverStaleLock: false,
    confirmStaleLock: "",
    project: "",
    confirmProject: "",
    credentials: "",
    report: "",
  };
  for (const entry of argv) {
    if (entry === "--apply") {
      args.apply = true;
    } else if (entry === "--dry-run") {
      args.apply = false;
    } else if (entry === "--force") {
      args.force = true;
    } else if (entry === "--complete-gallery") {
      args.completeGallery = true;
    } else if (entry === "--debug-local") {
      args.debugLocal = true;
    } else if (entry === "--pause-on-429") {
      args.pauseOn429 = true;
    } else if (entry === "--recover-stale-lock") {
      args.recoverStaleLock = true;
    } else if (entry.startsWith("--max-gallery-images=")) {
      args.maxGalleryImages = Number(
        entry.slice("--max-gallery-images=".length)
      );
    } else if (entry.startsWith("--provider-id=")) {
      args.providerId = entry.slice("--provider-id=".length).trim();
    } else if (entry.startsWith("--category=")) {
      args.category = entry.slice("--category=".length).trim();
    } else if (entry.startsWith("--limit=")) {
      args.limit = Number(entry.slice("--limit=".length));
    } else if (entry.startsWith("--concurrency=")) {
      args.concurrency = Number(
        entry.slice("--concurrency=".length)
      );
    } else if (entry.startsWith("--resume-state=")) {
      args.resumeState = entry
        .slice("--resume-state=".length)
        .trim();
    } else if (entry.startsWith("--dry-run-state=")) {
      args.dryRunState = entry
        .slice("--dry-run-state=".length)
        .trim();
    } else if (entry.startsWith("--log=")) {
      args.log = entry.slice("--log=".length).trim();
    } else if (entry.startsWith("--request-delay-ms=")) {
      args.requestDelayMs = Number(
        entry.slice("--request-delay-ms=".length)
      );
    } else if (entry.startsWith("--max-retries=")) {
      args.maxRetries = Number(
        entry.slice("--max-retries=".length)
      );
    } else if (entry.startsWith("--timeout-ms=")) {
      args.timeoutMs = Number(
        entry.slice("--timeout-ms=".length)
      );
    } else if (entry.startsWith("--stop-after-errors=")) {
      args.stopAfterErrors = Number(
        entry.slice("--stop-after-errors=".length)
      );
    } else if (entry.startsWith("--confirm-stale-lock=")) {
      args.confirmStaleLock = entry
        .slice("--confirm-stale-lock=".length)
        .trim();
    } else if (entry.startsWith("--project=")) {
      args.project = entry.slice("--project=".length).trim();
    } else if (entry.startsWith("--confirm-project=")) {
      args.confirmProject = entry
        .slice("--confirm-project=".length)
        .trim();
    } else if (entry.startsWith("--credentials=")) {
      args.credentials = entry.slice("--credentials=".length).trim();
    } else if (entry.startsWith("--report=")) {
      args.report = entry.slice("--report=".length).trim();
    } else if (entry === "--help" || entry === "-h") {
      args.help = true;
    } else {
      throw new Error(`Argumento desconocido: ${entry}`);
    }
  }
  return args;
}

function validateArgs(args, contract) {
  const defaults = {
    maxGalleryImages: DEFAULT_MAX_GALLERY_IMAGES,
    limit: 10,
    concurrency: 2,
    requestDelayMs: 500,
    maxRetries: DEFAULT_MAX_RETRIES,
    timeoutMs: REQUEST_TIMEOUT_MS,
    stopAfterErrors: 10,
    category: "",
    resumeState: "",
    dryRunState: "",
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (args[key] === undefined) args[key] = value;
  }
  if (
    args.providerId &&
    !/^pcar_[a-f0-9]{24}$/.test(args.providerId)
  ) {
    throw new Error(
      "--provider-id debe tener el formato determinístico pcar_ + 24 hexadecimales."
    );
  }
  if (!args.project || !args.confirmProject) {
    throw new Error(
      "Se requieren --project y --confirm-project explícitos."
    );
  }
  if (args.project !== args.confirmProject) {
    throw new Error(
      "--project y --confirm-project deben coincidir exactamente."
    );
  }
  if (!args.credentials) {
    throw new Error("--credentials=RUTA es obligatorio.");
  }
  if (
    !Number.isInteger(args.maxGalleryImages) ||
    args.maxGalleryImages < 1 ||
    args.maxGalleryImages > ABSOLUTE_MAX_GALLERY_IMAGES
  ) {
    throw new Error(
      `--max-gallery-images debe ser un entero entre 1 y ${ABSOLUTE_MAX_GALLERY_IMAGES}.`
    );
  }
  if (args.apply && args.debugLocal) {
    throw new Error(
      "--debug-local solo puede utilizarse con --dry-run."
    );
  }
  if (
    !Number.isInteger(args.limit) ||
    args.limit < 1 ||
    args.limit > 10000
  ) {
    throw new Error("--limit debe ser un entero entre 1 y 10000.");
  }
  if (
    !Number.isInteger(args.concurrency) ||
    args.concurrency < 1 ||
    args.concurrency > 8
  ) {
    throw new Error(
      "--concurrency debe ser un entero entre 1 y 8."
    );
  }
  if (
    !Number.isInteger(args.requestDelayMs) ||
    args.requestDelayMs < 0 ||
    args.requestDelayMs > 60000
  ) {
    throw new Error(
      "--request-delay-ms debe ser un entero entre 0 y 60000."
    );
  }
  if (
    !Number.isInteger(args.maxRetries) ||
    args.maxRetries < 0 ||
    args.maxRetries > 10
  ) {
    throw new Error(
      "--max-retries debe ser un entero entre 0 y 10."
    );
  }
  if (
    !Number.isInteger(args.timeoutMs) ||
    args.timeoutMs < 1000 ||
    args.timeoutMs > 300000
  ) {
    throw new Error(
      "--timeout-ms debe ser un entero entre 1000 y 300000."
    );
  }
  if (
    !Number.isInteger(args.stopAfterErrors) ||
    args.stopAfterErrors < 1 ||
    args.stopAfterErrors > 1000
  ) {
    throw new Error(
      "--stop-after-errors debe ser un entero entre 1 y 1000."
    );
  }
  if (
    args.category &&
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args.category)
  ) {
    throw new Error("--category no tiene un slug válido.");
  }
  if (args.providerId && args.category) {
    throw new Error(
      "--provider-id y --category son alcances mutuamente excluyentes."
    );
  }
  const massive =
    !args.providerId ||
    Boolean(args.resumeState) ||
    Boolean(args.dryRunState);
  if (args.apply && massive && !args.resumeState) {
    throw new Error(
      "--resume-state es obligatorio para --apply masivo."
    );
  }
  if (!args.apply && args.resumeState && !args.dryRunState) {
    throw new Error(
      "El dry-run no puede modificar --resume-state; use --dry-run-state para un estado separado."
    );
  }
  if (args.providerId) {
    contract.buildProviderCoverStoragePath(args.providerId, "jpg");
    contract.buildProviderGalleryStoragePath(
      args.providerId,
      "img_preflight",
      "jpg"
    );
  }
}

function sanitizeErrorMessage(value) {
  return String(value || "")
    .replace(
      /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi,
      "[email-redactado]"
    )
    .replace(/(?:\+?\d[\d\s().-]{6,}\d)/g, "[telefono-redactado]")
    .replace(/[A-Za-z]:\\[^"\r\n]+/g, "[ruta-redactada]")
    .slice(0, 500);
}

function defaultReportPath(providerId) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  return path.resolve(
    process.cwd(),
    "artifacts",
    "providers",
    "runtime",
    `provider-enrichment-${providerId}-${timestamp}.json`
  );
}

function createReport(args) {
  return {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: args.apply
      ? "single_provider_apply"
      : "single_provider_dry_run",
    status: "pending",
    providerId: args.providerId,
    providerName: null,
    projectId: args.project,
    force: args.force,
    completeGallery: args.completeGallery,
    maxGalleryImages: args.maxGalleryImages,
    urlVisited: null,
    elapsedMs: 0,
    descriptionFound: false,
    coverFound: false,
    galleryExpected: null,
    galleryDetected: 0,
    error: null,
    description: {
      found: false,
      characters: 0,
      source: null,
      shortDescriptionSource: null,
    },
    images: {
      candidatesFound: 0,
      validated: 0,
      duplicatesDiscarded: 0,
      uploadAttempts: 0,
      uploaded: 0,
      coverFound: false,
      galleryFound: 0,
      storagePathsPlanned: [],
      storagePathsUploaded: [],
      storagePathsReused: [],
      discardedByReason: {},
    },
    galleryExpectedCount: null,
    galleryDetectedCount: 0,
    galleryDownloadedCount: 0,
    galleryValidCount: 0,
    galleryUploadedCount: 0,
    galleryExistingCount: 0,
    galleryAddedCount: 0,
    galleryDiscardedCount: 0,
    galleryComplete: false,
    extractionSource: null,
    bytes: {
      pageDownloaded: 0,
      imagesDownloaded: 0,
      uploaded: 0,
    },
    firestore: {
      providerFound: false,
      documentCompatible: false,
      updated: false,
      fieldsUpdated: [],
    },
    preflight: {
      completed: false,
      firestoreAccessible: false,
      storageAccessible: false,
      sourceUrlValid: false,
      targetPathsAvailable: false,
    },
    extraction: {
      pageStatus: null,
      diagnostics: null,
    },
    idempotency: {
      skippedCompleteProvider: false,
      existingDescriptionPreserved: false,
      existingCoverPreserved: false,
      existingGalleryPreserved: false,
    },
    rollback: {
      attempted: false,
      skippedByPolicy: false,
      deletedPaths: [],
      failedPaths: [],
    },
    retries: 0,
    temporaryFilesRemoved: false,
    debugArtifacts: [],
    errors: [],
    durationsMs: {},
    firebaseInitialized: false,
    remoteReads: 0,
    remoteWrites: 0,
  };
}

async function timedStage(report, stageName, callback) {
  const startedAt = performance.now();
  try {
    return await callback();
  } finally {
    report.durationsMs[stageName] = Math.round(
      performance.now() - startedAt
    );
  }
}

function providerEnrichmentFingerprint(document) {
  function imageValue(image) {
    if (!image) return null;
    return {
      id: image.id,
      tipo: image.tipo,
      storagePath: image.storagePath,
      url: image.url,
      urlOriginal: image.urlOriginal,
      alt: image.alt,
      orden: image.orden,
      ancho: image.ancho,
      alto: image.alto,
      mimeType: image.mimeType,
      formato: image.formato,
      tamanioBytes: image.tamanioBytes,
    };
  }
  return JSON.stringify({
    descripcion: document.descripcion,
    descripcionCorta: document.descripcionCorta,
    imagenes: {
      portada: imageValue(document.imagenes?.portada),
      galeria: Array.isArray(document.imagenes?.galeria)
        ? document.imagenes.galeria.map(imageValue)
        : [],
    },
    importacion: {
      descripcionImportada:
        document.importacion?.descripcionImportada,
      portadaImportada: document.importacion?.portadaImportada,
      galeriaImportada: document.importacion?.galeriaImportada,
      descripcionEncontrada:
        document.importacion?.descripcionEncontrada,
      portadaEncontrada:
        document.importacion?.portadaEncontrada,
      galeriaEncontrada:
        document.importacion?.galeriaEncontrada,
      cantidadImagenes: document.importacion?.cantidadImagenes,
      procesada: Boolean(document.importacion?.completadaEn),
    },
  });
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function existingCompletion(document) {
  const description = hasText(document.descripcion);
  const cover = Boolean(
    document.imagenes?.portada?.storagePath
  );
  const gallery =
    document.importacion?.galeriaImportada === true;
  const processed =
    document.importacion?.completadaEn !== null &&
    document.importacion?.completadaEn !== undefined;
  return {
    description,
    cover,
    gallery,
    processed,
    complete:
      processed || (description && cover && gallery),
  };
}

function existingImageEvidence(document) {
  const images = Array.isArray(document.imagenes?.galeria)
    ? document.imagenes.galeria.filter(Boolean)
    : [];
  const byStableIdentity = new Map();
  const byHashPrefix = new Map();
  for (const image of images) {
    const identity = canonicalMediaIdentity(
      image.urlOriginal,
      image.urlOriginal
    );
    if (identity && !byStableIdentity.has(identity)) {
      byStableIdentity.set(identity, image);
    }
    const hashPrefix = String(image.id || "").match(
      /^(?:portada|img)_([a-f0-9]{20})$/
    )?.[1];
    if (hashPrefix && !byHashPrefix.has(hashPrefix)) {
      byHashPrefix.set(hashPrefix, image);
    }
  }
  return {
    images,
    byStableIdentity,
    byHashPrefix,
  };
}

function incrementDiscardReason(report, reason) {
  report.images.discardedByReason[reason] =
    (report.images.discardedByReason[reason] || 0) + 1;
  report.galleryDiscardedCount += 1;
}

function galleryDocumentComparable(image) {
  return {
    id: image.id,
    tipo: image.tipo,
    storagePath: image.storagePath,
    url: image.url,
    urlOriginal: image.urlOriginal,
    alt: image.alt,
    orden: image.orden,
    ancho: image.ancho,
    alto: image.alto,
    mimeType: image.mimeType,
    formato: image.formato,
    tamanioBytes: image.tamanioBytes,
  };
}

function galleriesMatch(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  return (
    JSON.stringify(left.map(galleryDocumentComparable)) ===
    JSON.stringify(right.map(galleryDocumentComparable))
  );
}

function writeDebugArtifacts({
  providerId,
  pageHtml,
  extraction,
}) {
  const directory = path.resolve(
    process.cwd(),
    "artifacts",
    "providers",
    "runtime",
    `debug-${providerId}`
  );
  fs.mkdirSync(directory, { recursive: true });
  const htmlPath = path.join(directory, "page.html");
  fs.writeFileSync(htmlPath, pageHtml, "utf8");
  const galleryPath = writeJsonAtomic(
    path.join(directory, "gallery-authority.json"),
    {
      providerId,
      extractionSource: extraction.galleryExtractionSource,
      galleryExpectedCount: extraction.galleryExpectedCount,
      galleryDetectedCount: extraction.galleryDetectedCount,
      galleryCompleteEvidence:
        extraction.galleryCompleteEvidence,
      items: extraction.debugGalleryItems,
    }
  );
  return [htmlPath, galleryPath];
}

async function discoverStorageBucket({
  app,
  projectId,
  fetchImpl = globalThis.fetch,
}) {
  const credential = app.options.credential;
  if (!credential || typeof credential.getAccessToken !== "function") {
    throw new ProviderEnrichmentError(
      "credential_token_unavailable",
      "La credencial no puede obtener un token para descubrir Storage."
    );
  }
  const accessToken = await credential.getAccessToken();
  const token =
    typeof accessToken === "string"
      ? accessToken
      : accessToken?.access_token;
  if (!token) {
    throw new ProviderEnrichmentError(
      "credential_token_unavailable",
      "La credencial no devolvió un token válido."
    );
  }
  const response = await fetchImpl(
    `${FIREBASE_ADMIN_CONFIG_ENDPOINT}/${encodeURIComponent(projectId)}/adminSdkConfig`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(30000),
    }
  );
  if (!response.ok) {
    throw new ProviderEnrichmentError(
      "storage_bucket_discovery_failed",
      `No se pudo descubrir el bucket del proyecto (HTTP ${response.status}).`
    );
  }
  const config = await response.json();
  const storageBucket = String(config.storageBucket || "").trim();
  if (
    config.projectId !== projectId ||
    !/^[a-z0-9][a-z0-9._-]{2,222}$/i.test(storageBucket)
  ) {
    throw new ProviderEnrichmentError(
      "storage_bucket_discovery_failed",
      "adminSdkConfig no devolvió un bucket compatible con el proyecto."
    );
  }
  return storageBucket;
}

async function createFirebaseRuntime(args, options = {}) {
  const app = importer.initializeAdminAppForApply(args);
  const metrics = {
    remoteReads: 0,
    remoteWrites: 0,
  };
  let storageBucket;
  try {
    storageBucket = await discoverStorageBucket({
      app,
      projectId: args.project,
      fetchImpl: options.fetchImpl,
    });
    metrics.remoteReads += 1;
  } catch (error) {
    metrics.remoteReads += 1;
    error.runtimeMetrics = metrics;
    error.firebaseInitialized = true;
    await deleteApp(app);
    throw error;
  }
  const db = getFirestore(app);
  const bucket = getStorage(app).bucket(storageBucket);

  return createFirebaseRuntimeFromClients({
    app,
    db,
    bucket,
    metrics,
  });
}

function createFirebaseRuntimeFromClients({
  app,
  db,
  bucket,
  metrics = {
    remoteReads: 0,
    remoteWrites: 0,
  },
}) {
  return {
    app,
    metrics,
    async readProvider(providerId) {
      const reference = db
        .collection("proveedores")
        .doc(providerId);
      const snapshot = await reference.get();
      metrics.remoteReads += 1;
      return {
        exists: snapshot.exists,
        data: snapshot.exists ? snapshot.data() : null,
      };
    },
    async listProviderIds({ category = "" } = {}) {
      let query = db.collection("proveedores");
      if (category) {
        query = query.where(
          "categoriaIds",
          "array-contains",
          category
        );
      }
      const snapshot = await query.select().get();
      metrics.remoteReads += snapshot.size;
      return snapshot.docs
        .map((document) => document.id)
        .sort();
    },
    async checkStorageAccess() {
      await bucket
        .file(".reservaeldia-provider-enrichment-preflight")
        .exists();
      metrics.remoteReads += 1;
      return true;
    },
    async objectExists(storagePath) {
      const [exists] = await bucket.file(storagePath).exists();
      metrics.remoteReads += 1;
      return exists;
    },
    async getObjectInfo(storagePath) {
      const file = bucket.file(storagePath);
      const [exists] = await file.exists();
      metrics.remoteReads += 1;
      if (!exists) return { exists: false, metadata: null };
      const [metadata] = await file.getMetadata();
      metrics.remoteReads += 1;
      return {
        exists: true,
        metadata: {
          size: Number(metadata.size || 0),
          contentType: metadata.contentType || null,
          custom: metadata.metadata || {},
          generation: metadata.generation || null,
        },
      };
    },
    async uploadObject({
      storagePath,
      buffer,
      mimeType,
      providerId,
      imageId,
      executionId,
      hashSha256,
    }) {
      await bucket.file(storagePath).save(buffer, {
        resumable: false,
        validation: "crc32c",
        preconditionOpts: {
          ifGenerationMatch: 0,
        },
        metadata: {
          contentType: mimeType,
          cacheControl: "public,max-age=31536000,immutable",
          metadata: {
            providerId,
            imageId,
            executionId: executionId || "",
            hashSha256: hashSha256 || "",
          },
        },
      });
      metrics.remoteWrites += 1;
    },
    async deleteObject(storagePath) {
      await bucket.file(storagePath).delete({
        ignoreNotFound: true,
      });
      metrics.remoteWrites += 1;
    },
    async commitProviderUpdate({
      providerId,
      expectedFingerprint,
      update,
      contract,
    }) {
      const reference = db
        .collection("proveedores")
        .doc(providerId);
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        metrics.remoteReads += 1;
        if (!snapshot.exists) {
          throw new ProviderEnrichmentError(
            "provider_disappeared",
            "El proveedor dejó de existir antes del commit."
          );
        }
        const current = snapshot.data();
        contract.assertValidProveedor(current);
        if (
          providerEnrichmentFingerprint(current) !==
          expectedFingerprint
        ) {
          throw new ProviderEnrichmentError(
            "provider_changed_during_enrichment",
            "El contenido enriquecible cambió durante la operación."
          );
        }
        const merged = {
          ...current,
          ...update,
        };
        contract.assertValidProveedor(merged);
        transaction.update(reference, update);
      });
      metrics.remoteWrites += 1;
    },
    async close() {
      await deleteApp(app);
    },
  };
}

function createFirebaseRuntimeForEmulator({
  projectId = "demo-reservaeldia-provider-enrichment",
  storageBucket = "demo-reservaeldia-provider-enrichment.appspot.com",
  appName = `provider-enrichment-emulator-${process.pid}-${Date.now()}`,
} = {}) {
  if (
    !process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.FIREBASE_STORAGE_EMULATOR_HOST
  ) {
    throw new Error(
      "FIRESTORE_EMULATOR_HOST y FIREBASE_STORAGE_EMULATOR_HOST son obligatorios."
    );
  }
  const { app, db } =
    importer.initializeFirestoreForEmulator({
      projectId,
      appName,
    });
  const bucket = getStorage(app).bucket(storageBucket);
  return createFirebaseRuntimeFromClients({
    app,
    db,
    bucket,
    metrics: {
      remoteReads: 0,
      remoteWrites: 0,
    },
  });
}

function createImageDocument({
  providerId,
  type,
  downloaded,
  order,
  providerName,
  importedAt,
  contract,
  executionId = "",
}) {
  const idPrefix = type === "portada" ? "portada" : "img";
  const id = `${idPrefix}_${downloaded.hashSha256.slice(0, 20)}`;
  const storagePath =
    type === "portada"
      ? contract.buildProviderCoverStoragePath(
          providerId,
          downloaded.extension
        )
      : contract.buildProviderGalleryStoragePath(
          providerId,
          id,
          downloaded.extension
        );
  return {
    document: {
      id,
      tipo: type,
      storagePath,
      url: null,
      urlOriginal: downloaded.finalUrl,
      alt: downloaded.alt || providerName,
      orden: order,
      ancho: downloaded.width,
      alto: downloaded.height,
      mimeType: downloaded.mimeType,
      formato: downloaded.extension,
      tamanioBytes: downloaded.bytes,
      importadaEn: new Date(importedAt.getTime()),
    },
    upload: {
      storagePath,
      buffer: downloaded.buffer,
      mimeType: downloaded.mimeType,
      providerId,
      imageId: id,
      bytes: downloaded.bytes,
      executionId,
      hashSha256: downloaded.hashSha256,
    },
  };
}

async function rollbackUploadedObjects(
  report,
  runtime,
  uploadedPaths
) {
  if (uploadedPaths.length === 0) return;
  report.rollback.attempted = true;
  for (const storagePath of [...uploadedPaths].reverse()) {
    try {
      await runtime.deleteObject(storagePath);
      report.rollback.deletedPaths.push(storagePath);
    } catch {
      report.rollback.failedPaths.push(storagePath);
    }
  }
}

async function emitLifecycle(lifecycle, event, details = {}) {
  if (typeof lifecycle?.onEvent === "function") {
    await lifecycle.onEvent({
      event,
      ...details,
    });
  }
}

function resumableUploadRecord(
  plan,
  objectInfo,
  lifecycle
) {
  if (!objectInfo?.exists) return null;
  const custom = objectInfo.metadata?.custom || {};
  const explicitRecord = (
    lifecycle.resumeUploads || []
  ).find(
    (record) =>
      record.storagePath === plan.document.storagePath &&
      record.imageId === plan.document.id &&
      record.hashSha256 === plan.upload.hashSha256
  );
  const executionMatches =
    lifecycle.executionId &&
    custom.executionId === lifecycle.executionId;
  const metadataMatches =
    custom.providerId === plan.upload.providerId &&
    custom.imageId === plan.upload.imageId &&
    custom.hashSha256 === plan.upload.hashSha256 &&
    Number(objectInfo.metadata?.size || 0) ===
      Number(plan.upload.bytes || 0);
  return metadataMatches &&
    (explicitRecord || executionMatches)
    ? {
        storagePath: plan.document.storagePath,
        imageId: plan.document.id,
        hashSha256: plan.upload.hashSha256,
        bytes: plan.upload.bytes,
        executionId:
          custom.executionId || lifecycle.executionId,
      }
    : null;
}

async function enrichSingleProvider({
  args,
  runtime,
  contract,
  pageFetcher = fetchProviderPage,
  pageExtractor = extractProviderPage,
  imageDownloader = downloadAndValidateImage,
  now = () => new Date(),
  temporaryDirectoryFactory = createTemporaryDirectory,
  temporaryDirectoryRemover = removeTemporaryDirectory,
  lifecycle = {},
}) {
  const report = createReport(args);
  const maxGalleryImages =
    args.maxGalleryImages || DEFAULT_MAX_GALLERY_IMAGES;
  report.maxGalleryImages = maxGalleryImages;
  report.firebaseInitialized = true;
  const startedAt = performance.now();
  let stage = "provider_read";
  let temporaryDirectory = null;
  const uploadedPaths = [];
  const reusableUploadPaths = new Set();
  const setStage = async (nextStage, details = {}) => {
    stage = nextStage;
    await emitLifecycle(lifecycle, "stage", {
      stage: nextStage,
      providerId: args.providerId,
      ...details,
    });
  };

  try {
    await setStage("provider_read");
    const providerResult = await timedStage(
      report,
      "firestoreRead",
      () => runtime.readProvider(args.providerId)
    );
    report.preflight.firestoreAccessible = true;
    if (!providerResult.exists) {
      throw new ProviderEnrichmentError(
        "provider_not_found",
        "El proveedor solicitado no existe."
      );
    }
    const provider = providerResult.data;
    report.providerName = provider.nombre;
    await emitLifecycle(lifecycle, "provider_loaded", {
      providerId: args.providerId,
      providerName: provider.nombre,
      sourceUrl: provider.fuente?.urlOriginal || null,
      enrichmentFingerprint:
        crypto
          .createHash("sha256")
          .update(providerEnrichmentFingerprint(provider))
          .digest("hex"),
    });
    report.firestore.providerFound = true;
    contract.assertValidProveedor(provider);
    report.firestore.documentCompatible = true;

    const normalizedSourceUrl =
      contract.normalizeOriginalProviderUrl(
        provider.fuente?.urlOriginal,
        { providerName: provider.nombre }
      );
    if (!normalizedSourceUrl) {
      throw new ProviderEnrichmentError(
        "invalid_provider_source_url",
        "fuente.urlOriginal no es una URL válida."
      );
    }
    if (
      normalizedSourceUrl.hostname !==
      contract.PROVIDER_SOURCE_HOST
    ) {
      throw new ProviderEnrichmentError(
        "unexpected_provider_source_host",
        "fuente.urlOriginal no pertenece al origen autorizado."
      );
    }
    if (
      contract.createProviderDocumentId(
        normalizedSourceUrl.normalized
      ) !== args.providerId
    ) {
      throw new ProviderEnrichmentError(
        "provider_identity_mismatch",
        "La URL original no corresponde al providerId determinístico."
      );
    }
    report.preflight.sourceUrlValid = true;
    report.urlVisited = normalizedSourceUrl.normalized;

    const completion = existingCompletion(provider);
    report.idempotency.existingDescriptionPreserved =
      completion.description;
    report.idempotency.existingCoverPreserved = completion.cover;
    report.idempotency.existingGalleryPreserved = completion.gallery;
    if (args.completeGallery) {
      report.idempotency.existingGalleryPreserved = false;
    }
    if (
      completion.complete &&
      !args.force &&
      !args.completeGallery
    ) {
      report.idempotency.skippedCompleteProvider = true;
      report.status = "skipped_already_complete";
      report.preflight.completed = true;
      return report;
    }

    await setStage("storage_access");
    await timedStage(report, "storageAccess", () =>
      runtime.checkStorageAccess()
    );
    report.preflight.storageAccessible = true;

    await setStage("page_download");
    const page = await timedStage(report, "pageDownload", () =>
      pageFetcher({
        url: normalizedSourceUrl.normalized,
        timeoutMs: args.timeoutMs,
        maxRetries: args.maxRetries,
        requestDelayMs: args.requestDelayMs,
        pauseOn429: args.pauseOn429,
        requestController: lifecycle.requestController,
      })
    );
    report.retries += page.retries || 0;
    report.extraction.pageStatus = page.status;
    report.bytes.pageDownloaded = page.bytes;
    report.urlVisited = page.finalUrl;
    const finalPageUrl = contract.normalizeOriginalProviderUrl(
      page.finalUrl,
      { providerName: provider.nombre }
    );
    if (
      !finalPageUrl ||
      finalPageUrl.hostname !== contract.PROVIDER_SOURCE_HOST
    ) {
      throw new ProviderEnrichmentError(
        "unexpected_page_redirect",
        "La página redirigió fuera del origen autorizado."
      );
    }

    await setStage("page_analysis");
    const extraction = await timedStage(
      report,
      "pageAnalysis",
      () => pageExtractor(page.html, page.finalUrl)
    );
    report.extraction.diagnostics = extraction.diagnostics;
    report.durationsMs.descriptionDetection =
      extraction.diagnostics?.timingsMs
        ?.descriptionSelection || 0;
    report.durationsMs.imageDetection =
      (extraction.diagnostics?.timingsMs
        ?.galleryAuthority || 0) +
      (extraction.diagnostics?.timingsMs?.imageSelection ||
        0);
    if (args.debugLocal) {
      report.debugArtifacts = writeDebugArtifacts({
        providerId: args.providerId,
        pageHtml: page.html,
        extraction,
      });
    }
    report.description = {
      found: Boolean(extraction.description),
      characters: extraction.description?.length || 0,
      source: extraction.descriptionSource,
      shortDescriptionSource:
        extraction.shortDescriptionSource,
    };
    report.images.candidatesFound =
      extraction.imageCandidatesFound;
    report.images.coverFound = Boolean(extraction.cover);
    report.images.galleryFound = extraction.gallery.length;
    report.descriptionFound = report.description.found;
    report.coverFound = report.images.coverFound;
    report.galleryExpectedCount =
      extraction.galleryExpectedCount;
    report.galleryDetectedCount =
      extraction.galleryDetectedCount;
    report.galleryExpected = report.galleryExpectedCount;
    report.galleryDetected = report.galleryDetectedCount;
    report.extractionSource =
      extraction.galleryExtractionSource;
    for (
      let index = 0;
      index < extraction.gallerySourceDuplicateCount;
      index += 1
    ) {
      incrementDiscardReason(
        report,
        "duplicate_source_identity"
      );
    }
    for (
      let index = 0;
      index < extraction.gallerySourceInvalidCount;
      index += 1
    ) {
      incrementDiscardReason(report, "invalid_source_entry");
    }

    if (
      extraction.description &&
      extraction.description.length > MAX_DESCRIPTION_CHARS
    ) {
      throw new ProviderEnrichmentError(
        "description_too_large",
        "La descripción excede el límite seguro del documento."
      );
    }
    if (
      extraction.galleryExpectedCount > maxGalleryImages
    ) {
      throw new ProviderEnrichmentError(
        "too_many_image_candidates",
        "La página contiene demasiadas imágenes candidatas para el piloto."
      );
    }

    const candidates = [];
    const existingEvidence = existingImageEvidence(provider);
    const shouldInspectGallery =
      !completion.gallery || args.completeGallery;
    const sourceHasGallery = extraction.gallery.length > 0;
    const shouldRebuildGallery =
      shouldInspectGallery && sourceHasGallery;
    report.galleryExistingCount = existingEvidence.images.length;
    const resolvedGalleryByOrder = new Map();
    if (!completion.cover && extraction.cover) {
      candidates.push({
        ...extraction.cover,
        targetType: "portada",
      });
    }
    if (shouldRebuildGallery) {
      extraction.gallery.forEach((image, order) => {
        const identity =
          image.stableIdentity ||
          canonicalMediaIdentity(image.url, page.finalUrl);
        const existing = identity
          ? existingEvidence.byStableIdentity.get(identity)
          : null;
        if (existing) {
          resolvedGalleryByOrder.set(order, {
            ...existing,
            tipo: "galeria",
            orden: order,
          });
          return;
        }
        candidates.push({
          ...image,
          stableIdentity: identity,
          sourceOrder: order,
          targetType: "galeria",
        });
      });
    }

    temporaryDirectory = temporaryDirectoryFactory();
    await setStage("image_download", {
      galleryDetectedCount: extraction.galleryDetectedCount,
    });
    const downloadedImages = [];
    const hashes = new Map();
    let galleryContentDuplicates = 0;
    await timedStage(report, "imageDownloadAndValidation", async () => {
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        await emitLifecycle(lifecycle, "image_download_progress", {
          stage: "image_download",
          providerId: args.providerId,
          current: index + 1,
          total: candidates.length,
          targetType: candidate.targetType,
        });
        let downloaded;
        try {
          downloaded = await imageDownloader({
            candidate,
            index,
            temporaryDirectory,
            maximumBytes: contract.PROVIDER_IMAGE_MAX_BYTES,
            allowedMimeTypes: [
              ...contract.PROVIDER_IMAGE_MIME_TYPES,
            ],
            timeoutMs: args.timeoutMs,
            maxRetries: args.maxRetries,
            requestDelayMs: args.requestDelayMs,
            pauseOn429: args.pauseOn429,
            requestController: lifecycle.requestController,
          });
        } catch (error) {
          if (candidate.targetType !== "galeria") throw error;
          incrementDiscardReason(
            report,
            error.code || "image_validation_failed"
          );
          continue;
        }
        report.bytes.imagesDownloaded += downloaded.bytes;
        report.retries += downloaded.retries || 0;
        report.durationsMs.imageDownload =
          (report.durationsMs.imageDownload || 0) +
          (downloaded.downloadDurationMs || 0);
        report.durationsMs.imageValidation =
          (report.durationsMs.imageValidation || 0) +
          (downloaded.validationDurationMs || 0);
        if (candidate.targetType === "galeria") {
          report.galleryDownloadedCount += 1;
        }
        const hashPrefix = downloaded.hashSha256.slice(0, 20);
        const existingByHash =
          existingEvidence.byHashPrefix.get(hashPrefix);
        if (
          candidate.targetType === "galeria" &&
          existingByHash
        ) {
          resolvedGalleryByOrder.set(candidate.sourceOrder, {
            ...existingByHash,
            tipo: "galeria",
            orden: candidate.sourceOrder,
          });
          report.images.duplicatesDiscarded += 1;
          continue;
        }
        if (hashes.has(downloaded.hashSha256)) {
          report.images.duplicatesDiscarded += 1;
          if (candidate.targetType === "galeria") {
            galleryContentDuplicates += 1;
            incrementDiscardReason(report, "duplicate_content_hash");
          }
          continue;
        }
        hashes.set(downloaded.hashSha256, candidate.sourceOrder);
        downloadedImages.push(downloaded);
      }
    });
    report.images.validated = downloadedImages.length;

    const importedAt = now();
    const coverDownload = downloadedImages.find(
      (image) => image.targetType === "portada"
    );
    const galleryDownloads = downloadedImages.filter(
      (image) => image.targetType === "galeria"
    );
    if (
      !completion.cover &&
      extraction.cover &&
      !coverDownload
    ) {
      throw new ProviderEnrichmentError(
        "cover_validation_failed",
        "La portada no superó la validación de imagen."
      );
    }

    const coverPlan = coverDownload
      ? createImageDocument({
          providerId: args.providerId,
          type: "portada",
          downloaded: coverDownload,
          order: 0,
          providerName: provider.nombre,
          importedAt,
          contract,
          executionId: lifecycle.executionId,
        })
      : null;
    const galleryPlans = galleryDownloads.map((downloaded) =>
      createImageDocument({
        providerId: args.providerId,
        type: "galeria",
        downloaded,
        order: downloaded.sourceOrder,
        providerName: provider.nombre,
        importedAt,
        contract,
        executionId: lifecycle.executionId,
      })
    );
    for (const plan of galleryPlans) {
      resolvedGalleryByOrder.set(
        plan.document.orden,
        plan.document
      );
    }
    const rebuiltGallery = [
      ...resolvedGalleryByOrder.entries(),
    ]
      .sort(([left], [right]) => left - right)
      .map(([, image]) => image);
    const finalGallery = shouldRebuildGallery
      ? rebuiltGallery
      : provider.imagenes.galeria;
    if (shouldRebuildGallery) {
      const retainedStoragePaths = new Set(
        finalGallery.map((image) => image.storagePath)
      );
      for (const existing of existingEvidence.images) {
        if (!retainedStoragePaths.has(existing.storagePath)) {
          incrementDiscardReason(
            report,
            "existing_not_in_authority"
          );
        }
      }
    }
    report.galleryValidCount = shouldInspectGallery
      ? rebuiltGallery.length
      : finalGallery.length;
    report.galleryAddedCount = galleryPlans.length;
    report.galleryComplete = shouldInspectGallery
      ? Boolean(extraction.galleryCompleteEvidence) &&
        rebuiltGallery.length + galleryContentDuplicates ===
          extraction.gallery.length
      : provider.importacion.galeriaImportada === true;
    if (!report.galleryComplete) {
      throw new ProviderEnrichmentError(
        "gallery_incomplete",
        "La galería no pudo comprobarse y persistirse de forma completa."
      );
    }
    const uploadPlans = [
      ...(coverPlan ? [coverPlan] : []),
      ...galleryPlans,
    ];
    report.images.storagePathsPlanned = uploadPlans.map(
      ({ document }) => document.storagePath
    );
    const uploadPlansToExecute = [];

    await setStage("storage_path_preflight");
    await timedStage(report, "storagePathPreflight", async () => {
      const plannedPaths = new Set(
        uploadPlans.map((plan) => plan.document.storagePath)
      );
      for (const plan of uploadPlans) {
        const objectInfo = runtime.getObjectInfo
          ? await runtime.getObjectInfo(
              plan.document.storagePath
            )
          : {
              exists: await runtime.objectExists(
                plan.document.storagePath
              ),
              metadata: null,
            };
        if (objectInfo.exists) {
          const resumed = resumableUploadRecord(
            plan,
            objectInfo,
            lifecycle
          );
          if (resumed) {
            reusableUploadPaths.add(
              plan.document.storagePath
            );
            report.images.storagePathsReused.push(
              plan.document.storagePath
            );
            await emitLifecycle(
              lifecycle,
              "storage_object_reused",
              {
                providerId: args.providerId,
                ...resumed,
              }
            );
            continue;
          }
          throw new ProviderEnrichmentError(
            "storage_path_conflict",
            `Ya existe un objeto en ${plan.document.storagePath}.`
          );
        }
        uploadPlansToExecute.push(plan);
      }
      const retainedExistingPaths = new Set([
        ...(completion.cover
          ? [provider.imagenes.portada.storagePath]
          : []),
        ...finalGallery
          .map((image) => image.storagePath)
          .filter((storagePath) => !plannedPaths.has(storagePath)),
      ]);
      for (const storagePath of retainedExistingPaths) {
        const exists = await runtime.objectExists(storagePath);
        if (!exists) {
          throw new ProviderEnrichmentError(
            "existing_storage_object_missing",
            `Firestore referencia un objeto inexistente en ${storagePath}.`
          );
        }
      }
    });
    report.preflight.targetPathsAvailable = true;

    const finalDescription = completion.description
      ? provider.descripcion
      : extraction.description;
    const finalShortDescription = completion.description
      ? provider.descripcionCorta
      : extraction.shortDescription || extraction.description;
    const finalCover = completion.cover
      ? provider.imagenes.portada
      : coverPlan?.document || null;
    const finalImages = {
      portada: finalCover,
      galeria: finalGallery,
    };
    const finalImageCount =
      (finalCover ? 1 : 0) + finalGallery.length;
    const descriptionAdded =
      !completion.description && Boolean(extraction.description);
    const coverAdded =
      !completion.cover && Boolean(coverPlan);
    const galleryChanged =
      shouldRebuildGallery &&
      !galleriesMatch(
        provider.imagenes.galeria,
        finalGallery
      );
    const finalImport = {
      ...provider.importacion,
      descripcionImportada:
        provider.importacion.descripcionImportada === true ||
        descriptionAdded,
      portadaImportada:
        provider.importacion.portadaImportada === true ||
        coverAdded,
      galeriaImportada: report.galleryComplete,
      descripcionEncontrada: Boolean(extraction.description),
      portadaEncontrada: Boolean(extraction.cover),
      galeriaEncontrada: sourceHasGallery,
      cantidadImagenes: finalImageCount,
      ultimoIntentoEn: new Date(importedAt.getTime()),
      ultimoError: null,
      completadaEn: new Date(importedAt.getTime()),
    };
    const update = {
      ...(descriptionAdded
        ? {
            descripcion: finalDescription,
            descripcionCorta: finalShortDescription,
          }
        : {}),
      ...(coverAdded || galleryChanged
        ? { imagenes: finalImages }
        : {}),
      importacion: finalImport,
      actualizadoEn: new Date(importedAt.getTime()),
    };
    contract.assertValidProveedor({
      ...provider,
      ...update,
    });
    report.preflight.completed = true;

    if (
      args.completeGallery &&
      uploadPlans.length === 0 &&
      galleriesMatch(provider.imagenes.galeria, finalGallery) &&
      provider.importacion.galeriaImportada === true &&
      provider.importacion.descripcionEncontrada ===
        finalImport.descripcionEncontrada &&
      provider.importacion.portadaEncontrada ===
        finalImport.portadaEncontrada &&
      provider.importacion.galeriaEncontrada ===
        finalImport.galeriaEncontrada &&
      provider.importacion.completadaEn !== null &&
      provider.importacion.completadaEn !== undefined
    ) {
      report.status = "skipped_gallery_already_complete";
      return report;
    }

    if (!args.apply) {
      report.status = "dry_run_ready";
      return report;
    }

    await setStage("storage_upload", {
      planned: uploadPlansToExecute.length,
      reused: reusableUploadPaths.size,
    });
    await timedStage(report, "storageUpload", async () => {
      for (const plan of uploadPlansToExecute) {
        if (lifecycle.shouldStop?.()) {
          throw new ProviderEnrichmentError(
            "interrupted_before_upload",
            "La ejecución fue interrumpida antes de iniciar una nueva subida."
          );
        }
        await runtime.uploadObject(plan.upload);
        uploadedPaths.push(plan.document.storagePath);
        report.images.storagePathsUploaded.push(
          plan.document.storagePath
        );
        report.images.uploadAttempts += 1;
        report.images.uploaded += 1;
        if (plan.document.tipo === "galeria") {
          report.galleryUploadedCount += 1;
        }
        report.bytes.uploaded += plan.upload.bytes;
        await emitLifecycle(lifecycle, "storage_object_uploaded", {
          providerId: args.providerId,
          storagePath: plan.document.storagePath,
          imageId: plan.document.id,
          hashSha256: plan.upload.hashSha256,
          bytes: plan.upload.bytes,
          executionId: lifecycle.executionId || null,
          uploadedCount: report.images.uploaded,
          plannedCount: uploadPlansToExecute.length,
        });
      }
    });
    await emitLifecycle(lifecycle, "storage_complete", {
      providerId: args.providerId,
      uploadedPaths: [
        ...report.images.storagePathsUploaded,
      ],
      reusedPaths: [
        ...report.images.storagePathsReused,
      ],
    });

    await setStage("temporary_cleanup");
    await timedStage(report, "temporaryCleanup", async () => {
      temporaryDirectoryRemover(temporaryDirectory);
      temporaryDirectory = null;
      report.temporaryFilesRemoved = true;
    });

    await setStage("firestore_commit");
    await timedStage(report, "firestoreCommit", () =>
      runtime.commitProviderUpdate({
        providerId: args.providerId,
        expectedFingerprint:
          providerEnrichmentFingerprint(provider),
        update,
        contract,
      })
    );
    report.firestore.updated = true;
    report.firestore.fieldsUpdated = Object.keys(update);
    await emitLifecycle(lifecycle, "firestore_updated", {
      providerId: args.providerId,
      fieldsUpdated: [...report.firestore.fieldsUpdated],
    });
    report.status = "completed";
    return report;
  } catch (error) {
    if (
      args.apply &&
      uploadedPaths.length > 0 &&
      !lifecycle.preserveUploadsOnFailure
    ) {
      await timedStage(report, "rollback", () =>
        rollbackUploadedObjects(
          report,
          runtime,
          uploadedPaths
        )
      );
      report.images.storagePathsUploaded =
        report.images.storagePathsUploaded.filter(
          (storagePath) =>
            !report.rollback.deletedPaths.includes(storagePath)
        );
      report.images.uploaded =
        report.images.storagePathsUploaded.length;
      report.galleryUploadedCount =
        report.images.storagePathsUploaded.filter((storagePath) =>
          storagePath.includes("/galeria/")
        ).length;
    } else if (
      args.apply &&
      uploadedPaths.length > 0 &&
      lifecycle.preserveUploadsOnFailure
    ) {
      report.rollback.skippedByPolicy = true;
    }
    report.status = "failed";
    report.error = {
      stage,
      code: error.code || "unexpected_error",
      message: sanitizeErrorMessage(error.message),
    };
    report.errors.push(report.error);
    await emitLifecycle(lifecycle, "provider_failed", {
      providerId: args.providerId,
      stage,
      code: error.code || "unexpected_error",
      message: sanitizeErrorMessage(error.message),
      uploadedPaths: [
        ...report.images.storagePathsUploaded,
      ],
      firestoreUpdated: report.firestore.updated,
    });
    return report;
  } finally {
    if (temporaryDirectory) {
      try {
        temporaryDirectoryRemover(temporaryDirectory);
        report.temporaryFilesRemoved = true;
      } catch (error) {
        report.temporaryFilesRemoved = false;
        report.errors.push({
          stage: "temporary_cleanup",
          code: "temporary_cleanup_failed",
          message: sanitizeErrorMessage(error.message),
        });
        if (report.status !== "failed") report.status = "failed";
      }
    } else {
      report.temporaryFilesRemoved = true;
    }
    report.elapsedMs = Math.round(performance.now() - startedAt);
    report.remoteReads = runtime.metrics?.remoteReads || 0;
    report.remoteWrites = runtime.metrics?.remoteWrites || 0;
  }
}

function printHelp() {
  console.log(
    [
      "Dry-run remoto de un único proveedor (sin uploads ni update):",
      "  node scripts/providers/enrichProviders.cjs --dry-run --provider-id=pcar_HEX24 --project=ID --confirm-project=ID --credentials=RUTA [--complete-gallery] [--debug-local] [--max-gallery-images=N]",
      "",
      "Apply explícito de un único proveedor:",
      "  node scripts/providers/enrichProviders.cjs --apply --provider-id=pcar_HEX24 --project=ID --confirm-project=ID --credentials=RUTA [--force] [--complete-gallery] [--max-gallery-images=N]",
      "",
      "Dry-run masivo (sin escrituras; estado opcional y separado):",
      "  node scripts/providers/enrichProviders.cjs --dry-run --limit=10 --concurrency=2 --project=ID --confirm-project=ID --credentials=RUTA [--category=SLUG] [--dry-run-state=RUTA]",
      "",
      "Apply masivo durable:",
      "  node scripts/providers/enrichProviders.cjs --apply --limit=100 --concurrency=2 --project=ID --confirm-project=ID --credentials=RUTA --resume-state=RUTA [--category=SLUG] [--complete-gallery]",
      "",
      "Protección remota: [--request-delay-ms=500] [--max-retries=3] [--timeout-ms=30000] [--stop-after-errors=10] [--pause-on-429]",
      "Lock stale: --recover-stale-lock --confirm-stale-lock=PID",
    ].join("\n")
  );
}

async function run(
  argv = process.argv.slice(2),
  dependencies = {}
) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }
  const contract = loadProviderContract();
  validateArgs(args, contract);
  if (
    !args.providerId ||
    args.resumeState ||
    args.dryRunState
  ) {
    const {
      runMassEnrichment,
    } = require("./providerEnrichmentBulk.cjs");
    let massRuntime = dependencies.runtime;
    try {
      massRuntime =
        massRuntime ||
        (await createFirebaseRuntime(args, {
          fetchImpl: dependencies.managementFetch,
        }));
      return await runMassEnrichment({
        args,
        runtime: massRuntime,
        contract,
        enrichSingleProvider,
        providerEnrichmentFingerprint,
        argv,
        dependencies,
      });
    } finally {
      if (massRuntime?.close && !dependencies.runtime) {
        await massRuntime.close();
      }
    }
  }
  let runtime;
  let report;
  try {
    runtime = dependencies.runtime ||
      (await createFirebaseRuntime(args, {
        fetchImpl: dependencies.managementFetch,
      }));
    report = await enrichSingleProvider({
      args,
      runtime,
      contract,
      pageFetcher: dependencies.pageFetcher,
      pageExtractor: dependencies.pageExtractor,
      imageDownloader: dependencies.imageDownloader,
      now: dependencies.now,
      temporaryDirectoryFactory:
        dependencies.temporaryDirectoryFactory,
      temporaryDirectoryRemover:
        dependencies.temporaryDirectoryRemover,
    });
  } catch (error) {
    report = report || createReport(args);
    report.status = "failed";
    report.errors.push({
      stage: "runtime_initialization",
      code: error.code || "runtime_initialization_failed",
      message: sanitizeErrorMessage(error.message),
    });
    report.firebaseInitialized =
      Boolean(error.firebaseInitialized) ||
      Boolean(runtime);
    report.remoteReads =
      runtime?.metrics?.remoteReads ||
      error.runtimeMetrics?.remoteReads ||
      0;
    report.remoteWrites =
      runtime?.metrics?.remoteWrites ||
      error.runtimeMetrics?.remoteWrites ||
      0;
  } finally {
    if (runtime?.close && !dependencies.runtime) {
      try {
        await runtime.close();
      } catch (error) {
        report = report || createReport(args);
        report.errors.push({
          stage: "runtime_cleanup",
          code: "runtime_cleanup_failed",
          message: sanitizeErrorMessage(error.message),
        });
      }
    }
  }
  const reportPath = writeJsonAtomic(
    args.report || defaultReportPath(args.providerId),
    report
  );
  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        status: report.status,
        providerId: report.providerId,
        descriptionFound: report.description.found,
        imagesFound: report.images.candidatesFound,
        imagesUploaded: report.images.uploaded,
        galleryExpectedCount: report.galleryExpectedCount,
        galleryDetectedCount: report.galleryDetectedCount,
        galleryValidCount: report.galleryValidCount,
        galleryExistingCount: report.galleryExistingCount,
        galleryAddedCount: report.galleryAddedCount,
        galleryComplete: report.galleryComplete,
        extractionSource: report.extractionSource,
        firestoreUpdated: report.firestore.updated,
        remoteReads: report.remoteReads,
        remoteWrites: report.remoteWrites,
        elapsedMs: report.elapsedMs,
        reportPath,
      },
      null,
      2
    )
  );
  return report;
}

if (require.main === module) {
  run()
    .then((report) => {
      if (
        report?.status === "failed" ||
        (report?.execution &&
          !["completed", "paused"].includes(
            report.execution.status
          ))
      ) {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(
        `Provider enrichment failed safely: ${sanitizeErrorMessage(error.message)}`
      );
      process.exitCode = 1;
    });
}

module.exports = {
  createFirebaseRuntime,
  createFirebaseRuntimeForEmulator,
  createFirebaseRuntimeFromClients,
  createImageDocument,
  createReport,
  discoverStorageBucket,
  emitLifecycle,
  enrichSingleProvider,
  existingCompletion,
  existingImageEvidence,
  galleriesMatch,
  parseArgs,
  providerEnrichmentFingerprint,
  resumableUploadRecord,
  rollbackUploadedObjects,
  run,
  sanitizeErrorMessage,
  validateArgs,
  writeDebugArtifacts,
};
