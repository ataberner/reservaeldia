import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useRouter } from "next/router";
import DashboardLayout from '../components/DashboardLayout';
import DashboardHomeView from "@/components/dashboard/home/DashboardHomeView";
import DashboardTrashSection from "@/components/DashboardTrashSection";
import ModalVistaPrevia from '@/components/ModalVistaPrevia';
import TemplatePreviewModal from "@/components/TemplatePreviewModal";
import PublicationCheckoutModal from "@/components/payments/PublicationCheckoutModal";
import PublicadasGrid from "@/components/PublicadasGrid";
import dynamic from "next/dynamic";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useDashboardAuthGate } from "@/hooks/useDashboardAuthGate";
import { useDashboardEditorIssues } from "@/hooks/useDashboardEditorIssues";
import { useDashboardEditorRoute } from "@/hooks/useDashboardEditorRoute";
import { useDashboardPreviewPublication } from "@/hooks/useDashboardPreviewPublication";
import { useDashboardTemplateModal } from "@/hooks/useDashboardTemplateModal";
import SiteManagementBoard from "@/components/admin/SiteManagementBoard";
import ProfileCompletionModal from "@/lib/components/ProfileCompletionModal";
import ChunkErrorBoundary from "@/components/ChunkErrorBoundary";
import EditorIssueBanner from "@/components/editor/diagnostics/EditorIssueBanner";
import EditorStartupLoader from "@/components/editor/EditorStartupLoader";
import { GOOGLE_FONTS } from "@/config/fonts";
import { getErrorMessage } from "@/domain/dashboard/helpers";
import { pushEditorBreadcrumb } from "@/lib/monitoring/editorIssueReporter";
import { applyDefaultEditorConsoleDebugFlags } from "@/lib/monitoring/editorConsoleDebugFlags";
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

applyDefaultEditorConsoleDebugFlags();

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
  if (typeof window === "undefined" || window.__EDITOR_PRELOAD_DEBUG !== true) return;
  try {
    console.log("[editor-preload]", {
      step,
      ...payload,
    });
  } catch {}
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



export default function Dashboard() {
  const router = useRouter();
  const {
    usuario,
    checkingAuth,
    showProfileCompletion,
    profileInitialValues,
    handleCompleteProfile,
  } = useDashboardAuthGate({ router });
  const { loadingAdminAccess, isSuperAdmin, canManageSite } =
    useAdminAccess(usuario);
  const {
    slugInvitacion,
    setSlugInvitacion,
    modoEditor,
    setModoEditor,
    vista,
    setVista,
    legacyDraftNotice,
    setLegacyDraftNotice,
    adminDraftView,
    templateWorkspaceView,
    editorSession,
    isAdminReadOnlyView,
    isTemplateWorkspaceReadOnly,
    isEditorReadOnly,
    isTemplateEditorSession,
    requestedRouteSlug,
    isResolvingEditorRoute,
    pendingEditorRouteLabel,
    handleOpenTemplateSession,
    abrirBorradorEnEditor,
  } = useDashboardEditorRoute({
    router,
    checkingAuth,
    loadingAdminAccess,
    usuarioUid: usuario?.uid,
    isSuperAdmin,
    canManageSite,
  });
  const {
    selectedTemplate,
    selectedTemplateId,
    selectedTemplateMetadata,
    selectedTemplatePreviewHtml,
    selectedTemplatePreviewState,
    selectedTemplateFormState,
    isTemplateModalOpen,
    isOpeningTemplateEditor,
    openModal,
    closeModal,
    handleTemplateFormStateChange,
    handleOpenEditorWithoutChanges,
    handleOpenEditorWithChanges,
  } = useDashboardTemplateModal({
    userUid: usuario?.uid,
    openDraftInEditor: abrirBorradorEnEditor,
  });
  const {
    editorIssueReport,
    sendingIssueReport,
    issueSendError,
    sentIssueId,
    handleDismissEditorIssue,
    handleCopyEditorIssue,
    handleSendEditorIssue,
  } = useDashboardEditorIssues({
    routerReady: router.isReady,
    querySlug: requestedRouteSlug,
    activeSlug: slugInvitacion,
    vista,
    modoEditor,
  });
  const {
    mostrarVistaPrevia,
    htmlVistaPrevia,
    urlPublicaVistaPrevia,
    slugPublicoVistaPrevia,
    publicacionVistaPreviaError,
    publicacionVistaPreviaOk,
    publishValidationResult,
    publishValidationPending,
    urlPublicadaReciente,
    mostrarCheckoutPublicacion,
    operacionCheckoutPublicacion,
    previewDisplayUrl,
    ensureDraftFlushBeforeCriticalAction,
    generarVistaPrevia,
    publicarDesdeVistaPrevia,
    handleCheckoutPublished,
    closePreview,
    closeCheckout,
  } = useDashboardPreviewPublication({
    slugInvitacion,
    modoEditor,
    editorSession,
  });
  const [tipoSeleccionado, setTipoSeleccionado] = useState(DEFAULT_TIPO_INVITACION);
  const [homeViewReady, setHomeViewReady] = useState(false);
  const [homeLoaderForcedDone, setHomeLoaderForcedDone] = useState(false);
  const [holdHomeStartupLoader, setHoldHomeStartupLoader] = useState(false);
  const [zoom, setZoom] = useState(0.8);
  const [secciones, setSecciones] = useState([]);
  const [seccionActivaId, setSeccionActivaId] = useState(null);
  const [historialExternos, setHistorialExternos] = useState([]);
  const [futurosExternos, setFuturosExternos] = useState([]);
  const [editorPreloadState, setEditorPreloadState] = useState(
    createEditorPreloadState()
  );
  const [editorRuntimeState, setEditorRuntimeState] = useState(
    createEditorRuntimeState()
  );
  const [holdEditorStartupLoader, setHoldEditorStartupLoader] = useState(false);
  const [renderEditorStartupLoader, setRenderEditorStartupLoader] = useState(false);
  const editorLoaderStartedAtRef = useRef(0);
  const editorLoaderHideTimerRef = useRef(null);
  const editorLoaderExitTimerRef = useRef(null);
  const homeLoaderForceTimerRef = useRef(null);
  const homeLoaderHideTimerRef = useRef(null);

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

  const toggleZoom = () => {
    setZoom((prev) => (prev === 1 ? 0.8 : 1));
  };

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
      onOpenTemplateSession={handleOpenTemplateSession}
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
        onClose={closePreview}
        htmlContent={htmlVistaPrevia}
        publicUrl={urlPublicaVistaPrevia}
        previewDisplayUrl={previewDisplayUrl}
        onPublish={publicarDesdeVistaPrevia}
        showPublishActions={!isTemplateEditorSession}
        publishing={false}
        publishError={publicacionVistaPreviaError}
        publishSuccess={publicacionVistaPreviaOk}
        publishedUrl={urlPublicadaReciente}
        checkoutVisible={!isTemplateEditorSession && mostrarCheckoutPublicacion}
        publishValidation={publishValidationResult}
        publishValidationPending={publishValidationPending}
      />


      </DashboardLayout>

      <PublicationCheckoutModal
        visible={!isTemplateEditorSession && mostrarCheckoutPublicacion}
        onClose={closeCheckout}
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
