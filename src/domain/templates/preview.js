import { normalizeRsvpConfig } from "../rsvp/config.js";
import { normalizeGiftConfig } from "../gifts/config.js";
import { resolveTemplatePreviewSource as resolveTemplatePreviewSourceContract } from "../../../shared/templates/contract.js";

function normalizeTemplateArrays(template) {
  const safeTemplate = template && typeof template === "object" ? template : {};
  return {
    objetos: Array.isArray(safeTemplate.objetos) ? safeTemplate.objetos : [],
    secciones: Array.isArray(safeTemplate.secciones) ? safeTemplate.secciones : [],
  };
}

function normalizeText(value, fallback = "") {
  const safe = String(value || "").trim();
  return safe || fallback;
}

function buildRsvpPreviewConfig(rawRsvp) {
  const source = rawRsvp && typeof rawRsvp === "object" ? rawRsvp : null;
  if (!source) return null;
  return normalizeRsvpConfig(
    {
      ...source,
      enabled: source?.enabled !== false,
      title: source?.title,
      subtitle: source?.subtitle,
      buttonText: source?.buttonText,
      primaryColor: source?.primaryColor,
      sheetUrl: source?.sheetUrl,
    },
    { forceEnabled: false }
  );
}

function buildGiftPreviewConfig(rawGifts) {
  const source = rawGifts && typeof rawGifts === "object" ? rawGifts : null;
  if (!source) return null;
  return normalizeGiftConfig({
    ...source,
    enabled: source?.enabled !== false,
  });
}

export async function generateTemplatePreviewHtml(template) {
  const safeTemplate = template && typeof template === "object" ? template : null;
  if (!safeTemplate) {
    throw new Error("Plantilla invalida para vista previa.");
  }

  const { objetos, secciones } = normalizeTemplateArrays(safeTemplate);
  if (!secciones.length || !objetos.length) {
    throw new Error("La plantilla no tiene contenido renderizable.");
  }

  const rsvpPreviewConfig = buildRsvpPreviewConfig(safeTemplate.rsvp);
  const giftPreviewConfig = buildGiftPreviewConfig(safeTemplate.gifts);
  const { generarHTMLDesdeSecciones } = await import(
    "../../../functions/src/utils/generarHTMLDesdeSecciones"
  );

  const slugPreview = String(safeTemplate.id || "template-preview").trim();
  const html = generarHTMLDesdeSecciones(secciones, objetos, rsvpPreviewConfig, {
    slug: slugPreview,
    isPreview: true,
    gifts: giftPreviewConfig,
    rsvpSource: safeTemplate.rsvp ?? null,
    giftsSource: safeTemplate.gifts ?? null,
  });

  if (!String(html || "").trim()) {
    throw new Error("No se pudo generar el HTML de vista previa.");
  }

  return html;
}

export function resolveTemplatePreviewSource(template) {
  return resolveTemplatePreviewSourceContract(template);
}

export function resolveTemplatePreviewRuntimeState({
  template,
  previewHtml,
  previewStatus,
  previewUrlFailed = false,
} = {}) {
  const source = resolveTemplatePreviewSource(template);
  const status = normalizeText(previewStatus?.status, previewHtml ? "ready" : "idle");
  const previewUrl = source.mode === "url" ? source.previewUrl : null;
  const hasPreviewUrl = Boolean(previewUrl);
  const shouldShowGeneratedPreview = status === "ready" && Boolean(previewHtml);
  const shouldShowPreviewUrl =
    hasPreviewUrl &&
    previewUrlFailed !== true &&
    !shouldShowGeneratedPreview &&
    status !== "loading";

  return {
    status,
    sourceMode: source.mode,
    activeMode: shouldShowGeneratedPreview ? "generated" : shouldShowPreviewUrl ? "url" : "none",
    previewUrl,
    hasPreviewUrl,
    shouldShowGeneratedPreview,
    shouldShowPreviewUrl,
    canPatchPreview: shouldShowGeneratedPreview,
    canCaptureTextPositions: shouldShowGeneratedPreview,
    shouldShowLoadingState:
      !shouldShowPreviewUrl && (status === "idle" || status === "loading"),
    shouldShowErrorState: !shouldShowPreviewUrl && status === "error",
    shouldShowMissingPreviewState:
      !shouldShowPreviewUrl && status === "ready" && !previewHtml,
  };
}
