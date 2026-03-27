import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { getErrorMessage } from "../domain/dashboard/helpers.js";
import {
  buildDashboardPreviewCloseCheckoutStatePatch,
  buildDashboardPreviewCloseState,
  buildDashboardPreviewCheckoutClosedErrorStatePatch,
  buildDashboardPreviewCheckoutPublishedStatePatch,
  buildDashboardPreviewCheckoutReadyStatePatch,
  buildDashboardPreviewOpenFlushFailureStatePatch,
  buildDashboardPreviewOpenedState,
  buildDashboardPreviewPublishValidationIdleStatePatch,
  buildDashboardPreviewPublishValidationPendingStatePatch,
  buildDashboardPreviewPublishValidationResolvedStatePatch,
  buildDashboardPreviewPublishValidationSettledStatePatch,
  buildDashboardPreviewSuccessStatePatch,
  buildPreviewDisplayUrl,
  createPublicationPreviewState,
} from "../domain/dashboard/previewSession.js";
import {
  buildDashboardPreviewDebugSummary,
  runDashboardPreviewPipeline,
} from "../domain/dashboard/previewPipeline.js";
import {
  resolveDashboardPreviewPublishAction,
  runDashboardPreviewPublishValidation,
  scheduleDashboardPreviewPublishedAuditCapture,
} from "../domain/dashboard/previewPublicationActions.js";
import { flushEditorPersistenceBeforeCriticalAction } from "../domain/drafts/criticalFlush.js";
import {
  sanitizeDraftSlug,
} from "../domain/invitations/readResolution.js";
import { readEditorRenderSnapshot } from "../lib/editorSnapshotAdapter.js";
import { pushEditorBreadcrumb } from "../lib/monitoring/editorIssueReporter.js";

const EMPTY_PREVIEW_CONTROLLER_SESSION = Object.freeze({
  targetId: "",
  sessionKind: "",
  sessionId: "",
  requestKey: "",
  isOpen: false,
});
const STALE_PREVIEW_SESSION_ERROR_CODE = "dashboard-preview-session-stale";

function normalizeText(value) {
  return String(value || "").trim();
}

function createStalePreviewSessionError() {
  const error = new Error(STALE_PREVIEW_SESSION_ERROR_CODE);
  error.code = STALE_PREVIEW_SESSION_ERROR_CODE;
  return error;
}

function isStalePreviewSessionError(error) {
  return (
    error?.code === STALE_PREVIEW_SESSION_ERROR_CODE ||
    error?.message === STALE_PREVIEW_SESSION_ERROR_CODE
  );
}

async function loadTemplateAdminServiceModule() {
  return import("../domain/templates/adminService.js");
}

async function loadHtmlGeneratorModule() {
  return import("../../functions/src/utils/generarHTMLDesdeSecciones");
}

export function buildDashboardPreviewControllerContext({
  slugInvitacion,
  editorSession,
} = {}) {
  const targetId = normalizeText(slugInvitacion);
  const sessionKind = normalizeText(editorSession?.kind) || "draft";
  const sessionId = normalizeText(editorSession?.id) || targetId;

  return {
    targetId,
    sessionKind,
    sessionId,
  };
}

export function createDashboardPreviewControllerSession({
  slugInvitacion,
  editorSession,
  requestSequence,
} = {}) {
  const context = buildDashboardPreviewControllerContext({
    slugInvitacion,
    editorSession,
  });
  const safeRequestSequence =
    Number.isInteger(requestSequence) && requestSequence > 0
      ? requestSequence
      : 0;

  return {
    ...context,
    requestKey:
      context.targetId && safeRequestSequence
        ? `${context.sessionKind}:${context.sessionId}:${safeRequestSequence}`
        : "",
  };
}

