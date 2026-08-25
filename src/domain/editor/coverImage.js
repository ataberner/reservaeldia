import {
  pickStorageAssetDescriptorFields,
  resolveStorageAssetUrl,
} from "../assets/storageAssetDescriptor.js";
import {
  findRenderObjectById,
  forEachRenderObject,
  updateRenderObjectById,
} from "./renderObjectTree.js";
import {
  applySectionBaseImage,
  normalizeSectionBackgroundModel,
} from "../sections/backgrounds.js";
import {
  COVER_IMAGE_SOURCE_KINDS,
  normalizeCoverImageSource,
} from "../../../shared/coverImageContract.mjs";

export {
  COVER_IMAGE_SOURCE_KINDS,
  normalizeCoverImageSource,
} from "../../../shared/coverImageContract.mjs";

function normalizeText(value) {
  return String(value || "").trim();
}

export function resolveCoverImageUrl(imageInput) {
  if (
    imageInput &&
    typeof imageInput === "object" &&
    normalizeText(imageInput.tipo).toLowerCase() === "imagen" &&
    normalizeText(imageInput.src)
  ) {
    return normalizeText(imageInput.src);
  }
  return normalizeText(resolveStorageAssetUrl(imageInput));
}

export function resolveCoverImageState({
  coverImage,
  coverSource = null,
  sections = [],
  objects = [],
  allowLegacyPortadaFallback = true,
} = {}) {
  const normalizedCoverSource = normalizeCoverImageSource(coverSource);
  let sourceImageUrl = "";

  if (normalizedCoverSource?.kind === COVER_IMAGE_SOURCE_KINDS.CANVAS_OBJECT) {
    const sourceObject = findRenderObjectById(
      objects,
      normalizedCoverSource.objectId
    );
    if (normalizeText(sourceObject?.tipo).toLowerCase() === "imagen") {
      sourceImageUrl = resolveCoverImageUrl(sourceObject);
    }
  } else if (
    normalizedCoverSource?.kind === COVER_IMAGE_SOURCE_KINDS.SECTION_BACKGROUND
  ) {
    const sourceSection = (Array.isArray(sections) ? sections : []).find(
      (section) =>
        normalizeText(section?.id) === normalizedCoverSource.sectionId
    );
    if (sourceSection) {
      const backgroundModel = normalizeSectionBackgroundModel(sourceSection, {
        sectionHeight: sourceSection.altura,
      });
      if (backgroundModel.base.fondoTipo === "imagen") {
        sourceImageUrl = normalizeText(backgroundModel.base.fondoImagen);
      }
    }
  }

  const persistedImageUrl = resolveCoverImageUrl(coverImage);
  const imageUrl =
    sourceImageUrl ||
    (allowLegacyPortadaFallback === false ? "" : persistedImageUrl);
  const backgroundSectionIds = imageUrl
    ? (Array.isArray(sections) ? sections : []).flatMap((section) => {
        const backgroundModel = normalizeSectionBackgroundModel(section, {
          sectionHeight: section?.altura,
        });
        const sectionImageUrl =
          backgroundModel.base.fondoTipo === "imagen"
            ? normalizeText(backgroundModel.base.fondoImagen)
            : "";

        return sectionImageUrl === imageUrl && normalizeText(section?.id)
          ? [normalizeText(section.id)]
          : [];
      })
    : [];
  const canvasObjectIds = [];
  if (imageUrl) {
    forEachRenderObject(objects, (object) => {
      if (
        normalizeText(object?.tipo).toLowerCase() === "imagen" &&
        resolveCoverImageUrl(object) === imageUrl &&
        normalizeText(object?.id)
      ) {
        canvasObjectIds.push(normalizeText(object.id));
      }
    });
  }

  return {
    hasImage: Boolean(imageUrl),
    imageUrl,
    persistedImageUrl,
    coverSource: normalizedCoverSource,
    sourceResolved: Boolean(sourceImageUrl),
    backgroundSectionIds,
    canvasObjectIds,
    isUsedAsBackground: backgroundSectionIds.length > 0,
    isUsedAsCanvasImage: canvasObjectIds.length > 0,
  };
}

export function replaceCoverImageInCanvasObjects({
  objects = [],
  objectIds = [],
  nextImage,
} = {}) {
  const nextImageUrl = resolveCoverImageUrl(nextImage);
  if (!nextImageUrl) return Array.isArray(objects) ? objects : [];

  const descriptorFields = pickStorageAssetDescriptorFields(nextImage);
  const targetIds = new Set(
    (Array.isArray(objectIds) ? objectIds : [])
      .map((objectId) => normalizeText(objectId))
      .filter(Boolean)
  );

  return [...targetIds].reduce((currentObjects, objectId) => {
    const update = updateRenderObjectById(currentObjects, objectId, (object) => ({
      ...object,
      src: nextImageUrl,
      storagePath: descriptorFields.storagePath || null,
      storageGeneration: descriptorFields.storageGeneration || null,
      storageDownloadToken: descriptorFields.storageDownloadToken || null,
    }));
    return update.changed ? update.objetos : currentObjects;
  }, Array.isArray(objects) ? objects : []);
}

export function replaceCoverImageInBackgroundSections({
  sections = [],
  sectionIds = [],
  nextImage,
} = {}) {
  const targetIds = new Set(
    (Array.isArray(sectionIds) ? sectionIds : [])
      .map((sectionId) => normalizeText(sectionId))
      .filter(Boolean)
  );

  return [...targetIds].reduce(
    (currentSections, sectionId) =>
      applySectionBaseImage(currentSections, sectionId, nextImage, {
        preservePlacement: true,
      }),
    Array.isArray(sections) ? sections : []
  );
}

export function buildCoverImageUpdate({
  currentCoverImage,
  currentCoverSource = null,
  nextImage,
  nextCoverSource,
  sections = [],
  objects = [],
  syncLinkedVisuals = false,
} = {}) {
  const nextImageUrl = resolveCoverImageUrl(nextImage);
  const currentState = resolveCoverImageState({
    coverImage: currentCoverImage,
    coverSource: currentCoverSource,
    sections,
    objects,
  });
  const sourceSections = Array.isArray(sections) ? sections : [];
  const sourceObjects = Array.isArray(objects) ? objects : [];

  if (!nextImageUrl) {
    return {
      ok: false,
      reason: "invalid-cover-image",
      coverImage: currentState.imageUrl,
      coverSource: currentState.coverSource,
      sections: sourceSections,
      objects: sourceObjects,
      replacedBackgroundSectionIds: [],
      replacedCanvasObjectIds: [],
    };
  }

  const replacedBackgroundSectionIds = syncLinkedVisuals
    ? currentState.backgroundSectionIds
    : [];
  const replacedCanvasObjectIds = syncLinkedVisuals
    ? currentState.canvasObjectIds
    : [];
  const nextSections = replaceCoverImageInBackgroundSections({
    sections: sourceSections,
    sectionIds: replacedBackgroundSectionIds,
    nextImage,
  });
  const nextObjects = replaceCoverImageInCanvasObjects({
    objects: sourceObjects,
    objectIds: replacedCanvasObjectIds,
    nextImage,
  });
  const resolvedNextCoverSource =
    typeof nextCoverSource === "undefined"
      ? currentState.coverSource
      : normalizeCoverImageSource(nextCoverSource);

  return {
    ok: true,
    reason: "cover-image-updated",
    coverImage: nextImageUrl,
    coverSource: resolvedNextCoverSource,
    sections: nextSections,
    objects: nextObjects,
    replacedBackgroundSectionIds,
    replacedCanvasObjectIds,
  };
}
