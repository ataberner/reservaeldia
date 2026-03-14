import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, query, where, doc, getDoc, getDocs, limit } from 'firebase/firestore';
import { db, functions as cloudFunctions } from '../firebase';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { useRouter } from "next/router";
import DashboardLayout from '../components/DashboardLayout';
import DashboardHomeView from "@/components/dashboard/home/DashboardHomeView";
import DashboardTrashSection from "@/components/DashboardTrashSection";
import ModalVistaPrevia from '@/components/ModalVistaPrevia';
import TemplatePreviewModal from "@/components/TemplatePreviewModal";
import PublicationCheckoutModal from "@/components/payments/PublicationCheckoutModal";
import PublicadasGrid from "@/components/PublicadasGrid";
import { httpsCallable } from "firebase/functions";
import dynamic from "next/dynamic";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import SiteManagementBoard from "@/components/admin/SiteManagementBoard";
import ProfileCompletionModal from "@/lib/components/ProfileCompletionModal";
import ChunkErrorBoundary from "@/components/ChunkErrorBoundary";
import EditorIssueBanner from "@/components/editor/diagnostics/EditorIssueBanner";
import EditorStartupLoader from "@/components/editor/EditorStartupLoader";
import { normalizePublicSlug, parseSlugFromPublicUrl } from "@/lib/publicSlug";
import { getPublicationStatus } from "@/domain/publications/state";
import { isDraftTrashed } from "@/domain/drafts/state";
import { requestEditorDraftFlush } from "@/domain/drafts/flushGate";
import { normalizeDraftRenderState } from "@/domain/drafts/sourceOfTruth";
import { normalizeRsvpConfig } from "@/domain/rsvp/config";
import { normalizeGiftConfig } from "@/domain/gifts/config";
import {
  createDraftFromTemplateWithInput,
  getTemplateById,
} from "@/domain/templates/service";
import { getTemplateEditorDocument } from "@/domain/templates/adminService";
import { normalizeTemplateMetadata } from "@/domain/templates/metadata";
import {
  generateTemplatePreviewHtml,
  resolveTemplatePreviewSource,
} from "@/domain/templates/preview";
import { buildTemplateFormState } from "@/domain/templates/formModel";
import { GOOGLE_FONTS } from "@/config/fonts";
import {
  consumeInterruptedEditorSession,
  clearPendingEditorIssue,
  installGlobalEditorIssueHandlers,
  pushEditorBreadcrumb,
  readPendingEditorIssue,
  startEditorSessionWatchdog,
} from "@/lib/monitoring/editorIssueReporter";
const CanvasEditor = dynamic(() => import("@/components/CanvasEditor"), {
  ssr: false, // disable server-side rendering for editor
  loading: () => <p className="p-4 text-sm text-gray-500">Cargando editor...</p>,
});
const DEFAULT_TIPO_INVITACION = "boda";
const IMAGE_PRELOAD_TIMEOUT_MS = 15000;
const IMAGE_PRELOAD_BATCH_SIZE = 6;
const FONT_PRELOAD_TIMEOUT_MS = 40000;
const TOTAL_PRELOAD_TIMEOUT_MS = 90000;
const SELECTOR_FONT_WARMUP_TIMEOUT_MS = 35000;
const MIN_EDITOR_STARTUP_LOADER_MS = 1200;
const HOME_DASHBOARD_LOADER_MAX_MS = 3200;
const HOME_DASHBOARD_LOADER_EXIT_MS = 320;
const EDITOR_STARTUP_LOADER_EXIT_MS = 520;
const IMAGE_SOURCE_KEYS = new Set([
  "src",
  "url",
  "mediaurl",
  "fondoimagen",
  "portada",
  "thumbnailurl",
]);
const INITIAL_EDITOR_PRELOAD_STATE = Object.freeze({
  slug: null,
  status: "idle",
  message: "",
  fontsTotal: 0,
  fontsLoaded: 0,
  fontsFailed: 0,
  imagesTotal: 0,
  imagesLoaded: 0,
  imagesFailed: 0,
});
const TYPOGRAPHY_SELECTOR_FONT_VALUES = Array.from(
  new Set(
    (GOOGLE_FONTS || [])
      .map((font) =>
        typeof font?.valor === "string" ? font.valor.trim() : ""
      )
      .filter(Boolean)
  )
);
const INITIAL_EDITOR_RUNTIME_STATE = Object.freeze({
  slug: null,
  status: "idle",
  draftLoaded: false,
  totalBackgrounds: 0,
  loadedBackgrounds: 0,
  failedBackgrounds: 0,
  pendingBackgrounds: 0,
});
const TEMPLATE_PREVIEW_STATUS_IDLE = Object.freeze({
  status: "idle",
  error: "",
});
const TEMPLATE_FORM_STATE_INITIAL = Object.freeze({
  rawValues: {},
  touchedKeys: [],
});

function createEditorPreloadState(overrides = {}) {
  return {
    ...INITIAL_EDITOR_PRELOAD_STATE,
    ...overrides,
  };
}

function createEditorRuntimeState(overrides = {}) {
  return {
    ...INITIAL_EDITOR_RUNTIME_STATE,
    ...overrides,
  };
}

function createTemplatePreviewStatus(overrides = {}) {
  return {
    ...TEMPLATE_PREVIEW_STATUS_IDLE,
    ...overrides,
  };
}

function withTimeout(promise, timeoutMs, timeoutResult) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({
        timedOut: true,
        value: timeoutResult,
      });
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          timedOut: false,
          value,
        });
      })
      .catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          timedOut: false,
          error,
        });
      });
  });
}

function logEditorPreload(step, payload = {}) {
  try {
    console.log("[editor-preload]", {
      step,
      ...payload,
    });
  } catch {}
}

function splitDisplayName(displayName) {
  const clean = typeof displayName === "string"
    ? displayName.trim().replace(/\s+/g, " ")
    : "";

  if (!clean) return { nombre: "", apellido: "" };

  const parts = clean.split(" ");
  if (parts.length === 1) return { nombre: parts[0], apellido: "" };

  return {
    nombre: parts[0],
    apellido: parts.slice(1).join(" "),
  };
}

function getErrorMessage(error, fallback) {
  const message =
    error?.message ||
    error?.details?.message ||
    error?.details ||
    fallback;

  return typeof message === "string" ? message : fallback;
}

function trimText(value, max = 1000) {
  if (value === null || typeof value === "undefined") return null;
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function getFirstQueryValue(value) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return null;
  const firstString = value.find((item) => typeof item === "string");
  return typeof firstString === "string" ? firstString : null;
}

