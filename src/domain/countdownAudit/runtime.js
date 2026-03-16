import { doc, getDoc } from "firebase/firestore";
import {
  buildCountdownAuditInsertPayload,
  getCountdownAuditFixture,
  listCountdownAuditFixtures,
} from "@/domain/countdownAudit/fixtures";
import {
  buildCountdownAuditSnapshot,
  COUNTDOWN_AUDIT_TRACE_ID_FIELD,
  shouldCaptureCountdownAudit,
} from "@/domain/countdownAudit/layoutSnapshot";
import { generateCountdownThumbnailDataUrl } from "@/domain/countdownPresets/renderModel";
import { db } from "@/firebase";

const ENABLE_STORAGE_KEY = "countdown-audit-enabled";
const TRACE_STORAGE_KEY = "countdown-audit-trace-v1";
const HTML_PAYLOAD_ATTR = "data-countdown-audit-payload";
const HTML_TRACE_ATTR = "data-countdown-audit-trace-id";
const MAX_STORED_SNAPSHOTS = 600;

const STAGE_ORDER = Object.freeze([
  "constructor-live-preview",
  "constructor-thumbnail",
  "constructor-list-card",
  "canvas-sidebar-preview",
  "canvas-insert-defaults",
  "canvas-konva-render",
  "canvas-resize-commit",
  "draft-persist-write",
  "template-dashboard-card",
  "template-persisted-document",
  "draft-created-from-template",
  "draft-load-document",
  "draft-thumbnail-card",
  "template-preview-desktop",
  "template-preview-mobile",
  "draft-preview-desktop",
  "draft-preview-mobile",
  "published-html",
]);

function getWindowObject() {
  return typeof window !== "undefined" ? window : null;
}

function isLocalAuditEnvironment() {
  const win = getWindowObject();
  if (win) {
    const host = String(win.location?.hostname || "").trim().toLowerCase();
    return host === "localhost" || host === "127.0.0.1";
  }
  return process.env.NODE_ENV === "development";
}

function syncAuditFlagFromQuery() {
  const win = getWindowObject();
  if (!win || !isLocalAuditEnvironment()) return;

  try {
    const search = new URLSearchParams(win.location?.search || "");
    const raw = String(search.get("countdownAudit") || "").trim().toLowerCase();
    if (!raw) return;
    if (raw === "1" || raw === "true" || raw === "on") {
      win.localStorage?.setItem(ENABLE_STORAGE_KEY, "1");
      return;
    }
    if (raw === "0" || raw === "false" || raw === "off") {
      win.localStorage?.removeItem(ENABLE_STORAGE_KEY);
    }
  } catch {
    // Non-blocking.
  }
}

export function isCountdownAuditEnabled() {
  const win = getWindowObject();
  if (!win || !isLocalAuditEnvironment()) return false;
  syncAuditFlagFromQuery();

  try {
    if (win.__COUNTDOWN_AUDIT_ENABLED === true) return true;
    return win.localStorage?.getItem(ENABLE_STORAGE_KEY) === "1";
  } catch {
    return win.__COUNTDOWN_AUDIT_ENABLED === true;
  }
}

function ensureRuntimeState() {
  const win = getWindowObject();
  if (!win) return { enabled: false, snapshots: [], lastSignatureByKey: {}, context: {} };

  if (!win.__COUNTDOWN_AUDIT_STATE || typeof win.__COUNTDOWN_AUDIT_STATE !== "object") {
    let persistedSnapshots = [];
    try {
      const raw = win.localStorage?.getItem(TRACE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      persistedSnapshots = Array.isArray(parsed) ? parsed : [];
    } catch {
      persistedSnapshots = [];
    }

    win.__COUNTDOWN_AUDIT_STATE = {
      enabled: isCountdownAuditEnabled(),
      snapshots: persistedSnapshots,
      lastSignatureByKey: {},
      context: {},
    };
  }

  return win.__COUNTDOWN_AUDIT_STATE;
}

function persistSnapshots(snapshots) {
  const win = getWindowObject();
  if (!win) return;
  try {
    win.localStorage?.setItem(TRACE_STORAGE_KEY, JSON.stringify(snapshots));
  } catch {
    // Non-blocking.
  }
}

function buildStageKey(snapshot) {
  return [
    snapshot.traceId || "",
    snapshot.stage || "",
    snapshot.renderer || "",
    snapshot.sourceDocument || "",
    snapshot.viewport || "",
  ].join("|");
}

function normalizeRawSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const safeSnapshot = { ...snapshot };
  safeSnapshot.timestamp = Number.isFinite(Number(snapshot.timestamp))
    ? Number(snapshot.timestamp)
    : Date.now();
  safeSnapshot.stage = String(snapshot.stage || "").trim() || null;
  safeSnapshot.traceId = String(snapshot.traceId || "").trim() || null;
  if (!safeSnapshot.stage || !safeSnapshot.traceId) return null;
  safeSnapshot.signature =
    String(snapshot.signature || "").trim() || JSON.stringify(safeSnapshot);
  return safeSnapshot;
}

