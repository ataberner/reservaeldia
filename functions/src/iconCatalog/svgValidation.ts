import { createHash } from "crypto";
import { JSDOM } from "jsdom";
import sharp from "sharp";
import {
  ICON_CATALOG_MAX_SVG_BYTES_HARD,
  ICON_CATALOG_MAX_SVG_BYTES_WARN,
} from "./config";
import type {
  IconSvgRenderable,
  IconValidationChecks,
  IconValidationIssue,
  IconValidationReport,
} from "./types";

const {
  ICON_RENDER_CONTRACT_ID,
  ICON_RENDER_MAX_SVG_BYTES,
  ICON_RENDER_SCHEMA_VERSION,
} = require("../../shared/iconRenderableContract.cjs") as {
  ICON_RENDER_CONTRACT_ID: "icon_svg_snapshot_v1";
  ICON_RENDER_MAX_SVG_BYTES: number;
  ICON_RENDER_SCHEMA_VERSION: 1;
};

type ValidateSvgInput = {
  svgText: string;
  fileName: string;
  bytes: number;
  normalizeSafe: boolean;
  normalizeCurrentColor: boolean;
};

type StyleEntry = [property: string, value: string];

const ALLOWED_ELEMENTS = new Set([
  "svg",
  "g",
  "defs",
  "symbol",
  "use",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "clippath",
  "mask",
  "lineargradient",
  "radialgradient",
  "stop",
  "title",
  "desc",
]);

const GEOMETRY_ELEMENTS = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "use",
]);

const COMMON_ATTRIBUTES = new Set([
  "id",
  "transform",
  "opacity",
  "fill",
  "fill-opacity",
  "fill-rule",
  "clip-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "vector-effect",
  "paint-order",
  "color",
  "display",
  "visibility",
  "clip-path",
  "mask",
  "style",
]);

const ELEMENT_ATTRIBUTES: Record<string, Set<string>> = {
  svg: new Set(["xmlns", "xmlns:xlink", "viewbox", "preserveaspectratio", "width", "height"]),
  symbol: new Set(["viewbox", "preserveaspectratio"]),
  use: new Set(["href", "xlink:href", "x", "y", "width", "height"]),
  path: new Set(["d", "pathlength"]),
  rect: new Set(["x", "y", "width", "height", "rx", "ry", "pathlength"]),
  circle: new Set(["cx", "cy", "r", "pathlength"]),
  ellipse: new Set(["cx", "cy", "rx", "ry", "pathlength"]),
  line: new Set(["x1", "y1", "x2", "y2", "pathlength"]),
  polyline: new Set(["points", "pathlength"]),
  polygon: new Set(["points", "pathlength"]),
  clippath: new Set(["clippathunits"]),
  mask: new Set(["x", "y", "width", "height", "maskunits", "maskcontentunits"]),
  lineargradient: new Set([
    "x1",
    "y1",
    "x2",
    "y2",
    "gradientunits",
    "gradienttransform",
    "spreadmethod",
    "href",
    "xlink:href",
  ]),
  radialgradient: new Set([
    "cx",
    "cy",
    "r",
    "fx",
    "fy",
    "fr",
    "gradientunits",
    "gradienttransform",
    "spreadmethod",
    "href",
    "xlink:href",
  ]),
  stop: new Set(["offset", "stop-color", "stop-opacity"]),
};

const STYLE_PROPERTIES = new Set([
  "opacity",
  "fill",
  "fill-opacity",
  "fill-rule",
  "clip-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "vector-effect",
  "paint-order",
  "color",
  "display",
  "visibility",
  "clip-path",
  "mask",
  "stop-color",
  "stop-opacity",
]);

