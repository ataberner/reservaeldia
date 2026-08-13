export function isDashboardHomeContentReady({
  loadingDrafts,
  loadingPublications,
  loadingTemplates,
  loadingConfig,
} = {}) {
  return (
    loadingDrafts === false &&
    loadingPublications === false &&
    loadingTemplates === false &&
    loadingConfig === false
  );
}
