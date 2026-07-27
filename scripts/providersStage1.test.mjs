import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const analyzer = require("./providers/analyzeProviderJson.cjs");
const importer = require("./providers/importProviders.cjs");
const providers = analyzer.loadProviderContract();
const functionsRequire = createRequire(
  new URL("../functions/lib/providers/mapper.js", import.meta.url)
);

function sourceFile(results) {
  return providers.parseProviderSourceFile({
    version: 9,
    createdAt: "2026-07-26T18:17:40.871Z",
    reason: "final",
    origin: "https://www.portalcasamientos.com.ar",
    providerUrls: [],
    results,
  });
}

function record(overrides = {}) {
  return {
    categoria: "belleza-novias",
    nombre: "Proveedor sintético",
    pagina:
      "https://portalcasamientos.com.ar/belleza-novias/proveedor-sintetico-ab123/",
    sitio_web: "https://example.com",
    telefono: "1122223333",
    email: "private@example.com | bad@",
    direccion: "Calle privada 123, Ciudad",
    calle: "Calle privada 123",
    localidad: "Ciudad",
    provincia: "Provincia de Buenos Aires",
    codigo_postal: "",
    pais: "AR",
    tipo_schema: "LocalBusiness",
    fuente_extraccion: "json-ld",
    ...overrides,
  };
}

test("local analysis reports quality signals without copying personal data", () => {
  const envelope = sourceFile([
    record(),
    record(),
    record({
      pagina: "https://portalcasamientos.com.ar/buenos-aires/",
      nombre: "Buenos Aires",
    }),
  ]);
  const report = analyzer.analyzeProviderEnvelope(envelope, {
    sourceFileName: "private-source.json",
    inputHashSha256: "abc123",
    sampleLimit: 10,
  });

  assert.equal(report.totals.records, 3);
  assert.equal(report.totals.eligible, 1);
  assert.equal(report.totals.duplicateUrlGroups, 1);
  assert.equal(report.totals.duplicateRecordsAfterFirst, 1);
  assert.equal(report.totals.emailDiscardedValues, 3);
  assert.equal(
    report.emails.summary.recordsWithSyntacticallyInvalidEmail,
    3
  );
  assert.equal(report.emails.summary.discardedValues.syntacticallyInvalid, 3);
  assert.equal(report.privacy.containsRawEmails, false);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /private@example\.com/);
  assert.doesNotMatch(serialized, /1122223333/);
  assert.doesNotMatch(serialized, /Calle privada/);
});

test("email report separates valid, missing, placeholder, invalid, and multiple values", () => {
  const envelope = sourceFile([
    record({
      pagina:
        "https://portalcasamientos.com.ar/belleza-novias/uno-ab123/",
      email: "valid@example.com | tu@email.com",
    }),
    record({
      pagina:
        "https://portalcasamientos.com.ar/belleza-novias/dos-cd456/",
      email: "",
    }),
    record({
      pagina:
        "https://portalcasamientos.com.ar/belleza-novias/tres-ef789/",
      email: "tu@email.com",
    }),
    record({
      pagina:
        "https://portalcasamientos.com.ar/belleza-novias/cuatro-gh123/",
      email: "bad@",
    }),
    record({
      pagina:
        "https://portalcasamientos.com.ar/belleza-novias/cinco-ij456/",
      email: "one@example.com; two@example.org",
    }),
  ]);
  const report = analyzer.analyzeProviderEnvelope(envelope);
  const summary = report.emails.summary;

  assert.equal(summary.recordsWithValidPrimaryEmail, 2);
  assert.equal(summary.recordsWithoutEmail, 1);
  assert.equal(summary.recordsWithoutValidEmail, 3);
  assert.equal(summary.recordsWithPlaceholder, 2);
  assert.equal(summary.recordsWithSyntacticallyInvalidEmail, 1);
  assert.equal(summary.recordsWithMultipleValidEmails, 1);
  assert.equal(summary.recordsWithValidEmailAndSecondaryPlaceholder, 1);
  assert.deepEqual(summary.discardedValues, {
    total: 3,
    placeholders: 2,
    syntacticallyInvalid: 1,
  });
});