const PAINT_ATTRIBUTES = new Set(["fill", "stroke", "color", "stop-color"]);
const LOCAL_URL_PATTERN = /^url\(\s*#[A-Za-z_][\w:.-]*\s*\)$/i;
const LOCAL_HREF_PATTERN = /^#[A-Za-z_][\w:.-]*$/;
const SAFE_ID_PATTERN = /^[A-Za-z_][\w:.-]*$/;
const SAFE_COLOR_FUNCTION_PATTERN = /^(?:rgb|rgba|hsl|hsla)\([0-9.,%+\-\s]+\)$/i;
const SAFE_COLOR_TOKEN_PATTERN = /^(?:#[0-9a-f]{3,8}|[a-z]+)$/i;
const BLOCKED_XML_PATTERN = /<!\s*(?:doctype|entity)\b/i;

function issue(
  severity: "error" | "warning",
  code: string,
  message: string
): IconValidationIssue {
  return { severity, code, message };
}

function parseViewBox(value: string | null): {
  raw: string;
  width: number;
  height: number;
} | null {
  if (!value) return null;
  const parts = value.trim().split(/[\s,]+/).map((token) => Number(token));
  if (parts.length !== 4 || parts.some((token) => !Number.isFinite(token))) return null;
  const width = parts[2];
  const height = parts[3];
  if (width <= 0 || height <= 0) return null;
  return { raw: parts.join(" "), width, height };
}

function parseStyle(styleText: string): StyleEntry[] {
  return String(styleText || "")
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator <= 0) return null;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration.slice(separator + 1).trim();
      if (!property || !value) return null;
      return [property, value] as StyleEntry;
    })
    .filter((entry): entry is StyleEntry => Boolean(entry));
}

function isSafePaint(value: string): boolean {
  const normalized = String(value || "").trim();
  const lowered = normalized.toLowerCase();
  if (lowered === "none" || lowered === "transparent" || lowered === "currentcolor") {
    return true;
  }
  if (LOCAL_URL_PATTERN.test(normalized)) return true;
  return SAFE_COLOR_TOKEN_PATTERN.test(normalized) || SAFE_COLOR_FUNCTION_PATTERN.test(normalized);
}

function isSafeTransform(value: string): boolean {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  const transformPattern = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;
  let match: RegExpExecArray | null;
  let consumed = "";
  while ((match = transformPattern.exec(normalized))) {
    consumed += match[0];
    const values = match[2]
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean);
    if (!values.length || values.some((entry) => !Number.isFinite(Number(entry)))) {
      return false;
    }
  }
  return consumed.replace(/[\s,]+/g, "") === normalized.replace(/[\s,]+/g, "");
}

function collectLocalReference(value: string): string | null {
  const href = String(value || "").trim();
  if (LOCAL_HREF_PATTERN.test(href)) return href.slice(1);
  const urlMatch = href.match(/^url\(\s*#([A-Za-z_][\w:.-]*)\s*\)$/i);
  return urlMatch ? urlMatch[1] : null;
}

function isConvertiblePaint(value: string): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "none" || normalized === "transparent") return false;
  if (normalized === "currentcolor" || normalized.startsWith("url(")) return false;
  return isSafePaint(normalized);
}

function collectDistinctPaints(document: Document): Set<string> {
  const paints = new Set<string>();
  for (const element of Array.from(document.querySelectorAll("*"))) {
    for (const attributeName of ["fill", "stroke"]) {
      const value = element.getAttribute(attributeName);
      if (value && isConvertiblePaint(value)) paints.add(value.trim().toLowerCase());
    }
  }
  return paints;
}

function documentHasCurrentColorPaint(document: Document): boolean {
  for (const element of Array.from(document.querySelectorAll("*"))) {
    for (const attributeName of PAINT_ATTRIBUTES) {
      if (String(element.getAttribute(attributeName) || "").trim().toLowerCase() === "currentcolor") {
        return true;
      }
    }
  }
  return false;
}

function applyCurrentColorNormalization(params: {
  document: Document;
  warnings: IconValidationIssue[];
  normalizationApplied: string[];
}): void {
  const distinctPaints = collectDistinctPaints(params.document);
  const hasExistingCurrentColor = documentHasCurrentColorPaint(params.document);
  if (
    distinctPaints.size > 1 ||
    (hasExistingCurrentColor && distinctPaints.size > 0)
  ) {
    params.warnings.push(
      issue(
        "warning",
        "ICON_SVG_MULTICOLOR_SKIP_CURRENTCOLOR",
        "El SVG tiene multiples colores. Se conservan para no destruir su composicion original."
      )
    );
    return;
  }

  let changed = 0;
  for (const element of Array.from(params.document.querySelectorAll("*"))) {
    for (const attributeName of ["fill", "stroke"]) {
      const value = element.getAttribute(attributeName);
      if (!value || !isConvertiblePaint(value)) continue;
      element.setAttribute(attributeName, "currentColor");
      changed += 1;
    }
  }
  if (changed > 0) params.normalizationApplied.push("convert-currentcolor-safe");
}

