import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  buildCoverImageUpdate,
  normalizeCoverImageSource,
  replaceCoverImageInCanvasObjects,
  replaceCoverImageInBackgroundSections,
  resolveCoverImageState,
} from "@/domain/editor/coverImage";
import {
  canEditObjectById,
  canMutateSection,
} from "@/domain/editor/protectedSections";
import { persistEditorSessionPatch } from "@/components/editor/persistence/editorSessionPersistence";

function createEmptyDraftMeta() {
  return {
    plantillaId: null,
    portada: "",
    portadaSource: null,
    templateWorkspace: null,
    templateAuthoringDraft: null,
    templateInput: null,
    loadedAt: 0,
  };
}

function normalizeDraftLoadedMeta(meta) {
  const safeMeta = meta && typeof meta === "object" ? meta : {};
  return {
    plantillaId:
      typeof safeMeta.plantillaId === "string" ? safeMeta.plantillaId : null,
    portada: typeof safeMeta.portada === "string" ? safeMeta.portada.trim() : "",
    portadaSource: normalizeCoverImageSource(safeMeta.portadaSource),
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
    templateInput:
      safeMeta.templateInput && typeof safeMeta.templateInput === "object"
        ? safeMeta.templateInput
        : null,
    loadedAt: Number(safeMeta.loadedAt || Date.now()),
  };
}

export default function useCanvasEditorDraftMeta({
  slug,
  editorSession,
  readOnly = false,
  canManageSite,
  draftMeta,
  setDraftMeta,
  secciones,
  setSecciones,
  objetos,
  setObjetos,
  enqueueDraftWrite = null,
  setTemplateEditorialPanelOpen,
  setSectionDecorationEdit,
}) {
  const activeSessionKey = `${String(editorSession?.kind || "draft")}:${String(
    editorSession?.id || slug || ""
  )}`;
  const activeSessionKeyRef = useRef(activeSessionKey);
  activeSessionKeyRef.current = activeSessionKey;

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

  const requiresExplicitCoverSource =
    editorSession?.kind === "template" ||
    Boolean(draftMeta?.plantillaId) ||
    Boolean(templateWorkspace?.templateId);

  const coverState = useMemo(
    () =>
      resolveCoverImageState({
        coverImage: draftMeta?.portada,
        coverSource: draftMeta?.portadaSource,
        sections: secciones,
        objects: objetos,
        allowLegacyPortadaFallback: !requiresExplicitCoverSource,
      }),
    [
      draftMeta?.portada,
      draftMeta?.portadaSource,
      objetos,
      requiresExplicitCoverSource,
      secciones,
    ]
  );
  const coverImage = coverState.imageUrl;
  const coverSource = coverState.coverSource;

  const updateCoverImage = useCallback(
    async (
      imageInput,
      { syncLinkedVisuals = false, coverSource: nextCoverSource } = {}
    ) => {
      if (readOnly) {
        return { ok: false, reason: "read-only-session" };
      }

      const mutation = buildCoverImageUpdate({
        currentCoverImage: draftMeta?.portada,
        currentCoverSource: coverSource,
        nextImage: imageInput,
        nextCoverSource,
        sections: secciones,
        objects: objetos,
        syncLinkedVisuals,
      });
      if (!mutation.ok) return mutation;

      const blockedSectionIds = mutation.replacedBackgroundSectionIds.filter(
        (sectionId) =>
          !canMutateSection(
            (Array.isArray(secciones) ? secciones : []).find(
              (section) => String(section?.id || "") === sectionId
            )
          )
      );
      if (blockedSectionIds.length > 0) {
        return {
          ok: false,
          reason: "linked-background-locked",
          blockedSectionIds,
        };
      }
      const blockedObjectIds = mutation.replacedCanvasObjectIds.filter(
        (objectId) =>
          !canEditObjectById(objectId, {
            objetos,
            secciones,
          })
      );
      if (blockedObjectIds.length > 0) {
        return {
          ok: false,
          reason: "linked-canvas-image-locked",
          blockedObjectIds,
        };
      }

      const patch = {
        portada: mutation.coverImage,
        portadaSource: mutation.coverSource,
        ...(mutation.replacedBackgroundSectionIds.length > 0
          ? { secciones: mutation.sections }
          : {}),
        ...(mutation.replacedCanvasObjectIds.length > 0
          ? { objetos: mutation.objects }
          : {}),
      };
      const sessionKeyAtStart = activeSessionKey;
      const persist = () =>
        persistEditorSessionPatch({
          session: editorSession,
          slug,
          patch,
          reason: syncLinkedVisuals
            ? "cover-image-replacement"
            : "cover-image-selection",
          readOnly,
        });

      try {
        if (typeof enqueueDraftWrite === "function") {
          await enqueueDraftWrite(persist);
        } else {
          await persist();
        }
      } catch (error) {
        return {
          ok: false,
          reason: "cover-image-persist-failed",
          error,
        };
      }

      if (activeSessionKeyRef.current !== sessionKeyAtStart) {
        return {
          ok: false,
          reason: "stale-editor-session",
        };
      }

      setDraftMeta((previous) => ({
        ...previous,
        portada: mutation.coverImage,
        portadaSource: mutation.coverSource,
      }));
      if (
        mutation.replacedBackgroundSectionIds.length > 0 &&
        typeof setSecciones === "function"
      ) {
        setSecciones((previous) =>
          replaceCoverImageInBackgroundSections({
            sections: previous,
            sectionIds: mutation.replacedBackgroundSectionIds,
            nextImage: imageInput,
          })
        );
      }
      if (
        mutation.replacedCanvasObjectIds.length > 0 &&
        typeof setObjetos === "function"
      ) {
        setObjetos((previous) =>
          replaceCoverImageInCanvasObjects({
            objects: previous,
            objectIds: mutation.replacedCanvasObjectIds,
            nextImage: imageInput,
          })
        );
      }

      return mutation;
    },
    [
      activeSessionKey,
      coverSource,
      draftMeta?.portada,
      editorSession,
      enqueueDraftWrite,
      objetos,
      readOnly,
      secciones,
      setDraftMeta,
      setObjetos,
      setSecciones,
      slug,
    ]
  );

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
    coverImage,
    coverSource,
    updateCoverImage,
  };
}