test("discard totals distinguish records, reason occurrences, and overlap", () => {
  const envelope = sourceFile([
    record({
      nombre: "Portal Casamientos",
      pagina:
        "https://portalcasamientos.com.ar/belleza-novias/buenos-aires/",
    }),
  ]);
  const report = analyzer.analyzeProviderEnvelope(envelope);

  assert.equal(report.discards.records, 1);
  assert.equal(report.discards.reasonOccurrences, 2);
  assert.equal(report.discards.recordsWithMultipleReasons, 1);
  assert.deepEqual(
    report.discards.byReason.map((entry) => entry.reason).sort(),
    ["navigation_or_region_page", "portal_record"]
  );
});

test("analysis keeps eligible URL identities when external ID evidence is absent", () => {
  const envelope = sourceFile([
    record(),
    record({
      nombre: "Proveedor sin identificador",
      pagina:
        "https://portalcasamientos.com.ar/belleza-novias/proveedor-sin-identificador/",
    }),
  ]);
  const report = analyzer.analyzeProviderEnvelope(envelope);

  assert.equal(report.totals.eligible, 2);
  assert.equal(report.externalIds.eligibleWithExternalId, 1);
  assert.equal(report.externalIds.eligibleWithoutExternalId, 1);
  assert.equal(report.manualReview.requiredProviders, 1);
  assert.deepEqual(
    report.manualReview.byReason.find(
      (entry) => entry.reason === "sin_id_externo"
    ),
    { reason: "sin_id_externo", count: 1 }
  );
  assert.equal(report.review.eligibleWithoutExternalIdRecords.length, 1);
  assert.equal(
    report.review.eligibleWithoutExternalIdRecords[0].motivoPosibleDuplicado,
    null
  );
});

test("future importer marks every member of a duplicate-name group", () => {
  const envelope = sourceFile([
    record(),
    record({
      pagina:
        "https://portalcasamientos.com.ar/belleza-novias/proveedor-sintetico-cd456/",
    }),
    record({
      nombre: "Proveedor distinto",
      pagina:
        "https://portalcasamientos.com.ar/belleza-novias/proveedor-distinto-ef789/",
    }),
  ]);
  const source = {
    envelope,
    fileName: "private-source.json",
    inputHashSha256: "hash",
  };
  const plan = importer.buildImportCandidates(
    source,
    { startIndex: 0, limit: 0 },
    null
  );

  assert.equal(plan.duplicateNameGroups.length, 1);
  assert.deepEqual(
    plan.candidates.slice(0, 2).map(
      (candidate) => candidate.document.revisionManual.motivos
    ),
    [
      ["posible_duplicado_nombre"],
      ["posible_duplicado_nombre"],
    ]
  );
  assert.deepEqual(plan.candidates[2].document.revisionManual, {
    requerida: false,
    motivos: [],
    revisadaEn: null,
    revisadaPor: null,
    notas: null,
  });
});

test("mapper Dates avoid cross-package Timestamp instances", () => {
  const envelope = sourceFile([record()]);
  const source = {
    envelope,
    fileName: "private-source.json",
    inputHashSha256: "hash",
  };
  const plan = importer.buildImportCandidates(
    source,
    { startIndex: 0, limit: 1 },
    null
  );
  const document = plan.candidates[0].document;
  const rootResolution = importer.getImporterFirebaseResolution();

  assert.match(
    rootResolution.firestore,
    /Reservaeldia[\\/]node_modules[\\/]firebase-admin/
  );
  assert.doesNotMatch(
    rootResolution.firestore,
    /functions[\\/]node_modules/
  );
  assert.ok(document.fuente.importadoEn instanceof Date);
  assert.ok(document.creadoEn instanceof Date);
  assert.ok(document.actualizadoEn instanceof Date);

  const { Timestamp: ForeignTimestamp } = functionsRequire(
    "firebase-admin/firestore"
  );
  const incompatibleDocument = {
    ...document,
    fuente: {
      ...document.fuente,
      importadoEn: ForeignTimestamp.now(),
    },
  };
  assert.deepEqual(
    importer.findFirestoreIncompatibleValue(incompatibleDocument),
    {
      fieldPath: "fuente.importadoEn",
      incompatibleType: "Timestamp",
      reason:
        "Timestamp creado por otra instancia de firebase-admin/firestore.",
    }
  );
});

