const BREADCRUMBS_KEY = "editor_issue_breadcrumbs_v1";
import { classifyBrowserStorageError } from "../storage/browserStorageErrors.js";
import { markBrowserStorageFailure } from "../storage/browserStorageRecovery.js";

const PENDING_ISSUE_KEY = "editor_issue_pending_v1";
const EDITOR_SESSION_KEY = "editor_issue_editor_session_v1";
const EDITOR_SESSION_EXIT_KEY = "editor_issue_editor_exit_v1";
const MAX_BREADCRUMBS = 60;
const MAX_MESSAGE_LEN = 600;
const MAX_STACK_LEN = 6000;
const MAX_DETAIL_LEN = 8000;
const ISSUE_DEDUPE_WINDOW_MS = 30000;
let activeWatchdogSessionId = null;
let reporterSuppressionDepth = 0;
let globalIssueHandlersRefCount = 0;
let globalIssueHandlersTeardown = null;
const recentIssueDedupe = new Map();

function getStorage(kind) {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function truncate(value, maxLen) {
  const text = String(value ?? "");
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

function safeJson(value, maxLen = MAX_DETAIL_LEN) {
  try {
    return truncate(JSON.stringify(value), maxLen);
  } catch (error) {
    return truncate(String(error?.message || error || "json_error"), maxLen);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function getRuntimeSnapshot() {
  if (typeof window === "undefined") return {};

  const nav = window.navigator || {};
  const perf = window.performance || {};
  const mem = perf.memory || null;

  return {
    href: window.location?.href || null,
    path: window.location?.pathname || null,
    query: window.location?.search || null,
    userAgent: nav.userAgent || null,
    language: nav.language || null,
    platform: nav.platform || null,
    viewport: {
      width: Number(window.innerWidth || 0),
      height: Number(window.innerHeight || 0),
      dpr: Number(window.devicePixelRatio || 1),
    },
    memory: mem
      ? {
          usedJSHeapSize: Number(mem.usedJSHeapSize || 0),
          totalJSHeapSize: Number(mem.totalJSHeapSize || 0),
          jsHeapSizeLimit: Number(mem.jsHeapSizeLimit || 0),
        }
      : null,
  };
}

function getCurrentQuerySlug() {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location?.search || "");
    const slug = params.get("slug") || params.get("templateId") || "";
    return slug ? truncate(slug, 180) : null;
  } catch {
    return null;
  }
}

function summarizeBrowserStorageClassification(classification) {
  if (!classification?.isBrowserStorageError) return null;
  return {
    kind: classification.isIndexedDbError ? "indexeddb" : "browser-storage",
    reason: classification.reason || null,
    recoverable: classification.recoverable === true,
    normalizedName: truncate(classification.normalized?.name, 120),
    normalizedMessage: truncate(classification.normalized?.message, MAX_MESSAGE_LEN),
    evidence: classification.evidence || null,
  };
}

function withCaptureStack(errorLike, label) {
  if (errorLike instanceof Error && errorLike.stack) return errorLike;
  const captureStack = new Error(label || "Captured browser error").stack || "";

  if (errorLike instanceof Error) {
    try {
      errorLike.stack = errorLike.stack || captureStack;
    } catch {
      // Some browser errors expose readonly stacks.
    }
    return errorLike;
  }

  if (errorLike && typeof errorLike === "object") {
    return {
      ...errorLike,
      name: errorLike.name || errorLike.reason?.name || "UnknownError",
      message:
        errorLike.message ||
        errorLike.reason?.message ||
        String(errorLike.reason || "Error desconocido"),
      stack: errorLike.stack || errorLike.reason?.stack || captureStack,
    };
  }

  return {
    name: "NonErrorThrown",
    message: String(errorLike || "Error desconocido"),
    stack: captureStack,
  };
}

function readJson(storage, key, fallback) {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(storage, key, value) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // noop
  }
}

function createFingerprint(source, message, path) {
  const base = `${source || "unknown"}|${message || "no_message"}|${path || "no_path"}`;
  let hash = 0;
  for (let i = 0; i < base.length; i += 1) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }
  return `edi_${Math.abs(hash)}`;
}

