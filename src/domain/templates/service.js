import { httpsCallable } from "firebase/functions";
import { functions as cloudFunctions } from "@/firebase";

const copiarPlantillaCallable = httpsCallable(cloudFunctions, "copiarPlantilla");

function normalizeText(value) {
  return String(value || "").trim();
}

function slugify(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function buildDraftSlug(templateName) {
  const baseName = slugify(templateName) || "plantilla";
  return `${baseName}-${Date.now()}`;
}

export async function createDraftFromTemplate({ templateId, templateName }) {
  const safeTemplateId = normalizeText(templateId);
  if (!safeTemplateId) {
    throw new Error("No se pudo crear el borrador: plantilla invalida.");
  }

  const slug = buildDraftSlug(templateName);
  const result = await copiarPlantillaCallable({
    plantillaId: safeTemplateId,
    slug,
  });

  const createdSlug = normalizeText(result?.data?.slug) || slug;
  if (!createdSlug) {
    throw new Error("No se pudo crear el borrador desde la plantilla.");
  }

  return { slug: createdSlug };
}
