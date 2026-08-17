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

type SimpleClassStyleRule = {
  classNames: string[];
  declarations: StyleEntry[];
};

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
  "enable-background",
  "shape-rendering",
  "text-rendering",
  "image-rendering",
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
  "enable-background",
  "shape-rendering",
  "text-rendering",
  "image-rendering",
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
const SAFE_CLASS_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const INERT_ROOT_METADATA_ATTRIBUTES = new Set([
  "version",
  "xml:space",
  "x",
  "y",
]);
const INERT_ELEMENT_METADATA_ATTRIBUTES = new Set(["data-name"]);
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const INKSCAPE_NAMESPACE = "http://www.inkscape.org/namespaces/inkscape";
const SODIPODI_NAMESPACE = "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd";
const SKETCH_NAMESPACE = "http://www.bohemiancoding.com/sketch/ns";
const ADOBE_EXTENSIBILITY_NAMESPACE = "http://ns.adobe.com/Extensibility/1.0/";
const ADOBE_ILLUSTRATOR_NAMESPACE = "http://ns.adobe.com/AdobeIllustrator/10.0/";
const ADOBE_GRAPHS_NAMESPACE = "http://ns.adobe.com/Graphs/1.0/";
const ADOBE_EDITOR_NAMESPACES = new Set([
  ADOBE_EXTENSIBILITY_NAMESPACE,
  ADOBE_ILLUSTRATOR_NAMESPACE,
  ADOBE_GRAPHS_NAMESPACE,
]);
const INERT_EDITOR_METADATA_ELEMENTS = new Map<string, Set<string>>([
  [SODIPODI_NAMESPACE, new Set(["namedview"])],
  [INKSCAPE_NAMESPACE, new Set(["page"])],
]);
const INERT_EDITOR_METADATA_ATTRIBUTES = new Map<string, Set<string>>([
  [INKSCAPE_NAMESPACE, new Set(["groupmode", "label"])],
  [SODIPODI_NAMESPACE, new Set(["docname"])],
]);

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

function parseStyle(styleText: string): StyleEntry[] | null {
  const entries: StyleEntry[] = [];
  for (const rawDeclaration of String(styleText || "").split(";")) {
    const declaration = rawDeclaration.trim();
    if (!declaration) continue;
    const separator = declaration.indexOf(":");
    if (separator <= 0) return null;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (!property || !value || /!\s*important\b/i.test(value)) return null;
    entries.push([property, value]);
  }
  return entries.length > 0 ? entries : null;
}

function parseSimpleClassStyles(styleText: string): SimpleClassStyleRule[] | null {
  const raw = String(styleText || "");
  const withoutComments = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  if (withoutComments.includes("/*") || withoutComments.includes("*/")) return null;
  if (!withoutComments.trim()) return [];

  const rules: SimpleClassStyleRule[] = [];
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(withoutComments))) {
    if (withoutComments.slice(cursor, match.index).trim()) return null;
    const classNames = match[1]
      .split(",")
      .map((selector) => selector.trim())
      .map((selector) => {
        const selectorMatch = selector.match(/^\.([A-Za-z_][A-Za-z0-9_-]*)$/);
        return selectorMatch?.[1] || null;
      });
    if (!classNames.length || classNames.some((className) => !className)) return null;

    const declarations = parseStyle(match[2]);
    if (
      !declarations ||
      declarations.some(([property]) => !STYLE_PROPERTIES.has(property))
    ) {
      return null;
    }

    rules.push({
      classNames: classNames as string[],
      declarations,
    });
    cursor = blockPattern.lastIndex;
  }

  if (withoutComments.slice(cursor).trim() || rules.length === 0) return null;
  return rules;
}