export function pushEditorBreadcrumb(event, detail = {}) {
  const storage = getStorage("session");
  if (!storage) return;

  const current = readJson(storage, BREADCRUMBS_KEY, []);
  const next = Array.isArray(current) ? current : [];

  next.push({
    at: nowIso(),
    event: truncate(event, 120),
    detail: safeJson(detail, 1000),
  });

  while (next.length > MAX_BREADCRUMBS) {
    next.shift();
  }

  writeJson(storage, BREADCRUMBS_KEY, next);
}

export function getEditorBreadcrumbs() {
  const storage = getStorage("session");
  if (!storage) return [];
  const value = readJson(storage, BREADCRUMBS_KEY, []);
  return Array.isArray(value) ? value : [];
}

export function clearEditorBreadcrumbs() {
  const storage = getStorage("session");
  if (!storage) return;
  try {
    storage.removeItem(BREADCRUMBS_KEY);
  } catch {
    // noop
  }
}

function normalizeError(errorLike) {
  if (!errorLike) {
    return { name: "UnknownError", message: "Error desconocido", stack: "" };
  }

  if (errorLike instanceof Error) {
    return {
      name: truncate(errorLike.name || "Error", 120),
      message: truncate(errorLike.message || "Sin mensaje", MAX_MESSAGE_LEN),
      stack: truncate(errorLike.stack || "", MAX_STACK_LEN),
    };
  }

  if (typeof errorLike === "object") {
    const message =
      errorLike.message ||
      errorLike.reason?.message ||
      errorLike.reason ||
      safeJson(errorLike, MAX_MESSAGE_LEN);
    const stack = errorLike.stack || errorLike.reason?.stack || "";
    const name = errorLike.name || errorLike.reason?.name || "NonErrorThrown";
    return {
      name: truncate(name, 120),
      message: truncate(message, MAX_MESSAGE_LEN),
      stack: truncate(stack, MAX_STACK_LEN),
    };
  }

  return {
    name: "NonErrorThrown",
    message: truncate(errorLike, MAX_MESSAGE_LEN),
    stack: "",
  };
}

function collectIssueTokens(value, acc = []) {
  if (value == null) return acc;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    acc.push(String(value));
    return acc;
  }

  if (value instanceof Error) {
    if (value.name) acc.push(String(value.name));
    if (value.message) acc.push(String(value.message));
    if (value.stack) acc.push(String(value.stack));
    return acc;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectIssueTokens(entry, acc));
    return acc;
  }

  if (typeof value === "object") {
    [
      value.name,
      value.message,
      value.stack,
      value.filename,
      value.sourceURL,
      value.reason,
      value.error,
      value.target?.src,
      value.target?.href,
    ].forEach((entry) => collectIssueTokens(entry, acc));
  }

  return acc;
}

function isExternalExtensionIssue(eventLike) {
  const haystack = collectIssueTokens(eventLike)
    .join("\n")
    .toLowerCase();

  return (
    haystack.includes("chrome-extension://") ||
    haystack.includes("moz-extension://") ||
    haystack.includes("safari-web-extension://")
  );
}

export function buildEditorIssueReport({
  source = "unknown",
  error = null,
  detail = {},
  severity = "error",
}) {
  const normalized = normalizeError(error);
  const runtime = getRuntimeSnapshot();
  const breadcrumbs = getEditorBreadcrumbs();
  const slug = detail?.slug || detail?.querySlug || getCurrentQuerySlug() || null;

  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: nowIso(),
    source: truncate(source, 160),
    severity: truncate(severity, 40),
    slug: slug ? truncate(slug, 180) : null,
    name: normalized.name,
    message: normalized.message,
    stack: normalized.stack,
    detail: safeJson(detail, MAX_DETAIL_LEN),
    runtime,
    breadcrumbs,
    fingerprint: createFingerprint(source, normalized.message, runtime?.path),
    repetitions: Number(detail?.repetitions || 1),
  };
}

