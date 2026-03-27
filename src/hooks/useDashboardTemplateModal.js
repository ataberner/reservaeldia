import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getErrorMessage } from "../domain/dashboard/helpers.js";
import { buildTemplateFormState } from "../domain/templates/formModel.js";
import { normalizeTemplateMetadata } from "../domain/templates/metadata.js";
import {
  generateTemplatePreviewHtml,
  resolveTemplatePreviewSource,
} from "../domain/templates/preview.js";
import { pushEditorBreadcrumb } from "../lib/monitoring/editorIssueReporter.js";

export const TEMPLATE_PREVIEW_STATUS_IDLE = Object.freeze({
  status: "idle",
  error: "",
});

export const TEMPLATE_FORM_STATE_INITIAL = Object.freeze({
  rawValues: {},
  touchedKeys: [],
});

function createTemplatePreviewStatus(overrides = {}) {
  return {
    ...TEMPLATE_PREVIEW_STATUS_IDLE,
    ...overrides,
  };
}

function normalizeTemplateId(value) {
  return String(value || "").trim();
}

function normalizeTemplateObject(value) {
  return value && typeof value === "object" ? value : null;
}

function normalizeTemplateFormStateValue(nextState) {
  const safeNextState =
    nextState && typeof nextState === "object" ? nextState : null;
  if (!safeNextState) {
    return TEMPLATE_FORM_STATE_INITIAL;
  }

  return {
    rawValues:
      safeNextState.rawValues && typeof safeNextState.rawValues === "object"
        ? safeNextState.rawValues
        : {},
    touchedKeys: Array.isArray(safeNextState.touchedKeys)
      ? safeNextState.touchedKeys
      : [],
  };
}

function hasRenderableTemplateContent(template) {
  return (
    Array.isArray(template?.secciones) &&
    template.secciones.length > 0 &&
    Array.isArray(template?.objetos) &&
    template.objetos.length > 0
  );
}

async function loadTemplateServiceModule() {
  return import("../domain/templates/service.js");
}

export function createTemplateModalSelectionSession({
  templateId,
  requestSequence,
} = {}) {
  const safeTemplateId = normalizeTemplateId(templateId);
  const safeRequestSequence =
    Number.isInteger(requestSequence) && requestSequence > 0
      ? requestSequence
      : 0;

  return {
    templateId: safeTemplateId,
    requestKey:
      safeTemplateId && safeRequestSequence
        ? `${safeTemplateId}:${safeRequestSequence}`
        : "",
  };
}

export function canApplyTemplateModalSelectionSession({
  activeSelection,
  session,
} = {}) {
  const safeActiveSelection =
    activeSelection && typeof activeSelection === "object"
      ? activeSelection
      : null;
  const safeSession = session && typeof session === "object" ? session : null;

  if (!safeActiveSelection || !safeSession) return false;
  if (safeActiveSelection.isOpen !== true) return false;

  const activeTemplateId = normalizeTemplateId(safeActiveSelection.templateId);
  const activeRequestKey = normalizeTemplateId(safeActiveSelection.requestKey);
  const templateId = normalizeTemplateId(safeSession.templateId);
  const requestKey = normalizeTemplateId(safeSession.requestKey);

  if (!activeTemplateId || !activeRequestKey || !templateId || !requestKey) {
    return false;
  }

  return (
    activeTemplateId === templateId && activeRequestKey === requestKey
  );
}

export function resolveDashboardTemplateModalViewState({
  selectedTemplate,
  templatePreviewCacheById,
  templatePreviewStatus,
  templateFormState,
} = {}) {
  const safeSelectedTemplate = normalizeTemplateObject(selectedTemplate);
  const selectedTemplateId = normalizeTemplateId(safeSelectedTemplate?.id);
  const safePreviewCacheById =
    templatePreviewCacheById && typeof templatePreviewCacheById === "object"
      ? templatePreviewCacheById
      : {};
  const safePreviewStatus =
    templatePreviewStatus && typeof templatePreviewStatus === "object"
      ? templatePreviewStatus
      : {};

  return {
    selectedTemplateId,
    selectedTemplateMetadata: normalizeTemplateMetadata(safeSelectedTemplate),
    selectedTemplatePreviewHtml: selectedTemplateId
      ? safePreviewCacheById[selectedTemplateId] || ""
      : "",
    selectedTemplatePreviewState: selectedTemplateId
      ? safePreviewStatus[selectedTemplateId] || TEMPLATE_PREVIEW_STATUS_IDLE
      : TEMPLATE_PREVIEW_STATUS_IDLE,
    selectedTemplateFormState: selectedTemplateId
      ? normalizeTemplateFormStateValue(templateFormState)
      : TEMPLATE_FORM_STATE_INITIAL,
  };
}

