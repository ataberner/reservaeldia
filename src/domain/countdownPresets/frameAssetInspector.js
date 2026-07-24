import {
  COUNTDOWN_FRAME_ASSET_LIMITS,
  COUNTDOWN_FRAME_MIME_TYPES,
  inspectCountdownPngBytes,
} from "./frameAssetContract.js";
import {
  inspectSvgFile,
  svgTextToBase64,
} from "./svgInspector.js";

function bytesToBase64(bytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < source.length; offset += chunkSize) {
    binary += String.fromCharCode(...source.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function invalidReport(message, checks = {}) {
  return {
    valid: false,
    warnings: [],
    criticalErrors: [message],
    checks,
  };
}

export function hasTransparentPixelInRgba(pixelBytes) {
  const bytes =
    pixelBytes instanceof Uint8ClampedArray ||
    pixelBytes instanceof Uint8Array
      ? pixelBytes
      : new Uint8ClampedArray();
  for (let index = 3; index < bytes.length; index += 4) {
    if (bytes[index] < 255) return true;
  }
  return false;
}

function inspectDecodedTransparency(image, width, height) {
  if (width <= 0 || height <= 0) return null;
  const maxProbeSide = 192;
  const probeScale = Math.min(1, maxProbeSide / Math.max(width, height));
  const probeWidth = Math.max(1, Math.round(width * probeScale));
  const probeHeight = Math.max(1, Math.round(height * probeScale));
  const canvas =
    typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(probeWidth, probeHeight)
      : typeof document !== "undefined"
        ? document.createElement("canvas")
        : null;
  if (!canvas) return null;
  canvas.width = probeWidth;
  canvas.height = probeHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.clearRect(0, 0, probeWidth, probeHeight);
  context.drawImage(image, 0, 0, probeWidth, probeHeight);
  try {
    return hasTransparentPixelInRgba(
      context.getImageData(0, 0, probeWidth, probeHeight).data
    );
  } catch {
    return null;
  }
}

function decodePngFile(file) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file).then((bitmap) => {
      const dimensions = {
        width: Number(bitmap.width || 0),
        height: Number(bitmap.height || 0),
        hasTransparency: inspectDecodedTransparency(
          bitmap,
          Number(bitmap.width || 0),
          Number(bitmap.height || 0)
        ),
      };
      bitmap.close?.();
      return dimensions;
    });
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const dimensions = {
        width: Number(image.naturalWidth || image.width || 0),
        height: Number(image.naturalHeight || image.height || 0),
        hasTransparency: inspectDecodedTransparency(
          image,
          Number(image.naturalWidth || image.width || 0),
          Number(image.naturalHeight || image.height || 0)
        ),
      };
      URL.revokeObjectURL(objectUrl);
      resolve(dimensions);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("decode-failed"));
    };
    image.src = objectUrl;
  });
}

