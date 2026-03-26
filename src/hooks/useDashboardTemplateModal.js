import { useCallback, useMemo, useState } from "react";
import { getErrorMessage } from "@/domain/dashboard/helpers";
import { buildTemplateFormState } from "@/domain/templates/formModel";
import { normalizeTemplateMetadata } from "@/domain/templates/metadata";
import {
  generateTemplatePreviewHtml,
  resolveTemplatePreviewSource,
} from "@/domain/templates/preview";
import {
  createDraftFromTemplateWithInput,
  getTemplateById,
} from "@/domain/templates/service";
import { pushEditorBreadcrumb } from "@/lib/monitoring/editorIssueReporter";

const TEMPLATE_PREVIEW_STATUS_IDLE = Object.freeze({
  status: "idle",
  error: "",
});

const TEMPLATE_FORM_STATE_INITIAL = Object.freeze({
  rawValues: {},
  touchedKeys: [],
});

function createTemplatePreviewStatus(overrides = {}) {
  return {
    ...TEMPLATE_PREVIEW_STATUS_IDLE,
    ...overrides,
  };
}

export function useDashboardTemplateModal({
  userUid,
  openDraftInEditor,
}) {
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isOpeningTemplateEditor, setIsOpeningTemplateEditor] = useState(false);
  const [templatePreviewCacheById, setTemplatePreviewCacheById] = useState({});
  const [templatePreviewStatus, setTemplatePreviewStatus] = useState({});
  const [templateFormState, setTemplateFormState] = useState(
    TEMPLATE_FORM_STATE_INITIAL
  );

  const resetTemplateFormState = useCallback((template) => {
    const safeTemplate = template && typeof template === "object" ? template : null;
    const nextState = buildTemplateFormState(
      safeTemplate,
      TEMPLATE_FORM_STATE_INITIAL
    );
    setTemplateFormState({
      rawValues: nextState.rawValues || {},
      touchedKeys: [],
    });
  }, []);

  const handleTemplateFormStateChange = useCallback((templateId, nextState) => {
    const safeTemplateId = String(templateId || "").trim();
    if (!safeTemplateId) return;
    const safeNextState =
      nextState && typeof nextState === "object" ? nextState : null;
    if (!safeNextState) return;

    setTemplateFormState({
      rawValues:
        safeNextState.rawValues && typeof safeNextState.rawValues === "object"
          ? safeNextState.rawValues
          : {},
      touchedKeys: Array.isArray(safeNextState.touchedKeys)
        ? safeNextState.touchedKeys
        : [],
    });
  }, []);

  const loadTemplatePreview = useCallback(
    async (template) => {
      const safeTemplate = template && typeof template === "object" ? template : null;
      const templateId = String(safeTemplate?.id || "").trim();
      if (!templateId) return;

      const hasRenderableContent =
        Array.isArray(safeTemplate?.secciones) &&
        safeTemplate.secciones.length > 0 &&
        Array.isArray(safeTemplate?.objetos) &&
        safeTemplate.objetos.length > 0;
      const previewSource = resolveTemplatePreviewSource(safeTemplate);

      if (previewSource.mode === "url" && previewSource.previewUrl) {
        if (templatePreviewCacheById[templateId]) {
          setTemplatePreviewStatus((prev) => ({
            ...prev,
            [templateId]: createTemplatePreviewStatus({
              status: "ready",
              error: "",
            }),
          }));
          return;
        }

        if (!hasRenderableContent) {
          setTemplatePreviewStatus((prev) => ({
            ...prev,
            [templateId]: createTemplatePreviewStatus({
              status: "ready",
              error: "",
            }),
          }));
          return;
        }

        setTemplatePreviewStatus((prev) => ({
          ...prev,
          [templateId]: createTemplatePreviewStatus({
            status: "loading",
            error: "",
          }),
        }));

        try {
          const htmlFallback = await generateTemplatePreviewHtml(safeTemplate);
          setTemplatePreviewCacheById((prev) => {
            if (prev[templateId]) return prev;
            return {
              ...prev,
              [templateId]: htmlFallback,
            };
          });
        } catch {
          // Si falla HTML generado, dejamos fallback al previewUrl.
        } finally {
          setTemplatePreviewStatus((prev) => ({
            ...prev,
            [templateId]: createTemplatePreviewStatus({
              status: "ready",
              error: "",
            }),
          }));
        }
        return;
      }

      if (!hasRenderableContent) {
        setTemplatePreviewStatus((prev) => ({
          ...prev,
          [templateId]: createTemplatePreviewStatus({
            status: "loading",
            error: "",
          }),
        }));
        return;
      }

      if (templatePreviewCacheById[templateId]) {
        setTemplatePreviewStatus((prev) => ({
          ...prev,
          [templateId]: createTemplatePreviewStatus({
            status: "ready",
            error: "",
          }),
        }));
        return;
      }

      setTemplatePreviewStatus((prev) => ({
        ...prev,
        [templateId]: createTemplatePreviewStatus({
          status: "loading",
          error: "",
        }),
      }));

      try {
        const html = await generateTemplatePreviewHtml(safeTemplate);
        setTemplatePreviewCacheById((prev) => {
          if (prev[templateId]) return prev;
          return {
            ...prev,
            [templateId]: html,
          };
        });
        setTemplatePreviewStatus((prev) => ({
          ...prev,
          [templateId]: createTemplatePreviewStatus({
            status: "ready",
            error: "",
          }),
        }));
      } catch (error) {
        setTemplatePreviewStatus((prev) => ({
          ...prev,
          [templateId]: createTemplatePreviewStatus({
            status: "error",
            error: getErrorMessage(
              error,
              "No se pudo generar la vista previa de esta plantilla."
            ),
          }),
        }));
      }
    },
    [templatePreviewCacheById]
  );

  const openModal = useCallback(
    (template) => {
      const safeTemplate = template && typeof template === "object" ? template : null;
      const templateId = String(safeTemplate?.id || "").trim();
      if (!safeTemplate || !templateId) return;

      setSelectedTemplate(safeTemplate);
      setIsTemplateModalOpen(true);
      resetTemplateFormState(safeTemplate);
      setTemplatePreviewStatus((prev) => ({
        ...prev,
        [templateId]: createTemplatePreviewStatus({
          status: "loading",
          error: "",
        }),
      }));

      void (async () => {
        try {
          const fullTemplate = await getTemplateById(templateId);
          if (!fullTemplate) {
            void loadTemplatePreview(safeTemplate);
            return;
          }

          setSelectedTemplate((current) => {
            const currentId = String(current?.id || "").trim();
            if (currentId !== templateId) return current;
            return fullTemplate;
          });
          resetTemplateFormState(fullTemplate);
          void loadTemplatePreview(fullTemplate);
        } catch (error) {
          console.error("Error al cargar detalle de plantilla:", error);
          void loadTemplatePreview(safeTemplate);
        }
      })();
    },
    [loadTemplatePreview, resetTemplateFormState]
  );

  const closeModal = useCallback(() => {
    if (isOpeningTemplateEditor) return;
    setIsTemplateModalOpen(false);
    setSelectedTemplate(null);
    setTemplateFormState(TEMPLATE_FORM_STATE_INITIAL);
  }, [isOpeningTemplateEditor]);

  const openTemplateEditor = useCallback(
    async ({
      applyChanges,
      rawValues = {},
      touchedKeys = [],
      galleryFilesByField = {},
      previewTextPositions = null,
    }) => {
      const templateId = String(selectedTemplate?.id || "").trim();
      if (!templateId || isOpeningTemplateEditor) return;

      setIsOpeningTemplateEditor(true);
      try {
        const result = await createDraftFromTemplateWithInput({
          template: selectedTemplate,
          userId: userUid,
          rawValues:
            rawValues && typeof rawValues === "object"
              ? rawValues
              : templateFormState?.rawValues || {},
          touchedKeys: Array.isArray(touchedKeys)
            ? touchedKeys
            : templateFormState?.touchedKeys || [],
          galleryFilesByField,
          previewTextPositions,
          applyChanges: applyChanges === true,
        });
        const slug = String(result?.slug || "").trim();
        if (!slug) {
          throw new Error("No se pudo crear el borrador de plantilla.");
        }

        pushEditorBreadcrumb("abrir-plantilla", {
          slug,
          plantillaId: templateId,
          editor: "konva",
          source: applyChanges
            ? "template-modal-with-changes"
            : "template-modal-without-changes",
        });

        setIsTemplateModalOpen(false);
        setSelectedTemplate(null);
        setTemplateFormState(TEMPLATE_FORM_STATE_INITIAL);
        void openDraftInEditor(slug);
      } catch (error) {
        alert(
          getErrorMessage(error, "No se pudo abrir la plantilla en el editor.")
        );
        console.error(error);
      } finally {
        setIsOpeningTemplateEditor(false);
      }
    },
    [
      isOpeningTemplateEditor,
      openDraftInEditor,
      selectedTemplate,
      templateFormState,
      userUid,
    ]
  );

  const handleOpenEditorWithoutChanges = useCallback(async () => {
    await openTemplateEditor({
      applyChanges: false,
    });
  }, [openTemplateEditor]);

  const handleOpenEditorWithChanges = useCallback(
    async (payload) => {
      const safePayload = payload && typeof payload === "object" ? payload : {};
      await openTemplateEditor({
        applyChanges: true,
        rawValues:
          safePayload.rawValues && typeof safePayload.rawValues === "object"
            ? safePayload.rawValues
            : {},
        touchedKeys: Array.isArray(safePayload.touchedKeys)
          ? safePayload.touchedKeys
          : [],
        galleryFilesByField:
          safePayload.galleryFilesByField &&
          typeof safePayload.galleryFilesByField === "object"
            ? safePayload.galleryFilesByField
            : {},
        previewTextPositions:
          safePayload.previewTextPositions &&
          typeof safePayload.previewTextPositions === "object"
            ? safePayload.previewTextPositions
            : null,
      });
    },
    [openTemplateEditor]
  );

  const selectedTemplateId =
    typeof selectedTemplate?.id === "string" ? selectedTemplate.id : "";
  const selectedTemplateMetadata = useMemo(
    () => normalizeTemplateMetadata(selectedTemplate),
    [selectedTemplate]
  );
  const selectedTemplatePreviewHtml = selectedTemplateId
    ? templatePreviewCacheById[selectedTemplateId] || ""
    : "";
  const selectedTemplatePreviewState = selectedTemplateId
    ? templatePreviewStatus[selectedTemplateId] || TEMPLATE_PREVIEW_STATUS_IDLE
    : TEMPLATE_PREVIEW_STATUS_IDLE;
  const selectedTemplateFormState = selectedTemplateId
    ? templateFormState
    : TEMPLATE_FORM_STATE_INITIAL;

  return {
    selectedTemplate,
    selectedTemplateId,
    selectedTemplateMetadata,
    selectedTemplatePreviewHtml,
    selectedTemplatePreviewState,
    selectedTemplateFormState,
    isTemplateModalOpen,
    isOpeningTemplateEditor,
    openModal,
    closeModal,
    handleTemplateFormStateChange,
    handleOpenEditorWithoutChanges,
    handleOpenEditorWithChanges,
  };
}