export function canApplyDashboardPreviewControllerSession({
  activeSession,
  session,
  currentContext,
} = {}) {
  const safeActiveSession =
    activeSession && typeof activeSession === "object"
      ? activeSession
      : EMPTY_PREVIEW_CONTROLLER_SESSION;
  const safeSession =
    session && typeof session === "object"
      ? session
      : EMPTY_PREVIEW_CONTROLLER_SESSION;
  const safeCurrentContext =
    currentContext && typeof currentContext === "object"
      ? currentContext
      : buildDashboardPreviewControllerContext();

  if (safeActiveSession.isOpen !== true) return false;

  const activeRequestKey = normalizeText(safeActiveSession.requestKey);
  const sessionRequestKey = normalizeText(safeSession.requestKey);
  if (!activeRequestKey || !sessionRequestKey) return false;
  if (activeRequestKey !== sessionRequestKey) return false;

  return (
    normalizeText(safeSession.targetId) === normalizeText(safeCurrentContext.targetId) &&
    normalizeText(safeSession.sessionKind) ===
      normalizeText(safeCurrentContext.sessionKind) &&
    normalizeText(safeSession.sessionId) === normalizeText(safeCurrentContext.sessionId)
  );
}

export function buildDashboardPreviewCompatibilityState({
  slugInvitacion,
  editorSession,
} = {}) {
  const context = buildDashboardPreviewControllerContext({
    slugInvitacion,
    editorSession,
  });
  const isTemplateSession = context.sessionKind === "template";
  const canUsePublishCompatibility = !isTemplateSession;
  const hasTargetId = Boolean(context.targetId);

  return {
    isTemplateSession,
    canUsePublishCompatibility,
    canOpenCheckoutFromPreview:
      canUsePublishCompatibility && hasTargetId,
    shouldRefreshPublishValidationAfterPreview:
      canUsePublishCompatibility && hasTargetId,
    publishValidationRefreshMode: canUsePublishCompatibility
      ? "compatibility-side-effect"
      : "none",
  };
}

