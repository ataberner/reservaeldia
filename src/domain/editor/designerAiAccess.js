export function canAccessDesignerAi({
  loadingAdminAccess = true,
  isSuperAdmin = false,
  editorReadOnly = false,
  editorSession = null,
  modoSelector = false,
} = {}) {
  return (
    loadingAdminAccess === false &&
    isSuperAdmin === true &&
    editorReadOnly !== true &&
    modoSelector !== true &&
    String(editorSession?.kind || "").trim().toLowerCase() === "draft"
  );
}
