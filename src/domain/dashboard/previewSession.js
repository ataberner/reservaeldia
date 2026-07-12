import { getPublicationStatus } from "../publications/state.js";
import { normalizeDraftRenderState } from "../drafts/sourceOfTruth.js";
import { normalizeRsvpConfig } from "../rsvp/config.js";
import { normalizeGiftConfig } from "../gifts/config.js";
import { normalizeRenderAssetState } from "../../../shared/renderAssetContract.js";
import { prepareGroupAwareRenderState } from "../../../shared/groupRenderContract.js";
import {
  applyFunctionalAssociationsToRenderState,
  normalizeFunctionalConfigs,
} from "../../../shared/functionalAssociations.js";
import {
  normalizePublicSlug,
  parseSlugFromPublicUrl,
} from "../../lib/publicSlug.js";

const INITIAL_PUBLICATION_PREVIEW_STATE = Object.freeze({
  mostrarVistaPrevia: false,
  htmlVistaPrevia: null,
  previewAuthority: null,
  urlPublicaVistaPrevia: null,
  slugPublicoVistaPrevia: null,
  puedeActualizarPublicacion: false,
  publicacionVistaPreviaError: "",
  publicacionVistaPreviaOk: "",
  publishValidationResult: null,
  publishValidationPending: false,
  urlPublicadaReciente: null,
  mostrarCheckoutPublicacion: false,
  operacionCheckoutPublicacion: "new",
});

export const PREVIEW_AUTHORITY = Object.freeze({
  DRAFT_AUTHORITATIVE: "draft-authoritative",
  TEMPLATE_VISUAL: "template-visual",
  LOCAL_FALLBACK: "local-fallback",
});

export function isPublishAuthoritativePreviewAuthority(value) {
  return normalizeText(value) === PREVIEW_AUTHORITY.DRAFT_AUTHORITATIVE;
}

export const PREVIEW_INACTIVE_PUBLICATION_MESSAGE =
  "La publicacion anterior finalizo su vigencia. Puedes publicar nuevamente como nueva.";

