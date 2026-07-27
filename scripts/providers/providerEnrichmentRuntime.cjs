"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { performance } = require("perf_hooks");
const {
  ProviderEnrichmentError,
} = require("./providerEnrichmentImages.cjs");

const REDACTED_KEYS = new Set([
  "credentials",
  "email",
  "telefono",
  "phone",
  "direccion",
  "address",
  "html",
]);

function sanitizeText(value) {
  return String(value || "")
    .replace(
      /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi,
      "[email-redactado]"
    )
    .replace(/(?:\+?\d[\d\s().-]{6,}\d)/g, "[telefono-redactado]")
    .replace(/--credentials=(?:"[^"]*"|'[^']*'|\S+)/gi, "--credentials=[redactado]")
    .slice(0, 1000);
}

function sanitizeLogValue(value, key = "") {
  if (REDACTED_KEYS.has(key.toLowerCase())) {
    return "[redactado]";
  }
  if (typeof value === "string") return sanitizeText(value);
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeLogValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([entryKey]) => entryKey !== "buffer")
        .map(([entryKey, entryValue]) => [
          entryKey,
          sanitizeLogValue(entryValue, entryKey),
        ])
    );
  }
  return value;
}

function createPersistentLogger(logPath, options = {}) {
  const absolutePath = path.resolve(logPath);
  fs.mkdirSync(path.dirname(absolutePath), {
    recursive: true,
  });
  const descriptor = fs.openSync(absolutePath, "a");
  let closed = false;
  return {
    path: absolutePath,
    log(event, details = {}, durable = false) {
      if (closed) return;
      const entry = sanitizeLogValue({
        timestamp: (
          options.now?.() || new Date()
        ).toISOString(),
        event,
        ...details,
      });
      fs.writeSync(
        descriptor,
        `${JSON.stringify(entry)}\n`,
        null,
        "utf8"
      );
      if (durable) fs.fsyncSync(descriptor);
    },
    flush() {
      if (!closed) fs.fsyncSync(descriptor);
    },
    close() {
      if (closed) return;
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      closed = true;
    },
  };
}

