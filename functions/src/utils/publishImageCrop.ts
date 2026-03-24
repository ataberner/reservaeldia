type ImageCropMaterializationIssue =
  | "missing-source-size"
  | "missing-display-size"
  | null;

type UnknownRecord = Record<string, unknown>;

export type PublishImageCropState = {
  sourceWidth: number | null;
  sourceHeight: number | null;
  displayWidth: number | null;
  displayHeight: number | null;
  cropX: number;
  cropY: number;
  cropWidth: number | null;
  cropHeight: number | null;
  hasMeaningfulCrop: boolean;
  canMaterializeCrop: boolean;
  materializationIssue: ImageCropMaterializationIssue;
};

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as UnknownRecord;
}

function toFiniteNumber(value: unknown, fallback: number | null = null): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toPositiveNumber(value: unknown, fallback: number | null = null): number | null {
  const parsed = toFiniteNumber(value, fallback);
  if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return value;
  return Math.min(Math.max(value, min), max);
}

export function resolvePublishImageCropState(rawObject: unknown): PublishImageCropState {
  const source = asRecord(rawObject);
  const sourceWidth = toPositiveNumber(source.ancho);
  const sourceHeight = toPositiveNumber(source.alto);
  const displayWidth = toPositiveNumber(source.width, sourceWidth);
  const displayHeight = toPositiveNumber(source.height, sourceHeight);

  let cropX = Math.max(0, toFiniteNumber(source.cropX, 0) ?? 0);
  let cropY = Math.max(0, toFiniteNumber(source.cropY, 0) ?? 0);
  let cropWidth = toPositiveNumber(source.cropWidth, sourceWidth);
  let cropHeight = toPositiveNumber(source.cropHeight, sourceHeight);

  if (sourceWidth !== null) {
    cropX = clamp(cropX, 0, Math.max(0, sourceWidth - 1));
    cropWidth =
      cropWidth !== null
        ? clamp(cropWidth, 1, Math.max(1, sourceWidth - cropX))
        : cropWidth;
  }

  if (sourceHeight !== null) {
    cropY = clamp(cropY, 0, Math.max(0, sourceHeight - 1));
    cropHeight =
      cropHeight !== null
        ? clamp(cropHeight, 1, Math.max(1, sourceHeight - cropY))
        : cropHeight;
  }

  const cropWidthDiffersFromSource =
    cropWidth !== null &&
    (sourceWidth !== null ? cropWidth < sourceWidth - 0.5 : cropWidth > 0);
  const cropHeightDiffersFromSource =
    cropHeight !== null &&
    (sourceHeight !== null ? cropHeight < sourceHeight - 0.5 : cropHeight > 0);

  const hasMeaningfulCrop = Boolean(
    cropX !== 0 || cropY !== 0 || cropWidthDiffersFromSource || cropHeightDiffersFromSource
  );

  let materializationIssue: ImageCropMaterializationIssue = null;
  if (hasMeaningfulCrop) {
    if (!(sourceWidth && sourceHeight && cropWidth && cropHeight)) {
      materializationIssue = "missing-source-size";
    } else if (!(displayWidth && displayHeight)) {
      materializationIssue = "missing-display-size";
    }
  }

  return {
    sourceWidth,
    sourceHeight,
    displayWidth,
    displayHeight,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    hasMeaningfulCrop,
    canMaterializeCrop: materializationIssue === null,
    materializationIssue,
  };
}
