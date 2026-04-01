import { useEffect, useMemo, useRef, useState } from "react";
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
import { readCanvasEditorMethod } from "../lib/editorRuntimeBridge.js";
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
const INLINE_CRITICAL_BOUNDARY_MAX_WAIT_MS = 120;
const INLINE_CRITICAL_BOUNDARY_ERROR_MESSAGE =
  "No se pudo cerrar la edicion de texto en curso. Intenta nuevamente.";

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

function isDashboardPreviewDebugEnabled() {
  if (typeof window === "undefined") return false;

  try {
    const qp = new URLSearchParams(window.location?.search || "");
    return qp.get("previewDebug") === "1";
  } catch {
    return false;
  }
}

async function runDashboardPreviewControllerCriticalActionFlush({
  slugInvitacion,
  modoEditor,
  editorSession,
  reason,
} = {}) {
  return flushEditorPersistenceBeforeCriticalAction({
    slug: sanitizeDraftSlug(slugInvitacion),
    reason,
    editorMode: modoEditor,
    editorSession,
    directFlush: readCanvasEditorMethod("flushPersistenceNow"),
    captureSnapshot: () => readEditorRenderSnapshot(),
  });
}

async function runDashboardPreviewControllerInlineCriticalBoundary({
  reason,
  maxWaitMs = INLINE_CRITICAL_BOUNDARY_MAX_WAIT_MS,
} = {}) {
  const ensureInlineSettled = readCanvasEditorMethod(
    "ensureInlineEditSettledBeforeCriticalAction"
  );

  if (typeof ensureInlineSettled !== "function") {
    return {
      ok: false,
      settled: false,
      handled: false,
      activeId: null,
      reason: "inline-boundary-unavailable",
      actionReason: normalizeText(reason) || "critical-action",
      error: INLINE_CRITICAL_BOUNDARY_ERROR_MESSAGE,
    };
  }

  try {
    const result = await ensureInlineSettled({
      reason,
      maxWaitMs,
    });

    if (!result || typeof result !== "object") {
      return {
        ok: false,
        settled: false,
        handled: false,
        activeId: null,
        reason: "inline-boundary-invalid-result",
        actionReason: normalizeText(reason) || "critical-action",
        error: INLINE_CRITICAL_BOUNDARY_ERROR_MESSAGE,
      };
    }

    return result;
  } catch (error) {
    return {
      ok: false,
      settled: false,
      handled: false,
      activeId: null,
      reason: "inline-boundary-error",
      actionReason: normalizeText(reason) || "critical-action",
      error: getErrorMessage(error, INLINE_CRITICAL_BOUNDARY_ERROR_MESSAGE),
    };
  }
}

async function runDashboardPreviewControllerPreviewPipeline({
  slugInvitacion,
  isTemplateSession = false,
  canUsePublishCompatibility = false,
  previewBoundarySnapshot = null,
  assertCurrentSession,
} = {}) {
  const previewDebug = isDashboardPreviewDebugEnabled();

  return runDashboardPreviewPipeline({
    slugInvitacion,
    isTemplateSession,
    canUsePublishCompatibility,
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
      return snapPublicadaPorOriginal.empty ? null : snapPublicadaPorOriginal.docs[0];
    },
    generateHtmlFromSections: async (
      secciones,
      objetos,
      rsvpPreviewConfig,
      generatorOptions
    ) => {
      const { generarHTMLDesdeSecciones } = await loadHtmlGeneratorModule();
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
    assertCurrentSession,
  });
}

async function runDashboardPreviewControllerPublishValidation({
  draftSlug,
  canUsePublishCompatibility = false,
} = {}) {
  return runDashboardPreviewPublishValidation({
    draftSlug,
    canUsePublishCompatibility,
  });
}

function resolveDashboardPreviewControllerPublishAction({
  validationResult,
} = {}) {
  return resolveDashboardPreviewPublishAction({
    validationResult,
  });
}

function scheduleDashboardPreviewControllerPublishedAuditCapture({
  publicUrl,
  fallbackHtml = "",
} = {}) {
  scheduleDashboardPreviewPublishedAuditCapture({
    publicUrl,
    fallbackHtml,
  });
}

