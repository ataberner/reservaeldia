import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const inputAdapter = require("./providers/providerInput.cjs");
const analyzer = require("./providers/analyzeProviderJson.cjs");
const importer = require("./providers/importProviders.cjs");
const providers = analyzer.loadProviderContract();

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

function csvRecord(overrides = {}) {
  return {
    nombre: "Foto Proveedor",
    pagina:
      "https://www.portalcasamientos.com.ar/foto-video/foto-proveedor-ab123/",
    sitio_web: "https://foto.example.test",
    telefono: "'+5491166275748",
    email: "contacto@foto.example",
    direccion: "AR",
    calle: "",
    localidad: "",
    provincia: "",
    codigo_postal: "",
    pais: "AR",
    tipo_schema: "ProfessionalService",
    ...overrides,
  };
}

function csvText(records, { bom = false } = {}) {
  const header = inputAdapter.CSV_PROVIDER_HEADERS.join(",");
  const rows = records.map((record) =>
    inputAdapter.CSV_PROVIDER_HEADERS.map((field) =>
      csvCell(record[field])
    ).join(",")
  );
  return `${bom ? "\uFEFF" : ""}${[header, ...rows].join("\r\n")}\r\n`;
}

function envelopeFromRecords(records) {
  const rows = inputAdapter.parseProviderCsv(csvText(records));
  return providers.parseProviderSourceFile({
    version: 1,
    createdAt: "2026-07-25T00:38:59.458Z",
    reason: inputAdapter.CSV_FOTO_VIDEO_EXTRACTION_SOURCE,
    origin: "https://www.portalcasamientos.com.ar",
    providerUrls: [],
    results: inputAdapter.adaptFotoVideoCsv(rows, {
      category: "foto-video",
    }),
  });
}

function mapCsvRecord(record) {
  const envelope = envelopeFromRecords([record]);
  return providers.mapPortalProviderRecord(envelope.results[0], {
    sourceFile: envelope,
    sourceFileName: inputAdapter.CSV_FOTO_VIDEO_TRACE_FILE,
  });
}

