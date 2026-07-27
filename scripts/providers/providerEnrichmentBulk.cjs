"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  DurableEnrichmentStateStore,
  acquireStateLock,
  createInitialState,
  createInputScope,
  hashInputScope,
  recalculateState,
  sha256,
  withChecksum,
} = require("./providerEnrichmentState.cjs");
const {
  ProgressDashboard,
  SiteRequestController,
  calculateProgressMetrics,
  createPersistentLogger,
  sanitizeText,
} = require("./providerEnrichmentRuntime.cjs");
const {
  writeJsonAtomic,
} = require("./analyzeProviderJson.cjs");

const PERIODIC_CHECKPOINT_MS = 5000;
const RECOVERABLE_ERROR_CODES = new Set([
  "interrupted_before_request",
  "interrupted_before_upload",
  "remote_network_error",
  "remote_timeout",
  "remote_http_error",
  "storage_upload_failed",
  "storage_access_failed",
  "firestore_unavailable",
  "transaction_aborted",
  "provider_changed_during_enrichment",
  "temporary_cleanup_failed",
  "unexpected_error",
]);

function createRunId() {
  return `enrich_${new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")}_${crypto
    .randomBytes(6)
    .toString("hex")}`;
}

function extractorSha256() {
  const files = [
    "providerEnrichmentPage.cjs",
    "providerEnrichmentImages.cjs",
  ];
  const contents = files.map((fileName) =>
    fs.readFileSync(path.join(__dirname, fileName))
  );
  return crypto
    .createHash("sha256")
    .update(Buffer.concat(contents))
    .digest("hex");
}

function defaultBulkReportPath(apply) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  return path.resolve(
    process.cwd(),
    "artifacts",
    "providers",
    "runtime",
    `provider-enrichment-${apply ? "apply" : "dry-run"}-${timestamp}.json`
  );
}

function defaultLogPath(reportPath) {
  const parsed = path.parse(reportPath);
  return path.join(parsed.dir, `${parsed.name}.jsonl`);
}

function shellQuote(value) {
  const text = String(value);
  return /[\s"]/u.test(text)
    ? `"${text.replace(/"/g, '\\"')}"`
    : text;
}

function buildResumeCommand(args) {
  const parts = [
    "node",
    "scripts/providers/enrichProviders.cjs",
    args.apply ? "--apply" : "--dry-run",
    `--limit=${args.limit}`,
    `--concurrency=${args.concurrency}`,
    `--max-gallery-images=${args.maxGalleryImages}`,
    `--request-delay-ms=${args.requestDelayMs}`,
    `--max-retries=${args.maxRetries}`,
    `--timeout-ms=${args.timeoutMs}`,
    `--stop-after-errors=${args.stopAfterErrors}`,
    `--project=${args.project}`,
    `--confirm-project=${args.confirmProject}`,
    "--credentials=RUTA_CREDENCIALES",
  ];
  if (args.category) parts.push(`--category=${args.category}`);
  if (args.force) parts.push("--force");
  if (args.completeGallery) parts.push("--complete-gallery");
  if (args.pauseOn429) parts.push("--pause-on-429");
  if (args.resumeState) {
    parts.push(
      `--resume-state=${shellQuote(
        path.resolve(args.resumeState)
      )}`
    );
  }
  if (args.dryRunState) {
    parts.push(
      `--dry-run-state=${shellQuote(
        path.resolve(args.dryRunState)
      )}`
    );
  }
  if (args.report) {
    parts.push(
      `--report=${shellQuote(path.resolve(args.report))}`
    );
  }
  return parts.join(" ");
}

class MemoryStateStore {
  constructor(options = {}) {
    this.now = options.now || (() => new Date());
    this.state = null;
    this.lastSavedAt = null;
    this.writeCount = 0;
    this.lastCheckpointDurationMs = 0;
    this.totalCheckpointDurationMs = 0;
    this.statePath = null;
    this._queue = Promise.resolve();
  }

  loadOrCreate({ inputScope, candidateProviderIds, runId }) {
    this.state = createInitialState({
      inputScope,
      candidateProviderIds,
      runId,
      now: this.now(),
    });
    return {
      created: true,
      recoveredFromBackup: false,
      recovery: null,
      state: this.snapshot(),
    };
  }

  update(mutator, reason = "memory_checkpoint") {
    const operation = async () => {
      const checkpointStartedAt = Date.now();
      await mutator(this.state);
      const timestamp = this.now().toISOString();
      this.state.updatedAt = timestamp;
      this.state.lastCheckpoint = {
        reason,
        savedAt: timestamp,
      };
      this.state = withChecksum(
        recalculateState(this.state)
      );
      this.lastSavedAt = timestamp;
      this.writeCount += 1;
      this.lastCheckpointDurationMs =
        Date.now() - checkpointStartedAt;
      this.totalCheckpointDurationMs +=
        this.lastCheckpointDurationMs;
      return this.snapshot();
    };
    const pending = this._queue.then(operation, operation);
    this._queue = pending.catch(() => {});
    return pending;
  }

  checkpoint(reason) {
    return this.update(() => {}, reason);
  }

  flush() {
    return this._queue;
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }
}

function stateCounts(snapshot) {
  return {
    completed: snapshot.completedCount || 0,
    partial: snapshot.partialCount || 0,
    errors: snapshot.errorCount || 0,
    skipped: snapshot.skippedCount || 0,
    recovered: snapshot.recoveredCount || 0,
    progress:
      (snapshot.completedCount || 0) +
      (snapshot.skippedCount || 0) +
      (snapshot.countsByStatus?.definitive_error || 0),
  };
}

function isProcessingCompletionTimestamp(value) {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.toDate === "function" &&
      (typeof value.toMillis === "function" ||
        (typeof value.seconds === "number" &&
          typeof value.nanoseconds === "number"))
  );
}

