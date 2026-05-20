import { getGalleryPhotos } from "./galleryMutations.js";
import { getGalleryLayoutPreset, resolveGalleryLayoutSelectionForEditor } from "./galleryLayoutPresets.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase();
}

function isGalleryObject(object) {
  return object?.tipo === "galeria" && Boolean(normalizeText(object?.id));
}

export function isTemplateGalleryAuthoringSession({
  editorSession = null,
  templateSessionMeta = null,
} = {}) {
  if (normalizeLowerText(editorSession?.kind) === "template") return true;
  if (templateSessionMeta?.enabled === true) return true;
  return false;
}

export function canAccessGalleryBuilder({
  canManageSite = false,
  editorReadOnly = false,
  editorSession = null,
  templateSessionMeta = null,
} = {}) {
  return (
    canManageSite === true &&
    editorReadOnly !== true &&
    isTemplateGalleryAuthoringSession({ editorSession, templateSessionMeta })
  );
}

export function getGallerySidebarCandidates(objects = []) {
  return (Array.isArray(objects) ? objects : []).filter(isGalleryObject);
}

export function resolveGallerySidebarEditingTarget({
  objects = [],
  selectedIds = [],
  sidebarGalleryId = "",
} = {}) {
  const candidates = getGallerySidebarCandidates(objects);
  const safeSelectedIds = Array.isArray(selectedIds)
    ? selectedIds.map(normalizeText).filter(Boolean)
    : [];
  const selectedGallery =
    safeSelectedIds.length === 1
      ? candidates.find((gallery) => gallery.id === safeSelectedIds[0]) || null
      : null;

  if (selectedGallery) {
    return {
      gallery: selectedGallery,
      candidates,
      source: "canvas-selection",
      needsSidebarChoice: false,
    };
  }

  if (candidates.length === 1) {
    return {
      gallery: candidates[0],
      candidates,
      source: "single-gallery",
      needsSidebarChoice: false,
    };
  }

  const safeSidebarGalleryId = normalizeText(sidebarGalleryId);
  const sidebarGallery = safeSidebarGalleryId
    ? candidates.find((gallery) => gallery.id === safeSidebarGalleryId) || null
    : null;

  if (sidebarGallery) {
    return {
      gallery: sidebarGallery,
      candidates,
      source: "sidebar-choice",
      needsSidebarChoice: false,
    };
  }

  return {
    gallery: null,
    candidates,
    source: candidates.length > 1 ? "multiple-galleries" : "no-gallery",
    needsSidebarChoice: candidates.length > 1,
  };
}

export function getSelectedGalleryPhotoUsages(gallery) {
  return getGalleryPhotos(gallery).map((photo) => ({
    index: photo.index,
    sourceIndex: photo.sourceIndex,
    displayIndex: photo.displayIndex,
    cellId: photo.cellId,
    mediaUrl: photo.mediaUrl,
    storagePath: photo.storagePath,
    assetId: photo.assetId,
    fit: photo.fit === "contain" ? "contain" : "cover",
    bg: normalizeText(photo.bg) || "#f3f4f6",
    alt: normalizeText(photo.alt),
  }));
}

export function getGalleryAllowedLayoutState(gallery) {
  if (!gallery || gallery.tipo !== "galeria") {
    return {
      allowedLayouts: [],
      allowedLayoutOptions: [],
      defaultLayout: "",
      currentLayout: "",
      selectedLayout: "",
      hasPresetContract: false,
      reason: "not-gallery",
    };
  }

  const selection = resolveGalleryLayoutSelectionForEditor(gallery);
  const allowedLayoutOptions = selection.allowedLayouts.map((id) => {
    const preset = getGalleryLayoutPreset(id);
    return {
      id,
      label: preset?.label || id,
      previewKind: preset?.previewKind || "",
      minPhotos: preset?.minPhotos ?? null,
      maxPhotos: preset?.maxPhotos ?? null,
      recommendedPhotoCount: preset?.recommendedPhotoCount ?? null,
      supportsDynamicMedia: preset?.supportsDynamicMedia === true,
      emptyCellsAllowed: preset?.emptyCellsAllowed === true,
    };
  });

  return {
    allowedLayouts: selection.allowedLayouts,
    allowedLayoutOptions,
    defaultLayout: selection.defaultLayout,
    currentLayout: selection.currentLayout,
    rawDefaultLayout: selection.rawDefaultLayout,
    rawCurrentLayout: selection.rawCurrentLayout,
    selectedLayout: selection.selectedLayout,
    hasPresetContract: selection.hasPresetContract,
    hasLayoutFields: selection.hasLayoutFields,
    reason: selection.reason,
  };
}
