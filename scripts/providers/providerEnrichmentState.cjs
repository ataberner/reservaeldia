"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const STATE_SCHEMA_VERSION = 1;
const ENRICHMENT_SCRIPT_VERSION = "2.1.0";
const PROVIDER_STATE_STATUSES = new Set([
  "pending",
  "processing",
  "storage_complete",
  "firestore_updated",
  "confirmed",
  "partial",
  "recoverable_error",
  "definitive_error",
  "skipped",
  "already_complete",
  "recovered",
]);
const CONFIRMED_STATUSES = new Set([
  "confirmed",
  "recovered",
]);
const TERMINAL_STATUSES = new Set([
  ...CONFIRMED_STATUSES,
  "definitive_error",
  "skipped",
  "already_complete",
]);

class ProviderEnrichmentStateError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ProviderEnrichmentStateError";
    this.code = code;
    this.details = details;
  }
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

function hashProviderIds(providerIds) {
  return sha256(
    [...new Set(providerIds)].sort().join("\n")
  );
}

function hashInputScope(inputScope) {
  return sha256(stableStringify(inputScope));
}

function checksumState(state) {
  const value = { ...state };
  delete value.checksumSha256;
  return sha256(stableStringify(value));
}

function withChecksum(state) {
  const next = {
    ...state,
    checksumSha256: null,
  };
  next.checksumSha256 = checksumState(next);
  return next;
}

function statePaths(statePath) {
  const main = path.resolve(statePath);
  const parsed = path.parse(main);
  const base = path.join(parsed.dir, parsed.name);
  return {
    main,
    backup: `${base}.backup${parsed.ext || ".json"}`,
    temporary: `${base}.tmp`,
    backupTemporary: `${base}.backup.tmp`,
    lock: `${base}.lock`,
  };
}