test("CSV adapter accepts UTF-8 BOM, empty fields, quoted commas, and Unicode", () => {
  const directory = mkdtempSync(join(tmpdir(), "providers-csv-"));
  try {
    const inputPath = join(directory, "proveedores-foto-video.csv");
    writeFileSync(
      inputPath,
      csvText(
        [
          csvRecord({
            nombre: "Fotografía Ñandú, Estudio",
            sitio_web: "",
            email: "",
          }),
        ],
        { bom: true }
      ),
      "utf8"
    );
    const source = analyzer.readProviderSourceFile(inputPath, {
      inputFormat: "csv",
      category: "foto-video",
    });

    assert.equal(source.inputFormat, "csv");
    assert.equal(source.inputDiagnostics.utf8BomRemoved, true);
    assert.equal(source.inputDiagnostics.csvRows, 1);
    assert.equal(source.fileName, "proveedores-contacto.csv");
    assert.equal(
      source.envelope.results[0].nombre,
      "Fotografía Ñandú, Estudio"
    );
    assert.equal(source.envelope.results[0].sitio_web, "");
    assert.equal(source.envelope.results[0].categoria, "foto-video");
    assert.equal(
      source.envelope.results[0].fuente_extraccion,
      "csv-contactos-foto-video"
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CSV adapter fails closed on missing category or incompatible headers", () => {
  const parsed = inputAdapter.parseProviderCsv(csvText([csvRecord()]));
  assert.throws(
    () => inputAdapter.adaptFotoVideoCsv(parsed, { category: "" }),
    /--category=foto-video/
  );
  assert.throws(
    () =>
      inputAdapter.parseProviderCsv(
        "nombre,pagina,telefono\nProveedor,https://example.test,+5411\n"
      ),
    /Encabezados CSV incompatibles/
  );
});

test("Excel apostrophe is preserved in the original and removed only for normalization", () => {
  const mapped = mapCsvRecord(csvRecord());
  assert.equal(
    mapped.document.contacto.telefonoOriginal,
    "'+5491166275748"
  );
  assert.equal(
    mapped.document.contacto.telefonoNormalizado,
    "+5491166275748"
  );
  assert.equal(mapped.document.contacto.whatsapp, "+5491166275748");
  assert.equal(
    providers.normalizePhone("'+5491166275748", "AR")
      .removedLeadingExcelApostrophe,
    true
  );
});

test("CSV E.164, ambiguous, and empty phones preserve the safe contact contract", () => {
  const e164 = mapCsvRecord(
    csvRecord({ telefono: "+5491166275748" })
  ).document.contacto;
  assert.equal(e164.telefonoNormalizado, "+5491166275748");
  assert.equal(e164.whatsapp, e164.telefonoNormalizado);

  const ambiguous = mapCsvRecord(
    csvRecord({ telefono: "1166275" })
  ).document.contacto;
  assert.equal(ambiguous.telefonoOriginal, "1166275");
  assert.equal(ambiguous.telefonoNormalizado, null);
  assert.equal(ambiguous.whatsapp, null);

  const empty = mapCsvRecord(csvRecord({ telefono: "" })).document.contacto;
  assert.equal(empty.telefonoOriginal, null);
  assert.equal(empty.telefonoNormalizado, null);
  assert.equal(empty.whatsapp, null);
});

test("generic AR address remains traceable but does not fabricate location", () => {
  const location = mapCsvRecord(csvRecord()).document.ubicacion;
  assert.equal(location.direccionOriginal, "AR");
  assert.equal(location.direccionCompleta, null);
  assert.equal(location.calle, null);
  assert.equal(location.numero, null);
  assert.equal(location.ciudad, null);
  assert.equal(location.nivel1Codigo, null);
  assert.equal(location.nivel1Nombre, null);
  assert.equal(location.paisCodigo, "AR");
  assert.equal(location.paisNombre, "Argentina");
});

test("CSV website values reuse the existing classifier and empty websites map to null", () => {
  const withWebsite = mapCsvRecord(csvRecord());
  assert.equal(
    withWebsite.document.contacto.sitioWeb,
    "https://foto.example.test"
  );
  assert.equal(withWebsite.diagnostics.websiteClassification, "website");

  const withoutWebsite = mapCsvRecord(csvRecord({ sitio_web: "" }));
  assert.equal(withoutWebsite.document.contacto.sitioWeb, null);
  assert.equal(withoutWebsite.diagnostics.websiteClassification, null);
});

test("CSV category, source trace, and deterministic ID match the JSON authority", () => {
  const record = csvRecord();
  const csvMapped = mapCsvRecord(record);
  const jsonEnvelope = providers.parseProviderSourceFile({
    version: 9,
    createdAt: "2026-07-26T18:17:40.871Z",
    reason: "final",
    origin: "https://www.portalcasamientos.com.ar",
    providerUrls: [],
    results: [{ ...record, categoria: "foto-video" }],
  });
  const jsonMapped = providers.mapPortalProviderRecord(
    jsonEnvelope.results[0],
    {
      sourceFile: jsonEnvelope,
      sourceFileName: "providers.json",
    }
  );

  assert.equal(csvMapped.id, jsonMapped.id);
  assert.equal(
    csvMapped.id,
    providers.createProviderDocumentId(
      csvMapped.document.fuente.urlOriginalNormalizada
    )
  );
  assert.equal(csvMapped.document.categoriaPrincipalId, "foto-video");
  assert.deepEqual(csvMapped.document.categoriaIds, ["foto-video"]);
  assert.equal(
    csvMapped.document.fuente.categoriaOriginal,
    "foto-video"
  );
  assert.equal(
    csvMapped.document.fuente.archivoOrigen,
    "proveedores-contacto.csv"
  );
  assert.equal(
    csvMapped.document.fuente.tipoSchemaOriginal,
    "ProfessionalService"
  );
  assert.equal(
    csvMapped.document.fuente.fuenteExtraccionOriginal,
    "csv-contactos-foto-video"
  );
});

test("duplicate CSV names mark every member without merging", () => {
  const envelope = envelopeFromRecords([
    csvRecord(),
    csvRecord({
      pagina:
        "https://www.portalcasamientos.com.ar/foto-video/foto-proveedor-cd456/",
    }),
  ]);
  const plan = importer.buildImportCandidates(
    {
      envelope,
      fileName: "proveedores-contacto.csv",
      inputFormat: "csv",
      inputHashSha256: "csv-hash",
    },
    { startIndex: 0, limit: 0 },
    null
  );

  assert.equal(plan.duplicateNameGroups.length, 1);
  assert.equal(plan.candidates.length, 2);
  for (const candidate of plan.candidates) {
    assert.deepEqual(candidate.document.revisionManual.motivos, [
      "posible_duplicado_nombre",
    ]);
  }
});

test("CSV dry-run metrics and samples remain private and use the current schema", () => {
  const envelope = envelopeFromRecords([
    csvRecord(),
    csvRecord({
      nombre: "Proveedor sin datos opcionales",
      pagina:
        "https://www.portalcasamientos.com.ar/foto-video/sin-datos-cd456/",
      sitio_web: "",
      telefono: "",
      email: "",
    }),
  ]);
  const source = {
    envelope,
    fileName: "proveedores-contacto.csv",
    inputFormat: "csv",
    inputHashSha256: "csv-hash",
  };
  const analysis = analyzer.analyzeProviderEnvelope(envelope, {
    sourceFileName: source.fileName,
    inputFormat: source.inputFormat,
    inputHashSha256: source.inputHashSha256,
  });
  const plan = importer.buildImportCandidates(
    source,
    { startIndex: 0, limit: 10 },
    null
  );

  assert.equal(analysis.totals.records, 2);
  assert.equal(analysis.totals.eligible, 2);
  assert.equal(analysis.totals.discarded, 0);
  assert.equal(analysis.totals.phonesWithLeadingExcelApostropheCleaned, 1);
  assert.equal(analysis.totals.phonesMissing, 1);
  assert.equal(analysis.totals.recordsWithoutWebsite, 1);
  assert.equal(analysis.totals.recordsWithoutUsableLocation, 2);
  assert.equal(analysis.totals.providersWithoutInternalCategory, 0);
  assert.equal(plan.candidates.length, 2);
  for (const candidate of plan.candidates) {
    assert.equal(candidate.document.schemaVersion, 2);
    assert.equal(candidate.document.visible, false);
    assert.equal(
      candidate.document.contacto.whatsapp,
      candidate.document.contacto.telefonoNormalizado
    );
  }

  const samples = plan.sampleDocuments;
  const serialized = JSON.stringify(samples);
  assert.doesNotMatch(serialized, /contacto@foto\.example/);
  assert.doesNotMatch(serialized, /5491166275748/);
  assert.doesNotMatch(serialized, /direccionOriginal|direccionCompleta/);
  assert.match(serialized, /tieneWhatsapp/);
});

test("CSV candidates retain create-or-skip without overwriting existing documents", async () => {
  const envelope = envelopeFromRecords([csvRecord()]);
  const candidate = importer.buildImportCandidates(
    {
      envelope,
      fileName: "proveedores-contacto.csv",
      inputFormat: "csv",
      inputHashSha256: "csv-hash",
    },
    { startIndex: 0, limit: 1 },
    null
  ).candidates[0];
  let createCalls = 0;
  let commitCalls = 0;
  const fakeDb = {
    collection: () => ({
      doc: () => ({ id: candidate.id }),
    }),
    getAll: async (...refs) =>
      refs.map((ref) => ({
        exists: true,
        ref,
        data: () => ({
          fuente: {
            urlOriginalNormalizada:
              candidate.document.fuente.urlOriginalNormalizada,
          },
        }),
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

  const matches = [];
  const result = await importer.applyCandidateBatch(fakeDb, [candidate], {
    onExistingMatch: (match) => matches.push(match),
  });
  assert.deepEqual(result, { creates: 0, existingSkipped: 1 });
  assert.equal(createCalls, 0);
  assert.equal(commitCalls, 0);
  assert.deepEqual(matches, [
    {
      providerId: candidate.id,
      sourceIndex: 0,
      urlPath: "/foto-video/foto-proveedor-ab123",
      matchReason: "same_normalized_url_existing_document",
    },
  ]);
});

test("future apply requires an active foto-video category document before writes", async () => {
  const envelope = envelopeFromRecords([csvRecord()]);
  const candidate = importer.buildImportCandidates(
    {
      envelope,
      fileName: "proveedores-contacto.csv",
      inputFormat: "csv",
      inputHashSha256: "csv-hash",
    },
    { startIndex: 0, limit: 1 },
    null
  ).candidates[0];

  const missingDb = {
    collection: () => ({
      doc: (id) => ({ id }),
    }),
    getAll: async (...refs) =>
      refs.map((ref) => ({ exists: false, ref })),
  };
  await assert.rejects(
    () =>
      importer.verifyRequiredProviderCategories(missingDb, [candidate]),
    (error) => {
      assert.deepEqual(error.categoryPreflightFailure, {
        status: "failed",
        missingCategoryIds: ["foto-video"],
        incompatibleCategoryIds: [],
        batchCommitted: false,
        remoteWrites: 0,
      });
      return true;
    }
  );

  const validDb = {
    collection: () => ({
      doc: (id) => ({ id }),
    }),
    getAll: async (...refs) =>
      refs.map((ref) => ({
        exists: true,
        ref,
        data: () => ({ slug: ref.id, activa: true }),
      })),
  };
  assert.deepEqual(
    await importer.verifyRequiredProviderCategories(validDb, [candidate]),
    {
      checked: 1,
      categoryIds: ["foto-video"],
    }
  );
});
