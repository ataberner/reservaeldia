import { httpsCallable } from "firebase/functions";
import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db, functions as cloudFunctions } from "@/firebase";
import {
  getTemplateById as getTemplateByIdFromRepository,
  listTemplates as listTemplatesFromRepository,
} from "./repository.js";
import { buildTemplateFormState, resolveTemplateInputValues } from "./formModel.js";
import { buildDraftPersonalizationPatch } from "./personalization.js";
import { uploadTemplateGalleryFiles } from "./galleryUpload.js";
import {
  DRAFT_SOURCE_OF_TRUTH_VERSION,
  buildDraftContentMeta,
  normalizeDraftRenderState,
} from "@/domain/drafts/sourceOfTruth";

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

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeGalleryFilesByField(value) {
  const source = asObject(value);
  const out = {};
  const hasFileCtor = typeof File === "function";

  Object.entries(source).forEach(([fieldKey, files]) => {
    if (!Array.isArray(files)) return;
    const filtered = files.filter((file) =>
      hasFileCtor ? file instanceof File : Boolean(file && typeof file === "object")
    );
    if (!filtered.length) return;
    out[fieldKey] = filtered;
  });

  return out;
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

export async function createDraftFromTemplateWithInput({
  template,
  userId,
  rawValues,
  galleryFilesByField,
  applyChanges = false,
}) {
  const safeTemplate = asObject(template);
  const templateId = normalizeText(safeTemplate.id);
  const templateName = normalizeText(safeTemplate.nombre) || "Plantilla";

  if (!templateId) {
    throw new Error("No se pudo crear el borrador: plantilla invalida.");
  }

  const { slug } = await createDraftFromTemplate({
    templateId,
    templateName,
  });

  if (!applyChanges) {
    return {
      slug,
      applied: false,
      changedKeys: [],
    };
  }

  const formState = buildTemplateFormState(safeTemplate);
  const imageFields = formState.fields.filter((field) => field.type === "images");
  const normalizedGalleryFilesByField = normalizeGalleryFilesByField(galleryFilesByField);
  const uploadedGalleryUrlsByField = {};

  for (const field of imageFields) {
    const files = normalizedGalleryFilesByField[field.key] || [];
    if (!files.length) continue;

    const urls = await uploadTemplateGalleryFiles({
      userId,
      templateId,
      fieldKey: field.key,
      files,
      field,
      galleryRules: safeTemplate.galleryRules,
    });
    if (urls.length) {
      uploadedGalleryUrlsByField[field.key] = urls;
    }
  }

  const { resolvedValues } = resolveTemplateInputValues({
    template: safeTemplate,
    rawValues,
    galleryUrlsByField: uploadedGalleryUrlsByField,
  });

  const draftRef = doc(db, "borradores", slug);
  const draftSnap = await getDoc(draftRef);
  if (!draftSnap.exists()) {
    throw new Error("No se encontro el borrador recien creado para aplicar cambios.");
  }

  const draftData = draftSnap.data() || {};
  const draftRenderState = normalizeDraftRenderState(draftData);
  const personalizationPatch = buildDraftPersonalizationPatch({
    template: safeTemplate,
    draftData: draftRenderState,
    resolvedValues,
  });
  const skippedFields = Array.isArray(personalizationPatch?.applyReport?.skippedFields)
    ? personalizationPatch.applyReport.skippedFields
    : [];
  if (skippedFields.length > 0) {
    const list = skippedFields.slice(0, 3).join(", ");
    const suffix = skippedFields.length > 3 ? ", ..." : "";
    throw new Error(
      `No se pudieron aplicar todos los cambios de la plantilla. Campos sin mapping: ${list}${suffix}.`
    );
  }

  await updateDoc(draftRef, {
    objetos: personalizationPatch.objetos,
    secciones: personalizationPatch.secciones,
    rsvp: personalizationPatch.rsvp,
    templateInput: {
      initialValues: resolvedValues,
      values: resolvedValues,
      defaults: personalizationPatch.defaults,
      changedKeys: personalizationPatch.changedKeys,
      applyReport: personalizationPatch.applyReport,
      appliedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      policyVersion: DRAFT_SOURCE_OF_TRUTH_VERSION,
    },
    draftContentMeta: {
      ...buildDraftContentMeta({
        lastWriter: "modal",
        reason: "template-modal-apply",
      }),
      updatedAt: serverTimestamp(),
    },
    ultimaEdicion: serverTimestamp(),
  });

  return {
    slug,
    applied: true,
    changedKeys: personalizationPatch.changedKeys,
    applyReport: personalizationPatch.applyReport,
  };
}

export async function listTemplates({ tipo } = {}) {
  return listTemplatesFromRepository({ tipo });
}

export async function getTemplateById(id) {
  return getTemplateByIdFromRepository(id);
}