function decodeURIComponentSafe(value) {
  if (typeof value !== "string") return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sanitizeDraftSlug(rawSlug) {
  if (typeof rawSlug !== "string") return null;
  const decoded = decodeURIComponentSafe(rawSlug).trim();
  if (!decoded) return null;
  const slug = decoded.split("?")[0].trim();
  return slug || null;
}

function sanitizeUidValue(rawUid) {
  if (typeof rawUid !== "string") return "";
  return rawUid.trim();
}

function isTruthyQueryFlag(value) {
  const rawValue = getFirstQueryValue(value);
  const normalized = String(rawValue || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function toDateFromFirestoreValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    try {
      const parsed = value.toDate();
      return parsed instanceof Date && Number.isFinite(parsed.getTime()) ? parsed : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    const parsed = new Date(value.seconds * 1000);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function isPublicacionActiva(data) {
  if (!data || typeof data !== "object") return false;
  const status = getPublicationStatus(data, Date.now());
  if (status.isFinalized) return false;
  if (status.isTrashed) return false;
  return status.isActive || status.isPaused;
}

function isPermissionDeniedFirestoreError(error) {
  const code = String(error?.code || "").toLowerCase();
  return code === "permission-denied" || code.includes("permission-denied");
}

function getDraftCandidatesFromPublication(data) {
  const candidates = [
    data?.borradorSlug,
    data?.borradorId,
    data?.draftSlug,
    data?.slugOriginal,
  ]
    .map((value) => sanitizeDraftSlug(typeof value === "string" ? value : ""))
    .filter(Boolean);

  return Array.from(new Set(candidates));
}

async function resolveOwnedDraftSlugForEditor({ slug, uid }) {
  const normalizedSlug = sanitizeDraftSlug(slug);
  if (!normalizedSlug || !uid) return normalizedSlug;

  let directDraftPermissionDenied = false;
  try {
    const directDraftSnap = await getDoc(doc(db, "borradores", normalizedSlug));
    if (directDraftSnap.exists()) {
      const directDraftData = directDraftSnap.data() || {};
      const ownerUid = String(directDraftData?.userId || "").trim();
      if (ownerUid !== uid) return null;
      return isDraftTrashed(directDraftData) ? null : normalizedSlug;
    }
  } catch (error) {
    if (isPermissionDeniedFirestoreError(error)) {
      directDraftPermissionDenied = true;
    } else {
      return normalizedSlug;
    }
  }

  try {
    const publicationSnap = await getDoc(doc(db, "publicadas", normalizedSlug));
    if (!publicationSnap.exists()) {
      return directDraftPermissionDenied ? null : normalizedSlug;
    }

    const publicationData = publicationSnap.data() || {};
    const publicationOwnerUid = String(publicationData?.userId || "").trim();
    if (!publicationOwnerUid || publicationOwnerUid !== uid) {
      return null;
    }

    const draftCandidates = getDraftCandidatesFromPublication(publicationData);
    for (const candidateSlug of draftCandidates) {
      try {
        const candidateDraftSnap = await getDoc(doc(db, "borradores", candidateSlug));
        if (!candidateDraftSnap.exists()) continue;
        const candidateDraftData = candidateDraftSnap.data() || {};
        const candidateOwnerUid = String(candidateDraftData?.userId || "").trim();
        if (candidateOwnerUid !== uid) continue;
        if (isDraftTrashed(candidateDraftData)) continue;
        return candidateSlug;
      } catch (candidateError) {
        if (!isPermissionDeniedFirestoreError(candidateError)) {
          return normalizedSlug;
        }
      }
    }

    return null;
  } catch (publicationError) {
    if (isPermissionDeniedFirestoreError(publicationError)) {
      return null;
    }
    return normalizedSlug;
  }
}

function hasModernDraftRenderState(rawDraft) {
  const renderState = normalizeDraftRenderState(rawDraft);
  return renderState.secciones.length > 0 || renderState.objetos.length > 0;
}

function normalizeTemplateWorkspaceFromDraft(rawDraft) {
  const draftData = rawDraft && typeof rawDraft === "object" ? rawDraft : {};
  const workspace =
    draftData?.templateWorkspace && typeof draftData.templateWorkspace === "object"
      ? draftData.templateWorkspace
      : {};
  const permissions =
    workspace?.permissions && typeof workspace.permissions === "object"
      ? workspace.permissions
      : {};
  const templateId =
    typeof workspace?.templateId === "string" ? workspace.templateId.trim() : "";
  const mode =
    typeof workspace?.mode === "string" ? workspace.mode.trim() : "";
  const draftName =
    typeof draftData?.nombre === "string"
      ? draftData.nombre.trim()
      : typeof workspace?.templateName === "string"
        ? workspace.templateName.trim()
        : "";

  return {
    enabled: Boolean(templateId && mode === "template_edit"),
    templateId,
    readOnly: workspace?.readOnly === true || permissions?.readOnly === true,
    draftName,
    templateName:
      typeof workspace?.templateName === "string"
        ? workspace.templateName.trim()
        : "",
    estadoEditorial:
      typeof workspace?.estadoEditorial === "string"
        ? workspace.estadoEditorial.trim()
        : "",
    permissions,
  };
}

async function resolveCompatibleDraftForDashboardEditor({ slug, uid }) {
  const resolvedSlug = await resolveOwnedDraftSlugForEditor({ slug, uid });
  if (!resolvedSlug) {
    return { status: "unavailable", slug: null, draftData: null };
  }

  try {
    const draftSnap = await getDoc(doc(db, "borradores", resolvedSlug));
    if (!draftSnap.exists()) {
      return { status: "missing", slug: resolvedSlug, draftData: null };
    }

    const draftData = draftSnap.data() || {};
    if (isDraftTrashed(draftData)) {
      return { status: "unavailable", slug: resolvedSlug, draftData };
    }

    if (!hasModernDraftRenderState(draftData)) {
      return { status: "legacy", slug: resolvedSlug, draftData };
    }

    return { status: "ok", slug: resolvedSlug, draftData };
  } catch (error) {
    if (isPermissionDeniedFirestoreError(error)) {
      return { status: "unavailable", slug: resolvedSlug, draftData: null };
    }

    return { status: "ok", slug: resolvedSlug, draftData: null };
  }
}

function buildLegacyDraftNotice(slug, draftData = null) {
  const legacyName = String(draftData?.nombre || draftData?.slug || slug || "").trim();
  return {
    slug,
    title: "Este borrador usa un formato antiguo",
    body: `El borrador "${legacyName}" no se puede abrir en el dashboard actual porque no tiene estructura moderna de secciones y objetos.`,
  };
}

function recoverQueryFromCorruptedSlug(rawSlug) {
  if (typeof rawSlug !== "string") return {};
  const decoded = decodeURIComponentSafe(rawSlug);
  const queryStart = decoded.indexOf("?");
  if (queryStart < 0) return {};
  const suffix = decoded.slice(queryStart + 1).trim();
  if (!suffix) return {};
  const recovered = {};
  try {
    const params = new URLSearchParams(suffix);
    params.forEach((value, key) => {
      const cleanKey = String(key || "").trim();
      if (!cleanKey || cleanKey === "slug") return;
      recovered[cleanKey] = value;
    });
  } catch {}
  return recovered;
}

function isLikelyImageUrl(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (!normalized) return false;
  if (/^data:image\//i.test(normalized)) return true;
  if (/^blob:/i.test(normalized)) return true;
  if (/^https?:\/\//i.test(normalized)) return true;
  return false;
}

function collectImageUrlsDeep(value, collector) {
  if (!value) return;

  if (Array.isArray(value)) {
    value.forEach((item) => collectImageUrlsDeep(item, collector));
    return;
  }

  if (typeof value !== "object") return;

  Object.entries(value).forEach(([key, nested]) => {
    const keyLower = String(key || "").toLowerCase();
    if (typeof nested === "string") {
      const normalized = nested.trim();
      const byKey = IMAGE_SOURCE_KEYS.has(keyLower);
      const bySuffix = /\.(png|jpe?g|webp|gif|svg|avif)(\?|#|$)/i.test(normalized);
      if ((byKey || bySuffix) && isLikelyImageUrl(normalized)) {
        collector.add(normalized);
      }
      return;
    }

    collectImageUrlsDeep(nested, collector);
  });
}

function extractDraftImageUrls({ objetos = [], secciones = [] } = {}) {
  const collector = new Set();
  collectImageUrlsDeep(objetos, collector);
  collectImageUrlsDeep(secciones, collector);
  return Array.from(collector);
}

function preloadImage(url, timeoutMs = IMAGE_PRELOAD_TIMEOUT_MS) {
  if (!url || typeof window === "undefined" || typeof Image === "undefined") {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const image = new Image();
    let done = false;
    let timer = null;

    const finish = (ok) => {
      if (done) return;
      done = true;
      image.onload = null;
      image.onerror = null;
      if (timer) clearTimeout(timer);
      resolve(ok);
    };

    timer = window.setTimeout(() => finish(false), timeoutMs);

    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.decoding = "async";
    image.src = url;

    if (image.complete) {
      finish(true);
    }
  });
}

async function preloadImagesInBatches(urls, { onProgress } = {}) {
  const uniqueUrls = Array.from(new Set((urls || []).filter(Boolean)));
  const total = uniqueUrls.length;
  let loaded = 0;
  let failed = 0;

  if (!total) {
    onProgress?.({ loaded, failed, total });
    return { loaded, failed, total };
  }

  for (let i = 0; i < total; i += IMAGE_PRELOAD_BATCH_SIZE) {
    const batch = uniqueUrls.slice(i, i + IMAGE_PRELOAD_BATCH_SIZE);
    const results = await Promise.all(batch.map((url) => preloadImage(url)));

    results.forEach((ok) => {
      if (ok) {
        loaded += 1;
      } else {
        failed += 1;
      }
    });

    onProgress?.({ loaded, failed, total });
  }

  return { loaded, failed, total };
}

function buildReportForTransport(report) {
  if (!report || typeof report !== "object") return {};

  const runtime = report.runtime && typeof report.runtime === "object"
    ? {
        href: report.runtime.href || null,
        path: report.runtime.path || null,
        query: report.runtime.query || null,
        userAgent: trimText(report.runtime.userAgent, 400),
        language: report.runtime.language || null,
        platform: report.runtime.platform || null,
        viewport: report.runtime.viewport || null,
        memory: report.runtime.memory || null,
      }
    : null;

  const breadcrumbs = Array.isArray(report.breadcrumbs)
    ? report.breadcrumbs.slice(-30).map((item) => ({
        at: item?.at || null,
        event: trimText(item?.event, 120),
        detail: trimText(item?.detail, 800),
      }))
    : [];

  return {
    id: trimText(report.id, 120),
    occurredAt: trimText(report.occurredAt, 80),
    source: trimText(report.source, 180),
    severity: trimText(report.severity, 40),
    slug: trimText(report.slug, 180),
    name: trimText(report.name, 120),
    message: trimText(report.message, 2000),
    stack: trimText(report.stack, 12000),
    detail: trimText(report.detail, 12000),
    runtime,
    breadcrumbs,
    fingerprint: trimText(report.fingerprint, 180),
  };
}



export default function Dashboard() {
  const [tipoSeleccionado, setTipoSeleccionado] = useState(DEFAULT_TIPO_INVITACION);
  const [slugInvitacion, setSlugInvitacion] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isOpeningTemplateEditor, setIsOpeningTemplateEditor] = useState(false);
  const [templatePreviewCacheById, setTemplatePreviewCacheById] = useState({});
  const [templatePreviewStatus, setTemplatePreviewStatus] = useState({});
  const [templateFormState, setTemplateFormState] = useState(TEMPLATE_FORM_STATE_INITIAL);
  const [homeViewReady, setHomeViewReady] = useState(false);
  const [homeLoaderForcedDone, setHomeLoaderForcedDone] = useState(false);
  const [holdHomeStartupLoader, setHoldHomeStartupLoader] = useState(false);
  const [zoom, setZoom] = useState(0.8);
  const [secciones, setSecciones] = useState([]);
  const [seccionActivaId, setSeccionActivaId] = useState(null);
  const [usuario, setUsuario] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [modoEditor, setModoEditor] = useState(null);
  const [historialExternos, setHistorialExternos] = useState([]);
  const [futurosExternos, setFuturosExternos] = useState([]);
  const [mostrarVistaPrevia, setMostrarVistaPrevia] = useState(false);
  const [htmlVistaPrevia, setHtmlVistaPrevia] = useState(null);
  const [urlPublicaVistaPrevia, setUrlPublicaVistaPrevia] = useState(null);
  const [slugPublicoVistaPrevia, setSlugPublicoVistaPrevia] = useState(null);
  const [puedeActualizarPublicacion, setPuedeActualizarPublicacion] = useState(false);
  const [publicacionVistaPreviaError, setPublicacionVistaPreviaError] = useState("");
  const [publicacionVistaPreviaOk, setPublicacionVistaPreviaOk] = useState("");
  const [urlPublicadaReciente, setUrlPublicadaReciente] = useState(null);
  const [mostrarCheckoutPublicacion, setMostrarCheckoutPublicacion] = useState(false);
  const [operacionCheckoutPublicacion, setOperacionCheckoutPublicacion] = useState("new");
  const [vista, setVista] = useState("home");
  const [legacyDraftNotice, setLegacyDraftNotice] = useState(null);
  const [showProfileCompletion, setShowProfileCompletion] = useState(false);
  const [profileInitialValues, setProfileInitialValues] = useState({
    nombre: "",
    apellido: "",
    fechaNacimiento: "",
  });
  const [editorIssueReport, setEditorIssueReport] = useState(null);
  const [sendingIssueReport, setSendingIssueReport] = useState(false);
  const [issueSendError, setIssueSendError] = useState("");
  const [sentIssueId, setSentIssueId] = useState(null);
  const [editorPreloadState, setEditorPreloadState] = useState(
    createEditorPreloadState()
  );
  const [editorRuntimeState, setEditorRuntimeState] = useState(
    createEditorRuntimeState()
  );
  const [holdEditorStartupLoader, setHoldEditorStartupLoader] = useState(false);
  const [renderEditorStartupLoader, setRenderEditorStartupLoader] = useState(false);
  const attemptedAutoSendRef = useRef(new Set());
  const editorLoaderStartedAtRef = useRef(0);
  const editorLoaderHideTimerRef = useRef(null);
  const editorLoaderExitTimerRef = useRef(null);
  const homeLoaderForceTimerRef = useRef(null);
  const homeLoaderHideTimerRef = useRef(null);
  const router = useRouter();
  const normalizeDashboardAsPath = useCallback((value) => {
    if (typeof value !== "string") return "";
    const withoutHash = value.split("#")[0] || "";
    const [pathnameRaw, searchRaw = ""] = withoutHash.split("?");
    let pathname = pathnameRaw.trim() || "/";
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    return searchRaw ? `${pathname}?${searchRaw}` : pathname;
  }, []);
  const buildDashboardAsPathFromQuery = useCallback((queryObj = {}) => {
    const params = new URLSearchParams();
    Object.keys(queryObj || {})
      .sort()
      .forEach((key) => {
        const value = queryObj[key];
        if (Array.isArray(value)) {
          value.forEach((item) => {
            if (item === null || typeof item === "undefined") return;
            const text = String(item).trim();
            if (!text) return;
            params.append(key, text);
          });
          return;
        }
        if (value === null || typeof value === "undefined") return;
        const text = String(value).trim();
        if (!text) return;
        params.set(key, text);
      });
    const serialized = params.toString();
    return serialized ? `/dashboard?${serialized}` : "/dashboard";
  }, []);
  const replaceDashboardQuerySafely = useCallback(
    (nextQuery = {}, options = { shallow: true }) => {
      const targetAsPath = buildDashboardAsPathFromQuery(nextQuery);
      const currentAsPath =
        typeof window !== "undefined"
          ? `${window.location.pathname || ""}${window.location.search || ""}`
          : (typeof router.asPath === "string" ? router.asPath : "");

      if (
        normalizeDashboardAsPath(currentAsPath) ===
        normalizeDashboardAsPath(targetAsPath)
      ) {
        return Promise.resolve(false);
      }

      return router
        .replace(
          { pathname: "/dashboard", query: nextQuery },
          undefined,
          options
        )
        .then(() => true)
        .catch((error) => {
          const message = String(error?.message || "");
          if (message.includes("attempted to hard navigate to the same URL")) {
            return false;
          }
          throw error;
        });
    },
    [buildDashboardAsPathFromQuery, normalizeDashboardAsPath, router]
  );
  const { loadingAdminAccess, isSuperAdmin, canManageSite } =
    useAdminAccess(usuario);
  const adminDraftSnapshotCallable = useMemo(
    () => httpsCallable(cloudFunctions, "getAdminDraftSnapshot"),
    []
  );
  const [adminDraftView, setAdminDraftView] = useState({
    enabled: false,
    status: "idle",
    ownerUid: "",
    slug: "",
    draftData: null,
    draftName: "",
  });
  const [templateWorkspaceView, setTemplateWorkspaceView] = useState({
    enabled: false,
    status: "idle",
    templateId: "",
    readOnly: false,
    draftName: "",
    templateName: "",
    estadoEditorial: "",
    permissions: {},
    initialData: null,
  });
  const [editorSession, setEditorSession] = useState({
    kind: null,
    id: "",
  });
  const resetAdminDraftView = useCallback(() => {
    setAdminDraftView({
      enabled: false,
      status: "idle",
      ownerUid: "",
      slug: "",
      draftData: null,
      draftName: "",
    });
  }, []);
  const resetTemplateWorkspaceView = useCallback(() => {
    setTemplateWorkspaceView({
      enabled: false,
      status: "idle",
      templateId: "",
      readOnly: false,
      draftName: "",
      templateName: "",
      estadoEditorial: "",
      permissions: {},
      initialData: null,
    });
  }, []);
  const resetEditorSession = useCallback(() => {
    setEditorSession({
      kind: null,
      id: "",
    });
  }, []);
  const isAdminReadOnlyView =
    adminDraftView.enabled === true && adminDraftView.status === "ready";
  const isTemplateWorkspaceReadOnly =
    templateWorkspaceView.enabled === true && templateWorkspaceView.readOnly === true;
  const isEditorReadOnly = isAdminReadOnlyView || isTemplateWorkspaceReadOnly;
  const isTemplateEditorSession = editorSession.kind === "template";
  const selectedTemplateId =
    typeof selectedTemplate?.id === "string" ? selectedTemplate.id : "";
  const selectedTemplateMetadata = useMemo(
    () => normalizeTemplateMetadata(selectedTemplate),
    [selectedTemplate]
  );
  const selectedTemplatePreviewHtml = selectedTemplateId
    ? templatePreviewCacheById[selectedTemplateId] || ""
    : "";
  const selectedTemplatePreviewState = selectedTemplateId
    ? templatePreviewStatus[selectedTemplateId] || TEMPLATE_PREVIEW_STATUS_IDLE
    : TEMPLATE_PREVIEW_STATUS_IDLE;
  const selectedTemplateFormState = selectedTemplateId
    ? templateFormState
    : TEMPLATE_FORM_STATE_INITIAL;

  useEffect(() => {
    return () => {
      if (editorLoaderHideTimerRef.current) {
        clearTimeout(editorLoaderHideTimerRef.current);
        editorLoaderHideTimerRef.current = null;
      }
      if (editorLoaderExitTimerRef.current) {
        clearTimeout(editorLoaderExitTimerRef.current);
        editorLoaderExitTimerRef.current = null;
      }
      if (homeLoaderForceTimerRef.current) {
        clearTimeout(homeLoaderForceTimerRef.current);
        homeLoaderForceTimerRef.current = null;
      }
      if (homeLoaderHideTimerRef.current) {
        clearTimeout(homeLoaderHideTimerRef.current);
        homeLoaderHideTimerRef.current = null;
      }
    };
  }, []);


  // Sync ?slug=... with local state (always Konva)
  useEffect(() => {
    if (!router.isReady) return;
    if (checkingAuth) return;
    if (loadingAdminAccess) return;

    let cancelled = false;

    const rawSlugParam = getFirstQueryValue(router.query?.slug);
    const slugURL = sanitizeDraftSlug(rawSlugParam);
    const rawTemplateIdParam = getFirstQueryValue(router.query?.templateId);
    const templateIdURL = sanitizeDraftSlug(rawTemplateIdParam);
    const adminViewEnabled = isTruthyQueryFlag(router.query?.adminView);
    const ownerUidFromQuery = sanitizeUidValue(
      getFirstQueryValue(router.query?.ownerUid)
    );
    const recoveredQuery = recoverQueryFromCorruptedSlug(rawSlugParam);
    const recoveredQueryKeys = Object.keys(recoveredQuery).filter(
      (key) => typeof router.query?.[key] === "undefined"
    );
    const shouldNormalizeUrl =
      Boolean(rawSlugParam) &&
      Boolean(slugURL) &&
      (rawSlugParam !== slugURL || recoveredQueryKeys.length > 0);
    const shouldNormalizeTemplateUrl =
      Boolean(rawTemplateIdParam) &&
      Boolean(templateIdURL) &&
      rawTemplateIdParam !== templateIdURL;

    const syncEditorSlugFromQuery = async () => {
      const baseNextQuery = { ...router.query };
      recoveredQueryKeys.forEach((key) => {
        baseNextQuery[key] = recoveredQuery[key];
      });

      if (adminViewEnabled) {
        resetTemplateWorkspaceView();
        if (!slugURL || !ownerUidFromQuery) {
          const nextQuery = { ...baseNextQuery };
          delete nextQuery.slug;
          delete nextQuery.adminView;
          delete nextQuery.ownerUid;
          void replaceDashboardQuerySafely(nextQuery, { shallow: true });
          resetAdminDraftView();
          resetTemplateWorkspaceView();
          resetEditorSession();
          setSlugInvitacion(null);
          setModoEditor(null);
          setVista("home");
          return;
        }

        if (!isSuperAdmin) {
          const nextQuery = { ...baseNextQuery };
          delete nextQuery.slug;
          delete nextQuery.adminView;
          delete nextQuery.ownerUid;
          void replaceDashboardQuerySafely(nextQuery, { shallow: true });
          pushEditorBreadcrumb("dashboard-adminview-access-denied", {
            slug: slugURL,
            ownerUid: ownerUidFromQuery,
          });
          resetAdminDraftView();
          resetTemplateWorkspaceView();
          resetEditorSession();
          setSlugInvitacion(null);
          setModoEditor(null);
          setVista("home");
          return;
        }

        setAdminDraftView({
          enabled: true,
          status: "loading",
          ownerUid: ownerUidFromQuery,
          slug: slugURL,
          draftData: null,
          draftName: "",
        });

        try {
          const result = await adminDraftSnapshotCallable({
            ownerUid: ownerUidFromQuery,
            slug: slugURL,
          });
          const data = result?.data || {};
          if (cancelled) return;

          const normalizedSlug =
            sanitizeDraftSlug(
              typeof data.slug === "string" ? data.slug : slugURL
            ) || slugURL;
          const normalizedOwnerUid =
            sanitizeUidValue(
              typeof data.ownerUid === "string" ? data.ownerUid : ownerUidFromQuery
            ) || ownerUidFromQuery;
          const draftName =
            typeof data.draftName === "string" ? data.draftName : "";
          const status =
            typeof data.status === "string" ? data.status : "unavailable";
          const draftData =
            data.draft && typeof data.draft === "object" ? data.draft : null;

          if (status !== "ok" || !draftData) {
            const nextQuery = { ...baseNextQuery };
            delete nextQuery.slug;
            delete nextQuery.adminView;
            delete nextQuery.ownerUid;
            void replaceDashboardQuerySafely(nextQuery, { shallow: true });

            pushEditorBreadcrumb(
              status === "legacy"
                ? "dashboard-adminview-legacy-blocked"
                : "dashboard-adminview-unavailable",
              {
                slug: normalizedSlug,
                ownerUid: normalizedOwnerUid,
              }
            );

            if (status === "legacy") {
              setLegacyDraftNotice(
                buildLegacyDraftNotice(normalizedSlug, {
                  nombre: draftName || normalizedSlug,
                })
              );
            }

            resetAdminDraftView();
            resetTemplateWorkspaceView();
            resetEditorSession();
            setSlugInvitacion(null);
            setModoEditor(null);
            setVista("home");
            return;
          }

          if (
            shouldNormalizeUrl ||
            normalizedSlug !== slugURL ||
            normalizedOwnerUid !== ownerUidFromQuery ||
            getFirstQueryValue(router.query?.adminView) !== "1"
          ) {
            const nextQuery = {
              ...baseNextQuery,
              slug: normalizedSlug,
              adminView: "1",
              ownerUid: normalizedOwnerUid,
            };
            void replaceDashboardQuerySafely(nextQuery, { shallow: true });
            pushEditorBreadcrumb("dashboard-adminview-query-normalized", {
              slugRaw: rawSlugParam,
              slug: normalizedSlug,
              ownerUid: normalizedOwnerUid,
            });
          }

          setLegacyDraftNotice(null);
          resetTemplateWorkspaceView();
          setEditorSession({
            kind: "draft",
            id: normalizedSlug,
          });
          setAdminDraftView({
            enabled: true,
            status: "ready",
            ownerUid: normalizedOwnerUid,
            slug: normalizedSlug,
            draftData,
            draftName,
          });
          setSlugInvitacion((prev) => (prev === normalizedSlug ? prev : normalizedSlug));
          setModoEditor((prev) => (prev === "konva" ? prev : "konva"));
          setVista((prev) => (prev === "editor" ? prev : "editor"));
          return;
        } catch (error) {
          if (cancelled) return;

          console.error("Error cargando snapshot admin del borrador:", error);
          pushEditorBreadcrumb("dashboard-adminview-load-error", {
            slug: slugURL,
            ownerUid: ownerUidFromQuery,
            message: getErrorMessage(error, "adminview-load-error"),
          });

          const nextQuery = { ...baseNextQuery };
          delete nextQuery.slug;
          delete nextQuery.adminView;
          delete nextQuery.ownerUid;
          void replaceDashboardQuerySafely(nextQuery, { shallow: true });

          resetAdminDraftView();
          resetTemplateWorkspaceView();
          resetEditorSession();
          setSlugInvitacion(null);
          setModoEditor(null);
          setVista("home");
          return;
        }
      }

      if (templateIdURL) {
        resetAdminDraftView();

        if (loadingAdminAccess) {
          return;
        }

        if (!canManageSite) {
          const nextQuery = { ...baseNextQuery };
          delete nextQuery.templateId;
          void replaceDashboardQuerySafely(nextQuery, { shallow: true });
          resetTemplateWorkspaceView();
          resetEditorSession();
          setSlugInvitacion(null);
          setModoEditor(null);
          setVista("home");
          return;
        }

        setTemplateWorkspaceView({
          enabled: true,
          status: "loading",
          templateId: templateIdURL,
          readOnly: false,
          draftName: "",
          templateName: "",
          estadoEditorial: "",
          permissions: {},
          initialData: null,
        });

        try {
          const result = await getTemplateEditorDocument({
            templateId: templateIdURL,
          });
          if (cancelled) return;

          const editorDocument =
            result?.editorDocument && typeof result.editorDocument === "object"
              ? result.editorDocument
              : null;
          if (!editorDocument) {
            throw new Error("No se pudo cargar la plantilla interna.");
          }

          const normalizedTemplateId =
            sanitizeDraftSlug(
              typeof result?.item?.id === "string"
                ? result.item.id
                : typeof editorDocument?.plantillaId === "string"
                  ? editorDocument.plantillaId
                  : templateIdURL
            ) || templateIdURL;

          if (
            shouldNormalizeTemplateUrl ||
            normalizedTemplateId !== templateIdURL
          ) {
            const nextQuery = {
              ...baseNextQuery,
              templateId: normalizedTemplateId,
            };
            delete nextQuery.slug;
            void replaceDashboardQuerySafely(nextQuery, { shallow: true });
          }

          const nextView = normalizeTemplateWorkspaceFromDraft(editorDocument);
          setLegacyDraftNotice(null);
          setTemplateWorkspaceView({
            ...nextView,
            enabled: true,
            status: "ready",
            templateId: normalizedTemplateId,
            initialData: editorDocument,
          });
          setEditorSession({
            kind: "template",
            id: normalizedTemplateId,
          });
          setSlugInvitacion((prev) =>
            prev === normalizedTemplateId ? prev : normalizedTemplateId
          );
          setModoEditor((prev) => (prev === "konva" ? prev : "konva"));
          setVista((prev) => (prev === "editor" ? prev : "editor"));
          return;
        } catch (error) {
          if (cancelled) return;
          console.error("Error cargando plantilla interna:", error);
          const nextQuery = { ...baseNextQuery };
          delete nextQuery.templateId;
          void replaceDashboardQuerySafely(nextQuery, { shallow: true });
          resetTemplateWorkspaceView();
          resetEditorSession();
          setSlugInvitacion(null);
          setModoEditor(null);
          setVista("home");
          return;
        }
      }

      resetAdminDraftView();
      resetTemplateWorkspaceView();
      resetEditorSession();

      let normalizedSlug = slugURL;
      let compatibilityStatus = slugURL ? "ok" : "idle";
      let compatibleDraftData = null;

      if (slugURL && usuario?.uid) {
        const compatibleDraft = await resolveCompatibleDraftForDashboardEditor({
          slug: slugURL,
          uid: usuario.uid,
        });
        normalizedSlug = compatibleDraft.slug;
        compatibilityStatus = compatibleDraft.status;
        compatibleDraftData = compatibleDraft.draftData;
      }

      if (cancelled) return;

      if (slugURL && compatibilityStatus !== "ok") {
        const nextQuery = { ...baseNextQuery };
        delete nextQuery.slug;

        void replaceDashboardQuerySafely(nextQuery, { shallow: true });

        pushEditorBreadcrumb(
          compatibilityStatus === "legacy"
            ? "dashboard-slug-legacy-deprecated"
            : "dashboard-slug-access-denied",
          {
          slugRaw: rawSlugParam,
          slug: slugURL,
          }
        );

        if (compatibilityStatus === "legacy") {
          setLegacyDraftNotice(buildLegacyDraftNotice(slugURL, compatibleDraftData));
        }

        setSlugInvitacion(null);
        setModoEditor(null);
        setVista("home");
        return;
      }

      if (shouldNormalizeUrl || (normalizedSlug && normalizedSlug !== slugURL)) {
        const nextQuery = { ...baseNextQuery, slug: normalizedSlug };
        void replaceDashboardQuerySafely(nextQuery, { shallow: true });
        pushEditorBreadcrumb("dashboard-slug-sanitized", {
          slugRaw: rawSlugParam,
          slug: normalizedSlug,
          recoveredKeys: recoveredQueryKeys,
        });
      }

      if (normalizedSlug) {
        setLegacyDraftNotice(null);
        setTemplateWorkspaceView(
          {
            ...normalizeTemplateWorkspaceFromDraft(compatibleDraftData),
            status: "ready",
            initialData: null,
          }
        );
        setEditorSession({
          kind: "draft",
          id: normalizedSlug,
        });
        setSlugInvitacion((prev) => (prev === normalizedSlug ? prev : normalizedSlug));
        setModoEditor((prev) => (prev === "konva" ? prev : "konva"));
        setVista((prev) => (prev === "editor" ? prev : "editor"));
        return;
      }

      resetTemplateWorkspaceView();
      resetEditorSession();
      setSlugInvitacion(null);
      setModoEditor(null);
      setVista((prev) => (prev === "editor" ? "home" : prev));
    };

    void syncEditorSlugFromQuery();

    return () => {
      cancelled = true;
    };
  }, [
    adminDraftSnapshotCallable,
    canManageSite,
    checkingAuth,
    isSuperAdmin,
    loadingAdminAccess,
    replaceDashboardQuerySafely,
    resetAdminDraftView,
    resetEditorSession,
    resetTemplateWorkspaceView,
    router.isReady,
    router.query?.adminView,
    router.query?.ownerUid,
    router.query?.slug,
    router.query?.templateId,
    usuario?.uid,
  ]);

  useEffect(() => {
    pushEditorBreadcrumb("dashboard-mounted", {});

    const teardownGlobal = installGlobalEditorIssueHandlers();
    const onIssueCaptured = (event) => {
      const report = event?.detail || null;
      if (!report) return;
      setEditorIssueReport(report);
      setIssueSendError("");
      setSentIssueId(null);
    };

    window.addEventListener("editor-issue-captured", onIssueCaptured);

    const pending = readPendingEditorIssue();
    if (pending) {
      setEditorIssueReport(pending);
    }

    return () => {
      teardownGlobal?.();
      window.removeEventListener("editor-issue-captured", onIssueCaptured);
    };
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    const slugQuery = sanitizeDraftSlug(getFirstQueryValue(router.query?.slug));
    consumeInterruptedEditorSession({ currentSlug: slugQuery });
  }, [router.isReady, router.query?.slug]);

  useEffect(() => {
    if (!slugInvitacion) return;
    pushEditorBreadcrumb("editor-open", {
      slug: slugInvitacion,
      vista,
      modoEditor,
    });
  }, [slugInvitacion, vista, modoEditor]);

  useEffect(() => {
    if (!slugInvitacion) return undefined;
    const stopWatchdog = startEditorSessionWatchdog({
      slug: slugInvitacion,
      context: {
        vista,
        modoEditor,
      },
    });
    return () => {
      stopWatchdog("editor-unmounted");
    };
  }, [slugInvitacion]);

  useEffect(() => {
    if (!slugInvitacion) {
      setEditorPreloadState(createEditorPreloadState());
      return;
    }

    let cancelled = false;
    const currentSlug = slugInvitacion;

    const preloadEditorAssets = async () => {
      const startedAt = Date.now();
      let forcedFinish = false;
      const maxWaitTimer =
        typeof window !== "undefined"
          ? window.setTimeout(() => {
              if (cancelled) return;
              forcedFinish = true;
              const elapsedMs = Date.now() - startedAt;
              logEditorPreload("timeout-total", {
                slug: currentSlug,
                elapsedMs,
                maxAllowedMs: TOTAL_PRELOAD_TIMEOUT_MS,
              });
              pushEditorBreadcrumb("editor-preload-timeout", {
                slug: currentSlug,
                elapsedMs,
                maxAllowedMs: TOTAL_PRELOAD_TIMEOUT_MS,
              });
              setEditorPreloadState((prev) => {
                if (prev.slug !== currentSlug) return prev;
                return {
                  ...prev,
                  status: "done",
                  message: "La precarga demoro demasiado. Abriendo editor...",
                };
              });
            }, TOTAL_PRELOAD_TIMEOUT_MS)
          : null;

      setEditorPreloadState(
        createEditorPreloadState({
          slug: currentSlug,
          status: "running",
          message: "Leyendo borrador...",
        })
      );

      logEditorPreload("start", { slug: currentSlug });
      pushEditorBreadcrumb("editor-preload-start", { slug: currentSlug });

      try {
        const draftRef = doc(db, "borradores", currentSlug);
        const draftReadStarted = Date.now();
        const draftSnap = await getDoc(draftRef);
        if (cancelled || forcedFinish) return;

        const draftData = draftSnap.exists() ? draftSnap.data() || {} : {};
        const draftObjetos = Array.isArray(draftData?.objetos) ? draftData.objetos : [];
        const draftSecciones = Array.isArray(draftData?.secciones) ? draftData.secciones : [];

        const draftFonts = Array.from(
          new Set(
            draftObjetos
              .map((obj) => (typeof obj?.fontFamily === "string" ? obj.fontFamily.trim() : ""))
              .filter(Boolean)
          )
        );

        const fontsToPreload = draftFonts;
        const selectorFontsToWarm = TYPOGRAPHY_SELECTOR_FONT_VALUES;
        const imageUrls = extractDraftImageUrls({
          objetos: draftObjetos,
          secciones: draftSecciones,
        });

        logEditorPreload("draft-loaded", {
          slug: currentSlug,
          elapsedMs: Date.now() - draftReadStarted,
          objetos: draftObjetos.length,
          secciones: draftSecciones.length,
          fontsToPreload: fontsToPreload.length,
          selectorFontsToWarm: selectorFontsToWarm.length,
          fontFamilies: fontsToPreload,
          imagesToPreload: imageUrls.length,
        });

        setEditorPreloadState((prev) => {
          if (cancelled || prev.slug !== currentSlug) return prev;
          return {
            ...prev,
            message: "Cargando tipografias...",
            fontsTotal: fontsToPreload.length,
            imagesTotal: imageUrls.length,
          };
        });

        let fontsLoaded = 0;
        let fontsFailed = 0;
        let fontManagerInstance = null;

        if (fontsToPreload.length || selectorFontsToWarm.length) {
          const fontManagerModule = await import("@/utils/fontManager");
          fontManagerInstance = fontManagerModule.fontManager;
        }

        if (fontsToPreload.length && fontManagerInstance) {
          logEditorPreload("fonts-start", {
            slug: currentSlug,
            total: fontsToPreload.length,
          });

          const fontOutcome = await withTimeout(
            fontManagerInstance.loadFonts(fontsToPreload),
            FONT_PRELOAD_TIMEOUT_MS,
            {
              loaded: [],
              failed: fontsToPreload,
            }
          );

          if (cancelled || forcedFinish) return;

          if (fontOutcome.error) {
            logEditorPreload("fonts-error", {
              slug: currentSlug,
              message: getErrorMessage(fontOutcome.error, "fonts-load-error"),
            });
            fontsLoaded = 0;
            fontsFailed = fontsToPreload.length;
          } else {
            const fontResult = fontOutcome.value || { loaded: [], failed: [] };
            const loadedNames = Array.isArray(fontResult?.loaded)
              ? fontResult.loaded
              : [];
            const failedNames = Array.isArray(fontResult?.failed)
              ? fontResult.failed
              : [];
            fontsLoaded = loadedNames.length;
            fontsFailed = failedNames.length
              ? failedNames.length
              : Math.max(0, fontsToPreload.length - fontsLoaded);
            if (fontOutcome.timedOut) {
              logEditorPreload("fonts-timeout", {
                slug: currentSlug,
                timeoutMs: FONT_PRELOAD_TIMEOUT_MS,
                loaded: fontsLoaded,
                failed: fontsFailed,
                loadedFonts: loadedNames,
                failedFonts: failedNames,
              });
            } else {
              logEditorPreload("fonts-done", {
                slug: currentSlug,
                loaded: fontsLoaded,
                failed: fontsFailed,
                loadedFonts: loadedNames,
                failedFonts: failedNames,
              });
            }
          }
        } else {
          logEditorPreload("fonts-skip", {
            slug: currentSlug,
            reason: "no-fonts-to-preload",
          });
        }

        if (fontManagerInstance && selectorFontsToWarm.length) {
          logEditorPreload("font-selector-warmup-start", {
            slug: currentSlug,
            total: selectorFontsToWarm.length,
          });

          const selectorWarmupOutcomePromise = withTimeout(
            fontManagerInstance.loadFonts(selectorFontsToWarm),
            SELECTOR_FONT_WARMUP_TIMEOUT_MS,
            {
              loaded: [],
              failed: selectorFontsToWarm,
            }
          );

          void selectorWarmupOutcomePromise.then((selectorWarmupOutcome) => {
            if (cancelled || forcedFinish) return;

            if (selectorWarmupOutcome?.error) {
              logEditorPreload("font-selector-warmup-error", {
                slug: currentSlug,
                message: getErrorMessage(
                  selectorWarmupOutcome.error,
                  "font-selector-warmup-error"
                ),
              });
              return;
            }

            const warmupResult = selectorWarmupOutcome?.value || { loaded: [], failed: [] };
            const loadedNames = Array.isArray(warmupResult?.loaded)
              ? warmupResult.loaded
              : [];
            const failedNames = Array.isArray(warmupResult?.failed)
              ? warmupResult.failed
              : [];

            if (selectorWarmupOutcome?.timedOut) {
              logEditorPreload("font-selector-warmup-timeout", {
                slug: currentSlug,
                timeoutMs: SELECTOR_FONT_WARMUP_TIMEOUT_MS,
                loaded: loadedNames.length,
                failed: failedNames.length,
              });
            } else {
              logEditorPreload("font-selector-warmup-done", {
                slug: currentSlug,
                loaded: loadedNames.length,
                failed: failedNames.length,
              });
              pushEditorBreadcrumb("font-selector-warmup-done", {
                slug: currentSlug,
                loaded: loadedNames.length,
                failed: failedNames.length,
              });
            }
          });
        }

        setEditorPreloadState((prev) => {
          if (cancelled || prev.slug !== currentSlug) return prev;
          return {
            ...prev,
            message: imageUrls.length
              ? "Cargando fotos y recursos..."
              : "Finalizando editor...",
            fontsLoaded,
            fontsFailed,
          };
        });

        const imagePreloadStarted = Date.now();
        let lastImageLogAt = -1;
        const imageStats = await preloadImagesInBatches(imageUrls, {
          onProgress: ({ loaded, failed, total }) => {
            if (cancelled || forcedFinish) return;
            setEditorPreloadState((prev) => {
              if (prev.slug !== currentSlug) return prev;
              return {
                ...prev,
                message: "Cargando fotos y recursos...",
                imagesTotal: total,
                imagesLoaded: loaded,
                imagesFailed: failed,
              };
            });

            const processed = loaded + failed;
            if (processed !== lastImageLogAt) {
              lastImageLogAt = processed;
              logEditorPreload("images-progress", {
                slug: currentSlug,
                loaded,
                failed,
                total,
              });
            }
          },
        });

        if (cancelled || forcedFinish) return;

        logEditorPreload("images-done", {
          slug: currentSlug,
          elapsedMs: Date.now() - imagePreloadStarted,
          loaded: imageStats.loaded,
          failed: imageStats.failed,
          total: imageStats.total,
        });

        setEditorPreloadState((prev) => {
          if (prev.slug !== currentSlug) return prev;
          return {
            ...prev,
            status: "done",
            message: "Listo",
            fontsLoaded,
            fontsFailed,
            imagesLoaded: imageStats.loaded,
            imagesFailed: imageStats.failed,
            imagesTotal: imageStats.total,
          };
        });

        const totalElapsedMs = Date.now() - startedAt;
        logEditorPreload("done", {
          slug: currentSlug,
          elapsedMs: totalElapsedMs,
          fontsLoaded,
          fontsFailed,
          imagesLoaded: imageStats.loaded,
          imagesFailed: imageStats.failed,
        });
        pushEditorBreadcrumb("editor-preload-ready", {
          slug: currentSlug,
          elapsedMs: totalElapsedMs,
          fontsTotal: fontsToPreload.length,
          fontsFailed,
          imagesTotal: imageStats.total,
          imagesFailed: imageStats.failed,
        });
      } catch (error) {
        if (cancelled || forcedFinish) return;

        logEditorPreload("error", {
          slug: currentSlug,
          message: getErrorMessage(error, "editor-preload-error"),
        });
        console.warn("No se pudo completar la precarga del editor:", error);
        pushEditorBreadcrumb("editor-preload-error", {
          slug: currentSlug,
          message: getErrorMessage(error, "editor-preload-error"),
        });

        setEditorPreloadState((prev) => {
          if (prev.slug !== currentSlug) return prev;
          return {
            ...prev,
            status: "done",
            message: "No se pudieron precargar todos los recursos. Abriendo editor...",
          };
        });
      } finally {
        if (maxWaitTimer !== null) {
          clearTimeout(maxWaitTimer);
        }
      }
    };

    void preloadEditorAssets();

    return () => {
      cancelled = true;
    };
  }, [slugInvitacion]);

  useEffect(() => {
    if (!slugInvitacion) {
      setEditorRuntimeState(createEditorRuntimeState());
      return;
    }

    setEditorRuntimeState((prev) => {
      if (prev.slug === slugInvitacion) return prev;
      return createEditorRuntimeState({
        slug: slugInvitacion,
        status: "running",
      });
    });
  }, [slugInvitacion]);

  const handleEditorStartupStatusChange = useCallback((statusPayload = {}) => {
    const payloadSlug =
      typeof statusPayload.slug === "string" && statusPayload.slug.trim()
        ? statusPayload.slug.trim()
        : slugInvitacion;

    if (!payloadSlug) return;
    if (slugInvitacion && payloadSlug !== slugInvitacion) return;

    setEditorRuntimeState((prev) => {
      if (prev.slug && prev.slug !== payloadSlug) return prev;

      const next = createEditorRuntimeState({
        slug: payloadSlug,
        status: statusPayload.status === "ready" ? "ready" : "running",
        draftLoaded: statusPayload.draftLoaded === true,
        totalBackgrounds: Number(statusPayload.totalBackgrounds || 0),
        loadedBackgrounds: Number(statusPayload.loadedBackgrounds || 0),
        failedBackgrounds: Number(statusPayload.failedBackgrounds || 0),
        pendingBackgrounds: Number(statusPayload.pendingBackgrounds || 0),
      });

      if (
        prev.slug === next.slug &&
        prev.status === next.status &&
        prev.draftLoaded === next.draftLoaded &&
        prev.totalBackgrounds === next.totalBackgrounds &&
        prev.loadedBackgrounds === next.loadedBackgrounds &&
        prev.failedBackgrounds === next.failedBackgrounds &&
        prev.pendingBackgrounds === next.pendingBackgrounds
      ) {
        return prev;
      }

      return next;
    });
  }, [slugInvitacion]);

  const handleDismissEditorIssue = () => {
    clearPendingEditorIssue();
    setEditorIssueReport(null);
    setIssueSendError("");
    setSentIssueId(null);
  };

  const handleCopyEditorIssue = async () => {
    if (!editorIssueReport) return;
    const payload = JSON.stringify(editorIssueReport, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      alert("Reporte copiado al portapapeles.");
    } catch {
      alert(payload);
    }
  };

  const handleSendEditorIssue = async (reportOverride = null) => {
    const reportToSend = reportOverride || editorIssueReport;
    if (!reportToSend || sendingIssueReport) return;

    setSendingIssueReport(true);
    setIssueSendError("");

    try {
      const reportClientIssueCallable = httpsCallable(cloudFunctions, "reportClientIssue");
      const transportReport = buildReportForTransport(reportToSend);
      const result = await reportClientIssueCallable({
        report: transportReport,
      });
      const issueId = result?.data?.issueId || null;
      if (issueId) {
        setSentIssueId(issueId);
      }
      if (!reportOverride || reportOverride === editorIssueReport) {
        clearPendingEditorIssue();
      }
      pushEditorBreadcrumb("issue-report-sent", {
        issueId: issueId || null,
        source: reportToSend?.source || null,
      });
    } catch (error) {
      setIssueSendError(getErrorMessage(error, "No se pudo enviar el reporte."));
      pushEditorBreadcrumb("issue-report-send-error", {
        source: reportToSend?.source || null,
        message: getErrorMessage(error, "No se pudo enviar el reporte."),
      });
    } finally {
      setSendingIssueReport(false);
    }
  };

  useEffect(() => {
    if (!editorIssueReport) return;

    const reportKey =
      editorIssueReport.id ||
      `${editorIssueReport.fingerprint || "no-fingerprint"}:${editorIssueReport.occurredAt || "no-time"}`;

    if (attemptedAutoSendRef.current.has(reportKey)) return;
    attemptedAutoSendRef.current.add(reportKey);

    handleSendEditorIssue(editorIssueReport);
  }, [editorIssueReport]);


  const toggleZoom = () => {
    setZoom((prev) => (prev === 1 ? 0.8 : 1));
  };

  const abrirBorradorEnEditor = useCallback(
    async (slug) => {
      const safeSlug = sanitizeDraftSlug(slug);
      if (!safeSlug) return;

      const compatibleDraft = usuario?.uid
        ? await resolveCompatibleDraftForDashboardEditor({
            slug: safeSlug,
            uid: usuario.uid,
          })
        : {
            status: "ok",
            slug: safeSlug,
            draftData: null,
          };

      if (compatibleDraft.status !== "ok" || !compatibleDraft.slug) {
        if (compatibleDraft.status === "legacy") {
          setLegacyDraftNotice(
            buildLegacyDraftNotice(safeSlug, compatibleDraft.draftData)
          );
          pushEditorBreadcrumb("dashboard-open-legacy-blocked", {
            slug: safeSlug,
          });
        }

        resetTemplateWorkspaceView();
        resetEditorSession();
        setSlugInvitacion(null);
        setModoEditor(null);
        setVista("home");
        return;
      }

      setLegacyDraftNotice(null);
      resetTemplateWorkspaceView();
      setEditorSession({
        kind: "draft",
        id: compatibleDraft.slug,
      });
      setSlugInvitacion(compatibleDraft.slug);
      setModoEditor("konva");
      setVista("editor");
      const nextQuery = { slug: compatibleDraft.slug };
      const currentQuery =
        router?.query && typeof router.query === "object" ? router.query : {};
      let locationParams = null;
      if (typeof window !== "undefined") {
        try {
          locationParams = new URLSearchParams(window.location.search || "");
        } catch {
          locationParams = null;
        }
      }
      const passthroughKeys = ["phase_atomic_v2", "inlineOverlayEngine"];
      passthroughKeys.forEach((key) => {
        const value = currentQuery[key];
        if (typeof value === "string" && value.trim()) {
          nextQuery[key] = value;
          return;
        }
        if (Array.isArray(value)) {
          const first = value.find((item) => typeof item === "string" && item.trim());
          if (typeof first === "string" && first.trim()) {
            nextQuery[key] = first;
          }
        }
        if (typeof nextQuery[key] === "undefined" && locationParams) {
          const fromLocation = locationParams.get(key);
          if (typeof fromLocation === "string" && fromLocation.trim()) {
            nextQuery[key] = fromLocation;
          } else if (locationParams.has(key) && key === "phase_atomic_v2") {
            nextQuery[key] = "1";
          }
        }
      });
      if (
        nextQuery.inlineOverlayEngine === "phase_atomic_v2" ||
        nextQuery.phase_atomic_v2 === "1"
      ) {
        try {
          window.__INLINE_OVERLAY_ENGINE = "phase_atomic_v2";
          window.__INLINE_AB = {
            ...(window.__INLINE_AB && typeof window.__INLINE_AB === "object"
              ? window.__INLINE_AB
              : {}),
            overlayEngine: "phase_atomic_v2",
          };
        } catch {}
      }
      void replaceDashboardQuerySafely(nextQuery, { shallow: true });
    },
    [
      replaceDashboardQuerySafely,
      resetEditorSession,
      resetTemplateWorkspaceView,
      router,
      usuario?.uid,
    ]
  );

  const resetTemplateFormState = useCallback((template) => {
    const safeTemplate = template && typeof template === "object" ? template : null;
    const nextState = buildTemplateFormState(safeTemplate, TEMPLATE_FORM_STATE_INITIAL);
    setTemplateFormState({
      rawValues: nextState.rawValues || {},
      touchedKeys: [],
    });
  }, []);

  const handleTemplateFormStateChange = useCallback((templateId, nextState) => {
    const safeTemplateId = String(templateId || "").trim();
    if (!safeTemplateId) return;
    const safeNextState = nextState && typeof nextState === "object" ? nextState : null;
    if (!safeNextState) return;

    setTemplateFormState({
      rawValues:
        safeNextState.rawValues && typeof safeNextState.rawValues === "object"
          ? safeNextState.rawValues
          : {},
      touchedKeys: Array.isArray(safeNextState.touchedKeys) ? safeNextState.touchedKeys : [],
    });
  }, []);

  const loadTemplatePreview = useCallback(
    async (template) => {
      const safeTemplate = template && typeof template === "object" ? template : null;
      const templateId = String(safeTemplate?.id || "").trim();
      if (!templateId) return;

      const hasRenderableContent =
        Array.isArray(safeTemplate?.secciones) &&
        safeTemplate.secciones.length > 0 &&
        Array.isArray(safeTemplate?.objetos) &&
        safeTemplate.objetos.length > 0;
      const previewSource = resolveTemplatePreviewSource(safeTemplate);
      if (previewSource.mode === "url" && previewSource.previewUrl) {
        if (templatePreviewCacheById[templateId]) {
          setTemplatePreviewStatus((prev) => ({
            ...prev,
            [templateId]: createTemplatePreviewStatus({ status: "ready", error: "" }),
          }));
          return;
        }

        if (!hasRenderableContent) {
          setTemplatePreviewStatus((prev) => ({
            ...prev,
            [templateId]: createTemplatePreviewStatus({ status: "ready", error: "" }),
          }));
          return;
        }

        setTemplatePreviewStatus((prev) => ({
          ...prev,
          [templateId]: createTemplatePreviewStatus({ status: "loading", error: "" }),
        }));

        try {
          const htmlFallback = await generateTemplatePreviewHtml(safeTemplate);
          setTemplatePreviewCacheById((prev) => {
            if (prev[templateId]) return prev;
            return {
              ...prev,
              [templateId]: htmlFallback,
            };
          });
        } catch {
          // Si falla HTML generado, dejamos fallback al previewUrl.
        } finally {
          setTemplatePreviewStatus((prev) => ({
            ...prev,
            [templateId]: createTemplatePreviewStatus({ status: "ready", error: "" }),
          }));
        }
        return;
      }

      if (!hasRenderableContent) {
        setTemplatePreviewStatus((prev) => ({
          ...prev,
          [templateId]: createTemplatePreviewStatus({ status: "loading", error: "" }),
        }));
        return;
      }

      if (templatePreviewCacheById[templateId]) {
        setTemplatePreviewStatus((prev) => ({
          ...prev,
          [templateId]: createTemplatePreviewStatus({ status: "ready", error: "" }),
        }));
        return;
      }

      setTemplatePreviewStatus((prev) => ({
        ...prev,
        [templateId]: createTemplatePreviewStatus({ status: "loading", error: "" }),
      }));

      try {
        const html = await generateTemplatePreviewHtml(safeTemplate);
        setTemplatePreviewCacheById((prev) => {
          if (prev[templateId]) return prev;
          return {
            ...prev,
            [templateId]: html,
          };
        });
        setTemplatePreviewStatus((prev) => ({
          ...prev,
          [templateId]: createTemplatePreviewStatus({ status: "ready", error: "" }),
        }));
      } catch (error) {
        setTemplatePreviewStatus((prev) => ({
          ...prev,
          [templateId]: createTemplatePreviewStatus({
            status: "error",
            error: getErrorMessage(
              error,
              "No se pudo generar la vista previa de esta plantilla."
            ),
          }),
        }));
      }
    },
    [templatePreviewCacheById]
  );

  const openModal = useCallback(
    (template) => {
      const safeTemplate = template && typeof template === "object" ? template : null;
      const templateId = String(safeTemplate?.id || "").trim();
      if (!safeTemplate || !templateId) return;

      setSelectedTemplate(safeTemplate);
      setIsTemplateModalOpen(true);
      resetTemplateFormState(safeTemplate);
      setTemplatePreviewStatus((prev) => ({
        ...prev,
        [templateId]: createTemplatePreviewStatus({ status: "loading", error: "" }),
      }));

      void (async () => {
        try {
          const fullTemplate = await getTemplateById(templateId);
          if (!fullTemplate) {
            void loadTemplatePreview(safeTemplate);
            return;
          }

          setSelectedTemplate((current) => {
            const currentId = String(current?.id || "").trim();
            if (currentId !== templateId) return current;
            return fullTemplate;
          });
          resetTemplateFormState(fullTemplate);
          void loadTemplatePreview(fullTemplate);
        } catch (error) {
          console.error("Error al cargar detalle de plantilla:", error);
          void loadTemplatePreview(safeTemplate);
        }
      })();
    },
    [loadTemplatePreview, resetTemplateFormState]
  );

  const closeModal = useCallback(() => {
    if (isOpeningTemplateEditor) return;
    setIsTemplateModalOpen(false);
    setSelectedTemplate(null);
    setTemplateFormState(TEMPLATE_FORM_STATE_INITIAL);
  }, [isOpeningTemplateEditor]);

  const openTemplateEditor = useCallback(async ({
    applyChanges,
    rawValues = {},
    galleryFilesByField = {},
  }) => {
    const templateId = String(selectedTemplate?.id || "").trim();
    if (!templateId || isOpeningTemplateEditor) return;

    setIsOpeningTemplateEditor(true);
    try {
      const result = await createDraftFromTemplateWithInput({
        template: selectedTemplate,
        userId: usuario?.uid,
        rawValues:
          rawValues && typeof rawValues === "object"
            ? rawValues
            : selectedTemplateFormState?.rawValues || {},
        galleryFilesByField,
        applyChanges: applyChanges === true,
      });
      const slug = String(result?.slug || "").trim();
      if (!slug) throw new Error("No se pudo crear el borrador de plantilla.");

      pushEditorBreadcrumb("abrir-plantilla", {
        slug,
        plantillaId: templateId,
        editor: "konva",
        source: applyChanges ? "template-modal-with-changes" : "template-modal-without-changes",
      });

      setIsTemplateModalOpen(false);
      setSelectedTemplate(null);
      setTemplateFormState(TEMPLATE_FORM_STATE_INITIAL);
      void abrirBorradorEnEditor(slug);
    } catch (error) {
      alert(
        getErrorMessage(
          error,
          "No se pudo abrir la plantilla en el editor."
        )
      );
      console.error(error);
    } finally {
      setIsOpeningTemplateEditor(false);
    }
  }, [
    abrirBorradorEnEditor,
    isOpeningTemplateEditor,
    selectedTemplate,
    selectedTemplateFormState?.rawValues,
    usuario?.uid,
  ]);

  const handleOpenEditorWithoutChanges = useCallback(async () => {
    await openTemplateEditor({
      applyChanges: false,
    });
  }, [openTemplateEditor]);

  const handleOpenEditorWithChanges = useCallback(async (payload) => {
    const safePayload = payload && typeof payload === "object" ? payload : {};
    await openTemplateEditor({
      applyChanges: true,
      rawValues:
        safePayload.rawValues && typeof safePayload.rawValues === "object"
          ? safePayload.rawValues
          : {},
      galleryFilesByField:
        safePayload.galleryFilesByField && typeof safePayload.galleryFilesByField === "object"
          ? safePayload.galleryFilesByField
          : {},
    });
  }, [openTemplateEditor]);

  const ensureDraftFlushBeforeCriticalAction = useCallback(
    async (reason) => {
      const safeSlug = sanitizeDraftSlug(slugInvitacion);
      if (!safeSlug || modoEditor !== "konva") {
        return { ok: true };
      }

      let result;

      if (
        editorSession.kind === "template" &&
        typeof window !== "undefined" &&
        typeof window.canvasEditor?.flushPersistenceNow === "function"
      ) {
        try {
          result = await window.canvasEditor.flushPersistenceNow({
            reason,
          });
        } catch (flushError) {
          result = {
            ok: false,
            reason: "direct-flush-failed",
            error: getErrorMessage(
              flushError,
              "No se pudo ejecutar el guardado inmediato de la plantilla."
            ),
          };
        }
      } else {
        result = await requestEditorDraftFlush({
          slug: safeSlug,
          reason,
          timeoutMs: 6000,
        });
      }

      if (result.ok) return result;

      const detail = String(result?.error || result?.reason || "").trim();
      const sourceLabel =
        editorSession.kind === "template" ? "la plantilla" : "el borrador";
      const message = detail
        ? `No se pudo confirmar el guardado reciente de ${sourceLabel} (${detail}). Intenta nuevamente.`
        : `No se pudo confirmar el guardado reciente de ${sourceLabel}. Intenta nuevamente.`;

      return {
        ok: false,
        error: message,
      };
    },
    [editorSession.kind, modoEditor, slugInvitacion]
  );

  const generarVistaPrevia = async () => {
    try {
      const flushResult = await ensureDraftFlushBeforeCriticalAction("preview-before-open");
      if (!flushResult.ok) {
        setPublicacionVistaPreviaError(flushResult.error || "");
        setMostrarVistaPrevia(false);
        return;
      }

      setHtmlVistaPrevia(null); // Reset del contenido
      setUrlPublicaVistaPrevia(null); // Reset del enlace publico
      setSlugPublicoVistaPrevia(null);
      setPuedeActualizarPublicacion(false);
      setPublicacionVistaPreviaError("");
      setPublicacionVistaPreviaOk("");
      setUrlPublicadaReciente(null);
      setMostrarVistaPrevia(true); // Abrir modal primero

      // Generar HTML para vista previa
      let data = null;
      if (editorSession.kind === "template") {
        const result = await getTemplateEditorDocument({
          templateId: slugInvitacion,
        });
        data =
          result?.editorDocument && typeof result.editorDocument === "object"
            ? result.editorDocument
            : null;
        if (!data) {
          alert("No se encontro la plantilla.");
          setMostrarVistaPrevia(false);
          return;
        }
      } else {
        const ref = doc(db, "borradores", slugInvitacion);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          alert("No se encontro el borrador");
          setMostrarVistaPrevia(false);
          return;
        }
        data = snap.data();
      }

      const liveObjetos =
        typeof window !== "undefined" && Array.isArray(window._objetosActuales)
          ? window._objetosActuales
          : null;
      const liveSecciones =
        typeof window !== "undefined" && Array.isArray(window._seccionesOrdenadas)
          ? window._seccionesOrdenadas
          : null;
      const liveRsvp =
        typeof window !== "undefined" &&
        window._rsvpConfigActual &&
        typeof window._rsvpConfigActual === "object"
          ? window._rsvpConfigActual
          : null;
      const liveGifts =
        typeof window !== "undefined" &&
        window._giftsConfigActual &&
        typeof window._giftsConfigActual === "object"
          ? window._giftsConfigActual
          : null;

      if (liveObjetos && liveSecciones) {
        data = {
          ...(data && typeof data === "object" ? data : {}),
          objetos: liveObjetos,
          secciones: liveSecciones,
          rsvp: liveRsvp,
          gifts: liveGifts,
        };
      }

      const renderState = normalizeDraftRenderState(data);
      const objetosBase = renderState.objetos;
      const secciones = renderState.secciones;
      const rawRsvp = renderState.rsvp || {};
      const rawGifts = renderState.gifts || null;
      const rsvpPreviewConfig = normalizeRsvpConfig(
        {
          ...rawRsvp,
          enabled: rawRsvp?.enabled !== false,
          title: rawRsvp?.title,
          subtitle: rawRsvp?.subtitle,
          buttonText: rawRsvp?.buttonText,
          primaryColor: rawRsvp?.primaryColor,
          sheetUrl: rawRsvp?.sheetUrl,
        },
        { forceEnabled: false }
      );
      const hayRegaloBoton = objetosBase.some((obj) => obj?.tipo === "regalo-boton");
      const giftPreviewConfig =
        hayRegaloBoton || (rawGifts && typeof rawGifts === "object")
          ? normalizeGiftConfig({
              ...(rawGifts && typeof rawGifts === "object" ? rawGifts : {}),
              enabled: rawGifts?.enabled !== false,
            })
          : null;
      let urlPublicaDetectada = "";
      let slugPublicoDetectado = "";
      const slugPublicoBorrador =
        editorSession.kind === "template"
          ? ""
          : String(data?.slugPublico || "").trim();
      let publicacionNoVigenteDetectada = false;

      if (editorSession.kind !== "template" && slugPublicoBorrador) {
        try {
          const snapPublicoPorSlug = await getDoc(doc(db, "publicadas", slugPublicoBorrador));
          if (snapPublicoPorSlug.exists()) {
            const dataPublicada = snapPublicoPorSlug.data() || {};
            if (isPublicacionActiva(dataPublicada)) {
              slugPublicoDetectado = slugPublicoBorrador;
              urlPublicaDetectada =
                String(dataPublicada?.urlPublica || "").trim() ||
                `https://reservaeldia.com.ar/i/${slugPublicoBorrador}`;
            } else {
              publicacionNoVigenteDetectada = true;
            }
          }
        } catch (_e) {}
      }

      if (editorSession.kind !== "template" && !urlPublicaDetectada && slugInvitacion) {
        try {
          const snapPublicoDirecto = await getDoc(doc(db, "publicadas", slugInvitacion));
          if (snapPublicoDirecto.exists()) {
            const dataPublicada = snapPublicoDirecto.data() || {};
            if (isPublicacionActiva(dataPublicada)) {
              slugPublicoDetectado = slugInvitacion;
              urlPublicaDetectada =
                String(dataPublicada?.urlPublica || "").trim() ||
                `https://reservaeldia.com.ar/i/${slugInvitacion}`;
            } else {
              publicacionNoVigenteDetectada = true;
            }
          }
        } catch (_e) {}
      }

      if (editorSession.kind !== "template" && !urlPublicaDetectada && slugInvitacion) {
        try {
          const qPublicadaPorOriginal = query(
            collection(db, "publicadas"),
            where("slugOriginal", "==", slugInvitacion),
            limit(1)
          );
          const snapPublicadaPorOriginal = await getDocs(qPublicadaPorOriginal);
          if (!snapPublicadaPorOriginal.empty) {
            const docPublicada = snapPublicadaPorOriginal.docs[0];
            const dataPublicada = docPublicada?.data() || {};
            if (isPublicacionActiva(dataPublicada)) {
              const slugPublicado = String(dataPublicada?.slug || docPublicada?.id || "").trim();
              slugPublicoDetectado = slugPublicado || "";
              urlPublicaDetectada =
                String(dataPublicada?.urlPublica || "").trim() ||
                (slugPublicado ? `https://reservaeldia.com.ar/i/${slugPublicado}` : "");
            } else {
              publicacionNoVigenteDetectada = true;
            }
          }
        } catch (_e) {}
      }

      const slugPublicoNormalizado =
        normalizePublicSlug(slugPublicoDetectado) ||
        normalizePublicSlug(urlPublicaDetectada) ||
        null;

      setUrlPublicaVistaPrevia(urlPublicaDetectada || null);
      setSlugPublicoVistaPrevia(slugPublicoNormalizado);
      setPuedeActualizarPublicacion(Boolean(slugPublicoNormalizado));
      if (publicacionNoVigenteDetectada && !slugPublicoNormalizado) {
        setPublicacionVistaPreviaError(
          "La publicacion anterior finalizo su vigencia. Puedes publicar nuevamente como nueva."
        );
      }
      const previewDebug = (() => {
        try {
          const qp = new URLSearchParams(window.location.search || "");
          return qp.get("previewDebug") === "1";
        } catch (_e) {
          return false;
        }
      })();

      // Debug summary of objects by section/type in the draft
      try {
        const resumen = {};
        objetosBase.forEach((o) => {
          const sec = String(o?.seccionId || "sin-seccion");
          if (!resumen[sec]) resumen[sec] = { total: 0, tipos: {} };
          resumen[sec].total += 1;
          const t = String(o?.tipo || "sin-tipo");
          resumen[sec].tipos[t] = (resumen[sec].tipos[t] || 0) + 1;
        });
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        const dpr = window.devicePixelRatio || 1;
        const ua = navigator.userAgent || "";
        const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
        const mobileViewport = vw <= 767;
        const desktopMobilePreview = mobileViewport && !mobileUA;

        const filas = Object.keys(resumen)
          .sort((a, b) => {
            const ta = resumen[a]?.total || 0;
            const tb = resumen[b]?.total || 0;
            if (tb !== ta) return tb - ta;
            return a.localeCompare(b);
          })
          .map((secId) => {
            const item = resumen[secId] || { total: 0, tipos: {} };
            const tiposTxt = Object.keys(item.tipos || {})
              .sort()
              .map((tipo) => `${tipo}:${item.tipos[tipo]}`)
              .join(", ");
            return `${secId} | total=${item.total} | tipos=${tiposTxt || "-"}`;
          });

        const header =
          `[PREVIEW] objetos por seccion (abierto)\n` +
          `viewport=${vw}x${vh} dpr=${Number(dpr).toFixed(2)} ` +
          `mobileViewport=${mobileViewport} desktopMobilePreview=${desktopMobilePreview} mobileUA=${mobileUA}\n` +
          `secciones=${Object.keys(resumen).length} objetos=${objetosBase.length}`;

        if (previewDebug) {
          console.log(`${header}\n${filas.join("\n")}`);
        }
      } catch (e) {
        if (previewDebug) {
          console.warn("[PREVIEW] no se pudo armar resumen de objetos", e);
        }
      }

      // Import HTML generation function
      const { generarHTMLDesdeSecciones } = await import("../../functions/src/utils/generarHTMLDesdeSecciones");
      const slugPreview = slugPublicoNormalizado || sanitizeDraftSlug(slugInvitacion) || "";
      const htmlGenerado = generarHTMLDesdeSecciones(
        secciones,
        objetosBase,
        rsvpPreviewConfig,
        {
          slug: slugPreview,
          isPreview: true,
          gifts: giftPreviewConfig,
        }
      );

      // DEBUG: inspect countdown props
      try {
        const cds = (objetosBase || []).filter(o => o?.tipo === "countdown");
      } catch (e) {
      }

      setHtmlVistaPrevia(htmlGenerado);
    } catch (error) {
      console.error("Error generando vista previa:", error);
      alert("No se pudo generar la vista previa");
      setMostrarVistaPrevia(false);
    }
  };

  const publicarDesdeVistaPrevia = async () => {
    if (editorSession.kind === "template") return;
    if (!slugInvitacion) return;

    const flushResult = await ensureDraftFlushBeforeCriticalAction("checkout-before-open");
    if (!flushResult.ok) {
      setPublicacionVistaPreviaError(flushResult.error || "");
      setPublicacionVistaPreviaOk("");
      setMostrarCheckoutPublicacion(false);
      return;
    }

    setPublicacionVistaPreviaError("");
    setPublicacionVistaPreviaOk("");
    setOperacionCheckoutPublicacion(puedeActualizarPublicacion ? "update" : "new");
    setMostrarCheckoutPublicacion(true);
  };

  const handleCheckoutPublished = useCallback((payload) => {
    const publicUrl = String(payload?.publicUrl || "").trim();
    const publicSlug =
      normalizePublicSlug(payload?.publicSlug) || parseSlugFromPublicUrl(publicUrl);

    if (publicUrl) {
      setUrlPublicaVistaPrevia(publicUrl);
      setUrlPublicadaReciente(publicUrl);
    }

    if (publicSlug) {
      setSlugPublicoVistaPrevia(publicSlug);
      setPuedeActualizarPublicacion(true);
    }

    setPublicacionVistaPreviaError("");
    setPublicacionVistaPreviaOk(
      payload?.operation === "update"
        ? "Invitacion actualizada correctamente."
        : "Invitacion publicada correctamente."
    );
  }, []);

  const handleCompleteProfile = async (payload) => {
    const upsertUserProfileCallable = httpsCallable(cloudFunctions, "upsertUserProfile");

    try {
      await upsertUserProfileCallable({
        ...payload,
        source: "profile-completion",
      });

      const auth = getAuth();
      if (auth.currentUser) {
        await auth.currentUser.reload();
      }

      setShowProfileCompletion(false);
    } catch (error) {
      throw new Error(
        getErrorMessage(error, "No se pudo actualizar tu perfil.")
      );
    }
  };

  
  const requestedRouteSlug = router.isReady
    ? sanitizeDraftSlug(getFirstQueryValue(router.query?.slug))
    : null;
  const requestedRouteTemplateId = router.isReady
    ? sanitizeDraftSlug(getFirstQueryValue(router.query?.templateId))
    : null;
  const requestedAdminView = router.isReady
    ? isTruthyQueryFlag(router.query?.adminView)
    : false;
  const isResolvingEditorRoute =
    router.isReady &&
    !slugInvitacion &&
    Boolean(requestedRouteSlug || requestedRouteTemplateId);
  const pendingEditorRouteLabel = requestedRouteTemplateId
    ? "Abriendo plantilla interna..."
    : requestedAdminView
      ? "Cargando vista administrativa del borrador..."
      : "Abriendo editor...";
  const isHomeView = !slugInvitacion && vista === "home" && !isResolvingEditorRoute;

  useEffect(() => {
    if (!isHomeView) return;
    setHomeViewReady(false);
    setHomeLoaderForcedDone(false);
  }, [isHomeView, tipoSeleccionado]);

  useEffect(() => {
    if (!isHomeView) {
      if (homeLoaderForceTimerRef.current) {
        clearTimeout(homeLoaderForceTimerRef.current);
        homeLoaderForceTimerRef.current = null;
      }
      setHomeLoaderForcedDone(false);
      return;
    }

    const waitingForHome = !homeViewReady;

    if (!waitingForHome) {
      if (homeLoaderForceTimerRef.current) {
        clearTimeout(homeLoaderForceTimerRef.current);
        homeLoaderForceTimerRef.current = null;
      }
      return;
    }

    if (homeLoaderForcedDone || homeLoaderForceTimerRef.current) return;

    homeLoaderForceTimerRef.current = setTimeout(() => {
      homeLoaderForceTimerRef.current = null;
      setHomeLoaderForcedDone(true);
      console.warn("[dashboard-home-loader] Timeout forzado:", {
        homeViewReady,
      });
    }, HOME_DASHBOARD_LOADER_MAX_MS);
  }, [
    homeLoaderForcedDone,
    homeViewReady,
    isHomeView,
  ]);

  // Listen custom event to open a draft
  useEffect(() => {

    const handleAbrirBorrador = (e) => {
      const { slug } = e.detail;
      if (!slug) return;

      pushEditorBreadcrumb("abrir-borrador-evento", {
        slug,
        editor: "konva",
      });
      void abrirBorradorEnEditor(slug);
    };


    window.addEventListener("abrir-borrador", handleAbrirBorrador);
    return () => {
      window.removeEventListener("abrir-borrador", handleAbrirBorrador);
    };


  }, [abrirBorradorEnEditor]);


  // cuando hay cambios en secciones
  useEffect(() => {
    if (!seccionActivaId && secciones.length > 0) {
      setSeccionActivaId(secciones[0].id);
    }
  }, [secciones]);


  useEffect(() => {
    const auth = getAuth();
    const getMyProfileStatusCallable = httpsCallable(
      cloudFunctions,
      "getMyProfileStatus"
    );
    let mounted = true;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      (async () => {
        if (!mounted) return;
        setCheckingAuth(true);

        if (!user) {
          if (!mounted) return;
          setShowProfileCompletion(false);
          setUsuario(null);
          setCheckingAuth(false);
          return;
        }

        const providerIds = (user.providerData || [])
          .map((provider) => provider?.providerId)
          .filter(Boolean);
        const hasPasswordProvider = providerIds.includes("password");
        const hasGoogleProvider = providerIds.includes("google.com");
        const hasOnlyPasswordProvider = hasPasswordProvider && !hasGoogleProvider;

        if (hasOnlyPasswordProvider && user.emailVerified !== true) {
          await signOut(auth);
          if (!mounted) return;
          setShowProfileCompletion(false);
          setUsuario(null);
          setCheckingAuth(false);
          router.replace("/?authNotice=email-not-verified");
          return;
        }

        try {
          await user.getIdToken();
          let result;
          try {
            result = await getMyProfileStatusCallable({});
          } catch {
            await user.getIdToken(true);
            await new Promise((resolve) => setTimeout(resolve, 700));
            result = await getMyProfileStatusCallable({});
          }
          const statusData = result?.data || {};

          if (statusData.profileComplete !== true) {
            const fallbackNames = splitDisplayName(
              statusData?.profile?.nombreCompleto || user.displayName || ""
            );

            setProfileInitialValues({
              nombre: statusData?.profile?.nombre || fallbackNames.nombre || "",
              apellido: statusData?.profile?.apellido || fallbackNames.apellido || "",
              fechaNacimiento: statusData?.profile?.fechaNacimiento || "",
              nombreCompleto:
                statusData?.profile?.nombreCompleto || user.displayName || "",
            });
            setShowProfileCompletion(true);
          } else {
            setShowProfileCompletion(false);
          }

          setUsuario(user);
        } catch (error) {
          console.error("Error validando estado de perfil:", error);
          await signOut(auth);
          if (!mounted) return;
          setShowProfileCompletion(false);
          setUsuario(null);
          router.replace("/?authNotice=profile-check-failed");
        } finally {
          if (mounted) {
            setCheckingAuth(false);
          }
        }
      })();
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (checkingAuth || slugInvitacion) return;
    if (vista !== "gestion") return;
    if (loadingAdminAccess) return;
    if (isSuperAdmin) return;

    setVista("home");
    alert("Solo superadmin puede acceder al tablero de gestion.");
  }, [
    checkingAuth,
    isSuperAdmin,
    loadingAdminAccess,
    slugInvitacion,
    vista,
  ]);

  const editorPreloadWarm =
    !slugInvitacion ||
    (editorPreloadState.slug === slugInvitacion &&
      editorPreloadState.status !== "idle");

  const editorRuntimeReady =
    !slugInvitacion ||
    (editorRuntimeState.slug === slugInvitacion &&
      editorRuntimeState.status === "ready");

  const shouldMountCanvasEditor =
    Boolean(slugInvitacion) && editorPreloadWarm;

  const showEditorStartupLoaderRaw =
    Boolean(slugInvitacion) && !editorRuntimeReady;

  useEffect(() => {
    const canShowLoader = Boolean(slugInvitacion);

    if (!canShowLoader) {
      if (editorLoaderHideTimerRef.current) {
        clearTimeout(editorLoaderHideTimerRef.current);
        editorLoaderHideTimerRef.current = null;
      }
      if (editorLoaderExitTimerRef.current) {
        clearTimeout(editorLoaderExitTimerRef.current);
        editorLoaderExitTimerRef.current = null;
      }
      editorLoaderStartedAtRef.current = 0;
      setHoldEditorStartupLoader(false);
      setRenderEditorStartupLoader(false);
      return;
    }

    if (showEditorStartupLoaderRaw) {
      if (editorLoaderHideTimerRef.current) {
        clearTimeout(editorLoaderHideTimerRef.current);
        editorLoaderHideTimerRef.current = null;
      }

      if (!editorLoaderStartedAtRef.current) {
        editorLoaderStartedAtRef.current = Date.now();
      }

      setHoldEditorStartupLoader(true);
      setRenderEditorStartupLoader(true);
      return;
    }

    if (!holdEditorStartupLoader) return;

    const elapsedMs = Date.now() - editorLoaderStartedAtRef.current;
    const remainingMs = Math.max(0, MIN_EDITOR_STARTUP_LOADER_MS - elapsedMs);

    if (remainingMs <= 0) {
      editorLoaderStartedAtRef.current = 0;
      setHoldEditorStartupLoader(false);
      return;
    }

    if (editorLoaderHideTimerRef.current) {
      clearTimeout(editorLoaderHideTimerRef.current);
    }

    editorLoaderHideTimerRef.current = setTimeout(() => {
      editorLoaderHideTimerRef.current = null;
      editorLoaderStartedAtRef.current = 0;
      setHoldEditorStartupLoader(false);
    }, remainingMs);

    return () => {
      if (editorLoaderHideTimerRef.current) {
        clearTimeout(editorLoaderHideTimerRef.current);
        editorLoaderHideTimerRef.current = null;
      }
    };
  }, [holdEditorStartupLoader, modoEditor, showEditorStartupLoaderRaw, slugInvitacion]);

  const showEditorStartupLoader = showEditorStartupLoaderRaw || holdEditorStartupLoader;
  const shouldRenderEditorStartupLoader =
    showEditorStartupLoader || renderEditorStartupLoader;
  const isEditorStartupLoaderExiting =
    !showEditorStartupLoader && shouldRenderEditorStartupLoader;

  useEffect(() => {
    if (showEditorStartupLoader) {
      if (editorLoaderExitTimerRef.current) {
        clearTimeout(editorLoaderExitTimerRef.current);
        editorLoaderExitTimerRef.current = null;
      }
      if (!renderEditorStartupLoader) {
        setRenderEditorStartupLoader(true);
      }
      return;
    }

    if (!renderEditorStartupLoader) return;

    if (editorLoaderExitTimerRef.current) {
      clearTimeout(editorLoaderExitTimerRef.current);
    }

    editorLoaderExitTimerRef.current = setTimeout(() => {
      editorLoaderExitTimerRef.current = null;
      setRenderEditorStartupLoader(false);
    }, EDITOR_STARTUP_LOADER_EXIT_MS);

    return () => {
      if (editorLoaderExitTimerRef.current) {
        clearTimeout(editorLoaderExitTimerRef.current);
        editorLoaderExitTimerRef.current = null;
      }
    };
  }, [renderEditorStartupLoader, showEditorStartupLoader]);

  const showHomeStartupLoader =
    isHomeView &&
    !homeLoaderForcedDone &&
    !homeViewReady;
  const shouldRenderHomeStartupLoader = showHomeStartupLoader || holdHomeStartupLoader;
  const isHomeStartupLoaderExiting =
    !showHomeStartupLoader && holdHomeStartupLoader;

  useEffect(() => {
    if (!shouldRenderHomeStartupLoader) return;
    if (typeof document === "undefined") return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyTouchAction = body.style.touchAction;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.touchAction = "none";

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.touchAction = prevBodyTouchAction;
    };
  }, [shouldRenderHomeStartupLoader]);

  useEffect(() => {
    if (showHomeStartupLoader) {
      if (homeLoaderHideTimerRef.current) {
        clearTimeout(homeLoaderHideTimerRef.current);
        homeLoaderHideTimerRef.current = null;
      }
      if (!holdHomeStartupLoader) {
        setHoldHomeStartupLoader(true);
      }
      return;
    }

    if (!holdHomeStartupLoader) return;

    if (homeLoaderHideTimerRef.current) {
      clearTimeout(homeLoaderHideTimerRef.current);
    }

    homeLoaderHideTimerRef.current = setTimeout(() => {
      homeLoaderHideTimerRef.current = null;
      setHoldHomeStartupLoader(false);
    }, HOME_DASHBOARD_LOADER_EXIT_MS);

    return () => {
      if (homeLoaderHideTimerRef.current) {
        clearTimeout(homeLoaderHideTimerRef.current);
        homeLoaderHideTimerRef.current = null;
      }
    };
  }, [holdHomeStartupLoader, showHomeStartupLoader]);


  if (checkingAuth) return null;
  if (!usuario) return null; // Seguridad por si no se redirige

  return (
    <>
      <DashboardLayout
      mostrarMiniToolbar={!!slugInvitacion && !isEditorReadOnly}
      seccionActivaId={seccionActivaId}
      modoSelector={!slugInvitacion && vista === "home" && !isResolvingEditorRoute}
      slugInvitacion={slugInvitacion}
      setSlugInvitacion={setSlugInvitacion}
      setModoEditor={setModoEditor}
      zoom={zoom}
      toggleZoom={toggleZoom}
      historialExternos={historialExternos}
      futurosExternos={futurosExternos}
      generarVistaPrevia={generarVistaPrevia}
      usuario={usuario}
      vista={vista}
      onCambiarVista={setVista}
      ocultarSidebar={
        vista === "publicadas" ||
        vista === "papelera" ||
        vista === "gestion" ||
        isEditorReadOnly ||
        isResolvingEditorRoute
      }
      canManageSite={canManageSite}
      isSuperAdmin={isSuperAdmin}
      loadingAdminAccess={loadingAdminAccess}
      lockMainScroll={shouldRenderHomeStartupLoader || isTemplateModalOpen}
      editorReadOnly={isEditorReadOnly}
      draftDisplayName={adminDraftView.draftName || templateWorkspaceView.draftName || ""}
      editorSession={editorSession}
      templateSessionMeta={templateWorkspaceView}
      ensureEditorFlushBeforeAction={ensureDraftFlushBeforeCriticalAction}
    >
      {editorIssueReport && (
        <EditorIssueBanner
          report={editorIssueReport}
          sending={sendingIssueReport}
          sendError={issueSendError}
          sentIssueId={sentIssueId}
          onDismiss={handleDismissEditorIssue}
          onCopy={handleCopyEditorIssue}
          onSend={handleSendEditorIssue}
        />
      )}
      {legacyDraftNotice && !slugInvitacion && (
        <div className="mx-4 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-[0_10px_28px_rgba(180,120,24,0.08)] sm:mx-6 lg:mx-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{legacyDraftNotice.title}</p>
              <p className="mt-1 text-amber-800/90">{legacyDraftNotice.body}</p>
            </div>
            <button
              type="button"
              onClick={() => setLegacyDraftNotice(null)}
              className="rounded-lg border border-amber-300 bg-white/80 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-white"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
      {!slugInvitacion &&
        adminDraftView.enabled &&
        adminDraftView.status === "loading" && (
          <div className="mx-4 mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm sm:mx-6 lg:mx-8">
            Cargando vista administrativa del borrador...
          </div>
        )}

      {isResolvingEditorRoute && (
        <div className="mx-4 mt-4 flex min-h-[280px] items-center justify-center rounded-[28px] border border-slate-200 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.06)] sm:mx-6 lg:mx-8">
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <div className="relative flex h-11 w-11 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full border border-[#6f3bc0]/25" />
              <span className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300/80 border-t-[#6f3bc0]" />
            </div>
            <p className="text-sm font-semibold text-slate-800">
              {pendingEditorRouteLabel}
            </p>
            <p className="max-w-md text-sm text-slate-500">
              Estamos preparando el canvas para evitar el salto visual del dashboard antes de entrar al editor.
            </p>
          </div>
        </div>
      )}
   

      {/* HOME view (selector oculto + bloques de borradores y plantillas) */}
      {isHomeView && (
        <div className="relative w-full px-4 pb-10 pt-4 sm:px-6 lg:px-8">
          {shouldRenderHomeStartupLoader && (
            <div
              className={
                "absolute inset-0 z-20 flex items-start justify-center rounded-2xl bg-gradient-to-b from-gray-50/80 via-gray-50/55 to-gray-50/30 pt-20 backdrop-blur-[1.5px] transition-all duration-300 ease-out " +
                (isHomeStartupLoaderExiting
                  ? "pointer-events-none opacity-0 backdrop-blur-0"
                  : "opacity-100")
              }
            >
              <div
                className={
                  "flex flex-col items-center gap-3 text-gray-600 transition-all duration-300 ease-out will-change-transform " +
                  (isHomeStartupLoaderExiting
                    ? "opacity-0 translate-y-7 scale-90 blur-[1.5px]"
                    : "opacity-100 translate-y-0 scale-100 blur-0")
                }
              >
                <div className="relative flex h-11 w-11 items-center justify-center">
                  <span className="absolute inset-0 animate-ping rounded-full border border-[#6f3bc0]/25" />
                  <span className="h-10 w-10 animate-spin rounded-full border-2 border-gray-300/80 border-t-[#6f3bc0]" />
                </div>
                <p className="text-sm font-medium tracking-[0.01em] text-gray-600/95">Afinando los detalles...</p>
              </div>
            </div>
          )}

          <div
            className={
              showHomeStartupLoader
                ? "pointer-events-none opacity-0"
                : "opacity-100 transition-opacity duration-200"
            }
          >
          <DashboardHomeView
            usuario={usuario}
            tipoInvitacion={tipoSeleccionado}
            isSuperAdmin={isSuperAdmin}
            onSelectTemplate={openModal}
            onReadyChange={setHomeViewReady}
          />
          </div>
        </div>
      )}

      {/* PUBLISHED view */}
      {!slugInvitacion && vista === "publicadas" && (
        <div className="w-full px-4 pb-8">
          <PublicadasGrid usuario={usuario} />
        </div>
      )}

      {!slugInvitacion && vista === "papelera" && (
        <div className="w-full px-4 pb-8">
          <DashboardTrashSection usuario={usuario} />
        </div>
      )}



      {/* Invitation editor */}
      {!slugInvitacion && vista === "gestion" && isSuperAdmin && (
        <div className="w-full px-4 pb-8">
          <SiteManagementBoard
            isSuperAdmin={isSuperAdmin}
            loadingAdminAccess={loadingAdminAccess}
          />
        </div>
      )}

      {slugInvitacion && (
        <ChunkErrorBoundary>
          <div className={shouldMountCanvasEditor ? "relative" : ""}>
            {shouldMountCanvasEditor && (
              <div
                className={
                  "transform-gpu transition-all duration-[920ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform " +
                  (showEditorStartupLoader
                    ? "pointer-events-none opacity-0 scale-[0.985] blur-[3px]"
                    : "opacity-100 scale-100 blur-0")
                }
                aria-hidden={showEditorStartupLoader ? "true" : undefined}
              >
                <CanvasEditor
                  slug={slugInvitacion}
                  editorSession={editorSession}
                  zoom={zoom}
                  onHistorialChange={setHistorialExternos}
                  onFuturosChange={setFuturosExternos}
                  userId={usuario?.uid}
                  secciones={[]}
                  onStartupStatusChange={handleEditorStartupStatusChange}
                  canManageSite={canManageSite && !isAdminReadOnlyView}
                  readOnly={isEditorReadOnly}
                  initialDraftData={isAdminReadOnlyView ? adminDraftView.draftData : null}
                  initialEditorData={
                    isAdminReadOnlyView
                      ? adminDraftView.draftData
                      : templateWorkspaceView.initialData || null
                  }
                />
              </div>
            )}

            {shouldRenderEditorStartupLoader && (
              <div className={shouldMountCanvasEditor ? "absolute inset-0 z-10" : ""}>
                <div
                  className={
                    "w-full transform-gpu transition-all duration-[920ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform " +
                    (isEditorStartupLoaderExiting
                      ? "pointer-events-none opacity-0 translate-y-10 scale-[1.03] blur-[2.5px]"
                      : "opacity-100 translate-y-0 scale-100 blur-0")
                  }
                >
                <EditorStartupLoader
                  preloadState={editorPreloadState}
                  runtimeState={editorRuntimeState}
                />
                </div>
              </div>
            )}
          </div>
        </ChunkErrorBoundary>
      )}



      <TemplatePreviewModal
        visible={isTemplateModalOpen}
        template={selectedTemplate}
        metadata={selectedTemplateMetadata}
        previewHtml={selectedTemplatePreviewHtml}
        previewStatus={selectedTemplatePreviewState}
        onClose={closeModal}
        onOpenEditorWithChanges={handleOpenEditorWithChanges}
        onOpenEditorWithoutChanges={handleOpenEditorWithoutChanges}
        formState={selectedTemplateFormState}
        onFormStateChange={(nextState) =>
          handleTemplateFormStateChange(selectedTemplateId, nextState)
        }
        openingEditor={isOpeningTemplateEditor}
      />

      {/* Modal de vista previa */}
      <ModalVistaPrevia
        visible={mostrarVistaPrevia}
        onClose={() => {
          setMostrarVistaPrevia(false);
          setMostrarCheckoutPublicacion(false);
          setHtmlVistaPrevia(null);
          setUrlPublicaVistaPrevia(null);
          setSlugPublicoVistaPrevia(null);
          setPuedeActualizarPublicacion(false);
          setPublicacionVistaPreviaError("");
          setPublicacionVistaPreviaOk("");
          setUrlPublicadaReciente(null);
        }}
        htmlContent={htmlVistaPrevia}
        publicUrl={urlPublicaVistaPrevia}
        onPublish={publicarDesdeVistaPrevia}
        showPublishActions={!isTemplateEditorSession}
        publishing={false}
        publishError={publicacionVistaPreviaError}
        publishSuccess={publicacionVistaPreviaOk}
        publishedUrl={urlPublicadaReciente}
        checkoutVisible={!isTemplateEditorSession && mostrarCheckoutPublicacion}
      />


      </DashboardLayout>

      <PublicationCheckoutModal
        visible={!isTemplateEditorSession && mostrarCheckoutPublicacion}
        onClose={() => setMostrarCheckoutPublicacion(false)}
        draftSlug={slugInvitacion}
        operation={operacionCheckoutPublicacion}
        currentPublicSlug={slugPublicoVistaPrevia || ""}
        currentPublicUrl={urlPublicaVistaPrevia || ""}
        onPublished={handleCheckoutPublished}
      />

      <ProfileCompletionModal
        visible={showProfileCompletion}
        mandatory
        title="Completa tu perfil"
        subtitle="Para seguir usando la app necesitamos nombre, apellido y fecha de nacimiento."
        initialValues={profileInitialValues}
        submitLabel="Guardar y continuar"
        onSubmit={handleCompleteProfile}
      />
    </>
  );
}