function syncFile(filePath) {
  const descriptor = fs.openSync(filePath, "r+");
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function syncDirectory(directoryPath) {
  let descriptor;
  try {
    descriptor = fs.openSync(directoryPath, "r");
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (
      ![
        "EACCES",
        "EBADF",
        "EISDIR",
        "EINVAL",
        "ENOTSUP",
        "EPERM",
      ].includes(error.code)
    ) {
      throw error;
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function writeStateAtomic(statePath, state, options = {}) {
  const paths = statePaths(statePath);
  const checked = withChecksum(state);
  fs.mkdirSync(path.dirname(paths.main), { recursive: true });
  fs.writeFileSync(
    paths.temporary,
    `${JSON.stringify(checked, null, 2)}\n`,
    {
      encoding: "utf8",
      flag: "w",
    }
  );
  syncFile(paths.temporary);

  let mainMovedToBackup = false;
  try {
    if (fs.existsSync(paths.main)) {
      if (fs.existsSync(paths.backup)) {
        fs.rmSync(paths.backup, { force: true });
      }
      fs.renameSync(paths.main, paths.backup);
      mainMovedToBackup = true;
      syncDirectory(path.dirname(paths.main));
    } else if (
      !options.preserveExistingBackup &&
      fs.existsSync(paths.backup)
    ) {
      fs.rmSync(paths.backup, { force: true });
    }
    fs.renameSync(paths.temporary, paths.main);
    syncDirectory(path.dirname(paths.main));
  } catch (error) {
    if (
      mainMovedToBackup &&
      !fs.existsSync(paths.main) &&
      fs.existsSync(paths.backup)
    ) {
      try {
        fs.renameSync(paths.backup, paths.main);
      } catch {
        // The original error is more useful; the backup remains recoverable.
      }
    }
    throw error;
  }
  return checked;
}

function parseAndValidateState(filePath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new ProviderEnrichmentStateError(
      "resume_state_invalid_json",
      `El estado ${filePath} no contiene JSON válido.`,
      { filePath, cause: error.message }
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new ProviderEnrichmentStateError(
      "resume_state_invalid_shape",
      `El estado ${filePath} no tiene una estructura válida.`,
      { filePath }
    );
  }
  if (
    typeof parsed.checksumSha256 !== "string" ||
    parsed.checksumSha256 !== checksumState(parsed)
  ) {
    throw new ProviderEnrichmentStateError(
      "resume_state_checksum_invalid",
      `El checksum del estado ${filePath} no coincide.`,
      { filePath }
    );
  }
  if (parsed.version !== STATE_SCHEMA_VERSION) {
    throw new ProviderEnrichmentStateError(
      "resume_state_version_incompatible",
      `La versión ${parsed.version} del estado no es compatible con ${STATE_SCHEMA_VERSION}.`,
      {
        filePath,
        found: parsed.version,
        expected: STATE_SCHEMA_VERSION,
      }
    );
  }
  if (
    !parsed.inputScope ||
    typeof parsed.inputScope !== "object" ||
    typeof parsed.inputScopeHash !== "string" ||
    parsed.inputScopeHash !== hashInputScope(parsed.inputScope)
  ) {
    throw new ProviderEnrichmentStateError(
      "resume_state_scope_invalid",
      `El alcance persistido en ${filePath} no es verificable.`,
      { filePath }
    );
  }
  if (
    !parsed.providerStates ||
    typeof parsed.providerStates !== "object" ||
    Array.isArray(parsed.providerStates)
  ) {
    throw new ProviderEnrichmentStateError(
      "resume_state_provider_states_invalid",
      `El estado ${filePath} no contiene estados por proveedor válidos.`,
      { filePath }
    );
  }
  for (const [providerId, providerState] of Object.entries(
    parsed.providerStates
  )) {
    if (
      !/^pcar_[a-f0-9]{24}$/.test(providerId) ||
      !providerState ||
      !PROVIDER_STATE_STATUSES.has(providerState.status)
    ) {
      throw new ProviderEnrichmentStateError(
        "resume_state_provider_entry_invalid",
        `El estado de ${providerId} no es compatible.`,
        { filePath, providerId }
      );
    }
  }
  return parsed;
}

function nextCorruptPath(mainPath) {
  const parsed = path.parse(mainPath);
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  return path.join(
    parsed.dir,
    `${parsed.name}.corrupt-${timestamp}${parsed.ext || ".json"}`
  );
}

function loadStateWithRecovery(statePath) {
  const paths = statePaths(statePath);
  const artifactsExist = Object.values({
    main: paths.main,
    backup: paths.backup,
    temporary: paths.temporary,
  }).some((candidate) => fs.existsSync(candidate));
  if (!artifactsExist) {
    return {
      exists: false,
      state: null,
      recoveredFromBackup: false,
      recovery: null,
      paths,
    };
  }

  let primaryError = null;
  if (fs.existsSync(paths.main)) {
    try {
      return {
        exists: true,
        state: parseAndValidateState(paths.main),
        recoveredFromBackup: false,
        recovery: null,
        paths,
      };
    } catch (error) {
      primaryError = error;
    }
  } else {
    primaryError = new ProviderEnrichmentStateError(
      "resume_state_primary_missing",
      "El estado principal no existe, pero hay artefactos previos.",
      { filePath: paths.main }
    );
  }

  if (fs.existsSync(paths.backup)) {
    try {
      const backupState = parseAndValidateState(paths.backup);
      let corruptArchive = null;
      if (fs.existsSync(paths.main)) {
        corruptArchive = nextCorruptPath(paths.main);
        fs.renameSync(paths.main, corruptArchive);
      }
      const restored = writeStateAtomic(
        paths.main,
        {
          ...backupState,
          status: "recovered",
          updatedAt: new Date().toISOString(),
          recovery: {
            recoveredAt: new Date().toISOString(),
            source: "backup",
            primaryErrorCode: primaryError.code,
          },
        },
        { preserveExistingBackup: true }
      );
      return {
        exists: true,
        state: restored,
        recoveredFromBackup: true,
        recovery: {
          source: paths.backup,
          corruptArchive,
          primaryErrorCode: primaryError.code,
        },
        paths,
      };
    } catch (backupError) {
      throw new ProviderEnrichmentStateError(
        "resume_state_unrecoverable",
        "El estado principal es inválido y el backup tampoco puede recuperarse.",
        {
          primaryErrorCode: primaryError.code,
          backupErrorCode: backupError.code || "backup_read_failed",
          temporaryExists: fs.existsSync(paths.temporary),
        }
      );
    }
  }

  throw new ProviderEnrichmentStateError(
    "resume_state_unrecoverable",
    "Existe un estado previo inválido y no hay un backup verificable; no se iniciará desde cero.",
    {
      primaryErrorCode: primaryError.code,
      temporaryExists: fs.existsSync(paths.temporary),
    }
  );
}

function createInputScope({
  projectId,
  category = null,
  providerIds,
  force,
  completeGallery,
  maxGalleryImages,
  contractSchemaVersion,
  extractorSha256,
}) {
  return {
    projectId,
    category: category || null,
    providerIdsHash: hashProviderIds(providerIds),
    providerCount: new Set(providerIds).size,
    force: Boolean(force),
    completeGallery: Boolean(completeGallery),
    maxGalleryImages,
    contractSchemaVersion,
    scriptVersion: ENRICHMENT_SCRIPT_VERSION,
    extractorSha256,
  };
}

function recalculateState(state) {
  const entries = Object.entries(state.providerStates || {});
  const byStatus = Object.fromEntries(
    [...PROVIDER_STATE_STATUSES].map((status) => [status, 0])
  );
  let lastConfirmedProviderId =
    state.lastConfirmedProviderId || null;
  for (const [providerId, providerState] of entries) {
    byStatus[providerState.status] += 1;
    if (
      CONFIRMED_STATUSES.has(providerState.status) &&
      providerState.confirmedAt
    ) {
      if (
        !lastConfirmedProviderId ||
        providerState.confirmedAt >=
          (state.providerStates[lastConfirmedProviderId]?.confirmedAt || "")
      ) {
        lastConfirmedProviderId = providerId;
      }
    }
  }
  state.processedProviderIds = entries
    .filter(([, value]) => TERMINAL_STATUSES.has(value.status))
    .map(([providerId]) => providerId)
    .sort();
  state.currentProviderIds = entries
    .filter(([, value]) => Boolean(value.workerId))
    .map(([providerId]) => providerId)
    .sort();
  state.currentProviderId =
    state.currentProviderIds[0] || null;
  state.lastConfirmedProviderId = lastConfirmedProviderId;
  state.completedCount =
    byStatus.confirmed + byStatus.recovered;
  state.partialCount =
    byStatus.partial +
    byStatus.storage_complete +
    byStatus.firestore_updated;
  state.errorCount =
    byStatus.recoverable_error +
    byStatus.definitive_error;
  state.skippedCount =
    byStatus.skipped + byStatus.already_complete;
  state.recoveredCount = byStatus.recovered;
  state.countsByStatus = byStatus;
  return state;
}

function createInitialState({
  inputScope,
  runId,
  now = new Date(),
}) {
  const timestamp = now.toISOString();
  return withChecksum(
    recalculateState({
      version: STATE_SCHEMA_VERSION,
      scriptVersion: ENRICHMENT_SCRIPT_VERSION,
      checksumSha256: null,
      inputScope,
      inputScopeHash: hashInputScope(inputScope),
      startedAt: timestamp,
      updatedAt: timestamp,
      status: "running",
      lastRunId: runId,
      lastConfirmedProviderId: null,
      processedProviderIds: [],
      providerStates: {},
      completedCount: 0,
      partialCount: 0,
      errorCount: 0,
      skippedCount: 0,
      recoveredCount: 0,
      currentProviderId: null,
      currentProviderIds: [],
      totals: {
        bytesDownloaded: 0,
        bytesUploaded: 0,
        firestoreWrites: 0,
        storageWrites: 0,
        attempts: 0,
      },
      lastCheckpoint: {
        reason: "initialized",
        savedAt: timestamp,
      },
      recovery: null,
    })
  );
}

function assertCompatibleState(state, inputScope) {
  if (
    state.scriptVersion !== ENRICHMENT_SCRIPT_VERSION ||
    state.inputScopeHash !== hashInputScope(inputScope) ||
    stableStringify(state.inputScope) !==
      stableStringify(inputScope)
  ) {
    throw new ProviderEnrichmentStateError(
      "resume_state_incompatible",
      "El estado pertenece a otro proyecto, alcance, conjunto de candidatos, opciones o versión del extractor.",
      {
        expectedScopeHash: hashInputScope(inputScope),
        foundScopeHash: state.inputScopeHash,
        expectedScriptVersion: ENRICHMENT_SCRIPT_VERSION,
        foundScriptVersion: state.scriptVersion,
      }
    );
  }
}

class DurableEnrichmentStateStore {
  constructor(statePath, options = {}) {
    this.statePath = path.resolve(statePath);
    this.now = options.now || (() => new Date());
    this.state = null;
    this.lastSavedAt = null;
    this.recovery = null;
    this.writeCount = 0;
    this.lastCheckpointDurationMs = 0;
    this.totalCheckpointDurationMs = 0;
    this._queue = Promise.resolve();
  }

  loadOrCreate({ inputScope, candidateProviderIds, runId }) {
    const loaded = loadStateWithRecovery(this.statePath);
    if (loaded.exists) {
      assertCompatibleState(loaded.state, inputScope);
      this.state = loaded.state;
      this.recovery = loaded.recovery;
      this.lastSavedAt =
        this.state.lastCheckpoint?.savedAt ||
        this.state.updatedAt;
      return {
        created: false,
        recoveredFromBackup: loaded.recoveredFromBackup,
        recovery: loaded.recovery,
        state: this.snapshot(),
      };
    }
    this.state = createInitialState({
      inputScope,
      candidateProviderIds,
      runId,
      now: this.now(),
    });
    this.state = writeStateAtomic(this.statePath, this.state);
    this.writeCount += 1;
    this.lastSavedAt = this.state.lastCheckpoint.savedAt;
    return {
      created: true,
      recoveredFromBackup: false,
      recovery: null,
      state: this.snapshot(),
    };
  }

  update(mutator, reason = "checkpoint") {
    const operation = async () => {
      const checkpointStartedAt = Date.now();
      if (!this.state) {
        throw new ProviderEnrichmentStateError(
          "resume_state_not_loaded",
          "El estado durable todavía no fue inicializado."
        );
      }
      await mutator(this.state);
      const timestamp = this.now().toISOString();
      this.state.updatedAt = timestamp;
      this.state.lastCheckpoint = {
        reason,
        savedAt: timestamp,
      };
      recalculateState(this.state);
      this.state = writeStateAtomic(
        this.statePath,
        this.state
      );
      this.writeCount += 1;
      this.lastSavedAt = timestamp;
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

  checkpoint(reason = "periodic") {
    return this.update(() => {}, reason);
  }

  async flush() {
    await this._queue;
  }

  snapshot() {
    return this.state
      ? JSON.parse(JSON.stringify(this.state))
      : null;
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function sanitizeCommand(argv) {
  return argv.map((entry) => {
    if (entry.startsWith("--credentials=")) {
      return "--credentials=[redactado]";
    }
    return entry;
  });
}

function readLock(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch (error) {
    return {
      pid: null,
      runId: null,
      invalid: true,
      error: error.message,
    };
  }
}

function acquireStateLock({
  statePath,
  runId,
  inputScopeHash,
  argv = process.argv.slice(2),
  recoverStaleLock = false,
  confirmStaleLock = "",
  now = new Date(),
  pid = process.pid,
  processAlive = isProcessAlive,
}) {
  const paths = statePaths(statePath);
  fs.mkdirSync(path.dirname(paths.lock), { recursive: true });
  if (fs.existsSync(paths.lock)) {
    const existing = readLock(paths.lock);
    const active = processAlive(existing.pid);
    if (active) {
      throw new ProviderEnrichmentStateError(
        "resume_lock_active",
        `Ya existe una ejecución activa para este estado (PID ${existing.pid}).`,
        { lockPath: paths.lock, pid: existing.pid }
      );
    }
    if (
      !recoverStaleLock ||
      String(confirmStaleLock) !== String(existing.pid)
    ) {
      throw new ProviderEnrichmentStateError(
        "resume_lock_stale",
        "Existe un lock abandonado. Requiere --recover-stale-lock y --confirm-stale-lock=PID.",
        { lockPath: paths.lock, pid: existing.pid }
      );
    }
    const stalePath = `${paths.lock}.stale-${now
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;
    fs.renameSync(paths.lock, stalePath);
  }

  const lock = {
    version: 1,
    pid,
    runId,
    createdAt: now.toISOString(),
    inputScopeHash,
    command: sanitizeCommand(argv),
  };
  const descriptor = fs.openSync(paths.lock, "wx");
  try {
    fs.writeFileSync(
      descriptor,
      `${JSON.stringify(lock, null, 2)}\n`,
      "utf8"
    );
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  syncDirectory(path.dirname(paths.lock));
  return {
    lock,
    lockPath: paths.lock,
    release() {
      if (!fs.existsSync(paths.lock)) return false;
      const current = readLock(paths.lock);
      if (current.runId !== runId || current.pid !== pid) {
        throw new ProviderEnrichmentStateError(
          "resume_lock_owner_mismatch",
          "El lock cambió de propietario y no se eliminará.",
          { lockPath: paths.lock }
        );
      }
      fs.rmSync(paths.lock, { force: true });
      syncDirectory(path.dirname(paths.lock));
      return true;
    },
  };
}

module.exports = {
  CONFIRMED_STATUSES,
  DurableEnrichmentStateStore,
  ENRICHMENT_SCRIPT_VERSION,
  PROVIDER_STATE_STATUSES,
  ProviderEnrichmentStateError,
  STATE_SCHEMA_VERSION,
  TERMINAL_STATUSES,
  acquireStateLock,
  assertCompatibleState,
  checksumState,
  createInitialState,
  createInputScope,
  hashInputScope,
  hashProviderIds,
  isProcessAlive,
  loadStateWithRecovery,
  parseAndValidateState,
  recalculateState,
  sanitizeCommand,
  sha256,
  stableStringify,
  statePaths,
  withChecksum,
  writeStateAtomic,
};
