const BREADCRUMBS_KEY = "editor_issue_breadcrumbs_v1";
const PENDING_ISSUE_KEY = "editor_issue_pending_v1";
const EDITOR_SESSION_KEY = "editor_issue_editor_session_v1";
const EDITOR_SESSION_EXIT_KEY = "editor_issue_editor_exit_v1";
const MAX_BREADCRUMBS = 60;
const MAX_MESSAGE_LEN = 600;
const MAX_STACK_LEN = 6000;
const MAX_DETAIL_LEN = 8000;
let activeWatchdogSessionId = null;

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

export function buildEditorIssueReport({
  source = "unknown",
  error = null,
  detail = {},
  severity = "error",
}) {
  const normalized = normalizeError(error);
  const runtime = getRuntimeSnapshot();
  const breadcrumbs = getEditorBreadcrumbs();
  const slug = detail?.slug || null;

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
  const report = buildEditorIssueReport(payload || {});
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

export function installGlobalEditorIssueHandlers() {
  if (typeof window === "undefined") return () => {};

  const onWindowError = (event) => {
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
    captureEditorIssue({
      source: "window.unhandledrejection",
      error: event?.reason || event,
      detail: {},
      severity: "fatal",
    });
  };

  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    window.removeEventListener("error", onWindowError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}

function readEditorSessionMarker() {
  const storage = getStorage("local");
  if (!storage) return null;
  return readJson(storage, EDITOR_SESSION_KEY, null);
}

function writeEditorSessionMarker(value) {
  const storage = getStorage("local");
  if (!storage) return;
  writeJson(storage, EDITOR_SESSION_KEY, value);
}

function clearEditorSessionMarker() {
  const storage = getStorage("local");
  if (!storage) return;
  try {
    storage.removeItem(EDITOR_SESSION_KEY);
  } catch {
    // noop
  }
}

function readEditorExitMarker() {
  const storage = getStorage("local");
  if (!storage) return null;
  return readJson(storage, EDITOR_SESSION_EXIT_KEY, null);
}

function writeEditorExitMarker(value) {
  const storage = getStorage("local");
  if (!storage) return;
  writeJson(storage, EDITOR_SESSION_EXIT_KEY, value);
}

function clearEditorExitMarker() {
  const storage = getStorage("local");
  if (!storage) return;
  try {
    storage.removeItem(EDITOR_SESSION_EXIT_KEY);
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
  const effectiveSlug = markerSlug || currentSlug || null;

  const now = Date.now();
  const lastHeartbeatAtMs = parseDateMs(marker.lastHeartbeatAt);
  const startedAtMs = parseDateMs(marker.startedAt);
  const ageMs =
    (lastHeartbeatAtMs !== null ? now - lastHeartbeatAtMs : null) ??
    (startedAtMs !== null ? now - startedAtMs : null);

  if (ageMs !== null && ageMs > maxAgeMs) {
    clearEditorSessionMarker();
    return null;
  }

  const lastPageHideAtMs = parseDateMs(marker.lastPageHideAt);
  const pathNow = window.location?.pathname || "";
  const queryNow = window.location?.search || "";
  const isDashboardPath = pathNow.startsWith("/dashboard");
  const hasSlugInQuery = typeof queryNow === "string" && queryNow.includes("slug=");
  const isRecentPageHide =
    lastPageHideAtMs !== null && now - lastPageHideAtMs <= 1000 * 45;

  if (!currentSlug && markerSlug && isDashboardPath && !hasSlugInQuery && isRecentPageHide) {
    clearEditorSessionMarker();
    pushEditorBreadcrumb("editor-session-exit-ack", {
      source: "pagehide-navigation",
      slug: markerSlug,
      lastPageHideAt: marker.lastPageHideAt || null,
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