export function useDashboardPreviewController({
  slugInvitacion,
  modoEditor,
  editorSession,
} = {}) {
  const [previewState, setPreviewState] = useState(() =>
    createPublicationPreviewState()
  );

  const previewStateRef = useRef(previewState);
  const previewSessionSequenceRef = useRef(0);
  const activePreviewSessionRef = useRef(EMPTY_PREVIEW_CONTROLLER_SESSION);
  const currentPreviewContext = useMemo(
    () =>
      buildDashboardPreviewControllerContext({
        slugInvitacion,
        editorSession,
      }),
    [editorSession, slugInvitacion]
  );
  const currentPreviewContextRef = useRef(currentPreviewContext);
  const previewCompatibilityState = useMemo(
    () =>
      buildDashboardPreviewCompatibilityState({
        slugInvitacion,
        editorSession,
      }),
    [editorSession, slugInvitacion]
  );

  currentPreviewContextRef.current = currentPreviewContext;

  useEffect(() => {
    previewStateRef.current = previewState;
  }, [previewState]);

  const clearPreviewSession = useCallback(() => {
    activePreviewSessionRef.current = EMPTY_PREVIEW_CONTROLLER_SESSION;
  }, []);

  const beginPreviewSession = useCallback(() => {
    previewSessionSequenceRef.current += 1;
    const previewSession = createDashboardPreviewControllerSession({
      slugInvitacion,
      editorSession,
      requestSequence: previewSessionSequenceRef.current,
    });

    activePreviewSessionRef.current = {
      ...previewSession,
      isOpen: true,
    };

    return previewSession;
  }, [editorSession, slugInvitacion]);

  const isCurrentPreviewSession = useCallback((previewSession) => {
    return canApplyDashboardPreviewControllerSession({
      activeSession: activePreviewSessionRef.current,
      session: previewSession,
      currentContext: currentPreviewContextRef.current,
    });
  }, []);

  const commitPreviewState = useCallback(
    (previewSession, updater) => {
      if (previewSession && !isCurrentPreviewSession(previewSession)) {
        return false;
      }

      setPreviewState((prev) =>
        typeof updater === "function" ? updater(prev) : updater
      );
      return true;
    },
    [isCurrentPreviewSession]
  );

  const resetPreviewState = useCallback(
    (previewSession = null) => {
      return commitPreviewState(previewSession, createPublicationPreviewState());
    },
    [commitPreviewState]
  );

  const ensureDraftFlushBeforeCriticalAction = useCallback(
    async (reason) => {
      const safeSlug = sanitizeDraftSlug(slugInvitacion);
      pushEditorBreadcrumb("critical-action-flush-start", {
        slug: safeSlug || null,
        reason,
        sessionKind: editorSession?.kind || null,
      });

      const result = await flushEditorPersistenceBeforeCriticalAction({
        slug: safeSlug,
        reason,
        editorMode: modoEditor,
        editorSession,
        directFlush:
          typeof window !== "undefined" &&
          typeof window.canvasEditor?.flushPersistenceNow === "function"
            ? (options) => window.canvasEditor.flushPersistenceNow(options)
            : null,
        captureSnapshot: () => readEditorRenderSnapshot(),
      });

      pushEditorBreadcrumb(
        result.ok ? "critical-action-flush-success" : "critical-action-flush-failed",
        {
          slug: safeSlug || null,
          reason,
          sessionKind: result.sessionKind || editorSession?.kind || null,
          transport: result.transport || null,
          skipped: result.skipped === true,
          capturedCompatibilitySnapshot: Boolean(result.compatibilitySnapshot),
          failureReason: result.reason || null,
        }
      );

      return result;
    },
    [editorSession, modoEditor, slugInvitacion]
  );

  const refreshPublishValidation = useCallback(
    async (draftSlugOverride = null, options = {}) => {
      const previewSession =
        options && typeof options === "object" ? options.previewSession || null : null;
      const commitIfCurrent = (updater) => {
        if (previewSession && !isCurrentPreviewSession(previewSession)) {
          return false;
        }
        return commitPreviewState(null, updater);
      };

      if (!previewCompatibilityState.canUsePublishCompatibility) {
        commitIfCurrent((prev) => ({
          ...prev,
          ...buildDashboardPreviewPublishValidationIdleStatePatch(),
        }));
        return null;
      }

      const safeDraftSlug = sanitizeDraftSlug(draftSlugOverride || slugInvitacion);
      if (!safeDraftSlug) {
        commitIfCurrent((prev) => ({
          ...prev,
          ...buildDashboardPreviewPublishValidationIdleStatePatch(),
        }));
        return null;
      }

      commitIfCurrent((prev) => ({
        ...prev,
        ...buildDashboardPreviewPublishValidationPendingStatePatch(),
      }));

      try {
        const result = await runDashboardPreviewPublishValidation({
          draftSlug: safeDraftSlug,
          canUsePublishCompatibility:
            previewCompatibilityState.canUsePublishCompatibility,
        });

        commitIfCurrent((prev) => ({
          ...prev,
          ...buildDashboardPreviewPublishValidationResolvedStatePatch({
            validationResult: result,
          }),
        }));

        return result || null;
      } finally {
        commitIfCurrent((prev) => ({
          ...prev,
          ...buildDashboardPreviewPublishValidationSettledStatePatch(),
        }));
      }
    },
    [
      commitPreviewState,
      isCurrentPreviewSession,
      previewCompatibilityState.canUsePublishCompatibility,
      slugInvitacion,
    ]
  );

  const generarVistaPrevia = useCallback(async () => {
    const previewSession = beginPreviewSession();
    const assertCurrentPreviewSession = () => {
      if (!isCurrentPreviewSession(previewSession)) {
        throw createStalePreviewSessionError();
      }
    };

    try {
      const flushResult = await ensureDraftFlushBeforeCriticalAction(
        "preview-before-open"
      );

      if (!isCurrentPreviewSession(previewSession)) return;

      if (!flushResult.ok) {
        commitPreviewState(previewSession, (prev) => ({
          ...prev,
          ...buildDashboardPreviewOpenFlushFailureStatePatch({
            errorMessage: flushResult.error,
          }),
        }));
        return;
      }

      if (
        !commitPreviewState(
          previewSession,
          buildDashboardPreviewOpenedState()
        )
      ) {
        return;
      }

      const previewBoundarySnapshot =
        flushResult.compatibilitySnapshot &&
        typeof flushResult.compatibilitySnapshot === "object"
          ? flushResult.compatibilitySnapshot
          : null;

      const previewDebug = (() => {
        if (typeof window === "undefined") return false;
        try {
          const qp = new URLSearchParams(window.location.search || "");
          return qp.get("previewDebug") === "1";
        } catch {
          return false;
        }
      })();
      const previewResult = await runDashboardPreviewPipeline({
        slugInvitacion,
        isTemplateSession: previewCompatibilityState.isTemplateSession,
        canUsePublishCompatibility:
          previewCompatibilityState.canUsePublishCompatibility,
        previewBoundarySnapshot,
        readTemplateEditorDocument: async ({ templateId }) => {
          const { getTemplateEditorDocument } =
            await loadTemplateAdminServiceModule();
          return getTemplateEditorDocument({
            templateId,
          });
        },
        readDraftDocument: async ({ draftSlug }) =>
          getDoc(doc(db, "borradores", draftSlug)),
        readLiveEditorSnapshot: () => readEditorRenderSnapshot(),
        readPublicationBySlug: async (publicSlug) =>
          getDoc(doc(db, "publicadas", publicSlug)),
        queryPublicationBySlugOriginal: async (draftSlug) => {
          const qPublicadaPorOriginal = query(
            collection(db, "publicadas"),
            where("slugOriginal", "==", draftSlug),
            limit(1)
          );
          const snapPublicadaPorOriginal = await getDocs(qPublicadaPorOriginal);
          return snapPublicadaPorOriginal.empty
            ? null
            : snapPublicadaPorOriginal.docs[0];
        },
        generateHtmlFromSections: async (
          secciones,
          objetos,
          rsvpPreviewConfig,
          generatorOptions
        ) => {
          const { generarHTMLDesdeSecciones } =
            await loadHtmlGeneratorModule();
          return generarHTMLDesdeSecciones(
            secciones,
            objetos,
            rsvpPreviewConfig,
            generatorOptions
          );
        },
        onBeforeGenerateHtml: ({ previewPayload }) => {
          if (!previewDebug) return;

          try {
            const viewportWidth =
              typeof window !== "undefined"
                ? window.innerWidth || document.documentElement.clientWidth || 0
                : 0;
            const viewportHeight =
              typeof window !== "undefined"
                ? window.innerHeight || document.documentElement.clientHeight || 0
                : 0;
            const devicePixelRatio =
              typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
            const userAgent =
              typeof navigator !== "undefined" ? navigator.userAgent || "" : "";

            console.log(
              buildDashboardPreviewDebugSummary({
                previewPayload,
                viewportWidth,
                viewportHeight,
                devicePixelRatio,
                userAgent,
              })
            );
          } catch (error) {
            console.warn("[PREVIEW] no se pudo armar resumen de objetos", error);
          }
        },
        assertCurrentSession: assertCurrentPreviewSession,
      });

      if (!isCurrentPreviewSession(previewSession)) return;

      if (previewResult.status === "missing-template") {
        alert("No se encontro la plantilla.");
        resetPreviewState(previewSession);
        return;
      }

      if (previewResult.status === "missing-draft") {
        alert("No se encontro el borrador");
        resetPreviewState(previewSession);
        return;
      }

      if (
        !commitPreviewState(previewSession, (prev) => ({
          ...prev,
          ...buildDashboardPreviewSuccessStatePatch({
            htmlGenerado: previewResult.htmlGenerado,
            isTemplateEditorSession: previewCompatibilityState.isTemplateSession,
            urlPublicaDetectada: previewResult.urlPublicaDetectada,
            slugPublicoDetectado: previewResult.slugPublicoDetectado,
            publicacionNoVigenteDetectada:
              previewResult.publicacionNoVigenteDetectada,
            currentError: prev.publicacionVistaPreviaError,
          }),
        }))
      ) {
        return;
      }

      if (previewCompatibilityState.shouldRefreshPublishValidationAfterPreview) {
        void refreshPublishValidation(slugInvitacion, {
          previewSession,
          compatibilitySideEffect: true,
        }).catch((validationError) => {
          console.error("Error validando publicacion previa:", validationError);
        });
      }
    } catch (error) {
      if (isStalePreviewSessionError(error)) return;
      if (!isCurrentPreviewSession(previewSession)) return;

      console.error("Error generando vista previa:", error);
      alert("No se pudo generar la vista previa");
      resetPreviewState(previewSession);
    }
  }, [
    beginPreviewSession,
    commitPreviewState,
    ensureDraftFlushBeforeCriticalAction,
    isCurrentPreviewSession,
    previewCompatibilityState.canUsePublishCompatibility,
    previewCompatibilityState.isTemplateSession,
    previewCompatibilityState.shouldRefreshPublishValidationAfterPreview,
    refreshPublishValidation,
    resetPreviewState,
    slugInvitacion,
  ]);

  const publicarDesdeVistaPrevia = useCallback(async () => {
    if (!previewCompatibilityState.canOpenCheckoutFromPreview) return;

    const previewSession = activePreviewSessionRef.current;
    if (!isCurrentPreviewSession(previewSession)) return;

    const flushResult = await ensureDraftFlushBeforeCriticalAction(
      "checkout-before-open"
    );

    if (!isCurrentPreviewSession(previewSession)) return;

    if (!flushResult.ok) {
      commitPreviewState(previewSession, (prev) => ({
        ...prev,
        ...buildDashboardPreviewCheckoutClosedErrorStatePatch({
          errorMessage: flushResult.error,
        }),
      }));
      return;
    }

    let validationResult = null;
    try {
      validationResult = await refreshPublishValidation(slugInvitacion, {
        previewSession,
      });
    } catch (validationError) {
      if (!isCurrentPreviewSession(previewSession)) return;

      commitPreviewState(previewSession, (prev) => ({
        ...prev,
        ...buildDashboardPreviewCheckoutClosedErrorStatePatch({
          errorMessage: getErrorMessage(
            validationError,
            "No se pudo validar la compatibilidad de publish. Intenta nuevamente."
          ),
        }),
      }));
      return;
    }

    if (!isCurrentPreviewSession(previewSession)) return;

    const publishAction = resolveDashboardPreviewPublishAction({
      validationResult,
    });

    if (publishAction.status === "blocked") {
      commitPreviewState(previewSession, (prev) => ({
        ...prev,
        ...buildDashboardPreviewCheckoutClosedErrorStatePatch({
          errorMessage: publishAction.blockingMessage,
        }),
      }));
      return;
    }

    commitPreviewState(previewSession, (prev) => ({
      ...prev,
      ...buildDashboardPreviewCheckoutReadyStatePatch({
        canUpdatePublication: prev.puedeActualizarPublicacion,
      }),
    }));
  }, [
    commitPreviewState,
    ensureDraftFlushBeforeCriticalAction,
    isCurrentPreviewSession,
    previewCompatibilityState.canOpenCheckoutFromPreview,
    refreshPublishValidation,
    slugInvitacion,
  ]);

  const handleCheckoutPublished = useCallback(
    (payload) => {
      if (!previewCompatibilityState.canUsePublishCompatibility) return;

      setPreviewState((prev) => ({
        ...prev,
        ...buildDashboardPreviewCheckoutPublishedStatePatch({
          payload,
          currentPreviewPublicUrl: prev.urlPublicaVistaPrevia,
          currentPublishedUrl: prev.urlPublicadaReciente,
          currentPublicSlug: prev.slugPublicoVistaPrevia,
        }),
      }));

      scheduleDashboardPreviewPublishedAuditCapture({
        publicUrl: payload?.publicUrl,
        fallbackHtml: previewStateRef.current.htmlVistaPrevia,
      });
    },
    [previewCompatibilityState.canUsePublishCompatibility]
  );

  const closePreview = useCallback(() => {
    clearPreviewSession();
    setPreviewState(buildDashboardPreviewCloseState());
  }, [clearPreviewSession]);

  const closeCheckout = useCallback(() => {
    setPreviewState((prev) => ({
      ...prev,
      ...buildDashboardPreviewCloseCheckoutStatePatch(),
    }));
  }, []);

  const previewDisplayUrl = useMemo(
    () =>
      buildPreviewDisplayUrl({
        isTemplateEditorSession: previewCompatibilityState.isTemplateSession,
        urlPublicadaReciente: previewState.urlPublicadaReciente,
        urlPublicaVistaPrevia: previewState.urlPublicaVistaPrevia,
        slugPublicoVistaPrevia: previewState.slugPublicoVistaPrevia,
        slugInvitacion,
      }),
    [
      previewCompatibilityState.isTemplateSession,
      previewState.slugPublicoVistaPrevia,
      previewState.urlPublicaVistaPrevia,
      previewState.urlPublicadaReciente,
      slugInvitacion,
    ]
  );

  return {
    ...previewState,
    previewDisplayUrl,
    ensureDraftFlushBeforeCriticalAction,
    refreshPublishValidation,
    generarVistaPrevia,
    publicarDesdeVistaPrevia,
    handleCheckoutPublished,
    closePreview,
    closeCheckout,
  };
}
