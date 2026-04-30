import {
  generateDashboardPreviewHtmlFromRenderState,
  PREVIEW_AUTHORITY,
} from "../dashboard/previewSession.js";
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

export async function generateTemplatePreviewHtml(template) {
  const safeTemplate = template && typeof template === "object" ? template : null;
  if (!safeTemplate) {
    throw new Error("Plantilla invalida para vista previa.");
  }

  const { objetos, secciones } = normalizeTemplateArrays(safeTemplate);
  if (!secciones.length || !objetos.length) {
    throw new Error("La plantilla no tiene contenido renderizable.");
  }

  const slugPreview = String(safeTemplate.id || "template-preview").trim();
  const { htmlGenerado } = await generateDashboardPreviewHtmlFromRenderState({
    previewSourceData: {
      ...safeTemplate,
      objetos,
      secciones,
      rsvp: safeTemplate.rsvp ?? null,
      gifts: safeTemplate.gifts ?? null,
    },
    slugInvitacion: slugPreview,
  });

  if (!String(htmlGenerado || "").trim()) {
    throw new Error("No se pudo generar el HTML de vista previa.");
  }

  return htmlGenerado;
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
  void previewUrlFailed;
  const source = resolveTemplatePreviewSource(template);
  const status = normalizeText(previewStatus?.status, previewHtml ? "ready" : "idle");
  const previewUrl = source.mode === "url" ? source.previewUrl : null;
  const hasPreviewUrl = Boolean(previewUrl);
  const shouldShowGeneratedPreview = status === "ready" && Boolean(previewHtml);

  return {
    status,
    previewAuthority: PREVIEW_AUTHORITY.TEMPLATE_VISUAL,
    sourceMode: "generated",
    activeMode: shouldShowGeneratedPreview ? "generated" : "none",
    previewUrl,
    hasPreviewUrl,
    shouldShowGeneratedPreview,
    shouldShowPreviewUrl: false,
    canPatchPreview: shouldShowGeneratedPreview,
    canCaptureTextPositions: shouldShowGeneratedPreview,
    shouldShowLoadingState: status === "idle" || status === "loading",
    shouldShowErrorState: status === "error",
    shouldShowMissingPreviewState: status === "ready" && !previewHtml,
  };
}
