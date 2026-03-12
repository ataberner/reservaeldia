import { normalizeRsvpConfig } from "@/domain/rsvp/config";
import { normalizeGiftConfig } from "@/domain/gifts/config";
import { resolveTemplatePreviewSource as resolveTemplatePreviewSourceContract } from "../../../shared/templates/contract.js";

function normalizeTemplateArrays(template) {
  const safeTemplate = template && typeof template === "object" ? template : {};
  return {
    objetos: Array.isArray(safeTemplate.objetos) ? safeTemplate.objetos : [],
    secciones: Array.isArray(safeTemplate.secciones) ? safeTemplate.secciones : [],
  };
}

function buildRsvpPreviewConfig(rawRsvp) {
  const source = rawRsvp && typeof rawRsvp === "object" ? rawRsvp : {};
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
  const source = rawGifts && typeof rawGifts === "object" ? rawGifts : {};
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
  });

  if (!String(html || "").trim()) {
    throw new Error("No se pudo generar el HTML de vista previa.");
  }

  return html;
}

export function resolveTemplatePreviewSource(template) {
  return resolveTemplatePreviewSourceContract(template);
}
