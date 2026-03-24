import { JSDOM } from "jsdom";
import sharp from "sharp";
import {
  DECOR_CATALOG_MAX_UPLOAD_BYTES_HARD,
  DECOR_CATALOG_MAX_UPLOAD_BYTES_WARN,
} from "./config";
import type {
  DecorValidationIssue,
  DecorValidationReport,
} from "./types";

export type DecorInspectionResult = {
  validation: DecorValidationReport;
  normalizedBuffer: Buffer;
  normalizedContentType: string | null;
  format: string | null;
  width: number | null;
  height: number | null;
  hasAlpha: boolean | null;
  isVector: boolean;
};

function issue(
  severity: "error" | "warning",
  code: string,
  message: string
): DecorValidationIssue {
  return { severity, code, message };
}

function normalizeFormat(value: string | null): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "jpeg") return "jpg";
  return normalized;
}

function parseViewBox(value: string | null): {
  width: number;
  height: number;
} | null {
  if (!value) return null;
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map((token) => Number(token))
    .filter((token) => Number.isFinite(token));
  if (parts.length !== 4) return null;
  const width = parts[2];
  const height = parts[3];
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

function computeStatus(params: {
  errors: DecorValidationIssue[];
  warnings: DecorValidationIssue[];
}): "passed" | "warning" | "rejected" {
  if (params.errors.length > 0) return "rejected";
  if (params.warnings.length > 0) return "warning";
  return "passed";
}

function inferFormatFromFileName(fileName: string): string | null {
  const ext = fileName.toLowerCase().split(".").pop() || "";
  if (!ext) return null;
  if (ext === "jpeg") return "jpg";
  return ext;
}

export async function inspectDecorAsset(params: {
  buffer: Buffer;
  fileName: string;
  contentType: string | null;
  formatHint?: string | null;
}): Promise<DecorInspectionResult> {
  const fileName = String(params.fileName || "").trim() || "asset";
  const contentType = String(params.contentType || "").trim() || null;
  const bytes = Number(params.buffer.byteLength || 0);
  const errors: DecorValidationIssue[] = [];
  const warnings: DecorValidationIssue[] = [];
  const normalizationApplied: string[] = [];

  if (bytes <= 0) {
    errors.push(issue("error", "DECOR_EMPTY_FILE", "El archivo esta vacio."));
  }

  if (bytes > DECOR_CATALOG_MAX_UPLOAD_BYTES_HARD) {
    errors.push(
      issue(
        "error",
        "DECOR_FILE_TOO_LARGE_HARD",
        `El archivo supera ${DECOR_CATALOG_MAX_UPLOAD_BYTES_HARD} bytes.`
      )
    );
  } else if (bytes > DECOR_CATALOG_MAX_UPLOAD_BYTES_WARN) {
    warnings.push(
      issue(
        "warning",
        "DECOR_FILE_TOO_LARGE_WARN",
        `El archivo supera ${DECOR_CATALOG_MAX_UPLOAD_BYTES_WARN} bytes.`
      )
    );
  }

  const formatHint = normalizeFormat(params.formatHint || inferFormatFromFileName(fileName));
  const mimeFormat = normalizeFormat(contentType?.replace(/^image\//, "") || null);
  const format = formatHint || mimeFormat;
  const isSvg = format === "svg" || contentType === "image/svg+xml";

  if (isSvg) {
    let dom: JSDOM;
    try {
      const sourceText = params.buffer.toString("utf8");
      dom = new JSDOM(sourceText, { contentType: "image/svg+xml" });
      const document = dom.window.document;
      const root = document.documentElement;
      if (!root || root.tagName.toLowerCase() !== "svg") {
        errors.push(issue("error", "DECOR_SVG_INVALID_ROOT", "El SVG no tiene nodo raiz valido."));
      }

      if (document.querySelector("script")) {
        errors.push(issue("error", "DECOR_SVG_SCRIPT_NOT_ALLOWED", "El SVG contiene <script>."));
      }
      if (document.querySelector("foreignObject")) {
        errors.push(
          issue("error", "DECOR_SVG_FOREIGN_OBJECT_NOT_ALLOWED", "El SVG contiene <foreignObject>."))
      }

      const viewBox = parseViewBox(root?.getAttribute("viewBox") || null);
      if (!viewBox) {
        warnings.push(issue("warning", "DECOR_SVG_MISSING_VIEWBOX", "El SVG no tiene viewBox valido."));
      }

      const normalizedSvgText = root?.outerHTML || sourceText;
      const hasAlpha = /(?:opacity|fill-opacity|stroke-opacity|rgba\()/i.test(normalizedSvgText);

      const validation: DecorValidationReport = {
        status: computeStatus({ errors, warnings }),
        errors,
        warnings,
        checks: {
          fileName,
          mimeType: contentType || "image/svg+xml",
          bytes,
          format: "svg",
          width: viewBox?.width || null,
          height: viewBox?.height || null,
          hasAlpha,
          isVector: true,
          normalizationApplied,
        },
      };

      const normalizedBuffer = Buffer.from(normalizedSvgText, "utf8");
      return {
        validation,
        normalizedBuffer,
        normalizedContentType: "image/svg+xml",
        format: "svg",
        width: viewBox?.width || null,
        height: viewBox?.height || null,
        hasAlpha,
        isVector: true,
      };
    } catch {
      errors.push(issue("error", "DECOR_SVG_PARSE_ERROR", "No se pudo parsear el SVG."));
      const validation: DecorValidationReport = {
        status: computeStatus({ errors, warnings }),
        errors,
        warnings,
        checks: {
          fileName,
          mimeType: contentType || "image/svg+xml",
          bytes,
          format: "svg",
          width: null,
          height: null,
          hasAlpha: null,
          isVector: true,
          normalizationApplied,
        },
      };

      return {
        validation,
        normalizedBuffer: params.buffer,
        normalizedContentType: "image/svg+xml",
        format: "svg",
        width: null,
        height: null,
        hasAlpha: null,
        isVector: true,
      };
    }
  }

  try {
    const image = sharp(params.buffer, { animated: false, failOnError: false });
    const meta = await image.metadata();
    const width = Number(meta.width || 0);
    const height = Number(meta.height || 0);
    const hasAlpha = typeof meta.hasAlpha === "boolean" ? meta.hasAlpha : null;
    const format = normalizeFormat(meta.format || formatHint || mimeFormat);

    if (!format || !["png", "webp", "jpg", "jpeg", "svg"].includes(format)) {
      errors.push(
        issue(
          "error",
          "DECOR_FORMAT_NOT_ALLOWED",
          "Formato no permitido. Usa PNG, WEBP, JPG o SVG."
        )
      );
    }

    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      errors.push(
        issue("error", "DECOR_DIMENSIONS_INVALID", "No se pudieron detectar dimensiones validas.")
      );
    }

    const validation: DecorValidationReport = {
      status: computeStatus({ errors, warnings }),
      errors,
      warnings,
      checks: {
        fileName,
        mimeType: contentType,
        bytes,
        format,
        width: width > 0 ? width : null,
        height: height > 0 ? height : null,
        hasAlpha,
        isVector: false,
        normalizationApplied,
      },
    };

    return {
      validation,
      normalizedBuffer: params.buffer,
      normalizedContentType: contentType,
      format,
      width: width > 0 ? width : null,
      height: height > 0 ? height : null,
      hasAlpha,
      isVector: false,
    };
  } catch {
    errors.push(
      issue(
        "error",
        "DECOR_IMAGE_PARSE_ERROR",
        "No se pudo leer la imagen. Verifica formato o integridad del archivo."
      )
    );

    const validation: DecorValidationReport = {
      status: computeStatus({ errors, warnings }),
      errors,
      warnings,
      checks: {
        fileName,
        mimeType: contentType,
        bytes,
        format: formatHint,
        width: null,
        height: null,
        hasAlpha: null,
        isVector: false,
        normalizationApplied,
      },
    };

    return {
      validation,
      normalizedBuffer: params.buffer,
      normalizedContentType: contentType,
      format: formatHint,
      width: null,
      height: null,
      hasAlpha: null,
      isVector: false,
    };
  }
}
