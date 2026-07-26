const PREVIEW_TIMING_QUERY_PARAM = "previewTiming";
const PREVIEW_TIMING_PREFIX = "[PREVIEW:TIMING]";
const MAX_FINISHED_SESSION_IDS = 40;

const activeSessions = new Map();
const finishedSessionIds = [];
let fallbackSessionSequence = 0;

function normalizeText(value) {
  return String(value || "").trim();
}

function roundMs(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.round(Math.max(0, numericValue) * 10) / 10;
}

function readPerformanceNow() {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }
  return 0;
}

function resolvePerformanceApi() {
  if (typeof performance === "undefined") return null;
  return performance;
}

function normalizeSessionId(value) {
  return normalizeText(value).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 96);
}

function createSessionId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `pv-${crypto.randomUUID().slice(0, 12)}`;
    }
  } catch {
    // A monotonic fallback is sufficient for local diagnostic grouping.
  }

  fallbackSessionSequence += 1;
  return `pv-${fallbackSessionSequence}`;
}

function rememberFinishedSession(sessionId) {
  if (!sessionId || finishedSessionIds.includes(sessionId)) return;
  finishedSessionIds.push(sessionId);
  if (finishedSessionIds.length > MAX_FINISHED_SESSION_IDS) {
    finishedSessionIds.splice(
      0,
      finishedSessionIds.length - MAX_FINISHED_SESSION_IDS
    );
  }
}

function markPerformanceEntry(session, stage, at) {
  const performanceApi = resolvePerformanceApi();
  if (
    !performanceApi ||
    typeof performanceApi.mark !== "function" ||
    typeof performanceApi.measure !== "function"
  ) {
    return;
  }

  const safeStage = normalizeText(stage)
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 80);
  const markName = `${PREVIEW_TIMING_PREFIX}:${session.id}:${safeStage}:${session.records.length}`;
  const measureName = `${markName}:desde-inicio`;

  try {
    performanceApi.mark(markName, {
      startTime: at,
      detail: {
        sessionId: session.id,
        stage: safeStage,
      },
    });
    performanceApi.measure(measureName, session.startMarkName, markName);
    session.performanceEntries.push({
      markName,
      measureName,
    });
  } catch {
    // Performance marks are supplementary; logging must remain available.
  }
}

function cleanupPerformanceEntries(session) {
  const performanceApi = resolvePerformanceApi();
  if (!performanceApi) return;

  session.performanceEntries.forEach(({ markName, measureName }) => {
    try {
      performanceApi.clearMarks?.(markName);
      performanceApi.clearMeasures?.(measureName);
    } catch {
      // noop
    }
  });

  try {
    performanceApi.clearMarks?.(session.startMarkName);
  } catch {
    // noop
  }
}

function formatLogLine(session, label, durationMs, accumulatedMs) {
  const duration = `+${roundMs(durationMs)} ms`.padEnd(13, " ");
  const total = `total=${roundMs(accumulatedMs)} ms`;
  return `${PREVIEW_TIMING_PREFIX}[session=${session.id}] ${label.padEnd(
    36,
    " "
  )} ${duration} ${total}`;
}

function buildSafeMetadata(session, detail) {
  return {
    session: session.id,
    tipoVistaPrevia: session.previewType,
    objetivo: session.targetId,
    viewport: normalizeText(detail.viewport) || "shared",
    superficie: normalizeText(detail.surface) || "shared",
    fuente: normalizeText(detail.source) || "frontend",
    estado: normalizeText(detail.status) || "ok",
    ...(detail.reason ? { motivo: normalizeText(detail.reason) } : {}),
    ...(detail.htmlBytes !== undefined
      ? { htmlBytes: Math.max(0, Number(detail.htmlBytes) || 0) }
      : {}),
    ...(detail.backendAccumulatedMs !== undefined
      ? {
          acumuladoBackendMs: roundMs(detail.backendAccumulatedMs),
        }
      : {}),
  };
}

function resolveSession(sessionId) {
  const safeSessionId = normalizeSessionId(sessionId);
  if (!safeSessionId || finishedSessionIds.includes(safeSessionId)) return null;
  return activeSessions.get(safeSessionId) || null;
}

export function isPreviewTimingEnabled(search = null) {
  let queryString = typeof search === "string" ? search : null;

  if (queryString === null) {
    if (typeof window === "undefined") return false;
    queryString = window.location?.search || "";
  }

  try {
    const query = new URLSearchParams(queryString);
    return query.get(PREVIEW_TIMING_QUERY_PARAM) === "1";
  } catch {
    return false;
  }
}

export function startPreviewTimingSession({
  sessionId = "",
  previewType = "draft-authoritative",
  targetId = "",
  attempt = 1,
} = {}) {
  if (!isPreviewTimingEnabled()) return "";

  const id = normalizeSessionId(sessionId) || createSessionId();
  const startedAt = readPerformanceNow();
  const startMarkName = `${PREVIEW_TIMING_PREFIX}:${id}:inicio`;
  const session = {
    id,
    previewType: normalizeText(previewType) || "unknown",
    targetId: normalizeText(targetId).slice(0, 120) || "unknown",
    startedAt,
    startMarkName,
    records: [],
    recordKeys: new Set(),
    expectedSurfaces: new Set(),
    readySurfaces: new Set(),
    performanceEntries: [],
  };

  activeSessions.set(id, session);

  try {
    resolvePerformanceApi()?.mark?.(startMarkName, {
      startTime: startedAt,
      detail: {
        sessionId: id,
      },
    });
  } catch {
    // noop
  }

  recordPreviewTimingStage(id, {
    stage: "preview-open-start",
    label:
      Number(attempt) > 1
        ? "Inicio apertura (reintento)"
        : "Inicio apertura",
    durationMs: 0,
    source: "frontend",
    recordKey: "preview-open-start",
    detail: {
      attempt,
    },
  });

  return id;
}

