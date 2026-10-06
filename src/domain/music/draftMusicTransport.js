// Firestore metadata timestamps are reconstructed/preserved by the callable.
export function buildDraftMusicCallableRequest(draftId, patch) {
  const { ultimaEdicion: _timestamp, draftContentMeta, ...content } = patch;
  const { updatedAt: _updatedAt, ...metadata } = draftContentMeta || {};
  if (content.templateInput && typeof content.templateInput === "object") {
    const { appliedAt: _appliedAt, updatedAt: _inputUpdatedAt, ...input } = content.templateInput;
    content.templateInput = input;
  }
  if (content.templateAuthoringDraft && typeof content.templateAuthoringDraft === "object") {
    const { updatedAt: _authoringUpdatedAt, ...authoring } = content.templateAuthoringDraft;
    content.templateAuthoringDraft = authoring;
  }
  return { draftId, patch: { ...content, ...(draftContentMeta ? { draftContentMeta: metadata } : {}) } };
}