function formatDuration(milliseconds) {
  if (
    milliseconds === null ||
    milliseconds === undefined ||
    !Number.isFinite(milliseconds)
  ) {
    return "—";
  }
  const totalSeconds = Math.max(
    0,
    Math.round(milliseconds / 1000)
  );
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} h ${minutes} m`;
  if (minutes > 0) return `${minutes} m ${seconds} s`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  return `${(bytes / 1024 ** unitIndex).toFixed(
    unitIndex === 0 ? 0 : 1
  )} ${units[unitIndex]}`;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function calculateProgressMetrics({
  durationsMs,
  completed,
  total,
  startedAtMs,
  errorCount,
}) {
  const elapsedMs = Math.max(0, Date.now() - startedAtMs);
  const useful = durationsMs.filter(
    (value) => Number.isFinite(value) && value >= 0
  );
  const averageMs =
    useful.length > 0
      ? useful.reduce((sum, value) => sum + value, 0) /
        useful.length
      : null;
  const movingWindow = useful.slice(-20);
  const movingAverageMs =
    movingWindow.length > 0
      ? movingWindow.reduce(
          (sum, value) => sum + value,
          0
        ) / movingWindow.length
      : null;
  const remaining = Math.max(0, total - completed);
  return {
    elapsedMs,
    averageMs,
    movingAverageMs,
    medianMs: median(useful),
    etaMs:
      movingAverageMs === null
        ? null
        : movingAverageMs * remaining,
    providersPerHour:
      elapsedMs > 0
        ? (completed / elapsedMs) * 3600000
        : 0,
    errorPercentage:
      completed + errorCount > 0
        ? (errorCount / (completed + errorCount)) * 100
        : 0,
  };
}

function renderProgressBar(completed, total, width = 30) {
  const ratio =
    total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;
  const filled = Math.round(ratio * width);
  return `${"█".repeat(filled)}${"░".repeat(
    width - filled
  )}`;
}

function renderDashboard(model) {
  const progress =
    model.total > 0
      ? (model.progress / model.total) * 100
      : 0;
  const metrics = calculateProgressMetrics({
    durationsMs: model.providerDurationsMs,
    completed: model.completed,
    total: model.total,
    startedAtMs: model.startedAtMs,
    errorCount: model.errors,
  });
  return [
    "────────────────────────────────────────────",
    "Enriquecimiento de proveedores",
    "",
    `Progreso: ${model.progress} / ${model.total}`,
    `${renderProgressBar(model.progress, model.total)} ${progress.toFixed(
      2
    )} %`,
    "",
    "Proveedor actual:",
    model.currentProviderName || "—",
    model.currentProviderId || "—",
    "",
    `Etapa: ${model.stage || "—"}`,
    `Último confirmado: ${model.lastConfirmedProviderId || "—"}`,
    "",
    `Completados: ${model.completed}`,
    `Parciales: ${model.partial}`,
    `Errores: ${model.errors}`,
    `Omitidos: ${model.skipped}`,
    `Recuperados: ${model.recovered}`,
    "",
    `Tiempo proveedor: ${formatDuration(model.currentProviderElapsedMs)}`,
    `Promedio móvil: ${formatDuration(metrics.movingAverageMs)}`,
    `Mediana: ${formatDuration(metrics.medianMs)}`,
    `Tiempo transcurrido: ${formatDuration(metrics.elapsedMs)}`,
    `Tiempo restante estimado: ${formatDuration(metrics.etaMs)}`,
    `Proveedores/hora: ${metrics.providersPerHour.toFixed(1)}`,
    "",
    `Descargado: ${formatBytes(model.bytesDownloaded)}`,
    `Subido: ${formatBytes(model.bytesUploaded)}`,
    `Firestore writes: ${model.firestoreWrites}`,
    `Storage writes: ${model.storageWrites}`,
    "",
    "Checkpoint:",
    model.checkpointPath || "—",
    `Último guardado: ${model.lastCheckpointAt || "—"}`,
    "────────────────────────────────────────────",
  ].join("\n");
}

class ProgressDashboard {
  constructor(options = {}) {
    this.output = options.output || process.stdout;
    this.interactive =
      options.interactive ?? Boolean(this.output.isTTY);
    this.intervalMs = options.intervalMs || 1000;
    this.model = {
      total: 0,
      progress: 0,
      completed: 0,
      partial: 0,
      errors: 0,
      skipped: 0,
      recovered: 0,
      currentProviderId: null,
      currentProviderName: null,
      currentProviderStartedAtMs: null,
      currentProviderElapsedMs: null,
      stage: null,
      lastConfirmedProviderId: null,
      providerDurationsMs: [],
      startedAtMs: Date.now(),
      bytesDownloaded: 0,
      bytesUploaded: 0,
      firestoreWrites: 0,
      storageWrites: 0,
      checkpointPath: null,
      lastCheckpointAt: null,
      ...options.initial,
    };
    this.timer = null;
    this.rendered = false;
  }

  start() {
    if (this.timer) return;
    this.render();
    this.timer = setInterval(() => this.render(), this.intervalMs);
    this.timer.unref?.();
  }

  update(patch) {
    Object.assign(this.model, patch);
  }

  providerFinished(durationMs) {
    if (Number.isFinite(durationMs)) {
      this.model.providerDurationsMs.push(durationMs);
    }
    this.model.currentProviderStartedAtMs = null;
    this.model.currentProviderElapsedMs = null;
  }

  render() {
    if (this.model.currentProviderStartedAtMs) {
      this.model.currentProviderElapsedMs =
        Date.now() - this.model.currentProviderStartedAtMs;
    }
    if (!this.interactive) return;
    if (this.rendered) {
      readline.cursorTo(this.output, 0, 0);
      readline.clearScreenDown(this.output);
    }
    this.output.write(`${renderDashboard(this.model)}\n`);
    this.rendered = true;
  }

  simpleLine(message) {
    if (this.interactive) return;
    this.output.write(`${sanitizeText(message)}\n`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.render();
  }
}

class SiteRequestController {
  constructor(options = {}) {
    this.requestDelayMs = options.requestDelayMs || 0;
    this.pauseOn429 = Boolean(options.pauseOn429);
    this.sleep =
      options.sleep ||
      ((milliseconds) =>
        new Promise((resolve) =>
          setTimeout(resolve, milliseconds)
        ));
    this.nowMs = options.nowMs || (() => Date.now());
    this.shouldStop = options.shouldStop || (() => false);
    this.onEvent = options.onEvent || (() => {});
    this.nextRequestAt = 0;
    this.openUntil = 0;
    this.transientFailures = [];
    this.retries = 0;
    this._schedule = Promise.resolve();
  }

  beforeRequest(details) {
    const task = async () => {
      if (this.shouldStop()) {
        throw new ProviderEnrichmentError(
          "interrupted_before_request",
          "La ejecución fue interrumpida antes de iniciar una nueva solicitud."
        );
      }
      const now = this.nowMs();
      const waitUntil = Math.max(
        this.nextRequestAt,
        this.openUntil
      );
      if (waitUntil > now) {
        await this.sleep(waitUntil - now);
      }
      if (this.shouldStop()) {
        throw new ProviderEnrichmentError(
          "interrupted_before_request",
          "La ejecución fue interrumpida antes de iniciar una nueva solicitud."
        );
      }
      this.nextRequestAt =
        this.nowMs() + this.requestDelayMs;
      this.onEvent({
        type: "request",
        ...details,
      });
    };
    const pending = this._schedule.then(task, task);
    this._schedule = pending.catch(() => {});
    return pending;
  }

  onResponse({ status, retryAfterMs = 0, ...details }) {
    const now = this.nowMs();
    this.transientFailures = this.transientFailures.filter(
      (timestamp) => now - timestamp <= 60000
    );
    if (status === 429 || status >= 500) {
      this.transientFailures.push(now);
    } else if (status >= 200 && status < 400) {
      this.transientFailures = [];
    }
    if (status === 429 && this.pauseOn429) {
      this.openUntil = Math.max(
        this.openUntil,
        now + (retryAfterMs || 60000)
      );
    } else if (this.transientFailures.length >= 5) {
      this.openUntil = Math.max(
        this.openUntil,
        now + Math.max(retryAfterMs, 60000)
      );
      this.onEvent({
        type: "circuit_opened",
        openUntil: new Date(this.openUntil).toISOString(),
        transientFailures: this.transientFailures.length,
      });
    }
    this.onEvent({
      type: "response",
      status,
      retryAfterMs,
      ...details,
    });
  }

  onRetry(details) {
    this.retries += 1;
    this.onEvent({
      type: "retry",
      ...details,
    });
  }
}

function timedOperation(callback) {
  const startedAt = performance.now();
  return Promise.resolve()
    .then(callback)
    .then((value) => ({
      value,
      durationMs: Math.round(
        performance.now() - startedAt
      ),
    }));
}

module.exports = {
  ProgressDashboard,
  SiteRequestController,
  calculateProgressMetrics,
  createPersistentLogger,
  formatBytes,
  formatDuration,
  median,
  renderDashboard,
  renderProgressBar,
  sanitizeLogValue,
  sanitizeText,
  timedOperation,
};
