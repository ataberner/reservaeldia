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
import { normalizePantallaObjectPosition } from "@/domain/drafts/pantallaPosition";
import { normalizeEditorSession } from "@/domain/drafts/session";
import {
  DRAFT_FLUSH_REQUEST_EVENT,
  DRAFT_FLUSH_RESULT_EVENT,
  buildFlushResultDetail,
  normalizeFlushRequestDetail,
} from "@/domain/drafts/flushGate";
import {
  captureEditorIssue,
  pushEditorBreadcrumb,
} from "@/lib/monitoring/editorIssueReporter";
import { recordCountdownAuditSnapshot } from "@/domain/countdownAudit/runtime";
import { buildSectionDecorationsPayload } from "@/domain/sections/backgrounds";
import { normalizeRenderAssetState } from "../../../../shared/renderAssetContract.js";

const PERSIST_DEBOUNCE_MS = 500;

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

function cleanUndefinedDeep(value) {
  if (Array.isArray(value)) return value.map((item) => cleanUndefinedDeep(item));

  if (value !== null && typeof value === "object") {
    const cleaned = {};
    Object.keys(value).forEach((key) => {
      const nestedValue = value[key];
      if (nestedValue !== undefined) {
        cleaned[key] = cleanUndefinedDeep(nestedValue);
      }
    });
    return cleaned;
  }

  return value;
}

function buildPersistableRenderState({
  objetos,
  secciones,
  rsvp,
  gifts,
  validarPuntosLinea,
  ALTURA_PANTALLA_EDITOR,
}) {
  const rawObjetos = Array.isArray(objetos) ? objetos : [];
  const rawSecciones = Array.isArray(secciones) ? secciones : [];
  const rawRsvp = rsvp && typeof rsvp === "object" ? rsvp : null;
  const rawGifts = gifts && typeof gifts === "object" ? gifts : null;

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

  const seccionesBase = rawSecciones.map((section) =>
    normalizeSectionPersistenceShape(section)
  );
  const renderAssetState = normalizeRenderAssetState({
    objetos: objetosValidados,
    secciones: seccionesBase,
  });
  const seccionById = new Map(
    (Array.isArray(renderAssetState.secciones) ? renderAssetState.secciones : []).map((section) => [
      section?.id,
      section,
    ])
  );
  const countdownForAudit =
    objetosValidados.find((item) => item?.tipo === "countdown") || null;
  const objetosNormalizadosPantalla = renderAssetState.objetos.map((objeto) =>
    normalizePantallaObjectPosition(objeto, {
      sectionMode: seccionById.get(objeto?.seccionId)?.altoModo,
      alturaPantalla: ALTURA_PANTALLA_EDITOR,
    })
  );

  return {
    objetos: cleanUndefinedDeep(objetosNormalizadosPantalla),
    secciones: cleanUndefinedDeep(renderAssetState.secciones),
    rsvp: rawRsvp
      ? cleanUndefinedDeep(normalizeRsvpConfig(rawRsvp, { forceEnabled: false }))
      : null,
    gifts: rawGifts
      ? cleanUndefinedDeep(normalizeGiftConfig(rawGifts, { forceEnabled: false }))
      : null,
    countdownForAudit,
  };
}

