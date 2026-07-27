import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const functionsRequire = createRequire(
  new URL("../functions/lib/providers/mapper.js", import.meta.url)
);
const analyzer = require("./providers/analyzeProviderJson.cjs");
const importer = require("./providers/importProviders.cjs");
const providers = analyzer.loadProviderContract();
const { Timestamp: FunctionsTimestamp } = functionsRequire(
  "firebase-admin/firestore"
);

function sourceFile(results) {
  return providers.parseProviderSourceFile({
    version: 9,
    createdAt: "2026-07-26T18:17:40.871Z",
    reason: "emulator-integration",
    origin: "https://www.portalcasamientos.com.ar",
    providerUrls: [],
    results,
  });
}

test("the importer SDK accepts a mapped provider batch in Firestore emulator", async (context) => {
  assert.ok(
    process.env.FIRESTORE_EMULATOR_HOST,
    "FIRESTORE_EMULATOR_HOST must be set by the emulator runner"
  );

  const { app, db } = importer.initializeFirestoreForEmulator({
    projectId: "demo-reservaeldia-providers",
    appName: `provider-import-emulator-${process.pid}`,
  });
  context.after(async () => {
    await importer.deleteImporterApp(app);
  });

  const envelope = sourceFile([
    {
      categoria: "belleza-novias",
      nombre: "A flor de Piel",
      pagina:
        "https://www.portalcasamientos.com.ar/belleza-novias/a-flor-de-piel-qon2o/",
      sitio_web: "https://example.test",
      telefono: "1122223344",
      email: "contacto@example.test | tu@email.com",
      direccion:
        "Avenida Ejemplo 2343, Ramos Mejía, Provincia de Buenos Aires, AR",
      calle: "Avenida Ejemplo 2343",
      localidad: "Ramos Mejía",
      provincia: "Provincia de Buenos Aires",
      codigo_postal: "",
      pais: "AR",
      tipo_schema: "BeautySalon",
      fuente_extraccion: "json-ld",
    },
  ]);
  const source = {
    envelope,
    fileName: "emulator-provider.json",
    inputHashSha256: "emulator-hash",
  };
  const plan = importer.buildImportCandidates(
    source,
    { startIndex: 0, limit: 1 },
    null
  );
  const candidate = plan.candidates[0];

  assert.ok(candidate.document.fuente.importadoEn instanceof Date);
  assert.ok(candidate.document.creadoEn instanceof Date);
  assert.ok(candidate.document.actualizadoEn instanceof Date);

  const reference = db.collection("proveedores").doc(candidate.id);
  const incompatibleCandidate = {
    ...candidate,
    document: {
      ...candidate.document,
      fuente: {
        ...candidate.document.fuente,
        importadoEn: FunctionsTimestamp.now(),
      },
    },
  };

  assert.throws(
    () =>
      importer.validateCandidatesBeforeApply(
        db,
        [incompatibleCandidate],
        400
      ),
    (error) => {
      assert.equal(error.preflightFailure.status, "failed");
      assert.equal(
        error.preflightFailure.fieldPath,
        "fuente.importadoEn"
      );
      assert.equal(error.preflightFailure.incompatibleType, "Timestamp");
      assert.equal(error.preflightFailure.batchCommitted, false);
      assert.equal(error.preflightFailure.remoteWrites, 0);
      return true;
    }
  );
  assert.equal((await reference.get()).exists, false);

  const preflight = importer.validateCandidatesBeforeApply(
    db,
    [candidate],
    400
  );
  assert.deepEqual(preflight, {
    status: "passed",
    candidatesValidated: 1,
    batchesPrepared: 1,
    batchCommitted: false,
    remoteWrites: 0,
  });

  const writeResult = await importer.applyCandidateBatch(db, [candidate]);
  assert.deepEqual(writeResult, {
    creates: 1,
    existingSkipped: 0,
  });

  const snapshot = await reference.get();
  assert.equal(snapshot.exists, true);
  const stored = snapshot.data();

  assert.equal(stored.fuente.importadoEn.constructor.name, "Timestamp");
  assert.equal(stored.creadoEn.constructor.name, "Timestamp");
  assert.equal(stored.actualizadoEn.constructor.name, "Timestamp");
  assert.ok(stored.fuente.importadoEn.toDate() instanceof Date);
  assert.deepEqual(providers.validateProveedor(stored), []);

  const reimportResult = await importer.applyCandidateBatch(db, [
    {
      ...candidate,
      document: {
        ...candidate.document,
        nombre: "Este valor no debe sobrescribir el existente",
      },
    },
  ]);
  assert.deepEqual(reimportResult, {
    creates: 0,
    existingSkipped: 1,
  });
  const storedAfterReimport = (await reference.get()).data();
  assert.equal(storedAfterReimport.nombre, candidate.document.nombre);
  assert.equal(
    storedAfterReimport.contacto.whatsapp,
    candidate.document.contacto.whatsapp
  );

  await reference.delete();
});