function sanitizeSvgDocument(params: {
  document: Document;
  errors: IconValidationIssue[];
  normalizationApplied: string[];
}): { geometryCount: number } {
  const { document, errors, normalizationApplied } = params;
  const ids = new Set<string>();
  const references = new Set<string>();
  let geometryCount = 0;
  let styleAttributesNormalized = 0;

  for (const element of Array.from(document.querySelectorAll("*"))) {
    const tagName = element.tagName.toLowerCase();
    if (!ALLOWED_ELEMENTS.has(tagName)) {
      errors.push(
        issue(
          "error",
          "ICON_SVG_UNSUPPORTED_ELEMENT",
          `El SVG contiene <${element.tagName}>, una construccion no soportada por el contrato de iconos.`
        )
      );
      continue;
    }

    if (GEOMETRY_ELEMENTS.has(tagName)) geometryCount += 1;

    const style = element.getAttribute("style");
    if (style) {
      const entries = parseStyle(style);
      if (!entries.length || entries.some(([property]) => !STYLE_PROPERTIES.has(property))) {
        errors.push(
          issue(
            "error",
            "ICON_SVG_UNSUPPORTED_STYLE",
            "El SVG usa estilos que no pueden normalizarse de forma segura."
          )
        );
      } else {
        for (const [property, value] of entries) {
          element.setAttribute(property, value);
        }
        element.removeAttribute("style");
        styleAttributesNormalized += 1;
      }
    }

    for (const attribute of Array.from(element.attributes || [])) {
      const originalName = String(attribute.name || "");
      const name = originalName.toLowerCase();
      const value = String(attribute.value || "").trim();
      const allowedForElement = ELEMENT_ATTRIBUTES[tagName] || new Set<string>();

      if (name.startsWith("on")) {
        errors.push(
          issue(
            "error",
            "ICON_SVG_EVENT_HANDLER_NOT_ALLOWED",
            "El SVG contiene handlers inline on*."
          )
        );
        continue;
      }

      if (!COMMON_ATTRIBUTES.has(name) && !allowedForElement.has(name)) {
        errors.push(
          issue(
            "error",
            "ICON_SVG_UNSUPPORTED_ATTRIBUTE",
            `El atributo ${originalName} de <${element.tagName}> no pertenece al contrato soportado.`
          )
        );
        continue;
      }

      if (name === "id") {
        if (!SAFE_ID_PATTERN.test(value) || ids.has(value)) {
          errors.push(
            issue(
              "error",
              "ICON_SVG_INVALID_ID",
              "El SVG contiene un id invalido o duplicado."
            )
          );
        } else {
          ids.add(value);
        }
      }

      if (name === "href" || name === "xlink:href") {
        if (!LOCAL_HREF_PATTERN.test(value)) {
          errors.push(
            issue(
              "error",
              "ICON_SVG_UNSAFE_HREF",
              "Las referencias SVG deben apuntar a un id local del mismo archivo."
            )
          );
        } else {
          references.add(value.slice(1));
        }
      }

      if (name === "transform" || name === "gradienttransform") {
        if (!isSafeTransform(value)) {
          errors.push(
            issue(
              "error",
              "ICON_SVG_INVALID_TRANSFORM",
              "El SVG contiene un transform que no puede normalizarse de forma determinista."
            )
          );
        }
      }

      if (PAINT_ATTRIBUTES.has(name) && !isSafePaint(value)) {
        errors.push(
          issue(
            "error",
            "ICON_SVG_UNSUPPORTED_PAINT",
            "El SVG usa una pintura o referencia de color no soportada."
          )
        );
      }

      if (value.toLowerCase().includes("url(")) {
        const localReference = collectLocalReference(value);
        if (!localReference) {
          errors.push(
            issue(
              "error",
              "ICON_SVG_EXTERNAL_REFERENCE_NOT_ALLOWED",
              "El SVG contiene una referencia url() externa o no soportada."
            )
          );
        } else {
          references.add(localReference);
        }
      }
    }
  }

  for (const reference of references) {
    if (!ids.has(reference)) {
      errors.push(
        issue(
          "error",
          "ICON_SVG_UNRESOLVED_REFERENCE",
          `El SVG referencia #${reference}, pero ese id no existe en el archivo.`
        )
      );
    }
  }

  if (styleAttributesNormalized > 0) {
    normalizationApplied.push("inline-supported-styles");
  }

  return { geometryCount };
}

