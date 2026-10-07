export function canAccessAssistant({
  loadingAdminAccess = true,
  canManageSite = false,
} = {}) {
  return loadingAdminAccess === false && canManageSite === true;
}