function commitSnapshot(snapshot) {
  const state = ensureRuntimeState();
  const normalized = normalizeRawSnapshot(snapshot);
  if (!normalized) return null;

  const stageKey = buildStageKey(normalized);
  if (state.lastSignatureByKey[stageKey] === normalized.signature) {
    return normalized;
  }

  state.lastSignatureByKey[stageKey] = normalized.signature;
  state.snapshots = [...state.snapshots, normalized].slice(-MAX_STORED_SNAPSHOTS);
  persistSnapshots(state.snapshots);
  return normalized;
}

function resolveSectionMode(sectionId) {
  const win = getWindowObject();
  if (!win || !Array.isArray(win._seccionesOrdenadas)) return "";
  const section = win._seccionesOrdenadas.find((item) => item?.id === sectionId);
  return String(section?.altoModo || "").trim().toLowerCase();
}

function resolveSectionModeFromSections(secciones, sectionId) {
  const items = Array.isArray(secciones) ? secciones : [];
  const section = items.find((item) => item?.id === sectionId);
  return String(section?.altoModo || "").trim().toLowerCase();
}

function extractCountdownFromObjects(objetos, preferredTraceId = "") {
  const items = Array.isArray(objetos) ? objetos : [];
  const countdowns = items.filter((item) => item?.tipo === "countdown");
  if (!countdowns.length) return null;

  const safeTraceId = String(preferredTraceId || "").trim();
  if (safeTraceId) {
    const match = countdowns.find(
      (item) => String(item?.[COUNTDOWN_AUDIT_TRACE_ID_FIELD] || "").trim() === safeTraceId
    );
    if (match) return match;
  }

  const traceable = countdowns.find((item) => shouldCaptureCountdownAudit(item));
  return traceable || countdowns[0] || null;
}

function captureSnapshotFromCountdown(countdown, options = {}) {
  if (!isCountdownAuditEnabled()) return null;
  const snapshot = buildCountdownAuditSnapshot({
    countdown,
    altoModo: options.altoModo || resolveSectionMode(countdown?.seccionId),
    stage: options.stage,
    renderer: options.renderer,
    sourceDocument: options.sourceDocument,
    viewport: options.viewport,
    wrapperScale: options.wrapperScale,
    usesRasterThumbnail: options.usesRasterThumbnail,
    timestamp: options.timestamp,
    sourceLabel: options.sourceLabel,
    traceId: options.traceId,
  });

  return commitSnapshot(snapshot);
}

export function recordCountdownAuditSnapshot(options = {}) {
  return captureSnapshotFromCountdown(options.countdown, options);
}

export function recordCountdownAuditRawSnapshot(snapshot) {
  if (!isCountdownAuditEnabled()) return null;
  return commitSnapshot(snapshot);
}

export function clearCountdownAuditTrace() {
  const state = ensureRuntimeState();
  state.snapshots = [];
  state.lastSignatureByKey = {};
  persistSnapshots([]);
}

export function getCountdownAuditTrace() {
  const state = ensureRuntimeState();
  return Array.isArray(state.snapshots) ? [...state.snapshots] : [];
}

function compareLayout(left, right) {
  return JSON.stringify({
    chipH: left?.chipH,
    baseChipW: left?.baseChipW,
    naturalW: left?.naturalW,
    naturalH: left?.naturalH,
    containerW: left?.containerW,
    containerH: left?.containerH,
    startX: left?.startX,
    startY: left?.startY,
    unitLayouts: left?.unitLayouts,
    separatorLayouts: left?.separatorLayouts,
  }) ===
    JSON.stringify({
      chipH: right?.chipH,
      baseChipW: right?.baseChipW,
      naturalW: right?.naturalW,
      naturalH: right?.naturalH,
      containerW: right?.containerW,
      containerH: right?.containerH,
      startX: right?.startX,
      startY: right?.startY,
      unitLayouts: right?.unitLayouts,
      separatorLayouts: right?.separatorLayouts,
    });
}

