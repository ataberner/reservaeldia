#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const {
  buildCountdownTelemetrySummary,
  collectCountdownObjects,
  getCountdownAliasFields,
  resolveCountdownMigrationSource,
  summarizeCountdownObject,
} = require("../shared/countdownPhase0Contract.cjs");

const INVENTORY_FORMAT = "reservaeldia-countdown-inventory";
const BACKUP_FORMAT = "reservaeldia-countdown-backup";
const FORMAT_VERSION = 1;
const DEFAULT_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ||
  "reservaeldia-7a440.firebasestorage.app";
const REFERENCE_COLLECTIONS = Object.freeze([
  "borradores",
  "plantillas",
]);
const PUBLICATION_COLLECTIONS = Object.freeze([
  "publicadas",
  "publicadas_historial",
]);
const RESTORABLE_COLLECTIONS = new Set([
  "countdownPresets",
  ...REFERENCE_COLLECTIONS,
  ...PUBLICATION_COLLECTIONS,
]);
const COUNTDOWN_ASSET_PREFIX = "assets/countdown/";
const MAX_PARALLEL_READS = 8;

function readDefaultProjectId() {
  try {
    const firebaserc = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../.firebaserc"), "utf8")
    );
    return String(firebaserc?.projects?.default || "").trim();
  } catch {
    return "";
  }
}

function parseArgs(argv) {
  const args = [...argv];
  const command = String(args.shift() || "help").trim().toLowerCase();
  const options = {
    command,
    apply: false,
    overwrite: false,
    stdout: false,
    projectId: "",
    bucketName: "",
    outputPath: "",
    archivePath: "",
    confirmProject: "",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--overwrite") options.overwrite = true;
    else if (arg === "--stdout") options.stdout = true;
    else if (arg === "--project" && next) {
      options.projectId = next;
      index += 1;
    } else if (arg === "--bucket" && next) {
      options.bucketName = next;
      index += 1;
    } else if (arg === "--output" && next) {
      options.outputPath = next;
      index += 1;
    } else if (arg === "--archive" && next) {
      options.archivePath = next;
      index += 1;
    } else if (arg === "--confirm-project" && next) {
      options.confirmProject = next;
      index += 1;
    } else {
      throw new Error(`Argumento desconocido o incompleto: ${arg}`);
    }
  }

  options.projectId =
    String(
      options.projectId ||
        process.env.GCLOUD_PROJECT ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        readDefaultProjectId()
    ).trim();
  options.bucketName = String(options.bucketName || DEFAULT_BUCKET).trim();
  return options;
}

function printHelp() {
  console.log(`
Uso:
  node scripts/countdownPhase0.cjs inventory [--output archivo.json] [--stdout]
  node scripts/countdownPhase0.cjs backup [--output directorio]
  node scripts/countdownPhase0.cjs verify --archive directorio
  node scripts/countdownPhase0.cjs restore --archive directorio [--apply --confirm-project ID] [--overwrite]

Seguridad:
  - inventory y backup realizan solo lecturas sobre Firestore y Storage.
  - restore siempre es dry-run salvo que se indiquen juntos --apply y
    --confirm-project con el proyecto exacto.
  - restore falla ante documentos o assets existentes salvo --overwrite.
  `.trim());
}

function ensureFirebase({ projectId, bucketName }) {
  if (!projectId) {
    throw new Error(
      "No se pudo resolver el proyecto. Usa --project o configura GCLOUD_PROJECT."
    );
  }
  if (!bucketName) {
    throw new Error(
      "No se pudo resolver el bucket. Usa --bucket o FIREBASE_STORAGE_BUCKET."
    );
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
      storageBucket: bucketName,
    });
  }

  return {
    db: admin.firestore(),
    bucket: admin.storage().bucket(bucketName),
    projectId,
    bucketName,
  };
}

function isoNow() {
  return new Date().toISOString();
}

function fileSafeTimestamp(value = isoNow()) {
  return value.replace(/[:.]/g, "-");
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function text(value, maxLength = 500) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function integerOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function increment(counter, key, amount = 1) {
  const safeKey = text(key, 120) || "missing";
  counter[safeKey] = Number(counter[safeKey] || 0) + amount;
}

function sortedCounter(counter) {
  return Object.fromEntries(
    Object.entries(counter).sort(([left], [right]) =>
      left.localeCompare(right)
    )
  );
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map((entry) => stableValue(entry));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])])
  );
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function isTimestamp(value) {
  return (
    value &&
    typeof value === "object" &&
    Number.isInteger(value.seconds) &&
    Number.isInteger(value.nanoseconds) &&
    typeof value.toDate === "function"
  );
}

