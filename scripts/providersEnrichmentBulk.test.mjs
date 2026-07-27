import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const bulk = require("./providers/providerEnrichmentBulk.cjs");
const stateTools = require("./providers/providerEnrichmentState.cjs");

const IDS = [
  "pcar_100000000000000000000001",
  "pcar_100000000000000000000002",
  "pcar_100000000000000000000003",
  "pcar_100000000000000000000004",
];

function temporaryDirectory(context) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "provider-enrichment-bulk-test-")
  );
  context.after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

function incompleteProvider(providerId) {
  return {
    schemaVersion: 2,
    nombre: `Proveedor ${providerId.slice(-2)}`,
    descripcion: "",
    descripcionCorta: "",
    imagenes: {
      portada: null,
      galeria: [],
    },
    importacion: {
      galeriaImportada: false,
      cantidadImagenes: 0,
    },
    fuente: {
      urlOriginal: `https://www.portalcasamientos.com.ar/foto-video/proveedor-${providerId.slice(-5)}/`,
    },
  };
}

function markRemoteComplete(provider) {
  provider.descripcion = "Descripción real";
  provider.descripcionCorta = "Descripción real";
  provider.imagenes = {
    portada: {
      storagePath: "proveedores/id/portada/portada-original.jpg",
    },
    galeria: [
      {
        storagePath: "proveedores/id/galeria/img_hash.jpg",
      },
    ],
  };
  provider.importacion = {
    ...provider.importacion,
    descripcionImportada: true,
    portadaImportada: true,
    galeriaImportada: true,
    cantidadImagenes: 2,
  };
}

function createRuntime(providerIds = IDS) {
  const documents = new Map(
    providerIds.map((providerId) => [
      providerId,
      incompleteProvider(providerId),
    ])
  );
  const metrics = {
    remoteReads: 0,
    remoteWrites: 0,
  };
  return {
    documents,
    metrics,
    async listProviderIds() {
      metrics.remoteReads += documents.size;
      return [...documents.keys()].sort();
    },
    async readProvider(providerId) {
      metrics.remoteReads += 1;
      return {
        exists: documents.has(providerId),
        data: documents.get(providerId) || null,
      };
    },
  };
}

function argsFor(directory, overrides = {}) {
  return {
    apply: true,
    force: false,
    completeGallery: true,
    debugLocal: false,
    maxGalleryImages: 100,
    providerId: "",
    category: "",
    limit: 10,
    concurrency: 2,
    resumeState: path.join(directory, "state.json"),
    dryRunState: "",
    log: path.join(directory, "run.jsonl"),
    requestDelayMs: 0,
    maxRetries: 0,
    timeoutMs: 1000,
    stopAfterErrors: 10,
    pauseOn429: false,
    recoverStaleLock: false,
    confirmStaleLock: "",
    project: "demo-provider-enrichment",
    confirmProject: "demo-provider-enrichment",
    credentials: "fixture.json",
    report: path.join(directory, "report.json"),
    ...overrides,
  };
}

function fakeDashboard() {
  return {
    interactive: true,
    model: {},
    start() {},
    stop() {},
    update(patch) {
      Object.assign(this.model, patch);
    },
    providerFinished() {},
    simpleLine() {},
  };
}

function fakeLogger() {
  return {
    path: "fixture.jsonl",
    events: [],
    log(event, details) {
      this.events.push({ event, details });
    },
    flush() {},
    close() {},
  };
}

function successfulReport(providerId, status = "completed") {
  return {
    status,
    providerId,
    providerName: `Proveedor ${providerId.slice(-2)}`,
    urlVisited:
      "https://www.portalcasamientos.com.ar/foto-video/proveedor/",
    elapsedMs: 25,
    description: { found: true },
    images: {
      coverFound: true,
      uploaded: status === "completed" ? 2 : 0,
      storagePathsUploaded: [],
      storagePathsReused: [],
    },
    galleryExpectedCount: 1,
    galleryDetectedCount: 1,
    galleryValidCount: 1,
    galleryUploadedCount: status === "completed" ? 1 : 0,
    galleryExistingCount: 0,
    galleryAddedCount: 1,
    galleryComplete: true,
    extractionSource: "fixture",
    bytes: {
      pageDownloaded: 100,
      imagesDownloaded: 200,
      uploaded: status === "completed" ? 200 : 0,
    },
    retries: 0,
    durationsMs: {
      firestoreRead: 1,
      pageDownload: 2,
      pageAnalysis: 1,
      imageDownloadAndValidation: 3,
      storageUpload: 4,
      firestoreCommit: 2,
    },
    firestore: {
      updated: status === "completed",
    },
    errors: [],
  };
}

