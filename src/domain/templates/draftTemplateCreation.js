import { collectDuplicateRenderObjectIds } from "../../../shared/renderAssetContract.js";

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
