#!/usr/bin/env node
"use strict";

const path = require("path");
const {
  loadProviderContract,
  writeJsonAtomic,
} = require("./analyzeProviderJson.cjs");

let importerAuthority = null;

function loadImporterAuthority() {
  if (!importerAuthority) {
    importerAuthority = require("./importProviders.cjs");
  }
  return importerAuthority;
}

const EXPECTED_CATEGORY_COUNT = 24;
const CATEGORY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXCLUDED_CATEGORY_IDS = Object.freeze([
  "novios",
  "novias",
  "experiencias-adicionales",
  "bodas-playa",
  "recepciones-quintas-hoteles-estancias-playa",
]);
const MANAGED_CATEGORY_FIELDS = Object.freeze([
  "nombre",
  "slug",
  "descripcion",
  "activa",
  "orden",
  "icono",
  "categoriaPadreId",
]);
const CATEGORY_DOCUMENT_FIELDS = Object.freeze([
  ...MANAGED_CATEGORY_FIELDS,
  "creadoEn",
  "actualizadoEn",
]);

function parseArgs(argv) {
  const args = {
    apply: false,
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

function validateApplyConfiguration(args) {
  if (!args.apply) return;
  if (!args.project) {
    throw new Error("--apply requiere --project=ID explícito.");
  }
  if (!args.confirmProject) {
    throw new Error("--apply requiere --confirm-project=ID explícito.");
  }
  if (args.project !== args.confirmProject) {
    throw new Error(
      "--project y --confirm-project deben coincidir exactamente."
    );
  }
  if (!args.credentials) {
    throw new Error("--apply requiere --credentials=RUTA explícito.");
  }
}

function loadCategoryManifest() {
  const contract = loadProviderContract();
  return {
    contract,
    manifest: contract.PROVIDER_CATEGORY_CATALOG,
  };
}

function buildCategoryDocument(entry, timestamp = new Date()) {
  const createdAt = new Date(timestamp.getTime());
  const updatedAt = new Date(timestamp.getTime());
  return {
    nombre: entry.nombre,
    slug: entry.slug,
    descripcion: entry.descripcion,
    activa: entry.activa,
    orden: entry.orden,
    icono: entry.icono,
    categoriaPadreId: entry.categoriaPadreId,
    creadoEn: createdAt,
    actualizadoEn: updatedAt,
  };
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function validateManifest(manifest, contract) {
  const issues = [];
  if (!Array.isArray(manifest)) {
    throw new Error("El manifiesto de categorías debe ser un array.");
  }

  const documentIds = manifest.map((entry) => entry.documentId);
  const slugs = manifest.map((entry) => entry.slug);
  const orders = manifest.map((entry) => entry.orden);
  const duplicateDocumentIds = duplicateValues(documentIds);
  const duplicateSlugs = duplicateValues(slugs);
  const duplicateOrders = duplicateValues(orders);

  if (manifest.length !== EXPECTED_CATEGORY_COUNT) {
    issues.push(
      `Se esperaban ${EXPECTED_CATEGORY_COUNT} categorías y se encontraron ${manifest.length}.`
    );
  }
  if (duplicateDocumentIds.length > 0) {
    issues.push(
      `IDs duplicados: ${duplicateDocumentIds.join(", ")}.`
    );
  }
  if (duplicateSlugs.length > 0) {
    issues.push(`Slugs duplicados: ${duplicateSlugs.join(", ")}.`);
  }
  if (duplicateOrders.length > 0) {
    issues.push(`Órdenes duplicados: ${duplicateOrders.join(", ")}.`);
  }

  const excludedPresent = documentIds.filter((documentId) =>
    EXCLUDED_CATEGORY_IDS.includes(documentId)
  );
  if (excludedPresent.length > 0) {
    issues.push(
      `Categorías excluidas presentes: ${excludedPresent.join(", ")}.`
    );
  }

  manifest.forEach((entry, index) => {
    const label = `manifest[${index}]`;
    if (
      typeof entry.documentId !== "string" ||
      !CATEGORY_ID_PATTERN.test(entry.documentId)
    ) {
      issues.push(`${label}.documentId no es un ID válido.`);
    }
    if (entry.slug !== entry.documentId) {
      issues.push(`${label}.slug debe coincidir con documentId.`);
    }
    if (
      typeof entry.nombre !== "string" ||
      entry.nombre.trim().length === 0
    ) {
      issues.push(`${label}.nombre debe ser no vacío.`);
    }
    if (!Number.isInteger(entry.orden) || entry.orden < 0) {
      issues.push(`${label}.orden debe ser un entero no negativo.`);
    }
    try {
      contract.assertValidCategoriaProveedor(
        buildCategoryDocument(entry, new Date("2026-01-01T00:00:00.000Z"))
      );
    } catch (error) {
      issues.push(`${label}: ${error.message}`);
    }
  });

  const internalCategoryIds = new Set(
    Object.values(contract.PROVIDER_CATEGORY_MAP).map(
      (mapping) => mapping.categoriaId
    )
  );
  const manifestIds = new Set(documentIds);
  const mappingIdsMissingFromManifest = [...internalCategoryIds]
    .filter((categoryId) => !manifestIds.has(categoryId))
    .sort();
  const manifestIdsMissingFromMappings = [...manifestIds]
    .filter((categoryId) => !internalCategoryIds.has(categoryId))
    .sort();
  if (mappingIdsMissingFromManifest.length > 0) {
    issues.push(
      "IDs internos del mapa ausentes del manifiesto: " +
        `${mappingIdsMissingFromManifest.join(", ")}.`
    );
  }
  if (manifestIdsMissingFromMappings.length > 0) {
    issues.push(
      "IDs del manifiesto ausentes del mapa interno: " +
        `${manifestIdsMissingFromMappings.join(", ")}.`
    );
  }

  if (issues.length > 0) {
    const error = new Error(
      `Manifiesto de categorías inválido: ${issues.join(" ")}`
    );
    error.manifestValidationFailure = {
      issues,
      duplicateDocumentIds,
      duplicateSlugs,
      duplicateOrders,
      batchCommitted: false,
      remoteWrites: 0,
    };
    throw error;
  }

  return {
    status: "passed",
    planned: manifest.length,
    duplicateDocumentIds,
    duplicateSlugs,
    duplicateOrders,
    excludedCategoryIdsPresent: [],
  };
}

function reportableManifestEntry(entry) {
  return {
    documentId: entry.documentId,
    nombre: entry.nombre,
    slug: entry.slug,
    descripcion: entry.descripcion,
    activa: entry.activa,
    orden: entry.orden,
    icono: entry.icono,
    categoriaPadreId: entry.categoriaPadreId,
  };
}

function createBaseReport({
  args,
  manifest,
  manifestValidation,
}) {
  return {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: args.apply
      ? "apply_provider_category_seed"
      : "dry_run_local_only",
    status: args.apply ? "pending_remote_preflight" : "planned",
    projectId: args.apply ? args.project : null,
    manifestValidation,
    timestampStrategy: {
      writeType: "native Date",
      readType: "Firestore Timestamp",
      fieldPaths: ["creadoEn", "actualizadoEn"],
    },
    planned: manifest.map(reportableManifestEntry),
    missing: [],
    compatibleExisting: [],
    conflicts: [],
    created: [],
    skipped: [],
    referenceVerification: {
      performed: false,
      referencedExistingInManifest: [],
      referencedMissingFromManifest: [],
      manifestWithoutProviders: [],
      invalidReferenceValues: 0,
    },
    preflight: {
      status: args.apply ? "pending" : "local_manifest_only",
      candidatesValidated: 0,
      batchPrepared: false,
    },
    firebaseInitialized: false,
    remoteReads: 0,
    remoteWrites: 0,
    batchCommitted: false,
  };
}

function exactDocumentFields(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return ["$"];
  }
  const actualFields = Object.keys(data).sort();
  const expectedFields = [...CATEGORY_DOCUMENT_FIELDS].sort();
  const missingFields = expectedFields.filter(
    (field) => !actualFields.includes(field)
  );
  const unexpectedFields = actualFields.filter(
    (field) => !expectedFields.includes(field)
  );
  return [
    ...missingFields.map((field) => `missing:${field}`),
    ...unexpectedFields.map((field) => `unexpected:${field}`),
  ];
}

function categoryConflictFields(entry, data, contract) {
  const fields = exactDocumentFields(data);
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const field of MANAGED_CATEGORY_FIELDS) {
      if (data[field] !== entry[field]) fields.push(field);
    }
    for (const issue of contract.validateCategoriaProveedor(data)) {
      fields.push(issue.path);
    }
  }
  return [...new Set(fields)].sort();
}

