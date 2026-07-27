import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { getStorage } = require("firebase-admin/storage");
const analyzer = require("./providers/analyzeProviderJson.cjs");
const importer = require("./providers/importProviders.cjs");
const stateTools = require("./providers/providerEnrichmentState.cjs");
const contract = analyzer.loadProviderContract();

const PROJECT_ID =
  "demo-reservaeldia-provider-enrichment";

function sourceFile(records) {
  return contract.parseProviderSourceFile({
    version: 9,
    createdAt: "2026-07-27T12:00:00.000Z",
    reason: "enrichment-emulator-recovery",
    origin: "https://www.portalcasamientos.com.ar",
    providerUrls: [],
    results: records,
  });
}

function providerRecords() {
  return ["aa001", "aa002", "aa003"].map(
    (externalId, index) => ({
      categoria: "foto-video",
      nombre: `Emulator Provider ${index + 1}`,
      pagina: `https://www.portalcasamientos.com.ar/foto-video/emulator-provider-${externalId}/`,
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
      fuente_extraccion: "emulator-fixture",
    })
  );
}

function runWorker(argumentsList) {
  const child = spawn(
    process.execPath,
    [
      path.resolve(
        "scripts/providers/providersEnrichmentEmulatorWorker.cjs"
      ),
      ...argumentsList,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  return {
    pid: child.pid,
    completion: new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) =>
        resolve({ code, signal, stdout, stderr })
      );
    }),
  };
}

test("a killed emulator process resumes with no duplicate images or lost confirmations", async (context) => {
  assert.ok(
    process.env.FIRESTORE_EMULATOR_HOST,
    "FIRESTORE_EMULATOR_HOST is required"
  );
  assert.ok(
    process.env.FIREBASE_STORAGE_EMULATOR_HOST,
    "FIREBASE_STORAGE_EMULATOR_HOST is required"
  );
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "provider-enrichment-emulator-")
  );
  context.after(() => {
    fs.rmSync(temporaryRoot, {
      recursive: true,
      force: true,
    });
  });
  const statePath = path.join(temporaryRoot, "state.json");
  const report1 = path.join(temporaryRoot, "report-1.json");
  const report2 = path.join(temporaryRoot, "report-2.json");
  const log1 = path.join(temporaryRoot, "run-1.jsonl");
  const log2 = path.join(temporaryRoot, "run-2.jsonl");
  const imageTempRoot = path.join(temporaryRoot, "images");
  fs.mkdirSync(imageTempRoot, { recursive: true });

  const { app, db } =
    importer.initializeFirestoreForEmulator({
      projectId: PROJECT_ID,
      appName: `provider-enrichment-parent-${process.pid}`,
    });
  const bucket = getStorage(app).bucket(
    `${PROJECT_ID}.appspot.com`
  );
  context.after(async () => {
    const documents = await db.collection("proveedores").get();
    await Promise.all(
      documents.docs.map((document) =>
        document.ref.delete()
      )
    );
    const [files] = await bucket.getFiles({
      prefix: "proveedores/",
    });
    await Promise.all(
      files.map((file) =>
        file.delete({ ignoreNotFound: true })
      )
    );
    await importer.deleteImporterApp(app);
  });

  const records = providerRecords();
  const envelope = sourceFile(records);
  const mapped = records.map((record) =>
    contract.mapPortalProviderRecord(record, {
      sourceFile: envelope,
      sourceFileName: "emulator-fixture.json",
    })
  );
  const seed = db.batch();
  for (const result of mapped) {
    seed.create(
      db.collection("proveedores").doc(result.id),
      result.document
    );
  }
  await seed.commit();

  const commonArguments = [
    `--project=${PROJECT_ID}`,
    `--state=${statePath}`,
    `--temp-root=${imageTempRoot}`,
  ];
  const first = runWorker([
    ...commonArguments,
    `--report=${report1}`,
    `--log=${log1}`,
    "--crash-after=1",
  ]);
  const firstResult = await first.completion;
  assert.equal(firstResult.code, 77, firstResult.stderr);
  assert.equal(
    fs.existsSync(
      stateTools.statePaths(statePath).lock
    ),
    true
  );
  const afterCrash =
    stateTools.parseAndValidateState(statePath);
  assert.equal(afterCrash.completedCount, 1);

  const second = runWorker([
    ...commonArguments,
    `--report=${report2}`,
    `--log=${log2}`,
    "--crash-after=0",
    `--recover-pid=${first.pid}`,
  ]);
  const secondResult = await second.completion;
  assert.equal(secondResult.code, 0, secondResult.stderr);

  const finalState =
    stateTools.parseAndValidateState(statePath);
  assert.equal(finalState.status, "completed");
  assert.equal(finalState.completedCount, 3);
  assert.equal(finalState.errorCount, 0);
  assert.equal(finalState.partialCount, 0);
  assert.equal(
    fs.existsSync(
      stateTools.statePaths(statePath).lock
    ),
    false
  );

  for (const result of mapped) {
    const snapshot = await db
      .collection("proveedores")
      .doc(result.id)
      .get();
    assert.equal(snapshot.exists, true);
    const provider = snapshot.data();
    assert.equal(
      provider.importacion.descripcionImportada,
      true
    );
    assert.equal(
      provider.importacion.portadaImportada,
      true
    );
    assert.equal(
      provider.importacion.galeriaImportada,
      true
    );
    assert.equal(provider.imagenes.galeria.length, 1);
  }

  const [files] = await bucket.getFiles({
    prefix: "proveedores/",
  });
  const names = files.map((file) => file.name);
  assert.equal(names.length, 6);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(
    fs.readdirSync(imageTempRoot),
    [],
    "all per-provider temporary directories must be removed"
  );

  const finalReport = JSON.parse(
    fs.readFileSync(report2, "utf8")
  );
  assert.equal(finalReport.remoteWrites > 0, true);
  assert.equal(finalReport.providersWithError.length, 0);
  assert.equal(
    finalReport.execution.finalizationReason,
    "scope_completed"
  );
});