export async function inspectPngFile(file) {
  if (!file) {
    return invalidReport("Seleccioná un archivo PNG.");
  }

  const fileName = String(file.name || "").trim();
  const mimeType = String(file.type || "").trim().toLowerCase();
  if (!fileName.toLowerCase().endsWith(".png")) {
    return invalidReport("El archivo no es un SVG o PNG válido.", {
      fileName,
      mimeType,
    });
  }
  if (mimeType && mimeType !== COUNTDOWN_FRAME_MIME_TYPES.png) {
    return invalidReport("El archivo no es un SVG o PNG válido.", {
      fileName,
      mimeType,
    });
  }
  if (Number(file.size || 0) > COUNTDOWN_FRAME_ASSET_LIMITS.pngMaxBytes) {
    return invalidReport("La imagen supera el tamaño máximo permitido.", {
      fileName,
      mimeType,
      bytes: Number(file.size || 0),
    });
  }

  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return invalidReport(
      "No pudimos leer el archivo. Probá exportándolo nuevamente.",
      { fileName, mimeType, bytes: Number(file.size || 0) }
    );
  }

  const structuralReport = inspectCountdownPngBytes(bytes);
  if (!structuralReport.valid) {
    return {
      ...structuralReport,
      checks: {
        ...structuralReport.checks,
        fileName,
        mimeType: COUNTDOWN_FRAME_MIME_TYPES.png,
      },
    };
  }

  let decoded;
  try {
    decoded = await decodePngFile(file);
  } catch {
    return invalidReport(
      "No pudimos leer el archivo. Probá exportándolo nuevamente.",
      {
        ...structuralReport.checks,
        fileName,
        mimeType: COUNTDOWN_FRAME_MIME_TYPES.png,
      }
    );
  }

  if (
    decoded.width !== structuralReport.checks.width ||
    decoded.height !== structuralReport.checks.height
  ) {
    return invalidReport(
      "No pudimos leer el archivo. Probá exportándolo nuevamente.",
      {
        ...structuralReport.checks,
        fileName,
        mimeType: COUNTDOWN_FRAME_MIME_TYPES.png,
      }
    );
  }

  const warnings = structuralReport.warnings.filter(
    (warning) => !warning.toLowerCase().includes("transparencia")
  );
  const hasTransparency =
    structuralReport.checks.hasAlpha === true
      ? decoded.hasTransparency
      : false;
  if (hasTransparency === false) {
    warnings.push(
      "La imagen no tiene transparencia visible. Puede verse un fondo rectangular."
    );
  }

  return {
    ...structuralReport,
    warnings: Array.from(new Set(warnings)),
    type: "png",
    mimeType: COUNTDOWN_FRAME_MIME_TYPES.png,
    assetBase64: bytesToBase64(bytes),
    checks: {
      ...structuralReport.checks,
      fileName,
      mimeType: COUNTDOWN_FRAME_MIME_TYPES.png,
      decodedWidth: decoded.width,
      decodedHeight: decoded.height,
      hasTransparency,
    },
  };
}

export async function inspectFrameAssetFile(file) {
  if (!file) {
    return invalidReport("Seleccioná un archivo SVG o PNG.");
  }

  const fileName = String(file.name || "").trim();
  const mimeType = String(file.type || "").trim().toLowerCase();
  const extension = fileName.toLowerCase().split(".").pop();

  if (extension === "png") {
    return inspectPngFile(file);
  }

  if (extension !== "svg") {
    return invalidReport("El archivo no es un SVG o PNG válido.", {
      fileName,
      mimeType,
    });
  }
  if (mimeType && mimeType !== COUNTDOWN_FRAME_MIME_TYPES.svg) {
    return invalidReport("El archivo no es un SVG o PNG válido.", {
      fileName,
      mimeType,
    });
  }

  const report = await inspectSvgFile(file);
  return {
    ...report,
    type: "svg",
    mimeType: COUNTDOWN_FRAME_MIME_TYPES.svg,
    assetBase64: report.svgText
      ? svgTextToBase64(report.svgText)
      : null,
    checks: {
      ...(report.checks || {}),
      fileName,
      mimeType: COUNTDOWN_FRAME_MIME_TYPES.svg,
    },
  };
}

export function getFrameAssetPrimaryError(reportOrError) {
  const messages = Array.isArray(reportOrError?.criticalErrors)
    ? reportOrError.criticalErrors
    : [];
  const raw =
    messages[0] ||
    (typeof reportOrError?.message === "string"
      ? reportOrError.message
      : "");
  const normalized = String(raw || "").toLowerCase();

  if (normalized.includes("tamaño máximo") || normalized.includes("supera")) {
    return "La imagen supera el tamaño máximo permitido.";
  }
  if (
    normalized.includes("resolución demasiado baja") ||
    normalized.includes("resolution demasiado baja")
  ) {
    return "La imagen tiene una resolución demasiado baja.";
  }
  if (
    normalized.includes("script") ||
    normalized.includes("foreignobject") ||
    normalized.includes("eventos inline") ||
    normalized.includes("enlaces externos")
  ) {
    return "El SVG contiene elementos no permitidos.";
  }
  if (
    normalized.includes("leer") ||
    normalized.includes("parsear") ||
    normalized.includes("estructura xml")
  ) {
    return "No pudimos leer el archivo. Probá exportándolo nuevamente.";
  }
  return "El archivo no es un SVG o PNG válido.";
}
