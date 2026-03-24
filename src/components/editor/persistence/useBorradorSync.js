// src/components/editor/persistence/useBorradorSync.js
import { useCallback, useEffect, useRef } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { db, storage } from "@/firebase";
import { normalizeRsvpConfig } from "@/domain/rsvp/config";
import { normalizeGiftConfig } from "@/domain/gifts/config";
import { normalizeInvitationType } from "@/domain/invitationTypes";
import {
  getTemplateEditorDocument,
  saveTemplateEditorDocument,
} from "@/domain/templates/adminService";
import {
  buildDraftContentMeta,
  normalizeDraftRenderState,
} from "@/domain/drafts/sourceOfTruth";
import {
  captureEditorIssue,
  pushEditorBreadcrumb,
} from "@/lib/monitoring/editorIssueReporter";
import { recordCountdownAuditSnapshot } from "@/domain/countdownAudit/runtime";
import { buildSectionDecorationsPayload } from "@/domain/sections/backgrounds";
import { normalizeRenderAssetState } from "../../../../shared/renderAssetContract.js";

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

function normalizeEditorSession(value, fallbackSlug = "") {
  const safeValue = value && typeof value === "object" ? value : {};
  const kind =
    normalizeText(safeValue.kind).toLowerCase() === "template"
      ? "template"
      : "draft";
  const id = normalizeText(safeValue.id) || normalizeText(fallbackSlug);
  return {
    kind,
    id,
  };
}

function normalizeCountdownObjectGeometry(obj) {
  if (!obj || obj.tipo !== "countdown") return obj;

  const scaleX = Number(obj.scaleX);
  const scaleY = Number(obj.scaleY);
  const hasScaleX = Number.isFinite(scaleX) && scaleX !== 1;
  const hasScaleY = Number.isFinite(scaleY) && scaleY !== 1;

  if (!hasScaleX && !hasScaleY) return obj;

  const next = { ...obj };
  const width = Number(obj.width);
  const height = Number(obj.height);

  if (Number.isFinite(width) && Number.isFinite(scaleX)) {
    next.width = Math.abs(width * scaleX);
  }

  if (Number.isFinite(height) && Number.isFinite(scaleY)) {
    next.height = Math.abs(height * scaleY);
  }

  next.scaleX = 1;
  next.scaleY = 1;

  return next;
}

function normalizeSectionPersistenceShape(section) {
  if (!section || typeof section !== "object" || Array.isArray(section)) return section;

  return {
    ...section,
    decoracionesFondo: buildSectionDecorationsPayload(section, {
      sectionHeight: section.altura,
    }),
  };
}

/**
 * Hook de sincronizacion Firestore para el borrador (carga + guardado con debounce).
 * Incluye flush inmediato para acciones criticas (preview/publicacion).
 */
