function getLayerLabel(layer) {
  return layer?.__canvasStagePerfLabel || null;
}

export function activateKonvaLayerFreeze(layer) {
  if (!layer) {
    return {
      frozen: false,
      layerLabel: null,
    };
  }

  if (layer.__canvasFreezeState) {
    return {
      frozen: true,
      layerLabel: getLayerLabel(layer),
      alreadyFrozen: true,
    };
  }

  const originalDrawScene =
    typeof layer.drawScene === "function" ? layer.drawScene : null;
  const originalDrawHit =
    typeof layer.drawHit === "function" ? layer.drawHit : null;
  const originalListening =
    typeof layer.listening === "function" ? layer.listening() : null;

  if (!originalDrawScene && !originalDrawHit) {
    return {
      frozen: false,
      layerLabel: getLayerLabel(layer),
    };
  }

  layer.__canvasFreezeState = {
    drawScene: originalDrawScene,
    drawHit: originalDrawHit,
    listening: originalListening,
  };

  if (originalDrawScene) {
    layer.drawScene = function frozenLayerDrawScene() {
      return this;
    };
  }

  if (originalDrawHit) {
    layer.drawHit = function frozenLayerDrawHit() {
      return this;
    };
  }

  if (typeof layer.listening === "function") {
    try {
      layer.listening(false);
    } catch {}
  }

  return {
    frozen: true,
    layerLabel: getLayerLabel(layer),
    alreadyFrozen: false,
  };
}

export function deactivateKonvaLayerFreeze(layer, options = {}) {
  const freezeState = layer?.__canvasFreezeState || null;
  const shouldBatchDraw = options?.batchDraw !== false;
  if (!layer || !freezeState) {
    return {
      thawed: false,
      layerLabel: getLayerLabel(layer),
    };
  }

  if (freezeState.drawScene) {
    layer.drawScene = freezeState.drawScene;
  }
  if (freezeState.drawHit) {
    layer.drawHit = freezeState.drawHit;
  }

  if (freezeState.listening != null && typeof layer.listening === "function") {
    try {
      layer.listening(freezeState.listening);
    } catch {}
  }

  delete layer.__canvasFreezeState;

  if (shouldBatchDraw) {
    try {
      layer.batchDraw?.();
    } catch {}
  }

  return {
    thawed: true,
    layerLabel: getLayerLabel(layer),
  };
}