export function buildEditorIssueTransportPayload(report) {
  if (!report || typeof report !== "object") return {};

  const runtime =
    report.runtime && typeof report.runtime === "object"
      ? {
          href: report.runtime.href || null,
          path: report.runtime.path || null,
          query: report.runtime.query || null,
          userAgent: truncate(report.runtime.userAgent, 400),
          language: report.runtime.language || null,
          platform: report.runtime.platform || null,
          viewport: report.runtime.viewport || null,
          memory: report.runtime.memory || null,
        }
      : null;

  const breadcrumbs = Array.isArray(report.breadcrumbs)
    ? report.breadcrumbs.slice(-30).map((item) => ({
        at: item?.at || null,
        event: truncate(item?.event, 120),
        detail: truncate(item?.detail, 800),
      }))
    : [];

  return {
    id: truncate(report.id, 120),
    occurredAt: truncate(report.occurredAt, 80),
    source: truncate(report.source, 180),
    severity: truncate(report.severity, 40),
    slug: truncate(report.slug, 180),
    name: truncate(report.name, 120),
    message: truncate(report.message, 2000),
    stack: truncate(report.stack, 12000),
    detail: truncate(report.detail, 12000),
    runtime,
    breadcrumbs,
    fingerprint: truncate(report.fingerprint, 180),
    repetitions: Number(report.repetitions || 1),
  };
}

export function persistPendingEditorIssue(report) {
  const storage = getStorage("local");
  if (!storage || !report) return;
  writeJson(storage, PENDING_ISSUE_KEY, report);
}

export function readPendingEditorIssue() {
  const storage = getStorage("local");
  if (!storage) return null;
  return readJson(storage, PENDING_ISSUE_KEY, null);
}

export function clearPendingEditorIssue() {
  const storage = getStorage("local");
  if (!storage) return;
  try {
    storage.removeItem(PENDING_ISSUE_KEY);
  } catch {
    // noop
  }
}

export function captureEditorIssue(payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const rawDetail =
    safePayload.detail && typeof safePayload.detail === "object"
      ? safePayload.detail
      : {};
  const { storageRecoveryMarked, ...publicRawDetail } = rawDetail;
  const classification = classifyBrowserStorageError(safePayload.error, {
    ...publicRawDetail,
    source: safePayload.source || "unknown",
  });
  const storageSummary = summarizeBrowserStorageClassification(classification);
  const detail = storageSummary
    ? {
        ...publicRawDetail,
        operation: publicRawDetail.operation || safePayload.source || "unknown",
        module: publicRawDetail.module || "editorIssueReporter",
        phase: publicRawDetail.phase || "global-capture",
        storage: storageSummary,
      }
    : publicRawDetail;
  const severity =
    storageSummary && safePayload.severity === "fatal"
      ? "recoverable"
      : safePayload.severity || "error";

  if (storageSummary && storageRecoveryMarked !== true) {
    markBrowserStorageFailure(safePayload.error, detail);
  }

  const report = buildEditorIssueReport({
    ...safePayload,
    detail,
    severity,
  });
  const nowMs = Date.now();
  const existing = recentIssueDedupe.get(report.fingerprint);
  if (existing && nowMs - existing.firstSeenMs <= ISSUE_DEDUPE_WINDOW_MS) {
    existing.repetitions += 1;
    existing.lastSeenMs = nowMs;
    existing.report.repetitions = existing.repetitions;
    existing.report.detail = safeJson(
      {
        ...detail,
        repetitions: existing.repetitions,
        deduped: true,
      },
      MAX_DETAIL_LEN
    );
    pushEditorBreadcrumb("issue-deduped", {
      source: report.source,
      fingerprint: report.fingerprint,
      repetitions: existing.repetitions,
    });
    persistPendingEditorIssue(existing.report);
    return existing.report;
  }

  recentIssueDedupe.set(report.fingerprint, {
    firstSeenMs: nowMs,
    lastSeenMs: nowMs,
    repetitions: 1,
    report,
  });

  for (const [fingerprint, entry] of recentIssueDedupe.entries()) {
    if (nowMs - entry.firstSeenMs > ISSUE_DEDUPE_WINDOW_MS) {
      recentIssueDedupe.delete(fingerprint);
    }
  }

  pushEditorBreadcrumb("issue-captured", {
    source: report.source,
    fingerprint: report.fingerprint,
  });
  persistPendingEditorIssue(report);

  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent("editor-issue-captured", { detail: report })
      );
    } catch {
      // noop
    }
  }

  return report;
}

function isEditorIssueReporterSuppressed() {
  return reporterSuppressionDepth > 0;
}

export async function runWithEditorIssueReporterSuppressed(task) {
  reporterSuppressionDepth += 1;
  try {
    return typeof task === "function" ? await task() : undefined;
  } finally {
    reporterSuppressionDepth = Math.max(0, reporterSuppressionDepth - 1);
  }
}

