import { useCallback, useMemo, useRef, useState } from "react";
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

const EMPTY_TEMPLATE_MODAL_DEPENDENCY_OVERRIDES = Object.freeze({});

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

async function getDashboardTemplateById(templateId) {
  const { getTemplateById } = await loadTemplateServiceModule();
  return getTemplateById(templateId);
}

async function createDashboardDraftFromTemplateWithInput(payload) {
  const { createDraftFromTemplateWithInput } =
    await loadTemplateServiceModule();
  return createDraftFromTemplateWithInput(payload);
}

function reportDashboardTemplateEditorOpened({
  slug,
  templateId,
  applyChanges,
} = {}) {
  pushEditorBreadcrumb("abrir-plantilla", {
    slug,
    plantillaId: templateId,
    editor: "konva",
    source: applyChanges
      ? "template-modal-with-changes"
      : "template-modal-without-changes",
  });
}

function showDashboardTemplateModalAlert(message) {
  if (typeof alert !== "function") return;
  alert(message);
}

function logDashboardTemplateLoadError(error) {
  if (typeof console === "undefined" || typeof console.error !== "function") {
    return;
  }
  console.error("Error al cargar detalle de plantilla:", error);
}

function logDashboardTemplateEditorError(error) {
  if (typeof console === "undefined" || typeof console.error !== "function") {
    return;
  }
  console.error(error);
}

function buildDashboardTemplateModalControllerDependencies(
  dependencyOverrides = EMPTY_TEMPLATE_MODAL_DEPENDENCY_OVERRIDES
) {
  const safeOverrides =
    dependencyOverrides && typeof dependencyOverrides === "object"
      ? dependencyOverrides
      : EMPTY_TEMPLATE_MODAL_DEPENDENCY_OVERRIDES;

  return {
    getTemplateById:
      typeof safeOverrides.getTemplateById === "function"
        ? safeOverrides.getTemplateById
        : getDashboardTemplateById,
    createDraftFromTemplateWithInput:
      typeof safeOverrides.createDraftFromTemplateWithInput === "function"
        ? safeOverrides.createDraftFromTemplateWithInput
        : createDashboardDraftFromTemplateWithInput,
    generatePreviewHtml:
      typeof safeOverrides.generatePreviewHtml === "function"
        ? safeOverrides.generatePreviewHtml
        : generateTemplatePreviewHtml,
    resolvePreviewSource:
      typeof safeOverrides.resolvePreviewSource === "function"
        ? safeOverrides.resolvePreviewSource
        : resolveTemplatePreviewSource,
    reportTemplateEditorOpened:
      typeof safeOverrides.reportTemplateEditorOpened === "function"
        ? safeOverrides.reportTemplateEditorOpened
        : reportDashboardTemplateEditorOpened,
    showAlert:
      typeof safeOverrides.showAlert === "function"
        ? safeOverrides.showAlert
        : showDashboardTemplateModalAlert,
    logTemplateLoadError:
      typeof safeOverrides.logTemplateLoadError === "function"
        ? safeOverrides.logTemplateLoadError
        : logDashboardTemplateLoadError,
    logTemplateEditorError:
      typeof safeOverrides.logTemplateEditorError === "function"
        ? safeOverrides.logTemplateEditorError
        : logDashboardTemplateEditorError,
  };
}

function createEmptyTemplateModalSelection() {
  return {
    templateId: "",
    requestKey: "",
    isOpen: false,
  };
}