function isGeoPoint(value) {
  return (
    value &&
    typeof value === "object" &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    value.constructor?.name === "GeoPoint"
  );
}

function isDocumentReference(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.path === "string" &&
    value.firestore
  );
}

function isBytes(value) {
  return (
    Buffer.isBuffer(value) ||
    (value &&
      typeof value === "object" &&
      typeof value.toBase64 === "function")
  );
}

function encodeFirestoreValue(value) {
  if (isTimestamp(value)) {
    return {
      __firestoreType: "timestamp",
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  }
  if (isGeoPoint(value)) {
    return {
      __firestoreType: "geopoint",
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }
  if (isDocumentReference(value)) {
    return {
      __firestoreType: "reference",
      path: value.path,
    };
  }
  if (isBytes(value)) {
    const buffer = Buffer.isBuffer(value)
      ? value
      : Buffer.from(value.toBase64(), "base64");
    return {
      __firestoreType: "bytes",
      base64: buffer.toString("base64"),
    };
  }
  if (value instanceof Date) {
    return {
      __firestoreType: "date",
      iso: value.toISOString(),
    };
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return {
      __firestoreType: "number",
      value: String(value),
    };
  }
  if (Array.isArray(value)) {
    return value.map((entry) => encodeFirestoreValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        encodeFirestoreValue(entry),
      ])
    );
  }
  return value;
}

function decodeFirestoreValue(value, firestore) {
  if (Array.isArray(value)) {
    return value.map((entry) => decodeFirestoreValue(entry, firestore));
  }
  if (!value || typeof value !== "object") return value;

  if (value.__firestoreType === "timestamp") {
    return new admin.firestore.Timestamp(
      Number(value.seconds),
      Number(value.nanoseconds)
    );
  }
  if (value.__firestoreType === "geopoint") {
    return new admin.firestore.GeoPoint(
      Number(value.latitude),
      Number(value.longitude)
    );
  }
  if (value.__firestoreType === "reference") {
    return firestore.doc(String(value.path || ""));
  }
  if (value.__firestoreType === "bytes") {
    return Buffer.from(String(value.base64 || ""), "base64");
  }
  if (value.__firestoreType === "date") {
    return new Date(String(value.iso || ""));
  }
  if (value.__firestoreType === "number") {
    const numericValue = String(value.value || "");
    if (numericValue === "NaN") return Number.NaN;
    if (numericValue === "Infinity") return Number.POSITIVE_INFINITY;
    if (numericValue === "-Infinity") return Number.NEGATIVE_INFINITY;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      decodeFirestoreValue(entry, firestore),
    ])
  );
}