function remoteEnrichmentComplete(document, options = {}) {
  const processed = isProcessingCompletionTimestamp(
    document?.importacion?.completadaEn
  );
  if (processed) return true;

  const description =
    typeof document?.descripcion === "string" &&
    document.descripcion.trim().length > 0;
  const cover = Boolean(
    document?.imagenes?.portada?.storagePath
  );
  const gallery = Array.isArray(
    document?.imagenes?.galeria
  )
    ? document.imagenes.galeria
    : [];
  const galleryComplete =
    document?.importacion?.galeriaImportada === true &&
    Array.isArray(document?.imagenes?.galeria);
  return Boolean(
    description &&
      cover &&
      (options.completeGallery
        ? galleryComplete
        : galleryComplete || gallery.length > 0)
  );
}

function safeProviderFingerprint(
  provider,
  providerEnrichmentFingerprint
) {
  try {
    return sha256(
      providerEnrichmentFingerprint(provider)
    );
  } catch {
    return null;
  }
}

function classifyFailedResult(report, stateEntry) {
  const error = report.errors?.[0] || {
    code: "unexpected_error",
    stage: "unknown",
    message: "Fallo no clasificado.",
  };
  const hasUploadedObjects =
    (stateEntry.uploadedObjects || []).length > 0;
  if (
    hasUploadedObjects ||
    stateEntry.status === "storage_complete" ||
    stateEntry.status === "firestore_updated"
  ) {
    return {
      status: "partial",
      error,
      recoverable: true,
    };
  }
  return {
    status: RECOVERABLE_ERROR_CODES.has(error.code)
      ? "recoverable_error"
      : "definitive_error",
    error,
    recoverable: RECOVERABLE_ERROR_CODES.has(error.code),
  };
}

function providerSummary(report, metricDelta) {
  return {
    status: report.status,
    elapsedMs: report.elapsedMs,
    urlVisited: report.urlVisited,
    descriptionFound: report.description?.found || false,
    coverFound: report.images?.coverFound || false,
    galleryExpected: report.galleryExpectedCount,
    galleryDetected: report.galleryDetectedCount,
    galleryValid: report.galleryValidCount,
    galleryUploaded: report.galleryUploadedCount,
    galleryExisting: report.galleryExistingCount,
    galleryAdded: report.galleryAddedCount,
    galleryComplete: report.galleryComplete,
    extractionSource: report.extractionSource,
    bytesDownloaded:
      (report.bytes?.pageDownloaded || 0) +
      (report.bytes?.imagesDownloaded || 0),
    bytesUploaded: report.bytes?.uploaded || 0,
    retries: report.retries || 0,
    durationsMs: report.durationsMs || {},
    firestoreWrites: report.firestore?.updated ? 1 : 0,
    storageWrites: report.images?.uploaded || 0,
    remoteReads: metricDelta.remoteReads,
    remoteWrites: metricDelta.remoteWrites,
    storagePathsUploaded:
      report.images?.storagePathsUploaded || [],
    storagePathsReused:
      report.images?.storagePathsReused || [],
  };
}

function providerResumeUploads(providerState) {
  return (providerState?.uploadedObjects || []).map(
    (entry) => ({ ...entry })
  );
}

