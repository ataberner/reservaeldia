import { parseSlugFromPublicUrl } from "../../lib/publicSlug.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

export const PUBLICATION_PUBLISHING_STAGES = Object.freeze([
  {
    key: "preparing_invitation",
    order: 1,
    label: "Preparando invitacion",
  },
  {
    key: "validating_content",
    order: 2,
    label: "Validando contenido",
  },
  {
    key: "generating_public_html",
    order: 3,
    label: "Generando HTML publico",
  },
  {
    key: "generating_share_image",
    order: 4,
    label: "Generando imagen para compartir",
  },
  {
    key: "saving_publication",
    order: 5,
    label: "Guardando publicacion",
  },
  {
    key: "finalizing_publication",
    order: 6,
    label: "Finalizando publicacion",
  },
]);

const PUBLISHING_STAGE_BY_KEY = new Map(
  PUBLICATION_PUBLISHING_STAGES.map((stage) => [stage.key, stage])
);

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

export function isRetryablePublishFailureStatusPayload(payload = {}) {
  const record = asRecord(payload) || {};
  const status = normalizeText(record.sessionStatus || record.status || payload);
  const errorMessage = normalizeText(record.errorMessage || record.lastError);

  return status === "payment_approved" && Boolean(errorMessage);
}

export function resolvePublicationAutoRetryState(payload = {}) {
  const record = asRecord(payload) || {};
  const retryRecord = asRecord(record.publicationAutoRetry);
  const status = normalizeText(retryRecord?.status);
  const attempt = Number(retryRecord?.attempt || retryRecord?.attempts) || 0;
  const maxAttempts = Number(retryRecord?.maxAttempts) || 0;
  const nextAttempt = Number(retryRecord?.nextAttempt) || 0;
  const lastError = normalizeText(retryRecord?.lastError);
  const lastErrorCode = normalizeText(retryRecord?.lastErrorCode);
  const reason = normalizeText(retryRecord?.reason);
  const active = status === "scheduled" || status === "running";

  return {
    status,
    attempt,
    maxAttempts,
    nextAttempt,
    lastError,
    lastErrorCode,
    reason,
    isActive: active,
    isScheduled: status === "scheduled",
    isRunning: status === "running",
    isExhausted: status === "exhausted",
    isNotRetryable: status === "not_retryable",
    isSucceeded: status === "succeeded",
  };
}

export function buildPublicationAutoRetryUserMessage(payload = {}) {
  const retry = resolvePublicationAutoRetryState(payload);
  if (!retry.isActive) return "";

  const attemptText =
    retry.nextAttempt && retry.maxAttempts
      ? ` Intento ${retry.nextAttempt} de ${retry.maxAttempts}.`
      : "";

  return `Estamos finalizando tu publicacion. Esto puede tardar unos segundos mas.${attemptText} No necesitas volver a pagar.`;
}

export function isTerminalCheckoutFailureStatus(value) {
  const status = normalizeText(value);
  return status === "payment_rejected" || status === "expired";
}

export function isRecoverableCheckoutStatus(value) {
  return normalizeText(value) === "approved_slug_conflict";
}

export function resolveCheckoutStatusFlowState(value) {
  const payload = asRecord(value);
  const status = normalizeText(payload?.sessionStatus || payload?.status || value);
  const autoRetry = resolvePublicationAutoRetryState(payload || {});
  const isRetryablePublishFailure = isRetryablePublishFailureStatusPayload(
    payload || { sessionStatus: status }
  );
  const isTerminalSuccess = isPublishedCheckoutStatus(status);
  const isProcessing =
    autoRetry.isActive || (!isRetryablePublishFailure && isProcessingCheckoutStatus(status));
  const isRecoverable = isRecoverableCheckoutStatus(status);
  const isTerminalFailure = isTerminalCheckoutFailureStatus(status);

  return {
    status,
    isProcessing,
    isRecoverable,
    isTerminalSuccess,
    isTerminalFailure,
    isRetryablePublishFailure,
    isAutoRetryingPublication: autoRetry.isActive,
    shouldContinuePolling: isProcessing,
    shouldClearPolling:
      isTerminalSuccess || isRecoverable || isTerminalFailure || isRetryablePublishFailure,
  };
}

export function resolvePublishingProgressState(payload = {}) {
  const record = asRecord(payload) || {};
  const currentStageRecord = asRecord(record.publishingStage);
  const currentSubstageRecord =
    asRecord(currentStageRecord?.substage) ||
    asRecord(record.publishingShareImageSubstage);
  const currentKey = normalizeText(currentStageRecord?.key);
  const knownCurrent = PUBLISHING_STAGE_BY_KEY.get(currentKey);
  const currentStatus = normalizeText(currentStageRecord?.status) || "";
  const currentSubstage = currentSubstageRecord
    ? {
        key: normalizeText(currentSubstageRecord.key),
        label: normalizeText(currentSubstageRecord.label),
        status: normalizeText(currentSubstageRecord.status) || "",
        errorCode: normalizeText(currentSubstageRecord.errorCode),
        durationMs: Number(currentSubstageRecord.durationMs) || null,
      }
    : null;
  const currentStage = knownCurrent
    ? {
        ...knownCurrent,
        status: currentStatus || "running",
        errorCode: normalizeText(currentStageRecord?.errorCode),
        durationMs: Number(currentStageRecord?.durationMs) || null,
        substage: currentSubstage?.key ? currentSubstage : null,
      }
    : null;
  const currentOrder = currentStage?.order || 0;

  const steps = PUBLICATION_PUBLISHING_STAGES.map((stage) => {
    let status = "pending";
    if (currentStage) {
      if (stage.order < currentOrder) {
        status = "completed";
      } else if (stage.key === currentStage.key) {
        status = currentStage.status || "running";
      }
    }

    return {
      ...stage,
      status,
    };
  });

  return {
    currentStage,
    steps,
    hasProgress: Boolean(currentStage),
  };
}

export function buildPublishFailureUserMessage(payload = {}) {
  const record = asRecord(payload) || {};
  const progress = resolvePublishingProgressState(record);
  const stageLabel = progress.currentStage?.label || "Publicacion";
  const substageLabel = progress.currentStage?.substage?.label || "";
  const errorMessage = normalizeText(record.errorMessage || record.lastError);
  const errorCode =
    progress.currentStage?.substage?.errorCode ||
    progress.currentStage?.errorCode ||
    errorMessage;

  if (
    progress.currentStage?.key === "generating_share_image" &&
    (errorCode === "renderer-timeout" || /renderer-timeout|timeout/i.test(errorCode))
  ) {
    const detail = substageLabel ? ` El bloqueo aparecio en: ${substageLabel}.` : "";
    return `Fallo en: ${stageLabel}.${detail} No pudimos generar la imagen para compartir en este intento. Tu pago quedo aprobado y podes reintentar la publicacion sin volver a pagar.`;
  }

  if (progress.currentStage?.key) {
    const detail = substageLabel ? ` El bloqueo aparecio en: ${substageLabel}.` : "";
    return `Fallo en: ${stageLabel}.${detail} Tu pago quedo aprobado, pero la publicacion no se pudo completar en este intento.`;
  }

  return (
    errorMessage ||
    "Tu pago quedo aprobado, pero la publicacion no se pudo completar en este intento."
  );
}
