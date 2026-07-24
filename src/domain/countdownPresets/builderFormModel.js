import { createDefaultCountdownPresetConfig } from "./contract.js";
import {
  normalizeCountdownCategory,
  validateCountdownPresetInput,
} from "./validators.js";
import {
  normalizeCountdownFrameColorMode,
  resolveCountdownFrameAssetType,
  resolveCountdownFrameMimeType,
} from "./frameAssetContract.js";

function fileNameFromStoragePath(pathname) {
  const safe = String(pathname || "").trim();
  if (!safe) return "";
  const split = safe.split("/");
  return split[split.length - 1] || safe;
}

function buildUnitStyleFromLegacy(preset, fallback) {
  const legacy = preset?.legacyPresetProps;
  if (!legacy) return fallback;
  return {
    ...fallback,
    showLabels: legacy.showLabels !== false,
    separator: String(legacy.separator || "").slice(0, 4),
    boxBg: String(legacy.boxBg || fallback.boxBg),
    boxBorder: String(legacy.boxBorder || fallback.boxBorder),
    boxRadius: Number.isFinite(legacy.boxRadius)
      ? Number(legacy.boxRadius)
      : fallback.boxRadius,
    boxShadow: legacy.boxShadow === true,
  };
}

export function buildCountdownPresetFormState(preset) {
  const source = preset?.draft || preset || null;
  const defaults = createDefaultCountdownPresetConfig();
  const legacyUnit = buildUnitStyleFromLegacy(preset, defaults.unidad);
  const config = {
    ...defaults,
    layout: { ...defaults.layout, ...(source?.layout || {}) },
    tipografia: { ...defaults.tipografia, ...(source?.tipografia || {}) },
    colores: { ...defaults.colores, ...(source?.colores || {}) },
    animaciones: { ...defaults.animaciones, ...(source?.animaciones || {}) },
    unidad: { ...legacyUnit, ...(source?.unidad || {}) },
    tamanoBase: Number.isFinite(source?.tamanoBase)
      ? source.tamanoBase
      : defaults.tamanoBase,
  };

  const svgRef = source?.svgRef || preset?.svgRef || null;
  const hasFrameAsset = Boolean(
    svgRef?.storagePath || svgRef?.downloadUrl || svgRef?.svgText
  );
  const frameAssetType = hasFrameAsset
    ? resolveCountdownFrameAssetType(svgRef, "svg")
    : null;
  const frameMimeType = hasFrameAsset
    ? resolveCountdownFrameMimeType(svgRef, frameAssetType)
    : null;
  const frameColorMode = normalizeCountdownFrameColorMode(
    frameAssetType,
    svgRef?.colorMode
  );
  return {
    nombre: String(source?.nombre || preset?.nombre || ""),
    categoria: normalizeCountdownCategory(
      source?.categoria || preset?.categoria
    ),
    config,
    svgAsset: hasFrameAsset
      ? {
          valid: true,
          type: frameAssetType,
          fileName: fileNameFromStoragePath(svgRef.storagePath),
          mimeType: frameMimeType,
          byteSize: Number(svgRef.bytes || 0),
          width: Number(svgRef.width || 0) || null,
          height: Number(svgRef.height || 0) || null,
          hasAlpha:
            typeof svgRef.hasAlpha === "boolean" ? svgRef.hasAlpha : null,
          hasTransparency:
            typeof svgRef.hasTransparency === "boolean"
              ? svgRef.hasTransparency
              : null,
          svgText:
            frameAssetType === "svg" && typeof svgRef.svgText === "string"
              ? svgRef.svgText
              : "",
          assetBase64: null,
          svgBase64: null,
          previewUrl: svgRef.downloadUrl || null,
          downloadUrl: svgRef.downloadUrl || null,
          colorMode: frameColorMode,
          inspection: {
            warnings: [],
            criticalErrors: [],
            checks: {
              fileName: fileNameFromStoragePath(svgRef.storagePath),
              mimeType: frameMimeType,
              bytes: Number(svgRef.bytes || 0),
              viewBox: svgRef.viewBox || null,
              width: Number(svgRef.width || 0) || null,
              height: Number(svgRef.height || 0) || null,
              hasAlpha:
                typeof svgRef.hasAlpha === "boolean"
                  ? svgRef.hasAlpha
                  : null,
              hasTransparency:
                typeof svgRef.hasTransparency === "boolean"
                  ? svgRef.hasTransparency
                  : null,
              hasFixedDimensions: Boolean(svgRef.hasFixedDimensions),
              colorMode: frameColorMode,
            },
          },
          isDirty: false,
        }
      : null,
  };
}

