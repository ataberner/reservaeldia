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
    showRouteResolvingView: isResolvingEditorRoute === true,
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
  templatePreviewModalVisible,
  adminDraftView,
  templateWorkspaceView,
  editorSession,
  ensureDraftFlushBeforeCriticalAction,
  handleOpenTemplateSession,
  seccionActivaId = null,
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
