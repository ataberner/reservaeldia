import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, query, where, doc, getDoc, getDocs, limit } from 'firebase/firestore';
import { db, functions as cloudFunctions } from '../firebase';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { useRouter } from "next/router";
import DashboardLayout from '../components/DashboardLayout';
import TipoSelector from '../components/TipoSelector';
import PlantillaGrid from '../components/PlantillaGrid';
import BorradoresGrid from '@/components/BorradoresGrid';
import ModalVistaPrevia from '@/components/ModalVistaPrevia';
import PublicadasGrid from "@/components/PublicadasGrid";
import { httpsCallable } from "firebase/functions";
import dynamic from "next/dynamic";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import SiteManagementBoard from "@/components/admin/SiteManagementBoard";
import ProfileCompletionModal from "@/lib/components/ProfileCompletionModal";
import ChunkErrorBoundary from "@/components/ChunkErrorBoundary";
import EditorIssueBanner from "@/components/editor/diagnostics/EditorIssueBanner";
import EditorStartupLoader from "@/components/editor/EditorStartupLoader";
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
const SHOW_TIPO_SELECTOR = false;
const DEFAULT_TIPO_INVITACION = "boda";
const IMAGE_PRELOAD_TIMEOUT_MS = 15000;
const IMAGE_PRELOAD_BATCH_SIZE = 6;
const FONT_PRELOAD_TIMEOUT_MS = 40000;
const TOTAL_PRELOAD_TIMEOUT_MS = 90000;
const SELECTOR_FONT_WARMUP_TIMEOUT_MS = 35000;
const MIN_EDITOR_STARTUP_LOADER_MS = 1800;
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
  const [plantillas, setPlantillas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [urlIframe, setUrlIframe] = useState(null);
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
  const [publicandoDesdeVistaPrevia, setPublicandoDesdeVistaPrevia] = useState(false);
  const [publicacionVistaPreviaError, setPublicacionVistaPreviaError] = useState("");
  const [publicacionVistaPreviaOk, setPublicacionVistaPreviaOk] = useState("");
  const [urlPublicadaReciente, setUrlPublicadaReciente] = useState(null);
  const [vista, setVista] = useState("home");
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
  const attemptedAutoSendRef = useRef(new Set());
  const editorLoaderStartedAtRef = useRef(0);
  const editorLoaderHideTimerRef = useRef(null);
  const router = useRouter();
  const { loadingAdminAccess, isSuperAdmin, canManageSite } =
    useAdminAccess(usuario);

  useEffect(() => {
    return () => {
      if (editorLoaderHideTimerRef.current) {
        clearTimeout(editorLoaderHideTimerRef.current);
        editorLoaderHideTimerRef.current = null;
      }
    };
  }, []);


  // Sync ?slug=... with local state (always Konva)
  useEffect(() => {
    if (!router.isReady) return;

    const slugParam = router.query?.slug;
    const slugURL = typeof slugParam === "string" ? slugParam : null;

    if (slugURL) {
      if (slugInvitacion !== slugURL) {
        setSlugInvitacion(slugURL);
      }
      if (modoEditor !== "konva") {
        setModoEditor("konva");
      }
      setVista((prev) => (prev === "editor" ? prev : "editor"));
      return;
    }

    if (slugInvitacion) {
      setSlugInvitacion(null);
    }
    if (modoEditor) {
      setModoEditor(null);
    }
    setVista((prev) => (prev === "editor" ? "home" : prev));
  }, [router.isReady, router.query?.slug]);

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
    const slugQuery = typeof router.query?.slug === "string" ? router.query.slug : null;
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
    if (!slugInvitacion || modoEditor === "iframe") {
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
  }, [slugInvitacion, modoEditor]);

  useEffect(() => {
    if (!slugInvitacion || modoEditor === "iframe") {
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
  }, [slugInvitacion, modoEditor]);

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
    (slug, editor = "konva") => {
      if (!slug) return;

      const editorNormalizado = editor === "iframe" ? "iframe" : "konva";
      setSlugInvitacion(slug);

      if (editorNormalizado === "konva") {
        setUrlIframe(null);
        setModoEditor("konva");
      } else {
        const url = `https://us-central1-reservaeldia-7a440.cloudfunctions.net/verInvitacion?slug=${slug}`;
        setUrlIframe(url);
        setModoEditor("iframe");
      }

      setVista("editor");
      router.replace(
        { pathname: "/dashboard", query: { slug } },
        undefined,
        { shallow: true }
      );
    },
    [router]
  );
  

  const generarVistaPrevia = async () => {
    try {
      setHtmlVistaPrevia(null); // Reset del contenido
      setUrlPublicaVistaPrevia(null); // Reset del enlace publico
      setSlugPublicoVistaPrevia(null);
      setPublicacionVistaPreviaError("");
      setPublicacionVistaPreviaOk("");
      setUrlPublicadaReciente(null);
      setMostrarVistaPrevia(true); // Abrir modal primero

      // Generar HTML para vista previa
      const ref = doc(db, "borradores", slugInvitacion);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        alert("No se encontro el borrador");
        setMostrarVistaPrevia(false);
        return;
      }

      const data = snap.data();
      const objetosBase = data?.objetos || [];
      const secciones = data?.secciones || [];
      let urlPublicaDetectada = "";
      let slugPublicoDetectado = "";
      const slugPublicoBorrador = String(data?.slugPublico || "").trim();

      if (slugPublicoBorrador) {
        try {
          const snapPublicoPorSlug = await getDoc(doc(db, "publicadas", slugPublicoBorrador));
          if (snapPublicoPorSlug.exists()) {
            const dataPublicada = snapPublicoPorSlug.data() || {};
            slugPublicoDetectado = slugPublicoBorrador;
            urlPublicaDetectada =
              String(dataPublicada?.urlPublica || "").trim() ||
              `https://reservaeldia.com.ar/i/${slugPublicoBorrador}`;
          }
        } catch (_e) {}
      }

      if (!urlPublicaDetectada && slugInvitacion) {
        try {
          const snapPublicoDirecto = await getDoc(doc(db, "publicadas", slugInvitacion));
          if (snapPublicoDirecto.exists()) {
            const dataPublicada = snapPublicoDirecto.data() || {};
            slugPublicoDetectado = slugInvitacion;
            urlPublicaDetectada =
              String(dataPublicada?.urlPublica || "").trim() ||
              `https://reservaeldia.com.ar/i/${slugInvitacion}`;
          }
        } catch (_e) {}
      }

      if (!urlPublicaDetectada && slugInvitacion) {
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
            const slugPublicado = String(dataPublicada?.slug || docPublicada?.id || "").trim();
            slugPublicoDetectado = slugPublicado || "";
            urlPublicaDetectada =
              String(dataPublicada?.urlPublica || "").trim() ||
              (slugPublicado ? `https://reservaeldia.com.ar/i/${slugPublicado}` : "");
          }
        } catch (_e) {}
      }

      setUrlPublicaVistaPrevia(urlPublicaDetectada || null);
      setSlugPublicoVistaPrevia(slugPublicoDetectado || null);
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
      const htmlGenerado = generarHTMLDesdeSecciones(secciones, objetosBase);

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

  const parseSlugFromPublicUrl = (urlValue) => {
    const raw = String(urlValue || "").trim();
    if (!raw) return null;

    try {
      const parsed = new URL(raw);
      const segments = parsed.pathname.split("/").filter(Boolean);
      const iIndex = segments.indexOf("i");
      if (iIndex >= 0 && segments[iIndex + 1]) return segments[iIndex + 1];
      return segments[segments.length - 1] || null;
    } catch (_e) {
      return null;
    }
  };

  const publicarDesdeVistaPrevia = async () => {
    if (!slugInvitacion || publicandoDesdeVistaPrevia) return;

    setPublicandoDesdeVistaPrevia(true);
    setPublicacionVistaPreviaError("");
    setPublicacionVistaPreviaOk("");

    try {
      const publicarInvitacionCallable = httpsCallable(cloudFunctions, "publicarInvitacion");
      const payload = slugPublicoVistaPrevia
        ? { slug: slugInvitacion, slugPublico: slugPublicoVistaPrevia }
        : { slug: slugInvitacion };

      const result = await publicarInvitacionCallable(payload);
      const url = String(result?.data?.url || "").trim();
      if (!url) {
        throw new Error("No se recibio la URL publica");
      }

      const slugPublicado = parseSlugFromPublicUrl(url) || slugPublicoVistaPrevia || null;

      setUrlPublicaVistaPrevia(url);
      setUrlPublicadaReciente(url);
      setSlugPublicoVistaPrevia(slugPublicado);
      setPublicacionVistaPreviaOk(
        slugPublicoVistaPrevia
          ? "Invitacion actualizada correctamente."
          : "Invitacion publicada correctamente."
      );
    } catch (error) {
      console.error("Error publicando desde vista previa:", error);
      setPublicacionVistaPreviaError(
        getErrorMessage(error, "No se pudo publicar la invitacion.")
      );
    } finally {
      setPublicandoDesdeVistaPrevia(false);
    }
  };

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

  

  // Load templates by type
  useEffect(() => {
    const fetchPlantillas = async () => {
      if (!tipoSeleccionado) return;

      setLoading(true);
      try {
        const q = query(
          collection(db, 'plantillas'),
          where('tipo', '==', tipoSeleccionado)
        );
        const snapshot = await getDocs(q);
        const datos = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));
        setPlantillas(datos);
      } catch (err) {
        console.error('Error al cargar plantillas:', err);
        setPlantillas([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPlantillas();
  }, [tipoSeleccionado]);

  // Listen custom event to open a draft
  useEffect(() => {

    const handleAbrirBorrador = (e) => {
      const { slug, editor } = e.detail;
      if (!slug) return;

      // Safe fallback: only "iframe" keeps iframe mode, otherwise Konva.
      const editorNormalizado = editor === "iframe" ? "iframe" : "konva";
      pushEditorBreadcrumb("abrir-borrador-evento", {
        slug,
        editor: editorNormalizado,
      });
      abrirBorradorEnEditor(slug, editorNormalizado);
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
    alert("No tenes permisos para acceder al tablero de gestion.");
  }, [
    checkingAuth,
    isSuperAdmin,
    loadingAdminAccess,
    slugInvitacion,
    vista,
  ]);

  const editorPreloadReady =
    !slugInvitacion ||
    modoEditor === "iframe" ||
    (editorPreloadState.slug === slugInvitacion &&
      editorPreloadState.status === "done");

  const editorRuntimeReady =
    !slugInvitacion ||
    modoEditor === "iframe" ||
    (editorRuntimeState.slug === slugInvitacion &&
      editorRuntimeState.status === "ready");

  const shouldMountCanvasEditor =
    Boolean(slugInvitacion) &&
    modoEditor !== "iframe" &&
    editorPreloadReady;

  const showEditorStartupLoaderRaw =
    Boolean(slugInvitacion) &&
    modoEditor !== "iframe" &&
    (!editorPreloadReady || !editorRuntimeReady);

  useEffect(() => {
    const canShowLoader = Boolean(slugInvitacion) && modoEditor !== "iframe";

    if (!canShowLoader) {
      if (editorLoaderHideTimerRef.current) {
        clearTimeout(editorLoaderHideTimerRef.current);
        editorLoaderHideTimerRef.current = null;
      }
      editorLoaderStartedAtRef.current = 0;
      setHoldEditorStartupLoader(false);
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


  if (checkingAuth) return <p>Cargando...</p>;
  if (!usuario) return null; // Seguridad por si no se redirige

  return (
    <>
      <DashboardLayout
      mostrarMiniToolbar={!!slugInvitacion}
      seccionActivaId={seccionActivaId}
      modoSelector={!slugInvitacion && vista === "home"}
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
      ocultarSidebar={vista === "publicadas" || vista === "gestion"}
      canManageSite={canManageSite}
      isSuperAdmin={isSuperAdmin}
      loadingAdminAccess={loadingAdminAccess}
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
   

      {/* HOME view (selector oculto + bloques de borradores y plantillas) */}
      {!slugInvitacion && vista === "home" && (
        <div className="w-full px-4 pb-10 pt-4 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl space-y-8">
            {SHOW_TIPO_SELECTOR && (
              <TipoSelector onSeleccionarTipo={setTipoSeleccionado} />
            )}

            <section className="rounded-2xl border border-[#e9dcfb] bg-gradient-to-br from-white via-[#faf6ff] to-[#f5f9ff] p-4 sm:p-6">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">
                Tu espacio
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-gray-900">Borradores</h2>
              <p className="mt-1 text-sm text-gray-600">
                Continua editando tus invitaciones donde las dejaste.
              </p>

              <div className="mt-5">
                <BorradoresGrid
                  mostrarTitulo={false}
                  emptyMessage="Todavia no creaste borradores. Elige una plantilla para comenzar."
                />
              </div>
            </section>

            <section className="rounded-2xl border border-[#e6e6ef] bg-gradient-to-br from-white via-[#f9f8ff] to-[#f4f8ff] p-4 sm:p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">
                    Coleccion
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-gray-900">
                    Plantillas de boda
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Elige una tarjeta base para empezar tu diseno.
                  </p>
                </div>
                <span className="rounded-full border border-[#ddd2f5] bg-white/80 px-3 py-1 text-xs font-medium text-[#6f3bc0]">
                  Bodas
                </span>
              </div>

              <div className="mt-5">
                {loading ? (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div
                        key={`skeleton-plantilla-${index}`}
                        className="overflow-hidden rounded-xl border border-gray-200 bg-white"
                      >
                        <div className="aspect-square animate-pulse bg-gray-100" />
                        <div className="space-y-2 p-3">
                          <div className="h-3 animate-pulse rounded bg-gray-100" />
                          <div className="h-8 animate-pulse rounded-full bg-gray-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <PlantillaGrid
                    plantillas={plantillas}
                    isSuperAdmin={isSuperAdmin}
                    onPlantillaBorrada={(plantillaId) => {
                      setPlantillas((prev) => prev.filter((p) => p.id !== plantillaId));
                    }}
                    onSeleccionarPlantilla={async (slug, plantilla) => {
                      try {
                        pushEditorBreadcrumb("abrir-plantilla", {
                          slug,
                          plantillaId: plantilla?.id || null,
                          editor: plantilla?.editor || null,
                        });
                        abrirBorradorEnEditor(slug, plantilla?.editor);
                      } catch (error) {
                        alert("Error al copiar la plantilla");
                        console.error(error);
                      }
                    }}
                  />
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* PUBLISHED view */}
      {!slugInvitacion && vista === "publicadas" && (
        <div className="w-full px-4 pb-8">
          <PublicadasGrid usuario={usuario} />
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
        <>
          {modoEditor !== "iframe" && (
            <ChunkErrorBoundary>
              <div className={shouldMountCanvasEditor ? "relative" : ""}>
                {shouldMountCanvasEditor && (
                  <div
                    className={showEditorStartupLoader
                      ? "pointer-events-none opacity-0"
                      : "opacity-100 transition-opacity duration-300"}
                    aria-hidden={showEditorStartupLoader ? "true" : undefined}
                  >
                    <CanvasEditor
                      slug={slugInvitacion}
                      zoom={zoom}
                      onHistorialChange={setHistorialExternos}
                      onFuturosChange={setFuturosExternos}
                      userId={usuario?.uid}
                      secciones={[]}
                      onStartupStatusChange={handleEditorStartupStatusChange}
                    />
                  </div>
                )}

                {showEditorStartupLoader && (
                  <div className={shouldMountCanvasEditor ? "absolute inset-0 z-10" : ""}>
                    <EditorStartupLoader
                      preloadState={editorPreloadState}
                      runtimeState={editorRuntimeState}
                    />
                  </div>
                )}
              </div>
            </ChunkErrorBoundary>
          )}

          {modoEditor === "iframe" && (
            <div
              className="flex justify-center items-start"
              style={{
                backgroundColor: zoom < 1 ? "#e5e5e5" : "transparent",
                overflow: "auto",
                borderRadius: "16px",
              }}
            >
              <div
                style={{
                  ...(zoom < 1
                    ? { transform: `scale(0.8)`, transformOrigin: "top center", width: "800px" }
                    : { width: "100%" }),
                }}
              >
                <iframe
                  src={urlIframe}
                  width="100%"
                  height="1000"
                  style={{
                    border: "none",
                    borderRadius: "16px",
                    pointerEvents: "auto",
                    display: "block",
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}



      {/* Modal de vista previa */}
      <ModalVistaPrevia
        visible={mostrarVistaPrevia}
        onClose={() => {
          setMostrarVistaPrevia(false);
          setHtmlVistaPrevia(null);
          setUrlPublicaVistaPrevia(null);
          setSlugPublicoVistaPrevia(null);
          setPublicandoDesdeVistaPrevia(false);
          setPublicacionVistaPreviaError("");
          setPublicacionVistaPreviaOk("");
          setUrlPublicadaReciente(null);
        }}
        htmlContent={htmlVistaPrevia}
        publicUrl={urlPublicaVistaPrevia}
        onPublish={publicarDesdeVistaPrevia}
        publishing={publicandoDesdeVistaPrevia}
        publishError={publicacionVistaPreviaError}
        publishSuccess={publicacionVistaPreviaOk}
        publishedUrl={urlPublicadaReciente}
      />


      </DashboardLayout>

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