export function validateCountdownPresetFormState(formState) {
  const safeState = formState || buildCountdownPresetFormState(null);
  return validateCountdownPresetInput({
    nombre: safeState.nombre,
    categoria: safeState.categoria,
    config: {
      ...safeState.config,
      svgRef: {
        type: resolveCountdownFrameAssetType(
          safeState.svgAsset,
          safeState.svgAsset ? "svg" : null
        ),
        mimeType: safeState.svgAsset?.mimeType || null,
        colorMode: normalizeCountdownFrameColorMode(
          resolveCountdownFrameAssetType(
            safeState.svgAsset,
            safeState.svgAsset ? "svg" : null
          ),
          safeState.svgAsset?.colorMode
        ),
      },
    },
    svgInspection: safeState.svgAsset?.inspection || null,
  });
}

export function markCountdownPresetFormSaved(formState) {
  return {
    ...(formState || {}),
    svgAsset: formState?.svgAsset
      ? { ...formState.svgAsset, isDirty: false }
      : formState?.svgAsset || null,
  };
}

export function replaceCountdownPresetFrameAsset(formState, svgAsset) {
  const safeState = formState || buildCountdownPresetFormState(null);
  if (svgAsset) {
    return { ...safeState, svgAsset };
  }
  const defaults = createDefaultCountdownPresetConfig();
  return {
    ...safeState,
    config: {
      ...safeState.config,
      layout: {
        ...safeState.config?.layout,
        frameScale: defaults.layout.frameScale,
      },
    },
    svgAsset: null,
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, value[key]])
    )
  );
}

export function compareCountdownVersionToDraft(version, formState) {
  if (!version || !formState) return [];
  const comparisons = [
    ["Información", version.nombre, formState.nombre],
    ["Categoría", version.categoria, formState.categoria],
    ["Layout", version.layout, formState.config?.layout],
    ["Tipografía", version.tipografia, formState.config?.tipografia],
    ["Colores", version.colores, formState.config?.colores],
    ["Unidades", version.unidad, formState.config?.unidad],
    ["Animaciones", version.animaciones, formState.config?.animaciones],
    ["Tamaño base", version.tamanoBase, formState.config?.tamanoBase],
    [
      "Frame",
      version.svgRef?.storagePath
        ? {
            fileName: fileNameFromStoragePath(version.svgRef.storagePath),
            type: resolveCountdownFrameAssetType(version.svgRef, "svg"),
            colorMode: normalizeCountdownFrameColorMode(
              resolveCountdownFrameAssetType(version.svgRef, "svg"),
              version.svgRef.colorMode
            ),
            isDirty: false,
          }
        : null,
      formState.svgAsset
          ? {
            fileName: formState.svgAsset.fileName || "",
            type: resolveCountdownFrameAssetType(
              formState.svgAsset,
              "svg"
            ),
            colorMode: formState.svgAsset.colorMode || "fixed",
            isDirty: formState.svgAsset.isDirty === true,
          }
        : null,
    ],
  ];
  return comparisons
    .filter(([, publishedValue, draftValue]) => {
      if (
        typeof publishedValue === "object" ||
        typeof draftValue === "object"
      ) {
        return stableJson(publishedValue) !== stableJson(draftValue);
      }
      return publishedValue !== draftValue;
    })
    .map(([label]) => label);
}

export function resolveCountdownPresetArchiveLabel(preset) {
  if (!preset?.id) return "Archivar";
  if (preset?.estado === "archived") return "Desarchivar";
  return "Archivar";
}