function buildLoadedEditorRenderState({
  objetos,
  secciones,
  ALTURA_PANTALLA_EDITOR,
}) {
  const renderAssetState = normalizeRenderAssetState({
    objetos: Array.isArray(objetos) ? objetos : [],
    secciones: Array.isArray(secciones) ? secciones : [],
  });
  const objetosCanonicos = renderAssetState.objetos;
  const seccionesCanonicas = renderAssetState.secciones;

  const seccionById = new Map(seccionesCanonicas.map((section) => [section?.id, section]));
  const objetosNormalizados = objetosCanonicos.map((objeto) =>
    normalizePantallaObjectPosition(objeto, {
      sectionMode: seccionById.get(objeto?.seccionId)?.altoModo,
      alturaPantalla: ALTURA_PANTALLA_EDITOR,
    })
  );

  const seccionesNormalizadas = seccionesCanonicas.map((section) =>
    normalizeSectionPersistenceShape(section)
  );

  return {
    objetos: objetosNormalizados,
    secciones: seccionesNormalizadas,
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
  validarPuntosLinea,

  // constantes
  ALTURA_PANTALLA_EDITOR,
}) {
  const skipNextPersistRef = useRef(true);
  const persistTimeoutRef = useRef(null);
  const persistInFlightRef = useRef(null);
  const pendingPersistReasonRef = useRef(null);
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

  const clearScheduledPersist = useCallback(() => {
    if (!persistTimeoutRef.current) return false;
    clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = null;
    pendingPersistReasonRef.current = null;
    return true;
  }, []);

  const persistCurrentState = useCallback(
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
        // Persist-time normalization boundary: only commit the canonical render
        // payload that preview/publish should read back from persistence.
        const persistedRenderState = buildPersistableRenderState({
          objetos: state.objetos,
          secciones: state.secciones,
          rsvp: state.rsvp,
          gifts: state.gifts,
          validarPuntosLinea,
          ALTURA_PANTALLA_EDITOR,
        });
        const seccionesLimpias = persistedRenderState.secciones;
        const objetosLimpios = persistedRenderState.objetos;
        const rsvpLimpio = persistedRenderState.rsvp;
        const giftsLimpios = persistedRenderState.gifts;
        const countdownForAudit = persistedRenderState.countdownForAudit;

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
    [ALTURA_PANTALLA_EDITOR, stageRef, validarPuntosLinea]
  );

  const scheduleDebouncedPersist = useCallback(
    ({ reason = "debounced-autosave" } = {}) => {
      clearScheduledPersist();
      pendingPersistReasonRef.current = reason;
      persistTimeoutRef.current = setTimeout(() => {
        persistTimeoutRef.current = null;
        pendingPersistReasonRef.current = null;
        void persistCurrentState({
          reason,
          immediate: false,
        });
      }, PERSIST_DEBOUNCE_MS);
    },
    [clearScheduledPersist, persistCurrentState]
  );

  const flushPersistBoundary = useCallback(
    async ({ reason = "manual-flush", source = "unknown" } = {}) => {
      const state = latestStateRef.current;
      const session = normalizeEditorSession(state.editorSession, state.slug);
      const safeSlug = normalizeText(session.id || state.slug);
      const pendingReason = pendingPersistReasonRef.current || null;
      const clearedScheduledPersist = clearScheduledPersist();

      pushEditorBreadcrumb("draft-flush-start", {
        slug: safeSlug || null,
        sessionKind: session.kind,
        reason,
        source,
        clearedScheduledPersist,
        pendingReason,
        hasInFlightPersist: Boolean(persistInFlightRef.current),
      });

      const result = await persistCurrentState({
        reason,
        immediate: true,
      });

      const shouldRestoreScheduledPersist =
        clearedScheduledPersist &&
        (result?.reason === "resize-in-progress" ||
          result?.reason === "draft-not-loaded");

      if (shouldRestoreScheduledPersist) {
        scheduleDebouncedPersist({
          reason: pendingReason || "debounced-autosave",
        });
      }

      pushEditorBreadcrumb(
        result?.ok === true ? "draft-flush-success" : "draft-flush-failed",
        {
          slug: safeSlug || null,
          sessionKind: session.kind,
          reason,
          source,
          outcomeReason: result?.reason || null,
          restoredScheduledPersist: shouldRestoreScheduledPersist,
        }
      );

      return {
        ...result,
        clearedScheduledPersist,
        restoredScheduledPersist: shouldRestoreScheduledPersist,
      };
    },
    [clearScheduledPersist, persistCurrentState, scheduleDebouncedPersist]
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

    clearScheduledPersist();

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

          // Load-time hydration boundary: refresh storage URLs and canonicalize
          // render assets for editor runtime without mutating persistence yet.
          const refreshCache = new Map();
          const [seccionesRefrescadas, objetosRefrescados] = await Promise.all([
            refreshUrlsDeep(seccionesData, refreshCache),
            refreshUrlsDeep(objetosData, refreshCache),
          ]);
          const loadedRenderState = buildLoadedEditorRenderState({
            objetos: objetosRefrescados,
            secciones: seccionesRefrescadas,
            ALTURA_PANTALLA_EDITOR,
          });
          const objsMigrados = loadedRenderState.objetos;
          const seccionesNormalizadas = loadedRenderState.secciones;

          setObjetos(objsMigrados);
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
  }, [
    ALTURA_PANTALLA_EDITOR,
    clearScheduledPersist,
    editorSession,
    initialDraftData,
    initialEditorData,
    readOnly,
    slug,
  ]);

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

    scheduleDebouncedPersist({
      reason: "debounced-autosave",
    });

    return () => {
      clearScheduledPersist();
    };
  }, [
    cargado,
    clearScheduledPersist,
    gifts,
    ignoreNextUpdateRef,
    objetos,
    rsvp,
    scheduleDebouncedPersist,
    secciones,
    slug,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (readOnly) return undefined;

    const handleFlushRequest = async (event) => {
      const detail = normalizeFlushRequestDetail(event?.detail);
      if (!detail.requestId || !detail.slug) return;

      const currentSlug = normalizeText(latestStateRef.current.slug);
      if (!currentSlug || detail.slug !== currentSlug) return;

      const result = await flushPersistBoundary({
        reason: detail.reason || "external-flush",
        source: "window-event",
      });

      window.dispatchEvent(
        new CustomEvent(DRAFT_FLUSH_RESULT_EVENT, {
          detail: buildFlushResultDetail({
            requestId: detail.requestId,
            slug: detail.slug,
            result,
          }),
        })
      );
    };

    window.addEventListener(DRAFT_FLUSH_REQUEST_EVENT, handleFlushRequest);

    return () => {
      window.removeEventListener(DRAFT_FLUSH_REQUEST_EVENT, handleFlushRequest);
    };
  }, [flushPersistBoundary, readOnly]);

  useEffect(() => {
    if (typeof onRegisterPersistenceBridge !== "function") return undefined;

    onRegisterPersistenceBridge({
      flushNow: async ({ reason = "direct-bridge-flush" } = {}) =>
        flushPersistBoundary({
          reason,
          source: "direct-bridge",
        }),
    });

    return () => {
      onRegisterPersistenceBridge(null);
    };
  }, [flushPersistBoundary, onRegisterPersistenceBridge]);

  useEffect(
    () => () => {
      clearScheduledPersist();
    },
    [clearScheduledPersist]
  );
}
