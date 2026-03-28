export const COUNTDOWN_SIDEBAR_PRESET_PREVIEW_PROPS = Object.freeze({
  size: "sm",
  fitMode: "contain",
  live: false,
});

const SIDEBAR_FALLBACK_MESSAGE =
  "Catalogo remoto no disponible. Mostrando presets disponibles en este entorno.";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveCountdownSidebarFallbackMessage({
  countdownPresetsError,
  usingFallback,
} = {}) {
  if (usingFallback) return SIDEBAR_FALLBACK_MESSAGE;
  return normalizeText(countdownPresetsError);
}

export function getCountdownSidebarPanelPresentation({
  countdownPresetsError,
  usingFallback,
  selectedCountdownContract,
  draftCountdownTarget,
} = {}) {
  return {
    fallbackMessage: resolveCountdownSidebarFallbackMessage({
      countdownPresetsError,
      usingFallback,
    }),
    showSelectedLegacyNotice: false,
    hasSelectedLegacyContract:
      selectedCountdownContract?.isLegacyFrozenCompat === true,
    showCompatibilityAliasNotice:
      draftCountdownTarget?.usesCompatibilityAlias === true,
    compatibilityAliasSourceField: normalizeText(draftCountdownTarget?.sourceField),
  };
}

export function getCountdownSidebarPresetPresentation({ preset } = {}) {
  return {
    previewProps: COUNTDOWN_SIDEBAR_PRESET_PREVIEW_PROPS,
    showLegacyBadge: false,
    hasLegacyContract: preset?.legacyFrozen === true,
  };
}

