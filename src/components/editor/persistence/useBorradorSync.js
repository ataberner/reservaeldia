// src/components/editor/persistence/useBorradorSync.js
import { useCallback, useEffect, useRef } from "react";
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
import { loadBorradorSyncState } from "./borradorSyncLoad.js";
import { persistBorradorSyncState } from "./borradorSyncPersist.js";

const PERSIST_DEBOUNCE_MS = 500;

function normalizeText(value) {
  return String(value || "").trim();
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

      const persistPromise = persistBorradorSyncState({
        state,
        readOnly,
        reason,
        immediate,
        stageRef,
        validarPuntosLinea,
        ALTURA_PANTALLA_EDITOR,
      });

      persistInFlightRef.current = persistPromise;

      try {
        return await persistPromise;
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
    [ALTURA_PANTALLA_EDITOR, readOnly, stageRef, validarPuntosLinea]
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
        const loadResult = await loadBorradorSyncState({
          session,
          readOnly,
          initialDraftData,
          initialEditorData,
          ALTURA_PANTALLA_EDITOR,
        });

        if (loadResult.exists) {
          setObjetos(loadResult.hydratedObjetos);
          setSecciones(loadResult.hydratedSecciones);
          if (loadResult.countdownAudit) {
            recordCountdownAuditSnapshot(loadResult.countdownAudit);
          }
          if (typeof window !== "undefined") {
            const tipoInvitacion = loadResult.tipoInvitacion || "general";
            window._draftTipoInvitacion = tipoInvitacion;
            window._tipoInvitacionActual = tipoInvitacion;
            window.dispatchEvent(
              new CustomEvent("editor-tipo-invitacion", {
                detail: { tipoInvitacion },
              })
            );
            if (window.canvasEditor && typeof window.canvasEditor === "object") {
              window.canvasEditor.tipoInvitacion = tipoInvitacion;
            }
          }
          if (typeof setRsvp === "function") {
            setRsvp(loadResult.rsvpForSetter);
          }
          if (typeof setGifts === "function") {
            setGifts(loadResult.giftsForSetter);
          }
          if (typeof onDraftLoaded === "function") {
            onDraftLoaded({
              slug: loadResult.session.id,
              plantillaId: loadResult.plantillaId,
              templateWorkspace: loadResult.templateWorkspace,
              templateAuthoringDraft: loadResult.templateAuthoringDraft,
              objetos: loadResult.hydratedObjetos,
              secciones: loadResult.hydratedSecciones,
              rsvp: loadResult.rawRsvp,
              gifts: loadResult.rawGifts,
              loadedAt: Date.now(),
            });
          }

          pushEditorBreadcrumb("borrador-load-success", {
            slug: loadResult.session.id,
            objetos: loadResult.hydratedObjetos.length,
            secciones: loadResult.hydratedSecciones.length,
            source: loadResult.source,
          });

          // Setear primera seccion activa si no hay
          if (
            typeof setSeccionActivaId === "function" &&
            loadResult.hydratedSecciones.length > 0
          ) {
            setSeccionActivaId((prev) => prev || loadResult.hydratedSecciones[0].id);
          }
        } else {
          pushEditorBreadcrumb("borrador-load-missing", {
            slug: loadResult.session.id,
            sessionKind: loadResult.session.kind,
          });
          if (typeof onDraftLoaded === "function") {
            onDraftLoaded({
              slug: loadResult.session.id,
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

    void cargar();
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
    readOnly,
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