function classNamesFromElement(element: Element): string[] {
  return String(element.getAttribute("class") || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function selectorTargetsOnlyRemovedText(params: {
  selector: string;
  removedTextClasses: Set<string>;
  retainedClasses: Set<string>;
}): boolean {
  const selector = params.selector.trim();
  if (/^(?:text|tspan)(?:[.#][A-Za-z_][A-Za-z0-9_-]*)?$/i.test(selector)) {
    return true;
  }
  const classSelector = selector.match(/^\.([A-Za-z_][A-Za-z0-9_-]*)$/);
  if (!classSelector) return false;
  return (
    params.removedTextClasses.has(classSelector[1]) &&
    !params.retainedClasses.has(classSelector[1])
  );
}

function removeTextOnlyStyleRules(params: {
  document: Document;
  textElements: Element[];
}): number {
  const removedTextClasses = new Set<string>();
  for (const textElement of params.textElements) {
    for (const element of [
      textElement,
      ...Array.from(textElement.querySelectorAll("[class]")),
    ]) {
      for (const className of classNamesFromElement(element)) {
        removedTextClasses.add(className);
      }
    }
  }

  const retainedClasses = new Set<string>();
  for (const element of Array.from(params.document.querySelectorAll("[class]"))) {
    const belongsToRemovedText = params.textElements.some(
      (textElement) => textElement === element || textElement.contains(element)
    );
    if (belongsToRemovedText) continue;
    for (const className of classNamesFromElement(element)) {
      retainedClasses.add(className);
    }
  }

  let removedRules = 0;
  for (const styleElement of Array.from(params.document.querySelectorAll("style"))) {
    const raw = String(styleElement.textContent || "");
    const withoutComments = raw.replace(/\/\*[\s\S]*?\*\//g, "");
    if (withoutComments.includes("/*") || withoutComments.includes("*/")) continue;

    const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
    const retainedRuleTexts: string[] = [];
    let cursor = 0;
    let parsedRuleCount = 0;
    let textOnlyRuleCount = 0;
    let parseable = true;
    let match: RegExpExecArray | null;

    while ((match = blockPattern.exec(withoutComments))) {
      if (withoutComments.slice(cursor, match.index).trim()) {
        parseable = false;
        break;
      }
      parsedRuleCount += 1;
      const selectors = match[1]
        .split(",")
        .map((selector) => selector.trim())
        .filter(Boolean);
      const textOnly =
        selectors.length > 0 &&
        selectors.every((selector) =>
          selectorTargetsOnlyRemovedText({
            selector,
            removedTextClasses,
            retainedClasses,
          })
        );
      if (textOnly) {
        textOnlyRuleCount += 1;
      } else {
        retainedRuleTexts.push(match[0]);
      }
      cursor = blockPattern.lastIndex;
    }

    if (
      !parseable ||
      parsedRuleCount === 0 ||
      withoutComments.slice(cursor).trim()
    ) {
      continue;
    }
    if (retainedRuleTexts.length === parsedRuleCount) continue;
    if (retainedRuleTexts.length === 0) {
      styleElement.remove();
    } else {
      styleElement.textContent = retainedRuleTexts.join("");
    }
    removedRules += textOnlyRuleCount;
  }
  return removedRules;
}

function removeSvgText(params: {
  document: Document;
  warnings: IconValidationIssue[];
  normalizationApplied: string[];
  normalizeSafe: boolean;
}): void {
  if (!params.normalizeSafe) return;
  const textElements = Array.from(
    params.document.getElementsByTagNameNS(SVG_NAMESPACE, "text")
  );
  if (textElements.length === 0) return;

  const removedStyleRules = removeTextOnlyStyleRules({
    document: params.document,
    textElements,
  });
  for (const textElement of textElements) textElement.remove();

  params.normalizationApplied.push("remove-svg-text");
  if (removedStyleRules > 0) {
    params.normalizationApplied.push("remove-svg-text-styles");
  }
  params.warnings.push(
    issue(
      "warning",
      "ICON_SVG_TEXT_REMOVED",
      `El SVG incluia ${textElements.length} bloque${textElements.length === 1 ? "" : "s"} de texto; el backend los retiro y conserva solo el dibujo.`
    )
  );
}

function removeInertRootMetadata(params: {
  root: Element;
  normalizeSafe: boolean;
  normalizationApplied: string[];
}): void {
  if (!params.normalizeSafe) return;
  let removed = 0;
  for (const attribute of Array.from(params.root.attributes || [])) {
    if (!INERT_ROOT_METADATA_ATTRIBUTES.has(attribute.name.toLowerCase())) continue;
    params.root.removeAttribute(attribute.name);
    removed += 1;
  }
  if (removed > 0) params.normalizationApplied.push("remove-inert-svg-metadata");
}

function removeInertElementMetadata(params: {
  document: Document;
  normalizeSafe: boolean;
  normalizationApplied: string[];
}): void {
  if (!params.normalizeSafe) return;
  let removed = 0;
  for (const element of Array.from(params.document.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes || [])) {
      if (!INERT_ELEMENT_METADATA_ATTRIBUTES.has(attribute.name.toLowerCase())) {
        continue;
      }
      element.removeAttribute(attribute.name);
      removed += 1;
    }
  }
  if (removed > 0) {
    params.normalizationApplied.push("remove-inert-svg-element-metadata");
  }
}

function replacePrefixedSvgElements(document: Document): number {
  const prefixedElements = Array.from(
    document.getElementsByTagNameNS(SVG_NAMESPACE, "*")
  ).filter((element) => String(element.prefix || "").toLowerCase() === "svg");
  let replaced = 0;

  for (const element of prefixedElements.reverse()) {
    const parent = element.parentNode;
    if (!parent) continue;

    const replacement = document.createElementNS(SVG_NAMESPACE, element.localName);
    for (const attribute of Array.from(element.attributes || [])) {
      if (
        attribute.namespaceURI === XMLNS_NAMESPACE &&
        attribute.localName.toLowerCase() === "svg"
      ) {
        continue;
      }
      if (attribute.namespaceURI) {
        replacement.setAttributeNS(
          attribute.namespaceURI,
          attribute.name,
          attribute.value
        );
      } else {
        replacement.setAttribute(attribute.name, attribute.value);
      }
    }
    while (element.firstChild) replacement.appendChild(element.firstChild);
    parent.replaceChild(replacement, element);
    replaced += 1;
  }

  if (replaced > 0) {
    document.documentElement?.setAttributeNS(
      XMLNS_NAMESPACE,
      "xmlns",
      SVG_NAMESPACE
    );
  }
  return replaced;
}

function namespacePrefixIsUsed(params: {
  document: Document;
  prefix: string;
  namespace: string;
}): boolean {
  for (const element of Array.from(params.document.querySelectorAll("*"))) {
    if (
      element.namespaceURI === params.namespace &&
      String(element.prefix || "").toLowerCase() === params.prefix
    ) {
      return true;
    }
    if (
      Array.from(element.attributes || []).some(
        (attribute) =>
          attribute.namespaceURI === params.namespace &&
          String(attribute.prefix || "").toLowerCase() === params.prefix
      )
    ) {
      return true;
    }
  }
  return false;
}

function removeUnusedNamespaceDeclaration(params: {
  root: Element;
  document: Document;
  prefix: string;
  namespace: string;
}): number {
  if (namespacePrefixIsUsed(params)) return 0;
  if (!params.root.hasAttributeNS(XMLNS_NAMESPACE, params.prefix)) return 0;
  params.root.removeAttributeNS(XMLNS_NAMESPACE, params.prefix);
  return 1;
}

function normalizeInkscapeMetadata(params: {
  document: Document;
  normalizeSafe: boolean;
  normalizationApplied: string[];
}): { requiresVisualVerification: boolean } {
  if (!params.normalizeSafe) return { requiresVisualVerification: false };

  const baselineRoot = params.document.documentElement;
  const hasSupportedPrefixedRoot = Boolean(
    baselineRoot &&
      String(baselineRoot.prefix || "").toLowerCase() === "svg" &&
      baselineRoot.localName.toLowerCase() === "svg" &&
      baselineRoot.namespaceURI === SVG_NAMESPACE
  );
  const replacedSvgElements = hasSupportedPrefixedRoot
    ? replacePrefixedSvgElements(params.document)
    : 0;

  let removedElements = 0;
  for (const element of Array.from(params.document.querySelectorAll("*"))) {
    const allowedLocalNames = INERT_EDITOR_METADATA_ELEMENTS.get(
      String(element.namespaceURI || "")
    );
    if (!allowedLocalNames?.has(element.localName.toLowerCase())) continue;
    element.remove();
    removedElements += 1;
  }

  let removedAttributes = 0;
  for (const element of Array.from(params.document.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes || [])) {
      const allowedLocalNames = INERT_EDITOR_METADATA_ATTRIBUTES.get(
        String(attribute.namespaceURI || "")
      );
      if (!allowedLocalNames?.has(attribute.localName.toLowerCase())) continue;
      element.removeAttributeNS(attribute.namespaceURI, attribute.localName);
      removedAttributes += 1;
    }
  }

  const normalizedRoot = params.document.documentElement;
  let removedNamespaceDeclarations = 0;
  if (normalizedRoot) {
    removedNamespaceDeclarations += removeUnusedNamespaceDeclaration({
      root: normalizedRoot,
      document: params.document,
      prefix: "svg",
      namespace: SVG_NAMESPACE,
    });
    removedNamespaceDeclarations += removeUnusedNamespaceDeclaration({
      root: normalizedRoot,
      document: params.document,
      prefix: "inkscape",
      namespace: INKSCAPE_NAMESPACE,
    });
    removedNamespaceDeclarations += removeUnusedNamespaceDeclaration({
      root: normalizedRoot,
      document: params.document,
      prefix: "sodipodi",
      namespace: SODIPODI_NAMESPACE,
    });
  }

  if (replacedSvgElements > 0) {
    params.normalizationApplied.push("canonicalize-svg-namespace-prefix");
  }
  if (
    removedElements > 0 ||
    removedAttributes > 0 ||
    removedNamespaceDeclarations > 0
  ) {
    params.normalizationApplied.push("remove-inkscape-metadata");
  }

  return {
    requiresVisualVerification:
      replacedSvgElements > 0 ||
      removedElements > 0 ||
      removedAttributes > 0 ||
      removedNamespaceDeclarations > 0,
  };
}

function normalizeSketchMetadata(params: {
  document: Document;
  normalizeSafe: boolean;
  normalizationApplied: string[];
}): { requiresVisualVerification: boolean } {
  if (!params.normalizeSafe) return { requiresVisualVerification: false };

  let removedAttributes = 0;
  for (const element of Array.from(params.document.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes || [])) {
      if (
        attribute.namespaceURI !== SKETCH_NAMESPACE ||
        attribute.localName.toLowerCase() !== "type"
      ) {
        continue;
      }
      element.removeAttributeNS(attribute.namespaceURI, attribute.localName);
      removedAttributes += 1;
    }
  }

  const root = params.document.documentElement;
  const removedNamespaceDeclarations = root
    ? removeUnusedNamespaceDeclaration({
        root,
        document: params.document,
        prefix: "sketch",
        namespace: SKETCH_NAMESPACE,
      })
    : 0;

  if (removedAttributes > 0 || removedNamespaceDeclarations > 0) {
    params.normalizationApplied.push("remove-sketch-metadata");
  }

  return {
    requiresVisualVerification:
      removedAttributes > 0 || removedNamespaceDeclarations > 0,
  };
}

function namespaceUriIsUsed(params: {
  document: Document;
  namespace: string;
}): boolean {
  for (const element of Array.from(params.document.querySelectorAll("*"))) {
    if (element.namespaceURI === params.namespace) return true;
    if (
      Array.from(element.attributes || []).some(
        (attribute) =>
          attribute.namespaceURI === params.namespace &&
          attribute.namespaceURI !== XMLNS_NAMESPACE
      )
    ) {
      return true;
    }
  }
  return false;
}

function isAdobeIllustratorMetadataForeignObject(element: Element): boolean {
  if (
    element.namespaceURI !== SVG_NAMESPACE ||
    element.localName.toLowerCase() !== "foreignobject"
  ) {
    return false;
  }
  const requiredExtensions = String(
    element.getAttribute("requiredExtensions") || ""
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (
    requiredExtensions.length > 0 &&
    requiredExtensions.includes(ADOBE_ILLUSTRATOR_NAMESPACE) &&
    requiredExtensions.every((namespace) => ADOBE_EDITOR_NAMESPACES.has(namespace))
  );
}

function normalizeAdobeIllustratorMetadata(params: {
  document: Document;
  normalizeSafe: boolean;
  normalizationApplied: string[];
}): { requiresVisualVerification: boolean } {
  if (!params.normalizeSafe) return { requiresVisualVerification: false };

  let unwrappedSwitches = 0;
  for (const switchElement of Array.from(
    params.document.getElementsByTagNameNS(SVG_NAMESPACE, "switch")
  )) {
    const children = Array.from(switchElement.children);
    if (children.length !== 2) continue;
    const [metadataBranch, drawingBranch] = children;
    const drawingTag = drawingBranch.localName.toLowerCase();
    if (
      !isAdobeIllustratorMetadataForeignObject(metadataBranch) ||
      drawingBranch.namespaceURI !== SVG_NAMESPACE ||
      !ALLOWED_ELEMENTS.has(drawingTag) ||
      drawingTag === "svg" ||
      drawingTag === "defs" ||
      drawingTag === "title" ||
      drawingTag === "desc"
    ) {
      continue;
    }
    const parent = switchElement.parentNode;
    if (!parent) continue;
    switchElement.removeChild(drawingBranch);
    parent.replaceChild(drawingBranch, switchElement);
    unwrappedSwitches += 1;
  }

  let removedAttributes = 0;
  for (const element of Array.from(params.document.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes || [])) {
      if (
        attribute.namespaceURI !== ADOBE_ILLUSTRATOR_NAMESPACE ||
        attribute.localName.toLowerCase() !== "extraneous" ||
        String(attribute.value || "").trim().toLowerCase() !== "self"
      ) {
        continue;
      }
      element.removeAttributeNS(attribute.namespaceURI, attribute.localName);
      removedAttributes += 1;
    }
  }

  const root = params.document.documentElement;
  let removedNamespaceDeclarations = 0;
  if (root) {
    for (const attribute of Array.from(root.attributes || [])) {
      const namespace = String(attribute.value || "").trim();
      if (
        attribute.namespaceURI !== XMLNS_NAMESPACE ||
        !ADOBE_EDITOR_NAMESPACES.has(namespace) ||
        namespaceUriIsUsed({ document: params.document, namespace })
      ) {
        continue;
      }
      root.removeAttributeNS(XMLNS_NAMESPACE, attribute.localName);
      removedNamespaceDeclarations += 1;
    }
  }

  if (unwrappedSwitches > 0) {
    params.normalizationApplied.push("unwrap-adobe-illustrator-switch");
  }
  if (removedAttributes > 0 || removedNamespaceDeclarations > 0) {
    params.normalizationApplied.push("remove-adobe-illustrator-metadata");
  }

  return {
    requiresVisualVerification:
      unwrappedSwitches > 0 ||
      removedAttributes > 0 ||
      removedNamespaceDeclarations > 0,
  };
}

function materializeSimpleClassStyles(params: {
  document: Document;
  errors: IconValidationIssue[];
  normalizationApplied: string[];
  normalizeSafe: boolean;
}): { requiresVisualVerification: boolean } {
  const styleElements = Array.from(params.document.querySelectorAll("style"));
  const classElements = Array.from(params.document.querySelectorAll("[class]"));
  if (!params.normalizeSafe || (styleElements.length === 0 && classElements.length === 0)) {
    return { requiresVisualVerification: false };
  }

  const rules: SimpleClassStyleRule[] = [];
  let supported = true;

  for (const styleElement of styleElements) {
    const attributes = Array.from(styleElement.attributes || []);
    const hasUnsupportedAttribute = attributes.some((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name !== "type") return true;
      return String(attribute.value || "").trim().toLowerCase() !== "text/css";
    });
    const parsed = hasUnsupportedAttribute
      ? null
      : parseSimpleClassStyles(styleElement.textContent || "");
    if (!parsed) {
      supported = false;
      break;
    }
    rules.push(...parsed);
  }

  const classesByElement = new Map<Element, Set<string>>();
  if (supported) {
    for (const element of classElements) {
      const classNames = String(element.getAttribute("class") || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (classNames.some((className) => !SAFE_CLASS_NAME_PATTERN.test(className))) {
        supported = false;
        break;
      }
      classesByElement.set(element, new Set(classNames));
    }
  }

  if (!supported) {
    params.errors.push(
      issue(
        "error",
        "ICON_SVG_UNSUPPORTED_STYLE",
        "El SVG usa reglas CSS que no pueden materializarse de forma segura."
      )
    );
  } else {
    for (const rule of rules) {
      for (const [element, classNames] of classesByElement) {
        if (!rule.classNames.some((className) => classNames.has(className))) continue;
        for (const [property, value] of rule.declarations) {
          element.setAttribute(property, value);
        }
      }
    }
  }

  for (const styleElement of styleElements) styleElement.remove();
  for (const element of classElements) element.removeAttribute("class");

  if (supported && styleElements.length > 0) {
    params.normalizationApplied.push("inline-simple-class-styles");
  }
  if (supported && classElements.length > 0) {
    params.normalizationApplied.push("remove-materialized-svg-classes");
  }

  return {
    requiresVisualVerification: supported && (styleElements.length > 0 || classElements.length > 0),
  };
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

function collectReferencedSvgIds(document: Document): Set<string> {
  const references = new Set<string>();
  const localUrlPattern = /url\(\s*#([A-Za-z_][\w:.-]*)\s*\)/gi;

  for (const element of Array.from(document.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes || [])) {
      const name = String(attribute.name || "").toLowerCase();
      const value = String(attribute.value || "").trim();
      if ((name === "href" || name === "xlink:href") && LOCAL_HREF_PATTERN.test(value)) {
        references.add(value.slice(1));
      }
      for (const match of value.matchAll(localUrlPattern)) references.add(match[1]);
    }
    if (element.localName.toLowerCase() === "style") {
      for (const match of String(element.textContent || "").matchAll(localUrlPattern)) {
        references.add(match[1]);
      }
    }
  }

  return references;
}

function removeUnreferencedDuplicateIds(params: {
  document: Document;
  normalizeSafe: boolean;
  normalizationApplied: string[];
}): { requiresVisualVerification: boolean } {
  if (!params.normalizeSafe) return { requiresVisualVerification: false };

  const elementsById = new Map<string, Element[]>();
  for (const element of Array.from(params.document.querySelectorAll("[id]"))) {
    const id = String(element.getAttribute("id") || "").trim();
    if (!id) continue;
    const elements = elementsById.get(id) || [];
    elements.push(element);
    elementsById.set(id, elements);
  }

  const references = collectReferencedSvgIds(params.document);
  let removedIds = 0;
  for (const [id, elements] of elementsById) {
    if (elements.length <= 1 || references.has(id)) continue;
    for (const element of elements) {
      element.removeAttribute("id");
      removedIds += 1;
    }
  }

  if (removedIds > 0) {
    params.normalizationApplied.push("remove-unreferenced-duplicate-svg-ids");
  }
  return { requiresVisualVerification: removedIds > 0 };
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
  normalizeSafe: boolean;
}): { geometryCount: number; requiresVisualVerification: boolean } {
  const { document, errors, normalizationApplied } = params;
  const ids = new Set<string>();
  const references = new Set<string>();
  let geometryCount = 0;
  let styleAttributesNormalized = 0;

  const classStyleResult = materializeSimpleClassStyles({
    document,
    errors,
    normalizationApplied,
    normalizeSafe: params.normalizeSafe,
  });

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
      if (!entries || entries.some(([property]) => !STYLE_PROPERTIES.has(property))) {
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

  return {
    geometryCount,
    requiresVisualVerification:
      classStyleResult.requiresVisualVerification || styleAttributesNormalized > 0,
  };
}

async function rasterizeSvg(svgText: string): Promise<{ data: Buffer; channels: number }> {
  const rasterDom = new JSDOM(svgText, { contentType: "image/svg+xml" });
  const rasterRoot = rasterDom.window.document.documentElement;
  rasterRoot.setAttribute("width", "128");
  rasterRoot.setAttribute("height", "128");
  const boundedSvgText = rasterRoot.outerHTML;

  const { data, info } = await sharp(Buffer.from(boundedSvgText, "utf8"), {
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

  return { data, channels: info.channels };
}

async function hasVisiblePixels(svgText: string): Promise<boolean> {
  const { data, channels } = await rasterizeSvg(svgText);

  for (let index = 3; index < data.length; index += channels) {
    if (data[index] > 0) return true;
  }
  return false;
}

async function hasEquivalentRaster(leftSvg: string, rightSvg: string): Promise<boolean> {
  const [left, right] = await Promise.all([
    rasterizeSvg(leftSvg),
    rasterizeSvg(rightSvg),
  ]);
  return left.channels === right.channels && left.data.equals(right.data);
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
  const parsedRoot = document.documentElement;
  const inkscapeVisualBaselineSvgText = parsedRoot?.outerHTML || null;
  const inkscapeNormalization = normalizeInkscapeMetadata({
    document,
    normalizeSafe: input.normalizeSafe,
    normalizationApplied,
  });
  const inkscapeNormalizedSvgText = document.documentElement?.outerHTML || null;
  const sketchVisualBaselineSvgText = document.documentElement?.outerHTML || null;
  const sketchNormalization = normalizeSketchMetadata({
    document,
    normalizeSafe: input.normalizeSafe,
    normalizationApplied,
  });
  const root = document.documentElement;
  const sketchNormalizedSvgText = root?.outerHTML || null;
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

  root.setAttributeNS(XMLNS_NAMESPACE, "xmlns", SVG_NAMESPACE);
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

  removeInertRootMetadata({
    root,
    normalizeSafe: input.normalizeSafe,
    normalizationApplied,
  });
  removeInertElementMetadata({
    document,
    normalizeSafe: input.normalizeSafe,
    normalizationApplied,
  });
  removeSvgText({
    document,
    warnings,
    normalizationApplied,
    normalizeSafe: input.normalizeSafe,
  });
  const adobeVisualBaselineSvgText = root?.outerHTML || null;
  const adobeNormalization = normalizeAdobeIllustratorMetadata({
    document,
    normalizeSafe: input.normalizeSafe,
    normalizationApplied,
  });
  const adobeNormalizedSvgText = root?.outerHTML || null;
  const duplicateIdVisualBaselineSvgText = root?.outerHTML || null;
  const duplicateIdNormalization = removeUnreferencedDuplicateIds({
    document,
    normalizeSafe: input.normalizeSafe,
    normalizationApplied,
  });
  const duplicateIdNormalizedSvgText = root?.outerHTML || null;
  const visualBaselineSvgText = root?.outerHTML || null;
  const { geometryCount, requiresVisualVerification } = sanitizeSvgDocument({
    document,
    errors,
    normalizationApplied,
    normalizeSafe: input.normalizeSafe,
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

  if (
    inkscapeVisualBaselineSvgText &&
    inkscapeNormalizedSvgText &&
    inkscapeNormalization.requiresVisualVerification &&
    errors.length === 0
  ) {
    try {
      if (!(await hasEquivalentRaster(
        inkscapeVisualBaselineSvgText,
        inkscapeNormalizedSvgText
      ))) {
        errors.push(
          issue(
            "error",
            "ICON_SVG_METADATA_NORMALIZATION_MISMATCH",
            "Los metadatos editoriales no pudieron retirarse conservando exactamente la apariencia del SVG."
          )
        );
      }
    } catch {
      errors.push(
        issue(
          "error",
          "ICON_SVG_METADATA_NORMALIZATION_FAILED",
          "No se pudo comprobar de forma confiable la apariencia despues de retirar metadatos editoriales."
        )
      );
    }
  }

  if (
    sketchVisualBaselineSvgText &&
    sketchNormalizedSvgText &&
    sketchNormalization.requiresVisualVerification &&
    errors.length === 0
  ) {
    try {
      if (!(await hasEquivalentRaster(
        sketchVisualBaselineSvgText,
        sketchNormalizedSvgText
      ))) {
        errors.push(
          issue(
            "error",
            "ICON_SVG_SKETCH_NORMALIZATION_MISMATCH",
            "Los metadatos de Sketch no pudieron retirarse conservando exactamente la apariencia del SVG."
          )
        );
      }
    } catch {
      errors.push(
        issue(
          "error",
          "ICON_SVG_SKETCH_NORMALIZATION_FAILED",
          "No se pudo comprobar de forma confiable la apariencia despues de retirar metadatos de Sketch."
        )
      );
    }
  }

  if (
    adobeVisualBaselineSvgText &&
    adobeNormalizedSvgText &&
    adobeNormalization.requiresVisualVerification &&
    errors.length === 0
  ) {
    try {
      if (!(await hasEquivalentRaster(
        adobeVisualBaselineSvgText,
        adobeNormalizedSvgText
      ))) {
        errors.push(
          issue(
            "error",
            "ICON_SVG_ADOBE_NORMALIZATION_MISMATCH",
            "Los metadatos de Illustrator no pudieron retirarse conservando exactamente la apariencia del SVG."
          )
        );
      }
    } catch {
      errors.push(
        issue(
          "error",
          "ICON_SVG_ADOBE_NORMALIZATION_FAILED",
          "No se pudo comprobar de forma confiable la apariencia despues de retirar metadatos de Illustrator."
        )
      );
    }
  }

  if (
    duplicateIdVisualBaselineSvgText &&
    duplicateIdNormalizedSvgText &&
    duplicateIdNormalization.requiresVisualVerification &&
    errors.length === 0
  ) {
    try {
      if (!(await hasEquivalentRaster(
        duplicateIdVisualBaselineSvgText,
        duplicateIdNormalizedSvgText
      ))) {
        errors.push(
          issue(
            "error",
            "ICON_SVG_ID_NORMALIZATION_MISMATCH",
            "Los identificadores duplicados sin uso no pudieron retirarse conservando exactamente la apariencia del SVG."
          )
        );
      }
    } catch {
      errors.push(
        issue(
          "error",
          "ICON_SVG_ID_NORMALIZATION_FAILED",
          "No se pudo comprobar de forma confiable la apariencia despues de retirar identificadores duplicados sin uso."
        )
      );
    }
  }

  if (visualBaselineSvgText && requiresVisualVerification && errors.length === 0) {
    try {
      if (!(await hasEquivalentRaster(visualBaselineSvgText, root.outerHTML))) {
        errors.push(
          issue(
            "error",
            "ICON_SVG_STYLE_NORMALIZATION_MISMATCH",
            "Los estilos simples no conservaron exactamente la apariencia del SVG."
          )
        );
      }
    } catch {
      errors.push(
        issue(
          "error",
          "ICON_SVG_STYLE_NORMALIZATION_FAILED",
          "No se pudo comprobar de forma confiable la apariencia despues de materializar estilos."
        )
      );
    }
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
