export function resolveEditorUserMenuAccess({
  hasActiveEditor = false,
  loadingAdminAccess = false,
  canManageSite = false,
  isSuperAdmin = false,
  editorReadOnly = false,
  isAdminReadOnlyView = false,
} = {}) {
  const hasResolvedManagementAccess =
    hasActiveEditor === true &&
    loadingAdminAccess !== true &&
    canManageSite === true;
  const showWritableAdminActions =
    hasResolvedManagementAccess && editorReadOnly !== true;
  const showReadOnlySuperAdminCreateTemplate =
    hasResolvedManagementAccess &&
    editorReadOnly === true &&
    isAdminReadOnlyView === true &&
    isSuperAdmin === true;

  return {
    showAddSection: showWritableAdminActions,
    showCreateTemplate:
      showWritableAdminActions || showReadOnlySuperAdminCreateTemplate,
    showSaveTemplate: showWritableAdminActions,
  };
}
