function normalizeText(value) {
  return String(value || "").trim();
}

export function buildDashboardPageViewState({
  slugInvitacion,
  vista,
  isResolvingEditorRoute,
  isSuperAdmin = false,
  legacyDraftNotice = null,
  adminDraftView = null,
} = {}) {
  const hasActiveEditor = Boolean(slugInvitacion);

  return {
    hasActiveEditor,
    isHomeView:
      !hasActiveEditor &&
      vista === "home" &&
      isResolvingEditorRoute !== true,
    showLegacyDraftNotice: Boolean(legacyDraftNotice) && !hasActiveEditor,
    showAdminDraftLoadingNotice:
      !hasActiveEditor &&
      adminDraftView?.enabled === true &&
      adminDraftView?.status === "loading",
    showPublicationsView: !hasActiveEditor && vista === "publicadas",
    showTrashView: !hasActiveEditor && vista === "papelera",
    showManagementView:
      !hasActiveEditor && vista === "gestion" && isSuperAdmin === true,
    showEditorView: hasActiveEditor,
  };
}

export function buildDashboardLayoutProps({
  slugInvitacion,
  setSlugInvitacion,
  setModoEditor,
  zoom,
  toggleZoom,
  historialExternos,
  futurosExternos,
  generarVistaPrevia,
  usuario,
  vista,
  setVista,
  canManageSite,
  isSuperAdmin,
  loadingAdminAccess,
  isEditorReadOnly,
  isResolvingEditorRoute,
  shouldRenderHomeStartupLoader,
  editorPreloadState = null,
  editorRuntimeState = null,
  showEditorStartupLoader = false,
  shouldRenderEditorStartupLoader = false,
  isEditorStartupLoaderExiting = false,
  templatePreviewModalVisible,
  adminDraftView,
  templateWorkspaceView,
  editorSession,
  ensureDraftFlushBeforeCriticalAction,
  handleOpenTemplateSession,
  seccionActivaId = null,
  assistantTourEditorReady = false,
  assistantTourPreferencesLoaded = false,
  assistantTourOptOut = false,
  assistantTourSaving = false,
  onAssistantTourPreferenceChange = null,
  assistantTourPreviewOpen = false,
} = {}) {
  return {
    mostrarMiniToolbar: Boolean(slugInvitacion) && !isEditorReadOnly,
    seccionActivaId,
    modoSelector:
      !slugInvitacion && vista === "home" && isResolvingEditorRoute !== true,
    slugInvitacion,
    setSlugInvitacion,
    setModoEditor,
    zoom,
    toggleZoom,
    historialExternos,
    futurosExternos,
    generarVistaPrevia,
    usuario,
    vista,
    onCambiarVista: setVista,
    ocultarSidebar:
      vista === "publicadas" ||
      vista === "papelera" ||
      vista === "gestion" ||
      isEditorReadOnly === true ||
      isResolvingEditorRoute === true,
    canManageSite,
    isSuperAdmin,
    loadingAdminAccess,
    lockMainScroll:
      shouldRenderHomeStartupLoader === true ||
      templatePreviewModalVisible === true,
    editorPreloadState,
    editorRuntimeState,
    showEditorStartupLoader: showEditorStartupLoader === true,
    shouldRenderEditorStartupLoader:
      shouldRenderEditorStartupLoader === true,
    isEditorStartupLoaderExiting:
      isEditorStartupLoaderExiting === true,
    editorReadOnly: isEditorReadOnly === true,
    draftDisplayName:
      normalizeText(adminDraftView?.draftName) ||
      normalizeText(templateWorkspaceView?.draftName) ||
      "",
    editorSession: editorSession && typeof editorSession === "object"
      ? editorSession
      : null,
    templateSessionMeta:
      templateWorkspaceView && typeof templateWorkspaceView === "object"
        ? templateWorkspaceView
        : null,
    ensureEditorFlushBeforeAction: ensureDraftFlushBeforeCriticalAction,
    onOpenTemplateSession: handleOpenTemplateSession,
    assistantTourEditorReady: assistantTourEditorReady === true,
    assistantTourPreferencesLoaded: assistantTourPreferencesLoaded === true,
    assistantTourOptOut: assistantTourOptOut === true,
    assistantTourSaving: assistantTourSaving === true,
    onAssistantTourPreferenceChange,
    assistantTourPreviewOpen: assistantTourPreviewOpen === true,
  };
}

export function buildDashboardCanvasEditorProps({
  slugInvitacion,
  editorSession,
  zoom,
  setHistorialExternos,
  setFuturosExternos,
  usuarioUid,
  handleEditorStartupStatusChange,
  canManageSite,
  isAdminReadOnlyView,
  isEditorReadOnly,
  adminDraftView,
  templateWorkspaceView,
} = {}) {
  return {
    slug: slugInvitacion,
    editorSession,
    zoom,
    onHistorialChange: setHistorialExternos,
    onFuturosChange: setFuturosExternos,
    userId: usuarioUid,
    secciones: [],
    onStartupStatusChange: handleEditorStartupStatusChange,
    canManageSite: canManageSite === true && isAdminReadOnlyView !== true,
    readOnly: isEditorReadOnly === true,
    initialDraftData:
      isAdminReadOnlyView === true ? adminDraftView?.draftData || null : null,
    initialEditorData:
      isAdminReadOnlyView === true
        ? adminDraftView?.draftData || null
        : templateWorkspaceView?.initialData || null,
  };
}

export function buildDashboardPreviewGateState({
  isTemplateEditorSession = false,
  mostrarCheckoutPublicacion = false,
} = {}) {
  const canPublishFromPreview = isTemplateEditorSession !== true;
  const previewCheckoutVisible =
    canPublishFromPreview && mostrarCheckoutPublicacion === true;

  return {
    canPublishFromPreview,
    previewCheckoutVisible,
    checkoutModalVisible: previewCheckoutVisible,
  };
}
