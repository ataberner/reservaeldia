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
import { buildTemplateFormState } from "./formModel.js";
import {
  preparePostCopyTemplatePersonalizationPatch,
} from "./personalization.js";
import { uploadTemplateGalleryFiles } from "./galleryUpload.js";
import {
  DRAFT_SOURCE_OF_TRUTH_VERSION,
  buildDraftContentMeta,
  normalizeDraftRenderState,
} from "@/domain/drafts/sourceOfTruth";
import { captureCountdownAuditDraftDocument } from "@/domain/countdownAudit/runtime";
import { shouldPreserveTextCenterPosition } from "@/lib/textCenteringPolicy";
import {
  groupTemplateDraftDebug,
  logTemplateDraftDebug,
  setTemplateDraftDebugSession,
} from "./draftPersonalizationDebug.js";
import { resolveTemplatePersonalizationInput } from "./personalizationContract.js";

const copiarPlantillaCallable = httpsCallable(cloudFunctions, "copiarPlantilla");
const CREATE_DRAFT_CALLABLE_TIMEOUT_MS = 12000;
const DRAFT_CREATION_CONFIRMATION_DELAYS_MS = [0, 220, 420, 760, 1100, 1800, 2600];
const DRAFT_READ_RETRY_DELAYS_MS = [0, 180, 320, 520, 800];
const DRAFT_TEXT_FONT_LOAD_TIMEOUT_MS = 4000;
const DRAFT_TEXT_FONT_DOCUMENT_TIMEOUT_MS = 4500;
const DRAFT_TEXT_PREPARATION_TIMEOUT_MS = 2200;

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

function delay(ms) {
  const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
  return new Promise((resolve) => {
    setTimeout(resolve, safeMs);
  });
}

function resolveWithTimeout(promise, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timerId);
      resolve(result);
    };

    const timerId = setTimeout(() => {
      finish({ status: "timeout" });
    }, timeoutMs);

    Promise.resolve(promise).then(
      (value) => finish({ status: "ok", value }),
      (error) => finish({ status: "error", error })
    );
  });
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function collectDraftTextFonts(renderState) {
  const objetos = Array.isArray(renderState?.objetos) ? renderState.objetos : [];
  return Array.from(
    new Set(
      objetos
        .filter((objeto) => normalizeText(objeto?.tipo).toLowerCase() === "texto")
        .map((objeto) => normalizeText(objeto?.fontFamily))
        .filter(Boolean)
    )
  );
}

function collectDraftTextFontSpecs(renderState) {
  const objetos = Array.isArray(renderState?.objetos) ? renderState.objetos : [];
  const seen = new Set();
  const specs = [];

  objetos.forEach((objeto) => {
    if (normalizeText(objeto?.tipo).toLowerCase() !== "texto") return;

    const fontFamily = normalizeText(objeto?.fontFamily);
    if (!fontFamily) return;

    const fontSize = Math.max(6, Number(objeto?.fontSize) || 24);
    const fontWeight = String(objeto?.fontWeight || "normal");
    const fontStyle = String(objeto?.fontStyle || "normal");
    const sampleText = String(objeto?.texto || "HgAy");
    const cacheKey = [fontFamily, fontStyle, fontWeight, fontSize].join("|");

    if (seen.has(cacheKey)) return;
    seen.add(cacheKey);
    specs.push({
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
      sampleText,
    });
  });

  return specs;
}

function buildDocumentFontSpec(fontSpec) {
  const family = normalizeText(fontSpec?.fontFamily);
  if (!family) return "";

  const resolvedFamily = family.includes(",")
    ? family
    : (/\s/.test(family) ? `"${family}"` : family);
  const fontStyle = String(fontSpec?.fontStyle || "normal");
  const fontWeight = String(fontSpec?.fontWeight || "normal");
  const fontSize = Math.max(6, Number(fontSpec?.fontSize) || 24);

  return `${fontStyle} ${fontWeight} ${fontSize}px ${resolvedFamily}`;
}