export default function useBorradorSync({
  slug,
  editorSession = null,
  userId,
  readOnly = false,
  initialDraftData = null,
  initialEditorData = null,
  onRegisterPersistenceBridge = null,

  // estado actual
  objetos,
  secciones,
  rsvp,
  gifts,
  cargado,

  // setters
  setObjetos,
  setSecciones,
  setRsvp,
  setGifts,
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
    editorSession: { kind: "draft", id: null },
    userId: null,
    objetos: [],
    secciones: [],
    rsvp: null,
    gifts: null,
    cargado: false,
  });
  latestStateRef.current = {
    slug,
    editorSession: normalizeEditorSession(editorSession, slug),
    userId,
    objetos,
    secciones,
    rsvp,
    gifts,
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
      const session = normalizeEditorSession(state.editorSession, state.slug);
      const safeSlug = normalizeText(session.id || state.slug);

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
        const rawGifts =
          state.gifts && typeof state.gifts === "object"
            ? state.gifts
            : null;

        // Validacion: lineas + normalizacion de textos
        const objetosValidados = rawObjetos.map((obj) => {
          if (obj?.tipo === "countdown") {
            return normalizeCountdownObjectGeometry(obj);
          }

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

        const renderAssetState = normalizeRenderAssetState({
          objetos: objetosValidados,
          secciones: rawSecciones.map((section) => normalizeSectionPersistenceShape(section)),
        });
        const seccionesLimpias = limpiarUndefined(renderAssetState.secciones);
        const objetosLimpios = limpiarUndefined(renderAssetState.objetos);
        const countdownForAudit = objetosValidados.find((item) => item?.tipo === "countdown") || null;
        const rsvpLimpio = rawRsvp
          ? limpiarUndefined(normalizeRsvpConfig(rawRsvp, { forceEnabled: false }))
          : null;
        const giftsLimpios = rawGifts
          ? limpiarUndefined(normalizeGiftConfig(rawGifts, { forceEnabled: false }))
          : null;

        if (session.kind === "template") {
          await saveTemplateEditorDocument({
            templateId: safeSlug,
            document: {
              nombre: normalizeText(state.nombre) || undefined,
              objetos: objetosLimpios,
              secciones: seccionesLimpias,
              rsvp: rsvpLimpio,
              gifts: giftsLimpios,
            },
          });
          return;
        }

        const ref = doc(db, "borradores", safeSlug);
        await updateDoc(ref, {
          objetos: objetosLimpios,
          secciones: seccionesLimpias,
          rsvp: rsvpLimpio,
          gifts: giftsLimpios,
          draftContentMeta: {
            ...buildDraftContentMeta({
              lastWriter: "canvas",
              reason,
            }),
            updatedAt: serverTimestamp(),
          },
          ultimaEdicion: serverTimestamp(),
        });

        if (countdownForAudit) {
          const sectionMode = String(
            seccionesLimpias.find((section) => section?.id === countdownForAudit?.seccionId)?.altoModo || ""
          ).trim().toLowerCase();
          recordCountdownAuditSnapshot({
            countdown: countdownForAudit,
            stage: "draft-persist-write",
            renderer: "persisted-document",
            sourceDocument: "borradores",
            viewport: "editor",
            wrapperScale: 1,
            usesRasterThumbnail: false,
            altoModo: sectionMode,
            sourceLabel: safeSlug,
          });
        }

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
            sessionKind: session.kind,
            objetos: Array.isArray(state.objetos) ? state.objetos.length : null,
            secciones: Array.isArray(state.secciones) ? state.secciones.length : null,
            hasRsvp: Boolean(state.rsvp),
            hasGifts: Boolean(state.gifts),
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
    const session = normalizeEditorSession(editorSession, slug);
    if (!session.id) return;

    if (
      session.kind === "draft" &&
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
      pushEditorBreadcrumb("borrador-load-start", {
        slug: session.id,
        sessionKind: session.kind,
      });

      try {
        const hasInjectedDraft =
          (session.kind === "template"
            ? initialEditorData
            : initialDraftData) &&
          typeof (session.kind === "template"
            ? initialEditorData
            : initialDraftData) === "object";
        let exists = false;
        let data = {};

        if (hasInjectedDraft) {
          exists = true;
          data =
            session.kind === "template"
              ? initialEditorData
              : initialDraftData;
        } else {
          if (session.kind === "template") {
            const result = await getTemplateEditorDocument({
              templateId: session.id,
            });
            data =
              result?.editorDocument && typeof result.editorDocument === "object"
                ? result.editorDocument
                : {};
            exists = Object.keys(data).length > 0;
          } else {
            const ref = doc(db, "borradores", session.id);
            const snap = await getDoc(ref);
            exists = snap.exists();
            data = snap.exists() ? snap.data() || {} : {};
          }
        }

        if (exists) {
          const renderState = normalizeDraftRenderState(data);
          const plantillaId =
            session.kind === "template"
              ? session.id
              : typeof data?.plantillaId === "string"
                ? data.plantillaId.trim()
                : "";
          const seccionesData = renderState.secciones;
          const objetosData = renderState.objetos;
          const rsvpData = renderState.rsvp;
          const giftsData = renderState.gifts;
          const tipoDraftRaw =
            typeof data?.tipoInvitacion === "string" ? data.tipoInvitacion : "";
          let tipoInvitacion = normalizeInvitationType(tipoDraftRaw);

          if (session.kind !== "template" && !tipoDraftRaw && plantillaId) {
            try {
              const ref = doc(db, "borradores", session.id);
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
                slug: session.id,
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
          const renderAssetState = normalizeRenderAssetState({
            objetos: objetosRefrescados,
            secciones: seccionesRefrescadas,
          });
          const objetosCanonicos = renderAssetState.objetos;
          const seccionesCanonicas = renderAssetState.secciones;

          // Mantengo migracion de yNorm para secciones pantalla.
          const objsMigrados = objetosCanonicos.map((o) => {
            if (!o?.seccionId) return o;

            const sec = seccionesCanonicas.find((s) => s.id === o.seccionId);
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
          const seccionesNormalizadas = (Array.isArray(seccionesCanonicas)
            ? seccionesCanonicas
            : []
          ).map((section) => normalizeSectionPersistenceShape(section));

          setSecciones(seccionesNormalizadas);
          const countdownForAudit =
            objsMigrados.find((item) => item?.tipo === "countdown") || null;
          if (countdownForAudit) {
            const sectionMode = String(
              seccionesNormalizadas.find((section) => section?.id === countdownForAudit?.seccionId)?.altoModo || ""
            ).trim().toLowerCase();
            recordCountdownAuditSnapshot({
              countdown: countdownForAudit,
              stage:
                session.kind === "template"
                  ? "template-persisted-document"
                  : "draft-load-document",
              renderer: "persisted-document",
              sourceDocument: session.kind === "template" ? "template-editor-document" : "borradores",
              viewport: "editor",
              wrapperScale: 1,
              usesRasterThumbnail: false,
              altoModo: sectionMode,
              sourceLabel: session.id,
            });
          }
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
          if (typeof setGifts === "function") {
            if (giftsData && typeof giftsData === "object") {
              setGifts(normalizeGiftConfig(giftsData, { forceEnabled: false }));
            } else {
              setGifts(null);
            }
          }
          if (typeof onDraftLoaded === "function") {
            onDraftLoaded({
              slug: session.id,
              plantillaId: plantillaId || null,
              templateWorkspace:
                data?.templateWorkspace && typeof data.templateWorkspace === "object"
                  ? data.templateWorkspace
                  : null,
              templateAuthoringDraft:
                data?.templateAuthoringDraft && typeof data.templateAuthoringDraft === "object"
                  ? data.templateAuthoringDraft
                  : null,
              objetos: objsMigrados,
              secciones: seccionesNormalizadas,
              rsvp: rsvpData && typeof rsvpData === "object" ? rsvpData : null,
              gifts: giftsData && typeof giftsData === "object" ? giftsData : null,
              loadedAt: Date.now(),
            });
          }

          pushEditorBreadcrumb("borrador-load-success", {
            slug: session.id,
            objetos: objsMigrados.length,
            secciones: seccionesNormalizadas.length,
            source: hasInjectedDraft
              ? "injected-readonly"
              : session.kind === "template"
                ? "callable"
                : "firestore",
          });

          // Setear primera seccion activa si no hay
          if (typeof setSeccionActivaId === "function" && seccionesNormalizadas.length > 0) {
            setSeccionActivaId((prev) => prev || seccionesNormalizadas[0].id);
          }
        } else {
          pushEditorBreadcrumb("borrador-load-missing", {
            slug: session.id,
            sessionKind: session.kind,
          });
          if (typeof onDraftLoaded === "function") {
            onDraftLoaded({
              slug: session.id,
              plantillaId: null,
              templateWorkspace: null,
              templateAuthoringDraft: null,
              objetos: [],
              secciones: [],
              rsvp: null,
              gifts: null,
              loadedAt: Date.now(),
            });
          }
        }
      } catch (error) {
        captureEditorIssue({
          source: "useBorradorSync.load",
          error,
          detail: { slug: session.id, sessionKind: session.kind },
          severity: "fatal",
        });
      }

      setCargado(true);
    };

    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorSession, initialDraftData, initialEditorData, readOnly, slug]);

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
  }, [cargado, gifts, ignoreNextUpdateRef, objetos, persistDraftNow, rsvp, secciones, slug]);

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

  useEffect(() => {
    if (typeof onRegisterPersistenceBridge !== "function") return undefined;

    onRegisterPersistenceBridge({
      flushNow: async ({ reason = "direct-bridge-flush" } = {}) =>
        persistDraftNow({
          reason,
          immediate: true,
        }),
    });

    return () => {
      onRegisterPersistenceBridge(null);
    };
  }, [onRegisterPersistenceBridge, persistDraftNow]);

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