export function installGlobalEditorIssueHandlers() {
  if (typeof window === "undefined") return () => {};
  globalIssueHandlersRefCount += 1;

  if (globalIssueHandlersTeardown) {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      globalIssueHandlersRefCount = Math.max(0, globalIssueHandlersRefCount - 1);
      if (globalIssueHandlersRefCount === 0 && globalIssueHandlersTeardown) {
        globalIssueHandlersTeardown();
        globalIssueHandlersTeardown = null;
      }
    };
  }

  const onWindowError = (event) => {
    if (isEditorIssueReporterSuppressed()) {
      pushEditorBreadcrumb("ignored-reporter-self-issue", {
        source: "window.onerror",
      });
      return;
    }

    if (isExternalExtensionIssue(event)) {
      pushEditorBreadcrumb("ignored-global-browser-extension-issue", {
        source: "window.onerror",
      });
      return;
    }

    captureEditorIssue({
      source: "window.onerror",
      error: event?.error || event?.message || event,
      detail: {
        file: event?.filename || null,
        line: event?.lineno || null,
        col: event?.colno || null,
      },
      severity: "fatal",
    });
  };

  const onUnhandledRejection = (event) => {
    if (isEditorIssueReporterSuppressed()) {
      event?.preventDefault?.();
      pushEditorBreadcrumb("ignored-reporter-self-issue", {
        source: "window.unhandledrejection",
      });
      return;
    }

    if (isExternalExtensionIssue(event)) {
      pushEditorBreadcrumb("ignored-global-browser-extension-issue", {
        source: "window.unhandledrejection",
      });
      return;
    }

    const reason = event?.reason || event;
    const classification = classifyBrowserStorageError(reason, {
      source: "window.unhandledrejection",
      operation: "global-unhandledrejection",
      module: "editorIssueReporter",
      phase: "runtime",
    });
    if (classification.isBrowserStorageError) {
      event?.preventDefault?.();
    }

    captureEditorIssue({
      source: "window.unhandledrejection",
      error: withCaptureStack(reason, "window.unhandledrejection"),
      detail: {
        operation: "global-unhandledrejection",
        module: "editorIssueReporter",
        phase: "runtime",
        slug: getCurrentQuerySlug(),
        storage: summarizeBrowserStorageClassification(classification),
      },
      severity: classification.isBrowserStorageError ? "recoverable" : "fatal",
    });
  };

  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  globalIssueHandlersTeardown = () => {
    window.removeEventListener("error", onWindowError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };

  let released = false;
  return () => {
    if (released) return;
    released = true;
    globalIssueHandlersRefCount = Math.max(0, globalIssueHandlersRefCount - 1);
    if (globalIssueHandlersRefCount === 0 && globalIssueHandlersTeardown) {
      globalIssueHandlersTeardown();
      globalIssueHandlersTeardown = null;
    }
  };
}

export function __resetEditorIssueReporterForTests() {
  reporterSuppressionDepth = 0;
  globalIssueHandlersRefCount = 0;
  globalIssueHandlersTeardown = null;
  recentIssueDedupe.clear();
  activeWatchdogSessionId = null;
}

function readEditorSessionMarker() {
  const sessionStorage = getStorage("session");
  const localStorage = getStorage("local");

  if (sessionStorage) {
    const marker = readJson(sessionStorage, EDITOR_SESSION_KEY, null);
    if (marker) return marker;
  }

  // Limpieza de marcador legacy en localStorage para evitar falsos positivos cruzados entre pestañas.
  if (localStorage) {
    try {
      localStorage.removeItem(EDITOR_SESSION_KEY);
    } catch {
      // noop
    }
  }

  return null;
}

function writeEditorSessionMarker(value) {
  const sessionStorage = getStorage("session");
  if (sessionStorage) {
    writeJson(sessionStorage, EDITOR_SESSION_KEY, value);
  }

  // Limpieza de legacy para evitar lecturas viejas en clientes desactualizados.
  const localStorage = getStorage("local");
  if (localStorage) {
    try {
      localStorage.removeItem(EDITOR_SESSION_KEY);
    } catch {
      // noop
    }
  }
}

function clearEditorSessionMarker() {
  const sessionStorage = getStorage("session");
  const localStorage = getStorage("local");

  try {
    sessionStorage?.removeItem(EDITOR_SESSION_KEY);
  } catch {
    // noop
  }

  try {
    localStorage?.removeItem(EDITOR_SESSION_KEY);
  } catch {
    // noop
  }
}

