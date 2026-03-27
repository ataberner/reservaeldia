import { useCallback, useEffect, useMemo } from "react";

function createEmptyDraftMeta() {
  return {
    plantillaId: null,
    templateWorkspace: null,
    templateAuthoringDraft: null,
    loadedAt: 0,
  };
}

function normalizeDraftLoadedMeta(meta) {
  const safeMeta = meta && typeof meta === "object" ? meta : {};
  return {
    plantillaId:
      typeof safeMeta.plantillaId === "string" ? safeMeta.plantillaId : null,
    templateWorkspace:
      safeMeta.templateWorkspace &&
      typeof safeMeta.templateWorkspace === "object"
        ? safeMeta.templateWorkspace
        : null,
    templateAuthoringDraft:
      safeMeta.templateAuthoringDraft &&
      typeof safeMeta.templateAuthoringDraft === "object"
        ? safeMeta.templateAuthoringDraft
        : null,
    loadedAt: Number(safeMeta.loadedAt || Date.now()),
  };
}

export default function useCanvasEditorDraftMeta({
  slug,
  canManageSite,
  draftMeta,
  setDraftMeta,
  setTemplateEditorialPanelOpen,
  setSectionDecorationEdit,
}) {
  useEffect(() => {
    setDraftMeta(createEmptyDraftMeta());
    setTemplateEditorialPanelOpen(false);
    setSectionDecorationEdit(null);
  }, [setDraftMeta, setSectionDecorationEdit, setTemplateEditorialPanelOpen, slug]);

  const handleDraftLoaded = useCallback(
    (meta) => {
      setDraftMeta(normalizeDraftLoadedMeta(meta));
    },
    [setDraftMeta]
  );

  const templateWorkspace = useMemo(
    () =>
      draftMeta?.templateWorkspace &&
      typeof draftMeta.templateWorkspace === "object"
        ? draftMeta.templateWorkspace
        : null,
    [draftMeta]
  );

  const canOpenTemplateEditorialPanel =
    canManageSite &&
    Boolean(templateWorkspace?.templateId) &&
    templateWorkspace?.mode === "template_edit";

  const handleTemplateEditorialSaved = useCallback(
    (nextTemplate) => {
      const safeTemplate =
        nextTemplate && typeof nextTemplate === "object" ? nextTemplate : {};
      const nextPermissions =
        safeTemplate.permissions && typeof safeTemplate.permissions === "object"
          ? safeTemplate.permissions
          : templateWorkspace?.permissions || {};

      setDraftMeta((previous) => ({
        ...previous,
        templateWorkspace: previous?.templateWorkspace
          ? {
              ...previous.templateWorkspace,
              estadoEditorial:
                safeTemplate.estadoEditorial ||
                previous.templateWorkspace.estadoEditorial ||
                "publicada",
              tags: Array.isArray(safeTemplate.tags)
                ? safeTemplate.tags
                : previous.templateWorkspace.tags || [],
              templateName:
                safeTemplate.nombre ||
                previous.templateWorkspace.templateName ||
                "Plantilla",
              permissions: nextPermissions,
              readOnly:
                nextPermissions?.readOnly === true
                  ? true
                  : previous.templateWorkspace.readOnly === true,
            }
          : previous?.templateWorkspace || null,
      }));
    },
    [setDraftMeta, templateWorkspace?.permissions]
  );

  return {
    handleDraftLoaded,
    templateWorkspace,
    canOpenTemplateEditorialPanel,
    handleTemplateEditorialSaved,
  };
}