test("apply preflight aborts incompatible candidates before any commit", () => {
  const envelope = sourceFile([record()]);
  const source = {
    envelope,
    fileName: "private-source.json",
    inputHashSha256: "hash",
  };
  const plan = importer.buildImportCandidates(
    source,
    { startIndex: 0, limit: 1 },
    null
  );
  const { Timestamp: ForeignTimestamp } = functionsRequire(
    "firebase-admin/firestore"
  );
  const invalidCandidate = {
    ...plan.candidates[0],
    document: {
      ...plan.candidates[0].document,
      fuente: {
        ...plan.candidates[0].document.fuente,
        importadoEn: ForeignTimestamp.now(),
      },
    },
  };
  let batchCreateCalls = 0;
  let batchCommitCalls = 0;
  const fakeDb = {
    batch: () => ({
      create: () => {
        batchCreateCalls += 1;
      },
      commit: () => {
        batchCommitCalls += 1;
      },
    }),
    collection: () => ({
      doc: () => ({ id: invalidCandidate.id }),
    }),
  };

  assert.throws(
    () =>
      importer.validateCandidatesBeforeApply(
        fakeDb,
        [invalidCandidate],
        400
      ),
    (error) => {
      assert.deepEqual(error.preflightFailure, {
        status: "failed",
        providerId: invalidCandidate.id,
        sourceIndex: invalidCandidate.sourceIndex,
        fieldPath: "fuente.importadoEn",
        incompatibleType: "Timestamp",
        reason:
          "Timestamp creado por otra instancia de firebase-admin/firestore.",
        batchCommitted: false,
        remoteWrites: 0,
      });
      return true;
    }
  );
  assert.equal(batchCreateCalls, 0);
  assert.equal(batchCommitCalls, 0);
});

