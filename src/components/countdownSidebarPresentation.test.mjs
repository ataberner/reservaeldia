import test from "node:test";
import assert from "node:assert/strict";

import {
  COUNTDOWN_SIDEBAR_PRESET_PREVIEW_PROPS,
  getCountdownSidebarPanelPresentation,
  getCountdownSidebarPresetPresentation,
  resolveCountdownSidebarFallbackMessage,
} from "./countdownSidebarPresentation.js";

test("sidebar preset previews stay on the compact contain-fit countdown preview contract", () => {
  assert.deepEqual(COUNTDOWN_SIDEBAR_PRESET_PREVIEW_PROPS, {
    size: "sm",
    fitMode: "contain",
    live: false,
  });

  const presentation = getCountdownSidebarPresetPresentation({
    preset: {
      id: "legacy-preset",
      legacyFrozen: true,
    },
  });

  assert.equal(presentation.hasLegacyContract, true);
  assert.equal(presentation.showLegacyBadge, false);
  assert.equal(
    presentation.previewProps,
    COUNTDOWN_SIDEBAR_PRESET_PREVIEW_PROPS
  );
});

test("sidebar panel suppresses legacy contract notices while preserving alias guidance", () => {
  const presentation = getCountdownSidebarPanelPresentation({
    selectedCountdownContract: {
      isLegacyFrozenCompat: true,
    },
    draftCountdownTarget: {
      usesCompatibilityAlias: true,
      sourceField: "fechaISO",
    },
  });

  assert.equal(presentation.hasSelectedLegacyContract, true);
  assert.equal(presentation.showSelectedLegacyNotice, false);
  assert.equal(presentation.showCompatibilityAliasNotice, true);
  assert.equal(presentation.compatibilityAliasSourceField, "fechaISO");
});

test("sidebar fallback copy stays visible without leaking legacy-compat messaging", () => {
  const fallbackMessage = resolveCountdownSidebarFallbackMessage({
    usingFallback: true,
    countdownPresetsError: "No se pudo cargar el catalogo remoto.",
  });

  assert.match(fallbackMessage, /Catalogo remoto no disponible/i);
  assert.doesNotMatch(fallbackMessage, /legacy compat/i);
  assert.doesNotMatch(fallbackMessage, /schema v1 legacy/i);

  const passthroughMessage = resolveCountdownSidebarFallbackMessage({
    usingFallback: false,
    countdownPresetsError: "Error remoto puntual",
  });

  assert.equal(passthroughMessage, "Error remoto puntual");
});
