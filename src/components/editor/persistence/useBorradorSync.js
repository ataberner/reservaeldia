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
import {
  EDITOR_BRIDGE_EVENTS,
  buildEditorInvitationTypeDetail,
} from "@/lib/editorBridgeContracts";
import { recordCountdownAuditSnapshot } from "@/domain/countdownAudit/runtime";
import {
  BORRADOR_SYNC_PERSIST_DEBOUNCE_MS,
  createBorradorSyncSchedulingController,
} from "./borradorSyncScheduling.js";
import { loadBorradorSyncState } from "./borradorSyncLoad.js";
import { persistBorradorSyncState } from "./borradorSyncPersist.js";
import { isRetryableTemplatePersistError } from "./borradorSyncRetry.js";
import { createBorradorSyncSessionLifecycle } from "./borradorSyncSessionLifecycle.js";

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
  eventDetails,
  getTemplateAuthoringSnapshot = null,
  cargado,

  // setters
  setObjetos,
  setSecciones,
  setRsvp,
  setGifts,
  setEventDetails,
  setCargado,
  setSeccionActivaId,
  onDraftLoaded,
  enqueueDraftWrite = null,
  hasPendingDraftWrites = null,

  // refs / helpers que ya existen en CanvasEditor
  ignoreNextUpdateRef,
  stageRef,

  // helpers de tu layout actual
  validarPuntosLinea,

  // constantes
  ALTURA_PANTALLA_EDITOR,
}) {
  const skipNextPersistRef = useRef(true);
  const persistInFlightRef = useRef(null);
  const persistCurrentStateRef = useRef(null);
  const persistSchedulerRef = useRef(null);
  const sessionLifecycleRef = useRef(null);
  if (!sessionLifecycleRef.current) {
    sessionLifecycleRef.current = createBorradorSyncSessionLifecycle();
  }
  const normalizedEditorSession = normalizeEditorSession(editorSession, slug);
  sessionLifecycleRef.current.observeSession({
    session: normalizedEditorSession,
    slug,
  });
  const latestStateRef = useRef({
    slug: null,
    editorSession: { kind: "draft", id: null },
    userId: null,
    objetos: [],
    secciones: [],
    rsvp: null,
    gifts: null,
    eventDetails: null,
    getTemplateAuthoringSnapshot: null,
    cargado: false,
  });
  latestStateRef.current = {
    slug,
    editorSession: normalizedEditorSession,
    userId,
    objetos,
    secciones,
    rsvp,
    gifts,
    eventDetails,
    getTemplateAuthoringSnapshot,
    cargado,
  };
  if (!persistSchedulerRef.current) {
    persistSchedulerRef.current = createBorradorSyncSchedulingController({
      runPersistNow: (options = {}) =>
        typeof persistCurrentStateRef.current === "function"
          ? persistCurrentStateRef.current(options)
          : Promise.resolve({
              ok: false,
              reason: "persist-runner-unavailable",
              error: "El editor todavia no preparo la persistencia del borrador.",
            }),
      debounceMs: BORRADOR_SYNC_PERSIST_DEBOUNCE_MS,
    });
  }

  const clearScheduledPersist = useCallback(
    () => persistSchedulerRef.current?.clearScheduledPersist?.() === true,
    []
  );

  const persistCurrentState = useCallback(
    async ({ reason = "autosave", immediate = false } = {}) => {
      const requestedState = latestStateRef.current;
      const persistIntent = sessionLifecycleRef.current.capturePersistIntent({
        session: requestedState.editorSession,
        slug: requestedState.slug,
      });

      const runPersistTask = async () => {
        // Compatibility boundary: queue draft writes first, then read the latest
        // editor state so flush/autosave do not replay stale render snapshots.
        const state = latestStateRef.current;
        const session = normalizeEditorSession(state.editorSession, state.slug);
        const safeSlug = normalizeText(session.id || state.slug);
        const sessionBlockReason =
          sessionLifecycleRef.current.getPersistBlockReason(persistIntent, {
            session,
            slug: state.slug,
          });

        if (sessionBlockReason) {
          return {
            ok: false,
            reason: sessionBlockReason,
            error:
              sessionBlockReason === "draft-not-loaded"
                ? "El borrador todavia no termino de cargar."
                : "La sesion del editor cambio antes de ejecutar el guardado.",
          };
        }

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

        const persistOnce = () =>
          persistBorradorSyncState({
            state,
            readOnly,
            reason,
            immediate,
            stageRef,
            validarPuntosLinea,
            ALTURA_PANTALLA_EDITOR,
          });

        try {
          try {
            return await persistOnce();
          } catch (error) {
            if (
              session.kind !== "template" ||
              !isRetryableTemplatePersistError(error)
            ) {
              throw error;
            }

            const retryState = latestStateRef.current;
            const retryBlockReason =
              sessionLifecycleRef.current.getPersistBlockReason(persistIntent, {
                session: retryState.editorSession,
                slug: retryState.slug,
              });
            if (retryBlockReason) {
              return {
                ok: false,
                reason: retryBlockReason,
                error: "La sesion del editor cambio antes de reintentar el guardado.",
              };
            }

            pushEditorBreadcrumb("draft-persist-transient-retry", {
              slug: safeSlug,
              sessionKind: session.kind,
              reason,
              immediate,
              code: error?.code || null,
            });
            return await persistOnce();
          }
        } catch (error) {
          captureEditorIssue({
            source: "useBorradorSync.save",
            error,
            detail: {
              slug: safeSlug,
              reason,
              immediate,
              sessionKind: session.kind,
              code: error?.code || null,
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
        }
      };

      const persistPromise =
        typeof enqueueDraftWrite === "function"
          ? enqueueDraftWrite(runPersistTask)
          : Promise.resolve().then(runPersistTask);

      persistInFlightRef.current = persistPromise;

      try {
        return await persistPromise;
      } finally {
        if (persistInFlightRef.current === persistPromise) {
          persistInFlightRef.current = null;
        }
      }
    },
    [ALTURA_PANTALLA_EDITOR, enqueueDraftWrite, readOnly, stageRef, validarPuntosLinea]
  );
  persistCurrentStateRef.current = persistCurrentState;

  const scheduleDebouncedPersist = useCallback(
    ({ reason = "debounced-autosave" } = {}) => {
      persistSchedulerRef.current?.scheduleDebouncedPersist?.({ reason });
    },
    []
  );

  const flushPersistBoundary = useCallback(
    async ({ reason = "manual-flush", source = "unknown" } = {}) => {
      const state = latestStateRef.current;
      const session = normalizeEditorSession(state.editorSession, state.slug);
      const safeSlug = normalizeText(session.id || state.slug);
      const pendingReason = persistSchedulerRef.current?.getPendingReason?.() || null;
      const hasScheduledPersist =
        persistSchedulerRef.current?.hasScheduledPersist?.() === true;
      const hasQueuedDraftWrites =
        typeof hasPendingDraftWrites === "function"
          ? hasPendingDraftWrites() === true
          : Boolean(persistInFlightRef.current);

      pushEditorBreadcrumb("draft-flush-start", {
        slug: safeSlug || null,
        sessionKind: session.kind,
        reason,
        source,
        clearedScheduledPersist: hasScheduledPersist,
        pendingReason,
        hasInFlightPersist: hasQueuedDraftWrites,
      });

      const result = await persistSchedulerRef.current.flushPersistBoundary({
        reason,
      });

      pushEditorBreadcrumb(
        result?.ok === true ? "draft-flush-success" : "draft-flush-failed",
        {
          slug: safeSlug || null,
          sessionKind: session.kind,
          reason,
          source,
          outcomeReason: result?.reason || null,
          restoredScheduledPersist: result?.restoredScheduledPersist === true,
        }
      );

      return result;
    },
    [hasPendingDraftWrites]
  );

  // 1) Cargar borrador desde Firestore
  useEffect(() => {
    const session = normalizeEditorSession(editorSession, slug);
    let cancelled = false;

    if (!session.id) {
      clearScheduledPersist();
      setCargado(false);
      return undefined;
    }

    if (
      session.kind === "draft" &&
      readOnly &&
      (!initialDraftData || typeof initialDraftData !== "object")
    ) {
      clearScheduledPersist();
      setCargado(false);
      return undefined;
    }

    const loadToken = sessionLifecycleRef.current.beginLoad({
      session,
      slug,
    });
    clearScheduledPersist();
    setCargado(false);

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
        if (cancelled) return;

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
              new CustomEvent(EDITOR_BRIDGE_EVENTS.INVITATION_TYPE_CHANGE, {
                detail: buildEditorInvitationTypeDetail(tipoInvitacion),
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
          if (typeof setEventDetails === "function") {
            setEventDetails(loadResult.eventDetailsForSetter);
          }
          if (typeof onDraftLoaded === "function") {
            onDraftLoaded({
              slug: loadResult.session.id,
              plantillaId: loadResult.plantillaId,
              portada: loadResult.portada,
              portadaSource: loadResult.portadaSource,
              templateWorkspace: loadResult.templateWorkspace,
              templateAuthoringDraft: loadResult.templateAuthoringDraft,
              templateInput: loadResult.templateInput,
              objetos: loadResult.hydratedObjetos,
              secciones: loadResult.hydratedSecciones,
              rsvp: loadResult.rawRsvp,
              gifts: loadResult.rawGifts,
              eventDetails: loadResult.rawEventDetails,
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
              portada: "",
              portadaSource: null,
              templateWorkspace: null,
              templateAuthoringDraft: null,
              templateInput: null,
              objetos: [],
              secciones: [],
              rsvp: null,
              gifts: null,
              eventDetails: null,
              loadedAt: Date.now(),
            });
          }
        }
      } catch (error) {
        if (cancelled) return;
        captureEditorIssue({
          source: "useBorradorSync.load",
          error,
          detail: { slug: session.id, sessionKind: session.kind },
          severity: "fatal",
        });
        return;
      }

      if (sessionLifecycleRef.current.completeLoad(loadToken)) {
        setCargado(true);
      }
    };

    void cargar();
    return () => {
      cancelled = true;
    };
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
    eventDetails,
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

      // Let synchronous listeners drain dynamic-field debounces into the shared
      // write coordinator before this flush claims its queue position.
      await Promise.resolve();

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
