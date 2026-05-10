import { getGalleryPhotos } from "./galleryMutations.js";
import { getGalleryLayoutPreset, resolveGalleryLayoutSelection } from "./galleryLayoutPresets.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase();
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

  const selection = resolveGalleryLayoutSelection(gallery);
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
