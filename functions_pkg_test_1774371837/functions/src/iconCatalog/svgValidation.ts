import { JSDOM } from "jsdom";
import {
  ICON_CATALOG_MAX_SVG_BYTES_HARD,
  ICON_CATALOG_MAX_SVG_BYTES_WARN,
} from "./config";
import type {
  IconValidationChecks,
  IconValidationIssue,
  IconValidationReport,
} from "./types";

type ValidateSvgInput = {
  svgText: string;
  fileName: string;
  bytes: number;
  normalizeSafe: boolean;
  normalizeCurrentColor: boolean;
};

const UNSAFE_HREF = /^(https?:|\/\/|javascript:)/i;
const BLOCKED_PAINT_VALUES = new Set([
  "",
  "none",
  "currentcolor",
  "transparent",
  "inherit",
  "initial",
  "unset",
  "context-fill",
  "context-stroke",
]);

type StyleEntry = [property: string, value: string];

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
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map((token) => Number(token))
    .filter((token) => Number.isFinite(token));
  if (parts.length !== 4) return null;
  const width = parts[2];
  const height = parts[3];
  if (width <= 0 || height <= 0) return null;
  return { raw: value, width, height };
}

function isConvertiblePaint(value: string): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  if (BLOCKED_PAINT_VALUES.has(normalized)) return false;
  if (normalized.includes("url(")) return false;
  return true;
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
      if (!property) return null;
      return [property, value] as StyleEntry;
    })
    .filter((entry): entry is StyleEntry => Boolean(entry));
}

function serializeStyle(entries: StyleEntry[]): string {
  return entries.map(([property, value]) => `${property}:${value}`).join(";");
}

function collectDistinctPaints(document: Document): Set<string> {
  const paints = new Set<string>();
  const allElements = Array.from(document.querySelectorAll("*"));
  for (const element of allElements) {
    const fill = element.getAttribute("fill");
    const stroke = element.getAttribute("stroke");
    if (fill && isConvertiblePaint(fill)) paints.add(fill.trim().toLowerCase());
    if (stroke && isConvertiblePaint(stroke)) paints.add(stroke.trim().toLowerCase());
    const style = element.getAttribute("style");
    if (!style) continue;
    for (const [property, value] of parseStyle(style)) {
      if ((property === "fill" || property === "stroke") && isConvertiblePaint(value)) {
        paints.add(value.trim().toLowerCase());
      }
    }
  }
  return paints;
}

function applySafeNormalization(params: {
  document: Document;
  normalizeCurrentColor: boolean;
  warnings: IconValidationIssue[];
  normalizationApplied: string[];
}): void {
  const { document, normalizeCurrentColor, warnings, normalizationApplied } = params;
  const root = document.documentElement;

  const hadWidth = root.hasAttribute("width");
  const hadHeight = root.hasAttribute("height");
  if (hadWidth || hadHeight) {
    root.removeAttribute("width");
    root.removeAttribute("height");
    normalizationApplied.push("remove-fixed-dimensions");
  }

  if (!normalizeCurrentColor) return;

  const distinctPaints = collectDistinctPaints(document);
  if (distinctPaints.size > 1) {
    warnings.push(
      issue(
        "warning",
        "ICON_SVG_MULTICOLOR_SKIP_CURRENTCOLOR",
        "El SVG tiene multiples colores. Se omite conversion automatica a currentColor por seguridad."
      )
    );
    return;
  }

  let changed = 0;
  const allElements = [root, ...Array.from(document.querySelectorAll("*"))];
  for (const element of allElements) {
    const fill = element.getAttribute("fill");
    if (fill && isConvertiblePaint(fill)) {
      element.setAttribute("fill", "currentColor");
      changed += 1;
    }

    const stroke = element.getAttribute("stroke");
    if (stroke && isConvertiblePaint(stroke)) {
      element.setAttribute("stroke", "currentColor");
      changed += 1;
    }

    const style = element.getAttribute("style");
    if (!style) continue;
    const styleEntries = parseStyle(style);
    let localChanges = 0;
    const nextStyleEntries: StyleEntry[] = styleEntries.map(([property, value]) => {
      if ((property === "fill" || property === "stroke") && isConvertiblePaint(value)) {
        localChanges += 1;
        return [property, "currentColor"];
      }
      return [property, value];
    });
    if (localChanges > 0) {
      element.setAttribute("style", serializeStyle(nextStyleEntries));
      changed += localChanges;
    }
  }

  if (changed > 0) {
    normalizationApplied.push("convert-currentcolor-safe");
  }
}