function classifyExistingCategories(
  manifest,
  snapshots,
  contract
) {
  if (snapshots.length !== manifest.length) {
    throw new Error(
      "La lectura remota de categorías no devolvió un resultado por documento."
    );
  }

  const missing = [];
  const compatibleExisting = [];
  const conflicts = [];
  snapshots.forEach((snapshot, index) => {
    const entry = manifest[index];
    if (!snapshot.exists) {
      missing.push(entry.documentId);
      return;
    }
    const data = snapshot.data();
    const differingFields = categoryConflictFields(
      entry,
      data,
      contract
    );
    if (differingFields.length > 0) {
      conflicts.push({
        documentId: entry.documentId,
        differingFields,
      });
      return;
    }
    compatibleExisting.push(entry.documentId);
  });

  return {
    missing,
    compatibleExisting,
    conflicts,
  };
}

function collectProviderCategoryReferences(providerSnapshot) {
  const referencedIds = new Set();
  let invalidReferenceValues = 0;
  for (const snapshot of providerSnapshot.docs || []) {
    const data = snapshot.data() || {};
    if (data.categoriaPrincipalId !== null &&
        data.categoriaPrincipalId !== undefined) {
      if (
        typeof data.categoriaPrincipalId === "string" &&
        data.categoriaPrincipalId.length > 0
      ) {
        referencedIds.add(data.categoriaPrincipalId);
      } else {
        invalidReferenceValues += 1;
      }
    }
    if (Array.isArray(data.categoriaIds)) {
      for (const categoryId of data.categoriaIds) {
        if (
          typeof categoryId === "string" &&
          categoryId.length > 0
        ) {
          referencedIds.add(categoryId);
        } else {
          invalidReferenceValues += 1;
        }
      }
    } else if (data.categoriaIds !== undefined) {
      invalidReferenceValues += 1;
    }
  }
  return {
    referencedIds: [...referencedIds].sort(),
    invalidReferenceValues,
  };
}

