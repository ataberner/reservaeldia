// src/components/editor/persistence/useBorradorSync.js
import { useCallback, useEffect, useRef } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { db, storage } from "@/firebase";
import { normalizeRsvpConfig } from "@/domain/rsvp/config";
import { normalizeInvitationType } from "@/domain/invitationTypes";
import {
  buildDraftContentMeta,
  normalizeDraftRenderState,
} from "@/domain/drafts/sourceOfTruth";
import {
  captureEditorIssue,
  pushEditorBreadcrumb,
} from "@/lib/monitoring/editorIssueReporter";

const PERSIST_DEBOUNCE_MS = 500;
const DRAFT_FLUSH_REQUEST_EVENT = "editor:draft-flush:request";
const DRAFT_FLUSH_RESULT_EVENT = "editor:draft-flush:result";

function parseStorageLocationFromUrl(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return null;

  try {
    const url = new URL(value);

    if (
      url.hostname === "firebasestorage.googleapis.com" ||
      url.hostname.endsWith(".firebasestorage.app")
    ) {
      const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/i);
      if (!match) return null;

      const bucketName = decodeURIComponent(match[1] || "");
      const path = decodeURIComponent(match[2] || "");
      if (!bucketName || !path) return null;
      return { bucketName, path };
    }

    if (url.hostname === "storage.googleapis.com") {
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length < 2) return null;

      const bucketName = decodeURIComponent(segments[0] || "");
      const path = decodeURIComponent(segments.slice(1).join("/"));
      if (!bucketName || !path) return null;
      return { bucketName, path };
    }

    return null;
  } catch {
    return null;
  }
}

async function refreshStorageUrl(value, cache) {
  const location = parseStorageLocationFromUrl(value);
  if (!location) return value;

  const cacheKey = `${location.bucketName}/${location.path}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  try {
    const gsUrl = `gs://${location.bucketName}/${location.path}`;
    const freshUrl = await getDownloadURL(storageRef(storage, gsUrl));
    cache.set(cacheKey, freshUrl);
    return freshUrl;
  } catch (error) {
    pushEditorBreadcrumb("storage-url-refresh-failed", {
      code: error?.code || null,
      bucketName: location.bucketName,
      path: location.path,
    });
    // Mantener la URL original evita "romper" plantillas compartidas
    // cuando el SDK no puede refrescar el token por reglas/bucket.
    cache.set(cacheKey, value);
    return value;
  }
}

async function refreshUrlsDeep(value, cache) {
  if (typeof value === "string") {
    return refreshStorageUrl(value, cache);
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => refreshUrlsDeep(item, cache)));
  }

  if (value && typeof value === "object") {
    const pairs = await Promise.all(
      Object.entries(value).map(async ([key, nested]) => {
        const refreshed = await refreshUrlsDeep(nested, cache);
        return [key, refreshed];
      })
    );
    return Object.fromEntries(pairs);
  }

  return value;
}