function createLifecycle({
  providerId,
  executionId,
  store,
  dashboard,
  logger,
  requestController,
  shouldStop,
}) {
  return {
    executionId,
    preserveUploadsOnFailure: true,
    resumeUploads: providerResumeUploads(
      store.snapshot().providerStates[providerId]
    ),
    requestController,
    shouldStop,
    async onEvent(details) {
      const timestamp = new Date().toISOString();
      if (details.event === "stage") {
        dashboard.update({
          stage: details.stage,
        });
      } else if (details.event === "image_download_progress") {
        dashboard.update({
          stage: `Descargando imágenes ${details.current} / ${details.total}`,
        });
      } else if (details.event === "provider_loaded") {
        dashboard.update({
          currentProviderName: details.providerName,
        });
      }
      logger.log("provider_stage", {
        providerId,
        ...details,
      });
      await store.update((state) => {
        const entry = state.providerStates[providerId];
        entry.updatedAt = timestamp;
        if (details.event === "stage") {
          entry.phase = details.stage;
        } else if (details.event === "provider_loaded") {
          entry.providerName = details.providerName;
          entry.sourceUrl = details.sourceUrl;
          entry.remoteFingerprintBefore =
            details.enrichmentFingerprint ||
            entry.remoteFingerprintBefore ||
            null;
        } else if (
          details.event === "storage_object_uploaded" ||
          details.event === "storage_object_reused"
        ) {
          const record = {
            storagePath: details.storagePath,
            imageId: details.imageId,
            hashSha256: details.hashSha256,
            bytes: details.bytes,
            executionId:
              details.executionId || executionId,
            uploadedByThisRun:
              details.event === "storage_object_uploaded",
          };
          entry.uploadedObjects = [
            ...(entry.uploadedObjects || []).filter(
              (existing) =>
                existing.storagePath !== record.storagePath
            ),
            record,
          ];
          entry.phase =
            details.event === "storage_object_uploaded"
              ? "storage_upload"
              : "storage_reuse";
        } else if (details.event === "storage_complete") {
          entry.status = "storage_complete";
          entry.phase = "storage_complete";
          entry.storageCompletedAt = timestamp;
        } else if (details.event === "firestore_updated") {
          entry.status = "firestore_updated";
          entry.phase = "firestore_updated";
          entry.firestoreUpdatedAt = timestamp;
        } else if (details.event === "provider_failed") {
          entry.phase = details.stage;
        }
      }, `provider_${providerId}_${details.event}`);
      dashboard.update({
        lastCheckpointAt: store.lastSavedAt,
      });
    },
  };
}

async function reconcileConfirmedProviders({
  store,
  runtime,
  args,
  logger,
}) {
  const state = store.snapshot();
  const confirmed = Object.entries(state.providerStates).filter(
    ([, entry]) =>
      entry.status === "confirmed" ||
      entry.status === "recovered"
  );
  const inconsistencies = [];
  for (const [providerId] of confirmed) {
    const remote = await runtime.readProvider(providerId);
    if (
      !remote.exists ||
      !remoteEnrichmentComplete(remote.data, args)
    ) {
      inconsistencies.push({
        providerId,
        code: remote.exists
          ? "confirmed_remote_incomplete"
          : "confirmed_remote_missing",
      });
    }
  }
  if (inconsistencies.length > 0) {
    await store.update((current) => {
      current.status = "inconsistent";
      current.inconsistencies = inconsistencies;
    }, "remote_consistency_failed");
    logger.log(
      "remote_consistency_failed",
      { inconsistencies },
      true
    );
    const error = new Error(
      "El estado local contiene proveedores confirmados que Firestore no refleja como completos."
    );
    error.code = "confirmed_remote_inconsistent";
    error.inconsistencies = inconsistencies;
    throw error;
  }
  return confirmed.length;
}

function candidateQueues(state, candidateProviderIds, limit) {
  const retryableStatuses = new Set([
    "processing",
    "storage_complete",
    "firestore_updated",
    "partial",
    "recoverable_error",
  ]);
  const retries = [];
  const fresh = [];
  for (const providerId of candidateProviderIds) {
    const entry = state.providerStates[providerId];
    if (!entry) {
      fresh.push(providerId);
    } else if (retryableStatuses.has(entry.status)) {
      retries.push(providerId);
    }
  }
  return {
    retries,
    fresh: fresh.slice(0, limit),
    work: [...retries, ...fresh.slice(0, limit)],
    remainingFresh: Math.max(0, fresh.length - limit),
  };
}

function installTerminationHandlers({
  target = process,
  onStop,
}) {
  const handlers = {
    SIGINT: () => onStop("SIGINT"),
    SIGTERM: () => onStop("SIGTERM"),
    uncaughtException: (error) =>
      onStop("uncaughtException", error),
    unhandledRejection: (reason) =>
      onStop(
        "unhandledRejection",
        reason instanceof Error
          ? reason
          : new Error(String(reason))
      ),
  };
  for (const [event, handler] of Object.entries(handlers)) {
    target.on(event, handler);
  }
  return () => {
    for (const [event, handler] of Object.entries(handlers)) {
      target.removeListener(event, handler);
    }
  };
}