function verifyProviderCategoryReferences(
  manifest,
  providerSnapshot
) {
  const manifestIds = new Set(
    manifest.map((entry) => entry.documentId)
  );
  const { referencedIds, invalidReferenceValues } =
    collectProviderCategoryReferences(providerSnapshot);
  const referencedExistingInManifest = referencedIds.filter(
    (categoryId) => manifestIds.has(categoryId)
  );
  const referencedMissingFromManifest = referencedIds.filter(
    (categoryId) => !manifestIds.has(categoryId)
  );
  const referencedSet = new Set(referencedIds);
  const manifestWithoutProviders = [...manifestIds]
    .filter((categoryId) => !referencedSet.has(categoryId))
    .sort();

  return {
    performed: true,
    referencedExistingInManifest,
    referencedMissingFromManifest,
    manifestWithoutProviders,
    invalidReferenceValues,
  };
}

function createSeedPreflightError({
  documentId,
  fieldPath,
  incompatibleType,
  reason,
}) {
  const error = new Error(
    `Preflight inválido para categorias_proveedores/${documentId}` +
      `${fieldPath ? ` en ${fieldPath}` : ""}: ${reason}`
  );
  error.seedPreflightFailure = {
    documentId,
    fieldPath,
    incompatibleType,
    reason,
    batchCommitted: false,
    remoteWrites: 0,
  };
  return error;
}

