const COUNTDOWN_FRAME_ASSET_TYPES = Object.freeze(["svg", "png"]);

const COUNTDOWN_FRAME_MIME_TYPES = Object.freeze({
  svg: "image/svg+xml",
  png: "image/png",
});

const COUNTDOWN_FRAME_ASSET_LIMITS = Object.freeze({
  svgMaxBytes: 500 * 1024,
  svgWarningBytes: 200 * 1024,
  pngMaxBytes: 5 * 1024 * 1024,
  pngMinDimension: 600,
  pngRecommendedDimension: 1200,
  pngMaxDimension: 6000,
  pngMaxPixels: 24 * 1000 * 1000,
  pngMaxAspectRatio: 3,
});

const PNG_SIGNATURE = Object.freeze([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function normalizeText(value, maxLength = 1000) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function extensionFromValue(value) {
  const clean = normalizeText(value).split(/[?#]/, 1)[0].toLowerCase();
  if (clean.endsWith(".png")) return "png";
  if (clean.endsWith(".svg")) return "svg";
  return null;
}

function resolveCountdownFrameAssetType(value, fallback = null) {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const explicitType = normalizeText(source.type, 20).toLowerCase();
  if (COUNTDOWN_FRAME_ASSET_TYPES.includes(explicitType)) return explicitType;

  const mimeType = normalizeText(source.mimeType, 80).toLowerCase();
  if (mimeType === COUNTDOWN_FRAME_MIME_TYPES.png) return "png";
  if (mimeType === COUNTDOWN_FRAME_MIME_TYPES.svg) return "svg";

  for (const candidate of [
    source.fileName,
    source.storagePath,
    source.downloadUrl,
    source.previewUrl,
  ]) {
    const inferred = extensionFromValue(candidate);
    if (inferred) return inferred;
  }

  return COUNTDOWN_FRAME_ASSET_TYPES.includes(fallback) ? fallback : null;
}

function resolveCountdownFrameMimeType(value, fallback = null) {
  const type = resolveCountdownFrameAssetType(value, fallback);
  return type ? COUNTDOWN_FRAME_MIME_TYPES[type] : null;
}

function normalizeCountdownFrameColorMode(assetType, colorMode) {
  if (assetType !== "svg") return "fixed";
  return colorMode === "currentColor" ? "currentColor" : "fixed";
}

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return new Uint8Array();
}

function readUint32(bytes, offset) {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}

function readChunkType(bytes, offset) {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3]
  );
}

function inspectCountdownPngBytes(value) {
  const bytes = asBytes(value);
  const criticalErrors = [];
  const warnings = [];
  const checks = {
    mimeType: COUNTDOWN_FRAME_MIME_TYPES.png,
    bytes: bytes.byteLength,
    width: null,
    height: null,
    hasAlpha: null,
    hasAlphaChannel: null,
    hasTransparency: null,
    hasTransparencyChunk: false,
    bitDepth: null,
    colorType: null,
  };

  const hasSignature =
    bytes.byteLength >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
  if (!hasSignature) {
    criticalErrors.push("El archivo no es un PNG válido.");
    return { valid: false, warnings, criticalErrors, checks };
  }

  if (bytes.byteLength > COUNTDOWN_FRAME_ASSET_LIMITS.pngMaxBytes) {
    criticalErrors.push("La imagen supera el tamaño máximo permitido.");
  }

  let offset = PNG_SIGNATURE.length;
  let foundHeader = false;
  let foundImageData = false;
  let foundEnd = false;

  while (offset + 12 <= bytes.byteLength) {
    const length = readUint32(bytes, offset);
    const type = readChunkType(bytes, offset + 4);
    const dataStart = offset + 8;
    const nextOffset = dataStart + length + 4;

    if (
      !Number.isFinite(length) ||
      length < 0 ||
      nextOffset > bytes.byteLength
    ) {
      criticalErrors.push("No pudimos leer el archivo. Probá exportándolo nuevamente.");
      break;
    }

    if (type === "IHDR") {
      if (foundHeader || length !== 13 || offset !== PNG_SIGNATURE.length) {
        criticalErrors.push("El archivo no es un PNG válido.");
        break;
      }
      foundHeader = true;
      checks.width = readUint32(bytes, dataStart);
      checks.height = readUint32(bytes, dataStart + 4);
      checks.bitDepth = bytes[dataStart + 8];
      checks.colorType = bytes[dataStart + 9];
      checks.hasAlphaChannel =
        checks.colorType === 4 || checks.colorType === 6;
    } else if (type === "IDAT") {
      foundImageData = true;
    } else if (type === "tRNS") {
      checks.hasTransparencyChunk = true;
    } else if (type === "IEND") {
      foundEnd = length === 0;
      break;
    }

    offset = nextOffset;
  }

  if (!foundHeader || !foundImageData || !foundEnd) {
    criticalErrors.push("No pudimos leer el archivo. Probá exportándolo nuevamente.");
  }

  const width = Number(checks.width || 0);
  const height = Number(checks.height || 0);
  const minDimension = Math.min(width, height);
  const maxDimension = Math.max(width, height);
  const pixels = width * height;
  const aspectRatio =
    minDimension > 0 ? maxDimension / minDimension : Number.POSITIVE_INFINITY;

  if (width <= 0 || height <= 0) {
    criticalErrors.push("El archivo no es un PNG válido.");
  } else {
    if (minDimension < COUNTDOWN_FRAME_ASSET_LIMITS.pngMinDimension) {
      criticalErrors.push("La imagen tiene una resolución demasiado baja.");
    }
    if (
      maxDimension > COUNTDOWN_FRAME_ASSET_LIMITS.pngMaxDimension ||
      pixels > COUNTDOWN_FRAME_ASSET_LIMITS.pngMaxPixels
    ) {
      criticalErrors.push("La imagen tiene dimensiones demasiado grandes.");
    }
    if (aspectRatio > COUNTDOWN_FRAME_ASSET_LIMITS.pngMaxAspectRatio) {
      criticalErrors.push("La proporción de la imagen es demasiado extrema.");
    }
    if (
      minDimension >= COUNTDOWN_FRAME_ASSET_LIMITS.pngMinDimension &&
      minDimension < COUNTDOWN_FRAME_ASSET_LIMITS.pngRecommendedDimension
    ) {
      warnings.push(
        "Para un resultado más nítido, recomendamos al menos 1200 × 1200 px."
      );
    }
    if (Math.abs(width - height) / maxDimension > 0.05) {
      warnings.push("Para frames, recomendamos una imagen cuadrada.");
    }
  }

  checks.hasAlpha =
    checks.hasAlphaChannel === true || checks.hasTransparencyChunk === true;
  if (checks.hasAlpha !== true) {
    warnings.push(
      "La imagen no tiene transparencia. Puede verse un fondo rectangular."
    );
  }

  return {
    valid: criticalErrors.length === 0,
    warnings: Array.from(new Set(warnings)),
    criticalErrors: Array.from(new Set(criticalErrors)),
    checks,
  };
}

module.exports = {
  COUNTDOWN_FRAME_ASSET_LIMITS,
  COUNTDOWN_FRAME_ASSET_TYPES,
  COUNTDOWN_FRAME_MIME_TYPES,
  PNG_SIGNATURE,
  inspectCountdownPngBytes,
  normalizeCountdownFrameColorMode,
  resolveCountdownFrameAssetType,
  resolveCountdownFrameMimeType,
};