async function waitForDocumentFontSpecs(fontSpecs, timeoutMs = DRAFT_TEXT_FONT_DOCUMENT_TIMEOUT_MS) {
  if (!Array.isArray(fontSpecs) || !fontSpecs.length) return;
  if (typeof document === "undefined" || typeof document.fonts?.load !== "function") return;

  const loadTasks = fontSpecs
    .map((fontSpec) => {
      const spec = buildDocumentFontSpec(fontSpec);
      if (!spec) return null;

      return Promise.race([
        document.fonts.load(spec, String(fontSpec?.sampleText || "HgAy")),
        delay(Math.min(500, timeoutMs)),
      ]);
    })
    .filter(Boolean);

  if (loadTasks.length) {
    await resolveWithTimeout(Promise.allSettled(loadTasks), timeoutMs);
  }

  if (document.fonts?.ready) {
    await resolveWithTimeout(document.fonts.ready, Math.min(timeoutMs, 1200));
  }

  await new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 16);
  });
}

async function waitForDraftTextFonts(renderState) {
  if (typeof document === "undefined") return;

  const draftTextFonts = collectDraftTextFonts(renderState);
  const draftTextFontSpecs = collectDraftTextFontSpecs(renderState);
  if (!draftTextFonts.length && !draftTextFontSpecs.length) return;

  try {
    const { fontManager } = await import("@/utils/fontManager");
    if (draftTextFonts.length) {
      await fontManager.loadFonts(draftTextFonts, {
        timeoutMs: DRAFT_TEXT_FONT_LOAD_TIMEOUT_MS,
      });
    }
  } catch {
    // Si alguna fuente no carga, seguimos con la mejor medicion disponible.
  }

  try {
    await waitForDocumentFontSpecs(
      draftTextFontSpecs,
      DRAFT_TEXT_FONT_DOCUMENT_TIMEOUT_MS
    );
  } catch {
    // Seguimos con fallback si el documento no confirma todas las fuentes.
  }
}

async function prepareDraftTextMeasurement(renderState) {
  const result = await resolveWithTimeout(
    waitForDraftTextFonts(renderState),
    DRAFT_TEXT_PREPARATION_TIMEOUT_MS
  );

  if (result.status === "error") {
    console.warn("No se pudo preparar la medicion de fuentes del borrador.", result.error);
    return;
  }

  if (result.status === "timeout") {
    console.warn("La preparacion de fuentes del borrador excedio el tiempo limite y se omite.");
  }
}

async function waitForDraftDocument(
  slug,
  {
    retryDelaysMs = DRAFT_CREATION_CONFIRMATION_DELAYS_MS,
    tolerateErrors = false,
  } = {}
) {
  const safeSlug = normalizeText(slug);
  if (!safeSlug) return null;

  let lastError = null;

  for (const waitMs of retryDelaysMs) {
    if (waitMs > 0) {
      await delay(waitMs);
    }

    try {
      const draftSnap = await getDoc(doc(db, "borradores", safeSlug));
      if (draftSnap.exists()) {
        return draftSnap;
      }
      lastError = null;
    } catch (error) {
      lastError = error;
      if (!tolerateErrors) {
        continue;
      }
    }
  }

  if (lastError && !tolerateErrors) {
    throw lastError;
  }

  return null;
}

