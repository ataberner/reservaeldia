import { captureEditorIssue } from "../../lib/monitoring/editorIssueReporter.js";
import {
  markBrowserStorageFailure,
  shouldStopBrowserStorageRetries,
} from "../../lib/storage/browserStorageRecovery.js";
import { classifyBrowserStorageError } from "../../lib/storage/browserStorageErrors.js";

function normalizeText(value, maxLen = 180) {
  const text = String(value || "").trim();
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

function buildCaptureError(error, label) {
  if (error instanceof Error && error.stack) return error;

  const captureStack = new Error(label || "Dashboard startup failure").stack || "";
  if (error instanceof Error) {
    try {
      error.stack = error.stack || captureStack;
    } catch {
      // Some browser errors expose readonly stacks.
    }
    return error;
  }

  return {
    name: error?.name || "UnknownError",
    message: error?.message || String(error || "Error desconocido"),
    stack: error?.stack || captureStack,
    cause: error,
  };
}

export function buildDashboardStartupFailureDetail(context = {}, classification = null) {
  return {
    operation: normalizeText(context.operation),
    module: normalizeText(context.module),
    phase: normalizeText(context.phase),
    slug: normalizeText(context.slug),
    querySlug: normalizeText(context.querySlug),
    activeSlug: normalizeText(context.activeSlug),
    authState:
      context.authState && typeof context.authState === "object"
        ? {
            hasUser: context.authState.hasUser === true,
            checkingAuth: context.authState.checkingAuth === true,
            loadingAdminAccess: context.authState.loadingAdminAccess === true,
          }
        : null,
    saveState:
      context.saveState && typeof context.saveState === "object"
        ? {
            hasPendingChanges: context.saveState.hasPendingChanges ?? null,
            known: context.saveState.known === true,
          }
        : null,
    storage:
      classification && classification.isBrowserStorageError
        ? {
            kind: classification.isIndexedDbError ? "indexeddb" : "browser-storage",
            reason: classification.reason,
            recoverable: classification.recoverable === true,
            normalizedName: normalizeText(classification.normalized?.name),
            normalizedMessage: normalizeText(classification.normalized?.message, 600),
            evidence: classification.evidence || null,
          }
        : null,
  };
}

export function handleDashboardStartupError({
  error,
  operation,
  module,
  phase,
  slug = null,
  querySlug = null,
  activeSlug = null,
  authState = null,
  saveState = null,
  captureIssue = captureEditorIssue,
  markStorageFailure = markBrowserStorageFailure,
  captureNonStorage = true,
} = {}) {
  const context = {
    operation,
    module,
    phase,
    slug,
    querySlug,
    activeSlug,
    authState,
    saveState,
  };
  const classification = classifyBrowserStorageError(error, context);

  let storageResult = null;
  if (classification.isBrowserStorageError) {
    storageResult = markStorageFailure(error, context);
  }

  const detail = buildDashboardStartupFailureDetail(context, classification);
  const reportDetail = classification.isBrowserStorageError
    ? {
        ...detail,
        storageRecoveryMarked: true,
      }
    : detail;
  const shouldCaptureIssue =
    classification.isBrowserStorageError || captureNonStorage !== false;
  const report =
    shouldCaptureIssue && typeof captureIssue === "function"
      ? captureIssue({
          source: "dashboard.startup",
          error: buildCaptureError(error, `${module || "dashboard"}:${operation || "startup"}`),
          detail: reportDetail,
          severity: classification.isBrowserStorageError ? "recoverable" : "error",
        })
      : null;

  return {
    ok: false,
    error,
    classification,
    isRecoverableStorageError: classification.isBrowserStorageError,
    shouldStopRetries: shouldStopBrowserStorageRetries(error, context),
    storageResult,
    report,
  };
}

export async function runDashboardStartupOperation({
  task,
  operation,
  module,
  phase,
  slug = null,
  querySlug = null,
  activeSlug = null,
  authState = null,
  saveState = null,
  captureIssue = captureEditorIssue,
  markStorageFailure = markBrowserStorageFailure,
  captureNonStorage = true,
} = {}) {
  try {
    const value = typeof task === "function" ? await task() : undefined;
    return {
      ok: true,
      value,
    };
  } catch (error) {
    return handleDashboardStartupError({
      error,
      operation,
      module,
      phase,
      slug,
      querySlug,
      activeSlug,
      authState,
      saveState,
      captureIssue,
      markStorageFailure,
      captureNonStorage,
    });
  }
}
