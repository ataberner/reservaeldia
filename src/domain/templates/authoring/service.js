import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { normalizeDraftRenderState } from "@/domain/drafts/sourceOfTruth";
import { getTemplateById } from "../repository.js";
import { validateAuthoringState } from "./validation.js";
import {
  ensureDefaultsForSchema,
  normalizeTemplateDocument,
} from "../../../../shared/templates/contract.js";

export const AUTHORING_DRAFT_VERSION = 1;

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeIssues(value) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((entry) => normalizeText(entry))
        .filter(Boolean)
    )
  );
}

function normalizeStateStatus(rawStatus, normalized) {
  const validated = validateAuthoringState({
    fieldsSchema: normalized.fieldsSchema,
    defaults: normalized.defaults,
    objetos: normalized.objetos,
  });

  const source = asObject(rawStatus);
  const forcedIssues = normalizeIssues(source.issues);
  const issues = forcedIssues.length ? forcedIssues : validated.issues;
  return {
    isReady: forcedIssues.length ? source.isReady !== false && issues.length === 0 : validated.isReady,
    issues,
  };
}

function normalizeAuthoringSnapshot(rawState, fallbackTemplateId = null, objetos = []) {
  const source = asObject(rawState);
  const fieldsSchema = Array.isArray(source.fieldsSchema) ? source.fieldsSchema : [];
  const defaults = ensureDefaultsForSchema(fieldsSchema, source.defaults);
  const sourceTemplateId =
    normalizeText(source.sourceTemplateId) || normalizeText(fallbackTemplateId) || null;
  const normalized = {
    version: AUTHORING_DRAFT_VERSION,
    sourceTemplateId,
    fieldsSchema,
    defaults,
    objetos: Array.isArray(objetos) ? objetos : [],
    updatedAt: source.updatedAt || null,
    updatedByUid: normalizeText(source.updatedByUid) || null,
  };

  return {
    version: AUTHORING_DRAFT_VERSION,
    sourceTemplateId,
    fieldsSchema: normalized.fieldsSchema,
    defaults: normalized.defaults,
    status: normalizeStateStatus(source.status, normalized),
    updatedAt: normalized.updatedAt,
    updatedByUid: normalized.updatedByUid,
  };
}

function buildEmptySnapshot(sourceTemplateId = null, objetos = []) {
  return normalizeAuthoringSnapshot(
    {
      version: AUTHORING_DRAFT_VERSION,
      sourceTemplateId: normalizeText(sourceTemplateId) || null,
      fieldsSchema: [],
      defaults: {},
      status: { isReady: true, issues: [] },
    },
    sourceTemplateId,
    objetos
  );
}

function normalizeStoredDraft(value) {
  const source = asObject(value);
  return {
    version: AUTHORING_DRAFT_VERSION,
    sourceTemplateId: normalizeText(source.sourceTemplateId) || null,
    fieldsSchema: Array.isArray(source.fieldsSchema) ? source.fieldsSchema : [],
    defaults: ensureDefaultsForSchema(source.fieldsSchema, source.defaults),
    updatedAt: source.updatedAt || null,
    updatedByUid: normalizeText(source.updatedByUid) || null,
    status: {
      isReady: source?.status?.isReady !== false,
      issues: normalizeIssues(source?.status?.issues),
    },
  };
}

export async function loadAuthoringState({
  slug,
  templateId,
  preloadedDraft = null,
} = {}) {
  const safeSlug = normalizeText(slug);
  const preloaded = asObject(preloadedDraft);
  let draftData = preloaded;

  if (!Object.keys(draftData).length) {
    if (!safeSlug) return buildEmptySnapshot(templateId);
    const draftSnap = await getDoc(doc(db, "borradores", safeSlug));
    draftData = draftSnap.exists() ? draftSnap.data() || {} : {};
  }

  const draftRenderState = normalizeDraftRenderState(draftData);
  const sourceTemplateId =
    normalizeText(templateId) ||
    normalizeText(draftData?.plantillaId) ||
    normalizeText(draftData?.templateAuthoringDraft?.sourceTemplateId) ||
    null;

  const storedAuthoring = normalizeStoredDraft(draftData?.templateAuthoringDraft);
  const hasStoredAuthoring =
    draftData?.templateAuthoringDraft &&
    typeof draftData.templateAuthoringDraft === "object";

  if (hasStoredAuthoring) {
    return normalizeAuthoringSnapshot(
      storedAuthoring,
      sourceTemplateId,
      draftRenderState.objetos
    );
  }

  if (!sourceTemplateId) {
    return buildEmptySnapshot(null, draftRenderState.objetos);
  }

  const sourceTemplate = await getTemplateById(sourceTemplateId);
  if (!sourceTemplate) {
    return buildEmptySnapshot(sourceTemplateId, draftRenderState.objetos);
  }

  return normalizeAuthoringSnapshot(
    {
      version: AUTHORING_DRAFT_VERSION,
      sourceTemplateId,
      fieldsSchema: sourceTemplate.fieldsSchema || [],
      defaults: sourceTemplate.defaults || {},
      status: { isReady: true, issues: [] },
    },
    sourceTemplateId,
    draftRenderState.objetos
  );
}

export async function saveAuthoringDraft({ slug, state, uid } = {}) {
  const safeSlug = normalizeText(slug);
  if (!safeSlug) {
    throw new Error("No se pudo guardar el authoring: slug invalido.");
  }

  const safeUid = normalizeText(uid) || null;
  const snapshot = normalizeAuthoringSnapshot(state, state?.sourceTemplateId, []);
  const payload = {
    version: AUTHORING_DRAFT_VERSION,
    sourceTemplateId: snapshot.sourceTemplateId || null,
    fieldsSchema: snapshot.fieldsSchema,
    defaults: snapshot.defaults,
    status: snapshot.status,
    updatedAt: serverTimestamp(),
    updatedByUid: safeUid,
  };

  await updateDoc(doc(db, "borradores", safeSlug), {
    templateAuthoringDraft: payload,
    ultimaEdicion: serverTimestamp(),
  });

  return payload;
}

export function buildTemplatePayloadFromAuthoring({
  draftData,
  authoringState,
} = {}) {
  const safeDraftData = asObject(draftData);
  const renderState = normalizeDraftRenderState(safeDraftData);
  const sourceAuthoring =
    asObject(authoringState).fieldsSchema || asObject(authoringState).defaults
      ? asObject(authoringState)
      : asObject(safeDraftData.templateAuthoringDraft);
  const fieldsSchema = Array.isArray(sourceAuthoring.fieldsSchema)
    ? sourceAuthoring.fieldsSchema
    : [];
  const defaults = ensureDefaultsForSchema(fieldsSchema, sourceAuthoring.defaults);
  const normalizedType = normalizeTemplateDocument({
    tipo: safeDraftData.tipoInvitacion || safeDraftData.tipo,
  }).tipo;

  return {
    nombre: normalizeText(safeDraftData.nombre) || "Plantilla",
    tipo: normalizedType || "general",
    editor: "konva",
    portada: normalizeText(safeDraftData.portada) || null,
    objetos: renderState.objetos,
    secciones: renderState.secciones,
    fieldsSchema,
    defaults,
    ...(renderState.rsvp ? { rsvp: renderState.rsvp } : {}),
    ...(renderState.gifts ? { gifts: renderState.gifts } : {}),
  };
}