function buildInitialTemplateFormState(template) {
  const safeTemplate = normalizeTemplateObject(template);
  const nextState = buildTemplateFormState(
    safeTemplate,
    TEMPLATE_FORM_STATE_INITIAL
  );

  return {
    rawValues: nextState.rawValues || {},
    touchedKeys: [],
  };
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

export function createDashboardTemplateModalControllerRuntime({
  userUid,
  openDraftInEditor,
  dependencyOverrides = EMPTY_TEMPLATE_MODAL_DEPENDENCY_OVERRIDES,
  requestSequenceRef,
  activeSelectionRef,
  selectedTemplateRef,
  templateFormStateRef,
  templatePreviewCacheRef,
  isOpeningTemplateEditorRef,
  setSelectedTemplate,
  setIsTemplateModalOpen,
  setIsOpeningTemplateEditor,
  setTemplateFormState,
  setTemplatePreviewStatus,
  setTemplatePreviewCacheById,
} = {}) {
  if (typeof setSelectedTemplate !== "function") {
    throw new Error("setSelectedTemplate is required");
  }
  if (typeof setIsTemplateModalOpen !== "function") {
    throw new Error("setIsTemplateModalOpen is required");
  }
  if (typeof setIsOpeningTemplateEditor !== "function") {
    throw new Error("setIsOpeningTemplateEditor is required");
  }
  if (typeof setTemplateFormState !== "function") {
    throw new Error("setTemplateFormState is required");
  }
  if (typeof setTemplatePreviewStatus !== "function") {
    throw new Error("setTemplatePreviewStatus is required");
  }
  if (typeof setTemplatePreviewCacheById !== "function") {
    throw new Error("setTemplatePreviewCacheById is required");
  }

  const controllerDependencies =
    buildDashboardTemplateModalControllerDependencies(dependencyOverrides);
  const {
    getTemplateById,
    createDraftFromTemplateWithInput,
    generatePreviewHtml,
    resolvePreviewSource,
    reportTemplateEditorOpened,
    showAlert,
    logTemplateLoadError,
    logTemplateEditorError,
  } = controllerDependencies;

  const resolvedRequestSequenceRef =
    requestSequenceRef && typeof requestSequenceRef === "object"
      ? requestSequenceRef
      : { current: 0 };
  const resolvedActiveSelectionRef =
    activeSelectionRef && typeof activeSelectionRef === "object"
      ? activeSelectionRef
      : {
          current: createEmptyTemplateModalSelection(),
        };
  const resolvedSelectedTemplateRef =
    selectedTemplateRef && typeof selectedTemplateRef === "object"
      ? selectedTemplateRef
      : { current: null };
  const resolvedTemplateFormStateRef =
    templateFormStateRef && typeof templateFormStateRef === "object"
      ? templateFormStateRef
      : { current: TEMPLATE_FORM_STATE_INITIAL };
  const resolvedTemplatePreviewCacheRef =
    templatePreviewCacheRef && typeof templatePreviewCacheRef === "object"
      ? templatePreviewCacheRef
      : { current: {} };
  const resolvedIsOpeningTemplateEditorRef =
    isOpeningTemplateEditorRef &&
    typeof isOpeningTemplateEditorRef === "object"
      ? isOpeningTemplateEditorRef
      : { current: false };

  const setSelectedTemplateValue = (template) => {
    const safeTemplate = normalizeTemplateObject(template);
    resolvedSelectedTemplateRef.current = safeTemplate;
    setSelectedTemplate(safeTemplate);
    return safeTemplate;
  };

  const setTemplateFormStateValue = (nextState) => {
    const normalizedState = normalizeTemplateFormStateValue(nextState);
    resolvedTemplateFormStateRef.current = normalizedState;
    setTemplateFormState(normalizedState);
    return normalizedState;
  };

  const setTemplateEditorOpeningValue = (nextValue) => {
    const isOpening = nextValue === true;
    resolvedIsOpeningTemplateEditorRef.current = isOpening;
    setIsOpeningTemplateEditor(isOpening);
    return isOpening;
  };

  const beginTemplateSelectionSession = (templateId) => {
    resolvedRequestSequenceRef.current += 1;
    const session = createTemplateModalSelectionSession({
      templateId,
      requestSequence: resolvedRequestSequenceRef.current,
    });

    resolvedActiveSelectionRef.current = {
      ...session,
      isOpen: true,
    };

    return session;
  };

  const clearTemplateSelectionSession = () => {
    resolvedActiveSelectionRef.current = createEmptyTemplateModalSelection();
  };

  const resetTemplateFormState = (template) => {
    return setTemplateFormStateValue(buildInitialTemplateFormState(template));
  };

  const resetTemplateModalController = () => {
    clearTemplateSelectionSession();
    setIsTemplateModalOpen(false);
    setSelectedTemplateValue(null);
    setTemplateFormStateValue(TEMPLATE_FORM_STATE_INITIAL);
  };

  const setTemplatePreviewState = (templateId, nextStatus) => {
    const safeTemplateId = normalizeTemplateId(templateId);
    if (!safeTemplateId) return;

    setTemplatePreviewStatus((prev) => ({
      ...prev,
      [safeTemplateId]: createTemplatePreviewStatus(nextStatus),
    }));
  };

  const storeTemplatePreviewHtml = (templateId, html) => {
    const safeTemplateId = normalizeTemplateId(templateId);
    if (!safeTemplateId || !String(html || "").trim()) return;

    setTemplatePreviewCacheById((prev) => {
      const safePrev = prev && typeof prev === "object" ? prev : {};
      if (safePrev[safeTemplateId]) return safePrev;
      const next = {
        ...safePrev,
        [safeTemplateId]: html,
      };
      resolvedTemplatePreviewCacheRef.current = next;
      return next;
    });
  };

  const handleTemplateModalFormStateChange = (nextState) => {
    const templateId = normalizeTemplateId(
      resolvedSelectedTemplateRef.current?.id
    );
    if (!templateId) return;
    setTemplateFormStateValue(nextState);
  };

  const loadTemplatePreview = async (template) => {
    const safeTemplate = normalizeTemplateObject(template);
    const templateId = normalizeTemplateId(safeTemplate?.id);
    if (!templateId) return;

    const hasPreviewCache = Boolean(
      resolvedTemplatePreviewCacheRef.current?.[templateId]
    );
    const hasRenderableContent = hasRenderableTemplateContent(safeTemplate);
    const previewSource = resolvePreviewSource(safeTemplate);

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
        const htmlFallback = await generatePreviewHtml(safeTemplate);
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
      const html = await generatePreviewHtml(safeTemplate);
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
  };

  const openTemplateModal = (template) => {
    const safeTemplate = normalizeTemplateObject(template);
    const templateId = normalizeTemplateId(safeTemplate?.id);
    if (!safeTemplate || !templateId) return;

    const selectionSession = beginTemplateSelectionSession(templateId);

    setSelectedTemplateValue(safeTemplate);
    setIsTemplateModalOpen(true);
    resetTemplateFormState(safeTemplate);
    setTemplatePreviewState(templateId, {
      status: "loading",
      error: "",
    });

    void (async () => {
      try {
        const fullTemplate = await getTemplateById(templateId);

        if (!fullTemplate) {
          void loadTemplatePreview(safeTemplate);
          return;
        }

        if (
          canApplyTemplateModalSelectionSession({
            activeSelection: resolvedActiveSelectionRef.current,
            session: selectionSession,
          })
        ) {
          setSelectedTemplateValue(fullTemplate);
          resetTemplateFormState(fullTemplate);
        }

        void loadTemplatePreview(fullTemplate);
      } catch (error) {
        logTemplateLoadError(error);
        void loadTemplatePreview(safeTemplate);
      }
    })();
  };

  const closeTemplateModal = () => {
    if (resolvedIsOpeningTemplateEditorRef.current) return;
    resetTemplateModalController();
  };

  const openTemplateEditor = async ({
    applyChanges,
    rawValues = {},
    touchedKeys = [],
    galleryFilesByField = {},
    previewTextPositions = null,
  }) => {
    const activeTemplate = normalizeTemplateObject(
      resolvedSelectedTemplateRef.current
    );
    const templateId = normalizeTemplateId(activeTemplate?.id);
    if (!templateId || resolvedIsOpeningTemplateEditorRef.current) return;

    const currentFormState = normalizeTemplateFormStateValue(
      resolvedTemplateFormStateRef.current
    );

    setTemplateEditorOpeningValue(true);

    try {
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

      reportTemplateEditorOpened({
        slug,
        templateId,
        applyChanges: applyChanges === true,
      });

      resetTemplateModalController();
      void openDraftInEditor?.(slug);
    } catch (error) {
      showAlert(
        getErrorMessage(error, "No se pudo abrir la plantilla en el editor.")
      );
      logTemplateEditorError(error);
    } finally {
      setTemplateEditorOpeningValue(false);
    }
  };

  const handleOpenEditorWithoutChanges = async () => {
    await openTemplateEditor({
      applyChanges: false,
    });
  };

  const handleOpenEditorWithChanges = async (payload) => {
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
  };

  return {
    openTemplateModal,
    closeTemplateModal,
    handleTemplateModalFormStateChange,
    handleOpenEditorWithoutChanges,
    handleOpenEditorWithChanges,
  };
}

export function useDashboardTemplateModalWithDependencies(
  {
    userUid,
    openDraftInEditor,
  } = {},
  dependencyOverrides = EMPTY_TEMPLATE_MODAL_DEPENDENCY_OVERRIDES
) {
  const [selectedTemplate, setSelectedTemplateState] = useState(null);
  const [isTemplateModalOpen, setIsTemplateModalOpenState] = useState(false);
  const [isOpeningTemplateEditor, setIsOpeningTemplateEditorState] =
    useState(false);
  const [templatePreviewCacheById, setTemplatePreviewCacheByIdState] =
    useState({});
  const [templatePreviewStatus, setTemplatePreviewStatus] = useState({});
  const [templateFormState, setTemplateFormStateState] = useState(
    TEMPLATE_FORM_STATE_INITIAL
  );

  const requestSequenceRef = useRef(0);
  const activeSelectionRef = useRef(createEmptyTemplateModalSelection());
  const selectedTemplateRef = useRef(selectedTemplate);
  const templateFormStateRef = useRef(templateFormState);
  const templatePreviewCacheRef = useRef(templatePreviewCacheById);
  const isOpeningTemplateEditorRef = useRef(isOpeningTemplateEditor);

  const setSelectedTemplate = useCallback((nextValue) => {
    const safeValue = normalizeTemplateObject(nextValue);
    selectedTemplateRef.current = safeValue;
    setSelectedTemplateState(safeValue);
  }, []);

  const setIsOpeningTemplateEditor = useCallback((nextValue) => {
    const isOpening = nextValue === true;
    isOpeningTemplateEditorRef.current = isOpening;
    setIsOpeningTemplateEditorState(isOpening);
  }, []);

  const setTemplateFormState = useCallback((nextState) => {
    const normalizedState = normalizeTemplateFormStateValue(nextState);
    templateFormStateRef.current = normalizedState;
    setTemplateFormStateState(normalizedState);
  }, []);

  const setTemplatePreviewCacheById = useCallback((updater) => {
    setTemplatePreviewCacheByIdState((prev) => {
      const safePrev = prev && typeof prev === "object" ? prev : {};
      const next =
        typeof updater === "function" ? updater(safePrev) : updater;
      const safeNext = next && typeof next === "object" ? next : safePrev;
      templatePreviewCacheRef.current = safeNext;
      return safeNext;
    });
  }, []);

  const runtime = useMemo(
    () =>
      createDashboardTemplateModalControllerRuntime({
        userUid,
        openDraftInEditor,
        dependencyOverrides,
        requestSequenceRef,
        activeSelectionRef,
        selectedTemplateRef,
        templateFormStateRef,
        templatePreviewCacheRef,
        isOpeningTemplateEditorRef,
        setSelectedTemplate,
        setIsTemplateModalOpen: setIsTemplateModalOpenState,
        setIsOpeningTemplateEditor,
        setTemplateFormState,
        setTemplatePreviewStatus,
        setTemplatePreviewCacheById,
      }),
    [
      dependencyOverrides,
      openDraftInEditor,
      setIsOpeningTemplateEditor,
      setSelectedTemplate,
      setTemplateFormState,
      setTemplatePreviewCacheById,
      userUid,
    ]
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
        onClose: runtime.closeTemplateModal,
        onOpenEditorWithChanges: runtime.handleOpenEditorWithChanges,
        onOpenEditorWithoutChanges: runtime.handleOpenEditorWithoutChanges,
        formState: templateModalViewState.selectedTemplateFormState,
        onFormStateChange: runtime.handleTemplateModalFormStateChange,
        openingEditor: isOpeningTemplateEditor,
      }),
    [
      isOpeningTemplateEditor,
      isTemplateModalOpen,
      runtime.closeTemplateModal,
      runtime.handleOpenEditorWithChanges,
      runtime.handleOpenEditorWithoutChanges,
      runtime.handleTemplateModalFormStateChange,
      selectedTemplate,
      templateModalViewState.selectedTemplateFormState,
      templateModalViewState.selectedTemplateMetadata,
      templateModalViewState.selectedTemplatePreviewHtml,
      templateModalViewState.selectedTemplatePreviewState,
    ]
  );

  return {
    openTemplateModal: runtime.openTemplateModal,
    templatePreviewModalProps,
  };
}

export function useDashboardTemplateModal(options = {}) {
  return useDashboardTemplateModalWithDependencies(options);
}
