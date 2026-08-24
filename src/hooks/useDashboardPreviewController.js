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
  cancelPreviewTimingSession,
  finishPreviewTimingSession,
  recordPreviewTimingStage,
  startPreviewTimingSession,
} from "../domain/dashboard/previewTiming.js";
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
import { readEditorSessionDocument } from "../components/editor/persistence/editorSessionPersistence.js";
import { getPreparedTemplateEditorPreview } from "../domain/templates/adminService.js";

const EMPTY_PREVIEW_CONTROLLER_SESSION = Object.freeze({
  targetId: "",
  sessionKind: "",
  sessionId: "",
  requestKey: "",
  isOpen: false,
});
const STALE_PREVIEW_SESSION_ERROR_CODE = "dashboard-preview-session-stale";
const EMPTY_DASHBOARD_PREVIEW_DEPENDENCY_OVERRIDES = Object.freeze({});
const INLINE_CRITICAL_BOUNDARY_MAX_WAIT_MS = 120;
const INLINE_CRITICAL_BOUNDARY_ERROR_MESSAGE =
  "No se pudo cerrar la edicion de texto en curso. Intenta nuevamente.";

function normalizeText(value) {
  return String(value || "").trim();
}

function readPreviewPerformanceNow() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return 0;
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

async function loadHtmlGeneratorModule() {
  return import("../../functions/src/utils/generarHTMLDesdeSecciones");
}