export function inspectAndNormalizeSvg(input: ValidateSvgInput): IconValidationReport {
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
      checks: {
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
      },
      normalizedSvgText: null,
      normalizedBytes: null,
    };
  }

  const document = dom.window.document;
  const root = document.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg") {
    errors.push(
      issue("error", "ICON_SVG_MISSING_ROOT", "El archivo no contiene un nodo SVG valido.")
    );
  }

  const parserErrorNode = document.querySelector("parsererror");
  if (parserErrorNode) {
    errors.push(
      issue("error", "ICON_SVG_INVALID_XML", "El SVG contiene errores de estructura XML.")
    );
  }

  const viewBoxRaw = root?.getAttribute("viewBox") || null;
  const viewBox = parseViewBox(viewBoxRaw);
  if (!viewBox) {
    errors.push(
      issue("error", "ICON_SVG_MISSING_VIEWBOX", "El SVG debe incluir un viewBox valido.")
    );
  }

  const hasFixedDimensions = Boolean(
    root?.hasAttribute("width") || root?.hasAttribute("height")
  );
  if (hasFixedDimensions) {
    warnings.push(
      issue(
        "warning",
        "ICON_SVG_FIXED_DIMENSIONS",
        "El SVG tiene width/height fijos. Se recomienda usar solo viewBox."
      )
    );
  }

  const isSquare = viewBox ? Math.abs(viewBox.width - viewBox.height) <= 0.01 : null;
  if (viewBox && !isSquare) {
    warnings.push(
      issue(
        "warning",
        "ICON_SVG_NON_SQUARE_VIEWBOX",
        "El viewBox no es cuadrado."
      )
    );
  }

  if (document.querySelector("script")) {
    errors.push(
      issue("error", "ICON_SVG_SCRIPT_NOT_ALLOWED", "El SVG contiene <script>.")
    );
  }
  if (document.querySelector("foreignObject")) {
    errors.push(
      issue(
        "error",
        "ICON_SVG_FOREIGN_OBJECT_NOT_ALLOWED",
        "El SVG contiene <foreignObject>."
      )
    );
  }
  if (document.querySelector("text") || document.querySelector("tspan")) {
    errors.push(
      issue(
        "error",
        "ICON_SVG_TEXT_NOT_ALLOWED",
        "El SVG contiene nodos de texto no permitidos."
      )
    );
  }

  let hasInlineHandlers = false;
  let hasUnsafeHref = false;
  const allElements = Array.from(document.querySelectorAll("*"));
  for (const element of allElements) {
    for (const attribute of Array.from(element.attributes || [])) {
      const attrName = String(attribute.name || "").toLowerCase();
      const attrValue = String(attribute.value || "").trim();
      if (attrName.startsWith("on")) {
        hasInlineHandlers = true;
      }
      if ((attrName === "href" || attrName === "xlink:href") && UNSAFE_HREF.test(attrValue)) {
        hasUnsafeHref = true;
      }
    }
  }

  if (hasInlineHandlers) {
    errors.push(
      issue(
        "error",
        "ICON_SVG_EVENT_HANDLER_NOT_ALLOWED",
        "El SVG contiene handlers inline on*."
      )
    );
  }
  if (hasUnsafeHref) {
    errors.push(
      issue(
        "error",
        "ICON_SVG_UNSAFE_HREF",
        "El SVG contiene enlaces externos inseguros."
      )
    );
  }

  const pathCount = document.querySelectorAll("path").length;
  const shapeNodeCount = document.querySelectorAll(
    "path,rect,circle,ellipse,line,polyline,polygon,use,g"
  ).length;
  if (shapeNodeCount <= 0) {
    errors.push(
      issue(
        "error",
        "ICON_SVG_EMPTY_GRAPHICS",
        "El SVG no contiene nodos graficos utilizables."
      )
    );
  } else if (pathCount <= 0) {
    warnings.push(
      issue(
        "warning",
        "ICON_SVG_NO_PATH_NODES",
        "El SVG no contiene nodos path. Se evaluara como vector alternativo."
      )
    );
  }

  if (input.normalizeSafe && errors.length === 0) {
    applySafeNormalization({
      document,
      normalizeCurrentColor: input.normalizeCurrentColor,
      warnings,
      normalizationApplied,
    });
  }

  const normalizedSvgText = root?.outerHTML || null;
  const colorMode = /currentColor/i.test(normalizedSvgText || "")
    ? "currentColor"
    : "fixed";
  if (colorMode !== "currentColor") {
    warnings.push(
      issue(
        "warning",
        "ICON_SVG_NO_CURRENTCOLOR",
        "El SVG no usa currentColor y puede no recolorizarse en el editor."
      )
    );
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
    shapeNodeCount,
    colorMode,
    normalizationApplied,
  };

  const status =
    errors.length > 0 ? "rejected" : warnings.length > 0 ? "warning" : "passed";

  return {
    status,
    errors,
    warnings,
    checks,
    normalizedSvgText,
    normalizedBytes: normalizedSvgText
      ? Buffer.byteLength(normalizedSvgText, "utf8")
      : null,
  };
}