function dependencies(overrides = {}) {
  return {
    dashboard: fakeDashboard(),
    logger: fakeLogger(),
    installProcessHandlers: false,
    processAlive: () => false,
    silentConsole: true,
    ...overrides,
  };
}

const contract = {
  PROVIDER_SCHEMA_VERSION: 2,
};
const fingerprint = (provider) =>
  JSON.stringify({
    descripcion: provider.descripcion,
    imagenes: provider.imagenes,
    importacion: provider.importacion,
  });

test("remote reconciliation accepts a processed provider without content", () => {
  const provider = incompleteProvider(IDS[0]);
  provider.importacion = {
    ...provider.importacion,
    descripcionEncontrada: false,
    portadaEncontrada: false,
    galeriaEncontrada: false,
    galeriaImportada: true,
    completadaEn: new Date("2026-07-27T18:00:00.000Z"),
  };

  assert.equal(
    bulk.remoteEnrichmentComplete(provider, {
      completeGallery: true,
    }),
    true
  );
  assert.equal(
    bulk.remoteEnrichmentComplete(
      incompleteProvider(IDS[0]),
      { completeGallery: true }
    ),
    false
  );
  provider.importacion.completadaEn = "2026-07-27";
  assert.equal(
    bulk.remoteEnrichmentComplete(provider, {
      completeGallery: true,
    }),
    false
  );
});

