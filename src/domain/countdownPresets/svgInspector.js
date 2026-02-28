import { COUNTDOWN_SVG_COLOR_MODES } from "@/domain/countdownPresets/contract";

function parseViewBox(viewBox) {
  if (!viewBox || typeof viewBox !== "string") return null;
  const values = viewBox
    .trim()
    .split(/[,\s]+/)
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part));

  if (values.length !== 4) return null;
  const [, , width, height] = values;
  if (width <= 0 || height <= 0) return null;
  return { raw: viewBox, width, height };
}

function isConvertiblePaint(value) {
  const safe = String(value || "").trim().toLowerCase();
  if (!safe) return false;

  const blockedValues = new Set([
    "none",
    "currentcolor",
    "transparent",
    "inherit",
    "initial",
    "unset",
    "context-fill",
    "context-stroke",
  ]);
  if (blockedValues.has(safe)) return false;
  if (safe.includes("url(")) return false;
  return true;
}

function parseStyleMap(styleText) {
  const map = new Map();
  String(styleText || "")
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .forEach((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator <= 0) return;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration.slice(separator + 1).trim();
      if (!property) return;
      map.set(property, value);
    });
  return map;
}

function serializeStyleMap(styleMap) {
  return Array.from(styleMap.entries())
    .map(([property, value]) => `${property}:${value}`)
    .join(";");
}

function rewriteInlineStylePaint(element) {
  const styleRaw = element.getAttribute("style");
  if (!styleRaw) return 0;

  const styleMap = parseStyleMap(styleRaw);
  let changes = 0;

  ["fill", "stroke"].forEach((property) => {
    if (!styleMap.has(property)) return;
    if (!isConvertiblePaint(styleMap.get(property))) return;
    styleMap.set(property, "currentColor");
    changes += 1;
  });

  if (changes > 0) {
    element.setAttribute("style", serializeStyleMap(styleMap));
  }
  return changes;
}

function rewritePaintAttribute(element, attributeName) {
  if (!element?.hasAttribute?.(attributeName)) return false;
  const value = element.getAttribute(attributeName);
  if (!isConvertiblePaint(value)) return false;
  element.setAttribute(attributeName, "currentColor");
  return true;
}