async function loadPublicationsServiceModule() {
  return import("../domain/publications/service.js");
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

function isPreparedDraftPreviewEnabled() {
  return process.env.NEXT_PUBLIC_PREPARED_DRAFT_PREVIEW !== "0";
}

const PREVIEW_PIPELINE_TIMING_LABELS = Object.freeze({
  "source-read-start": "Inicio lectura del borrador",
  "source-read": "Lectura del borrador",
  "publication-link-read-start": "Inicio resolucion publicacion",
  "publication-link-read": "Resolucion estado publicacion",
  "prepared-render-request-start": "Inicio prepareDraftPreviewRender",
  "prepared-render-request": "prepareDraftPreviewRender",
  "html-received": "HTML recibido en frontend",
  "html-generation": "Generacion HTML local",
  "pipeline-total": "Pipeline de vista previa",
});

function recordBackendTimingBreakdown(
  previewTimingContext,
  backendTiming,
  frontendRoundTripMs
) {
  if (!previewTimingContext?.sessionId || !backendTiming) return;

  const stages = [
    [
      "backend-read-draft",
      "Backend: lectura del borrador",
      backendTiming.readDraftMs,
    ],
    [
      "backend-prepare-render-payload",
      "Backend: prepareRenderPayload",
      backendTiming.prepareRenderPayloadMs,
    ],
    [
      "backend-validate-render-payload",
      "Backend: validatePreparedRenderPayload",
      backendTiming.validatePreparedRenderPayloadMs,
    ],
    [
      "backend-build-preview-payload",
      "Backend: armado payload preview",
      backendTiming.buildPreviewPayloadMs,
    ],
    [
      "backend-generate-html",
      "Backend: generateHtmlFromPreparedRenderPayload",
      backendTiming.generateHtmlMs,
    ],
    [
      "backend-serialize-response",
      "Backend: serializacion/armado respuesta",
      backendTiming.serializeMs,
    ],
  ];
  let backendAccumulatedMs = 0;

  stages.forEach(([stage, label, duration]) => {
    const safeDuration = Math.max(0, Number(duration) || 0);
    backendAccumulatedMs += safeDuration;
    recordPreviewTimingStage(previewTimingContext.sessionId, {
      stage,
      label,
      durationMs: safeDuration,
      source: "backend",
      backendAccumulatedMs,
      recordKey: stage,
    });
  });

  const totalBackendMs = Math.max(
    0,
    Number(backendTiming.totalBackendMs) || backendAccumulatedMs
  );
  recordPreviewTimingStage(previewTimingContext.sessionId, {
    stage: "backend-total",
    label: "Backend: total interno",
    durationMs: totalBackendMs,
    source: "backend",
    backendAccumulatedMs: totalBackendMs,
    recordKey: "backend-total",
  });
  recordPreviewTimingStage(previewTimingContext.sessionId, {
    stage: "network-serialization-transport",
    label: "Red, callable y transporte",
    durationMs: Math.max(0, Number(frontendRoundTripMs) - totalBackendMs),
    source: "network",
    recordKey: "network-serialization-transport",
  });
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
  shouldResolvePublicationLink = canUsePublishCompatibility,
  administrativeDraftPreview = null,
  previewBoundarySnapshot = null,
  previewTimingContext = null,
  assertCurrentSession,
} = {}) {
  const previewDebug = isDashboardPreviewDebugEnabled();
  const previewTimingSessionId = normalizeText(
    previewTimingContext?.sessionId
  );
  const previewTiming = Boolean(previewTimingSessionId);
  const administrativeOwnerUid = normalizeText(
    administrativeDraftPreview?.ownerUid
  );
  const administrativeDraftData =
    administrativeDraftPreview?.draftData &&
    typeof administrativeDraftPreview.draftData === "object"
      ? administrativeDraftPreview.draftData
      : null;
  const hasAdministrativeDraftPreview = Boolean(
    administrativeOwnerUid && administrativeDraftData
  );
  const recordPipelineStage = (timing) => {
    if (!previewTiming || !timing) return;
    recordPreviewTimingStage(previewTimingSessionId, {
      stage: timing.stage,
      label:
        PREVIEW_PIPELINE_TIMING_LABELS[timing.stage] ||
        timing.stage,
      durationMs: timing.durationMs,
      source: "preview-pipeline",
      htmlBytes: timing.htmlBytes,
      status: timing.status,
      recordKey: `pipeline:${timing.stage}`,
      detail: {
        ...(timing.source ? { dataSource: timing.source } : {}),
        ...(timing.found !== undefined ? { found: timing.found } : {}),
        ...(timing.matched !== undefined ? { matched: timing.matched } : {}),
        ...(timing.blocked !== undefined ? { blocked: timing.blocked } : {}),
      },
    });
  };
  const useBackendPreparedDraftPreview =
    !isTemplateSession &&
    canUsePublishCompatibility &&
    (isPreparedDraftPreviewEnabled() || hasAdministrativeDraftPreview);

  return runDashboardPreviewPipeline({
    slugInvitacion,
    isTemplateSession,
    canUsePublishCompatibility,
    shouldResolvePublicationLink,
    administrativeOwnerUid,
    previewBoundarySnapshot,
    readTemplateEditorDocument: async ({ templateId }) => {
      const backendCallStartedAt = readPreviewPerformanceNow();
      const result = await getPreparedTemplateEditorPreview({
        templateId,
        includeDebugPayload: previewDebug,
        ...(previewTimingSessionId
          ? { previewTiming: { sessionId: previewTimingSessionId } }
          : {}),
      });
      const backendCallCompletedAt = readPreviewPerformanceNow();
      const frontendRoundTripMs = Math.max(
        0,
        backendCallCompletedAt - backendCallStartedAt
      );
      recordPreviewTimingStage(previewTimingSessionId, {
        stage: "backend-call-roundtrip",
        label: "Llamada de red al backend",
        durationMs: frontendRoundTripMs,
        completedAt: backendCallCompletedAt,
        source: "network",
        recordKey: "backend-call-roundtrip",
      });
      recordBackendTimingBreakdown(
        previewTimingContext,
        result?.preparedPreview?.previewTiming,
        frontendRoundTripMs
      );
      recordPreviewTimingStage(previewTimingSessionId, {
        stage: "html-received",
        label: PREVIEW_PIPELINE_TIMING_LABELS["html-received"],
        durationMs: 0,
        completedAt: backendCallCompletedAt,
        source: "frontend",
        htmlBytes: String(result?.preparedPreview?.htmlGenerado || "").length,
        recordKey: "html-received",
      });
      return result;
    },
    readDraftDocument: async ({ draftSlug }) => {
      if (hasAdministrativeDraftPreview) {
        return administrativeDraftData;
      }

      const result = await readEditorSessionDocument({
        session: {
          kind: "draft",
          id: draftSlug,
        },
        slug: draftSlug,
      });
      return result.snapshot;
    },
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
    prepareDraftPreviewRender: useBackendPreparedDraftPreview
      ? async ({
          draftSlug,
          administrativeOwnerUid: ownerUid,
          resolvePublicationLink,
        }) => {
          const serviceModuleStartedAt = readPreviewPerformanceNow();
          const { prepareDraftPreviewRender } =
            await loadPublicationsServiceModule();
          recordPreviewTimingStage(previewTimingSessionId, {
            stage: "publication-service-module-load",
            label: "Carga modulo de publicacion",
            startedAt: serviceModuleStartedAt,
            source: "frontend",
            recordKey: "publication-service-module-load",
          });

          const backendCallStartedAt = readPreviewPerformanceNow();
          recordPreviewTimingStage(previewTimingSessionId, {
            stage: "backend-call-start",
            label: "Inicio llamada al backend",
            durationMs: 0,
            completedAt: backendCallStartedAt,
            source: "network",
            recordKey: "backend-call-start",
          });
          const result = await prepareDraftPreviewRender({
            draftSlug,
            administrativeOwnerUid: ownerUid,
            resolvePublicationLink,
            previewTimingSessionId,
            includeDebugPayload: previewDebug,
          });
          const backendCallCompletedAt = readPreviewPerformanceNow();
          const frontendRoundTripMs = Math.max(
            0,
            backendCallCompletedAt - backendCallStartedAt
          );
          recordPreviewTimingStage(previewTimingSessionId, {
            stage: "backend-call-roundtrip",
            label: "Llamada de red al backend",
            durationMs: frontendRoundTripMs,
            completedAt: backendCallCompletedAt,
            source: "network",
            recordKey: "backend-call-roundtrip",
          });
          recordBackendTimingBreakdown(
            previewTimingContext,
            result?.previewTiming,
            frontendRoundTripMs
          );
          recordPreviewTimingStage(previewTimingSessionId, {
            stage: "html-received",
            label: PREVIEW_PIPELINE_TIMING_LABELS["html-received"],
            durationMs: 0,
            completedAt: backendCallCompletedAt,
            source: "frontend",
            htmlBytes: String(result?.htmlGenerado || "").length,
            recordKey: "html-received",
          });
          return result;
        }
      : null,
    onBeforeGenerateHtml: previewDebug ? ({ previewPayload }) => {
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
    } : null,
    onStageTiming: previewTiming ? recordPipelineStage : null,
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

function buildDashboardPreviewControllerDependencies(
  dependencyOverrides = EMPTY_DASHBOARD_PREVIEW_DEPENDENCY_OVERRIDES
) {
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
  editorReadOnly = false,
  administrativeDraftPreview = null,
} = {}) {
  const context = buildDashboardPreviewControllerContext({
    slugInvitacion,
    editorSession,
  });
  const isTemplateSession = context.sessionKind === "template";
  const canUsePublishCompatibility = !isTemplateSession;
  const hasTargetId = Boolean(context.targetId);
  const isReadOnly = editorReadOnly === true;
  const administrativeOwnerUid = normalizeText(
    administrativeDraftPreview?.ownerUid
  );
  const canValidateForPublication =
    canUsePublishCompatibility && hasTargetId && !isReadOnly;

  return {
    isTemplateSession,
    canUsePublishCompatibility,
    canValidateForPublication,
    canOpenCheckoutFromPreview: canValidateForPublication,
    shouldRefreshPublishValidationAfterPreview:
      canValidateForPublication,
    shouldResolvePublicationLink:
      canUsePublishCompatibility && hasTargetId && !isReadOnly,
    administrativeOwnerUid,
    publishValidationRefreshMode: canValidateForPublication
      ? "compatibility-side-effect"
      : "none",
  };
}

export function createDashboardPreviewControllerRuntime({
  slugInvitacion,
  modoEditor,
  editorSession,
  editorReadOnly = false,
  administrativeDraftPreview = null,
  dependencyOverrides = {},
  previewCompatibilityState,
  currentPreviewContextRef,
  previewSessionSequenceRef,
  activePreviewSessionRef,
  previewOpenInFlightRef,
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
          editorReadOnly,
          administrativeDraftPreview,
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
  const resolvedPreviewOpenInFlightRef =
    previewOpenInFlightRef && typeof previewOpenInFlightRef === "object"
      ? previewOpenInFlightRef
      : { current: null };
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

  const ensureDraftFlushBeforeCriticalAction = async (
    reason,
    { previewTimingSessionId = "" } = {}
  ) => {
    const safeSlug = sanitizeDraftSlug(slugInvitacion);
    if (editorReadOnly === true) {
      const compatibilitySnapshot =
        administrativeDraftPreview?.draftData &&
        typeof administrativeDraftPreview.draftData === "object"
          ? administrativeDraftPreview.draftData
          : null;

      pushEditorBreadcrumb("critical-action-flush-skipped", {
        slug: safeSlug || null,
        reason,
        sessionKind: editorSession?.kind || null,
        skippedReason: "read-only",
      });

      return {
        ok: true,
        slug: safeSlug,
        sessionKind: editorSession?.kind || null,
        transport: "none",
        skipped: true,
        reason: "read-only",
        compatibilitySnapshot,
      };
    }

    const inlineBoundaryStartedAt = previewTimingSessionId
      ? readPreviewPerformanceNow()
      : 0;
    recordPreviewTimingStage(previewTimingSessionId, {
      stage: "inline-edit-settle-start",
      label: "Inicio cierre edicion inline",
      durationMs: 0,
      source: "editor",
      recordKey: "inline-edit-settle-start",
    });
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
    recordPreviewTimingStage(previewTimingSessionId, {
      stage: "inline-edit-settled",
      label: "Edicion inline cerrada",
      startedAt: inlineBoundaryStartedAt,
      source: "editor",
      status: inlineBoundaryResult?.ok ? "ok" : "error",
      reason: inlineBoundaryResult?.reason || "",
      recordKey: "inline-edit-settled",
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

    const flushStartedAt = previewTimingSessionId
      ? readPreviewPerformanceNow()
      : 0;
    recordPreviewTimingStage(previewTimingSessionId, {
      stage: "draft-fifo-flush-start",
      label: "Inicio flush FIFO del borrador",
      durationMs: 0,
      source: "editor-persistence",
      recordKey: "draft-fifo-flush-start",
    });
    const result = await runCriticalActionFlush({
      slugInvitacion: safeSlug,
      modoEditor,
      editorSession,
      reason,
    });
    recordPreviewTimingStage(previewTimingSessionId, {
      stage: "draft-fifo-flush",
      label: "Flush FIFO del borrador",
      startedAt: flushStartedAt,
      source: "editor-persistence",
      status: result?.ok ? "ok" : "error",
      reason: result?.reason || "",
      recordKey: "draft-fifo-flush",
      detail: {
        transport: result?.transport || null,
        skipped: result?.skipped === true,
      },
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

    if (!resolvedPreviewCompatibilityState.canValidateForPublication) {
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

  const executePreviewOpen = async () => {
    const previewSession = beginPreviewSession();
    const timingSessionId = startPreviewTimingSession({
      previewType: resolvedPreviewCompatibilityState.isTemplateSession
        ? "template-visual"
        : "draft-authoritative",
      targetId: previewSession.targetId,
      attempt: resolvedPreviewSessionSequenceRef.current,
    });
    previewSession.previewTimingSessionId = timingSessionId;
    resolvedActivePreviewSessionRef.current.previewTimingSessionId =
      timingSessionId;
    const assertCurrentPreviewSession = () => {
      if (!isCurrentPreviewSession(previewSession)) {
        throw createStalePreviewSessionError();
      }
    };

    if (
      !commitPreviewState(previewSession, {
        ...buildDashboardPreviewOpenedState(),
        previewTimingSessionId: timingSessionId || null,
      })
    ) {
      cancelPreviewTimingSession(timingSessionId, {
        reason: "open-state-rejected",
        status: "discarded",
        label: "Resultado descartado",
      });
      return;
    }

    try {
      const flushResult = await ensureDraftFlushBeforeCriticalAction(
        "preview-before-open",
        {
          previewTimingSessionId: timingSessionId,
        }
      );

      if (!isCurrentPreviewSession(previewSession)) {
        cancelPreviewTimingSession(timingSessionId, {
          reason: "stale-after-flush",
          status: "discarded",
          label: "Resultado obsoleto descartado",
        });
        return;
      }

      if (!flushResult.ok) {
        commitPreviewState(previewSession, (prev) => ({
          ...prev,
          ...buildDashboardPreviewOpenFlushFailureStatePatch({
            errorMessage: flushResult.error,
          }),
        }));
        finishPreviewTimingSession(timingSessionId, {
          reason: flushResult.reason || "flush-failed",
          status: "error",
          label: "Vista previa interrumpida",
        });
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
        shouldResolvePublicationLink:
          resolvedPreviewCompatibilityState.shouldResolvePublicationLink,
        administrativeDraftPreview,
        previewBoundarySnapshot,
        previewTimingContext: {
          sessionId: timingSessionId,
          previewType: resolvedPreviewCompatibilityState.isTemplateSession
            ? "template-visual"
            : "draft-authoritative",
          targetId: previewSession.targetId,
        },
        assertCurrentSession: assertCurrentPreviewSession,
      });

      if (!isCurrentPreviewSession(previewSession)) {
        cancelPreviewTimingSession(timingSessionId, {
          reason: "stale-after-pipeline",
          status: "discarded",
          label: "Resultado obsoleto descartado",
        });
        return;
      }

      if (previewResult.status === "missing-template") {
        showAlert("No se encontro la plantilla.");
        resetPreviewState(previewSession);
        finishPreviewTimingSession(timingSessionId, {
          reason: "missing-template",
          status: "error",
          label: "Vista previa interrumpida",
        });
        return;
      }

      if (previewResult.status === "missing-draft") {
        showAlert("No se encontro el borrador");
        resetPreviewState(previewSession);
        finishPreviewTimingSession(timingSessionId, {
          reason: "missing-draft",
          status: "error",
          label: "Vista previa interrumpida",
        });
        return;
      }

      if (previewResult.status === "blocked") {
        const publishAction = resolvePublishAction({
          validationResult: previewResult.validation,
        });
        const blockingMessage =
          previewResult.blockingMessage ||
          publishAction.blockingMessage ||
          "Hay contratos de render que todavia no son seguros para publicar.";

        commitPreviewState(previewSession, (prev) => ({
          ...prev,
          ...buildDashboardPreviewOpenFlushFailureStatePatch({
            errorMessage: blockingMessage,
          }),
          previewAuthority: previewResult.previewAuthority || null,
          ...buildDashboardPreviewPublishValidationResolvedStatePatch({
            validationResult: previewResult.validation,
          }),
          ...buildDashboardPreviewPublishValidationSettledStatePatch(),
        }));
        finishPreviewTimingSession(timingSessionId, {
          reason: "backend-validation-blocked",
          status: "blocked",
          label: "Vista previa bloqueada",
        });
        return;
      }

      const reactDispatchStartedAt = timingSessionId
        ? readPreviewPerformanceNow()
        : 0;
      if (
        !commitPreviewState(previewSession, (prev) => ({
          ...prev,
          ...buildDashboardPreviewSuccessStatePatch({
            htmlGenerado: previewResult.htmlGenerado,
            previewAuthority: previewResult.previewAuthority,
            isTemplateEditorSession:
              resolvedPreviewCompatibilityState.isTemplateSession,
            urlPublicaDetectada: previewResult.urlPublicaDetectada,
            slugPublicoDetectado: previewResult.slugPublicoDetectado,
            publicacionNoVigenteDetectada:
              previewResult.publicacionNoVigenteDetectada,
            currentError: prev.publicacionVistaPreviaError,
          }),
          ...(previewResult.validation
            ? buildDashboardPreviewPublishValidationResolvedStatePatch({
                validationResult: previewResult.validation,
              })
            : {}),
          ...(previewResult.validation
            ? buildDashboardPreviewPublishValidationSettledStatePatch()
            : {}),
        }))
      ) {
        cancelPreviewTimingSession(timingSessionId, {
          reason: "html-commit-rejected",
          status: "discarded",
          label: "Resultado obsoleto descartado",
        });
        return;
      }
      recordPreviewTimingStage(timingSessionId, {
        stage: "react-html-state-dispatched",
        label: "HTML definitivo enviado a React",
        startedAt: reactDispatchStartedAt,
        source: "react",
        htmlBytes: String(previewResult.htmlGenerado || "").length,
        recordKey: "react-html-state-dispatched",
      });

      if (
        resolvedPreviewCompatibilityState.shouldRefreshPublishValidationAfterPreview &&
        !previewResult.validation
      ) {
        void refreshPublishValidation(slugInvitacion, {
          previewSession,
          compatibilitySideEffect: true,
        }).catch((validationError) => {
          console.error("Error validando publicacion previa:", validationError);
        });
      }
    } catch (error) {
      if (isStalePreviewSessionError(error)) {
        cancelPreviewTimingSession(timingSessionId, {
          reason: "stale-session-error",
          status: "discarded",
          label: "Resultado obsoleto descartado",
        });
        return;
      }
      if (!isCurrentPreviewSession(previewSession)) {
        cancelPreviewTimingSession(timingSessionId, {
          reason: "inactive-session-error",
          status: "discarded",
          label: "Resultado obsoleto descartado",
        });
        return;
      }

      console.error("Error al generar la vista previa:", error);
      showAlert("No se pudo generar la vista previa");
      resetPreviewState(previewSession);
      finishPreviewTimingSession(timingSessionId, {
        reason: error?.code || error?.message || "preview-error",
        status: "error",
        label: "Error de vista previa",
      });
    }
  };

  const generarVistaPrevia = () => {
    if (resolvedPreviewOpenInFlightRef.current) {
      recordPreviewTimingStage(
        resolvedActivePreviewSessionRef.current?.previewTimingSessionId,
        {
          stage: "duplicate-open-reused",
          label: "Apertura duplicada reutilizada",
          source: "frontend",
          status: "deduplicated",
          recordKey: "duplicate-open-reused",
        }
      );
      return resolvedPreviewOpenInFlightRef.current;
    }

    const currentPromise = executePreviewOpen();
    resolvedPreviewOpenInFlightRef.current = currentPromise;
    const clearCurrentPromise = () => {
      if (resolvedPreviewOpenInFlightRef.current === currentPromise) {
        resolvedPreviewOpenInFlightRef.current = null;
      }
    };
    void currentPromise.then(clearCurrentPromise, clearCurrentPromise);
    return currentPromise;
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
    if (!resolvedPreviewCompatibilityState.canOpenCheckoutFromPreview) return;

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
    cancelPreviewTimingSession(
      resolvedActivePreviewSessionRef.current?.previewTimingSessionId,
      {
        reason: "modal-closed",
        status: "cancelled",
        label: "Vista previa cerrada",
      }
    );
    resolvedPreviewOpenInFlightRef.current = null;
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
    editorReadOnly = false,
    administrativeDraftPreview = null,
  } = {},
  dependencyOverrides = EMPTY_DASHBOARD_PREVIEW_DEPENDENCY_OVERRIDES
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
  const previewOpenInFlightRef = useRef(null);
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
        editorReadOnly,
        administrativeDraftPreview,
      }),
    [administrativeDraftPreview, editorReadOnly, editorSession, slugInvitacion]
  );

  currentPreviewContextRef.current = currentPreviewContext;

  useEffect(() => {
    previewStateRef.current = previewState;
  }, [previewState]);

  useEffect(
    () => () => {
      cancelPreviewTimingSession(
        activePreviewSessionRef.current?.previewTimingSessionId,
        {
          reason: "preview-controller-context-disposed",
          status: "cancelled",
          label: "Sesion de vista previa descartada",
        }
      );
    },
    [
      currentPreviewContext.sessionId,
      currentPreviewContext.sessionKind,
      currentPreviewContext.targetId,
    ]
  );

  const controllerRuntime = useMemo(
    () =>
      createDashboardPreviewControllerRuntime({
        slugInvitacion,
        modoEditor,
        editorSession,
        editorReadOnly,
        administrativeDraftPreview,
        dependencyOverrides: controllerDependencies,
        previewCompatibilityState,
        currentPreviewContextRef,
        previewSessionSequenceRef,
        activePreviewSessionRef,
        previewOpenInFlightRef,
        previewStateRef,
        setPreviewState,
      }),
    [
      controllerDependencies,
      administrativeDraftPreview,
      editorReadOnly,
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
