import { serverTimestamp } from "firebase/firestore";
import {
  normalizeDraftRenderState,
  normalizeDraftTemplateInput,
} from "@/domain/drafts/sourceOfTruth";
import { getTemplateById } from "../repository.js";
import { normalizeEditorSession } from "@/domain/drafts/session";
import {
  persistEditorSessionPatch,
  readEditorSessionDocument,
} from "@/components/editor/persistence/editorSessionPersistence";
import {
  resolveAuthoringValidationObjects,
  validateAuthoringState,
} from "./validation.js";
import {
  ensureDefaultsForSchema,
  ensureValuesForSchema,
  normalizeTemplateDocument,
  normalizeTemplateAuthoringDraft,
  TEMPLATE_AUTHORING_DRAFT_VERSION,
} from "../../../../shared/templates/contract.js";
import { normalizeCoverImageSource } from "../../../../shared/coverImageContract.mjs";
import { normalizeRenderAssetState } from "../../../../shared/renderAssetContract.js";
import { migrateDynamicAuthoringStateV2 } from "./migration.js";

export const AUTHORING_DRAFT_VERSION = TEMPLATE_AUTHORING_DRAFT_VERSION;

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
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

function normalizeAuthoringSnapshot(
  rawState,
  fallbackTemplateId = null,
  objetos = [],
  { sessionKind = "template", templateInput = null } = {}
) {
  const source = asObject(rawState);
  const normalizedDraft = normalizeTemplateAuthoringDraft(
    {
      ...source,
      version: Number.isFinite(Number(source.version))
        ? Number(source.version)
        : AUTHORING_DRAFT_VERSION,
      fieldsSchema: Array.isArray(source.fieldsSchema) ? source.fieldsSchema : [],
      defaults: source.defaults,
    },
    fallbackTemplateId
  );
  const fieldsSchema = normalizedDraft?.fieldsSchema || [];
  const defaults = ensureDefaultsForSchema(fieldsSchema, normalizedDraft?.defaults);
  const sourceTemplateId =
    normalizeText(normalizedDraft?.sourceTemplateId) ||
    normalizeText(fallbackTemplateId) ||
    null;
  const sourceTemplateInput = asObject(templateInput || source.templateInput);
  const draftInput =
    sessionKind === "draft"
      ? normalizeDraftTemplateInput({
          templateInput: {
            ...sourceTemplateInput,
            ...(hasOwn(source, "values") ? { values: source.values } : {}),
          },
          fieldsSchema,
          defaults,
        })
      : null;
  const values =
    sessionKind === "draft"
      ? draftInput.values
      : ensureValuesForSchema(fieldsSchema, source.values, defaults);
  const normalized = {
    version: normalizedDraft?.version || AUTHORING_DRAFT_VERSION,
    sourceTemplateId,
    fieldsSchema,
    defaults,
    values,
    objetos: Array.isArray(objetos) ? objetos : [],
    updatedAt: normalizedDraft?.updatedAt || null,
    updatedByUid: normalizeText(normalizedDraft?.updatedByUid) || null,
  };

  return {
    version: normalized.version,
    sourceTemplateId,
    fieldsSchema: normalized.fieldsSchema,
    defaults: normalized.defaults,
    values: normalized.values,
    detachedVisuals: normalizedDraft?.detachedVisuals,
    ...(draftInput ? { templateInput: draftInput } : {}),
    status: normalizeStateStatus(source.status, normalized),
    updatedAt: normalized.updatedAt,
    updatedByUid: normalized.updatedByUid,
  };
}

function buildEmptySnapshot(
  sourceTemplateId = null,
  objetos = [],
  options = {}
) {
  return normalizeAuthoringSnapshot(
    {
      version: AUTHORING_DRAFT_VERSION,
      sourceTemplateId: normalizeText(sourceTemplateId) || null,
      fieldsSchema: [],
      defaults: {},
      status: { isReady: true, issues: [] },
    },
    sourceTemplateId,
    objetos,
    options
  );
}