test("dry-run samples are representative, sanitized, and match mapped review state", () => {
  const envelope = sourceFile([
    record(),
    record({
      categoria: "musica-bodas",
      nombre: "Proveedor música",
      pagina:
        "https://portalcasamientos.com.ar/musica-bodas/proveedor-musica-cd456/",
    }),
    record({
      categoria: "experiencias-adicionales",
      nombre: "Proveedor experiencia",
      pagina:
        "https://portalcasamientos.com.ar/experiencias-adicionales/proveedor-experiencia-ef789/",
    }),
    record({
      nombre: "Proveedor duplicado",
      pagina:
        "https://portalcasamientos.com.ar/belleza-novias/proveedor-duplicado-gh123/",
    }),
    record({
      nombre: "Proveedor duplicado",
      pagina:
        "https://portalcasamientos.com.ar/belleza-novias/proveedor-duplicado-ij456/",
    }),
    record({
      nombre: "Proveedor sin identificador",
      pagina:
        "https://portalcasamientos.com.ar/belleza-novias/proveedor-sin-identificador/",
    }),
    record({
      categoria: "novias",
      nombre: "Proveedor con varios motivos",
      pagina:
        "https://portalcasamientos.com.ar/novias/proveedor-con-varios-motivos/",
    }),
    record({
      categoria: "novias",
      nombre: "Proveedor con varios motivos",
      pagina:
        "https://portalcasamientos.com.ar/novias/proveedor-con-varios-motivos-kl789/",
    }),
  ]);
  const source = {
    envelope,
    fileName: "private-source.json",
    inputHashSha256: "hash",
  };
  const plan = importer.buildImportCandidates(
    source,
    { startIndex: 0, limit: 10 },
    null
  );
  const samples = plan.sampleDocuments;

  assert.ok(samples.length >= 5 && samples.length <= 10);
  assert.ok(samples.some((sample) => !sample.revisionManual.requerida));
  assert.ok(samples.some((sample) => sample.categoriaPrincipalId));
  assert.ok(samples.some((sample) => !sample.categoriaPrincipalId));
  assert.ok(
    samples.some((sample) =>
      sample.revisionManual.motivos.includes(
        "posible_duplicado_nombre"
      )
    )
  );
  assert.ok(
    samples.some((sample) =>
      sample.revisionManual.motivos.some((reason) =>
        [
          "categoria_contenedora_novias",
          "categoria_contenedora_experiencias_adicionales",
        ].includes(reason)
      )
    )
  );
  assert.ok(
    samples.some((sample) =>
      sample.revisionManual.motivos.includes("sin_id_externo")
    )
  );
  assert.ok(
    samples.some((sample) => sample.revisionManual.motivos.length > 1)
  );

  for (const sample of samples) {
    assert.equal(sample.schemaVersion, 2);
    assert.equal(sample.visible, false);
    assert.deepEqual(Object.keys(sample.email), [
      "tieneEmailPrincipal",
      "cantidadEmailsAlternativos",
    ]);
    assert.deepEqual(Object.keys(sample.telefono), [
      "tieneTelefonoOriginal",
      "tieneTelefonoNormalizado",
      "tieneWhatsapp",
      "whatsappCoincideConTelefonoNormalizado",
    ]);
    assert.deepEqual(Object.keys(sample.ubicacion), [
      "ciudad",
      "nivel1Nombre",
      "paisCodigo",
      "regionMetropolitana",
      "subregionMetropolitana",
    ]);
    const mappedCandidate = plan.allMappedCandidates.find(
      (candidate) => candidate.id === sample.providerId
    );
    assert.ok(mappedCandidate);
    assert.deepEqual(
      sample.revisionManual,
      mappedCandidate.document.revisionManual
    );
    assert.equal(
      sample.telefono.tieneWhatsapp,
      Boolean(mappedCandidate.document.contacto.whatsapp)
    );
    assert.equal(
      sample.telefono.whatsappCoincideConTelefonoNormalizado,
      Boolean(mappedCandidate.document.contacto.whatsapp) &&
        mappedCandidate.document.contacto.whatsapp ===
          mappedCandidate.document.contacto.telefonoNormalizado
    );
  }

  const serialized = JSON.stringify(samples);
  assert.doesNotMatch(serialized, /private@example\.com/);
  assert.doesNotMatch(serialized, /1122223333/);
  assert.doesNotMatch(serialized, /Calle privada 123/);
  assert.doesNotMatch(
    serialized,
    /"telefonoOriginal"|"telefonoNormalizado"|"whatsapp":/
  );
  assert.doesNotMatch(
    serialized,
    /direccionOriginal|direccionCompleta|"calle"|"numero"/
  );
});

test("dry import planning is deterministic and excludes duplicate URLs", () => {
  const envelope = sourceFile([
    record(),
    record(),
    record({
      nombre: "Segundo proveedor",
      pagina:
        "https://portalcasamientos.com.ar/belleza-novias/segundo-proveedor-cd456/",
    }),
  ]);
  const source = {
    envelope,
    fileName: "private-source.json",
    inputHashSha256: "hash",
  };
  const args = {
    startIndex: 0,
    limit: 0,
  };

  const firstPlan = importer.buildImportCandidates(source, args, null);
  const secondPlan = importer.buildImportCandidates(source, args, null);
  assert.equal(firstPlan.candidates.length, 2);
  assert.deepEqual(
    firstPlan.candidates.map((candidate) => candidate.id),
    secondPlan.candidates.map((candidate) => candidate.id)
  );
  assert.deepEqual(
    firstPlan.candidates.map((candidate) => candidate.sourceIndex),
    [0, 2]
  );
});

