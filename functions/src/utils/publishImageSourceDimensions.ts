import { resolvePublishImageCropState } from "./publishImageCrop";

type UnknownRecord = Record<string, unknown>;

export type PublishImageSourceDimensionDiagnostics = {
  croppedImageCount: number;
  persistedDimensionCount: number;
  legacyMissingDimensionCount: number;
  dimensionDownloadCount: number;
  dimensionDownloadMs: number;
};

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as UnknownRecord;
}

function asRecordList(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => asRecord(entry));
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function inspectObject(
  object: UnknownRecord,
  diagnostics: PublishImageSourceDimensionDiagnostics
): void {
  if (getString(object.tipo).toLowerCase() === "grupo") {
    const children = Array.isArray(object.children) ? object.children : [];
    children.forEach((child) => inspectObject(asRecord(child), diagnostics));
    return;
  }

  if (getString(object.tipo).toLowerCase() !== "imagen") return;

  const cropState = resolvePublishImageCropState(object);
  if (!cropState.hasMeaningfulCrop) return;

  diagnostics.croppedImageCount += 1;
  if (cropState.sourceWidth !== null && cropState.sourceHeight !== null) {
    diagnostics.persistedDimensionCount += 1;
    return;
  }

  diagnostics.legacyMissingDimensionCount += 1;
}

/**
 * Prepared render must be a metadata-only operation. Source dimensions are
 * authored by the upload/editor owners and are never recovered by downloading
 * full image bytes here. The compatibility name is retained for callers while
 * legacy gaps are surfaced to validation through the unchanged object shape.
 */
export async function backfillPublishImageSourceDimensions(
  objects: unknown[],
  options: {
    onDiagnostics?: (diagnostics: PublishImageSourceDimensionDiagnostics) => void;
  } = {}
): Promise<UnknownRecord[]> {
  const safeObjects = asRecordList(objects);
  const diagnostics: PublishImageSourceDimensionDiagnostics = {
    croppedImageCount: 0,
    persistedDimensionCount: 0,
    legacyMissingDimensionCount: 0,
    dimensionDownloadCount: 0,
    dimensionDownloadMs: 0,
  };

  safeObjects.forEach((object) => inspectObject(object, diagnostics));
  options.onDiagnostics?.(diagnostics);
  return safeObjects;
}