function compareGeometry(left, right) {
  return JSON.stringify({
    x: left?.x,
    y: left?.y,
    yNorm: left?.yNorm,
    width: left?.width,
    height: left?.height,
    scaleX: left?.scaleX,
    scaleY: left?.scaleY,
    rotation: left?.rotation,
    seccionId: left?.seccionId,
    altoModo: left?.altoModo,
  }) ===
    JSON.stringify({
      x: right?.x,
      y: right?.y,
      yNorm: right?.yNorm,
      width: right?.width,
      height: right?.height,
      scaleX: right?.scaleX,
      scaleY: right?.scaleY,
      rotation: right?.rotation,
      seccionId: right?.seccionId,
      altoModo: right?.altoModo,
    });
}

function resolveDeltaCause(previous, next) {
  if (!previous || !next) return "sin-base";

  const sameGeometry = compareGeometry(previous, next);
  const sameLayout = compareLayout(previous, next);
  const wrapperChanged =
    previous?.wrapperScale !== next?.wrapperScale ||
    previous?.viewport !== next?.viewport;

  if (!sameGeometry) return "persistencia/copia";
  if (!sameLayout) return "divergencia-de-renderer";
  if (next?.usesRasterThumbnail === true || previous?.usesRasterThumbnail === true) {
    return "captura/cache";
  }
  if (wrapperChanged) return "viewport/mockup";
  return "sin-delta";
}

function getStageRank(stage) {
  const index = STAGE_ORDER.indexOf(stage);
  return index >= 0 ? index : STAGE_ORDER.length + 1;
}

