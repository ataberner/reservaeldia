const DASHBOARD_EXPORT_EXCLUDE_NAME = "dashboard-export-exclude";

const EDITOR_ONLY_LAYER_LABELS = new Set([
  "ui-overlay",
  "drag-overlay",
]);

const EDITOR_ONLY_NODE_NAMES = new Set([
  DASHBOARD_EXPORT_EXCLUDE_NAME,
  "ui",
  "ui-hover-indicator",
  "inline-text-edit-decorations",
  "section-active-indicator",
  "section-background-transformer",
]);

const EDITOR_ONLY_CLASS_NAMES = new Set([
  "Transformer",
]);

export const DASHBOARD_EXPORT_RASTER_LIMITS = Object.freeze({
  maxWidth: 480,
  maxHeight: 2000,
  maxPixels: 750000,
});

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeNameTokens(value) {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function readNodeName(node) {
  try {
    if (typeof node?.name === "function") return normalizeText(node.name());
  } catch {}

  return normalizeText(node?.attrs?.name);
}

function readNodeClassName(node) {
  try {
    if (typeof node?.getClassName === "function") return normalizeText(node.getClassName());
  } catch {}

  return normalizeText(node?.className);
}

function readNodeAttr(node, key) {
  try {
    if (typeof node?.getAttr === "function") return node.getAttr(key);
  } catch {}

  return node?.attrs?.[key];
}

function nodeHasName(node, name) {
  try {
    if (typeof node?.hasName === "function") return node.hasName(name);
  } catch {}

  return normalizeNameTokens(readNodeName(node)).includes(name);
}

function readLayerPerfLabel(layer) {
  return normalizeText(
    layer?.__canvasStagePerfLabel ||
      readNodeAttr(layer, "perfLabel") ||
      readNodeAttr(layer, "data-perf-label")
  );
}

function walkKonvaTree(node, visitor) {
  if (!node) return;
  visitor(node);

  const children =
    typeof node.getChildren === "function"
      ? node.getChildren()
      : Array.isArray(node.children)
        ? node.children
        : [];

  children.forEach((child) => walkKonvaTree(child, visitor));
}

function getStageDimension(stage, key) {
  try {
    const value = typeof stage?.[key] === "function" ? stage[key]() : stage?.attrs?.[key];
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  } catch {
    return 0;
  }
}

function createOffscreenContainer({ width, height }) {
  if (typeof document === "undefined") {
    throw new Error("dashboard-canvas-export requires a browser document.");
  }

  const offscreen = document.createElement("div");
  offscreen.style.position = "fixed";
  offscreen.style.left = "-10000px";
  offscreen.style.top = "-10000px";
  offscreen.style.width = `${width}px`;
  offscreen.style.height = `${height}px`;
  offscreen.style.opacity = "0";
  offscreen.style.pointerEvents = "none";
  document.body.appendChild(offscreen);
  return offscreen;
}

async function createKonvaStage({
  container,
  width,
  height,
  pixelRatio,
}) {
  const module = await import("konva");
  const Konva = module.default || module;
  const previousPixelRatio = Konva.pixelRatio;

  Konva.pixelRatio = pixelRatio;
  try {
    return {
      stage: new Konva.Stage({
        container,
        width,
        height,
        listening: false,
      }),
      restorePixelRatio() {
        Konva.pixelRatio = previousPixelRatio;
      },
    };
  } catch (error) {
    Konva.pixelRatio = previousPixelRatio;
    throw error;
  }
}

function waitForNextFrame() {
  if (typeof requestAnimationFrame !== "function") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export function getDashboardExportExcludedName(existingName = "") {
  const tokens = normalizeNameTokens(existingName);
  if (!tokens.includes(DASHBOARD_EXPORT_EXCLUDE_NAME)) {
    tokens.push(DASHBOARD_EXPORT_EXCLUDE_NAME);
  }
  return tokens.join(" ");
}

export function dashboardExportExcludeProps(existingName = "") {
  return {
    name: getDashboardExportExcludedName(existingName),
  };
}

export function isDashboardExportExcludedLayer(layer) {
  return EDITOR_ONLY_LAYER_LABELS.has(readLayerPerfLabel(layer));
}

export function isDashboardExportExcludedNode(node) {
  if (!node) return false;

  for (const name of EDITOR_ONLY_NODE_NAMES) {
    if (nodeHasName(node, name)) return true;
  }

  return EDITOR_ONLY_CLASS_NAMES.has(readNodeClassName(node));
}

export function cloneDashboardStageLayersForExport(stage, stageClone) {
  const layers = typeof stage?.getChildren === "function" ? stage.getChildren() : [];
  let clonedLayerCount = 0;
  let excludedLayerCount = 0;

  layers.forEach((layer) => {
    if (!layer || typeof layer.clone !== "function") return;

    if (isDashboardExportExcludedLayer(layer)) {
      excludedLayerCount += 1;
      return;
    }

    const layerClone = layer.clone({ listening: false });
    clonedLayerCount += 1;
    stageClone.add(layerClone);
  });

  return {
    clonedLayerCount,
    excludedLayerCount,
  };
}

export function resolveDashboardExportPixelRatio({
  width,
  height,
  requestedPixelRatio = 1,
  limits = DASHBOARD_EXPORT_RASTER_LIMITS,
} = {}) {
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  const requested = Number(requestedPixelRatio);
  if (
    !Number.isFinite(safeWidth) ||
    safeWidth <= 0 ||
    !Number.isFinite(safeHeight) ||
    safeHeight <= 0
  ) {
    return 1;
  }

  const safeRequested =
    Number.isFinite(requested) && requested > 0 ? requested : 1;
  const maxWidth = Number(limits?.maxWidth);
  const maxHeight = Number(limits?.maxHeight);
  const maxPixels = Number(limits?.maxPixels);
  const widthRatio =
    Number.isFinite(maxWidth) && maxWidth > 0 ? maxWidth / safeWidth : 1;
  const heightRatio =
    Number.isFinite(maxHeight) && maxHeight > 0 ? maxHeight / safeHeight : 1;
  const pixelRatio =
    Number.isFinite(maxPixels) && maxPixels > 0
      ? Math.sqrt(maxPixels / (safeWidth * safeHeight))
      : 1;

  return Math.max(
    0.01,
    Math.min(1, safeRequested, widthRatio, heightRatio, pixelRatio)
  );
}

export function applyDashboardExportExclusions(stageClone) {
  let excludedNodeCount = 0;

  walkKonvaTree(stageClone, (node) => {
    if (node === stageClone) return;
    if (!isDashboardExportExcludedNode(node)) return;

    try {
      node.visible(false);
      excludedNodeCount += 1;
    } catch {}
  });

  return {
    excludedNodeCount,
  };
}

export async function exportDashboardImageFromStage(stageInput, options = {}) {
  const stage =
    typeof stageInput?.getStage === "function" ? stageInput.getStage() : stageInput;
  const width = getStageDimension(stage, "width");
  const height = getStageDimension(stage, "height");

  if (!stage || !width || !height) {
    throw new Error("No se puede exportar la imagen del dashboard: Stage invalido.");
  }
  const pixelRatio = resolveDashboardExportPixelRatio({
    width,
    height,
    requestedPixelRatio: options.pixelRatio,
  });
  const offscreen = createOffscreenContainer({ width, height });
  const {
    stage: stageClone,
    restorePixelRatio,
  } = await createKonvaStage({
    container: offscreen,
    width,
    height,
    pixelRatio,
  });

  try {
    try {
      cloneDashboardStageLayersForExport(stage, stageClone);
    } finally {
      restorePixelRatio();
    }
    applyDashboardExportExclusions(stageClone);
    stageClone.draw();
    await waitForNextFrame();

    const dataUrl = stageClone.toDataURL({
      pixelRatio,
      mimeType: normalizeText(options.mimeType) || "image/png",
      ...(typeof options.quality === "number" ? { quality: options.quality } : {}),
    });

    if (!dataUrl || !dataUrl.startsWith("data:image/")) {
      throw new Error("La exportacion del dashboard no genero una imagen valida.");
    }

    return dataUrl;
  } finally {
    try {
      stageClone.destroy();
    } catch {}
    try {
      offscreen.remove();
    } catch {}
  }
}
