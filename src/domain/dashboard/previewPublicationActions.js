import { sanitizeDraftSlug } from "../invitations/readResolution.js";

const FALLBACK_PREVIEW_PUBLISH_BLOCKING_MESSAGE =
  "Hay contratos de render que todavia no son seguros para publicar.";
const PUBLISHED_COUNTDOWN_AUDIT_DELAYS_MS = Object.freeze([900, 2200, 5000]);

function normalizeText(value) {
  return String(value || "").trim();
}

async function loadPublicationsServiceModule() {
  return import("../publications/service.js");
}

async function loadCountdownAuditRuntimeModule() {
  return import("../countdownAudit/runtime.js");
}

export async function runDashboardPreviewPublishValidation({
  draftSlug,
  canUsePublishCompatibility = false,
  validateDraftForPublication,
} = {}) {
  const safeDraftSlug = sanitizeDraftSlug(draftSlug);

  if (!canUsePublishCompatibility || !safeDraftSlug) {
    return null;
  }

  const validateDraftForPublicationAction =
    typeof validateDraftForPublication === "function"
      ? validateDraftForPublication
      : async ({ draftSlug: nextDraftSlug }) => {
          const { validateDraftForPublication: validateDraftForPublicationFromService } =
            await loadPublicationsServiceModule();

          return validateDraftForPublicationFromService({
            draftSlug: nextDraftSlug,
          });
        };

  const result = await validateDraftForPublicationAction({
    draftSlug: safeDraftSlug,
  });

  return result || null;
}

export function resolveDashboardPreviewPublishAction({
  validationResult,
} = {}) {
  if (
    Array.isArray(validationResult?.blockers) &&
    validationResult.blockers.length > 0
  ) {
    return {
      status: "blocked",
      blockingMessage:
        validationResult?.summary?.blockingMessage ||
        FALLBACK_PREVIEW_PUBLISH_BLOCKING_MESSAGE,
    };
  }

  return {
    status: "ready",
  };
}

export function scheduleDashboardPreviewPublishedAuditCapture({
  publicUrl,
  fallbackHtml = "",
  windowObject = typeof window !== "undefined" ? window : null,
  loadCountdownAuditRuntimeModule: loadCountdownAuditRuntimeModuleOverride,
  scheduleTimeout,
} = {}) {
  const safePublicUrl = normalizeText(publicUrl);
  const safeFallbackHtml = normalizeText(fallbackHtml);
  const loadCountdownAuditRuntime =
    typeof loadCountdownAuditRuntimeModuleOverride === "function"
      ? loadCountdownAuditRuntimeModuleOverride
      : loadCountdownAuditRuntimeModule;

  if (safeFallbackHtml) {
    void loadCountdownAuditRuntime()
      .then(({ captureCountdownAuditFromHtmlString }) =>
        captureCountdownAuditFromHtmlString(safeFallbackHtml, {
          stage: "published-html",
          renderer: "dom-generated",
          sourceDocument: "publish-preview-html",
          viewport: "public",
          wrapperScale: 1,
          usesRasterThumbnail: false,
        })
      )
      .catch(() => {});
  }

  if (!windowObject || !safePublicUrl) return;

  const scheduleDelay =
    typeof scheduleTimeout === "function"
      ? scheduleTimeout
      : (callback, delayMs) => windowObject.setTimeout(callback, delayMs);

  PUBLISHED_COUNTDOWN_AUDIT_DELAYS_MS.forEach((delayMs) => {
    scheduleDelay(() => {
      void loadCountdownAuditRuntime()
        .then(({ captureCountdownAuditPublicationHtml }) =>
          captureCountdownAuditPublicationHtml(safePublicUrl)
        )
        .catch(() => {});
    }, delayMs);
  });
}
