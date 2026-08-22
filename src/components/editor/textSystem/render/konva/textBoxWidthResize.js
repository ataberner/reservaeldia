import {
  DEFAULT_TEXT_BOX_WIDTH,
} from "../../../../../domain/elements/insertions.js";

export const TEXT_BOX_WIDTH_RESIZE_ANCHOR = "middle-right";
export const MIN_TEXT_BOX_WIDTH = 20;
export const MAX_TEXT_BOX_WIDTH = 800;

export function resolveTextBoxWidthAnchorVisual({
  isMobile = false,
  padding = 0,
} = {}) {
  const width = isMobile ? 12 : 8;
  const height = isMobile ? 40 : 28;
  const safePadding = Number.isFinite(Number(padding)) ? Number(padding) : 0;

  return {
    width,
    height,
    offsetX: width / 2 - safePadding,
    offsetY: height / 2,
    cornerRadius: isMobile ? 4 : 3,
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeTextAlign(value) {
  const align = String(value || "").trim().toLowerCase();
  if (align === "center" || align === "right") return align;
  return "left";
}

function normalizeTextWrapMode(value) {
  return String(value || "").trim().toLowerCase() === "char" ? "char" : "word";
}

export function isTextBoxWidthResizeGesture({
  activeAnchor,
  selectedCount,
  object,
} = {}) {
  return Boolean(
    activeAnchor === TEXT_BOX_WIDTH_RESIZE_ANCHOR &&
      selectedCount === 1 &&
      object?.tipo === "texto"
  );
}

export function resolveTextBoxWidthResize({
  baseWidth,
  scaleX = 1,
  fontSize,
  align,
  textWrapMode,
  minWidth = MIN_TEXT_BOX_WIDTH,
  maxWidth = MAX_TEXT_BOX_WIDTH,
} = {}) {
  const numericBaseWidth = Number(baseWidth);
  const numericScaleX = Number(scaleX);
  const numericMinWidth = Number(minWidth);
  const numericMaxWidth = Number(maxWidth);
  const numericFontSize = Number(fontSize);

  if (
    !Number.isFinite(numericBaseWidth) ||
    numericBaseWidth <= 0 ||
    !Number.isFinite(numericScaleX) ||
    numericScaleX === 0 ||
    !Number.isFinite(numericMinWidth) ||
    !Number.isFinite(numericMaxWidth) ||
    numericMinWidth <= 0 ||
    numericMaxWidth < numericMinWidth
  ) {
    return null;
  }

  const width = clamp(
    Math.abs(numericBaseWidth * numericScaleX),
    numericMinWidth,
    numericMaxWidth
  );
  const normalizedAlign = normalizeTextAlign(align);
  const originOffsetX =
    normalizedAlign === "center"
      ? width / 2
      : normalizedAlign === "right"
        ? width
        : 0;

  return {
    width,
    fontSize:
      Number.isFinite(numericFontSize) && numericFontSize > 0
        ? numericFontSize
        : 24,
    __autoWidth: false,
    textWrapMode: normalizeTextWrapMode(textWrapMode),
    scaleX: 1,
    scaleY: 1,
    originOffsetX,
  };
}

export function resolveTextBoxCompatibilityUpgrade({
  object,
  liveWidth,
  fallbackWidth = DEFAULT_TEXT_BOX_WIDTH,
} = {}) {
  if (object?.tipo !== "texto") return null;

  const storedWidth = Number(object?.width);
  const hasStoredWidth = Number.isFinite(storedWidth) && storedWidth > 0;
  if (object.__autoWidth === false && hasStoredWidth) return null;

  const measuredWidth = Number(liveWidth);
  const hasLiveWidth = Number.isFinite(measuredWidth) && measuredWidth > 0;
  const numericFallbackWidth = Number(fallbackWidth);
  const widthCandidate = hasLiveWidth
    ? measuredWidth
    : hasStoredWidth
      ? storedWidth
      : numericFallbackWidth;
  const layout = resolveTextBoxWidthResize({
    baseWidth: widthCandidate,
    scaleX: 1,
    fontSize: object?.fontSize,
    align:
      object?.align ??
      object?.textAlign ??
      object?.alignment ??
      object?.alineacion,
    textWrapMode: object?.textWrapMode,
  });
  if (!layout) return null;

  return {
    width: layout.width,
    textWrapMode: layout.textWrapMode,
    originOffsetX: layout.originOffsetX,
    widthSource: hasLiveWidth
      ? "live-konva-node"
      : hasStoredWidth
        ? "stored-compatibility"
        : "default",
    patch: {
      width: layout.width,
      __autoWidth: false,
      textWrapMode: layout.textWrapMode,
    },
  };
}

export function buildTextBoxWidthCommitPatch({ object, transformAttrs } = {}) {
  if (object?.tipo !== "texto" || !transformAttrs) return null;

  const resize = resolveTextBoxWidthResize({
    baseWidth: transformAttrs.width,
    scaleX: 1,
    fontSize: object?.fontSize,
    align:
      object?.align ??
      object?.textAlign ??
      object?.alignment ??
      object?.alineacion,
    textWrapMode: transformAttrs.textWrapMode ?? object?.textWrapMode,
  });
  if (!resize) return null;

  const x = Number(transformAttrs.x);
  return {
    ...(Number.isFinite(x) ? { x } : {}),
    width: resize.width,
    fontSize: resize.fontSize,
    __autoWidth: resize.__autoWidth,
    textWrapMode: resize.textWrapMode,
    scaleX: resize.scaleX,
    scaleY: resize.scaleY,
  };
}