function showDashboardPreviewControllerAlert(message) {
  if (typeof alert !== "function") return;
  alert(message);
}

function buildDashboardPreviewControllerDependencies(dependencyOverrides = {}) {
  const safeOverrides =
    dependencyOverrides && typeof dependencyOverrides === "object"
      ? dependencyOverrides
      : {};

  return {
    runInlineCriticalBoundary:
      typeof safeOverrides.runInlineCriticalBoundary === "function"
        ? safeOverrides.runInlineCriticalBoundary
        : runDashboardPreviewControllerInlineCriticalBoundary,
    runCriticalActionFlush:
      typeof safeOverrides.runCriticalActionFlush === "function"
        ? safeOverrides.runCriticalActionFlush
        : runDashboardPreviewControllerCriticalActionFlush,
    runPreviewPipeline:
      typeof safeOverrides.runPreviewPipeline === "function"
        ? safeOverrides.runPreviewPipeline
        : runDashboardPreviewControllerPreviewPipeline,
    runPublishValidation:
      typeof safeOverrides.runPublishValidation === "function"
        ? safeOverrides.runPublishValidation
        : runDashboardPreviewControllerPublishValidation,
    resolvePublishAction:
      typeof safeOverrides.resolvePublishAction === "function"
        ? safeOverrides.resolvePublishAction
        : resolveDashboardPreviewControllerPublishAction,
    schedulePublishedAuditCapture:
      typeof safeOverrides.schedulePublishedAuditCapture === "function"
        ? safeOverrides.schedulePublishedAuditCapture
        : scheduleDashboardPreviewControllerPublishedAuditCapture,
    showAlert:
      typeof safeOverrides.showAlert === "function"
        ? safeOverrides.showAlert
        : showDashboardPreviewControllerAlert,
  };
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

export function createDashboardPreviewControllerRuntime({
  slugInvitacion,
  modoEditor,
  editorSession,
  dependencyOverrides = {},
  previewCompatibilityState,
  currentPreviewContextRef,
  previewSessionSequenceRef,
  activePreviewSessionRef,
  previewStateRef,
  setPreviewState,
} = {}) {
  if (typeof setPreviewState !== "function") {
    throw new Error("setPreviewState is required");
  }

  const controllerDependencies =
    buildDashboardPreviewControllerDependencies(dependencyOverrides);
  const {
    runInlineCriticalBoundary,
    runCriticalActionFlush,
    runPreviewPipeline,
    runPublishValidation,
    resolvePublishAction,
    schedulePublishedAuditCapture,
    showAlert,
  } = controllerDependencies;
  const resolvedPreviewCompatibilityState =
    previewCompatibilityState && typeof previewCompatibilityState === "object"
      ? previewCompatibilityState
      : buildDashboardPreviewCompatibilityState({
          slugInvitacion,
          editorSession,
        });
  const resolvedCurrentPreviewContextRef =
    currentPreviewContextRef && typeof currentPreviewContextRef === "object"
      ? currentPreviewContextRef
      : {
          current: buildDashboardPreviewControllerContext({
            slugInvitacion,
            editorSession,
          }),
        };
  const resolvedPreviewSessionSequenceRef =
    previewSessionSequenceRef && typeof previewSessionSequenceRef === "object"
      ? previewSessionSequenceRef
      : { current: 0 };
  const resolvedActivePreviewSessionRef =
    activePreviewSessionRef && typeof activePreviewSessionRef === "object"
      ? activePreviewSessionRef
      : { current: EMPTY_PREVIEW_CONTROLLER_SESSION };
  const resolvedPreviewStateRef =
    previewStateRef && typeof previewStateRef === "object"
      ? previewStateRef
      : {
          current: createPublicationPreviewState(),
        };

  const clearPreviewSession = () => {
    resolvedActivePreviewSessionRef.current = EMPTY_PREVIEW_CONTROLLER_SESSION;
  };

  const beginPreviewSession = () => {
    resolvedPreviewSessionSequenceRef.current += 1;
    const previewSession = createDashboardPreviewControllerSession({
      slugInvitacion,
      editorSession,
      requestSequence: resolvedPreviewSessionSequenceRef.current,
    });

    resolvedActivePreviewSessionRef.current = {
      ...previewSession,
      isOpen: true,
    };

    return previewSession;
  };

  const isCurrentPreviewSession = (previewSession) => {
    return canApplyDashboardPreviewControllerSession({
      activeSession: resolvedActivePreviewSessionRef.current,
      session: previewSession,
      currentContext: resolvedCurrentPreviewContextRef.current,
    });
  };

  const commitPreviewState = (previewSession, updater) => {
    if (previewSession && !isCurrentPreviewSession(previewSession)) {
      return false;
    }

    setPreviewState((prev) =>
      typeof updater === "function" ? updater(prev) : updater
    );
    return true;
  };

  const resetPreviewState = (previewSession = null) => {
    return commitPreviewState(previewSession, createPublicationPreviewState());
  };

  const ensureDraftFlushBeforeCriticalAction = async (reason) => {
    const safeSlug = sanitizeDraftSlug(slugInvitacion);
    pushEditorBreadcrumb("critical-action-inline-boundary-start", {
      slug: safeSlug || null,
      reason,
      sessionKind: editorSession?.kind || null,
    });

    const inlineBoundaryResult = await runInlineCriticalBoundary({
      slugInvitacion: safeSlug,
      modoEditor,
      editorSession,
      reason,
      maxWaitMs: INLINE_CRITICAL_BOUNDARY_MAX_WAIT_MS,
    });

    pushEditorBreadcrumb(
      inlineBoundaryResult?.ok
        ? "critical-action-inline-boundary-success"
        : "critical-action-inline-boundary-failed",
      {
        slug: safeSlug || null,
        reason,
        sessionKind: editorSession?.kind || null,
        settled: inlineBoundaryResult?.settled === true,
        handled: inlineBoundaryResult?.handled === true,
        activeId: inlineBoundaryResult?.activeId || null,
        failureReason: inlineBoundaryResult?.reason || null,
      }
    );

    if (!inlineBoundaryResult?.ok) {
      return {
        ok: false,
        slug: safeSlug,
        sessionKind: editorSession?.kind || null,
        transport: "inline-boundary",
        skipped: false,
        reason:
          normalizeText(inlineBoundaryResult?.reason) ||
          "inline-boundary-failed",
        error:
          normalizeText(inlineBoundaryResult?.error) ||
          INLINE_CRITICAL_BOUNDARY_ERROR_MESSAGE,
        rawResult:
          inlineBoundaryResult && typeof inlineBoundaryResult === "object"
            ? inlineBoundaryResult
            : null,
        compatibilitySnapshot: null,
      };
    }

    pushEditorBreadcrumb("critical-action-flush-start", {
      slug: safeSlug || null,
      reason,
      sessionKind: editorSession?.kind || null,
    });

    const result = await runCriticalActionFlush({
      slugInvitacion: safeSlug,
      modoEditor,
      editorSession,
      reason,
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
  };

  const refreshPublishValidation = async (draftSlugOverride = null, options = {}) => {
    const previewSession =
      options && typeof options === "object" ? options.previewSession || null : null;
    const commitIfCurrent = (updater) => {
      if (previewSession && !isCurrentPreviewSession(previewSession)) {
        return false;
      }
      return commitPreviewState(null, updater);
    };

    if (!resolvedPreviewCompatibilityState.canUsePublishCompatibility) {
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
      const result = await runPublishValidation({
        draftSlug: safeDraftSlug,
        canUsePublishCompatibility:
          resolvedPreviewCompatibilityState.canUsePublishCompatibility,
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
  };

  const generarVistaPrevia = async () => {
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
        !commitPreviewState(previewSession, buildDashboardPreviewOpenedState())
      ) {
        return;
      }

      const previewBoundarySnapshot =
        flushResult.compatibilitySnapshot &&
        typeof flushResult.compatibilitySnapshot === "object"
          ? flushResult.compatibilitySnapshot
          : null;

      const previewResult = await runPreviewPipeline({
        slugInvitacion,
        isTemplateSession: resolvedPreviewCompatibilityState.isTemplateSession,
        canUsePublishCompatibility:
          resolvedPreviewCompatibilityState.canUsePublishCompatibility,
        previewBoundarySnapshot,
        assertCurrentSession: assertCurrentPreviewSession,
      });

      if (!isCurrentPreviewSession(previewSession)) return;

      if (previewResult.status === "missing-template") {
        showAlert("No se encontro la plantilla.");
        resetPreviewState(previewSession);
        return;
      }

      if (previewResult.status === "missing-draft") {
        showAlert("No se encontro el borrador");
        resetPreviewState(previewSession);
        return;
      }

      if (previewResult.status === "group-runtime-deferred") {
        showAlert(
          "La vista previa todavia no admite grupos de composicion en el runtime actual."
        );
        resetPreviewState(previewSession);
        return;
      }

      if (
        !commitPreviewState(previewSession, (prev) => ({
          ...prev,
          ...buildDashboardPreviewSuccessStatePatch({
            htmlGenerado: previewResult.htmlGenerado,
            isTemplateEditorSession:
              resolvedPreviewCompatibilityState.isTemplateSession,
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

      if (
        resolvedPreviewCompatibilityState.shouldRefreshPublishValidationAfterPreview
      ) {
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
      showAlert("No se pudo generar la vista previa");
      resetPreviewState(previewSession);
    }
  };

  const publicarDesdeVistaPrevia = async () => {
    if (!resolvedPreviewCompatibilityState.canOpenCheckoutFromPreview) return;

    const previewSession = resolvedActivePreviewSessionRef.current;
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

    const publishAction = resolvePublishAction({
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
  };

  const handleCheckoutPublished = (payload) => {
    if (!resolvedPreviewCompatibilityState.canUsePublishCompatibility) return;

    setPreviewState((prev) => ({
      ...prev,
      ...buildDashboardPreviewCheckoutPublishedStatePatch({
        payload,
        currentPreviewPublicUrl: prev.urlPublicaVistaPrevia,
        currentPublishedUrl: prev.urlPublicadaReciente,
        currentPublicSlug: prev.slugPublicoVistaPrevia,
      }),
    }));

    schedulePublishedAuditCapture({
      publicUrl: payload?.publicUrl,
      fallbackHtml: resolvedPreviewStateRef.current.htmlVistaPrevia,
    });
  };

  const closePreview = () => {
    clearPreviewSession();
    setPreviewState(buildDashboardPreviewCloseState());
  };

  const closeCheckout = () => {
    setPreviewState((prev) => ({
      ...prev,
      ...buildDashboardPreviewCloseCheckoutStatePatch(),
    }));
  };

  return {
    ensureDraftFlushBeforeCriticalAction,
    refreshPublishValidation,
    generarVistaPrevia,
    publicarDesdeVistaPrevia,
    handleCheckoutPublished,
    closePreview,
    closeCheckout,
  };
}

export function useDashboardPreviewControllerWithDependencies(
  {
    slugInvitacion,
    modoEditor,
    editorSession,
  } = {},
  dependencyOverrides = {}
) {
  const controllerDependencies = useMemo(
    () => buildDashboardPreviewControllerDependencies(dependencyOverrides),
    [dependencyOverrides]
  );
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

  const controllerRuntime = useMemo(
    () =>
      createDashboardPreviewControllerRuntime({
        slugInvitacion,
        modoEditor,
        editorSession,
        dependencyOverrides: controllerDependencies,
        previewCompatibilityState,
        currentPreviewContextRef,
        previewSessionSequenceRef,
        activePreviewSessionRef,
        previewStateRef,
        setPreviewState,
      }),
    [
      controllerDependencies,
      editorSession,
      modoEditor,
      previewCompatibilityState,
      slugInvitacion,
    ]
  );

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
    ...controllerRuntime,
  };
}

export function useDashboardPreviewController(options = {}) {
  return useDashboardPreviewControllerWithDependencies(options);
}
