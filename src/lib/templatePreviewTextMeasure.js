import { shouldPreserveTextCenterPosition } from "./textCenteringPolicy.js";

const DEFAULT_CONTAINER_WIDTH_PX = 800;
const DEFAULT_SECTION_MODE = "fijo";
const DEFAULT_SECTION_HEIGHT_PX = 500;

function normalizeText(value) {
  return String(value || "").trim();
}

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parsePixelValue(value) {
  const numeric = Number.parseFloat(String(value == null ? "" : value));
  return Number.isFinite(numeric) ? numeric : null;
}

function resolveAlign(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "center" || normalized === "right") return normalized;
  return "left";
}

function resolveTransformOrigin(align) {
  if (align === "center") return "top center";
  if (align === "right") return "top right";
  return "top left";
}

function getTextTransformMatrix(targetElement) {
  const computedStyle = window.getComputedStyle
    ? window.getComputedStyle(targetElement)
    : null;
  const rawTransform = String(
    (computedStyle && computedStyle.transform) ||
      targetElement?.style?.transform ||
      ""
  ).trim();

  if (!rawTransform || rawTransform === "none") {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }

  try {
    if (typeof DOMMatrix === "function") {
      const matrix = new DOMMatrix(rawTransform);
      return {
        a: matrix.a,
        b: matrix.b,
        c: matrix.c,
        d: matrix.d,
        e: matrix.e,
        f: matrix.f,
      };
    }
    if (typeof WebKitCSSMatrix === "function") {
      const matrix = new WebKitCSSMatrix(rawTransform);
      return {
        a: matrix.a,
        b: matrix.b,
        c: matrix.c,
        d: matrix.d,
        e: matrix.e,
        f: matrix.f,
      };
    }
  } catch {}

  const match = rawTransform.match(/^matrix\(([^)]+)\)$/i);
  if (!match) {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }

  const parts = match[1]
    .split(",")
    .map((entry) => Number.parseFloat(String(entry || "").trim()));

  if (parts.length < 6 || parts.some((value) => !Number.isFinite(value))) {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }

  return {
    a: parts[0],
    b: parts[1],
    c: parts[2],
    d: parts[3],
    e: parts[4],
    f: parts[5],
  };
}

function getTextBoxSize(targetElement) {
  if (!targetElement) return { width: null, height: null };

  let width = Number(
    targetElement.scrollWidth ||
      targetElement.offsetWidth ||
      targetElement.clientWidth ||
      0
  );
  let height = Number(
    targetElement.scrollHeight ||
      targetElement.offsetHeight ||
      targetElement.clientHeight ||
      0
  );

  if (
    (!Number.isFinite(width) || width <= 0) ||
    (!Number.isFinite(height) || height <= 0)
  ) {
    const rect = targetElement.getBoundingClientRect
      ? targetElement.getBoundingClientRect()
      : null;
    if (rect) {
      if (!Number.isFinite(width) || width <= 0) {
        width = Number(rect.width || 0);
      }
      if (!Number.isFinite(height) || height <= 0) {
        height = Number(rect.height || 0);
      }
    }
  }

  return {
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
  };
}

function getLocalElementPosition(targetElement) {
  if (!targetElement) return { left: null, top: null };

  const offsetLeft = Number(targetElement.offsetLeft);
  const offsetTop = Number(targetElement.offsetTop);
  if (Number.isFinite(offsetLeft) && Number.isFinite(offsetTop)) {
    return {
      left: offsetLeft,
      top: offsetTop,
    };
  }

  const inlineLeft = parsePixelValue(targetElement.style?.left);
  const inlineTop = parsePixelValue(targetElement.style?.top);
  if (Number.isFinite(inlineLeft) && Number.isFinite(inlineTop)) {
    return {
      left: inlineLeft,
      top: inlineTop,
    };
  }

  const computedStyle = window.getComputedStyle
    ? window.getComputedStyle(targetElement)
    : null;
  return {
    left: parsePixelValue(computedStyle?.left),
    top: parsePixelValue(computedStyle?.top),
  };
}

function getTextCenterOffset(matrix, width, height) {
  const halfWidth = Number(width) / 2;
  const halfHeight = Number(height) / 2;
  return {
    x: matrix.a * halfWidth + matrix.c * halfHeight + matrix.e,
    y: matrix.b * halfWidth + matrix.d * halfHeight + matrix.f,
  };
}

function captureTextElementCenter(targetElement) {
  if (!targetElement) return null;

  const position = getLocalElementPosition(targetElement);
  const leftPx = position.left;
  const topPx = position.top;
  const size = getTextBoxSize(targetElement);

  if (
    !Number.isFinite(leftPx) ||
    !Number.isFinite(topPx) ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height)
  ) {
    return null;
  }

  const matrix = getTextTransformMatrix(targetElement);
  const offset = getTextCenterOffset(matrix, size.width, size.height);

  return {
    centerX: leftPx + offset.x,
    centerY: topPx + offset.y,
  };
}