test("limit repeats without state and advances without gaps with resume state", () => {
  const envelope = sourceFile([
    record(),
    record(),
    record({
      nombre: "Segundo proveedor",
      pagina:
        "https://portalcasamientos.com.ar/belleza-novias/segundo-proveedor-cd456/",
    }),
    record({
      nombre: "Buenos Aires",
      pagina: "https://portalcasamientos.com.ar/buenos-aires/",
    }),
    record({
      nombre: "Tercer proveedor",
      pagina:
        "https://portalcasamientos.com.ar/belleza-novias/tercer-proveedor-ef789/",
    }),
    record({
      nombre: "Cuarto proveedor",
      pagina:
        "https://portalcasamientos.com.ar/belleza-novias/cuarto-proveedor-gh012/",
    }),
  ]);
  const source = {
    envelope,
    fileName: "private-source.json",
    inputHashSha256: "same-input-hash",
  };
  const args = { startIndex: 0, limit: 2 };

  const first = importer.buildImportCandidates(source, args, null);
  const repeatedWithoutState = importer.buildImportCandidates(
    source,
    args,
    null
  );
  assert.deepEqual(
    first.candidates.map((candidate) => candidate.sourceIndex),
    [0, 2]
  );
  assert.deepEqual(
    repeatedWithoutState.candidates.map((candidate) => candidate.id),
    first.candidates.map((candidate) => candidate.id)
  );

  const resumed = importer.buildImportCandidates(source, args, {
    inputHashSha256: source.inputHashSha256,
    lastSourceIndex: 2,
  });
  assert.equal(resumed.effectiveStartIndex, 3);
  assert.deepEqual(
    resumed.candidates.map((candidate) => candidate.sourceIndex),
    [4, 5]
  );
  assert.deepEqual(
    new Set([
      ...first.candidates.map((candidate) => candidate.id),
      ...resumed.candidates.map((candidate) => candidate.id),
    ]).size,
    4
  );
});

test("reimport skips an existing URL identity without overwriting it", async () => {
  const envelope = sourceFile([record()]);
  const source = {
    envelope,
    fileName: "private-source.json",
    inputHashSha256: "hash",
  };
  const candidate = importer.buildImportCandidates(
    source,
    { startIndex: 0, limit: 1 },
    null
  ).candidates[0];
  let createCalls = 0;
  let commitCalls = 0;
  const existingDocument = {
    fuente: {
      urlOriginalNormalizada:
        candidate.document.fuente.urlOriginalNormalizada,
    },
    contacto: {
      whatsapp: "valor-existente-no-modificable",
    },
  };
  const fakeDb = {
    collection: () => ({
      doc: () => ({ id: candidate.id }),
    }),
    getAll: async (...refs) =>
      refs.map((ref) => ({
        exists: true,
        ref,
        data: () => existingDocument,
      })),
    batch: () => ({
      create: () => {
        createCalls += 1;
      },
      commit: async () => {
        commitCalls += 1;
      },
    }),
  };

  const result = await importer.applyCandidateBatch(fakeDb, [candidate]);
  assert.deepEqual(result, { creates: 0, existingSkipped: 1 });
  assert.equal(createCalls, 0);
  assert.equal(commitCalls, 0);
  assert.equal(
    existingDocument.contacto.whatsapp,
    "valor-existente-no-modificable"
  );
});

test("analysis flags same-name providers on distinct URLs without merging them", () => {
  const envelope = sourceFile([
    record(),
    record({
      pagina:
        "https://portalcasamientos.com.ar/belleza-novias/proveedor-sintetico-cd456/",
    }),
  ]);
  const report = analyzer.analyzeProviderEnvelope(envelope, {
    sourceFileName: "private-source.json",
  });

  assert.equal(report.totals.eligible, 2);
  assert.equal(report.totals.possibleCrossUrlDuplicateNameGroups, 1);
  assert.equal(report.totals.providersWithPossibleDuplicateNameReview, 2);
  assert.equal(report.manualReview.requiredProviders, 2);
  assert.equal(report.manualReview.reasonOccurrences, 2);
  assert.equal(report.manualReview.providersWithMultipleReasons, 0);
  assert.deepEqual(
    report.manualReview.records.map((entry) => entry.index),
    [0, 1]
  );
  assert.deepEqual(
    report.manualReview.records.map((entry) => entry.motivosRevision),
    [
      ["posible_duplicado_nombre"],
      ["posible_duplicado_nombre"],
    ]
  );
  assert.equal(
    report.duplicates.possibleByNormalizedName[0].providerIds.length,
    2
  );
  assert.equal(report.review.possibleDuplicateRecords.length, 2);
  const reviewRecord = report.review.possibleDuplicateRecords[0];
  assert.deepEqual(Object.keys(reviewRecord), [
    "index",
    "providerId",
    "nombreNormalizado",
    "categoriaOriginal",
    "urlPath",
    "slug",
    "idExterno",
    "localidad",
    "provincia",
    "motivoPosibleDuplicado",
    "motivosRevision",
  ]);
  assert.match(
    reviewRecord.motivoPosibleDuplicado,
    /posible_duplicado_nombre/
  );
});

