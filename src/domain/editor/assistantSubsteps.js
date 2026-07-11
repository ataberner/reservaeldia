import { getGallerySidebarCandidates } from "../gallery/sidebarModel.js";
import { resolveFirstSectionBaseImage } from "../sections/backgrounds.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function createSubstep(id, label, scope, extra = {}) {
  return {
    id,
    label,
    scope,
    ...extra,
  };
}

function resolveImageAssistantSubsteps({ objects = [], sections = [] } = {}) {
  const substeps = [];
  const firstSectionCover = resolveFirstSectionBaseImage(sections);

  if (firstSectionCover.hasImage) {
    substeps.push(createSubstep("cover", "Portada", "cover"));
  }

  getGallerySidebarCandidates(objects).forEach((gallery, index) => {
    substeps.push(
      createSubstep(
        `gallery:${gallery.id}`,
        `Galeria ${index + 1}`,
        "gallery",
        { galleryId: gallery.id }
      )
    );
  });

  return substeps.length > 0
    ? substeps
    : [createSubstep("photos-empty", "Fotos", "empty")];
}

export function resolveAssistantSubstepsForStep(stepId, context = {}) {
  const safeStepId = normalizeText(stepId);

  if (safeStepId === "detalles") {
    return [
      createSubstep("event-names", "Nombres", "event-names"),
      createSubstep("event-date", "Fecha y hora", "event-date"),
      createSubstep("event-location", "Ubicacion", "event-location"),
    ];
  }

  if (safeStepId === "texto") {
    return [createSubstep("story", "Texto", "story")];
  }

  if (safeStepId === "imagen") {
    return resolveImageAssistantSubsteps(context);
  }

  if (safeStepId === "rsvp") {
    return [
      createSubstep("rsvp-start", "Activar", "activation"),
    ];
  }

  if (safeStepId === "regalos") {
    return [
      createSubstep("gifts-start", "Activar", "activation"),
      createSubstep("gifts-active", "Datos visibles", "active"),
      createSubstep("gifts-add", "Agregar datos", "add"),
    ];
  }

  return [createSubstep("main", "Paso", "main")];
}

export function clampAssistantSubstepIndex(index, substeps = []) {
  const safeSubsteps = Array.isArray(substeps) && substeps.length > 0
    ? substeps
    : [createSubstep("main", "Paso", "main")];
  const numericIndex = Number(index);
  const safeIndex = Number.isFinite(numericIndex) ? Math.trunc(numericIndex) : 0;
  return Math.min(safeSubsteps.length - 1, Math.max(0, safeIndex));
}

export function getAssistantSubstep(index, substeps = []) {
  const safeSubsteps = Array.isArray(substeps) && substeps.length > 0
    ? substeps
    : [createSubstep("main", "Paso", "main")];
  return safeSubsteps[clampAssistantSubstepIndex(index, safeSubsteps)];
}

export function getAssistantSubstepProgressLabel(index, substeps = []) {
  const safeSubsteps = Array.isArray(substeps) ? substeps : [];
  if (safeSubsteps.length <= 1) return "";
  return `${clampAssistantSubstepIndex(index, safeSubsteps) + 1}/${safeSubsteps.length}`;
}

export function getAssistantSubstepSignature(substeps = []) {
  return (Array.isArray(substeps) ? substeps : [])
    .map((substep) => normalizeText(substep?.id))
    .filter(Boolean)
    .join("|");
}