function isMobileRuntime() {
  if (typeof window === "undefined") return false;
  const coarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const ua = String(window.navigator?.userAgent || "");
  const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  return coarsePointer || uaMobile;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeFlushRequestDetail(detail) {
  const safeDetail = detail && typeof detail === "object" ? detail : {};
  const requestId = normalizeText(safeDetail.requestId);
  const slug = normalizeText(safeDetail.slug);
  const reason = normalizeText(safeDetail.reason) || "manual-flush";
  return { requestId, slug, reason };
}

/**
 * Hook de sincronizacion Firestore para el borrador (carga + guardado con debounce).
 * Incluye flush inmediato para acciones criticas (preview/publicacion).
 */
export default function useBorradorSync({
  slug,
  userId,
  readOnly = false,
  initialDraftData = null,

  // estado actual
  objetos,
  secciones,
  rsvp,
  cargado,

  // setters
  setObjetos,
  setSecciones,
  setRsvp,
  setCargado,
  setSeccionActivaId,
  onDraftLoaded,

  // refs / helpers que ya existen en CanvasEditor
  ignoreNextUpdateRef,
  stageRef,

  // helpers de tu layout actual
  normalizarAltoModo,
  validarPuntosLinea,

  // constantes
  ALTURA_PANTALLA_EDITOR,
}) {
  const skipNextPersistRef = useRef(true);
  const persistTimeoutRef = useRef(null);
  const persistInFlightRef = useRef(null);
  const latestStateRef = useRef({
    slug: null,
    userId: null,
    objetos: [],
    secciones: [],
    rsvp: null,
    cargado: false,
  });
  latestStateRef.current = {
    slug,
    userId,
    objetos,
    secciones,
    rsvp,
    cargado,
  };

  // helper: limpiar undefined recursivo
  const limpiarUndefined = useCallback((obj) => {
    if (Array.isArray(obj)) return obj.map(limpiarUndefined);

    if (obj !== null && typeof obj === "object") {
      const objLimpio = {};
      Object.keys(obj).forEach((key) => {
        const valor = obj[key];
        if (valor !== undefined) objLimpio[key] = limpiarUndefined(valor);
      });
      return objLimpio;
    }

    return obj;
  }, []);

  const persistDraftNow = useCallback(
    async ({ reason = "autosave", immediate = false } = {}) => {
      const state = latestStateRef.current;
      const safeSlug = normalizeText(state.slug);

      if (readOnly) {
        return {
          ok: false,
          reason: "read-only",
          error: "El borrador esta abierto en modo solo lectura.",
        };
      }

      if (!safeSlug) {
        return {
          ok: false,
          reason: "missing-slug",
          error: "Slug de borrador no disponible.",
        };
      }

      if (!state.cargado) {
        return {
          ok: false,
          reason: "draft-not-loaded",
          error: "El borrador todavia no termino de cargar.",
        };
      }

      if (window._resizeData?.isResizing) {
        return {
          ok: false,
          reason: "resize-in-progress",
          error: "Espera a que termine el ajuste de tamano en curso.",
        };
      }

      if (persistInFlightRef.current) {
        try {
          await persistInFlightRef.current;
        } catch {
          // Si una persistencia previa falla, continuamos con el siguiente intento.
        }
      }

      const persistPromise = (async () => {
        const rawObjetos = Array.isArray(state.objetos) ? state.objetos : [];
        const rawSecciones = Array.isArray(state.secciones) ? state.secciones : [];
        const rawRsvp =
          state.rsvp && typeof state.rsvp === "object"
            ? state.rsvp
            : null;

        // Validacion: lineas + normalizacion de textos
        const objetosValidados = rawObjetos.map((obj) => {
          if (obj?.tipo === "forma" && obj?.figura === "line") {
            return validarPuntosLinea(obj);
          }

          if (obj?.tipo === "texto") {
            return {
              ...obj,
              color: obj.colorTexto || obj.color || obj.fill || "#000000",
              stroke: obj.stroke || null,
              strokeWidth: obj.strokeWidth || 0,
              shadowColor: obj.shadowColor || null,
              shadowBlur: obj.shadowBlur || 0,
              shadowOffsetX: obj.shadowOffsetX || 0,
              shadowOffsetY: obj.shadowOffsetY || 0,
            };
          }

          return obj;
        });

        const seccionesLimpias = limpiarUndefined(rawSecciones);
        const objetosLimpios = limpiarUndefined(objetosValidados);
        const rsvpLimpio = rawRsvp
          ? limpiarUndefined(normalizeRsvpConfig(rawRsvp, { forceEnabled: false }))
          : null;

        const ref = doc(db, "borradores", safeSlug);
        await updateDoc(ref, {
          objetos: objetosLimpios,
          secciones: seccionesLimpias,
          rsvp: rsvpLimpio,
          draftContentMeta: {
            ...buildDraftContentMeta({
              lastWriter: "canvas",
              reason,
            }),
            updatedAt: serverTimestamp(),
          },
          ultimaEdicion: serverTimestamp(),
        });

        if (!immediate && stageRef?.current && state.userId && safeSlug) {
          // En mobile pesado, generar thumbnail al vuelo puede tumbar la pestana.
          if (isMobileRuntime()) {
            pushEditorBreadcrumb("thumbnail-skip-mobile-runtime", { slug: safeSlug });
            return;
          }
          const { guardarThumbnailDesdeStage } = await import("@/utils/guardarThumbnail");
          await guardarThumbnailDesdeStage({ stageRef, uid: state.userId, slug: safeSlug });
        }
      })();

      persistInFlightRef.current = persistPromise;

      try {
        await persistPromise;
        return {
          ok: true,
        };
      } catch (error) {
        captureEditorIssue({
          source: "useBorradorSync.save",
          error,
          detail: {
            slug: safeSlug,
            reason,
            immediate,
            objetos: Array.isArray(state.objetos) ? state.objetos.length : null,
            secciones: Array.isArray(state.secciones) ? state.secciones.length : null,
            hasRsvp: Boolean(state.rsvp),
          },
          severity: "error",
        });

        return {
          ok: false,
          reason: "persist-failed",
          error: "No se pudo guardar el borrador en este momento.",
        };
      } finally {
        if (persistInFlightRef.current === persistPromise) {
          persistInFlightRef.current = null;
        }
      }
    },
    [limpiarUndefined, stageRef, validarPuntosLinea]
  );

  // 1) Cargar borrador desde Firestore
  useEffect(() => {
    if (!slug) return;

    if (
      readOnly &&
      (!initialDraftData || typeof initialDraftData !== "object")
    ) {
      return;
    }

    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;
    }

    // Al cambiar de borrador, evitamos persistir inmediatamente tras hidratar estado.
    skipNextPersistRef.current = true;

    const cargar = async () => {
      pushEditorBreadcrumb("borrador-load-start", { slug });

      try {
        const ref = doc(db, "borradores", slug);
        const hasInjectedDraft =
          initialDraftData && typeof initialDraftData === "object";
        let exists = false;
        let data = {};

        if (hasInjectedDraft) {
          exists = true;
          data = initialDraftData;
        } else {
          const snap = await getDoc(ref);
          exists = snap.exists();
          data = snap.exists() ? snap.data() || {} : {};
        }

        if (exists) {
          const renderState = normalizeDraftRenderState(data);
          const plantillaId =
            typeof data?.plantillaId === "string" ? data.plantillaId.trim() : "";
          const seccionesData = renderState.secciones;
          const objetosData = renderState.objetos;
          const rsvpData = renderState.rsvp;
          const tipoDraftRaw =
            typeof data?.tipoInvitacion === "string" ? data.tipoInvitacion : "";
          let tipoInvitacion = normalizeInvitationType(tipoDraftRaw);

          if (!tipoDraftRaw && plantillaId) {
            try {
              const plantillaSnap = await getDoc(doc(db, "plantillas", plantillaId));
              if (plantillaSnap.exists()) {
                const plantillaData = plantillaSnap.data() || {};
                tipoInvitacion = normalizeInvitationType(plantillaData?.tipo);

                if (tipoInvitacion && !readOnly) {
                  await updateDoc(ref, {
                    tipoInvitacion,
                  });
                }
              }
            } catch (tipoError) {
              pushEditorBreadcrumb("tipo-invitacion-backfill-failed", {
                slug,
                plantillaId: plantillaId || null,
                message: tipoError?.message || null,
              });
            }
          }

          // Refresca URLs de Firebase Storage por si hay tokens vencidos/revocados.
          const refreshCache = new Map();
          const [seccionesRefrescadas, objetosRefrescados] = await Promise.all([
            refreshUrlsDeep(seccionesData, refreshCache),
            refreshUrlsDeep(objetosData, refreshCache),
          ]);

          // Mantengo migracion de yNorm para secciones pantalla.
          const objsMigrados = objetosRefrescados.map((o) => {
            if (!o?.seccionId) return o;

            const sec = seccionesRefrescadas.find((s) => s.id === o.seccionId);
            const modo = normalizarAltoModo(sec?.altoModo);

            if (modo === "pantalla") {
              if (!Number.isFinite(o.yNorm)) {
                const yPx = Number.isFinite(o.y) ? o.y : 0;
                const yNorm = Math.max(0, Math.min(1, yPx / ALTURA_PANTALLA_EDITOR));
                return { ...o, yNorm };
              }
            }

            return o;
          });

          setObjetos(objsMigrados);
          setSecciones(seccionesRefrescadas);
          if (typeof window !== "undefined") {
            window._draftTipoInvitacion = tipoInvitacion || "general";
            window._tipoInvitacionActual = tipoInvitacion || "general";
            window.dispatchEvent(
              new CustomEvent("editor-tipo-invitacion", {
                detail: { tipoInvitacion: tipoInvitacion || "general" },
              })
            );
            if (window.canvasEditor && typeof window.canvasEditor === "object") {
              window.canvasEditor.tipoInvitacion = tipoInvitacion || "general";
            }
          }
          if (typeof setRsvp === "function") {
            if (rsvpData && typeof rsvpData === "object") {
              setRsvp(normalizeRsvpConfig(rsvpData, { forceEnabled: false }));
            } else {
              setRsvp(null);
            }
          }
          if (typeof onDraftLoaded === "function") {
            onDraftLoaded({
              slug,
              plantillaId: plantillaId || null,
              templateAuthoringDraft:
                data?.templateAuthoringDraft && typeof data.templateAuthoringDraft === "object"
                  ? data.templateAuthoringDraft
                  : null,
              objetos: objsMigrados,
              secciones: seccionesRefrescadas,
              rsvp: rsvpData && typeof rsvpData === "object" ? rsvpData : null,
              loadedAt: Date.now(),
            });
          }

          pushEditorBreadcrumb("borrador-load-success", {
            slug,
            objetos: objsMigrados.length,
            secciones: seccionesRefrescadas.length,
            source: hasInjectedDraft ? "injected-readonly" : "firestore",
          });

          // Setear primera seccion activa si no hay
          if (typeof setSeccionActivaId === "function" && seccionesRefrescadas.length > 0) {
            setSeccionActivaId((prev) => prev || seccionesRefrescadas[0].id);
          }
        } else {
          pushEditorBreadcrumb("borrador-load-missing", { slug });
          if (typeof onDraftLoaded === "function") {
            onDraftLoaded({
              slug,
              plantillaId: null,
              templateAuthoringDraft: null,
              objetos: [],
              secciones: [],
              rsvp: null,
              loadedAt: Date.now(),
            });
          }
        }
      } catch (error) {
        captureEditorIssue({
          source: "useBorradorSync.load",
          error,
          detail: { slug },
          severity: "fatal",
        });
      }

      setCargado(true);
    };

    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraftData, readOnly, slug]);

  // 2) Guardar en Firestore con debounce cuando cambian objetos/secciones/rsvp.
  useEffect(() => {
    if (!cargado) return;
    if (!slug) return;
    if (readOnly) return;

    // Evita write + thumbnail justo al terminar la carga inicial.
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    if (ignoreNextUpdateRef?.current) {
      requestAnimationFrame(() => {
        ignoreNextUpdateRef.current = Math.max(0, (ignoreNextUpdateRef.current || 0) - 1);
      });
      return;
    }

    // No guardar durante resize.
    if (window._resizeData?.isResizing) return;

    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;
    }

    persistTimeoutRef.current = setTimeout(() => {
      persistTimeoutRef.current = null;
      void persistDraftNow({
        reason: "debounced-autosave",
        immediate: false,
      });
    }, PERSIST_DEBOUNCE_MS);

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
    };
  }, [cargado, ignoreNextUpdateRef, objetos, persistDraftNow, rsvp, secciones, slug]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (readOnly) return undefined;

    const handleFlushRequest = async (event) => {
      const detail = normalizeFlushRequestDetail(event?.detail);
      if (!detail.requestId || !detail.slug) return;

      const currentSlug = normalizeText(latestStateRef.current.slug);
      if (!currentSlug || detail.slug !== currentSlug) return;

      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }

      const result = await persistDraftNow({
        reason: detail.reason || "external-flush",
        immediate: true,
      });

      window.dispatchEvent(
        new CustomEvent(DRAFT_FLUSH_RESULT_EVENT, {
          detail: {
            requestId: detail.requestId,
            slug: detail.slug,
            ok: result.ok === true,
            reason: result.reason || "",
            error: result.ok ? "" : result.error || "No se pudo guardar el borrador.",
          },
        })
      );
    };

    window.addEventListener(DRAFT_FLUSH_REQUEST_EVENT, handleFlushRequest);

    return () => {
      window.removeEventListener(DRAFT_FLUSH_REQUEST_EVENT, handleFlushRequest);
    };
  }, [persistDraftNow, readOnly]);

  useEffect(
    () => () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
    },
    []
  );
}