test("analysis rejects generic portal navigation records without false external IDs", () => {
  const envelope = sourceFile([
    record({
      nombre: "PortalCasamientos.com.ar",
      pagina:
        "https://portalcasamientos.com.ar/belleza-novias/rio-negro/",
    }),
  ]);
  const report = analyzer.analyzeProviderEnvelope(envelope);
  const reviewRecord = report.review.rejectedGenericOrNavigationRecords[0];

  assert.equal(report.totals.eligible, 0);
  assert.equal(reviewRecord.idExterno, null);
  assert.equal(reviewRecord.slug, "rio-negro");
  assert.deepEqual(reviewRecord.motivosRevision, [
    "generic_portal_identity",
    "navigation_or_region_page",
  ]);
});

test("analysis reports explicit confirmed and ambiguous category decisions", () => {
  const envelope = sourceFile([
    record({
      categoria: "musica-bodas",
      nombre: "Proveedor música",
    }),
    record({
      categoria: "experiencias-adicionales",
      nombre: "Proveedor experiencia",
      pagina:
        "https://portalcasamientos.com.ar/experiencias-adicionales/experiencia-cd456/",
    }),
  ]);
  const report = analyzer.analyzeProviderEnvelope(envelope);

  assert.equal(report.totals.sourceCategories, 2);
  assert.equal(report.totals.confirmedCategoryMappings, 1);
  assert.equal(report.totals.categoriesRequiringReview, 1);
  assert.equal(report.totals.unknownCategories, 0);
  assert.equal(report.totals.manualReviewRequiredProviders, 1);
  assert.equal(report.totals.providersWithoutInternalCategory, 1);
  assert.deepEqual(report.categories.finalDistribution, [
    { categoryId: null, count: 1 },
    { categoryId: "musica-bodas", count: 1 },
  ]);
  assert.deepEqual(
    report.manualReview.byReason.find(
      (entry) =>
        entry.reason ===
        "categoria_contenedora_experiencias_adicionales"
    ),
    {
      reason: "categoria_contenedora_experiencias_adicionales",
      count: 1,
    }
  );
  assert.equal(report.categories.source[0].count, 1);
  assert.equal(report.categories.source[1].count, 1);
});

test("apply mode fails closed without explicit matching project and credentials", () => {
  assert.throws(
    () =>
      importer.initializeAdminForApply({
        project: "",
        confirmProject: "",
        credentials: "",
      }),
    /requiere --project/
  );
  assert.throws(
    () =>
      importer.initializeAdminForApply({
        project: "project-a",
        confirmProject: "project-b",
        credentials: "missing.json",
      }),
    /mismo valor/
  );
  assert.throws(
    () =>
      importer.initializeAdminForApply({
        project: "project-a",
        confirmProject: "project-a",
        credentials: "",
      }),
    /requiere --credentials/
  );
});

test("import CLI defaults to dry-run and rejects oversized batches", () => {
  assert.equal(
    importer.parseArgs(["--input=providers.json"]).apply,
    false
  );
  assert.deepEqual(
    importer.parseArgs([
      "--input=providers.csv",
      "--input-format=csv",
      "--category=foto-video",
    ]),
    {
      apply: false,
      input: "providers.csv",
      inputFormat: "csv",
      category: "foto-video",
      report: "",
      resumeState: "",
      credentials: "",
      project: "",
      confirmProject: "",
      batchSize: 200,
      limit: 0,
      startIndex: 0,
      sampleLimit: 25,
    }
  );
  assert.throws(
    () =>
      importer.parseArgs([
        "--input=providers.json",
        "--apply",
        "--batch-size=401",
      ]),
    /no puede superar 400/
  );
});
