import { buildTemplateFormState } from "./formModel.js";
import {
  buildPreviewOperationsForField,
  buildPreviewPatchMessage,
} from "./previewLivePatch.js";
import { shouldPreserveTextCenterPosition } from "@/lib/textCenteringPolicy";
import {
  groupTemplateDraftDebug,
  logTemplateDraftDebug,
} from "./draftPersonalizationDebug.js";

const PANTALLA_EDITOR_HEIGHT_PX = 500;

function normalizeText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parsePixelValue(value) {
  const parsed = Number.parseFloat(String(value == null ? "" : value));
  return Number.isFinite(parsed) ? parsed : null;
}

function compareValues(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    const safeLeft = Array.isArray(left) ? left : [];
    const safeRight = Array.isArray(right) ? right : [];
    if (safeLeft.length !== safeRight.length) return false;
    for (let index = 0; index < safeLeft.length; index += 1) {
      if (String(safeLeft[index] ?? "") !== String(safeRight[index] ?? "")) return false;
    }
    return true;
  }

  return String(left ?? "") === String(right ?? "");
}

function readCssVarNumber(target, name, fallback = 0) {
  if (!target || !name) return fallback;

  const view = target?.ownerDocument?.defaultView || window;
  if (!view?.getComputedStyle) return fallback;

  try {
    const computed = view.getComputedStyle(target);
    const value = computed?.getPropertyValue?.(name);
    const parsed = parsePixelValue(value);
    if (Number.isFinite(parsed)) return parsed;

    const numeric = Number.parseFloat(String(value || "").trim());
    if (Number.isFinite(numeric)) return numeric;
  } catch {}

  return fallback;
}

function getLocalPosition(node) {
  if (!node) return { left: null, top: null };

  const view = node?.ownerDocument?.defaultView || window;
  const computed = view?.getComputedStyle
    ? view.getComputedStyle(node)
    : null;

  const left =
    parsePixelValue(computed?.left) ??
    parsePixelValue(node.style?.left) ??
    toFiniteNumber(node.offsetLeft, null);
  const top =
    parsePixelValue(computed?.top) ??
    parsePixelValue(node.style?.top) ??
    toFiniteNumber(node.offsetTop, null);

  return {
    left,
    top,
  };
}

function getBoxSize(node) {
  if (!node) return { width: null, height: null };

  let width = Number(
    node.scrollWidth ||
      node.offsetWidth ||
      node.clientWidth ||
      0
  );
  let height = Number(
    node.scrollHeight ||
      node.offsetHeight ||
      node.clientHeight ||
      0
  );

  if (
    (!Number.isFinite(width) || width <= 0) ||
    (!Number.isFinite(height) || height <= 0)
  ) {
    const rect = node.getBoundingClientRect?.() || null;
    if (rect) {
      if (!Number.isFinite(width) || width <= 0) {
        width = Number(rect.width || 0);
      }
      if (!Number.isFinite(height) || height <= 0) {
        height = Number(rect.height || 0);
      }
    }
  }

  return {
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
  };
}

function waitForAnimationFrames(count = 2) {
  const safeCount = Math.max(1, Number(count) || 1);
  return new Promise((resolve) => {
    const step = (remaining) => {
      if (remaining <= 0) {
        resolve();
        return;
      }

      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => step(remaining - 1));
        return;
      }

      setTimeout(() => step(remaining - 1), 16);
    };

    step(safeCount);
  });
}

function buildFinalPreviewOperations(template, formState) {
  const model = buildTemplateFormState(template, formState);
  const defaults = asObject(model.defaults);
  const rawValues = asObject(model.rawValues);

  return model.fields.flatMap((field) => {
    const currentValue = rawValues[field.key];
    const defaultValue = defaults[field.key];
    if (compareValues(currentValue, defaultValue)) return [];

    return buildPreviewOperationsForField({
      template,
      fieldKey: field.key,
      value: currentValue,
      phase: field.updateMode,
    });
  });
}

async function flushPreviewOperationsIntoFrame(iframe, operations) {
  const frameWindow = iframe?.contentWindow || null;
  const frameDocument = iframe?.contentDocument || frameWindow?.document || null;
  if (!frameWindow || !frameDocument) return;

  if (frameDocument.fonts?.ready) {
    try {
      await Promise.race([
        frameDocument.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 900)),
      ]);
    } catch {}
  }

  if (Array.isArray(operations) && operations.length > 0) {
    frameWindow.postMessage(buildPreviewPatchMessage(operations), "*");
  }

  await waitForAnimationFrames(3);
}