function createMeasurementStage({
  containerWidthPx = DEFAULT_CONTAINER_WIDTH_PX,
  sectionMode = DEFAULT_SECTION_MODE,
  objectTopPx = 0,
}) {
  if (typeof document === "undefined") return null;

  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.style.position = "fixed";
  root.style.left = "-20000px";
  root.style.top = "0";
  root.style.width = "0";
  root.style.height = "0";
  root.style.opacity = "0";
  root.style.pointerEvents = "none";
  root.style.overflow = "visible";
  root.style.zIndex = "-1";

  const stage = document.createElement("div");
  stage.style.position = "relative";
  stage.style.width = `${Math.max(1, Number(containerWidthPx) || DEFAULT_CONTAINER_WIDTH_PX)}px`;
  stage.style.height = `${Math.max(
    sectionMode === "pantalla" ? DEFAULT_SECTION_HEIGHT_PX : 1200,
    Math.ceil(Math.max(0, Number(objectTopPx) || 0)) + 600
  )}px`;
  stage.style.overflow = "visible";
  stage.style.padding = "0";
  stage.style.margin = "0";
  stage.style.boxSizing = "content-box";

  root.appendChild(stage);
  document.body.appendChild(root);

  return {
    root,
    stage,
  };
}

function removeMeasurementStage(stage) {
  if (!stage?.root?.parentNode) return;
  stage.root.parentNode.removeChild(stage.root);
}

function applyPreviewSemanticTextStyles(targetElement, objeto) {
  const align = resolveAlign(objeto?.align);
  const baseLineHeight = toFiniteNumber(objeto?.lineHeight, 1.2) || 1.2;
  const lineHeight = baseLineHeight * 0.92;
  const fontSize = Math.max(6, toFiniteNumber(objeto?.fontSize, 24) || 24);
  const rotation = toFiniteNumber(objeto?.rotation, 0) || 0;
  const scaleX = toFiniteNumber(objeto?.scaleX, 1) || 1;
  const scaleY = toFiniteNumber(objeto?.scaleY, 1) || 1;
  const x = toFiniteNumber(objeto?.x, 0) || 0;
  const y = toFiniteNumber(objeto?.y, 0) || 0;

  targetElement.style.position = "absolute";
  targetElement.style.left = `${x}px`;
  targetElement.style.top = `${y}px`;
  targetElement.style.padding = "0";
  targetElement.style.margin = "0";
  targetElement.style.display = "block";
  targetElement.style.whiteSpace = "pre-wrap";
  targetElement.style.boxSizing = "content-box";
  targetElement.style.textAlign = align;
  targetElement.style.lineHeight = String(lineHeight);
  targetElement.style.letterSpacing = `${
    toFiniteNumber(objeto?.letterSpacing, 0) || 0
  }px`;
  targetElement.style.fontSize = `${fontSize}px`;
  targetElement.style.fontFamily = String(objeto?.fontFamily || "sans-serif");
  targetElement.style.fontWeight = String(objeto?.fontWeight || "normal");
  targetElement.style.fontStyle = String(objeto?.fontStyle || "normal");
  targetElement.style.textDecoration = String(objeto?.textDecoration || "none");
  targetElement.style.transformOrigin = resolveTransformOrigin(align);
  targetElement.style.transform = `rotate(${rotation}deg) scale(${scaleX}, ${scaleY})`;
  targetElement.style.color = "transparent";
  targetElement.style.textShadow = "none";
  targetElement.style.border = "0";
  targetElement.style.outline = "0";
  targetElement.style.background = "transparent";

  const shouldUseFixedWidth = !shouldPreserveTextCenterPosition(objeto);
  const width = toFiniteNumber(objeto?.width, null);
  if (shouldUseFixedWidth && Number.isFinite(width) && width > 0) {
    targetElement.style.width = `${width}px`;
  } else {
    targetElement.style.removeProperty("width");
  }
}

export function measureTextPositionFromPreviewSemantics({
  objeto,
  nextText,
  containerWidthPx = DEFAULT_CONTAINER_WIDTH_PX,
  sectionMode = DEFAULT_SECTION_MODE,
} = {}) {
  const safeObject = objeto && typeof objeto === "object" ? objeto : null;
  if (!safeObject || typeof document === "undefined") {
    return {
      x: null,
      y: null,
      width: null,
      height: null,
      usedFallback: true,
    };
  }

  const stage = createMeasurementStage({
    containerWidthPx,
    sectionMode,
    objectTopPx: safeObject?.y,
  });
  if (!stage?.stage) {
    return {
      x: null,
      y: null,
      width: null,
      height: null,
      usedFallback: true,
    };
  }

  try {
    const node = document.createElement("div");
    applyPreviewSemanticTextStyles(node, safeObject);
    node.textContent = String(safeObject.texto ?? "");
    stage.stage.appendChild(node);

    const lockedCenter = captureTextElementCenter(node);
    node.textContent = String(nextText ?? "");

    if (
      !Number.isFinite(lockedCenter?.centerX) ||
      !Number.isFinite(lockedCenter?.centerY)
    ) {
      return {
        x: null,
        y: null,
        width: null,
        height: null,
        usedFallback: true,
      };
    }

    const size = getTextBoxSize(node);
    if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) {
      return {
        x: null,
        y: null,
        width: null,
        height: null,
        usedFallback: true,
      };
    }

    const matrix = getTextTransformMatrix(node);
    const offset = getTextCenterOffset(matrix, size.width, size.height);
    const nextLeftPx = Number(lockedCenter.centerX) - offset.x;
    const nextTopPx = Number(lockedCenter.centerY) - offset.y;

    return {
      x: Number.isFinite(nextLeftPx) ? nextLeftPx : null,
      y: Number.isFinite(nextTopPx) ? nextTopPx : null,
      width: size.width,
      height: size.height,
      usedFallback: false,
    };
  } catch {
    return {
      x: null,
      y: null,
      width: null,
      height: null,
      usedFallback: true,
    };
  } finally {
    removeMeasurementStage(stage);
  }
}
