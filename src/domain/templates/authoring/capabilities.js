function normalizeText(value) {
  return String(value || "").trim();
}

export function resolveTemplateAuthoringCapabilities({
  enabled = false,
  canEditSchema = enabled,
  canUseFields = enabled,
  sourceTemplateId = "",
} = {}) {
  const isActive = enabled === true && Boolean(normalizeText(sourceTemplateId));

  return {
    canEditSchema: isActive && canEditSchema === true,
    canUseFields: isActive && canUseFields !== false,
  };
}
