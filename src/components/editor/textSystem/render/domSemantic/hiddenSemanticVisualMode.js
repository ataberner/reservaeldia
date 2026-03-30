export function resolveHiddenSemanticVisualMode({
  usesTransformedBackendLayout = false,
} = {}) {
  const shouldUseNativeSelectionVisuals = Boolean(
    usesTransformedBackendLayout
  );

  return {
    shouldUseNativeSelectionVisuals,
    selectionVisualMode: shouldUseNativeSelectionVisuals
      ? "native"
      : "synthetic",
    editorOpacity: shouldUseNativeSelectionVisuals ? 1 : 0,
  };
}