function convertSvgToCurrentColorByRegex(svgText = "") {
  let changedAttributes = 0;
  let nextSvgText = String(svgText || "");

  const paintAttributeRegex = /(\s(?:fill|stroke)\s*=\s*)(["'])([^"']*)(\2)/gi;
  nextSvgText = nextSvgText.replace(
    paintAttributeRegex,
    (fullMatch, prefix, quote, paintValue) => {
      if (!isConvertiblePaint(paintValue)) return fullMatch;
      changedAttributes += 1;
      return `${prefix}${quote}currentColor${quote}`;
    }
  );

  const styleAttributeRegex = /(style\s*=\s*)(["'])([^"']*)(\2)/gi;
  nextSvgText = nextSvgText.replace(
    styleAttributeRegex,
    (fullMatch, prefix, quote, styleValue) => {
      const styleMap = parseStyleMap(styleValue);
      let localChanges = 0;

      ["fill", "stroke"].forEach((property) => {
        if (!styleMap.has(property)) return;
        if (!isConvertiblePaint(styleMap.get(property))) return;
        styleMap.set(property, "currentColor");
        localChanges += 1;
      });

      if (localChanges === 0) return fullMatch;
      changedAttributes += localChanges;
      return `${prefix}${quote}${serializeStyleMap(styleMap)}${quote}`;
    }
  );

  return {
    changed: changedAttributes > 0,
    changedAttributes,
    changedElements: 0,
    svgText: nextSvgText,
  };
}

function inspectSvgDocument({ doc, fileName = "", byteSize = 0, mimeType = "" }) {
  const warnings = [];
  const criticalErrors = [];

  const root = doc?.documentElement || null;
  if (!root || String(root.tagName || "").toLowerCase() !== "svg") {
    criticalErrors.push("El archivo no contiene un nodo SVG valido.");
    return {
      valid: false,
      warnings,
      criticalErrors,
      checks: {},
    };
  }

  const viewBoxRaw = root.getAttribute("viewBox");
  const viewBox = parseViewBox(viewBoxRaw);
  if (!viewBox) {
    criticalErrors.push("El SVG debe incluir un viewBox valido.");
  }

  const widthAttr = root.getAttribute("width");
  const heightAttr = root.getAttribute("height");
  const hasFixedDimensions = Boolean(widthAttr || heightAttr);
  if (hasFixedDimensions) {
    warnings.push("El SVG tiene width/height fijos. Se recomienda usar solo viewBox.");
  }

  if (viewBox && Math.abs(viewBox.width - viewBox.height) > 0.01) {
    warnings.push("El viewBox no es cuadrado. Se recomienda una relacion 1:1.");
  }

  if (byteSize > 500 * 1024) {
    criticalErrors.push("El SVG supera 500KB. Reduce su peso para continuar.");
  } else if (byteSize > 200 * 1024) {
    warnings.push("El SVG pesa mas de 200KB. Considera optimizarlo.");
  }

  const scripts = doc.querySelectorAll("script");
  if (scripts.length > 0) {
    criticalErrors.push("El SVG contiene scripts, lo cual no esta permitido.");
  }

  const foreignObjects = doc.querySelectorAll("foreignObject");
  if (foreignObjects.length > 0) {
    criticalErrors.push("El SVG contiene foreignObject, lo cual no esta permitido.");
  }

  const textNodes = doc.querySelectorAll("text, tspan");
  if (textNodes.length > 0) {
    criticalErrors.push("El SVG contiene texto (text/tspan). Debe exportarse sin texto dinamico.");
  }

  const allElements = Array.from(doc.querySelectorAll("*"));
  let foundEventHandlers = false;
  let foundExternalHref = false;

  for (const element of allElements) {
    for (const attribute of Array.from(element.attributes || [])) {
      const name = String(attribute.name || "").toLowerCase();
      const value = String(attribute.value || "").trim().toLowerCase();

      if (name.startsWith("on")) {
        foundEventHandlers = true;
      }

      const isHref = name === "href" || name === "xlink:href";
      if (isHref && (value.startsWith("http:") || value.startsWith("https:") || value.startsWith("//") || value.startsWith("javascript:"))) {
        foundExternalHref = true;
      }
    }
  }

  if (foundEventHandlers) {
    criticalErrors.push("El SVG contiene atributos de eventos inline (on*).");
  }
  if (foundExternalHref) {
    criticalErrors.push("El SVG referencia enlaces externos no permitidos.");
  }

  const serialized = new XMLSerializer().serializeToString(root);
  const usesCurrentColor = /currentColor/i.test(serialized);
  if (!usesCurrentColor) {
    warnings.push("El SVG no usa currentColor. El color del frame puede quedar fijo.");
  }

  const colorMode = usesCurrentColor ? "currentColor" : "fixed";
  if (!COUNTDOWN_SVG_COLOR_MODES.includes(colorMode)) {
    warnings.push("No se pudo determinar el modo de color del SVG.");
  }

  const checks = {
    fileName: String(fileName || "").trim(),
    mimeType: String(mimeType || "").trim(),
    bytes: Number(byteSize || 0),
    hasViewBox: Boolean(viewBox),
    viewBox: viewBox?.raw || null,
    viewBoxWidth: viewBox?.width || null,
    viewBoxHeight: viewBox?.height || null,
    isSquare: Boolean(viewBox && Math.abs(viewBox.width - viewBox.height) <= 0.01),
    hasFixedDimensions,
    widthAttr: widthAttr || null,
    heightAttr: heightAttr || null,
    colorMode,
  };

  return {
    valid: criticalErrors.length === 0,
    warnings,
    criticalErrors,
    checks,
    svgText: serialized,
  };
}

export async function inspectSvgFile(file) {
  if (!file) {
    return {
      valid: false,
      warnings: [],
      criticalErrors: ["Debes seleccionar un archivo SVG."],
      checks: {},
    };
  }

  const fileName = String(file.name || "").toLowerCase();
  const mimeType = String(file.type || "").toLowerCase();
  const isSvgByName = fileName.endsWith(".svg");
  const isSvgByMime = mimeType.includes("svg");
  if (!isSvgByName && !isSvgByMime) {
    return {
      valid: false,
      warnings: [],
      criticalErrors: ["El archivo seleccionado no es SVG."],
      checks: {
        fileName: file.name || null,
        mimeType: file.type || null,
      },
    };
  }

  const text = await file.text();
  return inspectSvgText({
    svgText: text,
    fileName: file.name,
    byteSize: file.size || 0,
    mimeType: file.type || "",
  });
}

export function inspectSvgText({
  svgText,
  fileName = "",
  byteSize = 0,
  mimeType = "",
}) {
  const warnings = [];
  const criticalErrors = [];

  if (typeof svgText !== "string" || !svgText.trim()) {
    return {
      valid: false,
      warnings,
      criticalErrors: ["No se pudo leer el contenido del SVG."],
      checks: {
        fileName,
        mimeType,
        bytes: Number(byteSize || 0),
      },
    };
  }

  let doc = null;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(svgText, "image/svg+xml");
  } catch {
    criticalErrors.push("No se pudo parsear el SVG.");
  }

  if (!doc) {
    return {
      valid: false,
      warnings,
      criticalErrors,
      checks: {
        fileName,
        mimeType,
        bytes: Number(byteSize || 0),
      },
    };
  }

  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    criticalErrors.push("El SVG contiene errores de estructura XML.");
  }

  const inspected = inspectSvgDocument({
    doc,
    fileName,
    byteSize,
    mimeType,
  });

  return {
    ...inspected,
    warnings: [...warnings, ...inspected.warnings],
    criticalErrors: [...criticalErrors, ...inspected.criticalErrors],
  };
}

export function svgTextToBase64(svgText = "") {
  const utf8 = unescape(encodeURIComponent(String(svgText || "")));
  return btoa(utf8);
}

export function convertSvgToCurrentColor(svgText = "") {
  if (typeof svgText !== "string" || !svgText.trim()) {
    return {
      changed: false,
      changedAttributes: 0,
      changedElements: 0,
      svgText: "",
    };
  }

  let doc = null;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(svgText, "image/svg+xml");
  } catch {
    return convertSvgToCurrentColorByRegex(svgText);
  }

  const parserError = doc?.querySelector?.("parsererror");
  const root = doc?.documentElement || null;
  if (parserError || !root || String(root.tagName || "").toLowerCase() !== "svg") {
    return convertSvgToCurrentColorByRegex(svgText);
  }

  const allElements = [root, ...Array.from(root.querySelectorAll("*"))];
  let changedAttributes = 0;
  let changedElements = 0;

  allElements.forEach((element) => {
    let elementChanged = false;

    if (rewritePaintAttribute(element, "fill")) {
      changedAttributes += 1;
      elementChanged = true;
    }
    if (rewritePaintAttribute(element, "stroke")) {
      changedAttributes += 1;
      elementChanged = true;
    }

    const styleChanges = rewriteInlineStylePaint(element);
    if (styleChanges > 0) {
      changedAttributes += styleChanges;
      elementChanged = true;
    }

    if (elementChanged) changedElements += 1;
  });

  const serialized = new XMLSerializer().serializeToString(root);
  if (changedAttributes === 0) {
    return convertSvgToCurrentColorByRegex(svgText);
  }

  return {
    changed: true,
    changedAttributes,
    changedElements,
    svgText: serialized,
  };
}