function sanitizeDraftSlug(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeText(value) {
  return String(value || "").trim();
}

async function loadDashboardPreviewGeneratorModule() {
  return import("../../../functions/src/utils/generarHTMLDesdeSecciones");
}

export function createPublicationPreviewState(overrides = {}) {
  return {
    ...INITIAL_PUBLICATION_PREVIEW_STATE,
    ...overrides,
  };
}

export function buildDashboardPreviewOpenedState() {
  return createPublicationPreviewState({
    mostrarVistaPrevia: true,
  });
}

export function buildDashboardPreviewCloseState() {
  return createPublicationPreviewState();
}

export function buildDashboardPreviewCloseCheckoutStatePatch() {
  return {
    mostrarCheckoutPublicacion: false,
  };
}

export function buildDashboardPreviewOpenFlushFailureStatePatch({
  errorMessage = "",
} = {}) {
  return {
    publicacionVistaPreviaError: errorMessage || "",
    mostrarVistaPrevia: false,
  };
}

export function buildDashboardPreviewCheckoutClosedErrorStatePatch({
  errorMessage = "",
} = {}) {
  return {
    publicacionVistaPreviaError: errorMessage || "",
    publicacionVistaPreviaOk: "",
    mostrarCheckoutPublicacion: false,
  };
}

export function buildDashboardPreviewCheckoutReadyStatePatch({
  canUpdatePublication = false,
} = {}) {
  return {
    publicacionVistaPreviaError: "",
    publicacionVistaPreviaOk: "",
    operacionCheckoutPublicacion: canUpdatePublication ? "update" : "new",
    mostrarCheckoutPublicacion: true,
  };
}

export function buildDashboardPreviewPublishValidationIdleStatePatch() {
  return {
    publishValidationResult: null,
    publishValidationPending: false,
  };
}

export function buildDashboardPreviewPublishValidationPendingStatePatch() {
  return {
    publishValidationPending: true,
  };
}

export function buildDashboardPreviewPublishValidationResolvedStatePatch({
  validationResult,
} = {}) {
  return {
    publishValidationResult: validationResult || null,
  };
}

export function buildDashboardPreviewPublishValidationSettledStatePatch() {
  return {
    publishValidationPending: false,
  };
}

export function overlayLiveEditorSnapshot(data, liveEditorSnapshot) {
  if (!liveEditorSnapshot || typeof liveEditorSnapshot !== "object") {
    return data && typeof data === "object" ? data : {};
  }

  return {
    ...(data && typeof data === "object" ? data : {}),
    objetos: liveEditorSnapshot.objetos,
    secciones: liveEditorSnapshot.secciones,
  };
}

export function prepareDashboardPreviewRenderState(data) {
  const rawRenderState = normalizeDraftRenderState(data);
  const renderAssetState = normalizeRenderAssetState({
    objetos: rawRenderState.objetos,
    secciones: rawRenderState.secciones,
  });
  const groupAwareState = prepareGroupAwareRenderState({
    objetos: renderAssetState.objetos,
    secciones: renderAssetState.secciones,
  });
  const normalizedFunctionalConfigs = normalizeFunctionalConfigs({
    objetos: groupAwareState.objetos,
    rsvp: rawRenderState.rsvp,
    gifts: rawRenderState.gifts,
  });
  const functionalRenderState = applyFunctionalAssociationsToRenderState({
    objetos: groupAwareState.objetos,
    secciones: groupAwareState.secciones,
    rsvp: normalizedFunctionalConfigs.rsvp,
    gifts: normalizedFunctionalConfigs.gifts,
    materializeOffsets: true,
  });
  const finalGroupAwareState = prepareGroupAwareRenderState({
    objetos: functionalRenderState.objetos,
    secciones: functionalRenderState.secciones,
  });

  return {
    // Preview stays browser-safe here: canonicalize current asset aliases,
    // but keep publish-only preparation on the backend path.
    renderState: {
      ...rawRenderState,
      objetos: finalGroupAwareState.objetos,
      secciones: finalGroupAwareState.secciones,
    },
    rawRsvp: rawRenderState.rsvp || null,
    rawGifts: rawRenderState.gifts || null,
    normalizedRsvp: normalizedFunctionalConfigs.rsvp,
    normalizedGifts: normalizedFunctionalConfigs.gifts,
    preparedRenderContract: finalGroupAwareState.preparedRenderContract,
    contractIssues: finalGroupAwareState.contractIssues,
    runtimeSupport: finalGroupAwareState.runtimeSupport,
  };
}

export function buildDashboardPreviewRenderPayload(data) {
  const {
    renderState,
    rawRsvp,
    rawGifts,
    normalizedRsvp,
    normalizedGifts,
    preparedRenderContract,
    contractIssues,
    runtimeSupport,
  } = prepareDashboardPreviewRenderState(data);

  const rsvpPreviewConfig =
    normalizedRsvp && typeof normalizedRsvp === "object"
      ? normalizeRsvpConfig(
          {
            ...normalizedRsvp,
            title: normalizedRsvp?.title,
            subtitle: normalizedRsvp?.subtitle,
            buttonText: normalizedRsvp?.buttonText,
            primaryColor: normalizedRsvp?.primaryColor,
            sheetUrl: normalizedRsvp?.sheetUrl,
          },
          { forceEnabled: false }
        )
      : null;

  const giftPreviewConfig =
    normalizedGifts && typeof normalizedGifts === "object"
      ? normalizeGiftConfig(normalizedGifts, { forceEnabled: false })
      : null;

  return {
    renderState,
    objetos: renderState.objetos,
    secciones: renderState.secciones,
    rawRsvp,
    rawGifts,
    rsvpPreviewConfig,
    giftPreviewConfig,
    preparedRenderContract,
    contractIssues,
    runtimeSupport,
  };
}

export function isPublicacionActiva(data, nowMs = Date.now()) {
  if (!data || typeof data !== "object") return false;
  const status = getPublicationStatus(data, nowMs);
  if (status.isFinalized) return false;
  if (status.isTrashed) return false;
  return status.isActive || status.isPaused;
}

export function buildDashboardPreviewGeneratorInput({
  previewPayload,
  slugPublicoDetectado = "",
  urlPublicaDetectada = "",
  slugInvitacion = "",
} = {}) {
  const safePreviewPayload =
    previewPayload && typeof previewPayload === "object" ? previewPayload : {};
  const slugPreview = String(
    normalizePublicSlug(slugPublicoDetectado) ||
      normalizePublicSlug(urlPublicaDetectada) ||
      sanitizeDraftSlug(slugInvitacion) ||
      ""
  ).trim();

  return {
    slugPreview,
    generatorOptions: {
      slug: slugPreview,
      isPreview: true,
      gifts: safePreviewPayload.giftPreviewConfig || null,
      rsvpSource: safePreviewPayload.rsvpPreviewConfig ?? safePreviewPayload.rawRsvp ?? null,
      giftsSource: safePreviewPayload.giftPreviewConfig ?? safePreviewPayload.rawGifts ?? null,
    },
  };
}

export async function generateDashboardPreviewHtmlFromRenderState({
  previewSourceData = null,
  previewPayload = null,
  slugPublicoDetectado = "",
  urlPublicaDetectada = "",
  slugInvitacion = "",
  generateHtmlFromSections = null,
} = {}) {
  const resolvedPreviewPayload =
    previewPayload && typeof previewPayload === "object"
      ? previewPayload
      : buildDashboardPreviewRenderPayload(previewSourceData);
  const generatorInput = buildDashboardPreviewGeneratorInput({
    previewPayload: resolvedPreviewPayload,
    slugPublicoDetectado,
    urlPublicaDetectada,
    slugInvitacion,
  });
  const renderHtml =
    typeof generateHtmlFromSections === "function"
      ? generateHtmlFromSections
      : async (secciones, objetos, rsvpPreviewConfig, generatorOptions) => {
          const { generarHTMLDesdeSecciones } =
            await loadDashboardPreviewGeneratorModule();
          return generarHTMLDesdeSecciones(
            secciones,
            objetos,
            rsvpPreviewConfig,
            generatorOptions
          );
        };
  const htmlGenerado = await renderHtml(
    resolvedPreviewPayload.secciones,
    resolvedPreviewPayload.objetos,
    resolvedPreviewPayload.rsvpPreviewConfig,
    generatorInput.generatorOptions
  );

  return {
    previewPayload: resolvedPreviewPayload,
    generatorInput,
    htmlGenerado: String(htmlGenerado || ""),
  };
}

export function resolveDashboardPreviewPublicationState({
  isTemplateEditorSession = false,
  urlPublicaDetectada = "",
  slugPublicoDetectado = "",
  publicacionNoVigenteDetectada = false,
  currentError = "",
} = {}) {
  if (isTemplateEditorSession) {
    return {
      urlPublicaVistaPrevia: null,
      slugPublicoVistaPrevia: null,
      puedeActualizarPublicacion: false,
      publicacionVistaPreviaError: normalizeText(currentError),
    };
  }

  const safePublicUrl = normalizeText(urlPublicaDetectada);
  const normalizedPublicSlug =
    normalizePublicSlug(slugPublicoDetectado) ||
    normalizePublicSlug(safePublicUrl) ||
    null;

  return {
    urlPublicaVistaPrevia: safePublicUrl || null,
    slugPublicoVistaPrevia: normalizedPublicSlug,
    puedeActualizarPublicacion: Boolean(normalizedPublicSlug),
    publicacionVistaPreviaError:
      publicacionNoVigenteDetectada && !normalizedPublicSlug
        ? PREVIEW_INACTIVE_PUBLICATION_MESSAGE
        : normalizeText(currentError),
  };
}

export function buildDashboardPreviewSuccessStatePatch({
  htmlGenerado,
  previewAuthority = null,
  isTemplateEditorSession = false,
  urlPublicaDetectada = "",
  slugPublicoDetectado = "",
  publicacionNoVigenteDetectada = false,
  currentError = "",
} = {}) {
  const resolvedPreviewAuthority =
    normalizeText(previewAuthority) ||
    (isTemplateEditorSession ? PREVIEW_AUTHORITY.TEMPLATE_VISUAL : "");

  return {
    htmlVistaPrevia: String(htmlGenerado || ""),
    previewAuthority: resolvedPreviewAuthority || null,
    ...resolveDashboardPreviewPublicationState({
      isTemplateEditorSession,
      urlPublicaDetectada,
      slugPublicoDetectado,
      publicacionNoVigenteDetectada,
      currentError,
    }),
  };
}

export function buildDashboardPreviewCheckoutPublishedStatePatch({
  payload,
  currentPreviewPublicUrl = "",
  currentPublishedUrl = "",
  currentPublicSlug = "",
} = {}) {
  const safePublicUrl = normalizeText(payload?.publicUrl);
  const nextPublicSlug =
    normalizePublicSlug(payload?.publicSlug) ||
    parseSlugFromPublicUrl(safePublicUrl);
  const fallbackPublicSlug = normalizePublicSlug(currentPublicSlug) || null;

  return {
    urlPublicaVistaPrevia: safePublicUrl || currentPreviewPublicUrl || null,
    urlPublicadaReciente: safePublicUrl || currentPublishedUrl || null,
    slugPublicoVistaPrevia: nextPublicSlug || fallbackPublicSlug,
    puedeActualizarPublicacion: Boolean(nextPublicSlug || fallbackPublicSlug),
    publicacionVistaPreviaError: "",
    publicacionVistaPreviaOk:
      payload?.operation === "update"
        ? "Invitacion actualizada correctamente."
        : "Invitacion publicada correctamente.",
  };
}

export function buildPreviewDisplayUrl({
  isTemplateEditorSession = false,
  urlPublicadaReciente = "",
  urlPublicaVistaPrevia = "",
  slugPublicoVistaPrevia = "",
  slugInvitacion = "",
} = {}) {
  if (isTemplateEditorSession) return "";

  const explicitPublicUrl = String(
    urlPublicadaReciente || urlPublicaVistaPrevia || ""
  ).trim();
  if (explicitPublicUrl) return explicitPublicUrl;

  const previewSlug = String(
    normalizePublicSlug(slugPublicoVistaPrevia) ||
      sanitizeDraftSlug(slugInvitacion) ||
      ""
  ).trim();

  return previewSlug
    ? `https://reservaeldia.com.ar/i/${previewSlug}`
    : "https://reservaeldia.com.ar/i/...";
}