function scheduleDraftCountdownAudit(slug, stage = "draft-created-from-template") {
  const safeSlug = normalizeText(slug);
  if (!safeSlug || typeof window === "undefined") return;

  Promise.resolve()
    .then(() => captureCountdownAuditDraftDocument(safeSlug, stage))
    .catch(() => null);
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
  const callablePromise = Promise.resolve(
    copiarPlantillaCallable({
      plantillaId: safeTemplateId,
      slug,
    })
  );
  callablePromise.catch(() => null);

  const result = await resolveWithTimeout(
    callablePromise,
    CREATE_DRAFT_CALLABLE_TIMEOUT_MS
  );

  if (result.status === "error") {
    throw result.error;
  }

  if (result.status === "timeout") {
    const confirmedDraftSnap = await waitForDraftDocument(slug, {
      retryDelaysMs: DRAFT_CREATION_CONFIRMATION_DELAYS_MS,
      tolerateErrors: true,
    });

    if (confirmedDraftSnap?.exists()) {
      scheduleDraftCountdownAudit(slug, "draft-created-from-template");
      return { slug };
    }

    throw new Error(
      "La creacion del borrador esta tardando mas de lo esperado. Si al refrescar aparece, ya quedo creado."
    );
  }

  const createdSlug = normalizeText(result.value?.data?.slug) || slug;
  if (!createdSlug) {
    throw new Error("No se pudo crear el borrador desde la plantilla.");
  }

  scheduleDraftCountdownAudit(createdSlug, "draft-created-from-template");

  return { slug: createdSlug };
}

export async function createDraftFromTemplateWithInput({
  template,
  userId,
  rawValues,
  touchedKeys,
  galleryFilesByField,
  previewTextPositions = null,
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

  logTemplateDraftDebug("service:create-draft:start", {
    slug,
    templateId,
    applyChanges,
    rawValues,
    touchedKeys,
    previewTextPositions,
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

  const { resolvedValues } = resolveTemplatePersonalizationInput({
    template: safeTemplate,
    rawValues,
    touchedKeys,
    galleryUrlsByField: uploadedGalleryUrlsByField,
  });

  const draftRef = doc(db, "borradores", slug);
  const draftSnap = await waitForDraftDocument(slug, {
    retryDelaysMs: DRAFT_READ_RETRY_DELAYS_MS,
  });
  if (!draftSnap?.exists()) {
    throw new Error("No se encontro el borrador recien creado para aplicar cambios.");
  }

  const draftData = draftSnap.data() || {};
  const draftRenderState = normalizeDraftRenderState(draftData);
  await prepareDraftTextMeasurement(draftRenderState);
  const personalizationPatch = preparePostCopyTemplatePersonalizationPatch({
    template: safeTemplate,
    draftData: draftRenderState,
    resolvedValues,
    previewTextPositions,
  });
  const debugObjectsById = Object.fromEntries(
    (Array.isArray(personalizationPatch?.objetos) ? personalizationPatch.objetos : [])
      .filter((objeto) => shouldPreserveTextCenterPosition(objeto))
      .map((objeto) => [
        normalizeText(objeto?.id),
        {
          text: String(objeto?.texto || ""),
          x: Number.isFinite(Number(objeto?.x)) ? Number(objeto.x) : null,
          y: Number.isFinite(Number(objeto?.y)) ? Number(objeto.y) : null,
          align: objeto?.align || null,
          width: Number.isFinite(Number(objeto?.width)) ? Number(objeto.width) : null,
          rotation: Number.isFinite(Number(objeto?.rotation)) ? Number(objeto.rotation) : 0,
          scaleX: Number.isFinite(Number(objeto?.scaleX)) ? Number(objeto.scaleX) : 1,
          scaleY: Number.isFinite(Number(objeto?.scaleY)) ? Number(objeto.scaleY) : 1,
        },
      ])
      .filter(([id]) => id)
  );

  groupTemplateDraftDebug("service:create-draft:final-patch", [
    ["service:create-draft:previewTextPositions", previewTextPositions],
    ["service:create-draft:objectsById", debugObjectsById],
    ["service:create-draft:applyReport", personalizationPatch?.applyReport || null],
  ]);
  setTemplateDraftDebugSession({
    slug,
    createdAt: new Date().toISOString(),
    objectsById: debugObjectsById,
    previewTextPositions:
      previewTextPositions && typeof previewTextPositions === "object"
        ? previewTextPositions
        : {},
    applyReport: personalizationPatch?.applyReport || null,
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
    gifts: personalizationPatch.gifts,
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

  logTemplateDraftDebug("service:create-draft:updateDoc:done", {
    slug,
    objectIds: Object.keys(debugObjectsById),
  });

  scheduleDraftCountdownAudit(slug, "draft-created-from-template");

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