test("mass coordinator checkpoints and confirms every provider exactly once with concurrency 2", async (context) => {
  const directory = temporaryDirectory(context);
  const runtime = createRuntime();
  const calls = new Map();
  const active = new Set();
  let maximumActive = 0;
  const enrichSingleProvider = async ({
    args,
    lifecycle,
  }) => {
    calls.set(args.providerId, (calls.get(args.providerId) || 0) + 1);
    assert.equal(active.has(args.providerId), false);
    active.add(args.providerId);
    maximumActive = Math.max(maximumActive, active.size);
    await lifecycle.onEvent({
      event: "provider_loaded",
      providerName: runtime.documents.get(args.providerId).nombre,
      sourceUrl:
        runtime.documents.get(args.providerId).fuente.urlOriginal,
      enrichmentFingerprint: stateTools.sha256(
        fingerprint(runtime.documents.get(args.providerId))
      ),
    });
    await lifecycle.onEvent({
      event: "stage",
      stage: "storage_upload",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await lifecycle.onEvent({
      event: "storage_complete",
      uploadedPaths: [],
      reusedPaths: [],
    });
    markRemoteComplete(runtime.documents.get(args.providerId));
    runtime.metrics.remoteWrites += 1;
    await lifecycle.onEvent({
      event: "firestore_updated",
      fieldsUpdated: ["imagenes", "importacion"],
    });
    active.delete(args.providerId);
    return successfulReport(args.providerId);
  };

  const report = await bulk.runMassEnrichment({
    args: argsFor(directory),
    runtime,
    contract,
    enrichSingleProvider,
    providerEnrichmentFingerprint: fingerprint,
    dependencies: dependencies(),
  });

  assert.equal(report.completed, 4);
  assert.equal(report.errors, 0);
  assert.equal(maximumActive, 2);
  assert.deepEqual([...calls.values()], [1, 1, 1, 1]);
  const state = stateTools.parseAndValidateState(
    path.join(directory, "state.json")
  );
  assert.equal(state.completedCount, 4);
  assert.ok(state.lastConfirmedProviderId);
  assert.equal(state.currentProviderId, null);
  assert.equal(fs.existsSync(path.join(directory, "state.tmp")), false);
});

test("limit applies to new providers and a second run continues from the same state", async (context) => {
  const directory = temporaryDirectory(context);
  const runtime = createRuntime(IDS.slice(0, 3));
  const calls = [];
  const enrichSingleProvider = async ({ args, lifecycle }) => {
    calls.push(args.providerId);
    await lifecycle.onEvent({
      event: "provider_loaded",
      providerName: runtime.documents.get(args.providerId).nombre,
      sourceUrl:
        runtime.documents.get(args.providerId).fuente.urlOriginal,
      enrichmentFingerprint: stateTools.sha256(
        fingerprint(runtime.documents.get(args.providerId))
      ),
    });
    await lifecycle.onEvent({
      event: "storage_complete",
      uploadedPaths: [],
      reusedPaths: [],
    });
    markRemoteComplete(runtime.documents.get(args.providerId));
    await lifecycle.onEvent({
      event: "firestore_updated",
      fieldsUpdated: ["imagenes"],
    });
    return successfulReport(args.providerId);
  };
  const firstArgs = argsFor(directory, {
    limit: 2,
    report: path.join(directory, "report-1.json"),
  });
  const first = await bulk.runMassEnrichment({
    args: firstArgs,
    runtime,
    contract,
    enrichSingleProvider,
    providerEnrichmentFingerprint: fingerprint,
    dependencies: dependencies(),
  });
  assert.equal(first.execution.status, "paused");
  assert.equal(first.completed, 2);

  const second = await bulk.runMassEnrichment({
    args: {
      ...firstArgs,
      report: path.join(directory, "report-2.json"),
    },
    runtime,
    contract,
    enrichSingleProvider,
    providerEnrichmentFingerprint: fingerprint,
    dependencies: dependencies(),
  });
  assert.equal(second.execution.status, "completed");
  assert.equal(second.completed, 3);
  assert.deepEqual(calls, IDS.slice(0, 3));
});

test("Storage-complete Firestore failure is resumed without uploading the same image twice", async (context) => {
  const directory = temporaryDirectory(context);
  const runtime = createRuntime(IDS.slice(0, 1));
  let firstAttempt = true;
  let physicalUploads = 0;
  let reused = 0;
  const storageRecord = {
    storagePath:
      "proveedores/pcar_100000000000000000000001/galeria/img_hash.jpg",
    imageId: "img_aaaaaaaaaaaaaaaaaaaa",
    hashSha256: "a".repeat(64),
    bytes: 200,
  };
  const enrichSingleProvider = async ({
    args,
    lifecycle,
  }) => {
    await lifecycle.onEvent({
      event: "provider_loaded",
      providerName: runtime.documents.get(args.providerId).nombre,
      sourceUrl:
        runtime.documents.get(args.providerId).fuente.urlOriginal,
      enrichmentFingerprint: stateTools.sha256(
        fingerprint(runtime.documents.get(args.providerId))
      ),
    });
    if (firstAttempt) {
      firstAttempt = false;
      physicalUploads += 1;
      await lifecycle.onEvent({
        event: "storage_object_uploaded",
        ...storageRecord,
        executionId: lifecycle.executionId,
      });
      await lifecycle.onEvent({
        event: "storage_complete",
        uploadedPaths: [storageRecord.storagePath],
        reusedPaths: [],
      });
      const report = successfulReport(args.providerId, "failed");
      report.errors = [
        {
          code: "firestore_unavailable",
          stage: "firestore_commit",
          message: "Temporary Firestore failure",
        },
      ];
      report.images.storagePathsUploaded = [
        storageRecord.storagePath,
      ];
      report.images.uploaded = 1;
      return report;
    }
    assert.equal(lifecycle.resumeUploads.length, 1);
    reused += 1;
    await lifecycle.onEvent({
      event: "storage_object_reused",
      ...storageRecord,
      executionId: lifecycle.executionId,
    });
    await lifecycle.onEvent({
      event: "storage_complete",
      uploadedPaths: [],
      reusedPaths: [storageRecord.storagePath],
    });
    markRemoteComplete(runtime.documents.get(args.providerId));
    await lifecycle.onEvent({
      event: "firestore_updated",
      fieldsUpdated: ["imagenes"],
    });
    const report = successfulReport(args.providerId);
    report.images.uploaded = 0;
    report.images.storagePathsReused = [
      storageRecord.storagePath,
    ];
    return report;
  };
  const first = await bulk.runMassEnrichment({
    args: argsFor(directory, {
      limit: 1,
      report: path.join(directory, "first.json"),
    }),
    runtime,
    contract,
    enrichSingleProvider,
    providerEnrichmentFingerprint: fingerprint,
    dependencies: dependencies(),
  });
  assert.equal(first.partial, 1);
  const second = await bulk.runMassEnrichment({
    args: argsFor(directory, {
      limit: 1,
      report: path.join(directory, "second.json"),
    }),
    runtime,
    contract,
    enrichSingleProvider,
    providerEnrichmentFingerprint: fingerprint,
    dependencies: dependencies(),
  });
  assert.equal(second.completed, 1);
  assert.equal(physicalUploads, 1);
  assert.equal(reused, 1);
});

test("a download timeout remains recoverable and resumes without marking partial Storage", async (context) => {
  const directory = temporaryDirectory(context);
  const runtime = createRuntime(IDS.slice(0, 1));
  let attempts = 0;
  const enrichSingleProvider = async ({
    args,
    lifecycle,
  }) => {
    attempts += 1;
    await lifecycle.onEvent({
      event: "provider_loaded",
      providerName: runtime.documents.get(args.providerId).nombre,
      sourceUrl:
        runtime.documents.get(args.providerId).fuente.urlOriginal,
      enrichmentFingerprint: stateTools.sha256(
        fingerprint(runtime.documents.get(args.providerId))
      ),
    });
    if (attempts === 1) {
      const report = successfulReport(args.providerId, "failed");
      report.errors = [
        {
          code: "remote_timeout",
          stage: "page_download",
          message: "Timed out",
        },
      ];
      return report;
    }
    await lifecycle.onEvent({
      event: "storage_complete",
      uploadedPaths: [],
      reusedPaths: [],
    });
    markRemoteComplete(runtime.documents.get(args.providerId));
    await lifecycle.onEvent({
      event: "firestore_updated",
      fieldsUpdated: ["imagenes"],
    });
    return successfulReport(args.providerId);
  };
  const first = await bulk.runMassEnrichment({
    args: argsFor(directory, {
      report: path.join(directory, "first.json"),
    }),
    runtime,
    contract,
    enrichSingleProvider,
    providerEnrichmentFingerprint: fingerprint,
    dependencies: dependencies(),
  });
  assert.equal(first.partial, 0);
  assert.equal(first.errors, 1);
  assert.equal(
    stateTools.parseAndValidateState(
      path.join(directory, "state.json")
    ).providerStates[IDS[0]].status,
    "recoverable_error"
  );
  const second = await bulk.runMassEnrichment({
    args: argsFor(directory, {
      report: path.join(directory, "second.json"),
    }),
    runtime,
    contract,
    enrichSingleProvider,
    providerEnrichmentFingerprint: fingerprint,
    dependencies: dependencies(),
  });
  assert.equal(second.completed, 1);
  assert.equal(attempts, 2);
});

test("Firestore commit followed by process failure is reconciled on restart without reprocessing", async (context) => {
  const directory = temporaryDirectory(context);
  const runtime = createRuntime(IDS.slice(0, 1));
  let pipelineCalls = 0;
  const crashingPipeline = async ({ args, lifecycle }) => {
    pipelineCalls += 1;
    await lifecycle.onEvent({
      event: "provider_loaded",
      providerName: runtime.documents.get(args.providerId).nombre,
      sourceUrl:
        runtime.documents.get(args.providerId).fuente.urlOriginal,
      enrichmentFingerprint: stateTools.sha256(
        fingerprint(runtime.documents.get(args.providerId))
      ),
    });
    await lifecycle.onEvent({
      event: "storage_complete",
      uploadedPaths: [],
      reusedPaths: [],
    });
    markRemoteComplete(runtime.documents.get(args.providerId));
    throw Object.assign(
      new Error("simulated process death after Firestore"),
      { code: "simulated_process_death" }
    );
  };
  const first = await bulk.runMassEnrichment({
    args: argsFor(directory, {
      limit: 1,
      report: path.join(directory, "first.json"),
    }),
    runtime,
    contract,
    enrichSingleProvider: crashingPipeline,
    providerEnrichmentFingerprint: fingerprint,
    dependencies: dependencies(),
  });
  assert.equal(first.partial, 1);

  const second = await bulk.runMassEnrichment({
    args: argsFor(directory, {
      limit: 1,
      report: path.join(directory, "second.json"),
    }),
    runtime,
    contract,
    enrichSingleProvider: async () => {
      pipelineCalls += 1;
      throw new Error("must not run");
    },
    providerEnrichmentFingerprint: fingerprint,
    dependencies: dependencies(),
  });
  assert.equal(second.completed, 1);
  assert.equal(second.recoveredFromFirestore, 1);
  assert.equal(pipelineCalls, 1);
});

test("confirmed local state with incomplete Firestore aborts instead of assuming success", async (context) => {
  const directory = temporaryDirectory(context);
  const runtime = createRuntime(IDS.slice(0, 1));
  const enrichSingleProvider = async ({ args, lifecycle }) => {
    await lifecycle.onEvent({
      event: "provider_loaded",
      providerName: runtime.documents.get(args.providerId).nombre,
      sourceUrl:
        runtime.documents.get(args.providerId).fuente.urlOriginal,
      enrichmentFingerprint: stateTools.sha256(
        fingerprint(runtime.documents.get(args.providerId))
      ),
    });
    await lifecycle.onEvent({
      event: "storage_complete",
      uploadedPaths: [],
      reusedPaths: [],
    });
    markRemoteComplete(runtime.documents.get(args.providerId));
    await lifecycle.onEvent({
      event: "firestore_updated",
      fieldsUpdated: ["imagenes"],
    });
    return successfulReport(args.providerId);
  };
  await bulk.runMassEnrichment({
    args: argsFor(directory, {
      limit: 1,
      report: path.join(directory, "first.json"),
    }),
    runtime,
    contract,
    enrichSingleProvider,
    providerEnrichmentFingerprint: fingerprint,
    dependencies: dependencies(),
  });
  runtime.documents.set(
    IDS[0],
    incompleteProvider(IDS[0])
  );
  const second = await bulk.runMassEnrichment({
    args: argsFor(directory, {
      limit: 1,
      report: path.join(directory, "second.json"),
    }),
    runtime,
    contract,
    enrichSingleProvider,
    providerEnrichmentFingerprint: fingerprint,
    dependencies: dependencies(),
  });
  assert.equal(second.execution.status, "failed");
  assert.equal(
    second.fatalError.code,
    "confirmed_remote_inconsistent"
  );
});

test("mass dry-run uses a separate state and reports zero writes", async (context) => {
  const directory = temporaryDirectory(context);
  const runtime = createRuntime(IDS.slice(0, 2));
  const applyState = path.join(directory, "apply-state.json");
  fs.writeFileSync(applyState, "do-not-touch", "utf8");
  const report = await bulk.runMassEnrichment({
    args: argsFor(directory, {
      apply: false,
      resumeState: "",
      dryRunState: path.join(directory, "dry-state.json"),
      limit: 2,
      credentials:
        "C:\\private\\credential-secret.json",
    }),
    runtime,
    contract,
    enrichSingleProvider: async ({ args }) =>
      successfulReport(args.providerId, "dry_run_ready"),
    providerEnrichmentFingerprint: fingerprint,
    dependencies: dependencies(),
  });
  assert.equal(report.remoteWrites, 0);
  assert.equal(report.firestoreWrites, 0);
  assert.equal(report.storageWrites, 0);
  assert.equal(
    fs.readFileSync(applyState, "utf8"),
    "do-not-touch"
  );
  assert.equal(
    fs.existsSync(path.join(directory, "dry-state.json")),
    true
  );
  const serializedReport = fs.readFileSync(
    path.join(directory, "report.json"),
    "utf8"
  );
  assert.equal(
    serializedReport.includes("credential-secret.json"),
    false
  );
  assert.match(
    report.execution.resumeCommand,
    /credentials=RUTA_CREDENCIALES/
  );
});

test("SIGINT stops assignment, checkpoints the in-flight provider, and leaves it resumable", async (context) => {
  const directory = temporaryDirectory(context);
  const runtime = createRuntime(IDS.slice(0, 3));
  const processTarget = new EventEmitter();
  let started = 0;
  const runPromise = bulk.runMassEnrichment({
    args: argsFor(directory, {
      concurrency: 1,
      limit: 3,
    }),
    runtime,
    contract,
    enrichSingleProvider: async ({ args, lifecycle }) => {
      started += 1;
      await lifecycle.onEvent({
        event: "provider_loaded",
        providerName: runtime.documents.get(args.providerId).nombre,
        sourceUrl:
          runtime.documents.get(args.providerId).fuente.urlOriginal,
        enrichmentFingerprint: stateTools.sha256(
          fingerprint(runtime.documents.get(args.providerId))
        ),
      });
      setImmediate(() => processTarget.emit("SIGINT"));
      while (!lifecycle.shouldStop()) {
        await new Promise((resolve) =>
          setTimeout(resolve, 2)
        );
      }
      const report = successfulReport(args.providerId, "failed");
      report.errors = [
        {
          code: "interrupted_before_upload",
          stage: "storage_upload",
          message: "Interrupted",
        },
      ];
      return report;
    },
    providerEnrichmentFingerprint: fingerprint,
    dependencies: dependencies({
      installProcessHandlers: true,
      processTarget,
    }),
  });
  const report = await runPromise;
  assert.equal(started, 1);
  assert.equal(report.execution.status, "SIGINT");
  const state = stateTools.parseAndValidateState(
    path.join(directory, "state.json")
  );
  assert.equal(state.currentProviderId, null);
  assert.deepEqual(state.interruptedProviderIds, [
    IDS[0],
  ]);
  assert.equal(
    state.providerStates[IDS[0]].status,
    "recoverable_error"
  );
  assert.equal(
    fs.existsSync(path.join(directory, "state.lock")),
    false
  );
});