async function runMassEnrichment({
  args,
  runtime,
  contract,
  enrichSingleProvider,
  providerEnrichmentFingerprint,
  argv = process.argv.slice(2),
  dependencies = {},
}) {
  const runId = dependencies.runId || createRunId();
  const startedAt = dependencies.now?.() || new Date();
  const candidateProviderIds = args.providerId
    ? [args.providerId]
    : await runtime.listProviderIds({
        category: args.category,
      });
  const inputScope = createInputScope({
    projectId: args.project,
    category: args.category || null,
    providerIds: candidateProviderIds,
    force: args.force,
    completeGallery: args.completeGallery,
    maxGalleryImages: args.maxGalleryImages,
    contractSchemaVersion:
      contract.PROVIDER_SCHEMA_VERSION || 2,
    extractorSha256: extractorSha256(),
  });
  const reportPath = path.resolve(
    args.report || defaultBulkReportPath(args.apply)
  );
  const logPath = path.resolve(
    args.log || defaultLogPath(reportPath)
  );
  const logger =
    dependencies.logger ||
    createPersistentLogger(logPath, {
      now: dependencies.now,
    });
  const dashboard =
    dependencies.dashboard ||
    new ProgressDashboard({
      interactive: dependencies.interactiveDashboard,
      initial: {
        startedAtMs: startedAt.getTime(),
        checkpointPath:
          args.resumeState || args.dryRunState || null,
      },
    });
  const durableStatePath = args.apply
    ? args.resumeState
    : args.dryRunState;
  const store =
    dependencies.store ||
    (durableStatePath
      ? new DurableEnrichmentStateStore(durableStatePath, {
          now: dependencies.now,
        })
      : new MemoryStateStore({
          now: dependencies.now,
        }));
  let lock = null;
  let loaded;
  try {
    if (durableStatePath) {
      lock = acquireStateLock({
        statePath: durableStatePath,
        runId,
        inputScopeHash: hashInputScope(inputScope),
        argv,
        recoverStaleLock: args.recoverStaleLock,
        confirmStaleLock: args.confirmStaleLock,
        now: startedAt,
        processAlive: dependencies.processAlive,
      });
    }
    loaded = store.loadOrCreate({
      inputScope,
      candidateProviderIds,
      runId,
    });
    await store.update((state) => {
      state.status = "running";
      state.lastRunId = runId;
      state.lastRunStartedAt = startedAt.toISOString();
      state.lastRunOptions = {
        limit: args.limit,
        concurrency: args.concurrency,
        requestDelayMs: args.requestDelayMs,
        maxRetries: args.maxRetries,
        timeoutMs: args.timeoutMs,
        stopAfterErrors: args.stopAfterErrors,
        pauseOn429: args.pauseOn429,
      };
    }, "run_started");
  } catch (error) {
    try {
      lock?.release();
    } finally {
      if (!dependencies.logger) logger.close();
    }
    throw error;
  }

  let stopping = false;
  let stopReason = null;
  let fatalError = null;
  let runErrors = 0;
  const requestStop = async (reason, error = null) => {
    if (stopping) return;
    stopping = true;
    stopReason = reason;
    fatalError = error || fatalError;
    logger.log(
      "stop_requested",
      {
        reason,
        error: error
          ? {
              code: error.code || "unexpected_error",
              message: sanitizeText(error.message),
            }
          : null,
      },
      true
    );
    await store.update((state) => {
      state.status = "stopping";
      state.stopReason = reason;
      state.currentProviderIds =
        state.currentProviderIds || [];
      state.interruptedProviderIds = [
        ...state.currentProviderIds,
      ];
    }, `interruption_${reason}`);
  };
  const removeHandlers = dependencies.installProcessHandlers === false
    ? () => {}
    : installTerminationHandlers({
        target: dependencies.processTarget || process,
        onStop(reason, error) {
          requestStop(reason, error).catch((checkpointError) => {
            fatalError = checkpointError;
          });
        },
      });
  const requestController =
    dependencies.requestController ||
    new SiteRequestController({
      requestDelayMs: args.requestDelayMs,
      pauseOn429: args.pauseOn429,
      sleep: dependencies.sleep,
      shouldStop: () => stopping,
      onEvent(event) {
        logger.log("site_request", event);
      },
    });

  let periodicCheckpoint = null;
  const providerReports = [];
  const errorProviders = [];
  const inFlight = new Set();
  const runtimeBaseline = {
    remoteReads: runtime.metrics?.remoteReads || 0,
    remoteWrites: runtime.metrics?.remoteWrites || 0,
  };

  try {
    if (!loaded.created) {
      await reconcileConfirmedProviders({
        store,
        runtime,
        args,
        logger,
      });
    }
    const queues = candidateQueues(
      store.snapshot(),
      candidateProviderIds,
      args.limit
    );
    dashboard.update({
      total: candidateProviderIds.length,
      ...stateCounts(store.snapshot()),
    });
    dashboard.start();
    logger.log(
      "run_started",
      {
        runId,
        mode: args.apply ? "apply" : "dry_run",
        projectId: args.project,
        category: args.category || null,
        candidateCount: candidateProviderIds.length,
        retryCount: queues.retries.length,
        freshAttemptLimit: args.limit,
        selectedCount: queues.work.length,
        concurrency: args.concurrency,
        recoveredFromBackup: loaded.recoveredFromBackup,
      },
      true
    );
    periodicCheckpoint = setInterval(() => {
      store
        .checkpoint("periodic")
        .then(() => {
          dashboard.update({
            lastCheckpointAt: store.lastSavedAt,
          });
        })
        .catch((error) => {
          fatalError = error;
          stopping = true;
          stopReason = "checkpoint_failed";
        });
    }, PERIODIC_CHECKPOINT_MS);
    periodicCheckpoint.unref?.();

    let nextIndex = 0;
    const nextProviderId = () => {
      if (
        stopping ||
        runErrors >= args.stopAfterErrors ||
        nextIndex >= queues.work.length
      ) {
        return null;
      }
      const providerId = queues.work[nextIndex];
      nextIndex += 1;
      if (inFlight.has(providerId)) {
        const error = new Error(
          `El proveedor ${providerId} fue asignado dos veces.`
        );
        error.code = "duplicate_worker_assignment";
        throw error;
      }
      inFlight.add(providerId);
      return providerId;
    };

    const processProvider = async (providerId, workerId) => {
      const providerStartedAt = Date.now();
      const checkpointDurationBefore =
        store.totalCheckpointDurationMs || 0;
      const stateBefore = store.snapshot();
      const previousState =
        stateBefore.providerStates[providerId] || null;
      const executionId =
        previousState?.executionId ||
        `${runId}_${providerId.slice(-8)}`;
      await store.update((state) => {
        const previous = state.providerStates[providerId] || {};
        state.providerStates[providerId] = {
          ...previous,
          status: "processing",
          phase: "reconciliation",
          executionId,
          attempts: (previous.attempts || 0) + 1,
          firstAttemptedAt:
            previous.firstAttemptedAt ||
            new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          workerId,
          uploadedObjects: previous.uploadedObjects || [],
        };
        state.totals.attempts += 1;
      }, `provider_${providerId}_started`);
      dashboard.update({
        currentProviderId: providerId,
        currentProviderName:
          previousState?.providerName || null,
        currentProviderStartedAtMs: providerStartedAt,
        stage: "Reconciliando estado remoto",
        lastCheckpointAt: store.lastSavedAt,
      });

      const readsBefore = runtime.metrics?.remoteReads || 0;
      const writesBefore = runtime.metrics?.remoteWrites || 0;
      const remoteReadStartedAt = Date.now();
      const remote = await runtime.readProvider(providerId);
      const remoteReadDurationMs =
        Date.now() - remoteReadStartedAt;
      if (!remote.exists) {
        const report = {
          status: "failed",
          providerId,
          providerName: null,
          elapsedMs: Date.now() - providerStartedAt,
          errors: [
            {
              code: "provider_not_found",
              stage: "reconciliation",
              message: "El proveedor ya no existe.",
            },
          ],
          bytes: {},
          images: {},
          description: {},
          durationsMs: {
            firestoreRead: remoteReadDurationMs,
          },
        };
        return {
          report,
          readsBefore,
          writesBefore,
          checkpointDurationBefore,
        };
      }
      const remoteFingerprint = safeProviderFingerprint(
        remote.data,
        providerEnrichmentFingerprint
      );
      const currentEntry =
        store.snapshot().providerStates[providerId];
      const remoteComplete = remoteEnrichmentComplete(
        remote.data,
        args
      );
      const changedAfterAttempt =
        currentEntry.remoteFingerprintBefore &&
        remoteFingerprint &&
        currentEntry.remoteFingerprintBefore !== remoteFingerprint;
      if (
        remoteComplete &&
        !args.force &&
        (previousState?.status === "firestore_updated" ||
          changedAfterAttempt ||
          (!args.completeGallery &&
            !currentEntry.remoteFingerprintBefore))
      ) {
        await store.update((state) => {
          const entry = state.providerStates[providerId];
          entry.status =
            previousState ? "recovered" : "already_complete";
          entry.phase = "reconciled_from_firestore";
          entry.confirmedAt = new Date().toISOString();
          entry.workerId = null;
        }, `provider_${providerId}_reconciled`);
        return {
          report: {
            status: previousState
              ? "recovered_from_firestore"
              : "skipped_already_complete",
            providerId,
            providerName: remote.data.nombre,
            elapsedMs: Date.now() - providerStartedAt,
            errors: [],
            bytes: {},
            images: {},
            description: {},
            durationsMs: {
              firestoreRead: remoteReadDurationMs,
            },
          },
          readsBefore,
          writesBefore,
          checkpointDurationBefore,
          terminalCheckpointDone: true,
        };
      }

      await store.update((state) => {
        const entry = state.providerStates[providerId];
        entry.remoteFingerprintBefore =
          remoteFingerprint;
        entry.providerName = remote.data.nombre;
        entry.sourceUrl =
          remote.data.fuente?.urlOriginal || null;
      }, `provider_${providerId}_remote_baseline`);

      let firstRead = true;
      const providerRuntime = {
        ...runtime,
        metrics: runtime.metrics,
        async readProvider(requestedProviderId) {
          if (
            firstRead &&
            requestedProviderId === providerId
          ) {
            firstRead = false;
            return remote;
          }
          return runtime.readProvider(requestedProviderId);
        },
      };
      const lifecycle = createLifecycle({
        providerId,
        executionId,
        store,
        dashboard,
        logger,
        requestController,
        shouldStop: () => stopping,
      });
      const report = await enrichSingleProvider({
        args: {
          ...args,
          providerId,
        },
        runtime: providerRuntime,
        contract,
        pageFetcher: dependencies.pageFetcher,
        pageExtractor: dependencies.pageExtractor,
        imageDownloader: dependencies.imageDownloader,
        now: dependencies.now,
        temporaryDirectoryFactory:
          dependencies.temporaryDirectoryFactory,
        temporaryDirectoryRemover:
          dependencies.temporaryDirectoryRemover,
        lifecycle,
      });
      report.durationsMs = report.durationsMs || {};
      report.durationsMs.firestoreRead =
        (report.durationsMs.firestoreRead || 0) +
        remoteReadDurationMs;
      return {
        report,
        readsBefore,
        writesBefore,
        checkpointDurationBefore,
      };
    };

    const finishProvider = async ({
      providerId,
      result,
      workerId,
    }) => {
      const report = result.report;
      const metricDelta = {
        remoteReads:
          (runtime.metrics?.remoteReads || 0) -
          result.readsBefore,
        remoteWrites:
          (runtime.metrics?.remoteWrites || 0) -
          result.writesBefore,
      };
      const summary = providerSummary(
        report,
        metricDelta
      );
      summary.durationsMs.checkpoint = Math.max(
        0,
        (store.totalCheckpointDurationMs || 0) -
          (result.checkpointDurationBefore || 0)
      );
      if (!result.terminalCheckpointDone) {
        if (
          report.status === "completed" ||
          report.status === "recovered_from_firestore"
        ) {
          await store.update((state) => {
            const entry = state.providerStates[providerId];
            entry.status =
              report.status === "recovered_from_firestore"
                ? "recovered"
                : "confirmed";
            entry.phase = "confirmed";
            entry.confirmedAt = new Date().toISOString();
            entry.workerId = null;
            entry.lastResult = summary;
            entry.lastError = null;
            state.totals.bytesDownloaded +=
              summary.bytesDownloaded;
            state.totals.bytesUploaded +=
              summary.bytesUploaded;
            state.totals.firestoreWrites +=
              report.firestore?.updated ? 1 : 0;
            state.totals.storageWrites +=
              report.images?.uploaded || 0;
          }, `provider_${providerId}_confirmed`);
        } else if (
          report.status === "skipped_already_complete" ||
          report.status === "skipped_gallery_already_complete"
        ) {
          await store.update((state) => {
            const entry = state.providerStates[providerId];
            entry.status = "already_complete";
            entry.phase = report.status;
            entry.confirmedAt = new Date().toISOString();
            entry.workerId = null;
            entry.lastResult = summary;
          }, `provider_${providerId}_already_complete`);
        } else if (report.status === "dry_run_ready") {
          await store.update((state) => {
            const entry = state.providerStates[providerId];
            entry.status = "skipped";
            entry.phase = "dry_run_complete";
            entry.workerId = null;
            entry.lastResult = summary;
            state.totals.bytesDownloaded +=
              summary.bytesDownloaded;
          }, `provider_${providerId}_dry_run`);
        } else {
          const current =
            store.snapshot().providerStates[providerId];
          const classification = classifyFailedResult(
            report,
            current
          );
          runErrors += 1;
          const safeError = {
            providerId,
            code: classification.error.code,
            stage: classification.error.stage,
            message: sanitizeText(
              classification.error.message
            ),
            recoverable: classification.recoverable,
          };
          errorProviders.push(safeError);
          await store.update((state) => {
            const entry = state.providerStates[providerId];
            entry.status = classification.status;
            entry.phase =
              classification.error.stage || entry.phase;
            entry.workerId = null;
            entry.lastError = safeError;
            entry.lastResult = summary;
            entry.errorHistory = [
              ...(entry.errorHistory || []),
              {
                ...safeError,
                at: new Date().toISOString(),
              },
            ].slice(-10);
            state.totals.bytesDownloaded +=
              summary.bytesDownloaded;
            state.totals.bytesUploaded +=
              summary.bytesUploaded;
            state.totals.storageWrites +=
              report.images?.uploaded || 0;
          }, `provider_${providerId}_failed`);
          if (runErrors >= args.stopAfterErrors) {
            await requestStop("stop_after_errors");
          }
        }
      }
      providerReports.push({
        providerId,
        workerId,
        ...summary,
      });
      await dependencies.afterProviderFinished?.({
        providerId,
        report,
        state: store.snapshot(),
      });
      logger.log(
        "provider_finished",
        {
          providerId,
          providerName: report.providerName,
          workerId,
          result: summary,
          errors: report.errors || [],
        },
        true
      );
      const snapshot = store.snapshot();
      dashboard.providerFinished(report.elapsedMs);
      dashboard.update({
        ...stateCounts(snapshot),
        lastConfirmedProviderId:
          snapshot.lastConfirmedProviderId,
        lastCheckpointAt: store.lastSavedAt,
        bytesDownloaded:
          snapshot.totals.bytesDownloaded,
        bytesUploaded: snapshot.totals.bytesUploaded,
        firestoreWrites:
          snapshot.totals.firestoreWrites,
        storageWrites: snapshot.totals.storageWrites,
      });
      dashboard.simpleLine(
        `${providerId}: ${report.status} (${(
          report.elapsedMs / 1000
        ).toFixed(1)} s)`
      );
    };

    const worker = async (workerIndex) => {
      const workerId = `worker-${workerIndex + 1}`;
      while (!stopping) {
        const providerId = nextProviderId();
        if (!providerId) break;
        try {
          const result = await processProvider(
            providerId,
            workerId
          );
          await finishProvider({
            providerId,
            result,
            workerId,
          });
        } catch (error) {
          runErrors += 1;
          fatalError = error;
          errorProviders.push({
            providerId,
            code: error.code || "worker_failure",
            stage: "worker",
            message: sanitizeText(error.message),
            recoverable: true,
          });
          try {
            await store.update((state) => {
              const entry =
                state.providerStates[providerId] || {};
              entry.status =
                entry.status === "firestore_updated"
                  ? "firestore_updated"
                  : entry.status === "storage_complete" ||
                      (entry.uploadedObjects || []).length > 0
                    ? "partial"
                    : "recoverable_error";
              entry.phase = "worker_failure";
              entry.workerId = null;
              entry.lastError =
                errorProviders[errorProviders.length - 1];
              state.providerStates[providerId] = entry;
            }, `provider_${providerId}_worker_failure`);
          } catch (checkpointError) {
            fatalError = checkpointError;
            stopping = true;
            stopReason = "checkpoint_failed";
          }
          if (runErrors >= args.stopAfterErrors) {
            await requestStop("stop_after_errors");
          }
        } finally {
          inFlight.delete(providerId);
        }
      }
    };

    await Promise.all(
      Array.from(
        {
          length: Math.min(
            args.concurrency,
            Math.max(1, queues.work.length)
          ),
        },
        (_, index) => worker(index)
      )
    );

    const finalSnapshot = store.snapshot();
    const remaining = candidateQueues(
      finalSnapshot,
      candidateProviderIds,
      args.limit
    );
    const finalReason =
      stopReason ||
      (remaining.work.length > 0
        ? queues.remainingFresh > 0
          ? "limit_reached"
          : "recoverable_work_remaining"
        : "scope_completed");
    await store.update((state) => {
      state.status =
        finalReason === "scope_completed"
          ? "completed"
          : finalReason === "limit_reached"
            ? "paused"
            : finalReason;
      state.lastRunFinishedAt = (
        dependencies.now?.() || new Date()
      ).toISOString();
      state.lastRunResult = finalReason;
      state.stopReason = stopReason;
    }, `run_finished_${finalReason}`);
  } catch (error) {
    fatalError = error;
    stopReason = stopReason || error.code || "fatal_error";
    try {
      await store.update((state) => {
        state.status = "failed";
        state.stopReason = stopReason;
        state.lastFatalError = {
          code: error.code || "fatal_error",
          message: sanitizeText(error.message),
        };
      }, "run_failed");
    } catch {
      // The caller still receives the original failure and backup files remain.
    }
  } finally {
    if (periodicCheckpoint) clearInterval(periodicCheckpoint);
    removeHandlers();
    try {
      await store.flush();
    } catch (error) {
      fatalError = fatalError || error;
    }
    dashboard.stop();
  }

  const finishedAt = dependencies.now?.() || new Date();
  const finalState = store.snapshot();
  const counts = stateCounts(finalState);
  const finalTiming = calculateProgressMetrics({
    durationsMs: Object.values(
      finalState.providerStates
    )
      .map((entry) => entry.lastResult?.elapsedMs)
      .filter(Number.isFinite),
    completed: counts.progress,
    total: candidateProviderIds.length,
    startedAtMs:
      Date.parse(finalState.startedAt) ||
      startedAt.getTime(),
    errorCount: counts.errors,
  });
  const report = {
    reportVersion: 2,
    generatedAt: finishedAt.toISOString(),
    execution: {
      runId,
      mode: args.apply ? "mass_apply" : "mass_dry_run",
      status: finalState.status,
      finalizationReason:
        finalState.lastRunResult ||
        stopReason ||
        (fatalError ? "failed" : "completed"),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      elapsedMs:
        finishedAt.getTime() - startedAt.getTime(),
      resumeCommand: buildResumeCommand(args),
    },
    projectId: args.project,
    category: args.category || null,
    inputScopeHash: finalState.inputScopeHash,
    candidateCount: candidateProviderIds.length,
    selectedThisRun: providerReports.length,
    completed: counts.completed,
    partial: counts.partial,
    errors: counts.errors,
    skipped: counts.skipped,
    recoveredFromFirestore: counts.recovered,
    lastConfirmedProviderId:
      finalState.lastConfirmedProviderId,
    interruptedProviderIds:
      finalState.interruptedProviderIds || [],
    bytesDownloaded:
      finalState.totals.bytesDownloaded,
    bytesUploaded: finalState.totals.bytesUploaded,
    firestoreWrites:
      finalState.totals.firestoreWrites,
    storageWrites: finalState.totals.storageWrites,
    timing: {
      averageMs: finalTiming.averageMs,
      movingAverageMs: finalTiming.movingAverageMs,
      medianMs: finalTiming.medianMs,
      providersPerHour: finalTiming.providersPerHour,
      errorPercentage: finalTiming.errorPercentage,
      estimatedRemainingMs: finalTiming.etaMs,
      etaIsEstimate: true,
    },
    remoteReads:
      (runtime.metrics?.remoteReads || 0) -
      runtimeBaseline.remoteReads,
    remoteWrites:
      (runtime.metrics?.remoteWrites || 0) -
      runtimeBaseline.remoteWrites,
    checkpoint: {
      path: durableStatePath
        ? path.resolve(durableStatePath)
        : null,
      lastSavedAt: store.lastSavedAt,
      writesThisProcess: store.writeCount,
      recoveredFromBackup:
        Boolean(store.recovery) ||
        loaded.recoveredFromBackup,
    },
    lockPath: lock?.lockPath || null,
    logPath: logger.path || logPath,
    providerResults: providerReports,
    providersWithError: errorProviders,
    fatalError: fatalError
      ? {
          code: fatalError.code || "fatal_error",
          message: sanitizeText(fatalError.message),
        }
      : null,
  };
  let finalizationError = null;
  try {
    writeJsonAtomic(reportPath, report);
    logger.log(
      "run_finished",
      {
        runId,
        status: report.execution.status,
        finalizationReason:
          report.execution.finalizationReason,
        completed: report.completed,
        partial: report.partial,
        errors: report.errors,
        skipped: report.skipped,
        reportPath,
      },
      true
    );
  } catch (error) {
    finalizationError = error;
  } finally {
    if (!dependencies.logger) {
      try {
        logger.close();
      } catch (error) {
        finalizationError = finalizationError || error;
      }
    }
  }
  if (lock) {
    try {
      lock.release();
    } catch (error) {
      report.fatalError = report.fatalError || {
        code: error.code || "lock_release_failed",
        message: sanitizeText(error.message),
      };
    }
  }
  if (finalizationError) throw finalizationError;
  if (!dependencies.silentConsole) {
    console.log(
      JSON.stringify(
        {
          mode: report.execution.mode,
          status: report.execution.status,
          finalizationReason:
            report.execution.finalizationReason,
          completed: report.completed,
          partial: report.partial,
          errors: report.errors,
          skipped: report.skipped,
          lastConfirmedProviderId:
            finalState.lastConfirmedProviderId,
          interruptedProviderIds:
            finalState.interruptedProviderIds || [],
          remoteReads: report.remoteReads,
          remoteWrites: report.remoteWrites,
          statePath: report.checkpoint.path,
          reportPath,
          logPath: report.logPath,
          resumeCommand: report.execution.resumeCommand,
        },
        null,
        2
      )
    );
  }
  return report;
}

module.exports = {
  MemoryStateStore,
  buildResumeCommand,
  candidateQueues,
  classifyFailedResult,
  createLifecycle,
  createRunId,
  defaultBulkReportPath,
  defaultLogPath,
  extractorSha256,
  installTerminationHandlers,
  providerSummary,
  remoteEnrichmentComplete,
  runMassEnrichment,
  safeProviderFingerprint,
  stateCounts,
};