function readEditorExitMarker() {
  const sessionStorage = getStorage("session");
  const localStorage = getStorage("local");

  if (sessionStorage) {
    const marker = readJson(sessionStorage, EDITOR_SESSION_EXIT_KEY, null);
    if (marker) return marker;
  }

  // Limpieza de marcador legacy en localStorage para evitar cruces entre pestañas.
  if (localStorage) {
    try {
      localStorage.removeItem(EDITOR_SESSION_EXIT_KEY);
    } catch {
      // noop
    }
  }

  return null;
}

function writeEditorExitMarker(value) {
  const sessionStorage = getStorage("session");
  if (sessionStorage) {
    writeJson(sessionStorage, EDITOR_SESSION_EXIT_KEY, value);
  }

  // Limpieza de legacy para evitar lecturas viejas en clientes desactualizados.
  const localStorage = getStorage("local");
  if (localStorage) {
    try {
      localStorage.removeItem(EDITOR_SESSION_EXIT_KEY);
    } catch {
      // noop
    }
  }
}

function clearEditorExitMarker() {
  const sessionStorage = getStorage("session");
  const localStorage = getStorage("local");

  try {
    sessionStorage?.removeItem(EDITOR_SESSION_EXIT_KEY);
  } catch {
    // noop
  }

  try {
    localStorage?.removeItem(EDITOR_SESSION_EXIT_KEY);
  } catch {
    // noop
  }
}

export function markEditorSessionIntentionalExit({
  slug = null,
  reason = "manual-exit",
  ttlMs = 1000 * 60 * 5,
} = {}) {
  if (typeof window === "undefined") return;

  const safeTtlMs = Math.max(1000, Number(ttlMs) || 1000 * 60 * 5);
  writeEditorExitMarker({
    slug: typeof slug === "string" ? truncate(slug, 180) : null,
    reason: truncate(reason, 120),
    at: nowIso(),
    expiresAt: new Date(Date.now() + safeTtlMs).toISOString(),
  });
}

export function startEditorSessionWatchdog({
  slug,
  heartbeatMs = 3000,
  context = {},
}) {
  if (typeof window === "undefined" || !slug) return () => {};

  const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  activeWatchdogSessionId = sessionId;
  clearEditorExitMarker();
  const safeHeartbeatMs = Math.max(1000, Number(heartbeatMs) || 3000);

  const updateMarker = (patch = {}) => {
    const current = readEditorSessionMarker() || {};
    if (current.id && current.id !== sessionId) return;
    writeEditorSessionMarker({
      ...current,
      ...patch,
      id: sessionId,
      slug: truncate(slug, 180),
    });
  };

  const updateHeartbeat = () => {
    const startedAt = readEditorSessionMarker()?.startedAt || nowIso();
    updateMarker({
      active: true,
      startedAt,
      lastHeartbeatAt: nowIso(),
      path: window.location?.pathname || null,
      query: window.location?.search || null,
      context: safeJson(context, 1200),
    });
  };

  const onPageHide = () => {
    updateMarker({
      lastPageHideAt: nowIso(),
      visibility: typeof document !== "undefined" ? document.visibilityState : null,
    });
  };

  updateHeartbeat();
  const timerId = window.setInterval(updateHeartbeat, safeHeartbeatMs);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("beforeunload", onPageHide);

  return (reason = "closed") => {
    window.clearInterval(timerId);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("beforeunload", onPageHide);
    if (activeWatchdogSessionId === sessionId) {
      activeWatchdogSessionId = null;
    }

    const marker = readEditorSessionMarker();
    if (marker?.id === sessionId) {
      writeEditorSessionMarker({
        ...marker,
        active: false,
        closedAt: nowIso(),
        closedReason: truncate(reason, 80),
      });
      clearEditorSessionMarker();
    }
  };
}

function parseDateMs(value) {
  if (!value) return null;
  const asMs = new Date(value).getTime();
  return Number.isFinite(asMs) ? asMs : null;
}