export function buildTemplatePreviewModalProps({
  visible,
  template,
  metadata,
  previewHtml,
  previewStatus,
  onClose,
  onOpenEditorWithChanges,
  onOpenEditorWithoutChanges,
  formState,
  onFormStateChange,
  openingEditor = false,
} = {}) {
  return {
    visible: visible === true,
    template: normalizeTemplateObject(template),
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    previewHtml: typeof previewHtml === "string" ? previewHtml : "",
    previewStatus:
      previewStatus && typeof previewStatus === "object"
        ? previewStatus
        : TEMPLATE_PREVIEW_STATUS_IDLE,
    onClose,
    onOpenEditorWithChanges,
    onOpenEditorWithoutChanges,
    formState: normalizeTemplateFormStateValue(formState),
    onFormStateChange,
    openingEditor: openingEditor === true,
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

  const requestSequenceRef = useRef(0);
  const activeSelectionRef = useRef({
    templateId: "",
    requestKey: "",
    isOpen: false,
  });
  const selectedTemplateRef = useRef(selectedTemplate);
  const templateFormStateRef = useRef(templateFormState);
  const templatePreviewCacheRef = useRef(templatePreviewCacheById);

  useEffect(() => {
    selectedTemplateRef.current = selectedTemplate;
  }, [selectedTemplate]);

  useEffect(() => {
    templateFormStateRef.current = templateFormState;
  }, [templateFormState]);

  useEffect(() => {
    templatePreviewCacheRef.current = templatePreviewCacheById;
  }, [templatePreviewCacheById]);

  const resetTemplateFormState = useCallback((template) => {
    const safeTemplate = normalizeTemplateObject(template);
    const nextState = buildTemplateFormState(
      safeTemplate,
      TEMPLATE_FORM_STATE_INITIAL
    );
    setTemplateFormState({
      rawValues: nextState.rawValues || {},
      touchedKeys: [],
    });
  }, []);

  const beginTemplateSelectionSession = useCallback((templateId) => {
    requestSequenceRef.current += 1;
    const session = createTemplateModalSelectionSession({
      templateId,
      requestSequence: requestSequenceRef.current,
    });

    activeSelectionRef.current = {
      ...session,
      isOpen: true,
    };

    return session;
  }, []);

  const clearTemplateSelectionSession = useCallback(() => {
    activeSelectionRef.current = {
      templateId: "",
      requestKey: "",
      isOpen: false,
    };
  }, []);

  const resetTemplateModalController = useCallback(() => {
    clearTemplateSelectionSession();
    setIsTemplateModalOpen(false);
    setSelectedTemplate(null);
    setTemplateFormState(TEMPLATE_FORM_STATE_INITIAL);
  }, [clearTemplateSelectionSession]);

  const setTemplatePreviewState = useCallback((templateId, nextStatus) => {
    const safeTemplateId = normalizeTemplateId(templateId);
    if (!safeTemplateId) return;

    setTemplatePreviewStatus((prev) => ({
      ...prev,
      [safeTemplateId]: createTemplatePreviewStatus(nextStatus),
    }));
  }, []);

  const storeTemplatePreviewHtml = useCallback((templateId, html) => {
    const safeTemplateId = normalizeTemplateId(templateId);
    if (!safeTemplateId || !String(html || "").trim()) return;

    setTemplatePreviewCacheById((prev) => {
      if (prev[safeTemplateId]) return prev;
      const next = {
        ...prev,
        [safeTemplateId]: html,
      };
      templatePreviewCacheRef.current = next;
      return next;
    });
  }, []);

  const handleTemplateModalFormStateChange = useCallback((nextState) => {
    const templateId = normalizeTemplateId(selectedTemplateRef.current?.id);
    if (!templateId) return;
    setTemplateFormState(normalizeTemplateFormStateValue(nextState));
  }, []);

  const loadTemplatePreview = useCallback(
    async (template) => {
      const safeTemplate = normalizeTemplateObject(template);
      const templateId = normalizeTemplateId(safeTemplate?.id);
      if (!templateId) return;

      const hasPreviewCache = Boolean(templatePreviewCacheRef.current?.[templateId]);
      const hasRenderableContent = hasRenderableTemplateContent(safeTemplate);
      const previewSource = resolveTemplatePreviewSource(safeTemplate);

      if (previewSource.mode === "url" && previewSource.previewUrl) {
        if (hasPreviewCache) {
          setTemplatePreviewState(templateId, {
            status: "ready",
            error: "",
          });
          return;
        }

        if (!hasRenderableContent) {
          setTemplatePreviewState(templateId, {
            status: "ready",
            error: "",
          });
          return;
        }

        setTemplatePreviewState(templateId, {
          status: "loading",
          error: "",
        });

        try {
          const htmlFallback = await generateTemplatePreviewHtml(safeTemplate);
          storeTemplatePreviewHtml(templateId, htmlFallback);
        } catch {
          // Si falla HTML generado, dejamos fallback al previewUrl.
        } finally {
          setTemplatePreviewState(templateId, {
            status: "ready",
            error: "",
          });
        }
        return;
      }

      if (!hasRenderableContent) {
        setTemplatePreviewState(templateId, {
          status: "loading",
          error: "",
        });
        return;
      }

      if (hasPreviewCache) {
        setTemplatePreviewState(templateId, {
          status: "ready",
          error: "",
        });
        return;
      }

      setTemplatePreviewState(templateId, {
        status: "loading",
        error: "",
      });

      try {
        const html = await generateTemplatePreviewHtml(safeTemplate);
        storeTemplatePreviewHtml(templateId, html);
        setTemplatePreviewState(templateId, {
          status: "ready",
          error: "",
        });
      } catch (error) {
        setTemplatePreviewState(templateId, {
          status: "error",
          error: getErrorMessage(
            error,
            "No se pudo generar la vista previa de esta plantilla."
          ),
        });
      }
    },
    [setTemplatePreviewState, storeTemplatePreviewHtml]
  );

  const openTemplateModal = useCallback(
    (template) => {
      const safeTemplate = normalizeTemplateObject(template);
      const templateId = normalizeTemplateId(safeTemplate?.id);
      if (!safeTemplate || !templateId) return;

      const selectionSession = beginTemplateSelectionSession(templateId);

      setSelectedTemplate(safeTemplate);
      setIsTemplateModalOpen(true);
      resetTemplateFormState(safeTemplate);
      setTemplatePreviewState(templateId, {
        status: "loading",
        error: "",
      });

      void (async () => {
        try {
          const { getTemplateById } = await loadTemplateServiceModule();
          const fullTemplate = await getTemplateById(templateId);

          if (!fullTemplate) {
            void loadTemplatePreview(safeTemplate);
            return;
          }

          if (
            canApplyTemplateModalSelectionSession({
              activeSelection: activeSelectionRef.current,
              session: selectionSession,
            })
          ) {
            setSelectedTemplate(fullTemplate);
            resetTemplateFormState(fullTemplate);
          }

          void loadTemplatePreview(fullTemplate);
        } catch (error) {
          console.error("Error al cargar detalle de plantilla:", error);
          void loadTemplatePreview(safeTemplate);
        }
      })();
    },
    [
      beginTemplateSelectionSession,
      loadTemplatePreview,
      resetTemplateFormState,
      setTemplatePreviewState,
    ]
  );

  const closeTemplateModal = useCallback(() => {
    if (isOpeningTemplateEditor) return;
    resetTemplateModalController();
  }, [isOpeningTemplateEditor, resetTemplateModalController]);

  const openTemplateEditor = useCallback(
    async ({
      applyChanges,
      rawValues = {},
      touchedKeys = [],
      galleryFilesByField = {},
      previewTextPositions = null,
    }) => {
      const activeTemplate = normalizeTemplateObject(selectedTemplateRef.current);
      const templateId = normalizeTemplateId(activeTemplate?.id);
      if (!templateId || isOpeningTemplateEditor) return;

      const currentFormState = normalizeTemplateFormStateValue(
        templateFormStateRef.current
      );

      setIsOpeningTemplateEditor(true);

      try {
        const { createDraftFromTemplateWithInput } =
          await loadTemplateServiceModule();
        const result = await createDraftFromTemplateWithInput({
          template: activeTemplate,
          userId: userUid,
          rawValues:
            rawValues && typeof rawValues === "object"
              ? rawValues
              : currentFormState.rawValues || {},
          touchedKeys: Array.isArray(touchedKeys)
            ? touchedKeys
            : currentFormState.touchedKeys || [],
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

        resetTemplateModalController();
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
      resetTemplateModalController,
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

  const templateModalViewState = useMemo(
    () =>
      resolveDashboardTemplateModalViewState({
        selectedTemplate,
        templatePreviewCacheById,
        templatePreviewStatus,
        templateFormState,
      }),
    [
      selectedTemplate,
      templateFormState,
      templatePreviewCacheById,
      templatePreviewStatus,
    ]
  );

  const templatePreviewModalProps = useMemo(
    () =>
      buildTemplatePreviewModalProps({
        visible: isTemplateModalOpen,
        template: selectedTemplate,
        metadata: templateModalViewState.selectedTemplateMetadata,
        previewHtml: templateModalViewState.selectedTemplatePreviewHtml,
        previewStatus: templateModalViewState.selectedTemplatePreviewState,
        onClose: closeTemplateModal,
        onOpenEditorWithChanges: handleOpenEditorWithChanges,
        onOpenEditorWithoutChanges: handleOpenEditorWithoutChanges,
        formState: templateModalViewState.selectedTemplateFormState,
        onFormStateChange: handleTemplateModalFormStateChange,
        openingEditor: isOpeningTemplateEditor,
      }),
    [
      closeTemplateModal,
      handleOpenEditorWithChanges,
      handleOpenEditorWithoutChanges,
      handleTemplateModalFormStateChange,
      isOpeningTemplateEditor,
      isTemplateModalOpen,
      selectedTemplate,
      templateModalViewState.selectedTemplateFormState,
      templateModalViewState.selectedTemplateMetadata,
      templateModalViewState.selectedTemplatePreviewHtml,
      templateModalViewState.selectedTemplatePreviewState,
    ]
  );

  return {
    openTemplateModal,
    templatePreviewModalProps,
  };
}