function serializeSnapshot(snapshot) {
  return {
    path: snapshot.ref.path,
    data: encodeFirestoreValue(snapshot.data() || {}),
    createTime: snapshot.createTime?.toDate?.().toISOString() || null,
    updateTime: snapshot.updateTime?.toDate?.().toISOString() || null,
    readTime: snapshot.readTime?.toDate?.().toISOString() || null,
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.max(
    1,
    Math.min(Number(concurrency) || 1, items.length || 1)
  );
  await Promise.all(
    Array.from({ length: workerCount }, () => worker())
  );
  return results;
}

function summarizeReferenceDocument(collectionName, snapshot) {
  const data = snapshot.data() || {};
  const entries = collectCountdownObjects(data);
  if (!entries.length) return null;

  const presetReferences = {};
  const pathSummaries = entries.map(({ countdown, path: objectPath }) => {
    const objectSummary = summarizeCountdownObject(countdown);
    const presetId = text(countdown.presetId, 160) || null;
    const presetVersion = integerOrNull(countdown.presetVersion);
    if (presetId) {
      increment(
        presetReferences,
        `${presetId}@${presetVersion === null ? "missing" : presetVersion}`
      );
    }
    return {
      objectPath,
      countdownSchemaVersion: objectSummary.countdownSchemaVersion,
      presetId,
      presetVersion,
      aliases: getCountdownAliasFields(countdown),
      migrationSource: objectSummary.migrationSource,
      legacyBranchUsed: objectSummary.legacyBranchUsed,
      hasFrameAsset: objectSummary.hasFrameAsset,
    };
  });

  return {
    collection: collectionName,
    documentId: snapshot.id,
    documentPath: snapshot.ref.path,
    countdownCount: entries.length,
    telemetrySummary: buildCountdownTelemetrySummary(data, {
      renderer: "inventory",
    }),
    presetReferences: sortedCounter(presetReferences),
    countdowns: pathSummaries,
  };
}

function summarizePreset(rootSnapshot, versionSnapshots) {
  const data = rootSnapshot.data() || {};
  const metadata = asObject(data.metadata);
  const draft = asObject(data.draft);
  const publishedVersions = versionSnapshots.map((snapshot) => {
    const versionData = snapshot.data() || {};
    const versionMetadata = asObject(versionData.metadata);
    return {
      documentPath: snapshot.ref.path,
      version:
        integerOrNull(versionData.version) ||
        integerOrNull(snapshot.id) ||
        null,
      schemaVersion: integerOrNull(versionMetadata.schemaVersion),
      renderContractVersion: integerOrNull(
        versionMetadata.renderContractVersion
      ),
      migrationSource:
        resolveCountdownMigrationSource(versionData) ||
        text(versionMetadata.migrationSource, 80) ||
        null,
      svgStoragePath:
        text(asObject(versionData.svgRef).storagePath, 600) || null,
      thumbnailPath:
        text(asObject(versionData.svgRef).thumbnailPath, 600) || null,
    };
  });

  return {
    id: rootSnapshot.id,
    documentPath: rootSnapshot.ref.path,
    estado: text(data.estado, 40) || null,
    activeVersion: integerOrNull(data.activeVersion),
    draftVersion: integerOrNull(data.draftVersion),
    hasDraft: Object.keys(draft).length > 0,
    schemaVersion: integerOrNull(metadata.schemaVersion),
    renderContractVersion: integerOrNull(metadata.renderContractVersion),
    migrationSource:
      resolveCountdownMigrationSource(data) ||
      text(metadata.migrationSource, 80) ||
      null,
    legacyPresetPropsPresent: Object.keys(
      asObject(data.legacyPresetProps)
    ).length > 0,
    rootSvgStoragePath:
      text(asObject(data.svgRef).storagePath, 600) || null,
    rootThumbnailPath:
      text(asObject(data.svgRef).thumbnailPath, 600) || null,
    draftSvgStoragePath:
      text(asObject(draft.svgRef).storagePath, 600) || null,
    draftThumbnailPath:
      text(asObject(draft.svgRef).thumbnailPath, 600) || null,
    publishedVersions,
  };
}

async function readStorageFileSummary(file, includeBytes = false) {
  const [exists] = await file.exists();
  if (!exists) return null;
  const [metadata] = await file.getMetadata();
  const summary = {
    path: file.name,
    size: Number(metadata.size || 0),
    contentType: text(metadata.contentType, 160) || null,
    generation: text(metadata.generation, 80) || null,
    metageneration: text(metadata.metageneration, 80) || null,
    md5Hash: text(metadata.md5Hash, 200) || null,
    crc32c: text(metadata.crc32c, 200) || null,
    cacheControl: text(metadata.cacheControl, 300) || null,
    updated: text(metadata.updated, 100) || null,
  };
  if (!includeBytes) return summary;
  const [bytes] = await file.download();
  return {
    ...summary,
    bytes,
    sha256: sha256(bytes),
    metadata,
  };
}

function countHtmlCountdownRoots(html) {
  return (String(html || "").match(/\sdata-countdown(?:\s|=|>)/g) || [])
    .length;
}

async function inspectPublicationArtifact(bucket, collectionName, snapshot) {
  const data = snapshot.data() || {};
  const slug =
    text(data.slug, 220) ||
    (collectionName === "publicadas" ? snapshot.id : "");
  const linkedDraftSlug =
    text(data.borradorSlug, 220) ||
    text(data.slugOriginal, 220) ||
    null;

  if (!slug) {
    return {
      collection: collectionName,
      documentId: snapshot.id,
      documentPath: snapshot.ref.path,
      slug: null,
      linkedDraftSlug,
      artifactPath: null,
      artifactExists: false,
      countdownRootCount: 0,
    };
  }

  const artifactPath = `publicadas/${slug}/index.html`;
  const file = bucket.file(artifactPath);
  const [exists] = await file.exists();
  if (!exists) {
    return {
      collection: collectionName,
      documentId: snapshot.id,
      documentPath: snapshot.ref.path,
      slug,
      linkedDraftSlug,
      artifactPath,
      artifactExists: false,
      countdownRootCount: 0,
    };
  }

  const [bytes] = await file.download();
  return {
    collection: collectionName,
    documentId: snapshot.id,
    documentPath: snapshot.ref.path,
    slug,
    linkedDraftSlug,
    artifactPath,
    artifactExists: true,
    countdownRootCount: countHtmlCountdownRoots(bytes.toString("utf8")),
  };
}

async function collectPhase0Source(runtime) {
  const { db, bucket } = runtime;
  const presetSnapshot = await db.collection("countdownPresets").get();
  const presetRecords = await mapWithConcurrency(
    presetSnapshot.docs,
    MAX_PARALLEL_READS,
    async (rootSnapshot) => {
      const versionsSnapshot = await rootSnapshot.ref
        .collection("versions")
        .get();
      return {
        rootSnapshot,
        versionSnapshots: versionsSnapshot.docs,
        summary: summarizePreset(rootSnapshot, versionsSnapshot.docs),
      };
    }
  );

  const referenceCollections = {};
  const referenceSummaries = [];
  for (const collectionName of REFERENCE_COLLECTIONS) {
    const snapshot = await db.collection(collectionName).get();
    referenceCollections[collectionName] = snapshot.docs;
    snapshot.docs.forEach((documentSnapshot) => {
      const summary = summarizeReferenceDocument(
        collectionName,
        documentSnapshot
      );
      if (summary) referenceSummaries.push(summary);
    });
  }

  const publicationCollections = {};
  const publicationSnapshots = [];
  for (const collectionName of PUBLICATION_COLLECTIONS) {
    const snapshot = await db.collection(collectionName).get();
    publicationCollections[collectionName] = snapshot.docs;
    snapshot.docs.forEach((documentSnapshot) => {
      publicationSnapshots.push({ collectionName, documentSnapshot });
    });
  }

  const publicationArtifacts = await mapWithConcurrency(
    publicationSnapshots,
    MAX_PARALLEL_READS,
    ({ collectionName, documentSnapshot }) =>
      inspectPublicationArtifact(bucket, collectionName, documentSnapshot)
  );

  const [countdownAssetFiles] = await bucket.getFiles({
    prefix: COUNTDOWN_ASSET_PREFIX,
  });
  const countdownAssets = await mapWithConcurrency(
    countdownAssetFiles,
    MAX_PARALLEL_READS,
    (file) => readStorageFileSummary(file)
  );

  return {
    presetRecords,
    referenceCollections,
    referenceSummaries,
    publicationCollections,
    publicationArtifacts,
    countdownAssets: countdownAssets.filter(Boolean),
  };
}

function buildInventory(runtime, source) {
  const presetIds = new Set(
    source.presetRecords.map((record) => record.rootSnapshot.id)
  );
  const assetPaths = new Set(
    source.countdownAssets.map((asset) => asset.path)
  );
  const referencedPresetIds = new Set();
  const risks = [];

  source.referenceSummaries.forEach((reference) => {
    Object.keys(reference.presetReferences).forEach((key) => {
      const presetId = key.split("@")[0];
      referencedPresetIds.add(presetId);
      if (!presetIds.has(presetId)) {
        risks.push({
          code: "referenced-preset-missing",
          documentPath: reference.documentPath,
          presetId,
        });
      }
    });
  });

  source.presetRecords.forEach((record) => {
    const preset = record.summary;
    const publishedVersionIds = new Set(
      preset.publishedVersions
        .map((version) => version.version)
        .filter((version) => version !== null)
    );
    if (
      Number(preset.activeVersion || 0) > 0 &&
      !publishedVersionIds.has(preset.activeVersion)
    ) {
      risks.push({
        code: "active-version-document-missing",
        presetId: preset.id,
        activeVersion: preset.activeVersion,
      });
    }

    [
      preset.rootSvgStoragePath,
      preset.rootThumbnailPath,
      preset.draftSvgStoragePath,
      preset.draftThumbnailPath,
      ...preset.publishedVersions.flatMap((version) => [
        version.svgStoragePath,
        version.thumbnailPath,
      ]),
    ]
      .filter(Boolean)
      .forEach((storagePath) => {
        if (!assetPaths.has(storagePath)) {
          risks.push({
            code: "referenced-asset-missing",
            presetId: preset.id,
            storagePath,
          });
        }
      });
  });

  const publicationReferences = source.publicationArtifacts.filter(
    (item) =>
      item.countdownRootCount > 0 ||
      source.referenceSummaries.some(
        (reference) =>
          reference.collection === "borradores" &&
          reference.documentId === item.linkedDraftSlug
      )
  );

  const summary = {
    presetCount: source.presetRecords.length,
    activePresetCount: source.presetRecords.filter(
      (record) => Number(record.summary.activeVersion || 0) > 0
    ).length,
    presetDraftCount: source.presetRecords.filter(
      (record) => record.summary.hasDraft
    ).length,
    publishedPresetVersionCount: source.presetRecords.reduce(
      (total, record) => total + record.summary.publishedVersions.length,
      0
    ),
    legacyAliasReferenceCount: source.referenceSummaries.reduce(
      (total, reference) =>
        total +
        Number(reference.telemetrySummary.aliasUsageCounts.targetISO || 0) +
        Number(reference.telemetrySummary.aliasUsageCounts.fechaISO || 0),
      0
    ),
    legacyBranchReferenceCount: source.referenceSummaries.reduce(
      (total, reference) =>
        total + Number(reference.telemetrySummary.legacyBranchCount || 0),
      0
    ),
    countdownReferenceDocumentCount: source.referenceSummaries.length,
    countdownObjectCount: source.referenceSummaries.reduce(
      (total, reference) => total + reference.countdownCount,
      0
    ),
    publishedInvitationReferenceCount: publicationReferences.length,
    countdownStorageAssetCount: source.countdownAssets.length,
    referencedPresetCount: referencedPresetIds.size,
    riskCount: risks.length,
  };

  return {
    format: INVENTORY_FORMAT,
    formatVersion: FORMAT_VERSION,
    generatedAt: isoNow(),
    readOnly: true,
    source: {
      projectId: runtime.projectId,
      bucketName: runtime.bucketName,
    },
    summary,
    presets: source.presetRecords.map((record) => record.summary),
    references: source.referenceSummaries,
    publishedInvitationReferences: publicationReferences,
    assets: source.countdownAssets,
    risks,
  };
}

function inventoryOutputPath(options, generatedAt) {
  if (options.outputPath) return path.resolve(options.outputPath);
  return path.resolve(
    __dirname,
    "../artifacts/countdown-phase0/runtime",
    `inventory-${fileSafeTimestamp(generatedAt)}.json`
  );
}

async function runInventory(options) {
  const runtime = ensureFirebase(options);
  const source = await collectPhase0Source(runtime);
  const inventory = buildInventory(runtime, source);
  const outputPath = inventoryOutputPath(options, inventory.generatedAt);
  writeJson(outputPath, inventory);

  if (options.stdout) {
    console.log(JSON.stringify(inventory, null, 2));
  } else {
    console.log(JSON.stringify(inventory.summary, null, 2));
  }
  console.log(`Inventario read-only guardado en ${outputPath}`);
  return { runtime, source, inventory, outputPath };
}

function backupOutputPath(options, generatedAt) {
  if (options.outputPath) return path.resolve(options.outputPath);
  return path.resolve(
    __dirname,
    "../artifacts/countdown-phase0/runtime/backups",
    `countdown-backup-${fileSafeTimestamp(generatedAt)}`
  );
}

function selectBackupDocumentSnapshots(source) {
  const snapshotsByPath = new Map();
  const add = (snapshot) => snapshotsByPath.set(snapshot.ref.path, snapshot);

  source.presetRecords.forEach(({ rootSnapshot, versionSnapshots }) => {
    add(rootSnapshot);
    versionSnapshots.forEach(add);
  });

  const countdownReferenceIds = new Set();
  source.referenceSummaries.forEach((reference) => {
    countdownReferenceIds.add(`${reference.collection}/${reference.documentId}`);
  });
  REFERENCE_COLLECTIONS.forEach((collectionName) => {
    (source.referenceCollections[collectionName] || []).forEach((snapshot) => {
      if (countdownReferenceIds.has(snapshot.ref.path)) add(snapshot);
    });
  });

  const publicationPaths = new Set(
    source.publicationArtifacts
      .filter(
        (artifact) =>
          artifact.countdownRootCount > 0 ||
          countdownReferenceIds.has(`borradores/${artifact.linkedDraftSlug}`)
      )
      .map((artifact) => artifact.documentPath)
  );
  PUBLICATION_COLLECTIONS.forEach((collectionName) => {
    (source.publicationCollections[collectionName] || []).forEach((snapshot) => {
      if (publicationPaths.has(snapshot.ref.path)) add(snapshot);
    });
  });

  return Array.from(snapshotsByPath.values()).sort((left, right) =>
    left.ref.path.localeCompare(right.ref.path)
  );
}

async function selectBackupStorageFiles(runtime, source) {
  const filesByPath = new Map();
  source.countdownAssets.forEach((asset) => {
    filesByPath.set(asset.path, runtime.bucket.file(asset.path));
  });

  const publicationPrefixes = new Set(
    source.publicationArtifacts
      .filter((artifact) => artifact.countdownRootCount > 0 && artifact.slug)
      .map((artifact) => `publicadas/${artifact.slug}/`)
  );

  for (const prefix of publicationPrefixes) {
    const [files] = await runtime.bucket.getFiles({ prefix });
    files.forEach((file) => filesByPath.set(file.name, file));
  }

  return Array.from(filesByPath.values()).sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

function buildManifestIntegrity(manifestWithoutIntegrity) {
  return {
    algorithm: "sha256",
    manifestSha256: sha256(stableStringify(manifestWithoutIntegrity)),
  };
}

async function runBackup(options) {
  const runtime = ensureFirebase(options);
  const source = await collectPhase0Source(runtime);
  const inventory = buildInventory(runtime, source);
  const generatedAt = isoNow();
  const outputDirectory = backupOutputPath(options, generatedAt);
  const filesDirectory = path.join(outputDirectory, "files");
  ensureDirectory(filesDirectory);

  const documentSnapshots = selectBackupDocumentSnapshots(source);
  const storageFiles = await selectBackupStorageFiles(runtime, source);
  const archivedFilesByHash = new Map();
  const assets = [];

  for (const file of storageFiles) {
    const fileSummary = await readStorageFileSummary(file, true);
    if (!fileSummary) continue;
    const archiveRelativePath = `files/${fileSummary.sha256}`;
    const archiveAbsolutePath = path.join(
      outputDirectory,
      ...archiveRelativePath.split("/")
    );
    if (!archivedFilesByHash.has(fileSummary.sha256)) {
      fs.writeFileSync(archiveAbsolutePath, fileSummary.bytes);
      archivedFilesByHash.set(fileSummary.sha256, archiveRelativePath);
    }

    assets.push({
      path: fileSummary.path,
      archivePath: archiveRelativePath,
      sha256: fileSummary.sha256,
      size: fileSummary.size,
      metadata: {
        contentType: fileSummary.metadata.contentType || null,
        cacheControl: fileSummary.metadata.cacheControl || null,
        contentDisposition: fileSummary.metadata.contentDisposition || null,
        contentEncoding: fileSummary.metadata.contentEncoding || null,
        contentLanguage: fileSummary.metadata.contentLanguage || null,
        metadata: fileSummary.metadata.metadata || {},
      },
      sourceMetadata: {
        generation: fileSummary.generation,
        metageneration: fileSummary.metageneration,
        md5Hash: fileSummary.md5Hash,
        crc32c: fileSummary.crc32c,
        updated: fileSummary.updated,
      },
    });
  }

  const manifestWithoutIntegrity = {
    format: BACKUP_FORMAT,
    formatVersion: FORMAT_VERSION,
    generatedAt,
    source: {
      projectId: runtime.projectId,
      bucketName: runtime.bucketName,
    },
    scope: {
      firestoreDocuments: documentSnapshots.length,
      storageAssets: assets.length,
      collections: Array.from(
        new Set(
          documentSnapshots.map((snapshot) => snapshot.ref.path.split("/")[0])
        )
      ).sort(),
    },
    inventory,
    documents: documentSnapshots.map(serializeSnapshot),
    assets,
  };
  const manifest = {
    ...manifestWithoutIntegrity,
    integrity: buildManifestIntegrity(manifestWithoutIntegrity),
  };
  writeJson(path.join(outputDirectory, "manifest.json"), manifest);

  const verification = verifyBackupDirectory(outputDirectory);
  console.log(
    JSON.stringify(
      {
        outputDirectory,
        firestoreDocuments: manifest.documents.length,
        storageAssets: manifest.assets.length,
        verification,
      },
      null,
      2
    )
  );
  return { outputDirectory, manifest, verification };
}

function readBackupManifest(archiveDirectory) {
  const manifestPath = path.join(archiveDirectory, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No existe manifest.json en ${archiveDirectory}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (
    manifest.format !== BACKUP_FORMAT ||
    manifest.formatVersion !== FORMAT_VERSION
  ) {
    throw new Error("Formato de backup de countdown no soportado.");
  }
  return manifest;
}

function verifyBackupDirectory(archiveDirectory) {
  const resolvedDirectory = path.resolve(archiveDirectory);
  const manifest = readBackupManifest(resolvedDirectory);
  const { integrity, ...manifestWithoutIntegrity } = manifest;
  const expectedManifestHash = sha256(
    stableStringify(manifestWithoutIntegrity)
  );
  const errors = [];

  if (integrity?.manifestSha256 !== expectedManifestHash) {
    errors.push("manifest-sha256-mismatch");
  }

  (manifest.assets || []).forEach((asset) => {
    const archivePath = path.resolve(
      resolvedDirectory,
      ...String(asset.archivePath || "").split("/")
    );
    const relative = path.relative(resolvedDirectory, archivePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      errors.push(`asset-path-outside-archive:${asset.path}`);
      return;
    }
    if (!fs.existsSync(archivePath)) {
      errors.push(`asset-file-missing:${asset.path}`);
      return;
    }
    const bytes = fs.readFileSync(archivePath);
    if (sha256(bytes) !== asset.sha256) {
      errors.push(`asset-sha256-mismatch:${asset.path}`);
    }
    if (bytes.length !== Number(asset.size || 0)) {
      errors.push(`asset-size-mismatch:${asset.path}`);
    }
  });

  return {
    valid: errors.length === 0,
    manifestSha256: expectedManifestHash,
    documentCount: Array.isArray(manifest.documents)
      ? manifest.documents.length
      : 0,
    assetCount: Array.isArray(manifest.assets) ? manifest.assets.length : 0,
    errors,
  };
}

function assertRestorableDocumentPath(documentPath) {
  const parts = String(documentPath || "").split("/").filter(Boolean);
  if (parts.length === 2 && RESTORABLE_COLLECTIONS.has(parts[0])) return;
  if (
    parts.length === 4 &&
    parts[0] === "countdownPresets" &&
    parts[2] === "versions"
  ) {
    return;
  }
  throw new Error(`Ruta Firestore fuera del alcance de restore: ${documentPath}`);
}

function assertRestorableAssetPath(assetPath) {
  const safePath = String(assetPath || "").trim();
  if (
    safePath.startsWith(COUNTDOWN_ASSET_PREFIX) ||
    /^publicadas\/[^/]+\/[^/]+$/.test(safePath)
  ) {
    return;
  }
  throw new Error(`Ruta Storage fuera del alcance de restore: ${assetPath}`);
}

async function buildRestorePlan(runtime, manifest) {
  const documents = Array.isArray(manifest.documents)
    ? manifest.documents
    : [];
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  documents.forEach((document) =>
    assertRestorableDocumentPath(document.path)
  );
  assets.forEach((asset) => assertRestorableAssetPath(asset.path));

  const documentExistence = await mapWithConcurrency(
    documents,
    MAX_PARALLEL_READS,
    async (document) => ({
      path: document.path,
      exists: (await runtime.db.doc(document.path).get()).exists,
    })
  );
  const assetExistence = await mapWithConcurrency(
    assets,
    MAX_PARALLEL_READS,
    async (asset) => ({
      path: asset.path,
      exists: (await runtime.bucket.file(asset.path).exists())[0],
    })
  );

  return {
    documents: documentExistence,
    assets: assetExistence,
    existingDocumentCount: documentExistence.filter((item) => item.exists)
      .length,
    existingAssetCount: assetExistence.filter((item) => item.exists).length,
  };
}

async function restoreAssets(runtime, archiveDirectory, assets) {
  for (const asset of assets) {
    const archivePath = path.resolve(
      archiveDirectory,
      ...String(asset.archivePath || "").split("/")
    );
    const bytes = fs.readFileSync(archivePath);
    await runtime.bucket.file(asset.path).save(bytes, {
      resumable: false,
      validation: "crc32c",
      metadata: {
        contentType: asset.metadata?.contentType || undefined,
        cacheControl: asset.metadata?.cacheControl || undefined,
        contentDisposition: asset.metadata?.contentDisposition || undefined,
        contentEncoding: asset.metadata?.contentEncoding || undefined,
        contentLanguage: asset.metadata?.contentLanguage || undefined,
        metadata: asObject(asset.metadata?.metadata),
      },
    });
  }
}

async function restoreDocuments(runtime, documents) {
  const CHUNK_SIZE = 400;
  for (let index = 0; index < documents.length; index += CHUNK_SIZE) {
    const batch = runtime.db.batch();
    documents.slice(index, index + CHUNK_SIZE).forEach((document) => {
      batch.set(
        runtime.db.doc(document.path),
        decodeFirestoreValue(document.data, runtime.db),
        { merge: false }
      );
    });
    await batch.commit();
  }
}

async function runRestore(options) {
  if (!options.archivePath) {
    throw new Error("restore requiere --archive directorio.");
  }
  const archiveDirectory = path.resolve(options.archivePath);
  const verification = verifyBackupDirectory(archiveDirectory);
  if (!verification.valid) {
    throw new Error(
      `El backup no supera verificacion: ${verification.errors.join(", ")}`
    );
  }
  const manifest = readBackupManifest(archiveDirectory);
  const projectId = options.projectId || manifest.source?.projectId;
  const bucketName = options.bucketName || manifest.source?.bucketName;
  const runtime = ensureFirebase({ ...options, projectId, bucketName });

  if (runtime.projectId !== manifest.source?.projectId) {
    throw new Error(
      `El backup pertenece a ${manifest.source?.projectId}; destino solicitado: ${runtime.projectId}.`
    );
  }

  const plan = await buildRestorePlan(runtime, manifest);
  console.log(
    JSON.stringify(
      {
        mode: options.apply ? "apply" : "dry-run",
        overwrite: options.overwrite,
        projectId: runtime.projectId,
        bucketName: runtime.bucketName,
        verification,
        plan: {
          documentCount: plan.documents.length,
          assetCount: plan.assets.length,
          existingDocumentCount: plan.existingDocumentCount,
          existingAssetCount: plan.existingAssetCount,
        },
      },
      null,
      2
    )
  );

  if (!options.apply) {
    console.log("Dry-run completado. No se modifico Firestore ni Storage.");
    return { applied: false, plan, verification };
  }
  if (options.confirmProject !== runtime.projectId) {
    throw new Error(
      `Para aplicar restore debes pasar --confirm-project ${runtime.projectId}.`
    );
  }
  if (
    !options.overwrite &&
    (plan.existingDocumentCount > 0 || plan.existingAssetCount > 0)
  ) {
    throw new Error(
      "El destino contiene documentos o assets. Revisa el plan y usa --overwrite solo para una restauracion autorizada."
    );
  }

  await restoreAssets(runtime, archiveDirectory, manifest.assets || []);
  await restoreDocuments(runtime, manifest.documents || []);
  console.log("Restore de countdown aplicado y verificado localmente.");
  return { applied: true, plan, verification };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "help" || options.command === "--help") {
    printHelp();
    return;
  }
  if (options.command === "inventory") {
    await runInventory(options);
    return;
  }
  if (options.command === "backup") {
    await runBackup(options);
    return;
  }
  if (options.command === "verify") {
    if (!options.archivePath) {
      throw new Error("verify requiere --archive directorio.");
    }
    const result = verifyBackupDirectory(path.resolve(options.archivePath));
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
    return;
  }
  if (options.command === "restore") {
    await runRestore(options);
    return;
  }
  throw new Error(`Comando desconocido: ${options.command}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = {
  BACKUP_FORMAT,
  FORMAT_VERSION,
  INVENTORY_FORMAT,
  assertRestorableAssetPath,
  assertRestorableDocumentPath,
  buildInventory,
  buildManifestIntegrity,
  countHtmlCountdownRoots,
  decodeFirestoreValue,
  encodeFirestoreValue,
  parseArgs,
  stableStringify,
  summarizeReferenceDocument,
  verifyBackupDirectory,
};