function consumeIntentionalExitMarker({
  currentSlug = null,
  markerSlug = null,
} = {}) {
  const exitMarker = readEditorExitMarker();
  if (!exitMarker) return null;

  const now = Date.now();
  const expiresAtMs = parseDateMs(exitMarker.expiresAt);
  if (expiresAtMs !== null && now > expiresAtMs) {
    clearEditorExitMarker();
    return null;
  }

  const exitSlug = typeof exitMarker.slug === "string" ? exitMarker.slug : null;
  const expectedSlug = markerSlug || currentSlug || null;

  if (exitSlug && expectedSlug && exitSlug !== expectedSlug) {
    return null;
  }

  if (currentSlug && exitSlug && currentSlug !== exitSlug) {
    return null;
  }

  clearEditorExitMarker();
  return exitMarker;
}

export function consumeInterruptedEditorSession({
  currentSlug = null,
  maxAgeMs = 1000 * 60 * 120,
} = {}) {
  if (typeof window === "undefined") return null;

  const marker = readEditorSessionMarker();
  if (!marker) return null;
  if (marker?.id && marker.id === activeWatchdogSessionId) return null;

  if (marker.active !== true) {
    clearEditorSessionMarker();
    return null;
  }

  const markerSlug = typeof marker.slug === "string" ? marker.slug : null;
  const intentionalExit = consumeIntentionalExitMarker({
    currentSlug,
    markerSlug,
  });
  if (intentionalExit) {
    clearEditorSessionMarker();
    pushEditorBreadcrumb("editor-session-exit-ack", {
      source: "intentional-exit",
      slug: markerSlug || currentSlug || null,
      reason: intentionalExit.reason || null,
    });
    return null;
  }

  if (currentSlug && markerSlug && currentSlug === markerSlug) {
    return null;
  }

  const now = Date.now();
  const lastHeartbeatAtMs = parseDateMs(marker.lastHeartbeatAt);
  const startedAtMs = parseDateMs(marker.startedAt);
  const ageMs =
    (lastHeartbeatAtMs !== null ? now - lastHeartbeatAtMs : null) ??
    (startedAtMs !== null ? now - startedAtMs : null);

  // Si el usuario ya esta en otro borrador, lo tratamos como cambio de contexto
  // y no como cierre inesperado del editor.
  if (currentSlug && markerSlug && currentSlug !== markerSlug) {
    clearEditorSessionMarker();
    pushEditorBreadcrumb("editor-session-exit-ack", {
      source: "slug-switch-navigation",
      markerSlug,
      currentSlug,
      ageMs: ageMs ?? null,
    });
    return null;
  }

  const effectiveSlug = markerSlug || currentSlug || null;

  if (ageMs !== null && ageMs > maxAgeMs) {
    clearEditorSessionMarker();
    return null;
  }

  const lastPageHideAtMs = parseDateMs(marker.lastPageHideAt);
  const pathNow = window.location?.pathname || "";
  const queryNow = window.location?.search || "";
  const isDashboardPath = pathNow.startsWith("/dashboard");
  const hasSlugInQuery = typeof queryNow === "string" && queryNow.includes("slug=");
  const isDashboardWithoutActiveSlug =
    !currentSlug && markerSlug && isDashboardPath && !hasSlugInQuery;

  // Si estamos en /dashboard sin slug activo y existe pagehide previo,
  // asumimos salida normal del editor (evita falsos positivos tardíos).
  if (isDashboardWithoutActiveSlug && lastPageHideAtMs !== null) {
    clearEditorSessionMarker();
    pushEditorBreadcrumb("editor-session-exit-ack", {
      source: "pagehide-navigation",
      slug: markerSlug,
      lastPageHideAt: marker.lastPageHideAt || null,
      ageMs: ageMs ?? null,
    });
    return null;
  }

  // Fallback: markers antiguos sin slug activo suelen ser residuos de sesión.
  if (isDashboardWithoutActiveSlug && ageMs !== null && ageMs > 1000 * 60 * 15) {
    clearEditorSessionMarker();
    pushEditorBreadcrumb("editor-session-exit-ack", {
      source: "stale-marker-no-slug",
      slug: markerSlug,
      ageMs,
    });
    return null;
  }

  clearEditorSessionMarker();
  return captureEditorIssue({
    source: "editor-session-interrupted",
    error: {
      name: "EditorSessionInterrupted",
      message: "El editor se cerro o recargo inesperadamente",
    },
    detail: {
      slug: effectiveSlug,
      marker,
      currentPath: window.location?.pathname || null,
      currentQuery: window.location?.search || null,
      currentSlug: currentSlug || null,
      ageMs: ageMs ?? null,
    },
    severity: "fatal",
  });
}