function normalizeStoredDraft(value) {
  const source = asObject(value);
  const normalized = normalizeTemplateAuthoringDraft(source, source.sourceTemplateId);
  return {
    version: normalized?.version || AUTHORING_DRAFT_VERSION,
    sourceTemplateId: normalizeText(normalized?.sourceTemplateId) || null,
    fieldsSchema: normalized?.fieldsSchema || [],
    defaults: normalized?.defaults || {},
    detachedVisuals: normalized?.detachedVisuals,
    updatedAt: normalized?.updatedAt || null,
    updatedByUid: normalizeText(normalized?.updatedByUid) || null,
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

function resolveAuthoringEditorSession(session, fallbackSlug = "", fallbackTemplateId = "") {
  const safeSession = session && typeof session === "object" ? session : {};
  const requestedKind =
    normalizeText(safeSession.kind).toLowerCase() === "template"
      ? "template"
      : "draft";
  const fallbackId =
    requestedKind === "template"
      ? normalizeText(fallbackTemplateId) || normalizeText(fallbackSlug)
      : normalizeText(fallbackSlug) || normalizeText(fallbackTemplateId);
  return normalizeEditorSession(
    {
      ...safeSession,
      kind: normalizeText(safeSession.kind) || requestedKind,
      id: normalizeText(safeSession.id) || fallbackId,
    },
    fallbackId
  );
}

async function finalizeLoadedAuthoringState({
  authoringState,
  templateInput,
  templateFieldsSchema,
  templateDefaults,
  sourceTemplateId,
  draftRenderState,
  rawEventDetails,
  session,
  persistMigration = false,
  enqueueDraftWrite = null,
  uid = null,
} = {}) {
  const migration = migrateDynamicAuthoringStateV2({
    authoringDraft: authoringState,
    templateInput,
    templateFieldsSchema,
    templateDefaults,
    objetos: draftRenderState?.objetos,
    eventDetails: rawEventDetails,
    sessionKind: session?.kind,
    sourceTemplateId,
  });
  const sourceState = migration.migrated
    ? {
        ...asObject(migration.authoringDraft),
        values: migration.values,
        templateInput: migration.templateInput,
      }
    : authoringState;
  const snapshot = normalizeAuthoringSnapshot(
    sourceState,
    sourceTemplateId,
    draftRenderState?.objetos,
    {
      sessionKind: session?.kind,
      templateInput: migration.migrated
        ? migration.templateInput
        : templateInput,
    }
  );

  let persisted = false;
  if (migration.migrated && persistMigration === true) {
    const write = () =>
      saveAuthoringDraft({
        slug: session?.id,
        state: sourceState,
        uid,
        templateId: sourceTemplateId || "",
        editorSession: session,
        renderPatch: {
          objetos: Array.isArray(draftRenderState?.objetos)
            ? draftRenderState.objetos
            : [],
          secciones: Array.isArray(draftRenderState?.secciones)
            ? draftRenderState.secciones
            : [],
          eventDetails:
            migration.eventDetails ||
            draftRenderState?.eventDetails ||
            asObject(rawEventDetails),
        },
        reason: "dynamic-authoring-v2-migration",
      });
    if (typeof enqueueDraftWrite === "function") {
      await enqueueDraftWrite(write);
    } else {
      await write();
    }
    persisted = true;
  }

  return {
    ...snapshot,
    ...(migration.migrated && migration.eventDetails
      ? { eventDetails: migration.eventDetails }
      : {}),
    migration: {
      applied: migration.migrated,
      persisted,
      requiresPersistence: migration.migrated && !persisted,
      report: migration.report,
    },
  };
}

export async function loadAuthoringState({
  slug,
  templateId,
  preloadedDraft = null,
  editorSession = null,
  persistMigration = false,
  enqueueDraftWrite = null,
  uid = null,
} = {}) {
  const safeSlug = normalizeText(slug);
  const session = resolveAuthoringEditorSession(editorSession, safeSlug, templateId);
  const preloaded = asObject(preloadedDraft);
  let draftData = canUsePreloadedDraft(preloaded, session, templateId) ? preloaded : {};

  if (!Object.keys(draftData).length) {
    if (!session.id) return buildEmptySnapshot(templateId);
    const readResult = await readEditorSessionDocument({
      session,
      slug: session.id,
    });
    draftData = readResult.exists ? readResult.data || {} : {};
  }

  const draftRenderState = normalizeDraftRenderState(draftData);
  const sourceTemplateId = resolveExpectedTemplateId(session, templateId, draftData);

  const storedAuthoring = normalizeStoredDraft(draftData?.templateAuthoringDraft);
  const hasStoredAuthoring =
    draftData?.templateAuthoringDraft &&
    typeof draftData.templateAuthoringDraft === "object";

  if (hasStoredAuthoring && isStoredAuthoringAligned(storedAuthoring, sourceTemplateId)) {
    return finalizeLoadedAuthoringState({
      authoringState: draftData.templateAuthoringDraft,
      templateInput: draftData?.templateInput,
      templateFieldsSchema: draftData?.fieldsSchema,
      templateDefaults: draftData?.defaults,
      sourceTemplateId,
      draftRenderState,
      rawEventDetails: draftData?.eventDetails,
      session,
      persistMigration,
      enqueueDraftWrite,
      uid,
    });
  }

  if (!sourceTemplateId) {
    return finalizeLoadedAuthoringState({
      authoringState: {
        version: AUTHORING_DRAFT_VERSION,
        sourceTemplateId: null,
        fieldsSchema: [],
        defaults: {},
        status: { isReady: true, issues: [] },
      },
      templateInput: draftData?.templateInput,
      sourceTemplateId: null,
      draftRenderState,
      rawEventDetails: draftData?.eventDetails,
      session,
      persistMigration,
      enqueueDraftWrite,
      uid,
    });
  }

  const sourceTemplate = await getTemplateById(sourceTemplateId);
  if (!sourceTemplate) {
    return finalizeLoadedAuthoringState({
      authoringState: {
        version: AUTHORING_DRAFT_VERSION,
        sourceTemplateId,
        fieldsSchema: [],
        defaults: {},
        status: { isReady: true, issues: [] },
      },
      templateInput: draftData?.templateInput,
      sourceTemplateId,
      draftRenderState,
      rawEventDetails: draftData?.eventDetails,
      session,
      persistMigration,
      enqueueDraftWrite,
      uid,
    });
  }

  const templateAuthoring = asObject(sourceTemplate.templateAuthoringDraft);
  const authoringState = Object.keys(templateAuthoring).length
    ? templateAuthoring
    : {
      version: 1,
      sourceTemplateId,
      fieldsSchema: sourceTemplate.fieldsSchema || [],
      defaults: sourceTemplate.defaults || {},
      status: { isReady: true, issues: [] },
    };
  return finalizeLoadedAuthoringState({
    authoringState,
    templateInput: draftData?.templateInput,
    templateFieldsSchema: sourceTemplate.fieldsSchema,
    templateDefaults: sourceTemplate.defaults,
    sourceTemplateId,
    draftRenderState,
    rawEventDetails: draftData?.eventDetails,
    session,
    persistMigration,
    enqueueDraftWrite,
    uid,
  });
}

export async function saveAuthoringDraft({
  slug,
  state,
  uid,
  templateId = "",
  editorSession = null,
  renderPatch = null,
  reason = "template-authoring",
} = {}) {
  const safeSlug = normalizeText(slug);
  const session = resolveAuthoringEditorSession(editorSession, safeSlug, templateId);
  if (!session.id) {
    throw new Error("No se pudo guardar el authoring: slug invalido.");
  }

  const safeUid = normalizeText(uid) || null;
  const validationObjects = resolveAuthoringValidationObjects({
    state,
    renderPatch,
  });
  const snapshot = normalizeAuthoringSnapshot(
    state,
    state?.sourceTemplateId,
    validationObjects,
    {
      sessionKind: session.kind,
      templateInput: state?.templateInput,
    }
  );
  const persistedDefaults =
    session.kind === "template" ? snapshot.values : snapshot.defaults;
  const payload = {
    version: snapshot.version,
    sourceTemplateId: snapshot.sourceTemplateId || null,
    fieldsSchema: snapshot.fieldsSchema,
    defaults: persistedDefaults,
    detachedVisuals: snapshot.detachedVisuals,
    status: snapshot.status,
    updatedAt: session.kind === "template" ? new Date().toISOString() : serverTimestamp(),
    updatedByUid: safeUid,
  };

  const patch = {
    ...asObject(renderPatch),
    templateAuthoringDraft: payload,
  };
  let normalizedTemplateInput = null;
  if (session.kind === "draft") {
    normalizedTemplateInput = normalizeDraftTemplateInput({
      templateInput: {
        ...asObject(snapshot.templateInput),
        values: snapshot.values,
      },
      fieldsSchema: snapshot.fieldsSchema,
      defaults: snapshot.defaults,
    });
    const updatedAt = serverTimestamp();
    patch["templateInput.initialValues"] = normalizedTemplateInput.initialValues;
    patch["templateInput.values"] = normalizedTemplateInput.values;
    patch["templateInput.defaults"] = normalizedTemplateInput.defaults;
    patch["templateInput.changedKeys"] = normalizedTemplateInput.changedKeys;
    patch["templateInput.policyVersion"] = normalizedTemplateInput.policyVersion;
    patch["templateInput.updatedAt"] = updatedAt;
  }

  await persistEditorSessionPatch({
    session,
    slug: session.id,
    patch,
    reason,
  });

  return {
    ...payload,
    values: snapshot.values,
    ...(normalizedTemplateInput ? { templateInput: normalizedTemplateInput } : {}),
  };
}

export function buildTemplatePayloadFromAuthoring({
  draftData,
  authoringState,
} = {}) {
  const safeDraftData = asObject(draftData);
  const renderState = normalizeDraftRenderState(safeDraftData);
  const normalizedRenderState = normalizeRenderAssetState(renderState);
  const sourceAuthoring =
    asObject(authoringState).fieldsSchema || asObject(authoringState).defaults
      ? asObject(authoringState)
      : asObject(safeDraftData.templateAuthoringDraft);
  const fieldsSchema = Array.isArray(sourceAuthoring.fieldsSchema)
    ? sourceAuthoring.fieldsSchema
    : [];
  const sourceValues = hasOwn(sourceAuthoring, "values")
    ? sourceAuthoring.values
    : asObject(safeDraftData.templateInput).values;
  const defaults = ensureValuesForSchema(
    fieldsSchema,
    sourceValues,
    sourceAuthoring.defaults
  );
  const normalizedType = normalizeTemplateDocument({
    tipo: safeDraftData.tipoInvitacion || safeDraftData.tipo,
  }).tipo;
  const templateAuthoringDraft = normalizeTemplateAuthoringDraft(
    {
      ...sourceAuthoring,
      version: Number.isFinite(Number(sourceAuthoring.version))
        ? Number(sourceAuthoring.version)
        : AUTHORING_DRAFT_VERSION,
      fieldsSchema,
      defaults,
    },
    sourceAuthoring.sourceTemplateId || safeDraftData.plantillaId || null
  );

  return {
    nombre: normalizeText(safeDraftData.nombre) || "Plantilla",
    tipo: normalizedType || "general",
    editor: "konva",
    portada: normalizeText(safeDraftData.portada) || null,
    portadaSource: normalizeCoverImageSource(safeDraftData.portadaSource),
    objetos: normalizedRenderState.objetos,
    secciones: normalizedRenderState.secciones,
    fieldsSchema,
    defaults,
    ...(templateAuthoringDraft ? { templateAuthoringDraft } : {}),
    ...(renderState.rsvp ? { rsvp: renderState.rsvp } : {}),
    ...(renderState.gifts ? { gifts: renderState.gifts } : {}),
    eventDetails: renderState.eventDetails || { mode: "single" },
  };
}
