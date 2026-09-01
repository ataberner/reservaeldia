import { collectDuplicateRenderObjectIds } from "../../../shared/renderAssetContract.js";
import { ensureDefaultsForSchema } from "../../../shared/templates/contract.js";
import { sanitizeAuthoringSchema } from "./authoring/model.js";
import { validateAuthoringState } from "./authoring/validation.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function buildTemplateCopyId({ draftSlug, timestamp = Date.now() } = {}) {
  const safeDraftSlug = normalizeText(draftSlug);
  if (!safeDraftSlug) return "";
  return `${safeDraftSlug}-template-${timestamp}`;
}

export function prepareTemplateCopyAuthoringState({
  authoringState,
  objetos,
} = {}) {
  const source = asObject(authoringState);
  const repaired = sanitizeAuthoringSchema({
    fieldsSchema: source.fieldsSchema,
    defaults: source.defaults,
    objetos: Array.isArray(objetos) ? objetos : [],
    dropOrphans: true,
  });
  const defaults = ensureDefaultsForSchema(
    repaired.fieldsSchema,
    repaired.defaults
  );
  const status = validateAuthoringState({
    fieldsSchema: repaired.fieldsSchema,
    defaults,
    objetos: Array.isArray(objetos) ? objetos : [],
  });

  return {
    changed: repaired.changed,
    removedFieldKeys: repaired.removedFieldKeys,
    removedTargets: repaired.removedTargets,
    status,
    snapshot: {
      ...source,
      fieldsSchema: repaired.fieldsSchema,
      defaults,
      status,
    },
  };
}

export function composeDraftTemplateCreationPayload({
  draftData,
  liveEditorSnapshot = null,
  runtimeAuthoringStatus = null,
  runtimeAuthoringSnapshot = null,
  buildPayload,
} = {}) {
  if (typeof buildPayload !== "function") {
    throw new Error("No se configuro la preparacion del payload de plantilla.");
  }

  const sourceDraft = asObject(draftData);
  const hasLiveSnapshot =
    liveEditorSnapshot &&
    typeof liveEditorSnapshot === "object" &&
    !Array.isArray(liveEditorSnapshot);
  const liveSnapshot = hasLiveSnapshot ? liveEditorSnapshot : null;
  const preparedDraft = hasLiveSnapshot
    ? {
        ...sourceDraft,
        objetos: liveSnapshot.objetos,
        secciones: liveSnapshot.secciones,
        rsvp: liveSnapshot.rsvp,
        gifts: liveSnapshot.gifts,
      }
    : sourceDraft;
  const duplicateObjectIds = Array.from(
    collectDuplicateRenderObjectIds(preparedDraft.objetos)
  );
  if (duplicateObjectIds.length > 0) {
    throw new Error(
      `No se puede crear la plantilla: el borrador contiene ids de objeto duplicados (${duplicateObjectIds.join(", ")}).`
    );
  }
  const stagedAuthoringSnapshot = asObject(
    preparedDraft.templateAuthoringDraft
  );
  const hasRuntimeAuthoringStatus =
    runtimeAuthoringStatus &&
    typeof runtimeAuthoringStatus === "object" &&
    !Array.isArray(runtimeAuthoringStatus);
  const hasRuntimeAuthoringSnapshot =
    runtimeAuthoringSnapshot &&
    typeof runtimeAuthoringSnapshot === "object" &&
    !Array.isArray(runtimeAuthoringSnapshot);
  const authoringStatusToValidate = hasRuntimeAuthoringStatus
    ? runtimeAuthoringStatus
    : stagedAuthoringSnapshot.status || null;
  const authoringState = hasRuntimeAuthoringSnapshot
    ? runtimeAuthoringSnapshot
    : Object.keys(stagedAuthoringSnapshot).length
      ? stagedAuthoringSnapshot
      : null;

  return {
    preparedDraft,
    authoringStatusToValidate,
    payload: buildPayload({
      draftData: preparedDraft,
      authoringState,
    }),
  };
}