function prepareCategoryBatch(
  db,
  missingEntries,
  contract,
  timestamp = new Date()
) {
  if (missingEntries.length === 0) {
    return {
      batch: null,
      documents: [],
      candidatesValidated: 0,
      batchPrepared: false,
    };
  }

  const batch = db.batch();
  const documents = [];
  for (const entry of missingEntries) {
    const document = buildCategoryDocument(entry, timestamp);
    try {
      contract.assertValidCategoriaProveedor(document);
      const incompatible =
        loadImporterAuthority().findFirestoreIncompatibleValue(
          document
        );
      if (incompatible) {
        throw createSeedPreflightError({
          documentId: entry.documentId,
          ...incompatible,
        });
      }
      const reference = db
        .collection(contract.PROVIDER_CATEGORIES_COLLECTION)
        .doc(entry.documentId);
      batch.create(reference, document);
      documents.push({
        documentId: entry.documentId,
        document,
      });
    } catch (error) {
      if (error.seedPreflightFailure) throw error;
      throw createSeedPreflightError({
        documentId: entry.documentId,
        fieldPath: null,
        incompatibleType:
          error?.constructor?.name || typeof error,
        reason: String(error?.message || error),
      });
    }
  }

  return {
    batch,
    documents,
    candidatesValidated: documents.length,
    batchPrepared: true,
  };
}

async function readRemoteSeedState(db, manifest, contract) {
  const categoryReferences = manifest.map((entry) =>
    db
      .collection(contract.PROVIDER_CATEGORIES_COLLECTION)
      .doc(entry.documentId)
  );
  const categorySnapshots = await db.getAll(...categoryReferences);
  const providerSnapshot = await db
    .collection(contract.PROVIDERS_COLLECTION)
    .select("categoriaPrincipalId", "categoriaIds")
    .get();
  return {
    categorySnapshots,
    providerSnapshot,
    remoteReads:
      categorySnapshots.length + Number(providerSnapshot.size || 0),
  };
}

async function executeSeedAgainstFirestore({
  db,
  manifest,
  contract,
  projectId,
  manifestValidation,
  commit,
  timestamp = new Date(),
}) {
  const args = {
    apply: true,
    project: projectId,
  };
  const report = createBaseReport({
    args,
    manifest,
    manifestValidation,
  });
  report.firebaseInitialized = true;

  const remoteState = await readRemoteSeedState(
    db,
    manifest,
    contract
  );
  report.remoteReads = remoteState.remoteReads;
  const classification = classifyExistingCategories(
    manifest,
    remoteState.categorySnapshots,
    contract
  );
  report.missing = classification.missing;
  report.compatibleExisting =
    classification.compatibleExisting;
  report.conflicts = classification.conflicts;
  report.skipped = [...classification.compatibleExisting];
  report.referenceVerification =
    verifyProviderCategoryReferences(
      manifest,
      remoteState.providerSnapshot
    );

  const referenceBlockers =
    report.referenceVerification.referencedMissingFromManifest.length >
      0 ||
    report.referenceVerification.invalidReferenceValues > 0;
  if (report.conflicts.length > 0 || referenceBlockers) {
    report.status = "blocked";
    report.preflight = {
      status: "failed",
      candidatesValidated: 0,
      batchPrepared: false,
    };
    return report;
  }

  const missingSet = new Set(report.missing);
  const missingEntries = manifest.filter((entry) =>
    missingSet.has(entry.documentId)
  );
  const prepared = prepareCategoryBatch(
    db,
    missingEntries,
    contract,
    timestamp
  );
  report.preflight = {
    status: "passed",
    candidatesValidated: prepared.candidatesValidated,
    batchPrepared: prepared.batchPrepared,
  };

  if (!commit) {
    report.status = "preflight_passed_without_commit";
    return report;
  }

  if (prepared.batch) {
    await prepared.batch.commit();
    report.created = prepared.documents.map(
      ({ documentId }) => documentId
    );
    report.remoteWrites = report.created.length;
    report.batchCommitted = true;
  }
  report.status =
    report.created.length > 0
      ? "completed"
      : "completed_no_changes";
  return report;
}

function defaultReportPath() {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  return path.resolve(
    process.cwd(),
    "artifacts",
    "providers",
    "runtime",
    `provider-categories-seed-${timestamp}.json`
  );
}

function writeSeedReport(args, report) {
  return writeJsonAtomic(
    args.report || defaultReportPath(),
    report
  );
}