async function hasVisiblePixels(svgText: string): Promise<boolean> {
  const { data, info } = await sharp(Buffer.from(svgText, "utf8"), {
    density: 144,
    failOn: "error",
  })
    .resize(128, 128, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  for (let index = 3; index < data.length; index += channels) {
    if (data[index] > 0) return true;
  }
  return false;
}

function emptyChecks(fileName: string | null, bytes: number): IconValidationChecks {
  return {
    fileName,
    mimeType: "image/svg+xml",
    bytes,
    hasViewBox: false,
    viewBox: null,
    viewBoxWidth: null,
    viewBoxHeight: null,
    isSquare: null,
    hasFixedDimensions: false,
    hasPath: false,
    shapeNodeCount: 0,
    colorMode: "fixed",
    normalizationApplied: [],
  };
}

export async function inspectAndNormalizeSvg(
  input: ValidateSvgInput
): Promise<IconValidationReport> {
  const errors: IconValidationIssue[] = [];
  const warnings: IconValidationIssue[] = [];
  const normalizationApplied: string[] = [];
  const fileName = String(input.fileName || "").trim() || null;
  const bytes = Number(input.bytes || 0);

  if (bytes > ICON_CATALOG_MAX_SVG_BYTES_HARD) {
    errors.push(
      issue(
        "error",
        "ICON_SVG_FILE_TOO_LARGE_HARD",
        `El SVG supera el limite de ${ICON_CATALOG_MAX_SVG_BYTES_HARD} bytes.`
      )
    );
  } else if (bytes > ICON_CATALOG_MAX_SVG_BYTES_WARN) {
    warnings.push(
      issue(
        "warning",
        "ICON_SVG_FILE_TOO_LARGE_WARN",
        `El SVG supera ${ICON_CATALOG_MAX_SVG_BYTES_WARN} bytes y puede impactar rendimiento movil.`
      )
    );
  }

  if (BLOCKED_XML_PATTERN.test(input.svgText)) {
    errors.push(
      issue(
        "error",
        "ICON_SVG_XML_DECLARATION_NOT_ALLOWED",
        "El SVG contiene DOCTYPE o ENTITY, construcciones no permitidas."
      )
    );
  }

  let dom: JSDOM;
  try {
    dom = new JSDOM(input.svgText, { contentType: "image/svg+xml" });
  } catch {
    return {
      status: "rejected",
      errors: [
        ...errors,
        issue("error", "ICON_SVG_INVALID_XML", "No se pudo parsear el SVG."),
      ],
      warnings,
      checks: emptyChecks(fileName, bytes),
      normalizedSvgText: null,
      normalizedBytes: null,
      renderable: null,
    };
  }

  const document = dom.window.document;
  const root = document.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg") {
    errors.push(
      issue("error", "ICON_SVG_MISSING_ROOT", "El archivo no contiene un nodo SVG valido.")
    );
  }
  if (document.querySelector("parsererror")) {
    errors.push(
      issue("error", "ICON_SVG_INVALID_XML", "El SVG contiene errores de estructura XML.")
    );
  }

  const viewBox = parseViewBox(root?.getAttribute("viewBox") || null);
  if (!viewBox) {
    errors.push(
      issue("error", "ICON_SVG_MISSING_VIEWBOX", "El SVG debe incluir un viewBox valido.")
    );
  } else {
    root.setAttribute("viewBox", viewBox.raw);
  }

  const hasFixedDimensions = Boolean(root?.hasAttribute("width") || root?.hasAttribute("height"));
  if (hasFixedDimensions) {
    warnings.push(
      issue(
        "warning",
        "ICON_SVG_FIXED_DIMENSIONS",
        "El SVG tenia width/height fijos; el backend los retiro y conserva el viewBox."
      )
    );
    if (input.normalizeSafe) {
      root.removeAttribute("width");
      root.removeAttribute("height");
      normalizationApplied.push("remove-fixed-dimensions");
    }
  }

  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!root.hasAttribute("preserveAspectRatio")) {
    root.setAttribute("preserveAspectRatio", "xMidYMid meet");
    normalizationApplied.push("default-preserve-aspect-ratio");
  }

  const isSquare = viewBox ? Math.abs(viewBox.width - viewBox.height) <= 0.01 : null;
  if (viewBox && !isSquare) {
    warnings.push(
      issue("warning", "ICON_SVG_NON_SQUARE_VIEWBOX", "El viewBox no es cuadrado; se preservara su proporcion.")
    );
  }

  const { geometryCount } = sanitizeSvgDocument({
    document,
    errors,
    normalizationApplied,
  });
  const pathCount = document.querySelectorAll("path").length;
  if (geometryCount <= 0) {
    errors.push(
      issue("error", "ICON_SVG_EMPTY_GRAPHICS", "El SVG no contiene geometria utilizable.")
    );
  } else if (pathCount <= 0) {
    warnings.push(
      issue(
        "warning",
        "ICON_SVG_NO_PATH_NODES",
        "El SVG usa shapes o referencias en lugar de path; la composicion canonica los preserva."
      )
    );
  }

  if (input.normalizeCurrentColor && errors.length === 0) {
    applyCurrentColorNormalization({ document, warnings, normalizationApplied });
  }

  const normalizedSvgText = root?.outerHTML || null;
  const normalizedBytes = normalizedSvgText
    ? Buffer.byteLength(normalizedSvgText, "utf8")
    : null;
  if (normalizedBytes && normalizedBytes > ICON_RENDER_MAX_SVG_BYTES) {
    errors.push(
      issue(
        "error",
        "ICON_SVG_CANONICAL_TOO_LARGE",
        `La representacion renderizable supera el limite de ${ICON_RENDER_MAX_SVG_BYTES} bytes.`
      )
    );
  }

  const colorMode = documentHasCurrentColorPaint(document)
    ? "currentColor"
    : "fixed";
  if (colorMode === "fixed") {
    warnings.push(
      issue(
        "warning",
        "ICON_SVG_FIXED_COLOR",
        "El SVG conserva colores propios y no se recoloreara globalmente en el editor."
      )
    );
  }

  if (normalizedSvgText && errors.length === 0) {
    try {
      if (!(await hasVisiblePixels(normalizedSvgText))) {
        errors.push(
          issue(
            "error",
            "ICON_SVG_EMPTY_RENDER",
            "El SVG no produce pixeles visibles despues de normalizarse."
          )
        );
      }
    } catch {
      errors.push(
        issue(
          "error",
          "ICON_SVG_RENDER_FAILED",
          "El motor canonico no pudo renderizar el SVG de forma confiable."
        )
      );
    }
  }

  const checks: IconValidationChecks = {
    fileName,
    mimeType: "image/svg+xml",
    bytes,
    hasViewBox: Boolean(viewBox),
    viewBox: viewBox?.raw || null,
    viewBoxWidth: viewBox?.width || null,
    viewBoxHeight: viewBox?.height || null,
    isSquare,
    hasFixedDimensions,
    hasPath: pathCount > 0,
    shapeNodeCount: geometryCount,
    colorMode,
    normalizationApplied,
  };

  let renderable: IconSvgRenderable | null = null;
  if (normalizedSvgText && normalizedBytes && viewBox && geometryCount > 0 && errors.length === 0) {
    renderable = {
      schemaVersion: ICON_RENDER_SCHEMA_VERSION,
      contractId: ICON_RENDER_CONTRACT_ID,
      mediaType: "image/svg+xml",
      svgText: normalizedSvgText,
      viewBox: viewBox.raw,
      viewBoxWidth: viewBox.width,
      viewBoxHeight: viewBox.height,
      colorMode,
      geometryCount,
      bytes: normalizedBytes,
      hashSha256: createHash("sha256").update(normalizedSvgText).digest("hex"),
    };
  }

  return {
    status: errors.length > 0 ? "rejected" : warnings.length > 0 ? "warning" : "passed",
    errors,
    warnings,
    checks,
    normalizedSvgText,
    normalizedBytes,
    renderable,
  };
}
