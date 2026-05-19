import { parseSlugFromPublicUrl } from "../../lib/publicSlug.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

export function buildCheckoutModalContextKey({
  draftSlug = "",
  operation = "new",
} = {}) {
  const safeDraftSlug = normalizeText(draftSlug);
  const safeOperation = normalizeText(operation) || "new";
  return `${safeDraftSlug}::${safeOperation}`;
}

export function resolveCheckoutModalInitialization({
  visible = false,
  draftSlug = "",
  operation = "new",
  previousVisible = false,
  previousContextKey = "",
} = {}) {
  const nextVisible = visible === true;
  const nextContextKey = nextVisible
    ? buildCheckoutModalContextKey({ draftSlug, operation })
    : "";

  return {
    shouldInitialize:
      nextVisible &&
      (previousVisible !== true ||
        normalizeText(previousContextKey) !== nextContextKey),
    nextTracker: {
      visible: nextVisible,
      contextKey: nextContextKey,
    },
  };
}

export function resolveTerminalPublicationResult({
  publicUrl = "",
  publicSlug = "",
  receiptData = null,
  operation = "new",
} = {}) {
  const receiptRecord = asRecord(receiptData);
  const finalPublicUrl =
    normalizeText(publicUrl) || normalizeText(receiptRecord?.publicUrl);
  const finalPublicSlug =
    normalizeText(publicSlug) ||
    parseSlugFromPublicUrl(finalPublicUrl) ||
    normalizeText(receiptRecord?.publicSlug);

  if (!finalPublicUrl) {
    return {
      publicUrl: "",
      publicSlug: finalPublicSlug || "",
      receipt: null,
    };
  }

  return {
    publicUrl: finalPublicUrl,
    publicSlug: finalPublicSlug || "",
    receipt: {
      ...(receiptRecord || {}),
      operation: normalizeText(receiptRecord?.operation) || normalizeText(operation) || "new",
      publicUrl: finalPublicUrl,
      publicSlug: finalPublicSlug || null,
    },
  };
}

export function isPublishedCheckoutStatus(value) {
  return normalizeText(value) === "published";
}

export function isProcessingCheckoutStatus(value) {
  const status = normalizeText(value);
  return (
    status === "payment_processing" ||
    status === "payment_approved" ||
    status === "publishing"
  );
}

export function isTerminalCheckoutFailureStatus(value) {
  const status = normalizeText(value);
  return status === "payment_rejected" || status === "expired";
}

export function isRecoverableCheckoutStatus(value) {
  return normalizeText(value) === "approved_slug_conflict";
}

export function resolveCheckoutStatusFlowState(value) {
  const status = normalizeText(value);
  const isTerminalSuccess = isPublishedCheckoutStatus(status);
  const isProcessing = isProcessingCheckoutStatus(status);
  const isRecoverable = isRecoverableCheckoutStatus(status);
  const isTerminalFailure = isTerminalCheckoutFailureStatus(status);

  return {
    status,
    isProcessing,
    isRecoverable,
    isTerminalSuccess,
    isTerminalFailure,
    shouldContinuePolling: isProcessing,
    shouldClearPolling: isTerminalSuccess || isRecoverable || isTerminalFailure,
  };
}