function printSummary(report, reportPath) {
  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        status: report.status,
        projectId: report.projectId,
        planned: report.planned.length,
        missing: report.missing.length,
        compatibleExisting: report.compatibleExisting.length,
        conflicts: report.conflicts.length,
        created: report.created.length,
        skipped: report.skipped.length,
        referencedExistingInManifest:
          report.referenceVerification
            .referencedExistingInManifest.length,
        referencedMissingFromManifest:
          report.referenceVerification
            .referencedMissingFromManifest.length,
        manifestWithoutProviders:
          report.referenceVerification.manifestWithoutProviders.length,
        firebaseInitialized: report.firebaseInitialized,
        remoteReads: report.remoteReads,
        remoteWrites: report.remoteWrites,
        batchCommitted: report.batchCommitted,
        reportPath,
      },
      null,
      2
    )
  );
}

function printHelp() {
  console.log(
    [
      "Dry-run local (predeterminado, sin Firebase):",
      "  node scripts/providers/seedProviderCategories.cjs --dry-run [--report=RUTA]",
      "",
      "Apply futuro (NO ejecutar sin ventana aprobada):",
      "  node scripts/providers/seedProviderCategories.cjs --apply --project=ID --confirm-project=ID --credentials=RUTA [--report=RUTA]",
      "",
      "El apply crea únicamente categorías faltantes, omite las compatibles y aborta antes de escribir ante cualquier conflicto.",
    ].join("\n")
  );
}

async function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }
  validateApplyConfiguration(args);
  const { contract, manifest } = loadCategoryManifest();
  const manifestValidation = validateManifest(manifest, contract);

  if (!args.apply) {
    const report = createBaseReport({
      args,
      manifest,
      manifestValidation,
    });
    const reportPath = writeSeedReport(args, report);
    printSummary(report, reportPath);
    return report;
  }

  const db =
    loadImporterAuthority().initializeAdminForApply(args);
  const report = await executeSeedAgainstFirestore({
    db,
    manifest,
    contract,
    projectId: args.project,
    manifestValidation,
    commit: true,
  });
  const reportPath = writeSeedReport(args, report);
  printSummary(report, reportPath);
  if (report.status === "blocked") {
    const error = new Error(
      "El seed fue bloqueado por conflictos o referencias fuera del manifiesto."
    );
    error.seedReportFailure = {
      reportPath,
      conflicts: report.conflicts,
      referencedMissingFromManifest:
        report.referenceVerification.referencedMissingFromManifest,
      invalidReferenceValues:
        report.referenceVerification.invalidReferenceValues,
      batchCommitted: false,
      remoteWrites: 0,
    };
    throw error;
  }
  return report;
}

if (require.main === module) {
  run().catch((error) => {
    if (error.manifestValidationFailure) {
      console.error(
        JSON.stringify(
          {
            mode: "provider_category_manifest_invalid",
            error: error.message,
            ...error.manifestValidationFailure,
          },
          null,
          2
        )
      );
    } else if (error.seedPreflightFailure) {
      console.error(
        JSON.stringify(
          {
            mode: "provider_category_seed_preflight_failed",
            error: error.message,
            ...error.seedPreflightFailure,
          },
          null,
          2
        )
      );
    } else if (error.seedReportFailure) {
      console.error(
        JSON.stringify(
          {
            mode: "provider_category_seed_blocked",
            error: error.message,
            ...error.seedReportFailure,
          },
          null,
          2
        )
      );
    } else {
      console.error(
        `Provider category seed failed safely: ${error.message}`
      );
    }
    process.exitCode = 1;
  });
}

module.exports = {
  CATEGORY_DOCUMENT_FIELDS,
  EXCLUDED_CATEGORY_IDS,
  MANAGED_CATEGORY_FIELDS,
  buildCategoryDocument,
  categoryConflictFields,
  classifyExistingCategories,
  collectProviderCategoryReferences,
  createBaseReport,
  executeSeedAgainstFirestore,
  initializeFirestoreForEmulator: (options) =>
    loadImporterAuthority().initializeFirestoreForEmulator(options),
  loadCategoryManifest,
  parseArgs,
  prepareCategoryBatch,
  run,
  validateApplyConfiguration,
  validateManifest,
  verifyProviderCategoryReferences,
};
