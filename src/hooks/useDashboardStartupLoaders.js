import { useCallback, useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { GOOGLE_FONTS } from "@/config/fonts";
import { getErrorMessage } from "@/domain/dashboard/helpers";
import { pushEditorBreadcrumb } from "@/lib/monitoring/editorIssueReporter";

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
  if (
    typeof window === "undefined" ||
    window.__EDITOR_PRELOAD_DEBUG !== true
  ) {
    return;
  }

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
      const bySuffix =
        /\.(png|jpe?g|webp|gif|svg|avif)(\?|#|$)/i.test(normalized);
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

  for (let index = 0; index < total; index += IMAGE_PRELOAD_BATCH_SIZE) {
    const batch = uniqueUrls.slice(index, index + IMAGE_PRELOAD_BATCH_SIZE);
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

export function useDashboardStartupLoaders({
  slugInvitacion,
  isHomeView,
  homeResetKey,
}) {
  const [homeViewReady, setHomeViewReady] = useState(false);
  const [homeLoaderForcedDone, setHomeLoaderForcedDone] = useState(false);
  const [holdHomeStartupLoader, setHoldHomeStartupLoader] = useState(false);
  const [editorPreloadState, setEditorPreloadState] = useState(
    createEditorPreloadState()
  );
  const [editorRuntimeState, setEditorRuntimeState] = useState(
    createEditorRuntimeState()
  );
  const [holdEditorStartupLoader, setHoldEditorStartupLoader] = useState(false);
  const [renderEditorStartupLoader, setRenderEditorStartupLoader] =
    useState(false);

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
        const draftObjetos = Array.isArray(draftData?.objetos)
          ? draftData.objetos
          : [];
        const draftSecciones = Array.isArray(draftData?.secciones)
          ? draftData.secciones
          : [];

        const draftFonts = Array.from(
          new Set(
            draftObjetos
              .map((obj) =>
                typeof obj?.fontFamily === "string" ? obj.fontFamily.trim() : ""
              )
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

            const warmupResult = selectorWarmupOutcome?.value || {
              loaded: [],
              failed: [],
            };
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
            message:
              "No se pudieron precargar todos los recursos. Abriendo editor...",
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

  const handleEditorStartupStatusChange = useCallback(
    (statusPayload = {}) => {
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
    },
    [slugInvitacion]
  );

  useEffect(() => {
    if (!isHomeView) return;
    setHomeViewReady(false);
    setHomeLoaderForcedDone(false);
  }, [homeResetKey, isHomeView]);

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
  }, [homeLoaderForcedDone, homeViewReady, isHomeView]);

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
  }, [holdEditorStartupLoader, showEditorStartupLoaderRaw, slugInvitacion]);

  const showEditorStartupLoader =
    showEditorStartupLoaderRaw || holdEditorStartupLoader;
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
    isHomeView && !homeLoaderForcedDone && !homeViewReady;
  const shouldRenderHomeStartupLoader =
    showHomeStartupLoader || holdHomeStartupLoader;
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

  const handleHomeViewReadyChange = useCallback((value) => {
    setHomeViewReady(Boolean(value));
  }, []);

  return {
    editorPreloadState,
    editorRuntimeState,
    shouldMountCanvasEditor,
    showEditorStartupLoader,
    shouldRenderEditorStartupLoader,
    isEditorStartupLoaderExiting,
    showHomeStartupLoader,
    shouldRenderHomeStartupLoader,
    isHomeStartupLoaderExiting,
    handleEditorStartupStatusChange,
    handleHomeViewReadyChange,
  };
}
