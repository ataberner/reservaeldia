export function canAccessDesignerAi({
  userUid = "",
  editorReadOnly = false,
  editorSession = null,
  modoSelector = false,
} = {}) {
  return (
    Boolean(String(userUid || "").trim()) &&
    editorReadOnly !== true &&
    modoSelector !== true &&
    String(editorSession?.kind || "").trim().toLowerCase() === "draft"
  );
}
