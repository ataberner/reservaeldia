#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  cert,
  deleteApp,
  getApps,
  initializeApp,
} = require("firebase-admin/app");
const {
  DocumentReference,
  FieldValue,
  GeoPoint,
  Timestamp,
  getFirestore,
} = require("firebase-admin/firestore");
const {
  analyzeProviderEnvelope,
  loadProviderContract,
  readProviderSourceFile,
  writeJsonAtomic,
} = require("./analyzeProviderJson.cjs");

function parsePositiveInteger(value, label, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} debe ser un entero positivo.`);
  }
  return parsed;
}

function parseArgs(argv) {
  const args = {
    apply: false,
    input: "",
    inputFormat: "",
    category: "",
    report: "",
    resumeState: "",
    credentials: "",
    project: "",
    confirmProject: "",
    batchSize: 200,
    limit: 0,
    startIndex: 0,
    sampleLimit: 25,
  };

  for (const entry of argv) {
    if (entry === "--apply") {
      args.apply = true;
    } else if (entry === "--dry-run") {
      args.apply = false;
    } else if (entry.startsWith("--input=")) {
      args.input = entry.slice("--input=".length).trim();
    } else if (entry.startsWith("--input-format=")) {
      args.inputFormat = entry.slice("--input-format=".length).trim();
    } else if (entry.startsWith("--category=")) {
      args.category = entry.slice("--category=".length).trim();
    } else if (entry.startsWith("--report=")) {
      args.report = entry.slice("--report=".length).trim();
    } else if (entry.startsWith("--resume-state=")) {
      args.resumeState = entry.slice("--resume-state=".length).trim();
    } else if (entry.startsWith("--credentials=")) {
      args.credentials = entry.slice("--credentials=".length).trim();
    } else if (entry.startsWith("--project=")) {
      args.project = entry.slice("--project=".length).trim();
    } else if (entry.startsWith("--confirm-project=")) {
      args.confirmProject = entry.slice("--confirm-project=".length).trim();
    } else if (entry.startsWith("--batch-size=")) {
      args.batchSize = parsePositiveInteger(
        entry.slice("--batch-size=".length),
        "--batch-size",
        200
      );
    } else if (entry.startsWith("--limit=")) {
      args.limit = parsePositiveInteger(entry.slice("--limit=".length), "--limit");
    } else if (entry.startsWith("--start-index=")) {
      const parsed = Number(entry.slice("--start-index=".length));
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error("--start-index debe ser un entero no negativo.");
      }
      args.startIndex = parsed;
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

  if (args.batchSize > 400) {
    throw new Error("--batch-size no puede superar 400.");
  }
  return args;
}

function defaultRuntimePath(fileName) {
  return path.resolve(
    process.cwd(),
    "artifacts",
    "providers",
    "runtime",
    fileName
  );
}

function readResumeState(resumeStatePath, inputHashSha256) {
  if (!fs.existsSync(resumeStatePath)) return null;
  const parsed = JSON.parse(fs.readFileSync(resumeStatePath, "utf8"));
  if (
    !parsed ||
    typeof parsed !== "object" ||
    parsed.inputHashSha256 !== inputHashSha256
  ) {
    throw new Error(
      "El estado de reanudación no corresponde al archivo de entrada actual."
    );
  }
  if (
    !Number.isInteger(parsed.lastSourceIndex) ||
    parsed.lastSourceIndex < -1
  ) {
    throw new Error("El estado de reanudación contiene lastSourceIndex inválido.");
  }
  return parsed;
}

const SAMPLE_DOCUMENT_MIN = 5;
const SAMPLE_DOCUMENT_MAX = 10;
const EMAIL_LIKE_PATTERN =
  /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;
const PHONE_LIKE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/g;

function sanitizeSampleText(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(EMAIL_LIKE_PATTERN, "[email-redactado]")
    .replace(PHONE_LIKE_PATTERN, "[telefono-redactado]");
}

function sanitizeProviderImage(image) {
  if (!image) return null;
  return {
    id: sanitizeSampleText(image.id),
    tipo: image.tipo,
    storagePath: sanitizeSampleText(image.storagePath),
    alt: sanitizeSampleText(image.alt),
    orden: image.orden,
    ancho: image.ancho,
    alto: image.alto,
    mimeType: image.mimeType,
    formato: image.formato,
    tamanioBytes: image.tamanioBytes,
    importadaEn: image.importadaEn,
    tieneUrl: Boolean(image.url),
    tieneUrlOriginal: Boolean(image.urlOriginal),
  };
}

function sanitizeMappedProviderCandidate(candidate) {
  const document = candidate.document;
  return {
    providerId: candidate.id,
    schemaVersion: document.schemaVersion,
    nombre: sanitizeSampleText(document.nombre),
    nombreNormalizado: sanitizeSampleText(document.nombreNormalizado),
    slug: sanitizeSampleText(document.slug),
    categoriaPrincipalId: document.categoriaPrincipalId,
    categoriaIds: [...document.categoriaIds],
    fuente: {
      categoriaOriginal: document.fuente.categoriaOriginal,
      urlOriginalNormalizada: sanitizeSampleText(
        document.fuente.urlOriginalNormalizada
      ),
      idExterno: document.fuente.idExterno,
    },
    estado: document.estado,
    activo: document.activo,
    visible: document.visible,
    revisionManual: {
      requerida: document.revisionManual.requerida,
      motivos: [...document.revisionManual.motivos],
      revisadaEn: document.revisionManual.revisadaEn,
      revisadaPor: document.revisionManual.revisadaPor,
      notas: document.revisionManual.notas,
    },
    importacion: {
      ...document.importacion,
      ultimoError: document.importacion.ultimoError
        ? "[error-redactado]"
        : null,
    },
    imagenes: {
      portada: sanitizeProviderImage(document.imagenes.portada),
      galeria: document.imagenes.galeria.map(sanitizeProviderImage),
    },
    clasificacionSitioWebORedSocial:
      candidate.diagnostics.websiteClassification,
    email: {
      tieneEmailPrincipal: Boolean(document.contacto.email),
      cantidadEmailsAlternativos:
        document.contacto.emailsAlternativos.length,
    },
    telefono: {
      tieneTelefonoOriginal: Boolean(document.contacto.telefonoOriginal),
      tieneTelefonoNormalizado: Boolean(
        document.contacto.telefonoNormalizado
      ),
      tieneWhatsapp: Boolean(document.contacto.whatsapp),
      whatsappCoincideConTelefonoNormalizado:
        Boolean(document.contacto.whatsapp) &&
        document.contacto.whatsapp ===
          document.contacto.telefonoNormalizado,
    },
    ubicacion: {
      ciudad: sanitizeSampleText(document.ubicacion.ciudad),
      nivel1Nombre: sanitizeSampleText(document.ubicacion.nivel1Nombre),
      paisCodigo: document.ubicacion.paisCodigo,
      regionMetropolitana: document.ubicacion.regionMetropolitana,
      subregionMetropolitana:
        document.ubicacion.subregionMetropolitana,
    },
  };
}

function buildSanitizedSampleDocuments(
  mappedCandidates,
  maxDocuments = 7
) {
  const boundedMaximum = Math.max(
    SAMPLE_DOCUMENT_MIN,
    Math.min(SAMPLE_DOCUMENT_MAX, maxDocuments)
  );
  const selected = [];
  const selectedIds = new Set();
  const selectors = [
    (candidate) => !candidate.document.revisionManual.requerida,
    (candidate) => Boolean(candidate.document.categoriaPrincipalId),
    (candidate) => !candidate.document.categoriaPrincipalId,
    (candidate) =>
      candidate.document.revisionManual.motivos.includes(
        "posible_duplicado_nombre"
      ),
    (candidate) =>
      candidate.document.revisionManual.motivos.some((reason) =>
        [
          "categoria_contenedora_novias",
          "categoria_contenedora_experiencias_adicionales",
        ].includes(reason)
      ),
    (candidate) =>
      candidate.document.revisionManual.motivos.includes("sin_id_externo"),
    (candidate) =>
      candidate.document.revisionManual.motivos.length > 1,
  ];

  for (const selector of selectors) {
    if (selected.length >= boundedMaximum) break;
    const candidate = mappedCandidates.find(
      (entry) => !selectedIds.has(entry.id) && selector(entry)
    );
    if (!candidate) continue;
    selected.push(candidate);
    selectedIds.add(candidate.id);
  }

  for (const candidate of mappedCandidates) {
    if (
      selected.length >= SAMPLE_DOCUMENT_MIN ||
      selected.length >= boundedMaximum
    ) {
      break;
    }
    if (selectedIds.has(candidate.id)) continue;
    selected.push(candidate);
    selectedIds.add(candidate.id);
  }

  return selected.map(sanitizeMappedProviderCandidate);
}

function buildImportCandidates(source, args, resumeState) {
  const contract = loadProviderContract();
  const firstIndexByNormalizedUrl = new Map();
  source.envelope.results.forEach((record, index) => {
    const normalizedUrl = contract.normalizeOriginalProviderUrl(record.pagina, {
      providerName: record.nombre,
    });
    if (
      normalizedUrl &&
      !firstIndexByNormalizedUrl.has(normalizedUrl.normalized)
    ) {
      firstIndexByNormalizedUrl.set(normalizedUrl.normalized, index);
    }
  });

  const effectiveStartIndex = Math.max(
    args.startIndex,
    resumeState ? resumeState.lastSourceIndex + 1 : 0
  );
  const eligibilityByIndex = new Map();
  const eligibleNameCandidates = [];
  source.envelope.results.forEach((record, sourceIndex) => {
    const normalizedUrl = contract.normalizeOriginalProviderUrl(record.pagina, {
      providerName: record.nombre,
    });
    const eligibility = contract.evaluateProviderEligibility(record, {
      isDuplicate: Boolean(
        normalizedUrl &&
          firstIndexByNormalizedUrl.get(normalizedUrl.normalized) !== sourceIndex
      ),
    });
    eligibilityByIndex.set(sourceIndex, eligibility);
    if (eligibility.eligible && normalizedUrl) {
      eligibleNameCandidates.push({
        sourceIndex,
        providerId: contract.createProviderDocumentId(normalizedUrl.normalized),
        normalizedName: contract.normalizeSearchText(record.nombre),
      });
    }
  });
  const duplicateNameGroups =
    contract.findPossibleDuplicateProviderNameGroups(eligibleNameCandidates);
  const duplicateNameIndexes = new Set(
    duplicateNameGroups.flatMap((group) => group.sourceIndexes)
  );
  const allMappedCandidates = [];
  for (
    let sourceIndex = 0;
    sourceIndex < source.envelope.results.length;
    sourceIndex += 1
  ) {
    const record = source.envelope.results[sourceIndex];
    const eligibility = eligibilityByIndex.get(sourceIndex);
    if (!eligibility.eligible) continue;

    const mapped = contract.mapPortalProviderRecord(record, {
      sourceFile: source.envelope,
      sourceFileName: source.fileName,
      manualReviewReasons: duplicateNameIndexes.has(sourceIndex)
        ? ["posible_duplicado_nombre"]
        : [],
    });
    allMappedCandidates.push({ sourceIndex, ...mapped });
  }

  const candidatesAfterStart = allMappedCandidates.filter(
    (candidate) => candidate.sourceIndex >= effectiveStartIndex
  );
  const candidates =
    args.limit > 0
      ? candidatesAfterStart.slice(0, args.limit)
      : candidatesAfterStart;
  const sampleDocuments =
    buildSanitizedSampleDocuments(allMappedCandidates);

  return {
    candidates,
    effectiveStartIndex,
    duplicateNameGroups,
    sampleDocuments,
    allMappedCandidates,
  };
}

function loadExplicitServiceAccount(credentialsPath, projectId) {
  const absolutePath = path.resolve(process.cwd(), credentialsPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error("No existe el archivo indicado en --credentials.");
  }
  const serviceAccount = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  if (
    !serviceAccount ||
    typeof serviceAccount !== "object" ||
    typeof serviceAccount.client_email !== "string" ||
    typeof serviceAccount.private_key !== "string"
  ) {
    throw new Error("El archivo de credenciales no es una cuenta de servicio válida.");
  }
  if (
    serviceAccount.project_id &&
    String(serviceAccount.project_id) !== projectId
  ) {
    throw new Error(
      "El project_id de las credenciales no coincide con --project."
    );
  }
  return serviceAccount;
}

function initializeAdminForApply(args) {
  if (!args.project || !args.confirmProject || args.project !== args.confirmProject) {
    throw new Error(
      "--apply requiere --project y --confirm-project con el mismo valor."
    );
  }
  if (!args.credentials) {
    throw new Error("--apply requiere --credentials=RUTA explícito.");
  }
  if (getApps().length > 0) {
    throw new Error(
      "Firebase Admin ya estaba inicializado; se aborta para no reutilizar configuración implícita."
    );
  }

  const serviceAccount = loadExplicitServiceAccount(
    args.credentials,
    args.project
  );
  const app = initializeApp({
    credential: cert(serviceAccount),
    projectId: args.project,
  });
  return getFirestore(app);
}

function initializeFirestoreForEmulator({
  projectId = "demo-reservaeldia-providers",
  appName = "provider-import-emulator-test",
} = {}) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "FIRESTORE_EMULATOR_HOST es obligatorio para la validación local."
    );
  }
  if (getApps().some((app) => app.name === appName)) {
    throw new Error(`Ya existe una app Firebase local llamada ${appName}.`);
  }
  const app = initializeApp({ projectId }, appName);
  return {
    app,
    db: getFirestore(app),
  };
}

function valueTypeName(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (value?.constructor?.name) return value.constructor.name;
  return typeof value;
}

function incompatibleValue(pathValue, value, reason) {
  return {
    fieldPath: pathValue || "$",
    incompatibleType: valueTypeName(value),
    reason,
  };
}

function findFirestoreIncompatibleValue(
  value,
  pathValue = "",
  ancestors = new Set()
) {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return null;
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? null
      : incompatibleValue(
          pathValue,
          value,
          "Firestore no admite números no finitos."
        );
  }
  if (
    typeof value === "undefined" ||
    typeof value === "bigint" ||
    typeof value === "symbol" ||
    typeof value === "function"
  ) {
    return incompatibleValue(
      pathValue,
      value,
      "Tipo de valor no admitido por Firestore."
    );
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? incompatibleValue(pathValue, value, "Date inválido.")
      : null;
  }
  if (
    value instanceof Timestamp ||
    value instanceof FieldValue ||
    value instanceof GeoPoint ||
    value instanceof DocumentReference ||
    Buffer.isBuffer(value) ||
    value instanceof Uint8Array
  ) {
    return null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const issue = findFirestoreIncompatibleValue(
        value[index],
        `${pathValue}[${index}]`,
        ancestors
      );
      if (issue) return issue;
    }
    return null;
  }
  if (typeof value !== "object") {
    return incompatibleValue(
      pathValue,
      value,
      "Tipo de valor no admitido por Firestore."
    );
  }

  if (valueTypeName(value) === "Timestamp") {
    return incompatibleValue(
      pathValue,
      value,
      "Timestamp creado por otra instancia de firebase-admin/firestore."
    );
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return incompatibleValue(
      pathValue,
      value,
      "Objeto con prototipo no reconocido por el SDK Firestore del importador."
    );
  }
  if (ancestors.has(value)) {
    return incompatibleValue(
      pathValue,
      value,
      "Referencia circular no admitida por Firestore."
    );
  }

  ancestors.add(value);
  for (const [key, childValue] of Object.entries(value)) {
    const childPath = pathValue ? `${pathValue}.${key}` : key;
    const issue = findFirestoreIncompatibleValue(
      childValue,
      childPath,
      ancestors
    );
    if (issue) {
      ancestors.delete(value);
      return issue;
    }
  }
  ancestors.delete(value);
  return null;
}

function firestoreErrorFieldPath(error) {
  const message = String(error?.message || "");
  return (
    message.match(/found in field "([^"]+)"/i)?.[1] ||
    message.match(/field "([^"]+)"/i)?.[1] ||
    null
  );
}

function createPreflightError(candidate, issue, cause) {
  const fieldPath = issue?.fieldPath || firestoreErrorFieldPath(cause);
  const incompatibleType =
    issue?.incompatibleType || "FirestoreSerializationError";
  const reason = issue?.reason || String(cause?.message || cause);
  const error = new Error(
    `Preflight Firestore inválido para ${candidate.id}` +
      `${fieldPath ? ` en ${fieldPath}` : ""}: ${reason}`
  );
  error.cause = cause;
  error.preflightFailure = {
    status: "failed",
    providerId: candidate.id,
    sourceIndex: candidate.sourceIndex,
    fieldPath,
    incompatibleType,
    reason,
    batchCommitted: false,
    remoteWrites: 0,
  };
  return error;
}

function validateCandidatesBeforeApply(db, candidates, batchSize = 400) {
  const contract = loadProviderContract();
  let batchesPrepared = 0;

  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    const batch = db.batch();
    const batchCandidates = candidates.slice(offset, offset + batchSize);
    for (const candidate of batchCandidates) {
      try {
        contract.assertValidProveedor(candidate.document);
        const issue = findFirestoreIncompatibleValue(candidate.document);
        if (issue) {
          throw createPreflightError(candidate, issue, null);
        }
        const ref = db.collection("proveedores").doc(candidate.id);
        batch.create(ref, candidate.document);
      } catch (error) {
        if (error?.preflightFailure) throw error;
        throw createPreflightError(candidate, null, error);
      }
    }
    batchesPrepared += 1;
  }

  return {
    status: "passed",
    candidatesValidated: candidates.length,
    batchesPrepared,
    batchCommitted: false,
    remoteWrites: 0,
  };
}

async function verifyRequiredProviderCategories(db, candidates) {
  const categoryIds = [
    ...new Set(
      candidates.flatMap((candidate) =>
        candidate.document.categoriaIds.filter(Boolean)
      )
    ),
  ].sort();
  if (categoryIds.length === 0) {
    return { checked: 0, categoryIds: [] };
  }

  const references = categoryIds.map((categoryId) =>
    db.collection("categorias_proveedores").doc(categoryId)
  );
  const snapshots = await db.getAll(...references);
  const missingCategoryIds = [];
  const incompatibleCategoryIds = [];
  snapshots.forEach((snapshot, index) => {
    const categoryId = categoryIds[index];
    if (!snapshot.exists) {
      missingCategoryIds.push(categoryId);
      return;
    }
    const data = snapshot.data();
    if (
      data?.slug !== categoryId ||
      data?.activa !== true
    ) {
      incompatibleCategoryIds.push(categoryId);
    }
  });

  if (
    missingCategoryIds.length > 0 ||
    incompatibleCategoryIds.length > 0
  ) {
    const error = new Error(
      "Faltan categorías requeridas o no están activas/con un slug compatible."
    );
    error.categoryPreflightFailure = {
      status: "failed",
      missingCategoryIds,
      incompatibleCategoryIds,
      batchCommitted: false,
      remoteWrites: 0,
    };
    throw error;
  }

  return {
    checked: categoryIds.length,
    categoryIds,
  };
}

async function applyCandidateBatch(
  db,
  candidates,
  { onExistingMatch = null } = {}
) {
  const refs = candidates.map((candidate) =>
    db.collection("proveedores").doc(candidate.id)
  );
  const snapshots = refs.length > 0 ? await db.getAll(...refs) : [];
  const batch = db.batch();
  let creates = 0;
  let existingSkipped = 0;

  snapshots.forEach((snapshot, index) => {
    const candidate = candidates[index];
    if (snapshot.exists) {
      const existingNormalizedUrl =
        snapshot.data()?.fuente?.urlOriginalNormalizada || null;
      const nextNormalizedUrl =
        candidate.document.fuente.urlOriginalNormalizada;
      if (
        !existingNormalizedUrl ||
        existingNormalizedUrl !== nextNormalizedUrl
      ) {
        throw new Error(
          `Colisión de identidad en ${candidate.id}; se aborta sin sobrescribir.`
        );
      }
      existingSkipped += 1;
      if (typeof onExistingMatch === "function") {
        onExistingMatch({
          providerId: candidate.id,
          sourceIndex: candidate.sourceIndex,
          urlPath: (() => {
            try {
              return new URL(nextNormalizedUrl).pathname;
            } catch {
              return null;
            }
          })(),
          matchReason: "same_normalized_url_existing_document",
        });
      }
      return;
    }
    batch.create(snapshot.ref, candidate.document);
    creates += 1;
  });

  if (creates > 0) {
    await batch.commit();
  }
  return { creates, existingSkipped };
}

async function runApply({
  db,
  candidates,
  resumeStatePath,
  source,
  args,
  effectiveStartIndex,
  existingMatches,
}) {
  const totals = {
    candidates: candidates.length,
    created: 0,
    existingSkipped: 0,
    batchesCommitted: 0,
  };

  for (let offset = 0; offset < candidates.length; offset += args.batchSize) {
    const batchCandidates = candidates.slice(offset, offset + args.batchSize);
    const result = await applyCandidateBatch(db, batchCandidates, {
      onExistingMatch: (match) => existingMatches.push(match),
    });
    totals.created += result.creates;
    totals.existingSkipped += result.existingSkipped;
    if (result.creates > 0) totals.batchesCommitted += 1;

    writeJsonAtomic(resumeStatePath, {
      stateVersion: 1,
      inputHashSha256: source.inputHashSha256,
      sourceFileName: source.fileName,
      projectId: args.project,
      lastSourceIndex: batchCandidates[batchCandidates.length - 1].sourceIndex,
      completed: false,
      totals,
      updatedAt: new Date().toISOString(),
    });
  }

  const lastSourceIndex =
    args.limit > 0 && candidates.length >= args.limit
      ? candidates[candidates.length - 1].sourceIndex
      : source.envelope.results.length - 1;
  writeJsonAtomic(resumeStatePath, {
    stateVersion: 1,
    inputHashSha256: source.inputHashSha256,
    sourceFileName: source.fileName,
    projectId: args.project,
    lastSourceIndex: Math.max(lastSourceIndex, effectiveStartIndex - 1),
    completed: args.limit === 0,
    totals,
    updatedAt: new Date().toISOString(),
  });
  return totals;
}

function printHelp() {
  console.log(
    [
      "Dry-run local (predeterminado, sin Firebase):",
      "  node scripts/providers/importProviders.cjs --dry-run --input=RUTA [--input-format=json|csv] [--category=foto-video] [--limit=10]",
      "",
      "Aplicación futura (NO ejecutar sin ventana aprobada):",
      "  node scripts/providers/importProviders.cjs --apply --input=RUTA --project=ID --confirm-project=ID --credentials=RUTA [--limit=10] [--resume-state=RUTA]",
      "",
      "El modo apply crea documentos ausentes y omite documentos existentes del mismo origen.",
      "Nunca actualiza ni fusiona por nombre.",
    ].join("\n")
  );
}

async function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }
  if (!args.input) throw new Error("Falta --input=RUTA.");

  const source = readProviderSourceFile(args.input, {
    inputFormat: args.inputFormat,
    category: args.category,
  });
  const resumeStatePath = path.resolve(
    process.cwd(),
    args.resumeState ||
      defaultRuntimePath(`import-state-${source.inputHashSha256.slice(0, 12)}.json`)
  );
  const resumeState = readResumeState(
    resumeStatePath,
    source.inputHashSha256
  );
  if (
    args.apply &&
    resumeState?.projectId &&
    resumeState.projectId !== args.project
  ) {
    throw new Error(
      "El estado de reanudación pertenece a otro proyecto; se aborta."
    );
  }
  const analysis = analyzeProviderEnvelope(source.envelope, {
    sourceFileName: source.fileName,
    inputFormat: source.inputFormat,
    inputDiagnostics: source.inputDiagnostics,
    inputHashSha256: source.inputHashSha256,
    sampleLimit: args.sampleLimit,
  });
  const {
    candidates,
    effectiveStartIndex,
    duplicateNameGroups,
    sampleDocuments,
  } = buildImportCandidates(source, args, resumeState);

  const baseReport = {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: args.apply ? "apply" : "dry_run_local_only",
    source: analysis.source,
    analysisTotals: analysis.totals,
    inputQuality: {
      phones: {
        leadingExcelApostropheCleaned:
          analysis.phones.leadingExcelApostropheCleaned,
        missing: analysis.phones.missing,
        notNormalized: analysis.phones.notNormalized,
      },
      websites: {
        classifications: analysis.websites.classifications,
      },
      locations: analysis.locations,
      internalDuplicateNames:
        analysis.duplicates.possibleByNormalizedName,
      manualReview: {
        requiredProviders: analysis.manualReview.requiredProviders,
        reasonOccurrences: analysis.manualReview.reasonOccurrences,
        providersWithMultipleReasons:
          analysis.manualReview.providersWithMultipleReasons,
        byReason: analysis.manualReview.byReason,
      },
      categories: {
        finalDistribution: analysis.categories.finalDistribution,
        providersWithoutInternalCategory:
          analysis.manualReview.providersWithoutInternalCategory,
      },
    },
    plan: {
      effectiveStartIndex,
      limit: args.limit || null,
      batchSize: args.batchSize,
      candidates: candidates.length,
      possibleDuplicateNameGroups: duplicateNameGroups.length,
      candidatesRequiringManualReview: candidates.filter(
        (candidate) => candidate.document.revisionManual.requerida
      ).length,
      deterministicCreateOrSkip: true,
      mergeByName: false,
      updatesExistingDocuments: false,
    },
    sampleDocuments,
  };

  if (!args.apply) {
    const reportPath = writeJsonAtomic(
      args.report ||
        defaultRuntimePath(`import-dry-run-${source.inputHashSha256.slice(0, 12)}.json`),
      baseReport
    );
    console.log(
      JSON.stringify(
        {
          mode: baseReport.mode,
          inputFormat: source.inputFormat,
          records: analysis.totals.records,
          eligible: analysis.totals.eligible,
          discarded: analysis.totals.discarded,
          candidates: candidates.length,
          possibleInternalDuplicateNameGroups:
            duplicateNameGroups.length,
          recordsRequiringManualReview:
            analysis.totals.manualReviewRequiredProviders,
          phonesWithLeadingExcelApostropheCleaned:
            analysis.totals.phonesWithLeadingExcelApostropheCleaned,
          phonesNotNormalized: analysis.totals.phonesNotNormalized,
          phonesMissing: analysis.totals.phonesMissing,
          websiteClassifications:
            analysis.websites.classifications,
          recordsWithoutUsableLocation:
            analysis.totals.recordsWithoutUsableLocation,
          recordsWithoutInternalCategory:
            analysis.totals.providersWithoutInternalCategory,
          firebaseInitialized: false,
          remoteReads: 0,
          remoteWrites: 0,
          reportPath,
        },
        null,
        2
      )
    );
    return baseReport;
  }

  const db = initializeAdminForApply(args);
  const preflight = validateCandidatesBeforeApply(
    db,
    candidates,
    args.batchSize
  );
  const categoryPreflight = await verifyRequiredProviderCategories(
    db,
    candidates
  );
  const existingMatches = [];
  const applyTotals = await runApply({
    db,
    candidates,
    resumeStatePath,
    source,
    args,
    effectiveStartIndex,
    existingMatches,
  });
  const existingMatchesReportPath = writeJsonAtomic(
    defaultRuntimePath(
      `existing-provider-matches-${source.inputHashSha256.slice(0, 12)}-${Date.now()}.json`
    ),
    {
      reportVersion: 1,
      generatedAt: new Date().toISOString(),
      mode: "authorized_remote_existing_match_report",
      projectId: args.project,
      source: {
        fileName: source.fileName,
        inputFormat: source.inputFormat,
        inputHashSha256: source.inputHashSha256,
      },
      privacy: {
        containsRawEmails: false,
        containsRawPhones: false,
        containsFullAddresses: false,
      },
      matches: existingMatches,
    }
  );
  const finalReport = {
    ...baseReport,
    projectId: args.project,
    preflight,
    categoryPreflight,
    applyTotals,
    existingMatches: {
      count: existingMatches.length,
      reportPath: existingMatchesReportPath,
    },
    resumeStatePath,
  };
  const reportPath = writeJsonAtomic(
    args.report ||
      defaultRuntimePath(`import-apply-${source.inputHashSha256.slice(0, 12)}.json`),
    finalReport
  );
  console.log(
    JSON.stringify(
      {
        mode: finalReport.mode,
        projectId: args.project,
        ...applyTotals,
        existingMatches: existingMatches.length,
        existingMatchesReportPath,
        reportPath,
        resumeStatePath,
      },
      null,
      2
    )
  );
  return finalReport;
}

if (require.main === module) {
  run().catch((error) => {
    if (error?.preflightFailure) {
      console.error(
        JSON.stringify(
          {
            mode: "apply_preflight_failed",
            error: error.message,
            ...error.preflightFailure,
          },
          null,
          2
        )
      );
      process.exitCode = 1;
      return;
    }
    if (error?.categoryPreflightFailure) {
      console.error(
        JSON.stringify(
          {
            mode: "apply_category_preflight_failed",
            error: error.message,
            ...error.categoryPreflightFailure,
          },
          null,
          2
        )
      );
      process.exitCode = 1;
      return;
    }
    console.error(`Provider import failed safely: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  applyCandidateBatch,
  buildSanitizedSampleDocuments,
  buildImportCandidates,
  deleteImporterApp: deleteApp,
  findFirestoreIncompatibleValue,
  getImporterFirebaseResolution: () => ({
    app: require.resolve("firebase-admin/app"),
    firestore: require.resolve("firebase-admin/firestore"),
  }),
  initializeAdminForApply,
  initializeFirestoreForEmulator,
  parseArgs,
  readResumeState,
  run,
  validateCandidatesBeforeApply,
  verifyRequiredProviderCategories,
};
