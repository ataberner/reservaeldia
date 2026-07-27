#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { readProviderInputFile } = require("./providerInput.cjs");

const PROVIDERS_LIB_PATH = path.resolve(
  __dirname,
  "../../functions/lib/providers/index.js"
);

function loadProviderContract() {
  if (!fs.existsSync(PROVIDERS_LIB_PATH)) {
    throw new Error(
      "Falta functions/lib/providers. Ejecute `npm --prefix functions run build` antes del análisis."
    );
  }
  return require(PROVIDERS_LIB_PATH);
}

function parsePositiveInteger(value, label, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} debe ser un entero positivo.`);
  }
  return parsed;
}

function parseArgs(argv) {
  const args = {
    input: "",
    inputFormat: "",
    category: "",
    out: "",
    sampleLimit: 25,
  };

  for (const entry of argv) {
    if (entry.startsWith("--input=")) {
      args.input = entry.slice("--input=".length).trim();
    } else if (entry.startsWith("--input-format=")) {
      args.inputFormat = entry.slice("--input-format=".length).trim();
    } else if (entry.startsWith("--category=")) {
      args.category = entry.slice("--category=".length).trim();
    } else if (entry.startsWith("--out=")) {
      args.out = entry.slice("--out=".length).trim();
    } else if (entry.startsWith("--sample-limit=")) {
      args.sampleLimit = parsePositiveInteger(
        entry.slice("--sample-limit=".length),
        "--sample-limit",
        25
      );
    } else if (entry === "--help" || entry === "-h") {
      args.help = true;
    } else {
      throw new Error(`Argumento desconocido: ${entry}`);
    }
  }

  return args;
}

function readProviderSourceFile(inputPath, options = {}) {
  const contract = loadProviderContract();
  return readProviderInputFile(inputPath, { ...options, contract });
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function sortedCounts(map) {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function safeRecordReference(index, normalizedUrl, contract) {
  return {
    index,
    providerId: normalizedUrl
      ? contract.createProviderDocumentId(normalizedUrl.normalized)
      : null,
  };
}

function addReviewReason(reviewReasonsByIndex, index, reason) {
  if (!reviewReasonsByIndex.has(index)) {
    reviewReasonsByIndex.set(index, new Set());
  }
  reviewReasonsByIndex.get(index).add(reason);
}

function safeReviewRecord(observation, reasons, contract) {
  const duplicateReasons = reasons.filter((reason) =>
    [
      "posible_duplicado_nombre",
      "shared_external_id_different_url",
      "duplicate_normalized_url",
    ].includes(reason)
  );

  return {
    index: observation.index,
    providerId: observation.providerId,
    nombreNormalizado: observation.normalizedName || null,
    categoriaOriginal: observation.originalCategory,
    urlPath: observation.normalizedUrl?.pathname || null,
    slug: observation.normalizedUrl?.slug || null,
    idExterno: observation.normalizedUrl?.externalId || null,
    localidad: contract.normalizeWhitespace(observation.record.localidad) || null,
    provincia: contract.normalizeWhitespace(observation.record.provincia) || null,
    motivoPosibleDuplicado:
      duplicateReasons.length > 0 ? duplicateReasons.join(",") : null,
    motivosRevision: reasons,
  };
}

function analyzeProviderEnvelope(
  envelope,
  {
    sourceFileName = "providers.json",
    inputFormat = "json",
    inputDiagnostics = null,
    inputHashSha256 = null,
    sampleLimit = 25,
  } = {}
) {
  const contract = loadProviderContract();
  const firstIndexByNormalizedUrl = new Map();
  const normalizedUrlCounts = new Map();

  envelope.results.forEach((record, index) => {
    const normalizedUrl = contract.normalizeOriginalProviderUrl(record.pagina, {
      providerName: record.nombre,
    });
    if (!normalizedUrl) return;
    if (!firstIndexByNormalizedUrl.has(normalizedUrl.normalized)) {
      firstIndexByNormalizedUrl.set(normalizedUrl.normalized, index);
    }
    increment(normalizedUrlCounts, normalizedUrl.normalized);
  });

  const discardReasons = new Map();
  const sourceCategories = new Map();
  const websiteClassifications = new Map();
  const invalidEmailReasonCounts = new Map();
  const discardedSamples = [];
  const discardedEmailSamples = [];
  const doubtfulUrlSamples = [];
  const unnormalizedPhoneSamples = [];
  const observations = [];
  let eligibleRecords = 0;
  let discardedRecords = 0;
  let discardReasonOccurrences = 0;
  let recordsWithMultipleDiscardReasons = 0;
  let unnormalizedPhones = 0;
  let missingPhones = 0;
  let phonesWithLeadingExcelApostropheCleaned = 0;
  let recordsWithoutWebsite = 0;
  let recordsWithoutUsableLocation = 0;
  let mappedProviders = 0;

  const emailSummary = {
    recordsWithValidPrimaryEmail: 0,
    recordsWithoutEmail: 0,
    recordsWithoutValidEmail: 0,
    recordsWithPlaceholder: 0,
    recordsWithSyntacticallyInvalidEmail: 0,
    recordsWithMultipleValidEmails: 0,
    recordsWithValidEmailAndSecondaryPlaceholder: 0,
    discardedValues: {
      total: 0,
      placeholders: 0,
      syntacticallyInvalid: 0,
    },
  };

  envelope.results.forEach((record, index) => {
    const normalizedUrl = contract.normalizeOriginalProviderUrl(record.pagina, {
      providerName: record.nombre,
    });
    const isDuplicate = Boolean(
      normalizedUrl &&
        firstIndexByNormalizedUrl.get(normalizedUrl.normalized) !== index
    );
    const eligibility = contract.evaluateProviderEligibility(record, {
      isDuplicate,
    });
    const reference = safeRecordReference(index, normalizedUrl, contract);
    const normalizedName = contract.normalizeSearchText(record.nombre);
    const originalCategory =
      contract.normalizeWhitespace(record.categoria) ||
      normalizedUrl?.categorySlug ||
      "(sin_categoria)";
    const categoryDecision =
      originalCategory === "(sin_categoria)"
        ? contract.getProviderCategoryDecision(null)
        : contract.getProviderCategoryDecision(originalCategory);

    increment(sourceCategories, originalCategory);

    const emails = contract.normalizeEmails(record.email);
    const validEmailCount =
      (emails.principal ? 1 : 0) + emails.alternativos.length;
    const placeholderCount = emails.invalidos.filter(
      (entry) => entry.reason === "placeholder"
    ).length;
    const syntacticallyInvalidCount = emails.invalidos.filter(
      (entry) => entry.reason === "invalid"
    ).length;

    if (emails.principal) emailSummary.recordsWithValidPrimaryEmail += 1;
    if (!contract.normalizeWhitespace(record.email)) {
      emailSummary.recordsWithoutEmail += 1;
    }
    if (!emails.principal) emailSummary.recordsWithoutValidEmail += 1;
    if (placeholderCount > 0) emailSummary.recordsWithPlaceholder += 1;
    if (syntacticallyInvalidCount > 0) {
      emailSummary.recordsWithSyntacticallyInvalidEmail += 1;
    }
    if (validEmailCount > 1) {
      emailSummary.recordsWithMultipleValidEmails += 1;
    }
    if (validEmailCount > 0 && placeholderCount > 0) {
      emailSummary.recordsWithValidEmailAndSecondaryPlaceholder += 1;
    }

    emailSummary.discardedValues.total += emails.invalidos.length;
    emailSummary.discardedValues.placeholders += placeholderCount;
    emailSummary.discardedValues.syntacticallyInvalid +=
      syntacticallyInvalidCount;
    for (const invalid of emails.invalidos) {
      increment(invalidEmailReasonCounts, invalid.reason);
      if (discardedEmailSamples.length < sampleLimit) {
        discardedEmailSamples.push({
          ...reference,
          reason: invalid.reason,
        });
      }
    }

    const phone = contract.normalizePhone(record.telefono, record.pais);
    if (!phone.original) missingPhones += 1;
    if (phone.removedLeadingExcelApostrophe) {
      phonesWithLeadingExcelApostropheCleaned += 1;
    }
    if (phone.original && !phone.normalized) {
      unnormalizedPhones += 1;
      if (unnormalizedPhoneSamples.length < sampleLimit) {
        unnormalizedPhoneSamples.push({
          ...reference,
          reason: phone.status,
        });
      }
    }

    const websiteClassification = contract.classifyProviderUrl(record.sitio_web);
    if (!websiteClassification.original) {
      recordsWithoutWebsite += 1;
      increment(websiteClassifications, "missing");
    }
    if (websiteClassification.original) {
      increment(websiteClassifications, websiteClassification.tipo);
      if (
        [
          "image",
          "portal_media",
          "canva",
          "google_search",
          "doubtful",
          "invalid",
        ].includes(websiteClassification.tipo) &&
        doubtfulUrlSamples.length < sampleLimit
      ) {
        doubtfulUrlSamples.push({
          ...reference,
          classification: websiteClassification.tipo,
        });
      }
    }

    const location = contract.mapProviderLocation(record);
    if (
      ![
        location.direccionCompleta,
        location.calle,
        location.numero,
        location.codigoPostal,
        location.ciudad,
        location.nivel1Codigo,
        location.nivel1Nombre,
        location.nivel2Codigo,
        location.nivel2Nombre,
      ].some(Boolean)
    ) {
      recordsWithoutUsableLocation += 1;
    }

    const observation = {
      index,
      record,
      normalizedUrl,
      providerId: reference.providerId,
      normalizedName,
      originalCategory,
      categoryDecision,
      eligibility,
    };
    observations.push(observation);

    if (!eligibility.eligible) {
      discardedRecords += 1;
      discardReasonOccurrences += eligibility.reasons.length;
      if (eligibility.reasons.length > 1) {
        recordsWithMultipleDiscardReasons += 1;
      }
      for (const reason of eligibility.reasons) {
        increment(discardReasons, reason.code);
      }
      if (discardedSamples.length < sampleLimit) {
        discardedSamples.push({
          ...reference,
          reasons: eligibility.reasons.map((reason) => reason.code),
        });
      }
      return;
    }

    eligibleRecords += 1;
  });

  const eligibleObservations = observations.filter(
    (observation) => observation.eligibility.eligible
  );
  const eligibleWithExternalId = eligibleObservations.filter(
    (observation) => observation.normalizedUrl?.externalId
  ).length;
  const eligibleWithoutExternalId =
    eligibleObservations.length - eligibleWithExternalId;
  const externalIdGroups = new Map();
  for (const observation of eligibleObservations) {
    if (observation.normalizedUrl?.externalId && observation.providerId) {
      if (!externalIdGroups.has(observation.normalizedUrl.externalId)) {
        externalIdGroups.set(observation.normalizedUrl.externalId, []);
      }
      externalIdGroups.get(observation.normalizedUrl.externalId).push(observation);
    }
  }

  const duplicateGroups = [...normalizedUrlCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([normalizedUrl, count]) => ({
      providerId: contract.createProviderDocumentId(normalizedUrl),
      occurrences: count,
    }))
    .sort((left, right) => right.occurrences - left.occurrences);
  const possibleDuplicatesByName =
    contract
      .findPossibleDuplicateProviderNameGroups(
        eligibleObservations.map((observation) => ({
          sourceIndex: observation.index,
          providerId: observation.providerId,
          normalizedName: observation.normalizedName,
        }))
      )
      .map((group) => ({
        normalizedName: group.normalizedName,
        providerIds: group.providerIds,
        indexes: group.sourceIndexes,
      }));
  const externalIdConflicts = [...externalIdGroups.entries()]
    .filter(([, entries]) => new Set(entries.map((entry) => entry.providerId)).size > 1)
    .map(([externalId, entries]) => ({
      externalId,
      providerIds: [...new Set(entries.map((entry) => entry.providerId))].sort(),
      indexes: entries.map((entry) => entry.index).sort((left, right) => left - right),
    }))
    .sort((left, right) => left.externalId.localeCompare(right.externalId));

  const duplicateNameIndexes = new Set(
    possibleDuplicatesByName.flatMap((group) => group.indexes)
  );
  const manualReviewReasonCounts = new Map(
    contract.MOTIVOS_REVISION_PROVEEDOR.map((reason) => [reason, 0])
  );
  const finalCategoryDistribution = new Map();
  let manualReviewRequiredProviders = 0;
  let manualReviewReasonOccurrences = 0;
  let manualReviewProvidersWithMultipleReasons = 0;
  let providersWithoutInternalCategory = 0;

  for (const observation of eligibleObservations) {
    const mapped = contract.mapPortalProviderRecord(observation.record, {
      sourceFile: envelope,
      sourceFileName,
      manualReviewReasons: duplicateNameIndexes.has(observation.index)
        ? ["posible_duplicado_nombre"]
        : [],
    });
    observation.mapped = mapped;
    mappedProviders += 1;

    if (mapped.document.revisionManual.requerida) {
      manualReviewRequiredProviders += 1;
    }
    manualReviewReasonOccurrences +=
      mapped.document.revisionManual.motivos.length;
    if (mapped.document.revisionManual.motivos.length > 1) {
      manualReviewProvidersWithMultipleReasons += 1;
    }
    for (const reason of mapped.document.revisionManual.motivos) {
      increment(manualReviewReasonCounts, reason);
    }
    const finalCategoryId =
      mapped.document.categoriaPrincipalId || "(sin_categoria_interna)";
    increment(finalCategoryDistribution, finalCategoryId);
    if (!mapped.document.categoriaPrincipalId) {
      providersWithoutInternalCategory += 1;
    }
  }

  const reviewReasonsByIndex = new Map();
  for (const group of possibleDuplicatesByName) {
    for (const index of group.indexes) {
      addReviewReason(
        reviewReasonsByIndex,
        index,
        "posible_duplicado_nombre"
      );
    }
  }
  for (const group of externalIdConflicts) {
    for (const index of group.indexes) {
      addReviewReason(
        reviewReasonsByIndex,
        index,
        "shared_external_id_different_url"
      );
    }
  }
  for (const observation of observations) {
    const codes = observation.eligibility.reasons.map((reason) => reason.code);
    if (observation.mapped) {
      for (const reason of observation.mapped.document.revisionManual.motivos) {
        addReviewReason(reviewReasonsByIndex, observation.index, reason);
      }
    }
    if (codes.includes("duplicate_url")) {
      addReviewReason(
        reviewReasonsByIndex,
        observation.index,
        "duplicate_normalized_url"
      );
    }
    if (codes.includes("portal_record")) {
      addReviewReason(
        reviewReasonsByIndex,
        observation.index,
        "generic_portal_identity"
      );
    }
    if (
      codes.includes("navigation_or_region_page") ||
      codes.includes("category_page")
    ) {
      addReviewReason(
        reviewReasonsByIndex,
        observation.index,
        "navigation_or_region_page"
      );
    }
  }

  const reviewRecords = [...reviewReasonsByIndex.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, reasonSet]) =>
      safeReviewRecord(
        observations[index],
        [...reasonSet].sort(),
        contract
      )
    );
  const possibleDuplicateReviewRecords = reviewRecords.filter(
    (entry) => entry.motivoPosibleDuplicado !== null
  );
  const rejectedGenericOrNavigationRecords = reviewRecords.filter((entry) =>
    entry.motivosRevision.some((reason) =>
      ["generic_portal_identity", "navigation_or_region_page"].includes(reason)
    )
  );
  const eligibleWithoutExternalIdRecords = reviewRecords.filter((entry) =>
    entry.motivosRevision.includes("sin_id_externo")
  );
  const manualReviewRecords = eligibleObservations
    .filter((observation) => observation.mapped.document.revisionManual.requerida)
    .map((observation) =>
      safeReviewRecord(
        observation,
        observation.mapped.document.revisionManual.motivos,
        contract
      )
    );

  const categorySource = sortedCounts(sourceCategories).map(({ key, count }) => {
    const decision =
      key === "(sin_categoria)"
        ? contract.getProviderCategoryDecision(null)
        : contract.getProviderCategoryDecision(key);
    return {
      category: key,
      count,
      status: decision.status,
      mappedCategoryId: decision.categoriaId,
      reviewReason: decision.reviewReason,
      manualReviewReason: decision.manualReviewReason,
    };
  });
  const confirmedCategories = categorySource.filter(
    (entry) => entry.status === "confirmed"
  );
  const reviewRequiredCategories = categorySource.filter(
    (entry) => entry.status === "review_required"
  );
  const unreviewedCategories = categorySource.filter(
    (entry) => entry.status === "unreviewed"
  );
  const discardReasonSummary = sortedCounts(discardReasons).map(
    ({ key, count }) => ({ reason: key, occurrences: count })
  );

  return {
    reportVersion: 3,
    generatedAt: new Date().toISOString(),
    mode: "local_analysis_only",
    privacy: {
      containsRawEmails: false,
      containsRawPhones: false,
      containsFullAddresses: false,
      containsNormalizedBusinessNames: true,
      containsCityAndProvinceForReview: true,
      recordsUseSourceIndexAndDeterministicProviderId: true,
    },
    source: {
      fileName: sourceFileName,
      inputFormat,
      inputDiagnostics,
      inputHashSha256,
      version: envelope.version,
      createdAt: envelope.createdAt,
      reason: envelope.reason,
      origin: envelope.origin,
    },
    totals: {
      records: envelope.results.length,
      eligible: eligibleRecords,
      discarded: discardedRecords,
      mapped: mappedProviders,
      discardReasonOccurrences,
      recordsWithMultipleDiscardReasons,
      duplicateUrlGroups: duplicateGroups.length,
      duplicateRecordsAfterFirst: duplicateGroups.reduce(
        (sum, group) => sum + group.occurrences - 1,
        0
      ),
      possibleCrossUrlDuplicateNameGroups: possibleDuplicatesByName.length,
      providersWithPossibleDuplicateNameReview: duplicateNameIndexes.size,
      externalIdConflictGroups: externalIdConflicts.length,
      eligibleWithExternalId,
      eligibleWithoutExternalId,
      emailDiscardedValues: emailSummary.discardedValues.total,
      phonesNotNormalized: unnormalizedPhones,
      phonesMissing: missingPhones,
      phonesWithLeadingExcelApostropheCleaned,
      recordsWithoutWebsite,
      recordsWithoutUsableLocation,
      sourceCategories: categorySource.length,
      confirmedCategoryMappings: confirmedCategories.length,
      categoriesRequiringReview: reviewRequiredCategories.length,
      unknownCategories: unreviewedCategories.length,
      manualReviewRequiredProviders,
      manualReviewReasonOccurrences,
      manualReviewProvidersWithMultipleReasons,
      providersWithoutInternalCategory,
    },
    discards: {
      records: discardedRecords,
      reasonOccurrences: discardReasonOccurrences,
      recordsWithMultipleReasons: recordsWithMultipleDiscardReasons,
      recordsWithSingleReason:
        discardedRecords - recordsWithMultipleDiscardReasons,
      byReason: discardReasonSummary,
    },
    categories: {
      source: categorySource,
      confirmed: confirmedCategories,
      reviewRequired: reviewRequiredCategories,
      unreviewed: unreviewedCategories,
      finalDistribution: sortedCounts(finalCategoryDistribution).map(
        ({ key, count }) => ({
          categoryId: key === "(sin_categoria_interna)" ? null : key,
          count,
        })
      ),
    },
    emails: {
      summary: emailSummary,
      discardedReasonCounts: sortedCounts(invalidEmailReasonCounts).map(
        ({ key, count }) => ({ reason: key, count })
      ),
      discardedSamples: discardedEmailSamples,
    },
    websites: {
      classifications: sortedCounts(websiteClassifications).map(
        ({ key, count }) => ({ classification: key, count })
      ),
      reviewSamples: doubtfulUrlSamples,
    },
    phones: {
      notNormalized: unnormalizedPhones,
      missing: missingPhones,
      leadingExcelApostropheCleaned:
        phonesWithLeadingExcelApostropheCleaned,
      samples: unnormalizedPhoneSamples,
    },
    locations: {
      recordsWithoutUsableLocation,
    },
    duplicates: {
      normalizedUrlGroups: duplicateGroups,
      possibleByNormalizedName: possibleDuplicatesByName,
      externalIdConflicts,
    },
    externalIds: {
      eligibleWithExternalId,
      eligibleWithoutExternalId,
      conflictGroups: externalIdConflicts.length,
    },
    manualReview: {
      requiredProviders: manualReviewRequiredProviders,
      reasonOccurrences: manualReviewReasonOccurrences,
      providersWithMultipleReasons:
        manualReviewProvidersWithMultipleReasons,
      byReason: contract.MOTIVOS_REVISION_PROVEEDOR.map((reason) => ({
        reason,
        count: manualReviewReasonCounts.get(reason) || 0,
      })),
      possibleDuplicateNameGroups: possibleDuplicatesByName.length,
      providersWithPossibleDuplicateNameReview: duplicateNameIndexes.size,
      providersWithoutInternalCategory,
      records: manualReviewRecords,
    },
    review: {
      possibleDuplicateRecords: possibleDuplicateReviewRecords,
      rejectedGenericOrNavigationRecords,
      eligibleWithoutExternalIdRecords,
      records: reviewRecords,
    },
    discardedSamples,
  };
}

function defaultOutputPath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.resolve(
    process.cwd(),
    "artifacts",
    "providers",
    "runtime",
    `analysis-${timestamp}.json`
  );
}

function writeJsonAtomic(outputPath, payload) {
  const absolutePath = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, absolutePath);
  return absolutePath;
}

function printHelp() {
  console.log(
    [
      "Uso:",
      "  node scripts/providers/analyzeProviderJson.cjs --input=RUTA [--input-format=json|csv] [--category=foto-video] [--out=RUTA] [--sample-limit=25]",
      "",
      "Este comando lee un JSON o CSV local y escribe un reporte sanitizado local.",
      "No inicializa Firebase Admin ni realiza operaciones remotas.",
    ].join("\n")
  );
}

function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }
  if (!args.input) {
    throw new Error("Falta --input=RUTA.");
  }

  const source = readProviderSourceFile(args.input, {
    inputFormat: args.inputFormat,
    category: args.category,
  });
  const report = analyzeProviderEnvelope(source.envelope, {
    sourceFileName: source.fileName,
    inputFormat: source.inputFormat,
    inputDiagnostics: source.inputDiagnostics,
    inputHashSha256: source.inputHashSha256,
    sampleLimit: args.sampleLimit,
  });
  const outputPath = writeJsonAtomic(args.out || defaultOutputPath(), report);

  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        records: report.totals.records,
        eligible: report.totals.eligible,
        discarded: report.totals.discarded,
        discardReasonOccurrences: report.totals.discardReasonOccurrences,
        recordsWithMultipleDiscardReasons:
          report.totals.recordsWithMultipleDiscardReasons,
        duplicateUrlGroups: report.totals.duplicateUrlGroups,
        possibleCrossUrlDuplicateNameGroups:
          report.totals.possibleCrossUrlDuplicateNameGroups,
        providersWithPossibleDuplicateNameReview:
          report.totals.providersWithPossibleDuplicateNameReview,
        externalIdConflictGroups: report.totals.externalIdConflictGroups,
        eligibleWithExternalId: report.totals.eligibleWithExternalId,
        eligibleWithoutExternalId: report.totals.eligibleWithoutExternalId,
        emailDiscardedValues: report.totals.emailDiscardedValues,
        phonesNotNormalized: report.totals.phonesNotNormalized,
        phonesWithLeadingExcelApostropheCleaned:
          report.totals.phonesWithLeadingExcelApostropheCleaned,
        recordsWithoutWebsite: report.totals.recordsWithoutWebsite,
        recordsWithoutUsableLocation:
          report.totals.recordsWithoutUsableLocation,
        sourceCategories: report.totals.sourceCategories,
        confirmedCategoryMappings: report.totals.confirmedCategoryMappings,
        categoriesRequiringReview: report.totals.categoriesRequiringReview,
        unknownCategories: report.totals.unknownCategories,
        manualReviewRequiredProviders:
          report.totals.manualReviewRequiredProviders,
        manualReviewReasonOccurrences:
          report.totals.manualReviewReasonOccurrences,
        manualReviewProvidersWithMultipleReasons:
          report.totals.manualReviewProvidersWithMultipleReasons,
        providersWithoutInternalCategory:
          report.totals.providersWithoutInternalCategory,
        reportPath: outputPath,
      },
      null,
      2
    )
  );
  return report;
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(`Provider analysis failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  analyzeProviderEnvelope,
  loadProviderContract,
  parseArgs,
  readProviderSourceFile,
  run,
  writeJsonAtomic,
};
