import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { normalizeDraftRenderState } from "@/domain/drafts/sourceOfTruth";
import { getTemplateById } from "../repository.js";
import {
  getTemplateEditorDocument,
  saveTemplateEditorDocument,
} from "../adminService.js";
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

function resolveExpectedTemplateId(session, templateId, draftData) {
  const safeDraftData = asObject(draftData);
  return (
    normalizeText(templateId) ||
    (session.kind === "template" ? normalizeText(session.id) : "") ||
    normalizeText(safeDraftData?.plantillaId) ||
    normalizeText(safeDraftData?.templateAuthoringDraft?.sourceTemplateId) ||
    null
  );
}

function resolvePreloadedTemplateId(preloadedDraft) {
  const safePreloaded = asObject(preloadedDraft);
  return (
    normalizeText(safePreloaded?.plantillaId) ||
    normalizeText(safePreloaded?.sourceTemplateId) ||
    normalizeText(safePreloaded?.templateAuthoringDraft?.sourceTemplateId) ||
    null
  );
}

function canUsePreloadedDraft(preloadedDraft, session, templateId) {
  const safePreloaded = asObject(preloadedDraft);
  if (!Object.keys(safePreloaded).length) return false;
  if (session.kind !== "template") return true;

  const expectedTemplateId = resolveExpectedTemplateId(session, templateId, safePreloaded);
  const preloadedTemplateId = resolvePreloadedTemplateId(safePreloaded);

  if (!expectedTemplateId || !preloadedTemplateId) return false;
  return preloadedTemplateId === expectedTemplateId;
}

function isStoredAuthoringAligned(storedDraft, expectedTemplateId) {
  const safeExpectedTemplateId = normalizeText(expectedTemplateId);
  if (!safeExpectedTemplateId) return true;

  const storedTemplateId = normalizeText(storedDraft?.sourceTemplateId);
  if (!storedTemplateId) return true;

  return storedTemplateId === safeExpectedTemplateId;
}

function normalizeEditorSession(session, fallbackSlug = "", fallbackTemplateId = "") {
  const safeSession = session && typeof session === "object" ? session : {};
  const requestedKind =
    normalizeText(safeSession.kind).toLowerCase() === "template"
      ? "template"
      : "draft";
  const fallbackId =
    requestedKind === "template"
      ? normalizeText(fallbackTemplateId) || normalizeText(fallbackSlug)
      : normalizeText(fallbackSlug) || normalizeText(fallbackTemplateId);
  const id = normalizeText(safeSession.id) || fallbackId;
  return {
    kind: requestedKind,
    id,
  };
}

export async function loadAuthoringState({
  slug,
  templateId,
  preloadedDraft = null,
  editorSession = null,
} = {}) {
  const safeSlug = normalizeText(slug);
  const session = normalizeEditorSession(editorSession, safeSlug, templateId);
  const preloaded = asObject(preloadedDraft);
  let draftData = canUsePreloadedDraft(preloaded, session, templateId) ? preloaded : {};

  if (!Object.keys(draftData).length) {
    if (!session.id) return buildEmptySnapshot(templateId);
    if (session.kind === "template") {
      const result = await getTemplateEditorDocument({
        templateId: session.id,
      });
      draftData =
        result?.editorDocument && typeof result.editorDocument === "object"
          ? result.editorDocument
          : {};
    } else {
      const draftSnap = await getDoc(doc(db, "borradores", session.id));
      draftData = draftSnap.exists() ? draftSnap.data() || {} : {};
    }
  }

  const draftRenderState = normalizeDraftRenderState(draftData);
  const sourceTemplateId = resolveExpectedTemplateId(session, templateId, draftData);

  const storedAuthoring = normalizeStoredDraft(draftData?.templateAuthoringDraft);
  const hasStoredAuthoring =
    draftData?.templateAuthoringDraft &&
    typeof draftData.templateAuthoringDraft === "object";

  if (hasStoredAuthoring && isStoredAuthoringAligned(storedAuthoring, sourceTemplateId)) {
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

export async function saveAuthoringDraft({
  slug,
  state,
  uid,
  templateId = "",
  editorSession = null,
} = {}) {
  const safeSlug = normalizeText(slug);
  const session = normalizeEditorSession(editorSession, safeSlug, templateId);
  if (!session.id) {
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

  if (session.kind === "template") {
    await saveTemplateEditorDocument({
      templateId: session.id,
      document: {
        templateAuthoringDraft: {
          ...payload,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  } else {
    await updateDoc(doc(db, "borradores", session.id), {
      templateAuthoringDraft: payload,
      ultimaEdicion: serverTimestamp(),
    });
  }

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