export function buildCountdownAuditReport() {
  const trace = getCountdownAuditTrace();
  const byTraceId = new Map();

  trace.forEach((snapshot) => {
    const key = String(snapshot?.traceId || "").trim();
    if (!key) return;
    const bucket = byTraceId.get(key) || [];
    bucket.push(snapshot);
    byTraceId.set(key, bucket);
  });

  const fixtures = Array.from(byTraceId.entries()).map(([traceId, snapshots]) => {
    const sorted = [...snapshots].sort((left, right) => {
      const stageDelta = getStageRank(left.stage) - getStageRank(right.stage);
      if (stageDelta !== 0) return stageDelta;
      return Number(left.timestamp || 0) - Number(right.timestamp || 0);
    });

    const latestByStage = new Map();
    sorted.forEach((snapshot) => {
      latestByStage.set(snapshot.stage, snapshot);
    });

    const matrix = Array.from(latestByStage.values()).sort((left, right) => {
      const stageDelta = getStageRank(left.stage) - getStageRank(right.stage);
      if (stageDelta !== 0) return stageDelta;
      return Number(left.timestamp || 0) - Number(right.timestamp || 0);
    });

    const comparisons = [];
    for (let index = 1; index < matrix.length; index += 1) {
      const previous = matrix[index - 1];
      const current = matrix[index];
      comparisons.push({
        fromStage: previous.stage,
        toStage: current.stage,
        geometryChanged: !compareGeometry(previous, current),
        layoutChanged: !compareLayout(previous, current),
        wrapperChanged:
          previous?.wrapperScale !== current?.wrapperScale ||
          previous?.viewport !== current?.viewport,
        cause: resolveDeltaCause(previous, current),
      });
    }

    return {
      traceId,
      fixture: matrix[0]?.fixture || null,
      label: matrix[0]?.label || traceId,
      matrix,
      comparisons,
      backlog: comparisons.filter((item) => item.cause !== "sin-delta"),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    stages: [...STAGE_ORDER],
    fixtures,
  };
}

export function printCountdownAuditReport() {
  const report = buildCountdownAuditReport();
  const win = getWindowObject();
  if (!win?.console) return report;

  report.fixtures.forEach((fixture) => {
    console.groupCollapsed(`[countdown-audit] ${fixture.label} (${fixture.traceId})`);
    console.table(
      fixture.matrix.map((row) => ({
        stage: row.stage,
        renderer: row.renderer,
        sourceDocument: row.sourceDocument,
        viewport: row.viewport,
        x: row.x,
        y: row.y,
        yNorm: row.yNorm,
        width: row.width,
        height: row.height,
        chipH: row.chipH,
        baseChipW: row.baseChipW,
        containerW: row.containerW,
        containerH: row.containerH,
        wrapperScale: row.wrapperScale,
        raster: row.usesRasterThumbnail,
      }))
    );
    if (fixture.backlog.length > 0) {
      console.table(fixture.backlog);
    }
    console.groupEnd();
  });

  return report;
}

function readAuditPayloadsFromDocument(targetDocument) {
  if (!targetDocument?.querySelectorAll) return [];
  return Array.from(targetDocument.querySelectorAll(`[${HTML_PAYLOAD_ATTR}]`))
    .map((node) => {
      const traceId = String(node.getAttribute(HTML_TRACE_ATTR) || "").trim();
      const payloadText = String(node.getAttribute(HTML_PAYLOAD_ATTR) || "").trim();
      if (!traceId || !payloadText) return null;
      try {
        const payload = JSON.parse(payloadText);
        return {
          traceId,
          payload,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function captureCountdownAuditFromIframe(iframe, options = {}) {
  if (!isCountdownAuditEnabled()) return [];
  const targetDocument =
    iframe?.contentDocument || iframe?.contentWindow?.document || null;
  if (!targetDocument) return [];

  return readAuditPayloadsFromDocument(targetDocument).map(({ traceId, payload }) =>
    recordCountdownAuditRawSnapshot({
      ...payload,
      traceId,
      stage: options.stage,
      renderer: options.renderer || "dom-generated",
      sourceDocument: options.sourceDocument || payload?.sourceDocument || "iframe-srcdoc",
      viewport: options.viewport || payload?.viewport || null,
      wrapperScale:
        Number.isFinite(Number(options.wrapperScale)) ? Number(options.wrapperScale) : 1,
      usesRasterThumbnail: options.usesRasterThumbnail === true,
      timestamp: Date.now(),
      signature: JSON.stringify({
        ...payload,
        stage: options.stage,
        renderer: options.renderer || "dom-generated",
        sourceDocument: options.sourceDocument || payload?.sourceDocument || "iframe-srcdoc",
        viewport: options.viewport || payload?.viewport || null,
        wrapperScale:
          Number.isFinite(Number(options.wrapperScale)) ? Number(options.wrapperScale) : 1,
        usesRasterThumbnail: options.usesRasterThumbnail === true,
      }),
    })
  );
}

export function captureCountdownAuditFromHtmlString(html, options = {}) {
  if (!isCountdownAuditEnabled()) return [];
  if (typeof DOMParser !== "function") return [];
  const parser = new DOMParser();
  const parsed = parser.parseFromString(String(html || ""), "text/html");
  return readAuditPayloadsFromDocument(parsed).map(({ traceId, payload }) =>
    recordCountdownAuditRawSnapshot({
      ...payload,
      traceId,
      stage: options.stage,
      renderer: options.renderer || "dom-generated",
      sourceDocument: options.sourceDocument || payload?.sourceDocument || "html-string",
      viewport: options.viewport || payload?.viewport || null,
      wrapperScale:
        Number.isFinite(Number(options.wrapperScale)) ? Number(options.wrapperScale) : 1,
      usesRasterThumbnail: options.usesRasterThumbnail === true,
      timestamp: Date.now(),
      signature: JSON.stringify({
        ...payload,
        stage: options.stage,
        renderer: options.renderer || "dom-generated",
        sourceDocument: options.sourceDocument || payload?.sourceDocument || "html-string",
        viewport: options.viewport || payload?.viewport || null,
        wrapperScale:
          Number.isFinite(Number(options.wrapperScale)) ? Number(options.wrapperScale) : 1,
        usesRasterThumbnail: options.usesRasterThumbnail === true,
      }),
    })
  );
}

async function captureDocumentSnapshot(collectionName, id, stage, sourceDocument) {
  if (!isCountdownAuditEnabled()) return null;
  const safeId = String(id || "").trim();
  if (!safeId) return null;

  const snapshot = await getDoc(doc(db, collectionName, safeId));
  if (!snapshot.exists()) return null;
  const data = snapshot.data() || {};
  const countdown = extractCountdownFromObjects(data?.objetos);
  if (!countdown) return null;

  return captureSnapshotFromCountdown(countdown, {
    stage,
    renderer: "persisted-document",
    sourceDocument,
    sourceLabel: safeId,
    altoModo:
      resolveSectionModeFromSections(data?.secciones, countdown?.seccionId) ||
      resolveSectionMode(countdown?.seccionId),
  });
}

export async function captureCountdownAuditTemplateDocument(
  templateId,
  stage = "template-persisted-document"
) {
  if (!isCountdownAuditEnabled()) return null;
  const safeId = String(templateId || "").trim();
  if (!safeId) return null;

  try {
    const { getTemplateEditorDocument } = await import("@/domain/templates/adminService");
    const result = await getTemplateEditorDocument({
      templateId: safeId,
    });
    const data =
      result?.editorDocument && typeof result.editorDocument === "object"
        ? result.editorDocument
        : null;
    const countdown = extractCountdownFromObjects(data?.objetos);

    if (countdown) {
      return captureSnapshotFromCountdown(countdown, {
        stage,
        renderer: "persisted-document",
        sourceDocument: "template-editor-document",
        sourceLabel: safeId,
        altoModo:
          resolveSectionModeFromSections(data?.secciones, countdown?.seccionId) ||
          resolveSectionMode(countdown?.seccionId),
      });
    }
  } catch {
    // Fallback to the public template document below.
  }

  return captureDocumentSnapshot("plantillas", safeId, stage, "template-document");
}

export async function captureCountdownAuditDraftDocument(draftSlug, stage = "draft-load-document") {
  return captureDocumentSnapshot("borradores", draftSlug, stage, "draft-document");
}

export async function captureCountdownAuditPublicationHtml(url, stage = "published-html") {
  if (!isCountdownAuditEnabled()) return [];
  const safeUrl = String(url || "").trim();
  if (!safeUrl) return [];
  const response = await fetch(safeUrl, { credentials: "same-origin" });
  if (!response.ok) return [];
  const html = await response.text();
  return captureCountdownAuditFromHtmlString(html, {
    stage,
    renderer: "dom-generated",
    sourceDocument: "published-html",
    viewport: "public",
    wrapperScale: 1,
  });
}

function getCurrentCanvasCountdown(traceId = "") {
  const win = getWindowObject();
  if (!win) return null;
  return extractCountdownFromObjects(win._objetosActuales, traceId);
}

export function captureCurrentCanvasCountdown(stage = "canvas-konva-render", options = {}) {
  const countdown = getCurrentCanvasCountdown(options.traceId);
  if (!countdown) return null;
  return captureSnapshotFromCountdown(countdown, {
    stage,
    renderer: options.renderer || "konva-render",
    sourceDocument: options.sourceDocument || "window-editor-state",
    viewport: options.viewport || "editor",
    wrapperScale:
      Number.isFinite(Number(options.wrapperScale)) ? Number(options.wrapperScale) : 1,
    usesRasterThumbnail: options.usesRasterThumbnail === true,
    sourceLabel: options.sourceLabel || null,
    altoModo: resolveSectionMode(countdown?.seccionId),
  });
}

async function recordSyntheticPresetStages(fixture) {
  if (!fixture) return [];

  const recorded = [];
  recorded.push(
    captureSnapshotFromCountdown(fixture.presetProps, {
      stage: "constructor-live-preview",
      renderer: "dom-generated",
      sourceDocument: "synthetic-preset-builder",
      viewport: "builder",
      wrapperScale: 1,
      sourceLabel: fixture.label,
    })
  );

  try {
    await generateCountdownThumbnailDataUrl({
      config: fixture.config,
      svgText: fixture.svgText,
      svgColorMode: fixture.svgColorMode,
      frameColor: fixture.frameColor,
      targetISO: fixture.targetISO,
      size: 320,
    });
  } catch {
    // Non-blocking. The trace still reflects the thumbnail stage intent.
  }

  recorded.push(
    captureSnapshotFromCountdown(fixture.presetProps, {
      stage: "constructor-thumbnail",
      renderer: "raster-thumbnail",
      sourceDocument: "synthetic-preset-thumbnail",
      viewport: "builder",
      wrapperScale: 1,
      usesRasterThumbnail: true,
      sourceLabel: fixture.label,
    })
  );
  recorded.push(
    captureSnapshotFromCountdown(fixture.presetProps, {
      stage: "constructor-list-card",
      renderer: "raster-thumbnail",
      sourceDocument: "synthetic-preset-list",
      viewport: "builder",
      wrapperScale: 1,
      usesRasterThumbnail: true,
      sourceLabel: fixture.label,
    })
  );
  recorded.push(
    captureSnapshotFromCountdown(fixture.presetProps, {
      stage: "canvas-sidebar-preview",
      renderer: "raster-thumbnail",
      sourceDocument: "synthetic-sidebar-card",
      viewport: "sidebar",
      wrapperScale: 1,
      usesRasterThumbnail: true,
      sourceLabel: fixture.label,
    })
  );

  return recorded.filter(Boolean);
}

function moveFixtureToScreenSectionIfNeeded(fixture, payloadId) {
  const win = getWindowObject();
  if (!win || fixture?.kind !== "v2-screen") return;

  const sections = Array.isArray(win._seccionesOrdenadas) ? win._seccionesOrdenadas : [];
  const targetSection = sections.find(
    (section) => String(section?.altoModo || "").trim().toLowerCase() === "pantalla"
  );
  if (!targetSection) return;

  win.setTimeout(() => {
    win.dispatchEvent(
      new CustomEvent("actualizar-elemento", {
        detail: {
          id: payloadId,
          cambios: {
            seccionId: targetSection.id,
            x: 170,
            y: 120,
            yNorm: 0.24,
          },
        },
      })
    );
  }, 120);
}

export async function runSyntheticCountdownAuditFixture(kind, overrides = {}) {
  if (!isCountdownAuditEnabled()) {
    throw new Error("Countdown audit deshabilitado. Usa ?countdownAudit=1 en localhost.");
  }

  const fixture = getCountdownAuditFixture(kind);
  if (!fixture) {
    throw new Error(`Fixture countdown audit no encontrado: ${kind}`);
  }

  await recordSyntheticPresetStages(fixture);
  const payload = buildCountdownAuditInsertPayload(kind, overrides);
  if (!payload) {
    throw new Error(`No se pudo construir el payload del fixture ${kind}.`);
  }

  const win = getWindowObject();
  if (!win) {
    throw new Error("No hay window disponible para insertar el fixture.");
  }

  win.dispatchEvent(
    new CustomEvent("insertar-elemento", {
      detail: payload,
    })
  );

  moveFixtureToScreenSectionIfNeeded(fixture, payload.id);

  return {
    fixture,
    payload,
  };
}

export function registerCountdownAuditContext(patch = {}) {
  const state = ensureRuntimeState();
  state.context = {
    ...(state.context || {}),
    ...patch,
  };
}

function attachWindowApi() {
  const win = getWindowObject();
  if (!win) return;

  win.__COUNTDOWN_AUDIT = {
    enable() {
      win.localStorage?.setItem(ENABLE_STORAGE_KEY, "1");
      win.__COUNTDOWN_AUDIT_ENABLED = true;
      ensureRuntimeState().enabled = true;
      return true;
    },
    disable() {
      win.localStorage?.removeItem(ENABLE_STORAGE_KEY);
      delete win.__COUNTDOWN_AUDIT_ENABLED;
      ensureRuntimeState().enabled = false;
      return false;
    },
    clearTrace: clearCountdownAuditTrace,
    getTrace: getCountdownAuditTrace,
    buildReport: buildCountdownAuditReport,
    printReport: printCountdownAuditReport,
    listFixtures: listCountdownAuditFixtures,
    getFixture: getCountdownAuditFixture,
    runFixture: runSyntheticCountdownAuditFixture,
    captureCurrentCanvas: captureCurrentCanvasCountdown,
    captureDraftDocument: captureCountdownAuditDraftDocument,
    captureTemplateDocument: captureCountdownAuditTemplateDocument,
    capturePublicationHtml: captureCountdownAuditPublicationHtml,
    captureFromHtmlString: captureCountdownAuditFromHtmlString,
  };
}

export function initializeCountdownAuditRuntime() {
  if (!isLocalAuditEnvironment()) return;
  ensureRuntimeState();
  attachWindowApi();
}
