import sharp from "sharp";

// Shared CJS is the cross-runtime authority copied into Functions at build time.
/* eslint-disable @typescript-eslint/no-var-requires -- contrato CJS compartido con frontend y scripts */
const {
  COUNTDOWN_FRAME_ASSET_LIMITS,
  COUNTDOWN_FRAME_MIME_TYPES,
  inspectCountdownPngBytes,
} = require("../../shared/countdownFrameAssetContract.cjs") as {
  COUNTDOWN_FRAME_ASSET_LIMITS: {
    pngMaxBytes: number;
    pngMinDimension: number;
    pngRecommendedDimension: number;
    pngMaxDimension: number;
    pngMaxPixels: number;
    pngMaxAspectRatio: number;
  };
  COUNTDOWN_FRAME_MIME_TYPES: {
    png: "image/png";
  };
  inspectCountdownPngBytes: (buffer: Buffer) => {
    valid: boolean;
    warnings: string[];
    criticalErrors: string[];
    checks: Record<string, unknown> & {
      width?: number | null;
      height?: number | null;
      hasAlpha?: boolean | null;
      hasTransparency?: boolean | null;
    };
  };
};
/* eslint-enable @typescript-eslint/no-var-requires */

export type CountdownPngInspection = {
  valid: true;
  warnings: string[];
  criticalErrors: [];
  checks: {
    fileName: string;
    mimeType: "image/png";
    bytes: number;
    width: number;
    height: number;
    hasAlpha: boolean;
    hasTransparency: boolean;
    format: "png";
  };
};

function fail(message: string): never {
  throw new Error(message);
}

export async function inspectCountdownPngBuffer(
  buffer: Buffer,
  fileName: string,
  declaredMimeType: string
): Promise<CountdownPngInspection> {
  const safeName = String(fileName || "").trim();
  const safeMime = String(declaredMimeType || "").trim().toLowerCase();
  if (!safeName.toLowerCase().endsWith(".png")) {
    fail("El archivo no es un SVG o PNG válido.");
  }
  if (safeMime !== COUNTDOWN_FRAME_MIME_TYPES.png) {
    fail("El archivo no es un SVG o PNG válido.");
  }
  if (!Buffer.isBuffer(buffer) || buffer.byteLength === 0) {
    fail("No pudimos leer el archivo. Probá exportándolo nuevamente.");
  }
  if (buffer.byteLength > COUNTDOWN_FRAME_ASSET_LIMITS.pngMaxBytes) {
    fail("La imagen supera el tamaño máximo permitido.");
  }

  const structural = inspectCountdownPngBytes(buffer);
  if (!structural.valid) {
    fail(
      structural.criticalErrors[0] ||
        "No pudimos leer el archivo. Probá exportándolo nuevamente."
    );
  }

  let metadata: sharp.Metadata;
  let stats: sharp.Stats;
  try {
    const image = sharp(buffer, {
      failOn: "error",
      limitInputPixels: COUNTDOWN_FRAME_ASSET_LIMITS.pngMaxPixels,
    });
    [metadata, stats] = await Promise.all([
      image.metadata(),
      image.clone().ensureAlpha().stats(),
    ]);
  } catch {
    fail("No pudimos leer el archivo. Probá exportándolo nuevamente.");
  }

  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (
    metadata.format !== "png" ||
    width <= 0 ||
    height <= 0 ||
    width !== Number(structural.checks.width || 0) ||
    height !== Number(structural.checks.height || 0)
  ) {
    fail("El archivo no es un SVG o PNG válido.");
  }
  if (Number(metadata.pages || 1) > 1) {
    fail("El PNG debe ser una imagen estática.");
  }

  const minDimension = Math.min(width, height);
  const maxDimension = Math.max(width, height);
  if (minDimension < COUNTDOWN_FRAME_ASSET_LIMITS.pngMinDimension) {
    fail("La imagen tiene una resolución demasiado baja.");
  }
  if (
    maxDimension > COUNTDOWN_FRAME_ASSET_LIMITS.pngMaxDimension ||
    width * height > COUNTDOWN_FRAME_ASSET_LIMITS.pngMaxPixels
  ) {
    fail("La imagen tiene dimensiones demasiado grandes.");
  }
  if (
    maxDimension / minDimension >
    COUNTDOWN_FRAME_ASSET_LIMITS.pngMaxAspectRatio
  ) {
    fail("La proporción de la imagen es demasiado extrema.");
  }

  const hasAlpha = metadata.hasAlpha === true;
  const alphaChannel = stats.channels[3];
  const hasTransparency =
    hasAlpha &&
    Number.isFinite(alphaChannel?.min) &&
    Number(alphaChannel.min) < 255;
  const warnings = structural.warnings.filter(
    (warning: string) => !warning.toLowerCase().includes("transparencia")
  );
  if (!hasTransparency) {
    warnings.push(
      "La imagen no tiene transparencia visible. Puede verse un fondo rectangular."
    );
  }

  return {
    valid: true,
    warnings: Array.from(new Set(warnings)),
    criticalErrors: [],
    checks: {
      fileName: safeName,
      mimeType: COUNTDOWN_FRAME_MIME_TYPES.png,
      bytes: buffer.byteLength,
      width,
      height,
      hasAlpha,
      hasTransparency,
      format: "png",
    },
  };
}