export function recordPreviewTimingStage(
  sessionId,
  {
    stage,
    label,
    durationMs = 0,
    startedAt = null,
    completedAt = null,
    source = "frontend",
    viewport = "",
    surface = "",
    status = "ok",
    reason = "",
    htmlBytes,
    backendAccumulatedMs,
    recordKey = "",
    detail = null,
  } = {}
) {
  const session = resolveSession(sessionId);
  if (!session) return false;

  const safeStage = normalizeText(stage) || "unknown";
  const safeSurface = normalizeText(surface);
  const dedupeKey =
    normalizeText(recordKey) ||
    `${normalizeText(source) || "frontend"}:${safeStage}:${
      safeSurface || "shared"
    }`;
  if (session.recordKeys.has(dedupeKey)) return false;

  const hasCompletedAt =
    typeof completedAt === "number" && Number.isFinite(completedAt);
  const hasStartedAt =
    typeof startedAt === "number" && Number.isFinite(startedAt);
  const at = hasCompletedAt
    ? completedAt
    : readPerformanceNow();
  const resolvedDurationMs = hasStartedAt
    ? at - startedAt
    : Number(durationMs) || 0;
  const accumulatedMs = Math.max(0, at - session.startedAt);
  const safeLabel = normalizeText(label) || safeStage;
  const metadata = buildSafeMetadata(session, {
    viewport,
    surface,
    source,
    status,
    reason,
    htmlBytes,
    backendAccumulatedMs,
  });
  const row = {
    etapa: safeLabel,
    duracionMs: roundMs(resolvedDurationMs),
    acumuladoMs: roundMs(accumulatedMs),
    fuente: metadata.fuente,
    viewport: metadata.viewport,
    superficie: metadata.superficie,
    estado: metadata.estado,
  };

  session.recordKeys.add(dedupeKey);
  session.records.push({
    stage: safeStage,
    row,
  });
  markPerformanceEntry(session, safeStage, at);

  console.info(
    formatLogLine(session, safeLabel, resolvedDurationMs, accumulatedMs),
    metadata,
    detail && typeof detail === "object" ? detail : undefined
  );
  return true;
}

export function setPreviewTimingExpectedSurfaces(sessionId, surfaces = []) {
  const session = resolveSession(sessionId);
  if (!session) return false;

  session.expectedSurfaces = new Set(
    (Array.isArray(surfaces) ? surfaces : [])
      .map((surface) => normalizeText(surface))
      .filter(Boolean)
  );
  return true;
}

export function markPreviewTimingSurfaceReady(
  sessionId,
  {
    surface,
    viewport = "",
    reason = "",
  } = {}
) {
  const session = resolveSession(sessionId);
  const safeSurface = normalizeText(surface);
  if (!session || !safeSurface) return false;

  session.readySurfaces.add(safeSurface);
  recordPreviewTimingStage(sessionId, {
    stage: "preview-interactive",
    label: "Invitacion visible e interactiva",
    source: "iframe",
    viewport,
    surface: safeSurface,
    reason,
    recordKey: `preview-interactive:${safeSurface}`,
  });

  const expected = [...session.expectedSurfaces];
  if (
    expected.length > 0 &&
    expected.every((expectedSurface) =>
      session.readySurfaces.has(expectedSurface)
    )
  ) {
    finishPreviewTimingSession(sessionId, {
      status: "success",
      label: "Vista previa lista",
    });
  }

  return true;
}

export function finishPreviewTimingSession(
  sessionId,
  {
    status = "success",
    label = "Vista previa finalizada",
    reason = "",
  } = {}
) {
  const session = resolveSession(sessionId);
  if (!session) return false;

  recordPreviewTimingStage(sessionId, {
    stage: "preview-session-finished",
    label,
    source: "frontend",
    status,
    reason,
    recordKey: "preview-session-finished",
  });

  const summaryRows = session.records.map(({ row }) => ({ ...row }));
  console.table(summaryRows);

  activeSessions.delete(session.id);
  rememberFinishedSession(session.id);
  cleanupPerformanceEntries(session);
  session.recordKeys.clear();
  session.expectedSurfaces.clear();
  session.readySurfaces.clear();
  session.records.length = 0;
  session.performanceEntries.length = 0;
  return true;
}

export function cancelPreviewTimingSession(
  sessionId,
  {
    reason = "closed",
    status = "cancelled",
    label = "Sesion cancelada",
  } = {}
) {
  return finishPreviewTimingSession(sessionId, {
    status,
    label,
    reason,
  });
}

export function isPreviewTimingSessionActive(sessionId) {
  return Boolean(resolveSession(sessionId));
}