function collectPreviewTextPositionSnapshot(iframe, template) {
  const frameWindow = iframe?.contentWindow || null;
  const frameDocument = iframe?.contentDocument || frameWindow?.document || null;
  if (!frameWindow || !frameDocument) return null;

  const safeTemplate = asObject(template);
  const objetos = Array.isArray(safeTemplate.objetos) ? safeTemplate.objetos : [];
  const secciones = Array.isArray(safeTemplate.secciones) ? safeTemplate.secciones : [];
  const objectById = new Map(
    objetos.map((objeto) => [normalizeText(objeto?.id), objeto]).filter(([id]) => id)
  );
  const sectionModeById = new Map(
    secciones.map((seccion) => [
      normalizeText(seccion?.id),
      normalizeText(seccion?.altoModo).toLowerCase() === "pantalla" ? "pantalla" : "fijo",
    ])
  );

  const docEl = frameDocument.documentElement;
  const rootScaleX = Math.max(0.0001, readCssVarNumber(docEl, "--sx", 1) || 1);
  const rootBleedScaleX = Math.max(0.0001, readCssVarNumber(docEl, "--bx", rootScaleX) || rootScaleX);
  const rootScreenOffsetPx = readCssVarNumber(docEl, "--pantalla-y-offset", 0) || 0;

  const nodes = frameDocument.querySelectorAll('.objeto[data-debug-texto="1"][data-obj-id]');
  if (!nodes.length) return {};

  const out = {};

  nodes.forEach((node) => {
    const objectId = normalizeText(node.getAttribute("data-obj-id"));
    if (!objectId) return;

    const objeto = objectById.get(objectId);
    if (!objeto || !shouldPreserveTextCenterPosition(objeto)) return;

    const position = getLocalPosition(node);
    const size = getBoxSize(node);
    if (!Number.isFinite(position.left) || !Number.isFinite(position.top)) return;

    const sectionMode =
      sectionModeById.get(normalizeText(objeto?.seccionId)) || "fijo";
    const isFullBleed =
      normalizeText(objeto?.anclaje).toLowerCase() === "fullbleed";
    const sectionNode =
      normalizeText(objeto?.seccionId)
        ? frameDocument.querySelector(
            `[data-seccion-id="${normalizeText(objeto.seccionId)}"]`
          )
        : null;

    const screenScale =
      sectionMode === "pantalla"
        ? Math.max(
            0.0001,
            readCssVarNumber(sectionNode || docEl, "--sfinal", rootScaleX) || rootScaleX
          )
        : rootScaleX;

    const xScale = isFullBleed ? rootBleedScaleX : screenScale;
    const xEditor = Number(position.left) / xScale;

    let yEditor = Number(position.top) / rootScaleX;
    if (sectionMode === "pantalla") {
      const yBasePx = readCssVarNumber(sectionNode || docEl, "--pantalla-y-base", 0) || 0;
      const yCompact = readCssVarNumber(sectionNode || docEl, "--pantalla-y-compact", 0) || 0;
      const yOffsetPx =
        readCssVarNumber(sectionNode || docEl, "--pantalla-y-offset", rootScreenOffsetPx) ||
        rootScreenOffsetPx;
      const normalizedCompact =
        (Number(position.top) - yBasePx - screenScale * yOffsetPx) /
        (screenScale * PANTALLA_EDITOR_HEIGHT_PX);
      const compactDenominator = Math.max(0.001, 1 - yCompact);
      const normalized =
        Math.abs(yCompact) < 0.0001
          ? normalizedCompact
          : 0.5 + ((normalizedCompact - 0.5) / compactDenominator);
      yEditor = normalized * PANTALLA_EDITOR_HEIGHT_PX;
    }

    out[objectId] = {
      x: Number.isFinite(xEditor) ? xEditor : null,
      y: Number.isFinite(yEditor) ? yEditor : null,
      width:
        Number.isFinite(size.width) && Number.isFinite(xScale)
          ? Number(size.width) / xScale
          : null,
      height:
        Number.isFinite(size.height) && Number.isFinite(screenScale)
          ? Number(size.height) / screenScale
          : null,
      source: "template-preview-iframe",
    };
  });

  return out;
}

export async function syncPreviewFrameAndCaptureTextPositions({
  iframe,
  template,
  formState,
} = {}) {
  if (!iframe || typeof document === "undefined") return null;

  const operations = buildFinalPreviewOperations(template, formState);
  logTemplateDraftDebug("preview-sync:start", {
    operationCount: operations.length,
    operationIds: operations
      .map((operation) => normalizeText(operation?.id))
      .filter(Boolean),
  });
  await flushPreviewOperationsIntoFrame(iframe, operations);
  const snapshot = collectPreviewTextPositionSnapshot(iframe, template);
  groupTemplateDraftDebug("preview-sync:captured", [
    ["preview-sync:operations", operations],
    ["preview-sync:snapshot", snapshot],
  ]);
  return snapshot;
}
