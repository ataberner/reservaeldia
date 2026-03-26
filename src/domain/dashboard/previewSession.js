import { getPublicationStatus } from "../publications/state.js";
import { normalizeDraftRenderState } from "../drafts/sourceOfTruth.js";
import { normalizeRsvpConfig } from "../rsvp/config.js";
import { normalizeGiftConfig } from "../gifts/config.js";
import { normalizePublicSlug } from "../../lib/publicSlug.js";

const INITIAL_PUBLICATION_PREVIEW_STATE = Object.freeze({
  mostrarVistaPrevia: false,
  htmlVistaPrevia: null,
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

function sanitizeDraftSlug(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function createPublicationPreviewState(overrides = {}) {
  return {
    ...INITIAL_PUBLICATION_PREVIEW_STATE,
    ...overrides,
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
    rsvp: liveEditorSnapshot.rsvp,
    gifts: liveEditorSnapshot.gifts,
  };
}

export function buildDashboardPreviewRenderPayload(data) {
  const renderState = normalizeDraftRenderState(data);
  const rawRsvp = renderState.rsvp || null;
  const rawGifts = renderState.gifts || null;

  const rsvpPreviewConfig =
    rawRsvp && typeof rawRsvp === "object"
      ? normalizeRsvpConfig(
          {
            ...rawRsvp,
            enabled: rawRsvp?.enabled !== false,
            title: rawRsvp?.title,
            subtitle: rawRsvp?.subtitle,
            buttonText: rawRsvp?.buttonText,
            primaryColor: rawRsvp?.primaryColor,
            sheetUrl: rawRsvp?.sheetUrl,
          },
          { forceEnabled: false }
        )
      : null;

  const giftPreviewConfig =
    rawGifts && typeof rawGifts === "object"
      ? normalizeGiftConfig({
          ...rawGifts,
          enabled: rawGifts?.enabled !== false,
        })
      : null;

  return {
    renderState,
    objetos: renderState.objetos,
    secciones: renderState.secciones,
    rawRsvp,
    rawGifts,
    rsvpPreviewConfig,
    giftPreviewConfig,
  };
}

export function isPublicacionActiva(data, nowMs = Date.now()) {
  if (!data || typeof data !== "object") return false;
  const status = getPublicationStatus(data, nowMs);
  if (status.isFinalized) return false;
  if (status.isTrashed) return false;
  return status.isActive || status.isPaused;
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
